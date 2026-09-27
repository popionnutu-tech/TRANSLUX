# Verificarea 6 + 7 — DRAXELMAIER_BALTI — 27.09.2026 (dezbaterea ideal-v4, runda 1, ION-110)

**Starea.** v6 = activul ideal-v3.1 (`RUN=/home/verif/verificator/rulari/drax-v6-1790520344`, schelet 8b400214…) · v7 = candidatul ideal-v4
(`RUN=/home/verif/verificator/rulari/drax-v7-1790520350`, schelet f7214db8…, GATA al producătorului cu 25 de rânduri, timp.mjs = cel al verificatorului).
drax.mjs 1be43dc0b57b · ruleaza.sh a26fad56be25 · etalon-gps 3f958d6ca8dd · filtru-rupte 96807913f1d1 · c4 e9d6b55ec0b1 · timp 0c9b7668732f · node v20.20.2 · tz 2025c · Europe/Chisinau.
Regulile (md5 verificate pe fișier): **v6 judecat pe textul vechi** — `reguli_livrare_la` 2026-09-27T05:51:44.492026+00:00, 24.334 caractere, md5 810297f3c831a2cf4b2dbaea0d6e2c22; **v7 judecat pe textul nou** (migr. 412) — 2026-09-27T15:00:05.260446+00:00, 25.072 caractere, md5 62eace0d0dd8f37e678a27ef639f5c0e. Între ele diferă doar §4.1 (excepția «capătul din GPS») și §4.7 (fără Balatina și Năvîrneț); drax.mjs nu citește textul, deci rulările nu depind de el — doar judecata pe §4.1/§4.7 s-a rescris.
Intrări care diferă v6 → v7: schelet, obs, etalon, regulate, schimburi, care-schimb; `curse-ideal.json` (deplasările brute) e IDENTIC (79b09da2780e), deci diferența e doar tăietura lanțului.
SIGILIU: verdict v6 417bbae8… · v7 b3cc71f6… · manifest v6 a3bcba13… · v7 5da77b0f…
Probe: R1 ok pe ambele · registru: v6 ok · **v7 PICATĂ** (C31 nu se explică: registrul e pe alt sha — X2; clasa cunoscută, nu defect de script).
INCHIS: **ok** pe v6 și v7 (manifestul final = inițial).
Unități (v7): 51 linii din act, 49 linii `*`, 48 cu ideal, 49 mașini, 13.533 observații cu rută, 13.314 deplasări cu rută, 27.644 deplasări brute (v6: 99 linii, 13.528 / 13.309).
valid_pentru_export: v6 **true** (0 blocante, 5 explicate) · v7 **false** (5 blocante = aceleași 5, neexplicate pe f7214db8).

## Verdictul pe liniile schimbate (cererea 1)
| linie | v6 | v7 | km GPS sept, de la capătul v7 la poartă (+rază) | dovada capătului | verdict |
|---|---|---|---|---|---|
| R37 Musteața → Năvîrneț | 43,5 | 60,2 | tur s1 59,7 (n9) · tur s2 59,8 (n9) · retur s1 59,9 (n10) · retur s2 61,5 (n9) — toate în ±2,2 % de 60,2; de la Musteața 43,3–44,9 | 142/144 curse ale rutei trec, **136/144 opresc §4.5 la Năvîrneț la mijlocul deplasării** (sept 37/37), ambele schimburi, toate lunile, toate mașinile; pe v6 pragul sesiunii dă 100 %/100 %, +16 km | **noul capăt e mai bun**, conform §4.1 nou; v7 are însă schimburi s1 44,8/45,6 rămase din tăietura veche (D6 fals, F2 le citește) |
| R28 Cuhnești → Balatina | 65,5 | 75,0 | tur s1 73,4 (n9) · tur s2 73,0 (n9) · retur s1 75,5 (n11) · retur s2 75,3 (n9); C47 97 % → 91 % | 140/140 curse trec (ocol prin sat: două apropieri la km ~14 și ~18), **68/140 opresc §4.5** (sept 24/38); pe v6 pragul sesiunii: tur 50 %, retur 74 % — **fără pornirile din parcarea de noapte a lui 351KAJ la Balatina: tur 28 %**, retur 58 % | **mai bun pe km GPS, conform §4.1 nou** (dovada de oameni pe tur: 43 % pe fereastră, 28 % pe sept fără parcare); v7 e aplicat pe jumătate: etalon lanț 66,9, real 66,6/66,9, schimburi 65,5–69,3, drumul desenat 65,5 km (C23 12,7 %) |
| R37 «Rediul de Jos*» (nouă) | — | fără ideal | 2 observații mai–iul (351KAJ, 44 km) care nu ating Năvîrneț | V5 «0 săptămâni complete» | neverificabil, informativ |
Efect v4: card 5.819 → 5.872 km/zi (+53), GPS completat 5.948 → 6.000 km/zi (+52; R28 +19, R37 +33,4). Lei: nu (fără normă în rulare).

