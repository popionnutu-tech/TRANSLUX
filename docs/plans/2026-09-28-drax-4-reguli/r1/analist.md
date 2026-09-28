# ION-120 r1 — uzina-analist: cele 4 reguli măsurate pe flota săptămânii 14–20.09

**Surse.** `lde_uzine.reguli_livrare` DRAXELMAIER_BALTI, `reguli_livrare_la` 2026-09-27 18:22:08 UTC, md5 8c6ad18b (§8.1–§8.6 citite prin MCP).
Date VPS `/root/lde-worker/drax/date/saptamanal/2026-09-14/` (rulate pe 27.09 23:32, deci **înainte de ION-119**: VEST ↔ EST e încă gol):
`economie-zile.json` (195 de zile-mașină, 38 de mașini, bucățile zilei), `economie.json` (eșantionul B: 159 din 189 de zile L–V; casa),
`schelet-ideal.json` (ideal-v4.3: capăt, sate, locuri), `economie-urme/<dev>/<zi>.json` (urma GPS). Tipul mașinii: `vehicles → lde_vehicle_norms →
lde_vehicle_types.category` (MCP, 28.09; `passenger_seats` e NULL peste tot). Valhalla (`kmDrum`, comun.mjs) doar pentru drumurile PROPUSE, pe o copie a
cache-ului (`ECON_D=/tmp/ion120/d`); nimic scris în bază sau în codul VPS.
Scripturi: `scripturi/patru-reguli.mjs` (măsurarea), `scripturi/suprapuneri.mjs` (suprapunerile), ieșirea `scripturi/patru-reguli-2026-09-14.json`
(listele complete pe gol, noapte, mașină). Rulare: `ECON_D=/tmp/ion120/d node patru-reguli.mjs` pe VPS, ~1 min.

**Probă de consecvență** (că măsurătoarea citește datele ca lanțul): R-4a reproduce R1b = **2.713,1** km (economie.json 2.713,1); km-ii din afara zonei
în golurile perechilor = **186,3** (nelămuritul §8.3 = 186,4); R-3 pe clasa liniei reproduce netul R2 = **143,9** (economie.json 143,9).

Toate cifrele de mai jos: **km măsurați pe eșantionul B (159 de zile-mașină L–V), săptămâna 14.09**; între paranteze toate zilele L–V (189). Extrapolarea
pe flotă ar fi × 189/159 = × 1,19 (nu o aplic; cifrele sunt cele de pe urmă).

## Tabloul golurilor zilei (pe eșantion)
Golurile dintre două curse ale aceleiași zile, după trecere: **tur→tur 127 / 6.959,7 km**, **retur→retur 129 / 6.787,8 km**, **tur→retur 155 / 1.951,9 km**,
**retur→tur 0**. Marginile zilei (de la / spre locul nopții) = R1a 4.863,3 km. Asta decide unde poate lucra fiecare regulă.

## R-1 — «rămâne la capăt dacă ruta se termină în aceeași localitate»
Definiția pe urmă: ultimul retur al zilei z se termină la X, primul tur al zilei z+1 (L–V) pornește din X; economia = toți km-ii dintre ele (livrarea de
seară + cea de dimineață, cu golul impus; fără parc/service/deplasare) minus drumul propus X → Y (0 la C1).
| citire | nopți | km/săpt. | observație |
|---|---|---|---|
| **C1 noaptea, același capăt** (nume sau ≤ 1,5 km) | 61 (74) | **1.225,1** (1.925,6) | 24 de nopți deja dorm la X (126,5 km rest) |
| C2 noaptea, turul pornește din orice sat al liniei returului | 62 (78) | 1.237,2 (1.993,9) | cost Valhalla X → Y 15,7 km; C2 adaugă doar 1 noapte |
| între schimburi (retur la X → tur din X, aceeași zi) | **0** | **0** | structural: ferestrele (tur s2 13:30–16, retur s1 15–17:45) pun turul s2 ÎNAINTEA returului s1 |
Din C1: noaptea scurtă (retur s2 ~01:00 → tur s1 ~05:00) 40 de nopți / **830,6 km**; noaptea urmată de tur s2 a doua zi 21 / 394,5 km (dimineața
include și drumuri de zi, de ex. 346KAJ 72 km). 9 nopți / 485,3 km sunt la > 10 km de X (șoferul locuiește departe → întrebarea navetei §5.10).
Pe mașină (C1): 710CWN 148,8 (Lazo, 4 n.) · 435ASB 148,1 (Tăura Veche, 2 n., doarme la 25,7 km) · 804MUM 144,9 (Țiplești, 20,5 km) · 346KAJ 133,6
(Dondușeni) · 518MHD 133,4 (Florești) · 713IZX 108,3 (Prajila) · 402VKV 98,3 (Cobani) · 446ASB 85,8 (Scumpia) · 144BRAZ 58,9 · 146BRAZ 37,7 · 715IZX 37,2 ·
041BRAU 23,9 · alte 6 < 21 km.
Exemple pe urmă: (1) 346KAJ 15→16.09, retur R1 Dondușeni 01:46, tur R1 Dondușeni 13:13; doarme la 4,9 km; seara 7,2 + dimineața 72,0 = **79,2**.
(2) 435ASB 14→15.09, retur R34 la Tăura Veche 01:19, tur 13:46 din Tăura Veche; doarme la 25,7 km; 34,9 + 39,2 = **74,1**. (3) 435ASB 17→18.09, identic, **74,0**.
**Suprapunere:** R-1 ⊂ R1a integral (1.225,1 din 4.863,3 km); nu e un km nou, e o parte din «cost de azi» (§12.1) care devine propunere.

