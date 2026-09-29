# ION-133 — runda 3: răspunsul la Codex runda 2 (5.0, fail: C1, C2 high; C3 medium)

Cod: vps/ziua-ideala-candidat.mjs (patch.mjs … patch8.mjs). Metoda din runda-2.md rămâne; se schimbă:

## C1 (high) — urmă insuficientă → NaN — ACCEPTAT, reparat
`plimbat()` întoarce pentru < 3 puncte `{ insuf: true, mijloc: 0, iesiri: 0, mijlocUzina: 0 }`; intervalul NU se reclasifică (plimb = 0),
nu intră în calibrare, se numără în `plimbatCalibrare.urmeInsuficiente` (14.09: 0). După calcul, `Number.isFinite(plimb)` altfel `throw`
(lanțul se oprește, nu scrie un rând cu NaN).

## C2 (high) — km obligatorii din mijloc numărați ca surplus — ACCEPTAT, reparat
`plimbat()` măsoară și `mijlocUzina` = km pe drumul din mijloc cu ambele puncte în zona uzinei (`laUzina`: raza porții + 1 km, parcul).
Surplusul (aplicare și calibrare, aceeași funcție `surplusMijloc`) = mijloc − min(km obligatorii ai intervalului, mijlocUzina) − max(0, L − ieșiri) − ocol.
Cazul Codex (rural → uzine → rural, 5 km obligatorii în mijloc): cei 5 km nu mai sunt «păstrat».

## C3 (medium) — validarea CAL — ACCEPTAT
Validare pe jumătăți nefolosite: CAL din zilele pare −2,3 (39 goluri), din cele impare −1,4 (25) — stabil sub 1 km. Pe sursa legăturii:
GPS mediana 0 (21 goluri), Valhalla × 1,05 −3,7 (43). → CAL pe sursă (≥ 20 goluri, altfel global; legătura mixtă → global): 14.09 gps 0,
valhalla −3,7, global −2,0. Totul e scris în `plimbatCalibrare` (CAL, CAL_SRC, validare).

## Simularea 14.09 după reparații
- Flota: 5.313,5 → 4.381,6 km măsurat (extrapolat 6.316 → 5.208); muncă (plimbat) 932,0; noapte 1.619,5 (=); ocol pe acasă 2.690,5 (=);
  acasaDrumLung 1.060,8 → 311,2; drumLung 198,3 → 16,0; mai scurt −255,6 (=); bilanț = economie; peste prag 23 → 19.
- Zile < −5: activ 5; candidat 6 (+186OMM 17.09 −5,3; 041BRAU −32,1 → −34,8); restul identice.
- 446ASB 221,3 → 133,3; 146BRAZ 199,9 → 112,8; 518MHD 457,4 → 374,1 (17.09: 108,8 → 79,2); 206BZP 106 → 33,9; 186OMM 106,9 → 37,1;
  713IZX 290,9 → 237,5; 710CWN 582,5 → 541,6; 925FTI 455 → ~445.
