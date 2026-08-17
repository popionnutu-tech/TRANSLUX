import { getSupabase } from '../supabase.js';
import { sendAdminAlert, escapeHtml } from './adminAlert.js';
import { collectSmmData } from './smm.js';
import type {
  User,
  InviteToken,
  Route,
  Driver,
  Trip,
  Report,
  TaxiZoneReport,
  PointEnum,
  DirectionEnum,
} from '@translux/db';
import { POINT_DIRECTION_MAP } from '@translux/db';

const db = () => getSupabase();

// ── Users ──────────────────────────────────────────────

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  const { data } = await db()
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('active', true)
    .single();
  return data;
}

export async function createOrUpdateUser(
  telegramId: number,
  username: string | undefined,
  point: PointEnum
): Promise<User> {
  // Try to find existing user by telegram_id
  const existing = await getUserByTelegramId(telegramId);
  if (existing) {
    const { data } = await db()
      .from('users')
      .update({ point, active: true, username: username || null })
      .eq('id', existing.id)
      .select()
      .single();
    return data as User;
  }

  const { data } = await db()
    .from('users')
    .insert({
      telegram_id: telegramId,
      username: username || null,
      role: 'CONTROLLER' as const,
      point,
      active: true,
    })
    .select()
    .single();
  return data as User;
}

// ── Invite Tokens ──────────────────────────────────────

export async function validateInviteToken(token: string): Promise<InviteToken | null> {
  const { data } = await db()
    .from('invite_tokens')
    .select('*')
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();
  return data;
}

export async function markInviteUsed(token: string, userId: string): Promise<void> {
  await db()
    .from('invite_tokens')
    .update({ used_at: new Date().toISOString(), used_by_user: userId })
    .eq('token', token);
}

// ── Routes ─────────────────────────────────────────────

export async function getActiveRoutes(): Promise<Route[]> {
  const { data } = await db()
    .from('routes')
    .select('*')
    .eq('active', true)
    .order('name');
  return data || [];
}

// ── Drivers ────────────────────────────────────────────

export async function getActiveDrivers(): Promise<Driver[]> {
  // Exclude autoparcul LDE (is_lde) + doar interurban (nu suburban) — operatorul vede lista scurtă.
  const { data } = await db()
    .from('drivers')
    .select('*')
    .eq('active', true)
    .eq('is_lde', false)
    .contains('directions', ['interurban'])
    .order('full_name');
  return data || [];
}

export async function createDriver(fullName: string, phone: string): Promise<Driver> {
  const { data, error } = await db()
    .from('drivers')
    .insert({ full_name: fullName, phone, directions: ['interurban'] })
    .select()
    .single();
  if (error) throw error;
  return data as Driver;
}

export async function searchDrivers(query: string): Promise<Driver[]> {
  const { data } = await db()
    .from('drivers')
    .select('*')
    .eq('active', true)
    .eq('is_lde', false)
    .ilike('full_name', `%${query}%`)
    .order('full_name')
    .limit(10);
  return data || [];
}

// ── Vehicles ──────────────────────────────────────────

export async function getActiveVehicles(): Promise<Array<{ id: string; plate_number: string }>> {
  // Exclude LDE (is_lde) + doar interurban (vezi getActiveDrivers).
  const { data } = await db()
    .from('vehicles')
    .select('id, plate_number')
    .eq('active', true)
    .eq('is_lde', false)
    .contains('directions', ['interurban'])
    .order('plate_number');
  return data || [];
}

export async function createVehicle(plateNumber: string): Promise<{ id: string; plate_number: string }> {
  const { data, error } = await db()
    .from('vehicles')
    .insert({ plate_number: plateNumber.toUpperCase().replace(/\s/g, ''), directions: ['interurban'] })
    .select('id, plate_number')
    .single();
  if (error) throw error;
  return data as { id: string; plate_number: string };
}

/** Get vehicle IDs already assigned to reports for a given date+point */
export async function getUsedVehicleIds(
  reportDate: string,
  point: PointEnum
): Promise<Set<string>> {
  const { data } = await db()
    .from('reports')
    .select('vehicle_id')
    .eq('report_date', reportDate)
    .eq('point', point)
    .eq('status', 'OK')
    .is('cancelled_at', null)
    .not('vehicle_id', 'is', null);
  return new Set((data || []).map((r: any) => r.vehicle_id));
}

/** Placa unei mașini după id — fallback când mașina nu-i în nomenclatorul
 *  încărcat la începutul raportului (ex. adăugată chiar atunci prin „+ Adaugă auto").
 *  Fără asta, task-ul reclamă al lui Vlad se pierdea pentru mașinile noi. */
export async function getVehiclePlate(vehicleId: string): Promise<string | null> {
  const { data } = await db()
    .from('vehicles')
    .select('plate_number')
    .eq('id', vehicleId)
    .maybeSingle();
  return (data?.plate_number as string) ?? null;
}

// ── Climat (pasul 12): A/C vara, căldură salon iarna; sezonier + o dată pe lună per mașină ──
/** Sezonul climatic pentru o zi 'YYYY-MM-DD': 'ac' (15 mai–31 iul), 'heat' (1 nov–15 feb) sau null. */
export function climateKindForDate(ymd: string): 'ac' | 'heat' | null {
  const [, m, d] = ymd.split('-').map(Number);
  if ((m === 5 && d >= 15) || m === 6 || m === 7) return 'ac';
  if (m === 11 || m === 12 || m === 1 || (m === 2 && d <= 15)) return 'heat';
  return null;
}

/** Trebuie pusă întrebarea climă pt mașina asta azi? Sezonieră + o dată pe lună per mașină.
 *  null = în afara sezonului SAU deja întrebată luna asta (orice variantă din 3). */
export async function climateQuestionNeeded(vehicleId: string, todayYMD: string): Promise<'ac' | 'heat' | null> {
  const kind = climateKindForDate(todayYMD);
  if (!kind) return null; // în afara sezonului → fără query la DB
  const col = kind === 'ac' ? 'ac_status' : 'heat_status';
  const monthStart = todayYMD.slice(0, 7) + '-01';
  const { data } = await db()
    .from('reports')
    .select('id')
    .eq('vehicle_id', vehicleId)
    .not(col, 'is', null)
    .is('cancelled_at', null)
    .gte('report_date', monthStart)
    .limit(1);
  return data && data.length > 0 ? null : kind; // deja întrebată luna asta → null
}

// ── Zadachnik: auto-sarcină din defect reclamă (executor = utilizatorul DIGITAL / Vlad) ──
const NONTERMINAL_OB = ['sent', 'delivered', 'accepted', 'in_progress', 'report_pending', 'overdue', 'overdue_responded'];

const RECLAMA_LABEL: Record<'bus' | 'panou_ruta' | 'ambele', string> = {
  bus: 'reclamă pe autobuz',
  panou_ruta: 'panou cu ruta',
  ambele: 'reclamă + panou rută',
};

async function notifyTelegram(telegramId: number | null, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !telegramId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    console.error('reclama task notify error:', e);
  }
}

