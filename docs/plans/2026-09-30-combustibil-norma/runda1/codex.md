# A. Metoda normei

**Recomand o normă operațională „plin estimat la plin estimat”, fixată înaintea lunii evaluate, cu minimum 3 intervale valide și 3.000 km cumulați în aceste intervale.** Este cea mai bună variantă dintre cele testate pentru predicție. Totuși, la camioane, datele actuale nu permit transformarea abaterii lunare într-o imputare automată.

Norma istorică descrie comportamentul mașinii; nu demonstrează că acel comportament este justificat tehnic. Aș păstra separat norma măsurată/a tipului și aș investiga diferențele persistente.

## Date și convenții de calcul

Am rulat calculele cu `python3 -c`, pandas și numpy, exclusiv în memorie. Nu am scris fișiere și nu am modificat producția.

| Element verificat | Rezultat din CSV |
|---|---:|
| Vehicule în nomenclator | 216, dintre care 211 active |
| Vehicule cu alimentări | 210 |
| Înregistrări benzol | 40.195; **2.375.197,62 l** |
| Înregistrări foi | 19.907; **1.427.308,33 l** |
| Total alimentări | **3.802.505,95 l** |
| Vehicule cu înregistrări GPS propriu | 182 |
| Vehicule cu înregistrări m2m | 173 |

Am convertit alimentările în `Europe/Chisinau`, inclusiv schimbarea orei de vară/iarnă.

**Septembrie nu este o lună închisă demonstrabil prin aceste fișiere:** ultima alimentare este din 27.09, ultimul m2m din 28.09, ultimul GPS din 29.09. Backtestul principal folosește **01–27.09.2026**, pentru aceeași limită calendaristică a surselor. Aceasta nu dovedește că alimentările din zilele următoare lipsesc; poate să nu fi existat alimentări.

Pentru reproducerea producției:

- \(L_z\) = benzol + toate foile, pe mașină și zi;
- GPS corectat = `max(km_total − km_patched, 0)` când `km_patched > 0` și diferența este sub 5 km; altfel `km_total`;
- GPS cu `km_total > 0` are prioritate; în lipsa acestuia se folosește m2m, conform SQL;
- \(L_{\text{fereastră}}\) = alimentările dintre prima zi cu km pozitivi și ultima zi cu cel puțin 20 km;
- norma veche = `norma_masurata_incarcat`, apoi `norma_masurata`, apoi `norma_tip`, prima valoare disponibilă.

**Toate foile au rămas în alimentări.** Semnalarea unei foi nu a dus la ștergerea ei din calcule.

## Backtestul principal: calibrare 10.06–31.08, predicție 01–27.09

Eșantion comun: **146 vehicule**, dintre care 14 camioane, cu:

- minimum 3.000 km în perioada de calibrare;
- minimum 1.000 km și litri pozitivi în perioada testată;
- minimum 95% din kilometrii perioadei testate proveniți din GPS;
- valori disponibile pentru metodele comparate.

Proporția de 95% privește **kilometrii disponibili**, nu dovedește absența golurilor simultane în ambele surse.

Predicția este:

\[
\widehat L_i=N_i\times K_i/100
\]

Am comparat-o cu \(L_{\text{fereastră}}\), însumând **168.769,5 l** în eșantion. Acesta este un indicator construit din alimentări, nu consum măsurat în rezervor.

\[
WAPE=\frac{\sum_i|\widehat L_i-L_i|}{\sum_i L_i}
\]

Biasul este diferența semnată totală împărțită la litrii observați; pozitiv înseamnă supraestimare.

| Metodă | WAPE | Bias | Eroarea procentuală mediană |
|---|---:|---:|---:|
| Norma tipului | 9,70% | −4,86% | 6,22% |
| Norma veche, cu prioritatea descrisă mai sus | 8,28% | +0,31% | 4,84% |
| Toți litrii calendaristici / toți km din calibrare | 10,48% | +4,68% | 4,39% |
| Litrii din fereastra cu km / km din calibrare | 8,40% | +1,68% | 4,37% |
| Mediana consumurilor lunare iulie–august | 9,29% | +2,12% | 5,00% |
| Media 50/50: norma veche și raportul din fereastră | 7,79% | +1,00% | 3,77% |
| Plin estimat, implementarea SQL; fallback la norma veche | 7,10% | −0,80% | 4,12% |
| Plin estimat după totalul zilei; fallback | 6,98% | −0,40% | 4,08% |
| Mediana ratelor intervalelor SQL; fallback | 7,13% | +0,28% | 4,45% |
| **Plin estimat zilnic + minimum 3.000 km în intervalele valide; fallback** | **6,76%** | **−0,36%** | **3,95%** |

