import request from 'supertest';
import express, { Application } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { 
  enhancedAuthenticate, 
  generateEnhancedTokens,
  trackLoginAttempt,
  revokeAllUserSessions,
} from '../middleware/auth-enhanced';
import { 
  createApiKey, 
  validateApiKey, 
  rotateApiKey,
  ApiKeyType,
  ApiKeyPermission,
} from '../services/apiKeyManager';
import { 
  verifySignature, 
  generateRequestSignature,
  SignatureMethod,
} from '../middleware/signature';
import { 
  sqlInjectionProtection,
  sanitizeInput,
  QueryBuilder,
  validate,
} from '../middleware/sqlInjection';
import { applySecurityMiddleware, secureRoute } from '../middleware/security-integration';

// Mock Prisma
jest.mock('@prisma/client');

// Test app setup
function createTestApp(): Application {
  const app = express();
  app.use(express.json());
  applySecurityMiddleware(app);
  return app;
}

describe('Enhanced Authentication Tests', () => {
  let app: Application;
  let mockUser: any;

  beforeEach(() => {
    app = createTestApp();
    mockUser = {
      id: 'user-123',
      address: '0x1234567890abcdef1234567890abcdef12345678',
      role: 'user',
      isActive: true,
      isBanned: false,
    };

    // Setup test routes
    app.get('/protected', enhancedAuthenticate, (req, res) => {
      res.json({ message: 'Access granted', user: (req as any).user });
    });

    app.post('/login', async (req, res) => {
      const { email, password } = req.body;
      
      // Check login attempts
      const { allowed, remainingAttempts } = await trackLoginAttempt(email, false);
      if (!allowed) {
        return res.status(429).json({ 
          error: 'Too many login attempts',
          remainingAttempts,
        });
      }

      // Mock authentication
      if (email === 'test@example.com' && password === 'password123') {
        const tokens = await generateEnhancedTokens(mockUser, req);
        await trackLoginAttempt(email, true);
        res.json(tokens);
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    });
  });

  test('should generate valid tokens', async () => {
    const mockReq = { ip: '127.0.0.1', headers: {} } as any;
    const tokens = await generateEnhancedTokens(mockUser, mockReq);

    expect(tokens).toHaveProperty('accessToken');
    expect(tokens).toHaveProperty('refreshToken');
    expect(tokens).toHaveProperty('sessionId');
    
    // Verify token structure
    const decoded = jwt.decode(tokens.accessToken) as any;
    expect(decoded.userId).toBe(mockUser.id);
    expect(decoded.type).toBe('access');
  });

  test('should protect routes with authentication', async () => {
    const response = await request(app)
      .get('/protected')
      .expect(401);

    expect(response.body.error).toBe('No token provided');
  });

  test('should allow access with valid token', async () => {
    const mockReq = { ip: '127.0.0.1', headers: {} } as any;
    const { accessToken } = await generateEnhancedTokens(mockUser, mockReq);

    // Mock Prisma response
    (PrismaClient as any).mockImplementation(() => ({
      user: {
        findUnique: jest.fn().mockResolvedValue(mockUser),
      },
    }));

    const response = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.message).toBe('Access granted');
  });

  test('should track login attempts', async () => {
    // First 5 attempts should be allowed
    for (let i = 0; i < 5; i++) {
      const { allowed, remainingAttempts } = await trackLoginAttempt('test@example.com', false);
      expect(allowed).toBe(true);
      expect(remainingAttempts).toBe(4 - i);
    }

    // 6th attempt should be blocked
    const { allowed, remainingAttempts } = await trackLoginAttempt('test@example.com', false);
    expect(allowed).toBe(false);
    expect(remainingAttempts).toBe(0);
  });

  test('should reset attempts on successful login', async () => {
    // Make some failed attempts
    await trackLoginAttempt('test@example.com', false);
    await trackLoginAttempt('test@example.com', false);

    // Successful login should reset
    const { allowed, remainingAttempts } = await trackLoginAttempt('test@example.com', true);
    expect(allowed).toBe(true);
    expect(remainingAttempts).toBe(5);
  });
});

