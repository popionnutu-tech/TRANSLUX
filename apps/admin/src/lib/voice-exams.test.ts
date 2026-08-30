import { describe, it, expect } from 'vitest';
import { buildLessonTest } from './voice-exams';

const transcript = [
  { role: 'user', message: 'Vreau la Tețcani mâine', time_in_call_secs: 0 },
  { role: 'agent', message: 'O clipă, verific.', time_in_call_secs: 2 },
  { role: 'user', message: 'Da, din Bălți.', time_in_call_secs: 4 },
  { role: 'agent', message: 'Bălți și Tețcani nu sunt pe ruta noastră.', time_in_call_secs: 6 },
];

const lesson = {
  id: 7,
  payload: {
    quote: 'Bălți și Tețcani nu sunt pe ruta noastră',
    what_agent_did: 'A refuzat perechea fără să cheme tool-ul',
    what_client_corrected: 'Trebuia să caute în search_trips — cursele există',
  },
  summary: 'Отказ без вызова тула',
};

describe('buildLessonTest', () => {
  it('режет историю ДО реплики-провала и кончает репликой клиента', () => {
    const body = buildLessonTest(lesson, transcript);
    expect(body).not.toBeNull();
    const history = body!.chat_history as { role: string; message: string }[];
    expect(history[history.length - 1].role).toBe('user');
    expect(history.some((t) => t.message.includes('nu sunt pe ruta'))).toBe(false);
    expect(body!.name).toBe('TLX lesson #7');
    expect(String(body!.success_condition)).toContain('search_trips');
  });

  it('цитата не найдена → null', () => {
    expect(buildLessonTest({ ...lesson, payload: { ...lesson.payload, quote: 'фразы такой не было' } }, transcript)).toBeNull();
  });

  it('провал в первой же реплике (нет истории до) → null', () => {
    const t = [{ role: 'agent', message: 'Bălți și Tețcani nu sunt pe ruta noastră.', time_in_call_secs: 0 }];
    expect(buildLessonTest(lesson, t)).toBeNull();
  });

  it('цитата из одной пунктуации/короче 8 симв. после normText → null, а не срез по первой реплике', () => {
    expect(buildLessonTest({ ...lesson, payload: { ...lesson.payload, quote: '...!?' } }, transcript)).toBeNull();
    expect(buildLessonTest({ ...lesson, payload: { ...lesson.payload, quote: 'Da.' } }, transcript)).toBeNull();
  });
});
