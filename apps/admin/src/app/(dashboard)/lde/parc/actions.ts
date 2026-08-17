'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, type Session } from '@/lib/auth';
import { normalizeDriverPhone, PhoneError } from '@translux/db';
import { chisinauToday, uzineCuSablon } from '@/lib/atribuiri/core';
import { normalizeazaPlaca, directionsCuUzina, mesajLegaturaDuplicata } from '@/lib/lde/parc';

// Parcul LDE pentru rolul UZINE (Alexei): adaugă mașini/șoferi noi și le leagă
// între ele. Paginile ADMIN (/lde/soferi, /lde/vehicule, /lde/atribuiri) rămân
// neatinse — aici e doar felia de care are nevoie, fără ștergeri.
//
// Middleware-ul lasă rolul UZINE pe /lde/parc, dar fiecare acțiune își verifică
// singură sesiunea — ca în grafic-uzine/actions.ts.

async function requireParcRole(): Promise<Session> {
  const s = await verifySession();
  if (!s || (s.role !== 'ADMIN' && s.role !== 'UZINE')) throw new Error('Neautorizat');
  return s;
}

export interface UzinaOption { id: string; label: string }
export interface MasinaRow { id: string; plate: string; uzine: string[]; areNorma: boolean }
export interface SoferRow {
  id: string; nume: string; telefon: string | null; uzine: string[];
  uzinaExtras: string | null;
  /** null = nu intră în statul de salarii (motorul cere categoria 1–5) */
  categorie: number | null;
}
export interface LegaturaRow {
  id: string;
  sofer: string;
  masina: string;
  shift: number | null;
  dinData: string;
}

export interface ParcData {
  uzine: UzinaOption[];
  masini: MasinaRow[];
  soferi: SoferRow[];
  legaturi: LegaturaRow[];
}

