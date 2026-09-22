// Din rute-ideale.json face pagina de citit. Rulare:
//   node lde-geo-worker/rute-ideale-pagina.mjs rute-ideale.json .artefact-ideal/index.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const iesire = process.argv[3];

const UZINE = {
  SEBN_ORHEI: 'SEBN Orhei', SEBN_STRASENI: 'SEBN Strășeni',
  DRAXELMAIER_BALTI: 'Dräxlmaier Bălți', LEAR_UNGHENI: 'Lear Ungheni',
  LEAR_FLORESTI: 'Lear Florești', TROX_BRICENI: 'Trox Briceni',
};
const nume = (u) => UZINE[u] ?? u;
const n1 = (x) => (x == null ? '—' : x.toFixed(1).replace('.', ','));
const n0 = (x) => (x == null ? '—' : Math.round(x).toLocaleString('ro-MD'));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Câți km se conduc peste etalon în zilele necurate, pe uzină
const peUzina = new Map();
for (const r of d.cuEtalon) {
  const u = peUzina.get(r.uzina) ?? { uzina: r.uzina, rute: [], kmPeste: 0, livPeste: 0, curate: 0 };
  u.rute.push(r);
  if (r.kmRestul != null) u.kmPeste += r.kmRestul - (r.kmTur + r.kmRetur);
  if (r.livrareRestul != null) u.livPeste += r.livrareRestul - r.livrare;
  u.curate += r.zileCurate;
  peUzina.set(r.uzina, u);
}
const uzine = [...peUzina.values()].sort((a, b) => b.rute.length - a.rute.length);

const faraPeUzina = new Map();
for (const r of d.faraEtalon) {
  const l = faraPeUzina.get(r.uzina) ?? [];
  l.push(r);
  faraPeUzina.set(r.uzina, l);
}

const kmPesteTot = uzine.reduce((a, u) => a + u.kmPeste, 0);
const procentCurate = (100 * d.total.curate / d.total.perechi).toFixed(1).replace('.', ',');

const rand = (r) => {
  const idealTot = r.kmTur + r.kmRetur;
  const delta = r.kmRestul == null ? null : r.kmRestul - idealTot;
  const cls = delta == null ? '' : delta > 2 ? 'peste' : delta < -2 ? 'sub' : 'egal';
  return `<tr>
  <td class="ruta">${r.ruta}</td>
  <td class="sch">${r.schimb}</td>
  <td class="traseu">${esc(r.traseu)}</td>
  <td class="nr">${n1(r.kmTur)}</td>
  <td class="nr">${n1(r.kmRetur)}</td>
  <td class="nr liv">${n1(r.livrare)}</td>
  <td class="nr rest">${n1(r.kmRestul)}</td>
  <td class="nr ${cls}">${delta == null ? '—' : (delta > 0 ? '+' : '') + n1(delta)}</td>
  <td class="zile"><span class="chip ${r.zileCurate >= 8 ? 'tare' : r.zileCurate >= 5 ? 'medie' : 'slaba'}">${r.zileCurate}</span><span class="din">din ${r.zileTotal}</span></td>
</tr>`;
};

const sectiuni = uzine.map((u) => `<section class="uz">
 <header class="uz-cap">
  <h2>${esc(nume(u.uzina))}</h2>
  <dl class="uz-cifre">
   <div><dt>rute cu etalon</dt><dd>${u.rute.length}</dd></div>
   <div><dt>zile curate</dt><dd>${u.curate}</dd></div>
   <div><dt>km peste etalon / zi</dt><dd class="${u.kmPeste > 0 ? 'rau' : 'bun'}">${u.kmPeste > 0 ? '+' : ''}${n0(u.kmPeste)}</dd></div>
  </dl>
 </header>
 <div class="tabel-scroll">
  <table>
   <thead><tr>
    <th>Rută</th><th>Sch.</th><th>Traseul ideal (satele cu oprire)</th>
    <th class="nr">Tur</th><th class="nr">Retur</th><th class="nr">Livrare</th>
    <th class="nr">Restul zilelor</th><th class="nr">Δ</th><th>Zile curate</th>
   </tr></thead>
   <tbody>${u.rute.map(rand).join('\n')}</tbody>
  </table>
 </div>
</section>`).join('\n');

