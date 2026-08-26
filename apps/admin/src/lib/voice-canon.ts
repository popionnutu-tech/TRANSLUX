// Замыкание обучения на ASR-словарь (Ион, 26.08: «вытеснение по правилу»).
// Выученные алиасы чинят серверный резолвер, но распознаватель продолжает слышать
// криво. Синк дописывает русские канонические формы целей алиасов в
// voice_agent_canon.asr_keywords; controller доносит до ElevenLabs своим циклом.
//
// 50 — ЖЁСТКИЙ лимит ElevenLabs (docs: overrides, max 50 keywords), не наш
// предохранитель. Словарь уже полон, поэтому вытеснение: защищённое ядро
// (TRANSLUX + is_major-узлы + цели активных алиасов) не трогается, вытесняется
// хвост ручного списка. Каждое вытеснение — в журнал инцидентов.
//
// Функция ДЕРИВАТИВНАЯ, не инкрементальная: каждый прогон выводит один и тот же
// результат из текущих алиасов — гонка learner/controller самозалечивается
// следующим циклом. Синк только ДОПИСЫВАЕТ: чтобы убрать выученное слово насовсем,
// нужно И деактивировать алиас, И удалить слово из voice_agent_canon — иначе
// активный алиас вернёт его следующим прогоном.
import { getSupabase } from '@/lib/supabase';
import { key } from '@/lib/voice-locality';
import { alertAdmins, escapeHtml } from '@/lib/telegram-notify';

const LIMIT = 50;

export function computeCanonKeywords(
  current: string[],
  additions: string[],
  protectedWords: Set<string>, // lowercase
): { next: string[]; added: string[]; evicted: string[]; blocked: string[] } {
  const have = new Set(current.map((w) => w.toLowerCase()));
  const seen = new Set<string>();
  const adds = additions.filter((w) => {
    const l = w.toLowerCase();
    if (!w || have.has(l) || seen.has(l)) return false;
    seen.add(l);
    return true;
  });
  if (adds.length === 0) return { next: current, added: [], evicted: [], blocked: [] };
  const addSet = new Set(adds.map((w) => w.toLowerCase()));
  const next = [...current];
  const added: string[] = [];
  const evicted: string[] = [];
  const blocked: string[] = [];
  for (const w of adds) {
    if (next.length < LIMIT) {
      next.push(w);
      added.push(w);
      continue;
    }
    // Вытеснение с хвоста, минуя защищённых и самих кандидатов.
    let idx = -1;
    for (let i = next.length - 1; i >= 0; i--) {
      const l = next[i].toLowerCase();
      if (!protectedWords.has(l) && !addSet.has(l)) { idx = i; break; }
    }
    if (idx === -1) { blocked.push(w); continue; }
    evicted.push(next[idx]);
    next.splice(idx, 1);
    next.push(w);
    added.push(w);
  }
  return { next, added, evicted, blocked };
}

/** Дописать в канон RU-формы целей активных алиасов. Никогда не бросает. */
export async function syncCanonKeywords(): Promise<void> {
  try {
    const supabase = getSupabase();
    const { data: canonRow } = await supabase
      .from('voice_agent_canon').select('value').eq('key', 'asr_keywords').maybeSingle();
    const current = canonRow?.value;
    if (!Array.isArray(current) || current.length === 0) return; // канона нет — не изобретаем

    const { data: aliasRows } = await supabase
      .from('voice_asr_aliases').select('canonical_ro').eq('active', true);
    const targets = [...new Set(((aliasRows || []) as { canonical_ro: string }[]).map((r) => r.canonical_ro))];
    if (targets.length === 0) return;

    const { data: locRows } = await supabase
      .from('localities').select('name_ro, name_ru, is_major').eq('active', true);
    const locs = (locRows || []) as { name_ro: string; name_ru: string; is_major: boolean }[];
    const ruByRo = new Map(locs.map((l) => [l.name_ro, l.name_ru]));
    // В словарь идёт ОФИЦИАЛЬНАЯ русская форма цели (localities.name_ru, реестр
    // миграции 275) — не услышанная: обратное учило бы распознаватель ошибке.
    const additions = targets.map((t) => ruByRo.get(t)).filter((x): x is string => !!x);

    const protectedWords = new Set<string>(['translux']);
    for (const l of locs) {
      if (l.is_major) {
        protectedWords.add(l.name_ro.toLowerCase());
        protectedWords.add(l.name_ru.toLowerCase());
      }
    }
    for (const a of additions) protectedWords.add(a.toLowerCase());

    const { next, added, evicted, blocked } = computeCanonKeywords(current as string[], additions, protectedWords);
    if (added.length > 0) {
      await supabase.from('voice_agent_canon')
        .update({ value: next, updated_at: new Date().toISOString() }).eq('key', 'asr_keywords');
      await supabase.from('voice_controller_incidents').insert({
        kind: 'canon_keywords', details: { added, evicted }, healed: true,
      });
      // Журнал без читателя = молчание (ревью 26.08): изменение словаря — Иону.
      await alertAdmins(
        `🎓 <b>ASR-словарь</b>: добавлено ${added.map((w) => escapeHtml(w)).join(', ')}` +
        (evicted.length ? `; вытеснено ${evicted.map((w) => escapeHtml(w)).join(', ')}` : ''),
      );
    }
    if (blocked.length > 0) {
      // Раз в сутки, не каждые 30 минут.
      const { data: recent } = await supabase.from('voice_controller_incidents')
        .select('id').eq('kind', 'canon_full')
        .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()).limit(1);
      if (!recent?.length) {
        await supabase.from('voice_controller_incidents').insert({
          kind: 'canon_full', details: { blocked, count: current.length }, healed: false,
        });
        await alertAdmins(
          `⚠️ <b>ASR-словарь полон</b> (50/50, лимит ElevenLabs). Не поместилось: ${blocked.map((w) => escapeHtml(w)).join(', ')}. Реши в БД (voice_agent_canon), что убрать.`,
        );
      }
    }
  } catch { /* синк не имеет права ломать вызывающего */ }
}

