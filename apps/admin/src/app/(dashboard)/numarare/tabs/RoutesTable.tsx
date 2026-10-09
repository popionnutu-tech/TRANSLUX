'use client';

import { useMemo, useState } from 'react';
import type { GraficRouteRow, RouteStatus } from './incasareActions';

interface Props {
  routes: GraficRouteRow[];
}

const STATUS_META: Record<RouteStatus, { label: string; color: string; icon: string }> = {
  ok:           { label: 'OK',            color: 'var(--success)',     icon: '✓' },
  underpaid:    { label: 'Datorează',     color: 'var(--danger)',      icon: '⚠' },
  overpaid:     { label: 'În plus',       color: 'var(--warning)',     icon: 'ℹ' },
  no_numarare:  { label: 'Fără numărare', color: 'var(--warning)',     icon: '?' },
  no_incasare:  { label: 'Fără încasare', color: 'var(--danger)',      icon: '✗' },
  no_foaie:     { label: 'Fără foaie',    color: 'var(--danger)',      icon: '✗' },
  no_driver:    { label: 'Fără șofer',    color: 'var(--text-muted)',  icon: '·' },
  no_data:      { label: 'Fără date',     color: 'var(--text-muted)',  icon: '—' },
  empty:        { label: '—',             color: 'var(--text-muted)',  icon: '·' },
  cancelled:    { label: 'Anulată',       color: 'var(--text-muted)',  icon: '⊘' },
};

