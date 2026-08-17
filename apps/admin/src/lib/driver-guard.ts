import { getSupabase } from '@/lib/supabase';

/**
 * Un șofer fără telefon pus pe o cursă din orar face cursa să DISPARĂ de pe
 * translux.md — site-ul sare peste ea când lipsește numărul
 * (apps/web/src/app/(public)/actions.ts:490). Așa a stat ascunsă cursa Otaci 16:25.
 *
 * Trigger-ele din migrațiile 254/256 păzesc tabela `drivers` (adăugarea unui șofer
 * nou), dar ecranele de grafic scriu în `daily_assignments` — acolo trigger-ul tace.
 * De aceea verificarea stă pe fiecare drum prin care un OM alege un șofer.
 *
 * Intenționat NU e trigger pe `daily_assignments`: cronul de copiere pe ziua
 * următoare inserează toate rândurile într-un singur `insert`, deci un rând refuzat
 * ar lăsa ziua întreagă fără grafic. Automatul copiază doar ce a trecut deja pe aici.
 *
 * Întoarce mesajul de eroare sau null dacă totul e în regulă.
 */
export async function verificaTelefonSofer(driverId: string | null): Promise<string | null> {
  if (!driverId) return null;
  const { data, error } = await getSupabase()
    .from('drivers').select('full_name, phone').eq('id', driverId).maybeSingle();
  // eroarea nu se înghite: o verificare sărită tăcut e mai rea decât una care se plânge
  if (error) return `Verificarea șoferului a eșuat: ${error.message}`;
  if (data && !data.phone?.trim()) {
    return `${data.full_name} n-are telefon în bază — completează-l întâi, altfel cursa dispare de pe translux.md`;
  }
  return null;
}
