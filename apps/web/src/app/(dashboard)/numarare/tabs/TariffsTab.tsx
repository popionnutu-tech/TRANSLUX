'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getTariffData,
  toggleDualTariff,
  updateShortDistanceThreshold,
  type TariffData,
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadData = useCallback(async () => {
    const result = await getTariffData();
    setData(result);
    setThresholdInput(String(result.shortDistanceKm));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

      {/* Карточка 3: История тарифов */}
      <HistoryTable history={data.history} />
    </div>
  );
}
