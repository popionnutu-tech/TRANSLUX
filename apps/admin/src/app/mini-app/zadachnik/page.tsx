'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { C, api, ready, STATE, fmt, type Task } from './ui';

export default function ZadachnikHome() {
  const [role, setRole] = useState<'ADMIN' | 'CONTROLLER' | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bucket, setBucket] = useState<'active' | 'history'>('active');
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
      setRole(d.role); setTasks(d.tasks ?? []); setErr(''); setLoading(false);
    })();
    return () => { alive = false; };
    // role/bucket trigger refetch
  }, [role, bucket]);

  if (err) return <p style={{ color: C.bad, fontSize: 14 }}>{err}</p>;

  const isAdmin = role === 'ADMIN';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.gold, letterSpacing: '0.06em' }}>
          ⚓ {isAdmin ? 'MOSTIC' : 'SARCINILE MELE'}
        </div>
        {isAdmin && (
          <Link href="/mini-app/zadachnik/new" style={primaryBtn}>+ Sarcină</Link>
        )}
      </div>

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

      {!loading && isAdmin && (
        <>
          <Section title="Necesită decizie" tasks={tasks.filter((t) => t.current_state === 'report_pending')} accent={C.warn} />
          <Section title="Întârzieri" tasks={tasks.filter((t) => ['overdue', 'overdue_responded'].includes(t.current_state))} accent={C.bad} />
          <Section title="Active" tasks={tasks.filter((t) => ['sent', 'delivered', 'accepted', 'in_progress'].includes(t.current_state))} accent={C.gold} />
          <Section title="Închise" tasks={tasks.filter((t) => ['resolved', 'rejected', 'cancelled', 'ignored', 'failed'].includes(t.current_state))} accent={C.muted} muted />
        </>
      )}

      {!loading && !isAdmin && (
        tasks.length === 0
          ? <p style={{ color: C.muted, fontSize: 13 }}>Nimic aici.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{tasks.map((t) => <Card key={t.id} t={t} />)}</div>
      )}
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
  return (
    <Link href={`/mini-app/zadachnik/${t.id}`} style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {t.title || t.description.slice(0, 60)}
        </span>
        <span style={{ fontSize: 12, color: s.color, whiteSpace: 'nowrap' }}>{s.icon} {s.label}</span>
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>⏰ {fmt(t.current_deadline)} · 💯 {t.points}</div>
    </Link>
  );
}

const primaryBtn: React.CSSProperties = {
  background: C.accent, color: '#fff', fontWeight: 700, fontSize: 13,
  padding: '7px 12px', borderRadius: 4, textDecoration: 'none', border: '1px solid #d8a838',
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
