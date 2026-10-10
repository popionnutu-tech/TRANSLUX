import { openAsBlob } from 'node:fs';
import {
  apiBot, db, esteAdmin, esteBlogger, escapeHtml, NUME_PLATFORMA, publicareReala, tokenBot, topicDupaId,
  type Postare, type Topic,
} from './comun.js';
import { ClipSchimbat, descarcaClip, stergeTemporar } from './descarcare.js';
import { publica, stareaPublicarii, EroareUploadPost, type Platforma, type RezultatPlatforma } from './uploadPost.js';
import { formatLoc } from './calendar.js';
import { analizeaza, converteste, ffmpegDisponibil, planConversie } from './conversie.js';
import { sendAdminAlert } from '../services/adminAlert.js';

// Publicatorul (plan 09.10, «Publicarea video» p. 7–8): la fiecare minut ia clipurile ajunse la oră, le descarcă din
// Telegram, le trimite la Upload-Post și urmărește rezultatul. Stările stau în bază: repornirea botului nu pierde și
// nu dublează nimic — Upload-Post primește id-ul postării ca `Idempotency-Key` («dacă există job cu aceeași cheie,
// se întoarce jobul existent», docs.upload-post.com/api/upload-video), iar id-ul nu se schimbă la reîncercări și nici
// la repostarea aceluiași clip (primire.ts refolosește rândul).
//
// Destinația (profil, platforme, pagina Facebook) și modul «probă» se iau de pe POSTARE, fixate la primire (migr. 545):
// relegarea topicului sau punerea cheilor nu schimbă ce a fost deja confirmat în topic (dezbaterea 10.10: C2, BL-2).

const PE_TREAPTA = 2;
export const INCERCARI_MAX = 3;
/** Cât poate sta o postare «se_publica» până o considerăm blocată de o repornire. */
export const BLOCAT_DUPA_MS = 90 * 60_000; // descărcare 30 + conversie 30 + trimitere 20 + marjă
const NEGASIT_DUPA_MS = 2 * 60 * 60_000;
const IN_LUCRU_MAX_MS = 6 * 60 * 60_000;
const REINCERCARE_MS = 15 * 60_000;

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

/** Rezultatul pe platforme, inclusiv cele cerute și sărite (C6: contul nu e conectat în profil). Pur, testat. */
export function textRezultat(rez: RezultatPlatforma[], cerute: Platforma[] = []): string {
  const randuri = rez.map((x) => {
    const nume = NUME_PLATFORMA[x.platforma] ?? x.platforma;
    if (x.sarit) return `⚠️ ${nume}: nepublicat — contul nu e conectat în profilul Upload-Post`;
    if (x.inCiorne) return `⚠️ ${nume}: clipul e în ciornele TikTok — apăsați «Postează» în aplicație`;
    if (x.reusit) return x.url ? `✅ <a href="${escapeHtml(x.url)}">${nume}</a>` : `✅ ${nume}`;
    return `❌ ${nume}: nepublicat`;
  });
  for (const p of cerute) {
    if (!rez.some((x) => x.platforma === p)) randuri.push(`⚠️ ${NUME_PLATFORMA[p]}: Upload-Post n-a raportat nimic`);
  }
  return randuri.join('\n');
}

/** Toate platformele cerute au ieșit public (fără sărite, ciorne sau eșecuri)? Pur, testat. */
export function complet(rez: RezultatPlatforma[], cerute: Platforma[]): boolean {
  return cerute.every((p) => rez.some((x) => x.platforma === p && x.reusit && !x.sarit && !x.inCiorne));
}

/** C8: rândurile rămase «neconfirmat» (mesajul cu butoane n-a ajuns / repornire la mijloc) nu se publică niciodată. */
export const NECONFIRMAT_DUPA_MS = 10 * 60_000;

