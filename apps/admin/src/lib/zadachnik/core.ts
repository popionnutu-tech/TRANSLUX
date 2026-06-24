import { getSupabase } from '@/lib/supabase';

// Ядро задачника (порт из TLX, этап A): создание задачи, переходы состояний, журнал, уведомления.
// Доступ к таблицам obligations* ТОЛЬКО через service-role (RLS deny-all). Уведомления — прямой вызов
// Telegram Bot API (бот-процесс не нужен). Будильники (scheduled_actions) пишутся, исполняет крон (этап B).

export type ObligationState =
  | 'created' | 'sent' | 'delivered' | 'accepted' | 'in_progress' | 'report_pending'
  | 'resolved' | 'rejected' | 'cancelled' | 'overdue' | 'overdue_responded' | 'ignored' | 'failed';

export interface Obligation {
  id: string;
  creator_id: string;
  assignee_id: string;
  title: string | null;
  description: string;
  points: number;
  original_deadline: string;
  current_deadline: string;
  current_state: ObligationState;
  rework_used: boolean;
  attachments: unknown;
  source: string | null;
  vehicle_plate: string | null;
  estimated_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attempt {
  id: string;
  number: number;
  report_text: string | null;
  verdict: 'pending' | 'accepted' | 'rejected' | 'rework';
  manager_comment: string | null;
  submitted_at: string;
  decided_at: string | null;
}

const ACTIVE_STATES: ObligationState[] = ['sent', 'delivered', 'accepted', 'in_progress'];
const NONTERMINAL: ObligationState[] = [
  'created', 'sent', 'delivered', 'accepted', 'in_progress', 'report_pending', 'overdue', 'overdue_responded',
];

export function fmtDeadline(iso: string): string {
  return new Intl.DateTimeFormat('ro-RO', {
    timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

/** Завтра 18:00 по Кишинёву (для нового дедлайна при доработке; рабочие дни — этап B). */
function nextDay18ISO(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Chisinau', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = +parts.find((p) => p.type === 'year')!.value;
  const m = +parts.find((p) => p.type === 'month')!.value;
  const d = +parts.find((p) => p.type === 'day')!.value;
  // следующий календарный день, 18:00 Кишинёв = 15:00 UTC (летом UTC+3); считаем явно через смещение
  const next = new Date(Date.UTC(y, m - 1, d + 1, 15, 0, 0));
  return next.toISOString();
}

/** Смещение Кишинёва (мин) с учётом лета/зимы. */
function chisinauOffsetMin(d: Date): number {
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Chisinau', timeZoneName: 'shortOffset' })
    .formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || 'GMT+3';
  const mt = tz.match(/GMT([+-]?\d+)(?::(\d+))?/);
  if (!mt) return 180;
  const h = parseInt(mt[1], 10);
  const mm = mt[2] ? parseInt(mt[2], 10) : 0;
  return h * 60 + (h < 0 ? -mm : mm);
}
/** Сегодня в Кишинёве в HH:MM → ISO (UTC). */
function chisinauTodayISO(hhmm: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Chisinau', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = +parts.find((p) => p.type === 'year')!.value;
  const mo = +parts.find((p) => p.type === 'month')!.value;
  const d = +parts.find((p) => p.type === 'day')!.value;
  const [hh, mi] = hhmm.split(':').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, hh, mi));
  return new Date(guess.getTime() - chisinauOffsetMin(guess) * 60000).toISOString();
}
/** Срабатывает ли шаблон сегодня (по дню недели Кишинёва). */
function recurringFiresToday(period: 'daily' | 'mon_fri' | 'custom', weekDays: number[] | null | undefined): boolean {
  const wd = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' })).getDay();
  if (period === 'daily') return true;
  if (period === 'mon_fri') return wd >= 1 && wd <= 5;
  return Array.isArray(weekDays) && weekDays.includes(wd);
}

export async function notify(telegramId: number | null | undefined, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !telegramId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(4000), // зависший Telegram не должен валить роут (504)
    });
  } catch (e) {
    console.error('zadachnik notify error:', e);
  }
}

export async function logEvent(
  obligationId: string | null, eventType: string, actorId: string | null, data: Record<string, unknown> = {}
): Promise<void> {
  await getSupabase().from('obligation_events').insert({
    obligation_id: obligationId, event_type: eventType, actor_id: actorId, data,
  });
}

async function telegramOf(userId: string): Promise<number | null> {
  const { data } = await getSupabase().from('users').select('telegram_id').eq('id', userId).maybeSingle();
  return (data?.telegram_id as number) ?? null;
}

export async function getObligation(id: string): Promise<Obligation | null> {
  const { data } = await getSupabase().from('obligations').select('*').eq('id', id).maybeSingle();
  return (data as Obligation) ?? null;
}

