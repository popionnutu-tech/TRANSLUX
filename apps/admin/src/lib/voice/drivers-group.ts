import { getSupabase } from '../supabase';
import { escapeHtml, sendTelegram } from '../telegram-notify';
import { DRIVERS_GROUP_CONFIG_KEY } from '@translux/db';
import type { Evidence } from './complaints';
import { CULPRIT_RU, type Culprit } from './complaint-types';

// Grupa șoferilor (Ion, 02.09): «cum apare plingere care e din vina lor sa apara
// in grupa soferi reclamatii. Sau daca cineva ceva a pierdut — tot sa apara».
//
// Grupa se leagă din bot, cu comanda /lega_reclamatii scrisă ÎN grupă de un
// administrator — același tipar ca /lega_sarcini. Id-ul stă în app_config, deci
// schimbarea grupei nu cere nici variabilă de mediu, nici deploy.
//
// CE NU INTRĂ ÎN GRUPĂ, hotărât la livrare:
//  - numele obiectului uitat: decizia lui Ion din 30.08 — nu se păstrează și nu
//    se transmite nicăieri, fiindcă ASR-ul îl stâlcește și modelul îl ghicește.
//
// TOATE reclamațiile intră, din 11.09 (Ion: «pune toate reclamațiile să plece în
// chat cu șoferii») — și cele care nu cad pe șofer (starea mașinii, site-ul,
// rezervarea), și cele cu șoferul neidentificat. Până atunci grupa primea doar
// tipurile cu vinovat «șoferul», iar o reclamație «Altceva» cu șofer
// neidentificat (apelul din 11.09) nu ajungea la nimeni în afară de admini.
// Ca să nu arate ca o acuzație, mesajul spune pe față pe cine cade după tip.
//
// LIMBA GRUPEI E RUSA (Ion, 11.09: «toate le trimiți în rusă»): șoferii citesc
// rusește. Tot ce compune fișierul ăsta pentru grupă e în rusă — titluri, rânduri,
// denumirea tipului (name_ru din nomenclator), «[номер скрыт]». Alerta adminilor
// (complaints.ts) rămâne în română; codul și comentariile, la fel.
//
// TELEFONUL CLIENTULUI la lucruri uitate: intră, din 07.09. Regula veche («datele
// unui străin într-un chat cu douăzeci de oameni») presupunea că omul are unde
// suna. N-are: singurul număr public, +37360401010, e chiar linia agentului AI,
// deci «sunați la birou» îl trimitea înapoi la robot. Agentul e ultima instanță
// (Ion, 07.09), așa că firul se închide invers — șoferul sună clientul.

// Cheia e în @translux/db: botul o scrie, panoul o citește — o singură definiție.
export { DRIVERS_GROUP_CONFIG_KEY } from '@translux/db';

// Cache de proces: id-ul se schimbă o dată la câțiva ani, iar citirea stă pe
// calea apelului telefonic. TTL, nu invalidare — botul care leagă grupa rulează
// în alt proces (Railway) decât ruta care trimite (Vercel).
const TTL_MS = 5 * 60_000;
let cache: { at: number; chatId: string | null } | null = null;

export async function driversGroupChatId(): Promise<string | null> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.chatId;
  const { data, error } = await getSupabase()
    .from('app_config')
    .select('value')
    .eq('key', DRIVERS_GROUP_CONFIG_KEY)
    .maybeSingle();
  if (error) {
    console.error('driversGroupChatId:', error.message);
    return null; // fără cache pe eroare: nu îngheța «nu există grupă» cinci minute
  }
  const chatId = (data?.value ?? '').trim() || null;
  // «Nu există grupă» NU se ține în cache: Ion leagă grupa cu /lega_reclamatii și
  // încearcă imediat. Cinci minute de tăcere după legare arată exact ca o
  // funcție stricată, iar lucrul uitat din acel apel s-ar marca trimis și n-ar
  // mai pleca niciodată (audit 02.09). O interogare de 0,06 ms nu merită asta.
  if (chatId) cache = { at: now, chatId };
  return chatId;
}

/** Trimite în grupă. Grupa nelegată nu e eroare — doar nu se trimite nimic. */
export async function notifyDriversGroup(text: string): Promise<boolean> {
  const chatId = await driversGroupChatId();
  if (!chatId) return false;
  return sendTelegram(chatId, text);
}

export interface GroupComplaint {
  driver_name: string | null;
  plate: string | null;
  identified: boolean;
  route: string | null;
  departure: string | null;
  trip_date: string | null;
  complaint: string | null;
  /** Denumirea tipului, deja luată din nomenclator — cea RUSĂ (name_ru). */
  type_name: string | null;
  /** Pe cine cade după tip (nomenclator). Lipsă = dosar fără tip. */
  culprit?: Culprit | null;
  /** Pe ce se sprijină identificarea (migr. 308). */
  evidence: Evidence;
}

