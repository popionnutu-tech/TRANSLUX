# Bilete aparat: design maximal util + rutele comune cu Numărare (ION-159)

> **Versiunea 7** (01.10, finală după runda 3 Codex; v6 = runda 3 Claude; v4 a introdus sursa Mobilet, v5 runda 2 Codex). Schimbarea de fond: sursa biletelor e acum API-ul Mobilet
> (ION-160, livrat): fiecare bilet are `trip_id`, iar cursa (`tiki_trips`) are **ziua reală**, ora, mașina, șoferul și,
> din 02.2026, starea și locurile. Istoricul: v1 → v2 (runda 1 Claude) → v3 (Codex runda 1 + «strict TIKI + Numărare»)
> → v4. Secțiunile «Review…» de la sfârșit sunt pe versiunile lor; triajul fiecărei runde e în secțiunea ei.

## De ce

Ion, 01.10: «fă Claude + Codex 3 runde de vizualizare și design maximal util la bilete. Adițional, bilete și numărare au
aceleași rute, sincronizează și vezi în Claude + Codex dacă este necesară unirea una cu alta din diferite motive analitice;
motivul analitic «dacă șoferul a furat bani» e închis prin alte instrumente».

Deciziile lui Ion din pagină (AskUserQuestion, 01.10): **orarul** (ce curse tai / adaug / mut) și **tendința** față de
anul trecut. Apoi, cuvânt cu cuvânt:
- «tabela poți s-o faci în bază la tiki, numărare și gps singuri analizând mașinile» → atribuire automată din mașini.
- «numărare mișcăm din 2026 când este» → Numărarea doar din 28.03.2026.
- «după preț poți identifica locațiile» → perechea dedusă din preț e acceptată unde lipsesc stațiile.
- «prin diferența dintre numărare și tiki să înțelegem care sunt ceilalți clienți și de unde până unde pleacă».
- «fix câți oameni și de ce tip am avut zilnic pe fiecare rută și fiecare rută pe ce tip de clienți se ține».
- «gara aici nu este deloc» · «folosim tiki și numărare aici strict» → nicio altă sursă (fără Tomberon, gară, ligotniki),
  nicio schimbare la operatori.
- «fă ca o dată în zi … să colecteze datele de bilete» (cabinetul Mobilet) → ION-160, livrat; sursa planului.

## Ce facem

**Decizia (varianta B, păstrată): două pagini separate, un lanț de atribuire comun.** Unirea ecranelor e respinsă (A):
GO e ecranul OPERATOR_CAMERE (ar vedea bilete și lei), iar Numărarea începe la 28.03.2026, pe când orarul și tendința cer
istoria TIKI din 12.2024. Legătura analitică se face prin lanțul de atribuire și vederea «Clienții rutei».

**Unitatea de bază: plecarea** = zi × mașină × rută × picior, după atribuire. Un `trip_id` Mobilet e o **deschidere de
terminal**, nu o plecare (09.2026: 2.134 de `trip_id` la 1.736 combinații zi × mașină × etichetă; BXI 805 are 6 deschideri
pe «12:35 Otaci» pe 27.09), deci deschiderile se comasează. Ziua = ziua cursei Mobilet (`tiki_trips.trip_date`): blocurile
sincronizate dispar. Cursele datate absurd (474 de bilete 2025–2026 pe curse din 07.2022, BZP 210, Caracusenii Vechi) iau
ziua vânzării, marcat. Ultimele 14 zile: «încă se sincronizează» (12.2025: 23.145 din 24.196 de bilete au venit la > 7 zile
după cursă), scoase din semnale. **Starea Mobilet nu se folosește** (stările 4 și 6 în masă, `withdraw_reason` gol peste
tot, sens neverificat); nici locurile Mobilet (18–19 pe toate cursele, 22 % din curse au mai multe bilete decât locuri).

**Atribuirea cursă → rută din nomenclator** (`crm_route_id` + picior `nord_chisinau` / `chisinau_nord`), în ordine, scrisă
în tabela îngustă `tiki_trip_attr(trip_id, sens_bilet, crm_route_id, leg, sursa, regula_luna, PK (trip_id, sens_bilet))` —
**pe deschidere și sensul biletului**, pentru că aceeași deschidere poate avea bilete pe ambele sensuri (Codex r3 · C1); nu pe `tiki_tickets`:
1. **mașina cursei** în ziua cursei → ruta + piciorul din grafic: `daily_assignments` (din 04.04.2026, cu
   `vehicle_id_retur` / `retur_route_id`), mașina sesiunii Numărării dacă a fost corectată. Sensul **biletului**: din
   stații (de la → până la față de Chișinău) unde există (din 02.2026), altfel din etichetă (3,3 % din bilete sunt pe
   deschideri la > 2 h după ora etichetei — vândute pe întoarcere). Dacă mașina are două rute în zi, decide ora din
   **eticheta** cursei (ora din grafic, în `route_name`), nu `dep_time` (ora deschiderii: în medie 32 de valori pe lună pe
   aceeași etichetă);
2. **eticheta cursei** (`route_name`, care conține ora din grafic, + sens; nu `dep_time`) → ruta, prin **regula lunii**: majoritatea curselor legate la pasul 1 în
   aceeași lună; pentru lunile fără grafic utilizabil (înainte de 04.2026: `crm_vehicles` nu are o parte din flota
   interurbană, 🔬) regula se ia din prima lună cu grafic (04.2026), marcată `sursa = eticheta_2026`;
3. corectura ADMIN pe (etichetă, lună) — tabelă separată `tiki_label_override`, prioritară; regulile deduse se refac pe
   lună, deci nu se ciocnesc;
4. altfel **nelegat** — pe ecran, cu bilete și lei.
5. **biletele fără cursă** (`trip_id` NULL sau cursă lipsă — ex. import CSV de rezervă cât Mobilet e căzut): traseu
   separat, ziua vânzării ca zi provizorie marcată, sursa `fara_cursa` în agregat, în reconciliere și în linia de calitate;
   când importul Mobilet le leagă ulterior, lunile lor intră în coada de refacere (Codex r3 · C2).

Pagina răspunde la trei întrebări:

1. **Orar** (implicit; numele pe ecran: «Orar»). Un rând = o rută din nomenclator cu ambele picioare, grupate pe coridor (din capătul rutei).
   - **Comparația cu anul trecut = totalul biletelor pe rută în aceeași fereastră de 364 de zile**, fără numitor (aceeași
     măsură în ambii ani; înainte de 2026 nu se știu zilele cu 0 bilete). Pe rută, anul trecut se ia pe **aceeași etichetă
     TIKI** (nume + oră + sens), fără atribuire; unde eticheta s-a schimbat — «n/a», trimis la coridor. **Etichetele comune**
     (vândute de mașinile a două rute, ex. «Ocnita 08:00») sunt marcate și nu dau semnal de tăiere/mutare pe o singură rută;
     comparația lor stă la nivelul grupului de rute / coridorului (Codex r3 · C6).
   - Din 04.2026: **bilete pe plecare** (plecări = grafic, deschiderile comasate) și **«Cât de plin (doar TIKI)»** =
     om × km TIKI / (locuri × km ai piciorului), locurile din `vehicles.passenger_seats` — gol azi pe toate cele 34 de mașini care vând; Ion (01.10): «toate sunt de 20
     de locuri, doar auto lui Boaghe 23–27, și Fordurile 17 locuri» → 20 implicit, mașina lui Boaghe (WJQ 827 până la
     09.09, AKD 686 din 12.09 — de confirmat care și câte locuri), Fordurile 17 (plăcuțele de primit de la Ion: în bază
     modelul e doar «Autobuz/microbuz»). Fără comparație cu anul trecut pe aceste
     două măsuri până în 04.2027. Lângă orice semnal de tăiere/mutare: ponderea celorlalți (din «Cine merge pe rută») și
     legătura spre ea — TIKI singur e un minim al plinului.
   - Hartă L–D (mediana, aceeași scară, cifra în celulă, «—» gri unde nu circulă), sparkline 52 săpt. cu anul trecut gri,
     profilul zilei pe coridor (tije oglindite, grosime = bilete/plecare), semnale «De decis» (max. 5) comparate cu anul
     trecut și cu ponderea în coridor, motivul în cuvinte.
2. **Față de anul trecut** (fosta «Tendință»): pe **coridoare** (din eticheta TIKI, fără atribuire — comparația nu depinde de cum s-a legat istoria),
   în **bilete**; lei separat; tabel Δ% bilete · Δ% lei/bilet · Δ% lei; treptele de tarif marcate; «Anulare» (bilete fără cursă reală; atribuite pe mașină + oră, nu numărate ca plecări — 638 de «curse» Anulare în 09.2026) rând separat, lunile 12.2024–03.2025 marcate (~7 % din bilete);
   luna curentă pe aceleași zile; suma mobilă pe 12 luni în bilete.
3. **Cine merge pe rută** (fosta «Clienții rutei»; doar interurban, din 28.03.2026, strict TIKI + Numărare). Pe rută × picior × zi:

   | mărime | sursă | exactitate |
   |---|---|---|
   | oameni cu bilet TIKI | biletele curselor atribuite | exact |
   | lei, perechi TIKI | `tiki_tickets` | exact (perechi reale din 02.2026) |
   | oameni numărați | Σ creșterilor încărcării între opriri (`total_passengers` îi include deja pe scurți — nu se adună a doua oară) | **minim** |
   | drum făcut (om × km) numărat | încărcare × km tronson (aceeași bază ca leii Numărării) | exact |
   | drum făcut (om × km) TIKI | capetele biletului puse pe opririle piciorului (`interurban_v2_stops`, numele normalizate; pereche reală sau dedusă) | exact doar dacă **toate** biletele piciorului au ambele capete pe opriri; altfel interval (min = fără biletele nemapate, max = ele pe tot piciorul) |
   | ceilalți | numărați − TIKI, pe picior; ≤ 0 → «0, neconcordanță» | minim (oameni); exact în om × km doar cu acoperire integrală, altfel interval |
   | necunoscut | picioare neeligibile | separat |

   **Pe ce se ține ruta** = ponderea TIKI vs ceilalți **doar în drum făcut (om × km)**; oamenii apar ca cifre alături
   («TIKI 30 · ceilalți cel puțin 6»). Unde urcă / coboară ceilalți: creșterile / scăderile nete ale diferenței pe
   tronsoane; **perechile celorlalți nu se afișează** (nedeterminate). Eligibilitate pe zi × picior: piciorul are intrări salvate și statutul sesiunii îl acoperă (picior Nord→Chișinău: `tur_done`
   sau `completed`; Chișinău→Nord: `retur_done` sau `completed` — Codex r3 · C4), cu **aceeași mașină** ca biletele lui; biletele cu capete nemapabile pe opririle piciorului fac piciorul «interval», nu «exact», și îl scot din semnale; în «pe ce se ține» piciorul intră cu ponderea ca interval, nu e scos (C2-2, dataviz r3 · 6); restul «necunoscut».
   «Numărată N din M plecări», sub 8 picioare eligibile în perioadă: «puține date», fără bară.

**Siguranța cifrei** (o legendă de un rând sub titlul fiecărei vederi; culoarea = tipul de client, TIKI `#2a78d6`,
ceilalți `#eb6834`; siguranța = forma): exact — cifră simplă, segment plin; «cel puțin» — cuvântul în capul coloanei,
segment plin cu liniuță la capăt; interval — «30–38 %», plin până la minim, pal până la maxim; necunoscut — ciot gri hașurat
cu «?» («!» = neconcordanță). Fără simbolurile ≥ ~ ±. Sub «Cine merge pe rută», o propoziție: «drum făcut = oameni × km
parcurși; un om dus 100 km cântărește cât 10 oameni duși 10 km».

Se păstrează Șoferi, Tipuri bilet & direcții, Import. «Prezentare» dispare.

## 🔬 Verificat pe viu

| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| API-ul Mobilet = exportul CSV | ION-160: handler pe 30.09.2026 și reimport 12.2024–09.2026 | aceeași `ticket_key`: 0 bilete noi în fiecare lună; 30.09: 833 bilete, 134.877,02 lei = cabinetul | sursa unică; CSV rămâne doar ca rezervă |
| Vânzarea poartă ziua sincronizării, cursa ziua reală | probe pe API, 01.10 | `date` = `soldAt` = ziua sincronizării (16.01.2026: 17.924 vânzări); raportul pe curse: 600–1.060 bilete în fiecare zi din 12.2025 și 01–24.04.2026 | analizele pe `tiki_trips.trip_date` |
| Blocul 15–17.01.2026 pe ziua cursei | `tiki_tickets ⋈ tiki_trips` după reimport (01.10) | din 31.435 de bilete vândute (sincronizate) pe 15–17.01: 20.190 sunt din curse pe 02–31.12.2025 (30 de zile), 11.245 pe 01–17.01.2026 | decembrie 2025 își recapătă biletele; ziua cursei e corectă |
| Lista curselor cu stare și locuri | `/reports/carrier/trips` la reimport | 0 curse pe 12.2024–10.2025, 48 în 11.2025, 12 în 12.2025, 46 în 01.2026, 1.299 în 02.2026, ~2.000–2.350/lună după | starea și ocuparea doar din 02.2026; înainte cursele vin din raportul pe curse (doar cele cu bilete) |
| `trip_id` = plecare? | business-logic r3, SQL 01–28.09.2026 | 2.134 `trip_id` la 1.736 zi × mașină × etichetă; 662 repetă mașina+eticheta, 254 cu 0 bilete; BXI 805 / 27.09: 6 deschideri pe «12:35 Otaci» | plecarea = zi × mașină × rută × picior, comasat |
| Locurile Mobilet | business-logic r3 | 18–19 locuri pe toate cursele; 22 % din curse cu mai multe bilete decât locuri (max 46) | locurile din `vehicles` |
| Locurile noastre | SQL: mașinile cursei 09.2026 ⋈ `vehicles` (plăcuța normalizată) | 34 de mașini, 2.294 de curse; `passenger_seats` gol pe toate 34 | «Cât de plin» = «—» până la completare (întrebare pentru Ion) |
| Starea Mobilet | business-logic r3, senior-backend r3 | stările 4 și 6 în masă; `withdraw_reason` gol pe toate | nu se folosește |
| `dep_time` | senior-backend r3 | în medie 32 de valori / lună pe aceeași etichetă (max 70) | cheia = `route_name` + sens |
| Întârzierea sincronizării | business-logic r3 / senior-backend r3 | 12.2025: 23.145 din 24.196 bilete importate la > 7 zile după cursă; 23.360 de bilete au cursa în altă lună decât vânzarea | refacerea pe luna cursei, coadă persistentă; ultimele 14 zile «încă se sincronizează» |
| Curse absurde | business-logic r3 | 474 de bilete pe curse datate 07.2022 (BZP 210, Caracusenii Vechi) | ziua vânzării, marcat |
| Curse din raportul pe curse | reimport, `curse_din_vanzari` | ~1.460–1.600 de curse/lună în 2025 (ex. 06.2025: 1.461) | istoria are cursă pe fiecare bilet |
| Grafic istoric pe mașină | `crm_daily_log` ⋈ `crm_vehicles` (plăcuța), 06.2025 | 545 din 1.453 curse (10.811 din 28.663 bilete, 38 %) se leagă; `crm_vehicles` nu are MJW 784, MLN 828, AKD 688 etc. | înainte de 04.2026 atribuirea pe etichetă (regula din 2026), marcată; Tendința pe coridor nu depinde de ea |
| Etichetă ≠ autobuz | business-logic r1 | 4 etichete vândute zilnic de 2 autobuze din rute diferite; ex. 15.09: RQR 330 (ruta 31) pe «Ocnita 08:00» | atribuirea pe cursă (trip_id are o singură mașină), nu pe etichetă |
| Mașina pe cursă (din 04.2026) | SQL 09.2026, bilete cu mașina în `daily_assignments` ∪ GPS | 73,5 % mașina în grafic; 14,7 % mașină cunoscută dar nu în grafic; 6,2 % «REZERVA»; 5,6 % necunoscute | pasul 2 (regula lunii) acoperă restul; ținta nelegat < 5 % pe 09.2026 |
| Plăcuțele | `vehicles` vs TIKI | «805BXI» vs «BXI 805» | cheia litere ‖ cifre |
| «Tur» | `ticketParse.ts:111` vs `numarare/actions.ts:455-457` | opus | picior `nord_chisinau` / `chisinau_nord` |
| Ce măsoară Numărarea | `calculation.ts:123,131-137`; ruta 23, 15.09 | `total_passengers` = încărcarea pe tronson și îi include pe scurți; `alighted` 2,5 % | oameni = Σ creșteri (minim), fără + scurți |
| Mărimea diferenței (interurban) | business-logic r2 | pe interurban ceilalți ≈ 24 % (≈ 38 % cu cele 14 rute suburbane Briceni, unde TIKI nu vinde); 183 din 1.091 picioare cu TIKI > numărați | doar interurban; max(0) + «neconcordanță» |
| Anulări de curse | `route_cancellations` | ruta + zi, fără picior; date din 01.05.2026 | starea Mobilet (din 02.2026) e sursa principală; anulările doar pentru zilele fără stare |
| GPS | `route_stop_passes` | din 09.09.2026, scris pentru mașina din grafic (nu independent) | nu e sursă de atribuire |
| Anulare | business-logic r1, senior-backend r3 | 6–7,5 % din bilete 12.2024–03.2025, < 0,6 % din 05.2025; toate au `trip_id` și mașină (638 «curse» Anulare în 09.2026) | rând separat; nu sunt plecări |
| Tariful | `tiki_day_index` | Chișinău–Bălți: 99,8 → 102,3 (03.2026) → 121,7 → 133,4 → 147,8 → 152,4 (09) | trepte marcate; Tendința în bilete |
| Viteza | senior-backend r1/r2 | agregate < 2 s; funcția cu `statement_timeout` 120 s trece prin API (27,7 s probă) | agregatele pe lună în jobul de după import |

## Pași

1. **Migr. 452 — atribuirea.** `tiki_plate_key(text)`; `tiki_trip_attr(trip_id PK → tiki_trips, crm_route_id FK, leg
   CHECK, sursa CHECK ∈ {masina, eticheta_luna, eticheta_2026, override, nelegat}, regula_luna date)`;
   `tiki_label_override(route_label, direction_tiki, luna, crm_route_id, leg, corectat_de, corectat_la,
   PK (route_label, direction_tiki, luna))` (fără `dep_time`, Codex r3 · C5); funcția `tiki_attr_month(p_month)` (SQL = sursa de adevăr): pas 1
   pe mașină, regula lunii, override, nelegat — rescrie doar rândurile lunii (`IS DISTINCT FROM`). Test SQL după migrație
   (fișier de cazuri): RQR 330 / 15.09 → 31; MLN 828 și MJW 784 / «Chisinau - Lipcani 10:40» → 2 / 16; nelegat 09.2026 < 5 %.
