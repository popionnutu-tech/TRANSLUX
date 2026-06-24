export const dynamic = 'force-dynamic';

import { listWarehouses, warehouseLayout } from '@/lib/piese';
import HartaClient from './HartaClient';

export default async function HartaPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const sp = await searchParams;
  const warehouses = await listWarehouses();
  const wid = sp.w ? Number(sp.w) : ((warehouses as any[])[0]?.id ?? 0);
  const layout = await warehouseLayout(wid);

  return (
    <>
      <div className="page-header"><h1>Hartă depozit</h1><p>Schemă orientativă: secții → rafturi → polițe. Caută o piesă să vezi pe ce raft e (la prihod/rashod); la inventariere vezi secția de azi.</p></div>
      <form className="toolbar" method="get">
        <label style={{ fontWeight: 600, fontSize: 13 }}>Depozit:</label>
        <select name="w" defaultValue={wid}>{(warehouses as any[]).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        <button className="btn btn-primary" type="submit">Vezi</button>
        <span className="muted">{layout.sections.length} secții · {layout.totalTypes} piese amplasate</span>
      </form>
      <HartaClient warehouseId={wid} layout={layout} />
    </>
  );
}
