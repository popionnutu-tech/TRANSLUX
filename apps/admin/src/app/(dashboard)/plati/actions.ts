'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import {
  cancelCheckout, createCheckout, getCheckout, getPayment, getRefund, refundPayment,
  maibMediu, maibConfigurat, stareEgala, MaibError,
} from '@/lib/maib/client';
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
    const { error } = await getSupabase().from('maib_checkouts').insert({
      checkout_id: c.checkoutId,
      order_id: orderId,
      mediu: maibMediu(),
      amount: Number(suma.toFixed(2)),
      currency: 'MDL',
      description: descriere.trim() || null,
      status: 'WaitingForInit',
      checkout_url: c.checkoutUrl,
      created_by: session.email,
    });
    if (error) return { ok: false, eroare: `sesiunea ${c.checkoutId} e creată la maib, dar nu s-a scris în bază: ${error.message}` };
    revalidatePath('/plati');
    return { ok: true, checkoutUrl: c.checkoutUrl };
  } catch (e) {
    return eroare(e);
  }
}

async function randDupaCheckoutSauOrder(ref: string): Promise<PlataRow | null> {
  const col = /^[0-9a-f-]{36}$/i.test(ref) ? 'checkout_id' : 'order_id';
  const { data } = await getSupabase().from('maib_checkouts').select('*').eq(col, ref).maybeSingle();
  return (data as PlataRow | null) ?? null;
}

/** Citește starea de la maib și o scrie în rând (callback-ul poate întârzia sau lipsi). */
export async function sincronizeaza(ref: string): Promise<Rezultat & { rand?: PlataRow }> {
  requireRole(await verifySession(), 'ADMIN');
  const rand = await randDupaCheckoutSauOrder(ref);
  if (!rand) return { ok: false, eroare: 'sesiune necunoscută' };
  try {
    const c = await getCheckout(rand.checkout_id);
    const p = c.payment ?? null;
    const upd: Partial<PlataRow> & { updated_at: string } = {
      status: c.status,
      checkout_url: c.url ?? rand.checkout_url,
      updated_at: new Date().toISOString(),
    };
    if (p?.paymentId) {
      upd.payment_id = p.paymentId;
      upd.payment_status = p.status;
      upd.refunded_amount = Number(p.refundedAmount ?? rand.refunded_amount ?? 0);
    }
    const { data, error } = await getSupabase().from('maib_checkouts').update(upd).eq('checkout_id', rand.checkout_id).select('*').single();
    if (error) return { ok: false, eroare: error.message };
    revalidatePath('/plati');
    return { ok: true, rand: data as PlataRow };
  } catch (e) {
    // Sesiunea nu mai există / a expirat la maib — o marcăm, ca să nu rămână «în așteptare» pe veci.
    // Verificat 02.10.2026: sandbox-ul răspunde HTTP 200 + ok=false + cod «…-1800» (docs: 43001 / 404).
    if (e instanceof MaibError && !stareEgala(rand.status, 'Completed') && (e.status === 404 || e.errors.some(x => /-(1800|43001)$/.test(x.errorCode ?? '')))) {
      await getSupabase().from('maib_checkouts').update({ status: 'Expired', updated_at: new Date().toISOString() }).eq('checkout_id', rand.checkout_id);
      revalidatePath('/plati');
      return { ok: true, mesaj: 'maib nu mai cunoaște sesiunea (expirată)' };
    }
    return eroare(e);
  }
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

  // Revendicăm rândul ÎNAINTE de apelul la maib (update condiționat): doi admini sau un dublu-clic
  // nu pot cere două refund-uri pentru aceeași plată (revizorul de securitate, ION-188).
  const supabase = getSupabase();
  const { data: revendicat, error: revErr } = await supabase
    .from('maib_checkouts')
    .update({ refund_status: 'Pending', refund_reason: motiv.trim(), updated_at: new Date().toISOString() })
    .eq('checkout_id', rand.checkout_id)
    .is('refund_id', null)
    .is('refund_status', null)
    .select('checkout_id');
  if (revErr) return { ok: false, eroare: revErr.message };
  if (!revendicat || revendicat.length === 0) return { ok: false, eroare: 'refund-ul e deja în lucru' };

  try {
    const p = await getPayment(rand.payment_id);
    if (p.isRefundable === false) throw new MaibError('maib spune că plata nu se poate returna', 0);
    const suma = Number(p.refundableAmount ?? rand.amount);
    const r = await refundPayment(rand.payment_id, suma, motiv);
    const { error } = await supabase.from('maib_checkouts').update({
      refund_id: r.refundId,
      refund_status: r.status,
      updated_at: new Date().toISOString(),
    }).eq('checkout_id', rand.checkout_id);
    if (error) return { ok: false, eroare: `refund-ul ${r.refundId} e creat la maib, dar nu s-a scris în bază: ${error.message}` };
    revalidatePath('/plati');
    return { ok: true, mesaj: `refund ${r.refundId}: ${r.status}` };
  } catch (e) {
    // maib a refuzat: eliberăm revendicarea, ca să se poată încerca din nou.
    await supabase.from('maib_checkouts').update({ refund_status: null, refund_reason: null, updated_at: new Date().toISOString() })
      .eq('checkout_id', rand.checkout_id).is('refund_id', null);
    revalidatePath('/plati');
    return eroare(e);
  }
}

export async function verificaRefund(checkoutId: string): Promise<Rezultat> {
  requireRole(await verifySession(), 'ADMIN');
  const rand = await randDupaCheckoutSauOrder(checkoutId);
  if (!rand?.refund_id) return { ok: false, eroare: 'fără refund' };
  try {
    const r = await getRefund(rand.refund_id);
    const upd: Record<string, unknown> = { refund_status: r.status, updated_at: new Date().toISOString() };
    if (stareEgala(r.status, 'Accepted')) {
      upd.refunded_amount = Number(r.amount);
      if (rand.payment_id) {
        const p = await getPayment(rand.payment_id).catch(() => null);
        if (p) { upd.payment_status = p.status; upd.refunded_amount = Number(p.refundedAmount ?? r.amount); }
      }
    }
    await getSupabase().from('maib_checkouts').update(upd).eq('checkout_id', rand.checkout_id);
    revalidatePath('/plati');
    return { ok: true, mesaj: `refund: ${r.status}` };
  } catch (e) {
    return eroare(e);
  }
}
