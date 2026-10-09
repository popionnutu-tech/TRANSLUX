/**
 * Mesajul e-mail al biletului (ION-201), PUR: fără rețea, fără bază — testat în email-mesaj.test.ts.
 * HTML pe tabele (clienții de e-mail nu citesc CSS modern), QR-urile ca imagini inline (`cid:`), text simplu alături.
 */

export interface DateEmail {
  cod: string;
  lang: 'ro' | 'ru';
  from_name: string;
  to_name: string;
  departure_at: string;
  seats: number;
  total: number;
  passenger_name: string;
  ruta: string | null;
  /** Câte un loc: numărul și codul QR (textul codului apare și sub imagine). */
  bilete: Array<{ nr: number; cod_qr: string }>;
  /** ION-235: numărul comenzii (primele 8 caractere ale id-ului) și momentul plății. */
  numar?: string;
  platit_la?: string | null;
  /** Comandă de probă (migr. 532): subiectul și capul mesajului spun «BILET DE PROBĂ — NU E VALABIL LA URCARE». */
  proba?: boolean;
}

export interface MesajEmail {
  subiect: string;
  html: string;
  text: string;
  /** content_id-urile imaginilor QR, în ordinea biletelor: `qr-<nr>`. */
  qrIds: string[];
}

/** ION-235 (cerințele maib): comerciantul și site-ul în confirmare. Aceleași date ca OPERATOR de pe site. */
export const COMERCIANT_SCURT = 'TRANSLUX · S.R.L. „Parcul de Autobuze și Taximetre nr. 9 din Briceni” · IDNO 1003604001469';
export const COMERCIANT = 'S.R.L. „Parcul de Autobuze și Taximetre nr. 9 din Briceni”, IDNO 1003604001469, MD-4701, or. Briceni, str. Olimpică 3 · translux.md';

