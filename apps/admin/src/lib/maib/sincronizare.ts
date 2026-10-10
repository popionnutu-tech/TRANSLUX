import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { anuntaBotul } from '@/lib/bilete/anunta-botul';
import { anuntaVanzarea } from '@/lib/bilete/vanzari-grupa';
import { getCheckout, getPayment, stareEgala, MaibError } from '@/lib/maib/client';
import { oraExecutarii } from '@/lib/bilete/impacare-reguli';

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

/** M3: o alertă pe comandă (deduplicată pe comandă + tip) când ora execuției lipsește după toate citirile. */
async function alertaOraLipsa(rand: MaibCheckoutRow, ora: string | null): Promise<void> {
  const db = getSupabase();
  const { data: c } = await db.from('bilete_comenzi').select('id').eq('checkout_id', rand.checkout_id).maybeSingle();
  const comandaId = (c?.id as string | undefined) ?? (/^[0-9a-f-]{36}$/i.test(rand.order_id) ? rand.order_id : null);
  if (!comandaId) return;
  const { data: deja } = await db.from('bilete_alerte').select('id').eq('comanda_id', comandaId).eq('tip', 'ora_plata_lipsa').limit(1);
  if (deja && deja.length) return;
  await db.from('bilete_alerte').insert({
    comanda_id: comandaId, tip: 'ora_plata_lipsa',
    detalii: ora ? `banca n-a dat ora execuției plății după 3 citiri; plata se judecă după ora finalizării (${ora})`
      : 'banca n-a dat nici ora execuției, nici ora finalizării plății; plata nu se clasifică — comanda rămâne neatinsă și vizibilă',
  });
}

/** Citește starea de la maib și o scrie în rând (callback-ul poate întârzia sau lipsi). */
export async function sincronizeazaStare(ref: string): Promise<SincronizareRezultat> {
  const rand = await randDupaCheckoutSauOrder(ref);
  if (!rand) return { ok: false, eroare: 'sesiune necunoscută' };
  try {
    const c = await getCheckout(rand.checkout_id);
    const p = c.payment ?? null;
    // Starea nu dă înapoi: o sesiune deja Completed (scrisă de callback între timp) nu se rescrie cu un
    // snapshot mai vechi citit de aici (Codex X7).
    const stareNoua = stareEgala(rand.status, 'Completed') && !stareEgala(c.status, 'Completed') ? rand.status : c.status;
    const upd: Record<string, unknown> = {
      status: stareNoua,
      checkout_url: c.url ?? rand.checkout_url,
      updated_at: new Date().toISOString(),
    };
    if (p?.paymentId) {
      upd.payment_id = p.paymentId;
      upd.payment_status = p.status;
      upd.refunded_amount = Number(p.refundedAmount ?? rand.refunded_amount ?? 0);
      // 560 (C2): ora execuției la bancă; fără ea plata nu se clasifică (bilete_marcheaza_platita așteaptă).
      let executat = p.executedAt ?? null;
      if (!executat && !rand.executat_la && (stareEgala(p.status, 'Executed') || stareEgala(p.status, 'PartiallyRefunded') || stareEgala(p.status, 'Refunded'))) {
        executat = (await getPayment(p.paymentId).catch(() => null))?.executedAt ?? null;
      }
      if (rand.executat_la) {
        if (executat && Number.isFinite(Date.parse(executat))) upd.executat_la = new Date(Date.parse(executat)).toISOString();
      } else if (stareEgala(c.status, 'Completed') && stareEgala(p.status, 'Executed')) {
        // Revizia 10.10 (M3): ora lipsă nu blochează banii pe veci — după 3 citiri, ora finalizării plății (completedAt),
        // cu O alertă; niciodată ora curentă.
        const o = oraExecutarii({ executedAt: executat, completedAt: c.completedAt ?? null, lipsaInainte: Number(rand.executat_la_lipsa ?? 0) });
        if (o.ora) { upd.executat_la = o.ora; upd.executat_la_sursa = o.sursa; }
        if (o.sursa !== 'executedAt') upd.executat_la_lipsa = o.lipsa;
        if (o.alerta) await alertaOraLipsa(rand, o.ora);
      } else if (executat && Number.isFinite(Date.parse(executat))) {
        upd.executat_la = new Date(Date.parse(executat)).toISOString();
      }
    }
    // Condiția e în UPDATE (Codex X7, runda 2): dacă NU scriem Completed, nu atingem un rând devenit Completed între
    // timp (callback-ul). Dacă rândul a fost sărit, îl recitim și raportăm starea lui reală.
    let q = getSupabase().from('maib_checkouts').update(upd).eq('checkout_id', rand.checkout_id);
    if (!stareEgala(stareNoua, 'Completed')) q = q.not('status', 'ilike', 'completed');
    const { data: scrise, error } = await q.select('*');
    if (error) return { ok: false, eroare: error.message };
    let data = (scrise && scrise[0]) as MaibCheckoutRow | undefined;
    if (!data) {
      const { data: acum } = await getSupabase().from('maib_checkouts').select('*').eq('checkout_id', rand.checkout_id).maybeSingle();
      data = (acum as MaibCheckoutRow | null) ?? rand;
    }
    // Biletele (ION-193): dacă plata e executată și callback-ul s-a pierdut, le emite sincronizarea — funcția din
    // bază e idempotentă și verifică singură suma și starea plății; pe o plată de test din /plati întoarce 0.
    // O eroare a emiterii se întoarce apelantului (Codex X6): «actualizat» fără bilete nu e succes.
    if (stareEgala(data.status, 'Completed') && stareEgala(data.payment_status, 'Executed')) {
      const { data: emise, error: rpcErr } = await getSupabase().rpc('bilete_marcheaza_platita', { p_checkout_id: rand.checkout_id });
      if (rpcErr) return { ok: false, eroare: `starea e actualizată, dar emiterea biletelor a eșuat: ${rpcErr.message}` };
      // ION-274: biletele emise aici (callback pierdut) ajung și în chatul Telegram la secundă, ca din callback.
      if (Number(emise ?? 0) > 0) { await anuntaBotul(rand.checkout_id); await anuntaVanzarea(rand.checkout_id); }
    }
    return { ok: true, rand: data };
  } catch (e) {
    // Sesiunea nu mai există / a expirat la maib — o marcăm, ca să nu rămână «în așteptare» pe veci.
    // Verificat 02.10.2026: sandbox-ul răspunde HTTP 200 + ok=false + cod «…-1800» (docs: 43001 / 404).
    if (e instanceof MaibError && !stareEgala(rand.status, 'Completed') && (e.status === 404 || e.errors.some(x => /-(1800|43001)$/.test(x.errorCode ?? '')))) {
      await getSupabase().from('maib_checkouts').update({ status: 'Expired', updated_at: new Date().toISOString() })
        .eq('checkout_id', rand.checkout_id).not('status', 'ilike', 'completed');
      return { ok: true, mesaj: 'maib nu mai cunoaște sesiunea (expirată)' };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, eroare: msg };
  }
}
