import { getSupabase } from '../supabase.js';
import { getBotApi, getAdminChatIds } from './adminAlert.js';
import { getTodayDate, formatTime } from '../utils.js';
import { POINT_DIRECTION_MAP, type PointEnum } from '@translux/db';

// Live "loading board": a single editable Telegram message per day per point,
// pushed to admin chats. Grows one row per reported cursă (sorted by departure
// time) and compares each cursă with the same cursă exactly 7 days earlier.
// Two boards: Chișinău (departures from Chișinău) and Bălți (buses arriving from
// the north, en route to Chișinău — each row also shows the northern origin town
// and its north departure time, stored on trips.nord_town / trips.nord_departure).

const BUCKET = 'report-photos';

// Title + storage folder per point. Chișinău keeps its original folder so today's
// in-flight message stays editable across this change.
const BOARD_TITLE: Record<PointEnum, string> = {
  CHISINAU: '🚌 Chișinău',
  BALTI: '🚌 Bălți → Chișinău',
};
const STATE_DIR: Record<PointEnum, string> = {
  CHISINAU: 'loading-board',
  BALTI: 'loading-board-balti',
};

const WEEKDAYS_RO = [
  'duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă',
];

interface BoardState {
  date: string;                       // YYYY-MM-DD
  messages: Record<string, number>;   // chatId -> Telegram message_id
}

interface Row {
  tripId: string;
  time: string;        // HH:MM (departure from this point)
  status: string;      // 'OK' | 'ABSENT'
  pax: number | null;  // raw passengers_count
  nordTown: string | null;  // northern origin town (Bălți board only)
  nordDep: string | null;   // north departure time "HH:MM" (Bălți board only)
}