const T = {
  ro: {
    subiect: (de: string, spre: string, cand: string) => `Biletul tău TRANSLUX: ${de} → ${spre}, ${cand}`,
    salut: (n: string) => `Bună, ${n}!`,
    intro: 'Plata a trecut. Mai jos e biletul tău: arată codul QR șoferului la urcare. Fiecare cod e un loc.',
    proba: 'BILET DE PROBĂ — NU E VALABIL LA URCARE', probaScurt: 'PROBĂ',
    comanda: 'Comanda nr.', platita: 'Plătită', cursa: 'Cursa', pasager: 'Pasager', locuri: 'Locuri', total: 'Total', loc: 'Loc',
    deschide: 'Deschide biletul pe site', telegram: '📍 Vezi biletul și autobuzul tău în Telegram',
    retur: 'Returnarea se cere prin botul nostru din Telegram sau la telefon +373 60 401 010: integral cu peste 24 de ore înainte de plecare, apoi tot mai puțin; cu mai puțin de 4 ore nu se restituie. Detalii: translux.md/ro/conditii-vanzare.',
    semnatura: 'TRANSLUX · +373 60 401 010',
    nuRaspunde: 'Acest e-mail e trimis automat, nu răspunde la el. Întrebări: +373 60 401 010 sau botul nostru din Telegram.',
  },
  ru: {
    subiect: (de: string, spre: string, cand: string) => `Ваш билет TRANSLUX: ${de} → ${spre}, ${cand}`,
    salut: (n: string) => `Здравствуйте, ${n}!`,
    intro: 'Оплата прошла. Ниже ваш билет: покажите QR-код водителю при посадке. Каждый код — одно место.',
    proba: 'ТЕСТОВЫЙ БИЛЕТ — НЕ ДЕЙСТВИТЕЛЕН ДЛЯ ПОСАДКИ', probaScurt: 'ТЕСТ',
    comanda: 'Заказ №', platita: 'Оплачен', cursa: 'Рейс', pasager: 'Пассажир', locuri: 'Мест', total: 'Итого', loc: 'Место',
    deschide: 'Открыть билет на сайте', telegram: '📍 Билет и ваш автобус в Telegram',
    retur: 'Возврат — через наш бот в Telegram или по телефону +373 60 401 010: полностью более чем за 24 часа до отправления, затем меньше; менее чем за 4 часа не возвращается. Подробно: translux.md/ru/conditii-vanzare.',
    semnatura: 'TRANSLUX · +373 60 401 010',
    nuRaspunde: 'Это письмо отправлено автоматически, не отвечайте на него. Вопросы: +373 60 401 010 или наш бот в Telegram.',
  },
} as const;

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function dataOraChisinau(iso: string, lang: 'ro' | 'ru'): string {
  return new Date(iso).toLocaleString(lang === 'ru' ? 'ru-RU' : 'ro-RO', {
    timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function construiesteMesaj(d: DateEmail, opt: { bazaSite: string; bot: string }): MesajEmail {
  const t = T[d.lang === 'ru' ? 'ru' : 'ro'];
  const lang = d.lang === 'ru' ? 'ru' : 'ro';
  const cand = dataOraChisinau(d.departure_at, lang);
  const urlBilet = `${opt.bazaSite.replace(/\/+$/, '')}/${lang}/bilet/${d.cod}`;
  const urlTg = `https://t.me/${opt.bot}?start=bilet_${d.cod}`;
  const prenume = d.passenger_name.trim().split(/\s+/).slice(1).join(' ') || d.passenger_name.trim();
  const qrIds = d.bilete.map((b) => `qr-${b.nr}`);
  const RED = '#9B1B30';

  const randuri = [
    ...(d.numar ? [[t.comanda, d.numar]] : []),
    [t.cursa, `${d.from_name} → ${d.to_name}${d.ruta ? ` (${d.ruta})` : ''}`],
    ['', cand],
    [t.pasager, d.passenger_name],
    [t.locuri, String(d.seats)],
    [t.total, `${Number(d.total).toFixed(2)} MDL`],
    ...(d.platit_la ? [[t.platita, dataOraChisinau(d.platit_la, lang)]] : []),
  ];

  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;padding:0;background:#f4f1f1;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f1;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#222;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:24px;">
${d.proba ? `<tr><td style="background:#b91c1c;color:#fff;font-weight:bold;text-align:center;padding:10px;border-radius:8px;">${esc(t.proba)}</td></tr>` : ''}
<tr><td style="font-size:20px;font-weight:bold;color:${RED};padding-bottom:8px;">TRANSLUX</td></tr>
<tr><td style="font-size:16px;padding-bottom:6px;">${esc(t.salut(prenume))}</td></tr>
<tr><td style="font-size:14px;color:#555;padding-bottom:16px;">${esc(t.intro)}</td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
${randuri.map(([k, v]) => `<tr><td style="color:#888;padding:3px 10px 3px 0;white-space:nowrap;">${esc(k)}</td><td style="padding:3px 0;${k === '' ? `font-size:18px;font-weight:bold;color:${RED};` : ''}">${esc(v)}</td></tr>`).join('\n')}
</table></td></tr>
${d.bilete.map((b, i) => `<tr><td align="center" style="padding:18px 0 6px;border-top:1px solid #eee;">
${d.ruta ? `<div style="font-size:12px;color:#888;">${esc(d.ruta)}</div>` : ''}
<div style="font-size:16px;font-weight:bold;color:#222;">${esc(d.from_name)} → ${esc(d.to_name)}</div>
<div style="font-size:13px;font-weight:bold;color:${RED};">${esc(cand)}</div>
<div style="font-size:12px;color:#888;">${esc(t.loc)} ${b.nr}/${d.seats}</div>
<div style="font-size:11px;color:#999;">${esc(COMERCIANT_SCURT)}</div>
<img src="cid:${qrIds[i]}" width="220" height="220" alt="QR ${esc(b.cod_qr)}" style="display:block;margin:8px auto;width:220px;height:220px;">
<div style="font-family:'Courier New',monospace;font-size:14px;letter-spacing:1px;">${esc(b.cod_qr)}</div>
</td></tr>`).join('\n')}
<tr><td align="center" style="padding:18px 0 6px;">
<a href="${esc(urlBilet)}" style="display:inline-block;background:${RED};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px;">${esc(t.deschide)}</a>
</td></tr>
<tr><td align="center" style="padding:6px 0 12px;">
<a href="${esc(urlTg)}" style="display:inline-block;background:#229ED9;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px;">${esc(t.telegram)}</a>
</td></tr>
<tr><td style="font-size:12px;color:#888;padding-top:8px;">${esc(t.retur)}</td></tr>
<tr><td style="font-size:12px;color:#888;padding-top:8px;">${esc(t.semnatura)}</td></tr>
<tr><td style="font-size:11px;color:#888;padding-top:4px;">${esc(COMERCIANT)}</td></tr>
<tr><td style="font-size:11px;color:#aaa;padding-top:8px;">${esc(t.nuRaspunde)}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    ...(d.proba ? [t.proba, ''] : []),
    t.salut(prenume),
    '',
    t.intro,
    '',
    `${t.cursa}: ${d.from_name} → ${d.to_name}${d.ruta ? ` (${d.ruta})` : ''}`,
    cand,
    `${t.pasager}: ${d.passenger_name}`,
    ...(d.numar ? [`${t.comanda} ${d.numar}`] : []),
    `${t.locuri}: ${d.seats} · ${t.total}: ${Number(d.total).toFixed(2)} MDL`,
    ...(d.platit_la ? [`${t.platita}: ${dataOraChisinau(d.platit_la, lang)}`] : []),
    '',
    ...d.bilete.map((b) => `${t.loc} ${b.nr}/${d.seats} · ${d.from_name} → ${d.to_name}, ${cand}: ${b.cod_qr}`),
    '',
    `${t.deschide}: ${urlBilet}`,
    `${t.telegram}: ${urlTg}`,
    '',
    t.retur,
    t.semnatura,
    COMERCIANT,
    t.nuRaspunde,
  ].join('\n');

  return { subiect: `${d.proba ? `[${t.probaScurt}] ` : ''}${t.subiect(d.from_name, d.to_name, cand)}`, html, text, qrIds };
}
