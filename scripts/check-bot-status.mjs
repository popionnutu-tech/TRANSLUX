import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;

// Check webhook info
const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
const data = await res.json();
console.log('Webhook info:', JSON.stringify(data, null, 2));

// Delete webhook + drop pending updates to free the getUpdates lock
const res2 = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
const data2 = await res2.json();
console.log('deleteWebhook:', JSON.stringify(data2, null, 2));
