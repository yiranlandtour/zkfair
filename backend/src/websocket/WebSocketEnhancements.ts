import { Server, Socket } from 'socket.io';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { redis } from '../utils/redis';
import websocketConfig from '../config/websocket';

export interface GasPriceUpdate {
  timestamp: number;
  baseFee: string;
  priorityFee: {
    slow: string;
    standard: string;
    fast: string;
  };
  estimatedPrices: {
    slow: string;
    standard: string;
    fast: string;
  };
}

export interface TransactionNotification {
  type: 'pending' | 'confirmed' | 'failed';
  transactionHash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  confirmations?: number;
  error?: string;
}

export interface SystemNotification {
  type: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
  persistent?: boolean;
}

export interface PendingTransactionUpdate {
  transactionHash: string;
  status: 'pending' | 'speedup' | 'cancelled' | 'replaced';
  newTransactionHash?: string;
  reason?: string;
}

export class WebSocketEnhancements {
  private gasPriceInterval?: NodeJS.Timeout;
  private pendingTxMonitor: Map<string, NodeJS.Timeout> = new Map();
  private reconnectionAttempts: Map<string, number> = new Map();

  constructor(
    private io: Server,
    private provider: ethers.Provider
  ) {}

  /**
   * Start gas price monitoring and updates
   */
  startGasPriceMonitoring(intervalMs: number = 15000) {
    this.gasPriceInterval = setInterval(async () => {
      try {
        const feeData = await this.provider.getFeeData();
        const block = await this.provider.getBlock('latest');
        
        if (!feeData.gasPrice || !block) return;

        const gasPriceUpdate: GasPriceUpdate = {
          timestamp: Date.now(),
          baseFee: block.baseFeePerGas?.toString() || '0',
          priorityFee: {
            slow: ethers.parseUnits('1', 'gwei').toString(),
            standard: ethers.parseUnits('2', 'gwei').toString(),
            fast: ethers.parseUnits('3', 'gwei').toString(),
          },
          estimatedPrices: {
            slow: (feeData.gasPrice * 90n / 100n).toString(),
            standard: feeData.gasPrice.toString(),
            fast: (feeData.gasPrice * 110n / 100n).toString(),
          },
        };

        // Broadcast to all connected clients interested in gas prices
        this.io.to('gas-prices').emit('gasPriceUpdate', gasPriceUpdate);

        // Cache in Redis
        await redis.setex(
          'gas:prices:latest',
          30,
          JSON.stringify(gasPriceUpdate)
        );

        logger.info('Gas price update broadcasted', { 
          baseFee: gasPriceUpdate.baseFee 
        });
      } catch (error) {
        logger.error('Error updating gas prices', error);
      }
    }, intervalMs);
  }

  /**
   * Monitor pending transactions for confirmations
   */
  async monitorPendingTransaction(
    transactionHash: string,
    walletAddress: string,
    userId?: string
  ) {
    if (this.pendingTxMonitor.has(transactionHash)) {
      return; // Already monitoring
    }

    let confirmations = 0;
    const checkInterval = 5000; // 5 seconds
    const maxChecks = 120; // 10 minutes max
    let checks = 0;

    const monitor = setInterval(async () => {
      checks++;
      
      try {
        const receipt = await this.provider.getTransactionReceipt(transactionHash);
        
        if (receipt) {
          const currentBlock = await this.provider.getBlockNumber();
          confirmations = currentBlock - receipt.blockNumber + 1;

          const notification: TransactionNotification = {
            type: receipt.status === 1 ? 'confirmed' : 'failed',
            transactionHash,
            from: receipt.from,
            to: receipt.to || '',
            value: '0', // Would need transaction details for value
            timestamp: Date.now(),
            confirmations,
            error: receipt.status === 0 ? 'Transaction failed' : undefined,
          };

          // Broadcast to wallet room
          this.io.to(`wallet:${walletAddress}`).emit('transactionNotification', notification);

          // Broadcast to user room if available
          if (userId) {
            this.io.to(`user:${userId}`).emit('transactionNotification', notification);
          }

          // Stop monitoring after sufficient confirmations
          if (confirmations >= 12 || receipt.status === 0) {
            clearInterval(monitor);
            this.pendingTxMonitor.delete(transactionHash);
          }
        } else if (checks >= maxChecks) {
          // Transaction not found after max checks
          clearInterval(monitor);
          this.pendingTxMonitor.delete(transactionHash);
          
          const notification: TransactionNotification = {
            type: 'failed',
            transactionHash,
            from: '',
            to: '',
            value: '0',
            timestamp: Date.now(),
            error: 'Transaction not found',
          };

          this.io.to(`wallet:${walletAddress}`).emit('transactionNotification', notification);
        }
      } catch (error) {
        logger.error('Error monitoring transaction', { transactionHash, error });
        
        if (checks >= maxChecks) {
          clearInterval(monitor);
          this.pendingTxMonitor.delete(transactionHash);
        }
      }
    }, checkInterval);

    this.pendingTxMonitor.set(transactionHash, monitor);
  }

