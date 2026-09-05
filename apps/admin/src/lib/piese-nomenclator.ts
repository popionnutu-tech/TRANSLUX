import { getSupabase } from './supabase';
import { locationError, normalizeLocation, LOCATION_FORMAT } from './piese-location';

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
  // `barcode` NU se scrie de aici: e oglinda codului principal din `piese_part_barcodes`, ținută de
  // triggerul din migr. 312. Dacă am scrie-o și noi, o piesă cu două coduri ar avea pe etichetă unul care
  // nu mai e în listă — două adevăruri pentru același lucru. Codurile se trimit prin `syncPartBarcodes`.
  unit: txt(d.unit) || 'buc',
  is_for_sale: d.is_for_sale === true || d.is_for_sale === 'true' || d.is_for_sale === '1' || d.is_for_sale === 'da',
});
function validatePart(d: any) {
  if (!Number(d.group_id)) throw new Error('Grupa (categoria) este obligatorie');
  if (!txt(d.name_long)) throw new Error('Denumirea piesei este obligatorie');
}
// Codurile de bare ale unei piese, în ordine: PRIMUL e cel principal (apare pe etichetă).
// Aceeași piesă vine de la furnizori diferiți, fiecare cu ambalajul lui — cu o singură coloană, al doilea
// cod îl ștergea pe primul, iar scanarea vechiului ambalaj nu mai găsea nimic (cerut de Eduard).
export function cleanBarcodes(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : input == null ? [] : [input];
  const out: string[] = [];
  for (const v of arr) {
    const c = txt(v);
    // Comparația de duplicate e insensibilă la litere, ca unicitatea din bază.
    if (c && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c);
  }
  return out;
}

// Aduce lista de coduri a piesei la exact `codes`, ÎNTR-O SINGURĂ TRANZACȚIE.
//
// Varianta anterioară făcea patru cereri separate, deci patru tranzacții — iar prima ridica marcajul de
// „principal", ceea ce golea imediat codul de pe etichetă. Dacă a treia eșua (cel mai banal caz: codul
// introdus aparține altei piese), piesa rămânea fără niciun cod, permanent, iar omul vedea doar
// „cod duplicat". Pierdere de date dintr-o greșeală de tastare.
export async function syncPartBarcodes(partId: number, codes: string[]) {
  const { error } = await getSupabase().rpc('piese_set_part_barcodes', {
    p_part: partId, p_codes: cleanBarcodes(codes),
  });
  if (error) {
    const m = error.message || '';
    // RPC-ul spune CARE cod e ocupat; mesajul din bază singur n-ar fi ajutat pe nimeni.
    const taken = m.match(/BARCODE_TAKEN:(.+)/);
    if (taken) throw new Error(`Codul de bare „${taken[1].trim()}" e deja folosit de altă piesă.`);
    if (m.includes('BAD_PART')) throw new Error('Piesa nu mai există — reîncarcă pagina.');
    throw new Error('Nu am putut salva codurile de bare. Reîncearcă.');
  }
}

// Producătorul și marca trec ÎNTOTDEAUNA prin nomenclator, la salvare, pe server.
//
// Înainte, formularul decidea: dacă valoarea tastată exista deja (comparat insensibil la litere), nu mai
// apela nimic — deci cine scria „trw" peste catalogul care are „TRW" salva pe piesă „trw". Adică exact
// perechea de variante pe care nomenclatorul o elimină, reapărută în filtrul din „Stoc". Decizia nu poate
// sta la client: doar serverul știe ortografia stocată.
async function canonicalPart(d: any) {
  const row = partRow(d);
  if (row.manufacturer) row.manufacturer = (await addManufacturer(row.manufacturer)) || null;
  if (row.model) row.model = (await addCarModel(row.model)) || null;
  return row;
}

