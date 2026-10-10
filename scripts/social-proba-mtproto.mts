// Proba MTProto (dezbaterea 10.10, SBE-2 / SBE2-1 / SBE2-3) — se rulează ÎNAINTE ca TELEGRAM_API_ID să ajungă în
// Railway. Întrebarea: când botul descarcă un clip prin MTProto, mai primește Bot API-ul TOATE actualizările?
// Logurile n-o pot spune (o actualizare pierdută nu lasă urme), deci proba numără. Iese cu 0 doar dacă trece.
//
// Pe un bot DE UNICĂ FOLOSINȚĂ (@BotFather → /newbot), nu pe botul Translux:
//  1. Botul de probă = administrator într-un supergrup de test cu Topics.
//  2. Două clipuri de ~300 MB în grup: unul care stă pe DC-ul botului și unul de pe alt DC (urcat de un om din altă
//     țară / alt cont). Proba afișează DC-urile; fără ambele cazuri acoperirea e incompletă → exit 1 (C14).
//  3. Rulează din rădăcina repo-ului:
//       PROBA_BOT_TOKEN=… TELEGRAM_API_ID=… TELEGRAM_API_HASH=… PROBA_CHAT=-100… \
//       PROBA_MSG1=<id> PROBA_AUTOR1=<tg id> PROBA_MARIME1=<octeți> \
//       PROBA_MSG2=<id> PROBA_AUTOR2=<tg id> PROBA_MARIME2=<octeți> npx tsx scripts/social-proba-mtproto.mts
//  4. Tot timpul probei scrie botului în privat numere la rând: 1, 2, 3 … (unul la câteva secunde).
// Pașii: (a) clipul 1 cu logare nouă; (b) clipul 2 cu sesiunea refolosită; (c) clipul 1 cu limita de 3 s (calea de
// timeout: copilul e omorât); (d) încă 60 s de ascultare. La final scrii câte numere ai trimis (N, numărat de tine, nu
// din ce a primit botul — runda 2, C9): trece doar dacă primite = exact 1…N și fiecare fază a primit cel puțin un număr.
import { createInterface } from 'node:readline/promises';
import { descarcaInCopil, stergeTemporar } from '../apps/bot/src/social/descarcare.ts';

const env = (k: string) => process.env[k] ?? '';
const token = env('PROBA_BOT_TOKEN');
const chat = Number(env('PROBA_CHAT'));
const clipuri = [1, 2].map((i) => ({ msg: Number(env(`PROBA_MSG${i}`)), autor: Number(env(`PROBA_AUTOR${i}`)), marime: Number(env(`PROBA_MARIME${i}`)) }));
if (!token || !chat || !env('TELEGRAM_API_ID') || !env('TELEGRAM_API_HASH') || clipuri.some((c) => !c.msg || !c.autor || !c.marime)) {
  console.error('Lipsesc variabile: PROBA_BOT_TOKEN, TELEGRAM_API_ID, TELEGRAM_API_HASH, PROBA_CHAT, PROBA_MSG1/2, PROBA_AUTOR1/2, PROBA_MARIME1/2');
  process.exit(2);
}

