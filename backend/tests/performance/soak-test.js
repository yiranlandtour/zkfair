import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend, Gauge } from 'k6/metrics';
import exec from 'k6/execution';

// Soak test metrics - focus on long-term stability
const memoryLeaks = new Counter('memory_leaks_suspected');
const performanceDegradation = new Rate('performance_degradation');
const connectionErrors = new Counter('connection_errors');
const cacheHitRate = new Rate('cache_hit_rate');
const responseTimeDeviation = new Trend('response_time_deviation');
const activeConnections = new Gauge('active_connections');

// Soak test - extended duration at moderate load
export const options = {
  stages: [
    { duration: '5m', target: 100 },    // Ramp up
    { duration: '4h', target: 100 },    // Sustain load for 4 hours
    { duration: '5m', target: 0 },      // Ramp down
  ],
  thresholds: {
    http_req_duration: [
      'p(95)<1000',     // 95% under 1s
      'p(99)<2000',     // 99% under 2s
    ],
    http_req_failed: ['rate<0.05'],     // Error rate under 5%
    memory_leaks_suspected: ['count<10'], // Minimal memory leak indicators
    performance_degradation: ['rate<0.1'], // Performance degradation under 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Baseline metrics collected during ramp-up
let baselineMetrics = {
  responseTime: null,
  errorRate: null,
  throughput: null,
};

// Track long-term patterns
let requestCounter = 0;
let startTime = Date.now();
let checkpointMetrics = [];

export default function () {
  const testRunTime = (Date.now() - startTime) / 1000; // seconds
  const currentHour = Math.floor(testRunTime / 3600);
  
  // Collect baseline during first 5 minutes
  if (testRunTime < 300 && !baselineMetrics.responseTime) {
    collectBaseline();
  }

  // Regular user behavior simulation
  const userId = `soak_user_${__VU}`;
  const scenarios = [
    () => authenticatedUserFlow(userId),
    () => transactionFlow(userId),
    () => analyticsFlow(userId),
    () => walletOperations(userId),
    () => batchOperations(userId),
  ];

  // Execute random scenario
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  const startReqTime = Date.now();
  
  try {
    scenario();
  } catch (error) {
    connectionErrors.add(1);
    console.error(`Error in scenario: ${error}`);
  }

  const requestDuration = Date.now() - startReqTime;

  // Check for performance degradation
  if (baselineMetrics.responseTime && testRunTime > 300) {
    const degradation = requestDuration / baselineMetrics.responseTime;
    performanceDegradation.add(degradation > 1.5); // 50% slower than baseline
    responseTimeDeviation.add(degradation);
  }

  // Periodic health checks
  if (++requestCounter % 100 === 0) {
    performHealthCheck();
  }

  // Hourly checkpoint
  if (requestCounter % 3600 === 0) {
    collectCheckpoint(currentHour);
  }

  // Vary sleep to simulate real user patterns
  const hour = new Date().getHours();
  const sleepTime = hour >= 9 && hour <= 17 
    ? Math.random() * 2 + 1  // Business hours: 1-3s
    : Math.random() * 5 + 2; // Off hours: 2-7s
    
  sleep(sleepTime);
}

function collectBaseline() {
  const responses = [];
  
  // Make several requests to establish baseline
  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/health`);
    responses.push({
      duration: Date.now() - start,
      status: res.status,
    });
  }

  const avgDuration = responses.reduce((sum, r) => sum + r.duration, 0) / responses.length;
  const errorCount = responses.filter(r => r.status !== 200).length;
  
  baselineMetrics = {
    responseTime: avgDuration,
    errorRate: errorCount / responses.length,
    throughput: responses.length,
  };
}

function authenticatedUserFlow(userId) {
  // Login or use existing session
  const sessionKey = `session_${userId}`;
  let token = __ENV[sessionKey];
  
  if (!token || Math.random() < 0.1) { // 10% chance to re-login
    const loginRes = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({
        email: `${userId}@soaktest.com`,
        password: 'SoakTest123!',
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (loginRes.status === 200) {
      token = loginRes.json('token');
      __ENV[sessionKey] = token;
    }
  }

  if (token) {
    // Perform authenticated operations
    const operations = [
      () => http.get(`${BASE_URL}/api/user/profile`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }),
      () => http.get(`${BASE_URL}/api/wallet/balance`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }),
      () => http.get(`${BASE_URL}/api/transactions?page=1&pageSize=20`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }),
    ];

    operations.forEach(op => {
      const res = op();
      check(res, {
        'authenticated request successful': (r) => r.status === 200,
      });
      
      // Check for cache headers
      if (res.headers['X-Cache-Status']) {
        cacheHitRate.add(res.headers['X-Cache-Status'] === 'HIT');
      }
    });
  }

  activeConnections.add(__VU);
}

function transactionFlow(userId) {
  const token = __ENV[`session_${userId}`];
  if (!token) return;

  // Estimate gas
  const estimateRes = http.post(
    `${BASE_URL}/api/transactions/estimate`,
    JSON.stringify({
      to: '0x' + Math.random().toString(16).substr(2, 40),
      value: Math.floor(Math.random() * 1e18).toString(),
      data: '0x',
    }),
    { 
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  check(estimateRes, {
    'gas estimation successful': (r) => r.status === 200,
  });

  // Simulate transaction sending (lower frequency)
  if (Math.random() < 0.1) {
    const sendRes = http.post(
      `${BASE_URL}/api/transactions/send`,
      JSON.stringify({
        to: '0x' + Math.random().toString(16).substr(2, 40),
        value: '1000000000000000',
        gasLimit: '21000',
      }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    check(sendRes, {
      'transaction sent': (r) => r.status === 201 || r.status === 400,
    });
  }
}

function analyticsFlow(userId) {
  const token = __ENV[`session_${userId}`];
  if (!token) return;

  const queries = [
    '/api/analytics/dashboard',
    '/api/analytics/users?period=7d',
    '/api/analytics/transactions?period=30d',
    '/api/analytics/gas/history?days=7',
  ];

  queries.forEach(query => {
    const res = http.get(`${BASE_URL}${query}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      tags: { name: 'analytics_query' },
    });

    check(res, {
      'analytics query successful': (r) => r.status === 200,
    });
  });
}

