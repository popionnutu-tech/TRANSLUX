# Verificarea 2 — Drăxlmaier Bălți (candidatul ideal-v2) — 27.09.2026

## Starea

| | |
|---|---|
| RUN | `/home/verif/verificator/rulari/drax-v4.1-verif2-1790465178` |
| sursa (VERIF_SRC) | `/root/lde-worker/drax/date/ideal-v2`, cu GATA verificat de `ruleaza.sh` |
| drax.mjs | v4.1 · `fe8f2697f6aa…` (sha256 complet în SIGILIU) |
| ruleaza.sh | `16afed92a3a1…` |
| etalon-gps / filtru-rupte / c4 | `73a166b9…` / `96807913…` / `e9d6b55e…` |
| node / tz | v20.20.2 · tzdata 2025c · ICU 78.2 · Europe/Chisinau |
| reguli_livrare | primite în prompt: 2026-09-26 18:04:03 UTC, md5 77c30eee9a1dfc82f0c3547fb1365d3f, 16.340 caractere |
| intrări (sha256 scurt) | schelet-ideal `29b2d3aa` · obs `5dba3f2e` · etalon `08ecc93f` · curse `5b6bb6ed` · regulate `51811386` · schimburi `2d4713f2` · care-schimb `78e78463` · dubluri `91eec277` · nomenclator `2935de27` · explicatii `a9bd3a66` · porti `9a262b9a` · ferestre `417584bd` |
| SIGILIU | verdict `65a090209dedc30eb1db2ec4985381fa6e704cc80595b97f84b9629507fbc9a6` · manifest `917f775c…` |
| INCHIS | **ok** (27.09.2026 02:34:48 +03:00, manifestul final = cel inițial) |
| proba R1 | **ok** (fără R1 Donduseni, verdictul dă blocant R1) |
| proba registru | **PICATĂ, dar din cauza X2, nu a registrului.** Fără registru, C31 e blocant, cum trebuie. Cu registru, C31 nu e «explicat», fiindcă cele 3 explicații sunt semnate pe schelet `43dcceaf…`, iar candidatul are `29b2d3aa…`. Proba trece după re-semnare. |

**Unități.** 51 de linii din act și 42 de linii `*` (93 în schelet). 48 de linii din act au ideal. 49 de mașini. 13.672 de observații cu rută, 13.450 de deplasări cu rută, 27.644 de deplasări brute.

**Verdictul scriptului:** 214 constatări (177 informative, 30 abateri, 7 blocante), 0 explicate. **`valid_pentru_export` = false.**

**Blocante pe control:** C31(a) 3 · G1 4. Total 7, niciunul explicat.

**Ce trebuie re-semnat (sesiunea, nu verificatorul):** cele 3 explicații C31 din `explicatii-drax.json` (R13 Hasnasenii Noi, R18 Putinesti, R27 Iabloana), de pe `43dcceaf6db74d565f21863e6c5e0a2ca09424a744778e0c205c698c8b260104` pe `29b2d3aab973d6e3b99aa1ded8e2266453922558c3fdd5f3b66af5ec8f5d5282`. Am verificat textele cifră cu cifră pe candidat și se potrivesc:
- Hasnasenii Noi: 71 de picioare, 38 de deplasări, 66 în rt, 36 de zile-mașină, 744ARF 63, plin 9,1 km;
- Putinesti: 16 picioare în 15 zile-mașină, 397VKV 6 / 763LYY 4 / 804MUM 4, 22,8 km, o zi încrucișată;
- Iabloana: 5 picioare în 4 zile-mașină, 28,1 km.

Re-semnarea singură lasă **4 blocante G1**. Pentru `valid_pentru_export` = true mai trebuie, pe fiecare dintre ele, o corecție de card sau o explicație G1 în registru (vezi corectii.md).

## Blocante (neexplicate)

