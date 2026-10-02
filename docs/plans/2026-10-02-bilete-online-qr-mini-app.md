# Bilete online pe translux.md: plată maib → bilet cu QR → mini app-ul șoferului (ION-190)

Versiunea 5 (02.10.2026, după runda 3 a revizorilor Claude și runda 3 a criticului Codex — ultimele; corecțiile v5
sunt acceptări ale observațiilor rundei 3 Codex, nu mai sunt re-verificate de el). Plan dezbătut, nu cod.
Ion (02.10): «am nevoie de 3 runde Claude / GPT ca ideea să se dezbată». Fundația tehnică există din ION-188
(clientul maib, callback-ul semnat, `maib_checkouts`, pagina `/plati`). Lansarea anunțată șoferilor (ION-189): după
12 octombrie; «șoferii care nu vor avea cont Telegram și telefon prin care se identifică clienții nu vor fi lăsați
să plece la cursă».

## De ce

Site-ul translux.md are trafic real (13.038 căutări și 946 apeluri către șoferi în ultimele 7 zile), dar nu vinde
nimic: pasagerul sună șoferul și plătește în autobuz. Aplicația TIKI/Mobilet, singurul canal online de azi, a vândut
55 bilete într-un an, față de ~835/zi la terminalul șoferului — canalul online există doar pe hârtie. Ion vrea:
pasagerul plătește pe site cu cardul (maib Checkout), primește un bilet cu QR, iar șoferul, din grupa Mejgorod,
deschide un mini app Telegram care îi arată cursa lui și pasagerii plătiți și scanează QR-ul la urcare. Mini app-ul
trebuie să fie «bulletproof, ultra fast, nu tot ce avem acum».

Ce NU se decide aici (Ion, 02.10): locurile / cota pe cursă («pe urmă lucrăm»). Planul lasă un singur loc pentru ele.

## Ce facem

### Decizia: trei piese, toate în `apps/admin` + o fereastră subțire pe `apps/web`

1. **Comanda și biletul** trăiesc în central-hub (`apps/admin`), lângă `lib/maib`: `apps/web` are doar cheia
   anon (F5) și nu poate scrie, nici citi `app_config` (F29); site-ul cheamă un API al panoului cu o cheie comună
   (tiparul `CAMIOANE_API_KEY`, F6) atât pentru configurație (steaguri, rute active) cât și pentru comandă, și
   redirecționează pasagerul la maib. Fără răspuns de la API, vânzarea e ÎNCHISĂ. Pagina biletului de pe translux.md
   citește biletul prin același API, cu codul din link ca secret. Prețul se calculează O SINGURĂ DATĂ, pe server,
   dintr-o funcție comună (pasul 2).
2. **QR-ul = codul biletului**, 20 de caractere Base32 Crockford (100 de biți, neghicibil), afișat și ca text. Nu
   conține date; e cheia într-o listă pe care mini app-ul șoferului o are descărcată pentru cursa lui, deci scanarea
   merge și fără rețea, cu regula: un cod care NU e în listă e «neconfirmat» (portocaliu), nu «fals» (roșu), fiindcă
   lista poate fi veche (vânzarea rămâne deschisă până la 30 min înainte).
3. **Mini app-ul șoferului** = o pagină HTML + JavaScript simplu (fără React, fără layout-ul panoului), servită de un
   Route Handler `apps/admin/src/app/mini-app/bilete/route.ts`, cu logica (clasificarea scanării, coada offline)
   scrisă într-un modul TypeScript testat și inclusă la build (ARH-13). Deschisă din grupa Mejgorod printr-un link
   direct `https://t.me/<bot>/bilete?startapp=azi` (butoanele `web_app` sunt interzise în grupuri, F8). Identitatea =
   `initData` verificat HMAC (funcția pură extrasă din `lib/zadachnik/auth.ts`, F9) + legarea șofer ↔ Telegram prin
   numărul de telefon, acceptată DOAR când contactul trimis botului e al expeditorului însuși (`contact.user_id ===
   from.id`; telefoanele șoferilor sunt publice pe site, F18). Toți cei 66 de șoferi interurbani activi au telefon (F3).
4. **Banii online intră în rapoartele de încasare** — în AMBELE (pe șofer `get_incasare_report` și pe rută
   `get_grafic_report`, F17/F27), pe ACEEAȘI cheie ca sesiunea de numărare (rută-zi, tur+retur pe șoferul sesiunii,
   BL-12), ca pasageri online valorizați cu REGULILE NUMĂRĂRII (tronsoane suburbane pe district, lung/scurt, excepția
   rutei 58 — aceeași logică pe care o are azi `calculateDirection`; funcția SQL din 097 e doar suburbană, F32), la rata ZILEI
   CURSEI, calculată la raport, nu la vânzare (C5/BL-19), pentru biletele `valid` + `urcat` ale cursei (fără condiție
   de timp — BL-13), intrând și în SUMA încasată și în toate ramurile de STARE ale rândului (BL-17). Altfel șoferul
   apare cu lipsă sau rândul iese `underpaid` cu diferență zero.
5. **O singură cale de refund** pentru comenzile cu bilete: `anuleazaSiReturneaza()`; pagina `/plati` (ION-188)
   recunoaște checkout-urile legate de o comandă și o cheamă pe ea sau refuză (C2/BL-14).

### Variante respinse

- **V2 — totul în `apps/web` cu cheie service_role**: ar duplica clientul maib și ar pune cheile băncii și ale bazei
  pe suprafața publică cea mai expusă (site-ul, scraper-ii din migr. 334). Respins.
- **V3 — vânzarea prin bot/mini app Telegram și pentru pasageri**: pasagerii nu sunt în Telegram-ul nostru (nicio bază
  de pasageri, F3), iar cererea e pe site (13.038 căutări/săpt.). Respins pentru v1.
- **Pentru șofer, V2 — aplicație nativă (APK)**: APK-ul de peron nu e construit nici el, distribuția pe 66 de telefoane
  fără magazin e lentă, iar Telegram e deja pe toate (ION-189 o cere). Respins.
- **Pentru șofer, V3 — comenzi în chat privat cu botul, fără scanner**: botul nu cunoaște niciun șofer (F3), n-are
  scanner. Respins; chatul privat rămâne calea de rezervă dacă `initData.user` lipsește la linkul direct (F8).
- **Pentru mini app, V4 — pagină React în App Router, ca zadachnik/atribuiri**: layout-ul rădăcină încarcă două
  fonturi Google și `globals.css` pe orice rută (F23), paginile existente au 150 KB JS (F11). Respins (ARH-3).
- **Pentru configurația site-ului, V5 — RPC `SECURITY DEFINER` deschis pentru anon**: ar fi a doua cale de acces la
  `app_config` de pe suprafața publică; API-ul cu cheie există deja pentru comandă. Respins; se reconsideră dacă API-ul
  adaugă latență vizibilă la căutare (se măsoară la pasul 3).

## 🔬 Verificat pe viu

| # | Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|---|
| F1 | Site-ul nu vinde / nu rezervă nimic | Explore pe `apps/web` (02.10) | Doar `searchTrips` (`apps/web/src/app/(public)/actions.ts:290`) + buton `tel:` (`NowResults.tsx:446`); `TripResult` (:21-33) n-are `crm_route_id`, direcție, opriri | Pasul 3 |
| F2 | Cererea e pe site, nu în TIKI | SQL `search_log`, `call_clicks`, `tiki_tickets` (02.10) | 13.038 căutări, 946 apeluri în 7 zile; TIKI «Aplicația tiki»: 55 bilete (19.11.2025–21.04.2026); «Terminal»: 164.494 numerar + 15.648 POS din 11.03.2026 | v1 pe web; volum mic |
| F3 | Șoferii se pot lega de Telegram prin telefon | SQL `drivers`, `users`, `daily_assignments` ∪ `crm_routes` (02.10) | `drivers` n-are telegram_id; `users` are 10 rânduri (ADMIN/CONTROLLER/DIGITAL/MANAGER_LDE), 8 cu Telegram, niciun șofer; 66 șoferi activi non-LDE, **66 cu telefon**; 46 șoferi pe interurban în 14 zile, **46 cu telefon** | Pasul 7 acoperă 100 % |
| F4 | O plecare concretă e identificabilă | migr. 010/013/020/263/270 + SQL coloane | `daily_assignments` UNIQUE (`crm_route_id`, `assignment_date`); tur/retur = `driver_id`/`driver_id_retur`, `retur_route_id`; `crm_stop_fares(stop_order unic pe rută, hour_from_*)`; 30 rute interurbane active, 362 opriri vizibile; azi 34 curse, 32 șoferi | Cheia biletului |
| F5 | `apps/web` nu poate scrie în bază | `apps/web/src/lib/supabase.ts`, migr. 076 | doar `SUPABASE_ANON_KEY`; anon INSERT doar în `search_log`, `page_views`, `call_clicks` (076:63-73); niciun route web → admin; asistentul e chemat din browser cu CORS (`site-assistant/cors.ts:6-11`) | Decizia 1 |
| F6 | Tipar «API între servicii cu cheie» | `apps/admin/src/app/api/extern/camioane-banda/route.ts:48-67` | Bearer + `timingSafeEqual`; **plafonul e în memoria instanței** (:58-67) | cheia da, plafonul în bază (F24) |
| F7 | Prețul se poate recalcula pe server | `apps/web/src/lib/timetable.ts:58-144`, `actions.ts:100-129, 361-400, 433-468`, `apps/admin/src/lib/trips-search.ts:105-151,410` | `buildScheduledTrips`: `price = round(km × rate)`; rata zilei, oferta după numele localităților și km-ii după `normalizeStop(nume)` stau în `actions.ts`; a treia copie în `trips-search.ts` (asistentul) | Pasul 2 |
| F8 | Butonul mini app în GRUP | Telegram Bot API (căutare web, 02.10) + docs Mini Apps | `web_app` «Available only in private chats between a user and the bot»; în grupă doar `url` → `https://t.me/<bot>/<app>?startapp=…`; docs nu spun explicit că `user` e prezent la linkul direct | **Neverificat** → pasul S + rezerva `/start bilete` |
| F9 | Verificarea initData există | `apps/admin/src/lib/zadachnik/auth.ts:28-84` | HMAC «WebAppData», 24 h, `!==` (:43), ocol `__dev__` (:61-70), fără teste; consumatori: 7 rute zadachnik + `atribuiri/auth.ts:1` | Pasul 7a |
| F10 | Scanner QR în Telegram | docs Mini Apps (02.10) | `showScanQrPopup` Bot API 6.4+; `requestContact` 6.9+; `CloudStorage` cu valori mici | Pasul 8; fără CloudStorage |
| F11 | «Ce avem acum» măsurat | curl 02.10 pe `/mini-app/zadachnik`, `/mini-app/atribuiri` | HTML 0,33 s TTFB; **8 scripturi, 150 KB JS comprimat**; polling SDK 50 ms (`zadachnik/ui.ts:54-64`); 2 drumuri; fără offline | Bugetul pasului 8 |
| F12 | maib: refund și expirare | ION-188 + sandbox 02.10 | sesiunea expiră în 25 min; refund `Created` → `getRefund` Accepted/Rejected/Manual; `getPayment.refundedAmount`; callback doar la succes; «nu există» = HTTP 200 + cod `-1800` | Pașii 5, 6 |
| F13 | Grupa Mejgorod | `packages/db/src/types.ts:26`, `grafic-group.ts:20-31`, SQL `app_config` | chat id `-5306064926` în `app_config.grafic_group_chat_id`; postează doar admin; singurul `web_app` din repo e în privat (`atribuiri/verify.ts:373`) | Pasul 9 |
| F14 | QR în repo | grep `qrcode` | `qrcode ^1.5.4` în `apps/admin/package.json:31`, neimportat | Pasul 4 |
| F15 | Cine deployează ce | CLAUDE.md, `deploy-railway.sh:39-40` | central-hub la fiecare push pe main; botul din `deploy-bot` | Ordinea; pasul 7 |
| F16 | Anunțul lansării | `tp view ION-189` | zilnic 08:00 până la `app_config.bilete_online_lansat`; «după 12 octombrie»; cron pe VPS (Vercel Hobby: 2 cron-uri, ocupate) | Pașii 5, 10 |
| F17 | Încasarea pe șofer | `060_anomaly_grafic_history.sql:20-27, 95-99` | `get_incasare_report`: `diff = cash + diagrama + ligotniki0 + rashodi − numarare.suma`; `numarare.suma` din `counting_sessions.tur/retur_total_lei`, pe `cs.driver_id` al sesiunii rută-zi (tur + retur pe același șofer) | Decizia 4, pasul 4b |
| F18 | Telefonul șoferului e public | `actions.ts:407,457`, `public_drivers_view` | pe fiecare card de cursă | Pasul 7 |
| F19 | Șoferul de retur | `apps/web/src/lib/assignments.ts:93-118` | returul se rezolvă prin `retur_route_id` (override) | Pasul 2b |
| F20 | Botul și `/start` cu payload | `apps/bot/src/handlers/start.ts:13-17`, `bot.ts:381`, `middleware/auth.ts:9-26` | orice payload → `validateInviteToken`; botul primește orice mesaj privat; auth cunoaște doar `users` | Pasul 7b |
| F21 | Normalizarea telefonului | `packages/db/src/driver-phone.ts:12` | `normalizeDriverPhone` → `373XXXXXXXX`; `apps/web/src/lib/phone.ts` e doar afișare | Pasul 7b |
| F22 | Secretul biletului s-ar scurge | `apps/web/src/app/api/analytics/track/route.ts:55-62`; `actions.ts:279`, `visitor.ts:9` | `page_views.path` primește calea întreagă; sarea `ip_hash` de pe site = cheia anon | Pasul 3; sare separată (SEC-17) |
| F23 | Layout-ul rădăcină al panoului | `apps/admin/src/app/layout.tsx:2-36` | 2 fonturi Google + `globals.css` pe orice rută | Decizia 3 |
| F24 | Plafon corect în bază există | migr. 334, `actions.ts:296-312` | RPC `cautari_recente` numără în `search_log` pe `ip_hash`/10 min | Pasul 4a |
| F25 | pg_cron are precedent | `439_analytics_vizitatori_unici.sql:43` | job pg_cron în proiect | Pasul 5c |
| F26 | Sesiunea maib se regăsește după orderId | **sandbox 02.10** (`proba-orderid.mts`): creare cu `orderInfo.id`, apoi `GET /v2/checkouts?orderId=…` | HTTP 200, `result.items` cu exact 1 element = sesiunea creată (`result.count`, `totalCount`); parametrii necunoscuți sunt ignorați (întoarce tot) — filtrul trebuie scris exact `orderId`; docs: și `status`, `createdAtFrom/To`, `count`, `offset` | Pasul 4d/5a: `findCheckoutByOrderId` (C3 închis) |
| F27 | Încasarea pe rută | `320_grafic_report_numerar_manual.sql:245, 277, 298, 311-312` | `get_grafic_report` are aceeași formulă; returul override e pe rândul rutei A | Pasul 4b (BL-11/12) |
| F28 | Cum numără camera | `apps/admin/src/app/(dashboard)/numarare/calculation.ts:57-66` | pasager = km × rată, FĂRĂ ofertă | Pasul 4b (BL-15) |
| F29 | anon nu vede `app_config` | SELECT pe `pg_policies` (revizorul ARH, 02.10) | RLS pornit, nicio politică pentru anon | Decizia 1, pasul 3 (ARH-11) |
| F30 | `/plati` atinge toate plățile | `(dashboard)/plati/actions.ts:61, 104, 179-218, 222-236`, `PlatiClient.tsx:130,135` | listează toate `maib_checkouts`; «Returnează» și «Verifică refund-ul» scriu doar în `maib_checkouts`; inserarea în `maib_checkouts` e în acțiune, nu în client (`lib/maib/client.ts:217,233`) | Decizia 5, pașii 4a (C1), 6 (C2/BL-14), 5a/6 (C4) |
| F31 | Regiunile Vercel | `apps/admin/vercel.json:4`, `apps/web/vercel.json` | panoul e fixat pe `dub1`; site-ul nu are regiune fixată (implicit `iad1`) → fiecare apel web → admin traversează Atlanticul | Pasul 3: `config()` cu cache 60 s în site; pasul 4c ruta `config` fără cheie; latența se măsoară; dacă > 50 ms, site-ul se fixează pe `dub1` (ARH-20) |
| F32 | Prețul numărării ≠ prețul public | `numarare/calculation.ts:52-55, 93-96, 123, 166-180`, `numarare/CountingForm.tsx:355`, migr. `092_otaci_58_single_tariff_confort2.sql:8`, `021_numarare_pasageri.sql:18` | pentru rutele INTERURBANE referința e `calculateDirection` (`calculation.ts:55-145`): rata suburbană pe tronsoanele din districtul de start, `rate_long` la scurții non-suburbani, FĂRĂ rotunjire pe tronson, totalul rotunjit la 2 decimale (:102,127,145); funcția SQL `recompute_suburban_session_total` (097:42,58,60,78) e DOAR pentru rutele suburbane (iese imediat la celelalte, citește doar `rate_suburban`, rotunjește 0,20 pe tronson) — NU e oglinda calculului interurban; ruta 58 are tarif unic (092); sesiunea de numărare e UNIQUE (`crm_route_id`, `assignment_date`) | Decizia 4, pasul 4b: funcția SQL pe segment pentru interurban se scrie după `calculateDirection`, nu după 097; 097 rămâne pentru suburban (C5, runda 3) |

## Fluxul, pe scurt

```
translux.md: căutare → GET admin /api/bilete/public/config (steaguri, rute active, închidere) → card cursă (sale_open) →
             «Cumpără bilet» → nume, telefon, locuri 1–4, consimțământ, idempotency_key, ip_hash (calculat pe web) →
             POST admin /api/bilete/comanda
admin: plafon în bază → preț din packages/db → comanda «noua» → maib createCheckout (orderId = id comandă) →
       TRANZACȚIE: rând maib_checkouts + checkout_id pe comandă → checkoutUrl
maib: plată → callback semnat → (checkoutId necunoscut? → comanda după orderId, rând maib_checkouts din corpul semnat) →
      bilete_marcheaza_platita(checkout) → N bilete cu cod QR; eroare RPC → 500 (maib reîncearcă)
pasager: /<lang>/bilet/<cod> (noindex, no-store, fără tracking) → QR + text + «Anulează» (până la T−2h → refund automat;
         biletele «anulat» în același UPDATE, înaintea apelului la maib)
șofer: grupa Mejgorod → «🎫 Biletele mele» (t.me/<bot>/bilete) → HTML+JS mic: cursa de azi (tur/retur ca în web),
       pasagerii pe opriri, vârsta listei, scanare QR (verde / portocaliu neconfirmat / roșu) → «urcat» în coadă → sincronizare
admin: /bilete — comenzi, alerte, refund (aceeași funcție), «emite biletele» la platita_fara_bilet, șoferi nelegați;
       Încasare + Raport grafic: + pasageri online pe sesiunea rută-zi
```

