// Ora rostită în cuvinte pentru agentul vocal — determinist, modelul citește dosloven
// (același tipar ca phone-spoken). Motiv: modelul convertea singur 14:20 în «patru și
// douăzeci după-amiază», nega ore existente și scotea forme inexistente («ventitre»).
// Exportate: controlorul (voice-controller) își construiește parserul INVERS din
// aceleași tabele — o corectură aici se propagă automat în ambele direcții.
export const RO_UNITS = ['zero', 'unu', 'doi', 'trei', 'patru', 'cinci', 'șase', 'șapte', 'opt', 'nouă',
  'zece', 'unsprezece', 'doisprezece', 'treisprezece', 'paisprezece', 'cincisprezece',
  'șaisprezece', 'șaptesprezece', 'optsprezece', 'nouăsprezece'];
export const RO_TENS = ['', '', 'douăzeci', 'treizeci', 'patruzeci', 'cincizeci'];
export const RU_UNITS = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять',
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
  'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
export const RU_TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят'];

function roNum(n: number): string {
  if (n < 20) return RO_UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u ? `${RO_TENS[t]} și ${RO_UNITS[u]}` : RO_TENS[t];
}

function ruNum(n: number): string {
  if (n < 20) return RU_UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u ? `${RU_TENS[t]} ${RU_UNITS[u]}` : RU_TENS[t];
}

/** null, dacă nu e o oră HH:MM validă. Format 24h, fără «după-amiază». */
export function timeSpoken(raw: string | null | undefined): { ro: string; ru: string } | null {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  if (min === 0) return { ro: `${roNum(h)} fix`, ru: `${ruNum(h)} ноль-ноль` };
  // Minutele 1-9 cer «zero»/«ноль» explicit în AMBELE limbi.
  // RU: altfel «шестнадцать пять» sună a 16:50.
  // RO: «X și <unitate>» e litera-cu-literă un numeral — 20:05 ieșea «douăzeci și
  // cinci», adică exact numărul 25, iar 20:01…20:09 dădeau 21…29. Apel 06.09,
  // Briceni→Chișinău: ultima cursă e 18:20, agentul a mai oferit una «la douăzeci
  // și cinci» — de nedeosebit de un numeral, și invizibilă pentru controlor
  // (RO_MIN_ALT accepta doar minute ≥10, pe premisa greșită că atât emitem).
  // «zero» nu apare niciodată în interiorul unui numeral, deci forma e neambiguă.
  const roMin = min < 10 ? `zero ${roNum(min)}` : `și ${roNum(min)}`;
  const ruMin = min < 10 ? `ноль ${ruNum(min)}` : ruNum(min);
  return { ro: `${roNum(h)} ${roMin}`, ru: `${ruNum(h)} ${ruMin}` };
}
