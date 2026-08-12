# Grafic uzine — grilă săptămânală (desktop + mini app)

**Data:** 2026-08-12 · **Aprobat de:** Ion (interviu + mockup v2 în Orca)

## Problema

Alexei (managerul celor 4 uzine: Draxelmaier Bălți, SEBN Orhei, LEAR Ungheni, LEAR Florești)
trebuie să introducă graficul săptămânal de atribuiri mașină+șofer pe curse de uzină — similar
graficului interurban al dispecerului, dar cu atribuiri automate din șablonul săptămânal și cu
schimbări punctuale pe zi (ieri/azi/mâine) sau pe mai multe zile din săptămână. Lucrează pe
desktop (panoul web) și face schimbări rapide din Telegram Mini App.

TROX_BRICENI rămâne pe fluxul existent (fără șablon, la dispecer) — decizia din 24.07.

## Decizii de design (din interviu)

| Întrebare | Decizie |
|---|---|
| Desktop | Pagină nouă în panoul web admin, NU doar Telegram Desktop |
| Schimbare multi-zi | Alexei alege de fiecare dată: «doar zilele astea» sau «și în șablon (permanent)» |
| Orizont | Doar săptămâna curentă (L–D), fără navigare între săptămâni |
| Conținut celulă | Mașină + șofer, ambele editabile |
| Trox | Exclus din grilă |
| Șofer permanent | Nu — șoferul se schimbă doar pe zile; legătura permanentă șofer↔mașină rămâne în /lde/atribuiri (ADMIN) |
| Arhitectură | V1: săptămâna se materializează integral la deschiderea paginii |
| Mașină fără șofer | Interzis — mașina atribuită cere mereu șofer (feedback mockup) |
| Pickere | Căutare instant (plăci/nume) sus, filtrare de la prima tastă (feedback mockup) |
| Layout | O uzină pe ecran, tab-uri sus (feedback mockup) |

## Arhitectură

**Fără tabele noi.** Se refolosește integral modelul existent:

- `lde_weekly_template` = intenția recurentă (weekday 1–7) — sursa atribuirilor auto.
- `lde_atribuiri_zilnice` = planul real pe date concrete; materializare prin
  `ensureDayMaterialized` (idempotent, insert-only, nu atinge editările).
- La deschiderea paginii: materializare pentru toate cele 7 zile L–D ale săptămânii curente
  (Europe/Chisinau). Consecință intenționată: șablonul afectează doar săptămânile viitoare;
  grila = planul real, punct.
- Editările folosesc logica de status existentă: zi trecută → `modificat_reactiv`,
  azi/viitor → `modificat_proactiv`. Verificarea GPS de la 06:30 (crontab VPS) rămâne
  neschimbată și funcționează peste rândurile introduse din grilă.
- Rândurile de uzină NU ating `daily_assignments` — contractul cu cronul de 20:00 nu e implicat.

### Migrația 251 (singura schimbare de schemă)

Editările din web vin de la `admin_accounts`, dar auditul existent arată spre `users` (Telegram):

- `lde_atribuiri_zilnice.changed_by_admin uuid REFERENCES admin_accounts(id) ON DELETE SET NULL`
- `lde_weekly_template.updated_by_admin uuid REFERENCES admin_accounts(id) ON DELETE SET NULL`

Editările din mini app completează `changed_by` (ca acum); cele din web `changed_by_admin`.

### Acces

- Rol nou `UZINE` în `admin_accounts` (pe modelul rolului `GRAFIC`): vede DOAR pagina
  `/lde/grafic-uzine` (sidebar redus la ea + gardă în page.tsx). ADMIN vede tot.
- Cont nou pentru Alexei cu rolul `UZINE`.
- Mini App: neschimbat — `MANAGER_LDE` + `lde_manager_directions` (Alexei va fi promovat
  când activează invite-ul, flux deja stabilit).

## Pagina web `/lde/grafic-uzine` (apps/admin, grupul LDE din sidebar)

- **Header:** titlu + intervalul săptămânii («Luni 10.08 – Duminică 16.08») + legenda statusurilor.
- **Tab-uri uzine:** o uzină pe ecran; doar uzinele `active AND has_weekly_template`.
- **Grilă:** rânduri = rută×schimb (eticheta existentă «R2 · Bălți–Sadovoe · S2»),
  coloane = L–D cu datele, coloana de azi evidențiată. Zilele în care uzina nu lucrează
  (works_saturday/works_sunday) — gri, needitabile.