| id | linie | cifra | diagnosticul (C44, cursă cu cursă) |
|---|---|---|---|
| C31(a) | R13 Hasnasenii Noi | 0 candidate | 744ARF face bucle rt EST → Hăsnășenii Noi → EST (9–11 km) la 13:38 (aduce s2) și la 15:54 (duce s1). Sunt gemeni rt, cu schimb doar pe un picior, deci nu există pereche pe același schimb. Noaptea (08–12.09) Hăsnășenii Noi e servit și pe returul s2 al Sturzovcăi. **Structural; blocant doar din cauza X2.** |
| C31(a) | R18 Putinesti | 0 candidate | Satul e servit pe drum de 397VKV/804MUM (din Pământeni, ~04:55, Putinești la km 23) și de bucla s1 a lui 348KAJ (Zarojeni). Servire rară și încrucișată. **Blocant doar din cauza X2.** |
| C31(a) | R27 Iabloana | 0 candidate | 5 picioare, prin Sturzovca (441ASB) și o buclă rt (348KAJ, 19.06). **Blocant doar din cauza X2.** |
| G1 | R18 Zarojeni | card 28,9 / GPS 30,7 (+5,9 %, 9 zile), C47 41 % | O singură mașină (348KAJ), cu trei drumuri: bucla s1 prin Putinești–Țiplești–Alexăndreni (29,3–30,4 km), returul s2 direct de noapte (21,9–22,0 km, 4 din 6 nopți) și curse comasate cu alte linii (Sevirova/Trifănești 55 km, Moara de Piatră/Cubolta 53 km, Heciul Nou 41 km). 4 din cele 9 zile bune sunt comasate. Pe cele 5 zile curate mediana e 30,0. Pe «toate», 29,9 (43 de zile), cu cardul la −3,3 %. **Diferența reală e mică; blocantul vine din zilele comasate.** |
| G1 | R24 Catranic | 2 zile bune GPS în «sept» (<3) | 224BZP (dev2302) are urma ruptă sistematic: returul s1 (15:55 → ~21:48, plin 4–21 km în 6 ore) și turul s2 de la 13:36 (plin 9,9–15 km). Pe zilele bune rămân doar perechi s2. Pe «toate» sunt 41 de zile și etalonul 29,3, cu cardul 30 la +2,4 %. **C20 («sept» sub 3 zile → «toate») nu se aplică pe zilele bune GPS; aplicată, linia trece.** |
| G1 | R27 Sturzovca | card 24,9 / GPS 46,5 (46,5 %, 8 zile), C47 29 % | **Fals pozitiv.** 727CWN face zilnic, pe un schimb, cursa directă (21–24 km) și, pe celălalt, bucla Fundurii Noi–Limbenii Noi (43,8–47,4 km, mereu tur VEST / retur EST). Poarta sensului (VEST/EST) păstrează doar perechile buclei. Pe orice poartă: 24,1 (41 de zile); pe «toate»: 23,9 (169 de zile). **Cardul 24,9 e corect.** |
| G1 | R36 Bocancea Schit | card 54,5 / GPS 46,2 (18 % pe max, 7 zile), C47 41 % | Două drumuri. Scurt: prin Nicolaevca, 42–47 km. Lung: prin Bilicenii Vechi, 51–55 km, pe returul s2 de noapte în 8 din 9 nopți. Cardul lanțului e varianta lungă. Mediana regulii pe «sept» e 46,2. Pe «toate» ar fi 59,1, dar e drumul de dinainte de septembrie. **Corecție reală: 46,2 (−16,6 km/zi GPS), după dezbatere.** |

## Explicate (registru)

Niciuna în această rulare. Registrul are 3 explicații C31, semnate pe `43dcceaf…` și hotărâte în dezbaterea triajului r3 din 26.09. Rămân valabile pe fapte (vezi X2 mai sus).

## Nou față de control-ideal.log și față de verificarea anterioară (km GPS, linie cu linie)

Comparațiile sunt făcute cu `compara.mjs`, rulat ca `verif` (diag.sh):

- **verif1** (`drax-v4-verif1-1790451539`, setul activ, drax v4) → **verif2** (candidatul, drax v4.1):
  - card total 5.843 → **5.766 km/zi**; GPS completat 5.875 → 5.818 (etalonul v4.1 aplică filtrul de urmă ruptă);
  - 0 linii dispărute;
  - linii cu card ≠ etalon ±0,1 km: **7** (toate au steag): R3, R6, R18 Zarojeni, R24, R27 Sturzovca, R32 Trifanesti, R36.