  /**
   * Broadcast system-wide notifications
   */
  broadcastSystemNotification(notification: SystemNotification) {
    this.io.emit('systemNotification', notification);
    
    logger.info('System notification broadcasted', {
      type: notification.type,
      title: notification.title,
    });
  }

  /**
   * Handle connection recovery with exponential backoff
   */
  handleConnectionRecovery(socket: Socket) {
    const socketId = socket.id;
    const attempts = this.reconnectionAttempts.get(socketId) || 0;
    
    if (attempts < websocketConfig.maxRetries) {
      const delay = websocketConfig.retryDelay * Math.pow(2, attempts);
      
      setTimeout(() => {
        if (socket.connected) {
          this.reconnectionAttempts.delete(socketId);
        } else {
          this.reconnectionAttempts.set(socketId, attempts + 1);
          socket.emit('reconnectAttempt', { 
            attempt: attempts + 1,
            maxAttempts: websocketConfig.maxRetries,
            nextRetryIn: delay * 2,
          });
        }
      }, delay);
    } else {
      this.reconnectionAttempts.delete(socketId);
      socket.emit('reconnectFailed', {
        message: 'Maximum reconnection attempts reached',
      });
      socket.disconnect(true);
    }
  }

  /**
   * Enhanced error handling with categorization
   */
  handleError(socket: Socket, error: any, context: string) {
    const errorResponse = {
      code: websocketConfig.errorCodes.INTERNAL_ERROR,
      message: 'An error occurred',
      context,
      timestamp: Date.now(),
    };

    if (error.code === 'RATE_LIMIT') {
      errorResponse.code = websocketConfig.errorCodes.RATE_LIMIT_EXCEEDED;
      errorResponse.message = 'Rate limit exceeded. Please slow down.';
    } else if (error.code === 'AUTH_ERROR') {
      errorResponse.code = websocketConfig.errorCodes.AUTHENTICATION_FAILED;
      errorResponse.message = 'Authentication failed';
    } else if (error.code === 'INVALID_DATA') {
      errorResponse.code = websocketConfig.errorCodes.INVALID_REQUEST;
      errorResponse.message = 'Invalid request data';
    }

    socket.emit('error', errorResponse);
    
    logger.error('WebSocket error', {
      socketId: socket.id,
      error: errorResponse,
      originalError: error.message,
    });
  }

  /**
   * Rate limiting implementation
   */
  private rateLimiters: Map<string, { count: number; resetTime: number }> = new Map();

  checkRateLimit(socketId: string): boolean {
    const now = Date.now();
    const limiter = this.rateLimiters.get(socketId);
    
    if (!limiter || now > limiter.resetTime) {
      this.rateLimiters.set(socketId, {
        count: 1,
        resetTime: now + 1000, // 1 second window
      });
      return true;
    }
    
    if (limiter.count >= websocketConfig.maxEventsPerSecond) {
      return false;
    }
    
    limiter.count++;
    return true;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.gasPriceInterval) {
      clearInterval(this.gasPriceInterval);
    }
    
    for (const monitor of this.pendingTxMonitor.values()) {
      clearInterval(monitor);
    }
    
    this.pendingTxMonitor.clear();
    this.reconnectionAttempts.clear();
    this.rateLimiters.clear();
  }

  /**
   * Get WebSocket metrics
   */
  getMetrics() {
    return {
      connectedClients: this.io.sockets.sockets.size,
      pendingTransactions: this.pendingTxMonitor.size,
      reconnectionAttempts: this.reconnectionAttempts.size,
      rooms: this.io.sockets.adapter.rooms.size,
    };
  }
}

export default WebSocketEnhancements;