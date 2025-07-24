import * as admin from 'firebase-admin';
import { NotificationChannel, NotificationMessage, DeliveryResult } from '../../types/notification';
import { logger } from '../../utils/logger';

export interface PushChannelConfig {
  firebase?: {
    projectId: string;
    privateKey: string;
    clientEmail: string;
  };
  apns?: {
    keyId: string;
    teamId: string;
    privateKey: string;
    production: boolean;
  };
  defaultSound?: string;
  defaultIcon?: string;
  sandbox?: boolean;
}

interface DeviceInfo {
  userId: string;
  platform: 'ios' | 'android' | 'web';
  token: string;
  locale?: string;
  timezone?: string;
  appVersion?: string;
}

export class PushChannel implements NotificationChannel {
  private config: PushChannelConfig;
  private firebaseApp?: admin.app.App;
  private logger = logger.child({ channel: 'push' });

  constructor(config: PushChannelConfig) {
    this.config = config;
    
    if (config.firebase && !this.config.sandbox) {
      this.firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.firebase.projectId,
          privateKey: config.firebase.privateKey,
          clientEmail: config.firebase.clientEmail,
        }),
      });
    }
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    try {
      // Get device information
      const deviceToken = message.data?.deviceToken || message.data?.token;
      const platform = message.data?.platform || 'android';
      
      if (!deviceToken) {
        throw new Error('Device token not specified');
      }
      
      if (this.config.sandbox) {
        // In sandbox mode, just log the push notification
        this.logger.info('Push notification sent (sandbox mode)', {
          token: deviceToken.substring(0, 10) + '...',
          title: message.title || message.subject,
          body: message.body,
          platform
        });
        
        return {
          success: true,
          messageId: `sandbox-push-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          timestamp: Date.now(),
          details: { sandbox: true, platform }
        };
      }
      
      // Send via appropriate service
      if (platform === 'ios' && this.config.apns) {
        return await this.sendViaAPNs(deviceToken, message);
      } else {
        return await this.sendViaFCM(deviceToken, message, platform);
      }
    } catch (error) {
      this.logger.error('Failed to send push notification', {
        error: error.message,
        token: message.data?.deviceToken?.substring(0, 10) + '...'
      });
      
      return {
        success: false,
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  private async sendViaFCM(
    token: string,
    message: NotificationMessage,
    platform: string
  ): Promise<DeliveryResult> {
    if (!this.firebaseApp) {
      throw new Error('Firebase not configured');
    }
    
    const fcmMessage: admin.messaging.Message = {
      token,
      notification: {
        title: message.title || message.subject || 'ZKFair Notification',
        body: message.body,
      },
      data: {
        eventId: message.eventId,
        type: message.data?.type || '',
        ...message.data,
      },
      android: platform === 'android' ? {
        priority: 'high',
        notification: {
          sound: this.config.defaultSound || 'default',
          icon: this.config.defaultIcon || 'ic_notification',
          color: '#4F46E5',
          channelId: 'zkfair_notifications',
        },
      } : undefined,
      apns: platform === 'ios' ? {
        payload: {
          aps: {
            alert: {
              title: message.title || message.subject || 'ZKFair Notification',
              body: message.body,
            },
            sound: this.config.defaultSound || 'default',
            badge: message.data?.badge,
            contentAvailable: true,
          },
        },
      } : undefined,
      webpush: platform === 'web' ? {
        notification: {
          icon: this.config.defaultIcon || '/icon-192x192.png',
          badge: '/badge-72x72.png',
          vibrate: [200, 100, 200],
          requireInteraction: message.data?.requireInteraction || false,
          actions: message.data?.actions || [],
        },
        fcmOptions: {
          link: message.data?.link || '/',
        },
      } : undefined,
    };
    
    const response = await admin.messaging(this.firebaseApp).send(fcmMessage);
    
    return {
      success: true,
      messageId: response,
      timestamp: Date.now(),
      details: {
        platform,
        provider: 'fcm',
      }
    };
  }

  private async sendViaAPNs(
    token: string,
    message: NotificationMessage
  ): Promise<DeliveryResult> {
    const apn = await import('apn');
    
    if (!this.config.apns) {
      throw new Error('APNs configuration not provided');
    }
    
    const options = {
      token: {
        key: this.config.apns.privateKey,
        keyId: this.config.apns.keyId,
        teamId: this.config.apns.teamId,
      },
      production: this.config.apns.production,
    };
    
    const apnProvider = new apn.Provider(options);
    const notification = new apn.Notification();
    
    notification.alert = {
      title: message.title || message.subject || 'ZKFair Notification',
      body: message.body,
    };
    notification.badge = message.data?.badge;
    notification.sound = this.config.defaultSound || 'default';
    notification.contentAvailable = true;
    notification.payload = {
      eventId: message.eventId,
      type: message.data?.type || '',
      ...message.data,
    };
    notification.topic = process.env.IOS_BUNDLE_ID || 'com.zkfair.app';
    notification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    notification.priority = 10; // High priority
    
    try {
      const result = await apnProvider.send(notification, token);
      await apnProvider.shutdown();
      
      if (result.failed.length > 0) {
        const failure = result.failed[0];
        throw new Error(`APNs error: ${failure.status} - ${failure.response?.reason}`);
      }
      
      return {
        success: true,
        messageId: result.sent[0].device,
        timestamp: Date.now(),
        details: {
          provider: 'apns',
          sent: result.sent.length,
        }
      };
    } finally {
      apnProvider.shutdown();
    }
  }

  async verify(token: string): Promise<boolean> {
    // Basic token format validation
    if (!token || token.length < 20) {
      return false;
    }
    
    // Could implement token verification via:
    // - FCM dry run
    // - APNs feedback service
    // - Device registration verification
    
    return true;
  }

  // Helper method to get device info from database
  private async getDeviceInfo(userId: string): Promise<DeviceInfo | null> {
    // This would fetch device information from the database
    // For now, returning null
    return null;
  }

  // Helper method to handle multiple devices per user
  async sendToUserDevices(
    userId: string,
    message: NotificationMessage
  ): Promise<DeliveryResult[]> {
    // This would:
    // 1. Fetch all registered devices for the user
    // 2. Send to each device
    // 3. Handle failures and token updates
    // 4. Return results for all devices
    
    return [];
  }
}