# ION-133 — runda 4: răspunsul la Codex runda 3 (7.0, fail: C2 high; C3 medium)

Cod: vps/ziua-ideala-candidat.mjs (ultimele patch9.mjs, patch10.mjs). C1 închis în runda 3.

## C2 (high) — km obligatorii din mijloc: aproximarea geografică prea îngustă — ACCEPTAT, reparat
Zona km-ilor obligatorii = exact zona producătorului: categorii.mjs:157 `inZonaUz` (PR.ZONA_KM = 3 km de porți sau de parc). Producătorul
(§5.11, drumuriIntrePorti + categorii.mjs:320–330) dă km «între uzine» fie pentru mișcarea toată în această zonă, fie pentru porțiunea
poartă A → poartă B cu TOATE punctele în zonă; parcul e în zonă. Deci orice km obligatoriu al intervalului e pe puncte din `inZonaUz`:
`mijlocUzina` = km pe drumul din mijloc cu ambele puncte în această zonă (candidat:`inZonaProd`, ZONA_PROD_KM = 3), iar scăderea rămâne
min(km obligatorii ai intervalului, mijlocUzina) — nu scoate mai mult decât obligatoriul și acoperă tot obligatoriul aflat în mijloc.
Cazul Codex (10,66 km obligatorii, 5,93 scăzuți cu raza porții + 1 km): cu zona producătorului, toți cei 10,66 sunt în zonă → scăzuți.
Obligatoriul aflat în fazele terminale nu e în mijloc, deci nu e scăzut de două ori (fazele nu intră în «păstrat»).

## C3 (medium) — validare pe date nefolosite — ACCEPTAT
Validare încrucișată: CAL estimat pe zilele pare aplicat pe cele impare și invers; eroare absolută mediană (km) a surplusului pe golurile de control:
| | CAL pe cealaltă jumătate | fără CAL |
|---|---|---|
| toate | 2,5 / 2,9 | 2,1 |
| legături GPS (13 + 8) | 1,1 / 1,7 | 1,4 |
| legături Valhalla × 1,05 (26 + 17) | 3,1 / 2,5 | 4,3 |
→ decizia se ia din date: calibrare DOAR pe legăturile Valhalla (CAL_SRC.valhalla = −4,1 pe 14.09); GPS și mixte = 0. Totul e în
`plimbatCalibrare.validare.incrucisat`. Clasificarea independentă a golurilor cu rest0 > 2: auditorul Claude a urmărit pe traseu, în runda 1,
8 intervale cu cel mai mare plimbat (7 plimbat adevărat în Bălți / la capăt, 1 drum real — 912RNK 18.09, faza A; cu metoda nouă acel drum iese
din faze: faza A se oprește la ieșirea din rază, iar km de drum sunt în mijloc).

## Simularea 14.09
Flota 5.313,5 → 4.390,3 km măsurat (extrapolat 6.316 → 5.219); muncă 923,3; noapte 1.619,5 (=); ocol 2.690,5 (=); acasaDrumLung 320,0;
drumLung 15,9; mai scurt −255,6 (=); bilanț = economie; peste prag 23 → 19. 518MHD 457,4 → 373,8 (17.09: 108,8 → 79,1); 446ASB 221,3 → 137;
146BRAZ 199,9 → 112,7; 186OMM 106,9 → 35,6. Zile < −5: ca în runda 3.
