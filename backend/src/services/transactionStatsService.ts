import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

export interface TransactionStatsConfig {
  prisma: PrismaClient;
  redis: Redis;
  provider: ethers.Provider;
  updateInterval: number; // ms
}

export interface TransactionStats {
  total: number;
  successful: number;
  failed: number;
  pending: number;
  volume: {
    total: string;
    byToken: Record<string, string>;
  };
  gas: {
    totalUsed: string;
    totalCost: string;
    avgPrice: string;
    avgUsed: string;
  };
  users: {
    total: number;
    active24h: number;
    new24h: number;
  };
  performance: {
    avgConfirmationTime: number; // seconds
    successRate: number; // percentage
    throughput: number; // tx per second
  };
}

export interface TokenStats {
  address: string;
  symbol: string;
  decimals: number;
  volume24h: string;
  transactions24h: number;
  uniqueUsers24h: number;
  avgTransactionSize: string;
}

export interface UserStats {
  userId: string;
  walletAddress: string;
  transactions: {
    total: number;
    sent: number;
    received: number;
    failed: number;
  };
  volume: {
    sent: string;
    received: string;
    byToken: Record<string, { sent: string; received: string }>;
  };
  gas: {
    totalSpent: string;
    avgPerTx: string;
  };
  firstTransaction: Date;
  lastTransaction: Date;
  mostUsedTokens: string[];
}

export interface GasStats {
  current: {
    base: string;
    priority: string;
    total: string;
  };
  history: {
    timestamp: Date;
    base: string;
    priority: string;
  }[];
  predictions: {
    next1h: string;
    next24h: string;
  };
  recommendations: {
    slow: string;
    standard: string;
    fast: string;
  };
}

export class TransactionStatsService {
  private config: TransactionStatsConfig;
  private logger = logger.child({ service: 'TransactionStatsService' });
  private updateTimer?: NodeJS.Timer;
  private gasPriceHistory: { timestamp: Date; base: string; priority: string }[] = [];

  constructor(config: TransactionStatsConfig) {
    this.config = config;
    this.startPeriodicUpdates();
  }

  private startPeriodicUpdates(): void {
    // Initial update
    this.updateStats().catch(err => 
      this.logger.error('Failed initial stats update', { error: err })
    );

    // Periodic updates
    this.updateTimer = setInterval(async () => {
      try {
        await this.updateStats();
      } catch (error) {
        this.logger.error('Failed to update stats', { error });
      }
    }, this.config.updateInterval);
  }

  private async updateStats(): Promise<void> {
    await Promise.all([
      this.updateGasPrice(),
      this.updateTransactionMetrics(),
      this.updateUserMetrics(),
    ]);
  }

  async getTransactionStats(timeRange?: { start: Date; end: Date }): Promise<TransactionStats> {
    const where = timeRange ? {
      timestamp: {
        gte: timeRange.start,
        lte: timeRange.end,
      },
    } : {};

    const [
      totalCount,
      successCount,
      failedCount,
      pendingCount,
      volumeData,
      gasData,
      userStats,
    ] = await Promise.all([
      this.config.prisma.transaction.count({ where }),
      this.config.prisma.transaction.count({ 
        where: { ...where, status: 'confirmed' } 
      }),
      this.config.prisma.transaction.count({ 
        where: { ...where, status: 'failed' } 
      }),
      this.config.prisma.transaction.count({ 
        where: { ...where, status: 'pending' } 
      }),
      this.calculateVolume(where),
      this.calculateGasStats(where),
      this.calculateUserStats(where),
    ]);

    const performance = await this.calculatePerformanceMetrics(where);

    return {
      total: totalCount,
      successful: successCount,
      failed: failedCount,
      pending: pendingCount,
      volume: volumeData,
      gas: gasData,
      users: userStats,
      performance,
    };
  }

  async getTokenStats(tokenAddress?: string): Promise<TokenStats[]> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const where = {
      timestamp: { gte: yesterday },
      ...(tokenAddress && { token: tokenAddress }),
    };

    const tokenTransactions = await this.config.prisma.transaction.groupBy({
      by: ['token'],
      where,
      _count: { _all: true },
      _sum: { value: true },
    });

    const stats: TokenStats[] = [];