2. **Migr. 453 — agregatele pe cursă și picior.** `tiki_leg_daily(zi, crm_route_id (0 = nelegat), leg, sursa, plecari, bilete, lei,
   om_km_tiki_min, om_km_tiki_max, PK (zi, crm_route_id, leg, sursa))` (nelegatele și sursa au loc în cheie, ca Σ pe surse să
   se verifice); `tiki_stop_map(statie_tiki, stop_name_ro)` pentru capetele biletelor; PK pe `leg_segment_load (zi,
   crm_route_id, leg, stop_order)`; RLS + REVOKE pe toate tabelele și cozile noi: **un singur flux** (Codex r3 · C3): plecările = chei distincte (zi, crm_route_id, leg, mașină) din **grafic** (din
   04.2026; înainte: din biletele atribuite); biletele se agregă pe (trip_id, sens_bilet), se atribuie, apoi se atașează
   plecării — deschiderile comasate, proveniența biletelor separată de numărarea plecărilor; plecări din grafic fără nicio
   deschidere rămân cu 0 bilete (test SQL: 6 deschideri → 1 plecare cu 33 de bilete; plecare din grafic fără deschideri;
   aceeași deschidere cu bilete pe ambele sensuri);
   `count_leg_daily(date, crm_route_id, leg, oameni_min, om_km, eligibil, PK (date, crm_route_id, leg))` din
   `counting_entries` (operator, interurban); `leg_segment_load(date, crm_route_id, leg, stop_order, km, incarcare_numarata,
   incarcare_tiki)` din 28.03.2026.
3. **Refacerea**, pas separat după import (`/api/cron/tiki-refacere`, chemat de același workflow după import, propria
   limită de 300 s): coada persistentă `tiki_refresh_queue(luna PK, motiv, pus_la)` primește **lunile curselor** biletelor
   importate (nu ale vânzării: 23.360 de bilete au cursa în altă lună), lunile corecturilor ADMIN și zilele din
   `count_refresh_queue`; golire atomică (`DELETE … RETURNING`, apoi refacere; la eșec luna se pune înapoi), câte o lună per
   apel de funcție cu `pg_try_advisory_xact_lock` (lacăt pe tranzacție — cel de sesiune rămâne agățat în pool-ul PostgREST).
   Triggerele pe `counting_sessions` / `counting_entries`: `SECURITY DEFINER`, cheia **OLD și NEW** (mutare pe altă rută/zi,
   ștergere), filtru pe coloanele care schimbă încărcarea / mașina / ruta / ziua (nu pe lacătele de editare), corpul în
   `EXCEPTION WHEN OTHERS` — **nu blochează niciodată salvarea din GO**. Test: corectură pe o zi de acum 30 de zile →
   agregatul converge după următoarea rulare; o rulare picată lasă luna în coadă.
4. **RPC-uri** pe agregate (< 3 s prin API; REVOKE de la PUBLIC/anon/authenticated + GRANT service_role pe fiecare funcție
   și tabelă): `get_tiki_orar`, `get_tiki_tendinta` (coridor din etichetă), `get_tiki_clienti`; fiecare întoarce totalurile
   pe surse (mașină / regula lunii / regula 2026 / override / nelegat / Anulare) pentru egalitatea cu `tiki_tickets`.
5. **Vederi**: `OrarView`, `TendintaView`, `ClientiView`; `charts.tsx`: `Heatmap`, `StemProfile`, `Sparkline` cu a doua
   serie și goluri, `SegmentStep` (încărcarea numărată și TIKI ca trepte pe km, aria = ceilalți, gri hașurat unde TIKI >
   numărat; nordul la stânga în ambele picioare). Culori: TIKI `#2a78d6`, ceilalți `#eb6834`. Linia de calitate sus.
6. **Numărare GO**: nicio schimbare; nimic din bilete în `numarare/actions.ts`.

## Fișiere

- `packages/db/migrations/452_tiki_atribuire.sql`, `453_tiki_agregate_picior.sql`, `tests/sql/tiki_attr_cases.sql`.
- `apps/admin/src/app/api/cron/tiki-refacere/route.ts` (nou: golește `tiki_refresh_queue`, după import) + pasul nou în `.github/workflows/tiki-mobilet.yml`.
- `apps/admin/src/app/(dashboard)/numarare/tabs/biletAparatActions.ts`, `routeAttrActions.ts`.
- `.../bilete/OrarView.tsx`, `TendintaView.tsx`, `ClientiView.tsx`, `charts.tsx`, `types.ts`; `BileteAparatTab.tsx`.

## Riscuri

- **Regula din 2026 pe 2025**: o etichetă care a schimbat ruta între timp ar fi atribuită greșit. Rezervă: Tendința pe
  coridor nu o folosește; Orarul arată sursa pe rând și compară cu anul trecut doar la nivel de coridor când sursa e
  `eticheta_2026` pe > 30 % din biletele anului trecut.
- **Fără curse cu 0 bilete înainte de 02.2026**: măsura istorică e pe zi de circulație, nu pe plecare (spus pe ecran).
- **Numărare incompletă**: picior neeligibil → «necunoscut», nu «ceilalți».
- **Refaceri concurente**: advisory lock; a doua rulare iese «ocupat» și o face retry-ul de la 08:00.

## Verificare

- Test SQL al atribuirii (cazurile din pasul 1) + nelegat < 5 % pe 09.2026.
- Σ bilete pe surse (inclusiv `fara_cursa` și nelegat) = Σ `tiki_tickets` pe aceeași perioadă; plecări = chei distincte din grafic, nu Σ deschideri.
- Însămânțarea: după migrații, toate lunile 12.2024 → azi intră în `tiki_refresh_queue` (idempotent, întâi 04.2026 → azi pentru regulile lunii, apoi istoria); vederea anuală arată «se pregătește istoria» până când coada e goală (Codex r3 · C7).
- Ocuparea: cazul «20 de locuri, 20 TIKI pe prima jumătate + 20 pe a doua» dă bilete pe loc 2,0 și ocupare TIKI ≤ 100 %.
- Om × km TIKI: un bilet lung nemapat sub 5 % → piciorul «interval», nu «exact».
- Blocurile sincronizate: pe `trip_date`, 12.2025 și 04.2026 au bilete în fiecare zi (fără vârfuri pe 15–16.01 / 23–24.04).
- 3 sesiuni: `oameni_min` și `om_km` = recalculul de mână din `counting_entries`.
- RPC-uri < 3 s prin API pe 2025-01-01 – azi; `anon` nu execută nimic nou.
- typecheck + vitest + gate-urile git-guards.

## Critic extern - runda 3

**Scor 1.0 (JSON 1.5, inconsistent: Σ greutăți 9.0) · fail · critical/high: 2.**

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | un picior pe deschidere, deși biletele au sens propriu | acceptat | `tiki_trip_attr` pe (trip_id, sens_bilet); test cu ambele sensuri |
| C2 | high | biletele fără cursă dispar | acceptat | traseu `fara_cursa`, zi provizorie marcată, în reconciliere; refacere la legare |
| C3 | medium | pașii numără încă deschideri | acceptat | un singur flux: plecări din grafic, bilete atașate; invariantul schimbat |
| C4 | medium | `completed` exclude picioarele salvate singure | acceptat | eligibilitate pe statut `tur_done` / `retur_done` / `completed` + intrări |
| C5 | low | `dep_time` în cheia corecturii | acceptat | PK fără `dep_time` |
| C6 | medium | eticheta comună pe rândul unei rute | acceptat | marcată, fără semnal individual, comparată pe grup/coridor |
| C7 | medium | istoria nu e însămânțată | acceptat | toate lunile în coadă la instalare, «se pregătește istoria» |

După corecturi: **0 critical/high deschise** la Codex; la Claude, toate blocantele rundei 3 acceptate și corectate în v6.
Limita de trei runde atinsă — nu se face o a patra.

## Triaj runda 3 (Claude)

| revizor · nr | sev. | esență | decizie | unde |
|---|---|---|---|---|
| business-logic r3 · 1 | high | `trip_id` = deschidere de terminal, nu plecare | acceptat | unitatea = zi × mașină × rută × picior; plecări din grafic |
| business-logic r3 · 2 | high | locurile Mobilet ≠ capacitatea | acceptat | locuri din `vehicles` (goale azi → «—»); întrebare pentru Ion |
| business-logic r3 · medii | medium | sens/oră; refacere pe luna cursei; coada pierde cheia veche; trigger care blochează GO; 2022; TEST | acceptate | sensul din stații; coadă pe luna cursei; OLD+NEW; EXCEPTION; ziua vânzării pentru curse absurde; eticheta TEST exclusă de parser (deja `parseRoute`) |
| senior-backend r3 · 1 | high | lunile din `sale_date` | acceptat | coadă persistentă pe luna cursei |
| senior-backend r3 · 2 | high | lacăt de sesiune prin PostgREST | acceptat | `pg_try_advisory_xact_lock`, o lună per apel |
| senior-backend r3 · 3 | high | golirea cozii pierde corecturi | acceptat | `DELETE … RETURNING`, reintroducere la eșec |
| senior-backend r3 · 4 | high | `dep_time` fărâmițează cheia | acceptat | cheia = `route_name` + sens |
| senior-backend r3 · 5 | high | stările Mobilet nemapate | acceptat | starea nu se folosește |
| senior-backend r3 · 6–7 | medium/low | Anulare ≠ plecări; PK fără nelegate/sursă; refacerea sub 300 s; triggere incomplete; `tiki_stop_map`, PK, RLS | acceptate | 🔬 Anulare corectat; PK cu sursa și 0 = nelegat; pas separat `/api/cron/tiki-refacere`; triggere OLD/NEW + filtru; tabelele numite |
| dataviz-ux r3 · 1 | high | numitori diferiți între ani | acceptat | anul trecut = total bilete în 364 de zile, fără numitor; măsurile pe plecare fără YoY până în 04.2027 |
| dataviz-ux r3 · 2–6 | medium/low | cinci măsuri pe rând; plin doar TIKI la tăiere; ruta YoY pe aceeași etichetă; Anulare marcat; partea «exact» nemăsurată | acceptate | o singură măsură de plin; ponderea celorlalți lângă semnale; YoY pe etichetă; lunile marcate; ponderea pe interval unde nu e exact (nu se scoate piciorul) |
| dataviz-ux r3 · nume, legendă | — | «Față de anul trecut», «Cine merge pe rută», siguranța prin formă | acceptat | «Ce facem» |

## Critic extern - runda 2

**Scor 4.0 · fail · critical/high: 2** (consistent: Σ greutăți 6.0).

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | bilete/locuri prezentat drept ocupare | acceptat | «bilete pe loc» + ocupare TIKI pe om × km (definiția din 039:81-88); ocupare totală doar cu Numărare |
| C2 | high | om × km «exact» deși se admit bilete fără pereche | acceptat | capetele puse pe opririle piciorului; nemapat → interval, scos din semnale |
| C3 | medium | cursele fără bilete / multiplicarea la join | acceptat | agregare întâi pe trip_id, LEFT JOIN din curse; test SQL |
| C4 | medium | corecturile vechi ale Numărării | acceptat | trigger → `count_refresh_queue`, golită la refacere; GO neschimbat |

## Triaj runda 2 (Claude)

| revizor · nr | sev. | esență | decizie | unde |
|---|---|---|---|---|
| business-logic r2 · 1 | high | istoria nu se leagă pe mașină (`crm_daily_log` cu id-uri vechi) | acceptat | 🔬 (38 % pe 06.2025); istoria pe regula etichetei din 2026, marcată; Tendința pe coridor |
| business-logic r2 · 2 | high | GPS din 09.09.2026, nu independent; plecare efectivă fără sursă înainte | acceptat | starea Mobilet din 02.2026; măsura istorică pe zi de circulație; GPS scos ca sursă |
| business-logic r2 · 3 | high | scurții numărați de două ori | acceptat | oameni = Σ creșteri, fără + scurți |
| business-logic r2 · medii | medium | suburban în diferență; TIKI > numărați; mașina sesiunii; Anulare atribuibile | acceptate | doar interurban; max(0) + neconcordanță; mașina sesiunii în pasul 1; Anulare pe mașină + oră |
| senior-backend r2 · 1 | high | perioadele sincronizate în jobul de noapte | acceptat, rezolvat altfel | analizele pe ziua cursei Mobilet: blocurile dispar |
| senior-backend r2 · 2 | high | plecare efectivă fără sursă istorică | acceptat | ca business-logic r2 · 2 |
| senior-backend r2 · 3 | high | regulile deduse vs corectate sub EXCLUDE; istoria cu regulile de azi | acceptat | reguli pe lună + override separat prioritar; fără EXCLUDE pe intervale |
| senior-backend r2 · 4–9 | medium/low | scriere pe `tiki_tickets`; concurență; șofer după nume; logică dublă SQL/TS; chei; 364 zile | acceptate | tabelă îngustă `tiki_trip_attr`; advisory lock; pasul «șofer» scos (mașina + regula lunii); SQL sursa + test SQL; PK-uri scrise; 364 zile |
| dataviz-ux r2 · high | high | ponderea în oameni e părtinitoare | acceptat | ponderea doar în om × km; oamenii ca cifre |
| dataviz-ux r2 · medii | medium | «pasageri-km» neclar; zile fără numărare ≠ 0; acoperire pe rând | acceptate | «drum făcut (om × km)»; «necunoscut» separat; «numărată N din M» |

## Triaj runda 1 (Claude)

| revizor · nr | sev. | esență | decizie | unde |
|---|---|---|---|---|
| business-logic · 1 | high | etichetă TIKI ≠ autobuz | acceptat | «Ce facem» lanțul; 🔬; pas 1 |
| business-logic · 2 | high | «pasageri pe cursă» nedefinit | acceptat | încărcare maximă + pasageri-km pe picior; pas 2 |
| business-logic · 3 | high | Anulare umflă YoY | acceptat | Tendință rând separat |
| business-logic · 4 | medium | tarif în trepte | acceptat | 🔬 + Tendință |
| business-logic · 5 | medium | perioade nesigure doar parțial | acceptat | Riscuri; pas 4 `p_excl_ranges` |
| business-logic · 6 | medium | poarta de 90 de zile, suprapuneri | acceptat | toate etichetele din 12.2024; EXCLUDE gist |
| business-logic · 7 | low | capcane sens/nume | acceptat | Verificare vitest |
| senior-backend · 1 | high | intervale suprapuse = dublare | acceptat | `tiki_label_rule` EXCLUDE + funcție de corectură |
| senior-backend · 2 | medium | încărcări lente | acceptat | `route_leg_daily` nocturn |
| senior-backend · 3 | medium | SQL netestabil cu vitest | acceptat | `attr.ts` pur + test SQL |
| senior-backend · 4 | medium | perioade nesigure în 2 locuri | acceptat | parametru din `UNRELIABLE_RANGES` |
| senior-backend · 5 | medium | `retur_uses_route_id` | acceptat | lanțul folosește `retur_route_id` / `vehicle_id_retur` pe zi |
| senior-backend · 6 | low | Tendința fără corespondență | acceptat parțial | coridorul din lanț, nelegatele din eticheta TIKI |
| senior-backend · 7 | low | acțiuni separate | acceptat | `routeAttrActions.ts` |
| security · 1 | medium | urmă pe corecturi | acceptat | `corectat_de/la`, CHECK, FK |
| security · 2 | low | suprapuneri | acceptat | EXCLUDE |
| security · 3 | low | REVOKE pe fiecare obiect | acceptat | pas 4 |
| dataviz-ux · blocanta | high | bilete/zi nu deosebește «gol» de «n-a circulat» | acceptat | bilete pe plecare efectivă + «zile fără bilet» |
| dataviz-ux · rest | medium/low | semnale sezoniere, un rând = rută cu 2 picioare, Tendința în bilete, luna parțială, suma mobilă în bilete, linia de calitate, heatmap/stems/sparkline | acceptate | «Ce facem» 1–2, pas 5–6 |

Toate observațiile sunt acceptate; niciuna respinsă. Revizorii a căror zonă s-a schimbat (business-logic, senior-backend,
dataviz-ux) se relansează în runda 2 doar dacă Codex atinge zona lor.

## Critic extern - runda 1

Prima încercare (rc 0) a întors o deducere «placeholder» cu câmpuri goale — tratată ca critic indisponibil, nu mulțumit;
reluată. Reluarea: **Scor 1.0 (Σ greutăți 10.0 → 0.0 după rubrică) · fail · critical/high: 2**.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | atribuirea din `tiki_daily_trip` pierde ora vânzării | acceptat | pas 1: atribuire bilet cu bilet din `tiki_tickets` cu `sale_ts`, lună cu lună |
| C2 | high | graficul ≠ circulație; anulările lipsesc | acceptat | pas 2: stări efectuată / anulată / necunoscută, `route_cancellations` (ruta+zi, 116 rânduri din 28.03.2026) |
| C3 | medium | lipsurile de date devin «ceilalți» | acceptat | eligibilitate pe zi × picior; «necunoscut» separat |
| C4 | medium | perechile probabile fără metodă | acceptat | perechile celorlalți nu se afișează; doar zone nete urcare/coborâre + scurții înregistrați |
| C5 | medium | numărul pe tip nu are livrabil | acceptat (redefinit de Ion) | Ion: «folosim tiki și numărare aici strict» → tabelul livrabilului: TIKI exact, numărați minim, pasageri-km exact, necunoscut |
| C6 | low | refacerea agregatelor nedescrisă | acceptat | pas 7: ordinea refacerii + test înainte/după |

Partea Claude: runda 1 a revizorilor pe v1 (min 0.5, 5 blocante) — toate acceptate în v2/v3; revizorii se relansează
pe v3 în runda 2.

## Review: security-auditor

