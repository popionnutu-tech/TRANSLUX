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

// ── Asamblarea ca PROCES (migr. 403) ──
// Componentele ies din stoc pe măsură ce sunt adăugate — „piesele nu rămân în magazin" (Mariana, 09.10).
// Produsul apare abia la închidere. Între cele două, valoarea e „în lucru".

export type AsamblareInLucru = {
  doc_id: number; created_at: string; zile_deschis: number;
  warehouse_id: number; din_depozit: string; to_warehouse_id: number; in_depozit: string;
  produs_part_id: number; produs: string; produs_qty: number; note: string | null;
  lacatus: string | null; componente: number; valoare_in_lucru: number;
};

export async function deschideAsamblare(p: {
  whSursa: number; whDest: number; produsId: number; produsQty: number;
  mechanicId: number | null; note: string | null;
}, autor: Autor): Promise<number> {
  const { data, error } = await getSupabase().rpc('piese_asamblare_deschide', {
    p_wh_sursa: p.whSursa, p_wh_dest: p.whDest, p_produs: p.produsId, p_produs_qty: p.produsQty,
    p_mechanic: p.mechanicId, p_note: p.note, p_user: null,
    p_admin: autor.adminId, p_actor: autor.label,
  });
  if (error) throw new Error((error.message || '').trim());
  return data as unknown as number;
}

export async function adaugaComponenta(docId: number, partId: number, qty: number, pesteStoc: boolean, autor: Autor) {
  const { data, error } = await getSupabase().rpc('piese_asamblare_adauga', {
    p_doc: docId, p_part: partId, p_qty: qty, p_peste_stoc: pesteStoc,
    p_user: null, p_admin: autor.adminId, p_actor: autor.label,
  });
  if (error) throw new Error((error.message || '').trim());
  return data as { line_id: number; cost: number; lipsa: number };
}

export async function inchideAsamblare(docId: number, manopera: number, autor: Autor) {
  const { data, error } = await getSupabase().rpc('piese_asamblare_inchide', {
    p_doc: docId, p_manopera: manopera, p_user: null, p_admin: autor.adminId, p_actor: autor.label,
  });
  if (error) throw new Error((error.message || '').trim());
  return data as unknown as RezultatAsamblare;
}

export async function anuleazaAsamblare(docId: number, autor: Autor) {
  const { data, error } = await getSupabase().rpc('piese_asamblare_anuleaza', {
    p_doc: docId, p_user: null, p_admin: autor.adminId, p_actor: autor.label,
  });
  if (error) throw new Error((error.message || '').trim());
  return data as { doc_id: number; intoarse: number };
}

export async function asamblariInLucru(): Promise<AsamblareInLucru[]> {
  const { data, error } = await getSupabase().from('piese_asamblari_in_lucru').select('*');
  if (error) throw new Error('Nu am putut încărca asamblările în lucru');
  return (data as AsamblareInLucru[]) || [];
}

// Componentele deja adăugate pe un document deschis.
export async function componenteAsamblare(docId: number) {
  const { data, error } = await getSupabase()
    .from('piese_stock_document_lines')
    .select('id, part_id, qty, unit_cost, piese_parts(name_ro, name_long, article_code, unit)')
    .eq('document_id', docId).order('id');
  if (error) throw new Error('Nu am putut încărca componentele');
  return ((data as any[]) || []).map((l) => {
    const p = Array.isArray(l.piese_parts) ? l.piese_parts[0] : l.piese_parts;
    return {
      id: l.id, part_id: l.part_id, qty: Number(l.qty), unit_cost: Number(l.unit_cost),
      nume: (p?.name_ro && String(p.name_ro).trim()) || p?.name_long || `#${l.part_id}`,
      articol: p?.article_code || '', unit: p?.unit || 'buc',
    };
  });
}
