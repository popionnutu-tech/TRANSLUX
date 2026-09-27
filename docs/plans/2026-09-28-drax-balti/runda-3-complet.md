# Drăxlmaier — dezbaterea Claude + Codex, runda 3: mașinile care dorm în Bălți (ION-109, 27.09.2026)

Scheletul e închis (ION-110, ideal-v4.1 activ, c6e609c6). Runda 3 privește subiectul C din rundele 1–2, cu decizia lui Ion.

## Decizia lui Ion (27.09, răspunsul la întrebarea c2)
«Mașina care doarme la Bălți, fie la uzină, fie lângă uzină la om acasă — trebuie de analizat livrările tot.»
Deci c2 = NU: casa ≤ 3 km de poartă și noaptea la parc/uzină NU scutesc livrarea.

## Ce s-a implementat (corecturile acceptate în triaj-r2 + decizia lui Ion)
1. **Migrația 413** (`packages/db/migrations/413_lde_drax_livrare_balti.sql`, NEAPLICATĂ; gard 25.072 / 62eace0d → 26.070 / 518f41a0):
   §5.3 (a) — după o noapte în Bălți (parc, uzină, acasă ≤ 3 km de porți sau de parc) NU există gol impus; §7.4 rescris (noaptea în Bălți nu
   scutește livrarea, citatul lui Ion); §8.6 — ziua cu o cursă probabil nedetectată în livrare iese ÎNTREAGĂ (criteriul cu trei condiții);
   §12.1 — blocul «dorm în Bălți» separat de indicații, doar km, nu intră în mesajul pentru dispecer.
2. **Worker** (copie izolată VPS `/root/lde-worker/drax/cod-ion109/`, NU în producție; diff: `vps/worker.diff`):
   - `categorii.mjs`: `noapteZona` = locul nopții la ≤ 3 km de porți sau de parc → marginea zilei fără gol impus (§5.3 a nou);
   - `categorii.mjs`: `cursaNedetectata` pe bucățile «livrare»: atingerea porții (poarta(p, 0,3)) la ≥ 5 min de marginile bucății, ora într-o
     fereastră (§3.2) și sensul în ± 60 min: TUR = venea de la ≥ 5 km (porți + parc) în ultima oră și nu pleacă iar ≥ 5 km în 10 min;
     RETUR = pleacă la ≥ 5 km în următoarea oră și n-a venit de la ≥ 5 km în ultimele 30 min;
   - `alternative.mjs:exclusDe`: ziua cu `cursaNedetectata` iese întreagă («cursa probabil nedetectata la poarta (tur 06:04…)»).
3. **Pagina** (`apps/admin/src/lib/lde/drax-balti.ts` + test, `lde/reguli/DormBalti.tsx`, montat în `RaportDrax.tsx` după «Ce faci»):
   bloc «Dorm în Bălți · livrarea de analizat», mașinile cu `casaKmPoarta` ≤ 3 cu R1a > 0 sau cu zile nevăzute; o frază pe mașină, doar km.

## Simularea săptămânii 14.09 (copie `/tmp/p109-sim`, fără scriere în bază), față de rândul actual
| mașina | casa | R1a/săpt. | zile măsurate | cursă nevăzută |
|---|---|---|---|---|
| 744ARF | Dacia 2,4 km | 299 → — | 3 → 0 | tur ~06:04 în 5/5 zile (R13 Hăsnășenii Noi, fără etalon) |
| 804MUM | Pământeni 2,7 km | — | 0 | retur ~23:35 în 5/5 zile (spre Țiplești) + tur 06:17 pe 16.09 |
| 144BRAZ | Dacia 1,5 km | 321,8 | 2 | retur 00:03 / 00:05 pe 17–18.09 (zile deja excluse) |
| celelalte 35 | — | neschimbat | neschimbat | 0 |
Flota: B 8.777 → 8.478 km (−299 = 744ARF), R1b+R3 neschimbat. Alarmele false din runda 2 nu mai apar: 024XKY (coada turului detectat),
744ARF seara (trece pe la poartă spre casă), 804MUM 16:5x (SOSEȘTE din satele R22 la 16:54, iar prima versiune a detectorului îl lua drept
«retur» doar după fereastră — reparat cu sensul în ± 60 min). Gol impus scos: 53 de margini cu noaptea în zonă; km se schimbă doar la
744ARF (17,3 km/drum) — la 435ASB, 186OMM golul impus era deja 0.