Varianta recomandată folosește norma calculată pentru **132 dintre cele 146 vehicule** și norma veche pentru celelalte.

Rezultatul separat pe categorii este esențial:

| Eșantion | Vehicule | Litri evaluați | WAPE norma veche | WAPE metoda recomandată |
|---|---:|---:|---:|---:|
| Fără camioane | 132 | 148.043,7 | 5,77% | **4,69%** |
| Camioane | 14 | 20.725,8 | 26,19% | **21,51%** |

**O eroare mică la nivelul întregii flote nu înseamnă precizie suficientă pentru fiecare camion.**

## Verificări suplimentare

**Al doilea backtest:** calibrare 10.06–31.07, predicție august, 140 vehicule și 146.751,9 l.

| Metodă | WAPE august |
|---|---:|
| Norma tipului | 9,14% |
| Norma veche | 7,53% |
| Raportul litri/km din fereastra de calibrare | 6,97% |
| Plin estimat SQL | 6,72% |
| Plin estimat zilnic | 6,75% |
| **Zilnic + minimum 3.000 km în intervalele valide** | **6,57%** |

Pragul suplimentar de kilometri ajută în ambele luni. Diferența SQL versus agregare zilnică este mică și își schimbă sensul între backtesturi: nu pretind că agregarea zilnică este demonstrat superioară statistic.

**Altă țintă de evaluare:** am folosit numai intervalele dintre plinurile estimate din septembrie, identificate cu P90 fixat în calibrare. Pe 114 vehicule și 110.047,9 l:

- norma veche: WAPE **6,48%**;
- raportul din fereastra de calibrare: **5,94%**;
- plin estimat SQL: **4,75%**;
- plin estimat zilnic, fără pragul suplimentar de 3.000 km: **4,71%**.

Avantajul nu apare exclusiv fiindcă am ales fereastra lunară drept țintă. Totuși, nici această verificare nu transformă plinurile estimate în plinuri reale.

Am făcut și bootstrap pe vehicule, cu 5.000 reeșantionări, seed `151`. Pentru îmbunătățirea WAPE a variantei zilnice simple față de norma veche, intervalul percentilic de 95% este **0,18–2,60 puncte procentuale**. Acesta măsoară incertitudinea comparației în acest eșantion, nu incertitudinea consumului fizic.

## Sensibilitatea la praguri

Tabelul următor folosește agregarea zilnică, minimum 3 intervale și fallback la norma veche, fără pragul suplimentar de 3.000 km:

| Prag „plin” | Minimum km/interval | Vehicule eligibile în calibrare, în toată flota | WAPE septembrie |
|---|---:|---:|---:|
| 70% × P90 | 300 | 154 | 7,06% |
| **85% × P90** | **300** | **153** | **6,98%** |
| 100% × P90 | 300 | 112 | 7,87% |
| 85% × P90 | 100 | 155 | 7,96% |
| 85% × P90 | 600 | 117 | 9,25% |
| 85% × P90 | 1.000 | 74 | 9,16% |

Creșterea pragului per interval nu îmbunătățește automat norma: schimbă intervalele acceptate și trimite mai multe mașini la fallback.

Alte verificări:

- minimum **2 / 3 / 5 / 10 intervale**: WAPE **7,41 / 6,98 / 6,88 / 7,42%**;
- minimum **0 / 3.000 / 5.000 km cumulați** în intervalele valide: **6,98 / 6,76 / 6,98%**;
- mutarea ferestrei kilometrilor cu **−1 / 0 / +1 zi**: **11,36 / 6,98 / 7,79%**.

Convenția temporală actuală, km în \([z_1,z_2)\), funcționează mai bine decât deplasările testate. Ora lipsă a foilor rămâne o limită.

Acestea sunt comparații exploratorii pe două luni de validare; nu constituie dovada unui optim universal.

## Dispersia de la o lună la alta și marja realistă

Am calculat consumurile pentru iulie, august și 01–27 septembrie, păstrând vehicule cu minimum 1.000 km și minimum 95% km GPS în fiecare perioadă.

| Indicator | Fără camioane: 125 vehicule | Camioane: 11 vehicule |
|---|---:|---:|
| Mediana coeficientului de variație între cele trei luni | 4,45% | 17,96% |
| P90 al coeficientului de variație | 12,24% | 37,53% |
| Mediana schimbării absolute între luni consecutive | 4,62% | 15,21% |
| P90 al schimbării absolute între luni consecutive | 17,35% | 80,07% |

Coeficientul de variație este abaterea standard a celor trei rate împărțită la media lor.

Pentru metoda recomandată, abaterea septembrie față de predicție, \(L/\widehat L-1\), are:

