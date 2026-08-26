// Очередь уроков голосового агента: утренний дайджест pending-уроков админам с
// кнопками ✓/✗ и атомарное решение (образец claim-а — cancelScheduledProposal в
// admin/lib/update-prices.ts). Уроки создаёт ночной learner в apps/admin; здесь
// НЕТ LLM (на Railway намеренно нет ANTHROPIC_API_KEY) — только БД и Telegram.
import { getSupabase } from '../supabase.js';
import { getAdminChatIds, getBotApi, escapeHtml } from './adminAlert.js';

type LessonRow = {
  id: number;
  kind: 'alias' | 'prompt_lesson';
  summary: string;
  payload: { heard?: string; intended_ro?: string; quote?: string };
  conversation_id: string | null;
};

function lessonText(l: LessonRow): string {
  const tag = l.kind === 'alias' ? '📚 Алиас (голосовой агент)' : '🎓 Урок (голосовой агент)';
  let text = `${tag} #${l.id}\n${escapeHtml(l.summary)}`;
  const quote = l.payload?.quote;
  if (quote) text += `\n\n<i>${escapeHtml(String(quote).slice(0, 300))}</i>`;
  // Честно про эффект кнопки: урок промпта НЕ применяется автоматически
  // (правило канона: правки промпта — только код+эталон одним коммитом).
  text += l.kind === 'alias'
    ? '\n\n✓ — алиас включится в резолвер сразу.'
    : '\n\n✓ — в список правок промпта (применяется вручную).';
  return text;
}

/** Разослать pending-уроки админам. Возвращает число разосланных уроков. */
export async function sendVoiceLessonDigest(): Promise<number> {
  const api = getBotApi();
  if (!api) return 0;
  const supabase = getSupabase();
  const { data } = await supabase
    .from('voice_lessons')
    .select('id, kind, summary, payload, conversation_id')
    .eq('status', 'pending')
    .is('notified_at', null)
    .order('created_at', { ascending: true })
    .limit(20);
  const lessons = (data || []) as LessonRow[];
  if (lessons.length === 0) return 0;
  const admins = await getAdminChatIds();
  if (admins.size === 0) return 0;

  let sent = 0;
  for (const l of lessons) {
    // Claim ДО отправки — защита от двойной рассылки при рестартах Railway;
    // при полном провале отправки claim снимается, урок вернётся в следующий тик.
    const { data: claimed } = await supabase
      .from('voice_lessons')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', l.id)
      .is('notified_at', null)
      .select('id')
      .maybeSingle();
    if (!claimed) continue;
    let ok = 0;
    for (const chatId of admins) {
      try {
        await api.sendMessage(chatId, lessonText(l), {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '✓ Да', callback_data: `vl:ok:${l.id}` },
              { text: '✗ Нет', callback_data: `vl:no:${l.id}` },
            ]],
          },
        });
        ok++;
      } catch (err) {
        console.error(`Voice lesson #${l.id} → admin ${chatId} failed:`, err);
      }
    }
    if (ok === 0) {
      await supabase.from('voice_lessons').update({ notified_at: null }).eq('id', l.id);
      continue;
    }
    sent++;
  }
  return sent;
}

export type DecideResult = 'approved' | 'rejected' | 'already_approved' | 'already_rejected' | 'error';

/** Атомарное решение по уроку. Approve алиаса активирует его в voice_asr_aliases. */
export async function decideVoiceLesson(id: number, approve: boolean, decidedBy: number): Promise<DecideResult> {
  const supabase = getSupabase();
  const status = approve ? 'approved' : 'rejected';
  const { data: claimed, error } = await supabase
    .from('voice_lessons')
    .update({ status, decided_at: new Date().toISOString(), decided_by: decidedBy })
    .eq('id', id)
    .eq('status', 'pending')
    .select('kind, payload')
    .maybeSingle();
  if (error) {
    console.error('[voice-lessons] decide:', error.message);
    return 'error';
  }
  if (!claimed) {
    // Проиграли гонку другому админу — показываем, чем кончилось.
    const { data: row } = await supabase.from('voice_lessons').select('status').eq('id', id).maybeSingle();
    if (row?.status === 'approved') return 'already_approved';
    if (row?.status === 'rejected') return 'already_rejected';
    return 'error';
  }
  if (approve && claimed.kind === 'alias') {
    const p = (claimed.payload ?? {}) as { heard?: string; intended_ro?: string; quote?: string };
    if (p.heard && p.intended_ro) {
      // Между майнингом и ✓ проходят часы — цель могла исчезнуть из localities.
      const { data: loc } = await supabase
        .from('localities').select('id').eq('name_ro', p.intended_ro).eq('active', true).limit(1);
      if (!loc?.length) {
        console.error(`[voice-lessons] approve #${id}: «${p.intended_ro}» больше нет в localities — алиас не создан`);
        return 'approved';
      }
      const { error: insErr } = await supabase.from('voice_asr_aliases').insert({
        heard: p.heard,
        canonical_ro: p.intended_ro,
        source: 'human',
        evidence: { lesson_id: id, quote: String(p.quote ?? '').slice(0, 300) },
      });
      if (insErr) {
        if (insErr.code === '23505') {
          // heard уже есть (возможно деактивированный learner-ом) — решение
          // человека главнее: реактивируем с новой целью.
          await supabase
            .from('voice_asr_aliases')
            .update({ canonical_ro: p.intended_ro, active: true, source: 'human' })
            .eq('heard', p.heard);
        } else {
          console.error('[voice-lessons] alias insert:', insErr.message);
        }
      }
      // Ошибочный approve, накрывающий чужое село, гасит auditAliasShadow()
      // в admin (цикл voice-controller, ≤30 мин) — здесь key() не дублируем.
    }
  }
  return approve ? 'approved' : 'rejected';
}