**§4.7 pe urmă (definiția §4.5 = `opr` din `curse.mjs:19,128-140`: vmin < 8 km/h, ≥ 20 s sub 15 km/h, cel mai apropiat loc ≤ 0,8 km):**
Balatina 68 opriri pe cursele R28 (sept 24) și Năvîrneț 136 (sept 37) → **§4.7 vechi era fals pentru ambele; §4.7 nou (migr. 412) le-a scos — corect**. Mîndîc 0 pe cursele R1 (24 opriri ale lui 024XKY pe drumuri în afara rutei, §11.8), Recea (R7) 0 (opririle «Recea» sunt la omonimul de pe R3), Sofrîncani 0, Obreja Nouă 0 → §4.7 rămâne adevărat pentru ele. Duratele (223 s, 536 s; §4.1 nou: «4–9 minute») nu le pot reproduce: intrările nu au viteza punct cu punct.
**§4.1 nou pe R28/R37 (v7):** opriri §4.5 în ambele sensuri — R37 136/144 curse ale rutei, R28 tur 33/67 (29/67 fără parcare), retur 35/72 pe fereastră; mai multe mașini — R37 351KAJ + 925FTI, R28 760BXI + 710CWN + 351KAJ → **ambele mutări sunt conforme cu regula**. «În mod regulat» nu are prag: pe fereastra sursei (sept), fără parcare, R28 are tur 5/18 (28 %).

## Capete suspecte pe flotă (cererea 2)
Definiția sesiunii (prag al sesiunii, nu al corpului — dezbaterea îl poate schimba): prima oprire §4.5 într-un sat al RUTEI înaintea tăieturii turului / ultima după tăietura returului, > 2,5 km de capăt, nu pe urma cursei însăși, ≥ 50 % pe FIECARE sens, pe fereastra sursei; «nu pe urma» = fără apropiere ≤ 1,2 km sau oprire a aceluiași sat pe partea plină (banda 1,2–1,5 km nu se vede în intrări). Varianta B scoate oprirea de la pornirea/sosirea deplasării (parcarea).
| linie | v6 tur / retur (B) | v7 | sat · distanță · +km |
|---|---|---|---|
| R37 Musteața | 100 % / 100 % (100/100) | 0 / 0 | Năvîrneț · 10,8 km · +16 |
| R28 Cuhnești | 50 % / 74 % (**28** / 58) | 0 / 0 | Balatina · 5 km · +5,5–8,8 |
| R19 Bilicenii Vechi | 73 % / 77 % (73/77) | 73 % / 77 % | Sîngerei · 8,2 / 7 km · +8,2 / +7,1 — **exclus de §4.1 nou (orașele din §5.1 nu fac capăt)** |
| R32 Trifănești | 47 % / 48 % (6/43) | la fel | Izvoare · 4 km · +5 — sub prag |
| R2 Stolniceni | 100 % / 28 % | la fel | Chiurt · 2,7 km · +3,9 — un singur sens |
| R22 Țipletești* | 9 % / 100 % | la fel | Heciul Vechi · 2,5 km — `*`, un sens |
Restul de 58 de linii cu observații: < 20 % pe ambele sensuri. Liniile `*` s-au măsurat doar pe septembrie.