## R-2 — «rămâne la uzină»
Definiția pe urmă: între un tur (la poartă) și următorul retur (de la poartă) al aceleiași zile; economia = km-ii din AFARA zonei uzinei (> 3 km de porți și
parc), fără deplasare.
| citire | goluri | km gol total | km în afara zonei | cu plafonul §8.3 (oprire ≥ 20 min afară) |
|---|---|---|---|---|
| **cu §8.3** (o pereche sau linie > 30 km) | 27 | 788,6 | 186,3 | **0** |
| fără restricții, doar perechea (același tur/retur) | 27 | 788,6 | **186,3** | 0 |
| fără restricții, orice tur → retur | 155 (179) | 1.951,9 | 186,3 | 0 |
Pe durată: 128 de goluri < 2 h (tur s2 → retur s1 al altei linii, 1.163,3 km, **0 km afară** — e VEST ↔ EST și parcul, pe care ION-119 îl face «cursă
între uzine»); 27 de goluri 9–10 h (perechea, mediana 9,6 h) cu tot cei 186,3 km afară. Pe mașină: 293QVT 159,7 · 146BRAZ 26,6; celelalte 0.
Exemple: (1) 293QVT 17.09 14:43–00:19, R31 Cotiujenii Mari (E 65,1), gol 93,8, afară 40,0, nicio oprire ≥ 20 min afară. (2) 293QVT 14.09 14:43–00:23,
gol 73,7, afară 39,9. (3) 146BRAZ 17.09 06:18–15:53, gol 64,8, afară 26,6. **Concluzie de fapt:** între turul și returul aceleiași perechi mașinile stau
deja lângă uzină; R-2 ca «între ture» dă 0–186 km/săpt. Ca «doarme la uzină» (A, §8.4) ar ADĂUGA 3.348 km (economie.json, A = −3.348).

## R-3 — «rutele împărțite altfel» (realocarea pe (zi, schimb), ungar, cost = 2 × Valhalla casă → capăt)
| citire | grupe | câștig brut | pierderi | **net** | mutări |
|---|---|---|---|---|---|
| clasa LINIEI (azi, §8.5) | 30 | 695,3 | −551,4 | **143,9** | 44 |
| capacitatea MAȘINII (tip, ≥ locurile liniei) | 10 | 1.056,3 | −706,6 | **349,8** (toate L–V 410,8) | 82 |
| capacitatea, **fără pierderi** (nicio mașină pe minus) | 10 | 45,7 | 0 | **45,7** | 4 |
Tipul: DAF = autobuz_mare, Sprinter 515/518 = autobuz_mic, 313/315/316 și Crafter = microbuz; 7 mașini fără tip (186OMM, 293QVT, 390ASB, 402VKV, 518MHD,
763LYY, 925FTI). Presupunerea 50/27/20 locuri e contrazisă de 39 de perechi-zi (ex. 912RNK microbuz pe R25 Hiliuți și R35 Cucioaia, 457BRAX pe R3
Nihoreni), deci capacitatea = max(tip, cea mai mare linie dusă deja). Pe mașină (capacitate): + 763LYY 244,6 · 224BZP 183,4 · 435ASB 150,6 · 457BRAX 105,4
· 186OMM 81,6 · 713IZX 77,2; − 350KAJ −193,5 · 388ASB −108,7 · 760BXI −96,0 · 390ASB −70,6 · 144BRAZ −48,7 · 804MUM −42,2.
Mutări stabile 5/5 zile: 186OMM R4 Grinăuți → R13 Hăsnășenii Noi ↔ 744ARF; 388ASB R12 Sofia → R3 Nihoreni; 390ASB R4 Grinăuți → R12 Sofia; 447ASB R27 Danu →
R28 Cuhnești; 457BRAX R29 Ustia → R27 Danu. Fără pierderi: 725CWN R33 Iezărenii Vechi ↔ 830MUM R19 Copăceni (×2, 45,7 km).
Costul de azi pe urmă vs modelul Valhalla, pe 26 de zile cu o pereche: **750,7 real / 651,0 Valhalla** (urma e cu 15 % peste), deci câștigul e subestimat.
**Suprapunere:** R-3 ∩ R-1 ≤ 225,3 km (435ASB +150,6 / R-1 148,1; 713IZX +77,2 / 108,3): mașina care doarme la capăt nu mai câștigă din realocare.

