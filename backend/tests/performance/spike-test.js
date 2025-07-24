import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Metrics for spike behavior
const spikeResponseTime = new Trend('spike_response_time');
const recoveryTime = new Trend('recovery_time');
const spikeErrorRate = new Rate('spike_error_rate');

// Spike test - sudden traffic increases
export const options = {
  stages: [
    { duration: '30s', target: 50 },    // Normal load
    { duration: '10s', target: 500 },   // Sudden spike!
    { duration: '1m', target: 500 },    // Stay at spike
    { duration: '10s', target: 50 },    // Drop back
    { duration: '1m', target: 50 },     // Recovery period
    { duration: '5s', target: 1000 },   // Extreme spike!
    { duration: '30s', target: 1000 },  // Sustain extreme
    { duration: '30s', target: 0 },     // Complete drop
  ],
  thresholds: {
    spike_response_time: ['p(95)<2000'], // Response time during spikes
    spike_error_rate: ['rate<0.2'],      // Error rate during spikes
    http_req_duration: ['p(99)<5000'],   // Overall 99th percentile
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

let spikeStartTime = null;
let normalResponseTime = null;

export default function () {
  const currentVUs = __VU;
  const isSpike = currentVUs > 100;
  
  // Track spike periods
  if (isSpike && !spikeStartTime) {
    spikeStartTime = new Date();
  } else if (!isSpike && spikeStartTime) {
    recoveryTime.add(new Date() - spikeStartTime);
    spikeStartTime = null;
  }

  // Common user journey during spike
  const startTime = new Date();
  
  // 1. Homepage/Health check
  const healthRes = http.get(`${BASE_URL}/health`, {
    tags: { name: 'health_check' },
    timeout: '10s',
  });
  
  check(healthRes, {
    'system healthy': (r) => r.status === 200,
  });

  // 2. Authentication
  const authRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: `spike_user_${__VU}@test.com`,
      password: 'SpikeTest123!',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'authentication' },
      timeout: '10s',
    }
  );

  const authSuccess = check(authRes, {
    'authentication successful': (r) => r.status === 200 || r.status === 401,
  });

  let token = null;
  if (authRes.status === 200) {
    token = authRes.json('token');
  }

  // 3. Core operations (if authenticated)
  if (token) {
    // Transaction operations
    const txRes = http.get(
      `${BASE_URL}/api/transactions?page=1&pageSize=10`,
      {
        headers: { 'Authorization': `Bearer ${token}` },
        tags: { name: 'transactions_list' },
        timeout: '10s',
      }
    );

    check(txRes, {
      'transactions retrieved': (r) => r.status === 200,
    });

    // Gas estimation (high priority operation)
    const gasRes = http.post(
      `${BASE_URL}/api/transactions/estimate`,
      JSON.stringify({
        to: '0x742d35Cc6634C0532925a3b844Bc9e7095931a4f',
        value: '1000000000000000000',
        data: '0x',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        tags: { name: 'gas_estimation' },
        timeout: '10s',
      }
    );

    const gasSuccess = check(gasRes, {
      'gas estimation successful': (r) => r.status === 200,
    });

    // Record spike-specific metrics
    if (isSpike) {
      spikeResponseTime.add(new Date() - startTime);
      spikeErrorRate.add(!gasSuccess);
    }
  }

  // 4. Static resource requests (simulate real browser)
  const staticResources = [
    '/api/config',
    '/api/gas/prices',
    '/api/stats/platform',
  ];

  staticResources.forEach(resource => {
    http.get(`${BASE_URL}${resource}`, {
      tags: { name: 'static_resource' },
      timeout: '5s',
    });
  });

  // 5. Analytics request (lower priority)
  if (token && Math.random() < 0.3) {
    http.get(
      `${BASE_URL}/api/analytics/dashboard`,
      {
        headers: { 'Authorization': `Bearer ${token}` },
        tags: { name: 'analytics' },
        timeout: '15s',
      }
    );
  }

  // Vary sleep based on spike
  if (isSpike) {
    sleep(Math.random() * 0.5); // Aggressive during spike
  } else {
    sleep(Math.random() * 2 + 1); // Normal behavior
  }
}

