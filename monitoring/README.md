# ZKFair L2 Monitoring & Operations

## Overview

This monitoring stack provides comprehensive observability for the ZKFair L2 blockchain, including:

- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards
- **Alertmanager**: Alert routing and notifications
- **Custom Exporters**: Blockchain and contract-specific metrics
- **Automated Scripts**: Health checks, backups, and maintenance

## Quick Start

### 1. Prerequisites

```bash
# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install additional tools
apt-get update && apt-get install -y jq bc postgresql-client
```

### 2. Configuration

Create a `.env` file in the monitoring directory:

```bash
# Grafana
GRAFANA_ADMIN_PASSWORD=your_secure_password
GRAFANA_DB_PASSWORD=your_db_password
GRAFANA_SECRET_KEY=your_secret_key

# PostgreSQL Monitoring
POSTGRES_MONITORING_PASSWORD=monitoring_password

# Redis
REDIS_PASSWORD=redis_password

# Contract Addresses
ENTRY_POINT_ADDRESS=0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
PAYMASTER_ADDRESS=0x...
FACTORY_ADDRESS=0x...

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
TELEGRAM_BOT_TOKEN=bot_token
TELEGRAM_CHAT_ID=chat_id

# S3 Backup (optional)
S3_BUCKET=zkfair-backups
S3_ENDPOINT=https://s3.amazonaws.com
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
```

### 3. Start Monitoring Stack

```bash
cd monitoring
docker-compose up -d
```

### 4. Access Services

- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Blockchain    │────▶│   Prometheus    │────▶│    Grafana      │
│   Components    │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐     ┌─────────────────┐
         │              │  Alertmanager   │────▶│  Notifications  │
         │              │                 │     │ Slack/Discord   │
         │              └─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│   Exporters     │
│ - Node Exporter │
│ - Contract Exp. │
│ - Blackbox Exp. │
└─────────────────┘
```

## Dashboards

### 1. Blockchain Overview
- Block production rate
- Transaction throughput
- Gas prices
- Peer connectivity

### 2. ERC-4337 Metrics
- UserOperation processing
- Paymaster balance and usage
- Smart wallet creation
- Gas sponsorship costs

### 3. Celestia Data Availability
- Data submission rates
- Submission latency
- Storage usage
- Cost tracking

### 4. Infrastructure
- System resources (CPU, Memory, Disk)
- Container health
- Database performance
- Network metrics

## Alerts

### Critical Alerts
- Block production stopped
- Paymaster balance depleted
- Celestia submission failures
- Service outages

### Warning Alerts
- High resource usage
- Slow transaction processing
- Low peer count
- Approaching limits

## Operational Scripts

### Health Check
```bash
./scripts/health-check.sh
```
Performs comprehensive health checks on all components.

### Backup
```bash
./scripts/backup.sh
```
Creates backups of:
- PostgreSQL database
- Contract configurations
- Grafana dashboards
- Prometheus snapshots

### Service Restart
```bash
# Restart specific service
./scripts/restart-services.sh backend

# Restart all services
./scripts/restart-services.sh --all

# Restart monitoring stack
./scripts/restart-services.sh --monitoring
```

### Log Collection
```bash
./scripts/log-collector.sh
```
Collects logs from all services for debugging.

### Paymaster Top-up
```bash
./scripts/paymaster-topup.sh
```
Automatically tops up Paymaster when balance is low.

## Automation

### Cron Jobs

Install the cron configuration:
```bash
sudo cp scripts/cron.d/zkfair /etc/cron.d/
sudo chmod 644 /etc/cron.d/zkfair
```

This sets up:
- Health checks every 5 minutes
- Paymaster balance checks every 30 minutes
- Daily backups at 2 AM
- Weekly log cleanup

### Alerting Rules

Alerts are configured in:
- `prometheus/alerts/blockchain.yml`
- `prometheus/alerts/erc4337.yml`
- `prometheus/alerts/celestia.yml`
- `prometheus/alerts/infrastructure.yml`

## Troubleshooting

### Check Service Status
```bash
docker-compose ps
docker-compose logs -f [service-name]
```

### Verify Metrics Collection
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check specific metric
curl http://localhost:9090/api/v1/query?query=up
```

### Test Alerting
```bash
# Send test alert
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": {
      "alertname": "TestAlert",
      "severity": "info"
    },
    "annotations": {
      "summary": "This is a test alert"
    }
  }]'
```

### Export/Import Dashboards
```bash
# Export all dashboards
for uid in $(curl -s http://localhost:3000/api/search | jq -r '.[] | .uid'); do
  curl -s http://localhost:3000/api/dashboards/uid/$uid | \
    jq '.dashboard' > dashboards/${uid}.json
done

# Import dashboard
curl -X POST http://localhost:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @dashboards/blockchain-overview.json
```

## Best Practices

1. **Regular Backups**: Ensure automated backups are working and test restoration procedures.

2. **Alert Fatigue**: Tune alert thresholds to reduce false positives.

3. **Capacity Planning**: Monitor trends to predict resource needs.

4. **Security**: 
   - Use strong passwords for all services
   - Restrict access to monitoring endpoints
   - Enable TLS for external access

5. **Updates**: Regularly update monitoring components for security patches.

## Scaling

For production deployments:

1. **High Availability**:
   - Deploy Prometheus in HA mode with remote storage
   - Use Grafana with external database
   - Configure Alertmanager clustering

2. **Long-term Storage**:
   - Configure Prometheus remote write to Cortex/Thanos
   - Set appropriate retention policies

3. **Performance**:
   - Tune scrape intervals based on needs
   - Use recording rules for expensive queries
   - Implement metric cardinality limits

## Support

For issues or questions:
1. Check logs: `docker-compose logs [service]`
2. Review documentation
3. Contact the DevOps team

---

Last Updated: $(date)