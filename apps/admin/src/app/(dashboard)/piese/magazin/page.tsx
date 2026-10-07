export const dynamic = 'force-dynamic';

import { listWarehouses, partLabel } from '@/lib/piese';
import { listClients, saleParts, shopProfit, preturiSchimbate, raportZi } from '@/lib/piese-ops';
import { requirePieseIssue, canSeeCost, canOverrideStock } from '@/lib/piese-access';
import MagazinClient from './MagazinClient';

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
// Eticheta e cea COMUNĂ (`partLabel` din lib/piese), ca peste tot. Aici exista o variantă locală care
// construia textul din GRUPĂ și marcă — fără denumirea piesei. Vânzătorul vedea în listă „Кузов и ЛКМ —
// Taclar (312)" pentru o mână de ușă: categoria, nu marfa. Cu 84 de poziții în câteva categorii, alegerea
// era ghicitoare, iar căutarea după cod sau cod de bare nu găsea nimic, fiindcă filtrul se uită la
// etichetă. Vederea `piese_sale_parts` nici nu întorcea denumirea — acum o întoarce (migr. 394).

export default async function MagazinPage() {
  const session = await requirePieseIssue();
  const showCost = canSeeCost(session.role); // vânzătorul vede vânzările, dar nu costul/profitul (marja)
  const [warehouses, clients, parts, profit, preturi] = await Promise.all([listWarehouses(), listClients(), saleParts(), shopProfit(), preturiSchimbate(7)]);
  const shop = (warehouses as any[]).find((w) => w.kind === 'SHOP');
  // Raportul de zi se citește DUPĂ ce se știe magazinul — altfel n-am ști pentru ce depozit.
  const azi = shop ? await raportZi(shop.id) : [];
  const totalAzi = azi.reduce((s, r) => s + Number(r.suma), 0);
  return (
    <>
      <div className="page-header"><h1>Magazin — vânzări piese</h1><p>Prețul urcă singur când vine marfă mai scumpă și se aplică întregului stoc; când vine mai ieftină, rămâne cel vechi. La confirmare se emite чек; factura fiscală se generează în tab-ul e-Factura.</p></div>
      <div className={`grid ${showCost ? 'cols-3' : 'cols-1'}`} style={{ marginBottom: 16 }}>
        <div className="stat"><div className="v">{lei(profit.revenue)}</div><div className="l">Vânzări (oborot)</div></div>
        {showCost && <div className="stat"><div className="v">{lei(profit.cost)}</div><div className="l">Cost (sebestoimost)</div></div>}
        {showCost && <div className="stat"><div className="v">{lei(profit.profit)}</div><div className="l">Profit magazin</div></div>}
      </div>
      {/* Perechea raportului Z de pe casa de marcat. La sfârșitul zilei, cifrele de aici trebuie să se
          potrivească cu banda fiscală — iar nepotrivirea dintre ele e exact ce caută un control. */}
      {azi.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Astăzi în magazin</h2>
          <table>
            <thead><tr><th>Plata</th><th className="num" style={{ width: 90 }}>Bonuri</th><th className="num" style={{ width: 140 }}>Sumă</th></tr></thead>
            <tbody>
              {azi.map((r) => (
                <tr key={r.plata}>
                  <td>{r.plata === 'NUMERAR' ? 'Numerar' : r.plata === 'CARD' ? 'Card' : r.plata === 'TRANSFER' ? 'Transfer' : r.plata}</td>
                  <td className="num">{r.bonuri}</td>
                  <td className="num">{lei(r.suma)}</td>
                </tr>
              ))}
              <tr><td><strong>Total</strong></td>
                <td className="num"><strong>{azi.reduce((s, r) => s + Number(r.bonuri), 0)}</strong></td>
                <td className="num"><strong>{lei(totalAzi)}</strong></td></tr>
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 11, margin: '6px 0 0' }}>
            De pus alături de raportul Z de pe casa de marcat, la închiderea zilei.
          </p>
        </div>
      )}

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
        <MagazinClient canOverrideStock={await canOverrideStock(session)} shopId={shop.id} clients={(clients as any[]).map((c) => ({ id: c.id, label: c.name }))} parts={(parts as any[]).map((p) => ({
          id: p.id, label: partLabel(p), price: Number(p.price),
          // Ce se CAUTĂ, pe lângă ce se vede: articul, OEM și TOATE codurile de bare. Lista magazinului
          // n-avea nici măcar denumirea (vederea întorcea doar grupa, marca și prețul), deci eticheta ieșea
          // „— Taclar (312)", iar scanarea unui cod nu găsea nimic — exact reclamația lui Eduard.
          search: [partLabel(p), p.article_code, p.oem_code, p.barcodes_all].filter(Boolean).join(' '),
        }))} />
      ) : <div className="card"><div className="empty">Niciun depozit-magazin definit.</div></div>}
    </>
  );
}
