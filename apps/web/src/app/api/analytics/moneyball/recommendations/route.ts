import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifySession } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-4-6';

type Body = {
  quarter: string;
  mode: 'overall' | 'pair';
  pairId?: number;
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

  const { quarter, mode, pairId } = body;
  if (!quarter || !mode) {
    return NextResponse.json({ error: 'quarter și mode sunt obligatorii' }, { status: 400 });
  }

  const supabase = getSupabase();

  let data;
  if (mode === 'pair' && pairId) {
    const { data: pair } = await supabase
      .from('v_moneyball_pair_recommendations')
      .select('*')
      .eq('pair_id', pairId)
      .single();
    data = pair;
  } else {
    // Overall — top 10 perechi cu rotații
    const { data: pairs } = await supabase
      .from('v_moneyball_pair_recommendations')
      .select(
        'pair_id, route_a_name, route_b_name, status, n_overlap, est_monthly_gain_lei, current_drivers, recommended_drivers'
      )
      .eq('quarter', quarter)
      .in('status', ['major_rotation', 'minor_rotation'])
      .order('est_monthly_gain_lei', { ascending: false, nullsFirst: false })
      .limit(10);
    data = pairs;
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return NextResponse.json({ error: 'Nu sunt date suficiente pentru analiză.' }, { status: 404 });
  }

  const systemPrompt = `Ești consultant Moneyball pentru TRANSLUX (transport interurban Moldova).
Analizezi alocarea șoferilor pe perechi de rute.

MODELUL DE ALOCARE:
- 2 rute formează o pereche (ex: Criva + Lipcani)
- 3 șoferi sunt dedicați fiecărei perechi (fiecare face ~20 zile/lună)
- Cei 3 șoferi rotesc între cele 2 rute ale perechii
- 60 zile-om/lună total acoperă pereche

CE ANALIZEZI:
- Cine conduce acum pe pereche (echipa actuală de 3)
- Cine ar trebui să conducă (echipa recomandată de 3, după scor combinat)
- Diferența = rotații de făcut

SCRII ÎN ROMÂNĂ, BUSINESS, CONCIS. Text curgător, nu tabel. Fără procente dacă nu sunt esențiale — descrii cu cuvinte.`;

  let userPrompt = '';
  if (mode === 'overall') {
    userPrompt = `Top rotații pe perechi de rute pentru ${quarter}:
${JSON.stringify(data, null, 2)}

Scrie în ~200 cuvinte:

1. **Top 3 perechi cu impact maxim** — pentru fiecare: cele 2 rute, schimbarea esențială (cine iese, cine intră), și impactul lunar estimat.

2. **Pattern-uri detectate** — sunt șoferi care apar în echipe recomandate pe mai multe perechi (talent rar, nu-i muta peste tot)? Sunt șoferi care nu apar în nicio echipă recomandată (posibile probleme)?

3. **Ordine de implementare** — care pereche să o schimbi prima, a doua, a treia. De ce.

Nume concrete. Evită generalitățile.`;
  } else {
    userPrompt = `Pereche specifică pentru ${quarter}:
${JSON.stringify(data, null, 2)}

Scrie în ~130 cuvinte:
1. Cine e echipa actuală, cât de bine lucrează global.
2. Ce schimbări propune algoritmul și de ce (cine iese, cine intră).
3. O recomandare concretă de acțiune: rotează acum / așteaptă / monitorizează.

Nume concrete. Dacă echipa e deja optimă, spune clar să nu atingă.`;
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
