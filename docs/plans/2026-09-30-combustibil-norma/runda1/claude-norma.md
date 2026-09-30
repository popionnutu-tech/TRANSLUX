# ION-151 — runda 1 — Claude «NORMA»

Toate cifrele de mai jos vin din scripturi Python (pandas) rulate pe CSV-urile din `date/`. Scripturile, jurnalele (`log_*.txt`) și
tabelele intermediare (`out_*.csv`) stau în
`/private/tmp/claude-501/-Users-ionpop-Desktop-TRANSLUX/d9c36576-657d-4ee8-90c9-3cf873107654/scratchpad/r1-norma/`
(`load.py` încarcă datele, `core.py` conține metodele; `sNN_*.py` sunt pașii). Nimic nu s-a scris în bază și nimic nu s-a trimis nicăieri.

Convenții:
- **e = litri reali / (normă × km) − 1**, adică exact «abaterea» de pe poster. |e| median = eroarea tipică.
- **Grupuri** (din `vehicule.csv`): camioane (43), interurban (53), autobuze uzină (48, categoriile autobuz mare/mic), microbuze (69), altele (3).
- **km «prod»** = regula producției (migr. 444/445): GPS-ul nostru cu ziua de parcare fără km cârpiți, m2m doar unde lipsește GPS-ul.
- **Luna «prod»** = litrii de la prima zi cu km până la ultima zi cu ≥ 20 km, împărțiți la km-ii lunii. Se judecă doar lunile cu ≥ 1.000 km.

---

## A. Metoda normei

### A.1 Ce am comparat (`core.py`, `s04_backtest2026.py`, `s05_rolling.py`)

| cod | metoda |
|---|---|
| `veche` | norma de până acum: măsurată încărcat → măsurată → a tipului (ca `lde_fuel_flota`) |
| `plin_prod` | plin la plin reprodus exact după migr. 445: plin = alimentare ≥ 0,85 × P90 al alimentărilor individuale; litri z1<zi≤z2, km z1≤zi<z2; intervalele <300 km ies; ≥3 intervale |
| `plin_f70/f80/f90/f95`, `plin_max85`, `plin_P75_100` | alte praguri pentru «plin» |
| `plin_zi` | plinul judecat pe suma zilei, nu pe alimentarea singulară |
| `plin_ora` | granița intervalului după ora din benzol (după 12:00 = după munca zilei ⇒ granița e ziua următoare); foaia rămâne «dimineața» |
| `plin_km0`, `plin_km800` | fără filtrul de 300 km / cu filtrul la 800 km |
| `plin_median`, `plin_wmedian`, `plin_trim10` | mediana / mediana ponderată cu km / media tăiată 10 %–90 % a intervalelor |
| `raport` | Σ litri (regula lunii, lună cu lună) / Σ km pe fereastră |
| `regr_origine` | regresie săptămânală litri ~ km fără intercept (echivalentă cu un raport ponderat cu km) |
| `regr_panta` | regresie săptămânală litri = α·zile de lucru + β·km (β = normă) |
| `eb_tip_KXk` | **raportul mașinii tras spre raportul tipului ei** (empirical Bayes): N = (km·r_mașină + K·r_tip)/(km + K) |
| `plin_eb_K10k` | plin la plin tras spre tip |
| `tip_pur` | doar raportul tipului |

Fiecare metodă are și o variantă «completată cu norma veche» (unde nu dă cifră), ca toate să fie judecate pe aceleași mașini.

### A.2 Backtest 1 — calibrare 10.06–31.08.2026, predicție septembrie (01–27.09, ultima zi cu alimentări în date)

Ținta 1 = litrii lunii (regula producției), 155 de mașini cu ≥ 1.000 km. Ținta 2 = plin la plin în septembrie (fără efectul rezervorului
la capetele lunii), pragul plinului din perioada de calibrare, 126 de mașini. Toate metodele sunt completate cu `veche`. |e| median, %:

| metoda | TOTAL | aut. uzină (39) | camioane (17) | interurban (38) | microbuze (61) | P80 | P90 | bias Σ |
|---|---|---|---|---|---|---|---|---|
| `eb_tip_K5k` | **4,1** | 3,1 | 25,8 | 2,6 | 6,0 | 13,4 | 23,6 | −2,3 |
| `plin_eb_K10k` | 4,1 | 3,7 | **17,1** | 2,2 | 5,7 | 12,8 | 20,6 | −0,2 |
| `plin_trim10` | 4,3 | 4,1 | 22,8 | 2,0 | 6,0 | 13,5 | 23,2 | −0,6 |
| `raport` | 4,5 | 3,7 | 29,0 | 2,0 | 6,2 | 14,6 | 27,7 | −3,4 |
| `plin_prod` (producția, în afara eșantionului) | 4,8 | 4,3 | 24,5 | 2,1 | 6,5 | 12,8 | 23,6 | 0,0 |
| `plin_ora` | 4,8 | 5,8 | 27,8 | 2,0 | 5,7 | 13,6 | 24,6 | −0,4 |
| `veche` | 5,1 | 4,2 | 26,5 | 3,6 | 7,9 | 15,8 | 23,0 | −1,0 |
| `tip_pur` | 6,4 | 4,8 | 21,1 | 4,4 | 8,3 | 14,9 | 21,2 | −2,1 |
| `regr_panta` | 24,3 | 27,9 | 35,0 | 20,1 | 19,6 | 58,6 | 130,9 | −15,7 |

Pe ținta 2 (plin la plin în septembrie) ordinea se întoarce în favoarea familiei plin: `plin_f70` 4,1, `plin_trim10` 4,2, `plin_prod` 4,9,
`eb_tip_K5k` 5,8, `veche` 5,8. Toate metodele au acolo bias −2…−4 %: septembrie a consumat mai puțin decât vara.

**Backtest 1b** — calibrare 10.06–31.07, predicție 01.08–27.09 (două luni, 163 de mașini): `regr_origine` 3,5, `eb_tip_K5k` 4,0,
`plin_prod` 4,1, `raport` 4,1, `veche` 4,9; la camioane (19) `plin_prod` 8,2, `eb_tip_K5k` 11,1, `veche` 9,4 (`log_bt_prod_two.txt`).

### A.3 Backtest 2 — lung, doar autobuze și microbuze, km m2m din 2025 (`s05_rolling.py`, `s08_marja.py`)

Pentru fiecare lună-țintă de la 04.2025 la 09.2026 (18 luni) norma se calculează DOAR din cele W luni de dinainte; ~2.470 mașină-luni.

| metoda (W = 3 luni) | TOTAL | aut. uzină | interurban | microbuze | P80 | P90 | bias median |
|---|---|---|---|---|---|---|---|
| `eb_tip_K5k` | **4,3** | 4,7 | 3,0 | 4,8 | 9,6 | 14,5 | −0,2 |
| `raport` | 4,4 | 5,1 | 3,0 | 4,9 | 10,1 | 15,4 | −0,1 |
| `veche` ¹ | 4,4 | 4,9 | 3,1 | 5,1 | 9,9 | 15,0 | +0,7 |
| `plin_trim10` | 4,6 | 5,2 | 2,9 | 5,2 | 10,4 | 15,9 | +1,1 |
| `plin_prod` | 5,1 | 5,4 | 4,1 | 5,4 | 10,7 | 16,7 | **+1,6** |
| `plin_f70` | 5,6 | 5,7 | 4,4 | 6,5 | 12,3 | 18,8 | +2,9 |

¹ norma veche e măsurată în iunie 2026, deci pentru 2025 «vede viitorul»; e un reper, nu un concurent cinstit.

Diferențe pereche (bootstrap pe mașini, 2.000 de reeșantionări, eroarea absolută medie):
- `plin_prod` − `eb_tip_K5k` = **+0,81 pp** [IC95 +0,40; +1,26] → plin la plin e sigur mai slab ca predicție lunară;
- `veche` − `eb_tip_K5k` = +0,37 pp [−0,04; +0,82] → nesemnificativ;
- `plin_trim10` − `plin_prod` = −0,33 pp [−0,49; −0,17] → media tăiată e sigur mai bună decât raportul simplu al intervalelor.

Fereastra (`eb_tip_K5k`): W=1 +0,40 pp față de W=3, W=2 +0,11, W=6 +0,05, W=12 mai slab (4,7 median, bias +1,4 %). **3–6 luni sunt echivalente; 12 luni trag în urmă.**

### A.4 De ce plin la plin iese sistematic sub consumul lunii (`s10`, `s13`, `s14`)