- **Același script pe setul activ** (`drax-v4.1-1790464013`) → candidat:
  - GPS 5.818 → 5.818, identic: candidatul nu atinge observațiile, doar cardul;
  - cardul trece pe etalonul GPS pe **41 de linii**. Cele mai mari mișcări: R7 Usurei 40 → 37,4 (−5,2 km/zi), R8 Costesti 81,5 → 78,5 (−6), R14 Baroncea 45,9 → 44,4 (−6), R23 Scumpia 61,4 → 59,5 (−7,6), R39 Popestii 77,1 → 74,8 (−4,6).
- **Ce a dispărut** față de verif1:
  - G1 R7 Usurei (card 40 / GPS 37,4, 7 %): cardul a fost corectat;
  - G1 bandă: 20 → 3 linii.
- **Ce a apărut:**
  - C22 zi aleasă (4 linii: R6, R24, R25, R27);
  - C23 hartă (4 linii: drumul desenat a rămas peste cardul corectat);
  - E1 steag (6 linii, toate cu steag, deci nu sunt blocante);
  - X1/X2 (registrul pe alt sha).
- **R24 Catranic:** în verif1 era G1 cu 3 zile bune (28,3, 6 %); acum are 2 zile bune și etalon nedeterminat, fiindcă filtrul de urmă ruptă din v4.1 a scos o zi.
- **control-ideal.log** al lanțului (25.09 23:24): «blocante: 1 clasă». Verificatorul găsește în plus clasele G1 (4) și X, pe care lanțul nu le are (G1, C47, E1, X1/X2 nu există în `control.mjs`).

## Linie cu linie — din act

Sursa e «sept» peste tot, cu excepția R13 Lazo, R16 Floresti și R39 Popestii («toate»). Km-ul GPS e completat cu raza porții. Ture/zi și km/zi sunt pe GPS.

