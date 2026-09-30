# ION-151 — runda 3 (finală) — Claude

Scripturi și jurnale: `scratchpad/r3-claude/` (`r3core.py`, `s01_aliniere.py` … `s06_anomalii.py`, `log_*.txt`). Refolosesc
`r2-claude/r2core.py`. Nimic scris în bază, nimic trimis, fără commit. Convenție: e = (prezis − real)/real, bias + = supraestimare.

## 0. De ce cifrele WAPE din runda 2 diferă între Claude și Codex — aliniate (`s01_aliniere.py`)

Trei cauze, toate verificate:

1. **Fallback cu viitor, în scriptul meu din r2.** `r2core.OLD` lua norma măsurată indiferent de dată. 034BRAT (16,9, măsurată
   la 29.09) și 584BRAX intrau astfel în predicția lui septembrie. Codex a corectat asta în r2, eu nu. Cu regula „măsurarea
   contează doar dacă `data_masurare` < începutul lunii testate; fără dată = normă de dinainte” reproduc **exact** cifrele Codex:

   | metoda (fallback fără viitor) | sep total / fără cam / cam | aug total / fără cam / cam | **sep+aug total** | **sep+aug fără cam** | sep+aug cam | bias fără cam |
   |---|---|---|---|---|---|---|
   | SQL trim10 (P90 pe rând, 10–90 %) | 6,73 / 4,52 / 22,5 | 6,34 / 5,94 / 9,9 | **6,55** | 5,19 | 17,2 | −0,93 |
   | zi trim10 (P90 pe zi, 10–90 %) | 6,91 / 4,70 / 22,7 | 6,62 / 5,61 / 15,6 | 6,77 | 5,13 | 19,7 | −0,59 |
   | Codex: plin zi ≥ 3.000 km | 6,98 / 4,94 / 21,5 | 6,57 / 5,54 / 15,7 | 6,79 | 5,22 | 19,1 | −1,22 |
   | EB K = 5.000 (Claude r1) | 7,62 / 5,11 / 25,6 | 6,45 / 5,16 / 18,0 | 7,08 | **5,13** | 22,4 | +0,62 |
   | media(Codex, EB) | 7,10 / 4,80 / 23,5 | 6,23 / 5,16 / 15,7 | 6,70 | 4,97 | 20,3 | −0,30 |
   | plin SQL 445 (azi, fără lookahead) | 7,10 / 5,00 / 22,1 | 6,72 / 6,18 / 11,6 | 6,93 | 5,55 | 17,7 | −1,75 |
   | norma veche, fără viitor | 8,57 / 6,11 / 26,2 | 7,61 / 6,57 / 16,8 | 8,13 | 6,33 | 22,3 | −0,57 |

   Cu viitorul inclus, metoda Codex iese 6,76 în septembrie și 5,09 cumulat fără camioane (cifrele mele din r2). Diferența vine
   **numai** din cele 2 vehicule.
2. **Agregarea.** Codex a raportat cumulatul **cu** camioane: 6,79 / 7,08 / 6,55, iar eu **fără** camioane. Camioanele
   (23 din 286 de vehicul-luni) au WAPE 17–22 % și decid clasamentul „total”. Exemplu: trim10 câștigă totalul (6,55 față de 7,08
   la EB) doar prin camioane (17,2 față de 22,4). Fără camioane cele două sunt la egalitate (5,19 față de 5,13).
3. Media simplă a celor două luni față de cumulul ponderat cu litrii: diferențe ≤ 0,02 pp. Nu contează.

**Bootstrap pe vehicule, fără viitor, fără camioane** (ΔWAPE pp, IC95, 2.000 de reeșantionări, seed 151):

| comparația | Δ | IC95 |
|---|---|---|
| SQL trim10 − Codex | −0,03 | −0,65…+0,48 |
| zi trim10 − Codex | −0,09 | −0,62…+0,32 |
| EB − Codex | −0,09 | −0,55…+0,44 |
| media(Codex, EB) − Codex | −0,25 | −0,49…+0,01 |
| Codex − SQL 445 | −0,33 | −0,71…−0,00 (la limită; în r2 era −0,46 sigur, cu viitor) |
| SQL trim10 − SQL 445 | −0,36 | −0,78…+0,01 |
| Codex − norma veche | −1,10 | −1,66…−0,55 (sigur) |

