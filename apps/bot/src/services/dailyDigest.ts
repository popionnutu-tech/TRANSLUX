import { getBotApi, getAdminChatIds } from './adminAlert.js';
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
  messageIds: Record<string, number>; // chatId → messageId
}

const BUCKET = 'report-photos';

// ── Persistence via Supabase Storage ─────────────────

async function loadState(): Promise<DigestState> {
  const today = getTodayDate();
  try {
    const { data, error } = await getSupabase().storage
      .from(BUCKET)
      .download(`digest/${today}.json`);
    if (error || !data) return { date: today, violations: [], messageIds: {} };
    const text = await data.text();
    return JSON.parse(text);
  } catch {
    return { date: today, violations: [], messageIds: {} };
  }
}

async function saveState(state: DigestState): Promise<void> {
  const buf = Buffer.from(JSON.stringify(state));
  await getSupabase().storage
    .from(BUCKET)
    .upload(`digest/${state.date}.json`, buf, {
      contentType: 'application/json',
      upsert: true,
    });
}

// ── Public API ───────────────────────────────────────

export async function getViolationsCount(): Promise<number> {
  const state = await loadState();
  return state.violations.length;
}

/** Register a new violation and update the digest message */
export async function addViolationAndUpdate(v: Violation): Promise<void> {
  const state = await loadState();
  state.violations.push(v);
  await saveState(state);
  await sendOrEditDigest(state);
}

/** Manual trigger — resend/edit the current digest */
export async function updateDailyDigest(): Promise<void> {
  const state = await loadState();
  if (state.violations.length === 0) return;
  await sendOrEditDigest(state);
}

// ── Internal ─────────────────────────────────────────

async function sendOrEditDigest(state: DigestState): Promise<void> {
  const botApi = getBotApi();
  if (!botApi) return;
  const adminChatIds = await getAdminChatIds();
  if (adminChatIds.size === 0) return;
  if (state.violations.length === 0) return;

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
    // fallback
  }

  // Group violations by point
  const byPoint = new Map<string, string[]>();
  const violationsByPoint = new Map<string, number>();
  for (const v of state.violations) {
    const icons: string[] = [];
    const details: string[] = [];
    if (v.locationBad) {
      icons.push('📍');
      details.push(`${v.distanceM || '?'}m`);
    }
    if (v.late) {
      icons.push('⏰');
      details.push(`+${v.minutesLate} min`);
    }
    const line = `${icons.join('')} ${v.time} — ${v.operator} (${details.join(', ')})`;
    if (!byPoint.has(v.point)) byPoint.set(v.point, []);
    byPoint.get(v.point)!.push(line);
    violationsByPoint.set(v.point, (violationsByPoint.get(v.point) || 0) + 1);
  }

  // Build message with sections per point
  let body = '';
  for (const [point, lines] of byPoint) {
    lines.sort();
    const vCount = violationsByPoint.get(point) || 0;
    const rCount = reportsByPoint[point] || 0;
    body += `<b>${point}:</b>\n${lines.join('\n')}\n<i>${vCount} încălcări din ${rCount} rapoarte</i>\n\n`;
  }

  const totalViolations = state.violations.length;
  const totalReports = Object.values(reportsByPoint).reduce((a, b) => a + b, 0);

  const msg =
    `📋 <b>RAPORT ZILNIC — ${formatDate(today)}</b>\n\n` +
    `⚠️ Încălcări:\n\n` +
    body +
    `Total: <b>${totalViolations}</b> încălcări din <b>${totalReports}</b> rapoarte`;

  // Send or edit for each admin chat
  let stateChanged = false;
  for (const chatId of adminChatIds) {
    try {
      const existingMsgId = state.messageIds[String(chatId)];
      if (existingMsgId) {
        await botApi.editMessageText(chatId, existingMsgId, msg, { parse_mode: 'HTML' });
      } else {
        const sent = await botApi.sendMessage(chatId, msg, { parse_mode: 'HTML' });
        state.messageIds[String(chatId)] = sent.message_id;
        stateChanged = true;
      }
    } catch (err: any) {
      if (err?.description?.includes('message is not modified')) {
        // Same content, nothing to do
      } else {
        console.error(`Daily digest error for chat ${chatId}:`, err?.description || err);
        try {
          const sent = await botApi.sendMessage(chatId, msg, { parse_mode: 'HTML' });
          state.messageIds[String(chatId)] = sent.message_id;
          stateChanged = true;
        } catch (e) {
          console.error(`Daily digest fallback send failed:`, e);
        }
      }
    }
  }

  if (stateChanged) {
    await saveState(state);
  }
}
