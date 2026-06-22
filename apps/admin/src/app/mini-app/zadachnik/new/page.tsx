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
    setBusy(true); setErr('');
    const r = await api('/tasks', {
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

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Label>Puncte</Label>
          <input type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} style={input} />
        </div>
        <div style={{ flex: 2 }}>
          <Label>Termen</Label>
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={input} />
        </div>
      </div>

      <button onClick={submit} disabled={busy} style={{ ...primaryBtn, width: '100%', marginTop: 16, opacity: busy ? 0.6 : 1 }}>
        {busy ? '…' : '► Trimite sarcina'}
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
