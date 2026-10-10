import { openAsBlob } from 'node:fs';
import { apiBot, db, escapeHtml, NUME_PLATFORMA, publicareReala, tokenBot, topicDupaId, type Postare, type Topic } from './comun.js';
import { ClipSchimbat, descarcaClip, stergeTemporar } from './descarcare.js';
import { publica, stareaPublicarii, EroareUploadPost, type RezultatPlatforma } from './uploadPost.js';
import { platformePostare } from './primire.js';
import { sendAdminAlert } from '../services/adminAlert.js';

// Publicatorul (plan 09.10, «Publicarea video» p. 7–8): la fiecare minut ia clipurile ajunse la oră, le descarcă din
// Telegram, le trimite la Upload-Post și urmărește rezultatul. Stările stau în bază: repornirea botului nu pierde și
// nu dublează nimic (Upload-Post primește id-ul postării ca cheie de idempotență).

const PE_TREAPTA = 2;
const INCERCARI_MAX = 3;
/** Cât poate sta o postare «se_publica» (descărcare + trimitere) până o considerăm blocată de o repornire. */
const BLOCAT_DUPA_MS = 45 * 60_000;
const NEGASIT_DUPA_MS = 2 * 60 * 60_000;
const IN_LUCRU_MAX_MS = 6 * 60 * 60_000;

async function anuntaInTopic(p: Postare, topic: Topic, text: string): Promise<void> {
  const api = apiBot(topic.bot);
  if (!api) return;
  await api.sendMessage(p.chat_id, text, {
    parse_mode: 'HTML',
    message_thread_id: p.thread_id,
    reply_parameters: { message_id: p.message_id, allow_sending_without_reply: true },
    link_preview_options: { is_disabled: true },
  }).catch((err) => console.error('social anunt:', err?.message ?? err));
}

async function scoateButoanele(p: Postare, topic: Topic): Promise<void> {
  const api = apiBot(topic.bot);
  if (api && p.mesaj_confirmare_id) await api.editMessageReplyMarkup(p.chat_id, p.mesaj_confirmare_id).catch(() => {});
}

