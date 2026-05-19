# Nomenclator unic — rute interurban (interurban_v2)

Lucru în desfășurare: unificarea nomenclatorului de rute interurbane TRANSLUX într-un singur sistem care va fi folosit atât pe **site** cât și în **numerar (CRM)**.

## Scopul

- Verifica fiecare tarif (perechea tur/retur)
- Stabili lista corectă de opriri pentru fiecare tarif (toate rutele pe un tarif au aceleași opriri)
- Stabili km corect pe baza autorizațiilor oficiale
- Asigna fiecare rută la tariful potrivit
- Migrarea finală la o singură bază de date `interurban_v2_*` (Supabase)
- Ștergerea structurilor vechi (`crm_routes`, `routes`, `route_km_pairs`, `crm_stop_prices`)

## Status pe tarife

| # | Tarif | Nume | Status | Rute | Opriri | Km total | Document |
|---|---|---|---|---|---|---|---|
| 1 | **106/105** | **Criva Direct** | ✅ FINALIZAT | 14 | 41 | 278.5 | [tarif-106-105-criva-direct.md](./tarif-106-105-criva-direct.md) |
| 2 | **98/116** | **Criva via Corjeuți** | ✅ FINALIZAT | 2 | 45 | 298.5 | [tarif-98-116-criva-via-corjeuti.md](./tarif-98-116-criva-via-corjeuti.md) |
| 3 | **104/117** | **Criva via Larga** | ✅ FINALIZAT | 4 (tur) / 1 (retur) | 42 | 288.5 | [tarif-104-117-criva-via-larga.md](./tarif-104-117-criva-via-larga.md) |
| 4 | **110/109** | **Lipcani via Rîșcani** | ✅ FINALIZAT | 2 | 44 | 295 | [tarif-110-109-lipcani-via-riscani.md](./tarif-110-109-lipcani-via-riscani.md) |
| 5 | **111/118** | **Lipcani via Viișoara** | ✅ FINALIZAT | 1 | 39 | 266 | [tarif-111-118-lipcani-via-viisoara.md](./tarif-111-118-lipcani-via-viisoara.md) |
| 6 | **115/114** | **Corjeuti/Edinet** | ✅ FINALIZAT | 2 | 33 | 242 | [tarif-115-114-corjeuti-edinet.md](./tarif-115-114-corjeuti-edinet.md) |
| 7 | **122/120** | **Otaci/Ocnița** | ✅ FINALIZAT | 3 | 42 (+6 Briceni entry) | 266 (Otaci) / 240 (Ocnița) / 287 (Briceni) | [tarif-122-120-otaci-ocnita.md](./tarif-122-120-otaci-ocnita.md) |

## Reguli de bază

1. **O pereche tur/retur = un singur tip de rută** (același drum în ambele sensuri)
2. **Aceleași opriri** pentru toate rutele pe același tarif — nicio excepție
3. **Km tur = km retur** (km diferă doar dacă autobuzul merge prin drumuri diferite)
4. În **numerar**, toate rutele pe un tarif apar cu lista completă de opriri, începând de la prima oprire a tarifului (ex: Criva Vama pentru 106/105), indiferent de unde pleacă fizic autobuzul
5. **Numele rutei** rămâne cum este (ex: "Lipcani - Chișinău") chiar dacă în numerar apare cu Criva Vama în față — pasagerul cumpără bilet până la Lipcani
6. **Etalon km** = autorizația oficială; opririle intermediare (care nu sunt în autorizație) se distribuie proporțional între punctele de etalon

## Structura DB nouă (planificată)

Prefix: **`interurban_v2_`**

```
interurban_v2_tariffs
├─ id
├─ name              "Criva Direct"
├─ tariff_tur_id     106
├─ tariff_retur_id   105
├─ direction_tur     "Criva Vama → Chișinău"
├─ direction_retur   "Chișinău → Criva Vama"
├─ total_km          278.5

interurban_v2_stops
├─ tariff_id         → interurban_v2_tariffs.id
├─ stop_order        1..41
├─ stop_name_ro
├─ stop_name_ru
├─ km_from_start

interurban_v2_routes
├─ tariff_id         → interurban_v2_tariffs.id
├─ crm_route_id      → crm_routes.id (link la rutele existente)
```

## Politica oficială

**De acum înainte se folosește DOAR `interurban_v2_*`** pentru rute interurban. Toate structurile vechi (Supabase + cod local) vor fi șterse.

### Tabele Supabase de șters (după migrare)
- `routes` (vechi site)
- `crm_routes` (vechi numerar)
- `route_km_pairs`
- `crm_stop_prices`
- `crm_stop_prices_backup_pre_etolon`
- `crm_stop_fares`
- `stop_prices`
- `route_prices`
- `price_nomenclator`

### Cod local de șters/refactorizat
- `apps/web/src/app/(public)/actions.ts` — referințe la `crm_routes` → migrare la `interurban_v2_*`
- `apps/admin/src/app/(dashboard)/routes/actions.ts` — referințe la `routes` → migrare
- `apps/admin/src/app/(dashboard)/trips/actions.ts` — referințe la `routes`
- `apps/admin/src/app/(dashboard)/reports/actions.ts` — referințe la `routes`
- `apps/web/src/lib/assignments.ts` — referințe la `crm_route_id`
- `apps/bot/src/services/db.ts` — referințe la `routes`

## Următorii pași