**Concluzie:** pe cele două luni GPS, toate cele 5 metode bune sunt în zgomot. Doar „norma veche” e sigur mai slabă.
Afirmația mea din r2 „Codex bate sigur SQL-ul” se retrage la „la limită”. Confirm și cifrele noi ale Codex: trim10 6,55 cumulat,
lookahead-ul din fallback (6,76 → 6,98), rezervorul pornit de la zero = **4.366 l** (rândul 2 din `r2-claude/log_rezervor.txt`,
identic).

## 1. Metoda normei — poziția finală

### 1.1 Testul care decide: istoricul lung pe km m2m (`s02_fereastra_m2m.py`, `s03_boot_m2m.py`)
Pe GPS avem doar două luni. Pe m2m am rulat backtestul rulant: fiecare lună 2025-07 … 2026-09 e prezisă din luni închise
anterioare, cu aceeași țintă ca producția, fără camioane, ≥ 3.000 km în calibrare, ≥ 1.000 km în lună. Rezultă 2.013 vehicul-luni
comune și 15 luni, dintre care 5 de iarnă.

| metoda × fereastra | WAPE | bias |
|---|---|---|
| **EB K5k, 3 luni închise** | **5,31** | **−0,31** |
| EB K5k, 6 luni | 5,29 | −0,67 |
| EB K5k, cumulat din 01.2025 | 5,34 | −1,41 |
| zi trim10, 3 luni | 5,59 | −1,45 |
| zi trim10, 6 luni | 5,27 | −1,65 |
| Codex plin zi ≥3.000, 3 luni | 5,81 | −1,84 |
| Codex, 6 luni | 5,68 | −2,15 |

Diferențe (bootstrap pe vehicule):
- EB 3 luni − Codex 3 luni: **−0,49 pp [−0,71; −0,28], sigur**;
- EB 3 luni − zi trim10 3 luni: −0,28 [−0,56; −0,03], sigur;
- EB 3 luni − zi trim10 6 luni: +0,04 [−0,19; +0,25], egal;
- EB 3 luni − EB 6 luni: +0,02 [−0,12; +0,16], egal;
- EB 3 luni − EB cumulat: −0,02, egal.

**Toate metodele plin subestimează sistematic cu 1,5–2,8 %** (intervalele < 300 km ies). Efectul: mai multe abateri „în sus”
decât sunt de fapt.

### 1.2 Recomandarea: EB K = 5.000, fereastra = ultimele 3 luni închise, fixată înainte de luna judecată
Formula:

    r_i   = Σ litri_fereastra_lunii / Σ km_lunii   (lunile m−3 … m−1; fereastra lunii = ca azi: prima zi cu km → ultima zi cu ≥ 20 km)
    r_tip = Σ litri / Σ km pe toate mașinile tipului în aceleași 3 luni (tip_nume cu ≥ 4 mașini, altfel grupul)
    N_i   = (km_i · r_i + 5.000 · r_tip) / (km_i + 5.000)

- **Fereastra.** Până la 3 luni de GPS, de la 10.06. Din octombrie: iulie–septembrie.
- **Fallback.** Dacă mașina nu are km în fereastră: norma măsurată, doar cu `measurement_date` < luna judecată, altfel norma
  tipului, marcată cu *. Fără tip: „fără normă”.
- **Iarna / șocul comun al lunii** (vezi 2): prezisul = N_i · km/100 · f, unde f = mediana(L/prezis) în grupa mașinii în luna
  judecată.

De ce EB și nu trim10 / Codex, deși pe GPS sunt la egalitate:
1. E singura metodă care câștigă sigur pe singurul test lung (15 luni, iarnă inclusă) și are bias ≈ 0 (−0,31 %).
2. Nu ghicește „plinul” din cantitate. Nu avem senzor în rezervor, iar P90/85 % e o euristică: la 90 din 183 de vehicule se
   schimbă zilele de plin doar după cum se calculează P90.
