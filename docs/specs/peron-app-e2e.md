---
kit: spec
name: peron-app-e2e
title: Test automat cap-coadă pentru aplicația de peron, după regulile botului
created: 2026-09-08
sessions:
  - id: S01
    title: Supabase fals în memorie + fixture-urile zilei (curse, operatori, șoferi, auto, repartizări, reclamă)
    gates: [build-bot, test-bot]
    approve: []
  - id: S02
    title: Scenariul cap-coadă Chișinău prin API, comparat pas cu pas cu ce scrie botul
    gates: [build-bot, test-bot]
    approve: []
  - id: S03
    title: Bălți, raportul de seară, ștergerea la 30 de zile și contractul cu aplicația
    gates: [build-bot, test-bot, typecheck-app]
    approve: []
  - id: S04
    title: Verificare — toate testele într-o rulare, raport cu ce e acoperit și ce nu
    gates: [build-packages, build-bot, test-bot, typecheck-app]
    approve: []
---

# Test automat cap-coadă pentru aplicația de peron, după regulile botului

## De ce

Aplicația Android (`peron-android/`) și API-ul ei din bot (`apps/bot/src/api/`) au fost
construite azi (spec `peron-app-android.md`) și au doar teste pe funcții pure. Ion
(08.09): «fă test automat la toată aplicația, reieșind cum lucram înainte prin bot».
Vrem o rulare automată care joacă ziua întreagă a operatorului prin API exact așa cum
o făcea în bot (`apps/bot/src/conversations/report.ts`, `cleaningPhotos.ts`) și verifică
că în tabele ajunge același lucru, fără să atingă baza de producție, Telegram sau
modelul. Rulează cu `npm run test --workspace=apps/bot`, în câteva secunde, și rămâne
plasa de siguranță pentru orice schimbare viitoare.

## Decizii fixate înainte de start

- **Nicio conexiune reală.** Testele înlocuiesc prin `vi.mock` trei module: `../supabase.js`
  (client Supabase fals în memorie), `@anthropic-ai/sdk` (model fals cu răspuns
  configurabil per test) și `./adminAlert.js` / `../services/adminAlert.js` (mesajele
  către admini și API-ul Telegram se capturează în liste). Dacă un test încearcă să
  atingă rețeaua, e bug în fake, nu în test.
- **API-ul se testează prin HTTP real**, nu prin apelul direct al handler-elor:
  `handleAppApi` montat pe `http.createServer` pe port 0, cereri cu `fetch`. Așa se
  verifică și routerul, autentificarea, limitele de corp, codurile de eroare.
- **Etalonul e botul.** Pentru fiecare pas, «gata când» compară rândul din tabel cu ce
  ar fi scris botul: aceleași coloane din `createReport` (`report.ts:720–743`), același
  text de rezumat (`report.ts:848–866`), aceleași efecte (`addViolation`,
  `updateLoadingBoard`, `createReclamaTask`, `autoCloseReclamaTask`, `validateDay`).
  Unde botul are o regulă numerică (0–27 pasageri, 150 m, 10 min întârziere, poarta
  06:55 / 16:25, 5 / 10 min la prezență, 30 de zile), testul o lovește exact la prag.
- **Fixture-urile reproduc ziua reală**, cu orele curselor din baza de producție
  (citite pe 08.09):
  - Chișinău → Bălți (29): 06:55 07:35 08:15 08:50 09:25 10:00 10:30 11:00 11:28 11:55
    12:20 12:45 13:10 13:35 14:00 14:25 14:50 15:15 15:40 16:05 16:25 16:45 17:20 17:50
    18:10 18:30 18:55 19:25 20:00
  - Bălți → Chișinău (29): 05:20 05:30 06:30 06:55 07:35 08:15 08:35 09:00 09:20 09:30
    10:05 10:25 10:50 11:10 11:45 12:10 12:45 13:10 13:55 14:20 15:20 15:45 16:00 16:20
    17:00 18:25 18:40 19:20 20:20
  - operatori: Vitalie (CONTROLLER, CHISINAU, telegram 7115941429), Andrei (CONTROLLER,
    BALTI, 628056510), un ADMIN cu telegram_id pentru alerte; 4 șoferi activi
    interurbani (+1 inactiv, +1 LDE care nu trebuie să apară), 3 auto active (LYY 735,
    998 TCP, 526 WVW); repartizări pentru primele 3 curse din Chișinău; o sarcină reclamă
    deschisă (`obligations`, `source='reclama'`, `reclama_problem='panou_ruta'`,
    `current_state='sent'`) pe LYY 735. Datele sunt inventate în afara orelor și
    numelor de mai sus — fără nume sau numere reale de telefon.
