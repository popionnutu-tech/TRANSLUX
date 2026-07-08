'use server';

import { requirePieseSearch } from '@/lib/piese-access';
import { catalogRows } from '@/lib/piese';

// Etichetă bogată: denumire + producător (model) + articol — ca să vezi/cauți după numărul piesei.
function partSearchLabel(p: Record<string, unknown>): string {
  const name = (p.name_long as string) || (p.group_name as string) || '';
  const mm = `${(p.manufacturer as string) ?? ''} ${p.model ? '(' + p.model + ')' : ''}`.trim();
  const art = p.article_code ? ' · ' + (p.article_code as string) : '';
  return `${name}${mm ? ' — ' + mm : ''}${art}`.trim();
}

// Căutare piese pentru combobox-urile din formulare (prihod/rashod/mutări).
// Reutilizează catalogRows (ilike pe name_long/article_code/oem_code/barcode/model/group_name, index-asistat pg_trgm).
export async function searchParts(q: string): Promise<{ id: number; label: string }[]> {
  await requirePieseSearch();
  const term = (q || '').trim();
  if (!term) return [];
  const rows = await catalogRows({ search: term });
  return (rows as Record<string, unknown>[]).map((p) => ({ id: p.id as number, label: partSearchLabel(p) }));
}
