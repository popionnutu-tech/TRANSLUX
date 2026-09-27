# ION-110 ideal-v4.1, runda 2: partea Claude (logica de business)

Autor: business-logic-auditor, 27.09.2026. Regulile: fișierul `reguli-drax-62eace0d.txt` (am verificat md5 62eace0d… și 25.072 de
caractere). Nu am scris nimic în bază și n-am rulat `saptamanal.sh --write`.

Simularea săptămânii 14.09 pe v4.1 am făcut-o pe o copie, pe VPS, în `/tmp/p110b2-sim/2026-09-14`:
- în copie au intrat doar urmele și intrările înghețate ale săptămânii;
- comanda: `DRAX_BAZA=/tmp/p110b2-sim DRAX_REF_SRC=…/ideal-v4.1 DRAX_PLAN_SCHIMB=0 saptamanal.sh 2026-09-14`, fără `--write`;
- ieșirea arată «(fără --write, nimic scris în bază)».

Comparația am făcut-o cu rândul real `date/saptamanal/2026-09-14`, calculat pe v3.1. Scripturile sunt în `scratchpad/p110/b2-*.{sh,mjs}`.

---

## (A) v4.1 e gata de activare? **DA, cu o condiție (M-a) și poarta verificatorului**

### Constatările mele din runda 1 pe v4.1

| r1 | stare | dovada |
|---|---|---|
| **H1**: regulile contrazic capetele din GPS | **închis** | Migrația 412, §4.1: «Excepție (Ion, 27.09.2026, ION-110) … R37 Musteața → capăt Năvîrneț, R28 Cuhnești → capăt Balatina … Nu fac capăt: drumul de acasă … și orașele din §5.1». §4.7 scoate Balatina și Năvîrneț din lista satelor fără opriri. |
| **H2**: săptămânalul taie la capătul vechi | **închis** | `etichete.mjs:14,33` citește `capete-gps.json` din instantaneul săptămânii. `saptamanal.sh:48-63` îl leagă doar când instantaneul e nou (`SNAP_NOU`), deci o săptămână veche nu primește capete. În simulare, `capete-gps.json` a intrat în instantaneu lângă un `schelet-ideal` cu sha nou (`13f82018…`). |
| **H2, cazul concret** | **închis** | Pe 925FTI, bucata de seară «de la ultima cursă la locul nopții» pleca din **Musteața (47,509 / 27,646) și avea 41,8–43,8 km** în v3.1. În simulare pleacă din **Năvîrneț (47,588 / 27,565) și are 25,3 km**, în fiecare seară 14–18.09. Cuvântul «Musteața» apare de 22 de ori în `analiza.json` pe v3.1 (inclusiv «capătul Musteața (R37)») și de 0 ori pe v4.1. «Năvîrneț» și «Balatina» apar de câte 25 de ori. |
| **M1**: drumul R28 era cel vechi | **închis** | R28: capăt Balatina, km 75,0, etalon 76,8, drum 75,0 km (−2,3 % față de etalon), 699 de puncte, pornește din 47,692 / 27,345. R37: drum 61,9 față de etalon 61,5 (+0,6 %). |
| **M2**: linia falsă «Rediul de Jos\*» | **închis în etalon, deschis în săptămânal** (vezi M-a) | Scheletul v4.1 nu mai are nicio linie «Rediul\*». `obs-ideal` v4.1 ține pe R37\|Musteata 3 curse care ating doar startul din act, cu `capatAct: true` și `exclusEtalon`: 351KAJ 05.05 tur și retur, 925FTI 09.09 tur. |

### Ce se schimbă în săptămâna 14.09 (v3.1 → v4.1, pe copie)

**Etichetele.** 927 de curse etichetate în v3.1, 928 în v4.1.
- Singura diferență pe toată săptămâna: 925FTI, 18.09, 12:09–14:30, **tur s2 pe R37**, 88,0 km, din care 26,3 gol casă → Năvîrneț
  și 61,6 plin.
