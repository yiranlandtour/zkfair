import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';

// Request signature validation
const SIGNATURE_HEADER = 'x-signature';
const TIMESTAMP_HEADER = 'x-timestamp';
const NONCE_HEADER = 'x-nonce';
const SIGNATURE_WINDOW = 5 * 60 * 1000; // 5 minutes

// Store used nonces to prevent replay attacks
const usedNonces = new Map<string, number>();

// Clean up old nonces every hour
setInterval(() => {
  const now = Date.now();
  for (const [nonce, timestamp] of usedNonces.entries()) {
    if (now - timestamp > SIGNATURE_WINDOW) {
      usedNonces.delete(nonce);
    }
  }
}, 60 * 60 * 1000);

// Verify request signature
export function verifySignature(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers[SIGNATURE_HEADER] as string;
    const timestamp = req.headers[TIMESTAMP_HEADER] as string;
    const nonce = req.headers[NONCE_HEADER] as string;

    if (!signature || !timestamp || !nonce) {
      return res.status(401).json({
        error: 'Missing signature headers',
        code: 'MISSING_SIGNATURE',
      });
    }

    // Check timestamp
    const requestTime = parseInt(timestamp, 10);
    const now = Date.now();
    if (isNaN(requestTime) || Math.abs(now - requestTime) > SIGNATURE_WINDOW) {
      return res.status(401).json({
        error: 'Invalid or expired timestamp',
        code: 'INVALID_TIMESTAMP',
      });
    }

    // Check nonce
    if (usedNonces.has(nonce)) {
      return res.status(401).json({
        error: 'Nonce already used',
        code: 'NONCE_REUSE',
      });
    }

    // Calculate expected signature
    const payload = `${timestamp}.${nonce}.${req.method}.${req.originalUrl}.${JSON.stringify(req.body)}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Verify signature
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return res.status(401).json({
        error: 'Invalid signature',
        code: 'INVALID_SIGNATURE',
      });
    }

    // Store nonce
    usedNonces.set(nonce, now);

    next();
  };
}

// Input sanitization
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  // Sanitize query parameters
  if (req.query) {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeString(req.query[key] as string);
      }
    }
  }

  // Sanitize body (if JSON)
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  next();
}

function sanitizeString(str: string): string {
  // Remove null bytes
  str = str.replace(/\0/g, '');
  
  // Trim whitespace
  str = str.trim();
  
  // Escape HTML entities
  str = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
  
  return str;
}

function sanitizeObject(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const sanitizedKey = sanitizeString(key);
        sanitized[sanitizedKey] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  return obj;
}

// SQL injection prevention (for raw queries)
export function preventSQLInjection(req: Request, res: Response, next: NextFunction) {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b)/i,
    /(--|\/\*|\*\/|;|'|")/,
    /(\bOR\b\s*\d+\s*=\s*\d+)/i,
    /(\bAND\b\s*\d+\s*=\s*\d+)/i,
  ];

  const checkValue = (value: any): boolean => {
    if (typeof value === 'string') {
      return sqlPatterns.some(pattern => pattern.test(value));
    }
    return false;
  };

  // Check query parameters
  for (const key in req.query) {
    if (checkValue(req.query[key])) {
      return res.status(400).json({
        error: 'Potential SQL injection detected',
        code: 'SQL_INJECTION_ATTEMPT',
      });
    }
  }

  // Check body
  const checkObject = (obj: any): boolean => {
    if (Array.isArray(obj)) {
      return obj.some(checkObject);
    }
    
    if (obj !== null && typeof obj === 'object') {
      return Object.values(obj).some(checkObject);
    }
    
    return checkValue(obj);
  };

  if (req.body && checkObject(req.body)) {
    return res.status(400).json({
      error: 'Potential SQL injection detected',
      code: 'SQL_INJECTION_ATTEMPT',
    });
  }

  next();
}

// IP whitelist/blacklist
export class IPFilter {
  private whitelist: Set<string>;
  private blacklist: Set<string>;

  constructor() {
    this.whitelist = new Set();
    this.blacklist = new Set();
  }

  addToWhitelist(ip: string) {
    this.whitelist.add(ip);
  }

  addToBlacklist(ip: string) {
    this.blacklist.add(ip);
  }

  removeFromWhitelist(ip: string) {
    this.whitelist.delete(ip);
  }

  removeFromBlacklist(ip: string) {
    this.blacklist.delete(ip);
  }

  middleware(options: { mode: 'whitelist' | 'blacklist' } = { mode: 'blacklist' }) {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = req.ip || req.socket.remoteAddress || '';

      if (options.mode === 'whitelist') {
        if (!this.whitelist.has(ip)) {
          return res.status(403).json({
            error: 'IP not whitelisted',
            code: 'IP_NOT_WHITELISTED',
          });
        }
      } else {
        if (this.blacklist.has(ip)) {
          return res.status(403).json({
            error: 'IP blacklisted',
            code: 'IP_BLACKLISTED',
          });
        }
      }

      next();
    };
  }
}

// Content Security Policy
export function contentSecurityPolicy() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self'; " +
      "connect-src 'self' wss: https:; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self';"
    );
    next();
  };
}

// Additional security headers
export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Enable XSS filter
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions policy
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), payment=()'
    );
    
    // Strict Transport Security (HSTS)
    if (req.secure) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    }
    
    next();
  };
}

// Request size limits
export function requestSizeLimit(maxSize: number = 10 * 1024 * 1024) { // 10MB default
  return (req: Request, res: Response, next: NextFunction) => {
    let size = 0;
    
    req.on('data', (chunk) => {
      size += chunk.length;
      
      if (size > maxSize) {
        res.status(413).json({
          error: 'Request entity too large',
          code: 'PAYLOAD_TOO_LARGE',
          maxSize,
        });
        req.connection.destroy();
      }
    });
    
    next();
  };
}

// API versioning
export function apiVersion(supportedVersions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const version = req.headers['api-version'] as string || 'v1';
    
    if (!supportedVersions.includes(version)) {
      return res.status(400).json({
        error: 'Unsupported API version',
        code: 'UNSUPPORTED_VERSION',
        supported: supportedVersions,
        requested: version,
      });
    }
    
    // Attach version to request
    (req as any).apiVersion = version;
    
    next();
  };
}