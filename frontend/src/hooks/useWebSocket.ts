import { useEffect, useState, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { 
  WebSocketClient, 
  getWebSocketClient, 
  disconnectWebSocket,
  UserOperationUpdate,
  BlockUpdate,
  BalanceUpdate,
  SimulationResult
} from '../services/websocket';

export interface UseWebSocketOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: (reason?: string) => void;
  onError?: (error: Error) => void;
}

export interface UseWebSocketReturn {
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  subscribe: (event: string, params?: any) => void;
  unsubscribe: (event: string) => void;
  getUserOpStatus: (userOpHash: string) => void;
  requestBalanceUpdate: (tokenAddresses: string[]) => void;
  simulateTransaction: (data: { target: string; data: string; value?: string }) => void;
}

export function useWebSocket(
  token?: string,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const { address } = useAccount();
  const [isConnected, setIsConnected] = useState(false);
  const clientRef = useRef<WebSocketClient | null>(null);
  const listenersRef = useRef<Set<() => void>>(new Set());

  // Initialize WebSocket client
  useEffect(() => {
    if (!token || !address) return;

    try {
      const client = getWebSocketClient({
        url: process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:3001',
        token,
        autoConnect: options.autoConnect ?? true,
      });

      clientRef.current = client;

      // Setup connection listeners
      const handleConnect = () => {
        setIsConnected(true);
        options.onConnect?.();
      };

      const handleDisconnect = (reason?: string) => {
        setIsConnected(false);
        options.onDisconnect?.(reason);
      };

      const handleError = (error: Error) => {
        console.error('WebSocket error:', error);
        options.onError?.(error);
      };

      client.on('connected', handleConnect);
      client.on('disconnected', handleDisconnect);
      client.on('error', handleError);

      // Store cleanup functions
      listenersRef.current.add(() => client.off('connected', handleConnect));
      listenersRef.current.add(() => client.off('disconnected', handleDisconnect));
      listenersRef.current.add(() => client.off('error', handleError));

      // Set initial connection state
      setIsConnected(client.isConnected());
    } catch (error) {
      console.error('Failed to initialize WebSocket client:', error);
    }

    return () => {
      // Cleanup listeners
      listenersRef.current.forEach(cleanup => cleanup());
      listenersRef.current.clear();
    };
  }, [token, address, options]);

  const connect = useCallback(async () => {
    if (!clientRef.current || !token) {
      throw new Error('WebSocket client not initialized');
    }
    await clientRef.current.connect(token);
  }, [token]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
  }, []);

  const subscribe = useCallback((event: string, params?: any) => {
    if (!clientRef.current) {
      throw new Error('WebSocket client not initialized');
    }
    clientRef.current.subscribe(event, params);
  }, []);

  const unsubscribe = useCallback((event: string) => {
    if (!clientRef.current) {
      throw new Error('WebSocket client not initialized');
    }
    clientRef.current.unsubscribe(event);
  }, []);

  const getUserOpStatus = useCallback((userOpHash: string) => {
    if (!clientRef.current) {
      throw new Error('WebSocket client not initialized');
    }
    clientRef.current.getUserOpStatus(userOpHash);
  }, []);

  const requestBalanceUpdate = useCallback((tokenAddresses: string[]) => {
    if (!clientRef.current) {
      throw new Error('WebSocket client not initialized');
    }
    clientRef.current.requestBalanceUpdate(tokenAddresses);
  }, []);

  const simulateTransaction = useCallback((data: { target: string; data: string; value?: string }) => {
    if (!clientRef.current) {
      throw new Error('WebSocket client not initialized');
    }
    clientRef.current.simulateTransaction(data);
  }, []);

  return {
    isConnected,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    getUserOpStatus,
    requestBalanceUpdate,
    simulateTransaction,
  };
}

// Hook for subscribing to block updates
export function useBlockUpdates(
  callback: (block: BlockUpdate) => void,
  deps: React.DependencyList = []
) {
  const { isConnected } = useWebSocket();

  useEffect(() => {
    if (!isConnected) return;

    const client = getWebSocketClient();
    client.onBlock(callback);
    client.subscribe('blocks');

    return () => {
      client.unsubscribe('blocks');
      client.off('block', callback);
    };
  }, [isConnected, ...deps]);
}

// Hook for tracking user operation status
export function useUserOperationStatus(
  userOpHash?: string
): UserOperationUpdate | null {
  const { isConnected, getUserOpStatus } = useWebSocket();
  const [status, setStatus] = useState<UserOperationUpdate | null>(null);

  useEffect(() => {
    if (!isConnected || !userOpHash) return;

    const client = getWebSocketClient();
    
    const handleUpdate = (update: UserOperationUpdate) => {
      if (update.userOpHash === userOpHash) {
        setStatus(update);
      }
    };

    client.on('userOpStatus', handleUpdate);
    client.on('userOpUpdate', handleUpdate);
    
    // Request initial status
    getUserOpStatus(userOpHash);

    return () => {
      client.off('userOpStatus', handleUpdate);
      client.off('userOpUpdate', handleUpdate);
    };
  }, [isConnected, userOpHash, getUserOpStatus]);

  return status;
}

// Hook for real-time balance updates
export function useBalanceUpdates(
  tokenAddresses: string[],
  callback: (update: BalanceUpdate) => void
) {
  const { isConnected, requestBalanceUpdate } = useWebSocket();
  const addressesRef = useRef<string[]>([]);

  useEffect(() => {
    if (!isConnected || tokenAddresses.length === 0) return;

    const client = getWebSocketClient();
    
    // Only request update if addresses changed
    const addressesChanged = JSON.stringify(addressesRef.current) !== JSON.stringify(tokenAddresses);
    if (addressesChanged) {
      addressesRef.current = tokenAddresses;
      requestBalanceUpdate(tokenAddresses);
    }

    client.on('balanceUpdate', callback);
    client.subscribe('balances');

    // Request periodic updates
    const interval = setInterval(() => {
      requestBalanceUpdate(tokenAddresses);
    }, 30000); // Every 30 seconds

    return () => {
      clearInterval(interval);
      client.off('balanceUpdate', callback);
      client.unsubscribe('balances');
    };
  }, [isConnected, tokenAddresses, callback, requestBalanceUpdate]);
}

// Hook for transaction simulation
export function useTransactionSimulation() {
  const { isConnected, simulateTransaction } = useWebSocket();
  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const simulate = useCallback(async (data: { target: string; data: string; value?: string }) => {
    if (!isConnected) {
      setError(new Error('WebSocket not connected'));
      return;
    }

    setIsSimulating(true);
    setError(null);
    setResult(null);

    const client = getWebSocketClient();
    
    const handleResult = (result: SimulationResult) => {
      setIsSimulating(false);
      if (result.success) {
        setResult(result);
      } else {
        setError(new Error(result.error || 'Simulation failed'));
      }
    };

    client.once('simulationResult', handleResult);
    
    try {
      simulateTransaction(data);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        client.off('simulationResult', handleResult);
        if (isSimulating) {
          setIsSimulating(false);
          setError(new Error('Simulation timeout'));
        }
      }, 10000);
    } catch (err) {
      setIsSimulating(false);
      setError(err as Error);
    }
  }, [isConnected, simulateTransaction]);

  return {
    simulate,
    isSimulating,
    result,
    error,
  };
}