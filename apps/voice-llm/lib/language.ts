// TRANSLUX voice — detecția limbii apelantului, pentru predarea între agenți.
// Funcții pure, fără I/O. Portat din TLX (lib/voice/language.ts, 24.08), cu o
// singură diferență de ȚINTĂ: la TLX un singur agent își comuta vocea prin
// `language_detection`; aici agenții RO și RU sunt separați, iar decizia se
// materializează în `transfer_to_agent`.
//
// De ce merită: tura în care se decide limba e MUTĂ (agentul nu are voie să
// vorbească înainte de comutare/predare). Măsurat pe apeluri reale TLX, modelul
// consuma 2214 și 2446 ms doar ca să spună „e rusă". Literele nu au nevoie de
// un LLM — proxy-ul răspunde la fel în ~2 ms.
//
// PRUDENȚA E ESENȚA: predarea e mai scumpă decât o comutare de voce (drum
// înapoi = al doilea transfer), deci pragurile sunt DELIBERAT stricte. La orice
// îndoială întoarcem null și tura pleacă la model, adică exact comportamentul
// de dinainte, doar mai lent.

import type { OpenAIMessage } from "./openai-compat";

export type VoiceLang = "ro" | "ru";

function textOf(m: OpenAIMessage): string {
  const c = m.content;
  if (c == null) return "";
  if (typeof c === "string") return c;
  return c.map((p) => (p?.type === "text" ? p.text ?? "" : "")).join("");
}

/**
 * Limba unui text, DOAR la un avantaj clar. `null` = prea scurt sau ambiguu.
 * Pragurile (≥4 litere, diferență ≥3) există pentru că „Da, TLX." are 3 litere
 * latine contra 2 chirilice și ar declara română într-un apel rusesc.
 */
export function langOfText(text: string): VoiceLang | null {
  const cyr = (text.match(/[а-яё]/gi) ?? []).length;
  const lat = (text.match(/[a-zăâîșțşţ]/gi) ?? []).length;
  if (cyr + lat < 4 || Math.abs(cyr - lat) < 3) return null;
  return cyr > lat ? "ru" : "ro";
}

// Cuvinte de serviciu: singurul semn că omul chiar VORBEȘTE limba, nu doar
// folosește literele ei. Fără filtrul ăsta, „Ocnița" sau „Sîngerei" rostite de
// două ori într-un apel rusesc (litere latine, zero chirilice) ar declanșa o
// predare — iar vocabularul unui apel de transport E format din toponime.
const RO_MARKERS = /(^|[^a-zăâîșțşţ])(și|nu|da|la|ce|cât|cat|este|sunt|aveți|aveti|avem|are|am|bună|buna|ziua|vă|va|rog|mulțumesc|multumesc|pentru|care|unde|când|cand|cu|de|pe|un|o|vreau|vrea|puteți|puteti|spuneți|spuneti|acum|astăzi|astazi|mâine|maine|preț|pret|prețul|pretul|cursă|cursa|curse|plecare|pleacă|pleaca|șofer|sofer|colet|bagaj|loc|locuri|mă|ma|cheamă|cheama|numele|doresc|merci)([^a-zăâîșțşţ]|$)/i;
const RU_MARKERS = /(^|[^а-яё])(и|не|да|нет|что|сколько|стоит|есть|здравствуйте|спасибо|пожалуйста|вы|мне|мы|у|на|в|это|где|когда|как|хочу|можно|скажите|подскажите|сейчас|сегодня|завтра|цена|цену|цены|рейс|рейса|рейсы|выезд|выезжает|водитель|посылка|багаж|место|места|меня|зовут|вам|вас|наш|наши|нужен|нужно|едет|едем)([^а-яё]|$)/i;

