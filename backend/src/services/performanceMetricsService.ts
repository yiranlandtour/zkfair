import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import * as os from 'os';
import { logger } from '../utils/logger';

export interface PerformanceMetricsConfig {
  redis: Redis;
  collectInterval: number; // ms
  retention: {
    raw: number; // seconds
    aggregated: number; // seconds
  };
  thresholds: {
    cpu: number; // percentage
    memory: number; // percentage
    responseTime: number; // ms
    errorRate: number; // percentage
  };
}

export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAvg: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  network: {
    rx: number; // bytes/sec
    tx: number; // bytes/sec
    connections: number;
  };
  process: {
    pid: number;
    uptime: number;
    memory: number;
    cpu: number;
  };
}

export interface ApplicationMetrics {
  timestamp: Date;
  http: {
    requests: number;
    errors: number;
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    activeConnections: number;
  };
  websocket: {
    connections: number;
    messages: number;
    errors: number;
    avgLatency: number;
  };
  database: {
    queries: number;
    errors: number;
    avgQueryTime: number;
    connectionPool: {
      active: number;
      idle: number;
      waiting: number;
    };
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
    memoryUsage: number;
  };
  queue: {
    processed: number;
    failed: number;
    waiting: number;
    avgProcessingTime: number;
  };
}

export interface Alert {
  id: string;
  type: 'cpu' | 'memory' | 'disk' | 'response_time' | 'error_rate' | 'custom';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export class PerformanceMetricsService extends EventEmitter {
  private config: PerformanceMetricsConfig;
  private logger = logger.child({ service: 'PerformanceMetricsService' });
  private collectTimer?: NodeJS.Timer;
  private activeAlerts: Map<string, Alert> = new Map();
  private lastNetworkStats?: { rx: number; tx: number; timestamp: number };
  private httpMetrics: {
    requests: number[];
    errors: number[];
    responseTimes: number[];
  } = {
    requests: [],
    errors: [],
    responseTimes: [],
  };

  constructor(config: PerformanceMetricsConfig) {
    super();
    this.config = config;
    this.startCollection();
  }

  private startCollection(): void {
    this.collectTimer = setInterval(async () => {
      try {
        const [systemMetrics, appMetrics] = await Promise.all([
          this.collectSystemMetrics(),
          this.collectApplicationMetrics(),
        ]);

        await this.storeMetrics(systemMetrics, appMetrics);
        await this.checkThresholds(systemMetrics, appMetrics);
        
        this.emit('metrics:collected', { system: systemMetrics, application: appMetrics });
      } catch (error) {
        this.logger.error('Failed to collect metrics', { error });
      }
    }, this.config.collectInterval);
  }

  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const cpuUsage = await this.getCPUUsage();
    const memInfo = this.getMemoryInfo();
    const diskInfo = await this.getDiskInfo();
    const networkStats = await this.getNetworkStats();
    const processInfo = this.getProcessInfo();

    return {
      timestamp: new Date(),
      cpu: {
        usage: cpuUsage,
        loadAvg: os.loadavg(),
        cores: os.cpus().length,
      },
      memory: memInfo,
      disk: diskInfo,
      network: networkStats,
      process: processInfo,
    };
  }

  private async collectApplicationMetrics(): Promise<ApplicationMetrics> {
    const httpMetrics = await this.getHTTPMetrics();
    const wsMetrics = await this.getWebSocketMetrics();
    const dbMetrics = await this.getDatabaseMetrics();
    const cacheMetrics = await this.getCacheMetrics();
    const queueMetrics = await this.getQueueMetrics();

    return {
      timestamp: new Date(),
      http: httpMetrics,
      websocket: wsMetrics,
      database: dbMetrics,
      cache: cacheMetrics,
      queue: queueMetrics,
    };
  }

  // System Metrics Collection
  private async getCPUUsage(): Promise<number> {
    const startUsage = process.cpuUsage();
    const startTime = process.hrtime.bigint();

    await new Promise(resolve => setTimeout(resolve, 100));

    const endUsage = process.cpuUsage(startUsage);
    const endTime = process.hrtime.bigint();

    const userTime = endUsage.user;
    const systemTime = endUsage.system;
    const totalTime = userTime + systemTime;
    const elapsedTime = Number(endTime - startTime);

    return (totalTime / elapsedTime) * 100;
  }

  private getMemoryInfo(): SystemMetrics['memory'] {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const percentage = (used / total) * 100;

    return { total, used, free, percentage };
  }

  private async getDiskInfo(): Promise<SystemMetrics['disk']> {
    // This is a simplified implementation
    // In production, you'd use a library like 'diskusage'
    const total = 100 * 1024 * 1024 * 1024; // 100GB placeholder
    const used = 40 * 1024 * 1024 * 1024; // 40GB placeholder
    const free = total - used;
    const percentage = (used / total) * 100;

    return { total, used, free, percentage };
  }

