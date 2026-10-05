import type { GroupComplaint } from '../voice/drivers-group';

// Plângerea clientului din botul Telegram (ION-252 / ION-247; Ion: «călătorul poate să lase plângere în Telegram bot»).
// Botul cheamă POST /api/bilete/plangere cu BILETE_BOT_API_KEY. Plângerea se scrie în voice_complaints (sursa
// «telegram», generată din conversation_id — migr. 506) și pleacă în grupa reclamațiilor ca la telefon. Cursa și șoferul
// vin din biletul cumpărat de ACEST cont (comanda altui cont nu se leagă), nu din ce scrie clientul.
// Modul fără bază și fără Next: accesul la date vine prin RepoPlangeri (plangere-repo.ts), testat cu un repo fals.

/** Plafonul: cel mult 3 plângeri pe zi (Chișinău) pe cont Telegram. */
export const PLAFON_PLANGERI_ZI = 3;
export const PLANGERE_TEXT_MAX = 2000;

const COD_RE = /^[0-9a-f]{32}$/;
/** file_id Telegram: litere, cifre, «-» și «_»; lungimea mărginită ca să nu ajungă gunoi în bază. */
const FILE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;
const CONVERSATIE_PREFIX = 'tg_';

/** Cererea validată: contul, mesajul (cheia de idempotență), textul curățat, comanda și poza opționale. */
export interface CererePlangere {
  telegramId: number;
  mesajId: number;
  text: string;
  cod: string | null;
  fotoFileId: string | null;
}

export type EroareCerere = 'telegram_id' | 'mesaj_id' | 'text';

