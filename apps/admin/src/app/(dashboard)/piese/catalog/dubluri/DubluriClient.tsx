'use client';

import { useState, useMemo } from 'react';
import { uneste, incarcaDubluri } from './actions';

type Rand = {
  cheie: string; fel: string; part_id: number; nume: string; articol: string; oem: string;
  producator: string; model: string; grupa: string; coduri: string;
  stoc: number; miscari: number; completare: number; sugerat: boolean;
};

export default function DubluriClient({ randuri }: { randuri: Rand[] }) {
  const [rows, setRows] = useState<Rand[]>(randuri);
  const [ales, setAles] = useState<Record<string, number>>(
    // Pornim de la sugestie, ca omul să confirme, nu să aleagă de la zero de 164 de ori.
    () => Object.fromEntries(randuri.filter((r) => r.sugerat).map((r) => [r.cheie, r.part_id])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gata, setGata] = useState<string[]>([]);

  const grupuri = useMemo(() => {
    const m = new Map<string, Rand[]>();
    for (const r of rows) (m.get(r.cheie) ?? m.set(r.cheie, []).get(r.cheie)!).push(r);
    return [...m.entries()].filter(([k]) => !gata.includes(k));
  }, [rows, gata]);

  async function fa(cheie: string, membri: Rand[]) {
    const keep = ales[cheie];
    if (!keep) { setErr('Alege piesa care rămâne.'); return; }
    const drop = membri.filter((m) => m.part_id !== keep).map((m) => m.part_id);
    setBusy(cheie); setErr(null);
    try {
      await uneste(keep, drop);
      setGata((g) => [...g, cheie]);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  }

  async function reincarca() {
    setBusy('*'); setErr(null);
    try {
      const noi = await incarcaDubluri() as Rand[];
      setRows(noi); setGata([]);
      setAles(Object.fromEntries(noi.filter((r) => r.sugerat).map((r) => [r.cheie, r.part_id])));
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  }

  if (!grupuri.length) {
    return (
      <div className="card">
        <div className="empty">
          {gata.length ? `Gata — ${gata.length} ${gata.length === 1 ? 'grup unit' : 'grupuri unite'}. Nu mai sunt dubluri de rezolvat aici.` : 'Nicio dublură în catalog.'}
        </div>
        <button className="btn" onClick={reincarca} disabled={busy !== null}>Reîncarcă lista</button>
      </div>
    );
  }

  return (
    <>
      {err && <div className="alert error" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong>{grupuri.length} {grupuri.length === 1 ? 'grup de rezolvat' : 'grupuri de rezolvat'}</strong>
        {gata.length > 0 && <span className="muted">{gata.length} unite în sesiunea asta</span>}
      </div>

      {grupuri.map(([cheie, membri]) => (
        <div className="card" key={cheie} style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Articol <code>{membri[0].articol}</code></h3>
            <button className="btn btn-primary" disabled={busy !== null} onClick={() => fa(cheie, membri)}>
              {busy === cheie ? 'Se unește…' : `Unește (păstrez #${ales[cheie] ?? '?'})`}
            </button>
          </div>
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ width: 70 }}>Păstrez</th>
                <th>Denumire</th>
                <th style={{ width: 110 }}>OEM</th>
                <th style={{ width: 110 }}>Producător</th>
                <th style={{ width: 170 }}>Coduri de bare</th>
                <th style={{ width: 70 }}>Stoc</th>
                <th style={{ width: 80 }}>Mișcări</th>
              </tr>
            </thead>
            <tbody>
              {membri.map((m) => {
                const blocat = m.miscari > 0;
                return (
                  <tr key={m.part_id} style={ales[cheie] === m.part_id ? { background: 'rgba(0,170,119,0.08)' } : undefined}>
                    <td>
                      <input type="radio" name={`k-${cheie}`} checked={ales[cheie] === m.part_id}
                        aria-label={`Păstrez ${m.nume}`}
                        onChange={() => setAles((a) => ({ ...a, [cheie]: m.part_id }))} />
                    </td>
                    <td>
                      {m.nume} <span className="muted">#{m.part_id}</span>
                      {m.sugerat && <span className="badge" style={{ marginLeft: 6 }}>sugerat</span>}
                      {/* Piesa cu mișcări NU poate fi desființată — mișcările de stoc nu se mută între
                          piese. Se spune aici, nu la apăsare, ca omul să aleagă din prima corect. */}
                      {blocat && <div className="muted" style={{ fontSize: 11 }}>are istoric — doar ea poate fi păstrată</div>}
                    </td>
                    <td>{m.oem || <span className="muted">—</span>}</td>
                    <td>{m.producator || <span className="muted">—</span>}</td>
                    <td style={{ fontSize: 12 }}>{m.coduri || <span className="muted">fără cod</span>}</td>
                    <td>{Number(m.stoc).toLocaleString('ro-RO')}</td>
                    <td>{m.miscari}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