**A doua clasă, aceeași familie («capătul din schelet nu e locul unde cursa servește»): capăt atins doar prin parcare (§4.2, start/sfârșit ≤ 2,5 km).**
Picioare cu capătul la ≤ 1 km de marginea deplasării, fără oprire în satele proprii dincolo de capăt și cu opriri în satele altei rute — identic în v6 și v7:
Zarojeni 15/29 (52 %, 348KAJ → R22/R21) · Dominteni 52/115 (45 %, 710CWN → Lazo, Hăsnășenii Noi, Dobrogea Veche = R13) · Heciul Vechi* 61/130 (47 %, 412BRAY → Bilicenii Vechi) ·
Prajila 29/107 (27 %, 763LYY → Gura Căinarului, Zarojeni = R18) · Sturzovca 16/107 (15 %, 727CWN → Limbenii Noi, Fundurii Noi = R11) · Țiplești 3/24 (13 %). Celelalte 58 < 10 %.
Dominteni (ture/zi 3 vs act 1) și Prajila (3 vs 2) au ture în plus exact acolo, iar R13 Hasnasenii Noi și R18 Putinești sunt liniile fără ideal (C31).

## Liniile cu steag (cererea 3)
| linie | E1 | G1 / «orice poartă» | ce decid datele |
|---|---|---|---|
| R3 Nihoreni | cerut (C47 58 %) — steag prezent | 44,2 vs 42,3 (4,5 %, bandă); orice poartă 44,3 (4,7 %) | **nu decid**: trei variante pe mașină (345KAJ ~39,8 · 457BRAX 43,8 · 186OMM 47,7 prin Recea); steagul rămâne |
| R16 Florești | necerut (C47 100 %) | 35,7 = 35,7; sursa «toate», 0 obs în sept | **nu decid**: km sigur pe mai–iul; nu se vede dacă linia mai lucrează |
| R18 Zarojeni | cerut (C47 41 %) | 28,9 vs 30,7 (5,9 %, blocant) | **decid cardul**: picioarele care opresc la Zarojeni dau 28,3 + 0,6 = 28,9; etalonul 30,7 e serviciul R22 al lui 348KAJ din parcarea de la Gura Căinarului → explicație, nu corecție |
| R27 Sturzovca | cerut (C47 29 %, variante) | 24,9 vs 46,5 (poarta sensului, 8 zile, doar 727CWN) / 24,1 (orice poartă, 41 zile) | **decid cardul**: 46,5 = 727CWN prin satele R11/R13; linia e 22–24 km la toate celelalte mașini; §6.6 «s1/s2» e diferență de mașină, nu de schimb |
| R32 Trifănești | necerut (C47 70 %) | 40,2 = 40,2 (fără 518MHD) | **nu decid**: Izvoare 47/48 % (fără parcare 6/43 %); D2 6 zile izolate, regimul sursei ≠ total |
| R36 Bocancea Schit | necerut (C47 94 %) | 54,5 vs 54,0 (0,9 %) | **decid**: steagul nu mai e cerut de niciun control; corecție directă posibilă 54,0 (−1 km/zi); intrarea G1 din registru e moartă (X1) |

## High-uri (cu scenariu) și scorul
- **H1 — v4 aplicat pe jumătate (cache).** `schelet-cand.json` e indexat `ruta|linie|zi|schimb|m` (`drax/cod/ideal/schelet.mjs:5,114`), fără capăt; `alege.mjs:14,80-92` refolosește picioarele tăiate la capătul vechi. *Scenariu:* v4 devine activ → luni F2 (`economie/categorii.mjs:37-40`) vede pe R37 s1 45,2 vs s2 62,0 (27 % > 25 %) și ține etalonul PE SCHIMB: în săptămânile în care R37 e pe s1, plafonul golului pe rută (§5.3 a) e 45,2 km în loc de 60,2; pe R28 culoarul (`l.drum`) se oprește la Cuhnești, la 4,7 km de capătul Balatina, deci cei ~9 km zilnici Balatina ↔ Cuhnești ies din culoar (≤ 1 km) și intră la livrare; LDE desenează drumul Cuhnești cu eticheta 75 km (C23 12,7 %).
- **H2 — regulile (închis de migr. 412).** Pe textul vechi §4.1/§4.7 contraziceau v4 (și §4.7 era fals pe date); pe textul nou mutările R28/R37 sunt conforme. Rest (low): «în mod regulat» fără prag numeric — alegerea ferestrei (sursă vs toată) decide R28 (tur 28 % vs 43 % fără parcare); duratele 4–9 min neverificabile pe intrări.
- **H4 — clasa «capăt prin parcare» (preexistentă, ambele schelete).** *Scenariu:* Dominteni rămâne cu 3 ture/zi (204 km/zi GPS), din care serviciul R13 al lui 710CWN; R13 Hasnasenii Noi rămâne «fără ideal, explicat» în registru; economia F2 pe Dominteni și R13 e pusă pe linia greșită.
- Medii/low: registrul nere-semnat pe f7214db8 (v7 nu e exportabil); `capete-gps.json` e sigilat în GATA dar nu intră în copiile verificatorului; pragul «regulat» din §4.1 nu e scris. R19 e închis de §4.1 nou.

