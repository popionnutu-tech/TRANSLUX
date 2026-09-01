import { describe, it, expect } from 'vitest';
import {
  seSuprapune, haversineKm, camioaneMaiAproape, coloanaKanban, urmatoareaStare, zileleCursei, areSofer,
  pozitieRecenta,
} from './camioane';

const cursa = (id: string, loadAt: string, unloadAt: string, vehicleId = 'v1') =>
  ({ id, vehicleId, loadAt, unloadAt, status: 'planificata' });

describe('seSuprapune', () => {
  it('prinde suprapunerea pe același camion', () => {
    const existente = [cursa('a', '2026-09-01T08:00:00Z', '2026-09-03T18:00:00Z')];
    const gasit = seSuprapune({ vehicleId: 'v1', loadAt: '2026-09-02T06:00:00Z', unloadAt: '2026-09-04T10:00:00Z' }, existente);
    expect(gasit?.id).toBe('a');
  });

  it('curse lipite cap la cap NU se suprapun — dispecerul planifică des așa', () => {
    const existente = [cursa('a', '2026-09-01T08:00:00Z', '2026-09-03T18:00:00Z')];
    expect(seSuprapune({ vehicleId: 'v1', loadAt: '2026-09-03T18:00:00Z', unloadAt: '2026-09-05T10:00:00Z' }, existente)).toBeNull();
  });

  it('cursa altui camion nu blochează', () => {
    const existente = [cursa('a', '2026-09-01T08:00:00Z', '2026-09-03T18:00:00Z', 'v2')];
    expect(seSuprapune({ vehicleId: 'v1', loadAt: '2026-09-02T06:00:00Z', unloadAt: '2026-09-04T10:00:00Z' }, existente)).toBeNull();
  });

  it('cursa editată nu se suprapune cu ea însăși', () => {
    const existente = [cursa('a', '2026-09-01T08:00:00Z', '2026-09-03T18:00:00Z')];
    expect(seSuprapune({ id: 'a', vehicleId: 'v1', loadAt: '2026-09-01T09:00:00Z', unloadAt: '2026-09-03T18:00:00Z' }, existente)).toBeNull();
  });

  it('cursele anulate nu blochează — ele rămân în istoric, nu în plan', () => {
    const existente = [{ ...cursa('a', '2026-09-01T08:00:00Z', '2026-09-03T18:00:00Z'), status: 'anulata' }];
    expect(seSuprapune({ vehicleId: 'v1', loadAt: '2026-09-02T06:00:00Z', unloadAt: '2026-09-04T10:00:00Z' }, existente)).toBeNull();
  });

  it('cursa nouă care înghite complet una existentă e prinsă', () => {
    const existente = [cursa('a', '2026-09-02T08:00:00Z', '2026-09-02T18:00:00Z')];
    expect(seSuprapune({ vehicleId: 'v1', loadAt: '2026-09-01T00:00:00Z', unloadAt: '2026-09-05T00:00:00Z' }, existente)?.id).toBe('a');
  });
});

describe('haversineKm', () => {
  it('Chișinău–Bălți ≈ 110 km în linie dreaptă', () => {
    const km = haversineKm({ lat: 47.0105, lng: 28.8638 }, { lat: 47.7615, lng: 27.9291 });
    expect(km).toBeGreaterThan(100);
    expect(km).toBeLessThan(120);
  });
});

describe('camioaneMaiAproape', () => {
  const constanta = { lat: 44.1733, lng: 28.6383 };
  const balti = { vehicleId: 'v-balti', plate: 'HMK139', lat: 47.7615, lng: 27.9291 };
  const chisinau = { vehicleId: 'v-chisinau', plate: '820GXP', lat: 47.0105, lng: 28.8638 };

  it('arată economia față de camionul ales (cazul Bălți→Constanța al lui Ion)', () => {
    const r = camioaneMaiAproape(constanta, balti, [balti, chisinau]);
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe('820GXP');
    expect(r[0].economieKm).toBeGreaterThan(50);
  });

  it('camionul ales nu apare în propria listă', () => {
    expect(camioaneMaiAproape(constanta, balti, [balti]).map((x) => x.vehicleId)).not.toContain('v-balti');
  });

  it('camionul ales e deja cel mai aproape → nicio avertizare', () => {
    expect(camioaneMaiAproape(constanta, chisinau, [balti, chisinau])).toEqual([]);
  });

  it('fără poziția camionului ales nu avertizează deloc (nu are cu ce compara)', () => {
    expect(camioaneMaiAproape(constanta, null, [balti])).toEqual([]);
  });
});

