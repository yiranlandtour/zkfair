import { Router } from 'express';
import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Health check endpoint
router.get('/', async (req, res) => {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.L2_RPC_URL);
    
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check L2 node connection
    const blockNumber = await provider.getBlockNumber();
    const gasPrice = await provider.getFeeData();
    
    // Check last processed block
    const stats = await prisma.systemStats.findFirst({
      orderBy: { updatedAt: 'desc' }
    });
    
    const lastProcessedBlock = stats?.lastBlockProcessed || 0;
    const blocksBehind = blockNumber - lastProcessedBlock;
    
    const status = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        l2Node: 'connected',
        eventListener: blocksBehind < 10 ? 'synced' : 'syncing'
      },
      metrics: {
        currentBlock: blockNumber,
        lastProcessedBlock,
        blocksBehind,
        gasPrice: gasPrice.gasPrice?.toString() || '0'
      }
    };
    
    res.json(status);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Readiness check
router.get('/ready', async (req, res) => {
  try {
    // Check if all critical services are ready
    await prisma.$queryRaw`SELECT 1`;
    
    const provider = new ethers.JsonRpcProvider(process.env.L2_RPC_URL);
    await provider.getBlockNumber();
    
    res.json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false });
  }
});

// Liveness check
router.get('/live', (req, res) => {
  res.json({ alive: true });
});

export const healthRouter = router;