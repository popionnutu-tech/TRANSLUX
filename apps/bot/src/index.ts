import 'dotenv/config';
import { config, validateConfig } from './config.js';
import { createBot } from './bot.js';
import { scheduleWeeklyReport } from './scheduler.js';

async function main() {
  validateConfig();

  const bot = createBot();

  // Start weekly report scheduler
  scheduleWeeklyReport();

  console.log('TRANSLUX Bot starting (long polling)...');
  await bot.start({
    onStart: (botInfo) => {
      console.log(`Bot @${botInfo.username} is running.`);
    },
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
