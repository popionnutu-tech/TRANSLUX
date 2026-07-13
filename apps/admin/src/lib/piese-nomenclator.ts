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
  name_ro: txtOrNull(d.name_ro),
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

// ── Locația piesei (per depozit) ──
// piese_part_locations: UNIQUE(part_id, warehouse_id), location_label NOT NULL, min_qty default 0.
// Eticheta goală → ștergem rândul (curăță locația, fiindcă min_qty nu poate exista fără label NOT NULL).
// Altfel upsert (o singură locație per piesă+depozit). Alimentează Harta + alertele „de comandat".
export async function setPartLocation(partId: number, warehouseId: number, d: any) {
  if (!Number(partId) || !Number(warehouseId)) throw new Error('Piesă/depozit invalide');
  const label = txt(d.location_label);
  const minQty = Math.max(0, Number(d.min_qty) || 0);
  const sb = getSupabase();
  if (!label) {
    check(await sb.from('piese_part_locations').delete().eq('part_id', partId).eq('warehouse_id', warehouseId));
    return;
  }
  check(await sb.from('piese_part_locations').upsert(
    { part_id: partId, warehouse_id: warehouseId, location_label: label, min_qty: minQty },
    { onConflict: 'part_id,warehouse_id' },
  ));
}

// Upsert în MASĂ al locațiilor pentru un depozit — o singură cerere (folosit la „Inventar de la zero", unde
// se amplasează zeci de piese odată). Doar etichete ne-goale (ștergerea rămâne pe calea individuală de mai sus).
// NU trimitem min_qty: la INSERT ia default 0, iar la conflict NU-l suprascriem (păstrăm min-ul existent).
export async function setPartLocationsBulk(warehouseId: number, items: { part_id: number; location_label: string }[]): Promise<number> {
  const wid = Number(warehouseId);
  if (!wid) throw new Error('Depozit invalid');
  const rows = items
    .filter((it) => Number(it.part_id) && txt(it.location_label))
    .map((it) => ({ part_id: Number(it.part_id), warehouse_id: wid, location_label: txt(it.location_label) }));
  if (!rows.length) return 0;
  check(await getSupabase().from('piese_part_locations').upsert(rows, { onConflict: 'part_id,warehouse_id' }));
  return rows.length;
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

// Găsește (sau creează) un furnizor după nume — pentru furnizorul fictiv „SOLD INIȚIAL" (stocul de pornire cu cost).
// Idempotent pe nume. Fără UNIQUE pe `name`, o cursă teoretică (2 salvări simultane) ar putea crea 2 rânduri —
// risc neglijabil la un depozitar care lucrează secvențial; ambele ar funcționa oricum ca furnizor de sold inițial.
export async function ensureSupplierByName(name: string): Promise<number> {
  const nm = txt(name);
  if (!nm) throw new Error('Nume furnizor gol');
  const sb = getSupabase();
  const { data: found, error: selErr } = await sb.from('piese_suppliers').select('id').eq('name', nm).limit(1).maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (found) return (found as { id: number }).id;
  const { data, error } = await sb.from('piese_suppliers').insert({ name: nm }).select('id').single();
  check({ error });
  return (data as { id: number }).id;
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