/**
 * Дефект рекламы → авто-задача в задачнике на исполнителя из getZadachnikAssignee()
 * (активный DIGITAL, иначе резерв из bot_storage). Дедуп: пропускаем, если по этой
 * машине уже есть открытая reclama-задача. Нет исполнителя → алерт админам.
 * Возвращает true, если задача создана.
 */
/** Общий низкоуровневый создатель obligation (insert + 2 события + уведомление). */
async function spawnObligation(o: {
  creatorId: string; assigneeId: string; assigneeTelegramId: number | null;
  title: string | null; description: string; points: number; deadline: string;
  source: string; vehiclePlate?: string | null; notifyText?: string;
  category?: string; recurringTemplateId?: string | null; goal?: string | null;
}): Promise<string | null> {
  const supa = db();
  const { data: ob, error } = await supa.from('obligations').insert({
    creator_id: o.creatorId,
    assignee_id: o.assigneeId,
    title: o.title,
    description: o.description,
    points: o.points,
    original_deadline: o.deadline,
    current_deadline: o.deadline,
    current_state: 'sent',
    source: o.source,
    vehicle_plate: o.vehiclePlate ?? null,
    category: o.category ?? 'ALTELE',
    recurring_template_id: o.recurringTemplateId ?? null,
    goal: o.goal ?? null,
  }).select('id').single();
  if (error || !ob) { console.error('spawnObligation insert error:', error?.message); return null; }

  await supa.from('obligation_events').insert([
    { obligation_id: ob.id, event_type: 'created', actor_id: o.creatorId, data: { source: o.source } },
    { obligation_id: ob.id, event_type: 'sent', actor_id: o.creatorId, data: {} },
  ]);

  await notifyTelegram(
    o.assigneeTelegramId,
    o.notifyText ?? `📋 <b>Sarcină nouă</b>\n${o.title ?? o.description.slice(0, 60)}\nApasă butonul ≡ («Sarcini») de lângă câmpul de mesaj ca s-o vezi, iar când o termini trimite raportul de acolo.`
  );
  return ob.id as string;
}

/** Executorul sarcinilor auto (reclamă, doască de sarcini): utilizatorul DIGITAL activ, altfel
 *  rezerva din bot_storage 'zadachnik:fallback_assignee' ({user_id}) — Iurie, după concedierea
 *  lui Vlad (07.08.2026). Când apare un nou angajat cu rol DIGITAL, fluxul revine automat la el. */
export async function getZadachnikAssignee(): Promise<{ id: string; name: string | null; telegram_id: number | null } | null> {
  const supa = db();
  const { data: digital } = await supa.from('users')
    .select('id, name, telegram_id').eq('role', 'DIGITAL').eq('active', true)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (digital) return digital as { id: string; name: string | null; telegram_id: number | null };
  const { data: fb } = await supa.from('bot_storage')
    .select('value').eq('key', 'zadachnik:fallback_assignee').maybeSingle();
  const fallbackId = (fb?.value as { user_id?: string } | null)?.user_id;
  if (!fallbackId) return null;
  const { data: user } = await supa.from('users')
    .select('id, name, telegram_id').eq('id', fallbackId).eq('active', true).maybeSingle();
  return (user as { id: string; name: string | null; telegram_id: number | null } | null) ?? null;
}

export async function createReclamaTask(input: {
  creatorId: string;
  vehiclePlate: string;
  reclamaProblem: 'bus' | 'panou_ruta' | 'ambele';
}): Promise<boolean> {
  const supa = db();
  const description = `${input.vehiclePlate} — ${RECLAMA_LABEL[input.reclamaProblem]}, de reparat`;
  // Dedup ÎNAINTE de rezolvarea executorului — altfel, când nu există executor,
  // alerta ar pleca la fiecare raport repetat pe aceeași mașină.
  // Cheia e mașina ȘI tipul defectului: o sarcină deschisă pe «reclamă pe autobuz» nu mai
  // înghite semnalul despre «panou cu ruta» rupt (17.08.2026). Altfel, cu sarcini care acum
  // trăiesc mai mult, defectul nou s-ar pierde tăcut, iar descrierea ar rămâne cea veche.
  const { data: open, error: openErr } = await supa.from('obligations')
    .select('id').eq('source', 'reclama').eq('vehicle_plate', input.vehiclePlate)
    .eq('description', description)
    .in('current_state', NONTERMINAL_OB).limit(1).maybeSingle();
  // La eroare NU creăm (open=null ar arăta ca «nu există») — mai bine sarcina reapare
  // la raportul următor decât un dublu pe aceeași mașină.
  if (openErr) { console.error('reclama dedup select error:', openErr.message); return false; }
  if (open) return false; // deja există o sarcină deschisă pt același defect

  const digital = await getZadachnikAssignee();
  if (!digital) {
    // Fără executor sarcina s-ar pierde în tăcere — anunțăm adminii să seteze rezerva.
    await sendAdminAlert(`⚠️ <b>Sarcină reclamă NEcreată</b> pentru <b>${escapeHtml(input.vehiclePlate)}</b>: nu există executor — creați un utilizator DIGITAL sau setați rezerva (bot_storage: zadachnik:fallback_assignee).`);
    return false;
  }

  // termen automat: 10 zile lucrătoare (≈ 2 săptămâni), la 18:00 Chișinău (panou și reclamă la fel).
  // Termenul ăsta e și singura măsură a întârzierii — pasul de accept (cu data estimativă) nu mai există.
  const todayCh = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' })).toISOString().slice(0, 10);
  const deadline = chisinauDateTimeISO(addBusinessDaysYMD(todayCh, 10), '18:00');
  const id = await spawnObligation({
    creatorId: input.creatorId,
    assigneeId: digital.id as string,
    assigneeTelegramId: (digital.telegram_id as number) ?? null,
    title: `Reclamă ${input.vehiclePlate}`,
    description,
    points: 30,
    deadline,
    source: 'reclama',
    category: 'MARKETING_AUTO',
    vehiclePlate: input.vehiclePlate,
    notifyText: `📋 <b>Sarcină nouă (auto)</b>\n${description}\nApasă butonul ≡ («Sarcini») de lângă câmpul de mesaj ca s-o vezi, iar când o termini trimite raportul de acolo.`,
  });
  return !!id;
}

/** Sarcina reclamă DESCHISĂ pe mașină (pt confirmarea operatorului la „Totul OK"):
 *  descrierea (ce-a fost marcat defect) + ultimul comentariu de raport al lui Vlad, dacă există. */
export async function getOpenReclamaTask(
  vehiclePlate: string
): Promise<{ id: string; description: string; lastReport: string | null } | null> {
  const supa = db();
  const { data: ob } = await supa.from('obligations')
    .select('id, description')
    .eq('source', 'reclama')
    .eq('vehicle_plate', vehiclePlate)
    .in('current_state', NONTERMINAL_OB)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ob) return null;
  const { data: att } = await supa.from('obligation_attempts')
    .select('report_text')
    .eq('obligation_id', ob.id)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    id: ob.id as string,
    description: (ob.description as string) ?? '',
    lastReport: (att?.report_text as string) ?? null,
  };
}

