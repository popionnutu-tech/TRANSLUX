# ION-108 — versiunea 3.1b (runda 3, reluarea Codex)

### ION-108 — triajul rundei 3 (v3 → v3.1b, final)

Scoruri v3: business 8,0 (1 high: F1) · backend 8,7 (0 high) · Codex runda 3 INDISPONIBIL (prima încercare invalidă, a doua oprită de limita de utilizare, «try again at 7:42 PM»). Toate observațiile Claude ACCEPTATE și aplicate:
- F1 (high): mașinile cu aceeași linie pe ambele schimburi (715IZX, 446ASB, 041BRAU, 880RNK) au casa în drum → «poate sta acasă, e în drum; să nu mai umble cu ea între curse»; câmp `casaInDrum` în plan; ies din întrebarea de seară.
- F2 / R3-1: 713IZX după lanț — «trece pe acasă în drum spre Coșernița, nu mai e drum în plus» (nu «nu mai are pauză»).
- F3 / R3-3: estimarea = dimineața + seara, pe calendarul rândului, plafonată la GPS pe mașină: 2.633 km/săpt. (≈ 17.167 lei cu normă); bucata «între aducere și întoarcere» scoasă.
- F4: întrebarea de seară din plan — 12 mașini (2 nemăsurate), ≈ 1.648 km/săpt. GPS de azi, estimare de tăiat ≈ 1.466; locul = capătul liniei, cu distanța până acasă.
- F6: nota cardului 1.902 + 2.242 + nemăsurate 247 ≈ 4.392.
- R3-2: `timeout 100` pe pasul plan-schimb din worker (aplicat pe VPS 27.09, `.bak-ion108-r3`).
Codex runda 3 se reia pe v3.1b după 19:42 (critic indisponibil ≠ critic mulțumit); publicarea după el.

### ION-108 — triajul rundei 2 (v2 → v3; runda 3 = ultima)

Scoruri v2: business 7,0 (2 high: N1, N2) · backend 7,8 (1 high: N1) · Codex 4,0 (2 high: C1, C2; prima rulare invalidă, reluată). Toate ACCEPTATE.

### Mesajul paginii (decizie)
- Sus, în cuvinte simple, COSTUL DE AZI măsurat pe GPS, împărțit: «Azi mașinile fac ≈ N km pe săptămână goi mergând acasă între curse: ≈ D km dimineața (după tur, până la cursa de după-amiază) și ≈ S km seara (după retur, până la cursa de la miezul nopții).» Apoi: «Dimineața: mașina stă parcată la capătul cursei următoare sau la uzină — se poate cere de luni. Seara: depinde dacă șoferul are cu ce veni la cursa de ~00:15 — o singură întrebare pentru Ion.» (biz N1)
- Nu «se taie N» lângă cifra GPS (backend N1): cifra GPS e «cost de azi»; economia estimată (model) apare o singură dată, marcată «estimare», fără să fie cifra principală; nota «modelul estimează N» pe mașină se SCOATE (biz N3).
- Dispoziția pe mașină: «stă parcată la <loc>» (nu «șoferul merge acasă altfel»); locul = același în text, în plan și în distanța din întrebare (biz N2; backend N7); dacă locul e chiar satul casei, dispoziția e doar «stă parcată acolo, nu mai umblă prin sat».
- Întrebarea «cum ajunge șoferul acasă / înapoi» NU pe fiecare mașină: o singură întrebare pentru seară, pe flotă, cu lista mașinilor (biz N1, zgomotul).
- Pragul de 20 km/zi pe fiecare gol, nu pe mașină; «alte N mașini» = doar cele cu toate golurile sub prag; cele 7 cu 20–29 km/zi intră în listă (biz N4). Mașinile fără zile măsurate (549RNK) apar la «nemăsurate» (biz N7).
- Schimbul de linii: doar în secțiunea planului, nu în fraza de sus; publicat DOAR dacă e verificat pe săptămâna precedentă cu schimburile inversate (Codex C1, biz N5, backend N5); altfel secțiunea spune «încercare, neverificată — nu se aplică»; «nu mai taie nimic» corectat; ambele mașini ale lanțului cu fraza lor (763LYY −288, 713IZX +205 → flota −83) (biz N6).
- Indicațiile mașinilor mutate se calculează din calendarul DUPĂ lanț (locul de așteptare, distanța) (Codex C2).

### Cod
- `tur`/`retur` nullable, cel puțin unul prezent (Codex C4, backend N2); probe cu un singur sens.
- Controlul model ↔ GPS doar informativ și pe același calendar (fără sâmbătă în model dacă GPS e L–V) (Codex C3, backend N3).
- Generatorul: ștergerea ieșirii la pornire, `intrare` cu md5-urile intrărilor, `.motiv` la eșec, rotația obligatorie pentru publicarea lanțurilor (backend N4, Codex C1); potrivirea pe săptămâna de rotație cu schimbul, nu primul program (backend N6).
- Integrarea în worker (pas aditiv, cum a descris backend-ul): după `liber`, înainte de `scrie`; `--rotatie` doar dacă există săptămâna precedentă; `|| true`; `scrie-analiza` acceptă planul doar cu săptămâna + amprenta + invarianții, altfel `planSchimb: null` + motivul în cuvinte; pagina verifică săptămâna planului = săptămâna rândului (backend N8).
- Teste: funcțiile de optimizare/rotație/normalizare în `plan-schimb.mjs` (probe pure), N1/N2/N5/N8 în vitest.
- Traseul brut 713IZX 14.09 06:22–13:42 verificat (alimentare sau umblat prin sat?) — o frază în plan (biz N3).

## Planul v3 / v3.1
# Drăxlmaier — drumul acasă între curse, v3 (ION-108 A), săptămâna 14–20.09.2026

Stare:
- Planul v3 e calculat, controlat și scris pe VPS. Pasul aditiv din worker e instalat, cu copii `.bak-ion108`.
- Rândul 14.09 din bază NU l-am rescris (se face după runda 3).
- **Atenție:** worker-ul modificat rulează singur mâine, luni 28.09 la 08:00 (cron `lear-saptamanal.sh`, săptămâna 21.09). Pasul e
  aditiv și nu oprește rândul: dacă planul cade, rândul se scrie cu `planSchimb: null` și motivul. Rândul de mâine va avea deci
  câmpul `planSchimb`, cu săptămâna precedentă 14.09 ca rotație.
  - Dacă runda 3 trebuie să vină înainte, sunt două căi: `DRAX_PLAN_SCHIMB=0` în mediul cron-ului, sau restaurarea din
    `saptamanal.sh.bak-ion108` / `scrie-analiza.mjs.bak-ion108`.
  - Durata pasului: ~1 s cu cache-ul cald, 55 s cu cache-ul gol (cel mai rău caz). Drăxlmaier mergea 78–93 s, iar limita cron-ului
    e 280 s.

Fișierele:

