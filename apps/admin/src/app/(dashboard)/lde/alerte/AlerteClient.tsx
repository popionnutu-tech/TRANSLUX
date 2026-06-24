'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DtLevel, DtMethod } from '@translux/db';
import {
  getDtAlerts,
  recomputeDtAlerts,
  recomputeCronicAlerts,
  updateAlertStatus,
  type DtAlertRow,
  type DtAlertStatus,
  type DtResolutionAction,
  type RecomputeResult,
} from './actions';

// ── Etichete RO (enum-urile sunt sincrone cu CHECK din migrarea 205) ──
const LEVEL_LABELS: Record<DtLevel, string> = {
  verde: '🟢 Verde',
  galben: '🟡 Galben',
  rosu: '🔴 Roșu',
};

const STATUS_LABELS: Record<DtAlertStatus, string> = {
  nou: 'Nou',
  in_analiza: 'În analiză',
  raportat: 'Raportat',
  rezolvat: 'Rezolvat',
};

// Următorul pas în fluxul de status (linear nou → in_analiza → raportat → rezolvat).
const NEXT_STATUS: Record<DtAlertStatus, DtAlertStatus | null> = {
  nou: 'in_analiza',
  in_analiza: 'raportat',
  raportat: 'rezolvat',
  rezolvat: null,
};

const METHOD_LABELS: Record<DtMethod, string> = {
  between_alimentari_A: 'Între alimentări',
  monthly_B: 'Lunar',
  cronic_pattern: 'Cronic',
};

const RESOLUTION_LABELS: Record<DtResolutionAction, string> = {
  mustrare: 'Mustrare',
  penalizare_lei: 'Penalizare (lei)',
  concediere: 'Concediere',
  norma_ajustata: 'Normă ajustată',
  fals_pozitiv: 'Fals pozitiv',
  altul: 'Altul',
};
const RESOLUTION_OPTIONS = Object.keys(RESOLUTION_LABELS) as DtResolutionAction[];

