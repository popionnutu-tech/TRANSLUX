# ION-151 — Codex, runda 3: raport final

## 1. O singură metodă de normă

**Recomand „plin estimat la plin estimat”, pe totalul zilei, minimum trei intervale și 3.000 km acceptați, cu norma fixată înaintea lunii evaluate.** Revizuiesc astfel preferința operațională pentru EB din concluzia mea din runda 2.

Am recalculat CSV-urile în memorie cu `python3 -B -c`, pandas și numpy: agregări placă–zi, ferestre de consum, intervale, predicții, bootstrap și liste nominale. Am verificat SQL 445, posterul și implementarea Claude. **Nu am modificat fișiere sau producția.**

### Comparația aliniată

Protocol: calibrare din 10.06 până la sfârșitul lunii anterioare; minimum 3.000 km în calibrare, 1.000 km în test și 95% km GPS în test. Litrii sunt cei din fereastra producției; toate foile sunt păstrate. Rezervele exclud măsurările ulterioare calibrării.

- Septembrie, **01–27.09**: 146 vehicule, dintre care 14 camioane; **168.769,46 l**.
- August: 140 vehicule, dintre care 9 camioane; **146.751,91 l**.
- Cumulat: **286 luni-vehicul, 153 vehicule distincte**; fără camioane: 263 observații.

\[
WAPE=100\frac{\sum|\widehat L-L|}{\sum L}
\]

| Metodă | Septembrie total | August total | Cumulat total | Cumulat fără camioane | Cumulat camioane |
|---|---:|---:|---:|---:|---:|
| **Plin pe zi, ≥3 intervale, ≥3.000 km** | **6,98%** | **6,57%** | **6,79%** | **5,22%** | **19,08%** |
| Plin pe zi + trim10 | 7,16% | 6,46% | 6,84% | 5,20% | 19,69% |
| Media plin pe zi + EB Claude | 7,10% | 6,23% | 6,70% | 4,97% | 20,26% |
| Raport pe fereastra întreagă | 8,40% | 6,97% | 7,74% | 5,39% | 26,13% |
| EB Claude | 7,62% | 6,45% | 7,08% | 5,13% | 22,37% |
| SQL 445, fără luna judecată | 7,10% | 6,72% | 6,93% | 5,55% | 17,73% |
| Trim10 pe intervalele SQL | 6,73% | 6,34% | 6,55% | 5,19% | 17,24% |

**De unde veneau diferențele dintre rapoarte:**

1. WAPE cumulată este ponderată cu litrii, nu media simplă a procentelor lunare. Totalul și rezultatul fără camioane au numitori diferiți.
2. Claude păstrase măsurarea din **29.09 pentru 034BRAT** în rezerva predicției de septembrie. Corectarea schimbă metoda recomandată de la **6,76% la 6,98%** pe septembrie și de la **5,09% la 5,22%** cumulat fără camioane. Pentru această mașină, predicția disponibilă atunci era **611,47 l**, nu **984,17 l**.
3. „Trim10” desemna două variante: eu raportasem intervalele **SQL, P90 individual**, Claude intervalele **zilnice cu minimum 3.000 km**. Rezultatele lor nu sunt interschimbabile.

**De ce aleg metoda simplă:** trim10 zilnic aduce doar **0,02 puncte procentuale** fără camioane și poate păstra un singur interval când există numai trei. Media cu EB câștigă **0,25 pp** fără camioane, dar adaugă dependența de grupul de comparație. Bootstrap pe vehicule, 5.000 reeșantionări, seed 151: avantajul mediei are IC95 **−0,50…−0,01 pp** fără camioane, însă **−0,44…+0,26 pp** pe total. Este un rezultat exploratoriu modest, după compararea multor variante, nu un câștigător universal.

### Formula și regulile de producție

Pentru zilele cu alimentări:

\[
L_d=L_{\text{benzol},d}+L_{\text{foi},d},\qquad
q=P90(L_d),\qquad \text{plin estimat dacă }L_d\ge0,85q
\]

Pentru două asemenea zile consecutive:

