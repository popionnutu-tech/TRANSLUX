---
kit: spec
name: peron-app-android
title: Aplicație Android pentru operatorul de peron Chișinău (curse, poza șoferului, curățenie)
created: 2026-09-08
sessions:
  - id: S01
    title: packages/db — migrația 328 (scrisă, neaplicată) și tipurile noi
    gates: [build-packages, test-db]
    approve: [migration]
  - id: S02
    title: Autentificare cap-coadă — cod în admin, endpoint de conectare și GET /app/v1/day în bot
    gates: [build-bot, test-bot, typecheck-admin, test-admin, build-admin]
    approve: []
  - id: S03
    title: Bot API — POST /app/v1/report și POST /app/v1/vehicle cu validări și efecte secundare
    gates: [build-bot, test-bot]
    approve: []
  - id: S04
    title: Bot API — POST /app/v1/cleaning-photo, POST /app/v1/driver-photo și ștergerea pozelor după 30 de zile
    gates: [build-bot, test-bot]
    approve: []
  - id: S05
    title: Aplicația Expo — schelet, login cu cod, ecranul zilei
    gates: [typecheck-app]
    approve: []
  - id: S06
    title: Aplicația — ecranul de cursă pe un singur ecran, cu poza șoferului și GPS automat
    gates: [typecheck-app]
    approve: []
  - id: S07
    title: Aplicația — pozele de curățenie cu camera, poarta 06:55 / 16:25, config APK
    gates: [typecheck-app]
    approve: []
  - id: S08
    title: Verificare — toate gate-urile, scenariul operatorului parcurs pe cod, lista pentru telefon
    gates: [build-packages, build-bot, test-bot, typecheck-admin, test-admin, typecheck-app]
    approve: []
---

# Aplicație Android pentru operatorul de peron Chișinău (curse, poza șoferului, curățenie)

## De ce

Operatorul de peron din Chișinău raportează azi fiecare cursă în botul Telegram
(`apps/bot/src/conversations/report.ts`): 8–12 acțiuni per cursă, fiecare întrebare un
mesaj separat, locația trimisă manual, fără pas înapoi, iar pozele din Telegram nu pot
fi verificate că sunt făcute pe loc. Ion (08.09.2026) a decis: aplicație Android
nativă, doar pentru operatorii de peron din Chișinău, «să nu mai arunce geolocația, să
lucreze în mare parte prin poze și curățenia la peron». După: o cursă = un ecran cu
totul pre-completat, GPS luat singur, pozele de curățenie făcute doar cu camera
aplicației și judecate de Claude pe loc. Botul rămâne pentru Bălți și celelalte roluri.

Poza șoferului intră în aceeași versiune (Ion, 08.09, la mockup): «conformitate șofer
— dacă este în uniformă sau nu, aspect îngrijit sau nu — face OCR». Operatorul face
poza șoferului la cursă, modelul propune verdictul, operatorul confirmă sau corectează
cu o atingere. Nota de spălare interior dispare din aplicație («spălare interior
scoate»).

## Decizii fixate înainte de start

Răspunsurile lui Ion (08.09.2026):
- Prima versiune: **curse + curățenie + poza șoferului** (inițial poza șoferului era
  amânată; la mockup Ion a cerut-o în locul butoanelor de conformitate).
- **Conformitate șofer nu se mai bifează manual.** La fiecare cursă operatorul face
  poza șoferului cu camera; modelul propune `uniform_ok` și `exterior_ok` (aspect
  îngrijit: bărbierit, curat); operatorul confirmă sau răstoarnă fiecare verdict cu
  o atingere. Ce trimite aplicația în raport e verdictul confirmat de operator, nu al
  modelului; ambele se păstrează.
- **Nota de spălare interior nu se mai cere.** Rapoartele din aplicație au
  `wash_grade = null`. Botul o cere în continuare (Bălți).
- GPS la peste 150 m de stație: **se acceptă și se marchează încălcarea**, ca azi.
  Nu blochează raportarea.
- Fără internet la trimitere: **mesaj de eroare și reîncearcă**. Datele rămân pe ecran.
  Fără coadă offline.
- Pozele se păstrează **30 de zile**, apoi fișierele se șterg automat. Verdictele și
  liniile din tabel rămân permanent.
- Curățenie: **3 poze** (peron, zona pietoni «GARA», veceu) de **două ori pe zi**:
  înainte de prima cursă (**06:55**) și la **15:00**; setul de zi e obligatoriu înainte
  de cursa **16:25** («altfel nu va putea»). MURDAR → operatorul e atenționat că
  «informația se stochează și va fi penalizată». «Trebuie să fie măturat»: praf,
  nisip, pietriș pe pavaj = MURDAR.
- Numai poze făcute pe loc: aplicația deschide **camera**, galeria nu există în app.
- Verificările manuale rămase în ecranul de cursă: ajută la încărcat, auto curat,
  reclamă (cu «a fost reparat?» când există sarcină deschisă), clima în sezon (o dată
  pe lună per auto). Toate cu «OK» bifat implicit; operatorul schimbă doar ce nu e în
  regulă.
- **Clima** (Ion, 08.09: «aer condiționat vara, căldură începând din noiembrie»):
  aceleași date ca în bot, `climateKindForDate` din `apps/bot/src/services/db.ts` —
  aer condiționat 15 mai–31 iulie, căldură 1 noiembrie–15 februarie; în rest rândul
  nu apare. Aplicația nu redefinește sezonul, îl primește gata calculat din `/day`.

Decise de mine (nu se reevaluează în timpul rulării):
- **API-ul aplicației trăiește în bot** (`apps/bot`, Railway), pe serverul HTTP care
  există deja în `apps/bot/src/index.ts`, sub prefixul `/app/v1/`. Motiv: toată logica
  de raportare (`services/db.ts`: șoferi activi, auto folosite azi, repartizări, sarcini
  reclamă, climă, validarea zilei) și toate efectele secundare (loading board, digest,
  sarcini reclamă în `obligations`, mesaje Telegram) sunt deja acolo. Un API în admin
  ar fi duplicat ~15 funcții și ar fi cerut un sincronizator. Costul: deploy-ul pe
  Railway e permis doar 22:00–05:00, deci API-ul se livrează noaptea.
- Corpul cererilor e **JSON**, pozele vin ca **base64** în JSON (după comprimare la
  1280 px lățime, JPEG 0.8, ~300 KB). Limita corpului: 8 MB. Fără multipart, fără
  framework — router mic peste `http` în `apps/bot/src/api/`.