async function seteaza(id: string, camp: Record<string, unknown>): Promise<void> {
  const { error } = await db().from('social_posts').update({ ...camp, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) console.error('social_posts update:', error.message);
}

/** Starea «trimis» TREBUIE să rămână scrisă: altfel deblocarea ar retrimite clipul. Trei încercări, apoi aruncă. */
async function seteazaSigur(id: string, camp: Record<string, unknown>): Promise<void> {
  let ultima = '';
  for (let i = 0; i < 3; i++) {
    const { error } = await db().from('social_posts').update({ ...camp, updated_at: new Date().toISOString() }).eq('id', id);
    if (!error) return;
    ultima = error.message;
    await new Promise((r) => setTimeout(r, 2_000 * (i + 1)));
  }
  throw new Error(`nu pot scrie starea postării ${id}: ${ultima}`);
}

export function textRezultat(rez: RezultatPlatforma[]): string {
  return rez.filter((x) => !x.sarit).map((x) => {
    const nume = NUME_PLATFORMA[x.platforma] ?? x.platforma;
    if (x.inCiorne) return `⚠️ ${nume}: clipul e în ciornele TikTok — apăsați «Postează» în aplicație`;
    if (x.reusit) return x.url ? `✅ <a href="${escapeHtml(x.url)}">${nume}</a>` : `✅ ${nume}`;
    return `❌ ${nume}: ${escapeHtml(x.mesaj ?? 'eroare')}`;
  }).join('\n');
}

/** Postările «se_publica» rămase de la o repornire → înapoi în calendar (sau eșuate după 3 încercări). */
async function deblocheaza(): Promise<void> {
  const prag = new Date(Date.now() - BLOCAT_DUPA_MS).toISOString();
  const { data } = await db().from('social_posts').select('id, incercari').eq('stare', 'se_publica').lt('luat_la', prag);
  for (const r of data ?? []) {
    await seteaza(r.id as string, (r.incercari as number) >= INCERCARI_MAX
      ? { stare: 'esuat', eroare: 'blocat la descărcare sau trimitere de 3 ori' }
      : { stare: 'planificat' });
  }
}

async function publicaUna(p: Postare): Promise<void> {
  const topic = await topicDupaId(p.topic_id);
  if (!topic) { await seteaza(p.id, { stare: 'esuat', eroare: 'topicul nu mai există' }); return; }
  const platforme = platformePostare(topic, p.tip);

  if (!publicareReala()) {
    await seteaza(p.id, { stare: 'proba', publicat_la: new Date().toISOString() });
    await scoateButoanele(p, topic);
    await anuntaInTopic(p, topic, `🧪 <b>Probă:</b> acum clipul ar fi plecat pe ${platforme.map((x) => NUME_PLATFORMA[x]).join(', ')} `
      + `(profilul ${escapeHtml(topic.upload_post_user)}). Publicarea reală pornește după ce sunt puse cheile Upload-Post și Telegram API.`);
    return;
  }

  const token = tokenBot(topic.bot);
  let cale: string | null = null;
  try {
    if (!token) throw new EroareUploadPost(`lipsește tokenul botului ${topic.bot}`, 0, true);
    cale = await descarcaClip(token, p.chat_id, p.message_id, p.id, p.file_size);
    const video = await openAsBlob(cale, { type: 'video/mp4' });
    const requestId = await publica(process.env.UPLOAD_POST_API_KEY!, {
      user: topic.upload_post_user, platforme, tip: p.tip, text: p.text_final,
      facebookPageId: topic.facebook_page_id, primulComentariu: topic.primul_comentariu, idPostare: p.id,
    }, video, `${p.id}.mp4`);
    // Din acest punct clipul e la Upload-Post: butoanele dispar abia acum.
    await seteazaSigur(p.id, { stare: 'trimis', upload_request_id: requestId, eroare: null });
    await scoateButoanele(p, topic);
  } catch (err) {
    const mesaj = (err as Error)?.message ?? String(err);
    // Retrimiterea e sigură: Upload-Post întoarce cererea existentă pentru același Idempotency-Key (id-ul postării).
    const definitiv = (err instanceof EroareUploadPost && err.definitiva) || err instanceof ClipSchimbat;
    if (definitiv || p.incercari >= INCERCARI_MAX) {
      await seteaza(p.id, { stare: 'esuat', eroare: mesaj });
      await scoateButoanele(p, topic);
      await anuntaInTopic(p, topic, `❌ Clipul nu s-a publicat: ${escapeHtml(mesaj)}`);
      await sendAdminAlert(`❌ <b>Clip nepublicat</b> · ${escapeHtml(topic.nume)}\n${escapeHtml(mesaj)}`);
    } else {
      // Eroare trecătoare (rețea, Telegram, 429/5xx): încă o încercare peste 15 minute.
      await seteaza(p.id, { stare: 'planificat', eroare: mesaj, planificat_la: new Date(Date.now() + 15 * 60_000).toISOString() });
    }
  } finally {
    await stergeTemporar(cale);
  }
}

async function verificaTrimise(): Promise<void> {
  const cheie = process.env.UPLOAD_POST_API_KEY;
  if (!cheie) return;
  const { data } = await db().from('social_posts').select('*').eq('stare', 'trimis').order('luat_la').limit(20);
  for (const p of (data ?? []) as Postare[]) {
    const topic = await topicDupaId(p.topic_id);
    if (!topic || !p.upload_request_id) continue;
    const varsta = Date.now() - new Date(p.luat_la ?? p.planificat_la).getTime();
    let st;
    try { st = await stareaPublicarii(cheie, p.upload_request_id); } catch (err) { console.error('social status:', (err as Error).message); continue; }
    if (st.stare === 'gata') {
      await seteaza(p.id, { stare: 'publicat', rezultate: st.brut, publicat_la: new Date().toISOString() });
      await anuntaInTopic(p, topic, `📣 <b>Publicat</b>\n${textRezultat(st.rezultate) || 'pe toate conturile'}`);
      if (st.rezultate.some((x) => !x.reusit && !x.sarit)) {
        await sendAdminAlert(`⚠️ <b>Clip publicat parțial</b> · ${escapeHtml(topic.nume)}\n${textRezultat(st.rezultate)}`);
      }
    } else if (st.stare === 'esuat' || (st.stare === 'negasit' && varsta > NEGASIT_DUPA_MS) || (st.stare === 'in_lucru' && varsta > IN_LUCRU_MAX_MS)) {
      const motiv = st.stare === 'esuat' ? 'Upload-Post a raportat eșec' : st.stare === 'negasit' ? 'Upload-Post nu găsește cererea' : 'nu s-a terminat în 6 ore';
      await seteaza(p.id, { stare: 'esuat', rezultate: st.brut, eroare: motiv });
      await anuntaInTopic(p, topic, `❌ <b>Nepublicat</b> (${motiv})\n${textRezultat(st.rezultate)}`);
      await sendAdminAlert(`❌ <b>Clip nepublicat</b> · ${escapeHtml(topic.nume)} — ${motiv}\n${textRezultat(st.rezultate)}`);
    }
  }
}

/** O trecere a publicatorului (la fiecare minut, fără suprapunere). */
export async function trecerePublicare(): Promise<void> {
  await deblocheaza();
  await verificaTrimise();
  const { data } = await db().from('social_posts').select('id').eq('stare', 'planificat')
    .lte('planificat_la', new Date().toISOString()).order('planificat_la').limit(PE_TREAPTA);
  for (const { id } of data ?? []) {
    // Luarea e atomică: doar dacă e încă «planificat» (un admin putea anula chiar acum).
    const { data: luat } = await db().from('social_posts').select('incercari').eq('id', id).single();
    const { data: rand } = await db().from('social_posts')
      .update({ stare: 'se_publica', luat_la: new Date().toISOString(), incercari: ((luat?.incercari as number) ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', id).eq('stare', 'planificat').select('*');
    if (rand?.length) await publicaUna(rand[0] as Postare);
  }
}
