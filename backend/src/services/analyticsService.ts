import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

export interface AnalyticsConfig {
  redis: Redis;
  prisma: PrismaClient;
  retention: {
    raw: number; // Days to keep raw events
    aggregated: number; // Days to keep aggregated data
  };
  aggregation: {
    intervals: string[]; // e.g., ['1m', '5m', '1h', '1d']
    enabled: boolean;
  };
}

export interface UserEvent {
  userId: string;
  eventType: string;
  properties?: Record<string, any>;
  timestamp: Date;
  sessionId?: string;
  deviceInfo?: {
    userAgent?: string;
    platform?: string;
    browser?: string;
    version?: string;
  };
}

export interface TransactionMetrics {
  transactionHash: string;
  userId: string;
  walletAddress: string;
  type: 'send' | 'receive' | 'swap' | 'contract_interaction';
  value: string;
  token: string;
  gasUsed: string;
  gasPrice: string;
  gasCost: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: Date;
  blockNumber?: number;
  metadata?: Record<string, any>;
}

export interface UserMetrics {
  userId: string;
  totalTransactions: number;
  totalVolume: string;
  totalGasSpent: string;
  activeWallets: number;
  lastActiveAt: Date;
  firstSeenAt: Date;
  segments: string[];
}

export interface SystemMetrics {
  timestamp: Date;
  activeUsers: number;
  newUsers: number;
  transactions: number;
  volume: string;
  gasRevenue: string;
  avgGasPrice: string;
  failureRate: number;
  avgResponseTime: number;
}

export class AnalyticsService extends EventEmitter {
  private config: AnalyticsConfig;
  private logger = logger.child({ service: 'AnalyticsService' });
  private aggregationInterval?: NodeJS.Timer;

  constructor(config: AnalyticsConfig) {
    super();
    this.config = config;
    
    if (config.aggregation.enabled) {
      this.startAggregation();
    }
  }

  // User Behavior Analytics
  async trackUserEvent(event: UserEvent): Promise<void> {
    try {
      // Store raw event
      await this.config.prisma.userEvent.create({
        data: {
          userId: event.userId,
          eventType: event.eventType,
          properties: event.properties || {},
          timestamp: event.timestamp,
          sessionId: event.sessionId,
          deviceInfo: event.deviceInfo || {},
        },
      });

      // Update real-time counters in Redis
      const key = `analytics:events:${event.eventType}:${this.getDateKey()}`;
      await this.config.redis.hincrby(key, event.userId, 1);
      await this.config.redis.expire(key, 86400 * this.config.retention.raw);

      // Update user activity
      await this.updateUserActivity(event.userId);

      this.emit('event:tracked', event);
    } catch (error) {
      this.logger.error('Failed to track user event', { error, event });
      throw error;
    }
  }

  async trackTransaction(metrics: TransactionMetrics): Promise<void> {
    try {
      // Store transaction metrics
      await this.config.prisma.transactionMetric.create({
        data: metrics,
      });

      // Update real-time stats in Redis
      const dateKey = this.getDateKey();
      const pipeline = this.config.redis.pipeline();
      
      // Transaction count
      pipeline.hincrby(`analytics:transactions:count:${dateKey}`, metrics.type, 1);
      
      // Volume tracking
      pipeline.hincrbyfloat(
        `analytics:transactions:volume:${dateKey}`,
        metrics.token,
        parseFloat(metrics.value)
      );
      
      // Gas metrics
      pipeline.hincrbyfloat(
        `analytics:gas:spent:${dateKey}`,
        metrics.userId,
        parseFloat(metrics.gasCost)
      );
      
      // User metrics
      pipeline.hincrby(`analytics:users:active:${dateKey}`, metrics.userId, 1);
      
      await pipeline.exec();

      // Update user metrics
      await this.updateUserMetrics(metrics.userId, metrics);

      this.emit('transaction:tracked', metrics);
    } catch (error) {
      this.logger.error('Failed to track transaction', { error, metrics });
      throw error;
    }
  }