- **Celulă:** placa + numele scurt al șoferului; fundal după status (paleta din mini app):
  gri `planificat`, portocaliu `modificat_*`, verde `confirmat_*`, roșu `nepotrivire`
  (nota GPS la hover), gri deschis `fara_date_gps`, chihlimbariu «—» fără mașină.

### Popup editare (click pe celulă)

- **Mașina:** căutare instant sus (filtrare plăci de la prima tastă, potrivire evidențiată);
  fără căutare: default-ul din șablon primul (marcat), apoi mașinile direcției, apoi restul
  (logica `vehiclesForPicker`).
- **Șoferul (obligatoriu):** căutare instant; la alegerea mașinii, șoferul titular
  (din `lde_active_assignments`, fallback-urile din `ensureDayMaterialized`) se completează
  automat; poate fi doar înlocuit, nu scos. Scoaterea mașinii (celulă golită) curăță și șoferul.
  Salvarea cu mașină fără șofer e blocată (UI + server).
- **Zilele:** chips L–D multi-select; preselectată ziua clicată; zilele trecute nu se
  preselectează dar pot fi bifate (corecții); zilele nelucrătoare ale uzinei dezactivate.
- **Checkbox «Salvează și în șablon (permanent)»** — activ doar când se schimbă mașina;
  scrie `setTemplateCell` pe weekday-urile zilelor bifate (afectează săptămânile viitoare).
- **Butonul Salvează** afișează numărul de zile («Salvează · 2 zile»).
- **Celulă `nepotrivire` (trecut):** nota GPS + butoanele «Confirmă manual»
  (`confirmaManual`) și «Corectează…» (deschide editarea normală).

### Server actions noi (în pagina nouă, peste `lib/atribuiri/core.ts`)

- `getSaptamana(uzinaId)` — materializează cele 7 zile (loop `ensureDayMaterialized`,
  idempotent) și întoarce rândurile săptămânii cu etichete (variantă pe interval a `listZi`,
  extrasă în core pentru reutilizare).
- `atribuieMulti({ factoryRouteId, shiftNumber, dates[], vehicleId, driverId, siInSablon })` —
  găsește rândurile după `(date, route_key)`, aplică `vehicle_id`/`driver_id` rând cu rând cu
  regulile de status existente; impune invariantul mașină⇒șofer; dacă `siInSablon`, face
  `setTemplateCell` per weekday. Audit: `changed_by_admin`.
- `confirmaManualAdmin(rowId)` — echivalentul web al `confirmaManual`.

Autorizare: `verifySession()` + rol `ADMIN`/`UZINE`. Accesul DB doar service-role (ca acum).

## Mini App (schimbări minime; fluxul pe o zi rămâne neatins)

1. **Căutare instant** în `VehiclePicker` și `SoferPicker` (același comportament ca pe desktop).
2. **Multi-zi opțional:** după o schimbare aplicată pe ziua curentă, sub card apare discret
   «Aplică și pe alte zile?» cu chips L–D + buton Aplică (apelează același endpoint multi-zi).
   Dacă e ignorat, nimic în plus nu se întâmplă.
3. **Invariantul mașină⇒șofer** se aplică și aici: la alegerea mașinii, șoferul titular se
   completează automat; scoaterea șoferului cu mașină atribuită e blocată (dispare
   `allowRemove` la uzine când `vehicle_id` e setat); golirea mașinii curăță șoferul.
4. Editorul de șablon din mini app rămâne cum e (permanentul are ecranul lui).

API: un endpoint nou `/api/atribuiri/atribuie-multi` (auth `authAtribuiri` + `canDirection`),
refolosit conceptual de server action-ul web (aceeași funcție core).

## Cazuri-limită asumate

- Luni, «ieri» = duminica săptămânii trecute — nu e în grilă; corecția rară se face din
  mini app (acceptă orice dată).
- Două persoane editează simultan → ultima scriere câștigă (ca acum în mini app).
- Materializarea a 7 zile la load = ~40 de query-uri server-side per deschidere de pagină —
  acceptat pentru o pagină cu 1–2 utilizatori; optimizare doar dacă devine lentă.
- Verificarea GPS marchează și zilele viitoare deja materializate? Nu — verifică doar ziua
  de ieri, comportament neschimbat.

## Testare

- Unit (vitest, modelul `validation.test.ts`): maparea date→weekday pentru `atribuieMulti`,
  invariantul mașină⇒șofer (server), scrierea în șablon doar pe weekday-urile bifate.
- Manual E2E: grilă → schimbare pe 2 zile → vizibilă în mini app pe zilele respective;
  schimbare cu «și în șablon» → săptămâna viitoare materializează noua mașină;
  nepotrivire → Confirmă manual din grilă.
