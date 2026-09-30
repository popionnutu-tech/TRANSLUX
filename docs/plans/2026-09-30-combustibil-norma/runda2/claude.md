# ION-151 — runda 2 — Claude

Scripturile și jurnalele: `scratchpad/r2-claude/` (`r2core.py` = protocolul comun; `s01`…`s07`; `log_*.txt`). Refolosesc
`r1-norma/load.py` și `r1-anomalii/Z.pkl`. Nimic nu s-a scris în bază, nimic nu s-a trimis, fără commit.

**Protocolul reprodus exact ca la Codex:** Test 1 (calibrare 10.06–31.08 → 01–27.09) are **N = 146 vehicule, 14 camioane,
168.769,5 l**. Test 2 (10.06–31.07 → august) are **N = 140, 9 camioane, 146.751,9 l**. Pe metodele Codex obțin aceleași cifre
până la a doua zecimală: 6,76 / 7,10 / 6,98 / 8,28 / 9,70 % în septembrie și 6,57 / 6,72 / 6,75 / 7,53 / 9,14 % în august. Cele două
implementări sunt deci echivalente, iar diferențele din runda 1 veneau din țintă și din metrică, nu din cod.
Convenții: e = (prezis − real)/real, deci **bias pozitiv = supraestimare** (convenția Codex). Toate metodele au fallback la norma veche.

---

## Verdict pe dezacordurile 1–9

| # | Dezacord | Cine are dreptate | Cifra decisivă |
|---|---|---|---|
| 1 | Metoda normei | **Codex.** Metoda mea nu e mai bună pe protocolul comun | Pe sep+aug, fără camioane: plin zilnic ≥3 intervale ≥3.000 km are WAPE 5,09 %, iar shrinkage-ul meu 5,13 % (Δ +0,04 pp, IC95 −0,47…+0,57). Metoda Codex bate sigur SQL-ul de azi (−0,46 pp, IC −0,85…−0,16) și norma veche (−1,02 pp, IC −1,58…−0,44) |
| 2 | Granița după oră | **Ambii, pe jumătate.** Testele erau diferite | Decalajul brut înrăutățește, și la el și la mine: varianta mea din r1 (plin benzol după 12:00 ⇒ +1 zi) dă +0,70 pp (IC +0,15…+1,26). Împărțirea proporțională a km-ilor zilei după ora plinului e neutră pe WAPE (−0,15 pp, IC −0,39…+0,07). Scoate doar o parte din bias-ul interurbanelor: −2,21 → −1,69 %, nu până la 0,3 % cum am scris în r1 |
| 3 | P90 pe înregistrări / înregistrări cumulate | **Codex** pe P90. **Punctul meu nu contează** pentru fereastra din iunie | SQL 445 calculează P90 pe rânduri (`ref` peste `al`). La 90 din 183 de vehicule zilele de plin diferă. Varianta pe totalul zilei e mai bună cu ~0,23 pp. Înregistrări benzol >100 l pe tipuri mici în fereastra 10.06–27.09.2026: **0** (ultima e din 05.2026, restul din 2025) |
| 4 | Lookahead în poster | **Codex, confirmat în cod** | `combustibil-poster.ts:109` cheamă `lde_fuel_plin_la_plin(de: '2026-06-10', pana)`, cu pana = sfârșitul lunii judecate. În august norma înghite 19 % din abatere, iar 4 din 15 mașini peste +15 % dispar de pe poster. WAPE aparent: SQL 7,10 → 6,57 % (sep) și 6,72 → 5,31 % (aug) |
| 5 | Camioane / rezervor virtual | **Codex.** Cifra mea de 9.920 l nu rezistă | La 17 din 31 de camioane există o alimentare benzol singulară mai mare decât rezervorul presupus de mine. Dacă nivelul se resetează după zilele fără GPS, 9.920 l devin 1.914 l. În varianta prudentă rămân 336 l, în 3 evenimente. Nicio metodă nu coboară sub ~18 % WAPE la camioane |
| 6 | Mașini fără km | **Codex** (8 vehicule, 8.906,47 l). Lista mea din r1-norma era greșită | Cu litri relevanți sunt 5: LJN075, QDQ396, BNQ076, GHT553, QDQ714, cu 8.791,4 l. r1-norma a omis GHT553 (1.030 l) și a pus în loc MWC069 (45 l) |
| 7 | Km GPS | **Codex are dreptate pe fapt, dar fără efect pe normă** | Identitatea nu se verifică în 80,8 % din rânduri, dar Σ(check+patched)/Σtotal = 1,0019. Dispersia intervalelor e aceeași: 4,28 cu km_total, 4,25 cu km_check. m2m e sub GPS: Σm2m/ΣGPS = 0,9816 |
| 8 | Supraconsum | **Lista se unește; 3 nume ies** | Rămân sigure 603BRAS, 279BRAT, 034BRAT și 783MUM (2.891 l peste mediana tipului în iul–sep). Ies 863MXL (km fantomă m2m în feb–mar 2025), LJN080 (golul Wialon explică tot) și KWX620 (e sub surorile lui; norma veche era prea mică). 602BRAS are +25 %, nu +42 % |
| 9 | Pragul | **Convergență:** pragul Codex (15/20 %) cu podeaua mea de 2 plinuri, doar în sus. Camioanele nu primesc imputare lunară | „ΔL > max(15 %, 2 plinuri)” semnalează 5,3 % din vehicul-luni, uniform pe km (5,9 / 7,9 / 7,0 / 3,3 %). „\|dev\| > 15 %” semnalează 11 %, iar la 1–2k km 35 % |

