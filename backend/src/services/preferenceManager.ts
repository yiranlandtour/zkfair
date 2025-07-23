import { Redis } from 'ioredis';
import { UserNotificationPreferences, ChannelPreference, NotificationType } from '../types/notification';
import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';

export class PreferenceManager {
  private redis: Redis;
  private logger = logger.child({ service: 'PreferenceManager' });
  private defaultPreferences: Partial<UserNotificationPreferences> = {
    channels: {
      email: {
        enabled: true,
        verified: false,
        preferences: {
          instant: [
            NotificationType.TRANSACTION_CONFIRMED,
            NotificationType.TRANSACTION_FAILED,
            NotificationType.SECURITY_ALERT,
            NotificationType.LOGIN_ALERT,
          ],
          digest: [
            NotificationType.GOVERNANCE_UPDATE,
            NotificationType.FEATURE_UPDATE,
          ],
          disabled: [
            NotificationType.PROMOTIONAL,
          ],
        },
      },
      sms: {
        enabled: false,
        verified: false,
        preferences: {
          instant: [
            NotificationType.SECURITY_ALERT,
            NotificationType.TRANSACTION_FAILED,
          ],
          digest: [],
          disabled: [],
        },
      },
      push: {
        enabled: true,
        verified: false,
        preferences: {
          instant: [
            NotificationType.TRANSACTION_CONFIRMED,
            NotificationType.TRANSACTION_FAILED,
            NotificationType.SECURITY_ALERT,
            NotificationType.BALANCE_UPDATE,
          ],
          digest: [],
          disabled: [],
        },
      },
      inApp: {
        enabled: true,
        verified: true,
        preferences: {
          instant: Object.values(NotificationType),
          digest: [],
          disabled: [],
        },
      },
    },
    categories: {
      transactions: true,
      security: true,
      governance: true,
      marketing: false,
      system: true,
    },
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00',
      timezone: 'UTC',
    },
    language: 'en',
  };

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async get(userId: string): Promise<UserNotificationPreferences> {
    try {
      // Try to get from cache first
      const cached = await this.redis.get(`notif:prefs:${userId}`);
      if (cached) {
        return JSON.parse(cached);
      }
      
      // Get from database
      const prefs = await prisma.userNotificationPreference.findUnique({
        where: { userId },
      });
      
      if (!prefs) {
        // Return default preferences
        const defaultPrefs: UserNotificationPreferences = {
          userId,
          ...this.defaultPreferences,
        } as UserNotificationPreferences;
        
        // Cache for future use
        await this.redis.setex(
          `notif:prefs:${userId}`,
          3600, // 1 hour cache
          JSON.stringify(defaultPrefs)
        );
        
        return defaultPrefs;
      }
      
      // Merge with defaults to ensure all fields are present
      const merged = this.mergeWithDefaults(prefs);
      
      // Cache the result
      await this.redis.setex(
        `notif:prefs:${userId}`,
        3600,
        JSON.stringify(merged)
      );
      
      return merged;
    } catch (error) {
      this.logger.error('Failed to get user preferences', {
        error: error.message,
        userId,
      });
      
      // Return defaults on error
      return {
        userId,
        ...this.defaultPreferences,
      } as UserNotificationPreferences;
    }
  }

  async set(
    userId: string,
    preferences: Partial<UserNotificationPreferences>
  ): Promise<UserNotificationPreferences> {
    try {
      // Merge with existing preferences
      const existing = await this.get(userId);
      const updated = {
        ...existing,
        ...preferences,
        userId, // Ensure userId is not overwritten
      };
      
      // Validate preferences
      this.validatePreferences(updated);
      
      // Save to database
      await prisma.userNotificationPreference.upsert({
        where: { userId },
        create: updated,
        update: {
          channels: updated.channels,
          categories: updated.categories,
          quietHours: updated.quietHours,
          language: updated.language,
        },
      });
      
      // Update cache
      await this.redis.setex(
        `notif:prefs:${userId}`,
        3600,
        JSON.stringify(updated)
      );
      
      // Invalidate any related caches
      await this.invalidateRelatedCaches(userId);
      
      this.logger.info('Updated user notification preferences', { userId });
      
      return updated;
    } catch (error) {
      this.logger.error('Failed to set user preferences', {
        error: error.message,
        userId,
      });
      throw error;
    }
  }

  async updateChannel(
    userId: string,
    channel: keyof UserNotificationPreferences['channels'],
    channelPrefs: Partial<ChannelPreference>
  ): Promise<UserNotificationPreferences> {
    const prefs = await this.get(userId);
    
    if (!prefs.channels[channel]) {
      prefs.channels[channel] = {} as ChannelPreference;
    }
    
    prefs.channels[channel] = {
      ...prefs.channels[channel],
      ...channelPrefs,
    };
    
    return this.set(userId, { channels: prefs.channels });
  }

  async verifyChannel(
    userId: string,
    channel: keyof UserNotificationPreferences['channels'],
    address: string
  ): Promise<void> {
    await this.updateChannel(userId, channel, {
      address,
      verified: true,
    });
  }

  async subscribe(
    userId: string,
    channel: keyof UserNotificationPreferences['channels'],
    notificationType: NotificationType
  ): Promise<void> {
    const prefs = await this.get(userId);
    const channelPref = prefs.channels[channel];
    
    if (!channelPref) return;
    
    // Remove from disabled if present
    channelPref.preferences.disabled = channelPref.preferences.disabled.filter(
      t => t !== notificationType
    );
    
    // Add to instant if not in digest
    if (!channelPref.preferences.digest.includes(notificationType)) {
      if (!channelPref.preferences.instant.includes(notificationType)) {
        channelPref.preferences.instant.push(notificationType);
      }
    }
    
    await this.updateChannel(userId, channel, channelPref);
  }

  async unsubscribe(
    userId: string,
    channel: keyof UserNotificationPreferences['channels'],
    notificationType: NotificationType
  ): Promise<void> {
    const prefs = await this.get(userId);
    const channelPref = prefs.channels[channel];
    
    if (!channelPref) return;
    
    // Remove from instant and digest
    channelPref.preferences.instant = channelPref.preferences.instant.filter(
      t => t !== notificationType
    );
    channelPref.preferences.digest = channelPref.preferences.digest.filter(
      t => t !== notificationType
    );
    
    // Add to disabled
    if (!channelPref.preferences.disabled.includes(notificationType)) {
      channelPref.preferences.disabled.push(notificationType);
    }
    
    await this.updateChannel(userId, channel, channelPref);
  }

  async unsubscribeAll(userId: string): Promise<void> {
    await this.set(userId, {
      categories: {
        transactions: false,
        security: false,
        governance: false,
        marketing: false,
        system: false,
      },
    });
  }

  private mergeWithDefaults(
    prefs: any
  ): UserNotificationPreferences {
    return {
      userId: prefs.userId,
      channels: {
        ...this.defaultPreferences.channels,
        ...prefs.channels,
      },
      categories: {
        ...this.defaultPreferences.categories,
        ...prefs.categories,
      },
      quietHours: prefs.quietHours || this.defaultPreferences.quietHours,
      language: prefs.language || this.defaultPreferences.language,
    };
  }

  private validatePreferences(prefs: UserNotificationPreferences): void {
    // Validate language
    const supportedLanguages = ['en', 'es', 'zh', 'ja', 'ko', 'fr', 'de'];
    if (!supportedLanguages.includes(prefs.language)) {
      throw new Error(`Unsupported language: ${prefs.language}`);
    }
    
    // Validate quiet hours format
    if (prefs.quietHours?.enabled) {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(prefs.quietHours.start) || 
          !timeRegex.test(prefs.quietHours.end)) {
        throw new Error('Invalid quiet hours format');
      }
    }
    
    // Validate channels
    Object.entries(prefs.channels).forEach(([channel, pref]) => {
      if (pref.enabled && pref.address) {
        // Basic validation based on channel type
        switch (channel) {
          case 'email':
            if (!pref.address.includes('@')) {
              throw new Error('Invalid email address');
            }
            break;
          case 'sms':
            if (!pref.address.startsWith('+')) {
              throw new Error('Phone number must include country code');
            }
            break;
        }
      }
    });
  }

  private async invalidateRelatedCaches(userId: string): Promise<void> {
    // Invalidate any caches that depend on user preferences
    const keys = [
      `notif:digest:${userId}`,
      `notif:channels:${userId}`,
    ];
    
    await this.redis.del(...keys);
  }

  async exportPreferences(userId: string): Promise<any> {
    const prefs = await this.get(userId);
    
    // Remove sensitive data
    const exported = {
      ...prefs,
      channels: Object.entries(prefs.channels).reduce((acc, [channel, pref]) => {
        acc[channel] = {
          ...pref,
          address: pref.address ? '***' : undefined,
        };
        return acc;
      }, {} as any),
    };
    
    return exported;
  }

  async importPreferences(
    userId: string,
    data: any
  ): Promise<UserNotificationPreferences> {
    // Validate imported data
    if (!data.categories || !data.channels) {
      throw new Error('Invalid preference data');
    }
    
    // Don't import addresses for security
    const channels = Object.entries(data.channels).reduce((acc, [channel, pref]: [string, any]) => {
      acc[channel] = {
        ...pref,
        address: undefined,
        verified: false,
      };
      return acc;
    }, {} as any);
    
    return this.set(userId, {
      categories: data.categories,
      channels,
      quietHours: data.quietHours,
      language: data.language,
    });
  }
}