  // Query Methods
  async getUserMetrics(userId: string): Promise<UserMetrics> {
    const [transactions, firstEvent, lastEvent] = await Promise.all([
      this.config.prisma.transactionMetric.groupBy({
        by: ['userId'],
        where: { userId },
        _count: { _all: true },
        _sum: {
          value: true,
          gasCost: true,
        },
      }),
      this.config.prisma.userEvent.findFirst({
        where: { userId },
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true },
      }),
      this.config.prisma.userEvent.findFirst({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
    ]);

    const activeWallets = await this.config.prisma.transactionMetric.findMany({
      where: { userId },
      distinct: ['walletAddress'],
      select: { walletAddress: true },
    });

    const segments = await this.calculateUserSegments(userId);

    return {
      userId,
      totalTransactions: transactions[0]?._count._all || 0,
      totalVolume: transactions[0]?._sum.value?.toString() || '0',
      totalGasSpent: transactions[0]?._sum.gasCost?.toString() || '0',
      activeWallets: activeWallets.length,
      firstSeenAt: firstEvent?.timestamp || new Date(),
      lastActiveAt: lastEvent?.timestamp || new Date(),
      segments,
    };
  }

  async getTransactionStats(params: {
    startDate: Date;
    endDate: Date;
    groupBy: 'hour' | 'day' | 'week' | 'month';
    userId?: string;
    type?: string;
  }): Promise<any[]> {
    const { startDate, endDate, groupBy, userId, type } = params;

    const where: any = {
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (userId) where.userId = userId;
    if (type) where.type = type;

    const transactions = await this.config.prisma.transactionMetric.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    });

    // Group transactions by interval
    const grouped = this.groupByInterval(transactions, groupBy);
    
    return Object.entries(grouped).map(([interval, txs]) => ({
      interval,
      count: txs.length,
      volume: txs.reduce((sum, tx) => sum + parseFloat(tx.value), 0),
      gasSpent: txs.reduce((sum, tx) => sum + parseFloat(tx.gasCost), 0),
      avgGasPrice: txs.length > 0 
        ? txs.reduce((sum, tx) => sum + parseFloat(tx.gasPrice), 0) / txs.length 
        : 0,
      failureRate: txs.length > 0
        ? txs.filter(tx => tx.status === 'failed').length / txs.length
        : 0,
    }));
  }

  async getUserBehaviorAnalytics(params: {
    startDate: Date;
    endDate: Date;
    eventTypes?: string[];
    userId?: string;
  }): Promise<any> {
    const { startDate, endDate, eventTypes, userId } = params;

    const where: any = {
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (userId) where.userId = userId;
    if (eventTypes?.length) where.eventType = { in: eventTypes };

    const events = await this.config.prisma.userEvent.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    });

    // Calculate funnel metrics
    const funnel = await this.calculateFunnel(events);
    
    // Calculate retention
    const retention = await this.calculateRetention(startDate, endDate);
    
    // User segments
    const segments = await this.calculateSegments(events);

