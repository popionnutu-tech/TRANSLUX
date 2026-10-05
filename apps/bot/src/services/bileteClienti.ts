import type { SupabaseClient } from '@supabase/supabase-js';
import { buildReturAssignmentMap, buildTurAssignmentMap, type RawAssignment } from '@translux/db';
import { getSupabase } from '../supabase.js';

// ION-244: accesul botului la comenzile de bilete online ale clienților (cheia service a botului).
// Doar citiri și legarea Telegram ↔ comandă; banii, oferta și anularea stau în panou (services/panouBilete.ts).

/** Comanda văzută de bot: ce trebuie pentru mesajul biletului, legare și rutarea clientului. */
export interface ComandaClient {
  cod: string;
  status: string;
  lang: string | null;
  from_name: string;
  to_name: string;
  departure_at: string;
  seats: number;
  telegram_id: number | null;
  trip_date: string;
  crm_route_id: number;
  going_north: boolean;
}

/** Comenzile care se pot returna sau la care clientul poate să fi întârziat. */
export const STARI_ACTIVE = ['platita', 'platita_fara_bilet'] as const;
/**
 * Clientul rămâne «cu bilet» în bot și câteva ore după plecare: cine a pierdut autobuzul scrie DUPĂ ce a plecat,
 * iar biletul e valabil azi pe altă cursă (ION-243). Returnarea însăși o hotărăște panoul.
 */
export const FEREASTRA_DUPA_PLECARE_MS = 12 * 60 * 60_000;

const COLOANE = 'cod, status, lang, from_name, to_name, departure_at, seats, telegram_id, trip_date, crm_route_id, going_north';

export interface RepoBileteClienti {
  comandaDupaCod(cod: string): Promise<ComandaClient | null>;
  /** Leagă comanda de acest Telegram DOAR dacă nu e legată de nimeni; întoarce telegram_id-ul final al comenzii. */
  leagaComanda(cod: string, telegramId: number): Promise<number | null>;
  /** Comenzile active legate de cont, cu plecarea după `nowMs − 12 h`, cele mai apropiate întâi. */
  comenziLegate(telegramId: number, nowMs: number): Promise<ComandaClient[]>;
  /** Telefonul șoferului cursei din graficul zilei (tur/retur cu override), sau null. */
  telefonSofer(c: Pick<ComandaClient, 'trip_date' | 'crm_route_id' | 'going_north'>): Promise<string | null>;
}

export function creeazaRepoBileteClienti(db: () => SupabaseClient): RepoBileteClienti {
  async function comandaDupaCod(cod: string): Promise<ComandaClient | null> {
    const { data, error } = await db().from('bilete_comenzi').select(COLOANE).eq('cod', cod).maybeSingle();
    if (error) throw new Error(`bilete_comenzi: ${error.message}`);
    return (data as ComandaClient | null) ?? null;
  }

  return {
    comandaDupaCod,

    async leagaComanda(cod, telegramId) {
      // Atomic: «primul venit» (planul, pasul 1). Dacă altcineva a legat-o între timp, UPDATE-ul nu atinge nimic.
      const { data, error } = await db()
        .from('bilete_comenzi')
        .update({ telegram_id: telegramId })
        .eq('cod', cod)
        .is('telegram_id', null)
        .select('telegram_id');
      if (error) throw new Error(`legare bilete_comenzi: ${error.message}`);
      if (Array.isArray(data) && data.length > 0) return telegramId;
      const actuala = await comandaDupaCod(cod);
      return actuala?.telegram_id ?? null;
    },

    async comenziLegate(telegramId, nowMs) {
      const { data, error } = await db()
        .from('bilete_comenzi')
        .select(COLOANE)
        .eq('telegram_id', telegramId)
        .in('status', [...STARI_ACTIVE])
        .gt('departure_at', new Date(nowMs - FEREASTRA_DUPA_PLECARE_MS).toISOString())
        .order('departure_at', { ascending: true })
        .limit(20);
      if (error) throw new Error(`bilete_comenzi legate: ${error.message}`);
      return (data as ComandaClient[] | null) ?? [];
    },

    async telefonSofer(c) {
      const { data, error } = await db()
        .from('daily_assignments')
        .select('crm_route_id, driver_id, vehicle_id, vehicle_id_retur, driver_id_retur, retur_route_id')
        .eq('assignment_date', c.trip_date);
      if (error) throw new Error(`daily_assignments: ${error.message}`);
      const toate = ((data ?? []) as RawAssignment[]).filter((a) => a.crm_route_id != null && a.driver_id);
      // Aceeași regulă ca mini app-ul șoferului (admin/lib/bilete/sofer.ts): going_north=false → tur, true → retur.
      const harta = c.going_north ? buildReturAssignmentMap(toate) : buildTurAssignmentMap(toate);
      const driverId = harta.get(c.crm_route_id)?.driver_id;
      if (!driverId) return null;
      const { data: sofer, error: e2 } = await db().from('drivers').select('phone').eq('id', driverId).maybeSingle();
      if (e2) throw new Error(`drivers: ${e2.message}`);
      return (sofer as { phone: string | null } | null)?.phone ?? null;
    },
  };
}

export const repoBileteClienti: RepoBileteClienti = creeazaRepoBileteClienti(getSupabase);
