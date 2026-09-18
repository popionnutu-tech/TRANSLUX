import { describe, it, expect } from 'vitest';
import { ghidZilnic, type CursaMasurata } from './ghid-zilnic';

const cursa = (o: Partial<CursaMasurata>): CursaMasurata => ({
  factory_route_id: 'R', eticheta: 'U #1', uzina_id: 'U', shift_number: 1, sens: 'tur',
  km_real: 50, km_goi: 0, km_gol_acasa: 0, km_livrare: 0,
  prima_statie: { lat: 47.5, lon: 28.0, locality: 'Sat' }, driver_id: 'd1', sofer: 'Unu',
  sat_sofer: 'Acasă', baza: { lat: 47.5, lon: 28.0 }, ...o,
});

describe('ghidul zilnic, pe curse măsurate (Ion, 18.09)', () => {
  it('prinde cursa scurtă făcută de un șofer de departe — cazul Draxelmaier #1', () => {
    const a = ghidZilnic([cursa({ km_real: 4, km_goi: 100, km_gol_acasa: 100 })]);
    expect(a[0].fel).toBe('cursa_scurta');
    expect(a[0].economie_km_zi).toBe(100);
    expect(a[0].instructiune).toContain('zona uzinei');
  });

  it('prinde drumul acasă din pauză, când mașina se întoarce la aceeași poartă', () => {
    const a = ghidZilnic([
      cursa({ sens: 'tur', km_real: 50, km_goi: 30, km_gol_acasa: 30 }),
      cursa({ sens: 'retur', km_real: 50, km_goi: 32, km_gol_acasa: 32 }),
    ]);
    const x = a.find((y) => y.fel === 'drum_acasa_evitabil')!;
    expect(x.economie_km_zi).toBe(62);
    expect(x.instructiune).toContain('așteaptă');
  });

  it('NU cere așteptare când doar un capăt al pauzei trece pe acasă', () => {
    const a = ghidZilnic([
      cursa({ sens: 'tur', km_real: 50, km_goi: 60, km_gol_acasa: 60 }),
      cursa({ sens: 'retur', km_real: 50, km_goi: 60, km_gol_acasa: 0 }),
    ]);
    expect(a.some((x) => x.fel === 'drum_acasa_evitabil')).toBe(false);
  });

  it('spune care șofer din care sat ar fi mai potrivit, dintre cei din același schimb', () => {
    const a = ghidZilnic([
      cursa({ km_livrare: 40, baza: { lat: 48.1, lon: 27.8 }, sat_sofer: 'Departe' }),
      cursa({ factory_route_id: 'R2', eticheta: 'U #2', driver_id: 'd2', sofer: 'Doi',
              sat_sofer: 'Sat', baza: { lat: 47.5, lon: 28.0 } }),
    ]);
    const x = a.find((y) => y.fel === 'livrare_mare')!;
    expect(x.instructiune).toContain('Doi');
    expect(x.instructiune).toContain('Sat');
  });

  it('aceiași km nu se numără de două ori', () => {
    // o cursă cu 4 km plini și 90 km goi pe acasă se potrivește la AMÂNDOUĂ tiparele
    const a = ghidZilnic([
      cursa({ sens: 'tur', km_real: 4, km_goi: 90, km_gol_acasa: 90 }),
      cursa({ sens: 'retur', km_real: 4, km_goi: 80, km_gol_acasa: 80 }),
    ]);
    expect(a.filter((x) => x.fel === 'drum_acasa_evitabil')).toHaveLength(1);
    expect(a.some((x) => x.fel === 'cursa_scurta')).toBe(false);
    expect(a.reduce((t, x) => t + x.economie_km_zi, 0)).toBe(170);
  });

  it('tace sub prag: o listă lungă nu se mai citește', () => {
    expect(ghidZilnic([cursa({ km_real: 50, km_goi: 5, km_livrare: 3 })])).toEqual([]);
  });

  it('fără bază cunoscută nu se inventează un vinovat', () => {
    const a = ghidZilnic([cursa({ km_livrare: 60, baza: null })]);
    expect(a.some((x) => x.fel === 'livrare_mare')).toBe(false);
  });
});
