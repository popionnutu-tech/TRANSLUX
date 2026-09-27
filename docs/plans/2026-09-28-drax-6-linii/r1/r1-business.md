# ION-112 runda 1: partea Claude (logica de business). Cele 6 linii cu steag și lista «capăt prin parcare»

Autor: business-logic-auditor, 27.09.2026. Doar citire.
- **Regulile:** `reguli-drax-1cfc6c53.txt` (md5 1cfc6c53, după migrația 415).
- **Datele:** VPS `drax/date/ideal-v4.2` (`obs-ideal.json`, `schelet-ideal.json`, `decizii-v3.json`, `nomenclator.json`).
- **Urma minut cu minut:** trackerul pg, ca în `minut744.mjs`.
- **Scripturile:** `scratchpad/p112/e1…e6.mjs` (`e5` = trackerul, rulat din `/root/lde-worker` și șters după rulare).

**Metoda nouă pe care o folosesc peste tot: «plinul la oprirea din capăt».**
- Plinul se măsoară de la prima oprire (§4.5, pe `opr` ≤ 0,8 km de `capatC`) din capăt până la poartă la tur, și de la poartă până la
  ultima oprire din capăt la retur.
- Zi bună = tur și retur cu oprire în capăt, aceeași mașină, zi și schimb, la ≤ 18 %.
- Mediana e pe septembrie dacă are ≥ 3 zile bune (§6.2, §6.3).
- Tăietura de azi pe «atingerea» capătului (≤ 1,2 km) umflă plinul acolo unde drumul de acasă trece a doua oară pe lângă capăt.

---

## Pe linii

| linie | card azi | măsurat (oprire în capăt) | poziția mea |
|---|---|---|---|
| **R3 Nihoreni** | 44,2 × 2 | 25 de zile bune în sept., **44,7** (s1 44,7 / s2 44,8) | **cardul 44,2 × 2 rămâne, steagul se scoate** |
| **R16 Florești** | 35,7 × 1 | 13 zile bune (144BRAZ, mai–iul.) **35,2**; 518MHD sept.: de la oprirea din Florești 35,3–36,7 | **35,7 rămâne; cele 107 picioare ale lui 518MHD trec pe R16; turele se recalculează (probabil 2)** |
| **R18 Zarojeni** | 28,9 × 2 | turul s2 cu oprire în Zarojeni 26,8–28,5 (median 27,7); returul s2 cu oprire în Zarojeni (tracker) | **card nou ≈ 27,7–28,9 × 1; picioarele cu opriri în satele R22/R21/R32 trec pe acele linii** |
| **R27 Sturzovca** | 24,9 × 3 | 29 de zile bune în sept., **23,0** (lanț 23,5), s1 = s2, **2 ture** | **card nou 23,5 × 2 (fără etalon pe schimb); buclele lui 727CWN trec pe R11/R13/R25** |
| **R32 Trifănești** | 40,2 × 2 | 146BRAZ oprește rar chiar în Trifănești (16 retururi s1); urcă în Sevirova, Alexandrovca, Izvoare (sate R32) și în Putinești | **cardul 40,2 × 2 rămâne, steagul se scoate** (motivul, Putinești, e acum regulă: §1.4, migr. 415) |
| **R36 Bocancea Schit** | 54,5 × 1 | 5 zile bune în sept., **53,2**; lanțul pe aceleași perechi 52,9; `etalonGPS` 53,3 | **card nou 53,3 × 1, steagul se scoate** |

### R3 Nihoreni
- **Dovada:** în septembrie urcă la Nihoreni 345KAJ, 457BRAX și 186OMM.
- **Plinul de la oprirea din Nihoreni până la poartă, pe mașini:**
  - 345KAJ: 39,9 (VEST) / 41,6 (EST);
  - 457BRAX: 40,8–42,6;
  - 186OMM: **45,1 / 44,7, tot la poarta EST**, deci un drum mai lung cu ~3,5 km, nu altă poartă. Ipoteza porții e respinsă.
- **Tăietura pe atingere e greșită la 186OMM.** Atinge Nihoreni la 36,5 km, dar oprește acolo la 43,5 km (după Rîșcani), deci plinul
  iese 52. Pe aceleași perechi, lanțul dă 47,1, iar tăietura la oprire dă 44,7.
- **§6.2** (mediana zilelor bune) dă 44,7, adică **44,2 ± 1,1 %**.
- **Dezacordul vechi e închis.** Diferența 41 / 45 e o variantă de drum a mașinii 186OMM (Nihoreni stop → gate 45 km), cu aceleași sate
  și opriri, nu un alt serviciu. Nu există o separare pe schimb: s1 44,7, s2 44,8.
- **Ce ar trebui să accepte Codex:** cardul 44,2 fără steag, pe dovada «oprire în capăt, 25 de zile bune, s1 = s2».

### R16 Florești (împreună cu R32)
- **518MHD doarme în Izvoare.** Turul pornește din Izvoare (oprire la 0 km, acasă) → Florești (21–22 km) → poartă. Returul: Florești →
  Izvoare, acasă.
