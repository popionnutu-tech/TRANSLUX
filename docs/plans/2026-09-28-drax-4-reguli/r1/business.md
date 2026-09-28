# ION-120, runda 1: business-logic-auditor

Am citit regulile din bază (`reguli_livrare` DRAXELMAIER_BALTI, md5 8c6ad18b…, §4, §5, §7, §8, §10–§12) și codul de pe VPS:
`categorii.mjs` (segmentarea, ocolul ION-115, carve-out-ul ION-119 `intreUzine`, deja pe VPS), `alternative.mjs` (R1a/R1b/R3/A/R2),
`cifre.mjs` și `scrie-analiza.mjs`. Din admin am citit antetul lui `drax-ce-faci.ts`. Toate cifrele de mai jos le-am măsurat
cu două scripturi, doar citire, pe `date/saptamanal/2026-09-14/economie-zile.json` și pe `economie.json`.
Nu am scris nimic în bază și nu am schimbat cod.

## Faptele care hotărăsc citirile (săptămâna 14–20.09, 38 de mașini, 189 de zile-mașină L–V, eșantionul §8.6 = 159)

- Zilele după numărul de perechi: **2 perechi în 125 de zile** (66 %), 1 pereche în 53, 0 perechi în 11.
  Mașina cu 2 perechi face tur s1 06:1x → (gol înapoi la capăt) → tur s2 14:3x → retur s1 15:5x → (gol înapoi la poartă) → retur s2 00:1x.
- Categoriile pe L–V: livrare 9.358 · legătură 8.434 · gol pe rută (3b) 5.654 · gol între ture 789 · parc 831 · gol impus (3a) 211 km.
- Golurile dintre cursele aceleiași linii, pe eșantion:
  - tur→tur: 49 de goluri, 2.579 km, față de 1.830 km cât dă E (drumul de întoarcere la capăt, impus). Din diferență, ocolul pe acasă (R1b) e 367 km.
  - retur→retur: 50 de goluri, 2.634 km, față de 1.852 din E. Ocolul e 432 km.
  - Restul, ≈ 730 km/săpt., e «alt drum decât cel mai scurt». Nu e în nicio regulă (ION-115 l-a lăsat în 3b).
- Golurile dintre cursele unor linii diferite (legătura): tur→tur 2.320 km (ocol 644), retur→retur 2.016 km (ocol 542).
- Golurile care încep și se termină la poartă (tur → retur, oricare linie): gol între ture 19 goluri / 360 km, 3b 49 / 546 km,
  legătură 32 / 210 km, parc 7 / 104 km.
  Pe tot golul între ture al eșantionului, 186 km sunt în afara zonei și 602 în zonă; la 8 intervale mașina trece pe acasă (201 km).
  R3 = 0, pentru că filtrul de eligibilitate §8.3 (o pereche SAU linie > 30 km) plus plafonul taie tot.
- **Retur care se termină la X, urmat în aceeași zi de un tur care pornește tot din X: 0 cazuri.** Între retur s1 și cursa următoare
  vine mereu retur s2, care pleacă de la poartă. «Aceeași localitate» apare deci doar peste noapte.
- Nopțile între două zile consecutive cu curse: 157.
  - 42: mașina doarme deja la ≤ 2,5 km de capătul ultimei curse.
  - **50: ultima cursă de seară se termină în același X din care pornește prima cursă de a doua zi, iar mașina doarme în altă parte.
    Seara + dimineața fac 1.839,5 km pe săptămână** (toate zilele, înainte de filtrul §8.6). Exemple: 386PKP Usurei 41 + 41 km/noapte
    (doarme la 26,7 km de capăt), 435ASB Taura Veche 35 + 39, 144BRAZ Glinjeni 29 + 29, 518MHD Florești 22 + 22.
  - 65: X-ul de seară ≠ X-ul de dimineață (altă linie sau rotație), 2.690,6 km. Aici R-1 nu se aplică.
  - 20 din nopțile care nu-s deja la capăt sunt în Bălți (§7.4).

## Definițiile propuse (un km = o singură regulă, pe categoriile §5, care sunt deja disjuncte)

