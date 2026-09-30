# Verdict pe dezacordurile 1–9

**Am recalculat pe CSV-uri, în memorie, cu `python3 -B -c`, pandas și numpy. Nu am scris fișiere și nu am modificat producția.**

1. **Metoda normei — niciun câștigător universal demonstrat.** Pe protocolul comun, metoda mea are WAPE **6,98% în septembrie / 6,57% în august**, iar recomandarea Claude **7,62% / 6,45%**. Varianta Claude „plin cu eliminarea extremelor 10–90%” obține **6,73% / 6,34%**, cea mai mică WAPE cumulată dintre variantele testate: **6,55%**. Totuși, comparațiile bootstrap nu separă sigur metodele bune. **Retrag afirmația că metoda mea este demonstrat cea mai bună.**

2. **Granița intervalului — Claude are dreptate asupra artefactului; testul meu nu îl contrazicea.** Reproduc exact **316 intervale / 22.883,05 l** cu granița zilnică și **29 / 1.726,68 l** cu mutarea alimentărilor benzol de după prânz la ziua următoare. Împărțirea proporțională după oră produce **79 / 7.107,77 l**. Aceasta presupune însă deplasare uniformă în cursul zilei; CSV-ul nu conține kilometri orari. Afirmația „biasul ajunge la 0,3%” privește efectul filtrării intervalelor scurte, nu biasul lunar din backtest.

3. **P90 și alimentările cumulate — constatarea mea despre SQL este corectă; interpretarea fizică Claude este prea categorică.** SQL testează alimentările individuale, apoi deduplică zilele. P90 individual versus zilnic diferă la **115 vehicule** în calibrarea pentru septembrie. Reproduc **264 sesiuni peste 100 l, 13 vehicule, 51.388,10 l**; dar capacitatea de 100 l și natura „cumulată” nu sunt demonstrate de CSV. **Niciuna dintre aceste sesiuni nu intră în calibrările comune începute la 10.06.2026.**

4. **Folosirea lunii judecate în normă — Codex are dreptate, dar am găsit și o greșeală proprie.** Includerea septembrie în calibrarea SQL reduce artificial WAPE de la **7,10% la 6,57%**. În august: **6,72% → 5,31%**. În plus, în runda 1 am folosit norme măsurate la **29.09.2026** pentru predicția lunilor anterioare. Eliminarea acestei informații viitoare schimbă rezultatul metodei mele pentru septembrie din **6,76% în 6,98%**.

5. **Camioane și rezervor virtual — Claude reproduce un semnal util, dar nu o limită inferioară de pierdere.** Reproduc **9.920,40 l**, însă scriptul pornește cu rezervorul presupus **pe jumătate plin**. Pornind de la zero rezultă **4.366,46 l**, respectiv **4.345,63 l** cu kilometrii protocolului comun. Capacitățile și consumul de 45 l/100 km sunt ipoteze. Regula mea „maximul benzol nu este capacitatea rezervorului” rămâne corectă.

6. **Vehicule fără kilometri — lista completă Codex este corectă.** Sunt **8 vehicule, 8.906,47 l** în 01.07–27.09: șapte camioane și un interurban. Cele cinci camioane mari din lista Claude au **8.791,39 l**; totalul său de aproximativ **8.876 l** include de fapt și MWC069, și 405LLA.

7. **Kilometri — trebuie corectat contextul și retras unul dintre semnalele mele.** Reproduc neegalitatea în **11.984/16.993 rânduri, 70,52%**, dar `km_check` este o **verificare independentă prin integrarea vitezei**, nu componenta necârpită a `km_total`. **Nu este o anomalie aritmetică.** Pe zilele comune comparabile, m2m este **1,86% sub GPS**, nu 8% peste.

8. **Supraconsum — ambele liste conțin cazuri reale de verificat, dar nu toate indică pierdere.** Reproduc exact cele **10 vehicule și 5.660,01 l peste mediana tipului**. Semnalele 603BRAS, 279BRAT și 783MUM nu dispar prin simpla confruntare cu m2m. LJN080 trebuie scos din lista de supraconsum confirmabil până la verificarea Wialon. Deteriorările istorice 602BRAS și 863MXL se reproduc, dar consumul GPS recent nu justifică extrapolarea lor ca pierdere curentă.

9. **Pragul de abatere — accept principiul Claude, cu limite explicite.** Pragul în litri  
   \[
   |L-\widehat L|>\max(0,10\widehat L,\;2P90_{\text{alimentare}})
   \]
   este mai potrivit decât ±15% pentru toate rulajele. Cu norma Claude, semnalează **18/263 luni-vehicul fără camioane, 6,84%**, în cele două teste. Acestea sunt semnale, nu „alarme false” demonstrate. **Camioanele și cazurile cu kilometri neclarificați rămân fără imputare automată.**

# A. Metoda normei

## A.1. Protocolul efectiv și corecțiile de comparabilitate

Am folosit:

- toate alimentările benzol și toate foile, fără eliminarea vreunei foi;
- ziua benzol în `Europe/Chisinau`;
- kilometrii din producție: GPS corectat prin regula 444, apoi m2m unde GPS-ul eligibil lipsește;
- litrii țintă între prima zi cu kilometri pozitivi și ultima zi cu minimum 20 km;
- minimum **3.000 km în calibrare**, **1.000 km în test**, minimum **95% din kilometrii testului proveniți din GPS**;
- litri țintă pozitivi și normă de rezervă disponibilă, pentru calcularea erorilor procentuale pe același eșantion.

Regula 444 **nu pune automat zero** pe întreaga zi de parcare: păstrează `max(km_total−km_patched, 0)`. SQL filtrează inițial GPS cu `km_total>0`; astfel, pentru un GPS explicit zero poate prelua m2m. În export există **21 asemenea zile** cu m2m ≥20 km, însumând **1.640,10 km**.

Norma de rezervă este: măsurată încărcat → măsurată → norma tipului, dar numai dacă data măsurării precedă luna testată. Pentru **034BRAT, 389VKV, 487NPL și 584BRAX**, măsurările din 29.09 nu sunt admise în aceste backtesturi.

| Test | Calibrare | Evaluare | Total vehicule | Fără camioane | Camioane | Litri țintă |
|---|---|---|---:|---:|---:|---:|
| Septembrie | 10.06–31.08 | 01–27.09 | 146 | 132 | 14 | 168.769,46 |
| August | 10.06–31.07 | 01–31.08 | 140 | 131 | 9 | 146.751,91 |

**95% GPS măsoară proveniența kilometrilor disponibili, nu completitudinea deplasărilor.** Golurile simultane GPS–m2m pot trece acest filtru.

Metricile comune sunt:

\[
\widehat L_i=N_iK_i/100,\qquad
WAPE=100\frac{\sum|\widehat L_i-L_i|}{\sum L_i}
\]

