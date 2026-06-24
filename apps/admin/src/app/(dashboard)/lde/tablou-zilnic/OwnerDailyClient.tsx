'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Wallet,
  Banknote,
  TrendingUp,
  Fuel,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { getDailyBreakdown, type OwnerDaily, type DailyBreakdown } from './actions';

const nf = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });

const LEVEL_LABEL: Record<string, string> = { rosu: '🔴 Roșu', galben: '🟡 Galben', verde: '🟢 Verde' };

function formatDateRo(dateStr: string): string {
  // 'YYYY-MM-DD' → 'd MMM YYYY' în română, fără TZ-shift.
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function OwnerDailyClient({ data }: { data: OwnerDaily }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // drill-down inline (combustibil / alerte)
  const [breakdown, setBreakdown] = useState<DailyBreakdown | null>(null);
  const [openPanel, setOpenPanel] = useState<'fuel' | 'alerts' | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);

  const allZero =
    data.combustibil_litri === 0 && data.km_total === 0 && data.alerte_total === 0;

  function onDateChange(value: string) {
    setOpenPanel(null);
    setBreakdown(null);
    const qs = value ? `?date=${value}` : '';
    startTransition(() => router.push(`/lde/tablou-zilnic${qs}`));
  }

  async function togglePanel(panel: 'fuel' | 'alerts') {
    if (openPanel === panel) {
      setOpenPanel(null);
      return;
    }
    setOpenPanel(panel);
    if (!breakdown) {
      setLoadingBreakdown(true);
      try {
        const b = await getDailyBreakdown(data.date);
        setBreakdown(b);
      } finally {
        setLoadingBreakdown(false);
      }
    }
  }

  // comparație săpt. trecută
  const leiDelta = data.prev_week ? data.combustibil_lei - data.prev_week.combustibil_lei : null;
  const kmDelta = data.prev_week ? data.km_total - data.prev_week.km_total : null;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1>Tablou zilnic</h1>
          <p className="text-sm text-muted-foreground">
            Cele 5 cifre pentru ziua trecută — {formatDateRo(data.date)}
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

      {allZero && (
        <div
          className="badge badge-absent"
          style={{ display: 'block', padding: '0.75rem 1rem', marginBottom: '1rem' }}
        >
          Datele vor apărea după conectarea GPS + Benzol.
        </div>
      )}

      {/* ── 5 CIFRE ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* 1. VENIT — link la Numărare (NU se calculează aici) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">💰 Venit</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Veniturile (interurban + suburban) se văd în modulul GO.
            </p>
            <Link href="/numarare" className="btn btn-outline" style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              Deschide GO <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        {/* 2. CHELTUIELI — combustibil cunoscut */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">💸 Cheltuieli</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{nf.format(data.combustibil_lei)} lei</div>
            <div className="text-sm text-muted-foreground">combustibil (cunoscut)</div>
            <p className="text-xs text-muted-foreground" style={{ marginTop: '0.5rem' }}>
              + salarii (modul salarizare LDE)
            </p>
          </CardContent>
        </Card>

        {/* 3. PROFIT — notă, NU se inventează */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">📊 Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Profit = Venit (GO) − Cheltuieli (combustibil + salarii).
            </p>
            <p className="text-xs text-muted-foreground" style={{ marginTop: '0.5rem' }}>
              Cheltuieli combustibil cunoscute: <strong>{nf.format(data.combustibil_lei)} lei</strong>. Necesită venitul din GO.
            </p>
            <Link href="/numarare" className="btn btn-outline" style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              Vezi venitul <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        {/* 4. COMBUSTIBIL — litri + lei, click → defalcare */}
        <Card
          role="button"
          tabIndex={0}
          onClick={() => togglePanel('fuel')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              togglePanel('fuel');
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">⛽ Combustibil</CardTitle>
            <Fuel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{nf1.format(data.combustibil_litri)} L</div>
            <div className="text-sm text-muted-foreground">{nf.format(data.combustibil_lei)} lei</div>
            <div className="text-xs text-muted-foreground" style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              Defalcare pe stații
              <ChevronDown className="h-3.5 w-3.5" style={{ transform: openPanel === 'fuel' ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </div>
          </CardContent>
        </Card>

        {/* 5. ALERTE — badge-uri nivel, click → defalcare */}
        <Card
          role="button"
          tabIndex={0}
          onClick={() => togglePanel('alerts')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              togglePanel('alerts');
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">🚨 Alerte</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 text-base font-semibold">
              <span title="Roșu">🔴 {data.alerte.rosu}</span>
              <span title="Galben">🟡 {data.alerte.galben}</span>
              <span title="Verde">🟢 {data.alerte.verde}</span>
            </div>
            <div className="text-xs text-muted-foreground" style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              {data.alerte_total} deschise · defalcare
              <ChevronDown className="h-3.5 w-3.5" style={{ transform: openPanel === 'alerts' ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── DEFALCARE INLINE ────────────────────────────────────── */}
      {openPanel && (
        <Card style={{ marginTop: '1rem' }}>
          <CardContent style={{ paddingTop: '1.25rem' }}>
            {loadingBreakdown && <p className="text-sm text-muted-foreground">Se încarcă…</p>}

            {!loadingBreakdown && openPanel === 'fuel' && breakdown && (
              <>
                <h3 className="text-base font-semibold" style={{ marginBottom: '0.75rem' }}>
                  Combustibil pe stații — {formatDateRo(breakdown.date)}
                </h3>
                {breakdown.combustibil_pe_statii.length === 0 ? (
                  <p className="text-center text-muted">Nu există alimentări în ziua aceasta.</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Stație</th>
                        <th>Sursă</th>
                        <th>Litri</th>
                        <th>Lei</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.combustibil_pe_statii.map((r) => (
                        <tr key={`${r.sursa}-${r.statie}`}>
                          <td>{r.statie}</td>
                          <td>
                            <span className={r.sursa === 'card' ? 'badge badge-ok' : 'badge badge-absent'}>
                              {r.sursa === 'card' ? 'Card' : 'Numerar'}
                            </span>
                          </td>
                          <td>{nf1.format(r.litri)} L</td>
                          <td>{nf.format(r.lei)} lei</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}

            {!loadingBreakdown && openPanel === 'alerts' && breakdown && (
              <>
                <h3 className="text-base font-semibold" style={{ marginBottom: '0.75rem' }}>
                  Alerte deschise pe nivel
                </h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nivel</th>
                      <th>Număr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.alerte_pe_nivel.map((r) => (
                      <tr key={r.level}>
                        <td>{LEVEL_LABEL[r.level]}</td>
                        <td>{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Link href="/lde/alerte" className="btn btn-outline" style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  Vezi toate alertele <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── COMPARAȚIE SĂPT. TRECUTĂ (opțional) ─────────────────── */}
      {data.prev_week && (
        <div className="page-header" style={{ marginTop: '1.5rem' }}>
          <h2 className="text-lg font-semibold">
            Față de aceeași zi săptămâna trecută ({formatDateRo(data.prev_week.date)})
          </h2>
        </div>
      )}
      {data.prev_week && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Combustibil (lei)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{nf.format(data.combustibil_lei)} lei</div>
              <DeltaLine delta={leiDelta} unit="lei" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Km flotă</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{nf.format(data.km_total)} km</div>
              <DeltaLine delta={kmDelta} unit="km" />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function DeltaLine({ delta, unit }: { delta: number | null; unit: string }) {
  if (delta === null) return null;
  if (delta === 0) {
    return <div className="text-sm text-muted-foreground">la fel ca săptămâna trecută</div>;
  }
  const up = delta > 0;
  return (
    <div className="text-sm" style={{ color: up ? 'var(--danger, #ef4444)' : 'var(--success, #16a34a)' }}>
      {up ? '▲' : '▼'} {nf.format(Math.abs(delta))} {unit} {up ? 'mai mult' : 'mai puțin'}
    </div>
  );
}