## Pași

Ordinea e obligatorie (ARH-2/ARH-14/ARH-18): **0 → 1 → 2 → 4 (cu comanda de test ÎN pasul 4) → 6 → 11a → 5 → 3
(ascuns sub steag) → S → 7 → 8 → 9 → 11b → 10.** Fiecare pas e un tichet separat; nimic nu devine vizibil pasagerilor
până la pasul 10. Pașii 4 și 6 ating callback-ul și `/plati` ale TUTUROR plăților maib (ION-188), iar central-hub se
livrează la fiecare push: de aceea proba de la sfârșitul pasului 4 (comanda de test + plata în sandbox + callback) și
testele pasului 6 sunt CONDIȚIE DE PUSH, nu pas ulterior. Notificările șoferului se definesc în 5a și pornesc după 7.

### Pasul 0 — Pregătiri fără cod (Ion)
1. BotFather → `/newapp` pe botul existent: numele scurt `bilete`, URL `https://central-hub-md.vercel.app/mini-app/bilete`;
   env `TELEGRAM_BOT_USERNAME` pe central-hub (numele botului nu e în cod, F13).
2. Un **grup Telegram de test** cu botul înăuntru și 2–3 șoferi/telefoane (Android + iPhone), pentru pasul S (ARH-15).
3. Cheile maib de producție (după feedback-ul din ION-188) → `MAIB_*` pe Vercel central-hub.
4. Răspunsurile la «Întrebări pentru Ion».

### Pasul 1 — Schema (numărul migrației din origin/main în ziua aplicării; lecția 463→482 din ION-188)
- `bilete_comenzi`: `id uuid PK`, `cod text UNIQUE` (secretul paginii, 128 biți), `idempotency_key uuid UNIQUE`
  (din `crypto.randomUUID()` în browser; aceeași cheie cu alt conținut → 409), `trip_date date`, `crm_route_id int →
  crm_routes`, `going_north bool`, `from_stop_order`, `to_stop_order`, `from_name`, `to_name` (numele căutate, F7),
  `departure_at timestamptz` (calculat în `Europe/Chisinau` din ora rutei la oprirea de urcare, cu data corectată
  când ora opririi e mai mică decât ora de pornire a rutei — după miezul nopții; test pe 24–26.10, ora de iarnă —
  BL-9/BL-16), `seats int CHECK 1..4`, `price_per_seat`, `total`, `passenger_name`, `phone` (`373…`, F21), `email
  null`, `lang`, `status text CHECK (noua, platita, expirata, eroare_creare, anulata, returnata, platita_fara_bilet)`,
  `checkout_id uuid → maib_checkouts`, `creare_in_curs_la timestamptz` (revendicarea creării sesiunii: o singură sesiune
  maib pe comandă — SEC-19), `creare_incercari smallint DEFAULT 0`, `paid_at`, `cancelled_at`, `cancel_source
  (pasager|admin|sistem)`, `refund_reason`, `refund_finalizat_la` (C4), `notificat_la`, `ip_hash` (sare separată
  `BILETE_IP_SALT`, SEC-17), `created_at`, `updated_at`. Indexuri: (`trip_date`, `crm_route_id`), `checkout_id`,
  **parțial `(created_at) WHERE status IN ('noua','eroare_creare')`**, (`ip_hash`, `created_at`), (`phone`) `WHERE
  status='noua'` (SC-11), parțial `(trip_date) WHERE status='anulata' AND refund_finalizat_la IS NULL`.
- `counting_sessions` primește `online_pasageri int`, `online_lei numeric(10,2)`, `online_neprezentati int`,
  `online_calculat_la timestamptz` (NULL = nicio vânzare online) — termenul online al sesiunii de numărare (4b).
- `bilete`: `id uuid PK`, `comanda_id → bilete_comenzi`, `nr smallint`, `cod_qr text UNIQUE` (20 car. Crockford),
  `status text CHECK (valid, urcat, anulat, returnat)`, `urcat_at` (ora clientului; prima câștigă), `urcat_de uuid →
  drivers null`, `urcat_sursa (scan|manual)`. UNIQUE (`comanda_id`, `nr`).
- `bilete_scanari`: jurnal brut (cod citit, șofer, cursa șoferului, cursa biletului, rezultat: ok / neconfirmat /
  deja_urcat / anulat / alta_cursa / necunoscut, moment client, moment server).
- `bilete_api_apeluri` (cheie text, moment) cu index (cheie, moment) — tabela plafoanelor pe șofer/cheie (SC-11/ARH-16).
  RPC-ul `bilete_plafon(cheie, fereastra_s, max)` numără ȘI șterge în același apel rândurile mai vechi de 5 minute
  pentru cheia respectivă (SC-14: altfel 66 șoferi × 1 cerere/min = ~40.000 rânduri/zi pe NANO); 5c o mai golește o dată.
- Funcție `bilete_creeaza_comanda(p jsonb) RETURNS bilete_comenzi` SECURITY DEFINER: `pg_advisory_xact_lock(hashtext(
  'bilete_comanda'))`, apoi plafoanele (ip_hash/10 min, `noua` pe telefon, ≤ 50 `noua` global) și INSERT-ul în aceeași
  tranzacție — plafonul global devine atomic (SC-17); la atingerea plafonului global scrie alertă `plafon_atins` (SC-8).
- `drivers.telegram_id bigint UNIQUE NULL`, `drivers.telegram_legat_la`, `drivers.telegram_legat_prin (telefon|admin)`.
- `drivers_telegram_incercari` (telegram_id, nume Telegram, telefon trimis normalizat, motiv refuz, moment).
- `bilete_alerte` (comanda, tip: platita_fara_bilet / refund_necunoscut / refund_respins / cursa_fara_sofer /
  urcat_pe_anulat / creare_esuata / plafon_atins / refund_pe_zi_confirmata, moment, rezolvat_la).
- **Steagurile**: `app_config.bilete_online_activ` (implicit `false`), `app_config.bilete_inchidere_min` (implicit 30),
  `crm_routes.bilete_online bool DEFAULT false`.
- Funcție `bilete_marcheaza_platita(p_checkout_id uuid) RETURNS int` SECURITY DEFINER, `SET search_path = public`,
  `SET statement_timeout = '5s'`, `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`, GRANT service_role: verifică
  `maib_checkouts.status='Completed'` și `maib_checkouts.amount = bilete_comenzi.total` (SEC-9); idempotentă
  (`WHERE status IN ('noua','eroare_creare')`); generează biletele în aceeași tranzacție; comanda `expirata` cu plată
  Completed → `platita_fara_bilet` + alertă; comanda `anulata`/`returnata`/`platita` cu plată Completed → **nimic**
  (reluarea callback-ului e normală, refund-ul e în curs — SEC-12), întoarce 0.
- Locul pentru cotă (amânată): un singur punct `verificaDisponibilitatea()` în pasul 4a, azi mereu «da».
- Toate tabelele: RLS, REVOKE anon/authenticated, GRANT service_role (tiparul 446/482).
- Rezultat: `db-migrate.sh translux … --dry-run` trece; anon → `permission denied`; test SQL: funcția de două ori →
  `N` apoi `0`; pe comandă `anulata` → `0` fără schimbare.

### Pasul 2 — Prețul și atribuirile într-un singur loc (`packages/db`)
- 2a. Separare în două straturi (ARH-12): `packages/db/src/pret-calc.ts` = funcția PURĂ `calculeazaPret(input)` (rata
  zilei, km, ofertă, `buildScheduledTrips`/`pickRate`) și `packages/db/src/pret-date.ts` = `incarcaDatePret(db, …)` cu
  clientul injectat (anon în web, service_role în admin — aceleași tabele). ÎNAINTE de mutare: test de caracterizare
  care fixează rezultatele de azi ale `searchTrips` pe un set de date salvat (fixture) și rămâne verde după mutare.
  O folosesc `apps/web/.../actions.ts`, `apps/admin/src/lib/trips-search.ts` și API-ul comenzii; `timetable.ts` +
  testul lui se mută; `apps/web/src/lib/route-pages.ts:5` își schimbă importul. Prețul PUBLIC nu se folosește pentru
  valorizarea la numărare (C5/F32): aceea se face în SQL, în 4b, cu funcția numărării.
- 2b. `packages/db/src/atribuiri-zi.ts`: `buildTurAssignmentMap`/`buildReturAssignmentMap` din
  `apps/web/src/lib/assignments.ts:93-118` (F19) + `sesiuneaNumararii(trip_date, crm_route_id)` = cheia rută-zi și
  șoferul ei (ca `counting_sessions`, F17/F32), folosite de web, de validarea comenzii, de `/api/bilete-sofer/azi`
  și de notificare. Maparea retur → sesiune există O SINGURĂ DATĂ: în SQL (4b, unde o cere raportul); TS-ul o citește
  prin aceeași funcție SQL expusă ca RPC, nu o reimplementează (BL-20).
- Teste: caracterizare (2a); retur cu override dă același șofer în web și admin (BL-4). Limitare notată (ARH-12):
  `vitest` nu e gate automat în proiect (hook-ul verifică doar migrațiile); testele rulează la `tp handoff` și
  intră în raport; `tsc` la pre-push.

### Pasul 4 — API-ul comenzii și al biletului (`apps/admin`)
- 4a. `POST /api/bilete/comanda` (cale EXACTĂ în `PUBLIC_EXACT`; se apără prin `BILETE_API_KEY` ≥ 256 biți, separată,
  `server-only` — SEC-4/11). Corpul conține `ip_hash` calculat PE WEB (`actions.ts:275-281`, cu `BILETE_IP_SALT`) —
  admin nu-și citește propriul antet (SEC-13/SC-9). Plafoane ÎN BAZĂ (F24): ≤ 5 comenzi/10 min pe `ip_hash`, ≤ 3
  `noua` deschise pe telefon, **≤ 50 `noua` deschise global** (SC-8), honeypot. Validează: steagurile, ruta/opririle în
  `crm_stop_fares`, cursa are șofer PE `trip_date` (BL-6), `sale_open`; recalculează prețul (2a);
  `verificaDisponibilitatea()`; `rpc('bilete_creeaza_comanda')` (plafoane + INSERT atomice, `ON CONFLICT
  (idempotency_key) DO NOTHING RETURNING`; aceeași cheie cu alt conținut → 409 — SC-6/SC-17). **O singură sesiune maib
  pe comandă** (SEC-19): `createCheckout(orderId = id)` se cheamă DOAR după revendicarea `UPDATE … SET
  creare_in_curs_la = now() WHERE id = … AND checkout_id IS NULL AND (creare_in_curs_la IS NULL OR < now() − 2 min)
  RETURNING`; o reluare cu aceeași `idempotency_key` pe o comandă care are deja `checkout_id` întoarce `checkout_url`-ul
  existent, nu creează alta. Apoi, ÎNTR-O TRANZACȚIE locală (C1/F30): rândul în `maib_checkouts` (ca
  `plati/actions.ts:104`, extras în `lib/maib/persist.ts`, folosit și de `/plati`) + `checkout_id` pe comandă + ștergerea
  revendicării. Eroare clară maib (4xx) → `expirata`; timeout/5xx la creare → `eroare_creare` (SEC-2); eșec al tranzacției
  locale după ce maib a creat sesiunea → `eroare_creare` + alertă `creare_esuata`, împăcat de 5a prin
  `findCheckoutByOrderId` (F26). Răspuns `{checkoutUrl}`. Serviciul e `creeazaComanda(input, { mod: 'public' |
  'test_admin' })`: modul `test_admin` ocolește steagurile și e accesibil DOAR dintr-o server action cu `requireRole
  ('ADMIN')` (comanda de test), niciodată din ruta publică (ARH-19).
- 4-test. **Comanda de test ÎN acest pas** (ARH-18): server action ADMIN `comandaDeTest()` (fișier `(dashboard)/plati/
  actions.ts` sau un script `scripts/bilete-comanda-test.mts` rulat local cu env-ul admin) care cheamă `creeazaComanda(…,
  {mod:'test_admin'})` pe o rută reală de mâine, întoarce `checkoutUrl`; Ion plătește în sandbox; callback-ul (4d) trece
  comanda în `platita` cu N bilete. Fără proba asta verde, pasul 4 nu se pune pe `main`.
- 4b. **Rapoartele de încasare** (BL-1/11/12/13/15/17/19/20, C5, F17/F27/F28/F32): funcție SQL
  `bilete_online_recalc(trip_date, crm_route_id)` scrie pe rândul `counting_sessions` al sesiunii rută-zi (cheia UNIQUE
  din 021:18; returul override pe rândul rutei A, ca azi) coloanele `online_pasageri`, `online_lei`,
  `online_neprezentati`, `online_calculat_la`: biletele `valid` + `urcat` ale comenzilor rută-zi (tur + retur),
  valorizate PE TRONSOANE cu o funcție SQL pe segment `numarare_pret_segment(crm_route_id, from_order, to_order,
  trip_date)` scrisă DUPĂ `calculateDirection` (F32, C5 runda 3): pentru rutele interurbane — rata suburbană pe
  tronsoanele din districtul de start și `rate_long` pe restul, scurții non-suburbani la `rate_long`, excepția rutei 58
  (092), FĂRĂ rotunjire pe tronson, totalul rotunjit la 2 decimale exact ca `calculation.ts:102,127,145`; pentru rutele
  suburbane — regula 0,20 pe tronson din 097 (acolo și rămâne). Test de echivalență cu `calculateDirection` pe un
  traseu mixt cu rate fracționare (ex. 20 km × 1,17 + 80 km × 0,94 → 98,60, nu 99,20) și pe ruta 58; funcția
  nu atinge totalurile sesiunilor existente. La rata zilei cursei din `tariff_periods`, FĂRĂ ofertă; `neprezentati` =
  `valid` după plecare. Se cheamă: la fiecare schimbare de stare a unui bilet (din callback/cron/refund, prin
  `after()`), noaptea pentru ieri (5a) și la deschiderea raportului dacă `online_calculat_la` e mai vechi decât ultima
  schimbare. `get_incasare_report` (060) ȘI `get_grafic_report` (320) adună `coalesce(cs.online_lei, 0)` în suma
  încasată ȘI în toate ramurile de stare (`underpaid`/`no_incasare`/`ok` — BL-17), nu doar în `diff`. Coloane «Online»
  și «Neprezentați online» în Încasare și în raportul grafic. Test de echivalență: pentru un traseu mixt (20 km
  suburban + 80 km interurban) și pentru ruta 58, `online_lei` pe un pasager = ce ar da `calculateDirection` pe același
  pasager (C5). Regula pentru șofer (mesajul din grupă, pasul 9): «biletul online NU se mai bate la terminal». Biletele
  online NU intră în `tiki_tickets`/«Bilete aparat». Migrațiile funcțiilor: `--dry-run` + test pe o zi cunoscută.
