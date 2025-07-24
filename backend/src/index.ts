import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import authRouter from './routes/auth';
import { transactionRouter } from './routes/transactions';
import { statsRouter } from './routes/stats';
import { healthRouter } from './routes/health';
import { EventListener } from './services/eventListener';
import { WebSocketServer } from './websocket/WebSocketServer';
import { NotificationService } from './services/notificationService';
import { notificationConfig } from './config/notifications';
import { notificationRouter } from './routes/notificationRoutes';
import { authenticate, authenticateApiKey } from './middleware/auth';
import { 
  sanitizeInput, 
  preventSQLInjection, 
  securityHeaders, 
  requestSizeLimit,
  apiVersion 
} from './middleware/security';
import { 
  errorHandler, 
  notFoundHandler, 
  requestLogger, 
  handleUncaughtExceptions,
  timeoutHandler 
} from './middleware/errorHandler';

dotenv.config();

// Handle uncaught exceptions
handleUncaughtExceptions();

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();
const port = process.env.PORT || 4000;

// Request logging
app.use(requestLogger);

// Security middleware
app.use(helmet());
app.use(securityHeaders());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(requestSizeLimit(10 * 1024 * 1024)); // 10MB
app.use(sanitizeInput);
app.use(preventSQLInjection);
app.use(timeoutHandler(30000)); // 30 seconds

// API versioning
app.use(apiVersion(['v1', 'v2']));

// Global rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Public routes
app.use('/api/auth', authRouter);
app.use('/api/health', healthRouter);

// Authenticated routes (supports both JWT and API key)
app.use('/api/transactions', authenticate, transactionRouter);
app.use('/api/stats', authenticate, statsRouter);
app.use('/api/notifications', authenticate, notificationRouter);

app.get('/', (req, res) => {
  res.json({ 
    name: 'ZKFair L2 API',
    version: '1.0.0',
    endpoints: {
      public: [
        '/api/auth/nonce',
        '/api/auth/login',
        '/api/auth/refresh',
        '/api/health'
      ],
      authenticated: [
        '/api/auth/me',
        '/api/auth/logout',
        '/api/auth/api-key',
        '/api/transactions',
        '/api/stats'
      ],
      websocket: process.env.WEBSOCKET_URL || `ws://localhost:${port}`
    }
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  await prisma.$connect();
  console.log('Connected to database');
  
  const provider = new ethers.JsonRpcProvider(process.env.L2_RPC_URL);
  
  // Start WebSocket server
  const wsServer = new WebSocketServer(httpServer, provider);
  console.log('WebSocket server initialized');
  
  // Start notification service
  const notificationService = new NotificationService(notificationConfig);
  console.log('Notification service initialized');
  
  // Start event listener with WebSocket integration
  const eventListener = new EventListener(provider, prisma);
  eventListener.setWebSocketServer(wsServer);
  eventListener.setNotificationService(notificationService);
  await eventListener.start();
  console.log('Event listener started');
  
  httpServer.listen(port, () => {
    console.log(`API server listening on port ${port}`);
    console.log(`WebSocket server listening on ws://localhost:${port}`);
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