// ── создание ──
export async function createTask(input: {
  creatorId: string; assigneeId: string; title: string | null; description: string; points: number; deadline: string;
}): Promise<Obligation> {
  const db = getSupabase();
  const { data, error } = await db.from('obligations').insert({
    creator_id: input.creatorId, assignee_id: input.assigneeId,
    title: input.title, description: input.description, points: input.points,
    original_deadline: input.deadline, current_deadline: input.deadline,
    current_state: 'sent',
  }).select('*').single();
  if (error || !data) throw new Error(error?.message || 'create failed');
  const ob = data as Obligation;
  await logEvent(ob.id, 'created', input.creatorId);
  await logEvent(ob.id, 'sent', input.creatorId);
  await notify(
    await telegramOf(input.assigneeId),
    `📋 <b>Sarcină nouă</b>\n${input.title ?? input.description.slice(0, 60)}\n⏰ ${fmtDeadline(input.deadline)} · 💯 ${input.points} pct\n\nDeschide «Задачник» în meniul botului ca s-o accepți.`
  );
  return ob;
}

// ── переход с гардом по состоянию ──
async function transition(
  ob: Obligation, allowed: ObligationState[], to: ObligationState, actorId: string | null, patch: Record<string, unknown> = {}
): Promise<boolean> {
  if (!allowed.includes(ob.current_state)) return false;
  const { data } = await getSupabase()
    .from('obligations')
    .update({ current_state: to, ...patch })
    .eq('id', ob.id)
    .in('current_state', allowed)
    .select('id')
    .maybeSingle();
  return !!data;
}

// ── действия исполнителя ──
export async function acceptTask(ob: Obligation, actorId: string, estimatedDate?: string | null): Promise<void> {
  if (['accepted', 'in_progress', 'report_pending'].includes(ob.current_state)) return; // идемпотентно
  const patch = estimatedDate ? { estimated_date: estimatedDate } : {};
  if (await transition(ob, ['sent', 'delivered'], 'accepted', actorId, patch)) {
    await logEvent(ob.id, 'accepted_by_user', actorId, estimatedDate ? { estimated_date: estimatedDate } : {});
  }
}

export async function startTask(ob: Obligation, actorId: string): Promise<void> {
  if (await transition(ob, ['accepted'], 'in_progress', actorId)) {
    await logEvent(ob.id, 'started', actorId);
  }
}

export async function submitReport(ob: Obligation, actorId: string, text: string): Promise<void> {
  const db = getSupabase();
  const { data: last } = await db.from('obligation_attempts').select('number')
    .eq('obligation_id', ob.id).order('number', { ascending: false }).limit(1).maybeSingle();
  const number = ((last?.number as number) ?? 0) + 1;
  if (!(await transition(ob, ['accepted', 'in_progress'], 'report_pending', actorId))) return;
  const { error: aerr } = await db.from('obligation_attempts').insert({ obligation_id: ob.id, number, report_text: text, verdict: 'pending' });
  if (aerr) console.error('zadachnik attempt insert error:', aerr.message);
  await logEvent(ob.id, 'report_submitted', actorId, { attempt_number: number });
  await notify(await telegramOf(ob.creator_id), `📤 <b>Raport depus</b>\n${ob.title ?? ob.description.slice(0, 60)}\nDeschide «Задачник» ca să decizi.`);
}

// ── действия постановщика (по report_pending) ──
async function decideLastAttempt(obId: string, verdict: 'accepted' | 'rejected' | 'rework', comment: string | null) {
  const db = getSupabase();
  const { data: last } = await db.from('obligation_attempts').select('id')
    .eq('obligation_id', obId).order('number', { ascending: false }).limit(1).maybeSingle();
  if (last?.id) {
    await db.from('obligation_attempts').update({ verdict, manager_comment: comment, decided_at: new Date().toISOString() }).eq('id', last.id);
  }
}

export async function approveTask(ob: Obligation, actorId: string, comment: string | null): Promise<void> {
  if (!(await transition(ob, ['report_pending'], 'resolved', actorId))) return;
  await decideLastAttempt(ob.id, 'accepted', comment);
  await logEvent(ob.id, 'approved', actorId, { comment });
  await notify(await telegramOf(ob.assignee_id), `✅ <b>Sarcină acceptată</b>\n${ob.title ?? ob.description.slice(0, 60)}\n+${ob.points} pct${comment ? `\n${comment}` : ''}`);
}

export async function rejectTask(ob: Obligation, actorId: string, comment: string | null): Promise<void> {
  if (!(await transition(ob, ['report_pending'], 'rejected', actorId))) return;
  await decideLastAttempt(ob.id, 'rejected', comment);
  await logEvent(ob.id, 'rejected', actorId, { comment });
  await notify(await telegramOf(ob.assignee_id), `❌ <b>Raport respins</b>\n${ob.title ?? ob.description.slice(0, 60)}${comment ? `\n${comment}` : ''}`);
}

