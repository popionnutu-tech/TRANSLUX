'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getRaportPeRute } from './incasareActions';
import {
  capeteCuOre, lunaTrecuta, perioadaImplicita, valideazaPerioada,
  type RaportPeRute, type RutaAgregata, type Subtotal,
} from './raport-rute';
import { construiesteExcel, dmy, ETICHETA_CATEGORIE, ETICHETA_DE_VERIFICAT } from './raport-rute-xls';

function todayChisinau(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

const lei = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

type SortKey = 'total' | 'ruta' | 'curse' | 'fara' | 'medie';

const TH: React.CSSProperties = {
  padding: '6px 8px', fontSize: 12, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap',
  // resetul global al admin-ului pune antetele cu majuscule și spațiere — lățesc coloanele
  textTransform: 'none', letterSpacing: 'normal',
  borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle, #faf7f7)', position: 'sticky', top: 0,
};
const TD: React.CSSProperties = {
  padding: '4px 8px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)',
  borderBottom: '1px solid rgba(155,27,48,0.08)', whiteSpace: 'nowrap',
};
const TDL: React.CSSProperties = { ...TD, textAlign: 'left', fontFamily: 'inherit' };

export default function RaportRuteTab() {
  const azi = todayChisinau();
  const implicit = perioadaImplicita(azi);
  const [from, setFrom] = useState(implicit.from);
  const [to, setTo] = useState(implicit.to);
  const [data, setData] = useState<RaportPeRute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [descifrare, setDescifrare] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [exporting, setExporting] = useState(false);
  // Doar răspunsul ultimei cereri contează: o perioadă lungă cerută înainte poate sosi după
  // una scurtă cerută după ea și ar suprascrie tabelul cu cifrele altei perioade.
  const reqId = useRef(0);

  const invalid = valideazaPerioada(from, to);

  useEffect(() => {
    if (invalid) {
      // Și cererea în curs devine veche: altfel răspunsul ei ar apărea sub «Dată invalidă».
      reqId.current++;
      setData(null); setError(invalid); setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true); setError('');
    getRaportPeRute(from, to).then(res => {
      if (id !== reqId.current) return;
      if (res.error) { setError(res.error); setData(null); } else setData(res.data ?? null);
    }).catch(e => {
      if (id === reqId.current) { setError(String(e?.message || e)); setData(null); }
    }).finally(() => {
      if (id === reqId.current) setLoading(false);
    });
  }, [from, to, invalid]);

  function setPerioada(p: { from: string; to: string }) { setFrom(p.from); setTo(p.to); }

  const grupuri = useMemo(() => {
    if (!data) return [];
    const cmp = (a: RutaAgregata, b: RutaAgregata) => {
      switch (sortKey) {
        case 'ruta': return a.route_name.localeCompare(b.route_name, 'ro') || (a.time_nord || '').localeCompare(b.time_nord || '');
        case 'curse': return b.curse - a.curse;
        case 'fara': return b.faraIncasare - a.faraIncasare || b.numaratFaraIncasare - a.numaratFaraIncasare;
        case 'medie': return (b.mediePeCursa ?? -1) - (a.mediePeCursa ?? -1);
        default: return b.total - a.total;
      }
    };
    return (['interurban', 'suburban'] as const)
      .map(tip => ({ tip, rute: data.rute.filter(r => r.route_type === tip).sort(cmp), sub: data.subtotaluri[tip] }))
      .filter(g => g.rute.length > 0);
  }, [data, sortKey]);

  async function exportExcel() {
    if (!data) return;
    setExporting(true);
    try {
      // Import dinamic: doar `xlsx` (~1 MB) se încarcă la apăsarea butonului și nu intră în
      // pachetul paginii /numarare; raport-rute-xls importă din el numai tipuri.
      const XLSX = await import('xlsx');
      const generat = new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau' });
      const wb = construiesteExcel(XLSX, data, generat);
      XLSX.writeFile(wb, `incasari-pe-rute_${data.from}_${data.to}.xlsx`);
    } catch (e) {
      setError(`Exportul n-a reușit: ${String((e as Error)?.message || e)}`);
    } finally {
      setExporting(false);
    }
  }

  // Rută se sortează crescător (A→Z), restul descrescător (cele mai mari sus).
  const sortTh = (key: SortKey, label: string, title?: string, align: 'left' | 'right' = 'right') => (
    <th style={{ ...TH, textAlign: align }}
      aria-sort={sortKey === key ? (key === 'ruta' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSortKey(key)} title={title ?? 'Sortează'}
        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer',
          color: sortKey === key ? 'var(--primary)' : 'inherit' }}>
        {label}{sortKey === key ? (key === 'ruta' ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );

  const nrCol = descifrare ? 15 : 9;

  const rubriciCells = (x: Subtotal | RutaAgregata, bold = false) => {
    const st = bold ? { ...TD, fontWeight: 700 } : TD;
    return descifrare ? (
      <>
        <td style={st}>{lei(x.numerar)}</td>
        <td style={st}>{lei(x.diagrama)}</td>
        <td style={st}>{lei(x.ligotniki0)}</td>
        <td style={st}>{lei(x.ligotnikiGara)}</td>
        <td style={st}>{lei(x.dt)}</td>
        <td style={st}>{lei(x.cheltuieli)}</td>
      </>
    ) : null;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 17 }}>Încasări factice pe rute</h3>
          <p className="text-muted" style={{ fontSize: 12, margin: '4px 0 0 0', maxWidth: 640 }}>
            Perioada se alege după <strong>data foii de parcurs</strong>: plata făcută mai târziu intră în ziua foii.
            Total foaie = numerar + diagramă + ligotnici 0 + ligotnici gară + combustibil DT + cheltuieli.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="text-muted" style={{ fontSize: 13 }}>De la</span>
          <input type="date" aria-label="De la (data foii)" value={from} max={azi} onChange={e => setFrom(e.target.value)} className="form-control" style={{ width: 150 }} />
          <span className="text-muted" style={{ fontSize: 13 }}>până la</span>
          <input type="date" aria-label="Până la (data foii)" value={to} min={from} max={azi} onChange={e => setTo(e.target.value)} className="form-control" style={{ width: 150 }} />
          <button type="button" className="btn btn-sm" onClick={() => setPerioada(perioadaImplicita(azi))}
            title={azi.endsWith('-01') ? 'Azi e 1 ale lunii: luna curentă n-are încă nicio zi încheiată, se arată luna trecută' : 'De la 1 ale lunii până ieri'}>
            Luna curentă
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setPerioada(lunaTrecuta(azi))}>Luna trecută</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={exportExcel} disabled={!data || loading || exporting}>
            {exporting ? 'Se pregătește…' : 'Excel'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--danger-dim)', color: 'var(--danger)', padding: '10px 16px', borderRadius: 'var(--radius-xs)', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading && <p className="text-muted" style={{ textAlign: 'center', padding: 20, fontSize: 13 }}>Se încarcă…</p>}

      {!loading && data && (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            <Kpi label="Total pe rute" value={data.totalRute.total} />
            <Kpi label="Bani fără rută" value={data.faraRuta.total} muted={data.faraRuta.total === 0} />
            <Kpi label="Total general" value={data.totalGeneral} strong />
            {data.deVerificat.total > 0 && (
              <Kpi label="Total general + De verificat" value={data.totalGeneralCuDeVerificat}
                sub={`de verificat: ${lei(data.deVerificat.total)} lei — poate fi dublură, poate fi bani reali`} warn />
            )}
            <Kpi label="Curse fără încasare" value={data.totalRute.faraIncasare} count
              sub={`din ${data.totalRute.curse} · numărat pe ele ${lei(data.totalRute.numaratFaraIncasare)} lei`} warn={data.totalRute.faraIncasare > 0} />
          </div>

          <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={descifrare} onChange={e => setDescifrare(e.target.checked)} />
            Descifrarea totalului pe rubrici
          </label>

          {/* Ion, 10.10: «mai restrâns» — tabelul ia lățimea cifrelor, nu tot ecranul. */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', width: 'fit-content', maxWidth: '100%' }}>
            <table style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {sortTh('ruta', 'Rută', undefined, 'left')}
                  {sortTh('curse', 'Curse', 'Curse neanulate în perioadă')}
                  <th style={TH} title="Curse cu Total foaie > 0">Cu bani</th>
                  {sortTh('fara', 'Fără bani', 'Curse fără niciun leu în casă')}
                  <th style={TH} title="Cât s-a numărat pe cursele fără bani">Numărat pe ele</th>
                  {descifrare && (
                    <>
                      <th style={TH}>Numerar</th>
                      <th style={TH}>Diagramă</th>
                      <th style={TH}>Ligotnici 0</th>
                      <th style={TH}>Lig. gară</th>
                      <th style={TH}>Comb. DT</th>
                      <th style={TH}>Cheltuieli</th>
                    </>
                  )}
                  {sortTh('total', 'Total foaie')}
                  {sortTh('medie', 'Medie/cursă', 'Total foaie / curse cu bani')}
                  <th style={TH}>Numărare</th>
                  <th style={TH} title="Total − numărare, doar pe cursele care au și bani, și numărare">Diferență</th>
                </tr>
              </thead>
              <tbody>
                {grupuri.map(g => (
                  <GroupRows key={g.tip} label={g.tip === 'interurban' ? 'Interurban' : 'Suburban'}
                    rute={g.rute} sub={g.sub} nrCol={nrCol} rubriciCells={rubriciCells} />
                ))}
                <tr style={{ background: 'rgba(155,27,48,0.06)' }}>
                  <td style={{ ...TDL, fontWeight: 700 }}>TOTAL PE RUTE ({data.totalRute.rute})</td>
                  <SubCells s={data.totalRute} rubriciCells={rubriciCells} />
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-muted" style={{ fontSize: 12, margin: '8px 0 16px' }}>
            Zilele din ultima săptămână se pot completa: șoferii plătesc până la 5 zile după cursă.
            Ruta = ruta de tur din /grafic (și returul pe altă rută se socotește aici).
            ⚑ = sub jumătate din curse au bani în casă.
          </p>

          <Lista
            titlu={`Bani fără rută — ${lei(data.faraRuta.total)} lei (intră în Total general)`}
            gol="Niciun leu fără rută în perioadă."
            antet={['Categorie', 'Foaie', 'Ziua în raport (plata / cursa)', 'Ziua foii', 'Șofer', 'Cursa corectă a foii', 'Total']}
            randuri={data.faraRuta.randuri.map(b => [ETICHETA_CATEGORIE[b.categorie], b.foaie_nr || '—', dmy(b.ziua), dmy(b.ziua_foaie) || '—', b.driver_name || '—', b.cursa_corecta || '—', lei(b.total)])}
            nota="Plățile de terminal fără cursă intră în perioada zilei în care au fost făcute (fără cursă nu se pot pune pe ziua foii). Rândurile manuale intră pe ziua cursei lor, altfel pe data foii, altfel pe ziua introducerii. Așa fiecare leu apare într-o singură perioadă."
          />
          {data.deVerificat.randuri.length > 0 && (
            <Lista
              titlu={`De verificat — ${lei(data.deVerificat.total)} lei (NU intră în Total general)`}
              antet={['Motiv', 'Foaie', 'Ziua introducerii', 'Data foii', 'Șofer', 'Terminal pe foaie', 'Numărat pe cursă', 'Total manual']}
              randuri={data.deVerificat.randuri.map(b => [ETICHETA_DE_VERIFICAT[b.motiv], b.foaie_nr || '—', dmy(b.ziua), dmy(b.data_foaie) || '—', b.driver_name || '—', lei(b.terminal_pe_foaie), lei(b.numarare_cursa), lei(b.total)])}
              nota="Rânduri din «Document casier Numerar» pe care raportul nu le adună: foaia sau cursa lor a primit deja bani de la terminal. Din date nu se știe dacă e copie sau complement — compară cu terminalul și numărarea, apoi corectează în documentul de casier."
              warn
            />
          )}
        </>
      )}
    </div>
  );
}

