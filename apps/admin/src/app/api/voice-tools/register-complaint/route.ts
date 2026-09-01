import { NextRequest, NextResponse, after } from 'next/server';
import { validateVoiceApiKey } from '../auth';
import { unknownLocalityResponse } from '@/lib/voice-locality';
import { logUnknownLocalities } from '@/lib/voice-unknown';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { alertAdmins } from '@/lib/telegram-notify';
import { saveComplaint, formatComplaintAlert, type ComplaintInput, type Evidence } from '@/lib/voice/complaints';
import { normalizePhone } from '@/lib/voice/phone';
import {
  identifyTrip, normPlate, normName, uniqueDrivers, COMPLAINT_MAX_DAYS_BACK,
  MIN_PLATE, MIN_NAME, type IdentifyOutcome,
} from '@/lib/voice/trip-identify';

// Reclamațiile. Ion, 01.09: «în cazul reclamațiilor noi trebuie clar să
// identificăm cine este vinovatul, dacă nu identificăm șoferul — nu e clar
// responsabilitatea». Apelul care a declanșat regula (Bălți–Criva, 01:30,
// «Mihai», 250 lei în loc de 68) intrase ca text liber în cererea de callback:
// nici cursă, nici mașină, nici om.
//
// Vinovatul îl caută SERVERUL, cu aceeași identificare ca lucrurile uitate
// (identifyTrip). Modelul trimite doar ce a spus clientul — un nume scris de
// LLM nu leagă pe nimeni de nimic.
//
// Diferența față de find_past_trip: aici numărul și numele șoferului NU ies
// niciodată din server spre agent (decizia lui Ion: clientului nu i se spune
// cine a fost identificat). Agentul primește doar confirmarea sau refuzul.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Aceeași căutare scumpă ca find-past-trip, dar chemată mult mai rar: o
// reclamație pe apel, 2-3 apeluri ale tool-ului. 15/min taie doar abuzul.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 15;
let rateWindowStart = Date.now();
let rateCount = 0;
function rateLimited(): boolean {
  const now = Date.now();
  if (now - rateWindowStart > RATE_WINDOW_MS) { rateWindowStart = now; rateCount = 0; }
  rateCount += 1;
  return rateCount > RATE_MAX;
}

// Fraze GATA de rostit: agentul le citește dosloven, nu le compune. Refuzul e
// cel mai delicat text din tot fluxul — el spune omului că plângerea lui nu
// poate fi cercetată, și trebuie să sune la fel de fiecare dată.
const REFUSAL = {
  refusal_line_ro: 'Fără numărul mașinii sau fără numele șoferului nu putem stabili cine a fost la volan, deci reclamația nu poate fi cercetată. Dacă aflați numărul mașinii, sunați-ne din nou și o înregistrăm.',
  refusal_line_ru: 'Без номера машины или имени водителя мы не можем установить, кто был за рулём, поэтому жалобу не получится разобрать. Узнаете номер машины — перезвоните, и мы её зарегистрируем.',
};
const CONFIRM = {
  confirm_line_ro: 'Am înregistrat reclamația dumneavoastră. Compania o va verifica.',
  confirm_line_ru: 'Я зарегистрировал вашу жалобу. Компания её проверит.',
};
// Scrierea a eșuat: NU spunem că am înregistrat ceva ce nu există în bază.
const SAVE_FAILED = {
  refusal_line_ro: 'Nu am putut înregistra reclamația acum. Vă rugăm să sunați mai târziu.',
  refusal_line_ru: 'Сейчас не получилось зарегистрировать жалобу. Позвоните, пожалуйста, позже.',
};