\[
L_j=\sum_{z_1<d\le z_2}L_d,\qquad
K_j=\sum_{z_1\le d<z_2}K_d,\qquad
N=100\frac{\sum_{j:K_j\ge300}L_j}{\sum_{j:K_j\ge300}K_j}
\]

- **Eligibilitate:** minimum trei intervale acceptate și minimum 3.000 km în ele.
- **Fereastră:** acum, din 10.06.2026 până la sfârșitul lunii anterioare; ulterior, maximum șase luni calendaristice închise. Plafonul de șase luni este o alegere operațională, încă nevalidată pe GPS.
- **Rezervă:** norma măsurată încărcat → măsurată → norma tipului, disponibilă înaintea lunii, marcată `*`. Fără rezervă validă: normă indisponibilă.
- **Kilometri:** regula parcării 444, apoi m2m unde GPS eligibil lipsește. `km_check` rămâne verificare independentă.
- **Iarnă:** fără coeficient procentual inventat. Norma rămâne fixată înaintea lunii; abaterea sezonieră se verifică pe grup și prin măsurări documentate.
- Norma istorică și norma tehnică se afișează distinct. Consumul cronic ridicat nu devine justificat doar fiindcă intră în istoric.

## 2. Pragul final de abatere

Pentru autobuze și microbuze:

\[
\widehat L=NK/100,\qquad D=L-\widehat L
\]

\[
H_{15}=\max(0,15\widehat L,\;2q),\qquad
H_{20}=\max(0,20\widehat L,\;2q)
\]

Aici **q este P90 zilnic din calibrare**, fixat împreună cu norma; nu capacitatea rezervorului.

| Situație | Decizie |
|---|---|
| \(D>H_{15}\) | Supraveghere și verificarea documentelor/km |
| \(D>H_{20}\), sau supraveghere două luni consecutive | Investigație |
| \(D<-H_{15}\) | Verificarea km, alimentărilor lipsă și stocului |
| Sub 1.000 km/lună | Gri, fără verdict lunar |
| Km neclarificați sau normă indisponibilă | Verificare de date înaintea evaluării consumului |

În cele **263 luni-vehicul fără camioane**, pragul de supraveghere produce **14 semnale, 5,32%**, iar pragul de investigație **10, 3,80%**. Regula simetrică ±15% produce **29, 11,03%**. Acestea sunt frecvențe de semnalare, nu rate demonstrate de alarme false.

**Camioane:** fără imputare automată lunară. Recomand control pe trei luni cumulate, cu reper fixat înaintea perioadei, și pe intervale închise cu plinuri documentate. Cumularea a două luni, verificabilă aici pe nouă camioane, reduce WAPE metodei recomandate la **12,62%**; nu validează încă precizia unei reguli trimestriale.

Bilanțul rezervorului pornit de la zero rămâne doar o simulare. Fără capacitate reală, stoc și kilometri compleți, nu produce litri imputabili.

## 3. Lista finală a anomaliilor

**„Lunar” înseamnă echivalent de 30 zile:** 89 zile pentru 01.07–27.09; 110 zile pentru 10.06–27.09. Volumele sunt expuneri sau diferențe de verificat, nu pierderi demonstrate. Clasele se suprapun.