- **Autentificare:** adminul generează în pagina Utilizatori un **cod de conectare de
  6 cifre**, valabil 24 h, folosit o singură dată, doar pentru utilizatori cu
  `role = 'CONTROLLER'` și `point = 'CHISINAU'`. Aplicația schimbă codul pe un token
  (32 octeți aleatori, hex), păstrat în `expo-secure-store`; serverul păstrează doar
  `sha256(token)` în `peron_app_sessions`. Token-ul nu expiră; adminul îl poate revoca
  (`revoked_at`). Antetul: `Authorization: Bearer <token>`.
- **Ordinea curselor rămâne secvențială**, ca în bot: se poate raporta doar prima cursă
  neraportată a zilei. Serverul refuză altă cursă cu 409.
- **Poarta de curățenie e impusă de server**, nu doar de aplicație: prima cursă a zilei
  cere setul DIMINEATA complet, cursa `config.cleaningGateTripTime` (16:25) cere setul
  ZIUA complet; altfel 409 cu `code: 'CLEANING_REQUIRED'`.
- **location_ok** se calculează pe server din lat/lon trimise de aplicație, cu
  `haversineDistance` din `apps/bot/src/utils.ts`, raza 150 m din
  `config.stations.CHISINAU`, aceleași excepții ca botul (`config.chisinauExemptTimes`:
  06:55 și 20:00). Fără lat/lon (permisiune refuzată) → `location_ok = false` și
  încălcare «locație». Aplicația cere permisiunea la login și o re-cere la fiecare
  trimitere, cu explicație.
- `status = 'FULL'` nu există la Chișinău (doar Bălți), aplicația nu-l oferă.
- **Aplicația stă în afara workspace-ului npm**, în `peron-android/` la rădăcina
  repo-ului, cu `package.json` și lockfile proprii (ca `lde-geo-worker`). Motiv: React
  Native (React 18) și `apps/admin` (React 19) nu pot fi hoistate împreună de npm
  workspaces fără să se calce. Root-ul nu se atinge.
- Stack app: **Expo SDK 52**, TypeScript strict, `expo-router`, `expo-secure-store`,
  `expo-location`, `expo-camera` (`CameraView`), `expo-image-manipulator`. Fără
  `expo-image-picker`. Fără bibliotecă de state: `useState` + un client API în
  `src/api.ts`. URL-ul API-ului vine din `EXPO_PUBLIC_API_URL` (`.env` local, necommis).
- **Distribuție:** APK prin EAS Build, profilul `preview` din `eas.json`. Build-ul îl
  rulează Ion (cere cont Expo); sesiunea scrie doar configul și `INSTALL.md`.
- Ștergerea pozelor după 30 de zile: **scheduler în bot** (03:10 ora Chișinăului,
  în `apps/bot/src/scheduler.ts`), șterge obiectele din bucket-ul `report-photos`
  cu prefixul `curatenie/` mai vechi de 30 de zile și pune `photo_deleted_at` pe
  liniile din `peron_cleaning_checks`. Fără cron în GitHub.
- Fluxul de curățenie din bot (`conversations/cleaningPhotos.ts`, commit `751c154`)
  **rămâne** cât timp operatorii mai folosesc botul; ambele scriu în aceeași tabelă,
  deci setul făcut într-un loc e văzut și în celălalt.
- Migrația nouă e **328** (ultima din repo: `327_piese_retur_fara_acoperire.sql`; 326 aplicată pe prod
  pe 08.09 prin MCP). PROFILE.md spune 317 — e depășit.
- Testele pentru bot: se adaugă **Vitest** în `apps/bot` (devDependency, script
  `"test": "vitest run"`), doar pentru funcții pure (hash de token, validări, calcul
  «următoarea cursă», parsarea răspunsului modelului). Gate-ul **test-bot** =
  `npm run test --workspace=apps/bot`. Nu există în PROFILE.md — e definit aici.
- Gate-ul **typecheck-app** = `cd peron-android && npx tsc --noEmit` (după
  `npm install` în acel folder).
- Modelul pentru poze: `claude-opus-5`, `output_config: { effort: 'low', format:
  json_schema }`, promptul și criteriile deja scrise în
  `apps/bot/src/services/cleaningCheck.ts`. Nu se rescriu.
- **Poza șoferului:** tabel nou `driver_appearance_checks` (migrația 328), poza în
  `report-photos/soferi/<data>/<trip>-<ts>.jpg`, aceeași ștergere după 30 de zile.
  Promptul modelului (nou, în `apps/bot/src/services/driverCheck.ts`) răspunde
  `uniforma: boolean`, `aspect_ingrijit: boolean`, `persoana_vizibila: boolean`,
  `descriere`. «Uniformă» = îmbrăcăminte de serviciu TRANSLUX; descrierea exactă a
  uniformei (culoare, însemne) o dă Ion — până atunci promptul folosește constanta
  `DRIVER_UNIFORM_DESCRIPTION` din `config.ts` cu textul «îmbrăcăminte de serviciu
  cu însemne TRANSLUX» și verdictul e doar propunere. Fața șoferului e dată
  personală: pozele nu se arată nicăieri în admin, se șterg la 30 de zile, iar
  acordul șoferilor îl obține Ion (nu e treaba kitului).
- Raportul din aplicație leagă poza: `reports.driver_check_id` → `driver_appearance_checks.id`
  (nullable; la ABSENT nu există poză).

## Nu intră în scop

- Bălți. Aplicația refuză login pentru orice user cu `point != 'CHISINAU'`.
- Coadă offline, sincronizare în fundal, notificări push.
- Play Store, iOS, actualizare automată a aplicației.
- Migrarea altor roluri din bot (admini, DIGITAL, șoferi, taxi).
- Galerie de poze în admin. Adminul vede verdictele în digestul zilnic (există) și, la
  nevoie, fișierele în Supabase Storage.
- Anularea unui raport din aplicație (rămâne «🔙 Anulează ultimul» din bot, 10 minute).
- Adăugarea de șoferi noi din aplicație (rămâne «➕ Adaugă șofer» din bot).
- Schimbarea scoring-ului operatorilor (`operator_scoring_recompute`), a rapoartelor din
  admin sau a loading board-ului. Ele citesc `reports` și nu trebuie să observe diferența.

## Riscuri și necunoscute

- **Serviciul `bot` de pe Railway poate să nu aibă domeniu public.** `WEBHOOK_URL` din
  `index.ts` sugerează că are. Dacă în S02 nu se poate stabili URL-ul (nu apare în
  `.env`, README sau `.claude/deploy-log.txt`), sesiunea lasă `EXPO_PUBLIC_API_URL`
  gol în `INSTALL.md` cu instrucțiunea «Railway → serviciul bot → Settings → Generate
  Domain» și merge mai departe. Nu e HOLD.
