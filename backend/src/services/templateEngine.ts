import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import Handlebars from 'handlebars';
import { NotificationType } from '../types/notification';
import { logger } from '../utils/logger';

export interface TemplateConfig {
  path: string;
  cache?: boolean;
  helpers?: Record<string, Function>;
}

interface Template {
  id: string;
  channel: string;
  subject?: Record<string, string>;
  body: Record<string, { html?: string; text: string }>;
  metadata?: any;
}

export class TemplateEngine {
  private config: TemplateConfig;
  private templates: Map<string, Template> = new Map();
  private compiledTemplates: Map<string, any> = new Map();
  private logger = logger.child({ service: 'TemplateEngine' });

  constructor(config: TemplateConfig) {
    this.config = config;
    this.registerHelpers();
    this.loadTemplates();
  }

  private registerHelpers(): void {
    // Register default Handlebars helpers
    Handlebars.registerHelper('formatDate', (date: any, format?: string) => {
      const d = new Date(date);
      if (format === 'short') {
        return d.toLocaleDateString();
      }
      return d.toLocaleString();
    });

    Handlebars.registerHelper('formatCurrency', (amount: number, currency = 'USD') => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
      }).format(amount);
    });

    Handlebars.registerHelper('truncate', (text: string, length = 100) => {
      if (text.length <= length) return text;
      return text.substring(0, length - 3) + '...';
    });

    Handlebars.registerHelper('pluralize', (count: number, singular: string, plural: string) => {
      return count === 1 ? singular : plural;
    });

    Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    Handlebars.registerHelper('ne', (a: any, b: any) => a !== b);
    Handlebars.registerHelper('lt', (a: any, b: any) => a < b);
    Handlebars.registerHelper('gt', (a: any, b: any) => a > b);
    Handlebars.registerHelper('lte', (a: any, b: any) => a <= b);
    Handlebars.registerHelper('gte', (a: any, b: any) => a >= b);

    // Register custom helpers
    if (this.config.helpers) {
      Object.entries(this.config.helpers).forEach(([name, fn]) => {
        Handlebars.registerHelper(name, fn);
      });
    }
  }

  private async loadTemplates(): Promise<void> {
    try {
      const templateDir = this.config.path;
      const files = await fs.readdir(templateDir, { recursive: true });
      
      for (const file of files) {
        if (file.toString().endsWith('.yaml') || file.toString().endsWith('.yml')) {
          const filePath = path.join(templateDir, file.toString());
          const content = await fs.readFile(filePath, 'utf-8');
          const template = yaml.load(content) as { template: Template };
          
          if (template.template) {
            const key = `${template.template.id}:${template.template.channel}`;
            this.templates.set(key, template.template);
            
            // Pre-compile templates if caching is enabled
            if (this.config.cache !== false) {
              this.compileTemplate(key, template.template);
            }
          }
        }
      }
      
      this.logger.info(`Loaded ${this.templates.size} notification templates`);
    } catch (error) {
      this.logger.error('Failed to load templates', { error: error.message });
    }
  }

  private compileTemplate(key: string, template: Template): void {
    const compiled: any = {
      subject: {},
      body: {},
    };
    
    // Compile subject templates
    if (template.subject) {
      Object.entries(template.subject).forEach(([lang, subjectTemplate]) => {
        compiled.subject[lang] = Handlebars.compile(subjectTemplate);
      });
    }
    
    // Compile body templates
    Object.entries(template.body).forEach(([lang, bodyTemplates]) => {
      compiled.body[lang] = {
        text: Handlebars.compile(bodyTemplates.text),
        html: bodyTemplates.html ? Handlebars.compile(bodyTemplates.html) : null,
      };
    });
    
    this.compiledTemplates.set(key, compiled);
  }

  async render(
    type: NotificationType,
    channel: string,
    data: Record<string, any>,
    language = 'en'
  ): Promise<any> {
    const key = `${type.toLowerCase()}:${channel}`;
    const template = this.templates.get(key);
    
    if (!template) {
      // Fallback to default template
      return this.renderDefault(type, channel, data, language);
    }
    
    // Get compiled template or compile on demand
    let compiled = this.compiledTemplates.get(key);
    if (!compiled) {
      this.compileTemplate(key, template);
      compiled = this.compiledTemplates.get(key);
    }
    
    // Prepare context with common variables
    const context = {
      ...data,
      appName: 'ZKFair',
      appUrl: process.env.APP_URL || 'https://zkfair.io',
      currentYear: new Date().getFullYear(),
      timestamp: new Date().toISOString(),
    };
    
    // Render subject
    const subjectTemplate = compiled.subject[language] || compiled.subject['en'];
    const subject = subjectTemplate ? subjectTemplate(context) : undefined;
    
    // Render body
    const bodyTemplate = compiled.body[language] || compiled.body['en'];
    const body = bodyTemplate.text(context);
    const html = bodyTemplate.html ? bodyTemplate.html(context) : undefined;
    
    return {
      subject,
      body,
      html,
      channel,
      type,
      language,
      metadata: template.metadata,
    };
  }

  private renderDefault(
    type: NotificationType,
    channel: string,
    data: Record<string, any>,
    language: string
  ): any {
    // Default templates for different notification types
    const defaults: Record<string, { subject?: string; body: string }> = {
      [NotificationType.TRANSACTION_CONFIRMED]: {
        subject: 'Transaction Confirmed',
        body: 'Your transaction {{txHash}} has been confirmed.',
      },
      [NotificationType.TRANSACTION_FAILED]: {
        subject: 'Transaction Failed',
        body: 'Your transaction {{txHash}} has failed. Reason: {{reason}}',
      },
      [NotificationType.LOGIN_ALERT]: {
        subject: 'New Login Detected',
        body: 'A new login was detected from {{location}} at {{timestamp}}.',
      },
      [NotificationType.SECURITY_ALERT]: {
        subject: 'Security Alert',
        body: 'Suspicious activity detected on your account: {{activity}}',
      },
      default: {
        subject: 'Notification from ZKFair',
        body: '{{message}}',
      },
    };
    
    const template = defaults[type] || defaults.default;
    const context = {
      ...data,
      appName: 'ZKFair',
      timestamp: new Date().toISOString(),
    };
    
    // Simple template rendering for defaults
    const renderSimple = (template: string, data: any): string => {
      return template.replace(/{{(\w+)}}/g, (match, key) => {
        return data[key] || match;
      });
    };
    
    return {
      subject: template.subject ? renderSimple(template.subject, context) : undefined,
      body: renderSimple(template.body, context),
      html: undefined,
      channel,
      type,
      language,
    };
  }

  async reloadTemplates(): Promise<void> {
    this.templates.clear();
    this.compiledTemplates.clear();
    await this.loadTemplates();
  }

  getTemplate(type: NotificationType, channel: string): Template | undefined {
    const key = `${type.toLowerCase()}:${channel}`;
    return this.templates.get(key);
  }

  getAllTemplates(): Template[] {
    return Array.from(this.templates.values());
  }
}