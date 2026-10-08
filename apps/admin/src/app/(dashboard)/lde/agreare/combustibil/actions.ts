'use server';

// Pagina «Combustibil din fișiere» a Clavei (plan docs/plans/2026-10-08-import-combustibil-petrom-peco.md, pașii 4–6).
// Ion, 08.10.2026: fișierul devine sursa; cardul / portofelul se leagă o dată (șofer, mașină, grup, rezervă, în afara
// flotei); șofer → agrearea, apoi foaia LDE a zilei; rezervele în tabel cu perioade. Orice schimbare se termină cu
// re-legarea rândurilor atinse și cu proiecția în lde_fuel_alimentari (funcții SQL din migr. 534).

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { chisinauTodayIso } from '@/lib/chisinau-time';

const UUID = /^[0-9a-f-]{36}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const SURSE = ['petrom', 'intelect'] as const;
type Sursa = (typeof SURSE)[number];
type Tip = 'sofer' | 'masina' | 'grup' | 'rezerva' | 'strain';

async function sesiune() { return requireRole(await verifySession(), 'ADMIN', 'CONTABIL_LDE'); }
const cale = '/lde/agreare/combustibil';

export type Portofel = {
  sursa: Sursa; cod: string; nume_fisier: string; tip: Tip | null; vehicle_id: string | null; driver_id: string | null;
  nume_lde: string | null; categorie: string | null; propus_vehicle_id: string | null;
  de_legat: number; litri_de_legat: number; tranzactii: number; litri: number; motiv: string | null;
};
export type Import = { id: string; sursa: Sursa; fisier_nume: string; de: string; pana: string; randuri: number; litri_dt: number; incarcat_de: string; incarcat_la: string; anulat_la: string | null };
export type Rezerva = { id: string; sursa: Sursa; cod: string; de: string; pana: string | null; vehicle_id: string | null; driver_id: string | null; persoana_text: string | null; nota: string | null };
export type Statie = { sursa: Sursa; nume_fisier: string; lat: number | null; lon: number | null; confirmat: boolean };
export type PesteFisier = { vehicle_id: string; m: string; zi: string; sursa: Sursa; foaie_l: number; acoperit: number; rest: number };
export type Optiune = { id: string; nume: string };
export type CombustibilData = {
  esteAdmin: boolean; importuri: Import[]; portofele: Portofel[]; rezerve: Rezerva[]; statii: Statie[];
  pesteFisier: PesteFisier[]; vehicule: Optiune[]; soferi: Optiune[]; numeLde: string[];
  statiiVazute: { sursa: Sursa; nume_fisier: string }[];   // stațiile din fișiere (fără coordonate încă, sau cu)
};

