import { getSupabase } from '@/lib/supabase';

// Голосовые тулы получают названия так, как их сказал клиент. Русские названия
// конвертируем в name_ro по таблице localities (та же, что кормит русскую версию
// сайта) — дальше весь поиск остаётся румынским, как и был.

const norm = (s: string) =>
  s.toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z\s-]/gi, '').replace(/\s+/g, ' ').trim();

// Толерантный ключ: без мягких знаков и конечных гласных, чтобы разговорные
// варианты сходились с БД («Коржеуцы»/«Коржеуць» → «коржеуц», «Единцы» → «единц»).
const key = (s: string) => norm(s).replace(/[ьъ]/g, '').replace(/[ыиеаяоу]+$/, '');

// Разговорные русские имена, которых нет в localities.name_ru (ключи — через key()).
const RU_ALIASES: Record<string, string> = {
  'купчин': 'Cupcini', // в БД name_ru = «Калининск», но говорят и «Купчинь»
  'атак': 'Otaci', // традиционное русское «Атаки»
};

export interface LocalityResolution {
  /** Входы в порядке подачи: name_ro для распознанной кириллицы, иначе вход как есть. */
  values: (string | undefined)[];
  /** Кириллические входы, которые не удалось сопоставить, — агент должен переспросить. */
  unknown: string[];
}

export async function localitiesToRo(inputs: (string | undefined)[]): Promise<LocalityResolution> {
  if (!inputs.some((s) => s && /[а-яё]/i.test(s))) return { values: inputs, unknown: [] };

  const { data } = await getSupabase()
    .from('localities')
    .select('name_ro, name_ru')
    .eq('active', true)
    .order('name_ro');
  const rows = (data || []) as { name_ro: string; name_ru: string }[];

  const unknown: string[] = [];
  const values = inputs.map((input) => {
    if (!input || !/[а-яё]/i.test(input)) return input;
    const n = norm(input);
    const k = key(input);
    if (RU_ALIASES[k]) return RU_ALIASES[k];
    const exact = rows.find((r) => norm(r.name_ru) === n) || rows.find((r) => key(r.name_ru) === k);
    if (exact) return exact.name_ro;
    // Префиксная стадия: только на осмысленном ключе и только при однозначном попадании —
    // короткий ключ («б») иначе схлопнул бы половину таблицы в первое село.
    if (k.length >= 4) {
      const prefix = rows.filter((r) => key(r.name_ru).startsWith(k) || k.startsWith(key(r.name_ru)));
      if (prefix.length === 1) return prefix[0].name_ro;
    }
    unknown.push(input);
    return input;
  });

  return { values, unknown };
}

/** Ответ тула, когда кириллическое название не распознано: агент должен переспросить. */
export function unknownLocalityResponse(unknown: string[]) {
  return {
    found: false,
    unknown_locality: unknown,
    message: `Nu am recunoscut localitatea: ${unknown.join(', ')}. Roagă clientul să repete numele sau spune-l în română.`,
  };
}
