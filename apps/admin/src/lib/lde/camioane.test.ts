import { describe, it, expect } from 'vitest';
import {
  seSuprapune, haversineKm, camioaneMaiAproape, coloanaKanban, urmatoareaStare, zileleCursei, areSofer,
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

  it('fără camion ales întoarce cele mai apropiate, fără economie', () => {
    const r = camioaneMaiAproape(constanta, null, [balti]);
    expect(r[0].economieKm).toBe(0);
  });
});

describe('coloanaKanban', () => {
  it('reparația și odihna bat cursa activă', () => {
    expect(coloanaKanban({ areSofer: true, kmAzi: 0, stareZi: 'reparatie', cursaActiva: true })).toBe('reparatie');
    expect(coloanaKanban({ areSofer: true, kmAzi: 0, stareZi: 'odihna', cursaActiva: false })).toBe('odihna');
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