describe('coloanaKanban', () => {
  it('cursa activă bate starea zilei — altfel butonul care o încheie dispărea', () => {
    expect(coloanaKanban({ areSofer: true, kmAzi: 0, stareZi: 'reparatie', cursaActiva: true })).toBe('in_cursa');
  });

  it('fără cursă, reparația și odihna decid', () => {
    expect(coloanaKanban({ areSofer: true, kmAzi: 0, stareZi: 'reparatie', cursaActiva: false })).toBe('reparatie');
    expect(coloanaKanban({ areSofer: true, kmAzi: 0, stareZi: 'odihna', cursaActiva: false })).toBe('odihna');
  });

  it('cursa activă pe un camion FĂRĂ șofer rămâne pe tablou (audit High #2)', () => {
    // 23 din 39 de camioane n-au atribuire; dacă dispecerul le dă o cursă fără
    // șofer, cursa trebuie să rămână mișcabilă, nu să dispară.
    expect(coloanaKanban({ areSofer: false, kmAzi: 0, stareZi: null, cursaActiva: true })).toBe('in_cursa');
  });

  it('fără șofer și fără km — ascuns din kanban (nu lucrează, nu se ia în considerare)', () => {
    expect(coloanaKanban({ areSofer: false, kmAzi: 2, stareZi: null, cursaActiva: false })).toBeNull();
  });

  it('fără șofer dar cu km substanțiali — cere atribuirea', () => {
    expect(coloanaKanban({ areSofer: false, kmAzi: 120, stareZi: null, cursaActiva: false })).toBe('fara_sofer');
  });

  it('cu șofer: în cursă sau liber', () => {
    expect(coloanaKanban({ areSofer: true, kmAzi: 0, stareZi: null, cursaActiva: true })).toBe('in_cursa');
    expect(coloanaKanban({ areSofer: true, kmAzi: 0, stareZi: null, cursaActiva: false })).toBe('liber');
  });
});

describe('areSofer', () => {
  it('atribuirea din parc contează', () => {
    expect(areSofer({ atribuireActiva: true, soferPeCursaActiva: false })).toBe(true);
  });

  it('șoferul pus DOAR pe cursă contează la fel — altfel cursa dispărea din kanban', () => {
    // 23 din 39 de camioane n-au atribuire activă; dacă dispecerul le dă șofer pe
    // cursă, camionul trebuie să apară «în cursă», nu «fără șofer» (audit High #2).
    expect(areSofer({ atribuireActiva: false, soferPeCursaActiva: true })).toBe(true);
  });

  it('nici una, nici alta → fără șofer', () => {
    expect(areSofer({ atribuireActiva: false, soferPeCursaActiva: false })).toBe(false);
  });
});

describe('pozitieRecenta', () => {
  const acum = Date.parse('2026-09-01T12:00:00Z');
  const cuOreInUrma = (h: number) => new Date(acum - h * 3600 * 1000).toISOString();

  it('23 de ore = încă actuală, 25 = nu', () => {
    expect(pozitieRecenta(cuOreInUrma(23), acum)).toBe(true);
    expect(pozitieRecenta(cuOreInUrma(25), acum)).toBe(false);
  });

  it('poziția din august 2025 nu e actuală (cazul real măsurat 01.09)', () => {
    expect(pozitieRecenta('2025-08-29T17:57:05.000Z', acum)).toBe(false);
  });

  it('timestamp din VIITOR nu e «proaspăt» — tracker cu ceasul stricat', () => {
    expect(pozitieRecenta(new Date(acum + 3600 * 1000).toISOString(), acum)).toBe(false);
    expect(pozitieRecenta('2126-01-01T00:00:00Z', acum)).toBe(false);
  });

  it('timestamp lipsă sau invalid → nu e actuală, nu «acum»', () => {
    expect(pozitieRecenta('', acum)).toBe(false);
    expect(pozitieRecenta('gunoi', acum)).toBe(false);
  });
});

describe('urmatoareaStare', () => {
  it('merge pas cu pas până la încheiată', () => {
    expect(urmatoareaStare('planificata')).toBe('spre_incarcare');
    expect(urmatoareaStare('la_descarcare')).toBe('incheiata');
  });
  it('din încheiată sau anulată nu mai există pas', () => {
    expect(urmatoareaStare('incheiata')).toBeNull();
    expect(urmatoareaStare('anulata')).toBeNull();
  });
});

describe('zileleCursei', () => {
  it('cursa de o zi dă o singură zi', () => {
    expect(zileleCursei('2026-09-01T08:00:00Z', '2026-09-01T18:00:00Z')).toEqual(['2026-09-01']);
  });
  it('cursa multi-zi acoperă toate zilele, inclusiv capetele', () => {
    expect(zileleCursei('2026-09-01T08:00:00Z', '2026-09-03T18:00:00Z')).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });
});
