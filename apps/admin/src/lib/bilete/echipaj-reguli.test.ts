import { describe, expect, it } from 'vitest';
import { buildReturAssignmentMap, buildTurAssignmentMap } from '@translux/db';
import {
  cheieEchipaj, clasaRaspuns, deTrimis, echipajDinGrafic, echipajPentruBilet, mesajEchipaj, placaFormatata,
  prenumeSofer, randulEchipajului, telefonPublic, type RandAtribuire,
} from './echipaj-reguli';

const R = (o: Partial<RandAtribuire> & { crm_route_id: number; driver_id: string }): RandAtribuire => ({ vehicle_id: `v-${o.driver_id}`, ...o });
const soferi = new Map([['d1', { full_name: 'Popescu Ion', phone: '069123456' }], ['d2', { full_name: 'Rusu Vasile', phone: null }], ['d3', { full_name: 'Zaiț S.', phone: '37368000111' }]]);
const masini = new Map([['v-d1', { plate_number: '651akd' }], ['v-d2', { plate_number: 'ABC123' }], ['v-d3', { plate_number: 'KLM 007' }], ['vr', { plate_number: '111XYZ' }]]);

describe('randulEchipajului = aceeași regulă ca buildTur/ReturAssignmentMap', () => {
  it('pe 2.000 de grafice aleatoare dă același șofer și aceeași mașină', () => {
    let seed = 7; const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    for (let k = 0; k < 2000; k++) {
      const randuri: RandAtribuire[] = Array.from({ length: 1 + rnd(6) }, (_, i) => ({
        crm_route_id: 1 + rnd(4), driver_id: `d${i}`, vehicle_id: rnd(4) ? `v${i}` : null,
        retur_route_id: rnd(3) === 0 ? 1 + rnd(4) : null, driver_id_retur: rnd(4) === 0 ? `dr${i}` : null, vehicle_id_retur: rnd(4) === 0 ? `vr${i}` : null,
      }));
      const tur = buildTurAssignmentMap(randuri as never); const ret = buildReturAssignmentMap(randuri as never);
      for (const ruta of [1, 2, 3, 4]) {
        const t = randulEchipajului(randuri, ruta, false); const r = randulEchipajului(randuri, ruta, true);
        expect(t ? { driver_id: t.driver_id, vehicle_id: t.vehicle_id } : undefined).toEqual(tur.get(ruta));
        expect(r ? { driver_id: r.driver_id, vehicle_id: r.vehicle_id } : undefined).toEqual(ret.get(ruta));
      }
    }
  });
});

describe('echipajDinGrafic', () => {
  const baza = { bifat: true, anulata: false, randuri: [R({ crm_route_id: 7, driver_id: 'd1' })], ruta: 7, goingNorth: false, soferi, masini };
  it('bifat + rând al dispecerului → gata, placa formatată, prenumele, telefonul +373', () => {
    expect(echipajDinGrafic(baza)).toEqual({ stare: 'gata', placa: '651 AKD', prenume: 'Ion', telefon: '+373 69 123 456', vehicle_id: 'v-d1', driver_id: 'd1' });
  });
  it('fără bifă → astept; anulată → anulat; copia auto de la 20:00 → astept; fără mașină → astept', () => {
    expect(echipajDinGrafic({ ...baza, bifat: false })).toEqual({ stare: 'astept' });
    expect(echipajDinGrafic({ ...baza, anulata: true })).toEqual({ stare: 'anulat' });
    expect(echipajDinGrafic({ ...baza, randuri: [R({ crm_route_id: 7, driver_id: 'd1', auto_copied: true })] })).toEqual({ stare: 'astept' });
    expect(echipajDinGrafic({ ...baza, randuri: [R({ crm_route_id: 7, driver_id: 'd1', vehicle_id: null })] })).toEqual({ stare: 'astept' });
    expect(echipajDinGrafic({ ...baza, ruta: 9 })).toEqual({ stare: 'astept' });
  });
  it('retur cu override: mașina și șoferul de retur', () => {
    const randuri = [R({ crm_route_id: 7, driver_id: 'd1', retur_route_id: 8 }), R({ crm_route_id: 8, driver_id: 'd2', retur_route_id: 7, vehicle_id_retur: 'vr' })];
    expect(echipajDinGrafic({ ...baza, randuri, goingNorth: true })).toMatchObject({ stare: 'gata', placa: '111 XYZ', prenume: 'Vasile', telefon: null });
  });
  it('prenumele: inițialele nu-s nume', () => { expect(prenumeSofer('Zaiț S.')).toBeNull(); expect(prenumeSofer('Docuciaev Dumitru Petru')).toBe('Dumitru'); });
});

describe('formatări', () => {
  it('placa și telefonul', () => {
    expect(placaFormatata('651akd')).toBe('651 AKD'); expect(placaFormatata('KLM 007')).toBe('KLM 007'); expect(placaFormatata('')).toBeNull();
    expect(telefonPublic('069123456')).toBe('+373 69 123 456'); expect(telefonPublic('37368000111')).toBe('+373 68 000 111'); expect(telefonPublic('123')).toBeNull();
  });
});