\[
Bias=100\frac{\sum(\widehat L_i-L_i)}{\sum L_i},\qquad
APE_i=100\frac{|\widehat L_i-L_i|}{L_i}
\]

Mediana și P90 de mai jos sunt percentilele **APE**, cu litrii observați la numitor. Bias pozitiv înseamnă supraestimarea alimentărilor țintă. Această definiție diferă de abaterea posterului, \(L/\widehat L-1\).

## A.2. Metodele comparate

Am rulat familiile din ambele rapoarte și combinațiile lor. În tabele:

- `SQL`: prag individual \(0,85P90\), minimum 300 km/interval și trei intervale; calculele comparative păstrează norma nerotunjită.
- `zi`: aceeași metodă, dar P90 și candidatul de plin se calculează pe totalul zilnic.
- `Codex`: `zi`, plus minimum 3.000 km în intervalele acceptate.
- `ora`: convenția Claude, benzol de la 12:00 inclusiv mutat la granița zilei următoare; foaia rămâne la începutul zilei.
- `fracționar`: granița la ora benzol, kilometrii zilei repartizați proporțional cu timpul; foile la 00:00.
- `trim10`: se păstrează intervalele cu rate între percentilele 10 și 90, apoi se calculează raportul litri/km; minimum trei intervale înaintea acestei selecții.
- `EB cod`: implementarea din scriptul Claude — raport pe întreaga fereastră și media ponderată a tipului.
- `Claude text`: recomandarea scrisă — însumarea ferestrelor lunare, \(K=5.000\), minimum patru vehicule pentru tip, altfel categoria.
- `plin EB cod`: implementarea Claude, care acceptă inclusiv un singur interval și folosește EB drept rezervă.
- `Codex EB`: metoda mea combinată cu reperul de tip al recomandării Claude.
- toate metodele fără rezultat folosesc norma de rezervă disponibilă înaintea testului;
- regresia cu pantă negativă este considerată invalidă și trece la norma de rezervă.

**Fiecare celulă din următoarele două tabele are ordinea: `WAPE / bias / mediană APE / P90 APE`, toate în %.**

## A.3. Testul septembrie — toate metodele

