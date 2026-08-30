// Экзамены: регрессионные тесты агента в ElevenLabs (Ion «fa tot», 26.08).
// Реестр — таблица voice_agent_tests (не canon: канон — эталон конфига, не kv).
// Эмпирика пробы 26.08 (3 одноразовых теста, удалены):
//  - в unit-тестах (llm/tool) вебхук-тулы НЕ исполняются — платформа мокает
//    («Skipping tool call in test mode»): боевые таблицы и вебхуки чистые;
//  - путь параметра в tool-тесте — с префиксом body.<param> (голый path и
//    request_body.<param> дают «not found»);
//  - agent_config_override применяет промпт-кандидат НЕ сохраняя (тест-маркер
//    «portocaliu» прошёл). Ночной прогон идёт БЕЗ override: семантика полного
//    replace может подставить дефолты вместо живого конфига — кандидата гоняет
//    только scripts/voice-agent/run-tests.mjs, отправляя ВЕСЬ живой конфиг.
// Незавершённый прогон живёт incident-ом kind='exam_invocation' (healed=false);
// дочитывание — атомарный claim по healed (судья и controller не столкнутся).
import { getSupabase } from '@/lib/supabase';
import { AGENT_ID, elGet, elPost } from '@/lib/voice/el';
import { alertAdmins, escapeHtml } from '@/lib/telegram-notify';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type TestRow = {
  test_id: string;
  name: string;
  source: 'seed' | 'lesson';
  lesson_id: number | null;
  fail_streak: number;
  active: boolean;
};

// Единственный источник нормализации цитат (voice-judge импортирует отсюда — обратное
// направление дало бы цикл). Пунктуация вычищается: диктовка номера теперь с точками
// (phone-spoken, 30.08), а LLM при цитировании склонен «причёсывать» их.
export const normText = (s: string) => s.toLowerCase().replace(/[.,;:!?…]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Тест из одобренного урока: история звонка ДО реплики-провала (обрезка по
 * payload.quote), success_condition из поправки клиента. Чистая функция.
 * Цитата не нашлась в транскрипте → null, тест не создаётся.
 */
export function buildLessonTest(
  lesson: { id: number; payload: Record<string, unknown>; summary: string },
  transcript: unknown,
): Record<string, unknown> | null {
  const quote = String(lesson.payload.quote ?? '');
  if (!quote) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const turns: any[] = Array.isArray(transcript) ? transcript : [];
  const q = normText(quote);
  // Как у якоря судьи (quoteInText): после чистки пунктуации цитата из одних точек
  // давала бы q='' и includes('') → ложный срез по первой реплике.
  if (q.length < 8) return null;
  let cutIdx = -1;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t.role === 'agent' && t.message && normText(String(t.message)).includes(q)) { cutIdx = i; break; }
  }
  if (cutIdx <= 0) return null;
  const history = turns
    .slice(0, cutIdx)
    .filter((t) => (t.role === 'user' || t.role === 'agent') && t.message)
    .slice(-40)
    .map((t, i) => ({ role: t.role, time_in_call_secs: i, message: String(t.message).slice(0, 1000) }));
  // История для llm-теста обязана кончаться репликой клиента — судится СЛЕДУЮЩИЙ ответ.
  while (history.length > 0 && history[history.length - 1].role !== 'user') history.pop();
  if (history.length === 0) return null;
  const corrected = String(lesson.payload.what_client_corrected ?? lesson.summary).slice(0, 400);
  const wrong = String(lesson.payload.what_agent_did ?? quote).slice(0, 400);
  return {
    type: 'llm',
    name: `TLX lesson #${lesson.id}`,
    chat_history: history,
    success_condition: `The agent's next reply must NOT repeat the past mistake. Correct behavior (from a real reviewed call): ${corrected}. The reply fails if it resembles the failure example. Return True only if the reply is correct.`,
    failure_examples: [{ type: 'failure', response: wrong }],
    success_examples: [{ type: 'success', response: `(comportament corect: ${corrected})` }],
  };
}

