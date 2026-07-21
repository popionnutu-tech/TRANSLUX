// Encoder Code128-B → SVG (fără dependențe). Generează un cod de bare scanabil din orice text ASCII imprimabil.
// Folosit la eticheta piesei (Catalog). Scanerul inelar (HID) citește Code128 nativ.

// Cele 107 tipare (0..106): lățimile modulelor bar/spațiu. 104=Start B, 106=Stop (7 module).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const STOP = 106;

// Lățimile modulelor (alternând bară/spațiu, începând cu bară) pentru un text Code128-B.
function modules(text: string): number[] {
  const codes: number[] = [START_B];
  let sum = START_B;
  for (let i = 0; i < text.length; i++) {
    const v = text.charCodeAt(i) - 32; // Code B: ASCII 32..126 → 0..94
    codes.push(v);
    sum += v * (i + 1);
  }
  codes.push(sum % 103); // cifra de control
  codes.push(STOP);
  const widths: number[] = [];
  for (const c of codes) for (const ch of PATTERNS[c]) widths.push(Number(ch));
  return widths;
}

// Valoarea efectiv codată (ASCII imprimabil, plafon rezonabil). Afișeaz-o ca număr uman sub bare,
// ca numărul tipărit să coincidă exact cu ce citește scanerul.
export function cleanCode128(text: string): string {
  return (text || '').replace(/[^\x20-\x7E]/g, '').slice(0, 48);
}

// SVG cu barele codului (fără text — numărul se afișează separat, escapat de React).
// Întoarce '' dacă textul e gol după curățare. viewBox în unități de modul; se scalează pe lățime.
export function code128BarsSvg(text: string, height = 60): string {
  const clean = cleanCode128(text);
  if (!clean) return '';
  const widths = modules(clean);
  const quiet = 10; // zonă liniștită (margini)
  let x = quiet;
  let rects = '';
  for (let i = 0; i < widths.length; i++) {
    if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${widths[i]}" height="${height}"/>`;
    x += widths[i];
  }
  const total = x + quiet;
  return `<svg viewBox="0 0 ${total} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" fill="#000" style="width:100%;height:100%;display:block">${rects}</svg>`;
}
