// Майнер поправок (Ион, 26.08): второй ночной LLM-проход по тем же диалогам ищет
// ЯВНЫЕ поправки клиента ЛЮБОГО типа — время, дата, ложный отказ по маршруту,
// телефон, имя. Уроки идут в voice_lessons (pending) БЕЗ адверсариального verify:
// судья — человек, ✓/✗ в Telegram (бот, утренний дайджест). Отклонённое кормит
// промпт негативами и больше не предлагается.
import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

export type LessonCandidate = {
  type: string;
  what_agent_did: string;
  what_client_corrected: string;
  quote: string;
  summary_ru: string;
};

const LESSON_SYSTEM = `Ești un analist de transcrieri telefonice pentru compania de transport TRANSLUX (Moldova).
Sarcina: găsește locurile unde CLIENTUL CORECTEAZĂ EXPLICIT ceva afirmat de AGENT — ora, data, un refuz de rută dat greșit, numărul de telefon, un nume. Corecție explicită = clientul contrazice sau corectează direct («нет, я сказал…», repetă apăsat același lucru, «не туда»).
Cazul aparte «lost_item»: clientul a UITAT/PIERDUT un obiect în autobuz, iar agentul l-a tratat greșit (refuz de rută, număr de șofer greșit, «am notat» fără urmare) — folosește type «lost_item», NU «route_refusal».
Răspunde DOAR cu JSON: {"lessons":[{"type":"time"|"date"|"route_refusal"|"phone"|"name"|"lost_item"|"other","what_agent_did":"<ce a afirmat agentul>","what_client_corrected":"<ce a corectat clientul>","quote":"<citat scurt din dialog>","summary_ru":"<o propoziție pe rusă pentru administrator: ce a greșit agentul și ce era corect>"}]}
Reguli stricte: DOAR corecții explicite prezente în dialog, fără deducții. Nume de localități stâlcite NU se raportează aici — au canalul lor separat. Nemulțumiri generale fără corecție concretă nu se raportează. Maxim 3 lecții.`;

export function buildLessonPrompt(negativeSummaries: string[]): string {
  if (negativeSummaries.length === 0) return LESSON_SYSTEM;
  const neg = negativeSummaries.map((s) => `- ${s}`).join('\n');
  return `${LESSON_SYSTEM}\n\nAdministratorul a RESPINS deja lecții asemănătoare cu cele de mai jos — NU raporta din nou același gen:\n${neg}`;
}

export function parseLessons(raw: string): LessonCandidate[] {
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    if (!Array.isArray(parsed.lessons)) return [];
    return parsed.lessons
      .map((l: Record<string, unknown>) => ({
        type: String(l.type ?? 'other'),
        what_agent_did: String(l.what_agent_did ?? '').slice(0, 300),
        what_client_corrected: String(l.what_client_corrected ?? '').slice(0, 300),
        quote: String(l.quote ?? '').slice(0, 300),
        summary_ru: String(l.summary_ru ?? '').trim().slice(0, 300),
      }))
      .filter((l: LessonCandidate) => l.summary_ru && l.quote)
      .slice(0, 3);
  } catch {
    return [];
  }
}

export async function extractLessons(
  anthropic: Anthropic,
  dialog: string,
  negativeSummaries: string[],
): Promise<LessonCandidate[]> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 700,
      system: buildLessonPrompt(negativeSummaries),
      messages: [{ role: 'user', content: `TRANSCRIPT:\n${dialog}` }],
    }, { signal: AbortSignal.timeout(30000) });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return parseLessons(text);
  } catch {
    return [];
  }
}

export type LessonRow = {
  conversation_id: string;
  kind: 'alias' | 'prompt_lesson';
  payload: Record<string, unknown>;
  summary: string;
};

/** Вставка урока. Для алиасов: отклонённый ранее heard не предлагается снова. */
export async function insertLesson(supabase: SupabaseClient, row: LessonRow): Promise<boolean> {
  if (row.kind === 'alias') {
    const heard = String(row.payload.heard ?? '');
    if (!heard) return false;
    const { data: was } = await supabase
      .from('voice_lessons')
      .select('id')
      .eq('kind', 'alias')
      .eq('payload->>heard', heard)
      .eq('status', 'rejected')
      .limit(1);
    if (was?.length) return false;
  }
  const { error } = await supabase.from('voice_lessons').insert(row);
  if (error) {
    // 23505 = дубль pending по частичному индексу — норма при повторном прогоне.
    if (error.code !== '23505') console.error('[voice-lessons] insert:', error.message);
    return false;
  }
  return true;
}
