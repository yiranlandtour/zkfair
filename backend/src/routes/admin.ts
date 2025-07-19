import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { ethers } from 'ethers';

const router = Router();
const prisma = new PrismaClient();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireRole('admin'));

// Dashboard stats
router.get('/dashboard', async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalWallets,
      deployedWallets,
      totalTransactions,
      recentTransactions
    ] = await Promise.all([
      prisma.user.count(),
      prisma.smartWallet.count(),
      prisma.smartWallet.count({ where: { deployed: true } }),
      prisma.transaction.count(),
      prisma.transaction.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    const totalValueLocked = await prisma.$queryRaw`
      SELECT SUM(CAST(value AS DECIMAL)) as total
      FROM "Transaction"
      WHERE status = 'SUCCESS'
    `;

    res.json({
      stats: {
        totalUsers,
        totalWallets,
        deployedWallets,
        totalTransactions,
        recentTransactions,
        totalValueLocked: totalValueLocked[0]?.total || '0'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Users management
const userFilterSchema = z.object({
  page: z.string().optional().transform(val => parseInt(val || '1')),
  limit: z.string().optional().transform(val => parseInt(val || '10')),
  search: z.string().optional(),
  status: z.enum(['all', 'active', 'inactive', 'suspended']).optional(),
});

router.get('/users', validateRequest(userFilterSchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit, search, status } = req.query as any;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (search) {
      where.OR = [
        { address: { contains: search, mode: 'insensitive' } },
        { smartWallets: { some: { address: { contains: search, mode: 'insensitive' } } } }
      ];
    }

    if (status && status !== 'all') {
      where.status = status.toUpperCase();
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          smartWallets: true,
          _count: {
            select: { transactions: true }
          }
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    const formattedUsers = users.map(user => ({
      id: user.id,
      address: user.address,
      role: user.role,
      createdAt: user.createdAt,
      lastActive: user.lastActive,
      smartWalletAddress: user.smartWallets[0]?.address,
      smartWalletDeployed: user.smartWallets[0]?.deployed || false,
      totalTransactions: user._count.transactions,
      status: user.status.toLowerCase()
    }));

    res.json({
      users: formattedUsers,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
});

// Bulk user actions
const bulkActionSchema = z.object({
  userIds: z.array(z.string()),
  action: z.enum(['activate', 'suspend', 'delete'])
});

router.post('/users/bulk-action', validateRequest(bulkActionSchema), async (req, res, next) => {
  try {
    const { userIds, action } = req.body;

    switch (action) {
      case 'activate':
        await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { status: 'ACTIVE' }
        });
        break;
      case 'suspend':
        await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { status: 'SUSPENDED' }
        });
        break;
      case 'delete':
        // Soft delete - just mark as deleted
        await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { status: 'DELETED' }
        });
        break;
    }

    res.json({ success: true, affected: userIds.length });
  } catch (error) {
    next(error);
  }
});

// Transactions
const transactionFilterSchema = z.object({
  page: z.string().optional().transform(val => parseInt(val || '1')),
  limit: z.string().optional().transform(val => parseInt(val || '20')),
  status: z.enum(['all', 'PENDING', 'SUCCESS', 'FAILED']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  address: z.string().optional(),
});

router.get('/transactions', validateRequest(transactionFilterSchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit, status, dateFrom, dateTo, address } = req.query as any;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (status && status !== 'all') {
      where.status = status;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    if (address) {
      where.OR = [
        { sender: address },
        { target: address },
        { smartWallet: { address: address } }
      ];
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          smartWallet: true,
          userOperation: true
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.transaction.count({ where })
    ]);

    res.json({
      transactions,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
});

// Transaction stats
router.get('/transactions/stats', async (req, res, next) => {
  try {
    const [total, success, failed, pending] = await Promise.all([
      prisma.transaction.count(),
      prisma.transaction.count({ where: { status: 'SUCCESS' } }),
      prisma.transaction.count({ where: { status: 'FAILED' } }),
      prisma.transaction.count({ where: { status: 'PENDING' } })
    ]);

    const volumeResult = await prisma.$queryRaw`
      SELECT 
        SUM(CAST(value AS DECIMAL)) as totalVolume,
        SUM(CAST(actualGasCost AS DECIMAL)) as totalGasCost
      FROM "Transaction"
      WHERE status = 'SUCCESS'
    `;

    res.json({
      total,
      success,
      failed,
      pending,
      totalVolume: volumeResult[0]?.totalVolume || '0',
      totalGasCost: volumeResult[0]?.totalGasCost || '0'
    });
  } catch (error) {
    next(error);
  }
});

// Export transactions
router.post('/transactions/export', validateRequest(transactionFilterSchema), async (req, res, next) => {
  try {
    // Implementation would generate CSV/Excel file
    // For now, just return mock response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    res.send('userOpHash,sender,target,value,status,timestamp\n');
  } catch (error) {
    next(error);
  }
});

// System configuration
router.get('/system/config', async (req, res, next) => {
  try {
    // In production, this would fetch from a configuration service
    res.json({
      paymasterSettings: {
        dailyLimit: '10000',
        perTransactionLimit: '100',
        whitelistEnabled: true,
        emergencyPauseEnabled: false,
      },
      bundlerSettings: {
        maxBundleSize: 10,
        bundleInterval: 30,
        priorityFeePerGas: '1.5',
        maxFeePerGas: '50',
      },
      gasSettings: {
        exchangeRate: '1.0',
        markupPercentage: 10,
        minBalance: '0.1',
        autoRefillEnabled: true,
      },
      networkSettings: {
        l2RpcUrl: process.env.L2_RPC_URL,
        celestiaLightNode: process.env.CELESTIA_NODE_URL,
        blockConfirmations: 3,
        syncInterval: 5,
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update system configuration
const systemConfigSchema = z.object({
  paymasterSettings: z.object({
    dailyLimit: z.string(),
    perTransactionLimit: z.string(),
    whitelistEnabled: z.boolean(),
    emergencyPauseEnabled: z.boolean(),
  }),
  bundlerSettings: z.object({
    maxBundleSize: z.number(),
    bundleInterval: z.number(),
    priorityFeePerGas: z.string(),
    maxFeePerGas: z.string(),
  }),
  gasSettings: z.object({
    exchangeRate: z.string(),
    markupPercentage: z.number(),
    minBalance: z.string(),
    autoRefillEnabled: z.boolean(),
  }),
  networkSettings: z.object({
    l2RpcUrl: z.string(),
    celestiaLightNode: z.string(),
    blockConfirmations: z.number(),
    syncInterval: z.number(),
  })
});

router.put('/system/config', validateRequest(systemConfigSchema), async (req, res, next) => {
  try {
    // In production, this would update configuration service
    // and possibly trigger contract updates
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// System metrics
router.get('/system/metrics', async (req, res, next) => {
  try {
    // In production, this would fetch from monitoring service
    res.json({
      cpuUsage: Math.floor(Math.random() * 100),
      memoryUsage: Math.floor(Math.random() * 100),
      diskUsage: Math.floor(Math.random() * 100),
      networkLatency: Math.floor(Math.random() * 100),
      uptime: '15d 7h 23m',
      lastBackup: '2 hours ago',
    });
  } catch (error) {
    next(error);
  }
});

// Emergency pause
router.post('/system/emergency-pause', async (req, res, next) => {
  try {
    // In production, this would:
    // 1. Call pause function on smart contracts
    // 2. Update configuration
    // 3. Send alerts
    // 4. Log the action
    
    res.json({ success: true, timestamp: new Date() });
  } catch (error) {
    next(error);
  }
});

// Smart Wallets endpoints
const smartWalletFilterSchema = z.object({
  page: z.string().optional().transform(val => parseInt(val || '1')),
  limit: z.string().optional().transform(val => parseInt(val || '20')),
  search: z.string().optional(),
  deployed: z.enum(['all', 'deployed', 'undeployed']).optional(),
});

router.get('/smart-wallets', validateRequest(smartWalletFilterSchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit, search, deployed } = req.query as any;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (search) {
      where.OR = [
        { address: { contains: search, mode: 'insensitive' } },
        { user: { address: { contains: search, mode: 'insensitive' } } }
      ];
    }

    if (deployed === 'deployed') {
      where.deployed = true;
    } else if (deployed === 'undeployed') {
      where.deployed = false;
    }

    const [wallets, total] = await Promise.all([
      prisma.smartWallet.findMany({
        where,
        include: {
          user: true,
          _count: {
            select: { transactions: true }
          }
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.smartWallet.count({ where })
    ]);

    res.json({
      wallets,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/smart-wallets/:address/refresh', async (req, res, next) => {
  try {
    const { address } = req.params;
    // In production, this would refresh balance from blockchain
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Analytics endpoints
router.get('/analytics', async (req, res, next) => {
  try {
    const { range = '7d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    switch (range) {
      case '24h':
        startDate.setHours(now.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
    }

    // In production, these would be real calculations
    res.json({
      metrics: {
        totalVolume: 2400000,
        volumeChange: 15,
        totalUsers: 12456,
        userChange: 8,
        totalTransactions: 145000,
        transactionChange: 23,
        avgGasPrice: 12,
        gasChange: -5,
      }
    });
  } catch (error) {
    next(error);
  }
});

// Security endpoints
const securityEventFilterSchema = z.object({
  timeRange: z.enum(['1h', '24h', '7d', '30d']).optional(),
  severity: z.enum(['all', 'low', 'medium', 'high', 'critical']).optional(),
});

router.get('/security/events', validateRequest(securityEventFilterSchema, 'query'), async (req, res, next) => {
  try {
    // In production, this would fetch from security monitoring service
    res.json({
      events: [
        {
          id: '1',
          type: 'auth_failure',
          severity: 'medium',
          title: 'Multiple failed login attempts',
          description: 'Detected 15 failed login attempts from IP 192.168.1.100',
          source: '192.168.1.100',
          timestamp: new Date(),
          status: 'open',
          affectedUsers: 1,
        }
      ]
    });
  } catch (error) {
    next(error);
  }
});

router.post('/security/events/:id/resolve', async (req, res, next) => {
  try {
    const { id } = req.params;
    // In production, this would update security event status
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Alert Management endpoints
router.get('/alerts/rules', async (req, res, next) => {
  try {
    // In production, this would fetch from alert management service
    res.json({
      rules: [
        {
          id: '1',
          name: 'High Transaction Failure Rate',
          description: 'Alert when transaction failure rate exceeds 10%',
          type: 'threshold',
          metric: 'transaction_failure_rate',
          condition: 'greater_than',
          threshold: 10,
          timeWindow: '5m',
          severity: 'critical',
          enabled: true,
          channels: ['email', 'slack'],
          lastTriggered: new Date(),
          triggerCount: 3,
        }
      ]
    });
  } catch (error) {
    next(error);
  }
});

router.get('/alerts/channels', async (req, res, next) => {
  try {
    res.json({
      channels: [
        {
          id: 'email',
          name: 'Email Notifications',
          type: 'email',
          config: { recipients: ['alerts@zkfair.com'] },
          enabled: true,
          createdAt: new Date(),
        }
      ]
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/alerts/rules/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    // In production, this would update alert rule
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/alerts/rules/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    // In production, this would delete alert rule
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;