- **fără camioane:** percentilele 5–95 între **−14,50% și +15,39%**; **96,21%** dintre vehicule sunt în ±20%;
- **camioane:** percentilele 5–95 între **−36,35% și +58,95%**; numai **42,86%** sunt în ±20%.

Prin urmare:

- la autobuze/microbuze, ±15% este o bandă practică de supraveghere, iar peste +20% justifică investigație;
- la camioane, +20% nu este un prag suficient pentru imputare;
- afirmațiile din comentariile codului despre precizie de ±3–5% pe un an **nu sunt validate de perioada GPS disponibilă**.

## Verificare istorică pe aceeași sursă m2m

Pentru ianuarie–august 2025 versus ianuarie–august 2026, am păstrat 136 vehicule fără camioane, cu minimum 10.000 km în fiecare perioadă.

- consum agregat: **14,75 → 15,34 l/100 km**;
- mediana schimbării individuale: **+3,17%**;
- percentilele 10–90 ale schimbării individuale: **−3,12% până la +11,33%**;
- norma individuală din 2025 prezice perioada din 2026 cu WAPE **5,32%**, bias **−3,34%**.

Pentru predicția septembrie 2026 exclusiv pe m2m, pe un eșantion comun de 110 vehicule:

| Calibrare | WAPE |
|---|---:|
| Vara 2025 | 6,58% |
| Vara 2026 | 6,12% |
| Ianuarie–august 2025 | 7,19% |
| Norma veche | 5,49% |

Istoricul m2m este util pentru controlul derivei. Nu trebuie transplantat direct ca normă GPS fără verificarea diferenței dintre surse.

## Formula și regulile recomandate

Pentru fiecare vehicul, folosind numai datele anterioare lunii evaluate:

\[
q=P90(L_z),\qquad
z\text{ este candidat de plin dacă }L_z\ge0,85q
\]

Pentru candidații consecutivi \(z_1,z_2\):

\[
L_j=\sum_{z_1<z\le z_2}L_z,\qquad
K_j=\sum_{z_1\le z<z_2}K_z
\]

Se păstrează intervalele cu \(K_j\ge300\) km:

\[
N_{\text{operațională}}
=100\frac{\sum_j L_j}{\sum_j K_j}
\]

Aplicare:

1. **Minimum 3 intervale și minimum 3.000 km în intervalele acceptate.** Altfel, norma veche, marcată explicit.
2. **Norma se fixează înaintea lunii evaluate.** Datele lunii evaluate nu îi modifică retrospectiv etalonul.
3. **Sub 1.000 km/lună: fără verdict de abatere**, conform regulii existente.
4. Se afișează distinct norma operațională, norma măsurată/a tipului și calitatea kilometrilor.
5. O normă operațională care depășește cu peste 20% norma veche intră la verificare tehnică. În calibrare, această regulă identifică **279BRAT, 710CWN și KWX620**; nu le-aș majora automat plafonul justificat.
6. Pentru camioane, evaluarea se face pe intervale documentate și bilanț de rezervor, înainte de răspundere individuală.

**Două probleme concrete în producție:**

- În [migrarea 445](packages/db/migrations/445_lde_fuel_foile_intra_in_consum.sql), P90 și testul de plin se aplică **înregistrărilor individuale**, apoi zilele sunt deduplicate. Nu se testează totalul zilnic descris în context.
- În [poster](apps/admin/src/lib/lde/combustibil-poster.ts), norma „din iunie” include chiar luna judecată. Pe eșantionul principal, includerea septembrie reduce aparent WAPE de la **6,98% la 6,32%**, dar aceasta este evaluare pe date deja folosite la calibrare, nu backtest.

# B. Anomalii

**„Litri afectați” înseamnă litri asociați semnalului, nu furt sau pierdere dovedită.** Clasele se suprapun și nu se însumează.

Perioade:

- **H:** tot istoricul alimentărilor din CSV;
- **G:** 10.06–29.09.2026, cu alimentările disponibile până la 27.09;
- **T:** iulie–septembrie 2026 disponibil.

Exemplele de mai jos sunt `placă / dată / litri`; unde cazul este lunar, luna este indicată explicit.

## Alimentări și documente

