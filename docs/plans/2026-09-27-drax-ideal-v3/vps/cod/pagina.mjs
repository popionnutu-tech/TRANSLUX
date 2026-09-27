// Pasul 7: pagina scheletului IDEAL Drăxlmaier (ION-71), după cod/pagina.mjs (ION-45): carduri pe rută, bloc pe LINIE,
// un singur drum pe linie (turul zilei alese; returul = același drum), fără gol, fără km din act. Satele actului ca la Florești:
// verde oprește / punctat trece / tăiat lipsește, cu % din cursele sursei.
import { writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
const scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };   // F3 v5 (R3-1): fără rescriere pe loc
import { readFileSync, writeFileSync } from 'node:fs';
const S = JSON.parse(readFileSync('../../date/ideal-v3/schelet-ideal.json', 'utf8'));
const N = JSON.parse(readFileSync('../../date/ideal-v3/nomenclator.json', 'utf8'));
const D = JSON.parse(readFileSync("../../date/ideal-v3/curse-ideal.json", "utf8"));
const SH = JSON.parse(readFileSync("../../date/ideal-v3/schimburi-ideal.json", "utf8"));
const CS = JSON.parse(readFileSync("../../date/ideal-v3/care-schimb-ideal.json", "utf8"));
const chip = it => `<span class="ch ${CUL[it.locuri] || "c00"}${it.dupaAct ? "" : " nu"}" title="${esc(it.capat || "")} · ${it.km} km · ${it.grupa ? "grupa " + it.grupa : "fără grupă"}${it.dupaAct ? "" : " · altfel decât cere actul"}"><u>${it.nr}</u>${esc(it.linie)}${it.doar ? "<i>doar</i>" : ""}</span>`;
const lista = (w, s) => `<div class="cs"><div class="h">${s === "s1" ? "schimbul 1 · 07:00–15:30" : "schimbul 2 · 15:30–00:00"} <small>${CS[w][s].length} linii</small></div>${CS[w][s].map(chip).join("")}</div>`;
const SAPT_SEPT = { 36: "31.08–06.09", 37: "07–13.09", 38: "14–20.09", 39: "21–27.09" };   // etichete; faza vine din schimburi-ideal.json (w.faza)
const sch = s => s === "s1" ? "sch. 1" : "sch. 2";
const regimTxt = q => { if (!q) return ""; const o = q.ore || {}; const ora = s => o[s] ? `${hh(o[s].tur)} → ${hh(o[s].retur)}` : "?";
  const strip = q.sapt.filter(w => w.iso >= 36).map(w => `<b class="w ${w.tip}">${SAPT_SEPT[w.iso] || w.iso}<i>${w.tip === "s1" ? "sch. 1" : w.tip === "s2" ? "sch. 2" : w.tip === "ambele" ? "ambele" : w.tip === "putin" ? "puține zile" : "amestec"}</i></b>`).join("");
  const g = q.grupa ? `<b>grupa ${q.grupa === "EZ+D" ? "E+Z și D" : q.grupa === "EZ" ? "E+Z" : "D"}</b>` : "<b>fără grupă în act</b>";
  let ideal;
  if (q.gps.tip === "ambele") ideal = `ambele schimburi în fiecare zi · sch. 1 ${ora("s1")} · sch. 2 ${ora("s2")}`;
  else if (q.gps.tip === "rotatie") ideal = `rotație săptămânală: <u>${sch(q.gps.A)} în săptămânile fazei A</u>, ${sch(q.gps.B)} în cele ale fazei B · sch. 1 ${ora("s1")} · sch. 2 ${ora("s2")}`;
  else ideal = `regim neclar în GPS (${q.regim}) · sch. 1 ${ora("s1")} · sch. 2 ${ora("s2")}`;
  const act = q.ideal ? (q.dupaAct ? "" : ` <em class="dif">altfel decât cere actul (${q.ideal.tip === "ambele" ? "ambele schimburi" : `${sch(q.ideal.A)} în faza A`})</em>`) : "";
  return `<div class="reg">${g} · ${ideal}${act}<span class="strip">${strip}</span></div>`; };
