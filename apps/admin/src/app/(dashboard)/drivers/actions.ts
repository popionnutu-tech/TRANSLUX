'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { normalizeDriverPhone, type Driver } from '@translux/db';

export async function getDrivers(): Promise<Driver[]> {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const { data } = await getSupabase()
    .from('drivers')
    .select('*')
    .eq('is_lde', false) // autoparcul LDE se gestionează în /lde/soferi, nu aici
    .order('full_name');
  return (data || []) as Driver[];
}

export async function createDriver(fullName: string, phone: string) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const trimmed = fullName.trim();
  if (!trimmed) throw new Error('Numele șoferului este obligatoriu');
  if (trimmed.split(/\s+/).length < 2) {
    throw new Error('Introduceți numele complet (prenume + familie)');
  }

  const row = { full_name: trimmed, phone: normalizeDriverPhone(phone) };

  const { error } = await getSupabase().from('drivers').insert(row);
  if (error) throw new Error(error.message);
  revalidatePath('/drivers');
}

export async function updateDriverPhone(driverId: string, phone: string) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');

  const { error } = await getSupabase()
    .from('drivers')
    .update({ phone: normalizeDriverPhone(phone) })
    .eq('id', driverId);

  if (error) throw new Error(error.message);
  revalidatePath('/drivers');
}

export async function updateDriverName(driverId: string, fullName: string) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const trimmed = fullName.trim();
  if (!trimmed) throw new Error('Numele șoferului este obligatoriu');
  if (trimmed.split(/\s+/).length < 2) {
    throw new Error('Introduceți numele complet (prenume + familie)');
  }

  const { error } = await getSupabase()
    .from('drivers')
    .update({ full_name: trimmed })
    .eq('id', driverId);

  if (error) throw new Error(error.message);
  revalidatePath('/drivers');
}

export async function toggleDriver(id: string, active: boolean) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');

  // Reactivarea e singura poartă prin care un șofer fără telefon se putea întoarce în
  // pickere: trigger-ele din 254/256 prind doar adăugarea, iar un șofer vechi
  // dezactivat (ex. «Oglasevici A.») putea reveni cu un click și ascunde iar cursa.
  if (active) {
    const { data, error } = await getSupabase()
      .from('drivers').select('full_name, phone, is_lde').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (data && !data.is_lde && !data.phone?.trim()) {
      throw new Error(`${data.full_name} n-are telefon — completează-l înainte de a-l reactiva, altfel cursele lui nu apar pe translux.md`);
    }
  }

  await getSupabase().from('drivers').update({ active }).eq('id', id);
  revalidatePath('/drivers');
}

export async function deleteDriver(id: string) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const { error } = await getSupabase().from('drivers').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/drivers');
}

export async function updateDriverDirections(id: string, directions: string[]) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const clean = [...new Set((directions || []).filter((d) => typeof d === 'string' && d.length))];
  const sb = getSupabase();

  // Uzina unui șofer trăiește în două locuri: `directions` (pickerul din grafic) și
  // `lde_driver_extras.uzina_id` (salarii). /lde/soferi și /lde/parc le scriu pe
  // amândouă; dacă pagina asta ar scrie doar `directions`, ar reface exact
  // desincronizarea închisă pe 17.08 (erau 10 șoferi rupți).
  const { data: uzine, error: uErr } = await sb.from('lde_uzine').select('id');
  if (uErr) throw new Error(uErr.message);
  const uzinaIds = new Set((uzine ?? []).map((u) => u.id as string));
  const alese = clean.filter((d) => uzinaIds.has(d));
  // modelul dă o singură uzină per șofer (migr. 217 + o singură coloană în extras);
  // mașinile pot avea mai multe, șoferii nu
  if (alese.length > 1) {
    throw new Error('Un șofer poate aparține unei singure uzine — alege doar una.');
  }

  const { error } = await sb.from('drivers').update({ directions: clean }).eq('id', id);
  if (error) throw new Error(error.message);

  if (alese.length === 1) {
    const { error: eEx } = await sb.from('lde_driver_extras')
      .upsert({ driver_id: id, uzina_id: alese[0] }, { onConflict: 'driver_id' });
    if (eEx) throw new Error(eEx.message);
  } else {
    // uzina a fost scoasă — golim și extras, dar NU creăm rând nou pentru
    // șoferii de interurban/suburban care n-au avut niciodată unul
    const { data: existent } = await sb.from('lde_driver_extras')
      .select('driver_id').eq('driver_id', id).maybeSingle();
    if (existent) {
      const { error: eEx } = await sb.from('lde_driver_extras')
        .update({ uzina_id: null }).eq('driver_id', id);
      if (eEx) throw new Error(eEx.message);
    }
  }

  revalidatePath('/drivers');
}
