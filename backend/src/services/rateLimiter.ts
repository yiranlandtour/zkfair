import { Redis } from 'ioredis';
import { NotificationType } from '../types/notification';
import { logger } from '../utils/logger';

export interface RateLimitConfig {
  perUser: {
    window: number; // seconds
    max: number;    // max notifications per window
  };
  perChannel: Record<string, { window: number; max: number }>;
}

export class RateLimiter {
  private redis: Redis;
  private config: RateLimitConfig;
  private logger = logger.child({ service: 'RateLimiter' });

  constructor(redis: Redis, config: RateLimitConfig) {
    this.redis = redis;
    this.config = config;
  }

  async checkLimit(
    userId: string,
    type: NotificationType,
    channel?: string
  ): Promise<boolean> {
    try {
      // Check global user rate limit
      const userAllowed = await this.checkUserLimit(userId);
      if (!userAllowed) {
        return false;
      }
      
      // Check per-channel rate limit if channel is specified
      if (channel && this.config.perChannel[channel]) {
        const channelAllowed = await this.checkChannelLimit(userId, channel);
        if (!channelAllowed) {
          return false;
        }
      }
      
      // Check per-type rate limit
      const typeAllowed = await this.checkTypeLimit(userId, type);
      if (!typeAllowed) {
        return false;
      }
      
      return true;
    } catch (error) {
      this.logger.error('Failed to check rate limit', {
        error: error.message,
        userId,
        type,
        channel,
      });
      
      // Allow on error to avoid blocking notifications
      return true;
    }
  }

  private async checkUserLimit(userId: string): Promise<boolean> {
    const key = `notif:ratelimit:user:${userId}`;
    const { window, max } = this.config.perUser;
    
    return this.checkWindowLimit(key, window, max);
  }

  private async checkChannelLimit(
    userId: string,
    channel: string
  ): Promise<boolean> {
    const channelConfig = this.config.perChannel[channel];
    if (!channelConfig) {
      return true; // No limit configured for this channel
    }
    
    const key = `notif:ratelimit:channel:${userId}:${channel}`;
    const { window, max } = channelConfig;
    
    return this.checkWindowLimit(key, window, max);
  }

  private async checkTypeLimit(
    userId: string,
    type: NotificationType
  ): Promise<boolean> {
    // Special rate limits for certain notification types
    const typeRateLimits: Partial<Record<NotificationType, { window: number; max: number }>> = {
      [NotificationType.PROMOTIONAL]: { window: 86400, max: 2 }, // 2 per day
      [NotificationType.EDUCATIONAL]: { window: 86400, max: 3 }, // 3 per day
      [NotificationType.LOGIN_ALERT]: { window: 3600, max: 5 }, // 5 per hour
      [NotificationType.SECURITY_ALERT]: { window: 3600, max: 10 }, // 10 per hour (higher for security)
    };
    
    const typeConfig = typeRateLimits[type];
    if (!typeConfig) {
      return true; // No special limit for this type
    }
    
    const key = `notif:ratelimit:type:${userId}:${type}`;
    const { window, max } = typeConfig;
    
    return this.checkWindowLimit(key, window, max);
  }

  private async checkWindowLimit(
    key: string,
    window: number,
    max: number
  ): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - (window * 1000);
    
    // Remove old entries outside the window
    await this.redis.zremrangebyscore(key, '-inf', windowStart.toString());
    
    // Count entries in the current window
    const count = await this.redis.zcard(key);
    
    if (count >= max) {
      return false;
    }
    
    // Add current timestamp
    await this.redis.zadd(key, now, now.toString());
    
    // Set expiry on the key
    await this.redis.expire(key, window);
    
    return true;
  }

  async getRemainingLimit(
    userId: string,
    channel?: string
  ): Promise<{ remaining: number; resetAt: Date }> {
    const key = channel
      ? `notif:ratelimit:channel:${userId}:${channel}`
      : `notif:ratelimit:user:${userId}`;
    
    const config = channel && this.config.perChannel[channel]
      ? this.config.perChannel[channel]
      : this.config.perUser;
    
    const now = Date.now();
    const windowStart = now - (config.window * 1000);
    
    // Remove old entries
    await this.redis.zremrangebyscore(key, '-inf', windowStart.toString());
    
    // Count remaining
    const count = await this.redis.zcard(key);
    const remaining = Math.max(0, config.max - count);
    
    // Calculate reset time
    const oldestEntry = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
    let resetAt: Date;
    
    if (oldestEntry.length >= 2) {
      const oldestTimestamp = parseInt(oldestEntry[1]);
      resetAt = new Date(oldestTimestamp + (config.window * 1000));
    } else {
      resetAt = new Date(now + (config.window * 1000));
    }
    
    return { remaining, resetAt };
  }

  async reset(userId: string, channel?: string): Promise<void> {
    const keys: string[] = [
      `notif:ratelimit:user:${userId}`,
    ];
    
    if (channel) {
      keys.push(`notif:ratelimit:channel:${userId}:${channel}`);
    } else {
      // Reset all channels
      for (const ch of Object.keys(this.config.perChannel)) {
        keys.push(`notif:ratelimit:channel:${userId}:${ch}`);
      }
    }
    
    // Reset all type limits
    for (const type of Object.values(NotificationType)) {
      keys.push(`notif:ratelimit:type:${userId}:${type}`);
    }
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    
    this.logger.info('Reset rate limits', { userId, channel });
  }

  async getUsage(
    userId: string
  ): Promise<Record<string, { used: number; limit: number; window: number }>> {
    const usage: Record<string, { used: number; limit: number; window: number }> = {};
    
    // Get user limit usage
    const userKey = `notif:ratelimit:user:${userId}`;
    const userCount = await this.redis.zcard(userKey);
    usage.user = {
      used: userCount,
      limit: this.config.perUser.max,
      window: this.config.perUser.window,
    };
    
    // Get channel limit usage
    for (const [channel, config] of Object.entries(this.config.perChannel)) {
      const channelKey = `notif:ratelimit:channel:${userId}:${channel}`;
      const channelCount = await this.redis.zcard(channelKey);
      usage[`channel_${channel}`] = {
        used: channelCount,
        limit: config.max,
        window: config.window,
      };
    }
    
    return usage;
  }
}