| Clasă și perioadă | Câte cazuri | Litri afectați | Exemple verificabile | Detecție automată |
|---|---:|---:|---|---|
| **Alimentări fără niciun km în întreaga perioadă T** | 8 vehicule | **8.906,47 l** | BNQ076 / 19.09 / 1.145,32; LJN075 / 22.08 / 1.050,20; GHT553 / 28.08 / 679,99; QDQ396 / 08.09 / 400,10; QDQ714 / 10.09 / 400,09 | Pe vehicul: `ΣL>0` și `ΣK=0` în T |
| **Alimentări în zile cu sub 5 km sau fără km**, G | 150 zile, 60 vehicule | **31.590,95 l** | BNQ076 / 19.09 / 1.145,32; LJN075 / 22.08 / 1.050,20; MOW214 / 09.09 / 917,44; QDQ395 / 10.08 / 697,76; QDQ364 / 11.08 / 600,07 | `Lzi>0` și km corectați lipsă/sub 5; verificare cu zilele vecine |
| **Km pe foaie lipsă sau ≤1**, H | 778 foi, 63 vehicule | **293.154,85 l** | HMK135 / 29.09.2025 / 1.105,78; BNQ085 / 13.11.2025 / 1.100,00; KYK742 / 30.03.2025 / 1.100,00; MOW214 / 30.03.2025 / 1.083,00; MWC069 / 25.03.2025 / 1.027,00 | `km_foaie.fillna(0)<=1`; litrii rămân în consum |
| **Foi peste maximul zilnic benzol de referință**, T | 1.035 foi, 38 vehicule | **65.266,26 l** | HMK135 / 03.09 / 916,46; KYK692 / 25.08 / 671,03; QDQ364 / 25.08 / 634,97; 783MUM / 08.07 / 159,68; 541NPL / 21.09 / 121,20 | Pentru fiecare lună: foaie > maxim benzol/zi în fereastra prima zi−150 zile, ultima zi+30 zile, limitată la CSV |
| **Dubluri benzol exacte**, H | 2 înregistrări excedentare | **0,02 l excedentar** | 390ASB / 01.04.2025 / 0,01, ora UTC 08:11, repetată; aceeași placă/zi/cantitate la 08:13, repetată | Duplicat pe placă, timestamp, litri, sursă; păstrarea primei apariții |
| **Repetare apropiată în timp și cantitate**, H | 42 înregistrări ulterioare, 23 vehicule | **339,82 l** | BNQ069 / 20.03.2026 / 200,06 după 200,10 în 9 minute; HMK135 / 29.01.2025 / 20,02 în 4 minute; QDQ357 / 25.06.2025 / 20,00 în 8 minute; 386PKP / 15.06.2026 / 20,00 în 8 minute; 348KAJ / 25.08.2026 / 20,00 în 9 minute | Evenimente consecutive pe vehicul: ≤10 minute și diferență ≤0,05 l |
| **Potrivire benzol–foaie în aceeași zi**, H | 2 foi, 2 vehicule | **25,00 l pe foi** | 330RQR / 30.06.2026 / foaie 20,00 versus benzol 20,01; 652AKD / 05.08.2026 / 5,00 versus 5,03 | Aceeași placă/zi, diferență ≤0,05 l; acestea sunt toate cazurile |
| **Potrivire benzol–foaie cu decalaj de maximum 3 zile**, H | 27 foi distincte, inclusiv cele 2 de mai sus | **1.546,29 l pe foi** | 446ASB / foaie 05.03.2026 / 115,00, benzol cu o zi înainte; QDQ357 / 14.06.2025 / 100,00, benzol după 3 zile; 692 TWK / 13.06.2026 / 80,00, benzol cu 3 zile înainte; 735LYY / 17.04.2025 / 75,00, benzol cu 2 zile înainte | Join pe placă și decalaje −3…+3 zile, toleranță 0,05 l; fiecare foaie numărată o dată |
| **Alimentări înainte de ora locală 05:00**, H | 717 evenimente, 67 vehicule | **19.522,07 l** | IIC263 / 10.09.2026 04:37 / 1.003,66; HMK135 / 02.09.2025 04:47 / 950,16; BNQ069 / 09.06.2025 04:18 / 440,17; YJX724 / 21.04.2026 03:17 / 250,95; MWC069 / 27.02.2025 02:24 / 250,00 | Ora locală <5; necesită programul cursei, nu presupunerea că noaptea este neautorizată |
| **Cantitate zero**, H | 3 evenimente | **0 l** | 805BXI / 02.05.2025; 065LTL / 21.02.2026; 789MJW / 27.09.2026 | `litri<=0`; nu există cantități negative |

**Regula „foaia depășește maximul benzol” nu măsoară capacitatea rezervorului.** Din cele 1.035 foi semnalate, numai **8 sunt pz_camcer**, însumând **5.301,29 l**. Restul arată cât de nepotrivit este un maxim observat la stația proprie drept plafon pentru vehicule alimentate predominant extern.

Cele opt foi de camion sunt:

