# Verificarea 8 — DRAXELMAIER_BALTI — 27.09.2026 (dezbaterea ideal-v4, runda 2, ION-110)

**Starea.** `RUN=/home/verif/verificator/rulari/drax-v8-1790522048` · sursa `/root/lde-worker/drax/date/ideal-v4.1` (GATA al producătorului, schelet-ideal bfa070f0339c5464…, timp.mjs = al verificatorului) ·
drax.mjs 1be43dc0b57b · ruleaza.sh a26fad56be25 · etalon-gps 3f958d6ca8dd · filtru-rupte 96807913f1d1 · node v20.20.2 · tz 2025c · Europe/Chisinau.
Regulile: textul după migrația 412 — `reguli_livrare_la` 2026-09-27T15:00:05.260446+00:00, 25.072 caractere, md5 62eace0d0dd8f37e678a27ef639f5c0e (verificat).
SIGILIU: verdict ca33a53d81c1… · probe: R1 **ok** · registru **PICATĂ** (registrul e pe alt sha — X2, aceeași clasă ca v7) · INCHIS: **ok** (manifestul final = inițial).
Unități: 51 linii din act, 48 linii `*` («Rediul de Jos*» a dispărut), 48 cu ideal, 49 mașini, 13.534 observații cu rută (+1 față de v7), 13.315 deplasări cu rută, 27.644 brute (identice).
valid_pentru_export: **false** — 5 blocante, exact cele 5 explicate în v6 (C31 R13 Hasnasenii Noi, R18 Putinești, R27 Iabloana; G1 R18 Zarojeni, R27 Sturzovca), neexplicate pe bfa070f0.

## (1) Verdictul pe v8 — R28 și R37
| linie | G1 card / GPS completat | C47 | C23 hartă | C11 capăt atins | km GPS sept pe sens × schimb (+rază) | lanț (șosea) pe schimb | verdict |
|---|---|---|---|---|---|---|---|
| R28 Cuhnești → Balatina | 75,0 / 75,0 (0 %, 14 zile) | 32/35 (91 %) | 75,0 (0 %; în v7 65,5 = 12,7 %) | 140/140 trec prin Balatina | tur s1 73,4 · tur s2 73,0 · retur s1 75,5 · retur s2 75,3 | etalon 76,8 · s1 77,9/79,8 (3 zile) · s2 74,9/74,3 | **trece** |
| R37 Musteața → Năvîrneț | 60,2 / 60,2 (0 %, 9 zile) | 33/33 (100 %) | 61,9 (2,8 %) | 142/144 trec, 136 opresc | tur s1 59,7 · tur s2 59,8 · retur s1 59,9 · retur s2 61,5 | etalon 61,5 · s1 61,0/61,7 · s2 61,9/63,9 | **abatere** — doar C22: ziua desenată s1 925FTI 25.09 are turul pe EST (poarta sensului e VEST), deci nu e zi bună GPS; harta e în ±5 % |

**H1 e închis:** câmpurile lanțului (etalon, real, schimburi, drum) urmează acum capetele noi; D6 R37 a dispărut; F2 (`economie/categorii.mjs:37-40`) vede între schimburi R28 5,4 % și R37 2,5 %, sub 25 %, deci un singur etalon pe linie. Celelalte 46 de linii: identice cu v6/v7 (`compara.mjs`); card 5.872 km/zi, GPS completat 6.000 km/zi (+52 față de v6: R28 +19, R37 +33,4).

