import type { SupabaseClient } from '@supabase/supabase-js';
import { DURATA_MAXIMA_CURSA_MS, MARJA_DUPA_SOSIRE_MS } from '@translux/db';
import { getSupabase } from '../supabase.js';
import { cuSfarsitulCursei } from './sfarsitCursa.js';

// ION-251: ce ține botul despre mesajele biletelor în chatul clientului (migr. 505): mesajul cu biletul, mesajul fixat
// și harta trimisă o dată. Separat de RepoBileteClienti: alt motiv de schimbare (chatul, nu comanda).

/** Comanda văzută de regula pinului: plecarea, sfârșitul cursei (ION-252), starea și mesajele ei din chat. */
export interface ComandaFixare {
  cod: string;
  status: string;
  departure_at: string;
  /** Sfârșitul cursei (ms): sosirea din grafic + 30 min; fără oră, plecarea + 6 h (@translux/db). */
  sfarsit_ms: number;
  telegram_mesaj_id: number | null;
  telegram_mesaj_fixat_id: number | null;
}

/** Comanda căreia i se trimite harta autobuzului. */
export interface ComandaHarta {
  cod: string;
  lang: string | null;
  from_name: string;
  to_name: string;
  departure_at: string;
  telegram_id: number;
}

/** Ținta pinului scrisă în bază: comanda și mesajul ei fixat. */
export interface TintaFixare { cod: string; mesajId: number }

/** Fereastra plecării în care tickul se uită la conturi (Ion: «ultimele/următoarele 2 zile»). */
export const FEREASTRA_CONTURI_MS = 2 * 24 * 60 * 60_000;
/** Harta pleacă de la o oră înainte de plecare până la 5 minute după (cursa întârzie, punctul vine târziu). */
export const HARTA_INAINTE_MS = 60 * 60_000;
export const HARTA_DUPA_MS = 5 * 60_000;
/** ION-274: o revendicare a livrării neîncheiată expiră după 2 min (trimiterea a picat fără anulare, ex. instanța a murit). */
export const REVENDICARE_MS = 2 * 60_000;
/**
 * Comenzile unui cont citite pentru pin: plecate de cel mult cât ține cea mai lungă cursă + marja (sfârșitul exact îl
 * hotărăște regula pinului, din ora sosirii), plus cele fixate acum.
 */
export const FEREASTRA_CITIRE_DUPA_PLECARE_MS = DURATA_MAXIMA_CURSA_MS + MARJA_DUPA_SOSIRE_MS;

/** Rândul citit pentru pin: comanda + ce trebuie pentru sfârșitul cursei. */
type RandFixare = Omit<ComandaFixare, 'sfarsit_ms'> & { crm_route_id: number; to_stop_order: number; going_north: boolean };

const PLATITA = 'platita';
const LIMITA_RANDURI = 500;

export interface RepoMesajeBilet {
  /** Mesajul cu biletul trimis acum contului legat (doar pe comanda acestui cont). */
  salveazaMesaj(cod: string, telegramId: number, mesajId: number): Promise<void>;
  /** Mesajul nu mai există în chat (clientul l-a șters): comanda nu mai are ce fixa, până la următorul link. */
  uitaMesaj(cod: string, mesajId: number): Promise<void>;
  /**
   * ION-274: revendicare ATOMICĂ a livrării automate (o singură instanță/cale trimite): true dacă această cerere a luat-o.
   * Condiția: nelivrat (telegram_livrat_la IS NULL) și nerevendicat în ultimele 2 min.
   */
  revendicaLivrarea(cod: string, nowMs: number): Promise<boolean>;
  /** Trimiterea a picat înaintea primului mesaj: revendicarea se eliberează, jobul reia. */
  anuleazaRevendicarea(cod: string): Promise<void>;
  /** Livrat: telegram_livrat_la + telegram_mesaj_id (primul mesaj), revendicarea se închide. */
  marcheazaLivrat(cod: string, telegramId: number, mesajId: number): Promise<void>;
  /** Comenzile contului relevante pentru pin, cu sfârșitul cursei: cele încă posibil pe drum, plus cele fixate acum. */
  comenziPentruFixare(telegramId: number, nowMs: number): Promise<ComandaFixare[]>;
  /** Scrie pinul curent al contului: ținta (sau nimic) fixată, restul comenzilor desfixate. */
  marcheazaFixarea(telegramId: number, tinta: TintaFixare | null): Promise<void>;
  /** Conturile la care tickul verifică pinul: cu bilet plătit trimis în ±2 zile sau cu o comandă fixată. */
  conturiDeVerificat(nowMs: number): Promise<number[]>;
  /** Comenzile plătite, legate, cu plecarea în [acum − 5 min, acum + 60 min] și fără hartă trimisă. */
  comenziPentruHarta(nowMs: number): Promise<ComandaHarta[]>;
  /** Marchează harta trimisă DOAR dacă nu era deja; `false` = altcineva a marcat-o între timp. */
  marcheazaHartaTrimisa(cod: string): Promise<boolean>;
}

const iso = (ms: number) => new Date(ms).toISOString();

function verifica(error: { message: string } | null, unde: string): void {
  if (error) throw new Error(`${unde}: ${error.message}`);
}

