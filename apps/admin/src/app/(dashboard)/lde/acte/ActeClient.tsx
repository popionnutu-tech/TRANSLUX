'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Send, Trash2, AlertTriangle } from 'lucide-react';
import {
  LDE_BILLING_MODEL_LABELS,
  LDE_RECEPTIE_STATUS_LABELS,
  type LdeBillingModel,
} from '@translux/db';
import {
  setBilling,
  generateAct,
  markActSent,
  deleteAct,
  type BillingView,
  type ActeRow,
} from './actions';

const MODELS = Object.keys(LDE_BILLING_MODEL_LABELS) as LdeBillingModel[];

function lei(n: number): string {
  return Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' lei';
}

function weekLabel(from: string, to: string): string {
  const f = new Date(from + 'T00:00:00Z');
  const t = new Date(to + 'T00:00:00Z');
  const fmt = (d: Date) => d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  return `${fmt(f)} – ${fmt(t)}`;
}

// Luni a săptămânii curente (ISO: ziua 1 = luni)
function currentMonday(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dow = d.getUTCDay(); // 0=Du .. 6=Sâ
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default function ActeClient({
  initialBilling,
  initialActe,
}: {
  initialBilling: BillingView;
  initialActe: ActeRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Tarif curent per uzină (map din billing)
  const billingMap = new Map(initialBilling.billing.map((b) => [b.uzina_id, b]));

  // Generare
  const [genUzina, setGenUzina] = useState(initialBilling.uzine[0]?.id ?? '');
  const [genWeek, setGenWeek] = useState(currentMonday());

  function run(fn: () => Promise<void>) {
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

  function handleGenerate() {
    setError(null);
    setNotice(null);
    if (!genUzina) {
      setError('Selectați o uzină.');
      return;
    }
    startTransition(async () => {
      try {
        const res = await generateAct(genUzina, genWeek);
        if (!res.has_gps) {
          setNotice(
            'Act generat, dar fără date GPS pe această săptămână — km = 0. Verificați importul GPS sau atribuirea autobuzelor la curse.',
          );
        } else {
          setNotice(`Act generat: ${res.total_curse} curse · ${res.total_passengers} pasageri · ${res.total_km} km · ${lei(res.total_value_lei)}.`);
        }
        router.refresh();
      } catch (e: any) {
        setError(e.message || 'Eroare la generare');
      }
    });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Acte de recepție UZINE</h1>
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 12 }}>{error}</p>}
      {notice && <p style={{ color: 'var(--primary)', fontSize: 14, marginBottom: 12 }}>{notice}</p>}

      {/* ── TARIFE UZINE ── */}
      <div className="card mb-4">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Tarife uzine</h2>
        <table>
          <thead>
            <tr>
              <th>Uzină</th>
              <th>Model de facturare</th>
              <th>Tarif (lei)</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {initialBilling.uzine.length === 0 && (
              <tr><td colSpan={4} className="text-center text-muted">Nu există uzine.</td></tr>
            )}
            {initialBilling.uzine.map((u) => (
              <BillingRow
                key={u.id}
                uzina={u}
                current={billingMap.get(u.id) ?? null}
                pending={pending}
                onSave={(model, rate) => run(() => setBilling(u.id, model, rate))}
              />
            ))}
          </tbody>
        </table>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
          Tariful e interpretat după model: lei/cursă, lei/pasager, lei/km sau lei/săptămână (fix).
        </p>
      </div>

      {/* ── GENERARE ACT ── */}
      <div className="card mb-4">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Generează act săptămânal</h2>
        <div className="flex gap-2" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Uzină</label>
            <select value={genUzina} onChange={(e) => setGenUzina(e.target.value)}>
              {initialBilling.uzine.map((u) => (
                <option key={u.id} value={u.id}>{u.display_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Început săptămână (luni)</label>
            <input type="date" value={genWeek} onChange={(e) => setGenWeek(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={pending || !genUzina} onClick={handleGenerate}>
            <Calendar size={16} style={{ marginRight: 6 }} />
            {pending ? 'Se generează…' : 'Generează'}
          </button>
        </div>
      </div>

      {/* ── ACTE GENERATE ── */}
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Acte săptămânale</h2>
        <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
          <AlertTriangle size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
          Atenție: <strong>Curse</strong> și <strong>Pasageri</strong> reflectă configurația curentă a uzinei
          (capacitatea contractată), nu numărătoarea reală a săptămânii. Doar <strong>Km</strong> sunt
          calculați din GPS-ul săptămânii selectate.
        </p>
        <table>
          <thead>
            <tr>
              <th>Uzină</th>
              <th>Săptămână</th>
              <th>Km</th>
              <th>Curse</th>
              <th>Pasageri</th>
              <th>Model</th>
              <th>Valoare</th>
              <th>Status</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {initialActe.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted">Niciun act generat încă.</td></tr>
            )}
            {initialActe.map((a) => (
              <tr key={a.id}>
                <td style={{ fontWeight: 600 }}>{a.uzina_name}</td>
                <td>{weekLabel(a.week_from, a.week_to)}</td>
                <td>
                  {Number(a.total_km) === 0 ? (
                    <span style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={13} /> 0
                    </span>
                  ) : (
                    a.total_km
                  )}
                </td>
                <td>{a.total_curse}</td>
                <td>{a.total_passengers}</td>
                <td className="text-muted" style={{ fontSize: 12 }}>
                  {a.billing_model ? LDE_BILLING_MODEL_LABELS[a.billing_model] : '—'}
                </td>
                <td style={{ fontWeight: 600 }}>{lei(a.total_value_lei)}</td>
                <td>
                  <span className={`badge ${a.status === 'trimis' ? 'badge-ok' : 'badge-absent'}`}>
                    {LDE_RECEPTIE_STATUS_LABELS[a.status]}
                  </span>
                </td>
                <td>
                  <div className="flex gap-2">
                    {a.status === 'draft' && (
                      <button className="btn btn-primary" disabled={pending} onClick={() => run(() => markActSent(a.id))}>
                        <Send size={14} style={{ marginRight: 4 }} />Trimis
                      </button>
                    )}
                    <button
                      className="btn btn-danger"
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Sigur ștergeți actul ${a.uzina_name} (${weekLabel(a.week_from, a.week_to)})?`)) {
                          run(() => deleteAct(a.id));
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BillingRow({
  uzina,
  current,
  pending,
  onSave,
}: {
  uzina: { id: string; display_name: string };
  current: { billing_model: LdeBillingModel; rate_lei: number } | null;
  pending: boolean;
  onSave: (model: LdeBillingModel, rate: number) => void;
}) {
  const [model, setModel] = useState<LdeBillingModel>(current?.billing_model ?? 'per_cursa');
  const [rate, setRate] = useState<string>(current != null ? String(current.rate_lei) : '');

  const dirty = !current || current.billing_model !== model || Number(current.rate_lei) !== Number(rate);

  return (
    <tr style={{ opacity: current ? 1 : 0.7 }}>
      <td style={{ fontWeight: 600 }}>{uzina.display_name}</td>
      <td>
        <select value={model} onChange={(e) => setModel(e.target.value as LdeBillingModel)} style={{ fontSize: 13, padding: '2px 6px' }}>
          {MODELS.map((m) => (
            <option key={m} value={m}>{LDE_BILLING_MODEL_LABELS[m]}</option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="number"
          min={0}
          step="0.01"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="0.00"
          style={{ width: 110, fontSize: 13, padding: '2px 6px' }}
        />
      </td>
      <td>
        <button
          className="btn btn-primary"
          disabled={pending || !dirty || rate === '' || Number(rate) < 0}
          style={{ fontSize: 12 }}
          onClick={() => onSave(model, Number(rate))}
        >
          {current ? 'Salvează' : 'Setează'}
        </button>
      </td>
    </tr>
  );
}
