# Verificarea 15 — Drăxlmaier Bălți (ideal-v4.3, ION-112) — 27.09.2026

## Starea
- **Rularea:**
  - RUN `/home/verif/verificator/rulari/drax-v15-1790539226`, rulată la 2026-09-27T20:00:29.097Z.
  - drax.mjs v5 `1be43dc0b57beaf3195125153bf69aea98e87e7951a3e21cacabe2a497ba80e3`, ruleaza.sh `a26fad56be25`, etalon-gps `3f958d6ca8dd` (etalon-gps v5 + filtru-rupte v1).
  - node v20.20.2, tz 2025c, fus Europe/Chisinau.
- **Sursa:** VERIF_SRC `/root/lde-worker/drax/date/ideal-v4.3`.
  - schelet-ideal `c541bb2036e8cdf3244a102a259ec80f4ddec12b484496c626b638530f7efd79` (= sha-ul din prompt).
  - obs `9a421935f9c2`, etalon `ff388827bfb1`, curse `79b09da2780e`, decizii-v3 `92ba8eb07887`, registru `b2c60ca7e982`.
- **Regulile:**
  - reguli_livrare_la 2026-09-27 18:22:08.95551+00, md5 ce930b08d4d14ddd26db0dd8398a1cdb, verificat pe copia primită.
  - Textul neaplicat al migrației 417 are md5 bbaa55c6ac6e384cf5a338115d1e8dcc, verificat; cele 6 linii sunt judecate după el, etichetat «neaplicat».
- **SIGILIU:** verdict `c22ea36071c96d4361b08fbbb6d228890068f15c4c5e3587e5bc831e8a6e2ae8`, manifest `f996c83e8df9…`.
- **Probele:**
  - proba-r1: ok.
  - proba-registru: **PICATĂ, cum era de așteptat.** Registrul are 4 explicații pe sha 629b0c1d, iar sursa verificată are sha c541bb20 (X2 re-semnare). Nu e un defect al registrului.
- **INCHIS:** INCHIS ok (manifestul final = inițial).
- **Unitățile:** 51 de linii în act (49 cu ideal, 48 cu GPS), 37 de linii *, 49 de mașini; 13.695 de observații cu rută, 13.476 de deplasări cu rută, 27.644 de deplasări brute.

**valid_pentru_export: false.** Cele 5 blocante se pot explica toate; niciunul nu cere o schimbare de card sau de ture. Exportul devine valid după re-semnarea registrului pe c541bb20, cu cele 5 intrări din corectii.md (R-1, R-2 corectat, R-3), și după o rulare de confirmare.

## Blocante (neexplicate) — 5
| id | linie | cifra | diagnostic |
|---|---|---|---|
| C31 | R18 Putinești | 0 candidate | linie comasată (§1.4, migr. 415); 7 observații (763LYY 4, 146BRAZ 1, 731ARF 1) → R-3 |
| C31 | R27 Iabloana | 0 candidate | comasată; 5 observații (441ASB 2, 348KAJ 2, 487NPL 1) → R-3 |
| G1 | R18 Zarojeni | card 28,9 / GPS 32,1 (−10 %, 4 zile) | **fals pozitiv:** 2 din cele 4 zile bune sunt serviciile altor linii (18.09 Moara de Piatră 49,0 / 52,7; 25.09 grupa D, Putinești 30,4 / 30,2), ambele fără oprire la Zarojeni. Tururile cu oprire la Zarojeni: 13, mediana 27,8 / 28,3 → cardul e susținut → R-1; corecție de lanț L-1 |
| E1 | R18 Zarojeni | C47 35 % | aceeași cauză; C47 pe tururile cu oprire la Zarojeni, față de card: 9/14 → R-1 |
| E1 | R3 Nihoreni | poarta sensului 42,3 / orice poartă 45,8 | variantă reală: grupa D face o buclă de circa 12 km după prima trecere prin Nihoreni (D 52,6 / 50,55; EZ 42,75 / 42,6). **Textul propus («același drum pe aceeași poartă, 45,0 / 44,6») e contrazis de date** → R-2 corectat |

