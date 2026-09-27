# Drăxlmaier — de unde vin km goi și ce se poate tăia (ION-108 A, v2), săptămâna 14–20.09.2026

Stare: calculat și controlat. Nu am atins worker-ul (`saptamanal.sh`, `scrie-analiza.mjs`) și nici rândul din bază.
- Codul pe VPS: `/root/lde-worker/drax/cod/plan-schimb/v2/`. Copie în `scratchpad/p108/cod2/` și în
  `docs/plans/2026-09-27-drax-plan-schimb/v2/` din arborele ION-108 (fără commit). md5: model 6fc6f6f1…, plan-schimb 87a525d9…,
  test cbbd35e6…
- Ieșirea: `/root/lde-worker/drax/date/plan-schimb/2026-09-14-v2.json` (copie în `scratchpad/p108/plan-2026-09-14-v2.json`).
- Rulare: `node plan-schimb.mjs <săptămâna> --rotatie <săptămâna precedentă> [--out f.json]`. Fără `--out` nu scrie nimic,
  nici cache-ul. Cu `--out` scrie numai după ce trec toate controalele, atomic (`.tmp` + rename). Dacă un control pică sau
  Valhalla cade, șterge ieșirea veche și iese cu cod 1 / 3.

## 1. Problema, în cuvinte simple

Mașinile Drăxlmaier fac o cursă dimineața (~05–06:15) și una după-amiaza (~13–14:45). La 15:52 fac o cursă înapoi, iar la
00:15 încă una. Între ele stau câte ~7 ore. **Azi, în aceste ore, șoferul duce mașina acasă și o aduce înapoi.** De aici vine
cea mai mare parte a golului evitabil. Nu vine din faptul că mașina face linii diferite dimineața și seara: mașinile care fac
aceeași linie de două ori merg acasă la fel.

## 2. Pârghia principală (b): între curse mașina rămâne la uzină sau la capătul cursei următoare

Mașina nu mai merge acasă între curse. Rămâne la uzină sau la capătul liniei pe care o face imediat după, iar șoferul ajunge
acasă altfel. Naveta șoferului nu se numără (Drăxlmaier §5.10). Regula din bază spune deja «mașina așteaptă la capăt sau la
uzină, nu acasă» (§12.1). Liniile rămân la mașinile lor. Noaptea mașina doarme acasă, ca azi.

| | 14–20.09 | 07–13.09 |
|---|---|---|
| **(b) pe flotă, model (drumul cel mai scurt, Valhalla)** | **−3.260,6 km/săpt.** | **−3.876,2 km/săpt.** |
| lei pe mașinile cu normă (km × norma fiecărei mașini) | ≈ 20.100 lei/săpt. (fără normă: 925FTI, 518MHD, 763LYY, 390ASB, 186OMM, 402VKV) | ≈ 23.780 lei/săpt. |
| GPS (R1b + R3 din rând), pe mașinile ≥ 20 km/zi și ≥ 3 zile măsurate | 9 mașini: model 2.201 ↔ GPS 2.414 (−8,8 %) | 12 mașini: model 2.722 ↔ GPS 2.702 (+0,7 %) |

Cifra e o **estimare pe drumul cel mai scurt**. Unde se poate compara cu GPS, adică pe mașinile cu ocol mare, se potrivește în
±10 %. Pe toată flota, GPS R1b + R3 dă 4.145 față de 2.907 în model. Diferența vine din mașinile cu casa pe culoarul liniei
(206BZP, 715IZX, 350KAJ, 710CWN…): la ele R1b numără tot drumul prin casă, iar modelul numără doar surplusul față de drumul
direct. De aceea pe flotă comparația e doar informativă.

Pe mașină, 14.09 (doar mașinile cu câștig; «unde așteaptă» = locul, dintre uzină și capăt, cel mai aproape de casa șoferului;
km-ii mașinii sunt aceiași oriunde ar aștepta):

