import { sendAdminAlert } from './adminAlert.js';
import { formatDate, formatTime, getTodayDate } from '../utils.js';
import { getSupabase } from '../supabase.js';
import {
  getActiveAppOperators,
  getAllTripsForDirection,
  getCleaningChecksForDate,
  getDirectionForPoint,
  getPresencePings,
  getReportedPassengers,
  getSkipsForDate,
  type CleaningSlot,
  type CleaningZone,
} from './db.js';
import { formatPresenceLine, lateStart, localToUtcMs, presencePeriods, presenceWindow, windowBounds } from '../api/presence.js';
import { POINT_LABELS, type PointEnum } from '@translux/db';
import { isDayOff, weekdayName } from '../api/dayState.js';

const POINTS: readonly PointEnum[] = ['CHISINAU', 'BALTI'];

// ── Types ────────────────────────────────────────────
export interface Violation {
  time: string;        // HH:MM
  point: string;       // 'Chișinău' | 'Bălți'
  operator: string;    // @username or #telegram_id
  locationBad: boolean;
  distanceM: number | null;
  late: boolean;
  minutesLate: number;
}

interface DigestState {
  date: string;
  violations: Violation[];
}

const BUCKET = 'report-photos';

// ── Persistence via Supabase Storage ─────────────────

async function loadState(): Promise<DigestState> {
  const today = getTodayDate();
  try {
    const { data, error } = await getSupabase().storage
      .from(BUCKET)
      .download(`digest/${today}.json`);
    if (error || !data) {
      return { date: today, violations: [] };
    }
    const text = await data.text();
    const state = JSON.parse(text) as DigestState;
    return state;
  } catch {
    return { date: today, violations: [] };
  }
}

async function saveState(state: DigestState): Promise<void> {
  const json = JSON.stringify(state);
  const buf = Buffer.from(json);
  const path = `digest/${state.date}.json`;

  const { error } = await getSupabase().storage
    .from(BUCKET)
    .upload(path, buf, { contentType: 'application/json', upsert: true });

  if (error) {
    await getSupabase().storage.from(BUCKET).remove([path]);
    const { error: retryErr } = await getSupabase().storage
      .from(BUCKET)
      .upload(path, Buffer.from(json), { contentType: 'application/json' });
    if (retryErr) {
      console.error('Digest saveState retry error:', retryErr.message);
    }
  }
}

// ── Public API ───────────────────────────────────────

export async function getViolationsCount(): Promise<number> {
  const state = await loadState();
  return state.violations.length;
}

/** Register a new violation (accumulated, sent at end of day) */
export async function addViolation(v: Violation): Promise<void> {
  const state = await loadState();
  state.violations.push(v);
  await saveState(state);
}

