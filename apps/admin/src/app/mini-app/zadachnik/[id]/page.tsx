'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { C, api, ready, STATE, fmt, type Task } from '../ui';

interface Attempt {
  id: string; number: number; report_text: string | null;
  verdict: string; manager_comment: string | null;
}
interface Me { id: string; role: 'ADMIN' | 'CONTROLLER' | 'DIGITAL' }

const TERMINAL = ['resolved', 'rejected', 'cancelled', 'ignored', 'failed'];

// дата +N дней по Кишинёву → 'YYYY-MM-DD' (для пресетов даты-оценки при принятии)
function isoPlus(days: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const y = +parts.find((p) => p.type === 'year')!.value;
  const m = +parts.find((p) => p.type === 'month')!.value;
  const d = +parts.find((p) => p.type === 'day')!.value;
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function dLabel(iso: string): string { const [, m, d] = iso.split('-'); return `${d}.${m}`; }

export default function TaskDetail() {
  const router = useRouter();
  const id = String(useParams().id);
  const [task, setTask] = useState<Task | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [report, setReport] = useState('');
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [acceptDate, setAcceptDate] = useState(isoPlus(1));

  const load = useCallback(async () => {
    await ready();
    const r = await api(`/tasks/${id}`);
    if (!r.ok) { setErr(r.status === 401 ? 'Neautorizat.' : r.status === 403 ? 'Fără acces.' : 'Eroare.'); return; }
    const d = await r.json();
    setTask(d.task); setAttempts(d.attempts ?? []); setMe(d.me); setErr('');
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    const r = await api(`/tasks/${id}`, { method: 'POST', body: JSON.stringify({ action, ...extra }) });
    setBusy(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Eroare.'); return; }
    setReport(''); setComment(''); setErr('');
    await load();
  }

  if (err && !task) return <div><button onClick={() => router.back()} style={back}>← Înapoi</button><p style={{ color: C.bad }}>{err}</p></div>;
  if (!task || !me) return <p style={{ color: C.muted, fontSize: 13 }}>Se încarcă…</p>;

  const s = STATE[task.current_state] ?? { label: task.current_state, color: C.muted, icon: '•' };
  const isAdmin = me.role === 'ADMIN';
  const isAssignee = task.assignee_id === me.id;
  const st = task.current_state;

  return (
    <div>
      <button onClick={() => router.back()} style={back}>← Înapoi</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px' }}>
        <span style={{ fontSize: 12, color: s.color }}>{s.icon} {s.label}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{task.title || task.description.slice(0, 60)}</div>
      <div style={{ fontSize: 11, color: C.muted, margin: '4px 0 10px' }}>⏰ {fmt(task.current_deadline)} · 💯 {task.points}{task.estimated_date ? ` · 📅 estimat ${dLabel(task.estimated_date)}` : ''}{task.rework_used ? ' · 🔁 refacere folosită' : ''}</div>

      {task.title && <div style={{ ...panel, whiteSpace: 'pre-wrap' }}>{task.description}</div>}

      {attempts.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Lbl>Rapoarte</Lbl>
          {attempts.map((a) => (
            <div key={a.id} style={panel}>
              <div style={{ fontSize: 11, color: C.muted }}>#{a.number} · {a.verdict}</div>
              {a.report_text && <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginTop: 3 }}>{a.report_text}</div>}
              {a.manager_comment && <div style={{ fontSize: 12, color: C.warn, marginTop: 3 }}>💬 {a.manager_comment}</div>}
            </div>
          ))}
        </div>
      )}

      {err && <p style={{ color: C.bad, fontSize: 13 }}>{err}</p>}

      {/* ── Действия исполнителя ── */}
      {isAssignee && (st === 'sent' || st === 'delivered') && (
        <div style={{ marginTop: 14 }}>
          <Lbl>Când o faci? (dată estimativă)</Lbl>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {[1, 3, 7].map((n) => {
              const v = isoPlus(n);
              return (
                <button key={n} onClick={() => setAcceptDate(v)} style={{ ...chip, ...(acceptDate === v ? chipActive : {}) }}>
                  {n === 1 ? 'Mâine' : `+${n} zile`} ({dLabel(v)})
                </button>
              );
            })}
            <input type="date" value={acceptDate} onChange={(e) => setAcceptDate(e.target.value)} style={{ ...input, width: 'auto', flex: 1, minWidth: 120, padding: '7px 9px', fontSize: 14 }} />
          </div>
          <button onClick={() => act('accept', { estimated_date: acceptDate || null })} disabled={busy} style={{ ...primary, width: '100%' }}>▶ Accept sarcina</button>
        </div>
      )}
      {isAssignee && st === 'accepted' && (
        <button onClick={() => act('start')} disabled={busy} style={{ ...secondary, width: '100%', marginTop: 10 }}>🔧 Start lucru</button>
      )}
      {isAssignee && (st === 'accepted' || st === 'in_progress') && (
        <div style={{ marginTop: 14 }}>
          <Lbl>Raport</Lbl>
          <textarea value={report} onChange={(e) => setReport(e.target.value)} style={{ ...input, minHeight: 80 }} placeholder="ce ai făcut" />
          <button onClick={() => report.trim() && act('submit_report', { report_text: report.trim() })} disabled={busy || !report.trim()} style={{ ...primary, width: '100%', marginTop: 8, opacity: report.trim() ? 1 : 0.5 }}>📤 Trimite raport</button>
        </div>
      )}

      {/* ── Действия постановщика ── */}
      {isAdmin && st === 'report_pending' && (
        <div style={{ marginTop: 14 }}>
          <Lbl>Decizie</Lbl>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} style={{ ...input, minHeight: 60 }} placeholder="comentariu (opțional)" />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => act('approve', { comment })} disabled={busy} style={{ ...primary, flex: 1 }}>✅ Aprobă</button>
            <button onClick={() => act('rework', { comment })} disabled={busy || task.rework_used} style={{ ...secondary, flex: 1, opacity: task.rework_used ? 0.4 : 1 }}>🔁 Refacere</button>
            <button onClick={() => act('reject', { comment })} disabled={busy} style={{ ...danger, flex: 1 }}>❌ Respinge</button>
          </div>
        </div>
      )}
      {isAdmin && !TERMINAL.includes(st) && (
        <button onClick={() => act('cancel')} disabled={busy} style={{ ...secondary, width: '100%', marginTop: 12, color: C.muted }}>🚫 Anulează sarcina</button>
      )}
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 5 }}>{children}</div>;
}

const back: React.CSSProperties = { background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', padding: 0 };
const panel: React.CSSProperties = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, padding: '9px 11px', fontSize: 14, marginBottom: 8 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: '9px 11px', fontSize: 16, resize: 'vertical' };
const primary: React.CSSProperties = { background: C.accent, color: '#fff', fontWeight: 700, fontSize: 14, padding: '11px', borderRadius: 4, border: '1px solid #d8a838', cursor: 'pointer' };
const secondary: React.CSSProperties = { background: C.panel, color: C.text, fontWeight: 600, fontSize: 14, padding: '11px', borderRadius: 4, border: `1px solid ${C.border}`, cursor: 'pointer' };
const danger: React.CSSProperties = { background: 'rgba(204,102,102,0.15)', color: C.bad, fontWeight: 600, fontSize: 14, padding: '11px', borderRadius: 4, border: `1px solid ${C.bad}`, cursor: 'pointer' };
const chip: React.CSSProperties = { background: C.panel, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: '6px 10px', fontSize: 13, cursor: 'pointer' };
const chipActive: React.CSSProperties = { background: C.accent, color: '#fff', borderColor: C.accent, fontWeight: 700 };