## Explicate (registru)
Niciuna pe c541bb20. Explicațiile vechi, pe 629b0c1d (X1):
- C31 Putinești, C31 Iabloana, G1 Zarojeni: se re-semnează.
- G1 Sturzovca: moartă, NU se re-semnează.

## Ce e nou față de control-ideal.log și de verificarea 12 (v4.2, km GPS linie cu linie)
| linie | card v4.2 → v4.3 | GPS v12 → v15 | ture | km/zi card | km/zi GPS | zile bune |
|---|---|---|---|---|---|---|
| R16 Florești | 35,7 → 36,5 | 35,7 → 36,5 | 1 → 2 | 71,4 → 146 | 71,4 → 146 | 13 → 34 (sursa toate → sept) |
| R17 Prajila | 41,3 → 41,3 | 41,3 → 41,3 | 3 → 2 | 247,8 → 165,2 | 247,8 → 165,2 | 45 → 34 (fără 763LYY) |
| R18 Zarojeni | 28,9 → 28,9 | 30,7 → 32,1 | 2 → 1 | 115,6 → 57,8 | 122,8 → 64,2 | 9 → 4 |
| R27 Sturzovca | 24,9 → 23,9 | 46,5 → 23,9 | 3 → 2 | 149,4 → 95,6 | 279 → 95,6 | 8 → 15 |
| R36 Bocancea Schit | 54,5 → 53,3 | 54,0 → 54,0 | 1 → 1 | 109 → 106,6 | 108 → 108 | 11 → 11 |
| R3 Nihoreni | 44,2 → 44,2 | 42,3 → 42,3 | 2 → 2 | 176,8 → 176,8 | 169,2 → 169,2 | 16 → 16 (steagul scos) |

- **Totaluri:** card 5.789 → 5.667 km/zi. GPS completat 5.918 → 5.668. Card − GPS = −1 km/zi (v12: −129).
- **Linii cu card ≠ etalon GPS:** 3 (Nihoreni +1,9 km, Zarojeni −3,2 km, Bocancea −0,7 km).
- **C47 pe flotă:** 91,2 % → 93,5 %.
- **Dispărute în v15:**
  - G1 Sturzovca (46,5 %), C47 Sturzovca 29 %, C22 Sturzovca;
  - D1 Zarojeni și D1 Sturzovca (sursă ≠ total);
  - D2 izolat Trifănești (6 zile);
  - C42 Florești, Prajila, Zarojeni: turele sunt acum egale cu actul.
- **Apărute în v15:**
  - E1 steag lipsă Zarojeni și Nihoreni: v4.3 a scos steagul «diagnostic», iar registrul n-are încă E1;
  - D1 ≠ act Trifănești (act D → GPS neclar pe toată fereastra, sursa: doar s1);
  - D6 Zarojeni: s1 33,3 / s2 27,0, eșantion mic. E faza B cu ocolul prin Elizaveta.
- **Liniile care nu s-au schimbat:** celelalte 43 au card și GPS identice cu v12.

