---
kit: spec
name: peron-app-driver-verdict
title: Poza șoferului — aplicația fixează verdictul, operatorul doar face poza (încălțăminte → cap)
created: 2026-09-08
sessions:
  - id: S01
    title: Bot — modelul decide uniforma, încălțămintea și bărbieritul; serverul ignoră verdictele venite din aplicație; testele e2e actualizate
    gates: [build-bot, test-bot]
    approve: []
  - id: S02
    title: Aplicația — verdictele doar se afișează, cadrul de poză «de la încălțăminte până la cap», refacere când nu se vede tot
    gates: [typecheck-app]
    approve: []
---

# Poza șoferului — aplicația fixează verdictul, operatorul doar face poza

## De ce

Ion (08.09, seara): «aplicația nu propune, aplicația fixează; Vitalic nimic nu fixează,
el doar va face poza ca să se vadă încălțămintele și capul, să se înțeleagă dacă șoferul
este sau nu bărbierit». Azi aplicația arată verdictele modelului ca propunere, operatorul
le poate răsturna cu o atingere, iar serverul scrie în `reports` ce a confirmat
operatorul. Ținta: verdictul modelului e final; operatorul are un singur rol, poza
corectă.

## Decizii fixate înainte de start

- **Cadrul obligatoriu:** șoferul din față, întreg, de la încălțăminte până la cap, în
  picioare. Modelul răspunde `cadru_complet: boolean`; dacă e `false` (nu se văd
  încălțămintea și capul, e din spate, e tăiat), serverul întoarce 200 cu
  `code: 'REFA_POZA'` și `message` cu ce lipsește, nu inserează nimic, șterge fișierul.
  `NO_PERSON` (nimeni în cadru) rămâne, cu același tratament.
- **Ce decide modelul**, trei verdicte booleene:
  - `uniforma` — îmbrăcăminte de serviciu TRANSLUX (`config.DRIVER_UNIFORM_DESCRIPTION`)
    **și încălțăminte corespunzătoare** (pantofi sau ghete închise, curate; nu șlapi,
    nu sandale, nu papuci);
  - `barbierit` — bărbierit sau barbă îngrijită, scurtă și egală (barbă de câteva zile
    neîngrijită = `false`);
  - `aspect_ingrijit` — păr aranjat, haine curate, fără pete, fără haine mototolite.
  - plus `descriere`: o propoziție în română cu ce se vede (ex: «cămașă albă TRANSLUX,
    pantofi negri, bărbierit»).
- **Maparea pe `reports`** (coloanele botului rămân): `uniform_ok = uniforma`,
  `exterior_ok = barbierit && aspect_ingrijit`. Tabela `driver_appearance_checks`:
  `uniform_ok_model = uniforma`, `groomed_ok_model = barbierit && aspect_ingrijit`,
  `uniform_ok` / `groomed_ok` = **aceleași valori** (nu mai există confirmare), iar
  `description` păstrează și cele trei verdicte brute ca text
  («uniformă: da · bărbierit: nu · aspect: da · …»). Fără migrație.
- **Serverul ignoră** `uniformOk` / `exteriorOk` din corpul lui `POST /app/v1/report`
  (le acceptă ca să nu spargă clienți vechi, dar scrie valorile din
  `driver_appearance_checks` ale `driverCheckId`). La `EROARE` (modelul n-a răspuns)
  raportul se scrie cu `uniform_ok = null`, `exterior_ok = null` — nu se inventează.
- **Aplicația** afișează verdictele ca text fix, nu ca butoane: «Uniformă: da/nu»,
  «Bărbierit: da/nu», «Aspect îngrijit: da/nu», verde/roșu, fără atingere; sub ele
  «Verdict automat din poză». Singurele acțiuni: «Fă poza» / «Refă poza». Hint-ul
  camerei: «Șoferul din față, întreg: să se vadă încălțămintea și capul».
- **Textul rezumatului** rămâne al botului (`⚠ uniformă`, `⚠ aspect`) — nu se schimbă.
- Testele e2e existente (`apps/bot/src/api/e2e.chisinau.test.ts`) se actualizează: unde
  verificau că operatorul poate răsturna verdictul, acum verifică că serverul scrie
  verdictul modelului chiar dacă aplicația trimite altceva.

## Nu intră în scop

- Migrații. Modificarea criteriilor de curățenie. Bălți (n-are poză de șofer).

## Riscuri și necunoscute