| Metodă | Total, N=146 | Fără camioane, N=132 | Camioane, N=14 |
|---|---|---|---|
| Norma tipului | 9,70 / −4,86 / 6,22 / 24,85 | 6,60 / −1,22 / 5,13 / 14,58 | 31,87 / −30,83 / 30,32 / 53,75 |
| Norma veche, disponibilă atunci | 8,57 / 0,01 / 4,89 / 23,12 | 6,11 / 0,20 / 4,66 / 16,62 | 26,19 / −1,33 / 21,60 / 52,33 |
| Raport calendaristic | 10,48 / 4,68 / 4,39 / 26,07 | 5,61 / 1,66 / 3,95 / 16,32 | 45,30 / 26,27 / 28,91 / 145,31 |
| Raport pe fereastra întreagă | 8,40 / 1,68 / 4,37 / 20,14 | 5,61 / 1,65 / 3,95 / 16,32 | 28,31 / 1,90 / 24,39 / 60,05 |
| Raport, ferestre lunare însumate | 8,38 / 1,64 / 4,37 / 20,14 | 5,59 / 1,60 / 3,95 / 16,32 | 28,31 / 1,90 / 24,39 / 60,05 |
| Mediana lunilor cu ≥1.000 km | 9,29 / 2,12 / 5,00 / 22,81 | 6,48 / 1,55 / 4,71 / 17,11 | 29,33 / 6,14 / 21,12 / 65,91 |
| 50% veche + 50% raport | 7,90 / 0,85 / 3,77 / 21,02 | 5,26 / 0,93 / 3,38 / 14,88 | 26,77 / 0,28 / 21,56 / 55,68 |
| Plin SQL | 7,10 / −0,80 / 4,12 / 18,61 | 5,00 / −0,51 / 3,75 / 14,75 | 22,14 / −2,90 / 19,11 / 52,33 |
| Plin zi | 6,98 / −0,40 / 4,08 / 18,80 | 4,94 / −0,14 / 3,72 / 14,75 | 21,51 / −2,27 / 19,75 / 51,51 |
| Plin ora | 6,98 / −0,38 / 4,03 / 19,53 | 4,78 / −0,06 / 3,47 / 16,42 | 22,70 / −2,67 / 20,15 / 52,33 |
| Plin fracționar | 6,96 / −0,51 / 3,99 / 18,61 | 4,78 / −0,19 / 3,53 / 14,77 | 22,51 / −2,81 / 20,02 / 52,33 |
| Plin 70% P90 | 7,12 / −2,12 / 4,08 / 20,34 | 5,11 / −2,08 / 3,48 / 16,24 | 21,46 / −2,45 / 18,75 / 51,51 |
| Plin 80% P90 | 7,21 / −0,80 / 4,37 / 18,55 | 5,23 / −0,59 / 4,12 / 14,37 | 21,37 / −2,24 / 18,75 / 51,51 |
| Plin 90% P90 | 7,71 / −0,28 / 4,25 / 18,61 | 5,52 / 0,16 / 3,75 / 14,89 | 23,31 / −3,45 / 19,11 / 52,33 |
| Plin 95% P90 | 8,05 / 0,46 / 4,25 / 19,86 | 5,48 / 0,66 / 4,06 / 16,43 | 26,42 / −0,91 / 21,60 / 52,33 |
| Plin 85% maxim | 7,86 / −0,26 / 4,43 / 19,83 | 5,19 / −0,28 / 3,80 / 13,27 | 26,90 / −0,07 / 21,60 / 52,33 |
| Plin 100% P75 | 7,80 / −0,18 / 4,64 / 20,69 | 5,78 / 0,50 / 4,12 / 16,64 | 22,24 / −5,08 / 19,11 / 52,33 |
| Plin fără pragul 300 km, minimum 1 km | 7,73 / 1,45 / 4,06 / 21,06 | 5,71 / 2,06 / 3,54 / 18,00 | 22,14 / −2,90 / 19,11 / 52,33 |
| Plin minimum 800 km/interval | 9,48 / −3,27 / 5,72 / 22,66 | 7,70 / −3,32 / 5,21 / 17,35 | 22,14 / −2,90 / 19,11 / 52,33 |
| **Codex, zi + 3.000 km** | **6,98 / −0,58 / 3,95 / 18,80** | **4,94 / −0,34 / 3,52 / 14,75** | **21,51 / −2,27 / 19,75 / 51,51** |
| SQL, mediana intervalelor | 7,13 / 0,28 / 4,45 / 17,70 | 4,91 / 0,54 / 3,98 / 14,59 | 22,96 / −1,53 / 17,00 / 52,33 |
| SQL, mediana ponderată cu km | 7,41 / −0,99 / 4,16 / 19,44 | 5,10 / −0,33 / 3,51 / 13,54 | 23,86 / −5,73 / 17,00 / 52,33 |
| **SQL, trim10** | **6,73 / −0,10 / 3,96 / 18,07** | **4,52 / 0,18 / 3,27 / 16,10** | **22,48 / −2,10 / 17,00 / 52,33** |
| SQL, minimum un interval | 8,81 / 0,58 / 4,36 / 19,63 | 5,44 / −0,03 / 4,07 / 14,87 | 32,84 / 4,92 / 24,84 / 58,87 |
| EB cod, K=2.000 | 7,93 / 1,52 / 3,79 / 19,11 | 5,32 / 1,52 / 3,60 / 16,05 | 26,59 / 1,46 / 23,25 / 56,45 |
| EB cod, K=5.000 | 7,64 / 1,43 / 4,03 / 19,11 | 5,13 / 1,45 / 3,55 / 14,94 | 25,55 / 1,31 / 22,13 / 54,27 |
| EB cod, K=10.000 | 7,61 / 1,39 / 4,04 / 19,10 | 5,18 / 1,40 / 3,57 / 14,12 | 24,91 / 1,31 / 19,24 / 52,82 |
| EB cod, K=30.000 | 7,85 / 1,39 / 5,06 / 19,18 | 5,56 / 1,38 / 4,57 / 15,41 | 24,22 / 1,46 / 19,16 / 51,36 |
| Tip empiric pur | 8,59 / 1,45 / 6,13 / 20,85 | 6,47 / 1,41 / 5,85 / 16,84 | 23,74 / 1,73 / 18,24 / 50,39 |
| **Claude text, K=5.000** | **7,62 / 1,40 / 4,03 / 19,11** | **5,11 / 1,41 / 3,53 / 14,94** | **25,55 / 1,31 / 22,13 / 54,27** |
| SQL, rezervă raport propriu | 7,94 / −0,09 / 4,36 / 19,63 | 5,52 / 0,05 / 4,07 / 14,87 | 25,24 / −1,05 / 24,84 / 60,05 |
| Plin EB cod, K=3.000 | 7,20 / −0,46 / 4,15 / 19,57 | 4,80 / −0,36 / 3,71 / 14,09 | 24,38 / −1,21 / 22,66 / 52,65 |
| Plin EB cod, K=10.000 | 7,05 / −0,63 / 3,91 / 17,05 | 4,85 / −0,43 / 3,67 / 14,58 | 22,74 / −2,01 / 17,57 / 49,85 |
| Codex EB, K=3.000 | 6,83 / −0,15 / 3,60 / 18,85 | 4,68 / 0,02 / 3,24 / 14,63 | 22,17 / −1,35 / 19,75 / 51,51 |
| Codex EB, K=5.000 | 6,89 / 0,03 / 3,73 / 18,41 | 4,71 / 0,16 / 3,35 / 14,29 | 22,46 / −0,94 / 19,75 / 51,51 |
| Codex EB, K=10.000 | 7,13 / 0,32 / 4,03 / 18,79 | 4,92 / 0,40 / 3,72 / 14,23 | 22,93 / −0,27 / 19,75 / 51,51 |
| 50% Codex + 50% Claude | 7,10 / 0,41 / 4,04 / 18,69 | 4,80 / 0,53 / 3,48 / 14,90 | 23,53 / −0,48 / 17,47 / 52,79 |
| Regresie săptămânală prin origine | 7,95 / 1,06 / 4,47 / 20,98 | 5,36 / 1,00 / 3,79 / 16,58 | 26,39 / 1,47 / 26,02 / 59,13 |
| Regresie cu zile active + km | 58,44 / 16,67 / 19,93 / 70,57 | 59,55 / 18,93 / 19,54 / 63,80 | 50,45 / 0,58 / 28,29 / 96,01 |
| Zi, 70% P90 | 7,06 / −1,86 / 4,24 / 19,45 | 5,04 / −1,79 / 3,94 / 15,29 | 21,52 / −2,39 / 18,75 / 51,51 |
| Zi, 100% P90 | 8,10 / 1,16 / 4,30 / 20,17 | 5,56 / 1,51 / 4,03 / 14,73 | 26,19 / −1,33 / 21,60 / 52,33 |
| Zi, minimum 100 km/interval | 7,96 / 1,22 / 4,25 / 22,45 | 5,53 / 1,18 / 3,70 / 17,21 | 25,34 / 1,56 / 23,75 / 51,51 |
| Zi, minimum 600 km/interval | 9,47 / −3,85 / 5,71 / 22,84 | 7,78 / −4,08 / 5,22 / 19,85 | 21,51 / −2,27 / 19,75 / 51,51 |
| Zi, minimum 1.000 km/interval | 9,45 / −2,56 / 6,06 / 25,85 | 7,77 / −2,60 / 5,44 / 20,95 | 21,51 / −2,27 / 19,75 / 51,51 |
| Zi, graniță −1 zi | 11,34 / −6,37 / 7,75 / 27,62 | 9,82 / −7,15 / 7,57 / 22,50 | 22,17 / −0,82 / 19,75 / 51,51 |
| Zi, graniță +1 zi | 7,79 / 0,71 / 4,41 / 19,88 | 5,22 / 0,35 / 4,07 / 16,09 | 26,14 / 3,28 / 22,15 / 51,51 |
| Zi, minimum două intervale | 7,41 / 0,14 / 4,12 / 18,80 | 5,36 / 0,28 / 3,84 / 14,87 | 22,05 / −0,85 / 16,93 / 57,13 |
| Zi, minimum cinci intervale | 7,10 / −0,88 / 4,04 / 18,80 | 4,97 / −0,28 / 3,60 / 14,75 | 22,34 / −5,18 / 19,75 / 52,33 |
| Zi, minimum zece intervale | 7,64 / −0,14 / 3,95 / 20,61 | 5,04 / 0,03 / 3,42 / 14,70 | 26,19 / −1,33 / 21,60 / 52,33 |
| Zi, minimum 5.000 km cumulați | 7,20 / −0,60 / 4,08 / 18,80 | 5,01 / −0,17 / 3,71 / 14,75 | 22,81 / −3,67 / 19,75 / 51,51 |

## A.4. Testul august — toate metodele

Aceeași ordine a metricilor: **WAPE / bias / mediană APE / P90 APE**.

