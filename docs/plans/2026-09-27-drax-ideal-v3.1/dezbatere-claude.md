# ION-99 ideal-v3.1 Drăxlmaier — poziția Claude în dezbaterea Claude + Codex (27.09.2026)

Surse verificate de mine, nu reluate din rapoarte:
- VPS `/root/lde-worker/drax/date/ideal-v3.1/` (obs-ideal, curse-ideal, goluri-brute, decizii-v3). Probele sunt scripturi în fișier (`scratchpad/v31/claude-probe/p2–p5.mjs`, `r6.mjs`). Le-am rulat din `/tmp/dezb-claude-v31/` pe VPS, doar în citire, folosind modulul comun `/home/verif/verificator/cod/etalon-gps.mjs` (`metrici`).
- Supabase, doar citire: graficul e `lde_atribuiri_zilnice`, nu `daily_assignments` (acela e graficul interurban). Ca în v3, folosesc graficul doar pentru 01–22.09; de la 23.09 e copie automată.
- Ore: t0/t1 din obs sunt UTC. În text le dau în ora locală (+3).

Regula: km reali din GPS; cârpim doar golurile de semnal; nicio schimbare de km fără metoda comună pe zile-pereche bune; unde cifrele nu decid, rămâne cardul vechi cu steag.

---

## 1. R6 Mihăilenii Vechi: rămâne «orice poartă», 54,9 × 1. Steagul se scoate

**Poziția:** 54,9 km, 1 tură/zi, 109,8 km/zi, fără steag. NU trecem pe poarta sensului așa cum e calculată azi (58,0).

**De ce 58,0 e un artefact:**
- Poarta turului e luată din candidatele desenate în v2 și iese EST. În realitate, 18 din 23 de tururi din septembrie intră pe VEST. De aceea, pe «poarta sensului» rămân numai 5 perechi.
- Două dintre cele 5 perechi sunt cursa comasată din 12.09 (917FTI: 72,7/70,1 și 72,5/67,3). Verdictul v3 a scos-o deja: în grafic, 917FTI era pe R12 Sofia–Pelinia în ziua aceea. Deci 4 din cele 10 valori ale medianei de 58,0 vin din comasare.

**Cifrele (din `diag-r6.txt`, recalculate cu `r6.mjs`):**

| metoda | perechi | mediana |
|---|---:|---:|
| orice poartă, toate (decizia de azi) | 17 | **54,9** |
| orice poartă, fără 12.09 | 15 | 54,8 |
| poarta sensului cu turul pe **VEST** (poarta reală a turului) | 12 | **54,8** |
| poarta sensului cu turul pe EST (azi) | 5 | 57,95 |
| poarta sensului EST, fără 12.09 | 3 | 55,15 |
| doar 345KAJ / doar 917FTI fără 12.09 | 7 / 8 | 54,95 / 54,65 |

Toate metodele corecte dau între 54,65 și 54,95. Poarta sensului, odată reparată, confirmă decizia: 54,8, adică 0,1 km sub ea, în toleranță.

**Reatribuirea 345KAJ (condiția steagului v3) e confirmată de grafic.** `lde_atribuiri_zilnice` îl dă pe 345KAJ pe R6 «Mihăilenii Vechi → Ochiul Alb» în slotul 1, s1, pe 14, 15, 16, 17, 18, 21 și 22.09 (confirmat_auto / modificat_reactiv). În GPS, picioarele lui au 53,9–58,9 km. Pe R3|Recea* aveau 24–26 km, pentru că erau tăiate. Cauza steagului e reparată, iar C47 e 79 % (pe poarta sensului) și 87 % (pe orice poartă), peste pragul de 60 %.

**Ce s-ar strica dacă trecem pe 58,0:** +6,2 km/zi dintr-o mediană în care 40 % din valori vin din comasarea de pe 12.09. Linia ar fi și singura cu turul pe o poartă pe care autobuzul intră doar în 5 zile din 23.

**Corecție de lanț, pentru v3.2, nu acum:** poarta sensului se ia ca modul pe toate picioarele liniei, nu din candidatele v2. Pe R6, efectul e −0,1 km.

**Încredere:** mare.

---

## 2. R19 Copăceni: serviciu real. Se aplică 32,8 × 2 ture = 131,2 km/zi (+65,8)

**Poziția:** 725CWN face R19 Copăceni pe drumul R19. Nu face R33 pe alt drum. Cele 60 de picioare mutate sunt bine mutate, iar cele 2 ture/zi sunt reale.

