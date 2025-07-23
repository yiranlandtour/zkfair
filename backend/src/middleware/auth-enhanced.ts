import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Enhanced JWT configuration
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + '_refresh';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const JWT_ISSUER = process.env.JWT_ISSUER || 'zkfair-l2';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'zkfair-api';

// Security constants
const TOKEN_BLACKLIST_TTL = 86400 * 7; // 7 days
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_ATTEMPT_WINDOW = 900; // 15 minutes
const SESSION_TIMEOUT = 3600; // 1 hour

// Enhanced token payload
interface EnhancedTokenPayload {
  userId: string;
  address: string;
  role: string;
  type: 'access' | 'refresh';
  sessionId: string;
  deviceId?: string;
  ipAddress?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

// Session data
interface SessionData {
  userId: string;
  address: string;
  role: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: number;
  lastActivity: number;
}

export interface EnhancedAuthRequest extends Request {
  user?: {
    id: string;
    address: string;
    role: string;
    sessionId: string;
  };
  session?: SessionData;
}

/**
 * Enhanced token generation with session management
 */
export async function generateEnhancedTokens(
  user: { id: string; address: string; role?: string },
  req: Request
): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
  const sessionId = crypto.randomUUID();
  const deviceId = req.headers['x-device-id'] as string;
  const ipAddress = req.ip || req.socket.remoteAddress;

  const basePayload = {
    userId: user.id,
    address: user.address,
    role: user.role || 'user',
    sessionId,
    deviceId,
    ipAddress,
  };

  // Create session
  const sessionData: SessionData = {
    ...basePayload,
    userAgent: req.headers['user-agent'],
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };

  await redis.setex(
    `session:${sessionId}`,
    SESSION_TIMEOUT,
    JSON.stringify(sessionData)
  );

  // Generate tokens
  const accessToken = jwt.sign(
    { ...basePayload, type: 'access' },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );

  const refreshToken = jwt.sign(
    { ...basePayload, type: 'refresh' },
    JWT_REFRESH_SECRET,
    {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );

  // Store refresh token
  await redis.setex(
    `refresh:${user.id}:${sessionId}`,
    86400 * 7, // 7 days
    refreshToken
  );

  logger.info('Enhanced tokens generated', {
    userId: user.id,
    sessionId,
    ipAddress,
    deviceId,
  });

  return { accessToken, refreshToken, sessionId };
}

/**
 * Enhanced token verification with blacklist check
 */
export async function verifyEnhancedToken(
  token: string,
  type: 'access' | 'refresh' = 'access'
): Promise<EnhancedTokenPayload> {
  // Check if token is blacklisted
  const isBlacklisted = await redis.get(`blacklist:${token}`);
  if (isBlacklisted) {
    throw new Error('Token is blacklisted');
  }

  try {
    const secret = type === 'access' ? JWT_SECRET : JWT_REFRESH_SECRET;
    const decoded = jwt.verify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as EnhancedTokenPayload;

    if (decoded.type !== type) {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw error;
  }
}

/**
 * Enhanced authentication middleware with session validation
 */
export async function enhancedAuthenticate(
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No token provided',
        code: 'NO_TOKEN',
      });
    }

    const token = authHeader.substring(7);
    const decoded = await verifyEnhancedToken(token, 'access');

    // Validate session
    const sessionKey = `session:${decoded.sessionId}`;
    const sessionData = await redis.get(sessionKey);
    
    if (!sessionData) {
      return res.status(401).json({
        error: 'Session expired',
        code: 'SESSION_EXPIRED',
      });
    }

    const session: SessionData = JSON.parse(sessionData);

    // Validate IP address (optional strict mode)
    if (process.env.STRICT_IP_VALIDATION === 'true') {
      const currentIp = req.ip || req.socket.remoteAddress;
      if (session.ipAddress !== currentIp) {
        logger.warn('IP address mismatch', {
          sessionIp: session.ipAddress,
          currentIp,
          userId: decoded.userId,
        });
        
        return res.status(401).json({
          error: 'Session invalid',
          code: 'SESSION_INVALID',
        });
      }
    }

    // Update session activity
    session.lastActivity = Date.now();
    await redis.setex(sessionKey, SESSION_TIMEOUT, JSON.stringify(session));

    // Check if user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        address: true,
        role: true,
        isActive: true,
        isBanned: true,
      },
    });

    if (!user || !user.isActive || user.isBanned) {
      return res.status(401).json({
        error: 'User not found or inactive',
        code: 'USER_INACTIVE',
      });
    }

    // Attach user and session to request
    req.user = {
      id: user.id,
      address: user.address,
      role: user.role || 'user',
      sessionId: decoded.sessionId,
    };
    req.session = session;

    next();
  } catch (error: any) {
    logger.error('Authentication error', { error: error.message });

    if (error.message === 'Token expired') {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (error.message === 'Token is blacklisted') {
      return res.status(401).json({
        error: 'Token revoked',
        code: 'TOKEN_REVOKED',
      });
    }

    return res.status(401).json({
      error: 'Authentication failed',
      code: 'AUTH_FAILED',
    });
  }
}