export async function getParc(): Promise<ParcData> {
  await requireParcRole();
  const sb = getSupabase();

  // Norma și extras vin ca embed pe părinte, nu ca tabele citite întregi: PostgREST
  // taie tăcut la 1000 de rânduri, iar o listă trunchiată n-ar ascunde date, ci ar
  // aprinde FALS avertismentele de mai jos («fără normă», «atribuire incompletă»).
  // Fiind PK pe vehicle_id / driver_id, embed-ul întoarce obiect sau null.
  // Uzinele sunt EXACT cele din graficul lui (uzineCuSablon = active + cu șablon
  // săptămânal, fără Trox). Altfel granița rolului ar fi definită în două locuri
  // diferite și Alexei ar putea adăuga mașini la o uzină pe care n-o vede.
  const [uzine, vehRes, drvRes, legRes] = await Promise.all([
    uzineCuSablon(),
    sb.from('vehicles').select('id, plate_number, directions, lde_vehicle_norms ( vehicle_id )')
      .eq('active', true).eq('is_lde', true).order('plate_number'),
    sb.from('drivers').select('id, full_name, phone, directions, lde_driver_extras ( uzina_id, lde_salary_category )')
      .eq('active', true).eq('is_lde', true).order('full_name'),
    sb.from('lde_active_assignments')
      .select('id, shift_number, valid_from, drivers:driver_id ( full_name ), vehicles:vehicle_id ( plate_number )')
      .is('valid_to', null),
  ]);

  for (const r of [vehRes, drvRes, legRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  type VehRaw = { id: string; plate_number: string; directions: string[] | null; lde_vehicle_norms: { vehicle_id: string } | null };
  type DrvRaw = {
    id: string; full_name: string; phone: string | null; directions: string[] | null;
    lde_driver_extras: { uzina_id: string | null; lde_salary_category: number | null } | null;
  };
  type LegRaw = {
    id: string; shift_number: number | null; valid_from: string;
    drivers: { full_name: string } | null; vehicles: { plate_number: string } | null;
  };

  return {
    uzine,
    masini: ((vehRes.data ?? []) as unknown as VehRaw[]).map((v) => ({
      id: v.id,
      plate: v.plate_number,
      uzine: v.directions ?? [],
      areNorma: v.lde_vehicle_norms != null,
    })),
    soferi: ((drvRes.data ?? []) as unknown as DrvRaw[]).map((d) => ({
      id: d.id,
      nume: d.full_name,
      telefon: d.phone ?? null,
      uzine: d.directions ?? [],
      uzinaExtras: d.lde_driver_extras?.uzina_id ?? null,
      categorie: d.lde_driver_extras?.lde_salary_category ?? null,
    })),
    legaturi: ((legRes.data ?? []) as unknown as LegRaw[])
      .map((l) => ({
        id: l.id,
        sofer: l.drivers?.full_name ?? '?',
        masina: l.vehicles?.plate_number ?? '?',
        shift: l.shift_number,
        dinData: l.valid_from,
      }))
      .sort((a, b) => a.masina.localeCompare(b.masina)),
  };
}

// Acțiunile întorc { error } în loc să arunce: Next.js maschează în producție
// mesajele aruncate din 'use server', iar Alexei trebuie să vadă motivul real.
type Rezultat = { ok: true; mesaj: string } | { error: string };

export async function adaugaMasina(placaBruta: string, uzinaId: string): Promise<Rezultat> {
  try {
    await requireParcRole();
    const placa = normalizeazaPlaca(placaBruta);
    if (!placa) return { error: 'Scrie numărul mașinii' };
    if (!uzinaId) return { error: 'Alege uzina' };

    const sb = getSupabase();
    // Comparăm pe forma normalizată, nu pe egalitate exactă: /vehicles salvează cu
    // `trim().toUpperCase()`, deci în bază există și numere cu spațiu în interior
    // («692 TWK», «795 MJW»). Un `eq('plate_number', '692TWK')` nu le-ar găsi și am
    // crea a doua înregistrare pentru aceeași mașină.
    const { data: toate, error: cErr } = await sb.from('vehicles').select('id, plate_number, active');
    if (cErr) return { error: cErr.message };
    const existent = (toate ?? []).find((v) => normalizeazaPlaca(v.plate_number as string) === placa);
    if (existent) {
      const scris = existent.plate_number as string;
      const cumApare = scris === placa ? '' : ` (scrisă în sistem ca «${scris}»)`;
      const inactiv = existent.active ? '' : ' — dezactivată, cere unui admin s-o reactiveze';
      return { error: `Mașina ${placa} există deja${cumApare}${inactiv}` };
    }

    const { error } = await sb.from('vehicles').insert({
      plate_number: placa,
      is_lde: true,
      active: true,
      directions: directionsCuUzina([], uzinaId),
    });
    if (error) return { error: error.message };

    return { ok: true, mesaj: `Mașina ${placa} a fost adăugată. Norma de consum o pune un admin.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Eroare' };
  }
}

export async function adaugaSofer(numeBrut: string, telefonBrut: string, uzinaId: string): Promise<Rezultat> {
  try {
    await requireParcRole();
    const nume = (numeBrut ?? '').trim().replace(/\s+/g, ' ');
    if (!nume) return { error: 'Scrie numele șoferului' };
    // aceeași regulă ca la /drivers (createDriver) — altfel apar «Ion» fără familie
    if (nume.split(' ').length < 2) return { error: 'Scrie numele complet (nume + prenume)' };
    if (!uzinaId) return { error: 'Alege uzina' };

    // Telefonul e opțional la LDE (triggerul migr. 256 îl cere doar la interurban),
    // dar dacă e scris trebuie să fie valid — o singură regulă, cea din @translux/db.
    let telefon: string | null = null;
    if ((telefonBrut ?? '').trim()) {
      try {
        telefon = normalizeDriverPhone(telefonBrut);
      } catch (e) {
        return { error: e instanceof PhoneError ? e.message : 'Telefon invalid' };
      }
    }

    const sb = getSupabase();
    // ilike fără % = egalitate fără sensibilitate la majuscule («STRUNA Valeriu» = «Struna Valeriu»)
    const { data: omonimi, error: cErr } = await sb
      .from('drivers').select('id').ilike('full_name', nume).eq('active', true);
    if (cErr) return { error: cErr.message };
    if (omonimi?.length) return { error: `Există deja un șofer activ cu numele «${nume}» — verifică lista întâi` };

    const { data: creat, error } = await sb.from('drivers').insert({
      full_name: nume,
      phone: telefon,
      is_lde: true,
      active: true,
      directions: directionsCuUzina([], uzinaId),
    }).select('id').single();
    if (error) return { error: error.message };

    // A doua jumătate a atribuirii: fără ea șoferul nu apare la salarii și în
    // /lde/soferi, deși în grafic ar fi vizibil (vezi spec 2026-08-17).
    const { error: exErr } = await sb.from('lde_driver_extras')
      .upsert({ driver_id: creat.id, uzina_id: uzinaId }, { onConflict: 'driver_id' });
    if (exErr) {
      // Cele două scrieri trebuie să trăiască sau să moară împreună. Fără compensare
      // șoferul rămâne pe jumătate atribuit ȘI blochează reîncercarea: verificarea de
      // omonim de mai sus l-ar găsi pe el însuși, iar Alexei n-are nici editare, nici
      // ștergere. Îl scoatem la loc — n-are timp să fie legat de nimic.
      const { error: delErr } = await sb.from('drivers').delete().eq('id', creat.id);
      if (delErr) {
        return { error: `Șoferul a fost creat, dar atribuirea la uzină a eșuat (${exErr.message}) și nici anularea n-a mers (${delErr.message}). Spune-i unui admin.` };
      }
      return { error: `Atribuirea la uzină a eșuat: ${exErr.message}. Nu s-a salvat nimic — încearcă din nou.` };
    }

    return { ok: true, mesaj: `Șoferul ${nume} a fost adăugat. Categoria de salariu i-o pune un admin — fără ea nu intră în stat.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Eroare' };
  }
}

export async function leagaMasinaSofer(vehicleId: string, driverId: string, shift: number | null): Promise<Rezultat> {
  try {
    await requireParcRole();
    if (!vehicleId) return { error: 'Alege mașina' };
    if (!driverId) return { error: 'Alege șoferul' };

    const sb = getSupabase();
    const { error } = await sb.from('lde_active_assignments').insert({
      driver_id: driverId,
      vehicle_id: vehicleId,
      shift_number: shift,
      // ora Chișinăului, nu UTC: între 00:00 și 03:00 vara `toISOString()` ar data
      // legătura cu ziua de ieri (aceeași funcție e folosită de grafic-uzine)
      valid_from: chisinauToday(),
      valid_to: null,
    });
    if (error) {
      return { error: error.code === '23505' ? mesajLegaturaDuplicata(error.message) : error.message };
    }

    return { ok: true, mesaj: 'Legătura a fost creată.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Eroare' };
  }
}
