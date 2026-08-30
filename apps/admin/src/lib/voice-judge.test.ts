import { describe, it, expect } from 'vitest';
import {
  buildFacts, parseVerdicts, quoteInText, hasSearchForPair,
  verifyNeagaCurse, verifyCallbackPromise, verifyWrongDay, verifyWrongPrice, verifyLucruUitat,
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

  it('promite_callback: запрещено ВСЕГДА (Ion 24.08) — даже после request_callback', () => {
    const promise = { role: 'agent', message: 'Nu vă faceți griji, vă sunăm noi înapoi.', time_in_call_secs: 1 };
    const yes = buildFacts('c', '2026-08-26T18:00:00Z', [promise]);
    const v: JudgeViolation = { rule: 'promite_callback', quote: 'vă sunăm noi înapoi', summary_ru: 's' };
    expect(verifyCallbackPromise(v, yes)).toBe(true);
    // Заявка была — обещание ВСЁ РАВНО нарушение: перезванивающих операторов нет.
    const withTool = buildFacts('c', '2026-08-26T18:00:00Z', [
      { role: 'agent', message: null, time_in_call_secs: 0, tool_calls: [{ tool_name: 'request_callback', params_as_json: '{}' }] },
      promise,
    ]);
    expect(verifyCallbackPromise(v, withTool)).toBe(true);
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

describe('lucru_uitat (incident 29.08: numărul șoferului ALTEI curse)', () => {
  const lostTurns = [
    { role: 'user', message: 'Am uitat o geantă în autobuzul de la unsprezece și douăzeci.', time_in_call_secs: 0 },
    { role: 'agent', message: 'Șoferul cursei de douăzeci fix este Arcadie. Numărul lui: zero șase opt. trei patru unu. opt doi opt.', time_in_call_secs: 5 },
  ];
  const v: JudgeViolation = { rule: 'lucru_uitat', quote: 'Numărul lui: zero șase opt', summary_ru: 's' };

  it('confirmă: obiect uitat + număr dictat + fără find_past_trip cu count=1', () => {
    const f2 = buildFacts('c', '2026-08-29T12:00:00Z', lostTurns);
    expect(verifyLucruUitat(v, f2)).toBe(true);
  });

  it('NU confirmă când find_past_trip a întors exact un candidat', () => {
    const f2 = buildFacts('c', '2026-08-29T12:00:00Z', [
      lostTurns[0],
      { role: 'agent', message: null, time_in_call_secs: 2,
        tool_results: [{ tool_name: 'find_past_trip', result_value: '{"count":1,"candidates":[{"phone":"068341828"}]}' }] },
      lostTurns[1],
    ]);
    expect(f2.pastTripCounts).toEqual([1]);
    expect(verifyLucruUitat(v, f2)).toBe(false);
  });

  it('NU confirmă fără obiect uitat în dialog sau fără număr dictat', () => {
    const noLost = buildFacts('c', '2026-08-29T12:00:00Z', [
      { role: 'user', message: 'Vreau o cursă spre Bălți.', time_in_call_secs: 0 },
      lostTurns[1],
    ]);
    expect(verifyLucruUitat(v, noLost)).toBe(false);
    const noPhone = buildFacts('c', '2026-08-29T12:00:00Z', [
      lostTurns[0],
      { role: 'agent', message: 'Numărul lui: zero șase opt', time_in_call_secs: 5 },
    ]);
    // Citat prezent, dar în speech nu există lanț de 9 cifre-cuvinte → nu e număr dictat.
    expect(verifyLucruUitat(v, noPhone)).toBe(false);
  });
});

describe('lucru_uitat — sinonime și fals-pozitive (delta-audit)', () => {
  const agentNr = { role: 'agent', message: 'Numărul lui: zero șase opt trei patru unu opt doi opt.', time_in_call_secs: 5 };
  const v: JudgeViolation = { rule: 'lucru_uitat', quote: 'Numărul lui: zero șase opt', summary_ru: 's' };
  const withClient = (msg: string) =>
    buildFacts('c', '2026-08-29T12:00:00Z', [{ role: 'user', message: msg, time_in_call_secs: 0 }, agentNr]);

  it('sinonimele de verb și obiect se prind', () => {
    for (const msg of [
      'Am lăsat geanta în autobuz.',
      'Mi-am lăsat telefonul în microbuz.',
      'Uitasem geanta în autobuz.',
      'Я оставил рюкзак в автобусе.',
      'Забыл кошелёк в автобусе.',
      'Am uitat portofelul acolo.',
      'Am uitat cheile în mașină.',
      'Am uitat ceva în autobuz.',
    ]) {
      expect(verifyLucruUitat(v, withClient(msg)), msg).toBe(true);
    }
  });

  it('filler-ul de vânzare NU se prinde', () => {
    for (const msg of [
      'Am uitat să întreb ceva despre preț.',
      'Am uitat, să întreb ceva.',
      'Am uitat cum se numește satul, ceva cu Corjeuți.',
      'Забыл, как называется село.',
    ]) {
      expect(verifyLucruUitat(v, withClient(msg)), msg).toBe(false);
    }
  });
});

describe('lucru_uitat — round 2: numărul companiei și filler-ul rusesc', () => {
  const v: JudgeViolation = { rule: 'lucru_uitat', quote: 'zero șase zero', summary_ru: 's' };

  it('numărul COMPANIEI citit la count=0 e purtare corectă, nu încălcare', () => {
    const f2 = buildFacts('c', '2026-08-29T12:00:00Z', [
      { role: 'user', message: 'Am uitat geanta în autobuz ieri.', time_in_call_secs: 0 },
      { role: 'agent', message: null, time_in_call_secs: 2,
        tool_results: [{ tool_name: 'find_past_trip', result_value: '{"count":0,"candidates":[]}' }] },
      { role: 'agent', message: 'Sunați-ne la zero șase zero. patru zero unu. zero unu zero.', time_in_call_secs: 5 },
    ]);
    expect(verifyLucruUitat(v, f2)).toBe(false);
  });

  it('numărul unui ȘOFER la count=0 rămâne încălcare', () => {
    const f2 = buildFacts('c', '2026-08-29T12:00:00Z', [
      { role: 'user', message: 'Am uitat geanta în autobuz ieri.', time_in_call_secs: 0 },
      { role: 'agent', message: null, time_in_call_secs: 2,
        tool_results: [{ tool_name: 'find_past_trip', result_value: '{"count":0,"candidates":[]}' }] },
      { role: 'agent', message: 'Sunați șoferul la zero șase opt. trei patru unu. opt doi opt.', time_in_call_secs: 5 },
    ]);
    const vs: JudgeViolation = { rule: 'lucru_uitat', quote: 'zero șase opt', summary_ru: 's' };
    expect(verifyLucruUitat(vs, f2)).toBe(true);
  });

  it('filler-ul RUSESC nu se prinde («забыл спросить, какой у вас телефон»)', () => {
    const agentNr = { role: 'agent', message: 'Numărul șoferului: zero șase opt trei patru unu opt doi opt.', time_in_call_secs: 5 };
    for (const msg of [
      'Я забыл спросить, а какой у вас телефон для справок?',
      'Забыл уточнить, документы нужны на ребёнка?',
    ]) {
      const f2 = buildFacts('c', '2026-08-29T12:00:00Z', [{ role: 'user', message: msg, time_in_call_secs: 0 }, agentNr]);
      const vs: JudgeViolation = { rule: 'lucru_uitat', quote: 'zero șase opt', summary_ru: 's' };
      expect(verifyLucruUitat(vs, f2), msg).toBe(false);
    }
  });
});

describe('lucru_uitat — round 3: formele feminine/plural nu ocolesc filler-ul', () => {
  const agentNr = { role: 'agent', message: 'Numărul șoferului: zero șase opt trei patru unu opt doi opt.', time_in_call_secs: 5 };
  const vf = (msg: string) => {
    const f2 = buildFacts('c', '2026-08-29T12:00:00Z', [{ role: 'user', message: msg, time_in_call_secs: 0 }, agentNr]);
    const vs: JudgeViolation = { rule: 'lucru_uitat', quote: 'zero șase opt', summary_ru: 's' };
    return verifyLucruUitat(vs, f2);
  };

  it('filler feminin/plural — NU se prinde (backtracking-ul [аи]? e oprit)', () => {
    for (const msg of [
      'Я забыла спросить, какой у вас телефон?',
      'Мы забыли спросить, какой у вас телефон?',
      'Забыла уточнить, во сколько идёт машина.',
      'Я забыла узнать, нужны ли документы.',
    ]) {
      expect(vf(msg), msg).toBe(false);
    }
  });

  it('obiect uitat la feminin — SE prinde', () => {
    expect(vf('Я забыла сумку в автобусе.')).toBe(true);
    expect(vf('Мы оставили пакет в машине.')).toBe(true);
  });

  it('fereastra de 60 nu traversează replici (separator «. »)', () => {
    const f2 = buildFacts('c', '2026-08-29T12:00:00Z', [
      { role: 'user', message: 'Я забыл', time_in_call_secs: 0 },
      { role: 'user', message: 'а у вас телефон какой', time_in_call_secs: 2 },
      agentNr,
    ]);
    const vs: JudgeViolation = { rule: 'lucru_uitat', quote: 'zero șase opt', summary_ru: 's' };
    expect(verifyLucruUitat(vs, f2)).toBe(false);
  });
});

describe('lucru_uitat — round 3 (biz): persoana a III-a RO și count-ul ultimului tool', () => {
  const agentNr = { role: 'agent', message: 'Numărul șoferului: zero șase opt trei patru unu opt doi opt.', time_in_call_secs: 5 };
  const vs: JudgeViolation = { rule: 'lucru_uitat', quote: 'zero șase opt', summary_ru: 's' };
  const vf = (msg: string) => verifyLucruUitat(vs,
    buildFacts('c', '2026-08-29T12:00:00Z', [{ role: 'user', message: msg, time_in_call_secs: 0 }, agentNr]));

  it('ruda care sună — persoana a III-a — SE prinde', () => {
    for (const msg of [
      'Copilul a uitat geanta în autobuz.',
      'Fiica mea a uitat telefonul în autobuz.',
      'Mama a lăsat un pachet în microbuz.',
      'Soțul meu și-a uitat borseta în mașină.',
      'Au uitat o valiză în autobuz.',
    ]) {
      expect(vf(msg), msg).toBe(true);
    }
  });

  it('filler-ul rămâne exclus și după lărgirea persoanei', () => {
    expect(vf('Am uitat să întreb ceva despre preț.')).toBe(false);
    expect(vf('A uitat să spună la ce oră pleacă mașina.')).toBe(false);
  });

  it('count=1 timpuriu urmat de count=0 NU mai legitimează numărul', () => {
    const f2 = buildFacts('c', '2026-08-29T12:00:00Z', [
      { role: 'user', message: 'Am uitat geanta în autobuz ieri.', time_in_call_secs: 0 },
      { role: 'agent', message: null, time_in_call_secs: 2,
        tool_results: [{ tool_name: 'find_past_trip', result_value: '{"count":1}' }] },
      { role: 'user', message: 'Nu, era altă cursă!', time_in_call_secs: 4 },
      { role: 'agent', message: null, time_in_call_secs: 5,
        tool_results: [{ tool_name: 'find_past_trip', result_value: '{"count":0}' }] },
      agentNr,
    ]);
    expect(verifyLucruUitat(vs, f2)).toBe(true);
    // Ordinea inversă (0 apoi 1) rămâne legitimă.
    const f3 = buildFacts('c', '2026-08-29T12:00:00Z', [
      { role: 'user', message: 'Am uitat geanta în autobuz ieri.', time_in_call_secs: 0 },
      { role: 'agent', message: null, time_in_call_secs: 2,
        tool_results: [{ tool_name: 'find_past_trip', result_value: '{"count":0}' }] },
      { role: 'agent', message: null, time_in_call_secs: 4,
        tool_results: [{ tool_name: 'find_past_trip', result_value: '{"count":1}' }] },
      agentNr,
    ]);
    expect(verifyLucruUitat(vs, f3)).toBe(false);
  });
});

describe('lucru_uitat — security round: fraza corectă după count=0 nu e otrăvită de numărul legitim', () => {
  const vs: JudgeViolation = { rule: 'lucru_uitat', quote: 'zero șase zero', summary_ru: 's' };

  it('count=1 (număr șofer citit) → corectură → count=0 → DOAR numărul companiei = nevinovat', () => {
    const f2 = buildFacts('c', '2026-08-29T12:00:00Z', [
      { role: 'user', message: 'Am uitat geanta în autobuz ieri.', time_in_call_secs: 0 },
      { role: 'agent', message: null, time_in_call_secs: 2,
        tool_results: [{ tool_name: 'find_past_trip', result_value: '{"count":1}' }] },
      { role: 'agent', message: 'Șoferul: zero șase opt trei patru unu opt doi opt.', time_in_call_secs: 3 },
      { role: 'user', message: 'Nu, era altă zi!', time_in_call_secs: 4 },
      { role: 'agent', message: null, time_in_call_secs: 5,
        tool_results: [{ tool_name: 'find_past_trip', result_value: '{"count":0}' }] },
      { role: 'agent', message: 'Sunați-ne la zero șase zero. patru zero unu. zero unu zero.', time_in_call_secs: 6 },
    ]);
    expect(verifyLucruUitat(vs, f2)).toBe(false);
  });
});