- **`ANTHROPIC_API_KEY` lipsește pe Railway** (era intenționat absent). Fără ea,
  `analyzeCleaningPhoto` întoarce `EROARE`, poza se salvează, operatorul nu e blocat.
  Adăugarea o face Ion în dashboard-ul Railway; `INSTALL.md` o listează. Nu e HOLD.
- **Deploy-ul pe Railway e blocat 05:00–22:00.** `/build` oricum nu deployează; Ion
  rulează `deploy-railway.sh` seara. Codul trebuie să fie compatibil cu botul actual
  (aceleași tabele, aceleași efecte).
- **npm workspaces vs. Expo.** Dacă `npm install` în `peron-android/` sau `npx expo
  ...` se lovește de `node_modules` din root (metro urcă în părinți), S05 adaugă
  `metro.config.js` cu `watchFolders` restrâns la folderul aplicației și
  `resolver.disableHierarchicalLookup = true`. Dacă nici așa nu compilează
  `tsc --noEmit`: `HOLD: spec-wrong` (structura de foldere trebuie regândită).
- **Versiunea SDK-ului Anthropic din bot (`^0.78.0`) suportă `output_config.format`**
  — verificat pe 08.09 în `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts`.
  Dacă build-ul bot pică pe tipul ăsta, S04 trece pe instrucțiune JSON în prompt +
  `JSON.parse` cu fallback `EROARE`. Nu e HOLD.
- **GPS-ul telefonului poate întârzia 5–20 s la prima citire.** Aplicația pornește
  citirea la deschiderea ecranului de cursă, nu la apăsarea «Trimite», și trimite
  ce are (cu `accuracy`) după maximum 15 s. Serverul nu penalizează `accuracy` mare,
  doar distanța.
- **Sarcina reclamă deschisă** pe o mașină se citește azi în bot din `obligations`
  prin `getOpenReclamaTask(plate)`. Aplicația primește lista pe `GET /day`
  (per placă) și afișează întrebarea «a fost reparat?» doar când operatorul alege
  «Totul OK» la reclamă pentru o mașină cu sarcină deschisă — aceeași logică ca
  `report.ts:640–712`.
- **Descrierea uniformei TRANSLUX lipsește.** Fără ea modelul judecă «uniformă» după
  însemne vizibile TRANSLUX și haine de serviciu; verdictul e propunere, operatorul
  confirmă. Ion completează `DRIVER_UNIFORM_DESCRIPTION` (sau dă o poză de referință
  pentru a doua iterație). Nu e HOLD.
- **Migrația 328 nu se aplică de kit.** S01 scrie fișierul și se oprește. Sesiunile
  S02–S04 compilează fără baza nouă (tipurile vin din `packages/db`), dar orice
  test manual pe prod înainte de aplicare va da eroare de coloană — S08 nu face
  apeluri pe prod.

## Cum înțelegem că totul a reușit

- [ ] `packages/db/migrations/328_peron_app.sql` există, a fost aplicat de Ion, iar
      `select source from reports limit 1` merge.
- [ ] În admin, pagina Utilizatori arată butonul «Cod aplicație» la un CONTROLLER din
      Chișinău și afișează un cod de 6 cifre; codul apare în `peron_app_link_codes`.
- [ ] `POST /app/v1/auth/link` cu codul întoarce `{ token, user }`; același cod a doua
      oară → 401. Cererile cu Bearer greșit → 401.
- [ ] `GET /app/v1/day` întoarce cursele zilei din Chișinău cu `state: done | next |
      locked`, repartizarea per cursă, șoferii și auto disponibile, sarcinile reclamă
      deschise per placă, starea curățeniei pe DIMINEATA / ZIUA.
- [ ] `POST /app/v1/report` pe cursa `next` inserează în `reports` o linie cu
      `source = 'app'`, `location_ok` calculat, și după ea loading board-ul din grupul
      adminilor se actualizează, iar la reclamă ≠ OK apare sarcina în `obligations`
      — exact ca după un raport din bot. Pe o cursă `locked` → 409.
- [ ] Pe prima cursă fără setul DIMINEATA complet → 409 `CLEANING_REQUIRED`; la fel pe
      16:25 fără setul ZIUA.
- [ ] `POST /app/v1/driver-photo` cu un JPEG base64 scrie poza în
      `report-photos/soferi/…`, o linie în `driver_appearance_checks` cu verdictele
      modelului și întoarce `driverCheckId`; `POST /app/v1/report` pe OK fără
      `driverCheckId` → 400.
- [ ] `POST /app/v1/cleaning-photo` cu un JPEG base64 scrie poza în
      `report-photos/curatenie/<data>/<slot>/<zona>-<ts>.jpg`, o linie în
      `peron_cleaning_checks` cu `source = 'app'` și întoarce verdictul.
- [ ] Aplicația: login cu cod → ecranul zilei → cursa `next` → un singur ecran cu tot,
      inclusiv poza șoferului cu verdictele propuse → «Trimite» → rezumat → înapoi pe
      grilă cu cursa bifată. Niciun câmp de notă de spălare. Fără să trimită locația
      manual. Pe telefon: `npx expo run:android` sau APK-ul din EAS pornește și
      parcurge fluxul pe prod (verificat de Ion, nu de kit).
- [ ] Butonul «Poze curățenie» deschide camera (nu galeria), cere pe rând 3 zone, arată
      verdictul; la MURDAR arată «Informația se stochează și va fi penalizată».
- [ ] Toate gate-urile din frontmatter sunt verzi la final; `git status` curat;
      nimic din `apps/web`, `apps/voice-llm`, `.claude/` sau `.env*` atins.

---

## S01 — packages/db — migrația 328 (scrisă, neaplicată) și tipurile noi

**Scop:** repo-ul conține migrația 328 și tipurile TypeScript pentru tot ce urmează,
compilează, iar sesiunea se oprește înainte de a atinge baza.

**Pași:**
1. Verifică `ls packages/db/migrations | tail -3` → ultima e `327_piese_retur_fara_acoperire.sql`.
   Dacă există un 328 deja, folosește numărul următor liber și notează în raport.
