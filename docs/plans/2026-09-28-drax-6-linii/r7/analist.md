# ION-112, runda 7 — uzina-analist («cercetează»): R3 Nihoreni redeschis

Autor: uzina-analist, 27.09.2026. Nu am scris în bază și n-am schimbat scheletul.

**Regulile folosite:** `lde_uzine.reguli_livrare` Drăxlmaier, `reguli_livrare_la` 2026-09-27 18:22:08 UTC, lungime 27.835, md5 `ce930b08…`.
- Asta e textul de după 416: **migrația 417 NU e aplicată**, deci §6.6 se poate încă îndrepta în fișier, fără migrație nouă.
- Paragrafele citate: §4.1 (capătul și excepția ION-110, «Nu fac capăt: … orașele din §5.1»), §5.1 («Opririle din orașe nu sunt sate … pe liniile Drăxlmaier … Rîșcani»), §4.5, §6.1, §6.2.

**Dovezile** sunt în acest dosar:
- `r7-nihoreni.mjs` → `p112-r7-out.txt`: fiecare picior din septembrie (obs ideal-v4.3), cu opririle clasate prin Nominatim;
- `r7b.mjs` → `r7b-out.txt`: km de la așteptare, de la prima oprire și pe toată zona;
- urma zilei 21.09 a lui 186OMM, pe tur și retur, cu `urma-186.mjs`.

Urma e cea brută din tracker-ul pg: viteza în noduri × 1,852, `w_date` în UTC. Opririle de urcare sunt < 8 km/h, 20 s – 5 min. Așteptarea e o oprire de 5–40 min. Zona e ≤ 4,5 km de capătul Nihoreni.

## Ce retrag din r3

Retrag afirmația «pe aceeași poartă D și EZ merg pe același drum (44,6 / 45,0)».
- Am măsurat de la nodul (47.9486, 27.5665). Grupa D nu trece prin el când iese din Rîșcani: pe 21.09 iese pe la nord-est, prin (47.9723, 27.5413) → (47.9587, 27.5741) → șosea.
- Deci tăietura mea ocolea bucla. Aceeași afirmație e scrisă în §6.6 din fișierul migrației 417 și e falsă.

## Faptele (septembrie)

1. **Bucla D e o cursă cu oameni prin Rîșcani, nu un drum gol.** Tur 21.09 (186OMM):
   - vine gol din Bălți;
   - așteaptă 04:44–04:53 la 1,4 km N de capăt, apoi 04:58–05:08 în Rîșcani-Vest (str. V. Komarov, 1,7 km de capăt);
   - urcă oameni: 05:10 (0,5 km), 05:13 (1,3 km S), 05:16 la capătul Nihoreni, apoi 05:22–05:28 pe str. Independenței, Gagarin și Eternității, apoi 05:31 pe str. Kotovski (3,2 km N);
   - iese spre poarta EST.

   Returul din aceeași zi urmează aceeași buclă invers: coborâri din 16:42 până la 17:05 (Kotovski, centru, capăt, 1,3 km S, Rîșcani-Vest, 2,4 km NE), apoi pleacă gol spre Bălți.
2. **Opririle scurte în zona capătului, pe grupe** (Σ pe picioarele cu opriri):

   | grupa, sens | opriri în Rîșcani | opriri în Nihoreni |
   |---|---|---|
   | D tur | 20 | 7 |
   | D retur | 16 | 6 |
   | EZ tur | 33 | 2 |
   | EZ retur | 14 | 2 |

   **Ambele grupe urcă oamenii mai ales în Rîșcani.** Asta se potrivește cu actul KW24: pe R3, Rîșcani are 43 de oameni (D 32, E 9, Z 2) și Nihoreni 10.
3. **EZ trece prin CENTRUL Rîșcani, nu doar prin Rîșcani-Vest.**
   - Distanța minimă la centrul OSM (47.9536, 27.5514) e ≤ 0,33 km pe 37 din 37 de picioare EZ.
   - Opririle EZ sunt la cel mult 2,2 km de capăt (mediana 1,8): str. Independenței, Ion Creangă, Komarov, Gagarin.
   - D oprește în plus în nordul orașului (Kotovski, 3,2 km; mediana distanței maxime e 3,1 km) și la 1,3 km S de capăt. Asta face diferența de ~9–11 km dintre grupe.
4. **Km cu oameni** (mediane; poarta e cea reală: D → EST, EZ tur → VEST, retur ← EST):

   | grupa | tur | retur |
   |---|---|---|
   | D | **49,4** de la ieșirea din așteptarea din Rîșcani-Vest (n 10, plaja 49,3–49,7; 55,0 pe 21.09). De la prima oprire scurtă: 46,5 (n 11). | **53,4** până la ultima coborâre (n 11, două picioare cu o singură oprire prinsă: 38,2 și 41,0) |
   | EZ | **40,2** de la prima oprire (n 15). Până la EST: 45,0. | **42,8** (n 6: 43,6 / 38,8 / 43,7 / 41,7 / 49,7 / 41,9) |

   **Tăietura strictă, «de la capăt»** (prima oprire la ≤ 0,8 km de capăt), are eșantion mic:
   - D tur 45,1 / 47,1 / 45,4;
   - D retur 44,7;
   - EZ tur 41,6 / 41,2.