Zona (drepturi + expunere) e atinsă puțin: o tabelă nouă, 2–3 RPC-uri de citire și o acțiune de scriere, toate în fila
care e deja doar a lui ADMIN. Ce e bine azi: `biletAparatActions.ts:17-22` (`adminOnly` pe `verifySession`, rol `ADMIN`);
fila `bilete` e în `visibleTabs` doar pentru ADMIN (`NumararePageClient.tsx:36-42`); 446/449 urmează tiparul RLS +
`REVOKE ALL … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role` pe tabele și funcții
(`446_tiki_bilete_aparat.sql:98-104,441-442`, `449_tiki_totaluri_directii.sql:19-21,80-83`).

1. **medium — acțiunea de confirmare a corespondenței fără urmă și fără validare server-side descrisă.** Pasul 2 scrie în
   `tiki_route_map`, dar tabela din pasul 1 nu are `confirmat_de` / `confirmat_la`, iar planul nu spune ce validează
   acțiunea. O corespondență greșită mută biletele altei curse în Orar fără să se vadă cine și când a schimbat-o. Sugestie:
   coloanele `confirmat_de text` (emailul din `adminOnly`) și `confirmat_la timestamptz`; în DB `CHECK` pe `leg` și
   `sursa`, FK pe `crm_route_id → crm_routes(id)`; acțiunea nouă începe cu `adminOnly()`, validează `valid_from` /
   `valid_to` cu `DATE_RE` și `valid_to >= valid_from`, iar corectura închide rândul vechi (`valid_to`) în loc să-l
   suprascrie — istoria rămâne.
2. **low — suprapunerea perioadelor nu e împiedicată.** PK-ul `(route_name, route_time, direction_tiki, valid_from)` permite
   două rânduri valabile în aceeași zi pentru aceeași cursă TIKI → `get_tiki_orar` numără biletele de două ori (sau la două
   curse). Integritate, nu drept de acces. Sugestie: `EXCLUDE USING gist (route_name WITH =, route_time WITH =,
   direction_tiki WITH =, daterange(valid_from, valid_to, '[]') WITH &&)` (cere `btree_gist`) sau verificarea în acțiune +
   testul SQL din «Verificare».
3. **low — REVOKE/GRANT enumerat incomplet.** «Fișiere» spune doar «REVOKE/GRANT»; regula proiectului (memoria
   «drepturi implicite anon», 446/449) cere tiparul pe FIECARE obiect: `tiki_route_map` (RLS ON + `REVOKE ALL` + `GRANT ALL
   TO service_role`), `get_tiki_orar`, `get_tiki_tendinta`, dar și `tiki_coridor` (imutabilă, nepericuloasă, însă altfel e
   executabilă de `anon` prin PUBLIC) și orice funcție de propunere automată, dacă umplerea se face prin funcție. Toate cu
   `SECURITY DEFINER SET search_path = public` ca în 446, parametrii folosiți ca valori (fără `format`/`EXECUTE` pe
   `p_coridor`). Verificare după aplicare: `select has_function_privilege('anon', '<fn>', 'execute')` = false pe fiecare.
4. **informativ — pasagerii numărați în Bilete aparat nu expun nimic nou.** Fila e doar ADMIN, iar ADMIN vede deja toată
   Numărarea; RPC-ul SECURITY DEFINER ocolește RLS pe `counting_entries`, dar e executabil doar de `service_role`, chemat
   numai după `adminOnly`. Condiția rămâne: coloana se pune doar în acțiuni cu `adminOnly`, nu în `numarare/actions.ts`
   (unde intră ADMIN_CAMERE / OPERATOR_CAMERE) — altfel OPERATOR_CAMERE ar primi bilete/lei, pe care azi nu-i vede.
   Planul respectă asta (fișierul e `biletAparatActions.ts`); de păstrat la implementare.

Deduceri: #1 −1.0 (gol de acoperire pe scriere), #2 −0.5, #3 −0.5.

Scor: 8.0 · Blocante (critical/high): 0

## Review: dataviz-ux

Metoda: skill-ul `dataviz` (forma după decizie → culoare după rol → marcaje → hover/tabel → anti-modele). Am citit
`charts.tsx`, `ui.tsx`, `OverviewView.tsx`, `RoutesView.tsx`, `MonthlyView.tsx`, `periods.ts` și `446_tiki_bilete_aparat.sql`.
Pe scurt: direcția e bună (două vederi pe cele două decizii, nomenclator comun, tabel + mini-grafice în loc de grafice
mari), dar **metrica de bază a Orarului e definită greșit**, iar semnalele și Tendința au două capcane care l-ar
duce pe Ion la o decizie greșită.

1. **HIGH (blocant) — numitorul «bilete/zi» nu știe dacă cursa a circulat.** `tiki_daily_trip` se construiește doar din
   bilete (`446_tiki_bilete_aparat.sql:226-236`: `count(*) … FROM tiki_tickets GROUP BY …`): o zi în care cursa a mers
   goală și o zi în care nu a mers deloc arată la fel, adică lipsă de rând. Scenariu de eșec: «Chișinău–Briceni 17:50»
   circulă doar L–V. Dacă media se ia pe zile calendaristice, sâmbăta/duminica ies 0 → celula din harta de căldură
   e albă → semnalul «zi a săptămânii aproape goală» → Ion «taie» o zi în care oricum nu circulă și, mai rău, cursa
   devine «cea mai slabă din coridor» din cauza zerourilor, nu a cererii. Invers, dacă media se ia doar pe zilele cu
   rânduri, cursa care a mers de 3 ori goală dintr-o săptămână arată sănătoasă și nu e tăiată. Corecție: metrica
   principală = **bilete/plecare efectuată**; numitorul = zilele în care cursa a circulat (sesiunea de numărare, graficul
   sau GPS-ul; dacă nu există sursă, atunci zilele cu ≥ 1 bilet, spus explicit), iar pe fiecare rând apare și
   «zile fără niciun bilet: N din M». În tooltip-ul fiecărei celule: «medie din n zile». Testul din «Verificare» se
   completează cu o cursă care nu circulă în weekend.

2. **HIGH → retrogradat la medium (doar din textul planului) — «scade 3 luni la rând» e sezonalitate, nu semnal.**
   După vârful din august, aproape fiecare cursă scade în septembrie–noiembrie; în decembrie, jumătate din tabel ar fi
   roșu. A doua capcană e canibalizarea: Otaci 11:00 (din 19.11.2025) ia pasageri de la vecinele din coridor, iar
   vecinele apar «−20 % față de anul trecut» deși coridorul crește. Scenariu: Ion taie o cursă vecină care doar și-a
   împărțit cererea. Corecție: semnalele se calculează **față de anul trecut** (sub AT în 3 luni consecutive) și **pe
   cota din coridor** (cursa scade, coridorul nu); semnalul afișează motivul în clar, ex. «−18 % față de AT; coridorul
   +4 %; a apărut Otaci 11:00 pe 19.11.2025». Maxim 5 semnale, sortate după lei pierduți, nu o listă lungă.

3. **Medium — unitatea rândului: rotația (`crm_routes.id`), nu piciorul izolat.** `crm_routes` are `time_nord` și
   `time_chisinau` pe aceeași rută; autobuzul care pleacă din nord dimineața se întoarce după-amiază. Dacă tai
   piciorul slab, celălalt fie dispare, fie autobuzul se întoarce gol. Un tabel cu 55 de rânduri independente ascunde
   asta. Propunere: un rând = o rută din nomenclator, cu două sub-coloane «N→C hh:mm» și «C→N hh:mm», fiecare cu
   bilete/plecare și harta L–D, plus «lei/rotație» ca total. Sortarea implicită în coridor = după ora din nord.

4. **Medium — Tendință: titlul nu poate fi în lei.** Tariful a crescut în martie 2026 de la ~90 la ~140–160 lei/bilet
   (🔬); orice linie sau KPI în lei arată +50 % peste tot până în martie 2027 și ascunde un coridor care pierde
   pasageri. Propunere: (a) cifra principală și graficul principal = **bilete** față de AT; (b) leii pe un grafic separat,
   aceeași axă temporală, **niciodată două axe Y**; (c) descompunerea ca tabel pe coridor cu trei coloane: Δ % bilete,
   Δ % preț mediu, Δ % lei, iar Δ lei împărțit în «din bilete» și «din preț» prin cote logaritmice (însumează exact,
   fără termen rezidual), afișat ca bară divergentă cu două segmente; (d) prețul mediu conține și mixul de tronsoane:
   din 03.2026 (stații complete) se spune în nota de subsol că «preț mediu» = tarif + mix.

5. **Medium — luna curentă parțială.** Azi e 01.10: octombrie are o zi. `MonthlyView.tsx:55` (`partial(m)`) tratează deja
   cazul (trece pe medie/zi). Planul nu spune că Tendința îl moștenește. Scenariu: «Octombrie −97 % față de AT» în
   primele zile din fiecare lună. Corecție: luna curentă exclusă implicit sau comparată cu aceleași zile de anul trecut
   (aceeași zi a săptămânii), marcată «în curs». Testul vitest pentru `partial` rămâne în Verificare.

6. **Medium — suma mobilă pe 12 luni: ce se poate arăta de fapt.** Datele încep în 12.2024, deci primul punct complet e
   11.2025, iar comparația ei cu anul trecut abia din 11.2026. În lei, suma mobilă urcă artificial 12 luni după martie
   2026 (tariful). Corecție: suma mobilă se calculează pe **bilete**, începe vizibil în 11.2025, iar în lei apare doar ca
   informație secundară, cu linie verticală «tarif nou 03.2026».

7. **Medium — calitatea datelor trebuie să fie vizibilă, nu în note.** Propunere concretă: (a) o singură linie sus,
   deasupra tabelului: «Legate 53/55 curse · 2 nelegate = X bilete (Y %) · Confirmă →»; (b) pe rând: insignă «nouă
   din 19.11.2025» și «n/a» în loc de Δ față de AT (componenta `Delta` din `ui.tsx` are deja `na` cu motiv),
   niciodată «+∞» sau «+100 %»; (c) legătura `auto` neconfirmată = un punct gol lângă oră, cu tooltip «propunere
   automată»; (d) zilele excluse din `UNRELIABLE_RANGES` = o notă sub hartă «excluse: 15–17.01, 23.04» doar când
   fereastra le atinge.

8. **Low — harta de căldură L–D: specificație.** O singură nuanță secvențială (deschis → închis), **aceleași praguri
   fixe pentru toate rândurile** (ex. < 5, 5–10, 10–20, 20–35, > 35 bilete/plecare), ca un pătrat închis să însemne
   același lucru la Criva și la Otaci; cifra scrisă în celulă (7 cifre mici pe rând se citesc, culoarea singură nu);
   celula fără circulație = gri neutru cu «—», nu alb (alb = 0 bilete). **Mediana** pe zi a săptămânii, nu media: în 8
   săptămâni o sărbătoare (Paște, 1 Mai, Crăciun) mută media cu 1/8. Nu colorați harta după Δ față de AT, aceea e o
   coloană separată cu săgeată (`Delta`). Celule ~28 px, rând 28 px: 7 zile ≈ 200 px, încap pe laptop.

9. **Low — profilul zilei: renunțați la bule.** Mărimea prin arie e citită prost (o bulă de 2× pare de 4×), iar plecările
   din coridor la aceeași oră se suprapun. Propunere: o bandă pe coridor, axa X 04:00–22:00, **tije în oglindă**:
   N→C în sus, C→N în jos, înălțimea = bilete/plecare (aceeași scară pe toate coridoarele), eticheta orei sub tijă.
   Două plecări din același sens la < 45 min se subliniază cu o paranteză «Δ 35 min», iar golurile > 3 h se marchează
   discret. Banda stă în capul fiecărui grup de coridor din tabel (înălțime ~90 px), nu într-o secțiune separată:
   Ion vede golul și rândul în același loc.

10. **Low — sparkline-ul pe 52 de săptămâni.** `Sparkline` din `charts.tsx` primește `number[]` și scalează fiecare rând
    singur (min/max proprii): o cursă cu 4 bilete și zgomot pare la fel de dramatică ca una cu 40. Propunere: linia
    anului trecut gri, în spate, pe aceeași scară a rândului (emfază: anul acesta în culoarea brandului); săptămânile
    din sincronizarea în bloc = **gol în linie** (`null`), nu hașură (la 22 px hașura nu se vede); cifra
    ultimei săptămâni direct la capătul liniei. Componenta trebuie extinsă pentru `null` și o a doua serie.

11. **Low — pasagerii numărați.** Pusă lângă bilete, coloana invită la raport, adică exact la analiza închisă. Propunere:
    gri, după coloanele de decizie, cu antetul «pasageri numărați (din 28.03.2026, informativ)», și doar pentru rândurile
    cu ≥ 8 sesiuni în fereastră; altfel «—».

12. **Low — hașura are culoarea portocalie `#d97706` (`charts.tsx`, `tiki-hatch`)**, apropiată de seria a doua
    `#eb6834`; în Tendință, cu două linii și hașură, «date nesigure» se confundă cu «seria 2». Hașura pentru «date
    nesigure» = gri neutru (nu e o stare, e o calitate a datelor), plus etichetă text.

13. **Low — ce e deasupra pliului (laptop 1440×900, ~650 px utili).** Propunere pentru **Orar** (devine fila implicită;
    «Prezentare» cu 3 KPI nu mai e necesară, cele 3 cifre intră în antetul Tendinței):
    - rândul de filtre: perioada (implicit 8 săpt. complete) · coridorul (Toate) · metrica (bilete/plecare | lei/plecare);
    - linia de calitate a datelor (pct. 7);
    - «De decis» — maxim 5 semnale ca rânduri-text cu legătură spre rândul din tabel (pct. 2);
    - primul coridor deschis: banda profilului zilei (pct. 9) + rândurile lui; celelalte coridoare restrânse pe un
      rând-rezumat (bilete/plecare, Δ AT, număr de semnale), se deschid la clic.
    Coloanele unui rând: ora N→C | ora C→N | bilete/plecare | L–D (7 celule) | Δ AT | 52 săpt. | lei/plecare |
    numărați (gri). Pentru **Tendință**: sus 3 cifre (bilete AT %, preț mediu AT %, lei AT %), apoi 7 grafice mici
    (un coridor fiecare, anul acesta vs anul trecut, bilete/lună, axe Y proprii, dar marcat), apoi tabelul de
    descompunere (pct. 4). Fiecare grafic are tabelul lui sub el, ca acum în `MonthlyView`.

Deduceri: pct. 1 −2,0 (defect de logică, `446:226-236`); pct. 2 −1,0 (medium); pct. 3 −1,0 (medium); pct. 5 −1,0
(gol de acoperire, `MonthlyView.tsx:55`); pct. 4 −0,5; pct. 6 −0,5; pct. 7 −0,5. Pct. 8–13 sunt propuneri, fără deducere.

Scor: 3.5 · Blocante (critical/high): 1

## Review: senior-backend-engineer

Zona: abordarea implementării, performanță/scalare. Fapte măsurate pe viu (Supabase MCP, read-only, 01.10):
`tiki_daily_trip` = 29.920 rânduri, 59 de curse (rută+oră+sens), singurele rânduri fără oră sunt «Anulare» (500 rânduri,
direcția `necunoscut`); agregarea completă pe 2 ani (rută × oră × sens × săptămână × zi) = **0,44 s** (seq scan, 711 pagini).
`counting_entries` = 426.892 rânduri, `counting_sessions` = 6.431; TIKI are doar rute interurbane (toate 28 de nume),
iar la interurban `cycle_number` = 1 întotdeauna (la suburban 1–15). `btree_gist` și `pg_cron` sunt instalate.

1. **high (−2.0) — `tiki_route_map`: PK-ul nu împiedică intervalele suprapuse, biletele se numără de două ori.**
   PK `(route_name, route_time, direction_tiki, valid_from)` permite două rânduri pentru aceeași cursă cu `valid_from`
   diferit și intervale care se suprapun. Scenariu: ADMIN corectează în ecranul de confirmare «Chisinau - Lipcani 14:50»
   de la 01.06.2026 → se inserează un rând nou `valid_from=2026-06-01, valid_to=NULL`, iar rândul `auto` vechi
   (`valid_from=2024-12-01, valid_to=NULL`) rămâne deschis. Joinul `tiki_daily_trip ⋈ map ON sale_date între valid_from și
   valid_to` dă fiecare bilet din iunie–septembrie de două ori, pe două curse diferite (24 și 19); orarul și tendința
   arată cereri umflate exact pe cursa corectată. Verificarea «Σ orar + nelegate = Σ tiki_daily_trip» o prinde doar dacă
   e rulată după fiecare corectare, nu o previne.
   **Corecție:** coloană `valid daterange NOT NULL` (convenție `[)`, capăt deschis = `infinity`) +
   `EXCLUDE USING gist (route_name WITH =, route_time WITH =, valid WITH &&)` (btree_gist e instalat); `direction_tiki`
   iese din cheie (fiecare `route_name` are un singur sens, verificat). Confirmarea/corectarea = o funcție SQL
   `tiki_route_map_set(...)` care închide intervalul vechi și deschide cel nou în aceeași tranzacție (nu două apeluri din
   acțiune). Plus `confirmed_by`, `confirmed_at` pentru urma deciziei, și starea «fără corespondent» explicită
   (`sursa ∈ {'auto','confirmat','fara_corespondent'}` cu CHECK: `crm_route_id IS NULL ⇔ sursa='fara_corespondent'`),
   altfel criteriul «zero curse fără decizie» nu se poate număra (NULL = «neatins» sau «decis fără pereche»?).

2. **medium (−1.5) — pasagerii numărați în `get_tiki_orar` calculați live nu încap în 3 s și cresc lunar.**
   Măsurat pe 01.04–30.09.2026: varianta per sesiune (LATERAL / subinterogare pe `counting_entries` cu indexul
   `session_id, direction, cycle, stop_order`) = **16,8 s** (6.328 sesiuni × 2,6 ms) — trece de limita de 8 s a API-ului,
   aceeași eroare ca în 0538ea89; varianta hash join + group by `(crm_route_id, direction, assignment_date)` = **3,5 s** cu
   toate paginile în cache, din care 1,9 s doar seq scan-ul pe 427k rânduri, care cresc cu ~70k/lună. Partea TIKI
   (0,44 s) nu are nevoie de nimic precalculat; partea Numărării are.
   **Corecție:** tabelă precalculată mică `counting_leg_daily(crm_route_id, assignment_date, direction, passengers)`
   (≈14k rânduri / 6 luni, PK pe primele trei), umplută dintr-o funcție `counting_refresh_leg_daily(p_from, p_to)` pe
   modelul `tiki_refresh_agg` (DELETE + INSERT pe interval) rulată de `pg_cron` noaptea pe ultimele 14 zile + o dată pe
   toată istoria la migrație; doar `route_type='interurban'` (filtrul scoate ciclurile suburbane). `get_tiki_orar` citește
   doar `tiki_daily_trip`, `tiki_route_map`, `counting_leg_daily`. Nu vă bazați pe `SET statement_timeout='120s'` la
   nivel de funcție pentru RPC-urile de citire: timerul instrucțiunii PostgREST pornește înaintea funcției, iar ținta e 3 s
   oricum. Fereastra «anul trecut» = aceeași fereastră deplasată cu **364 de zile** (aliniere pe zi a săptămânii), nu
   `interval '1 year'` — altfel harta L–D compară luni cu marți. De scris explicit în pasul 4.

