import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { alertAdmins, sendTelegramTextSigur } from '@/lib/telegram-notify';

// Alertele biletelor online în tabul «Bilete online» al grupei «ai tlx/translux» (Ion, 09.10.2026: «pune diferite
// topicuri, unul din ele bilete online»). Grupa și tabul vin din app_config (bilete_alerte_chat, bilete_alerte_tab);
// fără ele sau dacă grupa refuză — la ADMIN în privat, ca până acum (alertAdmins), ca nicio alertă să nu se piardă.

export async function alertaBilete(text: string): Promise<boolean> {
  const { data } = await getSupabase().from('app_config').select('key, value').in('key', ['bilete_alerte_chat', 'bilete_alerte_tab']);
  const m = new Map((data || []).map((r: { key: string; value: string }) => [r.key, String(r.value ?? '').trim()]));
  const chat = m.get('bilete_alerte_chat');
  const tab = Number(m.get('bilete_alerte_tab'));
  if (chat && /^-?\d+$/.test(chat)) {
    const r = await sendTelegramTextSigur(chat, text, Number.isInteger(tab) && tab > 0 ? tab : null);
    if (r.messageId) return true;
    console.warn('[bilete] alerta n-a ajuns în tabul grupei → la ADMIN în privat');
  }
  return alertAdmins(text);
}
