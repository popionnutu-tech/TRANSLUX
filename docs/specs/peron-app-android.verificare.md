# Aplicația de peron — raportul de verificare (S09, 2026-09-08)

Sesiunea S09 a spec-ului `peron-app-android.md`. Tot ce se putea verifica fără telefon și
fără apeluri pe prod e verificat aici pe cod și pe gate-uri; restul e în secțiunea
«De făcut de Ion pe telefon». Commit-ul verificat: `35df425` (HEAD la momentul rulării).

## 1. Gate-urile (toate într-o singură rulare, 2026-09-08 18:08)

| Gate | Comandă | Rezultat |
|---|---|---|
| build-packages | `npm run build --workspace=packages/db` | ✅ verde |
| build-bot | `npm run build --workspace=apps/bot` | ✅ verde |
| test-bot | `npm run test --workspace=apps/bot` | ✅ 73 teste, 5 fișiere |
| typecheck-admin | `cd apps/admin && npx tsc --noEmit` | ✅ verde |
| test-admin | `npm run test --workspace=apps/admin` | ✅ 555 teste, 43 fișiere |
| typecheck-app | `cd peron-android && npx tsc --noEmit` | ✅ verde |
| (în plus) teste app | `cd peron-android && npm test` | ✅ 18 teste `node:test` |

Nicio corecție nu a fost necesară: toate gate-urile au ieșit verzi din prima.

## 2. Scenariul operatorului, parcurs pe cod

Fiecare pas: fișierul și funcția care îl face. Niciun pas fără implementare.

