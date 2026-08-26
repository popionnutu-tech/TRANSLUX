import { describe, it, expect } from 'vitest';
import {
  buildFacts, parseVerdicts, quoteInText, hasSearchForPair,
  verifyNeagaCurse, verifyCallbackPromise, verifyWrongDay, verifyWrongPrice,
  type JudgeViolation,
} from './voice-judge';

// Фикстура — форма РЕАЛЬНОЙ строки voice_calls.transcript: params_as_json и
// result_value — JSON-СТРОКИ, не объекты (ловушка I14 из ревью).
const transcript = [
  { role: 'user', message: 'Vreau de la Bălți la Ocnița mâine', time_in_call_secs: 0 },
  {
    role: 'agent', message: null, time_in_call_secs: 2,
    tool_calls: [{
      tool_name: 'search_trips',
      params_as_json: '{"from": "Bălți", "to": "Ocnița", "date": "mâine"}',
      tool_details: { type: 'webhook', body: '{"from": "Bălți", "to": "Ocnița", "date": "mâine"}' },
    }],
  },
  {
    role: 'agent', message: null, time_in_call_secs: 3,
    tool_results: [{
      tool_name: 'search_trips',
      result_value: '{"count":4,"date":"2026-08-27","is_today":false,"date_label_ro":"mâine, douăzeci și șapte august","date_label_ru":"завтра, двадцать седьмого августа","only_remaining_today":false,"trips":[{"departure":"06:30","price":130},{"departure":"08:00","price":130}]}',
    }],
  },
  { role: 'agent', message: 'Îmi pare rău, nu sunt curse mâine pe această rută.', time_in_call_secs: 5 },
  { role: 'user', message: 'Cum nu sunt?', time_in_call_secs: 7 },
];

describe('buildFacts', () => {
  const f = buildFacts('conv_x', '2026-08-26T18:00:00Z', transcript);

  it('разбирает params_as_json (JSON-строку) в searchCalls', () => {
    expect(f.calledSearchTrips).toBe(true);
    expect(f.searchCalls).toEqual([{ from: 'Bălți', to: 'Ocnița', date: 'mâine' }]);
  });

  it('разбирает result_value: count, метки дня, цены', () => {
    expect(f.searchResults).toHaveLength(1);
    expect(f.searchResults[0].count).toBe(4);
    expect(f.searchResults[0].dateLabels).toContain('mâine, douăzeci și șapte august');
    expect(f.priceValues).toContain(130);
  });

  it('считает реплики и склеивает речь агента', () => {
    expect(f.userTurns).toBe(2);
    expect(f.agentText).toContain('nu sunt curse');
  });
});

describe('parseVerdicts', () => {
  it('валидный JSON с обрамлением', () => {
    const raw = 'ok {"violations":[{"rule":"neaga_curse","quote":"nu sunt curse mâine","summary_ru":"Отрицал рейсы при count=4"}]}';
    const out = parseVerdicts(raw);
    expect(out).toHaveLength(1);
    expect(out[0].rule).toBe('neaga_curse');
  });

  it('незнакомое правило и пустая цитата отбрасываются, мусор → []', () => {
    expect(parseVerdicts('{"violations":[{"rule":"inventat","quote":"x","summary_ru":"y"}]}')).toEqual([]);
    expect(parseVerdicts('{"violations":[{"rule":"neaga_curse","quote":"","summary_ru":"y"}]}')).toEqual([]);
    expect(parseVerdicts('nu pot')).toEqual([]);
  });
});

describe('верификаторы', () => {
  const f = buildFacts('conv_x', '2026-08-26T18:00:00Z', transcript);

  it('quoteInText — якорь дословной цитаты', () => {
    expect(quoteInText('nu sunt curse mâine', f.agentText)).toBe(true);
    expect(quoteInText('фраза которой не было в звонке', f.agentText)).toBe(false);
  });

  it('neaga_curse подтверждается: count>0 и цитата на месте', () => {
    const v: JudgeViolation = { rule: 'neaga_curse', quote: 'nu sunt curse mâine pe această rută', summary_ru: 's' };
    expect(verifyNeagaCurse(v, f)).toBe(true);
  });

  it('hasSearchForPair: одноалфавитная пара матчится в обе стороны, межалфавитная — нет (её решает канонический матч)', () => {
    const same: JudgeViolation = { rule: 'coridor_refuz', from: 'Ocnita', to: 'Balti', quote: 'q', summary_ru: 's' };
    expect(hasSearchForPair(same, f)).toBe(true); // обратный порядок + без диакритики
    const cross: JudgeViolation = { rule: 'coridor_refuz', from: 'Окница', to: 'Бельцы', quote: 'q', summary_ru: 's' };
    expect(hasSearchForPair(cross, f)).toBe(false); // key() не транслитерирует — межалфавитное закрывает verifyCoridorRefuz
  });

  it('promite_callback: цитата+regex; после request_callback обещание ПРЕДПИСАНО — не нарушение', () => {
    const promise = { role: 'agent', message: 'Nu vă faceți griji, vă sunăm noi înapoi.', time_in_call_secs: 1 };
    const yes = buildFacts('c', '2026-08-26T18:00:00Z', [promise]);
    const v: JudgeViolation = { rule: 'promite_callback', quote: 'vă sunăm noi înapoi', summary_ru: 's' };
    expect(verifyCallbackPromise(v, yes)).toBe(true);
    // Та же фраза, но заявка через request_callback была — промпт ОБЯЗЫВАЕТ обещать.
    const withTool = buildFacts('c', '2026-08-26T18:00:00Z', [
      { role: 'agent', message: null, time_in_call_secs: 0, tool_calls: [{ tool_name: 'request_callback', params_as_json: '{}' }] },
      promise,
    ]);
    expect(verifyCallbackPromise(v, withTool)).toBe(false);
    // Цитата не из белого списка обещаний → шум LLM отбрасывается.
    const weak: JudgeViolation = { rule: 'promite_callback', quote: 'vă pot ajuta cu orarul', summary_ru: 's' };
    const noPromise = buildFacts('c', '2026-08-26T18:00:00Z', [{ role: 'agent', message: 'Vă pot ajuta cu orarul.', time_in_call_secs: 1 }]);
    expect(verifyCallbackPromise(weak, noPromise)).toBe(false);
  });

  it('zi_gresita: день не из date_label → true; совпадающий → false; без тулов → false', () => {
    const bad: JudgeViolation = { rule: 'zi_gresita', day_said: 'poimâine', quote: 'nu sunt curse mâine pe această rută', summary_ru: 's' };
    expect(verifyWrongDay(bad, f)).toBe(true);
    const okDay: JudgeViolation = { rule: 'zi_gresita', day_said: 'mâine', quote: 'nu sunt curse mâine pe această rută', summary_ru: 's' };
    expect(verifyWrongDay(okDay, f)).toBe(false);
    const noTools = buildFacts('c', '2026-08-26T18:00:00Z', [{ role: 'agent', message: 'ceva', time_in_call_secs: 1 }]);
    expect(verifyWrongDay(bad, noTools)).toBe(false);
  });

  it('pret_gresit: чужая цена → true; цена из тула → false', () => {
    const wrong: JudgeViolation = { rule: 'pret_gresit', price_said: 260, quote: 'nu sunt curse mâine pe această rută', summary_ru: 's' };
    expect(verifyWrongPrice(wrong, f)).toBe(true);
    const right: JudgeViolation = { rule: 'pret_gresit', price_said: 130, quote: 'nu sunt curse mâine pe această rută', summary_ru: 's' };
    expect(verifyWrongPrice(right, f)).toBe(false);
  });
});