**Dovezile, independente între ele:**
1. **Graficul (01–22.09).** 725CWN are **R19 «Copăceni → Grigoreuca → Sîngerei → Bilicenii» în slotul 2** în toate zilele lucrătoare din 01–22.09: s1 pe 01–18.09, s2 pe 21–22.09. Pe R33 «Ciuciueni → Iezăreni Vechi → Nicolaevca» are separat slotul 1. 830MUM e în slotul 1 pe R19.
2. **Drumul.** Picioarele mutate ale lui 725CWN au plinul 32,1–32,3 km, cu 2–5 opriri, și ating cele 4 sate R19 în ordine. Ale lui 830MUM, pe același drum, au 31,8–32,5 km. În v3, aceleași picioare stăteau pe «Vrănești*» cu 21,6–22,1 km: tăiere greșită la satul cel mai depărtat din R33, nu alt drum.
3. **Împărțirea turelor pe zi** (obs-ideal, ore locale). Pe fiecare schimb pleacă un singur autobuz spre Copăceni, iar cele două mașini își împart turele fără să se suprapună:
   - 14–18.09: s1 (05:15 / 15:53) 725CWN pe Copăceni, 830MUM pe Bilicenii; s2 (13:40 / 00:20) 830MUM pe Copăceni, 725CWN pe Iezărenii (R33).
   - 21–25.09: invers. s1 830MUM Copăceni + 725CWN Iezărenii; s2 725CWN Copăceni + 830MUM Bilicenii.
   - 01–04.09: 725CWN Copăceni pe s1, 830MUM Copăceni pe s2.
   - 07–11.09: o singură tură pe Copăceni (830MUM s1). Mediana pe zile rămâne 2.
4. **Actul.** Linia Copăceni are 1 autobuz EZ și 1 autobuz D.

**Numărare dublă:** nu există. Picioarele R33 Iezărenii ale lui 725CWN sunt pe celălalt schimb și rămân pe R33 (34,7 × 1). Picioarele R33|Bilicenii Vechi* sunt informative și nu intră în total. Linia de dinainte, «Vrănești*», era informativă (km/zi «—»), deci cei +65,8 km/zi sunt serviciu care lipsea din v3, nu km adăugați de două ori.

**De reținut:** regula satelor în ordine a mutat și 4 picioare fără schimb, cu plin 145–155 km (12, 14 și 15.05, 04.09). Sunt în afara ferestrelor FER, deci nu intră în etalon. Ele arată însă că regula mută și picioare absurde. Cer o gardă: nu se mută piciorul cu plin > 2 × kmRT/2 al liniei.

**Ce s-ar strica dacă n-o aplicăm:** R19 Copăceni ar rămâne la 1 tură/zi, deși graficul și GPS-ul arată două mașini pe două schimburi. Asta înseamnă −65,8 km/zi de serviciu real lipsă.

**Încredere:** mare (graficul, drumul și orele spun același lucru).

---

## 3. Golurile de la marginea cursei: NU le cârpim în v3.1. Nici «prelungirea de la poartă» nu e metoda bună

**Poziția:** în v3.1 nu cârpim nimic la margine. Nu se schimbă niciun card, iar «prelungirea de la poartă» ar adăuga km care nu sunt gol de semnal pe partea cu oameni.

**Cifrele (`p3.mjs`, `p5.mjs`):**
- Există 302 goluri de margine: 237 ≤ 2 h, 65 > 2 h, 2.591 km pe dreaptă. Doar 130 ating un picior cu rută și schimb, **29 în septembrie** (891 km pe dreaptă).
- Pe linii sunt cel mult 6 în septembrie: R36 6, R24 6, restul 0–2.
- **Proba de sensibilitate:** am scos din populație toate cele 196 de observații lipite de un gol de margine. Niciun etalon nu se schimbă, cu o excepție: Catranic trece de la 29,2 la 29,3. Pe 10 linii scade doar numărul perechilor (câte 1–4). Deci cârpirea lor nu poate muta niciun card cu mai mult de 0,1 km.

