// Контролёр голосового агента (Ион, 23.08: «не алерты — фиксить сам»).
// Две обязанности за прогон:
//  1) КОНФИГ-ИНВАРИАНТЫ: сверить живой конфиг агента с эталоном и молча вернуть
//     всё съехавшее (классы поломок, ловленные руками: выключенный флаг вебхука,
//     затёртые секции промпта, словарь ASR, фон, URL прокси).
//  2) ВАЛИДАТОР ЗВОНКОВ: произнесённые агентом времена сверить со временами из
//     tool-результатов того же звонка; расхождение = incident в журнал (без пушей).
// Уже сказанное в трубку не исправить — «фиксит сам» значит: конфиг лечится сразу,
// расхождения фиксируются и покрываются лечением конфига.
import { getSupabase } from '@/lib/supabase';

const AGENT_ID = 'agent_3301kn4qwa6jep38d4b63m6s6pkh';
const EL = 'https://api.elevenlabs.io';
const INIT_WEBHOOK_URL = 'https://central-hub-md.vercel.app/api/voice/webhooks/init';
const CUSTOM_LLM_URL = 'https://translux-voice-llm.vercel.app/api';

// Эталонный словарь ASR (решение Иона 23.08: города+крупные/сложные сёла, RO+RU, лимит 50).
const CANON_KEYWORDS = [
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
// секция ORELE лечится добавлением заново (идемпотентно по маркеру).
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

type Drift = { field: string; healed: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkAndHealConfig(cfg: any): Promise<Drift[]> {
  const drifts: Drift[] = [];
  const ps = cfg.platform_settings ?? {};
  const cc = cfg.conversation_config ?? {};

  const ov = ps.overrides ?? {};
  const agOv = ov.conversation_config_override?.agent ?? {};
  if (!ov.enable_conversation_initiation_client_data_from_webhook || !agOv.first_message || !agOv.language) {
    await elPatchAgent({
      platform_settings: {
        overrides: {
          ...ov,
          enable_conversation_initiation_client_data_from_webhook: true,
          conversation_config_override: {
            ...(ov.conversation_config_override ?? {}),
            agent: { ...agOv, first_message: true, language: true },
          },
        },
      },
    });
    drifts.push({ field: 'overrides.webhook_flags', healed: true });
  }

  const wh = ps.workspace_overrides?.conversation_initiation_client_data_webhook;
  if (wh?.url !== INIT_WEBHOOK_URL || !wh?.request_headers?.['x-voice-api-key']) {
    await elPatchAgent({
      platform_settings: {
        workspace_overrides: {
          conversation_initiation_client_data_webhook: {
            url: INIT_WEBHOOK_URL,
            request_headers: { 'x-voice-api-key': process.env.VOICE_API_KEY ?? '' },
          },
        },
      },
    });
    drifts.push({ field: 'init_webhook_url', healed: true });
  }

  if (cc.agent?.prompt?.custom_llm?.url !== CUSTOM_LLM_URL) {
    drifts.push({ field: 'custom_llm.url', healed: false }); // URL-ul se schimbă doar de om — nu-l «vindecăm» orb
  }

  const kw: string[] = cc.asr?.keywords ?? [];
  if (kw.join('') !== CANON_KEYWORDS.join('')) {
    await elPatchAgent({ conversation_config: { asr: { ...cc.asr, keywords: CANON_KEYWORDS } } });
    drifts.push({ field: 'asr.keywords', healed: true });
  }

  const bg = cc.conversation?.background_sound;
  if (bg?.source_id !== 'office1' || bg?.volume !== 0.1) {
    await elPatchAgent({
      conversation_config: {
        conversation: {
          ...cc.conversation,
          background_sound: { source_type: 'preset', source_id: 'office1', volume: 0.1, crossfade_loop: true },
        },
      },
    });
    drifts.push({ field: 'background_sound', healed: true });
  }

  const prompt: string = cc.agent?.prompt?.prompt ?? '';
  const missing = PROMPT_MARKERS.filter((m) => !prompt.includes(m));
  if (missing.length) {
    if (missing.includes('DOSLOVEN DIN TOOL')) {
      await elPatchAgent({ conversation_config: { agent: { prompt: { prompt: prompt + ORELE_BLOCK } } } });
      drifts.push({ field: 'prompt.ORELE', healed: true });
    }
    for (const m of missing.filter((x) => x !== 'DOSLOVEN DIN TOOL')) {
      drifts.push({ field: `prompt.${m}`, healed: false });
    }
  }

  return drifts;
}

// ---- Обратный парсер времён из речи агента (те же таблицы, что time-spoken) ----
const RO_W: Record<string, number> = {};
const RU_W: Record<string, number> = {};
{
  const ro = ['zero', 'unu', 'doi', 'trei', 'patru', 'cinci', 'șase', 'șapte', 'opt', 'nouă',
    'zece', 'unsprezece', 'doisprezece', 'treisprezece', 'paisprezece', 'cincisprezece',
    'șaisprezece', 'șaptesprezece', 'optsprezece', 'nouăsprezece'];
  const ru = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять',
    'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
    'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  ro.forEach((w, i) => { RO_W[w] = i; });
  ru.forEach((w, i) => { RU_W[w] = i; });
  const roTens: [string, number][] = [['douăzeci', 20], ['treizeci', 30], ['patruzeci', 40], ['cincizeci', 50]];
  const ruTens: [string, number][] = [['двадцать', 20], ['тридцать', 30], ['сорок', 40], ['пятьдесят', 50]];
  for (const [tw, tv] of roTens) {
    RO_W[tw] = tv;
    ro.slice(1, 10).forEach((u, i) => { RO_W[`${tw} și ${u}`] = tv + i + 1; });
  }
  for (const [tw, tv] of ruTens) {
    RU_W[tw] = tv;
    ru.slice(1, 10).forEach((u, i) => { RU_W[`${tw} ${u}`] = tv + i + 1; });
  }
}

const NUM_ALT_RO = Object.keys(RO_W).sort((a, b) => b.length - a.length).join('|');
const NUM_ALT_RU = Object.keys(RU_W).sort((a, b) => b.length - a.length).join('|');
// «ora paisprezece și douăzeci» / «четырнадцать двадцать» / «четырнадцать ноль пять»
const RO_TIME_RE = new RegExp(`\\b(${NUM_ALT_RO})\\s+și\\s+(${NUM_ALT_RO})\\b`, 'giu');
const RU_TIME_RE = new RegExp(`\\b(${NUM_ALT_RU})\\s+(ноль[ -]?(?:${NUM_ALT_RU})|${NUM_ALT_RU}|ноль-ноль)\\b`, 'giu');

function parseSpokenTimes(text: string): string[] {
  const out: string[] = [];
  for (const [re, dict, sep] of [[RO_TIME_RE, RO_W, ' și '], [RU_TIME_RE, RU_W, ' ']] as const) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const h = dict[m[1].toLowerCase()];
      let minRaw = m[2].toLowerCase();
      let min: number | undefined;
      if (minRaw === 'ноль-ноль') min = 0;
      else if (minRaw.startsWith('ноль')) min = dict[minRaw.replace(/^ноль[ -]?/, '')];
      else min = dict[minRaw];
      void sep;
      if (h === undefined || h > 23 || min === undefined || min > 59) continue;
      // Prețuri/date scapă de regex prin structură (au «sute»/luni, nu pereche oră-minut).
      out.push(`${h}:${String(min).padStart(2, '0')}`.replace(/^(\d):/, '0$1:'));
    }
  }
  return out;
}

