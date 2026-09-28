# ION-124 — runda 4: implementarea (Codex r3 9,5 pass pe specificație; C4 low — proba cu ore coerente, făcut) și două abateri de la specificație cerute de DATE

Codul (r4/vps/: categorii.mjs, probe.mjs, patru-reguli.mjs; r4/vps/ion124.diff față de .bak-ion124): ORAS_RUTA (orașele din actul rutei cu angajați, punctul
OSM town/city), urcariOras, prelungesteCurse (fereastra mărginită de cursele vecine, odihna ≥ 20 min împarte golul retur → tur, altfel «prelungire ambiguă»,
continuitatea fără staționare > 5 min, ≥ 3 urcări la ≥ 150 m, excluderea locului nopții și a odihnei la ≤ 0,4 km), apelată în clasifica ÎNAINTE de goluri;
cursa poartă prelungit { oras, n, de | pana, dinTCap }; patru-reguli: capătul efectiv (capatSf / capatIn, «același oraș») la R-1, la jumătățile de weekend și
la costul R-3; probe.mjs: P9 pe capătul efectiv, P12 (11 cazuri sintetice pe funcția reală, exitCode 3 la eșec).

## Abaterea 1 — durata opririi (datele trackerului, r4/dbg2.mjs)
Trackerul trimite la oprire UN punct lent, apoi tace cât stă mașina (20–30 s) și trimite următorul punct la câțiva metri: 830MUM 14.09: 05:46:42 v6 → 05:47:07
(25 s, 17 m); 05:49:20 v0 → 05:49:43 (23 s, 19 m); 05:50:57 v0 → 05:51:21 (24 s, 22 m). «Durata = de la primul la ultimul punct lent» (runda-2) dă 0 s la aproape
toate opririle reale → nicio prelungire (prima rulare: 0 urcări la 830MUM). Acum: durata = de la primul punct lent la primul punct de după șir, dacă acela e la
≤ 50 m de ultimul punct lent și în ≤ 5 min (mașina n-a plecat); altfel durata șirului. Gol GPS în mers (punctul următor departe) nu e oprire (proba P12
actualizată: următorul punct la 1 km). Asta e exact ce Codex r1 C3 numea «durata include punctele vecine» — aici doar vecinul următor, cu condiția de 50 m.
## Abaterea 2 — coborârile sunt mai scurte (r4/dbg5.mjs)
830MUM 14.09, returul Bilicenii 16:14 → Sîngerei: opriri de 7–13 s la 1,75 / 0,71 / 2,08 / 0,51 / 2,03 km de centrul Sîngereiului, apoi acasă 16:44 (lasă oamenii
prin oraș). Pragul de 15 s le rata pe toate. Acum: retur (coborâri) 5 s – 5 min, tur (urcări) 15 s – 5 min; ≥ 3 puncte distincte rămâne (semaforul repetat = un punct).
P12: «retur cu 3 coborâri de 8–10 s → prelungit», «tur cu opriri de 8–10 s → nu».

## Rezultatul (simulare 14.09, nimic scris; /tmp/p124-sim)
- Probele: P1–P11 trec, P12 11/11, bilanț 195/195, P10 38/38.
- Curse prelungite: 6 (830MUM 4, 186OMM 2), 0 ambigue. Categorii: cu oameni 27.676,3 → ≈ 27.715 (+38 la prima variantă), livrare −, legătură −.
- 830MUM: ziua ideală 202,3 → 176,8 km/săpt.; cele 3 reguli 46,4 → 35,7. 186OMM: 134,6 → 106,9. Flota: ziua ideală 5.489,1 → 5.446,2; cele 3 reguli 3.241,1 → 3.230,4;
  R1b 2.713,1 → 2.702,4. Analistul estima ≈ 95 km/săpt. (830MUM 89): detectorul strict (≥ 3 opriri distincte) prelungește doar cursele cu urcări clare; restul
  trecerilor prin oraș au sub 3 opriri (ex. 830MUM 15.09 tur: 2 urcări, 15 s și 19 s) și rămân cum sunt.
Întrebarea pentru Codex: abaterile 1 și 2 sunt acceptabile? implementarea respectă runda-2 + runda-3? ce lipsește înainte de scriere; scor; high doar cu scenariu.