/**
 * Предохранитель ручного пути (кнопка ✓ в Telegram): алиас, чей key(heard)
 * совпадает с ключом имени ЧУЖОГО села, перенаправлял бы всех будущих звонящих —
 * алиасы в резолвере стоят ДО точного совпадения (voice-locality.ts:146-148).
 * Learner такое не создаёт (probe), человек может промахнуться пальцем.
 * Деактивация + инцидент; цикл controller-а закрывает окно за ≤30 минут.
 */
export async function auditAliasShadow(): Promise<void> {
  try {
    const supabase = getSupabase();
    const { data: aliasRows } = await supabase
      .from('voice_asr_aliases').select('id, heard, canonical_ro').eq('active', true);
    const aliases = (aliasRows || []) as { id: number; heard: string; canonical_ro: string }[];
    if (aliases.length === 0) return;
    const { data: locRows } = await supabase
      .from('localities').select('name_ro, name_ru').eq('active', true);
    const byKey = new Map<string, string>();
    for (const l of (locRows || []) as { name_ro: string; name_ru: string }[]) {
      byKey.set(key(l.name_ro), l.name_ro);
      byKey.set(key(l.name_ru), l.name_ro);
    }
    for (const a of aliases) {
      const hit = byKey.get(key(a.heard));
      if (hit && hit !== a.canonical_ro) {
        await supabase.from('voice_asr_aliases').update({ active: false }).eq('id', a.id);
        await supabase.from('voice_controller_incidents').insert({
          kind: 'alias_shadow',
          details: { heard: a.heard, canonical_ro: a.canonical_ro, collides_with: hit },
          healed: true,
        });
        await alertAdmins(
          `⚠️ <b>Алиас погашен</b>: «${escapeHtml(a.heard)}» → ${escapeHtml(a.canonical_ro)} накрывал село ${escapeHtml(hit)} — все звонящие туда уезжали бы в ${escapeHtml(a.canonical_ro)}.`,
        );
      }
    }

    // Коллизия алиас↔алиас: два активных heard с одним key() — карта резолвера
    // недетерминированно перетирает одну запись другой (реальный случай: «Хлина» и
    // «Хлиная» → ключ «хлин»). НЕ гасим сами — оба могут быть человеческими, выбор
    // за Ионом. Сообщаем раз в сутки.
    const byAliasKey = new Map<string, typeof aliases>();
    for (const a of aliases) {
      const k = key(a.heard);
      byAliasKey.set(k, [...(byAliasKey.get(k) ?? []), a]);
    }
    const collisions = [...byAliasKey.values()].filter((g) => g.length > 1 && new Set(g.map((x) => x.canonical_ro)).size > 1);
    if (collisions.length > 0) {
      const { data: recent } = await supabase.from('voice_controller_incidents')
        .select('id').eq('kind', 'alias_key_collision')
        .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()).limit(1);
      if (!recent?.length) {
        const detail = collisions.map((g) => g.map((x) => `«${x.heard}»→${x.canonical_ro}`).join(' vs '));
        await supabase.from('voice_controller_incidents').insert({
          kind: 'alias_key_collision', details: { collisions: detail }, healed: false,
        });
        await alertAdmins(`⚠️ <b>Коллизия алиасов</b> (один ключ, разные сёла): ${escapeHtml(detail.join('; '))}. Резолвер берёт случайный — почини в voice_asr_aliases.`);
      }
    }
  } catch { /* аудит не имеет права ломать вызывающего */ }
}