3. **medium (−1.0) — propunerea automată e scrisă în SQL (pasul 1), dar testată «în vitest» (Verificare).**
   vitest nu atinge funcția SQL din migrația 451; cazurile greșite din 🔬 (Larga/Lipcani 14:15↔14:50, Ocnița 08:00 → 3 și
   26, Otaci 11:00 → 31 și 30) rămân netestate exact acolo unde contează. **Corecție:** propunerea = funcție pură TS
   `proposeRouteMap(tikiTrips, crmRoutes)` în `bilete/routeMap.ts` (normalizare capăt, oră de început din `time_nord`/
   `time_chisinau`, «unic + capăt egal ⇒ auto») cu `routeMap.test.ts` pe cele 6+2 cazuri din 🔬; migrația creează doar
   tabela, iar umplerea inițială o face o acțiune ADMIN «Propune» (sau un script `node --env-file` o singură dată) care
   scrie rezultatul funcției testate. `tiki_coridor` rămâne în SQL (îl folosesc RPC-urile), dar cu oglindă TS testată
   din aceeași listă de capete, sau o tabelă `tiki_coridor_map(capat, coridor)` — o singură sursă, nu două liste.

4. **medium (−1.0) — `UNRELIABLE_RANGES` trăiește în TS (`bilete/periods.ts:8`), dar planul cere excluderea în RPC.**
   Riscurile spun «zilele din `UNRELIABLE_RANGES` se exclud din mediile pe zi a săptămânii», iar mediile se calculează în
   `get_tiki_orar`. Copierea listei în SQL = shotgun surgery: următoarea sincronizare în bloc se adaugă în TS și harta L–D
   arată din nou vârfuri false. **Corecție:** acțiunea trimite intervalele ca parametru
   (`p_exclude daterange[]` construit din `UNRELIABLE_RANGES`) sau lista se mută într-o tabelă `tiki_unreliable_ranges`
   citită și de TS; de ales una în plan.

5. **medium (−1.0) — piciorul `chisinau_nord` nu stă mereu în sesiunea aceleiași rute.**
   `crm_routes.retur_uses_route_id` (azi: ruta 2 Briceni folosește returul rutei 16; ruta 16 are `retur_disabled`) și
   schimbările de retur aprobate în `verificare-aprobari/actions.ts:99-141` mută returul pe altă rută, deci
   `counting_sessions.crm_route_id = map.crm_route_id AND direction='retur'` dă 0 sau pasagerii altei curse. Riscul din
   plan acoperă doar inversarea sensului. **Corecție:** în `counting_leg_daily` (finding 2) rezolvați ruta proprietară a
   returului la data sesiunii și adăugați ruta 2/16 în testul manual «3 curse × 3 zile».

6. **low (−0.5) — tendința nu trebuie să depindă de corespondență.** Dacă `get_tiki_tendinta` ia coridorul prin
   `tiki_route_map → crm_routes`, biletele curselor nelegate (noi, încetate) dispar din tendința pe 2 ani. Coridorul se
   poate deriva direct din `route_name` TIKI (capătul e în nume, toate 28 de nume sunt cunoscute) → tendința e completă
   din ziua 1, iar corespondența contează doar pentru Orar. De precizat în pasul 5.

7. **low (−0.5) — structura acțiunilor.** `biletAparatActions.ts` (207 linii) e deja import + rapoarte; scrierile pe
   corespondență (confirmare/corectare/«fără corespondent») sunt alt motiv de schimbare → fișier separat
   `bilete/routeMapActions.ts` cu `adminOnly()` reutilizat, validarea intrării (id rută întreg existent, `leg` din union,
   dată `DATE_RE`) înainte de RPC și `revalidatePath`. Tipurile noi (`TikiOrarRow`, `TikiTendintaRow`, `TikiRouteMapRow`)
   în `bilete/types.ts`; leg ca union `'nord_chisinau' | 'chisinau_nord'`, nu `string`. Plafon pe `p_from..p_to` în
   `validRange` (ex. ≤ 400 de zile pentru Orar) ca intervalul să nu devină neașteptat de scump.

Indexuri: pe partea TIKI nu trebuie niciunul nou (tabela de 30k se citește integral în 0,44 s; `tiki_route_map` are
~60 de rânduri). Strategia de test propusă: vitest pe `routeMap.ts` + coridor + seria săptămânală (pur); un script SQL
de invariante rulat după migrație și după fiecare confirmare (Σ orar + nelegate = Σ trip fără Anulare; zero suprapuneri
— garantat de EXCLUDE); `explain analyze` pe ambele RPC-uri pe 2025-01-01 – azi înainte de handoff, cu timpul în raport.

Scor: 2.5 · Blocante (critical/high): 1

## Review: business-logic-auditor

Zona: corectitudinea datelor (corespondența TIKI→`crm_routes`, sensurile, pasagerii numărați, perioadele sincronizate, tariful, reconcilierea). Toate cifrele de mai jos sunt din SQL read-only pe `zqkzqpfdymddsywxjxow`, 01.10.2026.

Confirmat (fără deducere): `sale_date` ≈ ziua cursei (01–14.10.2025: 10.616 din 10.839 bilete vândute între −1 h și +9 h față de `route_time`); în Numărare `tur` = Nord→Chișinău pe toate rutele, inclusiv 3/21/30 unde `dest_from_ro = 'Chișinău'` (prima oprire `tur` = Ocnița/Otaci, `retur` = Chișinău).

1. **[high] Cursa TIKI nu e autobuzul: 4 curse TIKI sunt vândute zilnic de două autobuze din rute `crm_routes` diferite, deci cheia `(route_name, route_time, direction_tiki)` → un singur `crm_route_id` e greșită ca unitate.** Fapt: din 06.2026, «Criva - Chisinau/Larga 06:00» 114/122 zile cu 2 mașini (fiecare ≥ 5 bilete), «Ocnita - Chisinau 08:00» 114/122, «Chisinau - Ocnita 15:55» 111/122, «Chisinau - Lipcani 10:40» 75/115; în total 534 din 6.414 cursă-zile. Pe 15.09.2026: RQR 330 (sesiunea Numărării pe ruta **31**, Ocnița 05:30/11:00) vinde pe cursele TIKI «Ocnita 08:00» și «Chisinau - Ocnita 15:55», care sunt orele rutei **3** (MLD 069); TWK 683 vinde «Criva/Larga 06:00» + «Chisinau - Criva/Larga 14:15»; MLN 828 (ruta 2) și MJW 784 (ruta 16) vând amândouă «Chisinau - Lipcani 10:40» (`retur_uses_route_id` 2→16). Deci «inversările» din 🔬 (Ocnița 08:00 → 3 și 26, Larga/Lipcani 14:15↔14:50) nu sunt erori de nume, ci șoferi care aleg în terminal altă cursă decât cea pe care o fac. **Scenariu de eșec:** după pasul 2 ADMIN confirmă «Ocnita - Chisinau 08:00» → ruta 3; Orarul arată ruta 3 cu ~25 bilete/zi și ruta 31 cu biletele ei lipsă (tur 05:30 aproape gol) → semnalul «cea mai slabă cursă din coridor» cade pe 31 și Ion taie o cursă care de fapt duce ~9–17 oameni/picior; profilul zilei pune biletele ei la 08:00 în loc de 05:30. **Corecție:** atribuirea se face pe `(sale_date, mașină, picior)` → `crm_route_id` din `crm_daily_log` (2018-07-16 … 2026-03-31, `vehicle_id` pe toate 83.297 rânduri) și `daily_assignments` (2026-04-04 →, cu `vehicle_id_retur` / `retur_route_id` pe picior), cu eticheta TIKI doar ca rezervă; numerele TIKI «RQR 330» ↔ `vehicles.plate_number` «330RQR» trebuie normalizate. Probă rapidă pe 09.2026: 16.839 din 26.746 bilete se leagă unic pe mașină-zi, 1.051 ambiguu, 8.856 fără potrivire — de măsurat în 🔬 de ce (alt format de număr, mașini lipsă din grafic) înainte de a alege cheia. Tabela de corespondență pe nume+oră rămâne doar pentru zilele fără grafic (gaura 01–03.04.2026) și pentru verificare.

2. **[high] «Pasageri numărați/cursă» nu are definiție executabilă, iar verificarea «egal cu ecranul GO» nu se poate face.** Dovadă: `numarare/calculation.ts:123` — `total_passengers` e încărcarea autobuzului pe tronson (include scurții în tranzit), nu urcările; `alighted` e completat în 10.259 din 408.714 rânduri (2,5 %); există și `counting_audit_entries` (532 sesiuni auditate, `auditActions.ts:404-418`) cu alte valori; niciun ecran din Numărare nu afișează un total «pasageri pe cursă» (grep fără rezultat), deci «egale cu ecranul GO» nu are cu ce compara. Pe 01–28.09.2026 (1.486 picioare): `max(total_passengers)` = 17,2 în medie, Σ creșterilor între opriri = 22,1 (+28 %), și ambele subestimează urcările când la aceeași oprire coboară și urcă oameni. **Scenariu de eșec:** coloana arată 17 «pasageri numărați/zi» lângă 25 bilete/zi; cititorul trage concluzia «8 bilete fără pasager» sau invers — exact comparația închisă de Ion, dar cu o cifră greșită metodologic. **Corecție:** în plan, definiția fixă: «încărcarea maximă pe picior» (`max(total_passengers)` pe `session_id, direction`, sursa `counting_entries` operator, nu audit), denumită pe ecran «încărcare maximă», nu «pasageri»; picior `nord_chisinau` ↔ `direction='tur'`; verificarea = 3 sesiuni recalculate de mână din `counting_entries`, nu «ecranul GO».

3. **[high] «Anulare» (vânzări fără cursă) e 6–7,5 % din bilete în 12.2024–03.2025 și ~0 după — comparația pe coridor față de anul trecut iese umflată.** Fapt (`tiki_daily_trip`, `is_anulare`): 12.2024 7,2 %, 01.2025 7,5 %, 02.2025 7,5 %, 03.2025 6,0 %, 04.2025 2,1 %, din 05.2025 sub 0,6 %. `ticketParse.ts:5` le definește ca «vânzări reale fără cursă», deci nu intră în niciun coridor. **Scenariu de eșec:** Tendința arată «Criva +8 % în martie 2026 față de martie 2025», din care ~6 puncte sunt doar biletele din 03.2025 care stăteau pe «Anulare»; suma mobilă pe 12 luni crește artificial până în 04.2026. **Corecție:** rândul «fără cursă (Anulare)» apare în Tendință lângă coridoare, iar pentru lunile cu Anulare > 1 % comparația pe coridor primește aceeași hașură ca perioadele sincronizate (sau se compară doar totalul).

4. **[medium] Tariful nu s-a schimbat o dată «în martie 2026», ci în trepte, iar lei/bilet amestecă tariful cu structura biletelor.** Fapt: prețul modal Chișinău–Bălți (`tiki_day_index.modal_price`, medie lunară) 99,8 (01–02.2026) → 102,3 (03) → 121,7 (04) → 133,4 (06) → 147,8 (08) → 152,4 (09); lei/bilet în 2025 a urcat și el de la 82,8 (02) la 104,6 (11) fără index de tarif (stațiile există doar din 02.2026). Rândul 🔬 «Tariful din martie 2026» e deci inexact. **Corecție:** descompunerea se numește «bilete × lei/bilet» (nu «preț»), cu indicele de tarif din `tiki_day_index.factor` arătat separat de la 01.2026; marcajele pe grafic pe fiecare treaptă, nu un singur martie.

5. **[medium] Perioadele sincronizate sunt tratate doar în mediile pe zi a săptămânii și în Tendință; mini-graficul de 52 de săptămâni, semnalele și numitorul mediilor nu.** Fapt: 12.2025 are 1.034 bilete în 7 zile, 01.2026 are 44.587; aprilie 2026 are date doar în 16 zile (`UNRELIABLE_RANGES`, `bilete/periods.ts:8-24`). **Scenariu:** «scade 3 luni la rând» se aprinde pe 10–11–12.2025 din cauza sincronizării; sparkline-ul arată săptămâni zero în 02–22.04.2026 și un vârf pe 23–24.04. **Corecție:** în pasul 4 seria săptămânală și semnalele omit săptămânile/lunile care ating `UNRELIABLE_RANGES` (sau blocul dec.+ian. comasat); numitorul «bilete/zi» = zile calendaristice ale acelei zile a săptămânii, minus cele nesigure (nu numărul de rânduri din `tiki_daily_trip`, care lipsesc când cursa n-a vândut nimic); YoY pentru 12.2026/01.2027 se face tot pe bloc.

6. **[medium] Poarta de confirmare de 90 de zile lasă nelegate cursele care contează pentru «anul trecut», iar reconcilierea nu prinde dublarea.** Fapt: «Chisinau - Lipcani/Riscani 08:00» + «Lipcani - Chisinau/Riscani 15:00» (8.326 bilete, ultimele vânzări 10–15.03.2026) au exact orele rutei 13 (`time_chisinau 08:00`, `time_nord 15:00`), iar «Chisinau - Briceni 17:50» (295) se oprește la 26.04.2026 — toate în afara celor 90 de zile, iar capătul «Lipcani/Riscani» ≠ «Lipcani (Rîșcani)» după normalizare, deci nici `auto` nu le prinde. Fereastra implicită a Orarului (8 săptămâni) compară cu 08–09.2025, când ele circulau. PK-ul `(route_name, route_time, direction_tiki, valid_from)` permite intervale suprapuse → același bilet numărat de două ori, iar controlul «Σ orar + nelegate = Σ» e pe medii, nu pe totaluri. **Corecție:** poarta = toate cele 58 de curse TIKI cu bilete din 12.2024 (nu 90 de zile); `EXCLUDE USING gist (route_name WITH =, route_time WITH =, direction_tiki WITH =, daterange(valid_from, valid_to, '[]') WITH &&)`; RPC-ul întoarce și totalurile pe găleți (legate / «fără corespondent» / nelegate / Anulare) pe care se face egalitatea; Tendința pe coridor ia coridorul din același lanț (sau din numele TIKI) și arată explicit restul.

7. **[low] Propunerea automată are capcane de sens și de nume care trebuie scrise ca teste.** `tur` TIKI (din Chișinău, `ticketParse.ts:111`) ↔ `time_chisinau`, `retur` ↔ `time_nord` (inversare explicită); capătul nu se ia din `dest_from_ro` (la rutele 3, 21, 30 e «Chișinău»), ci din capătul ≠ Chișinău al oricărui câmp; ruta 16 are `retur_disabled` și ruta 2 `retur_uses_route_id = 16`, deci piciorul `chisinau_nord` al lui 16 nu e candidat. Corecție: cazurile intră în vitest-ul din «Verificare».

Deduceri: 1 (−2,0) · 2 (−2,0) · 3 (−2,0) · 4 (−1,0) · 5 (−1,0) · 6 (−1,0) · 7 (−0,5) = −9,5.

Scor: 0.5 · Blocante (critical/high): 3

## Review runda 2: dataviz-ux

Metoda: skill-ul `dataviz` (forma după întrebare → culoarea după rol → marcaje → hover/tabel → anti-modele). Citite: v3,
triajul rundei 1, rubrica, `bilete/charts.tsx`, `bilete/ui.tsx`, `numarare/calculation.ts:106-128`, `numarare/actions.ts:441-466`.
Paleta existentă `SERIES[0..1]` (`charts.tsx:9`, `#2a78d6` / `#eb6834`) trecută prin `validate_palette.js --mode light`: toate
verificările PASS (CVD ΔE 24,7, normal 33,6) — bună pentru perechea TIKI / ceilalți.

### Runda 1 — ce s-a închis

| nr. r1 | stare în v3 |
|---|---|
| 1 (high) bilete pe plecare efectivă | **închis** — «Ce facem» 1 + pas 2 (`efectuata/anulata/necunoscuta`, numitorul doar `efectuata`, «zile fără bilet N din M») |
| 2 semnale sezoniere / canibalizare | închis — față de AT + ponderea în coridor + motivul în cuvinte, max. 5 |
| 3 rând = rută cu ambele picioare | închis |
| 4 Tendința în bilete, lei separat, fără a doua axă | închis (descompunerea pe log-cote nu e cerută — rămâne tabelul Δ %, suficient) |
| 5 luna parțială | închis (logica din `MonthlyView.tsx`) |
| 6 suma mobilă în bilete | închis; de scris că primul punct complet e 11.2025 (fără deducere) |
| 7 linia de calitate, «nouă», «n/a» | închis (pas 6) |
| 8 harta L–D | închis (mediana, aceeași scară, cifra, «—» gri) |
| 9 tije oglindite | închis |
| 10 sparkline cu AT și goluri | închis (pas 5) |
| 11 Numărarea gri, după coloanele de decizie | închis («încărcare maximă (Numărare)» gri); pragul de sesiuni minime nu e scris — vezi 4 mai jos |
| 12 hașura gri | închis (pas 5) |
| 13 deasupra pliului | parțial — Orarul nu mai are schița din r1 în plan; propunerea rămâne valabilă, fără deducere |

### Vederea nouă «Clienții rutei»