2. Scrie `packages/db/migrations/328_peron_app.sql`, cu antet în stilul lui 325/326
   (ce, de ce, cine a cerut):
   ```sql
   -- reports: de unde a venit raportul + coordonatele brute (aplicația le trimite)
   alter table reports add column if not exists source text not null default 'bot'
     check (source in ('bot', 'app'));
   alter table reports add column if not exists location_lat double precision;
   alter table reports add column if not exists location_lon double precision;
   alter table reports add column if not exists location_accuracy_m integer;

   -- Poza șoferului la cursă: verdictul modelului și cel confirmat de operator
   create table if not exists driver_appearance_checks (
     id uuid primary key default gen_random_uuid(),
     check_date date not null,
     trip_id uuid not null references trips(id),
     driver_id uuid references drivers(id),
     storage_key text not null,
     person_visible boolean,
     uniform_ok_model boolean,
     groomed_ok_model boolean,
     uniform_ok boolean,          -- confirmat de operator
     groomed_ok boolean,          -- confirmat de operator
     description text,
     model text,
     location_lat double precision,
     location_lon double precision,
     photo_deleted_at timestamptz,
     created_by_user uuid references users(id),
     created_at timestamptz not null default now()
   );
   create index if not exists idx_driver_appearance_checks_day
     on driver_appearance_checks (check_date, trip_id);
   alter table driver_appearance_checks enable row level security;
   alter table reports add column if not exists driver_check_id uuid references driver_appearance_checks(id);

   -- peron_cleaning_checks: sursa, coordonatele, ștergerea pozei după 30 de zile
   alter table peron_cleaning_checks add column if not exists source text not null default 'bot'
     check (source in ('bot', 'app'));
   alter table peron_cleaning_checks add column if not exists location_lat double precision;
   alter table peron_cleaning_checks add column if not exists location_lon double precision;
   alter table peron_cleaning_checks add column if not exists photo_deleted_at timestamptz;

   -- Cod de conectare (6 cifre, 24 h, o singură folosire), generat de admin
   create table if not exists peron_app_link_codes (
     code text primary key,
     user_id uuid not null references users(id),
     created_by uuid references admin_accounts(id),
     created_at timestamptz not null default now(),
     expires_at timestamptz not null,
     used_at timestamptz
   );

   -- Sesiune de aplicație (token-ul stă pe telefon; aici doar hash-ul)
   create table if not exists peron_app_sessions (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references users(id),
     token_hash text not null unique,
     device_label text,
     created_at timestamptz not null default now(),
     last_seen_at timestamptz,
     revoked_at timestamptz
   );
   create index if not exists idx_peron_app_sessions_user on peron_app_sessions (user_id);
   alter table peron_app_link_codes enable row level security;
   alter table peron_app_sessions enable row level security;
   ```
3. În `packages/db/src/types.ts`: la `Report` adaugă `source: 'bot' | 'app'`,
   `location_lat: number | null`, `location_lon: number | null`,
   `location_accuracy_m: number | null`, `driver_check_id: string | null`. Adaugă
   interfețele `PeronAppLinkCode`, `PeronAppSession`, `DriverAppearanceCheck`,
   `PeronCleaningCheck` (mută tipul `CleaningCheckRow` din
   `apps/bot/src/services/db.ts` aici, cu `source` și `photo_deleted_at`, plus
   tipurile `CleaningSlot`, `CleaningZone`, `CleaningVerdict`). Botul importă de aici
   și șterge definițiile locale; `createReport` din bot primește `source?: 'bot' | 'app'`.
4. Exportă tipurile din `packages/db/src/index.ts` (verifică cum sunt exportate celelalte).

**Fișiere:** `packages/db/migrations/328_peron_app.sql` (nou),
`packages/db/src/types.ts`, `packages/db/src/index.ts`, `apps/bot/src/services/db.ts`
(doar înlocuirea tipurilor cu importuri).

**Gata când:** fișierul 328 există și conține exact tabelele și coloanele de mai sus;
`npm run build --workspace=packages/db` verde; `npm run test --workspace=packages/db`
verde; `npm run build --workspace=apps/bot` verde; commit făcut. Sesiunea se oprește
cu `approve: [migration]` — Ion aplică 328.

**Gate-uri:** build-packages, test-db, build-bot.

**Nu atinge:** migrațiile 001–327, `apps/admin`, `apps/web`.

---

## S02 — Autentificare cap-coadă — cod în admin, endpoint de conectare și GET /app/v1/day în bot

**Depinde de:** S01 — tipurile `PeronAppLinkCode`, `PeronAppSession`, `Report.source`.

**Scop:** un operator din Chișinău poate primi un cod de la admin, îl schimbă pe token
și primește starea zilei (curse, repartizări, liste, curățenie) de la bot.

**Pași:**
1. **Admin, pagina Utilizatori** (`apps/admin/src/app/(dashboard)/users/`): server
   action `createPeronAppLinkCode(userId)` în `actions.ts`: refuză dacă user-ul nu e
   `role = 'CONTROLLER'` + `point = 'CHISINAU'` + `active`; generează 6 cifre
   (`crypto.randomInt(100000, 999999)`), reîncearcă la coliziune; `expires_at = now +
   24h`; `created_by` = adminul curent (vezi cum obțin celelalte acțiuni contul admin).
   În UI: buton «📱 Cod aplicație» pe rândul user-ului, afișează codul mare, cu textul
   «valabil 24 h, o singură folosire». Test Vitest pentru generator (6 cifre, interval).
2. **Bot, router HTTP:** `apps/bot/src/api/server.ts` cu
   `handleAppApi(req, res): Promise<boolean>` — întoarce `false` dacă `req.url` nu
   începe cu `/app/v1/`. Citește corpul JSON (limită 8 MB, 413 peste), răspunde JSON
   cu `{ ok: true, ... }` sau `{ ok: false, code, message }`. În `index.ts`, în
   `createServer`, prima linie: `if (await handleAppApi(req, res)) return;` — înaintea
   logicii de webhook, pentru orice metodă.
3. **Bot, auth:** `apps/bot/src/api/auth.ts`: `hashToken(token)` = sha256 hex;
   `linkWithCode(code, deviceLabel)` → validează în `peron_app_link_codes` (există,
   `used_at is null`, `expires_at > now`), user activ CHISINAU CONTROLLER, marchează
   `used_at`, creează sesiunea, întoarce `{ token, user: { id, name, point } }`;
   `authenticate(req)` → user din Bearer (`token_hash`, `revoked_at is null`),
   actualizează `last_seen_at` cel mult o dată pe minut. 401 în rest.
4. **Endpoint `POST /app/v1/auth/link`** `{ code, deviceLabel }` → 200 cu token;
   cod greșit/expirat/folosit → 401 `code: 'BAD_CODE'`.
