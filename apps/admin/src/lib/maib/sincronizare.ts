import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { getCheckout, stareEgala, MaibError } from '@/lib/maib/client';

// Sincronizarea unei sesiuni maib cu baza, FĂRĂ revalidatePath: o cheamă și pagina /plati la
// randare (întoarcerea de la maib), unde Next interzice revalidarea («revalidatePath during render»,
// văzut pe viu de Ion la primul test, 02.10.2026), și acțiunea de pe buton, care revalidează ea.

export interface MaibCheckoutRow {
  checkout_id: string;
  order_id: string;
  status: string;
  checkout_url: string | null;
  payment_id: string | null;
  payment_status: string | null;
  refunded_amount: number;
  [k: string]: unknown;
}

export type SincronizareRezultat =
  | { ok: true; rand?: MaibCheckoutRow; mesaj?: string }
  | { ok: false; eroare: string };

export async function randDupaCheckoutSauOrder(ref: string): Promise<MaibCheckoutRow | null> {
  const col = /^[0-9a-f-]{36}$/i.test(ref) ? 'checkout_id' : 'order_id';
  const { data } = await getSupabase().from('maib_checkouts').select('*').eq(col, ref).maybeSingle();
  return (data as MaibCheckoutRow | null) ?? null;
}

/** Citește starea de la maib și o scrie în rând (callback-ul poate întârzia sau lipsi). */
export async function sincronizeazaStare(ref: string): Promise<SincronizareRezultat> {
  const rand = await randDupaCheckoutSauOrder(ref);
  if (!rand) return { ok: false, eroare: 'sesiune necunoscută' };
  try {
    const c = await getCheckout(rand.checkout_id);
    const p = c.payment ?? null;
    const upd: Record<string, unknown> = {
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
    // Biletele (ION-193): dacă plata e executată și callback-ul s-a pierdut, le emite sincronizarea — funcția din
    // bază e idempotentă și verifică singură suma; pe o plată de test din /plati întoarce 0 (nu e comandă).
    if (stareEgala(c.status, 'Completed') && p && stareEgala(p.status, 'Executed')) {
      const { error: rpcErr } = await getSupabase().rpc('bilete_marcheaza_platita', { p_checkout_id: rand.checkout_id });
      if (rpcErr) console.error('[maib/sincronizare] bilete_marcheaza_platita:', rpcErr.message);
    }
    return { ok: true, rand: data as MaibCheckoutRow };
  } catch (e) {
    // Sesiunea nu mai există / a expirat la maib — o marcăm, ca să nu rămână «în așteptare» pe veci.
    // Verificat 02.10.2026: sandbox-ul răspunde HTTP 200 + ok=false + cod «…-1800» (docs: 43001 / 404).
    if (e instanceof MaibError && !stareEgala(rand.status, 'Completed') && (e.status === 404 || e.errors.some(x => /-(1800|43001)$/.test(x.errorCode ?? '')))) {
      await getSupabase().from('maib_checkouts').update({ status: 'Expired', updated_at: new Date().toISOString() }).eq('checkout_id', rand.checkout_id);
      return { ok: true, mesaj: 'maib nu mai cunoaște sesiunea (expirată)' };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, eroare: msg };
  }
}
