import type { Api } from 'grammy';
import type { CallbackQuery, InlineKeyboardMarkup, Message } from 'grammy/types';
import {
  apiBot, db, esteAdmin, esteBlogger, escapeHtml, NUME_PLATFORMA, publicareReala, tokenBot, topicDupaId, topicDupaLoc,
  type BotSocial, type Postare, type Topic,
} from './comun.js';
import { formatLoc, minuteDinOra, urmatorulLoc } from './calendar.js';
import { PLATFORME, PLATFORME_STORY, platformePosibile, type Platforma } from './uploadPost.js';
import { scrieText } from './texte.js';
import { ffmpegDisponibil } from './conversie.js';
import { IG_REELS_MAX_OCTETI, IG_STORY_MAX_OCTETI } from './uploadPost.js';
import { sendAdminAlert } from '../services/adminAlert.js';

// Ce se întâmplă în topicuri (plan 09.10, «Publicarea video» p. 1–6). Aceeași logică pentru ambii boți: botul
// Translux o cheamă din grammY, botul TLX prin releu (POST /social/v1/tlx). Mesajele care nu țin de un topic legat
// trec mai departe neatinse (false).

/** TikTok primește prin API clipuri de cel mult 10 minute (plan, «Limite»). */
export const DURATA_MAX_TIKTOK_S = 600;
/** Story-ul are cel mult 60 s (Instagram); tăierea în bucăți e o etapă viitoare. */
export const DURATA_MAX_STORY_S = 60;
export const MARIME_MAX = 2_000 * 1024 * 1024;
const STARI_OCUPATE = ['planificat', 'se_publica', 'trimis', 'publicat', 'proba'];

type Raspuns = (text: string, extra?: { butoane?: InlineKeyboardMarkup }) => Promise<Message | null>;

function raspunde(api: Api, msg: Message): Raspuns {
  return (text, extra) => api.sendMessage(msg.chat.id, text, {
    parse_mode: 'HTML',
    message_thread_id: msg.message_thread_id,
    reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true },
    reply_markup: extra?.butoane,
    link_preview_options: { is_disabled: true },
  }).catch((err) => { console.error('social raspuns:', err?.message ?? err); return null; });
}

/** «/lega_social@Bot a b» → { cmd: 'lega_social', arg: 'a b' }. */
export function comanda(text: string | undefined): { cmd: string; arg: string } | null {
  const m = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec((text ?? '').trim());
  return m ? { cmd: m[1].toLowerCase(), arg: (m[2] ?? '').trim() } : null;
}

const COMENZI = new Set(['lega_social', 'social', 'social_descriere', 'social_ore', 'social_hashtag', 'social_comentariu', 'social_pagina', 'social_oprit', 'social_porneste', 'blogger', 'blogger_scoate']);

/** Platformele din «tiktok,facebook» (sau «tiktok facebook instagram»). Pur, testat. */
export function parseazaPlatforme(s: string): Platforma[] | null {
  if (!s.trim()) return ['tiktok'];
  const p = s.toLowerCase().split(/[\s,;+]+/).filter(Boolean);
  if (!p.every((x) => (PLATFORME as readonly string[]).includes(x))) return null;
  return [...new Set(p)] as Platforma[];
}

/** Caption-ul bloggerului → tipul și nota (fără #story). Pur, testat. */
export function citesteCaption(caption: string | undefined): { tip: 'video' | 'story'; nota: string | null } {
  const c = caption ?? '';
  const story = /(^|\s)#story\b/i.test(c);
  const nota = c.replace(/(^|\s)#story\b/gi, ' ').replace(/\s+\n/g, '\n').trim();
  return { tip: story ? 'story' : 'video', nota: nota || null };
}

function numeTopicDinMesaj(msg: Message): string | null {
  const r = msg.reply_to_message as (Message & { forum_topic_created?: { name: string } }) | undefined;
  return r?.forum_topic_created?.name ?? null;
}

export function platformePostare(topic: Topic, tip: 'video' | 'story'): Platforma[] {
  return tip === 'story' ? topic.platforme.filter((p) => PLATFORME_STORY.includes(p)) : topic.platforme;
}

export function butoane(postId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[
      { text: '✖ Anulează', callback_data: `soc:a:${postId}` },
      { text: '⏭ Mută mai târziu', callback_data: `soc:u:${postId}` },
      { text: '▶ Acum', callback_data: `soc:n:${postId}` },
    ]],
  };
}

