import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { webhookCallback } from 'grammy';
import { validateConfig } from './config.js';
import { createBot } from './bot.js';
import { getSupabase } from './supabase.js';
import { scheduleWeeklyReport, scheduleSmmJobs, scheduleDailyDigest } from './scheduler.js';

const HEARTBEAT_KEY = 'bot:heartbeat';

/** Liveness beacon: a watchdog cron reads this and alerts admins if it goes stale.
 *  Catches crashes, hangs, restart-loops and a stuck update loop in BOTH modes. */
async function writeHeartbeat(mode: string): Promise<void> {
  try {
    await getSupabase()
      .from('bot_storage')
      .upsert(
        { key: HEARTBEAT_KEY, value: { ts: new Date().toISOString(), mode }, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
  } catch (err) {
    console.error('heartbeat write failed:', err);
  }
}

async function main() {
  validateConfig();

  const bot = createBot();

  // Start schedulers
  scheduleWeeklyReport();
  scheduleDailyDigest();
  scheduleSmmJobs();

  const webhookUrl = process.env.WEBHOOK_URL;
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const port = Number(process.env.PORT) || 3000;
  const mode = webhookUrl ? 'webhook' : 'polling';

  // In webhook mode, register the webhook and prepare the grammY HTTP handler.
  // Setting a webhook makes Telegram REFUSE getUpdates for this token, locking
  // out any rogue long-polling instance (409).
  let handle: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | null = null;
  if (webhookUrl) {
    await bot.init();
    await bot.api.setWebhook(webhookUrl, {
      drop_pending_updates: true,
      secret_token: webhookSecret,
      allowed_updates: ['message', 'callback_query'],
    });
    handle = webhookCallback(bot, 'http');
  }

  // ── Always-on HTTP server ────────────────────────────────────────────
  // Serves the health check in BOTH modes (so Railway never marks the service
  // unhealthy / restart-loops it in polling mode), plus the webhook POST when
  // in webhook mode.
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`TRANSLUX bot ok (${mode})`);
      return;
    }
    if (!handle) {
      // Polling mode: no webhook POST expected.
      res.writeHead(200);
      res.end('ok');
      return;
    }
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
    console.log(`TRANSLUX Bot HTTP/health server on :${port} (${mode} mode)`);
  });

  // ── Heartbeat ────────────────────────────────────────────────────────
  await writeHeartbeat(mode);
  setInterval(() => { void writeHeartbeat(mode); }, 60_000);

  if (webhookUrl) {
    const info = bot.botInfo?.username ? `@${bot.botInfo.username}` : '';
    console.log(`TRANSLUX Bot running ${info} (WEBHOOK mode) → ${webhookUrl}`);
  } else {
    // ── Long polling mode (bot pulls updates — no inbound dependency) ────
    console.log('TRANSLUX Bot starting (long polling)...');
    await bot.start({
      onStart: (botInfo) => {
        console.log(`Bot @${botInfo.username} is running (polling).`);
      },
    });
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
