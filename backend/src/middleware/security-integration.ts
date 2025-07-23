import { Application } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import cors from 'cors';
import { enhancedAuthenticate } from './auth-enhanced';
import { verifySignature, SignatureMethod } from './signature';
import { sqlInjectionProtection } from './sqlInjection';
import { logger } from '../utils/logger';

// Security headers configuration
const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'wss:', 'https:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
};

// CORS configuration
const corsConfig = {
  origin: (origin: string | undefined, callback: any) => {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is allowed
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Api-Key',
    'X-Signature',
    'X-Timestamp',
    'X-Nonce',
    'X-Device-Id',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-Id',
  ],
  maxAge: 86400, // 24 hours
};

// Rate limiting configurations
const createRateLimiter = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        userAgent: req.headers['user-agent'],
      });
      res.status(429).json({
        error: message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
  });
};

// Different rate limiters for different endpoints
export const rateLimiters = {
  general: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    100, // limit each IP to 100 requests per windowMs
    'Too many requests from this IP'
  ),
  auth: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    5, // limit each IP to 5 requests per windowMs
    'Too many authentication attempts'
  ),
  api: createRateLimiter(
    1 * 60 * 1000, // 1 minute
    60, // limit each IP to 60 requests per minute
    'API rate limit exceeded'
  ),
  strict: createRateLimiter(
    1 * 60 * 1000, // 1 minute
    10, // limit each IP to 10 requests per minute
    'Strict rate limit exceeded'
  ),
};

// Security middleware stack
export interface SecurityOptions {
  enableHelmet?: boolean;
  enableCors?: boolean;
  enableRateLimit?: boolean;
  enableSqlProtection?: boolean;
  enableSignatureVerification?: boolean;
  signatureMethod?: SignatureMethod;
  customMiddleware?: any[];
}

/**
 * Apply comprehensive security middleware to Express app
 */
export function applySecurityMiddleware(
  app: Application,
  options: SecurityOptions = {}
) {
  const {
    enableHelmet = true,
    enableCors = true,
    enableRateLimit = true,
    enableSqlProtection = true,
    enableSignatureVerification = false,
    signatureMethod = SignatureMethod.HMAC_SHA256,
    customMiddleware = [],
  } = options;

  // 1. Helmet for security headers
  if (enableHelmet) {
    app.use(helmet(helmetConfig));
    logger.info('Helmet security headers enabled');
  }

  // 2. CORS
  if (enableCors) {
    app.use(cors(corsConfig));
    logger.info('CORS enabled');
  }

  // 3. General rate limiting
  if (enableRateLimit) {
    app.use(rateLimiters.general);
    logger.info('Rate limiting enabled');
  }

  // 4. SQL injection protection
  if (enableSqlProtection) {
    app.use(sqlInjectionProtection({
      logAttempts: true,
      blockOnDetection: true,
    }));
    logger.info('SQL injection protection enabled');
  }

  // 5. NoSQL injection protection (MongoDB)
  app.use(mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
      logger.warn('NoSQL injection attempt blocked', {
        ip: req.ip,
        path: req.path,
        key,
      });
    },
  }));

  // 6. HTTP Parameter Pollution protection
  app.use(hpp({
    whitelist: ['sort', 'filter', 'page', 'limit'], // Allow these params to have arrays
  }));

  // 7. Request size limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 8. Custom middleware
  customMiddleware.forEach((middleware) => {
    app.use(middleware);
  });

  logger.info('Security middleware applied successfully');
}

/**
 * Apply authentication to specific routes
 */
export function secureRoute(
  options: {
    requireAuth?: boolean;
    requireSignature?: boolean;
    signatureMethod?: SignatureMethod;
    rateLimit?: 'general' | 'api' | 'strict' | 'auth';
    permissions?: string[];
  } = {}
) {
  const middlewares: any[] = [];

  // Rate limiting
  if (options.rateLimit && options.rateLimit !== 'general') {
    middlewares.push(rateLimiters[options.rateLimit]);
  }

  // Authentication
  if (options.requireAuth) {
    middlewares.push(enhancedAuthenticate);
  }

  // Signature verification
  if (options.requireSignature) {
    middlewares.push(verifySignature(options.signatureMethod));
  }

  return middlewares;
}

/**
 * Error handler for security middleware
 */
export function securityErrorHandler(err: any, req: any, res: any, next: any) {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
      message: err.message,
    });
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS policy violation',
      code: 'CORS_ERROR',
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Request entity too large',
      code: 'PAYLOAD_TOO_LARGE',
    });
  }

  // Log unhandled security errors
  logger.error('Security middleware error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  next(err);
}

/**
 * Security monitoring middleware
 */
export function securityMonitoring(req: any, res: any, next: any) {
  const startTime = Date.now();
  
  // Log security-relevant request details
  const securityLog = {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    method: req.method,
    path: req.path,
    userAgent: req.headers['user-agent'],
    userId: req.user?.id,
    hasAuth: !!req.headers.authorization,
    hasApiKey: !!req.headers['x-api-key'],
    hasSignature: !!req.headers['x-signature'],
  };

  // Response logging
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Log suspicious activities
    if (res.statusCode === 401 || res.statusCode === 403) {
      logger.warn('Authentication/Authorization failure', {
        ...securityLog,
        statusCode: res.statusCode,
        duration,
      });
    }

    if (res.statusCode === 429) {
      logger.warn('Rate limit hit', {
        ...securityLog,
        statusCode: res.statusCode,
        duration,
      });
    }

    // Log slow requests (potential DoS)
    if (duration > 5000) {
      logger.warn('Slow request detected', {
        ...securityLog,
        duration,
        statusCode: res.statusCode,
      });
    }
  });

  next();
}

export default {
  applySecurityMiddleware,
  secureRoute,
  securityErrorHandler,
  securityMonitoring,
  rateLimiters,
};