**Prelungirea de la poartă e greșită ca metodă.** Mostrele arată trei cazuri:
- **Golul e înainte ca autobuzul să iasă din poartă** (retur «din poartă», golul la început), de exemplu 727CWN 06.05, 710CWN 07.05, 388ASB 12.05. Km-ii aceia sunt drumul spre poartă sau parcarea. Nu sunt parte cu oameni.
- **Golul e după ultimul sat** (retur, golul la sfârșit, 7–48 min), de exemplu 710CWN, 731ARF și 917FTI pe 12.05 la 22:41. Plinul e deja întreg (retur 53,4 din 58,1 km), așa că golul e pe partea goală.
- **Pana de server de pe 09.09, 04:58–05:13**, a lovit simultan 388ASB, 917FTI și 302YEK, cu 3–6,5 km. E singurul gol de semnal adevărat. Tăietorul `curse.mjs` a făcut din el graniță de cursă. Remediul corect e în `curse.mjs`: cursa nu se taie la un gol ≤ 2 h cu ambele capete în afara porții și cu viteză plauzibilă. Golul rămâne atunci în cursă, iar cârpirea existentă îl tratează ca pe celelalte 1.335.

Golurile > 2 h (65) și cele din afara curselor (100) nu sunt de semnal în sensul regulii lui Ion și nu se cârpesc niciodată.

**Ce s-ar strica dacă prelungim acum de la poartă:** am pune km pe dreaptă sau prin Valhalla peste parcare și drumul gol, iar la 65 dintre goluri, peste ore întregi de tracker oprit. Nu s-ar câștiga nimic pe carduri. Singurul efect ar fi mai mulți km cârpiți pe observații.

**Încredere:** mare pe «nu acum» (proba de sensibilitate e directă). Medie pe forma exactă a regulii din `curse.mjs` pentru v3.2.

---

## 4. Picioarele cu steag de cârpire (> 30 %) și cele cu capătul atins doar pe drumul cârpit: DA, le scoatem din etalon

**Poziția:** le scoatem din **populația etalonului** (perechile bune și C47). Le păstrăm la observații, la ture/zi și la atribuire (serviciul a avut loc). O pereche e «bună» doar dacă ambele picioare sunt măsurate în cea mai mare parte pe puncte GPS reale și au atins capătul pe un punct real. Cârpirea completează km, dar nu poate dovedi drumul. Un capăt «atins» doar pe traseul desenat de Valhalla nu e dovadă că autobuzul a fost acolo.

**Cifrele (`p4.mjs`, metrici din etalon-gps v5):**
- Sunt 64 de picioare cu steag, 96 cu capătul atins doar pe cârpit, 133 în reuniune.
- **Singurul card care se schimbă e R24 Catranic: 29,2 → 29,3.** Fără aceste picioare, septembrie cade sub 3 perechi bune (tracker 2302), iar regula de rezervă ia toată fereastra, cu 39 de zile. E exact metoda și valoarea din verdictul v3 (29,3, 41 de zile). Garda de similaritate trebuie confirmată la rularea lanțului. Dacă o respinge, rămâne 29,2, cu o diferență de 0,2 km/zi.
- R36 are card vechi (vezi punctul 5), iar Costești, Cuhnești și celelalte linii nu se schimbă.
- Efectul pe flotă: **+0,2 km/zi** (5.819,0 → 5.819,2).

**De ce contează, deși efectul e mic:** în v3.1, Catranic a trecut de pe regula de rezervă (v3) pe «sept, 15 perechi» doar pentru că picioarele cârpite au devenit «bune». Cârpirea a creat perechi pe care GPS-ul real nu le avea. Asta contrazice regula «km reali, cârpirea doar a golurilor». Lăsată așa, orice tracker stricat (224BZP are 40 de curse > 30 % cârpite) își poate fabrica singur etalonul la rularea următoare.

**De adăugat în v3.1 (gardă, nu schimbare de km):** regula satelor în ordine nu mută un picior pe o altă linie dacă satele în ordine sunt atinse doar pe drum cârpit (`capatCarpit` sau apropieri `carpit`).

**Încredere:** mare pe principiu și pe efect.

---

## 5. R36 Bocancea Schit: redeschidem și închidem. Steagul se scoate, card 53,5 × 1

**Poziția (îmi retrag cifra din v3):** cei 46,2 km susținuți de mine în v3 erau urma ruptă a trackerului lui 224BZP, nu un drum scurt. Drumul real are ~54 km pe ambele sensuri și pe ambele schimburi, deci excesul pe care îl bănuiam nu există. Aplicăm metoda comună cu filtrul de la punctul 4 și scoatem steagul.

