import { getSupabase } from '../supabase.js';
import { getBotApi, getAdminChatIds } from './adminAlert.js';
import { getTodayDate, formatTime } from '../utils.js';
import { POINT_DIRECTION_MAP } from '@translux/db';

// Live "loading board" for Chișinău: a single editable Telegram message per day,
// pushed to admin chats. Grows one row per reported cursă (sorted by departure
// time) and compares each cursă with the same cursă exactly 7 days earlier.

const BUCKET = 'report-photos';

const WEEKDAYS_RO = [
  'duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă',
];

interface BoardState {
  date: string;                       // YYYY-MM-DD
  messages: Record<string, number>;   // chatId -> Telegram message_id
}

interface Row {
  tripId: string;
  time: string;        // HH:MM
  status: string;      // 'OK' | 'ABSENT'
  pax: number | null;  // raw passengers_count
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

async function loadReports(date: string): Promise<Row[]> {
  const { data } = await getSupabase()
    .from('reports')
    .select('trip_id, passengers_count, status, trips!inner(departure_time)')
    .eq('report_date', date)
    .eq('point', 'CHISINAU')
    .is('cancelled_at', null);

  const rows: Row[] = (data || []).map((r: any) => ({
    tripId: r.trip_id,
    time: formatTime(r.trips.departure_time),
    status: r.status,
    pax: r.passengers_count,
  }));
  rows.sort((a, b) => a.time.localeCompare(b.time));
  return rows;
}

/**
 * Count of scheduled (active) curse departing from Chișinău — the "programate" denominator.
 * The board covers the single interurban route Chișinău–Nord, which runs the SAME timetable
 * every weekday (confirmed by owner 2026-06-08). `trips` has no day-of-week field, and the app
 * only weekday-filters suburban routes (via crm_route_schedules), never interurban — so a flat
 * active-trip count is the correct daily denominator here.
 */
async function loadScheduledCount(): Promise<number> {
  const { count } = await getSupabase()
    .from('trips')
    .select('*', { count: 'exact', head: true })
    .eq('direction', POINT_DIRECTION_MAP['CHISINAU'])
    .eq('active', true);
  return count ?? 0;
}

function buildText(date: string, today: Row[], lastWeek: Row[], scheduledCount: number): string {
  const lastMap = new Map<string, number | null>();
  for (const r of lastWeek) lastMap.set(r.tripId, paxValue(r));

  const header =
    `🚌 Chișinău — ${weekdayRo(date)} ${ddmm(date)}\n` +
    `vs aceeași zi acum o săptămână (${ddmm(minus7(date))})`;

  const lines: string[] = [];
  let totalToday = 0;
  let totalLast = 0;
  let hasLastTotal = false;

  for (const r of today) {
    const tv = paxValue(r);
    if (tv === null) {
      lines.push(`${r.time} — ${r.status === 'ABSENT' ? 'absent' : 'full'}`);
      continue;
    }
    totalToday += tv;

    const m = lastMap.get(r.tripId);
    if (m == null) {
      lines.push(`${r.time} — ${tv} pas.  (era —)`);
    } else {
      totalLast += m;
      hasLastTotal = true;
      lines.push(`${r.time} — ${tv} pas.  ${delta(tv, m)}  (era ${m})`);
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

async function loadState(date: string): Promise<BoardState> {
  try {
    const { data, error } = await getSupabase().storage
      .from(BUCKET)
      .download(`loading-board/${date}.json`);
    if (error || !data) return { date, messages: {} };
    return JSON.parse(await data.text()) as BoardState;
  } catch {
    return { date, messages: {} };
  }
}

async function saveState(state: BoardState): Promise<void> {
  const path = `loading-board/${state.date}.json`;
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
 * Rebuild the Chișinău loading board from the database and push it to every
 * admin chat (send once, then edit the same message on every later update).
 * Call after each Chișinău report is saved. Safe to call repeatedly.
 */
export async function updateLoadingBoard(): Promise<void> {
  const api = getBotApi();
  if (!api) return;

  const adminChatIds = await getAdminChatIds();
  if (adminChatIds.size === 0) return;

  const date = getTodayDate();
  const [todayRows, lastWeekRows, scheduledCount] = await Promise.all([
    loadReports(date),
    loadReports(minus7(date)),
    loadScheduledCount(),
  ]);
  if (todayRows.length === 0) return;

  const text = buildText(date, todayRows, lastWeekRows, scheduledCount);

  const state = await loadState(date);
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

  if (changed) await saveState(state);
}