| | cale |
|---|---|
| cod (VPS) | `/root/lde-worker/drax/cod/plan-schimb/v3/{model.mjs, plan.mjs, plan-schimb.mjs, test.mjs}` (md5 plan-schimb 61dfe12c…) |
| worker (VPS) | `drax/cod/saptamanal/saptamanal.sh` (4cb60ce2…; `.bak-ion108` = e762e094…), `scrie-analiza.mjs` (d8a44a9d…; `.bak-ion108` = 43ead4f4…), nou `accepta-plan.mjs` + `accepta-plan.test.mjs` |
| JSON v3 | `/root/lde-worker/drax/date/plan-schimb/2026-09-14-v3.json`; copie `scratchpad/p108/plan-2026-09-14-v3.json` |
| copii locale | `scratchpad/p108/cod3/`, `scratchpad/p108/worker/`; în arborele ION-108 `docs/plans/2026-09-27-drax-plan-schimb/v3/` (fără commit) |

## 1. Ce costă azi (GPS) și cât se poate tăia (estimare) — dimineața și seara

Azi, între curse, mașina e dusă acasă sau e folosită prin sat. Golul se împarte în două:
- **dimineața**: după cursa de ~06:15, până la cursa de după-amiază (~13:00–14:00);
- **seara**: după întoarcerea de ~16:30, până la cursa de la miezul nopții.

| km/săpt. | 14–20.09 | 07–13.09 |
|---|---|---|
| **Azi, GPS** (R1b + R3 din rând, 33 de mașini cu ≥ 3 zile măsurate) | **dimineața 1.902 · seara 2.242 · între aducere și întoarcere 0 · total 4.144** | dimineața 2.195 · seara 1.917 · între curse 50 · total 4.161 |
| Dacă mașina stă parcată, **estimare** (model, toată flota) | dimineața 1.222 · seara 1.683 · între curse (un schimb) 355 · total 3.261 | dimineața 1.578 · seara 1.331 · între curse 799 · alt 169 · total 3.876 |
| lei (estimare × norma mașinii, doar cu normă) | ≈ 20.099 | ≈ 23.778 |
| Cursa de la miezul nopții (seara se termină) | 00:08–00:23 | 00:11–00:23 |

Cifra principală e cea GPS: costul de azi. Estimarea modelului apare o singură dată, cu eticheta ei. Seara e partea cu întrebarea:
șoferul trebuie să fie la uzină între 00:08 și 00:23, fără mașina pe care o lasă parcată la ~16:30.

Pe mașină, 14.09. GPS = costul de azi; model = cât se taie; «stă parcată» = UN loc pe gol, cel mai frecvent. Distanța până acasă vine
din aceeași sursă ca locul. «Satul casei» înseamnă loc la ≤ 3 km de casă sau în același sat, adică dispoziția e doar «stă parcată
acolo, nu mai umblă».

| Mașina | Casa | GPS azi dim / seara (km/săpt.) | seara: de la → cursa de noapte | Model: se taie dim / seara / între curse | Stă parcată dimineața | Stă parcată seara |
|---|---|---|---|---|---|---|
| 925FTI | Sărata Veche | 258 / 217.1 | 16:32 → 00:14 | 115.8 / 206.3 / 199.4 | capătul Musteața (R37) (21.6 km) | capătul Ilenuța (R26) (21.5 km) |
| 912RNK | Dumbrăvița | 16.8 / 351.8 | 16:26 → 00:17 | 15.8 / 292.3 / 0 | capătul Cucioaia (R35) (11.1 km) | uzină (42.6 km) |
| 457BRAX | Hîjdieni | 139.8 / 151 | 16:44 → 00:18 | 131.5 / 179.9 / 0 | capătul Ustia (R29) (23.6 km) | capătul Nihoreni (R3) (24.7 km) |
| 345KAJ | Zăicani | 57.8 / 218.2 | 16:50 → 00:17 | 40.5 / 206 / 0 | capătul Costești (R8) (22.5 km) | capătul Mihăileni (R6) (29 km) |
| 302YEK | Căinarii Vechi | 53.7 / 203.5 | 16:46 → 00:17 | 11.7 / 119.9 / 0 | capătul Căinarii Vechi (R32) (1.2 km, satul casei) | capătul Baroncea (R14) (19.7 km) |
| 713IZX | Florești | 125.4 / 103.7 | 16:57 → 00:23 | 47 / 47 / 0 | capătul Prajila (R17) (12.1 km) | capătul Prajila (R17) (12.1 km) |
| 388ASB | Șuri | 187.3 / 33 | 17:11 → 00:10 | 196.1 / 9.6 / 0 | capătul Sofia (R12) (22 km) | capătul Șuri (R15) (1.1 km, satul casei) |
| 146BRAZ | Scăieni | 115.8 / 80.3 | 16:56 → 00:19 | 31.8 / 38.8 / 80.2 | capătul Trifănești (R32) (4.8 km) | capătul Trifănești (R32) (4.8 km) |
| 725CWN | Sîngerei | 121.8 / 68.1 | 16:25 → 00:20 | 75.3 / 39.9 / 0 | capătul Iezărenii Vechi (R33) (16.3 km) | capătul Copăceni (R19) (6.9 km) |
| 447ASB | Ciuciulea | 168 / 0 | 17:14 → 00:23 | 160.3 / 3.6 / 0 | capătul Danu (R27) (23.9 km) | capătul Ciuciulea (R10) (1.2 km, satul casei) |
| 760BXI | Hîjdieni | 29.8 / 132.1 | 16:34 → 00:17 | 17.2 / 144.5 / 0 | capătul Cuhnești (R28) (18 km) | capătul Obreja Veche (R26) (23.7 km) |
| 549RNK | Edineț | — (0/5 zile) | 17:01 → 00:23 | 0 / 155.5 / 0 | — | capătul Stolniceni (R2) (26.1 km) |
| 518MHD | Izvoare | — (2/5 zile) | 16:48 → 00:19 | 90.2 / 63 / 0 | capătul Florești (R16) (19.9 km) | capătul Vărvăreuca (R16) (22.3 km) |
| 715IZX | Biruința | 65.3 / 78.5 | 16:27 → 00:21 | 1.5 / 2.1 / 0 | — | — |
| 830MUM | Sîngerei | 18.3 / 122.5 | 16:11 → 00:20 | 11.9 / 49.7 / 0 | capătul Copăceni (R19) (14.1 km) | capătul Bilicenii Vechi (R19) (6.9 km) |
| 206BZP | Rădoaia | 68.4 / 71.9 | 16:29 → 00:16 | 8.4 / 8.4 / 0 | capătul Rădoaia (R20) (1 km, satul casei) | capătul Rădoaia (R20) (1 km, satul casei) |
| 880RNK | Pelinia | 81.9 / 31.6 | 16:28 → 00:18 | 0 / 0 / 0 | — | — |
| 446ASB | Călugăr | 32.6 / 75.7 | 17:09 → 00:18 | 1.9 / 1.9 / 0 | — | — |
| 350KAJ | Florești | 44 / 62.9 | 18:04 → 00:16 | 2.8 / 4.3 / 0 | capătul Vărvăreuca (R16) (2.7 km, satul casei) | capătul Vărvăreuca (R16) (2.7 km, satul casei) |
| 710CWN | Petreni | 51.5 / 54.3 | 16:49 → 00:18 | 5.2 / 5.2 / 0 | capătul Dominteni (R14) (1.1 km, satul casei) | capătul Dominteni (R14) (1.1 km, satul casei) |
| 041BRAU | Drăgănești | 56.3 / 44.8 | 16:50 → 00:14 | 0.7 / 0.2 / 0 | — | — |
| 441ASB | Sturzovca | 38.4 / 55.9 | 16:23 → 00:17 | 10.8 / 29.8 / 0 | capătul Sturzovca (R27) (2.2 km, satul casei) | capătul Fundurii Vechi (R11) (7.2 km) |
| 727CWN | Sturzovca | 62.6 / 15.8 | 17:08 → 00:08 | 4.1 / 4.1 / 0 | capătul Sturzovca (R27) (1.9 km, satul casei) | capătul Sturzovca (R27) (1.9 km, satul casei) |
| 402VKV | Hîjdieni | 19.5 / 26.7 | 17:13 → 00:18 | 4.6 / 4.5 / 0 | capătul Cobani (R9) (11.5 km) | capătul Cobani (R9) (11.5 km) |
| 390ASB | Pelinia | 31.3 / 14.8 | 16:32 → 00:17 | 32.4 / 6.8 / 0 | capătul Grinăuți (R4) (4.7 km) | capătul Sofia (R12) (11.8 km) |
| 224BZP | Catranîc | 36.1 / 5 | 19:07 → 00:17 | 87.8 / 4.1 / 0 | uzină (30.4 km) | capătul Catranîc (R24) (0.4 km, satul casei) |
| 804MUM | Pământeni | — (0/5 zile) | 16:29 → — | 24.5 / 0 / 14.1 | uzină (7 km) | — |
| 186OMM | Dacia | 0 / 22.7 | 16:29 → 00:18 | 11.4 / 11.3 / 0 | uzină (6.1 km) | uzină (6.1 km) |
| 763LYY | Băhrinești | 22 / 0 | 22:35 → 00:16 | 36.1 / 36 / 0 | uzină (31.9 km) | capătul Prajila (R17) (7.4 km) |
| 144BRAZ | Dacia | — (2/5 zile) | — → 00:19 | 0 / 0 / 6.8 | — | — |
| 024XKY | Șuri | 0 / 0 | — → — | 1.7 / 0 / 0 | — | — |
| 435ASB | Autogara | 0 / 0 | — → 00:21 | 0 / 0 / 22.1 | — | — |
| 744ARF | Dacia | 0 / 0 | 16:11 → 00:20 | 0 / 8.6 / 32.8 | — | — |
| 826GXP | Dominteni | 0 / 0 | 16:32 → — | 43.1 / 0 / 0 | — | — |