export async function reworkTask(ob: Obligation, actorId: string, comment: string | null): Promise<boolean> {
  if (ob.rework_used) return false;
  const newDeadline = nextDay18ISO();
  if (!(await transition(ob, ['report_pending'], 'in_progress', actorId, { rework_used: true, current_deadline: newDeadline }))) return false;
  await decideLastAttempt(ob.id, 'rework', comment);
  await logEvent(ob.id, 'rework_requested', actorId, { comment, new_deadline: newDeadline });
  await notify(await telegramOf(ob.assignee_id), `🔁 <b>Înapoi la refacere</b>\n${ob.title ?? ob.description.slice(0, 60)}\n⏰ termen nou: ${fmtDeadline(newDeadline)}${comment ? `\n${comment}` : ''}`);
  return true;
}

export async function cancelTask(ob: Obligation, actorId: string): Promise<void> {
  if (!(await transition(ob, NONTERMINAL, 'cancelled', actorId))) return;
  await logEvent(ob.id, 'cancelled', actorId);
  await notify(await telegramOf(ob.assignee_id), `🚫 Sarcina a fost anulată de conducere.\n${ob.title ?? ob.description.slice(0, 60)}`);
}

// ── списки ──
export async function listForAdmin(): Promise<Obligation[]> {
  const { data } = await getSupabase().from('obligations').select('*').order('current_deadline', { ascending: true });
  return (data as Obligation[]) ?? [];
}

export async function listForAssignee(assigneeId: string, bucket: 'active' | 'history'): Promise<Obligation[]> {
  const states = bucket === 'history'
    ? ['resolved', 'rejected', 'cancelled', 'ignored', 'failed']
    : ['sent', 'delivered', 'accepted', 'in_progress', 'report_pending', 'overdue', 'overdue_responded'];
  const { data } = await getSupabase().from('obligations').select('*')
    .eq('assignee_id', assigneeId).in('current_state', states)
    .order('current_deadline', { ascending: true });
  return (data as Obligation[]) ?? [];
}

// ── повторяющиеся задачи (шаблоны) — этап D-2 ──
const WEEKDAY_SHORT = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ']; // JS getDay(): 0=Вс..6=Сб
export function weekdaysLabel(days: number[] | null | undefined): string {
  return (days ?? []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY_SHORT[d] ?? String(d)).join(', ');
}

export interface RecurringTemplate {
  id: string; creator_id: string; assignee_id: string; title: string | null;
  description: string; points: number; period: 'daily' | 'mon_fri' | 'custom';
  deadline_time: string; week_days: number[] | null; active: boolean; last_generated_date: string | null; created_at: string;
}

export async function createRecurringTemplate(input: {
  creatorId: string; assigneeId: string; title: string | null; description: string;
  points: number; period: 'daily' | 'mon_fri' | 'custom'; deadlineTime: string; weekDays?: number[] | null;
}): Promise<RecurringTemplate> {
  const { data, error } = await getSupabase().from('recurring_task_templates').insert({
    creator_id: input.creatorId, assignee_id: input.assigneeId, title: input.title,
    description: input.description, points: input.points, period: input.period,
    deadline_time: input.deadlineTime, week_days: input.period === 'custom' ? (input.weekDays ?? []) : null,
    active: true,
  }).select('*').single();
  if (error || !data) throw new Error(error?.message || 'create failed');
  const periodLabel = input.period === 'daily' ? 'Zilnic'
    : input.period === 'mon_fri' ? 'Luni–Vineri'
    : weekdaysLabel(input.weekDays);
  await notify(
    await telegramOf(input.assigneeId),
    `🔁 <b>Sarcină recurentă</b>\n${input.title ?? input.description.slice(0, 60)}\n${periodLabel} · până ${input.deadlineTime} · 💯 ${input.points} pct\nApare automat.`
  );
  const tpl = data as RecurringTemplate;
  // Dacă șablonul se potrivește azi, generăm sarcina de azi imediat (altfel ar aștepta rularea de la 07:00).
  if (recurringFiresToday(input.period, input.weekDays)) {
    const todayYMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau' }).format(new Date());
    if (tpl.last_generated_date !== todayYMD) {
      await createTask({
        creatorId: input.creatorId, assigneeId: input.assigneeId,
        title: input.title, description: input.description, points: input.points,
        deadline: chisinauTodayISO(input.deadlineTime),
      });
      await getSupabase().from('recurring_task_templates').update({ last_generated_date: todayYMD }).eq('id', tpl.id);
    }
  }
  return tpl;
}

export async function listRecurring(): Promise<RecurringTemplate[]> {
  const { data } = await getSupabase().from('recurring_task_templates')
    .select('*').eq('active', true).order('created_at', { ascending: false });
  return (data as RecurringTemplate[]) ?? [];
}

export async function stopRecurring(id: string): Promise<void> {
  await getSupabase().from('recurring_task_templates').update({ active: false }).eq('id', id);
}

export { ACTIVE_STATES };