export async function POST(req: NextRequest) {
  const authError = validateVoiceApiKey(req);
  if (authError) return authError;
  if (rateLimited()) return NextResponse.json({ error: 'rate limited' }, { status: 429 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* body opțional */ }
  // Tot ce scrie modelul intră cu plafon: câmpurile ajung în bază și în Telegram,
  // iar un text de model scăpat de sub control umple rândul (security L1).
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  const complaint = str(body.complaint, 2000) || null;
  const from = str(body.from, 80);
  const to = str(body.to, 80);
  const date = str(body.date, 40);
  const departure = str(body.departure, 20);
  const plate = normPlate(str(body.plate, 40));
  // Forma normalizată e pentru CĂUTARE; în rând se scrie ce a spus clientul —
  // pe un rând neidentificat numele rostit («Mihai») e singurul fir de cercetat.
  const driverNameRaw = str(body.driver_name, 120);
  const driverName = normName(driverNameRaw);

  // Cât cântărește identificarea: un semn adus de client (plăcuța, numele) sau
  // doar orarul. Plăcuța bate numele — o cifră greșită scoate candidatul, un nume
  // rostit se potrivește pe bucată. Decizia lui Ion 01.09: reclamația se
  // înregistrează oricum, dar temeiul se vede în alertă și în dosar.
  const evidence: Evidence = plate.length >= MIN_PLATE ? 'plate'
    : driverName.length >= MIN_NAME ? 'name'
    : 'trip_only';
  // Clientul a spus că nu mai știe nimic: cazul se închide aici, cu vinovatul
  // neidentificat — rândul rămâne pentru statistică, clientul aude refuzul.
  const noMoreDetails = body.no_more_details === true || body.no_more_details === 'true';
  const conversationId = str(body.conversation_id, 120) || null;
  // Numărul vine din dynamic_variable, nu din ce scrie modelul (lecția 24.08:
  // toate cererile de callback aveau caller_phone null).
  // Normalizat ca peste tot în voice (calls.ts): altfel același om apare în două
  // formate și sverificarea cu voice_calls.caller_phone cade (security M3).
  const callerPhone = normalizePhone(str(body.stated_phone, 40) || str(body.caller_phone, 40)) || null;

  // Fără conversation_id nu există «o conversație = o reclamație»: dedup-ul cade
  // (NULL nu se ciocnește cu NULL în unique), fiecare apel al tool-ului ar scrie
  // un rând nou și ar trimite încă o alertă. Mai bine niciun rând decât cinci
  // dosare pe același om (security M1).
  if (!conversationId) {
    console.error('register-complaint: conversation_id lipsă');
    return NextResponse.json({
      need_more: true,
      result_ro: 'Nu am putut înregistra reclamația. Recheamă tool-ul cu conversation_id = {{system__conversation_id}}.',
      result_ru: 'Жалобу записать не удалось. Вызови инструмент снова с conversation_id = {{system__conversation_id}}.',
    });
  }

  const today = chisinauTodayIso();

  // Scrierea rândului e aceeași peste tot; se schimbă doar ce știm despre cursă.
  // `alreadyIdentified` contează pentru CE spunem: dacă vinovatul e deja în bază,
  // un apel ulterior mai sărac nu are voie să-i spună omului «nu putem cerceta».
  let alreadyIdentified = false;
  async function persist(input: ComplaintInput) {
    try {
      const res = await saveComplaint(input);
      alreadyIdentified = alreadyIdentified || res.alreadyIdentified || input.identified;
      // Alerta poartă textul ÎNTREG al reclamației, nu doar ultima bucată trimisă
      // de model: mesajul din Telegram e singurul lucru pe care îl citește omul.
      const full = { ...input, complaint: res.complaint ?? input.complaint };
      // Telegram DUPĂ răspunsul către agent — nu ține vocea în loc.
      if (res.shouldAlert) after(async () => { await alertAdmins(formatComplaintAlert(full, res.corrected)); });
      return true;
    } catch (err) {
      console.error('register-complaint save failed:', err);
      return false;
    }
  }
  const unidentified = (tripDate: string | null): ComplaintInput => ({
    conversation_id: conversationId,
    caller_phone: callerPhone,
    complaint,
    trip_date: tripDate,
    departure: departure || null,
    route: from && to ? `${from} – ${to}` : null,
    driver_id: null, driver_name: driverNameRaw || null, plate: plate || null,
    identified: false,
    evidence,
    final: noMoreDetails,
  });

  let outcome: IdentifyOutcome;
  try {
    outcome = await identifyTrip({ from, to, date, departure, plate, driverName, today, maxDaysBack: COMPLAINT_MAX_DAYS_BACK });
  } catch (err) {
    // Căutarea a căzut: textul reclamației e singurul lucru pe care îl avem
    // MEREU și nu are voie să depindă de ea (audit 01.09).
    console.error('register-complaint identify failed:', err);
    const ok = await persist(unidentified(null));
    return NextResponse.json(ok
      ? { registered: true, identified: false, ...REFUSAL }
      : SAVE_FAILED);
  }

  // Rândul e scris; dacă baza a refuzat scrierea, agentul NU spune «am înregistrat».
  const closed = (ok: boolean, payload: Record<string, unknown>) =>
    NextResponse.json(ok ? payload : SAVE_FAILED);

  switch (outcome.kind) {
    // Cazurile în care mai avem ce întreba: rândul se scrie (reclamația nu se
    // pierde dacă apelul cade), dar cazul NU e închis decât dacă clientul spune
    // că nu mai știe nimic — abia atunci pleacă alerta.
    case 'need_day': {
      const ok = await persist(unidentified(null));
      if (alreadyIdentified) return closed(ok, { registered: true, identified: true, ...CONFIRM });
      if (noMoreDetails) return closed(ok, { registered: true, identified: false, ...REFUSAL });
      return NextResponse.json({
        need_more: true,
        result_ro: 'Nu am înțeles ziua. Întreabă clientul în ce zi s-a întâmplat: azi, ieri, alaltăieri sau ce dată?',
        result_ru: 'День не понят. Спроси клиента, в какой день это было: сегодня, вчера, позавчера или какое число?',
      });
    }
    case 'need_route': {
      const ok = await persist(unidentified(outcome.tripDate));
      if (alreadyIdentified) return closed(ok, { registered: true, identified: true, ...CONFIRM });
      if (noMoreDetails) return closed(ok, { registered: true, identified: false, ...REFUSAL });
      return NextResponse.json({
        date: outcome.tripDate, need_more: true,
        result_ro: 'Ca să știm cine a fost la volan am nevoie de rută (de unde și până unde), sau de numărul mașinii, sau de numele șoferului.',
        result_ru: 'Чтобы понять, кто был за рулём, нужен маршрут (откуда и куда), или номер машины, или имя водителя.',
      });
    }
    case 'unknown_locality': {
      // Cazul NU se închide aici: mai avem ce întreba, deci rândul rămâne deschis
      // și alerta nu se «arde» pe un NEIDENTIFICAT care se poate încă rezolva.
      // Cazul se închide DOAR dacă clientul a spus că nu mai știe nimic; altfel
      // rămâne deschis, ca alerta să nu se «ardă» pe un NEIDENTIFICAT încă rezolvabil.
      const ok = await persist({ ...unidentified(outcome.tripDate), final: noMoreDetails });
      after(() => logUnknownLocalities('register-complaint', outcome.unknown, outcome.suggestions));
      if (alreadyIdentified) return closed(ok, { registered: true, identified: true, ...CONFIRM });
      // Clientul nu mai are ce spune: a-l întreba iar localitatea ar învârti
      // apelul în gol — se închide cu refuzul.
      if (noMoreDetails) return closed(ok, { registered: true, identified: false, ...REFUSAL });
      return NextResponse.json({
        date: outcome.tripDate, ...unknownLocalityResponse(outcome.unknown, outcome.suggestions),
      });
    }
    // Peste fereastra reclamațiilor: cazul se închide pe loc, fără căutare.
    case 'too_old': {
      const ok = await persist({ ...unidentified(outcome.tripDate), final: true });
      // Formularea spune POLITICA, nu o imposibilitate tehnică: datele mai vechi
      // există, dar reclamațiile de peste trei luni nu se mai cercetează.
      return closed(ok, {
        registered: true, identified: false, too_old: true,
        refusal_line_ro: `Reclamația e despre o cursă de acum mai bine de ${COMPLAINT_MAX_DAYS_BACK} de zile — atât de vechi nu le mai cercetăm.`,
        refusal_line_ru: `Жалоба о поездке более чем ${COMPLAINT_MAX_DAYS_BACK}-дневной давности — такие мы уже не разбираем.`,
      });
    }
    default: {
      const { withPhone, uniquePhones } = uniqueDrivers(outcome.candidates);
      if (uniquePhones.length === 1) {
        // Un singur om corespunde detaliilor: ăsta e vinovatul, cu legătură în
        // nomenclator. Numele și numărul lui NU ies din server spre agent.
        const c = withPhone.find((x) => x.departure) ?? withPhone[0];
        const ok = await persist({
          conversation_id: conversationId,
          caller_phone: callerPhone,
          complaint,
          trip_date: outcome.tripDate,
          departure: c.departure,
          route: c.route_ro,
          driver_id: c.driver_id,
          driver_name: c.driver,
          plate: c.plate,
          identified: true,
          evidence,
          final: true,
        });
        return closed(ok, { registered: true, identified: true, date: outcome.tripDate, ...CONFIRM });
      }
      const ok = await persist(unidentified(outcome.tripDate));
      if (alreadyIdentified) return closed(ok, { registered: true, identified: true, ...CONFIRM });
      if (noMoreDetails) return closed(ok, { registered: true, identified: false, ...REFUSAL });
      // Numărul candidaților NU se spune clientului și niciun nume nu pleacă
      // spre agent: el cere DOAR detaliul care face cursa unică.
      return NextResponse.json({
        need_more: true, date: outcome.tripDate,
        result_ro: uniquePhones.length === 0
          ? 'Nu am găsit cursa. Întreabă clientul un detaliu în plus: ziua exactă, ora plecării, numărul mașinii sau numele șoferului.'
          : 'Detaliile se potrivesc cu mai multe curse. Întreabă clientul numărul mașinii sau ora exactă a plecării.',
        result_ru: uniquePhones.length === 0
          ? 'Рейс не найден. Спроси у клиента ещё одну деталь: точный день, время отправления, номер машины или имя водителя.'
          : 'Под детали подходит несколько рейсов. Спроси у клиента номер машины или точное время отправления.',
      });
    }
  }
}