| Metodă | Total, N=140 | Fără camioane, N=131 | Camioane, N=9 |
|---|---|---|---|
| Norma tipului | 9,14 / −4,96 / 6,73 / 23,72 | 7,12 / −2,48 / 6,42 / 18,36 | 26,97 / −26,97 / 27,16 / 41,72 |
| Norma veche, disponibilă atunci | 7,61 / −1,11 / 6,28 / 18,40 | 6,57 / −1,43 / 5,90 / 18,36 | 16,79 / 1,77 / 14,85 / 19,23 |
| Raport calendaristic | 9,41 / 3,48 / 4,86 / 24,48 | 5,17 / −0,14 / 4,25 / 16,15 | 46,98 / 35,52 / 35,53 / 67,75 |
| Raport pe fereastra întreagă | 6,97 / 0,89 / 4,58 / 22,18 | 5,15 / −0,16 / 4,18 / 16,15 | 23,10 / 10,25 / 25,68 / 49,98 |
| Raport, ferestre lunare însumate | 6,97 / 0,89 / 4,58 / 22,18 | 5,15 / −0,16 / 4,18 / 16,15 | 23,10 / 10,25 / 25,68 / 49,98 |
| Mediana lunilor cu ≥1.000 km | 6,91 / 1,21 / 4,78 / 18,50 | 5,38 / 0,28 / 4,52 / 16,12 | 20,40 / 9,39 / 14,84 / 43,26 |
| 50% veche + 50% raport | 6,61 / −0,11 / 5,20 / 20,43 | 5,27 / −0,80 / 5,05 / 16,60 | 18,47 / 6,01 / 20,42 / 36,23 |
| Plin SQL | 6,72 / −2,96 / 4,87 / 20,45 | 6,18 / −3,15 / 4,65 / 21,74 | 11,58 / −1,23 / 13,16 / 14,94 |
| Plin zi | 6,75 / −2,04 / 5,02 / 22,20 | 5,74 / −2,60 / 4,65 / 22,15 | 15,68 / 2,88 / 13,63 / 18,13 |
| Plin ora | 7,16 / −1,73 / 4,79 / 17,65 | 5,71 / −2,55 / 4,51 / 17,37 | 19,96 / 5,53 / 14,01 / 21,69 |
| Plin fracționar | 7,28 / −2,00 / 5,30 / 16,67 | 5,90 / −2,75 / 4,76 / 16,45 | 19,52 / 4,65 / 14,85 / 21,60 |
| Plin 70% P90 | 7,29 / −3,63 / 5,32 / 22,25 | 6,60 / −3,97 / 4,80 / 22,15 | 13,31 / −0,60 / 13,16 / 18,47 |
| Plin 80% P90 | 6,68 / −3,05 / 5,08 / 19,99 | 6,13 / −3,26 / 4,72 / 21,74 | 11,58 / −1,23 / 13,16 / 14,94 |
| Plin 90% P90 | 6,53 / −2,46 / 5,33 / 17,63 | 5,83 / −2,48 / 4,94 / 19,40 | 12,68 / −2,33 / 13,63 / 15,42 |
| Plin 95% P90 | 6,42 / −1,79 / 4,99 / 16,52 | 5,72 / −1,74 / 4,51 / 16,55 | 12,68 / −2,33 / 13,63 / 15,42 |
| Plin 85% maxim | 7,00 / −2,51 / 5,43 / 18,78 | 6,48 / −2,66 / 5,12 / 19,34 | 11,58 / −1,23 / 13,16 / 14,94 |
| Plin 100% P75 | 6,40 / −1,06 / 5,25 / 16,50 | 5,23 / −1,38 / 4,84 / 16,13 | 16,79 / 1,77 / 14,85 / 19,23 |
| Plin fără pragul 300 km, minimum 1 km | 6,50 / 0,50 / 4,44 / 15,98 | 4,93 / −0,30 / 3,78 / 15,82 | 20,38 / 7,57 / 13,63 / 22,95 |
| Plin minimum 800 km/interval | 10,90 / −5,56 / 7,72 / 24,91 | 10,82 / −6,05 / 7,33 / 26,58 | 11,58 / −1,23 / 13,16 / 14,94 |
| **Codex, zi + 3.000 km** | **6,57 / −1,69 / 4,87 / 16,57** | **5,54 / −2,21 / 4,55 / 16,48** | **15,68 / 2,88 / 13,63 / 18,13** |
| SQL, mediana intervalelor | 6,17 / −1,57 / 5,21 / 16,35 | 5,75 / −1,55 / 4,71 / 19,75 | 9,93 / −1,74 / 13,16 / 14,94 |
| SQL, mediana ponderată cu km | 6,42 / −2,62 / 5,62 / 16,55 | 5,75 / −2,29 / 5,04 / 16,53 | 12,33 / −5,50 / 13,63 / 17,45 |
| **SQL, trim10** | **6,34 / −2,14 / 4,97 / 20,16** | **5,94 / −2,18 / 4,68 / 20,29** | **9,93 / −1,74 / 13,16 / 14,94** |
| SQL, minimum un interval | 6,89 / −1,98 / 4,87 / 23,16 | 6,28 / −2,85 / 4,76 / 23,11 | 12,29 / 5,67 / 10,79 / 24,86 |
| EB cod, K=2.000 | 6,61 / 0,71 / 4,55 / 23,15 | 5,10 / −0,22 / 4,39 / 15,51 | 20,00 / 8,96 / 23,28 / 40,74 |
| EB cod, K=5.000 | 6,45 / 0,57 / 4,38 / 21,55 | 5,16 / −0,26 / 4,08 / 18,15 | 17,95 / 7,86 / 21,34 / 33,81 |
| EB cod, K=10.000 | 6,39 / 0,46 / 5,18 / 21,57 | 5,26 / −0,27 / 4,21 / 18,46 | 16,39 / 6,92 / 19,72 / 28,40 |
| EB cod, K=30.000 | 6,59 / 0,35 / 5,37 / 20,31 | 5,68 / −0,27 / 4,42 / 18,05 | 14,63 / 5,78 / 17,76 / 22,82 |
| Tip empiric pur | 7,16 / 0,32 / 5,97 / 20,92 | 6,46 / −0,20 / 5,71 / 20,89 | 13,33 / 4,87 / 15,76 / 19,02 |
| **Claude text, K=5.000** | **6,45 / 0,57 / 4,38 / 21,55** | **5,16 / −0,26 / 4,08 / 18,15** | **17,95 / 7,86 / 21,34 / 33,81** |
| SQL, rezervă raport propriu | 7,15 / −2,15 / 4,79 / 25,28 | 6,19 / −2,68 / 4,72 / 22,15 | 15,63 / 2,58 / 9,34 / 40,13 |
| Plin EB cod, K=3.000 | 6,94 / −2,07 / 5,06 / 22,03 | 6,14 / −2,76 / 4,69 / 19,91 | 14,01 / 4,03 / 13,38 / 29,63 |
| Plin EB cod, K=10.000 | 7,12 / −1,89 / 5,35 / 22,88 | 6,25 / −2,60 / 5,17 / 19,74 | 14,83 / 4,36 / 16,61 / 27,62 |
| Codex EB, K=3.000 | 6,64 / −1,33 / 5,06 / 17,73 | 5,57 / −1,77 / 4,59 / 17,70 | 16,04 / 2,51 / 13,63 / 18,13 |
| Codex EB, K=5.000 | 6,67 / −1,18 / 5,42 / 16,67 | 5,60 / −1,58 / 4,43 / 16,56 | 16,17 / 2,39 / 13,63 / 18,13 |
| Codex EB, K=10.000 | 6,79 / −0,93 / 5,26 / 17,70 | 5,71 / −1,28 / 4,84 / 17,70 | 16,34 / 2,22 / 13,63 / 18,13 |
| 50% Codex + 50% Claude | 6,23 / −0,56 / 4,58 / 18,72 | 5,16 / −1,23 / 4,39 / 17,16 | 15,71 / 5,37 / 18,24 / 25,84 |
| Regresie săptămânală prin origine | 6,13 / −0,01 / 4,44 / 16,81 | 4,88 / −0,60 / 4,12 / 15,59 | 17,13 / 5,19 / 13,63 / 28,08 |
| Regresie cu zile active + km | 50,29 / 5,05 / 19,38 / 86,38 | 52,04 / 2,72 / 20,06 / 86,00 | 34,80 / 25,68 / 15,15 / 97,36 |
| Zi, 70% P90 | 7,11 / −3,37 / 5,30 / 19,99 | 6,42 / −3,69 / 4,72 / 19,79 | 13,31 / −0,60 / 13,16 / 18,47 |
| Zi, 100% P90 | 6,53 / −0,09 / 4,64 / 16,89 | 5,37 / −0,30 / 4,30 / 16,80 | 16,79 / 1,77 / 14,85 / 19,23 |
| Zi, minimum 100 km/interval | 7,22 / 0,22 / 4,79 / 17,90 | 5,16 / −1,19 / 4,04 / 17,43 | 25,50 / 12,69 / 13,63 / 28,20 |
| Zi, minimum 600 km/interval | 11,21 / −5,97 / 7,69 / 22,52 | 10,70 / −6,97 / 7,59 / 22,50 | 15,68 / 2,88 / 13,63 / 18,13 |
| Zi, minimum 1.000 km/interval | 9,85 / −3,25 / 7,31 / 26,80 | 9,07 / −3,82 / 6,67 / 26,79 | 16,79 / 1,77 / 14,85 / 19,23 |
| Zi, graniță −1 zi | 11,51 / −7,74 / 9,88 / 27,19 | 11,09 / −9,00 / 9,64 / 27,05 | 15,19 / 3,37 / 13,63 / 18,13 |
| Zi, graniță +1 zi | 7,25 / −0,25 / 5,06 / 18,62 | 5,38 / −1,70 / 4,72 / 18,37 | 23,85 / 12,65 / 13,63 / 26,72 |
| Zi, minimum două intervale | 6,58 / −2,35 / 5,23 / 22,74 | 5,82 / −2,67 / 4,77 / 22,70 | 13,32 / 0,52 / 13,16 / 18,47 |
| Zi, minimum cinci intervale | 6,88 / −1,88 / 4,87 / 22,74 | 5,76 / −2,29 / 4,55 / 22,70 | 16,79 / 1,77 / 14,85 / 19,23 |
| Zi, minimum zece intervale | 7,04 / −1,65 / 5,27 / 17,95 | 5,94 / −2,04 / 4,80 / 17,91 | 16,79 / 1,77 / 14,85 / 19,23 |
| Zi, minimum 5.000 km cumulați | 6,77 / −1,71 / 4,87 / 17,94 | 5,76 / −2,23 / 4,42 / 17,70 | 15,68 / 2,88 / 13,63 / 18,13 |

