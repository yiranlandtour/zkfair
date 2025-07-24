# Notification Service API Documentation

## Overview

The ZKFair notification service provides multi-channel notification delivery including email, SMS, push notifications, webhooks, and in-app notifications. It supports user preferences, rate limiting, templating, and analytics.

## Supported Channels

### Email
- **Providers**: SendGrid, AWS SES, SMTP
- **Features**: HTML templates, attachments, tracking, custom headers
- **Configuration**: See EMAIL_* environment variables

### SMS
- **Providers**: Twilio, AWS SNS, MessageBird
- **Features**: International delivery, status callbacks, message length handling
- **Configuration**: See SMS_* environment variables

### Push Notifications
- **Providers**: Firebase Cloud Messaging (FCM), Apple Push Notification Service (APNs)
- **Features**: iOS/Android/Web support, rich notifications, deep linking
- **Configuration**: See FIREBASE_* and APNS_* environment variables

### Webhooks
- **Features**: Custom HTTP callbacks, retry logic, signature verification
- **Configuration**: Configured per user/integration

### In-App
- **Features**: Real-time delivery via WebSocket, persistent storage
- **Configuration**: Automatic for connected users

## API Endpoints

### Send Notification
```http
POST /api/notifications/send
Authorization: Bearer {token}
Content-Type: application/json

{
  "type": "TRANSACTION_CONFIRMED",
  "userId": "user123",
  "data": {
    "transactionHash": "0x...",
    "amount": "100",
    "token": "USDC",
    "confirmations": 12
  },
  "channels": ["email", "push"], // Optional, uses user preferences if not specified
  "severity": "normal", // Optional: critical, high, normal, low
  "metadata": {
    "campaignId": "tx-confirm-2024"
  }
}
```

### Get User Preferences
```http
GET /api/notifications/preferences
Authorization: Bearer {token}
```

### Update User Preferences
```http
PUT /api/notifications/preferences
Authorization: Bearer {token}
Content-Type: application/json

{
  "channels": {
    "email": {
      "enabled": true,
      "verified": true,
      "address": "user@example.com",
      "preferences": {
        "instant": ["TRANSACTION_CONFIRMED", "SECURITY_ALERT"],
        "digest": ["NEW_PROPOSAL", "VOTING_REMINDER"],
        "disabled": ["PROMOTIONAL"]
      }
    },
    "sms": {
      "enabled": true,
      "verified": true,
      "phoneNumber": "+1234567890",
      "preferences": {
        "instant": ["SECURITY_ALERT"],
        "disabled": ["PROMOTIONAL", "EDUCATIONAL"]
      }
    },
    "push": {
      "enabled": true,
      "verified": true,
      "tokens": [
        {
          "token": "device-token-123",
          "platform": "ios",
          "deviceName": "iPhone 14"
        }
      ]
    }
  },
  "categories": {
    "transactions": true,
    "security": true,
    "governance": true,
    "system": true,
    "marketing": false
  },
  "quietHours": {
    "enabled": true,
    "start": "22:00",
    "end": "08:00",
    "timezone": "America/New_York"
  },
  "language": "en"
}
```

### Register Device for Push Notifications
```http
POST /api/notifications/devices
Authorization: Bearer {token}
Content-Type: application/json

{
  "token": "fcm-or-apns-token",
  "platform": "ios", // ios, android, web
  "deviceName": "iPhone 14 Pro",
  "appVersion": "1.2.3"
}
```

### Get Notification History
```http
GET /api/notifications/history?page=1&limit=20&channel=email
Authorization: Bearer {token}
```

### Get Queue Status (Admin)
```http
GET /api/notifications/admin/queue-status
Authorization: Bearer {admin-token}
```

### Send Broadcast (Admin)
```http
POST /api/notifications/admin/broadcast
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "type": "MAINTENANCE_NOTICE",
  "data": {
    "title": "Scheduled Maintenance",
    "message": "The platform will be under maintenance from 2 AM to 4 AM UTC",
    "startTime": "2024-01-15T02:00:00Z",
    "endTime": "2024-01-15T04:00:00Z"
  },
  "channels": ["email", "push", "inApp"],
  "filters": {
    "userType": "all", // all, active, premium
    "lastActiveWithin": 30 // days
  }
}
```

## Notification Types