- 4c. `GET /api/bilete/public/<cod>` (prefix dedicat `/api/bilete/public/` în `PUBLIC_PREFIXES`, cu test care listează
  EXHAUSTIV rutele de sub el — SEC-4): comanda + biletele (QR SVG din `qrcode`) + cursa; fără alți pasageri;
  `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. `GET /api/bilete/public/config`: steaguri, `inchidere_min`,
  lista rutelor cu `bilete_online=true` (ARH-11/F29) — date publice, deci FĂRĂ cheie, `Cache-Control: public,
  s-maxage=60, stale-while-revalidate=300`; site-ul mai ține 60 s în proces (ARH-20); F31: dacă latența măsurată la
  pasul 3 depășește 50 ms, site-ul se fixează pe `dub1` în `apps/web/vercel.json`.
- 4d. Callback-ul (`api/pay/maib/callback/route.ts`): după `update` reușit → `rpc('bilete_marcheaza_platita')`; eroare
  RPC → **500** (ARH-8). `checkoutId` necunoscut → comanda după `orderId` DOAR dacă: starea e `noua`/`eroare_creare`,
  `paymentStatus = Executed`, `currency = MDL`, `amount = total`, comanda n-are încă `checkout_id` și nu există alt rând
  `maib_checkouts` cu același `order_id` (coloana e UNIQUE, 482:10) → ÎNTR-O TRANZACȚIE se inserează rândul
  `maib_checkouts` din corpul semnat (`lib/maib/persist.ts`) și se pune `checkout_id` pe comandă, apoi RPC-ul (SEC-15/
  SEC-19); orice altă combinație → alertă `platita_fara_bilet`, niciodată tăcere. Notificarea șoferului NU rulează în
  callback (SC-5).
- Rezultat: test de integrare pe sandbox prin **`/bilete` (11a)**, care are «Comandă de test» (nu `/plati`): `noua →
  platita`, N bilete, rând în `maib_checkouts`; fără cheie → 401; sumă din browser ignorată; `idempotency_key` repetat
  → aceeași comandă; același key cu alt conținut → 409; al 6-lea POST în 10 min de la același `ip_hash` → 429.

### Pasul 6 — Anularea și refund-ul (o singură funcție)
- `apps/admin/src/lib/bilete/refund.ts` → `anuleazaSiReturneaza(comandaId, sursa, motiv)`: UN UPDATE de revendicare
  (`status='platita' → 'anulata'`, `cancel_source`, biletele → `anulat` în aceeași tranzacție, refuzat dacă vreun bilet e
  `urcat` — SEC-7) + revendicarea `maib_checkouts.refund_status IS NULL` (extrasă din `plati/actions.ts:180-198` în
  `lib/maib/refund.ts` — BL-8); apoi `refundPayment`. **Doar un refuz explicit 4xx** readuce `platita` + `valid`;
  timeout/5xx → `anulata` + `refund_status='Necunoscut'` + alertă, împăcat de 5a (SEC-3/BL-2).
- **Finalizarea refund-ului e tot comună** (C4): `finalizeazaRefund(checkoutId, stareMaib)` în `lib/maib/refund.ts`
  scrie `maib_checkouts.refund_status` ȘI, dacă checkout-ul e legat de o comandă `anulata`: Accepted → `returnata` +
  `refund_finalizat_la`; Rejected/Manual → alertă `refund_respins` + `refund_finalizat_la` (adminul decide); o folosesc
  cron-ul 5a și **`verificaRefund` din `/plati`** (`plati/actions.ts:222-236`). Cron-ul 5a ia comenzile `anulata` cu
  `refund_finalizat_la IS NULL` indiferent de ce scrie `maib_checkouts.refund_status` (deci o stare terminală salvată
  din `/plati` înainte de tick nu scoate comanda din lot). Teste: Accepted și Rejected salvate din `/plati` înaintea
  cron-ului → comanda ajunge `returnata`, respectiv alertă.
- **`/plati`** (F30, C2/BL-14): «Returnează» verifică dacă `checkout_id` e legat de o `bilete_comenzi`; dacă da, cheamă
  `anuleazaSiReturneaza(…, 'admin', motiv)` (deci refuză când există bilet `urcat`) și arată linkul la `/bilete`; test
  pentru refund inițiat din `/plati` cu bilet `urcat`.
- `POST /api/bilete/public/<cod>/anulare` (web, cu cheia): permis doar când `now() < departure_at − 2h`; după → pagina
  arată telefonul liniei. Admin din `/bilete` (11a): aceeași funcție, fără limita de 2 h, cu motiv; **după plecarea
  cursei** cere confirmare explicită și, dacă ziua sesiunii de numărare e deja confirmată, scrie alertă
  `refund_pe_zi_confirmata` și recalculează termenul online (4b), ca lipsa să fie vizibilă, nu ascunsă (BL-18).
  `platita_fara_bilet` → în `/bilete` două butoane care se EXCLUD fără stare intermediară persistată (SEC-20, C6):
  fiecare rulează într-o singură tranzacție SQL care face `SELECT … FROM bilete_comenzi WHERE id = … AND status =
  'platita_fara_bilet' FOR UPDATE` și apoi tranziția finală — «Emite biletele» → biletele + `platita`; «Returnează» →
  `anulata` + biletele (dacă există) `anulat`, apoi refund-ul comun (funcția acceptă tranzițiile `platita → anulata` ȘI
  `platita_fara_bilet → anulata`). A doua apăsare găsește altă stare și primește «deja rezolvată». Teste pe ambele căi
  pornind din `platita_fara_bilet`, inclusiv două apeluri concurente (SEC-12).
- Anularea parțială: NU în v1 (întrebarea 4).

### Pasul 11a — Admin `/bilete`, partea minimă (înaintea cron-ului și a site-ului — ARH-14)
- Lista comenzilor (zi, rută, stare), detaliul cu biletele, «Returnează» (6), «Emite biletele», «Comandă de test» (cu
  steagurile închise, pe o rută marcată `bilete_online` doar în admin), alertele (`bilete_alerte`), contorul `noua` > 40 min.
  Intrare în `Sidebar.tsx`, ADMIN.

### Pasul 5 — Împăcarea (cron pe VPS, ca `anunt-bilete-online`, F16)
- 5a. `GET /api/cron/bilete-impacare` (`verifyCronSecret`, crontab `*/10`, buget 20 s, **`ORDER BY created_at LIMIT
  25`**, cu cote pe categorie — 10 creare, 10 checkout, 5 refund — paralelism 5 — SC-3/SC-10/SC-16): întâi comenzile
  `noua`/`eroare_creare` > 30 min FĂRĂ `checkout_id` → `findCheckoutByOrderId` (F26): găsită → rând `maib_checkouts` +
  stare; negăsită → `expirata`; `creare_incercari` ≥ 3 → **`expirata`** + alertă `creare_esuata` (starea o scoate din
  lot — SC-15). Apoi cele CU `checkout_id` → `getCheckout`: Completed cu `amount = total` (BL-7) → RPC;
  Expired/Abandoned/Cancelled/Failed → `expirata` (asta eliberează și comenzile unui abuzator care au trecut de
  `createCheckout` — SC-8: sesiunea maib expiră în 25 min, F12). Comenzile `anulata` cu `refund_finalizat_la IS NULL` →
  `getRefund`/`getPayment.refundedAmount` → `finalizeazaRefund` (C4). «Bilete plătite pe cursă fără șofer la T−3h» →
  alertă `cursa_fara_sofer` (BL-10). `bilete_online_recalc` pentru ieri (4b). **Notificarea șoferului** (definită aici,
  activă după 7): comenzile `platita` cu `notificat_la IS NULL` ale căror șofer (2b) are `telegram_id` → mesaj PRIVAT
  scurt; `notificat_la` se pune.
- 5b. Contorul `noua` > 40 min și alertele deschise apar în `/bilete` și în digestul de seară (SC-3).
- 5c. Retenție `pg_cron` (F25), noaptea, în loturi: după 90 de zile de la `trip_date` → `passenger_name`/`phone`/
  `email`/`ip_hash` anonimizate; `bilete_scanari`, `bilete_api_apeluri`, `drivers_telegram_incercari` șterse; în
  `maib_callbacks` rândurile RESPINSE se șterg la 90 de zile, cele valide (dovada semnată a plății, pentru chargeback)
  rămân 13 luni (SEC-17) — corpul lor conține numele, e-mailul, telefonul, IP-ul și IBAN-ul plătitorului
  (`callback/route.ts:37,66`), deci termenul de 13 luni se declară în politica Legii 195 (SEC-21; întrebarea 7).
  Comanda se REFUZĂ dacă `BILETE_IP_SALT` lipsește (fără cădere pe cheia anon ca în `actions.ts:279`), iar un `ip_hash`
  gol intră într-o găleată comună de plafon, nu ocolește plafonul (SEC-21).

### Pasul 3 — Site-ul (`apps/web`), ascuns sub steag până la pasul 10
- `lib/bilete-api.ts` (`import 'server-only'`, `BILETE_API_KEY`, `CENTRAL_HUB_URL`): `config()` (cache 60 s în proces;
  eroare/lipsă → vânzare ÎNCHISĂ — ARH-11), `comanda()`, `bilet()`, `anulare()`.
- `TripResult` + `crm_route_id`, `going_north`, `from_stop_order`, `to_stop_order`, `trip_date`, `departure_at`,
  `sale_open` (= steag global + rută activată + șofer atribuit pe `trip_date` însăși (BL-6) + ≥ `inchidere_min` până la
  plecarea de la oprirea pasagerului). Latența adăugată de `config()` la căutare se măsoară (țintă < 50 ms, cache).
- Card: «Cumpără bilet» doar când `sale_open`. Formular: nume, telefon, locuri 1–4, consimțământ, honeypot,
  `idempotency_key` (`crypto.randomUUID()`). Server action `cumparaBilet()` calculează `ip_hash` (sare `BILETE_IP_SALT`)
  → `comanda()` → `redirect(checkoutUrl)`.
- Pagina `/[locale]/bilet/[cod]`: re-încărcare la 15 s, plafon 3 min, apoi «Verifică» (SC-5); `noindex`, `no-store`,
  `Referrer-Policy: no-referrer`; `/bilet/` exclus din `page_views` (F22). `successUrl` conține `cod` — maib îl vede;
  risc acceptat și notat (SEC-18): maib e procesatorul plății, alternativa (token de preluare unic) se face doar dacă
  Ion o cere.
- Rezultat: cu steagurile `false` nimic nu se vede; într-un preview cu steag pe o rută, butonul apare doar acolo.

### Pasul S — Spike pe telefon (o zi, înaintea pasului 7)
- Pagină minimă `mini-app/bilete` (afișează `initData` parsat, NU îl jurnalizează) + app în BotFather (0) + buton `url`
  în grupul de test (0.2). Pe Android și iPhone: (1) `initData.user` prezent la linkul direct din grupă?; (2)
  `requestContact` → ajunge `message:contact` la bot? aduce un `response` SEMNAT în mini app (nu `responseUnsafe`)?;
  (3) `showScanQrPopup` citește un QR de pe hârtie; (4) mărimea reală a HTML-ului gol + SDK (bugetul pasului 8).
- Rezultatul se scrie în plan (F8 devine «verificat») și alege varianta 7b.

### Pasul 7 — Identitatea șoferului
- 7a. `apps/admin/src/lib/telegram/init-data.ts`: funcția PURĂ `verifyInitData(initData, botToken, nowSec) →
  {telegramId, startParam, user} | null`, `timingSafeEqual` (SEC-10), teste (`signature` prezent/absent, expirare,
  `user` lipsă — ARH-6). `zadachnik/auth.ts` o importă; `authFromInitData` și ocolul `__dev__` rămân acolo; auth-ul
  șoferului n-are ocol.
- 7b. Legarea, varianta A (prin bot): `message:contact` în privat, acceptat DOAR dacă `contact.user_id === ctx.from.id`
  (SEC-1/ARH-1; forward-ul păstrează id-ul proprietarului, deci cade tot pe regula asta), `normalizeDriverPhone` (F21),
  potrivire UNICĂ cu `drivers.phone` normalizat și `active` → `drivers.telegram_id`; altfel rând în
  `drivers_telegram_incercari`. `/start bilete` rutat ÎNAINTEA `validateInviteToken` (F20/ARH-5), răspunde cu buton
  `web_app` (rezerva F8). Deploy `deploy-bot` (F15). Varianta B (direct în API-ul admin, dacă S o confirmă): se acceptă
  DOAR `response`-ul semnat HMAC ca initData, cu `contact.user_id === initData.user.id` și `auth_date` proaspăt;
  `responseUnsafe` niciodată (SEC-16). Teste: contact străin refuzat; dublu-șofer pe același număr → admin.
- 7c. Admin `/drivers`: coloana «Telegram» (legat/nelegat/încercări), legare de mână, dezlegare; dezactivarea șoferului
  dezleagă (SEC-10).

### Pasul 8 — Mini app-ul șoferului `mini-app/bilete` (HTML + JS, cifre)
- Route Handler (`mini-app/bilete/route.ts`) servește HTML static + CSS + JS; JS-ul vine din modulul TypeScript
  `apps/admin/src/lib/bilete-sofer/client/{clasificare,coada,app}.ts` (testat cu vitest: clasificarea scanării, coada),
  compilat la build într-un fișier static — ARH-13/ARH-17, mecanismul: `esbuild` ca devDependency în `apps/admin`
  (azi e doar dependență indirectă), `scripts/build-mini-app.mjs` → `public/mini-app/bilete.js` (în `.gitignore`),
  `"build": "node scripts/build-mini-app.mjs && next build"` + `predev`; HTML-ul îl cere cu `?v=<VERCEL_GIT_COMMIT_SHA>`
  (fără hash în nume, deci fără manifest). Antete: `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400`
  pe HTML-ul fără date personale (SC-12). Bugetul se scrie din cifra pasului S, ținta ≤ 30 KB comprimat tot răspunsul +
  JS; test care măsoară.
- `initData` din `#tgWebAppData` imediat (fără polling); SDK-ul `defer`, `ready()` după primul desen.
- **Un singur drum**: `GET /api/bilete-sofer/azi` (header `x-telegram-init-data`; prefix dedicat `/api/bilete-sofer/`
  cu test exhaustiv; plafon ÎN BAZĂ 120/min pe șofer prin `bilete_api_apeluri`) → `{sofer, generat_la, curse: [{tur|
  retur, rută, ora, pasageri: [{nume, de, spre, locuri, bilete: [{cod_qr, status}]}]}]}`; cursele din 2b. Telefonul
  pasagerului doar la cerere: `GET /api/bilete-sofer/telefon/<cod_qr>` — biletul trebuie să fie pe o cursă a
  șoferului AZI (SEC-14), jurnalizat.
- **Offline**: răspunsul în `localStorage` (cheia `zi:șofer`; zilele vechi șterse la deschidere — SEC-8); fără
  CloudStorage. Reîmprospătare la `online`, `visibilitychange`, la 60 s cât e deschisă și OBLIGATORIU în fereastra
  T−2h…T (BL-3); ecranul arată «lista de la HH:MM» (SC-2).
- **Scanarea** (`showScanQrPopup`, rezervă: ultimele 5 caractere): în listă + `valid` → verde + haptic; `urcat` → roșu
  «deja urcat la HH:MM»; `anulat` → roșu; nu e în listă → **portocaliu «neconfirmat — nu e în lista de la HH:MM»**,
  șoferul decide, codul intră în coada de verificare; altă cursă a aceluiași șofer → portocaliu cu numele cursei (doar
  jurnal).
- **Coada** `pending_urcari`: `POST /api/bilete-sofer/urcat` idempotent pe `cod_qr`, acceptă doar `valid` ȘI doar bilete
  de pe cursele șoferului de azi (SEC-14), păstrează primul `urcat_at` (ora clientului), conflicte → `bilete_scanari` +
  alertă; retrimitere la `online` și la deschidere; «3 de trimis» pe ecran. Timeout 8 s, «Reîncearcă», lista
  cache-uită mereu vizibilă.
- Rezultat: Lighthouse mobile ≥ 90; mărimea ≤ buget (test); «mod avion»: scanare din cache verde/portocaliu; la revenire
  coada se golește și `bilete.status='urcat'`.

### Pasul 9 — Butonul din grupa Mejgorod
- Mesaj fixat în grupă (din admin, buton `url` `https://t.me/<bot>/bilete?startapp=azi`), în rusă (ca ION-189), 1–2
  rânduri + regula «biletul online nu se bate la terminal» (4b) + «apasă Start la bot» (rezerva 7).
- Rezultat: ≥ 3 șoferi de probă deschid mini app-ul și se leagă.

### Pasul 11b — Admin `/bilete`, restul
- Scanările pe bilet, «Marchează urcat», «șoferi nelegați cu cursă mâine» (unealta regulii ION-189), export CSV,
  raportul vânzărilor online (separat de «Bilete aparat»), coloana «Telegram» în `/drivers` dacă n-a intrat la 7c.

### Pasul 10 — Lansarea
- `app_config.bilete_online_activ = true`, `crm_routes.bilete_online = true` pe rutele pilot (întrebarea 8), o săptămână,
  apoi toate cele 30; `app_config.bilete_online_lansat = <data>` (oprește anunțul ION-189, F16); textele asistentului
  (`site-assistant/knowledge.ts:95-102`) și FAQ-ul.

## Fișiere

| Cale | Ce se schimbă (pas) |
|---|---|
| `packages/db/migrations/<nr>_bilete_online.sql`, `<nr+1>_incasare_bilete_online.sql` (060 + 320), `<nr+2>_bilete_retentie_pg_cron.sql` | 1, 4b, 5c |
| `packages/db/src/pret-calc.ts`, `pret-date.ts`, `atribuiri-zi.ts`, `timetable.ts` (+ teste, fixture de caracterizare), `index.ts` | 2 |
| `apps/web/src/app/(public)/actions.ts`, `lib/route-pages.ts`, `lib/assignments.ts` (→ packages), `components/NowResults.tsx`, `app/[locale]/bilet/[cod]/page.tsx`, `lib/bilete-api.ts`, `app/api/analytics/track/route.ts` | 2, 3 |
| `apps/admin/src/lib/trips-search.ts` | 2 |
| `apps/admin/src/app/api/bilete/comanda/route.ts`, `api/bilete/public/{config,[cod],[cod]/anulare}/route.ts`, `lib/bilete/{comenzi,qr,refund,plafon,pret-numarare}.ts`, `lib/maib/{refund,persist}.ts`, `lib/maib/client.ts` (`findCheckoutByOrderId`) | 4, 6 |
| `apps/admin/src/app/api/pay/maib/callback/route.ts`, `(dashboard)/plati/actions.ts` (persist + refund comun + legătura cu comanda) | 4a, 4d, 6 |
| `apps/admin/src/app/(dashboard)/bilete/*`, `components/Sidebar.tsx` | 11a, 11b |
| `apps/admin/src/app/api/cron/bilete-impacare/route.ts`, crontab VPS (`root@217.26.149.23`), digestul de seară | 5 |
| `apps/admin/src/lib/telegram/init-data.ts` (+ test), `lib/zadachnik/auth.ts` | 7a |
| `apps/bot/src/bot.ts`, `handlers/start.ts`, `handlers/contact.ts` | 7b |
| `apps/admin/src/app/(dashboard)/drivers/*` | 7c |
| `apps/admin/src/app/mini-app/bilete/route.ts`, `lib/bilete-sofer/client/*.ts` (+ teste), `public/mini-app/bilete.<hash>.js`, `api/bilete-sofer/{azi,urcat,telefon/[cod]}/route.ts`, `lib/bilete/sofer.ts` | 8 |
| `apps/admin/src/lib/public-paths.ts` (+ test exhaustiv `/api/bilete/public/`, `/api/bilete-sofer/`; exact `/api/bilete/comanda`) | 4, 8 |
| `apps/admin/src/app/(dashboard)/numarare/*` (coloanele Online / Neprezentați) | 4b |
| `apps/admin/src/lib/site-assistant/knowledge.ts` | 10 |
| Vercel env: `BILETE_API_KEY` (web + admin), `BILETE_IP_SALT` (web), `CENTRAL_HUB_URL` (web), `TELEGRAM_BOT_USERNAME` (admin) | 3, 4, 9 |

## Riscuri

| Risc | Probabilitate | Plan de rezervă |
|---|---|---|
| `initData.user` lipsește la linkul direct din grupă (F8) | medie | pasul S decide înainte de 7/8; rezerva `/start bilete` + `web_app` |
| `requestContact` nu ajunge la bot (botul nepornit/blocat) | medie | legarea de mână 7c; mesajul din grupă spune «apasă Start la bot» |
| Supravânzare (șoferul și TIKI vând în paralel) — locurile sunt amânate | mare la cursele pline | `verificaDisponibilitatea()` e singurul loc; pilot pe rute cu ocupare medie; refund din `/bilete` |
| Bani luați fără bilet (timeout la creare, callback pe comandă necunoscută) | mică | `eroare_creare`, `findCheckoutByOrderId` (F26), inserarea `maib_checkouts` din callback, `platita_fara_bilet` + «Emite biletele» |
| Refund ambiguu / refund din `/plati` | mică | `Necunoscut` + împăcare; niciodată `platita` fără 4xx explicit; `/plati` trece prin aceeași funcție |
| Lista offline veche | medie | portocaliu «neconfirmat», reîmprospătare T−2h…T, serverul refuză `urcat` pe `anulat` |
| Șoferul schimbă cursa în ultima clipă | medie | lista din `daily_assignments` la fiecare reîmprospătare; «altă cursă» doar în jurnal |
| Ora plecării de la oprire e din grafic, nu reală | sigură | regula de 2 h pe graficul publicat |
| Abuz pe formular / blocarea vânzării prin `noua` | medie | plafoane în bază pe `ip_hash` DIN WEB, 50 global, închiderea întâi a `noua` fără checkout; honeypot |
| Date personale pe web public | medie | cod 128 biți, `noindex`, `no-store`, `no-referrer`, fără tracking, sare separată, retenție, politica Legii 195 |
| Încasarea arată lipsă / surplus | sigură fără 4b | termenul online în AMBELE rapoarte, pe cheia sesiunii, la prețul camerei |
| Testele nu sunt gate automat (ARH-12) | sigură | rulate la `tp handoff` și notate în raport; `tsc` la pre-push |
| maib refuză refund-ul automat (Manual/Rejected) | mică | alertă; admin rezolvă din cabinetul maib |