Rotunjirea SQL literală la o zecimală schimbă WAPE total la **7,08% în septembrie și 6,70% în august**. Nu schimbă concluzia comparației.

## A.5. Ce este și ce nu este demonstrat statistic

Cele două teste însumează **286 observații lună–vehicul, 153 vehicule distincte**.

| Metodă | WAPE cumulată, ponderată cu litrii |
|---|---:|
| Norma veche disponibilă atunci | 8,13% |
| Claude text | 7,08% |
| Codex | 6,79% |
| Codex + EB, K=3.000 | 6,74% |
| SQL trim10 | **6,55%** |

Am făcut **5.000 reeșantionări bootstrap pe vehicule**, seed `151`, păstrând împreună lunile aceluiași vehicul.

| Diferență WAPE, prima minus a doua | Estimare | Interval bootstrap 95% |
|---|---:|---:|
| Codex − Claude | −0,29 pp | −0,94…+0,32 pp |
| Trim10 − Codex | −0,24 pp | −1,01…+0,41 pp |
| Trim10 − Claude | −0,53 pp | −1,69…+0,46 pp |

**Toate intervalele includ zero.** În plus, alegerea între multe variante pe aceleași două luni este exploratorie. Nu este un test independent al variantei câștigătoare.

Fără camioane, diferența WAPE **Codex − Claude este +0,09 pp**, iar **trim10 − Claude +0,06 pp**. Așadar, avantajul global al familiei plin nu justifică impunerea ei ca metodă unică pe toate categoriile.

## A.6. Ora, P90 și folosirea viitorului

**Ora.** Reproduc efectul descris de Claude asupra selecției intervalelor interurbane:

| Sursa / perioada | Graniță zilnică | Convenția după prânz | Împărțire fracționară |
|---|---:|---:|---:|
| m2m, 2025–27.09.2026: rata tuturor intervalelor / rata celor ≥300 km | 1,0244 | 1,0033 | 1,0122 |
| Km producție, 10.06–27.09.2026 | 1,0181 | 1,0037 | 1,0089 |

Acest raport măsoară efectul filtrului de 300 km. **Nu este biasul predicției lunare.**

În backtestul interurban din septembrie, biasul efectiv este:

- SQL zilnic: **−1,95%**;
- convenția după prânz: **−0,64%**;
- împărțire fracționară: **−1,06%**.

În august, aceleași valori sunt **−3,84%, −2,88%, −3,20%**. Ora ajută aici, dar nu rezolvă integral abaterea și nu îmbunătățește uniform rezultatul întregii flote.

**P90.** În calibrarea pentru septembrie, schimbarea individual → zilnic modifică P90 la **115 vehicule**, dintre care **92** sunt în eșantionul testului. Norma calculată se schimbă cu peste 3% la **12 vehicule din eșantion**. Metoda mea rămâne calculabilă direct pentru **132/146 vehicule**; celelalte folosesc norma de rezervă.

**Folosirea lunii evaluate.** [Posterul](</Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-151-translux-combustibil-analiza-c/apps/admin/src/lib/lde/combustibil-poster.ts:109>) cere norma până la finalul perioadei raportului. În septembrie, pentru SQL:

- norma se modifică la **135/146 vehicule** prin includerea lunii evaluate;
- la **18** se modifică cu peste 5%;
- WAPE aparentă scade cu **0,53 pp**.

