import { Redis } from 'ioredis';
import { NotificationEvent, NotificationMetrics, NotificationType } from '../types/notification';
import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';

export class NotificationAnalytics {
  private redis: Redis;
  private logger = logger.child({ service: 'NotificationAnalytics' });

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async trackEvent(
    event: NotificationEvent,
    channels: string[]
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      const dateKey = new Date().toISOString().split('T')[0];
      
      // Track overall metrics
      await this.redis.hincrby('notif:metrics:total', 'sent', 1);
      await this.redis.hincrby(`notif:metrics:daily:${dateKey}`, 'sent', 1);
      
      // Track by type
      await this.redis.hincrby('notif:metrics:byType', event.type, 1);
      await this.redis.hincrby(`notif:metrics:byType:${dateKey}`, event.type, 1);
      
      // Track by channel
      for (const channel of channels) {
        await this.redis.hincrby('notif:metrics:byChannel', channel, 1);
        await this.redis.hincrby(`notif:metrics:byChannel:${dateKey}`, channel, 1);
      }
      
      // Track by severity
      await this.redis.hincrby('notif:metrics:bySeverity', event.severity, 1);
      
      // Track hourly distribution
      const hour = new Date().getHours();
      await this.redis.hincrby('notif:metrics:hourly', hour.toString(), 1);
      
      // Store event for recent activity
      await this.redis.zadd(
        'notif:recent',
        timestamp,
        JSON.stringify({
          id: event.id,
          type: event.type,
          severity: event.severity,
          channels,
          timestamp,
        })
      );
      
      // Trim recent activity to last 1000 events
      await this.redis.zremrangebyrank('notif:recent', 0, -1001);
      
      // Track user activity if userId is present
      if (event.userId) {
        await this.redis.hincrby(`notif:user:${event.userId}`, 'sent', 1);
        await this.redis.zadd(
          `notif:user:${event.userId}:recent`,
          timestamp,
          event.id
        );
        
        // Trim user recent to last 100
        await this.redis.zremrangebyrank(`notif:user:${event.userId}:recent`, 0, -101);
      }
    } catch (error) {
      this.logger.error('Failed to track notification event', {
        error: error.message,
        eventId: event.id,
      });
    }
  }

  async trackDelivery(
    eventId: string,
    channel: string,
    success: boolean,
    messageId?: string | null,
    error?: string
  ): Promise<void> {
    try {
      const dateKey = new Date().toISOString().split('T')[0];
      
      if (success) {
        await this.redis.hincrby('notif:metrics:total', 'delivered', 1);
        await this.redis.hincrby(`notif:metrics:daily:${dateKey}`, 'delivered', 1);
        await this.redis.hincrby(`notif:metrics:byChannel:${channel}`, 'delivered', 1);
      } else {
        await this.redis.hincrby('notif:metrics:total', 'failed', 1);
        await this.redis.hincrby(`notif:metrics:daily:${dateKey}`, 'failed', 1);
        await this.redis.hincrby(`notif:metrics:byChannel:${channel}`, 'failed', 1);
        
        // Track error reasons
        if (error) {
          const errorKey = this.categorizeError(error);
          await this.redis.hincrby('notif:metrics:errors', errorKey, 1);
        }
      }
      
      // Update notification log in database
      await prisma.notificationLog.create({
        data: {
          eventId,
          channel,
          status: success ? 'delivered' : 'failed',
          messageId,
          deliveredAt: success ? new Date() : undefined,
          error,
        },
      });
      
      // Track delivery time
      if (success) {
        const deliveryTime = Date.now();
        await this.redis.zadd(
          'notif:metrics:deliveryTimes',
          deliveryTime,
          `${eventId}:${channel}`
        );
      }
    } catch (error) {
      this.logger.error('Failed to track delivery', {
        error: error.message,
        eventId,
        channel,
      });
    }
  }

  async trackEngagement(
    eventId: string,
    action: 'opened' | 'clicked' | 'unsubscribed',
    metadata?: any
  ): Promise<void> {
    try {
      const dateKey = new Date().toISOString().split('T')[0];
      
      await this.redis.hincrby('notif:metrics:total', action, 1);
      await this.redis.hincrby(`notif:metrics:daily:${dateKey}`, action, 1);
      
      // Update notification log
      const updateData: any = {};
      if (action === 'opened') {
        updateData.openedAt = new Date();
      } else if (action === 'clicked') {
        updateData.clickedAt = new Date();
      }
      
      await prisma.notificationLog.updateMany({
        where: { eventId },
        data: updateData,
      });
      
      // Track engagement funnel
      await this.redis.zadd(
        `notif:engagement:${action}`,
        Date.now(),
        JSON.stringify({ eventId, metadata })
      );
    } catch (error) {
      this.logger.error('Failed to track engagement', {
        error: error.message,
        eventId,
        action,
      });
    }
  }

  async getMetrics(period?: 'today' | 'week' | 'month'): Promise<NotificationMetrics> {
    try {
      const metrics: NotificationMetrics = {
        sent: 0,
        delivered: 0,
        failed: 0,
        bounced: 0,
        opened: 0,
        clicked: 0,
        unsubscribed: 0,
        avgDeliveryTime: 0,
        queueDepth: 0,
        processingRate: 0,
        byChannel: {},
        byType: {},
      };
      
      // Get total metrics or period-specific metrics
      let metricsKey = 'notif:metrics:total';
      if (period === 'today') {
        const dateKey = new Date().toISOString().split('T')[0];
        metricsKey = `notif:metrics:daily:${dateKey}`;
      }
      
      const totalMetrics = await this.redis.hgetall(metricsKey);
      Object.assign(metrics, {
        sent: parseInt(totalMetrics.sent || '0'),
        delivered: parseInt(totalMetrics.delivered || '0'),
        failed: parseInt(totalMetrics.failed || '0'),
        bounced: parseInt(totalMetrics.bounced || '0'),
        opened: parseInt(totalMetrics.opened || '0'),
        clicked: parseInt(totalMetrics.clicked || '0'),
        unsubscribed: parseInt(totalMetrics.unsubscribed || '0'),
      });
      
      // Calculate average delivery time
      const deliveryTimes = await this.redis.zrange(
        'notif:metrics:deliveryTimes',
        -100,
        -1,
        'WITHSCORES'
      );
      
      if (deliveryTimes.length > 0) {
        const times: number[] = [];
        for (let i = 1; i < deliveryTimes.length; i += 2) {
          times.push(parseInt(deliveryTimes[i]));
        }
        metrics.avgDeliveryTime = times.reduce((a, b) => a + b, 0) / times.length;
      }
      
      // Get channel metrics
      const channelMetrics = await this.redis.hgetall('notif:metrics:byChannel');
      for (const [channel, count] of Object.entries(channelMetrics)) {
        const delivered = await this.redis.hget(
          `notif:metrics:byChannel:${channel}`,
          'delivered'
        );
        const failed = await this.redis.hget(
          `notif:metrics:byChannel:${channel}`,
          'failed'
        );
        
        metrics.byChannel[channel] = {
          sent: parseInt(count),
          delivered: parseInt(delivered || '0'),
          failed: parseInt(failed || '0'),
          avgDeliveryTime: 0,
        };
      }
      
      // Get type metrics
      const typeMetrics = await this.redis.hgetall('notif:metrics:byType');
      for (const [type, count] of Object.entries(typeMetrics)) {
        metrics.byType[type] = {
          sent: parseInt(count),
          delivered: 0,
          opened: 0,
          clicked: 0,
        };
      }
      
      return metrics;
    } catch (error) {
      this.logger.error('Failed to get metrics', { error: error.message });
      throw error;
    }
  }

  async getUserMetrics(userId: string): Promise<any> {
    try {
      const userMetrics = await this.redis.hgetall(`notif:user:${userId}`);
      const recentNotifications = await this.redis.zrevrange(
        `notif:user:${userId}:recent`,
        0,
        19
      );
      
      return {
        sent: parseInt(userMetrics.sent || '0'),
        delivered: parseInt(userMetrics.delivered || '0'),
        opened: parseInt(userMetrics.opened || '0'),
        clicked: parseInt(userMetrics.clicked || '0'),
        recent: recentNotifications,
      };
    } catch (error) {
      this.logger.error('Failed to get user metrics', {
        error: error.message,
        userId,
      });
      return null;
    }
  }

  async getRecentActivity(limit = 100): Promise<any[]> {
    try {
      const recent = await this.redis.zrevrange(
        'notif:recent',
        0,
        limit - 1
      );
      
      return recent.map(item => {
        try {
          return JSON.parse(item);
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch (error) {
      this.logger.error('Failed to get recent activity', { error: error.message });
      return [];
    }
  }

  async getErrorStats(): Promise<Record<string, number>> {
    try {
      const errors = await this.redis.hgetall('notif:metrics:errors');
      const stats: Record<string, number> = {};
      
      for (const [error, count] of Object.entries(errors)) {
        stats[error] = parseInt(count);
      }
      
      return stats;
    } catch (error) {
      this.logger.error('Failed to get error stats', { error: error.message });
      return {};
    }
  }

  private categorizeError(error: string): string {
    const lowerError = error.toLowerCase();
    
    if (lowerError.includes('rate limit')) return 'rate_limited';
    if (lowerError.includes('invalid') && lowerError.includes('email')) return 'invalid_email';
    if (lowerError.includes('invalid') && lowerError.includes('phone')) return 'invalid_phone';
    if (lowerError.includes('bounce')) return 'bounced';
    if (lowerError.includes('spam')) return 'spam_blocked';
    if (lowerError.includes('unsubscribed')) return 'unsubscribed';
    if (lowerError.includes('timeout')) return 'timeout';
    if (lowerError.includes('network')) return 'network_error';
    if (lowerError.includes('auth')) return 'auth_error';
    
    return 'other';
  }

  async cleanup(daysToKeep = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      // Clean up old daily metrics
      const keys = await this.redis.keys('notif:metrics:daily:*');
      for (const key of keys) {
        const dateStr = key.split(':').pop();
        if (dateStr && new Date(dateStr) < cutoffDate) {
          await this.redis.del(key);
        }
      }
      
      // Clean up old notification logs from database
      await prisma.notificationLog.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
        },
      });
      
      this.logger.info('Cleaned up old notification data', {
        daysKept: daysToKeep,
        cutoffDate,
      });
    } catch (error) {
      this.logger.error('Failed to cleanup old data', { error: error.message });
    }
  }
}