'use client';

import { useState } from 'react';

interface Item { partId: number; group: string; name: string; shelf: string; cell: string; qty: number }
interface Rack { rack: string; items: Item[]; types: number }
interface Section { section: string; racks: Rack[]; types: number }
interface Layout { sections: Section[]; totalTypes: number }

export default function PieseDepotMap({ layout, highlight, highlightSection, highlightRacks }: {
  layout: Layout; highlight?: { section: string; rack: string } | null; highlightSection?: string | null;
  // Mai multe rânduri deodată — folosit când se caută o GRUPĂ întreagă, nu o singură piesă.
  highlightRacks?: { section: string; rack: string }[];
}) {
  const [sel, setSel] = useState<{ section: string; rack: string } | null>(null);
  const rackSet = new Set((highlightRacks || []).map((r) => `${r.section}|${r.rack}`));
  const active = sel || (highlight ?? null);
  const selRack = active ? layout.sections.find((s) => s.section === active.section)?.racks.find((r) => r.rack === active.rack) : null;

  if (!layout.sections.length) return <div className="empty">Acest depozit nu are încă locații definite (stelaj/rând).</div>;

  return (
    <div>
      <div className="depot-map">
        {layout.sections.map((s) => {
          const secHot = highlightSection === s.section || (highlight?.section === s.section)
            || (highlightRacks || []).some((r) => r.section === s.section);
          return (
            <div key={s.section} className={`depot-section${secHot ? ' hot' : ''}`}>
              <div className="depot-section-head"><span className="sec-badge">{s.section}</span> Stelajul {s.section} <span className="muted">· {s.types} piese</span></div>
              <div className="depot-racks">
                {s.racks.map((r) => {
                  const hot = (active?.section === s.section && active?.rack === r.rack) || rackSet.has(`${s.section}|${r.rack}`);
                  const isSel = sel?.section === s.section && sel?.rack === r.rack;
                  return (
                    <button key={r.rack} type="button" className={`depot-rack${hot ? ' hot' : ''}${isSel ? ' sel' : ''}${r.types === 0 ? ' empty' : ''}`}
                      onClick={() => setSel(isSel ? null : { section: s.section, rack: r.rack })} title={`Rândul ${s.section}-${r.rack} · ${r.types} piese`}>
                      <span className="rk">{r.rack}</span><span className="rk-n">{r.types}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="depot-legend">
        <span><i className="lg lg-norm" /> rând cu piese</span>
        <span><i className="lg lg-empty" /> gol</span>
        <span><i className="lg lg-hot" /> evidențiat (piesa căutată / stelajul de azi)</span>
        <span className="muted">apasă un rând pentru conținut</span>
      </div>
      {selRack && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Rândul {active!.section}-{active!.rack} — ce se află aici</h2>
          {selRack.items.length === 0 ? <div className="empty">Rând gol.</div> : (
            <table>
              <thead><tr><th>Poliță</th><th>Celulă</th><th>Grup</th><th>Piesă</th><th className="num">Stoc</th></tr></thead>
              <tbody>
                {selRack.items.map((it, i) => (
                  <tr key={i}>
                    <td><span className="badge gray">{it.shelf || '—'}</span></td>
                    {/* Celula lipsește la piesele puse pe raft înainte de al patrulea nivel — nu e o eroare. */}
                    <td>{it.cell ? <span className="badge gray">{it.cell}</span> : <span className="muted">—</span>}</td>
                    <td><strong>{it.group}</strong></td><td className="muted">{it.name}</td><td className="num">{it.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
