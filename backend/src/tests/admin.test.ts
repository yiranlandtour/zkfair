import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import adminRoutes from '../routes/admin';
import { authenticateToken, authorizeAdmin } from '../middleware/auth';
import { AdminService } from '../services/adminService';
import { UserService } from '../services/userService';
import { SystemService } from '../services/systemService';

// Mock dependencies
jest.mock('../middleware/auth');
jest.mock('../services/adminService');
jest.mock('../services/userService');
jest.mock('../services/systemService');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

// Mock authenticated admin
const mockAdmin = {
  id: '456',
  email: 'admin@example.com',
  role: 'admin'
};

describe('Admin Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateToken as jest.Mock).mockImplementation((req, res, next) => {
      req.user = mockAdmin;
      next();
    });
    (authorizeAdmin as jest.Mock).mockImplementation((req, res, next) => {
      if (req.user.role === 'admin') {
        next();
      } else {
        res.status(403).json({ error: 'Admin access required' });
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('User Management', () => {
    describe('GET /api/admin/users', () => {
      it('should return all users with pagination', async () => {
        const mockUsers = [
          {
            id: '1',
            email: 'user1@example.com',
            role: 'user',
            walletAddress: '0x123',
            createdAt: new Date(),
            status: 'active'
          },
          {
            id: '2',
            email: 'user2@example.com',
            role: 'user',
            walletAddress: '0x456',
            createdAt: new Date(),
            status: 'active'
          }
        ];

        (UserService.prototype.getAllUsers as jest.Mock).mockResolvedValue({
          users: mockUsers,
          total: 2,
          page: 1,
          pageSize: 10
        });

        const response = await request(app)
          .get('/api/admin/users')
          .set('Authorization', 'Bearer mocktoken')
          .query({ page: 1, pageSize: 10 });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('users');
        expect(response.body.users).toHaveLength(2);
      });

      it('should filter users by status', async () => {
        const mockInactiveUsers = [
          {
            id: '3',
            email: 'inactive@example.com',
            role: 'user',
            status: 'inactive'
          }
        ];

        (UserService.prototype.getAllUsers as jest.Mock).mockResolvedValue({
          users: mockInactiveUsers,
          total: 1,
          page: 1,
          pageSize: 10
        });

        const response = await request(app)
          .get('/api/admin/users')
          .set('Authorization', 'Bearer mocktoken')
          .query({ status: 'inactive' });

        expect(response.status).toBe(200);
        expect(response.body.users).toHaveLength(1);
        expect(response.body.users[0].status).toBe('inactive');
      });
    });

    describe('GET /api/admin/users/:id', () => {
      it('should return user details with activity', async () => {
        const mockUserDetails = {
          id: '1',
          email: 'user1@example.com',
          role: 'user',
          walletAddress: '0x123',
          createdAt: new Date(),
          status: 'active',
          activity: {
            lastLogin: new Date(),
            totalTransactions: 50,
            totalVolume: '1500000000000000000000',
            lastTransaction: new Date()
          },
          wallets: [
            {
              address: '0xabc',
              type: 'smart',
              deployed: true,
              balance: '1000000000000000000'
            }
          ]
        };

        (UserService.prototype.getUserDetails as jest.Mock).mockResolvedValue(mockUserDetails);

        const response = await request(app)
          .get('/api/admin/users/1')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('activity');
        expect(response.body).toHaveProperty('wallets');
      });
    });

    describe('PUT /api/admin/users/:id', () => {
      it('should update user role', async () => {
        (UserService.prototype.updateUser as jest.Mock).mockResolvedValue({
          id: '1',
          email: 'user1@example.com',
          role: 'premium',
          updated: true
        });

        const response = await request(app)
          .put('/api/admin/users/1')
          .set('Authorization', 'Bearer mocktoken')
          .send({ role: 'premium' });

        expect(response.status).toBe(200);
        expect(response.body.role).toBe('premium');
      });

      it('should update user status', async () => {
        (UserService.prototype.updateUser as jest.Mock).mockResolvedValue({
          id: '1',
          status: 'suspended',
          updated: true
        });

        const response = await request(app)
          .put('/api/admin/users/1')
          .set('Authorization', 'Bearer mocktoken')
          .send({ status: 'suspended' });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('suspended');
      });
    });

    describe('POST /api/admin/users/:id/suspend', () => {
      it('should suspend user account', async () => {
        (UserService.prototype.suspendUser as jest.Mock).mockResolvedValue({
          success: true,
          reason: 'Terms violation',
          suspendedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        const response = await request(app)
          .post('/api/admin/users/1/suspend')
          .set('Authorization', 'Bearer mocktoken')
          .send({ 
            reason: 'Terms violation',
            duration: 7 // days
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
      });
    });
  });

  describe('System Management', () => {
    describe('GET /api/admin/system/config', () => {
      it('should return system configuration', async () => {
        const mockConfig = {
          paymaster: {
            address: '0xpaymaster',
            dailyLimit: '10000000000000000000000',
            enabled: true
          },
          bundler: {
            url: 'http://bundler:3000',
            maxBatchSize: 100,
            timeout: 30000
          },
          gas: {
            maxPrice: '100000000000',
            priority: 'medium'
          },
          features: {
            multisig: true,
            socialRecovery: true,
            batchTransactions: true
          }
        };

        (SystemService.prototype.getConfiguration as jest.Mock).mockResolvedValue(mockConfig);

        const response = await request(app)
          .get('/api/admin/system/config')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('paymaster');
        expect(response.body).toHaveProperty('bundler');
      });
    });

    describe('PUT /api/admin/system/config', () => {
      it('should update system configuration', async () => {
        const updatedConfig = {
          paymaster: {
            dailyLimit: '20000000000000000000000'
          }
        };

        (SystemService.prototype.updateConfiguration as jest.Mock).mockResolvedValue({
          ...updatedConfig,
          updated: true
        });

        const response = await request(app)
          .put('/api/admin/system/config')
          .set('Authorization', 'Bearer mocktoken')
          .send(updatedConfig);

        expect(response.status).toBe(200);
        expect(response.body.paymaster.dailyLimit).toBe('20000000000000000000000');
      });
    });

    describe('GET /api/admin/system/health', () => {
      it('should return detailed system health', async () => {
        const mockHealth = {
          status: 'healthy',
          components: {
            database: { status: 'healthy', latency: 5 },
            redis: { status: 'healthy', latency: 2 },
            blockchain: { status: 'healthy', blockHeight: 12345 },
            bundler: { status: 'healthy', queueSize: 10 }
          },
          metrics: {
            cpu: 45.2,
            memory: 2147483648,
            disk: 10737418240,
            uptime: 864000
          }
        };

        (SystemService.prototype.getHealthStatus as jest.Mock).mockResolvedValue(mockHealth);

        const response = await request(app)
          .get('/api/admin/system/health')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'healthy');
        expect(response.body).toHaveProperty('components');
      });
    });

    describe('POST /api/admin/system/maintenance', () => {
      it('should toggle maintenance mode', async () => {
        (SystemService.prototype.setMaintenanceMode as jest.Mock).mockResolvedValue({
          maintenanceMode: true,
          message: 'System under maintenance',
          estimatedDuration: 3600
        });

        const response = await request(app)
          .post('/api/admin/system/maintenance')
          .set('Authorization', 'Bearer mocktoken')
          .send({ 
            enabled: true,
            message: 'System under maintenance',
            duration: 3600
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('maintenanceMode', true);
      });
    });
  });

  describe('Transaction Management', () => {
    describe('GET /api/admin/transactions', () => {
      it('should return all transactions with filters', async () => {
        const mockTransactions = [
          {
            id: '1',
            from: '0x123',
            to: '0x456',
            value: '1000000000000000000',
            status: 'confirmed',
            timestamp: new Date(),
            userOpHash: '0xuserop1'
          }
        ];

        (AdminService.prototype.getAllTransactions as jest.Mock).mockResolvedValue({
          transactions: mockTransactions,
          total: 1,
          page: 1,
          pageSize: 10
        });

        const response = await request(app)
          .get('/api/admin/transactions')
          .set('Authorization', 'Bearer mocktoken')
          .query({ status: 'confirmed' });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('transactions');
      });
    });

    describe('POST /api/admin/transactions/:id/refund', () => {
      it('should process transaction refund', async () => {
        (AdminService.prototype.refundTransaction as jest.Mock).mockResolvedValue({
          success: true,
          refundTxHash: '0xrefund123',
          amount: '1000000000000000000'
        });

        const response = await request(app)
          .post('/api/admin/transactions/1/refund')
          .set('Authorization', 'Bearer mocktoken')
          .send({ reason: 'User request' });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('refundTxHash');
      });
    });
  });

  describe('Smart Wallet Management', () => {
    describe('GET /api/admin/wallets', () => {
      it('should return all smart wallets', async () => {
        const mockWallets = [
          {
            address: '0xsmart1',
            owner: '0xowner1',
            deployed: true,
            modules: ['recovery', 'multisig'],
            balance: '1000000000000000000',
            transactionCount: 50
          }
        ];

        (AdminService.prototype.getAllWallets as jest.Mock).mockResolvedValue({
          wallets: mockWallets,
          total: 1,
          stats: {
            totalDeployed: 100,
            totalBalance: '100000000000000000000',
            activeToday: 25
          }
        });

        const response = await request(app)
          .get('/api/admin/wallets')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('wallets');
        expect(response.body).toHaveProperty('stats');
      });
    });

    describe('POST /api/admin/wallets/:address/freeze', () => {
      it('should freeze smart wallet', async () => {
        (AdminService.prototype.freezeWallet as jest.Mock).mockResolvedValue({
          success: true,
          frozen: true,
          reason: 'Security concern'
        });

        const response = await request(app)
          .post('/api/admin/wallets/0xsmart1/freeze')
          .set('Authorization', 'Bearer mocktoken')
          .send({ reason: 'Security concern' });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('frozen', true);
      });
    });
  });

  describe('Analytics Dashboard', () => {
    describe('GET /api/admin/dashboard', () => {
      it('should return admin dashboard data', async () => {
        const mockDashboard = {
          overview: {
            totalUsers: 5000,
            activeUsers: 1200,
            totalTransactions: 50000,
            totalVolume: '150000000000000000000000',
            systemHealth: 'healthy'
          },
          recentActivity: [
            {
              type: 'user_registration',
              timestamp: new Date(),
              details: { email: 'new@example.com' }
            }
          ],
          alerts: [
            {
              level: 'warning',
              message: 'High gas prices detected',
              timestamp: new Date()
            }
          ]
        };

        (AdminService.prototype.getDashboardData as jest.Mock).mockResolvedValue(mockDashboard);

        const response = await request(app)
          .get('/api/admin/dashboard')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('overview');
        expect(response.body).toHaveProperty('recentActivity');
        expect(response.body).toHaveProperty('alerts');
      });
    });
  });

  describe('Security & Audit', () => {
    describe('GET /api/admin/audit-logs', () => {
      it('should return audit logs', async () => {
        const mockLogs = [
          {
            id: '1',
            action: 'user_role_change',
            actor: 'admin@example.com',
            target: 'user1@example.com',
            details: { oldRole: 'user', newRole: 'premium' },
            timestamp: new Date()
          }
        ];

        (AdminService.prototype.getAuditLogs as jest.Mock).mockResolvedValue({
          logs: mockLogs,
          total: 1,
          page: 1,
          pageSize: 20
        });

        const response = await request(app)
          .get('/api/admin/audit-logs')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('logs');
      });
    });

    describe('GET /api/admin/security/threats', () => {
      it('should return security threats', async () => {
        const mockThreats = {
          active: [
            {
              id: '1',
              type: 'brute_force',
              source: '192.168.1.1',
              attempts: 50,
              blocked: true,
              timestamp: new Date()
            }
          ],
          stats: {
            blockedIPs: 15,
            suspiciousTransactions: 3,
            failedLogins: 125
          }
        };

        (AdminService.prototype.getSecurityThreats as jest.Mock).mockResolvedValue(mockThreats);

        const response = await request(app)
          .get('/api/admin/security/threats')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('active');
        expect(response.body).toHaveProperty('stats');
      });
    });
  });

  describe('Authorization', () => {
    it('should require admin role for all endpoints', async () => {
      // Mock non-admin user
      (authenticateToken as jest.Mock).mockImplementation((req, res, next) => {
        req.user = { id: '789', email: 'user@example.com', role: 'user' };
        next();
      });

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', 'Bearer mocktoken');

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Admin access required');
    });
  });
});