| rută | linie | verdict | zile bune GPS | card · GPS · dif | corecție | ture/zi · km/zi | regim (act → sursă → total) | porți t/r | C47 | controale căzute |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | Donduseni | trece | 18 | 91,9 · 91,9 · 0 | — | 1 · 183,8 | — | EST/EST | 97 | C35(d) Mindic |
| R2 | Stolniceni | trece | 16 | 67,9 · 67,9 · 0 | — | 1 · 135,8 | — | VEST/EST | 94 | C35(d) |
| R3 | Nihoreni | abatere | 16 | 44,2 · 42,3 · 4,5 % | diagnostic cerut (steag) | 2 · 169,2 | — | VEST/EST | **58** | C47, G1 bandă |
| R4 | Grinauti | trece | 32 | 25,6 · 25,6 · 0 | — | 2 · 102,4 | — | EST/EST | 97 | — |
| R5 | Alunis | trece | 9 | 34,6 · 34,6 · 0 | — | 1 · 69,2 | — | VEST/EST | 100 | C35(e) |
| R6 | Mihailenii Vechi | abatere | 5 | 55,7 · 58 · −4 % | nimic pe card (orice poartă 54,8) | 1 · 116 | posibil Z (2 zile) | EST/EST | 75 | C22, G1 bandă, G1 orice poartă |
| R7 | Usurei | trece | 17 | 37,4 · 37,4 · 0 | (corectat în candidat) | 1 · 74,8 | — | VEST/EST | 94 | C23 8,3 % |
| R8 | Costesti | trece | 19 | 78,5 · 78,5 · 0 | — | 1 · 157 | — | VEST/EST | 97 | C23, C35(e) |
| R9 | Cobani | abatere | 14 | 55,5 · 55,5 · 0 | — | 2 · 222 | EZ+D → doar s1 → neclar | VEST/EST | 100 | D1 ×2 |
| R10 | Ciuciulea | trece | 28 | 66,5 · 66,5 · 0 | — | 2 · 266 | — | EST/EST | 80 | — |
| R11 | Funduri Vechi | trece | 16 | 24,7 · 24,7 · 0 | — | 1 · 49,4 | — | VEST/EST | 100 | C23 5,1 % |
| R11 | Limbenii Noi | trece | 9 | 31,2 · 31,2 · 0 | — | 1 · 62,4 | — | VEST/EST | 80 | — |
| R12 | Pelinia | trece | 37 | 26,4 · 26,4 · 0 | — | 2 · 105,6 | — | EST/EST | 100 | C4 efect nul |
| R12 | Sofia | trece | 33 | 31,5 · 31,5 · 0 | — | 2 · 126 | — | VEST/VEST | 99 | C4 efect nul |
| R13 | Hasnasenii Noi | **blocant** | — | fără ideal | re-semnare C31 | — | — | — | — | C31, X1 |
| R13 | Lazo | trece | 22 (toate) | 16,4 · 16,4 · 0 | — | 2 · 65,6 | — | EST/EST | 100 | C32 |
| R14 | Baroncea | trece | 27 | 44,4 · 44,4 · 0 | — | 2 · 177,6 | — | EST/EST | 100 | C42 (act 1) |
| R14 | Dominteni | trece | 54 | 34 · 34 · 0 | — | 3 · 204 | EZ → ambele | EST/EST | 68 | C42 (act 1), C35(e) |
| R15 | Suri | trece | 8 | 70 · 70 · 0 | — | 1 · 140 | — | VEST/EST | 100 | — |
| R16 | Floresti | trece | 13 (toate) | 35,7 · 35,7 · 0 | — | 1 · 71,4 | EZ+D → rotație | EST/EST | 100 | C32, C42 (act 2) |
| R16 | Varvareuca | trece | 35 | 42,8 · 42,8 · 0 | — | 2 · 171,2 | — | EST/EST | 83 | C35(e) |
| R17 | Prajila | trece | 45 | 41,3 · 41,3 · 0 | — | 3 · 247,8 | — | EST/EST | 84 | C42 (act 2), C37 4 % |
| R18 | Putinesti | **blocant** | — | fără ideal | re-semnare C31 | — | — | — | — | C31, X1 |
| R18 | Zarojeni | **blocant** | 9 | 28,9 · 30,7 · −5,9 % | diagnostic cerut → propun 29,9 | 2 · 122,8 | EZ → neclar → rotație | EST/EST | **41** | G1, C47, D1, D2 |
| R19 | Bilicenii Vechi | abatere | 25 | 17,3 · 17,3 · 0 | — | 2 · 69,2 | EZ+D → doar s2 → rotație | EST/EST | 81 | D1 ×2 |
| R19 | Copaceni | abatere | 25 | 32,7 · 32,7 · 0 | — | 1 · 65,4 | EZ+D → rotație → neclar | EST/EST | 98 | D1 ×2, C42 (act 2) |
| R20 | Nicolaevca | abatere | 28 | 39,6 · 39,6 · 0 | — | 2 · 158,4 | EZ+D → ambele → neclar | EST/EST | 100 | D1 ×2 |
| R20 | Radoaia | trece | 37 | 26,1 · 26,1 · 0 | — | 2 · 104,4 | — | EST/EST | 97 | — |
| R21 | Heciul Nou | trece | 39 | 20,7 · 20,7 · 0 | — | 2 · 82,8 | — | EST/EST | 97 | — |
| R22 | Tiplesti | trece | 7 | 21,4 · 21,4 · 0 | — | 1 · 42,8 | EZ+D → rotație | EST/EST | 83 | C42 (act 2) |
| R23 | Scumpia | trece | 21 | 59,5 · 59,5 · 0 | — | 2 · 238 | — | VEST/EST | 97 | — |
| R24 | Catranic | **blocant** | 2 | 30 · nedeterminat | C20 → 29,3 (toate, 41 zile) | 1 · — | — | VEST/EST | — | G1, C22 |
| R25 | Hiliuti | abatere | 9 | 32 · 32 · 0 | — | 1 · 64 | — | EST/EST | 100 | C22 |
| R26 | Ilenuta | trece | 7 | 38,8 · 38,8 · 0 | — | 1 · 77,6 | — | EST/EST | 89 | — |
| R26 | Obreja Veche | trece | 15 | 38,4 · 38,4 · 0 | — | 1 · 76,8 | — | VEST/EST | 100 | C35(d) Obreja Nouă |
| R27 | Danu | trece | 11 | 53,7 · 53,7 · 0 | — | 1 · 107,4 | — | VEST/EST | 92 | C35(e) |
| R27 | Iabloana | **blocant** | — | fără ideal | re-semnare C31 | — | — | — | — | C31, X1 |
| R27 | Sturzovca | **blocant** | 8 | 24,9 · 46,5 · −46,5 % | nimic pe card (fals pozitiv) | 3 · 279 | D → neclar → ambele | VEST/EST | **29** | G1, C47, C22, D1, D6 |
| R28 | Cuhnesti | trece | 14 | 65,5 · 65,5 · 0 | — | 1 · 131 | — | VEST/EST | 97 | C35(d) Balatina |
| R29 | Ustia | trece | 9 | 56,9 · 56,9 · 0 | — | 1 · 113,8 | — | VEST/EST | 100 | C35(e) |
| R30 | Cosernita | trece | 18 | 63,8 · 63,8 · 0 | — | 1 · 127,6 | — | EST/EST | 97 | C35(e) |
| R31 | Cotiujenii Mari | trece | 16 | 65,1 · 65,1 · 0 | — | 1 · 130,2 | — | EST/EST | 100 | — |
| R32 | Cainarii Vechi | trece | 18 | 46,9 · 46,9 · 0 | — | 1 · 93,8 | — | EST/EST | 79 | C35(e) |
| R32 | Trifanesti | abatere | 40 | 42,3 · 41,2 · 2,7 % | diagnostic cerut (steag) | 2 · 164,8 | D → ambele → doar s1 | EST/EST | **42** | C47, V2 (+165 km/zi), D1, D2 |
| R33 | Iezarenii Vechi | trece | 13 | 34,7 · 34,7 · 0 | — | 1 · 69,4 | — | EST/EST | 96 | C35(e) |
| R34 | Taura Veche | trece | 18 | 40,7 · 40,7 · 0 | — | 1 · 81,4 | — | EST/EST | 97 | — |
| R35 | Cucioaia | trece | 19 | 52,5 · 52,5 · 0 | — | 1 · 105 | — | EST/EST | 100 | C35(e) |
| R36 | Bocancea Schit | **blocant** | 7 | 54,5 · 46,2 · 18 % | corecție 46,2 după dezbatere | 1 · 92,4 | — | EST/EST | **41** | G1, C47 |
| R37 | Musteata | trece | 10 | 43,5 · 43,5 · 0 | — | 1 · 87 | — | VEST/EST | 100 | C35(d) Navirnet |
| R38 | Glinjeni | trece | 13 | 33,3 · 33,3 · 0 | — | 1 · 66,6 | — | VEST/EST | 100 | — |
| R39 | Popestii de jos | trece | 47 (toate) | 74,8 · 74,8 · 0 | — | 1 · 149,6 | — | EST/EST | 97 | C32, C23 5,9 % |