| Mașina | Casa | km/zi | km/săpt. (model) | GPS R1b+R3 km/săpt. (zile) | lei/săpt. | Unde așteaptă (cel mai aproape de casă) |
|---|---|---|---|---|---|---|
| 925FTI | Sărata Veche | 86.9 | 521.6 | 475.1 (4/5) | fără normă | seara la capătul Ilenuța (R26) (21.5 km de casă); între aducere și întoarcere la uzină (51.6 km de casă); dimineața la capătul Musteața (R37) (21.6 km de casă) |
| 457BRAX | Hîjdieni | 51.9 | 311.4 | 290.8 (4/5) | 2195 | seara la capătul Nihoreni (R3) (24.7 km de casă); dimineața la capătul Ustia (R29) (23.6 km de casă) |
| 912RNK | Dumbrăvița | 61.6 | 308 | 368.7 (3/5) | 2064 | seara la uzină (42.6 km de casă); dimineața la capătul Cucioaia (R35) (11.1 km de casă) |
| 345KAJ | Zăicani | 49.3 | 246.5 | 276 (3/5) | 1565 | seara la capătul Mihăileni (R6) (29 km de casă); dimineața la capătul Costești (R8) (22.5 km de casă) |
| 388ASB | Șuri | 41.1 | 205.6 | 220.3 (4/5) | 2554 | dimineața la capătul Sofia (R12) (22 km de casă); seara la capătul Șuri (R15) (1.1 km de casă) |
| 447ASB | Ciuciulea | 32.8 | 163.9 | 168 (5/5) | 2036 | dimineața la capătul Danu (R27) (23.9 km de casă); seara la capătul Ciuciulea (R10) (1.2 km de casă) |
| 760BXI | Hîjdieni | 32.3 | 161.7 | 161.9 (5/5) | 1072 | seara la capătul Obreja Veche (R26) (23.7 km de casă); dimineața la capătul Cuhnești (R28) (18 km de casă) |
| 549RNK | Edineț | 31.1 | 155.5 | — (0/5) | 1042 | seara la capătul Stolniceni (R2) (26.1 km de casă) |
| 518MHD | Izvoare | 30.6 | 153.2 | — (2/5) | fără normă | dimineața la capătul Florești (R16) (19.9 km de casă); seara la capătul Vărvăreuca (R16) (22.3 km de casă) |
| 146BRAZ | Scăieni | 25.1 | 150.8 | 196.1 (5/5) | 958 | seara la capătul Trifănești (R32) (4.8 km de casă); dimineața la capătul Trifănești (R32) (4.8 km de casă) |
| 302YEK | Căinarii Vechi | 21.9 | 131.6 | 257.2 (5/5) | 873 | seara la capătul Baroncea (R14) (19.7 km de casă); dimineața la capătul Căinarii Vechi (R32) (1.2 km de casă) |
| 725CWN | Sîngerei | 19.2 | 115.2 | 189.9 (4/5) | 732 | dimineața la capătul Iezărenii Vechi (R33) (16.3 km de casă); seara la capătul Copăceni (R19) (6.9 km de casă) |
| 713IZX | Florești | 18.8 | 94 | 229.1 (5/5) | 1167 | dimineața la capătul Prajila (R17) (12.1 km de casă); seara la capătul Prajila (R17) (12.1 km de casă) |
| 224BZP | Catranîc | 18.4 | 91.9 | 41.1 (4/5) | 584 | dimineața la uzină (30.4 km de casă); seara la capătul Catranîc (R24) (0.4 km de casă) |
| 763LYY | Băhrinești | 14.4 | 72.1 | 22 (4/5) | fără normă | dimineața la uzină (31.9 km de casă); seara la capătul Prajila (R17) (7.4 km de casă) |
| 830MUM | Sîngerei | 12.3 | 61.6 | 140.8 (3/5) | 765 | seara la capătul Bilicenii Vechi (R19) (6.9 km de casă); dimineața la capătul Copăceni (R19) (14.1 km de casă) |
| 826GXP | Dominteni | 8.6 | 43.1 | 0 (4/5) | 535 | — |
| 744ARF | Dacia | 8.3 | 41.3 | 0 (3/5) | 277 | între aducere și întoarcere la uzină (5.5 km de casă) |
| 441ASB | Sturzovca | 8.1 | 40.6 | 94.3 (4/5) | 504 | seara la capătul Fundurii Vechi (R11) (7.2 km de casă); dimineața la capătul Sturzovca (R27) (2.2 km de casă) |
| 390ASB | Pelinia | 7.8 | 39.2 | 46.1 (5/5) | fără normă | dimineața la capătul Grinăuți (R4) (4.7 km de casă); seara la capătul Sofia (R12) (11.8 km de casă) |
| 804MUM | Pământeni | 7.7 | 38.5 | — (0/5) | 479 | dimineața la uzină (7 km de casă) |
| 186OMM | Dacia | 4.5 | 22.7 | 22.7 (5/5) | fără normă | dimineața la uzină (6.1 km de casă); seara la uzină (6.1 km de casă) |
| 435ASB | Autogara | 4.4 | 22.1 | 0 (4/5) | 274 | între aducere și întoarcere la uzină (2.2 km de casă) |
| 206BZP | Rădoaia | 3.4 | 16.8 | 140.3 (5/5) | 107 | dimineața la capătul Rădoaia (R20) (1 km de casă); seara la capătul Rădoaia (R20) (1 km de casă) |
| 710CWN | Petreni | 2.1 | 10.4 | 105.8 (5/5) | 66 | dimineața la capătul Dominteni (R14) (1.1 km de casă); seara la capătul Dominteni (R14) (1.1 km de casă) |
| 402VKV | Hîjdieni | 1.8 | 9.1 | 46.2 (5/5) | fără normă | dimineața la capătul Cobani (R9) (11.5 km de casă); seara la capătul Cobani (R9) (11.5 km de casă) |
| 727CWN | Sturzovca | 1.4 | 8.2 | 78.4 (4/5) | 52 | seara la capătul Sturzovca (R27) (1.9 km de casă); dimineața la capătul Sturzovca (R27) (1.9 km de casă) |
| 350KAJ | Florești | 1.4 | 7.1 | 106.9 (5/5) | 45 | seara la capătul Vărvăreuca (R16) (2.7 km de casă); dimineața la capătul Vărvăreuca (R16) (2.7 km de casă) |
| 144BRAZ | Dacia | 1.4 | 6.8 | — (2/5) | 43 | între aducere și întoarcere la uzină (2.5 km de casă) |
| 446ASB | Călugăr | 0.8 | 3.8 | 108.3 (5/5) | 47 | — |
| 715IZX | Biruința | 0.7 | 3.7 | 143.8 (5/5) | 46 | — |
| 024XKY | Șuri | 0.4 | 1.7 | 0 (3/4) | 11 | — |
| 041BRAU | Drăgănești | 0.2 | 0.9 | 101.2 (3/5) | 7 | — |

