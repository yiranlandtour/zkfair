import { Router } from 'express';
import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';
import { generateTokens, verifyToken, authenticate, AuthRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const nonceRequestSchema = z.object({
  body: z.object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  }),
});

const verifySignatureSchema = z.object({
  body: z.object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
    signature: z.string(),
    message: z.string(),
  }),
});

const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string(),
  }),
});

// Generate nonce for signature
router.post(
  '/nonce',
  validateRequest(nonceRequestSchema),
  async (req, res) => {
    try {
      const { address } = req.body;

      // Generate random nonce
      const nonce = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Store nonce
      await prisma.authNonce.upsert({
        where: { address: address.toLowerCase() },
        create: {
          address: address.toLowerCase(),
          nonce,
          expiresAt,
        },
        update: {
          nonce,
          expiresAt,
        },
      });

      res.json({
        nonce,
        message: `Sign this message to authenticate with ZKFair L2:\n\nNonce: ${nonce}\nExpires: ${expiresAt.toISOString()}`,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error('Nonce generation error:', error);
      res.status(500).json({
        error: 'Failed to generate nonce',
        code: 'NONCE_GENERATION_FAILED',
      });
    }
  }
);

// Verify signature and login
router.post(
  '/login',
  validateRequest(verifySignatureSchema),
  async (req, res) => {
    try {
      const { address, signature, message } = req.body;
      const normalizedAddress = address.toLowerCase();

      // Verify nonce exists and is valid
      const authNonce = await prisma.authNonce.findUnique({
        where: { address: normalizedAddress },
      });

      if (!authNonce) {
        return res.status(400).json({
          error: 'Invalid nonce',
          code: 'INVALID_NONCE',
        });
      }

      if (authNonce.expiresAt < new Date()) {
        return res.status(400).json({
          error: 'Nonce expired',
          code: 'NONCE_EXPIRED',
        });
      }

      // Verify message contains the nonce
      if (!message.includes(authNonce.nonce)) {
        return res.status(400).json({
          error: 'Invalid message',
          code: 'INVALID_MESSAGE',
        });
      }

      // Verify signature
      let recoveredAddress: string;
      try {
        recoveredAddress = ethers.verifyMessage(message, signature);
      } catch (error) {
        return res.status(400).json({
          error: 'Invalid signature',
          code: 'INVALID_SIGNATURE',
        });
      }

      if (recoveredAddress.toLowerCase() !== normalizedAddress) {
        return res.status(400).json({
          error: 'Signature verification failed',
          code: 'SIGNATURE_MISMATCH',
        });
      }

      // Delete used nonce
      await prisma.authNonce.delete({
        where: { address: normalizedAddress },
      });

      // Get or create user
      let user = await prisma.user.findUnique({
        where: { address: normalizedAddress },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            address: normalizedAddress,
            role: 'user',
            isActive: true,
          },
        });
      } else if (!user.isActive) {
        return res.status(403).json({
          error: 'Account is disabled',
          code: 'ACCOUNT_DISABLED',
        });
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user);

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      res.json({
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          address: user.address,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        error: 'Login failed',
        code: 'LOGIN_FAILED',
      });
    }
  }
);

// Refresh access token
router.post(
  '/refresh',
  validateRequest(refreshTokenSchema),
  async (req, res) => {
    try {
      const { refreshToken } = req.body;

      // Verify refresh token
      let decoded;
      try {
        decoded = verifyToken(refreshToken);
      } catch (error) {
        return res.status(401).json({
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN',
        });
      }

      if (decoded.type !== 'refresh') {
        return res.status(401).json({
          error: 'Invalid token type',
          code: 'INVALID_TOKEN_TYPE',
        });
      }

      // Check if refresh token exists in database
      const storedToken = await prisma.refreshToken.findFirst({
        where: {
          token: refreshToken,
          userId: decoded.userId,
          expiresAt: { gt: new Date() },
          revokedAt: null,
        },
        include: {
          user: true,
        },
      });

      if (!storedToken) {
        return res.status(401).json({
          error: 'Refresh token not found or expired',
          code: 'REFRESH_TOKEN_NOT_FOUND',
        });
      }

      if (!storedToken.user.isActive) {
        return res.status(403).json({
          error: 'Account is disabled',
          code: 'ACCOUNT_DISABLED',
        });
      }

      // Revoke old refresh token
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });

      // Generate new tokens
      const tokens = generateTokens(storedToken.user);

      // Store new refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: storedToken.user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      res.json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        error: 'Token refresh failed',
        code: 'REFRESH_FAILED',
      });
    }
  }
);

// Logout
router.post('/logout', authenticate, async (req: AuthRequest, res) => {
  try {
    // Revoke all refresh tokens for user
    await prisma.refreshToken.updateMany({
      where: {
        userId: req.user!.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    res.json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_FAILED',
    });
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        address: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
        wallets: {
          select: {
            address: true,
            isDeployed: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            transactions: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    res.json({
      ...user,
      transactionCount: user._count.transactions,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user',
      code: 'GET_USER_FAILED',
    });
  }
});

// Generate API key
router.post('/api-key', authenticate, async (req: AuthRequest, res) => {
  try {
    const { name, expiresIn = 365 } = req.body;

    // Limit API keys per user
    const keyCount = await prisma.apiKey.count({
      where: {
        userId: req.user!.id,
        isActive: true,
      },
    });

    if (keyCount >= 5) {
      return res.status(400).json({
        error: 'API key limit reached',
        code: 'API_KEY_LIMIT',
        limit: 5,
      });
    }

    // Generate API key
    const key = `zkf_${crypto.randomBytes(32).toString('hex')}`;
    const expiresAt = new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000);

    const apiKey = await prisma.apiKey.create({
      data: {
        name: name || 'API Key',
        key,
        userId: req.user!.id,
        expiresAt,
        isActive: true,
      },
    });

    res.json({
      id: apiKey.id,
      name: apiKey.name,
      key,
      expiresAt: apiKey.expiresAt.toISOString(),
      createdAt: apiKey.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('API key generation error:', error);
    res.status(500).json({
      error: 'Failed to generate API key',
      code: 'API_KEY_GENERATION_FAILED',
    });
  }
});

// List API keys
router.get('/api-keys', authenticate, async (req: AuthRequest, res) => {
  try {
    const apiKeys = await prisma.apiKey.findMany({
      where: {
        userId: req.user!.id,
      },
      select: {
        id: true,
        name: true,
        key: true,
        expiresAt: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Mask API keys
    const maskedKeys = apiKeys.map(key => ({
      ...key,
      key: `${key.key.substring(0, 8)}...${key.key.substring(key.key.length - 4)}`,
    }));

    res.json(maskedKeys);
  } catch (error) {
    console.error('List API keys error:', error);
    res.status(500).json({
      error: 'Failed to list API keys',
      code: 'LIST_API_KEYS_FAILED',
    });
  }
});

// Revoke API key
router.delete('/api-key/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!apiKey) {
      return res.status(404).json({
        error: 'API key not found',
        code: 'API_KEY_NOT_FOUND',
      });
    }

    await prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({
      message: 'API key revoked successfully',
    });
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({
      error: 'Failed to revoke API key',
      code: 'REVOKE_API_KEY_FAILED',
    });
  }
});

export default router;