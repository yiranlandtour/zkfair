import { createClient } from 'redis';
import { logger } from './logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        logger.error('Redis reconnection failed after 10 attempts');
        return new Error('Too many retries');
      }
      return Math.min(retries * 100, 3000);
    },
  },
});

redis.on('error', (err) => {
  logger.error('Redis error:', err);
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

redis.on('reconnecting', () => {
  logger.warn('Reconnecting to Redis...');
});

// Connect immediately
redis.connect().catch((err) => {
  logger.error('Failed to connect to Redis:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await redis.quit();
});

export default redis;