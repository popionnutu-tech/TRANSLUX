# ION-120 r2: uzina-analist, cele 4 reguli măsurate după specificația unică (runda-2.md)

**Surse.** Rândul săptămânii 14–20.09, rescris pe 28.09 07:31 UTC după ION-119. Fișierele sunt pe VPS, în `/root/lde-worker/drax/date/saptamanal/2026-09-14/`:
- `economie-zile.json` (md5 b89bd379): 195 de zile-mașină și 38 de mașini; «cursă între uzine» e categoria `intreUzine`;
- `economie.json` (md5 3988213e): eșantionul §8.6, adică 159 din cele 189 de zile L–V, plus casa fiecărei mașini;
- `analiza.json`: lista «de lămurit» (024XKY, livrarea L–J).

Scheletul e `ideal-activ → ideal-v4.3` (capătul, locurile și `masini[]` pe fereastra scheletului). Valhalla s-a folosit prin `kmDrum` din comun.mjs, pe o copie a cache-ului (`ECON_D=/tmp/ion120r2/d`), cu 0 răspunsuri null. Nu am scris nimic în bază și n-am atins codul de pe VPS.

**Scriptul** e `r2/patru-reguli-v2.mjs` și rulează în 25 s. Listele complete sunt în `r2/patru-reguli-v2-2026-09-14.json`:
- `liste.nopti` (157 de nopți mașină–noapte, cu starea fiecăreia);
- `reconciliere`, `jumatatiWeekend`, `R2`, `R4`, `proba`;
- `R3.program` (pe mașină, zi și schimb), `R3.propuse`, `R3.top30`, `R3.capacitate`.

**Unitățile.** Km sunt pe săptămână, măsurați pe eșantion. Extrapolarea se face pe zile-mașină, ca la B: × 189/159 = × 1,1887.

## Pe flotă (fiecare regulă separat, fără dublă numărare)

| regula | proprietarul | măsurat (eșantion) | extrapolat | în afara totalului |
|---|---|---|---|---|
| R-1 capăt în aceeași localitate | livrare la margine, fără gol impus | **789,6** (37 de nopți) | **939** | Bălți §7.4: 10 nopți / 591,7 · weekend: 1 / 9,4 · jumătăți de weekend nemăsurabile: 65 / 990 |
| R-2 rămâne la uzină | golTure, plafonul §8.3 | **0** | **0** | nelămurit **186,4** (toate cele 5 bucăți sunt fără oprire ≥ 20 min afară: 293QVT 159,8, 146BRAZ 26,6) |
| R-4 nu pleacă acasă | livrare cu ocol (ION-115) | **2.713,1** (214 bucăți) | **3.225** | — |
| **R-1 + R-2 + R-4** | | **3.502,7** | **4.164** | |
| R-3 rute împărțite altfel | marginile rămase, Valhalla pe ambele părți | **+138,6** net pe 2 schimburi | fără extrapolare (toate zilele L–V) | separat, cu semn: pierderi −141,9 |

**Proba.**
- Pe mașină, 38 din 38 trec condiția R-1 + R-2 + R-4 ≤ livrare + golTure + golRuta + legătură (pe eșantion).
- Pe bucăți, 276 de bucăți au un singur proprietar: R-1 are 62, R-2 are 0, R-4 are 214. Scriptul se oprește dacă o bucată ajunge la două reguli, și nu s-a oprit.
- R-4 = R1b din `economie.json` (2.713,1), deci cele două se potrivesc.
- R-4 nu are nicio bucată pe tur→retur. Ocolul stă numai pe tur→tur (49 de bucăți / 368,4 aceeași linie, 59 / 852,8 linii diferite) și pe retur→retur (46 / 434,1 aceeași linie, 60 / 1.057,8 linii diferite).
- Unde așteaptă mașina: la capăt 1.221,2 km, la uzină 1.491,9 km.