| # | Pas | Unde |
|---|---|---|
| 1 | Adminul generează codul de 6 cifre la un CONTROLLER din Chișinău/Bălți | `apps/admin/src/app/(dashboard)/users/UsersClient.tsx` — butonul «📱 Cod aplicație» apare doar când `canReceiveLinkCode(user)` (`linkCode.ts`); `actions.ts` → `createPeronAppLinkCode(userId)` inserează în `peron_app_link_codes` cu `expires_at` = +24 h, reîncearcă la coliziune 23505 |
| 2 | Aplicația: ecranul de cod → `POST /app/v1/auth/link` | `peron-android/app/login.tsx` → `link(code, deviceLabel)` din `src/api.ts`; server: `apps/bot/src/api/server.ts` ruta `auth/link` → `auth.ts` → `linkWithCode` (cod inexistent / expirat / folosit / user nepotrivit → 401 `BAD_CODE`; `used_at` marcat atomic cu `.is('used_at', null)`; token 32 octeți hex, în DB doar `sha256`) |
| 3 | Token-ul în SecureStore, permisiunile de locație (fg + bg) | `login.tsx` → `setToken` + `requestPresencePermissions()` (`src/presence.ts`) → `router.replace('/day')` |
| 4 | Orice cerere autentificată: `Authorization: Bearer <token>` | `auth.ts` → `authenticate(req)`: 64 hex, sesiune cu `revoked_at` null, user încă `isPeronUser`, altfel 401; `last_seen_at` cel mult o dată pe minut |
| 5 | `GET /app/v1/day` — curse cu `done/next/locked`, repartizări, șoferi/auto nefolosite, reclame deschise per placă, clima, curățenia pe DIMINEATA/ZIUA, fereastra turei | `api/day.ts` → `getDay(user)`; stările din `dayState.ts` → `tripStates` (prima neraportată = `next`); Bălți primește liste goale + `allowFull: true` |
| 6 | Ecranul zilei: grila ✅/▶/🔒, urmărirea GPS pornită în fereastră, coada de ping-uri golită | `app/day.tsx` → `getDay` + `syncPresenceTracking({date, window, station})` + `flushPresenceQueue()`; fără permisiunea de fundal → cardul «Fără acces la locație în fundal» + «Deschide setările» în locul grilei (nicio cursă nu se deschide) |
| 7 | Atingere pe prima cursă (06:55) fără setul DIMINEATA → aplicația trimite direct la poze | `app/day.tsx` → `openTrip` → `cleaningGateFor(day, trip.id)` (`src/cleaning.ts`, oglinda regulii serverului) → `router.push('/cleaning?slot=DIMINEATA&gate=06:55')` |
| 8 | Serverul impune poarta oricum: `POST /report` pe prima cursă fără set → 409 `CLEANING_REQUIRED` | `api/report.ts` → `postReport` → `cleaningGateSlot(point, allTrips, trip.id)` (`reportRules.ts`: `trips[0]` → DIMINEATA, ora `config.cleaningGateTripTime` = 16:25 → ZIUA, doar CHISINAU) → `cleaningMissing(await getCleaningZonesDone(date, slot))` → `CleaningRequiredError` (409, `details: { slot, missing }`) |
| 9 | `POST /app/v1/cleaning-photo` ×3 (PERON, PIETONI, VECEU) cu camera | `app/cleaning.tsx` → `PhotoCamera confirm` (`src/camera.tsx`, `CameraView`, fără galerie — `grep expo-image-picker\|launchImageLibrary` → nimic) → `postCleaningPhoto`; server: `api/cleaning.ts` → `postCleaningPhoto` (403 `NOT_CHISINAU` la Bălți) → `services/cleaningCheck.ts` → `checkCleaningBuffer({ source: 'app', lat, lon })` (upload în `report-photos/curatenie/<data>/<slot>/<zona>-<ts>.jpg`, `claude-opus-5`, `effort: low`, `json_schema`, promptul neatins) → răspuns `{ verdict, problems, description, zonesDone }` |
| 10 | Verdictele în aplicație: CURAT / MURDAR cu «Informația se stochează și va fi penalizată» / ALT_LOC (rămâne pe zonă) / EROARE (poza salvată, trece mai departe) | `app/cleaning.tsx` → `VerdictCard`; `MURDAR_WARNING` din `src/cleaning.ts`; `done = mergeDone(local, res.zonesDone, zona dacă ≠ ALT_LOC)` |
| 11 | Setul văzut și de bot: aceeași tabelă | `services/db.ts` → `getCleaningZonesDone(date, slot)` citește `peron_cleaning_checks` indiferent de `source`; `conversations/cleaningPhotos.ts` scrie prin `processCleaningPhoto` → același `checkCleaningBuffer` cu `source: 'bot'` |
| 12 | Ecranul de cursă: pasageri, șofer/auto din repartizare, verificări cu OK implicit, clima doar când `/day` o cere, GPS pornit la montare (15 s, apoi ultima poziție ≤ 2 min) | `app/trip/[id].tsx`; logica pură în `src/buildReport.ts` (`initialState`, `blockingReason`, `buildReportBody` — fără `washGrade`); locația în `src/location.ts` → `findLocation` |
| 13 | Poza șoferului → `POST /app/v1/driver-photo` → verdictele propuse, operatorul le răstoarnă cu o atingere | `[id].tsx` → `postDriverPhoto({ tripId, driverId, imageBase64, lat, lon })`; server: `api/driverPhoto.ts` → `postDriverPhoto` → upload `soferi/<data>/<tripId>-<ts>.jpg` → `services/driverCheck.ts` → `analyzeDriverPhoto` (uniforma = `config.DRIVER_UNIFORM_DESCRIPTION`) → `createDriverAppearanceCheck` → `driverCheckId`; `NO_PERSON` → 200 cu `code: 'NO_PERSON'`, fără linie, fișierul scos; aplicația: «Nu se vede șoferul, refă poza» |
| 14 | `POST /app/v1/report` pe 06:55 (setul complet) | `api/report.ts` → `postReport`: `parseReportBody` (OK la Chișinău fără `driverCheckId` → 400 `DRIVER_PHOTO_REQUIRED`; FULL doar la Bălți) → `UNKNOWN_TRIP` 400 / `ALREADY_REPORTED` 409 / `NOT_NEXT` 409 (`nextTripId`) → poarta de curățenie → `driverCheckId` există și e de azi → `computeLocation` (null la 06:55/20:00 Chișinău din `config.chisinauExemptTimes`; fără coordonate → `false`; altfel haversine ≤ 150 m față de `config.stations`) → `createReport(toReportRow(...))` cu `source: 'app'`, `wash_grade: null`, coordonate, `driver_check_id` |
| 15 | Efectele secundare, în ordinea din bot | tot în `postReport`: `confirmDriverAppearance` (verdictele operatorului peste ale modelului, ambele rămân) → `updateAssignmentDriverVehicle` (la `assignmentChanged`) → `addViolation` (locație rea sau > 10 min întârziere) → `updateLoadingBoard` / `updateLoadingBoardBalti` → `createReclamaTask` (reclamă ≠ OK) → `autoCloseReclamaTask` (la «a fost reparat») → `buildSummary` → `validateDay` când toate cursele sunt raportate (`allDone`) |
| 16 | Aplicația după succes: rezumat → înapoi pe grilă cu cursa bifată | `[id].tsx` → `Alert` cu `summary` (+ textul MISIUNE la `allDone`) → `router.replace('/day')`; la 409 `CLEANING_REQUIRED` → mesaj + buton «📷 Poze curățenie» către `/cleaning?slot=…&gate=…`; la `NOT_NEXT`/`ALREADY_REPORTED` → alertă → `/day`; OFFLINE → datele rămân pe ecran |
| 17 | Cursele următoare: doar `next`, 🔒 la restul | `day.tsx` → 🔒 → toast «Completează mai întâi ora HH:MM»; serverul refuză oricum cu 409 `NOT_NEXT` |
| 18 | 15:00 — setul ZIUA din «📷 Poze curățenie»; 16:25 fără set → 409 `CLEANING_REQUIRED` cu `slot: 'ZIUA'` | `day.tsx` → `/cleaning` (tura după oră: `slotForTime`, < 12:00 → DIMINEATA); server: `cleaningGateSlot` → `'ZIUA'` când `formatTime(trip.departure_time) === config.cleaningGateTripTime` (`'16:25'` în `config.ts`); aplicația: `cleaningGateFor` trimite la poze înainte să deschidă cursa |
| 19 | GPS pe toată tura: ping la 2 min, serviciu în prim-plan, coadă offline, `POST /presence` în loturi ≤ 200 | `src/presence.ts` → `startLocationUpdatesAsync` (foreground service «TRANSLUX Peron»), coada în AsyncStorage, `flushPresenceQueue`; server: `api/presence.ts` → `postPresence` → `parsePresenceBody` (max 200) → `selectNewPings` (fereastră + dedupe + `in_zone`) → `insertPresencePings`; fără nicio alertă în timpul zilei (`grep sendAdminAlert api/presence.ts` → 0) |
| 20 | Seara: secțiunea «📍 Prezență în zona de lucru» în digestul de 20:30 | `services/dailyDigest.ts` → `buildPresenceLines(date, now)` → `presencePeriods` + `lateStart` + `formatPresenceLine` (`api/presence.ts`); testul «12:40–13:05 în afara razei → exact o LIPSA de 25 min» în `presence.test.ts` |
| 21 | Pozele și ping-urile se șterg după 30 de zile | `scheduler.ts` → `schedulePeronPhotoRetention()` (03:10 Europe/Chisinau, o dată pe zi) → `services/photoRetention.ts` → `runPeronPhotoRetention()` (bucket `report-photos`, `photo_deleted_at` pe `peron_cleaning_checks` și `driver_appearance_checks`, `deletePresencePingsBefore`); înregistrat în `index.ts` |
| 22 | Bălți: fluxul scurt | `day.ts` → liste goale + `allowFull`; `reportRules.ts` → FULL doar la BALTI, calitatea null; `db.ts` → `createReport` stochează FULL ca `status 'OK'`, `passengers_count: -1`; locația cerută la toate cursele (`requiresLocation` fără excepții la Bălți); `[id].tsx` → «Microbuzul full» doar când `allowFull`; `postReport` → `updateLoadingBoardBalti()` |
| 23 | API-ul montat pe serverul HTTP al botului | `apps/bot/src/index.ts:66` → `if (await handleAppApi(req, res)) return;` — prima linie din `createServer`; `server.ts` → `apiPath` (prefix `/app/v1/`), 404/405/413 (8 MB)/400 `BAD_JSON`/500 `INTERNAL` |