## Verificare

- Unitare: caracterizare preț (2a) + retur cu override (2b); coduri Crockford unice pe 1 M; `bilete_marcheaza_platita`
  idempotentă și inertă pe `anulata` (SQL `--dry-run`); `verifyInitData` (7a); contact străin refuzat (7b); refund timeout
  → `Necunoscut` (6); refund din `/plati` cu bilet `urcat` refuzat; clasificarea scanării și coada (8); `public-paths.test.ts`.
- Integrare pe sandbox (Ion cu cardul de test, din `/bilete`): comandă → plată → bilete → QR → scanare → urcat → anulare
  altă comandă → refund `Accepted` → `returnata` → comandă abandonată → `expirata` → comandă `eroare_creare` regăsită
  după `orderId`.
- Măsurători: mărimea `/mini-app/bilete` ≤ buget; Lighthouse mobile ≥ 90; TTFB `/api/bilete-sofer/azi` < 400 ms;
  latența `config()` la căutare < 50 ms; Încasare și raport grafic pe o zi cunoscută: diferența = `suma_numarare`.
- Securitate: `security-reviewer` după fiecare pas cu API; QR ghicit → neconfirmat; al doilea scan → deja urcat; POST
  fără cheie → 401; sumă din browser ignorată; al 6-lea POST/10 min → 429; `/telefon/<cod_qr>` pe biletul altui șofer → 403.
- Gate-urile proiectului: `vitest` admin + web + packages (la handoff), `tsc` pe toate 5 (pre-push), `db-migrate.sh
  --dry-run`, `tp handoff`.

## Întrebări pentru Ion — cu răspunsurile lui (02.10.2026, 23:40) și ce schimbă în plan (v6)

1. **Cum ajunge biletul la pasager.** Răspuns: «Salvează bilet + e-mail opțional și pe Telegram botul nostru facem
   forward.» → Pagina biletului are «Salvează» (PNG/print), câmp e-mail opțional (furnizor de e-mail: Resend, cont nou,
   env `RESEND_API_KEY`) și butonul «Primește în Telegram» → `https://t.me/<bot>?start=bilet_<cod>`; botul primește
   payload-ul `bilet_` ÎNAINTEA verificării invitației (ca `bilete` la 7b; pasagerul NU e în `users` și nu primește
   cont) și trimite biletul (QR + text) în privat; `bilete_comenzi.telegram_id` se salvează ca să poată primi și
   anularea/schimbările. Suprafață nouă pentru `security-reviewer` la implementare (pasul 3b).
2. **Închiderea vânzării.** Răspuns: «până șoferul să înceapă tura tur, și din Chișinău cu 2 ore înainte.» → `sale_open`
   pe DIRECȚIE: tur (plecare din nord) — până la ora plecării rutei din prima oprire (graficul publicat); retur (din
   Chișinău) — până la T−2h. În `app_config`: `bilete_inchidere_tur_min = 0`, `bilete_inchidere_retur_min = 120`
   (înlocuiesc `bilete_inchidere_min`).
3. **Legarea prin telefon.** Răspuns: da. → 7b rămâne (contact PROPRIU), 7c rezervă.
4. **Anularea parțială.** Răspuns: da, doar toată comanda în v1.
5. **Textul despre bani.** Răspuns: ok; N se cere lui Octavian în același mail.
6. **Mesaj în grupă la fiecare vânzare.** Răspuns: «aici vom uni șoferul cu botul, și pe fiecare zi șoferul va avea
   biletele vândute tur și retur.» → Fără grupă. Botul, în PRIVAT: la fiecare vânzare un rând scurt; în fiecare zi (ora
   `bilete_digest_sofer_ora`, implicit 05:30) lista biletelor pentru tur și retur ale zilei; butonul «Biletele mele»
   deschide mini app-ul.
7. **Păstrarea datelor.** Răspuns: NU (fără anonimizare). → 5c păstrează doar curățenia tehnică (`bilete_api_apeluri`,
   `bilete_scanari` > 1 an); datele pasagerilor rămân; politica Legii 195 trebuie să declare păstrarea pe durată
   nelimitată — risc legal notat, decizia e a lui Ion.
8. **Pilotul.** Răspuns: «pe toate rutele, dar pe direcții țintit, ex. Briceni→Chișinău sau Bălți→Chișinău.» →
   Steagul e pe rută ȘI direcție: `crm_routes.bilete_online_tur bool`, `crm_routes.bilete_online_retur bool` (implicit
   false); pilotul pornește pe direcțiile nord→Chișinău alese de Ion.
9. **Grupa Mejgorod / BotFather.** Răspuns: «nu cu grupa Mejgorod, ci cu botul TRANSLUX; fiecare șofer va avea acces la
   el.» → Pasul 9 se rescrie: NU există buton în grupă. Șoferul dă `/start` botului în privat → legare prin contact (7b)
   → butonul `web_app` «🎫 Biletele mele» (permis în privat — Bot API; F8 devine irelevant, `initData.user` e garantat la
   `web_app`) + Menu Button al botului setat pe mini app. În grupa Mejgorod rămâne doar anunțul ION-189 și, o singură
   dată, instrucțiunea «apasă Start la @bot». `/newapp` în BotFather nu mai e obligatoriu (butonul `web_app` primește
   URL-ul direct); grupul de test dispare; pasul S se reduce la proba `requestContact` + scanner pe două telefoane.
10. **Biletul online și terminalul.** Răspuns: «nu înțeleg» → explicat în chat (vezi mai jos); rămâne de confirmat:
    (a) șoferul NU bate bon pe terminal pentru pasagerul care arată QR; (b) dacă legea cere bon fiscal și pentru plata
    online — întrebare pentru contabilitate/maib, înaintea lansării.

### Ce se schimbă în pași (v6, din răspunsuri)
- Pasul 1: steagurile pe direcție (8), `bilete_inchidere_tur_min/retur_min` (2), `bilete_comenzi.telegram_id` +
  `email` (1), fără anonimizare (7).
- Pasul 3: `sale_open` pe direcție (2); pagina biletului cu «Salvează», e-mail opțional, «Primește în Telegram» (1).
- Pasul 3b (nou, după 7b): handler `/start bilet_<cod>` în bot pentru pasageri + trimiterea biletului; e-mail prin Resend.
- Pasul 5a: digestul zilnic al șoferului (6) se trimite din cron la ora setată, pe lângă notificarea la vânzare.
- Pasul 9: buton `web_app` în privat + Menu Button; fără grupă (9). Pasul S: doar `requestContact` + scanner.
- Decizia 3 și F8: linkul direct din grupă nu se mai folosește; mini app-ul se deschide din privat.

### Ion, 02.10, 23:45: «logica simplă» și clauza de returnare prin bot, cu AI
Citat: «omul cumpără bilet QR, acest bilet îl prezintă la șofer, șoferul apasă pe buton și scanează confirmând că
clientul a venit. Trebuie de gândit clauza returnare bilet. Ar fi bine să o facem tot prin bot și în bot să punem un AI
care va verifica.»
- Fluxul de bază rămâne exact așa (pașii 3, 8). Nimic în plus pentru pasager la urcare.
- **Clauza de returnare** (propunere, de confirmat de Ion; regulile sunt DETERMINISTE, AI-ul nu decide banii):
  (a) până la T−2h înaintea plecării de la oprirea pasagerului → refund integral, automat; (b) între T−2h și plecare
  → fără refund automat; doar dispecerul, cu motiv; (c) după plecare, bilet nescanat (neprezentat) → fără refund;
  (d) cursa anulată de companie / fără șofer → refund integral automat + mesaj; (e) scanat «urcat» → nu se mai
  returnează. Pasul 6 rămâne implementarea; clauza se scrie și pe pagina biletului și în FAQ.
- **Returnarea prin bot** (pasul 6b, nou): pasagerul legat prin «Primește în Telegram» scrie botului (sau apasă
  «Returnează biletul» sub biletul trimis); botul identifică comanda (telegram_id → comenzi; sau codul biletului),
  aplică clauza prin ACEEAȘI funcție `anuleazaSiReturneaza` și răspunde cu rezultatul.
- **AI-ul din bot** = asistentul care poartă conversația (RO/RU), explică clauza pe cazul concret (ora, starea
  biletului), strânge motivul și, când cazul NU intră în regulile automate ((b), (c) sau pretenții: «autobuzul n-a
  venit», «am fost la oprire»), face un rezumat și îl trimite adminului cu butoane «Returnează / Refuză». Verifică cu
  date din sistem: ora reală a trecerii autobuzului prin oprire (`route_stop_passes`, memoria «ora-reala-pe-opriri»),
  scanările, GPS-ul. AI-ul NU cheamă refund-ul singur în afara regulilor (a)/(d): decizia pe bani rămâne regulă sau
  om. Modelul: cel folosit deja de asistentul site-ului (`site-assistant`), cu un prompt separat și instrumentele
  `bilet(cod)`, `trecere_oprire(ruta, zi, oprire)`, `escaladeaza(rezumat)`. Pas separat după 6 și 3b; `security-reviewer`
  obligatoriu (bani + conversație liberă).

## Revizori Claude — runda 1 (triaj, pe v1)

Scoruri: business-logic 0.0 (4 high) · security 0.0 (1 critical, 2 high) · scalability 1.0 (2 high) · senior-backend
0.0 (1 critical, 2 high). Minimul: **0.0**. Toate închise în v2; runda 2 a confirmat închiderea (BL-1 parțial →
BL-11/12/13; SEC-2/5/7 → SEC-15/13/14).

| id | sev. | esență | decizie | unde |
|---|---|---|---|---|
| SEC-1 / ARH-1 | critical | contact străin leagă atacatorul de șofer (F18) | acceptat | 7b |
| SEC-2 | high | bani fără bilet | acceptat | 4a `eroare_creare`, 4d, 1, 5a |
| SEC-3 / BL-2 | high | refund ambiguu readuce biletul valid | acceptat | 6 |
| BL-1 | high | încasarea șoferului arată lipsă | acceptat | 4b (F17) |
| BL-3 / SC-2 | high | lista offline veche | acceptat | 8 |
| BL-4 | high | șoferul de retur greșit | acceptat | 2b (F19) |
| SC-1 / SEC-5 | high/medium | plafoane în memorie | acceptat (în bază); CAPTCHA respins cu fapt F24 (plafonul din bază acoperă scenariul; se reconsideră la abuz în pilot) | 4a |
| ARH-2 | high | ordinea pașilor | acceptat | ordinea nouă |
| ARH-3 / SC-4 | high/medium | 60 KB de neatins în Next; buget nemăsurat | acceptat | decizia 3, S, 8 |
| SEC-4, SEC-6, SEC-7, SEC-8, SEC-9..11, BL-5..10, SC-3, SC-5..7, ARH-4..10 | medium/low | vezi anexa | acceptate toate | 1, 2, 3, 4, 5, 6, 7, 8 |

## Revizori Claude — runda 2 (triaj, pe v2)

Scoruri: business-logic 0.5 (4 high) · security 2.0 (2 high) · scalability 4.0 (1 high) · senior-backend 4.0 (1 high).
Minimul: **0.5**. Toate observațiile vechi: închise.

| id | sev. | esență | decizie | unde în v3 |
|---|---|---|---|---|
| BL-11 | high | termenul online lipsea din raportul pe rută (`get_grafic_report`, F27) | acceptat | decizia 4, 4b |
| BL-12 | high | termenul trebuie pe cheia sesiunii de numărare (rută-zi), nu pe șoferul din 2b | acceptat | 4b `bilete_online_sesiune`, 2b `sesiuneaNumararii` |
| BL-13 / SC-13 | high/low | «`valid` până la plecare» scoate biletul nescanat din termen; retroactiv | acceptat | 4b: `valid` + `urcat` fără condiție de timp + «Neprezentați» |
| BL-14 / C2 | high | `/plati` returnează fără să anuleze biletele (F30) | acceptat | decizia 5, 6 |
| BL-15 | medium | camera numără fără ofertă (F28) | acceptat | `pret_numarare`, 2a, 4b |
| BL-16 | low | `departure_at` și ora de iarnă; `segmentMinutes` nu e de la pornire | acceptat | 1 |
| SEC-15 | high | plată fără rând `maib_checkouts` rămâne fără bilet și fără alertă | acceptat | 4d (inserare din corpul semnat), 5a (F26) |
| SEC-13 / SC-9 | high/medium | `ip_hash` ar fi al serverului web | acceptat | 4a/3: calculat pe web, trimis în corp |
| SEC-12 | medium | reluarea callback-ului pe `anulata` → `platita_fara_bilet` greșit; fără ieșire din stare | acceptat | 1 (funcția inertă pe `anulata`), 6 («Emite biletele» / «Returnează») |
| SEC-14 | medium | `/urcat`, `/telefon` fără verificarea proprietarului; `<cod>` = `cod_qr` | acceptat | 8 |
| SEC-16 | medium | varianta «requestContact direct în API» fără criterii | acceptat | 7b varianta B |
| SEC-17 | low | sarea `ip_hash` = cheia anon; retenția nu anonimizează `ip_hash`; dovada plății ștearsă | acceptat | 1 (`BILETE_IP_SALT`), 5c (13 luni) |
| SEC-18 | low | «`cod` nu pleacă la maib» contrazis de `successUrl` | acceptat (text corectat, risc acceptat explicit) | 3 |
| SC-8 | high | plafonul global 200 blochează vânzarea ~110 min | acceptat | 4a (50), 5a (întâi `noua` fără checkout) |
| SC-10 | medium | `LIMIT 25` fără ordine; `eroare_creare` veșnic | acceptat | 5a (`ORDER BY`, `creare_incercari` ≤ 3) |
| SC-11 / ARH-16 | medium/low | plafoanele în bază fără tabel/indexuri | acceptat | 1 (`bilete_api_apeluri`, index pe `phone`) |
| SC-12 | low | Route Handler fără cache | acceptat | 8 |
| ARH-11 | high | site-ul nu poate citi steagul din `app_config` (F29) | acceptat (API `config`, implicit închis); RPC anon respins — V5 | decizia 1, 4c, 3 |
| ARH-12 | medium | testul «web = admin» compară funcția cu ea însăși; vitest nu e gate | acceptat | 2a (calcul pur + date, caracterizare); risc notat |
| ARH-13 | medium | logica mini app într-un șir JS | acceptat | decizia 3, 8 (modul TS testat, compilat la build) |
| ARH-14 | medium | dependențe inverse (notificări 5a↔7d; `/bilete` 11↔5b/6; «`/plati`-like») | acceptat | ordinea 0→1→2→4→6→11a→5→3→S→7→8→9→11b→10 |
| ARH-15 | low | grupul de test nu există | acceptat | 0.2 |

## Critic extern — runda 1 (Codex, gpt-6-astra, pe v2): scor 4.0, verdict fail, 3 high

| id | sev. | esență | decizie | motiv / unde în v3 |
|---|---|---|---|---|
| C1 | high | 4a nu persista rândul `maib_checkouts` înaintea legării (FK) — clientul face doar HTTP, inserarea e în `/plati` (F30) | acceptat | 4a: tranzacție locală (rând + `checkout_id`), `lib/maib/persist.ts` comun, test de integrare din noul API |
| C2 | high | refund-ul din `/plati` ocolește anularea biletelor | acceptat | decizia 5, 6: `/plati` detectează comanda și cheamă `anuleazaSiReturneaza` sau refuză; test cu bilet `urcat` |
| C3 | high | căutarea `GET /v2/checkouts?orderId=` era neverificată | acceptat și **închis cu fapt**: verificat pe sandbox 02.10 (F26): filtrul `orderId` întoarce exact sesiunea; parametrii necunoscuți se ignoră | 4d, 5a, `findCheckoutByOrderId` cu test pe sandbox în pasul 4 |

## Revizori Claude — runda 3 (triaj, pe v3)

Scoruri: business-logic 6.5 (0 high) · security 7.5 (0 high) · scalability 5.0 (1 high) · senior-backend 6.0 (1 high).
Minimul: **5.0**. Observațiile rundei 2: toate închise (SC-8 și SC-10/11 cu urmări → SC-14/15; SEC-15/17 → SEC-19/21;
ARH-13/14 → ARH-17/18; BL-13/15 → BL-18/19).

| id | sev. | esență | decizie | unde în v4 |
|---|---|---|---|---|
| SC-14 | high | `bilete_api_apeluri` crește la ~3,5 M rânduri în 90 zile pe NANO | acceptat | 1: RPC `bilete_plafon` șterge rândurile > 5 min în același apel |
| SC-8 (rest) | high → închis | comenzile abuzatorului CU `checkout_id` nu se eliberează; fără alertă la plafon | acceptat | 5a (expiră prin starea maib la 25 min, F12), 1 (`plafon_atins`) |
| SC-15 | medium | «scoatere din lot» fără stare | acceptat | 5a: `expirata` + `creare_esuata` |
| SC-16 | low | un singur buget pentru patru treburi | acceptat | 5a: cote pe categorie |
| SC-17 | low | plafonul global 50 nu e atomic | acceptat | 1: `bilete_creeaza_comanda` cu advisory lock |
| SEC-19 | medium | condițiile inserării din callback incomplete; două sesiuni pe comandă | acceptat | 4a (`creare_in_curs_la`, o singură sesiune), 4d (condițiile complete) |
| SEC-20 | medium | «Emite biletele» / «Returnează» nu se exclud | acceptat | 6: revendicare pe `platita_fara_bilet` → `in_lucru` |
| SEC-21 | low | corpul callback-ului 13 luni cu date personale; cădere pe cheia anon; `ip_hash` gol | acceptat | 5c, 4a |
| BL-17 | medium | termenul online doar în `diff`, nu în stare | acceptat | 4b (suma ȘI ramurile de stare), decizia 4 |
| BL-18 | medium | refund admin după cursă pe zi confirmată | acceptat | 6 (confirmare + alertă `refund_pe_zi_confirmata` + recalcul) |
| BL-19 / C5 | medium/high | rata fixată la vânzare ≠ rata zilei cursei; prețul public ≠ prețul numărării | acceptat | decizia 4, 4b (`bilete_online_recalc` cu funcția SQL a numărării, la raport), 2a (fără `pret_numarare`), F32 |
| BL-20 | low | maparea retur → sesiune de două ori (TS + SQL) | acceptat | 2b (o singură dată, în SQL) |
| ARH-18 | high | comanda de test era în 11a, după ce 4d/6 ating callback-ul și `/plati` ale tuturor plăților | acceptat | ordinea + 4-test (condiție de push) |
| ARH-19 | medium | ocolul steagurilor pentru comanda de test nedefinit | acceptat | 4a: `creeazaComanda(input, {mod})`, `test_admin` doar din server action ADMIN |
| ARH-17 | low | mecanismul de build al JS-ului | acceptat | 8 (esbuild, `scripts/build-mini-app.mjs`, `?v=sha`) |
| ARH-20 | low | `config` cu cheie + cache dublu; regiunea site-ului | acceptat | 4c (fără cheie), F31 |