export function textConfirmare(p: Pick<Postare, 'tip' | 'planificat_la' | 'text_final' | 'text_ai' | 'platforme' | 'in_proba' | 'file_size'>, topic?: Topic): string {
  const unde = p.platforme.map((x) => NUME_PLATFORMA[x]).join(', ');
  // Platformele contului pe care clipul nu poate pleca (Instagram peste 300 MB / 100 MB la story) — spuse explicit.
  const conversie = ffmpegDisponibil();
  const sarite = topic ? platformePosibile(platformePostare(topic, p.tip), p.tip, p.file_size ?? 0, conversie).sarite : [];
  const limitaIg = p.tip === 'story' ? IG_STORY_MAX_OCTETI : IG_REELS_MAX_OCTETI;
  const micsorat = conversie && p.platforme.includes('instagram') && (p.file_size ?? 0) > limitaIg;
  return [
    `🗓 <b>${p.tip === 'story' ? 'Story planificat' : 'Planificat'}:</b> ${formatLoc(new Date(p.planificat_la))} · ${unde}`,
    ...sarite.map((x) => `⚠️ ${NUME_PLATFORMA[x.platforma]} se sare: ${escapeHtml(x.motiv)}.`),
    micsorat ? `ℹ️ Clipul are ${Math.round((p.file_size ?? 0) / 1048576)} MB: la ora publicării se micșorează sub ${Math.round(limitaIg / 1048576)} MB pentru Instagram (1080p, H.264); același fișier pleacă peste tot.` : null,
    p.in_proba ? '🧪 <i>Probă: clipul NU se publică (a intrat înainte de cheile Upload-Post și Telegram API). Postați-l din nou după ce sunt puse.</i>' : null,
    '',
    p.text_ai ? '<b>Textul (scris de AI):</b>' : '<b>Textul:</b>',
    escapeHtml(p.text_final),
    '',
    '<i>Până la ora publicării, un admin poate anula sau muta clipul.</i>',
  ].filter((x) => x !== null).join('\n');
}

async function ocupate(topicId: string, tip: 'video' | 'story', faraId?: string): Promise<Date[]> {
  const deLa = new Date(Date.now() - 2 * 86_400_000).toISOString();
  let q = db().from('social_posts').select('id, planificat_la').eq('topic_id', topicId).eq('tip', tip)
    .in('stare', STARI_OCUPATE).gte('planificat_la', deLa);
  if (faraId) q = q.neq('id', faraId);
  const { data } = await q;
  return (data ?? []).map((r) => new Date(r.planificat_la as string));
}

/** Clipurile aceluiași topic se primesc pe rând: două clipuri trimise odată nu iau același loc. */
const coziTopic = new Map<string, Promise<unknown>>();
function peRand<T>(cheie: string, f: () => Promise<T>): Promise<T> {
  const p = (coziTopic.get(cheie) ?? Promise.resolve()).then(f, f);
  coziTopic.set(cheie, p.catch(() => {}));
  return p;
}

