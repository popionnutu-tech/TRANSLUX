import 'server-only';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { fonts, logoBase64, textPath, truncText } from '@/lib/schedule-image';
import type { ComandaPublica } from './public';

// Imaginea biletului pentru chatul Telegram (ION-248, Ion, 05.10: «nu este biletul plin cum pe site»): același card ca pe
// pagina biletului (ION-236) — logo, data, «BILET ONLINE», plecare → sosire, orașele, locul, prețul, pasagerul, operatorul,
// linia de rupere, QR-ul, «Achitat online». SVG cu text desenat ca path (nu depinde de fonturile mașinii), apoi PNG prin sharp.

const W = 420;          // lățimea logică; PNG-ul iese la ×S
const S = 2.5;
const BG = '#f1efef';
const RED = '#9B1B30';

const TXT = {
  ro: { online: 'BILET ONLINE', locul: 'Locul', pret: 'Preț', achitat: 'Achitat online', azi: 'Azi', proba: 'BILET DE PROBĂ — NU E VALABIL LA URCARE', din: (n: number, t: number) => `biletul ${n} din ${t}` },
  ru: { online: 'ОНЛАЙН-БИЛЕТ', locul: 'Место', pret: 'Цена', achitat: 'Оплачено онлайн', azi: 'Сегодня', proba: 'ТЕСТОВЫЙ БИЛЕТ — НЕ ДЕЙСТВИТЕЛЕН ДЛЯ ПОСАДКИ', din: (n: number, t: number) => `билет ${n} из ${t}` },
} as const;

const OPERATOR = 'TRANSLUX · S.R.L. „Parcul de Autobuze și Taximetre nr. 9 din Briceni”';
const IDNO = 'IDNO 1003604001469';

function oraHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });
}
/** Data cursei, OBLIGATORIE pe fiecare bilet (Ion, 07.10): «Azi, 07.10.2026» în ziua cursei, altfel «mar., 14.10.2026». */
function dataScurta(tripDate: string, lang: 'ro' | 'ru'): string {
  const aziChisinau = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  const [y, m, d] = tripDate.split('-').map(Number);
  const data = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
  if (tripDate === aziChisinau) return `${TXT[lang].azi}, ${data}`;
  const zi = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'ro-RO', { timeZone: 'UTC', weekday: 'short' });
  return `${zi}, ${data}`;
}
function latime(f: ReturnType<typeof fonts>['b'], t: string, size: number): number {
  const b = f.getPath(t, 0, 0, size).getBoundingBox(); return b.x2 - b.x1;
}