/** Postările «se_publica» rămase de la o repornire → înapoi în calendar (sau eșuate după 3 încercări). */
async function deblocheaza(): Promise<void> {
  const pragNec = new Date(Date.now() - NECONFIRMAT_DUPA_MS).toISOString();
  await db().from('social_posts').update({ stare: 'anulat', eroare: 'confirmarea din topic nu a ajuns', updated_at: new Date().toISOString() })
    .eq('stare', 'neconfirmat').lt('updated_at', pragNec); // updated_at: un rând refolosit la repostare e «nou»
  const prag = new Date(Date.now() - BLOCAT_DUPA_MS).toISOString();
  const { data } = await db().from('social_posts').select('id, incercari').eq('stare', 'se_publica').lt('luat_la', prag);
  for (const r of data ?? []) {
    await seteaza(r.id as string, (r.incercari as number) >= INCERCARI_MAX
      ? { stare: 'esuat', eroare: 'blocat la descărcare sau trimitere de 3 ori' }
      : { stare: 'planificat' });
  }
}

/** SEC-3: la ora publicării autorul trebuie să fie încă pe listă (sau admin), iar topicul pornit. null = ok. */
async function motivOprire(p: Postare, topic: Topic): Promise<string | null> {
  if (!topic.activ) return 'topicul a fost oprit (/social_oprit)';
  if (await esteBlogger(topic.id, p.autor_telegram_id)) return null;
  if (await esteAdmin(p.autor_telegram_id)) return null;
  return 'autorul nu mai e pe lista bloggerilor topicului';
}

