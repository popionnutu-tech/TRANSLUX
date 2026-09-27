# Drăxlmaier ideal-v4 — dezbaterea Claude + Codex, runda 2 (ION-110, 27.09.2026)

Runda 1: Claude 1,5 (business 1,5 · analist 3,0 · verificator 6,0), Codex 5,5; triajul: `triaj-r1.md` (în același dosar).
Regulile: migrația 412 aplicată (§4.1 capătul din GPS, §4.7) — text 25.072 caractere, md5 62eace0d0dd8f37e678a27ef639f5c0e,
reguli_livrare_la 2026-09-27T15:00:05Z; fișierul integral pentru verificator:
`/private/tmp/claude-501/-Users-ionpop-Desktop-TRANSLUX/b0a7893e-64d6-4ccc-8455-63a68a04da1b/scratchpad/p110/reguli-drax-62eace0d.txt`.

## Ce s-a schimbat după runda 1

### Candidatul nou: ideal-v4.1 (VPS `/root/lde-worker/drax/date/ideal-v4.1/`, cod `/root/lde-worker/drax/cod/ideal-v4.1/`)
Sigilat cu GATA (schelet-ideal.json sha bfa070f0…), reproductibil (două rulări, aceleași sha pe 24 de fișiere). Față de v4:
1. **Cache-ul candidatelor** (verificator H1, Codex DA): 25 de intrări `cand`/`incercate` ale R28|Cuhnesti, R37|Musteata,
   R37|Rediul de Jos* scoase din `schelet-cand.json`; liniile s-au redesenat de la capetele noi (16 candidate).
2. **Comasarea «Rediul de Jos*»** (business a4, Codex a4): `etalon.mjs` ține la liniile cu capăt din GPS și startul din act
   (`startAct`); cursa care atinge doar startul din act rămâne pe linia ei, cu `exclusEtalon = 'cursă scurtă…'` și `capatAct: true`
   (în afara etalonului și a cardului GPS, fără km inventați). Linia «*» nu mai apare.

| linie | v3.1 | v4.1 |
|---|---|---|
| R28 Cuhnești | capăt Cuhnești · 65,5 km · etalon 66,9 · drum 65,5 · s1 67,9/69,3 · s2 65,5/66,8 | capăt **Balatina** · 75,0 km · etalon 76,8 · drum 75,0 · s1 77,9/79,8 · s2 74,9/74,3 |
| R37 Musteața | capăt Musteața · 43,5 km · etalon 44,6 · drum 44,5 · s1 44,2/44,9 · s2 44,1/45,6 | capăt **Năvîrneț** · 60,2 km · etalon 61,5 · drum 61,9 · s1 61,0/61,7 · s2 61,9/63,9 |
| R37 Rediul de Jos* | — | — (comasată) |
| celelalte 46 de linii cu ideal | — | identice |
| card GPS flotă | 5.819 km/zi | 5.872 km/zi |

### Analiza săptămânală (business H2, Codex: condiție de activare) — FĂCUT pe VPS, efect zero până la activare
`/root/lde-worker/drax/cod/economie/etichete.mjs:13-14,33` citește `${D}/capete-gps.json` din instantaneul săptămânii (dacă există;
altfel ca înainte); `/root/lde-worker/drax/cod/saptamanal/saptamanal.sh:48-63` adaugă `capete-gps.json` în instantaneu DOAR când
instantaneul se face în aceeași rulare cu scheletul (o săptămână veche nu primește capete fără scheletul lor). Copii `.bak-ion110`.
La activare, săptămâna 14.09 își arhivează instantaneul vechi (ca la ION-107) și se rescrie pe v4.1.

## Subiectele rundei 2
(A) **v4.1 e gata de activare?** Verifică: R28/R37 fără rămășițe ale tăieturii vechi; comasarea nu pierde curse bune; nimic altceva
schimbat; exportul LDE (`export-lde.mjs`) pe v4.1.
(B) **«Capătul prin parcare»** (verificator H4; Codex C1 high împotriva excluderii automate) — propunere: DOAR listă de diagnostic în
raportul scheletului (Zarojeni 52 % 348KAJ, Dominteni 45 % 710CWN, Prajila 27 % 763LYY, Sturzovca 15 % 727CWN), fără excludere, cu
cazul de control «plecare legitimă din capăt cu tracker pornit târziu». De acord?
(C) **Mașinile care dorm în Bălți** — propunere care NU schimbă §12.1 (textul spune: «R1a … nu intră în indicații; se vede pe pagină»):
  1. în worker, bucata R1a care atinge o poartă într-o fereastră de tur/retur (§3.2) se marchează «cursă probabil nedetectată» (§8.6)
     și iese din R1a (analist: 19 bucăți pe flotă, 1.150 km; pe zilele măsurate 429 km: 024XKY 351, 744ARF 78);
  2. pe pagină, în «Ce faci», un bloc informativ, nu indicație: «Dorm în Bălți, departe de capătul liniei — drumul casă ↔ capăt nu se
     taie cu o dispoziție (se taie doar cu alt șofer din sat sau mașina doarme la capăt)», pe mașină doar km/săpt. (R1a rămas după
     pasul 1), fără lei; condiții: casa ≤ 3 km de o poartă, capătul > 15 km, R1a ≥ 100 km/săpt.; nemăsuratele cu km pe zilele măsurate;
  3. întrebarea c2 (casa ≤ 3 km = lângă uzină, ca parcul) rămâne pentru Ion, cu cifrele: R1a măsurat 882 km/săpt. azi → 187 cu DA.
  De acord cu 1–3? Ce lipsește?