```typescript
enum NotificationType {
  // Transactions
  TRANSACTION_SENT = 'TRANSACTION_SENT',
  TRANSACTION_CONFIRMED = 'TRANSACTION_CONFIRMED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  GAS_PRICE_ALERT = 'GAS_PRICE_ALERT',
  
  // Security
  LOGIN_ALERT = 'LOGIN_ALERT',
  SECURITY_ALERT = 'SECURITY_ALERT',
  WALLET_RECOVERY = 'WALLET_RECOVERY',
  
  // Account
  BALANCE_UPDATE = 'BALANCE_UPDATE',
  
  // Governance
  NEW_PROPOSAL = 'NEW_PROPOSAL',
  VOTING_REMINDER = 'VOTING_REMINDER',
  PROPOSAL_OUTCOME = 'PROPOSAL_OUTCOME',
  PROPOSAL_EXECUTION = 'PROPOSAL_EXECUTION',
  
  // System
  MAINTENANCE_NOTICE = 'MAINTENANCE_NOTICE',
  FEATURE_UPDATE = 'FEATURE_UPDATE',
  SECURITY_UPDATE = 'SECURITY_UPDATE',
  NETWORK_STATUS = 'NETWORK_STATUS',
  
  // Marketing
  PROMOTIONAL = 'PROMOTIONAL',
  EDUCATIONAL = 'EDUCATIONAL',
  COMMUNITY = 'COMMUNITY'
}
```

## Rate Limiting

Default rate limits per user:
- Overall: 100 notifications per hour
- Email: 50 per hour
- SMS: 20 per hour
- Push: 100 per hour
- Webhook: 200 per hour
- In-App: 500 per hour

## Webhook Integration

### Webhook Format
```json
{
  "id": "notif_abc123",
  "type": "TRANSACTION_CONFIRMED",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    // Event-specific data
  },
  "signature": "sha256=..."
}
```

### Signature Verification
Webhooks include an HMAC-SHA256 signature in the `X-ZKFair-Signature` header:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}
```

## Templates

Email templates support the following variables:
- `{{userName}}` - User's display name
- `{{walletAddress}}` - User's wallet address
- `{{transactionHash}}` - Transaction hash
- `{{amount}}` - Transaction amount
- `{{token}}` - Token symbol
- `{{confirmations}}` - Number of confirmations
- `{{networkName}}` - Network name
- `{{timestamp}}` - Formatted timestamp
- `{{actionUrl}}` - Call-to-action URL

## Error Handling

### Error Response Format
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many notifications sent",
    "details": {
      "limit": 100,
      "window": "1h",
      "retry_after": 1800
    }
  }
}
```

### Common Error Codes
- `INVALID_NOTIFICATION_TYPE` - Unknown notification type
- `RATE_LIMIT_EXCEEDED` - Rate limit exceeded
- `CHANNEL_NOT_CONFIGURED` - Channel not configured for user
- `INVALID_CHANNEL` - Unknown channel type
- `DELIVERY_FAILED` - Failed to deliver notification
- `TEMPLATE_NOT_FOUND` - Template not found
- `USER_NOT_FOUND` - User not found

## Best Practices

1. **Channel Selection**: Let users choose their preferred channels per notification type
2. **Rate Limiting**: Implement proper rate limiting to prevent spam
3. **Retry Logic**: Failed notifications are automatically retried with exponential backoff
4. **Templates**: Use templates for consistent messaging across channels
5. **Localization**: Support multiple languages based on user preferences
6. **Analytics**: Track delivery rates and user engagement
7. **Quiet Hours**: Respect user-defined quiet hours for non-critical notifications
8. **Batching**: Use digest notifications for less urgent updates

## WebSocket Events

Real-time notification events via WebSocket:

```javascript
// Subscribe to in-app notifications
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'notifications'
}));

// Receive notifications
ws.on('message', (data) => {
  const message = JSON.parse(data);
  if (message.type === 'notification') {
    console.log('New notification:', message.data);
  }
});
```

## Testing

In development/sandbox mode:
- Email: Logs to console instead of sending
- SMS: Logs to console instead of sending
- Push: Logs to console instead of sending
- Webhooks: Can be tested with local endpoints

Set `*_SANDBOX=true` environment variables to enable sandbox mode for each channel.