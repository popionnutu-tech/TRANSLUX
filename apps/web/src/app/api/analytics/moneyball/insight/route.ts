import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifySession } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-4-6';

type InsightInput = {
  driverId: string;
  quarter: string;
};

export async function POST(req: Request) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY nu e configurat.' },
      { status: 500 }
    );
  }

  let body: InsightInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { driverId, quarter } = body;
  if (!driverId || !quarter) {
    return NextResponse.json(
      { error: 'driverId și quarter sunt obligatorii' },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  const [{ data: driver }, { data: totals }, { data: routes }, { data: worstSegs }] =
    await Promise.all([
      supabase.from('drivers').select('full_name').eq('id', driverId).single(),
      supabase
        .from('v_moneyball_driver_totals')
        .select('*')
        .eq('driver_id', driverId)
        .eq('quarter', quarter)
        .maybeSingle(),
      supabase
        .from('v_moneyball_ranking')
        .select('route_name, avg_deviation_pct, n_trips, vorp_lei')
        .eq('driver_id', driverId)
        .eq('quarter', quarter)
        .order('avg_deviation_pct', { ascending: false }),
      supabase
        .from('v_moneyball_segments')
        .select('stop_name, direction, avg_deviation_pct, n_trips')
        .eq('driver_id', driverId)
        .eq('quarter', quarter)
        .gte('n_trips', 2)
        .order('avg_deviation_pct', { ascending: true })
        .limit(5),
    ]);

  if (!driver || !totals) {
    return NextResponse.json(
      { error: 'Șofer fără date în trimestrul ales' },
      { status: 404 }
    );
  }

  const dataContext = {
    nume: driver.full_name,
    trimestru: quarter,
    scor_mediu_pct: totals.weighted_avg_deviation_pct,
    total_curse: totals.total_trips,
    total_lei: totals.total_lei,
    vorp_lei: totals.vorp_total,
    rute_performante: (routes ?? []).slice(0, 3).map((r) => ({
      ruta: r.route_name,
      scor: r.avg_deviation_pct,
      curse: r.n_trips,
      vorp: r.vorp_lei,
    })),
    rute_slabe: (routes ?? [])
      .slice(-3)
      .reverse()
      .map((r) => ({
        ruta: r.route_name,
        scor: r.avg_deviation_pct,
        curse: r.n_trips,
        vorp: r.vorp_lei,
      })),
    portiuni_problema: (worstSegs ?? []).map((s) => ({
      statie: s.stop_name,
      directie: s.direction,
      scor: s.avg_deviation_pct,
      curse: s.n_trips,
    })),
  };

  const systemPrompt = `Ești analist de business pentru TRANSLUX (companie de transport interurban din Moldova). Analizezi performanța șoferilor ca vânzători (ei încasează bani, umplu rutierele — motivarea lor vine din comision pe suma încasată).

Filozofia de analiză e Moneyball: compari deviația procentuală a șoferului față de norma contextului (rută × trimestru × zi-a-săptămânii × capacitate), NU cifrele absolute. Comparația e măr-cu-măr: luni cu luni, marți cu marți etc.

Scrii în română, business, concis (3-5 propoziții). Nu speculezi despre CAUZE — doar descrii pattern-urile observate în date. Nu folosești liste/bullet-uri — text curgător.`;

  const userPrompt = `Date pentru ${driver.full_name} (${quarter}):

${JSON.stringify(dataContext, null, 2)}

Scrie un mini-raport de analist în 3-5 propoziții. Include:
1. Poziționarea generală (bun/mediu/slab vânzător în acest trimestru)
2. Pattern-ul pe rute (dacă există: bun pe unele, slab pe altele = candidat pentru rotație)
3. Porțiunile specifice-problemă (dacă sunt relevante)
4. O recomandare concretă (mutare pe anumite rute / coaching / bonus / altceva)`;

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('\n');

    return NextResponse.json({ insight: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Eroare necunoscută';
    return NextResponse.json({ error: `Claude API: ${msg}` }, { status: 500 });
  }
}
