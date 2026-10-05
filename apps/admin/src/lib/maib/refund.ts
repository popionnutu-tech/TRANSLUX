import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { getPayment, getRefund, refundPayment, stareEgala, MaibError } from '@/lib/maib/client';
import { deciziaRefund } from '@/lib/maib/refund-decizie';

// Refund-ul maib — O SINGURĂ cale (ION-194): revendicarea anti-dublu, apelul la bancă, finalizarea. O folosesc
// /plati (plățile de test), anularea comenzilor de bilete (pasager/admin/sistem) și împăcarea din cron.
// Trei rezultate, care contează pentru bani: «creat» (banca a acceptat cererea), «refuz» (banca a spus clar NU —
// se poate reveni), «necunoscut» (timeout/5xx — poate că refund-ul EXISTĂ; nu se revine, se împacă).

export type RezultatRefund =
  | { fel: 'creat'; refundId: string; status: string }
  | { fel: 'refuz'; motiv: string }
  | { fel: 'necunoscut'; motiv: string };

/** Revendică refund-ul (refund_status NULL → Pending). false = e deja în lucru / făcut. */
export async function revendicaRefund(checkoutId: string, motiv: string): Promise<{ ok: boolean; eroare?: string }> {
  const { data, error } = await getSupabase()
    .from('maib_checkouts')
    .update({ refund_status: 'Pending', refund_reason: motiv.trim().slice(0, 500), updated_at: new Date().toISOString() })
    .eq('checkout_id', checkoutId)
    .is('refund_id', null)
    .is('refund_status', null)
    .select('checkout_id');
  if (error) return { ok: false, eroare: error.message };
  return { ok: Boolean(data && data.length) };
}

/** Eliberează revendicarea după un refuz EXPLICIT al băncii (niciodată după timeout). */
export async function elibereazaRefund(checkoutId: string): Promise<void> {
  await getSupabase().from('maib_checkouts')
    .update({ refund_status: null, refund_reason: null, updated_at: new Date().toISOString() })
    .eq('checkout_id', checkoutId).is('refund_id', null);
}

/**
 * Cere băncii refund-ul plății (checkout-ul trebuie să fie deja revendicat): integral, sau `suma` (returnarea parțială
 * după grilă, ION-244). Scrie refund_id/status la «creat», `Necunoscut` la timeout/5xx. Nu eliberează nimic la refuz —
 * apelantul decide (bilete: reactivare).
 */
export async function executaRefund(checkout: { checkout_id: string; payment_id: string | null; amount: number }, motiv: string, suma?: number): Promise<RezultatRefund> {
  const db = getSupabase();
  if (!checkout.payment_id) return { fel: 'refuz', motiv: 'plata nu are paymentId' };
  try {
    const p = await getPayment(checkout.payment_id);
    if (p.isRefundable === false) return { fel: 'refuz', motiv: 'maib spune că plata nu se poate returna' };
    if (!stareEgala(p.status, 'Executed')) return { fel: 'refuz', motiv: `plata e ${p.status}, nu Executed` };
    const returnabil = Number(p.refundableAmount ?? checkout.amount);
    if (suma != null && !(suma > 0 && suma <= returnabil + 0.001)) return { fel: 'refuz', motiv: `suma ${suma} nu e între 0 și ${returnabil}` };
    const r = await refundPayment(checkout.payment_id, suma ?? returnabil, motiv);
    const { error } = await db.from('maib_checkouts')
      .update({ refund_id: r.refundId, refund_status: r.status, updated_at: new Date().toISOString() })
      .eq('checkout_id', checkout.checkout_id);
    if (error) {
      // Refund-ul EXISTĂ la bancă, dar nu l-am scris: împăcarea îl regăsește prin getPayment.refundedAmount.
      await db.from('maib_checkouts').update({ refund_status: 'Necunoscut', updated_at: new Date().toISOString() }).eq('checkout_id', checkout.checkout_id);
      return { fel: 'necunoscut', motiv: `refund ${r.refundId} creat la maib, nescris: ${error.message}` };
    }
    return { fel: 'creat', refundId: r.refundId, status: r.status };
  } catch (e) {
    const refuzClar = e instanceof MaibError && e.status >= 400 && e.status < 500 && e.status !== 0;
    // maib întoarce și «ok:false» cu HTTP 200 + cod de eroare (ION-188): e refuz clar, nu necunoscut.
    const refuzLogic = e instanceof MaibError && e.status === 200;
    if (refuzClar || refuzLogic) return { fel: 'refuz', motiv: e instanceof Error ? e.message : String(e) };
    await db.from('maib_checkouts').update({ refund_status: 'Necunoscut', updated_at: new Date().toISOString() })
      .eq('checkout_id', checkout.checkout_id).is('refund_id', null);
    return { fel: 'necunoscut', motiv: e instanceof Error ? e.message : String(e) };
  }
}

export type StareRefundMaib = { status: string; amount?: number; refundedAmount?: number; paymentStatus?: string | null };

export { deciziaRefund };

/**
 * Scrie starea refund-ului pe checkout ȘI pe comanda de bilete legată (dacă există și e «anulata»):
 * Accepted → «returnata» + refund_finalizat_la; Rejected/Manual → alertă refund_respins + refund_finalizat_la.
 * Folosită de «Verifică refund-ul» din /plati și de împăcare (Codex C4: o singură finalizare).
 */
export async function finalizeazaRefund(checkoutId: string, stare: StareRefundMaib): Promise<{ decizie: ReturnType<typeof deciziaRefund>; comandaId: string | null }> {
  const db = getSupabase();
  const upd: Record<string, unknown> = { refund_status: stare.status, updated_at: new Date().toISOString() };
  const decizie = deciziaRefund(stare.status);
  if (decizie === 'returnata') {
    upd.refunded_amount = Number(stare.refundedAmount ?? stare.amount ?? 0);
    if (stare.paymentStatus) upd.payment_status = stare.paymentStatus;
  }
  await db.from('maib_checkouts').update(upd).eq('checkout_id', checkoutId);

  const { data: c } = await db.from('bilete_comenzi').select('id, status').eq('checkout_id', checkoutId).maybeSingle();
  if (!c || c.status !== 'anulata') return { decizie, comandaId: c?.id ?? null };
  if (decizie === 'returnata') {
    await db.from('bilete_comenzi').update({ status: 'returnata', refund_finalizat_la: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', c.id).eq('status', 'anulata');
    await db.from('bilete').update({ status: 'returnat' }).eq('comanda_id', c.id).eq('status', 'anulat');
  } else if (decizie === 'respins') {
    await db.from('bilete_comenzi').update({ refund_finalizat_la: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', c.id);
    await db.from('bilete_alerte').insert({ comanda_id: c.id, tip: 'refund_respins', detalii: `maib: ${stare.status}` });
  }
  return { decizie, comandaId: c.id };
}

/** Citește starea refund-ului de la bancă și o finalizează. */
export async function verificaSiFinalizeazaRefund(checkout: { checkout_id: string; refund_id: string | null; payment_id: string | null }) {
  if (!checkout.refund_id) return null;
  const r = await getRefund(checkout.refund_id);
  let paymentStatus: string | null = null;
  let refundedAmount: number | undefined;
  if (deciziaRefund(r.status) === 'returnata' && checkout.payment_id) {
    const p = await getPayment(checkout.payment_id).catch(() => null);
    if (p) { paymentStatus = p.status; refundedAmount = Number(p.refundedAmount ?? r.amount); }
  }
  return finalizeazaRefund(checkout.checkout_id, { status: r.status, amount: Number(r.amount), refundedAmount, paymentStatus });
}
