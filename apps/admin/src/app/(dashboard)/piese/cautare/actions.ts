'use server';

import { requirePieseSearch } from '@/lib/piese-access';
import { searchAssistant, type SearchResult } from '@/lib/piese-search';

// Căutare/citire pentru asistentul de vânzător. Garda permite toate rolurile modulului Piese.
export async function search(query: string, categoryId: number | null): Promise<SearchResult[]> {
  await requirePieseSearch();
  const q = (query || '').trim();
  // Argumentul vine de la client (netrusted) — îl normalizez la un întreg pozitiv sau nimic.
  const cid = Number.isFinite(categoryId) && Number(categoryId) > 0 ? Number(categoryId) : undefined;
  if (!q && !cid) return [];
  return searchAssistant(q, { categoryId: cid });
}
