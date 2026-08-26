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
import { auditAliasShadow, syncCanonKeywords } from '@/lib/voice-canon';
import { AGENT_ID, elGet, elPatchAgent } from '@/lib/voice/el';
import { drainPendingExams } from '@/lib/voice-exams';
import { RO_UNITS, RO_TENS, RU_UNITS, RU_TENS } from '@/lib/time-spoken';

const INIT_WEBHOOK_URL = 'https://central-hub-md.vercel.app/api/voice/webhooks/init';
const CUSTOM_LLM_URL = 'https://translux-voice-llm.vercel.app/api';
const MAX_CALLS_PER_RUN = 8;

// Фолбэк эталона словаря (решение Иона 23.08); боевой эталон — в voice_agent_canon.
// С 26.08 канон в БД ЖИВОЙ: его дописывает syncCanonKeywords (voice-canon.ts) из
// выученных алиасов. Список ниже — аварийный, НЕ «истинное» состояние: не чините
// канон по нему, сотрёте выученное.
// Русские формы выверены по районным реестрам (миграция 275): подсказывать
// распознавателю «Единцы»/«Калининск» — значит учить его словам, отменённым в 1991-м.
const FALLBACK_KEYWORDS = [
  'TRANSLUX',
  'Chișinău', 'Кишинёв', 'Bălți', 'Бельцы', 'Orhei', 'Орхей', 'Sîngerei', 'Сынжерей',
  'Rîșcani', 'Рышканы', 'Briceni', 'Бричаны', 'Lipcani', 'Липканы', 'Edineț', 'Единец',
  'Cupcini', 'Купчинь', 'Ocnița', 'Окница', 'Otaci', 'Атаки', 'Criva', 'Крива',
  'Peresecina', 'Пересечино', 'Corjeuți', 'Коржеуцы', 'Măgdăcești', 'Магдачешты',
  'Brătușeni', 'Братушаны', 'Larga', 'Ларга', 'Grimăncăuți', 'Гриманкауцы',
  'Caracușenii Vechi', 'Старые Каракушаны', 'Tîrnova', 'Тырново', 'Tabani', 'Табаны',
  'Vălcineț', 'Волчинец', 'Cotiujeni', 'Котюжены', 'Tețcani', 'Тецканы', 'Drepcăuți',
];

// Маркеры критичных секций промпта. Отсутствие = prompt_drift (журнал);
// секции ORELE и ZIUA лечатся до-записью в конец (идемпотентно по маркеру).
// Позиция вставки кэш НЕ спасает: точка кэша одна, на весь system.
// Markerele TREBUIE să fie unice: un marker care apare și în alt bloc face detectorul
// orb la ștergerea blocului propriu (ORELE a fost mascat de titlul blocului ZIUA).
const PROMPT_MARKERS = ['ORELE — DOSLOVEN', 'UNIVERSUL localităților', 'Doriți numărul lui?', 'A DOUA OARĂ LA RÂND', 'ZIUA — DOSLOVEN', 'e un CORIDOR', 'SFÂRȘIT NUME RUSEȘTI'];
const ORELE_BLOCK = `

ORELE — DOSLOVEN DIN TOOL:
- Ora plecării/sosirii o rostești DOAR din câmpul departure_spoken_ro (română) / departure_spoken_ru (rusă) al rezultatului tool-ului — cuvânt cu cuvânt. La fel arrival_spoken_*. NU converti niciodată singur HH:MM în cuvinte.
- CEA MAI APROPIATĂ / PRIMA cursă = PRIMUL element din câmpul departures_ro (română) / departures_ru (rusă) — ultimul element = ultima. Enumerarea curselor o citești DIN ACEST câmp, în ordinea dată. NU alege «cea mai apropiată» scanând singur lista.
- Compararea cu ora cerută de client o faci pe câmpul «departure» (HH:MM), rostirea — pe «departure_spoken_*». NICIODATĂ nu spui «nu am cursă la ora X» fără să fi scanat toată lista.
- Numerele DOAR cu cuvinte românești sau rusești corecte. Forme ca «ventitre» nu există.
- Aceeași cursă = aceeași oră în TOATE replicile. Nu «reciti» lista din memorie — dacă nu mai știi, cheamă tool-ul din nou.
- Câmpul _spoken lipsește? Spui ora cifra cu cifra din «departure», fără conversii creative.`;

