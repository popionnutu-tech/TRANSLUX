'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { C, api, ready } from '../ui';

function defaultDeadline(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T18:00`;
}

export default function NewTask() {
  const router = useRouter();
  const [assignees, setAssignees] = useState<{ id: string; label: string }[]>([]);
  const [assignee, setAssignee] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState('30');
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [recurring, setRecurring] = useState(false);
  const [period, setPeriod] = useState<'daily' | 'mon_fri' | 'custom'>('daily');
  const [weekDays, setWeekDays] = useState<number[]>([]);
  const [deadlineTime, setDeadlineTime] = useState('18:00');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      await ready();
      const r = await api('/assignees');
      if (!r.ok) { setErr(r.status === 403 ? 'Doar conducerea poate crea sarcini.' : 'Eroare.'); return; }
      const d = await r.json();
      setAssignees(d.assignees ?? []);
      if (d.assignees?.[0]) setAssignee(d.assignees[0].id);
    })();
  }, []);

  async function submit() {
    if (!assignee || !description.trim()) { setErr('Alege executorul și scrie descrierea.'); return; }
    if (recurring && period === 'custom' && weekDays.length === 0) { setErr('Alege cel puțin o zi a săptămânii.'); return; }
    setBusy(true); setErr('');
    const r = recurring
      ? await api('/recurring', {
          method: 'POST',
          body: JSON.stringify({ assignee_id: assignee, title: title.trim() || null, description: description.trim(), points: Number(points) || 30, period, deadline_time: deadlineTime, week_days: period === 'custom' ? weekDays : undefined }),
        })
      : await api('/tasks', {
          method: 'POST',
          body: JSON.stringify({ assignee_id: assignee, title: title.trim() || null, description: description.trim(), points: Number(points) || 30, deadline }),
        });
    setBusy(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Eroare la creare.'); return; }
    router.push('/mini-app/zadachnik');
  }

  return (
    <div>
      <button onClick={() => router.back()} style={backLink}>← Înapoi</button>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.gold, margin: '6px 0 14px' }}>Sarcină nouă</div>

      {err && <p style={{ color: C.bad, fontSize: 13 }}>{err}</p>}

      <Label>Executor</Label>
      <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={input}>
        {assignees.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
      </select>

      <Label>Titlu (opțional)</Label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} placeholder="scurt" />

      <Label>Descriere</Label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...input, minHeight: 90, resize: 'vertical' }} placeholder="ce trebuie făcut" />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 2px', cursor: 'pointer', fontSize: 14, color: C.text }}>
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} style={{ width: 18, height: 18 }} />
        🔁 Recurentă (se repetă automat)
      </label>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Label>Puncte</Label>
          <input type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} style={input} />
        </div>
        <div style={{ flex: 2 }}>
          {recurring ? (
            <>
              <Label>Oră limită</Label>
              <input type="time" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} style={input} />
            </>
          ) : (
            <>
              <Label>Termen</Label>
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={input} />
            </>
          )}
        </div>
      </div>

      {recurring && (
        <div style={{ marginTop: 10 }}>
          <Label>Cât de des</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['daily', 'Zilnic'], ['mon_fri', 'Luni–Vineri'], ['custom', 'Zile alese']] as const).map(([val, lbl]) => (
              <button key={val} type="button" onClick={() => setPeriod(val)}
                style={{ ...chipBtn, ...(period === val ? chipActiveBtn : {}), flex: 1 }}>{lbl}</button>
            ))}
          </div>
          {period === 'custom' && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {([[1, 'Lu'], [2, 'Ma'], [3, 'Mi'], [4, 'Jo'], [5, 'Vi'], [6, 'Sâ'], [0, 'Du']] as const).map(([d, lbl]) => (
                <button key={d} type="button"
                  onClick={() => setWeekDays((w) => w.includes(d) ? w.filter((x) => x !== d) : [...w, d])}
                  style={{ ...dayChip, ...(weekDays.includes(d) ? chipActiveBtn : {}) }}>{lbl}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <button onClick={submit} disabled={busy} style={{ ...primaryBtn, width: '100%', marginTop: 16, opacity: busy ? 0.6 : 1 }}>
        {busy ? '…' : recurring ? '🔁 Creează recurența' : '► Trimite sarcina'}
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: '12px 0 5px' }}>{children}</div>;
}

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: C.panel2, border: `1px solid ${C.border}`,
  color: C.text, borderRadius: 4, padding: '9px 11px', fontSize: 16,
};
const primaryBtn: React.CSSProperties = {
  background: C.accent, color: '#fff', fontWeight: 800, fontSize: 15,
  padding: '12px', borderRadius: 4, border: '1px solid #d8a838', cursor: 'pointer', letterSpacing: '0.06em',
};
const backLink: React.CSSProperties = {
  background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', padding: 0,
};
const chipBtn: React.CSSProperties = {
  background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4,
  padding: '9px 11px', fontSize: 14, cursor: 'pointer',
};
const chipActiveBtn: React.CSSProperties = {
  background: C.accent, color: '#fff', borderColor: C.accent, fontWeight: 700,
};
const dayChip: React.CSSProperties = {
  background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4,
  padding: '7px 0', fontSize: 13, cursor: 'pointer', minWidth: 42, textAlign: 'center',
};