/** Send compact daily digest at 20:30. Returns true if sent. */
export async function sendCompactDigest(): Promise<boolean> {
  const state = await loadState();
  const today = state.date;
  // Zi fără operator la punct (vineri la Chișinău): nu reclamăm poze și prezență lipsă degeaba.
  const dayOffPoints = new Set<PointEnum>(POINTS.filter((pt) => isDayOff(pt, today)));
  const dayOffLines = Array.from(dayOffPoints).map((pt) => `${POINT_LABELS[pt]}: ${weekdayName(today)}, zi fără operator`);
  const skipLines = await buildSkipLines(today);
  const cleaningLines = dayOffPoints.has('CHISINAU') ? [] : await buildCleaningLines(today);
  const presenceLines = await buildPresenceLines(today, new Date(), dayOffPoints);
  if (state.violations.length === 0 && dayOffLines.length === 0 && skipLines.length === 0 && cleaningLines.length === 0 && presenceLines.length === 0) return false;

  // Count total reports today from DB per point
  const reportsByPoint: Record<string, number> = {};
  try {
    for (const pt of ['CHISINAU', 'BALTI'] as const) {
      const { count } = await getSupabase()
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('report_date', today)
        .eq('point', pt)
        .is('cancelled_at', null);
      const label = pt === 'CHISINAU' ? 'Chișinău' : 'Bălți';
      reportsByPoint[label] = count || 0;
    }
  } catch {
    // fallback — counts stay 0
  }

  // Count violations by point and type
  const pointStats = new Map<string, { locatie: number; intarziere: number }>();
  for (const v of state.violations) {
    if (!pointStats.has(v.point)) pointStats.set(v.point, { locatie: 0, intarziere: 0 });
    const s = pointStats.get(v.point)!;
    if (v.locationBad) s.locatie++;
    if (v.late) s.intarziere++;
  }

  const totalViolations = state.violations.length;
  const totalReports = Object.values(reportsByPoint).reduce((a, b) => a + b, 0);

  const dd = today.slice(8, 10);
  const mm = today.slice(5, 7);

  let msg = `📋 Raport ${dd}.${mm} — ${totalViolations} încălcări din ${totalReports} rapoarte`;

  for (const [point, stats] of pointStats) {
    const total = stats.locatie + stats.intarziere;
    const parts: string[] = [];
    if (stats.locatie > 0) parts.push(`locație: ${stats.locatie}`);
    if (stats.intarziere > 0) parts.push(`întârziere: ${stats.intarziere}`);
    msg += `\n${point}: ${total} (${parts.join(', ')})`;
  }

  for (const line of dayOffLines) msg += `\n${line}`;

  if (skipLines.length > 0) {
    msg += `\n\n⏭ Curse sărite\n` + skipLines.join('\n');
  }

  if (cleaningLines.length > 0) {
    msg += `\n\n🧹 Curățenie Chișinău\n` + cleaningLines.join('\n');
  }

  if (presenceLines.length > 0) {
    msg += `\n\n📍 Prezență în zona de lucru\n` + presenceLines.join('\n');
  }

  await sendAdminAlert(msg);
  console.log(`Compact daily digest sent: ${totalViolations} violations`);
  return true;
}

// ── Cursele la care operatorul n-a fost (operator_trip_skips, migrația 332) ──

/**
 * Un rând per punct: «Chișinău: operatorul n-a fost la 06:55 (12 pas.), 07:35 (absent)
 * (Aurel)». Orele în ordinea plecării, cifra luată de la șofer lângă fiecare (Ion,
 * 10.09), numele operatorilor care au sărit (de obicei unul).
 */
async function buildSkipLines(date: string): Promise<string[]> {
  try {
    const skips = await getSkipsForDate(date);
    if (skips.length === 0) return [];
    const lines: string[] = [];
    for (const pt of POINTS) {
      const ofPoint = skips.filter((s) => s.point === pt);
      if (ofPoint.length === 0) continue;
      const trips = await getAllTripsForDirection(getDirectionForPoint(pt));
      const skipped = new Set(ofPoint.map((s) => s.trip_id));
      const reported = await getReportedPassengers(date, pt);
      const times = trips.filter((t) => skipped.has(t.id)).map((t) => {
        const r = reported.get(t.id);
        const figure = !r ? 'fără cifră' : r.status === 'ABSENT' ? 'absent' : r.passengers_count === -1 ? 'full' : `${r.passengers_count} pas.`;
        return `${formatTime(t.departure_time)} (${figure})`;
      });
      const names = Array.from(new Set(ofPoint.map((s) => s.user_name ?? '—')));
      lines.push(`${POINT_LABELS[pt]}: operatorul n-a fost la ${times.join(', ')} (${names.join(', ')})`);
    }
    return lines;
  } catch (err) {
    console.error('[digest] secțiunea curselor sărite a picat:', err);
    return [];
  }
}

// ── Curățenie peron Chișinău (poze la deschidere și la 15:00) ──