## 3. «Cum înțelegem că totul a reușit» — bifat

Legendă: ✅ verificat pe cod/gate · 📱 rămâne pentru Ion (telefon / prod).

- [x] ✅ `packages/db/migrations/328_peron_app.sql` există (97 de linii: `reports.source/location_*/driver_check_id`, `driver_appearance_checks`, `peron_presence_pings`, `peron_cleaning_checks.source/location_*/photo_deleted_at`, `peron_app_link_codes`, `peron_app_sessions`, RLS pe tabelele noi). **Aplicată pe prod** prin MCP pe 08.09 (după `state.md`, S01). 📱 `select source from reports limit 1` — nu am rulat (S09 nu face apeluri pe prod).
  - ⚠️ **Coliziune de număr:** în repo există și `328_piese_prihod_etichete_adaos.sql` (piese, altă sesiune, commit `1ca22e3`). Fișiere diferite, ambele aplicate pe prod. Nu am redenumit nimic — decizia dirijorului. Următoarea migrație liberă: **330** (329 e `lde_camioane_stare_automata`).
- [x] ✅ Admin: butonul «📱 Cod aplicație» la un CONTROLLER activ din Chișinău/Bălți, codul de 6 cifre afișat mare sub tabel, rând în `peron_app_link_codes` (`UsersClient.tsx`, `actions.ts`, `linkCode.ts` + `linkCode.test.ts`). 📱 Clic real în central-hub.
- [x] ✅ `POST /app/v1/auth/link` → `{ token, user }`; același cod a doua oară → 401 (`used_at` atomic); Bearer greșit → 401 (`auth.ts`, 8 teste în `auth.test.ts`). Dirijorul a confirmat că API-ul de pe Railway (`bot-production-6376.up.railway.app`) răspunde 401 fără token.
- [x] ✅ `GET /app/v1/day` — forma exactă din spec (`day.ts` → `DayResponse`, + `presenceWindow`).
- [x] ✅ `POST /app/v1/report` — linie cu `source = 'app'`, `location_ok` calculat, loading board, sarcină reclamă în `obligations`, 409 pe `locked` (`report.ts`, `reportRules.ts`, 26 teste). 📱 Efectul vizibil în grupul adminilor.
- [x] ✅ Prima cursă fără setul DIMINEATA → 409 `CLEANING_REQUIRED`; 16:25 fără setul ZIUA → la fel (`cleaningGateSlot`, `CleaningRequiredError`).
- [x] ✅ `POST /app/v1/driver-photo` → `report-photos/soferi/…`, linie în `driver_appearance_checks`, `driverCheckId`; `/report` OK fără `driverCheckId` → 400 `DRIVER_PHOTO_REQUIRED`.
- [x] ✅ `POST /app/v1/cleaning-photo` → `report-photos/curatenie/<data>/<slot>/<zona>-<ts>.jpg`, `source = 'app'`, verdictul în răspuns.
- [x] ✅ `POST /app/v1/presence` → `in_zone` calculat; perioada «lipsă 12:40–13:05 (25 min)» acoperită de test; secțiunea în digest; zero mesaje către admini ziua.
- [x] ✅ Bălți: `/day` fără repartizări/curățenie; FULL → `passengers_count = -1`; ecranul scurt în app.
- [x] ✅ Aplicația: login → zi → cursa `next` → un ecran cu tot, inclusiv poza șoferului → «Trimite» → rezumat → grilă cu cursa bifată; niciun câmp de spălare (`grep -i wash peron-android/src/buildReport.ts` → doar comentariul «fără washGrade»); locația niciodată trimisă manual. 📱 Pornirea pe telefon și fluxul pe prod.
- [x] ✅ «Poze curățenie» deschide camera (nu galeria), 3 zone pe rând, verdict, avertismentul la MURDAR. 📱 Pe telefon.
- [x] ✅ Toate gate-urile verzi (tabelul de mai sus); `git status` curat înainte de această sesiune (0 linii); `git diff 751c154 -- .env .env.* .claude apps/web apps/voice-llm` → gol; `conversations/report.ts` și `cleaningPhotos.ts` **identice** cu `751c154` (`git diff 751c154 --quiet -- apps/bot/src/conversations/` → 0, nici măcar importuri de tipuri).

