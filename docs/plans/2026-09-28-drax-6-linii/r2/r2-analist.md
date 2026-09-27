# ION-112, runda 2 — uzina-analist («cercetează»): Q1, Q5, Q6, Q7 (+ pe scurt Q2–Q4)

Autor: uzina-analist, 27.09.2026. Nu am scris în bază și n-am schimbat nimic pe VPS.

Dovada nouă a rundei e **urma minut cu minut din tracker** (pg, tabela `track`, `w_date` citit ca UTC și trecut în Europe/Chisinau).
Scriptul `scratchpad/p112/leg.mjs` face asta:
- pe fiecare zi L–V și pe fiecare fereastră §3.2, ia vizita la poartă (la tur prima sosire în fereastră, la retur ultima plecare);
- caută opririle (v < 8 km/h, ≥ 20 s) în satele date, pe o rază R;
- măsoară km-ii pe urmă: la tur de la PRIMA oprire în sat până la poartă, la retur de la poartă până la ULTIMA oprire.

Ieșirile sunt tot în `scratchpad/p112/`:
- `leg-518.txt` (518MHD, 01–25.09);
- `leg-348.txt` (348KAJ, 17–25.09; înainte de 17.09 dispozitivul 2321 n-are puncte în tracker);
- `leg-nih.txt` (186OMM, 345KAJ, 457BRAX, 01–25.09);
- `cine-r17.txt` (cine oprește în satele R17 pe `curse-ideal` v4.3, plus rândurile din card v4.3 pentru R17 și R16).

## Q1 — Florești / Vărvăreuca (518MHD)

**518MHD NU oprește niciodată în Vărvăreuca.** În 01–25.09 a avut ~80 de curse la poartă și 0 opriri la ≤ 0,7 km de Vărvăreuca
(`leg-518.txt`). Oprește în Florești (≤ 0,9 km) aproape pe toate cele patru picioare, în fiecare zi:

| picior | ora la poartă | opriri | km pe urmă |
|---|---|---|---|
| tur s1 | 05:59–06:25 | Florești 05:27–05:38 | de la prima oprire la poartă **35,5–37,0** (mediană ~35,8) |
| tur s2 | 14:28–14:37 | Florești 13:52–14:06; uneori Mărculești înainte (așteaptă acolo 1,5 h, de la 12:09) | 35,2–40,8 |
| retur s1 | 15:52–15:59 | Florești 16:17–16:37, apoi acasă la Izvoare | — |
| retur s2 | 00:18–00:24 | Florești 00:39–00:54 | de la poartă la ultima oprire în Florești **32,0–34,6** |

Concluzii:
- **Ambele linii R16 NU sunt deservite de aceeași mașină.** 518MHD face R16 \| Florești, 2 perechi pe zi. R16 \| Vărvăreuca e a lui 350KAJ.
- Cele 57 de picioare 518MHD pe care v4.3 le-a mutat pe «R16 \| Vărvăreuca» ating Vărvăreuca doar în trecere (drumul Florești → Vărvăreuca
  → Mărculești → poartă) și sunt Florești.
- **Poziția: Florești 35,7 × 2** (lanțul dă 35,7, C47 100 %; mediana urmei la tur ~35,8, la retur ~33,5). Îmi retrag cifra 35,2 din
  runda 1 și mă aliniez cu verificatorul și cu business-ul. **Vărvăreuca 42,0 × 2** (350KAJ), nu × 3.
- Efectul pe card: Florești +71,4 km/zi, Vărvăreuca −84,0 km/zi, net −12,6.

## Q5 — Nihoreni: aceeași linie, două drumuri în sat

Km-ii pe urmă de la oprirea din Nihoreni la poartă, și înapoi (`leg-nih.txt`):

| mașină | picioare | km (min–max) | mediană |
|---|---|---|---|
| 186OMM (grupa D în sept.) | 31 | 44,7–47,6 | **45,2** (foarte stabil) |
| 345KAJ (EZ) | 16 | 39,9–42,3 (două abateri: 45,9 și 36,6) | **41,5** |
| 457BRAX | 16 | 40,9–47,0 | **43,2** |

- Diferența reală D ↔ EZ e **~3,7 km**, nu 10. Varianta D 51,8 (verificatorul) și cei 52 de km din runda 1 vin din tăierea la PRIMA
  atingere a Nihoreniului, înainte de bucla prin sat. Business-ul a spus-o deja: «186OMM atinge Nihoreni la 36,5 km, dar oprește acolo la 43,5».
- Pe urmă, oprirea D e mai adâncă în sat și cu o trecere în plus prin orașul Rîșcani. Satele sunt aceleași, capătul e același, iar fiecare
  grupă are un autobuz. Deci e **aceeași linie, cu două drumuri în sat**, nu două servicii.