Plinul de la producție exclude intervalele sub 300 km. Pe 2025–2026 (m2m), norma grupului cu toate intervalele / doar cele ≥ 300 km =
**1,024 la interurban**, 1,015 la microbuze, 1,006 la autobuze uzină (pe 2026 cu km prod: 1,018 / 1,025 / 1,012). Mecanismul: granița
«z1 ≤ zi < z2» presupune că plinul se face dimineața, dar 33 % din alimentările benzol ale autobuzelor de uzină și 36 % ale interurbanelor sunt
după 17:00 (`s02`). La un plin de seară intervalul primește km-ii zilei greșite; intervalul scurt iese (cu litrii lui), iar km-ii lipsă
rămân în intervalul vecin ⇒ norma scade. Cu ora din benzol raportul coboară la 1,003 (interurban, m2m) / 1,004 (prod); la microbuze
rămâne 1,5–2,5 %, pentru că ele alimentează mai ales pe foaie, fără oră. Același artefact produce 316 intervale «plin fără drum»
(22.883 L) cu granița producției și doar 29 (1.727 L) cu ora benzol (`s12b`, `s12c`). Pe normă efectul orei e mic (median ±0,3 %,
14 mașini se mișcă peste 3 %), iar dispersia intervalelor la autobuze nu scade (MAD 4,3 → 5,1 %); la camioane scade 15,7 → 10,7 %.

### A.5 Regresia și consumul fix (`s10`)

- Litri = α·zile + β·km (`regr_panta`) cade (|e| 24 %): zilele și km-ii sunt aproape coliniari, coeficienții explodează.
- Pe lună, L = a + b·km pe 142 de mașini cu ≥ 12 luni: interceptul median e 2 % din litrii lunii (autobuze uzină), 1 % (interurban),
  5 % (microbuze), semnificativ (t > 2) doar la 21 din 142. Panta ≈ raportul (27,1 vs 27,9; 12,8 vs 12,7; 12,3 vs 13,0 l/100).
- În lunile cu km puțini (sub 0,6 × km obișnuiți ai mașinii) abaterea mediană e +0,8 % (fără bias), dar P90 = 28,7 %.
  **Concluzie: nu există un consum fix de care să merite ținut cont; lunile cu km puțini sunt doar mai zgomotoase.**

### A.6 Sezonul (`s07`, `s11`)

Indice pe panel fix (aceeași mașină, luna / media ei pe 12 luni), mediane:
- 2025: ian–feb 1,02–1,03 la autobuze și microbuze, ~1,00–1,02 la interurban; apr–mai 0,96–0,99.
- 2026: **ianuarie 1,093 aut. uzină, 1,060 microbuze, 1,029 interurban**; februarie 1,04 / 1,05 / 1,02.
- dec 2025–feb 2026 / iun–aug 2026 pe mașină: 1,048 / 1,051 / 1,021 (aut. uzină / microbuze / interurban).
- Aceeași mașină, iun–sep 2026 / iun–sep 2025: **+2,4 % aut. uzină, +3,0 % interurban, +2,5 % microbuze** (creștere de la an la an, nu sezon).
- Creșterea interurbanului la nivel de grup (12,6 → 14,0 l/100) vine mai ales din componența flotei; pe aceeași mașină e doar +3 %.

Corecția sezonieră din anul trecut (factorul grupului luna t−12 / fereastra t−12) NU ajută în backtest: W=3 4,17 → 4,35 %, W=6 4,28 → 4,46 %.
Iarna n-am putut-o testa cinstit (pentru ian–feb 2026 ar trebui oct–dec 2024, care lipsesc). Ce se vede: în ian–feb 2026 norma glisantă pe
3 luni are bias **+4,2 %** (pe 12 luni +6,5 %) — fereastra scurtă prinde iarna cu întârziere de o lună.

### A.7 Sursa de km (`s02`, `s06`)

Test: aceleași intervale plin-la-plin (definite numai din litri), km din patru surse; litrii fiind identici, sursa cu dispersia cea mai
mică a l/100 pe intervale are km-ii cei mai curați. MAD relativ median pe 143 de mașini (≥ 5 intervale):