| Placă | Data | Litri foaie | Maxim benzol de referință |
|---|---|---:|---:|
| HMK135 | 18.07.2026 | 600,00 | 560,07 |
| ANT347 | 28.07.2026 | 466,39 | 400,00 |
| KYK692 | 25.08.2026 | 671,03 | 600,07 |
| QDQ364 | 25.08.2026 | 634,97 | 600,59 |
| HMK135 | 03.09.2026 | 916,46 | 560,07 |
| RWN193 | 03.09.2026 | 827,58 | 557,01 |
| KWX620 | 25.09.2026 | 588,56 | 550,06 |
| HMK135 | 26.09.2026 | 596,30 | 560,07 |

**Nu am găsit dovada unei dublări generale benzol–foaie.** Există 517 zile comune, pe 115 vehicule, dar nicio egalitate între totalurile zilnice la toleranța de 0,05 l. Extinderea toleranței la 1 l produce 7 zile, iar la 5 l produce 27. Potrivirile de cantități uzuale și decalajele de dată sunt piste pentru verificarea bonurilor, nu suficiente pentru anularea înregistrărilor.

## Kilometri și alocarea între luni

Pentru semnalele GPS, litrii sunt totalul alimentărilor din zilele semnalate, nu o estimare a consumului din acele zile.

| Clasă și perioadă | Câte cazuri | Litri afectați și km | Exemple verificabile | Detecție automată |
|---|---:|---:|---|---|
| **Km cârpiți în zile de parcare**, G | 2.202 zile, 136 vehicule | **7.279,31 l** în zilele respective; **30.522,60 km eliminați** | MOW214 / 09.09 / 917,44 l, 15,9→0,3 km; LJN080 / 17.07 / 650,07 l, 25,8→0,2 km; QDQ364 / 11.08 / 600,07 l, 31,8→0,1 km; QDQ395 / 31.08 / 598,01 l, 16,4→2,1 km | Regula existentă: `patched>0` și `total−patched<5` |
| **GPS suspect în zile care nu sunt parcare**, G | 2.084 zile, 146 vehicule | **101.187,82 l**; **52.949,70 km patched** | 210BZP / 12.06 / 63,00 l, 417,7 km patched; aceeași placă / 26.06 / 64,00 l, 359,3 km patched; 216RQR / 25.06 / 69,03 l, 249,6 km patched | `suspect=True` și nu parcare; controlul segmentelor originale |
| **GPS absent, dar m2m ≥20 km**, G | 198 zile, 15 vehicule | **6.335,93 l**; **40.042,33 km m2m** | 614WYW / 02.07 / 206,12 l, m2m 309,32 km; / 07.07 / 200,28 l, 309,73 km; / 09.07 / 200,14 l, 303,41 km; / 16.07 / 200,04 l, 299,14 km | Join extern GPS–m2m; GPS absent și m2m≥20 |
| **Diferență m2m/GPS de peste 20%**, T, ambii ≥20 km | 343 zile, 77 vehicule | **13.004,97 l**; GPS 71.296,10 km versus m2m 58.253,41 km | 414ASB / 13.07 / 213,91 l, 444,10 versus 305,68 km; / 06.07 / 210,14 l, 445,30 versus 341,08 km; 186OMM / 17.08 / 201,64 l, 288,80 versus 173,05 km | `abs(m2m/GPS−1)>0,20`, numai pe zile comune comparabile |
| **Câmpurile GPS nu respectă identitatea declarată**, G | 11.984 zile, 181 vehicule | **608.691,21 l** în zilele respective; nu sunt litri pierduți | RWN169 / 05.08 / 550,00 l, diferență +268,2 km; ANT344 / 25.06 / 416,98 l, +266,2 km; HMK139 / 14.07 / 558,05 l, +243,4 km; LJN080 / 01.09 / 499,10 l, +243,4 km | `abs(km_total−km_check−km_patched)>0,2`; verificarea semanticii câmpurilor înainte de corectare |
| **Litri în afara ferestrei lunare, la vehicule cu ≥1.000 km**, T | 13 vehicul-luni, 13 vehicule | **2.370,08 l** | QDQ419 / 31.08 / 632,45; QDQ395 / 31.08 / 598,01; IIC230 / 31.08 / 551,42; QDQ364 / 31.08 / 164,13; KYK692 / 31.08 / 152,01 | Alimentare înaintea primei zile cu km sau după ultima zi cu ≥20 km |

Alte rezultate ale verificării complete:

- Cele opt vehicule fără km în întreaga perioadă T sunt **LJN075, QDQ396, BNQ076, GHT553, QDQ714, MWC069, 405LLA și 239DQO**. Problema depășește lista cunoscută inițial.
- Există **21 zile pe 10 vehicule** cu GPS explicit zero și m2m de cel puțin 20 km: **1.640,10 km m2m**, cu **52,73 l** alimentați în acele zile. SQL folosește m2m, deoarece filtrează GPS zero.
- Nu am găsit nicio zi GPS cu peste **1.000 km**.
- În T există **32 vehicul-luni sub 1.000 km**, pe 23 vehicule, cu **12.074,26 l**. Acestea nu trebuie tratate ca luni cu normă precisă.

