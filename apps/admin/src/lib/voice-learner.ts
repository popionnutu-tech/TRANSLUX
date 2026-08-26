// Ночной learner голосового агента (мандат Иона 23.08: самообучение на транскриптах).
// Что обучается: слой алиасов «услышано → каноническое село» серверного резолвера.
// Сам ASR (Scribe) дообучить нельзя — учим то, что в наших руках и что исторически
// чинило все промахи («кор жоуце», Тырнова). Цикл: транскрипты суток → LLM извлекает
// пары мисслышек с доказательством → валидация против таблицы localities и текущего
// резолвера → запись в voice_asr_aliases (active) → резолвер подхватывает сам.
// Без алертов; журнал — voice_controller_incidents (kind 'learned_alias').
//
// С 26.08 (план cheeky-foraging-yao):
//  - источник транскриптов — НАША таблица voice_calls (пост-звонковый вебхук), не API
//    ElevenLabs: ноль round-trip'ов, бюджет 60 c (Hobby) не трещит, agent_id не важен;
//  - в первую очередь разбираются звонки с ПРОВАЛАМИ резолвера — их пишут тул-роуты
//    (kind='unknown_locality', lib/voice-unknown.ts); остаток добивается кириллическими;
//  - мисслышки учатся в ОБОИХ алфавитах (резолвер двухалфавитный с 24.08);
//  - вторым проходом по тем же диалогам майнер поправок (lib/voice-lessons.ts) пишет
//    уроки в voice_lessons — судит их Ион кнопками в Telegram, не авто-verify.
import Anthropic from '@anthropic-ai/sdk';
import { getSupabase } from '@/lib/supabase';
import { localitiesToRo, key, lev } from '@/lib/voice-locality';
import { syncCanonKeywords } from '@/lib/voice-canon';
import { extractLessons, insertLesson, type LessonCandidate } from '@/lib/voice-lessons';

const MAX_CONVS = 15;
const LLM_CONCURRENCY = 5;
// maxDuration=60 (потолок Vercel Hobby). Новая волна не стартует после этой отметки:
// 25 + 30 (таймаут волны) < 60 с запасом на пролог (perf-ревью 26.08).
const TIME_BUDGET_MS = 25_000;
// Сторож ХВОСТА чанка: verify-вызовы идут последовательно (до 20 c каждый), проверка
// на границе волны их не защищает — перед каждым внешним вызовом смотрим на часы.
const TAIL_DEADLINE_MS = 50_000;

type Pair = { heard: string; intended_ro: string; evidence: string };

const EXTRACT_SYSTEM = `Ești un analist de transcrieri telefonice pentru o companie de transport din Moldova.
Sarcina: găsește locurile unde recunoașterea vocală a STÂLCIT numele unei localități spuse de CLIENT (rusă sau română), iar din context se vede clar ce localitate se avea în vedere (clientul a repetat, agentul a confirmat alt nume, sau ruta o face evidentă).
Răspunde DOAR cu JSON: {"pairs":[{"heard":"<forma stâlcită exact cum apare în transcript>","intended_ro":"<numele românesc canonic din lista dată>","evidence":"<un citat scurt din dialog>"}]}
Reguli stricte: intended_ro DOAR din lista de localități primită. Fără ghicit: dacă intenția nu e clară din dialog, nu raporta perechea. Nume deja corecte nu se raportează. Maxim 5 perechi.`;

// Второй, адверсариальный проход: первый прогон в проде показал, что extract
// нарушает запрет на догадки («Чералхон»→Chișinău с evidence «probabil dorea…»).
// Верификатор отклоняет по умолчанию; approve — только при ЯВНОМ подтверждении.
const VERIFY_SYSTEM = `Ești un sceptic. Primești o pereche «auzit → localitate» și transcriptul.
Aprob-o DOAR dacă dialogul conține dovadă EXPLICITĂ: clientul a repetat numele mai clar, sau agentul a numit localitatea și clientul a confirmat-o. Deducții din context («probabil voia…») = reject.
Răspunde DOAR JSON: {"verdict":"approve"|"reject","reason":"<scurt>"}`;

async function verifyPair(anthropic: Anthropic, pair: Pair, dialog: string): Promise<boolean> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 150,
      system: VERIFY_SYSTEM,
      messages: [{ role: 'user', content: `PERECHEA: «${pair.heard}» → ${pair.intended_ro}\n\nTRANSCRIPT:\n${dialog}` }],
    }, { signal: AbortSignal.timeout(20000) });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    return parsed.verdict === 'approve';
  } catch {
    return false; // orice dubiu = reject
  }
}

