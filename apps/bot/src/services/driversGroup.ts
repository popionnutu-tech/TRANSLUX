import { getSupabase } from '../supabase.js';

const db = () => getSupabase();

// Grupa șoferilor (Ion, 02.09): acolo ajung reclamațiile clienților (toate, din
// 11.09) și lucrurile uitate în autobuz. Mesajele le trimite panoul (apps/admin), care
// citește id-ul de aici — botul doar leagă grupa.
//
// Id-ul stă în app_config, nu într-o variabilă de mediu: schimbarea grupei nu
// trebuie să ceară deploy, iar cine leagă grupa e chiar omul din ea.

// Cheia e în @translux/db: panoul citește exact aceeași valoare.
import { DRIVERS_GROUP_CONFIG_KEY, GRAFIC_GROUP_CONFIG_KEY } from '@translux/db';
export const DRIVERS_GROUP_KEY = DRIVERS_GROUP_CONFIG_KEY;
// Grupa «Mejgorod» (Ion, 07.09): acolo panoul trimite imaginea graficului
// interurban pe ziua următoare. Legată cu /lega_grafic, cheie separată.
export const GRAFIC_GROUP_KEY = GRAFIC_GROUP_CONFIG_KEY;

async function bindGroup(key: string, chatId: number, what: string): Promise<void> {
  const { error } = await db()
    .from('app_config')
    .upsert({ key, value: String(chatId), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function currentGroup(key: string): Promise<string | null> {
  const { data } = await db()
    .from('app_config')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  return (data?.value ?? '').trim() || null;
}

export async function bindDriversGroup(chatId: number): Promise<void> {
  return bindGroup(DRIVERS_GROUP_KEY, chatId, 'bindDriversGroup');
}

export async function currentDriversGroup(): Promise<string | null> {
  return currentGroup(DRIVERS_GROUP_KEY);
}

export async function bindGraficGroup(chatId: number): Promise<void> {
  return bindGroup(GRAFIC_GROUP_KEY, chatId, 'bindGraficGroup');
}

export async function currentGraficGroup(): Promise<string | null> {
  return currentGroup(GRAFIC_GROUP_KEY);
}
