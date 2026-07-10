'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Route, Truck, AlertTriangle } from 'lucide-react';
import type { KmZilnic } from './actions';

const nf = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });

function formatDateRo(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
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

export default function KmZilnicClient({ data }: { data: KmZilnic }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onDateChange(value: string) {
    const qs = value ? `?date=${value}` : '';
    startTransition(() => router.push(`/lde/km-zilnic${qs}`));
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1>Km zilnic</h1>
          <p className="text-sm text-muted-foreground">
            Km total (GPS + porțiuni recuperate din găuri de semnal) per direcție și mașină — {formatDateRo(data.date)}
          </p>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="date-picker" className="text-sm text-muted-foreground" style={{ marginRight: '0.5rem' }}>
            Ziua:
          </label>
          <input
            id="date-picker"
            type="date"
            value={data.date}
            disabled={isPending}
            onChange={(e) => onDateChange(e.target.value)}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: 'var(--radius-xs, 6px)',
              border: '1px solid var(--border, #ddd)',
            }}
          />
        </div>
      </div>

      {data.masini_total === 0 && (
        <div className="badge badge-absent" style={{ display: 'block', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
          Nu există date GPS pentru ziua selectată.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" style={{ marginBottom: '1rem' }}>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Mașini cu GPS</CardTitle>
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
              {nf.format(dir.km_total)} km · {dir.masini} mașini
              {dir.cu_probleme > 0 && (
                <span style={{ color: 'var(--danger, #ef4444)', marginLeft: '0.5rem' }}>
                  {dir.cu_probleme} cu probleme
                </span>
              )}
            </span>
          </CardHeader>
          <CardContent>
            <div style={{ overflowX: 'auto' }}>
              <table className="pivot-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Mașina</th>
                    <th style={{ textAlign: 'right' }}>Km</th>
                    <th style={{ textAlign: 'left' }}>Stare</th>
                  </tr>
                </thead>
                <tbody>
                  {dir.rows.map((r) => (
                    <tr key={r.vehicle_id} style={r.probleme.length ? { background: 'var(--danger-dim, #fef2f2)' } : undefined}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{r.plate_number}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{nf1.format(r.km)}</td>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