Textul blocului pe 14.09 (din funcție): «435ASB doarme la Autogara (1,7 km de poartă), linia R34 · Taura Veche: drumul gol până la capăt și
înapoi ≈ 366 km pe săptămână.» · «744ARF doarme la Dacia (2,4 km de poartă). În 5 zile din 5 face o cursă cu oameni pe care analiza n-o vede
(tur pe la 06:04, …): linia ei nu e încă în schelet, deci livrarea se măsoară abia după ce cursa se lămurește.»

## Întrebări pentru părți
(1) Detectorul e corect pe toată flota (fără alarme false, fără curse reale ratate)? (2) Migrația 413 transcrie corect decizia lui Ion și
criteriul? (3) Blocul respectă §12.1 (nu e indicație) și §10.3 (nemăsuratele)? (4) Ce lipsește înainte de aplicare (ordinea: migrația, apoi
codul VPS, apoi rândul 14.09 rescris, apoi push)? Scor după rubrica comună; high doar cu scenariu + dovadă.


## Corecturi aplicate după răspunsurile Claude r3 (înainte de Codex)
- analist M1: §8.6 din migrația 413 are acum condițiile exacte din cod (raza porții + 0,3 km; TUR sosește — departe în ora de dinainte, nu pleacă iar în 10 min; RETUR pleacă — departe în ora de după, n-a venit de departe în 30 min; cursa nevăzută în afara livrării nu scoate ziua). Migrația regenerată: ieșire 26.373 / 56dfde04.
- §12.1: «mașinile cu casa în Bălți (≤ 3 km de porți sau de parc, 7.4)».
- analist M3 + business L-c: fraza nu mai spune «linia nu e în schelet»; «face probabil o cursă»; «extrapolare din doar N zile măsurate».
- analist L1/L2: mașina cu două linii le numește pe amândouă; zilele pe fiecare sens («tur pe la 06:04, 5 zile; retur pe la 15:35, 1 zi»). vitest 356/356, tsc curat.
- NEREZOLVATE (de discutat): business M-a — pe 4 săptămâni golul impus dispare și la 7 mașini cu casa departe după nopțile la parc (≈ +110 km/săpt. R1a; ele apar în tabelul paginii, nu în blocul Bălți); analist M2 — cursa nevăzută în golul dintre ture (293QVT 15:56) nu e prinsă; business L-b — lista «de lămurit» nu e verificată în cod (fără efect azi).

## Răspunsurile părții Claude (runda 3) — business 7,5 (0 high) · uzina-analist 5,5 (0 high) → Claude = 5,5


---
### r3-business.md

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


---
### r3-analist.md

# Drăxlmaier Bălți (ION-109), runda 3 — uzina-analist («cercetează»)

Autor: uzina-analist, 27.09.2026. Am citit:
- `docs/plans/2026-09-28-drax-balti/runda-3.md`;
- `vps/worker.diff` (`categorii.mjs`, `alternative.mjs`);
- `packages/db/migrations/413_lde_drax_livrare_balti.sql`;
- `apps/admin/src/lib/lde/drax-balti.ts`.

Nu am rerulat simularea. Am citit `/tmp/p109-sim/2026-09-14/` (rulată la 15:44 UTC) față de rândul de producție
`/root/lde-worker/drax/date/saptamanal/2026-09-14/` (rulat la 15:31 UTC), bucată cu bucată.

Scripturile sunt în `scratchpad/p110/`:
- `an-r3.mjs`: punctele (a), (b), (c) și flota. Ieșirea în `r3-out.txt`.
- `an-r3b.mjs`: 293QVT. Ieșirea în `r3b-out.txt`.
- `an-r3c.mjs`: mașinile cu casa la 3–15 km. Ieșirea în `r3c-out.txt`.
- `r3-text.mts`: rulează `dormBalti` / `textBalti` pe `analiza.json` din simulare, local, cu tsx.

## (a) Cursele nevăzute din runda 2: toate 14 sunt prinse

Fiecare din cele 14 bucăți (851,8 km) are `cursaNedetectata` chiar în bucata ei:
- **144BRAZ**, 17 și 18.09: retur la 00:03 și 00:05.
- **744ARF**, 14–18.09: tur la 06:04–06:07 în 5/5 zile. Pe 14.09 are în plus retur la 15:35.
- **804MUM**:
  - retur la 23:33–23:38 în 5/5 zile;
  - pe 16.09, în plus, tur la 06:17 (bucata de dimineață, 119 km brut).

Nicio ratare între bucățile «livrare».

