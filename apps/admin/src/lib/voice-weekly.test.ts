import { describe, it, expect } from 'vitest';
import {
  saptamanaIncheiata, etichetaPerioadei, parseVerdict, compuneRaport,
  type ApelRezultat, type Verdict,
} from './voice-weekly';

const apel = (bucket: ApelRezultat['bucket'], id: string, extra: Partial<ApelRezultat> = {}): ApelRezultat => ({
  conversation_id: id,
  created_at: '2026-09-09T11:20:00Z', // 14:20 la Chișinău (vara, +03:00)
  caller_phone: '+37360000000',
  duration_secs: 60,
  summary: 'rezumat',
  bucket,
  ...extra,
});

describe('saptamanaIncheiata', () => {
  it('lunea dă săptămâna care tocmai s-a încheiat', () => {
    expect(saptamanaIncheiata('2026-09-14')).toEqual({ start: '2026-09-07', sfarsit: '2026-09-13' });
  });

  it('marțea dă ACEEAȘI săptămână — reîncercarea de după o cădere nu sare peste ea', () => {
    expect(saptamanaIncheiata('2026-09-15')).toEqual({ start: '2026-09-07', sfarsit: '2026-09-13' });
  });

  it('duminica nu ia săptămâna în curs', () => {
    expect(saptamanaIncheiata('2026-09-13')).toEqual({ start: '2026-08-31', sfarsit: '2026-09-06' });
  });

  it('trece corect peste hotarul lunii', () => {
    expect(saptamanaIncheiata('2026-10-05')).toEqual({ start: '2026-09-28', sfarsit: '2026-10-04' });
  });
});

describe('etichetaPerioadei', () => {
  it('scrie zilele ca la noi, nu ca ISO', () => {
    expect(etichetaPerioadei('2026-09-07', '2026-09-13')).toBe('07.09 — 13.09');
  });
});

describe('parseVerdict', () => {
  it('citește verdictul și motivul', () => {
    expect(parseVerdict('{"verdict":"ratat","motiv":"a cerut loc, n-a primit"}'))
      .toEqual({ verdict: 'ratat', motiv: 'a cerut loc, n-a primit' });
  });

  it('acceptă text în jurul JSON-ului', () => {
    expect(parseVerdict('Iată: {"verdict":"raspuns_corect","motiv":"altă rută"} gata')?.verdict)
      .toBe('raspuns_corect');
  });

  it('respinge un verdict inventat', () => {
    expect(parseVerdict('{"verdict":"perfect","motiv":"x"}')).toBeNull();
  });

  it('nu cade pe JSON stricat', () => {
    expect(parseVerdict('nu e json')).toBeNull();
  });
});

describe('compuneRaport', () => {
  const verdicte = new Map<string, Verdict>([
    ['ft_ratat', { verdict: 'ratat', motiv: 'a cerut loc la ultima cursă' }],
    ['ft_corect', { verdict: 'raspuns_corect', motiv: 'nu mergem la Iași' }],
    ['ft_alo', { verdict: 'inchis_imediat', motiv: 'doar alo' }],
  ]);
  const apeluri: ApelRezultat[] = [
    apel('orar', 'o1'), apel('orar', 'o2'),
    apel('reclamatie', 'r1'),
    apel('lucru_uitat_gasit', 'lg'),
    apel('lucru_uitat_negasit', 'ln'),
    apel('localitate', 'loc'),
    apel('operator', 'op'),
    apel('fara_curse', 'fc'),
    apel('mut', 'm1'),
    apel('fara_tool', 'ft_ratat'),
    apel('fara_tool', 'ft_corect'),
    apel('fara_tool', 'ft_alo'),
    apel('fara_tool', 'ft_nou'), // nejudecat de model — nu se pierde din total
  ];

  const text = compuneRaport({
    perioada: '07.09 — 13.09', apeluri, verdicte,
    lectii: [{ rule: 'zi_gresita' }, { rule: 'zi_gresita' }, { rule: 'promite_callback' }],
  });

  it('numără toate apelurile', () => {
    expect(text).toContain('Apeluri: <b>13</b>');
  });

  it('pune la rezolvate și răspunsul corect fără tool', () => {
    // orar 2 + reclamație 1 + lucru uitat găsit 1 + răspuns corect 1
    expect(text).toContain('✅ <b>Rezolvate: 5</b>');
  });

  it('numără ce n-a putut rezolva: ratat + localitate + lucru uitat + operator', () => {
    expect(text).toContain('❌ <b>N-a putut rezolva: 4</b>');
    expect(text).toContain('• n-a înțeles ce vrea clientul: 1');
    expect(text).toContain('• localitate nerecunoscută: 1');
    expect(text).toContain('• clientul a cerut un om: 1');
  });

  it('nu pune în sarcina agentului tăcerea clientului și lipsa curselor', () => {
    // mut 1 + închis imediat 1 + fără curse 1 + neclasificat 1
    expect(text).toContain('➖ <b>Fără răspuns de dat: 4</b>');
    expect(text).toContain('• clientul n-a spus nimic (alo, tăcere): 2');
    expect(text).toContain('• neclasificate (modelul n-a apucat): 1');
  });

  it('traduce regulile judecătorului', () => {
    expect(text).toContain('🔎 <b>Greșeli prinse de judecător: 3</b>');
    expect(text).toContain('• a spus altă zi decât cea găsită: 2');
    expect(text).toContain('• a promis că sunăm noi înapoi: 1');
  });

  it('listează apelurile nerezolvate cu ora și numărul, ca să se poată suna', () => {
    expect(text).toContain('• 09.09 14:20 · +37360000000 — a cerut loc la ultima cursă');
    expect(text).toContain('• 09.09 14:20 · +37360000000 — n-a recunoscut localitatea cerută');
  });

  it('spune limpede când nu s-a ratat nimic', () => {
    const curat = compuneRaport({
      perioada: '07.09 — 13.09', apeluri: [apel('orar', 'o1')], verdicte: new Map(), lectii: [],
    });
    expect(curat).toContain('❌ <b>N-a putut rezolva: 0</b>');
    expect(curat).toContain('• niciunul');
    expect(curat).not.toContain('Apelurile nerezolvate');
    expect(curat).not.toContain('judecător');
  });

  it('taie lista la 12 și spune din câte', () => {
    const multe = Array.from({ length: 15 }, (_, i) => apel('localitate', `l${i}`));
    const lung = compuneRaport({ perioada: 'x', apeluri: multe, verdicte: new Map(), lectii: [] });
    expect(lung).toContain('(primele 12 din 15)');
    expect(lung.split('n-a recunoscut localitatea cerută').length - 1).toBe(12);
  });

  it('escapează ce vine de la model și de la client', () => {
    const rau = compuneRaport({
      perioada: '07.09 — 13.09',
      apeluri: [apel('fara_tool', 'x', { caller_phone: '<b>+373</b>' })],
      verdicte: new Map([['x', { verdict: 'ratat', motiv: 'a cerut <script>&' }]]),
      lectii: [],
    });
    expect(rau).toContain('&lt;script&gt;&amp;');
    expect(rau).not.toContain('<script>');
    expect(rau).toContain('&lt;b&gt;+373&lt;/b&gt;');
  });

  it('nu cade pe apelul fără număr', () => {
    const anonim = compuneRaport({
      perioada: 'x', apeluri: [apel('localitate', 'a', { caller_phone: null })],
      verdicte: new Map(), lectii: [],
    });
    expect(anonim).toContain('număr necunoscut');
  });
});