## Critic extern — runda 2 (Codex, pe v3): scor 6.0 (Σ deduceri 5.0 → consistent ar fi 5.0), verdict fail, 2 high

| id | sev. | esență | decizie | motiv / unde în v4 |
|---|---|---|---|---|
| C4 | high | «Verifică refund-ul» din `/plati` scrie o stare terminală în `maib_checkouts` și cron-ul (filtrat pe `refund_status`) nu mai vede comanda | acceptat | 6: `finalizeazaRefund` comun, folosit și de `verificaRefund` (`plati/actions.ts:222-236`); 5a ia comenzile `anulata` cu `refund_finalizat_la IS NULL`, indiferent de `refund_status`; teste Accepted/Rejected din `/plati` înaintea cron-ului |
| C5 | high | `pret_numarare` din prețul public fără ofertă ≠ regulile numărării (tronsoane suburbane pe district, ruta 58) | acceptat | decizia 4, 4b: valorizarea în SQL la raport, la rata zilei cursei; `pret_numarare` scos din schemă (v4 a trimis greșit la 097 — corectat în v5, vezi runda 3) |

## Critic extern — runda 3 (Codex, pe v4): scor 7.0 (Σ 3.0, consistent), verdict fail, 1 high + 1 medium

| id | sev. | esență | decizie | motiv / unde în v5 |
|---|---|---|---|---|
| C5 (rest) | high | v4 trimitea la `recompute_suburban_session_total` (097) ca sursă a calculului pe tronson, dar funcția e DOAR suburbană și rotunjește 0,20 pe tronson; interurbanul e `calculateDirection`, fără rotunjire pe tronson, total la 2 decimale → 98,60 vs 99,20 pe exemplul criticului | acceptat | F32 rescris; 4b: `numarare_pret_segment` după `calculateDirection` pentru interurban, 097 doar pentru suburban; test de echivalență cu rate fracționare (1,17) și ruta 58 |
| C6 | medium | starea `in_lucru` nu e în CHECK-ul din pasul 1; refund-ul comun n-are tranziția din starea revendicată | acceptat | 6: excludere prin `SELECT … FOR UPDATE` în tranzacție, fără stare persistată; funcția de refund acceptă `platita_fara_bilet → anulata`; teste concurente |

**Stare la închiderea celor trei runde:** nicio observație critical/high deschisă la revizorii Claude (runda 3: blocantele
SC-14 și ARH-18 închise în v4) și nici la Codex (C5 rest și C6 închise prin acceptare în v5). Corecțiile v5 NU au mai
fost văzute de Codex (a patra rundă e interzisă); ele sunt rescrieri de text pe două puncte precise, cu dovada
criticului drept sursă. Scoruri la ultima trecere a fiecărei părți: Claude min 5.0 (runda 3, pe v3) · Codex 7.0 (runda 3,
pe v4). Decizia de a merge în implementare e a lui Ion, după răspunsurile la cele 10 întrebări.

---

# Anexă: secțiunile revizorilor Claude și răspunsul criticului Codex

## Runda 1 (pe v1)

## Review: business-logic-auditor

### Observații

- **BL-1 · high.** Încasarea online nu e trecută în raportul de încasări. `get_incasare_report`: `diff = cash + diagrama + ligotniki0 + rashodi − numarare.suma`, iar `numarare.suma` vine din `counting_sessions.tur/retur_total_lei` (`packages/db/migrations/060_anomaly_grafic_history.sql:20-27, 95-99`). **Scenariul de eșec:** 3 pasageri online × 150 lei sunt numărați pe cameră, șoferul nu predă banii lor, iar în /numarare → Încasare apare cu −450 lei. Planul nu pomenește nici Numărarea, nici tiki_tickets/ION-167. **Corecție:** un pas nou: `bilete_online_pe_sofer(driver, ziua)` (bilete `urcat`/`valid` pe cursa șoferului) se adaugă ca termen pozitiv în `diff`. Regula pentru șofer se scrie explicit: nu emite bon la terminal pentru biletul online. Planul spune dacă vânzările online intră în «Bilete aparat» (ION-167).

- **BL-2 · high.** Un refund cu rezultat ambiguu redeschide biletul. Pasul 6 spune: «maib refuză → status înapoi `platita`». Riscurile spun opusul: «rămâne `anulata`». În `/plati`, la excepție se șterge revendicarea (`apps/admin/src/app/(dashboard)/plati/actions.ts:214-216`). **Scenariul de eșec:** POST refund dă timeout, deși maib l-a creat. Comanda revine `platita`, biletele rămân `valid`, iar pasagerul își primește banii și urcă în autobuz. **Corecție:** la timeout sau la un 5xx, comanda rămâne `anulata` cu `refund_status='Pending'`, iar cron-ul pasului 5 o împacă prin `getPayment.refundedAmount`. Comanda revine `platita` doar la un refuz 4xx sigur. Biletele trec în `anulat` în ACELAȘI UPDATE de revendicare, înaintea apelului la maib.

- **BL-3 · high.** Lista offline a șoferului e veche după o anulare. Pasul 8 scanează din cache, iar anularea e permisă până la T−2h. **Scenariul de eșec:** șoferul deschide aplicația la 07:00, pasagerul anulează la 09:00 pentru cursa de 14:00 și primește refund. La 14:00 șoferul e fără rețea și vede verde. **Corecție:** cache-ul are `generat_la`, afișat pe ecran, și se reîmprospătează obligatoriu în fereastra T−2h…T. `POST /urcat` pe un bilet `anulat`/`returnat` nu-l trece în `urcat`: răspunde cu un conflict care ajunge în jurnal (`bilete_scanari`) și în alerta pentru admin.

- **BL-4 · high.** Șoferul de retur e luat greșit. Pasul 8 ia «retur `driver_id_retur`», dar retur-ul real se rezolvă prin `retur_route_id` (override IN/OUT), în `apps/web/src/lib/assignments.ts:93-118`. **Scenariul de eșec:** în ziua cu override, pasagerii cursei R Chișinău→nord ajung la șoferul propriu al lui R, care nu face cursa. Notificarea din pasul 7 pleacă la el, iar șoferul real vede lista goală. **Corecție:** `buildTur/ReturAssignmentMap` se mută în `packages/db` și se folosesc ACELEAȘI funcții în web, la validarea comenzii, în `/bilete-sofer/azi` și la notificare.

- **BL-5 · medium.** Mutarea prețului e incompletă. Prețul real mai depinde de `resolveTariffRates` (`actions.ts:100-129`), de oferta din `offers` potrivită după numele localităților (`:395-400, 433-438`) și de km-ii căutați prin `normalizeStop(nume)`, nu prin `stop_order` (`:361-362, 385-394`). **Corecție:** pasul 2 mută funcția întreagă `pretSegment(fromRo, toRo, date, routeId, goingNorth)`, iar comanda salvează numele căutate, nu doar `stop_order`.

- **BL-6 · medium.** Ziua graficului diferă între web și admin. `resolveAssignmentDate` ia graficul zilei anterioare pentru D+1…D+7 (`actions.ts:231-265`), deci web-ul arată un șofer «atribuit» care nu există pe `trip_date`. Admin respinge comanda (pasul 4) după completarea formularului. **Corecție:** `sale_open` cere ca `assignmentDate === date`.

- **BL-7 · medium.** Împăcarea ocolește verificările callback-ului. Callback-ul refuză o sumă care nu se potrivește (`callback/route.ts:123-132`), dar cron-ul pasului 5 marchează plătit orice `Completed`. În plus, un `Executed` pe o comandă `expirata`/`anulata` dă 0 rânduri și trece în tăcere, deși banii sunt luați. Dacă RPC-ul eșuează, nu e definit codul HTTP. **Corecție:** cron-ul compară `amount` cu `total`. Un rezultat de 0 pe un checkout Completed cu comanda ≠ `platita` → alertă + refund. O eroare RPC → 500, ca banca să reîncerce.

- **BL-8 · low.** Revendicarea anti-dublu nu stă în client, cum spune planul, ci într-o server action cu `requireRole('ADMIN')` (`plati/actions.ts:180-198`; `lib/maib/client.ts:252` nu scrie în bază). **Corecție:** planul prevede extragerea ei într-un `lib/maib/refund.ts` comun.

- **BL-9 · low.** `departure_at` greșește după miezul nopții. Ora vine din `hour_from_*` + `trip_date`, iar o oprire după 00:00 pe o cursă de seară (`timetable.ts:132-133`) primește data greșită, deci și termenul de 2 h e greșit. **Corecție:** data se calculează din ora de pornire a rutei + `segmentMinutes`.

- **BL-10 · low.** Cursa anulată de companie nu are acoperire. Lipsește verificarea «bilete plătite pe o cursă fără șofer la T−3h» → alertă / refund admin. **Corecție:** se adaugă în cron-ul pasului 5.

### Deduceri
BL-1..BL-4: −2.0 fiecare (−8.0); BL-5, BL-6, BL-7: −1.0 fiecare (−3.0); BL-8, BL-9, BL-10: −0.5 fiecare (−1.5). Total −12.5 → scor plafonat la 0.0.

Scor: 0.0 · Blocante (critical/high): 4


## Review: security-auditor

**SEC-1 · critical (−3.0) · legarea șoferului se poate fura cu un contact străin.**
Pasul 7a potrivește `message.contact.phone_number` cu `drivers.phone`, dar nu cere ca contactul să fie al expeditorului. În Telegram oricine poate trimite botului cartea de contact a altcuiva. Telefoanele șoferilor sunt publice pe site (`apps/web/src/app/(public)/actions.ts:407,457`, `public_drivers_view`).
*Scenariu:* un concurent ia de pe translux.md telefonul șoferului cursei Ungheni–Chișinău, creează un contact cu acel număr și îl trimite botului. Botul scrie `drivers.telegram_id` = contul atacatorului. Atacatorul vede apoi numele și telefoanele pasagerilor și marchează biletele «urcat».
*Corecție:* legarea se acceptă doar dacă `contact.user_id === ctx.from.id`, chatul e privat și mesajul nu e forward. Telefonul care se potrivește cu mai mulți șoferi se refuză și ajunge la admin (7b).

**SEC-2 · high (−2.0) · bani încasați fără bilet.**
`bilete_marcheaza_platita` lucrează doar pe `status='noua'`. Pasul 4 trece comanda în `expirata` dacă «maib pică». Un timeout după ce sesiunea s-a creat totuși la maib lasă comanda fără `checkout_id`, iar callback-ul ajunge la «checkoutId necunoscut» → 200 și nimic altceva (`api/pay/maib/callback/route.ts:117-121`). La fel, un `Executed` întârziat pe o comandă deja `expirata` nu face nimic.
*Scenariu:* pasagerul plătește, nu primește bilet, iar nimeni nu e anunțat.
*Corecție:* `orderId` = id-ul comenzii. Callback-ul cu checkoutId necunoscut caută comanda după `orderId`, iar cel cu `Executed` pe o comandă `expirata` sau `anulata` pune starea `platita_fara_bilet`, apoi fie emite biletele, fie face refund automat, plus alertă la admin. Starea unei erori ambigue la crearea sesiunii e `eroare_creare`, nu `expirata`, și se împacă prin cron.

**SEC-3 · high (−2.0) · refund-ul ambiguu repune biletul valid; două revendicări separate.**
Pasul 6 face «maib refuză → înapoi `platita`». Clientul tratează însă orice excepție la fel, inclusiv timeout-ul de după ce refund-ul a fost creat (`(dashboard)/plati/actions.ts:213-218` eliberează revendicarea la orice eroare). Revendicarea anti-dublu e în acțiunea cu `requireRole` (`actions.ts:180,190-198`), nu în `lib/maib`.
*Scenariu:* răspunsul maib la refund expiră, comanda revine `platita` cu biletele valide, iar refund-ul e de fapt `Accepted`: pasagerul călătorește și își primește și banii. Pe altă cale, admin «Returnează» din /bilete și pasagerul «Anulează» în paralel: două căi cu revendicări diferite (`bilete_comenzi.status` față de `maib_checkouts.refund_status`).
*Corecție:* o singură funcție în lib care revendică pe `maib_checkouts.refund_status IS NULL` și e folosită de ambele căi. Doar un refuz explicit 4xx revine la `platita`. Timeout-ul și 5xx lasă `anulata` + `refund_status='Necunoscut'`, iar cron-ul îl împacă prin `getPayment`.

**SEC-4 · medium (−1.0) · prefixul public `/api/bilete/` acoperă tot subarborele** (`lib/public-paths.ts:54`, `startsWith`). Orice rută de admin pusă acolo (refund, export) ar fi fără sesiune. *Corecție:* acțiunile de admin rămân server actions din `(dashboard)/bilete`. În `public-paths.test.ts` se adaugă un test care listează rutele publice permise sub `/api/bilete*`.

**SEC-5 · medium (−1.0) · plafoanele sunt în memorie** (`extern/camioane-banda/route.ts:58-67`): se resetează la fiecare instanță Vercel, deci limita «5/10 min pe ip_hash» nu ține. Server action-ul `cumparaBilet` e public, iar fiecare comandă creează o sesiune la maib. *Corecție:* plafon în bază (numărare pe `bilete_comenzi.ip_hash` + `created_at`, ca migr. 334) și maximum N comenzi `noua` pe telefon.

**SEC-6 · medium (−1.0) · secretul paginii biletului se scurge.** Calea `/ro/bilet/<cod>` ajunge în `page_views.path` (`apps/web/src/app/api/analytics/track/route.ts:55-62`). `orderId = cod` e trimis la maib. *Corecție:* `orderId` separat, `/bilet/` exclus din tracking, `Referrer-Policy: no-referrer` pe pagina biletului.

**SEC-7 · medium (−1.0) · stările urcat/anulat se bat.** Coada offline poate trimite «urcat» după anulare. «Altă cursă» e permisă la scanare. *Corecție:* `/urcat` acceptă doar `valid` și jurnalizează restul. Anularea se refuză dacă vreun bilet e `urcat`. Marcarea pe altă cursă se scrie doar în `bilete_scanari`, cu cursa reală.

**SEC-8 · medium (−1.0) · datele personale ale pasagerilor ajung în `localStorage` și Telegram `CloudStorage`, fără ștergere.** `CloudStorage` e un terț nedeclarat în politica Legii 195. *Corecție:* doar `localStorage`, cheia zilei curente, iar zilele vechi se șterg la deschidere. Telefonul pasagerului se arată doar la cerere. `CloudStorage` se scoate.

**SEC-9 · low (−0.5)** · `bilete_marcheaza_platita`: `SET search_path = public`, `GRANT EXECUTE` doar pentru service_role. Funcția verifică ea însăși `maib_checkouts.status='Completed'` și `amount = bilete_comenzi.total`.

**SEC-10 · low (−0.5)** · Extragerea `init-data.ts`: comparația `!==` (`zadachnik/auth.ts:43`) se înlocuiește cu `timingSafeEqual`. Ocolirea `ALLOW_DEV_AUTH` (`auth.ts:61`) nu se aplică șoferilor. La dezactivarea șoferului se face și dezlegarea.

**SEC-11 · low (−0.5)** · `BILETE_API_KEY` de ≥256 biți, separată de `CAMIOANE_API_KEY`, fără `NEXT_PUBLIC_`. `lib/bilete-api.ts` primește `import 'server-only'`.

### Deduceri
| Id | Greutate |
|---|---|
| SEC-1 | −3.0 |
| SEC-2 | −2.0 |
| SEC-3 | −2.0 |
| SEC-4…SEC-8 | 5 × −1.0 |
| SEC-9…SEC-11 | 3 × −0.5 |
| **Total** | **−13.5 → plafonat la 0.0** |

Scor: 0.0 · Blocante (critical/high): 3


## Review: scalability-auditor

Scara reală e mică (zeci de comenzi/zi, 66 de șoferi): ce rupe planul nu e volumul, ci abuzul pe endpointul public, offline-ul și bugetele nemăsurate.

### Observații

**SC-1 · high (−2.0) · Plafoanele din pasul 4 și 8 nu funcționează pe serverless.**
Planul cere «30/min pe cheie, 5/10 min pe ip_hash» și «120/min pe șofer». Tiparul citat (F6) are contorul în memoria instanței: `apps/admin/src/app/api/extern/camioane-banda/route.ts:48-56` (`let apeluri`). Pe Vercel fiecare instanță are contorul ei, deci plafonul real e N×. Site-ul folosește deja varianta corectă, în bază: RPC `cautari_recente` (migr. 334, `apps/web/src/app/(public)/actions.ts:296-312`).
Scenariu: un scraper cheamă direct server action-ul `cumparaBilet` (e public) cu ip-uri rotite. Fiecare apel face un INSERT în `bilete_comenzi` și o sesiune maib (+token, +`getCheckout` la cron). Zeci de mii de comenzi `noua` umflă NANO-ul (incidentul 01.10) și epuizează cota maib.
Corecție: limita pe ip_hash și pe cheie se numără în bază (RPC pe `bilete_comenzi.ip_hash` + `created_at`, index), nu în memorie. Adăugați un plafon global de comenzi `noua` deschise (de ex. 200) și un CAPTCHA/honeypot pe formular. Același RPC pentru limita pe șofer.

**SC-2 · high (−2.0) · Offline: biletul vândut după descărcarea listei apare «necunoscut» (roșu).**
Pasul 8 descarcă lista la deschidere. Vânzarea rămâne deschisă până la 30 min înainte de plecare (pasul 3), deci o listă luată la 06:00 nu conține biletul cumpărat la 07:40. Scenariu: pasagerul plătit e refuzat la urcare, în sat, fără semnal. În sens invers, un bilet anulat și returnat după descărcare rămâne verde offline.
Corecție: (a) offline, un cod necunoscut devine portocaliu «neconfirmat, nu e în lista de la HH:MM», acceptat la decizia șoferului, pus în coada de verificare; (b) lista se reîmprospătează la fiecare `online`, la `visibilitychange` și la ~60 s cât ecranul e deschis; (c) ecranul arată vârsta listei; (d) serverul păstrează primul `urcat_at` (`UPDATE … WHERE status='valid'`) și primește ora scanării de la client; (e) verificați limitele CloudStorage din docs (valoarea e limitată la câteva mii de caractere, nu încape lista; F10 nu le verifică). Pe localStorage din webview-ul iOS nu contați ca sursă unică.

