import { describe, expect, it } from 'vitest';
import { inMesaje, judeca, plinLaSingerei, rezumat, textAnaliza, ziScurta, type OprireNumarata } from './singerei-plin';

const op = (pairs: [string, number][]): OprireNumarata[] =>
  pairs.map(([stop_name_ro, total_passengers], i) => ({ stop_order: i + 1, stop_name_ro, total_passengers }));

// tur = spre Chișinău: Bălți înaintea Sîngerei
const tur = (laBalti: number, laBilicenii: number) =>
  op([['Edineț', 12], ['Bălți', laBalti], ['Bilicenii Noi', laBilicenii], ['Bilicenii Vechi', laBilicenii], ['Sîngerei', laBilicenii], ['Orhei', 5], ['Chișinău', 0]]);
// retur = din Chișinău: Chișinău prima oprire
const retur = (laChisinau: number, laGrigorauca: number) =>
  op([['Chișinău', laChisinau], ['Orhei', laChisinau], ['Copăceni', laGrigorauca], ['Grigorăuca', laGrigorauca], ['Sîngerei', laGrigorauca], ['Bălți', 3]]);

describe('plinLaSingerei', () => {
  it('tur plin din Bălți: încărcarea pe tronsonul dinainte de Sîngerei ≥ locuri', () => {
    expect(plinLaSingerei(tur(20, 20), 20)).toEqual({ incarcare: 20, locuri: 20, plin: true, plinDin: 'Bălți' });
  });
  it('retur plin din Chișinău; peste locuri (21/20) e tot plin', () => {
    expect(plinLaSingerei(retur(21, 21), 20)).toMatchObject({ plin: true, plinDin: 'Chișinău', incarcare: 21 });
  });
  it('plin doar de la o oprire de pe drum: «plin din» arată acea oprire', () => {
    expect(plinLaSingerei(retur(18, 20), 20)).toMatchObject({ plin: true, plinDin: 'Copăceni' });
  });
  it('plin din Bălți dar coborâți înainte de Sîngerei = nu e plin (avea loc liber la Sîngerei)', () => {
    expect(plinLaSingerei(tur(20, 18), 20)).toEqual({ incarcare: 18, locuri: 20, plin: false, plinDin: null });
  });
  it('locurile mașinii contează (27 de locuri, 21 de oameni = nu e plin)', () => {
    expect(plinLaSingerei(tur(21, 21), 27)?.plin).toBe(false);
  });
  it('ordinea vine din stop_order, nu din ordinea rândurilor', () => {
    expect(plinLaSingerei([...tur(20, 20)].reverse(), 20)?.plin).toBe(true);
  });
  it('fără Sîngerei sau Sîngerei prima oprire = nu se poate judeca', () => {
    expect(plinLaSingerei(op([['Bălți', 20], ['Chișinău', 0]]), 20)).toBeNull();
    expect(plinLaSingerei(op([['Sîngerei', 20], ['Chișinău', 0]]), 20)).toBeNull();
  });
});

describe('judeca + rezumat', () => {
  const c = { date: '2026-09-28', ruta: 9, retur: false, driver_id: 'a', vehicle_id: 'x' };
  it('plin / abatere / nenumărat', () => {
    expect(judeca(c, tur(20, 20), 20).verdict).toBe('plin');
    expect(judeca(c, tur(20, 15), 20).verdict).toBe('abatere');
    expect(judeca(c, undefined, 20).verdict).toBe('nenumarat');
    expect(judeca(c, [], 20).verdict).toBe('nenumarat');
  });
  it('rezumatul pune întâi cine are cele mai multe abateri reale', () => {
    const rows = [
      judeca({ ...c, driver_id: 'a' }, tur(20, 20), 20),
      judeca({ ...c, driver_id: 'a' }, tur(20, 20), 20),
      judeca({ ...c, driver_id: 'b' }, tur(10, 10), 20),
      judeca({ ...c, driver_id: 'b' }, undefined, 20),
    ];
    expect(rezumat(rows, (r) => r.driver_id!)).toEqual([
      { cheie: 'b', total: 2, abatere: 1, plin: 0, nenumarat: 1 },
      { cheie: 'a', total: 2, abatere: 0, plin: 2, nenumarat: 0 },
    ]);
  });
});

describe('textAnaliza', () => {
  const nume = { sofer: (id: string | null) => (id ? `Șofer ${id}` : null), masina: (id: string | null) => (id ? `AB${id}` : null) };
  const ctx = { perioada: '28.09–04.10.2026', curseJudecate: 300, locuriImplicite: 20 };
  it('antetul, rezumatele și cursele, pe română', () => {
    const rows = [
      judeca({ date: '2026-09-28', ruta: 9, retur: true, driver_id: 'a', vehicle_id: 'x' }, retur(20, 20), 20),
      judeca({ date: '2026-09-29', ruta: 4, retur: false, driver_id: 'b', vehicle_id: 'y' }, tur(15, 14), 20),
      judeca({ date: '2026-09-29', ruta: 4, retur: true, driver_id: '<i>', vehicle_id: null }, undefined, 20),
    ];
    const t = textAnaliza(rows, ctx, nume).join('\n');
    expect(t).toContain('Sîngerei — săptămâna 28.09–04.10.2026');
    expect(t).toContain('Fără trecere prin Sîngerei (nici centru, nici oprire la Intersecția Vrănești): <b>3</b>');
    expect(t).toContain('❌ nepline — abatere: <b>1</b>');
    expect(t).toContain('✅ pline la intrarea în Sîngerei — scoase din analiză: <b>1</b>');
    expect(t).toContain('❔ nenumărate pe camere: <b>1</b>');
    expect(t).toContain('Șofer b — 1 · 0 · 0');
    expect(t).toContain('<u>Lu 28.09</u>\nR9 retur · Șofer a · ABx — ✅ 20/20 plin din Chișinău');
    // abaterile nu mai apar în listă (Ion, 07.10: «3. ok»), doar în rezumate
    expect(t).not.toContain('R4 tur · Șofer b · ABy — ❌');
    expect(t).toContain('Șofer &lt;i&gt; · mașină necunoscută — ❔ nenumărat');
    expect(t).not.toMatch(/Рейс|водитель/);
  });
  it('săptămână curată: doar antetul; zilele fără GPS se spun', () => {
    const t = textAnaliza([], { ...ctx, zileFaraGps: ['30.09'] }, nume);
    expect(t).toHaveLength(1);
    expect(t[0]).toContain('<b>0</b>');
    expect(t[0]).toContain('Zile fără GPS (nejudecate): 30.09');
    expect(t[0]).not.toContain('Pe șofer');
  });
});

describe('inMesaje + ziScurta', () => {
  it('nu rupe rânduri și ține limita', () => {
    const m = inMesaje(['a'.repeat(6), 'b'.repeat(6), 'c'.repeat(6)], 14);
    expect(m).toEqual(['aaaaaa\nbbbbbb', 'cccccc']);
  });
  it('ziua scurtă pe română', () => {
    expect(ziScurta('2026-10-04')).toBe('Du 04.10');
  });
});
