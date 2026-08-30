// Ночной судья бизнес-логики голосового агента (Ion «fa tot», 26.08).
// Замысел — extract-then-verify, как в learner-е: Haiku с чек-листом из 5 правил
// выносит нарушения по транскрипту, КОД верифицирует каждое против фактов
// (tool_calls/tool_results того же звонка, ре-прогон поиска server-side).
// Не подтверждено кодом = не существует. Подтверждённое идёт уроком
// (kind='prompt_lesson', payload.source='judge') в существующую очередь ✓/✗ —
// судит Ион, промпт агента правится только руками (правило канона).
// Судья НЕ дублирует детерминированный валидатор времён контроллера — он
// покрывает то, на что валидатора нет.
import Anthropic from '@anthropic-ai/sdk';
import { getSupabase } from '@/lib/supabase';
import { localitiesToRo, key } from '@/lib/voice-locality';
import { searchTrips } from '@/lib/trips-search';
import { resolveVoiceDate } from '@/lib/date-spoken';
import { chisinauTodayIso, chisinauDayOf } from '@/lib/chisinau-time';
import { insertLesson } from '@/lib/voice-lessons';
import { alertAdmins, escapeHtml } from '@/lib/telegram-notify';
import { generateLessonTests, startExams, pollExams, reportExamOutcome, normText, tgCut } from '@/lib/voice-exams';
import { parseSpokenPhones } from '@/lib/voice-controller';
import { COMPANY_PHONE_LOCAL } from '@/lib/company-phone';

const MAX_CALLS = 45;
const LLM_CONCURRENCY = 5;
// Потолок Hobby 60 c. Сторожа согласованы (perf-ревью): волна, стартовавшая на
// границе бюджета, кончается в 18+30=48 c < TAIL_DEADLINE — хвост достижим.
// Преамбула экзаменов живёт ВНУТРИ бюджета: ночь с созданием теста судит на
// ~волну меньше, хвост добирает следующая (замер 30.08: судья закрывает приток).
const TIME_BUDGET_MS = 18_000;
const TAIL_DEADLINE_MS = 50_000;
// Очередь Иона не резиновая: дайджест шлёт 20/день, судья отдаёт максимум 6,
// приоритет — потерянные звонки (порядок RULES ниже).
const MAX_JUDGE_LESSONS = 6;

export const RULES = ['coridor_refuz', 'neaga_curse', 'lucru_uitat', 'promite_callback', 'zi_gresita', 'pret_gresit'] as const;
export type JudgeRule = (typeof RULES)[number];

export type SearchCall = { from?: string; to?: string; date?: string };
export type PastTripResult = { count: number };
export type SearchResult = {
  count: number;
  dateLabels: string[];
  prices: number[];
};
export type JudgeFacts = {
  convId: string;
  createdAt: string;
  userTurns: number;
  agentTurns: number;
  agentText: string;
  clientText: string;
  dialog: string;
  searchCalls: SearchCall[];
  searchResults: SearchResult[];
  priceValues: number[];
  calledSearchTrips: boolean;
  calledRequestCallback: boolean;
  // Lucruri uitate: numărul de șofer are voie să iasă DOAR dintr-un find_past_trip
  // cu un singur candidat (incident 29.08: numărul șoferului ALTEI curse).
  pastTripCounts: number[];
  // Replicile agentului de DUPĂ ultimul rezultat find_past_trip (= toate replicile
  // când tool-ul nu s-a chemat). Numărul citit legitim la count=1 nu trebuie să
  // otrăvească judecata frazei corecte de după count=0 (security Low 5).
  // ARRAY, nu text lipit: parseSpokenPhones șterge orice separator ([^\p{L}]+),
  // deci pe concatenare coada «...la ora șapte» + numărul companiei din replica
  // următoare dădeau 7+06040101 → fals pozitiv lucru_uitat (audit runda 3, Medium).
  agentMsgsAfterPastTrip: string[];
};