- **Timpul e controlat**: `vi.useFakeTimers()` + `vi.setSystemTime(...)` în ora
  Chișinăului; scenariul principal rulează într-o zi din iunie (sezon A/C), cu ora
  mutată înainte de fiecare cursă, ca `minutesLate` și fereastra de prezență să fie
  deterministe. `getTodayDate()` din `utils.ts` citește ora sistemului, deci nu trebuie
  mock-uit.
- **Fake-ul Supabase** implementează doar ce folosesc serviciile botului (lista se ia
  cu `grep -o "\.\(from\|select\|eq\|neq\|is\|in\|not\|gte\|lte\|gt\|lt\|contains\|order\|limit\|maybeSingle\|single\|insert\|update\|upsert\|delete\|range\)(" apps/bot/src -rh | sort | uniq -c`),
  plus `storage.from(bucket).upload/remove/download/createSignedUrl`. Emulează indexul
  unic al rapoartelor active `(report_date, point, trip_id) where cancelled_at is null`
  (eroare `{ code: '23505' }`), unicitatea `peron_app_sessions.token_hash` și
  `peron_app_link_codes.code`, și `default`-urile de coloane care contează
  (`reports.source = 'bot'`, `created_at = now`, `id` uuid). Orice metodă neimplementată
  aruncă `FakeSupabaseError('neimplementat: .x()')` — mai bine roșu decât tăcere.
- **Modelul fals** întoarce, per apel, JSON-ul dorit de test (`CURAT`, `MURDAR` cu
  probleme, `loc_corect=false`, `persoana_vizibila=false`, sau aruncă) — testele
  verifică că serviciile traduc corect în `CURAT / MURDAR / ALT_LOC / EROARE` și
  `NO_PERSON`.
- Testele noi stau în `apps/bot/src/test/` (fake, fixture, mocks) și
  `apps/bot/src/api/e2e.*.test.ts`. Rămân sub gate-ul existent **test-bot**
  (`npm run test --workspace=apps/bot`), fără script nou. `tsconfig.json` al botului
  exclude deja `src/**/*.test.ts` din build; fișierele din `src/test/` care nu sunt
  `.test.ts` trebuie excluse și ele din build (`exclude: ["src/**/*.test.ts", "src/test/**"]`).
- **Nu se modifică codul de producție** al botului sau al aplicației decât dacă un
  test descoperă un bug real față de regula botului. Atunci: bug-ul se repară minimal,
  se notează în raportul sesiunii ca «bug găsit de test», și testul rămâne.

## Nu intră în scop

- Teste pe telefon (Detox/Maestro) sau pe un emulator Android.
- Teste care lovesc baza de producție, Railway, Telegram sau Anthropic.
- Testarea conversației Telegram din bot (`conversations/*`) — botul e etalonul, nu
  subiectul.
- Schimbarea comportamentului aplicației sau al API-ului (în afara bug-urilor reale).

## Riscuri și necunoscute

- **Query-builder-ul fals poate rata o combinație** folosită undeva (ex. `.or(...)`,
  `.range(...)`). Regula: fake-ul aruncă, sesiunea adaugă metoda. Dacă un serviciu
  folosește RPC (`.rpc(...)`) sau SQL brut, S01 îl marchează în raport și testul
  ocolește acea funcție cu `vi.spyOn`. Nu e HOLD.