**Două premise din context necesită corectare sau explicarea exportului:**

1. `km_total = km_check + km_patched` nu se verifică în CSV la toleranța de 0,2 km pentru **70,52% dintre rânduri**. Poate fi o diferență de definiție/prelucrare, nu automat o eroare de distanță. Nu am înlocuit `km_total` cu `km_check`.
2. Pe cele **8.331 zile comune** iulie–septembrie în care ambele surse au minimum 20 km, **88,70%** sunt la ±10%, dar suma m2m este **cu 1,86% sub GPS**, nu cu aproximativ 8% peste.

Sensibilitatea regulii de parcare:

| Prag pentru `km_total−km_patched` | Zile semnalate | Km patched eliminați |
|---|---:|---:|
| <1 km | 2.084 | 29.063,4 |
| <3 km | 2.169 | 30.107,1 |
| **<5 km** | **2.202** | **30.522,6** |
| <10 km | 2.260 | 31.649,5 |

Pragul existent de 5 km se află într-o zonă relativ stabilă.

**Atenție la transferul între luni:** SQL exclude alimentările după ultima cursă din rata lunii, însă funcția nu construiește un sold de rezervor pentru luna următoare. Litrii rămân în totalul alimentărilor, dar nu există dovada transferului lor în consumul lunii următoare. Corectarea prezentării nu înlocuiește bilanțul de stoc.

## Consumuri ridicate și deteriorări persistente

Pentru această verificare am folosit **toată flota**, lunile iulie–septembrie disponibile, formula lunară din producție și norma veche. Septembrie include aici km disponibili până la 29.09; nu trebuie confundat cu backtestul 01–27.09.

| Prag peste norma veche, la ≥1.000 km/lună | Vehicul-luni | Vehicule | Litri în lunile semnalate | Exces față de norma veche |
|---|---:|---:|---:|---:|
| >10% | 60 | 42 | 62.591,09 | 11.970,30 |
| >15% | 39 | 28 | 42.406,60 | 9.816,29 |
| **>20%** | **21** | **14** | **22.389,07** | **6.796,92** |
| >30% | 13 | 9 | 15.584,32 | 5.445,58 |
| >50% | 5 | 4 | 4.081,93 | 2.050,13 |

La pragul de +20%, partea care depășește **chiar plafonul de 120%**, nu numai norma simplă, este **3.678,49 l**.

Exemple lunare:

| Placă / lună | Litri în fereastră | Km | Consum | Norma veche | Exces față de normă |
|---|---:|---:|---:|---:|---:|
| KYK692 / august | 1.271,10 | 1.611,80 | 78,86 | 39,00 | 642,50 l |
| QDQ364 / august | 1.235,04 | 1.750,90 | 70,54 | 39,00 | 552,19 l |
| HMK135 / septembrie disponibil | 2.012,76 | 3.888,90 | 51,76 | 35,00 | 651,64 l |
| 783MUM / iulie | 2.271,25 | 5.738,80 | 39,58 | 29,50 | 578,30 l |
| 603BRAS / august | 552,98 | 1.420,88 | 38,92 | 11,50 | 389,58 l |

**Persistență: peste +20% în minimum două luni.**

| Vehicul | Luni semnalate | Litri în lunile respective | Exces față de norma veche |
|---|---:|---:|---:|
| 783MUM | 2 | 3.626,82 | 1.024,36 |
| HMK135 | 2 | 3.112,76 | 999,98 |
| LJN080 | 3 | 3.794,75 | 798,16 |
| 603BRAS | 2 | 1.117,20 | 685,69 |
| 279BRAT | 2 | 1.345,74 | 441,16 |
| 710CWN | 2 | 1.145,16 | 208,87 |
| **Total** | **13** | **14.142,43** | **4.158,23** |

Acestea sunt priorități de verificare, cu trei precizări:

- **LJN080:** CSV arată în august 4.477 km și 43,10 l/100 km. Diferența de 990 km față de Wialon menționată în context nu poate fi verificată fără exportul Wialon; nu o transform într-o corecție demonstrată.
- **603BRAS:** în august GPS însumează 1.388,4 km, m2m 2.133,37 km. Kilometrii trebuie verificați înaintea consumului imputabil.
- În septembrie disponibil, 603BRAS și 279BRAT coboară la **10,22**, respectiv **9,10 l/100 km**. Nu extrapolez automat excesul din vară ca pierdere permanentă.

