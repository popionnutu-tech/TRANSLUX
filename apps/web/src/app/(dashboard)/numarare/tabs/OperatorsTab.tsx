'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getOperatorsCamere,
  createOperatorCamere,
  toggleOperatorActive,
  getOperatorPrudence,
  type OperatorCamere,
  type OperatorPrudence,
} from './operatorActions';

// ─── Константы ───

const ROLE_LABELS: Record<string, string> = {
  OPERATOR_CAMERE: 'Operator',
  ADMIN_CAMERE: 'Admin camere',
};

const DEFAULT_PASSWORD = 'operator2026';

// ─── Компонент ───

export default function OperatorsTab() {
  const router = useRouter();

  const [operators, setOperators] = useState<OperatorCamere[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState(DEFAULT_PASSWORD);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [prudenceDays, setPrudenceDays] = useState<7 | 30 | 90>(30);
  const [prudence, setPrudence] = useState<OperatorPrudence[]>([]);
  const [prudenceLoading, setPrudenceLoading] = useState(false);

  const loadOperators = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getOperatorsCamere();
      setOperators(data);
    } catch {
      setError('Eroare la incarcarea operatorilor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOperators();
  }, [loadOperators]);

  const loadPrudence = useCallback(async () => {
    setPrudenceLoading(true);
    try {
      const res = await getOperatorPrudence(prudenceDays);
      setPrudence(res.data || []);
    } finally {
      setPrudenceLoading(false);
    }
  }, [prudenceDays]);

  useEffect(() => {
    loadPrudence();
  }, [loadPrudence]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    try {
      const result = await createOperatorCamere(formEmail, formPassword, formName);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setFormName('');
      setFormEmail('');
      setFormPassword(DEFAULT_PASSWORD);
      setShowForm(false);
      await loadOperators();
      router.refresh();
    } catch {
      setFormError('Eroare la crearea operatorului');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleToggle(op: OperatorCamere) {
    setTogglingId(op.id);
    try {
      const result = await toggleOperatorActive(op.id, !op.active);
      if (result.error) {
        setError(result.error);
        return;
      }
      await loadOperators();
      router.refresh();
    } catch {
      setError('Eroare la modificarea statusului');
    } finally {
      setTogglingId(null);
    }
  }

  const activeCount = operators.filter(op => op.active).length;

  return (
    <div>
      {/* Заголовок */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Operatori camere</h2>
          <span
            className="badge badge-ok"
            style={{ fontSize: 12 }}
          >
            {activeCount} activi
          </span>
        </div>
        <button
          className={showForm ? 'btn btn-outline' : 'btn btn-primary'}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Anuleaza' : 'Adauga operator'}
        </button>
      </div>

      {/* Ошибка уровня страницы */}
      {error && (
        <div style={{
          background: 'var(--danger-dim)',
          color: 'var(--danger)',
          padding: '10px 16px',
          borderRadius: 'var(--radius-xs)',
          fontSize: 13,
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Форма создания */}
      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0, minWidth: 160 }}>
              <label>Nume</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ion Popescu"
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0, minWidth: 180 }}>
              <label>Email</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="operator@translux.md"
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0, minWidth: 140 }}>
              <label>Parola</label>
              <input
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="min 6 caractere"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={formLoading}>
              {formLoading ? 'Se creeaza...' : 'Creeaza'}
            </button>
          </form>
          {formError && (
            <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{formError}</p>
          )}
        </div>
      )}

      {/* Analiza prudenței */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Prudență operatorilor</h3>
            <p className="text-muted" style={{ fontSize: 12, margin: '4px 0 0 0' }}>
              Abaterea pasagerilor scurți notați față de mediana rutei. Operatorii cu Δ mult negativ pierd pasageri scurți.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {([7, 30, 90] as const).map((d) => (
              <button
                key={d}
                className={prudenceDays === d ? 'btn btn-primary' : 'btn btn-outline'}
                style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => setPrudenceDays(d)}
              >
                {d} zile
              </button>
            ))}
          </div>
        </div>
        {prudenceLoading ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: 20 }}>Se incarca...</p>
        ) : prudence.length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: 20 }}>Date insuficiente pentru perioada selectata</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Operator</th>
                <th>Sesiuni</th>
                <th>Rute</th>
                <th>Avg scurți</th>
                <th>Baseline</th>
                <th>Δ</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {prudence.map((p) => {
                const statusColor =
                  p.status === 'warning' ? 'var(--danger)' :
                  p.status === 'attention' ? 'var(--warning)' :
                  'var(--success)';
                const statusLabel =
                  p.status === 'warning' ? '🚩 Ne prudent' :
                  p.status === 'attention' ? '⚠️ Atenție' :
                  '✅ OK';
                return (
                  <tr key={p.operator_id}>
                    <td style={{ fontWeight: 600 }}>{p.name || p.email}</td>
                    <td>{p.sessions}</td>
                    <td>{p.routes_covered}</td>
                    <td>{p.op_avg_short_pax.toFixed(2)}</td>
                    <td className="text-muted">{p.baseline_avg_short_pax.toFixed(2)}</td>
                    <td style={{ color: p.deviation_pct < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                      {p.deviation_pct > 0 ? '+' : ''}{p.deviation_pct.toFixed(1)}%
                    </td>
                    <td style={{ color: statusColor, fontWeight: 600, fontSize: 13 }}>
                      {statusLabel}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Таблица */}
      <div className="card">
        {loading ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: 20 }}>
            Se incarca...
          </p>
        ) : operators.length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: 20 }}>
            Niciun operator inregistrat
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nume</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Status</th>
                <th>Actiuni</th>
              </tr>
            </thead>
            <tbody>
              {operators.map((op) => (
                <tr key={op.id} style={{ opacity: op.active ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600 }}>{op.name || '—'}</td>
                  <td>{op.email}</td>
                  <td>
                    <span className="text-muted" style={{ fontSize: 13 }}>
                      {ROLE_LABELS[op.role] || op.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${op.active ? 'badge-ok' : 'badge-cancelled'}`}>
                      {op.active ? 'Activ' : 'Dezactivat'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={op.active ? 'btn btn-danger' : 'btn btn-outline'}
                      disabled={togglingId === op.id}
                      onClick={() => handleToggle(op)}
                      style={{ fontSize: 12 }}
                    >
                      {togglingId === op.id
                        ? '...'
                        : op.active ? 'Dezactiveaza' : 'Activeaza'
                      }
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