function walletOperations(userId) {
  const token = __ENV[`session_${userId}`];
  if (!token) return;

  // Get wallet info
  const walletRes = http.get(`${BASE_URL}/api/wallet/info`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  check(walletRes, {
    'wallet info retrieved': (r) => r.status === 200,
  });

  // Check multi-sig status
  if (Math.random() < 0.3) {
    http.get(`${BASE_URL}/api/multisig/wallets`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
  }

  // Check recovery settings
  if (Math.random() < 0.2) {
    http.get(`${BASE_URL}/api/recovery/guardians`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
  }
}

function batchOperations(userId) {
  const token = __ENV[`session_${userId}`];
  if (!token) return;

  // Get batch templates
  const templatesRes = http.get(`${BASE_URL}/api/batch/templates`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (templatesRes.status === 200) {
    const templates = templatesRes.json('templates');
    
    // Occasionally execute a batch
    if (templates && templates.length > 0 && Math.random() < 0.05) {
      const template = templates[0];
      
      http.post(
        `${BASE_URL}/api/transactions/batch`,
        JSON.stringify({
          templateId: template.id,
          transactions: template.transactions,
        }),
        { 
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }
      );
    }
  }
}

function performHealthCheck() {
  const healthRes = http.get(`${BASE_URL}/health/detailed`);
  
  if (healthRes.status === 200) {
    const health = healthRes.json();
    
    // Check for memory issues
    if (health.memory && health.memory.heapUsed / health.memory.heapTotal > 0.9) {
      memoryLeaks.add(1);
    }
    
    // Check database connections
    if (health.database && health.database.activeConnections > 100) {
      console.warn(`High DB connections: ${health.database.activeConnections}`);
    }
    
    // Check Redis memory
    if (health.redis && health.redis.memoryUsage > 1e9) { // 1GB
      console.warn(`High Redis memory: ${health.redis.memoryUsage}`);
    }
  }
}

function collectCheckpoint(hour) {
  const checkpoint = {
    hour,
    timestamp: new Date().toISOString(),
    metrics: {
      totalRequests: http.requests,
      errorRate: http.errors / http.requests,
      avgResponseTime: http.duration / http.requests,
      activeVUs: __VU,
      performanceDegradation: performanceDegradation.rate,
    },
  };
  
  checkpointMetrics.push(checkpoint);
  console.log(`Hour ${hour} checkpoint:`, JSON.stringify(checkpoint));
}

export function handleSummary(data) {
  const soakReport = generateSoakReport(data);
  
  return {
    'soak-test-report.html': soakReport,
    'soak-test-checkpoints.json': JSON.stringify(checkpointMetrics, null, 2),
    stdout: generateTextSummary(data),
  };
}

function generateSoakReport(data) {
  const testDuration = data.state.testRunDurationMs / 1000 / 3600; // hours
  
  return `
<!DOCTYPE html>
<html>
<head>
    <title>Soak Test Report - ${testDuration.toFixed(1)} Hours</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f0f0f0; padding: 20px; margin: 20px 0; }
        .metric-card { display: inline-block; margin: 10px; padding: 15px; background: white; border: 1px solid #ddd; }
        .good { color: green; }
        .warning { color: orange; }
        .bad { color: red; }
        .chart { margin: 20px 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    </style>
</head>
<body>
    <h1>ZKFair Soak Test Report</h1>
    
    <div class="summary">
        <h2>Test Summary</h2>
        <p><strong>Duration:</strong> ${testDuration.toFixed(1)} hours</p>
        <p><strong>Total Requests:</strong> ${data.metrics.http_reqs.count.toLocaleString()}</p>
        <p><strong>Average Load:</strong> ${data.metrics.vus.avg.toFixed(0)} concurrent users</p>
    </div>
    
    <h2>Stability Metrics</h2>
    <div class="metric-card">
        <h3>Performance Degradation</h3>
        <p class="${data.metrics.performance_degradation.rate < 0.1 ? 'good' : 'bad'}">
            ${(data.metrics.performance_degradation.rate * 100).toFixed(2)}%
        </p>
    </div>
    
    <div class="metric-card">
        <h3>Memory Leak Indicators</h3>
        <p class="${data.metrics.memory_leaks_suspected.count < 10 ? 'good' : 'bad'}">
            ${data.metrics.memory_leaks_suspected.count} suspected
        </p>
    </div>
    
    <div class="metric-card">
        <h3>Connection Errors</h3>
        <p class="${data.metrics.connection_errors.count < 100 ? 'good' : 'warning'}">
            ${data.metrics.connection_errors.count} errors
        </p>
    </div>
    
    <div class="metric-card">
        <h3>Cache Hit Rate</h3>
        <p class="${data.metrics.cache_hit_rate.rate > 0.7 ? 'good' : 'warning'}">
            ${(data.metrics.cache_hit_rate.rate * 100).toFixed(2)}%
        </p>
    </div>
    
    <h2>Response Time Analysis</h2>
    <table>
        <tr>
            <th>Percentile</th>
            <th>Response Time (ms)</th>
            <th>Status</th>
        </tr>
        <tr>
            <td>Average</td>
            <td>${data.metrics.http_req_duration.avg.toFixed(0)}</td>
            <td class="${data.metrics.http_req_duration.avg < 500 ? 'good' : 'warning'}">
                ${data.metrics.http_req_duration.avg < 500 ? '✓ Good' : '⚠ Elevated'}
            </td>
        </tr>
        <tr>
            <td>95th Percentile</td>
            <td>${data.metrics.http_req_duration['p(95)'].toFixed(0)}</td>
            <td class="${data.metrics.http_req_duration['p(95)'] < 1000 ? 'good' : 'warning'}">
                ${data.metrics.http_req_duration['p(95)'] < 1000 ? '✓ Good' : '⚠ Elevated'}
            </td>
        </tr>
        <tr>
            <td>99th Percentile</td>
            <td>${data.metrics.http_req_duration['p(99)'].toFixed(0)}</td>
            <td class="${data.metrics.http_req_duration['p(99)'] < 2000 ? 'good' : 'bad'}">
                ${data.metrics.http_req_duration['p(99)'] < 2000 ? '✓ Good' : '✗ High'}
            </td>
        </tr>
    </table>
    
    <h2>Long-term Stability</h2>
    <ul>
        <li>Error Rate: ${(data.metrics.http_req_failed.rate * 100).toFixed(3)}%</li>
        <li>Success Rate: ${((1 - data.metrics.http_req_failed.rate) * 100).toFixed(2)}%</li>
        <li>Response Time Deviation: ${data.metrics.response_time_deviation?.avg?.toFixed(2) || 'N/A'}x baseline</li>
    </ul>
    
    <h2>Recommendations</h2>
    ${generateRecommendations(data)}
</body>
</html>
  `;
}

function generateRecommendations(data) {
  const recommendations = [];
  
  if (data.metrics.memory_leaks_suspected.count > 5) {
    recommendations.push('• Investigate potential memory leaks - ' + data.metrics.memory_leaks_suspected.count + ' indicators detected');
  }
  
  if (data.metrics.performance_degradation.rate > 0.1) {
    recommendations.push('• Performance degradation detected - response times increased by ' + 
      (data.metrics.performance_degradation.rate * 100).toFixed(0) + '% over time');
  }
  
  if (data.metrics.cache_hit_rate.rate < 0.7) {
    recommendations.push('• Cache hit rate is low (' + 
      (data.metrics.cache_hit_rate.rate * 100).toFixed(0) + '%) - consider optimizing cache strategy');
  }
  
  if (data.metrics.connection_errors.count > 100) {
    recommendations.push('• High number of connection errors (' + 
      data.metrics.connection_errors.count + ') - check connection pool settings');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('• System showed good stability during the soak test');
    recommendations.push('• All metrics remained within acceptable thresholds');
  }
  
  return recommendations.join('\n');
}

function generateTextSummary(data) {
  const duration = data.state.testRunDurationMs / 1000 / 3600;
  
  return `
Soak Test Summary (${duration.toFixed(1)} hours)
============================================
Total Requests: ${data.metrics.http_reqs.count.toLocaleString()}
Average Load: ${data.metrics.vus.avg.toFixed(0)} concurrent users

Stability Indicators:
- Performance Degradation: ${(data.metrics.performance_degradation.rate * 100).toFixed(2)}%
- Memory Leak Suspects: ${data.metrics.memory_leaks_suspected.count}
- Connection Errors: ${data.metrics.connection_errors.count}
- Cache Hit Rate: ${(data.metrics.cache_hit_rate.rate * 100).toFixed(2)}%

Response Times:
- Average: ${data.metrics.http_req_duration.avg.toFixed(0)}ms
- 95th Percentile: ${data.metrics.http_req_duration['p(95)'].toFixed(0)}ms
- 99th Percentile: ${data.metrics.http_req_duration['p(99)'].toFixed(0)}ms

Overall Health:
- Error Rate: ${(data.metrics.http_req_failed.rate * 100).toFixed(3)}%
- Success Rate: ${((1 - data.metrics.http_req_failed.rate) * 100).toFixed(2)}%
`;
}