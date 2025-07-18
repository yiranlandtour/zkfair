import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get transactions for a specific address
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const transactions = await prisma.userOperation.findMany({
      where: {
        sender: address.toLowerCase()
      },
      orderBy: {
        timestamp: 'desc'
      },
      skip,
      take: Number(limit)
    });
    
    const total = await prisma.userOperation.count({
      where: {
        sender: address.toLowerCase()
      }
    });
    
    res.json({
      transactions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get transaction by hash
router.get('/hash/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    
    const transaction = await prisma.userOperation.findUnique({
      where: {
        userOpHash: hash
      }
    });
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json(transaction);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get paymaster transactions
router.get('/paymaster/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { page = 1, limit = 50, token } = req.query;
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = {
      user: address.toLowerCase()
    };
    
    if (token) {
      where.token = token;
    }
    
    const transactions = await prisma.paymasterTransaction.findMany({
      where,
      orderBy: {
        timestamp: 'desc'
      },
      skip,
      take: Number(limit)
    });
    
    const total = await prisma.paymasterTransaction.count({ where });
    
    // Calculate total gas sponsored
    const stats = await prisma.paymasterTransaction.aggregate({
      where,
      _sum: {
        ethCost: true,
        tokenAmount: true
      }
    });
    
    res.json({
      transactions,
      stats: {
        totalEthSponsored: stats._sum.ethCost || '0',
        totalTokensUsed: stats._sum.tokenAmount || '0'
      },
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching paymaster transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const transactionRouter = router;