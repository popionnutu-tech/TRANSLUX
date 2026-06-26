'use server';

import { requirePieseSearch } from '@/lib/piese-access';
import { searchAssistant, type SearchResult } from '@/lib/piese-search';

// Căutare/citire pentru asistentul de vânzător. Garda permite toate rolurile modulului Piese.
export async function search(query: string, categoryId: number | null): Promise<SearchResult[]> {
  await requirePieseSearch();
  const q = (query || '').trim();
  if (!q && !categoryId) return [];
  return searchAssistant(q, { categoryId: categoryId || undefined });
}
