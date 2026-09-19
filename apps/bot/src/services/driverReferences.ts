// Pozele de referință ale șoferului (migr. 381): copii permanente ale pozelor
// acceptate la peron, în report-photos/soferi-referinta/<driver>/<check>.jpg.
// Ștergerea după 30 de zile (photoRetention.ts) nu le atinge — umblă doar la
// storage_key din tabelele de verificări.
//
// Două căi prin care o poză devine referință:
//   * la peron (driverPhoto.ts → maybeAddReference): poza de azi confirmată «da»
//     sigur, când șoferul are sub MAX_REFERENCES referințe sau cea mai nouă are
//     peste REFERENCE_REFRESH_DAYS zile — referințele se împrospătează, dar nu
//     zilnic. Peste MAX, cea mai veche iese (fișier + rând).
//   * noaptea (refreshDriverReferences, scheduler 03:20): șoferii activi fără
//     referințe primesc din pozele lor deja existente (Ion: «deja multe zile
//     avem»). Pozele se compară ÎNTRE ELE — fiecare candidat cu celelalte — și
//     intră doar cele confirmate «da»: dacă un operator a pus deja alt om în
//     vreo poză, aceea nu ajunge etalon. O singură poză → intră singură, marcată
//     'single'. Niciuna nu se potrivește cu celelalte → adminul e anunțat, fără
//     referințe. Șoferii deveniți inactivi își pierd referințele (nu ținem fața
//     nimănui degeaba).
import type { DriverReferencePhoto } from '@translux/db';
import { sendAdminAlert, escapeHtml } from './adminAlert.js';
import {
  deleteDriverReferences,
  getUsableDriverPhotos,
  insertDriverReference,
  listActiveDrivers,
  listDriverReferences,
  listReferencedDriverIds,
  type UsableDriverPhoto,
} from './db.js';
import { compareDriverIdentity, isReferenceWorthy } from './driverIdentity.js';
import { copyReportPhoto, downloadReportPhoto, removeReportPhotos } from './photoStorage.js';

export const MAX_REFERENCES = 4;
export const REFERENCE_REFRESH_DAYS = 7;
/** Câte poze vechi (zile diferite) intră în comparația inițială. */
export const BOOTSTRAP_CANDIDATES = 5;

export const REFERENCE_PREFIX = 'soferi-referinta';

export function referenceStorageKey(driverId: string, checkId: string): string {
  return `${REFERENCE_PREFIX}/${driverId}/${checkId}.jpg`;
}

export interface ReferenceImage {
  ref: DriverReferencePhoto;
  base64: string;
}

/** Descarcă fișierele referințelor; cele lipsă din bucket se sar (și se scriu în jurnal). */
export async function loadReferenceImages(refs: DriverReferencePhoto[]): Promise<ReferenceImage[]> {
  const out: ReferenceImage[] = [];
  for (const ref of refs) {
    const buf = await downloadReportPhoto(ref.storage_key);
    if (!buf) {
      console.warn(`[driver-ref] lipsește din bucket: ${ref.storage_key}`);
      continue;
    }
    out.push({ ref, base64: buf.toString('base64') });
  }
  return out;
}

export interface ReferenceSource {
  id: string;
  storage_key: string;
  check_date: string;
}

/**
 * Copiază poza la referințe și scrie rândul; peste MAX_REFERENCES, cele mai vechi
 * ies. Nu aruncă: o referință nepusă nu strică poza de la peron.
 */
export async function addDriverReference(
  driverId: string,
  check: ReferenceSource,
  source: DriverReferencePhoto['source'],
): Promise<boolean> {
  const key = referenceStorageKey(driverId, check.id);
  try {
    const copied = await copyReportPhoto(check.storage_key, key);
    if (!copied) return false;
    await insertDriverReference({ driver_id: driverId, storage_key: key, source_check_id: check.id, check_date: check.check_date, source });
    await pruneReferences(driverId);
    return true;
  } catch (err) {
    console.error(`[driver-ref] adăugarea referinței ${key} a picat:`, err);
    return false;
  }
}

/** Ține cel mult MAX_REFERENCES, cele mai noi. */
async function pruneReferences(driverId: string): Promise<void> {
  const refs = await listDriverReferences(driverId); // check_date desc
  const extra = refs.slice(MAX_REFERENCES);
  if (extra.length === 0) return;
  await removeReportPhotos(extra.map((r) => r.storage_key));
  await deleteDriverReferences(extra.map((r) => r.id));
}

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000);
}

/** Poza de azi confirmată intră la referințe dacă sunt puține sau vechi. */
export function referenceNeedsRefresh(refs: DriverReferencePhoto[], today: string): boolean {
  if (refs.length < MAX_REFERENCES) return true;
  const newest = refs.reduce((a, b) => (a.check_date >= b.check_date ? a : b));
  return daysBetween(newest.check_date, today) >= REFERENCE_REFRESH_DAYS;
}