function parseJsonSafe(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function buildFacts(convId: string, createdAt: string, transcript: unknown): JudgeFacts {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const turns: any[] = Array.isArray(transcript) ? transcript : [];
  const searchCalls: SearchCall[] = [];
  const searchResults: SearchResult[] = [];
  const priceValues: number[] = [];
  const pastTripCounts: number[] = [];
  const agentMsgs: string[] = [];
  let agentMsgsAfterPastTrip: string[] = [];
  const clientMsgs: string[] = [];
  let userTurns = 0;
  let agentTurns = 0;
  let calledRequestCallback = false;
  for (const t of turns) {
    if (t.role === 'user' && t.message) { userTurns++; clientMsgs.push(String(t.message)); }
    if (t.role === 'agent') {
      agentTurns++;
      if (t.message) {
        agentMsgs.push(String(t.message));
        agentMsgsAfterPastTrip.push(String(t.message));
      }
    }
    for (const tc of t.tool_calls ?? []) {
      if (tc.tool_name === 'request_callback') calledRequestCallback = true;
      if (tc.tool_name !== 'search_trips') continue;
      // Поле параметров: у EL два места — params_as_json и tool_details.body,
      // оба JSON-строки (фикстура снята с реальной строки voice_calls).
      const p = parseJsonSafe(tc.params_as_json) ?? parseJsonSafe(tc.tool_details?.body);
      if (p) searchCalls.push({ from: p.from as string, to: p.to as string, date: p.date as string });
    }
    for (const tr of t.tool_results ?? []) {
      const rv = parseJsonSafe(tr.result_value);
      if (!rv) continue;
      if (tr.tool_name === 'search_trips') {
        const trips = Array.isArray(rv.trips) ? rv.trips : [];
        const prices = trips
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .flatMap((x: any) => [x.price, x.original_price])
          .filter((x: unknown): x is number => typeof x === 'number' && x > 0);
        const dateLabels = [rv.date_label_ro, rv.date_label_ru, rv.date]
          .filter((x): x is string => typeof x === 'string' && x.length > 0);
        if (rv.is_today === true) dateLabels.push('azi', 'сегодня');
        searchResults.push({ count: Number(rv.count ?? 0), dateLabels, prices });
        priceValues.push(...prices);
      }
      if (tr.tool_name === 'find_past_trip') {
        pastTripCounts.push(Number(rv.count ?? 0));
        agentMsgsAfterPastTrip = []; // judecata pe numere pornește de la ULTIMUL rezultat
      }
      if (typeof rv.price === 'number') priceValues.push(rv.price);
      if (typeof rv.original_price === 'number') priceValues.push(rv.original_price);
    }
  }
  const dialog = turns
    .filter((t) => (t.role === 'user' || t.role === 'agent') && t.message)
    .map((t) => `${t.role === 'user' ? 'CLIENT' : 'AGENT'}: ${t.message}`)
    .join('\n')
    .slice(0, 6000);
  return {
    convId,
    createdAt,
    userTurns,
    agentTurns,
    // «¦» — граница реплик, которую normText НЕ вычищает: после чистки пунктуации
    // (30.08) «\n» схлопнулся бы в пробел и цитата могла бы склеиться из кусков
    // ДВУХ корректных реплик (ложный confirm, хуже всего для promite_callback).
    agentText: agentMsgs.join(' ¦ '),
    // «. » ca separator: fereastra de 60 de caractere a lui LOST_ITEM_RE nu are
    // voie să traverseze replici — \n nu e în [.!?] (round 3 Important 2).
    clientText: clientMsgs.join('. '),
    dialog,
    searchCalls,
    searchResults,
    priceValues,
    calledSearchTrips: searchCalls.length > 0,
    calledRequestCallback,
    pastTripCounts,
    agentMsgsAfterPastTrip: [...agentMsgsAfterPastTrip],
  };
}

export type JudgeViolation = {
  rule: JudgeRule;
  from?: string;
  to?: string;
  date_word?: string;
  day_said?: string;
  price_said?: number;
  quote: string;
  summary_ru: string;
};

const JUDGE_SYSTEM = `Ești un auditor de apeluri pentru compania de transport TRANSLUX (Moldova). Primești FAPTELE (ce tool-uri s-au chemat și ce au întors) și TRANSCRIPTUL. Verifici DOAR aceste reguli:
1. coridor_refuz — agentul a REFUZAT o pereche de localități («nu avem această rută», «nu circulăm acolo») FĂRĂ să fi chemat search_trips pentru acea pereche. Notează from/to exact cum le-a spus clientul și, dacă s-a spus, ziua (date_word: azi/mâine/zi a săptămânii/zi.lună).
2. neaga_curse — tool-ul a întors count>0, iar agentul a spus că nu sunt curse.
3. promite_callback — agentul promite un apel înapoi («vă sunăm noi», «un coleg vă va suna»). Interzis ÎNTOTDEAUNA, și înainte, și după request_callback: nu există operatori care sună înapoi.
4. zi_gresita — agentul numește o zi/dată care NU apare în date_label din rezultatele tool-ului (day_said = ziua rostită).
5. pret_gresit — agentul numește un preț care NU apare în rezultatele tool-urilor (price_said = numărul în lei).
6. lucru_uitat — clientul spune că a UITAT sau PIERDUT un obiect în autobuz (geantă, telefon, acte, orice), iar agentul îi dictează un număr de șofer FĂRĂ ca tool-ul find_past_trip să fi întors exact un candidat (count=1) — de exemplu numărul unui șofer din search_trips sau al unei curse «apropiate».
Răspunde DOAR JSON:
{"violations":[{"rule":"coridor_refuz"|"neaga_curse"|"promite_callback"|"zi_gresita"|"pret_gresit"|"lucru_uitat","from":"...","to":"...","date_word":"...","day_said":"...","price_said":123,"quote":"<citat EXACT din replica agentului>","summary_ru":"<одна фраза по-русски для администратора: что агент сделал не так>"}]}
Reguli stricte: doar încălcări VIZIBILE în transcript, cu citat exact al agentului. Fără deducții și fără «probabil». Nicio încălcare = {"violations":[]}. Maxim 3.`;

export function buildJudgePrompt(negativeSummaries: string[]): string {
  if (negativeSummaries.length === 0) return JUDGE_SYSTEM;
  return `${JUDGE_SYSTEM}\n\nAdministratorul a RESPINS deja constatări asemănătoare cu cele de mai jos — nu le repeta:\n${negativeSummaries.map((s) => `- ${s}`).join('\n')}`;
}

export function parseVerdicts(raw: string): JudgeViolation[] {
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    if (!Array.isArray(parsed.violations)) return [];
    return parsed.violations
      .filter((v: Record<string, unknown>) => RULES.includes(v.rule as JudgeRule))
      .map((v: Record<string, unknown>) => ({
        rule: v.rule as JudgeRule,
        from: v.from ? String(v.from).slice(0, 60) : undefined,
        to: v.to ? String(v.to).slice(0, 60) : undefined,
        date_word: v.date_word ? String(v.date_word).slice(0, 30) : undefined,
        day_said: v.day_said ? String(v.day_said).slice(0, 60) : undefined,
        price_said: typeof v.price_said === 'number' ? v.price_said : undefined,
        quote: String(v.quote ?? '').slice(0, 300),
        summary_ru: String(v.summary_ru ?? '').trim().slice(0, 300),
      }))
      .filter((v: JudgeViolation) => v.quote && v.summary_ru)
      .slice(0, 3);
  } catch {
    return [];
  }
}