**Mașinile din lanț, pe calendarul DUPĂ lanț (C2):**
- 713IZX (preia Coșernița): estimarea scade de la 94 la 47 km/săpt. Dimineața nu mai are drum de tăiat, pentru că Florești e în
  drum spre Coșernița. Seara stă parcată la capătul Prajila (12,1 km de casă).
- 763LYY (preia Prajila pe ambele schimburi): de la 72,1 la 54,1. Stă parcată dimineața și seara la capătul Prajila (7,4 km).

Nemăsurate pe GPS (< 3 zile), cu estimare de model: 549RNK (0/5 zile, 155,5 km/săpt.), 518MHD (2/5, 153,2), 804MUM (0/5, 38,6),
144BRAZ (2/5, 6,8).

Departe de casă (> 15 km până la locul de parcare), 14.09: 925FTI 51,6 · 912RNK 42,6 · 763LYY 31,9 · 224BZP 30,4 · 345KAJ 29 ·
549RNK 26,1 · 457BRAX 24,7 · 447ASB 23,9 · 760BXI 23,7 · 518MHD 22,3 · 388ASB 22 · 302YEK 19,7 · 725CWN 16,3. La 925FTI, 51,6 km e
uzina, în zilele cu un singur schimb; dimineața și seara locurile ei sunt la ~21,5 km.

**713IZX, 14.09, 06:22–13:42, pe traseul brut:** fără alimentare în ziua aceea (alimentările ei au fost pe 15.09 și 17.09). După
cursă a umblat ~12 km prin Bălți (Slobozia/Dacia) și a stat 1 h 46 min în Slobozia și 22 min în centru. La 09:30 a plecat acasă în
Florești (~33 km, oprită 3 h), apoi la 13:11 la capătul Prajila. Umblatul prin oraș explică de ce GPS dă mai mult decât modelul.

## 2. Schimbul de linii (după «stă parcată»)

- **Regula de publicare (C1).** Fără săptămâna precedentă nu se publică nimic: `schimb.stare = "neverificat"`, `lanturi = []`, iar
  încercările stau în `deoparte` cu motivul. Cu ea, un lanț se publică doar dacă taie ≥ 20 km/săpt. în ambele săptămâni, cu
  aceleași mutări pe schimbul corespondent. Cifra arătată e cea mai mică dintre cele două.
- **Potrivirea pe rotație (N6).** Se face pe (linii, schimbul corespondent). Inversarea schimburilor se deduce din majoritatea
  mașinilor: pe 14.09 față de 07.09 = inversată. Programele deja luate se exclud.
- **14.09 (stare «verificat»): −83 km/săpt.** «763LYY lasă Coșernița (R30) lui 713IZX, care stă la Florești; 713IZX lasă Prajila (R17)
  lui 763LYY, care stă la Băhrinești.» Pe 07.09 aceleași mutări dau −252. Pe mașini: 763LYY −288, 713IZX +205. Lei: nu se pot
  calcula, 763LYY n-are normă.
- **Neconfirmate** (găsite, dar nepublicate): 202,8 km.
  - 725CWN ↔ 830MUM, −81: pe 07.09, 725CWN nu face aceleași linii pe schimbul corespondent;
  - 186OMM ↔ 744ARF, −60: pe 07.09, 744ARF nu face aceleași linii pe schimbul corespondent;
  - 441ASB ↔ 727CWN, −37: pe 07.09 doar 14,9;
  - 144BRAZ ↔ 224BZP, −25: curse suprapuse pe 07.09.
  - Mai e 447ASB ↔ 457BRAX, −10, sub prag.
- **07.09 fără rotație (săptămâna 31.08 nu există): stare «neverificat», nimic publicat.** Încercările: −277, −252, −125, −15.
- **Optimul:** optimizatorul atinge optimul MILP al revizorului pe ambele săptămâni (15.714,2 / 15.596,4). Normalizarea n-a mutat
  nimic.

## 3. Controalele