**Tabelul comun, condensat** (WAPE %; „sep+aug” = Σ|eroare| / Σlitri pe 286 de vehicul-luni; Δ = față de metoda Codex, fără camioane, IC95 bootstrap pe vehicule cu 2.000 de reeșantionări, seed 151):

| metoda | sep total / fără cam / cam | aug total / fără cam / cam | sep+aug fără cam | bias total | P90 \|e\| fără cam | Δ fără cam [IC95] |
|---|---|---|---|---|---|---|
| **plin zi, ≥3 int., ≥3.000 km (Codex)** | **6,76 / 4,69 / 21,5** | 6,57 / 5,54 / 15,7 | **5,09** | −0,98 | 15,6 | — |
| media(Codex, shrinkage Claude) | — | — | 4,90 | **+0,02** | 15,7 | −0,19 [−0,46; +0,10] |
| plin zi, km împărțiți după ora plinului | 7,11 / 4,55 / 25,3 | 7,42 / 5,38 / 25,5 | 4,94 | −0,13 | 15,4 | −0,15 [−0,39; +0,07] |
| plin zi ≥3.000, media tăiată 10 % | 6,94 / 4,74 / 22,7 | 6,46 / 5,43 / 15,6 | 5,07 | −0,33 | 16,5 | −0,02 [−0,29; +0,25] |
| shrinkage spre tip K=5.000 (Claude r1) | 7,62 / 5,11 / 25,6 | 6,45 / 5,16 / 18,0 | 5,13 | +1,01 | 15,8 | +0,04 [−0,47; +0,57] |
| plin zi + shrinkage spre tip K=5.000 | 7,04 / 4,79 / 23,1 | 6,68 / 5,84 / 14,1 | 5,29 | −0,87 | 16,3 | +0,20 [−0,10; +0,52] |
| plin zi fără pragul de 3.000 km | 6,98 / 4,94 / 21,5 | 6,75 / 5,74 / 15,7 | 5,32 | −1,16 | 15,9 | +0,23 [+0,07; +0,46] |
| **plin SQL 445 (azi, fără lookahead)** | 7,10 / 5,00 / 22,1 | 6,72 / 6,18 / 11,6 | 5,55 | −1,80 | 16,3 | +0,46 [+0,16; +0,85] |
| plin, granița +1 zi după 12:00 (Claude r1) | 7,68 / 5,21 / 25,3 | 8,31 / 6,44 / 24,9 | 5,79 | −1,03 | 16,5 | +0,70 [+0,15; +1,26] |
| norma veche | 8,28 / 5,77 / 26,2 | 7,53 / 6,48 / 16,8 | 6,11 | −0,31 | 18,2 | +1,02 [+0,44; +1,58] |
| norma tipului | 9,70 / 6,60 / 31,9 | 9,14 / 7,12 / 27,0 | 6,84 | −4,91 | 17,5 | +1,75 [+1,06; +2,44] |
| *[lookahead] SQL ca în poster, cu luna inclusă* | *6,57 / 4,38 / 22,2* | *5,31 / 4,97 / 8,3* | *4,66* | *−1,18* | *15,6* | *nu e backtest* |