**R-1 «rămâne la capăt dacă ruta se termină în aceeași localitate».** Citirea: returul cu care mașina își termină ziua se termină
la X (capătul §4.1–4.2), iar prima cursă a următoarei zile de lucru a mașinii pornește din același X (≤ 2,5 km, raza §4.2), iar
locul nopții e la > 2,5 km de X. Atunci mașina doarme la X.
- Km: livrarea de seară din ziua d + livrarea de dimineață din ziua d+1 (R1a, km GPS, fără golul impus 3a).
- Fiecare jumătate se numără doar dacă ziua ei e în eșantionul §8.6; altfel X-ul cursei poate fi greșit.
- Între curse, în aceeași zi, nu există caz (0 pe 14.09). Varianta «între schimburi» nu intră în R-1: ea e R-4, cu locul de așteptare «la capăt».
- R-1 ⊂ R1a. Restul lui R1a rămâne «cost de azi» (se taie doar prin R-3 sau cu alt șofer).
- Weekendul (vineri → luni) se arată separat, cu steag: mașina ar sta 60 h în sat.
- Mașinile care dorm în Bălți intră în R-1 (dorm la X în loc de Bălți), dar rămân marcate «de analizat» (§12.1).

**R-2 «rămâne la uzină».** Citirea: în orice gol care începe cu un TUR (mașina e la poartă) și se termină cu un RETUR (pleacă de la
poartă), indiferent dacă e aceeași pereche (§5.4), altă pereche a aceleiași linii (3b: tur s2 → retur s1) sau altă linie (legătură),
mașina așteaptă în zona uzinei (≤ 3 km).
- Km: km-ii GPS din afara zonei, minus deplasare (§5.6), minus cursa între uzine (ION-119, scoasă înainte), minus ocolul pe acasă.
  Ocolul pe acasă e în categoria livrare, deci merge la R-4, nu aici.
- Plafonul §8.3 se păstrează: dus-întors până la cea mai lungă oprire ≥ 20 min, × 1,05. Excesul rămâne «nelămurit».
- Se scot condițiile «o singură pereche / linie > 30 km» (Ion o spune fără condiție).
- R-2 ⊇ R3. R-2 NU e A (§8.4): nu mută noaptea și nu adaugă drumuri.
- Pe 2 perechi, după tur s1 mașina TREBUIE să se întoarcă la capăt pentru tur s2. Acolo R-2 nu taie nimic. Dacă nu scriem asta,
  cititorul crede că «rămâne la uzină» îl scapă de E.

**R-4 «nu pleacă acasă între schimburi».** Citirea: R-4 = R1b, adică ocolul ION-115 (cât lungește casa drumul pe șosea). NU e tot drumul pe acasă.
- Partea directă a drumului e impusă: la 041BRAU pe 15.09, golul 06:09–13:37 are 48,1 km, din care 35 km e drumul spre Nicolaevca
  pentru tur s2, iar ocolul e 0,2.
- Locul de așteptare se deduce: cursa următoare e tur → așteaptă la capăt; e retur → așteaptă la uzină. E exact `ramane` din
  `drax-ce-faci.ts` (ION-108).
- Trecerea pe acasă din golul perechii (§5.4) rămâne la R-2. Categoria o decide, nu se numără de două ori.

**R-3 «rutele împărțite altfel».** Citirea: mașinile își schimbă liniile între ele pe SĂPTĂMÂNĂ. Unitatea e setul de linii al mașinii,
pentru că rotația §2.3 schimbă schimbul, nu linia. Nu se lucrează pe (zi, schimb).
- Costul unei atribuiri = lanțul gol al zilei pe Valhalla: noapte → primul start, sfârșit_i → start_{i+1}, ultimul sfârșit → noapte.
  Se socotește DUPĂ R-1, R-2 și R-4, adică pe ziua în care mașina deja doarme la X, așteaptă la uzină și nu merge acasă.
- R-3 = cost azi − cost pe atribuirea propusă, net pe flotă. Pe mașină are semn: pierderea se arată la mașina care pierde.
- Se propun doar schimburile (ciclurile) cu net ≥ 50 km/săpt. fiecare.
- Capacitatea: o linie merge doar pe o mașină cu ≥ locurile clasei ei (50/27/20, tipul de lângă plăcuță, ION-114).
- Liniile cu grupele EZ+D (două perechi zilnic) se mută întregi.

**Ordinea:** R-1, R-2, R-4 pe categorii disjuncte (margini R1a / gol poartă→poartă / livrare-ocol), apoi R-3 pe rest.
Proba P10 pe mașină: R-1 + R-2 + R-4 ≤ livrare + golTure + 3b + legătură ale ei. R-3 se arată separat, cu semn, și nu intră în suma pozitivă.

## Ce se schimbă în reguli (texte propuse)

- **§8.1:** «Regula B = R1a + R1b + R3 rămâne costul de azi. Ce se poate tăia = cele 4 reguli ale lui Ion (§8.7): R-1 ⊂ R1a,
  R-4 = R1b, R-2 ⊇ R3, R-3 separat, net.»