| Control | 14.09 (rotație 07.09) | 07.09 (fără rotație, probă fără scriere) | Fel |
|---|---|---|---|
| Conservarea curselor (dată, loc, linie) | TRECE (658) | TRECE (676) | invariant |
| Fără două curse pe același loc într-o zi | TRECE | TRECE | invariant |
| Fiecare program la o singură mașină | TRECE (67) | TRECE (72) | invariant |
| Clasa și forma (verificate direct, nu prin `voie`) | TRECE | TRECE | invariant |
| Schimbul păstrat | TRECE | TRECE | invariant |
| A: Σ lanțuri = diferența planului, după ≤ înainte | TRECE (83,0) | TRECE (0) | invariant |
| B: azi − stă parcată = Σ pe mașini, nimic negativ | TRECE (19.270,6 − 16.009,9 = 3.260,6) | TRECE (3.876,3) | invariant |
| Normalizarea nu strică | TRECE (0) | TRECE (0) | invariant |
| Bucățile GPS dimineață / seară / între curse = R1b + R3 măsurate ale rândului | TRECE (abatere 0 km) | TRECE (0) | informativ |
| Model ↔ GPS pe ACELAȘI calendar (zilele măsurate GPS) | −39,5 % (2.123 ↔ 3.507) | −29,7 % | informativ, nu blochează |

Concordanța model ↔ GPS nu e o eroare. GPS e drumul făcut azi pe lângă casă: ocolul plus umblatul prin sat sau oraș (vezi 713IZX).
Modelul socotește doar surplusul drumului prin casă față de drumul direct. De aceea cifra problemei e GPS-ul, iar a soluției e
estimarea.

**Probele:**
- `test.mjs`: calendar exact, stă parcată, direct = min, conflict, conservare, ungar, componente pe ambele schimburi. Plus, nou:
  - optimul pe o flotă mică = forța brută;
  - Σ lanțuri = diferența;
  - normalizarea cu aceeași cheie și zile diferite nu strică;
  - forma «doar dus» nu se schimbă cu una întreagă;
  - rotația cu mașini care au aceeași linie pe ambele schimburi, pe schimbul corespondent;
  - fără rotație sau cu inversarea nedeterminată = neverificat;
  - concordanța cu 0 mașini nu blochează.
- `accepta-plan.test.mjs`: plan bun; altă săptămână; altă versiune; altă amprentă; invariant picat sau lipsă; fără listă de
  invarianți; null.
- Proba pasului pe o COPIE a dosarului 14.09, cu `scrie-analiza` fără `--write`:
  - A. plan bun → «acceptat (verificat)»; rândul e de 609 KB, planul de ~30 KB;
  - B. plan căzut (cod 2) → `plan-schimb.json.motiv`, `planSchimb: null`, «lipsesc datele săptămânii pentru plan»;
  - C. plan vechi al altei săptămâni în dosar → «plan de altă săptămână (2026-09-07)»;
  - D. fără săptămâna precedentă → «acceptat (neverificat)».
- Blocul din `saptamanal.sh`, rulat izolat, sub `set -euo pipefail`: fără săptămâna precedentă, cu ea («verificat») și
  `DRAX_PLAN_SCHIMB=0` (pasul sărit).
- `saptamanal.test.sh`: 13/13. `bash -n` curat.
- Cache-ul Valhalla are același md5 după probele fără `--out`.

## 4. Pasul în worker (cum l-a cerut backend-ul)

`saptamanal.sh`, după `pas liber`, înainte de `pas scrie`:
```bash
rm -f "$ECON_D/plan-schimb.json" "$ECON_D/plan-schimb.json.motiv"
if [ "${DRAX_PLAN_SCHIMB:-1}" = 1 ]; then
  PREV="$BAZA/$(date -d "$LUNI -7 days" +%F)"; ROT=()
  if [ -s "$PREV/economie.json" ] && [ -s "$PREV/economie-zile.json" ]; then ROT=(--rotatie "$PREV"); fi
  pas plan-schimb $N /root/lde-worker/drax/cod/plan-schimb/v3/plan-schimb.mjs "$ECON_D" "${ROT[@]}" --out "$ECON_D/plan-schimb.json" || true
fi
```

În `scrie-analiza.mjs`, înainte de `JSON.stringify(date)`, se cheamă `acceptaPlan(DIR, luni)` din `accepta-plan.mjs`. Nu aruncă
niciodată.
- **Acceptat** → `date.planSchimb` primește subsetul `{ sapt, pana, versiune, estimare, rotatie, asteptare, schimb, intrare }`.
- **Respins** → `date.planSchimb = null` și `date.planSchimbLipsa`, cu motivul în cuvinte:
  - «planul nu s-a calculat»;
  - «un control al planului a picat (…)»;
  - «drumurile nu s-au putut calcula (Valhalla)»;
  - «eroare în calculul planului»;
  - «plan de altă săptămână (…)»;
  - «planul e calculat din alte date decât rândul (amprenta diferă)»;
  - «plan de altă versiune».

Condiția de acceptare: săptămâna = `luni` + versiune `plan-schimb v3` + md5 al `economie.json` și `economie-zile.json` = cele din
`intrare` + toți invarianții trecuți. Concordanțele informative nu contează. Upsert-ul rămâne cel vechi, deci o rerulare cu
Valhalla căzut transformă un plan bun în `null` + motiv.

## 5. Ce trebuie întrebat (o singură întrebare pe flotă)

**Seara, între ~16:30 și cursa de la miezul nopții (00:08–00:23), unde stă șoferul, dacă mașina rămâne parcată?** Poate sta la
uzină sau la capăt, sau are cu ce veni la 00:15. De răspuns depind ~2.242 km/săpt. azi (GPS; estimat de tăiat ~1.683).

Dimineața nu are nevoie de întrebare. Mașina stă parcată la locul din tabel și se poate cere de luni. La 925FTI, 457BRAX, 345KAJ,
447ASB, 388ASB, 224BZP și 763LYY locul de dimineață e la 20–32 km de casă, deci doar o notă.

## 6. Contractul `planSchimb` (v3)

În rând intră subsetul, iar JSON-ul întreg rămâne în dosarul săptămânii (`plan-schimb.json`):
```
{ sapt, pana, versiune: "plan-schimb v3 (ION-108 A)", estimare,
  intrare: { economie: md5, economieZile: md5, rotatie: md5 | null, cod: md5 },
  rotatie: { saptIso, verificatPe: "YYYY-MM-DD" | null, inversata: bool | null, regula },
  asteptare: {
    gps:   { dimineata, seara, intreCurse, alt, total, masini },          // COSTUL DE AZI (cifra principală)
    model: { dimineata, seara, intreCurse, alt, total },                  // cât se taie dacă stă parcată — «estimare»
    kmSapt /* = model.total */, leiSapt, faraNorma: [m],
    oreSeara: { cursaDeNoapte: "00:08–00:23" | null },
    rotatie: { sapt, model, gps } | null,
    masini: [ { m, casa, zile, zileGps: "4/5",
                gps: { dimineata, seara, intreCurse, alt, total } | null,   // null = < 3 zile măsurate
                model: { dimineata, seara, intreCurse, alt, total }, kmSapt, kmZi,
                modelPeZileleGps, gpsMasuratTotal,
                ore: { dimineata: { de: "06:15", pana: "13:49" }, seara: { de: "16:32", pana: "00:14" } },   // câmpurile pot fi null
                asteapta: { dimineata: Loc | null, seara: Loc | null, intreCurse: Loc | null },
                departeDeCasaKm | null, leiKm, leiSapt | null, kmGoiSaptObicei, kmGoiSaptAsteapta,
                dupaLant?: { kmSapt, kmZi, model, asteapta, departeDeCasaKm } } ],   // doar mașinile din lanțurile publicate
    nemasurate: [ { m, zileGps, kmSapt } ],
    departeDeCasa: [ { m, casa, departeDeCasaKm, asteapta, kmZi } ] },
  schimb: { dupa: "staParcata", stare: "verificat" | "neverificat", kmSapt, leiSapt | null, lanturiFaraLei, faraNorma: [m],
    lanturi: [ { economieKmSapt /* min */, economieSaptCurenta, economieRotatie, leiSapt | null, faraNorma,
                 peMasina: [ { m, kmSapt /* + = merge mai mult */ } ],
                 mutari: [ { linie /* "tur>retur" */, tur: string | null, retur: string | null /* cel puțin unul */, nume, dela, la, zile, schimbInSaptamana } ],
                 text /* fără cifră */ } ],              // [] când stare = "neverificat"
    deoparte: [ { economieKmSapt, rotatie: { verificat, ecKmSapt? , motiv? }, masini, motiv } ],
    neconfirmateKmSapt, optim: { optimizator, dupaNormalizare, normalizate, cuToateLanturile } } }
Loc = { unde: "uzină" | "capătul <Sat> (R<n>)", departeDeCasaKm, acasaEChiarLocul: bool, zile }
```
Tot în rând: `planSchimbLipsa: string` când `planSchimb` e `null`. Pagina trebuie să compare `planSchimb.sapt` cu `saptamina`
rândului (N8).