export async function createPart(d: any): Promise<{ id: number }> {
  validatePart(d);
  const { data, error } = await getSupabase().from('piese_parts').insert(await canonicalPart(d)).select('id').single();
  check({ error });
  const id = (data as { id: number }).id;
  // `d.barcodes` (listă) sau `d.barcode` (un singur cod) — al doilea pentru apelanții vechi.
  const codes = cleanBarcodes(d.barcodes ?? d.barcode);
  if (codes.length) await syncPartBarcodes(id, codes);
  return { id };
}
export async function updatePart(id: number, d: any) {
  // Atenție: e un „replace complet" al coloanelor editabile (partRow). Formularul PartForm trimite mereu
  // toate câmpurile (prefill din loadPart), deci nu se golește nimic accidental. Dacă adaugi o coloană
  // nouă editabilă la piese_parts, adaug-o și în partRow + PartForm, altfel update-ul o resetează.
  validatePart(d);
  check(await getSupabase().from('piese_parts').update(await canonicalPart(d)).eq('id', id));
  // `barcodes` lipsă = apelant vechi care nu știe de coduri multiple → nu atingem lista existentă.
  // Un array gol înseamnă „șterge toate", și e trimis explicit de formular.
  if (d.barcodes !== undefined || d.barcode !== undefined) {
    await syncPartBarcodes(id, cleanBarcodes(d.barcodes ?? d.barcode));
  }
}

// ── Nomenclatoare: producători și mărci de mașini (migr. 312) ──
// Textul liber a produs „TRW" și „Trw", „Higer" și „HIGER NOU", plus un producător numit „111".
// Filtrele din „Stoc" listează valorile distincte, deci fiecare variantă apărea ca opțiune separată.
async function listLookup(table: string): Promise<{ id: number; name: string }[]> {
  const { data, error } = await getSupabase().from(table).select('id, name').eq('active', true).order('name');
  if (error) throw new Error('Nu am putut încărca nomenclatorul');
  return ((data as { id: number; name: string }[]) || []);
}
export const listManufacturers = () => listLookup('piese_manufacturers');
export const listCarModels = () => listLookup('piese_car_models');

// Adaugă în catalog și întoarce ortografia CANONICĂ. Dacă valoarea există deja scrisă altfel („trw" peste
// „TRW"), se întoarce cea din catalog: altfel am fi acceptat tăcut a doua variantă a aceluiași lucru.
// Întoarce ortografia CANONICĂ a unei valori, adăugând-o în catalog dacă lipsește.
//
// REGULA: ascunderea (`active = false`) afectează DOAR sugestiile, niciodată salvarea. Varianta
// anterioară arunca eroare pentru o intrare ascunsă — ceea ce bloca editarea TUTUROR pieselor care o
// purtau: un producător ascuns făcea cele 11 piese ale lui imposibil de salvat, chiar și pentru o
// corectură de denumire fără legătură. Ecranul promite „rămâne pe piesele existente"; codul trebuie să
// respecte promisiunea.
//
// Nu reactivează nimic: o intrare scoasă de administrator rămâne scoasă din sugestii.
async function canonicalizeLookup(table: string, name: string): Promise<string> {
  const v = txt(name);
  if (!v) return '';
  if (v.length > 80) throw new Error('Denumirea producătorului/mărcii e prea lungă (maxim 80 de caractere)');
  const sb = getSupabase();
  // `ilike` tratează `%` și `_` ca JOKER. Neescapate, cine tasta „TR%" primea înapoi „TRW" ca ortografie
  // canonică și piesa se salva cu producătorul greșit — substituție tăcută pornită dintr-un typo.
  const pattern = v.replace(/([\\%_])/g, '\\$1');
  const { data: found, error: eFind } = await sb.from(table).select('id, name').ilike('name', pattern).maybeSingle();
  // Eroarea NU se înghite: tratată ca „nu există", ar duce la un INSERT care dublează intrarea.
  if (eFind) throw new Error('Nu am putut verifica nomenclatorul. Reîncearcă.');
  if (found) return (found as { name: string }).name;
  const { error } = await sb.from(table).insert({ name: v });
  if (error) {
    if (error.code === '23505') {
      // A intrat între timp din altă sesiune: recitim, ca să întoarcem ortografia STOCATĂ, nu ce s-a tastat.
      const { data: race } = await sb.from(table).select('name').ilike('name', pattern).maybeSingle();
      return ((race as { name: string } | null)?.name) ?? v;
    }
    throw new Error('Nu am putut adăuga în nomenclator. Reîncearcă.');
  }
  return v;
}