/**
 * Operatorul confirmă explicit repararea („Totul OK" la sarcină deschisă → „A fost reparat?" → Da).
 * Ce se întâmplă cu sarcina depinde de EXECUTANT (Ion, 17.08.2026 — «se închide doar dacă a
 * făcut-o Iurie»):
 *   - a depus raport ('report_pending') → 'resolved', adică munca lui, confirmată din teren;
 *   - n-a raportat nimic → 'cancelled', fiindcă reclama e OK fără el (a reparat altcineva, ori
 *     defectul era greșit raportat). Înainte, ORICE «OK» trecea sarcina la rezolvat: 116 din 117
 *     s-au închis așa, cu el niciodată implicat, iar statistica arăta muncă inexistentă.
 * Ambele ramuri închid sarcina, deci: răspunsul operatorului nu rămâne niciodată fără efect,
 * întrebarea nu se repetă la infinit pe aceeași mașină, iar dedup-ul din createReclamaTask se
 * deblochează pentru un defect viitor.
 * Race-safe: fiecare update e gardat pe starea din care pleacă (cursă cu o închidere manuală).
 */
export async function autoCloseReclamaTask(
  vehiclePlate: string, reportDate: string, taskId?: string | null
): Promise<boolean> {
  const supa = db();
  // taskId = sarcina ARĂTATĂ operatorului. Fără el (apeluri vechi) recădem pe cea mai nouă
  // sarcină deschisă a mașinii — dar atunci un defect raportat între timp de alt operator ar
  // putea fi închis în locul ei.
  const q = supa.from('obligations')
    .select('id, assignee_id, current_state')
    .eq('source', 'reclama')
    .in('current_state', NONTERMINAL_OB);
  const { data: ob } = taskId
    ? await q.eq('id', taskId).maybeSingle()
    : await q.eq('vehicle_plate', vehiclePlate).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!ob) return false;

  // Dacă executantul NU a raportat nimic, «OK»-ul nu poate însemna «a făcut-o el» — dar sarcina
  // nici nu mai are obiect (reclama e în regulă). O anulăm, nu o trecem la rezolvat: statistica
  // lui Iurie rămâne curată, iar mașina se deblochează pentru un defect viitor (dedup-ul din
  // createReclamaTask se uită doar la sarcinile deschise).
  if (ob.current_state !== 'report_pending') {
    // Gardul e pe starea EXACTĂ de la citire, nu pe tot NONTERMINAL_OB: dacă executantul depune
    // raportul chiar între SELECT și UPDATE, anularea i-ar șterge munca — exact ce vrem să evităm.
    // Atunci update-ul nu prinde nimic, iar «OK»-ul se pierde: mai bine decât să-i anulăm raportul
    // (operatorul reconfirmă la raportul următor).
    const { data: cancelled } = await supa.from('obligations')
      .update({ current_state: 'cancelled' })
      .eq('id', ob.id)
      .eq('current_state', ob.current_state)
      .select('id')
      .maybeSingle();
    if (!cancelled) return false;
    await supa.from('obligation_events').insert({
      obligation_id: ob.id,
      event_type: 'cancelled',
      actor_id: null,
      data: { via: 'operator_reclama_ok_fara_raport', vehicle_plate: vehiclePlate, report_date: reportDate },
    });
    const { data: asg } = await supa.from('users').select('telegram_id').eq('id', ob.assignee_id).maybeSingle();
    await notifyTelegram(
      (asg?.telegram_id as number) ?? null,
      `🚫 <b>Reclamă ${vehiclePlate} — sarcina s-a anulat</b>\nOperatorul a constatat în raport că reclama e deja OK.\n\nDacă tu ai reparat-o: trimite raportul din ≡ («Sarcini») ÎNAINTE ca operatorul să confirme — altfel sarcina se anulează și munca nu-ți intră în statistică.`
    );
    return true;
  }

  const { data: done } = await supa.from('obligations')
    .update({ current_state: 'resolved' })
    .eq('id', ob.id)
    .eq('current_state', 'report_pending')
    .select('id')
    .maybeSingle();
  if (!done) return false;

  // Verdictul pe ultima încercare — altfel raportul lui Iurie rămâne veșnic «pending» în istoric.
  const { data: lastAttempt } = await supa.from('obligation_attempts').select('id')
    .eq('obligation_id', ob.id).order('number', { ascending: false }).limit(1).maybeSingle();
  if (lastAttempt?.id) {
    await supa.from('obligation_attempts')
      .update({ verdict: 'accepted', manager_comment: 'Confirmat de operator în raport', decided_at: new Date().toISOString() })
      .eq('id', lastAttempt.id);
  }

  await supa.from('obligation_events').insert({
    obligation_id: ob.id,
    event_type: 'auto_approved',
    actor_id: null,
    data: { via: 'operator_reclama_ok', vehicle_plate: vehiclePlate, report_date: reportDate },
  });

  const { data: assignee } = await supa.from('users').select('telegram_id').eq('id', ob.assignee_id).maybeSingle();
  await notifyTelegram(
    (assignee?.telegram_id as number) ?? null,
    `✅ <b>Reclamă ${vehiclePlate} — acceptată</b>\nOperatorul a confirmat în raport că reclama e OK. Raportul tău a fost acceptat automat.`
  );
  return true;
}

// ── Zadachnik: generator de sarcini recurente (apelat de scheduler dimineața) ──
function chisinauOffsetMinutes(d: Date): number {
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Chisinau', timeZoneName: 'shortOffset' })
    .formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || 'GMT+3';
  const m = tz.match(/GMT([+-]?\d+)(?::(\d+))?/);
  if (!m) return 180;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  return h * 60 + (h < 0 ? -min : min);
}

function chisinauDateTimeISO(ymd: string, hhmm: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const off = chisinauOffsetMinutes(utcGuess);
  return new Date(utcGuess.getTime() - off * 60000).toISOString();
}