(D) Ce rămâne pe steag (Bocancea, Zarojeni, Sturzovca, Nihoreni, Florești, Trifănești; R18 casa 348KAJ; R32) — confirmați.

Scor după rubrica comună; high doar cu scenariu + dovadă.


## Răspunsurile părții Claude (runda 2) — scoruri: business 7,0 · uzina-analist 3,5 (pe subiectul C) · schelet-verificator 7,5 (v8 = ideal-v4.1) → Claude = 3,5


---
### r2-business.md

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


---
### r2-analist.md

# ideal-v4, runda 2 — uzina-analist («cercetează»), subiectul (C): Bălți

Autor: uzina-analist, 27.09.2026. Am citit `runda-2.md` (C, rândurile 38–44), `triaj-r1.md` și `reguli-drax-62eace0d.txt`
(md5 62eace0d…, 26.804 octeți, după migrația 412). Nu am scris în bază și nu am schimbat nimic pe VPS.

Săptămâna 14–18.09, `/root/lde-worker/drax/date/saptamanal/2026-09-14/` (`economie-zile.json` rulat 2026-09-27T13:59:38Z,
`economie.json`, `economie-curse.json` = mișcările brute cu satele atinse `apr`, `economie-urme/`).
Scripturile sunt în `scratchpad/p110/`:
- `an-r2.mjs`: atingerile pe puncte și opriri, variantele V0–V5 și blocul Bălți. Ieșirea în `r2-out.txt`.
- `an-r2c.mjs`: criteriul pe mișcări, variantele M1–M4. Ieșirea în `r2-miscari-out.txt`.

**Corectez o cifră din runda 1.** Cifrele din `runda-2.md:40` («19 bucăți, 1.150 km; pe zilele măsurate 429 km: 024XKY 351,
744ARF 78») au fost date de mine în runda 1. Criteriul de atunci era «oprire ≥ 1 min în raza porții, în fereastră». Criteriul acesta
are alarme false: cei 351 km de la 024XKY sunt toți falși. În plus, scapă o zi măsurată a lui 744ARF. Detaliile sunt mai jos.

---

## 1. Criteriul (1) pe TOATĂ flota

### Ce prinde varianta scrisă în runda 2 (V0 = oprire ≥ 1 min la poartă, în fereastră, oriunde în bucată)
Pe flotă prinde 19 bucăți și 1.150,2 km. Pe zilele măsurate prinde 4 bucăți și 429,2 km. Le-am verificat pe toate, una câte una:

| clasa | bucăți | km | exemple |
|---|---|---|---|
| **cursă reală nedetectată** | 13 | 773,0 | 804MUM retur s2 5/5 nopți, 16.09 tur s1 + tur s2; 744ARF tur s1 R13 (14, 15, 17, 18.09), 14.09 seara; 144BRAZ retur s2 R38 (17, 18.09) |
| **alarmă falsă: coada cursei vecine** | 5 | 355,9 | **024XKY 15 și 17.09 (351,2 km măsurați)**: bucata de seară începe la 06:04–06:07, chiar la sosirea turului s1 detectat. «Atingerea» e mutarea EST ↔ VEST 06:09–06:17 (4 km), apoi 06:18–06:49 prin Slobozia. 144BRAZ 16.09 (4,7 km): oprirea de la 00:00 e începutul returului s2 detectat. 727CWN 14.09 și 830MUM 15.09: 0 km |
| **nelămurit** | 1 | 21,3 | 414ASB 15.09: 1,4 min la EST la 23:47, fără nicio mișcare cu sate |
| **ratată** | 1 | 78,8 (măsurată) | 744ARF 16.09: are aceeași mișcare R13 (05:15 → poartă 06:05, 23,4 km, Dobrogea Veche și Hăsnășenii Noi), dar stă în raza porții doar 0,7 min |

Alarme false pe zilele măsurate: **351,2 din 429,2 km (82 %)**.

### Mașini care trec pe lângă poartă spre casă, fără cursă
- 744ARF, în serile de 15, 16 și 17.09: după returul s2 detectat (Bilicenii Vechi la 00:36), drumul spre casă trece pe la poartă
  la ~01:00. Oprirea din rază ține 1,6–2,0 min și cade în fereastra retur s2 (până la 01:45). Mișcarea are 6–7 km și nu atinge niciun sat.
- 804MUM, 14–18.09, la 17:0x–17:2x (fereastra retur s1): trece la 1,6 km de EST, pe drumul spre casă. Mișcarea are 11 km și nu atinge niciun sat.
- Un prag de oprire ≥ 2 min NU le separă: 744ARF stă exact 2,0 min pe 15 și 17.09. Cursele adevărate stau 3,6–8,3 min.

### Condițiile care lipsesc (varianta M4, pe mișcări, din `economie-curse.json`)
1. **Atingerea e în interiorul bucății**, la cel puțin 5 min de marginile ei. Asta scoate coada cursei detectate de lângă
   (024XKY, 144BRAZ 16.09, 727CWN, 830MUM).
2. **Sensul corect.** În fereastra de tur, mișcarea SOSEȘTE la poartă. În fereastra de retur, mișcarea PLEACĂ de la poartă.
3. **Mișcarea iese din Bălți:** atinge cel puțin un sat (≤ 0,8 km, fără cartierele Bălțiului: Slobozia, Dacia, Pământeni,
   Autogara), aflat la ≥ 5 km de porți. Asta scoate drumurile spre casă pe lângă poartă (744ARF la 01:00, 804MUM la 17:0x).
