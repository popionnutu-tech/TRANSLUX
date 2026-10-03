// ION-198 — setul final de puncte de urcare: analiza lunii (luna.mjs → puncte-luna.json) + deciziile lui Ion de pe pagină
// (colecția «decizii» a artifactului, exportată în decizii.json). Ieșire: puncte-final.json (pentru interurban_puncte_urcare_aplica).
//   node final.mjs puncte-luna.json decizii.json puncte-final.json
import { readFileSync, writeFileSync } from 'node:fs';

const [, , IN = 'puncte-luna.json', DEC = 'decizii.json', OUT = 'puncte-final.json'] = process.argv;
const D = JSON.parse(readFileSync(IN, 'utf8'));
const decizii = JSON.parse(readFileSync(DEC, 'utf8'));   // [{id, data:{stare, lat, lon, localitate}}]

const hav = (a, b) => { const R = 6371e3, r = Math.PI / 180; const s = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[şș]/g, 's').replace(/[ţț]/g, 't').replace(/\s+/g, ' ').trim();
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-');
const cheie = (L, p) => `${slug(L.nume[0])}_${Math.round(p.lat * 1e5)}_${Math.round(p.lon * 1e5)}`;

// Nume RU: transliterare simplă RO → RU (numele de străzi din OSM n-au name:ru pe toate)
const TR = [['ș', 'ш'], ['ş', 'ш'], ['ț', 'ц'], ['ţ', 'ц'], ['ce', 'че'], ['ci', 'чи'], ['ge', 'дже'], ['gi', 'джи'], ['che', 'ке'], ['chi', 'ки'], ['ghe', 'ге'], ['ghi', 'ги'],
  ['ea', 'я'], ['ia', 'ия'], ['iu', 'ю'], ['ă', 'э'], ['â', 'ы'], ['î', 'ы'], ['a', 'а'], ['b', 'б'], ['c', 'к'], ['d', 'д'], ['e', 'е'], ['f', 'ф'], ['g', 'г'], ['h', 'х'], ['i', 'и'],
  ['j', 'ж'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['q', 'к'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['v', 'в'], ['w', 'в'], ['x', 'кс'], ['y', 'й'], ['z', 'з']];
function translit(s) {
  let out = ''; let i = 0; const low = s.toLowerCase();
  while (i < s.length) {
    const hit = TR.find(([a]) => low.startsWith(a, i));
    if (!hit) { out += s[i]; i++; continue; }
    const up = s[i] !== low[i]; const r = hit[1]; out += up ? r[0].toUpperCase() + r.slice(1) : r; i += hit[0].length;
  }
  return out;
}
const RU_FIX = [[/^str\.\s*/i, 'ул. '], [/^bd\.\s*/i, 'бул. '], [/^Strada\s+/i, 'ул. '], [/^Bulevardul\s+/i, 'бул. '], [/^Șoseaua\s+/i, 'шоссе '], [/^Calea\s+/i, 'Калea ']];
function numeRu(ro) {
  if (ro === 'Autogara') return 'Автовокзал';
  if (/^lângă Vama Criva$/.test(ro)) return 'у таможни Крива';
  let pre = ''; let rest = ro;
  for (const [re, r] of RU_FIX) if (re.test(rest)) { pre = r; rest = rest.replace(re, ''); break; }
  return (pre + translit(rest)).replace('Калea', 'Калеа');
}
// igienizare: fără caractere de markup/link, ≤ 40 caractere (tăiat la cuvânt)
function curat(s) {
  let t = String(s || '').replace(/[<>@/\\"'`{}[\]|]/g, ' ').replace(/https?/gi, '').replace(/\s+/g, ' ').trim();
  if (t.length > 40) t = t.slice(0, 40).replace(/\s+\S*$/, '');
  return t;
}

// Numele date după observațiile lui Ion (03.10), pe localitate și rang (rangul din setul final).
const NUME_ION = {
  'Sîngerei': { 1: ['intersecția spre Sîngerei', 'перекрёсток на Сынджерей'], 2: ['centura Sîngerei', 'объездная Сынджерей'] },
  'Orhei': { 1: ['ieșirea spre Bălți, lângă Petrom', 'выезд на Бельцы, у Petrom'] },
  'Brătușeni': { 1: ['intersecția Brătușeni', 'перекрёсток Брэтушень'] },
};
// Un nume de drum din OSM («Orhei-Bălți», «M5-Chetroșica Nouă-Gașpar-R8») nu-i spune nimic clientului.
const numeDeDrum = (n) => /^[MR]\d/.test(n) || (/^[^ ]+(-[^ ]+)+$/.test(n.replace(/ (Nouă|Noi|Vechi|de Sus|de Jos)/g, '')) && !/^Strada|^Bulevardul/.test(n)) || /^[A-ZĂÂÎȘȚ][^-]+-[A-ZĂÂÎȘȚ][^-]+(-.+)?$/.test(n) && !/^Strada|^Bulevardul/.test(n);
// numele de stradă scurtat (se citește pe telefon): «Strada Ștefan cel Mare și Sfânt» → «str. Ștefan cel Mare»
const taie = (t, n) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') : t);
const scurt = (n) => taie(n.replace(/ş/g, 'ș').replace(/ţ/g, 'ț').replace(/Ş/g, 'Ș').replace(/Ţ/g, 'Ț').replace(/^Strada\s+/, 'str. ').replace(/^Bulevardul\s+/, 'bd. ')
  .replace(/\s+și\s+Sf[âî]nt$/, ''), 30);
const PARTE = { nord: ['nord', 'север'], sud: ['sud', 'юг'], est: ['est', 'восток'], vest: ['vest', 'запад'] };

const rezultat = [], avert = [];
let scoase = 0, adaugate = 0;
for (const L of D.localitati) {
  const dec = decizii.filter((d) => d.data.localitate === L.nume[0]);
  const decPentru = (p) => dec.find((d) => d.id === cheie(L, p)) || dec.find((d) => hav(d.data, p) <= 50);
  const alese = [];
  for (const p of L.puncte) {
    const d = decPentru(p);
    const propus = !!p.rang;
    if (propus && d?.data.stare === 'scos') { scoase++; continue; }
    if (!propus && d?.data.stare !== 'adaugat') continue;
    if (!propus) adaugate++;
    const perechi = p.perechi.filter((P) => propus ? P.pub : (P.opr > 0 && !String(P.de || '').startsWith('capăt')));
    if (!perechi.length) { avert.push(`${L.nume[0]} ${p.lat},${p.lon}: fără rută (doar coborâre)`); continue; }
    alese.push({ p, propus });
  }
  // decizii care nu se potrivesc cu niciun punct (din altă versiune a paginii)
  for (const d of dec) if (!L.puncte.some((p) => decPentru(p) === d)) avert.push(`${L.nume[0]}: decizia ${d.id} (${d.data.stare}) nu mai are punct`);
  alese.sort((a, b) => (b.p.gara - a.p.gara) || (b.propus - a.propus) || ((a.p.rang || 9) - (b.p.rang || 9)) || (b.p.masini - a.p.masini));
  const nume = alese.map(({ p }, i) => {
    const ion = NUME_ION[L.nume[0]]?.[i + 1];
    if (ion) return ion;
    if (!p.nume || numeDeDrum(p.nume)) return [`${L.nume[0]}, pe șosea`, `${translit(L.nume[0])}, на трассе`];
    const sc = scurt(p.nume);
    return [sc, numeRu(sc)];
  });
  // nume repetate în aceeași localitate → partea localității (față de mijlocul punctelor cu același nume)
  for (const n of new Set(nume.map((x) => x[0]))) {
    const idx = nume.map((x, i) => (x[0] === n ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) continue;
    const pts = idx.map((i) => alese[i].p); const cy = pts.reduce((a, q) => a + q.lat, 0) / pts.length, cx = pts.reduce((a, q) => a + q.lon, 0) / pts.length;
    const folosite = new Set();
    for (const i of idx) {
      const q = alese[i].p; const dy = (q.lat - cy) * 111, dx = (q.lon - cx) * 74;
      let k = Math.abs(dy) >= Math.abs(dx) ? (dy >= 0 ? 'nord' : 'sud') : (dx >= 0 ? 'est' : 'vest');
      if (folosite.has(k)) k = Math.abs(dy) >= Math.abs(dx) ? (dx >= 0 ? 'est' : 'vest') : (dy >= 0 ? 'nord' : 'sud');
      folosite.add(k);
      nume[i] = [`${taie(nume[i][0], 30)} (${PARTE[k][0]})`, `${taie(nume[i][1], 30)} (${PARTE[k][1]})`];
    }
  }
  alese.forEach(({ p, propus }, i) => {
    const ro = curat(nume[i][0]);
    for (const localitate of L.nume) rezultat.push({
      localitate, lat: p.lat, lon: p.lon, rang: i + 1, nume_ro: ro, nume_ru: curat(nume[i][1]),
      zile: p.zile, masini: p.masini, curse: p.opriri, dur_med_s: p.durMed, decizie: propus ? 'analiza' : 'adaugat_ion',
      perechi: p.perechi.filter((P) => propus ? P.pub : (P.opr > 0 && !String(P.de || '').startsWith('capăt')))
        .map((P) => ({ crm_route_id: P.r, going_north: P.s === 'retur', pondere: Math.min(1, P.p), curse_trecute: P.trec, curse_oprite: P.opr })),
    });
  });
}
const peLoc = new Map(); for (const r of rezultat) peLoc.set(r.localitate, (peLoc.get(r.localitate) || 0) + 1);
const max = Math.max(...peLoc.values());
writeFileSync(OUT, JSON.stringify({ sursa: `gps-${D.FROM}-${D.TO}+decizii-ion`, puncte: rezultat }, null, 1));
console.log(`puncte ${rezultat.length} în ${peLoc.size} localități · scoase de Ion ${scoase} · adăugate ${adaugate} · max pe localitate ${max}`);
console.log('pe localitate:', [...peLoc.entries()].filter(([, n]) => n > 3).map(([l, n]) => `${l} ${n}`).join(', ') || '(niciuna peste 3)');
for (const a of avert) console.log('!', a);