- **Opririle în Florești:** tur s1 30 din 30, retur s1 24 din 27, retur s2 36 din 44.
- **Graficul pune 518MHD pe R16 pe ambele schimburi, zilnic.** Cele 107 picioare R32 ale lui 518MHD (70 cu opriri în satele R16, 37 în
  R20) sunt deci **R16, cu Izvoare ↔ Florești = drumul de acasă** (§4.1 ultima frază, §4.2).
- **Km-ii:** de la oprirea din Florești, 35,3–36,7, egal cu cardul.
- **Ce se schimbă:**
  - `decizii` și etichetele: 518MHD → R16|Florești;
  - în analiza săptămânală, ~17 km pe picior trec de la «cu oameni» la livrare (e constatarea L2 din runda 1 a ION-110, încă deschisă);
  - turele R16 se recalculează: 518MHD pe s1 și s2 zilnic, deci probabil **× 2** (cardul are × 1).

### R18 Zarojeni: urma minut cu minut (tracker, 348KAJ, 17–25.09)
- **Casa lui 348KAJ e în Gura Căinarului**, la 1,39 km de centrul Zarojeniului.
- **Săptămâna 21.09** (faza A: EZ pe s2; Zarojeni e doar EZ în act):
  - **turul s2** 13:28–13:37 oprește în Zarojeni (29–51 de puncte în 1,2 km) → Gura Căinarului → poartă, plin 26,8–28,5;
  - **returul s2** 00:31–00:37 oprește în Zarojeni, în fiecare noapte 22–24.09;
  - turul s1 și returul s1 ale aceleiași săptămâni **nu se apropie de Zarojeni** (minimum 1,32 km) și opresc în Țiplești, Țipletești,
    Heciul Vechi, Alexăndreni și Biruința, **satele R22**.
- **Săptămâna 14.09:** 17.09 turul s1 oprește în Zarojeni; 18–19.09 opresc în Moara de Piatră / Cubolta, Heciul Nou / Grigorești (R21),
  Alexandrovca / Sevirova (R32).
- **Pe fereastră:** din 186 de picioare R18, doar 32 opresc în Zarojeni. 87 n-au nicio oprire în vreun sat de rută; 26 opresc în satele
  R32, 21 în R21, 9 în R22.
- **Concluzia:**
  - Zarojeni are **un** serviciu pe zi (grupa EZ);
  - restul picioarelor sunt alte linii, pornite de acasă, lângă capăt (§4.2: «drumul de acasă nu face capătul»);
  - cardul **× 2 e greșit (H-a)**, iar km-ii ≈ 27,7 (tur, oprire în capăt) față de 28,9 (−4 %).
- **Metoda:** în `obs`, returul își pierde oprirea din Zarojeni (extracția a unit-o; lanțul dă un plin de 22 în loc de ~27). Cardul se ia
  din tururile cu oprire în capăt, plus retururile verificate pe tracker. Altfel se cere o re-extracție a opririlor pentru 348KAJ.

### R27 Sturzovca
- **Oprirea în Sturzovca:**
  - 727CWN: 73 de tururi / retururi pe s1 și 64 pe s2, plin 21,4–23,7;
  - 441ASB, 397VKV și 804MUM: la fel.
- **Pe zilele bune din septembrie (29): 23,0 la oprire, 23,5 în lanț, s1 23,3 = s2 23,7.**
- **Cele 46,9 km «s2» din §6.6 sunt buclele lui 727CWN fără oprire în Sturzovca.** Opririle lor sunt în satele R11 (29), R13 (11) și R25
  (8): exemplu, 03.09 tur s2 cu 85 km prin Ustia, Limbenii Vechi, Petrunea, Fundurii Vechi.
- **Ce ar trebui să accepte Codex:**
  - card **23,5 × 2** (lanțul pe picioarele cu oprire în capăt) sau 23,0 (oprire); diferența e sub 2,5 %, iar eu propun 23,5, fiindcă e
    metoda de acum restrânsă la serviciul dovedit;
  - buclele trec pe R11 / R13 / R25 după opriri (§4.2), nu se exclud. Ținta comună din v3 era «24,0 × 2».
- **Ture:** mediana perechilor bune pe zi = 2.

### R32 Trifănești
- **Turul lui 146BRAZ pornește din Scăieni (acasă, dincolo de capăt):**
  - s1: Sevirova (8 km) → Putinești (26 km) → poartă, plin 39,4;
  - s2: Alexandrovca, Sevirova → poartă, plin 35,3 (fără ocolul prin Putinești).
- **Returul:** Alexăndreni / Putinești sau Sevirova / Alexandrovca → Scăieni, plin 40–40,7.
- **Motivul steagului** («146BRAZ face și R18 în aceeași cursă») e acum textul §1.4 (migr. 415): Putinești n-are autobuz propriu, iar
  km-ii lui sunt în R32. Cardul 40,2 (mediana, cu ocolul prin Putinești pe o parte din picioare) e consecvent cu §1.4.
- **Poziția:** 40,2 × 2 fără steag. Codex ar trebui să accepte pe baza textului 415.

