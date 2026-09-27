# ION-112, runda 3 — uzina-analist («cercetează»): pozițiile finale Q5, Q6, Q4, Prajila, H4

Autor: uzina-analist, 27.09.2026. Nu am scris în bază, n-am schimbat scheletul și n-am rulat lanțul.

**Regulile folosite:** `lde_uzine.reguli_livrare` Drăxlmaier, `reguli_livrare_la` 2026-09-27 18:22:08 UTC, md5 `1cfc6c53…`:
- §2.3 — grupele și alternanța, ancora 21.09 = faza A;
- §4.1, §4.2, §4.5 — capătul și oprirea;
- §6.2, §6.3, §6.5 — mediana zilelor bune, sursa septembrie, turele măsurate.

Convenția cardului e `plinC = plin + raza porții`, din `2026-09-26-schelet-verificator/cod/etalon-gps.mjs:37`. Raza porții EST e 0,6 km.

## Metoda și ce retrag

**Accept C1 (Codex).** `leg.mjs` din runda 2 compara viteza în noduri cu pragul de 8 km/h. Retrag toate cifrele «la oprire» din r2:
- tabelul Nihoreni pe mașini (45,2 / 41,5 / 43,2);
- afirmația «348KAJ trece încet prin Zarojeni la 00:32–00:37»;
- mediana 33,5 a returului Florești.

Pe viteza reală, niciuna dintre ele nu se confirmă.

**Dovada nouă** e urma din trackerul pg, cu viteza în noduri × 1,852 și `w_date` ca UTC. Opririle sunt la < 8 km/h real și durează ≥ 20 s. Scripturile și ieșirile sunt în `scratchpad/p112r3/`:
- `r3.mjs` — ziua mașinii tăiată în picioare poartă↔poartă, cu toate opririle, satul OSM și eticheta obs v4.3; rezultatul e în `p112r3-out.json`, iar `arata.mjs` îl afișează;
- `r3b.mjs` + `zone.json` — pe fiecare picior obs v4.3 al celor trei linii, plus toate picioarele lui 763LYY, 348KAJ, 713IZX și 487NPL: prima oprire (la tur) sau ultima (la retur) în fiecare zonă a capătului, cu km pe urmă până la FIECARE poartă (marginea razei și punctul cel mai apropiat de centru); rezultatul e în `p112r3b-out.json`;
- ieșirile: `sum-nihoreni.txt`, `sum-zarojeni.txt`, `sum-prajila.txt`, `tab-prajila.txt` (tabelul zilnic din septembrie), `leg-348-r3.txt`.

## Q5 Nihoreni (R3) — ACORD: 44,2 × 2, un card

1. **Diferența D/EZ din export e diferența de POARTĂ, nu de grupă.**
   - Turul EZ intră întâi pe poarta VEST: 345KAJ 9/9 și 457BRAX 9/9, apoi merge pe EST după ~10 min.
   - Turul D (186OMM) intră doar pe EST, 19/19.
   - `export-r3.mjs` ia «prima poartă atinsă», deci compară EZ→VEST cu D→EST.
2. **Pe aceeași poartă și în același punct, cele două grupe merg pe același drum.** Punctul comun e nodul de pe șoseaua principală, (47.9486, 27.5665), la 1,08 km de capăt. Km până la centrul porții EST:

| | D (186OMM) | EZ (345KAJ) | EZ (457BRAX) |
|---|---|---|---|
| tur, nod → EST | **44,6** (n9) | **45,0** (n6) | 46,0 (n3) |
| retur, EST → nod | **39,0** (n7) | **38,9** (n3) | 42,5 (n3) |

3. **Punctul real de pornire e același pentru ambele grupe:** Rîșcani-Vest, (47.9504, 27.5452), la 1,7 km de capătul «Nihoreni».
   - D pornește de acolo în 17 tururi din 19 și așteaptă 13–25 min înainte de plecare. Până la EST sunt 50,3 km.
   - EZ (345KAJ) pornește de acolo în 6 tururi din 9 și așteaptă 5–7 min. Până la EST sunt 48,2 km, până la VEST 42,7 km.
