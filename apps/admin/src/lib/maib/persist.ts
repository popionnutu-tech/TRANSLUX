import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { maibMediu } from '@/lib/maib/client';

// Rândul din maib_checkouts pentru o sesiune creată la maib (ION-193). Clientul (lib/maib/client.ts) face
// doar HTTP; evidența e aici, folosită de /plati (plata de test), de comanda de bilete și de callback-ul care
// întâlnește un checkoutId necunoscut (comanda a rămas «eroare_creare» după un timeout la creare).

export interface CheckoutDePersistat {
  checkoutId: string;
  orderId: string;
  amount: number;
  description?: string | null;
  checkoutUrl?: string | null;
  status?: string;
  paymentId?: string | null;
  paymentStatus?: string | null;
  callback?: Record<string, unknown> | null;
  createdBy?: string | null;
}

export async function persistaCheckout(c: CheckoutDePersistat): Promise<{ error: string | null }> {
  const { error } = await getSupabase().from('maib_checkouts').insert({
    checkout_id: c.checkoutId,
    order_id: c.orderId,
    mediu: maibMediu(),
    amount: Number(c.amount.toFixed(2)),
    currency: 'MDL',
    description: c.description ?? null,
    status: c.status ?? 'WaitingForInit',
    checkout_url: c.checkoutUrl ?? null,
    payment_id: c.paymentId ?? null,
    payment_status: c.paymentStatus ?? null,
    callback: c.callback ?? null,
    callback_at: c.callback ? new Date().toISOString() : null,
    created_by: c.createdBy ?? null,
  });
  return { error: error ? error.message : null };
}