### Unde capătul sau uzina e departe de casă (> 15 km): cum ajunge șoferul acasă?

Aici e riscul pârghiei (b). Mașina rămâne, dar șoferul trebuie să ajungă acasă în cele ~7 ore și înapoi, sau să stea pe loc.
**Întrebarea pentru Ion, pe fiecare mașină: cum ajunge șoferul acasă din locul de așteptare?** Poate cu o altă mașină a flotei
care merge într-acolo, cu rutiera, sau stă. Dacă răspunsul e «nu se poate», la mașina aceea rămâne doar (a).

| Mașina | Casa | Cel mai departe loc de așteptare de casă | câștig (b) km/zi | Unde așteaptă |
|---|---|---|---|---|
| 925FTI | Sărata Veche | 51.6 | 86.9 | seara la capătul Ilenuța (R26) (21.5 km de casă); între aducere și întoarcere la uzină (51.6 km de casă); dimineața la capătul Musteața (R37) (21.6 km de casă) |
| 457BRAX | Hîjdieni | 24.7 | 51.9 | seara la capătul Nihoreni (R3) (24.7 km de casă); dimineața la capătul Ustia (R29) (23.6 km de casă) |
| 912RNK | Dumbrăvița | 42.6 | 61.6 | seara la uzină (42.6 km de casă); dimineața la capătul Cucioaia (R35) (11.1 km de casă) |
| 345KAJ | Zăicani | 29 | 49.3 | seara la capătul Mihăileni (R6) (29 km de casă); dimineața la capătul Costești (R8) (22.5 km de casă) |
| 388ASB | Șuri | 22 | 41.1 | dimineața la capătul Sofia (R12) (22 km de casă); seara la capătul Șuri (R15) (1.1 km de casă) |
| 447ASB | Ciuciulea | 23.9 | 32.8 | dimineața la capătul Danu (R27) (23.9 km de casă); seara la capătul Ciuciulea (R10) (1.2 km de casă) |
| 760BXI | Hîjdieni | 23.7 | 32.3 | seara la capătul Obreja Veche (R26) (23.7 km de casă); dimineața la capătul Cuhnești (R28) (18 km de casă) |
| 549RNK | Edineț | 26.1 | 31.1 | seara la capătul Stolniceni (R2) (26.1 km de casă) |
| 518MHD | Izvoare | 22.3 | 30.6 | dimineața la capătul Florești (R16) (19.9 km de casă); seara la capătul Vărvăreuca (R16) (22.3 km de casă) |
| 302YEK | Căinarii Vechi | 19.7 | 21.9 | seara la capătul Baroncea (R14) (19.7 km de casă); dimineața la capătul Căinarii Vechi (R32) (1.2 km de casă) |
| 725CWN | Sîngerei | 16.3 | 19.2 | dimineața la capătul Iezărenii Vechi (R33) (16.3 km de casă); seara la capătul Copăceni (R19) (6.9 km de casă) |
| 224BZP | Catranîc | 30.4 | 18.4 | dimineața la uzină (30.4 km de casă); seara la capătul Catranîc (R24) (0.4 km de casă) |
| 763LYY | Băhrinești | 31.9 | 14.4 | dimineața la uzină (31.9 km de casă); seara la capătul Prajila (R17) (7.4 km de casă) |