export const addManufacturer = (name: string) => canonicalizeLookup('piese_manufacturers', name);
export const addCarModel = (name: string) => canonicalizeLookup('piese_car_models', name);

// ── Locația piesei (per depozit) ──
// piese_part_locations: UNIQUE(part_id, warehouse_id), location_label NOT NULL, min_qty default 0.
// Eticheta goală → ștergem rândul (curăță locația, fiindcă min_qty nu poate exista fără label NOT NULL).
// Altfel upsert (o singură locație per piesă+depozit). Alimentează Harta + alertele „de comandat".
export async function setPartLocation(partId: number, warehouseId: number, d: any) {
  if (!Number(partId) || !Number(warehouseId)) throw new Error('Piesă/depozit invalide');
  const minQty = Math.max(0, Number(d.min_qty) || 0);
  // `location_label` NETRIMIS (undefined) = „nu atinge locația, schimb doar stocul minim". Fără distincția
  // asta, un apelant care trimite doar min_qty ar ȘTERGE rândul de locație — și, mai subtil, o piesă cu
  // etichetă veche neconformă ar deveni nesalvabilă pe stoc minim, deși locația ei nici nu se modifică.
  if (d.location_label === undefined) {
    check(await getSupabase().from('piese_part_locations')
      .update({ min_qty: minQty }).eq('part_id', partId).eq('warehouse_id', warehouseId));
    return;
  }
  const raw = txt(d.location_label);
  // Aceeași validare ca la inventarul inițial — altfel calea „editează piesa din Catalog" ar fi o portiță
  // prin care intră etichete pe care harta nu le poate desena.
  const locErr = locationError(raw);
  if (locErr) throw new Error(`Locație în format greșit (${LOCATION_FORMAT}): ${locErr}`);
  const label = normalizeLocation(raw);
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
  // Normalizăm la scriere (majuscule, fără spații lângă cratime), ca „a-12 - 3" și „A-12-3" să fie
  // aceeași celulă pe hartă, nu două. Validarea o face apelantul înainte de a ajunge aici.
  const rows = items
    .filter((it) => Number(it.part_id) && txt(it.location_label))
    .map((it) => ({ part_id: Number(it.part_id), warehouse_id: wid, location_label: normalizeLocation(it.location_label) }));
  if (!rows.length) return 0;
  check(await getSupabase().from('piese_part_locations').upsert(rows, { onConflict: 'part_id,warehouse_id' }));
  return rows.length;
}

