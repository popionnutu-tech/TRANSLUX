'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import {
  cancelCheckout, createCheckout, getPayment, getRefund, refundPayment,
  maibMediu, maibConfigurat, stareEgala, MaibError,
} from '@/lib/maib/client';
import { randDupaCheckoutSauOrder as randDupaRef, sincronizeazaStare } from '@/lib/maib/sincronizare';
import { persistaCheckout } from '@/lib/maib/persist';
import { ComandaError, creeazaComanda } from '@/lib/bilete/comenzi';

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
  // Plata unei comenzi de bilete: returnarea de aici ar lăsa biletele valide (Codex X5). Până la pasul 6 (anularea
  // coordonată, aceeași funcție pentru pasager și admin), refuzăm — nu există cale de refund pe bilete în v1.
  // … și după order_id (comanda orfană, încă nelegată): uuid-ul din order_id e id-ul ei. O eroare la citire = refuz.
  const { data: comanda, error: cErr } = await getSupabase().from('bilete_comenzi').select('id, status')
    .or(`checkout_id.eq.${rand.checkout_id}${/^[0-9a-f-]{36}$/i.test(rand.order_id) ? `,id.eq.${rand.order_id}` : ''}`)
    .limit(1).maybeSingle();
  if (cErr) return { ok: false, eroare: `nu pot verifica dacă plata e a unei comenzi de bilete (${cErr.message}); nu returnez` };
  if (comanda) return { ok: false, eroare: `plata aparține comenzii de bilete ${comanda.id} (${comanda.status}); returnarea biletelor se face din /bilete (pasul 6), nu de aici` };
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