function GroupRows({ label, rute, sub, nrCol, rubriciCells }: {
  label: string; rute: RutaAgregata[]; sub: Subtotal; nrCol: number;
  rubriciCells: (x: Subtotal | RutaAgregata, bold?: boolean) => React.ReactNode;
}) {
  return (
    <>
      <tr><td colSpan={nrCol} style={{ ...TDL, fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', paddingTop: 12 }}>{label.toUpperCase()}</td></tr>
      {rute.map(r => (
        <tr key={r.crm_route_id} style={r.steag ? { background: 'var(--danger-dim, #fdecee)' } : undefined}>
          <td style={TDL} title={`ID rută ${r.crm_route_id}`}>
            {r.steag && <span style={{ color: 'var(--danger)', marginRight: 4 }} title="Sub jumătate din curse au bani în casă">⚑</span>}
            {/* Ora plecării lângă locul din care pleacă (Ion, 10.10): «Chișinău 18:30 - Criva 11:00».
                Numele se repetă (6 «Chișinău - Lipcani»), orele le deosebesc. */}
            {capeteCuOre(r.route_name, r.time_chisinau, r.time_nord).map((c, i) => (
              <span key={i}>
                {i > 0 && ' - '}
                {c.loc}
                {c.ora && <span className="text-muted" style={{ fontSize: 12, marginLeft: 4 }}>{c.ora}</span>}
              </span>
            ))}
          </td>
          <td style={TD}>{r.curse}{r.anulate > 0 && <span className="text-muted" style={{ fontSize: 11 }} title="anulate"> +{r.anulate}⊘</span>}</td>
          <td style={TD}>{r.cuIncasare}</td>
          <td style={{ ...TD, color: r.faraIncasare > 0 ? 'var(--danger)' : undefined }}>{r.faraIncasare || '—'}</td>
          <td style={{ ...TD, color: r.numaratFaraIncasare > 0 ? 'var(--danger)' : undefined }}>{r.numaratFaraIncasare ? lei(r.numaratFaraIncasare) : '—'}</td>
          {rubriciCells(r)}
          <td style={{ ...TD, fontWeight: 700 }}>{lei(r.total)}</td>
          <td style={TD}>{lei(r.mediePeCursa)}</td>
          <td style={TD}>{r.numarare ? lei(r.numarare) : '—'}</td>
          <td style={{ ...TD, color: r.diferenta < 0 ? 'var(--danger)' : r.diferenta > 0 ? 'var(--warning)' : undefined }}>
            {r.diferenta ? lei(r.diferenta) : '—'}
          </td>
        </tr>
      ))}
      <tr style={{ background: 'rgba(0,0,0,0.025)' }}>
        <td style={{ ...TDL, fontWeight: 600 }}>Subtotal {label.toLowerCase()} ({sub.rute})</td>
        <SubCells s={sub} rubriciCells={rubriciCells} />
      </tr>
    </>
  );
}

function SubCells({ s, rubriciCells }: { s: Subtotal; rubriciCells: (x: Subtotal, bold?: boolean) => React.ReactNode }) {
  const b = { ...TD, fontWeight: 700 };
  return (
    <>
      <td style={b}>{s.curse}</td>
      <td style={b}>{s.cuIncasare}</td>
      <td style={b}>{s.faraIncasare || '—'}</td>
      <td style={b}>{s.numaratFaraIncasare ? lei(s.numaratFaraIncasare) : '—'}</td>
      {rubriciCells(s, true)}
      <td style={b}>{lei(s.total)}</td>
      <td style={b}>{lei(s.cuIncasare > 0 ? Math.round(s.total / s.cuIncasare) : null)}</td>
      <td style={b}>{s.numarare ? lei(s.numarare) : '—'}</td>
      <td style={b}>{s.diferenta ? lei(s.diferenta) : '—'}</td>
    </>
  );
}

function Kpi({ label, value, sub, strong, warn, muted, count }: {
  label: string; value: number; sub?: string; strong?: boolean; warn?: boolean; muted?: boolean; count?: boolean;
}) {
  return (
    <div className="card" style={{ padding: '10px 14px', minWidth: 150 }}>
      <div className="text-muted" style={{ fontSize: 11 }}>{label}</div>
      <div style={{
        fontSize: strong ? 22 : 18, fontWeight: 700, fontFamily: 'var(--font-mono)',
        color: warn ? 'var(--danger)' : muted ? 'var(--text-muted)' : undefined,
      }}>
        {lei(value)}{count ? '' : ' lei'}
      </div>
      {sub && <div className="text-muted" style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

function Lista({ titlu, antet, randuri, nota, gol, warn }: {
  titlu: string; antet: string[]; randuri: string[][]; nota?: string; gol?: string; warn?: boolean;
}) {
  return (
    <div className="card" style={{ padding: 12, marginBottom: 12, borderLeft: warn ? '3px solid var(--warning)' : undefined }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{titlu}</div>
      {nota && <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>{nota}</div>}
      {randuri.length === 0 ? (
        <div className="text-muted" style={{ fontSize: 12 }}>{gol}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{antet.map((h, i) => <th key={h} style={{ ...TH, position: 'static', textAlign: i === antet.length - 1 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {randuri.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} style={j === r.length - 1 ? TD : TDL}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