## Linie cu linie — din act
| rută | linie | verdict | sursa, zile bune GPS | km card · km GPS completat · dif | corecție | ture/zi · kmZi GPS | regim (D1: sursă / total) | porți tur/retur | C47 | controale căzute |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | Donduseni | trece | sept, 19 | 91.9 · 91.9 · 0 % | nu e nevoie | 1 · 183.8 | fără D1 | EST/EST | 100 % | — |
| R2 | Stolniceni | trece | sept, 16 | 67.9 · 67.9 · 0 % | nu e nevoie | 1 · 135.8 | fără D1 | VEST/EST | 94 % | — |
| R3 | Nihoreni | blocant | sept, 16 | 44.2 · 42.3 · 4.5 % | nu e nevoie | 2 · 169.2 | fără D1 | VEST/EST | 60 % | E1 steag lipsă |
| R4 | Grinauti | trece | sept, 35 | 25.6 · 25.6 · 0 % | nu e nevoie | 2 · 102.4 | fără D1 | EST/EST | 96 % | — |
| R5 | Alunis | trece | sept, 9 | 34.6 · 34.6 · 0 % | nu e nevoie | 1 · 69.2 | fără D1 | VEST/EST | 100 % | — |
| R6 | Mihailenii Vechi | abatere | sept, 17 | 54.9 · 54.9 · 0 % | nu e nevoie | 1 · 109.8 | fără D1 | EST/EST | 79 % | C22 zi aleasă |
| R7 | Usurei | trece | sept, 18 | 37.4 · 37.4 · 0 % | nu e nevoie | 1 · 74.8 | fără D1 | VEST/EST | 95 % | — |
| R8 | Costesti | trece | sept, 19 | 78.5 · 78.5 · 0 % | nu e nevoie | 1 · 157 | fără D1 | VEST/EST | 100 % | — |
| R9 | Cobani | abatere | sept, 14 | 55.5 · 55.5 · 0 % | nu e nevoie | 2 · 222 | sursa «sept»: doar s1 · toată fereastra: neclar (lanț: neclar); act EZ+D → GPS neclar (sursa: doar s1) | VEST/EST | 100 % | D1 regim sursă ≠ total, D1 ≠ act |
| R10 | Ciuciulea | trece | sept, 28 | 66.5 · 66.5 · 0 % | nu e nevoie | 2 · 266 | fără D1 | EST/EST | 80 % | — |
| R11 | Funduri Vechi | trece | sept, 16 | 24.7 · 24.7 · 0 % | nu e nevoie | 1 · 49.4 | fără D1 | VEST/EST | 97 % | — |
| R11 | Limbenii Noi | trece | sept, 16 | 31.2 · 31.2 · 0 % | nu e nevoie | 1 · 62.4 | fără D1 | VEST/EST | 83 % | — |
| R12 | Pelinia | trece | sept, 37 | 26.4 · 26.4 · 0 % | nu e nevoie | 2 · 105.6 | fără D1 | EST/EST | 100 % | — |
| R12 | Sofia | trece | sept, 34 | 31.5 · 31.5 · 0 % | nu e nevoie | 2 · 126 | fără D1 | VEST/VEST | 97 % | — |
| R13 | Hasnasenii Noi | trece | sept, 14 | 9.5 · 9.5 · 0 % | nu e nevoie | 1 · 19 | fără D1 | EST/EST | 100 % | — |
| R13 | Lazo | trece | toate, 116 | 16.2 · 16.2 · 0 % | nu e nevoie | 2 · 64.8 | fără D1 | EST/EST | 97 % | — |
| R14 | Baroncea | trece | sept, 27 | 44.4 · 44.4 · 0 % | nu e nevoie | 2 · 177.6 | fără D1 | EST/EST | 100 % | — |
| R14 | Dominteni | trece | sept, 17 | 29.9 · 29.9 · 0 % | nu e nevoie | 1 · 59.8 | fără D1 | EST/EST | 97 % | — |
| R15 | Suri | trece | sept, 8 | 70 · 70 · 0 % | nu e nevoie | 1 · 140 | fără D1 | VEST/EST | 96 % | — |
| R16 | Floresti | trece | sept, 34 | 36.5 · 36.5 · 0 % | nu e nevoie | 2 · 146 | fără D1 | EST/EST | 92 % | — |
| R16 | Varvareuca | trece | sept, 35 | 42.8 · 42.8 · 0 % | nu e nevoie | 2 · 171.2 | fără D1 | EST/EST | 93 % | — |
| R17 | Prajila | trece | sept, 34 | 41.3 · 41.3 · 0 % | nu e nevoie | 2 · 165.2 | fără D1 | EST/EST | 100 % | — |
| R18 | Zarojeni | blocant | sept, 4 | 28.9 · 32.1 · -10 % | diagnostic cerut → explicație (G1 contaminat) | 1 · 64.2 | fără D1 | EST/EST | 35 % | G1, C47, E1 steag lipsă, X1 registru mort |
| R19 | Bilicenii Vechi | abatere | sept, 29 | 17.3 · 17.3 · 0 % | nu e nevoie | 2 · 69.2 | sursa «sept»: ambele · toată fereastra: rotatie (lanț: rotatie); act EZ+D → GPS rotatie (sursa: ambele) | EST/EST | 90 % | D1 regim sursă ≠ total |
| R19 | Copaceni | trece | sept, 37 | 32.8 · 32.8 · 0 % | nu e nevoie | 2 · 131.2 | fără D1 | EST/EST | 99 % | — |
| R20 | Nicolaevca | abatere | sept, 28 | 39.6 · 39.6 · 0 % | nu e nevoie | 2 · 158.4 | sursa «sept»: ambele · toată fereastra: neclar (lanț: neclar); act EZ+D → GPS neclar (sursa: ambele) | EST/EST | 100 % | D1 regim sursă ≠ total, D1 ≠ act |
| R20 | Radoaia | trece | sept, 37 | 26.1 · 26.1 · 0 % | nu e nevoie | 2 · 104.4 | fără D1 | EST/EST | 97 % | — |
| R21 | Heciul Nou | trece | sept, 42 | 20.7 · 20.7 · 0 % | nu e nevoie | 2 · 82.8 | fără D1 | EST/EST | 94 % | — |
| R22 | Tiplesti | trece | sept, 31 | 21.9 · 21.9 · 0 % | nu e nevoie | 2 · 87.6 | fără D1 | EST/EST | 92 % | — |
| R23 | Scumpia | trece | sept, 21 | 59.5 · 59.5 · 0 % | nu e nevoie | 2 · 238 | fără D1 | VEST/EST | 98 % | — |
| R24 | Catranic | trece | sept, 15 | 29.3 · 29.4 · -0.3 % | nu e nevoie | 1 · 58.8 | fără D1 | VEST/EST | 92 % | — |
| R25 | Hiliuti | abatere | sept, 9 | 32 · 32 · 0 % | nu e nevoie | 1 · 64 | fără D1 | EST/EST | 100 % | C22 zi aleasă |
| R26 | Ilenuta | trece | sept, 7 | 38.8 · 38.8 · 0 % | nu e nevoie | 1 · 77.6 | fără D1 | EST/EST | 89 % | — |
| R26 | Obreja Veche | trece | sept, 15 | 38.4 · 38.4 · 0 % | nu e nevoie | 1 · 76.8 | fără D1 | VEST/EST | 100 % | — |
| R27 | Danu | trece | sept, 16 | 53.3 · 53.3 · 0 % | nu e nevoie | 1 · 106.6 | fără D1 | VEST/EST | 94 % | — |
| R27 | Sturzovca | abatere | sept, 15 | 23.9 · 23.9 · 0 % | nu e nevoie | 2 · 95.6 | fără D1 | EST/EST | 64 % | D2 izolat, X1 registru mort |
| R28 | Cuhnesti | trece | sept, 14 | 75 · 75 · 0 % | nu e nevoie | 1 · 150 | fără D1 | VEST/EST | 91 % | — |
| R29 | Ustia | trece | sept, 9 | 56.9 · 56.9 · 0 % | nu e nevoie | 1 · 113.8 | fără D1 | VEST/EST | 100 % | — |
| R30 | Cosernita | trece | sept, 18 | 63.8 · 63.8 · 0 % | nu e nevoie | 1 · 127.6 | fără D1 | EST/EST | 97 % | — |
| R31 | Cotiujenii Mari | trece | sept, 15 | 65.1 · 65.1 · 0 % | nu e nevoie | 1 · 130.2 | fără D1 | EST/EST | 100 % | — |
| R32 | Cainarii Vechi | abatere | sept, 18 | 46.9 · 46.9 · 0 % | nu e nevoie | 1 · 93.8 | fără D1 | EST/EST | 95 % | D2 izolat |
| R32 | Trifanesti | abatere | sept, 19 | 40.2 · 40.2 · 0 % | nu e nevoie | 2 · 160.8 | sursa «sept»: doar s1 · toată fereastra: neclar (lanț: neclar); act D → GPS neclar (sursa: doar s1) | EST/EST | 72 % | D1 regim sursă ≠ total, D1 ≠ act |
| R33 | Iezarenii Vechi | trece | sept, 18 | 34.1 · 34.1 · 0 % | nu e nevoie | 1 · 68.2 | fără D1 | EST/EST | 97 % | — |
| R34 | Taura Veche | trece | sept, 18 | 40.7 · 40.7 · 0 % | nu e nevoie | 1 · 81.4 | fără D1 | EST/EST | 100 % | — |
| R35 | Cucioaia | trece | sept, 19 | 52.5 · 52.5 · 0 % | nu e nevoie | 1 · 105 | fără D1 | EST/EST | 100 % | — |
| R36 | Bocancea Schit | trece | sept, 11 | 53.3 · 54 · -1.3 % | nu e nevoie | 1 · 108 | fără D1 | EST/EST | 94 % | — |
| R37 | Musteata | abatere | sept, 9 | 60.2 · 60.2 · 0 % | nu e nevoie | 1 · 120.4 | fără D1 | VEST/EST | 100 % | C22 zi aleasă |
| R38 | Glinjeni | trece | sept, 17 | 33.3 · 33.3 · 0 % | nu e nevoie | 1 · 66.6 | fără D1 | VEST/EST | 95 % | — |
| R39 | Popestii de jos | trece | toate, 47 | 74.8 · 74.8 · 0 % | nu e nevoie | 1 · 149.6 | fără D1 | EST/EST | 98 % | — |
| R18 | Putinesti | blocant | — (0 candidate) | — | explicație C31 în registru pe c541bb20 (textul propus, cu nota din R-3) | — | — | — | — | C31(a), X1 registru mort |
| R27 | Iabloana | blocant | — (0 candidate) | — | explicație C31 în registru pe c541bb20 (textul propus) | — | — | — | — | C31(a), X1 registru mort |