// Ziua. Apel real 24.08 (Bălți→Ocnița): modelul a primit cursele de AZI, le-a anunțat
// «mâine, 24 august», iar la «сегодня» a răspuns «на сегодня рейсов нет». Al doilea apel,
// 17:30: la «prima cursă de dimineață devreme» a dat cursa de 18:10 — lista de azi e
// tăiată de server la ora curentă, iar modelul nu avea cum să știe.
// Ceasul NU intră în prompt: ar fi singurul element volatil dintr-un system cache-uit
// integral (~6k tokeni) și l-ar rescrie la fiecare minut de convorbire. În schimb
// modelul trimite cuvântul rostit, iar serverul îl transformă în dată.
const DATA_BLOCK = `

ZIUA — DOSLOVEN DIN TOOL:
- Tu NU știi ce zi e azi și nu ai voie să ghicești. Ziua o hotărăște serverul.
- În parametrul «date» al lui search_trips trimiți CUVÂNTUL rostit de client: «azi», «mâine», «poimâine» sau ziua săptămânii («sâmbătă», «в субботу»). A rostit doar numărul zilei («pe treizeci»)? Trimiți DOAR numărul: «30». A rostit și luna? Atunci zi.lună: «30.08». Serverul le rezolvă pe toate — luna și anul le pune el. NU compune niciodată o dată întreagă și NU scrie niciun an.
- Clientul nu a spus nicio zi? Lași «date» gol: serverul ia ziua de azi.
- Ziua curselor o rostești DOAR din câmpul date_label_ro (română) / date_label_ru (rusă) al rezultatului — cuvânt cu cuvânt. Câmpul lipsește? Atunci nu numești ziua deloc.
- is_today true = sunt EXACT cursele de azi. NICIODATĂ nu spui «pe azi nu sunt curse» când tool-ul tocmai a întors curse.
- only_remaining_today true = cursele mai devreme ale zilei au plecat deja. Atunci prima din listă e «cea mai apropiată de azi», NU «prima cursă a zilei» — nu o numi așa.
- Clientul cere o oră care azi a trecut deja (cere «dimineața devreme», iar cursele rămase sunt toate de seară)? Aici regula «cea mai apropiată la sau după ora cerută» NU se aplică: o cursă de seară nu e răspuns la «dimineața devreme». Ceri search_trips cu date=«mâine» și dai orele de atunci.`;

// Descrierea tool-ului language_detection (sesiunea translux-a9, 24.08): filtrul
// anti-comutare-falsă STĂ în schema tool-ului, exact la punctul de decizie al
// modelului (regula din prompt a picat 3/3). Dashboard-ul o poate șterge tăcut
// (s-a întâmplat la TLX 22.08) — de aceea intră în canon cu self-heal.
const LANG_DETECT_DESC = `Schimbă limba conversației. ATENȚIE: schimbarea e IREVERSIBILĂ — după ea transcrierea trece pe limba nouă și tot ce spune clientul, chiar în română curată, apare scris cu chirilice. Nu mai există drum înapoi.

NU chema acest tool pentru replici scurte. Cuvintele «da», «alo», «aha», «nu», «bine», «mersi», «poftim», «gata», «ok», «hai», «așa», «anume» sună IDENTIC în română și rusă; transcrierea le scrie des cu chirilice deși clientul vorbește română. Ele NU sunt niciodată dovadă de limbă.

Cheamă tool-ul DOAR când clientul a rostit DOUĂ propoziții COMPLETE la rând (minimum 3 cuvinte fiecare, cu verb) în limba nouă. O singură replică, oricât de clar rusească pare, NU e motiv de schimbare.

Transcriere fără sens sau amestecată? Rămâi pe limba curentă și roagă scurt să repete. Ai orice dubiu? NU chema tool-ul.`;

// Rețeaua e un CORIDOR, nu o stea cu centrul la Chișinău. Promptul spunea «toată
// rețeaua e Chișinău ↔ Nord», iar modelul a citit-o literal: refuza din capul lui
// orice pereche nord–nord, FĂRĂ să cheme tool-ul. Apeluri reale pierdute: 26.08
// «Bălți și Tețcani nu sunt pe ruta noastră» (existau 6 curse), 24.08 «Ocnița și
// Briceni nu sunt pe ruta TRANSLUX» (sunt noduri ale rețelei), 22.08 «не обслуживаем
// маршрут из Коржеуца». Regula stă în prompt fiindcă tool-ul nici nu era chemat.
const CORIDOR_BLOCK = `

REȚEAUA E UN CORIDOR:
- Rețeaua TRANSLUX e un CORIDOR: Chișinău – Bălți – Nord, cu zeci de opriri pe el. Se circulă între ORICARE două opriri de pe coridor, nu doar dinspre sau spre Chișinău. Bălți–Tețcani, Bălți–Ocnița, Briceni–Bălți, Sîngerei–Edineț sunt curse REALE, cu orar și șofer.
- NU refuza NICIODATĂ o pereche de localități din capul tău și NU spune «noi mergem doar din Chișinău» — trimiți perechea în search_trips și serverul răspunde dacă există curse.
- Dacă clientul numește O SINGURĂ localitate, celălalt capăt e cel mai probabil Chișinău — NU întreba «spre unde?», caută așa.`;