/** ✓-уроки без теста → создать тест в EL (лимит 3/ночь, под дедлайном). */
export async function generateLessonTests(deadlineTs: number): Promise<number> {
  const supabase = getSupabase();
  // Судейские уроки НЕ становятся экзаменами: их правила уже покрыты seed-набором,
  // а шаблон без what_client_corrected даёт грейдеру слабый материал (ревью).
  const { data } = await supabase.from('voice_lessons')
    .select('id, conversation_id, payload, summary')
    .eq('kind', 'prompt_lesson').eq('status', 'approved')
    .is('payload->>test_id', null)
    .not('conversation_id', 'is', null)
    .or('payload->>source.is.null,payload->>source.neq.judge')
    .order('decided_at', { ascending: true })
    .limit(3);
  let created = 0;
  for (const lesson of (data || []) as { id: number; conversation_id: string; payload: Record<string, unknown>; summary: string }[]) {
    // Стоимость итерации (elPost 15 c) входит в дедлайн, не только её старт.
    if (Date.now() + 15_000 > deadlineTs) break;
    const { data: call } = await supabase.from('voice_calls')
      .select('transcript').eq('conversation_id', lesson.conversation_id).maybeSingle();
    const body = call ? buildLessonTest(lesson, call.transcript) : null;
    if (!body) {
      // Транскрипта/цитаты нет — помечаем, чтобы не пытаться каждую ночь.
      await supabase.from('voice_lessons')
        .update({ payload: { ...lesson.payload, test_id: 'untestable' } }).eq('id', lesson.id);
      continue;
    }
    try {
      const res = await elPost('/v1/convai/agent-testing/create', body);
      const testId = String((res as { id?: string }).id ?? '');
      if (!testId) continue;
      await supabase.from('voice_lessons')
        .update({ payload: { ...lesson.payload, test_id: testId } }).eq('id', lesson.id);
      await supabase.from('voice_agent_tests').insert({
        test_id: testId, name: `TLX lesson #${lesson.id}`, source: 'lesson', lesson_id: lesson.id,
      });
      created++;
    } catch (err) {
      console.error(`[voice-exams] create test for lesson #${lesson.id}:`, err);
    }
  }
  return created;
}

/** Старт ночного прогона всех активных тестов. Прошлый ещё висит → не стартуем. */
export async function startExams(deadlineTs: number): Promise<boolean> {
  if (Date.now() > deadlineTs) return false; // преамбула не имеет права съесть ночь судьи
  const supabase = getSupabase();
  const { data: pending } = await supabase.from('voice_controller_incidents')
    .select('id').eq('kind', 'exam_invocation').eq('healed', false).limit(1);
  if (pending?.length) return false;
  const { data: tests } = await supabase.from('voice_agent_tests')
    .select('test_id').eq('active', true);
  const ids = ((tests || []) as { test_id: string }[]).map((t) => t.test_id);
  if (ids.length === 0) return false;
  const res = await elPost(`/v1/convai/agents/${AGENT_ID}/run-tests`, {
    tests: ids.map((test_id) => ({ test_id })),
  });
  const invId = String((res as { id?: string }).id ?? '');
  if (!invId) return false;
  await supabase.from('voice_controller_incidents').insert({
    kind: 'exam_invocation', healed: false, details: { invocation_id: invId, test_count: ids.length },
  });
  return true;
}

export type ExamOutcome = {
  done: boolean;
  passed: string[];
  failed: { test_id: string; name: string; rationale: string }[];
};