- Uniforma reală nu e descrisă încă (`DRIVER_UNIFORM_DESCRIPTION`); până o dă Ion,
  modelul judecă după haine de serviciu cu însemne TRANSLUX. Nu e HOLD.
- Un verdict greșit al modelului nu mai poate fi corectat de operator; adminul îl vede
  în raportul de seară și în `reports`. Asta e decizia lui Ion.

## Cum înțelegem că totul a reușit

- [ ] `analyzeDriverPhoto` întoarce `cadru_complet`, `uniforma`, `barbierit`,
      `aspect_ingrijit`, `descriere`; prompt-ul cere explicit cadrul încălțăminte → cap.
- [ ] `POST /driver-photo` cu `cadru_complet=false` → 200 `REFA_POZA`, fără rând.
- [ ] `POST /report` cu `uniformOk: true` când modelul a zis `uniforma=false` → rândul
      din `reports` are `uniform_ok = false`.
- [ ] În aplicație nu există niciun `onPress` pe verdicte; textul «Verdict automat din
      poză» și hint-ul camerei există.
- [ ] test-bot, build-bot, typecheck-app, `npm test` (app) verzi.

---

## S01 — Bot

**Scop:** modelul decide, serverul scrie decizia modelului, testele o dovedesc.

**Pași:**
1. `apps/bot/src/services/driverCheck.ts`: prompt și schema conform «Decizii»;
   `parseDriverAnswer` întoarce `{ frameOk, personVisible, uniformOk, shavedOk,
   groomedOk, description }`; `description` compus ca în «Decizii».
2. `apps/bot/src/api/driverPhoto.ts`: `frameOk=false` → 200 `{ ok: true, code: 'REFA_POZA',
   message }` fără insert și cu ștergerea fișierului (ca la `NO_PERSON`); răspunsul de
   succes conține `uniformOk`, `shavedOk`, `groomedOk`, `description`, `driverCheckId`.
3. `apps/bot/src/api/report.ts` + `reportRules.ts`: valorile pentru `uniform_ok` /
   `exterior_ok` vin din `driver_appearance_checks` (`uniform_ok_model`,
   `groomed_ok_model`), nu din corp; la verdicte `null` → `null`. Nu mai există
   `confirmDriverAppearance` pe acest drum (funcția poate rămâne, nefolosită).
4. Teste: `driverCheck.test.ts` (parsare, cadru incomplet), `e2e.chisinau.test.ts`
   (cazurile de mai sus; scenariul «operatorul corectează verdictul» devine «serverul
   ignoră ce trimite aplicația»).

**Fișiere:** `apps/bot/src/services/driverCheck.ts`, `apps/bot/src/api/driverPhoto.ts`,
`report.ts`, `reportRules.ts`, testele.

**Gata când:** build-bot, test-bot verzi; `grep -n "cadru_complet" apps/bot/src/services/driverCheck.ts` ≥ 1.

**Gate-uri:** build-bot, test-bot.

**Nu atinge:** `conversations/*`, `peron-android/`, migrații.

---

## S02 — Aplicația

**Depinde de:** S01 — forma nouă a răspunsului `/driver-photo`.

**Scop:** operatorul face poza și vede decizia; nu poate schimba nimic.

**Pași:**
1. `peron-android/src/types.ts`: răspunsul `/driver-photo` cu `shavedOk`, `code:
   'REFA_POZA' | 'NO_PERSON'`.
2. `app/trip/[id].tsx`: cardul «Poza șoferului · verdict automat» cu trei rânduri fixe
   (Uniformă, Bărbierit, Aspect îngrijit), fără `onPress`; la `REFA_POZA` / `NO_PERSON`
   mesajul serverului + «Refă poza»; `buildReport` trimite `uniformOk` / `exteriorOk`
   din verdictul modelului (serverul le ignoră oricum).
3. `src/camera.tsx` / hint: «Șoferul din față, întreg: să se vadă încălțămintea și capul».
4. Testele `buildReport` actualizate.

**Fișiere:** `peron-android/src/types.ts`, `app/trip/[id].tsx`, `src/buildReport.ts`
(+ test), `src/camera.tsx`.

**Gata când:** typecheck-app, `npm test` verzi; `grep -n "onPress" app/trip/[id].tsx`
nu conține nimic legat de verdicte; textul «Verdict automat din poză» există.

**Gate-uri:** typecheck-app.

**Nu atinge:** `apps/*`, ecranele de curățenie și zi.