## R-1 pe cheia mașină–noapte (157 de nopți: 151 de lucru, 6 spre sâmbătă)

**Stările nopților:**

| starea | nopți | km margini |
|---|---|---|
| ELIGIBIL | 48 | 1.783,6 |
| turul pornește din altă localitate | 75 | 2.599,6 |
| doarme deja la X (≤ 2,5 km) | 26 | 133,5 |
| ziua nu se termină cu retur | 4 | 381 |
| ziua următoare nu începe cu tur | 2 | 60,7 |
| locul nopții necunoscut | 2 | 55,9 |

Din cele 48 eligibile, 10 sunt în Bălți și una e weekend. În total intră 37 de nopți: 1.182,5 km pe toate zilele, **789,6** pe eșantion. La 8 nopți a ieșit o jumătate. Cea mai mare pierdere e 386PKP: 4 nopți × 82 km, cu toate zilele §8.6 «jumătate probabil nedetectată».

**Reconcilierea.**
- **Business 50 / 1.839,5 = spec 48 / 1.783,6 + cele 2 nopți cu locul necunoscut (55,9 km).** Diferența se închide exact: 346KAJ 16→17 (7,2 + 10,7) și 725CWN 18→19 (4,6 + 33,4).
- Citirea business emulată pe rândul nou (retur–tur ≤ 2,5 km, fără capătul din schelet) dă aceleași 48 de nopți ca spec. Nu există nicio diferență de cheie.
- Față de analistul din r1 (74 / 1.925,6), pe cheie:
  - 47 de nopți sunt aceleași, cu aceiași km (1.774,2);
  - 26 sunt acum «deja la X» (133,5): cele 25 din r1 plus 826GXP 15→16, care stă la 1,5–2,5 km;
  - 1 are locul nopții necunoscut (346KAJ, 17,9);
  - 1 e nouă: 146BRAZ vineri → sâmbătă (9,4, weekend). r1 lua numai nopțile spre L–V.
- ION-119 nu schimbă km-ii R-1 pe aceste nopți.

**Pe mașină (eșantion):**

| mașina | km | nopți | X | locul nopții față de X |
|---|---|---|---|---|
| 518MHD | 155,2 | 4 | Florești | 15,6 km |
| 710CWN | 148,8 | 4 | Lazo | 6,3 km |
| 346KAJ | 115,7 | 3 | Dondușeni | — |
| 713IZX | 108,3 | 4 | Prajila | — |
| 402VKV | 98,3 | 4 | Cobani | — |
| 146BRAZ | 37,7 | — | — | — |
| 715IZX | 37,2 | — | — | — |
| 041BRAU | 35,7 | — | — | — |
| 763LYY | 30,7 | — | — | 19,2 km |
| 446ASB | 22 | — | — | — |

Pe toate zilele, 386PKP ar avea 328,3 km, dar pe eșantion are 0.

Nopțile în Bălți sunt în afara totalului: 144BRAZ (Glinjeni, 3 nopți × 58), 435ASB (Tăura Veche, 3 × 74) și 804MUM (Țiplești, 4 × 48,3).

**Exemple:**
1. 346KAJ, noaptea 15→16: retur R1 la Dondușeni (0 km de capăt) la 01:46, tur din Dondușeni la 13:13. Mașina doarme la 5 km. Economia: 7,2 + 72,0 = **79,2**.
2. 518MHD, noaptea 16→17: retur R16 la 00:40, tur la 05:31. Mașina doarme la 15,6 km. Economia: 24,4 + 21,7 = **46,1**.
3. 518MHD, noaptea 15→16: **43,7**.

## R-2 (eligibilitatea fără filtrul §8.3, plafonul păstrat)
- Sunt 26 de bucăți golTure, toate în eșantion. Au 589,0 km de gol, din care 186,4 în afara zonei uzinei.
- După plafon rămân **0 km**, pentru că niciuna n-are o oprire ≥ 20 min în afara zonei. Toți cei 186,4 km sunt «nelămurit fără oprire».
- Cazurile: 293QVT pe R31 Cotiujenii Mari, 14–17.09 (4 × ≈ 40 km afară) și 146BRAZ pe R32, 17.09 (26,6 km).

