export const dynamic = 'force-dynamic';

import { listWarehouses, listVehicles, listMechanics, listReasons } from '@/lib/piese';
import { requirePieseIssue, userWarehouseId, warehousesForUser } from '@/lib/piese-access';
import RashodClient from './RashodClient';

export default async function RashodPage() {
  const session = await requirePieseIssue();
  const [warehouses, vehicles, mechanics, reasons] = await Promise.all([
    listWarehouses(), listVehicles(), listMechanics(), listReasons(),
  ]);
  // Etapa 2: doar depozitele interne ȘI (dacă contul e legat) doar depozitul lui. Garda reală e pe server.
  const allowed = warehousesForUser(
    (warehouses as any[]).filter((w) => w.kind === 'INTERNAL'),
    await userWarehouseId(session),
  );
  return (
    <>
      <div className="page-header"><h1>Rashod — eliberare piesă</h1><p>Ecran simplu. La alegerea piesei și a mașinii, programul avertizează pe loc despre normă (km din GPS) și schimbări recente.</p></div>
      <RashodClient
        warehouses={allowed.map((w) => ({ id: w.id, label: w.name }))}
        vehicles={(vehicles as any[]).map((v) => ({ id: v.id, label: `${v.plate} · ${v.model ?? ''}`.trim(), km: v.km_current }))}
        mechanics={(mechanics as any[]).map((m) => ({ id: m.id, label: m.name }))}
        reasons={(reasons as any[]).map((r) => ({ id: r.id, label: r.name }))}
      />
    </>
  );
}
