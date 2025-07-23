import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { NotificationType } from '../types/notification';
import { NotificationService } from '../services/notificationService';
import { PreferenceManager } from '../services/preferenceManager';
import { NotificationAnalytics } from '../services/notificationAnalytics';
import { InAppChannel } from '../services/channels/inAppChannel';
import { logger } from '../utils/logger';

export function createNotificationRoutes(
  notificationService: NotificationService,
  preferenceManager: PreferenceManager,
  analytics: NotificationAnalytics,
  inAppChannel: InAppChannel
): Router {
  const router = Router();

  // Get user notification preferences
  router.get(
    '/preferences',
    authenticate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        const preferences = await preferenceManager.get(userId);
        res.json(preferences);
      } catch (error) {
        next(error);
      }
    }
  );

  // Update user notification preferences
  router.put(
    '/preferences',
    authenticate,
    [
      body('channels').optional().isObject(),
      body('categories').optional().isObject(),
      body('quietHours').optional().isObject(),
      body('language').optional().isIn(['en', 'es', 'zh', 'ja', 'ko', 'fr', 'de']),
    ],
    validate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        const updated = await preferenceManager.set(userId, req.body);
        res.json(updated);
      } catch (error) {
        next(error);
      }
    }
  );

  // Update channel-specific preferences
  router.put(
    '/preferences/channels/:channel',
    authenticate,
    [
      param('channel').isIn(['email', 'sms', 'push', 'inApp', 'webhook']),
      body('enabled').optional().isBoolean(),
      body('address').optional().isString(),
      body('preferences').optional().isObject(),
    ],
    validate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        const channel = req.params.channel as any;
        const updated = await preferenceManager.updateChannel(userId, channel, req.body);
        res.json(updated);
      } catch (error) {
        next(error);
      }
    }
  );

  // Subscribe to specific notification type
  router.post(
    '/subscribe',
    authenticate,
    [
      body('channel').isIn(['email', 'sms', 'push', 'inApp', 'webhook']),
      body('type').isIn(Object.values(NotificationType)),
    ],
    validate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        await preferenceManager.subscribe(
          userId,
          req.body.channel,
          req.body.type
        );
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    }
  );

  // Unsubscribe from specific notification type
  router.post(
    '/unsubscribe',
    authenticate,
    [
      body('channel').isIn(['email', 'sms', 'push', 'inApp', 'webhook']),
      body('type').isIn(Object.values(NotificationType)),
    ],
    validate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        await preferenceManager.unsubscribe(
          userId,
          req.body.channel,
          req.body.type
        );
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    }
  );

  // Unsubscribe from all notifications
  router.post(
    '/unsubscribe-all',
    authenticate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        await preferenceManager.unsubscribeAll(userId);
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    }
  );

  // Get notification history
  router.get(
    '/history',
    authenticate,
    [
      query('limit').optional().isInt({ min: 1, max: 100 }),
      query('offset').optional().isInt({ min: 0 }),
      query('unreadOnly').optional().isBoolean(),
      query('type').optional().isString(),
    ],
    validate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        const notifications = await inAppChannel.getNotifications(userId, {
          limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
          offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
          unreadOnly: req.query.unreadOnly === 'true',
          type: req.query.type as string,
        });
        res.json(notifications);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get unread notification count
  router.get(
    '/unread-count',
    authenticate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        const count = await inAppChannel.getUnreadCount(userId);
        res.json({ count });
      } catch (error) {
        next(error);
      }
    }
  );

  // Mark notification as read
  router.post(
    '/:id/read',
    authenticate,
    [
      param('id').isString(),
    ],
    validate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        const success = await inAppChannel.markAsRead(req.params.id, userId);
        res.json({ success });
      } catch (error) {
        next(error);
      }
    }
  );

  // Mark all notifications as read
  router.post(
    '/read-all',
    authenticate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        const count = await inAppChannel.markAllAsRead(userId);
        res.json({ success: true, count });
      } catch (error) {
        next(error);
      }
    }
  );

  // Delete notification
  router.delete(
    '/:id',
    authenticate,
    [
      param('id').isString(),
    ],
    validate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        const success = await inAppChannel.deleteNotification(req.params.id, userId);
        res.json({ success });
      } catch (error) {
        next(error);
      }
    }
  );

  // Send test notification
  router.post(
    '/test',
    authenticate,
    [
      body('channel').isIn(['email', 'sms', 'push', 'inApp']),
      body('type').optional().isIn(Object.values(NotificationType)),
    ],
    validate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        const testEvent = {
          id: `test-${Date.now()}`,
          type: req.body.type || NotificationType.FEATURE_UPDATE,
          severity: 'info' as const,
          userId,
          data: {
            subject: 'Test Notification',
            message: 'This is a test notification from ZKFair L2',
            userName: req.user!.address,
            timestamp: new Date().toISOString(),
            channels: [req.body.channel],
          },
          metadata: {
            source: 'api',
            timestamp: Date.now(),
          },
        };
        
        await notificationService.send(testEvent);
        res.json({ 
          success: true,
          message: 'Test notification sent',
          eventId: testEvent.id,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // Get notification metrics (user-specific)
  router.get(
    '/metrics',
    authenticate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        const metrics = await analytics.getUserMetrics(userId);
        res.json(metrics);
      } catch (error) {
        next(error);
      }
    }
  );

  // Export preferences
  router.get(
    '/preferences/export',
    authenticate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        const exported = await preferenceManager.exportPreferences(userId);
        res.json(exported);
      } catch (error) {
        next(error);
      }
    }
  );

  // Import preferences
  router.post(
    '/preferences/import',
    authenticate,
    [
      body('data').isObject(),
    ],
    validate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        const imported = await preferenceManager.importPreferences(userId, req.body.data);
        res.json(imported);
      } catch (error) {
        next(error);
      }
    }
  );

  // Verify channel (e.g., email verification)
  router.post(
    '/verify/:channel',
    authenticate,
    [
      param('channel').isIn(['email', 'sms', 'push']),
      body('code').optional().isString(),
      body('address').isString(),
    ],
    validate,
    async (req, res, next) => {
      try {
        const userId = req.user!.id;
        const channel = req.params.channel as any;
        
        // In a real implementation, you would verify the code
        // For now, we'll just mark it as verified
        await preferenceManager.verifyChannel(userId, channel, req.body.address);
        
        res.json({ 
          success: true,
          message: `${channel} verified successfully`,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

// Admin routes for notification management
export function createNotificationAdminRoutes(
  notificationService: NotificationService,
  analytics: NotificationAnalytics
): Router {
  const router = Router();

  // Get system-wide notification metrics
  router.get(
    '/metrics',
    authenticate,
    async (req, res, next) => {
      try {
        // Check if user is admin
        if (req.user!.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }
        
        const period = req.query.period as 'today' | 'week' | 'month' | undefined;
        const metrics = await analytics.getMetrics(period);
        res.json(metrics);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get queue status
  router.get(
    '/queue-status',
    authenticate,
    async (req, res, next) => {
      try {
        if (req.user!.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }
        
        const status = await notificationService.getQueueStatus();
        res.json(status);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get recent activity
  router.get(
    '/recent-activity',
    authenticate,
    [
      query('limit').optional().isInt({ min: 1, max: 1000 }),
    ],
    validate,
    async (req, res, next) => {
      try {
        if (req.user!.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }
        
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
        const activity = await analytics.getRecentActivity(limit);
        res.json(activity);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get error statistics
  router.get(
    '/error-stats',
    authenticate,
    async (req, res, next) => {
      try {
        if (req.user!.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }
        
        const stats = await analytics.getErrorStats();
        res.json(stats);
      } catch (error) {
        next(error);
      }
    }
  );

  // Send broadcast notification
  router.post(
    '/broadcast',
    authenticate,
    [
      body('type').isIn(Object.values(NotificationType)),
      body('severity').isIn(['info', 'warning', 'error', 'critical']),
      body('channels').isArray(),
      body('channels.*').isIn(['email', 'sms', 'push', 'inApp']),
      body('data').isObject(),
      body('filters').optional().isObject(),
    ],
    validate,
    async (req, res, next) => {
      try {
        if (req.user!.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { type, severity, channels, data, filters } = req.body;
        
        // Create broadcast event
        const event = {
          id: `broadcast-${Date.now()}`,
          type,
          severity,
          data: {
            ...data,
            channels,
          },
          metadata: {
            source: 'admin-broadcast',
            timestamp: Date.now(),
            adminId: req.user!.id,
          },
        };
        
        // In a real implementation, you would:
        // 1. Apply filters to get target users
        // 2. Send to each user based on their preferences
        // For now, we'll just send as a system-wide notification
        
        await notificationService.send(event);
        
        res.json({
          success: true,
          message: 'Broadcast notification sent',
          eventId: event.id,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // Clean up old notification data
  router.post(
    '/cleanup',
    authenticate,
    [
      body('daysToKeep').optional().isInt({ min: 1, max: 365 }),
    ],
    validate,
    async (req, res, next) => {
      try {
        if (req.user!.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }
        
        const daysToKeep = req.body.daysToKeep || 30;
        await analytics.cleanup(daysToKeep);
        
        res.json({
          success: true,
          message: `Cleaned up notification data older than ${daysToKeep} days`,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}