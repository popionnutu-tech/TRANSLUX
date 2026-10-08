export const dynamic = 'force-dynamic';

import { listWarehouses, listMechanics, getPartById } from '@/lib/piese';
import { warehousesForUser, userWarehouseId } from '@/lib/piese-access';
import { verifySession, requireRole } from '@/lib/auth';
import { asamblariRecente } from '@/lib/piese-asamblare';
import AsamblareClient from './AsamblareClient';

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function AsamblarePage() {
  // Aceleași roluri ca la Donor: operația creează marfă în stoc.
  const session = requireRole(await verifySession(), 'ADMIN', 'DEPOZITAR', 'GESTIONAR');
  const [warehouses, mechanics, recente] = await Promise.all([
    listWarehouses(), listMechanics(), asamblariRecente(15),
  ]);
  const permise = warehousesForUser(warehouses as any[], await userWarehouseId(session));
  const numeDepozit = new Map((warehouses as any[]).map((w) => [w.id, w.name as string]));
  // Denumirile produselor, pentru lista de jos. Citite pe rând — lista are 15 rânduri, nu merită un view.
  const produse = new Map<number, string>();
  for (const d of recente) {
    if (d.produs_part_id && !produse.has(d.produs_part_id)) {
      const p = (await getPartById(d.produs_part_id)) as any;
      produse.set(d.produs_part_id, p ? ((p.name_ro && String(p.name_ro).trim()) || p.name_long || `#${d.produs_part_id}`) : `#${d.produs_part_id}`);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Asamblare — din mai multe piese iese una</h1>
        <p>
          Se repară un motor: piesele se iau din depozitul-sursă, iar motorul reparat intră în cel de
          destinație, cu costul componentelor plus manopera. De acolo se montează pe autobuz, prin Rashod.
        </p>
      </div>

      <AsamblareClient
        warehouses={permise.map((w: any) => ({ id: w.id, label: w.name }))}
        mechanics={(mechanics as any[]).map((m) => ({ id: m.id, label: m.name }))}
      />

      {recente.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Asamblări recente</h2>
          <table>
            <thead><tr>
              <th style={{ width: 70 }}>Nr.</th><th style={{ width: 100 }}>Când</th>
              <th>A ieșit</th><th style={{ width: 70 }}>Buc.</th>
              <th>Din depozit</th><th>În depozit</th>
              <th style={{ width: 110 }} className="num">Manoperă</th>
            </tr></thead>
            <tbody>
              {recente.map((d) => (
                <tr key={d.id}>
                  <td>#{d.id}</td>
                  <td>{new Date(d.created_at).toLocaleDateString('ro-RO', { timeZone: 'Europe/Chisinau' })}</td>
                  <td>{produse.get(d.produs_part_id) || '—'}
                    {d.note ? <span className="muted"> · {d.note}</span> : null}</td>
                  <td>{Number(d.produs_qty || 0)}</td>
                  <td className="muted">{numeDepozit.get(d.warehouse_id) || '—'}</td>
                  <td className="muted">{numeDepozit.get(d.to_warehouse_id) || '—'}</td>
                  <td className="num">{d.manopera ? `${lei(d.manopera)} lei` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
