import { describe, it, expect } from 'vitest';
import { allowedTimes, lenientTimes, parseSpokenTimes, TimeGuard } from './spoken-times';
import type { OpenAIMessage } from './openai-compat';

// Apelul real 07.09 (conv_3201m1ygxgnjefprgw97vw05n664): tool-ul a dat 0 curse pe azi,
// modelul a inventat «patru și douăzeci» și «șase și jumătate» pentru mâine.
const ZERO_TODAY: OpenAIMessage[] = [
  { role: 'user', content: 'De la Chișinău spre Bălți, când la ce oră e prima rutieră?' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search_trips', arguments: '{"from":"Chișinău","to":"Bălți"}' } }] },
  { role: 'tool', tool_call_id: 'c1', content: '{"count":0,"date":"2026-09-07","is_today":true,"date_label_ro":"azi, șapte septembrie","only_remaining_today":true,"trips_awaiting_driver":0,"departures_ro":"","departures_ru":"","trips":[]}' },
];
const INVENTED = 'Azi nu mai sunt curse. Mâine am cursă la patru și douăzeci dimineața, apoi la șase și jumătate. Care vă convine?';

// Răspunsul real al tool-ului pentru 08.09 (trunchiat la primele curse).
const TOMORROW_TOOL = '{"count":29,"date":"2026-09-08","is_today":false,"date_label_ro":"mâine, opt septembrie","date_label_ru":"завтра, восьмого сентября","only_remaining_today":false,"departures_ro":"șase și cincizeci și cinci, șapte și treizeci, opt fix, opt și cincizeci, nouă și patruzeci, unsprezece și patruzeci și trei, douăzeci zero cinci","departures_ru":"шесть пятьдесят пять, семь тридцать, восемь ноль-ноль, восемь пятьдесят, девять сорок, одиннадцать сорок три, двадцать ноль пять","trips":[{"departure":"06:55","departure_spoken_ro":"șase și cincizeci și cinci","price":129,"driver":"Ion Popescu","phone":"37369123456"},{"departure":"16:20","departure_spoken_ro":"șaisprezece și douăzeci"}]}';
const WITH_TOMORROW: OpenAIMessage[] = [
  ...ZERO_TODAY,
  { role: 'assistant', content: null, tool_calls: [{ id: 'c2', type: 'function', function: { name: 'search_trips', arguments: '{"from":"Chișinău","to":"Bălți","date":"mâine"}' } }] },
  { role: 'tool', tool_call_id: 'c2', content: TOMORROW_TOOL },
];

/** Trece textul prin gardă în bucăți de n caractere, la limită de cuvânt — ca stream-ul real după TtsGate. */
function stream(text: string, allowed: Set<string>, n = 5) {
  const g = new TimeGuard(allowed);
  let out = '';
  let buf = '';
  for (let i = 0; i < text.length; i += n) {
    buf += text.slice(i, i + n);
    const cut = buf.lastIndexOf(' ');
    if (cut < 0) continue;
    out += g.push(buf.slice(0, cut + 1));
    buf = buf.slice(cut + 1);
  }
  out += g.push(buf);
  out += g.flush();
  return { g, out };
}

const times = (t: string) => parseSpokenTimes(t).map((x) => x.candidates.join('/'));

describe('parseSpokenTimes — română', () => {
  it('prinde orele inventate din apelul real', () => {
    expect(times(INVENTED)).toEqual(['04:20', '06:30']);
  });
  it('formele emise de time-spoken', () => {
    expect(times('șase și cincizeci și cinci, șapte și treizeci, opt fix, douăzeci zero cinci, unsprezece și patruzeci și trei'))
      .toEqual(['06:55', '07:30', '08:00', '20:05', '11:43']);
  });
  it('ora goală cu prepoziție sau calificativ', () => {
    expect(times('Aveți cursă la opt.')).toEqual(['08:00']);
    expect(times('pe la șapte seara')).toEqual(['07:00/19:00']);
    expect(times('ora douăsprezece')).toEqual(['12:00']);
    expect(times('la două după-amiaza')).toEqual(['02:00/14:00']);
  });
  it('sfert, jumătate, fără', () => {
    expect(times('nouă și un sfert')).toEqual(['09:15']);
    expect(times('opt fără zece')).toEqual(['07:50']);
    expect(times('opt fără un sfert')).toEqual(['07:45']);
  });
  it('prețuri, date, numărători NU sunt ore', () => {
    expect(times('Biletul costă o sută douăzeci și cinci de lei.')).toEqual([]);
    expect(times('mâine, opt septembrie')).toEqual([]);
    expect(times('douăzeci și patru august')).toEqual([]);
    expect(times('Am trei locuri libere și două curse.')).toEqual([]);
    expect(times('la trei stații de autogară')).toEqual([]);
    expect(times('peste zece minute')).toEqual([]);
    expect(times('douăzeci și trei de persoane')).toEqual([]);
  });
  it('telefonul dictat nu conține ore', () => {
    expect(times('Numărul lui: zero. șase. nouă... zero. cinci. unu... doi. trei. patru.')).toEqual([]);
    expect(times('zero șase nouă zero cinci unu doi trei patru')).toEqual([]);
  });
  it('cedilele și majusculele nu-l orbesc', () => {
    expect(times('La Şapte şi treizeci.')).toEqual(['07:30']);
    expect(times('La 7:30 și la 18:05.')).toEqual(['07:30', '18:05']);
  });
});

describe('parseSpokenTimes — русский', () => {
  it('формы time-spoken', () => {
    expect(times('семь тридцать, восемь ноль-ноль, двадцать ноль пять, одиннадцать сорок три'))
      .toEqual(['07:30', '08:00', '20:05', '11:43']);
  });
  it('голый час, половина, четверть, без', () => {
    expect(times('Ближайший рейс в восемь.')).toEqual(['08:00']);
    expect(times('в два часа дня')).toEqual(['02:00/14:00']);
    expect(times('половина седьмого')).toEqual(['06:30']);
    expect(times('четверть восьмого')).toEqual(['07:15']);
    expect(times('без четверти девять')).toEqual(['08:45']);
    expect(times('восемь с половиной утра')).toEqual(['08:30']);
    expect(times('в час дня')).toEqual(['01:00/13:00']);
  });
  it('цены, даты, счёт — не время', () => {
    expect(times('сто двадцать пять лей')).toEqual([]);
    expect(times('завтра, восьмого сентября')).toEqual([]);
    expect(times('два рейса и три места')).toEqual([]);
    expect(times('через десять минут')).toEqual([]);
  });
});

describe('allowedTimes', () => {
  it('tool cu 0 curse nu dă nicio oră', () => {
    expect(allowedTimes(ZERO_TODAY).size).toBe(0);
  });
  it('tool cu curse: HH:MM din cifre + formele rostite', () => {
    const a = allowedTimes(WITH_TOMORROW);
    for (const t of ['06:55', '07:30', '08:00', '08:50', '09:40', '11:43', '20:05', '16:20']) expect(a.has(t)).toBe(true);
    expect(a.has('04:20')).toBe(false);
    expect(a.has('06:30')).toBe(false);
  });
  it('ce a spus clientul e permis, larg («patru douăzeci», «la 8», «восемь»)', () => {
    expect(lenientTimes('Patru douăzeci?')).toContain('04:20');
    expect(lenientTimes('la 8 dimineața')).toContain('08:00');
    expect(lenientTimes('в восемь вечера есть?')).toContain('20:00');
    const a = allowedTimes([{ role: 'user', content: 'Pe la opt și zece aveți?' }]);
    expect(a.has('08:10')).toBe(true);
    expect(a.has('08:00')).toBe(true);
  });
  it('parametrul departure trimis de model contează', () => {
    const a = allowedTimes([{ role: 'assistant', content: null, tool_calls: [{ id: 'x', type: 'function', function: { name: 'search_trips', arguments: '{"from":"a","to":"b","departure":"07:30"}' } }] }]);
    expect(a.has('07:30')).toBe(true);
  });
  it('promptul de sistem și replicile vechi ale agentului NU dau ore', () => {
    const a = allowedTimes([
      { role: 'system', content: 'E 10:38 și clientul cere «în jurul orei unsprezece»' },
      { role: 'assistant', content: 'Mâine la patru și douăzeci.' },
    ]);
    expect(a.size).toBe(0);
  });
});

describe('TimeGuard pe stream', () => {
  it('apelul real: rămâne doar «Azi nu mai sunt curse.», restul se taie', () => {
    const { g, out } = stream(INVENTED, allowedTimes(ZERO_TODAY));
    expect(out).toBe('Azi nu mai sunt curse. ');
    expect(g.violated).toBe(true);
    expect(g.dropped[0].time).toContain('04:20');
    // După tăiere nu mai iese nimic din replica aceea, nici propoziții curate.
    expect(g.push('Care vă convine? ')).toBe('');
  });
  it('orele din tool trec neatinse, în orice chunk-uri', () => {
    const a = allowedTimes(WITH_TOMORROW);
    const text = 'Azi nu mai sunt curse. Mâine prima cursă e la șase și cincizeci și cinci, apoi la șapte și treizeci. Care vă convine?';
    for (const n of [1, 3, 5, 11, 50]) {
      const { g, out } = stream(text, a, n);
      expect(out).toBe(text);
      expect(g.violated).toBe(false);
    }
  });
  it('capul propoziției nu pleacă înaintea orei (fără «Mâine am cursă la» + tăcere)', () => {
    const g = new TimeGuard(new Set());
    expect(g.push('Mâine am cursă la ')).toBe('');
    expect(g.push('patru și douăzeci. ')).toBe('');
    expect(g.violated).toBe(true);
  });
  it('replica fără numere pleacă întreagă la capătul propoziției', () => {
    const g = new TimeGuard(new Set());
    expect(g.push('De unde ')).toBe('');
    expect(g.push('și până unde ')).toBe('');
    expect(g.push('doriți să mergeți? ')).toBe('De unde și până unde doriți să mergeți? ');
    expect(g.push('Spuneți.')).toBe('');
    expect(g.flush()).toBe('Spuneți.');
    expect(g.violated).toBe(false);
  });
  it('un cap lung fără număr se eliberează după 48 de caractere', () => {
    const g = new TimeGuard(new Set());
    const head = 'Vă mulțumesc pentru răbdare, verific imediat orarul pentru ';
    expect(g.push(head)).toBe(head);
  });
  it('ecoul orei spuse de client trece; ora nouă inventată nu', () => {
    const msgs: OpenAIMessage[] = [...WITH_TOMORROW, { role: 'user', content: 'La opt aveți?' }];
    const a = allowedTimes(msgs);
    expect(stream('La opt fix nu am, cea mai apropiată e la opt și cincizeci.', a).out)
      .toBe('La opt fix nu am, cea mai apropiată e la opt și cincizeci.');
    const bad = stream('La opt nu am, dar am la opt și douăzeci.', a);
    expect(bad.out).toBe('');
    expect(bad.g.dropped[0].time).toContain('08:20');
  });
  it('«după-amiaza» acoperă 16:20; fără calificativ, 04:20 rămâne inventat', () => {
    const a = allowedTimes(WITH_TOMORROW);
    expect(stream('Aveți cursă la patru și douăzeci după-amiaza.', a).g.violated).toBe(false);
    expect(stream('Aveți cursă la patru și douăzeci.', a).g.violated).toBe(true);
  });
  it('telefonul, prețul și data trec cu mulțime goală', () => {
    const a = new Set<string>();
    const text = 'Numărul lui: zero. șase. nouă... zero. cinci. unu... doi. trei. patru. Biletul costă o sută douăzeci și cinci de lei, mâine, opt septembrie.';
    const { g, out } = stream(text, a);
    expect(out).toBe(text);
    expect(g.violated).toBe(false);
  });
  it('rusă: ora din tool trece, cea inventată cade', () => {
    const a = allowedTimes(WITH_TOMORROW);
    expect(stream('Ближайший рейс завтра в семь тридцать.', a).out).toBe('Ближайший рейс завтра в семь тридцать.');
    const bad = stream('Сегодня рейсов нет. Завтра есть в четыре двадцать утра и в половине седьмого.', a);
    expect(bad.out).toBe('Сегодня рейсов нет. ');
    expect(bad.g.dropped[0].time).toContain('04:20');
  });
  it('capătul fără punct se judecă la flush', () => {
    const g = new TimeGuard(new Set());
    expect(g.push('Da, la patru și douăzeci')).toBe('');
    expect(g.flush()).toBe('');
    expect(g.violated).toBe(true);
  });
});
