'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  compareExperiment,
  inclusiveDays,
  LDE_EXPERIMENT_ROUTE_KIND_LABELS,
  LDE_EXPERIMENT_STATUS_LABELS,
  LDE_EXPERIMENT_DECISION_LABELS,
  type LdeExperimentRouteKind,
  type LdeExperimentStatus,
  type Vehicle,
} from '@translux/db';
import {
  createExperiment,
  snapshotBaseline,
  startTest,
  snapshotTestAndFinish,
  setDecision,
  deleteExperiment,
  type ExperimentRow,
} from './actions';

const ROUTE_KIND_OPTIONS = Object.keys(LDE_EXPERIMENT_ROUTE_KIND_LABELS) as LdeExperimentRouteKind[];

function num(n: number | null | undefined, digits = 0): string {
  return Number(n ?? 0).toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00Z').toLocaleDateString('ro-RO', { timeZone: 'UTC' });
}

function statusBadge(status: LdeExperimentStatus): { className: string; style?: React.CSSProperties } {
  if (status === 'done') return { className: 'badge badge-ok' };
  if (status === 'cancelled') return { className: 'badge badge-absent' };
  if (status === 'test') return { className: 'badge', style: { color: 'var(--warning)', borderColor: 'var(--warning)' } };
  return { className: 'badge' }; // baseline
}