Nu este doar o problemă teoretică de evaluare: etalonul se adaptează chiar comportamentului pe care ar trebui să-l judece.

## A.7. Recomandarea actualizată

**Pentru autobuze și microbuze, accept formula Claude ca normă operațională lunară provizorie**, datorită simplității și faptului că nu necesită identificarea unor plinuri presupuse:

\[
r_i=100\frac{\sum L_{i,m,\mathrm{fereastră}}}{\sum K_{i,m}}
\]

\[
N_i=\frac{K_i r_i+5.000r_{\mathrm{tip}}}{K_i+5.000}
\]

Reguli:

1. Se folosesc ultimele trei luni închise; în testele acestei runde începutul este obligatoriu 10.06.
2. `r_tip` este raportul ponderat cu kilometrii pentru tip; minimum patru vehicule, altfel categoria.
3. Norma se fixează înaintea lunii evaluate și se păstrează cu data și sursele folosite.
4. Sub **3.000 km în calibrare**, nu pretind precizia demonstrată de aceste teste: folosesc norma anterioară disponibilă și marchez încrederea redusă.
5. Sub **1.000 km în luna evaluată**, fără verdict de abatere, conform regulii existente.
6. Păstrez separat **norma tehnică/măsurată** și **diferența față de mediana tipului**. Consumul istoric ridicat nu devine automat consum justificat.
7. Păstrez **plin-trim10 ca verificare independentă**, fiind varianta cu cea mai mică WAPE globală observată.

Aceasta este o alegere operațională, **nu afirmația că formula Claude a câștigat statistic**.

Pentru camioane recomand etalonul tehnic disponibil, verificarea pe perioade cumulate și intervale documentate, cu plin-trim10 ca estimare auxiliară. Nu recomand o normă istorică lunară folosită automat la imputare.

Un test suplimentar, cu calibrare până la 31.07 și evaluare cumulată 01.08–27.09, pe **9 camioane și 27.810,65 l**, dă:

| Metodă | WAPE pe cele două luni cumulate |
|---|---:|
| Norma veche | 13,70% |
| Codex | 12,62% |
| Claude | 15,31% |
| Plin-trim10 | **8,54%** |

Cumularea ajută în acest eșantion. **Nu demonstrează că trei luni elimină toate problemele de stoc, kilometri sau încărcare.**

## A.8. Marja și pragul comun de intervenție

Pentru norma Claude, pe cele **263 observații fără camioane** din cele două teste:

| Km în luna testată | N | P90 al \(|L/\widehat L-1|\) | Semnale la ±15% | Semnale la `max(10%, 2 plinuri)` |
|---|---:|---:|---:|---:|
| 1.000–2.000 | 17 | 24,97% | 6 | 1 |
| 2.000–3.500 | 38 | 25,34% | 8 | 4 |
| 3.500–6.000 | 86 | 16,05% | 11 | 7 |
| ≥6.000 | 122 | 8,43% | 5 | 6 |
| **Total** | **263** | — | **30** | **18** |

Recomand:

\[
D=L-\widehat L,\qquad
H=\max(0,10\widehat L,\;2q_i)
\]

unde \(q_i=P90\) al alimentărilor individuale din calibrare.

- \(D>H\): dosar de verificare a supraconsumului;
- \(D<-H\): verificare a alimentărilor lipsă, stocului sau kilometrilor;
- separat: consum cumulat peste **115% din mediana tipului**, pentru consumul cronic;
- fără imputare automată din simpla depășire.

Rata semnalelor depinde și de normă: aceeași regulă produce **27/263** cu metoda Codex și **26/263** cu trim10, față de **18/263** cu Claude. Nu există o rată universală de 6%.

# B. Anomalii

**Volumele de mai jos nu sunt pierderi dovedite. Clasele se suprapun și nu trebuie însumate.**

## B.1. Rezultatul verificării pe toată flota

| Clasă și perioadă | Cazuri | Volum asociat / abatere | Exemple verificabile | Detecție |
|---|---:|---:|---|---|
| Alimentări fără niciun km, 01.07–27.09 | 8 vehicule | **8.906,47 l** | LJN075: 4.665,37 l; QDQ396: 1.150,34 l | `ΣL>0` și `Σkm=0` în perioadă |
| Rezervor virtual, 10.06–27.09; inițial zero, km protocol | 27 evenimente, 10 camioane | **4.345,63 l**, condiționat de ipoteze | QDQ357/31.08: 688,97 l; IIC230/10.08: 595,63 l alimentați | Simulare zilnică, capacitate presupusă și 45 l/100 |
| Peste 115% din mediana tipului, 01.07–27.09 | 10 din 164 vehicule comparabile | **5.660,01 l peste mediană** | 603BRAS, 034BRAT, 783MUM, HMK135, RWN193 | ≥3.000 km; minimum patru vehicule/tip |
| Peste norma veche cu >20% în minimum două luni, iulie–27.09 | 6 vehicule | **4.374,15 l peste norma veche** în lunile semnalate | 783MUM, HMK135, LJN080, 603BRAS, 279BRAT, 710CWN | Rate lunare, ≥1.000 km; verificare retrospectivă |
| Foi fără rând GPS și fără rând m2m, fără camioane, 10.06–27.09 | 33 rânduri, 7 vehicule | **1.448,24 l** | 034BRAT/11.09: 44,05 l; 603BRAS/10.08: 32,41 l | Join pe placă–zi, absență în ambele surse |
| Sesiuni benzol >100 l la tipurile mici selectate, întreg istoricul | 264 sesiuni, 13 vehicule | **51.388,10 l** | 819BXI/06.01.2025: 289,85 l; 749SHS/28.03.2025: 271,24 l | Sesiuni unite la pauză ≤30 minute; prag de control 100 l |
| Km cârpiți eliminați prin regula parcării, întreg GPS | 2.202 zile | **30.522,60 km**; 7.279,31 l alimentați în acele zile | QDQ364/11.08: 600,07 l | Regula 444, fără eliminarea alimentărilor |
| „Plin fără drum”, convenția Claude după oră, întreg istoricul | 29 intervale | **1.726,68 l** | Inclusiv intervale pe foi, unde ora rămâne necunoscută | ≤7 zile, acoperire zilnică, ≥50% plin, <15% autonomie |
| Potrivire total zilnic benzol–foaie la ±1 l, întreg istoricul | 7 din 517 zile comune | **512,45 l pe foi** | QDQ375/05.05.2025: 300,17 versus 300 l | Potrivire pe placă–zi; verificare documentară |

Ultimul rând folosește explicit **totaluri zilnice și toleranța ±1 l**. Nu trebuie confundat cu potrivirea unor înregistrări individuale la altă toleranță. Niciuna dintre variante nu demonstrează dublarea sistematică.

## B.2. Lista corectă fără kilometri

Perioada unică: **01.07–27.09.2026**.