4. **Returul nu se termină în capăt:**
   - D coboară ultimii oameni în Rîșcani-NE/E, la 54,1–55,2 km de EST (12 din 19);
   - EZ se termină la nod sau în Rîșcani-V, apoi mașina merge acasă, la Zăicani.
   - De aceea exportul prinde rar oprirea la ≤ 0,8 km de capăt la retur.
5. **Turele:** în septembrie sunt 2 pe zi — o pereche D (186OMM) și o pereche EZ (345KAJ, apoi 457BRAX).

**Poziția: 44,2 × 2, un card** (§6.1: scheletul e al liniei).
- De la oprirea din capăt, la tur: D 46,0 până la centrul EST, EZ 42,0 până la centrul VEST. Media e 44,0.
- 44,2 e la 0,5 % de această medie și în ±5 % de tot plicul măsurat.
- Nu există două servicii. Etalon pe grupă (§6.6) nu se justifică.
- **Întrebare pentru Ion** (nu se decide aici): Rîșcani-Vest îndeplinește la tur criteriul §4.1 «capăt dincolo de Starting point». Satul e în numele rutei, e punctul de pornire al ambelor grupe și are așteptare înainte de tur. La retur însă îl îndeplinește doar parțial: EZ 3 din 19, D se termină în alt capăt al orașului. Dacă Ion îl face capăt, linia ar crește la ~48–50 km.

## Q6 Zarojeni (R18) — 1 tură; card 28,5 (28,9 acceptabil, nu blochează)

348KAJ, 17–25.09. Trackerul are puncte doar din 17.09. Detaliile sunt în `leg-348-r3.txt`.

**Turul EZ** (21, 22, 23, 25.09, faza A, s2):
- 348KAJ pleacă de acasă, din Gura Căinarului (31–33 km de EST, unde stă parcat 5–6 h);
- oprește în Zarojeni, la (47.8682, 28.1555), 0,72 km de capăt, 99–397 s, la 13:37–13:44;
- apoi oprește în Gura Căinarului 3–14 min și ajunge pe EST la 14:30–14:35;
- km de la oprirea din Zarojeni: **27,8 / 27,9 / 27,8 / 28,0 până la marginea razei EST, 28,3–28,4 până la centru**;
- pe 24.09 a ocolit: 39,7 km.

**Returul EZ s2 NU ajunge în Zarojeni** (0 din 5 nopți pe viteza reală):
- pleacă de pe EST la 00:15–00:19 și merge direct acasă, în Gura Căinarului, la 26,3–27,5 km, unde parchează ~2 h 15 min;
- casa e la 1,34 km de capăt, deci peste raza de 1,2 km a §4.2;
- lanțul taie acest retur la 21,9–22,0 km (`plin`), ceea ce nu e o măsurătoare a liniei.

**De unde vin 28,9 și 29,5:**
- 28,9 e «card vechi (decizie v3)» (`card.decizie.metoda = card-vechi`), nu o măsurătoare a acestui serviciu;
- etalonul nou al lanțului, 29,5, amestecă zilele s1 17–18.09 și 25.09. Pe 25.09 turul s1 etichetat R18 oprește în Putinești și Țiplești, fără Zarojeni, adică pe drumul R22.

**Poziția: 1 tură pe zi (grupa EZ, urmează rotația); card 28,5 = 27,9 (median, de la oprire la marginea EST) + 0,6 (raza EST).**
- E aceeași convenție `plinC` ca la celelalte 47 de linii. Cele 27,8 din export sunt până la marginea razei, fără rază, deci nu se compară cu celelalte carduri.
- 28,9 diferă cu 1,4 % (0,8 km/zi): îl accept dacă majoritatea îl vrea, nu e blocant.
- Returul nu intră în km: nu atinge capătul. Drumul poartă → casă e al mașinii (navetă/livrare), nu al liniei.

**Dovada că e o singură tură: 763LYY a făcut exact același serviciu înainte ca trackerul lui 348KAJ să aibă puncte.**
- Oprirea din Zarojeni e în același punct, (47.8682, 28.1555), la 27,8–28,1 km de EST.
- Zilele: tur s2 pe 07, 08, 10 și 11.09 (faza A); tur s1 pe 15 și 18.09 (faza B). Pe 17.09 serviciul l-a făcut 348KAJ.
- În fiecare zi o singură mașină face perechea EZ Zarojeni. v4.3 a etichetat aceste picioare ale lui 763LYY drept «R17 Prajila» (vezi mai jos).