Alte constatări:
- `package-lock.json` din root s-a schimbat o dată, în S02 (`vitest` ca devDependency în `apps/bot`) — așteptat, nu e o atingere a workspace-ului.
- Între commit-urile acestui prog sunt și commit-uri străine (Camioane `d3a7b9f`, `35df425`; Piese `1ca22e3`) care ating `lde-geo-worker/`, `apps/admin`, `packages/db` — nu fac parte din spec, dar gate-urile au rulat peste ele și sunt verzi.
- În timpul rulării S09 au apărut în working tree trei fișiere neurmărite străine de spec (`apps/admin/src/lib/lde/tara.ts`, `tara.test.ts`, `tari-poligoane.json` — lucru paralel la Camioane). Nu sunt ale acestei sesiuni și nu au fost commise; `git status` nu e curat din cauza lor, nu a aplicației de peron.
- `peron-android/assets/*.png` nu sunt în git (root `.gitignore` are `*.png`): APK-ul din EAS va avea iconul implicit Expo. Decizie pentru Ion (negare `!peron-android/assets/*.png` în `.gitignore`), nu a kitului.
- `ANTHROPIC_API_KEY` lipsește pe Railway: pozele se salvează, verdictul e `EROARE` pentru curățenie și `driverCheckId` există cu verdictele null pentru șofer (operatorul bifează manual). Nu blochează raportarea.
- Fusul aplicației: fereastra turei și `slotForTime` se compară cu ora locală a telefonului — telefoanele operatorilor trebuie să fie pe ora Chișinăului (implicit pe orice Android din MD).

