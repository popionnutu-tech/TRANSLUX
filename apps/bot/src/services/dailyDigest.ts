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
    if (error || !data) {
      console.log('Digest loadState: no file or error:', error?.message);
      return { date: today, violations: [], messageIds: {} };
    }
    const text = await data.text();
    const state = JSON.parse(text) as DigestState;
    console.log(`Digest loadState: ${state.violations?.length || 0} violations, messageIds: ${JSON.stringify(state.messageIds)}`);
    return state;
  } catch (e) {
    console.error('Digest loadState exception:', e);
    return { date: today, violations: [], messageIds: {} };
  }
}

async function saveState(state: DigestState): Promise<void> {
  const json = JSON.stringify(state);
  const buf = Buffer.from(json);
  const path = `digest/${state.date}.json`;

  // Try upsert first
  const { error } = await getSupabase().storage
    .from(BUCKET)
    .upload(path, buf, { contentType: 'application/json', upsert: true });

  if (error) {
    console.error('Digest saveState upsert error:', error.message);
    // Fallback: delete then upload
    await getSupabase().storage.from(BUCKET).remove([path]);
    const { error: retryErr } = await getSupabase().storage
      .from(BUCKET)
      .upload(path, Buffer.from(json), { contentType: 'application/json' });
    if (retryErr) {
      console.error('Digest saveState retry error:', retryErr.message);
    } else {
      console.log('Digest saveState: saved via delete+upload fallback');
    }
  } else {
    console.log(`Digest saveState: saved ${state.violations.length} violations`);
  }
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
      const desc = err?.description || '';
      if (desc.includes('message is not modified')) {
        // Same content, nothing to do
      } else if (desc.includes('message to edit not found') || desc.includes('MESSAGE_ID_INVALID')) {
        // Old message was deleted — send new one
        console.log(`Digest: old message gone for chat ${chatId}, sending new`);
        try {
          const sent = await botApi.sendMessage(chatId, msg, { parse_mode: 'HTML' });
          state.messageIds[String(chatId)] = sent.message_id;
          stateChanged = true;
        } catch (e) {
          console.error(`Daily digest fallback send failed:`, e);
        }
      } else {
        // Transient error — do NOT send a new message to avoid duplicates
        console.error(`Daily digest edit error for chat ${chatId}:`, desc || err);
      }
    }
  }

  if (stateChanged) {
    await saveState(state);
  }
}
