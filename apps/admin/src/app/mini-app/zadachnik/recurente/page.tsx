'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { C, api, ready, CAT, CAT_ORDER, catOf, catKeyOf, maxPerWeekOf, defaultTargetOf, confirmDialog } from '../ui';

interface Template {
  id: string; title: string | null; description: string; points: number;
  period: 'daily' | 'mon_fri' | 'custom' | 'weekly'; week_days: number[] | null; deadline_time: string; assignee_label: string;
  category?: string; target_per_week?: number | null; goal?: string | null;
}

const WD = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];
function periodLabel(t: Template): string {
  if (t.period === 'daily') return 'Zilnic';
  if (t.period === 'weekly') return 'Săptămânal';
  if (t.period === 'mon_fri') return 'Luni–Vineri';
  return (t.week_days ?? []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WD[d] ?? String(d)).join(', ');
}
function targetOf(t: Template): number {
  return t.target_per_week ?? defaultTargetOf(t.period, t.week_days);
}

export default function Recurente() {
  const router = useRouter();
  const [items, setItems] = useState<Template[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    await ready();
    setLoading(true);
    const r = await api('/recurring');
    if (!r.ok) { setErr(r.status === 403 ? 'Doar conducerea.' : 'Eroare.'); setLoading(false); return; }
    const d = await r.json();
    setItems(d.templates ?? []); setErr(''); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function stop(id: string, action: 'stop' | 'goal_achieved' = 'stop') {
    setBusy(true);
    const r = await api(`/recurring/${id}`, { method: 'POST', body: JSON.stringify({ action }) });
    if (!r.ok) { setBusy(false); setErr('Eroare la oprire.'); return; }
    await load();
    setBusy(false);
    setEditId(null);
  }

  /** Întoarce mesajul de eroare (afișat ÎN redactor) sau null la succes. */
  async function save(id: string, body: Record<string, unknown>): Promise<string | null> {
    setBusy(true);
    const r = await api(`/recurring/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (!r.ok) { setBusy(false); const d = await r.json().catch(() => ({})); return d.error || 'Eroare la salvare.'; }
    await load();
    setBusy(false);
    setEditId(null);
    return null;
  }

  return (
    <div>
      <button onClick={() => router.back()} style={back}>← Înapoi</button>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, margin: '6px 0 4px' }}>Sarcini recurente</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
        Apar automat în zilele setate. Apasă pe o sarcină ca s-o redactezi. «Oprește» nu șterge sarcinile deja create.
      </div>

      {err && <p style={{ color: C.bad, fontSize: 13 }}>{err}</p>}
      {loading && <p style={{ color: C.muted, fontSize: 13 }}>Se încarcă…</p>}

      {!loading && items.length === 0 && (
        <p style={{ color: C.muted, fontSize: 13 }}>Nicio sarcină recurentă. Creează una bifând «Recurentă» în «+ Sarcină».</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((t) => editId === t.id
          ? <Editor key={t.id} t={t} busy={busy} onSave={(b) => save(t.id, b)} onStop={() => stop(t.id)}
              onGoalAchieved={() => stop(t.id, 'goal_achieved')} onClose={() => { setEditId(null); setErr(''); }} />
          : (
            <div key={t.id} onClick={() => setEditId(t.id)} role="button"
              style={{ padding: 11, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{catOf(t.category).emoji} {t.title || t.description.slice(0, 60)}</div>
                <span style={{ fontSize: 12, color: C.muted }}>✏️</span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                {periodLabel(t)} · până {t.deadline_time} · 💯 {t.points} · 👤 {t.assignee_label}
                {targetOf(t) > 0 ? <> · <span style={{ color: catOf(t.category).color, fontWeight: 700 }}>🎯 {targetOf(t)}/săpt</span></> : null}
              </div>
              {t.goal && <div style={{ fontSize: 12, color: C.ok, marginTop: 3 }}>🏁 {t.goal}</div>}
            </div>
          ))}
      </div>
    </div>
  );
}

/** Redactor inline: toate câmpurile șablonului, «Salvează» trimite doar un PATCH. */
function Editor({ t, busy, onSave, onStop, onGoalAchieved, onClose }: {
  t: Template; busy: boolean;
  onSave: (body: Record<string, unknown>) => Promise<string | null>;
  onStop: () => void; onGoalAchieved: () => void; onClose: () => void;
}) {
  const [localErr, setLocalErr] = useState('');
  const [goal, setGoal] = useState(t.goal ?? '');
  const [title, setTitle] = useState(t.title ?? '');
  const [description, setDescription] = useState(t.description);
  const [points, setPoints] = useState(String(t.points));
  const [deadlineTime, setDeadlineTime] = useState(t.deadline_time);
  const [period, setPeriod] = useState<Template['period']>(t.period);
  const [weekDays, setWeekDays] = useState<number[]>(t.week_days ?? []);
  const [category, setCategory] = useState(catKeyOf(t.category));
  const [target, setTarget] = useState(t.target_per_week != null ? String(t.target_per_week) : '');

  const maxPerWeek = maxPerWeekOf(period, weekDays);

  return (
    <div style={{ padding: 11, background: C.panel, border: `1px solid ${C.accent}`, borderRadius: 6 }}>
      <Lbl>Titlu (opțional)</Lbl>
      <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} placeholder="scurt" />

      <Lbl>Descriere</Lbl>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...input, minHeight: 70, resize: 'vertical' }} />

      <Lbl>🏁 Scopul — DE CE se fac sarcinile (opțional; «Obiectiv atins» apare după salvare)</Lbl>
      <input value={goal} maxLength={140} onChange={(e) => setGoal(e.target.value)} style={input}
        placeholder="ex. găsim șofer Ocnița" />

      <Lbl>Categorie</Lbl>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {CAT_ORDER.map((key) => {
          const c = CAT[key];
          const active = category === key;
          return (
            <button key={key} type="button" disabled={busy} onClick={() => setCategory(key)}
              style={{
                background: active ? c.color : C.panel2, color: active ? '#fff' : C.muted,
                border: `1px solid ${active ? c.color : C.border}`, borderRadius: 4,
                padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontWeight: active ? 700 : 400,
              }}>
              {c.emoji} {c.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Lbl>Puncte</Lbl>
          <input type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} style={input} />
        </div>
        <div style={{ flex: 1 }}>
          <Lbl>Oră limită</Lbl>
          <input type="time" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} style={input} />
        </div>
      </div>

      <Lbl>Cât de des</Lbl>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([['daily', 'Zilnic'], ['weekly', 'Săpt.'], ['mon_fri', 'Lu–Vi'], ['custom', 'Zile alese']] as const).map(([val, lbl]) => (
          <button key={val} type="button" disabled={busy} onClick={() => setPeriod(val)}
            style={{ ...chip, ...(period === val ? chipActive : {}), flex: 1 }}>{lbl}</button>
        ))}
      </div>
      {period === 'custom' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {([[1, 'Lu'], [2, 'Ma'], [3, 'Mi'], [4, 'Jo'], [5, 'Vi'], [6, 'Sâ'], [0, 'Du']] as const).map(([d, lbl]) => (
            <button key={d} type="button" disabled={busy}
              onClick={() => setWeekDays((w) => w.includes(d) ? w.filter((x) => x !== d) : [...w, d])}
              style={{ ...dayChip, ...(weekDays.includes(d) ? chipActive : {}) }}>{lbl}</button>
          ))}
        </div>
      )}

      <Lbl>🎯 Țintă / săptămână — sarcini închise (gol = {period === 'weekly' ? '1 pe săptămână' : 'după program'}, max {maxPerWeek || '—'})</Lbl>
      <input type="number" min={1} max={maxPerWeek || undefined} value={target} onChange={(e) => setTarget(e.target.value)}
        style={input} placeholder="auto" />

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button disabled={busy} style={{ ...primary, flex: 2, opacity: busy ? 0.6 : 1 }}
          onClick={async () => {
            const e = await onSave({
              title: title.trim() || null,
              description: description,
              goal: goal.trim() || null,
              points: points.trim() === '' ? 30 : Number(points),
              deadline_time: deadlineTime,
              period,
              week_days: period === 'custom' ? weekDays : undefined,
              category,
              target_per_week: target.trim() === '' ? null : Number(target),
            });
            setLocalErr(e ?? '');
          }}>
          {busy ? '…' : '💾 Salvează'}
        </button>
        <button disabled={busy} onClick={onClose} style={{ ...chip, flex: 1 }}>Anulează</button>
        <button disabled={busy}
          onClick={async () => { if (await confirmDialog('Oprești șablonul? Sarcinile deja create rămân, dar altele noi nu vor mai apărea.')) onStop(); }}
          style={{ ...stopBtn, flex: 1 }}>Oprește</button>
      </div>
      {t.goal && (
        <button disabled={busy}
          onClick={async () => { const g = t.goal ?? ''; if (await confirmDialog(`Obiectivul «${g.length > 120 ? g.slice(0, 120) + '…' : g}» e atins? Șablonul se oprește cu motiv, sarcinile create rămân.`)) onGoalAchieved(); }}
          style={{ width: '100%', marginTop: 8, background: 'rgba(26,138,74,0.12)', color: C.ok, fontWeight: 700, fontSize: 13, padding: '9px', borderRadius: 4, border: `1px solid ${C.ok}`, cursor: 'pointer' }}>
          🏁 Obiectiv atins — oprește șablonul
        </button>
      )}
      {localErr && <p style={{ color: C.bad, fontSize: 13, marginTop: 8, marginBottom: 0 }}>{localErr}</p>}
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: '10px 0 4px' }}>{children}</div>;
}

const back: React.CSSProperties = { background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', padding: 0 };
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: C.panel2, border: `1px solid ${C.border}`,
  color: C.text, borderRadius: 4, padding: '8px 10px', fontSize: 15,
};
const primary: React.CSSProperties = {
  background: C.accent, color: '#fff', fontWeight: 700, fontSize: 14,
  padding: '9px', borderRadius: 4, border: 'none', cursor: 'pointer',
};
const chip: React.CSSProperties = {
  background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4,
  padding: '8px 10px', fontSize: 13, cursor: 'pointer',
};
const chipActive: React.CSSProperties = {
  background: C.accent, color: '#fff', borderColor: C.accent, fontWeight: 700,
};
const dayChip: React.CSSProperties = {
  background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4,
  padding: '7px 0', fontSize: 13, cursor: 'pointer', minWidth: 42, textAlign: 'center',
};
const stopBtn: React.CSSProperties = { background: 'rgba(204,57,43,0.12)', color: C.bad, fontWeight: 600, fontSize: 13, padding: '8px 10px', borderRadius: 4, border: `1px solid ${C.bad}`, cursor: 'pointer' };
