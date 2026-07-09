'use server';

import { requirePieseSearch } from '@/lib/piese-access';
import { catalogRows, partLabel } from '@/lib/piese';

// Căutare piese pentru combobox-urile din formulare (prihod/rashod/mutări).
// Reutilizează catalogRows (ilike pe name_long/article_code/oem_code/barcode/model/group_name, index-asistat pg_trgm).
// Eticheta e centralizată în partLabel (aceeași folosită la crearea „din mers") ca să nu difere.
export async function searchParts(q: string): Promise<{ id: number; label: string }[]> {
  await requirePieseSearch();
  const term = (q || '').trim();
  if (!term) return [];
  const rows = await catalogRows({ search: term });
  return (rows as Record<string, unknown>[]).map((p) => ({ id: p.id as number, label: partLabel(p) }));
}