function num(n: number, digits = 1): string {
  return Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

// globals.css are doar badge-ok (verde) + badge-absent (roșu); galben → badge simplu colorat inline.
function levelBadge(level: DtLevel): { className: string; style?: React.CSSProperties } {
  if (level === 'rosu') return { className: 'badge badge-absent' };
  if (level === 'galben')
    return { className: 'badge', style: { color: 'var(--warning)', borderColor: 'var(--warning)' } };
  return { className: 'badge badge-ok' };
}

export default function AlerteClient({ initialAlerts }: { initialAlerts: DtAlertRow[] }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<DtAlertRow[]>(initialAlerts);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);

  // Lună implicită = luna trecută (alertele se calculează pe luna încheiată).
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [genMonth, setGenMonth] = useState(
    `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`,
  );

  const [levelFilter, setLevelFilter] = useState<DtLevel | ''>('');
  const [statusFilter, setStatusFilter] = useState<DtAlertStatus | ''>('');

  const hasData = alerts.length > 0;

  async function refetch() {
    const data = await getDtAlerts({
      level: levelFilter || undefined,
      status: statusFilter || undefined,
    });
    setAlerts(data);
  }

  function applyFilters(nextLevel: DtLevel | '', nextStatus: DtAlertStatus | '') {
    setLevelFilter(nextLevel);
    setStatusFilter(nextStatus);
    startTransition(async () => {
      const data = await getDtAlerts({
        level: nextLevel || undefined,
        status: nextStatus || undefined,
      });
      setAlerts(data);
    });
  }

  function handleRecompute() {
    setError(null);
    setRecomputeMsg(null);
    startTransition(async () => {
      try {
        const res: RecomputeResult = await recomputeDtAlerts(genMonth + '-01');
        setRecomputeMsg(
          `Generate: ${res.generated} (🟢 ${res.by_level.verde} · 🟡 ${res.by_level.galben} · 🔴 ${res.by_level.rosu}). ` +
            `Sărite (lipsă tip): ${res.skipped_no_type}.`,
        );
        await refetch();
        router.refresh();
      } catch (e: any) {
        setError(e.message || 'Eroare la recalcularea alertelor');
      }
    });
  }

  // Pattern cronic: 2 luni la rând cu același перерасход (±0.3) → «trimite la măsurare».
  // Se rulează DUPĂ ce există alerte lunare (monthly_B) pe luna curentă + precedentă.
  function handleRecomputeCronic() {
    setError(null);
    setRecomputeMsg(null);
    startTransition(async () => {
      try {
        const res = await recomputeCronicAlerts(genMonth + '-01');
        setRecomputeMsg(`Alerte cronice generate: ${res.cronic_generated}.`);
        await refetch();
        router.refresh();
      } catch (e: any) {
        setError(e.message || 'Eroare la recalcularea pattern-ului cronic');
      }
    });
  }

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>Alerte DT</h1>
      </div>

      {/* Recalculare */}
      <div className="card mb-4">
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>Luna</label>
            <input type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={handleRecompute} disabled={pending}>
            {pending ? 'Se calculează...' : 'Recalculează alerte'}
          </button>
          <button className="btn btn-outline" onClick={handleRecomputeCronic} disabled={pending}
            title="Detectează mașinile cu перерасход cronic (2 luni la rând). Rulează după recalcularea alertelor lunare pe luna curentă + precedentă.">
            {pending ? '...' : 'Recalculează cronic'}
          </button>
        </div>
        {recomputeMsg && <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>{recomputeMsg}</p>}
        {error && <p style={{ color: 'var(--danger)', fontSize: 14, marginTop: 8 }}>{error}</p>}
      </div>

      {/* Banner: fără date GPS/fuel */}
      {!hasData && (
        <div className="card mb-4" style={{ borderLeft: '4px solid var(--warning)' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Nu există alerte deocamdată. Alerte vor apărea după conectarea GPS + Benzol și recalculare pe lună.
          </p>
        </div>
      )}

      {/* Filtre */}
      <div className="card mb-4 filter-bar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}>
          <label>Nivel</label>
          <select value={levelFilter} onChange={(e) => applyFilters(e.target.value as DtLevel | '', statusFilter)}>
            <option value="">Toate</option>
            <option value="verde">🟢 Verde</option>
            <option value="galben">🟡 Galben</option>
            <option value="rosu">🔴 Roșu</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}>
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => applyFilters(levelFilter, e.target.value as DtAlertStatus | '')}>
            <option value="">Toate</option>
            <option value="nou">Nou</option>
            <option value="in_analiza">În analiză</option>
            <option value="raportat">Raportat</option>
            <option value="rezolvat">Rezolvat</option>
          </select>
        </div>
      </div>

      {/* Tabel */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Mașină</th>
              <th>Data</th>
              <th>Metodă</th>
              <th>Km</th>
              <th>Litri</th>
              <th>Normă</th>
              <th>Real</th>
              <th>Перерасход</th>
              <th>Nivel</th>
              <th>Status</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <AlertRow key={a.id} alert={a} onChanged={refetch} disabled={pending} />
            ))}
            {alerts.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center text-muted">
                  Nu există alerte.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlertRow({
  alert,
  onChanged,
  disabled,
}: {
  alert: DtAlertRow;
  onChanged: () => Promise<void>;
  disabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resAction, setResAction] = useState<DtResolutionAction>('fals_pozitiv');
  const [resNotes, setResNotes] = useState('');

  // Valoarea stocată e sursa unică (motorul o calculează exact); fallback la re-derivare pentru rânduri vechi.
  const pererashod = alert.pererashod_l_per_100km ?? (alert.actual_consumption_l_per_100km - litriNormaPer100(alert));
  const next = NEXT_STATUS[alert.status];

  async function advance() {
    if (!next) return;
    // Trecerea la 'rezolvat' cere acțiunea de rezolvare → deschide panoul inline.
    if (next === 'rezolvat') {
      setResolving(true);
      return;
    }
    setBusy(true);
    try {
      await updateAlertStatus(alert.id, next);
      await onChanged();
      router.refresh();
    } catch (e: any) {
      window.alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmResolve() {
    setBusy(true);
    try {
      await updateAlertStatus(alert.id, 'rezolvat', resAction, resNotes.trim() || undefined);
      setResolving(false);
      await onChanged();
      router.refresh();
    } catch (e: any) {
      window.alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td style={{ fontWeight: 600 }}>
        {alert.vehicle_plate}
        {alert.vehicle_in_repair && (
          <span className="badge" style={{ marginLeft: 6, color: 'var(--warning)', borderColor: 'var(--warning)' }} title="Mașina era în reparație — consum posibil afectat de testarea motorului">
            🔧 în reparație
          </span>
        )}
      </td>
      <td>{new Date(alert.alert_date + 'T00:00:00Z').toLocaleDateString('ro-RO', { timeZone: 'UTC' })}</td>
      <td className="text-muted" style={{ fontSize: 12 }}>
        {METHOD_LABELS[alert.method]}
        {!alert.has_precise_cutoff && (
          <span
            className="badge"
            style={{ marginLeft: 6, color: 'var(--warning)', borderColor: 'var(--warning)' }}
            title="Estimare «formulă uscată» (litri/km×100, fără plin precis / отсечкă). NU e o măsurare precisă plin→plin — §3.4."
          >
            ≈ formulă uscată
          </span>
        )}
      </td>
      <td>{num(alert.km_in_period, 0)}</td>
      <td>{num(alert.litri_alimentati)}</td>
      <td className="text-muted">{num(litriNormaPer100(alert))}</td>
      <td>{num(alert.actual_consumption_l_per_100km)}</td>
      <td style={{ fontWeight: 600, color: pererashod > 0 ? 'var(--danger)' : 'var(--text)' }}>
        {pererashod > 0 ? '+' : ''}
        {num(pererashod)}
      </td>
      <td>
        {(() => {
          const b = levelBadge(alert.level);
          return (
            <span className={b.className} style={b.style}>
              {LEVEL_LABELS[alert.level]}
            </span>
          );
        })()}
      </td>
      <td>
        <span className="badge">{STATUS_LABELS[alert.status]}</span>
        {alert.status === 'rezolvat' && alert.resolution_action && (
          <span className="text-muted" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
            {RESOLUTION_LABELS[alert.resolution_action]}
          </span>
        )}
      </td>
      <td>
        {resolving ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={resAction}
              onChange={(e) => setResAction(e.target.value as DtResolutionAction)}
              style={{ fontSize: 12, padding: '2px 6px' }}
            >
              {RESOLUTION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {RESOLUTION_LABELS[opt]}
                </option>
              ))}
            </select>
            <input
              value={resNotes}
              onChange={(e) => setResNotes(e.target.value)}
              placeholder="Notă (opțional)"
              style={{ width: 130, fontSize: 12, padding: '2px 6px' }}
            />
            <button className="btn btn-primary" onClick={confirmResolve} disabled={busy} style={{ fontSize: 11, padding: '2px 8px' }}>
              {busy ? '...' : '✓'}
            </button>
            <button className="btn btn-outline" onClick={() => setResolving(false)} style={{ fontSize: 11, padding: '2px 8px' }}>
              ✕
            </button>
          </div>
        ) : next ? (
          <button className="btn btn-outline" onClick={advance} disabled={busy || disabled}>
            {next === 'rezolvat' ? 'Rezolvă' : `→ ${STATUS_LABELS[next]}`}
          </button>
        ) : (
          <span className="text-muted" style={{ fontSize: 12 }}>
            —
          </span>
        )}
      </td>
    </tr>
  );
}

// Normă efectivă (l/100km) re-derivată din litri_norma + km salvați în alertă.
function litriNormaPer100(a: DtAlertRow): number {
  if (a.km_in_period <= 0) return 0;
  return Math.round((a.litri_norma * 100 * 10) / a.km_in_period) / 10;
}
