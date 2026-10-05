import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { BazaIndisponibilaError, biletPublic } from './public';
import { STARI_CLIENT, type ComandaContului, type ContactBrut, type RepoBileteClient } from './client-bilete';

// Accesul la bază pentru biletele clientului din mini app-ul Telegram (ION-249). Erorile bazei → BazaIndisponibilaError
// (ruta răspunde 503, nu o listă goală falsă). Plafonul: 30 de cereri pe minut pe telegram_id, în bază.

const PLAFON_PE_MINUT = 30;

async function comenziActive(telegramId: number, deLaZiua: string, limita: number): Promise<ComandaContului[]> {
  const { data, error } = await getSupabase().from('bilete_comenzi')
    .select('cod, telegram_id')
    .eq('telegram_id', telegramId)
    .in('status', [...STARI_CLIENT])
    .gte('trip_date', deLaZiua)
    .order('departure_at')
    .limit(limita);
  if (error) throw new BazaIndisponibilaError(`bilete_comenzi: ${error.message}`);
  return (data ?? []).map((r) => ({ cod: String(r.cod), telegram_id: r.telegram_id == null ? null : Number(r.telegram_id) }));
}

async function ultimulContact(telegramId: number): Promise<ContactBrut | null> {
  const { data, error } = await getSupabase().from('bilete_comenzi')
    .select('passenger_name, phone')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new BazaIndisponibilaError(`bilete_comenzi: ${error.message}`);
  return data ? { passenger_name: String(data.passenger_name ?? ''), phone: String(data.phone ?? '') } : null;
}

/** Dacă plafonul nu se poate verifica, cererea trece: biletul trebuie să se poată arăta (ca plafonPublic). */
async function plafon(telegramId: number): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('bilete_plafon', { p_cheie: `client:${telegramId}`, p_fereastra_s: 60, p_max: PLAFON_PE_MINUT });
  if (error) { console.warn('[bilete/client] plafon:', error.message); return true; }
  return data !== false;
}

export const repoBileteClient: RepoBileteClient = { comenziActive, biletComplet: biletPublic, ultimulContact, plafon };
