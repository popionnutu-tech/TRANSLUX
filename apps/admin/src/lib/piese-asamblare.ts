import 'server-only';
import { getSupabase } from './supabase';
import type { Autor } from './audit';

// Asamblarea (migr. 400): din mai multe piese plus manoperă iese una singură. Exemplul real — se repară
// un motor cu piese luate din magazin, iar motorul reparat intră în depozitul Briceni și de acolo se
// montează pe autobuz.

export type ComponentaAsamblare = { part_id: number; qty: number };

export type RezultatAsamblare = {
  doc_id: number; cost_componente: number; manopera: number; cost_total: number; cost_unitar: number;
};

export async function creeazaAsamblare(p: {
  whSursa: number; whDest: number; produsId: number; produsQty: number;
  mechanicId: number | null; manopera: number; note: string | null; componente: ComponentaAsamblare[];
  userId: number | null;
}, autor: Autor): Promise<RezultatAsamblare> {
  const { data, error } = await getSupabase().rpc('piese_asamblare_creaza', {
    p_wh_sursa: p.whSursa, p_wh_dest: p.whDest, p_produs: p.produsId, p_produs_qty: p.produsQty,
    p_mechanic: p.mechanicId, p_manopera: p.manopera, p_note: p.note,
    p_lines: p.componente, p_user: p.userId, p_admin: autor.adminId, p_actor: autor.label,
  });
  // Codurile RPC se lasă NETRADUSE aici: fișierul de acțiuni le mapează în mesaje pentru om, ca peste tot
  // în modul. Traducerea în două locuri a produs deja o dată sfaturi contradictorii (vezi SHORTAGE la mutări).
  if (error) throw new Error((error.message || '').trim());
  return data as unknown as RezultatAsamblare;
}

// Asamblările recente, pentru lista din ecran.
export async function asamblariRecente(limit = 20) {
  const { data, error } = await getSupabase()
    .from('piese_stock_documents')
    .select('id, created_at, warehouse_id, to_warehouse_id, produs_part_id, produs_qty, manopera, note')
    .eq('doc_type', 'ASSEMBLY').order('id', { ascending: false }).limit(limit);
  if (error) throw new Error('Nu am putut încărca asamblările');
  return (data as any[]) || [];
}