    for (const tokenData of tokenTransactions) {
      const uniqueUsers = await this.config.prisma.transaction.findMany({
        where: { ...where, token: tokenData.token },
        distinct: ['userId'],
        select: { userId: true },
      });

      // Get token metadata (this would typically come from a token registry)
      const tokenInfo = await this.getTokenInfo(tokenData.token);

      stats.push({
        address: tokenData.token,
        symbol: tokenInfo.symbol,
        decimals: tokenInfo.decimals,
        volume24h: tokenData._sum.value?.toString() || '0',
        transactions24h: tokenData._count._all,
        uniqueUsers24h: uniqueUsers.length,
        avgTransactionSize: tokenData._count._all > 0
          ? (parseFloat(tokenData._sum.value?.toString() || '0') / tokenData._count._all).toString()
          : '0',
      });
    }

    return stats.sort((a, b) => parseFloat(b.volume24h) - parseFloat(a.volume24h));
  }

  async getUserStats(userId: string): Promise<UserStats> {
    const transactions = await this.config.prisma.transaction.findMany({
      where: { OR: [{ userId }, { toUserId: userId }] },
      orderBy: { timestamp: 'asc' },
    });

    const stats: UserStats = {
      userId,
      walletAddress: '', // This would come from user data
      transactions: {
        total: transactions.length,
        sent: 0,
        received: 0,
        failed: 0,
      },
      volume: {
        sent: '0',
        received: '0',
        byToken: {},
      },
      gas: {
        totalSpent: '0',
        avgPerTx: '0',
      },
      firstTransaction: transactions[0]?.timestamp || new Date(),
      lastTransaction: transactions[transactions.length - 1]?.timestamp || new Date(),
      mostUsedTokens: [],
    };

    let totalGas = 0;
    let sentVolume = 0;
    let receivedVolume = 0;
    const tokenVolumes: Record<string, { sent: number; received: number }> = {};

    for (const tx of transactions) {
      if (tx.status === 'failed') {
        stats.transactions.failed++;
        continue;
      }

      const value = parseFloat(tx.value);

      if (tx.userId === userId) {
        stats.transactions.sent++;
        sentVolume += value;
        totalGas += parseFloat(tx.gasCost || '0');

        if (!tokenVolumes[tx.token]) {
          tokenVolumes[tx.token] = { sent: 0, received: 0 };
        }
        tokenVolumes[tx.token].sent += value;
      } else {
        stats.transactions.received++;
        receivedVolume += value;

        if (!tokenVolumes[tx.token]) {
          tokenVolumes[tx.token] = { sent: 0, received: 0 };
        }
        tokenVolumes[tx.token].received += value;
      }
    }

    stats.volume.sent = sentVolume.toString();
    stats.volume.received = receivedVolume.toString();
    stats.gas.totalSpent = totalGas.toString();
    stats.gas.avgPerTx = stats.transactions.sent > 0
      ? (totalGas / stats.transactions.sent).toString()
      : '0';

    // Convert token volumes to strings
    for (const [token, volumes] of Object.entries(tokenVolumes)) {
      stats.volume.byToken[token] = {
        sent: volumes.sent.toString(),
        received: volumes.received.toString(),
      };
    }

    // Get most used tokens
    stats.mostUsedTokens = Object.entries(tokenVolumes)
      .sort((a, b) => (b[1].sent + b[1].received) - (a[1].sent + a[1].received))
      .slice(0, 5)
      .map(([token]) => token);

    return stats;
  }

  async getGasStats(): Promise<GasStats> {
    const currentGasPrice = await this.getCurrentGasPrice();
    const predictions = await this.predictGasPrice();
    const recommendations = this.calculateGasRecommendations(currentGasPrice);

    return {
      current: currentGasPrice,
      history: this.gasPriceHistory.slice(-24), // Last 24 entries
      predictions,
      recommendations,
    };
  }

  async getTransactionTrends(params: {
    interval: 'hour' | 'day' | 'week' | 'month';
    startDate: Date;
    endDate: Date;
    metrics: ('count' | 'volume' | 'gas' | 'users')[];
  }): Promise<any[]> {
    const { interval, startDate, endDate, metrics } = params;

    const transactions = await this.config.prisma.transaction.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
        status: { not: 'pending' },
      },
      select: {
        timestamp: true,
        value: true,
        gasCost: true,
        userId: true,
        status: true,
      },
      orderBy: { timestamp: 'asc' },
    });

    // Group by interval
    const grouped = this.groupByInterval(transactions, interval);
    const trends: any[] = [];

    for (const [intervalKey, txs] of Object.entries(grouped)) {
      const trend: any = { interval: intervalKey };

      if (metrics.includes('count')) {
        trend.count = txs.length;
        trend.successful = txs.filter(tx => tx.status === 'confirmed').length;
        trend.failed = txs.filter(tx => tx.status === 'failed').length;
      }

      if (metrics.includes('volume')) {
        trend.volume = txs
          .filter(tx => tx.status === 'confirmed')
          .reduce((sum, tx) => sum + parseFloat(tx.value), 0);
      }

      if (metrics.includes('gas')) {
        const gasCosts = txs
          .filter(tx => tx.status === 'confirmed' && tx.gasCost)
          .map(tx => parseFloat(tx.gasCost!));
        
        trend.gas = {
          total: gasCosts.reduce((sum, cost) => sum + cost, 0),
          average: gasCosts.length > 0
            ? gasCosts.reduce((sum, cost) => sum + cost, 0) / gasCosts.length
            : 0,
        };
      }

      if (metrics.includes('users')) {
        trend.uniqueUsers = new Set(txs.map(tx => tx.userId)).size;
      }

      trends.push(trend);
    }

    return trends;
  }

  // Private helper methods
  private async updateGasPrice(): Promise<void> {
    try {
      const gasPrice = await this.getCurrentGasPrice();
      
      // Store in Redis for quick access
      await this.config.redis.set(
        'gas:current',
        JSON.stringify(gasPrice),
        'EX',
        60 // Expire after 1 minute
      );

      // Add to history
      this.gasPriceHistory.push({
        timestamp: new Date(),
        base: gasPrice.base,
        priority: gasPrice.priority,
      });

      // Keep only last 48 hours of history
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
      this.gasPriceHistory = this.gasPriceHistory.filter(
        entry => entry.timestamp > cutoff
      );
    } catch (error) {
      this.logger.error('Failed to update gas price', { error });
    }
  }

  private async updateTransactionMetrics(): Promise<void> {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const recentTxs = await this.config.prisma.transaction.count({
      where: {
        timestamp: { gte: fiveMinutesAgo },
      },
    });

    const throughput = recentTxs / 300; // TPS over last 5 minutes

    await this.config.redis.set(
      'metrics:throughput',
      throughput.toString(),
      'EX',
      300
    );
  }

  private async updateUserMetrics(): Promise<void> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const activeUsers = await this.config.prisma.transaction.findMany({
      where: {
        timestamp: { gte: yesterday },
      },
      distinct: ['userId'],
      select: { userId: true },
    });

    await this.config.redis.set(
      'metrics:activeUsers24h',
      activeUsers.length.toString(),
      'EX',
      3600
    );
  }

  private async getCurrentGasPrice(): Promise<{ base: string; priority: string; total: string }> {
    const feeData = await this.config.provider.getFeeData();
    
    const base = feeData.gasPrice?.toString() || '0';
    const priority = feeData.maxPriorityFeePerGas?.toString() || '0';
    const total = (BigInt(base) + BigInt(priority)).toString();

    return { base, priority, total };
  }

  private async predictGasPrice(): Promise<{ next1h: string; next24h: string }> {
    // Simple prediction based on historical data
    // In production, this would use more sophisticated models
    
    if (this.gasPriceHistory.length < 2) {
      const current = await this.getCurrentGasPrice();
      return {
        next1h: current.total,
        next24h: current.total,
      };
    }

    // Calculate average change over last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentPrices = this.gasPriceHistory
      .filter(entry => entry.timestamp > oneHourAgo)
      .map(entry => BigInt(entry.base) + BigInt(entry.priority));

    if (recentPrices.length === 0) {
      const current = await this.getCurrentGasPrice();
      return {
        next1h: current.total,
        next24h: current.total,
      };
    }

    const avgPrice = recentPrices.reduce((sum, price) => sum + price, 0n) / BigInt(recentPrices.length);
    
    // Simple linear projection
    const trend = recentPrices.length > 1
      ? (recentPrices[recentPrices.length - 1] - recentPrices[0]) / BigInt(recentPrices.length)
      : 0n;

    return {
      next1h: (avgPrice + trend).toString(),
      next24h: (avgPrice + trend * 24n).toString(),
    };
  }

  private calculateGasRecommendations(current: { base: string; priority: string; total: string }): {
    slow: string;
    standard: string;
    fast: string;
  } {
    const base = BigInt(current.base);
    const priority = BigInt(current.priority);

    return {
      slow: (base + priority * 50n / 100n).toString(), // 50% of priority
      standard: current.total,
      fast: (base + priority * 150n / 100n).toString(), // 150% of priority
    };
  }

  private async calculateVolume(where: any): Promise<{ total: string; byToken: Record<string, string> }> {
    const volumes = await this.config.prisma.transaction.groupBy({
      by: ['token'],
      where: { ...where, status: 'confirmed' },
      _sum: { value: true },
    });

    const byToken: Record<string, string> = {};
    let total = 0;

    for (const vol of volumes) {
      const value = parseFloat(vol._sum.value?.toString() || '0');
      byToken[vol.token] = value.toString();
      total += value;
    }

    return { total: total.toString(), byToken };
  }

  private async calculateGasStats(where: any): Promise<{
    totalUsed: string;
    totalCost: string;
    avgPrice: string;
    avgUsed: string;
  }> {
    const gasData = await this.config.prisma.transaction.aggregate({
      where: { ...where, status: 'confirmed' },
      _sum: {
        gasUsed: true,
        gasCost: true,
      },
      _avg: {
        gasPrice: true,
        gasUsed: true,
      },
    });

    return {
      totalUsed: gasData._sum.gasUsed?.toString() || '0',
      totalCost: gasData._sum.gasCost?.toString() || '0',
      avgPrice: gasData._avg.gasPrice?.toString() || '0',
      avgUsed: gasData._avg.gasUsed?.toString() || '0',
    };
  }

  private async calculateUserStats(where: any): Promise<{
    total: number;
    active24h: number;
    new24h: number;
  }> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [total, active24h, new24h] = await Promise.all([
      this.config.prisma.user.count(),
      this.config.prisma.transaction.findMany({
        where: {
          ...where,
          timestamp: { gte: yesterday },
        },
        distinct: ['userId'],
        select: { userId: true },
      }).then(users => users.length),
      this.config.prisma.user.count({
        where: {
          createdAt: { gte: yesterday },
        },
      }),
    ]);

    return { total, active24h, new24h };
  }

  private async calculatePerformanceMetrics(where: any): Promise<{
    avgConfirmationTime: number;
    successRate: number;
    throughput: number;
  }> {
    const [confirmed, total] = await Promise.all([
      this.config.prisma.transaction.count({
        where: { ...where, status: 'confirmed' },
      }),
      this.config.prisma.transaction.count({ where }),
    ]);

    // Get average confirmation time from Redis cache
    const avgConfTime = await this.config.redis.get('metrics:avgConfirmationTime');
    const throughput = await this.config.redis.get('metrics:throughput');

    return {
      avgConfirmationTime: parseFloat(avgConfTime || '30'), // Default 30 seconds
      successRate: total > 0 ? (confirmed / total) * 100 : 0,
      throughput: parseFloat(throughput || '0'),
    };
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
    const d = new Date(date);
    
    switch (interval) {
      case 'hour':
        d.setMinutes(0, 0, 0);
        return d.toISOString();
      case 'day':
        d.setHours(0, 0, 0, 0);
        return d.toISOString().split('T')[0];
      case 'week':
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d.toISOString().split('T')[0];
      case 'month':
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d.toISOString().substring(0, 7);
      default:
        return d.toISOString();
    }
  }

  private async getTokenInfo(address: string): Promise<{ symbol: string; decimals: number }> {
    // This would typically fetch from a token registry or contract
    // For now, return mock data
    const knownTokens: Record<string, { symbol: string; decimals: number }> = {
      '0x0000000000000000000000000000000000000000': { symbol: 'ETH', decimals: 18 },
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
      '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
    };

    return knownTokens[address.toLowerCase()] || { symbol: 'UNKNOWN', decimals: 18 };
  }

  async shutdown(): Promise<void> {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    
    this.logger.info('Transaction stats service shutdown complete');
  }
}