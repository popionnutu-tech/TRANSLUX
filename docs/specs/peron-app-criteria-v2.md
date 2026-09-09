---
kit: spec
name: peron-app-criteria-v2
title: Criteriile AI după interviul cu Ion (09.09) + o poză de șofer pe zi
created: 2026-09-09
sessions:
  - id: S01
    title: Bot — criteriile noi pentru șofer și curățenie, poza șoferului valabilă toată ziua, /day expune pozele de azi
    gates: [build-bot, test-bot]
    approve: []
  - id: S02
    title: Aplicația — refolosește poza de azi a șoferului, hint-uri actualizate
    gates: [typecheck-app]
    approve: []
---

# Criteriile AI după interviul cu Ion (09.09) + o poză de șofer pe zi

## De ce

Interviul de descoperire cu Ion (09.09.2026, 10:40–10:55) a fixat exact ce înseamnă
«uniformă», «aspect», «murdar» și cum se tratează vremea rea și cazurile-limită. Tot
atunci a decis că poza șoferului se face **o dată pe zi per șofer**, nu la fiecare
cursă. Promptul actual e mai strict decât vrea el (doar tricou, încălțăminte închisă,
fără toleranță la vreme) și cere poză la fiecare cursă.

## Decizii fixate înainte de start (răspunsurile lui Ion, literal)

**Șofer**
- Uniformă: «tricoul vișiniu, sau cămașă albă ori albastru-deschis într-o singură
  culoare (cămășile băgate în pantaloni)». Deci `uniforma = true` dacă poartă tricoul
  vișiniu (bordo) cu emblema TRANSLUX **sau** o cămașă albă / bleu, uni (fără model,
  fără carouri), băgată în pantaloni. Cămașă în carouri, tricou de altă culoare, cămașă
  scoasă din pantaloni = `false`.
- Încălțăminte: «fără șlapi, restul se poate, să fie curat». Șlapi (papuci de plajă,
  flip-flops) = `uniforma false`. Sandale, pantofi, adidași, ghete = OK dacă sunt curate;
  încălțăminte vizibil murdară (noroi, praf gros) = `uniforma false`.
- Bărbierit: «bărbierit sau barbă îngrijită» (neschimbat): barbă scurtă, egală, tunsă =
  OK; barbă de câteva zile neregulată = `barbierit false`.
- Aspect neîngrijit = «haine rupte, murdare sau pantaloni scurți»: blugi rupți, pete
  vizibile, haine mototolite rău, pantaloni scurți → `aspect_ingrijit false`. Culoarea
  pantalonilor nu contează.
- Șapcă, ochelari de soare, mască: «toate sunt OK» — nu cer refacerea; se judecă ce se
  vede (barba se judecă dacă se vede; cu mască, `barbierit` = true implicit, cu
  mențiune în descriere).
- Poză neclară (contralumină, mișcată, prea departe): «cere refacerea, ca la cadru
  incomplet» → `cadru_complet false` cu motivul în descriere.
- Șofer absent / refuză poza: «nu se poate trimite deloc fără poză» — neschimbat.
- Frecvență: «o dată pe zi per șofer». Prima poză acceptată a zilei pentru un șofer
  e valabilă la toate cursele lui din ziua aceea, indiferent de operator.

**Curățenie**
- Prag: «vizibil nemăturat = murdar; praful fin din rosturi nu». Nisip, pietriș, frunze,
  mucuri, hârtii vizibile pe pavaj = murdar; praful din rosturile pavelelor e normal.
- Vreme rea: «toleranță pe vreme rea». Dacă în poză se vede că plouă / a plouat / e
  furtună / e toamnă cu frunze căzând (pavaj ud, băltoace, frunze proaspete în cădere),
  frunzele proaspete și noroiul adus de ploaie **nu** se penalizează; gunoiul, mucurile,
  ambalajele, resturile, coșul plin, conul răsturnat, afișele — da. Modelul scrie în
  descriere că a aplicat toleranța de vreme.
- Zona pietoni: buruienile la stâlp, afișele lipite, conul răsturnat sau lipsă rămân
  «murdar» («da, toate trei»).
- Veceu: «podea, vas, chiuvetă murdare; coș plin; fără hârtie» = murdar; petele vechi
  de pe faianță nu contează.

**Tehnic (decise de mine)**
- Schema răspunsului modelului pentru șofer rămâne aceeași (`cadru_complet`,
  `persoana_vizibila`, `uniforma`, `barbierit`, `aspect_ingrijit`, `descriere`); se
  schimbă doar promptul și `DRIVER_UNIFORM_DESCRIPTION` din `config.ts`.
- Schema pentru curățenie rămâne; promptul primește regula de prag și cea de vreme.
- `/day` întoarce `driverChecks: { [driverId]: { id, uniformOk, groomedOk, shavedOk?,
  at: 'HH:MM' } }` — prima poză acceptată de azi per șofer (din
  `driver_appearance_checks` cu `driver_id` setat și `person_visible = true`). Serverul
  acceptă la `/report` orice `driverCheckId` de azi al șoferului ales (deja e «pe zi»).
- `POST /driver-photo` primește deja `driverId` și îl scrie în `driver_id`; dacă
  lipsea, se completează. Fără migrație.
