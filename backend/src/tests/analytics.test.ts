import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import analyticsRoutes from '../routes/analytics';
import { authenticateToken } from '../middleware/auth';
import { AnalyticsService } from '../services/analyticsService';
import { TransactionStatsService } from '../services/transactionStatsService';
import { PerformanceMetricsService } from '../services/performanceMetricsService';

// Mock dependencies
jest.mock('../middleware/auth');
jest.mock('../services/analyticsService');
jest.mock('../services/transactionStatsService');
jest.mock('../services/performanceMetricsService');

const app = express();
app.use(express.json());
app.use('/api/analytics', analyticsRoutes);

// Mock authenticated user
const mockUser = {
  id: '123',
  email: 'test@example.com',
  role: 'user'
};

const mockAdmin = {
  id: '456',
  email: 'admin@example.com',
  role: 'admin'
};

describe('Analytics Routes', () => {
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

  describe('User Analytics', () => {
    describe('GET /api/analytics/users/activity', () => {
      it('should return user activity data', async () => {
        const mockActivity = {
          daily: {
            activeUsers: 150,
            newUsers: 20,
            returningUsers: 130,
            sessions: 450
          },
          weekly: {
            activeUsers: 800,
            newUsers: 120,
            returningUsers: 680,
            sessions: 2500
          },
          trends: {
            growth: 0.15,
            retention: 0.85
          }
        };

        (AnalyticsService.prototype.getUserActivity as jest.Mock).mockResolvedValue(mockActivity);

        const response = await request(app)
          .get('/api/analytics/users/activity')
          .set('Authorization', 'Bearer mocktoken')
          .query({ period: 'weekly' });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject(mockActivity);
      });
    });

    describe('GET /api/analytics/users/cohorts', () => {
      it('should return cohort analysis', async () => {
        const mockCohorts = {
          cohorts: [
            {
              name: '2023-01',
              size: 100,
              retention: [100, 85, 70, 65, 60, 58, 55]
            },
            {
              name: '2023-02',
              size: 120,
              retention: [100, 88, 75, 70, 68]
            }
          ],
          averageRetention: {
            day1: 0.87,
            day7: 0.72,
            day30: 0.60
          }
        };

        (AnalyticsService.prototype.getCohortAnalysis as jest.Mock).mockResolvedValue(mockCohorts);

        const response = await request(app)
          .get('/api/analytics/users/cohorts')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('cohorts');
        expect(response.body.cohorts).toHaveLength(2);
      });
    });

    describe('GET /api/analytics/users/funnel', () => {
      it('should return funnel analysis', async () => {
        const mockFunnel = {
          steps: [
            { name: 'Registration', users: 1000, percentage: 100 },
            { name: 'Wallet Creation', users: 800, percentage: 80 },
            { name: 'First Transaction', users: 600, percentage: 60 },
            { name: 'Regular User', users: 450, percentage: 45 }
          ],
          conversionRate: 0.45,
          dropoffPoints: [
            { step: 'Registration -> Wallet Creation', dropoff: 0.20 },
            { step: 'Wallet Creation -> First Transaction', dropoff: 0.25 }
          ]
        };

        (AnalyticsService.prototype.getFunnelAnalysis as jest.Mock).mockResolvedValue(mockFunnel);

        const response = await request(app)
          .get('/api/analytics/users/funnel')
          .set('Authorization', 'Bearer mocktoken')
          .query({ funnel: 'onboarding' });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('steps');
        expect(response.body).toHaveProperty('conversionRate');
      });
    });

    describe('POST /api/analytics/users/events', () => {
      it('should track user event', async () => {
        const response = await request(app)
          .post('/api/analytics/users/events')
          .set('Authorization', 'Bearer mocktoken')
          .send({
            event: 'button_click',
            properties: {
              button: 'send_transaction',
              page: 'wallet'
            }
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('success', true);
        expect(AnalyticsService.prototype.trackUserEvent).toHaveBeenCalledWith({
          userId: mockUser.id,
          event: 'button_click',
          properties: expect.any(Object),
          timestamp: expect.any(Date)
        });
      });
    });
  });

  describe('Transaction Analytics', () => {
    describe('GET /api/analytics/transactions/volume', () => {
      it('should return transaction volume data', async () => {
        const mockVolume = {
          hourly: [
            { hour: '00:00', count: 45, volume: '150000000000000000000' },
            { hour: '01:00', count: 38, volume: '120000000000000000000' }
          ],
          daily: {
            count: 1200,
            volume: '4500000000000000000000',
            averageValue: '3750000000000000000'
          },
          trends: {
            volumeChange: 0.12,
            countChange: 0.08
          }
        };

        (TransactionStatsService.prototype.getVolumeStats as jest.Mock).mockResolvedValue(mockVolume);

        const response = await request(app)
          .get('/api/analytics/transactions/volume')
          .set('Authorization', 'Bearer mocktoken')
          .query({ timeframe: 'daily' });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject(mockVolume);
      });
    });

    describe('GET /api/analytics/transactions/gas', () => {
      it('should return gas usage statistics', async () => {
        const mockGasStats = {
          average: '25000000000',
          median: '20000000000',
          percentiles: {
            p25: '15000000000',
            p75: '30000000000',
            p95: '50000000000'
          },
          trends: {
            hourly: [
              { hour: '00:00', average: '25000000000' },
              { hour: '01:00', average: '22000000000' }
            ]
          },
          totalSpent: '50000000000000000000'
        };

        (TransactionStatsService.prototype.getGasStats as jest.Mock).mockResolvedValue(mockGasStats);

        const response = await request(app)
          .get('/api/analytics/transactions/gas')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('average');
        expect(response.body).toHaveProperty('percentiles');
      });
    });

    describe('GET /api/analytics/transactions/success-rate', () => {
      it('should return transaction success rates', async () => {
        const mockSuccessRate = {
          overall: 0.95,
          byType: {
            transfer: 0.98,
            contract: 0.92,
            swap: 0.89
          },
          failureReasons: [
            { reason: 'Insufficient funds', count: 45, percentage: 0.35 },
            { reason: 'Gas too low', count: 30, percentage: 0.23 },
            { reason: 'Contract error', count: 54, percentage: 0.42 }
          ],
          trends: {
            daily: [0.94, 0.95, 0.93, 0.96, 0.95, 0.94, 0.95]
          }
        };

        (TransactionStatsService.prototype.getSuccessRates as jest.Mock).mockResolvedValue(mockSuccessRate);

        const response = await request(app)
          .get('/api/analytics/transactions/success-rate')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('overall');
        expect(response.body).toHaveProperty('failureReasons');
      });
    });

    describe('GET /api/analytics/transactions/tokens', () => {
      it('should return token-specific statistics', async () => {
        const mockTokenStats = {
          tokens: [
            {
              address: '0xusdc',
              symbol: 'USDC',
              transactionCount: 500,
              volume: '1500000000000',
              uniqueUsers: 150
            },
            {
              address: '0xusdt',
              symbol: 'USDT',
              transactionCount: 300,
              volume: '900000000000',
              uniqueUsers: 100
            }
          ],
          mostActive: 'USDC',
          totalVolume: '2400000000000'
        };

        (TransactionStatsService.prototype.getTokenStats as jest.Mock).mockResolvedValue(mockTokenStats);

        const response = await request(app)
          .get('/api/analytics/transactions/tokens')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('tokens');
        expect(response.body.tokens).toHaveLength(2);
      });
    });
  });

  describe('System Analytics', () => {
    describe('GET /api/analytics/system/performance', () => {
      it('should return system performance metrics', async () => {
        const mockPerformance = {
          uptime: 0.999,
          cpu: {
            usage: 45.2,
            load: [1.2, 1.5, 1.3]
          },
          memory: {
            used: 2147483648,
            total: 4294967296,
            percentage: 50
          },
          disk: {
            used: 10737418240,
            total: 107374182400,
            percentage: 10
          },
          response: {
            average: 120,
            p95: 250,
            p99: 500
          }
        };

        (PerformanceMetricsService.prototype.getSystemMetrics as jest.Mock).mockResolvedValue(mockPerformance);

        const response = await request(app)
          .get('/api/analytics/system/performance')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('cpu');
        expect(response.body).toHaveProperty('memory');
        expect(response.body).toHaveProperty('uptime');
      });
    });

    describe('GET /api/analytics/system/errors', () => {
      it('should return error analytics', async () => {
        const mockErrors = {
          total: 245,
          byType: {
            '4xx': 150,
            '5xx': 95
          },
          topErrors: [
            { code: 404, count: 80, message: 'Not Found' },
            { code: 401, count: 50, message: 'Unauthorized' },
            { code: 500, count: 45, message: 'Internal Server Error' }
          ],
          errorRate: 0.002,
          trends: {
            hourly: [2, 3, 1, 5, 2, 3, 4, 2]
          }
        };

        (PerformanceMetricsService.prototype.getErrorMetrics as jest.Mock).mockResolvedValue(mockErrors);

        const response = await request(app)
          .get('/api/analytics/system/errors')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('total');
        expect(response.body).toHaveProperty('topErrors');
      });
    });

    describe('GET /api/analytics/system/database', () => {
      it('should return database performance metrics', async () => {
        const mockDbMetrics = {
          connections: {
            active: 10,
            idle: 5,
            total: 15,
            max: 100
          },
          queries: {
            slow: 12,
            average: 5.2,
            total: 45000
          },
          performance: {
            readLatency: 2.1,
            writeLatency: 4.5,
            cacheHitRate: 0.92
          }
        };

        (PerformanceMetricsService.prototype.getDatabaseMetrics as jest.Mock).mockResolvedValue(mockDbMetrics);

        const response = await request(app)
          .get('/api/analytics/system/database')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('connections');
        expect(response.body).toHaveProperty('performance');
      });
    });
  });

  describe('Dashboard Analytics', () => {
    describe('GET /api/analytics/dashboard/summary', () => {
      it('should return admin dashboard summary', async () => {
        (authenticateToken as jest.Mock).mockImplementation((req, res, next) => {
          req.user = mockAdmin;
          next();
        });

        const mockSummary = {
          users: {
            total: 5000,
            active: 1200,
            new: 150
          },
          transactions: {
            total: 15000,
            volume: '50000000000000000000000',
            pending: 25
          },
          system: {
            health: 'healthy',
            uptime: 0.999,
            alerts: 2
          },
          revenue: {
            daily: '500000000000000000',
            monthly: '15000000000000000000'
          }
        };

        // Mock all service calls
        (AnalyticsService.prototype.getDashboardSummary as jest.Mock).mockResolvedValue(mockSummary);

        const response = await request(app)
          .get('/api/analytics/dashboard/summary')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('users');
        expect(response.body).toHaveProperty('transactions');
        expect(response.body).toHaveProperty('system');
      });

      it('should require admin role', async () => {
        const response = await request(app)
          .get('/api/analytics/dashboard/summary')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(403);
      });
    });

    describe('GET /api/analytics/dashboard/realtime', () => {
      it('should return real-time metrics', async () => {
        const mockRealtime = {
          activeUsers: 342,
          transactionsPerMinute: 12,
          gasPrice: '25000000000',
          systemLoad: 0.65,
          timestamp: new Date().toISOString()
        };

        (AnalyticsService.prototype.getRealtimeMetrics as jest.Mock).mockResolvedValue(mockRealtime);

        const response = await request(app)
          .get('/api/analytics/dashboard/realtime')
          .set('Authorization', 'Bearer mocktoken');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('activeUsers');
        expect(response.body).toHaveProperty('transactionsPerMinute');
      });
    });
  });

  describe('Export Endpoints', () => {
    describe('GET /api/analytics/export', () => {
      it('should export analytics data as CSV', async () => {
        const mockCSV = 'date,users,transactions,volume\n2023-01-01,100,500,1500000';
        
        (AnalyticsService.prototype.exportData as jest.Mock).mockResolvedValue(mockCSV);

        const response = await request(app)
          .get('/api/analytics/export')
          .set('Authorization', 'Bearer mocktoken')
          .query({ 
            type: 'users',
            format: 'csv',
            startDate: '2023-01-01',
            endDate: '2023-01-31'
          });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/csv');
      });

      it('should validate date range', async () => {
        const response = await request(app)
          .get('/api/analytics/export')
          .set('Authorization', 'Bearer mocktoken')
          .query({ 
            type: 'users',
            format: 'csv',
            startDate: '2023-01-31',
            endDate: '2023-01-01' // End before start
          });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });
    });
  });
});