async function extractPairs(anthropic: Anthropic, dialog: string, localityList: string): Promise<Pair[]> {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    system: EXTRACT_SYSTEM,
    messages: [{ role: 'user', content: `LOCALITĂȚI VALIDE:\n${localityList}\n\nTRANSCRIPT:\n${dialog}` }],
  }, { signal: AbortSignal.timeout(30000) });
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    return Array.isArray(parsed.pairs) ? parsed.pairs : [];
  } catch {
    return [];
  }
}

export type LearnerDialog = { id: string; dialog: string; hasCyr: boolean };

/**
 * Порядок разбора: сначала диалоги, в которых звучит нераспознанная форма
 * (unresolvedKeys — heard_key провалов за сутки), они обходят фильтр кириллицы:
 * латинская мисслышка («Brăcești») — тоже урок. Остаток — кириллические по
 * свежести (алиасы исторически в основном русские). Чистая функция — тестируемая.
 */
export function prioritizeDialogs(
  dialogs: LearnerDialog[],
  unresolvedKeys: Set<string>,
  max: number,
): { id: string; dialog: string }[] {
  const isPriority = (d: LearnerDialog): boolean => {
    if (unresolvedKeys.size === 0) return false;
    const words = d.dialog.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      if (unresolvedKeys.has(key(words[i]))) return true;
      // ASR часто рвёт название на два слова («кор жоуце») — окно из двух слов.
      if (i + 1 < words.length && unresolvedKeys.has(key(words[i] + words[i + 1]))) return true;
    }
    return false;
  };
  const prio: LearnerDialog[] = [];
  const rest: LearnerDialog[] = [];
  for (const d of dialogs) (isPriority(d) ? prio : rest).push(d);
  return [...prio, ...rest.filter((d) => d.hasCyr)].slice(0, max).map(({ id, dialog }) => ({ id, dialog }));
}

