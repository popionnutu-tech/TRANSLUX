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
}

export interface MesajEmail {
  subiect: string;
  html: string;
  text: string;
  /** content_id-urile imaginilor QR, în ordinea biletelor: `qr-<nr>`. */
  qrIds: string[];
}

const T = {
  ro: {
    subiect: (de: string, spre: string, cand: string) => `Biletul tău TRANSLUX: ${de} → ${spre}, ${cand}`,
    salut: (n: string) => `Bună, ${n}!`,
    intro: 'Plata a trecut. Mai jos e biletul tău: arată codul QR șoferului la urcare. Fiecare cod e un loc.',
    cursa: 'Cursa', pasager: 'Pasager', locuri: 'Locuri', total: 'Total', loc: 'Loc',
    deschide: 'Deschide biletul pe site', telegram: '📍 Vezi biletul și autobuzul tău în Telegram',
    retur: 'Returnarea biletului se cere prin botul nostru din Telegram. Întârzierea la cursă nu se returnează.',
    semnatura: 'TRANSLUX · +373 60 401 010',
    nuRaspunde: 'Acest e-mail e trimis automat, nu răspunde la el. Întrebări: +373 60 401 010 sau botul nostru din Telegram.',
  },
  ru: {
    subiect: (de: string, spre: string, cand: string) => `Ваш билет TRANSLUX: ${de} → ${spre}, ${cand}`,
    salut: (n: string) => `Здравствуйте, ${n}!`,
    intro: 'Оплата прошла. Ниже ваш билет: покажите QR-код водителю при посадке. Каждый код — одно место.',
    cursa: 'Рейс', pasager: 'Пассажир', locuri: 'Мест', total: 'Итого', loc: 'Место',
    deschide: 'Открыть билет на сайте', telegram: '📍 Билет и ваш автобус в Telegram',
    retur: 'Возврат билета оформляется через наш бот в Telegram. Опоздание на рейс не возвращается.',
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
    [t.cursa, `${d.from_name} → ${d.to_name}${d.ruta ? ` (${d.ruta})` : ''}`],
    ['', cand],
    [t.pasager, d.passenger_name],
    [t.locuri, String(d.seats)],
    [t.total, `${Number(d.total).toFixed(2)} lei`],
  ];

  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;padding:0;background:#f4f1f1;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f1;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#222;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:24px;">
<tr><td style="font-size:20px;font-weight:bold;color:${RED};padding-bottom:8px;">TRANSLUX</td></tr>
<tr><td style="font-size:16px;padding-bottom:6px;">${esc(t.salut(prenume))}</td></tr>
<tr><td style="font-size:14px;color:#555;padding-bottom:16px;">${esc(t.intro)}</td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
${randuri.map(([k, v]) => `<tr><td style="color:#888;padding:3px 10px 3px 0;white-space:nowrap;">${esc(k)}</td><td style="padding:3px 0;${k === '' ? `font-size:18px;font-weight:bold;color:${RED};` : ''}">${esc(v)}</td></tr>`).join('\n')}
</table></td></tr>
${d.bilete.map((b, i) => `<tr><td align="center" style="padding:18px 0 6px;border-top:1px solid #eee;">
<div style="font-size:12px;color:#888;">${esc(t.loc)} ${b.nr}/${d.seats}</div>
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
<tr><td style="font-size:11px;color:#aaa;padding-top:8px;">${esc(t.nuRaspunde)}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    t.salut(prenume),
    '',
    t.intro,
    '',
    `${t.cursa}: ${d.from_name} → ${d.to_name}${d.ruta ? ` (${d.ruta})` : ''}`,
    cand,
    `${t.pasager}: ${d.passenger_name}`,
    `${t.locuri}: ${d.seats} · ${t.total}: ${Number(d.total).toFixed(2)} lei`,
    '',
    ...d.bilete.map((b) => `${t.loc} ${b.nr}/${d.seats}: ${b.cod_qr}`),
    '',
    `${t.deschide}: ${urlBilet}`,
    `${t.telegram}: ${urlTg}`,
    '',
    t.retur,
    t.semnatura,
    t.nuRaspunde,
  ].join('\n');

  return { subiect: t.subiect(d.from_name, d.to_name, cand), html, text, qrIds };
}