  private async getNetworkStats(): Promise<SystemMetrics['network']> {
    // Get from Redis if available (would be set by network monitoring)
    const stats = await this.config.redis.get('metrics:network:current');
    
    if (stats) {
      return JSON.parse(stats);
    }

    // Default values
    return {
      rx: 0,
      tx: 0,
      connections: 0,
    };
  }

  private getProcessInfo(): SystemMetrics['process'] {
    const usage = process.memoryUsage();
    
    return {
      pid: process.pid,
      uptime: process.uptime(),
      memory: usage.heapUsed,
      cpu: 0, // Will be updated by CPU collection
    };
  }

  // Application Metrics Collection
  private async getHTTPMetrics(): Promise<ApplicationMetrics['http']> {
    const metricsKey = 'metrics:http:current';
    const stored = await this.config.redis.get(metricsKey);
    
    if (stored) {
      return JSON.parse(stored);
    }

    // Calculate from collected data
    const requests = this.httpMetrics.requests.reduce((a, b) => a + b, 0);
    const errors = this.httpMetrics.errors.reduce((a, b) => a + b, 0);
    const responseTimes = this.httpMetrics.responseTimes.sort((a, b) => a - b);
    
    return {
      requests,
      errors,
      avgResponseTime: responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0,
      p95ResponseTime: this.percentile(responseTimes, 0.95),
      p99ResponseTime: this.percentile(responseTimes, 0.99),
      activeConnections: 0, // Would come from server stats
    };
  }

  private async getWebSocketMetrics(): Promise<ApplicationMetrics['websocket']> {
    const metricsKey = 'metrics:websocket:current';
    const stored = await this.config.redis.get(metricsKey);
    
    return stored ? JSON.parse(stored) : {
      connections: 0,
      messages: 0,
      errors: 0,
      avgLatency: 0,
    };
  }

  private async getDatabaseMetrics(): Promise<ApplicationMetrics['database']> {
    const metricsKey = 'metrics:database:current';
    const stored = await this.config.redis.get(metricsKey);
    
    return stored ? JSON.parse(stored) : {
      queries: 0,
      errors: 0,
      avgQueryTime: 0,
      connectionPool: {
        active: 0,
        idle: 0,
        waiting: 0,
      },
    };
  }

  private async getCacheMetrics(): Promise<ApplicationMetrics['cache']> {
    // Get Redis info
    const info = await this.config.redis.info('stats');
    const stats = this.parseRedisInfo(info);
    
    const hits = parseInt(stats.keyspace_hits || '0');
    const misses = parseInt(stats.keyspace_misses || '0');
    const total = hits + misses;
    
    return {
      hits,
      misses,
      hitRate: total > 0 ? (hits / total) * 100 : 0,
      memoryUsage: parseInt(stats.used_memory || '0'),
    };
  }

  private async getQueueMetrics(): Promise<ApplicationMetrics['queue']> {
    const metricsKey = 'metrics:queue:current';
    const stored = await this.config.redis.get(metricsKey);
    
    return stored ? JSON.parse(stored) : {
      processed: 0,
      failed: 0,
      waiting: 0,
      avgProcessingTime: 0,
    };
  }

  // Storage and Alerting
  private async storeMetrics(system: SystemMetrics, app: ApplicationMetrics): Promise<void> {
    const timestamp = Date.now();
    const key = `metrics:${Math.floor(timestamp / 1000)}`;
    
    const data = {
      timestamp,
      system,
      application: app,
    };

    await this.config.redis.setex(
      key,
      this.config.retention.raw,
      JSON.stringify(data)
    );

    // Update current metrics for quick access
    await Promise.all([
      this.config.redis.setex('metrics:system:current', 60, JSON.stringify(system)),
      this.config.redis.setex('metrics:application:current', 60, JSON.stringify(app)),
    ]);
  }