| sursa | TOTAL | aut. uzină | interurban | microbuze | camioane |
|---|---|---|---|---|---|
| GPS prod (cu regula de parcare) | 4,25 | 4,58 | 3,01 | 5,30 | 15,68 |
| GPS brut (km_total) | 4,11 | 5,03 | 3,12 | 5,30 | 15,08 |
| m2m (LDE) | **4,90** | 4,90 | 3,24 | **6,05** | — |

- **GPS-ul nostru bate m2m-ul**, mai ales la microbuze. Regula de parcare din 444 schimbă puțin: scoate 1,5 % din km la autobuzele de
  uzină, 3,0 % la camioane, 0,2 % la interurban, 0,8 % la microbuze; norma rezultată se mișcă sub 1,1 %.
- Contrazic CONTEXT-ul («Σ m2m ~8 % peste»): pe zilele comune iun–sep 2026 m2m/GPS = 0,988 aut. uzină, 0,988 interurban, 0,964 microbuze.
  Pe mașină-lună medianele sunt +0,8 % / −1,0 % / −2,2 %, dar **12,2 % din mașină-luni diferă cu peste 10 %**. Extreme: 893BRAX 07.2026
  GPS 8.316 km vs m2m 932; 783MUM 08.2026 3.083 vs 1.665; 603BRAS 08.2026 1.421 vs 2.133.
- Backtestul pe septembrie dă aceeași ordine a metodelor cu oricare sursă (`log_bt_*_sep.txt`): |e| median `eb_tip_K5k` 4,1 (prod) /
  4,2 (brut) / 4,2 (GPS fără m2m) / 4,3 (m2m, fără camioane).

### A.8 Camioanele (`s09`)

- Pe lună calendaristică l/100 variază P10/P50/P90 = 28,0 / 37,3 / 49,5 (54 camion-luni cu ≥ 1.000 km); mediana e de 4 alimentări pe lună,
  iar un plin tipic e de ~549 L — un plin e cam o treime din litrii lunii. **Luna nu are cum să judece un camion**: |e| median 17–29 % cu orice normă.
- Plin la plin în lună: doar 19 din 54 camion-luni au măcar un interval.
- Pe iulie–septembrie cumulat, luna vs plin la plin diferă median 6,3 % (18 camioane). Excepții: RWN193 53,6 vs 34,8; KYK784 43,2 vs 70,5.
- Plin la plin cu ≥ 3 intervale există doar pentru 10 din 28 de camioane active cu litri (iul–sep); raportul pe 3 luni cu ≥ 1.000 km, pentru 21.
- Cinci camioane cu litri n-au deloc km (BNQ076, MWC069, QDQ396, QDQ714, LJN075), iar GHT553 și 239DQO n-au GPS (`s16`).

### A.9 Marja: sub ce abatere luna nu înseamnă nimic (`s08`, `s15`)

Backtest lung, cea mai bună normă (`eb_tip_K5k`, W=3), |e| pe km-ii lunii:

| km în lună | n | P50 | P80 | **P90** | P95 |
|---|---|---|---|---|---|
| 1.000–2.000 | 86 | 10,1 | 22,9 | **38,6** | 54,1 |
| 2.000–3.500 | 298 | 7,1 | 17,1 | **25,6** | 35,1 |
| 3.500–6.000 | 875 | 5,0 | 11,0 | **15,1** | 19,6 |
| > 6.000 | 1.219 | 3,3 | 6,7 | **9,6** | 12,7 |

Pe grup P90: aut. uzină 16,2 %, interurban 9,5 %, microbuze 15,6 %. **Cumulat pe 3 luni P90 = 8,1 %** (P50 2,4 %).
Stabilitatea l/100 calendaristic: lună → lună |Δ| median 5,5 / 3,7 / 5,2 % (P90 18,4 / 10,8 / 16,1); trimestru → trimestru median 4,1 / 2,4 / 4,3 %.

Zgomotul vine din rezervor: |L − normă×km| median = 0,57 plinuri, P90 = 1,66 plinuri (plinul = P90 al alimentărilor mașinii).
Un prag în litri semnalează uniform, oricâți km ar avea luna; un prag fix în % nu:

| regula de semnalare | 1–2k km | 2–3,5k | 3,5–6k | >6k | total |
|---|---|---|---|---|---|
| fix 10 % | 51,2 % | 39,6 % | 22,3 % | 9,0 % | 18,8 % |
| fix 15 % | 34,9 % | 24,8 % | 10,3 % | 3,1 % | 9,4 % |
| **max(10 %, 2 plinuri)** | 2,3 % | 6,7 % | 5,5 % | 5,9 % | **5,7 %** |