Pe 07.09 lista e asemănătoare: 925FTI 51,5 · 912RNK 42,5 · 224BZP 31,9 · 763LYY 31,4 · 826GXP 30,1 · 447ASB 29,2 · 917FTI 26,6 ·
457BRAX 23,6 · 760BXI 23,7 · 441ASB 23,7 · 345KAJ 22,5 · 388ASB 22 · 302YEK 19,7 km. 925FTI e cazul greu: la ea capetele sunt la
21 km de casă, iar în zilele cu un singur schimb uzina e la 52 km.

## 3. Plusul din schimbul liniilor (a), calculat DUPĂ (b)

După (b), mașina nu mai merge acasă între curse, așa că liniile schimbate mai mută doar marginile zilei: drumul de dimineață
de acasă și drumul de seară spre casă. Cum am calculat (corecțiile din runda 1):
- **Calendar exact (C1/S4).** «Programul» unei mașini pe un schimb e format din cursele ei reale, fiecare pe data și sensul ei.
  O cursă nu se mai inventează. Cursele pe altă linie decât cea obișnuită rămân la mașina lor, ca «fixe». Proba de conservare
  (aceleași curse înainte și după, pe dată, loc și linie) trece: 658 de curse.
- **Optimizarea.** Algoritmul ungar pe fiecare schimb, cu celălalt schimb fixat; nu se acceptă niciodată un pas care strică. Apoi
  căutare locală cu schimb pe un schimb și schimb de program întreg (ambele schimburi deodată), până nu mai scade.