3. Se explică șoferului într-o frază: „litrii tăi pe ultimele 3 luni împărțiți la km, trași puțin spre ce consumă mașinile de
   tipul tău; 5.000 km ai tăi cântăresc cât tipul”.
4. La date puține trage singur spre tip, fără prag de „3 plinuri”. Pe GPS, în grupa cu 6–10 intervale are WAPE 5,66 față de
   7,40 la Codex și 7,70 la zi trim10. În grupa cu 3–5 intervale pierde: 10,43 față de 9,26 la zi trim10.
5. Converge cu recomandarea Codex din r2 §A.7.

**Media(Codex, EB)** (4,97, bias −0,30) nu se justifică: câștigul e −0,25 pp [−0,49; +0,01] și cere două formule.

**Plin-zi trim10** rămâne coloana de control „Din iunie” de pe poster. Pentru camioane e estimarea auxiliară pe 3 luni (vezi 2).

**Limită cunoscută:** EB învață și supraconsumul mașinii. 603BRAS are N = 19,89 în septembrie, față de 10,75 la tip, după
iul–aug excesive, așa că septembrie iese −41 %. De aceea verificarea „r_i față de mediana tipului” (anomalia 3) rămâne separată
și obligatorie.

## 2. Pragul de abatere

### Corecția comună a lunii (nou, `s04_sezon_comun.py`, `s05_gps_final.py`)
f = mediana(L/prezis) pe grupă (autobuze uzină / interurban / microbuze) în luna judecată, numai pe mașinile din eșantion
(≥ 1.000 km, ≥ 95 % km GPS). Mașina e judecată față de grupă, nu față de un an „mediu”.

| test | fără f: WAPE / bias / >+15 % | cu f: WAPE / bias / >+15 % |
|---|---|---|
| m2m, 15 luni, EB 3 luni | 5,31 / −0,32 / 5,8 % | **4,78** / −0,33 / 4,3 % |
| m2m, **ianuarie 2026** | 8,62 / **−7,54** / **28,0 %** | 5,57 / −0,58 / 6,1 % |
| m2m, martie 2026 (după iarnă) | 7,08 / +5,61 / 0,8 % | 5,10 / −0,33 / 3,0 % |
| GPS sep+aug, EB | 5,13 / +0,62 | 4,90 / −0,17 |

- f a fost între 0,93 și 1,04 în toate lunile, cu o excepție: ianuarie 2026, 1,157 la autobuzele de uzină.
- **Fără f, în ianuarie ar fi semnalată o mașină din patru.** f rezolvă iarna fără un coeficient de sezon ghicit: nu avem nicio
  iarnă cu GPS și nici 2024 pentru un coeficient anual.
- **Riscul:** o grupă care fură toată odată nu se vede prin f. Paza: dacă f > 1,10 în afara lunilor dec–feb, alertă la Ion, iar
  f se tipărește pe poster.

### Formula finală (autobuze și microbuze)

    L̂ = N_i · km_luna / 100 · f_grup,luna      D = L − L̂      q_i = P90 al litrilor PE ZI ai mașinii în fereastra de calibrare
                                                              (fallback: mediana q pe tip)
    supraveghere:  D > max(0,15 · L̂, 2 · q_i)
    investigație:  D > max(0,20 · L̂, 2 · q_i)   sau supraveghere două luni la rând
    D < −max(0,15 · L̂, 2 · q_i)  →  „verifică km și foile” (nu „bine”)
    gri, fără verdict: km_luna < 1.000 sau < 95 % din km din GPS

Pe protocol (263 de vehicul-luni fără camioane, EB cu f):
- supraveghere: **3,4 % (9)**; investigație: **2,7 % (7)**; „verifică km”: 1,9 %;
- mediana lui 2q = 65 l/zi × 2, adică 14,1 % din L̂, deci podeaua decide sub ~6.000 km;
- varianta Codex max(10 %, 2q) semnalează 4,6 % (12). Diferența e doar la > 6.000 km (3,3 % față de 1,6 %).

**Ce prinde pe luni reale** (EB fixat înainte, cu f), la investigație:
- august: 603BRAS D = +318 l (+135 %), 783MUM +265 l, 042BRAU +151 l, 279BRAT +126 l;
- septembrie (până la 27.09): 034BRAT +544 l (+82 %), 396SWL +349 l, 145BRAZ +125 l;
- ≈ 860–1.020 l/lună în investigație.

