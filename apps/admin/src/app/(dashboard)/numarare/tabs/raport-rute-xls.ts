import type * as XLSXType from 'xlsx';
import type { CategorieFaraRuta, RaportPeRute, Subtotal } from './raport-rute';

/** ISO → DD.MM.YYYY ca text: o dată-text nu se mută pe fus în Excel. */
export function dmy(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

export const ETICHETA_CATEGORIE: Record<CategorieFaraRuta, string> = {
  NO_FOAIE: 'Terminal: foaia nu e în /grafic',
  INVALID_FORMAT: 'Terminal: număr de foaie invalid',
  FOAIE_FARA_CURSA: 'Terminal: foaia n-a nimerit nicio cursă',
  manual_fara_ruta: 'Manual: cursa nu e în /grafic pentru ziua foii',
  manual_fara_identificare: 'Manual: fără cursă și fără număr',
  manual_cursa_gresita: 'Manual: atașat altei curse decât a foii (reatașează)',
};

export const ETICHETA_DE_VERIFICAT = {
  dublura_terminal: 'Foaia a trecut și prin terminal — dublură sau rest predat în numerar',
  cursa_cu_terminal: 'Cursa a primit deja bani de la terminal — verifică dacă nu e dublură',
} as const;

const ANTET_RUTE = [
  'Rută', 'Ora', 'ID', 'Tip', 'Curse', 'Cu încasare', 'Fără încasare', 'Numărat pe cele fără încasare',
  'Numerar', 'Diagramă', 'Ligotnici 0', 'Ligotnici gară', 'Combustibil DT', 'Cheltuieli',
  'Total foaie', 'Medie pe cursă', 'Numărare', 'Diferență (cu numărare)', 'Steag',
];

function subtotalRow(label: string, s: Subtotal): (string | number | null)[] {
  return [label, '', '', '', s.curse, s.cuIncasare, s.faraIncasare, s.numaratFaraIncasare,
    s.numerar, s.diagrama, s.ligotniki0, s.ligotnikiGara, s.dt, s.cheltuieli,
    s.total, s.cuIncasare > 0 ? Math.round((s.total / s.cuIncasare) * 100) / 100 : null, s.numarare, s.diferenta, ''];
}

// Banii ca numere cu format, nu ca text: altfel Excel nu le adună.
function formatBani(ws: XLSXType.WorkSheet, XLSX: typeof XLSXType, cols: number[], fromRow: number) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = fromRow; r <= range.e.r; r++) {
    for (const c of cols) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === 'n') cell.z = '#,##0.00';
    }
  }
}

export function construiesteExcel(XLSX: typeof XLSXType, r: RaportPeRute, generatLa: string): XLSXType.WorkBook {
  const wb = XLSX.utils.book_new();
  const titlu = [
    [`Încasări factice pe rute, după data foii de parcurs: ${dmy(r.from)} – ${dmy(r.to)}`],
    [`Generat: ${generatLa}. Total foaie = numerar + diagramă + ligotnici 0 + ligotnici gară + combustibil DT + cheltuieli.`],
    [],
  ];

  const rows: (string | number | null)[][] = [...titlu, ANTET_RUTE];
  for (const tip of ['interurban', 'suburban'] as const) {
    const lista = r.rute.filter(x => x.route_type === tip);
    if (lista.length === 0) continue;
    for (const a of lista) {
      rows.push([a.route_name, a.time_nord || '', a.crm_route_id, tip === 'interurban' ? 'Interurban' : 'Suburban',
        a.curse, a.cuIncasare, a.faraIncasare, a.numaratFaraIncasare,
        a.numerar, a.diagrama, a.ligotniki0, a.ligotnikiGara, a.dt, a.cheltuieli,
        a.total, a.mediePeCursa, a.numarare, a.diferenta, a.steag ? 'sub 50% curse cu bani' : '']);
    }
    rows.push(subtotalRow(tip === 'interurban' ? 'Subtotal interurban' : 'Subtotal suburban', r.subtotaluri[tip]));
  }
  rows.push(subtotalRow('TOTAL PE RUTE', r.totalRute));
  rows.push(['Bani fără rută', '', '', '', null, null, null, null, null, null, null, null, null, null, r.faraRuta.total]);
  rows.push(['TOTAL GENERAL', '', '', '', null, null, null, null, null, null, null, null, null, null, r.totalGeneral]);
  rows.push(['De verificat (în afara totalului)', '', '', '', null, null, null, null, null, null, null, null, null, null, r.deVerificat.total]);
  rows.push(['TOTAL GENERAL + DE VERIFICAT', '', '', '', null, null, null, null, null, null, null, null, null, null, r.totalGeneralCuDeVerificat]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  formatBani(ws, XLSX, [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], titlu.length + 1);
  ws['!cols'] = [{ wch: 34 }, { wch: 14 }, { wch: 5 }, { wch: 11 }, ...ANTET_RUTE.slice(4).map(() => ({ wch: 13 }))];
  XLSX.utils.book_append_sheet(wb, ws, 'Pe rute');

  const fr: (string | number)[][] = [
    ['Categorie', 'Foaie', 'Ziua în raport (plata / cursa)', 'Ziua foii', 'Șofer', 'Rută', 'Cursa corectă a foii', 'Total'],
    ...r.faraRuta.randuri.map(b => [ETICHETA_CATEGORIE[b.categorie], b.foaie_nr || '', dmy(b.ziua),
      dmy(b.ziua_foaie), b.driver_name || '', b.route_name || '', b.cursa_corecta || '', b.total]),
  ];
  const wsF = XLSX.utils.aoa_to_sheet(fr);
  formatBani(wsF, XLSX, [7], 1);
  wsF['!cols'] = [{ wch: 48 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 26 }, { wch: 28 }, { wch: 40 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsF, 'Bani fără rută');

  const dv: (string | number)[][] = [
    ['Motiv', 'Foaie', 'Ziua introducerii', 'Data foii', 'Șofer', 'Rută', 'Terminal pe aceeași foaie', 'Numărat pe cursă', 'Total manual'],
    ...r.deVerificat.randuri.map(b => [ETICHETA_DE_VERIFICAT[b.motiv], b.foaie_nr || '', dmy(b.ziua),
      dmy(b.data_foaie), b.driver_name || '', b.route_name || '', b.terminal_pe_foaie ?? '', b.numarare_cursa ?? '', b.total]),
  ];
  const wsV = XLSX.utils.aoa_to_sheet(dv);
  formatBani(wsV, XLSX, [6, 7, 8], 1);
  wsV['!cols'] = [{ wch: 60 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 26 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsV, 'De verificat');

  return wb;
}