Totaluri: **36 trec · 8 abateri · 7 blocante** (3 C31 structurale + 4 G1).

## Linii * — tabel separat

Toate cele 42 sunt **neverificabile**: G1 și C47 nu rulează pe liniile `*`. 9 au ideal (C41(j)); 33 n-au ideal.

| rută | linie | ideal km · ture/zi | sursa, zile bune | mașini |
|---|---|---|---|---|
| R2 | Cupcini* | 72,9 · 1 | sept 6 | 549RNK |
| R3 | Recea* | 25,9 · 1 | sept 6 | 345KAJ |
| R9 | Glodeni* | 62,3 · 1 | sept 5 | 447ASB, 397VKV |
| R16 | Mărășești* | 15,4 · 1 | toate 3 | 144BRAZ |
| R20 | Drăgănești* | 36,5 · 1 | toate 24 | 041BRAU (D2 izolat 3 zile) |
| R22 | Heciul Vechi* | 48,3 · 2 | toate 24 | 412BRAY (D2 ambele parțial) |
| R22 | Țipletești* | 21,5 · 1 | toate 8 | 412BRAY |
| R33 | Bilicenii Vechi* | 18,5 · 1 | sept 3 | 725CWN |
| R33 | Vrănești* | 22,7 · 1 | sept 8 | 725CWN |