const intregPozitiv = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** Corpul cererii → cererea validată sau motivul refuzului. Un cod / o poză cu formă greșită se ignoră. Pur, testat. */
export function valideazaCererePlangere(body: unknown): { ok: true; cerere: CererePlangere } | { ok: false; eroare: EroareCerere } {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const telegramId = intregPozitiv(b.telegram_id);
  if (!telegramId) return { ok: false, eroare: 'telegram_id' };
  const mesajId = intregPozitiv(b.mesaj_id);
  if (!mesajId) return { ok: false, eroare: 'mesaj_id' };
  // Caracterele de control (în afară de rânduri noi) nu au ce căuta în dosar și în grupă.
  // eslint-disable-next-line no-control-regex
  const text = (typeof b.text === 'string' ? b.text : '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim().slice(0, PLANGERE_TEXT_MAX);
  if (!text) return { ok: false, eroare: 'text' };
  const cod = typeof b.cod === 'string' && COD_RE.test(b.cod.trim().toLowerCase()) ? b.cod.trim().toLowerCase() : null;
  const fotoFileId = typeof b.foto_file_id === 'string' && FILE_ID_RE.test(b.foto_file_id) ? b.foto_file_id : null;
  return { ok: true, cerere: { telegramId, mesajId, text, cod, fotoFileId } };
}

/** Id-ul «conversației»: un mesaj Telegram = o plângere; reluarea aceluiași mesaj se lovește de unique (migr. 307). */
export function conversatieTelegram(telegramId: number, mesajId: number): string {
  return `${CONVERSATIE_PREFIX}${telegramId}_${mesajId}`;
}

/** Comanda din care vine plângerea (doar câmpurile de care e nevoie). */
export interface ComandaPlangere {
  id: string;
  telegram_id: number | null;
  trip_date: string;
  crm_route_id: number;
  going_north: boolean;
  from_name: string;
  to_name: string;
  departure_at: string;
  passenger_name: string;
  phone: string;
}

/** Șoferul cursei din graficul zilei (daily_assignments, aceleași reguli tur/retur ca mini app-ul șoferului). */
export interface SoferCursa { driver_id: string; driver_name: string | null; plate: string | null }

/** Rândul scris în voice_complaints. */
export interface RandPlangere {
  conversation_id: string;
  telegram_id: number;
  bilet_comanda_id: string | null;
  foto_file_id: string | null;
  caller_phone: string | null;
  caller_name: string | null;
  complaint: string;
  trip_date: string | null;
  departure: string | null;
  route: string | null;
  driver_id: string | null;
  driver_name: string | null;
  plate: string | null;
  identified: boolean;
  evidence: 'bilet';
  complaint_type: string;
  alerted: true;
}

export interface RepoPlangeri {
  /** Câte plângeri a scris contul de la `deLa` (ISO) încoace. */
  plangeriDeLa(telegramId: number, deLa: string): Promise<number>;
  /** Comanda după cod (null = nu există). */
  comanda(cod: string): Promise<ComandaPlangere | null>;
  /** Șoferul cursei comenzii, sau null dacă graficul zilei nu-l are. */
  soferulCursei(c: Pick<ComandaPlangere, 'trip_date' | 'crm_route_id' | 'going_north'>): Promise<SoferCursa | null>;
  /** 'dubla' = rândul cu același conversation_id există deja (aceeași plângere, reluată). */
  insereaza(r: RandPlangere): Promise<'inserata' | 'dubla'>;
}

/** Ce trebuie de la nomenclator și de la grupă: eticheta tipului, trimiterea și marcajul «grupa a văzut». */
export interface DepsNotificare {
  eticheta(code: string): Promise<{ name_ru: string; culprit: GroupComplaint['culprit'] } | null>;
  trimiteInGrupa(text: string, fotoFileId: string | null): Promise<boolean>;
  marcheazaGrupa(conversationId: string): Promise<void>;
  formateaza(c: GroupComplaint): string;
}

export interface DepsPlangere extends DepsNotificare {
  repo: RepoPlangeri;
  /** Miezul nopții Chișinău de azi (ISO): de aici se numără plafonul. */
  inceputulZilei: string;
  /** «HH:MM» Chișinău al unui instant (ora plecării pe dosar). */
  oraChisinau(iso: string): string;
  normalizeazaTelefon(telefon: string): string;
  /** Codul tipului de rezervă din nomenclator (ALTUL): în bot clientul nu alege un tip. */
  tipImplicit: string;
}

export type RezultatPlangere =
  | { status: 200; corp: { ok: true }; notifica: (() => Promise<void>) | null }
  | { status: 429; corp: { ok: false; cod: 'plafon' }; notifica: null };

/** Comanda se leagă DOAR dacă e a acestui cont; altfel plângerea rămâne fără cursă (nu aflăm nimic de altcineva). */
async function comandaContului(repo: RepoPlangeri, cerere: CererePlangere): Promise<ComandaPlangere | null> {
  if (!cerere.cod) return null;
  const c = await repo.comanda(cerere.cod);
  return c && Number(c.telegram_id) === cerere.telegramId ? c : null;
}

/** Rândul din dosar: cursa și șoferul din bilet, textul clientului, tipul de rezervă. Pur, testat prin serviciu. */
export function randPlangere(
  cerere: CererePlangere,
  comanda: ComandaPlangere | null,
  sofer: SoferCursa | null,
  deps: Pick<DepsPlangere, 'oraChisinau' | 'normalizeazaTelefon' | 'tipImplicit'>,
): RandPlangere {
  return {
    conversation_id: conversatieTelegram(cerere.telegramId, cerere.mesajId),
    telegram_id: cerere.telegramId,
    bilet_comanda_id: comanda?.id ?? null,
    foto_file_id: cerere.fotoFileId,
    caller_phone: comanda ? deps.normalizeazaTelefon(comanda.phone) || null : null,
    caller_name: comanda?.passenger_name?.trim() || null,
    complaint: cerere.text,
    trip_date: comanda?.trip_date ?? null,
    departure: comanda ? deps.oraChisinau(comanda.departure_at) : null,
    route: comanda ? `${comanda.from_name} – ${comanda.to_name}` : null,
    driver_id: sofer?.driver_id ?? null,
    driver_name: sofer?.driver_name ?? null,
    plate: sofer?.plate ?? null,
    identified: Boolean(sofer),
    evidence: 'bilet',
    complaint_type: deps.tipImplicit,
    alerted: true,
  };
}

/** Mesajul în grupă (rusă, ca la telefon) și marcajul «grupa a văzut» doar după trimiterea reușită. */
function notificare(rand: RandPlangere, deps: DepsNotificare): () => Promise<void> {
  return async () => {
    const eticheta = await deps.eticheta(rand.complaint_type);
    const text = deps.formateaza({
      driver_name: rand.driver_name,
      plate: rand.plate,
      identified: rand.identified,
      route: rand.route,
      departure: rand.departure,
      trip_date: rand.trip_date,
      complaint: rand.complaint,
      type_name: eticheta?.name_ru ?? null,
      culprit: eticheta?.culprit ?? null,
      evidence: rand.evidence,
      sursa: 'telegram',
    });
    if (await deps.trimiteInGrupa(text, rand.foto_file_id)) await deps.marcheazaGrupa(rand.conversation_id);
  };
}

/**
 * Înregistrează plângerea: plafonul, legătura cu comanda contului, șoferul cursei, rândul; mesajul în grupă se întoarce
 * ca funcție (ruta îl trimite după răspuns). Aceeași plângere reluată (același mesaj) → ok, fără al doilea mesaj.
 */
export async function inregistreazaPlangerea(cerere: CererePlangere, deps: DepsPlangere): Promise<RezultatPlangere> {
  if ((await deps.repo.plangeriDeLa(cerere.telegramId, deps.inceputulZilei)) >= PLAFON_PLANGERI_ZI) {
    return { status: 429, corp: { ok: false, cod: 'plafon' }, notifica: null };
  }
  const comanda = await comandaContului(deps.repo, cerere);
  const sofer = comanda ? await deps.repo.soferulCursei(comanda) : null;
  const rand = randPlangere(cerere, comanda, sofer, deps);
  const scris = await deps.repo.insereaza(rand);
  return { status: 200, corp: { ok: true }, notifica: scris === 'inserata' ? notificare(rand, deps) : null };
}
