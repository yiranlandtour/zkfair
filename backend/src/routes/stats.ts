import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get overall system statistics
router.get('/system', async (req, res) => {
  try {
    const stats = await prisma.systemStats.findFirst({
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    if (!stats) {
      return res.json({
        totalUserOps: 0,
        totalSmartWallets: 0,
        totalGasSponsored: '0',
        totalTokensCollected: {},
        lastBlockProcessed: 0
      });
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get smart wallet statistics
router.get('/wallets', async (req, res) => {
  try {
    const totalWallets = await prisma.smartWallet.count();
    const deployedWallets = await prisma.smartWallet.count({
      where: { isDeployed: true }
    });
    
    const recentWallets = await prisma.smartWallet.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        address: true,
        owner: true,
        isDeployed: true,
        createdAt: true
      }
    });
    
    res.json({
      total: totalWallets,
      deployed: deployedWallets,
      pending: totalWallets - deployedWallets,
      recent: recentWallets
    });
  } catch (error) {
    console.error('Error fetching wallet stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get gas statistics
router.get('/gas', async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    
    let since = new Date();
    switch (period) {
      case '1h':
        since.setHours(since.getHours() - 1);
        break;
      case '24h':
        since.setHours(since.getHours() - 24);
        break;
      case '7d':
        since.setDate(since.getDate() - 7);
        break;
      case '30d':
        since.setDate(since.getDate() - 30);
        break;
    }
    
    const gasStats = await prisma.userOperation.aggregate({
      where: {
        timestamp: { gte: since }
      },
      _avg: {
        actualGasCost: true,
        actualGasUsed: true
      },
      _sum: {
        actualGasCost: true
      },
      _count: true
    });
    
    const paymasterStats = await prisma.paymasterTransaction.groupBy({
      by: ['token'],
      where: {
        timestamp: { gte: since }
      },
      _sum: {
        tokenAmount: true,
        ethCost: true
      },
      _count: true
    });
    
    res.json({
      period,
      totalOperations: gasStats._count,
      totalGasSponsored: gasStats._sum.actualGasCost || '0',
      averageGasCost: gasStats._avg.actualGasCost || '0',
      averageGasUsed: gasStats._avg.actualGasUsed || '0',
      paymasterStats
    });
  } catch (error) {
    console.error('Error fetching gas stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bundler performance statistics
router.get('/bundler', async (req, res) => {
  try {
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    
    const recentOps = await prisma.userOperation.count({
      where: {
        timestamp: { gte: oneHourAgo }
      }
    });
    
    const successRate = await prisma.userOperation.groupBy({
      by: ['success'],
      where: {
        timestamp: { gte: oneHourAgo }
      },
      _count: true
    });
    
    const successCount = successRate.find(r => r.success)?._count || 0;
    const failCount = successRate.find(r => !r.success)?._count || 0;
    const totalCount = successCount + failCount;
    
    res.json({
      opsPerHour: recentOps,
      successRate: totalCount > 0 ? (successCount / totalCount) * 100 : 100,
      totalSuccess: successCount,
      totalFailed: failCount
    });
  } catch (error) {
    console.error('Error fetching bundler stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const statsRouter = router;