5. **Perechile pe zi:** o pereche D (186OMM) și o pereche EZ (345KAJ, apoi 457BRAX), așa cum spune runda 7.
6. **Nemăsurate de mine:** 6 tururi D s2 (02, 04, 15–18.09) cu plin 38 în lanț.
   - Piciorul obs pornește de la poartă, iar scriptul meu a luat plecarea drept sosire.
   - Nu intră în cifrele de mai sus. Trebuie văzut de ce lanțul le dă 38 și nu ~52.

## Răspunsuri

**(1) Bucla prin Rîșcani e parte a liniei?** Pe fapt, da:
- e urcare și coborâre de oameni în satul rutei din act (43 din 66 de oameni);
- se întâmplă zilnic la D (14 din 14 picioare de tur cu urmă în zonă);
- se întâmplă în ambele sensuri.

Pe text, însă, se lovește de §4.1: «Nu fac capăt: … orașele din §5.1», iar §5.1 numește Rîșcani oraș. Linia strictă e «de la capătul Nihoreni la poartă». Ea taie tot ce D face în Rîșcani ÎNAINTE de trecerea prin capăt la tur și DUPĂ ea la retur: ~4 km la tur și ~8 km la retur.

Nu adaptez regula singur. Este **întrebarea Q-N1 pentru Ion**, mai jos.

**(2) Cardul:**
- **Dacă linia = km cu oameni** (Rîșcani inclus):
  - km/zi reali: 2 tururi + 2 retururi = 49,4 + 53,4 + 40,2 + 42,8 = 185,8;
  - card × 2 ture × 2 sensuri ⇒ card = 185,8 / 4 = **46,5**, iar cu raza porții (convenția `plinC`, +0,5–0,6) **≈ 47,0**;
  - media grupelor e exactă aici, pentru că fiecare zi are o pereche D și una EZ;
  - 46,4 (sesiunea), 46,5 și 47,2 (verificatorul, r2) sunt la cel mult 1,7 % unul de altul. Propun **47,0** (aceeași convenție ca celelalte 47 de linii) și accept 46,4.
- **Dacă linia = strict de la capăt:** cifrele de la capăt (D ~45,3 / 44,7, EZ ~41,4 / ~42) dau ≈ 43,5 + rază ≈ **44,1**. Atunci 44,2 rămâne corect.
- Diferența dintre cele două citiri e (47,0 − 44,2) × 4 = **11,2 km/zi**.

**(3) §6.6 din 417:** fraza «pe aceeași poartă, D și EZ merg pe același drum (tur 45,0 / 44,6), deci un card, 44,2 × 2» se SCOATE oricum, pentru că e falsă. Formularea propusă, după răspunsul lui Ion:

> «La Nihoreni (R3) grupele merg pe drumuri diferite ale aceleiași linii: D coboară și urcă în tot Rîșcani, inclusiv nordul (str. Kotovski), EZ doar în centru; cum grupele se rotesc săptămânal între schimburi și în fiecare zi linia are o pereche D și una EZ, cardul este media celor două grupe (km/zi = 2 × (D + EZ)), nu etalon pe schimb.»

Adaug cifra cardului după Q-N1.

## Întrebarea pentru Ion

**Q-N1.** Pe R3, oamenii urcă mai ales în orașul Rîșcani: 43 din 66 în act; opririle sunt 20 față de 7 (D tur) și 33 față de 2 (EZ tur). Mașina D pornește turul din Rîșcani-Vest și termină returul în Rîșcani, la 1,7–3,2 km dincolo de Nihoreni.
- Km-ii din Rîșcani (≈ 4 km la tur și 8 km la retur, la D) intră în linie?
- **Da** ⇒ card ≈ 47,0 × 2, +11,2 km/zi. Asta cere și o excepție la §4.1, fiindcă Rîșcani e oraș în §5.1.
- **Nu** ⇒ 44,2 × 2 rămâne, iar km-ii din Rîșcani sunt livrare sau serviciu în afara liniei.

## Poziția finală și scorul

**Poziția:**
- bucla e cu oameni și e a rutei (fapt);
- cardul e **47,0 × 2** dacă Ion spune «da» la Q-N1 și **44,2 × 2** dacă spune «nu»;
- §6.6 din 417 se rescrie în ambele cazuri, înainte de aplicare.

**Observațiile:**
- **O1 — high, −2:** 417 §6.6 afirmă un fapt contrazis de urmă (același drum D/EZ). Migrația nu e aplicată; se repară în fișier.
- **O2 — medium, −1:** cardul depinde de citirea §4.1 / §5.1 față de act (Q-N1). Cu «da», 44,2 subestimează cu 11,2 km/zi.
- **O3 — low, −0,5:** eșantion mic pe EZ retur (n 6) și pe tăietura «de la capăt» (n 1–3); 6 tururi D s2 cu plin 38 sunt neexplicate.

**Scor: 10 − 3,5 = 6,5.**