- Aplicația: la alegerea șoferului, dacă `driverChecks[driverId]` există → cardul pozei
  arată verdictele de azi cu textul «Poză făcută azi la HH:MM» și butonul «Refă poza»
  (opțional); «Pregătit» nu mai cere poză nouă. Altfel, ca acum.
- Testele e2e: se adaugă cazul «a doua cursă cu același șofer, fără poză nouă → 200».

## Nu intră în scop

- Schimbarea tabelelor. Alertă în timpul zilei. Bălți.

## Riscuri și necunoscute

- «Cămașă bleu uni băgată în pantaloni» e o judecată vizuală; modelul poate greși pe
  cămăși cu dungi fine. Verdictul rămâne al modelului (decizia lui Ion); dacă apar
  greșeli repetate, se ajustează promptul.
- Toleranța de vreme se activează doar din ce se vede în poză; o poză făcută la o oră
  după ploaie, cu pavaj uscat, e judecată normal.

## Cum înțelegem că totul a reușit

- [ ] Promptul șoferului conține literal: tricou vișiniu cu emblema TRANSLUX **sau**
      cămașă albă/bleu uni băgată în pantaloni; șlapi = fără uniformă; șapcă/ochelari/
      mască OK; haine rupte, murdare, pantaloni scurți = neîngrijit.
- [ ] Promptul de curățenie conține pragul (praful din rosturi nu) și toleranța de vreme.
- [ ] `/day` întoarce `driverChecks`; e2e: a doua cursă a zilei cu același șofer trece
      fără poză nouă.
- [ ] Aplicația refolosește poza de azi; typecheck și teste verzi.

---

## S01 — Bot

**Pași:**
1. `apps/bot/src/config.ts`: `DRIVER_UNIFORM_DESCRIPTION` = «tricou vișiniu (bordo) cu
   emblema TRANSLUX pe piept, SAU cămașă albă ori bleu, într-o singură culoare (fără
   carouri, fără model), băgată în pantaloni».
2. `apps/bot/src/services/driverCheck.ts`: promptul după «Decizii» (uniformă,
   încălțăminte fără șlapi + curată, bărbierit, aspect, șapcă/ochelari/mască OK, poză
   neclară = cadru_complet false). Testele de parsare rămân.
3. `apps/bot/src/services/cleaningCheck.ts`: promptul după «Decizii» (prag, vreme rea,
   pietoni, veceu). Neschimbat restul.
4. `apps/bot/src/api/day.ts`: `driverChecks` per șofer (prima poză acceptată de azi,
   `driver_id` not null, `person_visible = true`, `uniform_ok_model` not null);
   `services/db.ts`: `getTodayDriverChecks(date)`.
5. `apps/bot/src/api/driverPhoto.ts`: scrie `driver_id` din corp (dacă nu o face deja).
6. Teste: `e2e.chisinau.test.ts` — după prima cursă cu poză pentru șoferul X, `/day`
   are `driverChecks[X]`, iar a doua cursă cu X și același `driverCheckId` → 200 cu
   `uniform_ok` din poză; `driverCheck.test.ts` — promptul conține frazele-cheie
   (test pe string: «șlapi», «cămașă albă», «băgată în pantaloni», «ochelari»).

**Fișiere:** cele de mai sus + teste.

**Gata când:** build-bot, test-bot verzi; `grep -c "șlapi" apps/bot/src/services/driverCheck.ts` ≥ 1;
`grep -c "vreme" apps/bot/src/services/cleaningCheck.ts` ≥ 1.

**Gate-uri:** build-bot, test-bot.

**Nu atinge:** `conversations/*`, `peron-android/`, migrații.

---

## S02 — Aplicația

**Depinde de:** S01 — `driverChecks` în `/day`.

**Pași:**
1. `peron-android/src/types.ts`: `DayResponse.driverChecks`.
2. `app/trip/[id].tsx`: la alegerea/confirmarea șoferului, dacă există `driverChecks[id]`,
   cardul pozei arată verdictele (verde/roșu) + «Poză făcută azi la HH:MM» + «Refă poza»;
   `driverCheckId` se ia de acolo; «Pregătit» activ fără poză nouă. Ciorna salvează
   `driverCheckId` ca până acum.
3. Hint-ul camerei: «Șoferul din față, întreg: să se vadă încălțămintea și capul.
   Șapca și ochelarii sunt în regulă.»
4. `src/buildReport.ts` + teste: nimic nou în corp; test că `driverCheckId` din
   `driverChecks` ajunge în corp.
5. Fixture-ul `peron-android/src/__fixtures__/day.chisinau.json` primește
   `driverChecks: {}` (sau exemplul real din testul e2e, dacă S01 l-a regenerat).

**Fișiere:** `src/types.ts`, `app/trip/[id].tsx`, `src/camera.tsx` (hint),
`src/buildReport.ts` (+ test), `src/__fixtures__/*.json`, `src/contract.ts` dacă e nevoie.

**Gata când:** typecheck-app, `npm test` verzi; `grep -c "Poză făcută azi" "peron-android/app/trip/[id].tsx"` ≥ 1.

**Gate-uri:** typecheck-app.

**Nu atinge:** `apps/*`, ecranele de curățenie și zi.