**SC-3 · medium (−1.5) · Cron-ul de expirare (pasul 5) nu are lot, index și plafon de timp.**
`getCheckout` e secvențial per comandă, iar funcția are `maxDuration` ≈ 15–30 s (cf. `callback/route.ts:18`, `anunt-bilete-online/route.ts:9`); fiecare apel maib are timeout propriu (`lib/maib/client.ts:156,189`). Dacă SC-1 lasă un rest de sute de comenzi `noua`, tick-ul expiră la mijloc și restul nu mai ajunge niciodată. Pasul 1 indexează doar (`trip_date`, `crm_route_id`, `going_north`) și `checkout_id`, deci `WHERE status='noua' AND created_at<…` e seq scan.
Corecție: index parțial `(created_at) WHERE status='noua'`; `LIMIT 25` pe tick, cu paralelism 5 și buget de timp 20 s; un contor «comenzi `noua` mai vechi de 40 min» vizibil în `/bilete` și în digestul de seară (acum nu există nicio alertă dacă cron-ul VPS tace).

**SC-4 · medium (−1.5) · Bugetul «≤ 60 KB JS, Lighthouse ≥ 90» e nemăsurat pe baza reală.**
Singura cifră (F11) e 150 KB pentru paginile existente, care sunt React client components în Next (`mini-app/zadachnik/layout.tsx:1,8`). Planul nu a măsurat un ecran gol Next+React în repo; probabil rămâne puțin loc pentru cod. Scenariu: testul `size-limit` din CI pică la pasul 8, iar bugetul fie se ridică în tăcere, fie blochează lansarea de după 12.10.
Corecție: ca primă sub-sarcină a pasului 8, măsurați o pagină goală și scrieți bugetul pe cifra reală; dacă nu intră, pagina devine HTML + script inline (fără framework). Hash-ul `tgWebAppData` din URL oferă `initData` fără să aștepte SDK-ul, deci fără polling la 50 ms (`zadachnik/ui.ts:55-64`). Încărcarea sincronă din `<head>` blochează desenarea dacă telegram.org e lent; folosiți `ready()` după primul desen, nu înainte.

**SC-5 · medium (−1.0) · Pagina biletului și callback-ul: polling și lucrări în calea răspunsului.**
Pagina `noua` se reîncarcă la 5 s, adică 2 salturi (web → admin → bază), `no-store`, fără plafon: ~300 cereri per comandă în 25 min. Corecție: 5→15 s cu plafon la 3 min, apoi buton «Verifică»; la `noua` serverul poate face un `getCheckout` direct, ca să nu aștepte callback-ul. Notificarea șoferului din pasul 4/7 nu rulează în callback (`maxDuration 15`, `callback/route.ts:18`): după ce răspunde 200 (`after()`), sau din cron. Un Telegram lent altfel face banca să reîncerce.

**SC-6 · low (−0.5) · Comanda nu e idempotentă la dublu-click.** Formularul trimite un `idempotency_key` (uuid generat în browser), `UNIQUE` pe `bilete_comenzi`; altfel două sesiuni maib pentru o singură intenție.

**SC-7 · low (−0.5) · Retenția de 90 de zile nu are pas.** Riscul din tabel o promite, dar nu există job. Folosiți `pg_cron` (precedent: migr. 439), în lot, noaptea, nu într-un singur DELETE.

### Ce e rezonabil
Volumul tabelelor (zeci de rânduri/zi, ~100k/an) e neglijabil pentru NANO; cron-ul VPS evită cele 2 cron-uri Hobby; callback-ul cu jurnal limitat e corect. Lecția incidentului 01.10 (lock lung pe cozi) nu atinge tabelele noi, dar RPC-ul `bilete_marcheaza_platita` trebuie să aibă `statement_timeout` scurt.

### Deduceri
- SC-1: −2.0
- SC-2: −2.0
- SC-3: −1.5
- SC-4: −1.5
- SC-5: −1.0
- SC-6: −0.5
- SC-7: −0.5

Total −9.0, deci 10.0 − 9.0 = 1.0.

Scor: 1.0 · Blocante (critical/high): 2


## Review: senior-backend-engineer

Runda 1 · zona: arhitectura și ordinea pașilor.

**ARH-1 · critical (−3.0) · legarea prin `message:contact` nu cere ca contactul să fie al expeditorului.**
Dovadă: telefonul șoferului e public pe translux.md (`apps/web/src/app/(public)/actions.ts:457`, `phone: driver?.phone`); botul primește orice mesaj privat (`apps/bot/src/bot.ts:381`); planul (pasul 7a) potrivește doar `phone_number` cu `drivers.phone`.
Scenariu: oricine ia de pe site numărul șoferului X, îi trimite botului cartea de contact a lui X (atașament → contact). Botul îi leagă `telegram_id`-ul de X, iar omul vede numele și telefoanele pasagerilor și poate marca «urcat».
Corecție: legarea se face doar când `contact.user_id === ctx.from.id`; altfel se refuză și se scrie în `drivers_telegram_incercari`. Test pentru contactul străin.

**ARH-2 · high (−2.0) · ordinea de lansare: butonul ajunge în prod înaintea API-ului, a mini app-ului și a uneltelor admin.**
Dovadă: steagul `crm_routes.bilete_online` apare abia la pasul 10. central-hub se livrează la fiecare push pe main (CLAUDE.md), iar pasul 3 vine înaintea pasului 4. Pasul 8 se bazează pe identitatea din 7, dar handlerul botului e la 9. Riscul F8 cere testul «înaintea pasului 8», deși 9 vine după 8. `/bilete` (11), cu refundul manual pe care îl cere tabelul de riscuri, vine după lansare (10).
Scenariu: după push-ul pasului 3, pasagerii apasă «Cumpără bilet» pe toate cele 30 de rute și primesc 404/500. Odată puse cheile de prod (pasul 0), biletele se plătesc înainte ca șoferul să le poată verifica.
Corecție: steagul (global `app_config.bilete_online_activ` + per rută) intră în migrația pasului 1, iar `sale_open` îl cere. Ordinea: 0 → 1 → 2 → 4 → 5 → 6 → 3 (ascuns) → spike F8 + `requestContact` → 7 (cu handlerul botului) → 8 → 9 → 11 → 10.

**ARH-3 · high (−2.0) · «≤ 60 KB JS» e de neatins într-o rută Next sub layout-ul rădăcină.**
Dovadă: `apps/admin/src/app/layout.tsx:2-36` încarcă 2 fonturi Google și `globals.css` pe orice rută. Runtime-ul App Router (React + Next) depășește singur bugetul, iar mini app-urile de azi au 150 KB (F11).
Scenariu: pasul 8 se blochează sau criteriul cade în tăcere.
Corecție: `mini-app/bilete` devine un Route Handler care întoarce HTML static + JS vanilla inline (fără React), cu SDK-ul în `<head>`. Bugetul se măsoară pe răspunsul HTML.

**ARH-4 · medium (−1.0) · prețul are deja o a treia copie.**
Dovadă: `apps/admin/src/lib/trips-search.ts:105-151,410` (580 de linii, `pickRate` duplicat) e folosit de asistent (`site-assistant/cards.ts:8`). Rata pe dată (`resolveTariffRates`, `actions.ts:100`) și oferta (`:433`) nu sunt în `timetable.ts`.
Corecție: în `packages/db` merge un `calculeazaPret(db, {data, ruta, de, spre})` cu clientul injectat, care face rata + oferta + `buildScheduledTrips`. Îl folosesc `actions.ts`, `trips-search.ts` și API-ul comenzii. Testul compară încărcarea, nu doar funcția pură.

**ARH-5 · medium (−1.0) · `/start bilete` lovește tokenul de invitație.**
Dovadă: `apps/bot/src/handlers/start.ts:13-17`. Orice payload trece prin `validateInviteToken` și primește «Link de invitație invalid».
Corecție: payload-ul `bilete` se rutează înaintea invitației; test.

**ARH-6 · medium (−1.0) · extragerea `verifyInitData` fără plasă.**
Dovadă: `zadachnik/auth.ts:28-54` n-are niciun test. Ocolul `__dev__` (`:61-70`) întoarce un ADMIN. Consumatori: 7 rute zadachnik + `atribuiri/auth.ts:1`.
Corecție: în `lib/telegram/init-data.ts` merge doar funcția pură `verifyInitData(initData, token, nowSec) → {telegramId, startParam} | null`. Testele acoperă ambele variante de `signature`, expirarea și `user` lipsă. `authFromInitData` și ocolul dev rămân în zadachnik; auth-ul șoferului nu are ocol.

**ARH-7 · medium (−1.0) · normalizarea greșită a telefonului.**
Dovadă: `packages/db/src/driver-phone.ts:12` (`normalizeDriverPhone`, forma canonică 373XXXXXXXX, folosită de admin și bot) există deja. `apps/web/src/lib/phone.ts` e doar pentru afișare. Migr. 254/256 verifică doar că telefonul nu e gol, deci rândurile vechi au formate amestecate.
Corecție: `lib/phone.ts` nu se mută. Ambele părți trec prin `normalizeDriverPhone` (cu `PhoneError` prins), iar coincidența multiplă merge la admin.

**ARH-8 · low (−0.5) · eroarea RPC din callback.**
Dovadă: `api/pay/maib/callback/route.ts:113-116` întoarce 500 la erori de citire.
Corecție: dacă `bilete_marcheaza_platita` dă eroare, callback-ul întoarce 500 (maib reîncearcă, funcția e idempotentă). Notificarea șoferului rămâne în afara căii critice.

**ARH-9 · low (−0.5) · presupunere de verificat despre `requestContact`.**
Corecție: spike-ul F8 verifică dacă `contactRequested` aduce un `response` semnat; dacă da, legarea în API-ul admin, fără `deploy-bot`.

**ARH-10 · low (−0.5) · lipsesc din «Fișiere»:** `apps/admin/src/lib/trips-search.ts`, `apps/web/src/lib/route-pages.ts` (importă timetable la `:5`), `apps/web/src/lib/timetable.test.ts` (se mută), `packages/db/src/index.ts`, `apps/admin/src/lib/zadachnik/auth.ts`, `apps/bot/src/handlers/start.ts` (rutarea payload-ului) și crontab-ul VPS pentru `bilete-expirare`.

Fără deducere: API-ul admin + cheie comună (F5/F6) e corect; `@translux/db` se construiește înaintea web/admin (`vercel.json`, `apps/admin/vercel.json:6`).

### Deduceri
| Id | Severitate | Greutate |
|---|---|---|
| ARH-1 | critical | −3.0 |
| ARH-2 | high | −2.0 |
| ARH-3 | high | −2.0 |
| ARH-4 | medium | −1.0 |
| ARH-5 | medium | −1.0 |
| ARH-6 | medium | −1.0 |
| ARH-7 | medium | −1.0 |
| ARH-8 | low | −0.5 |
| ARH-9 | low | −0.5 |
| ARH-10 | low | −0.5 |
| Total | | −12.5 → 10 − 12.5 = −2.5, plafonat la 0.0 |

Scor: 0.0 · Blocante (critical/high): 3


## Runda 2 (pe v2)

## Review: business-logic-auditor — runda 2

### Runda 1

| id | stare | de ce |
|---|---|---|
| BL-1 | parțial | termenul există, dar e construit greșit → BL-11/12/13 |
| BL-2 | închis | 6: revine doar la 4xx; bilete `anulat` în aceeași tranzacție |
| BL-3 | închis | 8: T−2h…T; `/urcat` doar pe `valid` |
| BL-4 | închis | 2b |
| BL-5 | închis | 2a; `from_name`/`to_name` |
| BL-6 | închis | 3, 4a |
| BL-7 | închis | 1 (suma în funcție), 5a |
| BL-8 | închis | dar a adus BL-14 |
| BL-9 | închis | ora de pornire; fusul orar → BL-16 |
| BL-10 | închis | 5a |

### Noi

- **BL-11 · high.** 4b corectează doar `get_incasare_report`. `get_grafic_report` are aceeași formulă (`320_grafic_report_numerar_manual.sql:298, 311-312`). **Eșec:** în raportul pe rută, cursa cu 3 bilete online apare `underpaid` −450, iar Încasare arată `ok`. **Corecție:** 4b schimbă ambele funcții, cu test pe aceeași zi.

- **BL-12 · high.** Numărarea pune tur și retur pe `cs.driver_id` al sesiunii rută-zi (`060:20-27`). Raportul pe rută pune returul override pe rândul A (`320:245, 277`). Planul atribuie biletele online prin 2b: retur → `driver_id_retur` sau ruta B (`assignments.ts:99-104`). **Eșec:** când returul e făcut de alt șofer sau prin override, A iese `underpaid` și B `overpaid`. **Corecție:** termenul se agregă pe cheia sesiunii de numărare (ruta rândului din grafic, cu returul mapat invers prin `retur_route_id`, plus `trip_date`) → `cs.driver_id`. Ziua se ia din `trip_date`, nu din `departure_at::date`.

- **BL-13 · high.** «`urcat` (și `valid` până la plecare)»: raportul se face după cursă, deci un bilet nescanat iese din termen. **Eșec:** șoferul nu scanează (grabă, scanare portocalie, coada netrimisă). Camera numără pasagerul (`060:96-99`), iar șoferul apare cu lipsă, ca în BL-1. **Corecție:** termenul = `valid` + `urcat` nereturnate, plus o coloană «neprezentați online». Un refund după `incasare_day_confirmations` dă alertă și nu rescrie ziua confirmată.

- **BL-14 · high.** `/plati` listează toate `maib_checkouts` (`plati/actions.ts:61`), iar «Returnează» (`:179-218`) atinge doar `maib_checkouts`. **Eșec:** adminul returnează o plată de bilete din `/plati`. Biletele rămân `valid`: verde la șofer, pasagerul urcă, Încasarea creditează suma. 5a nu prinde cazul, pentru că filtrează doar comenzile `anulata`. **Corecție:** `/plati` refuză checkout-urile legate de `bilete_comenzi` și trimite la `/bilete`, sau `lib/maib/refund.ts` anulează și biletele.

- **BL-15 · medium.** Camera socotește km × rată (`numarare/calculation.ts:57-66`), fără ofertă. Prețul online include oferta (`apps/web/src/app/(public)/actions.ts:45-56`), deci fiecare reducere lasă o lipsă falsă. **Corecție:** prețul de tarif se salvează separat și intră în termen, sau reducerea are o coloană proprie.

- **BL-16 · low.** `departure_at` e `timestamptz` calculat dintr-o oră locală; ora de iarnă începe pe 25.10.2026. **Corecție:** calculul se face în `Europe/Chisinau`, cu test pe 24–26.10. `segmentMinutes(time, arrival)` măsoară segmentul urcare→coborâre (`timetable.ts:74-77`), deci se apelează cu (ora de pornire, ora opririi de urcare).

### Deduceri
BL-11..14: −2.0 × 4 = −8.0; BL-15: −1.0; BL-16: −0.5. Total −9.5.

Scor: 0.5 · Blocante (critical/high): 4


## Review: scalability-auditor — runda 2

SC-1…SC-7 sunt închise. v2 aduce o problemă serioasă nouă (plafonul global ca pârghie de blocare) și câteva goluri mici.

### Observațiile vechi

| Id | Stare | Dovadă |
|---|---|---|
| SC-1 | închis | Plafoane în bază (4a, F24; precedent `packages/db/migrations/334_search_rate_limit.sql:17`); respingerea CAPTCHA are fapt. Goluri noi: SC-8, SC-9. |
| SC-2 | închis | Portocaliu «neconfirmat», reîmprospătare la `online`/`visibilitychange`/60 s, `generat_la`, fără CloudStorage (pasul 8). |
| SC-3 | închis cu rezervă | Index parțial (rând 123), `LIMIT 25`, buget 20 s, contor 5b. Rezerva: SC-10. |
| SC-4 | închis | Route Handler HTML, buget din cifra măsurată (pasul S), `initData` din hash. |
| SC-5 | închis | Polling 15 s cu plafon 3 min, notificare în `after()`/cron. |
| SC-6 | închis | `idempotency_key` UNIQUE + `ON CONFLICT … RETURNING` (4a). |
| SC-7 | închis | Precedent `439_analytics_vizitatori_unici.sql:43` (`cron.schedule`); la zeci de rânduri/zi loturile nu sunt necesare. |

### Observații noi

**SC-8 · high · Plafonul global de 200 comenzi `noua` blochează vânzarea.**
O comandă `noua` se închide doar la cron (> 30 min, `*/10`, 25 pe tick, 5a). Un script cu ip-uri rotite sare peste limita de 5/10 min pe ip și umple cele 200 de locuri în câteva minute. Golirea ia 8 ticks (~80 min) plus cele 30 min de așteptare: vânzare blocată ~110 min, iar atacatorul reia. Honeypotul nu oprește un apel direct la API.
Corecție: plafon global ~50; comenzile vechi fără `checkout_id` se închid primele; plafon și pe `user_agent`; alertă la admin când se atinge plafonul.

**SC-9 · medium · `ip_hash` nedefinit pe traseul site → admin.**
Pe site `ip_hash` vine din `x-forwarded-for` (`apps/web/src/app/(public)/actions.ts:275-281`). Dacă admin hașează IP-ul cererii server-la-server, toți pasagerii au aceeași adresă, iar limita de 5/10 min oprește tot site-ul după 5 comenzi.
Corecție: site-ul trimite `ip_hash` cu sarea din 334, admin nu recalculează. Test: 6 comenzi de la un hash, a 7-a de la altul trece.

**SC-10 · medium · `LIMIT 25` fără ordine.**
5a nu spune după ce se ordonează. Un `eroare_creare` nerezolvabil (60 min) poate reveni la fiecare tick și ține în loc comenzi plătite.
Corecție: `verificat_la`, `ORDER BY verificat_la NULLS FIRST, created_at`; după N încercări, `expirata` + alertă.

**SC-11 · medium · Plafoanele din bază nu au tabelă și indexuri complete.**
Plafonul de 120/min pe șofer (pasul 8) nu are unde să se numere (`bilete_comenzi` nu servește), iar «≤ 3 `noua` pe telefon» nu are index `(phone) WHERE status='noua'`. Corecție: tabelă mică de contoare, sau renunți la plafonul pe șofer, fiindcă `initData` e semnat. Reîmprospătarea la 60 s × 66 șoferi (~1 cerere/s) nu e o problemă; limitează doar rafala la `visibilitychange` (minimum 10 s între cereri).