## Linii * — neverificabile (fără ideal, §4.6)
| rută | linie | verdict | cifre |
|---|---|---|---|
| R11 | Fundurii Noi* | abatere | observații sept 0 / toate 7 · 457BRAX 7 |
| R11 | Sadovoe* | neverificabil | observații sept 36 / toate 135 · 457BRAX 135 |
| R14 | Hăsnășenii Mari* | neverificabil | observații sept 0 / toate 2 · 826GXP 2 |
| R16 | Mărculești* | neverificabil | observații sept 0 / toate 7 · 144BRAZ 7 |
| R16 | Mărășești* | neverificabil | observații sept 0 / toate 3 · 144BRAZ 3 |
| R17 | Mărculești* | neverificabil | observații sept 0 / toate 15 · 713IZX 15 |
| R19 | Sîngerei* | neverificabil | observații sept 0 / toate 2 · 435ASB 1, 830MUM 1 |
| R1 | Tîrnova* | neverificabil | observații sept 1 / toate 1 · 346KAJ 1 |
| R20 | Drăgănești* | neverificabil | observații sept 35 / toate 216 · 041BRAU 216 |
| R20 | Mîndreștii Noi* | neverificabil | observații sept 0 / toate 2 · 206BZP 1, 041BRAU 1 |
| R20 | Sacarovca* | neverificabil | observații sept 0 / toate 1 · 041BRAU 1 |
| R21 | Alexăndreni* | neverificabil | observații sept 35 / toate 139 · 715IZX 139 |
| R22 | Heciul Vechi* | neverificabil | observații sept 0 / toate 207 · 412BRAY 207 |
| R22 | Țipletești* | neverificabil | observații sept 0 / toate 23 · 412BRAY 23 |
| R23 | Călugăr* | neverificabil | observații sept 34 / toate 121 · 446ASB 121 |
| R23 | Frumușica* | neverificabil | observații sept 0 / toate 10 · 446ASB 10 |
| R23 | Fălești* | neverificabil | observații sept 1 / toate 5 · 446ASB 5 |
| R23 | Gara Fălești* | neverificabil | observații sept 2 / toate 2 · 446ASB 2 |
| R23 | Măgureanca* | neverificabil | observații sept 0 / toate 2 · 446ASB 2 |
| R27 | Sadovoe* | neverificabil | observații sept 0 / toate 3 · 727CWN 3 |
| R28 | Moara Domnească* | neverificabil | observații sept 1 / toate 1 · 760BXI 1 |
| R29 | Limbenii Vechi* | neverificabil | observații sept 0 / toate 1 · 457BRAX 1 |
| R29 | Petrunea* | neverificabil | observații sept 0 / toate 1 · 457BRAX 1 |
| R2 | Cupcini* | neverificabil | observații sept 29 / toate 34 · 549RNK 34 |
| R32 | Bezeni* | neverificabil | observații sept 0 / toate 1 · 146BRAZ 1 |
| R32 | Frumușica* | neverificabil | observații sept 0 / toate 2 · 146BRAZ 2 |
| R33 | Bilicenii Vechi* | neverificabil | observații sept 28 / toate 110 · 725CWN 110 |
| R33 | Vrănești* | neverificabil | observații sept 0 / toate 5 · 725CWN 5 |
| R35 | Dumbrăvița* | neverificabil | observații sept 34 / toate 111 · 912RNK 111 |
| R36 | Bobletici* | neverificabil | observații sept 2 / toate 2 · 224BZP 2 |
| R38 | Mărăndeni* | neverificabil | observații sept 0 / toate 1 · 744ARF 1 |
| R3 | Recea* | neverificabil | observații sept 1 / toate 4 · 345KAJ 4 |
| R4 | Corlăteni* | neverificabil | observații sept 0 / toate 4 · 748IZX 4 |
| R5 | Recea* | neverificabil | observații sept 0 / toate 4 · 917FTI 4 |
| R7 | Slobozia* | neverificabil | observații sept 25 / toate 98 · 386PKP 98 |
| R8 | Pîrjota* | neverificabil | observații sept 1 / toate 1 · 345KAJ 1 |
| R9 | Glodeni* | neverificabil | observații sept 2 / toate 62 · 397VKV 60, 447ASB 2 |

