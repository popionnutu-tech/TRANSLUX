# Verificarea 1 — Drăxlmaier Bălți (schelet ideal ION-71) — 26.09.2026

Starea:
- RUN: `/home/verif/verificator/rulari/drax-v4-verif1-1790451539`
- `drax.mjs` v4, sha `0ca96a6ffc58…`. `etalon-gps.mjs` sha `ca3273625021…`. `ruleaza.sh` sha `a615c35592fa…`.
- node v20.20.2, tz 2025c, Europe/Chisinau.
- Sursa este cea implicită (`verif_src` null, `/root/lde-worker/drax/date`). Fișierul `schelet-ideal.json` are sha `43dcceaf6db7…`.
- Verdictul are sha256 `04a42bbabf4d951496174393f31b857cdb162fcfdd0ddd2808fb60c9e598db41`. SIGILIUL e prezent, cu manifestul `c8b80340…`.
- Probele au trecut: proba R1 ok (dacă se scoate R1|Donduseni, apare blocant R1), iar proba de registru ok (fără registru, C31 e blocant; cu registru, C31 e explicat).
- INCHIS: ok, manifestul final e identic cu cel inițial.
- `reguli_livrare_la` e cel primit: 2026-09-26 18:04:03 UTC, md5 77c30eee9a1dfc82f0c3547fb1365d3f.

Unități:
- linii: 51 în act și 42 cu *; 48 dintre ele au ideal;
- 49 de mașini;
- deplasări: 13.697 observații cu rută, 13.475 deplasări cu rută, 27.683 deplasări brute.

**valid_pentru_export: false.** Rămân 5 blocante neexplicate, toate G1. Constatările sunt 215: 8 blocante (3 explicate), 23 abateri și 184 informative.

## Blocante (neexplicate) — cu diagnosticul C44

| id | linie | cifra | ce arată diagnosticul | propunerea |
|---|---|---|---|---|
| G1 | R7 Usurei | card 40 / GPS 37,4 (7,0 %, 17 zile) | Un singur autobuz (386PKP) și o singură variantă de drum: tur VEST 35,5, retur EST 37,4. C47 dă 94 %. | **Corecție directă 40 → 37,4** (−5,2 km/zi GPS). |
| G1 | R18 Zarojeni | 28,9 / 30,7 (5,9 %, 9 zile) | Doar 348KAJ, cu 4 variante de drum. Ocolul prin Țiplești/Heciul Vechi ~30. Combinații cu satele R32 între 34 și 55 km. Retur direct 22,5. Mediana tuturor picioarelor întregi e 30,1 (−4,0 %). | Q3; recomandarea: 30,7. |
| G1 | R24 Catranic | 30 / 28,3 (6,0 %, 3 zile) | **Urmă ruptă** la 224BZP: 16 din 37 picioare au km sub linia dreaptă poartă→capăt (21,6–23,6 km). Pe picioarele întregi mediana e 29,0, adică +3,4 % (bandă). | Cardul rămâne 30. Filtrul se adaugă în script (Q6); după el, G1 cade. |
| G1 | R27 Sturzovca | 24,9 / 46,5 (46,5 %, 8 zile) | **Fals pozitiv al filtrului de poartă.** Varianta scurtă are 84 % din picioare, între 22 și 27 km. Toate cele 8 zile bune sunt ale lui 727CWN, pe varianta lungă prin Limbenii Noi/Fundurii Noi (satele R11). Pe orice poartă mediana e 24,2. | **Corecția G1 NU se aplică**, iar cardul 24,9 rămâne. Urmează o explicație în registru și schimbarea de script #4 (Q1). |
| G1 | R36 Bocancea Schit | 54,5 / 46,2 (18,0 %, 7 zile) | Și aici 224BZP are urmă ruptă (7/37). Pe cele 30 de picioare întregi, returul de noapte s2 are 54,0, iar restul 45–47. Mediana e 48,6. | Q2; recomandarea: 48,6 (−11,8 km/zi). |

