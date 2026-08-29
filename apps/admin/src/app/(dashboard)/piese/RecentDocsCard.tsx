'use client';

import { Fragment, useState } from 'react';
import { loadDocLines } from './doc-actions';

type Doc = { id: number; doc_type: string; status: string; created_at: string; warehouse_name: string | null; to_warehouse_name: string | null; line_count: number };
type DLine = { partId: number; name: string; article: string | null; qty: number; unitCost: number | null };
type DBody = { rows: DLine[]; truncated: boolean };

const DOC: Record<string, string> = { RECEIPT: 'Prihod', ISSUE: 'Rashod', TRANSFER: 'Mutare', SALE: 'Vânzare', INVENTORY: 'Inventariere', RETURN_SUPPLIER: 'Retur', WRITE_OFF: 'Spisanie', DONOR: 'Donor' };
const dt = (s: string) => new Date(s).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';

// „Ultimele documente" cu extindere pe rând — cerut de Eduard: lista arăta doar tipul și numărul de poziții,
// deci nu puteai vedea CE conține un document fără să-l cauți în ecranul lui.
// Liniile se încarcă la click (nu în lot), fiindcă tabloul se deschide des și rar are nevoie de toate.
export default function RecentDocsCard({ docs, showCost }: { docs: Doc[]; showCost: boolean }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [lines, setLines] = useState<Record<number, DBody | 'loading' | 'error'>>({});

  async function toggle(id: number) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!lines[id] || lines[id] === 'error') {
      setLines((m) => ({ ...m, [id]: 'loading' }));
      try {
        const rows = await loadDocLines(id);
        setLines((m) => ({ ...m, [id]: rows }));
      } catch {
        setLines((m) => ({ ...m, [id]: 'error' }));
      }
    }
  }

  return (
    <div className="card">
      <h2>Ultimele documente</h2>
      {docs.length === 0 ? <div className="empty">Niciun document încă.</div> : (
        <table>
          <thead><tr><th>Tip</th><th>Depozit</th><th className="num">Poziții</th><th>Status</th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <Fragment key={d.id}>
                <tr onClick={() => toggle(d.id)} style={{ cursor: 'pointer' }} title="Apasă ca să vezi poziţiile">
                  <td>{DOC[d.doc_type] || d.doc_type}<div className="muted" style={{ fontSize: 11 }}>{dt(d.created_at)}</div></td>
                  <td>{d.warehouse_name}{d.to_warehouse_name ? ` → ${d.to_warehouse_name}` : ''}</td>
                  <td className="num">{openId === d.id ? '▾' : '▸'} {d.line_count}</td>
                  <td><span className={`badge ${d.status === 'CONFIRMED' ? 'ok' : d.status === 'IN_TRANSIT' ? 'info' : 'gray'}`}>{d.status}</span></td>
                </tr>
                {openId === d.id && (
                  <tr>
                    <td colSpan={4} style={{ padding: 0 }}>
                      <div style={{ padding: '10px 14px', borderLeft: '4px solid var(--accent, #0d5c4d)' }}>
                        {lines[d.id] === 'loading' && <span className="muted">Se încarcă…</span>}
                        {lines[d.id] === 'error' && <span className="muted">Nu am putut încărca poziţiile. Apasă din nou.</span>}
                        {typeof lines[d.id] === 'object' && ((lines[d.id] as DBody).rows.length === 0
                          ? <span className="muted">Fără poziţii.</span>
                          : (
                            <>
                              <table>
                                <thead><tr><th>Piesă</th><th className="num">Cant.</th>{showCost && <th className="num">Cost unitar</th>}</tr></thead>
                                <tbody>
                                  {(lines[d.id] as DBody).rows.map((l, i) => (
                                    <tr key={`${l.partId}-${i}`}>
                                      <td>{l.name}{l.article && <span className="muted"> · {l.article}</span>}</td>
                                      {/* Semnul se PĂSTREAZĂ: la inventariere, −3 înseamnă LIPSĂ, nu „trei bucăți". */}
                                      <td className="num" style={l.qty < 0 ? { color: 'var(--danger, #c0392b)' } : undefined}>
                                        {l.qty > 0 && d.doc_type === 'INVENTORY' ? '+' : ''}{l.qty}
                                      </td>
                                      {showCost && <td className="num">{l.unitCost == null ? '—' : lei(l.unitCost)}</td>}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {(lines[d.id] as DBody).truncated && (
                                <p className="muted" style={{ marginTop: 6, marginBottom: 0, fontSize: 12 }}>
                                  Se afișează primele {(lines[d.id] as DBody).rows.length} poziţii din {d.line_count}.
                                </p>
                              )}
                            </>
                          ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
