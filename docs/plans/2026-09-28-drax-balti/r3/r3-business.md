# ION-109 Bălți, runda 3: partea Claude (logica de business)

Autor: business-logic-auditor, 27.09.2026. Doar citire:
- n-am aplicat migrația 413 și n-am rulat `--write`;
- tot ce am rulat pe VPS a mers pe copii în `/tmp`.

Scripturile sunt în `scratchpad/p110/b3-*`.

Pe lângă simularea din document (14.09), am rulat **lanțul vechi și lanțul ION-109 pe fereastra F2, 31.08–25.09 (4 săptămâni, 770 de
zile-mașină)**. Pașii au fost vizite → etichete → categorii → alternative, cu idealul v4.1, pe copiile `/tmp/p110b3-f2-vechi` și
`/tmp/p110b3-f2-nou`. Scriptul de comparație: `b3-f2cmp.mjs`.

---

## (1) Migrația 413: **transcrie corect decizia și criteriul**, cu textele de mai jos rămase de aliniat

### Ce am verificat
- **Gardul se potrivește cu baza.** În bază, acum: 25.072 de caractere, md5 `62eace0d…`, `reguli_livrare_la` 15:00:05Z.
- **Cele patru ancore apar fiecare exact o dată** în text. Am aplicat înlocuirile pe o copie locală și am obținut **26.070 de caractere,
  md5 `518f41a0…`**, adică exact gardul de ieșire. Fraza «drumul parc ↔ capăt e golul impus» dispare.
- **§7.4 citează decizia lui Ion textual.** §5.3 (a) are excepția «după o noapte în Bălți NU există gol impus».
- **§8.6 are cele trei condiții ale detectorului:** ≥ 5 min de margini, sensul ferestrei, ieșire la ≥ 5 km. Ziua iese întreagă.
- **§12.1 separă blocul de indicații** și îl scoate din mesajul pentru dispecer.

### Text care rămâne în contradicție sau învechit (L-d)
- **§5.5 PARC:** «drumurile din zona uzinei spre și de la o staționare… la Parcul Bălți» = parc.
  - După o noapte la parc, §7.4 nou spune «drumul până la capătul liniei și înapoi e livrare».
  - Codul pune toată marginea la livrare (`categorii.mjs`: marginea e împinsă ca livrare înaintea regulii parcului).
  - Textul lasă deci două citiri pentru primii ≤ 3 km. De adăugat în §5.5: «în afara marginilor zilei (5.2)».
- **Cifrele învechite după 413:**
  - §8.2: R1a 29 km pe zi-mașină și ≈ 1.100 km pe flotă;
  - §8.6: «21 %», «744ARF 4 din 19, 804MUM 2 din 10» (§8.4 le repetă);
  - pe F2, cu codul nou, 744ARF are 0 zile măsurate, 804MUM 0 și 397VKV 0.
  - Nu e contradicție de regulă, dar pagina citește textul. Se recalculează din rularea F2 nouă, sau se scrie «(înainte de 413)».
- **§8.3, §10.1, §11.4, §11.5 nu contrazic.**
  - §8.3 și §11.4 privesc intervalul dintre tur și retur, respectiv lanțul, nu marginile zilei.
  - §10.1 («așteaptă deja lângă uzină») e tot despre R3.
  - §11.5 privește ieșirile din zona neclară, nu livrarea.
- **§10.5 (posterul) și §11.1–11.2 sunt compatibile.**
  - Posterul numără acum și drumul din Bălți: e exact decizia lui Ion.
  - Ancora e poarta în fereastră, deci detectorul e aceeași logică.
  - Km-ii bucăților rămân «livrare» (§11.2), iar P10 e neatins.

## (2) `exclusDe` și ziua întreagă, pe toată flota: **corect, dar nu «nimic altceva nu se schimbă»** (M-a)