Pe comparația **ianuarie–august 2025 versus 2026, exclusiv m2m**, patru vehicule cresc cu peste 20%:

| Placă | Consum 2025 | Consum 2026 | Litri 2026 | Exces față de rata proprie din 2025 |
|---|---:|---:|---:|---:|
| 602BRAS | 10,53 | 15,01 | 7.883,59 | 2.352,25 |
| 863MXL | 9,65 | 12,94 | 6.601,69 | 1.680,00 |
| 603BRAS | 12,78 | 16,46 | 4.420,35 | 989,13 |
| 279BRAT | 11,97 | 14,90 | 4.215,12 | 831,03 |
| **Total** | | | **23.120,75** | **5.852,42** |

Exemple de alimentări din aceste dosare: 602BRAS/26.01.2026/75,60 l; 863MXL/31.01.2026/67,37 l; 603BRAS/12.02.2026/80,07 l; 279BRAT/01.06.2026/80,95 l. Semnalul este deteriorarea agregată, nu caracterul suspect al fiecărei alimentări.

## Șoferi, surse și zile

**Nu se poate face un clasament corect al șoferilor pe întreaga flotă:** toate cele **40.195 alimentări benzol au `sofer` lipsă**. În foi lipsesc șoferii pe 362 rânduri, dintre care 337 sunt pz_camcer.

Legături utile pentru verificarea documentelor:

- S126 — HMK135, 18.07.2026, foaie de 600,00 l;
- S022 — 783MUM, 14.07.2026, 113,85 l;
- S004 — 603BRAS, 13.07.2026, 45,15 l;
- S116 — KYK692, 25.08.2026, 671,03 l;
- S124 — QDQ364, 25.08.2026, 634,97 l.

Aceste legături nu separă efectul șoferului de mașină, traseu, încărcătură și kilometri lipsă.

CSV identifică numai sursele `benzol` și `benzol2`, nu o stație fizică sau pompă verificabilă:

- benzol: **1.480.420,94 l**;
- benzol2: **894.776,68 l**.

Alimentările de weekend sunt **6.135 evenimente, 335.405,09 l**. Nici weekendul, nici ora nocturnă nu demonstrează abatere la o flotă cu curse în schimburi și curse lungi.

# C. Ce se poate face

**Nu există în CSV o cantitate de furt sau economie fizică demonstrată.** Există volume de control și diferențe față de etaloane. Le disting mai jos, pentru a nu prezenta expunerea drept bani recuperabili.

Ordinea este după mărimea lunară a volumului vizat sau a efectului contabil calculabil. Valorile se suprapun.

| Prioritate | Acțiune concretă | Mărime lunară calculată | Ce se poate afirma și cu câtă siguranță |
|---|---|---:|---|
| 1 | Restabilirea/verificarea kilometrilor la cele 8 vehicule fără km | **2.968,82 l/lună expunere medie** = 8.906,47/3 | Certitudine mare că lipsește baza de evaluare; economie necunoscută. În septembrie expunerea este 4.691,62 l |
| 2 | Menținerea filtrului de km fantomă și verificarea importurilor care îl ocolesc | **1.923,35 l/lună echivalent de normă** în T | Calcul: km eliminați × norma veche/100. Efect contabil bine determinat; filtrul există deja, deci nu îl declar economie nouă |
| 3 | Reconcilierea celor 8 foi mari de camion cu bonuri, card și cursă | **1.767,10 l/lună volum de documente vizat** = 5.301,29/3 | Semnal clar pentru control, probabilitate de recuperare necunoscută. Foaia mare poate fi legitimă |
| 4 | Diagnostic tehnic și verificarea km/documentelor la 783MUM, 603BRAS, 279BRAT, 710CWN | **1.180,04 l/lună exces de referință** în iulie–august | Cele patru au depășit +20% în ambele luni: 2.360,09 l exces în total. Nu este economie garantată; unele consumuri revin ulterior |
| 5 | Introducerea unui bilanț de rezervor între luni | **790,03 l/lună reclasificare medie** = 2.370,08/3 | Corectează alocarea la vehicule cu km suficienți. Nu reprezintă motorină economisită |
| 6 | Verificarea deteriorării istorice la 602BRAS, 863MXL, 603BRAS, 279BRAT | **731,55 l/lună exces față de 2025** = 5.852,42/8 | Semnal persistent pe aceeași sursă de km; cauzele și partea recuperabilă sunt necunoscute. Se suprapune parțial cu prioritatea 4 |
| 7 | Controlul importurilor duplicate și al repetărilor apropiate | **7,67 l/lună de verificat** în T pentru repetări apropiate | Numai 3 asemenea înregistrări, 23 l, în T. Dublurile exacte din întreg istoricul însumează doar 0,02 l excedentar |

