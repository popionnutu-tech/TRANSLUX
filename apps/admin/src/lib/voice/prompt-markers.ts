/**
 * Reperele după care controlerul recunoaște blocurile din promptul viu.
 *
 * Trăiesc într-un fișier fără dependențe fiindcă au DOI consumatori de naturi
 * diferite: controlerul agentului (detectează blocul lipsă și îl livrează) și
 * panoul nomenclatorului de reclamații (refuză o denumire care ar conține un
 * reper). Fără lista comună, panoul verifica doar reperele lui: o denumire cu
 * textul «RECLAMAȚIA — VINOVATUL IDENTIFICAT» făcea `prompt.includes(marker)`
 * adevărat, controlerul credea blocul viu, iar blocul care interzice numirea
 * vinovatului putea fi șters din dashboard fără ca cineva să afle (security 02.09).
 *
 * Markerele TREBUIE să rămână unice între ele: unul care apare și în alt bloc
 * face detectorul orb la ștergerea blocului propriu.
 */
export const PROMPT_MARKERS_RO = [
  'ORELE — DOSLOVEN',
  'UNIVERSUL localităților',
  'Doriți numărul lui?',
  'A DOUA OARĂ LA RÂND',
  'ZIUA — DOSLOVEN',
  'e un CORIDOR',
  'SFÂRȘIT NUME RUSEȘTI',
  'APEL ÎNAPOI — NICIO PROMISIUNE',
  'STAȚIA CHIȘINĂU — AUTOGARA TRANSLUX',
  'STAȚIA BĂLȚI — PEROANELE',
  'ORA SOSIRII — NU SE SPUNE',
  'LUCRURI UITATE — ȘOFERUL IDENTIFICAT, OBIECTUL FĂRĂ NUME',
  'RECLAMAȚIA — VINOVATUL IDENTIFICAT',
  'CÂMPURILE _RU — DOAR ÎN REPLICI RUSEȘTI',
];

/** Aceleași repere, în promptul agentului rusesc. */
export const PROMPT_MARKERS_RU = [
  'СТАНЦИЯ КИШИНЁВ — АВТОВОКЗАЛ ТРАНСЛЮКС',
  'СТАНЦИЯ БЕЛЬЦЫ — ПЕРРОНЫ',
  'ВРЕМЯ ПРИБЫТИЯ — НЕ НАЗЫВАЕТСЯ',
  'ЗАБЫТЫЕ ВЕЩИ — ОПОЗНАННЫЙ ВОДИТЕЛЬ, ВЕЩЬ БЕЗ НАЗВАНИЯ',
  'ЖАЛОБА — ВИНОВНЫЙ ОПОЗНАН',
];

export const TOATE_MARKERELE = [...PROMPT_MARKERS_RO, ...PROMPT_MARKERS_RU];