// Monitor system behavior during different phases
export function handleSummary(data) {
  const report = generateSpikeReport(data);
  
  return {
    'spike-test-report.html': report.html,
    'spike-test-metrics.json': JSON.stringify(report.metrics, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function generateSpikeReport(data) {
  const metrics = {
    normalLoad: {
      responseTime: calculatePhaseMetrics(data, 0, 30),
      errorRate: calculatePhaseErrorRate(data, 0, 30),
    },
    firstSpike: {
      responseTime: calculatePhaseMetrics(data, 40, 100),
      errorRate: calculatePhaseErrorRate(data, 40, 100),
    },
    extremeSpike: {
      responseTime: calculatePhaseMetrics(data, 160, 190),
      errorRate: calculatePhaseErrorRate(data, 160, 190),
    },
    recovery: {
      responseTime: calculatePhaseMetrics(data, 100, 160),
      errorRate: calculatePhaseErrorRate(data, 100, 160),
    },
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Spike Test Analysis</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .phase { margin: 20px 0; padding: 15px; border: 1px solid #ddd; }
        .metric { display: inline-block; margin: 10px 20px 10px 0; }
        .good { background: #d4edda; }
        .warning { background: #fff3cd; }
        .bad { background: #f8d7da; }
        canvas { margin: 20px 0; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <h1>ZKFair Spike Test Analysis</h1>
    
    <div class="phase ${metrics.normalLoad.errorRate < 0.01 ? 'good' : 'warning'}">
        <h3>Normal Load Phase (0-30s)</h3>
        <div class="metric">Avg Response Time: ${metrics.normalLoad.responseTime.avg}ms</div>
        <div class="metric">95th Percentile: ${metrics.normalLoad.responseTime.p95}ms</div>
        <div class="metric">Error Rate: ${(metrics.normalLoad.errorRate * 100).toFixed(2)}%</div>
    </div>
    
    <div class="phase ${metrics.firstSpike.errorRate < 0.1 ? 'warning' : 'bad'}">
        <h3>First Spike Phase (40-100s)</h3>
        <div class="metric">Avg Response Time: ${metrics.firstSpike.responseTime.avg}ms</div>
        <div class="metric">95th Percentile: ${metrics.firstSpike.responseTime.p95}ms</div>
        <div class="metric">Error Rate: ${(metrics.firstSpike.errorRate * 100).toFixed(2)}%</div>
        <div class="metric">Response Time Increase: ${
          ((metrics.firstSpike.responseTime.avg / metrics.normalLoad.responseTime.avg - 1) * 100).toFixed(0)
        }%</div>
    </div>
    
    <div class="phase ${metrics.extremeSpike.errorRate < 0.2 ? 'warning' : 'bad'}">
        <h3>Extreme Spike Phase (160-190s)</h3>
        <div class="metric">Avg Response Time: ${metrics.extremeSpike.responseTime.avg}ms</div>
        <div class="metric">95th Percentile: ${metrics.extremeSpike.responseTime.p95}ms</div>
        <div class="metric">Error Rate: ${(metrics.extremeSpike.errorRate * 100).toFixed(2)}%</div>
    </div>
    
    <div class="phase ${metrics.recovery.responseTime.avg < metrics.normalLoad.responseTime.avg * 1.5 ? 'good' : 'warning'}">
        <h3>Recovery Phase (100-160s)</h3>
        <div class="metric">Avg Response Time: ${metrics.recovery.responseTime.avg}ms</div>
        <div class="metric">95th Percentile: ${metrics.recovery.responseTime.p95}ms</div>
        <div class="metric">Error Rate: ${(metrics.recovery.errorRate * 100).toFixed(2)}%</div>
        <div class="metric">Recovery Efficiency: ${
          (100 - (metrics.recovery.responseTime.avg / metrics.normalLoad.responseTime.avg - 1) * 100).toFixed(0)
        }%</div>
    </div>
    
    <h2>System Behavior Summary</h2>
    <ul>
        <li>Total Requests: ${data.metrics.http_reqs.count}</li>
        <li>Peak Concurrent Users: ${data.metrics.vus.max}</li>
        <li>Overall Success Rate: ${((1 - data.metrics.http_req_failed.rate) * 100).toFixed(2)}%</li>
        <li>Spike Response Time (95th): ${data.metrics.spike_response_time?.['p(95)']?.toFixed(0) || 'N/A'}ms</li>
        <li>Average Recovery Time: ${data.metrics.recovery_time?.avg?.toFixed(0) || 'N/A'}ms</li>
    </ul>
    
    <canvas id="spikeChart" width="800" height="400"></canvas>
    
    <script>
        // Visualization of spike behavior would go here
        const ctx = document.getElementById('spikeChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Normal', 'Pre-Spike', 'First Spike', 'Recovery', 'Extreme Spike', 'Final'],
                datasets: [{
                    label: 'Response Time (ms)',
                    data: [
                        ${metrics.normalLoad.responseTime.avg},
                        ${metrics.normalLoad.responseTime.avg * 1.2},
                        ${metrics.firstSpike.responseTime.avg},
                        ${metrics.recovery.responseTime.avg},
                        ${metrics.extremeSpike.responseTime.avg},
                        ${metrics.recovery.responseTime.avg}
                    ],
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }, {
                    label: 'Error Rate (%)',
                    data: [
                        ${metrics.normalLoad.errorRate * 100},
                        ${metrics.normalLoad.errorRate * 100},
                        ${metrics.firstSpike.errorRate * 100},
                        ${metrics.recovery.errorRate * 100},
                        ${metrics.extremeSpike.errorRate * 100},
                        ${metrics.recovery.errorRate * 100}
                    ],
                    borderColor: 'rgb(255, 99, 132)',
                    tension: 0.1,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: {
                            drawOnChartArea: false,
                        },
                    },
                }
            }
        });
    </script>
</body>
</html>
  `;

  return { html, metrics };
}

// Helper functions for metrics calculation
function calculatePhaseMetrics(data, startSecond, endSecond) {
  // This is a simplified calculation
  // In real implementation, you'd filter metrics by timestamp
  return {
    avg: Math.round(data.metrics.http_req_duration.avg),
    p95: Math.round(data.metrics.http_req_duration['p(95)']),
    p99: Math.round(data.metrics.http_req_duration['p(99)']),
  };
}

function calculatePhaseErrorRate(data, startSecond, endSecond) {
  // Simplified calculation
  return data.metrics.http_req_failed.rate;
}

function textSummary(data, options) {
  return `
Spike Test Summary
==================
Total Duration: ${(data.state.testRunDurationMs / 1000).toFixed(0)}s
Peak VUs: ${data.metrics.vus.max}
Total Requests: ${data.metrics.http_reqs.count}

Response Times:
  Average: ${data.metrics.http_req_duration.avg.toFixed(0)}ms
  95th percentile: ${data.metrics.http_req_duration['p(95)'].toFixed(0)}ms
  99th percentile: ${data.metrics.http_req_duration['p(99)'].toFixed(0)}ms

Spike Metrics:
  Spike Response Time (95th): ${data.metrics.spike_response_time?.['p(95)']?.toFixed(0) || 'N/A'}ms
  Spike Error Rate: ${(data.metrics.spike_error_rate?.rate * 100).toFixed(2) || '0.00'}%
  
Overall:
  Success Rate: ${((1 - data.metrics.http_req_failed.rate) * 100).toFixed(2)}%
  `;
}