1. **HIGH (blocant) — ponderea «în oameni» e părtinitoare exact spre tipul pe care Ion vrea să-l vadă.** Planul cere
   «ponderea TIKI vs ceilalți **în oameni și** în pasageri-km» («Ce facem» 3, paragraful «pe ce se ține»), iar mai jos
   spune că ponderea e în pasageri-km — două definiții. Oamenii numărați sunt un minim pentru că nu se văd cei care urcă
   și coboară la aceeași oprire (🔬: Σ creșterilor subestimează; `alighted` 2,5 %). Cine face asta? Mai ales călătorul
   scurt, local — adică tocmai «ceilalți». Deci `TIKI / (TIKI + ceilalți_min)` e **o limită de sus** a cotei TIKI și
   eroarea e cea mai mare pe rutele cu mulți scurți. Pe o zi-picior unde lipsa numărării depășește diferența, ceilalți_min
   iese ≤ 0 (TIKI 30, numărați ≥ 28, de fapt 36) → bara arată «100 % TIKI». **Scenariu de eșec:** în lista celor ~31 de
   rute, o rută locală (mulți scurți Edineț–Cupcini, Briceni–Lipcani) apare «se ține pe TIKI 90 %»; Ion o tratează ca rută
   de bilet lung și mută/taie plecarea de prânz care de fapt duce oamenii locali. **Corecție:** (a) orice **procent**,
   orice bară 100 % și orice sortare «pe ce se ține» = **doar pe pasageri-km** (mărimea exactă; km din aceeași sursă la
   ambele părți — confirmat: Numărarea ia `interurban_v2_stops.km_from_start`, `actions.ts:441-466`, la fel ca pasul 3);
   (b) oamenii apar doar ca **numere** alături («TIKI 30 · ceilalți cel puțin 6»), niciodată ca cotă sau segment de bară
   100 %; (c) ceilalți_min ≤ 0 pe zi-picior = «0, neconcordanță», numărat în linia de calitate, nu adunat ca 0 curat.

2. **Medium — «pasageri-km» nu-i spune nimic lui Ion** («nu înțeleg, simplu spune»), iar e chiar mărimea principală.
   Dacă eticheta e de neînțeles, ochiul cade pe cifra în oameni (cea părtinitoare, pct. 1). Propunere: pe ecran
   **«drum făcut (om × km)»**, cu o singură propoziție sub titlul vederii: «Măsurăm cât drum au făcut oamenii: 1 om pe
   100 km = 100. Așa se compară corect cei care merg 10 km cu cei care merg 200 km.» Cota se scrie în cuvinte: «Ruta 23:
   **62 %** din drum = bilete TIKI, **38 %** = ceilalți». Lei Numărării alături doar în tooltip (alt tarif decât prețul
   biletului — nu se scad direct).

3. **Medium — zilele «necunoscut» și «neconcordanță» trebuie să se vadă diferit de «0 ceilalți».** Pe o zi fără numărare
   eligibilă există bilete TIKI, deci un grafic pe zile cu bara TIKI și fără segment «ceilalți» arată ca o zi în care nu
   au fost alții. Corecție de marcaj: pe zilele neeligibile, deasupra barei TIKI un **ciot gri hașurat de înălțime fixă cu
   «?»** și eticheta «fără numărare»; pe zilele cu neconcordanță, ciot gri cu «!». Gri = calitate a datelor, nu serie
   (nu portocaliu, nu roșu — culorile de stare rămân rezervate). Legenda are trei intrări: TIKI · ceilalți (cel puțin) ·
   fără numărare.

4. **Medium — acoperirea diferă pe rută, deci rutele nu se compară pe aceeași bază.** Rândul unei rute numărate 4 zile
   din 28 stă lângă una numărată 28/28. Corecție: pe fiecare rând «numărată N din M plecări»; sub un prag (propun < 8
   picioare eligibile în fereastră) rândul rămâne în listă dar **fără bară**, cu «puține date» gri și sortat la sfârșit
   (același prag ca pct. 11 din r1).

**Forma recomandată (propuneri, fără deducere):**

5. **Lista celor ~31 de rute = «pe ce se ține», dintr-o privire.** Un rând pe rută, grupate pe coridor ca în Orar
   (aceeași ordine, ca Ion să recunoască rândul). Pe rând o **bară orizontală absolută** (nu 100 %): lungimea =
   drum făcut pe plecare, împărțit în TIKI (`#2a78d6`, stânga) | ceilalți (`#eb6834`, dreapta), 2 px gol între segmente
   (`SplitBar` din `charts.tsx:224` face deja asta; are nevoie de scară comună, nu `total` propriu). Așa se văd și mărimea
   rutei, și compoziția. Lângă bară, text: «ceilalți 38 %» (pe drum) și «TIKI 30 · ceilalți cel puțin 6 oameni/plecare».
   Sortare implicită în coridor = după cota celorlalți, descrescător; comutator «după oră». Fără hartă de căldură aici:
   două tipuri × 31 de rute nu se citesc în culoare.

6. **Profilul pe tronsoane (`SegmentProfile`) = grafic în trepte, nu linie.** Încărcarea e constantă pe tronson, deci
   linia interpolată între opriri minte. Două trepte pe aceeași axă: «numărați» (contur, `#eb6834`) și «TIKI» (umplut,
   `#2a78d6`), aria dintre ele umplută portocaliu deschis = ceilalți la bord. Unde TIKI > numărați, aria e gri hașurat
   cu «neconcordanță», nu inversată. Axa X = km pe **geografie** (nord stânga, Chișinău dreapta) la **ambele** picioare,
   două paneluri unul sub altul cu aceeași scară Y și o săgeată de sens în titlu — așa Bălți stă în același loc în ambele.
   Pe axa X doar orașele (4–6 etichete), restul opririlor la hover. Zonele nete: sub axă, triunghiuri mici ▲ «urcă net»
   / ▼ «coboară net» doar unde schimbarea diferenței ≥ 3 oameni, cu titlul «Unde urcă / coboară ceilalți (în net — nu
   știm perechile)». Valoarea = media pe plecările eligibile, «din N plecări» în subtitlu.

7. **Oamenii pe zi = bare pe zile, nu calendar.** Calendarul (harta de căldură) ține o singură mărime; aici sunt două
   tipuri plus «necunoscut». Pentru ruta aleasă: o bară pe zi (28 de zile ≈ 28 de bare de ~14 px), TIKI jos, ceilalți
   deasupra, ciotul «?» din pct. 3, ziua fără cursă = «—» gri pe axă. Comutator picior: N→C · C→N · ambele (implicit
   ambele, sumă). Sub bare o fâșie L–D cu **ceilalți/plecare** (mediana), aceeași formă ca harta din Orar — răspunde la
   «în ce zile vin ceilalți» (vineri/duminică = studenți etc.). Tabelul pe zile sub grafic, ca în `MonthlyView`.

8. **«Cel puțin» — o singură dată, în cuvinte, nu în fiecare celulă.** Antetul coloanei: «Ceilalți (cel puțin)»; celulele
   = numere simple; tooltip-ul: «cel puțin 14 oameni — cine urcă și coboară la aceeași stație nu se vede în numărare».
   Fără «≥14» și fără «14+» în celule (Ion: simplu). Cifrele exacte (TIKI, drum făcut) fără nicio marcă — absența
   etichetei înseamnă «exact».

9. **Deasupra pliului (1440×900).** (1) rândul de filtre: perioada (implicit ultimele 4 săpt. complete, nu înainte de
   28.03.2026) · coridor · picior; (2) linia de acoperire: «Numărate X din Y plecări · Z zile fără numărare (nu intră în
   cifre) · N neconcordanțe»; (3) trei cifre pe toată rețeaua: «oameni cu TIKI» (exact) · «ceilalți, cel puțin» · «cota
   celorlalți din drumul făcut»; (4) lista rutelor (pct. 5), primul coridor deschis. Clic pe rută → detaliul sub rând:
   profilul (pct. 6) sus, zilele (pct. 7) jos. Nimic pe șofer, conform planului.

10. **Culori.** TIKI = `SERIES[0]`, ceilalți = `SERIES[1]` peste toate cele trei vederi (culoarea urmează tipul, nu
    poziția); `BRAND #9B1B30` nu se folosește în «Clienții rutei» (se confundă cu portocaliul la citirea rapidă și pare
    alarmă). «Ceilalți majoritari pe tronson» nu se colorează cu roșu/stare — nu e rău, e un tip de client.

Deduceri: pct. 1 −2,0 (defect de logică: două definiții ale ponderii, una părtinitoare, dovadă `actions.ts:441-466` +
🔬 «Oameni numărați vs TIKI»); pct. 2 −1,0; pct. 3 −1,0; pct. 4 −1,0. Pct. 5–10 sunt propuneri, fără deducere.

Scor: 5.0 · Blocante (critical/high): 1

## Review runda 2: senior-backend-engineer

Zona: implementarea și performanța pe v3 (atribuirea pe bilet, `tiki_trip_attr`, `route_leg_daily`, `leg_segment_load`,
ordinea refacerii, RPC-uri, `tiki_label_rule`). Fapte măsurate pe viu, read-only, 01.10 (`zqkzqpfdymddsywxjxow`):
`tiki_tickets` 555.749 rânduri, 435 MB (heap 258 MB), **6 indexuri** (pkey `ticket_key` generat, `ticket_no`, `sale_date`,
`(pair_source, sale_date)`, `(route_name, price)`, `import_batch_id`), `n_tup_upd` 352.539 din care **HOT 101 (0,03 %)**,
`n_dead_tup` 105.064, fără `fillfactor`; `pg_stat_statements`: RPC-ul lunar prin API (deduce/refresh) medie 4,8 s, max 27,7 s;
mutarea a 666 de bilete pe alt `import_batch_id` = 24,0 s (plus 12,8 s încercarea cu CASE). Rolul `authenticator`:
`statement_timeout=8s`, **`lock_timeout=8s`**, `safeupdate`; `SET statement_timeout` pe funcție funcționează prin API
(27,7 s au trecut) — corectez afirmația mea din runda 1, nr. 2. `route_stop_passes`: **2026-09-09 … 2026-09-30** (37.577 rânduri).
`route_cancellations`: 116 rânduri, **2026-05-01 … 2026-10-02** (🔬 spune «din 28.03.2026» — inexact).
`crm_daily_log` nu are coloane de retur (doar `vehicle_id`, `driver_id`, `driver2/3_id`). Potrivirea `tiki_daily_trip.driver_name`
↔ `drivers.full_name` pe 09.2026: exact 16.467 / 26.746 bilete (61,6 %); formate «SUMSCHII A.», «NEGRU SASHA», «SERGHEI BARBACARI».

### Închise din runda 1

| r1 | stare | unde în v3 |
|---|---|---|
| 1 high — intervale suprapuse | **închis** (EXCLUDE gist + funcție de corectură într-o tranzacție) — dar vezi nr. 3 de mai jos pentru regulile «dedus» | pas 1 |
| 2 medium — Numărarea live | **închis** pe fond (`route_leg_daily` nocturn); **deschis** restul: aliniere «anul trecut» la 364 de zile (nr. 9) | pas 2 |
| 3 medium — SQL netestat de vitest | **parțial**: `attr.ts` e oglindă TS a logicii care rulează în SQL; testul atinge oglinda, nu funcția (nr. 7) | Fișiere, Verificare |
| 4 medium — `UNRELIABLE_RANGES` în 2 locuri | **închis pentru RPC**, **redeschis** pentru jobul nocturn (nr. 1) | pas 3–4 |
| 5 medium — `retur_uses_route_id` | **închis** din 04.04.2026 (`vehicle_id_retur`, `retur_route_id`); înainte `crm_daily_log` n-are retur — acoperit de fereastra piciorului pe aceeași mașină | «Ce facem» 1 |
| 6 low — Tendința fără corespondență | **închis** | Triaj |
| 7 low — acțiuni separate | **închis** (`routeAttrActions.ts`, union) | Fișiere |

### Observații noi

1. **high (−2,0) — Eligibilitatea și atribuirea în perioadele sincronizate: jobul nocturn nu are lista, iar biletele
   sincronizate se atribuie pe ziua greșită.** Pasul 3 cere `UNRELIABLE_RANGES` «trimisă ca parametru», dar
   `leg_segment_load` / `route_leg_daily` se umplu din `pg_cron` (pas 2, pas 7), unde nu există TS care să trimită
   parametrul; lista trăiește doar în `bilete/periods.ts:8-24`. Fapt: 01–22.04.2026 TIKI are 0–349 bilete/zi
   (06–17.04: 0), iar Numărarea are 25–40 de sesiuni completate pe zi; 23.04 = 15.777 de bilete (ziua sincronizării).
   **Scenariu:** jobul nocturn sau refacerea lunii 04.2026 marchează 06–17.04 eligibile (luna TIKI e «importată complet»
   — fișierul există) → «ceilalți» = 100 % din numărați pe toate rutele 12 zile → «pe ce se ține» pe aprilie arată TIKI
   ≈ 0; iar pasul 1 atribuie cele 15.777 de bilete din 23.04 după graficul și ferestrele piciorului din 23.04 (`sale_ts` =
   ora sincronizării) → biletele a 3 săptămâni cad pe rutele/picioarele mașinilor din 23.04, iar «≥ 1 bilet TIKI → efectuată»
   aprinde picioare pe 23.04 din bilete de pe alte zile. **Corecție:** lista se mută în tabelă `tiki_unreliable_ranges`
   (citită de SQL și de TS, o singură sursă; `periods.ts` o citește din acțiune), iar biletele cu `sale_date` în interval
   primesc `attr_source = 'nesigur'` (nu se atribuie, nu aprind `efectuata`, nu intră în derivarea regulilor de etichetă),
   arătate în găleata lor pe linia de calitate.

2. **high (−2,0) — «Plecare efectivă» nu are sursă înainte de 09.2026, deci măsura principală a Orarului e părtinitoare
   tocmai la «anul trecut».** Precedența din pasul 2: GPS **sau** Numărare **sau** ≥ 1 bilet → `efectuata`; altfel
   anulare; altfel `necunoscuta`. Fapt: GPS (`route_stop_passes`) există doar din 09.09.2026, Numărarea din 28.03.2026,
   anulările din 01.05.2026. Pentru 12.2024–03.2026 singura sursă de `efectuata` e chiar biletul. **Scenariu:** ruta X în
   09.2025: 30 de zile în grafic, 22 cu bilete, 660 de bilete → «bilete pe plecare» = 660/22 = 30 (zilele fără bilet devin
   `necunoscuta`, scoase din numitor); în 09.2026 cu Numărare: 30 de plecări efective, 660 de bilete → 22. Semnalul «De
   decis» arată −27 % față de anul trecut la cerere identică, iar «zile fără niciun bilet: N din M» e 0 prin construcție
   pe orice perioadă dinainte de 28.03.2026. **Corecție:** în plan, numitorul pentru comparația an-la-an se ia **pe aceeași
   bază în ambii ani** (ex. zile în grafic, `crm_daily_log` / `daily_assignments`, minus anulări unde există), iar
   «bilete pe plecare efectivă» doar unde ambele perioade au sursă independentă de bilet; rândul 🔬 «route_cancellations
   din 28.03» corectat la 01.05.2026 și adăugat rândul «GPS pe opriri din 09.09.2026».

3. **high (−2,0) — Regulile `dedus` se ciocnesc cu cele `corectat` sub EXCLUDE, iar istoria se reatribuie cu regulile de azi.**
   Pasul 1 + «Ce facem» 3: regula de etichetă e «dedusă din 1. … majoritatea pe ultimele N zile», refăcută la fiecare
   refacere; corectura ADMIN deschide un interval `corectat`. EXCLUDE interzice două reguli pe aceeași etichetă cu
   intervale suprapuse, dar planul nu spune cum se regenerează `dedus` în jurul unui `corectat`. **Scenariu:** ADMIN
   corectează «Ocnita - Chisinau 08:00» de la 01.06.2026 → `[2026-06-01, infinity) corectat`; noaptea refacerea ultimelor 14
   zile reinserează regula `dedus` pentru aceeași etichetă `[…, infinity)` → `23P01 exclusion_violation`, toată funcția
   (o tranzacție) se anulează, iar de atunci jobul cade în fiecare noapte: pagina rămâne pe «actualizat la» vechi fără
   alarmă. Invers, dacă regula `dedus` e o singură regulă curentă (ultimele N zile), refacerea lunii 03.2025 folosește
   majoritatea din 09.2026 → aceeași lună dă alte cifre după fiecare refacere. **Corecție:** regulile `dedus` sunt **pe lună**
   (`valid` = luna din care s-au dedus, nu ultimele N zile), regenerate doar pentru lunile refăcute, cu
   `DELETE … WHERE sursa='dedus' AND valid && luna` și `INSERT` doar pe `valid - (uniunea intervalelor corectat)`
   (`daterange`/`datemultirange` minus); precedența `corectat` > `dedus` scrisă explicit; jobul nocturn scrie rezultatul
   (ok / eroare + mesaj) într-un jurnal citit de linia de calitate.

4. **medium (−1,5) — Scrierea atribuirii pe `tiki_tickets` = rescrierea tabelei late cu 6 indexuri, fără HOT.**
   Fiecare UPDATE pe `tiki_tickets` e non-HOT (101 din 352.539 până azi): rând nou de ~460 B + 6 intrări de index (inclusiv
   pkey text recalculat). Prima atribuire pe toată istoria = +555k tupluri moarte (azi deja 105k), ~+250 MB până la vacuum;
   o refacere de lună ≈ costul lui deduce (medie 4,8 s, max 27,7 s prin API) plus joinurile atribuirii; noaptea, 14 zile ×
   ~900 de bilete rescrise chiar dacă nimic nu s-a schimbat (planul nu cere garda `IS DISTINCT FROM`, pe care o are
   `tiki_deduce_pairs`, `446:206-209`). **Corecție:** atribuirea nu se scrie în `tiki_tickets`: fie direct agregată în
   `tiki_trip_attr` cu dimensiunea `pair` (singurul consumator per bilet e `leg_segment_load`, care are nevoie doar de
   rută + picior + pereche), fie tabelă îngustă `tiki_ticket_attr(ticket_key PK, sale_date, crm_route_id, leg, attr_source)`
   refăcută cu `DELETE … WHERE sale_date BETWEEN` + `INSERT` pe lună. Dacă rămâne în `tiki_tickets`: garda `IS DISTINCT FROM`,
   niciun index pe coloanele noi, iar backfill-ul lună cu lună cu `VACUUM (ANALYZE) tiki_tickets` la final în pasul de migrație.