---

## v3.1 (27.09, după runda 3: F3, F4, R3-3) — pentru partea B

Ce s-a schimbat:
- **Generatorul** e `plan-schimb.mjs` cu `versiune: "plan-schimb v3.1 (ION-108 A)"` (md5 2d49f08a…). JSON-ul
  `/root/lde-worker/drax/date/plan-schimb/2026-09-14-v3.json` e regenerat; copia e `scratchpad/p108/plan-2026-09-14-v3.json`.
- **`accepta-plan.mjs`** acceptă și v3.1: condiția e `startsWith('plan-schimb v3')`, iar testele trec.
- **Worker-ul** are `timeout 100` pe pasul plan-schimb, pus de sesiune (`saptamanal.sh`, md5 fec3f771…, copie `.bak-ion108-r3`).
  Copiile locale sunt actualizate.
- **Rândul 14.09** NU e rescris.

### Estimarea (F3, R3-3)

Estimarea = dimineața + seara ale modelului, cu trei reguli:
- pe **calendarul rândului**: zilele pe care rândul nu le are ies (de ex. sâmbăta), −80,3 km;
- **fără** bucata «între aducere și întoarcere», adică zilele cu un singur schimb, nemăsurate pe GPS: −355,4 km (925FTI 199,4, 146BRAZ
  80,2 — acolo 17.09 a fost deplasare de 144,8 km — 744ARF, 435ASB, 804MUM, 144BRAZ);
- **plafonată pe fiecare mașină** și pe fiecare parte (dimineață / seară) la costul GPS al mașinii: −192,5 km, pe 10 mașini (388ASB,
  447ASB, 760BXI, 390ASB, 224BZP, 186OMM, 763LYY, 024XKY, 744ARF, 826GXP).

La mașinile nemăsurate (< 3 zile GPS) rămâne modelul pe calendarul rândului. Lei-ii folosesc aceeași bază.

| km/săpt. | 14–20.09 | 07–13.09 |
|---|---|---|
| Azi, GPS | dimineața 1.902 · seara 2.242 · total 4.144 | dimineața 2.195 · seara 1.917 · total 4.161 |
| **Estimare v3.1 (se taie)** | **dimineața 1.074 · seara 1.558 · total 2.633 ≈ 17.167 lei** (cu normă) | dimineața 1.538 · seara 1.232 · total 2.770 ≈ 18.203 lei |

Revizorul business estima ≈ 2.905, adică dimineața 1.222 + seara 1.683, fără plafon și fără calendarul rândului. Cu plafonul (cerut tot
de el) și calendarul, cifra coboară la 2.633. Proba lui «Σ min(model, GPS) ≈ 2.630 pe cele măsurate» se confirmă: pe măsurate e același
plafon, iar nemăsuratele adaugă estimarea lor.

### Întrebarea de seară (F4), `asteptare.seara.intrebare`

Criteriile de intrare pe listă:
- seara mașina rămâne parcată la capătul liniei sau la uzină: `asteapta.seara` există și nu e satul casei;
- mașina e din lista paginii (GPS ≥ 20 km pe zi lucrată; la nemăsurate, estimarea ≥ 20 km/zi);
- estimarea serii > 0.

Distanța vine din `asteapta.seara.departeDeCasaKm`, sursa unică.

| Mașina | Unde stă parcată seara | km până acasă | GPS seara azi | estimare seara | seara: de la → cursa de noapte |
|---|---|---|---|---|---|
| 912RNK | uzină | 42,6 | 351,8 | 292,3 | 16:26 → 00:17 |
| 345KAJ | capătul Mihăileni (R6) | 29 | 218,2 | 206 | 16:50 → 00:17 |
| 549RNK | capătul Stolniceni (R2) | 26,1 | — (nemăsurat) | 155,5 | 17:01 → 00:23 |
| 457BRAX | capătul Nihoreni (R3) | 24,7 | 151 | 149,6 | 16:44 → 00:18 |
| 760BXI | capătul Obreja Veche (R26) | 23,7 | 132,1 | 132,1 | 16:34 → 00:17 |
| 518MHD | capătul Vărvăreuca (R16) | 22,3 | — (nemăsurat) | 63 | 16:48 → 00:19 |
| 925FTI | capătul Ilenuța (R26) | 21,5 | 217,1 | 206,3 | 16:32 → 00:14 |
| 302YEK | capătul Baroncea (R14) | 19,7 | 203,5 | 119,9 | 16:46 → 00:17 |
| 713IZX | capătul Prajila (R17) | 12,1 | 103,7 | 47 | 16:57 → 00:23 |
| 725CWN | capătul Copăceni (R19) | 6,9 | 68,1 | 13,7 | 16:25 → 00:20 |
| 830MUM | capătul Bilicenii Vechi (R19) | 6,9 | 122,5 | 49,7 | 16:11 → 00:20 |
| 146BRAZ | capătul Trifănești (R32) | 4,8 | 80,3 | 31 | 16:56 → 00:19 |

Suma: **GPS azi 1.648,3 km/săpt.** pe cele 10 măsurate. Estimarea de tăiat e 1.466,1, cu tot cu cele 2 nemăsurate (549RNK, 518MHD).
Cursa de noapte e la 00:08–00:23.

Pe 07.09 lista are 12 mașini și 1.278,7 km GPS (estimare 934,8); locurile sunt altele, pentru că schimburile sunt inversate.

### Câmpuri noi pentru partea B (se adaugă la §6)

