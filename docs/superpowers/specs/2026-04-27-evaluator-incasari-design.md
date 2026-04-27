# Evaluator Încasări — panou de revizie zilnic cu corecturi manuale

**Data:** 2026-04-27
**Status:** Design aprobat
**Autor:** Claude (cu Ion Pop, business owner)

---

## Contextul problemei

Casa automată Tomberon trimite zilnic plățile șoferilor în Supabase. Funcția de raport leagă fiecare plată de șoferul corect prin **numărul foii de parcurs** (introdus de dispecer în /grafic). În urma migrației `048_fix_incasare_global_match` matching-ul caută foaia global (nu pe ziua depunerii), ceea ce a redus drastic plățile neasociate.

Totuși rămân **3 categorii de erori reale** care nu pot fi rezolvate automat:

- **A.** Plată cu foaie **fără mapare în /grafic** (dispecerul a omis-o sau a sărit peste ea)
- **B.** Plată cu **foaie duplicată** în /grafic (același număr la 2 șoferi diferiți pe 2 zile)
- **C.** Plată cu **format de foaie atipic** (ex: 8 cifre cu prefix `00` — `00142956`)

Soluția actuală (mesaj „neasociate" cu îndemn către dispecer) nu funcționează — dispecerul nu poate corecta retroactiv pentru că o foaie cu format greșit nu corespunde niciunei curse din /grafic.

## Soluția: rol nou cu pagină dedicată de revizie

Adăugăm un rol nou **EVALUATOR_INCASARI** care primește un panou de revizie zilnic în pagina existentă /numarare → tab Încasări. Evaluatorul:
- Vede alertele categorisite (A/B/C) cu detaliu complet al plății
- Asignează manual plata la un șofer **sau** marchează plata ca eroare casă (ignorat)
- Confirmă ziua ca fiind verificată după rezolvarea tuturor alertelor

Corecturile **nu modifică datele brute** (nici tabela `tomberon.transactions`, nici `driver_cashin_receipts`) — sunt stocate într-un strat separat de override-uri peste care funcția de raport aplică deciziile evaluatorului.

---

## Arhitectura

### Tabele noi

**`tomberon_payment_overrides`** — stochează corecturile per (foaie, ziua depunerii):

| Coloana | Tip | Detaliu |
|---|---|---|
| id | uuid | PK |
| receipt_nr | text | numărul foii (ex: `00142956`) — corespunde cu `tomberon.transactions.sofer_id` |
| ziua | date | ziua depunerii la Tomberon |
| action | enum | `'ASSIGN'` sau `'IGNORE'` |
| driver_id | uuid | FK la `drivers`, nullable, completat doar pentru `ASSIGN` |
| note | text | nota evaluatorului (motiv) |
| created_by | uuid | FK la `admin_accounts` |
| created_at | timestamptz | momentul corectării |
| updated_by | uuid | FK la `admin_accounts`, ultimul editor |
| updated_at | timestamptz | momentul ultimei modificări |
| UNIQUE(receipt_nr, ziua) | | o singură decizie per (foaie, zi) |

Constraint suplimentar: `action='ASSIGN' ⇒ driver_id NOT NULL`; `action='IGNORE' ⇒ driver_id IS NULL`.

**`incasare_day_confirmations`** — semnătura zilnică:

| Coloana | Tip | Detaliu |
|---|---|---|
| id | uuid | PK |
| ziua | date | UNIQUE — o singură confirmare per zi |
| confirmed_by | uuid | FK la `admin_accounts` |
| confirmed_at | timestamptz | |
| note | text | nullable |

### Rol nou

`EVALUATOR_INCASARI` adăugat în enum-ul de roluri (`admin_accounts.role`). Apare în panoul de creare/editare conturi (admin/users).

### Funcția de raport — logica nouă

`get_incasare_report(p_from, p_to)` se rescrie cu următoarea ordine de aplicare:

1. **Pentru fiecare (receipt_nr, ziua) din `tomberon.transactions`:**
   - Întâi caută în `tomberon_payment_overrides` o intrare exactă
   - Dacă găsește `action='ASSIGN'` → atribuie suma șoferului din override (ignoră matching-ul automat)
   - Dacă găsește `action='IGNORE'` → exclude plata complet din raport
   - Dacă nu există override → aplică matching-ul automat existent (LATERAL JOIN cu cea mai recentă intrare din `driver_cashin_receipts` pentru acel `receipt_nr`)

2. **Returnează 4 secțiuni în răspuns (înainte erau 2):**
   - `rows` — tabelul cu șoferi (cum e acum)
   - `unmapped` se rescrie ca `anomalies` — cu **categorie** explicită:
     - `'NO_FOAIE'` (tip A) — `receipt_nr` nu apare în `driver_cashin_receipts` deloc, format normal
     - `'DUPLICATE_FOAIE'` (tip B) — `receipt_nr` apare la ≥2 înregistrări diferite în `driver_cashin_receipts`
     - `'INVALID_FORMAT'` (tip C) — `receipt_nr` nu respectă formatul standard de 7 cifre
   - `confirmation` — `null` dacă ziua nu e confirmată, sau obiect `{confirmed_by_name, confirmed_at, note}` dacă e
   - `payment_breakdown` — pentru fiecare anomalie: `{numerar, card, lgotnici_count, lgotnici_suma, dop_rashodi, comment, fiscal_receipt_nr}` agregat

   **Important:** Anomaliile care au deja override (ASSIGN sau IGNORE) **NU** mai apar în lista `anomalies`. Sunt considerate rezolvate. Doar plățile fără override și care pică într-una din categoriile A/B/C apar ca alerte.

3. **Detectarea categoriei C (`INVALID_FORMAT`):** o foaie e considerată „invalid format" dacă **nu** se potrivește pattern-ului `^[0-9]{7}$` (7 cifre exact, fără 0-prefix). Pattern-ul standard al companiei.

### Server actions noi (Next.js)

În `incasareActions.ts`:

| Acțiune | Rol minim | Validări |
|---|---|---|
| `assignOverride(receipt_nr, ziua, driver_id, note?)` | EVALUATOR_INCASARI | driver_id activ, există în drivers |
| `ignoreOverride(receipt_nr, ziua, note)` | EVALUATOR_INCASARI | nota obligatorie |
| `deleteOverride(receipt_nr, ziua)` | EVALUATOR_INCASARI | — |
| `confirmDay(ziua, note?)` | EVALUATOR_INCASARI | 0 anomalii nerezolvate pentru ziua respectivă |
| `unconfirmDay(ziua)` | EVALUATOR_INCASARI | — (ștergerea confirmării — caz rar) |

Toate fac upsert pe (receipt_nr, ziua) sau (ziua) — operațiuni idempotente. Toate înregistrează `updated_by`/`updated_at`.

### UI — IncasareTab.tsx

**Restructurare:**

1. **Bara de status zi** (sus, sub filtrul de date):
   - Dacă confirmată: badge verde „✓ Confirmat de [Nume] la [data ora]" + buton (mic) „Anulează confirmare"
   - Dacă neconfirmată cu 0 anomalii: badge gri „Neconfirmat" + buton „Confirmă ziua"
   - Dacă neconfirmată cu N anomalii: badge galben „Mai sunt N alerte" — buton dezactivat cu tooltip

2. **Zona de alerte** (între bara de status și tabelul de șoferi):
   - Carduri grupate pe categorie (A/B/C) cu titluri și culori distincte (roșu/portocaliu/galben)
   - Fiecare card: foaia, ziua, **breakdown complet** (numerar, card, lgotnici, dop. rashodi, comentariu, nr. fiscal)
   - Pentru tip B: liste cele 2-3 candidate din /grafic + butoane „Aleg pe X"
   - Butoane principale: **„Asignează la șofer"** (deschide selector cu lista șoferilor activi, sortată alfabetic) + **„Marchează ignorat"** (deschide modal cu textarea pentru notă obligatorie)

3. **Tabelul de șoferi**: rămâne cum e, valorile reflectă corecturile aplicate.

4. **Istoric corectări** (jos, opțional collapse): timeline cu „[autor] a făcut [acțiune] la [oră]" — util pentru audit.

**Pentru rolul ADMIN (read-only):**
- Vede zonele 1, 2, 3, 4 dar **fără** butoane de acțiune
- Vede în alertă: „Decizie: [autor] a asignat la [șofer] / a ignorat" dacă există override

**Pentru ADMIN_CAMERE:**
- Tab-ul Încasări **nu apare deloc** (eliminăm rolul din `ADMIN_ROLES` în `incasareActions.ts`)

### Re-confirmare la date noi

Dacă pe o zi confirmată apar plăți noi de la Tomberon (ex: backfill cron întârziat), se calculează `MAX(t.synced_at)` pentru ziua respectivă și se compară cu `confirmation.confirmed_at`. Dacă există plăți cu `synced_at > confirmed_at` → bara de status afișează „⚠ Au apărut N plăți noi după confirmare — re-revizuiește". Vechea confirmare rămâne în istoric.

---

## Decizii tehnice

| Decizie | Alternativă | Motiv |
|---|---|---|
| Override per (receipt_nr, ziua) | Per `external_id` (transaction-level) | Aliniat cu agregarea raportului; mai simplu |
| Tabele separate vs. extindere `tomberon.transactions` | Coloane noi pe transactions | Separare curată ingestie/audit; istoric independent |
| Confirmare = semnătură (nu lock) | Lock real | Cerută explicit de owner — flexibilitate |
| Rol nou EVALUATOR_INCASARI | Reutilizare ADMIN_CAMERE | Separare clară responsabilități |
| `category` calculată în RPC vs. în UI | Logică în client | RPC e singura sursă de adevăr — evităm divergența |

## Riscuri și mitigări

- **Volum de override-uri** — în 6 luni pot deveni mii de rânduri. Mitigare: index pe `(ziua, action)`, nu trebuie partitioning încă.
- **Concurency** — 2 evaluatori editează același override simultan. Mitigare: UNIQUE pe (receipt_nr, ziua) + `updated_at` ca optimistic lock în UI (afișează „A fost modificat de altcineva, refresh").
- **Pierderea istoricului la edit** — modificarea unui override pierde versiunea anterioară. Mitigare v1: `updated_by`/`updated_at` reține doar ultima modificare. V2 (dacă se cere): tabel separat `tomberon_payment_overrides_history` cu trigger `AFTER UPDATE`.
- **Migrarea ADMIN_CAMERE** — utilizatorii cu acest rol pierd accesul. Mitigare: anunț prealabil; dacă cineva are nevoie real, primește rolul nou.

## Out of scope

- Notificări push/email la apariția anomaliilor
- Import bulk de override-uri din Excel
- Statistici per evaluator (cine a făcut câte corecturi)
- Ascundere automată a alertelor pentru zile vechi (>30 zile)
- Recalcul retroactiv al numărării (acela e modulul `audit_numarare`)

## Validare

După implementare:
1. Pe ziua **2026-04-26**, evaluatorul vede 3 alerte (`0945257`, `00142955`, `00142956`).
2. Asignează `00142955` și `00142956` la șoferi (sau marchează ignorat). Asignează `0945257` la șoferul corect (sau ignorat).
3. Anomaliile dispar; raportul se recalculează cu sumele redistribuite la șoferi.
4. Buton „Confirmă ziua" devine activ. Apasă → bara de status devine verde cu numele și data.
5. Verifică `incasare_day_confirmations` — apare un rând pentru 2026-04-26.
6. Verifică `tomberon_payment_overrides` — apar 3 rânduri cu deciziile.