Bug de tratat: 034BRAT nu are q în calibrarea iunie–iulie, de unde fallback-ul pe tip.

### Camioane
**Nicio imputare lunară** (WAPE 17–22 % cu orice metodă, clasament inversat între luni). Ce se face:
1. **Controlul pe 3 luni închise**, plin la plin pe totalul perioadei. Calibrare până la 31.07, predicție cumulată 01.08–27.09,
   9 camioane, 27.810,65 l:

   | metoda | WAPE |
   |---|---|
   | SQL 445 | 8,18 |
   | SQL trim10 | 8,54 (cifra Codex confirmată) |
   | Codex | 12,62 |
   | zi trim10 | 14,07 |
   | EB | 15,31 |
   | norma veche | 13,70 |

   Cu N = 9 nu se poate alege o metodă, dar cumulul e de ~2 ori mai precis decât luna. Regula: dosar dacă
   D_3luni > max(0,20 · L̂, 2 · q) față de norma plin de dinainte. Nu e imputare.
2. **Documente** la regulile deterministe: litri fără km, foaie > cea mai mare alimentare benzol.
3. **Bilanțul de rezervor de la zero: NU automat.** 4.366 l cu start gol, 840 l cu reset după golurile GPS, 336 l în varianta
   prudentă (T = cea mai mare alimentare benzol, normă proprie ×1,3). Suma depinde de ipoteze. Rămâne doar lista de evenimente
   de verificat cu bonul.

## 3. Lista finală a anomaliilor (`s06_anomalii.py` + r2)
Lunar = echivalent 30 de zile. Clasele se suprapun parțial (marcat), deci nu se adună.

