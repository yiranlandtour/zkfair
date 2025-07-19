export const websocketConfig = {
  // Connection settings
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 10000,
  
  // Rate limiting
  maxHttpBufferSize: 1e6, // 1MB
  maxEventsPerSecond: 100,
  
  // Room limits
  maxRoomsPerClient: 10,
  
  // Subscription limits
  maxSubscriptionsPerClient: 20,
  
  // Cache settings
  userOpStatusCacheTTL: 300, // 5 minutes
  balanceCacheTTL: 30, // 30 seconds
  blockCacheTTL: 60, // 1 minute
  
  // Retry settings
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  
  // Event names
  events: {
    // Client -> Server
    SUBSCRIBE: 'subscribe',
    UNSUBSCRIBE: 'unsubscribe',
    GET_USEROP_STATUS: 'getUserOpStatus',
    REQUEST_BALANCE_UPDATE: 'requestBalanceUpdate',
    SIMULATE_TRANSACTION: 'simulateTransaction',
    
    // Server -> Client
    SUBSCRIBED: 'subscribed',
    UNSUBSCRIBED: 'unsubscribed',
    NEW_BLOCK: 'newBlock',
    USEROP_UPDATE: 'userOpUpdate',
    USEROP_STATUS: 'userOpStatus',
    BALANCE_UPDATE: 'balanceUpdate',
    SIMULATION_RESULT: 'simulationResult',
    ERROR: 'error',
    
    // Connection events
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error',
    RECONNECT: 'reconnect',
    RECONNECT_ERROR: 'reconnect_error',
  },
  
  // Error codes
  errorCodes: {
    AUTHENTICATION_REQUIRED: 'AUTH_REQUIRED',
    AUTHENTICATION_FAILED: 'AUTH_FAILED',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT',
    INVALID_REQUEST: 'INVALID_REQUEST',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    SUBSCRIPTION_LIMIT: 'SUB_LIMIT',
    ROOM_LIMIT: 'ROOM_LIMIT',
  },
};

export default websocketConfig;