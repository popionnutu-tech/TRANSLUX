import { sendAdminAlert } from './adminAlert.js';
import { formatDate, getTodayDate } from '../utils.js';
import { getSupabase } from '../supabase.js';

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
  if (state.violations.length === 0) return false;

  const today = state.date;

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

  await sendAdminAlert(msg);
  console.log(`Compact daily digest sent: ${totalViolations} violations`);
  return true;
}