**Scorul (10 − Σ deduceri; critical −3 · high −2/−1,5/−1 · medium −0,5 · low −0,25):** pe textul nou: H1 −2 · H4 −1 · registru −0,5 · §4.1 «regulat» fără prag (R28 tur 28 % pe sursă) −0,25 · capete-gps.json în afara intrărilor −0,25 = −4,0 → **6,0 / 10 pentru ideal-v4 așa cum e** (pe textul vechi era 4,0: H2 −1,5, R28 −0,5, R19 −0,25 în plus). Cu v4.1 (cache curățat, C23 R28 ≤ 5 %, D6 R37 dispărut): ~8,0; cu H4 rezolvat în lanț: ~9.

## Blocante (neexplicate) — v7
C31(a) R13 Hasnasenii Noi, R18 Putinești, R27 Iabloana (0 candidate) · G1 R18 Zarojeni (28,9 / 30,7, 5,9 %) · G1 R27 Sturzovca (24,9 / 46,5). Aceleași 5 sunt **explicate în v6** (registrul pe 8b400214). Diagnosticul G1 e mai sus (cererea 3): ambele păstrează cardul.

## Explicate (registru) — v6
C31 ×3 și G1 ×2, pe sha 8b400214… · X1: 19 intrări moarte în v6, 24 în v7 (sha 0a5d2a5e, 29b2d3aa, 43dcceaf, 8b400214); G1 Bocancea Schit pe 8b400214 «nu explică nicio constatare blocantă» → se șterge.

## Nou față de verificarea anterioară (v6 → v7, km GPS linie cu linie, `compara.mjs`)
R28 Cuhnești 65,5 → 75 (GPS 65,5 → 75; km/zi 131 → 150) · R37 Musteața 43,5 → 60,2 (87 → 120,4; zile bune 10 → 9) · nou R37 Rediul de Jos* · dispărute 0 · cardul ≠ etalon (±0,1 km) în v7: Zarojeni −1,8, Sturzovca −21,6, Bocancea Schit +0,5, Nihoreni +1,9 (aceleași ca în v6) ·
constatări noi în v7: C23 R28 (12,7 %), D6 R37 (s1 45,2 / s2 62,0, «neconfirmat pe observații»), V5 Rediul de Jos*; dispărute: C35(d) Balatina și Năvîrneț (satul din act cu 0 % pe rută).