async function publicaUna(p: Postare): Promise<void> {
  let topic: Topic | null;
  try {
    topic = await topicDupaId(p.topic_id);
  } catch (err) {
    // C4: citirea căzută nu e «topic șters» — înapoi în calendar, încă o încercare.
    console.error('social topic:', (err as Error).message);
    await seteaza(p.id, { stare: 'planificat', planificat_la: new Date(Date.now() + REINCERCARE_MS).toISOString() });
    return;
  }
  if (!topic) { await seteaza(p.id, { stare: 'anulat', eroare: 'topicul nu mai există' }); return; }
  const platforme = p.platforme;

  if (p.in_proba) {
    await seteaza(p.id, { stare: 'proba', publicat_la: new Date().toISOString() });
    await scoateButoanele(p, topic);
    await anuntaInTopic(p, topic, `🧪 <b>Probă:</b> acum clipul ar fi plecat pe ${platforme.map((x) => NUME_PLATFORMA[x]).join(', ')} `
      + `(profilul ${escapeHtml(p.upload_post_user)}). Nu s-a publicat nimic.`);
    return;
  }
  if (!publicareReala()) {
    // Clip primit cu publicarea reală, dar cheile au fost scoase între timp (oprirea de urgență): așteaptă, cu butoane.
    await seteaza(p.id, { stare: 'planificat', planificat_la: new Date(Date.now() + 60 * 60_000).toISOString() });
    return;
  }

  let oprire: string | null;
  try {
    oprire = await motivOprire(p, topic);
  } catch (err) {
    // Runda 2, BL2-2: citirea căzută a listei nu ține rândul blocat o oră — înapoi în calendar.
    console.error('social lista:', (err as Error).message);
    await seteaza(p.id, { stare: 'planificat', planificat_la: new Date(Date.now() + REINCERCARE_MS).toISOString() });
    return;
  }
  if (oprire) {
    await seteaza(p.id, { stare: 'anulat', eroare: oprire });
    await scoateButoanele(p, topic);
    await anuntaInTopic(p, topic, `✖ Clipul nu se publică: ${escapeHtml(oprire)}.`);
    return;
  }

  const token = tokenBot(topic.bot);
  let cale: string | null = null;
  let caleConv: string | null = null;
  // BL-4 / BL-6: din clipa în care fișierul pleacă spre Upload-Post, o eroare nu mai înseamnă «nepublicat».
  let trimitereInceputa = false;
  try {
    if (!token) throw new EroareUploadPost(`lipsește tokenul botului ${topic.bot}`, 0, true);
    // R3-2: o încercare de dinainte poate fi ajuns deja la Upload-Post — întâi se întreabă (request_id = id-ul postării),
    // nu se descarcă și nu se retrimite orbește.
    if (p.trimis_posibil) {
      const st = await stareaPublicarii(process.env.UPLOAD_POST_API_KEY!, p.id).catch(() => null);
      if (st && (st.stare === 'gata' || st.stare === 'in_lucru')) {
        await seteazaSigur(p.id, { stare: 'trimis', upload_request_id: p.id, eroare: null });
        await scoateButoanele(p, topic);
        return;
      }
    }
    // Runda 2, BL2-3: încercarea se numără abia acum (amânările de mai sus nu consumă din cele 3).
    p.incercari += 1;
    await seteazaSigur(p.id, { incercari: p.incercari });
    cale = await descarcaClip(token, p.chat_id, p.message_id, p.id, { autorTelegramId: p.autor_telegram_id, marime: p.file_size });
    // Conversia doar când trebuie (HEVC, peste 1080p, Instagram peste limită); altfel originalul pleacă nemodificat.
    let deTrimis = cale;
    if (ffmpegDisponibil()) {
      const plan = planConversie(await analizeaza(cale), platforme, p.tip);
      if (plan) {
        caleConv = `${cale}.conv.mp4`;
        const t0 = Date.now();
        const marime = await converteste(cale, caleConv, plan);
        console.log(`social conversie ${p.id}: ${plan.motive.join(', ')} → ${Math.round(marime / 1048576)} MB în ${Math.round((Date.now() - t0) / 1000)} s`);
        await stergeTemporar(cale); // originalul nu mai trebuie: discul ține un singur clip mare
        cale = null;
        deTrimis = caleConv;
      }
    }
    const video = await openAsBlob(deTrimis, { type: 'video/mp4' });
    // C7: marcajul durabil se scrie ÎNAINTEA apelului extern și nu se mai șterge decât de un rezultat explicit de la
    // Upload-Post; fără el, o repostare ulterioară ar primi cheie nouă și ar putea dubla clipul.
    await seteazaSigur(p.id, { trimis_posibil: true });
    trimitereInceputa = true;
    await scoateButoanele(p, topic);
    const requestId = await publica(process.env.UPLOAD_POST_API_KEY!, {
      user: p.upload_post_user, platforme, tip: p.tip, durataS: p.durata_s, text: p.text_final,
      facebookPageId: p.facebook_page_id, primulComentariu: topic.primul_comentariu, idPostare: p.id,
    }, video, `${p.id}.mp4`);
    await seteazaSigur(p.id, { stare: 'trimis', upload_request_id: requestId, eroare: null });
  } catch (err) {
    const mesaj = (err as Error)?.message ?? String(err);
    const definitiv = (err instanceof EroareUploadPost && err.definitiva) || err instanceof ClipSchimbat;
    // R3-1: un refuz 4xx primit de la Upload-Post lămurește trimiterea (n-a plecat); R3-2: altfel incertitudinea vine
    // și din încercările de dinainte, nu doar din cea de acum.
    const refuzat = err instanceof EroareUploadPost && err.definitiva && err.status >= 400;
    // Runda 3 Codex, C12: refuzul lămurește doar încercarea de ACUM. Dacă îndoiala venea dintr-o încercare de dinainte
    // (`trimis_posibil` deja pus la luare), ea rămâne până la un rezultat concludent pentru aceea.
    if (refuzat) {
      trimitereInceputa = false;
      if (!p.trimis_posibil) await seteaza(p.id, { trimis_posibil: false });
    }
    const poateAPlecat = trimitereInceputa || p.trimis_posibil;
    if (definitiv || p.incercari >= INCERCARI_MAX) {
      await seteaza(p.id, { stare: 'esuat', eroare: mesaj });
      await scoateButoanele(p, topic);
      // SEC-6: în topic (îl văd și bloggerii) doar mesajul scurt; detaliul tehnic pleacă la admin.
      const scurt = poateAPlecat
        ? 'trimiterea la Upload-Post nu s-a confirmat — e posibil să fi plecat; verificați conturile'
          + (err instanceof ClipSchimbat ? ` (acum: ${escapeHtml(mesaj)})` : '')
        : err instanceof ClipSchimbat ? escapeHtml(mesaj) : 'publicarea n-a reușit; adminul a primit detaliile';
      await anuntaInTopic(p, topic, `❌ Clipul nu s-a publicat: ${scurt}.`);
      await sendAdminAlert(`❌ <b>Clip nepublicat</b> · ${escapeHtml(topic.nume)}\n${escapeHtml(mesaj)}`
        + (poateAPlecat ? '\n⚠️ Fișierul a plecat spre Upload-Post: verificați conturile înainte de repostare.' : ''));
    } else {
      // Eroare trecătoare (rețea, Telegram, 429/5xx): încă o încercare peste 15 minute, cu aceeași cheie de idempotență.
      const dupa = new Date(Date.now() + REINCERCARE_MS);
      await seteaza(p.id, { stare: 'planificat', eroare: mesaj, planificat_la: dupa.toISOString() });
      if (poateAPlecat) {
        await anuntaInTopic(p, topic, `🔁 Încercarea ${p.incercari}/${INCERCARI_MAX} n-a mers; următoarea la ${formatLoc(dupa)} (trimiterea nu s-a confirmat). `
          + 'Anularea nu mai e sigură: clipul poate fi deja la Upload-Post.');
      }
    }
  } finally {
    await stergeTemporar(cale);
    await stergeTemporar(caleConv);
  }
}