/** Следующий календарный день: 'YYYY-MM-DD' → 'YYYY-MM-DD'. */
function nextDayYMD(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

/** Дата +N рабочих дней (пн–пт, выходные пропускаются) от 'YYYY-MM-DD' → 'YYYY-MM-DD'. */
function addBusinessDaysYMD(startYMD: string, n: number): string {
  const [y, m, d] = startYMD.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  let added = 0;
  while (added < n) {
    dt.setUTCDate(dt.getUTCDate() + 1);
    const wd = dt.getUTCDay();
    if (wd !== 0 && wd !== 6) added++; // не сб/вс
  }
  return dt.toISOString().slice(0, 10);
}

/** Stările din care o sarcină expirată poate fi închisă automat = NONTERMINAL_OB minus cele
 *  unde mingea e la om. Derivat, NU scris de mână: copiile paralele de stări au divergat deja
 *  o dată în acest modul (vezi comentariul din admin core.ts). */
const EXPIRABLE_OB = NONTERMINAL_OB.filter((s) => s !== 'report_pending' && s !== 'overdue_responded');

/** Câte zile în urmă mai are rost să recuperăm verificarea automată înainte de a închide. */
const RECOVER_DAYS = 7;

/**
 * O singură sarcină vie per șablon: instanțele recurente cu termenul depășit se închid
 * automat ca 'failed' la rularea generatorului (07:00). Fără asta se adunau 7 copii ale
 * aceleiași sarcini pe ecranul executantului (constatat 17.08.2026, 26 din 42 erau dubluri).
 * NU se ating 'report_pending' (raport depus, așteaptă decizia șefului) și 'overdue_responded'
 * (executantul a propus alt termen) — acolo mingea e la om, nu la ceas. Fără notificare:
 * un mesaj per sarcină expirată ar fi spam zilnic.
 * Sarcinile auto-verificate (TikTok) trec întâi printr-o recuperare a verificării de noapte —
 * norma făcută se închide ca 'resolved'. Dacă automatul tot greșește, adminul are «Redeschide»
 * pe pagina sarcinii (core.ts: reopenTask) — 'failed' nu mai e o fundătură.
 * Întoarce numărul de sarcini închise.
 */
export async function expireStaleRecurringTasks(): Promise<number> {
  const supa = db();
  const todayCh = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' })).toISOString().slice(0, 10);
  const cutoff = chisinauDateTimeISO(todayCh, '00:00'); // tot ce avea termen înainte de azi

  // Candidați: sarcini recurente cu termenul depășit. Cheia e ȘI legătura la șablon, ȘI source —
  // instanțele vechi au doar source (or= merge la SELECT; doar PATCH+or= e refuzat de PostgREST-ul
  // proiectului). Selectăm întâi, ca să putem cerne sarcinile auto-verificate (mai jos).
  const { data: cand, error } = await supa.from('obligations')
    .select('id, title, description, current_deadline, recurring_template_id')
    .in('current_state', EXPIRABLE_OB)
    .lt('current_deadline', cutoff)
    .or('source.eq.recurring,recurring_template_id.not.is.null');
  if (error) throw new Error(`expire recurring select: ${error.message}`);
  const rows = (cand as {
    id: string; title: string | null; description: string;
    current_deadline: string; recurring_template_id: string | null;
  }[]) ?? [];
  if (rows.length === 0) return 0;

  // Recuperare ÎNAINTE de închidere, pentru șabloanele auto-verificate (TikTok): verificarea de
  // noapte rulează la minutul exact 23:00, iar un restart Railway o pierde — atunci o rulăm acum,
  // pe zilele candidaților. Norma făcută → sarcina se închide ca 'resolved', NU ca «eșuată».
  // NU folosim smm_daily_stats ca dovadă că s-a colectat ceva: aggregateDailyStats scrie rândul
  // necondiționat, cu posts_count=0, chiar și când TikTok API a picat (verificat 17.08.2026).
  const { data: autoTpl, error: tplErr } = await supa.from('recurring_task_templates')
    .select('id').eq('auto_verify_tiktok', true);
  if (tplErr) console.error('expire recurring: șabloane auto-verify indisponibile:', tplErr.message);
  const autoIds = new Set(((autoTpl as { id: string }[]) ?? []).map((t) => t.id));
  // Recuperăm doar ultimele RECOVER_DAYS zile: mai vechi de-atât oricum nu se mai poate dovedi
  // nimic, iar bucla ar crește cu durata opririi (8 cereri per zi de restanță).
  const recoverFrom = new Date(new Date(cutoff).getTime() - RECOVER_DAYS * 24 * 3600 * 1000).toISOString();
  const autoDays = new Set(
    rows.filter((r) => r.recurring_template_id && autoIds.has(r.recurring_template_id) && r.current_deadline >= recoverFrom)
      .map((r) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau' }).format(new Date(r.current_deadline)))
  );
  if (autoDays.size > 0) {
    // OBLIGATORIU înaintea verificării: colectarea SMM rulează tot la minutul exact 23:00, deci
    // exact restartul care a omorât verificarea a omorât și colectarea — videoclipurile de ieri
    // nu sunt încă în DB. Fără asta recuperarea ar număra 0 și ar închide ca «eșuat» o normă
    // făcută. Upsert-ul pe (account_id, platform_post_id) completează retroactiv, cu published_at real.
    try { await collectSmmData(); }
    catch (e) { console.error('expire recurring: colectare SMM înainte de recuperare eșuată:', e); }
  }
  for (const d of autoDays) {
    // silent: mesajele verificatorului spun «azi» — la recuperare ziua e alta, ar deruta.
    try { await autoVerifyTiktokTasks(d, { silent: true }); }
    catch (e) { console.error(`expire recurring: recuperare TikTok ${d} eșuată:`, e); }
  }

  // Închidere în bucăți de 100: o listă de sute de UUID în URL riscă 414 la primul backlog.
  // `.in(current_state, EXPIRABLE_OB)` refiltrează — ce s-a închis ca 'resolved' mai sus nu intră.
  const done: { id: string }[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const { data: closed, error: updErr } = await supa.from('obligations')
      .update({ current_state: 'failed' })
      .in('id', rows.slice(i, i + 100).map((r) => r.id))
      .in('current_state', EXPIRABLE_OB) // închide cursa cu o închidere manuală făcută între timp
      .select('id');
    if (updErr) throw new Error(`expire recurring update: ${updErr.message}`);
    done.push(...((closed as { id: string }[]) ?? []));
  }
  if (done.length > 0) {
    // event_type e ENUM în DB — 'expired' NU există acolo; motivul stă în data.reason.
    const { error: evErr } = await supa.from('obligation_events').insert(
      done.map((r) => ({ obligation_id: r.id, event_type: 'failed', actor_id: null, data: { reason: 'recurring_stale' } }))
    );
    if (evErr) console.error('expire recurring events insert error:', evErr.message);

    // Un rezumat pe zi, NU un mesaj per sarcină: altfel ar fi spam zilnic. Fără el, o închidere
    // greșită a automatului rămânea vizibilă doar în logurile Railway — nimeni n-ar fi corectat-o.
    const closedRows = rows.filter((r) => done.some((d) => d.id === r.id));
    const names = closedRows.slice(0, 5).map((r) => `• ${escapeHtml(r.title ?? r.description.slice(0, 40))}`).join('\n');
    await sendAdminAlert(
      `🧹 <b>Sarcini recurente expirate</b>: ${done.length} închisă(e) automat azi.\n${names}` +
      `${closedRows.length > 5 ? `\n…și încă ${closedRows.length - 5}` : ''}` +
      `\n\nDacă vreuna era de fapt făcută: Sarcini → Istoric → «✅ Era făcută».`
    );
  }
  return done.length;
}

/** Создаёт obligation из каждого активного шаблона, подходящего на сегодня. Возвращает число созданных. */
export async function generateRecurringTasks(): Promise<number> {
  const supa = db();
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' }));
  const today = now.toISOString().slice(0, 10);
  const weekday = now.getDay(); // 0=Sun..6=Sat

  const { data: templates, error: templatesErr } = await supa.from('recurring_task_templates').select('*').eq('active', true);
  // Eroarea NU se înghite: altfel «created 0» ar arăta ca o zi liniștită sănătoasă.
  if (templatesErr) throw new Error(`recurring templates select: ${templatesErr.message}`);
  if (!templates || templates.length === 0) return 0;

  let created = 0;
  for (const t of templates as any[]) {
    if (t.last_generated_date === today) continue;                        // уже сгенерили сегодня
    // подходит ли сегодня по периоду?
    let fires: boolean;
    if (t.period === 'mon_fri') fires = weekday >= 1 && weekday <= 5;
    else if (t.period === 'custom') fires = Array.isArray(t.week_days) && t.week_days.includes(weekday);
    else fires = true; // 'daily'
    if (!fires) continue;

    // Исполнитель ещё активен? Деактивированному задачи не плодим (R1).
    // Eroarea se aruncă (nu se confundă cu «executor inactiv») — altfel ziua s-ar închide tăcut.
    const { data: assignee, error: assigneeErr } = await supa.from('users').select('telegram_id, active').eq('id', t.assignee_id).maybeSingle();
    if (assigneeErr) throw new Error(`recurring assignee select: ${assigneeErr.message}`);
    if (!assignee || !assignee.active) continue;

    // Атомарно «застолбить» сегодня ДО создания — защита от двойной генерации,
    // если на короткое время (деплой) работают два инстанса бота. active=true замыкает гонку со «стоп».
    // NB: PATCH cu filtru or= e refuzat de PostgREST-ul proiectului (42703, verificat 07.08.2026),
    // deci claim-ul se face în doi pași cu filtre simple: is.null, apoi lt.today. Fiecare pas e atomic.
    // INVARIANT: claim-ul trebuie să rămână ÎNAINTEA oricărui apel care poate arunca (deadline,
    // spawnObligation) — un șablon care aruncă e deja claim-uit și nu mai reintră la tick-ul următor.
    const claimQuery = () => supa.from('recurring_task_templates')
      .update({ last_generated_date: today })
      .eq('id', t.id)
      .eq('active', true);
    let { data: claimed, error: claimErr } = await claimQuery()
      .is('last_generated_date', null)
      .select('id').maybeSingle();
    if (!claimed && !claimErr) {
      ({ data: claimed, error: claimErr } = await claimQuery()
        .lt('last_generated_date', today)
        .select('id').maybeSingle());
    }
    if (claimErr) {
      console.error('Recurring claim error:', claimErr.message);
      await sendAdminAlert(`⚠️ <b>Generator sarcini recurente</b>: claim eșuat pentru șablonul «${escapeHtml(t.title ?? t.description?.slice(0, 40) ?? '')}»: ${escapeHtml(claimErr.message)}`);
      continue;
    }
    if (!claimed) continue; // день застолбил другой процесс (или шаблон остановлен)

    const deadline = chisinauDateTimeISO(today, t.deadline_time || '18:00');
    // Recuperarea (fereastra ≥07:00) nu creează sarcini cu termenul deja trecut.
    // Verificarea stă INTENȚIONAT după claim: ziua se consumă (sarcina retro n-ar mai
    // avea sens azi), iar orice apel care poate arunca rămâne după claim — claim-ul e
    // siguranța care stinge reîncercările din fereastră (vezi comentariul de la claim).
    if (new Date(deadline).getTime() <= Date.now()) {
      // Sărirea nu e tăcută: adminul află că ziua s-a pierdut (claim-ul e deja consumat).
      await sendAdminAlert(`⚠️ <b>Generator sarcini recurente</b>: șablonul «${escapeHtml(t.title ?? t.description?.slice(0, 40) ?? '')}» a fost sărit azi — termenul ${escapeHtml(t.deadline_time || '18:00')} trecuse deja la momentul generării.`);
      continue;
    }
    const id = await spawnObligation({
      creatorId: t.creator_id,
      assigneeId: t.assignee_id,
      assigneeTelegramId: (assignee.telegram_id as number) ?? null,
      title: t.title ?? null,
      description: t.description,
      points: t.points ?? 30,
      deadline,
      source: 'recurring',
      category: (t.category as string) ?? 'ALTELE',
      recurringTemplateId: t.id as string,
      goal: (t.goal as string | null) ?? null,
    });
    if (id) created++;
    else await sendAdminAlert(`⚠️ <b>Generator sarcini recurente</b>: crearea sarcinii din șablonul «${escapeHtml(t.title ?? t.description?.slice(0, 40) ?? '')}» a eșuat — ziua e deja marcată, sarcina NU se va relua azi.`);
  }
  return created;
}

// ── Zadachnik: auto-verificare TikTok (apelat de scheduler după colectarea SMM, 23:00) ──
const TIKTOK_VERIFY_ACCOUNT = 'TikTok TRANSLUX'; // contul principal pe care se numără videoclipurile
const TIKTOK_VERIFY_MIN = 2;                     // norma: ≥2 video/zi → sarcina se închide automat

/**
 * После ночного сбора SMM: для каждого активного шаблона с auto_verify_tiktok=true
 * берём число видео за `date` на основном аккаунте TikTok TRANSLUX и закрываем
 * сегодняшнюю задачу исполнителя как resolved, если видео ≥ TIKTOK_VERIFY_MIN.
 * Иначе задача остаётся открытой, шефу уходит уведомление.
 * Точное совпадение по title+description целит именно в задачу этого шаблона
 * (у исполнителя могут быть и другие recurring-задачи).
 * `opts.silent` — режим догона (вызов из expireStaleRecurringTasks на следующее утро):
 * задача закрывается так же, но уведомления не шлём — их текст говорит «azi», а день уже другой.
 */
export async function autoVerifyTiktokTasks(date: string, opts: { silent?: boolean } = {}): Promise<number> {
  const supa = db();

  const { data: templates } = await supa
    .from('recurring_task_templates')
    .select('*')
    .eq('active', true)
    .eq('auto_verify_tiktok', true);
  if (!templates || templates.length === 0) return 0;

  const { data: acc } = await supa
    .from('smm_accounts')
    .select('id')
    .eq('platform', 'TIKTOK')
    .eq('account_name', TIKTOK_VERIFY_ACCOUNT)
    .maybeSingle();
  if (!acc) {
    // Аккаунт переименовали/удалили — иначе задачи тихо висели бы вечно. Шефов предупреждаем.
    // В режиме догона молчим: цикл идёт по дням, и одно и то же сообщение ушло бы D раз подряд.
    console.error(`autoVerifyTiktok: cont "${TIKTOK_VERIFY_ACCOUNT}" negăsit`);
    if (opts.silent) return 0;
    const creatorIds = [...new Set((templates as any[]).map((t) => t.creator_id))];
    for (const cid of creatorIds) {
      const { data: u } = await supa.from('users').select('telegram_id').eq('id', cid).maybeSingle();
      await notifyTelegram((u?.telegram_id as number) ?? null,
        `⚠️ <b>Auto-verify TikTok n-a rulat</b>\nContul „${TIKTOK_VERIFY_ACCOUNT}” nu a fost găsit în sistem. Verifică numele contului SMM.`);
    }
    return 0;
  }

  // Число видео за сутки Кишинёва (timestamptz сравнивается по абсолютному времени — TZ-корректно).
  const dayStartISO = chisinauDateTimeISO(date, '00:00');
  const dayEndISO = chisinauDateTimeISO(nextDayYMD(date), '00:00');
  const { count: postsCountRaw } = await supa
    .from('smm_posts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', acc.id)
    .gte('published_at', dayStartISO)
    .lt('published_at', dayEndISO);
  const postsCount = postsCountRaw ?? 0;

  const todayStartISO = dayStartISO;
  let resolved = 0;

  for (const t of templates as any[]) {
    // Сегодняшний открытый инстанс ИМЕННО этого шаблона — по recurring_template_id
    // (потерпит редактирование titlu/descriere; старый ключ по тексту ломался от PATCH).
    // Marginea de sus (`lt created_at`) e obligatorie: la recuperarea de a doua zi, fără ea
    // s-ar putea închide sarcina de AZI pe baza videoclipurilor de IERI. Sarcina zilei D e
    // oricum creată în ziua D, deci limita nu schimbă nimic la rularea normală de la 23:00.
    const { data: obRow0 } = await supa.from('obligations')
      .select('id')
      .eq('recurring_template_id', t.id)
      .in('current_state', NONTERMINAL_OB)
      .gte('created_at', todayStartISO)
      .lt('created_at', dayEndISO)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    let obRow = obRow0;
    if (!obRow) {
      // Fallback pe cheia veche (title+description) — DOAR pt. sarcini create de cod vechi,
      // fără legătură (is null previne închiderea sarcinii altui șablon cu același text).
      let q = supa.from('obligations')
        .select('id')
        .is('recurring_template_id', null)
        .eq('assignee_id', t.assignee_id)
        .eq('source', 'recurring')
        .eq('description', t.description)
        .in('current_state', NONTERMINAL_OB)
        .gte('created_at', todayStartISO)
        .lt('created_at', dayEndISO)
        .order('created_at', { ascending: false })
        .limit(1);
      q = t.title === null ? q.is('title', null) : q.eq('title', t.title);
      ({ data: obRow } = await q.maybeSingle());
    }
    if (!obRow) continue; // нет открытой задачи на сегодня (уже закрыта/не сгенерилась)

    const { data: assignee } = await supa.from('users').select('telegram_id').eq('id', t.assignee_id).maybeSingle();
    const { data: creator } = await supa.from('users').select('telegram_id').eq('id', t.creator_id).maybeSingle();
    const assigneeTg = (assignee?.telegram_id as number) ?? null;
    const creatorTg = (creator?.telegram_id as number) ?? null;

    if (postsCount >= TIKTOK_VERIFY_MIN) {
      // Закрываем как выполнено; .in(...) замыкает гонку с ручным закрытием
      const { data: done } = await supa.from('obligations')
        .update({ current_state: 'resolved' })
        .eq('id', obRow.id)
        .in('current_state', NONTERMINAL_OB)
        .select('id').maybeSingle();
      if (!done) continue;
      await supa.from('obligation_events').insert({
        obligation_id: obRow.id,
        event_type: 'auto_approved',
        actor_id: null,
        data: { via: 'tiktok_auto_verify', account: TIKTOK_VERIFY_ACCOUNT, posts_count: postsCount, date },
      });
      resolved++;
      if (!opts.silent) {
        await notifyTelegram(assigneeTg, `✅ <b>Sarcina TikTok — gata</b>\nAzi ai postat ${postsCount} video pe TikTok TRANSLUX. Sarcina s-a închis automat. Bravo!`);
        await notifyTelegram(creatorTg, `✅ <b>TikTok TRANSLUX: ${postsCount} video azi</b>\nSarcina zilnică (norma ${TIKTOK_VERIFY_MIN}) s-a închis automat.`);
      }
    } else if (!opts.silent) {
      await notifyTelegram(creatorTg, `⚠️ <b>TikTok TRANSLUX: doar ${postsCount} video azi</b>\nNorma e ${TIKTOK_VERIFY_MIN}/zi — sarcina zilnică rămâne deschisă.`);
    }
  }
  return resolved;
}

// ── Trips ──────────────────────────────────────────────

export async function getTripsForRoute(
  routeId: string,
  direction: DirectionEnum
): Promise<Trip[]> {
  const { data } = await db()
    .from('trips')
    .select('*')
    .eq('route_id', routeId)
    .eq('direction', direction)
    .eq('active', true)
    .order('departure_time', { ascending: true });
  return data || [];
}

/** Load all active trips for a direction, with route name */
export async function getAllTripsForDirection(
  direction: DirectionEnum
): Promise<Array<Trip & { route_name: string }>> {
  const { data } = await db()
    .from('trips')
    .select('*, routes!inner(name)')
    .eq('direction', direction)
    .eq('active', true)
    .order('departure_time', { ascending: true });
  return (data || []).map((t: any) => ({
    ...t,
    route_name: t.routes.name,
    routes: undefined,
  }));
}

/** Get IDs of trips that already have active reports for a given date+point */
export async function getReportedTripIds(
  reportDate: string,
  point: PointEnum
): Promise<Set<string>> {
  const { data } = await db()
    .from('reports')
    .select('trip_id')
    .eq('report_date', reportDate)
    .eq('point', point)
    .is('cancelled_at', null);
  return new Set((data || []).map((r: any) => r.trip_id));
}

/** Get driver IDs already assigned to reports for a given date+point */
export async function getUsedDriverIds(
  reportDate: string,
  point: PointEnum
): Promise<Set<string>> {
  const { data } = await db()
    .from('reports')
    .select('driver_id')
    .eq('report_date', reportDate)
    .eq('point', point)
    .eq('status', 'OK')
    .is('cancelled_at', null)
    .not('driver_id', 'is', null);
  return new Set((data || []).map((r: any) => r.driver_id));
}

// ── Reports ────────────────────────────────────────────

export async function checkReportExists(
  reportDate: string,
  point: PointEnum,
  tripId: string
): Promise<boolean> {
  const { data } = await db()
    .from('reports')
    .select('id')
    .eq('report_date', reportDate)
    .eq('point', point)
    .eq('trip_id', tripId)
    .is('cancelled_at', null)
    .single();
  return !!data;
}

export async function createReport(report: {
  report_date: string;
  point: PointEnum;
  trip_id: string;
  driver_id: string | null;
  status: 'OK' | 'ABSENT' | 'FULL';
  passengers_count: number | null;
  exterior_ok: boolean | null;
  uniform_ok: boolean | null;
  loading_help_ok: boolean | null;
  auto_curat: boolean | null;
  reclama_ok: boolean | null;
  reclama_deadline: string | null;
  reclama_problem?: 'bus' | 'panou_ruta' | 'ambele' | null;
  wash_grade?: number | null;
  ac_status?: 'works' | 'broken' | 'none' | null;
  heat_status?: 'works' | 'broken' | 'none' | null;
  vehicle_id: string | null;
  created_by_user: string;
  location_ok: boolean | null;
  taxi_zone_skipped?: boolean;
}): Promise<Report> {
  // DB enum only has OK/ABSENT — store FULL as OK with passengers_count=-1
  const dbRecord = report.status === 'FULL'
    ? { ...report, status: 'OK' as const, passengers_count: -1 }
    : report;

  const { data, error } = await db()
    .from('reports')
    .insert(dbRecord)
    .select()
    .single();

  if (error) throw error;
  return data as Report;
}

export async function addReportPhoto(photo: {
  report_id: string;
  storage_key: string;
  telegram_file_id: string;
  file_unique_id: string | null;
}): Promise<void> {
  await db().from('report_photos').insert(photo);
}

export async function getLastReportByUser(userId: string): Promise<Report | null> {
  const { data } = await db()
    .from('reports')
    .select('*')
    .eq('created_by_user', userId)
    .is('cancelled_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

export async function cancelReport(reportId: string, cancelledBy: string): Promise<void> {
  await db()
    .from('reports')
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: cancelledBy })
    .eq('id', reportId);
}

export function getDirectionForPoint(point: PointEnum): DirectionEnum {
  return POINT_DIRECTION_MAP[point];
}

// ── Taxi-zone reports (Chișinău loading-zone operator) ──

export async function createTaxiZoneReport(r: {
  report_date: string;
  trip_id: string;
  status: 'OK' | 'ABSENT';
  passengers_count: number | null;
  location_ok: boolean | null;
  created_by_user: string;
}): Promise<void> {
  const { error } = await db().from('taxi_zone_reports').insert(r);
  if (error) throw error;
}

/** The active taxi-zone report for a trip (date), if any. */
export async function getTaxiZoneReportForTrip(
  reportDate: string,
  tripId: string
): Promise<TaxiZoneReport | null> {
  const { data } = await db()
    .from('taxi_zone_reports')
    .select('*')
    .eq('report_date', reportDate)
    .eq('trip_id', tripId)
    .is('cancelled_at', null)
    .maybeSingle();
  return (data as TaxiZoneReport | null) ?? null;
}

/** Trip IDs that already have an active taxi-zone report today. */
export async function getTaxiZoneReportedTripIds(reportDate: string): Promise<Set<string>> {
  const { data } = await db()
    .from('taxi_zone_reports')
    .select('trip_id')
    .eq('report_date', reportDate)
    .is('cancelled_at', null);
  return new Set((data || []).map((r: any) => r.trip_id));
}

// ── Rol de operator pe zi (Aurel: zona taxi / peron) ──
export type OperatorRole = 'MAIN' | 'TAXI_ZONE';

/** Astăzi în Chișinău, 'YYYY-MM-DD'. */
function chisinauTodayYMD(): string {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' })).toISOString().slice(0, 10);
}

/** Rolul ales de user pe ziua de azi (Chișinău), sau null dacă n-a ales. */
export async function getOperatorDayRole(userId: string): Promise<OperatorRole | null> {
  const { data } = await db()
    .from('operator_day_role')
    .select('role')
    .eq('user_id', userId)
    .eq('work_date', chisinauTodayYMD())
    .maybeSingle();
  return (data?.role as OperatorRole | undefined) ?? null;
}

/** Setează (upsert) rolul userului pe azi. */
export async function setOperatorDayRole(userId: string, role: OperatorRole): Promise<void> {
  await db()
    .from('operator_day_role')
    .upsert(
      { user_id: userId, work_date: chisinauTodayYMD(), role, set_at: new Date().toISOString() },
      { onConflict: 'user_id,work_date' }
    );
}

/** Rolul efectiv azi: override-ul pe zi dacă există, altfel operator_kind (primarul/fallback). */
export async function effectiveRoleToday(user: { id: string; operator_kind: string | null }): Promise<OperatorRole> {
  const picked = await getOperatorDayRole(user.id);
  if (picked) return picked;
  return user.operator_kind === 'TAXI_ZONE' ? 'TAXI_ZONE' : 'MAIN';
}

/** Doar operatorii „comutabili" (primar TAXI_ZONE) aleg rolul pe zi — deocamdată doar Aurel. */
export function isSwitchableOperator(user: { operator_kind: string | null }): boolean {
  return user.operator_kind === 'TAXI_ZONE';
}

/**
 * Zona taxi e acoperită azi? = există un operator-taxi (primar TAXI_ZONE) activ care NU a ales
 * „peron" (MAIN) azi. Înlocuiește vechiul hasActiveTaxiOperator (verificare statică pe coloană).
 */
export async function isTaxiZoneCoveredToday(): Promise<boolean> {
  const { data: primaryTaxi } = await db()
    .from('users')
    .select('id')
    .eq('active', true)
    .eq('operator_kind', 'TAXI_ZONE');
  if (!primaryTaxi || primaryTaxi.length === 0) return false;

  const ids = primaryTaxi.map((u: any) => u.id as string);
  const { data: picks } = await db()
    .from('operator_day_role')
    .select('user_id, role')
    .eq('work_date', chisinauTodayYMD())
    .in('user_id', ids);
  const pickByUser = new Map((picks ?? []).map((p: any) => [p.user_id as string, p.role as string]));

  // Acoperit dacă vreun operator-taxi NU a ales 'MAIN' azi (default taxi sau a ales taxi explicit).
  return ids.some((id) => pickByUser.get(id) !== 'MAIN');
}

export async function getLastTaxiZoneReportByUser(userId: string): Promise<TaxiZoneReport | null> {
  const { data } = await db()
    .from('taxi_zone_reports')
    .select('*')
    .eq('created_by_user', userId)
    .is('cancelled_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as TaxiZoneReport | null) ?? null;
}

export async function cancelTaxiZoneReport(id: string, cancelledBy: string): Promise<void> {
  await db()
    .from('taxi_zone_reports')
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: cancelledBy })
    .eq('id', id);
}

// ── Weekly report data ────────────────────────────────

/** Drivers with violations in the period */
export async function getDriverViolations(
  dateFrom: string,
  dateTo: string
): Promise<Array<{ driver_name: string; uniform_count: number; aspect_count: number; curat_count: number; reclama_count: number }>> {
  const { data } = await db()
    .from('reports')
    .select('driver_id, exterior_ok, uniform_ok, auto_curat, reclama_ok, drivers(full_name)')
    .eq('status', 'OK')
    .is('cancelled_at', null)
    .gte('report_date', dateFrom)
    .lte('report_date', dateTo)
    .or('exterior_ok.eq.false,uniform_ok.eq.false,auto_curat.eq.false,reclama_ok.eq.false');

  if (!data || data.length === 0) return [];

  const map = new Map<string, { name: string; uniform: number; aspect: number; curat: number; reclama: number }>();
  for (const r of data as any[]) {
    const id = r.driver_id || 'unknown';
    const rawName = r.drivers?.full_name || '—';
    const np = rawName.split(' ');
    const name = np.length > 1 ? `${np[0]} ${np.slice(1).map((p: string) => p[0] + '.').join('')}` : rawName;
    if (!map.has(id)) map.set(id, { name, uniform: 0, aspect: 0, curat: 0, reclama: 0 });
    const entry = map.get(id)!;
    if (r.uniform_ok === false) entry.uniform++;
    if (r.exterior_ok === false) entry.aspect++;
    if (r.auto_curat === false) entry.curat++;
    if (r.reclama_ok === false) entry.reclama++;
  }

  return Array.from(map.values()).map((v) => ({
    driver_name: v.name,
    uniform_count: v.uniform,
    aspect_count: v.aspect,
    curat_count: v.curat,
    reclama_count: v.reclama,
  }));
}

/** Operators absent from work: controllers who didn't submit reports on workdays */
export async function getOperatorAbsences(
  dateFrom: string,
  dateTo: string
): Promise<Array<{ username: string; point: string; absence_count: number }>> {
  const { data: users } = await db()
    .from('users')
    .select('id, username, telegram_id, point')
    .eq('role', 'CONTROLLER')
    .eq('active', true);

  if (!users || users.length === 0) return [];

  const { data: reports } = await db()
    .from('reports')
    .select('created_by_user, report_date')
    .is('cancelled_at', null)
    .gte('report_date', dateFrom)
    .lte('report_date', dateTo);

  const userDates = new Map<string, Set<string>>();
  for (const r of (reports || []) as any[]) {
    if (!userDates.has(r.created_by_user)) userDates.set(r.created_by_user, new Set());
    userDates.get(r.created_by_user)!.add(r.report_date);
  }

  // Workdays in period (Mon-Fri)
  const workdays: string[] = [];
  const start = new Date(dateFrom + 'T12:00:00');
  const end = new Date(dateTo + 'T12:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      workdays.push(d.toISOString().slice(0, 10));
    }
  }

  const result: Array<{ username: string; point: string; absence_count: number }> = [];
  for (const u of users as any[]) {
    const reported = userDates.get(u.id) || new Set();
    const absent = workdays.filter((wd) => !reported.has(wd)).length;
    if (absent > 0) {
      result.push({
        username: u.username || `User #${u.telegram_id}`,
        point: u.point || '—',
        absence_count: absent,
      });
    }
  }

  return result.sort((a, b) => b.absence_count - a.absence_count);
}