const primite: Array<{ n: number; la: number }> = [];
let offset = 0;
let gata = false;
async function polling(): Promise<void> {
  while (!gata) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=20&offset=${offset}`).then((x) => x.json()) as
        { ok: boolean; result: Array<{ update_id: number; message?: { text?: string } }> };
      for (const u of r.result ?? []) {
        offset = u.update_id + 1;
        const n = Number(u.message?.text?.trim());
        if (Number.isInteger(n)) { primite.push({ n, la: Date.now() }); console.log(`  ← Bot API: ${n}`); }
      }
    } catch (e) { console.error('getUpdates:', (e as Error).message); }
  }
}

/** Numerele lipsă din 1…N, cu N dat de om (nu din ce s-a primit: un sufix pierdut ar trece neobservat). Pur. */
export function lipsa(nr: number[], n: number): number[] {
  const set = new Set(nr);
  return Array.from({ length: n }, (_, i) => i + 1).filter((x) => !set.has(x));
}

const faze: Array<{ nume: string; de: number; pana: number }> = [];
async function faza<T>(nume: string, f: () => Promise<T>): Promise<T> {
  const de = Date.now();
  try { return await f(); } finally { faze.push({ nume, de, pana: Date.now() }); }
}

const p = polling();
let ok = true;
const dcuri: Array<{ sesiune: number; clip: number }> = [];
console.log('Scrie botului în privat 1, 2, 3 … pe toată durata probei.');
try {
  for (const [i, c] of clipuri.entries()) {
    const cale = `/tmp/social-proba-${i + 1}.mp4`;
    const t0 = Date.now();
    const r = await faza(`clipul ${i + 1}`, () => descarcaInCopil({ token, chatId: chat, messageId: c.msg, cale, asteptat: { autorTelegramId: c.autor, marime: c.marime } }));
    await stergeTemporar(cale);
    const s = (Date.now() - t0) / 1000;
    if (!r.ok) { console.error(`Clipul ${i + 1}: EȘEC — ${r.mesaj}`); ok = false; continue; }
    dcuri.push({ sesiune: r.dcSesiune, clip: r.dcClip });
    console.log(`Clipul ${i + 1} (${i === 0 ? 'logare nouă' : 'sesiune refolosită'}): ${(c.marime / 1e6).toFixed(0)} MB în ${s.toFixed(0)} s = `
      + `${(c.marime / 1e6 / s).toFixed(2)} MB/s · DC bot ${r.dcSesiune}, DC clip ${r.dcClip}`);
  }
  const t = await faza('timeout', async () => {
    const r = await descarcaInCopil({ token, chatId: chat, messageId: clipuri[0].msg, cale: '/tmp/social-proba-t.mp4',
      asteptat: { autorTelegramId: clipuri[0].autor, marime: clipuri[0].marime } }, 3_000);
    // Faza de timeout ține 20 s: copilul omorât trebuie să nu fi lăsat sesiunea abonată nici după.
    await new Promise((x) => setTimeout(x, 17_000));
    return r;
  });
  await stergeTemporar('/tmp/social-proba-t.mp4');
  // Runda 3 Codex, C14: faza trece doar dacă a lovit chiar limita (nu orice eroare venită mai devreme).
  const timeoutReal = !t.ok && /depășit/.test(t.mesaj);
  console.log(`Calea de timeout: ${t.ok ? 'NU s-a oprit (eroare)' : t.mesaj}${timeoutReal ? '' : ' — NU e oprirea la limită: proba pică'}`);
  if (!timeoutReal) ok = false;
  console.log('Încă 60 s de ascultare — scrie încă 2–3 numere.');
  await new Promise((r) => setTimeout(r, 60_000));
} finally {
  gata = true;
  await Promise.race([p, new Promise((r) => setTimeout(r, 25_000))]);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const n = Number(await rl.question('Câte numere ai trimis în total (ultimul număr scris)? '));
  rl.close();
  const nr = primite.map((x) => x.n);
  const lipsesc = Number.isInteger(n) && n > 0 ? lipsa(nr, n) : [-1];
  console.log(`Primite (${nr.length}): ${nr.join(', ') || '—'}`);
  console.log(`Lipsă din 1…${n}: ${lipsesc.join(', ') || 'nimic'}`);
  const fazeGoale = faze.filter((f) => !primite.some((x) => x.la >= f.de && x.la <= f.pana + 3_000)).map((f) => f.nume);
  if (fazeGoale.length) console.log(`Faze fără niciun număr primit (acoperire incompletă): ${fazeGoale.join(', ')}`);
  // C14: e nevoie de ambele cazuri — un clip pe DC-ul botului și unul pe alt DC.
  const altDc = dcuri.some((d) => d.clip !== d.sesiune) && dcuri.some((d) => d.clip === d.sesiune);
  if (!altDc) console.log('Acoperire incompletă: trebuie un clip pe DC-ul botului ȘI unul pe alt DC (DC-urile sunt afișate mai sus); schimbă unul din clipuri.');
  const trece = ok && n >= 5 && lipsesc.length === 0 && nr.length === n && fazeGoale.length === 0 && altDc;
  console.log(trece
    ? 'VERDICT: TRECE — Bot API a primit tot cât a rulat MTProto. Se pot pune cheile MTProto în Railway (pasul 11).'
    : 'VERDICT: PICĂ — NU se pune TELEGRAM_API_ID în Railway; descărcarea trece pe un bot separat.');
  process.exit(trece ? 0 : 1);
}