## (2) Comasarea
Pe R28/R37: 282 din 284 de observații identice cu v7. **3 observații `capatAct` + `exclusEtalon` («cursă scurtă: atinge startul din act…»)**, toate pe R37:
351KAJ 05.05 tur 49,3 / retur 50,2 (în v7 erau pe «Rediul de Jos*») și 925FTI 09.09 tur 44,2 (nouă; pe poarta EST, deci oricum în afara C47). Pe R28: 0 (toate cursele trec prin Balatina).
Nicio cursă bună pierdută și nicio cursă scurtă în etalon: C47 R37 33/33 ca în v7, zile bune 9 = 9. Pe flotă: +1 observație (a lui 925FTI). Notă: `drax.mjs` nu citește `exclusEtalon`; aici n-a contat (piciorul e pe cealaltă poartă), iar un picior scurt pe poarta sensului ar ieși în C47 în afara toleranței (conservator, nu pierde nimic).

## (3) Re-semnarea registrului
Verdictul o permite: cele 5 blocante sunt aceleași ca în v6, iar diagnosticul din runda 1 susține explicațiile (Zarojeni: cardul 28,9 = picioarele prin Zarojeni, etalonul 30,7 = serviciul R22 al lui 348KAJ; Sturzovca: 46,5 = 727CWN prin satele R11/R13, iar linia are 24,1 pe 41 de zile; C31: 0 candidate). **Ce e nevoie de la sesiune** (verificatorul nu scrie în registru):
1. re-semnarea celor 5 intrări pe sha-ul `bfa070f0339c5464b58b0663ac8cc6842a8c2be890dfe8983f7a5c953792f61c`, cu textele G1 actualizate (clasa «capăt prin parcare» ca motiv);
2. ștergerea celor 24 de intrări moarte (X1: sha 0a5d2a5e, 29b2d3aa, 43dcceaf, 8b400214, f7214db8), inclusiv G1 Bocancea Schit;
3. o rulare v9 pe aceeași sursă: proba-registru trebuie să iasă «ok» și `valid_pentru_export` true; abia apoi `ideal-activ` → `ideal-v4.1`.

## (4) H4 «capăt prin parcare» — de acord cu Codex C1
Da: **doar listă de diagnostic**, fără excludere automată. Cazul de control «plecare legitimă din capăt, tracker pornit târziu» nu intră în lista mea, pentru că piciorul lui oprește în satele proprii la > 2,5 km dincolo de capăt. Pot intra fals doar liniile scurte fără sat propriu dincolo de capăt și satele comune a două rute; lista le marchează separat. Lista de azi (identică în v6, v7 și v8): Zarojeni 15/29 (52 %, 348KAJ), Heciul Vechi* 61/130 (47 %, 412BRAY), Dominteni 52/115 (45 %, 710CWN → Lazo, Hăsnășenii Noi, Dobrogea Veche), Prajila 29/107 (27 %, 763LYY → Gura Căinarului, Zarojeni), Sturzovca 16/107 (15 %, 727CWN → sate R11), Țiplești 3/24 (13 %). Excluderea se discută după C44 pe Dominteni (ture/zi 3 vs act 1) și Prajila (3 vs 2).

## (5) Liniile cu steag pe cardul v6 (Codex C2) — de acord
Da. Toate sunt sub pragul G1 de 5 %, cu excepția Zarojeni și Sturzovca, unde cardul v6 e cel corect (runda 1). Bocancea Schit (54,5 / 54,0, 0,9 %) nu cere corecție, iar −1 km/zi nu justifică o a doua re-semnare. Steagul Bocancei nu mai e cerut de E1: se scoate la o rerulare obișnuită, nu acum.

## High-uri și scorul
- **H4 (preexistent, nu e regresie v4.1, nu blochează):** *scenariu* — Dominteni rămâne cu 3 ture/zi și 204 km/zi GPS, în care intră și serviciul R13 al lui 710CWN; F2 pune economia pe linia greșită, iar R13 Hasnasenii Noi rămâne «fără ideal, explicat».
- Procedură (medium): registrul nere-semnat pe bfa070f0 → v8 nu e exportabil până la v9.
- Low: C22 R37 (harta dintr-o zi cu turul pe EST); §4.1 «în mod regulat» fără prag numeric; `capete-gps.json` sigilat în GATA, dar în afara copiilor verificatorului; cheia cache-ului fără capăt (risc la următoarea mutare).

