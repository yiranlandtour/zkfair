import { Redis } from 'ioredis';
import LRU from 'lru-cache';
import { createHash } from 'crypto';

interface CacheOptions {
  ttl?: number; // seconds
  namespace?: string;
  compress?: boolean;
}

export class CacheManager {
  private memoryCache: LRU<string, any>;
  private redisCache: Redis;
  private defaultTTL = 300; // 5 minutes
  
  constructor(redisUrl: string) {
    // L1 Cache: In-memory LRU
    this.memoryCache = new LRU({
      max: 1000,
      ttl: 60 * 1000, // 1 minute
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });
    
    // L2 Cache: Redis
    this.redisCache = new Redis(redisUrl);
  }
  
  private generateKey(key: string, namespace?: string): string {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    return createHash('sha256').update(fullKey).digest('hex').substring(0, 16);
  }
  
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const cacheKey = this.generateKey(key, options.namespace);
    
    // L1: Check memory cache
    const memResult = this.memoryCache.get(cacheKey);
    if (memResult !== undefined) {
      console.log(`Cache hit (memory): ${key}`);
      return memResult;
    }
    
    // L2: Check Redis cache
    try {
      const redisResult = await this.redisCache.get(cacheKey);
      if (redisResult) {
        console.log(`Cache hit (Redis): ${key}`);
        const parsed = JSON.parse(redisResult);
        
        // Populate L1 cache
        this.memoryCache.set(cacheKey, parsed);
        
        return parsed;
      }
    } catch (error) {
      console.error('Redis cache error:', error);
    }
    
    console.log(`Cache miss: ${key}`);
    return null;
  }
  
  async set<T>(
    key: string, 
    value: T, 
    options: CacheOptions = {}
  ): Promise<void> {
    const cacheKey = this.generateKey(key, options.namespace);
    const ttl = options.ttl || this.defaultTTL;
    
    // L1: Set in memory cache
    this.memoryCache.set(cacheKey, value);
    
    // L2: Set in Redis cache
    try {
      const serialized = JSON.stringify(value);
      await this.redisCache.set(cacheKey, serialized, 'EX', ttl);
    } catch (error) {
      console.error('Redis cache set error:', error);
    }
  }
  
  async invalidate(key: string, options: CacheOptions = {}): Promise<void> {
    const cacheKey = this.generateKey(key, options.namespace);
    
    // Clear from both caches
    this.memoryCache.delete(cacheKey);
    await this.redisCache.del(cacheKey);
  }
  
  async invalidatePattern(pattern: string, namespace?: string): Promise<void> {
    const fullPattern = namespace ? `${namespace}:${pattern}` : pattern;
    
    // Clear from memory cache (iterate through keys)
    for (const [key] of this.memoryCache.entries()) {
      if (key.includes(fullPattern)) {
        this.memoryCache.delete(key);
      }
    }
    
    // Clear from Redis using pattern matching
    const keys = await this.redisCache.keys(fullPattern);
    if (keys.length > 0) {
      await this.redisCache.del(...keys);
    }
  }
  
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }
    
    // Execute function and cache result
    const result = await fn();
    await this.set(key, result, options);
    
    return result;
  }
  
  // Decorator for caching class methods
  cache(options: CacheOptions = {}) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      const originalMethod = descriptor.value;
      
      descriptor.value = async function (...args: any[]) {
        const key = `${target.constructor.name}:${propertyKey}:${JSON.stringify(args)}`;
        
        return await this.wrap(
          key,
          () => originalMethod.apply(this, args),
          options
        );
      };
      
      return descriptor;
    };
  }
  
  // Cache warming
  async warm(keys: Array<{ key: string; fn: () => Promise<any>; options?: CacheOptions }>) {
    const promises = keys.map(({ key, fn, options }) => 
      this.wrap(key, fn, options)
    );
    
    await Promise.allSettled(promises);
  }
  
  // Cache statistics
  async getStats() {
    const memoryStats = {
      size: this.memoryCache.size,
      calculatedSize: this.memoryCache.calculatedSize,
    };
    
    const redisInfo = await this.redisCache.info('memory');
    const redisStats = {
      usedMemory: redisInfo.match(/used_memory_human:(.+)/)?.[1],
      connectedClients: await this.redisCache.client('list').then(list => list.split('\n').length - 1),
    };
    
    return {
      memory: memoryStats,
      redis: redisStats,
    };
  }
  
  async close() {
    this.memoryCache.clear();
    await this.redisCache.quit();
  }
}

// Usage example service
export class TransactionService {
  constructor(private cache: CacheManager) {}
  
  async getTransactionHistory(address: string, page: number = 1) {
    return this.cache.wrap(
      `tx:history:${address}:${page}`,
      async () => {
        // Expensive database query
        const transactions = await prisma.userOperation.findMany({
          where: { sender: address },
          skip: (page - 1) * 50,
          take: 50,
        });
        return transactions;
      },
      { ttl: 300, namespace: 'transactions' }
    );
  }
  
  async getUserStats(address: string) {
    return this.cache.wrap(
      `stats:${address}`,
      async () => {
        // Complex aggregation query
        const stats = await prisma.userOperation.aggregate({
          where: { sender: address },
          _count: true,
          _sum: { actualGasCost: true },
        });
        return stats;
      },
      { ttl: 600, namespace: 'user-stats' }
    );
  }
}