### Faza 1: Pregătirea structurii noi ✅ FINALIZAT
1. ✅ Toate cele 7 tarife documentate (7 fișiere `tarif-*.md`)
2. ✅ Tabelele `interurban_v2_*` create în Supabase
3. ✅ Seed: 7 tarife, 292 opriri (286 main + 6 briceni_entry), 28 rute
4. ✅ Verificare: toate datele corecte
5. ✅ View-uri compatibilitate create:
   - `v_interurban_v2_km_pairs` — km calculat între orice 2 opriri (înlocuiește `route_km_pairs`)
   - `v_interurban_v2_route_stops` — listă opriri per rută (înlocuiește `crm_stop_prices`)
   - `v_interurban_v2_summary` — rezumat tarife

**Status DB după Faza 1:** Noile tabele `interurban_v2_*` + view-uri coexistă cu cele vechi. Ambele funcționează în paralel. Aplicațiile actuale (web/admin/bot) folosesc tabelele vechi — nimic nu e stricat.

### ⚠️ Blocker identificat pentru Faza 2

`interurban_v2_stops` are **doar km**, dar nu are **ore plecare/sosire** per oprire (`hour_from_nord`, `hour_from_chisinau`). Aceste ore sunt critice pentru afișarea orarului pe site. Sunt stocate în `crm_stop_prices` (vechi).

**Decizie necesară înainte de Faza 2:**
- Opțiune A: Adaugă coloane `hour_from_start` și `hour_from_end` în `interurban_v2_stops` (sau tabel separat `interurban_v2_route_stop_times`)
- Opțiune B: Păstrăm `crm_stop_prices` doar pentru ore, dropăm km/preț din ea
- Opțiune C: Generăm orele automat din `time_nord`/`time_chisinau` + km folosind viteză medie

### Faza 2: Migrarea codului (în curs)

**⚠️ Avertisment:** Sunt 22 tabele Supabase care depind de `crm_route_id` ca FK (assignments, sales, analytics, daily_logs, etc.) și 42 fișiere cod care fac referință la tabelele vechi. Migrarea trebuie făcută cu testare la fiecare pas.

#### Faza 2a — Refactor citiri `route_km_pairs` ✅ FINALIZAT
Migrate la `v_interurban_v2_km_pairs`:
- ✅ `apps/web/src/app/(public)/actions.ts` (getPopularPrices + searchTrips)
- ✅ `apps/admin/src/app/api/voice-tools/get-price/route.ts`
- ✅ `apps/admin/src/lib/trips-search.ts`
- ✅ `apps/admin/src/lib/update-prices.ts`

Toate cele 3 aplicații (web, admin, bot) compilează fără erori după migrare.

#### Faza 2b — Refactor citiri `crm_stop_prices` (în curs)
- ✅ `apps/admin/src/app/(dashboard)/numarare/actions.ts` (getRouteStops) — migrat la `interurban_v2_stops`
- ⏳ `getSuburbanSchedule` — folosește `crm_stop_prices.id` ca FK pentru rute suburbane (NU interurban) — rămâne pe crm_stop_prices

**Decizie:** `crm_stop_prices` rămâne pentru rutele suburbane (au sistem propriu de schedule). Doar opririle pentru rute interurbane se mută la `interurban_v2_stops`.

#### Faza 2b — Migrarea FK-urilor
- Adaugă coloana `interurban_v2_route_id` în tabelele dependente (driver_assignments, daily_z_reports, trips, etc.)
- Backfill: pentru fiecare rând, găsește `interurban_v2_routes.id` corespunzător prin `crm_route_id`
- Refactorizează codul să folosească noul FK
- După toate testele OK, drop coloana `crm_route_id`

#### Faza 2c — Operațiunile (scriere)
Fișiere care fac UPDATE/INSERT pe `crm_routes`:
- Admin `routes/actions.ts` (CRUD rute)
- Voice tools

#### Faza 2d — Bot
- `apps/bot/src/services/db.ts` — refactor să citească din `interurban_v2_*`

### Faza 3: Curățarea (parțial finalizată)

#### Drop-uri efectuate ✅
- ✅ `route_km_pairs` — înlocuită complet de `interurban_v2_stops` + `v_interurban_v2_km_pairs`
- ✅ `crm_stop_prices_backup_pre_etolon` — backup nefolosit
- ✅ `counting_sessions_backup_pre_etolon` — backup nefolosit
- ✅ `crm_stop_km_raw` — date raw import, nu mai sunt necesare

#### Scripturi locale șterse ✅
- ✅ `scripts/fix-corrupted-km.mjs`
- ✅ `scripts/import-km-prices.mjs`
- ✅ `scripts/import-preturi-b-km.mjs`
- ✅ `scripts/import-preturi-km.mjs`
- ✅ `scripts/import-remaining.mjs`
- ✅ `scripts/debug-km-excel.mjs`
- ✅ `scripts/output/fix-corrupted-km.sql`

#### Rămas pentru viitor (necesită refactor cod mai mult)
- `crm_stop_prices` (km columns) — încă folosit pentru rute suburbane (schedule prin `crm_route_schedule_stops`)
- `crm_stop_fares` — folosit pentru ore plecare/sosire per stop per rută (opțiunea B reținută)
- `crm_routes` — operațional FK target pentru 22 tabele (assignments, sales, analytics)
- `routes` (vechi web) — folosit de admin trips/routes/reports și bot
- `price_nomenclator` — folosit pentru istoricul prețurilor

**Regulă strictă:** Nu se șterge nimic până când toate aplicațiile (web, admin, bot) nu folosesc exclusiv `interurban_v2_*` și sunt verificate că funcționează corect.

## Verificări TypeScript ✅

Toate cele 3 aplicații compilează fără erori după migrare:
- ✅ `apps/web` — `npx tsc --noEmit`
- ✅ `apps/admin` — `npx tsc --noEmit`
- ✅ `apps/bot` — `npx tsc --noEmit`
