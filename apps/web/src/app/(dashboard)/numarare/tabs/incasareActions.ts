'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

// ─── Типы ───

export type IncasareStatus = 'ok' | 'underpaid' | 'overpaid' | 'no_cashin' | 'no_numarare';

export interface IncasareRow {
  driver_id: string | null;
  driver_name: string | null;
  cashin_sofer_id: string | null;  // deprecat, ramane null
  numarare_lei: number;
  incasare_lei: number;            // total: cash + card
  incasare_numerar: number;        // doar cash
  incasare_card: number;           // total - cash
  plati: number;
  lgotniki_count: number;
  dop_rashodi: number;
  diff: number;
  status: IncasareStatus;
}

export interface UnmappedTomberon {
  sofer_id: string;                // numarul chitantei (ex: 0945125)
  ziua: string;                    // data chitantei
  plati: number;
  incasare_lei: number;
}

const ADMIN_ROLES = ['ADMIN', 'ADMIN_CAMERE'] as const;

export async function getIncasareReport(
  fromDate: string,
  toDate: string,
): Promise<{ rows?: IncasareRow[]; unmapped?: UnmappedTomberon[]; error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!ADMIN_ROLES.includes(session.role as any)) {
    return { error: 'Acces interzis' };
  }

  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_incasare_report', {
    p_from: fromDate,
    p_to: toDate || fromDate,
  });

  if (error) return { error: error.message };

  const payload = data as { rows?: IncasareRow[]; unmapped?: UnmappedTomberon[] } | null;
  return {
    rows: payload?.rows || [],
    unmapped: payload?.unmapped || [],
  };
}