## 4. De făcut de Ion pe telefon

În ordinea din `peron-android/INSTALL.md`:

1. **Migrația 328** — `state.md` spune că `328_peron_app.sql` e aplicată prin MCP pe 08.09. De confirmat cu `select source from reports limit 1` în Supabase; dacă dă eroare de coloană, se aplică `packages/db/migrations/328_peron_app.sql` (idempotentă, `if not exists` peste tot).
2. **`ANTHROPIC_API_KEY` pe Railway** — serviciul `bot` → Variables. Repornește botul, deci **după 22:00**.
3. **Deploy-ul botului** cu S02–S05 (`bash .claude/scripts/deploy-railway.sh`, doar 22:00–05:00). Dirijorul a raportat că API-ul e deja pe Railway și răspunde 401 fără token; de verificat că e commit-ul cu `presence` (S05, `7a461e7` sau mai nou) — `curl -s https://bot-production-6376.up.railway.app/app/v1/presence -X POST` trebuie să dea `401`, nu `404`.
4. **Build APK:** `cd peron-android && npm install && npx eas-cli login && npx eas-cli build --platform android --profile preview` (EAS setează `EXPO_PUBLIC_API_URL` din `eas.json`). Instalare pe telefon + dezactivarea optimizării bateriei + permisiunea «Permite tot timpul» (pașii 3.2–3.5 din INSTALL.md).
5. **Codurile** pentru Vitalie, Iurie, Aurel — central-hub → Utilizatori → «📱 Cod aplicație» la fiecare (trebuie să fie CONTROLLER activ cu punct CHISINAU). Un cod = un telefon, 24 h. Revocare: `update peron_app_sessions set revoked_at = now() where user_id = '…'`.
6. **O zi de test în paralel cu botul** — operatorul raportează din aplicație, botul rămâne deschis ca plasă; de urmărit: loading board-ul după fiecare raport, digestul de 20:30 (secțiunea «Prezență în zona de lucru» și verdictele de curățenie), `reports.source = 'app'` pe liniile zilei, pozele în `report-photos/curatenie/<data>/…` și `soferi/<data>/…`.
7. **`DRIVER_UNIFORM_DESCRIPTION`** din `apps/bot/src/config.ts` — de completat cu descrierea reală a uniformei (culoare, însemne) când o ai; până atunci verdictul de uniformă e doar propunere.
