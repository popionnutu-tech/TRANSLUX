'use server';

import { createHash, randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { calculeazaCurse, incarcaCurse } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { chisinauDayStartIso, chisinauTodayIso } from '@/lib/chisinau-time';
import { ComandaError, creeazaComanda } from '@/lib/bilete/comenzi';
import { cheieProbaValida, dataProbaPermisa, pasiProba, telefonMascat, type PasProba, type StareProbaRand } from '@/lib/bilete/proba-reguli';
import { curataVerdicte, mesajRezultat } from '@/lib/bilete/proba-teste';
import { alertaBilete } from '@/lib/bilete/alerte-tab';

// Acțiunile paginii de probă fizică (migr. 532, Ion 08.10.2026: «pagina fără login», «biletul 10 lei», «Iura unic șofer»).
// FIECARE acțiune verifică singură cheia și termenul (revizia de securitate H1: id-ul unei server action e public în
// bundle). Serverul impune: azi/mâine, un singur loc, cheia de idempotență, adresa de întoarcere; plafonul de 10/zi stă
// în bilete_creeaza_comanda, sub lacăt (critica C2).

function ziua(): { azi: string; maine: string; poimaine: string } {
  const azi = chisinauTodayIso();
  const [y, m, d] = azi.split('-').map(Number);
  const maine = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const poimaine = new Date(Date.UTC(y, m - 1, d + 2)).toISOString().slice(0, 10);
  return { azi, maine, poimaine };
}

function cheieBuna(cheie: unknown): boolean {
  return cheieProbaValida(cheie, { cheie: process.env.BILETE_PROBA_CHEIE, panaLa: process.env.BILETE_PROBA_PANA_LA }, ziua().azi);
}

export interface CursaProba { routeId: number; goingNorth: boolean; plecare: string; sosire: string; ruta: string; pretReal: number }

export async function cautaCurseProba(cheie: string, fromRo: string, toRo: string, tripDate: string): Promise<{ ok: true; curse: CursaProba[] } | { ok: false; eroare: string }> {
  if (!cheieBuna(cheie)) return { ok: false, eroare: 'neautorizat' };
  const { azi, maine, poimaine } = ziua();
  if (!dataProbaPermisa(tripDate, azi, maine, poimaine)) return { ok: false, eroare: 'doar azi, mâine sau poimâine' };
  const de = String(fromRo ?? '').trim().slice(0, 60);
  const spre = String(toRo ?? '').trim().slice(0, 60);
  if (!de || !spre) return { ok: false, eroare: 'scrie de unde și încotro' };
  const d = await incarcaCurse(getSupabase(), { fromRo: de, toRo: spre, date: tripDate });
  if (!d) return { ok: true, curse: [] };
  const curse = calculeazaCurse(d, tripDate).map((c) => ({
    routeId: c.routeId, goingNorth: c.goingNorth, plecare: c.time, sosire: c.arrival, ruta: c.destination_ro, pretReal: c.price,
  }));
  return { ok: true, curse };
}

export interface CumparaProba {
  tripDate: string; routeId: number; goingNorth: boolean; fromRo: string; toRo: string;
  nume: string; prenume: string; telefon: string; email?: string;
}

export async function cumparaProba(cheie: string, f: CumparaProba): Promise<{ ok: true; url: string } | { ok: false; eroare: string }> {
  if (!cheieBuna(cheie)) return { ok: false, eroare: 'neautorizat' };
  const { azi, maine, poimaine } = ziua();
  if (!dataProbaPermisa(f?.tripDate, azi, maine, poimaine)) return { ok: false, eroare: 'doar azi, mâine sau poimâine' };
  if (!Number.isInteger(f.routeId) || typeof f.goingNorth !== 'boolean') return { ok: false, eroare: 'cursa nu e validă' };
  const nume = `${String(f.nume ?? '').trim()} ${String(f.prenume ?? '').trim()}`.trim();
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'fara-ip';
  const baza = (process.env.MAIB_PUBLIC_BASE_URL || `https://${h.get('x-forwarded-host') ?? h.get('host') ?? 'central-hub-md.vercel.app'}`).replace(/\/+$/, '');
  try {
    const r = await creeazaComanda(
      {
        tripDate: f.tripDate, crmRouteId: f.routeId, goingNorth: f.goingNorth, fromRo: String(f.fromRo ?? ''), toRo: String(f.toRo ?? ''),
        seats: 1, passengerName: nume, phone: String(f.telefon ?? ''), email: f.email ? String(f.email) : null, lang: 'ro',
        idempotencyKey: randomUUID(), ipHash: createHash('sha256').update(`proba:${ip}`).digest('hex').slice(0, 32),
      },
      { mod: 'proba', bazaAdmin: baza, bazaSite: (process.env.SITE_URL || 'https://translux.md').replace(/\/+$/, ''), createdBy: 'proba-fizica' },
    );
    if (!r.checkoutUrl) return { ok: false, eroare: 'maib n-a dat pagina de plată' };
    return { ok: true, url: r.checkoutUrl };
  } catch (e) {
    if (e instanceof ComandaError) return { ok: false, eroare: e.message };
    console.error('[proba-bilete] cumpără:', e);
    return { ok: false, eroare: 'eroare internă' };
  }
}

export interface RandProba { numar: string; ora: string; cursa: string; nume: string; telefon: string; pasi: Record<PasProba, boolean | null> }

/** Comenzile de probă create azi, cu bifele pașilor — fără e-mail, fără cod, telefonul mascat (revizia M2). */
export async function stareProbe(cheie: string): Promise<{ ok: true; randuri: RandProba[] } | { ok: false; eroare: string }> {
  if (!cheieBuna(cheie)) return { ok: false, eroare: 'neautorizat' };
  const { azi } = ziua();
  const { data, error } = await getSupabase().from('bilete_comenzi')
    .select('id, created_at, trip_date, from_name, to_name, departure_at, passenger_name, phone, status, email, email_livrat_la, telegram_id, bilete(status)')
    .eq('proba_fizica', true).gte('created_at', chisinauDayStartIso(azi)).order('created_at', { ascending: false }).limit(20);
  if (error) return { ok: false, eroare: 'baza nu răspunde' };
  const ora = (iso: string) => new Date(iso).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });
  const randuri = ((data ?? []) as Array<StareProbaRand & { id: string; created_at: string; trip_date: string; from_name: string; to_name: string; departure_at: string; passenger_name: string; phone: string }>)
    .map((c) => ({
      numar: c.id.slice(0, 8).toUpperCase(), ora: ora(c.created_at),
      cursa: `${c.from_name} → ${c.to_name}, ${c.trip_date.slice(8, 10)}.${c.trip_date.slice(5, 7)} ${ora(c.departure_at)}`,
      nume: c.passenger_name, telefon: telefonMascat(c.phone), pasi: pasiProba(c),
    }));
  return { ok: true, randuri };
}

