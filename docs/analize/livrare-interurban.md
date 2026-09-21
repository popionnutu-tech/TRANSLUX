# Livrarea (подача) pe cursele interurbane — 01–19.09.2026

Ion, 21.09.2026: «fa o analiza la livrari pe cursele interurbane, tu cunosti detailat
traseul, vezi cat in fiecare zi se face pe livrari, inca un moment daca soferul nu pleaca
la capat de ruta seara iar pleaca acolo dimineata - nu e livrare». (ION-22)

Se rulează din nou oricând:
`node --env-file=apps/admin/.env scripts/livrare-interurban.mjs --de=2026-09-01 --pana=2026-09-19 --csv=…`
— cu `--ruta=N --zi=… --detaliu` scoate lanțul de opriri al unei zile, cu poziția fiecărei
opriri pe kilometrajul rutei (așa s-au verificat cazurile de mai jos).

**Cursă cu cursă**, cu tabelul zilelor și lanțul opririlor pentru fiecare rută:
[`livrare-interurban-pe-rute.md`](livrare-interurban-pe-rute.md) (Ion, 21.09: «da pe fiecare
cursa detailat»). Se regenerează cu `--md=docs/analize/livrare-interurban-pe-rute.md`.

---

## Cifra cerută

19 zile, 29 de rute interurbane, 506 zile-rută cu date curate:

| | km/zi (toată flota interurbană) | lei/zi | pe lună (×30) |
|---|---|---|---|
| **Livrare brută** (tot golul de la capete) | **688** | **4.295** | ~129.000 lei |
| **Livrare după regula lui Ion** | **372** | **2.321** | ~70.000 lei |
| Km GPS, total | 14.539 | | |

Livrarea brută e 4,7 % din km-ii interurbani. Regula lui Ion taie 46 % din ea: în 171 din
506 zile-rută (34 %) mașina merge dimineața la capăt, dar seara nu mai ajunge acolo.

Costul unui km e cel din ION-19: normă × prețul ANRE al zilei + 1,00 lei/km reparație +
1,00 lei/km salariu. Autobuzele interurbane sunt Sprintere 515/516 (12,5–13,3 l/100 km),
deci ~6,2 lei/km la prețul de 35,2–35,9 lei/l din perioada asta.

---

## Cum s-a măsurat

O rută interurbană e o **linie cu kilometraj propriu**: `interurban_v2_stops` dă fiecărei
stații `km_from_start`, de la capătul de nord (0) până la Chișinău (242–302 km), pe 7
tarife; ruta se leagă de tariful ei prin `interurban_v2_tariffs.tariff_tur_id`. Asta e
„traseul detaliat": fiecare oprire GPS se așază pe linie, la stația cea mai apropiată.

Autobuzul doarme acasă la șofer — un punct **B** de pe linie sau lângă ea. Ziua lui e o
coborâre spre capăt, un urcuș până la Chișinău și o coborâre înapoi:

* **livrarea de dimineață** = de la B până la punctul **T** de unde începe efectiv cursa
  (tot ce e sub B, înainte de primul pasager);
* **livrarea de seară** = de la ultimul punct servit **E** înapoi la B (gol, după ce a
  lăsat lumea).

Km-ii sunt cei **măsurați pe drum** (`km_from_prev` din `lde_gps_stops`, scris de
gps-worker din urma GPS), nu în linie dreaptă.

Două lucruri au trebuit lămurite ca să iasă cifre adevărate:

1. **Drumul de dimineață nu are tronson propriu.** Prima oprire a zilei n-are „precedentă",
   deci km-ii de la locul de dormit până la ea se iau ca rest: `km_total − Σ km_from_prev`.
   Din rest se scot ÎNTÂI km-ii cârpiți (`km_patched`), care nu intră în tronsoane. Proba:
   805BXI, 17.09 — restul era 39,7 km cu mașina parcată toată noaptea acasă, adică exact
   cei 39,4 km de cârpeală. La 652AKD restul de 17,1 devine 13,4.
2. **Coborârea fără oprire se deduce din aritmetica liniei.** Dacă mașina coboară sub bază,
   ia oamenii din mers și urcă înapoi, punctul de întoarcere nu e o oprire:
   M = (B − T) + (F − T) ⇒ **T = (B + F − M) / 2**. La 652AKD, 17.09: B = Colicăuți 47,6 ·
   F = Briceni 44,5 · M = 13,4 ⇒ **T = 39,5** — adică Grimăncăuți (40,0), chiar capătul
   declarat al rutei. Formula se verifică singură: nimeni n-a spus scriptului unde e capătul.
   Deducerea se face doar când opririle înregistrate n-au ajuns deja la capăt, iar satul de
   lângă linie (Clocușna, la 8,9 km de Ocnița) se scade întâi — altfel ocolul lui ar semăna
   cu o coborâre.