4. Opțional, ca etichetă: satul atins e al unei linii din act. Toate cazurile adevărate sunt așa: Hăsnășenii Noi (R13),
   Țiplești/Țipletești (R22/R18), Glinjeni și Mărăndeni (R38). Pagina poate scrie «cursă probabil nedetectată pe linia X».

Pragul de oprire (≥ 1 sau ≥ 2 min) nu mai e nevoie să decidă nimic: condițiile 1–3 separă singure.

### Rezultatul cu condițiile 1–3 (M4)
- **14 bucăți, 851,8 km pe flotă. Pe zilele măsurate: 3 bucăți, 156,8 km** (744ARF 15, 16, 17.09).
- Mașinile prinse sunt 144BRAZ (2 bucăți / 104,0 km), 744ARF (6 / 315,4) și 804MUM (6 / 432,4). **Toate trei sunt din grupa Bălți.**
- În afara grupei Bălți, pe toată flota: 0 bucăți.
- Alarme false: 0 (am citit fiecare mișcare cu satele ei). Ratări față de V0: niciuna. M4 prinde în plus 744ARF 16.09.

---

## 2. Blocul (2) — cine intră și cu ce km, după (1) corectat (M4)

Condițiile din `runda-2.md:43`: casa ≤ 3 km de o poartă, capătul > 15 km, R1a ≥ 100 km/săpt., iar nemăsuratele cu km pe zilele măsurate.

| mașină | zile măsurate | R1a după (1), dacă iese doar BUCATA | dacă iese ZIUA (§8.6) | distanța casă → capăt | în bloc? |
|---|---|---|---|---|---|
| 435ASB | 4/5 | 292,5 → extrapolat 366 | la fel | R34: 25,7 km în linie dreaptă / 36,0 km pe șosea | **da** |
| 186OMM | 5/5 | 281,7 → 282 | la fel | R4 Grinăuți: **13,9 km în linie dreaptă de la casă** (15,6 de la poartă, 16,7 pe șosea); R3: 30,6 km | **depinde de citirea «capătul > 15 km»** |
| 144BRAZ | 2/5 (nemăsurată) | 128,7 pe 2 zile (extrapolat 322) | la fel (zilele 17 și 18 erau deja excluse) | R38: 20,4 km în linie dreaptă | da, ca nemăsurată |
| 744ARF | 3/5 | **22,6** (doar serile de 7,5 km) → 38/săpt. < 100 | **0 zile măsurate** | R19: 18,8; R13: 7,5 km în linie dreaptă | **NU apare** |
| 804MUM | 0/5 | — | — | R22: 20,4; R18: 19,4 km în linie dreaptă | **NU apare** |

Concluzie: blocul acoperă 435ASB și 144BRAZ. 186OMM intră numai dacă «capătul» se măsoară de la poartă sau pe șosea.
**744ARF și 804MUM nu apar deloc**, deși sunt mașinile cu cel mai mare drum zilnic.

Km-ii lor nu sunt drum casă ↔ capăt: sunt curse nedetectate. Mișcările lor, pe săptămână:
- 744ARF: turul s1 R13, 5 × 23,4 km.
- 804MUM: returul s2, 5 × 45,7 km, plus 16.09 turul s1 (45,5 km) și turul s2 (48,4 km).
- Pentru amândouă, linia n-are etalon (`linii["R13|Hasnasenii Noi"].E` și `linii["R18|Putinesti"].E` = null).

---

## 3. Cifrele pentru întrebarea c2, refăcute după (1)

- R1a măsurat pe cele 4 mașini cu zile măsurate: **azi 882,3 km/săpt.**
- După (1) cu M4, dacă iese doar bucata: **725,5 km** (744ARF scade de la 179,4 la 22,6).
- Cu c2 = DA (regula parcului §5.3 a), aplicată după (1): 435ASB → 0, 186OMM → 0, 144BRAZ → 7,3, 744ARF → 22,6
  (golul impus e deja scăzut). Rezultă **≈ 30 km/săpt.**
- Cifra «882 → 187» din `runda-2.md:44` e de dinainte de (1): cei 187 km conțineau 179,4 km ai lui 744ARF, care sunt în cea mai mare
  parte cursa R13. Întrebarea către Ion trebuie să poarte: **«azi 882; fără cursele nedetectate 726; cu DA ≈ 30»**.
- Dacă iese ZIUA, cifrele devin 702,9 → ≈ 7, iar 744ARF devine nemăsurată.

---

## 4. Observații (rubrica comună)

**H1 — high, −2,0 (defect de logică): criteriul (1) așa cum e scris (`runda-2.md:39-40`) scoate din R1a km fără cursă și ratează o zi cu cursă.**
- Scenariu: la rularea săptămânii 14.09 cu criteriul V0, 024XKY pierde 351,2 km din R1a măsurat. Aceștia sunt drumurile de seară
  spre Drochia, trecute de §11.8 la «de lămurit». Pierderea vine doar din mutarea EST ↔ VEST de la 06:09, care e coada turului s1
  detectat. Dacă iese ziua, pierde 2 din 3 zile măsurate și devine nemăsurată.
- În aceeași rulare, 744ARF 16.09 (78,8 km, măsurată) rămâne în R1a cu turul R13 înăuntru.
- Dovada: `r2-out.txt` (V0: 19 bucăți; 024XKY 15.09 «06:52 2,6'», 17.09 «06:48 2,0'») și `r2-miscari-out.txt` (024XKY «mișcare
  06:09–06:17 4,0 km, sate: —»; 744ARF 16.09 «05:15–06:05 23,4 km, Hăsnășenii Noi»).
- Corecția: condițiile 1–3 de mai sus și cifrele M4: 14 bucăți / 851,8 km; pe zilele măsurate 156,8 km, doar la 744ARF.

