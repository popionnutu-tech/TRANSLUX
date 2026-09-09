---
kit: spec
name: peron-app-two-steps
title: Cursa în două etape — pregătirea (șofer, poză, verificări) înainte, călătorii la plecare
created: 2026-09-09
sessions:
  - id: S01
    title: Ecranul de cursă în două etape cu ciornă salvată pe telefon; grila arată cursa «pregătită»
    gates: [typecheck-app]
    approve: []
---

# Cursa în două etape — pregătirea înainte, călătorii la plecare

## De ce

Ion (09.09): «hai să divizăm fixarea la rută în 2 etape: prima etapă tot în afară de
călători, a doua călătorii, că operatorul de peron nu dovedește la sfârșit să facă
poza». Azi ecranul de cursă cere totul deodată, iar poza șoferului trebuie făcută la
plecare, când operatorul numără călătorii și n-are timp. Ținta: operatorul deschide
cursa când mașina e la peron, face poza și bifează verificările, apoi la plecare
introduce doar cifra și trimite.

## Decizii fixate înainte de start

- **Doar aplicația se schimbă.** `POST /app/v1/report` rămâne un singur apel, făcut la
  etapa 2, cu toate datele. `POST /driver-photo` se face la etapa 1 (deja există și
  întoarce `driverCheckId` valabil toată ziua).
- **Etapa 1 «Pregătire»** (`app/trip/[id].tsx`, pasul 1): antet, card Șofer și auto
  (Confirm / Schimbă, + Adaugă auto), card Poza șoferului (verdictele fixe ale
  modelului), card Verificări (ajută la încărcat, auto curat, reclamă cu «a fost
  reparat?», clima), rândul GPS, butonul **«Pregătit, aștept plecarea»** (64, bordo).
  Butonul e activ doar cu poza șoferului acceptată (sau cu auto «Fără auto» — atunci
  reclama nu apare, ca azi). Nimic nu pleacă la server aici în afară de poză (deja
  trimisă la captură) și eventual `/vehicle`.
- **Ciorna** se salvează în `AsyncStorage` sub `trip:draft:<date>:<tripId>`:
  `{ driverId, vehicleId, assignmentChanged, driverCheckId, verdicts, loadingHelpOk,
  autoCurat, reclamaOk, reclamaProblem, reclamaRepairConfirmed, reclamaTaskId,
  acStatus, heatStatus, preparedAt }`. Se șterge după raportul reușit și la schimbarea
  zilei (cheia conține data).
- **Etapa 2 «Plecare»** (același fișier, pasul 2): antet cu ora și pastila de întârziere,
  un rezumat de un rând al pregătirii («Ion Moldovan · LYY 735 · uniformă da ·
  bărbierit da · pregătit 07:12»), card Pasageri mare (−/cifră/+, ca la Bălți: câmp 96,
  cifra 52, butoane rapide 5/10/15/20/25), butonul «Microbuzul a fost absent», rândul
  GPS (poziția se ia din nou acum), butonul **«Trimite raportul»**. Link mic «Modifică
  pregătirea» care întoarce la pasul 1 cu ciorna încărcată.
- **Absent** se poate trimite din oricare etapă (fără poză, fără ciornă), ca azi.
- **Fără ciornă** (operatorul deschide cursa direct la plecare), ecranul pornește de la
  pasul 1 și trece la pasul 2 după «Pregătit»; poate face totul într-un singur flux, ca
  azi, doar cu un buton în plus.
- **Grila zilei:** celula `next` cu ciornă salvată arată o bifă mică albă în colț și
  eticheta rămâne ora; sub antet, textul «Urmează 07:35 · pregătită» în loc de «Urmează
  07:35». Atingerea deschide direct pasul 2.
- **Bălți** nu are etape (n-are șofer, poză sau verificări): rămâne ecranul scurt.
- Camera și logica din `src/buildReport.ts` rămân; se adaugă `src/tripDraft.ts`
  (salvare/citire/ștergere ciornă, funcții pure testate cu `node:test`).
- Aspectul rămâne al mockup-ului (aceleași componente, culori, dimensiuni).

## Nu intră în scop

- Schimbări de API sau de tabele. Pregătirea a două curse înainte (doar cursa `next`).

## Riscuri și necunoscute

- Dacă între pregătire și plecare se schimbă șoferul, operatorul apasă «Modifică
  pregătirea» și reface poza; `driverCheckId` vechi rămâne în bază nefolosit (fără
  efect asupra raportului).
- Ciorna e doar pe telefon: schimbarea telefonului între etape pierde pregătirea.
  Acceptat.

## Cum înțelegem că totul a reușit

- [ ] Cursa din Chișinău are doi pași: «Pregătit, aștept plecarea» → «Trimite raportul»;
      ciorna supraviețuiește închiderii ecranului și a aplicației (citită din
      `AsyncStorage`).
- [ ] La deschiderea unei curse cu ciornă, ecranul pornește la pasul 2 cu rezumatul.
- [ ] Corpul trimis la `/report` e identic cu cel de azi pentru aceleași date (testele
      `buildReport` neschimbate ca așteptări).
- [ ] Grila arată «pregătită» la cursa `next` cu ciornă.
- [ ] typecheck-app, `npm test` verzi; `npx expo export --platform android` verde.

---

## S01

**Scop:** cele de mai sus, într-o singură sesiune.

**Pași:**
1. `src/tripDraft.ts`: `draftKey(date, tripId)`, `saveDraft`, `loadDraft`, `clearDraft`,
   `clearOtherDays(date)`; tipul `TripDraft`; teste pentru chei și pentru
   serializare/deserializare (fără AsyncStorage real: injectează un store în memorie).
2. `app/trip/[id].tsx`: stare `step: 1 | 2`; la montare, dacă există ciornă →
   `step = 2`; pasul 1 → butonul «Pregătit, aștept plecarea» salvează ciorna și trece
   la pasul 2; pasul 2 → cifra + Trimite (corp construit din ciornă + cifră + GPS
   proaspăt); după 200 → `clearDraft`; «Modifică pregătirea» → pasul 1.
3. `app/day.tsx`: citește ciorna pentru cursa `next` și arată «· pregătită» + bifa.
4. `src/buildReport.ts`: dacă e nevoie, o funcție `bodyFromDraft(draft, passengers,
   gps)`; testele existente rămân verzi.

**Fișiere:** `peron-android/src/tripDraft.ts` (+ test), `app/trip/[id].tsx`,
`app/day.tsx`, `src/buildReport.ts` (dacă e nevoie).

**Gata când:** typecheck-app, `npm test` verzi; `grep -c "Pregătit, aștept plecarea"
"peron-android/app/trip/[id].tsx"` ≥ 1; `npx expo export --platform android` verde.

**Gate-uri:** typecheck-app.

**Nu atinge:** `apps/*`, `src/api.ts`, ecranele de curățenie și login.
