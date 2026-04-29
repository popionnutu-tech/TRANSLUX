'use client';

import { useMemo, useState, useTransition } from 'react';
import { submitRouteCheck, type RouteDetail, type StopRow } from '../actions';

type Direction = 'tur' | 'retur';
type StopState = { status: 'pending' | 'confirmed' | 'edited'; newTime?: string };
type DirState = Record<number, StopState>;

const TIME_RE = /^\d{1,2}:\d{2}$/;

function normalize(t: string): string {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t.trim();
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function StopList({
  title,
  hint,
  stops,
  field,
  state,
  setState,
}: {
  title: string;
  hint: string;
  stops: StopRow[];
  field: 'hour_from_nord' | 'hour_from_chisinau';
  state: DirState;
  setState: (next: DirState) => void;
}) {
  const onConfirm = (id: number) => setState({ ...state, [id]: { status: 'confirmed' } });
  const onStartEdit = (id: number, current: string) =>
    setState({ ...state, [id]: { status: 'edited', newTime: current } });
  const onTimeChange = (id: number, value: string) =>
    setState({ ...state, [id]: { status: 'edited', newTime: value } });
  const onCancelEdit = (id: number) => {
    const next = { ...state };
    delete next[id];
    setState(next);
  };

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#9B1B30', margin: '0 0 4px' }}>{title}</h2>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>{hint}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
        {stops.map((s) => {
          const current = ((s as any)[field] as string | null) || '';
          const st = state[s.id];
          const editing = st?.status === 'edited';
          const confirmed = st?.status === 'confirmed';
          return (
            <li
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                background: confirmed ? '#eef9ee' : editing ? '#fff7e6' : '#fff',
                border: `1px solid ${confirmed ? '#c5e6c8' : editing ? '#ffd9a3' : '#eee'}`,
                borderRadius: 10,
              }}
            >
              <span style={{ flex: 1, fontSize: 14, color: '#222' }}>{s.name_ro}</span>
              <span style={{ fontSize: 13, color: '#555', minWidth: 50, textAlign: 'right' }}>
                {current || '—'}
              </span>
              {editing ? (
                <>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:MM"
                    value={st.newTime || ''}
                    onChange={(e) => onTimeChange(s.id, e.target.value)}
                    style={{ width: 70, padding: '6px 8px', border: '1px solid #d4d4d4', borderRadius: 6, fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={() => onCancelEdit(s.id)}
                    style={{ background: 'transparent', border: 'none', color: '#9B1B30', fontSize: 12, cursor: 'pointer' }}
                  >
                    anulează
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onConfirm(s.id)}
                    disabled={confirmed}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid',
                      borderColor: confirmed ? '#1f7a3a' : '#c8c8c8',
                      background: confirmed ? '#1f7a3a' : '#fff',
                      color: confirmed ? '#fff' : '#333',
                      fontSize: 12,
                      cursor: confirmed ? 'default' : 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {confirmed ? 'corect ✓' : 'corect'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartEdit(s.id, current)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #c8c8c8',
                      background: '#fff',
                      color: '#333',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    schimb
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function CheckClient({ detail }: { detail: RouteDetail }) {
  const [tur, setTur] = useState<DirState>({});
  const [retur, setRetur] = useState<DirState>({});
  const [returAnswer, setReturAnswer] = useState<null | 'same' | 'check'>(null);

  // Sursa de retur aleasă de operator. Inițial = sursa efectivă curentă.
  // null = „fără retur" (slot-ul rutei A va fi fără cursă de retur).
  const [returSourceId, setReturSourceId] = useState<number | null>(detail.effective_retur_route_id);
  const [returChangeProposed, setReturChangeProposed] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentReturStops = useMemo<StopRow[]>(() => {
    if (returSourceId == null) return [];
    return detail.retur_stops_by_route[returSourceId] || [];
  }, [returSourceId, detail.retur_stops_by_route]);

  const turAllTouched = useMemo(
    () => detail.stops_tur.every((s) => tur[s.id]),
    [detail.stops_tur, tur],
  );
  const returAllTouched = useMemo(
    () =>
      currentReturStops.length === 0 ||
      currentReturStops.every((s) => retur[s.id]),
    [currentReturStops, retur],
  );

  const canSubmit =
    turAllTouched &&
    (returAnswer === 'same' || (returAnswer === 'check' && returAllTouched));

  const onPickReturSource = (newId: number | null) => {
    setReturSourceId(newId);
    setRetur({}); // resetăm verificarea retur, e alt slot
    setReturChangeProposed(newId !== detail.effective_retur_route_id);
  };

  const onSubmit = () => {
    setError(null);
    const changes: Array<{ stop_id: number; direction: Direction; old_time: string | null; new_time: string }> = [];

    for (const s of detail.stops_tur) {
      const st = tur[s.id];
      if (st?.status === 'edited' && st.newTime) {
        const t = normalize(st.newTime);
        if (!TIME_RE.test(t)) {
          setError(`Format incorect la ${s.name_ro} (cursa 1). Folosiți HH:MM.`);
          return;
        }
        changes.push({ stop_id: s.id, direction: 'tur', old_time: s.hour_from_nord, new_time: t });
      }
    }
    if (returAnswer === 'check') {
      for (const s of currentReturStops) {
        const st = retur[s.id];
        if (st?.status === 'edited' && st.newTime) {
          const t = normalize(st.newTime);
          if (!TIME_RE.test(t)) {
            setError(`Format incorect la ${s.name_ro} (cursa 2). Folosiți HH:MM.`);
            return;
          }
          changes.push({ stop_id: s.id, direction: 'retur', old_time: s.hour_from_chisinau, new_time: t });
        }
      }
    }

    startTransition(async () => {
      try {
        await submitRouteCheck({
          route_id: detail.id,
          retur_same: returAnswer === 'same' && !returChangeProposed,
          changes,
          retur_change_proposed: returChangeProposed,
          proposed_retur_uses_route_id: returChangeProposed ? returSourceId : undefined,
        });
      } catch (e: any) {
        setError(e?.message || 'Eroare la trimitere.');
      }
    });
  };

  const currentSourceLabel = (() => {
    if (returSourceId == null) return 'fără retur';
    const opt = detail.retur_options.find((o) => o.source_route_id === returSourceId);
    return opt ? `${opt.source_route_name} · ${opt.time_chisinau || ''}` : `#${returSourceId}`;
  })();

  return (
    <div>
      <StopList
        title="Cursa 1: Nord → Chișinău"
        hint='Verificați ora la fiecare oprire. Apăsați „corect" sau „schimb" pentru a introduce ora reală.'
        stops={detail.stops_tur}
        field="hour_from_nord"
        state={tur}
        setState={setTur}
      />

      {turAllTouched && (
        <section style={{ margin: '8px 0 18px', padding: '14px 16px', background: '#fafafa', borderRadius: 10, border: '1px solid #eee' }}>
          <p style={{ margin: '0 0 10px', fontSize: 14, color: '#222' }}>
            Cursa de retur (Chișinău → {detail.dest_from_ro.split(' - ')[0]}) merge prin
            aceleași opriri la aceleași ore?
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setReturAnswer('same')}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid',
                borderColor: returAnswer === 'same' ? '#1f7a3a' : '#c8c8c8',
                background: returAnswer === 'same' ? '#1f7a3a' : '#fff',
                color: returAnswer === 'same' ? '#fff' : '#333',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Da, la fel
            </button>
            <button
              type="button"
              onClick={() => setReturAnswer('check')}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid',
                borderColor: returAnswer === 'check' ? '#9B1B30' : '#c8c8c8',
                background: returAnswer === 'check' ? '#9B1B30' : '#fff',
                color: returAnswer === 'check' ? '#fff' : '#333',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Nu, vreau să verific
            </button>
          </div>
        </section>
      )}

      {returAnswer === 'check' && (
        <section style={{ margin: '0 0 18px', padding: '14px 16px', background: '#fff', border: '1px solid #eee', borderRadius: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#222', margin: '0 0 4px' }}>
            Slot-ul de retur folosit
          </h3>
          <p style={{ fontSize: 12, color: '#666', margin: '0 0 10px' }}>
            Mașina face turul, apoi se întoarce pe slot-ul de retur ales aici. Dacă schimbați
            sursa, slot-ul vechi rămâne liber pentru altă rută. Confirmați după.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={returSourceId == null ? '__none' : String(returSourceId)}
              onChange={(e) => {
                const v = e.target.value;
                onPickReturSource(v === '__none' ? null : Number(v));
              }}
              style={{
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid #c8c8c8',
                borderRadius: 8,
                minWidth: 280,
              }}
            >
              {detail.retur_options.map((o) => (
                <option key={o.source_route_id} value={o.source_route_id}>
                  {o.source_route_name} · {o.time_chisinau || '—'}
                  {o.current_user_route_id && o.current_user_route_id !== o.source_route_id
                    ? ` (folosit de ${o.current_user_route_name})`
                    : o.current_user_route_id == null
                    ? ' (liber)'
                    : ''}
                </option>
              ))}
              <option value="__none">— fără retur —</option>
            </select>
            {returChangeProposed && (
              <span style={{ fontSize: 12, color: '#9B1B30', fontWeight: 600 }}>
                schimbare propusă
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#444', marginTop: 8 }}>
            Selectat: <strong>{currentSourceLabel}</strong>
          </div>
        </section>
      )}

      {returAnswer === 'check' && currentReturStops.length > 0 && (
        <StopList
          title="Cursa 2: Chișinău → Nord"
          hint="Verificați și pentru cursa de retur."
          stops={currentReturStops}
          field="hour_from_chisinau"
          state={retur}
          setState={setRetur}
        />
      )}
      {returAnswer === 'check' && currentReturStops.length === 0 && (
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 18px' }}>
          Slot-ul ales nu are opriri de verificat (sau a fost marcat „fără retur").
        </p>
      )}

      {error && <div style={{ color: '#9B1B30', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit || isPending}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: 10,
          border: 'none',
          background: canSubmit && !isPending ? '#9B1B30' : '#c8a5ad',
          color: '#fff',
          fontSize: 15,
          fontWeight: 700,
          cursor: canSubmit && !isPending ? 'pointer' : 'not-allowed',
        }}
      >
        {isPending ? 'Se trimite…' : 'Trimite spre aprobare'}
      </button>
    </div>
  );
}
