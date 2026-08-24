import { describe, it, expect } from 'vitest';
import { levFull, lev, closestNames, unknownLocalityResponse, type LocalityRow } from './voice-locality';

// Subset din localities: cazurile reale din apeluri PLUS candidații-zgomot pe care
// pragul absolut singur îi scotea (Ratuș pentru «Cahul», Корпачь pentru «Комрат»).
// Fără ei, testele de zgomot n-ar demonstra nimic.
const L: LocalityRow[] = [
  { name_ro: 'Briceni', name_ru: 'Бричаны' },
  { name_ro: 'Brătușeni', name_ru: 'Братушаны' },
  { name_ro: 'Brînzeni', name_ru: 'Брынзены' },
  { name_ro: 'Bîrlădeni', name_ru: 'Бырладяны' },
  { name_ro: 'Bănești', name_ru: 'Банешты' },
  { name_ro: 'Grimești', name_ru: 'Гримешты' },
  { name_ro: 'Lipcani', name_ru: 'Липканы' },
  { name_ro: 'Rîșcani', name_ru: 'Рышканы' },
  { name_ro: 'Pașcani', name_ru: 'Пашканы' },
  { name_ro: 'Tîrnova', name_ru: 'Тырново' },
  { name_ro: 'Bîrnova', name_ru: 'Бырново' },
  { name_ro: 'Criva', name_ru: 'Крива' },
  { name_ro: 'Chișinău', name_ru: 'Кишинёв' },
  { name_ro: 'Otaci', name_ru: 'Атаки' },
  { name_ro: 'Coteala', name_ru: 'Котяла' },
  { name_ro: 'Orhei', name_ru: 'Орхей' },
  { name_ro: 'Ratuș', name_ru: 'Ратуш' },
  { name_ro: 'Corpaci', name_ru: 'Корпачь' },
  { name_ro: 'Bezeda', name_ru: 'Безеда' },
  { name_ro: 'Sîngerei', name_ru: 'Сынжерей' },
  { name_ro: 'Larga', name_ru: 'Ларга' },
];

const ro = (heard: string) => closestNames(heard, L, 'ro').map((c) => c.ro);
const ru = (heard: string) => closestNames(heard, L, 'ru').map((c) => c.ru);

describe('lev / levFull', () => {
  it('lev păstrează ieșirea rapidă, levFull dă distanța adevărată', () => {
    expect(lev('лаварадов', 'ларга')).toBe(3);
    expect(levFull('лаварадов', 'ларга')).toBeGreaterThan(3);
  });

  it('sub pragul de lungime cele două coincid — o singură formulă', () => {
    expect(lev('bratieni', 'bratuseni')).toBe(levFull('bratieni', 'bratuseni'));
  });
});

describe('closestNames — cazurile din apeluri reale', () => {
  it('«Brătieni» propune AMBELE sate între care stă (apel 24.08)', () => {
    // Transcrierea a scris «Brătieni» când clientul a spus «Briceni». Numele stă
    // între Brătușeni (2) și Briceni (3): alegerea automată l-ar fi trimis aiurea.
    expect(ro('Brătieni')).toEqual(['Brătușeni', 'Briceni']);
  });

  it('«Brăcești» ajunge tot la Briceni', () => {
    expect(ro('Brăcești')).toContain('Briceni');
  });

  it('forma corectă iese prima', () => {
    expect(ru('Отаки')[0]).toBe('Атаки');
    expect(ro('Târnăvă')[0]).toBe('Tîrnova');
  });

  it('fiecare candidat vine în ambele alfabete', () => {
    // ASR-ul scrie româna cu chirilice, deci alfabetul intrării nu spune în ce limbă
    // e convorbirea. Agentul trebuie să poată rosti candidatul în limba potrivită.
    expect(closestNames('Brătieni', L, 'ro')[0]).toEqual({ ro: 'Brătușeni', ru: 'Братушаны' });
  });

  it('cel mult două propuneri — la telefon nu se citește o listă', () => {
    expect(ro('Brătieni').length).toBeLessThanOrEqual(2);
  });
});

describe('closestNames — localități care chiar NU sunt pe rutele noastre', () => {
  // localities are DOAR rețeaua TRANSLUX. Cine cere Cahul sau Comrat trebuie să
  // primească un răspuns sincer, nu întrebarea «ați vrut Ratuș?».
  it('nu inventează candidați pentru orașe din afara rețelei', () => {
    expect(ro('Cahul')).toEqual([]);
    expect(ro('Leova')).toEqual([]);
    expect(ro('Iași')).toEqual([]);
    expect(ru('Комрат')).toEqual([]);
    expect(ru('Кагул')).toEqual([]);
    expect(ru('Бендеры')).toEqual([]);
  });

  it('intrarea absurd de lungă nu e evaluată deloc', () => {
    expect(ro('b'.repeat(5000))).toEqual([]);
  });

  it('intrarea goală nu dă nimic', () => {
    expect(ro('')).toEqual([]);
  });
});

describe('unknownLocalityResponse', () => {
  const CAND = { 'Brătieni': [{ ro: 'Brătușeni', ru: 'Братушаны' }, { ro: 'Briceni', ru: 'Бричаны' }] };

  it('cu propuneri cere agentului să ÎNTREBE, nu să aleagă', () => {
    const r = unknownLocalityResponse(['Brătieni'], CAND);
    expect(r.found).toBe(false);
    expect(r.did_you_mean).toEqual(CAND);
    expect(r.message).toContain('Brătușeni sau Briceni');
    expect(r.message).toContain('ÎNTREABĂ');
    expect(r.message).toContain('NU alege singur');
  });

  it('fără propuneri dă ieșire din buclă, nu «repetă» la nesfârșit', () => {
    // Cu interdicția necondiționată de a spune adevărul, un client care cere Cahul
    // ar fi fost întrebat la infinit: repetă → tot necunoscut → repetă.
    const r = unknownLocalityResponse(['Cahul'], {});
    expect(r.message).toContain('repete');
    expect(r.message).toContain('request_callback');
    expect(r.message).toContain('nu întreba a treia oară');
    expect(r.did_you_mean).toEqual({});
  });
});
