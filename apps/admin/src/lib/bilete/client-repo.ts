import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { BazaIndisponibilaError, biletPublic, echipajPentruComenzi, type ComandaPublica } from './public';
import { asambleazaComanda, COLOANE_BILET, COLOANE_COMANDA, type BiletRand, type ComandaRand, type OprireSosireRand, type RutaRand } from './bilet-asamblare';
import { STARI_CLIENT, type CalatorieIstoric, type ComandaContului, type ContactBrut, type RepoBileteClient } from './client-bilete';

// Accesul la bază pentru biletele clientului din mini app-ul Telegram (ION-249). Erorile bazei → BazaIndisponibilaError
// (ruta răspunde 503, nu o listă goală falsă). Plafonul: 30 de cereri pe minut pe telegram_id, în bază.

const PLAFON_PE_MINUT = 30;

async function comenziActive(telegramId: number, plecareDupa: string, limita: number): Promise<ComandaContului[]> {
  const { data, error } = await getSupabase().from('bilete_comenzi')
    .select('cod, telegram_id')
    .eq('telegram_id', telegramId)
    .in('status', [...STARI_CLIENT])
    .gt('departure_at', plecareDupa)
    .order('departure_at')
    .limit(limita);
  if (error) throw new BazaIndisponibilaError(`bilete_comenzi: ${error.message}`);
  return (data ?? []).map((r) => ({ cod: String(r.cod), telegram_id: r.telegram_id == null ? null : Number(r.telegram_id) }));
}

/** Câte comenzi recente se citesc pentru contact (ION-276): numele/telefonul din cea mai nouă, e-mailul din cea mai nouă cu e-mail. */
const CONTACT_RECENTE = 20;

async function ultimulContact(telegramId: number): Promise<ContactBrut | null> {
  const { data, error } = await getSupabase().from('bilete_comenzi')
    .select('passenger_name, phone, email')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(CONTACT_RECENTE);
  if (error) throw new BazaIndisponibilaError(`bilete_comenzi: ${error.message}`);
  const randuri = (data ?? []) as Array<{ passenger_name: string | null; phone: string | null; email: string | null }>;
  if (!randuri.length) return null;
  let email = randuri.find((r) => r.email)?.email ?? null;
  if (!email && randuri.length === CONTACT_RECENTE) {
    // ION-249: e-mailul — cel mai nou lăsat vreodată; rar, mai vechi de ultimele 20 de comenzi → interogarea de rezervă.
    const { data: e } = await getSupabase().from('bilete_comenzi').select('email')
      .eq('telegram_id', telegramId).not('email', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
    email = e?.email ? String(e.email) : null;
  }
  return { passenger_name: String(randuri[0].passenger_name ?? ''), phone: String(randuri[0].phone ?? ''), email: email ? String(email) : null };
}

/** ION-276: comenzile active ale contului, asamblate pe lot: [comenzi + bilete încorporate] → [rute ∥ ore de sosire]. */
async function bileteActiveComplete(telegramId: number, plecareDupa: string, limita: number): Promise<Array<ComandaPublica & { telegram_id: number | null }>> {
  const db = getSupabase();
  const { data, error } = await db.from('bilete_comenzi')
    .select(`${COLOANE_COMANDA}, telegram_id, bilete(${COLOANE_BILET})`)
    .eq('telegram_id', telegramId)
    .in('status', [...STARI_CLIENT])
    .gt('departure_at', plecareDupa)
    .order('departure_at')
    .limit(limita);
  if (error) throw new BazaIndisponibilaError(`bilete_comenzi: ${error.message}`);
  const comenzi = (data ?? []) as unknown as Array<ComandaRand & { telegram_id: number | null; bilete: BiletRand[] | null }>;
  if (!comenzi.length) return [];
  const rute = [...new Set(comenzi.map((c) => c.crm_route_id))];
  const opriri = [...new Set(comenzi.map((c) => c.to_stop_order ?? -1))];
  const [rR, rS, echipaje] = await Promise.all([
    db.from('crm_routes').select('id, dest_from_ro, dest_from_ru, dest_to_ro, dest_to_ru').in('id', rute),
    db.from('crm_stop_fares').select('crm_route_id, stop_order, hour_from_chisinau, hour_from_nord').in('crm_route_id', rute).in('stop_order', opriri),
    echipajPentruComenzi(comenzi),
  ]);
  if (rR.error) throw new BazaIndisponibilaError(rR.error.message);
  if (rS.error) throw new BazaIndisponibilaError(rS.error.message);
  const ruta = new Map(((rR.data ?? []) as RutaRand[]).map((r) => [r.id, r]));
  const sosire = new Map(((rS.data ?? []) as Array<OprireSosireRand & { crm_route_id: number; stop_order: number }>).map((o) => [`${o.crm_route_id}:${o.stop_order}`, o]));
  return Promise.all(comenzi.map(async (c) => ({
    ...(await asambleazaComanda(c, c.bilete ?? [], ruta.get(c.crm_route_id) ?? null, sosire.get(`${c.crm_route_id}:${c.to_stop_order ?? -1}`) ?? null, echipaje.get(c.id) ?? null)),
    telegram_id: c.telegram_id == null ? null : Number(c.telegram_id),
  })));
}

const STARI_ISTORIC = ['platita', 'platita_fara_bilet', 'anulata', 'returnata'];

async function istoric(telegramId: number, limita: number): Promise<CalatorieIstoric[]> {
  const { data, error } = await getSupabase().from('bilete_comenzi')
    .select('cod, telegram_id, status, from_name, to_name, departure_at, seats, total')
    .eq('telegram_id', telegramId).in('status', STARI_ISTORIC)
    .order('departure_at', { ascending: false }).limit(limita);
  if (error) throw new BazaIndisponibilaError(`bilete_comenzi: ${error.message}`);
  return (data ?? []).map((r) => ({
    cod: String(r.cod), telegram_id: r.telegram_id == null ? null : Number(r.telegram_id), status: String(r.status),
    from_name: String(r.from_name), to_name: String(r.to_name), departure_at: String(r.departure_at), seats: Number(r.seats), total: Number(r.total),
  }));
}

/** Dacă plafonul nu se poate verifica, cererea trece: biletul trebuie să se poată arăta (ca plafonPublic). */
async function plafon(telegramId: number): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('bilete_plafon', { p_cheie: `client:${telegramId}`, p_fereastra_s: 60, p_max: PLAFON_PE_MINUT });
  if (error) { console.warn('[bilete/client] plafon:', error.message); return true; }
  return data !== false;
}

export const repoBileteClient: RepoBileteClient = { comenziActive, biletComplet: biletPublic, ultimulContact, istoric, plafon, bileteActiveComplete };