/**
 * Refresh token endpoint handler
 */
export async function refreshTokenHandler(
  req: Request,
  res: Response
) {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        error: 'Refresh token required',
        code: 'NO_REFRESH_TOKEN',
      });
    }

    const decoded = await verifyEnhancedToken(refreshToken, 'refresh');

    // Verify refresh token in Redis
    const storedToken = await redis.get(`refresh:${decoded.userId}:${decoded.sessionId}`);
    if (storedToken !== refreshToken) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    // Get user
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
        code: 'USER_INACTIVE',
      });
    }

    // Generate new tokens
    const tokens = await generateEnhancedTokens(user, req);

    // Blacklist old refresh token
    await redis.setex(
      `blacklist:${refreshToken}`,
      TOKEN_BLACKLIST_TTL,
      '1'
    );

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      sessionId: tokens.sessionId,
    });
  } catch (error: any) {
    logger.error('Refresh token error', { error: error.message });
    
    res.status(401).json({
      error: 'Failed to refresh token',
      code: 'REFRESH_FAILED',
    });
  }
}

/**
 * Logout handler with token blacklisting
 */
export async function logoutHandler(
  req: EnhancedAuthRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Not authenticated',
        code: 'NOT_AUTHENTICATED',
      });
    }

    // Get token from header
    const authHeader = req.headers.authorization;
    const token = authHeader?.substring(7);

    if (token) {
      // Blacklist access token
      const decoded = jwt.decode(token) as EnhancedTokenPayload;
      const ttl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : TOKEN_BLACKLIST_TTL;
      
      if (ttl > 0) {
        await redis.setex(`blacklist:${token}`, ttl, '1');
      }
    }

    // Delete session
    await redis.del(`session:${req.user.sessionId}`);

    // Delete refresh token
    await redis.del(`refresh:${req.user.id}:${req.user.sessionId}`);

    logger.info('User logged out', {
      userId: req.user.id,
      sessionId: req.user.sessionId,
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error', error);
    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_FAILED',
    });
  }
}

/**
 * Rate limiting with login attempt tracking
 */
export async function trackLoginAttempt(
  identifier: string,
  success: boolean
): Promise<{ allowed: boolean; remainingAttempts: number }> {
  const key = `login_attempts:${identifier}`;
  
  if (success) {
    await redis.del(key);
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };
  }

  const attempts = await redis.incr(key);
  
  if (attempts === 1) {
    await redis.expire(key, LOGIN_ATTEMPT_WINDOW);
  }

  const allowed = attempts <= MAX_LOGIN_ATTEMPTS;
  const remainingAttempts = Math.max(0, MAX_LOGIN_ATTEMPTS - attempts);

  if (!allowed) {
    logger.warn('Max login attempts exceeded', { identifier, attempts });
  }

  return { allowed, remainingAttempts };
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId: string): Promise<SessionData[]> {
  const pattern = `session:*`;
  const keys = await redis.keys(pattern);
  const sessions: SessionData[] = [];

  for (const key of keys) {
    const sessionData = await redis.get(key);
    if (sessionData) {
      const session: SessionData = JSON.parse(sessionData);
      if (session.userId === userId) {
        sessions.push(session);
      }
    }
  }

  return sessions;
}

/**
 * Revoke all sessions for a user
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const sessions = await getUserSessions(userId);
  
  for (const session of sessions) {
    const sessionId = session.sessionId || '';
    await redis.del(`session:${sessionId}`);
    await redis.del(`refresh:${userId}:${sessionId}`);
  }

  logger.info('All user sessions revoked', { userId, count: sessions.length });
}

export default {
  enhancedAuthenticate,
  generateEnhancedTokens,
  verifyEnhancedToken,
  refreshTokenHandler,
  logoutHandler,
  trackLoginAttempt,
  getUserSessions,
  revokeAllUserSessions,
};