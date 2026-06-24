export const dynamic = 'force-dynamic';

import { listWarehouses } from '@/lib/piese';
import { listClients, saleParts, shopProfit } from '@/lib/piese-ops';
import { requirePieseIssue } from '@/lib/piese-access';
import MagazinClient from './MagazinClient';

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
const partLabel = (p: any) => `${p.grp} — ${p.manufacturer ?? ''} ${p.model ? '(' + p.model + ')' : ''}`.trim();

export default async function MagazinPage() {
  await requirePieseIssue();
  const [warehouses, clients, parts, profit] = await Promise.all([listWarehouses(), listClients(), saleParts(), shopProfit()]);
  const shop = (warehouses as any[]).find((w) => w.kind === 'SHOP');
  return (
    <>
      <div className="page-header"><h1>Magazin — vânzări piese</h1><p>Prețul se calculează automat din cost + наценка. La confirmare se emite чек; factura fiscală se generează în tab-ul e-Factura.</p></div>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="stat"><div className="v">{lei(profit.revenue)}</div><div className="l">Vânzări (oborot)</div></div>
        <div className="stat"><div className="v">{lei(profit.cost)}</div><div className="l">Cost (sebestoimost)</div></div>
        <div className="stat"><div className="v">{lei(profit.profit)}</div><div className="l">Profit magazin</div></div>
      </div>
      {shop ? (
        <MagazinClient shopId={shop.id} clients={(clients as any[]).map((c) => ({ id: c.id, label: c.name }))} parts={(parts as any[]).map((p) => ({ id: p.id, label: partLabel(p), price: Number(p.price) }))} />
      ) : <div className="card"><div className="empty">Niciun depozit-magazin definit.</div></div>}
    </>
  );
}