const OUT = '../../date/ideal-v3/schelet-ideal.html';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n1 = x => (+x).toFixed(1).replace('.', ',');
const n0 = x => Math.round(x).toLocaleString('ro-RO');
const dz = z => `${z.slice(8, 10)}.${z.slice(5, 7)}`;
const ok = S.filter(l => l.km && !l.informativ), info = S.filter(l => l.km && l.informativ);
const CUL = { 50: "c50", 27: "c27", 20: "c20" }; const cls = l => CUL[l.locuri] || "c00";
const hh = h => { if (h == null || isNaN(h)) return "?"; const x = h >= 24 ? h - 24 : h; return `${String(Math.floor(x)).padStart(2, "0")}:${String(Math.round((x % 1) * 60)).padStart(2, "0")}`; };
const SCH = { s1: "sch. 1", s2: "sch. 2" };
let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
for (const l of [...ok, ...info]) for (const p of l.drum) { la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]); }
la0 -= 0.02; la1 += 0.02; lo0 -= 0.03; lo1 += 0.03;
const kx = Math.cos((la0 + la1) / 2 * Math.PI / 180);
const W = 1000, H = Math.round(W * (la1 - la0) / ((lo1 - lo0) * kx));
const X = lo => ((lo - lo0) / (lo1 - lo0)) * W, Y = la => ((la1 - la) / (la1 - la0)) * H;
const d = pts => pts.length < 2 ? '' : 'M' + pts.map(p => `${X(p[1]).toFixed(1)} ${Y(p[0]).toFixed(1)}`).join('L');
const rute = N.rute.map((r, i) => ({ ...r, i, L: S.filter(x => x.ruta === r.id) }));
const cai = [], puncte = new Map(); let kmZi = 0;
for (const r of rute) for (const l of r.L) { if (!l.km) continue;
  cai.push(`<path class="p ${cls(l)}${l.informativ ? " inf" : ""}" data-i="${r.i}" d="${d(l.drum)}"/>`);
  if (!l.informativ) kmZi += l.kmZi;
  if (l.capatC) { if (!puncte.has(l.capat)) puncte.set(l.capat, { c: l.capatC, i: new Set(), cap: true }); puncte.get(l.capat).i.add(r.i); puncte.get(l.capat).cap = true; }
  for (const s of l.sateDrum || []) { if (!puncte.has(s.n)) puncte.set(s.n, { c: s.c, i: new Set(), cap: false }); puncte.get(s.n).i.add(r.i); } }
const pct = [...puncte.entries()].filter(([, v]) => v.c).map(([n, v]) =>
  `<g class="s${v.cap ? ' cap' : ''}" data-i="${[...v.i].join(',')}"><circle cx="${X(v.c[1]).toFixed(1)}" cy="${Y(v.c[0]).toFixed(1)}" r="${v.cap ? 5 : 2.5}"/>` +
  `<text x="${(X(v.c[1]) + 8).toFixed(1)}" y="${(Y(v.c[0]) + 4).toFixed(1)}">${esc(n)}</text></g>`).join('');
