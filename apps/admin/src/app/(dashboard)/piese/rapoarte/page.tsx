export const dynamic = 'force-dynamic';

import { costPerVehicle, overconsumption, reliability, illiquid, movementLedger } from '@/lib/piese-ops';
import { lowStock } from '@/lib/piese';
import { verifySession } from '@/lib/auth';
import { canSeeCost } from '@/lib/piese-access';

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
const km = (n: number) => Number(n || 0).toLocaleString('ro-RO') + ' km';
const dt = (s: string) => s ? new Date(s).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const MOV: Record<string, string> = { RECEIPT: 'Prihod', ISSUE: 'Rashod', TRANSFER_OUT: 'Mutare ieș.', TRANSFER_IN: 'Mutare intr.', SALE: 'Vânzare', ADJUST_PLUS: 'Inventar +', ADJUST_MINUS: 'Inventar −', RETURN_SUPPLIER: 'Retur', WRITE_OFF: 'Spisanie', DONOR_IN: 'Donor', STORNO: 'Storno' };

export default async function RapoartePage() {
  const [costs, over, reli, low, dead, ledger] = await Promise.all([
    costPerVehicle(12), overconsumption(), reliability(), lowStock(), illiquid(), movementLedger(40),
  ]);
  return (
    <>
      <div className="page-header"><h1>Rapoarte</h1><p>Analiza economică din interviuri: cost pe mașină, перерасход, fiabilitate producători, de comandat, неликвид, jurnal.</p></div>
      <div className="grid cols-2">
        <div className="card">
          <h2>Top mașini după cost piese</h2>
          <table>
            <thead><tr><th>Mașina</th><th className="num">Reparații</th><th className="num">Cost</th><th className="num">Cost/1000km</th></tr></thead>
            <tbody>
              {(costs as any[]).map((c) => (
                <tr key={c.vehicle_id}><td><strong>{c.plate}</strong> <span className="muted">{c.model}</span></td><td className="num">{c.issues}</td><td className="num">{lei(c.total_cost)}</td><td className="num">{c.km_current ? lei((c.total_cost / c.km_current) * 1000) : '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>⚠ Перерасход (aceeași piesă, prea des)</h2>
          {(over as any[]).length === 0 ? <div className="empty">Nimic anormal.</div> : (
            <table>
              <thead><tr><th>Mașina</th><th>Grup</th><th className="num">De câte ori</th><th className="num">Cost</th></tr></thead>
              <tbody>{(over as any[]).map((o, i) => (<tr key={i}><td>{o.plate}</td><td>{o.group_name}</td><td className="num"><span className="badge warn">{o.times}×</span></td><td className="num">{lei(o.cost)}</td></tr>))}</tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>Fiabilitate pe producători</h2>
          {(reli as any[]).length === 0 ? <div className="empty">Date insuficiente încă.</div> : (
            <table>
              <thead><tr><th>Producător</th><th className="num">Mostre</th><th className="num">Rezistă în medie</th></tr></thead>
              <tbody>{(reli as any[]).map((r, i) => (<tr key={i}><td><strong>{r.manufacturer}</strong></td><td className="num">{r.samples}</td><td className="num">{km(r.avg_km)}</td></tr>))}</tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>De comandat (stoc minim)</h2>
          {(low as any[]).length === 0 ? <div className="empty">Nimic sub minim.</div> : (
            <table>
              <thead><tr><th>Piesă</th><th>Depozit</th><th className="num">Stoc</th><th className="num">Min</th></tr></thead>
              <tbody>{(low as any[]).map((r, i) => (<tr key={i}><td>{r.group_name}<br /><span className="muted">{r.name_long}</span></td><td>{r.warehouse_name}</td><td className="num"><span className="badge warn">{r.qty}</span></td><td className="num">{r.min_qty}</td></tr>))}</tbody>
            </table>
          )}
        </div>
      </div>
      <div className="card">
        <h2>Неликвид — fără mișcare de mult</h2>
        {(dead as any[]).length === 0 ? <div className="empty">Nimic blocat.</div> : (
          <table>
            <thead><tr><th>Piesă</th><th>Depozit</th><th className="num">Stoc</th><th>Ultima mișcare</th></tr></thead>
            <tbody>{(dead as any[]).map((r, i) => (<tr key={i}><td>{r.group_name}<br /><span className="muted">{r.name_long}</span></td><td>{r.warehouse_name}</td><td className="num">{r.qty}</td><td className="muted">{r.last_move ? dt(r.last_move) : 'niciodată'}</td></tr>))}</tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h2>Mișcarea stocului (jurnal)</h2>
        <table>
          <thead><tr><th>Data</th><th>Tip</th><th>Piesă</th><th>Depozit</th><th>Mașina</th><th className="num">Cant.</th><th className="num">Cost</th></tr></thead>
          <tbody>
            {(ledger as any[]).map((m) => (
              <tr key={m.id}><td className="muted">{dt(m.created_at)}</td><td>{MOV[m.movement_type] || m.movement_type}</td><td>{m.group_name} <span className="muted">{m.name_long}</span></td><td>{m.warehouse_name}</td><td className="muted">{m.vehicle_plate || '—'}</td><td className="num">{m.qty_delta > 0 ? '+' : ''}{m.qty_delta}</td><td className="num">{lei(m.unit_cost)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
