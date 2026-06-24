'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, FileText, CheckCircle, Wallet, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  LDE_SALARY_RUN_STATUS_LABELS,
  LDE_SALARY_CATEGORY_LABELS,
  type LdeSalaryRun,
} from '@translux/db';
import {
  generateSalaryRun,
  getSalaryRunDetail,
  approveSalaryRun,
  markSalaryRunPaid,
  deleteSalaryRun,
  type SalaryRunDetail,
} from './actions';

function lei(n: number): string {
  return Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' lei';
}

function monthLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z');
  return d.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function SalariiClient({ initialRuns }: { initialRuns: LdeSalaryRun[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [detail, setDetail] = useState<SalaryRunDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Lună implicită = luna trecută (salariile se fac pe luna încheiată)
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [genMonth, setGenMonth] = useState(
    `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`,
  );

  async function handleGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await generateSalaryRun(genMonth + '-01');
        if (res.warnings.length) {
          setError(`Generat pentru ${res.drivers} șoferi. Avertismente: ${res.warnings.join(' · ')}`);
        }
        router.refresh();
      } catch (e: any) {
        setError(e.message || 'Eroare la generare');
      }
    });
  }

  async function toggleDetail(runId: string) {
    if (expandedRun === runId) {
      setExpandedRun(null);
      setDetail(null);
      return;
    }
    setExpandedRun(runId);
    setLoadingDetail(true);
    try {
      const d = await getSalaryRunDetail(runId);
      setDetail(d);
    } finally {
      setLoadingDetail(false);
    }
  }

  function runAction(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
        if (expandedRun) {
          const d = await getSalaryRunDetail(expandedRun);
          setDetail(d);
        }
      } catch (e: any) {
        setError(e.message || 'Eroare');
      }
    });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Salarii UZINE</h1>
      </div>

      {error && <p style={{ color: 'var(--warning)', fontSize: 14, marginBottom: 12 }}>{error}</p>}

      {/* Generare lună nouă */}
      <div className="card mb-4">
        <div className="flex gap-2" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Lună (categorii 1-5, șoferi uzine)</label>
            <input type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={pending} onClick={handleGenerate}>
            <Calendar size={16} style={{ marginRight: 6 }} />
            {pending ? 'Se generează…' : 'Generează raport'}
          </button>
        </div>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
          Categoriile 6-7 (suburban + interurban) se calculează în modulul GO.
        </p>
      </div>

      {/* Listă runs */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Lună</th>
              <th>Status</th>
              <th>Generat</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {initialRuns.length === 0 && (
              <tr><td colSpan={5} className="text-center text-muted">Niciun raport de salarii încă.</td></tr>
            )}
            {initialRuns.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                expanded={expandedRun === run.id}
                detail={expandedRun === run.id ? detail : null}
                loadingDetail={expandedRun === run.id && loadingDetail}
                pending={pending}
                onToggle={() => toggleDetail(run.id)}
                onApprove={() => runAction(() => approveSalaryRun(run.id))}
                onMarkPaid={() => runAction(() => markSalaryRunPaid(run.id))}
                onDelete={() => {
                  if (confirm(`Sigur ștergeți raportul draft pentru ${monthLabel(run.period_month)}?`)) {
                    runAction(() => deleteSalaryRun(run.id));
                  }
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RunRow({
  run, expanded, detail, loadingDetail, pending,
  onToggle, onApprove, onMarkPaid, onDelete,
}: {
  run: LdeSalaryRun;
  expanded: boolean;
  detail: SalaryRunDetail | null;
  loadingDetail: boolean;
  pending: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onMarkPaid: () => void;
  onDelete: () => void;
}) {
  const statusBadge = run.status === 'paid' ? 'badge-ok' : run.status === 'approved' ? 'badge-ok' : 'badge-absent';
  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={onToggle}>
        <td>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
        <td style={{ textTransform: 'capitalize' }}>{monthLabel(run.period_month)}</td>
        <td><span className={`badge ${statusBadge}`}>{LDE_SALARY_RUN_STATUS_LABELS[run.status]}</span></td>
        <td className="text-muted" style={{ fontSize: 12 }}>{new Date(run.generated_at).toLocaleDateString('ro-RO')}</td>
        <td onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-2">
            {run.status === 'draft' && (
              <>
                <button className="btn btn-primary" disabled={pending} onClick={onApprove}>
                  <CheckCircle size={14} style={{ marginRight: 4 }} />Aprobă
                </button>
                <button className="btn btn-danger" disabled={pending} onClick={onDelete}>
                  <Trash2 size={14} />
                </button>
              </>
            )}
            {run.status === 'approved' && (
              <button className="btn btn-primary" disabled={pending} onClick={onMarkPaid}>
                <Wallet size={14} style={{ marginRight: 4 }} />Marchează plătit
              </button>
            )}
            {run.status === 'paid' && <span className="text-muted" style={{ fontSize: 12 }}><FileText size={14} /> Finalizat</span>}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} style={{ background: 'var(--bg-elevated)', padding: 16 }}>
            {loadingDetail && <p className="text-muted">Se încarcă…</p>}
            {detail && !loadingDetail && <RunDetail detail={detail} />}
          </td>
        </tr>
      )}
    </>
  );
}

function RunDetail({ detail }: { detail: SalaryRunDetail }) {
  // Grupare pe uzină
  const byUzina = new Map<string, typeof detail.rows>();
  for (const r of detail.rows) {
    const arr = byUzina.get(r.uzina_name) || [];
    arr.push(r);
    byUzina.set(r.uzina_name, arr);
  }

  return (
    <div>
      {/* Stat cards */}
      <div className="flex gap-2" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 140 }}>
          <div className="text-muted" style={{ fontSize: 12 }}>Total brut</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>{lei(detail.totals.gross)}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140 }}>
          <div className="text-muted" style={{ fontSize: 12 }}>Reținări</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>{lei(detail.totals.deductions)}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140 }}>
          <div className="text-muted" style={{ fontSize: 12 }}>Total net</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--success)' }}>{lei(detail.totals.net)}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140 }}>
          <div className="text-muted" style={{ fontSize: 12 }}>Șoferi</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{detail.totals.drivers}</div>
        </div>
      </div>

      {[...byUzina.entries()].map(([uzina, rows]) => (
        <div key={uzina} style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>{uzina}</h3>
          <table>
            <thead>
              <tr>
                <th>Șofer</th>
                <th>Categorie</th>
                <th>Km</th>
                <th>Zile</th>
                <th>Bază</th>
                <th>Suplimente</th>
                <th>Reținări</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const supl = Number(r.km_surcharge_lei) + Number(r.weekend_double_lei) + Number(r.extra_orders_lei) + Number(r.school_lei) + Number(r.cash_orders_lei) + Number(r.spalare_lei);
                const ded = Number(r.deduction_pererashod_lei) + Number(r.deduction_damages_lei) + Number(r.deduction_other_lei);
                return (
                  <tr key={r.id}>
                    <td>{r.driver_name}</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{LDE_SALARY_CATEGORY_LABELS[r.salary_category]}</td>
                    <td>{r.km_total}</td>
                    <td>{r.work_days}{r.weekend_days > 0 ? ` (${r.weekend_days} WE)` : ''}</td>
                    <td>{lei(r.base_lei)}</td>
                    <td>{supl > 0 ? lei(supl) : '—'}</td>
                    <td style={{ color: ded > 0 ? 'var(--danger)' : undefined }}>{ded > 0 ? lei(ded) : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{lei(r.total_net_lei)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
