import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';
import { poateAccesa } from '@/lib/lde/camioane-nav';
import { pozitiiLiveCached } from '@/lib/wialon';
import { normalizeazaPlaca } from '@/lib/lde/parc';
import { pozitieRecenta } from '@/lib/lde/camioane';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pozițiile live pentru harta din dispecerat. Se cheamă DOAR cât fila e deschisă
// (refresh 60s în client) — nu există polling de fundal.
export async function GET() {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
  if (!poateAccesa(session.role, '/lde/camioane')) {
    return NextResponse.json({ error: 'Acces interzis' }, { status: 403 });
  }

  try {
    // Wialon întoarce TOATĂ flota (autobuze, mașini de uzină). Dispeceratul are
    // voie doar la camioane — filtrăm pe plăcuțele flotei înainte de răspuns
    // (security review 31.08, Medium #2).
    const [toate, { data: camioane }] = await Promise.all([
      pozitiiLiveCached(),
      getSupabase().from('vehicles').select('plate_number')
        .eq('active', true).eq('is_lde', true).contains('directions', ['camioane']),
    ]);
    const permise = new Set(
      ((camioane ?? []) as { plate_number: string }[]).map((v) => normalizeazaPlaca(v.plate_number)),
    );
    const aleFlotei = toate.filter((p) => permise.has(normalizeazaPlaca(p.plate)));
    // Regula «poziția e actuală 24h» stă în lib/lde/camioane.ts, lângă celelalte
    // praguri ale modulului, și e testată acolo (arch review 01.09).
    const acum = Date.now();
    const positions = aleFlotei.filter((p) => pozitieRecenta(p.at, acum));
    return NextResponse.json({
      positions,
      // Numărat față de FLOTĂ, nu față de ce a întors Wialon: un camion lipsă din
      // Wialon sau cu nume neinterpretabil nu apărea în niciun contor, iar textul
      // de pe ecran promitea totuși completitudine (arch review 01.09).
      totalFlota: permise.size,
      // Plăcuțe DISTINCTE, nu poziții: două unități Wialon redenumite spre aceeași
      // plăcuță ar fi făcut contorul negativ, iar avertismentul ar fi dispărut
      // tăcut (security review 01.09).
      faraPozitieRecenta: Math.max(
        0,
        permise.size - new Set(positions.map((p) => normalizeazaPlaca(p.plate))).size,
      ),
    });
  } catch (e) {
    // Tokenul lipsă sau Wialon căzut nu are voie să rupă dispeceratul: harta
    // rămâne goală, kanbanul (care nu depinde de GPS live) funcționează.
    // Mesajul furnizorului rămâne în loguri: în interfață scurgea nume de
    // variabile de mediu și coduri interne (security review 31.08).
    console.error('[camioane/pozitii]', e);
    return NextResponse.json({ error: 'GPS indisponibil', positions: [] }, { status: 503 });
  }
}
