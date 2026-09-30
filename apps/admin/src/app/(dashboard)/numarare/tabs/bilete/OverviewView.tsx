'use client';

import { useEffect, useMemo, useState } from 'react';
import { getTikiSummary } from '../biletAparatActions';
import type { Filters, TikiSummary } from './types';
import {
  previousPeriod, sameRangeLastYear, clampToData, pctChange, unreliableOverlap, anomalousDays, fmtDate,
  UNRELIABLE_RANGES, type DateRange,
} from './periods';
import { BarChart, SplitBar, SERIES } from './charts';
import { Kpi, CompareLine, Notice, fmtInt, fmtLei, fmtPct, share, nf1, nf2 } from './ui';

interface Cmp { cur: TikiSummary; prev: TikiSummary | null; yoy: TikiSummary | null; prevRange: DateRange; yoyRange: DateRange }

export default function OverviewView({ filters, dateMax }: { filters: Filters; dateMax: string }) {
  const [data, setData] = useState<Cmp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      const cur = clampToData({ from: filters.from, to: filters.to }, dateMax);
      const prevRange = previousPeriod(cur);
      const yoyRange = sameRangeLastYear(cur);
      const [a, b, c] = await Promise.all([
        getTikiSummary(cur.from, cur.to, filters.route, filters.driver),
        getTikiSummary(prevRange.from, prevRange.to, filters.route, filters.driver),
        getTikiSummary(yoyRange.from, yoyRange.to, filters.route, filters.driver),
      ]);
      if (!alive) return;
      if (a.error) { setError(a.error); setLoading(false); return; }
      setData({
        cur: a.data!,
        prev: b.data && b.data.tickets > 0 ? b.data : null,
        yoy: c.data && c.data.tickets > 0 ? c.data : null,
        prevRange, yoyRange,
      });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [filters, dateMax]);

  const anomalies = useMemo(() => (data ? anomalousDays(data.cur.daily) : []), [data]);

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (loading || !data) return <div style={{ padding: 20, color: '#999' }}>Se încarcă…</div>;

  const { cur, prev, yoy } = data;
  if (!cur.tickets) return <Notice tone="info">Nu sunt bilete în perioada și filtrele alese.</Notice>;

  // O comparație nu e corectă dacă una dintre perioade atinge sincronizarea în bloc (pentru valori pe zi / pe cursă)
  // sau dacă perioada de comparat nu are date.
  const naPrev = !prev ? 'Nu sunt date în perioada anterioară.' : undefined;
  const naYoy = !yoy ? 'Nu sunt date în aceeași perioadă de anul trecut.' : undefined;
  // Sincronizarea în bloc mută biletele din decembrie 2025 în ianuarie 2026: dacă oricare dintre perioadele comparate
  // o atinge, variațiile volumelor nu sunt corecte (prețul mediu rămâne comparabil).
  const syncCur = unreliableOverlap(filters);
  const syncNa = (r: DateRange) =>
    syncCur || unreliableOverlap(r) ? 'Una dintre perioade atinge sincronizarea în bloc din dec. 2025 – ian. 2026: biletele sunt mutate între zile.' : undefined;

  const perTrip = (s: TikiSummary | null) => (s && s.trip_days ? s.trip_tickets / s.trip_days : null);
  const avgPrice = (s: TikiSummary | null) => (s && s.tickets ? s.lei / s.tickets : null);

  const kpis = [
    { title: 'Bilete', value: fmtInt(cur.tickets), sub: `${fmtInt(cur.days)} zile · ${fmtInt(cur.drivers)} șoferi`, f: (s: TikiSummary | null) => s?.tickets ?? null, sync: true },
    { title: 'Încasat prin bilete', value: fmtLei(cur.lei), sub: `${fmtPct(share(cur.card, cur.tickets))} plătite cu cardul`, f: (s: TikiSummary | null) => s?.lei ?? null, sync: true },
    { title: 'Preț mediu', value: `${nf2.format(avgPrice(cur) ?? 0)} lei`, sub: 'pe bilet', f: avgPrice, sync: false },
    { title: 'Curse efectuate', value: fmtInt(cur.trip_days), sub: 'zi × cursă × direcție, cu bilete', f: (s: TikiSummary | null) => s?.trip_days ?? null, sync: true },
    { title: 'Bilete pe cursă', value: perTrip(cur) == null ? '—' : nf1.format(perTrip(cur)!), sub: 'cât vinde în medie o cursă', f: perTrip, sync: true },
  ];

  const syncDays = new Set<string>();
  for (const d of cur.daily) if (UNRELIABLE_RANGES.some(u => d.d >= u.from && d.d <= u.to)) syncDays.add(d.d);
  const flagged = new Set([...anomalies.map(a => a.d), ...syncDays]);

  const deduced = share(cur.dedus, cur.tickets) ?? 0;
  const nedet = share(cur.nedet, cur.tickets) ?? 0;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 12 }}>
        {kpis.map(k => (
          <Kpi key={k.title} title={k.title} value={k.value} sub={k.sub}>
            <CompareLine label={`vs ${fmtDate(data.prevRange.from)}–${fmtDate(data.prevRange.to)}`}
              pct={pctChange(k.f(cur), k.f(prev))} na={naPrev ?? (k.sync ? syncNa(data.prevRange) : undefined)} />
            <CompareLine label="vs anul trecut"
              pct={pctChange(k.f(cur), k.f(yoy))} na={naYoy ?? (k.sync ? syncNa(data.yoyRange) : undefined)} />
          </Kpi>
        ))}
      </div>

      {(deduced > 0 || nedet > 0 || cur.anulare > 0) && (
        <Notice tone="info">
          {deduced > 0 && <>ⓘ {fmtPct(deduced)} din bilete n-au stații în export (înainte de feb. 2026): tipul biletului e <b>dedus din preț</b> (verificat: 98,6% potriviri). </>}
          {cur.nedet > 0 && <>{fmtInt(cur.nedet)} bilete n-au putut fi identificate. </>}
          {cur.anulare > 0 && <>{fmtInt(cur.anulare)} bilete sunt pe «Anulare» (vânzări fără cursă numită) — intră în totaluri, nu și în curse.</>}
        </Notice>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Bilete pe zile</div>
        <BarChart
          data={cur.daily.map(d => ({
            key: d.d, label: `${d.d.slice(8, 10)}.${d.d.slice(5, 7)}`, value: d.tickets,
            extra: fmtLei(d.lei),
          }))}
          flag={k => flagged.has(k)}
          flagLabel={syncDays.size
            ? 'Zile din sincronizarea în bloc sau cu volum anormal: data nu e ziua vânzării'
            : 'Zi cu volum anormal (peste 3× mediana zilelor din jur)'}
        />
        {anomalies.length > 0 && (
          <div style={{ fontSize: 12, color: '#8a5a00', marginTop: 6 }}>
            Zile anormale: {anomalies.slice(0, 8).map(a => `${fmtDate(a.d)} (${fmtInt(a.tickets)} bilete, de obicei ~${fmtInt(a.median)})`).join('; ')}
            {anomalies.length > 8 && ` și încă ${anomalies.length - 8}`}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Direcții</div>
          <SplitBar width={260} parts={[
            { value: cur.tur, color: SERIES[0], label: 'Tur (din Chișinău)' },
            { value: cur.retur, color: SERIES[1], label: 'Retur (spre Chișinău)' },
          ]} />
          <table style={{ marginTop: 10, width: '100%' }}>
            <tbody>
              <tr>
                <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: SERIES[0], marginRight: 6 }} />Tur (din Chișinău)</td>
                <td style={{ textAlign: 'right' }}>{fmtInt(cur.tur)}</td>
                <td style={{ textAlign: 'right' }}>{fmtPct(share(cur.tur, cur.tur + cur.retur))}</td>
                <td style={{ textAlign: 'right' }}>{fmtLei(cur.lei_tur)}</td>
              </tr>
              <tr>
                <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: SERIES[1], marginRight: 6 }} />Retur (spre Chișinău)</td>
                <td style={{ textAlign: 'right' }}>{fmtInt(cur.retur)}</td>
                <td style={{ textAlign: 'right' }}>{fmtPct(share(cur.retur, cur.tur + cur.retur))}</td>
                <td style={{ textAlign: 'right' }}>{fmtLei(cur.lei_retur)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Plată</div>
          <table style={{ width: '100%' }}>
            <tbody>
              <tr><td>Numerar / altă metodă</td><td style={{ textAlign: 'right' }}>{fmtInt(cur.tickets - cur.card)}</td><td style={{ textAlign: 'right' }}>{fmtPct(share(cur.tickets - cur.card, cur.tickets))}</td></tr>
              <tr><td>Card</td><td style={{ textAlign: 'right' }}>{fmtInt(cur.card)}</td><td style={{ textAlign: 'right' }}>{fmtPct(share(cur.card, cur.tickets))}</td></tr>
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: '#777', marginTop: 8 }}>
            Comparațiile: perioada anterioară = aceleași nr. de zile imediat înainte; anul trecut = aceleași zile calendaristice.
          </div>
        </div>
      </div>
    </div>
  );
}