**H2 — high, −2,0 (defect de logică): blocul (2) nu arată 744ARF și 804MUM, iar cursele lor nu apar nicăieri.**
- Scenariu: pe pagina săptămânii 14.09, blocul «Dorm în Bălți» arată 435ASB 366, 144BRAZ 128,7 (2 zile) și, poate, 186OMM 282.
- 744ARF are după (1) 22,6 km în 3 zile, sub pragul de 100. 804MUM are 0 zile măsurate.
- Nicio altă parte a paginii nu spune că 744ARF face în fiecare dimineață turul pe R13 Hăsnășenii Noi. Nici că 804MUM face în
  fiecare noapte returul s2 spre Țiplești.
- Asta contrazice planul, Pasul 5: «nicio mașină măsurată nu mai lipsește din pagină».
- Dovada: tabelul din secțiunea 2 (`r2-out.txt`, «Blocul Bălți») și `economie-zile.json` (`linii[R13|Hasnasenii Noi].E = null`,
  `linii[R18|Putinesti].E = null`).
- Corecția: blocul are un al doilea rând pe mașină, «cursă probabil nedetectată pe linia X: N km/săpt. (mișcările, 5/5 zile)»,
  pentru mașinile scoase de (1). Întrebarea a5, despre etalonul R13 și R18, rămâne pentru Ion.

**M1 — medium, −1,0 (gol de acoperire): (1) schimbă regula, nu doar codul.**
- §8.6 (text 62eace0d) scoate ZIUA din regulile de economie și definește cursa nedetectată prin «jumătate fără pereche nicăieri».
- Detecția prin mișcarea spre sau de la poartă nu e în text. Nici alegerea «iese bucata» sau «iese ziua» nu e hotărâtă.
- Diferența contează: la 744ARF rămân 22,6 km pe 3 zile dacă iese bucata, sau 0 zile măsurate dacă iese ziua.
- Un worker care face altceva decât textul lui Ion încalcă ordinea surselor: textul e primul.
- Corecția: o frază în §8.6, prin `replace`, cu gard md5 62eace0d și `ROW_COUNT = 1`. Alegerea bucată sau zi se pune în plan cu cifrele de mai sus.
  §12.1 rămâne neatins.

**M2 — medium, −1,0: condiția «capătul > 15 km» nu e definită.**
- Nu se spune dacă e distanța în linie dreaptă sau pe șosea, de la casă sau de la poartă, pe linie sau pe mașină.
- 186OMM R4 Grinăuți: 13,9 km în linie dreaptă de la casă, 15,6 de la poartă, 16,7 pe șosea. Intră sau nu, după citire.
- 435ASB are și o zi pe R19 Bilicenii Vechi: 14,8 km în linie dreaptă.
- Corecția: pe șosea (Valhalla), de la casă, pe linia cu cei mai mulți km R1a ai mașinii, sau pragul pe R1a/zi, nu pe capăt.

**L1 — low, −0,5:** pentru nemăsurate nu e spus dacă pragul de 100 km/săpt. se compară cu km-ii zilelor măsurate sau cu extrapolarea.
La 144BRAZ asta înseamnă 128,7 sau 322.

**Scor: 10 − 2,0 − 2,0 − 1,0 − 1,0 − 0,5 = 3,5.** Blocante (high): 2 (H1, H2).

## 5. Pozițiile pe (C)

- **(1) DA, cu condițiile 1–3.** Nu așa cum e scris.
  - Cu condițiile, criteriul prinde doar curse reale: 14 din 14, toate în grupa Bălți, 0 pe restul flotei.
  - Pentru «bucată sau zi»: întrebare, cu cifrele. Eu aș alege bucata, ca 744ARF să rămână măsurată pe partea R19, și aș scrie-o în §8.6.
- **(2) DA ca bloc informativ fără schimbarea §12.1**, textul spune deja «se vede pe pagină». Cu două condiții:
  - rândul «cursă probabil nedetectată» pentru mașinile scoase de (1) (H2);
  - distanța până la capăt definită (M2).
- **(3) DA, rămâne întrebare pentru Ion**, cu cifrele refăcute: 882 azi → 726 fără cursele nedetectate → ≈ 30 cu DA.


---
### verificator-raport.md

# Verificarea 8 — DRAXELMAIER_BALTI — 27.09.2026 (dezbaterea ideal-v4, runda 2, ION-110)

**Starea.** `RUN=/home/verif/verificator/rulari/drax-v8-1790522048` · sursa `/root/lde-worker/drax/date/ideal-v4.1` (GATA al producătorului, schelet-ideal bfa070f0339c5464…, timp.mjs = al verificatorului) ·
drax.mjs 1be43dc0b57b · ruleaza.sh a26fad56be25 · etalon-gps 3f958d6ca8dd · filtru-rupte 96807913f1d1 · node v20.20.2 · tz 2025c · Europe/Chisinau.
Regulile: textul după migrația 412 — `reguli_livrare_la` 2026-09-27T15:00:05.260446+00:00, 25.072 caractere, md5 62eace0d0dd8f37e678a27ef639f5c0e (verificat).
SIGILIU: verdict ca33a53d81c1… · probe: R1 **ok** · registru **PICATĂ** (registrul e pe alt sha — X2, aceeași clasă ca v7) · INCHIS: **ok** (manifestul final = inițial).
Unități: 51 linii din act, 48 linii `*` («Rediul de Jos*» a dispărut), 48 cu ideal, 49 mașini, 13.534 observații cu rută (+1 față de v7), 13.315 deplasări cu rută, 27.644 brute (identice).
valid_pentru_export: **false** — 5 blocante, exact cele 5 explicate în v6 (C31 R13 Hasnasenii Noi, R18 Putinești, R27 Iabloana; G1 R18 Zarojeni, R27 Sturzovca), neexplicate pe bfa070f0.

