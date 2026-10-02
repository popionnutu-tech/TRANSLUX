'use server';

import { revalidatePath } from 'next/cache';
import type { Bilet, BileteAlerta, BileteComanda } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { anuleazaSiReturneaza } from '@/lib/bilete/refund';
import { verificaSiFinalizeazaRefund } from '@/lib/maib/refund';
import { ComandaError } from '@/lib/bilete/comenzi';
import { chisinauTodayIso } from '@/lib/chisinau-time';

// Pagina /bilete (ION-195, pasul 11a): dispecerul vede comenzile de bilete online, biletele, scanările și alertele,
// și poate returna (executorul din ION-194), verifica refund-ul sau emite biletele unei comenzi plătite târziu.
// Fără logică nouă aici: acțiunile cheamă lib-urile comune. Răspunsurile sunt { ok, eroare } (Next ascunde mesajele
// erorilor aruncate din server actions în producție).

export type Rezultat = { ok: true; mesaj?: string } | { ok: false; eroare: string };

export interface ComandaRand extends BileteComanda {
  ruta_nume: string | null;
  payment_status: string | null;
  refund_status: string | null;
  refunded_amount: number | null;
  nr_bilete: number;
  nr_urcate: number;
}

export interface Filtre {
  zi?: string;        // trip_date exactă; gol = ultimele 7 zile + viitoare
  ruta?: number;
  stare?: string;
  test?: 'da' | 'nu' | 'toate';
}