async function miniatura(bot: BotSocial, api: Api, fileId: string | undefined): Promise<{ base64: string; mime: 'image/jpeg' } | null> {
  const token = tokenBot(bot);
  if (!fileId || !token) return null;
  try {
    const f = await api.getFile(fileId);
    if (!f.file_path) return null;
    const r = await fetch(`https://api.telegram.org/file/bot${token}/${f.file_path}`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    return { base64: Buffer.from(await r.arrayBuffer()).toString('base64'), mime: 'image/jpeg' };
  } catch {
    return null;
  }
}

// ── Comenzile adminilor, scrise în topic ────────────────────────────────────

async function trateazaComanda(bot: BotSocial, api: Api, msg: Message, cmd: string, arg: string): Promise<boolean> {
  if (!COMENZI.has(cmd)) return false;
  const r = raspunde(api, msg);
  if (!(await esteAdmin(msg.from?.id))) {
    await r('Doar administratorii pot configura publicarea clipurilor.');
    return true;
  }
  const thread = msg.is_topic_message ? msg.message_thread_id : undefined;
  if (msg.chat.type !== 'supergroup' || !thread) {
    await r('Comanda se scrie în topicul contului (supergrup cu Topics), nu în chatul general.');
    return true;
  }
  const topic = await topicDupaLoc(msg.chat.id, thread);
  if (topic && topic.bot !== bot) {
    await r('Topicul e legat de celălalt bot; comenzile se dau acolo.');
    return true;
  }

  if (cmd === 'lega_social') {
    const [profil, ...rest] = arg.split(/\s+/).filter(Boolean);
    const platforme = parseazaPlatforme(rest.join(' '));
    if (!profil || !platforme) {
      await r('Scrieți: <code>/lega_social &lt;profilul din Upload-Post&gt; tiktok,facebook,instagram</code>\n'
        + 'Exemplu: <code>/lega_social tlx1 tiktok,facebook,instagram</code>. Fără platforme = doar TikTok.');
      return true;
    }
    const nume = numeTopicDinMesaj(msg) ?? topic?.nume ?? profil;
    // Decalajul: fiecare topic nou încă 20 de minute (0, 20, 40 … 100), ca TikTok să nu vadă clipurile în același minut.
    let decalaj = topic?.decalaj_min;
    if (decalaj === undefined) {
      const { count } = await db().from('social_topics').select('id', { count: 'exact', head: true });
      decalaj = ((count ?? 0) * 20) % 120;
    }
    const { error } = await db().from('social_topics').upsert({
      bot, chat_id: msg.chat.id, thread_id: thread, nume, upload_post_user: profil, platforme, decalaj_min: decalaj,
      activ: true, updated_at: new Date().toISOString(),
    }, { onConflict: 'chat_id,thread_id' });
    if (error) { console.error('social lega:', error.message); await r('Nu am putut lega topicul. Încercați din nou peste un minut.'); return true; }
    await r(`✓ Topicul «${escapeHtml(nume)}» e legat de profilul Upload-Post <b>${escapeHtml(profil)}</b>: `
      + `${platforme.map((p) => NUME_PLATFORMA[p]).join(', ')}.\n`
      + `Ore: ${(topic?.ore ?? ['12:30', '19:30']).join(', ')} (+${decalaj} min), cel mult ${topic?.max_pe_zi ?? 1} clip pe zi.\n\n`
      + 'Mai departe:\n• <code>/blogger</code> ca răspuns la un mesaj al bloggerului — îl pune pe lista albă\n'
      + '• <code>/social_descriere …</code> — despre cont, pentru textele AI\n'
      + '• <code>/social_ore 12:30,19:30 2</code> — orele și câte clipuri pe zi\n'
      + '• <code>/social_hashtag #translux #moldova</code>\n• <code>/social_comentariu …</code> — primul comentariu sub clipuri\n'
      + '• <code>/social</code> — starea și coada');
    return true;
  }

  if (!topic) {
    await r('Topicul nu e legat încă. Întâi: <code>/lega_social &lt;profil Upload-Post&gt; tiktok,facebook,instagram</code>');
    return true;
  }

  const actualizeaza = async (camp: Record<string, unknown>, ok: string) => {
    const { error } = await db().from('social_topics').update({ ...camp, updated_at: new Date().toISOString() }).eq('id', topic.id);
    if (error) console.error('social salvare:', error.message);
    await r(error ? 'Nu am putut salva. Încercați din nou peste un minut.' : ok);
  };

  switch (cmd) {
    case 'social_descriere':
      if (!arg) { await r(`Descrierea de acum: ${escapeHtml(topic.descriere ?? '(cea implicită a brandului)')}`); return true; }
      await actualizeaza({ descriere: arg.slice(0, 1_000) }, '✓ Descrierea contului e salvată; o folosesc la textele următoarelor clipuri.');
      return true;
    case 'social_ore': {
      const [oreS, maxS] = arg.split(/\s+/);
      const ore = (oreS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      const max = maxS ? Number(maxS) : topic.max_pe_zi;
      if (!ore.length || ore.some((o) => minuteDinOra(o) === null) || !Number.isInteger(max) || max < 1 || max > 10) {
        await r('Scrieți: <code>/social_ore 12:30,19:30 2</code> — orele (ora Chișinăului) și câte clipuri pe zi (1–10).');
        return true;
      }
      await actualizeaza({ ore, max_pe_zi: max }, `✓ Ore: ${ore.join(', ')} (+${topic.decalaj_min} min), cel mult ${max} pe zi. Clipurile deja planificate rămân la ora lor.`);
      return true;
    }
    case 'social_hashtag': {
      const tags = arg.split(/\s+/).filter(Boolean).map((h) => h.replace(/^#*/, '#')).filter((h) => h.length > 1).slice(0, 10);
      await actualizeaza({ hashtags: tags }, tags.length ? `✓ Hashtag-uri: ${escapeHtml(tags.join(' '))}` : '✓ Hashtag-urile contului au fost scoase.');
      return true;
    }
    case 'social_comentariu':
      await actualizeaza({ primul_comentariu: arg && arg !== '-' ? arg.slice(0, 500) : null },
        arg && arg !== '-' ? '✓ Primul comentariu sub clipuri e salvat.' : '✓ Fără prim comentariu.');
      return true;
    case 'social_pagina': {
      // C3: profilul cu mai multe pagini Facebook cere id-ul paginii la fiecare publicare (docs upload-video, «Facebook»).
      const id = arg === '-' ? null : arg;
      if (id !== null && !/^\d{5,20}$/.test(id)) {
        await r('Scrieți: <code>/social_pagina &lt;id-ul paginii Facebook&gt;</code> (doar cifre; din Upload-Post → Facebook pages), sau <code>/social_pagina -</code>.');
        return true;
      }
      await actualizeaza({ facebook_page_id: id }, id ? `✓ Pagina Facebook ${id} pentru clipurile următoare.` : '✓ Fără pagină fixată: Upload-Post o folosește pe singura conectată.');
      return true;
    }
    // C10: două comenzi explicite, nu un comutator — aceeași comandă primită de două ori (releul o retrimite când
    // răspunsul se pierde) lasă topicul în aceeași stare.
    case 'social_oprit':
      await actualizeaza({ activ: false },
        '⏸ Topicul e oprit: clipurile noi nu se mai primesc, iar cele planificate nu pleacă cât e oprit (la ora lor se anulează). Pornire: /social_porneste');
      return true;
    case 'social_porneste':
      await actualizeaza({ activ: true }, '▶ Topicul e pornit.');
      return true;
    case 'blogger':
    case 'blogger_scoate': {
      const tinta = msg.reply_to_message && !(msg.reply_to_message as { forum_topic_created?: unknown }).forum_topic_created
        ? msg.reply_to_message.from : undefined;
      if (!tinta || tinta.is_bot) {
        await r(`Scrieți <code>/${cmd}</code> ca <b>răspuns</b> la un mesaj al bloggerului din acest topic.`);
        return true;
      }
      const nume = [tinta.first_name, tinta.last_name].filter(Boolean).join(' ') + (tinta.username ? ` (@${tinta.username})` : '');
      if (cmd === 'blogger') {
        const { error } = await db().from('social_bloggers').upsert({ topic_id: topic.id, telegram_id: tinta.id, nume, adaugat_de: msg.from?.id ?? null }, { onConflict: 'topic_id,telegram_id' });
        if (error) console.error('social blogger:', error.message);
        await r(error ? 'Nu am putut salva. Încercați din nou peste un minut.' : `✓ ${escapeHtml(nume)} poate posta clipuri în «${escapeHtml(topic.nume)}». Clipurile lui pleacă singure, fără aprobare.`);
      } else {
        // C11: confirmarea către admin doar dacă ștergerea chiar a mers.
        const { error } = await db().from('social_bloggers').delete().eq('topic_id', topic.id).eq('telegram_id', tinta.id);
        if (error) {
          console.error('social blogger_scoate:', error.message);
          await r(`❌ ${escapeHtml(nume)} NU a fost scos de pe listă (eroare la bază). Încercați din nou peste un minut.`);
          return true;
        }
        await r(`✓ ${escapeHtml(nume)} nu mai e pe lista topicului. Clipurile lui deja planificate nu mai pleacă (la ora lor se anulează).`);
      }
      return true;
    }
    case 'social': {
      const [{ data: bloggeri }, { data: coada }] = await Promise.all([
        db().from('social_bloggers').select('nume').eq('topic_id', topic.id),
        db().from('social_posts').select('tip, planificat_la, stare').eq('topic_id', topic.id).in('stare', ['planificat', 'se_publica', 'trimis'])
          .order('planificat_la').limit(10),
      ]);
      await r([
        `<b>${escapeHtml(topic.nume)}</b> · profil ${escapeHtml(topic.upload_post_user)} · ${topic.platforme.map((p) => NUME_PLATFORMA[p]).join(', ')}${topic.activ ? '' : ' · ⏸ oprit'}`,
        `Ore: ${topic.ore.join(', ')} (+${topic.decalaj_min} min), cel mult ${topic.max_pe_zi} pe zi`,
        `Bloggeri: ${(bloggeri ?? []).map((b) => escapeHtml(String(b.nume ?? '?'))).join(', ') || 'niciunul'}`,
        `Publicare: ${publicareReala(topic.bot) ? 'reală' : '🧪 în probă (lipsesc cheile)'}`,
        '',
        coada?.length ? '<b>Coada:</b>\n' + coada.map((c) => `• ${formatLoc(new Date(c.planificat_la as string))} — ${c.tip === 'story' ? 'story' : 'clip'}${c.stare !== 'planificat' ? ' (se publică)' : ''}`).join('\n') : 'Coada e goală.',
      ].join('\n'));
      return true;
    }
  }
  return false;
}

// ── Clipul de la blogger ─────────────────────────────────────────────────────

export async function primesteClip(bot: BotSocial, api: Api, msg: Message, topic: Topic): Promise<void> {
  const r = raspunde(api, msg);
  const autor = msg.from;
  if (!autor) return;
  if (!topic.activ) { await r('⏸ Topicul e oprit: clipul nu intră în calendar.'); return; }
  if (!(await esteBlogger(topic.id, autor.id)) && !(await esteAdmin(autor.id))) {
    await r('Clipul nu intră în calendar: doar bloggerii de pe lista acestui topic pot posta. Un admin vă adaugă cu /blogger.');
    return;
  }
  const v = msg.video ?? msg.document;
  if (!v) return;
  const durata = msg.video?.duration ?? null;
  const citit = citesteCaption(msg.caption);
  const tip = citit.tip;
  // SEC-4: un clip trimis mai departe (forward) are caption-ul altcuiva — nu intră ca notă pentru AI.
  const nota = msg.forward_origin ? null : citit.nota;
  const cerute = platformePostare(topic, tip);
  if (!cerute.length) { await r('Story-urile pleacă doar pe Facebook și Instagram, iar acest cont n-are niciuna. Postați clipul fără #story.'); return; }
  const { platforme, sarite } = platformePosibile(cerute, tip, v.file_size ?? 0, ffmpegDisponibil());
  if (!platforme.length) {
    await r(`Clipul nu poate pleca pe niciun cont: ${sarite.map((x) => escapeHtml(x.motiv)).join('; ')}. Exportați-l mai mic (1080p).`);
    return;
  }
  // Mărimea e amprenta clipului la ora publicării (descarcare.ts, SEC-2): fără ea nu intră în calendar.
  if (!v.file_size) { await r('Nu văd mărimea clipului. Trimiteți-l din nou ca fișier (agrafă → Fișier).'); return; }
  if (v.file_size > MARIME_MAX) { await r('Clipul are peste 2 GB: Telegram nu-l dă botului. Exportați-l mai mic (1080p).'); return; }
  if (tip === 'story' && durata !== null && durata > DURATA_MAX_STORY_S) {
    await r(`Story-ul poate avea cel mult ${DURATA_MAX_STORY_S} s, clipul are ${durata} s. Tăiați-l sau postați-l fără #story, ca clip obișnuit.`);
    return;
  }
  if (tip === 'video' && platforme.includes('tiktok') && durata !== null && durata > DURATA_MAX_TIKTOK_S) {
    await r(`TikTok primește prin API clipuri de cel mult ${DURATA_MAX_TIKTOK_S / 60} minute, clipul are ${Math.round(durata / 60)} min.`);
    return;
  }

  await peRand(topic.id, async () => {
    const { data: dublura } = await db().from('social_posts').select('id, planificat_la, stare, trimis_posibil').eq('topic_id', topic.id)
      .eq('file_unique_id', v.file_unique_id).eq('tip', tip).maybeSingle();
    // «neconfirmat» în bază = primirea de dinainte a murit la mijloc (coada topicului e pe rând în proces): se reia.
    if (dublura && !['esuat', 'anulat', 'proba', 'neconfirmat'].includes(dublura.stare as string)) {
      await r(`Clipul acesta e deja în calendar (${formatLoc(new Date(dublura.planificat_la as string))}, ${dublura.stare}).`);
      return;
    }
    const loc = urmatorulLoc({ ore: topic.ore, decalajMin: topic.decalaj_min, maxPeZi: tip === 'story' ? Math.max(3, topic.max_pe_zi) : topic.max_pe_zi },
      await ocupate(topic.id, tip), new Date());
    if (!loc) { await r('Nu găsesc loc în calendar în următoarele 90 de zile. Verificați orele cu /social.'); return; }
    await api.sendChatAction(msg.chat.id, 'typing', { message_thread_id: msg.message_thread_id }).catch(() => {});
    const thumb = msg.video?.thumbnail?.file_id ?? msg.document?.thumbnail?.file_id;
    const { text, ai } = await scrieText({
      bot, numeCont: topic.nume, descriere: topic.descriere, hashtags: topic.hashtags, notaAutor: nota, tip,
      miniatura: await miniatura(bot, api, thumb),
    });
    const rand = {
      topic_id: topic.id, tip, chat_id: msg.chat.id, thread_id: msg.message_thread_id, message_id: msg.message_id,
      file_unique_id: v.file_unique_id, file_size: v.file_size, durata_s: durata, mime: v.mime_type ?? null,
      autor_telegram_id: autor.id, autor_nume: [autor.first_name, autor.last_name].filter(Boolean).join(' '),
      nota_autor: nota, text_final: text, text_ai: ai, planificat_la: loc.toISOString(),
      // Destinația și modul se fixează acum (migr. 545): relegarea topicului sau cheile puse mai târziu nu le schimbă.
      upload_post_user: topic.upload_post_user, platforme, facebook_page_id: platforme.includes('facebook') ? topic.facebook_page_id : null,
      in_proba: !publicareReala(bot),
      // C8: «neconfirmat» = nepublicabil până când mesajul cu butoane a ajuns și e salvat (mai jos).
      stare: 'neconfirmat', incercari: 0, luat_la: null, upload_request_id: null, rezultate: null, eroare: null,
      mesaj_confirmare_id: null, anulat_de: null, publicat_la: null, updated_at: new Date().toISOString(),
    };
    // Repostarea aceluiași clip: dacă trimiterea de dinainte e INCERTĂ (a plecat spre Upload-Post fără confirmare),
    // rândul se refolosește — același id = aceeași cheie de idempotență, deci un clip care de fapt plecase nu se
    // publică a doua oară (BL-4). Altfel (anulat, probă, eșec raportat sigur de Upload-Post) rândul vechi se șterge și
    // clipul primește id nou = cheie nouă, ca Upload-Post să nu întoarcă jobul vechi eșuat (runda 2, BL2-1).
    // C7: `trimis_posibil` nu se atinge la refolosire — rămâne pus până îl lămurește Upload-Post.
    const incert = Boolean(dublura?.trimis_posibil);
    if (dublura && !incert) await db().from('social_posts').delete().eq('id', dublura.id);
    const { data: post, error } = dublura && incert
      ? await db().from('social_posts').update(rand).eq('id', dublura.id).select('*').single()
      : await db().from('social_posts').insert(rand).select('*').single();
    if (error || !post) {
      console.error('social clip:', error?.message);
      await r('Nu am putut pune clipul în calendar. Trimiteți-l din nou peste un minut.');
      return;
    }
    const id = (post as Postare).id;
    const conf = await r(textConfirmare(post as Postare, topic), { butoane: butoane(id) });
    // C5 / C8: fără mesajul cu butoane adminul n-ar avea cum anula — rândul rămâne «neconfirmat» (nepublicabil);
    // publicatorul îl închide ca «anulat» după 10 minute, iar bloggerul poate retrimite clipul.
    if (!conf) {
      await db().from('social_posts').update({ stare: 'anulat', eroare: 'confirmarea din topic nu a ajuns' }).eq('id', id).eq('stare', 'neconfirmat');
      return;
    }
    const { data: confirmat, error: eConf } = await db().from('social_posts')
      .update({ stare: 'planificat', mesaj_confirmare_id: conf.message_id, updated_at: new Date().toISOString() })
      .eq('id', id).eq('stare', 'neconfirmat').select('id');
    if (eConf || !confirmat?.length) {
      if (eConf) console.error('social confirmare:', eConf.message);
      // R3-3: dacă UPDATE-ul a trecut totuși (răspunsul s-a pierdut), rândul nu rămâne publicabil fără butoane.
      let anulat = false;
      for (let i = 0; i < 3 && !anulat; i++) {
        const { error: eAn } = await db().from('social_posts').update({ stare: 'anulat', eroare: 'confirmarea nu s-a salvat' })
          .eq('id', id).in('stare', ['neconfirmat', 'planificat']);
        if (!eAn) anulat = true;
      }
      // Runda 3 Codex, C13: «NU a intrat» doar când baza a confirmat anularea; altfel starea e incertă — butoanele
      // rămân, iar mesajul spune exact asta.
      if (anulat) {
        await api.editMessageText(msg.chat.id, conf.message_id,
          '❌ Clipul NU a intrat în calendar (nu am putut salva confirmarea). Trimiteți-l din nou peste un minut.').catch(() => {});
      } else {
        await r('⚠️ Nu pot confirma acum dacă clipul e în calendar (baza nu răspunde). Butoanele de mai sus rămân valabile: '
          + 'un admin poate apăsa «Anulează»; verificați cu /social peste câteva minute.');
        await sendAdminAlert(`⚠️ <b>Clip cu stare incertă</b> · ${escapeHtml(topic.nume)} — confirmarea și anularea n-au putut fi salvate (postarea ${id}).`);
      }
    }
  });
}

function esteClip(msg: Message): boolean {
  if (msg.video) return true;
  return Boolean(msg.document?.mime_type?.startsWith('video/'));
}

/** Un mesaj din grup. true = era al nostru (comandă socială sau clip într-un topic legat). */
export async function trateazaMesajSocial(bot: BotSocial, msg: Message): Promise<boolean> {
  const api = apiBot(bot);
  if (!api || msg.chat.type !== 'supergroup') return false;
  const c = comanda(msg.text);
  if (c) return trateazaComanda(bot, api, msg, c.cmd, c.arg);
  if (!esteClip(msg) || !msg.is_topic_message || !msg.message_thread_id) return false;
  const topic = await topicDupaLoc(msg.chat.id, msg.message_thread_id);
  if (!topic || topic.bot !== bot) return false;
  // BL-3: botul Translux primește actualizările pe rând (polling); miniatura + AI durează până la ~1 min, deci
  // clipul se lucrează în fundal, pe coada topicului, iar botul trece imediat la următorul mesaj.
  void primesteClip(bot, api, msg, topic).catch((err) => console.error('social clip:', err));
  return true;
}

// ── Butoanele de sub confirmare ──────────────────────────────────────────────

/** Apăsarea unui buton «soc:…». true = era al nostru. */
export async function trateazaCallbackSocial(bot: BotSocial, cq: CallbackQuery): Promise<boolean> {
  const m = /^soc:([aun]):([0-9a-f-]{36})$/.exec(cq.data ?? '');
  const api = apiBot(bot);
  if (!m || !api) return false;
  const raspunsButon = (text: string, alert = false) => api.answerCallbackQuery(cq.id, { text, show_alert: alert }).catch(() => {});
  if (!(await esteAdmin(cq.from.id))) { await raspunsButon('Doar un admin poate anula sau muta clipul.', true); return true; }
  const { data: post } = await db().from('social_posts').select('*').eq('id', m[2]).maybeSingle();
  const p = post as Postare | null;
  const topic = p ? await topicDupaId(p.topic_id) : null;
  if (!p || !topic) { await raspunsButon('Clipul nu mai e în calendar.', true); return true; }
  if (p.stare !== 'planificat') { await raspunsButon(`Prea târziu: clipul e deja ${p.stare === 'anulat' ? 'anulat' : 'în publicare sau publicat'}.`, true); return true; }
  const msgId = cq.message?.message_id;
  const editeaza = async (text: string, cuButoane: boolean) => {
    if (!msgId) return;
    await api.editMessageText(p.chat_id, msgId, text, {
      parse_mode: 'HTML', reply_markup: cuButoane ? butoane(p.id) : undefined, link_preview_options: { is_disabled: true },
    }).catch((err) => console.error('social edit:', err?.message ?? err));
  };
  const cine = [cq.from.first_name, cq.from.last_name].filter(Boolean).join(' ');

  if (m[1] === 'a') {
    const { data } = await db().from('social_posts').update({ stare: 'anulat', anulat_de: cq.from.id, updated_at: new Date().toISOString() })
      .eq('id', p.id).eq('stare', 'planificat').select('id');
    if (!data?.length) { await raspunsButon('Prea târziu: clipul a intrat în publicare.', true); return true; }
    await editeaza(`✖ <b>Anulat</b> de ${escapeHtml(cine)}. Clipul nu se publică.\n\n${escapeHtml(p.text_final)}`, false);
    await raspunsButon('Anulat.');
    return true;
  }

  // Locul se alege și se scrie în aceeași rundă a cozii topicului: un clip nou nu poate lua același loc între timp.
  const mutare = await peRand(topic.id, async () => {
    const loc = m[1] === 'n' ? new Date(Date.now() + 60_000) : urmatorulLoc(
      { ore: topic.ore, decalajMin: topic.decalaj_min, maxPeZi: p.tip === 'story' ? Math.max(3, topic.max_pe_zi) : topic.max_pe_zi },
      await ocupate(topic.id, p.tip, p.id), new Date(), new Date(new Date(p.planificat_la).getTime() + 60_000));
    if (!loc) return { nou: null, data: null };
    const { data } = await db().from('social_posts').update({ planificat_la: loc.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', p.id).eq('stare', 'planificat').select('*');
    return { nou: loc, data };
  });
  const { nou, data } = mutare;
  if (!nou) { await raspunsButon('Nu găsesc alt loc liber în calendar.', true); return true; }
  if (!data?.length) { await raspunsButon('Prea târziu: clipul a intrat în publicare.', true); return true; }
  await editeaza(textConfirmare(data[0] as Postare, topic) + `\n<i>Mutat de ${escapeHtml(cine)}.</i>`, m[1] !== 'n');
  await raspunsButon(m[1] === 'n' ? 'Pleacă în cel mult două minute.' : `Mutat: ${formatLoc(nou)}`);
  return true;
}
