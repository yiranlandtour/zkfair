import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// API Key configuration
const API_KEY_PREFIX = 'zkf_';
const API_KEY_LENGTH = 32;
const API_KEY_CACHE_TTL = 3600; // 1 hour
const API_KEY_ROTATION_DAYS = 90;

// API Key types
export enum ApiKeyType {
  PERSONAL = 'PERSONAL',
  SERVICE = 'SERVICE',
  WEBHOOK = 'WEBHOOK',
}

// API Key permissions
export enum ApiKeyPermission {
  READ = 'READ',
  WRITE = 'WRITE',
  DELETE = 'DELETE',
  ADMIN = 'ADMIN',
}

// API Key data
export interface ApiKeyData {
  id: string;
  key: string;
  name: string;
  type: ApiKeyType;
  permissions: ApiKeyPermission[];
  userId: string;
  expiresAt?: Date;
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
  rotatedFrom?: string;
  ipWhitelist?: string[];
  rateLimit?: number;
}

// API Key creation options
export interface CreateApiKeyOptions {
  name: string;
  type: ApiKeyType;
  permissions: ApiKeyPermission[];
  userId: string;
  expiresIn?: number; // days
  ipWhitelist?: string[];
  rateLimit?: number;
}

// API Key validation result
export interface ApiKeyValidationResult {
  valid: boolean;
  keyData?: ApiKeyData;
  error?: string;
  rateLimitRemaining?: number;
}

/**
 * Generate a secure API key
 */
function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(API_KEY_LENGTH);
  const key = randomBytes.toString('base64url');
  return `${API_KEY_PREFIX}${key}`;
}

/**
 * Hash API key for storage
 */
function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Create a new API key
 */
export async function createApiKey(
  options: CreateApiKeyOptions
): Promise<{ key: string; keyData: ApiKeyData }> {
  const key = generateApiKey();
  const hashedKey = hashApiKey(key);

  const expiresAt = options.expiresIn
    ? new Date(Date.now() + options.expiresIn * 24 * 60 * 60 * 1000)
    : undefined;

  const keyData = await prisma.apiKey.create({
    data: {
      key: hashedKey,
      name: options.name,
      type: options.type,
      permissions: options.permissions,
      userId: options.userId,
      expiresAt,
      ipWhitelist: options.ipWhitelist,
      rateLimit: options.rateLimit,
      isActive: true,
    },
  });

  // Cache the key data
  await redis.setex(
    `apikey:${hashedKey}`,
    API_KEY_CACHE_TTL,
    JSON.stringify(keyData)
  );

  logger.info('API key created', {
    userId: options.userId,
    keyId: keyData.id,
    type: options.type,
    name: options.name,
  });

  return {
    key, // Return unhashed key only once
    keyData: {
      ...keyData,
      key: key.substring(0, 10) + '...' // Masked for display
    },
  };
}

/**
 * Validate an API key
 */
export async function validateApiKey(
  key: string,
  requiredPermissions?: ApiKeyPermission[],
  ipAddress?: string
): Promise<ApiKeyValidationResult> {
  try {
    // Check format
    if (!key.startsWith(API_KEY_PREFIX)) {
      return { valid: false, error: 'Invalid key format' };
    }

    const hashedKey = hashApiKey(key);

    // Check cache first
    const cached = await redis.get(`apikey:${hashedKey}`);
    let keyData: ApiKeyData;

    if (cached) {
      keyData = JSON.parse(cached);
    } else {
      // Query database
      const dbKey = await prisma.apiKey.findFirst({
        where: { key: hashedKey },
        include: {
          user: {
            select: {
              id: true,
              isActive: true,
              isBanned: true,
            },
          },
        },
      });

      if (!dbKey) {
        return { valid: false, error: 'Key not found' };
      }

      keyData = dbKey as any;

      // Cache for future use
      await redis.setex(
        `apikey:${hashedKey}`,
        API_KEY_CACHE_TTL,
        JSON.stringify(dbKey)
      );
    }

    // Validate key status
    if (!keyData.isActive) {
      return { valid: false, error: 'Key is inactive' };
    }

    // Check expiration
    if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
      return { valid: false, error: 'Key expired' };
    }

    // Check user status
    if (!keyData.user.isActive || keyData.user.isBanned) {
      return { valid: false, error: 'User inactive or banned' };
    }

    // Check IP whitelist
    if (keyData.ipWhitelist && keyData.ipWhitelist.length > 0 && ipAddress) {
      if (!keyData.ipWhitelist.includes(ipAddress)) {
        logger.warn('API key used from non-whitelisted IP', {
          keyId: keyData.id,
          ipAddress,
        });
        return { valid: false, error: 'IP not whitelisted' };
      }
    }

    // Check permissions
    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasPermissions = requiredPermissions.every(perm =>
        keyData.permissions.includes(perm)
      );

      if (!hasPermissions) {
        return { valid: false, error: 'Insufficient permissions' };
      }
    }

    // Check rate limit
    if (keyData.rateLimit) {
      const rateLimitKey = `ratelimit:apikey:${keyData.id}`;
      const count = await redis.incr(rateLimitKey);
      
      if (count === 1) {
        await redis.expire(rateLimitKey, 3600); // 1 hour window
      }

      if (count > keyData.rateLimit) {
        return { 
          valid: false, 
          error: 'Rate limit exceeded',
          rateLimitRemaining: 0,
        };
      }

      keyData.rateLimitRemaining = keyData.rateLimit - count;
    }

    // Update last used timestamp (async, don't wait)
    prisma.apiKey.update({
      where: { id: keyData.id },
      data: { lastUsedAt: new Date() },
    }).catch(err => logger.error('Failed to update API key last used', err));

    return {
      valid: true,
      keyData,
      rateLimitRemaining: keyData.rateLimitRemaining,
    };
  } catch (error) {
    logger.error('API key validation error', error);
    return { valid: false, error: 'Validation error' };
  }
}