- **`loadingBoard.ts` și `dailyDigest.ts` țin stare în Storage** (JSON în bucket).
  Fake-ul de Storage păstrează obiectele în memorie per test; testele de digest
  verifică textul final trimis prin `sendAdminAlert` capturat, nu formatul JSON intern.
- **Timpul fals și `setInterval` din schedulere**: testele nu pornesc schedulerele;
  apelează direct funcțiile (`runPeronPhotoRetention`, `sendCompactDigest`).
- **Un test poate demonstra un bug real în API** (ex. o validare lipsă față de bot).
  Se repară în aceeași sesiune, minimal, cu notă. Dacă repararea cere schimbarea
  specificației aplicației → `HOLD: spec-wrong`.

## Cum înțelegem că totul a reușit

- [ ] `npm run test --workspace=apps/bot` verde, cu ≥ 40 de teste noi în
      `src/api/e2e.*.test.ts` și `src/test/*.test.ts`, în sub 30 de secunde, fără rețea
      (rulat cu `--reporter=verbose` numele testelor citesc ca pașii zilei).
- [ ] Scenariul Chișinău parcurge, în ordine: cod → token → `/day` → poartă DIMINEATA
      (409) → 3 poze de curățenie → poză șofer → raport 06:55 → 20 de curse până la
      16:05 (cu schimbare de repartizare, auto nou, reclamă, reparare confirmată, climă,
      întârziere, locație în afara razei) → poartă ZIUA la 16:25 (409) → set ZIUA →
      restul curselor → `allDone: true` + rând în `day_validations`.
- [ ] Pentru fiecare raport, rândul din `reports` are exact coloanele pe care le-ar
      scrie botul, iar `summary` din răspuns e identic cu textul din
      `report.ts:848–866` pentru aceleași date.
- [ ] Scenariul Bălți: `FULL` → `status 'OK'`, `passengers_count -1`; fără poartă; fără
      poză de șofer; locația cerută și la 06:55.
- [ ] Digestul de seară conține secțiunile de curățenie și prezență cu textele din
      spec-ul aplicației; alertele capturate în timpul zilei sunt doar cele pe care le
      trimite și botul (sarcina reclamă), nimic de prezență.
- [ ] Retenția: pozele și ping-urile mai vechi de 30 de zile sunt șterse din Storage-ul
      fals și marcate; cele de 29 de zile rămân.
- [ ] Contractul cu aplicația: JSON-ul real întors de `/day` și `/report` în test e
      salvat ca fixture în `peron-android/src/__fixtures__/` și `typecheck-app` îl
      acceptă ca `DayResponse` / `ReportResponse`.
- [ ] Niciun fișier de producție schimbat în afara bug-urilor notate; `git status` curat.

---

## S01 — Supabase fals în memorie + fixture-urile zilei

**Scop:** există un client Supabase fals, testat, și o zi de fixture-uri identică cu cea
din producție, pe care celelalte sesiuni pot rula orice serviciu al botului fără rețea.

**Pași:**
1. Inventariază metodele folosite: rulează grep-ul din «Decizii» și listează-le în
   antetul fișierului fake-ului.
2. `apps/bot/src/test/fakeSupabase.ts`: `createFakeSupabase(seed: Seed)` → obiect cu
   `from(table)` (query-builder lazy, evaluat la `await` / `.then`), `storage.from(bucket)`
   (`upload`, `remove`, `download` → Blob cu `.text()`, `createSignedUrl`), și
   `_tables` / `_storage` pentru asserții. Filtre suportate: `eq neq is in not gte lte
   gt lt contains like ilike`, `order`, `limit`, `range`, `maybeSingle`, `single`
   (eroare `PGRST116` la 0 rânduri, ca Supabase), `insert` (obiect sau listă, cu
   `.select().single()`), `update().eq()`, `upsert({onConflict})`, `delete().eq()`.
   Unicități și default-uri din «Decizii». `count: 'exact', head: true` întoarce
   `count`.
