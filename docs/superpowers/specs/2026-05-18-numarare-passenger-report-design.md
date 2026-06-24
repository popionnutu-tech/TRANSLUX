# Raport pasageri numărare — Design Spec

**Data:** 2026-05-18

## Problema

La numărare se colectează date detaliate pe fiecare oprire, dar nu există un raport centralizat care să arate câți oameni au plecat din Chișinău pe fiecare rută spre nord. Raportul trebuie să fie accesibil pe pagina `/reports`, alături de Transport și SMM.

## Cerințe

1. **Sursa datelor:** `counting_entries` (direction=retur, stop_order=1, total_passengers) din `counting_sessions` (status=completed), doar rute `crm_routes` cu route_type=interurban.
2. **Locație:** pagina `/reports`, nou tab „Numărare" (lângă Transport / SMM).
3. **Mod zilnic:** o singură dată → tabel cu maršrute, ora, pasageri.
4. **Mod săptămânal:** perioadă → tabel cu maršrute × zile ale săptămânii (Lun–Dum), media pe zi de săptămână.
5. **Filtre:** doar dată (zilnic) sau perioadă (săptămânal).
6. **Doar interurban** (fără suburban).

## Sursa datelor

Join: `counting_entries` → `counting_sessions` → `crm_routes`

Filtre fixe:
- `counting_entries.direction = 'retur'` (Chișinău → Nord)
- `counting_entries.stop_order = 1` (prima oprire = Chișinău)
- `counting_sessions.status = 'completed'`
- `crm_routes.route_type = 'interurban'`
- `crm_routes.active = true`

Valoare: `counting_entries.total_passengers` = pasageri urcați la Chișinău.

## UI — Mod zilnic

### Filtre
- Buton toggle: `Zilnic | Săptămânal`
- Câmp dată (un singur date picker)

### Tabel

| Ruta | Ora | Pasageri |
|------|-----|----------|
| Bălți | 08:00 | 32 |
| Bălți | 10:40 | 28 |
| Edineț | 06:00 | 18 |
| Briceni | 14:00 | 22 |
| **Total** | | **100** |

- Rândul = rută interurbană activă din `crm_routes`
- Coloana „Ruta" = `dest_to_ro`
- Coloana „Ora" = `time_nord`
- Sortare: după `time_nord` (crescător)
- Dacă nu există sesiune completă pentru rută/dată → celula „—"
- Rând **Total** în footer: suma pasagerilor

## UI — Mod săptămânal

### Filtre
- Buton toggle: `Zilnic | Săptămânal`
- Două câmpuri dată: „De la" / „Până la"

### Tabel

| Ruta | Ora | Lun | Mar | Mie | Joi | Vin | Sâm | Dum | Media |
|------|-----|-----|-----|-----|-----|-----|-----|-----|-------|
| Bălți | 08:00 | 23.4 | 21.2 | 25.1 | 19.8 | 30.2 | 15.0 | — | 22.5 |
| Edineț | 06:00 | 18.0 | 17.5 | ... | ... | ... | ... | — | ... |
| **Total** | | ... | ... | ... | ... | ... | ... | ... | ... |

- Valoare celulă = media `total_passengers` pe toate zilele respective din perioadă (ex: media tuturor zilelor de luni)
- Rotunjire: o zecimală (ex: 23.4)
- Dacă nu există date pentru o zi (ex: nicio duminică cu sesiune completă) → „—"
- Coloana **Media** = media generală pe rută (peste toate zilele cu date)
- Rând **Total** în footer = suma mediilor pe rute, per zi de săptămână

## Integrare în `/reports`

- Butonul existent `Transport | SMM` devine `Transport | SMM | Numărare`
- URL param: `reportType=numarare`
- La selectare se încarcă componenta `NumarareReportsClient`
- Acces: oricine are sesiune validă (`verifySession()`)

## Backend (server actions)

Fișier nou: `apps/admin/src/app/(dashboard)/reports/numarare-report-actions.ts`

### `getNumarareDaily(date: string)`

Returnează: `Array<{ crm_route_id: number; dest_to_ro: string; time_nord: string; passengers: number | null }>`

Query:
1. Toate rutele active interurbane din `crm_routes`
2. Left-join `counting_sessions` cu `assignment_date = date`, `status = 'completed'`
3. Left-join `counting_entries` cu `direction = 'retur'`, `stop_order = 1`
4. Extragere `total_passengers` (null dacă nu există sesiune completă)
5. Sortare după `time_nord`

Toate rutele active interurbane apar mereu, chiar și fără date — cu `passengers: null`.

### `getNumarareWeekly(dateFrom: string, dateTo: string)`

Returnează: `Array<{ crm_route_id: number; dest_to_ro: string; time_nord: string; dayOfWeek: number; avgPassengers: number }>`

Query:
1. Toate rutele active interurbane din `crm_routes`
2. `counting_sessions` cu `assignment_date` între `dateFrom` și `dateTo`, `status = 'completed'`
3. `counting_entries` cu `direction = 'retur'`, `stop_order = 1`
4. Grupare pe `crm_route_id` × `day_of_week(assignment_date)`
5. Calcul medie `total_passengers` per grupă
6. Sortare după `time_nord`

Rute fără nicio sesiune în perioadă nu apar în rezultat — UI-ul le afișează cu „—" pe fiecare zi.

`day_of_week`: ISO standard (1=Lun, 7=Dum), derivat din `assignment_date` în JS.

## Componente frontend

### `NumarareReportsClient.tsx`
- Props: `data` (daily sau weekly, în funcție de mod), `viewMode`, `date`, `dateFrom`, `dateTo`
- Navigare prin URL params (ca în ReportsClient): `viewMode`, `date`, `dateFrom`, `dateTo`
- `page.tsx` decide ce server action apelează pe baza `viewMode` din URL params și transmite doar datele relevante
- Zilnic: un date picker + tabel simplu
- Săptămânal: două date picker-e + tabel pivot Lun–Dum

## Structura fișierelor

```
apps/admin/src/app/(dashboard)/reports/
├── actions.ts                       (existent — Transport)
├── smm-actions.ts                   (existent — SMM)
├── numarare-report-actions.ts       (NOU — Numărare backend)
├── ReportsClient.tsx                (existent — Transport UI)
├── SmmReportsClient.tsx             (existent — SMM UI)
├── NumarareReportsClient.tsx        (NOU — Numărare UI)
├── page.tsx                         (modificat — adăugat tab Numărare)
└── PassengersChart.tsx              (existent)
```