## (1) Verdictul pe v8 — R28 și R37
| linie | G1 card / GPS completat | C47 | C23 hartă | C11 capăt atins | km GPS sept pe sens × schimb (+rază) | lanț (șosea) pe schimb | verdict |
|---|---|---|---|---|---|---|---|
| R28 Cuhnești → Balatina | 75,0 / 75,0 (0 %, 14 zile) | 32/35 (91 %) | 75,0 (0 %; în v7 65,5 = 12,7 %) | 140/140 trec prin Balatina | tur s1 73,4 · tur s2 73,0 · retur s1 75,5 · retur s2 75,3 | etalon 76,8 · s1 77,9/79,8 (3 zile) · s2 74,9/74,3 | **trece** |
| R37 Musteața → Năvîrneț | 60,2 / 60,2 (0 %, 9 zile) | 33/33 (100 %) | 61,9 (2,8 %) | 142/144 trec, 136 opresc | tur s1 59,7 · tur s2 59,8 · retur s1 59,9 · retur s2 61,5 | etalon 61,5 · s1 61,0/61,7 · s2 61,9/63,9 | **abatere** — doar C22: ziua desenată s1 925FTI 25.09 are turul pe EST (poarta sensului e VEST), deci nu e zi bună GPS; harta e în ±5 % |

**H1 e închis:** câmpurile lanțului (etalon, real, schimburi, drum) urmează acum capetele noi; D6 R37 a dispărut; F2 (`economie/categorii.mjs:37-40`) vede între schimburi R28 5,4 % și R37 2,5 %, sub 25 %, deci un singur etalon pe linie. Celelalte 46 de linii: identice cu v6/v7 (`compara.mjs`); card 5.872 km/zi, GPS completat 6.000 km/zi (+52 față de v6: R28 +19, R37 +33,4).

## (2) Comasarea
Pe R28/R37: 282 din 284 de observații identice cu v7. **3 observații `capatAct` + `exclusEtalon` («cursă scurtă: atinge startul din act…»)**, toate pe R37:
351KAJ 05.05 tur 49,3 / retur 50,2 (în v7 erau pe «Rediul de Jos*») și 925FTI 09.09 tur 44,2 (nouă; pe poarta EST, deci oricum în afara C47). Pe R28: 0 (toate cursele trec prin Balatina).
Nicio cursă bună pierdută și nicio cursă scurtă în etalon: C47 R37 33/33 ca în v7, zile bune 9 = 9. Pe flotă: +1 observație (a lui 925FTI). Notă: `drax.mjs` nu citește `exclusEtalon`; aici n-a contat (piciorul e pe cealaltă poartă), iar un picior scurt pe poarta sensului ar ieși în C47 în afara toleranței (conservator, nu pierde nimic).

## (3) Re-semnarea registrului
Verdictul o permite: cele 5 blocante sunt aceleași ca în v6, iar diagnosticul din runda 1 susține explicațiile (Zarojeni: cardul 28,9 = picioarele prin Zarojeni, etalonul 30,7 = serviciul R22 al lui 348KAJ; Sturzovca: 46,5 = 727CWN prin satele R11/R13, iar linia are 24,1 pe 41 de zile; C31: 0 candidate). **Ce e nevoie de la sesiune** (verificatorul nu scrie în registru):
1. re-semnarea celor 5 intrări pe sha-ul `bfa070f0339c5464b58b0663ac8cc6842a8c2be890dfe8983f7a5c953792f61c`, cu textele G1 actualizate (clasa «capăt prin parcare» ca motiv);
2. ștergerea celor 24 de intrări moarte (X1: sha 0a5d2a5e, 29b2d3aa, 43dcceaf, 8b400214, f7214db8), inclusiv G1 Bocancea Schit;
3. o rulare v9 pe aceeași sursă: proba-registru trebuie să iasă «ok» și `valid_pentru_export` true; abia apoi `ideal-activ` → `ideal-v4.1`.

## (4) H4 «capăt prin parcare» — de acord cu Codex C1
Da: **doar listă de diagnostic**, fără excludere automată. Cazul de control «plecare legitimă din capăt, tracker pornit târziu» nu intră în lista mea, pentru că piciorul lui oprește în satele proprii la > 2,5 km dincolo de capăt. Pot intra fals doar liniile scurte fără sat propriu dincolo de capăt și satele comune a două rute; lista le marchează separat. Lista de azi (identică în v6, v7 și v8): Zarojeni 15/29 (52 %, 348KAJ), Heciul Vechi* 61/130 (47 %, 412BRAY), Dominteni 52/115 (45 %, 710CWN → Lazo, Hăsnășenii Noi, Dobrogea Veche), Prajila 29/107 (27 %, 763LYY → Gura Căinarului, Zarojeni), Sturzovca 16/107 (15 %, 727CWN → sate R11), Țiplești 3/24 (13 %). Excluderea se discută după C44 pe Dominteni (ture/zi 3 vs act 1) și Prajila (3 vs 2).

## (5) Liniile cu steag pe cardul v6 (Codex C2) — de acord
Da. Toate sunt sub pragul G1 de 5 %, cu excepția Zarojeni și Sturzovca, unde cardul v6 e cel corect (runda 1). Bocancea Schit (54,5 / 54,0, 0,9 %) nu cere corecție, iar −1 km/zi nu justifică o a doua re-semnare. Steagul Bocancei nu mai e cerut de E1: se scoate la o rerulare obișnuită, nu acum.

