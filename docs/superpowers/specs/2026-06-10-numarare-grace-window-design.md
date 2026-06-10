# Numărare: fereastră de corectare 10 minute pentru operator

**Data:** 2026-06-10
**Status:** aprobat (design validat cu proprietarul)

## Problema

Azi, în momentul în care o rută devine «Finalizat» în modulul numărare, operatorul
(OPERATOR_CAMERE) pierde instant accesul: butonul «Deschide» se dezactivează și doar
ADMIN / ADMIN_CAMERE mai pot edita. Dacă operatorul observă o greșeală imediat după
finalizare, nu și-o poate corecta singur.

În plus, blocarea actuală este doar în interfață — serverul nu verifică statutul
`completed` la salvare, deci protecția reală lipsește.

## Decizii de business (validate)

1. **Durata:** 10 minute fixe, numărate **de la prima finalizare**. Corectările și
   re-salvările în fereastră NU prelungesc cronometrul.
2. **Cine:** doar **operatorul care a numărat** (cel din `operator_id` al sesiunii).
   Alți operatori nu pot interveni nici în fereastră. Admin — neschimbat (acces oricând).
3. **Sesiunile vechi** (finalizate înainte de această schimbare) rămân blocate ca azi.
4. **Audit-ul** nu se schimbă deloc.

## Comportament (flux operator)

1. Operatorul finalizează ruta (interurban: ambele direcții salvate; suburban: toate
   cursele salvate sau «Finalizează ruta») → pornesc 10 minute.
2. În listă, pentru ruta lui finalizată, butonul «Deschide» rămâne activ și lângă status
   apare un text mic: «✏️ corectare: încă X min».
3. Operatorul redeschide, corectează, salvează → suma se recalculează normal
   (formulele existente). Statutul rămâne `completed`, cronometrul nu se resetează.
4. După expirarea ferestrei → comportament identic cu azi (doar admin editează).
5. Selectoarele șofer/mașină urmează aceeași regulă (editabile în fereastră, blocate după).

## Design tehnic

### 1. Migrație DB (mică)

- `counting_sessions` + coloană `completed_at timestamptz NULL`.
- Fără backfill: sesiunile deja finalizate rămân cu `NULL` → tratate ca «fereastră
  expirată» (blocate, ca azi).

### 2. Setarea `completed_at` (o singură dată)

Se setează `completed_at = now()` DOAR la tranziția în `completed` și DOAR dacă era
`NULL` (prima finalizare), în trei locuri din
`apps/admin/src/app/(dashboard)/numarare/actions.ts`:

- `saveDirection` — interurban, când ambele direcții există;
- `saveSuburbanCycle` — suburban, la auto-finalizare;
- `finalizeSuburbanSession` — suburban, la finalizare manuală.

### 3. Verificarea pe server (sursa de adevăr)

Constantă unică `GRACE_MINUTES = 10` + helper pur
`isWithinGrace(completedAt: string | null, now: Date): boolean` (exportat din
`calculation.ts` pentru test unitar). Limita e strictă: la exact 10:00 minute
fereastra e considerată EXPIRATĂ (`now < completed_at + 10 min`); `NULL` → expirată.

Regulă de acces la editare pentru sesiuni `completed` (non-admin):
`session.operator_id === user.id && isWithinGrace(session.completed_at, now)`.

Puncte de aplicare (toate în `actions.ts`):

- `lockRoute` — dacă sesiunea e `completed` și utilizatorul nu e admin și nu e în
  fereastră ca operator al sesiunii → `readOnly: true` (azi nu verifică deloc);
- `saveDirection`, `saveSuburbanCycle`, `finalizeSuburbanSession` — refuză scrierea
  («Fereastra de corectare a expirat») în aceleași condiții, ca un formular rămas
  deschis să nu poată scrie după expirare;
- `updateSessionDriverVehicle` — aceeași gardă (azi scrie fără verificare).

Rolurile se iau din `verifySession()` (există deja); admin = `ADMIN` sau `ADMIN_CAMERE`.

### 4. Interfață (`NumarareClient.tsx` + `CountingForm.tsx`)

- `RouteForCounting` primește `completed_at: string | null` și `operator_id` există
  deja; `getRoutesForDate` selectează în plus `completed_at`.
- Logica butonului «Deschide»: activ dacă `!completed`, SAU admin, SAU
  (`operator_id === currentUserId` și în fereastră).
- Text mic lângă status: minutele rămase, re-randat la ~30s (interval ușor).
- `CountingForm`: prop-ul existent `canEditCompleted` devine
  `canAudit || (e sesiunea lui și e în fereastră)`.
- `SuburbanCountingForm`: nu se schimbă — primește deja `viewOnly` din rezultatul
  `lockRoute` (serverul decide).

### 5. Testare

- Test unitar pentru `isWithinGrace` (limite: null, exact 10:00, 9:59, 10:01).
- Typecheck + suita vitest existentă.
- Scenarii manuale: operator în fereastră (poate edita, suma se recalculează),
  alt operator (nu poate), după 10 min (nu poate), admin (poate oricând),
  sesiune veche cu `completed_at NULL` (blocată).

## Ce NU facem (scop limitat)

- Durată configurabilă din admin (hardcodat 10 — YAGNI).
- Prelungirea ferestrei la re-salvare (decis: strict prima finalizare).
- Modificări la fluxul de audit sau la rapoarte.
- Notificări / istoricul corectărilor.

## Riscuri & note

- Ceasul de referință e al serverului (now() la verificare), clientul doar afișează.
- `operator_id` este cel care a creat sesiunea (primul care a blocat ruta) — în practică
  cel care numără; dacă două persoane au lucrat pe aceeași sesiune, fereastra aparține
  creatorului.
- Garda nouă pe server întărește și cazul de azi (lipsa oricărei verificări) — câștig
  de securitate fără schimbare de comportament pentru admin.
