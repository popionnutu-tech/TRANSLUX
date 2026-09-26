// Rândul «DRAXELMAIER» minim pentru teste (forma din drax/cod/saptamanal/scrie-analiza.mjs, două mașini).
import type { AnalizaDrax, MasinaDrax } from './drax-analiza';

const km = { cuOameni: 100, livrare: 50, golRuta: 0, golTure: 10, parc: 5, service: 0, deplasare: 0, legatura: 20, necunoscut: 0 };
const liber = (k: number, br = 0) => ({ km: k, prag_km: 50, peste_prag: k > 50, zile: k ? 1 : 0, km_brambura: br, prag_brambura_km: 50, peste_prag_brambura: br > 50,
  km_alta_uzina: 0, km_neclar: 0, km_naveta: 0, km_reparatie: 0, iesiri: [] });
const masina = (m: string, e: { R1a: number; R1b: number; R3: number }, o: Partial<MasinaDrax> = {}): MasinaDrax => ({
  m, zile: 5, zileIncluse: 4, zileExcluse: 1, total: 185, km, rute: [{ r: 'R8|Costesti', nume: 'R8 · Costesti', curse: 10, km: 400, zile: 5 }],
  casa: 'Zăicani', casaKmPoarta: 40, regula: 'B', economie: { ...e, B: e.R1a + e.R1b + e.R3, A: null, nelamurit: 0 },
  extrapolat: { ...e, B: e.R1a + e.R1b + e.R3 }, deLamuritScos: { R1a: 0, R1b: 0, R3: 0, B: 0, masurat: { R1a: 0, R1b: 0, R3: 0 } },
  dejaLangaUzina: { intervale: 0, km: 0 }, nelamuritLista: [], curseDePranz: { intervale: 0, km: 0, lista: [] },
  lei: { masurat: 100, extrapolat: 120 }, normaLipsa: false, deLamurit: null, liber: liber(0), liberBrut: null, kmExplicatF2: 0, steaguriLiber: [],
  detalii: [], ...o,
});

export function fixtureDrax(): AnalizaDrax {
  const masini = [
    masina('345KAJ', { R1a: 449.2, R1b: 528.3, R3: 0 }),
    masina('024XKY', { R1a: 100, R1b: 20, R3: 30 }, { deLamurit: 'drumuri spre Drochia', deLamuritScos: { R1a: 706.7, R1b: 0, R3: 0, B: 706.7, masurat: { R1a: 500, R1b: 0, R3: 0 } },
      liber: liber(61, 55) }),
  ];
  const s = (k: 'R1a' | 'R1b' | 'R3' | 'B') => masini.reduce((a, m) => a + (m.extrapolat[k] ?? 0), 0);
  return {
    uzina: 'DRAXELMAIER', saptamina: '2026-09-14', pana_la: '2026-09-20',
    total: { ...km, brambura: 55 }, zile: 10, zileBilantOk: 10, masini, rute: [{ id: 'R8|Costesti', nume: 'R8 · Costesti', livrare: 50, masini: ['345KAJ'] }],
    economie: {
      regula: 'B', formulare: 'cost de azi', zileLV: 10, esantion: 8, nedetectate: 2,
      carduri: { masini: 2, nemasurate: [], R1a: s('R1a'), R1b: s('R1b'), R3: s('R3'), B: s('B'), R1bR3: s('R1b') + s('R3'), lei: 240,
        deLamurit: { masini: ['024XKY'], B: 706.7, R1a: 706.7, R1b: 0, R3: 0 } },
      referintaF2: { extrapolare: {}, lei: 0, nota: '' }, saptAtipica: false, flotaPrecedenta: 2, masurat: {}, deja: { n: 0, km: 0 },
      nemasurate: [], putinMasurate: [], normaLipsa: [], lei: { masurat: 200, extrapolat: 240 },
    },
    indicatii: { prag_km: 100, peste_prag: 1, top: [{ m: '345KAJ', R1b: 528.3, R3: 0, R1a: 449.2, zile: '4/5', R1bR3: 528.3 }] },
    deLamurit: [{ m: '024XKY', motiv: 'drumuri spre Drochia' }], referinte: { 'schelet-ideal': 'abc' },
    timp_liber: { prag_km: 50, km_total: 61, masini_peste_prag: ['024XKY'], km_brambura_total: 55, masini_peste_prag_brambura: ['024XKY'],
      km_neclar_total: 0, km_reparatie_total: 0, km_explicat_f2: 0, km_alta_uzina_total: 0, brut: { km: 0, km_brambura: 0, km_neclar: 0 }, R_PARC_ZONA: 1 },
    control: { probe: {}, P10: { masini: 2, pica: [], picaC: [], pasi: {}, scoasDePrioritateaF2: { liber: 0, brambura: 0 } }, bilant: null, schimb3: null },
  };
}
