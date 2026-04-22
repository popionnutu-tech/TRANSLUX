# Audit pentru numărarea pasagerilor — Design

**Data:** 2026-04-22
**Status:** Design în revizuire
**Autor:** Ion Pop (ADMIN_CAMERE)

## Problema

ADMIN_CAMERE trebuie să verifice corectitudinea numărărilor făcute de operatori. În prezent, după ce un operator termină o cursă (status `completed`), nu există un mecanism prin care admin-ul să deschidă aceeași cursă, să numere independent și să compare rezultatul cu al operatorului. Este nevoie de un "audit" — o a doua numărare paralelă, stocată separat, afișată alături de cea originală.

## Obiective

1. ADMIN_CAMERE (și ADMIN) pot lansa un audit pe orice cursă cu status `completed`, atât `interurban` cât și `suburban`.
2. Auditul este o numărare completă, paralelă — aceeași structură de date ca numărarea originală (pe opriri, cu short passengers pentru interurban / cicluri pentru suburban).
3. Numărarea originală a operatorului nu este afectată niciodată — auditul se stochează separat.
4. Auditul este "orb": admin nu vede cifrele operatorului în timpul numărării. Comparația apare abia după salvare.
5. Dacă auditul este refăcut, versiunea anterioară este suprascrisă (o singură versiune de audit pe sesiune).
6. În listă de curse, coloana `Sumă (2 tarife)` afișează ambele sume: `1250 lei / 1230 lei (audit)`.

## Non-obiective

- Istoric multiplu al auditurilor (overwrite la refacere — Q4:B).
- Audit pe curse în desfășurare (doar `completed` — Q3:A).
- Editarea/ștergerea numărării originale a operatorului de către admin.

## Model de date

### Extindere `counting_sessions`

Câmpuri noi:

```sql
ALTER TABLE counting_sessions
  ADD COLUMN audit_status VARCHAR(20) CHECK (audit_status IN ('new', 'tur_done', 'completed')),
  ADD COLUMN audit_tur_total_lei INT,
  ADD COLUMN audit_retur_total_lei INT,
  ADD COLUMN audit_tur_single_lei INT,
  ADD COLUMN audit_retur_single_lei INT,
  ADD COLUMN audit_operator_id UUID REFERENCES admin_accounts(id),
  ADD COLUMN audit_locked_by UUID REFERENCES admin_accounts(id),
  ADD COLUMN audit_locked_at TIMESTAMPTZ,
  ADD COLUMN audit_last_edited_at TIMESTAMPTZ;
```

- `audit_status = NULL` → audit nu a fost pornit.
- `audit_status = 'new'` → admin a deschis form-ul, dar nu a salvat încă.
- `audit_status = 'tur_done'` → tur salvat, retur pending.
- `audit_status = 'completed'` → ambele direcții salvate.
- `audit_operator_id` — cine a creat auditul (primul ADMIN care l-a pornit).
- `audit_locked_by` / `audit_locked_at` — blocaj curent (doar un admin poate audita în același timp aceeași cursă).

### Tabele noi paralele

