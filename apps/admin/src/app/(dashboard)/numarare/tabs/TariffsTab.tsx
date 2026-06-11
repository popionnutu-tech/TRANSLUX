'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getTariffData,
  toggleDualTariff,
  updateShortDistanceThreshold,
  triggerPriceUpdate,
  getPendingProposal,
  confirmTariffProposal,
  rejectTariffProposal,
  type TariffData,
  type TriggerPriceUpdateResult,
  type PendingProposal,
} from './tariffActions';

// ─── Форматирование ───

function formatRate(value: number): string {
  return value.toFixed(2) + ' lei/km';
}

function formatPeriod(start: string, end: string): string {
  const fmtShort = (d: string) => {
    const [, m, day] = d.split('-');
    return `${day}.${m}`;
  };
  const fmtFull = (d: string) => {
    const [y, m, day] = d.split('-');
    return `${day}.${m}.${y}`;
  };
  return `${fmtShort(start)} — ${fmtFull(end)}`;
}

// ─── Компонент карточки тарифной ставки ───

function RateCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      flex: '1 1 0',
      minWidth: 160,
      padding: '16px 20px',
      background: 'rgba(155,27,48,0.03)',
      borderRadius: 12,
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 22,
        fontWeight: 700,
        color: 'var(--primary)',
      }}>
        {value}
      </div>
    </div>
  );
}

// ─── Компонент карточки настроек ───

