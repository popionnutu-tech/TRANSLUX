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