## High-uri și scorul
- **H4 (preexistent, nu e regresie v4.1, nu blochează):** *scenariu* — Dominteni rămâne cu 3 ture/zi și 204 km/zi GPS, în care intră și serviciul R13 al lui 710CWN; F2 pune economia pe linia greșită, iar R13 Hasnasenii Noi rămâne «fără ideal, explicat».
- Procedură (medium): registrul nere-semnat pe bfa070f0 → v8 nu e exportabil până la v9.
- Low: C22 R37 (harta dintr-o zi cu turul pe EST); §4.1 «în mod regulat» fără prag numeric; `capete-gps.json` sigilat în GATA, dar în afara copiilor verificatorului; cheia cache-ului fără capăt (risc la următoarea mutare).

**Scorul (10 − Σ deduceri; high preexistent −1 · medium −0,5 · low −0,25):** H4 −1 · registru −0,5 · C22 R37 −0,25 · §4.1 fără prag −0,25 · capete-gps.json în afara intrărilor −0,25 · cheia cache-ului −0,25 = −2,5 → **7,5 / 10** (runda 1, v4: 6,0). După v9 cu registrul re-semnat: 8,0; cu H4 rezolvat: ~9.
v4.1 nu introduce nicio high nouă.

## Linie cu linie — din act (v8)
| rută | linie | verdict | sursa, zile bune GPS | km card v7 · GPS completat · dif (v6) | corecție | ture/zi · kmZi GPS | regim (D1) | porți tur/retur | C47 | controale căzute |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | Donduseni | trece | sept, 19 | 91.9 · 91.9 · 0 % | — | 1 · 183.8 | — | EST/EST | 100 % | — |
| R2 | Stolniceni | trece | sept, 16 | 67.9 · 67.9 · 0 % | — | 1 · 135.8 | — | VEST/EST | 94 % | — |
| R3 | Nihoreni | abatere | sept, 16 | 44.2 · 42.3 · 4.5 % | diagnostic cerut | 2 · 169.2 | — | VEST/EST | 58 % | C47 |
| R4 | Grinauti | trece | sept, 32 | 25.6 · 25.6 · 0 % | — | 2 · 102.4 | — | EST/EST | 97 % | — |
| R5 | Alunis | trece | sept, 9 | 34.6 · 34.6 · 0 % | — | 1 · 69.2 | — | VEST/EST | 100 % | — |
| R6 | Mihailenii Vechi | abatere | sept, 17 | 54.9 · 54.9 · 0 % | diagnostic cerut | 1 · 109.8 | — | EST/EST | 79 % | C22 zi aleasă |
| R7 | Usurei | trece | sept, 17 | 37.4 · 37.4 · 0 % | — | 1 · 74.8 | — | VEST/EST | 94 % | — |
| R8 | Costesti | trece | sept, 19 | 78.5 · 78.5 · 0 % | — | 1 · 157 | — | VEST/EST | 100 % | — |
| R9 | Cobani | abatere | sept, 14 | 55.5 · 55.5 · 0 % | diagnostic cerut | 2 · 222 | sursa «sept»: doar s1 · toată fereastra: neclar (lanț: neclar); act EZ+D → GPS neclar (sursa: doar s1) | VEST/EST | 100 % | D1 regim sursă ≠ total, D1 ≠ act |
| R10 | Ciuciulea | trece | sept, 28 | 66.5 · 66.5 · 0 % | — | 2 · 266 | — | EST/EST | 80 % | — |
| R11 | Funduri Vechi | trece | sept, 16 | 24.7 · 24.7 · 0 % | — | 1 · 49.4 | — | VEST/EST | 97 % | — |
| R11 | Limbenii Noi | trece | sept, 9 | 31.2 · 31.2 · 0 % | — | 1 · 62.4 | — | VEST/EST | 80 % | — |
| R12 | Pelinia | trece | sept, 37 | 26.4 · 26.4 · 0 % | — | 2 · 105.6 | — | EST/EST | 100 % | — |
| R12 | Sofia | trece | sept, 33 | 31.5 · 31.5 · 0 % | — | 2 · 126 | — | VEST/VEST | 99 % | — |
| R13 | Hasnasenii Noi | neverificabil | — | — | — | — | — | — | — | C31(a) |
| R13 | Lazo | trece | toate, 22 | 16.4 · 16.4 · 0 % | — | 2 · 65.6 | — | EST/EST | 100 % | — |
| R14 | Baroncea | trece | sept, 27 | 44.4 · 44.4 · 0 % | — | 2 · 177.6 | — | EST/EST | 100 % | — |
| R14 | Dominteni | abatere | sept, 54 | 34 · 34 · 0 % | diagnostic cerut | 3 · 204 | act EZ → GPS ambele (sursa: ambele) | EST/EST | 68 % | — |
| R15 | Suri | trece | sept, 8 | 70 · 70 · 0 % | — | 1 · 140 | — | VEST/EST | 96 % | — |
| R16 | Floresti | abatere | toate, 13 | 35.7 · 35.7 · 0 % | — | 1 · 71.4 | act EZ+D → GPS rotatie (sursa: rotatie) | EST/EST | 100 % | — |
| R16 | Varvareuca | trece | sept, 35 | 42.8 · 42.8 · 0 % | — | 2 · 171.2 | — | EST/EST | 82 % | — |
| R17 | Prajila | abatere | sept, 45 | 41.3 · 41.3 · 0 % | diagnostic cerut | 3 · 247.8 | — | EST/EST | 84 % | — |
| R18 | Putinesti | neverificabil | — | — | — | — | — | — | — | C31(a) |
| R18 | Zarojeni | blocant | sept, 9 | 28.9 · 30.7 · -5.9 % | diagnostic cerut | 2 · 122.8 | sursa «sept»: neclar · toată fereastra: rotatie (lanț: rotatie) | EST/EST | 41 % | G1, D1 regim sursă ≠ total, C47 |
| R19 | Bilicenii Vechi | abatere | sept, 25 | 17.3 · 17.3 · 0 % | — | 2 · 69.2 | sursa «sept»: doar s2 · toată fereastra: rotatie (lanț: rotatie); act EZ+D → GPS rotatie (sursa: doar s2) | EST/EST | 81 % | D1 regim sursă ≠ total |
| R19 | Copaceni | trece | sept, 36 | 32.8 · 32.8 · 0 % | — | 2 · 131.2 | — | EST/EST | 99 % | — |
| R20 | Nicolaevca | abatere | sept, 28 | 39.6 · 39.6 · 0 % | diagnostic cerut | 2 · 158.4 | sursa «sept»: ambele · toată fereastra: neclar (lanț: neclar); act EZ+D → GPS neclar (sursa: ambele) | EST/EST | 100 % | D1 regim sursă ≠ total, D1 ≠ act |
| R20 | Radoaia | trece | sept, 37 | 26.1 · 26.1 · 0 % | — | 2 · 104.4 | — | EST/EST | 97 % | — |
| R21 | Heciul Nou | trece | sept, 39 | 20.7 · 20.7 · 0 % | — | 2 · 82.8 | — | EST/EST | 97 % | — |
| R22 | Tiplesti | trece | sept, 7 | 21.4 · 21.4 · 0 % | — | 1 · 42.8 | act EZ+D → GPS rotatie (sursa: rotatie) | EST/EST | 83 % | — |
| R23 | Scumpia | trece | sept, 21 | 59.5 · 59.5 · 0 % | — | 2 · 238 | — | VEST/EST | 98 % | — |
| R24 | Catranic | trece | sept, 15 | 29.3 · 29.4 · -0.3 % | — | 1 · 58.8 | — | VEST/EST | 92 % | — |
| R25 | Hiliuti | abatere | sept, 9 | 32 · 32 · 0 % | diagnostic cerut | 1 · 64 | — | EST/EST | 100 % | C22 zi aleasă |
| R26 | Ilenuta | trece | sept, 7 | 38.8 · 38.8 · 0 % | — | 1 · 77.6 | — | EST/EST | 89 % | — |
| R26 | Obreja Veche | trece | sept, 15 | 38.4 · 38.4 · 0 % | — | 1 · 76.8 | — | VEST/EST | 100 % | — |
| R27 | Danu | trece | sept, 16 | 53.3 · 53.3 · 0 % | — | 1 · 106.6 | — | VEST/EST | 94 % | — |
| R27 | Iabloana | neverificabil | — | — | — | — | — | — | — | C31(a) |
| R27 | Sturzovca | blocant | sept, 8 | 24.9 · 46.5 · -46.5 % | diagnostic cerut | 3 · 279 | sursa «sept»: neclar · toată fereastra: ambele (lanț: ambele); act D → GPS ambele (sursa: neclar) | VEST/EST | 29 % | G1, D1 regim sursă ≠ total, C47, C22 zi aleasă |
| R28 | Cuhnesti | trece | sept, 14 | 75 · 75 · 0 % (v6 65.5) | — | 1 · 150 | — | VEST/EST | 91 % | — |
| R29 | Ustia | trece | sept, 9 | 56.9 · 56.9 · 0 % | — | 1 · 113.8 | — | VEST/EST | 100 % | — |
| R30 | Cosernita | trece | sept, 18 | 63.8 · 63.8 · 0 % | — | 1 · 127.6 | — | EST/EST | 97 % | — |
| R31 | Cotiujenii Mari | trece | sept, 15 | 65.1 · 65.1 · 0 % | — | 1 · 130.2 | — | EST/EST | 100 % | — |
| R32 | Cainarii Vechi | trece | sept, 18 | 46.9 · 46.9 · 0 % | — | 1 · 93.8 | — | EST/EST | 79 % | — |
| R32 | Trifanesti | abatere | sept, 18 | 40.2 · 40.2 · 0 % | diagnostic cerut | 2 · 160.8 | sursa «sept»: ambele · toată fereastra: doar s1 (lanț: doar s1); act D → GPS doar s1 (sursa: ambele) | EST/EST | 70 % | D1 regim sursă ≠ total, D2 izolat |
| R33 | Iezarenii Vechi | trece | sept, 13 | 34.7 · 34.7 · 0 % | — | 1 · 69.4 | — | EST/EST | 96 % | — |
| R34 | Taura Veche | trece | sept, 18 | 40.7 · 40.7 · 0 % | — | 1 · 81.4 | — | EST/EST | 100 % | — |
| R35 | Cucioaia | trece | sept, 19 | 52.5 · 52.5 · 0 % | — | 1 · 105 | — | EST/EST | 100 % | — |
| R36 | Bocancea Schit | trece | sept, 11 | 54.5 · 54 · 0.9 % | — (card v6, Codex C2) | 1 · 108 | — | EST/EST | 94 % | — |
| R37 | Musteata | abatere | sept, 9 | 60.2 · 60.2 · 0 % (v6 43.5) | — | 1 · 120.4 | — | VEST/EST | 100 % | C22 zi aleasă |
| R38 | Glinjeni | trece | sept, 13 | 33.3 · 33.3 · 0 % | — | 1 · 66.6 | — | VEST/EST | 94 % | — |
| R39 | Popestii de jos | trece | toate, 47 | 74.8 · 74.8 · 0 % | — | 1 · 149.6 | — | EST/EST | 98 % | — |