### 14.09 (`/tmp/p109-sim`)
- **16 zile-mașină** își schimbă categoriile, și numai între livrare și gol pe rută (golul impus scos). Mașinile: 744ARF, 804MUM,
  144BRAZ, **727CWN (14.09, parc) și 830MUM (15–16.09, parc)**.
- În regula B se schimbă doar 744ARF: 3 zile măsurate → 0, R1a 179,4 → 0.
- Carduri B 8.777 → 8.478. Indicațiile (top 3, 19 peste prag) sunt identice, P10 38/38, bilanț 195/195.

### F2, 4 săptămâni
**Detectorul.**
- 46 de zile semnalate din 770. Majoritatea erau deja excluse («jumătate nedetectată»).
- Excluderi noi luni–vineri:
  - 744ARF 5 (tur ~06:05; 31.08 retur 15:13);
  - 297LVY 4 (casa la 1,4 km; zile «fără curse» cu sosire la poartă 13:31–15:38);
  - 804MUM 2 (retur 23:3x);
  - 397VKV 1 (tur 06:12);
  - 735LYY 4 zile «fără curse», dar mașina **nu e în flotă**, deci fără efect.
- 024XKY nu e semnalat în nicio zi.
- Nicio altă categorie nu se schimbă («alte categorii schimbate 0»). Nicio zi exclusă înainte nu intră înapoi în măsurare.
- Pe business, detectorul e bun: n-am găsit alarme false. Cele noi sunt sosiri sau plecări în sensul ferestrei, repetate zi de zi.

**Golul impus scos.** Atinge **13 mașini**, nu doar pe cele care dorm în Bălți. **R1a crește pe zilele MĂSURATE la 7 mașini cu
casa departe:**

| mașina | casa (km de poartă) | R1a vechi → nou |
|---|---|---|
| 725CWN | 23,5 | 246,4 → 390,6 |
| 487NPL | 28,5 | 194,2 → 303,8 |
| 446ASB | 31,5 | 306,2 → 359,6 |
| 024XKY | 35,1 | 1.258,5 → 1.302,9 |
| 713IZX | 28,6 | 340,5 → 373,6 |
| 830MUM | 20,3 | 476,0 → 508,8 |
| 727CWN | 16,0 | 24,5 → 49,2 |

În total **≈ +442 km R1a măsurat în 4 săptămâni**, toți din nopți la parc, care sub §7.4 vechi erau gol impus.

**M-a (medium, −1).** Efectul decurge din decizia lui Ion luată literal («fie la uzină…»). Totuși:
- (a) documentul rundei spune «km se schimbă doar la 744ARF», ceea ce e adevărat doar pe 14.09;
- (b) blocul nu arată aceste mașini (filtrul e `casaKmPoarta ≤ 3`), deși §12.1 nou spune «Mașinile care dorm în Bălți (7.4) apar pe
  pagină», iar 7.4 cuprinde noaptea la parc;
- (c) Ion n-a văzut cifra.

Scenariul: se aplică, iar săptămâna cu o noapte la parc a lui 725CWN îi urcă R1a cu ~36 km. Pagina nu explică de unde vin, iar
posterul «cât costă drumul casă ↔ rută» crește.

Corectura:
- în raportul pentru Ion, rândul «nopțile la parc ale mașinilor din sate: +≈ 110 km R1a pe săptămână pe flotă (7 mașini)»;
- blocul aliniat la §12.1: fie ia și mașinile cu nopți în zonă, cu «N nopți în Bălți», fie textul §12.1 se restrânge la «casa la ≤ 3 km».

**L-b (low, −0,5).** §8.6 nou promite «drumurile de pe lista «de lămurit» (§11.8) rămân acolo». În cod
(`alternative.mjs:exclusDe`, `categorii.mjs`) nu există nicio verificare pe `de-lamurit.json`: `cursaNedetectata` bate orice alt
motiv.
- Azi nu apare niciun caz (024XKY, 0 zile pe F2), deci textul se ține doar din date.
- Corectura: `exclusDe` sare peste zilele-mașină din `de-lamurit.json` (`economie.cat` + `dow`), cu un test.

