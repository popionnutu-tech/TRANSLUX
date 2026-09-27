# Runda 7 — R3 Nihoreni — poziția verificatorului

Sursa cifrelor: diagnosticul C44 `r7-nihoreni.mjs` pe RUN `drax-v15-1790539226` (`in/obs-ideal.json`, `in/curse-ideal.json`),
septembrie, perechi cu schimb, fără `rt`, ora Intl Europe/Chisinau, km completați cu raza porții (EST 0,6 / VEST 0,5).
Capăt Nihoreni 47,9395 / 27,5614 (`schelet-ideal.json`). Grupa: alternanța cu faza majoritară (săpt. 21.09: s1 = D).

## Ce arată urma

| grupă | sens | poartă | n | de la tăietura la capăt (C10) | de la prima/ultima oprire ≤ 4,5 km | oprire la nord de capăt |
|---|---|---|---|---|---|---|
| D (186OMM) | tur | EST 14/14 | 14 | 52,6 | **50,0** | 14/14, până la 2,2 km |
| D | retur | EST | 18 / 16 | 50,5 | **49,3** | 15/18 |
| EZ (345KAJ, 457BRAX) | tur | VEST 18/18 | 18 | 42,8 | **42,5** | 18/18, până la 2,0 km |
| EZ | retur | EST | 19 / 15 | 42,6 | **44,2** | 15/19 |

Perechi zilnice: D = 186OMM (singura excepție: 05.09 sâmbătă 345KAJ), EZ = 345KAJ până la 11.09, apoi 457BRAX; ambele grupe în aceeași zi
în 9 din 19 zile, în rest una singură (ex. 15–18.09 doar 457BRAX EZ).

Cursă cu cursă (07–24.09): **ambele grupe opresc în Rîșcani la fiecare tur**, nu doar D. Diferența stă numai în zona Nihoreni–Rîșcani:
- D vine dinspre uzină (doarme lângă Dacia), trece pe lângă Nihoreni, urcă în Rîșcani și face bucla Rîșcani → Nihoreni → Rîșcani:
  6,4–10,7 km între prima și ultima oprire din zonă (07.09: 39,2 → 45,6; 22.09: 40,7 → 51,4);
- EZ face o singură trecere: 4,5–6,6 km în zonă (07.09: 17,6 → 22,1; 22.09: 28,3 → 34,9);
- de la ultima oprire din zonă până la poartă drumul e același: 22.09 D 39,6 km (EST), EZ 39,9 km (VEST).
- Pe aceeași poartă (retur, EST, ambele) D 50,5 față de EZ 42,6: afirmația din runda 3 («pe aceeași poartă D și EZ merg pe același drum,
  44,6 / 45,0») **nu se reproduce**; o retrag.
- Tăietura la prima apropiere de capăt (C10) e părtinitoare pe direcția de sosire: D sosește dinspre sud (bucla intră în km), EZ din
  Rîșcani/Hîjdieni (prima oprire din Rîșcani rămâne înaintea tăieturii; la retur ultima oprire rămâne după): −1,6 … −1,9 km pentru EZ.
  De aceea etalonul verificatorului (poarta sensului, tur = VEST, deci doar EZ) iese 42,3 și nu vede D deloc la tur (20 de picioare pe
  «altă poartă» în v15).

## Răspunsuri

**(1) Bucla prin Rîșcani e parte a liniei? DA.** Rîșcani e al doilea sat din act, 84 % tururi / 70 % retururi (`regulate-ideal.json`),
43 din 66 de angajați, iar ambele grupe opresc acolo. Capătul rămâne Nihoreni (§4.1, C9, C48: mutarea NU, raportarea DA). Adâncimea
buclei depinde de grupă (D are 32 din cei 43 din Rîșcani), nu de schimb — de aceea D6 (s1 ≠ s2) nu o poate prinde: grupele se rotesc.

**(2) Cardul: 46,4 × 2 = 185,4 km/zi — DE ACORD, cu metoda precizată.** Regula: unitatea = rută × linie, un km pe linie (§5); linia are
zilnic o pereche D și una EZ, deci km/zi real = 2·D + 2·EZ = 4 × media grupelor; mediana pe toate picioarele e nepotrivită aici pentru
că distribuția e bimodală (42–44 față de 49–50, aproape fără suprapunere) și ar lua grupa cu mai multe zile. Măsura: de la prima
oprire în zona ≤ 4,5 km de capăt (tur) / până la ultima (retur), + raza porții. Cifrele mele: D (50,0 + 49,3)/2 = 49,7, EZ (42,5 +
44,2)/2 = 43,4, media **46,5** (sesiunea 46,4; diferența 0,1 km, 0,8 km/zi). Față de card: +8,6 km/zi (176,8 → 185,4); față de kmZi
GPS al verificatorului 169,2: +16,2, tot din tăietura părtinitoare și din poarta sensului.
Cardul nu e un drum: niciun autobuz nu face 46,4. Harta (ziua aleasă 457BRAX 23.09, EZ, real ~44,5) rămâne în ±5 % (C23, 4,3 %).

