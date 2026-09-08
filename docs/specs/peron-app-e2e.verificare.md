# Testul cap-coadă al aplicației de peron — raportul de verificare (S04, 2026-09-08)

Sesiunea S04 a spec-ului `peron-app-e2e.md`. Stare verificată: commit `ef4c7ee` (S01–S03)
plus fișierele acestei sesiuni (gardul global de rețea). Nimic din producție nu a fost
atins; nicio migrație, niciun push, niciun deploy.

## 1. Gate-urile (o singură rulare, 2026-09-08 19:23, Node v22.23.2)

| Gate | Comandă | Rezultat |
|---|---|---|
| build-packages | `npm run build --workspace=packages/db` | ✅ verde |
| build-bot | `npm run build --workspace=apps/bot` | ✅ verde; `dist/` nu conține `test/`, `e2e.*`, `networkGuard`, `vitest.setup` |
| test-bot | `npm run test --workspace=apps/bot` | ✅ 205 teste, 12 fișiere |
| typecheck-app | `cd peron-android && npx tsc --noEmit` | ✅ verde (fixture-urile importate ca `DayResponse` / `ReportResponse`) |
| (în plus) teste app | `cd peron-android && npm test` | ✅ 23 teste `node:test` (18 pe funcții pure + 5 de contract) |

Nicio corecție nu a fost necesară: toate gate-urile au ieșit verzi din prima, înainte și
după adăugarea gardului de rețea.

## 2. Durata și numărul de teste

| Măsură | Valoare |
|---|---|
| `time npm run test --workspace=apps/bot` (perete, inclusiv pornirea npm + vitest) | ≈ 1,0 s |
| Durata raportată de vitest | 675 ms (transform 519 ms, setup 210 ms, collect 1,61 s, tests 628 ms) |
| Teste bot, total | 205 în 12 fișiere |
| — din care noi în acest spec (S01–S04) | 132: fakeSupabase 17, fixtures 21, e2e.chisinau 48, e2e.balti 23, e2e.digest 11, e2e.retention 8, networkGuard 4 |
| — preexistente (funcții pure din `apps/bot/src/api/*.test.ts`) | 73 |
| Teste aplicație (`peron-android`) | 23 |

Ținta din spec era «≥ 40 de teste noi în sub 30 de secunde»: sunt 132 în ~1 s.

## 3. Rețeaua e tăiată la nivel de proces

- `apps/bot/vitest.setup.ts` (montat prin `setupFiles` în `vitest.config.ts`) înlocuiește
  `globalThis.fetch` la import: trece doar `http://127.0.0.1:<port>` (serverul local al
  testelor din `src/test/server.ts`); orice altă adresă — inclusiv `localhost` după nume și
  `[::1]` — aruncă `scurgere spre rețea în test: <url>`.
- Se instalează la nivel de modul, nu în `beforeAll`, ca fișierele e2e care capturează
  `const realFetch = globalThis.fetch` la import și își pun propriul înveliș (Telegram
  capturat, 127.0.0.1 permis) să delege TOT în gard, nu în fetch-ul nativ. `vi.unstubAllGlobals()`
  din `afterAll` revine tot la gard.
- `src/test/networkGuard.test.ts` (4 teste) dovedește gardul: fetch spre `api.telegram.org`,
  `*.supabase.co`, `api.anthropic.com` (string, `URL`, `Request`) → respins instant (< 500 ms,
  fără DNS); `localhost`/`[::1]` respinse; 127.0.0.1 trece la un server real; fetch-ul global
  se numește `guardedFetch`.
- **Verificat prin comentarea gardului și revenit:** cu linia `globalThis.fetch = guardedFetch`
  comentată și `HTTPS_PROXY=http://127.0.0.1:9 HTTP_PROXY=http://127.0.0.1:9` setate, rularea
  pică cu 3 teste roșii, iar primul arată că cererea chiar a ieșit din proces: `promise
  resolved "Response { status: 404 … server: 'nginx/1.30.1' … url: 'https://api.telegram.org/botX/getMe' }"`.
  Concluzia importantă: **variabilele de proxy nu taie nimic** — fetch-ul din Node 22 (undici)
  le ignoră. Gardul din setup e singurul strat care taie. Fișierul a fost restaurat
  (`grep -c DEMONSTRAȚIE` = 0) și rularea finală, cu aceleași variabile de proxy, e verde.