- Traseul acelei curse: Năvîrneț 13:25 (344 s), Musteața 13:53, poarta VEST 14:30.
- În v3.1 cursa **nu era etichetată deloc**, iar ziua avea «golTure 147,5». Pe v4.1 ziua are perechea completă și devine zi
  măsurată (146 → 147 din 189).
- Toate celelalte 927 de curse au aceeași rută, linie, sens, schimb și km.

**Categoriile.** Se schimbă doar la 925FTI și 760BXI:

| mașina | cu oameni | livrare | alte categorii |
|---|---|---|---|
| 925FTI | +211,1 | −137,8 | golTure −147,5, legătură +74,4 |
| 760BXI | +88,1 | −61,9 | legătură −26,0 |

**Regula B pe cele două mașini** (măsurat):
- 925FTI: R1a 258,4 → 243,0, R1b 380,1 → 372,9, B 638,5 → 615,9.
- 760BXI: R1a 230,5 → 184,3, R1b 161,9 → 146,2, B 392,4 → 330,5.

**Flota.** Carduri B 9.021 → 8.777. Cardul GPS pe flotă 5.819 → 5.872 km/zi (+53). Diferența se explică exact:
(75,0 − 65,5) × 2 = 19,0 pe R28, plus (60,2 − 43,5) × 2 = 33,4 pe R37, adică 52,4.

**Concluzie.** Comasarea nu pierde nicio cursă bună: zilele bune R37 sunt 7, iar a 8-a (925FTI 09.09) e scoasă, nu inventată. Pe
14.09, v4.1 recuperează o cursă cu oameni pe care v3.1 o pierduse. Pe copie, nimic altceva nu s-a schimbat.

### Ce trebuie știut înainte de activare
- **Exportul LDE e închis de poarta verificatorului.** `export-lde.mjs … ideal-v4.1` a ieșit cu codul 3, «verdictul 2026-09-27T15:14:11Z
  are 5 blocante (C31, G1)», rularea `drax-v8-1790522048`, `valid_pentru_export false`. Hotărăște verificatorul, nu e subiect de
  business.
- **Pe partea mea, exportul e corect.** Scriptul ia `capat` = «Năvîrneț» / «Balatina» și `nr` = numele din act («Musteata» /
  «Cuhnesti»), ceea ce corespunde cu §4.1 («linia își păstrează numele din act»). `hartaAbatere`: R28 0 %, R37 +2,8 %.
- **Două linii au drumul desenat peste ±5 %**: R24 Catranîc −6,2 % și R33 Bilicenii Vechi\* +6,3 %. Nu vin din v4.1: sunt identice
  în v3.1. Le trec ca informativ, fără deducere.

## (B) «Capătul prin parcare»: **DA, doar ca listă de diagnostic**, cu două câmpuri în plus

Sunt de acord: fără excludere automată și cu cazul de control «plecare legitimă din capăt, cu trackerul pornit târziu» (Codex C1). Pe
fiecare rând al listei trebuie să apară și:
1. distanța până la **locul nopții** (§7.1). Dacă parcarea e casa șoferului, e cazul «drumul de acasă nu face capăt» din §4.1, nu o
   parcare la capăt.
2. mașina din grafic. Zarojeni 52 % e la 348KAJ, iar casa lui 348KAJ tot nu e măsurată (R18, D).

## (C) Mașinile care dorm în Bălți

### C.1 Bucata R1a care atinge poarta în fereastră → «probabil nedetectată»: **DA pe principiu, NU în forma scrisă** (M-c)
- **Cu §8.6 se potrivește ca intenție, dar nu ca text.** §8.6 spune «zilele cu o cursă fără pereche nicăieri», iar §8.1 spune «se
  măsoară doar pe zilele fără cursă probabil nedetectată». Excluderea e deci **pe zi**, nu pe bucată. Propunerea scrie «iese din R1a»,
  adică pe bucată. Dacă ziua rămâne măsurată, R1b și R3 din aceeași zi se calculează în jurul unei curse care lipsește (la 744ARF,
  «ocolul» și «gol între ture» sunt tocmai în jurul turului R13). Ca să fie consecventă cu restul, bucata **scoate ziua** din
  măsurare, la fel ca 744ARF 14 și 18.09 azi.
