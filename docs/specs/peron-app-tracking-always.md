---
kit: spec
name: peron-app-tracking-always
title: Urmărirea GPS merge singură, indiferent dacă aplicația e deschisă
created: 2026-09-08
sessions:
  - id: S01
    title: Serviciu de locație persistent, re-armare din fundal și după repornirea telefonului, ghid pentru baterie
    gates: [typecheck-app]
    approve: []
  - id: S02
    title: Verificare — scenariile «aplicația închisă», «telefon repornit», «în afara ferestrei»
    gates: [typecheck-app]
    approve: []
---

# Urmărirea GPS merge singură, indiferent dacă aplicația e deschisă

## De ce

Ion (08.09): «fă ca automat geolocația să fie întotdeauna, nu doar când aplicația
rulează». Azi urmărirea (`peron-android/src/presence.ts`) pornește când operatorul
deschide ecranul zilei și depinde de procesul aplicației: dacă o închide din lista de
aplicații recente sau repornește telefonul, ping-urile se opresc până o redeschide, iar
raportul de seară arată «fără semnal» deși omul e la peron. Ținta: în fereastra turei
(prima cursă − 30 min → ultima + 30 min, per punct), poziția pleacă la 2 minute fără
ca operatorul să facă ceva și fără ca aplicația să fie deschisă.

## Decizii fixate înainte de start

- **Fereastra turei rămâne** (decizia lui Ion din spec-ul aplicației: «pe parcursul
  toată ziua dacă se află în zona de lucru»). În afara ferestrei nu se urmărește nimic.
  «Întotdeauna» = în orice moment al ferestrei, indiferent de starea aplicației.
- **Serviciul de locație e persistent:** `Location.startLocationUpdatesAsync` cu
  `foregroundService` (notificare permanentă) rămâne pornit după ce aplicația e închisă
  din «recente»; Android îl păstrează cât timp notificarea există. Se pornește o dată,
  la login sau la prima deschidere în fereastră, și **nu se oprește** la părăsirea
  ecranului sau la închiderea aplicației; se oprește doar la ieșirea din fereastră
  (verificată din chiar task-ul de locație, la fiecare ping) și la deconectare.
- **Re-armare fără aplicație:** `expo-background-fetch` (WorkManager pe Android,
  supraviețuiește repornirii telefonului) cu `minimumInterval: 15 min`,
  `stopOnTerminate: false`, `startOnBoot: true`. Task-ul: dacă suntem în fereastră și
  serviciul de locație nu e pornit (`Location.hasStartedLocationUpdatesAsync`), îl
  pornește; dacă suntem în afara ferestrei și e pornit, îl oprește; golește coada de
  ping-uri. Fereastra și stația se citesc din `AsyncStorage` (salvate la ultimul `/day`),
  ca task-ul să nu depindă de rețea; dacă lipsesc, cere `/day` cu token-ul din
  SecureStore.
- **Repornirea telefonului:** `startOnBoot: true` la background fetch acoperă
  re-armarea în cel mult 15 min după boot; în plus, permisiunea `RECEIVE_BOOT_COMPLETED`
  în `app.json` (expo-background-fetch o cere). Nu se scrie cod nativ.
- **Bateria:** la login, după permisiuni, ecranul «Ultimul pas» explică și deschide
  setările de optimizare a bateriei pentru aplicație (`expo-intent-launcher`,
  `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` cu `package:md.translux.peron`; dacă
  intent-ul nu e disponibil, `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`). Starea se
  verifică cu `expo-battery`? — nu există API pentru whitelist în Expo; se afișează
  ecranul o singură dată și un rând în ecranul zilei «Optimizarea bateriei: verifică
  setările» cu link, până când operatorul apasă «Am făcut».
- **Ce vede operatorul:** notificarea permanentă «TRANSLUX Peron · urmărește locația în
  timpul turei» pe toată fereastra; rândul GPS din ecranul zilei arată ora ultimului
  ping trimis («ultimul semnal 12:42»).
- **Serverul nu se schimbă.** `/presence` acceptă deja loturi; perioadele se calculează
  seara.
- **Când aplicația e deschisă** comportamentul e același ca azi; nu se dublează
  ping-urile (task-ul de locație e unul singur, identificat prin numele `'presence'`).

## Nu intră în scop

- Urmărire 24/7 în afara ferestrei turei.
- Cod nativ Kotlin, receiver-e proprii, servicii custom.
- Alertă în timpul zilei (Ion: doar raportul de seară).

## Riscuri și necunoscute

- **Producătorii agresivi (Xiaomi, Huawei, Oppo, Samsung «Deep sleep»)** pot omorî și
  serviciile cu notificare. Ghidul de baterie și re-armarea la 15 min reduc golurile la
  maximum 15 min; golurile rămase apar oricum în raport ca «fără semnal». Nu e HOLD.
