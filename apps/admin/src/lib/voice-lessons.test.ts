import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildLessonPrompt, parseLessons, insertLesson } from './voice-lessons';

// ── Заглушка Supabase под ровно те цепочки, что зовёт insertLesson ──────
type Captured = { table: string; row: Record<string, unknown> };

function fakeSupabase(opts: {
  rejectedHeard?: boolean;
  aliasInsertError?: { code: string; message: string };
} = {}) {
  const inserts: Captured[] = [];
  const client = {
    from(table: string) {
      return {
        // Проверка истории отказов по heard: .select().eq().eq().eq().limit()
        select() {
          const chain = {
            eq: () => chain,
            limit: async () => ({ data: opts.rejectedHeard ? [{ id: 1 }] : [] }),
          };
          return chain;
        },
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          const error = table === 'voice_asr_aliases' ? (opts.aliasInsertError ?? null) : null;
          // Для алиасов insert ждут напрямую, для уроков — через .select().maybeSingle().
          return {
            select: () => ({ maybeSingle: async () => ({ data: { id: 77 }, error: null }) }),
            then: (res: (v: { error: unknown }) => unknown) => res({ error }),
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, inserts };
}

describe('insertLesson — авто-приём', () => {
  it('урок промпта рождается approved, без ожидания кнопки', async () => {
    const { client, inserts } = fakeSupabase();
    const ok = await insertLesson(client, {
      conversation_id: 'c1',
      kind: 'prompt_lesson',
      payload: { type: 'time' },
      summary: 'Агент дал вечерний рейс',
    });
    expect(ok).toBe(true);
    const lesson = inserts.find((i) => i.table === 'voice_lessons');
    expect(lesson?.row.status).toBe('approved');
    expect(lesson?.row.decided_at).toEqual(expect.any(String));
    expect(lesson?.row.decided_by).toBeNull();
    // Урок промпта сам по себе алиас не создаёт — его берёт drainPendingExams.
    expect(inserts.some((i) => i.table === 'voice_asr_aliases')).toBe(false);
  });

  it('алиас approved И сразу уезжает в резолвер', async () => {
    const { client, inserts } = fakeSupabase();
    const ok = await insertLesson(client, {
      conversation_id: 'c2',
      kind: 'alias',
      payload: { heard: 'Корж оуць', intended_ro: 'Corjeuți', quote: 'CLIENT: Корж оуць' },
      summary: 'Алиас: «Корж оуць» → Corjeuți',
    });
    expect(ok).toBe(true);
    const alias = inserts.find((i) => i.table === 'voice_asr_aliases');
    expect(alias?.row.heard).toBe('Корж оуць');
    expect(alias?.row.canonical_ro).toBe('Corjeuți');
    // Отдельный source: verifyPair эту пару отклонил — она отличима от чистых.
    expect(alias?.row.source).toBe('learner_unverified');
    expect(alias?.row.evidence).toMatchObject({ lesson_id: 77, auto_approved: true });
  });

  it('heard, отклонённый Ионом раньше, не воскресает', async () => {
    const { client, inserts } = fakeSupabase({ rejectedHeard: true });
    const ok = await insertLesson(client, {
      conversation_id: 'c3',
      kind: 'alias',
      payload: { heard: 'Чералхон', intended_ro: 'Chișinău' },
      summary: 'Алиас: «Чералхон» → Chișinău',
    });
    expect(ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it('дубль heard (23505) НЕ реактивирует погашенный алиас', async () => {
    // Иначе: learner поднимает в 00:30 — auditAliasShadow гасит в 01:00 — и так
    // каждую ночь. Кнопка в боте реактивирует, там за ✓ стоит человек.
    const { client, inserts } = fakeSupabase({ aliasInsertError: { code: '23505', message: 'dup' } });
    const ok = await insertLesson(client, {
      conversation_id: 'c4',
      kind: 'alias',
      payload: { heard: 'Хлиная', intended_ro: 'Hlinaia' },
      summary: 'Алиас: «Хлиная» → Hlinaia',
    });
    expect(ok).toBe(true);
    expect(inserts.filter((i) => i.table === 'voice_asr_aliases')).toHaveLength(1);
  });
});

describe('parseLessons', () => {
  it('разбирает валидный JSON с обрамляющим текстом', () => {
    const raw = 'Iată rezultatul: {"lessons":[{"type":"time","what_agent_did":"a spus 18:10","what_client_corrected":"cerea dimineața","quote":"нет, утром","summary_ru":"Агент дал вечерний рейс на запрос утреннего"}]} gata';
    const out = parseLessons(raw);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('time');
    expect(out[0].summary_ru).toContain('вечерний');
  });

  it('битый JSON → пустой список', () => {
    expect(parseLessons('nu pot răspunde')).toEqual([]);
    expect(parseLessons('{"lessons": [{')).toEqual([]);
  });

  it('уроки без summary_ru или quote отбрасываются', () => {
    const raw = '{"lessons":[{"type":"other","quote":"","summary_ru":"есть"},{"type":"other","quote":"цитата","summary_ru":""}]}';
    expect(parseLessons(raw)).toEqual([]);
  });

  it('режет до 3 уроков', () => {
    const lesson = { type: 'other', what_agent_did: 'x', what_client_corrected: 'y', quote: 'q', summary_ru: 's' };
    const raw = JSON.stringify({ lessons: [lesson, lesson, lesson, lesson, lesson] });
    expect(parseLessons(raw)).toHaveLength(3);
  });
});

describe('buildLessonPrompt', () => {
  it('без негативов — базовый промпт', () => {
    expect(buildLessonPrompt([])).not.toContain('RESPINS');
  });

  it('негативы попадают в промпт списком', () => {
    const p = buildLessonPrompt(['Урок про время', 'Урок про дату']);
    expect(p).toContain('RESPINS');
    expect(p).toContain('- Урок про время');
    expect(p).toContain('- Урок про дату');
  });
});
