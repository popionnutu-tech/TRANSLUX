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