## R-4 — «nu pleacă acasă între schimburi»
Definiția pe urmă: golul dintre două curse ale zilei cu o oprire ≥ 20 min la ≤ 0,5 km de casă (casa = LEAR §7.1, economie.json).
| citire | goluri | km/săpt. |
|---|---|---|
| **a = R1b** (cât lungește casa drumul pe șosea, ION-115, §5.2) | 245 (274) | **2.713,1** (3.170,6) |
| b = tot golul minus drumul direct pe șosea | 245 | 5.203,9 (5.944,8) |
Pe trecere (a / b): tur→tur 115 goluri 1.221,2 / 2.365,8; retur→retur 122 · 1.491,9 / 2.647,8; tur→retur 8 · 0 / 190,3 (casă în zona uzinei).
Pe mașină (a / b): 925FTI 350,5 / 393,0 · 710CWN 348,6 / 469,2 · 457BRAX 255,3 / 321,4 · 912RNK 176,7 / 230,7 · 388ASB 165,9 / 250,2 · 518MHD 163,2 / 239,6 ·
447ASB 160,5 / 183,0 · 345KAJ 141,0 / 179,9 · 760BXI 137,5 / 165,6 · 302YEK 131,8 / 277,9. Diferența b − a stă la mașinile cu casa PE drum:
880RNK 5,6 / 121,4, 446ASB 3,1 / 167,8, 715IZX 3,7 / 152,2, 350KAJ 4,2 / 123,9 — exact cazul respins de Ion pe 27.09 (ION-115, «880RNK e din Pelinia»).
Exemple: (1) 912RNK 18.09 16:28–00:19, retur R25 Hiliuți → retur R35 Cucioaia, 322 min acasă (Dumbrăvița): gol 100,5, direct 27,1 → a 57,8 / b 73,4.
(2) 912RNK 17.09 16:26–00:17: 98,7 / 27,0 → 58,0 / 71,7. (3) 912RNK 15.09 16:31–00:17: 97,0 / 27,0 → 57,7 / 70,0.
Unde așteaptă: tur→tur = la uzină până pleacă spre capătul turului s2, sau la capăt; retur→retur = la capătul returului s1 sau la uzină; km-ii sunt aceiași
(drumul direct). Nu e nici R-1 (retur→tur nu există în zi), nici R-2 (doar 8 goluri tur→retur, 0 km afară).

## Suprapuneri și ordinea propusă (fiecare km o singură dată)
Fiecare km se dă UNEI reguli după tipul trecerii, în ordinea **R-1 → R-2 → R-4 → R-3**:
1. marginile nopții cu același capăt → **R-1** (1.225,1); restul R1a (3.638,2) rămâne «cost de azi» și e terenul lui R-3;
2. golul tur → retur → **R-2** (0 cu §8.3; ≤ 186,3 fără plafon); cele 8 goluri tur→retur cu casă (190,3 la b) rămân la R-2, nu la R-4;
3. golul tur→tur / retur→retur cu casă → **R-4a** (2.713,1; identic R1b, nu se adună cu R1b);
4. **R-3** pe marginile rămase, după R-1: net 45,7 (fără pierderi) … 349,8 (capacitate) minus ≤ 225,3 suprapunere.
Total fără dublă numărare, măsurat: **≈ 3.938–4.288 km/săpt.** (R-1 1.225,1 + R-2 0 + R-4 2.713,1 + R-3 0…349,8), față de B = 7.576,4 azi
(R1a 4.863,3 + R1b 2.713,1). Cu ION-119 golurile scurte VEST ↔ EST (1.163,3) ies din gol și nu ating niciuna dintre cele 4 reguli.

## Întrebări pentru Ion (cu cifrele)
1. R-1: doar noaptea (singurul caz real: 61 de nopți / 1.225 km; între schimburi = 0 structural)? Și noaptea «lungă» (retur s2 → tur s2 a doua zi, 21 / 395 km)?
2. R-1: șoferul care locuiește la > 10 km de capăt (9 nopți / 485 km: 435ASB 25,7 km, 804MUM 20,5, 144BRAZ 20,5, 518MHD 15) — navetă (§5.10) sau nu se propune?
3. R-2: se păstrează §8.3 (0 km) sau se numără și km-ii din afara zonei fără oprire (186 km, 293QVT + 146BRAZ)? «Doarme la uzină» (A) adaugă 3.348 km — rămâne respins (§8.4)?
4. R-3: net (350) sau fără pierderi (46)? Capacitatea: 39 de perechi-zi contrazic tipul din bază (microbuz pe linii de 27 de locuri) și 7 mașini n-au tip — care e capacitatea reală a fiecărui tip?
5. R-4: rămâne citirea ION-115 (2.713 km, ocolul) sau tot drumul (5.204, dar atunci 880RNK revine la 121 km)?

## Scor claritate: 10 − Σ = **4,0**
−1,0 R-1 «aceeași localitate» nu spune noaptea / între schimburi, iar între schimburi nu există; −1,0 navetă nerezolvată la R-1; −1,5 R-2 ca «între ture» dă 0 pe
14.09, ca «noaptea» e A (respins, +3.348 km) — formularea nu alege; −1,5 R-3 fără capacitate reală în bază (seats NULL, 7 fără tip, 39 contradicții) și fără net/brut;
−1,0 R-4 are două citiri care diferă cu 2.491 km, iar b contrazice ION-115.