// Convertește "08:00 - 12:40" sau "8:00" la prima oră (pentru sortare)
function parseFirstTime(s: string | null): number {
  if (!s) return 9999;
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 9999;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Data foii (ISO YYYY-MM-DD) → DD.MM.YYYY, fără a trece prin Date (evită deriva de fus).
function formatData(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

/**
 * INC = totalul foii: tot ce a adus cursa, pe rubrici.
 *
 * Ion, 07.10: «în INC să fie suma totală pe foaia dată — numerar + ligotnici + ligotnici gară
 * + combustibil + cheltuieli». Până acum `incasare_lei` din raport era doar numerar + diagramă,
 * deci restul rubricilor nu se vedeau nicăieri în total, deși erau pe foaie.
 *
 * Diagrama e inclusă aici: Ion a enumerat cinci rubrici și a sărit-o, dar ea era deja în
 * vechiul `incasare_lei` și e o coloană de bani ca celelalte — scoasă, totalul ar fi SCĂZUT
 * față de ce se vedea până acum. De confirmat; e o singură linie de schimbat.
 */
function incTotal(r: GraficRouteRow): number {
  return Number(r.incasare_numerar || 0)
    + Number(r.incasare_diagrama || 0)
    + Number(r.ligotniki0_suma || 0)
    + Number(r.ligotniki_vokzal_suma || 0)
    + Number(r.dt_suma || 0)
    + Number(r.dop_rashodi || 0);
}

function num(v: number) {
  if (!v || v <= 0) return <span className="text-muted">—</span>;
  return <strong>{Math.round(v)}</strong>;
}

type SortKey = 'default' | 'Data' | 'Ruta' | 'Sofer';
type SortDir = 'asc' | 'desc';

export default function RoutesTable({ routes }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterRuta, setFilterRuta] = useState('');
  const [filterSofer, setFilterSofer] = useState('');
  const [filterOra, setFilterOra] = useState('');

  // Ordinea implicită: ziua descrescător (recent sus), apoi ora cursei, apoi ruta.
  const defaultCompare = (a: GraficRouteRow, b: GraficRouteRow) => {
    if (a.ziua !== b.ziua) return a.ziua < b.ziua ? 1 : -1;
    const ta = parseFirstTime(a.time_nord);
    const tb = parseFirstTime(b.time_nord);
    if (ta !== tb) return ta - tb;
    return (a.route_name || '').localeCompare(b.route_name || '');
  };

  const routeOptions = useMemo(
    () => Array.from(new Set(routes.map(r => r.route_name).filter(Boolean))).sort((a, b) => (a || '').localeCompare(b || '', 'ro')),
    [routes],
  );
  const soferOptions = useMemo(
    () => Array.from(new Set(routes.map(r => r.driver_name).filter(Boolean))).sort((a, b) => (a || '').localeCompare(b || '', 'ro')),
    [routes],
  );
  const oraOptions = useMemo(
    () => Array.from(new Set(routes.map(r => r.time_nord).filter(Boolean))).sort((a, b) => parseFirstTime(a) - parseFirstTime(b)),
    [routes],
  );

  // Filtrare + sortare — afectează doar afișarea.
  const processed = useMemo(() => {
    let list = routes;
    if (filterRuta) list = list.filter(r => r.route_name === filterRuta);
    if (filterSofer) list = list.filter(r => r.driver_name === filterSofer);
    if (filterOra) list = list.filter(r => r.time_nord === filterOra);
    const arr = [...list];
    if (sortKey === 'default') {
      arr.sort(defaultCompare);
    } else {
      arr.sort((a, b) => {
        let c = 0;
        if (sortKey === 'Data') c = (a.ziua || '').localeCompare(b.ziua || '');
        else if (sortKey === 'Ruta') c = (a.route_name || '').localeCompare(b.route_name || '', 'ro');
        else if (sortKey === 'Sofer') c = (a.driver_name || '').localeCompare(b.driver_name || '', 'ro');
        if (c !== 0) return sortDir === 'asc' ? c : -c;
        return defaultCompare(a, b);
      });
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, filterRuta, filterSofer, filterOra, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t = { num: 0, inc: 0, nm: 0, lg: 0, dg: 0, vk: 0, dt: 0, rs: 0, extra2t: 0 };
    for (const r of processed) {
      t.num += r.numarare_lei;
      t.inc += incTotal(r);
      t.nm  += r.incasare_numerar;
      t.lg  += r.ligotniki0_suma;
      t.dg  += r.incasare_diagrama;
      t.vk  += r.ligotniki_vokzal_suma;
      t.dt  += r.dt_suma;
      t.rs  += r.dop_rashodi;
      if (r.extra_2tarife_lei != null) t.extra2t += r.extra_2tarife_lei;
    }
    return t;
  }, [processed]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSort = (key: Exclude<SortKey, 'default'>) => {
    if (sortKey === key) {
      // al doilea click inversează; al treilea revine la ordinea implicită
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey('default'); setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
  const arrow = (key: Exclude<SortKey, 'default'>) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const isFiltered = filterRuta !== '' || filterSofer !== '' || filterOra !== '';

  /**
   * Coloanele de descifrare a încasării (Dg · Lg · Rs) se pot ascunde.
   *
   * Ion, 06.10: «ar fi oportun ca coloanele cu descifrare să le pot deschide printr-o bifă —
   * să fie un tabel mai puțin încărcat vizual și doar la necesitate să se deschidă».
   * Închis, rămâne ce se citește zilnic: NUM → TOTAL ÎNCASAT → REZULTAT.
   */
  const [descifrare, setDescifrare] = useState(false);

  // Grid: Data | Oră | Rută | Șofer | Foaie | Num | +2T | Inc | [Nm | Dg | Lg | Vk | Rs] | Δ | Status | expand
  //
  // Descifrarea e completă: INC se descompune în NUMERAR + DIAGRAMĂ, iar lângă ele stau
  // celelalte sume ale foii — ligotnici 0, ligotnici gară, rashodi. Fără numerar și fără
  // gară, «descifrarea» nu descifra nimic (Ion, 07.10).
  // Ruta nu mai ia tot spațiul liber (era `1fr`): are un maxim, iar surplusul trece la Șofer,
  // unde numele sunt la fel de lungi. Ion, 07.10: «lățimea la rută să fie mai mică».
  // Lățimile cresc odată cu fontul (12 → 13 → 15): o cifră de 15px e cu ~25% mai lată decât
  // una de 12px, iar pe coloanele strânse un total de patru-cinci cifre n-ar mai fi încăput —
  // cu `overflow: hidden` pe celule nu s-ar fi văzut că lipsește, s-ar fi tăiat în liniște.
  // Ion, 09.10: «rândurile să fie mai late și scriptul mai mare», apoi «mărește încă șriftul».
  // Tabelul ajunge la ~1460px cu descifrarea deschisă; tab-ul «Încasare» rulează pe toată
  // lățimea paginii (`maxWidth: none`), deci încape pe un ecran de laptop fără scroll lateral.
  const GRID = descifrare
    ? '94px 110px minmax(150px, 230px) minmax(140px, 1fr) 78px 74px 62px 74px 66px 66px 58px 58px 58px 78px 112px 24px'
    : '94px 110px minmax(150px, 230px) minmax(140px, 1fr) 78px 74px 62px 74px 78px 112px 24px';
  const selStyle: React.CSSProperties = {
    width: '100%', fontSize: 12, marginTop: 3, border: '1px solid var(--border)',
    borderRadius: 3, padding: '0 1px', background: '#fff',
  };

  return (
    <div>
      {/* Linii între coloane, ca în documentul de casier: cu douăzeci de coloane de cifre,
          delimitarea pe spațiu alb nu mai ajunge. `gap: 0` + chenar pe fiecare celulă, ca la
          un tabel adevărat; ultima coloană rămâne fără, să nu dubleze marginea. */}
      <style>{`
        .rute-grid > * {
          border-right: 1px solid rgba(155,27,48,0.12);
          padding-right: 5px;
          padding-left: 5px;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .rute-grid > *:last-child { border-right: none; }
      `}</style>
      {/* Comutatorul rămâne sus, lângă tabel: totalurile au coborât în subsol, dar un
          comutator de coloane căutat cu scroll la fiecare apăsare ar fi fost mai rău. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6, fontSize: 13 }}>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
          fontWeight: descifrare ? 600 : 400,
        }} title="Arată coloanele care descifrează totalul încasat: diagrama, lgotnici, rashodi.">
          <input type="checkbox" checked={descifrare} onChange={e => setDescifrare(e.target.checked)} />
          descifrarea
        </label>
      </div>

      {/* Header */}
      <div className="rute-grid" style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: 0,
        padding: '9px 10px',
        borderBottom: '1px solid var(--border)',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        color: 'var(--text-muted)',
        marginBottom: 4,
        alignItems: 'start',
      }}>
        <div onClick={() => toggleSort('Data')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Sortează după data foii">Data{arrow('Data')}</div>
        <div>
          <div>Oră</div>
          <select value={filterOra} onChange={e => setFilterOra(e.target.value)} title="Filtrează după oră"
            style={{ ...selStyle, background: filterOra ? '#fff3cd' : '#fff', fontWeight: filterOra ? 600 : 400 }}>
            <option value="">toate orele</option>
            {oraOptions.map(o => <option key={o} value={o!}>{o}</option>)}
          </select>
        </div>
        <div>
          <div onClick={() => toggleSort('Ruta')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Sortează alfabetic după rută">Rută{arrow('Ruta')}</div>
          <select value={filterRuta} onChange={e => setFilterRuta(e.target.value)} title="Filtrează după rută"
            style={{ ...selStyle, background: filterRuta ? '#fff3cd' : '#fff', fontWeight: filterRuta ? 600 : 400 }}>
            <option value="">toate rutele</option>
            {routeOptions.map(o => <option key={o} value={o!}>{o}</option>)}
          </select>
        </div>
        <div>
          <div onClick={() => toggleSort('Sofer')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Sortează alfabetic după șofer">Șofer{arrow('Sofer')}</div>
          <select value={filterSofer} onChange={e => setFilterSofer(e.target.value)} title="Filtrează după șofer"
            style={{ ...selStyle, background: filterSofer ? '#fff3cd' : '#fff', fontWeight: filterSofer ? 600 : 400 }}>
            <option value="">toți șoferii</option>
            {soferOptions.map(o => <option key={o} value={o!}>{o}</option>)}
          </select>
        </div>
        <div>Foaie</div>
        <div style={{ textAlign: 'right' }}>Num</div>
        <div style={{ textAlign: 'right' }}>+2T</div>
        <div style={{ textAlign: 'right' }}>Inc</div>
        {descifrare && <div style={{ textAlign: 'right' }} title="Numerar — banii încasați la casă">Nm</div>}
        {descifrare && <div style={{ textAlign: 'right' }} title="Diagrame">Dg</div>}
        {descifrare && <div style={{ textAlign: 'right' }} title="Ligotnici 0">Lg</div>}
        {descifrare && <div style={{ textAlign: 'right' }} title="Ligotnici gară">Vk</div>}
        {descifrare && <div style={{ textAlign: 'right' }} title="Cheltuieli suplimentare">Rs</div>}
        <div style={{ textAlign: 'right' }}
          title="Rezultatul: total încasat − numărare. Plus = s-a încasat mai mult decât s-a numărat; minus = lipsesc bani față de numărare.">Δ</div>
        <div>Status</div>
        <div></div>
      </div>

      {/* Rows */}
      {processed.map((r, idx) => {
        const meta = STATUS_META[r.status];
        const isOpen = expanded.has(r.row_key);
        const hasDetails = !!(r.comment || r.fiscal_nrs || r.ligotniki_vokzal_suma > 0 || r.dt_suma > 0 || r.plati > 0);
        // Dungi alternante: alb / vișiniu deschis. Rândurile anulate rămân gri, distinct.
        const stripe = r.cancelled ? 'rgba(0,0,0,0.04)' : (idx % 2 === 1 ? 'rgba(155,27,48,0.055)' : '#ffffff');

        return (
          <div key={r.row_key} style={{
            borderLeft: `3px solid ${meta.color}`,
            background: stripe,
          }}>
            <div
              className="rute-grid"
              onClick={() => hasDetails && toggle(r.row_key)}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: 0,
                alignItems: 'center',
                padding: '9px 10px',
                fontSize: 15,
                cursor: hasDetails ? 'pointer' : 'default',
                opacity: r.cancelled ? 0.5 : 1,
              }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, whiteSpace: 'nowrap' }}>{formatData(r.ziua)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, whiteSpace: 'nowrap' }}>{r.time_nord || '—'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.route_name || '—'}
                {r.vehicle_plate && (
                  <span className="text-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, marginLeft: 6 }}>
                    {r.vehicle_plate}
                  </span>
                )}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.driver_name || <span className="text-muted">—</span>}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                {r.foaie_nr ? (
                  <span style={{ color: r.foaie_source === 'implied' ? '#f57c00'
                                      : r.foaie_source === 'manual' ? '#2a5db0' : 'inherit' }}
                        title={r.foaie_source === 'implied' ? 'Asociat automat din istoric'
                             : r.foaie_source === 'manual' ? 'Introdusă manual la casă (Document casier Numerar)' : ''}>
                    {r.foaie_nr}
                    {r.foaie_source === 'implied' && (
                      <span style={{ fontSize: 11, marginLeft: 3, opacity: 0.7 }}>auto</span>
                    )}
                    {r.foaie_source === 'manual' && (
                      <span style={{ fontSize: 11, marginLeft: 3, opacity: 0.7 }}>casă</span>
                    )}
                  </span>
                ) : <span className="text-muted">—</span>}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{num(r.numarare_lei)}</span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                textAlign: 'right',
                fontSize: 14,
                color: r.extra_2tarife_lei != null && r.extra_2tarife_lei > 0 ? 'var(--success)' : 'var(--text-muted)',
              }}>
                {r.extra_2tarife_lei == null
                  ? <span className="text-muted">—</span>
                  : r.extra_2tarife_lei > 0 ? <strong>+{Math.round(r.extra_2tarife_lei)}</strong> : <span className="text-muted">0</span>}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{num(incTotal(r))}</span>
              {descifrare && <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 14 }}>{num(r.incasare_numerar)}</span>}
              {descifrare && <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 14 }}>{num(r.incasare_diagrama)}</span>}
              {descifrare && <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 14 }}>{num(r.ligotniki0_suma)}</span>}
              {descifrare && <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 14 }}>{num(r.ligotniki_vokzal_suma)}</span>}
              {descifrare && <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 14 }}>{num(r.dop_rashodi)}</span>}
              {/* Rezultatul se recalculează aici, nu se ia `r.diff` de la server: acela e
                  numărare − vechiul incasare_lei (numerar + diagramă). De când INC e totalul
                  foii, cele două ar fi arătat lucruri diferite pe același rând. */}
              {(() => {
                // Ion, 09.10: «ai putea invers, ca să văd cu + ce a încasat mai mult decât
                // s-a numărat». Deci ÎNCASAT − NUMĂRAT, nu invers: plusul e surplus, minusul
                // e lipsă. Culorile rămân aceleași și acum chiar se potrivesc cu sensul —
                // roșu pe minus înseamnă bani lipsă, nu surplus.
                const rez = Math.round(incTotal(r) - r.numarare_lei);
                const fara = r.status === 'no_numarare' || r.status === 'no_incasare'
                  || r.status === 'cancelled' || r.status === 'empty' || r.status === 'no_data';
                return (
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    textAlign: 'right',
                    color: rez < 0 ? 'var(--danger)' : rez > 0 ? 'var(--warning)' : 'var(--text-muted)',
                    fontWeight: 600,
                  }}>
                    {fara ? <span className="text-muted">—</span> : `${rez >= 0 ? '+' : ''}${rez}`}
                  </span>
                );
              })()}
              <span style={{ color: meta.color, fontSize: 14, fontWeight: 600 }}>
                {meta.icon} {meta.label}
              </span>
              <span className="text-muted" style={{ fontSize: 14, textAlign: 'center' }}>
                {hasDetails ? (isOpen ? '▾' : '▸') : ''}
              </span>
            </div>

            {/* Details — comment, fiscal, vokzal, DT, plăți, retur vehicle */}
            {isOpen && hasDetails && (
              <div style={{
                padding: '4px 10px 6px 28px',
                fontSize: 12,
                color: 'var(--text-muted)',
                display: 'flex',
                gap: 14,
                flexWrap: 'wrap',
              }}>
                {r.plati > 0 && <span><span style={{ opacity: 0.7 }}>plăți</span> <strong>{r.plati}</strong></span>}
                {r.ligotniki_vokzal_suma > 0 && <span><span style={{ opacity: 0.7 }}>vokzal</span> <strong>{Math.round(r.ligotniki_vokzal_suma)} lei</strong></span>}
                {r.dt_suma > 0 && <span><span style={{ opacity: 0.7 }}>DT</span> <strong>{Math.round(r.dt_suma)} lei</strong></span>}
                {r.vehicle_plate_retur && <span><span style={{ opacity: 0.7 }}>retur</span> <span style={{ fontFamily: 'var(--font-mono)' }}>{r.vehicle_plate_retur}</span></span>}
                {r.fiscal_nrs && <span style={{ fontFamily: 'var(--font-mono)' }}>#{r.fiscal_nrs}</span>}
                {r.comment && <span style={{ fontStyle: 'italic' }}>«{r.comment}»</span>}
              </div>
            )}
          </div>
        );
      })}

      {processed.length === 0 && (
        <p className="text-muted" style={{ textAlign: 'center', padding: 20, fontSize: 14 }}>
          {isFiltered ? 'Niciun rezultat pentru filtrul ales.' : 'Nu există rute pentru perioada selectată.'}
        </p>
      )}

      {/* Totaluri, în subsol, FIECARE SUB COLOANA LUI — ca în documentul de casier.
          Ion, 07.10: «totalurile în documentul PE RUTĂ pune-le așa ca în document casier,
          fiecare total sub colonița lui». Într-o bară cu etichete trebuia să citești numele
          ca să știi la ce se referă cifra; aliniate pe grilă, se citesc dintr-o privire. */}
      <div className="rute-grid" style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: 0,
        alignItems: 'center',
        padding: '11px 10px',
        marginTop: 2,
        fontSize: 15,
        fontWeight: 700,
        background: 'rgba(155,27,48,0.07)',
        borderTop: '2px solid var(--primary)',
      }}>
        <div className="text-muted" style={{ fontSize: 12, textTransform: 'uppercase' }}>Total</div>
        <div />
        <div className="text-muted" style={{ fontSize: 12 }}>
          {processed.length} curse{isFiltered ? ' (filtrat)' : ''}
        </div>
        <div />
        <div />
        <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{Math.round(totals.num)}</div>
        <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', color: totals.extra2t > 0 ? 'var(--success)' : undefined }}>
          {totals.extra2t > 0 ? `+${Math.round(totals.extra2t)}` : ''}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{Math.round(totals.inc)}</div>
        {descifrare && <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{Math.round(totals.nm)}</div>}
        {descifrare && <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{Math.round(totals.dg)}</div>}
        {descifrare && <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{Math.round(totals.lg)}</div>}
        {descifrare && <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{Math.round(totals.vk)}</div>}
        {descifrare && <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{Math.round(totals.rs)}</div>}
        <div style={{
          fontFamily: 'var(--font-mono)', textAlign: 'right',
          color: Math.round(totals.inc - totals.num) < 0 ? 'var(--danger)'
            : Math.round(totals.inc - totals.num) > 0 ? 'var(--warning)' : 'inherit',
        }} title="Total încasat − numărare, pe tot ce e afișat">
          {Math.round(totals.inc - totals.num) >= 0 ? '+' : ''}{Math.round(totals.inc - totals.num)}
        </div>
        <div />
        <div />
      </div>
    </div>
  );
}
