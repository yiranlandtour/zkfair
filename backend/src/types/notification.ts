export enum NotificationType {
  // Transaction
  TRANSACTION_SENT = 'TRANSACTION_SENT',
  TRANSACTION_CONFIRMED = 'TRANSACTION_CONFIRMED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  GAS_PRICE_ALERT = 'GAS_PRICE_ALERT',
  
  // Account
  LOGIN_ALERT = 'LOGIN_ALERT',
  SECURITY_ALERT = 'SECURITY_ALERT',
  BALANCE_UPDATE = 'BALANCE_UPDATE',
  WALLET_RECOVERY = 'WALLET_RECOVERY',
  
  // Governance
  NEW_PROPOSAL = 'NEW_PROPOSAL',
  VOTING_REMINDER = 'VOTING_REMINDER',
  PROPOSAL_OUTCOME = 'PROPOSAL_OUTCOME',
  PROPOSAL_EXECUTION = 'PROPOSAL_EXECUTION',
  
  // System
  MAINTENANCE_NOTICE = 'MAINTENANCE_NOTICE',
  FEATURE_UPDATE = 'FEATURE_UPDATE',
  SECURITY_UPDATE = 'SECURITY_UPDATE',
  NETWORK_STATUS = 'NETWORK_STATUS',
  
  // Marketing
  PROMOTIONAL = 'PROMOTIONAL',
  EDUCATIONAL = 'EDUCATIONAL',
  COMMUNITY = 'COMMUNITY',
}

export interface NotificationEvent {
  id: string;
  type: NotificationType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  userId?: string;
  data: Record<string, any>;
  metadata: {
    source: string;
    timestamp: number;
    correlationId?: string;
    retryCount?: number;
  };
}

export interface UserNotificationPreferences {
  userId: string;
  channels: {
    email?: ChannelPreference;
    sms?: ChannelPreference;
    push?: ChannelPreference;
    inApp?: ChannelPreference;
    webhook?: ChannelPreference;
  };
  categories: {
    transactions: boolean;
    security: boolean;
    governance: boolean;
    marketing: boolean;
    system: boolean;
  };
  quietHours?: {
    enabled: boolean;
    start: string; // "22:00"
    end: string;   // "08:00"
    timezone: string;
  };
  language: string;
}

export interface ChannelPreference {
  enabled: boolean;
  address?: string; // email address, phone number, device token, etc.
  verified: boolean;
  preferences: {
    instant: string[]; // notification types for instant delivery
    digest: string[];  // notification types for digest
    disabled: string[]; // explicitly disabled types
  };
}

export interface NotificationMessage {
  eventId: string;
  userId?: string;
  channel: string;
  subject?: string;
  title?: string;
  body: string;
  html?: string;
  data?: Record<string, any>;
  metadata?: Record<string, any>;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface DeliveryResult {
  success: boolean;
  messageId?: string;
  timestamp: number;
  error?: string;
  details?: Record<string, any>;
}

export interface NotificationChannel {
  send(message: NotificationMessage): Promise<DeliveryResult>;
  verify?(address: string): Promise<boolean>;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  type: NotificationType;
  channel: string;
  subject?: Record<string, string>; // locale -> subject
  body: Record<string, { html?: string; text: string }>; // locale -> body
  metadata?: Record<string, any>;
  isActive: boolean;
}

export interface NotificationLog {
  id: string;
  userId?: string;
  type: NotificationType;
  channel: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced';
  messageId?: string;
  content?: any;
  metadata?: any;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  error?: string;
  createdAt: Date;
}

export interface NotificationMetrics {
  // Delivery metrics
  sent: number;
  delivered: number;
  failed: number;
  bounced: number;
  
  // Engagement metrics
  opened: number;
  clicked: number;
  unsubscribed: number;
  
  // Performance metrics
  avgDeliveryTime: number;
  queueDepth: number;
  processingRate: number;
  
  // Channel breakdown
  byChannel: Record<string, ChannelMetrics>;
  byType: Record<string, TypeMetrics>;
}

export interface ChannelMetrics {
  sent: number;
  delivered: number;
  failed: number;
  avgDeliveryTime: number;
}

export interface TypeMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
}