export default function ExperimenteClient({
  initialExperiments,
  vehicles,
}: {
  initialExperiments: ExperimentRow[];
  vehicles: Vehicle[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Câmpuri formular creare
  const [name, setName] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [routeKind, setRouteKind] = useState<LdeExperimentRouteKind>('vehicle_set');
  const [vehicleIds, setVehicleIds] = useState<string[]>([]);
  const today = new Date().toISOString().slice(0, 10);
  const [baselineFrom, setBaselineFrom] = useState('');
  const [baselineTo, setBaselineTo] = useState('');
  const [notes, setNotes] = useState('');

  const hasData = initialExperiments.length > 0;

  function resetForm() {
    setName('');
    setHypothesis('');
    setRouteKind('vehicle_set');
    setVehicleIds([]);
    setBaselineFrom('');
    setBaselineTo('');
    setNotes('');
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      try {
        await createExperiment({
          name,
          hypothesis,
          route_kind: routeKind,
          vehicle_ids: vehicleIds,
          baseline_from: baselineFrom,
          baseline_to: baselineTo,
          notes,
        });
        resetForm();
        setShowForm(false);
        router.refresh();
      } catch (e: any) {
        setError(e.message || 'Eroare la crearea experimentului');
      }
    });
  }

  // Acțiune generică de flux: rulează server action, apoi router.refresh() reîncarcă lista.
  function runAction(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e: any) {
        setError(e.message || 'Eroare');
      }
    });
  }

  // Server e sursa de adevăr: pagina e force-dynamic, iar acțiunile fac router.refresh()
  // → initialExperiments e mereu proaspăt (fără stare locală duplicată).
  return (
    <div className="page page-wide">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Experimente</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)} disabled={pending}>
          {showForm ? 'Închide formularul' : '+ Experiment nou'}
        </button>
      </div>

      <p style={{ color: 'var(--text-muted)', marginTop: -8, marginBottom: 16 }}>
        Testează o schimbare (alt model de mașină, alt traseu) pe o perioadă, compară costul cu perioada de
        referință și decide dacă o implementezi.
      </p>

      {error && (
        <div className="card mb-4" style={{ borderLeft: '4px solid var(--danger)' }}>
          <p style={{ margin: 0, color: 'var(--danger)' }}>{error}</p>
        </div>
      )}

      {/* Formular creare */}
      {showForm && (
        <div className="card mb-4">
          <h3 style={{ marginTop: 0 }}>Experiment nou</h3>
          <div className="form-group">
            <label>Nume *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: DAF → Sprinter pe Briceni-Lipcani"
            />
          </div>
          <div className="form-group">
            <label>Ipoteza</label>
            <textarea
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="Ce ne așteptăm să se întâmple? (ex: Sprinter consumă mai puțin pe acest traseu)"
              rows={2}
            />
          </div>
          <div className="form-group">
            <label>Ce se experimentează</label>
            <select value={routeKind} onChange={(e) => setRouteKind(e.target.value as LdeExperimentRouteKind)}>
              {ROUTE_KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {LDE_EXPERIMENT_ROUTE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Vehicule monitorizate * ({vehicleIds.length} selectate)</label>
            <select
              multiple
              value={vehicleIds}
              onChange={(e) => setVehicleIds(Array.from(e.target.selectedOptions, (o) => o.value))}
              style={{ minHeight: 140 }}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number}
                </option>
              ))}
            </select>
            <small className="text-muted">Ține Ctrl/Cmd pentru a selecta mai multe.</small>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ minWidth: 160 }}>
              <label>Baseline — de la *</label>
              <input type="date" max={today} value={baselineFrom} onChange={(e) => setBaselineFrom(e.target.value)} />
            </div>
            <div className="form-group" style={{ minWidth: 160 }}>
              <label>Baseline — până la *</label>
              <input type="date" max={today} value={baselineTo} onChange={(e) => setBaselineTo(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Note</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opțional" />
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={pending}>
            {pending ? 'Se creează...' : 'Creează experiment'}
          </button>
        </div>
      )}

      {/* Banner: fără date */}
      {!hasData && !showForm && (
        <div className="card mb-4" style={{ borderLeft: '4px solid var(--warning)' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Niciun experiment încă. Creează unul cu «+ Experiment nou». Comparația de cost se bazează pe datele GPS +
            alimentări (Benzol / numerar) — dacă acestea nu sunt încă conectate, snapshot-urile vor fi 0.
          </p>
        </div>
      )}

      {/* Lista experimente */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {initialExperiments.map((exp) => (
          <ExperimentCard key={exp.id} exp={exp} disabled={pending} onAction={runAction} />
        ))}
      </div>
    </div>
  );
}

function ExperimentCard({
  exp,
  disabled,
  onAction,
}: {
  exp: ExperimentRow;
  disabled: boolean;
  onAction: (fn: () => Promise<void>) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [testFrom, setTestFrom] = useState(today);
  const b = statusBadge(exp.status);

  // Comparația (pură) — disponibilă doar când ambele snapshot-uri există (status done).
  const canCompare =
    exp.baseline_lei != null &&
    exp.baseline_km != null &&
    exp.baseline_litri != null &&
    exp.test_lei != null &&
    exp.test_km != null &&
    exp.test_litri != null;

  const comparison = canCompare
    ? compareExperiment(
        {
          litri: Number(exp.baseline_litri),
          lei: Number(exp.baseline_lei),
          km: Number(exp.baseline_km),
          days: inclusiveDays(exp.baseline_from, exp.baseline_to),
        },
        {
          litri: Number(exp.test_litri),
          lei: Number(exp.test_lei),
          km: Number(exp.test_km),
          days: inclusiveDays(exp.test_from, exp.test_to),
        },
      )
    : null;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>{exp.name}</h3>
          <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={b.className} style={b.style}>
              {LDE_EXPERIMENT_STATUS_LABELS[exp.status]}
            </span>
            {exp.route_kind && (
              <span className="text-muted" style={{ fontSize: 12 }}>
                {LDE_EXPERIMENT_ROUTE_KIND_LABELS[exp.route_kind]}
              </span>
            )}
            <span className="text-muted" style={{ fontSize: 12 }}>
              {exp.vehicle_ids?.length || 0} vehicule
            </span>
            {exp.decision && (
              <span className="badge badge-ok" title="Decizie finală">
                {LDE_EXPERIMENT_DECISION_LABELS[exp.decision]}
              </span>
            )}
          </div>
        </div>
        <button
          className="btn btn-danger"
          onClick={() => {
            if (window.confirm('Ștergi acest experiment?')) onAction(() => deleteExperiment(exp.id));
          }}
          disabled={disabled}
          style={{ fontSize: 12, padding: '4px 10px' }}
        >
          Șterge
        </button>
      </div>

      {exp.hypothesis && (
        <p style={{ color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
          <strong>Ipoteza:</strong> {exp.hypothesis}
        </p>
      )}

      {/* Perioade + snapshot-uri */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <PeriodBox
          title="Baseline"
          from={exp.baseline_from}
          to={exp.baseline_to}
          litri={exp.baseline_litri}
          lei={exp.baseline_lei}
          km={exp.baseline_km}
        />
        <PeriodBox
          title="Test"
          from={exp.test_from}
          to={exp.test_to}
          litri={exp.test_litri}
          lei={exp.test_lei}
          km={exp.test_km}
        />
      </div>

      {/* Comparația */}
      {comparison && (
        <div
          className="card"
          style={{
            marginTop: 12,
            background: 'var(--bg-subtle, transparent)',
            borderLeft: `4px solid ${
              comparison.verdict === 'economie'
                ? 'var(--success, green)'
                : comparison.verdict === 'pierdere'
                  ? 'var(--danger)'
                  : 'var(--text-muted)'
            }`,
          }}
        >
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                Cost/zi (baseline → test)
              </div>
              <div style={{ fontWeight: 600 }}>
                {num(comparison.baseline.lei_per_day)} → {num(comparison.test.lei_per_day)} lei
              </div>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                Consum l/100km
              </div>
              <div style={{ fontWeight: 600 }}>
                {num(comparison.baseline.litri_per_100km, 1)} → {num(comparison.test.litri_per_100km, 1)}
              </div>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                {comparison.economie_lei_per_month >= 0 ? 'Economie/lună' : 'Pierdere/lună'}
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 18,
                  color: comparison.economie_lei_per_month > 0 ? 'var(--success, green)' : comparison.economie_lei_per_month < 0 ? 'var(--danger)' : 'var(--text)',
                }}
              >
                {comparison.economie_lei_per_month > 0 ? '+' : ''}
                {num(comparison.economie_lei_per_month)} lei
              </div>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                Verdict
              </div>
              <div style={{ fontWeight: 600 }}>
                {comparison.verdict === 'economie'
                  ? '🟢 Economie'
                  : comparison.verdict === 'pierdere'
                    ? '🔴 Pierdere'
                    : '⚪ Neutru'}
              </div>
            </div>
          </div>
          <p className="text-muted" style={{ fontSize: 11, margin: '8px 0 0' }}>
            Extrapolare la 30 zile pe baza diferenței de cost/zi (perioade normalizate).
          </p>
        </div>
      )}

      {/* Butoane flux */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        {exp.status === 'baseline' && (
          <button className="btn btn-primary" onClick={() => onAction(() => snapshotBaseline(exp.id))} disabled={disabled}>
            Închide baseline →
          </button>
        )}

        {exp.status === 'test' && !exp.test_from && (
          <>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
              <label>Start test de la</label>
              <input type="date" max={today} value={testFrom} onChange={(e) => setTestFrom(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={() => onAction(() => startTest(exp.id, testFrom))} disabled={disabled}>
              Start test →
            </button>
          </>
        )}

        {exp.status === 'test' && exp.test_from && (
          <button
            className="btn btn-primary"
            onClick={() => onAction(() => snapshotTestAndFinish(exp.id))}
            disabled={disabled}
            title="Închide testul azi, agregă datele și calculează comparația"
          >
            Închide test (vezi comparația) →
          </button>
        )}

        {exp.status === 'done' && !exp.decision && (
          <>
            <button className="btn btn-primary" onClick={() => onAction(() => setDecision(exp.id, 'implement'))} disabled={disabled}>
              ✓ Implementează
            </button>
            <button className="btn btn-outline" onClick={() => onAction(() => setDecision(exp.id, 'cancel'))} disabled={disabled}>
              ✕ Anulează
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PeriodBox({
  title,
  from,
  to,
  litri,
  lei,
  km,
}: {
  title: string;
  from: string | null;
  to: string | null;
  litri: number | null;
  lei: number | null;
  km: number | null;
}) {
  const hasSnapshot = lei != null || km != null || litri != null;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div className="text-muted" style={{ fontSize: 12 }}>
        {fmtDate(from)} – {fmtDate(to)}
      </div>
      {hasSnapshot ? (
        <div style={{ marginTop: 6, fontSize: 13 }}>
          <div>Km: {num(km)}</div>
          <div>Litri: {num(litri, 1)}</div>
          <div>Cost: {num(lei)} lei</div>
        </div>
      ) : (
        <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
          (fără snapshot încă)
        </div>
      )}
    </div>
  );
}