Nu intră în cifră: 35 de zile-rută în care aceeași mașină avea în ziua aia ȘI o a doua rută
(263NSX face ruta 29 Ocnița și suburbana 51 Trebisăuți–Briceni în fiecare zi; 5 zile ruta 28
cu suburbana 45 ș.a.) — acolo „golul" de dimineață e de fapt cursa cealaltă. Alte 8 zile
n-au GPS.

---

## Pe rute (medii pe zi)

`dim` / `seara` = livrarea de dimineață și de seară. `la capăt` = în câte zile mașina a
ajuns la capătul declarat al rutei dimineața / seara. `cu regula` = ce rămâne după regula
lui Ion. `cap. neservit` = cât din capul rutei nu se face deloc.

| rută | capăt | zile | doarme la | km/zi GPS | dim | seara | livrare/zi | lei/zi | la capăt dim/seara | cu regula | lei/zi | cap. neservit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 27 | Lipcani | 18 | Bulboaca | 585 | 54,8 | 15,5 | **70,2** | 435 | 18/1 | 18,0 | 113 | 0 |
| 28 | Criva | 13 | Briceni | 586 | 42,8 | 24,7 | **67,5** | 418 | 12/0 | 28,2 | 174 | 0,8 |
| 22 | Lipcani | 18 | Briceni | 593 | 42,8 | 24,2 | **67,0** | 416 | 18/8 | 42,6 | 265 | 0 |
| 26 | Corjeuți | 19 | Halahora de Sus | 571 | 40,8 | 13,7 | **54,4** | 338 | 19/0 | 13,7 | 85 | 0 |
| 21 | Otaci | 19 | Clocușna | 556 | 46,4 | 2,5 | **48,9** | 316 | 16/0 | 5,4 | 35 | 4,0 |
| 9 | Criva | 19 | Briceni | 564 | 43,0 | 4,1 | **47,2** | 293 | 19/0 | 4,1 | 26 | 0 |
| 1 | Grimăncăuți | 14 | Colicăuți | 593 | 5,7 | 27,9 | **33,6** | 209 | 13/11 | 33,2 | 207 | 0,2 |
| 23 | Criva | 18 | Lipcani | 569 | 22,9 | 9,7 | **32,6** | 203 | 18/0 | 9,7 | 60 | 0 |
| 6 | Corjeuți | 18 | Fetești | 517 | 19,4 | 13,0 | **32,4** | 201 | 17/17 | 30,8 | 191 | 0,3 |
| 24 | Criva | 19 | Beleavinți | 562 | 26,0 | 2,7 | **28,7** | 178 | 17/0 | 3,7 | 23 | 1,1 |
| 16 | Lipcani | 18 | Beleavinți | 565 | 18,3 | 9,4 | **27,7** | 171 | 17/12 | 23,5 | 146 | 0,7 |
| 20 | Criva | 18 | Cotiujeni | 511 | 18,4 | 8,5 | **26,9** | 168 | 0/0 | 26,9 | 168 | 17,0 |
| 18 | Lipcani | 16 | Viișoara | 545 | 11,4 | 11,5 | **22,9** | 143 | 9/9 | 19,2 | 120 | 4,3 |
| 5 | Șirăuți | 19 | Corpaci | 515 | 19,3 | 2,5 | **21,8** | 134 | 6/6 | 21,8 | 134 | 37,7 |
| 8 | Criva | 19 | Drepcăuți | 544 | 16,1 | 4,4 | **20,5** | 134 | 19/2 | 6,9 | 45 | 0 |
| 59 | Ocnița | 17 | Rujnița | 506 | 17,0 | 2,6 | **19,5** | 121 | 16/7 | 5,9 | 37 | 8,1 |
| 2 | Briceni | 19 | Cotiujeni | 572 | 6,8 | 12,3 | **19,1** | 124 | 19/19 | 19,1 | 124 | 0 |
| 3 | Ocnița | 19 | Ocnița (Iubileinîi) | 508 | 10,3 | 4,3 | **14,7** | 94 | 19/19 | 14,7 | 94 | 0 |
| 19 | Lipcani | 19 | Drepcăuți | 570 | 7,7 | 6,6 | **14,4** | 89 | 19/18 | 14,4 | 89 | 0 |
| 58 | Otaci | 19 | Chișinău (Ciocana) | 508 | 9,5 | 1,4 | **10,9** | 68 | 0/0 | 10,9 | 68 | 26,0 |
| 25 | Caracușenii Vechi | 19 | Trestieni | 502 | 7,0 | 2,7 | **9,7** | 60 | 18/18 | 9,7 | 60 | 0,4 |
| 7 | Criva | 19 | Criva | 556 | 8,9 | 0,3 | **9,2** | 57 | 19/16 | 4,1 | 25 | 0 |
| 17 | Criva (Tețcani) | 19 | Berlinți | 515 | 1,8 | 6,9 | **8,7** | 54 | 0/0 | 8,7 | 54 | 24,0 |
| 11 | Criva | 19 | Chișinău (Ciocana) | 559 | 4,0 | 4,7 | **8,6** | 53 | 19/19 | 8,6 | 53 | 0 |
| 14 | Criva | 15 | Chișinău (Ciocana) | 554 | 2,4 | 3,8 | **6,3** | 39 | 15/15 | 6,3 | 39 | 0 |
| 10 | Lipcani | 19 | Chișinău (Ciocana) | 520 | 3,6 | 2,1 | **5,7** | 35 | 17/16 | 3,1 | 19 | 2,8 |
| 12 | Lipcani | 19 | Chișinău (Ciocana) | 533 | 2,5 | 3,1 | **5,6** | 36 | 18/18 | 5,6 | 36 | 1,4 |
| 15 | Criva | 19 | Chișinău (Ciocana) | 535 | 1,8 | 1,9 | **3,8** | 23 | 19/19 | 3,8 | 23 | 0 |

