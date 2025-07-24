import twilio from 'twilio';
import { NotificationChannel, NotificationMessage, DeliveryResult } from '../../types/notification';
import { logger } from '../../utils/logger';

export interface SMSChannelConfig {
  provider: 'twilio' | 'aws-sns' | 'messagebird';
  accountSid?: string;
  authToken?: string;
  fromNumber: string;
  statusCallbackUrl?: string;
  maxLength?: number; // Maximum SMS length
  sandbox?: boolean;
}

export class SMSChannel implements NotificationChannel {
  private config: SMSChannelConfig;
  private twilioClient?: twilio.Twilio;
  private logger = logger.child({ channel: 'sms' });

  constructor(config: SMSChannelConfig) {
    this.config = config;
    
    if (config.provider === 'twilio' && config.accountSid && config.authToken) {
      this.twilioClient = twilio(config.accountSid, config.authToken);
    }
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    try {
      const phoneNumber = message.data?.phone || message.data?.phoneNumber || message.data?.to;
      if (!phoneNumber) {
        throw new Error('Phone number not specified');
      }
      
      // Validate phone number format
      if (!this.isValidPhoneNumber(phoneNumber)) {
        throw new Error('Invalid phone number format');
      }
      
      // Truncate message if too long
      const maxLength = this.config.maxLength || 160;
      let smsBody = message.body;
      if (smsBody.length > maxLength) {
        smsBody = smsBody.substring(0, maxLength - 3) + '...';
      }
      
      if (this.config.sandbox) {
        // In sandbox mode, just log the SMS
        this.logger.info('SMS sent (sandbox mode)', {
          to: phoneNumber,
          body: smsBody,
          length: smsBody.length
        });
        
        return {
          success: true,
          messageId: `sandbox-sms-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          timestamp: Date.now(),
          details: { sandbox: true, length: smsBody.length }
        };
      }
      
      switch (this.config.provider) {
        case 'twilio':
          return await this.sendViaTwilio(phoneNumber, smsBody, message);
        case 'aws-sns':
          return await this.sendViaSNS(phoneNumber, smsBody, message);
        case 'messagebird':
          return await this.sendViaMessageBird(phoneNumber, smsBody, message);
        default:
          throw new Error(`Unsupported SMS provider: ${this.config.provider}`);
      }
    } catch (error) {
      this.logger.error('Failed to send SMS', {
        error: error.message,
        to: message.data?.phone
      });
      
      return {
        success: false,
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  private async sendViaTwilio(
    to: string,
    body: string,
    message: NotificationMessage
  ): Promise<DeliveryResult> {
    if (!this.twilioClient) {
      throw new Error('Twilio client not configured');
    }
    
    const result = await this.twilioClient.messages.create({
      to,
      from: this.config.fromNumber,
      body,
      statusCallback: this.config.statusCallbackUrl,
      // Add custom parameters for tracking
      ...(message.eventId && { provideFeedback: true }),
    });
    
    return {
      success: result.status !== 'failed',
      messageId: result.sid,
      timestamp: Date.now(),
      details: {
        status: result.status,
        price: result.price,
        priceUnit: result.priceUnit,
        numSegments: result.numSegments,
        direction: result.direction,
      }
    };
  }

  private async sendViaSNS(
    phoneNumber: string,
    message: string,
    notification: NotificationMessage
  ): Promise<DeliveryResult> {
    const AWS = await import('aws-sdk');
    const sns = new AWS.SNS({ region: process.env.AWS_REGION || 'us-east-1' });
    
    const params = {
      Message: message,
      PhoneNumber: phoneNumber,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional', // or 'Promotional'
        },
        'AWS.SNS.SMS.SenderID': {
          DataType: 'String',
          StringValue: 'ZKFair',
        },
        'eventId': {
          DataType: 'String',
          StringValue: notification.eventId,
        },
        'userId': {
          DataType: 'String',
          StringValue: notification.userId || 'system',
        },
      },
    };
    
    const result = await sns.publish(params).promise();
    
    return {
      success: true,
      messageId: result.MessageId,
      timestamp: Date.now(),
      details: {
        provider: 'sns',
        region: process.env.AWS_REGION || 'us-east-1',
        sequenceNumber: result.SequenceNumber,
      }
    };
  }

  private async sendViaMessageBird(
    phoneNumber: string,
    message: string,
    notification: NotificationMessage
  ): Promise<DeliveryResult> {
    const messagebird = await import('messagebird');
    const client = messagebird.default(process.env.MESSAGEBIRD_API_KEY!);
    
    return new Promise((resolve, reject) => {
      client.messages.create(
        {
          originator: this.config.fromNumber,
          recipients: [phoneNumber],
          body: message,
          reference: notification.eventId,
          reportUrl: this.config.statusCallbackUrl,
        },
        (err: any, response: any) => {
          if (err) {
            reject(err);
            return;
          }
          
          resolve({
            success: true,
            messageId: response.id,
            timestamp: Date.now(),
            details: {
              provider: 'messagebird',
              href: response.href,
              direction: response.direction,
              type: response.type,
              gateway: response.gateway,
            }
          });
        }
      );
    });
  }

  async verify(phoneNumber: string): Promise<boolean> {
    // Could implement phone number verification via:
    // - Twilio Verify API
    // - SMS OTP verification
    // - Phone number format validation
    
    return this.isValidPhoneNumber(phoneNumber);
  }

  private isValidPhoneNumber(phone: string): boolean {
    // Basic international phone number validation
    // Accepts formats like: +1234567890, +1-234-567-8900, +1 (234) 567-8900
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    const cleaned = phone.replace(/[\s\-()]/g, '');
    return phoneRegex.test(cleaned);
  }
}