export async function maybeAddReference(driverId: string, refs: DriverReferencePhoto[], check: ReferenceSource): Promise<void> {
  // Aceeași zi nu intră de două ori (o poză pe zi per șofer, dar operatorul poate reface).
  if (refs.some((r) => r.check_date === check.check_date)) return;
  if (!referenceNeedsRefresh(refs, check.check_date)) return;
  await addDriverReference(driverId, check, 'match');
}

// ── Prima încărcare din pozele existente ─────────────────────────────────────

/** Cel mult una pe zi, cele mai noi zile primele. */
export function pickBootstrapCandidates(photos: UsableDriverPhoto[], max = BOOTSTRAP_CANDIDATES): UsableDriverPhoto[] {
  const byDay = new Map<string, UsableDriverPhoto>();
  for (const p of [...photos].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
    if (!byDay.has(p.check_date)) byDay.set(p.check_date, p);
  }
  return [...byDay.values()].slice(0, max);
}

export interface BootstrapOutcome {
  driverId: string;
  candidates: number;
  added: number;
  /** Nicio poză nu s-a potrivit cu celelalte (posibil oameni diferiți). */
  conflict: boolean;
}

/** Referințele unui șofer din pozele lui vechi, comparate între ele. */
export async function bootstrapDriverReferences(driverId: string): Promise<BootstrapOutcome> {
  const candidates = pickBootstrapCandidates(await getUsableDriverPhotos(driverId, 40));
  const outcome: BootstrapOutcome = { driverId, candidates: candidates.length, added: 0, conflict: false };
  if (candidates.length === 0) return outcome;

  const images: Array<{ photo: UsableDriverPhoto; base64: string }> = [];
  for (const photo of candidates) {
    const buf = await downloadReportPhoto(photo.storage_key);
    if (buf) images.push({ photo, base64: buf.toString('base64') });
  }
  if (images.length === 0) return outcome;

  if (images.length === 1) {
    if (await addDriverReference(driverId, images[0].photo, 'single')) outcome.added = 1;
    return outcome;
  }

  // Fiecare candidat contra celorlalți: intră doar cele confirmate «da».
  const matched: UsableDriverPhoto[] = [];
  for (const cand of images) {
    const others = images.filter((o) => o !== cand).map((o) => o.base64);
    const result = await compareDriverIdentity(others, cand.base64);
    if (result.verdict === 'OK') {
      console.log(`[driver-ref] bootstrap ${driverId.slice(0, 8)} ${cand.photo.check_date} → ${result.same} (${result.confidence.toFixed(2)}): ${result.reason}`);
    } else {
      console.warn(`[driver-ref] bootstrap ${driverId.slice(0, 8)} ${cand.photo.check_date} → EROARE: ${result.description}`);
    }
    if (isReferenceWorthy(result)) matched.push(cand.photo);
  }
  if (matched.length === 0) {
    outcome.conflict = true;
    return outcome;
  }
  // Cele mai noi primele; addDriverReference taie peste MAX.
  matched.sort((a, b) => (a.check_date < b.check_date ? 1 : -1));
  for (const photo of matched.slice(0, MAX_REFERENCES)) {
    if (await addDriverReference(driverId, photo, 'bootstrap')) outcome.added++;
  }
  return outcome;
}

export interface RefreshStats {
  bootstrapped: number;
  conflicts: number;
  skipped: number;
  retired: number;
}

/**
 * Rularea de noapte: șoferii activi fără referințe primesc din pozele vechi;
 * șoferii inactivi își pierd referințele. Nu aruncă per șofer — un șofer picat nu-i
 * oprește pe ceilalți.
 */
export async function refreshDriverReferences(): Promise<RefreshStats> {
  const stats: RefreshStats = { bootstrapped: 0, conflicts: 0, skipped: 0, retired: 0 };
  const drivers = await listActiveDrivers();
  const activeIds = new Set(drivers.map((d) => d.id));
  const referenced = await listReferencedDriverIds();

  const conflicts: string[] = [];
  for (const d of drivers) {
    if (referenced.has(d.id)) continue;
    try {
      const o = await bootstrapDriverReferences(d.id);
      if (o.candidates === 0) stats.skipped++;
      else if (o.conflict) {
        stats.conflicts++;
        conflicts.push(`${d.full_name} (${o.candidates} poze)`);
      } else if (o.added > 0) stats.bootstrapped++;
    } catch (err) {
      console.error(`[driver-ref] bootstrap ${d.full_name} a picat:`, err);
    }
  }

  for (const driverId of referenced) {
    if (activeIds.has(driverId)) continue;
    try {
      const refs = await listDriverReferences(driverId);
      await removeReportPhotos(refs.map((r) => r.storage_key));
      await deleteDriverReferences(refs.map((r) => r.id));
      stats.retired++;
    } catch (err) {
      console.error(`[driver-ref] ștergerea referințelor ${driverId} a picat:`, err);
    }
  }

  if (conflicts.length > 0) {
    await sendAdminAlert(
      `👤 <b>Referințe șoferi</b>\nPozele de la peron nu se potrivesc între ele (posibil oameni diferiți în poze) — fără referință până nu se verifică:\n` +
        conflicts.map((c) => `• ${escapeHtml(c)}`).join('\n'),
    );
  }
  return stats;
}
