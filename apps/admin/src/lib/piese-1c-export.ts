import 'server-only';
import { getSupabase } from './supabase';
import { buildSpisanieXML, type DateSpisanie, type LinieSpisanie } from './piese-1c-spisanie';
import { buildPeremXML, type DateMutare } from './piese-1c-perem';
import { buildPrihodXML, type DateRecepcie } from './piese-1c-prihod';

// Pregătește documentul 1C pentru o eliberare. Citește, VERIFICĂ, apoi compune.
//
// Garda e miezul acestui fișier, nu o formalitate: regulile 1C sincronizează strict după GUID, iar un GUID
// lipsă nu dă eroare la import — creează un articol NOU. Un export „reușit" cu o piesă nelegată ar dubla
// tăcut nomenclatorul contabilității. De aceea refuzăm ÎNAINTE, cu lista exactă a ce lipsește.

export type Lipsa = { ce: string; detaliu: string };

// Lista eliberărilor cu starea lor de pregătire, pentru ecranul de integrare.
//
// Se arată ÎNAINTE de a apăsa, nu după: „3 piese nelegate" citit dintr-o privire e altceva decât un buton
// care refuză la al treilea clic. Cifrele vin dintr-o singură interogare — nu una per document.
export type RandExport = {
  id: number; data: string; depozit: string; masina: string | null; lacatus: string | null;
  linii: number; suma: number; gata: boolean; motiv: string | null; trimis: boolean;
};

export async function eliberariDeExportat(limita = 100): Promise<RandExport[]> {
  const { data, error } = await getSupabase().rpc('piese_1c_eliberari', { p_limita: limita });
  if (error) throw new Error(error.message);
  return (data as RandExport[]) || [];
}

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}


// Un document ANULAT sau neîncheiat nu are ce căuta în contabilitate. Lista de pe ecran îl ascunde deja,
// dar adresa se poate deschide și direct, cu un număr scris de mână — iar o recepție anulată trimisă în
// 1C i-ar dubla contabilului marfa. Garda stă aici, lângă compunere, nu doar în listă.
function cerDocumentValid(status: string, docId: number): void {
  if (status !== 'CONFIRMED') {
    throw new Error(`Documentul ${docId} e în starea „${status}", nu confirmat — nu se trimite în 1C.`);
  }
}

export async function pregatesteSpisanie(docId: number): Promise<
  { ok: true; xml: string; nume: string; linii: number } | { ok: false; lipsuri: Lipsa[] }
