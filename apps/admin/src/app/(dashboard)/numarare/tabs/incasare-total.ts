import type { AnomalyBreakdown, GraficRouteRow } from './incasareActions';

/**
 * INC = totalul foii: tot ce a adus cursa, pe rubrici.
 *
 * Ion, 07.10: «în INC să fie suma totală pe foaia dată — numerar + ligotnici + ligotnici gară
 * + combustibil + cheltuieli». Până acum `incasare_lei` din raport era doar numerar + diagramă,
 * deci restul rubricilor nu se vedeau nicăieri în total, deși erau pe foaie.
 *
 * Diagrama e inclusă aici: Ion a enumerat cinci rubrici și a sărit-o, dar ea era deja în
 * vechiul `incasare_lei` și e o coloană de bani ca celelalte — scoasă, totalul ar fi SCĂZUT
 * față de ce se vedea până acum. Confirmat de Ion pe 09.10: «cu diagrama, totul e ok».
 *
 * Folosit de «Pe rute (sumar)» și de «Raport pe rute»: aceeași cifră în ambele.
 */
export function incTotal(r: Pick<GraficRouteRow,
  'incasare_numerar' | 'incasare_diagrama' | 'ligotniki0_suma' |
  'ligotniki_vokzal_suma' | 'dt_suma' | 'dop_rashodi'>): number {
  return Number(r.incasare_numerar || 0)
    + Number(r.incasare_diagrama || 0)
    + Number(r.ligotniki0_suma || 0)
    + Number(r.ligotniki_vokzal_suma || 0)
    + Number(r.dt_suma || 0)
    + Number(r.dop_rashodi || 0);
}

/**
 * Același total pentru o plată de terminal nelegată de nicio cursă. Nu `incasare_lei` din
 * RPC: acolo e doar numerar + diagramă, iar ligotnicii, DT-ul și cheltuielile s-ar pierde
 * din «Bani fără rută» (sep. 2026: 13.741,67 în loc de 13.996,67 lei).
 */
export function incTotalBreakdown(b: AnomalyBreakdown | null | undefined): number {
  if (!b) return 0;
  return Number(b.numerar || 0)
    + Number(b.diagrama || 0)
    + Number(b.ligotniki0_suma || 0)
    + Number(b.ligotniki_vokzal_suma || 0)
    + Number(b.dt_suma || 0)
    + Number(b.dop_rashodi || 0);
}
