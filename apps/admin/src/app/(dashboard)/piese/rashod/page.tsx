export const dynamic = 'force-dynamic';

import { listWarehouses, listVehicles, catalogRows, listMechanics, listReasons } from '@/lib/piese';
import { requirePieseIssue } from '@/lib/piese-access';
import RashodClient from './RashodClient';

const partLabel = (p: any) => `${p.group_name} — ${p.manufacturer ?? ''} ${p.model ? '(' + p.model + ')' : ''}`.trim();

export default async function RashodPage() {
  await requirePieseWrite();
  const [warehouses, vehicles, parts, mechanics, reasons] = await Promise.all([
    listWarehouses(), listVehicles(), catalogRows(), listMechanics(), listReasons(),
  ]);
  return (
    <>
      <div className="page-header"><h1>Rashod — eliberare piesă</h1><p>Ecran simplu. La alegerea piesei și a mașinii, programul avertizează pe loc despre normă (km din GPS) și schimbări recente.</p></div>
      <RashodClient
        warehouses={(warehouses as any[]).filter((w) => w.kind === 'INTERNAL').map((w) => ({ id: w.id, label: w.name }))}
        vehicles={(vehicles as any[]).map((v) => ({ id: v.id, label: `${v.plate} · ${v.model ?? ''}`.trim(), km: v.km_current }))}
        parts={(parts as any[]).map((p) => ({ id: p.id, label: partLabel(p) }))}
        mechanics={(mechanics as any[]).map((m) => ({ id: m.id, label: m.name }))}
        reasons={(reasons as any[]).map((r) => ({ id: r.id, label: r.name }))}
      />
    </>
  );
}