## Explicate (registru)
Registrul e hotărât pe sha-ul scheletului 43dcceaf6db7…, în dezbaterea din 26.09. X1 (registru mort): 0.
- **C31(a) R13 Hasnasenii Noi**: 71 de picioare, dintre care 66 în bucle rt; 744ARF; ≈ 9 km/zi neacoperiți. Diagnosticul meu adaugă că Hăsnășenii Noi apare în 44 % din cursele R14 Dominteni (Q8).
- **C31(a) R18 Putinesti**: date rare, 16 picioare. Diagnosticul meu adaugă că Putinești e atins în 92 % din picioarele de ~30 km ale R18 Zarojeni și în 64 % din cele ale lui 146BRAZ pe R32 Trifanesti (Q8).
- **C31(a) R27 Iabloana**: date rare, 5 picioare. Varianta lungă a Sturzovcăi nu trece prin Iabloana.

## Nou față de control-ideal.log și față de verificarea anterioară
- **Verificarea anterioară nu există** (aceasta este verificarea 1), deci `compara.mjs` nu are cu ce compara. Tabelul `linii` din `controale.json` e baza verificării 2.
- **Nici `control-ideal.log` nu există pe disc.** `lant.sh:22` trimite `control.mjs` doar în stdout, iar lanțul nu-l rulez.

Față de ce acoperă `control.mjs`, lucrurile noi sunt:
- G1 pe km GPS completați: 5 blocante;
- C47 cursă cu cursă: 6 linii sub 60 %;
- C4 cu efect: 880RNK și 350KAJ, cu efect nul pe schelet;
- V2: pe Trifanesti, ture/zi 2 → 4;
- D1 și D2 pe fereastra sursei;
- **în afara scriptului, din diagnostic:** urma ruptă (39 de picioare), filtrul de poartă care ascunde variante (R27, R3) și C22 fără constatare (4 linii).

