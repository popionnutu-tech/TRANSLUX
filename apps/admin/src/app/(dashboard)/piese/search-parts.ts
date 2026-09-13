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

// Doar piesele NOI — pentru câmpul „corespunde piesei noi" de la o piesă б/у. O uzată nu poate fi originea
// alteia (garda e și în bază, migr. 345); aici o ținem în afara listei ca omul să nu încerce.
export async function searchNewParts(q: string): Promise<{ id: number; label: string }[]> {
  await requirePieseSearch();
  const term = (q || '').trim();
  if (!term) return [];
  const rows = await catalogRows({ search: term, onlyNew: true });
  return (rows as Record<string, unknown>[]).map((p) => ({ id: p.id as number, label: partLabel(p) }));
}

// Doar piesele б/у — pentru ecranul „Donor". Garda reală e în bază (`NOT_USED_PART`, migr. 346); aici e ca
// omul să nu piardă timp căutând o piesă nouă pe care documentul o va refuza oricum.
export async function searchUsedParts(q: string): Promise<{ id: number; label: string }[]> {
  await requirePieseSearch();
  const term = (q || '').trim();
  if (!term) return [];
  const rows = await catalogRows({ search: term, onlyUsed: true });
  return (rows as Record<string, unknown>[]).map((p) => ({ id: p.id as number, label: partLabel(p) }));
}