(Mai multe variante, inclusiv mediana erorii pe grupuri: `log_protocol.txt`, `log_pooled.txt`, `log_grupuri.txt`.)

---

## A. Metoda normei

### A.1 Ce arată protocolul comun (`s01_protocol.py`, `s02_pooled.py`)
- **Nicio metodă nu câștigă ambele luni pe toate grupurile.** Pe septembrie câștigă Codex (total 6,76). Pe august shrinkage-ul meu
  e mai bun pe total (6,45 față de 6,57) și fără camioane (5,16 față de 5,54). Cumulat, diferența dintre cele două e zero
  (+0,04 pp, IC −0,47…+0,57). **Recunosc: avantajul din r1 (mediana 4,1 față de 4,8) venea din metrică și din compararea cu SQL-ul
  de azi, nu cu metoda Codex.** Pe mediana erorii din protocol ies 4,03 față de 3,95 (sep) și 4,38 față de 4,87 (aug).
- **Diferențele sigure statistic** (IC95 care nu trece prin 0), toate fără camioane:
  - metoda Codex bate SQL-ul 445 (−0,46 pp);
  - bate norma veche (−1,02 pp);
  - bate norma tipului (−1,75 pp);
  - pragul de ≥3.000 km ajută (plin zi fără el: +0,23 pp);
  - granița „+1 zi după 12:00” strică (+0,70 pp).
- **Bias-ul pe grupuri** (sep+aug, `s03_grupuri.py`). Toate metodele plin subestimează interurbanele: SQL −2,98 %, Codex −2,21 %,
  ora proporțională −1,69 %. Shrinkage-ul meu dă −0,74 %. Pe autobuzele de uzină și pe microbuze bias-ul metodei Codex e sub
  ±0,5 %. Cauza la interurbane: intervalele sub 300 km ies din calcul. Norma grupului pe toate intervalele față de doar cele
  ≥300 km: 1,012 interurban, 1,016 autobuze uzină, 1,020 microbuze, 1,045 camioane; cu ora proporțională, 1,005 la interurban.
- **Combinațiile.**
  - „Plin + shrinkage spre tip” nu ajută (+0,20 pp).
  - „Fallback shrinkage în loc de norma veche” strică (+0,24 pp).
  - Media dintre metoda Codex și shrinkage-ul meu are bias-ul cel mai curat (+0,02 %) și WAPE-ul cel mai mic fără lookahead
    (6,64 total, 4,90 fără camioane), dar câștigul nu e sigur (−0,19 pp, IC −0,46…+0,10). Nu justifică două formule.
- **Camioanele** (N = 23 camion-luni, sep+aug): WAPE între 17,7 (SQL) și 26,6 % cu orice metodă, iar clasamentul se inversează
  între luni (SQL 22,1 în sep, 11,6 în aug). Cu N atât de mic nu se poate alege o metodă pentru camioane.

