// Контролёр голосового агента (Ион, 23.08: «не алерты — фиксить сам»).
// Две обязанности за прогон:
//  1) КОНФИГ-ИНВАРИАНТЫ: сверить живой конфиг агента с эталоном и молча вернуть
//     всё съехавшее. Эталон словаря ASR живёт в БД (voice_agent_canon) — его
//     обновляет и человек, и ночной learner; остальные инварианты — в коде ниже.
//  2) ВАЛИДАТОР ЗВОНКОВ: произнесённые агентом времена сверить со временами из
//     tool-результатов того же звонка; расхождение = incident в журнал (без пушей).
// PATCH-семантика ElevenLabs проверена экспериментом 23.08: platform_settings
// мёржится ПО-КЛЮЧЕВО (соседние ключи не стираются); объединяем всё равно в один
// PATCH на секцию — меньше запросов, нет зависимости от порядка.
import { getSupabase } from '@/lib/supabase';
import { RO_UNITS, RO_TENS, RU_UNITS, RU_TENS } from '@/lib/time-spoken';

const AGENT_ID = 'agent_3301kn4qwa6jep38d4b63m6s6pkh';
const EL = 'https://api.elevenlabs.io';
const INIT_WEBHOOK_URL = 'https://central-hub-md.vercel.app/api/voice/webhooks/init';
const CUSTOM_LLM_URL = 'https://translux-voice-llm.vercel.app/api';
const MAX_CALLS_PER_RUN = 8;

// Фолбэк эталона словаря (решение Иона 23.08); боевой эталон — в voice_agent_canon.
const FALLBACK_KEYWORDS = [
  'TRANSLUX',
  'Chișinău', 'Кишинёв', 'Bălți', 'Бельцы', 'Orhei', 'Орхей', 'Sîngerei', 'Сынжерея',
  'Rîșcani', 'Рышканы', 'Briceni', 'Бричаны', 'Lipcani', 'Липканы', 'Edineț', 'Единцы',
  'Cupcini', 'Калининск', 'Ocnița', 'Окница', 'Otaci', 'Отачь', 'Criva', 'Крива',
  'Peresecina', 'Пересечина', 'Corjeuți', 'Коржеуць', 'Măgdăcești', 'Магдачешты',
  'Brătușeni', 'Братушаны', 'Larga', 'Ларга', 'Grimăncăuți', 'Гримэнкэуць',
  'Caracușenii Vechi', 'Старые Каракушаны', 'Tîrnova', 'Тырнова', 'Tabani', 'Табаны',
  'Vălcineț', 'Вэлчинец', 'Cotiujeni', 'Котюжаны', 'Tețcani', 'Тецканы', 'Drepcăuți',
];

// Маркеры критичных секций промпта. Отсутствие = prompt_drift (журнал);
// секция ORELE лечится добавлением заново (идемпотентно по маркеру, в КОНЕЦ —
// префикс промпта не трогаем, кэш Anthropic не инвалидируем).
const PROMPT_MARKERS = ['DOSLOVEN DIN TOOL', 'UNIVERSUL localităților', 'Doriți numărul lui?', 'A DOUA OARĂ LA RÂND'];
const ORELE_BLOCK = `

ORELE — DOSLOVEN DIN TOOL:
- Ora plecării/sosirii o rostești DOAR din câmpul departure_spoken_ro (română) / departure_spoken_ru (rusă) al rezultatului tool-ului — cuvânt cu cuvânt. NU converti niciodată singur HH:MM în cuvinte.
- Compararea cu ora cerută de client o faci pe câmpul «departure» (HH:MM). NICIODATĂ nu spui «nu am cursă la ora X» fără să fi scanat toată lista.
- Câmpul _spoken lipsește? Spui ora cifra cu cifra din «departure», fără conversii creative.`;

const elHeaders = () => ({ 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '', 'content-type': 'application/json' });