## Linie cu linie — din act
| rută | linie | verdict | sursa, zile bune GPS | km card · GPS completat · dif | corecție | ture/zi · kmZi GPS | regim | porți tur/retur | C47 | controale căzute |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | Donduseni | **trece** | sept, 18 | 91.5 · 91.9 · -0.4 % | — | 1 · 183.8 | — | EST/EST | 97 % | — |
| R2 | Stolniceni | **trece** | sept, 16 | 67.3 · 67.9 · -0.9 % | — | 1 · 135.8 | — | VEST/EST | 94 % | — |
| R3 | Nihoreni | **abatere** | sept, 16 | 44.2 · 42.3 · 4.5 % | — | 2 · 169.2 | — | VEST/EST | 58 % | C47 |
| R4 | Grinauti | **trece** | sept, 32 | 26.4 · 25.6 · 3.1 % | — | 2 · 102.4 | — | EST/EST | 97 % | — |
| R5 | Alunis | **trece** | sept, 9 | 35.3 · 34.6 · 2 % | — | 1 · 69.2 | — | VEST/EST | 100 % | — |
| R6 | Mihailenii Vechi | **abatere** | sept, 5 | 55.7 · 58 · -4 % | — | 1 · 116 | — | EST/EST | 75 % | C22 (J) |
| R7 | Usurei | **blocant** | sept, 17 | 40 · 37.4 · 7 % | directă → 37,4 | 1 · 74.8 | — | VEST/EST | 94 % | G1 |
| R8 | Costesti | **trece** | sept, 19 | 81.5 · 78.5 · 3.8 % | — | 1 · 157 | — | VEST/EST | 97 % | — |
| R9 | Cobani | **abatere** | sept, 14 | 55.2 · 55.5 · -0.5 % | — | 2 · 222 | act EZ+D → GPS neclar; sursa «sept»: doar s1 · toată fereastra: neclar | VEST/EST | 100 % | D1 regim sursă ≠ total, D1 ≠ act |
| R10 | Ciuciulea | **trece** | sept, 28 | 67.7 · 66.5 · 1.8 % | — | 2 · 266 | — | EST/EST | 80 % | — |
| R11 | Funduri Vechi | **trece** | sept, 16 | 25.1 · 24.7 · 1.6 % | — | 1 · 49.4 | — | VEST/EST | 100 % | — |
| R11 | Limbenii Noi | **trece** | sept, 9 | 31.7 · 31.2 · 1.6 % | — | 1 · 62.4 | — | VEST/EST | 76 % | — |
| R12 | Pelinia | **trece** | sept, 37 | 26 · 26.4 · -1.5 % | — | 2 · 105.6 | — | EST/EST | 100 % | — |
| R12 | Sofia | **trece** | sept, 33 | 32.3 · 31.5 · 2.5 % | — | 2 · 126 | — | VEST/VEST | 99 % | — |
| R13 | Hasnasenii Noi | neverificabil | — | fără ideal | — | — | — | — | — | C31(a) explicat |
| R13 | Lazo | **trece** | toate, 22 | 16.5 · 16.4 · 0.6 % | — | 2 · 65.6 | — | EST/EST | 100 % | — |
| R14 | Baroncea | **trece** | sept, 27 | 45.9 · 44.4 · 3.4 % | — | 2 · 177.6 | — | EST/EST | 100 % | — |
| R14 | Dominteni | **trece** | sept, 54 | 34.5 · 34 · 1.5 % | — | 3 · 204 | act EZ → GPS ambele | EST/EST | 68 % | — |
| R15 | Suri | **trece** | sept, 8 | 69.5 · 70 · -0.7 % | — | 1 · 140 | — | VEST/EST | 96 % | — |
| R16 | Floresti | **trece** | toate, 13 | 36 · 35.7 · 0.8 % | — | 1 · 71.4 | act EZ+D → GPS rotatie | EST/EST | 100 % | — |
| R16 | Varvareuca | **trece** | sept, 35 | 41.4 · 42.8 · -3.3 % | — | 2 · 171.2 | — | EST/EST | 83 % | — |
| R17 | Prajila | **trece** | sept, 45 | 41.9 · 41.3 · 1.5 % | — | 3 · 247.8 | — | EST/EST | 83 % | — |
| R18 | Putinesti | neverificabil | — | fără ideal | — | — | — | — | — | C31(a) explicat |
| R18 | Zarojeni | **blocant** | sept, 9 | 28.9 · 30.7 · -5.9 % | diagnostic cerut (făcut; Q) | 2 · 122.8 | sursa «sept»: neclar · toată fereastra: rotatie | EST/EST | 41 % | G1, D1 regim sursă ≠ total, C47 |
| R19 | Bilicenii Vechi | **abatere** | sept, 25 | 17.3 · 17.3 · 0 % | — | 2 · 69.2 | act EZ+D → GPS rotatie; sursa «sept»: doar s2 · toată fereastra: rotatie | EST/EST | 81 % | D1 regim sursă ≠ total |
| R19 | Copaceni | **abatere** | sept, 25 | 33.7 · 32.7 · 3.1 % | — | 1 · 65.4 | act EZ+D → GPS neclar; sursa «sept»: rotatie · toată fereastra: neclar | EST/EST | 98 % | D1 regim sursă ≠ total, D1 ≠ act |
| R20 | Nicolaevca | **abatere** | sept, 28 | 40.3 · 39.6 · 1.8 % | — | 2 · 158.4 | act EZ+D → GPS neclar; sursa «sept»: ambele · toată fereastra: neclar | EST/EST | 100 % | D1 regim sursă ≠ total, D1 ≠ act |
| R20 | Radoaia | **trece** | sept, 37 | 27.1 · 26.1 · 3.8 % | — | 2 · 104.4 | — | EST/EST | 97 % | — |
| R21 | Heciul Nou | **trece** | sept, 39 | 20.3 · 20.7 · -1.9 % | — | 2 · 82.8 | — | EST/EST | 97 % | — |
| R22 | Tiplesti | **trece** | sept, 7 | 22.1 · 21.4 · 3.3 % | — | 1 · 42.8 | act EZ+D → GPS rotatie | EST/EST | 83 % | — |
| R23 | Scumpia | **trece** | sept, 21 | 61.4 · 59.5 · 3.2 % | — | 2 · 238 | — | VEST/EST | 97 % | — |
| R24 | Catranic | **blocant** | sept, 3 | 30 · 28.3 · 6 % | diagnostic cerut (făcut; Q) | 1 · 56.6 | — | VEST/EST | 51 % | G1, C47, C22 (J) |
| R25 | Hiliuti | **abatere** | sept, 9 | 32.4 · 32 · 1.2 % | — | 1 · 64 | — | EST/EST | 100 % | C22 (J) |
| R26 | Ilenuta | **trece** | sept, 7 | 39.8 · 38.8 · 2.6 % | — | 1 · 77.6 | — | EST/EST | 89 % | — |
| R26 | Obreja Veche | **trece** | sept, 15 | 38.8 · 38.4 · 1 % | — | 1 · 76.8 | — | VEST/EST | 100 % | — |
| R27 | Danu | **trece** | sept, 11 | 53.8 · 53.7 · 0.2 % | — | 1 · 107.4 | — | VEST/EST | 92 % | — |
| R27 | Iabloana | neverificabil | — | fără ideal | — | — | — | — | — | C31(a) explicat |
| R27 | Sturzovca | **blocant** | sept, 8 | 24.9 · 46.5 · -46.5 % | diagnostic cerut (făcut; NU se aplică) | 3 · 279 | act D → GPS ambele; sursa «sept»: neclar · toată fereastra: ambele | VEST/EST | 29 % | G1, D1 regim sursă ≠ total, C47, C22 (J) |
| R28 | Cuhnesti | **trece** | sept, 14 | 66.9 · 65.5 · 2.1 % | — | 1 · 131 | — | VEST/EST | 97 % | — |
| R29 | Ustia | **trece** | sept, 9 | 58.5 · 56.9 · 2.8 % | — | 1 · 113.8 | — | VEST/EST | 100 % | — |
| R30 | Cosernita | **trece** | sept, 18 | 65.8 · 63.8 · 3.1 % | — | 1 · 127.6 | — | EST/EST | 97 % | — |
| R31 | Cotiujenii Mari | **trece** | sept, 16 | 66.7 · 65.1 · 2.5 % | — | 1 · 130.2 | — | EST/EST | 100 % | — |
| R32 | Cainarii Vechi | **trece** | sept, 18 | 48.2 · 46.9 · 2.8 % | — | 1 · 93.8 | — | EST/EST | 79 % | — |
| R32 | Trifanesti | **abatere** | sept, 40 | 42.3 · 41.2 · 2.7 % | — | 2 · 164.8 | act D → GPS doar s1; sursa «sept»: ambele · toată fereastra: doar s1 | EST/EST | 42 % | V2 efect, D1 regim sursă ≠ total, D2 izolat, C47 |
| R33 | Iezarenii Vechi | **trece** | sept, 13 | 34.6 · 34.7 · -0.3 % | — | 1 · 69.4 | — | EST/EST | 96 % | — |
| R34 | Taura Veche | **trece** | sept, 18 | 41.7 · 40.7 · 2.5 % | — | 1 · 81.4 | — | EST/EST | 97 % | — |
| R35 | Cucioaia | **trece** | sept, 19 | 54.2 · 52.5 · 3.2 % | — | 1 · 105 | — | EST/EST | 100 % | — |
| R36 | Bocancea Schit | **blocant** | sept, 7 | 54.5 · 46.2 · 18 % | diagnostic cerut (făcut; Q) | 1 · 92.4 | — | EST/EST | 37 % | G1, C47 |
| R37 | Musteata | **trece** | sept, 10 | 44.6 · 43.5 · 2.5 % | — | 1 · 87 | — | VEST/EST | 100 % | — |
| R38 | Glinjeni | **trece** | sept, 13 | 34.3 · 33.3 · 3 % | — | 1 · 66.6 | — | VEST/EST | 100 % | — |
| R39 | Popestii de jos | **trece** | toate, 47 | 77.1 · 74.8 · 3.1 % | — | 1 · 149.6 | — | EST/EST | 97 % | — |

