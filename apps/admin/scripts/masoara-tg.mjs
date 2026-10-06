// Bancul de măsură «Telegram ultrafast» (planul docs/plans/2026-10-06-telegram-ultrafast.md, P0/P12). Rulează pe VPS
// (/root/render, Playwright + Chromium): deschide mini app-ul șoferului și al clientului ca Telegram (initData în hash), cu
// emulare iPhone și throttling «Fast 3G» (presetul DevTools: 1,6 Mbps ↓ / 750 kbps ↑ / 562 ms RTT), de N ori «rece» (context
// nou, fără cache) și de N ori «cald» (același context, reîncărcare). Scrie JSON + tabel cu mediane.
//   node masoara-tg.mjs /root/render/masoara-cfg.json [N]   — cfg: { sofer_init, client_init, eticheta }
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const N = Number(process.argv[3] ?? 5);
const FAST3G = { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 562 };
const TINTE = {
  sofer: { url: 'https://central-hub-md.vercel.app/mini-app/bilete', api: '/api/bilete-sofer/azi', gata: /Scanează biletul|Сканировать билет|nu ai cursă|нет рейса|Nelegat|Не привязан/, init: cfg.sofer_init },
  client: { url: 'https://translux.md/ro/telegram', api: '/api/bilete/client/bilete', apiBrowser: { method: 'POST', url: '/ro/telegram' }, gata: '.tg-mini, .tg-gol, .tg-eroare', init: cfg.client_init },
};
const hash = (init) => `#tgWebAppData=${encodeURIComponent(init)}&tgWebAppVersion=7.10&tgWebAppPlatform=ios`;
// În browser: șoferul cheamă API-ul direct; clientul trece prin server action-ul paginii (POST pe /ro/telegram).
const eApi = (t, req, raspuns = false) => t.apiBrowser ? req.url.includes(t.apiBrowser.url) && (raspuns || req.method === t.apiBrowser.method) : req.url.includes(t.api);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

async function oRulare(ctx, t) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', FAST3G);
  const cereri = new Map(); let bytes = 0; let apiTtfb = null; let apiStart = null;
  cdp.on('Network.requestWillBeSent', (e) => { cereri.set(e.requestId, { url: e.request.url, t0: e.timestamp }); if (eApi(t, e.request)) apiStart = e.timestamp; });
  cdp.on('Network.responseReceived', (e) => { if (eApi(t, { url: e.response.url, method: 'POST' }, true) && apiStart != null) apiTtfb = Math.round((e.timestamp - apiStart) * 1000); });
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength || 0; });
  const t0 = Date.now();
  await page.goto(t.url + hash(t.init), { waitUntil: 'commit' });
  if (typeof t.gata === 'string') await page.waitForSelector(t.gata, { timeout: 60_000 });
  else await page.getByText(t.gata).first().waitFor({ timeout: 60_000 });
  const gata = Date.now() - t0;
  await page.waitForTimeout(1500); // cererile din coadă/după randare
  const r = { gata_ms: gata, cereri: cereri.size, bytes, api_ttfb_ms: apiTtfb };
  await page.close();
  return r;
}

const out = { eticheta: cfg.eticheta ?? '', la: new Date().toISOString(), N, rezultate: {} };
const browser = await chromium.launch();
for (const [nume, t] of Object.entries(TINTE)) {
  if (!t.init) continue;
  const rece = [], cald = [];
  for (let i = 0; i < N; i++) { const ctx = await browser.newContext({ ...devices['iPhone 13'] }); rece.push(await oRulare(ctx, t)); await ctx.close(); }
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  await oRulare(ctx, t); // umple cache-ul
  for (let i = 0; i < N; i++) cald.push(await oRulare(ctx, t));
  await ctx.close();
  const rez = (a) => ({ gata_ms: med(a.map((x) => x.gata_ms)), cereri: med(a.map((x) => x.cereri)), bytes: med(a.map((x) => x.bytes)), api_ttfb_ms: med(a.map((x) => x.api_ttfb_ms).filter((x) => x != null)) });
  out.rezultate[nume] = { rece: rez(rece), cald: rez(cald), brut: { rece, cald } };
  console.log(nume, 'rece', JSON.stringify(out.rezultate[nume].rece), 'cald', JSON.stringify(out.rezultate[nume].cald));
}
await browser.close();
// API-urile singure, fără browser, 5 apeluri la rând (prima = după liniștea de dinaintea rulării)
for (const [nume, t] of Object.entries(TINTE)) {
  if (!t.init || (nume === 'client' && !cfg.client_key)) continue; // fără cheia site-ului, API-ul clientului nu se poate chema direct
  const ms = [];
  for (let i = 0; i < 5; i++) {
    const a = performance.now();
    const r = nume === 'sofer'
      ? await fetch('https://central-hub-md.vercel.app' + t.api, { headers: { 'x-telegram-init-data': t.init } })
      : await fetch('https://central-hub-md.vercel.app' + t.api, { method: 'POST', headers: { 'x-telegram-init-data': t.init, Authorization: `Bearer ${cfg.client_key ?? ''}` } });
    await r.text(); ms.push(Math.round(performance.now() - a));
  }
  out.rezultate[nume].api_direct_ms = ms; console.log(nume, 'API direct ms:', ms.join(' / '));
}
const f = `/root/render/masoara-tg-${out.la.slice(0, 16).replace(/[:T]/g, '-')}${cfg.eticheta ? '-' + cfg.eticheta : ''}.json`;
fs.writeFileSync(f, JSON.stringify(out, null, 1)); console.log('scris', f);