// VETO pentru limbile care nu există pentru agent. Markerii de mai sus
// deosebesc ALFABETUL, nu limba: „Are you open right now?" prinde românescul
// „are", „чи є у вас місце" prinde rusescul „у". O predare greșită trimite
// omul la un agent care nu-i vorbește limba — mai rău decât o tură lentă.
//
// Clasele de graniță includ diacriticele: cu [^a-z] simplu, „ș" din „Ocnița"
// devine graniță de cuvânt și cuvinte englezești se potrivesc în interiorul
// celor românești. Regulă generală: orice [a-z] peste text românesc e un bug
// care așteaptă.
//
// Lista engleză e FĂRĂ omografe românești: „are", „am", „la", „o", „un", „da",
// „nu", „ce", „de", „pe", „cu" lipsesc dinadins, altfel româna adevărată ar fi
// respinsă. Ce rămâne acoperă oricum frazele reale.
const EN_VETO = /(^|[^a-zăâîșțşţ])(you|your|the|is|do|does|have|has|what|how|much|many|can|could|at|for|near|right|now|hello|hi|please|thank|thanks|want|need|there|my|we|it|and|open|bus|trip|ticket|driver|luggage|parcel|seat|pay|by|looking|price|prices|tell|me|about|working|hours|available)([^a-zăâîșțşţ]|$)/i;
const UA_VETO = /[іїєґ]|(^|[^а-яё])(дякую|будь ласка|скільки|немає|місце)([^а-яё]|$)/i;

/**
 * Limba unei replici a APELANTULUI. Mai strictă decât `langOfText`: cere un
 * cuvânt de serviciu al limbii ȘI absența semnelor de altă limbă.
 */
export function langOfUtterance(text: string): VoiceLang | null {
  const lang = langOfText(text);
  if (!lang) return null;
  if (lang === "ro" && EN_VETO.test(text)) return null;
  if (lang === "ru" && UA_VETO.test(text)) return null;
  const markers = lang === "ru" ? RU_MARKERS : RO_MARKERS;
  return markers.test(text) ? lang : null;
}

/**
 * Limba în care VORBEȘTE agentul acum. `null` = nu știm sigur — cine cere
 * certitudine trebuie să trateze cazul, nu să ghicească.
 */
export function detectVoiceLang(msgs: OpenAIMessage[]): VoiceLang | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "assistant") continue;
    const lang = langOfText(textOf(m));
    if (lang) return lang;
    // Replică ambiguă („Da.") — căutăm mai sus una mai lungă.
  }
  return null;
}

/**
 * Limba spre care trebuie PREDAT apelul acum, sau `null` dacă nu e cazul.
 *
 * Condiții, toate obligatorii:
 *  - ultimul mesaj e al apelantului (o tură de după un rezultat de tool nu se
 *    întrerupe cu o predare — răspunsul la tool s-ar pierde);
 *  - limba agentului curent e cunoscută sigur;
 *  - ULTIMELE DOUĂ replici ale apelantului sunt clar în cealaltă limbă, cu
 *    cuvinte de serviciu, nu doar cu literele ei.
 *
 * Cererea EXPLICITĂ („давайте по-русски", „hai pe română") NU e acoperită aici:
 * ea cere înțelegerea sensului, nu numărarea literelor, și rămâne la model —
 * unde o singură replică e de ajuns, conform promptului.
 */
export function pendingLanguageTransfer(msgs: OpenAIMessage[]): VoiceLang | null {
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== "user") return null;

  const voice = detectVoiceLang(msgs);
  if (!voice) return null;

  const langs: VoiceLang[] = [];
  for (let i = msgs.length - 1; i >= 0 && langs.length < 2; i--) {
    const m = msgs[i];
    if (m.role !== "user") continue;
    const lang = langOfUtterance(textOf(m));
    if (!lang) return null; // replică ambiguă = serie ruptă, nu predăm
    langs.push(lang);
  }
  if (langs.length < 2 || langs[0] !== langs[1]) return null;

  return langs[0] === voice ? null : langs[0];
}