Ruta 29 (Ocnița, 263NSX) nu e în tabel: mașina ei face în fiecare zi și suburbana 51
Trebisăuți–Briceni, deci golul ei de dimineață nu se poate separa de cursa cealaltă.

**Cele șase rute care dorm în Chișinău (10, 11, 12, 14, 15, 58) au livrare aproape zero** —
3,8–10,9 km/zi, doar plimbarea prin oraș între locul de parcare și autogară. Toată livrarea
interurbană vine de la mașinile care dorm în nord, acasă la șofer. **Primele șase rute
(27, 28, 22, 26, 21, 9) fac 355 km/zi — mai mult de jumătate din toată livrarea.**

## Pe zile (toată flota interurbană)

| zi | curse | km GPS | km rută | livrare | cu regula | lei (cu regula) | zile cu excepție |
|---|---|---|---|---|---|---|---|
| 01.09 | 28 | 15.513 | 14.616 | 860 | 367 | 2.253 | 10 |
| 02.09 | 28 | 14.586 | 13.949 | 799 | 506 | 3.089 | 9 |
| 03.09 | 25 | 13.893 | 13.349 | 707 | 413 | 2.526 | 8 |
| 04.09 | 25 | 13.295 | 12.619 | 571 | 287 | 1.755 | 9 |
| 05.09 | 28 | 15.058 | 14.621 | 479 | 183 | 1.119 | 11 |
| 06.09 | 27 | 14.273 | 13.798 | 580 | 250 | 1.536 | 11 |
| 07.09 | 27 | 14.563 | 13.858 | 737 | 479 | 2.969 | 9 |
| 08.09 | 28 | 15.639 | 14.542 | 1.126 | 565 | 3.458 | 11 |
| 09.09 | 25 | 13.689 | 13.079 | 552 | 305 | 1.876 | 8 |
| 10.09 | 25 | 13.464 | 12.808 | 656 | 328 | 2.022 | 8 |
| 11.09 | 27 | 15.037 | 14.301 | 752 | 461 | 2.860 | 9 |
| 12.09 | 28 | 15.049 | 14.698 | 599 | 298 | 1.876 | 10 |
| 13.09 | 27 | 14.719 | 14.164 | 601 | 258 | 1.625 | 11 |
| 14.09 | 26 | 14.441 | 13.649 | 672 | 450 | 2.853 | 6 |
| 15.09 | 28 | 15.554 | 14.706 | 873 | 481 | 3.042 | 10 |
| 16.09 | 25 | 13.999 | 13.313 | 660 | 402 | 2.567 | 8 |
| 17.09 | 27 | 14.982 | 14.289 | 670 | 376 | 2.415 | 8 |
| 18.09 | 26 | 14.323 | 13.722 | 606 | 336 | 2.186 | 8 |
| 19.09 | 26 | 14.163 | 13.645 | 568 | 318 | 2.071 | 7 |

Ziua nu începe la miezul nopții: fereastra GPS e 03:00 → 03:00 (workerul taie pe UTC), ceea
ce e chiar bine — cursele care intră în Chișinău la 00:05 rămân în ziua lor.

---

## Trei zile verificate cu mâna

