import { Server, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { verify } from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { redis } from '../utils/redis';
import { WebSocketEnhancements } from './WebSocketEnhancements';
import websocketConfig from '../config/websocket';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  smartWalletAddress?: string;
}

interface UserOperationUpdate {
  userOpHash: string;
  status: 'pending' | 'included' | 'failed';
  transactionHash?: string;
  blockNumber?: number;
  actualGasCost?: string;
  reason?: string;
}

interface BlockUpdate {
  blockNumber: number;
  blockHash: string;
  timestamp: number;
  transactionCount: number;
}

export class WebSocketServer {
  private io: Server;
  private prisma: PrismaClient;
  private provider: ethers.Provider;
  private subscriptions: Map<string, Set<string>> = new Map();
  private enhancements: WebSocketEnhancements;

  constructor(httpServer: HTTPServer, provider: ethers.Provider) {
    this.prisma = new PrismaClient();
    this.provider = provider;
    
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.enhancements = new WebSocketEnhancements(this.io, this.provider);
    
    this.setupMiddleware();
    this.setupEventHandlers();
    this.startBlockListener();
    this.startUserOperationListener();
    
    // Start enhanced features
    this.enhancements.startGasPriceMonitoring();
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: any, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = verify(token, process.env.JWT_SECRET!) as any;
        socket.userId = decoded.userId;
        socket.smartWalletAddress = decoded.address;
        
        logger.info('WebSocket client authenticated', {
          userId: decoded.userId,
          address: decoded.address,
        });
        
        next();
      } catch (error) {
        logger.error('WebSocket authentication failed', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      logger.info('WebSocket client connected', {
        socketId: socket.id,
        userId: socket.userId,
      });

      // Join user's personal room
      if (socket.userId) {
        socket.join(`user:${socket.userId}`);
      }

      // Join smart wallet room
      if (socket.smartWalletAddress) {
        socket.join(`wallet:${socket.smartWalletAddress}`);
      }

      // Rate limiting middleware for socket events
      socket.use((packet, next) => {
        if (this.enhancements.checkRateLimit(socket.id)) {
          next();
        } else {
          next(new Error('RATE_LIMIT'));
        }
      });

      // Handle subscription to specific events
      socket.on('subscribe', async (data: { event: string; params?: any }) => {
        await this.handleSubscribe(socket, data.event, data.params);
      });

      // Handle unsubscribe
      socket.on('unsubscribe', async (data: { event: string }) => {
        await this.handleUnsubscribe(socket, data.event);
      });

      // Handle user operation status requests
      socket.on('getUserOpStatus', async (userOpHash: string) => {
        await this.handleGetUserOpStatus(socket, userOpHash);
      });

      // Handle balance update requests
      socket.on('requestBalanceUpdate', async (tokenAddresses: string[]) => {
        await this.handleBalanceUpdateRequest(socket, tokenAddresses);
      });

      // Handle transaction simulation
      socket.on('simulateTransaction', async (data: any) => {
        await this.handleTransactionSimulation(socket, data);
      });

      // Handle gas price subscription
      socket.on('subscribeGasPrices', () => {
        socket.join('gas-prices');
        socket.emit('subscribed', { event: 'gas-prices', status: 'success' });
        logger.info('Client subscribed to gas prices', { socketId: socket.id });
      });

      // Handle gas price unsubscription
      socket.on('unsubscribeGasPrices', () => {
        socket.leave('gas-prices');
        socket.emit('unsubscribed', { event: 'gas-prices', status: 'success' });
      });

      // Handle transaction monitoring request
      socket.on('monitorTransaction', async (data: { transactionHash: string }) => {
        if (socket.smartWalletAddress) {
          await this.enhancements.monitorPendingTransaction(
            data.transactionHash,
            socket.smartWalletAddress,
            socket.userId
          );
          socket.emit('monitoringStarted', { 
            transactionHash: data.transactionHash,
            status: 'success' 
          });
        }
      });

      // Handle metrics request
      socket.on('getMetrics', () => {
        const metrics = this.enhancements.getMetrics();
        socket.emit('metrics', metrics);
      });

      // Error handling
      socket.on('error', (error) => {
        this.enhancements.handleError(socket, error, 'socket-error');
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info('WebSocket client disconnected', {
          socketId: socket.id,
          userId: socket.userId,
        });
        this.cleanupSubscriptions(socket.id);
      });

      // Handle reconnection
      socket.on('reconnect_attempt', () => {
        this.enhancements.handleConnectionRecovery(socket);
      });
    });
  }

  private async handleSubscribe(
    socket: AuthenticatedSocket,
    event: string,
    params?: any
  ) {
    const subscriptionKey = `${socket.id}:${event}`;
    
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }
    
    this.subscriptions.get(event)!.add(socket.id);
    
    // Store subscription in Redis for persistence
    await redis.sadd(`ws:subscriptions:${event}`, socket.id);
    
    logger.info('Client subscribed to event', {
      socketId: socket.id,
      event,
      params,
    });
    
    socket.emit('subscribed', { event, status: 'success' });
  }

  private async handleUnsubscribe(socket: AuthenticatedSocket, event: string) {
    const subscriptions = this.subscriptions.get(event);
    if (subscriptions) {
      subscriptions.delete(socket.id);
    }
    
    await redis.srem(`ws:subscriptions:${event}`, socket.id);
    
    logger.info('Client unsubscribed from event', {
      socketId: socket.id,
      event,
    });
    
    socket.emit('unsubscribed', { event, status: 'success' });
  }

  private async handleGetUserOpStatus(
    socket: AuthenticatedSocket,
    userOpHash: string
  ) {
    try {
      // Check cache first
      const cached = await redis.get(`userop:status:${userOpHash}`);
      if (cached) {
        socket.emit('userOpStatus', JSON.parse(cached));
        return;
      }

      // Query from database
      const transaction = await this.prisma.transaction.findUnique({
        where: { userOpHash },
        include: {
          smartWallet: true,
        },
      });

      if (transaction) {
        const status: UserOperationUpdate = {
          userOpHash,
          status: transaction.status === 'SUCCESS' ? 'included' : 'failed',
          transactionHash: transaction.transactionHash,
          blockNumber: transaction.blockNumber,
          actualGasCost: transaction.actualGasCost,
        };

        socket.emit('userOpStatus', status);
        
        // Cache the result
        await redis.setex(
          `userop:status:${userOpHash}`,
          300, // 5 minutes
          JSON.stringify(status)
        );
      } else {
        socket.emit('userOpStatus', {
          userOpHash,
          status: 'pending',
        });
      }
    } catch (error) {
      logger.error('Error getting UserOp status', error);
      socket.emit('error', {
        message: 'Failed to get UserOp status',
        code: 'USEROP_STATUS_ERROR',
      });
    }
  }

  private async handleBalanceUpdateRequest(
    socket: AuthenticatedSocket,
    tokenAddresses: string[]
  ) {
    try {
      if (!socket.smartWalletAddress) {
        throw new Error('No smart wallet address');
      }

      const balances: Record<string, string> = {};

      for (const tokenAddress of tokenAddresses) {
        if (tokenAddress === ethers.ZeroAddress) {
          // Native token balance
          const balance = await this.provider.getBalance(socket.smartWalletAddress);
          balances[tokenAddress] = balance.toString();
        } else {
          // ERC20 balance
          const contract = new ethers.Contract(
            tokenAddress,
            ['function balanceOf(address) view returns (uint256)'],
            this.provider
          );
          const balance = await contract.balanceOf(socket.smartWalletAddress);
          balances[tokenAddress] = balance.toString();
        }
      }

      socket.emit('balanceUpdate', {
        address: socket.smartWalletAddress,
        balances,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Error updating balances', error);
      socket.emit('error', {
        message: 'Failed to update balances',
        code: 'BALANCE_UPDATE_ERROR',
      });
    }
  }

  private async handleTransactionSimulation(
    socket: AuthenticatedSocket,
    data: {
      target: string;
      data: string;
      value?: string;
    }
  ) {
    try {
      if (!socket.smartWalletAddress) {
        throw new Error('No smart wallet address');
      }

      // Simulate transaction
      const result = await this.provider.call({
        from: socket.smartWalletAddress,
        to: data.target,
        data: data.data,
        value: data.value || 0,
      });

      socket.emit('simulationResult', {
        success: true,
        result,
        gasEstimate: '0', // Would need to implement gas estimation
      });
    } catch (error: any) {
      logger.error('Transaction simulation failed', error);
      socket.emit('simulationResult', {
        success: false,
        error: error.message,
      });
    }
  }

  private startBlockListener() {
    this.provider.on('block', async (blockNumber: number) => {
      try {
        const block = await this.provider.getBlock(blockNumber);
        if (!block) return;

        const blockUpdate: BlockUpdate = {
          blockNumber: block.number,
          blockHash: block.hash!,
          timestamp: block.timestamp,
          transactionCount: block.transactions.length,
        };

        // Emit to all connected clients
        this.io.emit('newBlock', blockUpdate);

        // Store in Redis for recent blocks
        await redis.zadd(
          'recent:blocks',
          block.timestamp,
          JSON.stringify(blockUpdate)
        );
        
        // Keep only last 100 blocks
        await redis.zremrangebyrank('recent:blocks', 0, -101);
      } catch (error) {
        logger.error('Error processing new block', error);
      }
    });
  }

  private startUserOperationListener() {
    // Subscribe to UserOperation events from Redis
    const subscriber = redis.duplicate();
    
    subscriber.subscribe('userop:updates', (err) => {
      if (err) {
        logger.error('Failed to subscribe to UserOp updates', err);
        return;
      }
      logger.info('Subscribed to UserOperation updates');
    });

    subscriber.on('message', async (channel, message) => {
      try {
        const update: UserOperationUpdate = JSON.parse(message);
        
        // Get the smart wallet address for this UserOp
        const transaction = await this.prisma.transaction.findUnique({
          where: { userOpHash: update.userOpHash },
          include: { smartWallet: true },
        });

        if (transaction) {
          // Emit to wallet room
          this.io.to(`wallet:${transaction.smartWallet.address}`).emit(
            'userOpUpdate',
            update
          );

          // Emit to user room
          if (transaction.smartWallet.userId) {
            this.io.to(`user:${transaction.smartWallet.userId}`).emit(
              'userOpUpdate',
              update
            );
          }
        }
      } catch (error) {
        logger.error('Error processing UserOp update', error);
      }
    });
  }

  private cleanupSubscriptions(socketId: string) {
    for (const [event, subscribers] of this.subscriptions.entries()) {
      subscribers.delete(socketId);
      redis.srem(`ws:subscriptions:${event}`, socketId);
    }
  }

  public broadcastUserOperationUpdate(update: UserOperationUpdate) {
    // Publish to Redis for distribution
    redis.publish('userop:updates', JSON.stringify(update));
  }

  public broadcastToWallet(walletAddress: string, event: string, data: any) {
    this.io.to(`wallet:${walletAddress}`).emit(event, data);
  }

  public broadcastToUser(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  public broadcastSystemNotification(type: 'info' | 'warning' | 'error', title: string, message: string) {
    this.enhancements.broadcastSystemNotification({
      type,
      title,
      message,
      timestamp: Date.now(),
    });
  }

  public async monitorTransaction(transactionHash: string, walletAddress: string, userId?: string) {
    await this.enhancements.monitorPendingTransaction(transactionHash, walletAddress, userId);
  }

  public getConnectedClients(): number {
    return this.io.sockets.sockets.size;
  }

  public getMetrics() {
    return {
      ...this.enhancements.getMetrics(),
      subscriptions: this.subscriptions.size,
    };
  }

  public async close() {
    this.enhancements.cleanup();
    await this.prisma.$disconnect();
    this.io.close();
  }
}