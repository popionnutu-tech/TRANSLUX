export const dynamic = 'force-dynamic';

import { getNorme } from './actions';
import NormeClient from './NormeClient';

// Panoul normelor lunii (Ion, 07.10.2026): pagina de start a Clavei (CONTABIL_LDE) și a adminului.
// Luna stă în adresă: /lde/agreare/norme?luna=2026-09; implicit ultima lună închisă.
export default async function LdeNormePage({ searchParams }: { searchParams: Promise<{ luna?: string }> }) {
  const { luna } = await searchParams;
  const data = await getNorme(luna);
  return <NormeClient data={data} />;
}
