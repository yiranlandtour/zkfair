import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { 
  sanitizeInput, 
  preventSQLInjection, 
  securityHeaders,
  verifySignature,
  IPFilter,
  requestSizeLimit,
  apiVersion
} from '../middleware/security';
import {
  authenticate,
  authorize,
  generateTokens,
  verifyToken
} from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';
import crypto from 'crypto';

// Mock Express request/response
const mockRequest = (options: any = {}): Partial<Request> => ({
  headers: {},
  body: {},
  query: {},
  params: {},
  ip: '127.0.0.1',
  ...options,
});

const mockResponse = (): Partial<Response> => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext: NextFunction = jest.fn();

describe('Security Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sanitizeInput', () => {
    it('should sanitize query parameters', () => {
      const req = mockRequest({
        query: {
          search: '<script>alert("xss")</script>',
          name: '  John Doe  ',
        },
      });
      const res = mockResponse();

      sanitizeInput(req as Request, res as Response, mockNext);

      expect(req.query.search).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
      expect(req.query.name).toBe('John Doe');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should sanitize body data', () => {
      const req = mockRequest({
        body: {
          comment: '<img src=x onerror=alert(1)>',
          nested: {
            value: 'test\0null',
          },
        },
      });
      const res = mockResponse();

      sanitizeInput(req as Request, res as Response, mockNext);

      expect(req.body.comment).toBe('&lt;img src=x onerror=alert(1)&gt;');
      expect(req.body.nested.value).toBe('testnull');
    });
  });

  describe('preventSQLInjection', () => {
    it('should block SQL injection attempts', () => {
      const req = mockRequest({
        query: {
          id: "1' OR '1'='1",
        },
      });
      const res = mockResponse();

      preventSQLInjection(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Potential SQL injection detected',
        code: 'SQL_INJECTION_ATTEMPT',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow clean input', () => {
      const req = mockRequest({
        query: { id: '123' },
        body: { name: 'John Doe' },
      });
      const res = mockResponse();

      preventSQLInjection(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('securityHeaders', () => {
    it('should set security headers', () => {
      const req = mockRequest();
      const res = mockResponse();

      securityHeaders()(req as Request, res as Response, mockNext);

      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set HSTS header for secure requests', () => {
      const req = mockRequest({ secure: true });
      const res = mockResponse();

      securityHeaders()(req as Request, res as Response, mockNext);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    });
  });

  describe('verifySignature', () => {
    const secret = 'test-secret';
    const middleware = verifySignature(secret);

    it('should verify valid signature', () => {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomBytes(16).toString('hex');
      const method = 'POST';
      const url = '/api/test';
      const body = { data: 'test' };
      
      const payload = `${timestamp}.${nonce}.${method}.${url}.${JSON.stringify(body)}`;
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const req = mockRequest({
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp,
          'x-nonce': nonce,
        },
        method,
        originalUrl: url,
        body,
      });
      const res = mockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid signature', () => {
      const req = mockRequest({
        headers: {
          'x-signature': 'invalid',
          'x-timestamp': Date.now().toString(),
          'x-nonce': 'test',
        },
        method: 'POST',
        originalUrl: '/api/test',
        body: {},
      });
      const res = mockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid signature',
        code: 'INVALID_SIGNATURE',
      });
    });

    it('should reject expired timestamp', () => {
      const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago
      
      const req = mockRequest({
        headers: {
          'x-signature': 'test',
          'x-timestamp': oldTimestamp,
          'x-nonce': 'test',
        },
      });
      const res = mockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid or expired timestamp',
        code: 'INVALID_TIMESTAMP',
      });
    });
  });

  describe('IPFilter', () => {
    let ipFilter: IPFilter;

    beforeEach(() => {
      ipFilter = new IPFilter();
    });

    it('should block blacklisted IPs', () => {
      ipFilter.addToBlacklist('192.168.1.100');
      
      const req = mockRequest({ ip: '192.168.1.100' });
      const res = mockResponse();

      ipFilter.middleware()(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'IP blacklisted',
        code: 'IP_BLACKLISTED',
      });
    });

    it('should allow whitelisted IPs only in whitelist mode', () => {
      ipFilter.addToWhitelist('192.168.1.100');
      
      const req1 = mockRequest({ ip: '192.168.1.100' });
      const req2 = mockRequest({ ip: '192.168.1.200' });
      const res1 = mockResponse();
      const res2 = mockResponse();

      const middleware = ipFilter.middleware({ mode: 'whitelist' });

      middleware(req1 as Request, res1 as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();

      jest.clearAllMocks();

      middleware(req2 as Request, res2 as Response, mockNext);
      expect(res2.status).toHaveBeenCalledWith(403);
    });
  });

  describe('apiVersion', () => {
    it('should accept supported versions', () => {
      const req = mockRequest({
        headers: { 'api-version': 'v1' },
      });
      const res = mockResponse();

      apiVersion(['v1', 'v2'])(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((req as any).apiVersion).toBe('v1');
    });

    it('should reject unsupported versions', () => {
      const req = mockRequest({
        headers: { 'api-version': 'v3' },
      });
      const res = mockResponse();

      apiVersion(['v1', 'v2'])(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unsupported API version',
        code: 'UNSUPPORTED_VERSION',
        supported: ['v1', 'v2'],
        requested: 'v3',
      });
    });

    it('should default to v1', () => {
      const req = mockRequest({ headers: {} });
      const res = mockResponse();

      apiVersion(['v1', 'v2'])(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((req as any).apiVersion).toBe('v1');
    });
  });
});

describe('Auth Middleware', () => {
  describe('JWT functions', () => {
    it('should generate valid tokens', () => {
      const user = {
        id: '123',
        address: '0x123',
        role: 'user',
      };

      const { accessToken, refreshToken } = generateTokens(user);

      expect(accessToken).toBeTruthy();
      expect(refreshToken).toBeTruthy();

      const decodedAccess = verifyToken(accessToken);
      const decodedRefresh = verifyToken(refreshToken);

      expect(decodedAccess.userId).toBe(user.id);
      expect(decodedAccess.type).toBe('access');
      expect(decodedRefresh.type).toBe('refresh');
    });

    it('should throw on invalid token', () => {
      expect(() => verifyToken('invalid')).toThrow('Invalid token');
    });
  });

  describe('authorize middleware', () => {
    it('should allow authorized roles', () => {
      const req = mockRequest({
        user: { id: '1', address: '0x123', role: 'admin' },
      });
      const res = mockResponse();

      authorize('admin', 'user')(req as any, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject unauthorized roles', () => {
      const req = mockRequest({
        user: { id: '1', address: '0x123', role: 'user' },
      });
      const res = mockResponse();

      authorize('admin')(req as any, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required: ['admin'],
        current: 'user',
      });
    });

    it('should require authentication', () => {
      const req = mockRequest({});
      const res = mockResponse();

      authorize('admin')(req as any, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    });
  });
});

describe('Validation Middleware', () => {
  it('should validate request successfully', async () => {
    const schema = z.object({
      body: z.object({
        name: z.string(),
        age: z.number().min(0),
      }),
    });

    const req = mockRequest({
      body: { name: 'John', age: 30 },
    });
    const res = mockResponse();

    await validateRequest(schema)(req as Request, res as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should reject invalid request', async () => {
    const schema = z.object({
      body: z.object({
        email: z.string().email(),
      }),
    });

    const req = mockRequest({
      body: { email: 'invalid' },
    });
    const res = mockResponse();

    await validateRequest(schema)(req as Request, res as Response, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: [
        {
          field: 'body.email',
          message: 'Invalid email',
        },
      ],
    });
  });
});