## Q4 Bocancea Schit (R36) — 53,3 × 1 (neschimbat)

- §6.3 din textul curent: «Sursa = septembrie, dacă are ≥ 3 zile bune».
- În cardul v4.3, `zileBuneGPS` = 4, `sursaEtalon` = sept, `etalonGPS` = 53,3 și C47 = 95 %.
- Cele 54,5 sunt `km` din cardul vechi, cu +2,2 %. Pragul de 5 % nu e o regulă de păstrare a cardului vechi (aici sunt de acord cu Codex).
- N-am o măsurătoare nouă de urmă pe această linie.

## Prajila (R17) — × 2; «a treia pereche» a lui 763LYY NU e Prajila

Tabelul zilnic din septembrie e în `tab-prajila.txt`, cu ora la poartă și zonele cu oprire pe fiecare picior.

1. **713IZX și 487NPL fac împreună exact o mașină pe zi, pe ambele schimburi, deci 2 perechi pe zi.**
   - 487NPL face 01–03.09 și 10.09;
   - 713IZX face 07, 08, 14–18 și 21–25.09;
   - pe 04, 09 și 11.09 predau mașina la mijlocul zilei (de ex. 09.09: 713IZX tur s1, apoi 487NPL retur s1 + s2). Zilele sunt disjuncte.
   - Oprirea în Prajila, la (47.8437, 28.2006), e pe TOATE picioarele: 713IZX D tur 14/14, D retur 13/13, EZ tur 12/12, EZ retur 13/13; 487NPL tur 5/5 + 7/7.
2. **763LYY nu oprește în Prajila în nicio zi lucrătoare din septembrie.** Excepția e sâmbăta 05.09: tur s2 239 s, retur 20 s.
   - «Lunga» lui 763LYY e **casa lui**, la (47.8558, 28.2338), 2,46 km de capătul Prajila: parchează acolo 3,5–6 h ziua și noaptea. §4.1 și §4.2 spun că drumul de acasă nu face capătul.
   - Picioarele etichetate «R17 Prajila» în v4.3 sunt de fapt:
     - **serviciul R18 Zarojeni / Gura Căinarului** — oprire în Zarojeni la 0,72 km de capătul R18: 07, 08, 10, 11, 15 și 18.09; doar Gura Căinarului: 01–04, 14 și 16.09;
     - **un serviciu prin Moara de Piatră** (sat din afara R17 și R18), din 21.09: oprire de 20–27 min la 23,7 km de EST pe 21–25.09;
     - drumul spre casă, la Lunga, fără oameni în satele R17.
3. §6.5 numără perechile (schimb, mașină). Pe septembrie, fără picioarele greșit etichetate ale lui 763LYY, **ture pe zi = 2**.
4. **Km: 41,3 (card v4.3) — ACORD.**
   - Pe urmă, de la oprirea din Prajila până la marginea EST: 713IZX D tur 41,8, D retur 41,8, EZ tur 40,2, EZ retur 39,5; 487NPL între 40,4 și 41,9. Mediana ~40,9, plus raza 0,6, dă ~41,5.
   - D ≈ EZ + 1,5 km, deci un singur card (§6.1).

**Poziția: 41,3 × 2 = 165,2 km/zi**, adică −82,6 km/zi față de × 3.

## H4 — capăt atins prin parcare sau cursă cu oameni