export function creeazaRepoMesajeBilet(db: () => SupabaseClient): RepoMesajeBilet {
  return {
    async salveazaMesaj(cod, telegramId, mesajId) {
      const { error } = await db().from('bilete_comenzi').update({ telegram_mesaj_id: mesajId }).eq('cod', cod).eq('telegram_id', telegramId);
      verifica(error, 'bilete_comenzi mesaj');
    },

    async uitaMesaj(cod, mesajId) {
      const { error } = await db().from('bilete_comenzi').update({ telegram_mesaj_id: null }).eq('cod', cod).eq('telegram_mesaj_id', mesajId);
      verifica(error, 'bilete_comenzi uită mesajul');
    },

    async revendicaLivrarea(cod, nowMs) {
      const acum = new Date(nowMs).toISOString();
      const expirat = new Date(nowMs - REVENDICARE_MS).toISOString();
      // UPDATE … WHERE condiție RETURNING: Postgres serializează rândul — din două cereri simultane doar una primește rândul.
      const { data, error } = await db().from('bilete_comenzi').update({ telegram_livrare_la: acum })
        .eq('cod', cod).is('telegram_livrat_la', null)
        .or(`telegram_livrare_la.is.null,telegram_livrare_la.lt."${expirat}"`)
        .select('cod');
      verifica(error, 'bilete_comenzi revendicare');
      return Array.isArray(data) && data.length > 0;
    },

    async anuleazaRevendicarea(cod) {
      const { error } = await db().from('bilete_comenzi').update({ telegram_livrare_la: null }).eq('cod', cod).is('telegram_livrat_la', null);
      verifica(error, 'bilete_comenzi anulare revendicare');
    },

    async marcheazaLivrat(cod, telegramId, mesajId) {
      const { error } = await db().from('bilete_comenzi')
        .update({ telegram_livrat_la: new Date().toISOString(), telegram_mesaj_id: mesajId, telegram_livrare_la: null })
        .eq('cod', cod).eq('telegram_id', telegramId);
      verifica(error, 'bilete_comenzi livrat');
    },

    async comenziPentruFixare(telegramId, nowMs) {
      const { data, error } = await db()
        .from('bilete_comenzi')
        .select('cod, status, departure_at, telegram_mesaj_id, telegram_mesaj_fixat_id, crm_route_id, to_stop_order, going_north')
        .eq('telegram_id', telegramId)
        .or(`telegram_mesaj_fixat_id.not.is.null,departure_at.gt."${iso(nowMs - FEREASTRA_CITIRE_DUPA_PLECARE_MS)}"`)
        .order('departure_at', { ascending: true })
        .limit(LIMITA_RANDURI);
      verifica(error, 'bilete_comenzi pentru pin');
      return cuSfarsitulCursei(db(), (data as RandFixare[] | null) ?? []);
    },

    async marcheazaFixarea(telegramId, tinta) {
      let desfixeaza = db().from('bilete_comenzi').update({ telegram_mesaj_fixat_id: null })
        .eq('telegram_id', telegramId).not('telegram_mesaj_fixat_id', 'is', null);
      if (tinta) desfixeaza = desfixeaza.neq('cod', tinta.cod);
      const { error } = await desfixeaza;
      verifica(error, 'bilete_comenzi desfixare');
      if (!tinta) return;
      const { error: e2 } = await db().from('bilete_comenzi').update({ telegram_mesaj_fixat_id: tinta.mesajId })
        .eq('cod', tinta.cod).eq('telegram_id', telegramId);
      verifica(e2, 'bilete_comenzi fixare');
    },

    async conturiDeVerificat(nowMs) {
      const [inFereastra, fixate] = await Promise.all([
        db().from('bilete_comenzi').select('telegram_id')
          .not('telegram_id', 'is', null).eq('status', PLATITA).not('telegram_mesaj_id', 'is', null)
          .gte('departure_at', iso(nowMs - FEREASTRA_CONTURI_MS)).lte('departure_at', iso(nowMs + FEREASTRA_CONTURI_MS))
          .limit(LIMITA_RANDURI),
        db().from('bilete_comenzi').select('telegram_id')
          .not('telegram_id', 'is', null).not('telegram_mesaj_fixat_id', 'is', null)
          .limit(LIMITA_RANDURI),
      ]);
      verifica(inFereastra.error, 'conturi în fereastră');
      verifica(fixate.error, 'conturi fixate');
      const randuri = [...(inFereastra.data ?? []), ...(fixate.data ?? [])] as Array<{ telegram_id: number }>;
      return [...new Set(randuri.map((r) => r.telegram_id))];
    },

    async comenziPentruHarta(nowMs) {
      const { data, error } = await db()
        .from('bilete_comenzi')
        .select('cod, lang, from_name, to_name, departure_at, telegram_id')
        .eq('status', PLATITA)
        .not('telegram_id', 'is', null)
        .is('telegram_harta_trimisa_la', null)
        .gte('departure_at', iso(nowMs - HARTA_DUPA_MS))
        .lte('departure_at', iso(nowMs + HARTA_INAINTE_MS))
        .order('departure_at', { ascending: true })
        .limit(LIMITA_RANDURI);
      verifica(error, 'bilete_comenzi pentru hartă');
      return (data as ComandaHarta[] | null) ?? [];
    },

    async marcheazaHartaTrimisa(cod) {
      const { data, error } = await db()
        .from('bilete_comenzi')
        .update({ telegram_harta_trimisa_la: new Date().toISOString() })
        .eq('cod', cod)
        .is('telegram_harta_trimisa_la', null)
        .select('cod');
      verifica(error, 'bilete_comenzi hartă trimisă');
      return Array.isArray(data) && data.length > 0;
    },
  };
}

export const repoMesajeBilet: RepoMesajeBilet = creeazaRepoMesajeBilet(getSupabase);