export async function listaComenzi(f: Filtre): Promise<ComandaRand[]> {
  requireRole(await verifySession(), 'ADMIN');
  const db = getSupabase();
  let q = db.from('bilete_comenzi').select('*').order('created_at', { ascending: false }).limit(300);
  if (f.zi && /^\d{4}-\d{2}-\d{2}$/.test(f.zi)) q = q.eq('trip_date', f.zi);
  else {
    const azi = chisinauTodayIso();
    const dinainte = new Date(Date.parse(azi) - 7 * 86_400_000).toISOString().slice(0, 10);
    q = q.gte('trip_date', dinainte);
  }
  if (f.ruta) q = q.eq('crm_route_id', f.ruta);
  if (f.stare) q = q.eq('status', f.stare);
  if (f.test === 'nu') q = q.eq('test', false);
  if (f.test === 'da') q = q.eq('test', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const comenzi = (data || []) as BileteComanda[];
  if (comenzi.length === 0) return [];

  const ids = comenzi.map((c) => c.id);
  const checkoutIds = comenzi.map((c) => c.checkout_id).filter((x): x is string => Boolean(x));
  const rutaIds = [...new Set(comenzi.map((c) => c.crm_route_id))];
  const [{ data: ck }, { data: rute }, { data: bil }] = await Promise.all([
    checkoutIds.length ? db.from('maib_checkouts').select('checkout_id, payment_status, refund_status, refunded_amount').in('checkout_id', checkoutIds) : Promise.resolve({ data: [] as { checkout_id: string; payment_status: string | null; refund_status: string | null; refunded_amount: number | null }[] }),
    db.from('crm_routes').select('id, dest_from_ro, dest_to_ro').in('id', rutaIds),
    db.from('bilete').select('comanda_id, status').in('comanda_id', ids),
  ]);
  const ckMap = new Map((ck || []).map((r) => [r.checkout_id, r]));
  const ruteMap = new Map((rute || []).map((r: { id: number; dest_from_ro: string; dest_to_ro: string }) => [r.id, r]));
  const nrBilete = new Map<string, { n: number; urcate: number }>();
  for (const b of (bil || []) as Pick<Bilet, 'comanda_id' | 'status'>[]) {
    const x = nrBilete.get(b.comanda_id) ?? { n: 0, urcate: 0 };
    x.n += 1; if (b.status === 'urcat') x.urcate += 1;
    nrBilete.set(b.comanda_id, x);
  }
  return comenzi.map((c) => {
    const k = c.checkout_id ? ckMap.get(c.checkout_id) : undefined;
    const r = ruteMap.get(c.crm_route_id);
    return {
      ...c,
      ruta_nume: r ? (c.going_north ? r.dest_to_ro : r.dest_from_ro) : null,
      payment_status: k?.payment_status ?? null,
      refund_status: k?.refund_status ?? null,
      refunded_amount: k?.refunded_amount ?? null,
      nr_bilete: nrBilete.get(c.id)?.n ?? 0,
      nr_urcate: nrBilete.get(c.id)?.urcate ?? 0,
    };
  });
}

export interface Detaliu {
  bilete: Bilet[];
  scanari: { id: number; cod_citit: string; rezultat: string; moment_server: string; driver_id: string | null }[];
  alerte: BileteAlerta[];
}

export async function detaliuComanda(id: string): Promise<Detaliu> {
  requireRole(await verifySession(), 'ADMIN');
  const db = getSupabase();
  const { data: bilete } = await db.from('bilete').select('*').eq('comanda_id', id).order('nr');
  const coduri = ((bilete || []) as Bilet[]).map((b) => b.cod_qr);
  const [{ data: scanari }, { data: alerte }] = await Promise.all([
    coduri.length ? db.from('bilete_scanari').select('id, cod_citit, rezultat, moment_server, driver_id').in('cod_citit', coduri).order('id', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    db.from('bilete_alerte').select('*').eq('comanda_id', id).order('id', { ascending: false }),
  ]);
  return { bilete: (bilete || []) as Bilet[], scanari: (scanari || []) as Detaliu['scanari'], alerte: (alerte || []) as BileteAlerta[] };
}

export async function alerteDeschise(): Promise<(BileteAlerta & { passenger_name?: string | null })[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data } = await getSupabase().from('bilete_alerte').select('*').is('rezolvat_la', null).order('id', { ascending: false }).limit(100);
  return (data || []) as BileteAlerta[];
}

/** Comenzi «noua» mai vechi de 40 de minute: coșuri părăsite sau sesiuni pierdute — semnal că împăcarea lipsește. */
export async function contorNouaVechi(): Promise<number> {
  requireRole(await verifySession(), 'ADMIN');
  const { count } = await getSupabase().from('bilete_comenzi').select('id', { count: 'exact', head: true })
    .eq('status', 'noua').lt('created_at', new Date(Date.now() - 40 * 60_000).toISOString());
  return count ?? 0;
}

export async function returneazaComanda(id: string, motiv: string): Promise<Rezultat> {
  requireRole(await verifySession(), 'ADMIN');
  try {
    const r = await anuleazaSiReturneaza(id, { sursa: 'admin', motiv });
    revalidatePath('/bilete');
    return { ok: true, mesaj: `comanda ${r.comanda.status}; refund: ${r.refund}${r.refundId ? ` (${r.refundId})` : ''}` };
  } catch (e) {
    revalidatePath('/bilete');
    if (e instanceof ComandaError) return { ok: false, eroare: e.message };
    return { ok: false, eroare: e instanceof Error ? e.message : String(e) };
  }
}

export async function verificaRefundComanda(id: string): Promise<Rezultat> {
  requireRole(await verifySession(), 'ADMIN');
  const db = getSupabase();
  const { data: c } = await db.from('bilete_comenzi').select('checkout_id').eq('id', id).maybeSingle();
  if (!c?.checkout_id) return { ok: false, eroare: 'comanda n-are sesiune maib' };
  const { data: ck } = await db.from('maib_checkouts').select('checkout_id, refund_id, payment_id').eq('checkout_id', c.checkout_id).maybeSingle();
  if (!ck?.refund_id) return { ok: false, eroare: 'nu există refund cerut la bancă' };
  try {
    const r = await verificaSiFinalizeazaRefund(ck);
    revalidatePath('/bilete');
    return { ok: true, mesaj: `refund: ${r?.decizie ?? '?'}` };
  } catch (e) {
    return { ok: false, eroare: e instanceof Error ? e.message : String(e) };
  }
}

export async function emiteBiletele(id: string): Promise<Rezultat> {
  requireRole(await verifySession(), 'ADMIN');
  const { data, error } = await getSupabase().rpc('bilete_emite_fara_bilet', { p_id: id });
  revalidatePath('/bilete');
  if (error) {
    const m = error.message;
    if (/PLATA_NEELIGIBILA/.test(m)) return { ok: false, eroare: 'plata nu e executată sau are deja refund — nu se pot emite bilete' };
    if (/STARE_/.test(m)) return { ok: false, eroare: 'comanda nu e în starea «plătită fără bilet»' };
    if (/SUMA_NEPOTRIVITA/.test(m)) return { ok: false, eroare: 'suma plătită nu e suma comenzii' };
    return { ok: false, eroare: m };
  }
  return { ok: true, mesaj: `${data} bilet(e) emise` };
}

export async function rezolvaAlerta(id: number): Promise<Rezultat> {
  requireRole(await verifySession(), 'ADMIN');
  const { error } = await getSupabase().from('bilete_alerte').update({ rezolvat_la: new Date().toISOString() }).eq('id', id).is('rezolvat_la', null);
  revalidatePath('/bilete');
  return error ? { ok: false, eroare: error.message } : { ok: true };
}