// Temeiul, spus pe scurt. Măsurat pe prod 01.09: 78,8% dintre perechile rută+zi
// au UN singur șofer, iar orarul e public — deci o acuzație «din orar» numește
// un om fără ca apelantul să fi urcat vreodată în autobuz. Alerta către admini
// spune asta din 01.09; grupa TREBUIE să o spună cu atât mai mult, fiindcă acolo
// mesajul îl citesc douăzeci de colegi ai omului (security 02.09).
const TEMEI_GRUPA: Record<Evidence, string> = {
  plate: 'Клиент назвал номер машины.',
  name: 'Клиент назвал имя водителя.',
  trip_only: '⚠️ Клиент НЕ назвал ни машину, ни имя — рейс определён по расписанию.',
};

// `route` și `departure` sunt tot text scris de model (pe calea neidentificată,
// localitățile nici nu trec prin nomenclator). Aceeași sursă, aceeași redactare
// ca textul reclamației — altfel în același mesaj ar sta două regimuri de
// încredere diferite (security 02.09).
function cursa(c: { route: string | null; departure: string | null; trip_date: string | null }): string {
  // Ziua NU trece prin redactare: o scrie serverul (`2026-09-02`), iar filtrul de
  // numere ar înghiți-o ca pe un telefon. Ruta și ora vin de la model.
  const parti = [
    c.route ? pentruGrupa(c.route) : null,
    c.departure ? pentruGrupa(c.departure) : null,
    c.trip_date,
  ];
  return parti.filter(Boolean).map((x) => escapeHtml(String(x))).join(' · ') || 'рейс не установлен';
}

/**
 * Textul reclamației, pregătit pentru un chat cu douăzeci de oameni.
 *
 * Textul îl scrie modelul din povestea clientului, deci poate căra înăuntru
 * exact ce am hotărât să nu ajungă în grupă: numărul clientului («sunați-mă la
 * 069…»), uneori numele lui. Șirurile de cifre se taie; adminii primesc oricum
 * textul întreg. Plafonul ține mesajul sub limita Telegram de 4096 — peste ea,
 * `sendMessage` respinge tot mesajul și nimeni nu află nimic.
 */
function pentruGrupa(text: string): string {
  // Separatoarele pe care le pune un om între cifre: spațiu, punct, liniuță,
  // paranteze, slash, două puncte, underscore. Flag-ul `u` cu \p{Nd} prinde și
  // cifrele nelatine. Pragul e pe NUMĂRUL DE CIFRE (7+), nu pe lungimea totală:
  // «069/12/34/56» are 9 cifre, dar între ele stau destule semne cât să scape
  // unui prag pe lungime (security 02.09).
  // Virgula și liniuțele Unicode (‐-―) sunt separatoare la fel de
  // firești — en-dash-ul chiar apare în propriile noastre rute («Bălți – Criva»).
  const fara = text.replace(
    /\p{Nd}(?:[\s.,\-()/:_‐-―]*\p{Nd}){6,}/gu,
    '[номер скрыт]',
  );
  return fara.length > 300 ? `${fara.slice(0, 300)}…` : fara;
}

function omul(driver_name: string | null, plate: string | null): string | null {
  const p = [driver_name, plate].filter(Boolean).map((x) => escapeHtml(String(x))).join(' · ');
  return p || null;
}

/**
 * Reclamația, așa cum o citesc șoferii.
 *
 * Ion a cerut numele și mașina pe față. I-am arătat prețul: o acuzație încă
 * necercetată rămâne în grupă și atunci când clientul a greșit mașina. De aceea
 * mesajul poartă temeiul identificării, iar schimbarea șoferului în dosar
 * trimite o corectare — altfel în chat ar rămâne numit un om nevinovat.
 */