async function elGet(path: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${EL}${path}`, { headers: elHeaders(), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`EL GET ${path}: ${r.status}`);
  return r.json();
}

async function elPatchAgent(body: unknown): Promise<void> {
  const r = await fetch(`${EL}/v1/convai/agents/${AGENT_ID}`, {
    method: 'PATCH', headers: elHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`EL PATCH agent: ${r.status} ${await r.text()}`);
}

async function canonKeywords(): Promise<string[]> {
  try {
    const { data } = await getSupabase().from('voice_agent_canon').select('value').eq('key', 'asr_keywords').maybeSingle();
    const v = data?.value;
    if (Array.isArray(v) && v.length > 0 && v.length <= 50) return v as string[];
  } catch { /* fallback mai jos */ }
  return FALLBACK_KEYWORDS;
}

type Drift = { field: string; healed: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkAndHealConfig(cfg: any): Promise<Drift[]> {
  const drifts: Drift[] = [];
  const ps = cfg.platform_settings ?? {};
  const cc = cfg.conversation_config ?? {};

  // --- platform_settings: un singur PATCH pentru tot ce a deviat ---
  const psPatch: Record<string, unknown> = {};
  const ov = ps.overrides ?? {};
  const agOv = ov.conversation_config_override?.agent ?? {};
  if (!ov.enable_conversation_initiation_client_data_from_webhook || !agOv.first_message || !agOv.language) {
    psPatch.overrides = {
      ...ov,
      enable_conversation_initiation_client_data_from_webhook: true,
      conversation_config_override: {
        ...(ov.conversation_config_override ?? {}),
        agent: { ...agOv, first_message: true, language: true },
      },
    };
    drifts.push({ field: 'overrides.webhook_flags', healed: true });
  }
  const wh = ps.workspace_overrides?.conversation_initiation_client_data_webhook;
  if (wh?.url !== INIT_WEBHOOK_URL || !wh?.request_headers?.['x-voice-api-key']) {
    psPatch.workspace_overrides = {
      conversation_initiation_client_data_webhook: {
        url: INIT_WEBHOOK_URL,
        request_headers: { 'x-voice-api-key': process.env.VOICE_API_KEY ?? '' },
      },
    };
    drifts.push({ field: 'init_webhook_url', healed: true });
  }
  if (Object.keys(psPatch).length) await elPatchAgent({ platform_settings: psPatch });

  if (cc.agent?.prompt?.custom_llm?.url !== CUSTOM_LLM_URL) {
    drifts.push({ field: 'custom_llm.url', healed: false }); // URL-ul se schimbă doar de om — nu-l «vindecăm» orb
  }

  // --- conversation_config: la fel, un singur PATCH ---
  const ccPatch: Record<string, unknown> = {};
  const canon = await canonKeywords();
  const kw: string[] = cc.asr?.keywords ?? [];
  if (kw.join('|') !== canon.join('|')) {
    ccPatch.asr = { ...cc.asr, keywords: canon };
    drifts.push({ field: 'asr.keywords', healed: true });
  }
  const bg = cc.conversation?.background_sound;
  if (bg?.source_id !== 'office1' || bg?.volume !== 0.1) {
    ccPatch.conversation = {
      ...cc.conversation,
      background_sound: { source_type: 'preset', source_id: 'office1', volume: 0.1, crossfade_loop: true },
    };
    drifts.push({ field: 'background_sound', healed: true });
  }
  const prompt: string = cc.agent?.prompt?.prompt ?? '';
  const missing = PROMPT_MARKERS.filter((m) => !prompt.includes(m));
  if (missing.includes('DOSLOVEN DIN TOOL')) {
    ccPatch.agent = { prompt: { prompt: prompt + ORELE_BLOCK } };
    drifts.push({ field: 'prompt.ORELE', healed: true });
  }
  for (const m of missing.filter((x) => x !== 'DOSLOVEN DIN TOOL')) {
    drifts.push({ field: `prompt.${m}`, healed: false });
  }
  if (Object.keys(ccPatch).length) await elPatchAgent({ conversation_config: ccPatch });

  return drifts;
}

// ---- Обратный парсер времён из речи агента (таблицы — из time-spoken) ----
const RO_W: Record<string, number> = {};
const RU_W: Record<string, number> = {};
{
  RO_UNITS.forEach((w, i) => { RO_W[w] = i; });
  RU_UNITS.forEach((w, i) => { RU_W[w] = i; });
  for (let t = 2; t <= 5; t++) {
    RO_W[RO_TENS[t]] = t * 10;
    RU_W[RU_TENS[t]] = t * 10;
    for (let u = 1; u <= 9; u++) {
      RO_W[`${RO_TENS[t]} și ${RO_UNITS[u]}`] = t * 10 + u;
      RU_W[`${RU_TENS[t]} ${RU_UNITS[u]}`] = t * 10 + u;
    }
  }
}
const NUM_ALT_RO = Object.keys(RO_W).sort((a, b) => b.length - a.length).join('|');
const NUM_ALT_RU = Object.keys(RU_W).sort((a, b) => b.length - a.length).join('|');
// Минуты — ТОЛЬКО формы, которые реально излучает time-spoken: «fix»/«ноль-ноль»,
// «ноль X» (RU), десятки и составные. Голые единицы 1-9 исключены → «двадцать шесть
// лей» и «douăzeci și trei august» не парсятся как время (ревью 5bed93a, Important 1).
const RO_MIN_ALT = ['fix', ...Object.keys(RO_W).filter((k) => RO_W[k] >= 10)].sort((a, b) => b.length - a.length).join('|');
const RU_MIN_ALT = ['ноль-ноль', ...Object.keys(RU_W).filter((k) => RU_W[k] >= 10).map((k) => k), ...RU_UNITS.slice(1, 10).map((u) => `ноль ${u}`)]
  .sort((a, b) => b.length - a.length).join('|');
// «...douăzeci și cinci de lei» / «двадцать пять лей» — цены и даты режем lookahead-ом.
const NOT_MONEY_DATE = '(?!\\s*(?:de\\s+lei|lei|bani|лей|лея|леев|august|septembrie|octombrie|noiembrie|decembrie|ianuarie|februarie|martie|aprilie|mai|iunie|iulie|августа|сентября|октября|ноября|декабря|января|февраля|марта|апреля|мая|июня|июля))';
// NU \b: în JS el nu vede chirilicele/diacriticele ca litere (aceeași capcană ca în
// stripThinkingAloud, a310832) — cu \b toată ramura rusă era MOARTĂ (test 23.08).
// «și» e opțional DOAR pentru «fix» (emitter-ul zice «șaisprezece fix», fără și) —
// gardă în parse: minutele normale cer «și» prezent în match.
const RO_TIME_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${NUM_ALT_RO})\\s+(?:și\\s+)?(${RO_MIN_ALT})${NOT_MONEY_DATE}(?![\\p{L}\\p{N}])`, 'giu');
const RU_TIME_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${NUM_ALT_RU})\\s+(${RU_MIN_ALT})${NOT_MONEY_DATE}(?![\\p{L}\\p{N}])`, 'giu');

export function parseSpokenTimes(text: string): string[] {
  const out: string[] = [];
  for (const [re, dict] of [[RO_TIME_RE, RO_W], [RU_TIME_RE, RU_W]] as const) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const h = dict[m[1].toLowerCase()];
      const minRaw = m[2].toLowerCase();
      // RO: minutele normale se leagă OBLIGATORIU cu «și» — fără el, «douăzeci trei»
      // dintr-o enumerare ar deveni «20:03». «fix» e singura formă fără «și».
      if (dict === RO_W && minRaw !== 'fix' && !/\sși\s/.test(m[0])) continue;
      let min: number | undefined;
      if (minRaw === 'ноль-ноль' || minRaw === 'fix') min = 0;
      else if (minRaw.startsWith('ноль ')) min = dict[minRaw.slice(5)];
      else min = dict[minRaw];
      if (h === undefined || h > 23 || min === undefined || min > 59) continue;
      // Orarul real are mereu minutele multiplu de 5 — restul e zgomot (prețuri, km).
      if (min % 5 !== 0) continue;
      out.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    }
  }
  return out;
}

// ---- Продиктованные телефоны: цепочка цифро-слов ≥9 → строка цифр ----
const DIGIT_RO = new Map(RO_UNITS.slice(0, 10).map((w, i) => [w, String(i)]));
const DIGIT_RU = new Map(RU_UNITS.slice(0, 10).map((w, i) => [w, String(i)]));

export function parseSpokenPhones(text: string): string[] {
  const out: string[] = [];
  const tokens = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  let run = '';
  const flush = () => {
    if (run.length >= 9) out.push(run.slice(0, 9));
    run = '';
  };
  for (const tok of tokens) {
    const d = DIGIT_RO.get(tok) ?? DIGIT_RU.get(tok);
    if (d !== undefined) run += d;
    else flush();
  }
  flush();
  return out;
}

async function validateRecentCalls(): Promise<Incident[]> {
  const incidents: Incident[] = [];
  const list = await elGet(`/v1/convai/conversations?agent_id=${AGENT_ID}&page_size=10`);
  const cutoff = Date.now() / 1000 - 2 * 3600; // ultimele 2h; dedupe face restul
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recent = (((list as any).conversations ?? []) as any[])
    .filter((c) => (c.start_time_unix_secs ?? 0) >= cutoff)
    .slice(0, MAX_CALLS_PER_RUN);
  // Paralel: secvențial risca maxDuration=60s la vârfuri de latență EL (perf-review 5bed93a).
  const details = await Promise.allSettled(
    recent.map((c) => elGet(`/v1/convai/conversations/${c.conversation_id}`)),
  );
  details.forEach((res, i) => {
    if (res.status !== 'fulfilled') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = res.value;
    const turns: any[] = d.transcript ?? [];
    const allowed = new Set<string>();
    const allowedPhones = new Set<string>();
    let sawTripTool = false;
    for (const t of turns) {
      for (const tr of t.tool_results ?? []) {
        const raw = typeof tr.result_value === 'string' ? tr.result_value : JSON.stringify(tr.result_value ?? '');
        for (const mm of raw.matchAll(/"(?:departure|arrival)":"(\d{1,2}:\d{2})"/g)) {
          sawTripTool = true;
          allowed.add(mm[1].padStart(5, '0'));
        }
        // Телефоны из тулов: 373XXXXXXXX → локальный 0XXXXXXXX (как их диктует phone_spoken).
        for (const mm of raw.matchAll(/"phone":"\+?(\d{8,12})"/g)) {
          const digits = mm[1];
          allowedPhones.add(digits.startsWith('373') ? '0' + digits.slice(3) : digits);
        }
      }
    }
    if (!sawTripTool) return; // fără date de curse nu avem cu ce compara
    const agentText = turns.filter((t) => t.role === 'agent' && t.message).map((t) => t.message).join('\n');
    for (const spoken of new Set(parseSpokenTimes(agentText))) {
      if (!allowed.has(spoken)) {
        incidents.push({
          conversation_id: recent[i].conversation_id,
          kind: 'spoken_time_mismatch',
          details: { spoken, allowed: [...allowed].sort() },
        });
      }
    }
    // Аналогично для номеров: продиктованное не из тулов = инцидент (жалоба Иона
    // 24.08: не тот водитель/номер при чтении длинного списка).
    for (const spoken of new Set(parseSpokenPhones(agentText))) {
      if (allowedPhones.size > 0 && !allowedPhones.has(spoken)) {
        incidents.push({
          conversation_id: recent[i].conversation_id,
          kind: 'spoken_phone_mismatch',
          details: { spoken, allowed: [...allowedPhones].sort() },
        });
      }
    }
  });
  return incidents;
}

export async function runVoiceController(): Promise<{ drifts: Drift[]; incidents: number }> {
  const cfg = await elGet(`/v1/convai/agents/${AGENT_ID}`);
  const drifts = await checkAndHealConfig(cfg);

  const incidents = await validateRecentCalls();
  const supabase = getSupabase();
  for (const d of drifts) {
    // Dedupe 24h pentru drift-uri (n-au conversation_id — indexul unic nu le acoperă):
    // altfel un URL nevindecat intenționat ar umple jurnalul la fiecare 30 min.
    const { data: recent } = await supabase.from('voice_controller_incidents')
      .select('id').eq('kind', d.field.startsWith('prompt.') ? 'prompt_drift' : 'config_drift')
      .eq('details->>field', d.field)
      .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .limit(1);
    if (recent?.length) continue;
    await supabase.from('voice_controller_incidents').insert({
      kind: d.field.startsWith('prompt.') ? 'prompt_drift' : 'config_drift',
      details: d,
      healed: d.healed,
    });
  }
  for (const inc of incidents) {
    // Vorbirea deja rostită nu se vindecă — healed=false întotdeauna aici.
    // Indexul unic de dedupe respinge dublurile (23505) — le înghițim tăcut.
    const { error } = await supabase.from('voice_controller_incidents')
      .insert({ ...inc, healed: false });
    if (error && error.code !== '23505') console.error('[voice-controller] insert:', error.message);
  }
  return { drifts, incidents: incidents.length };
}