// ── Reclama report data (din sarcinile auto către Vlad / Digital) ──────────────

/** Sarcini reclamă deschise (din obligations source='reclama'): mașina + data estimativă a lui Vlad. */
export async function getActiveReclamaIssues(): Promise<
  Array<{
    plate_number: string;
    deadline: string; // termenul sarcinii; estimated_date a rămas fără scriitor după scoaterea «accept»
    status: 'pending' | 'in_process' | 'overdue';
  }>
> {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' }))
    .toISOString().slice(0, 10);

  const { data } = await db()
    .from('obligations')
    .select('vehicle_plate, current_deadline, current_state')
    .eq('source', 'reclama')
    .in('current_state', NONTERMINAL_OB)
    .not('vehicle_plate', 'is', null);

  const rows = (data || []) as Array<{
    vehicle_plate: string; current_deadline: string; current_state: string;
  }>;
  const result = rows.map((r) => {
    // Întârzierea se măsoară de la TERMEN, nu de la data estimativă: estimated_date se completa
    // doar la «accept», iar pasul de acceptare a fost scos din flux (Ion, 17.08.2026) — altfel
    // secțiunea «🔴 EXPIRAT» din raportul săptămânal n-ar mai apărea niciodată, iar totul ar
    // atârna la «NEPRELUATE», adică raportul ar minți că nimeni nu lucrează.
    let status: 'pending' | 'in_process' | 'overdue';
    if (r.current_deadline.slice(0, 10) < today) status = 'overdue';
    else if (r.current_state === 'report_pending') status = 'in_process'; // raport depus, așteaptă decizia
    else status = 'pending';
    return { plate_number: r.vehicle_plate, deadline: r.current_deadline.slice(0, 10), status };
  });

  const rank: Record<'overdue' | 'pending' | 'in_process', number> = { overdue: 0, pending: 1, in_process: 2 };
  result.sort((a, b) => rank[a.status] - rank[b.status] || a.deadline.localeCompare(b.deadline));
  return result;
}

