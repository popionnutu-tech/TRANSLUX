import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { getPayment, getRefund, refundPayment, stareEgala, MaibError } from '@/lib/maib/client';
import { deciziaRefund } from '@/lib/maib/refund-decizie';

// Refund-ul maib pe plățile de test din /plati (fără comandă de bilete): revendicarea anti-dublu, apelul la bancă,
// starea. Comenzile de bilete trec prin intenția de refund (558, lib/bilete/refund-intentii.ts).
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
 * Scrie starea refund-ului pe rândul plății. Comenzile de bilete NU se mai finalizează de aici (558): o comandă devine
 * «returnata» doar ca membru al intenției ei de refund (bilete_refund_finalizeaza), niciodată din refund-ul altui bilet
 * de pe aceeași plată — de aceea a dispărut marcajul-alertă PACHET_REFUND_OCUPAT.
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
  const { data: c } = await db.from('bilete_comenzi').select('id').eq('checkout_id', checkoutId).maybeSingle();
  return { decizie, comandaId: (c?.id as string | undefined) ?? null };
}

/**
 * «Verifică refund-ul» (/plati, /bilete). Plata unei comenzi de bilete: un pas pentru fiecare intenție a ei (refund-intentii.ts),
 * acum. Plata de test fără comandă: starea refund-ului de la bancă, scrisă pe rând.
 */
export async function verificaSiFinalizeazaRefund(checkout: { checkout_id: string; refund_id: string | null; payment_id: string | null }) {
  const { proceseazaIntentiilePlatii } = await import('@/lib/bilete/refund-intentii');
  const { count } = await getSupabase().from('bilete_refund_intentii').select('id', { count: 'exact', head: true }).eq('checkout_id', checkout.checkout_id);
  if ((count ?? 0) > 0) {
    const rez = await proceseazaIntentiilePlatii(checkout.checkout_id, { grabeste: true });
    const stari = rez.map((r) => r.stare);
    const decizie: ReturnType<typeof deciziaRefund> = stari.length && stari.every((s) => s === 'finalizata') ? 'returnata'
      : stari.some((s) => s === 'refuzata') ? 'respins' : 'in_curs';
    const { data: c } = await getSupabase().from('bilete_comenzi').select('id').eq('checkout_id', checkout.checkout_id).maybeSingle();
    return { decizie, comandaId: (c?.id as string | undefined) ?? null };
  }
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