describe('echipajPentruBilet — telefonul doar în fereastra plecare ± 3 h', () => {
  const e = { stare: 'gata' as const, placa: '651 AKD', prenume: 'Ion', telefon: '+373 69 123 456', vehicle_id: 'v', driver_id: 'd' };
  const plec = '2026-10-09T06:00:00Z'; const t = Date.parse(plec);
  it('înainte de fereastră fără telefon; în ea cu telefon', () => {
    expect(echipajPentruBilet(e, plec, t - 4 * 3_600_000).telefon).toBeNull();
    expect(echipajPentruBilet(e, plec, t - 2 * 3_600_000).telefon).toBe('+373 69 123 456');
    expect(echipajPentruBilet({ stare: 'astept' }, plec, t)).toEqual({ stare: 'astept', placa: null, sofer: null, telefon: null });
  });
});

describe('deTrimis', () => {
  const g = (v: string, d: string, tel = '-') => `${v}|${d}|${tel}`;
  const zi = { mesaje: 0, oraChisinau: 12, pleacaInMs: 20 * 3_600_000 };
  it('prima, schimbare, telefon, retras', () => {
    expect(deTrimis({ ...zi, trimis: null, nou: g('v1', 'd1') })).toBe('prima');
    expect(deTrimis({ ...zi, trimis: g('v1', 'd1'), nou: g('v1', 'd1') })).toBeNull();
    expect(deTrimis({ ...zi, trimis: g('v1', 'd1'), nou: g('v2', 'd1'), mesaje: 1 })).toBe('schimbare');
    expect(deTrimis({ ...zi, trimis: g('v1', 'd1'), nou: g('v1', 'd1', 'tel'), mesaje: 1 })).toBe('telefon');
    expect(deTrimis({ ...zi, trimis: g('v1', 'd1'), nou: 'anulat', mesaje: 1 })).toBe('retras');
    expect(deTrimis({ ...zi, trimis: g('v1', 'd1'), nou: 'astept', mesaje: 1 })).toBe('retras');
    expect(deTrimis({ ...zi, trimis: null, nou: 'astept' })).toBeNull();
    expect(deTrimis({ ...zi, trimis: 'astept', nou: g('v1', 'd1') })).toBe('prima');
  });
  it('cel mult 3 mesaje de schimbare; noaptea doar cursele din următoarele 12 h', () => {
    expect(deTrimis({ ...zi, trimis: g('v1', 'd1'), nou: g('v2', 'd2'), mesaje: 3 })).toBeNull();
    expect(deTrimis({ ...zi, oraChisinau: 23, trimis: null, nou: g('v1', 'd1') })).toBeNull();
    expect(deTrimis({ ...zi, oraChisinau: 5, pleacaInMs: 2 * 3_600_000, trimis: null, nou: g('v1', 'd1') })).toBe('prima');
  });
});

describe('cheieEchipaj și mesajEchipaj', () => {
  const e = { stare: 'gata' as const, placa: '651 <b>AKD', prenume: 'Ion & Co', telefon: '+373 69 123 456', vehicle_id: 'v', driver_id: 'd' };
  it('telefonul intră în cheie doar când clientul îl poate primi', () => {
    expect(cheieEchipaj(e, true)).toBe('v|d|tel'); expect(cheieEchipaj(e, false)).toBe('v|d|-'); expect(cheieEchipaj({ stare: 'anulat' }, true)).toBe('anulat');
  });
  it('HTML scăpat; telefon doar cu cuTelefon; RU', () => {
    const m = mesajEchipaj({ lang: 'ro', fel: 'prima', from: 'Briceni', to: 'Chișinău <x>', plecare: 'joi 09.10, 04:45', e, cuTelefon: false });
    expect(m).toContain('651 &lt;b&gt;AKD'); expect(m).toContain('Ion &amp; Co'); expect(m).toContain('Chișinău &lt;x&gt;'); expect(m).not.toContain('+373 69');
    expect(mesajEchipaj({ lang: 'ro', fel: 'prima', from: 'A', to: 'B', plecare: 'x', e, cuTelefon: true })).toContain('📞 +373 69 123 456');
    expect(mesajEchipaj({ lang: 'ru', fel: 'schimbare', from: 'A', to: 'B', plecare: 'x', e, cuTelefon: false })).toContain('Сменился автобус');
    expect(mesajEchipaj({ lang: 'ro', fel: 'retras', from: 'A', to: 'B', plecare: 'x', e: { stare: 'anulat' }, cuTelefon: false })).toContain('a fost anulată');
  });
});

describe('clasaRaspuns — doar blocarea sigură oprește trimiterile (C1)', () => {
  it('clase', () => {
    expect(clasaRaspuns(200, null, false)).toBe('trimis');
    expect(clasaRaspuns(403, 'Forbidden: bot was blocked by the user', false)).toBe('blocat');
    expect(clasaRaspuns(403, 'Forbidden: user is deactivated', false)).toBe('blocat');
    expect(clasaRaspuns(400, 'Bad Request: chat not found', false)).toBe('blocat');
    expect(clasaRaspuns(429, 'Too Many Requests: retry after 5', false)).toBe('temporar');
    expect(clasaRaspuns(400, "Bad Request: can't parse entities", false)).toBe('temporar');
    expect(clasaRaspuns(502, null, false)).toBe('temporar');
    expect(clasaRaspuns(null, null, false)).toBe('temporar');
    expect(clasaRaspuns(null, null, true)).toBe('incert');
  });
});
