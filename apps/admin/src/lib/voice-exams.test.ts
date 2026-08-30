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

  it('мультирепличная цитата учителя с этикетками CLIENT:/AGENT: режет по агентскому фрагменту', () => {
    // Реальная форма цитат learner-а: он цитирует диалог с этикетками, из-за чего
    // голый includes не совпадал никогда (13 уроков без экзаменов, аудит 30.08).
    const labeled = {
      ...lesson,
      payload: { ...lesson.payload, quote: 'CLIENT: Vreau la Tețcani mâine. AGENT: Bălți și Tețcani nu sunt pe ruta noastră.' },
    };
    const body = buildLessonTest(labeled, transcript);
    expect(body).not.toBeNull();
    const history = body!.chat_history as { role: string; message: string }[];
    expect(history[history.length - 1].role).toBe('user');
    expect(history.some((t) => t.message.includes('nu sunt pe ruta'))).toBe(false);
  });

  it('последний фрагмент AGENT перефразирован → якорь по CLIENT, не откат на ранний AGENT', () => {
    // Откат на ранний AGENT-фрагмент резал бы историю в другой точке (arch-ревью
    // 30.08). Фрагмент CLIENT из цитаты ancorează точку ПЕРЕД репликой-провалом.
    const twoFrags = {
      ...lesson,
      payload: { ...lesson.payload, quote: 'AGENT: O clipă, verific. CLIENT: Da, din Bălți. AGENT: Perechea asta nu o deservim deloc.' },
    };
    const body = buildLessonTest(twoFrags, transcript);
    expect(body).not.toBeNull();
    const history = body!.chat_history as { role: string; message: string }[];
    expect(history[history.length - 1]).toMatchObject({ role: 'user', message: 'Da, din Bălți.' });
    expect(history.some((t) => t.message.includes('nu sunt pe ruta'))).toBe(false);
    // Fallback-ветка НЕ говорит грейдеру «клиент только что поправил»: здесь
    // реплика клиента может идти и ДО провала (arch Minor, раунд 4).
    expect(String(body!.success_condition)).not.toContain('JUST corrected');
  });

  it('цитата кончается CLIENT-ом → якорь по поправке, даже если AGENT-фрагмент находится', () => {
    // Поправка идёт ПОСЛЕ провала (промпт учителя). Срез перед агентским
    // фрагментом клал бы провал в историю и требовал поведения до поправки —
    // вечно красный тест (arch Critical раунд 2, урок #3).
    const failThenFix = {
      ...lesson,
      payload: { ...lesson.payload, quote: 'AGENT: Bălți și Tețcani nu sunt pe ruta noastră. CLIENT: Da, din Bălți.' },
    };
    const body = buildLessonTest(failThenFix, transcript);
    expect(body).not.toBeNull();
    const history = body!.chat_history as { role: string; message: string }[];
    expect(history[history.length - 1]).toMatchObject({ role: 'user', message: 'Da, din Bălți.' });
    expect(String(body!.success_condition)).toContain('JUST corrected');
  });

  it('AGENT-фрагмент перефразирован и CLIENT-якоря нет → честный null', () => {
    const gone = {
      ...lesson,
      payload: { ...lesson.payload, quote: 'AGENT: Perechea asta nu o deservim deloc.' },
    };
    expect(buildLessonTest(gone, transcript)).toBeNull();
  });

  it('цитата только из реплики клиента якорится по CLIENT (уроки #7/#11)', () => {
    const clientOnly = {
      ...lesson,
      payload: { ...lesson.payload, quote: 'CLIENT: Da, din Bălți.' },
    };
    const body = buildLessonTest(clientOnly, transcript);
    expect(body).not.toBeNull();
    const history = body!.chat_history as { role: string; message: string }[];
    expect(history[history.length - 1]).toMatchObject({ role: 'user', message: 'Da, din Bălți.' });
  });

  it('цитата из одной пунктуации/короче 8 симв. после normText → null, а не срез по первой реплике', () => {
    expect(buildLessonTest({ ...lesson, payload: { ...lesson.payload, quote: '...!?' } }, transcript)).toBeNull();
    expect(buildLessonTest({ ...lesson, payload: { ...lesson.payload, quote: 'Da.' } }, transcript)).toBeNull();
  });
});