5. **medium (−1,0) — Refacerile concurente și corectura pe interval lung nu au proprietar.** `tiki_refresh_agg` face
   `DELETE` + `INSERT` pe interval; jobul `pg_cron` (pas 2/7) și butonul de import / corectura din UI pot rula aceeași lună
   simultan: a doua tranzacție nu vede inserările primei → `duplicate key` pe PK-ul `tiki_daily_trip`, sau așteaptă blocajul
   peste `lock_timeout=8s` al lui `authenticator` → eroare în UI. Corectura unei reguli de la 2025-01-01 înseamnă ~21 de
   luni × până la 28 s; pasul 7 nu spune cine le parcurge — dacă bucla e în browser (ca `ImportPanel.tsx:58`), o filă
   închisă lasă lunile 1…k refăcute și restul pe regula veche, iar noaptea reface doar 14 zile. **Corecție:**
   `pg_advisory_xact_lock(hashtext('tiki_refresh'))` (sau per lună) în fiecare funcție de refacere; corectura scrie lunile
   atinse într-o coadă `tiki_refresh_queue(month, motiv, cerut_la, facut_la)` golită de `pg_cron` lună cu lună; pagina arată
   «în refacere: N luni».

6. **medium (−1,0) — Pasul «șoferul biletului» se bazează pe o potrivire de nume neverificată.** 🔬 măsoară mașina, nu
   șoferul. Numele TIKI se potrivesc exact cu `drivers.full_name` pe 61,6 % din bilete; restul sunt inițiale, ordine inversă,
   diminutive, «Î». Un `ILIKE` pe nume de familie poate lega greșit (omonime). **Corecție:** tabelă
   `tiki_driver_map(driver_name_tiki PK, driver_id, sursa ∈ {exact, dedus_masina, corectat})` dedusă automat din zilele în care
   mașina biletului e în grafic cu un singur șofer (aceeași filozofie ca regulile de etichetă), cu rândul 🔬 «câte bilete
   «REZERVA» / mașină necunoscută se leagă pe șofer» măsurat înainte de pasul 1.

7. **medium (−1,0) — Logica lanțului e scrisă de două ori (SQL în 451 și `attr.ts`), testată doar în TS.** Cheia mașinii
   (`tiki_plate_key` SQL vs funcție TS), fereastra piciorului și coridorul există în ambele; vitest verifică oglinda, iar
   SQL-ul care scrie efectiv poate devia fără să pice niciun test. **Corecție:** SQL-ul e sursa; testul e un fișier SQL de
   fixtures rulat după migrație (`select tiki_plate_key('BXI 805') = tiki_plate_key('805BXI')`; atribuirea pe 15.09.2026:
   RQR 330 → ruta 31, MLN 828 / MJW 784 pe «Chisinau - Lipcani 10:40» → 2 / 16; Criva 06:00 vs 14:15 pe aceeași mașină →
   două picioare), cu rezultatul așteptat în fișier; `attr.ts` păstrează doar ce rulează în browser (coridorul pentru
   afișare), nu o copie a atribuirii.

8. **low (−0,5) — Granulația și cheile tabelelor noi nu sunt scrise.** `tiki_trip_attr`, `route_leg_daily`,
   `leg_segment_load` n-au PK/indexuri în plan; `leg_segment_load` crește cu ~30k rânduri/lună (≈1.500 picioare × ~20
   opriri) și `get_tiki_clienti(p_route, p_leg)` are nevoie de `PRIMARY KEY (crm_route_id, leg, date, stop_order)`;
   `route_leg_daily` `PRIMARY KEY (date, crm_route_id, leg)`; `tiki_trip_attr` — granulația exactă (cu sau fără
   `vehicle`/`driver_name`/`pair`) și PK. Plus RLS + REVOKE pe tabele, nu doar pe funcții (pas 4 vorbește doar de funcții).

9. **low (−0,5) — «Anul trecut» fără aliniere pe ziua săptămânii.** Rămas din runda 1, nr. 2: harta L–D, sparkline-ul și
   semnalele compară cu fereastra deplasată cu **364 de zile**, nu `interval '1 year'`; de scris în pasul 4 la `get_tiki_orar`
   și `get_tiki_tendinta` (luna parțială rămâne pe aceleași zile calendaristice, ca în `MonthlyView.tsx`).

Ce e bine și nu se deduce: RPC-urile de citire pe agregate (< 3 s e realist: `tiki_daily_trip` integral 0,44 s, agregatele
noi sunt de același ordin); `route_stop_passes`, `daily_assignments`, `route_cancellations`, `counting_sessions` au deja
indexurile pe (rută, dată) / dată de care are nevoie lanțul; `btree_gist` instalat; funcțiile de scriere cu
`SET statement_timeout='120s'` trec de limita de 8 s a API-ului (dovedit de 27,7 s).

Deduceri: 1 (−2,0) · 2 (−2,0) · 3 (−2,0) · 4 (−1,5) · 5 (−1,0) · 6 (−1,0) · 7 (−1,0) · 8 (−0,5) · 9 (−0,5) = −11,5 → plafonat la 0.

Scor: 0.0 · Blocante (critical/high): 3

## Review runda 2: business-logic-auditor

Pe versiunea 3. Cifrele sunt din SQL read-only pe `zqkzqpfdymddsywxjxow` (01.10.2026), fără scanări complete ale `tiki_tickets` (doar `sale_date` între limite).

**Observațiile din runda 1:**
- 1 (eticheta ≠ autobuz): **închisă ca regulă** (lanțul pornește de la mașină). Dar cât de bine se leagă istoria pe mașină nu e măsurat; vezi observația nouă 1.
- 2 (definiția «pasageri numărați»): **închisă** pentru încărcarea maximă și pasageri-km. Dar formula nouă «oameni numărați» numără scurții de două ori; vezi observația nouă 3.
- 3 (Anulare): **închisă doar pe jumătate.** Rândul separat există, dar comparația pe coridor față de anul trecut rămâne umflată în 12–03; vezi observația nouă 7.
- 4 (tariful în trepte), 5 (perioadele nesigure, `p_excl_ranges`), 6 (EXCLUDE gist, totalurile pe găleți, toate etichetele din 12.2024), 7 (testele vitest pentru sens și nume): **închise.**

**Observații noi:**

1. **[high] Sursa 1 (mașina) nu ține pentru istoria 12.2024–03.2026, deci anul trecut și anul acesta sunt atribuite cu metode diferite.** `crm_daily_log.vehicle_id` e `smallint`: un id din vechiul CRM (`crm_vehicles.id`), nu `vehicles.id`. Iar `vehicle_info` nu conține numărul mașinii, ci textul «2026-03-13 17:54:16 Dispecer». Pe 10.2025, din 26.566 de bilete: 93 % au mașina în `vehicles`, dar doar 44 % în `crm_vehicles`. Prin `crm_daily_log` → `crm_vehicles` se leagă unic pe mașină-zi doar **10.361 (39 %)**. Pe 09.2026, prin `daily_assignments`, procentul e 73,5 % (🔬). Restul de ~61 % din istorie cade pe șofer (`driver_id` tot din vechiul CRM) sau pe etichetă, adică exact unitatea respinsă în runda 1. **Scenariu de eșec:** «Ocnita - Chisinau 08:00» (vândută și de mașina rutei 31, și de cea a rutei 3) se leagă în 2025 mai ales prin etichetă. Votul majoritar o pune pe ruta 3. În 2026 se leagă pe mașină, deci biletele mașinii de pe 31 ajung la 31. Orarul și Tendința arată atunci «ruta 31 +X % față de anul trecut, ruta 3 −Y %», iar semnalul «De decis» se aprinde din schimbarea metodei, nu din cerere. Poarta «nelegat < 5 % pe 09.2026» nu vede nimic din toate astea. **Corecție:** în 🔬, procentul pe surse (mașină / șofer / etichetă / nelegat) lună cu lună, 12.2024–09.2026, plus legătura `crm_vehicles` ↔ `vehicles` (după numărul normalizat) folosită în pasul 1. Poarta se pune pe fiecare lună, nu doar pe 09.2026. Comparația față de anul trecut se face pe rută doar unde ponderea legată pe mașină e comparabilă în ambii ani (de exemplu diferență ≤ 10 p.p.). Altfel se compară pe coridor, iar celula primește hașura «metodă diferită».

2. **[high] GPS-ul (`route_stop_passes`) există doar din 2026-09-09 și nu e o sursă independentă. Înainte de 28.03.2026, «efectuată» se definește prin biletele înseși.** Fapte: `min(date)` = 2026-09-09. Migr. 393, rândurile 8–11: rândul se scrie pentru «mașina pusă pe cursă în graficul zilei (daily_assignments)» care trece la ≤ 350 m de o oprire, în ±2 h. Deci GPS-ul confirmă mașina din grafic și nu poate fi «a treia sursă mașină→rută». Precedența din pasul 2 dă, pentru 12.2024–03.2026, doar două stări: `efectuata` (≥ 1 bilet) sau `necunoscuta` (0 bilete). **Scenariu de eșec:** «zile fără niciun bilet: N din M» iese 0 pentru tot anul trecut, prin construcție. «Bilete pe plecare efectivă» din 2025 exclude plecările goale, pe când în 2026 Numărarea și GPS-ul le includ. O rută slabă arată astfel «scade față de anul trecut» doar pentru că s-a schimbat numitorul, adică exact rutele pe care Ion le-ar tăia. **Corecție:** în 🔬, intervalul fiecărei surse de stare (GPS din 09.09.2026, Numărare din 28.03.2026, `route_cancellations` din 28.03.2026). Media pe plecare față de anul trecut se compară doar pe aceeași definiție: pentru perioadele fără GPS sau Numărare, `efectuata` = zi din grafic (`crm_daily_log` cu `crm_route_id > 0`, fără anulare cunoscută), în ambii ani. «Zile fără bilet» se arată doar acolo unde există o sursă independentă de bilete. GPS-ul se scoate din lanțul mașină→rută, pentru că dublează sursa 1.

3. **[high] «Oameni numărați = scurți + creșteri ale încărcării» numără scurții de două ori, deci «cel puțin» devine fals.** `numarare/calculation.ts:131-137`: `longPassengers = total_passengers − shortInTransit`, adică `total_passengers` conține deja scurții în tranzit, iar urcarea lor apare deja ca o creștere a încărcării. Faptul din 🔬 («scurți: 0 în 09.2026») ascunde problema. `counting_short_passengers` are 11.318 rânduri între 07.04 și 23.06.2026. Pe 05.2026: Σ creșteri = 43.756, iar scurți = 6.211 oameni. **Scenariu de eșec:** pentru 04–06.2026, «Clienții rutei» arată «cel puțin 49.967 numărați» în loc de ≤ 43.756 măsurabili. Ceilalți ies umflați cu până la 6.211 pe lună (~14 %), iar ponderea TIKI pe rutele cu scurți scade artificial. Ecranul promite «cel puțin», dar cifra e peste minimul demonstrabil. **Corecție:** «oameni numărați (minim)» = Σ creșteri pozitive ale `total_passengers` pe (sesiune, sens, ciclu), fără să se adune scurții. Scurții rămân doar ca informație despre stația de urcare. Testul SQL din Verificare: pe 3 sesiuni din 05.2026 care au scurți, recalcul de mână egal cu ce scrie `route_leg_daily.oameni_min`.

4. **[medium] Numărarea include 14 rute suburbane Briceni (44–57), unde TIKI nu vinde nimic. Cifra din 🔬 «ceilalți ≥ 16.160 (≈ 38 %)» e aproape dublă față de ce e pe interurban.** Pe 09.2026, creșterile sunt 35.024 pe interurban și 8.210 pe suburban (total 43.234 ≈ 42.906 din 🔬). Toate cursele TIKI din 09.2026 sunt ↔ Chișinău. Pe interurban, ceilalți ≥ 35.024 − 26.746 ≈ 8.278 (≈ 24 %). **Corecție:** vederea 3 și totalurile «pe ce se ține» numai pe `route_type = 'interurban'`. Suburbanul apare ca rând separat «fără TIKI (suburban Briceni)», pentru că e o parte reală din diferența de 180–260k / 145k lei la care întreabă Ion. Rândul din 🔬 se corectează.

5. **[medium] «Ceilalți = numărați − TIKI» iese negativ pe ~17 % din picioare, iar planul nu spune ce se afișează atunci.** Pe 01–28.09.2026, legând sesiunea interurbană de biletele aceleiași mașini, în aceeași zi și pe sensul invers TIKI: TIKI > numărați_min pe **183 din 1.091 de picioare** (109 cu ≥ 3 bilete în plus). Matematic, diferența rămâne o margine inferioară validă, dar pe ecran ar apărea «cel puțin −4» sau o pondere TIKI de peste 100 %. **Corecție:** pe picior-zi, ceilalți_min = max(0, numărați_min − TIKI). Asta rămâne margine inferioară validă și e mai strânsă. Totalul pe perioadă = suma acestor valori. Numărul de picioare cu TIKI > numărați intră în linia de calitate, ca «neconcordanță», la fel ca pe tronsoane.

6. **[medium] Pe picioarele numărate, mașina sesiunii Numărării (`counting_sessions.vehicle_id`, corectată de operator) e o sursă mai bună decât graficul, dar planul n-o folosește.** Pe 09.2026, 15 din 795 de sesiuni interurbane au altă mașină decât `daily_assignments` (ambele picioare). Biletele vândute de alte mașini din lanț (șofer / etichetă / nelegat: 26,5 % pe 09.2026, 🔬) nu ajung pe piciorul numărat și cresc ceilalți. **Corecție:** din 28.03.2026, pentru `leg_segment_load` și vederea 3, TIKI-ul piciorului se ia după mașina sesiunii (+ fereastra și sensul), înaintea graficului. La eligibilitate se adaugă: ponderea biletelor mașinii sesiunii legate pe etichetă sau nelegate < 5 %.

7. **[medium] Biletele «Anulare» au mașină, deci se pot atribui. Rândul separat nu repară comparația pe coridor.** În 01.2025, toate cele 1.812 bilete Anulare au `vehicle` completat (`direction = necunoscut`). Pe 12.2024–03.2025 (6–7,5 % din bilete), coridoarele din anul trecut rămân subestimate, deci în 12–03 față de anul trecut 2026 pare mai bun cu ~6–7 p.p. **Corecție:** în pasul 1, Anulare intră în lanț pe mașină + fereastra din `sale_ts` (sensul îl dă fereastra, fiindcă `direction` lipsește). Cele care rămân ambigue stau pe rândul separat, iar coridoarele din lunile cu rest Anulare > 1 % primesc hașura.

8. **[low] Cicluri.** 224 din 1.032 de sesiuni din 09.2026 au `cycle_number > 1` (până la 15), toate suburbane. `route_leg_daily(date, crm_route_id, leg)` nu are ciclu, iar creșterile și maximul trebuie partiționate pe (sesiune, sens, ciclu). Pe interurban nu schimbă nimic azi; contează doar dacă suburbanul intră (vezi 4). În plus, eligibilitatea cere «ambele picioare salvate», deși e definită pe picior: un picior numărat se pierde pentru că celălalt lipsește.

9. **[low] Ferestrele piciorului se calculează din orele actuale din `crm_routes`, aplicate și pe 2025.** Orarele s-au schimbat (de exemplu rutele 58→30, 59→31 din 25.09.2026). Sensul TIKI salvează aproape toate cazurile, dar testul vitest trebuie să conțină o zi din 2025 cu o rută cu altă oră. Pentru comparație, `route_cancellations` e în regulă: 110 din 116 n-au mașină în grafic, niciuna n-are GPS, iar cele 8 cu sesiune numărată (încărcări 10–33) sunt corect `efectuata` după precedență.

Deduceri: 1 (−2,0) · 2 (−2,0) · 3 (−2,0) · 4 (−1,0) · 5 (−1,0) · 6 (−1,0) · 7 (−1,0) · 8 (−0,5) · 9 (−0,5) = −11,0 → limitat la 0.

Scor: 0.0 · Blocante (critical/high): 3

## Review runda 3: dataviz-ux

Pe versiunea 5. Metoda: skill-ul `dataviz` (forma după decizie → culoarea după rol → marcaje → hover/tabel →
anti-modele). Citite: v5 întreg, triajul rundei 2, rubrica, `bilete/charts.tsx` (`Sparkline` :209, `SplitBar` :224,
`SERIES` :9), `bilete/ui.tsx` (`Delta` :18), `039_session_metrics_directional.sql:81-88`, `446_tiki_bilete_aparat.sql:226-234`.
Paleta TIKI `#2a78d6` / ceilalți `#eb6834` a trecut validatorul în runda 2 (CVD ΔE 24,7); nu s-a schimbat.

### Runda 2 — ce s-a închis

| nr. r2 | stare în v5 |
|---|---|
| 1 (high) ponderea în oameni părtinitoare | **închis** — «pe ce se ține» doar în om × km, oamenii doar ca cifre («TIKI 30 · ceilalți cel puțin 6») |
| 2 «pasageri-km» neclar | închis — «drum făcut (om × km)»; lipsește încă propoziția-explicație sub titlu (vezi propunerile) |
| 3 «necunoscut» ≠ «0 ceilalți» | închis în logică (rând separat); marcajul vizual (ciot gri «?») nu e în pasul 5 — intră în codificarea de mai jos |
| 4 acoperirea pe rând | închis — «numărată N din M», sub 8 picioare «puține date», fără bară |
| 5–10 propuneri | 6 (trepte, nordul la stânga, gri hașurat la TIKI > numărat) și 10 (culorile) **adoptate** în pasul 5; 5, 7, 9 (lista cu bară absolută, barele pe zile, pliul) nu sunt scrise — propuse din nou, mai simplu, mai jos |

Lucrurile care în v3 erau artefacte (blocurile sincronizate, hașura pentru ele în sparkline) au dispărut odată cu ziua
cursei Mobilet — bine: sparkline-ul nu mai are nevoie de goluri pentru 15–17.01.

### Observații noi

