import { getSupabase } from '@/lib/supabase';

// Голосовые тулы получают названия так, как их сказал клиент. Русские названия
// конвертируем в name_ro по таблице localities (та же, что кормит русскую версию
// сайта) — дальше весь поиск остаётся румынским, как и был.

// Diacriticele se PLIAZĂ, nu se șterg: vechiul /[^а-яa-z]/ arunca ș/ă/î cu totul
// («Brăcești»→«brceti») și strica potrivirea latină (apel 24.08: «Brăcești»≈Briceni).
const norm = (s: string) =>
  s.toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[șş]/g, 's').replace(/[țţ]/g, 't').replace(/[ăâ]/g, 'a').replace(/î/g, 'i')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^а-яa-z\s-]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

// Толерантный ключ: без пробелов/дефисов, мягких знаков и конечных гласных, чтобы
// разговорные и ASR-варианты сходились с БД («кор жоуце»/«Коржеуць» → «коржоуц»/«коржеуц»).
// key/lev экспортированы: learner-ом проверяется похожесть кандидатов на алиасы.
export const key = (s: string) => norm(s).replace(/[\s-]/g, '').replace(/[ьъ]/g, '').replace(/[ыиеаяоу]+$/, '');

// Расстояние Левенштейна; быстрый выход «≥3» при разнице длин >2 (реальное расстояние
// не меньше разницы длин) — хватает для ASR-ошибок в одной-двух буквах.
export function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Разговорные русские имена, которых нет в localities.name_ru (ключи — через key()).
// Стартовый набор; боевой источник — таблица voice_asr_aliases: её пополняет ночной
// learner парами «услышано → имелось в виду» из транскриптов (мандат Иона 23.08).
const RU_ALIASES: Record<string, string> = {
  'купчин': 'Cupcini', // в БД name_ru = «Калининск», но говорят и «Купчинь»
  'атак': 'Otaci', // традиционное русское «Атаки»
};

// Кэш алиасов из БД на время жизни инстанса (5 мин) — резолвер дёргается на каждый тул.
let aliasCache: { at: number; map: Record<string, string> } | null = null;
async function dbAliases(): Promise<Record<string, string>> {
  if (aliasCache && Date.now() - aliasCache.at < 5 * 60 * 1000) return aliasCache.map;
  const map: Record<string, string> = {};
  try {
    const { data } = await getSupabase()
      .from('voice_asr_aliases')
      .select('heard, canonical_ro')
      .eq('active', true);
    for (const r of (data || []) as { heard: string; canonical_ro: string }[]) {
      map[key(r.heard)] = r.canonical_ro;
    }
  } catch { /* fără DB mergem pe RU_ALIASES */ }
  aliasCache = { at: Date.now(), map };
  return map;
}

export interface LocalityResolution {
  /** Входы в порядке подачи: name_ro для распознанной кириллицы, иначе вход как есть. */
  values: (string | undefined)[];
  /** Кириллические входы, которые не удалось сопоставить, — агент должен переспросить. */
  unknown: string[];
}

export async function localitiesToRo(inputs: (string | undefined)[]): Promise<LocalityResolution> {
  if (!inputs.some((s) => s && /\p{L}/u.test(s))) return { values: inputs, unknown: [] };

  const { data } = await getSupabase()
    .from('localities')
    .select('name_ro, name_ru')
    .eq('active', true)
    .order('name_ro');
  const rows = (data || []) as { name_ro: string; name_ru: string }[];
  const learned = await dbAliases();

  const unknown: string[] = [];
  const values = inputs.map((input) => {
    if (!input || !/\p{L}/u.test(input)) return input;
    // De la 24.08 se rezolvă AMBELE alfabete: și numele latine stâlcite de ASR
    // («Brăcești») trec prin aceleași trepte contra name_ro; nepotrivit = unknown,
    // ca agentul să reîntrebe în loc de «0 curse» tăcut sau «nu e pe rută» inventat.
    const isCyr = /[а-яё]/i.test(input);
    const nameOf = (r: { name_ro: string; name_ru: string }) => (isCyr ? r.name_ru : r.name_ro);
    const n = norm(input);
    const k = key(input);
    if (RU_ALIASES[k]) return RU_ALIASES[k];
    if (learned[k]) return learned[k];
    const exact = rows.find((r) => norm(nameOf(r)) === n) || rows.find((r) => key(nameOf(r)) === k);
    if (exact) return exact.name_ro;
    // Префиксная стадия: только на осмысленном ключе и только при однозначном попадании —
    // короткий ключ («б») иначе схлопнул бы половину таблицы в первое село.
    if (k.length >= 4) {
      const prefix = rows.filter((r) => key(nameOf(r)).startsWith(k) || k.startsWith(key(nameOf(r))));
      if (prefix.length === 1) return prefix[0].name_ro;
    }
    // Fuzzy-стадия для ASR-ошибок («кор жоуце» → Corjeuți): допускаем 1 букву разницы
    // (2 для длинных имён) и берём только ОДНОЗНАЧНО лучшего кандидата. Проверено на
    // живой таблице: единственная пара с dist≤2 — Рышканы/Пашканы — отсечена порогом длины.
    const maxD = k.length >= 9 ? 2 : k.length >= 5 ? 1 : 0;
    if (maxD > 0 && rows.length > 0) {
      const scored = rows
        .map((r) => ({ r, d: lev(k, key(nameOf(r))) }))
        .sort((a, b) => a.d - b.d);
      if (scored[0].d <= maxD && (scored.length === 1 || scored[0].d < scored[1].d)) {
        return scored[0].r.name_ro;
      }
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