Săgeata (J) marchează controlul adăugat de judecata mea. C22: ziua aleasă nu e zi bună GPS; scriptul o arată doar în tabel.
Pe liniile R12 Pelinia, R12 Sofia și R16 Varvareuca, C4 e «sigur», dar efectul pe schelet e nul.

## Linii * — tabel separat

| rută | linie * | verdict | cifre |
|---|---|---|---|
| R1 | Tîrnova* | neverificabil | fără ideal (nicio candidată nu trece satele regulate (1 cu urmă)) · mașini 346KAJ (max 1 zile) · V5: regim «ambele» din 0 săptămâni complete |
| R2 | Cupcini* | trece | km 72.9 · kmZi 145.8 · ture/zi 1 · sursa sept · mașini 549RNK (max 12 zile) · C41(j): 549RNK |
| R3 | Recea* | trece | km 25.9 · kmZi 51.8 · ture/zi 1 · sursa sept · mașini 345KAJ (max 10 zile) · C41(j): 345KAJ |
| R3 | Rîșcani* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini — (max 0 zile) |
| R5 | Recea* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini — (max 0 zile) |
| R6 | Nicoreni* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini — (max 0 zile) |
| R7 | Recea* | neverificabil | fără ideal (nicio candidată nu trece satele regulate (1 cu urmă)) · mașini 386PKP (max 5 zile) · V5: regim «ambele» din 0 săptămâni complete |
| R7 | Slobozia* | neverificabil | fără ideal (nicio candidată nu trece satele regulate (1 cu urmă)) · mașini 386PKP (max 70 zile) · 386PKP 70 zile; cele 138 de salturi poartă→poartă atribuite un |
| R8 | Pîrjota* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini — (max 0 zile) |
| R9 | Glodeni* | trece | km 62.3 · kmZi 124.6 · ture/zi 1 · sursa sept · mașini 447ASB,397VKV (max 10 zile) · C41(j): 447ASB,397VKV |
| R9 | Hîjdieni* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 447ASB (max 23 zile) |
| R11 | Fundurii Noi* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 457BRAX (max 2 zile) |
| R11 | Sadovoe* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 457BRAX (max 4 zile) |
| R14 | Hăsnășenii Mari* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini — (max 0 zile) |
| R15 | Drochia* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini — (max 0 zile) |
| R16 | Mărășești* | trece | km 15.4 · kmZi 30.8 · ture/zi 1 · sursa toate · mașini 144BRAZ (max 9 zile) · C41(j): 144BRAZ |
| R16 | Mărculești* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 144BRAZ (max 3 zile) |
| R17 | Mărculești* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 713IZX (max 2 zile) |
| R18 | Gura Căinarului* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini — (max 0 zile) |
| R19 | Sîngerei* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini — (max 0 zile) |
| R20 | Drăgănești* | trece | km 36.5 · kmZi 73 · ture/zi 1 · sursa toate · mașini 041BRAU (max 44 zile) · C41(j): 041BRAU · D2 izolat: 3 zile izolate pe ambele schimburi (din 5; aceeași maș |
| R20 | Mîndreștii Noi* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 206BZP,041BRAU (max 1 zile) |
| R20 | Sacarovca* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 041BRAU (max 1 zile) |
| R21 | Alexăndreni* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 715IZX (max 1 zile) |
| R22 | Alexăndreni* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini — (max 0 zile) |
| R22 | Heciul Vechi* | trece | km 48.3 · kmZi 193.2 · ture/zi 2 · sursa toate · mașini 412BRAY (max 53 zile) · C41(j): 412BRAY · D2 ambele parțial: 2 săptămâni-bloc (2026-05-18:4, 2026-06-01: |
| R22 | Țipletești* | trece | km 21.5 · kmZi 43 · ture/zi 1 · sursa toate · mașini 412BRAY (max 12 zile) · C41(j): 412BRAY |
| R23 | Călugăr* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 446ASB (max 1 zile) |
| R23 | Fălești* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini — (max 0 zile) |
| R23 | Frumușica* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini — (max 0 zile) |
| R23 | Gara Fălești* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 446ASB (max 1 zile) |
| R27 | Sadovoe* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 727CWN (max 2 zile) |
| R28 | Balatina* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 760BXI (max 1 zile) |
| R29 | Petrunea* | neverificabil | fără ideal (nicio candidată nu trece satele regulate (1 cu urmă)) · mașini 457BRAX (max 5 zile) · V5: regim «ambele» din 0 săptămâni complete |
| R32 | Bezeni* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 146BRAZ (max 3 zile) |
| R32 | Frumușica* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 146BRAZ (max 1 zile) · apare în C38 (observații >140 km) |
| R33 | Bilicenii Vechi* | trece | km 18.5 · kmZi 37 · ture/zi 1 · sursa sept · mașini 725CWN (max 24 zile) · C41(j): 725CWN |
| R33 | Nicolaevca* | neverificabil | fără ideal (nicio candidată nu trece satele regulate (1 cu urmă)) · mașini 725CWN (max 3 zile) · V5: regim «ambele» din 0 săptămâni complete |
| R33 | Vrănești* | trece | km 22.7 · kmZi 45.4 · ture/zi 1 · sursa sept · mașini 725CWN (max 41 zile) · apare în C38 (observații >140 km) · C41(j): 725CWN |
| R34 | Bilicenii Vechi* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini — (max 0 zile) |
| R35 | Dumbrăvița* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 912RNK (max 31 zile) |
| R36 | Bobletici* | neverificabil | fără ideal (nicio candidată (nicio zi cu tur și retur la capăt)) · mașini 224BZP (max 1 zile) |

## Pe flotă — mașini
- **Dubluri (C4, treapta «sigur»):**
  - **350KAJ**: 18 perechi simultane în 4 zile (07–10.09), pe R16 Varvareuca. Al doilea dispozitiv raportează rar: 12–24 km față de 32–45. «Păstrează lunga» are efect nul. «Păstrează scurta» scade zilele bune de la 35 la 29 și e varianta greșită.
  - **880RNK**: 15 perechi în 12 zile, pe R12 Pelinia și Sofia, cu km aproape egali. Efectul e nul.
  - Treapta «de verificat» (C4): 0.
  - C37: 713IZX=763LYY, 7 curse din 184 (4 %), informativ.
- **Urma ruptă (nou):** 224BZP are 23 de picioare (R24 16, R36 7), 350KAJ 12, iar alte 4 mașini câte 1.
- **Salturi între porți (V6):**
  - 744ARF 17 zile, 386PKP 9 zile, iar 346KAJ, 412BRAY, 348KAJ și 350KAJ câte 1 zi;
  - pe flotă: 7.744 de salturi, dintre care 138 sunt atribuite unei linii, toate R7|Slobozia*.
- **Două autobuze pe o linie:**
  - R32 Trifanesti: 146BRAZ și 518MHD, în 35 din 42 zile×schimb (Q4);
  - R3 Nihoreni: EZ ~42 și D 186OMM ~52,6 (Q5).
- **Servire încrucișată:**
  - 727CWN: R27 cu satele R11;
  - 348KAJ: R18 cu satele R22 și R32;
  - 146BRAZ: R32 cu satele R18;
  - 518MHD: R32 cu satele R16.
- **Deplasări fără schimb la prânz (D7):** 211 observații (107 în sept): geamăn rt 114, goală 36, rt fără picior 4, rest 57. Cele regulate sunt 024XKY (R15 Suri 6 zile ~11:41, R12 Pelinia 11 zile ~11:20) și 446ASB (R23 Călugăr* 5 zile ~11:19). Toate merg la F4.
- **Ora:** fereastra 04.05–26.09 e inclusă în EEST, iar lanțul folosește UTC+3 fix, corect doar vara. Înainte de 25.10 trebuie trecut pe Intl. W53 e informativ. D5: 9.962 din 9.962 observații cad în ferestre.
- **Totaluri:**
  - C47: 85,8 % pe flotă (2.052/2.393);
  - G1: 5.875 km/zi GPS față de 5.843 pe card;
  - V3: 1 cheie.

Diagnosticul, cursă cu cursă, e în `diag/out-1.txt … out-7.txt`, iar scripturile în `diag/*.mjs`. Toate au rulat prin `diag.sh` ca `verif`, doar pe `<RUN>/in/`.