> {
  const sb = getSupabase();

  const doc = check(await sb.from('piese_stock_documents')
    .select('id, doc_type, status, created_at, invoice_date, warehouse_id, vehicle_id, mechanic_id')
    .eq('id', docId).maybeSingle()) as {
      id: number; doc_type: string; status: string; created_at: string; invoice_date: string | null;
      warehouse_id: number; vehicle_id: number | null; mechanic_id: number | null } | null;
  if (!doc) throw new Error('Documentul nu există.');
  if (doc.doc_type !== 'ISSUE') throw new Error('Doar eliberările se trimit ca «Списание запчастей».');
  cerDocumentValid(doc.status, docId);

  const [wh, veh, mec, linii] = await Promise.all([
    sb.from('piese_warehouses').select('name, guid_1c').eq('id', doc.warehouse_id).maybeSingle(),
    doc.vehicle_id
      ? sb.from('piese_vehicles').select('plate, guid_1c_activitate').eq('id', doc.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    doc.mechanic_id
      ? sb.from('piese_mechanics').select('name, guid_1c').eq('id', doc.mechanic_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb.rpc('piese_1c_spisanie_linii', { p_doc: docId }),
  ]);
  const depozit = check(wh) as { name: string; guid_1c: string | null } | null;
  const masina = check(veh) as { plate: string; guid_1c_activitate: string | null } | null;
  const lacatus = check(mec) as { name: string; guid_1c: string | null } | null;
  const randuri = (check(linii) as { part_id: number; part_name: string; qty: number; suma: number; guid_1c: string | null }[]) || [];

  const lipsuri: Lipsa[] = [];
  if (!depozit?.guid_1c) lipsuri.push({ ce: 'Depozit', detaliu: depozit?.name ?? `#${doc.warehouse_id}` });
  // Mașina e OBLIGATORIE: ea e „вид деятельности", adică singura dimensiune pe care contabilitatea ține
  // costul. Fără ea, cheltuiala ar intra nealocată.
  if (!doc.vehicle_id) lipsuri.push({ ce: 'Mașină', detaliu: 'documentul nu are mașină' });
  else if (!masina?.guid_1c_activitate) lipsuri.push({ ce: 'Mașină', detaliu: masina?.plate ?? `#${doc.vehicle_id}` });
  for (const l of randuri) if (!l.guid_1c) lipsuri.push({ ce: 'Piesă', detaliu: l.part_name });
  // Lăcătușul NU e obligatoriu: Mariana (17.09) — dacă nu se potrivește, câmpul rămâne gol în 1C.

  // Zero rânduri = document anulat integral (retur pe aceeași eliberare). Nu e o lipsă, e „nimic de trimis".
  if (!lipsuri.length && !randuri.length) {
    return { ok: false, lipsuri: [{ ce: 'Nimic de trimis', detaliu: 'toate piesele au fost returnate — consumul net e zero' }] };
  }
  if (lipsuri.length) return { ok: false, lipsuri };

  // GUID-ul documentului se atribuie ACUM, la prima exportare, și rămâne: cu el, o reexportare
  // actualizează documentul în 1C; fără el, l-ar dubla.
  const docGuid = check(await sb.rpc('piese_1c_doc_guid', { p_doc: docId })) as unknown as string;

  const date: DateSpisanie = {
    docGuid,
    // Data facturii FISCALE, dacă există; altfel ziua intrării în depozit. Contabilitatea are nevoie de
    // data documentului fiscal, nu de ziua în care marfa a ajuns pe raft — iar la noi cele două chiar
    // diferă: factura internă aduce piesele, cea fiscală vine peste o zi sau o săptămână (Eduard, 08.10).
    // Rezerva pe `created_at` e pentru documentele de dinainte de câmp și pentru cele fără factură.
    data: String(doc.invoice_date || doc.created_at).slice(0, 10),
    comentariu: `Creat de programul Piese (document ${docId})`,
    depozitGuid: depozit!.guid_1c!,
    masinaGuid: null,                       // ТранспортноеСредство rămâne gol — evidența e pe costuri
    activitateGuid: masina!.guid_1c_activitate!,
    lacatusGuid: lacatus?.guid_1c ?? null,
    linii: randuri.map<LinieSpisanie>((l) => ({
      partGuid: l.guid_1c!, partNume: l.part_name, qty: Number(l.qty), suma: Number(l.suma),
    })),
  };

  const reguli = check(await sb.from('piese_1c_config').select('reguli').eq('id', 1).maybeSingle()) as
    { reguli: string | null } | null;

  return {
    ok: true,
    xml: buildSpisanieXML(date, new Date().toISOString().slice(0, 19), reguli?.reguli ?? null),
    nume: `spisanie-${docId}.xml`,
    linii: randuri.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Mutările între depozite — documentul «Перемещение».

export type RandMutare = {
  id: number; data: string; din: string; spre: string | null;
  linii: number; suma: number; gata: boolean; motiv: string | null; trimis: boolean;
};

export async function mutariDeExportat(limita = 100): Promise<RandMutare[]> {
  const { data, error } = await getSupabase().rpc('piese_1c_mutari', { p_limita: limita });
  if (error) throw new Error(error.message);
  return (data as RandMutare[]) || [];
}

export async function pregatesteMutare(docId: number): Promise<
  { ok: true; xml: string; nume: string; linii: number } | { ok: false; lipsuri: Lipsa[] }
> {
  const sb = getSupabase();

  const doc = check(await sb.from('piese_stock_documents')
    .select('id, doc_type, status, created_at, warehouse_id, to_warehouse_id')
    .eq('id', docId).maybeSingle()) as {
      id: number; doc_type: string; status: string; created_at: string;
      warehouse_id: number; to_warehouse_id: number | null } | null;
  if (!doc) throw new Error('Documentul nu există.');
  if (doc.doc_type !== 'TRANSFER') throw new Error('Doar mutările se trimit ca «Перемещение».');
  cerDocumentValid(doc.status, docId);
  // Mutarea NU folosește `invoice_date`: nu are factură fiscală, e o deplasare internă. Data e ziua în
  // care marfa a plecat din depozit.

  const [sursa, dest, linii] = await Promise.all([
    sb.from('piese_warehouses').select('name, guid_1c, cont_1c').eq('id', doc.warehouse_id).maybeSingle(),
    doc.to_warehouse_id
      ? sb.from('piese_warehouses').select('name, guid_1c, cont_1c').eq('id', doc.to_warehouse_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb.rpc('piese_1c_mutare_linii', { p_doc: docId }),
  ]);
  type Dep = { name: string; guid_1c: string | null; cont_1c: string | null };
  const a = check(sursa) as Dep | null;
  const b = check(dest) as Dep | null;
  const randuri = (check(linii) as { part_id: number; part_name: string; qty: number; guid_1c: string | null }[]) || [];

  const lipsuri: Lipsa[] = [];
  if (!doc.to_warehouse_id) lipsuri.push({ ce: 'Destinație', detaliu: 'documentul nu are depozit de sosire' });
  for (const [et, d] of [['Depozit de plecare', a], ['Depozit de sosire', b]] as [string, Dep | null][]) {
    if (!d) continue;
    if (!d.guid_1c) lipsuri.push({ ce: et, detaliu: `„${d.name}" nu e legat de 1C` });
    // Contul e la fel de obligatoriu ca GUID-ul: fără el nu știm pe ce cont contabil intră marfa, iar o
    // presupunere ar posta tăcut pe contul greșit.
    else if (!d.cont_1c) lipsuri.push({ ce: et, detaliu: `„${d.name}" nu are cont contabil 1C` });
  }
  for (const l of randuri) if (!l.guid_1c) lipsuri.push({ ce: 'Piesă', detaliu: l.part_name });

  if (!lipsuri.length && !randuri.length) {
    return { ok: false, lipsuri: [{ ce: 'Nimic de trimis', detaliu: 'mutarea se anulează pe sine — net zero' }] };
  }
  if (lipsuri.length) return { ok: false, lipsuri };

  const docGuid = check(await sb.rpc('piese_1c_doc_guid', { p_doc: docId })) as unknown as string;

  const date: DateMutare = {
    docGuid,
    data: String(doc.created_at).slice(0, 10),
    sursaGuid: a!.guid_1c!, sursaCont: a!.cont_1c!,
    destGuid: b!.guid_1c!, destCont: b!.cont_1c!,
    // Costul nu pleacă deloc — îl calculează 1C. Motivele, pe larg, în `piese-1c-perem.ts`.
    linii: randuri.map((l) => ({ partGuid: l.guid_1c!, qty: Number(l.qty) })),
  };

  const reguli = check(await sb.from('piese_1c_config').select('reguli').eq('id', 1).maybeSingle()) as
    { reguli: string | null } | null;

  return {
    ok: true,
    xml: buildPeremXML(date, new Date().toISOString().slice(0, 19), reguli?.reguli ?? null),
    nume: `perem-${docId}.xml`,
    linii: randuri.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Recepțiile pe factură fiscală — documentul «ПрихНалоговаяНакладная».

export type RandRecepcie = {
  id: number; data: string; furnizor: string | null; factura: string; depozit: string;
  linii: number; suma: number; gata: boolean; motiv: string | null; trimis: boolean;
};

export async function recepciiDeExportat(limita = 100): Promise<RandRecepcie[]> {
  const { data, error } = await getSupabase().rpc('piese_1c_recepcii', { p_limita: limita });
  if (error) throw new Error(error.message);
  return (data as RandRecepcie[]) || [];
}

export async function pregatesteRecepcie(docId: number): Promise<
  { ok: true; xml: string; nume: string; linii: number } | { ok: false; lipsuri: Lipsa[] }
> {
  const sb = getSupabase();

  const doc = check(await sb.from('piese_stock_documents')
    .select('id, doc_type, status, created_at, invoice_date, invoice_series, invoice_number, warehouse_id, supplier_id')
    .eq('id', docId).maybeSingle()) as {
      id: number; doc_type: string; status: string; created_at: string; invoice_date: string | null;
      invoice_series: string | null; invoice_number: string | null;
      warehouse_id: number; supplier_id: number | null } | null;
  if (!doc) throw new Error('Documentul nu există.');
  if (doc.doc_type !== 'RECEIPT') throw new Error('Doar recepțiile se trimit ca «ПрихНалоговаяНакладная».');
  cerDocumentValid(doc.status, docId);

  const [wh, sup, linii] = await Promise.all([
    sb.from('piese_warehouses').select('name, guid_1c, cont_1c').eq('id', doc.warehouse_id).maybeSingle(),
    doc.supplier_id
      ? sb.from('piese_suppliers').select('name, idno').eq('id', doc.supplier_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb.rpc('piese_1c_recepcie_linii', { p_doc: docId }),
  ]);
  const depozit = check(wh) as { name: string; guid_1c: string | null; cont_1c: string | null } | null;
  const furnizor = check(sup) as { name: string; idno: string | null } | null;
  const randuri = (check(linii) as { part_id: number; part_name: string; qty: number; suma: number;
                                     cota: number; roznita: number; guid_1c: string | null }[]) || [];

  const lipsuri: Lipsa[] = [];
  if (!depozit?.guid_1c) lipsuri.push({ ce: 'Depozit', detaliu: `„${depozit?.name ?? doc.warehouse_id}" nu e legat de 1C` });
  else if (!depozit.cont_1c) lipsuri.push({ ce: 'Depozit', detaliu: `„${depozit.name}" nu are cont contabil 1C` });
  // Furnizorul se recunoaște după COD FISCAL, nu după GUID. Un cod lipsă nu dă eroare la import — i-ar
  // crea contabilului un contragent nou, dublat; iar o factură fără număr n-ar avea cum să fie regăsită.
  if (!doc.supplier_id) lipsuri.push({ ce: 'Furnizor', detaliu: 'documentul nu are furnizor' });
  else if (!/^[0-9]{13}$/.test(String(furnizor?.idno ?? '').trim())) {
    lipsuri.push({ ce: 'Furnizor', detaliu: `„${furnizor?.name}" nu are cod fiscal de 13 cifre` });
  }
  if (!String(doc.invoice_number ?? '').trim()) lipsuri.push({ ce: 'Factura fiscală', detaliu: 'lipsește numărul' });
  for (const l of randuri) if (!l.guid_1c) lipsuri.push({ ce: 'Piesă', detaliu: l.part_name });

  if (!lipsuri.length && !randuri.length) {
    return { ok: false, lipsuri: [{ ce: 'Nimic de trimis', detaliu: 'recepția se anulează pe sine — net zero' }] };
  }
  if (lipsuri.length) return { ok: false, lipsuri };

  const docGuid = check(await sb.rpc('piese_1c_doc_guid', { p_doc: docId })) as unknown as string;

  const date: DateRecepcie = {
    docGuid,
    // Data facturii FISCALE. La documentul-model al contabilului era 01.10, iar la noi marfa intrase pe
    // 07.10 — tocmai diferența pentru care există câmpul.
    data: String(doc.invoice_date || doc.created_at).slice(0, 10),
    serie: String(doc.invoice_series ?? '').trim().toUpperCase(),
    numar: String(doc.invoice_number ?? '').trim(),
    furnizorFiscCod: String(furnizor!.idno).trim(),
    furnizorNume: furnizor!.name,
    depozitGuid: depozit!.guid_1c!,
    depozitCont: depozit!.cont_1c!,
    linii: randuri.map((l) => ({
      partGuid: l.guid_1c!, qty: Number(l.qty),
      sumaCuTva: Number(l.suma), cota: Number(l.cota), sumaRoznita: Number(l.roznita),
    })),
  };

  const reguli = check(await sb.from('piese_1c_config').select('reguli').eq('id', 1).maybeSingle()) as
    { reguli: string | null } | null;

  return {
    ok: true,
    xml: buildPrihodXML(date, new Date().toISOString().slice(0, 19), reguli?.reguli ?? null),
    nume: `prihod-${docId}.xml`,
    linii: randuri.length,
  };
}