    return {
      totalEvents: events.length,
      uniqueUsers: new Set(events.map(e => e.userId)).size,
      eventBreakdown: this.groupEventsByType(events),
      funnel,
      retention,
      segments,
      topEvents: this.getTopEvents(events),
    };
  }

  async getSystemMetrics(timestamp?: Date): Promise<SystemMetrics> {
    const date = timestamp || new Date();
    const dateKey = this.getDateKey(date);
    
    // Get metrics from Redis
    const [
      activeUsers,
      transactionCount,
      volumeData,
      gasData,
    ] = await Promise.all([
      this.config.redis.hlen(`analytics:users:active:${dateKey}`),
      this.config.redis.hvals(`analytics:transactions:count:${dateKey}`),
      this.config.redis.hgetall(`analytics:transactions:volume:${dateKey}`),
      this.config.redis.hvals(`analytics:gas:spent:${dateKey}`),
    ]);

    const totalTransactions = transactionCount.reduce((sum, count) => sum + parseInt(count), 0);
    const totalVolume = Object.values(volumeData).reduce((sum, vol) => sum + parseFloat(vol), 0);
    const totalGasRevenue = gasData.reduce((sum, gas) => sum + parseFloat(gas), 0);

    // Get failure rate from database
    const failures = await this.config.prisma.transactionMetric.count({
      where: {
        timestamp: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999)),
        },
        status: 'failed',
      },
    });

    // Calculate new users
    const newUsers = await this.config.prisma.userEvent.findMany({
      where: {
        eventType: 'user_registered',
        timestamp: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999)),
        },
      },
      distinct: ['userId'],
    });

    return {
      timestamp: date,
      activeUsers,
      newUsers: newUsers.length,
      transactions: totalTransactions,
      volume: totalVolume.toString(),
      gasRevenue: totalGasRevenue.toString(),
      avgGasPrice: totalTransactions > 0 ? (totalGasRevenue / totalTransactions).toString() : '0',
      failureRate: totalTransactions > 0 ? failures / totalTransactions : 0,
      avgResponseTime: await this.getAvgResponseTime(dateKey),
    };
  }

  // Aggregation Methods
  private startAggregation(): void {
    this.aggregationInterval = setInterval(async () => {
      try {
        await this.runAggregation();
      } catch (error) {
        this.logger.error('Aggregation failed', { error });
      }
    }, 60000); // Run every minute
  }

  private async runAggregation(): Promise<void> {
    const now = new Date();
    
    for (const interval of this.config.aggregation.intervals) {
      await this.aggregateInterval(interval, now);
    }

    // Clean up old data
    await this.cleanupOldData();
  }

  private async aggregateInterval(interval: string, timestamp: Date): Promise<void> {
    // Implementation depends on interval type
    // This is a placeholder for the aggregation logic
    this.logger.debug('Running aggregation', { interval, timestamp });
  }

  // Helper Methods
  private async updateUserActivity(userId: string): Promise<void> {
    const key = `user:activity:${userId}`;
    const now = Date.now();
    
    await this.config.redis.zadd(key, now, now.toString());
    await this.config.redis.expire(key, 86400 * 30); // 30 days
  }

  private async updateUserMetrics(userId: string, transaction: TransactionMetrics): Promise<void> {
    // Update user metrics in database
    await this.config.prisma.userMetric.upsert({
      where: { userId },
      create: {
        userId,
        totalTransactions: 1,
        totalVolume: transaction.value,
        totalGasSpent: transaction.gasCost,
        lastTransactionAt: transaction.timestamp,
      },
      update: {
        totalTransactions: { increment: 1 },
        totalVolume: { increment: parseFloat(transaction.value) },
        totalGasSpent: { increment: parseFloat(transaction.gasCost) },
        lastTransactionAt: transaction.timestamp,
      },
    });
  }

  private async calculateUserSegments(userId: string): Promise<string[]> {
    const segments: string[] = [];
    const metrics = await this.getUserMetrics(userId);

    // Value-based segments
    const volume = parseFloat(metrics.totalVolume);
    if (volume > 100000) segments.push('whale');
    else if (volume > 10000) segments.push('high_value');
    else if (volume > 1000) segments.push('medium_value');
    else segments.push('low_value');

    // Activity-based segments
    const daysSinceLastActive = (Date.now() - metrics.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastActive < 7) segments.push('active');
    else if (daysSinceLastActive < 30) segments.push('returning');
    else segments.push('dormant');

    // Transaction frequency
    if (metrics.totalTransactions > 100) segments.push('power_user');
    else if (metrics.totalTransactions > 10) segments.push('regular_user');
    else segments.push('casual_user');

    return segments;
  }

  private groupByInterval(data: any[], interval: string): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    
    data.forEach(item => {
      const key = this.getIntervalKey(item.timestamp, interval);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    return grouped;
  }

  private getIntervalKey(date: Date, interval: string): string {
    switch (interval) {
      case 'hour':
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${date.getHours()}`;
      case 'day':
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      case 'week':
        const week = Math.floor(date.getDate() / 7);
        return `${date.getFullYear()}-${date.getMonth() + 1}-W${week}`;
      case 'month':
        return `${date.getFullYear()}-${date.getMonth() + 1}`;
      default:
        return date.toISOString();
    }
  }

  private async calculateFunnel(events: any[]): Promise<any> {
    // Example funnel: registration -> first_transaction -> second_transaction
    const funnel = {
      registration: 0,
      first_transaction: 0,
      second_transaction: 0,
      retention_7d: 0,
    };

    const userEvents = new Map<string, Set<string>>();
    
    events.forEach(event => {
      if (!userEvents.has(event.userId)) {
        userEvents.set(event.userId, new Set());
      }
      userEvents.get(event.userId)!.add(event.eventType);
    });

    userEvents.forEach((eventTypes, userId) => {
      if (eventTypes.has('user_registered')) funnel.registration++;
      if (eventTypes.has('transaction_sent')) funnel.first_transaction++;
      if (eventTypes.size >= 3) funnel.second_transaction++; // Simplified logic
    });

    return funnel;
  }

  private async calculateRetention(startDate: Date, endDate: Date): Promise<any> {
    // Calculate day 1, 7, 30 retention
    const retention = {
      day1: 0,
      day7: 0,
      day30: 0,
    };

    // This is a simplified implementation
    // In production, you'd calculate actual cohort retention
    return retention;
  }

  private async calculateSegments(events: any[]): Promise<any> {
    const segments = new Map<string, number>();
    
    const userIds = [...new Set(events.map(e => e.userId))];
    
    for (const userId of userIds) {
      const userSegments = await this.calculateUserSegments(userId);
      userSegments.forEach(segment => {
        segments.set(segment, (segments.get(segment) || 0) + 1);
      });
    }

    return Object.fromEntries(segments);
  }

  private groupEventsByType(events: any[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    
    events.forEach(event => {
      grouped[event.eventType] = (grouped[event.eventType] || 0) + 1;
    });

    return grouped;
  }

  private getTopEvents(events: any[], limit: number = 10): any[] {
    const eventCounts = this.groupEventsByType(events);
    
    return Object.entries(eventCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([eventType, count]) => ({ eventType, count }));
  }

  private async getAvgResponseTime(dateKey: string): Promise<number> {
    // This would typically come from APM data
    // For now, return a placeholder
    return 150; // ms
  }

  private getDateKey(date?: Date): string {
    const d = date || new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  }

  private async cleanupOldData(): Promise<void> {
    const cutoffRaw = new Date();
    cutoffRaw.setDate(cutoffRaw.getDate() - this.config.retention.raw);
    
    const cutoffAggregated = new Date();
    cutoffAggregated.setDate(cutoffAggregated.getDate() - this.config.retention.aggregated);

    // Clean up old raw events
    await this.config.prisma.userEvent.deleteMany({
      where: {
        timestamp: { lt: cutoffRaw },
      },
    });

    // Clean up old transaction metrics
    await this.config.prisma.transactionMetric.deleteMany({
      where: {
        timestamp: { lt: cutoffAggregated },
      },
    });

    this.logger.info('Cleaned up old analytics data', { cutoffRaw, cutoffAggregated });
  }

  async shutdown(): Promise<void> {
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
    }
    
    this.logger.info('Analytics service shutdown complete');
  }
}