import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { telegramIdDinInitData } from './sofer-reguli';

// Identitatea șoferului în mini app-ul biletelor (ION-239, contractul ION-190 pașii 7–8): antetul X-Telegram-Init-Data
// = Telegram.WebApp.initData, verificat HMAC (lib/telegram/init-data.ts, fără ocolul `__dev__` al zadachnik-ului),
// auth_date ≤ 24 h, apoi `drivers` după telegram_id (legat prin /start sofer, ION-234) și active.
// 401 «nelegat» = semnătură rea, user lipsă sau șofer nelegat/inactiv; 401 «expirat» = initData mai vechi de 24 h.

export interface SoferAutentificat { id: string; nume: string; telegram_id: number }
export type SoferAuth =
  | { ok: true; sofer: SoferAutentificat }
  | { ok: false; status: 401; eroare: 'nelegat' | 'expirat' };

export async function soferDinInitData(initData: string | null | undefined): Promise<SoferAuth> {
  const v = telegramIdDinInitData(initData, process.env.TELEGRAM_BOT_TOKEN);
  if (!v.ok) return { ok: false, status: 401, eroare: v.eroare };
  const { data, error } = await getSupabase()
    .from('drivers')
    .select('id, full_name, telegram_id')
    .eq('telegram_id', v.telegramId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw new Error(`drivers: ${error.message}`);
  if (!data) return { ok: false, status: 401, eroare: 'nelegat' };
  const d = data as { id: string; full_name: string; telegram_id: number };
  return { ok: true, sofer: { id: d.id, nume: d.full_name, telegram_id: Number(d.telegram_id) } };
}

/**
 * Plafon pe șofer (telegram_id), în bază, ca plafonPublic: 60 de apeluri pe minut. Dacă plafonul nu se poate verifica,
 * cererea trece — lista șoferului trebuie să se poată încărca.
 */
export async function plafonSofer(telegramId: number, max = 60): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('bilete_plafon', { p_cheie: `sofer:${telegramId}`, p_fereastra_s: 60, p_max: max });
  if (error) { console.warn('[bilete-sofer] plafon:', error.message); return true; }
  return data !== false;
}