**SC-12 · low · Route Handler fără antete de cache.** HTML-ul e identic pentru toți: `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400` și `?v=` pentru versiune scot cold start-ul din calea deschiderii. Verifică intrarea în `public-paths.ts`.

**SC-13 · low · `get_incasare_report` cu termenul online.** Costul e neglijabil (câteva rânduri/cursă, filtrate pe `trip_date`). Corectitudine: ultima definiție e `060_anomaly_grafic_history.sql`, iar «`valid` până la plecare» schimbă retroactiv suma zilelor vechi. Pentru zile trecute se numără doar `urcat`.

### Deduceri
- SC-8: −2.0
- SC-9: −1.0
- SC-10: −1.0
- SC-11: −1.0
- SC-12: −0.5
- SC-13: −0.5

Total −6.0, deci 10.0 − 6.0 = 4.0.

Scor: 4.0 · Blocante (critical/high): 1


## Review: security-auditor — runda 2

### Runda 1 pe v2

| id | stare | dovadă |
|---|---|---|
| SEC-1 | închis (varianta prin bot) | `contact.user_id` îl pune Telegram după număr; forward-ul păstrează id-ul proprietarului. Varianta B → SEC-16 |
| SEC-2 | **parțial** → SEC-15 | |
| SEC-3 | închis | 6: o revendicare, doar 4xx revine |
| SEC-4 | închis | `public-paths.ts:7-31` n-are `/api/bilete/`; `/api/bilete-sofer/` cu `/` final nu prinde altceva |
| SEC-5 | **parțial** → SEC-13 | |
| SEC-6 | închis, cu SEC-18 | |
| SEC-7 | închis pe stare, deschis pe proprietar → SEC-14 | |
| SEC-8…SEC-11 | închise | 8, 5c, 1, 7a, 4a |

### Observații noi

**SEC-15 · high · plata fără `maib_checkouts` rămâne fără bilet, fără alertă.** La `eroare_creare` nu există rând în `maib_checkouts`; callback-ul răspunde 200 «necunoscut» (`api/pay/maib/callback/route.ts:117-121`), deci maib nu mai reîncearcă. `bilete_marcheaza_platita(p_checkout_id)` citește `maib_checkouts` → 0. Căutarea `GET /v2/checkouts?orderId=` nu există în client (`lib/maib/client.ts:217-262`) și nici în F12. *Scenariu:* timeout la creare, pasagerul plătește, cron-ul pune `expirata` după 60 min, nimeni nu află. *Corecție:* pe ramura «necunoscut» cu `orderId` = comandă `noua`/`eroare_creare` și `amount = total` se face INSERT în `maib_checkouts` din corpul semnat, se scrie `checkout_id`, apoi RPC-ul. `eroare_creare` nu trece niciodată tăcut în `expirata`, ci în alertă. Listarea după `orderId` se verifică în sandbox (F12).

**SEC-13 · high · plafonul pe `ip_hash` numără IP-ul serverului web.** Comanda vine server-la-server (web → admin), iar admin citește IP-ul din antetele propriei cereri (`asistent-site/route.ts:36`, `ip-access.ts:24`). *Scenariu:* toți cumpărătorii au același `ip_hash`, iar al 6-lea din 10 min, din toată țara, e refuzat. *Corecție:* `ip_hash` se calculează în web (`actions.ts:275-281`), se trimite în corp (de încredere doar datorită cheii); test.

**SEC-12 · medium · un callback duplicat strică o comandă anulată.** Regula din pasul 1 «`anulata`/`returnata` + Completed → `platita_fara_bilet`» prinde și reluarea callback-ului aceleiași plăți (ruta reaplică la fiecare livrare, `route.ts:144-160`). Starea `anulata` se pierde, iar 5a nu mai împacă refund-ul. Cu `platita_fara_bilet` nu există nici ieșire: `anuleazaSiReturneaza` cere `platita`. *Corecție:* condiția devine `paid_at IS NULL AND status IN (expirata, eroare_creare)`; pentru `platita_fara_bilet` se adaugă refund-ul din 6.

**SEC-14 · medium · `/urcat` și `/telefon/<cod>` verifică doar starea, nu proprietarul.** *Corecție:* `<cod>` = `cod_qr` (niciodată codul comenzii, care permite anularea). Ambele rute cer ca biletul să fie pe o cursă a șoferului în `trip_date` (2b); altfel răspund 403 + jurnal.

**SEC-16 · medium · varianta «requestContact direct în API» n-are criterii.** *Corecție:* doar `response` semnat (HMAC ca initData), cu `contact.user_id === initData.user.id` și `auth_date` proaspăt; `responseUnsafe` e interzis.

**SEC-17 · low · `ip_hash` are sarea = cheia anon** (`actions.ts:279`, `visitor.ts:9`), deci se poate inversa în IP lângă nume și telefon. 5c nu-l anonimizează, iar ștergerea `maib_callbacks` la 90 de zile pierde dovada semnată a plății pentru chargeback. *Corecție:* `ip_hash` se golește la 90 de zile; `maib_callbacks` se anonimizează, nu se șterge.

**SEC-18 · low · rândul 115 («`cod` NU pleacă la maib») e contrazis de `successUrl` (168).** *Corecție:* textul se corectează (maib e procesatorul, riscul e acceptat).

Fără deducere: `orderId = id` (uuid aleator, nu e acreditare); honeypot-ul; `idempotency_key` (cere `crypto.randomUUID`, 409 la conținut diferit); pasul S (fără jurnalizarea `initData`).

### Deduceri
SEC-15 −2.0; SEC-13 −2.0; SEC-12, SEC-14, SEC-16 −1.0 fiecare; SEC-17, SEC-18 −0.5 fiecare. Total −8.0.

Scor: 2.0 · Blocante (critical/high): 2


## Review: senior-backend-engineer — runda 2

Zona: arhitectura și ordinea pașilor, verificate pe planul v2 și în cod.

### Observațiile din runda 1

| id | stare | unde |
|---|---|---|
| ARH-1 | închis | 7b: `contact.user_id === from.id`, chat privat, fără forward |
| ARH-2 | închis (steaguri în 1, ordinea nouă); două dependențe inverse noi la ARH-14 | |
| ARH-3 | închis (Route Handler); testabilitatea JS-ului la ARH-13 | |
| ARH-4 | închis în text; testul la ARH-12 | 2a |
| ARH-5 … ARH-10 | închise | 7b, 7a, F21, 4d, S, tabelul «Fișiere» |

### Observații noi

**ARH-11 · high (−2.0) · site-ul nu poate citi steagul global.**
Dovadă: anon nu are nicio politică pe `app_config`. SQL pe viu (02.10): `relrowsecurity = true`, 0 politici pentru anon sau public. `apps/web/src/lib/supabase.ts:20-25` folosește doar cheia anon.
Scenariu: pasul 3 calculează `sale_open` din `app_config.bilete_online_activ` și `BILETE_INCHIDERE_MIN`, dar anon citește 0 rânduri. Butonul nu apare nici după pasul 10, sau, mai rău, «lipsă = implicit» deschide vânzarea.
Corecție: configurația ajunge în web printr-un `GET /api/bilete/public/config` (cache 60 s) sau printr-un RPC `SECURITY DEFINER` cu `GRANT anon` și `REVOKE … FROM PUBLIC`. Lipsa răspunsului = închis. 4a re-verifică oricum.

**ARH-12 · medium (−1.0) · testul de preț «pe încărcarea reală» nu prinde nimic.**
Dovadă: `packages/db/package.json:6-7` (ambele aplicații rezolvă pachetul din `dist`). Aliasul din `apps/web/tsconfig.json:19-21` trimite la `db-types.ts`, un fișier care nu există. `apps/web/vitest.config.ts` n-are alias. Gate-ul `GG_TEST_CMD` verifică doar migrațiile.
Ce se întâmplă: «web = admin» compară aceeași funcție cu ea însăși. Cu bază reală, testul cere rețea și secrete.
Corecție: `calculeazaPret` se împarte în `incarcaDatePret(db, …)` (IO) și `pretDin(date, …)` (funcție pură). Înaintea mutării, un test de caracterizare înregistrează ieșirea actuală a `searchTrips` pe fixturi JSON extrase din SQL. Rezultatul pasului 2 spune explicit că `vitest` rulează de mână.

**ARH-13 · medium (−1.0) · logica critică a mini app-ului ar sta într-un șir de caractere.**
Dovadă: pasul 8 cere «JS inline» în `route.ts`. Clasificarea verde/portocaliu/roșu și coada `pending_urcari` n-ar avea typecheck și nici teste, doar «modul avion» de mână.
Corecție: funcțiile pure (`clasificaScan`, `imbinaCoada`) stau într-un modul testat cu vitest. Modulul se servește static (`public/mini-app/bilete.js?v=<sha>`, cache imutabil) sau e citit la build (`readFileSync` + `outputFileTracingIncludes`). Planul alege una dintre variante.

**ARH-14 · medium (−1.0) · dependențe inverse.**
- 5a «trimite notificările restante», dar notificarea abia se definește în 7d.
- 5b și 6 trimit la `/bilete`, care apare abia în pasul 11.
- Rezultatul pasului 4 cere «`/plati`-like intern», un instrument nedefinit.

Corecție: notificarea se mută în 7d, iar cron-ul se extinde acolo. Până la 11, contorul apare doar în digest. Integrarea pasului 4 se face cu `curl` + `checkoutUrl`.

**ARH-15 · low (−0.5) · «grupul de test» pentru S nu există.**
Nu apare nici în cod, nici în `app_config`. Corecție: pasul 0 îi cere lui Ion grupul, cu botul adăugat. Pagina spike, care ajunge în prod sub `/mini-app/`, afișează doar `initData`-ul celui care o deschide.

**ARH-16 · low (−0.5) · plafonul «120/min pe șofer în bază» n-are tabel în pasul 1.**
Corecție: se renunță la el (HMAC-ul + reîmprospătarea la 60 s ajung) sau tabelul se definește în pasul 1.

Fără deducere:
- Clientul injectat: ambii clienți sunt `SupabaseClient` netipizați. Anon vede aceleași rânduri: `offers active = true` (`015_enable_rls.sql:58`), iar interogarea filtrează explicit (`actions.ts:391-394`).
- CSP-ul permite JS inline și telegram.org (`next.config.js:25`). `frame-ancestors 'none'` blochează doar Telegram Web, nu telefonul.
- `/mini-app/` e deja public (`public-paths.ts:22`). Prefixele noi sunt înguste și au test.

### Deduceri
| Id | Severitate | Greutate |
|---|---|---|
| ARH-11 | high | −2.0 |
| ARH-12 | medium | −1.0 |
| ARH-13 | medium | −1.0 |
| ARH-14 | medium | −1.0 |
| ARH-15 | low | −0.5 |
| ARH-16 | low | −0.5 |
| Total | | −6.0 |

Scor: 4.0 · Blocante (critical/high): 1


## Critic Codex — runda 1 (pe v2), răspunsul brut

```json
{
  "score": 4.0,
  "verdict": "fail",
  "summary": "Planul are o ordine de lansare coerentă, steaguri de activare și verificări explicite pentru fluxurile principale. Rămân trei probleme de integrare cu fundația maib: persistarea checkout-ului, refund-ul din pagina existentă și recuperarea sesiunilor după orderId. Observațiile vizează aceste mecanisme concrete, fără a repuncta problemele generale din revizia anterioară.",
  "deductions": [
    {
      "id": "C1",
      "severity": "high",
      "weight": 2.5,
      "title": "Pasul 4a omite persistarea checkout-ului în maib_checkouts înaintea legării comenzii.",
      "detail": "Planul apelează createCheckout și apoi scrie checkout_id pe comandă, deși coloana propusă are FK către maib_checkouts. Clientul existent face exclusiv apelul HTTP; inserarea în maib_checkouts este implementată separat în acțiunea paginii /plati. Noul API nu poate presupune că reutilizarea clientului produce și acel rând.",
      "evidence": "apps/admin/src/lib/maib/client.ts:217; apps/admin/src/lib/maib/client.ts:233; apps/admin/src/app/(dashboard)/plati/actions.ts:104; packages/db/migrations/482_maib_plati.sql:8",
      "failure_scenario": "La prima comandă creată cu succes la bancă, API-ul încearcă să salveze checkout_id fără rândul părinte în maib_checkouts. FK-ul respinge actualizarea, iar fluxul normal rămâne fără legătura locală necesară callback-ului și emiterii biletelor.",
      "suggested_fix": "Adaugă explicit în pasul 4a persistarea maib_checkouts și legarea comenzii într-o tranzacție locală, înaintea returnării checkoutUrl. Specifică recuperarea după eșecul acestei tranzacții și un test de integrare care pornește din noul API."
    },
    {
      "id": "C2",
      "severity": "high",
      "weight": 2.5,
      "title": "Refund-ul existent din /plati poate ocoli anularea biletelor.",
      "detail": "Pasul 6 face comună revendicarea refund-ului din lib/maib/refund.ts, dar nu precizează că /plati trebuie să treacă prin anuleazaSiReturneaza pentru checkout-urile asociate comenzilor. /plati listează toate checkout-urile și permite refund direct; actualizarea sa privește doar maib_checkouts. Partajarea revendicării împiedică apelurile duplicate, dar nu aplică regulile biletelor.",
      "evidence": "apps/admin/src/app/(dashboard)/plati/actions.ts:58; apps/admin/src/app/(dashboard)/plati/actions.ts:179; apps/admin/src/app/(dashboard)/plati/actions.ts:205; apps/admin/src/app/(dashboard)/plati/PlatiClient.tsx:135",
      "failure_scenario": "Adminul returnează din /plati plata unei comenzi cu bilete valide. Banca acceptă refund-ul, însă comanda rămâne platita și biletele valid. Cron-ul propus caută refund-uri pentru comenzi anulata, deci nu repară această stare; pasagerul poate călători cu plata returnată.",
      "suggested_fix": "Precizează că acțiunile /plati detectează asocierea cu bilete_comenzi și apelează obligatoriu serviciul de anulare a comenzii sau refuză operația și trimit către /bilete. Adaugă test pentru refund inițiat din /plati, inclusiv când există un bilet urcat."
    },
    {
      "id": "C3",
      "severity": "high",
      "weight": 1,
      "title": "Recuperarea prin GET /v2/checkouts?orderId= este o dependență externă neverificată.",
      "detail": "Pasul 5a se bazează pe această căutare pentru comenzile eroare_creare fără checkout_id. Clientul existent oferă doar citirea checkout-ului după ID, iar secțiunea „Verificat pe viu” nu documentează endpointul de căutare, filtrul, forma răspunsului sau disponibilitatea unei sesiuni expirate. Nu rezultă că endpointul este inexistent, ci că mecanismul esențial de recuperare nu este demonstrat.",
      "evidence": "apps/admin/src/lib/maib/client.ts:236; apps/admin/src/lib/maib/client.ts:237; apps/admin/src/lib/maib/client.ts:238",
      "failure_scenario": "Crearea sesiunii reușește la maib, dar răspunsul expiră înaintea salvării checkout_id. Dacă endpointul presupus nu acceptă filtrul orderId, cron-ul nu poate identifica sesiunea și nu poate îndeplini recuperarea promisă; simpla expirare locală după 60 de minute nu stabilește starea bancară.",
      "suggested_fix": "Introdu înaintea implementării recuperării un test sandbox pentru căutarea după orderId, inclusiv rezultate absente și sesiuni expirate, și consemnează contractul verificat. Dacă mecanismul nu este disponibil, definește o alternativă verificată și păstrează cazurile ambigue pentru reconciliere explicită."
    }
  ]
}
```

## Runda 3 (pe v3)

## Review: business-logic-auditor — runda 3

### Runda 2 pe v3

| id | stare | de ce |
|---|---|---|
| BL-11 | închis | decizia 4 + 4b: termenul intră în 060 ȘI în 320 |
| BL-12 | închis | 4b: `bilete_online_sesiune(trip_date, crm_route_id)` pe cheia `counting_sessions (crm_route_id, assignment_date)` (`021:18`), returul override rămâne pe rândul A (`320:277`) |
| BL-13 | închis (termenul) | `valid` + `urcat`, fără condiție de timp, plus «Neprezentați». Partea cu ziua confirmată lipsește → BL-18 |
| BL-14 | închis | pasul 6: `/plati` → `anuleazaSiReturneaza` |
| BL-15 | închis (oferta) | `pret_numarare`. Rata → BL-19 |
| BL-16 | închis | pasul 1: `Europe/Chisinau`, data corectată, test 24–26.10 |

### Noi

- **BL-17 · medium.** Pe lângă `diff`, starea se recalculează separat: `060:103-111` (`no_cashin`, `ok`, `underpaid`) și `320:300-312` (`no_incasare`, `ok`, `underpaid`). Planul spune doar «termenul intră în funcție». **Eșec:** dacă termenul intră numai în `diff`, rândul are `diff ≈ 0` și stare `underpaid`. Dacă pe rută au plătit doar pasagerii online, rândul apare `no_incasare`. **Corecție:** 4b scrie explicit că `suma_numarare` intră în `incasare_lei` și în toate ramurile CASE din ambele funcții. Testul pe zi verifică și starea, nu doar diferența.

- **BL-18 · medium.** Din corecția BL-13, v3 a pierdut partea despre refund după `incasare_day_confirmations` (`051`). Adminul anulează din `/bilete` fără limita de 2 h (pasul 6). **Eșec:** un bilet `valid` nescanat, al unui pasager care a călătorit și a fost numărat de cameră, e returnat a doua zi. Termenul dispare retroactiv, iar ziua deja confirmată arată lipsă la șofer. **Corecție:** după plecare, refund-ul unui bilet `valid` cere confirmare cu textul «camera l-a numărat?». Pe o zi confirmată, refund-ul dă alertă.

- **BL-19 · medium.** `pret_numarare` e înghețat la vânzare, cu rata ultimei perioade ≤ `trip_date` (`apps/web/src/app/(public)/actions.ts:104-122`, fallback `latest`). Ratele se schimbă săptămânal: 1,13 / 1,16 / 1,19 pe 11, 18 și 25.09 (`tariff_periods`, citit 02.10). Camera folosește rata zilei cursei (`numarare/actions.ts:504-520`). **Eșec:** un bilet cumpărat pe 20.09 pentru 26.09 e valorizat la 1,16, iar camera numără la 1,19. Rezultă o lipsă falsă de −2,6 % pe fiecare pasager online. Când `rate_interurban_short ≠ long` (`dual_interurban_tariff=true`, pragul de 65 km), diferența crește. **Corecție:** `suma_numarare` se calculează în SQL la raport: km-ul segmentului × rata `tariff_periods` a `trip_date`, după aceleași reguli lung/scurt/suburban. `pret_numarare` rămâne doar ca istoric.