3. `apps/bot/src/test/fixtures.ts`: `seedDay(date: 'YYYY-MM-DD')` → `Seed` cu tabelele
   din «Decizii»: `users`, `trips` (cu `direction` = `POINT_DIRECTION_MAP[point]`,
   `route_name`, `crm_route_id` setat la Chișinău ca să existe repartizări), `drivers`,
   `vehicles`, `daily_assignments`, `obligations`, `bot_storage` (gol), plus tabelele
   goale `reports`, `day_validations`, `peron_app_link_codes`, `peron_app_sessions`,
   `peron_cleaning_checks`, `driver_appearance_checks`, `peron_presence_pings`,
   `obligation_attempts`, `report_photos`. Verifică cu `getAllTripsForDirection`,
   `getActiveDrivers` (nu apar inactivul și LDE-ul), `getAssignmentForTrip`,
   `getOpenReclamaTask('LYY 735')` din `services/db.ts` — rulate peste fake.
4. `apps/bot/src/test/mocks.ts`: `installMocks()` care face `vi.mock` pentru
   `../supabase.js` (→ fake-ul curent), `@anthropic-ai/sdk` (clasă cu
   `messages.create` care întoarce `nextModelAnswer()` setat de test; refuz și excepție
   configurabile), `./adminAlert.js` (`sendAdminAlert` → push în `alerts[]`,
   `getBotApi()` → obiect cu `sendMessage`/`editMessageText`/`pinChatMessage` care
   capturează în `telegram[]`, `getAdminChatIds()` → set fix). Expune `reset()`.
   Atenție la calea relativă: `vi.mock` se face în fișierul de test cu calea relativă
   la acel fișier; `mocks.ts` exportă factory-urile, iar fiecare test le montează.
5. `apps/bot/src/test/fakeSupabase.test.ts`: ≥ 8 teste (filtre, single/maybeSingle,
   23505 pe raport duplicat activ, upsert onConflict, storage upload/remove, count).
6. `apps/bot/tsconfig.json`: exclude `src/test/**` din build.

**Fișiere:** `apps/bot/src/test/fakeSupabase.ts`, `fixtures.ts`, `mocks.ts`,
`fakeSupabase.test.ts`, `apps/bot/tsconfig.json`.

**Gata când:** `npm run build --workspace=apps/bot` verde și `dist/` nu conține `test/`;
`npm run test --workspace=apps/bot` verde cu testele noi; `getActiveDrivers()` peste
fake întoarce exact 4 șoferi; `getOpenReclamaTask('LYY 735')` întoarce sarcina din seed.

**Gate-uri:** build-bot, test-bot.

**Nu atinge:** `apps/bot/src/api/*`, `apps/bot/src/services/*` (doar citire),
`conversations/*`, `peron-android/`.

---

## S02 — Scenariul cap-coadă Chișinău prin API, comparat pas cu pas cu ce scrie botul

**Depinde de:** S01 — fake, fixture, mocks.

**Scop:** o rulare de test joacă toată ziua lui Vitalie prin `/app/v1/*` și demonstrează
că tabelele și efectele sunt cele pe care le-ar produce botul.

**Pași:**
1. `apps/bot/src/test/server.ts`: `startApi()` → `http.createServer((req,res) =>
   handleAppApi(req,res))` pe port 0, `api(method, path, body?, token?)` cu `fetch`,
   `stop()`.