- Celelalte căi spre exterior sunt închise de `vi.mock` (Supabase, SDK-ul Anthropic, adminAlert)
  și de `TELEGRAM_BOT_TOKEN=''` din `mocks.ts`; testul Chișinău îl setează intenționat ca să
  captureze mesajele către executor prin învelișul propriu, tot peste gard.

## 4. Acoperirea «Cum înțelegem că totul a reușit», punct cu punct

Numele testelor sunt cele din `--reporter=verbose` (fișier › describe › test).

| Punct din spec | Acoperit de | Stare |
|---|---|---|
| test-bot verde, ≥ 40 teste noi, < 30 s, fără rețea, nume ca pașii zilei | §1–§3 de mai sus; numele testelor din tabelul acesta | ✅ |
| **Chișinău:** cod → token | `e2e.chisinau` › 1. Cod și token › «codul 482913 al lui Vitalie → 200 cu token de 64 hex…», «același cod a doua oară → 401 BAD_CODE», «cod expirat (emis acum 25 h) → 401», «GET day fără Bearer → 401; cu token inventat → 401», «GET day cu token → 200, iar sesiunea primește last_seen_at» | ✅ |
| `/day` la 06:20 | 2. /day la 06:20 › «29 de curse în ordinea plecării: prima next, restul locked», «repartizări pentru 3 curse, 4 șoferi, 3 auto», «openReclama['LYY 735']… clima e 'ac'…», «curățenie goală, poarta 16:25, fereastra de prezență 06:25–20:30, excepțiile de locație, stația» | ✅ |
| poartă DIMINEATA (409) | 3. Poarta de dimineață › «raport pe 06:55 înaintea pozelor → 409 CLEANING_REQUIRED { DIMINEATA, toate 3 zonele }» | ✅ |
| 3 poze de curățenie (CURAT / ALT_LOC / MURDAR / EROARE) | 4. Curățenie de dimineață › cele 5 teste (PERON CURAT; PIETONI ALT_LOC zona rămâne deschisă; PIETONI MURDAR cu 2 probleme; VECEU EROARE; «peron_cleaning_checks: 4 rânduri source 'app' sub curatenie/2026-06-10/DIMINEATA/, pozele sunt în Storage, /day are 3 zone») | ✅ |
| poză șofer | 5. Poza șoferului › «fără driverCheckId → 400 DRIVER_PHOTO_REQUIRED», «driverCheckId inexistent → 400», «persoana_vizibila=false → 200 NO_PERSON, fără rând, poza scoasă din Storage», «uniforma=true, aspect=false → rând în driver_appearance_checks cu *_model și driverCheckId» | ✅ |
| raport 06:55 | 6. Raport 06:55 › «200; rândul din reports are exact coloanele botului (location_ok null — cursă exceptată) + source app, driver_check_id», «verdictele confirmate de operator suprascriu uniform_ok/groomed_ok…», «loading board: un sendMessage către admin cu «06:55»…», «/day: 06:55 done, 07:35 next… clima pentru 998 TCP e null luna asta» | ✅ |
| ordinea (NOT_NEXT / ALREADY_REPORTED) | 7. Ordinea curselor › ambele teste | ✅ |
| schimbare de repartizare + auto nou | 8. 07:35 cu schimbare de repartizare și auto nou › «POST vehicle { plate: 'ABC 123' } → auto nou ABC123; a doua oară → același, existed: true», «raport cu assignmentChanged, Sergiu Lungu și ABC123, aspect neîngrijit → daily_assignments actualizat, summary cu ⚠ aspect», «/day: nu mai listează șoferii și auto folosite…» | ✅ |
| reclamă + reparare confirmată | 9. 08:15 cu reclamă pe LYY 735, apoi 08:50 cu reparare confirmată › «reclamaOk false / 'bus' → o sarcină nouă doar pentru «bus»…, executorul e anunțat», «08:50 … reparare confirmată pe sarcina «panou» → cancelled» | ✅ |
| climă o dată pe lună | 6. Raport 06:55 › «/day: … clima pentru 998 TCP e null luna asta» | ✅ |
| întârziere, locație în afara razei | 10. Locație și întârziere › «punctele de test sunt la ~400 m și ~50 m de stație», «09:25 la ~400 m → location_ok false și o încălcare de locație în digest», «10:00 trimis la 10:12 → încălcare de întârziere (12 min)», «10:30 la 50 m și la timp → location_ok true, fără încălcare nouă»; pragul exact: 12. › «11:28 trimis la exact +10 min nu e întârziere» | ✅ |
| absent | 11. Absent › «11:00 ABSENT fără poză și fără cifră → passengers_count null, câmpurile de calitate null, summary '☑ 11:00 — absent'» | ✅ |
| 20 de curse până la 16:05, 0–27 pasageri, 28 → 400 | 12. Restul curselor până la 16:05 › cele 3 teste | ✅ |
| poartă ZIUA la 16:25 (409) → set ZIUA | 13. Poarta de zi (16:25) › ambele teste | ✅ |
| restul curselor → `allDone: true` + `day_validations` | 14. Sfârșit de zi › «16:45 … 19:25 → allDone false», «20:00 … → allDone true și rândul lui Vitalie în day_validations», «/day → toate cele 29 done; încă un raport → 409 ALREADY_REPORTED» | ✅ |
| **Fiecare raport: coloanele botului + `summary` identic cu `report.ts:848–866`** | `expectRowLikeBot` / `botSummary` (copiate din `report.ts:720–743`, `838–866`) rulate în `fullTrip()` la fiecare cursă din testele 6, 8, 9, 10, 12, 13, 14; Bălți: `e2e.balti` › 3, 4, 5, 7, 8 | ✅ |
| **Bălți:** FULL → OK / −1; fără poartă; fără poză de șofer; locația cerută și la 06:55 | `e2e.balti` › 4. «05:30 FULL în zonă → status 'OK', passengers_count -1, summary «☑ 05:30 — microbuz complet»», «FULL trimis de Vitalie (Chișinău) → 400»; 2. «listele goale, fără poartă de curățenie, fără excepții de locație, allowFull, fereastra 04:50–20:50»; 6. «cleaning-photo de la Andrei → 403 NOT_CHISINAU…», «driver-photo de la Andrei → 403»; 3. «05:20 fără coordonate → location_ok false…»; 7. «06:55 fără coordonate → location_ok false (06:55 e exceptată doar la Chișinău)»; 5. «câmpurile de calitate… toate scrise null» | ✅ |
| **Digestul de seară** cu curățenie și prezență; alertele din timpul zilei doar ca la bot | `e2e.digest` › 2. Ziua cu ambele puncte › «digestul de la 20:30: un singur mesaj, textul exact» (verificat literal), «nimic către admini în timpul zilei, în afara celor două loading board-uri»; `e2e.chisinau` › 15. «până la digest nimic n-a plecat către admini în afara loading board-ului; executorul a primit doar cele 2 mesaje de reclamă», «digestul de la 20:30: 2 încălcări (locație 1, întârziere 1), curățenia pe ambele ture, prezența cu lipsă 25 min și fără semnal 10 min»; `e2e.digest` › 1. Zi fără nimic (ambele teste) | ✅ |
| Prezența GPS (loturi, ferestre, praguri) | `e2e.chisinau` › 15. lotul 1 / lotul 2 / lotul 3; `e2e.balti` › 9. «04:48 și 20:52 se ignoră; 04:50 și 20:50 se acceptă…»; `e2e.digest` › 2. «prezență: Andrei 04:50–20:30 tot timpul…; Vitalie pornește abia la 06:50 și lipsește 09:00–09:12» | ✅ |
| **Retenția** la 30 de zile | `e2e.retention` › toate cele 8 teste (prag exact: 31 șters, 30 fix rămâne, 29 rămâne, a doua rulare 0, a doua zi cele «30 fix» pică) | ✅ |
| **Contractul cu aplicația** (fixture-uri reale, `typecheck-app` le acceptă) | bot: `e2e.balti` › 2. «contract: răspunsul real al /day e fixture-ul day.balti.json», `e2e.digest` › 2. «contract: /day al lui Vitalie… e day.chisinau.json», «…răspunsul e report.ok.json» (compară cu JSON-ul salvat; regenerare cu `WRITE_FIXTURES=1`); app: `contract.test.ts` › «GET /day — Chișinău», «GET /day — Bălți», «POST /report» + `contract.ts` (`Loose<T>` + `SameKeys`) sub `tsc --noEmit` | ✅ |
| Niciun fișier de producție schimbat; `git status` curat | `git status` după commit: curat; diff-ul S01–S04 nu atinge `apps/bot/src/api/*` de producție, `services/*`, `conversations/*`, `peron-android/app/*`, migrațiile, `.env*`, `.claude/`, `apps/web`, `apps/voice-llm` | ✅ |

