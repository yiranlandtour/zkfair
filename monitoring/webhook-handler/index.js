const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Notification channels
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Alert severity colors
const SEVERITY_COLORS = {
  critical: '#FF0000',
  warning: '#FFA500',
  info: '#0000FF',
  resolved: '#00FF00',
};

// Format alert for different platforms
function formatAlert(alert) {
  const severity = alert.labels?.severity || 'info';
  const status = alert.status || 'firing';
  const color = status === 'resolved' ? SEVERITY_COLORS.resolved : SEVERITY_COLORS[severity];
  
  return {
    alertname: alert.labels?.alertname || 'Unknown Alert',
    severity,
    status,
    color,
    summary: alert.annotations?.summary || 'No summary provided',
    description: alert.annotations?.description || 'No description provided',
    component: alert.labels?.component || 'unknown',
    instance: alert.labels?.instance || 'unknown',
    startsAt: alert.startsAt,
    endsAt: alert.endsAt,
  };
}

// Send to Slack
async function sendSlackNotification(alerts) {
  if (!SLACK_WEBHOOK_URL) return;
  
  const attachments = alerts.map(alert => {
    const formatted = formatAlert(alert);
    return {
      color: formatted.color,
      title: `${formatted.status === 'resolved' ? '✅' : '🚨'} ${formatted.alertname}`,
      fields: [
        { title: 'Status', value: formatted.status, short: true },
        { title: 'Severity', value: formatted.severity, short: true },
        { title: 'Component', value: formatted.component, short: true },
        { title: 'Instance', value: formatted.instance, short: true },
        { title: 'Summary', value: formatted.summary, short: false },
        { title: 'Description', value: formatted.description, short: false },
      ],
      footer: 'ZKFair Monitoring',
      ts: Math.floor(new Date(formatted.startsAt).getTime() / 1000),
    };
  });
  
  try {
    await axios.post(SLACK_WEBHOOK_URL, {
      text: `${alerts.length} alert(s) ${alerts[0].status}`,
      attachments,
    });
    console.log('Slack notification sent');
  } catch (error) {
    console.error('Error sending Slack notification:', error.message);
  }
}

// Send to Discord
async function sendDiscordNotification(alerts) {
  if (!DISCORD_WEBHOOK_URL) return;
  
  const embeds = alerts.map(alert => {
    const formatted = formatAlert(alert);
    const emoji = formatted.status === 'resolved' ? '✅' : '🚨';
    
    return {
      title: `${emoji} ${formatted.alertname}`,
      color: parseInt(formatted.color.replace('#', ''), 16),
      fields: [
        { name: 'Status', value: formatted.status, inline: true },
        { name: 'Severity', value: formatted.severity, inline: true },
        { name: 'Component', value: formatted.component, inline: true },
        { name: 'Instance', value: formatted.instance, inline: true },
        { name: 'Summary', value: formatted.summary, inline: false },
        { name: 'Description', value: formatted.description, inline: false },
      ],
      timestamp: formatted.startsAt,
      footer: { text: 'ZKFair Monitoring' },
    };
  });
  
  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      content: `**${alerts.length} alert(s) ${alerts[0].status}**`,
      embeds,
    });
    console.log('Discord notification sent');
  } catch (error) {
    console.error('Error sending Discord notification:', error.message);
  }
}

// Send to Telegram
async function sendTelegramNotification(alerts) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  
  const messages = alerts.map(alert => {
    const formatted = formatAlert(alert);
    const emoji = formatted.status === 'resolved' ? '✅' : '🚨';
    
    return `${emoji} *${formatted.alertname}*
*Status:* ${formatted.status}
*Severity:* ${formatted.severity}
*Component:* ${formatted.component}
*Instance:* ${formatted.instance}
*Summary:* ${formatted.summary}
*Description:* ${formatted.description}`;
  });
  
  const message = messages.join('\n\n---\n\n');
  
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
    });
    console.log('Telegram notification sent');
  } catch (error) {
    console.error('Error sending Telegram notification:', error.message);
  }
}

// Webhook endpoints
app.post('/webhook', async (req, res) => {
  const { alerts } = req.body;
  
  if (!alerts || !Array.isArray(alerts)) {
    return res.status(400).json({ error: 'Invalid alert format' });
  }
  
  console.log(`Received ${alerts.length} alerts`);
  
  // Send to all configured channels
  await Promise.all([
    sendSlackNotification(alerts),
    sendDiscordNotification(alerts),
    sendTelegramNotification(alerts),
  ]);
  
  res.json({ status: 'ok', processed: alerts.length });
});

// Component-specific endpoints
app.post('/blockchain', async (req, res) => {
  const { alerts } = req.body;
  console.log(`Received ${alerts.length} blockchain alerts`);
  
  // Can add custom handling for blockchain alerts
  await Promise.all([
    sendSlackNotification(alerts),
    sendDiscordNotification(alerts),
  ]);
  
  res.json({ status: 'ok' });
});

app.post('/database', async (req, res) => {
  const { alerts } = req.body;
  console.log(`Received ${alerts.length} database alerts`);
  
  // Can add custom handling for database alerts
  await Promise.all([
    sendSlackNotification(alerts),
    sendTelegramNotification(alerts),
  ]);
  
  res.json({ status: 'ok' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    channels: {
      slack: !!SLACK_WEBHOOK_URL,
      discord: !!DISCORD_WEBHOOK_URL,
      telegram: !!TELEGRAM_BOT_TOKEN && !!TELEGRAM_CHAT_ID,
    },
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Webhook handler listening on port ${PORT}`);
  console.log('Configured channels:');
  console.log('- Slack:', !!SLACK_WEBHOOK_URL);
  console.log('- Discord:', !!DISCORD_WEBHOOK_URL);
  console.log('- Telegram:', !!TELEGRAM_BOT_TOKEN && !!TELEGRAM_CHAT_ID);
});