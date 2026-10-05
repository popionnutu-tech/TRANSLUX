import { InlineKeyboard, type NextFunction } from 'grammy';
import type { BotContext, Limba, ReturSesiune } from '../types.js';
import {
  panouBilete, type PanouBilete, type RaspunsOferta, type RaspunsStare, type RezultatPanou,
} from '../services/panouBilete.js';
import { repoBileteClienti, type ComandaClient, type RepoBileteClienti } from '../services/bileteClienti.js';
import { clasificatorRetur, PlafonApeluri, TEXT_CLIENT_MAX, type ClasificatorRetur } from '../services/returAi.js';
import {
  BUTOANE, buton, etichetaBilet, text, textCifreGresite, textDispecer, textFaraBani, textIntarziat, textOferta,
  textRefuzOferta, textStare,
} from './retur-texte.js';
import { incepePlangerea } from './plangere.js';

// ION-244 (Ion, 05.10): returnarea biletului online în bot, «cu AI». Nucleul e pe butoane: «Returnează» → panoul face
// oferta din grilă (valabilă 15 min) → clientul confirmă → panoul anulează și cere refund-ul. AI-ul (returAi.ts) doar
// îndrumă textul liber. `telegram_id` se ia DOAR din `ctx.from.id` (și la callback-uri tot din `ctx.from`, adică
// `callbackQuery.from`), niciodată din callback_data; panoul verifică legarea comenzii de acest cont.
// Planul: docs/plans/2026-10-05-retur-bot-ai.md (corecturile 6, 10–13, 16′, 16″, 17′; contractul API).

/** Cât așteaptă botul cele 4 cifre după ce le-a cerut. */
export const CIFRE_ASTEPTARE_MS = 10 * 60_000;
/** Câte oferte ține minte sesiunea (pentru «suma s-a schimbat» la oferta expirată). */
export const OFERTE_RETINUTE = 5;
/** Escaladările spre dispecer: cel mult 3 în 10 minute pe cont (panoul are și el plafonul lui). */
export const PLAFON_ESCALADARI = 3;
export const PLAFON_ESCALADARI_FEREASTRA_MS = 10 * 60_000;

export interface ReturDeps {
  panou: PanouBilete;
  repo: RepoBileteClienti;
  ai: ClasificatorRetur;
  plafonEscaladari: PlafonApeluri;
  now: () => number;
}

export const depsRetur: ReturDeps = {
  panou: panouBilete,
  repo: repoBileteClienti,
  ai: clasificatorRetur,
  plafonEscaladari: new PlafonApeluri(PLAFON_ESCALADARI, PLAFON_ESCALADARI_FEREASTRA_MS),
  now: Date.now,
};

// ── Reguli pure (testate în retur.test.ts) ───────────────────────────────────────────────────────