type Incident = { conversation_id: string; kind: string; details: Record<string, unknown> };

async function validateRecentCalls(): Promise<Incident[]> {
  const incidents: Incident[] = [];
  const list = await elGet(`/v1/convai/conversations?agent_id=${AGENT_ID}&page_size=10`);
  const cutoff = Date.now() / 1000 - 2 * 3600; // ultimele 2h; dedupe face restul
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of ((list as any).conversations ?? []) as any[]) {
    if ((c.start_time_unix_secs ?? 0) < cutoff) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await elGet(`/v1/convai/conversations/${c.conversation_id}`);
    const turns: any[] = d.transcript ?? [];
    const allowed = new Set<string>();
    let sawTripTool = false;
    for (const t of turns) {
      for (const tr of t.tool_results ?? []) {
        const raw = typeof tr.result_value === 'string' ? tr.result_value : JSON.stringify(tr.result_value ?? '');
        for (const mm of raw.matchAll(/"(?:departure|arrival)":"(\d{1,2}:\d{2})"/g)) {
          sawTripTool = true;
          allowed.add(mm[1].replace(/^(\d):/, '0$1:'));
        }
      }
    }
    if (!sawTripTool) continue; // fără date de curse nu avem cu ce compara
    const agentText = turns.filter((t) => t.role === 'agent' && t.message).map((t) => t.message).join('\n');
    for (const spoken of new Set(parseSpokenTimes(agentText))) {
      if (!allowed.has(spoken)) {
        incidents.push({
          conversation_id: c.conversation_id,
          kind: 'spoken_time_mismatch',
          details: { spoken, allowed: [...allowed].sort() },
        });
      }
    }
  }
  return incidents;
}

export async function runVoiceController(): Promise<{ drifts: Drift[]; incidents: number }> {
  const cfg = await elGet(`/v1/convai/agents/${AGENT_ID}`);
  const drifts = await checkAndHealConfig(cfg);

  const incidents = await validateRecentCalls();
  const supabase = getSupabase();
  if (drifts.length) {
    await supabase.from('voice_controller_incidents').insert(
      drifts.map((d) => ({ kind: d.healed ? 'config_drift' : 'prompt_drift', details: d, healed: d.healed })),
    );
  }
  for (const inc of incidents) {
    // Indexul unic de dedupe respinge dublurile (23505) — le înghițim tăcut:
    // PostgREST nu acceptă expresii în onConflict, deci insert simplu, nu upsert.
    const { error } = await supabase.from('voice_controller_incidents')
      .insert({ ...inc, healed: drifts.some((d) => d.healed) });
    if (error && error.code !== '23505') console.error('[voice-controller] insert:', error.message);
  }
  return { drifts, incidents: incidents.length };
}
