import 'dotenv/config';
import { createServer } from 'http';
import { webhookCallback } from 'grammy';
import { config, validateConfig } from './config.js';
import { createBot } from './bot.js';
import { scheduleWeeklyReport, scheduleSmmJobs, scheduleDailyDigest } from './scheduler.js';

async function main() {
  validateConfig();

  const bot = createBot();

  // Start schedulers
  scheduleWeeklyReport();
  scheduleDailyDigest();
  scheduleSmmJobs();

  const webhookUrl = process.env.WEBHOOK_URL;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (webhookUrl) {
    // ── Webhook mode ─────────────────────────────────────────────
    // Setting a webhook makes Telegram REFUSE getUpdates for this token, so any
    // other (rogue) instance still long-polling is locked out (409) and stops
    // stealing updates. Only this process receives updates, via HTTP.
    await bot.init();
    await bot.api.setWebhook(webhookUrl, {
      drop_pending_updates: true,
      secret_token: webhookSecret,
      allowed_updates: ['message', 'callback_query'],
    });

    const handle = webhookCallback(bot, 'http');
    const port = Number(process.env.PORT) || 3000;

    const server = createServer(async (req, res) => {
      // Health check / root
      if (req.method !== 'POST') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('TRANSLUX bot ok');
        return;
      }
      // Verify Telegram secret token header (set via setWebhook secret_token)
      if (webhookSecret && req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret) {
        res.writeHead(401);
        res.end();
        return;
      }
      try {
        await handle(req, res);
      } catch (err) {
        console.error('Webhook handler error:', err);
        if (!res.headersSent) {
          res.writeHead(200);
          res.end();
        }
      }
    });

    server.listen(port, () => {
      const info = bot.botInfo?.username ? `@${bot.botInfo.username}` : '';
      console.log(`TRANSLUX Bot running ${info} (WEBHOOK mode) on :${port} → ${webhookUrl}`);
    });
  } else {
    // ── Long polling mode (default / fallback) ───────────────────
    console.log('TRANSLUX Bot starting (long polling)...');
    await bot.start({
      onStart: (botInfo) => {
        console.log(`Bot @${botInfo.username} is running.`);
      },
    });
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
