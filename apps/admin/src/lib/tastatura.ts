// Tastatura lăsată pe alt layout. Cerut de Eduard (08.10): «При вводе в строку поиска непонятного набора
// знаков — проверять на 2-языках. Например ay06844 он должен понимать что это fe06844».
//
// Nu e o greșeală de scris, e ACEEAȘI TASTĂ apăsată cu alt layout. Pe ЙЦУКЕН, litera «а» stă pe tasta lui
// `f`, iar «у» pe tasta lui `e`. Și cum «у» chirilic arată la fel ca `y` latin, pe ecran iese „ау06844",
// care pare „ay06844" — de unde și exemplul lui.
//
// În depozit se tastează articole latine (FE06844, TAC11650) pe calculatoare lăsate pe rusă, fiindcă
// denumirile pieselor sunt chirilice. Schimbarea layout-ului la fiecare căutare e exact genul de lucru pe
// care nimeni nu-l face consecvent.

// Rândurile tastaturii, aceeași poziție fizică în ambele layout-uri.
const QWERTY = `qwertyuiop[]asdfghjkl;'zxcvbnm,./\`` ;
const JCUKEN = 'йцукенгшщзхъфывапролджэячсмитьбю.ё';

const laChirilic = new Map<string, string>();
const laLatin = new Map<string, string>();
for (let i = 0; i < QWERTY.length; i++) {
  const q = QWERTY[i], j = JCUKEN[i];
  if (!q || !j) continue;
  laChirilic.set(q, j);
  laChirilic.set(q.toUpperCase(), j.toUpperCase());
  laLatin.set(j, q);
  laLatin.set(j.toUpperCase(), q.toUpperCase());
}

const schimba = (s: string, harta: Map<string, string>) =>
  Array.from(s).map((c) => harta.get(c) ?? c).join('');

// A DOUA confuzie, diferită de prima: literele chirilice care ARATĂ ca cele latine. „ТАС11650" scris cu
// Т, А, С chirilice e vizual identic cu „TAC11650", dar pentru bază sunt caractere complet diferite.
// Nu e o problemă de layout — omul chiar voia literele alea, doar că tastatura era pe rusă și n-a avut
// cum să observe. Lista e CONSERVATOARE: doar perechile identice la vedere, nu cele doar asemănătoare.
const OMOGLIFE: Array<[string, string]> = [
  ['А','A'],['В','B'],['Е','E'],['К','K'],['М','M'],['Н','H'],['О','O'],['Р','P'],['С','C'],['Т','T'],['У','Y'],['Х','X'],
  ['а','a'],['е','e'],['о','o'],['р','p'],['с','c'],['у','y'],['х','x'],
];
const chirilicLaLatin = new Map(OMOGLIFE);
const latinLaChirilic = new Map(OMOGLIFE.map(([c, l]) => [l, c] as [string, string]));

// Variantele sub care merită căutat un termen: cum s-a tastat, plus cum ar arăta cu celălalt layout.
// Se întoarce DOAR ce diferă de original și nu e gol — altfel am căuta de trei ori același lucru.
//
// Se aplică în ambele sensuri: și pentru cine tastează chirilic când voia latin (cazul lui Eduard), și
// invers — cineva care caută «фильтр» cu tastatura pe engleză obține „abkmnh".
export function variantePeLayout(termen: string): string[] {
  const t = (termen ?? '').trim();
  if (!t) return [];
  const out = [t];
  // Ordinea contează: omoglifele primele. Un articol scris „ТАС11650" cu litere chirilice devine
  // „TAC11650" și se găsește din prima; trecut prin layout ar fi dat „NFC11650", adică nimic.
  for (const v of [schimba(t, chirilicLaLatin), schimba(t, latinLaChirilic),
                   schimba(t, laLatin), schimba(t, laChirilic)]) {
    if (v !== t && v.trim() && !out.includes(v)) out.push(v);
  }
  return out;
}
