import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import transactionRoutes from '../routes/transactions';
import { authenticateToken } from '../middleware/auth';
import { TransactionService } from '../services/transactionService';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('../middleware/auth');
jest.mock('../services/transactionService');

const app = express();
app.use(express.json());
app.use('/api/transactions', transactionRoutes);

// Mock authenticated user
const mockUser = {
  id: '123',
  email: 'test@example.com',
  role: 'user'
};

describe('Transaction Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateToken as jest.Mock).mockImplementation((req, res, next) => {
      req.user = mockUser;
      next();
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/transactions', () => {
    it('should return user transactions with pagination', async () => {
      const mockTransactions = [
        {
          id: '1',
          from: '0x123',
          to: '0x456',
          value: '1000000000000000000',
          hash: '0xabc',
          status: 'confirmed',
          timestamp: new Date()
        },
        {
          id: '2',
          from: '0x123',
          to: '0x789',
          value: '2000000000000000000',
          hash: '0xdef',
          status: 'pending',
          timestamp: new Date()
        }
      ];

      (TransactionService.prototype.getUserTransactions as jest.Mock).mockResolvedValue({
        transactions: mockTransactions,
        total: 2,
        page: 1,
        pageSize: 10
      });

      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', 'Bearer mocktoken')
        .query({ page: 1, pageSize: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('transactions');
      expect(response.body.transactions).toHaveLength(2);
      expect(response.body).toHaveProperty('total', 2);
      expect(response.body).toHaveProperty('page', 1);
    });

    it('should filter transactions by status', async () => {
      const mockPendingTransactions = [
        {
          id: '2',
          from: '0x123',
          to: '0x789',
          value: '2000000000000000000',
          hash: '0xdef',
          status: 'pending',
          timestamp: new Date()
        }
      ];

      (TransactionService.prototype.getUserTransactions as jest.Mock).mockResolvedValue({
        transactions: mockPendingTransactions,
        total: 1,
        page: 1,
        pageSize: 10
      });

      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', 'Bearer mocktoken')
        .query({ status: 'pending' });

      expect(response.status).toBe(200);
      expect(response.body.transactions).toHaveLength(1);
      expect(response.body.transactions[0].status).toBe('pending');
    });

    it('should return 401 if not authenticated', async () => {
      (authenticateToken as jest.Mock).mockImplementation((req, res, next) => {
        res.status(401).json({ error: 'Unauthorized' });
      });

      const response = await request(app).get('/api/transactions');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/transactions/:id', () => {
    it('should return transaction details', async () => {
      const mockTransaction = {
        id: '1',
        from: '0x123',
        to: '0x456',
        value: '1000000000000000000',
        hash: '0xabc',
        status: 'confirmed',
        timestamp: new Date(),
        gasUsed: '21000',
        gasPrice: '20000000000',
        blockNumber: 12345,
        userOpHash: '0xuserop123'
      };

      (TransactionService.prototype.getTransactionById as jest.Mock).mockResolvedValue(mockTransaction);

      const response = await request(app)
        .get('/api/transactions/1')
        .set('Authorization', 'Bearer mocktoken');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: '1',
        hash: '0xabc',
        status: 'confirmed'
      });
    });

    it('should return 404 if transaction not found', async () => {
      (TransactionService.prototype.getTransactionById as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/transactions/999')
        .set('Authorization', 'Bearer mocktoken');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Transaction not found');
    });
  });

  describe('POST /api/transactions/estimate', () => {
    it('should estimate gas for transaction', async () => {
      const mockEstimate = {
        gasLimit: '100000',
        gasPrice: '20000000000',
        totalCost: '2000000000000000',
        totalCostUSD: '5.00'
      };

      (TransactionService.prototype.estimateGas as jest.Mock).mockResolvedValue(mockEstimate);

      const response = await request(app)
        .post('/api/transactions/estimate')
        .set('Authorization', 'Bearer mocktoken')
        .send({
          to: '0x456',
          value: '1000000000000000000',
          data: '0x'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject(mockEstimate);
    });

    it('should return 400 for invalid transaction data', async () => {
      const response = await request(app)
        .post('/api/transactions/estimate')
        .set('Authorization', 'Bearer mocktoken')
        .send({
          to: 'invalid-address',
          value: '1000000000000000000'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/transactions/send', () => {
    it('should send a transaction', async () => {
      const mockTxResult = {
        userOpHash: '0xuserop123',
        status: 'pending',
        estimatedTime: 30
      };

      (TransactionService.prototype.sendTransaction as jest.Mock).mockResolvedValue(mockTxResult);

      const response = await request(app)
        .post('/api/transactions/send')
        .set('Authorization', 'Bearer mocktoken')
        .send({
          to: '0x456',
          value: '1000000000000000000',
          data: '0x',
          gasLimit: '100000'
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject(mockTxResult);
    });

    it('should validate transaction limits', async () => {
      (TransactionService.prototype.sendTransaction as jest.Mock).mockRejectedValue(
        new Error('Daily limit exceeded')
      );

      const response = await request(app)
        .post('/api/transactions/send')
        .set('Authorization', 'Bearer mocktoken')
        .send({
          to: '0x456',
          value: '99999999999999999999999',
          data: '0x'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Daily limit exceeded');
    });
  });

  describe('GET /api/transactions/stats', () => {
    it('should return transaction statistics', async () => {
      const mockStats = {
        totalTransactions: 100,
        totalVolume: '150000000000000000000',
        averageGasCost: '2000000000000000',
        successRate: 0.95,
        periodStats: {
          daily: { count: 10, volume: '10000000000000000000' },
          weekly: { count: 50, volume: '75000000000000000000' },
          monthly: { count: 100, volume: '150000000000000000000' }
        }
      };

      (TransactionService.prototype.getUserStats as jest.Mock).mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/transactions/stats')
        .set('Authorization', 'Bearer mocktoken');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject(mockStats);
    });
  });

  describe('POST /api/transactions/batch', () => {
    it('should create batch transaction', async () => {
      const mockBatchResult = {
        batchId: 'batch123',
        transactions: [
          { to: '0x456', value: '1000000000000000000', status: 'queued' },
          { to: '0x789', value: '2000000000000000000', status: 'queued' }
        ],
        totalGasEstimate: '200000',
        status: 'pending'
      };

      (TransactionService.prototype.createBatchTransaction as jest.Mock).mockResolvedValue(mockBatchResult);

      const response = await request(app)
        .post('/api/transactions/batch')
        .set('Authorization', 'Bearer mocktoken')
        .send({
          transactions: [
            { to: '0x456', value: '1000000000000000000', data: '0x' },
            { to: '0x789', value: '2000000000000000000', data: '0x' }
          ]
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('batchId');
      expect(response.body.transactions).toHaveLength(2);
    });

    it('should validate batch size limits', async () => {
      const largeBatch = Array(101).fill({ to: '0x456', value: '1000000000000000000', data: '0x' });

      const response = await request(app)
        .post('/api/transactions/batch')
        .set('Authorization', 'Bearer mocktoken')
        .send({ transactions: largeBatch });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Batch size exceeds limit');
    });
  });

  describe('GET /api/transactions/pending', () => {
    it('should return pending transactions', async () => {
      const mockPending = [
        {
          id: '1',
          hash: '0xabc',
          status: 'pending',
          timestamp: new Date(),
          estimatedConfirmation: 30
        }
      ];

      (TransactionService.prototype.getPendingTransactions as jest.Mock).mockResolvedValue(mockPending);

      const response = await request(app)
        .get('/api/transactions/pending')
        .set('Authorization', 'Bearer mocktoken');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].status).toBe('pending');
    });
  });

  describe('POST /api/transactions/:id/cancel', () => {
    it('should cancel pending transaction', async () => {
      (TransactionService.prototype.cancelTransaction as jest.Mock).mockResolvedValue({
        success: true,
        newStatus: 'cancelled'
      });

      const response = await request(app)
        .post('/api/transactions/1/cancel')
        .set('Authorization', 'Bearer mocktoken');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should not cancel confirmed transaction', async () => {
      (TransactionService.prototype.cancelTransaction as jest.Mock).mockRejectedValue(
        new Error('Cannot cancel confirmed transaction')
      );

      const response = await request(app)
        .post('/api/transactions/1/cancel')
        .set('Authorization', 'Bearer mocktoken');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot cancel confirmed transaction');
    });
  });

  describe('GET /api/transactions/export', () => {
    it('should export transactions as CSV', async () => {
      const mockCSV = 'date,from,to,value,status\n2023-01-01,0x123,0x456,1.0,confirmed';
      
      (TransactionService.prototype.exportTransactions as jest.Mock).mockResolvedValue(mockCSV);

      const response = await request(app)
        .get('/api/transactions/export')
        .set('Authorization', 'Bearer mocktoken')
        .query({ format: 'csv' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('date,from,to,value,status');
    });

    it('should export transactions as JSON', async () => {
      const mockData = [
        {
          date: '2023-01-01',
          from: '0x123',
          to: '0x456',
          value: '1.0',
          status: 'confirmed'
        }
      ];

      (TransactionService.prototype.exportTransactions as jest.Mock).mockResolvedValue(mockData);

      const response = await request(app)
        .get('/api/transactions/export')
        .set('Authorization', 'Bearer mocktoken')
        .query({ format: 'json' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body).toEqual(mockData);
    });
  });
});