**Dovada care nu depinde de cârpire** (septembrie, 224BZP): picioarele cu cel mult 2 km cârpiți au, în ordine, **54,4 · 55,1 · 54,3 · 53,3 · 53,3 · 54,0 · 54,5 · 53,5**, cu mediana **54,15**. Sunt tururi de dimineață (08.09 la 09:04, 0 km cârpiți), retururi de noapte (00:28) și retururi de după-amiază. Drumul lung nu e «8 din 9 retururi de noapte», cum credeam în v3. E drumul liniei.

| variantă (`metrici`) | perechi | poarta sensului | orice poartă |
|---|---:|---:|---:|
| v3.1 azi (cu cârpirea, toate picioarele) | 13 | 54,0 | 54,0 |
| fără steag + capăt cârpit (regula de la pct. 4) | 5 | **53,5** | 53,8 |
| doar picioarele necârpite (≤ 2 km), pe picior | 8 picioare | 54,15 | — |
| card vechi | — | 54,5 | — |

Toate valorile sunt în ±1 km (2 %) de card, adică mult sub toleranța C47 (±5,4 km). Dezacordul din v3 (46,2 contra 54,5, 15 %) e închis: are dreptate cardul lui Codex, pe ordinul de mărime.

**Ce card:** 53,5, adică metoda comună pe perechile bune, cu aceeași definiție de pereche bună ca la toată flota (pct. 4). Nu 54,0: acela include 8 perechi în care un picior e cârpit peste 30 %. Km/zi: 107,0 (−2,0).

**Condiție:** dacă punctul 4 NU se adoptă, R36 ia 54,0 (13 perechi), tot fără steag. Nu păstrăm 54,5 cu steag: steagul a apărut din dezacordul 46/54, iar dezacordul nu mai există.

**Ce s-ar strica altfel:** un steag «diagnostic cerut» pe o linie a cărei întrebare are acum răspuns trimite dispecerul să caute un exces care nu există.

**Încredere:** mare că drumul are ~54 și că steagul se scoate. Medie pe zecimală (53,5 / 54,0 / 54,5 sunt la fel de apărabile pe km reali, diferența e de 1–2 km/zi pe flotă).

---

## Ce se aplică în v3.1 acum / ce așteaptă

| # | linie / regulă | acum în v3.1 | km/zi linie | Δ față de v3.1 de azi (5.819,0) | așteaptă (v3.2 / lanț) |
|---|---|---|---:|---:|---|
| 1 | R6 Mihăilenii Vechi | orice poartă **54,9 × 1**, steag scos | 109,8 | 0 | poarta sensului din modulul tuturor picioarelor (→ 54,8), nu din candidatele v2 |
| 2 | R19 Copăceni | **32,8 × 2** (725CWN + 830MUM), picioarele mutate rămân | 131,2 | 0 (deja inclus; +65,8 față de v3) | garda: nu se mută piciorul cu plin absurd (145–155 km, fără schimb) |
| 3 | goluri de margine | **nu se cârpesc** (0 efect pe carduri, probat) | — | 0 | `curse.mjs`: nu tăia cursa la golul ≤ 2 h cu capete în afara porții (pana din 09.09) |
| 4 | steag cârpire > 30 % + capăt doar pe cârpit | **scoase din etalon** (rămân la observații / ture) | Catranic 58,6 | +0,2 | garda Catranic la rulare; regula satelor în ordine să nu mute pe capăt cârpit |
| 5 | R36 Bocancea Schit | **53,5 × 1**, steag scos | 107,0 | −2,0 | — (54,0 dacă pct. 4 nu trece) |
| | **flota** | | | **5.819,0 → 5.817,2 km/zi** | față de v3 (5.754,0): +63,2 |

Deciziile de trecut în `decizii-v3.json` (doar metode și valori așteptate):
- R6 rămâne `orice-poarta` 54,9 / 1 / 109,8, fără steag.
- R24 are valoarea așteptată 29,3 / 1 / 58,6, prin regula de rezervă.
- R36 trece de pe `card-vechi` pe `poarta-sensului` cu filtrul de la pct. 4: așteptat 53,5 / 1 / 107,0, fără steag.
- Filtrul de la pct. 4 se aplică în modulul comun `etalon-gps.mjs` (verificatorul și `card-gps.mjs` citesc aceeași populație). Nu se pune ca excepție pe linie.

Notă: scripturile de probă au rămas pe VPS în `/tmp/dezb-claude-v31/` (p2–p5.mjs, doar citire). Hook-ul local blochează `rm -rf`, deci trebuie șterse de mână.