| Clasă | Cazuri și volum în perioadă | l/30 zile | Exemple verificabile | Regula automată / selecția | Siguranță |
|---|---|---:|---|---|---|
| **Alimentări fără kilometri în întreaga perioadă** | 8 vehicule; **8.906,47 l** | **3.002** | BNQ076, 19.09: **1.145,32 l**; LJN075, 22.08: **1.050,20 l** | `ΣL>0` și `Σkm=0`, GPS și m2m | **Mare** asupra lipsei km |
| **Documente mari la camioane** | 10 evenimente distincte, 8 vehicule; **7.035,81 l** | **2.372** | HMK135, 03.09: **916,46 l**; MOW214, 09.09: **917,44 l**, **0,3 km** | Opt foi peste referința benzol, plus cele trei evenimente din analiza rezervorului; RWN193 apare în ambele și este numărat o dată | **Medie** ca prioritate documentară; **mică** drept pierdere |
| **Diferență mare față de tip — prioritate** | 034BRAT, 603BRAS, 279BRAT, 783MUM; **2.891,16 l peste mediană** | **975** | 603BRAS, august: **552,98 l / 1.420,88 km**; 034BRAT, septembrie: **1.204,15 l / 5.823,50 km** | ≥3.000 km cumulat; consum >115% din mediana tipului, minimum patru comparabile; verificare km | **Mare** aritmetic, **medie** asupra cauzei |
| **Camioane peste mediana tipului** | HMK135 și RWN193; **1.523,06 l peste mediană** | **513** | **46,67**, respectiv **53,61 l/100 km**, mediană **39,74** | Comparație cumulată, apoi sarcină, curse, stoc și documente | **Medie** ca semnal |
| **Alte diferențe față de tip** | 144BRAZ, 284BRAT, 760BXI, 849BRAN; **1.245,80 l** | **420** | 849BRAN: **12,70 l/100**, aproape de norma proprie **12,5** | Aceeași regulă pe tip; confruntare cu norma și exploatarea proprie | **Mică** pentru economie |
| **Foi fără rând GPS și fără rând m2m în ziua respectivă** | 33 foi, 7 vehicule; **1.448,24 l**, 10.06–27.09 | **395** | 034BRAT, 11.09: **44,05 l**; 603BRAS, 10.08: **32,41 l** | Join placă–zi, lipsă în ambele surse; verificarea zilelor vecine | **Mare** asupra absenței rândurilor |
| **Monitorizare secundară** | 602BRAS și 710CWN; **489,32 l peste mediană** | **165** | Consum cumulat **11,85**, respectiv **15,40 l/100** | Comparație cu tipul și evoluția lunară | **Mică** pentru recuperare |

Cele opt vehicule fără km sunt: **LJN075 4.665,37 l; QDQ396 1.150,34; BNQ076 1.145,32; GHT553 1.030,09; QDQ714 800,27; MWC069 45,00; 405LLA 40,05; 239DQO 30,03.**

Pentru documentele mari, cele opt foi însumează **5.301,29 l**. Se adaugă MOW214/09.09, **917,44 l**, și LJN076/18.09, **817,08 l**. RWN193/03.09, **827,58 l**, este deja inclus. Comparația cu maximul benzol este o selecție retrospectivă pentru audit, **nu o probă de depășire a capacității**.

**Corecții obligatorii ale interpretării:**

- **603BRAS și 279BRAT:** păstrez dosarele istorice; septembrie revine la **11,29**, respectiv **10,38 l/100 km**. Nu extrapolez excesul verii.
- **034BRAT:** cinci zile din septembrie au **248,88 l pe foi fără rând în ambele surse km**. Investigația începe cu documentele și kilometrii.
- **783MUM:** prioritate tehnică/documentară, dar septembrie are numai **649,50 km**. Nu pot confirma că excesul continuă în septembrie.
- **LJN080:** mutat la verificarea Wialon. Dacă se confirmă cei 990 km lipsă, august devine **35,30 l/100 km**, față de **43,10** în export.
- **863MXL și KWX620:** scoase din supraconsumul curent față de tip; au **12,06 versus 12,59**, respectiv **36,79 versus 39,74 l/100 km**. KWX620 rămâne separat în controlul documentelor.
- Scot din lista pierderilor „identitatea GPS”, cei **9.920 l** ai rezervorului virtual și presupusele depășiri fizice deduse numai din cantitatea alimentată.

## 4. Acțiuni, în ordinea volumului lunar

**22 lei/l este ipoteza cerută de brief.** Valorile de mai jos reprezintă valoarea volumului verificat, nu economii promise. În CSV, toate cele 40.195 înregistrări benzol au `suma_lei=0`.