| Vehicul | Grup | Litri | Observație |
|---|---|---:|---|
| LJN075 | Camioane | 4.665,37 | Fără km |
| QDQ396 | Camioane | 1.150,34 | Fără km |
| BNQ076 | Camioane | 1.145,32 | Fără km |
| GHT553 | Camioane | 1.030,09 | Fără km |
| QDQ714 | Camioane | 800,27 | Fără km |
| MWC069 | Camioane | 45,00 | Volum mic, dar cazul există |
| 405LLA | Camioane | 40,05 | Inactiv în nomenclator, dar are alimentare |
| 239DQO | Interurban | 30,03 | Fără km |
| **Total** | | **8.906,47** | |

Diferența dintre rapoarte provine din amestecarea **listei cazurilor mari**, **listei tuturor camioanelor** și **listei întregii flote**.

## B.3. Rezervorul virtual Claude: reproducere și limite

Scriptul Claude face, în esență:

\[
S_0=T/2
\]

\[
S^\prime_d=S_{d-1}+L_d-0,45K_d
\]

\[
O_d=\max(0,S^\prime_d-T),\qquad
S_d=\max(0,\min(T,S^\prime_d))
\]

cu toleranța sa de 0,5 l pentru semnalare și:

\[
T=\max(600,\;1,1P95_{\text{alimentărilor}})
\]

**P95 este calculat din întreg istoricul disponibil**, deci capacitatea astfel dedusă nu este nici capacitate măsurată, nici reper disponibil neapărat la data evenimentului.

| Scenariu | Camioane semnalate | Evenimente | Litri „peste capacitate” |
|---|---:|---:|---:|
| Claude exact: rezervor inițial jumătate | 18 | 52 | **9.920,40** |
| Aceleași ipoteze, rezervor inițial gol | 10 | 27 | **4.366,46** |
| Inițial gol, km protocol comun | 10 | 27 | **4.345,63** |
| Ca mai sus, consum presupus 55 l/100 km | 9 | 20 | **3.041,69** |
| Ca protocolul, capacități ×1,5 | 5 | 10 | **1.226,32** |
| Ca protocolul, capacități ×2 | 2 | 2 | **191,32** |

Valorile de 55 l/100 și capacitățile mărite sunt **teste de sensibilitate**, nu estimări ale parametrilor reali.

În reproducerea Claude, **17 evenimente de camion, 3.325,65 l**, cad chiar pe zile fără rând GPS. Nici celelalte evenimente nu devin automat sigure: un gol anterior poate menține artificial prea mult combustibil în rezervorul virtual.

**Verdict:** păstrez simulatorul ca instrument de verificare a cronologiei. Retrag orice interpretare a celor 9.920 l ca „nu încap fizic” sau „pierdere minimă”. Și estimarea recuperării a 30–50% din acești litri este nesusținută de CSV.

Pe trei luni, cele **19 camioane cu minimum 3.000 km** au consumuri calendaristice între **29,33 și 53,61 l/100 km**, cu mediana **39,74**. Afirmația că toate se strâng între 35–47 nu este exactă.

## B.4. Lista comună de supraconsum și verificarea kilometrilor

Cele zece cazuri Claude se reproduc astfel:

| Vehicul | Consum cumulat | Mediana tipului | Litri peste mediană |
|---|---:|---:|---:|
| 034BRAT | 17,82 | 10,75 | 663,66 |
| 144BRAZ | 14,81 | 12,59 | 76,36 |
| 279BRAT | 15,22 | 10,75 | 526,00 |
| 284BRAT | 15,30 | 12,81 | 390,29 |
| 603BRAS | 19,90 | 10,75 | 736,81 |
| 760BXI | 15,49 | 13,18 | 412,32 |
| 783MUM | 38,82 | 28,64 | 964,68 |
| 849BRAN | 12,70 | 10,75 | 366,83 |
| HMK135 | 46,67 | 39,74 | 690,78 |
| RWN193 | 53,61 | 39,74 | 832,28 |
| **Total** | | | **5.660,01** |

Perioada este 01.07–27.09, cu fereastra de consum a întregii perioade. Nu este același calcul cu însumarea abaterilor față de norma veche, lună cu lună.

**Decizia pe cazurile reunite:**

| Caz | Verificare pe date | Decizie actualizată |
|---|---|---|
| **603BRAS / S004** | Iulie: 564,22 l, 2.331,40 km → **24,20 l/100**; cu km m2m și aceiași litri: **24,30**. August: **38,92**, respectiv **25,92** cu m2m. | **Păstrez investigația.** Km diferiți explică o parte din august, nu nivelul din ambele luni. În septembrie rata scade la **11,29**; nu extrapolez pierderea din vară. |
| **279BRAT / S217** | Iulie **16,57**, august **18,26**; cu m2m: **17,29 / 16,19**. Septembrie **10,38**. | **Păstrez dosarul istoric**, cu verificarea foilor și a schimbării șoferului/perioadei. Nu îl consider exces permanent. |
| **034BRAT / S217** | Septembrie: 1.204,15 l / 5.823,50 km → **20,68**; cu m2m: **19,87**. În 11, 12, 14, 15 și 16.09 sunt **248,88 l pe foi fără niciun rând GPS sau m2m**. | **Prioritate de verificare a documentelor și kilometrilor.** Norma măsurată 16,9 din 29.09 nu poate justifica retrospectiv predicția de la începutul lunii. |
| **783MUM** | Iulie **39,58** cu GPS și **40,01** cu m2m. August **43,97** cu GPS; m2m are mult mai puțini km și ar produce **81,40** cu aceiași litri. | **Păstrez semnalul tehnic/documentar.** Nu dispare prin alegerea m2m. Septembrie are numai **649,50 km** până la 27.09 și nu se judecă separat. |
| **LJN080** | August: 1.929,63 l / 4.477 km → **43,10**. Dacă cei 990 km din context sunt confirmați, rata devine **35,30**, față de norma 34. | **Scot cazul din supraconsumul confirmabil.** Îl mut la recuperarea/verificarea kilometrilor Wialon. Corecția de 990 km rămâne condițională. |
| **HMK135** | Cumulat **46,67**; iulie **51,22**, august **33,85**, septembrie până la 27.09 **61,51**. | **Păstrez investigația pe perioadă cumulată**, nu verdictul lunar. Rezervorul și încărcarea rămân necunoscute. |
| **RWN193** | Cumulat **53,61**, peste mediana camioanelor **39,74**. | **Păstrez controlul**, dar nu transform diferența în pierdere: rulajul și alimentările sunt distribuite foarte inegal între luni. |
| **710CWN** | Iulie **16,03**, august **15,73**, față de norma 13; cu m2m **15,67 / 15,43**. Exces în lunile semnalate: **208,87 l**. | **Păstrez verificarea tehnică**, cu prioritate mai mică. Nu este explicat integral de diferența GPS–m2m. |
| **602BRAS** | Ianuarie–august, aceeași sursă m2m: **10,53 → 15,01**, +42,5%; diferență față de rata 2025: **2.352,25 l**. Dar GPS iulie/august/septembrie: **12,85 / 11,93 / 10,91**. | **Păstrez ca deteriorare istorică de investigat**, nu ca economie curentă demonstrată. |
| **863MXL** | Istoric m2m: **9,65 → 12,94**, +34,1%; diferență **1.680,00 l**. GPS recent: **12,31 / 11,78 / 12,07**, față de norma 12,5. | **Scot din lista de supraconsum curent persistent.** Rămâne comparația istorică și verificarea vechiului reper. |
| **144BRAZ, 284BRAT, 760BXI, 849BRAN** | Sunt în lista de comparație cu tipul, dar nu toate sunt mult peste norma proprie. De exemplu, 849BRAN are **12,70**, față de norma proprie 12,5. | **Păstrez drept comparații între vehicule**, nu acuzații. Tipul, ruta și norma măsurată trebuie confruntate. |