5. **Endpoint `GET /app/v1/day`** (autentificat), în `apps/bot/src/api/day.ts`,
   refolosind `services/db.ts`:
   - `date` (`getTodayDate()`), `point: 'CHISINAU'`;
   - `trips[]`: `getAllTripsForDirection(getDirectionForPoint('CHISINAU'))`, fiecare cu
     `id, departure_time (HH:MM), state: 'done'|'next'|'locked'` după
     `getReportedTripIds(date, 'CHISINAU')` și regula «prima neraportată = next»;
   - `assignments`: per `trip_id`, din `getAssignmentForTrip` (driver_id, driver_name,
     vehicle_id, plate);
   - `drivers[]`: `getActiveDrivers()` minus `getUsedDriverIds(date, 'CHISINAU')`;
     `vehicles[]`: `getActiveVehicles()` minus `getUsedVehicleIds(...)`;
   - `openReclama`: `{ [plate]: { taskId, description, lastComment } }` din
     `getOpenReclamaTask` pentru fiecare auto activ (sau o singură interogare dacă e
     mai simplu);
   - `climate`: `{ [vehicleId]: 'ac' | 'heat' | null }` din `climateQuestionNeeded`;
   - `cleaning`: `{ DIMINEATA: string[], ZIUA: string[] }` zonele închise din
     `getCleaningZonesDone`; `cleaningGateTripTime: config.cleaningGateTripTime`;
   - `locationExemptTimes: config.chisinauExemptTimes`, `station:
     config.stations.CHISINAU`.
   Funcția pură `tripStates(trips, reportedIds)` în `apps/bot/src/api/dayState.ts`,
   cu test Vitest.
6. **Vitest în bot:** `apps/bot/package.json` → devDependency `vitest`, script
   `"test": "vitest run"`, `apps/bot/vitest.config.ts` cu `include: ['src/**/*.test.ts']`.
   Teste: `hashToken` deterministic + lungime 64; `tripStates` (0 raportate → prima e
   next; toate → toate done; mijloc → una next, restul locked).

**Fișiere:** `apps/admin/src/app/(dashboard)/users/actions.ts`, componenta de listă a
user-ilor din același folder (cea care are butoanele de rol/punct), test nou lângă;
`apps/bot/src/api/server.ts`, `auth.ts`, `day.ts`, `dayState.ts`, `dayState.test.ts`,
`auth.test.ts`; `apps/bot/src/index.ts` (o linie); `apps/bot/package.json`,
`apps/bot/vitest.config.ts`.

**Gata când:** `npm run test --workspace=apps/bot` verde cu ≥3 teste; `npm run build
--workspace=apps/bot` verde; typecheck-admin, test-admin, build-admin verzi; în cod,
`curl -X POST localhost:3000/app/v1/auth/link -d '{"code":"000000"}'` (cu `npm run
dev:bot`, dacă există `.env`) răspunde `401 BAD_CODE`, iar `GET /app/v1/day` fără
Bearer răspunde 401; fără `.env`, se verifică prin citirea codului și se notează în raport.

**Gate-uri:** build-bot, test-bot, typecheck-admin, test-admin, build-admin.

**Nu atinge:** `conversations/*`, `scheduler.ts`, `apps/web`.

---

## S03 — Bot API — POST /app/v1/report și POST /app/v1/vehicle cu validări și efecte secundare

**Depinde de:** S02 — router, `authenticate`, forma lui `/day`.

**Scop:** un raport trimis din aplicație ajunge în `reports` cu aceleași efecte ca un
raport din bot (digest, loading board, sarcină reclamă, validarea zilei).

**Pași:**
1. `POST /app/v1/vehicle` `{ plate }` → `createVehicle(plate)` (în bot tratează 23505
   ca «există deja», la fel ca `report.ts:515–524`) → `{ id, plate_number }`.
2. `POST /app/v1/report`, corp:
   ```ts
   { tripId, status: 'OK' | 'ABSENT', passengersCount: number | null,   // 0–27 la OK
     driverId: string | null, vehicleId: string | null, assignmentChanged: boolean,
     loadingHelpOk: boolean, autoCurat: boolean,
     driverCheckId: string | null,            // poza șoferului (S04); null la ABSENT
     uniformOk: boolean, exteriorOk: boolean, // verdictele confirmate de operator
     reclamaOk: boolean, reclamaProblem: 'bus' | 'panou_ruta' | 'ambele' | null,
     reclamaRepairConfirmed: boolean, reclamaTaskId: string | null,
     acStatus: 'works'|'broken'|'none'|null,
     heatStatus: 'works'|'broken'|'none'|null,
     lat: number | null, lon: number | null, accuracyM: number | null }
   ```
   Logica în `apps/bot/src/api/report.ts`, cu partea pură (validare corp, calcul
   `location_ok`, `late`) în `reportRules.ts` + test Vitest:
   - cursa trebuie să fie `next` (`tripStates`) → altfel 409 `NOT_NEXT`;
   - poarta de curățenie: prima cursă a zilei cere `getCleaningZonesDone(date,
     'DIMINEATA').size === 3`; cursa cu `formatTime(departure_time) ===
     config.cleaningGateTripTime` cere ZIUA → altfel 409 `CLEANING_REQUIRED` cu
     `{ slot, missing: [...] }`;
   - `location_ok`: `null` dacă ora e în `chisinauExemptTimes`; altfel `false` dacă
     lat/lon lipsesc; altfel `haversineDistance(...) <= radiusM`;
   - `late = minutesLate(departure_time)` (utils), ca în bot;
   - la `ABSENT`: toate câmpurile de calitate se scriu `null`, `passengers_count null`;
   - la `OK` fără `driverCheckId` (sau cu un id inexistent / de altă zi) → 400
     `DRIVER_PHOTO_REQUIRED`; `passengersCount` în 0–27 → altfel 400;
     `wash_grade` se scrie mereu `null`;
   - `createReport({... , source: 'app', driver_check_id, wash_grade: null,
     location_lat, location_lon, location_accuracy_m })`; după inserare,
     `update driver_appearance_checks set uniform_ok, groomed_ok` cu valorile
     confirmate; 23505 → 409 `ALREADY_REPORTED`;
   - dacă `assignmentChanged` și există repartizare: `updateAssignmentDriverVehicle`
     ca în `report.ts:540–548`;
   - efecte secundare, în aceeași ordine ca `report.ts:745–830`: `addViolation` (dacă
     locație rea sau `late > 10`; `operator` = `@username` sau `#telegram_id` sau
     numele), `updateLoadingBoard()`, `createReclamaTask` dacă `reclamaProblem` și
     placa (placa din `getVehiclePlate(vehicleId)`), `autoCloseReclamaTask(plate,
     date, reclamaTaskId)` dacă `reclamaRepairConfirmed`; fiecare în `try/catch` cu
     `console.error`, nu strică răspunsul;
   - dacă după inserare toate cursele sunt raportate: `validateDay(user.id, date)`,
     `allDone: true` în răspuns.
   - răspuns: `{ ok: true, summary: string, allDone: boolean }` cu `summary` construit
     exact ca textul din `report.ts:848–866` («☑ 14:30 — 12 pas. | Ion P. · spălare 2
     ⚠ uniformă»).