- Un etalon pe grupă ar da 2 × 45,2 + 2 × 41,5 = 173,4 km/zi, față de 2 × 2 × 44,2 = 176,8 (−3,4). Mediana pe urmă a tuturor picioarelor
  e ~44.
- **Poziția: un card, 44,2 × 2** (sau 43,4, media grupelor; diferența e sub 2 %). Aliniat cu business-ul. **Nu** cu verificatorul pe 51,8:
  cifra lui ține de metoda tăieturii, nu de serviciu.
- Precedente:
  - LEAR Ungheni §6.2: «MEDIANA zilelor rămase, tur și retur la un loc»;
  - Florești §4.4: buclele de urcare sunt «muncă a rutei»;
  - Drăxlmaier §6.6: etalonul pe schimb doar «unde schimburile merg pe drumuri diferite»; aici diferența e de 8 %, iar grupele se rotesc.

## Q6 — Zarojeni (348KAJ), s1 față de s2

**Mă corectez față de runda 1.** Afirmația «retururile nu opresc la Zarojeni (2 din 96)» venea din `opr` extras, care unește opririle
(business-ul a arătat același lucru). Pe urmă, 17–25.09 (`leg-348.txt`):

**Săptămâna 21.09 (faza A: grupa EZ pe s2; Zarojeni e doar EZ în act):**
- tur s2: oprire în **Zarojeni 13:36–13:44** (99–417 s) → Gura Căinarului (opriri de 4–14 min; acolo e și casa mașinii) → poarta
  14:30–14:46. Km de la oprirea din Zarojeni: **27,7 / 27,8 / 28,0** (21, 23, 25.09). Pe 22.09 prima oprire e în Gura Căinarului
  (13:31), apoi Zarojeni 13:38.
- retur s2: poarta 00:15–00:19 → trece încet prin **Zarojeni la 00:32–00:37 pe 22, 23 și 24.09** (3 din 5 nopți) → acasă, în Gura
  Căinarului, la 00:38–00:44. Km de la poartă până acasă: 25,2–26,6, deci până la Zarojeni ~23,7–25.
- tur s1 și retur s1: **Țiplești, Țipletești, Heciul Vechi (R22), uneori Putinești**, fără Zarojeni. Km: tur 20,8–24,4; retur până acasă
  28,6–29,6. Sunt serviciul R22, nu R18.

**Săptămâna 14.09 (faza B: EZ pe s1):** pe 17.09 turul s1 pornește din Zarojeni (oprire de 6 min), 34,2 km. Turul s2 din 18–19.09
pornește din Gura Căinarului, cu 42–51 km pe alte sate. Rețin o limită: dispozitivul are puncte în tracker doar din 17.09, deci faza B
e văzută doar pe 3 zile.

**Poziția: 1 tură pe zi, cea a grupei EZ, care urmează rotația; card ≈ 27,7 × 1.**
- Tur 27,7–28,0; retur ~24–25. Diferența de ~12 % încape în cele 18 % ale §6.2, deci un singur card.
- Aliniat cu business-ul (27,7 × 1) și cu verificatorul pe o tură.
- Retururile care se opresc acasă, la Gura Căinarului, după Zarojeni: km-ii de la Zarojeni până acasă (~1,5 km) sunt livrare, nu linie.
- Picioarele D ale lui 348KAJ trec pe R22 / R21 / R32, cum a făcut v4.3.

## Q7 — lista «capăt atins prin parcare» după v4.3

| rând | pe GPS | poziția |
|---|---|---|
| 348KAJ Zarojeni | după mutările v4.3 rămân picioarele EZ, care opresc în Zarojeni (Q6) | **iese din listă** |
| 412BRAY Heciul Vechi\* | doar în mai, 0 picioare în sept. | **iese** |
| 727CWN Sturzovca | buclele au trecut pe R11 / R13 (v4.3) | **iese** |
| **763LYY Prajila** | vezi mai jos | **iese din listă, dar cu corecție de ture** |

**763LYY pe R17 Prajila** (`cine-r17.txt`):
- Oprește la **Lunga** pe toate picioarele (46–62), la Băhrinești și Mărculești uneori, la Prajila rar (1–7 din 32–52).
- În mai–iulie oprește în plus în satele R18: Putinești și Gura Căinarului, pe 24–27 de picioare.
- Deci face R17 cu oameni (Lunga, Băhrinești, Mărculești sunt sate R17), dar pornește de la Lunga, la ~2,9 km de Prajila. Nu e parcare,
  e serviciu (business: «se scoate»).

**Turele Prajila** (verificatorul: «3 față de 2 de verificat»):
- Linia o face 713IZX, cu oprire la Prajila pe practic toate picioarele: tur s1 57, tur s2 59, retur s1 57, retur s2 60; în sept. câte 13.
- 487NPL o face în 6 zile din septembrie, pe câte un picior din fiecare fel. 13 + 6 = 19 zile lucrătoare, deci îl **înlocuiește** pe
  713IZX, nu vine în plus.
