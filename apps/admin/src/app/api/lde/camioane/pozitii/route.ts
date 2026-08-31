import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';
import { poateAccesa } from '@/lib/lde/camioane-nav';
import { pozitiiLiveCached } from '@/lib/wialon';
import { normalizeazaPlaca } from '@/lib/lde/parc';

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
    const positions = toate.filter((p) => permise.has(normalizeazaPlaca(p.plate)));
    return NextResponse.json({ positions });
  } catch (e) {
    // Tokenul lipsă sau Wialon căzut nu are voie să rupă dispeceratul: harta
    // rămâne goală, kanbanul (care nu depinde de GPS live) funcționează.
    // Mesajul furnizorului rămâne în loguri: în interfață scurgea nume de
    // variabile de mediu și coduri interne (security review 31.08).
    console.error('[camioane/pozitii]', e);
    return NextResponse.json({ error: 'GPS indisponibil', positions: [] }, { status: 503 });
  }
}