const COD_RE = /^[0-9a-f]{32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CallbackRetur =
  | { actiune: 'cere'; cod: string }
  | { actiune: 'ok' | 'nu' | 'stare'; ofertaId: string };

/** `retur:cere:<cod>` / `retur:ok|nu|stare:<oferta_id>` → acțiunea; orice altă formă → null. */
export function parseazaCallbackRetur(data: string | undefined): CallbackRetur | null {
  const m = /^retur:(cere|ok|nu|stare):(.+)$/.exec(data ?? '');
  if (!m) return null;
  const [, actiune, arg] = m;
  if (actiune === 'cere') return COD_RE.test(arg) ? { actiune, cod: arg } : null;
  if (!UUID_RE.test(arg)) return null;
  return { actiune: actiune as 'ok' | 'nu' | 'stare', ofertaId: arg.toLowerCase() };
}

export type RutaMesaj = 'cifre' | 'verifica_bilete' | 'mai_departe';

/**
 * Unde merge un mesaj privat ÎNAINTEA răspunsului implicit «Acces restricționat»: cele 4 cifre așteptate au prioritate
 * (și pentru personal, fiindcă le-a cerut chiar butonul lui de bilet); comenzile și personalul merg mai departe
 * neatinse; restul se verifică în bază (are bilet legat activ?).
 */
export function rutaMesaj(p: { privat: boolean; text: string | null; asteaptaCifre: boolean; estePersonal: boolean }): RutaMesaj {
  if (!p.privat) return 'mai_departe';
  const esteComanda = p.text?.startsWith('/') ?? false;
  if (p.asteaptaCifre && p.text !== null && !esteComanda) return 'cifre';
  if (esteComanda || p.estePersonal) return 'mai_departe';
  return 'verifica_bilete';
}

export type CitireCifre = { tip: 'cifre'; cifre: string } | { tip: 'numeric_gresit' } | { tip: 'alt_text' };

/** Textul pe care îl scrie clientul cât botul așteaptă cifrele. Un text cu litere iese din așteptare. */
export function citesteCifre(t: string): CitireCifre {
  const s = t.trim();
  if (!/^[\d\s+\-().]+$/.test(s)) return { tip: 'alt_text' };
  const d = s.replace(/\D/g, '');
  return d.length === 4 ? { tip: 'cifre', cifre: d } : { tip: 'numeric_gresit' };
}

export function bileteDeReturnat(comenzi: ComandaClient[], nowMs: number): ComandaClient[] {
  return comenzi.filter((c) => Date.parse(c.departure_at) > nowMs);
}

/** La «am întârziat»: biletul cu plecarea cea mai apropiată de acum (de obicei cel tocmai pierdut). */
export function biletulCelMaiApropiat(comenzi: ComandaClient[], nowMs: number): ComandaClient | null {
  let best: ComandaClient | null = null;
  for (const c of comenzi) {
    if (!best || Math.abs(Date.parse(c.departure_at) - nowMs) < Math.abs(Date.parse(best.departure_at) - nowMs)) best = c;
  }
  return best;
}

export function limbaDin(...surse: Array<string | null | undefined>): Limba {
  for (const s of surse) {
    if (!s) continue;
    return s.toLowerCase().startsWith('ru') ? 'ru' : 'ro';
  }
  return 'ro';
}

/** Sesiunea nouă cu oferta reținută (cele mai recente `OFERTE_RETINUTE`), fără a muta obiectul primit. */
export function retineOferta(s: ReturSesiune | undefined, o: { ofertaId: string; cod: string; lang: Limba; nowMs: number }): ReturSesiune {
  const toate = { ...(s?.oferte ?? {}), [o.ofertaId]: { cod: o.cod, lang: o.lang, la: o.nowMs } };
  const pastrate = Object.entries(toate).sort((a, b) => b[1].la - a[1].la).slice(0, OFERTE_RETINUTE);
  return { ...s, oferte: Object.fromEntries(pastrate) };
}

export type RezultatConfirmare =
  | { tip: 'stare'; stare: RaspunsStare }
  | { tip: 'indisponibil' }
  | { tip: 'fara_raspuns' };

/**
 * Confirmarea fără dublă plată (corectura 11): `confirma` o singură dată; la timeout/eroare NU se retrimite, ci se
 * citește `stare` (adevărul din comandă + checkout, 16′/16″). Dacă nici starea nu vine → «Verifică starea».
 */
export async function confirmaCuVerificare(panou: PanouBilete, telegramId: number, ofertaId: string): Promise<RezultatConfirmare> {
  const r = await panou.confirma(telegramId, ofertaId);
  if (r.tip === 'raspuns') return { tip: 'stare', stare: r.raspuns };
  if (r.eroare === 'indisponibil') return { tip: 'indisponibil' };
  console.error(`[retur] confirma ${ofertaId}: ${r.eroare}${r.status ? ` (${r.status})` : ''} — citesc starea`);
  const s = await panou.stare(telegramId, ofertaId);
  return s.tip === 'raspuns' ? { tip: 'stare', stare: s.raspuns } : { tip: 'fara_raspuns' };
}

// ── Trimiterea mesajelor ─────────────────────────────────────────────────────────────────────────

const tastaturaVerifica = (ofertaId: string, lang: Limba) =>
  new InlineKeyboard().text(buton(BUTOANE.verifica, lang), `retur:stare:${ofertaId}`);

const tastaturaConfirmare = (ofertaId: string, suma: number, lang: Limba) =>
  new InlineKeyboard()
    .text(buton(BUTOANE.anuleaza(suma), lang), `retur:ok:${ofertaId}`).row()
    .text(buton(BUTOANE.pastrez, lang), `retur:nu:${ofertaId}`);

function tastaturaBilete(comenzi: ComandaClient[], lang: Limba): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const c of comenzi) kb.text(`↩️ ${etichetaBilet(c, lang)}`, `retur:cere:${c.cod}`).row();
  return kb;
}

function seteazaCifre(ctx: BotContext, cifre: ReturSesiune['cifre']): void {
  ctx.session.retur = { ...ctx.session.retur, cifre };
}

