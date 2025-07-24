import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// Custom metrics
const apiErrors = new Counter('api_errors');
const apiSuccess = new Rate('api_success_rate');
const transactionDuration = new Trend('transaction_duration');
const authDuration = new Trend('auth_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 50 },    // Ramp up to 50 users
    { duration: '3m', target: 100 },   // Stay at 100 users
    { duration: '1m', target: 200 },   // Spike to 200 users
    { duration: '2m', target: 100 },   // Back to 100 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.1'],                   // Error rate under 10%
    api_success_rate: ['rate>0.9'],                  // Success rate over 90%
    transaction_duration: ['p(95)<2000'],            // 95% of transactions under 2s
  },
};

// Test data
const testUsers = new SharedArray('users', function () {
  return JSON.parse(open('./test-data/users.json'));
});

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Helper functions
function randomUser() {
  return testUsers[Math.floor(Math.random() * testUsers.length)];
}

function makeRequest(method, endpoint, body = null, token = null) {
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: '30s',
  };

  if (token) {
    params.headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${BASE_URL}${endpoint}`;
  let response;

  if (method === 'GET') {
    response = http.get(url, params);
  } else if (method === 'POST') {
    response = http.post(url, JSON.stringify(body), params);
  } else if (method === 'PUT') {
    response = http.put(url, JSON.stringify(body), params);
  }

  // Record metrics
  const success = response.status >= 200 && response.status < 300;
  apiSuccess.add(success);
  if (!success) {
    apiErrors.add(1);
  }

  return response;
}

// Test scenarios
export function setup() {
  // Create test users if needed
  console.log('Setting up test environment...');
  
  // Login admin user to get token for setup
  const adminLogin = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: 'admin@zkfair.com',
      password: 'admin123',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (adminLogin.status !== 200) {
    throw new Error('Failed to login admin user for setup');
  }

  return {
    adminToken: adminLogin.json('token'),
  };
}

export default function (data) {
  // Scenario distribution
  const scenario = Math.random();

  if (scenario < 0.3) {
    // 30% - Authentication flow
    authenticationScenario();
  } else if (scenario < 0.6) {
    // 30% - Transaction flow
    transactionScenario();
  } else if (scenario < 0.8) {
    // 20% - Read operations
    readOperationsScenario();
  } else if (scenario < 0.95) {
    // 15% - Analytics queries
    analyticsScenario();
  } else {
    // 5% - Admin operations
    adminScenario(data.adminToken);
  }

  sleep(Math.random() * 3 + 1); // Random think time 1-4s
}

function authenticationScenario() {
  const user = randomUser();
  const startTime = new Date();

  // Login
  const loginResponse = makeRequest('POST', '/api/auth/login', {
    email: user.email,
    password: user.password,
  });

  authDuration.add(new Date() - startTime);

  const loginCheck = check(loginResponse, {
    'login successful': (r) => r.status === 200,
    'login returns token': (r) => r.json('token') !== undefined,
  });

  if (!loginCheck) return;

  const token = loginResponse.json('token');

  // Access protected endpoint
  const profileResponse = makeRequest('GET', '/api/user/profile', null, token);

  check(profileResponse, {
    'profile access successful': (r) => r.status === 200,
    'profile contains user data': (r) => r.json('email') === user.email,
  });

  // Refresh token
  const refreshResponse = makeRequest('POST', '/api/auth/refresh', {
    token: token,
  });

  check(refreshResponse, {
    'token refresh successful': (r) => r.status === 200,
    'new token provided': (r) => r.json('token') !== undefined,
  });
}

function transactionScenario() {
  const user = randomUser();
  
  // Login first
  const loginResponse = makeRequest('POST', '/api/auth/login', {
    email: user.email,
    password: user.password,
  });

  if (loginResponse.status !== 200) return;

  const token = loginResponse.json('token');
  const startTime = new Date();

  // Get balance
  const balanceResponse = makeRequest('GET', '/api/wallet/balance', null, token);
  
  check(balanceResponse, {
    'balance retrieved': (r) => r.status === 200,
    'balance has value': (r) => r.json('balance') !== undefined,
  });

  // Estimate gas
  const estimateResponse = makeRequest('POST', '/api/transactions/estimate', {
    to: '0x742d35Cc6634C0532925a3b844Bc9e7095931a4f',
    value: '1000000000000000000', // 1 ETH
    data: '0x',
  }, token);

  check(estimateResponse, {
    'gas estimation successful': (r) => r.status === 200,
    'gas limit provided': (r) => r.json('gasLimit') !== undefined,
  });

  // Send transaction
  const sendResponse = makeRequest('POST', '/api/transactions/send', {
    to: '0x742d35Cc6634C0532925a3b844Bc9e7095931a4f',
    value: '1000000000000000000',
    data: '0x',
    gasLimit: estimateResponse.json('gasLimit') || '21000',
  }, token);

  transactionDuration.add(new Date() - startTime);

  check(sendResponse, {
    'transaction sent': (r) => r.status === 201,
    'userOpHash returned': (r) => r.json('userOpHash') !== undefined,
  });

  if (sendResponse.status === 201) {
    const userOpHash = sendResponse.json('userOpHash');
    
    // Check status
    const statusResponse = makeRequest(
      'GET',
      `/api/transactions/status/${userOpHash}`,
      null,
      token
    );

    check(statusResponse, {
      'status retrieved': (r) => r.status === 200,
      'status has value': (r) => r.json('status') !== undefined,
    });
  }
}

function readOperationsScenario() {
  const user = randomUser();
  
  // Login
  const loginResponse = makeRequest('POST', '/api/auth/login', {
    email: user.email,
    password: user.password,
  });

  if (loginResponse.status !== 200) return;

  const token = loginResponse.json('token');

  // Get transaction history
  const historyResponse = makeRequest(
    'GET',
    '/api/transactions?page=1&pageSize=20',
    null,
    token
  );

  check(historyResponse, {
    'transaction history retrieved': (r) => r.status === 200,
    'transactions array returned': (r) => Array.isArray(r.json('transactions')),
  });

  // Get wallet info
  const walletResponse = makeRequest('GET', '/api/wallet/info', null, token);

  check(walletResponse, {
    'wallet info retrieved': (r) => r.status === 200,
    'wallet address provided': (r) => r.json('address') !== undefined,
  });

  // Get gas prices
  const gasResponse = makeRequest('GET', '/api/gas/prices', null, token);

  check(gasResponse, {
    'gas prices retrieved': (r) => r.status === 200,
    'gas prices object returned': (r) => r.json('prices') !== undefined,
  });
}

function analyticsScenario() {
  const user = randomUser();
  
  // Login
  const loginResponse = makeRequest('POST', '/api/auth/login', {
    email: user.email,
    password: user.password,
  });

  if (loginResponse.status !== 200) return;

  const token = loginResponse.json('token');

  // Get user analytics
  const userAnalyticsResponse = makeRequest(
    'GET',
    '/api/analytics/users?period=7d',
    null,
    token
  );

  check(userAnalyticsResponse, {
    'user analytics retrieved': (r) => r.status === 200,
    'analytics data provided': (r) => r.json('data') !== undefined,
  });

  // Get transaction analytics
  const txAnalyticsResponse = makeRequest(
    'GET',
    '/api/analytics/transactions?period=30d',
    null,
    token
  );

  check(txAnalyticsResponse, {
    'transaction analytics retrieved': (r) => r.status === 200,
    'transaction data provided': (r) => r.json('data') !== undefined,
  });

  // Get system metrics
  const metricsResponse = makeRequest(
    'GET',
    '/api/analytics/metrics',
    null,
    token
  );

  check(metricsResponse, {
    'system metrics retrieved': (r) => r.status === 200,
    'metrics object provided': (r) => r.json('metrics') !== undefined,
  });
}

function adminScenario(adminToken) {
  // Get all users
  const usersResponse = makeRequest(
    'GET',
    '/api/admin/users?page=1&pageSize=50',
    null,
    adminToken
  );

  check(usersResponse, {
    'users list retrieved': (r) => r.status === 200,
    'users array returned': (r) => Array.isArray(r.json('users')),
  });

  // Get system config
  const configResponse = makeRequest(
    'GET',
    '/api/admin/config',
    null,
    adminToken
  );

  check(configResponse, {
    'system config retrieved': (r) => r.status === 200,
    'config object returned': (r) => r.json('config') !== undefined,
  });

  // Update config (non-critical)
  const updateResponse = makeRequest(
    'PUT',
    '/api/admin/config',
    {
      maxGasPrice: '200',
      sessionTimeout: 3600,
    },
    adminToken
  );

  check(updateResponse, {
    'config update successful': (r) => r.status === 200,
  });
}

export function teardown(data) {
  console.log('Test completed. Cleaning up...');
  // Any cleanup operations
}