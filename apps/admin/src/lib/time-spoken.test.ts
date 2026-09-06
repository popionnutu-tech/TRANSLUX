import { describe, it, expect } from 'vitest';
import { timeSpoken } from './time-spoken';
import { parseSpokenTimes } from './voice-controller';

describe('timeSpoken', () => {
  it('minutul 00 → «fix» / «ноль-ноль»', () => {
    expect(timeSpoken('16:00')).toEqual({ ro: 'șaisprezece fix', ru: 'шестнадцать ноль-ноль' });
  });

  it('minutele ≥10 se leagă cu «și»', () => {
    expect(timeSpoken('18:20')?.ro).toBe('optsprezece și douăzeci');
    expect(timeSpoken('16:45')?.ro).toBe('șaisprezece și patruzeci și cinci');
  });

  it('minutele 1-9 primesc «zero» în RO, nu «și»', () => {
    // Fără «zero», 20:05 ieșea «douăzeci și cinci» — litera-cu-literă numărul 25.
    expect(timeSpoken('20:05')?.ro).toBe('douăzeci zero cinci');
    expect(timeSpoken('09:05')?.ro).toBe('nouă zero cinci');
    expect(timeSpoken('13:05')?.ro).toBe('treisprezece zero cinci');
  });

  it('nicio oră cu minute 01-09 nu mai coincide cu un numeral', () => {
    // 20:01…20:09 dădeau exact «douăzeci și unu»…«douăzeci și nouă» = 21…29.
    for (let m = 1; m <= 9; m++) {
      const ro = timeSpoken(`20:0${m}`)!.ro;
      expect(ro).toContain('zero');
      expect(ro).not.toMatch(/^douăzeci și/);
    }
  });

  it('rusa rămâne neschimbată', () => {
    expect(timeSpoken('20:05')?.ru).toBe('двадцать ноль пять');
    expect(timeSpoken('18:20')?.ru).toBe('восемнадцать двадцать');
  });

  it('intrare invalidă → null', () => {
    expect(timeSpoken('25:00')).toBeNull();
    expect(timeSpoken('abc')).toBeNull();
    expect(timeSpoken(null)).toBeNull();
  });
});

describe('parseSpokenTimes — simetria cu emitentul', () => {
  it('citește înapoi exact ce emite timeSpoken (minute 1-9)', () => {
    for (const t of ['20:05', '09:05', '13:05']) {
      expect(parseSpokenTimes(`pleacă la ${timeSpoken(t)!.ro}`)).toContain(t);
    }
  });

  // GAURĂ CUNOSCUTĂ, nu regresie: parserul taie `min % 5 !== 0` ca zgomot, pe
  // premisa «orarul are mereu minutele multiplu de 5». Premisa e falsă — în
  // crm_stop_fares există :07 (11 opriri), :17 (9), :57 (7), :12, :32, :52…
  // Emitentul le rostește corect; controlorul nu le vede. De decis separat:
  // scoaterea filtrului lărgește acoperirea, dar poate aduce fals-pozitive.
  it('minutele care nu-s multiplu de 5 rămân invizibile pentru controlor', () => {
    expect(timeSpoken('09:07')?.ro).toBe('nouă zero șapte');
    expect(parseSpokenTimes('pleacă la nouă zero șapte')).toEqual([]);
  });

  it('citește înapoi și minutele ≥10 și «fix»', () => {
    expect(parseSpokenTimes(`la ${timeSpoken('18:20')!.ro}`)).toContain('18:20');
    expect(parseSpokenTimes(`la ${timeSpoken('16:00')!.ro}`)).toContain('16:00');
  });

  it('numeralul «douăzeci și cinci» NU mai e citit ca oră', () => {
    // Motivul pentru care minutele 1-9 erau excluse din parser: «am găsit douăzeci
    // și unu de curse» s-ar fi citit 20:01. Forma «zero X» rezolvă ambele capete.
    expect(parseSpokenTimes('am găsit douăzeci și unu de curse')).toEqual([]);
    expect(parseSpokenTimes('costă douăzeci și cinci de lei')).toEqual([]);
  });

  it('fraza reală din apelul 06.09 — cursa inventată devine vizibilă', () => {
    const vechi = 'Cea mai apropiată pleacă la optsprezece și douăzeci. Apoi la douăzeci și cinci.';
    // Înainte: «douăzeci și cinci» nu se parsa deloc → spoken_time_mismatch tăcea.
    expect(parseSpokenTimes(vechi)).not.toContain('20:05');
    // Acum agentul rostește forma emisă de tool, iar controlorul o vede.
    const nou = `Cea mai apropiată pleacă la ${timeSpoken('18:20')!.ro}. Apoi la ${timeSpoken('20:05')!.ro}.`;
    expect(parseSpokenTimes(nou)).toEqual(expect.arrayContaining(['18:20', '20:05']));
  });
});
