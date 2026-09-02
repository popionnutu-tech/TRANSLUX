import { getSupabase } from '../supabase';
import { escapeHtml, sendTelegram } from '../telegram-notify';
import { DRIVERS_GROUP_CONFIG_KEY } from '@translux/db';
import type { Evidence } from './complaints';

// Grupa șoferilor (Ion, 02.09): «cum apare plingere care e din vina lor sa apara
// in grupa soferi reclamatii. Sau daca cineva ceva a pierdut — tot sa apara».
//
// Grupa se leagă din bot, cu comanda /lega_reclamatii scrisă ÎN grupă de un
// administrator — același tipar ca /lega_sarcini. Id-ul stă în app_config, deci
// schimbarea grupei nu cere nici variabilă de mediu, nici deploy.
//
// CE NU INTRĂ ÎN GRUPĂ, hotărât la livrare:
//  - telefonul clientului: sunt datele unui străin într-un chat cu douăzeci de
//    oameni. Cine își recunoaște cursa răspunde în grupă sau sună la birou;
//  - numele obiectului uitat: decizia lui Ion din 30.08 — nu se păstrează și nu
//    se transmite nicăieri, fiindcă ASR-ul îl stâlcește și modelul îl ghicește;
//  - reclamațiile care nu cad pe șofer (starea mașinii, site-ul, rezervarea):
//    acolo răspunde compania, iar în grupă ar fi doar zgomot.

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
  /** Denumirea tipului, deja luată din nomenclator. */
  type_name: string | null;
  /** Pe ce se sprijină identificarea (migr. 308). */
  evidence: Evidence;
}

// Temeiul, spus pe scurt. Măsurat pe prod 01.09: 78,8% dintre perechile rută+zi
// au UN singur șofer, iar orarul e public — deci o acuzație «din orar» numește
// un om fără ca apelantul să fi urcat vreodată în autobuz. Alerta către admini
// spune asta din 01.09; grupa TREBUIE să o spună cu atât mai mult, fiindcă acolo
// mesajul îl citesc douăzeci de colegi ai omului (security 02.09).
const TEMEI_GRUPA: Record<Evidence, string> = {
  plate: 'Clientul a dat numărul mașinii.',
  name: 'Clientul a dat numele șoferului.',
  trip_only: '⚠️ Clientul NU a dat nici mașina, nici numele — cursa a fost dedusă din orar.',
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
  return parti.filter(Boolean).map((x) => escapeHtml(String(x))).join(' · ') || 'cursă neidentificată';
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
    '[număr ascuns]',
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
      ? '⚠️ <b>Reclamație — CORECTARE: alt șofer</b>'
      // Tipul s-a schimbat pe ACEEAȘI reclamație: fără titlu propriu, al doilea
      // mesaj arăta în grupă ca a doua acuzație pe același om.
      : tipCorectat
        ? '⚠️ <b>Reclamație — TIP CORECTAT (același caz)</b>'
        : '⚠️ <b>Reclamație de la un client</b>',
    // Corectarea trebuie să-l și DISCULPE pe cel numit înainte. Fără rândul ăsta,
    // cine intră mai târziu în chat vede două acuzații, nu o corectare.
    vechi ? `Nu mai e vorba de ${vechi}.` : null,
    cine ? `<b>${cine}</b>` : '<b>Șofer neidentificat</b> — cine recunoaște cursa să anunțe dispecerul.',
    cursa(c),
    c.type_name ? escapeHtml(c.type_name) : null,
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
    cine ? '<i>Verificată de call-centrul AI: cursa și șoferul.</i>' : null,
  ].filter(Boolean).join('\n');
}

/**
 * Retragerea acuzației din grupă.
 *
 * Se trimite când tipul reclamației se mută de pe șofer pe companie DUPĂ ce
 * grupa a văzut mesajul. Fără ea, în chat rămânea numit un om pentru ceva de
 * care nu răspunde — iar mecanismul de corectare exista doar pentru cazul în
 * care se schimba PERSOANA (audit 02.09).
 */
export function formatComplaintRetraction(
  c: Omit<GroupComplaint, 'complaint' | 'type_name' | 'evidence'>,
  tipNou: string | null,
): string {
  const cine = c.identified ? omul(c.driver_name, c.plate) : null;
  return [
    '✅ <b>Reclamație RETRASĂ de pe șofer</b>',
    cine ? `<b>${cine}</b>` : null,
    cursa(c),
    tipNou
      ? `S-a stabilit alt tip: ${escapeHtml(tipNou)} — nu ține de șofer.`
      : 'S-a stabilit că nu ține de șofer.',
  ].filter(Boolean).join('\n');
}

export interface GroupLostItem {
  driver_name: string | null;
  plate: string | null;
  identified: boolean;
  route: string | null;
  departure: string | null;
  trip_date: string | null;
  /** Clientul NU a primit numărul: avea reclamație pe același apel (migr. 315). */
  phone_withheld?: boolean;
}

export function formatLostItemForGroup(l: GroupLostItem, areReclamatie = false): string {
  const cine = l.identified ? omul(l.driver_name, l.plate) : null;
  return [
    '🎒 <b>Lucru uitat în autobuz</b>',
    cine ? `<b>${cine}</b>` : '<b>Cursă neidentificată</b> — cine recunoaște cursa să anunțe dispecerul.',
    cursa(l),
    !cine
      ? '<i>Obiectul rămâne la șofer până îl caută clientul.</i>'
      : l.phone_withheld
        // Clientul n-a primit numărul (avea și reclamație pe același apel):
        // șoferul nu trebuie să aștepte un telefon care nu vine.
        ? '<i>Obiectul se predă la birou — clientul NU are numărul.</i>'
        // Clientul are deja numărul șoferului (find_past_trip i l-a dat):
        // șoferul trebuie doar să știe că îl va suna cineva.
        : '<i>Clientul are numărul și sună direct.</i>',
    // Ordinea inversă a apelului mixt: numărul a fost dat ÎNAINTE ca reclamația
    // să existe, deci poarta din find-past-trip n-a avut ce opri. Nu se mai
    // poate retrage — dar șoferul trebuie să știe cine îl va suna.
    cine && !l.phone_withheld && areReclamatie
      ? '⚠️ <i>Pe același apel există și o reclamație — clientul care sună e reclamantul.</i>'
      : null,
  ].filter(Boolean).join('\n');
}
