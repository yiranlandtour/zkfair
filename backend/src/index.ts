import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { transactionRouter } from './routes/transactions';
import { statsRouter } from './routes/stats';
import { healthRouter } from './routes/health';
import { EventListener } from './services/eventListener';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api/transactions', transactionRouter);
app.use('/api/stats', statsRouter);
app.use('/api/health', healthRouter);

app.get('/', (req, res) => {
  res.json({ 
    name: 'ZKFair L2 API',
    version: '1.0.0',
    endpoints: [
      '/api/transactions',
      '/api/stats',
      '/api/health'
    ]
  });
});

async function startServer() {
  await prisma.$connect();
  console.log('Connected to database');
  
  const provider = new ethers.JsonRpcProvider(process.env.L2_RPC_URL);
  const eventListener = new EventListener(provider, prisma);
  await eventListener.start();
  console.log('Event listener started');
  
  app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});