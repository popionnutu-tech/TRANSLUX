'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getIndications,
  generateIndications,
  dismissIndication,
  type IndicationRow,
  type IndicationType,
  type GenerateIndicationsResult,
} from './actions';

// ── Etichete + iconițe/culori RO (enum sincron cu CHECK din migrarea 205) ──
const TYPE_META: Record<IndicationType, { label: string; icon: string; color: string }> = {
  timp_de_alimentare: { label: 'Timp de alimentare', icon: '⛽', color: 'var(--primary)' },
  timp_strange: { label: 'Oră ciudată', icon: '🌙', color: 'var(--warning)' },
  loc_strange: { label: 'Loc ciudat', icon: '📍', color: 'var(--warning)' },
  nu_alimentat_de_mult: { label: 'Nealimentat de mult', icon: '🕒', color: 'var(--warning)' },
  numerar_des: { label: 'Numerar des', icon: '💵', color: 'var(--danger)' },
};
const TYPE_OPTIONS = Object.keys(TYPE_META) as IndicationType[];

export default function IndicatiiClient({ initialIndications }: { initialIndications: IndicationRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState<IndicationRow[]>(initialIndications);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [genMsg, setGenMsg] = useState<string | null>(null);

  // Lună implicită = luna trecută (indicațiile se generează pe luna încheiată).
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [genMonth, setGenMonth] = useState(
    `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`,
  );

  const [typeFilter, setTypeFilter] = useState<IndicationType | ''>('');
  const [activeOnly, setActiveOnly] = useState(true); // default ON

  const hasData = items.length > 0;

  async function refetch(nextType: IndicationType | '', nextActive: boolean) {
    const data = await getIndications({
      type: nextType || undefined,
      active_only: nextActive || undefined,
    });
    setItems(data);
  }

  function applyType(nextType: IndicationType | '') {
    setTypeFilter(nextType);
    startTransition(() => refetch(nextType, activeOnly));
  }
  function applyActive(nextActive: boolean) {
    setActiveOnly(nextActive);
    startTransition(() => refetch(typeFilter, nextActive));
  }

  function handleGenerate() {
    setError(null);
    setGenMsg(null);
    startTransition(async () => {
      try {
        const res: GenerateIndicationsResult = await generateIndications(genMonth + '-01');
        setGenMsg(
          `Generate: ${res.generated} ` +
            `(⛽ ${res.by_type.timp_de_alimentare} · 🌙 ${res.by_type.timp_strange} · ` +
            `📍 ${res.by_type.loc_strange} · 🕒 ${res.by_type.nu_alimentat_de_mult} · 💵 ${res.by_type.numerar_des}).`,
        );
        await refetch(typeFilter, activeOnly);
        router.refresh();
      } catch (e: any) {
        setError(e.message || 'Eroare la generarea indicațiilor');
      }
    });
  }

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>Indicații AI</h1>
      </div>

      {/* Generare */}
      <div className="card mb-4">
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>Luna</label>
            <input type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={pending}>
            {pending ? 'Se generează...' : 'Generează indicații'}
          </button>
        </div>
        {genMsg && <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>{genMsg}</p>}
        {error && <p style={{ color: 'var(--danger)', fontSize: 14, marginTop: 8 }}>{error}</p>}
      </div>

      {/* Banner: fără date */}
      {!hasData && (
        <div className="card mb-4" style={{ borderLeft: '4px solid var(--warning)' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Indicații vor apărea după conectarea GPS + Benzol și generare pe lună.
          </p>
        </div>
      )}

      {/* Filtre */}
      <div className="card mb-4 filter-bar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
          <label>Tip</label>
          <select value={typeFilter} onChange={(e) => applyType(e.target.value as IndicationType | '')}>
            <option value="">Toate</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {TYPE_META[t].icon} {TYPE_META[t].label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={activeOnly} onChange={(e) => applyActive(e.target.checked)} />
            Doar active
          </label>
        </div>
      </div>

      {/* Tabel */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Mașină</th>
              <th>Tip</th>
              <th>Mesaj</th>
              <th>Generat</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <IndicationRowItem key={it.id} item={it} onChanged={() => refetch(typeFilter, activeOnly)} disabled={pending} />
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted">
                  Nu există indicații.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IndicationRowItem({
  item,
  onChanged,
  disabled,
}: {
  item: IndicationRow;
  onChanged: () => Promise<void>;
  disabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const meta = TYPE_META[item.indication_type];
  const isDismissed = !!item.dismissed_at;

  async function handleDismiss() {
    setBusy(true);
    try {
      await dismissIndication(item.id);
      await onChanged();
      router.refresh();
    } catch (e: any) {
      window.alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr style={isDismissed ? { opacity: 0.5 } : undefined}>
      <td style={{ fontWeight: 600 }}>{item.vehicle_plate}</td>
      <td>
        <span className="badge" style={{ color: meta.color, borderColor: meta.color }}>
          {meta.icon} {meta.label}
        </span>
      </td>
      <td>{item.message_ro}</td>
      <td className="text-muted" style={{ fontSize: 12 }}>
        {new Date(item.generated_at).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}
      </td>
      <td>
        {isDismissed ? (
          <span className="text-muted" style={{ fontSize: 12 }}>
            Închisă
          </span>
        ) : (
          <button className="btn btn-outline" onClick={handleDismiss} disabled={busy || disabled}>
            {busy ? '...' : 'Închide'}
          </button>
        )}
      </td>
    </tr>
  );
}
