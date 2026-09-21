import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import {
  decideAlerts,
  marcheazaNetrimis,
  adaugaInJurnal,
  SKIP_CODES,
  type SkipCode,
  type SkipItem,
  type SkipLog,
  type SkipState,
  type ZiSkips,
} from '@/lib/tomberon-skip-alert';

// Foile pe care tomberon-sync (VPS) nu le-a putut trimite la terminal.
// Până acum astea trăiau doar în tomberon-sync.log pe VPS — pe 13.08.2026 patru
// curse (Trebisăuți/Tabani/Lipcani/Mărcăuți) au stat 9 zile fără f/parcurs
// fiindcă nimeni nu citea logul.
//
// Din 21.09 nu mai pleacă alertă în privatul adminilor (Ion: «nu am nevoie toate
// aceste să vină la mine»; regula: ce trebuie în Mejgorod — pleacă, ce nu —
// rămâne în bază). Foile netrimise nu-s treaba șoferilor, deci se scriu în
// `tomberon:skip_log` și se citesc la cerere — dar se SCRIU, altfel ne-am întors
// la logul de pe VPS pe care nu-l citea nimeni.
//
// NU e un cron Vercel (nu apare în vercel.json): e un webhook apelat de pe VPS
// la finalul fiecărei rulări a sync-ului, cu același CRON_SECRET ca restul.
// Body: { "zile": [{ "ziua": "YYYY-MM-DD", "skips": [{ foaie, sofer, cod, motiv }] }] }
// Zilele fără probleme se trimit cu listă goală — așa se resetează starea.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const STATE_KEY = 'tomberon:skip_state';
const LOG_KEY = 'tomberon:skip_log';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ZILE = 3; // sync-ul trimite azi + mâine
const MAX_SKIPS = 200; // o zi are ~45 de foi; mai mult înseamnă payload stricat

export async function POST(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  let body: { zile?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON invalid' }, { status: 400 });
  }

  if (!Array.isArray(body.zile) || body.zile.length > MAX_ZILE) {
    return NextResponse.json({ error: `Câmpul \`zile\` trebuie să fie listă de max ${MAX_ZILE} zile` }, { status: 400 });
  }

  const zile: ZiSkips[] = [];
  for (const raw of body.zile) {
    const z = (raw ?? {}) as Record<string, unknown>;
    if (typeof z.ziua !== 'string' || !DATE_RE.test(z.ziua)) {
      return NextResponse.json({ error: '`ziua` lipsește sau nu e YYYY-MM-DD' }, { status: 400 });
    }
    if (!Array.isArray(z.skips) || z.skips.length > MAX_SKIPS) {
      return NextResponse.json({ error: `\`skips\` trebuie să fie listă de max ${MAX_SKIPS}` }, { status: 400 });
    }
    const skips: SkipItem[] = z.skips.map((s) => {
      const r = (s ?? {}) as Record<string, unknown>;
      const cod = SKIP_CODES.includes(r.cod as SkipCode) ? (r.cod as SkipCode) : 'insert_esuat';
      return {
        foaie: String(r.foaie ?? '?').slice(0, 32),
        sofer: String(r.sofer ?? '?').slice(0, 80),
        cod,
        motiv: String(r.motiv ?? '?').slice(0, 160),
      };
    });
    zile.push({ ziua: z.ziua, skips });
  }

  const supabase = getSupabase();
  const acum = new Date();
  const { data: row } = await supabase.from('bot_storage').select('value').eq('key', STATE_KEY).maybeSingle();
  const prev = ((row as { value: SkipState | null } | null)?.value ?? null) as SkipState | null;

  const { alerts, state } = decideAlerts(prev, zile, acum.getTime());

  // Jurnalul ÎNAINTE de stare, și marcajul «consemnat» se păstrează doar dacă
  // scrierea a reușit: altfel o scriere căzută o dată ar marca problema drept
  // consemnată și faptul s-ar pierde definitiv — exact eșecul din 13.08.
  let consemnate = 0;
  let stareFinala: SkipState = state;
  if (alerts.length > 0) {
    const { data: logRow } = await supabase.from('bot_storage').select('value').eq('key', LOG_KEY).maybeSingle();
    const jurnal = adaugaInJurnal(
      ((logRow as { value: SkipLog | null } | null)?.value ?? null) as SkipLog | null,
      alerts,
      acum,
    );
    const { error: logErr } = await supabase.from('bot_storage').upsert(
      { key: LOG_KEY, value: jurnal, updated_at: acum.toISOString() },
      { onConflict: 'key' },
    );
    if (logErr) {
      console.error('tomberon-skips: jurnalul nu s-a salvat:', logErr.message);
      for (const alerta of alerts) stareFinala = marcheazaNetrimis(stareFinala, alerta);
    } else {
      consemnate = alerts.reduce((n, a) => n + a.items.length, 0);
    }
  }

  const { error: saveErr } = await supabase.from('bot_storage').upsert(
    { key: STATE_KEY, value: stareFinala, updated_at: acum.toISOString() },
    { onConflict: 'key' },
  );
  // Jurnalul e deja scris; dacă starea nu s-a salvat, rândul se rescrie peste
  // 10 min (același (zi, foaie, cod) → o intrare în plus) — spunem asta pe față.
  if (saveErr) console.error('tomberon-skips: salvarea stării a eșuat:', saveErr.message);

  return NextResponse.json({
    status: 'ok',
    primite: zile.reduce((n, z) => n + z.skips.length, 0),
    consemnate,
    stare_salvata: !saveErr,
  });
}
