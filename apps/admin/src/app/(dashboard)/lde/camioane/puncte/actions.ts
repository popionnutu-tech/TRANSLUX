'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, type Session } from '@/lib/auth';
import { poateAccesa } from '@/lib/lde/camioane-nav';

// Acțiunile de scriere întorc { error } în loc să arunce: Next maschează în
// producție mesajele aruncate din 'use server', iar dispecerul trebuie să vadă
// motivul real (tiparul /lde/parc).
export type Rezultat = { ok: true; mesaj: string } | { error: string };

export type Punct = {
  id: string;
  name: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  active: boolean;
};

const CALE = '/lde/camioane/puncte';

async function cerereRol(): Promise<Session> {
  const s = await verifySession();
  if (!s || !poateAccesa(s.role, CALE)) throw new Error('Neautorizat');
  return s;
}

export async function getPuncte(): Promise<Punct[]> {
  await cerereRol();
  const { data, error } = await getSupabase()
    .from('lde_dispatch_points')
    .select('id, name, country, lat, lng, radius_m, active')
    .eq('active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Punct[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mesajele Postgres brute scurg nume de coloane și constrângeri — nu ies spre client. */
function eroareCurata(e: { message: string; code?: string }, implicit: string): string {
  if (e.code === '23505') return 'Există deja un punct activ cu acest nume';
  if (e.code === '22P02') return 'Identificator invalid';
  console.error('[camioane/puncte]', e.code, e.message);
  return implicit;
}

function valideaza(p: { name: string; country?: string | null; lat: number | null; lng: number | null; radius_m: number }): string | null {
  const nume = p.name.trim();
  if (!nume) return 'Numele punctului e obligatoriu';
  if (nume.length > 120) return 'Numele e prea lung (max 120 de caractere)';
  if ((p.country ?? '').length > 60) return 'Numele țării e prea lung (max 60 de caractere)';
  // NaN trecea de verificările de interval (NaN < -90 e false) și ajungea în BD ca
  // null după serializare — exact starea pe care regula perechii o interzice.
  if (p.lat !== null && !Number.isFinite(p.lat)) return 'Latitudinea trebuie să fie un număr';
  if (p.lng !== null && !Number.isFinite(p.lng)) return 'Longitudinea trebuie să fie un număr';
  // Coordonatele sunt opționale (punctul rămâne valid, doar fără metrici GPS),
  // dar dacă vine una, trebuie amândouă — altfel geofence-ul ar tăcea.
  if ((p.lat === null) !== (p.lng === null)) return 'Coordonatele se dau împreună: și latitudine, și longitudine';
  if (p.lat !== null && (p.lat < -90 || p.lat > 90)) return 'Latitudine în afara intervalului −90…90';
  if (p.lng !== null && (p.lng < -180 || p.lng > 180)) return 'Longitudine în afara intervalului −180…180';
  if (!Number.isInteger(p.radius_m) || p.radius_m < 50 || p.radius_m > 20000) {
    return 'Raza trebuie să fie un număr întreg între 50 și 20000 m';
  }
  return null;
}

export async function adaugaPunct(p: {
  name: string; country: string | null; lat: number | null; lng: number | null; radius_m: number;
}): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereRol(); } catch { return { error: 'Neautorizat' }; }
  const gresit = valideaza(p);
  if (gresit) return { error: gresit };

  const { error } = await getSupabase().from('lde_dispatch_points').insert({
    name: p.name.trim(),
    country: p.country?.trim() || null,
    lat: p.lat, lng: p.lng, radius_m: p.radius_m,
    created_by: s.email,
  });
  if (error) return { error: eroareCurata(error, 'Punctul nu a putut fi adăugat') };
  return { ok: true, mesaj: `Punctul «${p.name.trim()}» a fost adăugat` };
}

export async function editeazaPunct(p: {
  id: string; name: string; country: string | null; lat: number | null; lng: number | null; radius_m: number;
}): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereRol(); } catch { return { error: 'Neautorizat' }; }
  const gresit = valideaza(p);
  if (gresit) return { error: gresit };

  if (!UUID_RE.test(p.id)) return { error: 'Identificator invalid' };
  const { data, error } = await getSupabase().from('lde_dispatch_points')
    .update({
      name: p.name.trim(),
      country: p.country?.trim() || null,
      lat: p.lat, lng: p.lng, radius_m: p.radius_m,
      updated_at: new Date().toISOString(), updated_by: s.email,
    })
    .eq('id', p.id).select('id');
  if (error) return { error: eroareCurata(error, 'Punctul nu a putut fi salvat') };
  if (!data || data.length === 0) return { error: 'Punctul nu mai există' };
  return { ok: true, mesaj: `Punctul «${p.name.trim()}» a fost salvat` };
}

export async function dezactiveazaPunct(id: string): Promise<Rezultat> {
  try { await cerereRol(); } catch { return { error: 'Neautorizat' }; }
  // Nu ștergem: cursele istorice trimit spre punct prin FK, iar analitica are
  // nevoie de nume. Dezactivarea îl scoate doar din selectoare.
  if (!UUID_RE.test(id)) return { error: 'Identificator invalid' };
  const { data, error } = await getSupabase().from('lde_dispatch_points')
    .update({ active: false }).eq('id', id).eq('active', true).select('id');
  if (error) return { error: eroareCurata(error, 'Punctul nu a putut fi scos') };
  if (!data || data.length === 0) return { error: 'Punctul nu există sau e deja scos' };
  return { ok: true, mesaj: 'Punctul a fost scos din listă' };
}
