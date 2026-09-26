// Trimiterea O SINGURĂ DATĂ a mesajului de timp liber către ADMIN pentru un rând din lde_analiza_reguli (ION-94).
//
// Copia revendicării din /api/cron/lde-timp-liber/route.ts (ION-57), scoasă aici ca să o folosească ruta Drăxlmaier fără să
// atingă ruta LEAR (planul F3: «lde-timp-liber NU se atinge»). Rândul se REVENDICĂ înainte de trimitere, cu un singur UPDATE
// atomic pe versiunea citită (`rulat_la`), ca două apeluri apropiate să nu trimită amândouă; un rând rescris după mesaj
// (`rulat_la` mai nou) redeschide trimiterea. `force` sare revendicarea, dar scrie coloana după trimitere. Dacă mesajul nu
// pleacă, coloana revine la ce era, condiționat, ca să nu ștergem revendicarea altcuiva.
import type { SupabaseClient } from '@supabase/supabase-js';

export type RandAlerta = { id: string; saptamina: string; rulat_la: string; alerta_trimisa_la: string | null };
export type RezultatAlerta = { trimis: boolean; deja_trimis?: boolean; motiv?: string; status?: number };

export async function trimiteOdata(
  sb: Pick<SupabaseClient, 'from'>, row: RandAlerta, text: string,
  trimite: (text: string) => Promise<boolean>, opts: { force?: boolean; acum?: string } = {},
): Promise<RezultatAlerta> {
  const eligibil = !row.alerta_trimisa_la || row.alerta_trimisa_la < row.rulat_la;
  if (!eligibil && !opts.force) return { trimis: false, deja_trimis: true };
  const acum = opts.acum ?? new Date().toISOString();
  let revendicat = !!opts.force;
  if (!opts.force) {
    const { data: luat, error } = await sb.from('lde_analiza_reguli').update({ alerta_trimisa_la: acum })
      .eq('id', row.id).eq('rulat_la', row.rulat_la)
      .or(`alerta_trimisa_la.is.null,alerta_trimisa_la.lt."${row.rulat_la}"`)
      .select('id');
    if (error) return { trimis: false, motiv: `revendicarea a picat: ${error.message}`, status: 500 };
    revendicat = (luat?.length ?? 0) > 0;
  }
  if (!revendicat) return { trimis: false, deja_trimis: true };
  const ok = await trimite(text);
  if (!ok) {
    await sb.from('lde_analiza_reguli').update({ alerta_trimisa_la: row.alerta_trimisa_la }).eq('id', row.id).eq('alerta_trimisa_la', acum);
    return { trimis: false, motiv: 'alertAdmins a întors false', status: 502 };
  }
  if (opts.force) await sb.from('lde_analiza_reguli').update({ alerta_trimisa_la: acum }).eq('id', row.id);
  return { trimis: true };
}