/** Trimite clientului rezultatul cererii de ofertă (oricare din ramurile contractului). */
async function trimiteRezultatOferta(
  ctx: BotContext,
  deps: ReturDeps,
  r: RezultatPanou<RaspunsOferta>,
  p: { cod: string; lang: Limba; sumaSchimbata?: boolean },
): Promise<void> {
  if (r.tip === 'eroare') {
    if (r.eroare !== 'indisponibil') console.error(`[retur] oferta ${p.cod}: ${r.eroare}${r.status ? ` (${r.status})` : ''}`);
    await ctx.reply(text('indisponibil', p.lang));
    return;
  }
  const o = r.raspuns;
  if (o.tip === 'cere_cifre' || o.tip === 'cifre_gresite') {
    seteazaCifre(ctx, { cod: p.cod, lang: p.lang, expiraLa: deps.now() + CIFRE_ASTEPTARE_MS });
    await ctx.reply(o.tip === 'cere_cifre' ? text('cereCifre', p.lang) : textCifreGresite(o.ramase, p.lang));
    return;
  }
  seteazaCifre(ctx, undefined);
  switch (o.tip) {
    case 'oferta':
      ctx.session.retur = retineOferta(ctx.session.retur, { ofertaId: o.oferta_id, cod: p.cod, lang: o.lang, nowMs: deps.now() });
      await ctx.reply(textOferta(o, deps.now(), p.sumaSchimbata), { reply_markup: tastaturaConfirmare(o.oferta_id, o.suma, o.lang) });
      return;
    case 'fara_bani':
      await ctx.reply(textFaraBani(o.motiv, p.lang));
      return;
    case 'dispecer':
      await ctx.reply(textDispecer(o.motiv, p.lang));
      return;
    case 'refuz':
      await ctx.reply(textRefuzOferta(o.cod, p.lang));
      return;
  }
}

async function cereOferta(ctx: BotContext, deps: ReturDeps, p: { cod: string; lang: Limba; cifre?: string; sumaSchimbata?: boolean }): Promise<void> {
  const fromId = ctx.from?.id;
  if (!fromId) return;
  const r = await deps.panou.oferta(fromId, p.cod, p.cifre);
  await trimiteRezultatOferta(ctx, deps, r, p);
}

/** Starea venită de la panou → mesajul clientului; `expirata` cu codul cunoscut → oferta nouă («suma s-a schimbat»). */
async function arataStare(ctx: BotContext, deps: ReturDeps, ofertaId: string, s: RaspunsStare, lang: Limba): Promise<void> {
  const retinuta = ctx.session.retur?.oferte?.[ofertaId];
  if (s.stare === 'expirata' && retinuta) {
    await cereOferta(ctx, deps, { cod: retinuta.cod, lang, sumaSchimbata: true });
    return;
  }
  if (s.stare === 'neatinsa' && s.suma != null && s.suma > 0) {
    await ctx.reply(textStare(s, lang).text, { reply_markup: tastaturaConfirmare(ofertaId, s.suma, lang) });
    return;
  }
  const m = textStare(s, lang);
  await ctx.reply(m.text, m.cuVerificare ? { reply_markup: tastaturaVerifica(ofertaId, lang) } : undefined);
}

// ── Callback-urile `retur:*` (pentru oricine: panoul verifică legarea) ───────────────────────────

const limbaOfertei = (ctx: BotContext, ofertaId: string): Limba =>
  ctx.session.retur?.oferte?.[ofertaId]?.lang ?? limbaDin(ctx.from?.language_code);

async function scoateButoanele(ctx: BotContext): Promise<void> {
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
}

async function laConfirmare(ctx: BotContext, deps: ReturDeps, fromId: number, ofertaId: string): Promise<void> {
  const lang = limbaOfertei(ctx, ofertaId);
  await ctx.answerCallbackQuery({ text: text('seProceseaza', lang) });
  await scoateButoanele(ctx);
  await ctx.reply(text('seProceseaza', lang));
  const r = await confirmaCuVerificare(deps.panou, fromId, ofertaId);
  if (r.tip === 'indisponibil') {
    await ctx.reply(text('indisponibil', lang));
    return;
  }
  if (r.tip === 'fara_raspuns') {
    await ctx.reply(text('verificaNereusit', lang), { reply_markup: tastaturaVerifica(ofertaId, lang) });
    return;
  }
  await arataStare(ctx, deps, ofertaId, r.stare, lang);
}