/** PNG-ul unui loc (`nr`) din comandă; null dacă locul nu există sau nu e valabil. */
export async function imagineBilet(c: ComandaPublica, nr: number): Promise<Buffer | null> {
  const b = c.bilete.find((x) => x.nr === nr && (x.status === 'valid' || x.status === 'urcat'));
  if (!b || c.status !== 'platita') return null;
  const t = TXT[c.lang === 'ru' ? 'ru' : 'ro'];
  const { r, b: bold } = fonts();
  const L = 36, R = W - 36;              // marginile textului în card
  const out: string[] = [];

  // antet: logo + data
  out.push(`<image x="${L}" y="30" width="${(22 * 1318) / 192}" height="22" href="data:image/png;base64,${logoBase64()}"/>`);
  out.push(textPath(bold, dataScurta(c.trip_date, c.lang === 'ru' ? 'ru' : 'ro'), R, 47, 13, '#555', 'end'));
  // pastila; biletul de probă (migr. 532): bandă roșie pe toată lățimea în locul ei
  if (c.proba) {
    out.push(`<rect x="${L}" y="64" width="${R - L}" height="26" rx="13" fill="#b91c1c"/>`);
    out.push(textPath(bold, truncText(bold, t.proba, 10.5, R - L - 20), W / 2, 81, 10.5, '#fff', 'middle'));
  } else {
    const wPast = latime(bold, t.online, 10.5) + 28;
    out.push(`<rect x="${L}" y="64" width="${wPast}" height="26" rx="13" fill="#fbe9e3"/>`);
    out.push(textPath(bold, t.online, L + 14, 81, 10.5, '#d9532b'));
  }
  // orele
  const plecare = oraHHMM(c.departure_at);
  const sosire = c.sosire ?? '—:—';
  out.push(textPath(bold, plecare, L, 146, 38, '#1a1a1a'));
  out.push(textPath(bold, sosire, R, 146, 38, c.sosire ? '#1a1a1a' : '#bbb', 'end'));
  const x1 = L + latime(bold, plecare, 38) + 12, x2 = R - latime(bold, sosire, 38) - 12;
  if (x2 > x1) out.push(`<line x1="${x1}" y1="132" x2="${x2}" y2="132" stroke="#c9c9c9" stroke-width="3" stroke-dasharray="1 6" stroke-linecap="round"/>`);
  // orașele
  out.push(textPath(bold, truncText(bold, c.from_name, 18, 165), L, 176, 18, '#1a1a1a'));
  out.push(textPath(bold, truncText(bold, c.to_name, 18, 165), R, 176, 18, '#1a1a1a', 'end'));
  const nume = c.ruta ? (c.lang === 'ru' ? c.ruta.nume_ru : c.ruta.nume_ro) : null;
  if (nume) out.push(textPath(r, truncText(r, nume, 11, R - L), L, 198, 11, '#888'));
  // locul și prețul
  const valide = c.bilete.filter((x) => x.status === 'valid' || x.status === 'urcat');
  const loc = String(b.loc_nr ?? b.nr) + (valide.length > 1 ? `  (${t.din(b.nr, valide.length)})` : '');
  out.push(textPath(r, t.locul, L, 230, 15, '#666'));
  out.push(textPath(bold, loc, R, 230, 15, '#1a1a1a', 'end'));
  out.push(textPath(r, t.pret, L, 255, 15, '#666'));
  out.push(textPath(bold, `${Math.round(Number(c.price_per_seat))} MDL`, R, 255, 15, '#1a1a1a', 'end'));
  out.push(textPath(r, truncText(r, c.passenger_name, 12.5, R - L), L, 281, 12.5, '#666'));
  // operatorul și codul fiscal întregi (nota ecc.md: «denumirea operatorului, codul fiscal…»)
  out.push(textPath(r, truncText(r, OPERATOR, 8.6, R - L), L, 296, 8.6, '#999'));
  out.push(textPath(r, IDNO, L, 308, 8.6, '#999'));
  // linia de rupere
  out.push(`<line x1="30" y1="318" x2="${W - 30}" y2="318" stroke="#d9d9d9" stroke-width="2" stroke-dasharray="6 5"/>`);
  out.push(`<circle cx="16" cy="318" r="12" fill="${BG}"/><circle cx="${W - 16}" cy="318" r="12" fill="${BG}"/>`);
  // QR-ul (estompat dacă locul e urcat, ca pe site)
  const urcat = b.status === 'urcat';
  const qr = await QRCode.toBuffer(b.cod_qr, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 600 });
  out.push(`<image x="${W / 2 - 105}" y="336" width="210" height="210" opacity="${urcat ? 0.3 : 1}" href="data:image/png;base64,${qr.toString('base64')}"/>`);
  out.push(textPath(r, b.cod_qr, W / 2, 568, 12.5, '#444', 'middle'));
  // pastila «Achitat online» cu bifă desenată (fontul nu are «✓»)
  out.push(`<rect x="${L}" y="582" width="${R - L}" height="46" rx="14" fill="${urcat ? '#ececec' : '#e3f3e8'}"/>`);
  const txtAch = urcat ? (c.lang === 'ru' ? 'Посадка выполнена' : 'Urcat') : t.achitat;
  const culAch = urcat ? '#666' : '#1b7f3b';
  const wAch = latime(bold, txtAch, 16.5);
  const xb = W / 2 - (wAch + 24) / 2;
  out.push(`<path d="M${xb} ${605} l6 6 l11 -13" fill="none" stroke="${culAch}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
  out.push(textPath(bold, txtAch, xb + 24, 611, 16.5, culAch));

  const H = 660;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${BG}"/>
<rect x="16" y="14" width="${W - 32}" height="${H - 30}" rx="22" fill="#fff"/>
${out.join('\n')}
</svg>`;
  void RED;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