Fără ideal (33): Tîrnova*, Rîșcani*, Recea* (R5, R7), Nicoreni*, Slobozia* (R7: 386PKP 70 de zile, cu cele 138 de salturi V6), Pîrjota*, Hîjdieni*, Fundurii Noi*, Sadovoe* (R11, R27), Hăsnășenii Mari*, Drochia*, Mărculești* (R16, R17), Gura Căinarului*, Sîngerei*, Mîndreștii Noi*, Sacarovca*, Alexăndreni* (R21, R22), Călugăr*, Fălești*, Frumușica* (R23, R32), Gara Fălești*, Balatina*, Petrunea*, Bezeni*, Nicolaevca*, Bilicenii Vechi* (R34), Dumbrăvița* (912RNK 31 de zile), Bobletici*. V5 («ambele» din 0 săptămâni complete): Tîrnova*, Recea* R7, Slobozia*, Petrunea*, Nicolaevca*.

## Pe flotă

- **Dubluri.**
  - 880RNK: C4 **sigur**, 7 zile (dispozitivele 2402/2478). Efectul e nul pe etalon și pe ture/zi (R12 Sofia, R12 Pelinia); Pelinia are 35 de zile bune în loc de 37 fără 2402. Nu e blocant.
  - C37: 713IZX = 763LYY pe R17 Prajila, 7 din 184 (4 %). Informativ.
  - dubluri-ideal.json e gol (31 de octeți): C3 nu are ce uni.
- **Salturi între porți (V6):** 7.731 de deplasări poartă → poartă ≤5 km; 138 sunt atribuite liniei R7 Slobozia*. Pe mașini: 744ARF 17 zile, 386PKP 9, 346KAJ/412BRAY/348KAJ/350KAJ câte 1.
- **Deplasări fără schimb la prânz (D7):** 211 observații. Geamăn rt 114 și goale 36 (structurale); regulate: 024XKY (Suri ~11:41, 6 zile; Pelinia ~11:20, 11 zile) și 446ASB (Călugăr* ~11:19, 5 zile), care merg în F4; restul, 57, e întrebare.
- **Mașini cu drum mixt,** găsite în diagnostic:
  - 727CWN: Sturzovca + bucla Limbenii Noi;
  - 224BZP: doarme la Catranîc, alternează R24/R36, urmă ruptă pe dev2302;
  - 348KAJ: Zarojeni comasat cu alte linii;
  - 518MHD: Trifanesti prin Florești/Varvareuca.
- **C47 pe flotă:** 86,5 % (2.034/2.352), sub reperul de 90 %. 15 linii sub 90 %, 5 sub 60 %, toate cele 5 cu steag.
- **C5 / W53:** fereastra e în EEST, iar lanțul are UTC+3 fix. Trece pe Intl înainte de 25.10.2026, altfel C5 devine blocant. care-schimb are încă paritate: alternanță înainte de 01.12.2026.
- **E1:** cele 6 linii cu C47 <60 % sau cu variante (R3, R6, R18 Zarojeni, R27 Sturzovca, R32 Trifanesti, R36) au steagul `diagnostic` în `schelet-ideal.json` al candidatului, deci nu e niciun blocant E1. R24 Catranic are și el steagul («< 3 perechi bune»).

## Ieșiri

`judecata.json` (93 de unități, 13 mașini, 7 teme de flotă, 7 întrebări) · `corectii.md` · `intrebari.md` · `verdict.json` · `controale.json` · `SIGILIU` · `diag/` (scripturile C44 și ieșirile lor: `c44-a.txt`, `c44-b.txt`, `c44-c.txt`, `variante.txt`).