## R-3 (schimb complet A ↔ B, cost Valhalla pe marginile neacoperite de R-1)

**Baza de calcul.**
- Sunt 703 perechi posibile. Capacitatea respinge 66, iar 637 sunt fezabile. Capacitatea înseamnă cea mai mare clasă de linie dusă în fereastra scheletului, măcar într-o zi.
- Costul de azi e 3.842,6 km pe Valhalla, față de 4.443,6 pe GPS pe aceleași margini. GPS iese cu 16 % peste.
- Nopțile pe care programul le are cu același X au cost 0 pentru orice mașină. Asta face economia incrementală după R-1.

**Rezultatul.** Doar 2 perechi trec pragul net ≥ 50 km pe săptămână. Ambele au o mașină pe minus.

| schimbul | net | câștigul fiecăreia | capacitate | zile §8.6 |
|---|---|---|---|---|
| 386PKP (R7 Ușurei s2) ↔ 549RNK (R2 Stolniceni s1 + R5 Aluniș s2) | **+78,4** | 386PKP −20,3, 549RNK +98,7 | 386PKP a dus o linie de 50 locuri < 3 zile; cu pragul ≥ 3 zile capacitatea lui e 20 < 27, deci schimbul **cade** | 5 + 5 zile excluse |
| 446ASB (R23 Scumpia s1 + s2) ↔ 925FTI (R26 Ilenuța s1 + R37 Musteața s2) | **+60,2** | 446ASB −121,6, 925FTI +181,8 | 50/50, ok și cu ≥ 3 zile | 0 |

- Nu există niciun schimb fără pierderi care să ajungă la ≥ 50 km.
- Următoarele perechi sunt sub prag: 186OMM↔880RNK 49,9 (+229,5 / −179,5), 713IZX↔763LYY 32,4, 024XKY↔826GXP 28,9.
- Programul pe zi și schimb al fiecărei mașini e în JSON, la `liste.R3.program`.

## Întrebări pentru Ion (cu cifrele)
1. **R-1 cu noaptea în Bălți:** 144BRAZ, 435ASB și 804MUM dorm la uzină, la 20–26 km de capătul X. Au 10 nopți și 591,7 km/săpt. Mașina se lasă la X, deci ajung în total (+592 măsurat), sau rămân separat, cum spune §7.4?
2. **R-1, mașina la ≥ 15 km de X:** 518MHD (15,6 km), 763LYY (19,2) și 386PKP (26,7 km, 328 km pe toate zilele). Aici șoferul trebuie adus acasă (§5.10). Se propune?
3. **R-2:** după plafon dă 0, iar 186,4 km rămân nelămuriți la 293QVT și 146BRAZ, fără nicio oprire. Păstrăm plafonul §8.3, adică R-2 = 0 pe săptămâna asta?
4. **R-3:** rămâne un singur schimb real, 446ASB ↔ 925FTI (net +60, dar 446ASB pierde 122 km pe săptămână). Se propune așa, cu pierderea arătată, sau R-3 se propune doar fără pierderi, adică 0 pe 14.09? Capacitatea din «a dus o dată linia» ține, sau cerem ≥ 3 zile? Cu ≥ 3 zile cade 386PKP ↔ 549RNK.

## Scorul de claritate: 10 − Σ = 7,5
- −1,0: R-1 depinde de răspunsul pentru Bălți (±592 km).
- −1,0: R-3 are un singur schimb, cu pierdere la o mașină, iar capacitatea se sprijină pe «dusă o dată».
- −0,5: 65 de jumătăți de weekend (990 km) nu se pot măsura în fereastra de o săptămână. Luni 14 și vineri 18 n-au perechea lor.
