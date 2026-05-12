import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifySession } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-4-6';

type Body = {
  quarter: string;
  mode: 'overall' | 'group';
  groupId?: number;
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

  const { quarter, mode, groupId } = body;
  if (!quarter || !mode) {
    return NextResponse.json({ error: 'quarter și mode sunt obligatorii' }, { status: 400 });
  }

  const supabase = getSupabase();

  let data;
  if (mode === 'group' && groupId) {
    const { data: grp } = await supabase
      .from('v_moneyball_group_recommendations')
      .select('*')
      .eq('group_id', groupId)
      .single();
    data = grp;
  } else {
    const { data: groups } = await supabase
      .from('v_moneyball_group_recommendations')
      .select(
        'group_id, label, group_type, shift, n_routes, required_total_drivers, status, n_overlap, est_monthly_gain_lei, current_drivers, recommended_drivers, routes'
      )
      .eq('quarter', quarter)
      .in('status', ['major_rotation', 'minor_rotation'])
      .order('est_monthly_gain_lei', { ascending: false, nullsFirst: false })
      .limit(8);
    data = groups;
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return NextResponse.json({ error: 'Nu sunt date suficiente pentru analiză.' }, { status: 404 });
  }

  const systemPrompt = `Ești consultant Moneyball pentru TRANSLUX (transport interurban Moldova).
Analizezi alocarea șoferilor pe grupuri operaționale de rute.

MODELUL DE ALOCARE:
- Rutele sunt grupate operațional după orar și overlap stații (Briceni/Ocnița/Edineț)
- Tipuri grupuri: day-trip (5 rute, 7 șoferi = 5 bază + 2 rezervă), pereche (2 rute, 3 șoferi), triplet (3 rute, 5 șoferi), singleton (1 rută, 2 șoferi)
- Fiecare șofer face ~20 zile/lună
- Șoferii din grup rotesc între rutele grupului

CE ANALIZEZI:
- Echipa actuală (cine conduce cel mai des pe rutele grupului)
- Echipa recomandată (cei mai buni vânzători pentru grupul respectiv)
- Rotații = diferențe între cele 2 echipe

SCRII ÎN ROMÂNĂ, BUSINESS, CONCIS. Text curgător (nu bullet-uri decât dacă ceri). Fără procente dacă nu sunt esențiale — folosește cuvinte ("vinde sub normă", "excelent").`;

  let userPrompt = '';
  if (mode === 'overall') {
    userPrompt = `Grupuri cu rotații recomandate pentru ${quarter}:
${JSON.stringify(data, null, 2)}

Scrie un mini-raport strategic în ~200 cuvinte care include:

1. **Top 3 grupuri cu impact maxim** — pentru fiecare: ce grup, ce schimbare concretă (nume în nume), impact lunar.

2. **Pattern-uri detectate** — șoferi care apar în echipele recomandate pe mai multe grupuri (talent rar de distribuit atent), sau care nu apar nicăieri (posibile probleme).

3. **Ordine de implementare** — cu ce să începi, de ce. Ia în calcul: tipurile de grup (day-trip / pereche / triplet), câți șoferi trebuie schimbați per grup, efectul asupra program-ului operațional.

Nume concrete. Fără generalități.`;
  } else {
    userPrompt = `Grup specific pentru ${quarter}:
${JSON.stringify(data, null, 2)}

Scrie în ~150 cuvinte:
1. Ce face acest grup (tipul, câte rute, câți șoferi necesari), cât de bine lucrează echipa actuală.
2. Ce schimbări propune algoritmul — cine iese, cine intră, cine rămâne.
3. Recomandare concretă: rotește acum / așteaptă date / monitorizează.

Nume concrete. Dacă echipa e deja optimă, spune clar să nu atingă.`;
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 800,
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
