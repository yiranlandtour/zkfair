import { EventEmitter } from 'events';
import { Logger } from 'winston';
import { Redis } from 'ioredis';
import { Job, Queue, Worker } from 'bullmq';
import { NotificationEvent, NotificationType, UserNotificationPreferences, NotificationChannel as INotificationChannel, DeliveryResult, NotificationMessage } from '../types/notification';
import { EmailChannel } from './channels/emailChannel';
import { SMSChannel } from './channels/smsChannel';
import { PushChannel } from './channels/pushChannel';
import { WebhookChannel } from './channels/webhookChannel';
import { InAppChannel } from './channels/inAppChannel';
import { TemplateEngine } from './templateEngine';
import { PreferenceManager } from './preferenceManager';
import { NotificationAnalytics } from './notificationAnalytics';
import { RateLimiter } from './rateLimiter';
import { logger } from '../utils/logger';

export interface NotificationConfig {
  redis: Redis;
  queues: {
    high: string;
    normal: string;
    low: string;
    digest: string;
  };
  channels: {
    email?: any;
    sms?: any;
    push?: any;
    webhook?: any;
    inApp?: any;
  };
  templates: {
    path: string;
  };
  rateLimit: {
    perUser: {
      window: number;
      max: number;
    };
    perChannel: Record<string, { window: number; max: number }>;
  };
  processing: {
    concurrency: number;
    batchSize: number;
    retryAttempts: number;
    retryDelay: number;
    timeout: number;
  };
}

export class NotificationService extends EventEmitter {
  private config: NotificationConfig;
  private logger: Logger;
  private queues: Map<string, Queue>;
  private workers: Map<string, Worker>;
  private channels: Map<string, INotificationChannel>;
  private templateEngine: TemplateEngine;
  private preferenceManager: PreferenceManager;
  private analytics: NotificationAnalytics;
  private rateLimiter: RateLimiter;

  constructor(config: NotificationConfig) {
    super();
    this.config = config;
    this.logger = logger.child({ service: 'NotificationService' });
    this.queues = new Map();
    this.workers = new Map();
    this.channels = new Map();
    
    this.templateEngine = new TemplateEngine(config.templates);
    this.preferenceManager = new PreferenceManager(config.redis);
    this.analytics = new NotificationAnalytics(config.redis);
    this.rateLimiter = new RateLimiter(config.redis, config.rateLimit);
    
    this.initialize();
  }

  private initialize(): void {
    // Initialize queues
    Object.entries(this.config.queues).forEach(([priority, queueName]) => {
      const queue = new Queue(queueName, {
        connection: this.config.redis,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: this.config.processing.retryAttempts,
          backoff: {
            type: 'exponential',
            delay: this.config.processing.retryDelay,
          },
        },
      });
      this.queues.set(priority, queue);

      // Create worker for each queue
      const worker = new Worker(
        queueName,
        async (job: Job) => this.processNotification(job),
        {
          connection: this.config.redis,
          concurrency: this.config.processing.concurrency,
        }
      );
      
      worker.on('completed', (job) => {
        this.logger.info('Notification delivered', { jobId: job.id, data: job.data });
        this.emit('notification:delivered', job.data);
      });
      
      worker.on('failed', (job, err) => {
        this.logger.error('Notification delivery failed', { jobId: job?.id, error: err.message });
        this.emit('notification:failed', { data: job?.data, error: err });
      });
      
      this.workers.set(priority, worker);
    });