| # | clasă | cazuri | litri / 30 zile | exemple verificabile | regula automată | siguranță |
|---|---|---|---|---|---|---|
| 1 | Litri fără niciun km (01.07–27.09) | 8 vehicule, din care 5 relevante | **2.963** (3.002 cu toate) | LJN075 4.665,4 l; QDQ396 1.150,3; BNQ076 1.145,3; GHT553 1.030,1; QDQ714 800,3 | ΣL > 0 și Σkm = 0 (GPS + m2m) pe lună | mare ca problemă, pierderea necunoscută |
| 2 | Supraconsum persistent față de mediana tipului, autobuze (iul–27.09) | 4 sigure; în curs 034BRAT, 783MUM | **974**; în curs **549** | 603BRAS 19,9 față de 10,75 l/100; 034BRAT 17,8; 279BRAT 15,2; 783MUM 38,8 față de 28,6 | r_i (3 luni, ≥ 3.000 km) > 1,15 · mediana tipului (tip cu ≥ 4 mașini) | mare pe cifră, medie pe cauză |
| 3 | Foaie de parcurs în zi fără niciun rând km (nici GPS, nici m2m), autobuze, 10.06–27.09 | 33 de rânduri, 7 vehicule | **395** (se suprapune cu #2) | 279BRAT 7 foi / 304,1 l; 034BRAT 6 / 294,5 (11–16.09); 603BRAS 8 / 252,3; 330RQR 215,9; 284BRAT 207,3; 042BRAU 139,0 | foaie pe (placă, zi) fără rând GPS/m2m, la o mașină care are GPS în rest | mare pe absență |
| 4 | Abatere lunară peste prag (EB + f), autobuze | aug 4, sep 3 | **~940** (860 aug, 1.018 sep) | 603BRAS aug +318 l; 034BRAT sep +544 l; 396SWL sep +349 l | pragul de la 2 | medie (o lună = zgomot ±15 %) |
| 5 | Camioane peste surori (iul–27.09) | RWN193, HMK135 | **513** | RWN193 53,6 față de 39,7 l/100; HMK135 46,7 | cumul 3 luni > 1,15 · mediana camioanelor | mică (zgomot de camion, sarcină necunoscută) |
| 6 | Foaie de camion > cea mai mare alimentare benzol a mașinii (10.06–27.09) | **1 rând** | 226 (exces 227,5 l) | RWN193 03.09: 827,6 l față de max 600,1 | foaie pz_camcer > max(benzol singular) | medie. Retrag „8 foi, 5.301 l, ~1.770 l/lună” din r2: pe regula asta, în fereastră e un singur rând |
| 7 | Foi de camion în zile fără rând km | 14 rânduri | 1.421 (se suprapune cu #1: LJN075 1.379 l foaie) | — | ca la #3 | medie |
| 8 | Rezervor virtual, varianta prudentă | 3 evenimente | 92 | MOW214 09.09 917,4 l la 0 km; LJN076 18.09 817,1 l; RWN193 03.09 827,6 l (= #6) | simulare cu T = max benzol, normă ×1,3, start gol, reset după gol GPS | mică ca sumă, bună ca listă |
| 9 | Km lipsă în Wialon | LJN080 | 990 km în aug. (~386 l apar fals ca exces la 39 l/100) | LJN080 aug. 43,1 → 35,3 l/100 cu km-ii lipsă | km GPS camion față de Wialon pe zi | mare (explică „supraconsumul”) |
| 10 | „Plin fără drum” după ora benzol (tot istoricul, 21 de luni) | 29 de intervale | ~82 | — | ≤ 7 zile, ≥ 50 % plin, < 15 % autonomie | mică |

**Scoase ca explicate:**
- rezervorul de 9.920 l (pornea de la jumătate de rezervor);
- înregistrările cumulate > 100 l (2025, 0 în fereastra normei);
- km_check ≠ km_total − km_patched (migr. 222: integrare independentă a vitezei);
- m2m „+8 %” (de fapt −1,9 %);
- km fantomă de parcare (reparat în 444);
- dublurile benzol–foaie (7 din 517 zile, 512 l în tot istoricul);
- ca supraconsum: 863MXL (km fantomă m2m 2025), KWX620 (norma veche prea mică), LJN080 (#9).

## 4. Lista finală a acțiunilor (22 lei/l = ipoteză; `suma_lei` = 0 în date)

| # | acțiune | litri / lună | lei / lună | siguranță | cine |
|---|---|---|---|---|---|
| 1 | Km pentru cele 5 camioane fără km: tracker pe LJN075 și GHT553, drept Wialon pe QDQ714, QDQ396, BNQ076. Până atunci, bon + km aprobați pe fiecare alimentare | 2.963 expuși (fără verificare) | 65.186 expuși; economia necunoscută | mare ca problemă | tehnic + Ion |
| 2 | Dosare pe autobuzele cu supraconsum: întâi 034BRAT și 783MUM (continuă), apoi 603BRAS și 279BRAT pe iul–aug. Foile din zile fără km (#3) sunt prima întrebare | 549 în curs (974 cu cei 4) | 12.080 (21.439) | ridicat pe cifră, mediu pe partea recuperabilă | dispecer + Ion |
| 3 | Investigația lunară după pragul nou (#4): aug 042BRAU, 279BRAT, 603BRAS, 783MUM; sep 034BRAT, 396SWL, 145BRAZ | ~940 semnalați (se suprapune cu #2) | ~20.700 semnalați | medie | dispecer |
| 4 | Regula „foaie în zi fără km” = foaia nu se primește fără km sau fără bon | 395 | 8.690 | mare pe absență | dispecer + cod |
| 5 | Camioane: RWN193 (întâi rolul de benzovoz din 2025 și foaia de 827,6 l din 03.09), HMK135 pe 3 luni | 513 | 11.294 | mică | Ion + tehnic |
| 6 | Wialon pentru LJN080 (990 km) și verificarea km la camioane înainte de orice verdict | ~386 (fals exces) | ~8.500 fals | mare | tehnic |
| 7 | Evenimentele de rezervor (#8) cu bonul | 92 | 2.016 | mică | dispecer |
| 8 | 602BRAS și 710CWN de urmărit | 165 | 3.634 | mică | dispecer |
| 9 | **Codul** (mai jos): norma fixată înainte, EB, f, pragul în litri | 0 direct. Fără el, în luni ca august norma înghite 19 % din abatere (r2 #4) și 4 din 15 mașini peste +15 % dispar | — | mare | cod |

**Schimbările de cod concrete:**
- **Migrație nouă** (următorul număr liber după 445b):
  - tabelul `lde_fuel_norma_luna` (vehicle_id, luna, norma, r_i, km_i, r_tip, tip_cheie, sursa, calculat_la) — norma se
    îngheață cu data și sursele (regula Codex 3);
  - funcția `lde_fuel_norma_eb(luna date)`, care citește `lde_fuel_flota` pe lunile m−3 … m−1 lună cu lună (Σ `litri_cu_km` /
    Σ `km`) și aplică formula de la 1.2;
  - `REVOKE EXECUTE … FROM PUBLIC` pe funcție.
- **`lde_fuel_flota`**:
  - coloana `norma` (azi `COALESCE(measured_loaded, measured, type)`) trebuie să ia măsurarea numai dacă
    `n.measurement_date < de`, altfel `t.norm_l_per_100km`. Azi o măsurare din 29.09 se aplică retroactiv lunilor trecute;
  - coloană nouă `km_gps` (km din GPS; `km` rămâne GPS + m2m), pentru pragul de 95 % GPS;
  - coloană nouă `litri_fara_km` (foi și benzol pe zile fără rând GPS/m2m), pentru anomaliile #1 și #3.
- **`lde_fuel_plin_la_plin`**:
  - `ref` = P90 pe **totalul zilei** (`SELECT vehicle_id, zi, sum(litri) FROM al GROUP BY 1,2`), nu pe rând;
  - `plin` pe totalul zilei;
  - opțiunea trim 10–90 pe rata intervalelor;
  - rămâne coloana de control „Din iunie” și estimarea pe 3 luni la camioane, nu norma.
- **`apps/admin/src/lib/lde/combustibil-poster.ts`**:
  - `:109`: `lde_fuel_plin_la_plin({ de: PLIN_DE_LA, pana, … })` citește până la sfârșitul lunii judecate. Se înlocuiește cu
    citirea normei înghețate din `lde_fuel_norma_luna` pentru `luna`. Plinul rămâne doar pentru `fapt3`;
  - `:125–127`: `teoretica` = norma EB, `sursaNorma` = 'eb' / 'veche*';
  - `:132–137` `abatere()`: azi e procent, cu roșu la > 5 % și bold la > 10 %, iar sub −5 % iese verde „bine”. Devine
    D = L − N·km/100·f, cu supraveghere / investigație după formula de la 2, sub −prag „verifică km”, gri sub 1.000 km sau sub
    95 % GPS;
  - `statGrup()` (`:142`): calculează f pe grupă (mediana L/L̂ pe mașinile eligibile) și îl tipărește;
  - `:181`: textul notei;
  - grupul `camioane`: fără culoare de abatere lunară, doar cumulul pe 3 luni.

## 5. Dezacorduri rămase (față de Codex r2; r3 Codex nu l-am văzut)
1. **EB față de plin-trim10 ca normă.** Pe GPS sunt egale (5,13 față de 5,13 fără camioane). Eu aleg EB după testul lung m2m
   (sigur mai bun decât plin pe 3 luni, bias ≈ 0) și fiindcă nu ghicește plinul. Dacă Codex rămâne la trim10, diferența
   operațională e mică. Nu e un dezacord de fond: trim10 rămâne controlul.
2. **Pragul: 15 % (eu) față de 10 % (Codex r2)** cu podeaua de 2q. Diferența e +3 semnale din 263, doar la > 6.000 km. Accept
   oricare, cu condiția ca 10 % să însemne „supraveghere”, nu „investigație”.
3. **Corecția comună f** e propunerea mea nouă din r3; Codex nu a testat-o. Riscul (furt pe toată grupa) e acoperit de alerta
   f > 1,10 și de controlul față de mediana tipului, dar nu dispare.
4. **Suma „recuperabilă”.** Codex refuză orice lei. Eu dau lei doar ca volum expus sau semnalat (litri × 22), nu ca economie.
   Aici suntem de acord în fapt.
5. Rămâne neaflabil din date: capacitatea rezervoarelor la camioane, istoricul normelor măsurate (034BRAT: valoarea de dinainte
   de 29.09 e suprascrisă), ora foii, șoferul la benzol (coloana e goală), prețul.
