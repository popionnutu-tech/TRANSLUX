'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { C, api, ready, STATE, fmt, type Task } from './ui';

const CURRENT_STATES = ['created', 'sent', 'delivered', 'accepted', 'in_progress', 'report_pending', 'overdue', 'overdue_responded'];

interface RecTemplate {
  id: string; assignee_id: string; title: string | null; description: string; points: number;
  period: 'daily' | 'mon_fri' | 'custom'; week_days: number[] | null; deadline_time: string;
  assignee_label: string;
}

const WD = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];
function recScheduleLabel(t: RecTemplate): string {
  if (t.period === 'daily') return 'în fiecare zi';
  if (t.period === 'mon_fri') return 'Luni–Vineri';
  return (t.week_days ?? []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WD[d] ?? String(d)).join(', ');
}

export default function ZadachnikHome() {
  const [role, setRole] = useState<'ADMIN' | 'CONTROLLER' | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recurring, setRecurring] = useState<RecTemplate[]>([]);
  const [bucket, setBucket] = useState<'active' | 'history'>('active');
  const [view, setView] = useState<'state' | 'employee'>('state');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      await ready();
      setLoading(true);
      const r = await api('/tasks' + (role === 'CONTROLLER' ? `?bucket=${bucket}` : ''));
      if (!alive) return;
      if (!r.ok) {
        if (r.status === 401) {
          let diag = '(diag eșuat)';
          try { diag = JSON.stringify(await (await api('/whoami')).json()); } catch { /* ignore */ }
          setErr('Neautorizat. DIAG: ' + diag);
        } else {
          setErr('Eroare.');
        }
        setLoading(false); return;
      }
      const d = await r.json();
      setRole(d.role); setTasks(d.tasks ?? []); setErr('');
      // recurente — doar pt admin (vederea «Per angajat»)
      if (d.role === 'ADMIN') {
        try {
          const rr = await api('/recurring');
          if (rr.ok && alive) setRecurring((await rr.json()).templates ?? []);
        } catch { /* ignore */ }
      }
      setLoading(false);
    })();
    return () => { alive = false; };
    // role/bucket trigger refetch
  }, [role, bucket]);

  if (err) return <p style={{ color: C.bad, fontSize: 14 }}>{err}</p>;

  const isAdmin = role === 'ADMIN';

  // Группировка по сотруднику: текущие задачи + все его повторяющиеся (с днями недели)
  // ключ — assignee_id (не label: безымянные на одной точке дали бы коллизию метки)
  const empMap = new Map<string, { label: string; tasks: Task[]; rec: RecTemplate[] }>();
  if (isAdmin && view === 'employee') {
    for (const t of tasks.filter((t) => CURRENT_STATES.includes(t.current_state))) {
      const k = t.assignee_id;
      if (!empMap.has(k)) empMap.set(k, { label: t.assignee_label || '—', tasks: [], rec: [] });
      empMap.get(k)!.tasks.push(t);
    }
    for (const rt of recurring) {
      const k = rt.assignee_id;
      if (!empMap.has(k)) empMap.set(k, { label: rt.assignee_label || '—', tasks: [], rec: [] });
      empMap.get(k)!.rec.push(rt);
    }
  }
  const employees = [...empMap.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.gold, letterSpacing: '0.06em', marginBottom: 10 }}>
        ⚓ {isAdmin ? 'MOSTIC' : 'SARCINILE MELE'}
      </div>
      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <Link href="/mini-app/zadachnik/echipa" style={ghostBtn}>Echipa</Link>
          <Link href="/mini-app/zadachnik/recurente" style={ghostBtn}>Recurente</Link>
          <Link href="/mini-app/zadachnik/new" style={primaryBtn}>+ Sarcină</Link>
        </div>
      )}

      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(['state', 'employee'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ ...tab, ...(view === v ? tabActive : {}) }}>
              {v === 'state' ? 'După stare' : 'Per angajat'}
            </button>
          ))}
        </div>
      )}

      {!isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(['active', 'history'] as const).map((b) => (
            <button key={b} onClick={() => setBucket(b)}
              style={{ ...tab, ...(bucket === b ? tabActive : {}) }}>
              {b === 'active' ? 'Active' : 'Istoric'}
            </button>
          ))}
        </div>
      )}

      {loading && <p style={{ color: C.muted, fontSize: 13 }}>Se încarcă…</p>}

      {!loading && isAdmin && view === 'state' && (
        <>
          <Section title="Necesită decizie" tasks={tasks.filter((t) => t.current_state === 'report_pending')} accent={C.warn} />
          <Section title="Întârzieri" tasks={tasks.filter((t) => ['overdue', 'overdue_responded'].includes(t.current_state))} accent={C.bad} />
          <Section title="Active" tasks={tasks.filter((t) => ['sent', 'delivered', 'accepted', 'in_progress'].includes(t.current_state))} accent={C.gold} />
          <Section title="Închise" tasks={tasks.filter((t) => ['resolved', 'rejected', 'cancelled', 'ignored', 'failed'].includes(t.current_state))} accent={C.muted} muted />
        </>
      )}

      {!loading && isAdmin && view === 'employee' && (
        employees.length === 0
          ? <p style={{ color: C.muted, fontSize: 13 }}>Nimic.</p>
          : employees.map(([id, g]) => <EmployeeGroup key={id} name={g.label} tasks={g.tasks} rec={g.rec} />)
      )}

      {!loading && !isAdmin && (
        tasks.length === 0
          ? <p style={{ color: C.muted, fontSize: 13 }}>Nimic aici.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{tasks.map((t) => <Card key={t.id} t={t} />)}</div>
      )}
    </div>
  );
}