  private async checkThresholds(system: SystemMetrics, app: ApplicationMetrics): Promise<void> {
    // CPU threshold
    if (system.cpu.usage > this.config.thresholds.cpu) {
      await this.createOrUpdateAlert({
        type: 'cpu',
        severity: system.cpu.usage > this.config.thresholds.cpu * 1.5 ? 'critical' : 'warning',
        message: `CPU usage is ${system.cpu.usage.toFixed(1)}%`,
        value: system.cpu.usage,
        threshold: this.config.thresholds.cpu,
      });
    } else {
      await this.resolveAlert('cpu');
    }

    // Memory threshold
    if (system.memory.percentage > this.config.thresholds.memory) {
      await this.createOrUpdateAlert({
        type: 'memory',
        severity: system.memory.percentage > this.config.thresholds.memory * 1.2 ? 'critical' : 'warning',
        message: `Memory usage is ${system.memory.percentage.toFixed(1)}%`,
        value: system.memory.percentage,
        threshold: this.config.thresholds.memory,
      });
    } else {
      await this.resolveAlert('memory');
    }

    // Response time threshold
    if (app.http.avgResponseTime > this.config.thresholds.responseTime) {
      await this.createOrUpdateAlert({
        type: 'response_time',
        severity: app.http.avgResponseTime > this.config.thresholds.responseTime * 2 ? 'critical' : 'warning',
        message: `Average response time is ${app.http.avgResponseTime.toFixed(0)}ms`,
        value: app.http.avgResponseTime,
        threshold: this.config.thresholds.responseTime,
      });
    } else {
      await this.resolveAlert('response_time');
    }

    // Error rate threshold
    const errorRate = app.http.requests > 0 ? (app.http.errors / app.http.requests) * 100 : 0;
    if (errorRate > this.config.thresholds.errorRate) {
      await this.createOrUpdateAlert({
        type: 'error_rate',
        severity: errorRate > this.config.thresholds.errorRate * 2 ? 'critical' : 'warning',
        message: `Error rate is ${errorRate.toFixed(1)}%`,
        value: errorRate,
        threshold: this.config.thresholds.errorRate,
      });
    } else {
      await this.resolveAlert('error_rate');
    }
  }

  private async createOrUpdateAlert(params: Omit<Alert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const alertId = `alert:${params.type}`;
    const existing = this.activeAlerts.get(alertId);

    if (!existing || existing.severity !== params.severity) {
      const alert: Alert = {
        id: alertId,
        ...params,
        timestamp: new Date(),
        resolved: false,
      };

      this.activeAlerts.set(alertId, alert);
      await this.config.redis.hset('alerts:active', alertId, JSON.stringify(alert));
      
      this.emit('alert:created', alert);
      this.logger.warn('Performance alert created', { alert });
    }
  }

  private async resolveAlert(type: string): Promise<void> {
    const alertId = `alert:${type}`;
    const alert = this.activeAlerts.get(alertId);

    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      
      this.activeAlerts.delete(alertId);
      await this.config.redis.hdel('alerts:active', alertId);
      
      this.emit('alert:resolved', alert);
      this.logger.info('Performance alert resolved', { alert });
    }
  }

  // Public Methods
  async getCurrentMetrics(): Promise<{ system: SystemMetrics; application: ApplicationMetrics }> {
    const [system, application] = await Promise.all([
      this.config.redis.get('metrics:system:current').then(data => data ? JSON.parse(data) : null),
      this.config.redis.get('metrics:application:current').then(data => data ? JSON.parse(data) : null),
    ]);

    if (!system || !application) {
      // Collect fresh metrics if not available
      const [freshSystem, freshApp] = await Promise.all([
        this.collectSystemMetrics(),
        this.collectApplicationMetrics(),
      ]);
      
      return { system: freshSystem, application: freshApp };
    }

    return { system, application };
  }

  async getHistoricalMetrics(startTime: Date, endTime: Date): Promise<any[]> {
    const metrics: any[] = [];
    const startTs = Math.floor(startTime.getTime() / 1000);
    const endTs = Math.floor(endTime.getTime() / 1000);

    for (let ts = startTs; ts <= endTs; ts += this.config.collectInterval / 1000) {
      const data = await this.config.redis.get(`metrics:${ts}`);
      if (data) {
        metrics.push(JSON.parse(data));
      }
    }

    return metrics;
  }

  async getActiveAlerts(): Promise<Alert[]> {
    return Array.from(this.activeAlerts.values());
  }

  recordHTTPRequest(responseTime: number, error: boolean = false): void {
    this.httpMetrics.requests.push(1);
    if (error) this.httpMetrics.errors.push(1);
    this.httpMetrics.responseTimes.push(responseTime);

    // Keep only last 1000 entries
    if (this.httpMetrics.requests.length > 1000) {
      this.httpMetrics.requests.shift();
      this.httpMetrics.errors.shift();
      this.httpMetrics.responseTimes.shift();
    }
  }

  // Helper Methods
  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const index = Math.ceil(arr.length * p) - 1;
    return arr[index] || 0;
  }

  private parseRedisInfo(info: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = value;
      }
    }
    
    return result;
  }

  async shutdown(): Promise<void> {
    if (this.collectTimer) {
      clearInterval(this.collectTimer);
    }
    
    // Store final metrics
    const [system, app] = await Promise.all([
      this.collectSystemMetrics(),
      this.collectApplicationMetrics(),
    ]);
    
    await this.storeMetrics(system, app);
    
    this.logger.info('Performance metrics service shutdown complete');
  }
}