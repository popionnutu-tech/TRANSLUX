'use server';

import { requirePieseSearch, canSeeCost, userWarehouseId } from '@/lib/piese-access';
import { searchAssistant, type SearchResult } from '@/lib/piese-search';

// Căutare/citire pentru asistentul de vânzător. Garda permite toate rolurile modulului Piese.
export async function search(query: string, categoryId: number | null, warehouseId?: number | null): Promise<SearchResult[]> {
  const session = await requirePieseSearch();
  const q = (query || '').trim();
  // Argumentele vin de la client (netrusted) — le normalizez la întregi pozitivi sau nimic.
  const cid = Number.isFinite(categoryId) && Number(categoryId) > 0 ? Number(categoryId) : undefined;
  if (!q && !cid) return [];
  // Filtru pe depozit: un cont legat de un depozit e FORȚAT pe depozitul lui (nu poate cere altul);
  // adminul/contul cu drepturi extinse (wid=null) poate filtra liber pe depozitul ales sau pe toate.
  const bound = await userWarehouseId(session);
  const reqWh = Number.isFinite(warehouseId as number) && Number(warehouseId) > 0 ? Number(warehouseId) : undefined;
  const wh = bound != null ? bound : reqWh;
  // Vânzătorul NU primește costul de achiziție / furnizorul — se filtrează din date, server-side.
  return searchAssistant(q, { categoryId: cid, warehouseId: wh, showCost: canSeeCost(session.role) });
}

// Căutare pe o poziție ALEASĂ din sugestii — răspunsul lui Eduard: „должна выйти подсказка какую позицию
// мы хотим выбрать… поиск должен отображать одну позицию которую мы задаем в поиск". Fără asta, singurul
// mod de a ajunge la o piesă anume era să nimerești un cuvânt destul de rar.
//
// Filtrul pe depozit se impune la fel ca la căutarea largă: un cont legat de un depozit rămâne forțat pe al
// lui, indiferent ce trimite clientul. `partId` nu lărgește accesul — decide doar CE poziție se arată.
export async function searchOne(partId: number, warehouseId?: number | null): Promise<SearchResult | null> {
  const session = await requirePieseSearch();
  const pid = Number(partId);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const bound = await userWarehouseId(session);
  const reqWh = Number.isFinite(warehouseId as number) && Number(warehouseId) > 0 ? Number(warehouseId) : undefined;
  const wh = bound != null ? bound : reqWh;
  const rows = await searchAssistant('', { partId: pid, warehouseId: wh, showCost: canSeeCost(session.role) });
  return rows[0] ?? null;
}