    // Initialize channels
    this.initializeChannels();
  }

  private initializeChannels(): void {
    if (this.config.channels.email) {
      this.channels.set('email', new EmailChannel(this.config.channels.email));
    }
    if (this.config.channels.sms) {
      this.channels.set('sms', new SMSChannel(this.config.channels.sms));
    }
    if (this.config.channels.push) {
      this.channels.set('push', new PushChannel(this.config.channels.push));
    }
    if (this.config.channels.webhook) {
      this.channels.set('webhook', new WebhookChannel(this.config.channels.webhook));
    }
    if (this.config.channels.inApp) {
      this.channels.set('inApp', new InAppChannel(this.config.channels.inApp));
    }
  }

  async send(event: NotificationEvent): Promise<void> {
    try {
      // Validate event
      this.validateEvent(event);

      // Check if notification should be sent based on user preferences
      if (event.userId) {
        const preferences = await this.preferenceManager.get(event.userId);
        if (!this.shouldSendNotification(event, preferences)) {
          this.logger.info('Notification skipped due to user preferences', { event });
          return;
        }
      }

      // Check rate limits
      if (event.userId) {
        const allowed = await this.rateLimiter.checkLimit(event.userId, event.type);
        if (!allowed) {
          this.logger.warn('Notification rate limited', { event });
          this.emit('notification:rateLimited', event);
          return;
        }
      }

      // Determine channels and priority
      const channels = await this.selectChannels(event);
      const priority = this.getPriority(event);

      // Queue notifications for each channel
      for (const channel of channels) {
        const message = await this.prepareMessage(event, channel);
        await this.queueNotification(priority, {
          event,
          channel,
          message,
        });
      }

      // Track analytics
      await this.analytics.trackEvent(event, channels);
      
      this.emit('notification:queued', { event, channels });
    } catch (error) {
      this.logger.error('Failed to send notification', { event, error });
      this.emit('notification:error', { event, error });
      throw error;
    }
  }

  private validateEvent(event: NotificationEvent): void {
    if (!event.id || !event.type || !event.data) {
      throw new Error('Invalid notification event: missing required fields');
    }
    
    if (!Object.values(NotificationType).includes(event.type)) {
      throw new Error(`Invalid notification type: ${event.type}`);
    }
  }

  private shouldSendNotification(
    event: NotificationEvent,
    preferences: UserNotificationPreferences
  ): boolean {
    // Check if category is enabled
    const category = this.getCategory(event.type);
    if (preferences.categories && preferences.categories[category] === false) {
      return false;
    }

    // Check quiet hours
    if (preferences.quietHours?.enabled) {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      
      const [startHour, startMinute] = preferences.quietHours.start.split(':').map(Number);
      const [endHour, endMinute] = preferences.quietHours.end.split(':').map(Number);
      
      const startTime = startHour * 60 + startMinute;
      const endTime = endHour * 60 + endMinute;
      
      if (startTime <= endTime) {
        // Normal case: quiet hours don't cross midnight
        if (currentTime >= startTime && currentTime < endTime) {
          return false;
        }
      } else {
        // Quiet hours cross midnight
        if (currentTime >= startTime || currentTime < endTime) {
          return false;
        }
      }
    }

    return true;
  }

  private async selectChannels(event: NotificationEvent): Promise<string[]> {
    const channels: string[] = [];
    
    if (event.userId) {
      const preferences = await this.preferenceManager.get(event.userId);
      
      // Check each channel preference
      Object.entries(preferences.channels || {}).forEach(([channel, pref]) => {
        if (pref.enabled && pref.verified) {
          // Check if this notification type should be sent on this channel
          const isInstant = pref.preferences?.instant?.includes(event.type);
          const isDigest = pref.preferences?.digest?.includes(event.type);
          const isDisabled = pref.preferences?.disabled?.includes(event.type);
          
          if (!isDisabled && (isInstant || isDigest)) {
            channels.push(channel);
          }
        }
      });
    } else {
      // System-wide notifications - use default channels
      if (event.data.channels) {
        channels.push(...event.data.channels);
      } else {
        // Default to in-app notifications for system messages
        channels.push('inApp');
      }
    }
    
    return channels;
  }

  private getPriority(event: NotificationEvent): string {
    // Critical notifications
    if (event.severity === 'critical' || 
        event.type === NotificationType.SECURITY_ALERT ||
        event.type === NotificationType.TRANSACTION_FAILED) {
      return 'high';
    }
    
    // Marketing and educational
    if (event.type === NotificationType.PROMOTIONAL ||
        event.type === NotificationType.EDUCATIONAL ||
        event.type === NotificationType.COMMUNITY) {
      return 'low';
    }
    
    // Everything else is normal priority
    return 'normal';
  }

  private getCategory(type: NotificationType): string {
    const categoryMap: Record<NotificationType, string> = {
      [NotificationType.TRANSACTION_SENT]: 'transactions',
      [NotificationType.TRANSACTION_CONFIRMED]: 'transactions',
      [NotificationType.TRANSACTION_FAILED]: 'transactions',
      [NotificationType.GAS_PRICE_ALERT]: 'transactions',
      
      [NotificationType.LOGIN_ALERT]: 'security',
      [NotificationType.SECURITY_ALERT]: 'security',
      [NotificationType.BALANCE_UPDATE]: 'transactions',
      [NotificationType.WALLET_RECOVERY]: 'security',
      
      [NotificationType.NEW_PROPOSAL]: 'governance',
      [NotificationType.VOTING_REMINDER]: 'governance',
      [NotificationType.PROPOSAL_OUTCOME]: 'governance',
      [NotificationType.PROPOSAL_EXECUTION]: 'governance',
      
      [NotificationType.MAINTENANCE_NOTICE]: 'system',
      [NotificationType.FEATURE_UPDATE]: 'system',
      [NotificationType.SECURITY_UPDATE]: 'system',
      [NotificationType.NETWORK_STATUS]: 'system',
      
      [NotificationType.PROMOTIONAL]: 'marketing',
      [NotificationType.EDUCATIONAL]: 'marketing',
      [NotificationType.COMMUNITY]: 'marketing',
    };
    
    return categoryMap[type] || 'system';
  }

  private async prepareMessage(
    event: NotificationEvent,
    channel: string
  ): Promise<NotificationMessage> {
    // Get user preferences for language
    let language = 'en';
    if (event.userId) {
      const preferences = await this.preferenceManager.get(event.userId);
      language = preferences.language || 'en';
    }
    
    // Render template
    const template = await this.templateEngine.render(
      event.type,
      channel,
      event.data,
      language
    );
    
    return {
      ...template,
      eventId: event.id,
      userId: event.userId,
      metadata: event.metadata,
    };
  }

  private async queueNotification(
    priority: string,
    data: any
  ): Promise<void> {
    const queue = this.queues.get(priority);
    if (!queue) {
      throw new Error(`Queue not found for priority: ${priority}`);
    }
    
    await queue.add('notification', data, {
      priority: priority === 'high' ? 1 : priority === 'low' ? 3 : 2,
    });
  }

  private async processNotification(job: Job): Promise<DeliveryResult> {
    const { event, channel, message } = job.data;
    
    const channelHandler = this.channels.get(channel);
    if (!channelHandler) {
      throw new Error(`Channel handler not found: ${channel}`);
    }
    
    try {
      const result = await channelHandler.send(message);
      
      // Log delivery
      await this.analytics.trackDelivery(
        event.id,
        channel,
        result.success,
        result.messageId
      );
      
      return result;
    } catch (error) {
      // Log failure
      await this.analytics.trackDelivery(
        event.id,
        channel,
        false,
        null,
        error.message
      );
      
      throw error;
    }
  }

  async getQueueStatus(): Promise<Record<string, any>> {
    const status: Record<string, any> = {};
    
    for (const [priority, queue] of this.queues) {
      const counts = await queue.getJobCounts();
      status[priority] = counts;
    }
    
    return status;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down notification service');
    
    // Close workers
    for (const worker of this.workers.values()) {
      await worker.close();
    }
    
    // Close queues
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    
    this.logger.info('Notification service shutdown complete');
  }
}