// ── Daily Assignments ─────────────────────────────────

/** Get the pre-assigned driver/vehicle for a trip on a given date (via crm_route_id) */
export async function getAssignmentForTrip(
  crmRouteId: number | null,
  date: string
): Promise<{ driver_id: string; driver_name: string; vehicle_id: string | null; plate_number: string | null } | null> {
  if (!crmRouteId) return null;
  const { data } = await db()
    .from('daily_assignments')
    .select('driver_id, vehicle_id, drivers(full_name), vehicles(plate_number)')
    .eq('crm_route_id', crmRouteId)
    .eq('assignment_date', date)
    .single();

  if (!data) return null;
  const d = data as any;
  return {
    driver_id: d.driver_id,
    driver_name: d.drivers?.full_name || '—',
    vehicle_id: d.vehicle_id || null,
    plate_number: d.vehicles?.plate_number || null,
  };
}

/** Update driver/vehicle in daily_assignment (when operator presses Schimbă) */
export async function updateAssignmentDriverVehicle(
  crmRouteId: number,
  date: string,
  driverId: string,
  vehicleId: string | null
): Promise<void> {
  await db()
    .from('daily_assignments')
    .update({ driver_id: driverId, vehicle_id: vehicleId })
    .eq('crm_route_id', crmRouteId)
    .eq('assignment_date', date);
}

