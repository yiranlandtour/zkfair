import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { ethers } from 'ethers';
import { WebSocketServer } from '../websocket/WebSocketServer';
import { generateTokens } from '../middleware/auth';
import { redis } from '../utils/redis';

describe('WebSocket Server', () => {
  let httpServer: any;
  let wsServer: WebSocketServer;
  let clientSocket: ClientSocket;
  let provider: ethers.Provider;
  const port = 5001;

  beforeAll((done) => {
    httpServer = createServer();
    provider = new ethers.JsonRpcProvider('http://localhost:8545');
    wsServer = new WebSocketServer(httpServer, provider);
    httpServer.listen(port, done);
  });

  afterAll(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    httpServer.close();
    await wsServer.close();
    await redis.quit();
  });

  afterEach(() => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Authentication', () => {
    it('should reject connection without token', (done) => {
      clientSocket = ioClient(`http://localhost:${port}`, {
        transports: ['websocket'],
      });

      clientSocket.on('connect_error', (error) => {
        expect(error.message).toBe('Authentication required');
        done();
      });
    });

    it('should reject connection with invalid token', (done) => {
      clientSocket = ioClient(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: {
          token: 'invalid-token',
        },
      });

      clientSocket.on('connect_error', (error) => {
        expect(error.message).toBe('Authentication failed');
        done();
      });
    });

    it('should accept connection with valid token', (done) => {
      const { accessToken } = generateTokens({
        id: 'user123',
        address: '0x1234567890123456789012345678901234567890',
        role: 'user',
      });

      clientSocket = ioClient(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: {
          token: accessToken,
        },
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });
  });

  describe('Event Subscriptions', () => {
    let authToken: string;

    beforeEach((done) => {
      const { accessToken } = generateTokens({
        id: 'user123',
        address: '0x1234567890123456789012345678901234567890',
        role: 'user',
      });
      authToken = accessToken;

      clientSocket = ioClient(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: {
          token: authToken,
        },
      });

      clientSocket.on('connect', done);
    });

    it('should subscribe to events', (done) => {
      clientSocket.emit('subscribe', { event: 'blocks' });

      clientSocket.on('subscribed', (data) => {
        expect(data).toBe('blocks');
        done();
      });
    });

    it('should unsubscribe from events', (done) => {
      clientSocket.emit('subscribe', { event: 'blocks' });

      clientSocket.on('subscribed', () => {
        clientSocket.emit('unsubscribe', { event: 'blocks' });
      });

      clientSocket.on('unsubscribed', (data) => {
        expect(data).toBe('blocks');
        done();
      });
    });
  });

  describe('UserOperation Status', () => {
    let authToken: string;

    beforeEach((done) => {
      const { accessToken } = generateTokens({
        id: 'user123',
        address: '0x1234567890123456789012345678901234567890',
        role: 'user',
      });
      authToken = accessToken;

      clientSocket = ioClient(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: {
          token: authToken,
        },
      });

      clientSocket.on('connect', done);
    });

    it('should get UserOp status', (done) => {
      const userOpHash = '0x1234567890123456789012345678901234567890123456789012345678901234';
      
      clientSocket.emit('getUserOpStatus', userOpHash);

      clientSocket.on('userOpStatus', (status) => {
        expect(status).toHaveProperty('userOpHash', userOpHash);
        expect(status).toHaveProperty('status');
        expect(['pending', 'included', 'failed']).toContain(status.status);
        done();
      });
    });
  });

  describe('Balance Updates', () => {
    let authToken: string;

    beforeEach((done) => {
      const { accessToken } = generateTokens({
        id: 'user123',
        address: '0x1234567890123456789012345678901234567890',
        role: 'user',
      });
      authToken = accessToken;

      clientSocket = ioClient(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: {
          token: authToken,
        },
      });

      clientSocket.on('connect', done);
    });

    it('should request balance updates', (done) => {
      const tokenAddresses = [
        ethers.ZeroAddress,
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      ];

      clientSocket.emit('requestBalanceUpdate', tokenAddresses);

      clientSocket.on('balanceUpdate', (update) => {
        expect(update).toHaveProperty('address');
        expect(update).toHaveProperty('balances');
        expect(update).toHaveProperty('timestamp');
        expect(Object.keys(update.balances)).toHaveLength(2);
        done();
      });
    });
  });

  describe('Transaction Simulation', () => {
    let authToken: string;

    beforeEach((done) => {
      const { accessToken } = generateTokens({
        id: 'user123',
        address: '0x1234567890123456789012345678901234567890',
        role: 'user',
      });
      authToken = accessToken;

      clientSocket = ioClient(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: {
          token: authToken,
        },
      });

      clientSocket.on('connect', done);
    });

    it('should simulate transaction', (done) => {
      const simulationData = {
        target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        data: '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000a',
        value: '0',
      };

      clientSocket.emit('simulateTransaction', simulationData);

      clientSocket.on('simulationResult', (result) => {
        expect(result).toHaveProperty('success');
        if (result.success) {
          expect(result).toHaveProperty('result');
          expect(result).toHaveProperty('gasEstimate');
        } else {
          expect(result).toHaveProperty('error');
        }
        done();
      });
    });
  });

  describe('Broadcast Functions', () => {
    it('should broadcast UserOperation updates', () => {
      const update = {
        userOpHash: '0x123',
        status: 'included' as const,
        transactionHash: '0x456',
        blockNumber: 1000,
        actualGasCost: '21000',
      };

      expect(() => {
        wsServer.broadcastUserOperationUpdate(update);
      }).not.toThrow();
    });

    it('should broadcast to wallet', () => {
      const walletAddress = '0x1234567890123456789012345678901234567890';
      
      expect(() => {
        wsServer.broadcastToWallet(walletAddress, 'test-event', { data: 'test' });
      }).not.toThrow();
    });

    it('should broadcast to user', () => {
      const userId = 'user123';
      
      expect(() => {
        wsServer.broadcastToUser(userId, 'test-event', { data: 'test' });
      }).not.toThrow();
    });

    it('should get connected clients count', () => {
      const count = wsServer.getConnectedClients();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});