import { getSupabase } from '../supabase.js';

const db = () => getSupabase();

// Grupa șoferilor (Ion, 02.09): acolo ajung reclamațiile care cad pe ei și
// lucrurile uitate în autobuz. Mesajele le trimite panoul (apps/admin), care
// citește id-ul de aici — botul doar leagă grupa.
//
// Id-ul stă în app_config, nu într-o variabilă de mediu: schimbarea grupei nu
// trebuie să ceară deploy, iar cine leagă grupa e chiar omul din ea.

// Cheia e în @translux/db: panoul citește exact aceeași valoare.
import { DRIVERS_GROUP_CONFIG_KEY } from '@translux/db';
export const DRIVERS_GROUP_KEY = DRIVERS_GROUP_CONFIG_KEY;

export async function bindDriversGroup(chatId: number): Promise<void> {
  const { error } = await db()
    .from('app_config')
    .upsert({ key: DRIVERS_GROUP_KEY, value: String(chatId), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`bindDriversGroup: ${error.message}`);
}

export async function currentDriversGroup(): Promise<string | null> {
  const { data } = await db()
    .from('app_config')
    .select('value')
    .eq('key', DRIVERS_GROUP_KEY)
    .maybeSingle();
  return (data?.value ?? '').trim() || null;
}