// ── Furnizori ──
export async function createSupplier(d: any) {
  if (!txt(d.name)) throw new Error('Denumirea furnizorului este obligatorie');
  check(await getSupabase().from('piese_suppliers').insert({ name: txt(d.name), idno: txtOrNull(d.idno), contact: txtOrNull(d.contact), phone2: txtOrNull(d.phone2), phone3: txtOrNull(d.phone3) }));
}
export async function updateSupplier(id: number, d: any) {
  if (!txt(d.name)) throw new Error('Denumirea furnizorului este obligatorie');
  check(await getSupabase().from('piese_suppliers').update({ name: txt(d.name), idno: txtOrNull(d.idno), contact: txtOrNull(d.contact), phone2: txtOrNull(d.phone2), phone3: txtOrNull(d.phone3) }).eq('id', id));
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

// ── Administrarea nomenclatoarelor (migr. 317) ──
// Un catalog în care se poate DOAR adăuga se degradează: oamenii tastează greșit, iar greșeala devine
// sugestie oficială pentru toți ceilalți. Migrația 312 a preluat și gunoiul existent („111",
// „Scoda Octavia 2020"), deci trebuie o cale de curățare — altfel cererea lui Eduard e doar mutată.
export type LookupKind = 'manufacturer' | 'carModel';
export type LookupRow = { id: number; name: string; active: boolean; partsCount: number };

// Numărul de piese e esențial: fără el nu se poate deosebi „111 — 1 piesă" de „TRW — 11 piese".
export async function listLookupAdmin(kind: LookupKind): Promise<LookupRow[]> {
  const { data, error } = await getSupabase().rpc('piese_lookup_admin', { p_kind: kind });
  if (error) throw new Error('Nu am putut încărca nomenclatorul');
  return ((data as any[]) || []).map((r) => ({
    id: Number(r.id), name: r.name as string, active: r.active === true, partsCount: Number(r.parts_count),
  }));
}

/**
 * Redenumire care MUTĂ ȘI PIESELE — miezul ecranului.
 *
 * Dacă noul nume există deja, nu e redenumire ci CONTOPIRE: piesele trec pe intrarea existentă, iar cea
 * veche dispare. Fără asta, „Trw" → „TRW" ar fi lovit indexul unic și n-ar fi existat nicio cale de a uni
 * două variante ale aceluiași producător — exact defectul de reparat.
 *
 * Totul într-un RPC: dacă rândul din nomenclator s-ar redenumi separat de piese și ceva ar pica la mijloc,
 * filtrul din „Stoc" ar arăta din nou două intrări — starea din care tocmai am ieșit.
 */
export async function renameLookup(kind: LookupKind, id: number, newName: string) {
  const { data, error } = await getSupabase().rpc('piese_rename_lookup', {
    p_kind: kind, p_id: id, p_new: newName,
  });
  if (error) {
    const m = error.message || '';
    if (m.includes('EMPTY_NAME')) throw new Error('Denumirea nu poate fi goală');
    if (m.includes('TOO_LONG')) throw new Error('Denumirea e prea lungă (maxim 80 de caractere)');
    if (m.includes('NO_ROW')) throw new Error('Intrarea nu mai există — reîncarcă pagina');
    const hidden = m.match(/TARGET_HIDDEN:(.+)/);
    if (hidden) throw new Error(`„${hidden[1].trim()}" e ascuns. Arată-l întâi, apoi contopește — altfel piesele ar ajunge pe o valoare care nu se mai propune.`);
    throw new Error('Nu am putut redenumi. Reîncearcă.');
  }
  const r = data as any;
  return {
    old: r.old as string, next: r.new as string, moved: Number(r.moved), merged: r.merged === true,
    targetId: r.target_id == null ? null : Number(r.target_id),
  };
}

// Scoate din sugestii FĂRĂ să atingă piesele: valoarea rămâne pe ele, doar nu se mai propune la
// introducere. Ștergerea nu e oferită — o intrare folosită de piese n-are ce să dispară.
export async function setLookupActive(kind: LookupKind, id: number, active: boolean) {
  const table = kind === 'manufacturer' ? 'piese_manufacturers' : 'piese_car_models';
  // `.select()` ca să știm dacă rândul a existat: fără el, un id inexistent nu e eroare în PostgREST, iar
  // ecranul ar fi confirmat „nu se mai propune" pentru o intrare care nu există, plus o urmă de audit
  // pentru ceva ce nu s-a întâmplat.
  const { data, error } = await getSupabase().from(table).update({ active }).eq('id', id).select('id');
  check({ error });
  if (!((data as unknown[]) || []).length) throw new Error('Intrarea nu mai există — reîncarcă pagina');
}
