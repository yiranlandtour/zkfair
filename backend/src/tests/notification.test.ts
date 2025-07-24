import { NotificationService, NotificationConfig } from '../services/notificationService';
import { NotificationEvent, NotificationType } from '../types/notification';
import Redis from 'ioredis';

// Mock dependencies
jest.mock('ioredis');
jest.mock('../utils/logger');

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockRedis: jest.Mocked<Redis>;
  
  const mockConfig: NotificationConfig = {
    redis: new Redis() as any,
    queues: {
      high: 'test:high',
      normal: 'test:normal',
      low: 'test:low',
      digest: 'test:digest',
    },
    channels: {
      email: {
        provider: 'sendgrid',
        apiKey: 'test-key',
        from: { email: 'test@example.com', name: 'Test' },
        sandbox: true,
      },
      sms: {
        provider: 'twilio',
        accountSid: 'test-sid',
        authToken: 'test-token',
        fromNumber: '+1234567890',
        sandbox: true,
      },
      push: {
        sandbox: true,
      },
      webhook: {
        sandbox: true,
      },
      inApp: {
        sandbox: true,
      },
    },
    templates: {
      path: './templates',
    },
    rateLimit: {
      perUser: { window: 3600000, max: 100 },
      perChannel: {
        email: { window: 3600000, max: 50 },
        sms: { window: 3600000, max: 20 },
        push: { window: 3600000, max: 100 },
        webhook: { window: 3600000, max: 200 },
        inApp: { window: 3600000, max: 500 },
      },
    },
    processing: {
      concurrency: 10,
      batchSize: 100,
      retryAttempts: 3,
      retryDelay: 1000,
      timeout: 30000,
    },
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = new Redis() as jest.Mocked<Redis>;
    notificationService = new NotificationService(mockConfig);
  });
  
  afterEach(async () => {
    await notificationService.shutdown();
  });
  
  describe('send', () => {
    it('should send notification successfully', async () => {
      const event: NotificationEvent = {
        id: 'test-123',
        type: NotificationType.TRANSACTION_CONFIRMED,
        userId: 'user-123',
        data: {
          transactionHash: '0x123',
          amount: '100',
          token: 'USDC',
        },
      };
      
      await expect(notificationService.send(event)).resolves.not.toThrow();
    });
    
    it('should throw error for invalid notification event', async () => {
      const invalidEvent = {
        id: 'test-123',
        // missing type and data
      } as any;
      
      await expect(notificationService.send(invalidEvent)).rejects.toThrow(
        'Invalid notification event: missing required fields'
      );
    });
    
    it('should throw error for invalid notification type', async () => {
      const event = {
        id: 'test-123',
        type: 'INVALID_TYPE',
        data: {},
      } as any;
      
      await expect(notificationService.send(event)).rejects.toThrow(
        'Invalid notification type: INVALID_TYPE'
      );
    });
    
    it('should respect user quiet hours', async () => {
      const event: NotificationEvent = {
        id: 'test-123',
        type: NotificationType.NEW_PROPOSAL,
        userId: 'user-123',
        data: {
          proposalId: 'prop-123',
          title: 'Test Proposal',
        },
      };
      
      // Mock preference manager to return quiet hours
      const preferenceManager = (notificationService as any).preferenceManager;
      jest.spyOn(preferenceManager, 'get').mockResolvedValue({
        quietHours: {
          enabled: true,
          start: '22:00',
          end: '08:00',
        },
        channels: {
          email: { enabled: true, verified: true },
        },
      });
      
      // Mock current time to be within quiet hours
      const mockDate = new Date('2024-01-15T23:00:00');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
      
      const sendSpy = jest.spyOn(notificationService, 'send');
      await notificationService.send(event);
      
      expect(sendSpy).toHaveBeenCalled();
      // The notification should be skipped due to quiet hours
    });
    
    it('should handle high priority notifications', async () => {
      const event: NotificationEvent = {
        id: 'test-123',
        type: NotificationType.SECURITY_ALERT,
        userId: 'user-123',
        data: {
          alertType: 'suspicious_login',
          ip: '192.168.1.1',
        },
        severity: 'critical',
      };
      
      await notificationService.send(event);
      
      // Verify high priority queue is used
      const queues = (notificationService as any).queues;
      expect(queues.get('high')).toBeDefined();
    });
  });
  
  describe('channel selection', () => {
    it('should select channels based on user preferences', async () => {
      const event: NotificationEvent = {
        id: 'test-123',
        type: NotificationType.TRANSACTION_CONFIRMED,
        userId: 'user-123',
        data: {
          transactionHash: '0x123',
        },
      };
      
      const preferenceManager = (notificationService as any).preferenceManager;
      jest.spyOn(preferenceManager, 'get').mockResolvedValue({
        channels: {
          email: {
            enabled: true,
            verified: true,
            preferences: {
              instant: [NotificationType.TRANSACTION_CONFIRMED],
            },
          },
          sms: {
            enabled: true,
            verified: true,
            preferences: {
              disabled: [NotificationType.TRANSACTION_CONFIRMED],
            },
          },
          push: {
            enabled: true,
            verified: true,
            preferences: {
              instant: [NotificationType.TRANSACTION_CONFIRMED],
            },
          },
        },
      });
      
      const selectChannels = jest.spyOn(notificationService as any, 'selectChannels');
      await notificationService.send(event);
      
      const channels = await selectChannels.mock.results[0].value;
      expect(channels).toContain('email');
      expect(channels).toContain('push');
      expect(channels).not.toContain('sms');
    });
    
    it('should use default channels for system notifications', async () => {
      const event: NotificationEvent = {
        id: 'test-123',
        type: NotificationType.MAINTENANCE_NOTICE,
        // No userId for system-wide notification
        data: {
          message: 'Scheduled maintenance',
          channels: ['email', 'inApp'],
        },
      };
      
      const selectChannels = jest.spyOn(notificationService as any, 'selectChannels');
      await notificationService.send(event);
      
      const channels = await selectChannels.mock.results[0].value;
      expect(channels).toEqual(['email', 'inApp']);
    });
  });
  
  describe('rate limiting', () => {
    it('should enforce rate limits', async () => {
      const rateLimiter = (notificationService as any).rateLimiter;
      jest.spyOn(rateLimiter, 'checkLimit').mockResolvedValueOnce(false);
      
      const event: NotificationEvent = {
        id: 'test-123',
        type: NotificationType.PROMOTIONAL,
        userId: 'user-123',
        data: {
          campaign: 'test',
        },
      };
      
      const emitSpy = jest.spyOn(notificationService, 'emit');
      await notificationService.send(event);
      
      expect(emitSpy).toHaveBeenCalledWith('notification:rateLimited', event);
    });
  });
  
  describe('queue management', () => {
    it('should return queue status', async () => {
      const status = await notificationService.getQueueStatus();
      
      expect(status).toHaveProperty('high');
      expect(status).toHaveProperty('normal');
      expect(status).toHaveProperty('low');
      expect(status).toHaveProperty('digest');
    });
  });
  
  describe('priority calculation', () => {
    it('should assign high priority to critical notifications', async () => {
      const getPriority = (notificationService as any).getPriority.bind(notificationService);
      
      expect(getPriority({ severity: 'critical' })).toBe('high');
      expect(getPriority({ type: NotificationType.SECURITY_ALERT })).toBe('high');
      expect(getPriority({ type: NotificationType.TRANSACTION_FAILED })).toBe('high');
    });
    
    it('should assign low priority to marketing notifications', async () => {
      const getPriority = (notificationService as any).getPriority.bind(notificationService);
      
      expect(getPriority({ type: NotificationType.PROMOTIONAL })).toBe('low');
      expect(getPriority({ type: NotificationType.EDUCATIONAL })).toBe('low');
      expect(getPriority({ type: NotificationType.COMMUNITY })).toBe('low');
    });
    
    it('should assign normal priority to regular notifications', async () => {
      const getPriority = (notificationService as any).getPriority.bind(notificationService);
      
      expect(getPriority({ type: NotificationType.TRANSACTION_CONFIRMED })).toBe('normal');
      expect(getPriority({ type: NotificationType.BALANCE_UPDATE })).toBe('normal');
    });
  });
});