async function verificaTrimise(): Promise<void> {
  const cheie = process.env.UPLOAD_POST_API_KEY;
  if (!cheie) return;
  const { data } = await db().from('social_posts').select('*').eq('stare', 'trimis').order('luat_la').limit(20);
  for (const p of (data ?? []) as Postare[]) {
    if (!p.upload_request_id) continue;
    let topic: Topic | null;
    try { topic = await topicDupaId(p.topic_id); } catch { continue; }
    if (!topic) continue;
    const varsta = Date.now() - new Date(p.luat_la ?? p.planificat_la).getTime();
    let st;
    try { st = await stareaPublicarii(cheie, p.upload_request_id); } catch (err) { console.error('social status:', (err as Error).message); continue; }
    if (st.stare === 'gata') {
      await seteaza(p.id, { stare: 'publicat', rezultate: st.brut, publicat_la: new Date().toISOString() });
      const text = textRezultat(st.rezultate, p.platforme);
      await anuntaInTopic(p, topic, `📣 <b>Publicat</b>\n${text}`);
      if (!complet(st.rezultate, p.platforme)) {
        await sendAdminAlert(`⚠️ <b>Clip publicat incomplet</b> · ${escapeHtml(topic.nume)}\n${text}`);
      }
    } else if (st.stare === 'esuat' || (st.stare === 'negasit' && varsta > NEGASIT_DUPA_MS) || (st.stare === 'in_lucru' && varsta > IN_LUCRU_MAX_MS)) {
      const motiv = st.stare === 'esuat' ? 'Upload-Post a raportat eșec' : st.stare === 'negasit' ? 'Upload-Post nu găsește cererea' : 'nu s-a terminat în 6 ore';
      // Doar eșecul raportat explicit de Upload-Post lămurește trimiterea (la repostare: cheie nouă); negăsit sau
      // blocat 6 h rămâne «trimis_posibil».
      await seteaza(p.id, { stare: 'esuat', rezultate: st.brut, eroare: motiv, ...(st.stare === 'esuat' ? { trimis_posibil: false } : {}) });
      await anuntaInTopic(p, topic, `❌ <b>Nepublicat</b> (${motiv})\n${textRezultat(st.rezultate, p.platforme)}`);
      await sendAdminAlert(`❌ <b>Clip nepublicat</b> · ${escapeHtml(topic.nume)} — ${motiv}\n${textRezultat(st.rezultate, p.platforme)}`);
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
    // Luarea e atomică: doar dacă e ÎNCĂ «planificat» și ÎNCĂ la oră (C1: un admin putea anula sau muta clipul cât
    // publicatorul lucra la cel dinainte).
    const acum = new Date().toISOString();
    const { data: rand } = await db().from('social_posts')
      .update({ stare: 'se_publica', luat_la: acum, updated_at: acum })
      .eq('id', id).eq('stare', 'planificat').lte('planificat_la', acum).select('*');
    if (rand?.length) await publicaUna(rand[0] as Postare);
  }
}