| rând | pe urmă (viteza reală) | poziția |
|---|---|---|
| **348KAJ Zarojeni** | Turul EZ oprește 99–397 s în Zarojeni, la 0,72 km de capăt, DUPĂ ce pleacă de acasă (Gura Căinarului, parcare de 5–6 h), apoi urcă oameni în Gura Căinarului: 5 zile din 5 (21–25.09), plus 17.09 s1. Parcarea e acasă, nu în capăt. Returul s2 nu atinge Zarojeni (0/5). | **IESE din H4** (clasa «capăt atins prin parcare»). Rămâne o notă: returul nu ajunge în capăt, deci km-ii cardului vin din tur (Q6). |
| **763LYY Prajila** | 0 opriri în Prajila în zilele lucrătoare din septembrie; «Lunga» e parcarea de acasă (2,46 km de capăt). Picioarele «R17» sunt R18 Zarojeni / Gura Căinarului sau Moara de Piatră. | **IESE din H4 ca rând R17**, dar NU fiindcă ar fi un serviciu R17 legitim, ci fiindcă nu e deloc serviciu R17. Corecția e în obs: relabel, vezi O2. Retrag formularea mea din r2, «face R17 cu oameni, pornește de la Lunga»: pe viteza reală, opririle «de la Lunga» sunt parcarea. |
| 412BRAY Heciul Vechi\* | 0 picioare în septembrie (runda 2) | iese (acord cu Codex) |
| 727CWN Sturzovca | buclele au trecut pe R11/R13 | iese (acord) |

## Matricea mea finală

| linie | poziția | față de runda 2 |
|---|---|---|
| Florești R16 | 36,5 × 2 (lanț v4.3) | aliniat cu Codex; retrag 35,7 (proba mea era în noduri) |
| Vărvăreuca R16 | 42,8 × 2 | aliniat |
| Trifănești R32 | 40,2 × 2 | aliniat |
| Sturzovca R27 | 23,9 × 2 | aliniat |
| Bocancea R36 | 53,3 × 1 | neschimbat |
| Nihoreni R3 | 44,2 × 2, un card | neschimbat; motivul corectat: D/EZ = poarta, nu grupa |
| Zarojeni R18 | 28,5 × 1 (28,9 acceptabil) | 27,7 → 28,5 (convenția `plinC`) |
| Prajila R17 | 41,3 × 2 | neschimbat; dovada: 763LYY nu e pe R17 |
| H4 | 348KAJ iese; 763LYY iese ca R17 cu relabel în obs; 412BRAY iese; 727CWN iese | cu dovada pe viteza reală |

## Observații (rubrica comună)

**O1 — medium, −1,0 (metodă, export-r3):** tăietura D/EZ din export compară porți diferite (EZ intră întâi pe VEST).
- La același punct și aceeași poartă, D și EZ diferă cu ≤ 0,4 km (tabelul de la Q5).
- Corecția: orice comparație pe grupe se face pe poarta cardului («poarta sensului»), nu pe «prima poartă atinsă».

**O2 — medium, −1,0 (candidat v4.3, etichete obs):** picioarele lui 763LYY etichetate «R17 Prajila» nu ating nicio localitate R17 în afară de casa lui (Lunga), prin parcare.
- Ce acoperă ele de fapt: serviciul R18 Zarojeni (07–18.09) și Moara de Piatră (21–25.09).
- Scenariu: dacă se păstrează așa, cardul Prajila iese × 3 (+82,6 km/zi), iar analiza săptămânală pune pe R17 curse fără sate R17.
- Corecția: turele Prajila = 2; picioarele 763LYY cu oprire în Zarojeni trec pe R18 Zarojeni; cele prin Moara de Piatră se clasifică separat, pe ruta satului.
- Rămâne medium doar cu × 2 adoptat. Cu × 3 ar fi high.

**O3 — low, −0,5 (întrebare pentru Ion):** Nihoreni pornește în realitate din Rîșcani-Vest, la 1,7 km dincolo de capăt, la ambele grupe (§4.1, excepția ION-110). La retur criteriul e îndeplinit doar parțial. Nu schimb cardul, ridic întrebarea.

**O4 — low, −0,5 (măsurătoare pe un sens):**
- Zarojeni: returul nu atinge capătul, iar cardul vine din tur (5 zile).
- Nihoreni și Prajila: returul se termină rar la ≤ 0,8 km de coordonata capătului.
- Corecția: §6.2 «ajunge la capăt în ambele sensuri» trebuie aplicat cu raza §4.2 (1,2 / 2,5 km), nu cu raza opririi (0,8).

**O5 — low, −0,5:** 348KAJ are urmă doar din 17.09. Faza B se vede doar prin 763LYY (15 și 18.09).

**Scor: 10 − 1,0 − 1,0 − 0,5 − 0,5 − 0,5 = 6,5. Blocante (high): 0.**