(cota mașină-lunilor semnalate într-o lună obișnuită, fără vreo vină anume)

### A.10 Recomandarea

1. **Norma lunii t** (una pentru toate grupurile):
   `N = (km_3 · r_mașină + 5.000 · r_tip) / (km_3 + 5.000)`, unde
   - `r_mașină = 100 · Σ litri / Σ km` pe **ultimele 3 luni închise, fără luna judecată** (litrii fiecărei luni după regula producției);
   - `r_tip` = același raport pe toate mașinile de același `tip_nume` (minim 4 mașini; altfel pe categorie);
   - km = GPS-ul nostru cu regula de parcare; m2m doar în zilele fără GPS.
   La 5.000 km norma proprie are ponderea mediană 0,71 la autobuzele de uzină, 0,88 la interurban, 0,74 la microbuze, 0,63 la camioane (`s16`).
   Sub 1.000 km în fereastră: `r_tip`. Acoperire iul–sep 2026: 173 din 185 de mașini active cu litri (plin ≥ 3 acoperă 156; la camioane 21 vs 10).
2. **Abaterea lunii contează doar dacă** `|L − N·km| > max(10 % · N·km, 2 × plinul tipic)`. În lunile obișnuite asta semnalează ~6 %
   din mașini, egal pe toate nivelurile de km. Varianta de afișat pe poster: gri sub 2.000 km; ±25 % la 2–3,5k km; ±15 % la 3,5–6k; ±10 % peste 6k.
3. **Camioanele nu se judecă pe lună**, ci pe 3 luni cumulate (P90 al zgomotului ~8 % la autobuze; la camioane mai mult) sau pe
   intervalele plin-la-plin închise. Până se adună 3 luni, fereastra începe pe 10.06.
4. **Sezonul**: fereastra de 3 luni prinde iarna cu o lună întârziere; în dec–feb pragul se lărgește cu +5 % la autobuze și microbuze
   (bias-ul măsurat e +4,2 % în ian–feb 2026). Factorul «din anul trecut» nu se aplică: în backtest a înrăutățit eroarea.
5. **Plin la plin rămâne ca verificare** (neutru față de rezervor, util la camioane și la anomalii), cu trei reparații: granița după ora
   benzolului (scoate bias-ul de 1,8–2,4 % de la interurban și 90 % din intervalele-artefact), media tăiată 10 % în loc de raportul simplu
   (−0,33 pp sigur) și fără luna judecată.
6. **Supraconsumul cronic nu se vede cu o normă proprie** (o mașină care consumă mult își ridică singură norma). Lângă abaterea lunară
   trebuie un al doilea indicator: `r_mașină / mediana tipului`, semnalat peste +15 % (vezi B).

Cât de sigur sunt: metodele diferă între ele cu ~1 pp, iar zgomotul lunii e de 10–40 %. **Pragul și calitatea km-ilor contează mai
mult decât formula.** Singurele diferențe sigure statistic: norma proprie trasă spre tip bate plin la plin-ul actual cu 0,8 pp și
media tăiată bate raportul intervalelor cu 0,3 pp. Recomandarea nu se sprijină pe o diferență mare de precizie, ci pe: acoperire mai
mare, fără bias sistematic, formulă simplă și calcul fără ghicitul plinului.

---

## B. Anomalii ieșite din lucrul la normă

