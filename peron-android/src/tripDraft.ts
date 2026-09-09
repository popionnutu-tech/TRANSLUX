/**
 * Ciorna pregătirii cursei (spec peron-app-two-steps, S01): tot ce fixează operatorul la
 * etapa 1 (șofer, auto, poza judecată de model, verificările), salvată pe telefon sub
 * `trip:draft:<date>:<tripId>`, ca la plecare să rămână doar cifra de pasageri.
 *
 * Fără React și fără AsyncStorage importat aici — stocarea vine ca parametru
 * (`DraftStore`, pe care `AsyncStorage` îl satisface direct), ca să se poată testa cu
 * `node:test` și un store în memorie. Ciorna ține câmpurile raportului deja rezolvate
 * (reclamaOk / reclamaProblem / acStatus …), deci corpul pentru /report se construiește
 * din ciornă + cifră + GPS proaspăt (`bodyFromDraft`) și e identic cu `buildReportBody`
 * pentru aceeași stare (verificat în tripDraft.test.ts).
 */
import { buildReportBody, type Coords, type DriverPhotoState, type ReclamaChoice, type TripContext, type TripFormState } from './buildReport.ts';
import type { ClimateStatus, DriverPhotoResponse, ReclamaProblem, ReportBody } from './types';

export const DRAFT_PREFIX = 'trip:draft:';

/** Ce a spus modelul despre poză — copiate ca la `DriverPhotoState`, plus miniatura locală. */
export interface DraftVerdicts {
  verdict: Extract<DriverPhotoResponse['verdict'], 'OK' | 'EROARE'>;
  uniformOk: boolean | null;
  shavedOk: boolean | null;
  groomedOk: boolean | null;
  description: string;
}

export interface TripDraft {
  driverId: string | null;
  vehicleId: string | null;
  assignmentChanged: boolean;
  driverCheckId: string;
  verdicts: DraftVerdicts;
  /** Miniatura pozei (fișier local din cache) — poate lipsi după reinstalare; doar pentru afișare. */
  photoUri: string | null;
  loadingHelpOk: boolean;
  autoCurat: boolean;
  reclamaOk: boolean | null;
  reclamaProblem: ReclamaProblem | null;
  reclamaRepairConfirmed: boolean;
  reclamaTaskId: string | null;
  acStatus: ClimateStatus | null;
  heatStatus: ClimateStatus | null;
  /** ISO 8601, ora la care s-a apăsat «Pregătit, aștept plecarea». */
  preparedAt: string;
}

/** Subsetul din AsyncStorage pe care îl folosim; `AsyncStorage` îl satisface ca atare. */
export interface DraftStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

// ── Chei ─────────────────────────────────────────────────────────────────────

export function draftKey(date: string, tripId: string): string {
  return `${DRAFT_PREFIX}${date}:${tripId}`;
}

/** Cheile de ciornă care nu sunt din ziua `date` (ziua e a doua componentă a cheii). */
export function staleDraftKeys(keys: readonly string[], date: string): string[] {
  const keep = `${DRAFT_PREFIX}${date}:`;
  return keys.filter((k) => k.startsWith(DRAFT_PREFIX) && !k.startsWith(keep));
}

// ── Serializare ──────────────────────────────────────────────────────────────

const RECLAMA_PROBLEMS: readonly ReclamaProblem[] = ['bus', 'panou_ruta', 'ambele'];
const CLIMATE: readonly ClimateStatus[] = ['works', 'broken', 'none'];

function optString(v: unknown): string | null | undefined {
  return v === null ? null : typeof v === 'string' ? v : undefined;
}
function optBool(v: unknown): boolean | null | undefined {
  return v === null ? null : typeof v === 'boolean' ? v : undefined;
}
function oneOf<T extends string>(v: unknown, list: readonly T[]): T | null | undefined {
  return v === null ? null : list.includes(v as T) ? (v as T) : undefined;
}

