export const dynamic = 'force-dynamic';

import { getConsumSoferi } from './actions';
import ConsumClient from './ConsumClient';

// Consumul faptic pe șofer, lunar, din agrearea de pe /lde/agreare (Ion, 07.10.2026). Pagina Clavei (rol CONTABIL_LDE) și a
// adminului. Luna stă în adresă: /lde/agreare/consum?luna=2026-09.
export default async function LdeConsumSoferiPage({ searchParams }: { searchParams: Promise<{ luna?: string }> }) {
  const { luna } = await searchParams;
  const data = await getConsumSoferi(luna);
  return <ConsumClient data={data} />;
}
