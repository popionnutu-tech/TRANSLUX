// Prenumele șoferului pentru voce (Ion, 24.08: fără nume de familie).
// Formatul din drivers.full_name NU e uniform (review d92af07): «Nume Prenume»,
// «Nume Prenume Patronimic» (Docuciaev Dumitru Petru), inițiale («Zaiț S.», «Goncear R I»).
// Regula: al DOILEA cuvânt plin = prenumele; inițialele nu-s nume. Ion (24.08):
// «unde nu este nume la șofer, nu se spune» — fără prenume real întoarcem null,
// iar fraza pentru voce dă doar numărul, fără nume.
const INITIAL_RE = /^\p{Lu}\.?$/u;

export function driverFirstName(fullName: string | null | undefined): string | null {
  const tokens = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const fullWords = tokens.filter((t) => !INITIAL_RE.test(t));
  return fullWords.length >= 2 ? fullWords[1] : null;
}

// Prenumele pentru fraza RUSEASCĂ. Latina într-o frază rusească e citită de TTS
// după reguli englezești: în conv_9901m0t2 driver_line_ru suna «Водитель рейса
// восемнадцать десять — Vladimir», iar modelul turbo_v2_5 rostea numele cu
// fonetică engleză. Numele din drivers.full_name sunt un set închis (69 de forme,
// interogare 24.08), deci dicționarul acoperă practic tot; transliterarea e doar
// plasa de siguranță pentru un șofer nou.
// Numele NU se traduce: Vasile rămâne «Василе», nu devine «Василий».
const RU_NAMES: Record<string, string> = {
  alexandr: 'Александр', alexandru: 'Александру', alexei: 'Алексей',
  anatol: 'Анатол', anatoli: 'Анатолий', anatolie: 'Анатолие', anatolii: 'Анатолий',
  andrei: 'Андрей', arcadie: 'Аркадие', boris: 'Борис', constantin: 'Константин',
  dionis: 'Дионис', dorian: 'Дориан', dumitru: 'Думитру', eduard: 'Эдуард',
  efim: 'Ефим', egor: 'Егор', feodor: 'Феодор', fiodor: 'Фёдор',
  ghenadie: 'Геннадие', gheorghe: 'Георге', grigore: 'Григоре', grigorii: 'Григорий',
  igor: 'Игорь', ion: 'Ион', iurie: 'Юрие', iurii: 'Юрий', ivan: 'Иван',
  leonid: 'Леонид', marcel: 'Марчел', marin: 'Марин', mihail: 'Михаил',
  nicolae: 'Николае', nicolai: 'Николай', octavii: 'Октавий', oleg: 'Олег',
  pavel: 'Павел', petru: 'Петру', radu: 'Раду', roman: 'Роман',
  serafim: 'Серафим', sergei: 'Сергей', serghei: 'Сергей', sergiu: 'Серджиу',
  simion: 'Симион', trifan: 'Трифан', tudor: 'Тудор', valentin: 'Валентин',
  valerii: 'Валерий', valeriu: 'Валериу', vasile: 'Василе', vasili: 'Василий',
  vasilii: 'Василий', veaceslav: 'Вячеслав', veceslav: 'Вечеслав', victor: 'Виктор',
  viorel: 'Виорел', vitalie: 'Виталие', vitalii: 'Виталий', vladimer: 'Владимир',
  vladimir: 'Владимир', ștefan: 'Штефан', stefan: 'Штефан',
};

// Ordinea contează: grupurile lungi înaintea literelor simple.
// «ia», «iu», «ea» se transformă DOAR la început de cuvânt. Globale, ele rupeau
// silabele în mijloc (architecture-guardian, 24.08): Adrian→Адрян, Cristian→Кристян,
// Marius→Марюс. Un nume nou merită o transliterare literală, nu una inventivă.
const TRANSLIT: [RegExp, string][] = [
  [/^iu/, 'ю'], [/^ia/, 'я'], [/^ie/, 'е'],
  [/gh/g, 'г'], [/ch/g, 'к'], [/ce/g, 'че'], [/ge/g, 'дже'],
  // ci/gi + vocală = una singură: Ciobanu → Чобану, nu Чиобану.
  [/ci(?=[aeiouăâî])/g, 'ч'], [/gi(?=[aeiouăâî])/g, 'дж'],
  [/ci/g, 'чи'], [/gi/g, 'джи'],
  [/ii/g, 'ий'], [/ei/g, 'ей'],
  [/[șş]/g, 'ш'], [/[țţ]/g, 'ц'], [/ă/g, 'э'], [/[âî]/g, 'ы'], [/x/g, 'кс'],
  [/a/g, 'а'], [/b/g, 'б'], [/c/g, 'к'], [/d/g, 'д'], [/e/g, 'е'], [/f/g, 'ф'],
  [/g/g, 'г'], [/h/g, 'х'], [/i/g, 'и'], [/j/g, 'ж'], [/k/g, 'к'], [/l/g, 'л'],
  [/m/g, 'м'], [/n/g, 'н'], [/o/g, 'о'], [/p/g, 'п'], [/q/g, 'к'], [/r/g, 'р'],
  [/s/g, 'с'], [/t/g, 'т'], [/u/g, 'у'], [/v/g, 'в'], [/w/g, 'в'], [/y/g, 'й'], [/z/g, 'з'],
];

function translit(name: string): string {
  let out = name.toLowerCase();
  for (const [re, to] of TRANSLIT) out = out.replace(re, to);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function driverFirstNameRu(fullName: string | null | undefined): string | null {
  const name = driverFirstName(fullName);
  if (!name) return null;
  // Numele venit deja în chirilice se dă neatins.
  if (!/[a-zA-ZăâîșşțţĂÂÎȘŞȚŢ]/.test(name)) return name;
  // Object.hasOwn, nu indexare directă: un «Constructor» ar lua funcția din
  // prototip, iar `??` n-ar prinde-o — fraza ar primi cod în loc de nume.
  const key = name.toLowerCase();
  return Object.hasOwn(RU_NAMES, key) ? RU_NAMES[key] : translit(name);
}