## Linii * (v8)
| rută | linie | verdict | cifre |
|---|---|---|---|
| R1 | Tîrnova* | neverificabil | nicio candidată nu trece satele regulate (1 cu urmă) |
| R2 | Cupcini* | trece |  |
| R3 | Recea* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R3 | Rîșcani* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R4 | Corlăteni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R5 | Recea* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R6 | Nicoreni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R7 | Recea* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R7 | Slobozia* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R8 | Pîrjota* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R9 | Glodeni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R9 | Hîjdieni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R11 | Fundurii Noi* | neverificabil | nicio candidată nu trece satele regulate (1 cu urmă) |
| R11 | Sadovoe* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R14 | Hăsnășenii Mari* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R15 | Drochia* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R16 | Mărășești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R16 | Mărculești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R17 | Mărculești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R18 | Gura Căinarului* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R19 | Sîngerei* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R20 | Drăgănești* | trece |  |
| R20 | Mîndreștii Noi* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R20 | Sacarovca* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R21 | Alexăndreni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R22 | Alexăndreni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R22 | Heciul Vechi* | trece |  |
| R22 | Țipletești* | trece |  |
| R23 | Călugăr* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R23 | Fălești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R23 | Frumușica* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R23 | Gara Fălești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R23 | Măgureanca* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R25 | Pîrlița* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R27 | Sadovoe* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R28 | Moara Domnească* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R29 | Limbenii Vechi* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R29 | Petrunea* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R32 | Bezeni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R32 | Frumușica* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R33 | Bilicenii Vechi* | trece |  |
| R33 | Nicolaevca* | neverificabil | nicio candidată nu trece satele regulate (1 cu urmă) |
| R33 | Vrănești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R34 | Bilicenii Vechi* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R35 | Dumbrăvița* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R36 | Bobletici* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R36 | Flămînzeni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R38 | Mărăndeni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |

Diagnostic: `diag-comasare.txt` (câmpurile scheletului și observațiile R28/R37, v7 vs v8; scriptul `/root/diag-verif/comasare-v8.mjs`). Pe flotă: ca în runda 1 (`../verif-r1/raport.md`), fără schimbări.


---
### verificator-corectii.md

# Corecții PROPUSE — runda 2 (v8 = ideal-v4.1); nimic scris
1. **Registrul (sesiunea):** re-semnarea celor 5 explicații pe bfa070f0…, ștergerea celor 24 de intrări moarte (inclusiv G1 Bocancea Schit), apoi v9 pe aceeași sursă, înainte de `ideal-activ` → `ideal-v4.1`. Efect km: 0.
2. **Cheia cache-ului** (`drax/cod/ideal-v4.1/schelet.mjs`, `ruta|linie|zi|schimb|m`): se adaugă capătul, ca următoarea mutare să invalideze singură cache-ul (în v4.1 s-au curățat de mână 25 de intrări). Efect km: 0.
3. **H4:** listă de diagnostic săptămânală (nu excludere), cu coloanele linie, mașină, picioare, %, satele străine, ture/zi GPS vs act; C44 pe Dominteni și Prajila înainte de orice regulă. Efect: 0 până la decizie.
4. **§4.1:** pragul «regulat» scris (propus: ≥ 30 % pe fiecare sens, pe toată fereastra, fără parcare, ≥ 2 mașini). Efect km: 0 (R28 și R37 trec).
5. **Verificatorul (propunere; sesiunea aprobă):** `ruleaza.sh` copiază `capete-gps.json`; `drax.mjs` raportează `capatAct` / `exclusEtalon` și le scoate din C47 la fel ca lanțul.


---
### verificator-intrebari.md

# Întrebări — runda 2 (v8)

1. **H4: numai listă de diagnostic, fără excludere automată (Codex C1)?**
   Cifre: criteriul verificatorului: capăt ≤ 1 km de marginea deplasării + nicio oprire §4.5 în satele proprii la > 2,5 km dincolo de capăt + ≥ 1 oprire în satele altei rute; 6 linii ≥ 10 %, 58 < 10 %
   Recomandarea verificatorului: DA. Cazul de control «plecare legitimă din capăt, tracker pornit târziu» nu intră în listă cât timp piciorul oprește în satele proprii; cazurile care ar intra fals sunt liniile scurte fără sat propriu dincolo de capăt și satele comune a două rute — lista le marchează separat. Excluderea se discută abia după C44 pe Dominteni și Prajila (ture/zi 3 vs act 1 / 2)

2. **Liniile cu steag rămân pe cardul v6, Bocancea Schit inclusiv (Codex C2)?**
   Cifre: Bocancea Schit: card 54,5 / GPS 54,0 (0,9 %), C47 94 %; corecția ar fi −1 km/zi și ar schimba sha-ul scheletului (a doua re-semnare)
   Recomandarea verificatorului: DA pentru card (sub pragul G1 de 5 %, corecția nu e obligatorie). Steagul Bocancei nu mai e cerut de E1: se scoate la următoarea rerulare obișnuită, nu acum

3. **§4.1 «în mod regulat» fără prag numeric (din runda 1)**
   Cifre: R28 tur: 43 % pe fereastră fără parcare, 28 % pe sept fără parcare; R37 ~95 %
   Recomandarea verificatorului: prag scris pe toată fereastra, fără parcare, ≥ 30 % pe fiecare sens, ≥ 2 mașini
