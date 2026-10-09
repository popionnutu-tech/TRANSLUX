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

/** «651 AKD» / «651AKD» → «AKD 651» (ca pe plăcuța moldovenească: literele întâi). */
function placaLitereIntai(raw: string | null | undefined): string | null {
  const p = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!p) return null;
  const m = p.match(/^(\d{3})([A-Z]{3})$/);
  if (m) return `${m[2]} ${m[1]}`;
  const n = p.match(/^([A-Z]{2,3})(\d{3,4})$/);
  return n ? `${n[1]} ${n[2]}` : p;
}

/**
 * PNG-ul unui loc (`nr`) din comandă; null dacă locul nu există sau nu e valabil. Varianta B de pe pânza de design (Ion,
 * 09.10.2026: «B este super»): tichet bordo cu logoul alb, data, ora și ruta mari; fereastra albă cu LOCUL, mașina și
 * șoferul (după bifa dispecerului), QR-ul, codul în grupe de câte 4, pasagerul · prețul · achitat, firma și IDNO;
 * marginea ferestrei zimțată, ca un bilet rupt.
 */
export async function imagineBilet(c: ComandaPublica, nr: number): Promise<Buffer | null> {
  const b = c.bilete.find((x) => x.nr === nr && (x.status === 'valid' || x.status === 'urcat'));
  if (!b || c.status !== 'platita') return null;
  const lang = c.lang === 'ru' ? 'ru' : 'ro';
  const t = TXT[lang];
  const { r, b: bold } = fonts();
  const out: string[] = [];
  const CX = 16, CW = W - 32;            // cardul bordo
  const L = 40, R = W - 40;              // marginile textului
  let y = 14;

  if (c.proba) {
    out.push(`<rect x="${CX}" y="${y}" width="${CW}" height="34" fill="#fff"/>`);
    out.push(textPath(bold, truncText(bold, t.proba, 11, CW - 24), W / 2, y + 22, 11, '#b91c1c', 'middle'));
    y += 34;
  }
  // antet: logoul alb (filtru pe logoul bordo) + data în pastilă
  out.push(`<image x="${L}" y="${y + 22}" width="${(22 * 1318) / 192}" height="22" filter="url(#alb)" href="data:image/png;base64,${logoBase64()}"/>`);
  const data = dataScurta(c.trip_date, lang);
  const wData = latime(bold, data, 12.5) + 22;
  out.push(`<rect x="${R - wData}" y="${y + 20}" width="${wData}" height="26" rx="13" fill="#fff" fill-opacity="0.16"/>`);
  out.push(textPath(bold, data, R - wData / 2, y + 38, 12.5, '#fff', 'middle'));
  // ora plecării mare → sosirea, ruta
  const plecare = oraHHMM(c.departure_at);
  out.push(textPath(bold, plecare, L, y + 104, 44, '#fff'));
  // săgeata se desenează (fontul n-are «→»)
  const sageata = (x: number, yy: number, w: number, cul: string) => `<path d="M${x} ${yy} h${w} m-6 -5 l6 5 l-6 5" fill="none" stroke="${cul}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  const xs = L + latime(bold, plecare, 44) + 12;
  if (c.sosire) { out.push(sageata(xs, y + 97, 18, '#fff')); out.push(textPath(r, c.sosire, xs + 26, y + 104, 18, '#fff')); }
  const deLa = truncText(bold, c.from_name, 18, (R - L - 40) / 2);
  const xd = L + latime(bold, deLa, 18) + 10;
  out.push(textPath(bold, deLa, L, y + 136, 18, '#fff'));
  out.push(sageata(xd, y + 130, 18, '#fff'));
  out.push(textPath(bold, truncText(bold, c.to_name, 18, R - xd - 30), xd + 28, y + 136, 18, '#fff'));
  const nume = c.ruta ? (lang === 'ru' ? c.ruta.nume_ru : c.ruta.nume_ro) : null;
  if (nume) out.push(textPath(r, truncText(r, nume, 11, R - L), L, y + 154, 11, '#f3d6db'));

  // fereastra albă
  const WX = CX + 16, WW = CW - 32, wy = y + 170;
  const urcat = b.status === 'urcat';
  const valide = c.bilete.filter((x) => x.status === 'valid' || x.status === 'urcat');
  const qrMarime = 220;
  const winH = 84 + qrMarime + 112;
  out.push(`<path d="M${WX} ${wy + 20} a20 20 0 0 1 20 -20 h${WW - 40} a20 20 0 0 1 20 20 v${winH - 20} h${-WW} z" fill="#fff"/>`);
  // LOCUL mare
  out.push(textPath(bold, lang === 'ru' ? 'МЕСТО' : 'LOCUL', WX + 18, wy + 28, 11, '#8A7A7D'));
  out.push(textPath(bold, String(b.loc_nr ?? b.nr), WX + 18, wy + 66, 34, RED));
  if (valide.length > 1) out.push(textPath(r, t.din(b.nr, valide.length), WX + 18, wy + 82, 10.5, '#8A7A7D'));
  // echipajul (migr. 538): plăcuța MD + șoferul și telefonul; până la bifă — textul de așteptare
  const e = c.echipaj;
  const RX = WX + WW - 18;
  if (e?.stare === 'gata') {
    const placa = placaLitereIntai(e.placa);
    if (placa) {
      const wTxt = latime(bold, placa, 15);
      const wP = 18 + wTxt + 14, px = RX - wP, py = wy + 18;
      out.push(`<rect x="${px}" y="${py}" width="${wP}" height="26" rx="5" fill="#fff" stroke="#111" stroke-width="2"/>`);
      out.push(`<path d="M${px + 1} ${py + 1} h17 v24 h-17 z" fill="#1747A6"/>`);
      out.push(`<rect x="${px + 4}" y="${py + 4}" width="3.4" height="7" fill="#0046AE"/><rect x="${px + 7.4}" y="${py + 4}" width="3.4" height="7" fill="#FFD200"/><rect x="${px + 10.8}" y="${py + 4}" width="3.4" height="7" fill="#CC092F"/>`);
      out.push(textPath(bold, 'MD', px + 9.5, py + 21, 6.5, '#fff', 'middle'));
      out.push(textPath(bold, placa, px + 18 + 7, py + 19, 15, '#111'));
    }
    const linie = [e.sofer ? `${lang === 'ru' ? 'водитель' : 'șofer'} ${e.sofer}` : null, e.telefon].filter(Boolean).join(' · ');
    if (linie) out.push(textPath(bold, truncText(bold, linie, 11.5, WW - 110), RX, wy + 62, 11.5, '#1B7F3B', 'end'));
  } else if (e) {
    const txt = e.stare === 'anulat'
      ? (lang === 'ru' ? 'Рейс отменён — звоните +373 60 401 010' : 'Cursa anulată — sună +373 60 401 010')
      : (lang === 'ru' ? 'Автобус и водитель — после графика' : 'Mașina și șoferul — după grafic');
    out.push(textPath(r, truncText(r, txt, 11.5, WW - 110), RX, wy + 40, 11.5, e.stare === 'anulat' ? '#b42318' : '#8A7A7D', 'end'));
  }
  // QR-ul (estompat dacă locul e urcat, ca pe site) și codul în grupe de câte 4
  const qr = await QRCode.toBuffer(b.cod_qr, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 600 });
  const qy = wy + 92;
  out.push(`<image x="${W / 2 - qrMarime / 2}" y="${qy}" width="${qrMarime}" height="${qrMarime}" opacity="${urcat ? 0.3 : 1}" href="data:image/png;base64,${qr.toString('base64')}"/>`);
  const cod = b.cod_qr.replace(/(.{4})(?=.)/g, '$1 ');
  out.push(textPath(bold, cod, W / 2, qy + qrMarime + 24, 13, '#4A3E41', 'middle'));
  const stare = urcat ? (lang === 'ru' ? 'посадка выполнена' : 'urcat') : (lang === 'ru' ? 'оплачено' : 'achitat');
  const rand = truncText(r, `${c.passenger_name} · ${Math.round(Number(c.price_per_seat))} MDL · ${stare}`, 12.5, WW - 30);
  out.push(textPath(r, rand, W / 2, qy + qrMarime + 48, 12.5, urcat ? '#6B5B5F' : '#1B7F3B', 'middle'));
  out.push(textPath(r, truncText(r, OPERATOR, 8.4, WW - 24), W / 2, qy + qrMarime + 70, 8.4, '#A0939A', 'middle'));
  out.push(textPath(r, IDNO, W / 2, qy + qrMarime + 82, 8.4, '#A0939A', 'middle'));
  // marginea zimțată: «mușcături» bordo pe muchia de jos a ferestrei
  const zy = wy + winH;
  for (let x = WX + 8; x < WX + WW; x += 16) out.push(`<circle cx="${x}" cy="${zy}" r="7" fill="${RED}"/>`);

  const H = zy + 26;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}" viewBox="0 0 ${W} ${H}">
<defs><filter id="alb"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter></defs>
<rect width="${W}" height="${H}" fill="${BG}"/>
<rect x="${CX}" y="14" width="${CW}" height="${H - 14 - 10}" rx="26" fill="${RED}"/>
${out.join('\n')}
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