| clasă | cazuri | litri | exemple verificabile | cum se prinde automat |
|---|---|---|---|---|
| Normă proprie mult peste tip (iul–sep 2026, ≥ 3.000 km) | 10 din 164 peste +15 % | 5.660 L peste mediana tipului | 603BRAS Sprinter 312: 19,9 vs 10,75 (+85 %); 034BRAT 17,8 (+66 %); 279BRAT 15,2 (+42 %); 783MUM DAF 38,8 vs 28,6 (+36 %); RWN193 Actros 53,6 vs 39,7 (+35 %) | `r_mașină / mediana tip_nume > 1,15` (`s12`). Atenție: 034BRAT are norma măsurată 16,9 pe 29.09.2026 (tipul are 10,5), deci măsurarea a «legalizat» supraconsumul; 603BRAS și 783MUM au și km GPS ≠ m2m cu 30–50 % — întâi se verifică km-ii |
| Km GPS vs m2m cu peste 10 % diferență pe lună | 12,2 % din 572 mașină-luni | — | 893BRAX 07.2026 8.316 vs 932 km; 783MUM 08.2026 3.083 vs 1.665; 435ASB 09.2026 3.643 vs 2.671 | `|m2m/GPS − 1| > 10 %` pe mașină-lună (`s06`) |
| Plin repetat fără drum (după corecția orei) | 29 de intervale | 1.727 L | 279BRAT 07–09.10.2025: 54+39+60 L pe foaie la 10,7 km; 239BZP 12–13.06.2026: 72+72 L foaie la 2,9 km; 893BRAX 05–07.02.2026: 70+71 L foaie la 2 km | interval ≤ 7 zile, toate zilele cu km, ≥ 50 % din plin turnat, < 15 % din autonomia unui plin, granița după ora benzolului (`s12c`). Cu granița producției ies 316 alarme false |
| Km fără litri (camion) | 1 mașină-lună ≥ 1.000 km | ? | QDQ419 09.2026: 1.474 km, 0 L | luna cu ≥ 1.000 km și 0 L (`s12`) |
| Litri fără km (camioane) | 5 camioane | toți litrii lor | BNQ076, MWC069, QDQ396, QDQ714, LJN075 | litri > 0 și niciun km în perioadă (`s16`) |
| Benzol și foaie în aceeași zi | 517 zile | — | doar 4 cu cantități egale (±2 %) — dublura exactă e rară | join mașină × zi (`s02`); de detaliat de analistul de anomalii |

---

## C. Ce se poate face (pentru normă; ordonat după efect)

1. **Pragul abaterii în litri, nu fix în %** (A.9). Nu economisește litri direct. Azi posterul colorează orice abatere peste 1.000 km; cu un prag de ±10 %
   ~19 % din mașini ies «în afara normei» într-o lună obișnuită (la 1–2k km, jumătate). Cu `max(10 %, 2 plinuri)` rămân ~6 %, iar
   discuțiile cu oamenii se poartă doar pe acestea. Sigur: mare (2.478 mașină-luni, 18 luni).
2. **Norma proprie trasă spre tip + indicatorul «peste tip»** (A.10.1, A.10.6). Cazurile de acum: 5.660 L în 3 luni ≈ **1.900 L/lună**
   peste mediana tipului la 10 mașini; partea recuperabilă nu se știe până nu se verifică km-ii (603BRAS, 783MUM). Sigur pe cifră; mediu pe «recuperabil».
3. **Camioanele judecate pe 3 luni sau pe intervale plin-la-plin închise**, nu pe lună (A.8): lunar, orice normă greșește median 17–29 %.
   Sigur.
4. **Plin la plin cu granița după oră și fără luna judecată**: scoate bias-ul care pune interurbanul sistematic cu ~2 % «peste normă»
   (A.4). Sigur.
5. **Iarna: toleranță +5 % în dec–feb** (A.6). Sigur pe direcție; pe mărime, doar o iarnă măsurată.

---

## D. Ce nu se poate afla din aceste date

- **Nivelul real din rezervor**: «plinul» e ghicit din cantitate, iar zgomotul lunar (P90 ~1,7 plinuri) vine de aici. Doar un senzor de nivel ar reduce marja.
- **Sezonul, testat cinstit**: km pe toată flota avem din 01.2025, deci iarna 2025/26 e singura cu termen de comparație; corecția sezonieră nu se poate valida.
- **Camioanele înainte de 10.06.2026** (fără km) și sarcina lor (plin/gol): norma încărcat/gol nu se poate separa, deci nici
  «km în afara traseului» — traseul nu e în date.
- **Dacă foaia dublează benzolul**: 517 zile au ambele surse, dar fără oră pe foaie nu se poate spune dacă e aceeași alimentare.
- **Prețul** (suma_lei = 0): litrii nu se pot transforma în lei din aceste date.
- **Mașinile fără GPS** (GHT553, 239DQO, LJN075 și camioanele fără km): norma lor rămâne a tipului; LJN080 are km lipsă față de Wialon, deci norma lui iese umflată.