2. `apps/bot/src/api/e2e.chisinau.test.ts`, `describe` pe pași, `beforeAll` cu
   `vi.setSystemTime('2026-06-10T06:20:00+03:00')` (miercuri, sezon A/C):
   - **Cod și token:** inserează în fake `peron_app_link_codes` codul `482913` pentru
     Vitalie (expiră +24h) → `POST auth/link` → 200 cu token de 64 hex; același cod
     din nou → 401 `BAD_CODE`; cod expirat → 401; `GET day` fără Bearer → 401; cu
     token → 200.
   - **`/day` la 06:20:** 29 curse, prima `next`, restul `locked`; `assignments` pentru
     3 curse; `drivers` 4, `vehicles` 3; `openReclama['LYY 735']` prezent; `climate`
     `'ac'` pentru fiecare auto; `cleaning.DIMINEATA = []`; `cleaningGateTripTime
     '16:25'`; `presenceWindow` `{ from: '06:25', to: '20:30' }`; `locationExemptTimes
     ['06:55','20:00']`.
   - **Poarta de dimineață:** `POST report` pe 06:55 → 409 `CLEANING_REQUIRED`
     `{ slot: 'DIMINEATA', missing: ['PERON','PIETONI','VECEU'] }`.
   - **Curățenie:** `cleaning-photo` PERON cu model → CURAT; PIETONI cu `loc_corect=false`
     → `ALT_LOC` și zona rămâne deschisă în `/day`; PIETONI din nou → MURDAR cu 2
     probleme; VECEU cu modelul aruncând → `EROARE` (zona se închide). Verifică
     `peron_cleaning_checks` (4 rânduri, `source='app'`, `storage_key` sub
     `curatenie/2026-06-10/DIMINEATA/`), obiectele în Storage-ul fals, și `/day` →
     `cleaning.DIMINEATA` are 3 zone.
   - **Poza șoferului:** `report` pe 06:55 fără `driverCheckId` → 400
     `DRIVER_PHOTO_REQUIRED`; `driver-photo` cu `persoana_vizibila=false` → 200
     `NO_PERSON`, fără rând; cu verdicte `uniforma=true, aspect=false` → rând în
     `driver_appearance_checks` cu `*_model` și `driverCheckId`.
   - **Raport 06:55** (confirmă repartizarea, 12 pasageri, `uniformOk: true,
     exteriorOk: true` — operatorul a corectat verdictul modelului — restul OK,
     `acStatus: 'works'`, fără coordonate): 200; rândul din `reports` are
     `report_date, point, trip_id, driver_id, vehicle_id, status 'OK',
     passengers_count 12, exterior_ok true, uniform_ok true, loading_help_ok true,
     auto_curat true, reclama_ok true, reclama_problem null, wash_grade null,
     ac_status 'works', heat_status null, location_ok null` (06:55 e exceptată),
     `source 'app'`, `driver_check_id`, `created_by_user` = Vitalie;
     `driver_appearance_checks.uniform_ok/groomed_ok` = valorile confirmate;
     `summary` egal cu `☑ 06:55 — 12 pas. | Ion M. · ` … construit cu aceeași funcție
     ca botul (verifică literal textul, inclusiv `⚠ aspect` dacă `exteriorOk` e false
     într-un al doilea caz); loading board: `telegram[]` conține un `sendMessage`
     sau `editMessageText` cu «06:55».
   - **Ordinea:** `report` pe 08:15 → 409 `NOT_NEXT`; 06:55 din nou → 409
     `ALREADY_REPORTED`.
   - **07:35 cu schimbare:** `assignmentChanged: true`, alt șofer, `POST vehicle
     { plate: 'ABC 123' }` → auto nou → raport cu el → `daily_assignments` pentru
     07:35 are noul șofer/auto; `/day` nu mai listează șoferul și auto folosite.
   - **08:15 cu reclamă:** LYY 735 are sarcină deschisă `panou_ruta`; raport cu
     `reclamaOk: false, reclamaProblem: 'bus'` → `obligations` primește o sarcină nouă
     doar pentru `bus` (dedup pe componente, ca `createReclamaTask`), `alerts[]` sau
     `telegram[]` conține notificarea către executor; apoi **08:50** cu același auto,
     `reclamaOk: true, reclamaRepairConfirmed: true, reclamaTaskId` = sarcina
     `panou_ruta` → `current_state` devine `cancelled` (nu există raport al
     executorului) — aceeași regulă ca `autoCloseReclamaTask`.
   - **Climă o dată pe lună:** după raportul cu `ac_status`, `/day` → `climate[auto]`
     e `null` pentru acel auto.
   - **Locație și întârziere:** raport 09:25 cu coordonate la ~400 m de
     `config.stations.CHISINAU` → `location_ok false` și `alerts`/digest primește
     încălcare de locație; raport 10:00 trimis cu ora sistemului la 10:12 → `late 12`,
     încălcare de întârziere; 10:30 la 50 m și la timp → `location_ok true`, fără
     încălcare. Verifică la final prin `sendCompactDigest()` că digestul numără 2
     încălcări la Chișinău (locație 1, întârziere 1).
   - **Absent:** 11:00 `status 'ABSENT'` fără poză și fără cifră → rând cu
     `passengers_count null` și câmpurile de calitate `null`; `summary` `☑ 11:00 — absent`.
   - **Restul până la 16:05** în buclă, cu poză de șofer pentru fiecare, 0–27 pasageri
     (inclusiv 0 și 27; 28 → 400).
   - **Poarta de zi:** 16:25 → 409 `CLEANING_REQUIRED` `{ slot: 'ZIUA', … }`; set ZIUA
     din 3 poze CURAT; 16:25 → 200.
   - **Sfârșit de zi:** 20:00 → răspuns `allDone: true`, `day_validations` are rândul
     lui Vitalie pe 2026-06-10; `/day` → toate `done`.
   - **Prezență:** `POST presence` cu 3 loturi (în zonă 06:25–12:38, în afara razei
     12:40–13:05, fără ping 17:10–17:18, restul în zonă) → `accepted` corect,
     ping-uri din afara ferestrei ignorate; `sendCompactDigest()` la
     `2026-06-10T20:30` → textul conține «Prezență în zona de lucru», rândul lui
     Vitalie cu «lipsă 12:40–13:05 (25 min)» și «fără semnal 17:10–17:18 (8 min)», și
     secțiunea de curățenie cu `pietoni MURDAR (…)` pe dimineață.
