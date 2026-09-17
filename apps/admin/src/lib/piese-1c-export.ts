import 'server-only';
import { getSupabase } from './supabase';
import { buildSpisanieXML, type DateSpisanie, type LinieSpisanie } from './piese-1c-spisanie';

// Pregătește documentul 1C pentru o eliberare. Citește, VERIFICĂ, apoi compune.
//
// Garda e miezul acestui fișier, nu o formalitate: regulile 1C sincronizează strict după GUID, iar un GUID
// lipsă nu dă eroare la import — creează un articol NOU. Un export „reușit" cu o piesă nelegată ar dubla
// tăcut nomenclatorul contabilității. De aceea refuzăm ÎNAINTE, cu lista exactă a ce lipsește.

export type Lipsa = { ce: string; detaliu: string };

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export async function pregatesteSpisanie(docId: number): Promise<
  { ok: true; xml: string; nume: string; linii: number } | { ok: false; lipsuri: Lipsa[] }
> {
  const sb = getSupabase();

  const doc = check(await sb.from('piese_stock_documents')
    .select('id, doc_type, created_at, warehouse_id, vehicle_id, mechanic_id')
    .eq('id', docId).maybeSingle()) as {
      id: number; doc_type: string; created_at: string;
      warehouse_id: number; vehicle_id: number | null; mechanic_id: number | null } | null;
  if (!doc) throw new Error('Documentul nu există.');
  if (doc.doc_type !== 'ISSUE') throw new Error('Doar eliberările se trimit ca «Списание запчастей».');

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
    data: String(doc.created_at).slice(0, 10),
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
