import type { SupabaseClient } from '@supabase/supabase-js';
import { DURATA_MAXIMA_CURSA_MS, MARJA_DUPA_SOSIRE_MS } from '@translux/db';
import { getSupabase } from '../supabase.js';
import { cuSfarsitulCursei } from './sfarsitCursa.js';

// ION-252 (Ion, 05.10: «2. super»): după sfârșitul cursei botul îi scrie O DATĂ clientului «Mulțumim că ai călătorit cu
// TRANSLUX» cu 👍 / 👎. Doar comenzile plătite legate de un cont; marcajul (migr. 506) se scrie după trimiterea reușită.
// Aici: ce comenzi sunt scadente (pur) și accesul la bază; trimiterea și butoanele stau în handlers/dupa-cursa.ts.

/** Răspunsul clientului la mesajul de după cursă (CHECK-ul din migr. 506). */
export type FeedbackClient = 'bine' | 'plangere';

/** Comanda căreia i se trimite mesajul de după cursă. */
export interface ComandaFinal {
  cod: string;
  lang: string | null;
  from_name: string;
  to_name: string;
  departure_at: string;
  telegram_id: number;
  /** Sfârșitul cursei (ms), din @translux/db. */
  sfarsit_ms: number;
  /** Sosirea după grafic (ms) — momentul mesajului de după cursă; lipsă = sfârșitul cursei. */
  sosire_ms?: number;
}

/** Comanda văzută de butoanele 👍 / 👎: cui e legată și în ce stare e. */
export interface ComandaFeedback {
  cod: string;
  status: string;
  lang: string | null;
  telegram_id: number | null;
}

/**
 * Mesajul pleacă doar în primele 6 h după sfârșitul cursei. Peste ele (botul a stat oprit, prima pornire după livrare)
 * un «cum a fost cursa de alaltăieri?» ar suna ciudat — comanda rămâne fără mesaj.
 */
export const FEREASTRA_FINAL_MS = 6 * 60 * 60_000;
/** Citirea din bază: plecările care pot avea sfârșitul în fereastră (cea mai lungă cursă + marja + fereastra). */
export const FEREASTRA_CITIRE_FINAL_MS = DURATA_MAXIMA_CURSA_MS + MARJA_DUPA_SOSIRE_MS + FEREASTRA_FINAL_MS;

const PLATITA = 'platita';
const LIMITA_RANDURI = 500;

/**
 * Comenzile ajunse după grafic de cel mult 6 h, cele mai vechi întâi. Mesajul pleacă la SOSIREA după grafic (Ion, 05.10:
 * «plângerea apare îndată ce finalizează cursa după grafic»), nu la sosire + 30 min (aceea rămâne pentru bilet și pin).
 * Pur, testat.
 */
export function comenziScadentePentruFinal<T extends { sfarsit_ms: number; sosire_ms?: number }>(comenzi: readonly T[], nowMs: number): T[] {
  const moment = (c: T) => c.sosire_ms ?? c.sfarsit_ms;
  return comenzi
    .filter((c) => moment(c) <= nowMs && nowMs - moment(c) <= FEREASTRA_FINAL_MS)
    .sort((a, b) => moment(a) - moment(b));
}

export interface RepoDupaCursa {
  /** Comenzile plătite, legate, fără mesajul de după cursă, cu cursa încheiată de cel mult 6 h. */
  comenziPentruFinal(nowMs: number): Promise<ComandaFinal[]>;
  /** Marchează mesajul trimis DOAR dacă nu era deja; `false` = altcineva l-a marcat între timp. */
  marcheazaFinalTrimis(cod: string): Promise<boolean>;
  /** Comanda după cod, pentru butoanele 👍 / 👎 (null = nu există). */
  comandaPentruFeedback(cod: string): Promise<ComandaFeedback | null>;
  /**
   * Scrie răspunsul pe comanda ACESTUI cont. «bine» doar peste nimic (primul răspuns rămâne); «plangere» și peste
   * «bine» (o plângere venită după 👍 contează mai mult decât 👍).
   */
  scrieFeedback(cod: string, telegramId: number, feedback: FeedbackClient): Promise<void>;
}

const iso = (ms: number) => new Date(ms).toISOString();

function verifica(error: { message: string } | null, unde: string): void {
  if (error) throw new Error(`${unde}: ${error.message}`);
}

type RandFinal = Omit<ComandaFinal, 'sfarsit_ms'> & { crm_route_id: number; to_stop_order: number; going_north: boolean };

export function creeazaRepoDupaCursa(db: () => SupabaseClient): RepoDupaCursa {
  return {
    async comenziPentruFinal(nowMs) {
      const { data, error } = await db()
        .from('bilete_comenzi')
        .select('cod, lang, from_name, to_name, departure_at, telegram_id, crm_route_id, to_stop_order, going_north')
        .eq('status', PLATITA)
        .not('telegram_id', 'is', null)
        .is('telegram_final_trimis_la', null)
        .gte('departure_at', iso(nowMs - FEREASTRA_CITIRE_FINAL_MS))
        .lte('departure_at', iso(nowMs))
        .order('departure_at', { ascending: true })
        .limit(LIMITA_RANDURI);
      verifica(error, 'bilete_comenzi după cursă');
      return comenziScadentePentruFinal(await cuSfarsitulCursei(db(), (data as RandFinal[] | null) ?? []), nowMs);
    },

    async marcheazaFinalTrimis(cod) {
      const { data, error } = await db()
        .from('bilete_comenzi')
        .update({ telegram_final_trimis_la: new Date().toISOString() })
        .eq('cod', cod)
        .is('telegram_final_trimis_la', null)
        .select('cod');
      verifica(error, 'bilete_comenzi mesaj după cursă');
      return Array.isArray(data) && data.length > 0;
    },

    async comandaPentruFeedback(cod) {
      const { data, error } = await db().from('bilete_comenzi').select('cod, status, lang, telegram_id').eq('cod', cod).maybeSingle();
      verifica(error, 'bilete_comenzi feedback');
      return (data as ComandaFeedback | null) ?? null;
    },

    async scrieFeedback(cod, telegramId, feedback) {
      let q = db().from('bilete_comenzi')
        .update({ feedback_client: feedback, feedback_la: new Date().toISOString() })
        .eq('cod', cod)
        .eq('telegram_id', telegramId);
      if (feedback === 'bine') q = q.is('feedback_client', null);
      const { error } = await q;
      verifica(error, 'bilete_comenzi scrie feedback');
    },
  };
}

export const repoDupaCursa: RepoDupaCursa = creeazaRepoDupaCursa(getSupabase);
