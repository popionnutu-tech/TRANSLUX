'use server';

import { revalidatePath } from 'next/cache';
import { verifySession, requireRole } from '@/lib/auth';
import { createPart, updatePart, setPartLocation,
  listManufacturers, listCarModels, addManufacturer, addCarModel } from '@/lib/piese-nomenclator';
import { partLabel, getPartById, getPartLocation, partLabelInfo } from '@/lib/piese';
import { PART_WRITE_ROLES, assertWarehouseAllowed, userWarehouseId } from '@/lib/piese-access';
import { suggestLocation } from '@/lib/piese';

// Cine poate adăuga/edita o piesă în catalog: aceleași roluri care fac recepția (prihod) — depozitar,
// gestionar (depozitar intern), admin. Vânzătorul NU creează piese. Sursă unică de autorizare (server action).
function requirePartWrite() {
  return verifySession().then((s) => requireRole(s, ...PART_WRITE_ROLES)); // requireRole întoarce Session (non-null) sau aruncă
}

// Creează sau actualizează o piesă. Întoarce id + eticheta bogată ca apelantul (Prihod) s-o poată
// selecta imediat, fără un apel suplimentar de căutare. Piesa pornește cu stoc 0.
export async function savePart(data: Record<string, unknown>, id?: number): Promise<{ id: number; label: string }> {
  await requirePartWrite();
  let partId: number;
  if (id && id > 0) { await updatePart(id, data); partId = id; }
  else { partId = (await createPart(data)).id; }
  revalidatePath('/piese/catalog');
  revalidatePath('/piese/nomenclator');
  return { id: partId, label: partLabel(data) };
}

// Câmpurile editabile ale unei piese, pentru prefill în formularul de editare.
export async function loadPart(id: number): Promise<Record<string, unknown> | null> {
  await requirePartWrite();
  if (!id || id <= 0) return null;
  return (await getPartById(id)) as Record<string, unknown> | null;
}

// Locația piesei într-un depozit (STELAJ-RÂND-POLIȚĂ-CELULĂ + stoc minim) — pentru editarea din Catalog.
export async function loadPartLocation(partId: number, warehouseId: number): Promise<{ location_label: string; min_qty: number } | null> {
  const session = await requirePartWrite();
  if (!partId || !warehouseId) return null;
  await assertWarehouseAllowed(session, warehouseId); // Etapa 2: doar locațiile depozitului lui
  return (await getPartLocation(partId, warehouseId)) as { location_label: string; min_qty: number } | null;
}

export async function savePartLocation(partId: number, warehouseId: number, data: { location_label?: string; min_qty?: number | string }): Promise<{ ok: true }> {
  const session = await requirePartWrite();
  await assertWarehouseAllowed(session, warehouseId); // Etapa 2: nu poate seta locația/min în alt depozit
  await setPartLocation(partId, warehouseId, data);
  revalidatePath('/piese/harta');
  revalidatePath('/piese/stoc');
  return { ok: true };
}

// Datele etichetei de tipărit (denumire, marcă, cod, stoc, preț) — citire pentru orice rol al modulului Piese.
// Stocul e din depozitul contului (sau total pentru admin/cont fără depozit). NU expune costul de achiziție.
export async function partLabelData(partId: number) {
  const session = requireRole(await verifySession(), 'ADMIN', 'DEPOZITAR', 'VINZATOR', 'CONTABIL', 'MANAGER', 'GESTIONAR');
  if (!partId || partId <= 0) return null;
  return partLabelInfo(partId, await userWarehouseId(session));
}

// Propune locația unei piese noi după grupa ei (unde stau deja surorile ei în acest depozit).
// Doar sugestie — cine o folosește o poate schimba înainte de salvare.
export async function suggestPartLocation(warehouseId: number, groupId: number): Promise<string | null> {
  const session = await requirePartWrite();
  if (!warehouseId || !groupId) return null;
  await assertWarehouseAllowed(session, warehouseId);
  return suggestLocation(Number(warehouseId), Number(groupId));
}

// ── Nomenclatoarele de producători și mărci (migr. 312) ──
// Cerut de Eduard: „то что вносил уже раз одно выдавать, с возможностью добавить в каталог новую фирму".
// Citirea e deschisă tuturor rolurilor care pot scrie o piesă — e aceeași listă pe care oricum o vor vedea
// în formular; ADĂUGAREA trece prin aceeași gardă, fiindcă îmbogățește un nomenclator comun.
export async function loadPartLookups(): Promise<{ manufacturers: string[]; carModels: string[] }> {
  await requirePartWrite();
  const [m, c] = await Promise.all([listManufacturers(), listCarModels()]);
  return { manufacturers: m.map((x) => x.name), carModels: c.map((x) => x.name) };
}

// Întoarce ortografia CANONICĂ, nu ce s-a tastat: dacă cineva scrie „trw" iar catalogul are „TRW", piesa
// primește „TRW". Altfel am fi creat exact perechea de variante pe care nomenclatorul o elimină.
export async function addPartLookup(kind: 'manufacturer' | 'carModel', name: string): Promise<{ name: string }> {
  await requirePartWrite();
  const v = String(name ?? '');
  const canonical = kind === 'manufacturer' ? await addManufacturer(v) : await addCarModel(v);
  return { name: canonical };
}

// „Copiază de la o piesă existentă" — cerut de Eduard: aceeași piesă, alt producător, iar denumirea se
// retasta de la zero (și ieșea altfel scrisă la fiecare introducere).
//
// Se copiază ce ține de IDENTITATEA piesei (denumire, grupă, unitate, marca mașinii). NU se copiază ce e
// specific exemplarului: producătorul, articolul, codul OEM și codurile de bare — exact câmpurile prin care
// noua poziție diferă de cea veche. Dacă le-am copia, s-ar salva un duplicat cu aceleași coduri, iar
// unicitatea codului de bare ar respinge salvarea abia la final.
export async function copyPartFields(sourceId: number): Promise<Record<string, unknown> | null> {
  await requirePartWrite();
  const src = await getPartById(Number(sourceId));
  if (!src) return null;
  const p = src as Record<string, unknown>;
  return {
    group_id: p.group_id, name_long: p.name_long, name_ro: p.name_ro,
    model: p.model, unit: p.unit, is_for_sale: p.is_for_sale,
    manufacturer: '', article_code: '', oem_code: '', barcodes: [],
  };
}