**Scorul (10 − Σ deduceri; high preexistent −1 · medium −0,5 · low −0,25):** H4 −1 · registru −0,5 · C22 R37 −0,25 · §4.1 fără prag −0,25 · capete-gps.json în afara intrărilor −0,25 · cheia cache-ului −0,25 = −2,5 → **7,5 / 10** (runda 1, v4: 6,0). După v9 cu registrul re-semnat: 8,0; cu H4 rezolvat: ~9.
v4.1 nu introduce nicio high nouă.

## Linie cu linie — din act (v8)
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
| R19 | Bilicenii Vechi | abatere | sept, 25 | 17.3 · 17.3 · 0 % | — | 2 · 69.2 | sursa «sept»: doar s2 · toată fereastra: rotatie (lanț: rotatie); act EZ+D → GPS rotatie (sursa: doar s2) | EST/EST | 81 % | D1 regim sursă ≠ total |
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
| R28 | Cuhnesti | trece | sept, 14 | 75 · 75 · 0 % (v6 65.5) | — | 1 · 150 | — | VEST/EST | 91 % | — |
| R29 | Ustia | trece | sept, 9 | 56.9 · 56.9 · 0 % | — | 1 · 113.8 | — | VEST/EST | 100 % | — |
| R30 | Cosernita | trece | sept, 18 | 63.8 · 63.8 · 0 % | — | 1 · 127.6 | — | EST/EST | 97 % | — |
| R31 | Cotiujenii Mari | trece | sept, 15 | 65.1 · 65.1 · 0 % | — | 1 · 130.2 | — | EST/EST | 100 % | — |
| R32 | Cainarii Vechi | trece | sept, 18 | 46.9 · 46.9 · 0 % | — | 1 · 93.8 | — | EST/EST | 79 % | — |
| R32 | Trifanesti | abatere | sept, 18 | 40.2 · 40.2 · 0 % | diagnostic cerut | 2 · 160.8 | sursa «sept»: ambele · toată fereastra: doar s1 (lanț: doar s1); act D → GPS doar s1 (sursa: ambele) | EST/EST | 70 % | D1 regim sursă ≠ total, D2 izolat |
| R33 | Iezarenii Vechi | trece | sept, 13 | 34.7 · 34.7 · 0 % | — | 1 · 69.4 | — | EST/EST | 96 % | — |
| R34 | Taura Veche | trece | sept, 18 | 40.7 · 40.7 · 0 % | — | 1 · 81.4 | — | EST/EST | 100 % | — |
| R35 | Cucioaia | trece | sept, 19 | 52.5 · 52.5 · 0 % | — | 1 · 105 | — | EST/EST | 100 % | — |
| R36 | Bocancea Schit | trece | sept, 11 | 54.5 · 54 · 0.9 % | — (card v6, Codex C2) | 1 · 108 | — | EST/EST | 94 % | — |
| R37 | Musteata | abatere | sept, 9 | 60.2 · 60.2 · 0 % (v6 43.5) | — | 1 · 120.4 | — | VEST/EST | 100 % | C22 zi aleasă |
| R38 | Glinjeni | trece | sept, 13 | 33.3 · 33.3 · 0 % | — | 1 · 66.6 | — | VEST/EST | 94 % | — |
| R39 | Popestii de jos | trece | toate, 47 | 74.8 · 74.8 · 0 % | — | 1 · 149.6 | — | EST/EST | 98 % | — |

## Linii * (v8)
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
| R38 | Mărăndeni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |

Diagnostic: `diag-comasare.txt` (câmpurile scheletului și observațiile R28/R37, v7 vs v8; scriptul `/root/diag-verif/comasare-v8.mjs`). Pe flotă: ca în runda 1 (`../verif-r1/raport.md`), fără schimbări.