3. Teste (`reportRules.test.ts`): validare corp (lipsă driverCheckId la OK; 28
   pasageri; ABSENT fără cifră și fără poză e valid), `location_ok` (exempt → null; fără coordonate → false;
   la 50 m → true; la 400 m → false), poarta de curățenie (prima cursă + set incomplet
   → CLEANING_REQUIRED; a doua cursă → nu cere).

**Fișiere:** `apps/bot/src/api/report.ts`, `reportRules.ts`, `reportRules.test.ts`,
`vehicle.ts`; `apps/bot/src/api/server.ts` (rutele noi).

**Gata când:** test-bot verde cu testele de mai sus; build-bot verde; în cod, orice
efect secundar din `report.ts` după `createReport` are echivalent în `api/report.ts`
(listă în raportul sesiunii: digest, loading board, reclamă creare, reclamă închidere,
validare zi).

**Gate-uri:** build-bot, test-bot.

**Nu atinge:** `conversations/report.ts` (nu se refactorizează; se refolosesc doar
funcțiile din `services/*`), `apps/admin`.

---

## S04 — Bot API — POST /app/v1/cleaning-photo, POST /app/v1/driver-photo și ștergerea pozelor după 30 de zile

**Depinde de:** S02 — router și auth; S01 — coloanele `source`, `location_*`,
`photo_deleted_at`.

**Scop:** pozele din aplicație (curățenie și șofer) sunt salvate, judecate de model și
înregistrate, iar fișierele mai vechi de 30 de zile dispar singure.

**Pași:**
1. În `apps/bot/src/services/cleaningCheck.ts` separă `processCleaningPhoto` în două:
   `checkCleaningBuffer({ checkDate, slot, zone, jpeg: Buffer, userId, source,
   lat, lon })` (upload în Storage + `analyzeCleaningPhoto` + `createCleaningCheck`)
   și `processCleaningPhoto` (descarcă din Telegram, apoi apelează
   `checkCleaningBuffer` cu `source: 'bot'`). Comportamentul botului nu se schimbă.
2. `POST /app/v1/cleaning-photo` `{ slot: 'DIMINEATA'|'ZIUA', zone: 'PERON'|'PIETONI'|
   'VECEU', imageBase64, lat, lon }` → 400 dacă base64 nu e JPEG (primele 3 octeți
   `FF D8 FF`) sau depășește 6 MB decodat → `checkCleaningBuffer(..., source: 'app')`
   → `{ ok: true, verdict, problems, description, zonesDone: string[] }`.
3. `apps/bot/src/services/driverCheck.ts`: `analyzeDriverPhoto(jpegBase64)` →
   Claude `claude-opus-5`, `effort: 'low'`, `json_schema` cu `persoana_vizibila`,
   `uniforma`, `aspect_ingrijit`, `descriere`. Prompt (română): inspector TRANSLUX;
   uniforma = `config.DRIVER_UNIFORM_DESCRIPTION`; «aspect îngrijit» = bărbierit sau
   barbă îngrijită, păr aranjat, haine curate; dacă nu se vede o persoană de la
   brâu în sus → `persoana_vizibila: false`. Orice eșec → `{ verdict: 'EROARE' }`
   (aplicația arată verdicte «necunoscut», operatorul le bifează manual).
4. `POST /app/v1/driver-photo` `{ tripId, driverId, imageBase64, lat, lon }` →
   validare JPEG ca la curățenie → upload `report-photos/soferi/<data>/<tripId>-<ts>.jpg`
   → `analyzeDriverPhoto` → insert `driver_appearance_checks` (câmpurile `*_model`
   completate, `uniform_ok`/`groomed_ok` inițial egale cu cele ale modelului) →
   `{ ok: true, driverCheckId, personVisible, uniformOk, groomedOk, description }`.
   `personVisible: false` → 200 cu `code: 'NO_PERSON'` și fără insert (aplicația
   cere refacerea).
5. Scheduler `schedulePeronPhotoRetention()` în `scheduler.ts`: zilnic la 03:10
   Chișinău (același tipar ca `scheduleDailyDigest`): pentru `peron_cleaning_checks`
   și `driver_appearance_checks`, liniile cu `created_at < now() - 30 zile` și
   `photo_deleted_at is null`: șterge `storage_key` din bucket-ul `report-photos`
   (`.remove([...])` în loturi de 100), pune `photo_deleted_at = now()`. Loghează
   numărul șters. Înregistrează în `index.ts` lângă celelalte schedulere.
6. Test Vitest pentru funcția pură `isJpeg(buffer)`, pentru calculul pragului de
   30 de zile (`retentionCutoff(now)`) și pentru parsarea răspunsului modelului
   (`parseDriverAnswer`: câmp lipsă → EROARE).

**Fișiere:** `apps/bot/src/services/cleaningCheck.ts`, `apps/bot/src/services/driverCheck.ts`,
`apps/bot/src/api/cleaning.ts`, `apps/bot/src/api/driverPhoto.ts`,
`apps/bot/src/api/cleaning.test.ts`, `apps/bot/src/scheduler.ts`,
`apps/bot/src/index.ts`, `apps/bot/src/config.ts` (`DRIVER_UNIFORM_DESCRIPTION`),
`apps/bot/src/services/db.ts` (`createCleaningCheck` primește `source`,
`location_lat/lon`; funcții noi `createDriverCheck`, `getDriverCheck`,
`confirmDriverCheck`, `getExpiredPhotos`, `markPhotosDeleted`).

**Gata când:** build-bot și test-bot verzi; `conversations/cleaningPhotos.ts` compilează
neschimbat; în `index.ts` apare `schedulePeronPhotoRetention()`; `driverCheck.ts` nu
conține nicio descriere inventată a uniformei în afara constantei din config.

**Gate-uri:** build-bot, test-bot.

**Nu atinge:** promptul și criteriile din `cleaningCheck.ts` (`SYSTEM_PROMPT`,
`ZONE_TASK`, `OUTPUT_SCHEMA`), `apps/admin`.

---

## S05 — Aplicația Expo — schelet, login cu cod, ecranul zilei

**Depinde de:** S02 — forma răspunsurilor `/auth/link` și `/day`.

**Scop:** aplicația compilează, se conectează cu un cod și arată grila curselor zilei
cu starea fiecăreia.

**Pași:**
1. `npx create-expo-app@latest peron-android --template blank-typescript` la rădăcina
   repo-ului (în afara `apps/`). `package.json` cu `"name": "translux-peron"`,
   `"private": true`. Adaugă `peron-android/node_modules/`, `peron-android/.expo/`,
   `peron-android/.env` în `.gitignore` din root (doar aceste 3 linii). Lockfile-ul
   aplicației **se commitează**.
