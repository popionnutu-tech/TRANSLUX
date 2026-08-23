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
  // Minutele 1-9 în rusă cer «ноль» explicit («шестнадцать ноль пять»), altfel sună a 16:50.
  const ruMin = min < 10 ? `ноль ${ruNum(min)}` : ruNum(min);
  return { ro: `${roNum(h)} și ${roNum(min)}`, ru: `${ruNum(h)} ${ruMin}` };
}
