import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import { alertAdmins } from '@/lib/telegram-notify';
import { decideAlerts, formatSkipAlert, type SkipItem, type SkipState } from '@/lib/tomberon-skip-alert';

// Foile pe care tomberon-sync (VPS) nu le-a putut trimite la terminal.
// Până acum astea trăiau doar în tomberon-sync.log pe VPS — pe 13.08.2026 patru
// curse (Trebisăuți/Tabani/Lipcani/Mărcăuți) au stat 9 zile fără f/parcurs
// fiindcă nimeni nu citea logul.
//
// Trigger: aceeași rulare de cron ca sync-ul, la final (*/10 5-23).
// Body: { "ziua": "YYYY-MM-DD", "skips": [{ "foaie", "sofer", "motiv" }] }
// Lista goală e normală și așteptată — resetează starea zilei.

export const dynamic = 'force-dynamic';

const STATE_KEY = 'tomberon:skip_state';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SKIPS = 200; // o zi are ~45 de foi; mai mult înseamnă payload stricat

export async function POST(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  let body: { ziua?: unknown; skips?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON invalid' }, { status: 400 });
  }

  const ziua = typeof body.ziua === 'string' && DATE_RE.test(body.ziua) ? body.ziua : null;
  if (!ziua) return NextResponse.json({ error: 'Câmpul `ziua` lipsește sau nu e YYYY-MM-DD' }, { status: 400 });
  if (!Array.isArray(body.skips)) return NextResponse.json({ error: 'Câmpul `skips` trebuie să fie listă' }, { status: 400 });
  if (body.skips.length > MAX_SKIPS) return NextResponse.json({ error: `Prea multe intrări (>${MAX_SKIPS})` }, { status: 400 });

  const skips: SkipItem[] = body.skips.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      foaie: String(r.foaie ?? '?').slice(0, 32),
      sofer: String(r.sofer ?? '?').slice(0, 80),
      motiv: String(r.motiv ?? '?').slice(0, 160),
    };
  });

  const supabase = getSupabase();
  const { data: row } = await supabase.from('bot_storage').select('value').eq('key', STATE_KEY).maybeSingle();
  const prev = ((row as { value: SkipState | null } | null)?.value ?? null) as SkipState | null;

  const { alerts, state } = decideAlerts(prev, ziua, skips, Date.now());
  if (alerts.length) await alertAdmins(formatSkipAlert(ziua, alerts));

  const { error: saveErr } = await supabase.from('bot_storage').upsert(
    { key: STATE_KEY, value: state, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  // Alerta a plecat deja; dacă starea nu s-a salvat, o repetăm peste 10 min — spunem asta pe față.
  if (saveErr) console.error('tomberon-skips: salvarea stării a eșuat:', saveErr.message);

  return NextResponse.json({ status: 'ok', primite: skips.length, alertate: alerts.length, stare_salvata: !saveErr });
}
