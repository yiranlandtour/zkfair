import { NotificationConfig } from '../services/notificationService';
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy: (times: number) => {
    return Math.min(times * 50, 2000);
  },
});

export const notificationConfig: NotificationConfig = {
  redis,
  queues: {
    high: 'notifications:high',
    normal: 'notifications:normal',
    low: 'notifications:low',
    digest: 'notifications:digest',
  },
  channels: {
    email: {
      provider: process.env.EMAIL_PROVIDER as 'sendgrid' | 'ses' | 'smtp' || 'sendgrid',
      apiKey: process.env.SENDGRID_API_KEY,
      from: {
        email: process.env.EMAIL_FROM_ADDRESS || 'noreply@zkfair.io',
        name: process.env.EMAIL_FROM_NAME || 'ZKFair',
      },
      replyTo: process.env.EMAIL_REPLY_TO,
      trackingSettings: {
        clickTracking: process.env.EMAIL_CLICK_TRACKING === 'true',
        openTracking: process.env.EMAIL_OPEN_TRACKING === 'true',
      },
      templates: {
        transactionSent: process.env.SENDGRID_TEMPLATE_TRANSACTION_SENT,
        transactionConfirmed: process.env.SENDGRID_TEMPLATE_TRANSACTION_CONFIRMED,
        transactionFailed: process.env.SENDGRID_TEMPLATE_TRANSACTION_FAILED,
        loginAlert: process.env.SENDGRID_TEMPLATE_LOGIN_ALERT,
        securityAlert: process.env.SENDGRID_TEMPLATE_SECURITY_ALERT,
        walletRecovery: process.env.SENDGRID_TEMPLATE_WALLET_RECOVERY,
        newProposal: process.env.SENDGRID_TEMPLATE_NEW_PROPOSAL,
        votingReminder: process.env.SENDGRID_TEMPLATE_VOTING_REMINDER,
      },
      sandbox: process.env.NODE_ENV === 'development' && process.env.EMAIL_SANDBOX === 'true',
    },
    sms: {
      provider: process.env.SMS_PROVIDER as 'twilio' | 'aws-sns' | 'messagebird' || 'twilio',
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.SMS_FROM_NUMBER || '+1234567890',
      statusCallbackUrl: process.env.SMS_STATUS_CALLBACK_URL,
      maxLength: 160,
      sandbox: process.env.NODE_ENV === 'development' && process.env.SMS_SANDBOX === 'true',
    },
    push: {
      firebase: process.env.FIREBASE_PROJECT_ID ? {
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      } : undefined,
      apns: process.env.APNS_KEY_ID ? {
        keyId: process.env.APNS_KEY_ID,
        teamId: process.env.APNS_TEAM_ID || '',
        privateKey: process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
        production: process.env.NODE_ENV === 'production',
      } : undefined,
      defaultSound: 'default',
      defaultIcon: process.env.PUSH_DEFAULT_ICON || '/icon-192x192.png',
      sandbox: process.env.NODE_ENV === 'development' && process.env.PUSH_SANDBOX === 'true',
    },
    webhook: {
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000,
      sandbox: process.env.NODE_ENV === 'development' && process.env.WEBHOOK_SANDBOX === 'true',
    },
    inApp: {
      maxStoragePerUser: 100,
      defaultExpiry: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  },
  templates: {
    path: process.env.TEMPLATE_PATH || './templates',
  },
  rateLimit: {
    perUser: {
      window: 60 * 60 * 1000, // 1 hour
      max: parseInt(process.env.NOTIFICATION_RATE_LIMIT_PER_USER || '100'),
    },
    perChannel: {
      email: { window: 60 * 60 * 1000, max: 50 },
      sms: { window: 60 * 60 * 1000, max: 20 },
      push: { window: 60 * 60 * 1000, max: 100 },
      webhook: { window: 60 * 60 * 1000, max: 200 },
      inApp: { window: 60 * 60 * 1000, max: 500 },
    },
  },
  processing: {
    concurrency: parseInt(process.env.NOTIFICATION_CONCURRENCY || '10'),
    batchSize: parseInt(process.env.NOTIFICATION_BATCH_SIZE || '100'),
    retryAttempts: parseInt(process.env.NOTIFICATION_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.NOTIFICATION_RETRY_DELAY || '1000'),
    timeout: parseInt(process.env.NOTIFICATION_TIMEOUT || '30000'),
  },
};