**Ratare în afara livrării.** Detectorul se uită doar la bucățile «livrare», iar M4 al meu din runda 2 avea aceeași limită. Am rulat
același criteriu pe mișcări și în bucățile care NU sunt livrare (gol între ture, legătură, parc, necunoscut, gol pe rută):
- **293QVT**, în 4 zile măsurate din 4 (14–17.09): pleacă de la poarta EST la 15:53–15:57, în fereastra retur s1. Merge prin
  Cubolta (16:13) și Moara de Piatră (16:20), sate ale liniei «Baroncea – … – Moara de Piatra – Cubolta» din act. Drumul are
  48,8 km. Mișcarea stă în «gol între ture» al perechii R31 s2.
- Pentru 293QVT ziua rămâne măsurată. Din intervalul acela, 40 km pe zi stau la «nelămurit» (159,8 km/săpt.) pe pagină.
- În R3 nu intră nimic: R3 = 0, pentru că n-are o oprire de cel puțin 20 min.
- 744ARF face același lucru, cu returul s1 pe R13 la 15:54 în «gol între ture», în 15–17.09. Aici ziua iese oricum, prin turul
  de dimineață.

## (b) Alarme false: niciuna în săptămâna 14.09

- Zilele cu `cursaNedetectata` sunt 12 și aparțin doar mașinilor 144BRAZ, 744ARF și 804MUM. Toate sunt curse reale (lista (a)).
- 024XKY nu mai apare: coada turului detectat e prinsă de condiția «la cel puțin 5 min de marginile bucății».
- Serile lui 744ARF, când trece pe la poartă la ~01:00 spre casă, nu mai apar: acolo nu e niciun drum la 5 km sau mai mult.
- 804MUM la 16:5x, când sosește din satele R22, nu mai apare: condiția «retur» cere să n-fi venit de departe în ultimele 30 min.
- Pe restul celor 35 de mașini: 0.

Riscul rămas, de urmărit la control (nu s-a întâmplat pe 14.09): condiția 3 din runda 2 («atinge un sat») a devenit în cod
«a fost la cel puțin 5 km de porți și de parc».
- Exemplu: o mașină din Bălți se întoarce de la o deplasare sau de la Chișinău și trece prin raza porții în fereastra de tur
  13:30–16:00, apoi merge acasă (≤ 3 km).
- Ar fi luată drept tur, deși n-a atins niciun sat de linie.
- Propunere: adaug la controlul săptămânal (§10.4) o probă «cursă nedetectată fără sat de linie».

## (c) Golul impus la nopțile în zonă — km-ii sunt corecți

53 de margini au `noapteZona`: 144BRAZ, 186OMM, 435ASB, 744ARF și 804MUM câte 10, 727CWN 1 (parc), 830MUM 2 (parc).
Marginile cu noaptea la parc fără `noapteZona`: 0. Bucățile din afara zonei cu km schimbați: 0.

| mașină | gol impus înainte | Δ km livrare | pe zile măsurate după | R1a măsurat | zile măsurate |
|---|---|---|---|---|---|
| 435ASB | 0 | 0 | 0 | 292,5 → 292,5 | 4 → 4 |
| 186OMM | 0 | 0 | 0 | 281,7 → 281,7 | 5 → 5 |
| 144BRAZ | 74,0 | +74,0 (16–18.09) | 0 | 128,7 → 128,7 | 2 → 2 |
| 744ARF | 173,0 (17,3 × 10) | +172,9 | 0 | 179,4 → 0 | 3 → 0 (§8.6) |
| 804MUM | 149,8 (21,4 × 7) | +149,6 | 0 | 0 → 0 | 0 → 0 |
| 727CWN (parc) | 11,6 | +11,6 (14.09, exclusă) | 0 | 8 → 8 | 4 → 4 |
| 830MUM (parc) | 38,7 | +38,7 (15–16.09, excluse) | 0 | 83,4 → 83,4 | 3 → 3 |

- **Pe zilele măsurate nu se schimbă niciun km**, cum era de așteptat: golul impus scos cade doar pe zile excluse.
- Diferența pe flotă vine numai din scoaterea lui 744ARF: suma pe mașini B măsurat 7.706,8 → 7.527,4 și Bext 9.487 → 9.188 (−299).
  Cardul din `analiza.json` e 8.478,1 (= documentul).
