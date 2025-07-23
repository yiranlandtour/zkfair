import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { EnhancedAuthRequest } from './auth-enhanced';

// Signature configuration
const SIGNATURE_HEADER = 'x-signature';
const TIMESTAMP_HEADER = 'x-timestamp';
const NONCE_HEADER = 'x-nonce';
const SIGNATURE_WINDOW = 300; // 5 minutes
const NONCE_TTL = 600; // 10 minutes

// Signature methods
export enum SignatureMethod {
  HMAC_SHA256 = 'HMAC-SHA256',
  ECDSA = 'ECDSA',
  ED25519 = 'ED25519',
}

// Request signature data
interface SignatureData {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  body?: string;
  query?: string;
}

/**
 * Generate HMAC signature
 */
function generateHmacSignature(
  data: string,
  secret: string
): string {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
}

/**
 * Verify HMAC signature
 */
function verifyHmacSignature(
  data: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = generateHmacSignature(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Verify ECDSA signature (Ethereum-style)
 */
function verifyEcdsaSignature(
  message: string,
  signature: string,
  expectedAddress: string
): boolean {
  try {
    const messageHash = ethers.hashMessage(message);
    const recoveredAddress = ethers.recoverAddress(messageHash, signature);
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    logger.error('ECDSA signature verification failed', error);
    return false;
  }
}

/**
 * Build canonical request string for signing
 */
function buildCanonicalRequest(data: SignatureData): string {
  const parts = [
    data.method.toUpperCase(),
    data.path,
    data.timestamp,
    data.nonce,
  ];

  // Add query string if present
  if (data.query) {
    parts.push(data.query);
  }

  // Add body hash if present
  if (data.body) {
    const bodyHash = crypto
      .createHash('sha256')
      .update(data.body)
      .digest('hex');
    parts.push(bodyHash);
  }

  return parts.join('\n');
}

/**
 * Signature verification middleware
 */
export function verifySignature(
  method: SignatureMethod = SignatureMethod.HMAC_SHA256
) {
  return async (
    req: EnhancedAuthRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      // Get signature headers
      const signature = req.headers[SIGNATURE_HEADER] as string;
      const timestamp = req.headers[TIMESTAMP_HEADER] as string;
      const nonce = req.headers[NONCE_HEADER] as string;

      if (!signature || !timestamp || !nonce) {
        return res.status(401).json({
          error: 'Missing signature headers',
          code: 'MISSING_SIGNATURE',
          required: [SIGNATURE_HEADER, TIMESTAMP_HEADER, NONCE_HEADER],
        });
      }

      // Check timestamp window
      const requestTime = parseInt(timestamp);
      const currentTime = Math.floor(Date.now() / 1000);
      
      if (Math.abs(currentTime - requestTime) > SIGNATURE_WINDOW) {
        return res.status(401).json({
          error: 'Request timestamp out of range',
          code: 'TIMESTAMP_INVALID',
        });
      }

      // Check nonce to prevent replay attacks
      const nonceKey = `nonce:${nonce}`;
      const nonceExists = await redis.get(nonceKey);
      
      if (nonceExists) {
        return res.status(401).json({
          error: 'Nonce already used',
          code: 'NONCE_REUSED',
        });
      }

      // Store nonce
      await redis.setex(nonceKey, NONCE_TTL, '1');

      // Build canonical request
      const signatureData: SignatureData = {
        method: req.method,
        path: req.path,
        timestamp,
        nonce,
        query: req.query ? JSON.stringify(req.query) : undefined,
        body: req.body ? JSON.stringify(req.body) : undefined,
      };

      const canonicalRequest = buildCanonicalRequest(signatureData);

      // Verify signature based on method
      let isValid = false;

      switch (method) {
        case SignatureMethod.HMAC_SHA256:
          // Get user's API secret
          if (!req.user) {
            return res.status(401).json({
              error: 'Authentication required for HMAC',
              code: 'AUTH_REQUIRED',
            });
          }

          const apiSecret = await getUserApiSecret(req.user.id);
          if (!apiSecret) {
            return res.status(401).json({
              error: 'No API secret configured',
              code: 'NO_API_SECRET',
            });
          }

          isValid = verifyHmacSignature(canonicalRequest, signature, apiSecret);
          break;

        case SignatureMethod.ECDSA:
          // Verify against user's Ethereum address
          if (!req.user || !req.user.address) {
            return res.status(401).json({
              error: 'Ethereum address required',
              code: 'ADDRESS_REQUIRED',
            });
          }

          isValid = verifyEcdsaSignature(
            canonicalRequest,
            signature,
            req.user.address
          );
          break;

        default:
          return res.status(400).json({
            error: 'Unsupported signature method',
            code: 'UNSUPPORTED_METHOD',
          });
      }

      if (!isValid) {
        logger.warn('Invalid signature', {
          userId: req.user?.id,
          method,
          path: req.path,
        });

        return res.status(401).json({
          error: 'Invalid signature',
          code: 'INVALID_SIGNATURE',
        });
      }

      next();
    } catch (error) {
      logger.error('Signature verification error', error);
      return res.status(500).json({
        error: 'Signature verification failed',
        code: 'SIGNATURE_ERROR',
      });
    }
  };
}

/**
 * Optional signature verification
 */
export function optionalSignature(
  method: SignatureMethod = SignatureMethod.HMAC_SHA256
) {
  return async (
    req: EnhancedAuthRequest,
    res: Response,
    next: NextFunction
  ) => {
    const signature = req.headers[SIGNATURE_HEADER];
    
    if (!signature) {
      return next();
    }

    return verifySignature(method)(req, res, next);
  };
}

/**
 * Get user's API secret (for HMAC)
 */
async function getUserApiSecret(userId: string): Promise<string | null> {
  // Check cache first
  const cacheKey = `api_secret:${userId}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return cached;
  }

  // In production, fetch from database
  // For now, generate a deterministic secret
  const secret = crypto
    .createHash('sha256')
    .update(`${process.env.JWT_SECRET}:${userId}`)
    .digest('hex');

  // Cache for future use
  await redis.setex(cacheKey, 3600, secret);

  return secret;
}

/**
 * Generate signature for client requests (helper)
 */
export function generateRequestSignature(
  req: {
    method: string;
    path: string;
    query?: any;
    body?: any;
  },
  secret: string,
  method: SignatureMethod = SignatureMethod.HMAC_SHA256
): {
  signature: string;
  timestamp: string;
  nonce: string;
} {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  const signatureData: SignatureData = {
    method: req.method,
    path: req.path,
    timestamp,
    nonce,
    query: req.query ? JSON.stringify(req.query) : undefined,
    body: req.body ? JSON.stringify(req.body) : undefined,
  };

  const canonicalRequest = buildCanonicalRequest(signatureData);
  let signature = '';

  switch (method) {
    case SignatureMethod.HMAC_SHA256:
      signature = generateHmacSignature(canonicalRequest, secret);
      break;
    // Add other methods as needed
  }

  return { signature, timestamp, nonce };
}

/**
 * Webhook signature verification
 */
export function verifyWebhookSignature(
  secret: string,
  signatureHeader: string = 'x-webhook-signature'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.headers[signatureHeader] as string;
      
      if (!signature) {
        return res.status(401).json({
          error: 'Missing webhook signature',
          code: 'MISSING_WEBHOOK_SIGNATURE',
        });
      }

      // Build payload
      const timestamp = req.headers['x-webhook-timestamp'] as string || Date.now().toString();
      const payload = `${timestamp}.${JSON.stringify(req.body)}`;
      
      // Verify signature
      const expectedSignature = generateHmacSignature(payload, secret);
      
      if (!crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )) {
        logger.warn('Invalid webhook signature', {
          path: req.path,
          signature: signature.substring(0, 10) + '...',
        });

        return res.status(401).json({
          error: 'Invalid webhook signature',
          code: 'INVALID_WEBHOOK_SIGNATURE',
        });
      }

      next();
    } catch (error) {
      logger.error('Webhook signature verification error', error);
      return res.status(500).json({
        error: 'Webhook verification failed',
        code: 'WEBHOOK_ERROR',
      });
    }
  };
}

export default {
  verifySignature,
  optionalSignature,
  generateRequestSignature,
  verifyWebhookSignature,
  SignatureMethod,
};