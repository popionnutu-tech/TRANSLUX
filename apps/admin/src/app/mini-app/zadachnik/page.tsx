'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { C, api, ready, STATE, fmt, CAT_ORDER, catOf, catKeyOf, type Task, type TargetProgress } from './ui';

// Serverul (listForAdmin) trimite deja doar stări nonterminale — nu mai refiltrăm pe client.

interface RecTemplate {
  id: string; assignee_id: string; title: string | null; description: string; points: number;
  period: 'daily' | 'mon_fri' | 'custom'; week_days: number[] | null; deadline_time: string;
  assignee_label: string;
  category?: string; target_per_week?: number | null;
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
  const [targets, setTargets] = useState<TargetProgress[]>([]);
  const [recurring, setRecurring] = useState<RecTemplate[]>([]);
  const [bucket, setBucket] = useState<'active' | 'history'>('active');
  const [view, setView] = useState<'state' | 'employee'>('state');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // NB: `role` NU e în dependențe — la primul fetch serverul decide singur rolul, iar
  // setRole() nu trebuie să declanșeze un al doilea fetch identic (dubla toate cererile).
  useEffect(() => {
    let alive = true;
    (async () => {
      await ready();
      setLoading(true);
      const r = await api(`/tasks?bucket=${bucket}`);
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
      setRole(d.role); setTasks(d.tasks ?? []); setTargets(d.targets ?? []); setErr('');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doar bucket declanșează refetch (vezi NB)
  }, [bucket]);

  if (err) return <p style={{ color: C.bad, fontSize: 14 }}>{err}</p>;

  const isAdmin = role === 'ADMIN';

  // Группировка по сотруднику: текущие задачи + все его повторяющиеся (с днями недели)
  // ключ — assignee_id (не label: безымянные на одной точке дали бы коллизию метки)
  const empMap = new Map<string, { label: string; tasks: Task[]; rec: RecTemplate[] }>();
  if (isAdmin && view === 'employee') {
    for (const t of tasks) {
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

      {/* «Istoric» există și la admin (17.08.2026): fără el, o sarcină închisă automat de curățenia
          de la 07:00 nu se putea deschide din interfață, deci nici corecta. */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['active', 'history'] as const).map((b) => (
          <button key={b} onClick={() => setBucket(b)}
            style={{ ...tab, ...(bucket === b ? tabActive : {}) }}>
            {b === 'active' ? 'Active' : 'Istoric'}
          </button>
        ))}
      </div>

      {isAdmin && bucket === 'active' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(['state', 'employee'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ ...tab, ...(view === v ? tabActive : {}) }}>
              {v === 'state' ? 'După stare' : 'Per angajat'}
            </button>
          ))}
        </div>
      )}

      {loading && <p style={{ color: C.muted, fontSize: 13 }}>Se încarcă…</p>}

      {!loading && isAdmin && bucket === 'history' && (
        tasks.length === 0
          ? <p style={{ color: C.muted, fontSize: 13 }}>Nimic închis în ultimele 2 săptămâni.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{tasks.map((t) => <Card key={t.id} t={t} showCat />)}</div>
      )}

      {!loading && isAdmin && bucket === 'active' && view === 'state' && (
        <>
          <Section title="Necesită decizie" tasks={tasks.filter((t) => t.current_state === 'report_pending')} accent={C.warn} />
          <Section title="Întârzieri" tasks={tasks.filter((t) => ['overdue', 'overdue_responded'].includes(t.current_state))} accent={C.bad} />
          <Section title="Active" tasks={tasks.filter((t) => ['sent', 'delivered', 'accepted', 'in_progress'].includes(t.current_state))} accent={C.gold} />
          {/* «Închise» scoasă intenționat (07.08.2026): serverul nici nu le mai trimite — vezi listForAdmin. */}
        </>
      )}

      {!loading && isAdmin && bucket === 'active' && view === 'employee' && (
        employees.length === 0
          ? <p style={{ color: C.muted, fontSize: 13 }}>Nimic.</p>
          : employees.map(([id, g]) => (
              <EmployeeGroup key={id} name={g.label} tasks={g.tasks} rec={g.rec}
                targets={(targets ?? []).filter((tg) => tg.assignee_id === id)} />
            ))
      )}

      {/* Panoul «🎯 Săptămâna asta» rămâne pe ecranul executantului (Ion, 17.08.2026):
          e singurul loc unde Iurie vede norma săptămânală, cardurile n-o arată. */}
      {!loading && !isAdmin && bucket === 'active' && targets.length > 0 && <TargetsPanel targets={targets} />}

      {!loading && !isAdmin && (
        tasks.length === 0
          ? <p style={{ color: C.muted, fontSize: 13 }}>Nimic aici.</p>
          : bucket === 'active'
            ? <CategorySections tasks={tasks} />
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{tasks.map((t) => <Card key={t.id} t={t} showCat />)}</div>
      )}
    </div>
  );
}

