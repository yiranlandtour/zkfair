import { register, Counter, Histogram, Gauge, Summary } from 'prom-client';

// User Operation metrics
export const userOpsReceived = new Counter({
  name: 'bundler_userops_received_total',
  help: 'Total number of UserOperations received',
  labelNames: ['status'],
});

export const userOpsProcessed = new Counter({
  name: 'bundler_userops_processed_total',
  help: 'Total number of UserOperations processed',
  labelNames: ['status', 'paymaster', 'reason'],
});

export const bundleSize = new Histogram({
  name: 'bundler_bundle_size',
  help: 'Number of UserOps in each bundle',
  buckets: [1, 5, 10, 20, 50, 100],
});

export const bundleSubmissionDuration = new Histogram({
  name: 'bundler_submission_duration_seconds',
  help: 'Time taken to submit bundle to chain',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

export const validationDuration = new Histogram({
  name: 'bundler_validation_duration_seconds',
  help: 'Time taken to validate UserOperation',
  buckets: [0.01, 0.05, 0.1, 0.5, 1],
  labelNames: ['method'],
});

// Gas metrics
export const gasPrice = new Gauge({
  name: 'bundler_gas_price_gwei',
  help: 'Current gas price in gwei',
  labelNames: ['type'], // 'base', 'priority', 'max'
});

export const gasUsed = new Summary({
  name: 'bundler_gas_used',
  help: 'Gas used per UserOperation',
  percentiles: [0.5, 0.9, 0.95, 0.99],
  labelNames: ['paymaster'],
});

export const gasCostUSD = new Summary({
  name: 'bundler_gas_cost_usd',
  help: 'Gas cost in USD per UserOperation',
  percentiles: [0.5, 0.9, 0.95, 0.99],
  labelNames: ['paymaster', 'token'],
});

// Pool metrics
export const mempoolSize = new Gauge({
  name: 'bundler_mempool_size',
  help: 'Current number of UserOps in mempool',
  labelNames: ['status'], // 'pending', 'ready', 'submitted'
});

export const mempoolAge = new Histogram({
  name: 'bundler_mempool_age_seconds',
  help: 'Age of UserOps in mempool',
  buckets: [1, 5, 10, 30, 60, 300, 600],
});

// Error metrics
export const errors = new Counter({
  name: 'bundler_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'code'],
});

export const rejectedOps = new Counter({
  name: 'bundler_rejected_ops_total',
  help: 'Total number of rejected UserOperations',
  labelNames: ['reason'],
});

// Performance metrics
export const rpcLatency = new Histogram({
  name: 'bundler_rpc_latency_seconds',
  help: 'RPC method latency',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  labelNames: ['method'],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  labelNames: ['method', 'route', 'status_code'],
});

// Paymaster metrics
export const paymasterBalance = new Gauge({
  name: 'bundler_paymaster_balance_eth',
  help: 'Paymaster ETH balance',
  labelNames: ['paymaster'],
});

export const paymasterTokenCollected = new Counter({
  name: 'bundler_paymaster_tokens_collected_total',
  help: 'Total tokens collected by paymaster',
  labelNames: ['paymaster', 'token'],
});

// System metrics
export const systemInfo = new Gauge({
  name: 'bundler_info',
  help: 'Bundler system information',
  labelNames: ['version', 'network', 'node_version'],
});

// Initialize system info
systemInfo.set({ 
  version: process.env.npm_package_version || '1.0.0',
  network: process.env.NETWORK || 'zkfair',
  node_version: process.version 
}, 1);

// Middleware for Express
export function metricsMiddleware(req: any, res: any, next: any) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
      .observe(duration);
  });
  
  next();
}

// Utility functions for common metrics
export function recordUserOpReceived(status: 'valid' | 'invalid') {
  userOpsReceived.labels(status).inc();
}

export function recordUserOpProcessed(
  status: 'success' | 'failed',
  paymaster: string,
  reason?: string
) {
  userOpsProcessed.labels(status, paymaster, reason || 'none').inc();
}

export function recordBundleSubmission(
  size: number,
  duration: number,
  success: boolean
) {
  bundleSize.observe(size);
  bundleSubmissionDuration.observe(duration);
  
  if (!success) {
    errors.labels('bundle_submission', 'failed').inc();
  }
}

export function recordValidation(method: string, duration: number) {
  validationDuration.labels(method).observe(duration);
}

export function updateGasMetrics(base: bigint, priority: bigint, max: bigint) {
  gasPrice.labels('base').set(Number(base) / 1e9);
  gasPrice.labels('priority').set(Number(priority) / 1e9);
  gasPrice.labels('max').set(Number(max) / 1e9);
}

export function recordGasUsage(
  gasUsed: bigint,
  costUSD: number,
  paymaster: string,
  token: string
) {
  gasUsed.labels(paymaster).observe(Number(gasUsed));
  gasCostUSD.labels(paymaster, token).observe(costUSD);
}

export function updateMempoolMetrics(
  pending: number,
  ready: number,
  submitted: number
) {
  mempoolSize.labels('pending').set(pending);
  mempoolSize.labels('ready').set(ready);
  mempoolSize.labels('submitted').set(submitted);
}

export function recordError(type: string, code: string) {
  errors.labels(type, code).inc();
}

export function recordRejection(reason: string) {
  rejectedOps.labels(reason).inc();
}

// Export metrics endpoint handler
export function metricsHandler(req: any, res: any) {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
}

// Monitoring class for structured metrics collection
export class BundlerMonitor {
  private startTime: number;
  
  constructor() {
    this.startTime = Date.now();
  }
  
  async collectSystemMetrics() {
    const uptime = (Date.now() - this.startTime) / 1000;
    
    // Collect process metrics
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      uptime,
      memory: {
        rss: memUsage.rss / 1024 / 1024, // MB
        heapTotal: memUsage.heapTotal / 1024 / 1024,
        heapUsed: memUsage.heapUsed / 1024 / 1024,
        external: memUsage.external / 1024 / 1024,
      },
      cpu: {
        user: cpuUsage.user / 1000000, // seconds
        system: cpuUsage.system / 1000000,
      },
    };
  }
  
  startOperation(name: string) {
    const start = Date.now();
    
    return {
      end: (labels?: Record<string, string>) => {
        const duration = (Date.now() - start) / 1000;
        rpcLatency.labels(name).observe(duration);
        return duration;
      },
      
      error: (error: Error) => {
        const duration = (Date.now() - start) / 1000;
        recordError(name, error.message);
        return duration;
      }
    };
  }
}