Pentru foi, procedura de control ar trebui să păstreze litrii în raport și să adauge rezultatul reconcilierii: document confirmat, dată corectată, vehicul corectat sau duplicat demonstrat. Nu se șterg foi pe baza mărimii cantității.

Aș introduce imediat și următoarele schimbări de raportare, fără să le atribui economii fictive:

- **Fixarea normei înaintea lunii**, cu perioada de calibrare și numărul de intervale vizibile.
- **Separarea consumului observat de plafonul tehnic justificat.** O creștere istorică nu trebuie să majoreze automat norma acceptată.
- **Statut explicit al kilometrilor:** GPS, fallback m2m, contradicție între surse, fără bază.
- **Sold inițial și final de rezervor**, documentate, pentru vehiculele unde se dorește răspundere lunară. Relația necesară este:

\[
Consum=Stoc_{\text{inițial}}+Alimentări-Stoc_{\text{final}}
\]

- **Bon/card/pompă/șofer/odometru la alimentare**, pentru a transforma potrivirile statistice în verificări documentare.

**Lei:** toate valorile `suma_lei` din benzol sunt zero, iar foile nu conțin preț. Nu pot calcula onest o sumă numerică în lei din aceste CSV-uri.

Dacă \(p\) este prețul contabil verificat în lei/l, echivalentul celor **1.180,04 l/lună** de exces de referință este **1.180,04 × p lei/lună**. Aceasta rămâne valoarea unui scenariu de revenire la etalon, nu o creanță demonstrată.

# D. Ce nu se poate afla din aceste date

1. **Consumul fizic exact al lunii.** Avem alimentări și kilometri, fără stoc inițial/final de rezervor.
2. **Dacă o alimentare este realmente „plin”.** P90 identifică o cantitate mare pentru vehicul, nu nivelul rezervorului.
3. **Furtul sau vinovăția unei persoane.** Abaterile pot proveni din documente, km lipsă, regim de lucru, stoc, defecțiuni sau utilizare neautorizată.
4. **Capacitatea rezervorului.** Maximul benzol observat nu este capacitate tehnică și nu justifică anularea unei foi.
5. **Stația/pompa responsabilă.** `sursa` nu oferă identificarea necesară.
6. **Efectul independent al șoferului.** Benzol nu are șofer, iar foile nu oferă atribuirea completă a consumului și kilometrilor.
7. **Km în afara traseului autorizat.** Lipsesc traseele și autorizațiile; nu am făcut deduceri de motorină sau salariu pe acest criteriu.
8. **Corecția Wialon pentru LJN080.** Exportul de referință nu este inclus.
9. **O normă separată încărcat/gol validată.** Nu există aici baza completă de încărcătură și regim de exploatare necesară.
10. **Economii sau recuperări în lei.** Lipsesc prețurile și confirmarea caracterului nejustificat al diferențelor.

**Trasabilitatea calculelor:** rezultatele provin din următoarele operații pandas, rulate asupra celor cinci CSV-uri:

| Calcul | Operații și definiții folosite |
|---|---|
| Inventar și totaluri | `read_csv`, `len`, `nunique`, `groupby(...).sum()`, min/max date |
| Alimentări zilnice | Conversie timezone pentru benzol; `concat` benzol + toate foile; grupare placă/zi |
| Kilometri | Corecția parcării prin `np.where`; agregare m2m; join extern și prioritate GPS conform SQL |
| Rate lunare | Prima zi `km>0`, ultima zi `km>=20`; sumarea litrilor între acestea; raport la km perioadei |
| Plin estimat | `quantile(.9)`, pragul testat, zile distincte ordonate, `shift(-1)` pentru capătul intervalului; însumările cu capete deschise/închise indicate în A |
| Backtest | Separarea explicită a datelor de calibrare și evaluare; predicție `norma*km/100`; WAPE, bias și cuantile |
| Dispersie | Pivot vehicul/lună; `std(ddof=1)/mean`; schimbări consecutive prin `pct_change` |
| Dubluri și suprapuneri | `duplicated`, diferențe temporale între evenimente consecutive, join benzol–foaie pe placă și decalaj de dată |
| Abateri și priorități | `exces=L−norma*km/100`; filtrele de km și procent din tabele; persistență prin numărul lunilor semnalate |
| Istoric | Aceleași ferestre calendaristice în 2025/2026, exclusiv m2m, aceleași vehicule și praguri de eligibilitate |

**Recomandarea pentru răspundere este, așadar, condiționată de dovezi:** norma calculată poate declanșa verificarea; bonurile, kilometrii validați și bilanțul rezervorului trebuie să stabilească abaterea imputabilă.