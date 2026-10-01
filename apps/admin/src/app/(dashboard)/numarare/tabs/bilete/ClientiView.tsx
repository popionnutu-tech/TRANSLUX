'use client';

// «Cine merge pe rută» (ION-159): de unde până unde merg clienții. Ion, 01.10: «noi avem din tiki toți clienții de unde
// și până unde, acum numărare − tiki ne dă nouă matematic restul clienților de unde și până unde pleacă ei»; «nu doar în
// procente, ci și în număr real de călătorii». Doar interurban, din 28.03.2026 (de când există Numărare).
// Ceilalți (migr. 458): pe fiecare tronson numărat − TIKI; unde crește, urcă; unde scade, coboară — împărțiți între cei
// din autobuz după oprirea unde au urcat.

import { useEffect, useState } from 'react';
import { getTikiClienti, getTikiOd } from '../biletAparatActions';
import type { ClientiRoute, Filters, OdPair, TikiOd } from './types';
import { fmtDate } from './periods';
import { Kpi, Notice, fmtInt, nf1, tableWrap } from './ui';

export const CLIENTI_FROM = '2026-03-28';

const TIKI = '#2a78d6';
const OTHERS = '#eb6834';

function OdTable({ title, color, rows, total, note }: {
  title: string; color: string; rows: OdPair[]; total: number | null; note: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 25);
  const max = Math.max(1, ...rows.map(r => r.calatorii));
  return (
    <div className="card" style={{ padding: 16, flex: '1 1 420px', minWidth: 0 }}>
      <div style={{ fontWeight: 600, color, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#777', marginBottom: 8 }}>{note}</div>
      <div style={tableWrap}>
        <table style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>De unde → până unde</th>
              <th style={{ textAlign: 'right' }}>Călătorii</th>
              <th style={{ textAlign: 'right' }}>Pe zi</th>
              <th style={{ textAlign: 'right' }}>Din toți</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.de_la}-${r.pana_la}-${i}`}>
                <td style={{ textAlign: 'left' }}>
                  {r.de_la} → {r.pana_la}
                  <div style={{ height: 3, background: color, opacity: 0.55, width: `${(100 * r.calatorii) / max}%`, marginTop: 2 }} />
                </td>
                <td style={{ textAlign: 'right' }}>{fmtInt(r.calatorii)}</td>
                <td style={{ textAlign: 'right' }}>{nf1.format(r.pe_zi)}</td>
                <td style={{ textAlign: 'right' }}>{r.pct == null ? '—' : `${nf1.format(r.pct)} %`}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'left', color: '#999' }}>Nicio călătorie în perioada aleasă.</td></tr>
            )}
          </tbody>
          {total != null && rows.length > 0 && (
            <tfoot>
              <tr>
                <td style={{ textAlign: 'left', fontWeight: 600 }}>Total (toate perechile)</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtInt(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows.length > 25 && (
        <button type="button" onClick={() => setAll(a => !a)}
          style={{ marginTop: 8, fontSize: 12, background: 'none', border: 'none', color, cursor: 'pointer', padding: 0 }}>
          {all ? 'Arată doar primele 25' : `Arată toate ${rows.length}`}
        </button>
      )}
    </div>
  );
}

export default function ClientiView({ filters, routeId, onRouteChange }: {
  filters: Filters; routeId: number | null; onRouteChange: (id: number | null) => void;
}) {
  const from = filters.from < CLIENTI_FROM ? CLIENTI_FROM : filters.from;
  const to = filters.to;
  const [routes, setRoutes] = useState<ClientiRoute[]>([]);
  const [od, setOd] = useState<TikiOd | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (from > to) return;
    getTikiClienti(from, to).then(r => { if (r.data) setRoutes(r.data.rute); });
  }, [from, to]);

  useEffect(() => {
    if (from > to) return;
    setLoading(true);
    getTikiOd(from, to, routeId).then(r => {
      setLoading(false);
      if (r.error) { setError(r.error); return; }
      setError(null);
      setOd(r.data!);
    });
  }, [from, to, routeId]);

  if (from > to) {
    return <Notice tone="info">Numărarea pe rute începe la {fmtDate(CLIENTI_FROM)}. Alege o perioadă de după această zi.</Notice>;
  }

  const tikiPeZi = od?.tiki_total_pe_zi ?? null;
  const ceilaltiPeZi = od?.ceilalti_total_pe_zi ?? null;
  const toti = (tikiPeZi ?? 0) + (ceilaltiPeZi ?? 0);
  const pctCeilalti = toti > 0 && ceilaltiPeZi != null ? (100 * ceilaltiPeZi) / toti : null;

  return (
    <div>
      <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>
        De unde până unde merg clienții. <b style={{ color: TIKI }}>TIKI</b> — din biletele bătute în aparat.{' '}
        <b style={{ color: OTHERS }}>Ceilalți</b> — calculați: câți oameni a numărat Numărarea pe fiecare porțiune de drum,
        minus clienții TIKI de pe aceeași porțiune; unde diferența crește au urcat, unde scade au coborât.
        {filters.from < CLIENTI_FROM && <> Numărarea începe la {fmtDate(CLIENTI_FROM)}: perioada se ia de acolo.</>}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 13 }}>Ruta:</span>
        <select
          value={routeId ?? ''}
          onChange={e => onRouteChange(e.target.value ? Number(e.target.value) : null)}
          style={{ padding: '6px 8px', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6, fontSize: 13, width: 'auto' }}
        >
          <option value="">Toate rutele</option>
          {[...routes].sort((a, b) => a.coridor.localeCompare(b.coridor) || a.nume.localeCompare(b.nume)).map(r => (
            <option key={r.route_id} value={r.route_id}>{r.coridor} · {r.nume} (#{r.route_id})</option>
          ))}
        </select>
        {loading && <span style={{ fontSize: 12, color: '#999' }}>se încarcă…</span>}
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      {od && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
            <Kpi title="Clienți TIKI pe zi" value={tikiPeZi == null ? '—' : nf1.format(tikiPeZi)}
              sub={`${fmtInt(od.tiki_total)} călătorii în ${od.zile_tiki} zile`} />
            <Kpi title="Ceilalți clienți pe zi" value={ceilaltiPeZi == null ? '—' : nf1.format(ceilaltiPeZi)}
              sub={`${fmtInt(od.ceilalti_total)} călătorii în ${od.zile_numarare} zile numărate`} />
            <Kpi title="Ceilalți din toți clienții" value={pctCeilalti == null ? '—' : `${Math.round(pctCeilalti)} %`}
              sub="pe zi, TIKI + ceilalți" />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <OdTable title="Clienți TIKI — de unde până unde" color={TIKI} rows={od.tiki} total={od.tiki_total}
              note="Fiecare bilet are stația de urcare și de coborâre (înainte de 02.2026 dedusă din preț)." />
            <OdTable title="Ceilalți clienți — de unde până unde" color={OTHERS} rows={od.ceilalti} total={od.ceilalti_total}
              note="Calculat din diferența Numărare − TIKI, doar în zilele numărate în care cursa are și bilete TIKI." />
          </div>
        </>
      )}
    </div>
  );
}
