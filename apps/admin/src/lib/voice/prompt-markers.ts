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
  'ZIUA — DOSLOVEN',
  'e un CORIDOR',
  'SFÂRȘIT NUME RUSEȘTI',
  'NIMENI NU SUNĂ ÎNAPOI — NICIODATĂ, IAR «AM NOTAT» NU E O PROMISIUNE',
  'STAȚIA CHIȘINĂU — AUTOGARA TRANSLUX',
  'STAȚIA BĂLȚI — PEROANELE',
  'ORA SOSIRII — NU SE SPUNE',
  'LUCRURI UITATE — ȘOFERUL IDENTIFICAT, NUMELE CLIENTULUI OBLIGATORIU',
  'RECLAMAȚIA — ÎNTÂI CE S-A ÎNTÂMPLAT, APOI VINOVATUL ȘI NUMELE',
  'ZIUA ÎN LOC DE LOCALITATE',
  'LINIA ROMÂNEASCĂ — DOAR ROMÂNA, ORICUM AR VORBI CLIENTUL',
  'CÂMPURILE _RU — DOAR ÎN REPLICI RUSEȘTI',
  'ALT NUMĂR NU EXISTĂ',
  'ZI FĂRĂ CURSE — URMĂTOAREA VINE DIN TOOL',
  'OPERATOR — NU AM CUI TRANSMITE',
  'NU GHICI — CE N-A SPUS CLIENTUL NU EXISTĂ',
];

/** Aceleași repere, în promptul agentului rusesc. */
export const PROMPT_MARKERS_RU = [
  'СТАНЦИЯ КИШИНЁВ — АВТОВОКЗАЛ ТРАНСЛЮКС',
  'СТАНЦИЯ БЕЛЬЦЫ — ПЕРРОНЫ',
  'ВРЕМЯ ПРИБЫТИЯ — НЕ НАЗЫВАЕТСЯ',
  'ЗАБЫТЫЕ ВЕЩИ — ОПОЗНАННЫЙ ВОДИТЕЛЬ, ИМЯ КЛИЕНТА ОБЯЗАТЕЛЬНО',
  'ЖАЛОБА — СНАЧАЛА ЧТО СЛУЧИЛОСЬ, ПОТОМ ВИНОВНЫЙ И ИМЯ',
  'ДЕНЬ ВМЕСТО НАСЕЛЁННОГО ПУНКТА',
  'РУССКАЯ ЛИНИЯ — ТОЛЬКО РУССКИЙ, КАК БЫ НИ ГОВОРИЛ КЛИЕНТ',
  'ДРУГОГО НОМЕРА НЕ СУЩЕСТВУЕТ',
  'ДЕНЬ БЕЗ РЕЙСОВ — СЛЕДУЮЩИЙ ПРИХОДИТ ИЗ ТУЛА',
  'ОПЕРАТОР — ПЕРЕДАТЬ НЕКОМУ',
  'НИКТО НЕ ПЕРЕЗВАНИВАЕТ — НИКОГДА, А «ЗАПИСАЛА» — НЕ ОБЕЩАНИЕ',
  'НЕ ДОМЫСЛИВАЙ — ЧЕГО КЛИЕНТ НЕ СКАЗАЛ, ТОГО НЕТ',
];

export const TOATE_MARKERELE = [...PROMPT_MARKERS_RO, ...PROMPT_MARKERS_RU];