// normText живёт в voice-exams (единственный источник, см. комментарий там):
// пунктуация вычищается, иначе якорь отбрасывал бы цитаты, где LLM «причесал»
// точки диктовки номера (phone-spoken, 30.08).
/** Цитата обязана дословно существовать в речи агента — якорь против выдумок LLM. */
export function quoteInText(quote: string, text: string): boolean {
  const q = normText(quote);
  return q.length >= 8 && normText(text).includes(q);
}

// Быстрый путь ОДНОАЛФАВИТНЫХ пар: key() не транслитерирует кириллица↔латиница
// («Окница» ≠ «Ocnița» по ключу — вскрыто юнит-тестом). Межалфавитный матч
// делает verifyCoridorRefuz канонически, через резолвер.
export function hasSearchForPair(v: JudgeViolation, f: JudgeFacts): boolean {
  if (!v.from || !v.to) return true; // без пары верифицировать нечем — считаем «звал»
  const a = key(v.from);
  const b = key(v.to);
  return f.searchCalls.some((c) => {
    const cf = key(c.from ?? '');
    const ct = key(c.to ?? '');
    return (cf === a && ct === b) || (cf === b && ct === a);
  });
}

// (b) Сказал «нет рейсов», когда тул вернул count>0. ВСЕ результаты звонка должны
// быть count>0: при смешанных поисках (туда 4, обратно 0) «нет рейсов» может быть
// честным ответом на второй поиск — не наказываем (ревью I1).
export function verifyNeagaCurse(v: JudgeViolation, f: JudgeFacts): boolean {
  return f.searchResults.length > 0
    && f.searchResults.every((r) => r.count > 0)
    && quoteInText(v.quote, f.agentText);
}