/**
 * Rotate an API key
 */
export async function rotateApiKey(
  oldKeyId: string,
  userId: string
): Promise<{ key: string; keyData: ApiKeyData }> {
  const oldKey = await prisma.apiKey.findFirst({
    where: { id: oldKeyId, userId },
  });

  if (!oldKey) {
    throw new Error('API key not found');
  }

  // Create new key with same settings
  const newKeyResult = await createApiKey({
    name: `${oldKey.name} (Rotated)`,
    type: oldKey.type as ApiKeyType,
    permissions: oldKey.permissions as ApiKeyPermission[],
    userId,
    expiresIn: oldKey.expiresAt 
      ? Math.ceil((oldKey.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : undefined,
    ipWhitelist: oldKey.ipWhitelist,
    rateLimit: oldKey.rateLimit,
  });

  // Update new key with rotation reference
  await prisma.apiKey.update({
    where: { id: newKeyResult.keyData.id },
    data: { rotatedFrom: oldKeyId },
  });

  // Deactivate old key
  await prisma.apiKey.update({
    where: { id: oldKeyId },
    data: { isActive: false },
  });

  // Clear cache for old key
  const oldHashedKey = hashApiKey(oldKey.key);
  await redis.del(`apikey:${oldHashedKey}`);

  logger.info('API key rotated', {
    userId,
    oldKeyId,
    newKeyId: newKeyResult.keyData.id,
  });

  return newKeyResult;
}

/**
 * List API keys for a user
 */
export async function listApiKeys(
  userId: string,
  includeInactive = false
): Promise<ApiKeyData[]> {
  const where: any = { userId };
  
  if (!includeInactive) {
    where.isActive = true;
  }

  const keys = await prisma.apiKey.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  // Mask the keys
  return keys.map(key => ({
    ...key,
    key: `${API_KEY_PREFIX}${key.key.substring(0, 6)}...`,
  }));
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(
  keyId: string,
  userId: string
): Promise<void> {
  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!key) {
    throw new Error('API key not found');
  }

  // Update database
  await prisma.apiKey.update({
    where: { id: keyId },
    data: { isActive: false },
  });

  // Clear cache
  const hashedKey = hashApiKey(key.key);
  await redis.del(`apikey:${hashedKey}`);

  logger.info('API key revoked', { userId, keyId });
}

/**
 * Check API keys that need rotation
 */
export async function checkKeysForRotation(): Promise<ApiKeyData[]> {
  const rotationDate = new Date();
  rotationDate.setDate(rotationDate.getDate() - API_KEY_ROTATION_DAYS);

  const keysToRotate = await prisma.apiKey.findMany({
    where: {
      isActive: true,
      createdAt: { lt: rotationDate },
      type: { not: ApiKeyType.SERVICE }, // Don't auto-rotate service keys
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  return keysToRotate;
}

/**
 * API key analytics
 */
export async function getApiKeyAnalytics(userId: string) {
  const keys = await prisma.apiKey.findMany({
    where: { userId },
  });

  const analytics = {
    totalKeys: keys.length,
    activeKeys: keys.filter(k => k.isActive).length,
    expiredKeys: keys.filter(k => k.expiresAt && k.expiresAt < new Date()).length,
    keysByType: {} as Record<string, number>,
    recentUsage: [] as any[],
  };

  // Count by type
  for (const key of keys) {
    analytics.keysByType[key.type] = (analytics.keysByType[key.type] || 0) + 1;
  }

  // Get recent usage
  const recentKeys = keys
    .filter(k => k.lastUsedAt)
    .sort((a, b) => b.lastUsedAt!.getTime() - a.lastUsedAt!.getTime())
    .slice(0, 5);

  analytics.recentUsage = recentKeys.map(k => ({
    id: k.id,
    name: k.name,
    lastUsed: k.lastUsedAt,
    type: k.type,
  }));

  return analytics;
}

export default {
  createApiKey,
  validateApiKey,
  rotateApiKey,
  listApiKeys,
  revokeApiKey,
  checkKeysForRotation,
  getApiKeyAnalytics,
};