**1. Ruta 1 «Grimăncăuți – Chișinău», 652AKD, 17.09 — capătul se face în ambele sensuri.**
Doarme la Colicăuți (km 47,6 pe linie), pleacă 02:43, la 03:08 e la Briceni (44,5): 13,4 km
măsurați pe 3,1 km de diferență ⇒ a coborât până la 39,5, adică Grimăncăuți (40,0).
**Livrare dimineața 8,5 km.** Seara se întoarce de la Chișinău, trece Briceni 15:38, merge
până la Lipcani (17,5) la 16:08 — ultimul om lăsat — și urcă gol înapoi: Briceni 16:37,
Colicăuți 17:29. **Livrare seara 34 km.** Total 42,4 km, 271 lei.

**2. Ruta 28 «Criva – Chișinău», 692 TWK, 16.09 — cazul exact din regula lui Ion.**
Doarme la Briceni (44,5). Dimineața coboară 55,5 km până la Lipcani (17,5) pe 27 km de
diferență ⇒ a fost până la Criva (3,8), capătul rutei, și s-a întors luând oamenii.
**Livrare dimineața 62 km.** Seara, la retur, coboară doar până la Lipcani (17,5) la 20:40
și urcă înapoi la Briceni: **livrare seara 27,5 km.** Regula lui Ion scoate dimineața (la
capăt, seara, n-a fost) și lasă 27,5 km.

**3. Ruta 21 «Chișinău – Otaci», 805BXI, 17.09 — aceeași formă, cu casa în afara liniei.**
Doarme la Clocușna (8,9 km de Ocnița, km 26). Pleacă la 10:43, face 44,1 km goi până la
Otaci (0), de unde începe cursa la 12:37. Seara vine de la Chișinău și se oprește ACASĂ, la
Clocușna, 23:27 — la capăt (Otaci) nu mai merge. **Livrare seara 0.** Cu regula lui Ion,
ziua asta iese cu 0 livrare; brut, 44,1 km.

---

## Ce mai iese la iveală, pe lângă livrare

**Ruta 1 face 85 km/zi în afara rutei.** 652AKD ajunge la Chișinău (Ciocana) la 07:28,
pleacă la 07:45 spre Orhei (46 km), se întoarce la 09:46 și abia la 11:31 pleacă în retur.
92,9 km în fiecare zi, ~1.600 km pe perioadă, care nu-s nici rută, nici livrare. Dacă e
cursă separată, trebuie numărată ca atare; dacă nu, e cea mai mare gaură din tabel.

**Patru rute nu ajung niciodată la capătul lor declarat:**

| rută | capăt scris | unde se termină de fapt | km neserviți |
|---|---|---|---|
| 5 | Șirăuți (km 6) | pe la Bădragii Vechi (km 44) | 37,7 |
| 58 | Otaci (km 0) | Ocnița (km 26) | 26,0 |
| 17 | Criva (km 3,5) | pe la Tețcani (km 34,5) | 24,0 |
| 20 | Criva (km 3,5) | pe la Lipcani (km 17,5) | 17,0 |

Ruta 5 e scrisă «Șirăuți – Chișinău», dar mașina doarme la Corpaci și pornește de acolo;
ruta 17 e «Criva (Tețcani)» și pleacă chiar din Tețcani. Două citiri: ori denumirea rutei e
veche, ori capul rutei chiar nu se face. Se vede doar întrebându-i pe oameni.

**Km-ii tarifului sunt cu ~4 % peste GPS.** Pe rutele care dorm în Chișinău, unde livrarea e
aproape zero, GPS-ul arată 520–560 km/zi față de 545–585 km de tarif. Nu schimbă analiza
livrării, dar contează dacă cifrele astea se folosesc la decont.

---

## Ce rămâne de lămurit cu Ion

1. **Regula «dacă seara nu merge la capăt, dimineața nu e livrare»** e aplicată exact cum a
   fost scrisă și taie jumătate din cifră (688 → 372 km/zi). Cel mai clar caz e ruta 28:
   mașina doarme la Briceni, face ~43 km goi până la Criva în fiecare dimineață ca să
   pornească cursa, iar seara se oprește la Lipcani și urcă ~25 km goi acasă. Cu regula, se
   numără doar cei de seară. E ce s-a vrut?
2. **Ruta 1: cei 92,9 km Chișinău → Orhei → Chișinău** de fiecare dimineață — cursă separată
   sau gol?
3. **Rutele care nu-și fac capul** (5, 17, 20, 58) — denumire veche sau km nefăcuți?
4. **Ruta 29 și celelalte 35 de zile cu două rute pe aceeași mașină** — livrarea se numără
   pe mașină (ca la uzine, ION-19) sau pe rută?