- **BL-20 · low.** Maparea returului la sesiune există de două ori: TS în 2b (`sesiuneaNumararii`, ca `assignments.ts:93-118`) și SQL în 4b. Planul nu cere ca SQL-ul să repete trecerile 1 și 2 și nici un test de paritate. **Corecție:** test care compară cele două mapări pe o zi cu `retur_route_id`.

### Deduceri
BL-17: −1.0; BL-18: −1.0; BL-19: −1.0; BL-20: −0.5. Total −3.5.

Scor: 6.5 · Blocante (critical/high): 0


## Review: scalability-auditor — runda 3

Verificat pe v3 (rândurile din plan) și în cod.

| Id | Stare | Dovadă |
|---|---|---|
| SC-8 | deschis parțial | Plafon 50 (:187) și închiderea întâi a `noua` fără checkout (:237) există. Dar comenzile unui abuzator trec de `createCheckout` și AU `checkout_id`; «închide întâi fără checkout» nu le eliberează, ele așteaptă expirarea maib. Fără alertă la atingerea plafonului (nu există tip în `bilete_alerte`, :152). Vezi SC-17. |
| SC-9 | închis | `ip_hash` calculat pe web, trimis în corp (:185). |
| SC-10 | închis cu rezervă | `ORDER BY created_at LIMIT 25` și `creare_incercari` ≥ 3 (:237-238). Rezerva: SC-15. |
| SC-11 | închis cu rezervă | Tabela și indexurile există (:142, :148). Rezerva: retenția, SC-14. |
| SC-12 | închis | Antete `s-maxage=300, swr` pe HTML fără date personale (:292); JS cu hash. |
| SC-13 | închis | `valid` + `urcat`, fără condiție de timp (:44, :196). Notă: corecția BL-13 «refund după confirmarea zilei → alertă» nu apare în 4b (în sarcina BL). |

### Observații noi

**SC-14 · high · `bilete_api_apeluri` se păstrează 90 de zile.** Plan :148 «curățată de 5c», iar 5c (:247) o șterge doar la 90 de zile. Plafonul de 120/min are nevoie de ultimul minut. Reîmprospătarea la 60 s (:301) înseamnă ~66 șoferi × ~600 cereri/zi ≈ 40.000 rânduri/zi, deci ~3,5 milioane în 90 de zile, plus index. Baza e pe NANO (0,5 GB), care a căzut deja la 01.10 pe volum de import. Fiecare cerere face și un INSERT, deci și deadtuple-uri. *Corecție:* renunță la plafonul pe șofer (`initData` e semnat; propunerea mea alternativă din SC-11) sau șterge rândurile > 5 min în chiar RPC-ul de numărare; în ambele cazuri scoate tabela din 5c.

**SC-15 · medium · «scoatere din lot» nedefinită.** La `creare_incercari` ≥ 3 (:238) nu se spune în ce stare trece comanda. Dacă rămâne `eroare_creare`, rămâne în indexul parțial (:142) și, cu `ORDER BY created_at`, ocupă capul lotului: exact blocajul din SC-10. *Corecție:* stare terminală (`expirata` + alertă `creare_esuata`) sau filtru `creare_incercari < 3` în interogare.

**SC-16 · low · un singur buget de 20 s / 25 de rânduri pentru patru treburi** (creare, plăți, refund-uri, notificări șofer, :237-244). Fără cotă pe categorie, un lot de `noua` înfometează notificarea șoferului. *Corecție:* cotă pe categorie (ex. 10/10/5) sau notificările primele.

**SC-17 · low · plafonul global nu e atomic.** Verificarea 50 apoi INSERT permite depășirea sub concurență. *Corecție:* RPC cu `pg_advisory_xact_lock` sau toleranță declarată; alertă `plafon_atins`.

### Deduceri
SC-14 −2.0; SC-8 rezidual −1.0; SC-15 −1.0; SC-16 −0.5; SC-17 −0.5.

Scor: 5.0 · Blocante (critical/high): 1


## Review: security-auditor — runda 3

### SEC-12…SEC-18 pe v3

| id | stare | fapt |
|---|---|---|
| SEC-12 | închis | pasul 1: `anulata`/`returnata`/`platita` + Completed → 0; test SQL pe `anulata`. Ieșirea din `platita_fara_bilet` → SEC-20 |
| SEC-13 | închis | 3/4a: `ip_hash` calculat pe web |
| SEC-14 | închis | 8: `/urcat` și `/telefon/<cod_qr>` cer cursa șoferului azi |
| SEC-15 | închis parțial → SEC-19 | 4d inserează din corpul semnat, dar condițiile sunt incomplete |
| SEC-16 | închis | 7b varianta B: `response` semnat, `user_id` egal, `auth_date`, fără `responseUnsafe` |
| SEC-17 | închis parțial → SEC-21 | sare separată, `ip_hash` golit la 90 de zile; corpul păstrat 13 luni conține date personale |
| SEC-18 | închis | 3: risc acceptat explicit |

### Observații noi

**SEC-19 · medium · 4d: condițiile inserării din callback sunt incomplete.** `maib_checkouts.order_id` e `UNIQUE` (`482_maib_plati.sql:10`), iar ruta derivă starea din `paymentStatus` (`route.ts:134,142`). v3 nu cere: (a) `paymentStatus=Executed`, `currency=MDL`; (b) `bilete_comenzi.checkout_id IS NULL` și niciun rând cu același `order_id`; (c) scrierea `checkout_id` pe comandă în aceeași tranzacție. *Scenariu:* reluarea cu același `idempotency_key` după `eroare_creare` cheamă din nou `createCheckout`. Așa apar două sesiuni pentru o singură comandă, iar pasagerul le plătește pe amândouă. A doua sesiune nu are loc în `maib_checkouts` din cauza UNIQUE: INSERT-ul cade, ruta răspunde 500 și maib reîncearcă la nesfârșit. `/plati` nu o poate returna. *Corecție:* condițiile (a)–(c) se trec în 4d. 4a: o sesiune pe comandă (la conflict, `checkoutUrl` salvat). Altfel: alertă și 200.

**SEC-20 · medium · «Emite biletele» și «Returnează» pe `platita_fara_bilet` nu sunt definite atomic.** `anuleazaSiReturneaza` revendică doar `platita → anulata` (pasul 6), deci nu atinge `platita_fara_bilet`. Cele două butoane nu se exclud între ele. *Scenariu:* doi admini (sau un dublu-clic) apasă ambele butoane: rezultă un refund acceptat ȘI bilete `valid`. *Corecție:* ambele acțiuni pornesc dintr-un UPDATE de revendicare `WHERE status='platita_fara_bilet'`. «Emite» verifică din nou Completed, suma, `refund_status IS NULL` și dacă plecarea e încă în viitor.

**SEC-21 · low · dovada păstrată 13 luni conține date personale.** Ruta scrie corpul valid întreg (`route.ts:66`), cu `senderName`, `payerEmail`, `payerPhone`, `payerIp`, `senderIban` (:37), plus `x-forwarded-for` (:49). Așa se ocolește anonimizarea de la 90 de zile. `clientFingerprint` cade pe cheia anon fără sare (`actions.ts:279`). *Corecție:* termenul de 13 luni se declară în politica Legii 195 (întrebarea 7), iar `headers` se golesc la 90 de zile. `BILETE_IP_SALT` lipsă înseamnă comandă refuzată (fail-closed), fără fallback. `ip_hash` null intră într-un plafon comun, nu ocolește plafonul.

### Deduceri
SEC-19 −1.0; SEC-20 −1.0; SEC-21 −0.5. Total −2.5.

Scor: 7.5 · Blocante (critical/high): 0


## Review: senior-backend-engineer — runda 3

Pe v3 și în cod.

| id | stare | dovadă |
|---|---|---|
| ARH-11 | închis | 4c `config` + 3 «lipsă = închis»; 4a re-validează. V5 respinsă acceptabil. |
| ARH-12 | închis | 2a pur/IO; `packages/db` are deja vitest (`packages/db/package.json:11`, `*-calc.test.ts`). |
| ARH-13 | închis în fond; mecanismul lipsește → ARH-17 | |
| ARH-14 | închis pentru 5a↔7, 5b, 6; dependență inversă nouă → ARH-18 | |
| ARH-15 | închis | 0.2 |
| ARH-16 | închis | 1 `bilete_api_apeluri` |

### Observații noi

**ARH-17 · low (−0.5) · «compilat la build» nu spune cum.**
Se poate. esbuild e doar tranzitiv (`node_modules/esbuild` 0.27.7); build-ul e `next build` (`apps/admin/package.json:7`, chemat din `apps/admin/vercel.json:6`).
Corecție: esbuild ca devDependency; `"build": "node scripts/build-mini-app.mjs && next build"` (+ `predev`) → IIFE minificat `public/mini-app/bilete.js?v=${VERCEL_GIT_COMMIT_SHA}` (`<hash>` ar cere manifest); fișierul în `.gitignore`.

**ARH-18 · high (−2.0) · pasul 4 se verifică prin pasul 11a, care vine după el.**
Dovadă: 4 «Rezultat» cere «Comandă de test» din `/bilete (11a)`, dar ordinea e 4→6→11a. 4d schimbă callback-ul tuturor plăților maib (`callback/route.ts:120`, `:147-152`). Central-hub se deployează la fiecare push (`CLAUDE.md:13-16`).
Scenariu: 4d ajunge în prod (500 la eroare RPC, inserare din corp) netestat; un defect lovește și plățile ION-188; 6 schimbă `/plati` la fel.
Corecție: «Comandă de test» se mută în pasul 4, ca script sau acțiune ADMIN care cheamă serviciul `lib/bilete/comenzi.ts`. Integrarea 4+6 devine condiție de push.

**ARH-19 · medium (−1.0) · testul cu steagurile închise contrazice 4a.**
4a validează steagurile, deci, cu `bilete_online_activ=false`, comanda de test e refuzată. Ocolul nu e definit. Un parametru de ocol pe ruta publică ar fi o gaură.
Corecție: serviciul se apelează ca `creeazaComanda(input, { mod: 'public' | 'test_admin' })`. Ruta publică pune mereu `public`. Doar acțiunea cu sesiune ADMIN poate pune `test_admin`.

**ARH-20 · low (−0.5) · `config`: cheie sau public, și cache dublu.**
`s-maxage=60` (4c) pe o rută cu cheie (decizia 1) + 60 s în proces (3); `apps/web/vercel.json` n-are `regions`, admin e `dub1`.
Corecție: public fără cheie sau `no-store` + cache doar în web; regiunea web în «Verificat».

### Deduceri
| Id | Severitate | Greutate |
|---|---|---|
| ARH-17 | low | −0.5 |
| ARH-18 | high | −2.0 |
| ARH-19 | medium | −1.0 |
| ARH-20 | low | −0.5 |
| Total | | −4.0 |

Scor: 6.0 · Blocante (critical/high): 1


## Critic Codex — runda 2 (pe v3), răspunsul brut

```json
{
  "score": 6.0,
  "verdict": "fail",
  "summary": "Corecturile acoperă persistarea checkout-ului și inițierea refund-ului prin funcția comună; verificarea F26 închide presupunerea despre orderId. Rămân două probleme: verificarea refund-ului din /plati poate exclude comanda din reconciliere, iar formula propusă pentru pret_numarare nu reproduce toate regulile numărării existente.",
  "deductions": [
    {
      "id": "C4",
      "severity": "high",
      "weight": 2.5,
      "title": "Acțiunea „Verifică refund-ul” din /plati poate scoate comanda din reconciliere înainte de finalizarea ei.",
      "detail": "Pasul 6 adaptează inițierea refund-ului, dar nu și verificaRefund, care scrie direct refund_status în maib_checkouts. Pasul 5a selectează numai comenzile anulata cu refund_status Pending/Necunoscut/Created/Requested. Dacă acțiunea existentă salvează Accepted, Rejected sau Manual înaintea cron-ului, comanda nu mai intră în lot: nu devine returnata și nici nu primește alerta prevăzută pentru rezultatele nereușite.",
      "evidence": "apps/admin/src/app/(dashboard)/plati/PlatiClient.tsx:130; apps/admin/src/app/(dashboard)/plati/actions.ts:222; apps/admin/src/app/(dashboard)/plati/actions.ts:228; apps/admin/src/app/(dashboard)/plati/actions.ts:236",
      "failure_scenario": "Un refund pornește corect prin anuleazaSiReturneaza și lasă comanda anulata, cu refund_status Created. Înaintea următorului cron, adminul apasă „Verifică refund-ul”, care salvează Accepted. Cron-ul exclude definitiv rândul, deși comanda trebuie trecută în returnata. Dacă rezultatul este Rejected, aceeași excludere împiedică alerta, iar pasagerul rămâne fără bilet valid și fără bani returnați.",
      "suggested_fix": "Extinde pașii 5a și 6 cu finalizarea comună a refund-ului, folosită inclusiv de verificaRefund, sau reconciliază comenzile anulata inclusiv când maib_checkouts are deja o stare terminală. Adaugă teste pentru Accepted și Rejected salvate din /plati înaintea cron-ului."
    },
    {
      "id": "C5",
      "severity": "high",
      "weight": 2.5,
      "title": "Prețul public fără ofertă nu este echivalent cu prețul numărării.",
      "detail": "Pasul 2a propune pret_numarare din funcția comună a prețului public, ca km × rată fără ofertă. Totuși, pickRate alege o singură rată după capetele segmentului, în timp ce calculateDirection aplică pentru pasagerii lungi rata suburbană separat pe fiecare tronson din districtul de start. Există și excepții specifice numărării: migrația 092 separă explicit ruta 58 de calculul prețului public. Eliminarea ofertei rezolvă diferența semnalată anterior, dar nu aceste diferențe demonstrate de cod.",
      "evidence": "apps/web/src/lib/timetable.ts:58; apps/web/src/lib/timetable.ts:99; apps/admin/src/app/(dashboard)/numarare/calculation.ts:123; apps/admin/src/app/(dashboard)/numarare/CountingForm.tsx:355; packages/db/migrations/092_otaci_58_single_tariff_confort2.sql:8",
      "failure_scenario": "Un pasager online parcurge o rută întreagă cu 20 km de tronsoane suburbane și 80 km interurbani. Pentru rate de 1,20 și 0,94, camera calculează 99,20 lei, dar formula publică pentru capete din districte diferite produce 94 lei. Chiar fără ofertă și cu biletul scanat, termenul online lasă o lipsă artificială de 5,20 lei în rapoarte.",
      "suggested_fix": "Definește separat în pasul 2 calculul pret_numarare folosind regulile și datele numărării: tronsoane, districte, clasificarea lung/scurt și excepțiile rutei. Adaugă verificări de echivalență cu calculateDirection pentru un traseu mixt și pentru ruta 58; păstrează caracterizarea prețului public separată."
    }
  ]
}
```

## Critic Codex — runda 3 (pe v4), răspunsul brut

```json
{
  "score": 7.0,
  "verdict": "fail",
  "summary": "Corecția C4 acoperă verificarea refund-ului din /plati și reconcilierea ulterioară. C5 rămâne parțial deschis: noul F32 confundă calculul interurban cu funcția SQL exclusiv suburbană și introduce o rotunjire diferită. Mai există o incompatibilitate între schema stărilor și recuperarea comenzilor platita_fara_bilet.",
  "deductions": [
    {
      "id": "C5",
      "severity": "high",
      "weight": 2.5,
      "title": "Extragerea din migrația 097 nu reproduce calculul interurban și introduce rotunjirea greșită.",
      "detail": "Dovada nouă contrazice F32: recompute_suburban_session_total returnează imediat pentru rutele care nu sunt suburban și citește numai rate_suburban; nu conține regulile interurbane lung/scurt sau districtuale. calculateDirection aplică ratele fără rotunjirea suburbană 0,20 pe fiecare tronson, apoi rotunjește totalul la două zecimale. Pasul 4b cere însă explicit această rotunjire pe tronsoanele districtului de start, deci implementarea prescrisă contrazice testul de echivalență promis.",
      "evidence": "packages/db/migrations/097_suburban_fare_round_rule_020.sql:58; packages/db/migrations/097_suburban_fare_round_rule_020.sql:60; packages/db/migrations/097_suburban_fare_round_rule_020.sql:78; apps/admin/src/app/(dashboard)/numarare/calculation.ts:102; apps/admin/src/app/(dashboard)/numarare/calculation.ts:127; apps/admin/src/app/(dashboard)/numarare/calculation.ts:145",
      "failure_scenario": "Pe o rută interurbană cu un tronson districtual de 20 km la 1,17 lei/km și unul de 80 km la 0,94, calculateDirection valorizează un pasager lung la 98,60 lei. Rotunjirea 0,20 prescrisă în 4b transformă componenta districtuală din 23,40 în 24 lei, rezultând 99,20 lei. Pentru zece pasageri online, raportul creditează 992 lei față de 986 lei calculați la numărare.",
      "suggested_fix": "Corectează F32 și pasul 4b: definește calculul SQL interurban după calculateDirection, inclusiv tratamentul distinct al scurților și excepția rutei 58. Limitează extragerea regulii 0,20 din 097 la calculul rutelor suburbane. Adaugă un caz de echivalență cu rate fracționare, precum 1,17, care detectează diferența de rotunjire."
    },
    {
      "id": "C6",
      "severity": "medium",
      "weight": 0.5,
      "title": "Starea in_lucru din recuperarea comenzilor nu este acceptată de schema propusă.",
      "detail": "Pasul 6 revendică ambele operații pentru platita_fara_bilet prin status='in_lucru', dar CHECK-ul enumerat în pasul 1 nu permite această valoare. În plus, funcția comună de refund este definită numai pentru tranziția platita→anulata, fără tranziție din starea revendicată. Observația este neblocantă deoarece se bazează exclusiv pe plan.",
      "evidence": "doar planul",
      "failure_scenario": "Adminul apasă „Emite biletele” sau „Returnează” pentru o comandă platita_fara_bilet. UPDATE-ul de revendicare este respins de CHECK, astfel încât niciuna dintre căile de recuperare nu poate porni.",
      "suggested_fix": "Aliniază schema și tranzițiile din pasul 6: fie include in_lucru cu finalizare și recuperare după întrerupere, fie folosește blocarea tranzacțională fără stare intermediară persistentă. Precizează cum intră operația revendicată în refund-ul comun și testează ambele căi pornind din platita_fara_bilet."
    }
  ]
}
```