/** Ciorna din JSON-ul stocat, sau null dacă lipsește ceva / e altă formă (aplicație veche). */
export function parseDraft(raw: unknown): TripDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const v = o.verdicts;
  if (!v || typeof v !== 'object') return null;
  const vo = v as Record<string, unknown>;
  if (vo.verdict !== 'OK' && vo.verdict !== 'EROARE') return null;
  const uniformOk = optBool(vo.uniformOk);
  const shavedOk = optBool(vo.shavedOk);
  const groomedOk = optBool(vo.groomedOk);
  if (uniformOk === undefined || shavedOk === undefined || groomedOk === undefined) return null;

  const driverId = optString(o.driverId);
  const vehicleId = optString(o.vehicleId);
  const reclamaOk = optBool(o.reclamaOk);
  const reclamaProblem = oneOf(o.reclamaProblem, RECLAMA_PROBLEMS);
  const reclamaTaskId = optString(o.reclamaTaskId);
  const acStatus = oneOf(o.acStatus, CLIMATE);
  const heatStatus = oneOf(o.heatStatus, CLIMATE);
  const photoUri = o.photoUri === undefined ? null : optString(o.photoUri);
  if (
    driverId === undefined ||
    vehicleId === undefined ||
    reclamaOk === undefined ||
    reclamaProblem === undefined ||
    reclamaTaskId === undefined ||
    acStatus === undefined ||
    heatStatus === undefined ||
    photoUri === undefined
  ) {
    return null;
  }
  if (typeof o.driverCheckId !== 'string' || !o.driverCheckId) return null;
  if (typeof o.assignmentChanged !== 'boolean' || typeof o.loadingHelpOk !== 'boolean' || typeof o.autoCurat !== 'boolean' || typeof o.reclamaRepairConfirmed !== 'boolean') return null;
  if (typeof o.preparedAt !== 'string' || Number.isNaN(Date.parse(o.preparedAt))) return null;

  return {
    driverId,
    vehicleId,
    assignmentChanged: o.assignmentChanged,
    driverCheckId: o.driverCheckId,
    verdicts: { verdict: vo.verdict, uniformOk, shavedOk, groomedOk, description: typeof vo.description === 'string' ? vo.description : '' },
    photoUri,
    loadingHelpOk: o.loadingHelpOk,
    autoCurat: o.autoCurat,
    reclamaOk,
    reclamaProblem,
    reclamaRepairConfirmed: o.reclamaRepairConfirmed,
    reclamaTaskId,
    acStatus,
    heatStatus,
    preparedAt: o.preparedAt,
  };
}

export function serializeDraft(draft: TripDraft): string {
  return JSON.stringify(draft);
}

// ── Stocare ──────────────────────────────────────────────────────────────────

export async function saveDraft(store: DraftStore, date: string, tripId: string, draft: TripDraft): Promise<void> {
  await store.setItem(draftKey(date, tripId), serializeDraft(draft));
}

