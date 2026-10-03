import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../types.js';
import { getSupabase } from '../supabase.js';

// Clientul care vine din pagina biletului (ION-199, pasul E0): `/start bilet_<cod>`.
// Ramura stă ÎNAINTEA invitațiilor personalului: altfel payload-ul ajungea la validateInviteToken
// și clientul primea «Link de invitație invalid». Nu atinge `users` (rolurile personalului) și nu
// leagă nimic: arată biletul pe scurt și linkul paginii web. Identificarea prin contact vine la F2,
// iar butonul spre mini app după ce mini app-ul e publicat (triajul Codex C8).

const COD_RE = /^bilet_([0-9a-f]{32})$/i;
const SITE = (process.env.SITE_URL || 'https://translux.md').replace(/\/+$/, '');

/** `bilet_<32 hex>` → codul în litere mici; altceva → null. Pur, testat. */
export function codDinPayload(payload: string | undefined | null): string | null {
  const m = COD_RE.exec(String(payload ?? '').trim());
  return m ? m[1].toLowerCase() : null;
}

const STARE: Record<string, { ro: string; ru: string }> = {
  platita: { ro: '✅ Plătit', ru: '✅ Оплачен' },
  noua: { ro: '⏳ În așteptarea plății', ru: '⏳ Ожидает оплаты' },
  platita_fara_bilet: { ro: '⏳ Plata a sosit, biletul se emite', ru: '⏳ Оплата получена, билет оформляется' },
  anulata: { ro: 'Anulat', ru: 'Отменён' },
  returnata: { ro: 'Returnat', ru: 'Возвращён' },
  expirata: { ro: 'Plata nu a fost finalizată', ru: 'Оплата не завершена' },
  eroare_creare: { ro: 'Plata nu a putut fi pornită', ru: 'Не удалось начать оплату' },
};

function dataOra(iso: string, lang: 'ro' | 'ru'): string {
  return new Date(iso).toLocaleString(lang === 'ru' ? 'ru-RU' : 'ro-RO', {
    timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** Mesajul pentru client, pur (testat): textul și linkul paginii biletului. */
export function mesajBilet(c: {
  cod: string; status: string; lang: string | null; from_name: string; to_name: string; departure_at: string; seats: number;
}): { text: string; url: string; buton: string } {
  const lang: 'ro' | 'ru' = c.lang === 'ru' ? 'ru' : 'ro';
  const stare = STARE[c.status]?.[lang] ?? c.status;
  const text = lang === 'ru'
    ? `🎫 Билет TRANSLUX\n${c.from_name} → ${c.to_name}\n${dataOra(c.departure_at, lang)} · мест: ${c.seats}\n${stare}`
    : `🎫 Bilet TRANSLUX\n${c.from_name} → ${c.to_name}\n${dataOra(c.departure_at, lang)} · locuri: ${c.seats}\n${stare}`;
  return {
    text,
    url: `${SITE}/${lang}/bilet/${c.cod}`,
    buton: lang === 'ru' ? 'Открыть билет (QR)' : 'Deschide biletul (QR)',
  };
}

export async function handleBiletStart(ctx: BotContext, cod: string): Promise<void> {
  if (ctx.chat?.type !== 'private') return;
  try {
    const { data, error } = await getSupabase()
      .from('bilete_comenzi')
      .select('cod, status, lang, from_name, to_name, departure_at, seats')
      .eq('cod', cod)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      await ctx.reply('Biletul nu a fost găsit. Verifică linkul din pagina biletului.\nБилет не найден. Проверьте ссылку со страницы билета.');
      return;
    }
    const m = mesajBilet(data);
    await ctx.reply(m.text, { reply_markup: new InlineKeyboard().url(m.buton, m.url) });
  } catch (e) {
    // Ramura clientului nu are voie să rupă botul personalului: jurnal + răspuns scurt.
    console.error('[bilet/start]', e instanceof Error ? e.message : e);
    await ctx.reply('Nu am putut afișa biletul acum. Încearcă peste un minut.\nНе удалось показать билет. Попробуйте через минуту.').catch(() => {});
  }
}
