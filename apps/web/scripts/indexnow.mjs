// IndexNow (ION-153): trimite toate paginile din sitemap-ul translux.md la Bing, Yandex și
// ceilalți participanți IndexNow. ChatGPT caută pe internet prin indexul Bing.
// Rulare (după un deploy care adaugă pagini): node apps/web/scripts/indexnow.mjs
// Cheia e servită la https://translux.md/<KEY>.txt (src/app/<KEY>.txt/route.ts).

const KEY = '4c10f7c9c9aac4c2b715b4f13b7bad51';
const HOST = 'translux.md';

const xml = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urls.length === 0) throw new Error('sitemap gol');

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
});
console.log(`IndexNow: ${urls.length} adrese → HTTP ${res.status} ${await res.text()}`);
