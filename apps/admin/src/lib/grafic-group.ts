import { getSupabase } from './supabase';
import { GRAFIC_GROUP_CONFIG_KEY } from '@translux/db';

// Grupa «Mejgorod» — șoferii de interurban (Ion, 07.09.2026): «după ce a
// introdus toată informația să apară graficul, imaginea vizuală, toate cursele
// în grupa Telegram Mejgorod, ca fiecare șofer să cunoască mâine pe ce cursă
// va fi».
//
// Grupa se leagă din bot cu /lega_grafic, scrisă ÎN grupă de un administrator —
// același tipar ca /lega_reclamatii. Cheie SEPARATĂ de grupa reclamațiilor:
// nu e sigur că e același chat, iar un grafic postat în grupa greșită nu se
// mai retrage.

export { GRAFIC_GROUP_CONFIG_KEY } from '@translux/db';

// Fără cache: se citește o dată pe trimitere, iar trimiterea e un click al
// dispecerului, nu o cale fierbinte. Un TTL ar fi ascuns legarea grupei
// timp de minute bune — exact când Ion o încearcă prima dată.
export async function graficGroupChatId(): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from('app_config')
    .select('value')
    .eq('key', GRAFIC_GROUP_CONFIG_KEY)
    .maybeSingle();
  if (error) {
    console.error('graficGroupChatId:', error.message);
    return null;
  }
  return (data?.value ?? '').trim() || null;
}

const ZILE_RO = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];

/** «marți, 08.09.2026» — ziua din data ISO, fără fus orar (data e calendaristică). */
export function ziuaRo(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${ZILE_RO[dow]}, ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

/**
 * Subtitlul imaginii din grupă. Scurt: imaginea spune tot; textul doar
 * spune CE zi e (ca șoferul care deschide grupa peste două zile să nu ia
 * graficul de ieri drept cel de azi) și dacă e o retrimitere după corectare.
 */
export function graficGroupCaption(dateIso: string, rowsCount: number, resend: boolean): string {
  const curse = rowsCount === 1 ? '1 cursă' : `${rowsCount} curse`;
  return [
    `📋 <b>Grafic interurban — ${ziuaRo(dateIso)}</b>`,
    `${curse} cu șofer. Fiecare își găsește numele în coloana din dreapta.`,
    resend ? '🔁 <i>Grafic corectat — înlocuiește imaginea trimisă mai devreme pentru această zi.</i>' : null,
  ].filter(Boolean).join('\n');
}