async function laVerificare(ctx: BotContext, deps: ReturDeps, fromId: number, ofertaId: string): Promise<void> {
  const lang = limbaOfertei(ctx, ofertaId);
  await ctx.answerCallbackQuery();
  const s = await deps.panou.stare(fromId, ofertaId);
  if (s.tip === 'raspuns') {
    await arataStare(ctx, deps, ofertaId, s.raspuns, lang);
    return;
  }
  await ctx.reply(s.eroare === 'indisponibil' ? text('indisponibil', lang) : text('verificaNereusit', lang),
    s.eroare === 'indisponibil' ? undefined : { reply_markup: tastaturaVerifica(ofertaId, lang) });
}

async function laCerere(ctx: BotContext, deps: ReturDeps, cod: string): Promise<void> {
  await ctx.answerCallbackQuery();
  const comanda = await deps.repo.comandaDupaCod(cod).catch(() => null);
  await cereOferta(ctx, deps, { cod, lang: limbaDin(comanda?.lang, ctx.from?.language_code) });
}

export function creeazaHandlerCallbackRetur(deps: ReturDeps = depsRetur) {
  return async (ctx: BotContext): Promise<void> => {
    const cb = parseazaCallbackRetur(ctx.callbackQuery?.data);
    const fromId = ctx.from?.id;
    if (!cb || !fromId) {
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }
    try {
      if (cb.actiune === 'cere') return await laCerere(ctx, deps, cb.cod);
      if (cb.actiune === 'ok') return await laConfirmare(ctx, deps, fromId, cb.ofertaId);
      if (cb.actiune === 'stare') return await laVerificare(ctx, deps, fromId, cb.ofertaId);
      await ctx.answerCallbackQuery();
      await scoateButoanele(ctx);
      await ctx.reply(text('pastrat', limbaOfertei(ctx, cb.ofertaId)));
    } catch (e) {
      // Ramura clientului nu are voie să rupă botul: jurnal + trimitere la telefon. Callback-ul se închide oricum.
      console.error('[retur/callback]', e instanceof Error ? e.message : e);
      await ctx.answerCallbackQuery().catch(() => {});
      await ctx.reply(text('indisponibil', limbaDin(ctx.from?.language_code))).catch(() => {});
    }
  };
}

// ── Mesajele clienților (text liber, cele 4 cifre) ───────────────────────────────────────────────

async function laCifre(ctx: BotContext, deps: ReturDeps, t: string): Promise<'gata' | 'continua'> {
  const asteptare = ctx.session.retur?.cifre;
  if (!asteptare || asteptare.expiraLa < deps.now()) {
    seteazaCifre(ctx, undefined);
    return 'continua';
  }
  const c = citesteCifre(t);
  if (c.tip === 'alt_text') {
    seteazaCifre(ctx, undefined);
    return 'continua';
  }
  if (c.tip === 'numeric_gresit') {
    await ctx.reply(text('doarCifre', asteptare.lang));
    return 'gata';
  }
  await cereOferta(ctx, deps, { cod: asteptare.cod, lang: asteptare.lang, cifre: c.cifre });
  return 'gata';
}

async function arataMeniu(ctx: BotContext, comenzi: ComandaClient[], lang: Limba, nowMs: number): Promise<void> {
  const viitoare = bileteDeReturnat(comenzi, nowMs);
  if (viitoare.length === 0) {
    await ctx.reply(text('altceva', lang));
    return;
  }
  await ctx.reply(text('meniu', lang), { reply_markup: tastaturaBilete(viitoare, lang) });
}

async function laIntentieRetur(ctx: BotContext, deps: ReturDeps, comenzi: ComandaClient[], lang: Limba): Promise<void> {
  const viitoare = bileteDeReturnat(comenzi, deps.now());
  if (viitoare.length === 0) {
    await ctx.reply(textFaraBani('plecat', lang));
    return;
  }
  if (viitoare.length === 1) {
    await cereOferta(ctx, deps, { cod: viitoare[0].cod, lang });
    return;
  }
  await ctx.reply(text('alegeBilet', lang), { reply_markup: tastaturaBilete(viitoare, lang) });
}

async function laIntarziat(ctx: BotContext, deps: ReturDeps, comenzi: ComandaClient[], lang: Limba): Promise<void> {
  const bilet = biletulCelMaiApropiat(comenzi, deps.now());
  const telefon = bilet
    ? await deps.repo.telefonSofer(bilet).catch((e) => {
      console.error('[retur] telefonul șoferului:', e instanceof Error ? e.message : e);
      return null;
    })
    : null;
  await ctx.reply(textIntarziat(telefon, lang));
}

