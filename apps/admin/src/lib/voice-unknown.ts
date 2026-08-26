// Провалы резолвера сёл из ЖИВЫХ звонков — пища ночного learner-а (Ион, 26.08:
// «учиться от провалов, а не от случайной выборки»). Вызывается через after()
// ПОСЛЕ ответа тула: вставка не стоит на пути звонка (cascade_timeout 12 c).
import { getSupabase } from '@/lib/supabase';
import { key, type Suggestion } from '@/lib/voice-locality';

// Больше 5 непонятых форм за один вызов — мусорный вход, не звонок.
const MAX_PER_CALL = 5;

export async function logUnknownLocalities(
  tool: 'search-trips' | 'get-price' | 'get-schedule',
  unknown: string[],
  suggestions: Record<string, Suggestion[]>,
): Promise<void> {
  try {
    const supabase = getSupabase();
    // Скользящие 24 часа, не «календарные сутки»: без часового пояса в запросе
    // (конвенция «даты = Кишинёв» не нарушается — календарного дня тут нет вовсе).
    const windowStart = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    for (const heard of unknown.slice(0, MAX_PER_CALL)) {
      const hk = key(heard);
      if (!hk) continue;
      // Дедуп на уровне приложения: индекс по created_at::date невозможен
      // (не IMMUTABLE), а гонка двух звонков даёт максимум лишнюю строку — learner
      // всё равно дедупит по heard_key.
      const { data: dup } = await supabase
        .from('voice_controller_incidents')
        .select('id')
        .eq('kind', 'unknown_locality')
        .eq('details->>heard_key', hk)
        .gte('created_at', windowStart)
        .limit(1);
      if (dup?.length) continue;
      await supabase.from('voice_controller_incidents').insert({
        kind: 'unknown_locality',
        healed: false,
        details: { heard, heard_key: hk, tool, suggestions: (suggestions[heard] ?? []).map((s) => s.ro) },
      });
    }
  } catch {
    /* журнал не имеет права ломать звонок */
  }
}