- Asimetria din runda 1, M1 (744ARF primea 17,3 km gol impus pe fiecare drum, 435ASB primea 0), e închisă.
- La mașinile cu casa la 3–15 km (715IZX, 390ASB, 880RNK) nu rămâne gol impus. Pe toată flota rămân 5 margini cu gol impus,
  211,1 km, la mașini din afara Bălțiului, pe regula culoarului.
- Ce se schimbă totuși: media pe toate zilele, `kmZi.livrare`, crește la 144BRAZ (65 → 79,8), 744ARF (74,7 → 109,3) și
  804MUM (114,5 → 144,5). Blocul nu o folosește.

## (d) Textul blocului — fraza pe mașină, din `analiza.json` simulat

Frazele scoase de `textBalti` pentru cele 5 rânduri:
1. 435ASB: «doarme la Autogara (1,7 km de poartă), linia R34 · Taura Veche: … ≈ 366 km pe săptămână». Corect.
   R1a măsurat 292,5 în 4 zile; drumul real casă ↔ capăt e 98,6 % (runda 1).
2. 144BRAZ: «… ≈ 322 km pe săptămână (din doar 2 zile măsurate). Plus 2 zile cu o cursă … (retur pe la 00:03)». Corect.
   Returul nevăzut e pe linia ei, R38, care ARE etalon (33,3 km).
3. 186OMM: «…, linia R3 · Nihoreni: drumul gol până la capăt și înapoi ≈ 282». **Parțial greșit.**
   - Dimineața merge la capătul altei linii, R4 Grinăuți: 16,7–19,4 km.
   - Seara vine de la capătul R3 Nihoreni: 35–41,6 km.
   - Fraza pune toți km-ii pe R3, «până la capăt și înapoi».
4. 744ARF: «În 5 zile din 5 face o cursă … (tur pe la 06:04, retur pe la 15:35): linia ei nu e încă în schelet». Corect ca fapt:
   R13 Hăsnășenii Noi n-are etalon. Problema e returul: «retur pe la 15:35» s-a văzut doar pe 14.09. Returul s1 zilnic de la 15:54
   stă în «gol între ture» (vezi (a)), deci citit așa, fraza pare să spună «în fiecare zi tur și retur».
5. 804MUM: «În 5 zile din 5 face o cursă …: linia ei nu e încă în schelet». **Cauza e greșită.**
   - Returul nevăzut de la 23:3x pleacă de la poarta EST la 00:17–00:20 spre Țiplești / Țipletești. Asta e returul s2 al liniei
     R22 Țiplești: turul s2 R22 de la 14:40 e detectat. R22 **este în schelet**, cu E = 21,4 km.
   - Singura linie fără etalon a mașinii e R18 Putinești, pe turul s1.
   - Același fel de retur s2 nevăzut apare la 144BRAZ pe R38, tot o linie cu etalon.
   - Deci cauza nu e «linia lipsește din schelet»: e o tăietură ratată a returului s2, după așteptarea la VEST ~23:10–23:40 și
     mutarea VEST → EST la ~00:05–00:18. E de diagnosticat, nu de afirmat.
   - Codul pune fraza asta la ORICE mașină fără zi măsurată (`drax-balti.ts:47-49`).

Ce e în regulă:
- Blocul respectă §12.1: introducerea spune «Nu e o dispoziție pentru dispecer», totul e doar în km, fără lei.
- §10.3 e respectat: nemăsuratele (744ARF, 804MUM) n-au km inventați.
- 144BRAZ are «din doar 2 zile măsurate».

## Migrația 413 față de cod

- §5.3 (a), §7.4 și §12.1: transcriu decizia lui Ion.
- §8.6: textul spune «atinge poarta … în sensul cursei … și cu drumul ieșit la cel puțin 5 km de porți și de parc». Codul
  (`categorii.mjs`, blocul `cursaNedetectata`) cere mai mult, și tocmai de aici vine repararea alarmei 804MUM 16:5x:
  - turul: a venit de la ≥ 5 km în ultima oră și NU pleacă iar la ≥ 5 km în 10 min;
  - returul: pleacă la ≥ 5 km în ora următoare și NU a venit de la ≥ 5 km în ultimele 30 min;
  - raza porții + 0,3 km.
- Citit după textul migrației, 804MUM la 16:54 (a sosit de la ≥ 5 km, iar ora e în fereastra retur s1) poate trece drept «plecare cu
  drumul ieșit la 5 km». Textul e primul în ordinea surselor, deci trebuie să aibă condițiile codului.

## Observații (rubrica comună)