export async function runVoiceLearner(): Promise<{ scanned: number; learned: number; rejected: number; lessons: number }> {
  const t0 = Date.now();
  const supabase = getSupabase();
  const { data: locRows } = await supabase.from('localities').select('name_ro, name_ru').eq('active', true).order('name_ro');
  const locs = (locRows || []) as { name_ro: string; name_ru: string }[];
  const validRo = new Set(locs.map((r) => r.name_ro));
  const ruByRo = new Map(locs.map((r) => [r.name_ro, r.name_ru]));
  const localityList = [...validRo].join(', ');

  const cutoffIso = new Date(Date.now() - 26 * 3600 * 1000).toISOString();

  // Провалы резолвера за сутки (пишут тул-роуты в момент звонка) — приоритет разбора.
  const { data: unresolvedRows } = await supabase
    .from('voice_controller_incidents')
    .select('details')
    .eq('kind', 'unknown_locality')
    .gte('created_at', cutoffIso);
  const unresolvedKeys = new Set<string>();
  for (const r of (unresolvedRows || []) as { details: { heard_key?: string } }[]) {
    if (r.details?.heard_key) unresolvedKeys.add(r.details.heard_key);
  }

  // Транскрипты — из voice_calls (их уже сложил пост-звонковый вебхук).
  const { data: calls } = await supabase
    .from('voice_calls')
    .select('conversation_id, transcript')
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(60);

  const all: LearnerDialog[] = [];
  for (const c of (calls || []) as { conversation_id: string; transcript: unknown }[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const turns: any[] = Array.isArray(c.transcript) ? c.transcript : [];
    const userTurns = turns.filter((t) => t.role === 'user' && t.message).length;
    if (userTurns < 2) continue; // монологи не дают контекста
    const hasCyr = turns.some((t) => t.role === 'user' && /[а-яё]/i.test(t.message ?? ''));
    const dialog = turns
      .filter((t) => (t.role === 'user' || t.role === 'agent') && t.message)
      .map((t) => `${t.role === 'user' ? 'CLIENT' : 'AGENT'}: ${t.message}`)
      .join('\n')
      .slice(0, 6000);
    all.push({ id: c.conversation_id, dialog, hasCyr });
  }
  const dialogs = prioritizeDialogs(all, unresolvedKeys, MAX_CONVS);

  // Уроки: отклонённое Ионом — негативами в промпт; конверсации, по которым уроки
  // уже созданы, не майним повторно (26ч-окна соседних ночей перекрываются).
  const { data: negRows } = await supabase
    .from('voice_lessons').select('summary').eq('status', 'rejected')
    .order('decided_at', { ascending: false }).limit(30);
  const negatives = ((negRows || []) as { summary: string }[]).map((r) => r.summary);
  const { data: lessonRows } = await supabase
    .from('voice_lessons').select('conversation_id')
    .gte('created_at', new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString());
  const lessonConvIds = new Set(
    ((lessonRows || []) as { conversation_id: string | null }[]).map((r) => r.conversation_id).filter(Boolean),
  );

  const anthropic = new Anthropic({ maxRetries: 1 });
  let learned = 0;
  let rejected = 0;
  let lessons = 0;

  for (let i = 0; i < dialogs.length; i += LLM_CONCURRENCY) {
    if (Date.now() - t0 > TIME_BUDGET_MS) break; // недоразобранное доберёт следующая ночь
    const chunk = dialogs.slice(i, i + LLM_CONCURRENCY);
    // Оба прохода на диалог одним батчем: wall-clock не растёт, бюджет 60 c цел.
    const results = await Promise.allSettled(chunk.map((d) => Promise.all([
      extractPairs(anthropic, d.dialog, localityList),
      lessonConvIds.has(d.id) ? Promise.resolve([] as LessonCandidate[]) : extractLessons(anthropic, d.dialog, negatives),
    ])));
    for (let j = 0; j < results.length; j++) {
      const res = results[j];
      if (res.status !== 'fulfilled') continue;
      const [pairs, lessonCands] = res.value;
      for (const lc of lessonCands) {
        if (Date.now() - t0 > TAIL_DEADLINE_MS) break;
        const ok = await insertLesson(supabase, {
          conversation_id: chunk[j].id,
          kind: 'prompt_lesson',
          payload: { type: lc.type, what_agent_did: lc.what_agent_did, what_client_corrected: lc.what_client_corrected, quote: lc.quote },
          summary: lc.summary_ru,
        });
        if (ok) lessons++;
      }
      for (const pair of pairs) {
        if (Date.now() - t0 > TAIL_DEADLINE_MS) break;
        const heard = String(pair.heard ?? '').trim();
        const intended = String(pair.intended_ro ?? '').trim();
        // Валидация: цель — из таблицы localities; услышанное — любые буквы (оба
        // алфавита, как в резолвере) и НЕ резолвится текущим резолвером (иначе
        // алиас не нужен и только рискует).
        if (!heard || !intended || !validRo.has(intended) || !/\p{L}/u.test(heard) || heard.length > 40) { rejected++; continue; }
        const probe = await localitiesToRo([heard]);
        if (probe.unknown.length === 0) { rejected++; continue; }
        // Барьер похожести: мисслышка обязана быть ФОНЕТИЧЕСКИ близка цели —
        // «Чералхон»→Chișinău и «Лаварадову»→Larga (реальный брак первого прогона)
        // режутся здесь детерминированно, до всякого LLM.
        const ruName = ruByRo.get(intended) ?? '';
        const dist = Math.min(lev(key(heard), key(ruName)), lev(key(heard), key(intended)));
        const kl = key(heard).length;
        if (dist > (kl >= 9 ? 3 : 2)) { rejected++; continue; }
        // Адверсариальная верификация вторым LLM-проходом (reject по умолчанию).
        if (!(await verifyPair(anthropic, { heard, intended_ro: intended, evidence: String(pair.evidence ?? '') }, chunk[j].dialog))) {
          rejected++;
          // Пограничный случай: фонетика сошлась, авто-проверка нет. Раньше тихо
          // выбрасывался — теперь решает человек (✓/✗ в Telegram).
          const ok = await insertLesson(supabase, {
            conversation_id: chunk[j].id,
            kind: 'alias',
            payload: { heard, intended_ro: intended, quote: String(pair.evidence ?? '').slice(0, 300) },
            summary: `Алиас: «${heard}» → ${intended} — авто-проверка не прошла, нужно решение`,
          });
          if (ok) lessons++;
          continue;
        }
        const { error } = await supabase.from('voice_asr_aliases').insert({
          heard,
          canonical_ro: intended,
          source: 'learner',
          evidence: { conversation_id: chunk[j].id, quote: String(pair.evidence ?? '').slice(0, 300) },
        });
        if (error) {
          if (error.code !== '23505') console.error('[voice-learner] insert:', error.message);
          continue;
        }
        learned++;
        await supabase.from('voice_controller_incidents').insert({
          conversation_id: chunk[j].id,
          kind: 'learned_alias',
          details: { heard, intended_ro: intended },
          healed: true,
        });
      }
    }
  }

  // Свежевыученное сразу доезжает до ASR-словаря (controller донесёт до EL).
  if (learned > 0) await syncCanonKeywords();

  return { scanned: dialogs.length, learned, rejected, lessons };
}
