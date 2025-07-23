# Enhanced WebSocket API Documentation

## Overview

The ZKFair L2 WebSocket service provides real-time updates for blockchain events, transactions, and system notifications. This enhanced version includes gas price monitoring, transaction tracking, and improved error handling.

## Connection

### Endpoint
```
wss://api.zkfair.io/ws
```

### Authentication
```javascript
const socket = io('wss://api.zkfair.io', {
  auth: {
    token: 'your-jwt-token'
  },
  transports: ['websocket', 'polling']
});
```

## Events

### Client → Server Events

#### Basic Events (Existing)
- `subscribe` - Subscribe to specific events
- `unsubscribe` - Unsubscribe from events
- `getUserOpStatus` - Get UserOperation status
- `requestBalanceUpdate` - Request balance updates
- `simulateTransaction` - Simulate a transaction

#### Enhanced Events (New)
- `subscribeGasPrices` - Subscribe to gas price updates
- `unsubscribeGasPrices` - Unsubscribe from gas prices
- `monitorTransaction` - Monitor a pending transaction
- `getMetrics` - Get WebSocket server metrics

### Server → Client Events

#### Basic Events (Existing)
- `newBlock` - New block mined
- `userOpUpdate` - UserOperation status update
- `balanceUpdate` - Balance changes
- `error` - Error notifications

#### Enhanced Events (New)
- `gasPriceUpdate` - Real-time gas price updates
- `transactionNotification` - Transaction status notifications
- `systemNotification` - System-wide announcements
- `metrics` - Server metrics response

## Event Details

### Gas Price Updates

Subscribe to real-time gas price updates:

```javascript
// Subscribe
socket.emit('subscribeGasPrices');

// Listen for updates
socket.on('gasPriceUpdate', (data) => {
  console.log('Gas prices:', {
    baseFee: data.baseFee,
    slow: data.estimatedPrices.slow,
    standard: data.estimatedPrices.standard,
    fast: data.estimatedPrices.fast
  });
});
```

Response format:
```typescript
interface GasPriceUpdate {
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
```

### Transaction Monitoring

Monitor pending transactions for confirmations:

```javascript
// Start monitoring
socket.emit('monitorTransaction', {
  transactionHash: '0x123...'
});

// Listen for notifications
socket.on('transactionNotification', (notification) => {
  console.log(`Transaction ${notification.type}:`, {
    hash: notification.transactionHash,
    confirmations: notification.confirmations,
    error: notification.error
  });
});
```

Response format:
```typescript
interface TransactionNotification {
  type: 'pending' | 'confirmed' | 'failed';
  transactionHash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  confirmations?: number;
  error?: string;
}
```

### System Notifications

Receive important system announcements:

```javascript
socket.on('systemNotification', (notification) => {
  console.log(`[${notification.type}] ${notification.title}:`, notification.message);
  
  if (notification.persistent) {
    // Show persistent notification to user
  }
});
```

Response format:
```typescript
interface SystemNotification {
  type: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
  persistent?: boolean;
}
```

### Server Metrics

Get real-time server metrics:

```javascript
// Request metrics
socket.emit('getMetrics');

// Receive response
socket.on('metrics', (metrics) => {
  console.log('Server metrics:', {
    connectedClients: metrics.connectedClients,
    pendingTransactions: metrics.pendingTransactions,
    rooms: metrics.rooms
  });
});
```

## Error Handling

Enhanced error handling with categorized error codes:

```javascript
socket.on('error', (error) => {
  switch (error.code) {
    case 'RATE_LIMIT':
      console.error('Rate limit exceeded. Please slow down.');
      break;
    case 'AUTH_FAILED':
      console.error('Authentication failed. Please reconnect.');
      break;
    case 'INVALID_REQUEST':
      console.error('Invalid request:', error.message);
      break;
    default:
      console.error('Error:', error.message);
  }
});
```

Error codes:
- `AUTH_REQUIRED` - Authentication required
- `AUTH_FAILED` - Authentication failed
- `RATE_LIMIT` - Rate limit exceeded
- `INVALID_REQUEST` - Invalid request data
- `INTERNAL_ERROR` - Internal server error
- `SUB_LIMIT` - Subscription limit reached
- `ROOM_LIMIT` - Room limit reached

## Rate Limiting

The WebSocket server implements rate limiting to prevent abuse:

- Maximum events per second: 100
- Maximum subscriptions per client: 20
- Maximum rooms per client: 10

## Reconnection

The client SDK handles automatic reconnection with exponential backoff:

```javascript
socket.on('reconnect_attempt', (attemptNumber) => {
  console.log(`Reconnection attempt ${attemptNumber}`);
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`Reconnected after ${attemptNumber} attempts`);
});

socket.on('reconnect_error', (error) => {
  console.error('Reconnection error:', error);
});

socket.on('reconnect_failed', () => {
  console.error('Failed to reconnect after maximum attempts');
});
```

## Complete Example

```javascript
import { io } from 'socket.io-client';

class ZKFairWebSocket {
  constructor(token) {
    this.socket = io('wss://api.zkfair.io', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000
    });
    
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to ZKFair WebSocket');
      
      // Subscribe to gas prices
      this.socket.emit('subscribeGasPrices');
    });
    
    // Gas price updates
    this.socket.on('gasPriceUpdate', (data) => {
      this.handleGasPriceUpdate(data);
    });
    
    // Transaction notifications
    this.socket.on('transactionNotification', (notification) => {
      this.handleTransactionNotification(notification);
    });
    
    // System notifications
    this.socket.on('systemNotification', (notification) => {
      this.handleSystemNotification(notification);
    });
    
    // Error handling
    this.socket.on('error', (error) => {
      this.handleError(error);
    });
  }
  
  monitorTransaction(txHash) {
    this.socket.emit('monitorTransaction', { transactionHash: txHash });
  }
  
  requestBalanceUpdate(tokenAddresses) {
    this.socket.emit('requestBalanceUpdate', tokenAddresses);
  }
  
  disconnect() {
    this.socket.disconnect();
  }
}

// Usage
const ws = new ZKFairWebSocket('your-jwt-token');

// Monitor a transaction
ws.monitorTransaction('0x123...');

// Request balance updates
ws.requestBalanceUpdate(['0x456...', '0x789...']);
```

## Best Practices

1. **Authentication**: Always authenticate before subscribing to events
2. **Rate Limiting**: Implement client-side rate limiting to avoid server limits
3. **Error Handling**: Always implement error handlers for robust applications
4. **Reconnection**: Handle reconnection events to restore subscriptions
5. **Cleanup**: Unsubscribe from events when no longer needed
6. **Metrics**: Monitor server metrics to ensure good performance

## Security Considerations

1. **JWT Expiration**: Handle token expiration and refresh
2. **SSL/TLS**: Always use secure WebSocket connections (wss://)
3. **Input Validation**: Validate all data before sending to server
4. **Rate Limiting**: Respect server rate limits to avoid disconnection

## Troubleshooting

### Connection Issues
- Check authentication token validity
- Verify network connectivity
- Check if WebSocket port is open (usually 443 for wss)

### Missing Events
- Ensure proper subscription to events
- Check room membership for wallet/user specific events
- Verify authentication includes necessary permissions

### Performance Issues
- Monitor client-side event handling performance
- Implement debouncing for frequent updates
- Use event filtering to reduce unnecessary data

---

For more information, see the [ZKFair Developer Documentation](https://docs.zkfair.io).