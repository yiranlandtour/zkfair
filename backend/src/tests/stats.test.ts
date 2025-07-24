import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import statsRoutes from '../routes/stats';
import { StatsService } from '../services/statsService';

// Mock dependencies
jest.mock('../services/statsService');

const app = express();
app.use(express.json());
app.use('/api/stats', statsRoutes);

describe('Stats Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/stats/overview', () => {
    it('should return platform overview statistics', async () => {
      const mockOverview = {
        platform: {
          totalUsers: 5000,
          activeUsers24h: 1200,
          totalWallets: 4500,
          deployedWallets: 3800
        },
        transactions: {
          total: 150000,
          volume24h: '50000000000000000000000',
          averageGasCost: '2000000000000000',
          successRate: 0.95
        },
        tokens: {
          supportedTokens: 5,
          totalValueLocked: '1500000000000',
          topToken: 'USDC'
        },
        growth: {
          userGrowth7d: 0.12,
          transactionGrowth7d: 0.08,
          volumeGrowth7d: 0.15
        }
      };

      (StatsService.prototype.getOverview as jest.Mock).mockResolvedValue(mockOverview);

      const response = await request(app).get('/api/stats/overview');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('platform');
      expect(response.body).toHaveProperty('transactions');
      expect(response.body).toHaveProperty('growth');
    });
  });

  describe('GET /api/stats/transactions', () => {
    it('should return transaction statistics with default timeframe', async () => {
      const mockTxStats = {
        timeframe: '24h',
        total: 5000,
        volume: '15000000000000000000000',
        averageValue: '3000000000000000000',
        medianValue: '1000000000000000000',
        gasStats: {
          average: '25000000000',
          min: '15000000000',
          max: '100000000000'
        },
        hourlyData: [
          { hour: 0, count: 180, volume: '500000000000000000000' },
          { hour: 1, count: 165, volume: '450000000000000000000' }
        ]
      };

      (StatsService.prototype.getTransactionStats as jest.Mock).mockResolvedValue(mockTxStats);

      const response = await request(app).get('/api/stats/transactions');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('timeframe', '24h');
      expect(response.body).toHaveProperty('hourlyData');
    });

    it('should accept custom timeframe parameter', async () => {
      const mockWeeklyStats = {
        timeframe: '7d',
        total: 35000,
        volume: '105000000000000000000000',
        dailyData: Array(7).fill(null).map((_, i) => ({
          day: i,
          count: 5000,
          volume: '15000000000000000000000'
        }))
      };

      (StatsService.prototype.getTransactionStats as jest.Mock).mockResolvedValue(mockWeeklyStats);

      const response = await request(app)
        .get('/api/stats/transactions')
        .query({ timeframe: '7d' });

      expect(response.status).toBe(200);
      expect(response.body.timeframe).toBe('7d');
      expect(response.body).toHaveProperty('dailyData');
    });
  });

  describe('GET /api/stats/gas', () => {
    it('should return gas price statistics', async () => {
      const mockGasStats = {
        current: {
          slow: '15000000000',
          standard: '25000000000',
          fast: '40000000000',
          instant: '60000000000'
        },
        history: {
          '1h': [
            { timestamp: Date.now() - 3600000, average: '20000000000' },
            { timestamp: Date.now() - 3000000, average: '22000000000' }
          ],
          '24h': Array(24).fill(null).map((_, i) => ({
            hour: i,
            average: '25000000000',
            min: '15000000000',
            max: '50000000000'
          }))
        },
        predictions: {
          next1h: '28000000000',
          next6h: '30000000000',
          next24h: '26000000000'
        },
        network: {
          baseFee: '20000000000',
          priorityFee: '2000000000',
          blockUtilization: 0.85
        }
      };

      (StatsService.prototype.getGasStats as jest.Mock).mockResolvedValue(mockGasStats);

      const response = await request(app).get('/api/stats/gas');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('current');
      expect(response.body).toHaveProperty('predictions');
      expect(response.body).toHaveProperty('network');
    });
  });

  describe('GET /api/stats/users', () => {
    it('should return user statistics', async () => {
      const mockUserStats = {
        total: 5000,
        active: {
          daily: 1200,
          weekly: 2500,
          monthly: 3800
        },
        new: {
          today: 50,
          thisWeek: 280,
          thisMonth: 950
        },
        retention: {
          day1: 0.85,
          day7: 0.65,
          day30: 0.45
        },
        distribution: {
          byCountry: [
            { country: 'US', count: 1500, percentage: 0.30 },
            { country: 'UK', count: 800, percentage: 0.16 },
            { country: 'JP', count: 600, percentage: 0.12 }
          ],
          byWalletType: {
            smart: 4200,
            eoa: 800
          }
        }
      };

      (StatsService.prototype.getUserStats as jest.Mock).mockResolvedValue(mockUserStats);

      const response = await request(app).get('/api/stats/users');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('retention');
      expect(response.body).toHaveProperty('distribution');
    });
  });

  describe('GET /api/stats/tokens', () => {
    it('should return token statistics', async () => {
      const mockTokenStats = {
        tokens: [
          {
            address: '0xusdc',
            symbol: 'USDC',
            name: 'USD Coin',
            totalSupply: '1000000000000',
            holders: 2500,
            transactions24h: 1200,
            volume24h: '5000000000000',
            price: 1.0
          },
          {
            address: '0xusdt',
            symbol: 'USDT',
            name: 'Tether',
            totalSupply: '800000000000',
            holders: 1800,
            transactions24h: 900,
            volume24h: '3500000000000',
            price: 0.999
          }
        ],
        tvl: {
          total: '1800000000000',
          change24h: 0.05
        },
        topMovers: {
          gainers: [
            { symbol: 'WETH', change: 0.15 }
          ],
          losers: [
            { symbol: 'DAI', change: -0.002 }
          ]
        }
      };

      (StatsService.prototype.getTokenStats as jest.Mock).mockResolvedValue(mockTokenStats);

      const response = await request(app).get('/api/stats/tokens');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tokens');
      expect(response.body).toHaveProperty('tvl');
      expect(response.body.tokens).toHaveLength(2);
    });
  });

  describe('GET /api/stats/performance', () => {
    it('should return system performance metrics', async () => {
      const mockPerformance = {
        api: {
          uptime: 0.999,
          avgResponseTime: 45,
          requestsPerMinute: 250,
          errorRate: 0.001
        },
        blockchain: {
          blockHeight: 12345678,
          avgBlockTime: 12.5,
          pendingTransactions: 125,
          nodeSync: true
        },
        infrastructure: {
          cpu: {
            usage: 35.5,
            cores: 8
          },
          memory: {
            used: 4294967296,
            total: 8589934592,
            percentage: 50
          },
          disk: {
            used: 53687091200,
            total: 107374182400,
            percentage: 50
          }
        },
        bundler: {
          queueSize: 25,
          processingRate: 10,
          successRate: 0.98
        }
      };

      (StatsService.prototype.getPerformanceStats as jest.Mock).mockResolvedValue(mockPerformance);

      const response = await request(app).get('/api/stats/performance');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('api');
      expect(response.body).toHaveProperty('blockchain');
      expect(response.body).toHaveProperty('infrastructure');
    });
  });

  describe('GET /api/stats/revenue', () => {
    it('should return revenue statistics', async () => {
      const mockRevenue = {
        total: {
          allTime: '50000000000000000000',
          thisMonth: '5000000000000000000',
          today: '200000000000000000'
        },
        sources: {
          transactionFees: '30000000000000000000',
          paymasterFees: '15000000000000000000',
          premiumSubscriptions: '5000000000000000000'
        },
        breakdown: {
          daily: Array(30).fill(null).map((_, i) => ({
            day: i,
            revenue: '166666666666666666',
            transactions: 500
          }))
        },
        projections: {
          nextMonth: '6000000000000000000',
          nextQuarter: '20000000000000000000'
        }
      };

      (StatsService.prototype.getRevenueStats as jest.Mock).mockResolvedValue(mockRevenue);

      const response = await request(app).get('/api/stats/revenue');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('sources');
      expect(response.body).toHaveProperty('projections');
    });
  });

  describe('GET /api/stats/network', () => {
    it('should return network statistics', async () => {
      const mockNetwork = {
        chainId: 67890,
        name: 'ZKFair L2',
        blockNumber: 12345678,
        blockTime: 2,
        tps: {
          current: 150,
          max: 1000,
          average24h: 120
        },
        nodes: {
          total: 50,
          active: 48,
          validators: 21
        },
        zkProofs: {
          generated: 50000,
          verified: 49950,
          avgGenerationTime: 2.5,
          successRate: 0.999
        },
        celestia: {
          connected: true,
          dataAvailability: 0.999,
          latency: 150
        }
      };

      (StatsService.prototype.getNetworkStats as jest.Mock).mockResolvedValue(mockNetwork);

      const response = await request(app).get('/api/stats/network');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('chainId');
      expect(response.body).toHaveProperty('tps');
      expect(response.body).toHaveProperty('zkProofs');
      expect(response.body).toHaveProperty('celestia');
    });
  });

  describe('GET /api/stats/live', () => {
    it('should return live statistics for dashboard', async () => {
      const mockLive = {
        timestamp: new Date().toISOString(),
        users: {
          online: 342,
          active: 125
        },
        transactions: {
          pending: 15,
          perMinute: 12,
          volume1h: '5000000000000000000'
        },
        gas: {
          current: '25000000000',
          trend: 'rising'
        },
        system: {
          health: 'healthy',
          alerts: 0
        }
      };

      (StatsService.prototype.getLiveStats as jest.Mock).mockResolvedValue(mockLive);

      const response = await request(app).get('/api/stats/live');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('transactions');
    });
  });

  describe('GET /api/stats/historical', () => {
    it('should return historical data with pagination', async () => {
      const mockHistorical = {
        metric: 'transactions',
        timeframe: '30d',
        data: Array(30).fill(null).map((_, i) => ({
          date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
          value: 5000 - i * 50,
          volume: '15000000000000000000000'
        })),
        summary: {
          average: 4500,
          min: 3500,
          max: 5000,
          trend: -0.05
        }
      };

      (StatsService.prototype.getHistoricalData as jest.Mock).mockResolvedValue(mockHistorical);

      const response = await request(app)
        .get('/api/stats/historical')
        .query({ 
          metric: 'transactions',
          timeframe: '30d'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('metric', 'transactions');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveLength(30);
    });

    it('should validate timeframe parameter', async () => {
      const response = await request(app)
        .get('/api/stats/historical')
        .query({ 
          metric: 'transactions',
          timeframe: 'invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Caching', () => {
    it('should use cache for frequently requested data', async () => {
      const mockCachedData = {
        cached: true,
        data: { total: 5000 }
      };

      (StatsService.prototype.getOverview as jest.Mock).mockResolvedValue(mockCachedData);

      // First request
      const response1 = await request(app).get('/api/stats/overview');
      expect(response1.status).toBe(200);

      // Second request (should use cache)
      const response2 = await request(app).get('/api/stats/overview');
      expect(response2.status).toBe(200);

      // Verify service was called only once
      expect(StatsService.prototype.getOverview).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      (StatsService.prototype.getOverview as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app).get('/api/stats/overview');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Failed to fetch statistics');
    });
  });
});