'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Route, Truck, AlertTriangle, Fuel } from 'lucide-react';
import { getKmZileMasina, type KmPerioada, type KmZiDetaliu } from './actions';

const nf = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });

function formatDateRo(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function formatDayShort(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const DIR_LABELS: Record<string, string> = {
  interurban: 'Interurban',
  suburban: 'Suburban',
  camioane: 'Camioane (ACTROS)',
  DRAXELMAIER_BALTI: 'Draxlmaier Bălți',
  SEBN_ORHEI: 'SEBN Orhei',
  LEAR_UNGHENI: 'Lear Ungheni',
  LEAR_FLORESTI: 'Lear Florești',
};

const inputStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  borderRadius: 'var(--radius-xs, 6px)',
  border: '1px solid var(--border, #ddd)',
};

export default function KmZilnicClient({ data }: { data: KmPerioada }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [detalii, setDetalii] = useState<Record<string, KmZiDetaliu[] | 'loading'>>({});

  function navigate(from: string, to: string) {
    startTransition(() => router.push(`/lde/km-zilnic?from=${from}&to=${to}`));
  }

  function onMonthChange(value: string) {
    if (!value) return;
    const [y, m] = value.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    // luna curentă se taie la azi pe server (nu există date din viitor) — trimitem sfârșitul lunii
    navigate(`${value}-01`, `${value}-${String(lastDay).padStart(2, '0')}`);
  }

  function toggleDetalii(vehicleId: string) {
    if (detalii[vehicleId]) {
      setDetalii((prev) => {
        const next = { ...prev };
        delete next[vehicleId];
        return next;
      });
      return;
    }
    setDetalii((prev) => ({ ...prev, [vehicleId]: 'loading' }));
    getKmZileMasina(vehicleId, data.from, data.to)
      .then((zile) => setDetalii((prev) => ({ ...prev, [vehicleId]: zile })))
      .catch(() => setDetalii((prev) => {
        const next = { ...prev };
        delete next[vehicleId];
        return next;
      }));
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1>Km &amp; motorină</h1>
          <p className="text-sm text-muted-foreground">
            Km GPS și motorină per direcție și mașină — {formatDateRo(data.from)} → {formatDateRo(data.to)}.
            Media l/100km = total litri / total km pe perioadă.
          </p>
        </div>
        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <label htmlFor="month-picker" className="text-sm text-muted-foreground">Luna:</label>
          <input
            id="month-picker"
            type="month"
            value={data.from.slice(0, 7)}
            disabled={isPending}
            onChange={(e) => onMonthChange(e.target.value)}
            style={inputStyle}
          />
          <span className="text-sm text-muted-foreground">sau interval:</span>
          <input
            type="date"
            value={data.from}
            disabled={isPending}
            onChange={(e) => e.target.value && navigate(e.target.value, data.to)}
            style={inputStyle}
          />
          <span className="text-sm text-muted-foreground">→</span>
          <input
            type="date"
            value={data.to}
            disabled={isPending}
            onChange={(e) => e.target.value && navigate(data.from, e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {data.masini_total === 0 && (
        <div className="badge badge-absent" style={{ display: 'block', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
          Nu există date GPS sau alimentări pentru perioada selectată.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4" style={{ marginBottom: '1rem' }}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Km flotă</CardTitle>
            <Route className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{nf.format(data.km_flota)} km</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Motorină</CardTitle>
            <Fuel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{nf.format(data.litri_flota)} L</div>
            {data.consum_flota != null && (
              <div className="text-sm text-muted-foreground">{nf1.format(data.consum_flota)} l/100km media flotei</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mașini</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.masini_total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mașini cu probleme</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: data.probleme_total > 0 ? 'var(--danger, #ef4444)' : undefined }}>
              {data.probleme_total}
            </div>
          </CardContent>
        </Card>
      </div>

      {data.directii.map((dir) => (
        <Card key={dir.directie} style={{ marginBottom: '1rem' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>{DIR_LABELS[dir.directie] ?? dir.directie}</CardTitle>
            <span className="text-sm text-muted-foreground">
              {nf.format(dir.km_total)} km · {nf.format(dir.litri_total)} L · {dir.masini} mașini
              {dir.cu_probleme > 0 && (
                <span style={{ color: 'var(--danger, #ef4444)', marginLeft: '0.5rem' }}>
                  {dir.cu_probleme} cu probleme
                </span>
              )}
            </span>
          </CardHeader>
          <CardContent>
            <div style={{ overflowX: 'auto' }}>
              {/* tableLayout fix + colgroup — aceleași lățimi în TOATE tabelele (simetrie între direcții) */}
              <table className="pivot-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '9rem' }} />
                  <col style={{ width: '7rem' }} />
                  <col style={{ width: '7rem' }} />
                  <col style={{ width: '7rem' }} />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Mașina</th>
                    <th style={{ textAlign: 'right' }}>Km</th>
                    <th style={{ textAlign: 'right' }}>Litri</th>
                    <th style={{ textAlign: 'right' }}>l/100km</th>
                    <th style={{ textAlign: 'left' }}>Stare</th>
                  </tr>
                </thead>
                <tbody>
                  {dir.rows.map((r) => {
                    const det = detalii[r.vehicle_id];
                    return [
                      <tr
                        key={r.vehicle_id}
                        onClick={() => toggleDetalii(r.vehicle_id)}
                        style={{ cursor: 'pointer', ...(r.probleme.length ? { background: 'var(--danger-dim, #fef2f2)' } : {}) }}
                        title="Click pentru detaliul pe zile"
                      >
                        <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'left' }}>
                          <span style={{ color: 'var(--muted-foreground, #888)', marginRight: 4 }}>{det ? '▾' : '▸'}</span>
                          {r.plate_number}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{nf.format(r.km)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.litri > 0 ? nf.format(r.litri) : '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.consum != null ? nf1.format(r.consum) : '—'}</td>
                        <td>
                          {r.probleme.length === 0 ? (
                            <span className="badge badge-ok">OK</span>
                          ) : (
                            r.probleme.map((p) => (
                              <div key={p} style={{ color: 'var(--danger, #ef4444)', fontSize: 13 }}>
                                {p}
                              </div>
                            ))
                          )}
                        </td>
                      </tr>,
                      det ? (
                        <tr key={`${r.vehicle_id}-detalii`}>
                          <td colSpan={5} style={{ padding: '0.25rem 0.5rem 0.75rem 1.5rem', background: 'var(--muted, #fafafa)' }}>
                            {det === 'loading' ? (
                              <span className="text-sm text-muted-foreground">Se încarcă zilele…</span>
                            ) : det.length === 0 ? (
                              <span className="text-sm text-muted-foreground">Fără date pe zile în perioadă.</span>
                            ) : (
                              <table style={{ width: '100%', fontSize: 13 }}>
                                <thead>
                                  <tr className="text-muted-foreground">
                                    <th style={{ textAlign: 'left', fontWeight: 500 }}>Ziua</th>
                                    <th style={{ textAlign: 'right', fontWeight: 500 }}>Km</th>
                                    <th style={{ textAlign: 'right', fontWeight: 500 }}>Alimentat</th>
                                    <th style={{ textAlign: 'left', fontWeight: 500, paddingLeft: '1rem' }}>Stare</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {det.map((z) => (
                                    <tr key={z.date}>
                                      <td>{formatDayShort(z.date)}</td>
                                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{nf1.format(z.km)}</td>
                                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                                        {z.litri > 0 ? `${nf.format(z.litri)} L${z.alimentari > 1 ? ` (${z.alimentari}×)` : ''}` : '—'}
                                      </td>
                                      <td style={{ paddingLeft: '1rem' }}>
                                        {z.probleme.map((p) => (
                                          <span key={p} style={{ color: 'var(--danger, #ef4444)', marginRight: 8 }}>{p}</span>
                                        ))}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      ) : null,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
