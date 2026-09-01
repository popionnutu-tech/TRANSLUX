'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, type Session } from '@/lib/auth';
import { poateAccesa, poateScrie } from '@/lib/lde/camioane-nav';
import { locuriFrecvente, type LocFrecvent, type OprireGps, type PunctCunoscut } from '@/lib/lde/locuri-frecvente';

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

/**
 * Ca `cerereRol`, dar cere ȘI dreptul de scriere. A vedea un ecran și a-l
 * modifica sunt drepturi diferite: OBSERVATOR intră pe bandă, dar nu scrie nimic.
 */
async function cerereScriere(): Promise<Session> {
  const s = await cerereRol();
  if (!poateScrie(s.role)) throw new Error('Neautorizat');
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
  // Plafon 5000 m: raza e geofence-ul din care workerul decide că un camion a
  // ajuns. La 20 km, două puncte vecine se suprapun și sosirea se pune la punctul
  // greșit. Peste 5 km nu mai e un punct de încărcare, e o regiune.
  if (!Number.isInteger(p.radius_m) || p.radius_m < 50 || p.radius_m > 5000) {
    return 'Raza trebuie să fie un număr întreg între 50 și 5000 m';
  }
  return null;
}

export async function adaugaPunct(p: {
  name: string; country: string | null; lat: number | null; lng: number | null; radius_m: number;
}): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereScriere(); } catch { return { error: 'Neautorizat' }; }
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
  try { s = await cerereScriere(); } catch { return { error: 'Neautorizat' }; }
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
  try { await cerereScriere(); } catch { return { error: 'Neautorizat' }; }
  // Nu ștergem: cursele istorice trimit spre punct prin FK, iar analitica are
  // nevoie de nume. Dezactivarea îl scoate doar din selectoare.
  if (!UUID_RE.test(id)) return { error: 'Identificator invalid' };
  const { data, error } = await getSupabase().from('lde_dispatch_points')
    .update({ active: false }).eq('id', id).eq('active', true).select('id');
  if (error) return { error: eroareCurata(error, 'Punctul nu a putut fi scos') };
  if (!data || data.length === 0) return { error: 'Punctul nu există sau e deja scos' };
  return { ok: true, mesaj: 'Punctul a fost scos din listă' };
}

/**
 * Locurile unde camioanele stau mult, dar care NU sunt încă în nomenclator.
 * Sursa: opririle calculate deja de workerul de noapte (lde_gps_stops) — nu
 * interogăm Wialon din nou și nu inventăm un al doilea calcul de opriri.
 */
export async function getLocuriPropuse(): Promise<LocFrecvent[]> {
  await cerereRol();
  const sb = getSupabase();
  // 60 de zile, nu 30: uzina din străinătate e vizitată o dată la câteva
  // săptămâni, iar pe 30 de zile cădea sub pragul de 2 vizite — exact locul pe
  // care dispecerul ar vrea să-l boteze.
  const de = new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10);

  const [camRes, puncteRes] = await Promise.all([
    sb.from('vehicles').select('id, plate_number')
      .eq('active', true).eq('is_lde', true).contains('directions', ['camioane']),
    sb.from('lde_dispatch_points').select('id, name, lat, lng, radius_m').eq('active', true),
  ]);
  for (const r of [camRes, puncteRes]) {
    if (r.error) { console.error('[camioane/locuri]', r.error.message); throw new Error('Nu am putut citi datele'); }
  }

  type Veh = { id: string; plate_number: string };
  const camioane = (camRes.data ?? []) as Veh[];
  const placa = new Map(camioane.map((v) => [v.id, v.plate_number]));
  if (camioane.length === 0) return [];

  // Doar opririle LUNGI: sub o oră sunt semafoare, vamă în mers, pauze scurte —
  // ele n-ar spune nimic despre «ce e locul acesta».
  // PostgREST taie TĂCUT la 1000 de rânduri, indiferent de .limit(): pe 60 de
  // zile sunt peste 2000 de opriri, iar tăierea ar fi scos locurile vizitate rar
  // și ar fi micșorat orele. Citim pe pagini, ca în km-zilnic.
  type Stop = { vehicle_id: string; lat: number | null; lon: number | null; dwell_min: number | null; arrival_at: string; locality: string | null };
  const PAGINA = 1000;
  const MAX_PAGINI = 8;
  const brute: Stop[] = [];
  const ids = camioane.map((v) => v.id);
  for (let p = 0; p < MAX_PAGINI; p++) {
    const { data, error } = await sb.from('lde_gps_stops')
      .select('vehicle_id, lat, lon, dwell_min, arrival_at, locality')
      .in('vehicle_id', ids)
      .gte('date', de)
      .gte('dwell_min', 60)
      // Fără coordonate, Number(null) dă 0 și trece de Number.isFinite: oprirea
      // ar forma un grup fantomă în Golful Guineei.
      .not('lat', 'is', null)
      .not('lon', 'is', null)
      .order('arrival_at', { ascending: false })
      // Tiebreaker: 18 opriri împart aceeași secundă de sosire. Fără cheie unică,
      // rândul de la granița paginii apare de două ori sau se pierde, iar orele
      // și numărul de opriri mint cu o unitate.
      .order('id')
      .range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) { console.error('[camioane/locuri]', error.message); throw new Error('Nu am putut citi opririle'); }
    const pagina = (data ?? []) as Stop[];
    brute.push(...pagina);
    if (pagina.length < PAGINA) break;
    if (p === MAX_PAGINI - 1) console.warn('[camioane/locuri] plafon de pagini atins — coada veche lipsește');
  }

  const opriri: OprireGps[] = brute.map((o) => ({
    vehicleId: o.vehicle_id,
    plate: placa.get(o.vehicle_id) ?? '—',
    lat: Number(o.lat),
    lng: Number(o.lon),
    dwellMin: Number(o.dwell_min ?? 0),
    arrivalAt: o.arrival_at,
    locality: o.locality,
  }));

  type PunctRow = { id: string; name: string; lat: number | null; lng: number | null; radius_m: number };
  const cunoscute: PunctCunoscut[] = ((puncteRes.data ?? []) as PunctRow[]).map((p) => ({
    id: p.id, name: p.name, lat: p.lat, lng: p.lng, radiusM: p.radius_m,
  }));

  return locuriFrecvente(opriri, cunoscute);
}
