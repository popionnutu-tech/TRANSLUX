import type { Api } from 'grammy';
import { getSupabase } from '../supabase.js';

const db = () => getSupabase();

// Telegram-Api инстанс бота (как adminAlert) — чтобы постить в группу и получать message_id.
let api: Api | null = null;
export function initTaskBoard(botApi: Api): void {
  api = botApi;
}

// Нетерминальные состояния = «активная задача».
const ACTIVE_STATES = [
  'created', 'sent', 'delivered', 'accepted', 'in_progress',
  'report_pending', 'overdue', 'overdue_responded',
];

/** Активный пользователь с ролью DIGITAL (Vlad). */
export async function getDigitalUser(): Promise<{ id: string; name: string | null } | null> {
  const { data } = await db()
    .from('users')
    .select('id, name')
    .eq('role', 'DIGITAL')
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; name: string | null } | null) ?? null;
}

/** Привязать группу к задачам исполнителя (upsert). */
export async function bindTaskBoard(chatId: number, assigneeId: string): Promise<void> {
  await db()
    .from('task_board_bindings')
    .upsert({ chat_id: chatId, assignee_id: assigneeId }, { onConflict: 'chat_id' });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatTask(o: {
  title: string | null; description: string; current_deadline: string;
}): string {
  const title = (o.title || o.description || '').slice(0, 80);
  const deadline = o.current_deadline
    ? new Date(o.current_deadline).toLocaleString('ro-RO', {
        timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : '';
  const lines = ['📋 <b>Sarcină Vlad</b>', `<b>${escapeHtml(title)}</b>`];
  if (o.description && o.description !== title) lines.push(escapeHtml(o.description));
  if (deadline) lines.push(`⏰ termen: ${deadline}`);
  return lines.join('\n');
}

/**
 * Сверка: для каждой привязки группа→исполнитель выкладывает в группу
 * каждую активную задачу исполнителя, которой там ещё нет (одно сообщение на задачу).
 * Источник задачи не важен (бот или админка) — ловятся все. Возвращает число выложенных.
 */
export async function sweepTaskBoards(): Promise<number> {
  if (!api) return 0;
  const { data: bindings } = await db().from('task_board_bindings').select('chat_id, assignee_id');
  if (!bindings || bindings.length === 0) return 0;

  let posted = 0;
  for (const b of bindings as Array<{ chat_id: number; assignee_id: string }>) {
    const { data: tasks } = await db()
      .from('obligations')
      .select('id, title, description, current_deadline, current_state')
      .eq('assignee_id', b.assignee_id)
      .in('current_state', ACTIVE_STATES)
      .order('created_at', { ascending: true });
    if (!tasks || tasks.length === 0) continue;

    const ids = (tasks as Array<{ id: string }>).map((t) => t.id);
    const { data: already } = await db()
      .from('task_board_posts')
      .select('obligation_id')
      .eq('chat_id', b.chat_id)
      .in('obligation_id', ids);
    const postedSet = new Set((already ?? []).map((p: { obligation_id: string }) => p.obligation_id));

    for (const t of tasks as Array<{ id: string; title: string | null; description: string; current_deadline: string }>) {
      if (postedSet.has(t.id)) continue;

      // «Застолбить» ДО отправки — анти-дубль при перехлёсте двух прогонов (деплой).
      const { error: claimErr } = await db()
        .from('task_board_posts')
        .insert({ obligation_id: t.id, chat_id: b.chat_id, message_id: null });
      if (claimErr) continue; // уже застолбил другой прогон

      try {
        const msg = await api.sendMessage(Number(b.chat_id), formatTask(t), {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
        await db().from('task_board_posts')
          .update({ message_id: msg.message_id })
          .eq('obligation_id', t.id)
          .eq('chat_id', b.chat_id);
        posted++;
      } catch (e) {
        // Отправка не удалась (бота убрали из группы и т.п.) — снимаем «столб», чтобы повторить позже.
        await db().from('task_board_posts')
          .delete()
          .eq('obligation_id', t.id)
          .eq('chat_id', b.chat_id);
        console.error('taskBoard send failed:', (e as { message?: string })?.message ?? e);
      }
    }
  }
  return posted;
}
