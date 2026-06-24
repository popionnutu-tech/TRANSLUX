'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { C, api, ready } from '../ui';

interface Template {
  id: string; title: string | null; description: string; points: number;
  period: 'daily' | 'mon_fri' | 'custom'; week_days: number[] | null; deadline_time: string; assignee_label: string;
}

const WD = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];
function periodLabel(t: Template): string {
  if (t.period === 'daily') return 'Zilnic';
  if (t.period === 'mon_fri') return 'Luni–Vineri';
  return (t.week_days ?? []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WD[d] ?? String(d)).join(', ');
}

export default function Recurente() {
  const router = useRouter();
  const [items, setItems] = useState<Template[]>([]);
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

  async function stop(id: string) {
    setBusy(true);
    const r = await api(`/recurring/${id}`, { method: 'POST', body: JSON.stringify({ action: 'stop' }) });
    setBusy(false);
    if (!r.ok) { setErr('Eroare la oprire.'); return; }
    await load();
  }

  return (
    <div>
      <button onClick={() => router.back()} style={back}>← Înapoi</button>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, margin: '6px 0 4px' }}>Sarcini recurente</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
        Apar automat în fiecare zi (sau Luni–Vineri). «Oprește» nu șterge sarcinile deja create.
      </div>

      {err && <p style={{ color: C.bad, fontSize: 13 }}>{err}</p>}
      {loading && <p style={{ color: C.muted, fontSize: 13 }}>Se încarcă…</p>}

      {!loading && items.length === 0 && (
        <p style={{ color: C.muted, fontSize: 13 }}>Nicio sarcină recurentă. Creează una bifând «Recurentă» în «+ Sarcină».</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((t) => (
          <div key={t.id} style={{ padding: 11, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{t.title || t.description.slice(0, 60)}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              {periodLabel(t)} · până {t.deadline_time} · 💯 {t.points} · 👤 {t.assignee_label}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={() => stop(t.id)} disabled={busy} style={stopBtn}>Oprește</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const back: React.CSSProperties = { background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', padding: 0 };
const stopBtn: React.CSSProperties = { background: 'rgba(204,57,43,0.12)', color: C.bad, fontWeight: 600, fontSize: 13, padding: '6px 12px', borderRadius: 4, border: `1px solid ${C.bad}`, cursor: 'pointer' };