| Ordine | Acțiune | l/30 zile | Lei/30 zile la 22 lei/l | Responsabil | Siguranță |
|---|---|---:|---:|---|---|
| 1 | Restabilirea km pentru cele opt vehicule; trackere/drepturi Wialon și reconcilierea alimentărilor | **3.002** | **66.048** | **Ion + tehnic + dispecer** | Mare asupra problemei; economie necunoscută |
| 2 | Bon, card, cursă și destinația motorinei pentru cele zece evenimente de camion | **2.372** | **52.176** | **Dispecer + Ion** | Medie |
| 3 | Dosare 034BRAT, 603BRAS, 279BRAT, 783MUM: întâi km/documente, apoi verificare tehnică | **975** | **21.440** | **Dispecer + tehnic** | Medie asupra părții remediabile |
| 4 | Control cumulat HMK135 și RWN193; la RWN193, clarificarea eventualelor transferuri de motorină | **513** | **11.295** | **Ion + dispecer + tehnic** | Medie |
| 5 | Compararea exploatării celor patru vehicule secundare cu vehiculele de același tip | **420** | **9.239** | **Tehnic + dispecer** | Mică pentru economie |
| 6 | Reconcilierea celor 33 foi fără rânduri km; litrii rămân în calcul | **395** | **8.689** | **Dispecer + cod** | Mare asupra problemei |
| 7 | Monitorizare 602BRAS și control tehnic 710CWN | **165** | **3.629** | **Tehnic** | Mică pentru economie |

**Nu însumez rândurile:** documentele, foile fără km și diferențele față de tip se suprapun. Recuperabilul efectiv nu poate fi estimat credibil din aceste CSV-uri.

Schimbările de cod au prioritate imediată, chiar dacă nu au economie fizică măsurabilă:

1. **`public.lde_fuel_plin_la_plin`**, prin migrare nouă: agregare `al` pe vehicul–zi înainte de `ref` și `plin`; P90 zilnic; păstrarea tuturor foilor; eligibilitate ≥3 intervale și ≥3.000 km. Returnarea normei nerotunjite pentru calcule și a `plin_tipic=q`.
2. **`citesteFlotaDinBaza` în `combustibil-poster.ts`:** apelul normei se încheie în ultima zi a lunii anterioare. Salvarea versiunii lunare cu fereastră, normă, rezervă, q și indicatorii de calitate. Rezervele respectă data măsurării.
3. **Separarea câmpurilor posterului:** norma fixată, consumul lunii și consumul pe trei luni. În prezent, rezultatul plin-la-plin suprascrie câmpurile `km3`, `litriCuKm3`, `fapt3`.
4. **`abatere`:** înlocuirea culorilor bazate pe +5/+10% cu pragurile în litri din secțiunea 2; calcul înainte de rotunjire; consumul foarte mic trimite la verificare. Camioanele nu primesc verdict lunar automat.
5. **`lde_fuel_flota` / indicatori de calitate:** expunerea ponderii kilometrilor GPS și a alimentărilor fără rânduri km. Ponderea GPS nu trebuie prezentată drept dovadă că toate deplasările sunt înregistrate.
6. **Ion + tehnic + cod:** capacități reale ale rezervoarelor, marcaj de plin confirmat, ora foii și legătură verificabilă cu șoferul. Coloana `sofer` este goală în toate cele **40.195 alimentări benzol**.

## 5. Ce dezacord a rămas

**Pe recomandarea operațională converg cu Claude:** plin zilnic, minimum trei intervale/3.000 km, fără luna judecată; praguri 15/20% cu podea de două alimentări tipice; camioane evaluate documentar și cumulat.

Rămân următoarele delimitări:

- **Precizia raportată:** rezultatul corect fără informații viitoare este **5,22%**, nu 5,09%, cumulat fără camioane. Avantajul față de SQL este **0,33 pp**, nu 0,46 pp.
- **„Patru cazuri sigure” înseamnă patru investigații prioritare**, nu pierderi confirmate. Golurile km la 034BRAT și rulajul mic din septembrie la 783MUM împiedică afirmații mai ferme.
- **Cei 336 l rămași într-o variantă a rezervorului virtual nu sunt prejudiciu robust.** Capacitatea continuă să fie presupusă; păstrez evenimentele pentru control.
- **Nu susțin o economie lunară garantată.** Lipsesc stocurile, capacitățile, sarcina și traseul autorizat al camioanelor, confirmarea km Wialon și istoricul complet al normelor. Plafonul de șase luni și comportamentul de iarnă necesită validare ulterioară.