## (3) Blocul: **§12.1 DA, §10.3 aproape** (L-c)
- **§12.1: DA.** Blocul e secțiune separată, după «Ce faci» (`RaportDrax.tsx:168-169`), are datele lui (`dormBalti(a)` din `masini`,
  nu din `indicatii`), fără lei. Mesajul pentru dispecer nu se atinge.
- **§10.3, nemăsuratele: DA.** Cu `zileMasurate === 0` nu se arată km, doar zilele nevăzute.

**L-c (low, −0,5), în textul pe mașină:**
- **Motivul pe care îl dă nu e adevărat.** «linia ei nu e încă în schelet» apare la orice mașină nemăsurată. **804MUM** își primește
  fraza pe R22 Țiplești, care **are etalon 22,1 km** în v4.1. Motivul real e că cursa nu se vede, nu lipsa liniei.
  - Formulare: «cursa nu se vede în analiză, deci livrarea se măsoară după ce se lămurește».
- **Ton mai sigur decât regula.** «face o cursă cu oameni pe care analiza n-o vede» e prea sigur față de §8.6 («probabil
  nedetectată»). Formulare: «probabil o cursă cu oameni».
- **Lipsește cuvântul cerut de §10.3.** La 1–2 zile măsurate, «≈ N km pe săptămână (din doar 1 zi măsurată)» e extrapolare, iar
  §10.3 cere scris «extrapolare». Varianta: «extrapolat din 1 zi», sau km-ii zilelor măsurate fără extrapolare.
- **Distanța de poartă diferă de worker.** Filtrul blocului folosește doar distanța până la poartă, iar workerul și 413 folosesc «porți
  sau parc». Azi nu există mașină cu parcul ≤ 3 km și poarta > 3 km, deci e doar consecvență.

## (4) Ordinea: migrația → codul VPS → 14.09 rescris → push. **DA, cu o condiție de timp**
- **Condiția de timp.** Cronul `0 8 * * 1 lear-saptamanal.sh` rulează **luni 28.09 la 08:00** și scrie săptămâna 21.09 cu codul care e
  atunci în `drax/cod/`.
  - Dacă se aplică doar migrația, rândul de luni iese pe codul vechi, cu golul impus din Bălți, în timp ce regulile spun opusul.
  - Deci toți cei patru pași trebuie să fie gata înainte de 28.09 08:00. Altfel se amână migrația, nu codul.
- **Codul de copiat.** În `cod-ion109` față de `cod`, diferă doar `economie/categorii.mjs` și `economie/alternative.mjs` (`diff -rq`).
  `etichete.mjs` e deja cel cu M-a din ION-110. Se copiază doar cele două fișiere, cu `.bak-ion109`.
- **Rescrierea 14.09.** Trece prin `poarta.sh write` și `--write` pe instantaneul existent (v4.1), fără reextragere. Rezultatul
  așteptat: B 8.478, 144/189 de zile măsurate, 744ARF nemăsurat.
- **Push-ul paginii** poate merge oricând: cu rândul vechi, blocul arată doar R1a Bălți.
- **Tot înainte de aplicare:** corecturile L-c (texte) și decizia pe M-a (blocul sau §12.1), altfel migrația scrie în §12.1 ceva ce
  pagina nu face.

## Scor

10 − (1 + 0,5 + 0,5 + 0,5) = **7,5 / 10**

Sub rubrica mea nu e niciun high. Esențialul e corect:
- migrația e exactă;
- detectorul n-are alarme false pe 4 săptămâni;
- ziua iese întreagă;
- nicio categorie în afară de livrare și golul pe rută nu se schimbă.

**De închis înainte de aplicare:**
- M-a: efectul nopților la parc pe mașinile din sate, pus în raportul pentru Ion, și blocul aliniat la §12.1;
- ordinea, înainte de 28.09 08:00.

L-b, L-c și L-d sunt corecturi scurte.