// (c) Обещание перезвона. Запрещено ВСЕГДА — и до, и после request_callback:
// операторов, которые перезванивают, нет (решение Иона 24.08, route 019ad44).
// Цитата-якорь обязательна + regex-белый список против выдумок LLM.
export const CALLBACK_RE = /(vă\s+sun[ăa]m|vă\s+sunez|vă\s+voi\s+suna|te\s+sun\s+eu|revenim\s+cu\s+un\s+apel|о?\s*перезвон(ю|им)|мы\s+вам\s+позвоним|вам\s+перезвонят|(colegul|un\s+coleg)[^.]{0,40}va\s+suna)/iu;
export function verifyCallbackPromise(v: JudgeViolation, f: JudgeFacts): boolean {
  return quoteInText(v.quote, f.agentText) && CALLBACK_RE.test(v.quote);
}

// (d) Названный день не из date_label_* тулов. Тулов не было — правило не применяется.
export function verifyWrongDay(v: JudgeViolation, f: JudgeFacts): boolean {
  if (f.searchResults.length === 0 || !v.day_said) return false;
  if (!quoteInText(v.quote, f.agentText)) return false;
  const said = normText(v.day_said);
  return !f.searchResults.some((r) => r.dateLabels.some((l) => normText(l).includes(said) || said.includes(normText(l))));
}

// (f) Lucru uitat: numărul de șofer dictat fără find_past_trip cu UN candidat.
// Anchore de cod peste verdictul LLM: (1) CLIENTUL (nu agentul) chiar vorbește de
// un obiect uitat — verb + obiect apropiate, nu filler («am uitat să întreb» din
// apelul de vânzare NU e obiect, review High 2), (2) agentul chiar a dictat un
// număr (parseSpokenPhones), (3) niciun find_past_trip din apel n-a întors
// count=1. Toate trei — altfel nu există.
// Verbele și obiectele acoperă SINONIMELE, nu doar formularea din incident
// (delta-audit High: «am lăsat geanta», «оставил рюкзак», «uitasem» treceau
// neprinse). «ceva»/«lucru» au ieșit din lista de obiecte (delta-audit M1:
// «am uitat să întreb ceva» dădea fals pozitiv) — cazul «am uitat ceva în
// autobuz» îl prinde cuvântul de context autobuz/mașină din aceeași listă.
// Filler-ul are lookahead în AMBELE limbi (round 2 Critical: «Я забыл спросить,
// какой у вас телефон» trecea prin varianta doar-românească).
// (?![а-яё]) după [аи]? oprește backtracking-ul: fără el, motorul retrăgea
// sufixul («забылА» → «забыл» + «а спросить») și lookahead-ul de filler nu mai
// vedea filler-ul (round 3 Critical: apelurile de vânzare ale femeilor). NU \b:
// în JS \w nu cuprinde chirilicele, granița după literă rusă nu există.
const LOST_ITEM_RE = /((?:(?:mi-|[șs]i-|ne-|v-)?a[mu]?|a[țt]i)\s+(?:uitat|pierdut|l[ăa]sat|sc[ăa]pat)(?!\s*,?\s*s[ăa]\s)|uitasem|l[ăa]sasem|(?:забыл|потерял|оставил)[аи]?(?![а-яё])(?!\s*,?\s*(?:спросить|уточнить|узнать|сказать|как|что|какой|какая)))[^.!?]{0,60}(geant|bagaj|valiz|borset|rucsac|umbrel|pachet|acte|portofel|portmone|chei|telefonul|autobuz|microbuz|ma[șs]in|ochelari|очк|сумк|чемодан|барсетк|зонт|пакет|вещ|рюкзак|кошел|ключ|документ|телефон|автобус|машин|маршрутк)|(geant|bagaj|valiz|borset|rucsac|portofel|ochelari|очк|сумк|чемодан|рюкзак|барсетк|кошел)[^.!?]{0,60}(uitat|pierdut|l[ăa]sat|забыл|потерял|оставил)/iu;
// Numărul COMPANIEI citit dosloven din company_phone_line_* la count=0 e purtarea
// CORECTĂ — nu «număr dictat» (round 2 Critical: parseSpokenPhones îl prindea și
// judecătorul pedepsea exact ce cere promptul). Sursa unică: lib/company-phone.ts.
export function verifyLucruUitat(v: JudgeViolation, f: JudgeFacts): boolean {
  if (!quoteInText(v.quote, f.agentText)) return false;
  if (!LOST_ITEM_RE.test(f.clientText)) return false;
  // ULTIMUL rezultat decide (round 3 Medium): un count=1 timpuriu, corectat apoi
  // de client (căutarea următoare dă 0), nu mai legitimează numărul repetat.
  if (f.pastTripCounts.at(-1) === 1) return false; // identificare confirmată — numărul e legitim
  // DOAR numerele de după ultimul rezultat: numărul legitim citit la un count=1
  // timpuriu nu incriminează fraza corectă a companiei de după count=0.
  return f.agentMsgsAfterPastTrip.flatMap((m) => parseSpokenPhones(m)).some((p) => p !== COMPANY_PHONE_LOCAL);
}