- **§8.3:** se scot condițiile «o pereche SAU > 30 km»; golul se extinde la orice gol tur→retur (5.3 b și 5.7 pe partea din afara zonei).
- **§8.4:** «A rămâne doar referință. R-2 nu e A: nu mută noaptea, doar așteptarea dintre tur și retur.»
- **§8.5:** «Realocarea se propune ca R-3: schimburi de linii pe săptămână, costul pe lanțul zilei după R-1/R-2/R-4, net pe flotă
  > 0 și ≥ 50 km/săpt. pe schimb, capacitatea ≥ clasa liniei; pierderile se văd la mașina care pierde.»
  Cifra veche (net 143,9 / brut 661,6 / pierderi 517,7) NU se reia: modelul ei e greșit (H1).
- **§12.1–12.3:** indicațiile = R-1 («mașina doarme la X; șoferul pleacă fără autobuz»), R-4 («așteaptă la X / la uzină, nu acasă»),
  R-2 («așteaptă lângă uzină»). Pragul de 100 km/săpt. se aplică pe R-1 + R-2 + R-4; R-3 apare ca listă «linia L: A → B», cu netul.
  «R1a nu intră în indicații» se înlocuiește cu «doar partea R-1 a lui R1a intră».
- **§5.10:** «R-1 lasă șoferul fără autobuz: drumul lui acasă nu e km al autobuzului și nu se numără.»

## Pe pagină

Un bloc «4 reguli de optimizare»:
- pe flotă: km/săpt. pentru fiecare regulă, plus «alt drum decât cel mai scurt» ≈ 730, ca informație, nu ca regulă;
- pe mașină: cele 4 cifre și propunerea în limbaj simplu (satul X, ora, unde așteaptă);
- R-3 ca listă de schimburi;
- weekendul R-1 și nopțile în Bălți cu steag;
- fără lei.

## Observații (scor: high 1,5 · medium 0,5 · low 0,25)

- **H1, R-3 pe modelul R2 de azi e greșit.** Modelul face costul pe pereche (2 × casă→capăt), cu atribuire pe (zi, schimb, clasă).
  Dar 66 % din zile au 2 perechi, iar costul lor e un lanț, nu o sumă pe perechi.
  Scenariu: 041BRAU face R20 s1 + s2. Algoritmul ungar mută doar perechea s1 la altă mașină. Modelul vede câștigul
  2·(d₁ − d₂), dar ziua reală capătă o legătură capăt L' → capăt R20 pe care modelul nu o plătește, iar noaptea rămâne la fel.
  Rezultat: câștig fals, iar semnul pierderilor (−517,7) nu e de încredere.
- **H2, R-4 = «tot drumul pe acasă» ar număra de două ori golul impus.** Scenariu: 041BRAU, 15.09, golul de 48,1 km.
  Autobuzul trebuie oricum să fie la Nicolaevca pentru tur s2 (E = 35). R-4 ar pretinde 48 km, când de tăiat sunt 0,2.
  Cele 49 + 50 de goluri de pe aceeași linie, cu E ≈ 3.680 km/săpt., ar deveni «economie».
- **H3, R-3 socotit înaintea lui R-1/R-4 ar număra de două ori.** Scenariu: 435ASB are R1a 292,5 și R2 150,6.
  Dacă R-1 o pune să doarmă la Taura Veche, R1a ≈ 0, iar mutarea liniei mai aproape de casă ar mai lua o dată aceiași km din margini.
- **M1.** Golurile nu au urma GPS în `economie-zile.json` (`bpts` lipsesc: 0 din 1.551 de segmente). Km-ii din afara zonei pentru
  golurile 3b și legătura tur→retur trebuie deci calculați în `categorii.mjs` (ca `r3km`) și salvați ca atare.
  Tot acolo, R-2 se citește după ce ION-119 a scos cursa între uzine.
- **M2.** R-1 leagă două zile. Dacă ziua d sau ziua d+1 e exclusă (§8.6) ori «de lămurit» (024XKY: R1a 532), jumătatea ei nu intră.
  Altfel X-ul iese din cursa nedetectată și P10 trece pe o sumă greșită.
- **L1.** Weekendul R-1 (vineri → luni) și parcarea în sat peste noapte: se arată separat, nu intră în pragul de 100.
- **L2.** ≈ 730 km/săpt. de «alt drum» rămân în afara celor 4 reguli: se arată ca informație, ca să nu pară că regulile acoperă tot golul.

**Scor: 10 − (3 × 1,5 + 2 × 0,5 + 2 × 0,25) = 4,0 / 10.** Trece la ≥ 8 dacă se adoptă definițiile de mai sus, adică H1–H3 închise prin definiție.
