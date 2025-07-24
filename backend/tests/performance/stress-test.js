import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const failedRequests = new Counter('failed_requests');
const successRate = new Rate('success_rate');
const errorRate = new Rate('error_rate');
const timeoutRate = new Rate('timeout_rate');
const criticalErrors = new Counter('critical_errors');

// Stress test configuration - push system to its limits
export const options = {
  stages: [
    { duration: '1m', target: 100 },    // Warm up
    { duration: '2m', target: 500 },    // Ramp to high load
    { duration: '3m', target: 1000 },   // Push to very high load
    { duration: '2m', target: 2000 },   // Extreme load
    { duration: '1m', target: 3000 },   // Breaking point
    { duration: '2m', target: 1000 },   // Recovery test
    { duration: '1m', target: 0 },      // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // Allow higher latency under stress
    error_rate: ['rate<0.5'],          // Allow up to 50% errors
    critical_errors: ['count<100'],    // Limit critical failures
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Aggressive request patterns
const stressPatterns = {
  // Rapid fire authentication attempts
  authenticationBurst: () => {
    const email = `stress_${randomString(10)}@test.com`;
    const responses = [];
    
    // Send 10 rapid requests
    for (let i = 0; i < 10; i++) {
      const res = http.post(
        `${BASE_URL}/api/auth/register`,
        JSON.stringify({ 
          email: email, 
          password: 'StressTest123!',
          confirmPassword: 'StressTest123!',
        }),
        { 
          headers: { 'Content-Type': 'application/json' },
          timeout: '5s',
        }
      );
      responses.push(res);
    }
    
    return responses;
  },

  // Large payload transactions
  largePayloadTransaction: (token) => {
    const largeData = '0x' + randomString(10000); // Very large calldata
    
    return http.post(
      `${BASE_URL}/api/transactions/send`,
      JSON.stringify({
        to: '0x' + randomString(40),
        value: '1000000000000000000',
        data: largeData,
        gasLimit: '10000000',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        timeout: '10s',
      }
    );
  },

  // Concurrent batch operations
  concurrentBatches: (token) => {
    const batchRequests = [];
    
    // Create 5 concurrent batch transactions
    for (let i = 0; i < 5; i++) {
      const batch = {
        transactions: Array(50).fill(null).map(() => ({
          to: '0x' + randomString(40),
          value: '1000000000000000',
          data: '0x',
        })),
      };
      
      batchRequests.push(
        http.post(
          `${BASE_URL}/api/transactions/batch`,
          JSON.stringify(batch),
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            timeout: '15s',
          }
        )
      );
    }
    
    return batchRequests;
  },

  // Database stress - complex queries
  complexAnalyticsQuery: (token) => {
    const queries = [
      '/api/analytics/users/cohorts?startDate=2020-01-01&groupBy=week&metrics=all',
      '/api/analytics/transactions/volume?period=all&interval=hour&breakdown=true',
      '/api/analytics/gas/history?days=365&granularity=minute',
      '/api/transactions?page=1&pageSize=1000&includeInternal=true&includeStats=true',
    ];
    
    return queries.map(query => 
      http.get(`${BASE_URL}${query}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: '20s',
      })
    );
  },

  // WebSocket connection storm
  websocketStorm: () => {
    // Simulate WebSocket upgrade requests
    const wsRequests = [];
    
    for (let i = 0; i < 100; i++) {
      wsRequests.push(
        http.get(`${BASE_URL}/ws`, {
          headers: {
            'Upgrade': 'websocket',
            'Connection': 'Upgrade',
            'Sec-WebSocket-Key': randomString(16),
            'Sec-WebSocket-Version': '13',
          },
          timeout: '1s',
        })
      );
    }
    
    return wsRequests;
  },

  // Memory exhaustion attempt
  memoryExhaustion: (token) => {
    return http.post(
      `${BASE_URL}/api/transactions/export`,
      JSON.stringify({
        format: 'csv',
        includeAll: true,
        startDate: '2020-01-01',
        endDate: new Date().toISOString(),
        includeMetadata: true,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        timeout: '30s',
      }
    );
  },

  // Rate limit testing
  rateLimitTest: (token) => {
    const endpoint = '/api/transactions';
    const requests = [];
    
    // Send 200 requests as fast as possible
    for (let i = 0; i < 200; i++) {
      requests.push(
        http.get(`${BASE_URL}${endpoint}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          timeout: '2s',
        })
      );
    }
    
    return requests;
  },
};