### R36 Bocancea Schit
- **În septembrie drumul s-a scurtat:**
  - mai–iulie: plin median 58,6 (96 de picioare);
  - septembrie: 53,4 (36), doar 1 din 36 prin Bilicenii Vechi.
- **§6.3** (septembrie, ≥ 3 zile bune): 5 zile bune, 53,2 la oprire, 52,9 în lanț, iar `etalonGPS` al cardului e 53,3.
- **Condiția Codex C2** («aceleași perechi») e îndeplinită: toate cele trei cifre sunt pe perechile 224BZP din septembrie.
- **Poziția:** card **53,3 × 1**, fără steag (−2,4 km pe zi).

## Lista «capăt atins prin parcare»

| rând | poziția mea | dovada |
|---|---|---|
| **Zarojeni, 348KAJ, 52 %** | **reatribuire cu dovadă pozitivă**, nu excludere | Casa e la 1,39 km. Picioarele pornite de acasă opresc în satele R22 (s1, 21–25.09, zilnic), R21 și R32. §4.2 (după 415) spune deja că drumul de acasă nu face capătul, iar cursa e a liniei cu ≥ 2 opriri în satele ei. |
| **Heciul Vechi\*, 412BRAY, 47 %** | **steag, nemăsurat de mine în runda 1** | de făcut în runda 2, cu aceeași metodă (tracker + opriri) |
| **Prajila, 763LYY, 26 %** | **se scoate din listă** | Opririle sunt în Putinești (R18). §1.4 (415) spune că Putinești e deservit în mai–iulie de R17 Prajila (763LYY): e serviciul liniei, nu parcare. |
| **Sturzovca, 727CWN, 14 %** | **reatribuire la R11 / R13 / R25 după opriri** | vezi R27; asta închide și §6.6 |

## Ce se schimbă

**În lanț** (`decizii-v3.json` → `v4`, `card-gps.mjs`, `etalon.mjs`):
1. Metoda «oprire în capăt» ca metodă în decizii:
   - R3 (control; cardul rămâne 44,2);
   - R18 (card);
   - R27 (populația = picioarele cu oprire în capăt; km pe lanț);
   - R36 (card = `etalonGPS` 53,3).
2. Reatribuiri după opriri (§4.2):
   - 518MHD → R16;
   - picioarele R22 / R21 / R32 ale lui 348KAJ;
   - buclele lui 727CWN → R11 / R13 / R25.
   Obligatoriu **și în `economie/etichete.mjs`**, altfel analiza săptămânală rămâne în urmă (ION-110 M-a, ION-111 L-b).
3. Turele recalculate: R18 → 1, R27 → 2, R16 → probabil 2.
4. Control pe toată flota, cu verificatorul: R22, R21, R32, R11, R13, R25 nu se mișcă peste 5 % după ce primesc picioarele.

**În reguli** (migrație, gard pe 1cfc6c53):
- §6.6: exemplul «R27 Sturzovca: s1 24,7 km, s2 46,9 km» e greșit și se scoate.
- §6.5: cifrele de ture (Sturzovca 3 → 2, Zarojeni 2 → 1, R16).
- §2.4: «Sturzovca … ambele schimburi, cu două mașini».
- §6.2: fraza despre tăietura la oprirea din capăt, dacă se adoptă ca metodă.

## Constatări cu deducere

**H-a (high, −2): R18 Zarojeni × 2 numără alte linii.**
- Dovada: trackerul, 21–25.09. Zarojeni e deservit doar pe s2 (tur 13:3x, retur 00:3x, cu opriri în Zarojeni). Tururile și retururile s1
  ale lui 348KAJ nu trec la mai puțin de 1,32 km și opresc în satele R22.
- Pe fereastră, 154 din 186 de picioare R18 n-au nicio oprire în Zarojeni.
- Scenariul: cardul R18 ține 2 × 28,9 × 2 = 115,6 km pe zi, în loc de ~57. R22 pierde picioarele lui 348KAJ. Analiza săptămânală pune
  serviciul R22 pe R18, iar pagina și indicațiile arată linia greșită.

**M-b (medium, −1): §6.6 afirmă un etalon pe schimb (s2 46,9) construit din buclele lui 727CWN prin alte rute.** Pe picioarele cu oprire
în Sturzovca, s1 = s2 (23,3 / 23,7).

**M-c (medium, −1): 518MHD stă pe R32 cu 52,8 km «cu oameni».** Drumul Izvoare ↔ Florești (~21 km) e drumul lui de acasă; problema e
deschisă din ION-110 (L2) și umflă «cu oameni» în analiza săptămânală.

## Scor

10 − (2 + 1 + 1) = **6,0 / 10**

Pe 3 linii, cardul se păstrează fără steag: R3 44,2, R32 40,2 și R16 35,7, acesta din urmă cu reatribuirea lui 518MHD. Pe 3 linii am
card nou cu metoda exactă: R18 ≈ 27,7 × 1, R27 23,5 × 2 și R36 53,3 × 1.

**Rămân pentru runda 2:**
- Heciul Vechi\* (412BRAY);
- turele R16 după reatribuire;
- controlul pe toată flota al liniilor care primesc picioare.
