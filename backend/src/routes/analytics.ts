import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { AnalyticsService } from '../services/analyticsService';
import { TransactionStatsService } from '../services/transactionStatsService';
import { PerformanceMetricsService } from '../services/performanceMetricsService';
import { prisma } from '../utils/prisma';
import { redis } from '../utils/redis';

const router = Router();

// Initialize services
const analyticsService = new AnalyticsService({
  redis,
  prisma,
  retention: {
    raw: 7, // 7 days
    aggregated: 90, // 90 days
  },
  aggregation: {
    intervals: ['1m', '5m', '1h', '1d'],
    enabled: true,
  },
});

const statsService = new TransactionStatsService({
  prisma,
  redis,
  provider: null as any, // Will be injected from main app
  updateInterval: 60000, // 1 minute
});

const metricsService = new PerformanceMetricsService({
  redis,
  collectInterval: 30000, // 30 seconds
  retention: {
    raw: 86400, // 1 day
    aggregated: 604800, // 7 days
  },
  thresholds: {
    cpu: 80,
    memory: 85,
    responseTime: 1000,
    errorRate: 5,
  },
});

// Validation schemas
const dateRangeSchema = z.object({
  startDate: z.string().transform(str => new Date(str)),
  endDate: z.string().transform(str => new Date(str)),
});

const paginationSchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
});

// User Analytics
router.get('/users/behavior', authenticate, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = dateRangeSchema.parse({
      startDate: req.query.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: req.query.endDate || new Date().toISOString(),
    });

    const eventTypes = req.query.eventTypes
      ? (req.query.eventTypes as string).split(',')
      : undefined;

    const analytics = await analyticsService.getUserBehaviorAnalytics({
      startDate,
      endDate,
      eventTypes,
      userId: req.query.userId as string,
    });

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch user behavior analytics',
    });
  }
});

router.get('/users/:userId/metrics', authenticate, async (req: Request, res: Response) => {
  try {
    const metrics = await analyticsService.getUserMetrics(req.params.userId);
    
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch user metrics',
    });
  }
});

// Transaction Analytics
router.get('/transactions/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const timeRange = req.query.startDate && req.query.endDate
      ? dateRangeSchema.parse(req.query)
      : undefined;

    const stats = await statsService.getTransactionStats(timeRange);
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch transaction stats',
    });
  }
});

router.get('/transactions/trends', authenticate, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = dateRangeSchema.parse({
      startDate: req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: req.query.endDate || new Date().toISOString(),
    });

    const interval = (req.query.interval as 'hour' | 'day' | 'week' | 'month') || 'day';
    const metrics = req.query.metrics
      ? (req.query.metrics as string).split(',') as ('count' | 'volume' | 'gas' | 'users')[]
      : ['count', 'volume'];

    const trends = await statsService.getTransactionTrends({
      interval,
      startDate,
      endDate,
      metrics,
    });
    
    res.json({
      success: true,
      data: trends,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch transaction trends',
    });
  }
});

// Token Analytics
router.get('/tokens/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const tokenAddress = req.query.token as string;
    const stats = await statsService.getTokenStats(tokenAddress);
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch token stats',
    });
  }
});

// Gas Analytics
router.get('/gas/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const stats = await statsService.getGasStats();
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch gas stats',
    });
  }
});

// System Performance
router.get('/system/metrics', authenticate, async (req: Request, res: Response) => {
  try {
    const current = req.query.current === 'true';
    
    if (current) {
      const metrics = await metricsService.getCurrentMetrics();
      res.json({
        success: true,
        data: metrics,
      });
    } else {
      const { startDate, endDate } = dateRangeSchema.parse({
        startDate: req.query.startDate || new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        endDate: req.query.endDate || new Date().toISOString(),
      });
      
      const historical = await metricsService.getHistoricalMetrics(startDate, endDate);
      res.json({
        success: true,
        data: historical,
      });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch system metrics',
    });
  }
});

router.get('/system/alerts', authenticate, async (req: Request, res: Response) => {
  try {
    const alerts = await metricsService.getActiveAlerts();
    
    res.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch system alerts',
    });
  }
});

// Dashboard Overview
router.get('/dashboard/overview', authenticate, async (req: Request, res: Response) => {
  try {
    const [systemMetrics, transactionStats, userBehavior, activeAlerts] = await Promise.all([
      analyticsService.getSystemMetrics(),
      statsService.getTransactionStats(),
      analyticsService.getUserBehaviorAnalytics({
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: new Date(),
      }),
      metricsService.getActiveAlerts(),
    ]);

    res.json({
      success: true,
      data: {
        system: systemMetrics,
        transactions: transactionStats,
        userActivity: {
          totalEvents: userBehavior.totalEvents,
          uniqueUsers: userBehavior.uniqueUsers,
          topEvents: userBehavior.topEvents.slice(0, 5),
        },
        alerts: activeAlerts,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch dashboard overview',
    });
  }
});

// Real-time Data Endpoints
router.get('/realtime/transactions', authenticate, async (req: Request, res: Response) => {
  try {
    // Get last 100 transactions
    const transactions = await prisma.transaction.findMany({
      take: 100,
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        hash: true,
        from: true,
        to: true,
        value: true,
        token: true,
        status: true,
        timestamp: true,
      },
    });

    res.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch real-time transactions',
    });
  }
});

// Export data endpoints
router.get('/export/transactions', authenticate, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = dateRangeSchema.parse(req.query);
    const format = (req.query.format as 'csv' | 'json') || 'json';

    const transactions = await prisma.transaction.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    if (format === 'csv') {
      const csv = convertToCSV(transactions);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: transactions,
      });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export transactions',
    });
  }
});

// Helper function to convert data to CSV
function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');
  
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      return typeof value === 'string' && value.includes(',')
        ? `"${value}"`
        : value;
    }).join(',');
  });
  
  return [csvHeaders, ...csvRows].join('\n');
}

// Track events (for SDK integration)
router.post('/events/track', authenticate, async (req: Request, res: Response) => {
  try {
    const eventSchema = z.object({
      userId: z.string(),
      eventType: z.string(),
      properties: z.record(z.any()).optional(),
      sessionId: z.string().optional(),
      deviceInfo: z.object({
        userAgent: z.string().optional(),
        platform: z.string().optional(),
        browser: z.string().optional(),
        version: z.string().optional(),
      }).optional(),
    });

    const event = eventSchema.parse(req.body);
    
    await analyticsService.trackUserEvent({
      ...event,
      timestamp: new Date(),
    });

    res.json({
      success: true,
      message: 'Event tracked successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to track event',
    });
  }
});

// Admin endpoints
router.get('/admin/summary', authenticate, async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const summary = await Promise.all([
      prisma.user.count(),
      prisma.transaction.count(),
      prisma.transaction.aggregate({
        _sum: { value: true },
        where: { status: 'confirmed' },
      }),
      analyticsService.getSystemMetrics(),
    ]);

    res.json({
      success: true,
      data: {
        totalUsers: summary[0],
        totalTransactions: summary[1],
        totalVolume: summary[2]._sum.value || '0',
        currentMetrics: summary[3],
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch admin summary',
    });
  }
});

export const analyticsRouter = router;