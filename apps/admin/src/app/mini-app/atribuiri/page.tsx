'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { C, ready, api, chisinauDay, type AtribuireView } from './ui';

// Home: Azi/Mâine + direcțiile managerului cu rezumat (complet / de completat / nepotriviri).

interface Dir { id: string; label: string }

export default function AtribuiriHome() {
  const [date, setDate] = useState(chisinauDay(0));
  const [dirs, setDirs] = useState<Dir[] | null>(null);
  const [rows, setRows] = useState<AtribuireView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { ready(); }, []);

  useEffect(() => {
    api('/whoami').then(async (r) => {
      if (!r.ok) { setErr(r.status === 401 ? 'Acces doar pentru manageri.' : 'Eroare de autorizare.'); return; }
      const j = await r.json();
      setDirs(j.directions as Dir[]);
    }).catch(() => setErr('Rețea indisponibilă.'));
  }, []);

  useEffect(() => {
    setRows(null);
    api(`/zi?date=${date}`).then(async (r) => {
      if (!r.ok) return;
      const j = await r.json();
      setRows(j.rows as AtribuireView[]);
    }).catch(() => { /* rezumatul rămâne gol */ });
  }, [date]);

  if (err) return <div style={{ padding: 24, textAlign: 'center', color: C.muted }}>{err}</div>;

  const azi = chisinauDay(0), maine = chisinauDay(1);
  const summary = (dirId: string) => {
    if (!rows) return null;
    const mine = rows.filter((r) => r.direction === dirId);
    if (!mine.length) return { text: 'fără curse azi', color: C.muted };
    const gol = mine.filter((r) => !r.vehicle_id).length;
    const nep = mine.filter((r) => r.status === 'nepotrivire').length;
    if (nep) return { text: `⚠ ${nep} nepotriviri`, color: C.bad };
    if (gol) return { text: `${gol} de completat`, color: C.warn };
    return { text: `✓ complet (${mine.length})`, color: C.ok };
  };

  const chip = (d: string, label: string) => (
    <button
      key={d}
      onClick={() => setDate(d)}
      style={{
        padding: '8px 16px', borderRadius: 18, fontSize: 15, fontWeight: 600, cursor: 'pointer',
        border: `1px solid ${date === d ? C.accent : C.border}`,
        background: date === d ? C.accent : C.panel, color: date === d ? '#fff' : C.text,
      }}
    >{label}</button>
  );

  return (
    <div>
      <h1 style={{ fontSize: 20, margin: '4px 0 12px' }}>Atribuiri</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        {chip(azi, 'Azi')}
        {chip(maine, 'Mâine')}
        <input
          type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel, fontSize: 14 }}
        />
      </div>

      {!dirs && <div style={{ color: C.muted, padding: 12 }}>Se încarcă…</div>}
      {dirs?.map((d) => {
        const s = summary(d.id);
        return (
          <Link
            key={d.id} href={`/mini-app/atribuiri/${d.id}?date=${date}`}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: '14px 16px', marginBottom: 8, textDecoration: 'none', color: C.text,
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 600 }}>{d.label}</span>
            <span style={{ fontSize: 13, color: s?.color ?? C.muted }}>{s?.text ?? '…'}</span>
          </Link>
        );
      })}

      <Link
        href="/mini-app/atribuiri/template"
        style={{
          display: 'block', textAlign: 'center', marginTop: 16, padding: '12px 16px',
          borderRadius: 12, border: `1px dashed ${C.border}`, color: C.accent,
          textDecoration: 'none', fontWeight: 600, fontSize: 15,
        }}
      >📅 Șablonul săptămânal</Link>
    </div>
  );
}