/** Panoul «🎯 Săptămâna asta» — un bar de progres pe fiecare șablon activ. */
function TargetsPanel({ targets }: { targets: TargetProgress[] }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px', marginBottom: 14 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accent, marginBottom: 8 }}>
        🎯 Săptămâna asta
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {targets.map((t) => {
          const hit = t.done >= t.target;
          const pct = Math.min(100, Math.round((t.done / t.target) * 100));
          return (
            <div key={t.template_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.label}</span>
                <span style={{ color: hit ? C.ok : C.muted, fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 8 }}>
                  {t.done}/{t.target}{hit ? ' ✓' : ''}
                </span>
              </div>
              <div style={{ height: 6, background: C.panel2, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: hit ? C.ok : C.accent, borderRadius: 3, transition: 'width .3s' }} />
              </div>
              {t.goal && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>🏁 {t.goal}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Sarcinile lui Iurie, pe secțiuni de categorie (ordinea CAT_ORDER, secțiile goale se ascund). */
function CategorySections({ tasks }: { tasks: Task[] }) {
  return (
    <>
      {CAT_ORDER.map((key) => {
        const cat = catOf(key);
        const list = tasks.filter((t) => catKeyOf(t.category) === key);
        if (list.length === 0) return null;
        return (
          <div key={key} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: cat.color, fontWeight: 700, marginBottom: 6 }}>
              {cat.emoji} {cat.label} · {list.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderLeft: `3px solid ${cat.color}`, paddingLeft: 8 }}>
              {list.map((t) => <Card key={t.id} t={t} />)}
            </div>
          </div>
        );
      })}
    </>
  );
}

function EmployeeGroup({ name, tasks, rec, targets }: { name: string; tasks: Task[]; rec: RecTemplate[]; targets: TargetProgress[] }) {
  const targetOf = (rt: RecTemplate) =>
    targets.find((tg) => tg.template_id === rt.id);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>👤 {name}</span>
        <span style={{ fontSize: 11, color: C.muted }}>{tasks.length} curente</span>
      </div>
      {targets.length > 0 && <TargetsPanel targets={targets} />}
      <CategorySections tasks={tasks} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rec.length > 0 && (
          <div style={{ fontSize: 11, color: C.muted, marginTop: tasks.length ? 8 : 0, marginBottom: 2 }}>Se repetă:</div>
        )}
        {rec.map((rt) => {
          const tg = targetOf(rt);
          return (
            // Link spre Recurente — acolo e redactorul șablonului (cardul mort deruta: «nu pot apăsa»)
            <Link key={rt.id} href="/mini-app/zadachnik/recurente" style={{ ...card, borderStyle: 'dashed' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {catOf(rt.category).emoji} 🔁 {rt.title || rt.description.slice(0, 50)} <span style={{ color: C.muted, fontWeight: 400 }}>✏️</span>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                {recScheduleLabel(rt)} · {rt.deadline_time}
                {tg ? <> · <span style={{ color: tg.done >= tg.target ? C.ok : catOf(rt.category).color, fontWeight: 700 }}>🎯 {tg.done}/{tg.target}{tg.done >= tg.target ? ' ✓' : ''}</span></> : null}
              </div>
            </Link>
          );
        })}
        {tasks.length === 0 && rec.length === 0 && <p style={{ fontSize: 12, color: C.muted }}>Nimic.</p>}
      </div>
    </div>
  );
}

function Section({ title, tasks, accent }: { title: string; tasks: Task[]; accent: string }) {
  if (tasks.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent, marginBottom: 6 }}>
        {title} · {tasks.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{tasks.map((t) => <Card key={t.id} t={t} showCat />)}</div>
    </div>
  );
}

/** Card minimal: titlu + stare + termen. Punctele, data estimată și obiectivul stau pe pagina
 *  sarcinii — pe listă erau zgomot (decizia lui Ion, 17.08.2026).
 *  `showCat` doar acolo unde secțiunea NU e deja o categorie (vederea admin «După stare»). */
function Card({ t, showCat = false }: { t: Task; showCat?: boolean }) {
  const s = STATE[t.current_state] ?? { label: t.current_state, color: C.muted, icon: '•' };
  return (
    <Link href={`/mini-app/zadachnik/${t.id}`} style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {showCat ? `${catOf(t.category).emoji} ` : ''}{t.title || t.description.slice(0, 60)}
        </span>
        <span style={{ fontSize: 12, color: s.color, whiteSpace: 'nowrap' }}>{s.icon} {s.label}</span>
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>⏰ {fmt(t.current_deadline)}</div>
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
