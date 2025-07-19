# ZKFair L2 Admin Panel Documentation

## Overview

The ZKFair L2 Admin Panel is a comprehensive management interface for system administrators to monitor, configure, and control the Layer 2 platform. It provides real-time insights, security monitoring, and operational controls.

## Features

### 1. Dashboard
- **Real-time Statistics**: View key metrics including total users, transactions, volume, and system health
- **Activity Charts**: Visual representation of transaction volume, user growth, and gas usage trends
- **Recent Activity Feed**: Monitor latest transactions and user activities
- **System Health Indicators**: CPU, memory, disk usage, and network latency monitoring

### 2. User Management
- **User Directory**: Browse and search all platform users
- **Account Details**: View user addresses, smart wallet status, transaction history
- **Bulk Actions**: Activate, suspend, or manage multiple users simultaneously
- **Role Management**: Assign admin privileges to trusted users
- **Export Functionality**: Download user data for reporting

### 3. Smart Wallet Management
- **Wallet Overview**: Monitor all ERC-4337 smart contract wallets
- **Deployment Status**: Track deployed vs undeployed wallets
- **Balance Monitoring**: Real-time balance updates and refresh capability
- **Transaction History**: View wallet-specific transaction records
- **Module Management**: See installed wallet modules and extensions

### 4. Transaction Monitoring
- **Transaction List**: Real-time view of all UserOperations and transactions
- **Advanced Filtering**: Filter by status, date range, address, and more
- **Success Metrics**: Monitor success rates and failure patterns
- **Gas Analytics**: Track gas consumption by token type (USDC/USDT/Native)
- **Export Reports**: Generate CSV reports for accounting and analysis

### 5. Analytics Dashboard
- **Volume Metrics**: Track total transaction volume with trend analysis
- **User Analytics**: Monitor user growth, retention, and activity patterns
- **Gas Usage Distribution**: Visualize gas payment token preferences
- **Performance Metrics**: Average bundle time, success rates, and costs
- **Top Operations**: Identify most common transaction types
- **Top Gas Consumers**: Monitor high-volume users

### 6. Security Center
- **Real-time Threat Detection**: Monitor authentication failures, rate limits, and suspicious activities
- **Security Events**: Track and manage security incidents with severity levels
- **Quick Actions**: Emergency pause, key rotation, force 2FA, session revocation
- **Security Policies**: Configure login attempts, session timeouts, IP whitelisting
- **Audit Trail**: View admin actions and system changes

### 7. Alert Management
- **Alert Rules**: Create threshold, anomaly, and pattern-based alerts
- **Notification Channels**: Configure email, SMS, Slack, and webhook notifications
- **Alert History**: Track triggered alerts and response times
- **Rule Management**: Enable/disable rules, set severity levels
- **Channel Configuration**: Manage notification recipients and settings

### 8. System Configuration
- **Paymaster Settings**: Configure daily limits, transaction limits, whitelist rules
- **Bundler Configuration**: Adjust bundle size, intervals, and gas pricing
- **Gas Settings**: Manage exchange rates, markup percentages, auto-refill
- **Network Configuration**: Update RPC endpoints, Celestia nodes, confirmations
- **Emergency Controls**: System-wide pause functionality for critical situations

## Access Control

### Authentication
- Web3 signature-based authentication
- JWT tokens with refresh capability
- Session management with configurable timeouts

### Authorization
- Role-based access control (RBAC)
- Admin role required for all admin panel access
- Granular permissions for specific operations

## Technical Architecture

### Frontend
- **Framework**: React with TypeScript
- **UI Library**: Tailwind CSS with Heroicons
- **State Management**: React hooks and context
- **Charts**: Chart.js with react-chartjs-2
- **Routing**: React Router v6

### Backend
- **API**: Express.js REST API
- **Authentication**: JWT with refresh tokens
- **Database**: PostgreSQL with Prisma ORM
- **Validation**: Zod schema validation
- **Security**: Helmet, rate limiting, CORS protection

### Real-time Updates
- WebSocket connections for live data
- Automatic refresh intervals for metrics
- Push notifications for critical alerts

## Security Considerations

1. **Authentication Security**
   - Secure Web3 signature verification
   - JWT tokens with short expiration
   - Refresh token rotation

2. **API Security**
   - Rate limiting per user and IP
   - Request validation and sanitization
   - HTTPS enforcement

3. **Data Protection**
   - Sensitive data encryption
   - Audit logging for all admin actions
   - Regular security scans

4. **Access Control**
   - Principle of least privilege
   - Regular permission audits
   - Multi-factor authentication support

## Best Practices

1. **Monitoring**
   - Regular review of security events
   - Alert threshold tuning
   - Performance baseline establishment

2. **Maintenance**
   - Regular backup verification
   - System update scheduling
   - Configuration change documentation

3. **Incident Response**
   - Clear escalation procedures
   - Emergency contact lists
   - Post-incident reviews

## API Endpoints

### Dashboard
- `GET /api/admin/dashboard` - Get dashboard statistics

### Users
- `GET /api/admin/users` - List users with pagination
- `POST /api/admin/users/bulk-action` - Perform bulk actions

### Smart Wallets
- `GET /api/admin/smart-wallets` - List smart wallets
- `POST /api/admin/smart-wallets/:address/refresh` - Refresh wallet balance

### Transactions
- `GET /api/admin/transactions` - List transactions
- `GET /api/admin/transactions/stats` - Get transaction statistics
- `POST /api/admin/transactions/export` - Export transactions

### Analytics
- `GET /api/admin/analytics` - Get analytics data

### Security
- `GET /api/admin/security/events` - List security events
- `POST /api/admin/security/events/:id/resolve` - Resolve security event

### Alerts
- `GET /api/admin/alerts/rules` - List alert rules
- `GET /api/admin/alerts/channels` - List notification channels
- `PATCH /api/admin/alerts/rules/:id` - Update alert rule
- `DELETE /api/admin/alerts/rules/:id` - Delete alert rule

### System
- `GET /api/admin/system/config` - Get system configuration
- `PUT /api/admin/system/config` - Update system configuration
- `GET /api/admin/system/metrics` - Get system metrics
- `POST /api/admin/system/emergency-pause` - Activate emergency pause

## Deployment

1. **Environment Variables**
   ```env
   ADMIN_JWT_SECRET=your-secret-key
   ADMIN_ALLOWED_ORIGINS=https://admin.zkfair.com
   ADMIN_SESSION_TIMEOUT=1800
   ```

2. **Database Setup**
   ```bash
   npx prisma migrate deploy
   npx prisma db seed
   ```

3. **Initial Admin User**
   ```bash
   npm run create-admin -- --address=0x...
   ```

4. **SSL Configuration**
   - Configure HTTPS for production
   - Set secure cookie flags
   - Enable HSTS headers

## Troubleshooting

### Common Issues

1. **Login Problems**
   - Verify wallet connection
   - Check admin role assignment
   - Clear browser cache

2. **Data Not Updating**
   - Check WebSocket connection
   - Verify API endpoints
   - Review browser console

3. **Performance Issues**
   - Check database indexes
   - Review query optimization
   - Monitor server resources

### Support

For technical support:
- Email: admin-support@zkfair.com
- Documentation: https://docs.zkfair.com/admin
- Emergency: Use emergency contact procedures