- **Declanșatorul nou trebuie scris în §8.6** (migrația 413): «sau o bucată de livrare cu oprire ≥ 1 min în raza porții, într-o
  fereastră §3.2 și în sensul ferestrei, sosită din afara zonei de 3 km». Altfel workerul face ceva ce textul nu spune: e aceeași
  clasă de defect ca H1 din runda 1.
- **Cifra de 429 km nu stă în picioare.**
  - 351,2 km din ea sunt ai lui **024XKY**. Casa lui e la **35 km** de poartă, deci nu doarme în Bălți.
  - Bucățile lui sunt drumurile de 155–195 km spre Drochia, pe care **§11.8 le numește textual** «de lămurit — posibilă cursă a firmei».
  - `de-lamurit.json` le scoate deja din R1a/R1b în luni–joi (`scrie-analiza.mjs:24-28,48-51`).
  - Dacă ar fi marcate §8.6, eticheta s-ar schimba din «posibilă cursă a firmei» (întrebarea F4 pentru Ion) în «cursă Drăxlmaier
    nedetectată», iar asta contrazice §11.8.
  - Regula de precedență necesară: ce e deja în `de-lamurit.json` rămâne §11.8.
  - Rămân 78,0 km pe zilele măsurate, toți la 744ARF (15 și 17.09, turul R13 cu opriri la Hăsnășenii Noi, dovedit de analist).
- **Efectul pe 744ARF.** Cu excluderea pe zi, 744ARF are o singură zi măsurată din 5, deci iese din pragul §12.2 (≥ 3 zile). E
  cinstit; trebuie scris ca efect așteptat, nu descoperit după.

### C.2 Bloc informativ «Dorm în Bălți» pe pagină: **DA, dar nu în «Ce faci»** (L-d)
- **În afara «Ce faci», blocul e compatibil cu §12.1.** §12.1 spune «R1a … nu intră în indicații; se vede pe pagină».
- **În «Ce faci», nu e.** Pe pagină, «Ce faci» chiar sunt indicațiile:
  - `CeFaciDrax.tsx` redă `IndicatieMasinaDrax`;
  - `drax-ce-faci-text.ts:9` interzice termenii tehnici;
  - `scrie-analiza.mjs:152-157` are invariantul «bucățile explică R1b și R3».
  Un bloc R1a pus înăuntru amestecă cost de azi cu dispoziții.
- **Unde îl pun:** o secțiune alăturată, de exemplu «Ce nu se taie cu o dispoziție», cu câmpul lui în `analiza.json` (nu în
  `indicatii`, nu în `top`). Mesajul pentru dispecer și cel pentru Alexei rămân neatinse. Am verificat: `api/cron/drax-optimizari/route.ts`
  nu citește R1a.
- **Textul e corect.** «Se taie doar cu alt șofer din sat sau mașina doarme la capăt» e §8.2, cuvânt cu cuvânt.
- **O neconcordanță mică:** «nemăsuratele cu km pe zilele măsurate» se bate cap în cap cu §10.3 («nemăsurat» = nicio zi măsurată).
  804MUM, cu casa la 2,7 km, n-are nicio zi măsurată, deci nu are ce afișa. Formularea corectă: «mașinile cu 1–2 zile măsurate:
  km-ii acelor zile, fără extrapolare».

### C.3 Întrebarea c2 rămâne pentru Ion: **DA**
Cifrele trebuie recalculate **după** C.1, pentru că 744ARF își schimbă zilele măsurate. Trebuie scrise și ca «Σ pe zilele măsurate»,
nu ca «km/săpt.»: 882 e suma pe 4 mașini cu 2–5 zile măsurate, nu o săptămână.