### A.2 Recomandarea (convergentă cu Codex)
1. **Norma operațională = plin estimat la plin estimat pe totalul zilei** (Codex):
   - q = P90 al litrilor pe zi;
   - ziua e plin dacă L_zi ≥ 0,85·q;
   - litri z1<zi≤z2, km z1≤zi<z2;
   - intervalele sub 300 km ies;
   - **minimum 3 intervale și ≥ 3.000 km în intervalele acceptate**, altfel norma veche marcată cu *;
   - **fixată la sfârșitul lunii dinaintea celei judecate** (fără lookahead, vezi #4).
2. **Fereastra:** de la 10.06.2026 până la sfârșitul lunii anterioare, plafonată la 6 luni când istoricul crește. Plafonul e o
   extrapolare din backtestul lung r1 pe m2m (3 și 6 luni echivalente, 12 luni cu bias +1,4 %). Pe GPS nu se poate testa încă.
3. **Opțional, după o lună de date: km-ii zilei plinului împărțiți după ora benzolului.** Formula: f = (ora − 5)/17, tăiat la 0…1.
   Fracția f din km-ii zilei trece la intervalul vechi; foaia rămâne f = 0. E neutru pe WAPE, dar scoate 0,5 pp din bias-ul
   interurbanelor și 0,9 pp din al SQL-ului. Merită doar dacă se vrea bias-ul curat, nu pentru precizie.
4. **Camioanele:** aceeași normă se afișează, dar abaterea lunară nu se impută (vezi #5, #9).

---

## Dezacordurile, pe rând

### 1. Metoda normei
Vezi A.1. **Codex are dreptate:** metoda lui e cel puțin la fel de bună ca a mea și e singura care bate sigur SQL-ul de azi.
Shrinkage-ul meu rămâne util doar ca indicator „mașina față de tip” (#8), nu ca normă.

### 2. Granița intervalului
Cele două teste din r1 măsurau lucruri diferite:
- Codex a mutat toată fereastra de km cu ±1 zi;
- eu am mutat granița numai la plinurile benzol de după 12:00.

Pe protocolul comun (`s01`, `s03`):

| varianta | WAPE sep+aug fără cam | bias interurban | bias SQL total |
|---|---|---|---|
| fără oră (azi) | 5,09 | −2,21 % | −1,80 % |
| +1 zi după 12:00 (Claude r1) | 5,79 (+0,70 pp, sigur mai slab) | −3,60 % | — |
| proporțional f = (h−5)/17 | 4,94 (−0,15, nesigur) | −1,69 % | −1,06 % (SQL ora-prop) |

**Recunosc:** „bias-ul interurban scade la 0,3 %” din r1 era raportul normei pe intervale, nu bias-ul unui backtest. În
backtest scade cu 0,5 pp, nu cu 2 pp. Cele 316 → 29 de alarme „plin fără drum” (r1 `s12b`/`s12c`) rămân valabile, dar țin de
detectarea anomaliilor, nu de precizia normei. Acolo ora benzolului trebuie folosită.

### 3. P90 pe înregistrări vs pe totalul zilei; înregistrările cumulate
- În `445_*.sql`, `ref` = `percentile_cont(0.9)` peste rândurile `al` (benzol + foaie), apoi `plin` = `DISTINCT zi` unde un rând
  ≥ 0,85·p90. **Confirmat: P90 pe înregistrări.**
- Efectul (calibrare 10.06–31.08, `s04`):
  - 90 din 183 de vehicule au alte zile de plin (431 de zile doar pe înregistrare, 296 doar pe zi, din 4.476);
  - norma se mută median cu 0 %; la 16 vehicule cu peste 3 %, la 2 cu peste 10 % (386PKP +16 %, 279BRAT +10 %);
  - contează la interurban, unde 37,7 % din zile au mai multe alimentări și P90 pe zi / P90 pe rând = 1,075;
  - în protocol, varianta pe zi e mai bună cu ~0,23 pp (SQL +0,46, zi +0,23 față de Codex).
- **Înregistrările cumulate peste rezervor** (r1: până la 289 l/sesiune pe Sprintere, în 2025): 264 de sesiuni între 01.2025 și
  10.2025, una în 05.2026 și **zero în fereastra 10.06–27.09.2026**. **Pentru norma din iunie punctul meu nu contează.** Ar conta
  doar dacă fereastra s-ar întinde în 2025. Din 10.06 există 73 de zile >100 l pe tipuri mici (819BXI 16), dar sunt două
  alimentări pe zi la interurbane, nu un singur rând cumulat.

### 4. Lookahead în poster
- **Cod:** `combustibil-poster.ts:90` `PLIN_DE_LA = '2026-06-10'`; `:109` apelul
  `lde_fuel_plin_la_plin({ de: PLIN_DE_LA, pana, ... })`, cu `pana` = ultima zi a lunii raportului (`capete(luna)`). La `:125`
  `teoretica` = acest plin, iar abaterea = fapt/teoretica − 1. **Norma include luna judecată.**
- **Efectul** (`s05`, fapt = luna producției, ≥ 1.000 km):
  - **August 2026, fără camioane (140):** |abatere| mediană 4,21 % pe poster față de 4,92 % cu norma fixată la 31.07. Peste +15 %:
    11 față de 15; peste +20 %: 7 față de 11. Norma absoarbe **19 % din abatere** (panta 0,189). Exemple: 034BRAT −22,2 % → −3,7 %,
    710CWN +15,9 % → −3,0 %, KWX620 +17,5 % → −2,3 %, ANT347 +15,2 % → +1,4 %.
  - **Septembrie 2026:** efect mic (panta 0,018; mediana 8,20 față de 8,41), fiindcă luna e a patra din fereastră. Lookahead-ul
    contează cel mai mult în primele luni după 10.06 și la mașinile cu puține intervale.
  - **În backtest:** SQL cu luna inclusă 6,57 față de 7,10 (sep) și 5,31 față de 6,72 (aug). Codex a raportat 6,32 față de 6,98 pe
    varianta pe zi. Ordinul de mărime e același.

### 5. Camioanele și rezervorul virtual
Am reprodus exact cele 9.920 l (52 de evenimente, 18 camioane) și le-am supus unor ipoteze mai prudente (`s06_rezervor.py`):

| ipoteză | litri „nu încap” |
|---|---|
| r1: T = max(600, 1,1·P95), normă 45, start T/2 | 9.920 |
| + nivel resetat la 0 după zilele fără rând GPS | 1.914 |
| + start de la gol | 840 |
| T = cea mai mare alimentare benzol singulară, normă proprie ×1,3, start gol, reset | **336 (3 evenimente)** |
| T = cea mai mare sumă pe zi, normă proprie ×1,3, start gol, reset | 0 |

De unde vin cei 9.920 l:
- 3.326 l cad în zile fără rând GPS;
- 5.216 l în zile cu km < 5 (plinul de dinainte de cursă);
- **la 17 din 31 de camioane o singură alimentare benzol depășește rezervorul presupus** (ANT347 778 față de 654, BNQ085 1.150
  față de 916, KWX620 870 față de 679).

Rezervorul real nu e în date, iar maximul observat nu e capacitate. Critica Codex e corectă, iar cifra de 2.700 l/lună din r1 se
retrage. Rămân de verificat nominal cele 3 evenimente robuste: **MOW214 09.09.2026 917,4 l la 0 km**, **LJN076 18.09.2026 817,1 l
la 224 km**, **RWN193 03.09.2026 827,6 l la 241 km** (ultimul e și pe lista celor 8 foi mari a lui Codex).

Ce se mai poate face la camioane: cumulat pe 3 luni sau pe intervale plin-la-plin închise. În r1 1b, calibrarea pe iun–iul cu
predicție pe aug+sep dă mediana 8,2 % cu plin, față de 17–29 % pe lună. În plus, Wialon pe cele 5 fără km și bonul pe foile mari.

### 6. Mașinile fără km (01.07–27.09.2026, `s04`)
Toate cele 8 ale lui Codex au litri și zero km, în GPS și în m2m:

| placa | litri | sursa litrilor | observație |
|---|---|---|---|
| LJN075 | 4.665,4 | 3.286 benzol + 1.379 foaie | fără tracker, niciodată km |
| QDQ396 | 1.150,3 | benzol | niciodată km |
| BNQ076 | 1.145,3 | benzol | fără tip, niciodată km |
| GHT553 | 1.030,1 | benzol | fără tip, fără tracker |
| QDQ714 | 800,3 | benzol | m2m până la 28.01.2026, fără drept Wialon |
| MWC069 | 45,0 | benzol | fără tip |
| 405LLA | 40,0 | benzol | **inactiv** |
| 239DQO | 30,0 | benzol | **interurban** Sprinter 516, m2m până la 31.05.2026 |

**Lista corectă are 8 vehicule și 8.906,47 l; cu litri relevanți sunt 5, cu 8.791,4 l.** r1-norma a greșit (MWC069 în loc de
GHT553). r1-anomalii a listat 5, dar a adunat 8.876 l (a inclus MWC069 și 405LLA). Nicio mașină nu are 0 < km < 100 și litri
peste 200.

### 7. Km-ii
- **Identitatea:** pe 14.097 de rânduri cu km_total > 0, |km_total − km_check − km_patched| > 0,2 km în **80,8 %** (Codex: 70,5 %,
  probabil alt numitor). Diferența e mică și fără semn: mediana −0,5 km, P5…P95 −14,1…+3,9 km. **Pe sumă identitatea ține:
  Σ(check+patched)/Σtotal = 1,0019.** Pe rândurile fără cârpeală, km_total/km_check = 0,976, iar 96,9 % au diferență: km_check pare
  un calcul independent al urmei, nu partea necârpită din km_total.
- **Pentru normă:** pe aceleași intervale, MAD-ul relativ al l/100 e 4,28 cu km_total și 4,25 cu km_check (139 de vehicule,
  camioane identic 14,87). **Nicio consecință: se păstrează km_total cu regula parcării.**
- **m2m față de GPS:** pe 8.347 de zile comune iul–sep, ambele ≥ 20 km, 88,5 % sunt la ±10 %, **Σm2m/ΣGPS = 0,9816** (autobuze uzină
  0,986, interurban 0,990, microbuze 0,967). Premisa „+8 %” din CONTEXT e greșită, iar Codex și eu suntem de acord. Pentru normă,
  unde m2m ține locul GPS-ului, norma iese cu ~2 % mai mare (3 % la microbuze). De aceea cerința „≥ 95 % km GPS” din protocol e
  justificată și ar trebui afișată pe poster ca stare a km-ilor.

### 8. Supraconsum: lista unită (`s07`, iul–27.09.2026, km prod, ≥ 3.000 km)

| placa | tip | l/100 | mediana tipului | față de tip | exces l | km m2m/GPS | verdict |
|---|---|---|---|---|---|---|---|
| 783MUM | DAF | 38,8 | 28,6 (29 mașini) | +36 % | 965 | 0,88 | **rămâne.** Cronic (r1: 19 luni); iul 39,6, aug 44,0; verificare tehnică |
| 603BRAS | Sprinter 312 | 19,9 | 10,75 (22) | +85 % | 737 | 1,04 | **rămâne.** Iul 24,2, aug 38,9 pe GPS (25,9 chiar cu km m2m), sep 11,3 = revenit |
| 034BRAT | Sprinter 312 | 17,8 | 10,75 | +66 % | 664 | 1,00 | **rămâne.** Sep 20,7; norma măsurată 16,9 „legalizează” supraconsumul |
| 279BRAT | Sprinter 312 | 15,2 | 10,75 | +42 % | 526 | 0,92 | **rămâne.** Iul 16,6, aug 18,3, sep 10,4 = revenit |
| RWN193 | Actros | 53,6 | 39,7 (19) | +35 % | 832 | — | de urmărit. În 2025 avea în m2m direcția „Benzovoz”: de verificat dacă foile lui includ motorină transferată |
| HMK135 | Actros | 46,7 | 39,7 | +17 % | 691 | — | de urmărit (luni 51 / 34 / 62: zgomot de camion) |
| 710CWN | Sprinter 316 | 15,4 | 13,4 (5) | +15 % | 232 | 1,02 | de urmărit (stabil 15–16; 2025→2026 +13 %) |
| 602BRAS | Sprinter 312 | 11,9 | 10,75 | +10 % | 258 | 0,87 | de urmărit, prioritate mică. Iul 12,8, aug 11,9, sep 10,9, în scădere |
| LJN080 | Actros | 43,1 | 39,7 | +8 % | 292 | — | **iese.** Cu cei 990 km lipsă din august: 1.930/(4.477+990) = 35,3 l/100, sub mediană |
| 863MXL | Sprinter 315 | 12,1 | 12,6 (18) | −4 % | −92 | 0,97 | **iese.** Codex are +34 % pe m2m din cauza km fantomă din 2025: feb 15.681 km la 5 l/100, mar 11.659 la 7. Pe iun–sep 2025→2026: +4,1 % |
| KWX620 | Actros | 36,8 | 39,7 | −7 % | −407 | — | **iese.** A ieșit pe lista Codex doar fiindcă norma veche (25/31) e mică |

602BRAS față de Codex: +42 % vine din litrii calendaristici ai lui ianuarie 2026 (lună cu 531 km m2m). Cu regula lunii ies
10,53 → 13,21 l/100 (**+25 %**), iar pe aceleași luni iun–sep, +27 %. E o creștere reală față de 2025, dar azi e doar cu 10 % peste
surori.

**Cele 4 sigure:** 2.891 l peste mediana tipului în 89 de zile ≈ **975 l/30 de zile**. Continuă 034BRAT și 783MUM; 603BRAS și 279BRAT
au revenit în septembrie.

### 9. Pragul de abatere (`s05`, eșantionul protocolului sep+aug, norma Codex fixată înainte; fără vină cunoscută)

| regula (fără camioane, N = 263) | 1–2k km | 2–3,5k | 3,5–6k | >6k | total |
|---|---|---|---|---|---|
| \|dev\| > 15 % | 35,3 | 15,8 | 11,6 | 5,7 | 11,0 |
| dev > +15 % | 11,8 | 7,9 | 8,1 | 3,3 | 6,1 |
| dev > +20 % | 5,9 | 7,9 | 3,5 | 2,5 | 3,8 |
| **ΔL > max(15 %, 2 plinuri)** | 5,9 | 7,9 | 7,0 | 3,3 | **5,3** |
| **ΔL > max(20 %, 2 plinuri)** | 5,9 | 7,9 | 3,5 | 2,5 | **3,8** |

- P5…P95 al abaterii fără camioane: −14,1 % … +17,3 %. Plinul tipic e de 62 l, adică 7,1 % din litrii lunii, deci podeaua de 2
  plinuri contează doar sub ~3.000 km.
- La camioane (N = 23): „dev > +15 %” semnalează 34,8 %, iar „ΔL > max(15 %, 2 plinuri)” 4,3 %. P5…P95: −35 % … +54 %.
- **Ce prinde:** în august, regula „max(15 %, 2 plinuri)” prinde 603BRAS (+238 %, +390 l), 279BRAT (+39 %) și 783MUM (+37 %). În
  septembrie prinde 034BRAT (+22 %) și RWN193 (+66 %). LJN080 (+27 % și +23 %) rămâne sub 2 plinuri de camion (554 l), deci nu
  e prins, ceea ce e corect: km-ii lui lipsesc.

**Regula convergentă:**
- abaterea se socotește doar în sus;
- sub −15 % e **verificare de km**, nu laudă;
- **supraveghere** = ΔL > max(15 %·N·km, 2 plinuri);
- **investigație** = ΔL > max(20 %, 2 plinuri), sau supraveghere două luni la rând;
- gri sub 1.000 km;
- **camioane:** fără imputare lunară, semnal doar pe 3 luni cumulate sau pe intervale plin-la-plin închise, plus documente.

---

## B. Anomalii: ce se schimbă față de runda 1

| clasă | runda 1 (Claude) | runda 2 | exemple verificabile |
|---|---|---|---|
| Litri fără km | 5 camioane / 8.876 l (sumă greșită) | **8 vehicule, 8.906,47 l; 5 relevante, 8.791,4 l** | LJN075 4.665,4 l; GHT553 1.030,1 l |
| Rezervor virtual la camioane | 9.920 l | **retras ca sumă**; robust 336 l în 3 evenimente | MOW214 09.09 917,4 l la 0 km; LJN076 18.09 817,1 l; RWN193 03.09 827,6 l |
| Supraconsum | 10 mașini / 5.660 l | **4 sigure / 2.891 l** în 89 de zile + 4 de urmărit; ies LJN080, 863MXL, KWX620 | tabelul de la #8 |
| Înregistrări cumulate > rezervor | 264 de sesiuni, 51.388 l | istorice (2025), 0 în fereastra normei | 819BXI 06.01.2025 289,85 l |
| Norma ascunde abaterea (lookahead) | — | **nou:** 4 din 15 peste +15 % dispar în august | 034BRAT, 710CWN, KWX620, ANT347 |
| km_check ≠ km_total − km_patched | — | 80,8 % din rânduri, fără efect pe sumă (1,0019) | — |
| Șoferi în benzol | nu am spus-o în r1-norma | **coloana `sofer` e goală în toate cele 40.195 de rânduri benzol** (Codex și r1-anomalii); șoferul se leagă doar prin m2m | — |

Cum se prind automat: regulile de la #3 (P90 pe zi), #6 (ΣL > 0 și Σkm = 0 pe lună) și #9, plus reziduul de rezervor doar cu reset
după golurile de GPS și cu T ≥ cea mai mare alimentare observată.

## C. Ce se poate face (ordonat după litri/lună; fără preț în date, lei = litri × p)

| # | acțiune | litri/lună | siguranță |
|---|---|---|---|
| 1 | Km pentru cele 5 camioane fără km (tracker, drept Wialon); până atunci, bon și km aprobați | **2.930 l/lună expuși** (8.791,4/3), economie necunoscută | sigur ca problemă |
| 2 | Cazurile nominale 034BRAT și 783MUM (continuă); bonurile pentru 603BRAS și 279BRAT pe mai–aug | **~975 l/30 de zile** peste tip pentru cei 4 în iul–sep; în curs ~550 (034BRAT + 783MUM ≈ 1.629 l/89 de zile) | ridicat pe cifră, mediu pe partea recuperabilă |
| 3 | Camioane peste surori: RWN193 (întâi rolul de benzovoz) și HMK135 | ~510 l/lună (1.523 l/89 de zile) | scăzut-mediu, zgomot de camion |
| 4 | Norma fixată înaintea lunii (scoate lookahead-ul) + metoda Codex în loc de SQL 445 | 0 l direct; −0,46 pp eroare și 4 din 15 abateri reale reapar în luni ca august | sigur |
| 5 | Pragul convergent (#9) | 0 l direct; 5,3 % din mașini semnalate în loc de 11 % cu ±15 % | sigur |
| 6 | Reconcilierea celor 8 foi mari de camion (Codex, 5.301 l) și a celor 3 evenimente robuste de rezervor | ~1.770 l/lună volum de verificat; recuperabilul necunoscut | mediu |
| 7 | 602BRAS și 710CWN de urmărit | ~165 l/lună (490/89×30) | scăzut |

## D. Ce nu se poate afla din aceste date
- Capacitatea reală a rezervorului la camioane: maximul observat depășește ipoteza la 17 din 31. Fără ea, rezervorul virtual nu
  dă sume, doar evenimente de verificat.
- Dacă RWN193 a fost benzovoz în 2026 (m2m nu are direcție în 2026 pentru el) și dacă foile lui conțin motorină transferată.
- Semnificația exactă a `km_check`: diferă de km_total − km_patched pe rând, dar se potrivește pe sumă. Trebuie întrebat cine a
  construit exportul.
- Cea mai bună metodă pentru camioane: 23 de camion-luni, cu clasamentul inversat între luni.
- Efectul ferestrei lungi (> 6 luni) pe norma plin din GPS: GPS-ul pe toată flota există doar din 10.06.2026.
- Iarna pe norma plin: nu există încă nicio iarnă cu GPS; r1 a arătat +4,2 % bias în ian–feb pe m2m.
- Șoferul la alimentarea benzol (coloana e goală); prețul (suma_lei = 0); ora foii.
