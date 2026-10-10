'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import {
  cancelCheckout, createCheckout,
  maibMediu, maibConfigurat, stareEgala, MaibError,
} from '@/lib/maib/client';
import { randDupaCheckoutSauOrder as randDupaRef, sincronizeazaStare } from '@/lib/maib/sincronizare';
import { persistaCheckout } from '@/lib/maib/persist';
import { ComandaError, creeazaComanda } from '@/lib/bilete/comenzi';
import { anuleazaSiReturneaza } from '@/lib/bilete/refund';
import { elibereazaRefund, executaRefund, revendicaRefund, verificaSiFinalizeazaRefund } from '@/lib/maib/refund';

/**
 * Comanda de test pentru bilete (ION-193, pasul 4): ocolește steagurile de vânzare (mod test_admin) — permis
 * DOAR de aici, cu sesiune ADMIN. Trece prin exact același drum ca o comandă de pe site: preț din @translux/db,
 * plafoane în bază, o sesiune maib, bilete la callback. Întoarcerea de la maib vine pe /plati?bilet=<cod>.
 */
export async function comandaDeTest(input: {
  tripDate: string; crmRouteId: number; goingNorth: boolean; fromRo: string; toRo: string;
  seats: number; passengerName: string; phone: string; lang: 'ro' | 'ru';
}): Promise<Rezultat & { checkoutUrl?: string; cod?: string }> {
  const session = requireRole(await verifySession(), 'ADMIN');
  const baza = await bazaUrl();
  try {
    const r = await creeazaComanda(
      { ...input, idempotencyKey: randomUUID(), ipHash: 'test-admin' },
      {
        mod: 'test_admin', bazaAdmin: baza, bazaSite: baza, createdBy: session.email,
        // Site-ul n-are încă pagina biletului (pasul 3): întoarcerea vine pe /plati, care arată biletele prin API.
        urlBilet: (cod, _lang, ok) => `${baza}/plati?bilet=${cod}${ok ? '' : '&plata=nu'}`,
      },
    );
    revalidatePath('/plati');
    return { ok: true, checkoutUrl: r.checkoutUrl, cod: r.comanda.cod };
  } catch (e) {
    if (e instanceof ComandaError) return { ok: false, eroare: `${e.cod}: ${e.message}` };
    return eroare(e);
  }
}
import { chisinauTodayIso } from '@/lib/chisinau-time';

// Pagina internă /plati (ION-188): testele cerute de maib — o plată reușită și refund-ul ei — plus
// evidența tuturor sesiunilor. Acțiunile întorc { ok, eroare } în loc să arunce: în producție Next
// ascunde mesajul erorilor aruncate din server actions, iar aici mesajul maib e tot ce avem de arătat.