export async function getCombustibilImport(): Promise<CombustibilData> {
  const s = await sesiune();
  const db = getSupabase();
  const azi = chisinauTodayIso();
  const de90 = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const [imp, port, rez, sta, rnd, veh, drv] = await Promise.all([
    db.from('lde_fuel_import').select('*').order('incarcat_la', { ascending: false }).limit(30),
    db.from('lde_fuel_portofel').select('*').order('sursa').order('cod').limit(1000),
    db.from('lde_fuel_rezerva_perioada').select('*').order('cod').order('de', { ascending: false }).limit(500),
    db.from('lde_fuel_statie').select('*').order('sursa').order('nume_fisier').limit(200),
    db.from('lde_fuel_import_rand').select('sursa, cod, stare, litri, motiv, statie').gte('zi_local', de90).lte('zi_local', azi).limit(10000),
    db.from('vehicles').select('id, plate_number').eq('active', true).order('plate_number').limit(1000),
    db.from('drivers').select('id, full_name').eq('active', true).order('full_name').limit(1000),
  ]);
  for (const r of [imp, port, rez, sta, rnd, veh, drv]) if (r.error) throw new Error(r.error.message);

  const agg = new Map<string, { n: number; l: number; dn: number; dl: number; motiv: string | null }>();
  for (const r of (rnd.data ?? []) as any[]) {
    const k = `${r.sursa}|${r.cod}`;
    const a = agg.get(k) ?? { n: 0, l: 0, dn: 0, dl: 0, motiv: null };
    a.n++; a.l += Number(r.litri);
    if (r.stare === 'de_legat') { a.dn++; a.dl += Number(r.litri); a.motiv ??= r.motiv; }
    agg.set(k, a);
  }
  const portofele: Portofel[] = ((port.data ?? []) as any[]).map((p) => {
    const a = agg.get(`${p.sursa}|${p.cod}`) ?? { n: 0, l: 0, dn: 0, dl: 0, motiv: null };
    return { ...p, tranzactii: a.n, litri: Math.round(a.l), de_legat: a.dn, litri_de_legat: Math.round(a.dl), motiv: a.motiv };
  });

  // foile LDE pe care fișierele nu le acoperă întreg (doar informativ; «E dublură» le poate pune pe 0)
  const { data: ac, error: ea } = await db.from('lde_fuel_foaie_acoperire').select('foaie_external_id, sursa, vehicle_id, zi, acoperit')
    .gte('zi', de90).limit(5000);
  if (ea) throw new Error(ea.message);
  const ids = (ac ?? []).map((a: any) => a.foaie_external_id);
  const foi = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await db.from('lde_fuel_foaie').select('external_id, litri').in('external_id', ids.slice(i, i + 300));
    if (error) throw new Error(error.message);
    for (const f of data ?? []) foi.set(f.external_id, Number(f.litri));
  }
  const placa = new Map(((veh.data ?? []) as any[]).map((v) => [v.id, v.plate_number]));
  const pesteFisier: PesteFisier[] = ((ac ?? []) as any[])
    .map((a) => ({ vehicle_id: a.vehicle_id, m: placa.get(a.vehicle_id) ?? '?', zi: a.zi, sursa: a.sursa, foaie_l: foi.get(a.foaie_external_id) ?? 0, acoperit: Number(a.acoperit) }))
    .map((x) => ({ ...x, rest: Math.round((x.foaie_l - x.acoperit) * 100) / 100 }))
    .filter((x) => x.rest > 1)
    .sort((a, b) => b.zi.localeCompare(a.zi));

  // numele șoferilor așa cum apar pe foile LDE (pentru legătura portofel → foaia zilei)
  const { data: nl } = await db.from('lde_fuel_foaie').select('sofer').gte('zi', de90).not('sofer', 'is', null).limit(5000);
  const numeLde = [...new Set(((nl ?? []) as any[]).map((x) => String(x.sofer).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro'));

  return {
    esteAdmin: s.role === 'ADMIN',
    importuri: (imp.data ?? []) as Import[], portofele, rezerve: (rez.data ?? []) as Rezerva[], statii: (sta.data ?? []) as Statie[],
    pesteFisier: pesteFisier.slice(0, 200),
    vehicule: ((veh.data ?? []) as any[]).map((v) => ({ id: v.id, nume: v.plate_number })),
    soferi: ((drv.data ?? []) as any[]).map((d) => ({ id: d.id, nume: d.full_name })),
    numeLde,
    statiiVazute: [...new Set(((rnd.data ?? []) as any[]).filter((r) => r.statie).map((r) => `${r.sursa}|${r.statie}`))]
      .sort().map((k) => ({ sursa: k.split('|')[0] as Sursa, nume_fisier: k.split('|').slice(1).join('|') })),
  };
}

/** Re-legarea și proiecția pentru zilele în care cardul are tranzacții (toate, nu doar ultima lună). */
async function releagaCod(sursa: Sursa, cod: string) {
  const db = getSupabase();
  const { data, error } = await db.from('lde_fuel_import_rand').select('zi_local').eq('sursa', sursa).eq('cod', cod)
    .order('zi_local').limit(1);
  if (error) throw new Error(error.message);
  if (!data?.length) return;
  const { data: last } = await db.from('lde_fuel_import_rand').select('zi_local').eq('sursa', sursa).eq('cod', cod)
    .order('zi_local', { ascending: false }).limit(1);
  const de = data[0].zi_local as string, pana = (last?.[0]?.zi_local as string) ?? de;
  const r1 = await db.rpc('lde_fuel_releaga', { p_de: de, p_pana: pana });
  if (r1.error) throw new Error(r1.error.message);
  const r2 = await db.rpc('lde_fuel_import_sincronizeaza', { p_de: de, p_pana: pana });
  if (r2.error) throw new Error(r2.error.message);
}

export async function legaPortofel(sursa: Sursa, cod: string, tip: Tip | null,
  opt: { vehicle_id?: string | null; driver_id?: string | null; nume_lde?: string | null; categorie?: string | null } = {}): Promise<void> {
  const s = await sesiune();
  if (!SURSE.includes(sursa) || !cod) throw new Error('Card invalid');
  if (tip && !['sofer', 'masina', 'grup', 'rezerva', 'strain'].includes(tip)) throw new Error('Tip invalid');
  const v = opt.vehicle_id && UUID.test(opt.vehicle_id) ? opt.vehicle_id : null;
  const d = opt.driver_id && UUID.test(opt.driver_id) ? opt.driver_id : null;
  if (tip === 'masina' && !v) throw new Error('Alege mașina');
  if (tip === 'sofer' && !d) throw new Error('Alege șoferul');
  const { error } = await getSupabase().from('lde_fuel_portofel').update({
    tip, vehicle_id: tip === 'masina' ? v : null, driver_id: tip === 'sofer' ? d : null,
    nume_lde: tip === 'sofer' ? (opt.nume_lde?.trim() || null) : null,
    categorie: tip === 'strain' ? (opt.categorie?.trim().slice(0, 200) || 'în afara flotei') : null,
    legat_de: s.email, legat_la: new Date().toISOString(),
  }).eq('sursa', sursa).eq('cod', cod);
  if (error) throw new Error(error.message);
  await releagaCod(sursa, cod);
  revalidatePath(cale);
}

/** «Confirmă toate propunerile»: cardurile încă nelegate care au mașina găsită după plăcuță. */
export async function confirmaPropunerile(): Promise<number> {
  const s = await sesiune();
  const db = getSupabase();
  const { data, error } = await db.from('lde_fuel_portofel').select('sursa, cod, propus_vehicle_id').is('tip', null).not('propus_vehicle_id', 'is', null);
  if (error) throw new Error(error.message);
  for (const p of data ?? []) {
    const { error: e } = await db.from('lde_fuel_portofel').update({ tip: 'masina', vehicle_id: p.propus_vehicle_id, legat_de: s.email, legat_la: new Date().toISOString() })
      .eq('sursa', p.sursa).eq('cod', p.cod).is('tip', null);
    if (e) throw new Error(e.message);
    await releagaCod(p.sursa as Sursa, p.cod);
  }
  revalidatePath(cale);
  return (data ?? []).length;
}

export async function adaugaRezerva(sursa: Sursa, cod: string, de: string, pana: string | null,
  cine: { vehicle_id?: string | null; driver_id?: string | null; persoana_text?: string | null }, nota?: string): Promise<void> {
  const s = await sesiune();
  if (!SURSE.includes(sursa) || !cod || !DATA.test(de) || (pana && !DATA.test(pana))) throw new Error('Perioadă invalidă');
  const v = cine.vehicle_id && UUID.test(cine.vehicle_id) ? cine.vehicle_id : null;
  const d = cine.driver_id && UUID.test(cine.driver_id) ? cine.driver_id : null;
  const p = cine.persoana_text?.trim().slice(0, 120) || null;
  if (!v && !d && !p) throw new Error('Spune cine a avut rezerva: mașina, șoferul sau persoana');
  const { error } = await getSupabase().from('lde_fuel_rezerva_perioada').insert({
    sursa, cod, de, pana: pana || null, vehicle_id: v, driver_id: d, persoana_text: p, nota: nota?.trim().slice(0, 300) || null, creat_de: s.email,
  });
  if (error) throw new Error(/rezerva are deja/i.test(error.message) ? error.message : error.message);
  await releagaCod(sursa, cod);
  revalidatePath(cale);
}

export async function inchideRezerva(id: string, pana: string): Promise<void> {
  await sesiune();
  if (!UUID.test(id) || !DATA.test(pana)) throw new Error('Cerere invalidă');
  const db = getSupabase();
  const { data, error } = await db.from('lde_fuel_rezerva_perioada').update({ pana }).eq('id', id).select('sursa, cod').maybeSingle();
  if (error) throw new Error(error.message);
  if (data) await releagaCod(data.sursa as Sursa, data.cod);
  revalidatePath(cale);
}

export async function stergeRezerva(id: string): Promise<void> {
  await sesiune();
  if (!UUID.test(id)) throw new Error('Cerere invalidă');
  const db = getSupabase();
  const { data, error } = await db.from('lde_fuel_rezerva_perioada').delete().eq('id', id).select('sursa, cod').maybeSingle();
  if (error) throw new Error(error.message);
  if (data) await releagaCod(data.sursa as Sursa, data.cod);
  revalidatePath(cale);
}

/** O tranzacție legată de mână (rămâne așa la re-legări): pe o mașină, sau «în afara flotei», sau înapoi pe automat. */
export async function legaRandManual(externalId: string, alegere: { vehicle_id?: string | null; strain?: boolean; automat?: boolean }): Promise<void> {
  await sesiune();
  const db = getSupabase();
  const { data: r, error: er } = await db.from('lde_fuel_import_rand').select('zi_local, este_dt').eq('external_id', externalId).maybeSingle();
  if (er) throw new Error(er.message);
  if (!r) throw new Error('Tranzacția nu există');
  let patch: Record<string, unknown>;
  if (alegere.automat) patch = { legat_prin: null };
  else if (alegere.strain) patch = { legat_prin: 'manual', stare: 'strain', vehicle_id: null, motiv: 'pus de mână în afara flotei' };
  else if (alegere.vehicle_id && UUID.test(alegere.vehicle_id) && r.este_dt) patch = { legat_prin: 'manual', stare: 'legat', vehicle_id: alegere.vehicle_id, motiv: null };
  else throw new Error('Alegere invalidă');
  const { error } = await db.from('lde_fuel_import_rand').update({ ...patch, actualizat_la: new Date().toISOString() }).eq('external_id', externalId);
  if (error) throw new Error(error.message);
  if (alegere.automat) { const x = await db.rpc('lde_fuel_rand_leaga', { p_ext: externalId }); if (x.error) throw new Error(x.error.message); }
  const y = await db.rpc('lde_fuel_import_sincronizeaza', { p_de: r.zi_local, p_pana: r.zi_local });
  if (y.error) throw new Error(y.error.message);
  revalidatePath(cale);
}

export type RandDeLegat = { external_id: string; local: string; litri: number; statie: string | null; motiv: string | null; vehicle_id: string | null };
export async function getRanduriCod(sursa: Sursa, cod: string): Promise<RandDeLegat[]> {
  await sesiune();
  const { data, error } = await getSupabase().from('lde_fuel_import_rand')
    .select('external_id, alimentat_at, litri, statie, motiv, vehicle_id, stare').eq('sursa', sursa).eq('cod', cod)
    .neq('stare', 'legat').order('alimentat_at', { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({
    external_id: r.external_id, litri: Number(r.litri), statie: r.statie, motiv: r.motiv, vehicle_id: r.vehicle_id,
    local: new Date(r.alimentat_at).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
  }));
}

export async function marcheazaDublura(vehicleId: string, zi: string, sursa: Sursa): Promise<void> {
  const s = await sesiune();
  if (!UUID.test(vehicleId) || !DATA.test(zi) || !SURSE.includes(sursa)) throw new Error('Cerere invalidă');
  const db = getSupabase();
  const { error } = await db.from('lde_fuel_foaie_decizie').upsert({ vehicle_id: vehicleId, zi, sursa, decis_de: s.email, decis_la: new Date().toISOString() });
  if (error) throw new Error(error.message);
  revalidatePath(cale);
}

export async function anuleazaImport(id: string): Promise<void> {
  const s = await sesiune();
  if (!UUID.test(id)) throw new Error('Cerere invalidă');
  const { error } = await getSupabase().rpc('lde_fuel_import_anuleaza', { p_id: id, p_cine: s.email });
  if (error) throw new Error(error.message);
  revalidatePath(cale);
}

/** Coordonatele unei stații (pentru portofelul de grup, prin GPS) — doar ADMIN, verificate pe hartă. */
export async function salveazaStatie(sursa: Sursa, nume: string, lat: number, lon: number): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  if (!SURSE.includes(sursa) || !nume || !(lat > 45 && lat < 49) || !(lon > 26 && lon < 31)) throw new Error('Coordonate în afara Moldovei');
  const db = getSupabase();
  const { error } = await db.from('lde_fuel_statie').upsert({ sursa, nume_fisier: nume, lat, lon, confirmat: true });
  if (error) throw new Error(error.message);
  const azi = chisinauTodayIso();
  const de = new Date(Date.now() - 120 * 86400_000).toISOString().slice(0, 10);
  const r1 = await db.rpc('lde_fuel_releaga', { p_de: de, p_pana: azi });
  if (r1.error) throw new Error(r1.error.message);
  const r2 = await db.rpc('lde_fuel_import_sincronizeaza', { p_de: de, p_pana: azi });
  if (r2.error) throw new Error(r2.error.message);
  revalidatePath(cale);
}
