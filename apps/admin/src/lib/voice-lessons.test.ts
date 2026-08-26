import { describe, it, expect } from 'vitest';
import { buildLessonPrompt, parseLessons } from './voice-lessons';

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