function SettingsCard({
  data,
  thresholdInput,
  saving,
  onToggleDual,
  onThresholdChange,
  onSaveThreshold,
}: {
  data: TariffData;
  thresholdInput: string;
  saving: boolean;
  onToggleDual: (enabled: boolean) => void;
  onThresholdChange: (value: string) => void;
  onSaveThreshold: () => void;
}) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 15,
        fontWeight: 600,
        color: 'var(--primary)',
        marginBottom: 20,
        fontStyle: 'italic',
      }}>
        Setari
      </div>

      {/* Переключатель двойного тарифа */}
      <div style={{ marginBottom: 20 }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          fontSize: 14,
          color: 'var(--text)',
        }}>
          <input
            type="checkbox"
            checked={data.dualTariffEnabled}
            onChange={(e) => onToggleDual(e.target.checked)}
            disabled={saving}
            style={{
              width: 18,
              height: 18,
              accentColor: 'var(--primary)',
              cursor: 'pointer',
            }}
          />
          <span style={{ fontWeight: 500 }}>Tarif dublu interurban</span>
        </label>

        <div style={{
          marginTop: 8,
          marginLeft: 30,
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}>
          {data.dualTariffEnabled
            ? `Se aplica tariful interurban scurt pentru distante ≤${data.shortDistanceKm}km si tariful interurban lung pentru distante mai mari`
            : 'Se aplica un singur tarif interurban lung pentru toate distantele'
          }
        </div>
      </div>

      {/* Порог короткой дистанции */}
      {data.dualTariffEnabled && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <label style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
          }}>
            Prag scurt distanta (km):
          </label>
          <input
            type="number"
            value={thresholdInput}
            onChange={(e) => onThresholdChange(e.target.value)}
            min={1}
            max={500}
            step={1}
            style={{
              width: 100,
              padding: '7px 12px',
              border: '1px solid rgba(155,27,48,0.1)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 14,
              fontFamily: 'var(--font-opensans, Open Sans, sans-serif)',
              fontStyle: 'italic',
              background: 'rgba(255,255,255,0.85)',
              color: '#6E0E14',
            }}
          />
          <button
            className="btn btn-primary"
            onClick={onSaveThreshold}
            disabled={saving}
            style={{ padding: '7px 16px', fontSize: 13 }}
          >
            {saving ? 'Se salveaza...' : 'Salveaza'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Компонент таблицы номенклатора ───

function NomenclatorTable({ nomenclator }: { nomenclator: TariffData['nomenclator'] }) {
  if (!nomenclator || !nomenclator.prices || nomenclator.prices.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--primary)',
          marginBottom: 16,
          fontStyle: 'italic',
        }}>
          Nomenclator preturi
        </div>
        <div className="text-muted" style={{ fontSize: 13, padding: '12px 0' }}>
          Nu exista date in nomenclator. Apasati &quot;Actualizeaza preturile&quot; pentru a genera.
        </div>
      </div>
    );
  }

  const updatedAt = new Date(nomenclator.created_at).toLocaleString('ro-MD', {
    timeZone: 'Europe/Chisinau',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
      }}>
        <div style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--primary)',
          fontStyle: 'italic',
        }}>
          Nomenclator preturi
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Actualizat: {updatedAt} | Tarif: {nomenclator.rate_per_km.toFixed(2)} lei/km
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Ruta</th>
              <th style={{ textAlign: 'right' }}>Pret (lei)</th>
            </tr>
          </thead>
          <tbody>
            {nomenclator.prices.map((p, i) => (
              <tr key={i}>
                <td>{p.from_ro} — {p.to_ro}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>
                  {p.price}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Компонент таблицы истории ───

function HistoryTable({ history }: { history: TariffData['history'] }) {
  if (history.length === 0) {
    return (
      <div className="card">
        <div style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--primary)',
          marginBottom: 16,
          fontStyle: 'italic',
        }}>
          Istoric tarife ANTA
        </div>
        <div className="text-muted" style={{ fontSize: 13, padding: '12px 0' }}>
          Nu exista inregistrari in istoricul tarifelor
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{
        fontSize: 15,
        fontWeight: 600,
        color: 'var(--primary)',
        marginBottom: 16,
        fontStyle: 'italic',
      }}>
        Istoric tarife ANTA
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Perioada</th>
              <th>Interurban lung</th>
              <th>Interurban scurt</th>
              <th>Suburban</th>
            </tr>
          </thead>
          <tbody>
            {history.map((period) => (
              <tr key={period.id}>
                <td style={{ fontWeight: 500 }}>
                  {formatPeriod(period.period_start, period.period_end)}
                </td>
                <td>{formatRate(period.rate_interurban_long)}</td>
                <td>{formatRate(period.rate_interurban_short)}</td>
                <td>{formatRate(period.rate_suburban)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Основной компонент ───

export default function TariffsTab() {
  const [data, setData] = useState<TariffData | null>(null);
  const [pending, setPending] = useState<PendingProposal | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decideMsg, setDecideMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<TriggerPriceUpdateResult | null>(null);
  const [thresholdInput, setThresholdInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadData = useCallback(async () => {
    const [result, prop] = await Promise.all([getTariffData(), getPendingProposal()]);
    setData(result);
    setPending(prop);
    setThresholdInput(String(result.shortDistanceKm));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTriggerUpdate = useCallback(async () => {
    setUpdating(true);
    setUpdateResult(null);
    setErrorMessage('');

    const result = await triggerPriceUpdate();
    setUpdateResult(result);

    if (!result.success) {
      setErrorMessage(result.message);
    } else {
      await loadData();
    }

    setUpdating(false);
  }, [loadData]);

  const handleConfirmProposal = useCallback(async () => {
    if (!pending) return;
    setDeciding(true);
    setDecideMsg('');
    const res = await confirmTariffProposal(pending.id);
    setDecideMsg(res.message);
    if (res.success) await loadData();
    setDeciding(false);
  }, [pending, loadData]);

  const handleRejectProposal = useCallback(async () => {
    if (!pending) return;
    setDeciding(true);
    setDecideMsg('');
    const res = await rejectTariffProposal(pending.id);
    setDecideMsg(res.message);
    if (res.success) await loadData();
    setDeciding(false);
  }, [pending, loadData]);

  const handleToggleDual = useCallback(async (enabled: boolean) => {
    if (!data) return;
    setSaving(true);
    setErrorMessage('');

    const result = await toggleDualTariff(enabled);
    if (result.error) {
      setErrorMessage(result.error);
    } else {
      await loadData();
    }

    setSaving(false);
  }, [data, loadData]);

  const handleSaveThreshold = useCallback(async () => {
    const km = parseFloat(thresholdInput);
    if (isNaN(km) || km <= 0) {
      setErrorMessage('Valoare invalida pentru prag');
      return;
    }

    setSaving(true);
    setErrorMessage('');

    const result = await updateShortDistanceThreshold(km);
    if (result.error) {
      setErrorMessage(result.error);
    } else {
      await loadData();
    }

    setSaving(false);
  }, [thresholdInput, loadData]);

  if (loading) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '40px 0',
        color: 'var(--text-muted)',
        fontSize: 14,
        fontStyle: 'italic',
      }}>
        Se incarca tarifele...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '40px 0',
        color: 'var(--danger)',
        fontSize: 14,
      }}>
        Eroare la incarcarea datelor
      </div>
    );
  }

  return (
    <div>
      {/* Сообщение об ошибке */}
      {errorMessage && (
        <div style={{
          padding: '10px 16px',
          marginBottom: 16,
          borderRadius: 'var(--radius-xs)',
          background: 'var(--danger-dim)',
          color: 'var(--danger)',
          fontSize: 13,
          fontWeight: 500,
        }}>
          {errorMessage}
        </div>
      )}

      {/* Propunere de tarif în așteptare (confirmare în panou) */}
      {pending && (
        <div className="card" style={{ marginBottom: 20, border: '1px solid rgba(34,139,34,0.35)', background: 'rgba(34,139,34,0.04)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--primary)', marginBottom: 4, fontStyle: 'italic' }}>
            🆕 Tarif nou ANTA — așteaptă confirmarea ta
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            {pending.source === 'manual' ? 'Verificare manuală' : 'Verificare automată'}
            {pending.effectiveDate ? ` · valabil din ${pending.effectiveDate.split('-').reverse().join('.')}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { label: 'Interurban lung', value: pending.rateInterurbanLong, prev: pending.prevInterurbanLong },
              { label: 'Interurban scurt', value: pending.rateInterurbanShort, prev: pending.prevInterurbanShort },
              { label: 'Suburban', value: pending.rateSuburban, prev: pending.prevSuburban },
            ].map((r) => (
              <div key={r.label} style={{ padding: '10px 14px', background: '#fff', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(0,0,0,0.06)', minWidth: 130 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{r.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>{r.value.toFixed(2)} lei/km</div>
                {r.prev !== null && r.prev !== r.value && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    anterior: <span style={{ textDecoration: 'line-through' }}>{r.prev.toFixed(2)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={handleConfirmProposal}
              disabled={deciding}
              style={{ padding: '8px 22px', fontSize: 13, background: '#228B22', color: '#fff', border: 'none', borderRadius: 'var(--radius-xs)', fontWeight: 600, cursor: deciding ? 'default' : 'pointer' }}
            >
              {deciding ? 'Se aplică...' : '✅ Confirmă'}
            </button>
            <button
              className="btn"
              onClick={handleRejectProposal}
              disabled={deciding}
              style={{ padding: '8px 22px', fontSize: 13, background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-xs)', fontWeight: 600, cursor: deciding ? 'default' : 'pointer' }}
            >
              ❌ Respinge
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Prețurile nu se schimbă nicăieri până nu confirmi.
            </span>
          </div>
          {decideMsg && (
            <div style={{ marginTop: 12, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{decideMsg}</div>
          )}
        </div>
      )}

      {/* Карточка 1: Текущие тарифы */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--primary)',
          marginBottom: 20,
          fontStyle: 'italic',
        }}>
          Tarife curente
        </div>
        <div style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <RateCard
            label={`Interurban lung (>${data.shortDistanceKm}km)`}
            value={formatRate(data.currentRates.interurbanLong)}
          />
          <RateCard
            label={`Interurban scurt (≤${data.shortDistanceKm}km)`}
            value={formatRate(data.currentRates.interurbanShort)}
          />
          <RateCard
            label="Suburban"
            value={formatRate(data.currentRates.suburban)}
          />
        </div>

        {/* Manual update */}
        <div style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: '1px solid rgba(155,27,48,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <button
            className="btn btn-primary"
            onClick={handleTriggerUpdate}
            disabled={updating || saving}
            style={{ padding: '8px 20px', fontSize: 13 }}
          >
            {updating ? 'Se actualizeaza...' : 'Actualizeaza preturile'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Preia tarifele actuale de pe anta.gov.md
          </span>
        </div>

        {updateResult && (
          <div style={{
            marginTop: 12,
            padding: '10px 16px',
            borderRadius: 'var(--radius-xs)',
            background: updateResult.success
              ? (updateResult.status === 'updated' ? 'rgba(34,139,34,0.08)' : 'rgba(155,27,48,0.04)')
              : 'var(--danger-dim)',
            color: updateResult.success
              ? (updateResult.status === 'updated' ? '#228B22' : 'var(--text-secondary)')
              : 'var(--danger)',
            fontSize: 13,
            fontWeight: 500,
          }}>
            {updateResult.message}
          </div>
        )}
      </div>

      {/* Карточка 2: Настройки */}
      <SettingsCard
        data={data}
        thresholdInput={thresholdInput}
        saving={saving}
        onToggleDual={handleToggleDual}
        onThresholdChange={setThresholdInput}
        onSaveThreshold={handleSaveThreshold}
      />

      {/* Карточка 3: Номенклатор */}
      <NomenclatorTable nomenclator={data.nomenclator} />

      {/* Карточка 4: История тарифов */}
      <HistoryTable history={data.history} />
    </div>
  );
}
