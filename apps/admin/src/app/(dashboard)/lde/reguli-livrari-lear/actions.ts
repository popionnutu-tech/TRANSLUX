'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';

/**
 * Regulile livrării LEAR Ungheni — Ion, 24.09.2026: «regulile pune in nomenclator LDE ca
 * Reguli Livrari Lear». Textul trăiește într-un singur loc, `lde_uzine.reguli_livrare`
 * (migr. 386), și se editează pe /lde/livrare-reguli; pagina asta doar îl arată.
 */
export type ReguliLear = { text: string | null; marcata_la: string | null; validata: boolean };

export async function getReguliLear(): Promise<ReguliLear> {
  requireRole(await verifySession(), 'ADMIN');
  const { data, error } = await getSupabase().from('lde_uzine')
    .select('reguli_livrare,reguli_livrare_la,livrare_validata').eq('id', 'LEAR_UNGHENI').maybeSingle();
  if (error) throw new Error(`nu s-au putut citi regulile LEAR: ${error.message}`);
  return { text: data?.reguli_livrare ?? null, marcata_la: data?.reguli_livrare_la ?? null, validata: !!data?.livrare_validata };
}