Pentru S217, reproduc analiza Claude pe perioadele cu șofer identificat:

- **034BRAT:** raport față de ceilalți șoferi **1,144**, diferență **160,89 l**;
- **279BRAT:** raport **1,048**, diferență **27,95 l**;
- total: **188,84 l**, aproximativ cei 190 l raportați.

Aceasta confirmă **asocierea din calcul**, nu efectul cauzal al șoferului. Perioadele, traseele și zilele fără kilometri nu sunt controlate experimental.

## B.5. Corecția definitivă privind `km_check`

[Migrarea 222](</Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-151-translux-combustibil-analiza-c/packages/db/migrations/222_lde_gps_daily_quality.sql:9>) definește explicit:

> „km_check = verificare INDEPENDENTĂ a km_total: integrarea vitezei”

Prin urmare:

- retrag clasa mea „identitatea GPS nu se respectă” ca anomalie de date;
- nu înlocuiesc `km_total` cu `km_check+km_patched`;
- nu scad `km_patched` din toate zilele;
- păstrez regula parcării și verificarea separată a zilelor suspecte.

Pe **8.331 zile comune** din iulie–septembrie, cu ambele surse ≥20 km:

- **88,70%** sunt la ±10%;
- \(\sum m2m/\sum GPS=0,98138\).

Cu aceiași litri, folosirea m2m în locul GPS pe acest eșantion ar ridica rata agregată cu aproximativ **1,90%**. Aceasta explică de ce normele calibrate pe surse diferite nu trebuie transferate mecanic.

# C. Ce se poate face

**CSV-urile permit ordonarea volumelor de control, dar nu estimarea credibilă a litrilor efectiv recuperabili.** Nu păstrez estimarea Claude de 1.800–3.100 l/lună economisiți: procentele de recuperare nu sunt măsurate.

Pentru comparabilitate, „lunar” în tabel înseamnă echivalent de **30 zile**: 89 zile pentru 01.07–27.09 și 110 zile pentru 10.06–27.09.

| Prioritate | Acțiune concretă | Volum de control echivalent lunar | Economie/recuperare demonstrată | Siguranță |
|---|---|---:|---|---|
| 1 | Restabilirea kilometrilor și verificarea documentelor pentru cele opt vehicule fără km | **3.002 l/30 zile** | Necunoscută | Mare asupra lipsei de verificabilitate |
| 2 | Dosare comune pentru cele zece vehicule peste mediana tipului; întâi 034BRAT, 603BRAS, 279BRAT, 783MUM, apoi camioanele | **1.908 l/30 zile peste mediană** | Necunoscută; o parte poate fi diferență justificată de exploatare | Mare asupra diferenței aritmetice, medie asupra cauzei |
| 3 | Verificarea evenimentelor rezervorului virtual cu bon, kilometri Wialon și capacitate reală | **1.185 l/30 zile**, în scenariul inițial gol și km protocol | Necunoscută; rezultatul depinde puternic de ipoteze | Medie ca semnal, insuficientă ca prejudiciu |
| 4 | Confruntarea celor 33 foi fără nicio înregistrare de km, fără camioane | **395 l/30 zile** | Necunoscută; se suprapune cu dosarele de mai sus | Mare asupra absenței rândurilor |
| 5 | Fixarea normei înaintea lunii, păstrarea istoricului normelor și pragului în litri | Nu reprezintă economie fizică măsurată | Reduce riscul evaluării incorecte | Mare |
| 6 | Capacitate reală de rezervor, marcaj de plin real, oră pe foaie și legătură verificabilă cu șoferul | Neestimabil din CSV | Face posibilă evaluarea ulterioară | Mare ca necesitate de măsurare |

**Leii nu pot fi calculați din export:** `suma_lei` este zero pe toate cele **40.195 alimentări benzol**. Pentru un preț documentat \(p\), valoarea volumului verificat este \(p\times L\); economia este \(p\times L_{\text{recuperat confirmat}}\).

Nu folosesc 22 lei/l ca și cum ar proveni din CSV și nu însumez volumele din tabel, deoarece se suprapun.

# D. Ce nu se poate afla din aceste date

- **Consumul fizic exact**, deoarece alimentarea nu este egală cu consumul fără variația stocului din rezervor.
- **Capacitatea reală, nivelul inițial și plinurile reale.** P90/P95 ale alimentărilor nu le măsoară.
- **Kilometrii dintre două ore de alimentare.** Avem total zilnic; distribuția fracționară după oră este o ipoteză.
- **Kilometrii camionului în afara traseului autorizat**, sarcina, mersul încărcat/gol și relieful.
- **Cauza unei diferențe de consum sau răspunderea unui șofer.** În benzol, toate cele 40.195 rânduri au șoferul necompletat.
- **Corecția exactă Wialon pentru LJN080** și alte goluri, fără exportul sursei.
- **Prețul efectiv și prejudiciul în lei.**
- **Versiunea istorică completă a normelor.** Am exclus măsurările datate în viitor, dar CSV-ul nu oferă un jurnal al tuturor modificărilor normelor de tip.
- **Un câștigător definitiv între metode sau o regulă sezonieră validată**, din două luni de test GPS.

Pentru reproducere, calculele executate au fost: agregări placă–zi și ferestre lunare; reconstruirea intervalelor prin sume cumulative; variantele P90, oră, mediană, trim și EB; scoruri pe același eșantion; bootstrap pe vehicule; simularea zilnică a rezervorului cu sensibilități; comparații GPS–m2m; listele de absențe, persistență, tip și șofer. Am verificat și funcțiile din scripturile Claude accesibile local, fără a executa instrucțiunile lor de salvare. **Toate rezultatele numerice raportate mai sus provin din recalcularea CSV-urilor; ipotezele de simulare sunt marcate explicit.**