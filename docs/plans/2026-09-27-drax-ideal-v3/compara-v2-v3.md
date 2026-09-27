# Comparația v2 → v3 pe km GPS, linie cu linie (ION-97, 27.09.2026)

Script: `date/ideal-v3/proba/cod/compara-v2-v3.mjs <v2> <v3>` (copia în repo: `docs/plans/2026-09-27-drax-ideal-v3/vps/probe/`). Pe fiecare set
calculează cu modulul COMUN al verificatorului (`/home/verif/verificator/cod/etalon-gps.mjs`, import doar-citire, pragurile din `card-gps.mjs`)
etalonul GPS completat pe poarta sensului și ture/zi GPS în ambele variante (dedup ±3 min între mașini = implicitul verificatorului / doar pe aceeași
mașină = regula v3). `compara.mjs` al verificatorului cere `controale.json` dintr-o rulare `drax.mjs` (verificarea 3, a sesiunii), deci nu l-am folosit.
Referința v2 = copia ieșirilor v2 în `date/ideal-v3/proba/v2/` (sha identice cu `date/ideal-v2/`). Setul v3 = rularea P2 (toate corecțiile de lanț).

## Ce s-a schimbat (toate liniile cu cel puțin o diferență; restul de 91 identice)

| rută|linie | card km v2 → v3 | ture/zi v2 → v3 | km/zi card v2 → v3 | etalon GPS v2 → v3 | ture/zi GPS (dedup între mașini / doar aceeași mașină) v2 → v3 | observații v2 → v3 | regim v2 → v3 | ziua aleasă v2 → v3 | steag v3 |
|---|---|---|---|---|---|---|---|---|---|
| R32|Trifanesti | 42.3 → 42.3 | 2 → 4 | 169.2 → 338.4 | 41.2 → 41.2 | 2/4 → 2/4 | 378 → 378 | doar s1 → doar s1 | 2026-09-23 s1 146BRAZ → 2026-09-23 s1 146BRAZ | C47 42 % |
| R7|Slobozia* | — → — | — → — | — → — | — → — | —/— → —/— | 237 → 98 | ambele →  |  →  |  |

linii cu diferențe: 2
km/zi card (fără informative): v2 5765.6 → v3 5934.8
km/zi GPS (2 × etalon × ture/zi GPS, linii din act): dedup între mașini v2 5818.4 → v3 5818.4 · doar aceeași mașină v2 5983.2 → v3 5983.2
observații cu rută: v2 13672 → v3 13533 · R7|Slobozia*: v2 237 → v3 98
v2: salturi poartă→altă poartă ≤5 km 7731 · observații din salturi 139 {"R7|Slobozia*":139}
v3: salturi poartă→altă poartă ≤5 km 7731 · observații din salturi 0 {}
v3: bucle pe ACEEAȘI poartă ≤5 km 63 · cu rută 0 {}

## Citire

- **Card și etalon GPS: 0 linii schimbate.** Nicio corecție de lanț nu mută km-ul vreunei linii (cardul rămâne etalonul GPS completat pe 41 de linii
  și cardul vechi cu steag pe 7).
- **R32 Trifanesti** — singura schimbare de km/zi: ture/zi 2 → 4 din pct. 5 (146BRAZ + 518MHD nu se mai contopesc). Etalonul GPS rămâne 41,2
  (40 de zile, amestec de două drumuri: 146BRAZ 40,2 / 518MHD 52,9 — vezi faza 2), cardul vechi 42,3 rămâne din cauza steagului C47 42 %.
  Km/zi card 169,2 → 338,4. Km/zi GPS cu 2 ture 164,8, cu 4 ture 329,6.
- **R7 Slobozia\*** — 139 de observații din salturi scoase (237 → 98); linia n-are ideal, deci 0 km/zi; regimul ei («ambele») dispare.
- **Regimul:** identic pe toate cele 61 de linii rămase (faza A ≡ impare, B ≡ pare pe fereastra de azi).
- **Ora:** identică pe toate cele 13.672 de observații (vara).

## Pe flotă

| | v2 | v3 | Δ |
|---|---:|---:|---:|
| km/zi card (linii cu ideal, fără informative) | 5.765,6 | 5.934,8 | +169,2 |
| km/zi GPS, ture/zi cu dedup între mașini (verificatorul azi) | 5.818,4 | 5.818,4 | 0 |
| km/zi GPS, ture/zi doar pe aceeași mașină (regula v3) | 5.983,2 | 5.983,2 | 0 |
| observații cu rută | 13.672 | 13.533 | −139 |
| salturi ≤ 5 km atribuite unei linii | 139 obs. (R7 Slobozia*) | 0 | −139 |
| coliziuni `m|t0` în alege | 0 | 0 | 0 |
