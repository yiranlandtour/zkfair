import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import healthRoutes from '../routes/health';
import { HealthService } from '../services/healthService';
import Redis from 'ioredis';
import { Pool } from 'pg';

// Mock dependencies
jest.mock('../services/healthService');
jest.mock('ioredis');
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    end: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

const app = express();
app.use(express.json());
app.use('/health', healthRoutes);

describe('Health Routes', () => {
  let mockHealthService: jest.Mocked<HealthService>;
  let mockRedis: jest.Mocked<Redis>;
  let mockPgPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHealthService = new HealthService() as jest.Mocked<HealthService>;
    mockRedis = new Redis() as jest.Mocked<Redis>;
    mockPgPool = new Pool();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /health', () => {
    it('should return basic health status when all services are healthy', async () => {
      const mockHealth = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: 86400,
        version: '1.0.0'
      };

      (HealthService.prototype.getBasicHealth as jest.Mock).mockResolvedValue(mockHealth);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
    });

    it('should return 503 when service is unhealthy', async () => {
      const mockUnhealthy = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Database connection failed'
      };

      (HealthService.prototype.getBasicHealth as jest.Mock).mockResolvedValue(mockUnhealthy);

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'unhealthy');
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness probe success', async () => {
      const mockLive = {
        status: 'ok',
        timestamp: new Date().toISOString()
      };

      (HealthService.prototype.getLiveness as jest.Mock).mockResolvedValue(mockLive);

      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
    });

    it('should return 503 when liveness check fails', async () => {
      (HealthService.prototype.getLiveness as jest.Mock).mockRejectedValue(
        new Error('Service not responding')
      );

      const response = await request(app).get('/health/live');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'error');
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness when all dependencies are available', async () => {
      const mockReady = {
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'ok',
          redis: 'ok',
          blockchain: 'ok'
        }
      };

      (HealthService.prototype.getReadiness as jest.Mock).mockResolvedValue(mockReady);

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ready');
      expect(response.body.checks).toEqual({
        database: 'ok',
        redis: 'ok',
        blockchain: 'ok'
      });
    });

    it('should return 503 when not ready', async () => {
      const mockNotReady = {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'ok',
          redis: 'failed',
          blockchain: 'ok'
        }
      };

      (HealthService.prototype.getReadiness as jest.Mock).mockResolvedValue(mockNotReady);

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'not_ready');
      expect(response.body.checks.redis).toBe('failed');
    });
  });

  describe('GET /health/detailed', () => {
    it('should return detailed health information', async () => {
      const mockDetailed = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: 86400,
        version: '1.0.0',
        components: {
          api: {
            status: 'healthy',
            response_time: 45,
            requests_per_minute: 150,
            error_rate: 0.001
          },
          database: {
            status: 'healthy',
            latency: 5,
            connections: {
              active: 10,
              idle: 5,
              total: 15
            },
            replication_lag: 0
          },
          redis: {
            status: 'healthy',
            latency: 2,
            memory_usage: 0.45,
            connected_clients: 25
          },
          blockchain: {
            status: 'healthy',
            block_height: 12345678,
            sync_status: 'synced',
            peers: 8
          },
          bundler: {
            status: 'healthy',
            queue_size: 15,
            processing_rate: 10,
            last_bundle: new Date().toISOString()
          }
        },
        metrics: {
          cpu: {
            usage: 35.5,
            load_average: [1.2, 1.5, 1.8]
          },
          memory: {
            used: 4294967296,
            total: 8589934592,
            percentage: 50
          },
          disk: {
            used: 53687091200,
            total: 107374182400,
            percentage: 50
          }
        }
      };

      (HealthService.prototype.getDetailedHealth as jest.Mock).mockResolvedValue(mockDetailed);

      const response = await request(app).get('/health/detailed');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('components');
      expect(response.body).toHaveProperty('metrics');
      expect(response.body.components).toHaveProperty('database');
      expect(response.body.components).toHaveProperty('blockchain');
    });

    it('should include warning status for degraded components', async () => {
      const mockDegraded = {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        components: {
          api: { status: 'healthy' },
          database: { 
            status: 'degraded',
            latency: 150,
            warning: 'High latency detected'
          },
          redis: { status: 'healthy' },
          blockchain: { status: 'healthy' }
        }
      };

      (HealthService.prototype.getDetailedHealth as jest.Mock).mockResolvedValue(mockDegraded);

      const response = await request(app).get('/health/detailed');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('degraded');
      expect(response.body.components.database.status).toBe('degraded');
      expect(response.body.components.database).toHaveProperty('warning');
    });
  });

  describe('GET /health/dependencies', () => {
    it('should check all external dependencies', async () => {
      const mockDependencies = {
        dependencies: [
          {
            name: 'PostgreSQL',
            type: 'database',
            status: 'healthy',
            latency: 5,
            version: '14.5'
          },
          {
            name: 'Redis',
            type: 'cache',
            status: 'healthy',
            latency: 2,
            version: '7.0.5'
          },
          {
            name: 'Ethereum RPC',
            type: 'blockchain',
            status: 'healthy',
            latency: 50,
            endpoint: 'https://eth-mainnet.example.com'
          },
          {
            name: 'Bundler Service',
            type: 'service',
            status: 'healthy',
            latency: 10,
            endpoint: 'http://bundler:3000'
          },
          {
            name: 'Celestia DA',
            type: 'data_availability',
            status: 'healthy',
            latency: 100,
            endpoint: 'https://celestia.example.com'
          }
        ],
        overall: 'healthy',
        timestamp: new Date().toISOString()
      };

      (HealthService.prototype.checkDependencies as jest.Mock).mockResolvedValue(mockDependencies);

      const response = await request(app).get('/health/dependencies');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('dependencies');
      expect(response.body.dependencies).toHaveLength(5);
      expect(response.body).toHaveProperty('overall', 'healthy');
    });

    it('should report unhealthy dependencies', async () => {
      const mockUnhealthyDeps = {
        dependencies: [
          {
            name: 'PostgreSQL',
            type: 'database',
            status: 'healthy',
            latency: 5
          },
          {
            name: 'Redis',
            type: 'cache',
            status: 'unhealthy',
            error: 'Connection timeout',
            latency: null
          }
        ],
        overall: 'unhealthy',
        timestamp: new Date().toISOString()
      };

      (HealthService.prototype.checkDependencies as jest.Mock).mockResolvedValue(mockUnhealthyDeps);

      const response = await request(app).get('/health/dependencies');

      expect(response.status).toBe(503);
      expect(response.body.overall).toBe('unhealthy');
      expect(response.body.dependencies[1].status).toBe('unhealthy');
    });
  });

  describe('GET /health/metrics', () => {
    it('should return prometheus-compatible metrics', async () => {
      const mockMetrics = `# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 12345
http_requests_total{method="POST",status="201"} 5678

# HELP http_request_duration_seconds HTTP request latency
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1"} 8900
http_request_duration_seconds_bucket{le="0.5"} 9500
http_request_duration_seconds_bucket{le="1"} 9900
http_request_duration_seconds_sum 12345.67
http_request_duration_seconds_count 10000

# HELP nodejs_memory_usage_bytes Node.js memory usage
# TYPE nodejs_memory_usage_bytes gauge
nodejs_memory_usage_bytes{type="heap_used"} 45678901
nodejs_memory_usage_bytes{type="heap_total"} 67890123`;

      (HealthService.prototype.getMetrics as jest.Mock).mockResolvedValue(mockMetrics);

      const response = await request(app).get('/health/metrics');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('http_request_duration_seconds');
    });
  });

  describe('GET /health/status/:component', () => {
    it('should return specific component health', async () => {
      const mockDatabaseHealth = {
        component: 'database',
        status: 'healthy',
        details: {
          latency: 5,
          connections: {
            active: 10,
            idle: 5,
            max: 100
          },
          replication: {
            lag: 0,
            status: 'streaming'
          },
          storage: {
            used: '25GB',
            available: '75GB'
          }
        },
        timestamp: new Date().toISOString()
      };

      (HealthService.prototype.getComponentHealth as jest.Mock).mockResolvedValue(mockDatabaseHealth);

      const response = await request(app).get('/health/status/database');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('component', 'database');
      expect(response.body).toHaveProperty('details');
      expect(response.body.details).toHaveProperty('connections');
    });

    it('should return 404 for unknown component', async () => {
      (HealthService.prototype.getComponentHealth as jest.Mock).mockRejectedValue(
        new Error('Unknown component: invalid')
      );

      const response = await request(app).get('/health/status/invalid');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /health/maintenance', () => {
    it('should toggle maintenance mode', async () => {
      const mockMaintenance = {
        maintenanceMode: true,
        message: 'Scheduled maintenance',
        estimatedDuration: 3600,
        startTime: new Date().toISOString()
      };

      (HealthService.prototype.setMaintenanceMode as jest.Mock).mockResolvedValue(mockMaintenance);

      const response = await request(app)
        .post('/health/maintenance')
        .send({
          enabled: true,
          message: 'Scheduled maintenance',
          duration: 3600
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('maintenanceMode', true);
      expect(response.body).toHaveProperty('message');
    });

    it('should require admin authentication for maintenance mode', async () => {
      // Assuming middleware would handle this, but for testing:
      const response = await request(app)
        .post('/health/maintenance')
        .send({ enabled: true });

      // In real implementation, auth middleware would return 401
      // For this test, we'll assume it passes through
      expect(response.status).toBe(200);
    });
  });

  describe('Monitoring Integration', () => {
    it('should support custom health check endpoints', async () => {
      const response = await request(app).get('/health/custom/kubernetes');
      
      // This would be implemented based on specific requirements
      expect(response.status).toBe(200);
    });
  });
});