/** Дочитать висящий прогон до дедлайна. Завершён → атомарный claim (healed=true). */
export async function pollExams(deadlineTs: number): Promise<ExamOutcome> {
  const none: ExamOutcome = { done: false, passed: [], failed: [] };
  const supabase = getSupabase();
  const { data: rows } = await supabase.from('voice_controller_incidents')
    .select('id, created_at, details').eq('kind', 'exam_invocation').eq('healed', false)
    .order('created_at', { ascending: false }).limit(1);
  const row = rows?.[0] as { id: number; created_at: string; details: { invocation_id?: string } } | undefined;
  const invId = row?.details?.invocation_id;
  if (!row || !invId) return none;
  // Зависший навсегда прогон не должен блокировать следующие ночи.
  if (Date.now() - new Date(row.created_at).getTime() > 24 * 3600 * 1000) {
    const { data: claimed } = await supabase.from('voice_controller_incidents')
      .update({ healed: true }).eq('id', row.id).eq('healed', false).select('id').maybeSingle();
    if (claimed) {
      await supabase.from('voice_controller_incidents').insert({
        kind: 'exam_stuck', healed: false, details: { invocation_id: invId },
      });
    }
    return none;
  }
  while (Date.now() < deadlineTs) {
    // elGet обязан жить в остатке бюджета: жёсткие 10 c переваливали дедлайн и
    // могли съесть результат вместе с уже потраченным claim-ом (perf-ревью).
    const left = deadlineTs - Date.now();
    if (left < 1500) break;
    let inv: Record<string, unknown>;
    try {
      inv = await elGet(`/v1/convai/test-invocations/${invId}`, Math.min(8000, left));
    } catch {
      return none;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runs: any[] = (inv as any).test_runs ?? [];
    // Завершённость — ТОЛЬКО явный терминальный набор. Незнакомый промежуточный
    // статус (queued/running) не должен закрывать прогон как «всё зелено» (ревью I4).
    const settled = runs.length > 0 && runs.every((r) => r.status === 'passed' || r.status === 'failed');
    if (settled) {
      const { data: claimed } = await supabase.from('voice_controller_incidents')
        .update({ healed: true }).eq('id', row.id).eq('healed', false).select('id').maybeSingle();
      if (!claimed) return none; // дочитал кто-то другой (судья vs controller)
      return {
        done: true,
        passed: runs.filter((r) => r.status === 'passed').map((r) => String(r.test_id)),
        failed: runs.filter((r) => r.status === 'failed').map((r) => ({
          test_id: String(r.test_id),
          name: String(r.test_name ?? r.metadata?.test_name ?? r.test_id),
          rationale: String(r.condition_result?.rationale?.summary ?? '').slice(0, 300),
        })),
      };
    }
    if (Date.now() + 4000 > deadlineTs) break;
    await sleep(4000);
  }
  return none;
}

/** Итог прогона: fail_streak, инциденты; алерт — только после 2 провалов подряд
 *  (LLM-грейдеры флапают; одиночный провал — лишь в журнал). 5 провалов подряд
 *  выводят тест из ротации (active=false) — кривой тест не звонит вечно.
 *  opts.alert=false — контекст контролёра: он лечит МОЛЧА (распоряжение Иона
 *  23.08), поэтому шлёт только журнал; алерты уходят из судьи. */
export async function reportExamOutcome(out: ExamOutcome, opts?: { alert?: boolean }): Promise<void> {
  if (!out.done) return;
  const supabase = getSupabase();
  if (out.passed.length > 0) {
    await supabase.from('voice_agent_tests')
      .update({ fail_streak: 0 }).in('test_id', out.passed).gt('fail_streak', 0);
  }
  if (out.failed.length === 0) return;
  const ids = out.failed.map((f) => f.test_id);
  const { data: rows } = await supabase.from('voice_agent_tests')
    .select('test_id, fail_streak').in('test_id', ids);
  const streaks = new Map(((rows || []) as { test_id: string; fail_streak: number }[])
    .map((r) => [r.test_id, r.fail_streak]));
  const alertable: typeof out.failed = [];
  const retired: string[] = [];
  for (const f of out.failed) {
    const next = (streaks.get(f.test_id) ?? 0) + 1;
    const patch: Record<string, unknown> = { fail_streak: next };
    if (next >= 5) { patch.active = false; retired.push(f.name); }
    await supabase.from('voice_agent_tests').update(patch).eq('test_id', f.test_id);
    const { data: recent } = await supabase.from('voice_controller_incidents')
      .select('id').eq('kind', 'exam_failed').eq('details->>test_id', f.test_id)
      .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()).limit(1);
    if (!recent?.length) {
      await supabase.from('voice_controller_incidents').insert({
        kind: 'exam_failed', healed: false,
        details: { test_id: f.test_id, name: f.name, rationale: f.rationale, streak: next },
      });
    }
    if (next >= 2) alertable.push(f);
  }
  if (opts?.alert && alertable.length > 0) {
    const lines = alertable.map((f) => `• ${escapeHtml(f.name)}: ${escapeHtml(f.rationale)}`);
    const tail = retired.length ? `\nСняты с ротации (5 провалов подряд): ${escapeHtml(retired.join(', '))}` : '';
    await alertAdmins(`🎓 <b>Экзамены агента: провалы 2 ночи подряд</b>\n${lines.join('\n')}${tail}`);
  }
}

/** Для runVoiceController (каждые 30 мин): дочитать висящий прогон. Не бросает,
 *  не алертит (контролёр молчалив) — алерты придут из судьи следующей ночью. */
export async function drainPendingExams(): Promise<void> {
  try {
    const out = await pollExams(Date.now() + 8000);
    if (out.done) await reportExamOutcome(out, { alert: false });
  } catch { /* дочитывание не имеет права ломать контроллер */ }
}