- **Normalizarea (C2/S1).** O mașină își ia înapoi programul propriu cu aceleași linii doar dacă suma nu crește. Se verifică prin
  controlul «optimizator ≤ după normalizare»; pe 14.09 și pe 07.09 n-a fost nevoie de nicio normalizare.
- **Lanțul (S8).** Lanțul e componenta legată a mutărilor, pe ambele schimburi. Textul numește LINIA, nu schimbul.
- **Rotația (B3).** Schimburile se inversează săptămânal. Un lanț se păstrează doar dacă taie ≥ 20 km/săpt. și pe săptămâna
  precedentă, cu aceleași mutări după linii. Cifra arătată e cea mai mică dintre cele două săptămâni.

| | 14–20.09 | 07–13.09 |
|---|---|---|
| km goi după (b), azi (model) | 16.009,9 | 16.265,0 |
| toate lanțurile găsite pe săptămâna însăși | −295,7 | −668,6 |
| **păstrate după proba rotației** | **−83,0 km/săpt.** (1 lanț) | **−653,7** (3 lanțuri; **neverificate pe rotație**, lipsește 31.08) |
| lei | — (lanțul are 763LYY fără normă) | ≈ 1.086 lei pe lanțurile cu normă |

Lanțul păstrat pe 14.09 (−83 km/săpt.; pe 07.09 aceleași mutări dau −252): «763LYY lasă Coșernița (R30) lui 713IZX, care stă la
Florești; 713IZX lasă Prajila (R17) lui 763LYY, care stă la Băhrinești.» Pe mașini: 763LYY −288, 713IZX +205.

Lăsate deoparte pe 14.09:
- 725CWN ↔ 830MUM (−81): pe 07.09, 725CWN nu face Iezărenii Vechi.
- 186OMM ↔ 744ARF (−60): pe 07.09, 744ARF nu face Bilicenii Vechi.
- 441ASB ↔ 727CWN (−37): pe 07.09 un program ar rămâne fără mașină.
- 144BRAZ ↔ 224BZP (−25): cursele s-ar suprapune pe 07.09.
- 447ASB ↔ 457BRAX (−10): sub prag.

Concluzia: **după (b), schimbul de linii aduce între 0 și ~650 km/săpt. și nu e stabil de la o săptămână la alta.** Liniile
mașinilor se schimbă și ele între săptămâni. Planul de schimb e un plus mic, de arătat doar cu lanțul verificat.

## 4. Controalele (14.09, cu rotația 07.09; aceleași și pe proba 07.09 fără scriere)

| Control | 14.09 | 07.09 |
|---|---|---|
| Teste pe funcțiile pure (`test.mjs`: calendar exact tur fără retur, (b), direct = min cu ocolul, conflict, conservare, ungar, componente pe ambele schimburi) | trec | — |
| Conservarea curselor (aceleași curse pe dată, loc, linie) | TRECE (658) | TRECE (676) |
| Fără două curse pe același loc în aceeași zi | TRECE | TRECE |
| Fiecare program la o singură mașină | TRECE (67) | TRECE (72) |
| Clasa și forma | TRECE | TRECE |
| Schimbul păstrat (mașina de un schimb rămâne de un schimb) | TRECE | TRECE |
| (b): azi − cu așteptare = Σ pe mașini, nicio mașină cu câștig negativ | TRECE (19.270,6 − 16.009,9 = 3.260,6) | TRECE (3.876,3) |
| (a): Σ lanțuri = diferența planului; după ≤ înainte | TRECE (83,0) | TRECE (653,7) |
| Normalizarea nu strică | TRECE (0 normalizări) | TRECE (0) |
| (b) model ↔ GPS pe ocol, ±10 %, mașinile ≥ 20 km/zi | TRECE (−8,8 %) | TRECE (+0,7 %) |
| Scriere: doar cu `--out` și cu toate controalele trecute; proba fără `--out` nu atinge cache-ul | verificat (cache-ul s-a schimbat doar la rularea cu `--out`) | fără scriere |

