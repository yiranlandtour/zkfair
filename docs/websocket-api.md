# WebSocket API Documentation

## Overview

The ZKFair L2 WebSocket API provides real-time updates for blockchain events, user operations, and balance changes. It uses Socket.IO for reliable bidirectional communication.

## Connection

### Endpoint

```
ws://localhost:3001 (development)
wss://api.zkfair.io (production)
```

### Authentication

The WebSocket server requires JWT authentication. Include your access token in the connection parameters:

```javascript
const socket = io('ws://localhost:3001', {
  auth: {
    token: 'your-jwt-access-token'
  }
});
```

### Connection Example

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3001', {
  auth: {
    token: localStorage.getItem('authToken')
  },
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

socket.on('connect', () => {
  console.log('Connected to WebSocket server');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});
```

## Events

### Client → Server Events

#### `subscribe`

Subscribe to a specific event stream.

```javascript
socket.emit('subscribe', {
  event: 'blocks',
  params: {} // Optional parameters
});
```

Available event streams:
- `blocks` - New block notifications
- `balances` - Balance update notifications
- `userops` - UserOperation updates

#### `unsubscribe`

Unsubscribe from an event stream.

```javascript
socket.emit('unsubscribe', {
  event: 'blocks'
});
```

#### `getUserOpStatus`

Get the current status of a UserOperation.

```javascript
socket.emit('getUserOpStatus', userOpHash);

// Response via 'userOpStatus' event
socket.on('userOpStatus', (status) => {
  console.log('UserOp status:', status);
});
```

#### `requestBalanceUpdate`

Request balance updates for specific tokens.

```javascript
socket.emit('requestBalanceUpdate', [
  '0x0000000000000000000000000000000000000000', // Native token
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'  // USDC
]);

// Response via 'balanceUpdate' event
socket.on('balanceUpdate', (update) => {
  console.log('Balance update:', update);
});
```

#### `simulateTransaction`

Simulate a transaction before sending.

```javascript
socket.emit('simulateTransaction', {
  target: '0x...',
  data: '0x...',
  value: '0' // Optional, in wei
});

// Response via 'simulationResult' event
socket.on('simulationResult', (result) => {
  if (result.success) {
    console.log('Simulation successful:', result.result);
  } else {
    console.error('Simulation failed:', result.error);
  }
});
```

### Server → Client Events

#### `newBlock`

Emitted when a new block is mined.

```javascript
socket.on('newBlock', (block) => {
  console.log('New block:', block);
  // {
  //   blockNumber: 12345,
  //   blockHash: '0x...',
  //   timestamp: 1234567890,
  //   transactionCount: 10
  // }
});
```

#### `userOpUpdate`

Emitted when a UserOperation status changes.

```javascript
socket.on('userOpUpdate', (update) => {
  console.log('UserOp update:', update);
  // {
  //   userOpHash: '0x...',
  //   status: 'included', // 'pending' | 'included' | 'failed'
  //   transactionHash: '0x...',
  //   blockNumber: 12345,
  //   actualGasCost: '21000',
  //   reason: 'error message' // Only if failed
  // }
});
```

#### `balanceUpdate`

Emitted when token balances change.

```javascript
socket.on('balanceUpdate', (update) => {
  console.log('Balance update:', update);
  // {
  //   address: '0x...', // Smart wallet address
  //   balances: {
  //     '0x0000...0000': '1000000000000000000', // Native token
  //     '0xA0b8...eB48': '100000000' // USDC
  //   },
  //   timestamp: 1234567890000
  // }
});
```

#### `error`

Emitted when an error occurs.

```javascript
socket.on('error', (error) => {
  console.error('WebSocket error:', error);
  // {
  //   message: 'Error description',
  //   code: 'ERROR_CODE'
  // }
});
```

## React Integration

### Using the WebSocket Hook

```typescript
import { useWebSocket, useUserOperationStatus, useBalanceUpdates } from '@/hooks/useWebSocket';

function MyComponent() {
  const { isConnected, subscribe, unsubscribe } = useWebSocket(authToken);
  
  // Track specific UserOperation
  const userOpStatus = useUserOperationStatus(userOpHash);
  
  // Subscribe to balance updates
  useBalanceUpdates(
    ['0x0000...0000', '0xA0b8...eB48'],
    (update) => {
      console.log('Balance changed:', update);
    }
  );
  
  useEffect(() => {
    if (isConnected) {
      subscribe('blocks');
      
      return () => {
        unsubscribe('blocks');
      };
    }
  }, [isConnected]);
  
  return (
    <div>
      Status: {isConnected ? 'Connected' : 'Disconnected'}
    </div>
  );
}
```

### Transaction Monitor Component

```typescript
import { TransactionMonitor } from '@/components/TransactionMonitor';

function MyTransaction() {
  const [userOpHash, setUserOpHash] = useState<string>();
  
  const handleTransfer = async () => {
    const hash = await sendUserOperation(...);
    setUserOpHash(hash);
  };
  
  return (
    <div>
      <button onClick={handleTransfer}>Send Transaction</button>
      
      {userOpHash && (
        <TransactionMonitor
          userOpHash={userOpHash}
          onComplete={() => {
            console.log('Transaction complete!');
          }}
        />
      )}
    </div>
  );
}
```

## Rate Limiting

- Maximum 100 events per second per client
- Maximum 20 subscriptions per client
- Maximum 10 rooms per client

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | Authentication token missing |
| `AUTH_FAILED` | Invalid authentication token |
| `RATE_LIMIT` | Rate limit exceeded |
| `INVALID_REQUEST` | Invalid request format |
| `INTERNAL_ERROR` | Server error |
| `SUB_LIMIT` | Subscription limit reached |
| `ROOM_LIMIT` | Room limit reached |

## Best Practices

1. **Connection Management**
   - Always handle connection errors and implement reconnection logic
   - Disconnect when component unmounts or user logs out
   - Use a single WebSocket connection per app instance

2. **Subscriptions**
   - Only subscribe to events you need
   - Unsubscribe when no longer needed
   - Use specific event parameters to reduce data transfer

3. **Error Handling**
   - Always listen for error events
   - Implement fallback mechanisms for failed connections
   - Show appropriate UI feedback for connection status

4. **Performance**
   - Batch balance update requests
   - Use throttling/debouncing for frequent updates
   - Cache data locally when appropriate

## Example: Complete Integration

```typescript
import { useEffect, useState } from 'react';
import { useWebSocket, useBalanceUpdates, useBlockUpdates } from '@/hooks/useWebSocket';

export function DashboardWithRealTimeUpdates() {
  const [balances, setBalances] = useState({});
  const [latestBlock, setLatestBlock] = useState(null);
  
  const { isConnected } = useWebSocket(authToken, {
    onConnect: () => console.log('WebSocket connected'),
    onDisconnect: () => console.log('WebSocket disconnected'),
    onError: (error) => console.error('WebSocket error:', error),
  });
  
  // Subscribe to balance updates
  useBalanceUpdates(
    [NATIVE_TOKEN, USDC_ADDRESS],
    (update) => {
      setBalances(update.balances);
    }
  );
  
  // Subscribe to block updates
  useBlockUpdates((block) => {
    setLatestBlock(block);
  });
  
  return (
    <div>
      <div>Connection: {isConnected ? '🟢' : '🔴'}</div>
      <div>Latest Block: {latestBlock?.blockNumber}</div>
      <div>
        Balances:
        <ul>
          {Object.entries(balances).map(([token, balance]) => (
            <li key={token}>{token}: {balance}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```