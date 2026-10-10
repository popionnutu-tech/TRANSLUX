// Paza răspunsului (Ion, 10.10.2026: «hai să-i dăm reguli clare, vorbește strict în parametrii de la engine, bilete și
// grafic făcut de dispecer, nimic mai mult, nu inventează — putem asta bate în cuie?»).
//
// Promptul singur nu e o garanție: modelul a scris ora UTC drept oră locală (05:50 în loc de 08:50) și a dublat suma
// tur-returului (540 în loc de 270). De aceea serverul verifică textul ÎNAINTE să plece la client: fiecare oră, dată,
// sumă, procent și număr de telefon din răspuns trebuie să existe, scris la fel, în ce au întors tool-urile (motorul de
// căutare, biletele, graficul dispecerului), în ce a scris clientul sau în datele fixe ale promptului. Altfel răspunsul
// nu pleacă: modelul primește o dată lista celor inventate și rescrie; a doua oară — răspuns sigur, fără cifre.

/** Ce poate apărea în răspuns: tot textul din care modelul are voie să ia cifre. */
export interface Surse { texte: string[] }

export interface Incalcare { fel: 'ora' | 'data' | 'suma' | 'procent' | 'telefon'; valoare: string }

const ORA = /(?<![\d:.])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g;
const DATA = /(?<![\d.])(0?[1-9]|[12]\d|3[01])\.(0?[1-9]|1[0-2])(?:\.(\d{2,4}))?(?![\d])/g;
const SUMA = /(\d{1,3}(?:[  .]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:lei|leu|лей|лея|mdl)\b/giu;
const PROCENT = /(\d{1,3})\s*%/g;
const TELEFON = /\+?\d[\d\s\-()]{7,}\d/g;

const hhmm = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`;

/** Indexul surselor: orele, datele (DD.MM), numerele și telefoanele care apar în ele. */
export function indexSurse(s: Surse) {
  const ore = new Set<string>();
  const date = new Set<string>();
  const numere = new Set<string>();
  const cifreTel = new Set<string>();
  for (const t of s.texte) {
    // ISO-ul (2026-10-13T05:50:00Z) e UTC: din el NU se iau ore (asta a fost greșeala), doar ziua.
    for (const m of t.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) date.add(`${Number(m[3])}.${Number(m[2])}`);
    const faraIso = t.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g, ' ');
    for (const m of faraIso.matchAll(ORA)) ore.add(hhmm(m[1], m[2]));
    for (const m of faraIso.matchAll(DATA)) date.add(`${Number(m[1])}.${Number(m[2])}`);
    for (const m of faraIso.replace(ORA, ' ').matchAll(/\d+(?:[.,]\d+)?/g)) numere.add(String(Number(m[0].replace(',', '.'))));
    for (const m of t.matchAll(TELEFON)) { const d = m[0].replace(/\D/g, ''); if (d.length >= 8) cifreTel.add(d.slice(-8)); }
  }
  return { ore, date, numere, cifreTel };
}

/** Ce din `raspuns` nu se găsește în surse. Gol = răspunsul poate pleca. */
export function verificaRaspuns(raspuns: string, s: Surse): Incalcare[] {
  const ix = indexSurse(s);
  const out: Incalcare[] = [];
  const vazut = new Set<string>();
  const adauga = (i: Incalcare) => { const k = `${i.fel}|${i.valoare}`; if (!vazut.has(k)) { vazut.add(k); out.push(i); } };

  for (const m of raspuns.matchAll(SUMA)) {
    const n = String(Number(`${m[1].replace(/[  .]/g, '')}${m[2] ? `.${m[2]}` : ''}`));
    if (!ix.numere.has(n)) adauga({ fel: 'suma', valoare: m[0].trim() });
  }
  for (const m of raspuns.matchAll(PROCENT)) if (!ix.numere.has(String(Number(m[1])))) adauga({ fel: 'procent', valoare: m[0] });
  // Telefoanele întâi, ca cifrele lor să nu mai fie citite drept ore sau date.
  let rest = raspuns;
  for (const m of raspuns.matchAll(TELEFON)) {
    const d = m[0].replace(/\D/g, '');
    if (d.length < 8) continue;
    if (!ix.cifreTel.has(d.slice(-8))) adauga({ fel: 'telefon', valoare: m[0].trim() });
    rest = rest.replace(m[0], ' ');
  }
  rest = rest.replace(/https?:\/\/\S+/g, ' ');
  for (const m of rest.matchAll(ORA)) if (!ix.ore.has(hhmm(m[1], m[2]))) adauga({ fel: 'ora', valoare: m[0] });
  for (const m of rest.replace(ORA, ' ').matchAll(DATA)) if (!ix.date.has(`${Number(m[1])}.${Number(m[2])}`)) adauga({ fel: 'data', valoare: m[0] });
  return out;
}

/** Mesajul pentru model când a inventat: ce anume și ce să facă. */
export function cerereRescriere(inc: Incalcare[]): string {
  const lista = inc.map((i) => `${i.fel} «${i.valoare}»`).join(', ');
  return `[CONTROL AUTOMAT, nu e de la client] Răspunsul tău NU a plecat: conține ${lista}, care nu apar în rezultatele tool-urilor din conversație. Ai voie DOAR cu orele, datele, sumele și numerele scrise exact cum le-au întors tool-urile (motorul de căutare, biletele, graficul). Rescrie răspunsul fără ele: dacă îți trebuie o cifră, chemi tool-ul potrivit; dacă nu există tool pentru ea, spui că nu știi.`;
}
