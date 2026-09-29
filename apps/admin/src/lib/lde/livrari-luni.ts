import { getSupabase } from '../supabase';
import { sendTelegramAlbum, sendTelegramPhoto, sendTelegramText } from '../telegram-notify';
import { LIVRARE_POSTER_CHAT_KEY } from './livrare-poster';
import { pregatestePosterSebn, SEBN_POSTER_LAST_KEY } from './sebn-optimizari-image';
import { posterBriceni, captionBriceni, BRICENI_POSTER_LAST_KEY } from './briceni-optimizari-image';
import { pregatestePosterLear } from './lear-optimizari-image';
import type { Raport } from '@/app/(dashboard)/lde/reguli/actions';

/**
 * Posterele de luni în «Livrari Uzini» ca O SINGURĂ postare (ION-139). Ion, 29.09.2026, după albumul de combustibil:
 * «fix asta faci și la livrări luni, 1 postare cu toate pozele».
 *
 * Până acum lear-saptamanal.sh chema patru rute, fiecare cu sendTelegramPhoto al ei: sebn-optimizari,
 * briceni-optimizari?send=1, lde-timp-liber (LEAR Ungheni) și lde-timp-liber?uz=floresti. Aici aceleași patru postere,
 * cu aceleași generatoare și aceleași condiții de sărire, pleacă într-un album. SEBN e primul: subtitlul lui (întrebarea
 * despre primele 3 mașini) e singurul care se vede în chat fără să deschizi poza. Fiecare poster inclus își scrie
 * marcajul de până acum, ca paznicul de luni (lde-luni-paznic) să vadă aceleași chei. Mesajele de timp liber către
 * ADMIN rămân la lde-timp-liber (chemată cu ?poster=0).
 */

export const LIVRARI_LUNI_LAST_KEY = 'livrari_luni_album_last';
const LIMITA_SUBTITLU = 1024;   // Telegram: subtitlul unei poze din album

export interface PosterLuni { id: 'sebn' | 'briceni' | 'lear' | 'floresti'; png: Buffer; caption: string; cheie: string; textDupa?: string }
export interface SaltLuni { id: string; motiv: string }

/** luni–duminică a săptămânii trecute față de azi (sau a săptămânii cerute) */
export function saptaminaLuni(azi: string, cerut?: string | null) {
  const d = new Date(`${cerut ?? azi}T12:00:00Z`);
  if (!cerut) d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  const dum = new Date(d.getTime() + 6 * 86400000);
  return { luni: d.toISOString().slice(0, 10), duminica: dum.toISOString().slice(0, 10) };
}

/** Cele patru postere, în ordinea albumului, fără să trimită nimic. */
export async function pregatestePostereLuni(luni: string, duminica: string): Promise<{ postere: PosterLuni[]; sarite: SaltLuni[] }> {
  const sb = getSupabase();
  const postere: PosterLuni[] = [], sarite: SaltLuni[] = [];

  const sebn = await pregatestePosterSebn({ saptamina: luni, pana_la: duminica });
  if ('motiv' in sebn) sarite.push({ id: 'sebn', motiv: sebn.motiv });
  else if (sebn.text.length <= LIMITA_SUBTITLU) postere.push({ id: 'sebn', png: sebn.png, caption: sebn.text, cheie: SEBN_POSTER_LAST_KEY });
  else {
    // subtitlul prea lung pentru album: titlul pe poză, întrebarea imediat după album
    const [cap, ...rest] = sebn.text.split('\n\n');
    postere.push({ id: 'sebn', png: sebn.png, caption: cap, cheie: SEBN_POSTER_LAST_KEY, textDupa: rest.join('\n\n') });
  }

  const briceni = await posterBriceni({ saptamina: luni, pana_la: duminica, trimite: false });
  if (!briceni.png) sarite.push({ id: 'briceni', motiv: briceni.motiv ?? 'fără imagine' });
  else postere.push({ id: 'briceni', png: briceni.png, caption: captionBriceni(luni, duminica), cheie: BRICENI_POSTER_LAST_KEY });

  for (const [id, uzina] of [['lear', 'LEAR Ungheni'], ['floresti', 'LEAR Florești']] as const) {
    const { data } = await sb.from('lde_analiza_reguli').select('date').eq('uzina', uzina).eq('saptamina', luni).maybeSingle();
    const d = data?.date as Pick<Raport, 'pana_la' | 'masini'> | undefined;
    if (!d) { sarite.push({ id, motiv: `raportul ${uzina} al săptămânii nu e scris` }); continue; }
    const p = await pregatestePosterLear({ saptamina: luni, pana_la: d.pana_la, masini: d.masini ?? [] }, uzina);
    if ('motiv' in p) sarite.push({ id, motiv: p.motiv });
    else postere.push({ id, png: p.png, caption: p.caption, cheie: p.cheie });
  }
  return { postere, sarite };
}

export interface TrimitereLuni { saptamina: string; status: 'sent' | 'skipped' | 'error'; trimise: string[]; sarite: SaltLuni[]; motiv?: string; messageIds?: number[] }

/** Albumul de luni în grupa livrărilor; o dată pe săptămână (app_config livrari_luni_album_last). */
export async function trimiteLivrariLuni(o: { luni: string; duminica: string; force?: boolean; dry?: boolean }): Promise<TrimitereLuni> {
  const sb = getSupabase();
  const cfg = async (key: string) => {
    const { data } = await sb.from('app_config').select('value').eq('key', key).maybeSingle();
    return ((data as { value?: string } | null)?.value ?? '').trim() || null;
  };
  const baza = { saptamina: o.luni, trimise: [] as string[], sarite: [] as SaltLuni[] };
  if (!o.force && (await cfg(LIVRARI_LUNI_LAST_KEY)) === o.luni) return { ...baza, status: 'skipped', motiv: 'deja trimis pentru săptămâna asta' };
  const chat = await cfg(LIVRARE_POSTER_CHAT_KEY);
  if (!chat) return { ...baza, status: 'skipped', motiv: 'grupa livrărilor de uzină nu e legată (app_config.livrare_poster_chat_id)' };
  const { postere, sarite } = await pregatestePostereLuni(o.luni, o.duminica);
  if (!postere.length) return { ...baza, sarite, status: 'skipped', motiv: 'niciun poster de trimis' };
  if (o.dry) return { ...baza, sarite, trimise: postere.map((p) => p.id), status: 'skipped', motiv: 'dry' };

  const fisier = (p: PosterLuni) => `${p.id}-optimizari-${o.luni}.png`;
  const r = postere.length === 1
    ? await sendTelegramPhoto(chat, postere[0].png, postere[0].caption, fisier(postere[0])).then((x) => ({ ok: x.ok, messageIds: x.messageId ? [x.messageId] : [] }))
    : await sendTelegramAlbum(chat, postere.map((p) => ({ png: p.png, caption: p.caption, filename: fisier(p) })));
  if (!r.ok) return { ...baza, sarite, status: 'error', motiv: 'Telegram n-a primit albumul' };
  for (const p of postere) if (p.textDupa) await sendTelegramText(chat, p.textDupa);
  // marcajele de până acum, pe fiecare poster inclus — le citește paznicul de luni
  const acum = new Date().toISOString();
  await sb.from('app_config').upsert([
    ...postere.map((p) => ({ key: p.cheie, value: o.luni, updated_at: acum })),
    { key: LIVRARI_LUNI_LAST_KEY, value: o.luni, updated_at: acum },
  ], { onConflict: 'key' });
  return { ...baza, sarite, trimise: postere.map((p) => p.id), status: 'sent', messageIds: r.messageIds };
}