export default function () {
  // Try to get a token for authenticated tests
  let token = null;
  
  const loginAttempt = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: 'stress@test.com',
      password: 'StressTest123!',
    }),
    { 
      headers: { 'Content-Type': 'application/json' },
      timeout: '5s',
    }
  );
  
  if (loginAttempt.status === 200) {
    token = loginAttempt.json('token');
  }

  // Execute random stress pattern
  const pattern = Math.random();
  let responses = [];

  try {
    if (pattern < 0.2) {
      responses = stressPatterns.authenticationBurst();
    } else if (pattern < 0.3 && token) {
      responses = [stressPatterns.largePayloadTransaction(token)];
    } else if (pattern < 0.4 && token) {
      responses = stressPatterns.concurrentBatches(token);
    } else if (pattern < 0.6 && token) {
      responses = stressPatterns.complexAnalyticsQuery(token);
    } else if (pattern < 0.7) {
      responses = stressPatterns.websocketStorm();
    } else if (pattern < 0.8 && token) {
      responses = [stressPatterns.memoryExhaustion(token)];
    } else if (token) {
      responses = stressPatterns.rateLimitTest(token);
    } else {
      // Fallback to simple requests
      responses = [http.get(`${BASE_URL}/health`)];
    }
  } catch (e) {
    criticalErrors.add(1);
    console.error('Critical error:', e);
  }

  // Process responses
  responses.forEach(res => {
    if (res) {
      const success = res.status >= 200 && res.status < 400;
      successRate.add(success);
      errorRate.add(!success);
      timeoutRate.add(res.status === 0); // k6 returns 0 for timeouts
      
      if (!success) {
        failedRequests.add(1);
      }
      
      // Check for critical errors
      if (res.status >= 500 || res.status === 0) {
        criticalErrors.add(1);
      }
    }
  });

  // Minimal sleep to maintain pressure
  sleep(Math.random() * 0.5);
}

export function handleSummary(data) {
  return {
    'stress-test-summary.html': htmlReport(data),
    'stress-test-summary.json': JSON.stringify(data, null, 2),
  };
}

function htmlReport(data) {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>Stress Test Results</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { margin: 10px 0; padding: 10px; background: #f0f0f0; }
        .critical { color: red; font-weight: bold; }
        .warning { color: orange; }
        .good { color: green; }
    </style>
</head>
<body>
    <h1>ZKFair Stress Test Results</h1>
    <div class="metric">
        <h3>Test Summary</h3>
        <p>Duration: ${data.state.testRunDurationMs / 1000}s</p>
        <p>Max VUs: ${data.metrics.vus.max}</p>
        <p>Total Requests: ${data.metrics.http_reqs.count}</p>
    </div>
    
    <div class="metric">
        <h3>Performance Metrics</h3>
        <p>Average Response Time: ${data.metrics.http_req_duration.avg.toFixed(2)}ms</p>
        <p>95th Percentile: ${data.metrics.http_req_duration['p(95)'].toFixed(2)}ms</p>
        <p>99th Percentile: ${data.metrics.http_req_duration['p(99)'].toFixed(2)}ms</p>
    </div>
    
    <div class="metric">
        <h3>Error Analysis</h3>
        <p class="${data.metrics.error_rate.rate > 0.5 ? 'critical' : 'warning'}">
            Error Rate: ${(data.metrics.error_rate.rate * 100).toFixed(2)}%
        </p>
        <p class="${data.metrics.critical_errors.count > 100 ? 'critical' : 'warning'}">
            Critical Errors: ${data.metrics.critical_errors.count}
        </p>
        <p>Timeout Rate: ${(data.metrics.timeout_rate.rate * 100).toFixed(2)}%</p>
    </div>
    
    <div class="metric">
        <h3>System Behavior</h3>
        <p>Success Rate: ${(data.metrics.success_rate.rate * 100).toFixed(2)}%</p>
        <p>Failed Requests: ${data.metrics.failed_requests.count}</p>
    </div>
</body>
</html>
  `;
}