1. **HIGH (blocant) — măsura «bilete pe zi de circulație» are două numitoare, iar anul acesta și anul trecut ajung pe
   numitoare diferite.** «Ce facem» 1: «zile din grafic / din bilete». Înainte de 02.2026 singura sursă sigură a zilelor e
   biletul însuși (cursele vin din raportul pe curse, doar cele cu bilete — 🔬; agregatul vechi se construiește tot numai
   din bilete, `446_tiki_bilete_aparat.sql:226-234`; graficul istoric se leagă doar 38 %, 🔬). Din 02.2026 există starea
   Mobilet, din 04.2026 `daily_assignments`, deci zilele «din grafic» includ și zilele în care cursa a mers fără niciun
   bilet. **Scenariu de eșec:** o rută slabă care în 10.2026 are 4 zile din 26 fără bilet: numitorul 2026 = 26 de zile,
   numitorul 10.2025 = doar zilele cu bilete. Aceeași cerere iese ≈ −15 % față de anul trecut în coloana «față de anul
   trecut», în sparkline (linia gri a anului trecut stă mai sus) și în semnalul «De decis» («sub AT 3 luni la rând») —
   exact pe rutele pe care Ion le-ar tăia. **Corecție:** comparația cu anul trecut pe rută se face pe **o singură
   definiție, simetrică în ambii ani**, scrisă în plan: fie (a) recomandat, cea mai simplă pentru Ion — **bilete pe lună
   (total)** pe aceeași fereastră de 364 de zile, fără numitor, cu nota «circulat N zile, anul trecut M» când diferă; fie
   (b) bilete / zile **cu cel puțin un bilet** în ambii ani, numită pe ecran «bilete pe zi cu vânzări». Bilete pe plecare,
   bilete pe loc și ocuparea TIKI rămân măsuri «din 02.2026», **fără** coloană «față de anul trecut» până în 02.2027
   (`Delta` cu `na` = «din 02.2026», `ui.tsx:18-21`). Sparkline-ul de 52 săpt. desenează aceeași măsură ca Δ AT, nu
   schimbă măsura la 02.2026 (altfel apare o treaptă falsă în linie). Test în Verificare: o rută cu zile fără bilet în
   2026 și aceeași cerere în 2025 dă Δ = 0.

2. **Medium — Orarul are cinci măsuri pe rând; două se citesc greșit.** Bilete pe plecare, bilete pe loc, ocupare TIKI,
   ocupare totală, bilete pe zi de circulație. «Bilete pe loc 1,6» lângă «ocupare 45 %» se citește «160 % plin» → Ion
   adaugă o plecare care nu trebuie. **Corecție:** pe rând doar **o** măsură de umplere: «cât de plin (doar TIKI)» în %
   (om × km, definiția din `039:81-88`); «bilete pe loc» doar în tooltip, cu fraza «același loc vândut de mai multe ori pe
   bucăți de drum». «Ocupare totală» nu e coloană: apare ca a doua cifră în aceeași celulă doar unde există Numărare
   («TIKI 45 % · cu toți 62 %»).

3. **Medium — «cât de plin (doar TIKI)» e o limită de jos, iar Orarul e ecranul de tăiat.** Pe interurban ceilalți sunt
   ≈ 24 % în medie (🔬), dar diferă mult de la rută la rută (`calculation.ts:123,131-137`: Numărarea îi vede pe toți).
   O rută cu 30 % TIKI și 40 % ceilalți arată «goală» în Orar. **Corecție:** semnalele «De decis» de tip «tai / mut» poartă
   cota celorlalți din «Cine merge pe rută» când există, iar dacă cota e ≥ 25 % sau necunoscută, semnalul spune «înainte
   de tăiere: vezi cine merge pe rută» cu legătură directă. Rândul din Orar are o insignă mică portocalie «+ceilalți 40 %»
   (culoarea seriei, nu de stare).

4. **Medium — comparația pe rută cu anul trecut cade pe coridor până în 04.2027 și planul nu spune ce vede Ion pe rând.**
   Riscuri: comparație pe coridor când `eticheta_2026` > 30 % din biletele anului trecut — adică practic toate rutele până
   în 04.2027. Dacă rândul rutei arată Δ-ul coridorului, Ion îl ia drept al rutei. **Corecție (mai utilă decât coridorul):**
   pentru orar decizia e o **plecare TIKI** (etichetă + oră + sens), iar eticheta există identic în ambii ani — Δ AT pe rând
   = biletele etichetelor rândului în fereastra de azi față de aceleași etichete acum 364 de zile, fără atribuire; tooltip
   «aceeași plecare în TIKI, anul trecut». Unde eticheta e nouă: `Delta` cu `na` = «plecare nouă din …».

5. **Low — Anularea strică anul trecut în 12–03.** Tendința e pe eticheta cursei, iar biletele «Anulare» n-au cursă:
   12.2024–03.2025 pierd 6–7,5 % (🔬), deci 12.2025–03.2026 «cresc» cu ~7 p.p. în plus, și suma mobilă pe 12 luni la fel.
   **Corecție:** lunile anului trecut cu Anulare > 1 % primesc în grafic punctul gol + nota «anul trecut incomplet,
   ~7 % fără cursă», iar în tabel Δ-ul lor are `title` cu motivul.

6. **Medium — câte picioare ies «exact» nu e măsurat.** «Pe ce se ține» exclude picioarele «interval» (C2-2). Dacă
   numele opririlor TIKI nu se potrivesc pe `interurban_v2_stops` pe multe rute, majoritatea rândurilor devin «puține date»
   și vederea e goală; iar dacă se potrivesc mai rău pe rutele cu multe sate (exact cele cu mulți ceilalți), clasamentul e
   părtinitor. **Corecție:** în 🔬, pe 09.2026, procentul de picioare eligibile care ies «exact» pe rută; dacă sub ~60 %,
   cota «pe ce se ține» se dă pe interval («ceilalți 30–38 % din drum») în loc să scoată piciorul.

### Cele patru niveluri de siguranță — codificarea cea mai simplă

O singură regulă, scrisă o dată sub titlul fiecărei vederi, nu în fiecare celulă:

| nivel | în text / tabel | în grafic | legenda (o linie) |
|---|---|---|---|
| exact | cifra simplă: `30` | segment plin | «cifră simplă = sigur» |
| cel puțin | antetul coloanei «Ceilalți (cel puțin)», celula `6`; în fraze «cel puțin 6» | segment plin + o liniuță verticală subțire la capăt și nimic după | «cel puțin = pot fi mai mulți, nu mai puțini» |
| interval | `30–38 %` (două cifre cu liniuță, niciodată ±) | segment plin până la minim, apoi aceeași culoare la 35 % opacitate până la maxim | «30–38 = undeva între» |
| necunoscut | `?` gri, cu tooltip «zi fără numărare» | ciot gri hașurat de înălțime fixă, cu «?» | «? = nu știm» |

Fără simboluri `≥`, `~`, `±`, `*` (Ion: simplu). Culoarea rămâne a tipului (TIKI albastru, ceilalți portocaliu); siguranța
se arată prin formă (plin / pal / gri hașurat), niciodată prin culori de stare. Gri-ul hașurat e rezervat pentru «nu știm»
și «neconcordanță» (cu «!» în loc de «?»).

### Ecranele finale (laptop 1440×900, deasupra pliului)

**Filele:** «Orar» (implicit) · «Față de anul trecut» (în loc de «Tendință») · «Cine merge pe rută» (în loc de «Clienții
rutei») · Șoferi · Tipuri bilet · Import.

**Orar.** (1) filtre pe un rând: perioada (implicit ultimele 8 săpt. complete) · coridor. (2) linia de calitate: «Legate pe
mașină X % · după etichetă Y % · nelegate Z bilete · Confirmă →». (3) «De decis» — maxim 5 fraze, fiecare cu motivul și
legătura spre rând (ex.: «Edineț–Chișinău 13:10: 9 bilete pe cursă, −22 % față de aceeași plecare anul trecut; în coridor
+3 %. Ceilalți: 35 % din drum — vezi cine merge pe rută»). (4) primul coridor deschis: banda tijelor în oglindă (N→C sus,
C→N jos) și rândurile lui. Coloanele rândului, în ordine: «Pleacă» (oră N→C / C→N) · «Bilete pe cursă» · «Cât de plin
(doar TIKI)» · «L M M J V S D» (7 celule, mediana) · «Față de anul trecut» · «Ultimul an» (sparkline, anul trecut gri) ·
«Lei pe cursă». Măsura de bază pentru fiecare cifră: tooltip «medie din N curse».

**Față de anul trecut.** (1) filtre: perioada (luna curentă pe aceleași zile, marcată «în curs») · bilete | lei. (2) trei
cifre: «Bilete: +X %» · «Preț mediu: +Y %» · «Lei: +Z %», fiecare «față de aceleași zile anul trecut». (3) grafice mici,
unul pe coridor (bilete pe lună, anul acesta culoare, anul trecut gri, o singură axă), cu treptele de tarif ca linii
verticale subțiri etichetate «preț nou». (4) tabelul pe coridor: Δ bilete · Δ preț · Δ lei, rândul «Anulare» separat, jos.

**Cine merge pe rută.** Sub titlu, o frază: «Măsurăm drumul făcut: 1 om pe 100 km = 100. Așa se compară corect cine merge
10 km cu cine merge 200 km.» (1) filtre: perioada (implicit 4 săpt. complete, nu înainte de 28.03.2026) · coridor · sens.
(2) linia de acoperire: «Numărate X din Y curse · Z zile fără numărare (nu intră) · N neconcordanțe». (3) trei cifre pe
rețea: «Oameni cu bilet TIKI» · «Ceilalți, cel puțin» · «Ceilalți din drumul făcut: 24 %» (sau `22–27 %`). (4) lista
rutelor pe coridor, același ordin ca în Orar: o bară orizontală pe **scară comună** (lungimea = drum făcut pe cursă;
`SplitBar` din `charts.tsx:224` are acum `total` propriu pe rând — trebuie un `scaleMax` comun), TIKI stânga | ceilalți
dreapta, apoi textul «ceilalți 38 % din drum · TIKI 30 · ceilalți cel puțin 6 oameni pe cursă». Sortare în coridor după
cota celorlalți. Clic pe rută → dedesubt: treptele pe km (`SegmentStep`, nordul stânga, două panouri pe sens) cu
▲/▼ «aici urcă / coboară ceilalți (net)», apoi barele pe zile (TIKI jos, ceilalți deasupra, «?» pe zilele fără numărare)
și tabelul zilelor.

Deduceri: pct. 1 −2,0 (defect de logică; `446_tiki_bilete_aparat.sql:226-234` + 🔬 «Lista curselor», «Grafic istoric»);
pct. 2 −1,0; pct. 3 −1,0; pct. 4 −1,0; pct. 6 −1,0; pct. 5 −0,5. Codificarea și ecranele sunt propuneri, fără deducere.

Scor: 3.5 · Blocante (critical/high): 1

## Review runda 3: business-logic-auditor

Pe versiunea 5. Cifrele vin din SQL read-only pe `zqkzqpfdymddsywxjxow` (01.10.2026), pe `tiki_trips` și pe join-uri limitate după `sale_date`. N-am făcut scanări complete ale `tiki_tickets`.

**Observațiile din runda 2:**
- 1 (istoria nu se leagă pe mașină): **închisă.** Înainte de 04.2026 totul e `eticheta_2026`. Riscul de 30 % trimite deci comparația pe rută cu anul trecut la nivel de coridor până în 04.2027, iar Tendința e pe coridor. Acoperirea etichetelor e bună: biletele din 2025 pe etichete care nu există în 04–09.2026 sunt 0–2 %, în afară de «Anulare X» (vezi 7 mai jos).
- 2 (GPS, plecarea efectivă): **închisă pentru GPS, redeschisă pentru sursa nouă.** Starea Mobilet nu face ce presupune planul; vezi observația nouă 1.
- 3 (scurții de două ori): **închisă** (Σ creșteri, fără + scurți).
- 4 (suburbanul), 5 (max(0) + neconcordanță): **închise.**
- 6 (mașina sesiunii): **închisă în pasul 1. Eligibilitatea rămâne deschisă**; vezi observația nouă 6.
- 7 (Anulare atribuibile): **deschisă**; vezi observația nouă 4.
- 8 (cicluri / «ambele picioare»): ciclurile nu mai contează, fiindcă vederea e doar interurban. «Sesiune cu ambele picioare» a rămas în «Ce facem» 3; vezi observația nouă 8.
- 9 (orele din 2025): **închisă.** Ora decide doar din 04.2026, cu `daily_assignments` din ziua respectivă. Dar ora folosită nu e plecarea; vezi observația nouă 3.

**Observații noi:**

1. **[high] Un `trip_id` Mobilet nu e «o plecare concretă», ci o deschidere de cursă în terminal. Iar starea nu deosebește «a circulat» de «retrasă».** Faptele, pe 01–28.09.2026 (stările 4 și 6):
   - Sunt 2.134 `trip_id`, dar doar 1.736 combinații distincte zi × mașină × etichetă. 662 de curse au aceeași mașină și aceeași etichetă de mai multe ori în zi, iar 254 dintre ele au 0 bilete.
   - `dep_time` e ora deschiderii, nu a plecării. Pe 15.09, MJW 784 are «Chisinau - Criva 16:25» la 07:17 și 07:19 (0 bilete) și «Chisinau - Lipcani 10:40» la 07:21 (0) și la 08:07 (29). Pe 27.09, BXI 805 are 6 deschideri pe «12:35 Otaci- Chisinau»: 12:21, 15:35, 15:41, 15:41, 15:43, 22:47. MLD 069 are «12:30 Criva - Chisinau» la 19:47, cu 0 bilete.
   - `withdraw_reason` e gol pe toate cursele. Stările din 02–09.2026 sunt 4 (6.434) și 6 (10.081), plus 33 de curse în stările 2/3/5/7. Planul nu spune ce stare înseamnă «a circulat».

   **Scenariu de eșec:** «bilete pe plecare» pune la numitor deschiderile. Ruta lui BXI 805 din 27.09 numără 6 «plecări» pe piciorul nord→Chișinău în loc de 1, deci 33 de bilete / 6 = 5,5 în loc de 33. Șoferii care redeschid terminalul își trag ruta la coada coridorului, iar semnalul «De decis» propune tăierea ei. Cele 312 curse cu 0 bilete în starea 6 nu sunt «plecări goale» dovedite. «Retrasele numărate separat» rămâne o coloană mereu ~0.

   **Corecție:**
   - În 🔬: harta stărilor Mobilet (ce sunt 4 și 6) și faptul că `trip_id` = sesiune de terminal.
   - Plecarea se definește ca (`trip_date`, mașină, `crm_route_id`, picior) după atribuire. Sesiunile aceleiași mașini pe același picior se comasează. Sesiunile cu 0 bilete nu adaugă plecări dacă mașina are în zi altă sesiune cu bilete pe același picior.
   - Din 04.2026 numitorul «plecări» = graficul (`daily_assignments`) minus `route_cancellations`, ca peste tot. Mobilet aduce doar biletele.
   - Testul SQL din pasul 2 primește cazurile MJW 784 / 15.09 și BXI 805 / 27.09.

2. **[high] `tiki_trips.seats` nu e capacitatea autobuzului. «Bilete pe loc» și «ocuparea TIKI» ar ieși greșite.** Faptele:
   - Pe 02–09.2026, `seats` e între 18 și 19 pe toate cursele.
   - `vehicles.passenger_seats` are valori 20 (19 mașini), 27 (6), 30 (2) și 50 (28).
   - Pe 01–28.09.2026, 467 din 2.134 de curse (22 %) au `tickets_sold > seats`, cu maxim 46. `seats` e cota de vânzare online, nu capacitatea.

   **Scenariu de eșec:** un autobuz de 50 de locuri cu 18 bilete pe tot drumul apare «bilete pe loc 1,0» și «ocupare TIKI 100 %». Orarul îl marchează plin, iar Ion nu taie cursa, deși e 36 % ocupată. Un microbuz de 20 de locuri cu 29 de bilete pe tronsoane apare 1,6 «pe loc». Testul din Verificare («20 de locuri …») trece, pentru că folosește 20 de locuri scrise de mână.

   **Corecție:**
   - Locurile se iau din `vehicles.passenger_seats`, după `tiki_plate_key` pe mașina cursei.
   - Fără capacitate (161 de mașini au `passenger_seats` NULL; «REZERVA») nu se calculează nici «pe loc», nici ocupare: se afișează «—» și intră în linia de calitate.
   - Coloana `locuri` din `tiki_leg_daily` se scrie din `vehicles`, nu din Mobilet. Rândul se adaugă în 🔬.

3. **[medium] Ora și sensul unei sesiuni sunt nesigure, iar pasul 1 se sprijină pe amândouă.**
   - «Decide ora reală de plecare a cursei» folosește `dep_time` (ora deschiderii, vezi 1). 06:12 pe «08:00 Ocnita» la RQR 330 iese aproape de ora rutei 31, dar 15:35 pe «12:35 Otaci» e ora la care autobuzul e deja la Chișinău.
   - Pe 09.2026, 839 de bilete (3,3 %, 134 de curse) sunt pe sesiuni deschise la peste 2 h după ora din etichetă. Probabil sunt vândute pe întoarcere, fără schimbarea etichetei, deci «sensul din eticheta TIKI» le pune pe piciorul opus.

   **Corecție:**
   - Pentru mașina cu două rute în zi decide, întâi, eticheta, apoi `dep_time` doar ca rezervă, cu marjă.
   - Sesiunile deschise la peste 2 h după ora etichetei, cu biletele ale căror capete sunt în ordine inversă pe opririle piciorului, merg pe piciorul opus sau la «nelegat (sens)». În om × km TIKI, biletul cu capetele în ordine inversă e «nemapat», nu «exact».

4. **[medium] «Anulare» rămâne fără coridor în Tendință (r2 · 7, deschisă).** Biletele Anulare stau pe curse cu eticheta «Anulare 4.4», «Anulare 1» etc. (01.2025: 1.812 bilete, toate cu cursă și mașină). Regula din 2026 nu le leagă, pentru că eticheta nu există în 2026. Coridoarele din 12.2024–03.2025 rămân deci cu 6–7,5 % mai mici, iar 12–03 din 2026 pare mai bun față de anul trecut.

   **Corecție:** coridorul unei curse Anulare = coridorul celorlalte curse ale aceleiași mașini în aceeași zi, dacă e unic. Restul rămâne pe rândul separat, iar coridoarele din lunile cu rest Anulare > 1 % primesc hașura.

5. **[medium] Refacerea trebuie să se facă pe lunile cursei, nu pe lunile vânzării, iar zilele recente sunt incomplete.**
   - Din biletele curselor din 12.2025, 23.145 din 24.196 au fost importate la peste 7 zile după cursă (blocul de sincronizare din 15–17.01).
   - Dacă «lunile atinse» din pasul 3 se iau după `sale_date`, agregatele din 12.2025 nu se refac la importul din ianuarie.
   - Ultimele zile ale lunii curente pot primi încă bilete săptămâni întregi. «Luna curentă pe aceleași zile» și semnalele văd atunci o scădere falsă.

   **Corecție:**
   - Pasul 3: lunile = `distinct date_trunc('month', trip_date)` ale biletelor din importul curent.
   - Ultimele N zile se afișează gri «încă se sincronizează» și nu intră în semnale. N se ia din distribuția întârzierii `sale_date − trip_date`, pusă în 🔬.