export interface PlataRow {
  checkout_id: string;
  order_id: string;
  mediu: 'sandbox' | 'prod';
  amount: number;
  currency: string;
  description: string | null;
  status: string;
  checkout_url: string | null;
  payment_id: string | null;
  payment_status: string | null;
  refunded_amount: number;
  refund_id: string | null;
  refund_status: string | null;
  refund_reason: string | null;
  callback: Record<string, unknown> | null;
  callback_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type Rezultat = { ok: true; mesaj?: string } | { ok: false; eroare: string };

function eroare(e: unknown): Rezultat {
  const msg = e instanceof MaibError ? e.message : e instanceof Error ? e.message : String(e);
  return { ok: false, eroare: msg };
}

export interface StareMaib {
  configurat: boolean;
  mediu: 'sandbox' | 'prod';
  callbackUrl: string;
}

export async function stareMaib(): Promise<StareMaib> {
  requireRole(await verifySession(), 'ADMIN');
  return { configurat: maibConfigurat(), mediu: maibMediu(), callbackUrl: `${await bazaUrl()}/api/pay/maib/callback` };
}

export async function listaPlati(): Promise<PlataRow[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data, error } = await getSupabase()
    .from('maib_checkouts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data || []) as PlataRow[];
}

/** Adresa publică a acestui panou (central-hub): MAIB_PUBLIC_BASE_URL dacă e pusă, altfel din antetele cererii. */
async function bazaUrl(): Promise<string> {
  const fix = process.env.MAIB_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  if (fix) return fix;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'central-hub-md.vercel.app';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function orderIdNou(): string {
  return `TEST-${chisinauTodayIso().replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Creează sesiunea la maib, o scrie în maib_checkouts și întoarce adresa paginii de plată. */
export async function creeazaPlataTest(
  suma: number,
  descriere: string,
  limba: 'ro' | 'ru' | 'en',
): Promise<Rezultat & { checkoutUrl?: string }> {
  const session = requireRole(await verifySession(), 'ADMIN');
  if (!Number.isFinite(suma) || suma <= 1) return { ok: false, eroare: 'maib cere o sumă mai mare de 1,00 MDL' };
  const orderId = orderIdNou();
  const baza = await bazaUrl();
  try {
    const c = await createCheckout({
      amount: suma,
      language: limba,
      orderId,
      description: descriere.trim() || `Plată de test TRANSLUX ${orderId}`,
      payer: { name: session.email, email: session.email },
      callbackUrl: `${baza}/api/pay/maib/callback`,
      successUrl: `${baza}/plati?checkout=${orderId}&rezultat=ok`,
      failUrl: `${baza}/plati?checkout=${orderId}&rezultat=fail`,
    });
    const { error } = await persistaCheckout({
      checkoutId: c.checkoutId, orderId, amount: suma, description: descriere.trim() || null,
      checkoutUrl: c.checkoutUrl, createdBy: session.email,
    });
    if (error) return { ok: false, eroare: `sesiunea ${c.checkoutId} e creată la maib, dar nu s-a scris în bază: ${error}` };
    revalidatePath('/plati');
    return { ok: true, checkoutUrl: c.checkoutUrl };
  } catch (e) {
    return eroare(e);
  }
}

async function randDupaCheckoutSauOrder(ref: string): Promise<PlataRow | null> {
  return (await randDupaRef(ref)) as PlataRow | null;
}

/** Butonul «Actualizează»: sincronizarea din lib + revalidarea paginii (în randare NU se poate revalida). */
export async function sincronizeaza(ref: string): Promise<Rezultat & { rand?: PlataRow }> {
  requireRole(await verifySession(), 'ADMIN');
  const r = await sincronizeazaStare(ref);
  if (r.ok) revalidatePath('/plati');
  return r as Rezultat & { rand?: PlataRow };
}

export async function anuleaza(checkoutId: string): Promise<Rezultat> {
  requireRole(await verifySession(), 'ADMIN');
  const rand = await randDupaCheckoutSauOrder(checkoutId);
  if (!rand) return { ok: false, eroare: 'sesiune necunoscută' };
  if (stareEgala(rand.status, 'Completed')) return { ok: false, eroare: 'sesiunea e plătită; folosește «Returnează»' };
  try {
    const r = await cancelCheckout(rand.checkout_id);
    await getSupabase().from('maib_checkouts').update({ status: r.status || 'Cancelled', updated_at: new Date().toISOString() }).eq('checkout_id', rand.checkout_id);
    revalidatePath('/plati');
    return { ok: true };
  } catch (e) {
    return eroare(e);
  }
}

/** Refund integral al plății executate; maib întoarce «Created», rezultatul se află la verificaRefund. */
export async function returneaza(checkoutId: string, motiv: string): Promise<Rezultat> {
  requireRole(await verifySession(), 'ADMIN');
  const rand = await randDupaCheckoutSauOrder(checkoutId);
  if (!rand) return { ok: false, eroare: 'sesiune necunoscută' };
  if (!rand.payment_id || !stareEgala(rand.payment_status, 'Executed')) return { ok: false, eroare: 'plata nu e executată' };
  if (rand.refund_id) return { ok: false, eroare: `refund-ul există deja (${rand.refund_status ?? 'creat'})` };
  if (!motiv.trim()) return { ok: false, eroare: 'motivul e obligatoriu' };

  // Plata unei comenzi de bilete (și după order_id — comanda orfană, încă nelegată): trece prin EXECUTORUL comun
  // (ION-194): comanda → anulata + biletele → anulat, apoi banca; bilet scanat «urcat» = refuz. O eroare la citire = refuz.
  const { data: comanda, error: cErr } = await getSupabase().from('bilete_comenzi').select('id, status')
    .or(`checkout_id.eq.${rand.checkout_id}${/^[0-9a-f-]{36}$/i.test(rand.order_id) ? `,id.eq.${rand.order_id}` : ''}`)
    .limit(1).maybeSingle();
  if (cErr) return { ok: false, eroare: `nu pot verifica dacă plata e a unei comenzi de bilete (${cErr.message}); nu returnez` };
  if (comanda) {
    // 546 (audit M3): turul cu un retur −20% plătit se returnează din /bilete, unde dispecerul alege «vina noastră» /
    // «anulează și returul»; aici s-ar scădea reducerea fără întrebare.
    const { count: retururi } = await getSupabase().from('bilete_comenzi').select('id', { count: 'exact', head: true }).eq('comanda_tur_id', comanda.id).eq('status', 'platita');
    if ((retururi ?? 0) > 0) return { ok: false, eroare: 'comanda are un retur −20% plătit: returnează din /bilete (alegi «vina noastră» sau «anulează și returul»)' };
    try {
      const r = await anuleazaSiReturneaza(comanda.id, { sursa: 'admin', motiv });
      revalidatePath('/plati');
      return { ok: true, mesaj: `comanda ${r.comanda.status}; refund: ${r.refund}${r.refundId ? ` (${r.refundId})` : ''}` };
    } catch (e) {
      revalidatePath('/plati');
      if (e instanceof ComandaError) return { ok: false, eroare: e.message };
      return eroare(e);
    }
  }

  // Plată simplă (de test, fără comandă): revendicare + banca, prin aceeași lib.
  const rev = await revendicaRefund(rand.checkout_id, motiv);
  if (rev.eroare) return { ok: false, eroare: rev.eroare };
  if (!rev.ok) return { ok: false, eroare: 'refund-ul e deja în lucru' };
  const r = await executaRefund({ checkout_id: rand.checkout_id, payment_id: rand.payment_id, amount: Number(rand.amount) }, motiv);
  revalidatePath('/plati');
  if (r.fel === 'creat') return { ok: true, mesaj: `refund ${r.refundId}: ${r.status}` };
  if (r.fel === 'necunoscut') return { ok: false, eroare: `banca nu a răspuns clar (${r.motiv}); starea e «Necunoscut» — apasă «Verifică refund-ul» mai târziu` };
  await elibereazaRefund(rand.checkout_id);
  return { ok: false, eroare: `banca a refuzat: ${r.motiv}` };
}

export async function verificaRefund(checkoutId: string): Promise<Rezultat> {
  requireRole(await verifySession(), 'ADMIN');
  const rand = await randDupaCheckoutSauOrder(checkoutId);
  if (!rand?.refund_id) return { ok: false, eroare: 'fără refund' };
  try {
    // Finalizarea comună (Codex C4): scrie starea pe checkout ȘI pe comanda de bilete legată (returnata / alertă).
    const r = await verificaSiFinalizeazaRefund({ checkout_id: rand.checkout_id, refund_id: rand.refund_id, payment_id: rand.payment_id });
    revalidatePath('/plati');
    return { ok: true, mesaj: `refund: ${r?.decizie ?? '?'}${r?.comandaId ? ` (comanda ${r.comandaId})` : ''}` };
  } catch (e) {
    return eroare(e);
  }
}
