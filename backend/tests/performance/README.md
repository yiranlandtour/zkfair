# Performance Testing Suite

This directory contains comprehensive performance tests for the ZKFair platform using k6.

## Test Types

### 1. Load Test (`load-test.js`)
Tests system behavior under normal expected load conditions.
- Ramps up to 100 concurrent users
- Includes spike to 200 users
- Tests all major user flows (auth, transactions, analytics)
- Validates response times and error rates

### 2. Stress Test (`stress-test.js`)
Pushes the system beyond normal capacity to find breaking points.
- Ramps up to 3000 concurrent users
- Tests extreme scenarios (large payloads, rapid requests)
- Identifies system limits and failure modes
- Monitors critical errors and recovery

### 3. Spike Test (`spike-test.js`)
Tests system response to sudden traffic increases.
- Normal load followed by sudden spikes
- Measures response time during spikes
- Tests recovery after spike subsides
- Identifies bottlenecks during rapid scaling

### 4. Soak Test (`soak-test.js`)
Extended duration test to identify memory leaks and degradation.
- Runs for 4+ hours at moderate load
- Monitors for memory leaks
- Tracks performance degradation over time
- Tests system stability for production scenarios

## Running Tests

### Prerequisites
1. Install k6:
```bash
# macOS
brew install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker pull grafana/k6
```

2. Set up test data:
```bash
# Ensure test users exist in the database
# The test-data/users.json file contains sample users
```

### Running Individual Tests

```bash
# Load test
k6 run load-test.js

# With custom environment
k6 run -e BASE_URL=https://api.zkfair.com load-test.js

# Stress test
k6 run stress-test.js

# Spike test
k6 run spike-test.js

# Soak test (long duration)
k6 run soak-test.js
```

### Running with Output

```bash
# JSON output
k6 run --out json=results.json load-test.js

# InfluxDB output (for Grafana)
k6 run --out influxdb=http://localhost:8086/k6 load-test.js

# Multiple outputs
k6 run --out json=results.json --out influxdb=http://localhost:8086/k6 load-test.js
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run Load Test
  uses: grafana/k6-action@v0.2.0
  with:
    filename: backend/tests/performance/load-test.js
    flags: --out json=results.json
  env:
    BASE_URL: ${{ secrets.TEST_API_URL }}
```

## Test Scenarios

### Authentication Flow
- User registration
- Login/logout
- Token refresh
- Protected endpoint access

### Transaction Flow
- Balance checking
- Gas estimation
- Transaction sending
- Status checking
- History retrieval

### Analytics Flow
- User analytics queries
- Transaction statistics
- System metrics
- Dashboard summaries

### Admin Operations
- User management
- System configuration
- Monitoring queries

## Metrics and Thresholds

### Key Metrics
- `http_req_duration`: Response time
- `http_req_failed`: Failed request rate
- `api_success_rate`: Custom success metric
- `transaction_duration`: End-to-end transaction time

### Default Thresholds
- 95% of requests < 500ms
- 99% of requests < 1000ms
- Error rate < 10%
- Success rate > 90%

## Analyzing Results

### HTML Reports
Each test generates an HTML report with:
- Visual charts
- Phase-by-phase analysis
- Recommendations
- Detailed metrics

### JSON Output
Raw metrics for further analysis:
```bash
# Analyze with jq
cat results.json | jq '.metrics.http_req_duration.p95'
```

### Grafana Dashboards
1. Set up InfluxDB
2. Configure k6 to output to InfluxDB
3. Import k6 dashboard to Grafana
4. Monitor real-time during tests

## Best Practices

1. **Warm-up Period**: All tests include warm-up stages
2. **Realistic Data**: Use production-like test data
3. **Think Time**: Simulate real user behavior with sleeps
4. **Error Handling**: Tests continue despite individual failures
5. **Resource Monitoring**: Monitor server resources during tests

## Troubleshooting

### High Error Rate
- Check server logs
- Verify test data exists
- Ensure proper authentication
- Check rate limits

### Connection Errors
- Verify BASE_URL
- Check firewall rules
- Ensure server capacity
- Monitor connection pools

### Memory Issues
- Run soak test to identify leaks
- Monitor heap usage
- Check for connection leaks
- Review caching strategy

## Environment Variables

- `BASE_URL`: API endpoint (default: http://localhost:3000)
- `TEST_DURATION`: Override test duration
- `TARGET_VUS`: Override target virtual users
- `DEBUG`: Enable debug logging