## Pe flotă — mașini
- **Dubluri:**
  - 880RNK: C4 sigur în 7 zile, dispozitivele 2402 și 2478; efect nul pe card și pe ture.
  - C37 713IZX=763LYY: 7 curse din 180 (4 %), informativ.
  - dubluri-ideal.json: niciuna.
- **Salturi între porți (V6):** 7.731 de deplasări poartă→poartă ≤ 5 km, 0 atribuite unei linii. Pe mașini: 744ARF 16 zile; 346KAJ, 350KAJ, 348KAJ, 412BRAY câte 1.
- **Atribuiri greșite (altul):**
  - 348KAJ: 18.09 și 25.09 etichetate R18 Zarojeni, fără oprire la Zarojeni.
  - 763LYY: etichetat R17, 0 opriri la Prajila în zilele lucrătoare din septembrie; face Zarojeni / Gura Căinarului, apoi Moara de Piatră.
  - Corecția e L-1.
- **Deplasări fără schimb (D7):** 212 observații (septembrie: 109 în 25 de zile). Geamăn rt 113, goală 36, rt fără picior 4, rest 59. Regulate: 024XKY (R15 Suri 6 zile, R12 Pelinia 11 zile, ~11:20–11:41) și 446ASB (R23 Călugăr* 5 zile) → F4.
- **Regim și rotație:**
  - D1 abateri: Cobani, Nicolaevca, Trifănești (neclar față de act), Bilicenii Vechi (sursă ≠ total).
  - D2 izolat, abatere: Sturzovca și Căinarii Vechi, câte 1 zi.
  - W53: informativ.
- **Ora:** C5 fereastra 04.05–26.09 e în întregime pe ora de vară; D5 10.037/10.037 observații în ferestre.

Judecata completă: `judecata.json`. Corecțiile și textul registrului: `corectii.md`. Întrebările: `intrebari.md`.