function ddmm(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

function weekdayRo(date: string): string {
  return WEEKDAYS_RO[new Date(date + 'T12:00:00').getDay()];
}

function minus7(date: string): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Passenger count if the cursă actually carried people, else null (absent/full). */
function paxValue(r: Row): number | null {
  if (r.status === 'OK' && r.pax != null && r.pax >= 0) return r.pax;
  return null;
}

function delta(today: number, last: number): string {
  const d = today - last;
  if (d > 0) return `▲ +${d}`;
  if (d < 0) return `▼ -${Math.abs(d)}`;
  return '= 0';
}

async function loadReports(date: string, point: PointEnum): Promise<Row[]> {
  const { data } = await getSupabase()
    .from('reports')
    .select('trip_id, passengers_count, status, trips!inner(departure_time, nord_town, nord_departure)')
    .eq('report_date', date)
    .eq('point', point)
    .is('cancelled_at', null);

  const rows: Row[] = (data || []).map((r: any) => ({
    tripId: r.trip_id,
    time: formatTime(r.trips.departure_time),
    status: r.status,
    pax: r.passengers_count,
    nordTown: r.trips.nord_town ?? null,
    nordDep: r.trips.nord_departure ?? null,
  }));
  rows.sort((a, b) => a.time.localeCompare(b.time));
  return rows;
}

/**
 * Count of scheduled (active) curse departing from this point — the "programate" denominator.
 * Interurban routes run the SAME timetable every weekday (confirmed by owner 2026-06-08).
 * `trips` has no day-of-week field, and the app only weekday-filters suburban routes
 * (via crm_route_schedules), never interurban — so a flat active-trip count is correct.
 */
async function loadScheduledCount(point: PointEnum): Promise<number> {
  const { count } = await getSupabase()
    .from('trips')
    .select('*', { count: 'exact', head: true })
    .eq('direction', POINT_DIRECTION_MAP[point])
    .eq('active', true);
  return count ?? 0;
}

function buildText(date: string, today: Row[], lastWeek: Row[], scheduledCount: number, point: PointEnum): string {
  const showNord = point === 'BALTI';
  const lastMap = new Map<string, number | null>();
  for (const r of lastWeek) lastMap.set(r.tripId, paxValue(r));

  const header =
    `${BOARD_TITLE[point]} — ${weekdayRo(date)} ${ddmm(date)}\n` +
    `vs aceeași zi acum o săptămână (${ddmm(minus7(date))})`;

  const lines: string[] = [];
  let totalToday = 0;
  let totalLast = 0;
  let hasLastTotal = false;

  for (const r of today) {
    // Bălți rows are prefixed with the northern origin (town + north departure).
    const label = showNord && r.nordTown
      ? `${r.time} · ${r.nordTown}${r.nordDep ? ` (plecat ${r.nordDep})` : ''}`
      : r.time;

    const tv = paxValue(r);
    if (tv === null) {
      lines.push(`${label} — ${r.status === 'ABSENT' ? 'absent' : 'full'}`);
      continue;
    }
    totalToday += tv;

    const m = lastMap.get(r.tripId);
    if (m == null) {
      lines.push(`${label} — ${tv} pas.  (era —)`);
    } else {
      totalLast += m;
      hasLastTotal = true;
      lines.push(`${label} — ${tv} pas.  ${delta(tv, m)}  (era ${m})`);
    }
  }

  let totalLine = `Total: ${totalToday} pas.`;
  if (hasLastTotal) {
    totalLine += `  ${delta(totalToday, totalLast)}  (era ${totalLast})`;
  }

  // Summary (today only): efectuate/programate · absent · media pasageri per cursă numărată.
  const ranCount = today.filter((r) => r.status !== 'ABSENT').length; // ran = not absent (incl. "full")
  const absentCount = today.filter((r) => r.status === 'ABSENT').length;
  // media denominator: only curse with a real headcount. "Full" buses are stored as OK + pax=-1
  // (paxValue → null), so they ran but are intentionally excluded here — media can be < ranCount.
  const countedCount = today.filter((r) => paxValue(r) !== null).length;

  const curseLine =
    `Curse: ${scheduledCount > 0 ? `${ranCount}/${scheduledCount}` : ranCount}` +
    ` · ${absentCount} absent`;
  const summaryLines = [curseLine];
  if (countedCount > 0) {
    summaryLines.push(`Media: ${Math.round(totalToday / countedCount)} pas./cursă`);
  }

  return `${header}\n\n${lines.join('\n')}\n\n${totalLine}\n${summaryLines.join('\n')}`;
}

async function loadState(date: string, point: PointEnum): Promise<BoardState> {
  try {
    const { data, error } = await getSupabase().storage
      .from(BUCKET)
      .download(`${STATE_DIR[point]}/${date}.json`);
    if (error || !data) return { date, messages: {} };
    return JSON.parse(await data.text()) as BoardState;
  } catch {
    return { date, messages: {} };
  }
}

async function saveState(state: BoardState, point: PointEnum): Promise<void> {
  const path = `${STATE_DIR[point]}/${state.date}.json`;
  const json = JSON.stringify(state);

  const { error } = await getSupabase().storage
    .from(BUCKET)
    .upload(path, Buffer.from(json), { contentType: 'application/json', upsert: true });

  if (error) {
    await getSupabase().storage.from(BUCKET).remove([path]);
    const { error: retryErr } = await getSupabase().storage
      .from(BUCKET)
      .upload(path, Buffer.from(json), { contentType: 'application/json' });
    if (retryErr) console.error('Loading board saveState retry error:', retryErr.message);
  }
}

/**
 * Rebuild the loading board for one point from the database and push it to every
 * admin chat (send once, then edit the same message on every later update).
 * Call after each report for that point is saved. Safe to call repeatedly.
 */
async function updateBoard(point: PointEnum): Promise<void> {
  const api = getBotApi();
  if (!api) return;

  const adminChatIds = await getAdminChatIds();
  if (adminChatIds.size === 0) return;

  const date = getTodayDate();
  const [todayRows, lastWeekRows, scheduledCount] = await Promise.all([
    loadReports(date, point),
    loadReports(minus7(date), point),
    loadScheduledCount(point),
  ]);
  if (todayRows.length === 0) return;

  const text = buildText(date, todayRows, lastWeekRows, scheduledCount, point);

  const state = await loadState(date, point);
  let changed = false;

  for (const chatId of adminChatIds) {
    const key = String(chatId);
    const messageId = state.messages[key];

    if (messageId) {
      try {
        await api.editMessageText(chatId, messageId, text);
      } catch (err: any) {
        const desc: string = err?.description || err?.message || '';
        if (desc.includes('message is not modified')) {
          // identical content — nothing to do
        } else if (
          desc.includes('message to edit not found') ||
          desc.includes("message can't be edited") ||
          desc.includes('MESSAGE_ID_INVALID')
        ) {
          try {
            const sent = await api.sendMessage(chatId, text);
            state.messages[key] = sent.message_id;
            changed = true;
          } catch (e) {
            console.error(`Loading board resend failed for ${chatId}:`, e);
          }
        } else {
          console.error(`Loading board edit failed for ${chatId}:`, desc);
        }
      }
    } else {
      try {
        const sent = await api.sendMessage(chatId, text);
        state.messages[key] = sent.message_id;
        changed = true;
      } catch (e) {
        console.error(`Loading board send failed for ${chatId}:`, e);
      }
    }
  }

  if (changed) await saveState(state, point);
}

/** Chișinău loading board — call after each Chișinău report is saved. */
export async function updateLoadingBoard(): Promise<void> {
  return updateBoard('CHISINAU');
}

/** Bălți loading board (buses from the north → Chișinău) — call after each Bălți report. */
export async function updateLoadingBoardBalti(): Promise<void> {
  return updateBoard('BALTI');
}