export function formatComplaintForGroup(
  c: GroupComplaint,
  corectare = false,
  inlocuit: { driver_name: string | null; plate: string | null } | null = null,
  tipCorectat = false,
): string {
  const cine = c.identified ? omul(c.driver_name, c.plate) : null;
  const vechi = corectare ? omul(inlocuit?.driver_name ?? null, inlocuit?.plate ?? null) : null;
  return [
    corectare
      ? '⚠️ <b>Жалоба — ИСПРАВЛЕНИЕ: другой водитель</b>'
      // Tipul s-a schimbat pe ACEEAȘI reclamație: fără titlu propriu, al doilea
      // mesaj arăta în grupă ca a doua acuzație pe același om.
      : tipCorectat
        ? '⚠️ <b>Жалоба — ТИП ИСПРАВЛЕН (тот же случай)</b>'
        : '⚠️ <b>Жалоба клиента</b>',
    // Corectarea trebuie să-l și DISCULPE pe cel numit înainte. Fără rândul ăsta,
    // cine intră mai târziu în chat vede două acuzații, nu o corectare.
    vechi ? `Речь уже не о ${vechi}.` : null,
    cine ? `<b>${cine}</b>` : '<b>Водитель не установлен</b> — кто узнаёт рейс, сообщите диспетчеру.',
    cursa(c),
    c.type_name ? escapeHtml(c.type_name) : null,
    // Din 11.09 grupa vede TOATE reclamațiile, deci și pe cele de care nu răspunde
    // șoferul. Rândul ăsta le deosebește de o acuzație: omul numit e martor, nu
    // vinovat. La «de stabilit» nu se știe încă — se spune exact așa.
    c.culprit && c.culprit !== 'SOFER'
      ? (c.culprit === 'NECLAR'
        ? 'ℹ️ Кто отвечает: выяснится при проверке.'
        : `ℹ️ Не вина водителя — отвечает ${CULPRIT_RU[c.culprit]}.`)
      : null,
    c.complaint ? `«${escapeHtml(pentruGrupa(c.complaint))}»` : null,
    // Valoare necunoscută → avertismentul cel mai prudent, nu lipsa lui: fără
    // fallback, un `evidence` neprevăzut ar fi șters tăcut exact rândul care
    // spune că acuzația vine doar din orar.
    cine ? (TEMEI_GRUPA[c.evidence] ?? TEMEI_GRUPA.trip_only) : null,
    // Ion (02.09, la primul mesaj văzut în grupă): «reclamatiile sunt verificat
    // de ai call centru intodeauna» — cuvântul «neverificată» a zburat.
    // Complementul «cursa și șoferul» nu e stil: fără el, «Verificată» se lipea
    // de «Reclamația» și rândul afirma că ACUZAȚIA e confirmată — fals, cu
    // numele unui om, în fața a douăzeci de colegi (review 02.09). Ce a
    // verificat AI-ul e cursa și cine era pe ea; cât de tare, spune rândul cu
    // temeiul. Fără șofer identificat nu s-a verificat nimic — rândul lipsește.
    cine ? '<i>Проверено AI колл-центром: рейс и водитель.</i>' : null,
  ].filter(Boolean).join('\n');
}

// «Reclamație RETRASĂ de pe șofer» (audit 02.09) a dispărut pe 11.09: exista doar
// pentru cazul în care tipul ieșea de sub șofer și grupa nu mai primea nimic.
// Acum grupa primește și tipul nou, cu titlul «TIP CORECTAT» și cu rândul «Nu
// cade pe șofer» — același caz, spus o dată, fără un al treilea fel de mesaj.

export interface GroupLostItem {
  driver_name: string | null;
  plate: string | null;
  identified: boolean;
  route: string | null;
  departure: string | null;
  trip_date: string | null;
  /** Clientul NU a primit numărul: avea reclamație pe același apel (migr. 315). */
  phone_withheld?: boolean;
  /** Numărul de pe care a sunat clientul (voice_calls.caller_phone). */
  caller_phone?: string | null;
  /** Numele dat de client. Există doar dacă apelul l-a cules (migr. 321). */
  caller_name?: string | null;
}

export function formatLostItemForGroup(l: GroupLostItem, areReclamatie = false): string {
  const cine = l.identified ? omul(l.driver_name, l.plate) : null;
  // Clientul, ca șoferul să-l poată suna: fără asta, o cursă neidentificată era
  // un fir mort — omul n-are unde suna, numărul public e chiar agentul AI.
  // Rândul e OBLIGATORIU (Ion, 07.09): nume și număr, mereu. Ce lipsește se
  // spune pe față — un rând absent arată ca o uitare, unul cu «necules» arată
  // ca un fapt, iar șoferul știe că trebuie să întrebe dispecerul.
  const nume = l.caller_name?.trim() ? escapeHtml(l.caller_name.trim()) : null;
  const numar = l.caller_phone?.trim() ? escapeHtml(l.caller_phone.trim()) : null;
  const client = `${nume ?? '⚠️ имя не записано'} · ${numar ?? '⚠️ номер скрыт'}`;
  return [
    '🎒 <b>Забытая вещь в автобусе</b>',
    cine ? `<b>${cine}</b>` : '<b>Рейс не установлен</b> — кто узнаёт рейс, сообщите диспетчеру.',
    cursa(l),
    `📞 Клиент: <b>${client}</b>`,
    !cine
      ? numar
        // Firul se închide invers: nu clientul sună compania, ci șoferul clientul.
        ? '<i>Вещь остаётся у водителя. Кто узнаёт рейс — позвоните клиенту.</i>'
        : '<i>Вещь остаётся у водителя, пока клиент её не заберёт.</i>'
      : l.phone_withheld
        // Clientul n-a primit numărul (avea și reclamație pe același apel):
        // șoferul nu trebuie să aștepte un telefon care nu vine.
        ? '<i>Вещь сдаётся в офис — у клиента НЕТ номера.</i>'
        // Clientul are deja numărul șoferului (find_past_trip i l-a dat):
        // șoferul trebuie doar să știe că îl va suna cineva.
        : '<i>У клиента есть номер, он позвонит сам.</i>',
    // Ordinea inversă a apelului mixt: numărul a fost dat ÎNAINTE ca reclamația
    // să existe, deci poarta din find-past-trip n-a avut ce opri. Nu se mai
    // poate retrage — dar șoferul trebuie să știe cine îl va suna.
    cine && !l.phone_withheld && areReclamatie
      ? '⚠️ <i>По этому же звонку есть и жалоба — звонящий клиент и есть заявитель.</i>'
      : null,
  ].filter(Boolean).join('\n');
}