## Linie cu linie — din act (v7; v6 în paranteză unde diferă)
| rută | linie | verdict | sursa, zile bune GPS | km card v7 · GPS completat · dif (v6) | corecție | ture/zi · kmZi GPS | regim (D1) | porți tur/retur | C47 | controale căzute |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | Donduseni | trece | sept, 19 | 91.9 · 91.9 · 0 % | — | 1 · 183.8 | — | EST/EST | 100 % | — |
| R2 | Stolniceni | trece | sept, 16 | 67.9 · 67.9 · 0 % | — | 1 · 135.8 | — | VEST/EST | 94 % | — |
| R3 | Nihoreni | abatere | sept, 16 | 44.2 · 42.3 · 4.5 % | diagnostic cerut | 2 · 169.2 | — | VEST/EST | 58 % | C47 |
| R4 | Grinauti | trece | sept, 32 | 25.6 · 25.6 · 0 % | — | 2 · 102.4 | — | EST/EST | 97 % | — |
| R5 | Alunis | trece | sept, 9 | 34.6 · 34.6 · 0 % | — | 1 · 69.2 | — | VEST/EST | 100 % | — |
| R6 | Mihailenii Vechi | abatere | sept, 17 | 54.9 · 54.9 · 0 % | diagnostic cerut | 1 · 109.8 | — | EST/EST | 79 % | C22 zi aleasă |
| R7 | Usurei | trece | sept, 17 | 37.4 · 37.4 · 0 % | — | 1 · 74.8 | — | VEST/EST | 94 % | — |
| R8 | Costesti | trece | sept, 19 | 78.5 · 78.5 · 0 % | — | 1 · 157 | — | VEST/EST | 100 % | — |
| R9 | Cobani | abatere | sept, 14 | 55.5 · 55.5 · 0 % | diagnostic cerut | 2 · 222 | sursa «sept»: doar s1 · toată fereastra: neclar (lanț: neclar); act EZ+D → GPS neclar (sursa: doar s1) | VEST/EST | 100 % | D1 regim sursă ≠ total, D1 ≠ act |
| R10 | Ciuciulea | trece | sept, 28 | 66.5 · 66.5 · 0 % | — | 2 · 266 | — | EST/EST | 80 % | — |
| R11 | Funduri Vechi | trece | sept, 16 | 24.7 · 24.7 · 0 % | — | 1 · 49.4 | — | VEST/EST | 97 % | — |
| R11 | Limbenii Noi | trece | sept, 9 | 31.2 · 31.2 · 0 % | — | 1 · 62.4 | — | VEST/EST | 80 % | — |
| R12 | Pelinia | trece | sept, 37 | 26.4 · 26.4 · 0 % | — | 2 · 105.6 | — | EST/EST | 100 % | — |
| R12 | Sofia | trece | sept, 33 | 31.5 · 31.5 · 0 % | — | 2 · 126 | — | VEST/VEST | 99 % | — |
| R13 | Hasnasenii Noi | neverificabil | — | — | — | — | — | — | — | C31(a) |
| R13 | Lazo | trece | toate, 22 | 16.4 · 16.4 · 0 % | — | 2 · 65.6 | — | EST/EST | 100 % | — |
| R14 | Baroncea | trece | sept, 27 | 44.4 · 44.4 · 0 % | — | 2 · 177.6 | — | EST/EST | 100 % | — |
| R14 | Dominteni | abatere | sept, 54 | 34 · 34 · 0 % | diagnostic cerut | 3 · 204 | act EZ → GPS ambele (sursa: ambele) | EST/EST | 68 % | — |
| R15 | Suri | trece | sept, 8 | 70 · 70 · 0 % | — | 1 · 140 | — | VEST/EST | 96 % | — |
| R16 | Floresti | abatere | toate, 13 | 35.7 · 35.7 · 0 % | — | 1 · 71.4 | act EZ+D → GPS rotatie (sursa: rotatie) | EST/EST | 100 % | — |
| R16 | Varvareuca | trece | sept, 35 | 42.8 · 42.8 · 0 % | — | 2 · 171.2 | — | EST/EST | 82 % | — |
| R17 | Prajila | abatere | sept, 45 | 41.3 · 41.3 · 0 % | diagnostic cerut | 3 · 247.8 | — | EST/EST | 84 % | — |
| R18 | Putinesti | neverificabil | — | — | — | — | — | — | — | C31(a) |
| R18 | Zarojeni | blocant | sept, 9 | 28.9 · 30.7 · -5.9 % | diagnostic cerut | 2 · 122.8 | sursa «sept»: neclar · toată fereastra: rotatie (lanț: rotatie) | EST/EST | 41 % | G1, D1 regim sursă ≠ total, C47 |
| R19 | Bilicenii Vechi | abatere | sept, 25 | 17.3 · 17.3 · 0 % | diagnostic cerut | 2 · 69.2 | sursa «sept»: doar s2 · toată fereastra: rotatie (lanț: rotatie); act EZ+D → GPS rotatie (sursa: doar s2) | EST/EST | 81 % | D1 regim sursă ≠ total |
| R19 | Copaceni | trece | sept, 36 | 32.8 · 32.8 · 0 % | — | 2 · 131.2 | — | EST/EST | 99 % | — |
| R20 | Nicolaevca | abatere | sept, 28 | 39.6 · 39.6 · 0 % | diagnostic cerut | 2 · 158.4 | sursa «sept»: ambele · toată fereastra: neclar (lanț: neclar); act EZ+D → GPS neclar (sursa: ambele) | EST/EST | 100 % | D1 regim sursă ≠ total, D1 ≠ act |
| R20 | Radoaia | trece | sept, 37 | 26.1 · 26.1 · 0 % | — | 2 · 104.4 | — | EST/EST | 97 % | — |
| R21 | Heciul Nou | trece | sept, 39 | 20.7 · 20.7 · 0 % | — | 2 · 82.8 | — | EST/EST | 97 % | — |
| R22 | Tiplesti | trece | sept, 7 | 21.4 · 21.4 · 0 % | — | 1 · 42.8 | act EZ+D → GPS rotatie (sursa: rotatie) | EST/EST | 83 % | — |
| R23 | Scumpia | trece | sept, 21 | 59.5 · 59.5 · 0 % | — | 2 · 238 | — | VEST/EST | 98 % | — |
| R24 | Catranic | trece | sept, 15 | 29.3 · 29.4 · -0.3 % | — | 1 · 58.8 | — | VEST/EST | 92 % | — |
| R25 | Hiliuti | abatere | sept, 9 | 32 · 32 · 0 % | diagnostic cerut | 1 · 64 | — | EST/EST | 100 % | C22 zi aleasă |
| R26 | Ilenuta | trece | sept, 7 | 38.8 · 38.8 · 0 % | — | 1 · 77.6 | — | EST/EST | 89 % | — |
| R26 | Obreja Veche | trece | sept, 15 | 38.4 · 38.4 · 0 % | — | 1 · 76.8 | — | VEST/EST | 100 % | — |
| R27 | Danu | trece | sept, 16 | 53.3 · 53.3 · 0 % | — | 1 · 106.6 | — | VEST/EST | 94 % | — |
| R27 | Iabloana | neverificabil | — | — | — | — | — | — | — | C31(a) |
| R27 | Sturzovca | blocant | sept, 8 | 24.9 · 46.5 · -46.5 % | diagnostic cerut | 3 · 279 | sursa «sept»: neclar · toată fereastra: ambele (lanț: ambele); act D → GPS ambele (sursa: neclar) | VEST/EST | 29 % | G1, D1 regim sursă ≠ total, C47, C22 zi aleasă |
| R28 | Cuhnesti | abatere | sept, 14 | 75 · 75 · 0 % (v6 65.5) | v4.1 (cache) | 1 · 150 | — | VEST/EST | 91 % | — |
| R29 | Ustia | trece | sept, 9 | 56.9 · 56.9 · 0 % | — | 1 · 113.8 | — | VEST/EST | 100 % | — |
| R30 | Cosernita | trece | sept, 18 | 63.8 · 63.8 · 0 % | — | 1 · 127.6 | — | EST/EST | 97 % | — |
| R31 | Cotiujenii Mari | trece | sept, 15 | 65.1 · 65.1 · 0 % | — | 1 · 130.2 | — | EST/EST | 100 % | — |
| R32 | Cainarii Vechi | trece | sept, 18 | 46.9 · 46.9 · 0 % | — | 1 · 93.8 | — | EST/EST | 79 % | — |
| R32 | Trifanesti | abatere | sept, 18 | 40.2 · 40.2 · 0 % | diagnostic cerut | 2 · 160.8 | sursa «sept»: ambele · toată fereastra: doar s1 (lanț: doar s1); act D → GPS doar s1 (sursa: ambele) | EST/EST | 70 % | D1 regim sursă ≠ total, D2 izolat |
| R33 | Iezarenii Vechi | trece | sept, 13 | 34.7 · 34.7 · 0 % | — | 1 · 69.4 | — | EST/EST | 96 % | — |
| R34 | Taura Veche | trece | sept, 18 | 40.7 · 40.7 · 0 % | — | 1 · 81.4 | — | EST/EST | 100 % | — |
| R35 | Cucioaia | trece | sept, 19 | 52.5 · 52.5 · 0 % | — | 1 · 105 | — | EST/EST | 100 % | — |
| R36 | Bocancea Schit | trece | sept, 11 | 54.5 · 54 · 0.9 % | directă 54,0 | 1 · 108 | — | EST/EST | 94 % | — |
| R37 | Musteata | abatere | sept, 9 | 60.2 · 60.2 · 0 % (v6 43.5) | v4.1 (cache) | 1 · 120.4 | — | VEST/EST | 100 % | — |
| R38 | Glinjeni | trece | sept, 13 | 33.3 · 33.3 · 0 % | — | 1 · 66.6 | — | VEST/EST | 94 % | — |
| R39 | Popestii de jos | trece | toate, 47 | 74.8 · 74.8 · 0 % | — | 1 · 149.6 | — | EST/EST | 98 % | — |

