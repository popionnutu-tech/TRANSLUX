import { getSupabase } from './supabase';

// Strat de SCRIERE pentru nomenclatoarele modulului „Piese".
// Citirile există deja în piese.ts / piese-ops.ts; aici sunt doar create/update.
// Autorizarea pe rol se face în nomenclator/actions.ts (un singur loc).

type SbResult = { error: { message: string; code?: string } | null };
function check(r: SbResult) {
  if (r.error) {
    if (r.error.code === '23505') throw new Error('Există deja o înregistrare cu această valoare (cod/cod de bare duplicat)');
    if (r.error.code === '23503') throw new Error('Categoria/grupa selectată nu mai există — reîncarcă pagina și alege din nou');
    throw new Error(r.error.message);
  }
}
const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const txtOrNull = (v: unknown) => txt(v) || null;

// ── Depozite ──
export async function createWarehouse(d: any) {
  if (!txt(d.code) || !txt(d.name)) throw new Error('Codul și denumirea sunt obligatorii');
  check(await getSupabase().from('piese_warehouses').insert({ code: txt(d.code).toUpperCase(), name: txt(d.name), kind: d.kind === 'SHOP' ? 'SHOP' : 'INTERNAL' }));
}
export async function updateWarehouse(id: number, d: any) {
  if (!txt(d.code) || !txt(d.name)) throw new Error('Codul și denumirea sunt obligatorii');
  check(await getSupabase().from('piese_warehouses').update({ code: txt(d.code).toUpperCase(), name: txt(d.name), kind: d.kind === 'SHOP' ? 'SHOP' : 'INTERNAL' }).eq('id', id));
}

// ── Grupe de piese ──
export async function createGroup(d: any) {
  if (!txt(d.name_ro)) throw new Error('Denumirea grupei este obligatorie');
  check(await getSupabase().from('piese_part_groups').insert({ name_ro: txt(d.name_ro), name_ru: txtOrNull(d.name_ru), markup_pct: Number(d.markup_pct) || 0, norm_km: d.norm_km === '' || d.norm_km == null ? null : Number(d.norm_km) }));
}
export async function updateGroup(id: number, d: any) {
  if (!txt(d.name_ro)) throw new Error('Denumirea grupei este obligatorie');
  check(await getSupabase().from('piese_part_groups').update({ name_ro: txt(d.name_ro), name_ru: txtOrNull(d.name_ru), markup_pct: Number(d.markup_pct) || 0, norm_km: d.norm_km === '' || d.norm_km == null ? null : Number(d.norm_km) }).eq('id', id));
}

// ── Piese (catalog) ──
// Grupa (categoria) e obligatorie (group_id NOT NULL) și denumirea. Restul opțional.
// Stocul NU se atinge aici — o piesă nouă pornește cu stoc 0; stocul intră prin Prihod/Inventar.
const partRow = (d: any) => ({
  group_id: Number(d.group_id),
  name_long: txt(d.name_long),
  manufacturer: txtOrNull(d.manufacturer),
  model: txtOrNull(d.model),
  article_code: txtOrNull(d.article_code),
  oem_code: txtOrNull(d.oem_code),
  barcode: txtOrNull(d.barcode),
  unit: txt(d.unit) || 'buc',
  is_for_sale: d.is_for_sale === true || d.is_for_sale === 'true' || d.is_for_sale === '1' || d.is_for_sale === 'da',
});
function validatePart(d: any) {
  if (!Number(d.group_id)) throw new Error('Grupa (categoria) este obligatorie');
  if (!txt(d.name_long)) throw new Error('Denumirea piesei este obligatorie');
}
export async function createPart(d: any): Promise<{ id: number }> {
  validatePart(d);
  const { data, error } = await getSupabase().from('piese_parts').insert(partRow(d)).select('id').single();
  check({ error });
  return { id: (data as { id: number }).id };
}
export async function updatePart(id: number, d: any) {
  // Atenție: e un „replace complet" al coloanelor editabile (partRow). Formularul PartForm trimite mereu
  // toate câmpurile (prefill din loadPart), deci nu se golește nimic accidental. Dacă adaugi o coloană
  // nouă editabilă la piese_parts, adaug-o și în partRow + PartForm, altfel update-ul o resetează.
  validatePart(d);
  check(await getSupabase().from('piese_parts').update(partRow(d)).eq('id', id));
}

// ── Furnizori ──
export async function createSupplier(d: any) {
  if (!txt(d.name)) throw new Error('Denumirea furnizorului este obligatorie');
  check(await getSupabase().from('piese_suppliers').insert({ name: txt(d.name), idno: txtOrNull(d.idno), contact: txtOrNull(d.contact) }));
}
export async function updateSupplier(id: number, d: any) {
  if (!txt(d.name)) throw new Error('Denumirea furnizorului este obligatorie');
  check(await getSupabase().from('piese_suppliers').update({ name: txt(d.name), idno: txtOrNull(d.idno), contact: txtOrNull(d.contact) }).eq('id', id));
}

// ── Clienți ──
export async function createClient(d: any) {
  if (!txt(d.name)) throw new Error('Denumirea clientului este obligatorie');
  check(await getSupabase().from('piese_clients').insert({ name: txt(d.name), idno: txtOrNull(d.idno), bank: txtOrNull(d.bank), address: txtOrNull(d.address) }));
}
export async function updateClient(id: number, d: any) {
  if (!txt(d.name)) throw new Error('Denumirea clientului este obligatorie');
  check(await getSupabase().from('piese_clients').update({ name: txt(d.name), idno: txtOrNull(d.idno), bank: txtOrNull(d.bank), address: txtOrNull(d.address) }).eq('id', id));
}

// ── Mecanici ──
export async function createMechanic(d: any) {
  if (!txt(d.name)) throw new Error('Numele mecanicului este obligatoriu');
  check(await getSupabase().from('piese_mechanics').insert({ name: txt(d.name) }));
}
export async function updateMechanic(id: number, d: any) {
  if (!txt(d.name)) throw new Error('Numele mecanicului este obligatoriu');
  check(await getSupabase().from('piese_mechanics').update({ name: txt(d.name) }).eq('id', id));
}

// ── Motive defecțiune ──
export async function createReason(d: any) {
  if (!txt(d.name)) throw new Error('Denumirea motivului este obligatorie');
  check(await getSupabase().from('piese_breakdown_reasons').insert({ name: txt(d.name), category: txtOrNull(d.category) }));
}
export async function updateReason(id: number, d: any) {
  if (!txt(d.name)) throw new Error('Denumirea motivului este obligatorie');
  check(await getSupabase().from('piese_breakdown_reasons').update({ name: txt(d.name), category: txtOrNull(d.category) }).eq('id', id));
}
