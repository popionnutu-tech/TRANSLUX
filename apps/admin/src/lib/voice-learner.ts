// Ночной learner голосового агента (мандат Иона 23.08: самообучение на транскриптах).
// Что обучается: слой алиасов «услышано → каноническое село» серверного резолвера.
// Сам ASR (Scribe) дообучить нельзя — учим то, что в наших руках и что исторически
// чинило все промахи («кор жоуце», Тырнова). Цикл: транскрипты суток → LLM извлекает
// пары мисслышек с доказательством → валидация против таблицы localities и текущего
// резолвера → запись в voice_asr_aliases (active) → резолвер подхватывает сам.
// Без алертов; журнал — voice_controller_incidents (kind 'learned_alias').
import Anthropic from '@anthropic-ai/sdk';
import { getSupabase } from '@/lib/supabase';
import { localitiesToRo } from '@/lib/voice-locality';

const AGENT_ID = 'agent_3301kn4qwa6jep38d4b63m6s6pkh';
const EL = 'https://api.elevenlabs.io';
const MAX_CONVS = 15;
const LLM_CONCURRENCY = 5;

const elHeaders = () => ({ 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '' });

async function elGet(path: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${EL}${path}`, { headers: elHeaders(), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`EL GET ${path}: ${r.status}`);
  return r.json();
}

type Pair = { heard: string; intended_ro: string; evidence: string };

const EXTRACT_SYSTEM = `Ești un analist de transcrieri telefonice pentru o companie de transport din Moldova.
Sarcina: găsește locurile unde recunoașterea vocală a STÂLCIT numele unei localități spuse de CLIENT (rusă sau română), iar din context se vede clar ce localitate se avea în vedere (clientul a repetat, agentul a confirmat alt nume, sau ruta o face evidentă).
Răspunde DOAR cu JSON: {"pairs":[{"heard":"<forma stâlcită exact cum apare în transcript>","intended_ro":"<numele românesc canonic din lista dată>","evidence":"<un citat scurt din dialog>"}]}
Reguli stricte: intended_ro DOAR din lista de localități primită. Fără ghicit: dacă intenția nu e clară din dialog, nu raporta perechea. Nume deja corecte nu se raportează. Maxim 5 perechi.`;

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

export async function runVoiceLearner(): Promise<{ scanned: number; learned: number; rejected: number }> {
  const supabase = getSupabase();
  const { data: locRows } = await supabase.from('localities').select('name_ro').eq('active', true).order('name_ro');
  const validRo = new Set((locRows || []).map((r: { name_ro: string }) => r.name_ro));
  const localityList = [...validRo].join(', ');

  const list = await elGet(`/v1/convai/conversations?agent_id=${AGENT_ID}&page_size=30`);
  const cutoff = Date.now() / 1000 - 26 * 3600;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recent = (((list as any).conversations ?? []) as any[])
    .filter((c) => (c.start_time_unix_secs ?? 0) >= cutoff)
    .slice(0, MAX_CONVS);

  const anthropic = new Anthropic({ maxRetries: 1 });
  let learned = 0;
  let rejected = 0;

  const dialogs: { id: string; dialog: string }[] = [];
  const details = await Promise.allSettled(recent.map((c) => elGet(`/v1/convai/conversations/${c.conversation_id}`)));
  details.forEach((res, i) => {
    if (res.status !== 'fulfilled') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const turns: any[] = (res.value as any).transcript ?? [];
    const userHasCyr = turns.some((t) => t.role === 'user' && /[а-яё]/i.test(t.message ?? ''));
    const userTurns = turns.filter((t) => t.role === 'user' && t.message).length;
    if (!userHasCyr || userTurns < 2) return; // alias-urile sunt pe partea rusă; monologuri n-au context
    const dialog = turns
      .filter((t) => (t.role === 'user' || t.role === 'agent') && t.message)
      .map((t) => `${t.role === 'user' ? 'CLIENT' : 'AGENT'}: ${t.message}`)
      .join('\n')
      .slice(0, 6000);
    dialogs.push({ id: recent[i].conversation_id, dialog });
  });

  for (let i = 0; i < dialogs.length; i += LLM_CONCURRENCY) {
    const chunk = dialogs.slice(i, i + LLM_CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((d) => extractPairs(anthropic, d.dialog, localityList)));
    for (let j = 0; j < results.length; j++) {
      const res = results[j];
      if (res.status !== 'fulfilled') continue;
      for (const pair of res.value) {
        const heard = String(pair.heard ?? '').trim();
        const intended = String(pair.intended_ro ?? '').trim();
        // Валидация: цель — из таблицы localities; услышанное — кириллица и
        // НЕ резолвится текущим резолвером (иначе алиас не нужен и только рискует).
        if (!heard || !intended || !validRo.has(intended) || !/[а-яё]/i.test(heard) || heard.length > 40) { rejected++; continue; }
        const probe = await localitiesToRo([heard]);
        if (probe.unknown.length === 0) { rejected++; continue; }
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

  return { scanned: dialogs.length, learned, rejected };
}