// (e) Названная цена не из тулов. Цен в тулах не было — не применяется.
export function verifyWrongPrice(v: JudgeViolation, f: JudgeFacts): boolean {
  if (f.priceValues.length === 0 || typeof v.price_said !== 'number') return false;
  if (!quoteInText(v.quote, f.agentText)) return false;
  return !f.priceValues.includes(v.price_said);
}

// (a) Отказал в паре без вызова тула → ре-прогон поиска server-side (skipLog:
// синтетика не идёт в аналитику спроса). Дата жалобы — кишинёвский день звонка;
// прошла — сегодняшний (пометка в payload, Ион видит, на чём подтверждено).
export async function verifyCoridorRefuz(
  v: JudgeViolation,
  f: JudgeFacts,
): Promise<{ confirmed: boolean; reverifiedFor?: string }> {
  if (!v.from || !v.to) return { confirmed: false };
  if (hasSearchForPair(v, f)) return { confirmed: false }; // тул звался — не «отказ из головы»
  if (!quoteInText(v.quote, f.agentText)) return { confirmed: false };
  const { values: [fromRo, toRo], unknown } = await localitiesToRo([v.from, v.to]);
  if (unknown.length > 0) return { confirmed: false }; // сёла не наши — отказ был честным
  // Канонический матч пары против вызовов (оба алфавита): «Окница»↔«Ocnița».
  for (const c of f.searchCalls) {
    const r = await localitiesToRo([c.from, c.to]);
    const cf = r.values[0];
    const ct = r.values[1];
    if ((cf === fromRo && ct === toRo) || (cf === toRo && ct === fromRo)) return { confirmed: false };
  }
  const callDay = chisinauDayOf(f.createdAt);
  let date = resolveVoiceDate(v.date_word, callDay);
  const today = chisinauTodayIso();
  if (date < today) date = today;
  const trips = await searchTrips(fromRo as string, toRo as string, date, { skipLog: true });
  return { confirmed: trips.length > 0, reverifiedFor: date };
}

async function judgeCall(anthropic: Anthropic, f: JudgeFacts, negatives: string[]): Promise<JudgeViolation[]> {
  const facts = {
    search_calls: f.searchCalls,
    search_results: f.searchResults,
    prices_from_tools: f.priceValues,
  };
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      system: buildJudgePrompt(negatives),
      messages: [{ role: 'user', content: `FAPTE:\n${JSON.stringify(facts)}\n\nTRANSCRIPT:\n${f.dialog}` }],
    }, { signal: AbortSignal.timeout(30000) });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return parseVerdicts(text);
  } catch {
    return [];
  }
}

/** Недельная сводка: пн–ср по Кишинёву, если за 6 дней не отправлялась (пон. мог упасть). */
async function maybeWeeklySummary(supabase: ReturnType<typeof getSupabase>): Promise<void> {
  try {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Chisinau', weekday: 'short' }).format(new Date());
    if (!['Mon', 'Tue', 'Wed'].includes(weekday)) return;
    const { data: recent } = await supabase.from('voice_controller_incidents')
      .select('id').eq('kind', 'judge_weekly')
      .gte('created_at', new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString()).limit(1);
    if (recent?.length) return;
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: rows } = await supabase.from('voice_lessons')
      .select('status, payload').eq('kind', 'prompt_lesson')
      .eq('payload->>source', 'judge').gte('created_at', weekAgo);
    const { data: exams } = await supabase.from('voice_controller_incidents')
      .select('id').eq('kind', 'exam_failed').gte('created_at', weekAgo);
    const byRule = new Map<string, { a: number; r: number; p: number }>();
    for (const row of (rows || []) as { status: string; payload: { rule?: string } }[]) {
      const rule = row.payload?.rule ?? '?';
      const c = byRule.get(rule) ?? { a: 0, r: 0, p: 0 };
      if (row.status === 'approved') c.a++;
      else if (row.status === 'rejected') c.r++;
      else c.p++;
      byRule.set(rule, c);
    }
    const lines = [...byRule.entries()].map(([rule, c]) => `${rule}: ✓${c.a} ✗${c.r} ⏳${c.p}`);
    await supabase.from('voice_controller_incidents').insert({
      kind: 'judge_weekly', details: { rules: Object.fromEntries(byRule), exam_failed: exams?.length ?? 0 }, healed: true,
    });
    await alertAdmins(
      `📊 <b>Судья, неделя</b>\n${lines.length ? escapeHtml(lines.join('\n')) : 'нарушений не подтверждено'}\nПровалы экзаменов: ${exams?.length ?? 0}`,
    );
  } catch { /* сводка не имеет права ломать прогон */ }
}

