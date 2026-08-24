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

/** Levenshtein complet. O singură formulă în tot fișierul. */
export function levFull(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Расстояние Левенштейна; быстрый выход «≥3» при разнице длин >2 (реальное расстояние
// не меньше разницы длин) — хватает для ASR-ошибок в одной-двух буквах. Тело — levFull:
// формула одна, иначе правка в одной копии не доедет до другой.
export function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  return levFull(a, b);
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

// Praguri pentru SUGESTII — nu pentru potrivire automată. Alegerea automată rămâne
// strictă dinadins: la un prag mai larg «Lipcani» și «Rîșcani» ajung la distanță 2
// unul de altul (măsurat pe toate cele 180 de forme), iar omul ar pleca în alt oraș.
// Aici doar ÎNTREBĂM, deci ne putem permite mai mult.
//
// Pragul e ȘI absolut, ȘI relativ. Doar absolut, «Cahul» (5 litere) primea drept
// candidat «Ratuș», iar «Комрат» primea «Корпачь» — la nume scurte trei litere
// diferență e deja alt cuvânt. Raportul păstrează toate cazurile reale din apeluri
// (Brătieni, Brăcești, Târnăvă, Отаки) și taie zgomotul.
//
// 0.45 nu e rotunjire: cazul care a pornit toată treaba, «Brătieni» → Briceni, cere
// exact 0.375. Mai strâns, l-am pierde. Rămân două nimereli slabe pe toate cele 90 de
// nume — «Ungheni»→Dîngeni și «Киев»→Chișinău — acceptate conștient: agentul ÎNTREABĂ,
// nu decide, iar dacă omul spune «nu», a doua oară primește răspunsul sincer.
const SUGGEST_MAX_DIST = 3;
const SUGGEST_MAX_RATIO = 0.45;
const SUGGEST_LIMIT = 2;
// Cel mai lung nume real are 25 de caractere în cheie. Peste 40 nu mai poate fi o
// localitate rostită, iar levFull plătește liniar fiecare caracter: 50 000 = 438 ms
// măsurate, adică tot bugetul. Ieșirea rapidă din `lev` era și limita de intrare.
const SUGGEST_MAX_KEY = 40;

export type LocalityRow = { name_ro: string; name_ru: string };
/** Candidat propus clientului, în AMBELE alfabete — vezi comentariul de mai jos. */
export interface Suggestion { ro: string; ru: string }

/**
 * Cele mai apropiate localități de ce s-a auzit. Gol = nimic destul de aproape.
 *
 * Întoarce ambele forme dinadins: ASR-ul scrie des româna cu chirilice, deci
 * alfabetul intrării NU spune în ce limbă e convorbirea. Dând doar forma auzită,
 * agentul ar fi pus să rostească «Крива» în mijlocul unei fraze românești.
 */
export function closestNames(heard: string, rows: LocalityRow[], alphabet: 'ro' | 'ru'): Suggestion[] {
  const k = key(heard);
  if (!k || k.length > SUGGEST_MAX_KEY) return [];
  return rows
    .map((r) => {
      const candidat = key(alphabet === 'ru' ? r.name_ru : r.name_ro);
      const d = levFull(k, candidat);
      return { r, d, raport: d / Math.max(k.length, candidat.length, 1) };
    })
    .filter((c) => c.d <= SUGGEST_MAX_DIST && c.raport <= SUGGEST_MAX_RATIO)
    .sort((a, b) => a.d - b.d || a.r.name_ro.localeCompare(b.r.name_ro))
    .slice(0, SUGGEST_LIMIT)
    .map((c) => ({ ro: c.r.name_ro, ru: c.r.name_ru }));
}

export interface LocalityResolution {
  /** Входы в порядке подачи: name_ro для распознанной кириллицы, иначе вход как есть. */
  values: (string | undefined)[];
  /** Кириллические входы, которые не удалось сопоставить, — агент должен переспросить. */
  unknown: string[];
  /** Для каждого непонятого входа — ближайшие названия, чтобы агент спросил, а не гадал. */
  suggestions: Record<string, Suggestion[]>;
}

export async function localitiesToRo(inputs: (string | undefined)[]): Promise<LocalityResolution> {
  if (!inputs.some((s) => s && /\p{L}/u.test(s))) return { values: inputs, unknown: [], suggestions: {} };

  const { data } = await getSupabase()
    .from('localities')
    .select('name_ro, name_ru')
    .eq('active', true)
    .order('name_ro');
  const rows = (data || []) as { name_ro: string; name_ru: string }[];
  const learned = await dbAliases();

  const unknown: string[] = [];
  const suggestions: Record<string, Suggestion[]> = {};
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
    if (!unknown.includes(input)) unknown.push(input); // ambele capete pot fi același nume
    // Nu ghicim, dar nici nu lăsăm agentul cu mâinile goale: îi dăm cele mai apropiate
    // nume ca să ÎNTREBE clientul care din ele. Apel 24.08: transcrierea a scris
    // «Brătieni», care stă între Brătușeni și Briceni — o alegere automată l-ar fi
    // putut trimite în alt sat.
    suggestions[input] = closestNames(input, rows, isCyr ? 'ru' : 'ro');
    return input;
  });

  return { values, unknown, suggestions };
}

/**
 * Ответ тула, когда название не распознано.
 *
 * ВАЖНО про «нет на наших маршрутах». Таблица localities — это ТОЛЬКО сеть TRANSLUX,
 * 90 пунктов, а не справочник Молдовы. Клиент, спросивший Кагул или Комрат, попадает
 * сюда законно. Глухой запрет говорить правду загонял бы такой звонок в круг:
 * «повторите» → снова непонятно → «повторите». Поэтому запрет действует только на
 * ПЕРВЫЙ раз и только когда есть что предложить; выход из круга назван явно.
 */
export function unknownLocalityResponse(unknown: string[], suggestions: Record<string, Suggestion[]> = {}) {
  const apropiate = unknown
    .filter((u) => suggestions[u]?.length)
    .map((u) => `«${u}» seamănă cu ${suggestions[u].map((c) => c.ro).join(' sau ')}`);
  return {
    found: false,
    unknown_locality: unknown,
    did_you_mean: suggestions,
    message: apropiate.length
      ? `Nu am recunoscut: ${unknown.join(', ')}. ${apropiate.join('; ')}. ÎNTREABĂ clientul care dintre ele — NU alege singur. Numele le rostești în limba conversației (fiecare candidat vine cu forma română și cea rusă).`
      : `Nu am recunoscut localitatea: ${unknown.join(', ')} și nu am nimic apropiat de propus. Roagă clientul să repete numele. Dacă ai primit deja unknown_locality pe același nume, spune-i sincer că nu e pe rutele noastre și oferă request_callback — nu întreba a treia oară.`,
  };
}