## 5. Bug-uri găsite de teste

**Niciunul.** S01–S03 au comparat fiecare rând și fiecare rezumat cu etalonul botului și
nu au găsit nicio diferență de producție. Deciziile «peste spec» (notate în S02/S03) sunt
locuri unde spec-ul aproxima textul și comportamentul real al botului era altul, iar testul
a urmat botul, nu spec-ul:

- prezență: pauzele fără semnal sub 10 min nu se raportează (`NO_SIGNAL_MIN_MINUTES = 10`),
  deci testul lovește 10 min exact, nu 8;
- digest gol: botul trimite digestul și fără încălcări (ca să arate pozele de curățenie
  lipsă), deci «→ false» e testat doar pe singura cale reală;
- formatul liniilor de curățenie și eticheta de prezență sunt cele din `dailyDigest.ts`.

## 6. Neacoperit (onest)

- **Ecranele aplicației pe telefon** (`peron-android/app/*`): navigarea, camera, grila
  zilei, cardul de permisiuni. Aplicația e testată doar pe funcțiile pure (`buildReport`,
  `cleaning`, `location`) și pe forma răspunsurilor (contract). Fără Detox/Maestro/emulator.
- **Camera reală**: pozele din teste sunt un JPEG minuscul în base64; nu se testează
  compresia, orientarea sau dimensiunea reală a fișierului trimis de telefon.