## (D) Steagurile: **confirm pe toate**
- Rămân steag: Bocancea, Zarojeni, Sturzovca, Nihoreni, Florești, Trifănești, R18 (casa lui 348KAJ nemăsurată) și R32 (drumul
  casă ↔ capăt, Scăieni / Izvoare).
- Niciunul nu atinge R28 sau R37, deci niciunul nu blochează v4.1.

---

## Constatări cu deducere

**M-a (medium, −1): în analiza săptămânală, comasarea M2 lipsește.**
- `etichete.mjs:33` înlocuiește doar startul (`CAPETE_GPS[…] ?? l.start`). Fallback-ul `startAct` pe care `etalon.mjs` v4.1 îl are la
  `:54-56,94,151` lipsește (grep: niciun `startAct` în `etichete.mjs`).
- Scenariul: săptămâna în care 925FTI face un tur ca pe 09.09 (atinge Musteața, nu atinge Năvîrneț, 75,2 km). Pe v3.1 cursa intra pe
  R37. Pe v4.1 nu mai are identitate R37. 925FTI nu e în graficul R37 (`grafic: false`), deci nu primește nici linia «\*».
- Rezultatul: cursa rămâne neetichetată, exact ca 18.09 pe v3.1 (golTure 147,5, zi pierdută). Km-ii ei, cu oameni, trec la
  livrare/golTure și umflă R1a/R1b ai lui 925FTI, sau scot ziua din măsurare.
- Frecvența: 1 din 17 tururi în septembrie, 3 curse pe toată fereastra. E o regresie față de v3.1, pe o frecvență mică.
- De făcut înainte de activare: aceleași trei linii ca în `etalon.mjs` (păstrezi `startAct`; `lin = { ...s, capat: s.startAct,
  scurta: true }`), iar cursa rămâne pe linie, marcată scurtă.

**L-b (low, −0,5): `capete-gps.json` descrie o regulă și motive vechi.**
- `regula` descrie tot P1 («opriri scurte < 15 min… ≥ 50 %… ambele săptămâni»), nu §4.1 din migrația 412 (§4.5, ambele sensuri, mai
  multe mașini, fără drumul de acasă și fără orașele §5.1).
- `steaguri.R32` spune «asimetric» în loc de «drumul de acasă».
- Fișierul intră acum în instantaneul fiecărei săptămâni, ca document al capetelor. Textul trebuie aliniat la §4.1; datele
  (`linii`) rămân cum sunt.

**M-c (medium, −1): C.1, așa cum e scris.** Are trei probleme:
- scoate bucata, nu ziua, ceea ce contrazice §8.1 și §8.6;
- nu cere textul nou în §8.6;
- ia 024XKY peste §11.8, iar cifra de 429 km e în realitate 78.

Scenariul: C.1 implementat cum e scris → 024XKY 15 și 17.09 primesc «cursă nedetectată», iar întrebarea F4 despre Drochia dispare de pe
pagină. La 744ARF, R1b și R3 rămân calculate pe zile în care lipsește turul R13.

**L-d (low, −0,5): C.2 e pus în «Ce faci»**, adică în secțiunea de indicații de pe pagină (vezi C.2). Se mută alături.

## Scor

10 − (1 + 0,5 + 1 + 0,5) = **7,0 / 10**

**v4.1 e corect pe business:**
- H1, H2, M1 închise;
- efectul pe 14.09 verificat pe copie: 925FTI fără «Musteața → acasă 42 km», o cursă recuperată, nimic altceva schimbat.

**Condiții de activare:**
- M-a (trei linii în `etichete.mjs`);
- poarta verificatorului.

**C trece după corecturile din M-c și L-d.** Cu M-a închis și C corectat, estimez ≥ 9.
