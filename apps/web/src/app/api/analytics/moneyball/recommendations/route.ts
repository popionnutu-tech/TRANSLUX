import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifySession } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-4-6';

type Body = {
  quarter: string;
  mode: 'overall' | 'route';
  crmRouteId?: number;
};

export async function POST(req: Request) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY nu e configurat.' }, { status: 500 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { quarter, mode, crmRouteId } = body;
  if (!quarter || !mode) {
    return NextResponse.json({ error: 'quarter și mode sunt obligatorii' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Culege datele
  let recommendations;
  if (mode === 'route' && crmRouteId) {
    // Pentru o singură rută — toți șoferii pe ea
    const { data } = await supabase
      .from('v_moneyball_ranking')
      .select('driver_name, avg_deviation_pct, n_trips, vorp_lei, total_lei_actual')
      .eq('crm_route_id', crmRouteId)
      .eq('quarter', quarter)
      .order('avg_deviation_pct', { ascending: false });
    recommendations = data;
  } else {
    // Summary general — top 15 rotații cu câștig max
    const { data } = await supabase
      .from('v_moneyball_recommendations')
      .select(
        'route_name, current_driver_name, current_score, current_trips, best_driver_name, best_score, best_trips, current_is_best, est_monthly_gain_lei'
      )
      .eq('quarter', quarter)
      .order('est_monthly_gain_lei', { ascending: false, nullsFirst: false })
      .limit(15);
    recommendations = data;
  }

  if (!recommendations || recommendations.length === 0) {
    return NextResponse.json(
      { error: 'Nu sunt date suficiente pentru analiză.' },
      { status: 404 }
    );
  }

  // Prompt Claude
  const systemPrompt = `Ești consultant Moneyball pentru TRANSLUX (transport interurban Moldova).
Analizezi alocarea șoferilor pe rute: cine e pe rută acum vs cine ar trebui să fie pe baza performanței.

IPOTEZE DE CALCUL:
- Șofer stabil = 18-22 zile/lună pe aceeași rută (folosim 20 în estimări)
- Deviația procentuală (dev) = cât de mult diferă șoferul de norma contextului (aceeași rută × zi săptămână × capacitate × trimestru)
- VORP = lei câștigat/pierdut per cursă față de șoferul mediu pe aceleași curse
- "Câștig estimat" = (VORP/cursă șofer recomandat - VORP/cursă șofer curent) × 20 curse/lună

SCRII ÎN ROMÂNĂ, BUSINESS, CONCIS. Nu folosești bullet-uri decât dacă ceri numeric. Text curgător clar.`;

  let userPrompt = '';
  if (mode === 'overall') {
    userPrompt = `Datele pentru trimestrul ${quarter} — top rotații posibile:
${JSON.stringify(recommendations, null, 2)}

Scrie un mini-raport strategic în ~200 cuvinte care include:

1. **Top 3 rotații cu cel mai mare impact** — pentru fiecare: ruta, cine să pună în locul cui, câștig lunar estimat.

2. **Pattern-uri relevante** — sunt șoferi care apar de mai multe ori ca „current" slab? Sunt șoferi care apar de mai multe ori ca „best"? Talent ascuns sau probleme sistemice?

3. **Recomandare implementare** — când merită făcută rotația (prag minim de câștig), cum să comunici cu șoferii afectați.

Folosește cifre concrete. Evită generalități.`;
  } else {
    userPrompt = `Toți șoferii care au condus pe această rută în ${quarter}:
${JSON.stringify(recommendations, null, 2)}

Scrie în ~150 cuvinte:
1. Cine e cel mai bun vânzător pe această rută (nume + de ce).
2. Cine ar trebui mutat de pe ea (dacă e cazul).
3. Dacă rezultatele sunt aproape egale, recomandă păstrarea șoferilor actuali.

Fii specific cu nume și cifre.`;
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('\n');

    return NextResponse.json({ recommendation: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Eroare necunoscută';
    return NextResponse.json({ error: `Claude API: ${msg}` }, { status: 500 });
  }
}