- **`expo-background-fetch` are interval minim 15 min pe Android** și nu e garantat la
  minut; e plasa de siguranță, nu mecanismul principal (serviciul de locație e).
- **Testare fără telefon:** sesiunea verifică pe cod și cu teste pe funcțiile pure
  (`shouldTrack(now, window)`, `planFromStorage(...)`); comportamentul real îl arată
  telefonul lui Ion.

## Cum înțelegem că totul a reușit

- [ ] `src/presence.ts`: serviciul nu se mai oprește la părăsirea ecranului sau la
      închiderea aplicației; se oprește doar în afara ferestrei sau la deconectare.
- [ ] Task de `BackgroundFetch` înregistrat cu `startOnBoot: true`,
      `stopOnTerminate: false`, care re-armează urmărirea în fereastră.
- [ ] `app.json` are `RECEIVE_BOOT_COMPLETED`; `expo-background-fetch`,
      `expo-intent-launcher` instalate.
- [ ] Ecranul «Ultimul pas» cu deschiderea setărilor de baterie există și apare o dată.
- [ ] Rândul GPS arată ora ultimului ping.
- [ ] typecheck-app și `npm test` verzi; `npx expo export --platform android` verde.

---

## S01 — Serviciu de locație persistent, re-armare din fundal și după repornire, ghid pentru baterie

**Scop:** urmărirea în fereastra turei nu mai depinde de aplicația deschisă.

**Pași:**
1. `npx expo install expo-background-fetch expo-intent-launcher` în `peron-android/`.
2. `src/presence.ts`: separă logica pură în `src/presenceRules.ts` (`shouldTrack(nowHHMM,
   window)`, `nextAction(state)` → `'start' | 'stop' | 'keep'`), cu teste `node:test`.
   Salvează în `AsyncStorage` (`presence:plan`) `{ date, window, station, point }` la
   fiecare `/day`. Task-ul de locație (`TaskManager.defineTask('presence')`) verifică
   la fiecare ping fereastra din plan și oprește serviciul când a ieșit din ea. Nu mai
   există `stop` la `unmount`/blur; `logout()` oprește serviciul și dez-înregistrează
   task-urile.
3. `src/backgroundRearm.ts`: `TaskManager.defineTask('presence-rearm', …)` la nivel de
   modul (importat din `app/_layout.tsx`), `BackgroundFetch.registerTaskAsync(
   'presence-rearm', { minimumInterval: 15 * 60, stopOnTerminate: false, startOnBoot:
   true })` la login; task-ul aplică `nextAction` și `flushPresenceQueue()`.
4. `app.json`: `RECEIVE_BOOT_COMPLETED` la permisiuni.
5. `app/battery.tsx` («Ultimul pas»): text scurt + butonul «Deschide setările» (intent)
   + «Am făcut» (salvează `battery:done` în AsyncStorage); `login.tsx` trimite aici
   după permisiuni dacă nu e făcut; `day.tsx` arată rândul de reamintire cât timp nu e.
6. `day.tsx`: rândul GPS afișează «ultimul semnal HH:MM» din `presence:lastPing`
   (scris de task la fiecare ping trimis sau pus în coadă).

**Fișiere:** `peron-android/src/presence.ts`, `src/presenceRules.ts` (+ test),
`src/backgroundRearm.ts`, `app/battery.tsx`, `app/login.tsx`, `app/day.tsx`,
`app/_layout.tsx`, `app.json`, `package.json`, `package-lock.json`.

**Gata când:** typecheck-app verde; `npm test` verde cu testele noi; `grep -n
"stopLocationUpdatesAsync" src/presence.ts` apare doar în ramura «în afara ferestrei» și
în `logout`; `grep -c "startOnBoot: true" src/backgroundRearm.ts` = 1; `npx expo export
--platform android` verde.

**Gate-uri:** typecheck-app.

**Nu atinge:** `src/api.ts`, `src/buildReport.ts`, ecranele de cursă și curățenie, `apps/*`.

---

## S02 — Verificare

**Depinde de:** S01.

**Scop:** dovada pe cod și pe teste că cele trei scenarii sunt acoperite: aplicația
închisă din recente, telefon repornit, ieșire din fereastră.

**Pași:**
1. Parcurge pe cod fiecare scenariu și notează fișierul/funcția care îl tratează.
2. Rulează gate-urile; `npx expo export --platform android`.
3. Scrie `docs/specs/peron-app-tracking-always.verificare.md` cu scenariile, ce e
   garantat de Android și ce depinde de producătorul telefonului, plus pașii pentru
   Ion pe telefon (setările de baterie pe Samsung/Xiaomi).

**Fișiere:** raportul; corecții mici.

**Gata când:** raportul există; gate verde; `git status` curat în afara altor sesiuni.

**Gate-uri:** typecheck-app.

**Nu atinge:** nimic în afara corecțiilor.