```
asteptare: {
  …câmpurile v3 (gps, model, oreSeara, rotatie, masini, nemasurate, departeDeCasa),
  dimineata: { gps, estimare },
  seara:     { gps, estimare, cursaDeNoapte: "00:08–00:23" | null,
               intrebare: { masini: [ { m, unde, departeDeCasaKm, gpsSeara | null, estimareSeara, de, pana, masurat } ],
                            gpsKmSapt, estimareKmSapt, nemasurate: [m], regula } },
  kmSapt  /* = estimarea v3.1, dimineață + seară (înainte era model.total) */,
  leiSapt /* aceeași bază */, bazaEstimare,
  rotatie: { sapt, estimare, model, gps } | null,
  masini[]: + { estimare: { dimineata, seara, total, plafonata, baza }, kmSapt /* = estimare.total */, kmZi /* pe zilele rândului */,
                zileRand, modelCalendarRand: { dimineata, seara, intreCurse, alt, total },
                casaInDrum: { dimineata: bool, seara: bool },          // F1: fără loc în plan și ocol < 1 km/zi → «acasă, în drum»
                dupaLant?: + { estimare, casaInDrum } } }            // după lanț estimarea nu e plafonată (GPS e al liniilor vechi)
control: + estimarePlafonata (informativ): { plafonate, taiatDePlafon, scoasIntreCurse, scoasZileInAfaraRandului }
```

Ce trebuie să citească pagina:
- **Estimarea:** doar `asteptare.dimineata.estimare` / `asteptare.seara.estimare` / `asteptare.kmSapt`. `model.*` și `intreCurse` rămân
  în JSON pentru control, nu se citesc.
- **Mașinile «acasă, în drum»:** `casaInDrum` e adevărat la 715IZX, 880RNK, 446ASB și 041BRAU (dimineața și seara) și la 713IZX după
  lanț (dimineața; F2). Pe ele pagina scrie «poate sta acasă, e în drum spre cursa următoare; să nu mai umble cu ea prin sat» și nu le
  pune în întrebare.

### Controalele v3.1

- **14.09:** toți cei 8 invarianți TREC (conservare 658, suprapuneri, un program o dată 67, clasă și formă, schimbul păstrat, A 83,0, B
  3.260,6, normalizarea 0).
- **Informative:**
  - `gpsBucatiVsRand` TRECE (0 km);
  - `estimarePlafonata` TRECE: nicio mașină măsurată nu are estimarea peste GPS pe vreo parte;
  - `asteptareModelVsGps` −39,5 %: informativ, explicat.
- **07.09 (probă fără scriere):** invarianții trec. Starea e «neverificat» și nimic nu e publicat.
- **Teste:** `test.mjs` și `accepta-plan.test.mjs` trec.

## Textele v3 / v3.1 / v3.1b
# ION-108 partea B — texte v3.1b (rândul DRAXELMAIER 2026-09-14, rulat 2026-09-27T10:50:43.975+00:00; planul = plan-2026-09-14-v3.json, «plan-schimb v3.1 (ION-108 A)», subsetul din rând)

## A. Cu planul v3

### «Ce faci săptămâna asta» — sus

> Azi mașinile fac ≈ 4.144 km pe săptămână goi mergând acasă între curse: ≈ 1.902 km dimineața (după tur, până la cursa de după-amiază) și ≈ 2.242 km seara (după retur, până la cursa de la miezul nopții).
> Dimineața: mașina stă parcată la capătul cursei următoare sau la uzină — se poate cere de luni. Seara: depinde dacă șoferul are cu ce veni la cursa de 00:08–00:23 — o singură întrebare pentru Ion.
> Estimare: dacă mașinile stau parcate între curse, golul scade cu ≈ 2.633 km pe săptămână (≈ 1.074 dimineața, ≈ 1.558 seara; ≈ 17.167 lei pe mașinile cu normă).

> **Întrebarea pentru Ion: seara, după întoarcerea de ~16:44, mașina ar rămâne parcată la capătul liniei (912RNK la uzină) până pleacă spre cursa de noapte (00:08–00:23). Are șoferul cum ajunge de acolo acasă și înapoi la mașină, sau poate aștepta lângă ea? Privește 12 mașini, cu distanța până acasă: 912RNK 43 km, 345KAJ 29 km, 549RNK 26 km (nemăsurată), 457BRAX 25 km, 760BXI 24 km, 518MHD 22 km (nemăsurată), 925FTI 22 km, 302YEK 20 km, 713IZX 12 km, 725CWN 7 km, 830MUM 7 km, 146BRAZ 5 km. De răspuns depind ≈ 1.648 km pe săptămână de azi (pe mașinile măsurate; estimare de tăiat ≈ 1.466).**

### Pe mașină (19)

1. 925FTI (Sărata Veche) — azi merge acasă între curse: dimineața ≈ 52 km, seara ≈ 43 km pe zi (475 pe săptămână). Dimineața stă parcată la capătul Musteața (R37). Seara stă parcată la capătul Ilenuța (R26).
2. 912RNK (Dumbrăvița) — azi merge acasă între curse: dimineața ≈ 3 km, seara ≈ 70 km pe zi (369 pe săptămână). Dimineața stă parcată la capătul Cucioaia (R35). Seara stă parcată la uzină.
3. 457BRAX (Hîjdieni) — azi merge acasă între curse: dimineața ≈ 28 km, seara ≈ 30 km pe zi (291 pe săptămână). Dimineața stă parcată la capătul Ustia (R29). Seara stă parcată la capătul Nihoreni (R3).
4. 345KAJ (Zăicani) — azi merge acasă între curse: dimineața ≈ 12 km, seara ≈ 44 km pe zi (276 pe săptămână). Dimineața stă parcată la capătul Costești (R8). Seara stă parcată la capătul Mihăileni (R6).
5. 302YEK (Căinarii Vechi) — azi merge acasă între curse: dimineața ≈ 11 km, seara ≈ 41 km pe zi (257 pe săptămână). Dimineața stă parcată la capătul Căinarii Vechi (R32), chiar în satul lui, și nu mai umblă prin sat. Seara stă parcată la capătul Baroncea (R14).
6. 713IZX (Florești) — azi merge acasă între curse: dimineața ≈ 25 km, seara ≈ 21 km pe zi (229 pe săptămână). Dimineața, după schimbul de linii, trece pe acasă (Florești) în drum spre Coșernița (R30) — nu mai e drum în plus; să nu mai umble cu ea între curse. Seara stă parcată la capătul Prajila (R17). Locurile sunt cele de după schimbul de linii din plan.
7. 388ASB (Șuri) — azi merge acasă între curse: dimineața ≈ 38 km, seara ≈ 7 km pe zi (220 pe săptămână). Dimineața stă parcată la capătul Sofia (R12). Seara stă parcată la capătul Șuri (R15), chiar în satul lui, și nu mai umblă prin sat.
8. 146BRAZ (Scăieni) — azi merge acasă între curse: dimineața ≈ 23 km, seara ≈ 16 km pe zi (196 pe săptămână). Dimineața și seara stă parcată la capătul Trifănești (R32).
9. 725CWN (Sîngerei) — azi merge acasă între curse: dimineața ≈ 24 km, seara ≈ 14 km pe zi (190 pe săptămână). Dimineața stă parcată la capătul Iezărenii Vechi (R33). Seara stă parcată la capătul Copăceni (R19).
10. 447ASB (Ciuciulea) — azi merge acasă între curse: dimineața ≈ 34 km pe zi (168 pe săptămână). Dimineața stă parcată la capătul Danu (R27).
11. 760BXI (Hîjdieni) — azi merge acasă între curse: dimineața ≈ 6 km, seara ≈ 26 km pe zi (162 pe săptămână). Dimineața stă parcată la capătul Cuhnești (R28). Seara stă parcată la capătul Obreja Veche (R26).
12. 715IZX (Biruința) — azi merge acasă între curse: dimineața ≈ 13 km, seara ≈ 16 km pe zi (144 pe săptămână). Dimineața și seara poate sta acasă, e în drum spre cursa următoare; să nu mai umble cu ea între curse.
13. 830MUM (Sîngerei) — azi merge acasă între curse: dimineața ≈ 4 km, seara ≈ 25 km pe zi (141 pe săptămână). Dimineața stă parcată la capătul Copăceni (R19). Seara stă parcată la capătul Bilicenii Vechi (R19).
14. 206BZP (Rădoaia) — azi merge acasă între curse: dimineața ≈ 14 km, seara ≈ 14 km pe zi (140 pe săptămână). Dimineața și seara stă parcată la capătul Rădoaia (R20), chiar în satul lui, și nu mai umblă prin sat.
15. 880RNK (Pelinia) — azi merge acasă între curse: dimineața ≈ 16 km, seara ≈ 6 km pe zi (114 pe săptămână). Dimineața și seara poate sta acasă, e în drum spre cursa următoare; să nu mai umble cu ea între curse.
16. 446ASB (Călugăr) — azi merge acasă între curse: dimineața ≈ 7 km, seara ≈ 15 km pe zi (108 pe săptămână). Dimineața și seara poate sta acasă, e în drum spre cursa următoare; să nu mai umble cu ea între curse.
17. 350KAJ (Florești) — azi merge acasă între curse: dimineața ≈ 9 km, seara ≈ 13 km pe zi (107 pe săptămână). Dimineața și seara stă parcată la capătul Vărvăreuca (R16), chiar în satul lui, și nu mai umblă prin sat.
18. 710CWN (Petreni) — azi merge acasă între curse: dimineața ≈ 10 km, seara ≈ 11 km pe zi (106 pe săptămână). Dimineața și seara stă parcată la capătul Dominteni (R14), chiar în satul lui, și nu mai umblă prin sat.
19. 041BRAU (Drăgănești) — azi merge acasă între curse: dimineața ≈ 11 km, seara ≈ 9 km pe zi (101 pe săptămână). Dimineața și seara poate sta acasă, e în drum spre cursa următoare; să nu mai umble cu ea între curse.

