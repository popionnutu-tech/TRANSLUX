# Drăxlmaier F3 — răspunsurile la cele 10 întrebări (hotărâte prin dezbatere, la cererea lui Ion)

Ion, 26.09.2026: «la toate întrebările răspunzi prin claude și codex debate». Părțile: revizorul `business-logic-auditor`, revizorul
`senior-backend-engineer` și Codex «orb» (gpt-6-astra, fără să vadă răspunsurile Claude; `codex-debate-r0.md`). Verdictul l-a scris
sesiunea principală (`triaj-r1.md`, `triaj-r3.md`). Codex a confirmat toate cele 10 verdicte, cu 4 precizări (întrebările 4, 7, 9 și
riscurile) — toate acceptate și intrate în planul v4. Cifrele sunt din prototipul v5 (`plan-f3.md`, versiunea finală, după criticul Codex r2 PASS și runda 3 a revizorilor), săpt. ISO 36–39 (31.08–27.09.2026).
Ion poate răsturna oricând verdictul (pe `/lde/livrare-reguli` sau printr-un tichet nou).

## 1. Tipul `date`: comun cu Briceni sau propriu?

- Business: propriu — aceleași chei, alt sens (`golTure`, `brambura`).
- Backend: propriu, în `lib/lde/drax-analiza.ts`, cu garda la rulare `esteAnalizaDrax`.
- Codex: propriu; cele două erori TypeScript sunt reparabile, dar argumentul decisiv e sensul diferit (Drăxlmaier are `parc`, R1a/R1b/R3,
  extrapolare, nelămurit; Briceni are `nepotrivita`); nici formele nu mai coincid (`lei` obiect, `deLamurit` text). Încredere mare.

**VERDICT: tipuri proprii Drăxlmaier, `uzina = 'DRAXELMAIER'`, în `lib/lde/drax-analiza.ts`.** Abaterea de la contractul F2 S7 e
consemnată aici: tipul comun rupe `RaportBriceni.tsx:27` și `:138`, iar posterul Briceni pleacă automat din 26.09.

## 2. Pragul și forma indicațiilor pentru dispecer

- Business: 100 km/săpt. pe R1b + R3 extrapolat, ≥ 3 zile măsurate; forma SEBN, top 3.
- Backend: top 3 pe R1b ≥ 200 km/săpt.
- Codex: ≥ 100 km pe R1b + R3 extrapolat, ≥ 3 zile, primele trei; B ar selecta 79 % / 76 % din flotă și include R1a (cere alt șofer);
  200 km ar ascunde oportunitățile de 100–199 km fără dovadă. Încredere mare.

**VERDICT: pragul lui Ion 100 km/săpt. (LEAR 12.2) pe R1b + R3 extrapolat, la mașinile cu ≥ 3 zile măsurate; se arată primele 3
(forma SEBN 12.6), cu întrebările pe R1b («între curse, unde așteaptă mașina — la capăt sau la uzină, nu acasă?») și pe R3 («între
tur și retur, așteaptă lângă uzină?»); restul pe pagină; R1a nu intră.** Cifre v4: peste prag 15 · 17 · 19 · 19; top 3 — 36: 912RNK
288, 826GXP 259, 388ASB 236 · 37: 925FTI 361, 912RNK 322, 457BRAX 308 · 38: 345KAJ 528, 925FTI 475, 912RNK 372 · 39: 925FTI 477,
345KAJ 342, 912RNK 338 (neschimbate în v5). Indicațiile NU pleacă până la «da».

## 3. Zona neclară a parcului 1 km

- Business: confirm (cele 7 din Bălți). Backend: confirm.
- Codex: 1 km, încredere medie; 84 % din diferența de liber e 024XKY, deci comparația arată sensibilitatea, nu caracterul privat al
  curselor; nu există dovadă nouă pentru răsturnarea F2.

**VERDICT: 1 km.** Fără prioritatea F2: neclar 1.189 față de 2.762 km (36–39), la cele 7 din Bălți liber 210 față de 28 km. Cu
prioritatea F2 (v4), neclarul pe toată flota e 15 km.

## 4. 024XKY (și 388ASB) — natura curselor

- Business: listă «de lămurit», afară din B și din alarmă. Backend: timp liber, fără excludere acum.
- Codex: «de lămurit — posibilă cursă a firmei»; NU scoaterea întregii mașini din B: îndoiala pe vineri–duminică nu invalidează luni–joi;
  se suspendă doar intervalele afectate și concluziile care depind de ele. Încredere mare pentru tratamentul în raport.

**VERDICT (precizat de Codex, v5 după runda 3): listă «de lămurit — posibilă cursă a firmei», în `de-lamurit.json` (date, nu cod), pe
INTERVALE, nu pe mașină: la 024XKY drumurile de luni–joi spre Drochia (pe care F2 le-a pus la livrare) ies din R1a / R1b, iar zilele de
vineri–duminică din alarma §11; la 388ASB ziua de 23.09 iese din alarmă. Restul mașinii rămâne în regula B, în indicații și în alarmă.
Cardul arată «din care N km de lămurit» (57 · 563 · 706 · 3 km pe săpt. 36–39). Întrebare de fapt pentru Ion la F4.** Fapte: 024XKY în săpt. 38 — F2 o are luni–joi (livrare spre Drochia), iar cei
837 km liber sunt toți în zile fără F2 (vineri 18 – duminică 20.09, fără poartă); 388ASB brambura 135,7 km (39, deplasare F2).

## 5. Câmpurile noi (`nelamuritLista`, `curseDePranz`)