describe('API Key Management Tests', () => {
  let mockUser: any;

  beforeEach(() => {
    mockUser = {
      id: 'user-123',
      isActive: true,
      isBanned: false,
    };

    // Mock Prisma
    (PrismaClient as any).mockImplementation(() => ({
      apiKey: {
        create: jest.fn().mockImplementation((data) => ({
          id: 'key-123',
          ...data.data,
          createdAt: new Date(),
        })),
        findFirst: jest.fn().mockResolvedValue({
          id: 'key-123',
          key: 'hashed-key',
          type: ApiKeyType.PERSONAL,
          permissions: [ApiKeyPermission.READ],
          userId: mockUser.id,
          isActive: true,
          user: mockUser,
        }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    }));
  });

  test('should create API key', async () => {
    const result = await createApiKey({
      name: 'Test Key',
      type: ApiKeyType.PERSONAL,
      permissions: [ApiKeyPermission.READ, ApiKeyPermission.WRITE],
      userId: mockUser.id,
    });

    expect(result.key).toMatch(/^zkf_/);
    expect(result.keyData.name).toBe('Test Key');
    expect(result.keyData.type).toBe(ApiKeyType.PERSONAL);
  });

  test('should validate API key', async () => {
    const { key } = await createApiKey({
      name: 'Test Key',
      type: ApiKeyType.SERVICE,
      permissions: [ApiKeyPermission.READ],
      userId: mockUser.id,
    });

    const validation = await validateApiKey(key, [ApiKeyPermission.READ]);
    expect(validation.valid).toBe(true);
    expect(validation.keyData).toBeDefined();
  });

  test('should reject invalid permissions', async () => {
    const { key } = await createApiKey({
      name: 'Test Key',
      type: ApiKeyType.SERVICE,
      permissions: [ApiKeyPermission.READ],
      userId: mockUser.id,
    });

    const validation = await validateApiKey(key, [ApiKeyPermission.ADMIN]);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Insufficient permissions');
  });

  test('should rotate API key', async () => {
    const oldKeyId = 'key-123';
    const result = await rotateApiKey(oldKeyId, mockUser.id);

    expect(result.key).toMatch(/^zkf_/);
    expect(result.keyData.name).toContain('Rotated');
  });
});

describe('Request Signature Tests', () => {
  let app: Application;

  beforeEach(() => {
    app = createTestApp();
    
    app.post('/signed', verifySignature(SignatureMethod.HMAC_SHA256), (req, res) => {
      res.json({ message: 'Signature valid' });
    });
  });

  test('should generate valid signature', () => {
    const req = {
      method: 'POST',
      path: '/api/transfer',
      body: { amount: 100, to: '0xabc' },
    };

    const secret = 'test-secret';
    const { signature, timestamp, nonce } = generateRequestSignature(req, secret);

    expect(signature).toBeDefined();
    expect(timestamp).toBeDefined();
    expect(nonce).toBeDefined();
  });

  test('should reject request without signature', async () => {
    const response = await request(app)
      .post('/signed')
      .send({ test: 'data' })
      .expect(401);

    expect(response.body.error).toBe('Missing signature headers');
  });

  test('should reject expired signature', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    
    const response = await request(app)
      .post('/signed')
      .set('x-signature', 'fake-signature')
      .set('x-timestamp', oldTimestamp.toString())
      .set('x-nonce', 'test-nonce')
      .send({ test: 'data' })
      .expect(401);

    expect(response.body.error).toBe('Request timestamp out of range');
  });
});

describe('SQL Injection Protection Tests', () => {
  let app: Application;

  beforeEach(() => {
    app = createTestApp();
    
    app.use(sqlInjectionProtection());
    
    app.post('/search', (req, res) => {
      res.json({ query: req.body.query });
    });
  });

  test('should block SQL injection attempts', async () => {
    const maliciousQueries = [
      "'; DROP TABLE users; --",
      "1' OR '1'='1",
      "admin' --",
      "1; DELETE FROM products",
      "' UNION SELECT * FROM passwords --",
    ];

    for (const query of maliciousQueries) {
      const response = await request(app)
        .post('/search')
        .send({ query })
        .expect(400);

      expect(response.body.error).toBe('Invalid input detected');
      expect(response.body.type).toBe('SQL');
    }
  });

  test('should allow safe queries', async () => {
    const safeQueries = [
      'search term',
      'user@example.com',
      '12345',
      'product name with spaces',
    ];

    for (const query of safeQueries) {
      const response = await request(app)
        .post('/search')
        .send({ query })
        .expect(200);

      expect(response.body.query).toBe(query);
    }
  });

  test('should sanitize input', () => {
    const dangerous = "<script>alert('xss')</script>";
    const sanitized = sanitizeInput(dangerous);
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).toBe("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;");
  });

  test('should build safe parameterized queries', () => {
    const qb = new QueryBuilder();
    const { query, params } = qb
      .select(['id', 'name', 'email'])
      .from('users')
      .where('email', '=', 'test@example.com')
      .where('active', '=', true)
      .orderBy('created_at', 'DESC')
      .limit(10)
      .build();

    expect(query).toBe('SELECT id, name, email FROM users WHERE email = $1 AND active = $2 ORDER BY created_at DESC LIMIT 10');
    expect(params).toEqual(['test@example.com', true]);
  });

  test('should validate inputs', () => {
    expect(validate.isEmail('test@example.com')).toBe(true);
    expect(validate.isEmail('invalid-email')).toBe(false);
    
    expect(validate.isEthereumAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(true);
    expect(validate.isEthereumAddress('invalid-address')).toBe(false);
    
    expect(validate.isPositiveInteger(42)).toBe(true);
    expect(validate.isPositiveInteger(-1)).toBe(false);
    expect(validate.isPositiveInteger('not a number')).toBe(false);
    
    expect(validate.isSafeString('Hello World')).toBe(true);
    expect(validate.isSafeString("'; DROP TABLE users; --")).toBe(false);
  });
});

describe('Security Integration Tests', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    applySecurityMiddleware(app, {
      enableHelmet: true,
      enableCors: true,
      enableRateLimit: true,
      enableSqlProtection: true,
    });

    // Test routes with different security levels
    app.get('/public', (req, res) => {
      res.json({ message: 'Public endpoint' });
    });

    app.get('/api/data', 
      ...secureRoute({ requireAuth: true, rateLimit: 'api' }),
      (req, res) => {
        res.json({ message: 'Protected API endpoint' });
      }
    );

    app.post('/api/sensitive',
      ...secureRoute({ 
        requireAuth: true, 
        requireSignature: true,
        rateLimit: 'strict',
      }),
      (req, res) => {
        res.json({ message: 'Highly secured endpoint' });
      }
    );
  });

  test('should apply security headers', async () => {
    const response = await request(app)
      .get('/public')
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['strict-transport-security']).toBeDefined();
  });

  test('should handle CORS properly', async () => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
    
    const response = await request(app)
      .get('/public')
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  test('should enforce rate limits', async () => {
    // Make requests up to the limit
    for (let i = 0; i < 100; i++) {
      await request(app).get('/public').expect(200);
    }

    // Next request should be rate limited
    const response = await request(app)
      .get('/public')
      .expect(429);

    expect(response.body.error).toContain('Too many requests');
  });

  test('should protect against common attacks', async () => {
    // XSS attempt
    const xssResponse = await request(app)
      .get('/public')
      .query({ search: '<script>alert("xss")</script>' })
      .expect(400);

    expect(xssResponse.body.type).toBe('XSS');

    // Path traversal attempt
    const pathResponse = await request(app)
      .get('/public')
      .query({ file: '../../../etc/passwd' })
      .expect(400);

    expect(pathResponse.body.type).toBe('PathTraversal');
  });
});

// Cleanup
afterAll(async () => {
  // Clean up any resources
});