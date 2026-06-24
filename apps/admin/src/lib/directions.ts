'use server';

import { getSupabase } from '@/lib/supabase';

// Опции направления для номенклатуры водителей/машин: Interurban + Suburban + узины (список из lde_uzine).
// Хранится в drivers.directions / vehicles.directions (text[]). Бот-выбор фильтрует 'interurban' ∈ directions.
export async function getDirectionOptions(): Promise<{ value: string; label: string }[]> {
  const { data } = await getSupabase()
    .from('lde_uzine')
    .select('id, city')
    .eq('active', true)
    .order('city');
  return [
    { value: 'interurban', label: 'Interurban' },
    { value: 'suburban', label: 'Suburban' },
    ...((data ?? []) as Array<{ id: string; city: string }>).map((u) => ({ value: u.id, label: u.city })),
  ];
}