/** Ciorna salvată pentru cursa `tripId` din ziua `date`; null dacă lipsește sau e stricată. */
export async function loadDraft(store: DraftStore, date: string, tripId: string): Promise<TripDraft | null> {
  try {
    const raw = await store.getItem(draftKey(date, tripId));
    return raw ? parseDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function clearDraft(store: DraftStore, date: string, tripId: string): Promise<void> {
  await store.removeItem(draftKey(date, tripId));
}

/** Ciornele din alte zile dispar (cheia conține data, deci nu se pot confunda; doar curățenie). */
export async function clearOtherDays(store: DraftStore, date: string): Promise<void> {
  const stale = staleDraftKeys(await store.getAllKeys(), date);
  if (stale.length) await store.multiRemove(stale);
}

// ── Formular ⇄ ciornă ⇄ corp ─────────────────────────────────────────────────

/**
 * Ciorna din starea formularului la «Pregătit» — câmpurile de calitate exact cum le-ar
 * trimite `buildReportBody` azi, plus verdictele și miniatura. Cere poza (etapa 1 nu se
 * închide fără ea); status-ul nu se salvează — Absent pleacă pe loc, fără ciornă.
 */
export function draftFromState(ctx: TripContext, state: TripFormState, preparedAt: Date): TripDraft | null {
  if (!state.photo) return null;
  const body = buildReportBody(ctx, { ...state, status: 'OK', passengers: 0 }, null);
  return {
    driverId: body.driverId,
    vehicleId: body.vehicleId,
    assignmentChanged: body.assignmentChanged,
    driverCheckId: state.photo.driverCheckId,
    verdicts: {
      verdict: state.photo.verdict,
      uniformOk: state.photo.uniformOk,
      shavedOk: state.photo.shavedOk,
      groomedOk: state.photo.groomedOk,
      description: state.photo.description,
    },
    photoUri: state.photo.uri || null,
    loadingHelpOk: body.loadingHelpOk ?? true,
    autoCurat: body.autoCurat ?? true,
    reclamaOk: body.reclamaOk,
    reclamaProblem: body.reclamaProblem,
    reclamaRepairConfirmed: body.reclamaRepairConfirmed,
    reclamaTaskId: body.reclamaTaskId,
    acStatus: body.acStatus,
    heatStatus: body.heatStatus,
    preparedAt: preparedAt.toISOString(),
  };
}

/** Starea formularului refăcută din ciornă («Modifică pregătirea» / deschiderea la pasul 2). */
export function formFromDraft(draft: TripDraft): TripFormState {
  const photo: DriverPhotoState = {
    driverCheckId: draft.driverCheckId,
    uri: draft.photoUri ?? '',
    verdict: draft.verdicts.verdict,
    uniformOk: draft.verdicts.uniformOk,
    shavedOk: draft.verdicts.shavedOk,
    groomedOk: draft.verdicts.groomedOk,
    description: draft.verdicts.description,
  };
  const reclama: ReclamaChoice = draft.reclamaOk === false && draft.reclamaProblem ? draft.reclamaProblem : 'ok';
  return {
    status: 'OK',
    passengers: null,
    driverId: draft.driverId,
    vehicleId: draft.vehicleId,
    photo,
    loadingHelpOk: draft.loadingHelpOk,
    autoCurat: draft.autoCurat,
    reclama,
    repair: draft.reclamaRepairConfirmed ? 'da' : null,
    climate: draft.acStatus ?? draft.heatStatus ?? 'works',
  };
}

/** `reports.exterior_ok` după regula botului (ca `exteriorOkOf`): bărbierit && aspect; null dacă vreunul lipsește. */
function exteriorOk(v: DraftVerdicts): boolean | null {
  if (v.shavedOk === null || v.groomedOk === null) return null;
  return v.shavedOk && v.groomedOk;
}

/** Corpul pentru POST /app/v1/report la plecare: ciorna + cifra + locația luată acum. */
export function bodyFromDraft(tripId: string, draft: TripDraft, passengers: number, coords: Coords | null): ReportBody {
  return {
    tripId,
    status: 'OK',
    passengersCount: passengers,
    driverId: draft.driverId,
    vehicleId: draft.vehicleId,
    assignmentChanged: draft.assignmentChanged,
    loadingHelpOk: draft.loadingHelpOk,
    autoCurat: draft.autoCurat,
    driverCheckId: draft.driverCheckId,
    uniformOk: draft.verdicts.uniformOk,
    exteriorOk: exteriorOk(draft.verdicts),
    reclamaOk: draft.reclamaOk,
    reclamaProblem: draft.reclamaProblem,
    reclamaRepairConfirmed: draft.reclamaRepairConfirmed,
    reclamaTaskId: draft.reclamaTaskId,
    acStatus: draft.acStatus,
    heatStatus: draft.heatStatus,
    lat: coords?.lat ?? null,
    lon: coords?.lon ?? null,
    accuracyM: coords?.accuracyM ?? null,
  };
}

// ── Rezumatul de la pasul 2 ──────────────────────────────────────────────────

function yesNo(v: boolean | null): string {
  return v === true ? 'da' : v === false ? 'nu' : 'necunoscut';
}

/** «HH:MM» local din ISO; gol dacă data e stricată. */
export function preparedHHMM(preparedAt: string): string {
  const d = new Date(preparedAt);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** «Ion Moldovan · LYY 735 · uniformă da · bărbierit da · pregătit 07:12». */
export function draftSummary(draft: TripDraft, names: { driverName: string | null; plate: string | null }): string {
  const parts = [names.driverName ?? 'Fără șofer', names.plate ?? 'Fără auto', `uniformă ${yesNo(draft.verdicts.uniformOk)}`, `bărbierit ${yesNo(draft.verdicts.shavedOk)}`];
  const at = preparedHHMM(draft.preparedAt);
  parts.push(at ? `pregătit ${at}` : 'pregătit');
  return parts.join(' · ');
}
