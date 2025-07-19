import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import authRouter from '../routes/auth';
import { authenticate } from '../middleware/auth';

const app = express();
app.use(express.json());
app.use('/auth', authRouter);

const prisma = new PrismaClient();

// Test wallet
const wallet = ethers.Wallet.createRandom();
const testAddress = wallet.address;

describe('Auth Routes', () => {
  beforeAll(async () => {
    // Connect to test database
    await prisma.$connect();
  });

  afterAll(async () => {
    // Cleanup
    await prisma.authNonce.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.apiKey.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clear auth data before each test
    await prisma.authNonce.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.apiKey.deleteMany({});
  });

  describe('POST /auth/nonce', () => {
    it('should generate a nonce for valid address', async () => {
      const res = await request(app)
        .post('/auth/nonce')
        .send({ address: testAddress });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('nonce');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('expiresAt');
      expect(res.body.nonce).toHaveLength(64);
    });

    it('should reject invalid address', async () => {
      const res = await request(app)
        .post('/auth/nonce')
        .send({ address: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });

    it('should update existing nonce', async () => {
      // First request
      const res1 = await request(app)
        .post('/auth/nonce')
        .send({ address: testAddress });
      const nonce1 = res1.body.nonce;

      // Second request
      const res2 = await request(app)
        .post('/auth/nonce')
        .send({ address: testAddress });
      const nonce2 = res2.body.nonce;

      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe('POST /auth/login', () => {
    let nonce: string;
    let message: string;

    beforeEach(async () => {
      // Get nonce
      const res = await request(app)
        .post('/auth/nonce')
        .send({ address: testAddress });
      nonce = res.body.nonce;
      message = res.body.message;
    });

    it('should login with valid signature', async () => {
      // Sign message
      const signature = await wallet.signMessage(message);

      const res = await request(app)
        .post('/auth/login')
        .send({
          address: testAddress,
          signature,
          message,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.address).toBe(testAddress.toLowerCase());
    });

    it('should reject invalid signature', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          address: testAddress,
          signature: '0xinvalid',
          message,
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid signature');
    });

    it('should reject mismatched address', async () => {
      // Sign with different wallet
      const otherWallet = ethers.Wallet.createRandom();
      const signature = await otherWallet.signMessage(message);

      const res = await request(app)
        .post('/auth/login')
        .send({
          address: testAddress,
          signature,
          message,
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Signature verification failed');
    });

    it('should reject expired nonce', async () => {
      // Expire the nonce
      await prisma.authNonce.update({
        where: { address: testAddress.toLowerCase() },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const signature = await wallet.signMessage(message);

      const res = await request(app)
        .post('/auth/login')
        .send({
          address: testAddress,
          signature,
          message,
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Nonce expired');
    });

    it('should create new user on first login', async () => {
      const signature = await wallet.signMessage(message);

      await request(app)
        .post('/auth/login')
        .send({
          address: testAddress,
          signature,
          message,
        });

      const user = await prisma.user.findUnique({
        where: { address: testAddress.toLowerCase() },
      });

      expect(user).toBeTruthy();
      expect(user?.role).toBe('user');
      expect(user?.isActive).toBe(true);
    });
  });

  describe('POST /auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Login to get tokens
      const nonceRes = await request(app)
        .post('/auth/nonce')
        .send({ address: testAddress });

      const signature = await wallet.signMessage(nonceRes.body.message);

      const loginRes = await request(app)
        .post('/auth/login')
        .send({
          address: testAddress,
          signature,
          message: nonceRes.body.message,
        });

      refreshToken = loginRes.body.refreshToken;
    });

    it('should refresh access token', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      
      // New tokens should be different
      expect(res.body.refreshToken).not.toBe(refreshToken);
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error', 'Invalid refresh token');
    });

    it('should reject revoked refresh token', async () => {
      // Revoke token
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { revokedAt: new Date() },
      });

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(401);
    });
  });

  describe('Protected Routes', () => {
    let accessToken: string;
    let userId: string;

    beforeEach(async () => {
      // Login to get access token
      const nonceRes = await request(app)
        .post('/auth/nonce')
        .send({ address: testAddress });

      const signature = await wallet.signMessage(nonceRes.body.message);

      const loginRes = await request(app)
        .post('/auth/login')
        .send({
          address: testAddress,
          signature,
          message: nonceRes.body.message,
        });

      accessToken = loginRes.body.accessToken;
      userId = loginRes.body.user.id;
    });

    describe('GET /auth/me', () => {
      it('should return current user', async () => {
        const res = await request(app)
          .get('/auth/me')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('id', userId);
        expect(res.body).toHaveProperty('address', testAddress.toLowerCase());
        expect(res.body).toHaveProperty('wallets');
        expect(res.body).toHaveProperty('transactionCount');
      });

      it('should reject without token', async () => {
        const res = await request(app).get('/auth/me');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('error', 'No token provided');
      });

      it('should reject with invalid token', async () => {
        const res = await request(app)
          .get('/auth/me')
          .set('Authorization', 'Bearer invalid');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('error', 'Invalid token');
      });
    });

    describe('POST /auth/logout', () => {
      it('should revoke all refresh tokens', async () => {
        const res = await request(app)
          .post('/auth/logout')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(200);

        // Check tokens are revoked
        const tokens = await prisma.refreshToken.findMany({
          where: {
            userId,
            revokedAt: null,
          },
        });

        expect(tokens).toHaveLength(0);
      });
    });

    describe('API Key Management', () => {
      describe('POST /auth/api-key', () => {
        it('should create API key', async () => {
          const res = await request(app)
            .post('/auth/api-key')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ name: 'Test Key' });

          expect(res.status).toBe(200);
          expect(res.body).toHaveProperty('key');
          expect(res.body.key).toMatch(/^zkf_[a-f0-9]{64}$/);
          expect(res.body).toHaveProperty('name', 'Test Key');
        });

        it('should enforce API key limit', async () => {
          // Create max keys
          for (let i = 0; i < 5; i++) {
            await request(app)
              .post('/auth/api-key')
              .set('Authorization', `Bearer ${accessToken}`)
              .send({ name: `Key ${i}` });
          }

          // Try to create one more
          const res = await request(app)
            .post('/auth/api-key')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ name: 'Extra Key' });

          expect(res.status).toBe(400);
          expect(res.body).toHaveProperty('error', 'API key limit reached');
        });
      });

      describe('GET /auth/api-keys', () => {
        beforeEach(async () => {
          // Create some keys
          await request(app)
            .post('/auth/api-key')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ name: 'Key 1' });

          await request(app)
            .post('/auth/api-key')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ name: 'Key 2' });
        });

        it('should list API keys with masked values', async () => {
          const res = await request(app)
            .get('/auth/api-keys')
            .set('Authorization', `Bearer ${accessToken}`);

          expect(res.status).toBe(200);
          expect(res.body).toHaveLength(2);
          expect(res.body[0].key).toMatch(/^zkf_[a-f0-9]{4}\.\.\..[a-f0-9]{4}$/);
        });
      });

      describe('DELETE /auth/api-key/:id', () => {
        let apiKeyId: string;

        beforeEach(async () => {
          const res = await request(app)
            .post('/auth/api-key')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ name: 'Key to Delete' });

          apiKeyId = res.body.id;
        });

        it('should revoke API key', async () => {
          const res = await request(app)
            .delete(`/auth/api-key/${apiKeyId}`)
            .set('Authorization', `Bearer ${accessToken}`);

          expect(res.status).toBe(200);

          // Check key is deactivated
          const key = await prisma.apiKey.findUnique({
            where: { id: apiKeyId },
          });

          expect(key?.isActive).toBe(false);
        });

        it('should not revoke other users keys', async () => {
          // Create another user
          const otherWallet = ethers.Wallet.createRandom();
          await prisma.user.create({
            data: {
              address: otherWallet.address.toLowerCase(),
              role: 'user',
            },
          });

          const res = await request(app)
            .delete(`/auth/api-key/${apiKeyId}`)
            .set('Authorization', `Bearer ${accessToken}`);

          expect(res.status).toBe(404);
        });
      });
    });
  });
});