6. **[medium] Eligibilitatea picioarelor numărate nu exclude cursele altor mașini atribuite pe același picior.** «Cursa Mobilet atribuită aceluiași picior» acceptă și sesiunile legate prin regula lunii, de exemplu «REZERVA» (85 de curse în 09.2026) sau o a doua mașină pe aceeași etichetă. Pe picioarele acestea TIKI însumează două autobuze, iar Numărarea unul singur. Rezultatul: TIKI > numărați și «neconcordanță» falsă, sau o pondere TIKI umflată.

   **Corecție:** pe picioarele eligibile, TIKI = doar sesiunile mașinii sesiunii Numărării. Celelalte sesiuni atribuite piciorului se afișează separat («alt autobuz, nenumărat»). Piciorul e eligibil doar dacă ele au < 5 % din bilete.

7. **[medium] Coada `count_refresh_queue` pierde cheia veche și leagă GO de bilete.**
   - Un trigger pe `counting_sessions` / `counting_entries` care scrie doar `(data, crm_route_id)` din NEW nu vede mutarea unei sesiuni pe altă rută sau zi (UPDATE) și nici o ștergere. Agregatul vechi rămâne atunci cu oamenii.
   - Triggerul rulează în tranzacția GO. O eroare a lui (drepturi, tabelă blocată) oprește salvarea operatorului, deci «nicio schimbare în GO» nu e adevărat.

   **Corecție:**
   - INSERT/UPDATE/DELETE pun în coadă și OLD, și NEW.
   - Triggerul e `SECURITY DEFINER`, cu `ON CONFLICT DO NOTHING`, și nu poate eșua decât la eroare de schemă.
   - Refacerea șterge din coadă doar id-urile pe care le-a procesat.
   - Testul: mutarea unei sesiuni de pe ruta A pe ruta B.

8. **[low] Cazuri de margine:**
   - **Date greșite în cursă:** 474 de bilete vândute în 2025–2026 stau pe curse datate 2022-07, toate «7:00 Caracusenii Vechi - Chisinau», BZP 210. Pe `trip_date` ele dispar din analiză. Regula propusă: dacă `trip_date` e cu peste 60 de zile înaintea `sale_date`, se folosește `sale_date`.
   - **Etichete de test:** există «TEST 23:35 Lipcani - Chisinau TestTIKI», cu bilete. Trebuie exclusă explicit.
   - **Ambele picioare:** eligibilitatea cere încă «ambele picioare» și pierde piciorul numărat când celălalt lipsește.

Deduceri: 1 (−2,0) · 2 (−2,0) · 3 (−1,0) · 4 (−1,0) · 5 (−1,0) · 6 (−1,0) · 7 (−1,0) · 8 (−0,5) = −9,5.

Scor: 0.5 · Blocante (critical/high): 2

## Review runda 3: senior-backend-engineer

Zona: implementarea și performanța pe v5 (sursa Mobilet, `tiki_trip_attr`, `tiki_label_override`, `tiki_leg_daily`,
`count_leg_daily`, `leg_segment_load`, coada `count_refresh_queue`, refacerea legată de `/api/cron/tiki-mobilet`, lacătul).
Fapte măsurate read-only pe `zqkzqpfdymddsywxjxow` (01.10) și citite în codul ION-160
(`.claude/worktrees/ion-160-translux-bilete-aparat-import`):
- `tiki_trips` 37.409 curse; bilete fără `trip_id` 133; bilete cu `trip_id` fără cursă 0.
- Stări: `null` 20.755 (înainte de 02.2026), **4 → 6.481, 6 → 10.131**, 1/2/3/5/7 → 48 în total; **`withdraw_reason` gol pe
  toate**; în fiecare lună din 02.2026 starea 6 are 123–337 de curse cu 0 bilete, starea 4 11–53.
- Întârzierea vânzare → cursă (curse din 06.2025 încoace): **39.071 de bilete vândute la peste 8 zile după cursă, 23.360
  dintre ele în altă lună** decât cursa.
- `dep_time`: în 09.2026 o etichetă are în medie **32 de ore distincte** (max 70; 56 din 58 de etichete au mai multe), în
  06.2025 20,6 (business-logic r3 · 1: e ora deschiderii sesiunii de terminal).
- «Anulare»: 7.644 de bilete, **toate cu `trip_id`**, pe 638 de curse proprii «Anulare N», **toate cu mașină**.
- `pg_stat_statements`: RPC-urile lunare de azi prin API au medie 3,5 s / max 27,7 s și 1,4 s / max 8,3 s;
  `tiki_set_trip_ids` medie 0,22 s / max 4,2 s pe bucată de 1.000.
- `counting_sessions`: 12.090 UPDATE (8.556 HOT, în principal `locked_by/locked_at`), `crm_route_id` și `assignment_date`
  NOT NULL. `counting_entries`: 178.666 INSERT, 79.318 DELETE, 0 UPDATE; are deja triggerul pe rând
  `counting_entries_recompute_suburban` (iese imediat pe interurban). GO scrie prin `getSupabase()` (service role).

### Starea observațiilor din runda 2

| r2 | stare | unde în v5 |
|---|---|---|
| 1 high — perioadele sincronizate | **închis**: analizele pe `tiki_trips.trip_date`, 0 bilete cu cursă lipsă | «Ce facem», 🔬 |
| 2 high — plecare efectivă fără sursă | **închis pe istorie** (zi de circulație); **redeschis pe 2026**: starea Mobilet nu are semnificația verificată (nr. 5) | «Ce facem» 1 |
| 3 high — `dedus` vs `corectat` sub EXCLUDE | **închis**: reguli pe lună + `tiki_label_override` prioritar; cheia lor are însă o problemă nouă (nr. 4) | pas 1 |
| 4 medium — scrierea pe `tiki_tickets` | **închis**: tabelă îngustă pe cursă (≈ 2.300 rânduri/lună) | pas 1 |
| 5 medium — concurența | **parțial**: lacăt pus, dar în forma care rămâne ținută prin PostgREST (nr. 2); coada are cursă la golire (nr. 3) | pas 3 |
| 6 medium — șoferul după nume | **închis** (pasul scos) | Triaj r2 |
| 7 medium — logică dublă SQL/TS | **închis**: SQL sursa, `tests/sql/tiki_attr_cases.sql` | pas 1 |
| 8 low — chei | **parțial**: `tiki_leg_daily` / `count_leg_daily` au PK; `leg_segment_load` încă fără; granulația `tiki_leg_daily` nu ține sursa (nr. 7) | pas 2 |
| 9 low — 364 de zile | **închis** | «Ce facem» 1 |

### Observații noi

1. **high (−2,0) — Lunile refăcute vin din ziua vânzării, iar lista lor trăiește doar în memoria rutei.** `route.ts:153-162`
   alege lunile din `rows.map(r => r.sale_date)`; pasul 3 spune «pe lunile atinse» fără să spună atinse de ce, iar agregatele
   noi sunt pe `trip_date`. Fapt: 23.360 de bilete au cursa în altă lună, după > 8 zile. **Scenariu:** terminalul
   sincronizează pe 16.01 biletele curselor din 02–31.12 (s-a întâmplat: 20.190 de bilete); rularea din 17.01 are fereastra
   09–16.01 → lunile = {01} → `tiki_leg_daily` pe decembrie rămâne cu ~1.000 de bilete în loc de ~24.000, fără nicio urmă.
   Și dacă se ia corecția simplă («lunile cursei biletelor din importul curent», business-logic r3 · 5), ea se pierde la
   prima eroare: refacerea pică după import → `fail()` marchează lotul `failed` → retry-ul de la 08:00 inserează 0 bilete noi
   → lista de luni e goală, decembrie nu se mai reface. **Corecție:** importul scrie, în aceeași rulare, lunile
   `date_trunc('month', trip_date)` ale curselor biletelor inserate sau legate (`tiki_set_trip_ids` întoarce `trip_id`-urile)
   ∪ lunile ferestrei curselor într-o coadă persistentă `tiki_refresh_queue(luna PK, motiv, cerut_la)`; refacerea golește
   coada. Test: bilet nou cu `sale_date` 16.01 pe cursă din 05.12 → decembrie refăcut, și după o refacere picată.

2. **high (−2,0) — `pg_try_advisory_lock` (lacăt de sesiune) prin PostgREST rămâne ținut pe conexiunea din pool.** Pasul 3
   cere `pg_try_advisory_lock`, iar refacerea e un șir de RPC-uri (atribuire → `tiki_leg_daily` → `count_leg_daily` →
   `leg_segment_load`, pe lună). Fiecare RPC e o tranzacție pe o conexiune oarecare a pool-ului; lacătul de sesiune supraviețuiește
   tranzacției. **Scenariu:** funcția care a luat lacătul cade (ex. `statement_timeout` pe o lună grea — 27,7 s azi, cu trei
   pași noi peste) înainte de `pg_advisory_unlock`, sau deblocarea vine dintr-un alt RPC ajuns pe altă conexiune
   (`pg_advisory_unlock` întoarce `false`, fără eroare) → lacătul rămâne pe conexiunea din pool cât trăiește ea → fiecare
   rulare următoare, inclusiv retry-ul de la 08:00, iese «ocupat» → agregatele îngheață zile la rând, iar lotul de import
   apare `done`. **Corecție:** `pg_try_advisory_xact_lock` **în interiorul unei singure funcții** pe unitatea de lucru (o lună:
   atribuire + cele trei agregate într-o tranzacție), chemată de rută lună cu lună; «ocupat» se întoarce ca rezultat, iar
   luna rămâne în coadă (nr. 1).

3. **high (−2,0) — Golirea `count_refresh_queue` pierde corecturile făcute în timpul refacerii, deci C2-4 nu converge.** GO
   scrie nesincronizat: `DELETE`, apoi câte un `INSERT` pe rând, fiecare o cerere HTTP separată (`numarare/actions.ts:798-815`,
   `:966-980`). Triggerul pune `(data, crm_route_id)` în coadă (firesc cu `ON CONFLICT DO NOTHING` pe acea cheie).
   **Scenariu:** refacerea citește coada (rândul X există) și calculează `count_leg_daily` din intrările de atunci (poate chiar
   pe jumătate șterse); între timp operatorul salvează corectura → triggerul face `ON CONFLICT DO NOTHING` pe X, care încă
   există; refacerea termină și șterge X → corectura nu mai e în coadă și nu intră în agregate până la o altă salvare pe
   aceeași zi, care de obicei nu mai vine (fereastra corectării e scurtă). **Corecție:** golire atomică la început —
   `DELETE FROM count_refresh_queue … RETURNING` în aceeași tranzacție cu recalculul zilelor scoase; sau triggerul face
   `ON CONFLICT DO UPDATE SET cerut_la = now()`, iar refacerea șterge doar `cerut_la <= momentul citirii`. Test: o salvare
   între citire și ștergere → ziua rămâne în coadă.

4. **high (−2,0) — `dep_time` nu e ora din grafic: cheia regulii lunii și a corecturii se fărâmițează.** `451:29` scrie
   `dep_time` ca oră reală; `tiki_label_override` are PK `(route_label, dep_time, direction_tiki, luna)`, iar regula lunii e
   pe «nume + oră + sens». Fapt: 32 de ore distincte pe etichetă într-o lună (max 70). **Scenariu:** ADMIN corectează
   «Chisinau - Lipcani 10:40» pe 09.2026 cu ora pe care o vede pe cursă (ex. 08:07) → corectura prinde o cursă din ~30;
   regula lunii pe (etichetă, oră) are grupuri de 1–2 curse, deci majoritatea nu există pentru cursele fără mașină în grafic
   (26,5 % din bilete, 🔬) → ținta «nelegat < 5 %» pică; pentru 2025 (`eticheta_2026`) cheile din 04.2026 nu se mai potrivesc
   deloc cu orele din 2025. **Corecție:** cheia etichetei = `route_name` normalizat (conține deja ora din grafic: «2:35 Lipcani
   - Chisinau», «Chisinau - Criva/Larga 12:30») + sens; `dep_time` rămâne doar rezervă în pasul 1 (vezi business-logic r3 · 3);
   test: aceeași etichetă cu trei `dep_time` diferite → o singură regulă, o singură corectură.

5. **high (−2,0) — Numitorul «bilete pe plecare» din 2026 stă pe codul de stare Mobilet, a cărui semnificație e presupusă.**
   Convergent cu business-logic r3 · 1, din partea implementării: planul cere `plecari` și `plecari_retrase` în
   `tiki_leg_daily`, dar 🔬 nu are rândul «cod → înțeles», iar implementatorul trebuie să scrie un `CASE state`. Fapt: 4 și 6
   sunt amândouă stări de masă (≈ 40 % / 60 % în fiecare lună), `withdraw_reason` e gol peste tot, cursele cu 0 bilete stau
   mai ales în 6 (2.138 vs 312). **Scenariu:** dacă 6 e tratată ca «retrasă», `plecari` pierde ~60 % (bilete pe plecare
   ×2,5); dacă e tratată ca «efectuată», 2.138 de sesiuni fără bilete devin plecări goale și ies semnale «tai» false.
   **Corecție:** rând în 🔬 cu maparea codurilor (verificată în cabinet pe câteva curse 4 / 6 / 2 / 3 și pe sesiunile
   Numărării `completed`), iar coloana `plecari` definită după comasarea propusă de business-logic r3 · 1; până atunci
   numitorul din 2026 rămâne «zile de circulație», ca istoria.

6. **medium (−1,0) — Cursele «Anulare» ar intra în pasul 1 ca plecări.** 🔬 spune «Anulare (bilete fără cursă)» — fals acum:
   cele 7.644 de bilete au `trip_id`, pe 638 de curse «Anulare N», fiecare cu mașină. Pasul 1 le atribuie pe mașină → aceeași
   mașină are în zi și cursa reală, și cursa «Anulare» → `tiki_leg_daily.plecari` +1, iar «sensul din eticheta TIKI» nu
   există pe «Anulare 3». **Corecție:** `sursa = 'anulare'` în `tiki_trip_attr` (în CHECK); cursa nu intră în `plecari` /
   `locuri`; coridorul/piciorul doar după regula din business-logic r3 · 4; rândul 🔬 corectat.

7. **medium (−1,0) — `tiki_leg_daily` nu poate da totalurile pe surse cerute de pasul 4.** PK `(trip_date, crm_route_id, leg)`
   cere `crm_route_id` NOT NULL, deci cursele nelegate n-au loc în tabelă, iar o zi × picior poate avea curse din surse diferite.
   Egalitatea «Σ bilete pe surse = Σ `tiki_tickets`» ar cere un scan live pe `tiki_tickets` în RPC (> 3 s pe tot intervalul).
   **Corecție:** `sursa` în granulație (PK `(trip_date, crm_route_id, leg, sursa)`) + `tiki_unattr_daily(trip_date,
   route_name, sursa, bilete, lei)` pentru nelegat / Anulare / cele 133 fără cursă, umplute de aceeași funcție lunară.

8. **medium (−1,5) — Refacerea legată la sfârșitul rutei de import, sub `maxDuration = 300`, fără estimare.** O lună costă azi
   până la 27,7 s + 8,3 s (`tiki_deduce_pairs`, `tiki_refresh_agg`); v5 adaugă atribuirea și trei agregate pe lună, plus zilele
   din coadă; fereastra de 8 zile atinge des 2 luni, reimportul `?from=&to=` până la 3 (`MAX_DAYS = 62`), iar nr. 1 adaugă lunile
   cursei (blocul din ianuarie = 2 luni). La depășire Vercel oprește funcția fără `fail()`: lotul rămâne în starea inițială.
   **Corecție:** importul doar pune lunile în coadă; refacerea e un pas separat al workflow-ului (`tiki-mobilet.yml`, al doilea
   `curl` spre o rută de refacere) care golește coada lună cu lună, cu buget (oprire la ~200 s, restul rămâne); jurnal propriu,
   ca un import reușit să nu apară `failed` din cauza refacerii. Măsurarea unei luni (atribuire + agregate) intră în 🔬.

9. **medium (−1,0) — Triggerele pe Numărare: evenimente, chei, legătura cu atribuirea.** (a) `counting_entries` are INSERT și
   DELETE (0 UPDATE) → trigger pe `INSERT OR UPDATE OR DELETE`, cu OLD la ștergere; (b) pe `counting_sessions` doar
   `AFTER UPDATE OF status, crm_route_id, assignment_date, vehicle_id` (altfel cele ~8.500 de UPDATE-uri `locked_by/locked_at`
   umplu coada), cu OLD și NEW când se mută ruta sau ziua; (c) **schimbarea mașinii sesiunii schimbă pasul 1 al atribuirii**,
   deci trebuie pusă și luna în `tiki_refresh_queue`, nu doar ziua în `count_refresh_queue` — altfel corectura mașinii nu
   ajunge niciodată în `tiki_trip_attr`; (d) funcția `SECURITY DEFINER`, `search_path` fix, doar `INSERT … ON CONFLICT`,
   filtrată pe interurban, ca analiza să nu poată opri salvarea operatorului. Costul e mic: o intrare de index pe rând
   (~20 pe salvare), sub triggerul suburban existent.

10. **low (−0,5) — Maparea capetelor biletului pe opriri și cheile rămase.** Normalizarea numelor pe fiecare bilet la fiecare
    refacere e repetată și greu de testat; **corecție:** `tiki_stop_map(name_norm, crm_route_id, leg, stop_order)` refăcută
    doar la schimbarea `interurban_v2_stops`, cu numele ambigue (de două ori pe picior) «nemapat»; `leg_segment_load` PK
    `(crm_route_id, leg, date, stop_order)`; RLS + REVOKE și pe cele două cozi și pe `tiki_label_override`.

Ce e bine și nu se deduce: `tiki_trip_attr` pe cursă e mic și scapă de rescrierea `tiki_tickets`; agregarea întâi pe `trip_id`,
apoi `LEFT JOIN` din curse, e corectă și ieftină (indexuri `tiki_tickets_trip`, `tiki_trips_date` există din 451); costul
triggerului pe scrierile GO e neglijabil; GO rămâne neatins în cod.

Deduceri: 1 (−2,0) · 2 (−2,0) · 3 (−2,0) · 4 (−2,0) · 5 (−2,0) · 6 (−1,0) · 7 (−1,0) · 8 (−1,5) · 9 (−1,0) · 10 (−0,5)
= −15,0 → plafonat la 0.

Scor: 0.0 · Blocante (critical/high): 5
