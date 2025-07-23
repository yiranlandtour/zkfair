import { Request, Response, NextFunction } from 'express';
import validator from 'validator';
import { logger } from '../utils/logger';

// SQL injection patterns
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b)/i,
  /(--|#|\/\*|\*\/|@@|@)/,
  /(\bOR\b\s*\d+\s*=\s*\d+)/i,
  /(\bAND\b\s*\d+\s*=\s*\d+)/i,
  /(\'\s*OR\s*\')/i,
  /(\'\s*AND\s*\')/i,
  /(SLEEP\s*\(|BENCHMARK\s*\(|WAITFOR\s+DELAY)/i,
  /(xp_cmdshell|xp_regread|xp_regwrite)/i,
  /(\bINTO\s+(OUTFILE|DUMPFILE)\b)/i,
  /(\bLOAD_FILE\s*\()/i,
];

// NoSQL injection patterns
const NOSQL_INJECTION_PATTERNS = [
  /(\$ne|\$eq|\$gt|\$gte|\$lt|\$lte|\$in|\$nin)/,
  /(\$or|\$and|\$not|\$nor)/,
  /(\$where|\$regex|\$text|\$expr)/,
  /(\$elemMatch|\$size|\$exists)/,
  /(function\s*\(|eval\s*\(|new\s+Function)/i,
];

// XSS patterns
const XSS_PATTERNS = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<img[^>]+src[\\s]*=[\\s]*["\']javascript:/gi,
];

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.[\/\\]/,
  /\.\.%2[fF]/,
  /%2e%2e[\/\\]/,
  /\x00/,
];

// Configuration
export interface SecurityConfig {
  enableSqlProtection?: boolean;
  enableNoSqlProtection?: boolean;
  enableXssProtection?: boolean;
  enablePathTraversalProtection?: boolean;
  customPatterns?: RegExp[];
  whitelist?: string[];
  logAttempts?: boolean;
  blockOnDetection?: boolean;
}

const defaultConfig: SecurityConfig = {
  enableSqlProtection: true,
  enableNoSqlProtection: true,
  enableXssProtection: true,
  enablePathTraversalProtection: true,
  logAttempts: true,
  blockOnDetection: true,
};

/**
 * Check if value contains SQL injection patterns
 */
function containsSqlInjection(value: string): boolean {
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Check if value contains NoSQL injection patterns
 */
function containsNoSqlInjection(value: string): boolean {
  return NOSQL_INJECTION_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Check if value contains XSS patterns
 */
function containsXss(value: string): boolean {
  return XSS_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Check if value contains path traversal patterns
 */
function containsPathTraversal(value: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Sanitize input value
 */
export function sanitizeInput(value: any): any {
  if (typeof value === 'string') {
    // Basic sanitization
    let sanitized = value;
    
    // Remove null bytes
    sanitized = sanitized.replace(/\x00/g, '');
    
    // Escape HTML entities
    sanitized = validator.escape(sanitized);
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    return sanitized;
  }
  
  if (Array.isArray(value)) {
    return value.map(sanitizeInput);
  }
  
  if (typeof value === 'object' && value !== null) {
    const sanitized: any = {};
    for (const key in value) {
      // Sanitize keys as well
      const sanitizedKey = sanitizeInput(key);
      sanitized[sanitizedKey] = sanitizeInput(value[key]);
    }
    return sanitized;
  }
  
  return value;
}

/**
 * Check object for injection patterns
 */
function checkForInjection(
  obj: any,
  config: SecurityConfig,
  path = ''
): { found: boolean; type?: string; path?: string; value?: string } {
  if (typeof obj === 'string') {
    // Skip if in whitelist
    if (config.whitelist?.includes(obj)) {
      return { found: false };
    }

    // Check SQL injection
    if (config.enableSqlProtection && containsSqlInjection(obj)) {
      return { found: true, type: 'SQL', path, value: obj };
    }

    // Check NoSQL injection
    if (config.enableNoSqlProtection && containsNoSqlInjection(obj)) {
      return { found: true, type: 'NoSQL', path, value: obj };
    }

    // Check XSS
    if (config.enableXssProtection && containsXss(obj)) {
      return { found: true, type: 'XSS', path, value: obj };
    }

    // Check path traversal
    if (config.enablePathTraversalProtection && containsPathTraversal(obj)) {
      return { found: true, type: 'PathTraversal', path, value: obj };
    }

    // Check custom patterns
    if (config.customPatterns) {
      for (const pattern of config.customPatterns) {
        if (pattern.test(obj)) {
          return { found: true, type: 'Custom', path, value: obj };
        }
      }
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = checkForInjection(obj[i], config, `${path}[${i}]`);
      if (result.found) return result;
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      // Check key itself
      const keyResult = checkForInjection(key, config, `${path}.${key}`);
      if (keyResult.found) return keyResult;

      // Check value
      const valueResult = checkForInjection(obj[key], config, `${path}.${key}`);
      if (valueResult.found) return valueResult;
    }
  }

  return { found: false };
}

/**
 * SQL injection protection middleware
 */
export function sqlInjectionProtection(config?: Partial<SecurityConfig>) {
  const finalConfig = { ...defaultConfig, ...config };

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check all input sources
      const sources = [
        { data: req.params, name: 'params' },
        { data: req.query, name: 'query' },
        { data: req.body, name: 'body' },
        { data: req.headers, name: 'headers' },
      ];

      for (const source of sources) {
        if (!source.data) continue;

        const result = checkForInjection(source.data, finalConfig, source.name);
        
        if (result.found) {
          if (finalConfig.logAttempts) {
            logger.warn('Potential injection attempt detected', {
              type: result.type,
              path: result.path,
              value: result.value?.substring(0, 100),
              ip: req.ip,
              userAgent: req.headers['user-agent'],
              url: req.url,
            });
          }

          if (finalConfig.blockOnDetection) {
            return res.status(400).json({
              error: 'Invalid input detected',
              code: 'INVALID_INPUT',
              type: result.type,
            });
          }
        }
      }

      next();
    } catch (error) {
      logger.error('SQL injection protection error', error);
      next(); // Don't block on error
    }
  };
}

/**
 * Parameterized query builder helper
 */
export class QueryBuilder {
  private query: string = '';
  private params: any[] = [];
  private paramCounter: number = 0;

  select(fields: string[]): QueryBuilder {
    const sanitizedFields = fields.map(f => this.sanitizeIdentifier(f));
    this.query += `SELECT ${sanitizedFields.join(', ')}`;
    return this;
  }

  from(table: string): QueryBuilder {
    this.query += ` FROM ${this.sanitizeIdentifier(table)}`;
    return this;
  }

  where(field: string, operator: string, value: any): QueryBuilder {
    const sanitizedField = this.sanitizeIdentifier(field);
    const validOperators = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'];
    
    if (!validOperators.includes(operator.toUpperCase())) {
      throw new Error('Invalid operator');
    }

    if (this.query.includes('WHERE')) {
      this.query += ' AND';
    } else {
      this.query += ' WHERE';
    }

    this.paramCounter++;
    this.query += ` ${sanitizedField} ${operator} $${this.paramCounter}`;
    this.params.push(value);

    return this;
  }

  orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): QueryBuilder {
    const sanitizedField = this.sanitizeIdentifier(field);
    this.query += ` ORDER BY ${sanitizedField} ${direction}`;
    return this;
  }

  limit(limit: number): QueryBuilder {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('Invalid limit');
    }
    this.query += ` LIMIT ${limit}`;
    return this;
  }

  offset(offset: number): QueryBuilder {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error('Invalid offset');
    }
    this.query += ` OFFSET ${offset}`;
    return this;
  }

  build(): { query: string; params: any[] } {
    return {
      query: this.query,
      params: this.params,
    };
  }

  private sanitizeIdentifier(identifier: string): string {
    // Only allow alphanumeric, underscore, and dot (for table.column)
    if (!/^[a-zA-Z0-9_.]+$/.test(identifier)) {
      throw new Error('Invalid identifier');
    }
    return identifier;
  }
}

/**
 * Input validation helper
 */
export const validate = {
  isEmail: (value: string): boolean => validator.isEmail(value),
  isUUID: (value: string): boolean => validator.isUUID(value),
  isAlphanumeric: (value: string): boolean => validator.isAlphanumeric(value),
  isNumeric: (value: string): boolean => validator.isNumeric(value),
  isHexadecimal: (value: string): boolean => validator.isHexadecimal(value),
  isEthereumAddress: (value: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(value),
  isPositiveInteger: (value: any): boolean => {
    const num = Number(value);
    return Number.isInteger(num) && num > 0;
  },
  isSafeString: (value: string, maxLength = 1000): boolean => {
    return (
      typeof value === 'string' &&
      value.length <= maxLength &&
      !containsSqlInjection(value) &&
      !containsXss(value)
    );
  },
};

export default {
  sqlInjectionProtection,
  sanitizeInput,
  QueryBuilder,
  validate,
};