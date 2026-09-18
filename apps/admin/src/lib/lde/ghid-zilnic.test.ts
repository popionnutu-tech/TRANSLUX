import { describe, it, expect } from 'vitest';
import { ghidZilnic, type CursaMasurata } from './ghid-zilnic';

const cursa = (o: Partial<CursaMasurata>): CursaMasurata => ({
  vehicle_id: 'v1', factory_route_id: 'R', eticheta: 'U #1', uzina_id: 'U', shift_number: 1, sens: 'tur',
  km_real: 50, km_goi: 0, km_gol_acasa: 0, km_gol_pauza: 0, opriri_gol_pe_traseu: 0, km_livrare: 0,
  prima_statie: { lat: 47.5, lon: 28.0, locality: 'Sat' }, driver_id: 'd1', sofer: 'Unu',
  sat_sofer: 'Acasă', baza: { lat: 47.5, lon: 28.0 }, ...o,
});

describe('ghidul zilnic, pe curse măsurate (Ion, 18.09)', () => {
  it('prinde cursa scurtă făcută de un șofer de departe — cazul Draxelmaier #1', () => {
    // golul NU trece pe acasă (mașina s-a dus în altă parte), deci nu e cazul de
    // neglijență — rămâne întrebarea de fond: de ce o rută de 4 km o face cineva de departe
    const a = ghidZilnic([cursa({ km_real: 4, km_goi: 100, km_gol_acasa: 0 })]);
    expect(a[0].fel).toBe('cursa_scurta');
    expect(a[0].economie_km_zi).toBe(100);
    expect(a[0].instructiune).toContain('zona uzinei');
  });

  it('cursa scurtă al cărei gol trece pe acasă e mai întâi NEGLIJENȚĂ', () => {
    // aceeași cursă, dar mașina s-a dus acasă: instrucțiunea corectă e „așteaptă", nu
    // „schimbă șoferul" — și km-ii nu se numără de două ori
    const a = ghidZilnic([cursa({ km_real: 4, km_goi: 100, km_gol_acasa: 100, km_gol_pauza: 100 })]);
    expect(a.map((x) => x.fel)).toEqual(['neglijenta_asteptare']);
    expect(a[0].economie_km_zi).toBe(100);
  });

  it('o singură tură în zi și s-a dus acasă = neglijență (regula lui Ion, 18.09)', () => {
    const a = ghidZilnic([
      cursa({ sens: 'tur', km_real: 50, km_goi: 30, km_gol_acasa: 30, km_gol_pauza: 30 }),
      cursa({ sens: 'retur', km_real: 50, km_goi: 32, km_gol_acasa: 32, km_gol_pauza: 32 }),
    ]);
    const x = a.find((y) => y.fel === 'neglijenta_asteptare')!;
    expect(x.economie_km_zi).toBe(62);
    expect(x.instructiune).toContain('Trebuia să aștepte');
  });

  it('cu DOUĂ ture, drumul acasă nu mai e automat neglijență', () => {
    // a doua tură poate fi în altă zonă, deci deplasarea s-ar fi făcut oricum
    const a = ghidZilnic([
      cursa({ sens: 'tur', shift_number: 1, km_real: 50, km_goi: 40, km_gol_acasa: 40, km_gol_pauza: 40 }),
      cursa({ sens: 'retur', shift_number: 2, factory_route_id: 'R2', eticheta: 'U #2',
              km_real: 50, km_goi: 0, km_gol_acasa: 0 }),
    ]);
    expect(a.some((x) => x.fel === 'neglijenta_asteptare')).toBe(false);
  });

  it('la mai multe ture, se cere doar dacă mașina s-a întors TOT la poarta de plecare', () => {
    const a = ghidZilnic([
      cursa({ sens: 'tur', shift_number: 1, km_real: 50, km_goi: 60, km_gol_acasa: 60, km_gol_pauza: 60 }),
      cursa({ sens: 'retur', shift_number: 1, km_real: 50, km_goi: 60, km_gol_acasa: 0 }),
      cursa({ sens: 'tur', shift_number: 2, factory_route_id: 'R2', eticheta: 'U #2',
              km_real: 50, km_goi: 0, km_gol_acasa: 0 }),
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
      cursa({ sens: 'tur', km_real: 4, km_goi: 90, km_gol_acasa: 90, km_gol_pauza: 90 }),
      cursa({ sens: 'retur', km_real: 4, km_goi: 80, km_gol_acasa: 80, km_gol_pauza: 80 }),
    ]);
    expect(a.filter((x) => x.fel === 'neglijenta_asteptare')).toHaveLength(1);
    expect(a.some((x) => x.fel === 'cursa_scurta')).toBe(false);
    expect(a.reduce((t, x) => t + x.economie_km_zi, 0)).toBe(170);
  });

  it('drumul cu opriri în satele rutei NU e gol — cazul celor patru de pe 17.09', () => {
    // Ion, 18.09: «dacă au două rute, înseamnă că trebuie să se întoarcă în zonă ca să
    // ridice oamenii de acolo». Vleju Igor avea 3 opriri pe drumul socotit „gol", Guzun
    // Ivan 3, Neamtu Oleg 1, Juncu Serafim 1 — toți patru strângeau oameni, nu se plimbau.
    const a = ghidZilnic([
      cursa({ sens: 'tur', km_goi: 60, km_gol_acasa: 60, km_gol_pauza: 60, opriri_gol_pe_traseu: 0 }),
      cursa({ sens: 'retur', km_goi: 52, km_gol_acasa: 52, km_gol_pauza: 52, opriri_gol_pe_traseu: 3 }),
    ]);
    expect(a.some((x) => x.fel === 'neglijenta_asteptare')).toBe(false);
  });

  it('naveta de dimineață NU e neglijență: mașina trebuie să ajungă la lucru', () => {
    // 293QVT pe 17.09: stă acasă peste noapte, 70 km până la poartă, 73 km înapoi seara.
    // Golul trece pe acasă, dar nu e în pauză — deci nu are ce aștepta.
    const a = ghidZilnic([cursa({ km_real: 4, km_goi: 143, km_gol_acasa: 143, km_gol_pauza: 0 })]);
    expect(a.some((x) => x.fel === 'neglijenta_asteptare')).toBe(false);
    expect(a[0].fel).toBe('cursa_scurta');
  });

  it('tace sub prag: o listă lungă nu se mai citește', () => {
    expect(ghidZilnic([cursa({ km_real: 50, km_goi: 5, km_livrare: 3 })])).toEqual([]);
  });

  it('fără bază cunoscută nu se inventează un vinovat', () => {
    const a = ghidZilnic([cursa({ km_livrare: 60, baza: null })]);
    expect(a.some((x) => x.fel === 'livrare_mare')).toBe(false);
  });
});