**(3) §6.6 — textul propus:** «R3 Nihoreni: ambele grupe opresc în Nihoreni și Rîșcani. Grupa D (majoritatea celor din Rîșcani) face
bucla Rîșcani → Nihoreni → Rîșcani, grupa EZ o singură trecere; de la ieșirea din Rîșcani drumul spre uzină e același. Km liniei =
media km GPS ai celor două grupe, măsurați de la prima oprire în zona Nihoreni–Rîșcani (≤ 4,5 km de capăt) până la poartă și invers,
cu raza porții: D 49,7, EZ 43,4, card 46,4 × 2 ture/zi. Capătul rămâne Nihoreni.» Textul neaplicat al migrației 417 («D și EZ merg
pe același drum, un card 44,2») e fals pe urmă și nu se aplică.

## Observații și scor

- **HIGH (scenariu):** cu metoda `card-vechi` și cardul 46,4, `drax.mjs` compară cardul cu etalonul poarta-sensului 42,3 → G1 9,7 %
  > 5 % = **blocant** la verificarea următoare (ca R18 în v15), `valid_pentru_export` = false; C47 cade pe picioarele D. Trebuie, înainte
  de scriere: fie o metodă nouă în `decizii` + `etalon-gps.mjs` («media-grupelor», zona ≤ 4,5 km; schimbare de script = propunere
  aprobată de sesiune, nu în timpul unei verificări), fie o explicație G1/C47 în registru semnată pe sha-ul candidatului. Scriere doar
  în `drax/date/ideal-v2/` (candidat), nu pe loc.
- MEDIUM: premisa «bucla doar la D» e greșită (EZ oprește în Rîșcani 18/18 tururi); corectată în §6.6 de mai sus. Nu schimbă cifra.
- LOW: D retur 53,3 (sesiunea) nu se reproduce pe opririle cu nume: 49,3, n16, maxim 50,2; cardul e insensibil (46,4 vs 46,5).
  Probabil sesiunea a mers pe urma brută până la oprirea de 3,2 km; ar trebui spus pe ce puncte.
- LOW: grupa pe zi = pe mașină (186OMM = D, 19 din 20 de zile). Dacă 186OMM pleacă de pe linie, media se recalculează; de pus în §6.6
  că măsura e pe grupă, nu pe mașină.

**Scor: 10 − (2 + 1 + 0,5 + 0,5) = 6,0.** Pe conținut (bucla, cardul, textul) sunt de acord; HIGH-ul e despre cum ajunge cardul în
schelet fără să blocheze exportul.

---

## Runda 7b — după faptul de la business (poziția FINALĂ; înlocuiește răspunsul (2) și scorul de mai sus)

Diagnostic `r7-capat.mjs` (același RUN v15). Opririle din `curse-ideal.json` n-au durată (`opr` = n, km, lat, lon), deci pragul
§5.1 de 30 s – 5 min nu-l pot măsura pe intrările mele. Geometria confirmă însă faptul adus de business:
- 186OMM 22.09 tur: singura oprire din zonă înaintea capătului e Rîșcani@40,7 la 47,95038 / 27,54523 (1,7 km de capăt), exact punctul
  de așteptare 47,9504 / 27,5452; urmează Nihoreni@45,0 (0,0 km), apoi bucla Rîșcani@46,9 / @51,4; capăt → poarta EST = **46,0**.
- Pe toată luna: înaintea opririi din capăt (tur), respectiv după ea (retur), e cel mult **o** oprire în zonă, pe fiecare picior al
  ambelor grupe. Deci „prima oprire la ≤ 4,5 km” din diagnosticul meu de mai sus a prins așteptarea (tur) sau staționarea (retur). Măsura
  mea din runda 7 e greșită și o retrag.

Tăietura comună (oprirea în capătul Nihoreni ≤ 1,5 km → poartă, + rază; retur invers):
D tur 45,7 (n14) · D retur 45,3 (n15) · EZ tur 41,0 (n16) · EZ retur 42,2 (n9; 10 retururi EZ fără oprire în capăt).
Media grupelor: **43,6** (business 44,25). Bucla D (~4 km peste EZ) rămâne reală și e în km, dar e CU oameni după capăt, nu înaintea lui.

**Poziția finală: card 44,2 × 2 = 176,8 km/zi, neschimbat.** Cardul e la +1,4 % de media mea și la −0,1 % de a lui business. G1 față de
etalonul verificatorului (42,3) rămâne în banda de 4,5 %, ca în v15, deci HIGH-ul de mai sus cade. 46,4 × 2 se retrage. În §6.6 intră textul
de mai sus, cu două schimbări:
- măsura: „de la oprirea din capătul Nihoreni la poartă”, nu „prima oprire ≤ 4,5 km”;
- adaos: „staționările din Rîșcani înaintea capătului (tur) și după el (retur) sunt așteptare, nu urcare (§5.1), și nu intră în km”.

Ce e fals în textul migrației 417 („D și EZ merg pe același drum”) rămâne fals: D face bucla prin Rîșcani, iar cardul e media grupelor.

**Scor revizuit al propunerii 44,2 × 2 cu §6.6 corectat: 10 − 0,5 (LOW: retururile EZ fără oprire în capăt, 10 din 19, se măsoară doar pe
9; durata opririlor n-o pot verifica pe intrările RUN-ului) = 9,5.**
