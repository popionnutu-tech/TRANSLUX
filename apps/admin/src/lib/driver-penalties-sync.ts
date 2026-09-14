import { DRIVERS_GROUP_CONFIG_KEY } from '@translux/db';
import { getSupabase } from './supabase';
import { chisinauTodayIso } from './chisinau-time';
import { sendTelegramPhoto, deleteTelegramMessage } from './telegram-notify';
import {
  PENALTY,
  addDays,
  monthStartOf,
  penaltyCaption,
  previousWeekStart,
  weeklyReport,
  type AppearanceCheckRow,
  type DriverRef,
  type WeeklyReport,
} from './driver-penalties';
import { generatePenaltyImage } from './driver-penalties-image';

/**
 * Trimiterea imaginii săptămânale cu penalitățile de aspect în grupa șoferilor
 * (Ion, 14.09.2026). Chemată luni din cronul zilnic (copy-assignments) și, la
 * nevoie, din ruta /api/cron/driver-penalties cu ?week=… (retrimitere, prima
 * trimitere manuală).
 *
 * O săptămână = o imagine: dacă săptămâna a plecat deja, fără `force` nu se mai
 * trimite; cu `force` pleacă imaginea nouă și cea veche se șterge din grupă
 * (același tipar ca graficul Mejgorod).
 */

export interface SendPenaltiesOptions {
  /** luni a săptămânii; implicit săptămâna precedentă față de azi (Chișinău) */
  weekStart?: string;
  /** retrimite chiar dacă săptămâna a plecat deja */
  force?: boolean;
  chatId?: string | null;
}

export interface SendPenaltiesResult {
  status: 'sent' | 'skipped' | 'error';
  weekStart: string;
  reason?: string;
  messageId?: number | null;
  report?: Pick<WeeklyReport, 'weekEnd' | 'applied' | 'totals'> & { rows: number };
}

async function driversGroupChatId(): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from('app_config')
    .select('value')
    .eq('key', DRIVERS_GROUP_CONFIG_KEY)
    .maybeSingle();
  if (error) {
    console.error('driversGroupChatId:', error.message);
    return null;
  }
  return (data?.value ?? '').trim() || null;
}

/** Șoferii care apar pe imagine: activi, nu LDE (camioanele n-au poză la peron). */
export async function loadPenaltyDrivers(): Promise<DriverRef[]> {
  const { data, error } = await getSupabase()
    .from('drivers')
    .select('id, full_name')
    .eq('active', true)
    .or('is_lde.is.null,is_lde.eq.false')
    .order('full_name');
  if (error) throw new Error(`drivers: ${error.message}`);
  return (data ?? []).map(d => ({ id: d.id as string, full_name: (d.full_name as string) ?? '' }));
}

/**
 * Pozele de la min(APPLY_FROM, începutul lunii) până la sfârșitul săptămânii —
 * multiplicatorul are nevoie de toată istoria de la 01.10, coloana lunii de luna
 * curentă. PostgREST taie la 1000 rânduri: se citește pe pagini.
 */
export async function loadAppearanceChecks(from: string, to: string): Promise<AppearanceCheckRow[]> {
  const db = getSupabase();
  const page = 1000;
  const out: AppearanceCheckRow[] = [];
  for (let offset = 0; ; offset += page) {
    const { data, error } = await db
      .from('driver_appearance_checks')
      .select('driver_id, check_date, uniform_ok, groomed_ok, created_at')
      .gte('check_date', from)
      .lte('check_date', to)
      .not('driver_id', 'is', null)
      .order('check_date')
      .order('created_at')
      .range(offset, offset + page - 1);
    if (error) throw new Error(`driver_appearance_checks: ${error.message}`);
    const rows = (data ?? []) as AppearanceCheckRow[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

export async function buildWeeklyPenaltyReport(weekStart: string): Promise<WeeklyReport> {
  const weekEnd = addDays(weekStart, 6);
  const monthStart = monthStartOf(weekEnd);
  const from = monthStart < PENALTY.APPLY_FROM ? monthStart : PENALTY.APPLY_FROM;
  const [drivers, checks] = await Promise.all([loadPenaltyDrivers(), loadAppearanceChecks(from, weekEnd)]);
  return weeklyReport(drivers, checks, weekStart);
}

export async function sendWeeklyDriverPenalties(opts: SendPenaltiesOptions = {}): Promise<SendPenaltiesResult> {
  const weekStart = opts.weekStart ?? previousWeekStart(chisinauTodayIso());
  const db = getSupabase();

  const { data: prevRow } = await db
    .from('driver_penalty_posts')
    .select('send_count, telegram_message_id')
    .eq('week_start', weekStart)
    .maybeSingle();
  const prev = prevRow as { send_count?: number; telegram_message_id?: number | null } | null;
  if (prev && !opts.force) {
    return { status: 'skipped', weekStart, reason: 'săptămâna a fost deja trimisă' };
  }

  const chatId = opts.chatId ?? (await driversGroupChatId());
  if (!chatId) return { status: 'error', weekStart, reason: 'grupa șoferilor nu e legată (/lega_reclamatii)' };

  let report: WeeklyReport;
  try {
    report = await buildWeeklyPenaltyReport(weekStart);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('sendWeeklyDriverPenalties: report failed:', msg);
    return { status: 'error', weekStart, reason: msg };
  }
  if (report.totals.driversWithPhotos === 0) {
    // Nicio poză toată săptămâna (aplicația n-a mers, operatorul n-a lucrat):
    // o imagine plină de «—» ar spune șoferilor că nu-i verifică nimeni.
    return { status: 'skipped', weekStart, reason: 'nicio poză în săptămâna asta' };
  }

  let png: Buffer;
  try {
    png = await generatePenaltyImage(report);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('sendWeeklyDriverPenalties: image failed:', msg);
    return { status: 'error', weekStart, reason: `imaginea nu s-a generat: ${msg}` };
  }

  const sent = await sendTelegramPhoto(chatId, png, penaltyCaption(report), `aspect-${weekStart}.png`);
  if (!sent.ok) return { status: 'error', weekStart, reason: 'Telegram nu a primit imaginea' };

  // Întâi pleacă imaginea nouă, apoi se șterge cea veche (o săptămână = o imagine).
  const prevMessageId = prev?.telegram_message_id ?? null;
  if (prevMessageId && prevMessageId !== sent.messageId) {
    const deleted = await deleteTelegramMessage(chatId, prevMessageId);
    if (!deleted) console.error(`sendWeeklyDriverPenalties ${weekStart}: imaginea precedentă (msg ${prevMessageId}) nu s-a șters`);
  }

  const { error } = await db.from('driver_penalty_posts').upsert(
    {
      week_start: weekStart,
      sent_at: new Date().toISOString(),
      telegram_message_id: sent.messageId,
      send_count: (prev?.send_count ?? 0) + 1,
      rows_count: report.rows.length,
      violators_count: report.totals.driversWithViolations,
      total_lei: report.totals.weekLei,
      applied: report.applied,
      snapshot: report.rows,
    },
    { onConflict: 'week_start' },
  );
  if (error) console.error('sendWeeklyDriverPenalties: post log failed:', error.message);

  return {
    status: 'sent',
    weekStart,
    messageId: sent.messageId,
    report: { weekEnd: report.weekEnd, applied: report.applied, totals: report.totals, rows: report.rows.length },
  };
}