2. Dependențe: `expo-router`, `expo-secure-store`, `expo-location`, `expo-camera`,
   `expo-image-manipulator`, `react-native-safe-area-context`, `react-native-screens`.
   `app.json`: `name: "TRANSLUX Peron"`, `slug: "translux-peron"`, `android.package:
   "md.translux.peron"`, permisiuni `CAMERA`, `ACCESS_FINE_LOCATION`; plugin-urile
   pentru cameră și locație cu textele de permisiune în română («Aplicația face poze
   la peron pentru verificarea curățeniei», «Locația confirmă că raportul e făcut
   la stație»). `tsconfig.json` cu `strict: true`.
3. `src/api.ts`: `API_URL = process.env.EXPO_PUBLIC_API_URL`; funcții tipizate
   `link(code, deviceLabel)`, `getDay()`, `postReport(body)`, `postVehicle(plate)`,
   `postCleaningPhoto(body)`; token din `expo-secure-store` (`cheie: 'peron_token'`);
   401 → șterge token-ul și trimite la login; erori de rețea → `ApiError('OFFLINE')`.
   Tipurile răspunsurilor în `src/types.ts`, copiate manual după S02/S03 (aplicația nu
   importă din `packages/db`).
4. Ecrane (`app/`): `index.tsx` (redirect după token), `login.tsx` (câmp 6 cifre,
   tastatură numerică, buton «Conectează», eroare «Cod greșit sau expirat»; la succes
   cere permisiunea de locație cu explicația de mai sus), `day.tsx` (antet
   «⚔ DD.MM.YYYY — Chișinău · Completate N/M», grilă 4 coloane cu ✅ / ▶ / 🔒 ca în
   bot, tap pe ▶ → `/trip/[id]`, tap pe 🔒 → toast «Completează mai întâi ora HH:MM»,
   buton «📷 Poze curățenie» → `/cleaning`, buton «Reîncarcă»). `day.tsx` reîncarcă
   `/day` la fiecare focus.
5. `src/theme.ts`: fonturi mari (butoane ≥ 56 px înălțime, text ≥ 18), contrast mare
   — se folosește la soare, cu o mână.
6. `.env.example` cu `EXPO_PUBLIC_API_URL=https://<domeniul-serviciului-bot>`.

**Fișiere:** `peron-android/**` (nou), `.gitignore` (3 linii).

**Gata când:** `cd peron-android && npm install && npx tsc --noEmit` verde; `npx expo
export --platform android` (bundle JS, fără build nativ) se termină fără eroare;
root-ul nu s-a schimbat (`git status` arată doar `peron-android/` și `.gitignore`);
`npm run build --workspace=packages/db` încă verde.

**Gate-uri:** typecheck-app (+ build-packages ca dovadă că root-ul e neatins).

**Nu atinge:** `package.json` din root, `apps/*`, `packages/*`.

---

## S06 — Aplicația — ecranul de cursă pe un singur ecran, cu poza șoferului și GPS automat

**Depinde de:** S05 — client API, ecranul zilei; S03 — corpul lui `/report`; S04 —
`/driver-photo`.

**Scop:** operatorul raportează o cursă de pe un singur ecran, cu 2–3 atingeri în cazul
obișnuit, iar locația pleacă singură.

**Pași:**
1. `app/trip/[id].tsx`, secțiuni de sus în jos, toate pe un ecran cu scroll:
   - **Antet:** ora cursei; dacă `minutesLate > 10` (calcul local din ora telefonului)
     o bandă galbenă «Întârziere: N min — se va nota».
   - **Pasageri:** câmp numeric mare (0–27), butoane rapide −/+, buton «Absent» care
     ascunde tot ce urmează.
   - **Șofer și auto:** cardul repartizării din `/day` («👤 Ion Moldovan · 🚌 LYY 735»)
     cu «✅ OK» (implicit selectat) și «✏️ Schimbă» → două liste derulante (șoferi
     disponibili, auto disponibile) + «+ Adaugă auto» (câmp placă → `postVehicle`)
     + «Fără șofer» / «Fără auto». Fără repartizare → listele apar direct.
   - **Poza șoferului:** card cu «📷 Fă poza șoferului» → `CameraView` (aceeași
     componentă ca la curățenie, S07 o mută în `src/camera.ts`; în S06 se scrie aici
     și S07 o refolosește), comprimare 1280 px / JPEG 0.8, `postDriverPhoto`. După
     răspuns: miniatura pozei și două verdicte mari «Uniformă: da/nu», «Aspect
     îngrijit: da/nu», verzi când e «da», roșii când e «nu»; atingerea unui verdict
     îl răstoarnă (operatorul corectează modelul); «Refă poza». `NO_PERSON` → «Nu se
     vede șoferul, refă poza». EROARE → verdictele apar gri «necunoscut» și
     operatorul le bifează manual. Fără poză nu se poate trimite un raport OK
     (Absent nu cere poză).
   - **Calitate** (toate implicit OK, atingere = schimbă): «Ajută la încărcat»
     Da/Nu; «Auto exterior curat» Da/Nu; «Reclamă» Totul OK / Doar autobuz / Doar
     panou rută / Ambele — dacă auto ales are `openReclama[plate]` și se alege
     «Totul OK», apare cardul «🔧 Era marcat defect: … A fost reparat?» cu «Da,
     reparat» / «Nu, încă defect» (Nu → forțează alegerea unui defect), ca în
     `report.ts:664–712`; fără notă de spălare; «Clima» apare doar dacă
     `climate[vehicleId]` ≠ null:
     «❄️ Aerul condiționat» sau «🔥 Căldura» — Lucrează / Stricat / Nu are.
   - **Locație:** rând mic «📍 se caută…» → «📍 42 m de stație» / «📍 fără GPS»;
     `expo-location` pornește la montarea ecranului (`getCurrentPositionAsync`,
     `accuracy: High`, timeout 15 s), fără nicio acțiune a operatorului.
   - **Trimite:** dezactivat până la cifră validă și poza șoferului (sau Absent);
     la apăsare → `postReport`; succes → ecran/alertă cu `summary` și, dacă `allDone`,
     textul «✦ MISIUNE ÎNDEPLINITĂ …» din bot; apoi înapoi pe `day`.
   - Erori: `OFFLINE` → «Fără internet. Datele rămân aici, apasă din nou când revine
     semnalul.» (nimic nu se pierde); `CLEANING_REQUIRED` → «Înainte de cursa HH:MM
     trebuie pozele de curățenie» + buton spre `/cleaning`; `NOT_NEXT` /
     `ALREADY_REPORTED` → mesaj și înapoi pe `day`.
