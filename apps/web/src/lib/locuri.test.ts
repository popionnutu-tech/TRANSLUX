import { describe, expect, it } from 'vitest';
import { CAPACITATE_AUTOBUZ, RANDURI_AUTOBUZ, comutaLoc, listaLocuri, mesajLocOcupat, parseazaLocuri, parseazaLocuriAlese, potrivesteAlese, stareLoc } from './locuri';

describe('RANDURI_AUTOBUZ', () => {
  it('are exact locurile 1–20, fiecare o singură dată: 1 în față, 5 rânduri × 3, 4 în spate', () => {
    const nr = RANDURI_AUTOBUZ.flat().filter((c): c is number => typeof c === 'number');
    expect([...nr].sort((a, b) => a - b)).toEqual(Array.from({ length: CAPACITATE_AUTOBUZ }, (_, i) => i + 1));
    expect(RANDURI_AUTOBUZ[0]).toEqual(['sofer', 'culoar', 'gol', 1]);
    expect(RANDURI_AUTOBUZ.slice(1, 6).every((r) => r.length === 4 && r[2] === 'culoar')).toBe(true);
    expect(RANDURI_AUTOBUZ[6]).toEqual([17, 18, 19, 20]);
  });
});

describe('parseazaLocuri', () => {
  it('răspunsul panoului → capacitate + ocupate sortate, fără dubluri și fără numere din afara autobuzului', () => {
    expect(parseazaLocuri({ ok: true, capacitate: 20, ocupate: [8, 3, 3, 2, 0, 21, 'x'], expira_la: null })).toEqual({ capacitate: 20, ocupate: [2, 3, 8] });
    expect(parseazaLocuri({ capacitate: 20, ocupate: [] })).toEqual({ capacitate: 20, ocupate: [] });
  });
  it('formă neașteptată → null (formularul merge fără alegere)', () => {
    expect(parseazaLocuri(null)).toBeNull();
    expect(parseazaLocuri('x')).toBeNull();
    expect(parseazaLocuri({ ok: false, eroare: 'x' })).toBeNull();
    expect(parseazaLocuri({ capacitate: 20 })).toBeNull();
    expect(parseazaLocuri({ capacitate: 0, ocupate: [] })).toBeNull();
    expect(parseazaLocuri({ capacitate: '20', ocupate: [1] })).toEqual({ capacitate: 20, ocupate: [1] });
  });
});

describe('stareLoc', () => {
  it('ocupat bate ales; altfel ales sau liber', () => {
    expect(stareLoc(3, [3], [3])).toBe('ocupat');
    expect(stareLoc(5, [3], [5])).toBe('ales');
    expect(stareLoc(7, [3], [5])).toBe('liber');
  });
});

describe('comutaLoc', () => {
  it('liber → se adaugă până la seats; ales → se scoate; ocupat → nimic', () => {
    expect(comutaLoc([], 5, 2, [3])).toEqual([5]);
    expect(comutaLoc([5], 6, 2, [3])).toEqual([5, 6]);
    expect(comutaLoc([5, 6], 7, 2, [3])).toEqual([5, 6]);
    expect(comutaLoc([5, 6], 5, 2, [3])).toEqual([6]);
    expect(comutaLoc([5], 3, 2, [3])).toEqual([5]);
  });
  it('cu un singur bilet atingerea altui loc mută alegerea', () => {
    expect(comutaLoc([5], 6, 1, [])).toEqual([6]);
    expect(comutaLoc([5], 5, 1, [])).toEqual([]);
  });
  it('nu modifică lista primită', () => {
    const a = [5];
    comutaLoc(a, 6, 2, []);
    expect(a).toEqual([5]);
  });
});

describe('potrivesteAlese', () => {
  it('locurile luate între timp cad și se raportează', () => {
    expect(potrivesteAlese([3, 8, 12], 3, [8])).toEqual({ alese: [3, 12], pierdute: [8] });
  });
  it('la mai puține bilete rămân primele seats', () => {
    expect(potrivesteAlese([3, 8, 12], 2, [])).toEqual({ alese: [3, 8], pierdute: [] });
    expect(potrivesteAlese([3, 8], 0, [])).toEqual({ alese: [], pierdute: [] });
  });
});

describe('parseazaLocuriAlese', () => {
  it('pe tur (spre Chișinău) sau fără câmp → fără alegere', () => {
    expect(parseazaLocuriAlese('[1,2]', 2, false)).toEqual({ ok: true, locuri: null });
    expect(parseazaLocuriAlese(null, 2, true)).toEqual({ ok: true, locuri: null });
    expect(parseazaLocuriAlese('   ', 2, true)).toEqual({ ok: true, locuri: null });
  });
  it('exact seats locuri distincte 1–20 → sortate', () => {
    expect(parseazaLocuriAlese('[8,3]', 2, true)).toEqual({ ok: true, locuri: [3, 8] });
  });
  it('nu-s toate → numar; stricat → format', () => {
    expect(parseazaLocuriAlese('[3]', 2, true)).toEqual({ ok: false, motiv: 'numar' });
    expect(parseazaLocuriAlese('[3,3]', 2, true)).toEqual({ ok: false, motiv: 'format' });
    expect(parseazaLocuriAlese('[0,3]', 2, true)).toEqual({ ok: false, motiv: 'format' });
    expect(parseazaLocuriAlese('[21]', 1, true)).toEqual({ ok: false, motiv: 'format' });
    expect(parseazaLocuriAlese('[1.5]', 1, true)).toEqual({ ok: false, motiv: 'format' });
    expect(parseazaLocuriAlese('{"a":1}', 1, true)).toEqual({ ok: false, motiv: 'format' });
    expect(parseazaLocuriAlese('nu-i json', 1, true)).toEqual({ ok: false, motiv: 'format' });
    expect(parseazaLocuriAlese('[' + '1,'.repeat(150) + '1]', 1, true)).toEqual({ ok: false, motiv: 'format' });
  });
});

describe('listaLocuri / mesajLocOcupat', () => {
  it('numerele sortate, fără dubluri', () => {
    expect(listaLocuri([8, 3, 8])).toBe('3, 8');
  });
  it('singular și plural, RO și RU', () => {
    expect(mesajLocOcupat([3], 'ro')).toBe('Locul 3 tocmai a fost luat, alege altul.');
    expect(mesajLocOcupat([8, 3], 'ro')).toBe('Locurile 3, 8 tocmai au fost luate, alege altele.');
    expect(mesajLocOcupat([3], 'ru')).toBe('Место 3 только что заняли, выберите другое.');
    expect(mesajLocOcupat([8, 3], 'ru')).toBe('Места 3, 8 только что заняли, выберите другие.');
  });
});
