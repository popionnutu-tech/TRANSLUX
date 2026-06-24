export const dynamic = 'force-dynamic';

import { dashboardStats, lowStock, recentDocs } from '@/lib/piese';

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
const DOC: Record<string, string> = { RECEIPT: 'Prihod', ISSUE: 'Rashod', TRANSFER: 'Mutare', SALE: 'Vânzare', INVENTORY: 'Inventariere', RETURN_SUPPLIER: 'Retur', WRITE_OFF: 'Spisanie', DONOR: 'Donor' };

export default async function PieseDashboard() {
  const [s, low, recent] = await Promise.all([dashboardStats(), lowStock(), recentDocs(8)]);
  return (
    <>
      <div className="page-header">
        <h1>Depozit &amp; piese — tablou de bord</h1>
        <p>Modul integrat în central-hub. Stocul se calculează din jurnalul de mișcări (FIFO), nu din cifre scrise de mână.</p>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="stat"><div className="v">{s.parts}</div><div className="l">Denumiri piese</div></div>
        <div className="stat"><div className="v">{s.vehicles}</div><div className="l">Mașini în parc</div></div>
        <div className="stat"><div className="v">{lei(s.stockValue)}</div><div className="l">Valoare stoc (FIFO)</div></div>
        <div className="stat"><div className="v">{s.movements}</div><div className="l">Mișcări în jurnal</div></div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>De comandat (stoc minim atins)</h2>
          {(low as any[]).length === 0 ? <div className="empty">Nimic sub minim.</div> : (
            <table>
              <thead><tr><th>Piesă</th><th>Depozit</th><th className="num">Stoc</th><th className="num">Min</th></tr></thead>
              <tbody>
                {(low as any[]).slice(0, 8).map((r, i) => (
                  <tr key={i}><td>{r.group_name}<br /><span className="muted">{r.name_long}</span></td><td>{r.warehouse_name}</td><td className="num"><span className="badge warn">{r.qty}</span></td><td className="num">{r.min_qty}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>Ultimele documente</h2>
          <table>
            <thead><tr><th>Tip</th><th>Depozit</th><th className="num">Poziții</th><th>Status</th></tr></thead>
            <tbody>
              {(recent as any[]).map((d) => (
                <tr key={d.id}>
                  <td>{DOC[d.doc_type] || d.doc_type}</td>
                  <td>{d.warehouse_name}{d.to_warehouse_name ? ` → ${d.to_warehouse_name}` : ''}</td>
                  <td className="num">{d.line_count}</td>
                  <td><span className={`badge ${d.status === 'CONFIRMED' ? 'ok' : d.status === 'IN_TRANSIT' ? 'info' : 'gray'}`}>{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