const fara = [...faraPeUzina.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .map(([u, l]) => `<div class="fara-uz">
  <h3>${esc(nume(u))} <span class="cnt">${l.length}</span></h3>
  <p>${l.map((r) => `<span class="fr">${r.ruta}<sub>${r.schimb}</sub> <em>${r.zileCurate}</em></span>`).join(' ')}</p>
 </div>`).join('\n');

const html = `<title>Traseul ideal al rutelor</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bitter:ital,wght@0,500;0,700;1,500&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root{
 --hartie:#f6f4ef; --hartie2:#fffdfa; --cerneala:#1c1d1f; --sters:#6d6a63;
 --linie:#ddd8ce; --rosu:#b8362c; --verde:#2f6b4c; --chihlimbar:#9a6a12;
 --umbra:0 1px 2px rgba(28,29,31,.05);
 --display:"Bitter",Georgia,serif; --corp:"Source Sans 3",system-ui,sans-serif;
 --cifre:"JetBrains Mono",ui-monospace,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
 --hartie:#16171a; --hartie2:#1e2024; --cerneala:#ece9e3; --sters:#9a968e;
 --linie:#32353b; --rosu:#e0685c; --verde:#6dbf93; --chihlimbar:#d6a344;
 --umbra:0 1px 2px rgba(0,0,0,.3);
}}
:root[data-theme="dark"]{
 --hartie:#16171a; --hartie2:#1e2024; --cerneala:#ece9e3; --sters:#9a968e;
 --linie:#32353b; --rosu:#e0685c; --verde:#6dbf93; --chihlimbar:#d6a344;
 --umbra:0 1px 2px rgba(0,0,0,.3);
}
*{box-sizing:border-box}
body{background:var(--hartie);color:var(--cerneala);font:16px/1.55 var(--corp);
 margin:0;padding:0 20px 72px;-webkit-font-smoothing:antialiased}
.lat{max-width:1180px;margin:0 auto}
header.cap{padding:48px 0 28px;border-bottom:3px double var(--linie)}
.ochi{font:600 12px/1 var(--corp);letter-spacing:.14em;text-transform:uppercase;color:var(--rosu);margin:0 0 14px}
h1{font:700 clamp(30px,4.6vw,46px)/1.08 var(--display);margin:0 0 14px;text-wrap:balance;letter-spacing:-.01em}
.teza{font:500 italic clamp(17px,2vw,20px)/1.5 var(--display);color:var(--sters);max-width:60ch;margin:0}
.cifre{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1px;
 background:var(--linie);border:1px solid var(--linie);margin:30px 0 0}
.cifra{background:var(--hartie2);padding:16px 18px}
.cifra b{display:block;font:600 27px/1.1 var(--cifre);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.cifra span{display:block;font-size:12.5px;color:var(--sters);margin-top:5px;line-height:1.35}
.cifra.acc b{color:var(--rosu)}
.uz{margin:44px 0 0}
.uz-cap{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;
 gap:14px;padding-bottom:9px;border-bottom:2px solid var(--cerneala)}
.uz-cap h2{font:700 23px/1.2 var(--display);margin:0}
.uz-cifre{display:flex;gap:22px;margin:0}
.uz-cifre div{display:flex;align-items:baseline;gap:7px}
.uz-cifre dt{font-size:12px;color:var(--sters);margin:0}
.uz-cifre dd{margin:0;font:600 15px/1 var(--cifre);font-variant-numeric:tabular-nums}
.uz-cifre dd.rau{color:var(--rosu)} .uz-cifre dd.bun{color:var(--verde)}
.tabel-scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14.5px}
thead th{font:600 11.5px/1.3 var(--corp);letter-spacing:.06em;text-transform:uppercase;
 color:var(--sters);text-align:left;padding:11px 9px;white-space:nowrap;
 border-bottom:1px solid var(--linie)}
td{padding:9px;border-bottom:1px solid var(--linie);vertical-align:baseline}
tbody tr:hover{background:var(--hartie2)}
.ruta{font:600 16px/1 var(--cifre);width:1%}
.sch{color:var(--sters);font:400 13px/1 var(--cifre);width:1%}
.traseu{min-width:230px;line-height:1.4}
th.nr,td.nr{text-align:right;font-family:var(--cifre);font-variant-numeric:tabular-nums;
 white-space:nowrap;width:1%}
td.liv{color:var(--chihlimbar)}
td.rest{color:var(--sters)}
td.peste{color:var(--rosu);font-weight:600} td.sub{color:var(--verde)} td.egal{color:var(--sters)}
.zile{white-space:nowrap;width:1%}
.chip{display:inline-block;min-width:26px;text-align:center;padding:2px 7px;border-radius:3px;
 font:600 12.5px/1.4 var(--cifre)}
.chip.tare{background:color-mix(in srgb,var(--verde) 18%,transparent);color:var(--verde)}
.chip.medie{background:color-mix(in srgb,var(--chihlimbar) 18%,transparent);color:var(--chihlimbar)}
.chip.slaba{background:color-mix(in srgb,var(--sters) 16%,transparent);color:var(--sters)}
.din{font-size:12px;color:var(--sters);margin-left:6px}
.fara{margin:52px 0 0;padding:24px;background:var(--hartie2);border:1px solid var(--linie)}
.fara > h2{font:700 20px/1.2 var(--display);margin:0 0 6px}
.fara > p.sub{color:var(--sters);font-size:14.5px;margin:0 0 20px;max-width:66ch}
.fara-uz{margin:0 0 16px}
.fara-uz h3{font:600 14px/1.2 var(--corp);margin:0 0 7px;display:flex;align-items:center;gap:8px}
.fara-uz .cnt{font:600 11px/1 var(--cifre);color:var(--sters);background:var(--hartie);
 border:1px solid var(--linie);border-radius:3px;padding:3px 6px}
.fara-uz p{margin:0;display:flex;flex-wrap:wrap;gap:6px}
.fr{font:400 13px/1 var(--cifre);border:1px solid var(--linie);border-radius:3px;
 padding:5px 8px;background:var(--hartie)}
.fr sub{color:var(--sters);font-size:10px}
.fr em{color:var(--chihlimbar);font-style:normal;font-weight:600}
.metoda{margin:52px 0 0;padding-top:24px;border-top:3px double var(--linie)}
.metoda h2{font:700 20px/1.2 var(--display);margin:0 0 12px}
.metoda p{max-width:68ch;margin:0 0 13px}
.metoda code{font:400 13.5px/1 var(--cifre);background:var(--hartie2);
 border:1px solid var(--linie);border-radius:3px;padding:2px 5px}
.metoda .avert{border-left:3px solid var(--chihlimbar);padding-left:15px;color:var(--sters)}
footer{margin:40px 0 0;font-size:13px;color:var(--sters)}
</style>
<div class="lat">
<header class="cap">
 <p class="ochi">TRANSLUX · analiza rutelor uzinelor</p>
 <h1>Traseul ideal al rutelor</h1>
 <p class="teza">Ziua în care autobuzul atinge exact aceleași sate la dus și la întors e ziua în care a făcut bucla întreagă — a adus înapoi oamenii pe care i-a dus. Traseul de mai jos e scos numai din zilele acelea.</p>
 <div class="cifre">
  <div class="cifra"><b>${n0(d.total.perechi)}</b><span>perechi tur + retur măsurate</span></div>
  <div class="cifra acc"><b>${n0(d.total.curate)}</b><span>zile curate (${procentCurate} % din perechi)</span></div>
  <div class="cifra"><b>${d.total.cuEtalon}</b><span>rute × schimb cu traseu ideal</span></div>
  <div class="cifra"><b>${d.total.faraEtalon}</b><span>fără probă încă</span></div>
  <div class="cifra acc"><b>${kmPesteTot > 0 ? '+' : ''}${n0(kmPesteTot)}</b><span>km peste etalon în restul zilelor, pe zi</span></div>
 </div>
</header>

${sectiuni}

<section class="fara">
 <h2>Rutele fără traseu ideal</h2>
 <p class="sub">Sub trei zile curate în toată fereastra. Nu înseamnă că ruta merge prost — înseamnă că nu avem încă dovada că turul și returul se închid. Cifra portocalie e numărul de zile curate găsite.</p>
 ${fara}
</section>

<section class="metoda">
 <h2>Cum s-a măsurat</h2>
 <p>Fereastra: <code>${d.fereastra.de}</code> – <code>${d.fereastra.pana}</code>. S-au luat din <code>lde_route_run</code> doar cursele pline cu km reali peste zero și s-au împerecheat pe autobuz, rută, schimb și zi — turul unui șofer cu returul aceluiași șofer, nu al altcuiva.</p>
 <p>O zi e <strong>curată</strong> dacă mulțimea satelor cu oprire la tur e identică cu cea de la retur. Traseul ideal e șirul de sate care se repetă cel mai des în zilele curate; km-ii și livrarea sunt mediana acelor zile. Coloana «restul zilelor» e mediana sumei tur + retur în zilele necurate, iar Δ arată cu cât se conduce mai mult acolo.</p>
 <p>Criteriul se verifică singur: în zilele curate km-ii celor două sensuri coincid aproape exact, în restul zilelor nu. Pragul de trei zile curate ține deoparte potrivirile întâmplătoare.</p>
 <p class="avert">Δ pozitiv nu e automat risipă: o zi necurată poate fi o zi în care chiar a fost nevoie de un ocol. E locul de unde începe verificarea, nu verdictul.</p>
</section>

<footer>Generat ${d.generat} din <code>lde-geo-worker/rute-ideale.mjs</code> · fereastră de ${d.fereastra.zile} de zile · prag ${d.minZileCurate} zile curate</footer>
</div>
`;

mkdirSync(dirname(iesire), { recursive: true });
writeFileSync(iesire, html);
console.log(`scris ${iesire} · ${uzine.length} uzine · ${d.total.cuEtalon} rute cu etalon`);