// Filtrul anti-comutare-falsă. A trăit în descrierea tool-ului language_detection, dar
// 25.08 s-a văzut limita: dacă modelul NU cheamă tool-ul, textul din tool nu există
// pentru el. De aceea regula stă acum și în prompt, sub marker propriu.
const LIMBA_BLOCK = `

LIMBA — A DOUA OARĂ LA RÂND:
- Treci pe rusă DOAR când clientul vorbește rusește A DOUA OARĂ LA RÂND — două propoziții COMPLETE (minimum 3 cuvinte fiecare, cu verb) în rusă.
- O SINGURĂ replică ce pare rusească NU e motiv de schimbare: transcrierea scrie des româna cu chirilice, iar «da», «alo», «aha», «nu», «bine», «mersi» sună identic în ambele limbi.
- Transcriere fără sens sau orice dubiu? Rămâi pe limba curentă și roagă scurt să repete.`;

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
  // Blocurile auto-vindecabile se adaugă în COADĂ, idempotent după marker. Poziția NU
  // salvează cache-ul (punctul de cache e unul singur, pe tot system-ul) — de aceea
  // blocurile trebuie să rămână statice, fără variabile care se schimbă în timpul apelului.
  const HEALABLE = [
    { marker: 'ORELE — DOSLOVEN', block: ORELE_BLOCK, field: 'prompt.ORELE' },
    { marker: 'ZIUA — DOSLOVEN', block: DATA_BLOCK, field: 'prompt.ZIUA' },
    { marker: 'e un CORIDOR', block: CORIDOR_BLOCK, field: 'prompt.CORIDOR' },
    { marker: 'A DOUA OARĂ LA RÂND', block: LIMBA_BLOCK, field: 'prompt.LIMBA' },
  ];
  let healedPrompt = prompt;
  for (const h of HEALABLE) {
    if (missing.includes(h.marker)) {
      healedPrompt += h.block;
      drifts.push({ field: h.field, healed: true });
    }
  }
  if (healedPrompt !== prompt) ccPatch.agent = { prompt: { prompt: healedPrompt } };
  for (const m of missing.filter((x) => !HEALABLE.some((h) => h.marker === x))) {
    drifts.push({ field: `prompt.${m}`, healed: false });
  }
  // cascade_timeout 12s: scuza de avarie (FIRST_CHUNK_MS=6500 în proxy) trebuie să
  // apuce să iasă înaintea cascadei EL (incident TLX 24.08, portat).
  // PATCH parțial pe agent.prompt e SIGUR: verificat empiric 24.08 — după PATCH doar
  // cu cascade_timeout_seconds, prompt-ul (17k), custom_llm.url și tool_ids au rămas
  // intacte (merge per-cheie, ca la platform_settings; scratchpad cristina-check).
  if (cc.agent?.prompt?.cascade_timeout_seconds !== 12) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentPatch: any = ccPatch.agent ?? {};
    agentPatch.prompt = { ...(agentPatch.prompt ?? {}), cascade_timeout_seconds: 12 };
    ccPatch.agent = agentPatch;
    drifts.push({ field: 'cascade_timeout_seconds', healed: true });
  }
  // built_in_tools.language_detection.description — filtrul anti-comutare-falsă.
  const bit = cc.agent?.prompt?.built_in_tools;
  if (bit?.language_detection && bit.language_detection.description !== LANG_DETECT_DESC) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentPatch: any = ccPatch.agent ?? {};
    agentPatch.prompt = {
      ...(agentPatch.prompt ?? {}),
      built_in_tools: { ...bit, language_detection: { ...bit.language_detection, description: LANG_DETECT_DESC } },
    };
    ccPatch.agent = agentPatch;
    drifts.push({ field: 'language_detection.description', healed: true });
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

type Incident = { conversation_id: string; kind: string; details: Record<string, unknown> };

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
    const addPhone = (raw: unknown) => {
      const digits = String(raw ?? '').replace(/\D/g, '');
      if (digits.length < 8) return;
      allowedPhones.add(digits.startsWith('373') ? '0' + digits.slice(3) : digits);
    };
    // Номер ЗВОНЯЩЕГО тоже разрешён: агент повторяет его при colback-е (review
    // 6df570a, Important) — иначе гарантированный ложный spoken_phone_mismatch.
    addPhone(d.metadata?.phone_call?.external_number);
    addPhone(d.conversation_initiation_client_data?.dynamic_variables?.system__caller_id);
    let sawTripTool = false;
    for (const t of turns) {
      // Телефоны из ПАРАМЕТРОВ тулов (request_callback: клиент мог продиктовать другой).
      for (const tc of t.tool_calls ?? []) {
        const params = String(tc.params_as_json ?? '');
        for (const mm of params.matchAll(/"phone"\s*:\s*"([^"]+)"/g)) addPhone(mm[1]);
      }
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
  const t0 = Date.now();
  // ДО чтения канона: гасим алиасы, накрывшие чужое имя (кнопка ✓ у человека may
  // промахнуться), и доливаем выученное в asr_keywords — heal ниже донесёт до EL.
  await auditAliasShadow();
  await syncCanonKeywords();

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

  // Экзамены: дочитать прогон, который судья не успел (claim атомарный). Гейт по
  // бюджету: в дорогом прогоне (heal+валидатор упёрлись в таймауты EL) драйн
  // пропускается — он идемпотентен и повторится через 30 минут (perf-ревью).
  if (Date.now() - t0 < 35_000) await drainPendingExams();

  return { drifts, incidents: incidents.length };
}