- 763LYY e pe R17 în septembrie doar în 7–8 zile din 19; în rest e pe R30 Coșernița (7–9 picioare).
- Cu §6.3 (sursa septembrie), turele ies **2 pe zi**. Card v4.3: 41,3 × 3 = 247,8 km/zi; cu 2 ture: 165,2 (−82,6).
- De confirmat cu `card-gps.mjs` pe septembrie (M1). Picioarele 763LYY de la Lunga nu intră în km-ii Prajila: pornesc cu ~4 km mai aproape.

## Pe scurt, Q2–Q4
- **Q2 Trifănești: 40,2 × 2, steagul se închide.** Aliniat cu toți.
- **Q3 Sturzovca: 23,9, × 2.**
  - Îmi retrag «× 3» din runda 1. După ce buclele 727CWN au ieșit, mașinile în plus pe același schimb în septembrie sunt sub jumătate din zile:
    804MUM 5 zile, 397VKV 8, 441ASB 5–9 picioare.
  - Aliniat cu verificatorul și business-ul (× 2), cu condiția ca `card-gps.mjs` pe septembrie să dea 2.
- **Q4 Bocancea Schit: 53,3.** Regula §6.3 cere ≥ 3 zile bune în septembrie; sunt 4, deci sursa e septembrie. Aliniat cu business-ul. Cei 54,5
  ai verificatorului sunt cardul vechi (+2 %).

## Matricea mea după runda 2

| Q | poziția | aliniat cu |
|---|---|---|
| Q1 Florești | 35,7 × 2; picioarele 518MHD de pe «Vărvăreuca» sunt Florești; Vărvăreuca × 2 | verificator + business (pe Florești × 2); mutarea pe Vărvăreuca din v4.3 e nouă și greșită (**H1**) |
| Q2 | 40,2 × 2 | toți |
| Q3 | 23,9 × 2 | verificator + business |
| Q4 | 53,3 × 1 | business (verificatorul: 54,5) |
| Q5 | 44,2 × 2 (un card) | business; NU verificatorul (51,8 = tăietură la atingere) |
| Q6 | 1 tură, ≈ 27,7 | business; verificatorul pe o tură |
| Q7 | lista se golește; turele Prajila 3 → 2 (sept.) | business pe listă; verificatorul pe «de verificat» turele |

## Observații (rubrica comună)

**H1 — high, −2,0 (defect de logică în candidat): v4.3 mută 57 de picioare 518MHD pe R16 \| Vărvăreuca.**
- Pe urmă, 518MHD nu oprește niciodată în Vărvăreuca: 0 din ~80 de curse, 01–25.09.
- Scenariu, cu v4.3 sigilat așa:
  - cardul Vărvăreuca iese × 3 (252 km/zi) în loc de × 2 (168), deci +84 km/zi;
  - Florești rămâne × 1 (71,4) în loc de × 2 (142,8), deci −71,4;
  - analiza săptămânală (etichetele din `obs`) pune jumătate din cursele lui 518MHD pe o linie pe care n-o deservește.
- Dovada: `leg-518.txt` (opriri «Floresti …» pe fiecare picior, nicio «Varvareuca») și `runda-2.md` («R16 Vărvăreuca 57»).
- Corecția: decizia de grafic «518MHD → R16» se ia pe **R16 \| Florești** (capătul din act e Florești, iar el oprește acolo). Test: 0 picioare
  518MHD pe Vărvăreuca în `obs` v4.3, iar Florești măsurat × 2.

**M1 — medium, −1,0 (date de reprodus): turele Prajila × 3 vin din toată fereastra.** În septembrie, 487NPL îl înlocuiește pe 713IZX, iar
763LYY e pe R17 în 7–8 zile din 19. Corecția: `card-gps.mjs` pe sursa septembrie pentru ture (§6.3 pe km, §6.5 pe ture, aceeași sursă).

**M2 — medium, −1,0 (metodă): tăietura la PRIMA atingere a capătului umflă liniile cu buclă în sat.** Nihoreni D: 51,8 față de 45,2 pe oprire.
Același efect poate apărea la orice linie al cărei capăt are o buclă de urcare (Bocancea: ramurile). Corecția: pentru card, verificatorul să
măsoare de la PRIMA OPRIRE în capăt (la tur) sau până la ULTIMA (la retur), ca în `leg.mjs`, și să arate diferența pe toate cele 48 de linii.

**L1 — low, −0,5:** proba Zarojeni pe tracker acoperă doar 17–25.09 (dispozitivul 2321 n-are puncte înainte). Faza B are doar 3 zile.

**Scor: 10 − 2,0 − 1,0 − 1,0 − 0,5 = 5,5. Blocante (high): 1 (H1).**