3. Orice diferență față de bot găsită aici se repară în cod (minimal) și se notează.

**Fișiere:** `apps/bot/src/test/server.ts`, `apps/bot/src/api/e2e.chisinau.test.ts`
(+ eventual corecții minime în `apps/bot/src/api/*` sau `services/*`, notate).

**Gata când:** test-bot verde cu ≥ 30 de teste noi în fișierul e2e; `npm run test
--workspace=apps/bot -- --reporter=verbose 2>&1 | grep -c "✓"` ≥ 100 în total; nicio
cerere reală (fake-ul nu are `fetch`; `vi.mock` acoperă SDK-ul); build-bot verde.

**Gate-uri:** build-bot, test-bot.

**Nu atinge:** `conversations/*`, `peron-android/`, migrațiile.

---

## S03 — Bălți, raportul de seară, ștergerea la 30 de zile și contractul cu aplicația

**Depinde de:** S01, S02.

**Scop:** fluxul scurt din Bălți, digestul complet, retenția și potrivirea dintre
răspunsurile reale ale API-ului și tipurile din aplicație sunt acoperite de teste.

**Pași:**
1. `apps/bot/src/api/e2e.balti.test.ts`: cod pentru Andrei → token; `/day` → 29 de
   curse Bălți, `assignments {}`, `drivers []`, `vehicles []`, `climate {}`,
   `cleaning` gol, `cleaningGateTripTime null`, `locationExemptTimes []`, `allowFull
   true`, `presenceWindow { from: '04:50', to: '20:50' }`; raport 05:20 fără coordonate
   → `location_ok false` + încălcare (la Bălți nu există excepții); `FULL` la 05:30 →
   `status 'OK'`, `passengers_count -1`, `summary` «☑ 05:30 — microbuz complet»;
   `FULL` trimis de Vitalie (Chișinău) → 400; raport Bălți cu `driverCheckId` sau
   câmpuri de calitate → ignorate, scrise `null`; `cleaning-photo` de la Andrei → 403;
   loading board-ul Bălți primește mesaj.
2. `apps/bot/src/api/e2e.digest.test.ts`: o zi cu ambele puncte → `sendCompactDigest()`
   → un singur mesaj cu: linia de încălcări per punct (formatul existent), secțiunea
   «🧹 Curățenie Chișinău» cu ambele ture, secțiunea de prezență cu ambii operatori
   (Andrei «toată tura în zonă», Vitalie cu perioade și «urmărire pornită abia la
   HH:MM» când primul ping e la 06:50). Fără digest → `false` când nu e nimic.
