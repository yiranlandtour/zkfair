import { MailService } from '@sendgrid/mail';
import { NotificationChannel, NotificationMessage, DeliveryResult } from '../../types/notification';
import { logger } from '../../utils/logger';

export interface EmailChannelConfig {
  provider: 'sendgrid' | 'ses' | 'smtp';
  apiKey?: string;
  from: {
    email: string;
    name: string;
  };
  replyTo?: string;
  trackingSettings?: {
    clickTracking?: boolean;
    openTracking?: boolean;
  };
  templates?: Record<string, string>; // template name -> sendgrid template id
  sandbox?: boolean;
}

export class EmailChannel implements NotificationChannel {
  private config: EmailChannelConfig;
  private sendgrid?: MailService;
  private logger = logger.child({ channel: 'email' });

  constructor(config: EmailChannelConfig) {
    this.config = config;
    
    if (config.provider === 'sendgrid' && config.apiKey) {
      this.sendgrid = new MailService();
      this.sendgrid.setApiKey(config.apiKey);
    }
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    try {
      const startTime = Date.now();
      
      if (this.config.sandbox) {
        // In sandbox mode, just log the email
        this.logger.info('Email sent (sandbox mode)', {
          to: message.data?.email,
          subject: message.subject,
          body: message.body.substring(0, 100) + '...'
        });
        
        return {
          success: true,
          messageId: `sandbox-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          timestamp: Date.now(),
          details: { sandbox: true }
        };
      }
      
      switch (this.config.provider) {
        case 'sendgrid':
          return await this.sendViaSendGrid(message);
        case 'ses':
          return await this.sendViaSES(message);
        case 'smtp':
          return await this.sendViaSMTP(message);
        default:
          throw new Error(`Unsupported email provider: ${this.config.provider}`);
      }
    } catch (error) {
      this.logger.error('Failed to send email', {
        error: error.message,
        to: message.data?.email,
        subject: message.subject
      });
      
      return {
        success: false,
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  private async sendViaSendGrid(message: NotificationMessage): Promise<DeliveryResult> {
    if (!this.sendgrid) {
      throw new Error('SendGrid not configured');
    }
    
    const to = message.data?.email || message.data?.to;
    if (!to) {
      throw new Error('Email recipient not specified');
    }
    
    const msg = {
      to,
      from: this.config.from,
      subject: message.subject || 'Notification from ZKFair',
      text: message.body,
      html: message.html || message.body,
      replyTo: this.config.replyTo,
      trackingSettings: {
        clickTracking: {
          enable: this.config.trackingSettings?.clickTracking ?? true,
        },
        openTracking: {
          enable: this.config.trackingSettings?.openTracking ?? true,
        },
      },
      attachments: message.attachments?.map(att => ({
        content: typeof att.content === 'string' ? att.content : att.content.toString('base64'),
        filename: att.filename,
        type: att.contentType,
        disposition: 'attachment',
      })),
      customArgs: {
        eventId: message.eventId,
        userId: message.userId || '',
      },
    };
    
    // Use template if available
    const templateId = message.data?.templateId || 
                      (message.data?.type && this.config.templates?.[message.data.type]);
    if (templateId) {
      (msg as any).templateId = templateId;
      (msg as any).dynamicTemplateData = message.data;
      delete (msg as any).subject;
      delete (msg as any).text;
      delete (msg as any).html;
    }
    
    const [response] = await this.sendgrid.send(msg);
    
    return {
      success: response.statusCode >= 200 && response.statusCode < 300,
      messageId: response.headers['x-message-id'] || `sg-${Date.now()}`,
      timestamp: Date.now(),
      details: {
        statusCode: response.statusCode,
        headers: response.headers,
      }
    };
  }

  private async sendViaSES(message: NotificationMessage): Promise<DeliveryResult> {
    const AWS = await import('aws-sdk');
    const ses = new AWS.SES({ region: process.env.AWS_REGION || 'us-east-1' });
    
    const to = message.data?.email || message.data?.to;
    if (!to) {
      throw new Error('Email recipient not specified');
    }
    
    const params = {
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: message.html || message.body,
          },
          Text: {
            Charset: 'UTF-8',
            Data: message.body,
          },
        },
        Subject: {
          Charset: 'UTF-8',
          Data: message.subject || 'Notification from ZKFair',
        },
      },
      Source: `${this.config.from.name} <${this.config.from.email}>`,
      ReplyToAddresses: this.config.replyTo ? [this.config.replyTo] : undefined,
      Tags: [
        { Name: 'eventId', Value: message.eventId },
        { Name: 'userId', Value: message.userId || 'system' },
      ],
    };
    
    const result = await ses.sendEmail(params).promise();
    
    return {
      success: true,
      messageId: result.MessageId,
      timestamp: Date.now(),
      details: {
        provider: 'ses',
        region: process.env.AWS_REGION || 'us-east-1',
      }
    };
  }

  private async sendViaSMTP(message: NotificationMessage): Promise<DeliveryResult> {
    const nodemailer = await import('nodemailer');
    
    const transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    
    const to = message.data?.email || message.data?.to;
    if (!to) {
      throw new Error('Email recipient not specified');
    }
    
    const mailOptions = {
      from: `${this.config.from.name} <${this.config.from.email}>`,
      to,
      subject: message.subject || 'Notification from ZKFair',
      text: message.body,
      html: message.html || message.body,
      replyTo: this.config.replyTo,
      attachments: message.attachments?.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      })),
      headers: {
        'X-Event-ID': message.eventId,
        'X-User-ID': message.userId || 'system',
      },
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    return {
      success: true,
      messageId: info.messageId,
      timestamp: Date.now(),
      details: {
        provider: 'smtp',
        response: info.response,
        accepted: info.accepted,
        rejected: info.rejected,
      }
    };
  }

  async verify(email: string): Promise<boolean> {
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return false;
    }
    
    // Could add more sophisticated verification here:
    // - DNS MX record check
    // - SMTP verification
    // - Email verification service integration
    
    return true;
  }
}