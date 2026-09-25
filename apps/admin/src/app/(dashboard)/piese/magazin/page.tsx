export const dynamic = 'force-dynamic';

import { listWarehouses } from '@/lib/piese';
import { listClients, saleParts, shopProfit, preturiSchimbate } from '@/lib/piese-ops';
import { requirePieseIssue, canSeeCost } from '@/lib/piese-access';
import MagazinClient from './MagazinClient';

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
const partLabel = (p: any) => `${p.grp} — ${p.manufacturer ?? ''} ${p.model ? '(' + p.model + ')' : ''}`.trim();

export default async function MagazinPage() {
  const session = await requirePieseIssue();
  const showCost = canSeeCost(session.role); // vânzătorul vede vânzările, dar nu costul/profitul (marja)
  const [warehouses, clients, parts, profit, preturi] = await Promise.all([listWarehouses(), listClients(), saleParts(), shopProfit(), preturiSchimbate(7)]);
  const shop = (warehouses as any[]).find((w) => w.kind === 'SHOP');
  return (
    <>
      <div className="page-header"><h1>Magazin — vânzări piese</h1><p>Prețul urcă singur când vine marfă mai scumpă și se aplică întregului stoc; când vine mai ieftină, rămâne cel vechi. La confirmare se emite чек; factura fiscală se generează în tab-ul e-Factura.</p></div>
      <div className={`grid ${showCost ? 'cols-3' : 'cols-1'}`} style={{ marginBottom: 16 }}>
        <div className="stat"><div className="v">{lei(profit.revenue)}</div><div className="l">Vânzări (oborot)</div></div>
        {showCost && <div className="stat"><div className="v">{lei(profit.cost)}</div><div className="l">Cost (sebestoimost)</div></div>}
        {showCost && <div className="stat"><div className="v">{lei(profit.profit)}</div><div className="l">Profit magazin</div></div>}
      </div>
      {preturi.length > 0 && (
        <div className="alert warn" style={{ marginBottom: 16 }}>
          <strong>
            {preturi.length === 1
              ? 'La o piesă s-a schimbat prețul în ultimele 7 zile — retipărește eticheta'
              : `La ${preturi.length} piese s-a schimbat prețul în ultimele 7 zile — retipărește etichetele`}
          </strong>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
            Prețul a urcat singur, la recepția unei mărfi mai scumpe. Eticheta de pe raft a rămas cea veche.
          </p>
          <table>
            <thead><tr><th>Piesa</th><th style={{ width: 110 }}>Articol</th><th style={{ width: 110 }}>Vechi</th><th style={{ width: 110 }}>Nou</th><th style={{ width: 100 }}>Când</th></tr></thead>
            <tbody>
              {preturi.map((x) => (
                <tr key={`${x.part_id}-${x.ziua}-${x.pret_nou}`}>
                  <td>{x.nume}</td>
                  <td>{x.articol || <span className="muted">—</span>}</td>
                  <td className="muted">{x.pret_vechi == null ? '—' : lei(x.pret_vechi)}</td>
                  <td><strong>{lei(x.pret_nou)}</strong></td>
                  <td>{new Date(x.ziua).toLocaleDateString('ro-RO')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shop ? (
        <MagazinClient shopId={shop.id} clients={(clients as any[]).map((c) => ({ id: c.id, label: c.name }))} parts={(parts as any[]).map((p) => ({ id: p.id, label: partLabel(p), price: Number(p.price) }))} />
      ) : <div className="card"><div className="empty">Niciun depozit-magazin definit.</div></div>}
    </>
  );
}
