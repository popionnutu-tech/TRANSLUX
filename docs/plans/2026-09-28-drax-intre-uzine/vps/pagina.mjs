// Drăxlmaier F2 — pasul 8 (v2): pagina «Economia Drăxlmaier» (drax/economie.html) din economie*.json. Doar citire.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { D } from './comun.mjs';
const A = JSON.parse(readFileSync(`${D}/economie.json`, 'utf8'));
const Z = JSON.parse(readFileSync(`${D}/economie-zile.json`, 'utf8'));
const C = JSON.parse(readFileSync(`${D}/economie-control.json`, 'utf8'));
const P = JSON.parse(readFileSync(`${D}/economie-probe.json`, 'utf8'));
const K = JSON.parse(readFileSync(`${D}/economie-cifre.json`, 'utf8'));
const M = existsSync(`${D}/economie-mana.json`) ? JSON.parse(readFileSync(`${D}/economie-mana.json`, 'utf8')) : { zile: [] };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n0 = (x) => (x == null ? '—' : Math.round(x).toLocaleString('ro-RO'));
const n1 = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString('ro-RO'));
const f = A.flota, t = f.toate, ZL = A.zileLucratoare;
const NUME = { cuOameni: 'cu oameni', livrare: 'livrare', golRuta: 'gol pe rută', golTure: 'gol între ture', parc: 'parc', service: 'service', deplasare: 'deplasare', legatura: 'legătură', necunoscut: 'necunoscut', intreUzine: 'cursă între uzine' };
const cats = Z.CAT;
const th = (a) => `<tr>${a.map((x) => `<th>${x}</th>`).join('')}</tr>`;
const td = (a) => `<tr>${a.map((x, i) => `<td${i ? ' class="n"' : ''}>${x}</td>`).join('')}</tr>`;
const E = K.eșantion;
const saptRows = ['s36', 's37', 's38', 's39'].map((k) => { const s = f[k]; return td([k.slice(1) + (k === 's39' ? ' ⚑' : ''), s.masini, s.zileLV, s.esantion, n0(s.total), ...cats.map((c) => n0(s.km[c])), n1(s.peZiMasina.A), n1(s.peZiMasina.B)]); }).join('');
const altRows = [
  ['A — R1-LEAR: doarme lângă uzină, 4 drumuri pe rută (înlocuiește toată ziua)', 'A'],
  ['R1a — marginile zilei: de la / spre locul nopții («șofer din satul de start»; cost de azi, nu economie garantată)', 'R1a'],
  ['R1b — ocolul pe acasă între curse («nu pleacă acasă, așteaptă la capăt»)', 'R1b'],
  ['R3 — golul între ture reținut, citirea (c), prag 30 km («așteaptă lângă uzină între tur și retur»; doar km-ii din afara zonei, plafonați MEREU la drumul spre cea mai lungă oprire ≥ 20 min din afara zonei; fără ea R3 = 0)', 'R3'],
  ['B = R1a + R1b + R3 (km disjuncți) — REGULA Drăxlmaier', 'B'],
  ['nelămurit — km în intervalul perechii, în afara zonei, peste plafon sau fără oprire (listă separată în F3, lângă «ocol în lanț»; nu economie)', 'nelamurit'],
].map(([n, k]) => { const a = K.alternative[k]; return td([esc(n), n0(a.esantion), n1(a.peZiMasina), n0(a.extrapolare), n0(a.peZiLucr), n0(a.peLuna), a.leiPeLuna == null ? '—' : n0(a.leiPeLuna)]); }).join('');
const r3Rows = Object.entries(K.r3Citiri).map(([k, v]) => td([k, n0(v.esantion), n0(v.peZiLucr), n0(v.peLuna)])).join('');
const masRows = A.masini.map((x) => td([
  `<b>${esc(x.m)}</b>${x.normaLipsa ? ' <span class="t">normă lipsă</span>' : ''}`, x.clasa ?? '—', x.casa ? `${n1(x.casa.kmPoarta)} km` : '—',
  `${x.zileIncluse} / ${x.zile}`,
  ...['cuOameni', 'livrare', 'golRuta', 'golTure', 'parc', 'legatura'].map((c) => n1(x.kmZi[c])),
  n0(x.A), n0(x.R1a), n0(x.R1b), n0(x.R3), n0(x.B), `${x.deja.n} / ${n0(x.deja.km)}`, n0(x.R2),
  x.Bext == null ? '<span class="t">nemăsurat</span>' : `${n0(x.Bext)} <span class="t">(${n1(x.best.kmZi)}/zi)</span>${x.Amaibun ? ' <span class="t">A mai mic ca referință</span>' : ''}`, x.leiKm == null ? '—' : n1(x.leiKm),
])).join('');
const tipRows = Object.entries(A.tipare).sort((a, b) => b[1].zile - a[1].zile).map(([k, v]) => td([esc(k), v.zile, n0(v.km), n1(v.km / v.zile)])).join('');
const r2Rows = Object.entries(A.r2.peClasa).map(([k, v]) => td([`${k} locuri`, v.grupe, v.calculate, v.perechi, n0(v.curent), n0(v.optim), n0(v.castig)])).join('');
const prob = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8v2', 'P8', 'P9', 'P10'].map((k) => { const p = P[k]; if (!p) return '';
  const tip = p.tip === 'intern' ? 'consistență internă' : p.tip === 'defect' ? 'cazul unui defect găsit la revizie' : 'independentă de cod (Valhalla)';
  return `<div class="card"><h3>${k}. ${esc(p.titlu)} <span class="t">· ${tip}</span></h3>
  <p><b>${p.trec}</b> din ${p.conditie} ${p.tip === 'independent' ? `în ± 20 % · raportul median urmă / șosea ${n1(p.raportMedian)}` : 'zile trec'}${p.pica ? `; ${p.pica} ${p.tip === 'independent' ? 'în afara toleranței' : 'pică'}: ${esc(p.picaExemple.slice(0, 6).join(', '))}` : ''}.</p>
  ${p.exemplu ? `<p class="t">Exemplu ${esc(p.exemplu.m)} ${esc(p.exemplu.z)}:</p><ul class="mono">${p.exemplu.bucati.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}</div>`; }).join('');
const mana = M.zile.map((x) => `<div class="card"><h3>${esc(x.tipar)} — ${esc(x.m)} ${esc(x.z)}: <b>${esc(x.verdict)}</b></h3><p><b>Urma:</b> ${esc(x.urma)}</p><p><b>F2:</b> ${esc(x.f2)}</p><p class="t">${esc(x.nota)}</p></div>`).join('');
const j = C.jumatati;
const steaguri = [
  `Eșantionul comun pentru A și B: ${E.esantion} din ${E.zileLV} zile-mașină L–V (${E.nedetectate} cu o jumătate de pereche probabil nedetectată ies; ${E.faraEtalon} fără etalon). Cifrele «pe flotă» = pe zi-mașină × ${E.zileLV} zile-mașină = <b>extrapolare</b> (factor ${E.factor}). Weekendul (${E.weekend.zile} zile-mașină, ${n0(E.weekend.total)} km) stă separat.`,
  `Zile scoase: ${Object.entries(A.atipice).map(([z, m]) => `${z} (${esc(m)})`).join('; ')}. Săptămâna 39 = luni–vineri.`,
  `Regula Briceni §5.4 portată: ${K.promovate.n} tur(uri) din afara ferestrelor cu urcări în ≥ 2 sate ale liniei «cu oameni» (steag); respinse ${(K.promovareRespinsa ?? []).length}: ${esc((K.promovareRespinsa ?? []).map((r) => `${r.m} ${r.zi} (${r.motiv})`).join('; '))}. Retururile din afara ferestrelor rămân goale; clasa «curse regulate la prânz» (retururi 12–14, tururi sosite la 11) = de măsurat în F4 ca posibilă fereastră.`,
  `C2: eligibilitatea «o singură pereche» după numărul de perechi complete (nu după eticheta tiparului): R3 ${n0(K.C2.R3)} față de ${n0(K.C2.R3vechi)} km pe eșantion (+${n1(K.C2.diferenta)}), ${K.C2.zileCuOPerecheSiJumatati} zile cu o pereche + jumătăți reale. Mașini nemăsurate (0 zile în eșantion): ${esc(K.nemasurate.join(', ') || '—')}; sub jumătate din zile măsurate: ${esc(K.putinMasurate.join(', ') || '—')}.`,
  `Jumătăți de pereche: ${j.total} (reale ${j.reale}, probabil nedetectate ${j.nedetectate}) · ${esc(Object.entries(j.peMotiv).map(([k, v]) => `${k} ${v}`).join(' · '))}.`,
  `Dispozitive duble: ${esc(C.dubluri.map((x) => `${x.caz} (${x.curse} curse, ${x.zile.length} zile)`).join('; '))}.`,
  `Schimbul 3: cu golurile mute legate, ${K.schimb3.v2.inAfara} atingere a porții 22:00–06:00 în afara ferestrelor (înainte: ${K.schimb3.v1.inAfaraFerestrelor}, artefact al trackerului tăcut la poartă).`,
  `Deplasare: ${n0(K.deplasare.km)} km în ${K.deplasare.bucati} bucăți (din care ${K.deplasare.excursiiInPereche} excursii în intervalul perechii, ${n0(K.deplasare.kmExcursii)} km); peste 50 km pe săptămână: ${esc(K.deplasare.peste50.join(', '))}.`,
  `Normă lipsă (km fără lei): ${esc(A.normaLipsa.join(', '))}. Bilanț Σ categorii = urmă ± 3 %: ${C.bilant.ok}/${C.bilant.zile} (consistență internă, nu dovadă de corectitudine).`,
].map((s) => `<li>${s}</li>`).join('');

const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Economia Drăxlmaier</title>
<style>
:root{--bg:#fbfaf8;--fg:#1d1d1f;--mut:#6b6b70;--line:#e4e2dd;--card:#fff;--acc:#9b1b30}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141416;--fg:#ececef;--mut:#9a9aa2;--line:#2c2c31;--card:#1c1c20;--acc:#e0677b}}
:root[data-theme="dark"]{--bg:#141416;--fg:#ececef;--mut:#9a9aa2;--line:#2c2c31;--card:#1c1c20;--acc:#e0677b}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:1280px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin:36px 0 10px}h3{font-size:15px;margin:0 0 6px}
.t{color:var(--mut);font-size:12px}.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
.wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--card)}
table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{padding:6px 8px;border-top:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);border-top:0;white-space:nowrap}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.card{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:14px 16px;margin:10px 0}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.kpi div{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:12px}
.kpi b{display:block;font-size:22px}.nota{border-left:3px solid var(--acc);padding:8px 12px;background:var(--card);border-radius:0 8px 8px 0}
ul{padding-left:18px}li{margin:4px 0}
</style></head><body><main>
<h1>Economia Drăxlmaier</h1>
<p class="t">Faza 2 (măsurarea), v2 după revizia rundei 1 și dezbaterea Claude + Codex (26.09) · săptămânile ISO 36–39 (31.08–25.09.2026; 39 parțială) · urma GPS brută, ziua 03:00 → 03:00 · km pe șosea din Valhalla · rulat ${esc(A.rulat.slice(0, 16).replace('T', ' '))} UTC.</p>
<div class="kpi">
<div><span class="t">flota pe săptămână</span><b>${Object.values(Z.flota).map((l) => l.length).join(' · ')}</b><span class="t">săpt. 36 · 37 · 38 · 39</span></div>
<div><span class="t">eșantionul A / B</span><b>${E.esantion} / ${E.zileLV}</b><span class="t">zile-mașină L–V</span></div>
<div><span class="t">B = R1a + R1b + R3</span><b>${n0(K.alternative.B.peZiLucr)} km/zi</b><span class="t">extrapolare · ≈ ${n0(K.alternative.B.leiPeLuna)} lei/lună cu normă</span></div>
<div><span class="t">A = R1-LEAR</span><b>${n0(K.alternative.A.peZiLucr)} km/zi</b><span class="t">pe plus la ${f.Apozitiv.masini} mașini</span></div>
<div><span class="t">regula</span><b>B</b><span class="t">A doar referință (8.4)</span></div>
</div>

<h2>Categoriile de km (L–V, măsurat, toate zilele)</h2>
<div class="wrap"><table>${th(['săpt.', 'mașini', 'zile L–V', 'eșantion', 'urmă km', ...cats.map((c) => NUME[c]), 'A / zi-maș.', 'B / zi-maș.'])}${saptRows}
${td(['36–39', t.masini, t.zileLV, t.esantion, n0(t.total), ...cats.map((c) => `<b>${n0(t.km[c])}</b>`), n1(t.peZiMasina.A), n1(t.peZiMasina.B)])}
${td(['pe zi lucr.', '', '', '', n0(t.total / ZL), ...cats.map((c) => n0(t.km[c] / ZL)), '', ''])}</table></div>
<p class="t">Gol pe rută = 3(a) golul impus pe culoar (${n0(K.categoriiLV.golImpus3a)} km, inclusiv parc → capăt după nopțile la parc) + 3(b) golul dintre curse ale aceleiași linii (${n0(K.categoriiLV.golRuta3b)}). Livrarea = marginile ${n0(K.livrareLV.margini)} + ocolul pe acasă ${n0(K.livrareLV.ocol)}. ⚑ săpt. 39 = luni–vineri.</p>

<h2>Alternativele: A față de B, pe mașină</h2>
<div class="wrap"><table>${th(['regula', 'km pe eșantion', 'km / zi-mașină', 'extrapolare (km)', 'km / zi lucr.', 'km / lună', 'lei / lună (cu normă)'])}${altRows}</table></div>
<p class="nota"><b>B e regula Drăxlmaier</b>: R1a, R1b și R3 se ADUNĂ, fiindcă taie km disjuncți (marginile, ocolul pe acasă, intervalul perechii). A (doarme lângă uzină) se calculează doar ca referință: pe flotă e negativă, pe plus la ${f.Apozitiv.masini} mașini (Σ ${n0(f.Apozitiv.km)} km pe mașini) și mai mare decât B doar la ${esc(f.Areferinta.masini.join('; ') || '—')} — de remăsurat. Extrapolarea globală (factor ${E.factor}) dă B = ${n0(t.extrapolare.B)} km; pe mașină (B pe zi-mașină al fiecăreia × zilele ei) ${n0(f.BextPeMasina)} km. Cifrele sunt cost de azi, nu economie garantată. P8 pe km-ii din afara zonei: ${f.P8.intervale - f.P8.pica} / ${f.P8.intervale} în ± 20 %; plafonul se aplică mereu; ${f.P8.faraStationare} intervale fără oprire în afara zonei au R3 = 0 (tot nelămurit). R2 NU se propune: net ${n0(A.r2.castigFlota)} km pe eșantion = brut ${n0(A.r2.castigBrut)} minus ${n0(-A.r2.pierderi)} pierduți de ${A.r2.contributiiNegative.length} mașini.</p>
<h3>R3 pe citiri (km, eșantion → pe zi lucrătoare, pe lună)</h3>
<div class="wrap"><table>${th(['citirea', 'eșantion', 'km / zi lucr.', 'km / lună'])}${r3Rows}</table></div>
<p class="t">Intervalele perechii (eșantion): ${K.parc.golTure.intervale}; ${K.parc.golTure.inZona} rămân tot timpul în zona uzinei; km-ii din zonă ai tuturor intervalelor = ${n0(K.parc.golTure.kmZonaTotal)} km = «așteaptă deja lângă uzină», nu economie; km-ii din afara zonei înainte de plafon: ${n0(K.parc.golTure.r3InaintePlafon)} (toate citirile).</p>

<h2>Tiparele zilelor (L–V)</h2>
<div class="wrap"><table>${th(['tipar', 'zile', 'km', 'km/zi'])}${tipRows}</table></div>

<h2>Pe mașină (${A.masini.length}; km pe eșantion)</h2>
<div class="wrap"><table>${th(['mașina', 'clasa', 'casa → poartă', 'zile măsurate / totale', 'cu oameni/zi', 'livrare/zi', 'gol rută/zi', 'gol ture/zi', 'parc/zi', 'legătură/zi', 'A', 'R1a', 'R1b', 'R3', 'B', 'deja lângă uzină (int./km)', 'R2', 'B extrapolat', 'lei/km'])}${masRows}</table></div>

<h2>R2 — realocarea pe clase (raportată, nepropusă)</h2>
<div class="wrap"><table>${th(['clasa', 'grupe', 'calculate', 'perechi', 'Σ 2×casă→capăt azi', 'optim', 'câștig'])}${r2Rows}</table></div>

<h2>Nelămurit — intervalele tur–retur (eșantion, citirea aleasă)</h2>
<div class="wrap"><table>${th(["mașina", "ziua", "intervalul", "linia", "km nelămurit", "R3 reținut", "motivul"])}${(A.nelamuritLista ?? []).map((x) => td([esc(x.m), esc(x.z), esc(x.ora), esc(x.lin), n1(x.km), n1(x.r3), esc(x.motiv)])).join("")}</table></div>
<p class="t">Σ ${n0((A.nelamuritLista ?? []).reduce((a, x) => a + x.km, 0))} km pe eșantion; nici economie, nici alarmă — listă de privit (contractul F3).</p>
<h2>Probele (pe toată flota)</h2>${prob}
<div class="card"><h3>P10 — cazurile reale</h3><ul class="mono">${(P.P10?.reale ?? []).map((r) => `<li>${esc(r)}</li>`).join("") || "<li>—</li>"}</ul><p class="t">Sintetic A→B→A: ${esc(P.P10?.sintetic?.AB)} · A→A→A: ${esc(P.P10?.sintetic?.AA)}</p></div>
<h2>Cinci zile verificate de mână (câte una pe tipar)</h2>${mana}
<h2>Controlul și steagurile</h2><ul>${steaguri}</ul>
</main></body></html>`;
writeFileSync('/root/lde-worker/drax/economie.html', html);
console.log(`drax/economie.html: ${(html.length / 1024).toFixed(0)} KB`);
