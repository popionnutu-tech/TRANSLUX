// Anunțul cu prețurile noi în grupa Mejgorod (Ion, 15.09: «fiecare joi când se
// face update la prețuri — noile prețuri în formă imagini cu principalele
// locații schimbare preț; și se spune: pentru informație adițională vizitați
// site-ul»).
//
// DE CE ÎN GRUPA ȘOFERILOR. Ea e singurul loc în care parcul poate trimite o
// imagine: canal de Telegram pentru pasageri nu există, iar codul de Facebook /
// TikTok doar CITEȘTE și răspunde la comentarii — nimic nu publică postări.
// Șoferul e omul care ia banii vineri dimineața, deci e primul care trebuie să
// știe prețul nou, iar imaginea e gata de arătat pasagerului care întreabă.
//
// Momentul: la CONFIRMAREA tarifului (automat joi seara sau din panou), nu în
// ziua intrării în vigoare. Așa anunțul spune «de mâine», cum a cerut Ion, și
// nimeni nu află vineri la prima cursă.
import { getSupabase } from '@/lib/supabase';
import { sendTelegramPhoto, alertAdmins, escapeHtml } from '@/lib/telegram-notify';
import { graficGroupChatId } from '@/lib/grafic-group';
import { comparaPreturi, ofertaBalti } from '@/lib/price-popular';
import { generatePriceImage, ddmmyyyy } from '@/lib/price-image';

/** Adresa pe care o citește pasagerul — aceeași pe care o spune agentul vocal. */
export const SITE = 'translux.md';

export type AnuntStatus = 'sent' | 'already' | 'no_group' | 'no_rows' | 'error';
export interface AnuntRezultat {
  status: AnuntStatus;
  applyOn?: string;
  changed?: number;
  reason?: string;
}

/**
 * Anunțul ratat trebuie să se AUDĂ: altfel tariful intră în vigoare vineri și
 * nimeni nu știe că grupa n-a aflat. Avertismentul merge la admini, o linie.
 */
async function avertizeaza(motiv: string): Promise<void> {
  await alertAdmins(`⚠️ <b>Prețuri noi — anunțul în grupă</b>\n${escapeHtml(motiv)}`)
    .catch((err) => { console.error('anuntaPreturiNoi: alertAdmins', err); return false; });
}

function ziuaDinainte(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const ZILE_RO = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const ZILE_RU = ['воскресенья', 'понедельника', 'вторника', 'среды', 'четверга', 'пятницы', 'субботы'];

/**
 * Subtitlul: două fraze, câte una pe limbă. Imaginea spune prețurile, textul
 * spune DIN CÂND și unde se uită omul pentru restul destinațiilor. Telegram
 * taie la 1024 de caractere, dar aici nu ne apropiem.
 */
export function pretCaption(applyOn: string, azi: string): string {
  const [y, m, d] = applyOn.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const data = ddmmyyyy(applyOn);
  // Tariful confirmat joi intră în vigoare vineri: «de mâine» e cuvântul cel mai
  // limpede pentru omul care citește seara. Ziua se scrie oricum lângă el —
  // mesajul e citit și peste două zile, când «mâine» ar minți.
  const roCand = applyOn <= azi ? 'de azi' : `de ${ZILE_RO[dow]}, ${data}`;
  const ruCand = applyOn <= azi ? 'с сегодняшнего дня' : `с ${ZILE_RU[dow]}, ${data}`;
  return [
    `💰 <b>Prețuri noi ${roCand}</b>`,
    `Pentru informații suplimentare vizitați ${SITE}`,
    '',
    `💰 <b>Новые цены ${ruCand}</b>`,
    `Для дополнительной информации посетите ${SITE}`,
  ].join('\n');
}

/**
 * Trimite imaginea o singură dată pe propunere.
 *
 * Paza (`announced_at`) se scrie DUPĂ ce Telegram a primit imaginea: o cădere de
 * moment se reîncearcă la următoarea confirmare/rulare, în loc să lase săptămâna
 * fără anunț. Funcția nu aruncă niciodată — aplicarea tarifului nu are voie să
 * pice fiindcă n-a mers un mesaj.
 */
export async function anuntaPreturiNoi(proposalId: string, applyOn: string): Promise<AnuntRezultat> {
  try {
    const supabase = getSupabase();

    const { data: prop } = await supabase
      .from('pending_price_updates')
      .select('announced_at')
      .eq('id', proposalId)
      .maybeSingle();
    if ((prop as { announced_at: string | null } | null)?.announced_at) {
      return { status: 'already', applyOn };
    }

    const chatId = await graficGroupChatId();
    if (!chatId) {
      await avertizeaza('Grupa Mejgorod nu e legată (/lega_grafic) — anunțul cu prețurile noi nu a plecat.');
      return { status: 'no_group', applyOn, reason: 'grupa nu e legată (/lega_grafic)' };
    }

    const { randuri, tarifNou } = await comparaPreturi(ziuaDinainte(applyOn), applyOn);
    if (randuri.length === 0) return { status: 'no_rows', applyOn, reason: 'nicio destinație cu km' };

    const png = await generatePriceImage({ randuri, aplicaDin: applyOn, site: SITE, oferta: ofertaBalti(tarifNou.rateLong) });
    const azi = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
    const sent = await sendTelegramPhoto(chatId, png, pretCaption(applyOn, azi), `preturi-${applyOn}.png`);
    if (!sent.ok) {
      await avertizeaza('Telegram nu a primit imaginea cu prețurile noi.');
      return { status: 'error', applyOn, reason: 'Telegram nu a primit imaginea' };
    }

    await supabase.from('pending_price_updates')
      .update({ announced_at: new Date().toISOString() })
      .eq('id', proposalId);

    return {
      status: 'sent',
      applyOn,
      changed: randuri.filter((r) => r.vechi !== null && r.vechi !== r.nou).length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('anuntaPreturiNoi:', msg);
    return { status: 'error', applyOn, reason: msg };
  }
}
