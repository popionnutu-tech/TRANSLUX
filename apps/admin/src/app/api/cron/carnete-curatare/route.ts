import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Curățarea verificărilor de student (migr. 544, plan pas 5/8): pozele din bucketul privat «carnete-studenti» și numele
// se golesc la 90 de zile; poza actului de identitate a verificărilor neacceptate, la 30 de zile. Rândul rămâne (verdictul,
// hash-ul carnetului) pentru limita de 4 locuri/7 zile și pentru «un carnet = un telefon». Pornit de GitHub Actions
// (bilete-carnete.yml) la 03:30 UTC: Vercel Hobby n-are sloturi de cron libere.

const BUCKET = 'carnete-studenti';
const LOT = 200;

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const db = getSupabase();
  const zi = 86_400_000;
  const raport = { sterse_vechi: 0, acte_sterse: 0, ramase_cu_poze_vechi: 0 };

  // 1. > 90 de zile: toate pozele + numele
  const { data: vechi, error: e1 } = await db.from('bilete_studenti_verificari').select('id, poza_carnet, poza_act')
    .lt('created_at', new Date(Date.now() - 90 * zi).toISOString())
    .or('poza_carnet.not.is.null,poza_act.not.is.null,nume_carnet.not.is.null').limit(LOT);
  if (e1) return NextResponse.json({ ok: false, eroare: e1.message }, { status: 500 });
  for (const v of (vechi || []) as Array<{ id: string; poza_carnet: string | null; poza_act: string | null }>) {
    const cai = [v.poza_carnet, v.poza_act].filter((x): x is string => Boolean(x));
    if (cai.length) { const { error } = await db.storage.from(BUCKET).remove(cai); if (error) continue; }
    await db.from('bilete_studenti_verificari').update({ poza_carnet: null, poza_act: null, nume_carnet: null, nume_pasager: '—', motive: {} }).eq('id', v.id);
    raport.sterse_vechi += 1;
  }

  // 2. > 30 de zile, neacceptate: poza actului (cea acceptată e ștearsă deja la verificare)
  const { data: acte } = await db.from('bilete_studenti_verificari').select('id, poza_act')
    .lt('created_at', new Date(Date.now() - 30 * zi).toISOString()).not('poza_act', 'is', null).limit(LOT);
  for (const v of (acte || []) as Array<{ id: string; poza_act: string }>) {
    const { error } = await db.storage.from(BUCKET).remove([v.poza_act]);
    if (error) continue;
    await db.from('bilete_studenti_verificari').update({ poza_act: null }).eq('id', v.id);
    raport.acte_sterse += 1;
  }

  // 3. Controlul: ce a rămas peste termen (lotul n-a ajuns sau Storage a refuzat)
  const { count } = await db.from('bilete_studenti_verificari').select('id', { count: 'exact', head: true })
    .lt('created_at', new Date(Date.now() - 90 * zi).toISOString()).not('poza_carnet', 'is', null);
  raport.ramase_cu_poze_vechi = count ?? 0;
  return NextResponse.json({ ok: true, ...raport });
}
