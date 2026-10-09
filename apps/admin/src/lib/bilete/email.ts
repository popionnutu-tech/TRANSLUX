import 'server-only';
import QRCode from 'qrcode';
import type { BileteComanda } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { construiesteMesaj } from './email-mesaj';

// Biletul pe e-mail după plată (ION-201). Ion, 03.10: «da, trebuie să se trimită și pe email».
// O trimitere = revendicare atomică în bază (bilete_email_revendica, migr. 489) → mesajul → Resend.
// Eșec → eliberare (se reia din împăcarea de la 10 min); după 3 încercări → alertă `email_esuat`, o dată.
// Fără RESEND_API_KEY nu se revendică nimic: comenzile rămân de trimis până se pune cheia.

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 8_000;

export function emailConfigurat(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export type RezultatEmail = 'trimis' | 'nimic' | 'neconfigurat' | 'esuat';

export async function trimiteEmailBilet(comandaId: string): Promise<RezultatEmail> {
  if (!emailConfigurat()) return 'neconfigurat';
  const db = getSupabase();
  const { data: rev, error: rErr } = await db.rpc('bilete_email_revendica', { p_id: comandaId });
  if (rErr) throw new Error(`revendicare: ${rErr.message}`);
  const c = (Array.isArray(rev) ? rev[0] : rev) as BileteComanda | undefined;
  if (!c) return 'nimic';

  try {
    const [{ data: bilete, error: bErr }, { data: ruta }] = await Promise.all([
      db.from('bilete').select('nr, loc_nr, cod_qr, status').eq('comanda_id', c.id).in('status', ['valid', 'urcat']).order('nr'),
      db.from('crm_routes').select('dest_from_ro, dest_from_ru, dest_to_ro, dest_to_ru').eq('id', c.crm_route_id).maybeSingle(),
    ]);
    if (bErr) throw new Error(`bilete: ${bErr.message}`);
    if (!bilete || bilete.length === 0) throw new Error('comanda plătită fără bilete');
    const lang: 'ro' | 'ru' = c.lang === 'ru' ? 'ru' : 'ro';
    const numeRuta = ruta
      ? (c.going_north ? (lang === 'ru' ? ruta.dest_to_ru : ruta.dest_to_ro) : (lang === 'ru' ? ruta.dest_from_ru : ruta.dest_from_ro))
      : null;

    const m = construiesteMesaj({
      cod: c.cod, lang, from_name: c.from_name, to_name: c.to_name, departure_at: c.departure_at, seats: c.seats,
      total: Number(c.total), passenger_name: c.passenger_name, ruta: numeRuta,
      numar: c.id.slice(0, 8).toUpperCase(), platit_la: c.paid_at, proba: c.test === true,
      bilete: bilete.map((b: { nr: number; loc_nr: number | null; cod_qr: string }) => ({ nr: b.nr, loc_nr: b.loc_nr, cod_qr: b.cod_qr })),
    }, {
      bazaSite: process.env.SITE_URL || 'https://translux.md',
      bot: process.env.NEXT_PUBLIC_BOT_USERNAME || 'TransluxMoldova_bot',
    });

    const atasamente = await Promise.all(bilete.map(async (b: { nr: number; cod_qr: string }, i: number) => ({
      filename: `bilet-${b.nr}.png`,
      content: (await QRCode.toBuffer(b.cod_qr, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 440 })).toString('base64'),
      content_id: m.qrIds[i],
    })));

    const r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        // Același mesaj nu pleacă de două ori, nici la o reîncercare după timeout (Resend ține cheia 24 h).
        'Idempotency-Key': `bilet-${c.id}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [c.email],
        subject: m.subiect,
        html: m.html,
        text: m.text,
        attachments: atasamente,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) {
      const corp = await r.text().catch(() => '');
      throw new Error(`Resend HTTP ${r.status}: ${corp.slice(0, 300)}`);
    }
    // ION-250: id-ul mesajului la Resend leagă evenimentele webhook-ului (respins, livrat) de această comandă.
    const trimis = await r.json().catch(() => null) as { id?: string } | null;
    await db.from('bilete_comenzi').update({ email_eroare: null, email_resend_id: trimis?.id ?? null }).eq('id', c.id);
    return 'trimis';
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error('[bilete/email]', c.id, mesaj);
    const { data: incercari } = await db.rpc('bilete_email_elibereaza', { p_id: c.id, p_eroare: mesaj });
    if (Number(incercari) >= 3) {
      const { data: exista } = await db.from('bilete_alerte').select('id').eq('comanda_id', c.id).eq('tip', 'email_esuat').limit(1);
      if (!exista || exista.length === 0) {
        await db.from('bilete_alerte').insert({ comanda_id: c.id, tip: 'email_esuat', detalii: `după 3 încercări: ${mesaj.slice(0, 300)}` });
      }
    }
    return 'esuat';
  }
}

/** Pentru callback-ul maib: comanda legată de sesiune → trimitere (după răspuns, prin after()). */
export async function trimiteEmailPentruCheckout(checkoutId: string): Promise<RezultatEmail> {
  if (!emailConfigurat()) return 'neconfigurat';
  const { data } = await getSupabase().from('bilete_comenzi').select('id').eq('checkout_id', checkoutId).maybeSingle();
  return data?.id ? trimiteEmailBilet(data.id) : 'nimic';
}

/**
 * ION-244 (corectura 6): când biletul se anulează din botul Telegram, cumpărătorul află și pe e-mail (dacă l-a lăsat) —
 * un link de bilet ajuns la altcineva nu se poate folosi pe tăcute. Cel mult o dată pe comandă; eșecul doar se jurnalizează.
 */
export async function trimiteEmailAnulare(comandaId: string, suma: number): Promise<RezultatEmail> {
  if (!emailConfigurat()) return 'neconfigurat';
  const { data: c } = await getSupabase().from('bilete_comenzi')
    .select('id, email, lang, from_name, to_name, departure_at').eq('id', comandaId).maybeSingle();
  if (!c?.email) return 'nimic';
  const ru = c.lang === 'ru';
  const cand = new Date(c.departure_at).toLocaleString(ru ? 'ru-RU' : 'ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const lei = suma.toFixed(2);
  const text = ru
    ? `Ваш билет TRANSLUX ${c.from_name} → ${c.to_name}, ${cand}, отменён по запросу из Telegram. Возврат: ${lei} лей на карту, с которой была оплата.\nЕсли это были не вы — позвоните +373 60 401 010.`
    : `Biletul tău TRANSLUX ${c.from_name} → ${c.to_name}, ${cand}, a fost anulat la cererea din Telegram. Returnare: ${lei} lei pe cardul cu care ai plătit.\nDacă nu ai cerut tu — sună la +373 60 401 010.`;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  try {
    const r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `anulare-${c.id}` },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM, to: [c.email],
        subject: ru ? 'Билет TRANSLUX отменён' : 'Biletul TRANSLUX a fost anulat',
        text, html: `<p>${esc(text).replace(/\n/g, '<br>')}</p>`,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) { console.warn('[bilete] e-mail anulare:', r.status); return 'esuat'; }
    return 'trimis';
  } catch (e) {
    console.warn('[bilete] e-mail anulare:', e instanceof Error ? e.message : e);
    return 'esuat';
  }
}