function EmployeeGroup({ name, tasks, rec }: { name: string; tasks: Task[]; rec: RecTemplate[] }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>👤 {name}</span>
        <span style={{ fontSize: 11, color: C.muted }}>{tasks.length} curente</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tasks.map((t) => <Card key={t.id} t={t} />)}
        {rec.length > 0 && (
          <div style={{ fontSize: 11, color: C.muted, marginTop: tasks.length ? 8 : 0, marginBottom: 2 }}>Se repetă:</div>
        )}
        {rec.map((rt) => (
          <div key={rt.id} style={{ ...card, borderStyle: 'dashed' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🔁 {rt.title || rt.description.slice(0, 50)}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{recScheduleLabel(rt)} · {rt.deadline_time}</div>
          </div>
        ))}
        {tasks.length === 0 && rec.length === 0 && <p style={{ fontSize: 12, color: C.muted }}>Nimic.</p>}
      </div>
    </div>
  );
}

function Section({ title, tasks, accent, muted }: { title: string; tasks: Task[]; accent: string; muted?: boolean }) {
  if (tasks.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent, marginBottom: 6, opacity: muted ? 0.7 : 1 }}>
        {title} · {tasks.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{tasks.map((t) => <Card key={t.id} t={t} />)}</div>
    </div>
  );
}

function Card({ t }: { t: Task }) {
  const s = STATE[t.current_state] ?? { label: t.current_state, color: C.muted, icon: '•' };
  const badge = t.source === 'reclama' ? '📢 ' : t.source === 'recurring' ? '🔁 ' : '';
  const est = t.estimated_date ? t.estimated_date.split('-').reverse().slice(0, 2).join('.') : '';
  return (
    <Link href={`/mini-app/zadachnik/${t.id}`} style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {badge}{t.title || t.description.slice(0, 60)}
        </span>
        <span style={{ fontSize: 12, color: s.color, whiteSpace: 'nowrap' }}>{s.icon} {s.label}</span>
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>⏰ {fmt(t.current_deadline)} · 💯 {t.points}{est ? ` · 📅 ${est}` : ''}</div>
    </Link>
  );
}

const primaryBtn: React.CSSProperties = {
  background: C.accent, color: '#fff', fontWeight: 700, fontSize: 13,
  padding: '7px 12px', borderRadius: 4, textDecoration: 'none', border: 'none',
};
const ghostBtn: React.CSSProperties = {
  background: C.panel, color: C.accent, fontWeight: 600, fontSize: 13,
  padding: '7px 12px', borderRadius: 4, textDecoration: 'none', border: `1px solid ${C.border}`,
};
const card: React.CSSProperties = {
  display: 'block', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4,
  padding: '10px 12px', textDecoration: 'none',
};
const tab: React.CSSProperties = {
  background: C.panel, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4,
  padding: '5px 14px', fontSize: 13, cursor: 'pointer',
};
const tabActive: React.CSSProperties = { color: '#fff', background: C.accent, borderColor: '#d8a838', fontWeight: 700 };
