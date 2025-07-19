import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extended Express Request type with user
export interface AuthRequest extends Request {
  user?: {
    id: string;
    address: string;
    role: string;
  };
}

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Token types
interface TokenPayload {
  userId: string;
  address: string;
  role: string;
  type: 'access' | 'refresh';
}

// Generate tokens
export function generateTokens(user: { id: string; address: string; role?: string }) {
  const payload: Omit<TokenPayload, 'type'> = {
    userId: user.id,
    address: user.address,
    role: user.role || 'user',
  };

  const accessToken = jwt.sign(
    { ...payload, type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  const refreshToken = jwt.sign(
    { ...payload, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );

  return { accessToken, refreshToken };
}

// Verify token
export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// Authentication middleware
export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No token provided',
        code: 'NO_TOKEN',
      });
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = verifyToken(token);

    // Check token type
    if (decoded.type !== 'access') {
      return res.status(401).json({
        error: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE',
      });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        address: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'User not found or inactive',
        code: 'USER_NOT_FOUND',
      });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      address: user.address,
      role: user.role || 'user',
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    }

    return res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_ERROR',
    });
  }
}

// Optional authentication middleware (doesn't fail if no token)
export async function optionalAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (decoded.type === 'access') {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          address: true,
          role: true,
          isActive: true,
        },
      });

      if (user && user.isActive) {
        req.user = {
          id: user.id,
          address: user.address,
          role: user.role || 'user',
        };
      }
    }
  } catch (error) {
    // Ignore errors in optional auth
  }

  next();
}

// Role-based authorization middleware
export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required: roles,
        current: req.user.role,
      });
    }

    next();
  };
}

// API key authentication for services
export async function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
        code: 'NO_API_KEY',
      });
    }

    // Verify API key
    const service = await prisma.apiKey.findFirst({
      where: {
        key: apiKey,
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            address: true,
            role: true,
          },
        },
      },
    });

    if (!service) {
      return res.status(401).json({
        error: 'Invalid API key',
        code: 'INVALID_API_KEY',
      });
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: service.id },
      data: { lastUsedAt: new Date() },
    });

    // Attach user to request
    (req as AuthRequest).user = {
      id: service.user.id,
      address: service.user.address,
      role: service.user.role || 'service',
    };

    next();
  } catch (error) {
    return res.status(500).json({
      error: 'API key authentication error',
      code: 'API_AUTH_ERROR',
    });
  }
}

// Rate limiting per user
export async function userRateLimit(
  limit: number = 100,
  window: number = 60000 // 1 minute
) {
  const requests = new Map<string, { count: number; resetAt: number }>();

  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next();
    }

    const key = req.user.id;
    const now = Date.now();
    const userLimit = requests.get(key);

    if (!userLimit || userLimit.resetAt < now) {
      requests.set(key, {
        count: 1,
        resetAt: now + window,
      });
      return next();
    }

    if (userLimit.count >= limit) {
      const retryAfter = Math.ceil((userLimit.resetAt - now) / 1000);
      res.setHeader('X-RateLimit-Limit', limit.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', userLimit.resetAt.toString());
      res.setHeader('Retry-After', retryAfter.toString());

      return res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter,
      });
    }

    userLimit.count++;
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', (limit - userLimit.count).toString());
    res.setHeader('X-RateLimit-Reset', userLimit.resetAt.toString());

    next();
  };
}