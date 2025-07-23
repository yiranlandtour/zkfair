import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { NotificationChannel, NotificationMessage, DeliveryResult } from '../../types/notification';
import { logger } from '../../utils/logger';

export interface WebhookChannelConfig {
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  userAgent?: string;
  signatureHeader?: string;
  signatureSecret?: string;
  sandbox?: boolean;
}

interface WebhookPayload {
  id: string;
  type: string;
  timestamp: number;
  data: any;
  metadata?: any;
}

export class WebhookChannel implements NotificationChannel {
  private config: WebhookChannelConfig;
  private axios: AxiosInstance;
  private logger = logger.child({ channel: 'webhook' });

  constructor(config: WebhookChannelConfig) {
    this.config = config;
    
    this.axios = axios.create({
      timeout: config.timeout || 30000,
      headers: {
        'User-Agent': config.userAgent || 'ZKFair-Webhook/1.0',
        'Content-Type': 'application/json',
      },
    });
    
    // Add request/response interceptors for logging
    this.axios.interceptors.request.use(
      (config) => {
        this.logger.debug('Webhook request', {
          url: config.url,
          method: config.method,
          headers: config.headers,
        });
        return config;
      },
      (error) => {
        this.logger.error('Webhook request error', { error: error.message });
        return Promise.reject(error);
      }
    );
    
    this.axios.interceptors.response.use(
      (response) => {
        this.logger.debug('Webhook response', {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
        return response;
      },
      (error) => {
        this.logger.error('Webhook response error', {
          error: error.message,
          response: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    try {
      const webhookUrl = message.data?.webhookUrl || message.data?.url;
      if (!webhookUrl) {
        throw new Error('Webhook URL not specified');
      }
      
      // Validate URL
      if (!this.isValidUrl(webhookUrl)) {
        throw new Error('Invalid webhook URL');
      }
      
      // Prepare payload
      const payload: WebhookPayload = {
        id: message.eventId,
        type: message.data?.type || 'notification',
        timestamp: Date.now(),
        data: {
          subject: message.subject,
          body: message.body,
          ...message.data,
        },
        metadata: message.metadata,
      };
      
      if (this.config.sandbox) {
        // In sandbox mode, just log the webhook
        this.logger.info('Webhook sent (sandbox mode)', {
          url: webhookUrl,
          payload,
        });
        
        return {
          success: true,
          messageId: `sandbox-webhook-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          timestamp: Date.now(),
          details: { sandbox: true, url: webhookUrl }
        };
      }
      
      // Calculate signature if configured
      const headers: Record<string, string> = {};
      if (this.config.signatureSecret && this.config.signatureHeader) {
        const signature = this.calculateSignature(payload, this.config.signatureSecret);
        headers[this.config.signatureHeader] = signature;
      }
      
      // Add custom headers from message
      if (message.data?.headers) {
        Object.assign(headers, message.data.headers);
      }
      
      // Send webhook with retries
      const response = await this.sendWithRetry(
        webhookUrl,
        payload,
        headers,
        this.config.retryAttempts || 3
      );
      
      return {
        success: response.status >= 200 && response.status < 300,
        messageId: response.headers['x-request-id'] || `webhook-${Date.now()}`,
        timestamp: Date.now(),
        details: {
          status: response.status,
          statusText: response.statusText,
          responseTime: response.config.metadata?.responseTime,
        }
      };
    } catch (error) {
      this.logger.error('Failed to send webhook', {
        error: error.message,
        url: message.data?.webhookUrl,
      });
      
      return {
        success: false,
        timestamp: Date.now(),
        error: error.message,
        details: {
          response: error.response?.data,
          status: error.response?.status,
        }
      };
    }
  }

  private async sendWithRetry(
    url: string,
    payload: any,
    headers: Record<string, string>,
    retries: number
  ): Promise<any> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const startTime = Date.now();
        
        const response = await this.axios.post(url, payload, {
          headers,
          metadata: { attempt, startTime },
        });
        
        // Add response time to metadata
        response.config.metadata = {
          ...response.config.metadata,
          responseTime: Date.now() - startTime,
        };
        
        return response;
      } catch (error) {
        lastError = error;
        
        // Don't retry on client errors (4xx)
        if (error.response?.status >= 400 && error.response?.status < 500) {
          throw error;
        }
        
        // Wait before retrying
        if (attempt < retries) {
          const delay = this.config.retryDelay || 1000;
          const backoff = delay * Math.pow(2, attempt); // Exponential backoff
          
          this.logger.warn(`Webhook failed, retrying in ${backoff}ms`, {
            url,
            attempt: attempt + 1,
            error: error.message,
          });
          
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }
    
    throw lastError;
  }

  private calculateSignature(payload: any, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      // Only allow HTTP(S) protocols
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  async verify(url: string): Promise<boolean> {
    // Could implement webhook verification via:
    // - Test ping to the URL
    // - Challenge-response verification
    // - URL whitelist checking
    
    return this.isValidUrl(url);
  }
}