/**
 * Ion, 08.10.2026: «fă ca pagina să trimită mie rezultatele». Verdictele celor 20 de teste pleacă la Ion în Telegram
 * (alertAdmins, ca alertele biletelor). Textul testelor îl pune serverul din lista fixă; de la pagină vin doar ok/bad și
 * nota. Plafon: 10 trimiteri în 10 minute (în bază), ca o cheie scăpată să nu poată umple chatul lui Ion.
 */
export async function trimiteRezultatProba(cheie: string, verdicte: unknown, cine: string): Promise<{ ok: true } | { ok: false; eroare: string }> {
  if (!cheieBuna(cheie)) return { ok: false, eroare: 'neautorizat' };
  const v = curataVerdicte(verdicte);
  if (v.size === 0) return { ok: false, eroare: 'bifează cel puțin un test' };
  const { data: liber, error } = await getSupabase().rpc('bilete_plafon', { p_cheie: 'proba:rezultat', p_fereastra_s: 600, p_max: 10 });
  if (!error && liber === false) return { ok: false, eroare: 'prea multe trimiteri; încearcă peste câteva minute' };
  const nume = String(cine ?? '').trim().slice(0, 40) || 'Iura';
  const cand = new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const trimis = await alertaBilete(mesajRezultat(v, nume, cand));
  return trimis ? { ok: true } : { ok: false, eroare: 'Telegram n-a primit mesajul; încearcă din nou' };
}