- **GPS-ul real în fundal**: ping-urile de prezență sunt trimise de test direct la API;
  nu se testează serviciul de fundal al telefonului, coada offline, bateria, pierderea
  permisiunii în timpul turei.
- **Modelul real** (Anthropic): SDK-ul e înlocuit cu un răspuns JSON configurat de test.
  Se verifică traducerea verdictelor (`CURAT / MURDAR / ALT_LOC / EROARE`, `NO_PERSON`), nu
  calitatea judecății pe poze reale și nu promptul.
- **Supabase real**: fake-ul emulează doar ce folosesc serviciile botului (filtre, unicități,
  default-uri, Storage). Nu acoperă RLS, politici, tipuri Postgres stricte, triggere, sau
  comportamente ale PostgREST neimplementate în fake (care aruncă explicit).
- **Telegram real**: loading board-ul și digestul sunt verificate ca apeluri capturate
  (`sendMessage` / `editMessageText`), nu ca livrare; nici limitele de rată, nici erorile
  API-ului Telegram.
- **Schedulerele** (`scheduler.ts`): retenția și digestul se apelează direct, nu prin
  `setInterval`; ora de declanșare nu e testată.
- **Conversația Telegram a botului** (`conversations/*`): e etalonul, nu subiectul — nu e
  testată aici.
- **Sesiuni, revocare, mai multe dispozitive**: doar codul și token-ul de bază; nu se testează
  revocarea unei sesiuni sau două telefoane pe același operator.
- **Zilele în afara sezonului A/C** (iarnă, `heat_status`): scenariul rulează în iunie; ramura
  de încălzire nu e parcursă cap-coadă.

## 7. Fișierele acestei sesiuni

- `apps/bot/vitest.setup.ts` — gardul global de rețea (nou).
- `apps/bot/vitest.config.ts` — `setupFiles: ['./vitest.setup.ts']`.
- `apps/bot/src/test/networkGuard.test.ts` — dovada gardului (4 teste, nou).
- `docs/specs/peron-app-e2e.verificare.md` — acest raport.