- Business: aditive, cu ore. Backend: aditive, nume diferit de cheia numerică, două probe.
- Codex: aditive în `alternative.mjs`, din rezultatele deja calculate; egalitate structurală după eliminarea câmpurilor noi + sumele;
  exportul listei NU autorizează transformarea nelămuritului în alarmă. Încredere mare.

**VERDICT: aditive, cu `t0/t1/ora/km`; proba (a) md5 înainte de câmpuri, (b) deep-equal fără cheile noi + Σ listă = cheia numerică.
Nelămuritul NU e buget pentru §11 (Codex, risc 1 — corectat în v4).**

## 6. Casa din modulul de timp liber

- Business și backend: a săptămânii. Codex: aceeași casă săptămânală pentru economie și timp liber; casa și perioada din care e dedusă
  se păstrează în rezultat; lipsa casei nu devine zero km. Încredere medie.

**VERDICT: casa săptămânii** (aceeași din care rândul socotește R1a / R1b), păstrată în `economie.json` al săptămânii; casa necunoscută
→ fără alarmă.

## 7. Păstrarea datelor pe VPS

- Business: 8 săpt. urme, JSON fără limită. Backend: 8 săpt., ștergere doar pe dosare datate.
- Codex: 8 săptămâni = 56 de zile < două luni calendaristice: curățarea nu trebuie să șteargă eșantionul F4 înaintea concluziilor;
  JSON-urile și intrările de reproducere se păstrează. Încredere mare.

**VERDICT (precizat de Codex, v5): urmele brute 8 săptămâni; JSON-urile, depozitul `_ref` și instantaneele fără termen; nimic nu se șterge până la
`BAZA/.pastreaza-pana` (prima luni + 2 luni calendaristice + 7 zile; fișier lipsă = nu se șterge); ștergerea doar pe
`BAZA/<YYYY-MM-DD>/economie-urme`.**

## 8. SEBN §11.12 «pe ruta ei, fără poartă = muncă»

- Business: nu; prânzul se rezolvă prin prioritatea F2. Backend: nu în F3, F4 măsoară.
- Codex: nu în F3; 35 din 44 de mașini au casa pe linie, deci suprapunerea geografică nu dovedește transportul oamenilor. Încredere mare.

**VERDICT: nu se aplică; F4 măsoară pe datele păstrate.** Cu prioritatea F2 cursele de prânz (gol pe rută 3b în F2) nu mai ajung în
brambura (297LVY 37: 153,8 → 0; 346KAJ 39: 78 → 0).

## 9. Gardul migrației 407

- Business: 406 = poartă dură. Backend: generat din fișiere, simulat.
- Codex: mecanismul corect, valorile 16.181 / `2ec07858…` învechite — F2 v3.2 a dat 16.340 / `77c30eee…`; md5 și la ieșire.

**VERDICT (precizat de Codex, verificat în bază 26.09): gardul de intrare = 16.340 / `77c30eee9a1dfc82f0c3547fb1365d3f` (406 aplicată
18:04); la ieșire lungimea **23.802** și md5 **`5d65ed0253b428896c2560f3cf18d72f`** (simulare SELECT pe textul real, confirmată în JS);
migrația generată de `gen-407.mjs`; orice corectură de text = regenerare + simulare nouă.** v5 (§10.1 și §11.8 precizate):
lungimea după 407 = **24.000**, md5 **`f4e5f5293505d6cd53f18fef0cc935b5`** (SELECT pe textul real = JS).

## 10. Brambura pe drumul casă ↔ rută (B2)

- Business: nu (regula Briceni 26.09). Codex: — (întrebarea a apărut după trimiterea dezbaterii).

**VERDICT: drumul de la / spre locul nopții nu e niciodată brambura** (Ion, 26.09, Briceni: «seara spre casă nu e brambura»); decurge din
prioritatea F2 (livrarea e «explicată de §5»). Brambura pe flotă 36–39: 498 → 141 km; P10c 153 / 153 (fără prioritate 15 / 153).

## Riscurile semnalate de Codex (toate acceptate în v4)

1. Nelămuritul folosit ca buget pentru §11 → scos; §11 doar pe deplasare, necunoscut și zilele fără F2.
2. P10 incomplet (fără neclar / navetă, nevăzut scăzut întreg, rezultatul nesalvat) → P10 pe toate categoriile, salvat în `date.control.P10`,
   rândul cu P10 picat NU se scrie.
3. Reproducerea (referințe globale modificabile, recitirea porților / ferestrelor / urmelor) → v5: instantaneul = COPII în `BAZA/_ref/<md5>`,
   urmele §11 și dispozitivele în `urme-liber.json.gz`; proba: săpt. 37 rerulată cu referințe globale schimbate, tracker și Supabase
   indisponibile → `analiza.json` identic octet cu octet, instantaneul neatins (criticul Codex r2, C3).
4. §12.3 întreba «șofer din satul de start» (R1a) deși selecția e pe R1b + R3 → întrebările pe R1b și R3.

## Regula lui Ion de la finalul fazei (26.09)

«Nu folosim geometria, folosim km reali din GPS»: comparația ION-71 / ideal v2 (pasul E) și contractul spre verificatorul ION-95 sunt pe km
GPS (etalonul = mediana km GPS pe zilele bune, ture/zi, ore); «km păstrați față de mediana mașinii» tot pe km GPS; drumul desenat (Valhalla)
rămâne doar pentru harta din `schelet-drax.json`, cu controlul de consecvență ±5 % (azi o linie peste: R33 · Bilicenii Vechi* +6,3 %).
