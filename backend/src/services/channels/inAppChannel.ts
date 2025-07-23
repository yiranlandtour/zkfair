import { EventEmitter } from 'events';
import { NotificationChannel, NotificationMessage, DeliveryResult } from '../../types/notification';
import { WebSocketServer } from '../../websocket/WebSocketServer';
import { logger } from '../../utils/logger';
import { prisma } from '../../utils/prisma';

export interface InAppChannelConfig {
  wsServer?: WebSocketServer;
  persistence?: boolean;
  maxNotificationsPerUser?: number;
  autoMarkAsRead?: boolean;
  sandbox?: boolean;
}

export class InAppChannel implements NotificationChannel {
  private config: InAppChannelConfig;
  private logger = logger.child({ channel: 'inApp' });
  private eventEmitter: EventEmitter;

  constructor(config: InAppChannelConfig) {
    this.config = config;
    this.eventEmitter = new EventEmitter();
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    try {
      const userId = message.userId;
      if (!userId) {
        throw new Error('User ID not specified for in-app notification');
      }
      
      // Create in-app notification object
      const notification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        userId,
        type: message.data?.type || 'general',
        title: message.title || message.subject || 'Notification',
        body: message.body,
        data: message.data,
        read: false,
        createdAt: new Date(),
        expiresAt: message.data?.expiresAt ? new Date(message.data.expiresAt) : null,
      };
      
      if (this.config.sandbox) {
        // In sandbox mode, just log the notification
        this.logger.info('In-app notification sent (sandbox mode)', {
          userId,
          title: notification.title,
          type: notification.type,
        });
        
        return {
          success: true,
          messageId: notification.id,
          timestamp: Date.now(),
          details: { sandbox: true }
        };
      }
      
      // Store in database if persistence is enabled
      if (this.config.persistence !== false) {
        await this.storeNotification(notification);
        
        // Clean up old notifications if needed
        await this.cleanupOldNotifications(userId);
      }
      
      // Send via WebSocket if available and user is connected
      if (this.config.wsServer) {
        const delivered = await this.sendViaWebSocket(userId, notification);
        
        return {
          success: true,
          messageId: notification.id,
          timestamp: Date.now(),
          details: {
            persisted: this.config.persistence !== false,
            delivered,
            method: delivered ? 'websocket' : 'stored',
          }
        };
      }
      
      // Emit event for other parts of the system
      this.eventEmitter.emit('notification', notification);
      
      return {
        success: true,
        messageId: notification.id,
        timestamp: Date.now(),
        details: {
          persisted: this.config.persistence !== false,
          delivered: false,
          method: 'stored',
        }
      };
    } catch (error) {
      this.logger.error('Failed to send in-app notification', {
        error: error.message,
        userId: message.userId,
      });
      
      return {
        success: false,
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  private async storeNotification(notification: any): Promise<void> {
    await prisma.notification.create({
      data: {
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        read: notification.read,
        expiresAt: notification.expiresAt,
      },
    });
  }

  private async cleanupOldNotifications(userId: string): Promise<void> {
    const maxNotifications = this.config.maxNotificationsPerUser || 100;
    
    // Get count of notifications for user
    const count = await prisma.notification.count({
      where: { userId },
    });
    
    if (count > maxNotifications) {
      // Delete oldest notifications
      const toDelete = count - maxNotifications;
      
      const oldestNotifications = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        take: toDelete,
        select: { id: true },
      });
      
      await prisma.notification.deleteMany({
        where: {
          id: { in: oldestNotifications.map(n => n.id) },
        },
      });
      
      this.logger.debug('Cleaned up old notifications', {
        userId,
        deleted: toDelete,
      });
    }
    
    // Also delete expired notifications
    await prisma.notification.deleteMany({
      where: {
        userId,
        expiresAt: { lt: new Date() },
      },
    });
  }

  private async sendViaWebSocket(
    userId: string,
    notification: any
  ): Promise<boolean> {
    if (!this.config.wsServer) {
      return false;
    }
    
    try {
      // Send notification through WebSocket
      const sent = await this.config.wsServer.sendToUser(userId, {
        type: 'notification',
        data: notification,
      });
      
      if (sent && this.config.autoMarkAsRead) {
        // Auto-mark as read if configured
        await this.markAsRead(notification.id, userId);
      }
      
      return sent;
    } catch (error) {
      this.logger.error('Failed to send via WebSocket', {
        error: error.message,
        userId,
        notificationId: notification.id,
      });
      return false;
    }
  }

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      const result = await prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId,
        },
        data: {
          read: true,
          readAt: new Date(),
        },
      });
      
      return result.count > 0;
    } catch (error) {
      this.logger.error('Failed to mark notification as read', {
        error: error.message,
        notificationId,
        userId,
      });
      return false;
    }
  }

  async markAllAsRead(userId: string): Promise<number> {
    try {
      const result = await prisma.notification.updateMany({
        where: {
          userId,
          read: false,
        },
        data: {
          read: true,
          readAt: new Date(),
        },
      });
      
      return result.count;
    } catch (error) {
      this.logger.error('Failed to mark all notifications as read', {
        error: error.message,
        userId,
      });
      return 0;
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    try {
      return await prisma.notification.count({
        where: {
          userId,
          read: false,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      });
    } catch (error) {
      this.logger.error('Failed to get unread count', {
        error: error.message,
        userId,
      });
      return 0;
    }
  }

  async getNotifications(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      type?: string;
    }
  ): Promise<any[]> {
    try {
      const where: any = {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      };
      
      if (options?.unreadOnly) {
        where.read = false;
      }
      
      if (options?.type) {
        where.type = options.type;
      }
      
      return await prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      });
    } catch (error) {
      this.logger.error('Failed to get notifications', {
        error: error.message,
        userId,
        options,
      });
      return [];
    }
  }

  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
      const result = await prisma.notification.deleteMany({
        where: {
          id: notificationId,
          userId,
        },
      });
      
      return result.count > 0;
    } catch (error) {
      this.logger.error('Failed to delete notification', {
        error: error.message,
        notificationId,
        userId,
      });
      return false;
    }
  }

  // Subscribe to real-time notifications
  subscribe(userId: string, callback: (notification: any) => void): () => void {
    const handler = (notification: any) => {
      if (notification.userId === userId) {
        callback(notification);
      }
    };
    
    this.eventEmitter.on('notification', handler);
    
    // Return unsubscribe function
    return () => {
      this.eventEmitter.off('notification', handler);
    };
  }

  async verify(userId: string): Promise<boolean> {
    // Verify that the user exists
    // This is always true for in-app notifications
    // since they're tied to user accounts
    return true;
  }
}