Nemăsurate destul pe GPS (< 3 zile): 549RNK (0/5), 518MHD (2/5), 804MUM (0/5), 144BRAZ (2/5). Au cifră de model, fără cifră GPS.

## 5. Ce trebuie întrebat

1. **Pentru fiecare mașină din lista «departe de casă»: cum ajunge șoferul acasă între curse?** 925FTI e prima, cu capetele la
   21 km și uzina la 52 km. Fără un răspuns, pârghia (b) rămâne propunere.
2. Ion confirmă că (b) e indicația principală, adică «între curse mașina rămâne la uzină / la capătul cursei următoare»,
   conform §12.1, iar schimbul de linii rămâne doar un plus?
3. Pentru 925FTI, 518MHD, 763LYY, 390ASB, 186OMM și 402VKV lipsesc normele, deci lei-ii lor nu se pot calcula. Le completăm sau
   folosim norma mediană a clasei, marcată «estimat»?
4. Schimbul de linii (a) se arată doar cu lanțurile verificate pe ambele săptămâni, cum e acum? Sau nu se mai arată deloc cât
   timp liniile mașinilor se schimbă de la o săptămână la alta?

## 6. Forma câmpului `planSchimb` (pentru partea B)

= JSON-ul întreg, fără `valhalla`, `cursefixe` și `control.*` detaliat, dacă se vrea mai mic:

```
{ sapt, pana, versiune, estimare,
  rotatie: { saptIso, verificatPe, regula },
  asteptare: { kmSapt, leiSapt, faraNorma: [m], gpsKmSapt, gpsMasini, rotatie: { sapt, kmSapt } | null,
    masini: [ { m, casa, zile, kmZi, kmSapt, gpsKmSapt|null, zileGps: "4/5", leiKm, leiSapt|null,
                undeAsteapta: "dimineața la capătul Musteața (R37) (21.6 km de casă); seara …", departeDeCasaKm|null,
                kmGoiSaptObicei, kmGoiSaptAsteapta } ],            // ordonate după kmSapt, doar kmSapt > 0
    departeDeCasa: [ { m, casa, departeDeCasaKm, undeAsteapta, kmZi } ] },   // > 15 km: întrebarea «cum ajunge șoferul acasă»
  schimb: { dupa: 'asteptare', kmSapt, leiSapt|null, lanturiFaraLei, faraNorma: [m],
    lanturi: [ { economieKmSapt /* min(săpt., rotație) */, economieSaptCurenta, economieRotatie|null, leiSapt|null, faraNorma,
                 peMasina: [ { m, kmSapt /* + = merge mai mult */ } ],
                 mutari: [ { linie /* cheie «tur>retur» */, tur, retur /* chei */, nume /* de afișat */, dela, la, zile, schimbInSaptamana } ],
                 text /* fără cifră */ } ],
    deoparte: [ { economieKmSapt, rotatie: { verificat, motiv?|ecKmSapt? }, masini, motiv } ],
    optim: { optimizator, dupaNormalizare, normalizate, cuToateLanturile } },
  masini: [ { m, casa, clasa, schimburi, leiKm, acasa,
              azi: { s1, s2, zile, kmGoiZi }, cuAsteptare: { kmGoiZi }, cuSchimb: { s1, s2, kmGoiZi, mutat }, asteptareKmZi } ],
  control: { conservare, farăSuprapuneri, fiecareProgramOData, capacitateSiForma, schimbPastrat, economieA, economieB,
             normalizareaNuStrica, asteptareModelVsGps }, cursefixe, valhalla }
```
`s1`/`s2` = nume de afișat sau `null`. Toate cifrele de km sunt «estimare» (model), în afară de `gpsKmSapt`.
