# ION-124 — runda 5: triajul Codex r4 (r4/codex-runda-4.json: fail, C1–C3 high, C5–C6 medium — TOATE ACCEPTATE, reparate în r5/vps/, diff r5/vps/ion124.diff)

- C1 (suprapunerea retur/tur): opririle se atribuie exclusiv ÎNAINTE de deduplicare (distincte() după atribuire); fără odihnă ≥ 20 min, orice suprapunere în TIMP
  (ultima oprire a returului după prima a turului) sau în LOC (≤ 150 m) între opririle celor două = ambele «prelungire ambiguă»; la sfârșit, verificarea
  nesuprapunerii limitelor finale pe TOATE perechile vecine (dacă x.t1 > y.t0, prelungirile revin la limitele de dinainte, steag ambiguă). P12: cazul Codex (vizite
  de 8 s + reveniri de 30 s la aceleași 3 locuri) → ambele ambigue, fără suprapunere.
- C2 (fereastra): a = max(sfârșitul cursei dinainte, tCap − 45 min) la tur, b = min(începutul cursei următoare, tCap + 45 min) la retur; opririle se identifică pe
  TOATĂ urma, apoi rămân doar cele întregi în [a, b] (șirul care taie marginea nu intră). P12: opriri la 10/15/20 min pentru un tur la 100 min → nu; oprire care
  începe cu 30 s înaintea ferestrei + alte două → nu.
- C3 (coordonata): medianaCorecta (media celor două centrale la număr par); bucata serializată ia de / pana din prelungit.de / prelungit.pana la cursa prelungită,
  iar P9, patru-reguli (capatIn / capatSf) și ziua-ideala citesc aceste de / pana. P12: mediana 47,6385 / 47,6389 = 47,6387.
- C5 (R-1 «același oraș»): starea nopții nu mai respinge «turul pornește din altă localitate» când returul și turul sunt prelungite prin același oraș.
- C6 (dovezi): r5/final.json = tabelul înainte / după pe cele 18 mașini marcate + flota + P9 pe cursele R19 Bilicenii (prelungite / neprelungite) + P12 + extrasele GPS
  830MUM 14.09 (05:30–06:20, 16:10–16:50) arhivate.

## Rezultatul final (simulare 14.09 pe codul din r5/vps, nimic scris)
Probe: P1–P11 trec, P12 15/15, bilanț 195/195, P10 38/38. Curse prelungite: 7 (830MUM 5: 14.09 tur 4 urcări și retur 5; 16.09 retur 3; 18.09 tur 3 și retur 3;
186OMM 2: 17.09 și 18.09 tur prin Rîșcani), 0 ambigue.
| mașina | oraș | ziua ideală km/săpt. | 3 reguli | prelungiri |
|---|---|---|---|---|
| 518MHD | Floresti 42, Marculesti 2 | 571.8 → 571.8 | 318.4 → 318.4 | — |
| 925FTI | Falesti 28 | 455 → 455 | 350.5 → 350.5 | — |
| 446ASB | Falesti 28 | 337.6 → 337.6 | 3.1 → 3.1 | — |
| 457BRAX | Riscani 43 | 329.5 → 329.5 | 255.3 → 255.3 | — |
| 345KAJ | Riscani 43, Costesti 4 | 319.3 → 319.3 | 141 → 141 | — |
| 713IZX | Marculesti 3 | 290.9 → 290.9 | 202.3 → 202.3 | — |
| 830MUM | Singerei 69 | 202.3 → 139.5 | 46.4 → 23.8 | 2026-09-14 05:46–06:18 tur Singerei 4 urcări; 2026-09-14 15:55–16:42 retur Singerei 5 urcări; 2026-09-16 15:52–16:26 retur Singerei 3 urcări; 2026-09-18 05:46–06:18 tur Singerei 3 urcări; 2026-09-18 15:53–16:22 retur Singerei 3 urcări |
| 725CWN | Singerei 69 | 197 → 197 | 74.3 → 74.3 | — |
| 388ASB | Drochia 21 | 179.7 → 179.7 | 165.9 → 165.9 | — |
| 744ARF | Singerei 69 | 156.7 → 156.7 | 87.9 → 87.9 | — |
| 186OMM | Riscani 43 | 134.6 → 106.9 | 9.9 → 9.9 | 2026-09-17 13:47–14:46 tur Riscani 3 urcări; 2026-09-18 13:39–14:43 tur Riscani 6 urcări |
| 402VKV | Glodeni 54 | 134.1 → 134.1 | 9 → 9 | — |
| 715IZX | Biruinta 26 | 106.2 → 106.2 | 3.7 → 3.7 | — |
| 435ASB | Singerei 69 | 87.5 → 87.5 | 0 → 0 | — |
| 350KAJ | Floresti 42, Marculesti 2 | 58.5 → 58.5 | 4.2 → 4.2 | — |
| 293QVT | Ghindesti 8 | 34.4 → 34.4 | 0 → 0 | — |
| 763LYY | Marculesti 3 | 31.3 → 31.3 | 16.6 → 16.6 | — |
| 024XKY | Drochia 21 | 0 → 0 | 0 → 0 | — |
FLOTA {"ziuaIdeala":[5489.1,5423.8],"reguli3":[3241.1,3218.5],"categorii":{"cuOameni":[26842.8,26914.5],"livrare":[9335.3,9282.2],"legatura":[7622.5,7603.7],"golRuta":[5190.9,5190.9]}}
P9 R19 ["435ASB 2026-09-16 neprelungit 15.7/17.2 ok","830MUM 2026-09-14 prelungit 8.2/4.6 pică","830MUM 2026-09-15 neprelungit 17.3/7.5 pică","830MUM 2026-09-17 neprelungit 17.4/7.5 pică","830MUM 2026-09-18 prelungit 8.1/4.6 pică"]

Restul, spus deschis: 830MUM 15.09 și 17.09 au sub 3 urcări clare în Sîngerei → neprelungite; P9 le arată (livrarea de dimineață 17,3 / 17,4 km față de 7,5
pe drumul direct), la fel și prelungitele (8,2 / 8,1 față de 4,6: drumul prin oraș până la prima urcare din est). P9 e probă independentă, nu blocantă.
Întrebarea pentru Codex: C1–C6 închise? ce mai lipsește înainte de scriere; scor; high doar cu scenariu concret.