**M1 — medium, −1,0 (gol de acoperire): §8.6 din migrația 413 nu are condițiile de sens pe care le are codul.**
- Lipsesc ± 60 min, «nu pleacă iar în 10 min», «n-a venit de departe în 30 min», poarta + 0,3 km.
- Oricine reproduce regula din text (verificatorul, criticul, o rerulare după textul lui Ion) readuce alarma 804MUM 16:5x.
- Corecția: în `$na86$`, sensul scris exact ca în cod; md5-ul de ieșire se recalculează.

**M2 — medium, −1,0 (gol de acoperire): detectorul se uită doar la «livrare».**
- 293QVT are o cursă probabil nedetectată în «gol între ture» în 4 din 4 zile măsurate: retur s1 de la 15:56, prin Cubolta și
  Moara de Piatră, 48,8 km. Ziua rămâne măsurată, cu 159,8 km/săpt. «nelămurit».
- Același criteriu pe `golTure` / `legatura` / `necunoscut` ar scoate ziua, cum cere scopul lui §8.6.
- Nu e high: R3 = 0, nu ajunge în indicații.
- Corecția: fie detectorul și pe celelalte bucăți, fie steag separat «cursă probabil nedetectată în gol între ture», plus o
  întrebare pentru Ion despre 293QVT (e returul liniei R14 Baroncea / Cubolta?).

**M3 — medium, −1,0 (descriere greșită pe pagină): pentru 804MUM blocul spune «linia ei nu e încă în schelet».**
- Returul nevăzut e pe R22, care e în schelet.
- Scenariu: Ion citește fraza și cere să se adauge linia în schelet. Linia e deja acolo. Adevărata cauză rămâne nediagnosticată:
  returul s2 ratat după mutarea VEST → EST, la fel la 144BRAZ pe R38.
- Corecția: fraza se ia din linia etichetată, dacă ea are etalon.
  - «linia nu e în schelet» — doar când linia cursei n-are E;
  - altfel «cursa nu s-a putut tăia — de lămurit».
- Tot aici, eticheta `lin` din `cursaNedetectata` e linia bucății, nu a cursei: 744ARF → «R19 Bilicenii Vechi», deși turul e pe
  R13. Nu trebuie folosită ca linia cursei.

**L1 — low, −0,5:** la 186OMM, cu două linii, fraza pune R1a (282) pe «linia R3 · Nihoreni, până la capăt și înapoi».
Corecția: la mai multe linii, «liniile R4 · Grinăuți (dimineața) și R3 · Nihoreni (seara)».

**L2 — low, −0,5:** la 744ARF, «retur pe la 15:35» apare într-o singură zi din 5, dar fraza începe cu «în 5 zile din 5».
Corecția: pe fiecare sens, câte zile («tur pe la 06:04 în 5 zile, retur pe la 15:35 într-o zi»).

**L3 — low, −0,5:** §12.1 nou trimite la «mașinile care dorm în Bălți (7.4)», iar 7.4 cuprinde și nopțile la parc sau la uzină.
Blocul filtrează însă doar `casaKmPoarta ≤ 3`. Mașinile cu casa departe care dorm uneori la parc (727CWN, 830MUM) nu apar.
Pe 14.09 zilele acelea erau oricum excluse. Corecția: ori textul spune «casa la ≤ 3 km», ori blocul ia și mașinile cu nopți în zonă.

**Scor: 10 − 1,0 − 1,0 − 1,0 − 0,5 − 0,5 − 0,5 = 5,5. Blocante (critical/high): 0.**

## Ce lipsește înainte de aplicare (ordinea din runda 3: migrația → cod VPS → rândul 14.09 rescris → push)

1. În migrația 413, sensul exact din cod scris în `$na86$` (M1); lungimea și md5-ul de ieșire se recalculează. Abia apoi se aplică,
   cu fapt `kind=migration`.
2. Pe VPS, codul se pune în producție înainte de luni 07:30 sau după 09:30. Luni 28.09 la 08:00 lanțul rulează săptămâna 21.09.
3. În `drax-balti.ts`, fraza de la 804MUM (M3), cea cu două linii (L1) și numărul de zile pe sens (L2), plus un test pe fixture
   cu 804MUM și 186OMM.
4. Întrebări pentru Ion:
   - 293QVT, 14–17.09: pleacă de la poarta EST la 15:56 prin Cubolta și Moara de Piatră. E un retur s1 cu oameni? (M2)
   - 804MUM și 144BRAZ: returul s2 după mutarea VEST → EST de la ~00:10 — e cursa lor obișnuită? (diagnostic, M3)