export async function runVoiceJudge(): Promise<{
  scanned: number; prefiltered: number; confirmed: number; lessons: number;
  examsStarted: boolean; examsDone: boolean; examFailures: number;
}> {
  const t0 = Date.now();
  const supabase = getSupabase();

  // СТАРТ экзаменов — первым (варятся на стороне EL, пока судим); СОЗДАНИЕ новых
  // тестов уехало в хвост ночи: прогону всё равно, когда тест создан — он войдёт
  // в ротацию следующей ночью, а секунда преамбулы стоила ~1.7 несуждённых
  // звонка (perf-ревью раунд 3). Преамбула теперь ~1-3с (2 select + POST).
  let examsStarted = false;
  try {
    examsStarted = await startExams(t0 + 8_000);
  } catch (err) {
    console.error('[voice-judge] exams start:', err);
  }

  // Негативы: отклонённые Ионом судейские уроки — в промпт и в дедуп-набор
  // (узкий ключ rule+пара, не голое rule: один ✗ не глушит класс дефектов).
  const { data: negRows } = await supabase.from('voice_lessons')
    .select('summary, payload').eq('kind', 'prompt_lesson')
    .eq('payload->>source', 'judge').eq('status', 'rejected')
    .gte('decided_at', new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
    .order('decided_at', { ascending: false }).limit(30);
  const negatives = ((negRows || []) as { summary: string }[]).map((r) => r.summary);
  // Ключ дедупа несёт и цитату: у беспарных правил (callback/день/цена) голое
  // rule глушило бы весь класс на 14 дней одним ✗ (ревью I3).
  const rejKey = (p: { rule?: string; from?: string; to?: string; quote?: string }) =>
    `${p.rule}|${key(p.from ?? '')}|${key(p.to ?? '')}|${normText(p.quote ?? '').slice(0, 40)}`;
  const rejectedKeys = new Set(
    ((negRows || []) as { payload: { rule?: string; from?: string; to?: string; quote?: string } }[])
      .map((r) => rejKey(r.payload ?? {})),
  );

  // Звонки, по которым learner уже создал урок (окна ночей перекрываются) — не дублируем.
  const { data: lessonRows } = await supabase.from('voice_lessons')
    .select('conversation_id')
    .gte('created_at', new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString());
  const lessonConvIds = new Set(
    ((lessonRows || []) as { conversation_id: string | null }[]).map((r) => r.conversation_id).filter(Boolean),
  );

  const { data: calls } = await supabase.from('voice_calls')
    .select('conversation_id, transcript, created_at')
    .is('judged_at', null)
    // 50ч, не 26: прогоны идут с джиттером (GH Actions decay, ручные dispatch до
    // 15:40), и звонок пропущенной ночи выпадал из окна НАВСЕГДА — 28.08 так
    // потеряны 4 звонка (perf-ревью Critical, замер по judged_at). limit(45) +
    // order(asc) держат вес запроса прежним; бэклог долечивается за две ночи.
    .gte('created_at', new Date(Date.now() - 50 * 3600 * 1000).toISOString())
    .order('created_at', { ascending: true })
    .limit(MAX_CALLS);

  const prefilteredIds: string[] = [];
  const toJudge: JudgeFacts[] = [];
  for (const c of (calls || []) as { conversation_id: string; transcript: unknown; created_at: string }[]) {
    if (lessonConvIds.has(c.conversation_id)) { prefilteredIds.push(c.conversation_id); continue; }
    const f = buildFacts(c.conversation_id, c.created_at, c.transcript);
    // Монологи и обрывы вердикта не дадут — judged_at без LLM.
    if (f.agentTurns < 2 || (f.userTurns < 2 && !f.calledSearchTrips)) {
      prefilteredIds.push(c.conversation_id);
      continue;
    }
    toJudge.push(f);
  }

  const anthropic = new Anthropic({ maxRetries: 1 });
  const judgedIds: string[] = [];
  type Confirmed = { v: JudgeViolation; f: JudgeFacts; reverifiedFor?: string };
  const confirmedList: Confirmed[] = [];

  for (let i = 0; i < toJudge.length; i += LLM_CONCURRENCY) {
    if (Date.now() - t0 > TIME_BUDGET_MS) break; // хвост доберёт следующая ночь
    const chunk = toJudge.slice(i, i + LLM_CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((f) => judgeCall(anthropic, f, negatives)));
    for (let j = 0; j < results.length; j++) {
      const res = results[j];
      if (res.status !== 'fulfilled') continue; // не судился — пересудится завтра
      const f = chunk[j];
      judgedIds.push(f.convId);
      for (const v of res.value) {
        if (rejectedKeys.has(rejKey(v))) continue;
        if (v.rule === 'coridor_refuz') {
          if (Date.now() - t0 > TAIL_DEADLINE_MS) break; // сетевой верификатор — под сторожем
          const out = await verifyCoridorRefuz(v, f);
          if (out.confirmed) confirmedList.push({ v, f, reverifiedFor: out.reverifiedFor });
        } else if (
          (v.rule === 'neaga_curse' && verifyNeagaCurse(v, f)) ||
          (v.rule === 'lucru_uitat' && verifyLucruUitat(v, f)) ||
          (v.rule === 'promite_callback' && verifyCallbackPromise(v, f)) ||
          (v.rule === 'zi_gresita' && verifyWrongDay(v, f)) ||
          (v.rule === 'pret_gresit' && verifyWrongPrice(v, f))
        ) {
          confirmedList.push({ v, f });
        }
      }
    }
  }

  // Приоритет: потерянные звонки важнее неточной цены; в очередь — максимум 6/ночь.
  confirmedList.sort((a, b) => RULES.indexOf(a.v.rule) - RULES.indexOf(b.v.rule));
  let lessons = 0;
  // БЕЗ сторожа: 1-6 дешёвых INSERT. Сторож здесь терял подтверждённое навсегда —
  // judged_at ставился, а урока не было (perf-ревью, High).
  for (const { v, f, reverifiedFor } of confirmedList.slice(0, MAX_JUDGE_LESSONS)) {
    const ok = await insertLesson(supabase, {
      conversation_id: f.convId,
      kind: 'prompt_lesson',
      payload: {
        source: 'judge', rule: v.rule, quote: v.quote, from: v.from, to: v.to,
        day_said: v.day_said, price_said: v.price_said,
        ...(reverifiedFor ? { reverified_for_date: reverifiedFor } : {}),
      },
      summary: `[судья:${v.rule}] ${v.summary_ru}`,
    });
    if (ok) lessons++;
  }
  // Подтверждённое сверх капа НЕ помечаем judged_at — пересудится следующей ночью,
  // uniq-индекс делает это идемпотентным (ревью I2: находка не должна пропасть).
  const droppedConvIds = new Set(confirmedList.slice(MAX_JUDGE_LESSONS).map((c) => c.f.convId));

  // judged_at — ТОЛЬКО получившим вердикт (и чьи находки доехали) и отсеянным префильтром.
  const doneIds = [...prefilteredIds, ...judgedIds.filter((id) => !droppedConvIds.has(id))];
  if (doneIds.length > 0) {
    await supabase.from('voice_calls')
      .update({ judged_at: new Date().toISOString() })
      .in('conversation_id', doneIds);
  }

  // Хвост: дочитать экзамены в остатке бюджета.
  let examsDone = false;
  let examFailures = 0;
  try {
    const out = await pollExams(t0 + TAIL_DEADLINE_MS);
    examsDone = out.done;
    if (out.done) {
      examFailures = out.failed.length;
      await reportExamOutcome(out, { alert: true });
    }
  } catch (err) {
    console.error('[voice-judge] exams poll:', err);
  }

  // Хрупкое — первым (insert-then-notify внутри), sweeper и генерация — после.
  await maybeWeeklySummary(supabase);

  // Sweeper: провалы и снятия с ротации, дочитанные МОЛЧАЛИВЫМ контролёром
  // (drainPendingExams, alert:false — распоряжение Иона 23.08 о тишине
  // контролёра), иначе не доходят до Иона никогда: claim прогона почти всегда
  // выигрывает контролёр (каждые 30 мин против одного судейского хвоста).
  // healed на exam_failed/exam_retired = «алерт отправлен» — ставится ПОСЛЕ
  // подтверждённой отправки (alertAdmins → bool): потерянный Telegram ретраится
  // следующей ночью, дубль возможен только при убийстве между отправкой и update.
  // Сторож 54с: без него пн-ср (weekly + sweeper с Telegram-таймаутами 5с)
  // выходили за 60с Hobby, и убийство между отправкой и claim-ом давало
  // ПОВТОРЯЮЩИЙСЯ дубль алерта (arch-ревью раунд 4). Пропущенный sweeper
  // безвреден — дочитает следующая ночь.
  try {
    // 52с, не 54: собственная стоимость sweeper-а (~5.9с worst с Telegram 5с)
    // должна помещаться до стены 60с вместе с cold-start (perf/arch раунд 5).
    // limit 12/10 держат сообщение под tgCut — claim гасит только показанное.
    if (Date.now() < t0 + 52_000) {
      const sevenDaysAgo = new Date(t0 - 7 * 24 * 3600 * 1000).toISOString();
      const { data: silentFails } = await supabase.from('voice_controller_incidents')
        .select('id, details').eq('kind', 'exam_failed').eq('healed', false)
        .gte('details->streak', 2).gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: true }).limit(12);
      const { data: silentOther } = await supabase.from('voice_controller_incidents')
        .select('id, kind, details').in('kind', ['exam_retired', 'exam_recovered', 'exam_stuck', 'exam_capacity'])
        .eq('healed', false).gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: true }).limit(10);
      type Inc = { id: number; kind?: string; details: { name?: string; rationale?: string; invocation_id?: string } };
      const fails = (silentFails ?? []) as Inc[];
      const other = (silentOther ?? []) as Inc[];
      if (fails.length || other.length) {
        const names = (k: string) => other.filter((r) => r.kind === k)
          .map((r) => String(r.details?.name ?? r.details?.invocation_id ?? '')).join(', ');
        const lines = fails.map((r) => `• ${escapeHtml(String(r.details?.name ?? ''))}: ${escapeHtml(String(r.details?.rationale ?? '').slice(0, 120))}`);
        const tails = [
          names('exam_retired') && `Сняты с ротации (5 провалов подряд): ${escapeHtml(names('exam_retired'))}`,
          names('exam_recovered') && `Самоизлечились после ≥2 провалов: ${escapeHtml(names('exam_recovered'))}`,
          names('exam_stuck') && `Прогон завис >24ч: ${escapeHtml(names('exam_stuck'))}`,
          names('exam_capacity') && `Кап ротации: ${escapeHtml(names('exam_capacity'))}`,
        ].filter(Boolean).map((s) => `\n${s}`).join('');
        // Заголовок нейтральный: сюда попадают и события ЭТОЙ же инвокации
        // (exam_recovered при упавшем Telegram), не только дренаж контролёра.
        const sent = await alertAdmins(tgCut(`🎓 <b>Экзамены агента: невручённые события</b>\n${lines.join('\n')}${tails}`));
        if (sent) {
          const { error } = await supabase.from('voice_controller_incidents')
            .update({ healed: true }).in('id', [...fails, ...other].map((r) => r.id));
          if (error) console.error('[voice-judge] sweeper claim:', error.message);
        }
      }
    }
  } catch { /* sweeper не имеет права ломать прогон */ }

  // Создание тестов из уроков — самый низкий приоритет ночи: вход согласован с
  // внутренним резервом 9.5с (дедлайн 58с → входить позже 48.5с бессмысленно —
  // два запроса и выход с нулём, arch-ревью раунд 4). Свежий тест попадёт в
  // прогон следующей ночи (perf-ревью раунд 3 — раньше это крало волны судейства).
  try {
    if (Date.now() < t0 + 48_500) await generateLessonTests(t0 + 58_000);
  } catch (err) {
    console.error('[voice-judge] lesson tests:', err);
  }

  return {
    scanned: toJudge.length, prefiltered: prefilteredIds.length,
    confirmed: confirmedList.length, lessons, examsStarted, examsDone, examFailures,
  };
}
