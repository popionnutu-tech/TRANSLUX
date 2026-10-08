export const dynamic = 'force-dynamic';

import { getCombustibilImport } from './actions';
import CombustibilImportClient from './CombustibilImportClient';

// Încărcarea fișierelor Petrom (.txt) și Intelect (.xls) de către Clava (Ion, 08.10.2026; plan 2026-10-08).
export default async function LdeCombustibilImportPage() {
  const data = await getCombustibilImport();
  return <CombustibilImportClient data={data} />;
}