## Linii * (v7)
| rută | linie | verdict | cifre |
|---|---|---|---|
| R1 | Tîrnova* | neverificabil | nicio candidată nu trece satele regulate (1 cu urmă) |
| R2 | Cupcini* | trece |  |
| R3 | Recea* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R3 | Rîșcani* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R4 | Corlăteni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R5 | Recea* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R6 | Nicoreni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R7 | Recea* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R7 | Slobozia* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R8 | Pîrjota* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R9 | Glodeni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R9 | Hîjdieni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R11 | Fundurii Noi* | neverificabil | nicio candidată nu trece satele regulate (1 cu urmă) |
| R11 | Sadovoe* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R14 | Hăsnășenii Mari* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R15 | Drochia* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R16 | Mărășești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R16 | Mărculești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R17 | Mărculești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R18 | Gura Căinarului* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R19 | Sîngerei* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R20 | Drăgănești* | trece |  |
| R20 | Mîndreștii Noi* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R20 | Sacarovca* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R21 | Alexăndreni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R22 | Alexăndreni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R22 | Heciul Vechi* | trece |  |
| R22 | Țipletești* | trece |  |
| R23 | Călugăr* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R23 | Fălești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R23 | Frumușica* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R23 | Gara Fălești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R23 | Măgureanca* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R25 | Pîrlița* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R27 | Sadovoe* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R28 | Moara Domnească* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R29 | Limbenii Vechi* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R29 | Petrunea* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R32 | Bezeni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R32 | Frumușica* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R33 | Bilicenii Vechi* | trece |  |
| R33 | Nicolaevca* | neverificabil | nicio candidată nu trece satele regulate (1 cu urmă) |
| R33 | Vrănești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R34 | Bilicenii Vechi* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R35 | Dumbrăvița* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R36 | Bobletici* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R36 | Flămînzeni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R37 | Rediul de Jos* | neverificabil | nicio candidată nu trece satele regulate (1 cu urmă) · nouă în v7 |
| R38 | Mărăndeni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |

## Pe flotă — mașini
Dubluri: 880RNK «sigur» (dispozitive 2402/2478, 7 zile, efect nul) · C37 R17 713IZX=763LYY 7/184 (4 %) · salturi între porți: 744ARF 16 zile, 346KAJ, 348KAJ, 350KAJ, 412BRAY câte 1 (0 atribuite unei linii) ·
deplasări fără schimb: 210 observații (geamăn rt 113, goale 36, rest 57), regulate 024XKY (R15 Suri 6 zile ~11:41, R12 Pelinia 11 zile ~11:20), 446ASB R23 Călugăr* 5 zile ·
clasa «capăt prin parcare»: 348KAJ (Zarojeni), 710CWN (Dominteni), 763LYY (Prajila), 727CWN (Sturzovca), 412BRAY (Heciul Vechi*).
Diagnosticele complete: `diag-c-v7.txt` (R28/R37 cursă cu cursă, §4.7), `diag-c44-v7.txt` (Nihoreni, Zarojeni, Sturzovca, Trifănești). Scripturile: `/root/diag-verif/capete-{a,b,c,d,e,f}.mjs`, `lista-linii.mjs`.
