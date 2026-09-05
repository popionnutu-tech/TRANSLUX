'use client';

import { useState, useEffect, useCallback } from 'react';
import { loadLookupAdmin, renameLookupEntry, toggleLookupActive } from './actions';

type Row = { id: number; name: string; active: boolean; partsCount: number };

// Curățarea nomenclatoarelor de producători / mărci (migr. 312 + 317).
//
// De ce există: migrația a preluat și ce era deja scris greșit — „111", „Scoda Octavia 2020", „HIGER NOU".
// Fără un loc unde să fie corectate, greșelile au fost doar promovate din câmp liber în sugestii oficiale.
// Un catalog în care se poate DOAR adăuga se murdărește la fiecare tastare greșită.
//
// Nu există ștergere: o intrare folosită de piese n-are ce să dispară. Se redenumește (și piesele o
// urmează) sau se dezactivează (rămâne pe piese, dar nu se mai propune).
export default function LookupManager({ kind, title, hint }: { kind: 'manufacturer' | 'carModel'; title: string; hint: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { setRows(await loadLookupAdmin(kind) as Row[]); setErr(''); }
    catch (e: any) { setRows([]); setErr(e?.message || 'Nu am putut încărca lista'); }
  }, [kind]);

  useEffect(() => { load(); }, [load]);

  // Contopirea e IREVERSIBILĂ: piesele se rescriu, iar intrarea veche dispare. Fără pasul ăsta, o tastare
  // greșită urmată de Enter putea rescrie zeci de rânduri fără ca nimeni să vadă ce urmează să se întâmple.
  // Ținta se caută în lista deja încărcată, deci confirmarea arată cifre reale, nu presupuneri.
  const mergeTarget = (v: string, self: Row) =>
    (rows || []).find((x) => x.id !== self.id && x.name.toLowerCase() === v.trim().toLowerCase()) || null;

  async function save(r: Row) {
    const v = editVal.trim();
    if (!v || v === r.name) { setEditId(null); return; }
    const target = mergeTarget(v, r);
    if (target && !confirm(
      `Contopire, nu redenumire.\n\n` +
      `„${r.name}" (${r.partsCount} ${r.partsCount === 1 ? 'piesă' : 'piese'}) intră în „${target.name}" ` +
      `(${target.partsCount} ${target.partsCount === 1 ? 'piesă' : 'piese'}).\n\n` +
      `Piesele se mută, iar „${r.name}" dispare din nomenclator. Operațiunea nu se poate anula.`,
    )) return;
    setBusy(r.id); setErr(''); setMsg('');
    try {
      const res = await renameLookupEntry(kind, r.id, v);
      // Mesajul spune EXPLICIT câte piese s-au mutat: e o modificare în masă, iar omul trebuie să vadă
      // dacă a atins 1 piesă sau 300 înainte să continue.
      setMsg(res.merged
        ? `„${res.old}" a fost contopit în „${res.next}" — ${res.moved} ${res.moved === 1 ? 'piesă mutată' : 'piese mutate'}.`
        : `Redenumit „${res.old}" → „${res.next}" — ${res.moved} ${res.moved === 1 ? 'piesă actualizată' : 'piese actualizate'}.`);
      setEditId(null);
      await load();
    } catch (e: any) { setErr(e?.message || 'Nu am putut redenumi'); }
    finally { setBusy(null); }
  }

  async function toggle(r: Row) {
    setBusy(r.id); setErr(''); setMsg('');
    try {
      await toggleLookupActive(kind, r.id, !r.active);
      setMsg(r.active ? `„${r.name}" nu se mai propune la introducere.` : `„${r.name}" se propune din nou.`);
      await load();
    } catch (e: any) { setErr(e?.message || 'Nu am putut schimba starea'); }
    finally { setBusy(null); }
  }

  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="muted" style={{ marginTop: -6 }}>{hint}</p>

      {err && <div className="alert danger">{err}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      {rows === null ? <div className="muted">Se încarcă…</div>
        : rows.length === 0 ? <div className="empty">Nicio intrare încă.</div> : (
        <table>
          <thead>
            <tr>
              <th>Denumire</th>
              <th className="num" style={{ width: 90 }}>Piese</th>
              <th style={{ width: 110 }}>Stare</th>
              <th style={{ width: 210 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={r.active ? undefined : { opacity: 0.55 }}>
                <td>
                  {editId === r.id ? (
                    <input value={editVal} autoFocus
                      onChange={(e) => setEditVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); save(r); }
                        if (e.key === 'Escape') setEditId(null);
                      }} />
                  ) : <strong>{r.name}</strong>}
                </td>
                {/* Cifra e cea care face decizia posibilă: „111 — 1 piesă" față de „TRW — 11 piese". */}
                <td className="num">{r.partsCount}</td>
                <td>
                  {r.active
                    ? <span className="badge ok">se propune</span>
                    : <span className="badge gray">ascuns</span>}
                </td>
                <td>
                  {editId === r.id ? (
                    <>
                      <button type="button" className="btn btn-primary" style={{ padding: '3px 9px' }}
                        disabled={busy === r.id} onClick={() => save(r)}>
                        {busy === r.id ? 'Se salvează…' : 'Salvează'}
                      </button>{' '}
                      <button type="button" className="btn" style={{ padding: '3px 9px' }}
                        disabled={busy === r.id} onClick={() => setEditId(null)}>Renunță</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn" style={{ padding: '3px 9px' }}
                        disabled={busy !== null}
                        onClick={() => { setEditId(r.id); setEditVal(r.name); setMsg(''); setErr(''); }}
                        title="Corectează denumirea — piesele o urmează">Redenumește</button>{' '}
                      <button type="button" className="btn" style={{ padding: '3px 9px' }}
                        disabled={busy !== null} onClick={() => toggle(r)}
                        title={r.active ? 'Nu se mai propune la introducere; rămâne pe piesele existente' : 'Se propune din nou'}>
                        {r.active ? 'Ascunde' : 'Arată'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editId !== null && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Dacă scrii o denumire care <strong>există deja</strong>, cele două se contopesc: piesele trec pe
          intrarea existentă, iar aceasta dispare. Așa se unesc variantele aceluiași nume („Trw" în „TRW").
          Înainte de contopire se cere confirmare, cu numărul de piese al fiecăreia.
        </p>
      )}
    </div>
  );
}
