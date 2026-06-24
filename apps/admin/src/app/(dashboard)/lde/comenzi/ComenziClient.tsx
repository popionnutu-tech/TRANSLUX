'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Calendar, GraduationCap, ClipboardList } from 'lucide-react';
import {
  LDE_EXTRA_ORDER_TYPE_LABELS,
  type LdeExtraOrderType,
  type LdeSchoolPeriod,
} from '@translux/db';
import {
  getExtraOrders,
  createExtraOrder,
  deleteExtraOrder,
  setSchoolPeriod,
  type ExtraOrderRow,
  type DriverOption,
} from './actions';

function lei(n: number): string {
  return Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' lei';
}

function monthLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z');
  return d.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const ORDER_TYPES = Object.entries(LDE_EXTRA_ORDER_TYPE_LABELS) as [LdeExtraOrderType, string][];

export default function ComenziClient({
  initialMonth,
  initialOrders,
  drivers,
  initialSchoolPeriods,
}: {
  initialMonth: string;
  initialOrders: ExtraOrderRow[];
  drivers: DriverOption[];
  initialSchoolPeriods: LdeSchoolPeriod[];
}) {
  const [tab, setTab] = useState<'comenzi' | 'scolare'>('comenzi');

  return (
    <div className="page">
      <div className="page-header">
        <h1>Comenzi suplimentare & perioade școlare</h1>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          className={`btn ${tab === 'comenzi' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setTab('comenzi')}
        >
          <ClipboardList size={16} style={{ marginRight: 6 }} />
          Comenzi suplimentare
        </button>
        <button
          className={`btn ${tab === 'scolare' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setTab('scolare')}
        >
          <GraduationCap size={16} style={{ marginRight: 6 }} />
          Perioade școlare
        </button>
      </div>

      {tab === 'comenzi' ? (
        <ComenziSection initialMonth={initialMonth} initialOrders={initialOrders} drivers={drivers} />
      ) : (
        <ScolareSection initialPeriods={initialSchoolPeriods} />
      )}
    </div>
  );
}

// ── Secțiune Comenzi suplimentare ──
function ComenziSection({
  initialMonth,
  initialOrders,
  drivers,
}: {
  initialMonth: string;
  initialOrders: ExtraOrderRow[];
  drivers: DriverOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(initialMonth);
  const [orders, setOrders] = useState<ExtraOrderRow[]>(initialOrders);

  // Form
  const [driverId, setDriverId] = useState('');
  const [workDate, setWorkDate] = useState(initialMonth + '-01');
  const [orderType, setOrderType] = useState<LdeExtraOrderType>('chisinau_admin');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  async function reload(m: string) {
    const rows = await getExtraOrders(m);
    setOrders(rows);
  }

  function handleMonthChange(m: string) {
    setMonth(m);
    setError(null);
    startTransition(async () => {
      try {
        await reload(m);
      } catch (e: any) {
        setError(e.message || 'Eroare la încărcare');
      }
    });
  }

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      try {
        await createExtraOrder({
          driver_id: driverId,
          work_date: workDate,
          order_type: orderType,
          amount_lei: Number(amount),
          notes,
        });
        setDriverId('');
        setAmount('');
        setNotes('');
        await reload(month);
        router.refresh();
      } catch (e: any) {
        setError(e.message || 'Eroare la adăugare');
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm('Sigur ștergeți această comandă?')) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteExtraOrder(id);
        await reload(month);
        router.refresh();
      } catch (e: any) {
        setError(e.message || 'Eroare la ștergere');
      }
    });
  }

  const total = orders.reduce((s, o) => s + Number(o.amount_lei), 0);

  return (
    <>
      {error && <p style={{ color: 'var(--warning)', fontSize: 14, marginBottom: 12 }}>{error}</p>}

      {/* Form adăugare */}
      <div className="card mb-4">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Adaugă comandă suplimentară</h3>
        <div className="flex gap-2" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Șofer</label>
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">— Selectează —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Data</label>
            <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Tip</label>
            <select value={orderType} onChange={(e) => setOrderType(e.target.value as LdeExtraOrderType)}>
              {ORDER_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, maxWidth: 120 }}>
            <label>Sumă (lei)</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>Note</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="opțional" />
          </div>
          <button className="btn btn-primary" disabled={pending} onClick={handleAdd}>
            <Plus size={16} style={{ marginRight: 4 }} />
            {pending ? 'Se salvează…' : 'Adaugă'}
          </button>
        </div>
      </div>

      {/* Selector lună + tabel */}
      <div className="card">
        <div className="flex gap-2 mb-4" style={{ alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label><Calendar size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Lună</label>
            <input type="month" value={month} onChange={(e) => handleMonthChange(e.target.value)} />
          </div>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Total lună: <strong style={{ color: 'var(--primary)' }}>{lei(total)}</strong>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Șofer</th>
              <th>Data</th>
              <th>Tip</th>
              <th>Sumă</th>
              <th>Note</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted">Nicio comandă pentru luna selectată.</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.driver_name}</td>
                <td>{new Date(o.work_date + 'T00:00:00Z').toLocaleDateString('ro-RO', { timeZone: 'UTC' })}</td>
                <td>{LDE_EXTRA_ORDER_TYPE_LABELS[o.order_type]}</td>
                <td style={{ fontWeight: 600 }}>{lei(o.amount_lei)}</td>
                <td className="text-muted" style={{ fontSize: 12 }}>{o.notes || '—'}</td>
                <td>
                  <button className="btn btn-danger" disabled={pending} onClick={() => handleDelete(o.id)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Secțiune Perioade școlare ──
function ScolareSection({ initialPeriods }: { initialPeriods: LdeSchoolPeriod[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [periods, setPeriods] = useState<LdeSchoolPeriod[]>(initialPeriods);

  // Form lună nouă
  const now = new Date();
  const [newMonth, setNewMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [newRate, setNewRate] = useState('100');

  function save(period_month: string, is_active: boolean, rate: number) {
    setError(null);
    startTransition(async () => {
      try {
        await setSchoolPeriod(period_month, is_active, rate);
        // Reflectă local (upsert)
        setPeriods((prev) => {
          const monthStart = period_month.length === 7 ? period_month + '-01' : period_month;
          const exists = prev.find((p) => p.period_month === monthStart);
          if (exists) {
            return prev.map((p) =>
              p.period_month === monthStart ? { ...p, is_active, rate_per_day_lei: rate } : p,
            );
          }
          return [
            { period_month: monthStart, is_active, rate_per_day_lei: rate, set_by_admin_id: null, set_at: new Date().toISOString(), notes: null },
            ...prev,
          ].sort((a, b) => (a.period_month < b.period_month ? 1 : -1));
        });
        router.refresh();
      } catch (e: any) {
        setError(e.message || 'Eroare la salvare');
      }
    });
  }

  return (
    <>
      {error && <p style={{ color: 'var(--warning)', fontSize: 14, marginBottom: 12 }}>{error}</p>}

      {/* Form adăugare lună */}
      <div className="card mb-4">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Adaugă lună școlară</h3>
        <div className="flex gap-2" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Lună</label>
            <input type="month" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, maxWidth: 140 }}>
            <label>Rata/zi (lei)</label>
            <input type="number" min="0" step="0.01" value={newRate} onChange={(e) => setNewRate(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={pending} onClick={() => save(newMonth, true, Number(newRate))}>
            <Plus size={16} style={{ marginRight: 4 }} />
            {pending ? 'Se salvează…' : 'Adaugă activă'}
          </button>
        </div>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
          Default 100 lei/zi (50+50). Anul școlar se fixează manual, lună cu lună.
        </p>
      </div>

      {/* Listă luni */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Lună</th>
              <th>Activă</th>
              <th>Rata/zi</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {periods.length === 0 && (
              <tr><td colSpan={4} className="text-center text-muted">Nicio perioadă școlară definită.</td></tr>
            )}
            {periods.map((p) => (
              <SchoolRow key={p.period_month} period={p} pending={pending} onSave={save} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SchoolRow({
  period,
  pending,
  onSave,
}: {
  period: LdeSchoolPeriod;
  pending: boolean;
  onSave: (period_month: string, is_active: boolean, rate: number) => void;
}) {
  const [rate, setRate] = useState(String(period.rate_per_day_lei));
  const dirty = Number(rate) !== Number(period.rate_per_day_lei);

  return (
    <tr>
      <td style={{ textTransform: 'capitalize' }}>{monthLabel(period.period_month)}</td>
      <td>
        <label className="flex gap-2" style={{ alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={period.is_active}
            disabled={pending}
            onChange={(e) => onSave(period.period_month, e.target.checked, Number(rate))}
          />
          <span className={`badge ${period.is_active ? 'badge-ok' : 'badge-absent'}`}>
            {period.is_active ? 'Activă' : 'Inactivă'}
          </span>
        </label>
      </td>
      <td>
        <input
          type="number"
          min="0"
          step="0.01"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          style={{ maxWidth: 110 }}
        />
      </td>
      <td>
        <button
          className="btn btn-outline"
          disabled={pending || !dirty}
          onClick={() => onSave(period.period_month, period.is_active, Number(rate))}
        >
          Salvează rata
        </button>
      </td>
    </tr>
  );
}