const sat = x => `<span class="sat ${x.st}" title="${x.st === 'opreste' ? 'oprește' : x.st === 'trece' ? 'trece fără oprire' : 'nu trece'} în ziua desenată · oprire în ${x.p}% din curse">${esc(x.n)} <i>${x.p}%</i></span>`;
const carduri = rute.map(r => {
  const blocuri = r.L.map(l => {
    const cap = `<span class="lnt"><b class="${cls(l)}"><s class="cip"></s>${esc(l.linie)}</b>${l.locuri ? ` <em class="loc ${cls(l)}">${l.locuri} locuri</em>` : ""}${l.autobuze ? ` <i>act: autobuze I-EZ ${l.autobuze.EZ} / II-D ${l.autobuze.D}</i>` : ' <i>capăt văzut doar în GPS (mașina din grafic n-a atins startul din act)</i>'}</span>`;
    if (l.deCompletat) return `<div class="ln">${cap}<span class="kmm">încă neverificat (de completat)</span></div>`;
    if (l.faraIdeal) return l.gps ? "" : `<div class="ln">${cap}<span class="kmm">fără ideal: ${esc(l.motiv)}</span></div>`;
    const real = l.asim || l.real.dif > 18 ? `<span class="alt">altfel în GPS: tur ${n1(l.real.tur)} / retur ${n1(l.real.retur)} km (${l.real.dif}%)${l.asim ? ' — nicio zi cu sensurile egale' : ''}</span>` : '';
    const stg = [l.tureZiFlag === 'tureZiDinToate' ? 'ture/zi din toată fereastra' : l.tureZiFlag === 'tureZiDinAct' ? 'ture/zi din act' : '', l.departeDeEtalon ? 'ziua desenată e la peste 5% de etalon' : '', l.informativ ? 'informativ: nu intră în total' : ''].filter(Boolean);
    return `<div class="ln${l.informativ ? ' inf' : ''}">${cap}
      <table><thead><tr><th>km</th><th>ture/zi</th><th>km/zi</th><th>zile bune</th><th>sursa</th><th>zi</th><th>poartă</th><th>mașini (zile)</th></tr></thead><tbody><tr>
      <td class="n b">${n1(l.km)}</td><td class="n">${l.tureZi}${l.tureZiFlag ? '<sup>!</sup>' : ''}</td><td class="n">${n0(l.kmZi)}</td><td class="n">${l.zileBune[l.sursa]}<span class="m">/${l.cuUrma}</span></td><td class="o">${l.sursa === 'sept' ? 'sept.' : 'mai–sept.'}</td><td class="z">${dz(l.zi)} ${l.schimbZi}</td><td class="o">${(l.poarta || '?').slice(0, 1)}</td><td class="o">${l.masini.map(m => `${esc(m.m)}${m.grafic ? '' : '<i class="lib">gps</i>'} ${m.zile}`).join(', ')}</td></tr></tbody></table>
      <div class="sate">${l.sateZi.map(sat).join('')}${l.inPlus.length ? `<span class="plus">în plus: ${l.inPlus.map(x => `${esc(x.n)} ${x.p}%`).join(', ')}</span>` : ''}${l.panaInIulie.length ? `<span class="plus">până în iulie: ${l.panaInIulie.map(esc).join(', ')}</span>` : ''}</div>
      ${regimTxt(SH[l.ruta + "|" + l.linie])}
      ${real}${stg.length ? `<span class="stg">${stg.join(" · ")}</span>` : ""}</div>`;
  }).join('');
  return `<button class="rt${r.L.some(l => l.km) ? '' : ' gol'}" data-i="${r.i}">
    <span class="cap1"><u>${esc(r.nr ?? '·')}</u>${esc(r.sateNume.join(' → '))}</span>
    <span class="capat">act KW24: angajați I-EZ ${r.angajati.EZ} / II-D ${r.angajati.D}${Object.keys(r.masini || {}).length ? ' · grafic: ' + esc([...new Set(Object.values(r.masini).flat())].join(', ')) : ''}</span>
    ${blocuri}</button>`;
}).join('');
const nMas = new Set(ok.flatMap(l => l.masini.map(m => m.m))).size, act = S.filter(l => !l.gps);
const html = `<title>Scheletul ideal Drăxlmaier</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Source+Sans+3:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--h:#f6f4ef;--i:#141c24;--r:#e2dcd0;--m:#6f6b61;--a:#2c6560;--b:#b85c26;--ok:#3f7d4e;--rau:#a33a20;--cd:#fffdf8;--gol:#b9b2a4;--c50:#2c6560;--c27:#b85c26;--c20:#5b4b8a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--h:#12161b;--i:#e8e5dd;--r:#2a3139;--m:#9b968b;--a:#6bb3ac;--b:#e2915a;--ok:#74b884;--rau:#e08060;--cd:#181d23;--gol:#6a7079;--c50:#6bb3ac;--c27:#e2915a;--c20:#a394d6;color-scheme:dark}}
:root[data-theme="dark"]{--h:#12161b;--i:#e8e5dd;--r:#2a3139;--m:#9b968b;--a:#6bb3ac;--b:#e2915a;--ok:#74b884;--rau:#e08060;--cd:#181d23;--gol:#6a7079;--c50:#6bb3ac;--c27:#e2915a;--c20:#a394d6;color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--h);color:var(--i);font:400 15px/1.5 "Source Sans 3",system-ui,sans-serif;margin:0}
.top{padding:22px 16px 0;max-width:1600px;margin:0 auto}
h1{font:700 26px/1.15 Archivo,sans-serif;margin:0 0 4px;letter-spacing:-.01em}
.sub{color:var(--m);margin:0 0 16px;max-width:76ch}
.tot{display:flex;flex-wrap:wrap;gap:1px;background:var(--r);border:1px solid var(--r);margin:0 0 18px}
.tot div{background:var(--cd);padding:10px 16px;flex:1 1 150px}
.tot b{display:block;font:500 21px/1.1 "IBM Plex Mono",monospace;font-variant-numeric:tabular-nums}
.tot span{font:600 10px/1 Archivo,sans-serif;text-transform:uppercase;letter-spacing:.09em;color:var(--m)}
.gr{display:grid;grid-template-columns:470px 1fr;gap:16px;max-width:1600px;margin:0 auto;padding:0 16px 40px}
@media(max-width:900px){.gr{grid-template-columns:1fr}.lst{max-height:none}}
.lst{border:1px solid var(--r);background:var(--cd);max-height:82vh;overflow:auto}
.rt{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--r);padding:10px 12px;cursor:pointer;color:inherit;font:inherit}
.rt:hover{background:color-mix(in srgb,var(--b) 7%,transparent)}
.rt[aria-current="true"]{background:color-mix(in srgb,var(--b) 13%,transparent)}
.rt:focus-visible{outline:2px solid var(--b);outline-offset:-2px}
.rt.gol{opacity:.6}
.cap1{display:flex;align-items:flex-start;gap:7px;font:600 14px/1.25 Archivo,sans-serif}
.cap1 u{text-decoration:none;font:500 11px/1.3 "IBM Plex Mono",monospace;color:var(--m);min-width:22px}
.capat{display:block;font-size:12.5px;margin:3px 0 4px 29px;color:var(--m)}
.ln{margin:8px 0 2px 29px}.ln.inf{opacity:.65}
.lnt{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;font-size:13px}
.lnt i{font-style:normal;color:var(--m);font-size:12px}
.kmm{display:block;font-size:12.5px;color:var(--rau)}
table{border-collapse:collapse;font-size:12.5px;width:100%;margin-top:2px}
th{font:600 9.5px/1 Archivo,sans-serif;text-transform:uppercase;letter-spacing:.07em;color:var(--m);text-align:right;padding:0 0 2px 6px}
td{padding:1px 0 1px 6px;color:var(--m);white-space:nowrap;text-align:right}
td:first-child,th:first-child{padding-left:0}
td.n{font:500 12.5px/1.35 "IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;color:var(--i)}
td.b{font-weight:600}td.z,td.o{color:var(--m);font-size:11.5px}td .m{color:var(--m);font-weight:400}
td sup{color:var(--b)}
i.lib{font:700 8px/1 Archivo,sans-serif;letter-spacing:.06em;padding:1px 3px;border:1px solid var(--m);color:var(--m);border-radius:2px;font-style:normal;vertical-align:middle;margin-left:2px}
.sate{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:5px;font-size:12px}
.sat{white-space:nowrap}.sat i{font-style:normal;color:var(--m);font-size:10.5px}
.sat.opreste{color:var(--ok);font-weight:600}.sat.trece{color:var(--m);border-bottom:1px dotted var(--m)}.sat.lipseste{color:var(--rau);text-decoration:line-through}
.plus{color:var(--m);font-size:11.5px;flex-basis:100%}
.alt,.stg{display:block;font-size:11.5px;color:var(--b);margin-top:3px}.stg{color:var(--m)}
.map{border:1px solid var(--r);background:var(--cd);overflow:hidden;position:relative}
svg{display:block;width:100%;height:auto}
path{fill:none;stroke-linejoin:round;stroke-linecap:round}
path.p{stroke:var(--a);stroke-width:2.2;opacity:.5}path.p.c50{stroke:var(--c50)}path.p.c27{stroke:var(--c27)}path.p.c20{stroke:var(--c20)}path.p.c00{stroke:var(--gol)}path.p.inf{stroke-dasharray:5 4;opacity:.35}
.cip{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:baseline;background:var(--gol)}.c50 .cip,.c50.cip{background:var(--c50)}.c27 .cip,.c27.cip{background:var(--c27)}.c20 .cip,.c20.cip{background:var(--c20)}
em.loc{font:600 10px/1 Archivo,sans-serif;font-style:normal;letter-spacing:.06em;text-transform:uppercase;padding:2px 5px;border-radius:2px;color:#fff;background:var(--gol)}em.loc.c50{background:var(--c50)}em.loc.c27{background:var(--c27)}em.loc.c20{background:var(--c20)}
.reg{margin-top:6px;padding:6px 8px;border-left:3px solid var(--b);background:color-mix(in srgb,var(--b) 6%,transparent);font-size:12.5px;line-height:1.45}.reg u{text-decoration:none;font-weight:600;color:var(--i)}.reg em.dif{font-style:normal;color:var(--rau);font-weight:600}
.strip{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}.strip b{font:500 10.5px/1.2 "IBM Plex Mono",monospace;padding:3px 6px;border:1px solid var(--r);border-radius:3px;color:var(--m);background:var(--cd)}.strip b i{display:block;font:600 10px/1 Archivo,sans-serif;font-style:normal;margin-top:2px}.strip b.s1 i{color:var(--c50)}.strip b.s2 i{color:var(--b)}.strip b.ambele i{color:var(--c20)}
h2{font:700 19px/1.2 Archivo,sans-serif;margin:4px 0 10px}
.cs2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0 0 14px;max-width:1300px}@media(max-width:900px){.cs2{grid-template-columns:1fr}}
.csw{border:1px solid var(--r);background:var(--cd);padding:10px 12px}.wh{font:700 14px/1.2 Archivo,sans-serif;margin-bottom:8px}.wh small{display:block;font:400 12px/1.3 "Source Sans 3",sans-serif;color:var(--m)}
.cs{margin:6px 0 10px}.cs .h{font:600 10px/1 Archivo,sans-serif;text-transform:uppercase;letter-spacing:.08em;color:var(--m);margin:0 0 6px}.cs .h small{font:500 10px/1 "IBM Plex Mono",monospace;text-transform:none;letter-spacing:0}
.ch{display:inline-flex;align-items:center;gap:5px;margin:0 6px 5px 0;padding:3px 7px 3px 5px;border:1px solid var(--r);border-left:4px solid var(--gol);border-radius:3px;font-size:12.5px;background:var(--h)}.ch.c50{border-left-color:var(--c50)}.ch.c27{border-left-color:var(--c27)}.ch.c20{border-left-color:var(--c20)}.ch u{text-decoration:none;font:500 11px/1 "IBM Plex Mono",monospace;color:var(--m)}.ch.nu{border-color:var(--rau);color:var(--rau)}.ch i{font:600 9px/1 Archivo,sans-serif;font-style:normal;color:var(--m);text-transform:uppercase}
.regula{display:grid;grid-template-columns:auto 1fr 1fr;gap:1px;background:var(--r);border:1px solid var(--r);margin:0 0 18px;max-width:900px;font-size:13px}.regula div{background:var(--cd);padding:8px 12px}.regula .h{font:600 10px/1 Archivo,sans-serif;text-transform:uppercase;letter-spacing:.08em;color:var(--m)}.regula b{display:block;font:600 14px/1.2 Archivo,sans-serif}.regula small{color:var(--m)}
.leg s.c50{border-color:var(--c50)}.leg s.c27{border-color:var(--c27)}.leg s.c20{border-color:var(--c20)}
.on path.p{opacity:.1}.on path[data-sel]{opacity:1;stroke:var(--b);stroke-width:4}
.s circle{fill:var(--cd);stroke:var(--m);stroke-width:1.2}
.s.cap circle{stroke:var(--b);stroke-width:2.4}
.s text{font:600 11px/1 Archivo,sans-serif;fill:var(--m);paint-order:stroke;stroke:var(--cd);stroke-width:3.5;display:none}
.s.cap text{display:inline}
.on .s{opacity:.2}.on .s[data-sel]{opacity:1}
.on .s[data-sel] text{display:inline;fill:var(--i)}
.uz circle{fill:var(--i)}
.uz text{font:700 12px/1 Archivo,sans-serif;fill:var(--i);paint-order:stroke;stroke:var(--cd);stroke-width:4}
.leg{position:absolute;right:12px;top:12px;background:var(--cd);border:1px solid var(--r);padding:8px 11px;font-size:12px;color:var(--m)}
.leg b{display:flex;align-items:center;gap:7px;font-weight:400;margin:2px 0}
.leg s{display:block;width:22px;height:0;border-top:3px solid var(--a);text-decoration:none}
.nota{border-left:2px solid var(--r);padding-left:14px;margin:20px 0 0;color:var(--m);font-size:13.5px;max-width:80ch}
.nota b{color:var(--i)}
</style>
<div class="top">
<h1>Scheletul ideal · Drăxlmaier Bălți</h1>
<p class="sub">Un singur drum fix pentru fiecare linie din cererea Drăxlmaier KW24: de unde începe strânsul, pe unde merge, pe ce poartă intră. Turul și returul merg pe același drum.
Scos din urma GPS pe 100 de zile (04.05–17.07 și 01.09–25.09.2026, fără concediul din iulie–august), cu prioritate pentru septembrie.</p>
<div class="tot">
  <div><span>rute</span><b>${rute.filter(r => r.L.some(l => l.km && !l.informativ)).length} / ${rute.length}</b>din act</div>
  <div><span>linii cu ideal</span><b>${ok.filter(l => !l.gps).length} / ${act.length}</b>din act${ok.filter(l => l.gps).length ? ` · +${ok.filter(l => l.gps).length} văzute doar în GPS` : ''}</div>
  <div><span>km pe zi</span><b>${n0(kmZi)}</b>cu oameni, pe toate liniile</div>
  <div><span>mașini</span><b>${nMas}</b>au servit liniile</div>
</div></div>
<div class="top">
<div class="regula">
  <div class="h">regimul schimburilor</div><div class="h">faza A (21–27.09, 05–11.10 … din 2 în 2)</div><div class="h">faza B (14–20.09, 28.09–04.10 … din 2 în 2)</div>
  <div><b>grupa D</b><small>${Object.values(SH).filter(q => q.grupa === "D").length} linii</small></div><div><b>schimbul 1</b><small>sosire ~06:15, plecare ~15:45</small></div><div><b>schimbul 2</b><small>sosire ~14:30, plecare ~00:15</small></div>
  <div><b>grupa E+Z</b><small>${Object.values(SH).filter(q => q.grupa === "EZ").length} linii</small></div><div><b>schimbul 2</b><small>sosire ~14:30, plecare ~00:15</small></div><div><b>schimbul 1</b><small>sosire ~06:15, plecare ~15:45</small></div>
  <div><b>E+Z și D</b><small>${Object.values(SH).filter(q => q.grupa === "EZ+D").length} linii</small></div><div><b>ambele schimburi</b><small>în fiecare zi</small></div><div><b>ambele schimburi</b><small>în fiecare zi</small></div>
</div>
<h2>Care rute în care schimb</h2>
<div class="cs2"><div class="csw"><div class="wh">faza A<small>07–13.09, 21–27.09, 05–11.10 …</small></div>${lista("A", "s1")}${lista("A", "s2")}</div><div class="csw"><div class="wh">faza B<small>14–20.09, 28.09–04.10 …</small></div>${lista("B", "s1")}${lista("B", "s2")}</div></div>
${CS.neclar.length ? `<p class="sub">Regim neclar în GPS (o săptămână așa, alta altfel): ${CS.neclar.map(chip).join(" ")}</p>` : ""}
<p class="sub">Regimul de mai sus e identificat din GPS pe toate liniile și se potrivește cu grupele din act: ${Object.values(SH).filter(q => q.dupaAct).length} linii urmează exact regula, ${Object.values(SH).filter(q => q.ideal && !q.dupaAct).length} fac altfel (marcate roșu în card). Turele grupelor se rotesc în fiecare săptămână, deci aceeași mașină vine o săptămână dimineața și una după-amiaza.</p>
</div>
<div class="gr">
  <div class="lst">${carduri}</div>
  <div class="map">
    <svg viewBox="0 0 ${W} ${H}" id="m" role="img" aria-label="Harta scheletului ideal Drăxlmaier Bălți">
      <g id="cai">${cai.join('')}</g>
      <g id="pct">${pct}</g>
      ${N.porti.map(g => `<g class="uz"><circle cx="${X(g.lon).toFixed(1)}" cy="${Y(g.lat).toFixed(1)}" r="6"/>
        <text x="${(X(g.lon) + 10).toFixed(1)}" y="${(Y(g.lat) + 5).toFixed(1)}">${g.nume}</text></g>`).join('')}
    </svg>
    <div class="leg"><b><s class="c50"></s>autobuz de 50 de locuri</b><b><s class="c27"></s>27 de locuri</b><b><s class="c20"></s>20 de locuri</b><b><s style="border-style:dashed;border-color:var(--gol)"></s>văzut doar în GPS</b></div>
  </div>
</div>
<div class="top"><p class="nota">
<b>Ce e fix aici.</b> Pentru fiecare rută din act: liniile ei (punctul de start al fiecărui autobuz), capătul și drumul cu oameni, un singur drum pe linie — turul zilei alese; returul e același drum. Drumul gol (de acasă la capăt) nu e în schelet.
<b>km</b> = etalonul: mediana kilometrilor pe urmă ai zilelor bune. <b>ture/zi</b> = câte perechi tur + retur face linia într-o zi, măsurat în GPS (mediana), nu presupus: pe liniile cu o singură grupă din act mașina vine cam jumătate din zile dimineața și jumătate după-amiaza (turele se rotesc săptămânal), deci o pereche pe zi; pe cele cu ambele grupe, două. <b>km/zi</b> = 2 × km × ture/zi.<br><br>
<b>Cum s-a ales ziua.</b> Zi bună = urma ajunge la capăt la tur și la retur, cele două ies la cel mult 18% una de alta, iar drumul trece prin toate satele din act în care linia oprește de obicei (în cel puțin jumătate din curse). Etalonul și satele se iau din septembrie când sunt cel puțin 3 zile bune acolo, altfel din toată fereastra («mai–sept.»). Ziua desenată e, dintre zilele bune la cel mult 5% de etalon, cea cu cele mai multe opriri reale în satele din act.<br><br>
<b>Satele.</b> Verde = oprește în ziua desenată; punctat = trece fără oprire; tăiat = drumul nu trece pe acolo. Procentul = cât de des oprește linia în satul acela, pe cursele sursei. «În plus» = locuri unde oprește regulat, dar care nu sunt în act. Satele din act sunt pe rută; o linie mai scurtă nu trece prin satele de dincolo de startul ei.
<b>Schimburile.</b> Blocul portocaliu de sub fiecare linie e regimul ei ideal: grupa din act, în ce săptămâni face schimbul 1 și în care schimbul 2 (rotație) sau ambele zilnic, orele mediane la poartă (sosirea turului → plecarea returului) și săptămânile din septembrie așa cum au ieșit în GPS. Roșu = GPS-ul arată alt regim decât cer grupele din act. <b>Culorile</b> = capacitatea autobuzului cerut în act pentru linie (50 / 27 / 20 de locuri, după prețul pe km).<br><br>
<b>«altfel în GPS»</b> = turul și returul real diferă cu peste 18% (drumuri diferite pe sensuri); idealul ia turul. <i class="lib">gps</i> lângă mașină = mașina nu e pe ruta asta în graficul intern.
</p></div>
<script>
const cai=document.getElementById('cai'),pctg=document.getElementById('pct'),m=document.getElementById('m');let sel=null;
function arata(i){sel=i;
  for(const b of document.querySelectorAll('.rt'))b.setAttribute('aria-current',String(+b.dataset.i===i));
  for(const e of m.querySelectorAll('[data-sel]'))e.removeAttribute('data-sel');
  if(i===null){m.classList.remove('on');return;}
  m.classList.add('on');
  for(const p of cai.children)if(+p.dataset.i===i)p.setAttribute('data-sel','');
  for(const g of pctg.children)if(g.dataset.i.split(',').map(Number).includes(i))g.setAttribute('data-sel','');}
for(const b of document.querySelectorAll('.rt'))b.addEventListener('click',()=>arata(sel===+b.dataset.i?null:+b.dataset.i));
</script>`;
scrieAtomic(OUT, html);
console.log(`${OUT} · ${ok.length} linii cu ideal · ${n0(kmZi)} km/zi · ${nMas} mașini · ${(html.length / 1e6).toFixed(2)} MB`);