const CLEAN_SLOTS: CleaningSlot[] = ['DIMINEATA', 'ZIUA'];
const CLEAN_ZONES: CleaningZone[] = ['PERON', 'PIETONI', 'VECEU'];
const CLEAN_SLOT_LABEL: Record<CleaningSlot, string> = { DIMINEATA: 'dimineață', ZIUA: '15:00' };
const CLEAN_ZONE_LABEL: Record<CleaningZone, string> = { PERON: 'peron', PIETONI: 'pietoni', VECEU: 'veceu' };

/**
 * O linie pe tură: «dimineață: ✅ peron · 🔴 pietoni (praf pe pavaj) · ⬜ veceu lipsă».
 * Contează ultima poză a fiecărei zone; ALT_LOC neurmat de o poză bună = lipsă.
 */
async function buildCleaningLines(date: string): Promise<string[]> {
  let rows: Awaited<ReturnType<typeof getCleaningChecksForDate>>;
  try {
    rows = await getCleaningChecksForDate(date);
  } catch {
    return [];
  }
  const lines: string[] = [];
  for (const slot of CLEAN_SLOTS) {
    const parts: string[] = [];
    for (const zone of CLEAN_ZONES) {
      const last = rows.filter((r) => r.slot === slot && r.zone === zone).at(-1);
      const label = CLEAN_ZONE_LABEL[zone];
      if (!last || last.verdict === 'ALT_LOC') parts.push(`⬜ ${label} lipsă`);
      else if (last.verdict === 'CURAT') parts.push(`✅ ${label}`);
      else if (last.verdict === 'MURDAR') {
        const why = last.problems.length ? ` (${last.problems.slice(0, 2).join('; ')})` : '';
        parts.push(`🔴 ${label}${why}`);
      } else parts.push(`❔ ${label} neverificat`);
    }
    lines.push(`${CLEAN_SLOT_LABEL[slot]}: ${parts.join(' · ')}`);
  }
  return lines;
}

// ── Prezență în zona de lucru (GPS din aplicația de peron, S05) ──

/** @username, altfel #telegram_id, altfel id-ul — la fel ca `operator` din încălcări. */
function presenceOperatorLabel(u: { id: string; username: string | null; telegram_id: number | null }): string {
  return u.username ? `@${u.username}` : u.telegram_id ? `#${u.telegram_id}` : u.id;
}

/**
 * Un rând per operator care a folosit aplicația azi (ping-uri sau rapoarte din app):
 * perioadele de lipsă din zonă / fără semnal cu durata, sau «toată tura în zonă»;
 * plus «urmărire pornită abia la HH:MM» când primul ping vine la > 15 min după
 * începutul ferestrei. Nimic nu se trimite în timpul zilei — doar aici, seara.
 */
async function buildPresenceLines(date: string, now: Date = new Date(), skipPoints: ReadonlySet<PointEnum> = new Set()): Promise<string[]> {
  try {
    const dayFrom = new Date(localToUtcMs(date, '00:00')).toISOString();
    const dayTo = new Date(localToUtcMs(date, '23:59')).toISOString();
    const operators = (await getActiveAppOperators(date, dayFrom, dayTo)).filter((op) => !skipPoints.has(op.point));
    if (operators.length === 0) return [];

    const boundsByPoint = new Map<PointEnum, { fromMs: number; toMs: number } | null>();
    const lines: string[] = [];
    for (const op of operators) {
      if (!boundsByPoint.has(op.point)) {
        const window = presenceWindow(await getAllTripsForDirection(getDirectionForPoint(op.point)));
        boundsByPoint.set(op.point, window ? windowBounds(date, window) : null);
      }
      const bounds = boundsByPoint.get(op.point);
      if (!bounds) continue;
      const pings = await getPresencePings(op.id, new Date(bounds.fromMs).toISOString(), new Date(bounds.toMs).toISOString());
      const periods = presencePeriods(pings, bounds, now);
      lines.push(formatPresenceLine(presenceOperatorLabel(op), POINT_LABELS[op.point], periods, lateStart(pings, bounds)));
    }
    return lines;
  } catch (err) {
    console.error('[presence] digest: secțiunea de prezență a picat:', err);
    return [];
  }
}
