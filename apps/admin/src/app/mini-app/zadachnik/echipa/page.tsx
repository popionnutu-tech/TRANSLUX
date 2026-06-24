'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { C, api, ready } from '../ui';

interface Member {
  id: string; name: string | null; username: string | null;
  role: string; point: string | null; telegram_id: number; active: boolean;
}

export default function Echipa() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [err, setErr] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [invitePoint, setInvitePoint] = useState('CHISINAU');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    await ready();
    const r = await api('/team');
    if (!r.ok) { setErr(r.status === 403 ? 'Doar conducerea.' : 'Eroare.'); return; }
    const d = await r.json();
    setMembers(d.members ?? []); setErr('');
  }, []);
  useEffect(() => { load(); }, [load]);

  async function makeInvite() {
    setBusy(true); setInviteLink('');
    const r = await api('/invite', { method: 'POST', body: JSON.stringify({ point: invitePoint }) });
    setBusy(false);
    if (!r.ok) { setErr('Eroare la generarea linkului.'); return; }
    const d = await r.json(); setInviteLink(d.link); setErr('');
  }

  return (
    <div>
      <button onClick={() => router.back()} style={back}>← Înapoi</button>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, margin: '6px 0 4px' }}>Echipa</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
        Pune numele fiecăruia — apare la alegerea executorului. «Digital» = doar sarcini, fără curse.
      </div>

      {err && <p style={{ color: C.bad, fontSize: 13 }}>{err}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {members.map((m) => (
          <MemberRow key={m.id} m={m} busy={busy} setBusy={setBusy} setErr={setErr} reload={load} />
        ))}
      </div>

      {/* Adaugă membru nou */}
      <div style={{ marginTop: 20, padding: 12, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Adaugă membru nou</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={invitePoint} onChange={(e) => setInvitePoint(e.target.value)} style={{ ...input, flex: 1 }}>
            <option value="CHISINAU">Chișinău</option>
            <option value="BALTI">Bălți</option>
          </select>
          <button onClick={makeInvite} disabled={busy} style={primary}>Generează link</button>
        </div>
        {inviteLink && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
              Trimite acest link persoanei. După ce intră, apare aici — pune-i numele și rolul «Digital» dacă lucrează doar la sarcini.
            </div>
            <div onClick={() => navigator.clipboard?.writeText(inviteLink)}
              style={{ fontSize: 12, color: C.accent, wordBreak: 'break-all', padding: '8px 10px', background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer' }}>
              {inviteLink}<div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>(apasă ca să copiezi)</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MemberRow({ m, busy, setBusy, setErr, reload }: {
  m: Member; busy: boolean; setBusy: (b: boolean) => void; setErr: (s: string) => void; reload: () => Promise<void>;
}) {
  const [name, setName] = useState(m.name ?? '');
  const [role, setRole] = useState(m.role);
  const isAdmin = m.role === 'ADMIN';
  const dirty = name !== (m.name ?? '') || role !== m.role;

  async function save() {
    setBusy(true);
    const body: Record<string, unknown> = { id: m.id, name };
    if (!isAdmin) body.role = role;
    const r = await api('/team', { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Eroare'); return; }
    setErr(''); await reload();
  }

  return (
    <div style={{ padding: 10, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="nume" style={{ ...input, flex: 1 }} />
        {!isAdmin && (
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...input, width: 110 }}>
            <option value="CONTROLLER">Controlor</option>
            <option value="DIGITAL">Digital</option>
          </select>
        )}
        {isAdmin && <span style={{ fontSize: 11, color: C.muted, width: 110, textAlign: 'center' }}>Conducere</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 11, color: C.muted }}>
          {m.username ? `@${m.username}` : '—'} · {m.point ?? ''} · id {m.telegram_id}
        </span>
        {dirty && <button onClick={save} disabled={busy} style={{ ...primary, padding: '5px 12px', fontSize: 12 }}>Salvează</button>}
      </div>
    </div>
  );
}

const back: React.CSSProperties = { background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', padding: 0 };
const input: React.CSSProperties = { boxSizing: 'border-box', background: '#fff', border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: '8px 10px', fontSize: 16 };
const primary: React.CSSProperties = { background: C.accent, color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 12px', borderRadius: 4, border: 'none', cursor: 'pointer' };
