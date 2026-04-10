import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;

// Call getUpdates with timeout=0 to terminate the other instance's long poll
// Then immediately call it again to "drain" the connection
for (let i = 0; i < 5; i++) {
  console.log(`Attempt ${i + 1}: sending getUpdates(timeout=0) to break other instance...`);
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeout: 0, offset: -1 }),
  });
  const data = await res.json();
  console.log(data.ok ? '  OK' : `  Error: ${data.description}`);
  await new Promise(r => setTimeout(r, 1000));
}
console.log('\nDone. Now start the bot quickly: npx tsx apps/bot/src/index.ts');
