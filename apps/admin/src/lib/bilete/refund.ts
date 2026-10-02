import 'server-only';
import type { BileteComanda } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { elibereazaRefund, executaRefund, revendicaRefund } from '@/lib/maib/refund';
import { ComandaError } from './comenzi';
import { poateAnulaPasager } from './refund-reguli';

// Anularea comenzii de bilete și returnarea banilor — O SINGURĂ funcție-EXECUTOR (ION-194), chemată de dispecer
// (/plati, apoi /bilete), de sistem (cursă anulată) și de AI-ul din botul Telegram (pasul 6b). Decizia DACĂ se
// returnează NU e aici: Ion (03.10): «validarea la refund doar prin Telegram și trebuie să dăm AI să decidă când se
// face refund — dacă întârzie clientul la rută, nu facem». Aici stau doar regulile tari, care nu se negociază:
// biletul scanat «urcat» nu se mai returnează (funcția din bază refuză), anulare doar pe toată comanda, iar pentru
// sursa «pasager»/«ai» rămâne limita de timp (app_config.bilete_anulare_pasager_min, implicit 120) ca plasă.
// NU există anulare publică de pe site.
//
// Ordinea: 1) comanda → «anulata» + biletele «anulat», atomic în bază (bilete_anuleaza, migr. 487);
//          2) revendicarea refund-ului pe checkout; 3) banca. Refuz EXPLICIT al băncii → comanda revine «platita»
//          (bilete_reactiveaza). Timeout/5xx → rămâne «anulata» + refund «Necunoscut» + alertă; împăcarea decide.

export type SursaAnulare = 'pasager' | 'admin' | 'sistem' | 'ai';

export { poateAnulaPasager };

async function minuteAnularePasager(): Promise<number> {
  const { data } = await getSupabase().from('app_config').select('value').eq('key', 'bilete_anulare_pasager_min').maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) && n >= 0 ? n : 120;
}

export interface RezultatAnulare {
  comanda: BileteComanda;
  /** `creat` = banca a acceptat cererea (se finalizează la «Verifică refund-ul» / împăcare); `necunoscut` = de împăcat. */
  refund: 'creat' | 'necunoscut' | 'fara_plata';
  refundId?: string;
}

export async function anuleazaSiReturneaza(
  comandaId: string,
  opt: { sursa: SursaAnulare; motiv: string },
): Promise<RezultatAnulare> {
  const db = getSupabase();
  const motiv = opt.motiv.trim();
  if (!motiv) throw new ComandaError('validare', 'motivul e obligatoriu');

  const { data: c0, error: e0 } = await db.from('bilete_comenzi').select('*').eq('id', comandaId).maybeSingle();
  if (e0) throw new Error(`bilete_comenzi: ${e0.message}`);
  if (!c0) throw new ComandaError('validare', 'comandă inexistentă');
  const inainte = c0 as BileteComanda;
  if (inainte.status === 'anulata' || inainte.status === 'returnata') {
    return { comanda: inainte, refund: 'fara_plata' };
  }
  if (!(inainte.status === 'platita' || inainte.status === 'platita_fara_bilet')) {
    throw new ComandaError('validare', `comanda e ${inainte.status}, nu se poate anula`);
  }
  if (opt.sursa === 'pasager' || opt.sursa === 'ai') {
    const min = await minuteAnularePasager();
    if (!poateAnulaPasager(inainte.departure_at, Date.now(), min)) {
      throw new ComandaError('inchis', `anularea online se poate face până cu ${min} de minute înaintea plecării; sună la dispecerat`);
    }
  }

  // 1. Anularea, atomic, în bază (refuză dacă vreun bilet e urcat).
  const { data: c1, error: e1 } = await db.rpc('bilete_anuleaza', { p_id: comandaId, p_sursa: opt.sursa, p_motiv: motiv });
  if (e1) {
    if (/BILET_URCAT/.test(e1.message)) throw new ComandaError('inchis', 'un bilet din comandă e deja scanat la urcare; nu se mai returnează');
    if (/STARE_/.test(e1.message)) throw new ComandaError('validare', 'comanda nu e într-o stare care se poate anula');
    throw new Error(`bilete_anuleaza: ${e1.message}`);
  }
  const comanda = c1 as BileteComanda;
  if (opt.sursa === 'admin' && Date.parse(inainte.departure_at) < Date.now()) {
    await db.from('bilete_alerte').insert({ comanda_id: comandaId, tip: 'refund_pe_zi_confirmata', detalii: `refund de admin după plecarea cursei (${inainte.departure_at}): ${motiv}` });
  }

  // 2. Banii. Fără sesiune/plată (platita_fara_bilet fără legătură) → nu există ce returna automat.
  if (!comanda.checkout_id) {
    await db.from('bilete_alerte').insert({ comanda_id: comandaId, tip: 'refund_necunoscut', detalii: 'comanda anulată n-are sesiune maib legată; refund de mână' });
    return { comanda, refund: 'necunoscut' };
  }
  const { data: ck } = await db.from('maib_checkouts').select('checkout_id, payment_id, amount, refund_id, refund_status').eq('checkout_id', comanda.checkout_id).maybeSingle();
  if (!ck) throw new Error('sesiunea maib a comenzii lipsește din bază');
  if (ck.refund_id) return { comanda, refund: 'creat', refundId: ck.refund_id }; // deja cerut (reluare)

  const rev = await revendicaRefund(ck.checkout_id, motiv);
  if (rev.eroare) throw new Error(`revendicare refund: ${rev.eroare}`);
  if (!rev.ok) return { comanda, refund: 'necunoscut' }; // altcineva îl are în lucru chiar acum

  const r = await executaRefund({ checkout_id: ck.checkout_id, payment_id: ck.payment_id, amount: Number(ck.amount) }, motiv);
  if (r.fel === 'creat') return { comanda, refund: 'creat', refundId: r.refundId };
  if (r.fel === 'necunoscut') {
    await db.from('bilete_alerte').insert({ comanda_id: comandaId, tip: 'refund_necunoscut', detalii: r.motiv });
    return { comanda, refund: 'necunoscut' };
  }
  // 3. Refuz explicit: eliberăm revendicarea și readucem comanda (biletele redevin valide).
  await elibereazaRefund(ck.checkout_id);
  const { data: c2, error: e2 } = await db.rpc('bilete_reactiveaza', { p_id: comandaId });
  if (e2) {
    await db.from('bilete_alerte').insert({ comanda_id: comandaId, tip: 'refund_respins', detalii: `banca a refuzat (${r.motiv}) și reactivarea a eșuat: ${e2.message}` });
    throw new ComandaError('maib', `banca a refuzat returnarea (${r.motiv}); comanda a rămas anulată — dispecerul decide`);
  }
  void c2;
  throw new ComandaError('maib', `banca a refuzat returnarea: ${r.motiv}; biletele rămân valabile`);
}