> Alte 7 mașini merg acasă între curse mai puțin de 20 km pe zi (351 km pe săptămână împreună) — nu merită o dispoziție.
> Nemăsurate destul, de verificat: 518MHD (2 zile măsurate din 5, ≈ 247 km pe săptămână), 549RNK (nicio zi măsurată; estimare: ≈ 156 km pe săptămână).

### «Planul de schimb»

După ce mașinile stau parcate între curse, schimbul de linii mai taie ≈ 83 km pe săptămână (estimare; verificat și pe săptămâna 2026-09-07, cu schimburile inversate).

1. 763LYY dă Coșernița (R30) lui 713IZX și ia Prajila (R17): merge cu ≈ 288 km mai puțin pe săptămână. 713IZX dă Prajila (R17) lui 763LYY și ia Coșernița (R30): merge cu ≈ 205 km mai mult pe săptămână. Flota: −83 km pe săptămână (estimare; pe săptămâna cu schimburile inversate −252). — fără lei: 763LYY fără normă

## B. Fără planSchimb (rândul de azi)

### «Ce faci săptămâna asta» — sus

> Azi mașinile fac ≈ 4.144 km pe săptămână goi mergând acasă între curse: ≈ 1.902 km dimineața (după tur, până la cursa de după-amiază) și ≈ 2.242 km seara (după retur, până la cursa de la miezul nopții).
> Dimineața: mașina stă parcată la capătul cursei următoare sau la uzină — se poate cere de luni. Seara: depinde dacă șoferul are cu ce veni la cursa de ~00:17 — o singură întrebare pentru Ion.

> **Întrebarea pentru Ion: seara, după întoarcerea de ~16:34, mașina ar rămâne parcată la capătul liniei până pleacă spre cursa de noapte (~00:17). Are șoferul cum ajunge de acolo acasă și înapoi la mașină, sau poate aștepta lângă ea? Privește 12 mașini: 041BRAU, 146BRAZ, 302YEK, 345KAJ, 457BRAX, 713IZX, 715IZX, 725CWN, 760BXI, 830MUM, 912RNK, 925FTI. De răspuns depind ≈ 1.772 km pe săptămână de azi (pe mașinile măsurate).**

### «Planul de schimb»

Planul se calculează luni: care linie trece la care mașină, ca flota să meargă mai puțin gol.


## C. Plan neverificat pe rotație

Schimbul de linii: încercare, neverificată pe săptămâna precedentă — nu se aplică (ar tăia ≈ 286 km, estimare).

## D. Plan de altă săptămână

Planul de schimb nu e disponibil săptămâna asta (planul e al săptămânii 2026-09-07).

## E. Rândul deschis — 925FTI

Tabel: «Gol între curse (acasă)» = 475 km/săpt.

În cele 4 zile măsurate din 5: 639 km cu oameni, 994 km goi. Drumul acasă între curse: dimineața ≈ 52 km, seara ≈ 43 km pe zi (475 pe săptămână).

**lun 14.09** · 411 km în zi, din care 248 km goi · noaptea la Sărata Veche → Sărata Veche

- 03:00–05:30 acasă (Sărata Veche) → Ilenuța, gol, 22 km
- 05:30–06:20 Ilenuța → uzina, cu oameni, 38 km
- 06:20–13:49 uzina → acasă (Sărata Veche) → Musteața, gol, 98 km — din care 52 km doar pentru că a trecut pe acasă
- 13:49–14:32 Musteața → uzina, cu oameni, 43 km
- 14:32–15:52 pe lângă uzină, gol, 7 km
- 15:52–16:30 uzina → Ilenuța, cu oameni, 38 km
- 16:30–00:14 Ilenuța → acasă (Sărata Veche) → uzina, gol, cu o oprire la parcul de lângă uzină, 79 km — din care 41 km doar pentru că a trecut pe acasă
- 00:14–00:52 uzina → Musteața, cu oameni, 44 km
- 00:52–03:00 Musteața → acasă (Sărata Veche), gol, 42 km

Orele la apăsare (925FTI): lun 14.09, 06:20–13:49: 52 km în plus pe acasă (7 h 29 min între curse) · lun 14.09, 16:30–00:14: 41 km în plus pe acasă (7 h 44 min între curse) · mar 15.09, 06:19–13:49: 51 km în plus pe acasă (7 h 30 min între curse) · mar 15.09, 16:32–00:14: 41 km în plus pe acasă (7 h 42 min între curse) · mie 16.09, 06:20–13:49: 51 km în plus pe acasă (7 h 29 min între curse) · mie 16.09, 16:21–00:13: 50 km în plus pe acasă (7 h 53 min între curse) · joi 17.09, 06:18–13:49: 52 km în plus pe acasă (7 h 31 min între curse) · joi 17.09, 16:32–00:14: 42 km în plus pe acasă (7 h 42 min între curse)

