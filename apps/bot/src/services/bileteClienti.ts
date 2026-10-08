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
  /** Comandă de probă (migr. 532): biletul spune «BILET DE PROBĂ»; clientul nu primește telefonul șoferului real. */
  test?: boolean | null;
  /** ION-274 (migr. 516): livrat automat în chat o dată; doar în selecția jobului «Bilete noi». */
  telegram_livrat_la?: string | null;
  telegram_mesaj_id?: number | null;
}

/** Comenzile care se pot returna sau la care clientul poate să fi întârziat. */
export const STARI_ACTIVE = ['platita', 'platita_fara_bilet'] as const;
/**
 * Clientul rămâne «cu bilet» în bot și câteva ore după plecare: cine a pierdut autobuzul scrie DUPĂ ce a plecat,
 * iar biletul e valabil azi pe altă cursă (ION-243). Returnarea însăși o hotărăște panoul.
 */
export const FEREASTRA_DUPA_PLECARE_MS = 12 * 60 * 60_000;
/** ION-266: cât timp după plată botul mai trimite singur biletul în chat (comenzile mai vechi nu se mai ating). */
export const FEREASTRA_PLATA_MS = 48 * 60 * 60_000;

const COLOANE = 'cod, status, lang, from_name, to_name, departure_at, seats, telegram_id, trip_date, crm_route_id, going_north, test';

export interface RepoBileteClienti {
  comandaDupaCod(cod: string): Promise<ComandaClient | null>;
  /** Leagă comanda de acest Telegram DOAR dacă nu e legată de nimeni; întoarce telegram_id-ul final al comenzii. */
  leagaComanda(cod: string, telegramId: number): Promise<number | null>;
  /** Comenzile active legate de cont, cu plecarea după `nowMs − 12 h`, cele mai apropiate întâi. */
  comenziLegate(telegramId: number, nowMs: number): Promise<ComandaClient[]>;
  /** Telefonul șoferului cursei din graficul zilei (tur/retur cu override), sau null. */
  telefonSofer(c: Pick<ComandaClient, 'trip_date' | 'crm_route_id' | 'going_north' | 'test'>): Promise<string | null>;
  /** Contul e al unui șofer activ (are butonul lui de meniu «🎫 Билеты», nu-l atingem). */
  esteSofer?(telegramId: number): Promise<boolean>;
  /** ION-248: biletele (locurile) valabile ale comenzii, cu codul QR, în ordinea locurilor. */
  bileteQr?(cod: string): Promise<BiletQr[]>;
  /** ION-266: comenzile plătite, legate de un cont (cumpărate din mini app) și încă fără biletul în chat. */
  comenziPlatiteFaraMesaj?(nowMs: number): Promise<ComandaClient[]>;
}

export interface BiletQr { nr: number; loc_nr: number | null; cod_qr: string; status: string }

export function creeazaRepoBileteClienti(db: () => SupabaseClient): RepoBileteClienti {
  async function comandaDupaCod(cod: string): Promise<ComandaClient | null> {
    const { data, error } = await db().from('bilete_comenzi').select(COLOANE).eq('cod', cod).maybeSingle();
    if (error) throw new Error(`bilete_comenzi: ${error.message}`);
    return (data as ComandaClient | null) ?? null;
  }

  return {
    async bileteQr(cod) {
      const { data, error } = await db().from('bilete').select('nr, loc_nr, cod_qr, status, bilete_comenzi!inner(cod)')
        .eq('bilete_comenzi.cod', cod).in('status', ['valid', 'urcat']).order('nr');
      if (error) throw new Error(`bilete: ${error.message}`);
      return (data ?? []).map((b) => ({ nr: b.nr, loc_nr: b.loc_nr, cod_qr: b.cod_qr, status: b.status })) as BiletQr[];
    },
    async esteSofer(telegramId) {
      const { count } = await db().from('drivers').select('id', { count: 'exact', head: true }).eq('telegram_id', telegramId).eq('active', true);
      return (count ?? 0) > 0;
    },
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

    // ION-266 (Ion, 06.10: «cumpărat din Telegram, biletul deodată trebuia să apară»): plătite în ultimele 48 h, cu contul
    // legat (din mini app, la creare) și fără mesaj în chat — și reluarea trimiterii picate de la /start.
    async comenziPlatiteFaraMesaj(nowMs) {
      const { data, error } = await db()
        .from('bilete_comenzi')
        .select(`${COLOANE}, telegram_livrat_la, telegram_mesaj_id`)
        .eq('status', 'platita')
        .not('telegram_id', 'is', null)
        // ION-274: ambele goale — livrat o dată (telegram_livrat_la) NU se retrimite chiar dacă clientul a șters mesajul.
        .is('telegram_livrat_la', null)
        .is('telegram_mesaj_id', null)
        .gte('paid_at', new Date(nowMs - FEREASTRA_PLATA_MS).toISOString())
        .gt('departure_at', new Date(nowMs - FEREASTRA_DUPA_PLECARE_MS).toISOString())
        .order('paid_at', { ascending: true })
        .limit(20);
      if (error) throw new Error(`bilete_comenzi noi: ${error.message}`);
      return (data as ComandaClient[] | null) ?? [];
    },

    async telefonSofer(c) {
      // Comanda de probă n-are șofer real (o vede doar șoferul de probă, migr. 532).
      if (c.test === true) return null;
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
