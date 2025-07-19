import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';

export interface WebSocketConfig {
  url: string;
  token?: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
}

export interface UserOperationUpdate {
  userOpHash: string;
  status: 'pending' | 'included' | 'failed';
  transactionHash?: string;
  blockNumber?: number;
  actualGasCost?: string;
  reason?: string;
}

export interface BlockUpdate {
  blockNumber: number;
  blockHash: string;
  timestamp: number;
  transactionCount: number;
}

export interface BalanceUpdate {
  address: string;
  balances: Record<string, string>;
  timestamp: number;
}

export interface SimulationResult {
  success: boolean;
  result?: string;
  gasEstimate?: string;
  error?: string;
}

export class WebSocketClient extends EventEmitter {
  private socket: Socket | null = null;
  private config: WebSocketConfig;
  private subscriptions: Set<string> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;

  constructor(config: WebSocketConfig) {
    super();
    this.config = {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      ...config,
    };

    if (this.config.autoConnect) {
      this.connect();
    }
  }

  public connect(token?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        reject(new Error('Already connecting'));
        return;
      }

      this.isConnecting = true;
      const authToken = token || this.config.token;

      if (!authToken) {
        this.isConnecting = false;
        reject(new Error('Authentication token required'));
        return;
      }

      this.socket = io(this.config.url, {
        auth: { token: authToken },
        transports: ['websocket', 'polling'],
        reconnection: this.config.reconnection,
        reconnectionAttempts: this.config.reconnectionAttempts,
        reconnectionDelay: this.config.reconnectionDelay,
      });

      this.setupEventHandlers();

      this.socket.on('connect', () => {
        this.isConnecting = false;
        this.emit('connected');
        this.resubscribeAll();
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        this.isConnecting = false;
        this.emit('error', error);
        reject(error);
      });
    });
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.emit('disconnected');
  }

  public isConnected(): boolean {
    return this.socket?.connected || false;
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('disconnect', (reason) => {
      this.emit('disconnected', reason);
      
      if (reason === 'io server disconnect') {
        // Server disconnected us, try to reconnect
        this.attemptReconnect();
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      this.emit('reconnected', attemptNumber);
      this.resubscribeAll();
    });

    this.socket.on('reconnect_error', (error) => {
      this.emit('reconnect_error', error);
    });

    // Application events
    this.socket.on('newBlock', (data: BlockUpdate) => {
      this.emit('block', data);
    });

    this.socket.on('userOpUpdate', (data: UserOperationUpdate) => {
      this.emit('userOpUpdate', data);
    });

    this.socket.on('userOpStatus', (data: UserOperationUpdate) => {
      this.emit('userOpStatus', data);
    });

    this.socket.on('balanceUpdate', (data: BalanceUpdate) => {
      this.emit('balanceUpdate', data);
    });

    this.socket.on('simulationResult', (data: SimulationResult) => {
      this.emit('simulationResult', data);
    });

    this.socket.on('subscribed', (data: { event: string; status: string }) => {
      this.emit('subscribed', data.event);
    });

    this.socket.on('unsubscribed', (data: { event: string; status: string }) => {
      this.emit('unsubscribed', data.event);
    });

    this.socket.on('error', (error: any) => {
      this.emit('error', error);
    });
  }

  private attemptReconnect(): void {
    if (!this.config.reconnection || this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.config.token) {
        this.connect(this.config.token).catch((error) => {
          console.error('Reconnection failed:', error);
        });
      }
    }, this.config.reconnectionDelay);
  }

  private resubscribeAll(): void {
    for (const event of this.subscriptions) {
      this.socket?.emit('subscribe', { event });
    }
  }

  // Public API methods

  public subscribe(event: string, params?: any): void {
    if (!this.socket?.connected) {
      throw new Error('WebSocket not connected');
    }

    this.subscriptions.add(event);
    this.socket.emit('subscribe', { event, params });
  }

  public unsubscribe(event: string): void {
    if (!this.socket?.connected) {
      throw new Error('WebSocket not connected');
    }

    this.subscriptions.delete(event);
    this.socket.emit('unsubscribe', { event });
  }

  public getUserOpStatus(userOpHash: string): void {
    if (!this.socket?.connected) {
      throw new Error('WebSocket not connected');
    }

    this.socket.emit('getUserOpStatus', userOpHash);
  }

  public requestBalanceUpdate(tokenAddresses: string[]): void {
    if (!this.socket?.connected) {
      throw new Error('WebSocket not connected');
    }

    this.socket.emit('requestBalanceUpdate', tokenAddresses);
  }

  public simulateTransaction(data: {
    target: string;
    data: string;
    value?: string;
  }): void {
    if (!this.socket?.connected) {
      throw new Error('WebSocket not connected');
    }

    this.socket.emit('simulateTransaction', data);
  }

  // Event listeners with TypeScript support

  public onBlock(callback: (data: BlockUpdate) => void): this {
    this.on('block', callback);
    return this;
  }

  public onUserOpUpdate(callback: (data: UserOperationUpdate) => void): this {
    this.on('userOpUpdate', callback);
    return this;
  }

  public onBalanceUpdate(callback: (data: BalanceUpdate) => void): this {
    this.on('balanceUpdate', callback);
    return this;
  }

  public onError(callback: (error: Error) => void): this {
    this.on('error', callback);
    return this;
  }

  public onConnected(callback: () => void): this {
    this.on('connected', callback);
    return this;
  }

  public onDisconnected(callback: (reason?: string) => void): this {
    this.on('disconnected', callback);
    return this;
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(config?: WebSocketConfig): WebSocketClient {
  if (!wsClient && config) {
    wsClient = new WebSocketClient(config);
  }
  
  if (!wsClient) {
    throw new Error('WebSocket client not initialized');
  }
  
  return wsClient;
}

export function disconnectWebSocket(): void {
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
}