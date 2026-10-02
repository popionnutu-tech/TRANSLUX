export const dynamic = 'force-dynamic';

import { getAgreare } from './actions';
import AgreareClient from './AgreareClient';

// Agrearea lunară a șoferilor pe mașinile de uzină (ION-174): unde a dormit mașina (GPS) → cine a lucrat pe ea,
// cu perioada fiecăruia. Pagina Clavei (rol CONTABIL_LDE) și a adminului. Luna stă în adresă: /lde/agreare?luna=2026-09.
export default async function LdeAgrearePage({ searchParams }: { searchParams: Promise<{ luna?: string }> }) {
  const { luna } = await searchParams;
  const data = await getAgreare(luna);
  return <AgreareClient data={data} />;
}
