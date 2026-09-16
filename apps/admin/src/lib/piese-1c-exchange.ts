import 'server-only';

// Citirea fișierului de schimb 1C („Конвертация данных 2.0" — `<ФайлОбмена>`).
//
// NU e CommerceML, protocolul pe care îl exportăm azi în fila „1C". Acolo trimitem catalogul cu id-urile
// NOASTRE; aici citim catalogul LOR, ca să aflăm GUID-ul fiecărei entități. Fără el n-avem cum exporta
// documente: regulile 1C sincronizează strict după identificator, iar un GUID necunoscut nu dă eroare —
// creează un articol nou (vezi migr. 359).
//
// Parser scris de mână, nu prin bibliotecă XML: fișierul are ~66% reguli de conversie care nu ne
// interesează, iar obiectele de catalog sunt plate și previzibile. Ne trebuie patru câmpuri din fiecare.

export type ObiectCatalog = {
  tip: string;            // ИмяПравила: Номенклатура / Склады / Сотрудники / ОсновныеСредства
  guid: string;
  nume: string | null;    // Наименование
  articol: string | null; // Артикул (doar la nomenclator)
  cod: string | null;     // Код
};

// `ВидыДеятельности` poartă MAȘINA, nu un tip de activitate: în exemplu valorile sunt „Transport de
// pasageri", „Ungheni" și „458 BRAX", iar documentul o folosește pe ultima. Confirmat de contabilă
// (16.09): «вид деятельности — se pune numarul masinii».
const TIPURI = new Set(['Номенклатура', 'Склады', 'Сотрудники', 'ОсновныеСредства', 'ВидыДеятельности']);

// Un obiect are DOUĂ zone: blocul `<Ссылка>` de la început, care ține identitatea (GUID, ЭтоГруппа), și
// restul, care ține atributele (Артикул, Наименование). Confuzia dintre ele a fost primul defect al
// parserului: căutând totul înainte de `<Ссылка>`, nu găseam niciun GUID și fișierul ieșea gol.
function zone(corp: string): { identitate: string; atribute: string } {
  const i = corp.indexOf('<Ссылка');
  if (i < 0) return { identitate: '', atribute: corp };
  const j = corp.indexOf('</Ссылка>', i);
  if (j < 0) return { identitate: corp.slice(i), atribute: '' };
  return { identitate: corp.slice(i, j), atribute: corp.slice(j + '</Ссылка>'.length) };
}

// `<Пусто/>` în loc de `<Значение>` înseamnă câmp necompletat — regexul cere `<Значение>`, deci iese null.
function prop(zona: string, nume: string): string | null {
  const m = zona.match(new RegExp(`<Свойство Имя="${nume}" Тип="[^"]*">\\s*<Значение>([^<]*)</Значение>`));
  return m ? m[1].trim() || null : null;
}

export function citesteCatalog1C(xml: string): ObiectCatalog[] {
  // Datele încep după reguli. Fără tăietura asta am citi și obiectele-exemplu din reguli, dacă există.
  const i = xml.indexOf('</ПравилаОбмена>');
  const date = i >= 0 ? xml.slice(i) : xml;

  const out: ObiectCatalog[] = [];
  // `<Объект\b` NU merge în JavaScript: `\b` e definit pe ASCII, iar după un caracter chirilic nu există
  // graniță de cuvânt — regexul nu s-ar potrivi niciodată. (În Python `\b` e Unicode, de aceea proba
  // făcută acolo trecea.) De aceea `\s`, explicit.
  const re = /<Объект\s[^>]*ИмяПравила="([^"]+)"[^>]*>([\s\S]*?)<\/Объект>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(date)) !== null) {
    const tip = m[1];
    if (!TIPURI.has(tip)) continue;
    const { identitate, atribute } = zone(m[2]);
    const guid = prop(identitate, '\\{УникальныйИдентификатор\\}');
    if (!guid) continue;
    // Grupele de catalog („Загруженная номенклатура") NU sunt articole. Legate de o piesă de-a noastră,
    // eliberarea ar scădea în contabilitate de pe un dosar, nu de pe marfă.
    if (prop(identitate, 'ЭтоГруппа') === 'true') continue;
    out.push({
      tip, guid,
      nume: prop(atribute, 'Наименование'),
      articol: prop(atribute, 'Артикул'),
      cod: prop(atribute, 'Код'),
    });
  }
  // Același obiect poate apărea de mai multe ori (o dată ca obiect, o dată ca referință rezolvată).
  const vazute = new Set<string>();
  return out.filter((o) => {
    const k = `${o.tip}:${o.guid}`;
    if (vazute.has(k)) return false;
    vazute.add(k);
    return true;
  });
}

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export type Potrivire = {
  guid: string; nume: string | null; cheie: string | null;
  id: number | null;            // id-ul nostru, dacă s-a găsit
  stare: 'potrivit' | 'negasit' | 'ambiguu' | 'fara_cheie';
  candidati?: number[];
};

/**
 * Potrivește obiectele 1C cu ale noastre, după o cheie (articol pentru piese, număr pentru mașini, nume
 * pentru lăcătuși și depozite).
 *
 * NU scrie nimic și NU alege în caz de ambiguitate. Din 10 525 de piese active, 161 de coduri de articol
 * sunt purtate de mai multe piese — dacă am alege noi, am lega tăcut eliberarea de articolul greșit din
 * contabilitate. Ambiguitățile ies pe o listă pe care o rezolvă omul.
 */
export function potriveste(
  obiecte: ObiectCatalog[],
  alenoastre: { id: number; cheie: string | null }[],
  dupa: 'articol' | 'nume',
): Potrivire[] {
  const index = new Map<string, number[]>();
  for (const n of alenoastre) {
    const k = norm(n.cheie);
    if (!k) continue;
    (index.get(k) ?? index.set(k, []).get(k)!).push(n.id);
  }
  return obiecte.map((o) => {
    const cheie = dupa === 'articol' ? o.articol : o.nume;
    const k = norm(cheie);
    if (!k) return { guid: o.guid, nume: o.nume, cheie, id: null, stare: 'fara_cheie' as const };
    const gasite = index.get(k) || [];
    if (gasite.length === 1) return { guid: o.guid, nume: o.nume, cheie, id: gasite[0], stare: 'potrivit' as const };
    if (gasite.length === 0) return { guid: o.guid, nume: o.nume, cheie, id: null, stare: 'negasit' as const };
    return { guid: o.guid, nume: o.nume, cheie, id: null, stare: 'ambiguu' as const, candidati: gasite };
  });
}