## F. Card

«Gol între curse · drumul acasă» 4392 km — «Cost de azi, pe GPS: dimineața 1.902 + seara 2.242 + nemăsurate 247 ≈ 4.392 km. Mașinile din listă (peste 20 km pe zi): 3.794 · sub prag: 351 km.»

## v3.1 — corecțiile rundei 3 (doar texte)

- F1: «casa în drum» → «poate sta acasă, e în drum spre cursa următoare; să nu mai umble cu ea între curse» (715IZX, 446ASB, 041BRAU, 880RNK), nu uzina; ies din întrebarea de seară. Fără plan, seara locul GPS e capătul returului; eticheta «Călugăr / Scumpia» contează ca acasă.
- F2: 713IZX după lanț: «trece pe acasă (Florești) în drum spre Coșernița (R30) — nu mai e drum în plus»; «nu mai are pauză lungă» a dispărut.
- F3: fără «între aducere și întoarcere» în estimare.
- F4: întrebarea cu locul (capătul liniei, 912RNK la uzină), distanța până acasă pe mașină și km de azi care depind de ea.
- F6: nota cardului «dimineața 1.902 + seara 2.242 + nemăsurate 247 ≈ 4.392 km».

## v3.1b — aliniere la planul v3.1 (partea A)

- **Estimarea de sus** vine din plan, nerecalculată: `asteptare.kmSapt` (2.633), `asteptare.dimineata.estimare` (1.074), `asteptare.seara.estimare` (1.558), cu `asteptare.leiSapt` (≈ 17.167 lei, doar mașinile cu normă).
- **Întrebarea de seară** vine din `asteptare.seara.intrebare`: lista (12 mașini, cu 549RNK și 518MHD marcate «nemăsurată»), ordinea, orele (mediana `de` = ~16:44), `gpsKmSapt` 1.648 și `estimareKmSapt` 1.466. Pagina nu mai recalculează lista cu plan; fără plan rămâne varianta din GPS (fără distanțe, fără estimare).
- **«Casa în drum»** vine din `casaInDrum` (după lanț din `dupaLant.casaInDrum`); pragul meu de 5 km s-a scos. Ora cursei de noapte: `asteptare.seara.cursaDeNoapte`.
- **Garda** pe v3.1: `dimineata/seara.{gps, estimare}`, `seara.cursaDeNoapte`, `seara.intrebare.{masini[].{m, unde, departeDeCasaKm|null, gpsSeara|null, estimareSeara, de|null, pana|null, masurat}, gpsKmSapt, estimareKmSapt, nemasurate[]}`, `kmSapt`, `leiSapt|null`, `masini[].casaInDrum`, `dupaLant.casaInDrum`. Nu mai citește `asteptare.gps`, `asteptare.model`, `oreSeara`, `masini[].model` (rămân în JSON). Un plan v3 fără câmpurile v3.1 → «nu e disponibil».
- **Fixture**: subsetul din rând al `plan-2026-09-14-v3.json` regenerat («plan-schimb v3.1 (ION-108 A)»).
- **Teste**: 24 fișiere, 345/345; tsc curat. Noi: 7 forme stricate v3.1, estimarea din plan, întrebarea din plan (text exact, listă independentă de pagină, listă goală → fără întrebare, fără plan → GPS), `casaInDrum` pe cele 4 mașini și pe 713IZX după lanț.
- Nota: totalul estimării e `kmSapt` rotunjit (2.633), iar părțile rotunjite dau 1.074 + 1.558 = 2.632 — de aceea «≈».

## Review r3 — rezumat
Scor: 8.0 · Blocante (critical/high): 1 (F1 — o ramură în `drax-ce-faci-text.ts`, închide și F2; se poate închide la triaj cu fapt, fără încă o rundă)
Scor: 8.7 · Blocante (critical/high): 0

## Adăugat 27.09 17:05 — răspunsul lui Ion la întrebarea de seară: mașina mică pentru șofer

Ion: «Dacă livrarea e masivă poate se merită seara să oferim la șofer mașina mică cu care să se miște acasă (asta la rutiere).
La autobuze mari și livrări medii 30–40 km tur-retur pot avea așa sens economic.»

Propunerea (de implementat în ION-108, pe pagină în locul întrebării de seară):
- Seara mașina rămâne parcată la capăt sau la uzină (locul din plan). Șoferul merge acasă și înapoi cu o mașină mică.
- Mașina mică merge pe ACELAȘI drum pe care îl face azi autobuzul, deci km-ii ei = km-ii scutiți autobuzului (estimarea de seară).
- Câștigul pe km = lei/km ai autobuzului (§9: norma × ANRE / 100 + reparație 1,50 mare / 1,00 rest + salariu 1,00) − lei/km mașina mică.
- Mașina mică: 6 l/100 km × prețul ANRE / 100 + 0,50 lei/km uzură = 2,69 lei/km la 36,49 lei/l. Costul fix al mașinii (cumpărare, asigurare) NU e
  presupus: pagina arată «rămân X lei pe lună să acopere mașina mică», iar Ion compară cu cât costă ea.
- Pe km înlocuit: DAF 12,90 − 2,69 = 10,21 lei; Crafter / Sprinter ≈ 3,9–4,6 lei. De aceea la autobuz mare merită și la distanțe medii (Ion are dreptate).

| mașina | tip | casa de la loc, km | km autobuz scutiți / săpt | lei/km autobuz | rămân lei / lună |
|---|---|---|---|---|---|
| 912RNK | Crafter | 42,6 | 292 | 6,93 | 5.362 |
| 345KAJ | Sprinter 315 | 29 | 206 | 6,56 | 3.454 |
| 457BRAX | Sprinter 518 | 24,7 | 150 | 7,29 | 2.981 |
| 549RNK | Crafter (nemăsurată) | 26,1 | 156 | 6,93 | 2.853 |
| 760BXI | Sprinter 515 | 23,7 | 132 | 6,85 | 2.382 |
| 830MUM | DAF | 6,9 | 50 | 12,90 | 2.197 |
| 302YEK | Sprinter 515 | 19,7 | 120 | 6,85 | 2.162 |
| 713IZX | DAF | 12,1 | 47 | 12,90 | 2.078 |
| 146BRAZ | Sprinter 315 | 4,8 | 31 | 6,56 | 520 |
| 725CWN | Sprinter 316 | 6,9 | 14 | 6,56 | 230 |
| 925FTI, 518MHD | fără normă | 21,5 / 22,3 | 206 / 63 | — | — |

Total pe cele 10 cu normă: ≈ 24.200 lei / lună, înainte de costul fix al mașinilor mici. Întrebări pentru critic: e corect să iei km-ii mașinii
mici = km-ii scutiți autobuzului (nu 5 × dus-întors)? E corect salariul 1,00 lei/km în costul autobuzului (șoferul conduce și mașina mică)?
Prag de afișare «merită»?