```sql
CREATE TABLE counting_audit_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES counting_sessions(id) ON DELETE CASCADE,
  direction VARCHAR(5) NOT NULL CHECK (direction IN ('tur', 'retur')),
  stop_order INT NOT NULL,
  stop_name_ro VARCHAR(100) NOT NULL,
  km_from_start DECIMAL(8,2) NOT NULL DEFAULT 0,
  total_passengers INT NOT NULL DEFAULT 0,
  alighted INT NOT NULL DEFAULT 0,
  schedule_id INT REFERENCES crm_route_schedules(id),  -- suburban
  cycle_number INT,                                     -- suburban
  alt_driver_id UUID REFERENCES drivers(id),            -- suburban
  alt_vehicle_id UUID REFERENCES vehicles(id),          -- suburban
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_counting_audit_entries_session ON counting_audit_entries(session_id, direction);
CREATE INDEX idx_counting_audit_entries_suburban
  ON counting_audit_entries(session_id, schedule_id, cycle_number)
  WHERE schedule_id IS NOT NULL;

CREATE TABLE counting_audit_short_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES counting_audit_entries(id) ON DELETE CASCADE,
  boarded_stop_order INT NOT NULL,
  boarded_stop_name_ro VARCHAR(100) NOT NULL,
  km_distance DECIMAL(8,2) NOT NULL,
  passenger_count INT NOT NULL DEFAULT 1,
  amount_lei DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Structura este identică cu `counting_entries` / `counting_short_passengers` (inclusiv câmpurile suburban) — astfel codul existent pentru încărcare/salvare poate fi refolosit cu minimum de parametrizare.

**De ce tabele separate, nu un `type` column pe cele existente:** tabela `counting_entries` are UNIQUE constraint `(session_id, direction, stop_order)` care s-ar rupe. În plus, toate view-urile și rapoartele analitice existente (`sales_analytics`, `session_metrics_directional`, `passenger_metrics`) se bazează pe `counting_entries` — un `type` column ar forța filtrarea în toate locurile. Separarea păstrează rapoartele intacte.

## Arhitectură

### Componente

**Back-end (server actions în `numarare/actions.ts`):**
- `lockAudit(crmRouteId, date)` — creează rezervarea sesiunii de audit (seteaza `audit_locked_by`, `audit_operator_id` dacă NULL, `audit_status='new'` dacă NULL).
- `unlockAudit(sessionId)` — eliberează `audit_locked_by`/`audit_locked_at`.
- `saveAuditDirection(sessionId, direction, entries, totalLei, totalLeiSingle)` — interurban: șterge audit entries vechi, inserează noile, updatează `audit_tur/retur_total_lei` + `audit_status`.
- `saveSuburbanAuditCycle(sessionId, scheduleId, direction, cycleNumber, entries, totalLei, altDriverId, altVehicleId)` — suburban.
- `loadAuditEntries(sessionId, direction)` — pentru continuarea auditului (dacă admin închide fără să termine ambele direcții).
- `loadSuburbanAuditEntries(sessionId)` — suburban.
- `getAuditComparison(sessionId)` — returnează pereche `(operator_entries, audit_entries)` pentru afișarea tabelei de comparație.

**Front-end:**
- `NumarareClient.tsx` — în coloana "Status" și/sau lângă butonul "Deschide", pentru rolurile `ADMIN`/`ADMIN_CAMERE` și `session_status='completed'`, apare butonul **`Audit`** (sau `Refă audit` dacă `audit_status='completed'`).
- `CountingForm.tsx` — prop nou `mode: 'normal' | 'audit'`. În mod `audit`:
  - Încarcă entries din `counting_audit_entries` în loc de `counting_entries`.
  - Salvează via `saveAuditDirection`.
  - Titlul form-ului indică vizibil "AUDIT" (stil roșu/evidențiat).
  - NU afișează cifrele operatorului (audit orb).
- `SuburbanCountingForm.tsx` — identic, prop `mode: 'normal' | 'audit'`.
- **Componentă nouă** `AuditComparisonView.tsx` — afișată automat după ce retur audit este salvat (sau la click pe un link "Vezi comparația" pe cursele cu `audit_status='completed'`). Arată:
  - Pentru interurban: tabel cu coloane `Stop | Operator: total/alighted/short | Audit: total/alighted/short | Δ`. Rândurile cu diferențe colorate roșu.
  - Pentru suburban: grupare pe `(schedule_id, cycle_number)`, același tabel per ciclu.
  - Sume totale: operator vs audit, diferență în lei.
- **Afișare în listă** (`NumarareClient`): coloana `Sumă (2 tarife)` — dacă `audit_tur_total_lei`/`audit_retur_total_lei` sunt non-null, se afișează `{dualTotal} lei / {auditTotal} lei (audit)`. Dacă există diferență, se adaugă un mic indicator (ex: badge `Δ` colorat).

### Flux de date

1. Admin intră pe `/numarare`, filtrează pe dată, vede cursele.
2. Pentru o cursă `completed`, în coloana acțiuni vede buton `Audit`.
3. Click → `lockAudit` → redirect către `CountingForm` cu `mode='audit'`.
4. Admin numără tur → salvează → `saveAuditDirection('tur', ...)` → `audit_status='tur_done'`.
5. Admin numără retur → salvează → `saveAuditDirection('retur', ...)` → `audit_status='completed'` + `audit_retur_total_lei` setat.
6. După salvare retur, UI redirecționează către `AuditComparisonView` pentru acea sesiune (sau afișează direct comparația în același ecran înainte de return la listă).
7. În listă, la revenire, coloana suma afișează ambele valori.

### Edge cases

- **Admin abandonează auditul la mijloc** (salvează tur, nu și retur) → `audit_status='tur_done'`. La re-deschidere butonul devine "Continuă audit", form-ul încarcă tur-ul deja introdus, retur gol.
- **Refă audit de la zero** (Q4:B, overwrite) → la click pe "Refă audit" cu `audit_status='completed'`: dialog de confirmare, apoi se setează `audit_status='new'`, se șterg toate `counting_audit_entries` + `counting_audit_short_passengers` pentru sesiune, se resetează `audit_tur/retur_total_lei`.
- **Doi admini simultan** → `audit_locked_by` previne deschiderea simultană. Al doilea admin vede `🔒 {email}` în loc de butonul Audit.
- **Oprire schimbată de admin în settings după numărare** → auditul folosește aceeași listă de opriri ca originalul (snapshot la momentul auditului via `getRouteStops` / `getSuburbanSchedule` cu data sesiunii).
- **Tarif schimbat între numărări** → ambele sume se calculează cu tariful valabil la `assignment_date` al sesiunii (deja implementat via `getTariffConfig(date)`).

## Testare

**Manual:**
1. Login ca ADMIN_CAMERE, navigare la `/numarare` pe o dată cu curse `completed`.
2. Click `Audit` pe o cursă interurban → form se deschide gol, titlul indică "AUDIT".
3. Introducere date tur diferite față de operator → salvare → status `tur_done`.
4. Închide form, reîntoarce → butonul devine "Continuă audit", tur deja populat.
5. Finalizare retur → apare `AuditComparisonView` cu diferențe evidențiate.
6. În listă, coloana sumei arată `X lei / Y lei (audit)`.
7. Repetă pentru o cursă suburban.
8. Click "Refă audit" → dialog → confirmă → totul resetat.
9. Deschide aceeași cursă dintr-un alt cont admin → vezi că e blocată.

**Automat (Vitest):**
- Test pentru `lockAudit` — prima deschidere setează `audit_operator_id`, a doua de alt admin returnează eroare cât timp e locked.
- Test pentru `saveAuditDirection` — overwrite funcțional, totalurile recalculate corect.
- Test pentru `getAuditComparison` — returnează perechi corect, inclusiv cazul când operator sau audit n-are entry pe o oprire.

## Securitate / RLS

- Server actions verifică `requireRole(..., 'ADMIN', 'ADMIN_CAMERE')` — inaccesibil pentru `OPERATOR_CAMERE`.
- RLS pe `counting_audit_entries` / `counting_audit_short_passengers`: doar ADMIN și ADMIN_CAMERE pot SELECT/INSERT/UPDATE/DELETE (operatorii nu pot vedea auditurile).
- `audit_tur_total_lei` / `audit_retur_total_lei` sunt dezvăluite în `getRoutesForDate` numai dacă `session.role IN ('ADMIN', 'ADMIN_CAMERE')` (acelasi strip-financial existent).

## Scope pentru plan

Plan de implementare (fazat):

1. **Migrație BD:** câmpuri în `counting_sessions` + tabele `counting_audit_entries` / `counting_audit_short_passengers` + RLS.
2. **Server actions:** `lockAudit`, `unlockAudit`, `saveAuditDirection`, `loadAuditEntries`, `saveSuburbanAuditCycle`, `loadSuburbanAuditEntries`, `getAuditComparison`, `resetAudit` (pentru refă).
3. **Refactor `CountingForm`:** introducere prop `mode`, ajustare încărcare/salvare. Fără duplicare — aceeași logică de calcul, alt data source.
4. **Refactor `SuburbanCountingForm`:** similar.
5. **`NumarareClient`:** buton Audit, afișare dublă a sumei, indicator Δ.
6. **`AuditComparisonView`:** componentă nouă pentru afișarea comparației.
7. **Testare manuală + Vitest.**