async function laVinaNoastra(ctx: BotContext, deps: ReturDeps, fromId: number, p: { comenzi: ComandaClient[]; mesaj: string; lang: Limba }): Promise<void> {
  if (!deps.plafonEscaladari.incearca(fromId, deps.now())) {
    await ctx.reply(text('escaladareDeja', p.lang));
    return;
  }
  const bilet = biletulCelMaiApropiat(p.comenzi, deps.now());
  const r = await deps.panou.escaladeaza({ telegramId: fromId, cod: bilet?.cod, text: p.mesaj.slice(0, TEXT_CLIENT_MAX), motiv: 'vina_noastra' });
  if (r.tip === 'eroare') console.error(`[retur] escaladare: ${r.eroare}${r.status ? ` (${r.status})` : ''}`);
  await ctx.reply(text(r.tip === 'raspuns' ? 'dispecerVina' : 'escaladareEsuata', p.lang));
}

async function raspundeClientului(ctx: BotContext, deps: ReturDeps, fromId: number, comenzi: ComandaClient[]): Promise<void> {
  const mesaj = ctx.message?.text ?? null;
  const limbaImplicita = limbaDin(comenzi[0]?.lang, ctx.from?.language_code);
  const c = mesaj ? await deps.ai.clasifica(fromId, mesaj) : null;
  if (!c || !mesaj) {
    await arataMeniu(ctx, comenzi, limbaImplicita, deps.now());
    return;
  }
  switch (c.intentie) {
    case 'retur': return laIntentieRetur(ctx, deps, comenzi, c.lang);
    case 'intarziat': return laIntarziat(ctx, deps, comenzi, c.lang);
    case 'vina_noastra': return laVinaNoastra(ctx, deps, fromId, { comenzi, mesaj, lang: c.lang });
    // ION-252 / ION-247: plângerea se primește chiar aici, în bot, legată de biletul cel mai apropiat.
    case 'plangere': return incepePlangerea(ctx, { cod: biletulCelMaiApropiat(comenzi, deps.now())?.cod ?? null, lang: c.lang }, deps.now());
    case 'altceva': await ctx.reply(text('altceva', c.lang)); return;
  }
}

/**
 * Mesajele private, înaintea răspunsului implicit «Acces restricționat»: cifrele așteptate, apoi clientul FĂRĂ cont de
 * personal care are cel puțin un bilet legat activ. Personalul și cei fără bilete merg mai departe neatinși.
 */
export function creeazaHandlerMesajClient(deps: ReturDeps = depsRetur) {
  return async (ctx: BotContext, next: NextFunction): Promise<void> => {
    const fromId = ctx.from?.id;
    const mesaj = ctx.message?.text ?? null;
    const ruta = rutaMesaj({
      privat: ctx.chat?.type === 'private' && Boolean(fromId),
      text: mesaj,
      asteaptaCifre: Boolean(ctx.session?.retur?.cifre),
      estePersonal: Boolean(ctx.dbUser),
    });
    if (ruta === 'mai_departe' || !fromId) return next();
    try {
      if (ruta === 'cifre' && mesaj !== null && (await laCifre(ctx, deps, mesaj)) === 'gata') return;
      if (ctx.dbUser || mesaj?.startsWith('/')) return next();
      const comenzi = await deps.repo.comenziLegate(fromId, deps.now());
      if (comenzi.length === 0) return next();
      await raspundeClientului(ctx, deps, fromId, comenzi);
    } catch (e) {
      console.error('[retur/mesaj]', e instanceof Error ? e.message : e);
      await ctx.reply(text('indisponibil', limbaDin(ctx.from?.language_code))).catch(() => {});
    }
  };
}

/** `/start` fără cod pentru un client (nu personal) cu bilete legate → lista biletelor. true = a răspuns. */
export async function handleStartClient(ctx: BotContext, deps: ReturDeps = depsRetur): Promise<boolean> {
  const fromId = ctx.from?.id;
  if (ctx.chat?.type !== 'private' || ctx.dbUser || !fromId) return false;
  try {
    const comenzi = await deps.repo.comenziLegate(fromId, deps.now());
    if (comenzi.length === 0) return false;
    const lang = limbaDin(comenzi[0].lang, ctx.from?.language_code);
    const viitoare = bileteDeReturnat(comenzi, deps.now());
    if (viitoare.length === 0) await ctx.reply(textIntarziat(null, lang));
    else await ctx.reply(text('alegeBilet', lang), { reply_markup: tastaturaBilete(viitoare, lang) });
    return true;
  } catch (e) {
    console.error('[retur/start]', e instanceof Error ? e.message : e);
    return false;
  }
}
