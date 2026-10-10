import { describe, expect, it } from 'vitest';
import { verificaRaspuns } from './guard';

const tool = (o: unknown) => JSON.stringify(o);

describe('paza răspunsului asistentului', () => {
  it('prinde ora UTC scrisă drept oră locală (10.10: 05:50 în loc de 08:50)', () => {
    const s = { texte: [tool({ bilete: [{ ruta: 'Chișinău → Bălți', plecare: '2026-10-13T05:50:00+00:00' }] })] };
    expect(verificaRaspuns('Chișinău → Bălți, marți 13.10, ora 05:50', s)).toEqual([{ fel: 'ora', valoare: '05:50' }]);
  });

  it('lasă ora și ziua gata scrise de server', () => {
    const s = { texte: [tool({ bilete: [{ ziua: 'marți, 13.10', ora: '08:50' }] })] };
    expect(verificaRaspuns('Chișinău → Bălți, marți 13.10, ora 08:50', s)).toEqual([]);
  });

  it('prinde suma adunată de model (540 în loc de 270)', () => {
    const s = { texte: [tool({ ok: true, tip: 'oferta', suma: 270, total: 270, cu_retur: true })] };
    expect(verificaRaspuns('Primești **270 lei** pentru fiecare. Total: 540 lei', s)).toEqual([{ fel: 'suma', valoare: '540 lei' }]);
  });

  it('telefonul: doar cel din tool-uri sau din datele fixe', () => {
    const s = { texte: [tool({ driver_line_ro: 'Șoferul Ion, +373 69 123 456' }), 'linia +373 60 401 010'] };
    expect(verificaRaspuns('Sună la +373 69 123 456 sau +373 60 401 010', s)).toEqual([]);
    expect(verificaRaspuns('Sună la +373 79 000 111', s)).toEqual([{ fel: 'telefon', valoare: '+373 79 000 111' }]);
  });

  it('orele din căutare și ora scrisă de client trec; procentul inventat nu', () => {
    const s = { texte: [tool({ trips: [{ time: '7:30' }, { time: '12:10' }], promo: { pct: 20 } }), 'Vreau după 14:00'] };
    expect(verificaRaspuns('Prima la 07:30, apoi 12:10; după 14:00 nu mai e. Reducere 20%', s)).toEqual([]);
    expect(verificaRaspuns('Ai reducere 30%', s)).toEqual([{ fel: 'procent', valoare: '30%' }]);
  });

  it('linkurile nu se citesc drept ore sau date', () => {
    expect(verificaRaspuns('https://translux.md/ro/bilet/12.10ab', { texte: [] })).toEqual([]);
  });
});
