'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getGraficReport,
  assignOverride,
  ignoreOverride,
  confirmDay,
  unconfirmDay,
  type GraficRouteRow,
  type OrphanNumerar,
  type Anomaly,
  type Confirmation,
} from './incasareActions';
import RoutesTable from './RoutesTable';
import OrphanNumerarTable from './OrphanNumerarTable';
import AnomalyCard, { AnomalyHeader } from './AnomalyCard';
import AssignDriverModal from './AssignDriverModal';
import IgnoreModal from './IgnoreModal';

function todayChisinau(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}
function yesterdayChisinau(): string {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

type SubTab = 'routes' | 'orphan_num' | 'orphan_inc';

interface Props {
  role: string;  // 'ADMIN' | 'EVALUATOR_INCASARI'
}

export default function IncasareTab({ role }: Props) {
  const canEdit = role === 'EVALUATOR_INCASARI';
  const [from, setFrom] = useState<string>(yesterdayChisinau);
  const [to, setTo] = useState<string>(yesterdayChisinau);
  const [subTab, setSubTab] = useState<SubTab>('routes');

  const [routes, setRoutes] = useState<GraficRouteRow[]>([]);
  const [orphanNum, setOrphanNum] = useState<OrphanNumerar[]>([]);
  const [orphanInc, setOrphanInc] = useState<Anomaly[]>([]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [assignTarget, setAssignTarget] = useState<Anomaly | null>(null);
  const [ignoreTarget, setIgnoreTarget] = useState<Anomaly | null>(null);

  const isSingleDay = from === to;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await getGraficReport(from, to);
      if (res.error) {
        setError(res.error);
        setRoutes([]); setOrphanNum([]); setOrphanInc([]); setConfirmation(null);
      } else if (res.data) {
        setRoutes(res.data.routes);
        setOrphanNum(res.data.orphan_numerar);
        setOrphanInc(res.data.orphan_incasare);
        setConfirmation(res.data.confirmation);
      }
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  async function handleAssign(driverId: string, note: string | null) {
    if (!assignTarget) return;
    const res = await assignOverride(assignTarget.receipt_nr, assignTarget.ziua, driverId, note);
    if (res.error) throw new Error(res.error);
    await load();
  }
  async function handleIgnore(note: string) {
    if (!ignoreTarget) return;
    const res = await ignoreOverride(ignoreTarget.receipt_nr, ignoreTarget.ziua, note);
    if (res.error) throw new Error(res.error);
    await load();
  }
  async function handleConfirmDay() {
    if (!isSingleDay) return;
    const res = await confirmDay(from, null);
    if (res.error) { setError(res.error); return; }
    await load();
  }
  async function handleUnconfirmDay() {
    if (!isSingleDay) return;
    if (!confirm('Sigur anulezi confirmarea zilei?')) return;
    const res = await unconfirmDay(from);
    if (res.error) { setError(res.error); return; }
    await load();
  }

  const totalAlerts = orphanNum.length + orphanInc.length;

  // Pentru confirmarea zilei și badge-ul de status: doar orphan-uri din ziua curentă
  // (orphan_incasare e listă globală, dar confirmarea e per-zi).
  const todayOrphanInc = isSingleDay
    ? orphanInc.filter(a => a.ziua === from)
    : [];

  return (
    <div>
      {/* Header + filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Încasare vs. Numărare</h2>
          <p className="text-muted" style={{ fontSize: 13, margin: '6px 0 0 0' }}>
            Toate rutele din /grafic, cu numărarea și încasarea atașate. Cele neasociate — în vederi separate.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="text-muted" style={{ fontSize: 13 }}>De la</span>
          <input type="date" value={from} onChange={e => { const v = e.target.value; setFrom(v); if (v > to) setTo(v); }} className="form-control" style={{ width: 150 }} />
          <span className="text-muted" style={{ fontSize: 13 }}>până la</span>
          <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="form-control" style={{ width: 150 }} />
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--danger-dim)', color: 'var(--danger)', padding: '10px 16px', borderRadius: 'var(--radius-xs)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Bara de status zi */}
      {isSingleDay && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {confirmation ? (
              <>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                  ✓ Confirmat de {confirmation.confirmed_by_name || '—'}
                </span>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  ({new Date(confirmation.confirmed_at).toLocaleString('ro-RO')})
                </span>
                {confirmation.has_new_payments_after && (
                  <span style={{ color: 'var(--warning)', fontSize: 12, fontWeight: 600 }}>
                    ⚠ Au apărut plăți noi după confirmare — re-revizuiește
                  </span>
                )}
              </>
            ) : todayOrphanInc.length > 0 ? (
              <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
                ⚠ {todayOrphanInc.length} încasare nepusă pe această zi
              </span>
            ) : (
              <span className="text-muted">Neconfirmat</span>
            )}
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: 8 }}>
              {confirmation ? (
                <button type="button" onClick={handleUnconfirmDay} className="btn btn-sm">Anulează confirmarea</button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmDay}
                  className="btn btn-primary btn-sm"
                  disabled={todayOrphanInc.length > 0}
                  title={todayOrphanInc.length > 0 ? `Rezolvă ${todayOrphanInc.length} alerte de încasare pe această zi mai întâi` : ''}
                >
                  Confirmă ziua
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sub-tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 4, borderBottom: '1px solid var(--border)', alignItems: 'flex-end' }}>
        <SubTabBtn active={subTab === 'routes'} onClick={() => setSubTab('routes')}
          label="Pe rute" badge={routes.length} badgeColor="var(--text-muted)" />
        <SubTabBtn active={subTab === 'orphan_num'} onClick={() => setSubTab('orphan_num')}
          label="Numerar nepus" badge={orphanNum.length}
          badgeColor={orphanNum.length > 0 ? 'var(--warning)' : 'var(--text-muted)'} />
        <SubTabBtn active={subTab === 'orphan_inc'} onClick={() => setSubTab('orphan_inc')}
          label="Încasare nepusă" badge={orphanInc.length}
          badgeColor={orphanInc.length > 0 ? 'var(--danger)' : 'var(--text-muted)'} />
        <span className="text-muted" style={{ fontSize: 11, marginLeft: 'auto', paddingBottom: 8 }}>
          {subTab === 'routes'
            ? 'filtru pe perioadă'
            : 'toate elementele nerezolvate (oricare dată)'}
        </span>
      </div>

      {/* Content */}
      {loading && (
        <p className="text-muted" style={{ textAlign: 'center', padding: 20, fontSize: 13 }}>
          Se încarcă...
        </p>
      )}

      {!loading && subTab === 'routes' && (
        <RoutesTable routes={routes} />
      )}

      {!loading && subTab === 'orphan_num' && (
        <OrphanNumerarTable rows={orphanNum} />
      )}

      {!loading && subTab === 'orphan_inc' && (
        <div>
          {orphanInc.length === 0 ? (
            <div className="card" style={{ padding: 20, textAlign: 'center', fontSize: 13 }}>
              <p className="text-muted" style={{ margin: 0 }}>
                ✓ Nu există încasări neasociate. Toate plățile de la casă au foaie atribuită în /grafic.
              </p>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <span><strong style={{ color: 'var(--danger)' }}>LIPSĂ /GRAFIC</strong> — foaia n-a fost atribuită niciunui șofer pe ziua respectivă</span>
                <span><strong style={{ color: 'var(--warning)' }}>DUPLICAT</strong> — aceeași foaie e la mai multe persoane/zile</span>
                <span><strong style={{ color: '#9b27b0' }}>FORMAT</strong> — număr tastat greșit la casă</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <span><code>Inc</code>=numerar depus</span>
                <span><code>Lg</code>=lgotnici</span>
                <span><code>Dg</code>=diagrame+card</span>
                <span><code>Vk</code>=lgotnici vokzal</span>
                <span><code>DT</code>=alimentare șofer</span>
                <span><code>Rs</code>=alte cheltuieli</span>
              </div>
              <AnomalyHeader canEdit={canEdit} />
              {orphanInc.map(a => (
                <AnomalyCard
                  key={`${a.receipt_nr}-${a.ziua}`}
                  anomaly={a}
                  canEdit={canEdit}
                  onAssignClick={() => setAssignTarget(a)}
                  onIgnoreClick={() => setIgnoreTarget(a)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Modaluri */}
      {assignTarget && (
        <AssignDriverModal
          open={true}
          receiptNr={assignTarget.receipt_nr}
          ziua={assignTarget.ziua}
          candidates={assignTarget.duplicate_candidates}
          onConfirm={handleAssign}
          onClose={() => setAssignTarget(null)}
        />
      )}
      {ignoreTarget && (
        <IgnoreModal
          open={true}
          receiptNr={ignoreTarget.receipt_nr}
          ziua={ignoreTarget.ziua}
          onConfirm={handleIgnore}
          onClose={() => setIgnoreTarget(null)}
        />
      )}
    </div>
  );
}

function SubTabBtn({
  active, onClick, label, badge, badgeColor,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge: number;
  badgeColor: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        padding: '8px 14px',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--text)' : 'var(--text-muted)',
        borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
        marginBottom: -1,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {label}
      <span style={{
        fontSize: 11,
        padding: '1px 7px',
        borderRadius: 10,
        background: badgeColor,
        color: 'white',
        fontWeight: 600,
        minWidth: 18,
        textAlign: 'center',
      }}>{badge}</span>
    </button>
  );
}