3. `apps/bot/src/api/e2e.retention.test.ts`: seed cu poze de curățenie și de șofer la
   29 și 31 de zile în urmă și ping-uri la fel → `runPeronPhotoRetention()` →
   Storage-ul fals a primit `remove` doar pentru cele de 31 de zile, `photo_deleted_at`
   setat doar pe ele, ping-urile de 31 de zile șterse, cele de 29 rămase; a doua rulare
   nu mai șterge nimic.
4. **Contract cu aplicația:** în S02/S03, după `/day` și `/report` reușite, testul
   scrie JSON-ul real în `peron-android/src/__fixtures__/day.chisinau.json`,
   `day.balti.json`, `report.ok.json` (doar când variabila `WRITE_FIXTURES=1`;
   fișierele se commit-ează). În `peron-android/src/contract.test.ts` (node:test,
   rulat de `npm test` al aplicației) și în `peron-android/src/contract.d.ts`:
   `const d: DayResponse = dayChisinau` etc. — `typecheck-app` pică dacă tipurile
   aplicației nu mai corespund API-ului.

**Fișiere:** `apps/bot/src/api/e2e.balti.test.ts`, `e2e.digest.test.ts`,
`e2e.retention.test.ts`, `peron-android/src/__fixtures__/*.json`,
`peron-android/src/contract.test.ts`, `peron-android/src/contract.d.ts` (sau `.ts`
inclus în `tsc`), `peron-android/tsconfig.json` dacă trebuie `resolveJsonModule`.

**Gata când:** test-bot verde cu ≥ 15 teste noi; `cd peron-android && npx tsc --noEmit`
verde cu fixture-urile importate; `cd peron-android && npm test` verde; ștergerea unei
proprietăți obligatorii din `DayResponse` în `types.ts` face `tsc` să pice (verificat
și revenit).

**Gate-uri:** build-bot, test-bot, typecheck-app.

**Nu atinge:** `conversations/*`, migrațiile, ecranele aplicației (`app/*`).

---

## S04 — Verificare

**Depinde de:** S01–S03.

**Scop:** dovada că rularea completă e verde, rapidă și fără rețea, plus lista onestă a
ce NU e acoperit.

**Pași:**
1. Rulează gate-urile din frontmatter; roșu = repari aici.
2. `time npm run test --workspace=apps/bot` → notează durata (țintă < 30 s) și numărul
   total de teste.
3. Rulează testele cu rețeaua tăiată la nivel de proces: `node --dns-result-order=ipv4first`
   nu e suficient — folosește `HTTPS_PROXY=http://127.0.0.1:9 HTTP_PROXY=http://127.0.0.1:9`
   și, în plus, un `beforeAll` global (`apps/bot/vitest.setup.ts`, în `setupFiles`) care
   înlocuiește `globalThis.fetch` cu o funcție care aruncă pentru orice URL în afara
   `127.0.0.1` — testele e2e folosesc serverul local, orice altceva e o scurgere.
4. Compară lista de pași din «Cum înțelegem…» cu testele existente (`--reporter=verbose`);
   fiecare punct primește numele testului care îl acoperă.
5. Scrie `docs/specs/peron-app-e2e.verificare.md`: tabelul gate-urilor, durata,
   acoperirea pe pași, bug-urile găsite de teste (dacă au fost), și «Neacoperit»:
   ecranele aplicației pe telefon, camera reală, GPS-ul real în fundal, modelul real.
6. `git status` curat; nimic în `.env*`, `.claude/`, `apps/web`, `apps/voice-llm`.

**Fișiere:** `apps/bot/vitest.setup.ts`, `apps/bot/vitest.config.ts` (`setupFiles`),
`docs/specs/peron-app-e2e.verificare.md`.

**Gata când:** toate gate-urile verzi într-o singură rulare; raportul există, cu durata
și numărul de teste; testele pică demonstrabil dacă `fetch` spre exterior e permis
(verificat o dată prin comentarea gardului și revenit).

**Gate-uri:** build-packages, build-bot, test-bot, typecheck-app.

**Nu atinge:** nimic în afara corecțiilor pentru gate-uri.