// ── Day Validations ───────────────────────────────────

/** Check if a day is validated by a user */
export async function isDayValidated(userId: string, date: string): Promise<boolean> {
  const { data, error } = await db()
    .from('day_validations')
    .select('id')
    .eq('user_id', userId)
    .eq('validation_date', date)
    .single();
  if (error) return true; // If table doesn't exist, treat as validated
  return !!data;
}

/** Validate a day for a user */
export async function validateDay(userId: string, date: string): Promise<void> {
  const { error } = await db()
    .from('day_validations')
    .upsert({ user_id: userId, validation_date: date });
  if (error) console.warn('validateDay failed (table may not exist):', error.message);
}

/** Get yesterday's date (or last workday) that needs validation */
export async function getUnvalidatedDay(
  userId: string,
  today: string
): Promise<string | null> {
  // Only check yesterday (the previous calendar day)
  const yesterday = new Date(today + 'T12:00:00');
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // Check if user has reports for yesterday
  const { data: reports } = await db()
    .from('reports')
    .select('id')
    .eq('created_by_user', userId)
    .eq('report_date', yesterdayStr)
    .is('cancelled_at', null)
    .limit(1);

  if (!reports || reports.length === 0) return null;

  // Check if yesterday is already validated
  const { data: validation, error } = await db()
    .from('day_validations')
    .select('id')
    .eq('user_id', userId)
    .eq('validation_date', yesterdayStr)
    .single();

  // If day_validations table doesn't exist yet (migration 003 not applied), skip validation
  if (error && (error.code === 'PGRST205' || error.message?.includes('day_validations'))) {
    return null;
  }

  return validation ? null : yesterdayStr;
}