2. Logica pură (construirea corpului din starea ecranului, validarea locală) în
   `src/buildReport.ts`, ca să fie testabilă; test minim cu `node --test` sau fără
   test dacă nu există runner — dar funcția să fie separată de componentă.

**Fișiere:** `peron-android/app/trip/[id].tsx`, `peron-android/src/buildReport.ts`,
`src/components/*` (butoane de opțiune, card).

**Gata când:** typecheck-app verde; `buildReport` produce, pentru starea «Absent», un
corp cu `status: 'ABSENT'`, `driverCheckId: null` și toate câmpurile de calitate
`null`; pentru starea implicită cu 12 pasageri și verdictele modelului confirmate →
toate `*_ok: true`, `reclamaOk: true`, `driverCheckId` setat; corpul nu conține
`washGrade`; ecranul nu are niciun buton de «trimite locația» și niciun buton
manual de uniformă/aspect în afara verdictelor de sub poză.

**Gate-uri:** typecheck-app.

**Nu atinge:** `apps/*`, `packages/*`.

---

## S07 — Aplicația — pozele de curățenie cu camera, poarta 06:55 / 16:25, config APK

**Depinde de:** S05, S06; S04 — `/cleaning-photo`.

**Scop:** operatorul face cele 3 poze doar cu camera aplicației, primește verdictul pe
loc, iar prima cursă și 16:25 sunt blocate în aplicație până când setul e complet.

**Pași:**
1. `app/cleaning.tsx`: alege tura după oră (până la 12:00 → DIMINEATA, altfel ZIUA)
   și după `cleaning` din `/day` arată cele 3 zone cu stare (✅ / ⬜). Pentru prima
   zonă neînchisă: textul de cadru din `ZONE_HINT` (copiat), buton «📷 Fă poza» →
   `CameraView` pe tot ecranul, buton mare de declanșare, previzualizare cu «Trimite»
   / «Refă». Nicio cale spre galerie.
2. După captură: `expo-image-manipulator` → lățime 1280, JPEG 0.8, `base64: true`;
   locația curentă (aceeași funcție ca la cursă); `postCleaningPhoto`. Răspuns:
   CURAT → card verde cu descrierea; MURDAR → card roșu cu problemele și textul
   «⚠️ Informația se stochează și va fi penalizată.»; ALT_LOC → «Poza nu pare din
   zona …, refă din locul corect» și rămâne pe aceeași zonă; EROARE → «Verificarea
   automată nu a mers, poza e salvată» și trece mai departe. La 3/3 → «✔ Pozele de
   curățenie sunt complete» și înapoi.
3. Poarta în `day.tsx`: dacă cursa `next` e prima a zilei și `cleaning.DIMINEATA`
   are < 3 zone, sau e `cleaningGateTripTime` și `cleaning.ZIUA` are < 3, atingerea
   pe ▶ deschide `/cleaning` cu bandă «Înainte de cursa HH:MM trebuie pozele de
   curățenie». Serverul verifică oricum (S03).
4. `eas.json`: profil `preview` cu `android.buildType: "apk"`, `distribution:
   "internal"`, `env.EXPO_PUBLIC_API_URL` citit din secretul EAS sau lăsat de
   completat; profil `production` identic pentru moment.
5. `peron-android/INSTALL.md` (română): (a) `ANTHROPIC_API_KEY` pe serviciul bot din
   Railway; (b) domeniul public al serviciului bot și valoarea `EXPO_PUBLIC_API_URL`;
   (c) `npm i -g eas-cli`, `eas login`, `eas build -p android --profile preview`,
   descărcarea APK-ului și instalarea pe telefon (permite «surse necunoscute»);
   (d) generarea codului în admin → Utilizatori → «📱 Cod aplicație»; (e) ce vede
   operatorul în prima zi. Include și cum se revocă o sesiune (`update
   peron_app_sessions set revoked_at = now() where user_id = …`).

**Fișiere:** `peron-android/app/cleaning.tsx`, `peron-android/app/day.tsx`,
`peron-android/src/camera.ts`, `peron-android/eas.json`, `peron-android/INSTALL.md`.

**Gata când:** typecheck-app verde; `grep -r "expo-image-picker\|launchImageLibrary"
peron-android/app peron-android/src` nu găsește nimic; `eas.json` are profilul
`preview` cu `buildType: "apk"`; `INSTALL.md` conține cei 5 pași.

**Gate-uri:** typecheck-app.

**Nu atinge:** `apps/*`, `packages/*`.

---

## S08 — Verificare — toate gate-urile, scenariul operatorului parcurs pe cod, lista pentru telefon

**Depinde de:** S01–S07.

**Scop:** dovada că totul din «Cum înțelegem că totul a reușit» care se poate verifica
fără telefon și fără prod este verificat, iar restul e o listă clară pentru Ion.

**Pași:**
1. Rulează toate gate-urile din frontmatter-ul acestei sesiuni; roșu = repari aici.
2. Parcurge pe cod scenariul: cod în admin → `/auth/link` → `/day` → prima cursă fără
   set DIMINEATA → 409 → `/cleaning-photo` ×3 → `/report` pe 06:55 → efecte
   secundare → … → 16:25 fără set ZIUA → 409. Pentru fiecare pas notează fișierul și
   funcția care îl face. Orice pas fără implementare = repari sau `HOLD: spec-wrong`.
3. Verifică că `apps/bot/src/conversations/report.ts` și `cleaningPhotos.ts` sunt
   neschimbate față de commit-ul `751c154` cu excepția importurilor de tipuri
   (`git diff 751c154 -- apps/bot/src/conversations/`).
4. Verifică `git status` curat, nimic în `.env*`, `.claude/`, `apps/web`,
   `apps/voice-llm`.
5. Scrie `docs/specs/peron-app-android.verificare.md`: lista de mai sus bifată +
   secțiunea «De făcut de Ion pe telefon» (aplică 328 dacă nu e aplicată; cheia pe
   Railway; deploy bot după 22:00; build APK; cod pentru Vitalie/Iurie/Aurel; o zi de
   test în paralel cu botul).

**Fișiere:** `docs/specs/peron-app-android.verificare.md` (nou); corecții mici unde e
nevoie.

**Gata când:** toate gate-urile verzi într-o singură rulare, raportul de verificare
există și nu conține niciun punct «nu am putut verifica» fără explicație.

**Gate-uri:** build-packages, build-bot, test-bot, typecheck-admin, test-admin,
typecheck-app.

**Nu atinge:** nimic în afara corecțiilor strict necesare pentru gate-uri.
