# Urmărirea GPS merge singură — raportul de verificare (S02, 2026-09-08)

Sesiunea S02 a spec-ului `peron-app-tracking-always.md`. Verificat pe cod (aplicația **și**
codul nativ al modulelor Expo din `node_modules`, nu documentația lor), pe teste și pe
gate-uri; ce nu se poate verifica fără telefon e în secțiunea «De făcut de Ion pe telefon».
Commit-ul verificat: `9fa56f0` (S01) plus corecțiile din această sesiune (vezi §6).

**Pe scurt:** două din trei scenarii sunt acoperite așa cum cere spec-ul (aplicația
închisă din «recente»; ieșirea din fereastră). Al treilea — telefonul repornit — e
acoperit doar parțial, din cauza unei presupuneri greșite din spec: `expo-location` nu
lasă serviciul cu notificare să pornească din fundal, deci task-ul de re-armare **nu
poate porni** urmărirea fără aplicație; poate doar s-o oprească și să golească coada.
Urmărirea reală pornește la prima deschidere a aplicației în fereastră și de acolo
merge singură. Detalii în §3 și §4; ce propun în §7.

## 1. Gate-urile (toate într-o singură rulare finală, 2026-09-08 20:40)

| Gate | Comandă | Rezultat |
|---|---|---|
| typecheck-app | `cd peron-android && npx tsc --noEmit` | ✅ verde |
| teste app | `cd peron-android && npm test` | ✅ 38 teste `node:test` (37 din S01 + 1 nou) |
| export | `CI=1 npx expo export --platform android` | ✅ verde, bundle Hermes 2,93 MB |
| conținutul bundle-ului | `grep -a -c` pe `.hbc` | ✅ `presence-rearm`, `killServiceOnDestroy`, `startOnBoot`, `presence:plan`, `battery:done`, `POST_NOTIFICATIONS`; textul notificării «Urmărește locația în timpul turei» (UTF-16, cum stochează Hermes non-ASCII) |
| prebuild | `CI=1 npx expo prebuild --platform android --no-install --clean` | ✅ verde; manifestul regenerat conține `RECEIVE_BOOT_COMPLETED`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `POST_NOTIFICATIONS`, `WAKE_LOCK`, `FOREGROUND_SERVICE_LOCATION` |
| «gata când» S01 | `grep -n stopLocationUpdatesAsync src/presence.ts` | ✅ o singură apariție, în `stopTracking()` |
| «gata când» S01 | `grep -c "startOnBoot: true" src/backgroundRearm.ts` | ✅ 1 |

Nu s-a atins nimic în `apps/*`, `packages/*`, `src/api.ts`, `src/buildReport.ts`, ecranele
de cursă/curățenie. `git status` la final: doar fișierele din §6.

## 2. Ce face Android de fapt — citit din codul nativ al modulelor

Spec-ul și comentariile S01 presupun câteva lucruri despre Expo pe care le-am verificat
în sursele Kotlin/Java din `node_modules` (expo-location 18.0.10, expo-task-manager 12.0.6,
expo-background-fetch 13.0.6). Astea sunt faptele pe care stă tot raportul:

| # | Fapt | Unde |
|---|---|---|
| N1 | **`startLocationUpdatesAsync` cu `foregroundService` aruncă `ForegroundServiceStartNotAllowedException` dacă aplicația nu e în prim-plan.** «În prim-plan» = activitatea e vizibilă (`OnActivityEntersForeground/Background`). În headless (task de fundal, după boot) e mereu «în fundal». | `expo-location/android/.../LocationModule.kt:267`, flag-ul la `:315-319` |
| N2 | Chiar și fără excepție, consumatorul de locație nu pornește serviciul din fundal: «Foreground location task cannot be started while the app is in the background!». Serviciul pornește doar din `didRegister`/`setOptions`, adică la o chemare a `startLocationUpdatesAsync`. | `LocationTaskConsumer.kt:163-171` |
| N3 | O nouă chemare a `startLocationUpdatesAsync` când task-ul e deja înregistrat = `setOptions`: aceeași cerere de locație (oprită și repornită, un singur `PendingIntent`), serviciul pornit dacă lipsește, notificarea reafișată. **Idempotent, fără ping-uri dublate.** | `TaskService.java:95-107` → `LocationTaskConsumer.kt:70-79` |
| N4 | **Serviciul supraviețuiește închiderii din «recente»**: `onTaskRemoved` oprește serviciul doar dacă `killService` e true (noi trimitem `killServiceOnDestroy: false`); `START_REDELIVER_INTENT` face Android să recreeze serviciul dacă omoară procesul. | `LocationTaskService.kt:34-58` |
| N5 | Locațiile ajung printr-un `PendingIntent` către `TaskBroadcastReceiver` → `JobScheduler` (`TaskJobService`) → JS-ul rulează **headless** (`HeadlessAppLoader.loadApp`) — fără interfață, dar cu `index.ts` ca entry, deci cu ambele `defineTask` (verificat în bundle). | `TaskService.java:412`, manifestul din `expo-task-manager` |
| N6 | **La boot** (`RECEIVE_BOOT_COMPLETED`, receiver-ul din manifestul `expo-task-manager`) `TaskService` re-creează task-urile din SharedPreferences: task-ul de locație, dacă era înregistrat, primește din nou locații (fără serviciu, vezi N2); task-ul de re-armare își repornește alarma dacă are `startOnBoot`. | `TaskService.java:71-79, 541-583`; `BackgroundFetchTaskConsumer.java:67-74` |
| N7 | **`expo-background-fetch` pe Android = `AlarmManager.setInexactRepeating(ELAPSED_REALTIME_WAKEUP)`, nu WorkManager** (spec-ul zice WorkManager). Alarma pornește la `onHostPause`, se oprește la `onHostResume` (când aplicația e deschisă nu rulează), rămâne după `onHostDestroy` cu `stopOnTerminate: false`, se reface la boot și la reinstalare (`MY_PACKAGE_REPLACED`). | `BackgroundFetchTaskConsumer.java:121-179` |
| N8 | Oprirea (`stopLocationUpdatesAsync` → `unregisterTask` → `didUnregister`) **nu are gard de prim-plan**: merge și din task-ul de fundal. | `LocationModule.kt:278-281`, `LocationTaskConsumer.kt:62-68` |
| N9 | Serverul taie fereastra la `[00:00, 23:59]` — nu trece niciodată de miezul nopții, deci comparația lexicografică `HH:MM` din `shouldTrack` e corectă. | `apps/bot/src/api/presence.ts:38-44` |

## 3. Cele trei scenarii, pe cod

### A. Aplicația închisă din «recente» — ✅ acoperit

| Pas | Unde |
|---|---|
| Serviciul pornit din ecranul zilei rămâne cu notificarea după swipe (N4) | `src/presence.ts` → `startTracking()`: `foregroundService.killServiceOnDestroy: false` |
| Fiecare locație (la 2 min) ajunge în JS headless (N5) → coadă → `/presence` în lot → verificarea ferestrei | `src/presence.ts` → `TaskManager.defineTask('presence', …)`: `enqueue` + `flushPresenceQueue` + `shouldTrack` → `stopTracking()`; definit la nivel de modul, importat din `index.ts` (entry rădăcină) și `app/_layout.tsx` |
| Nimic nu oprește serviciul la blur/unmount/închidere | `grep stopLocationUpdatesAsync src/presence.ts` → doar `stopTracking()`, chemat din ramura «în afara ferestrei», la token lipsă și din `session.ts` → `logout()` |
| Plasa de siguranță la ≥ 15 min continuă după închidere (N7, `stopOnTerminate: false`) | `src/backgroundRearm.ts` → `registerRearm()`; `rearmPresence()`: `applyPresencePlan(planul stocat)` → `keep` cât timp serviciul merge, `flushPresenceQueue()` |
| Fără token (401 sau «Deconectează») serviciul se oprește singur | task-ul `presence`: `if (!(await getToken())) stopTracking()`; `session.ts` → `logout()` oprește serviciul, dez-înregistrează re-armarea, șterge planul și coada |

Limita: dacă producătorul omoară **serviciul** (nu doar procesul — vezi §4), re-armarea nu
îl poate reporni (N1); golul ține până la următoarea deschidere a aplicației.

### B. Telefonul repornit — ⚠️ parțial

Serviciul nu supraviețuiește repornirii (Android nu repornește servicii). Ce se întâmplă,
pas cu pas, după ce operatorul **deblochează** telefonul (până atunci stocarea aplicației e
criptată și `BOOT_COMPLETED` nu se livrează):

| Pas | Ce face codul | Rezultat |
|---|---|---|
| `BOOT_COMPLETED` → `TaskService` restaurează task-urile (N6) | — (nativ) | Dacă repornirea a fost **în fereastră**, task-ul `presence` era înregistrat → cererea de locație e refăcută, **fără serviciu și fără notificare** (N2). Android limitează locațiile pentru aplicații în fundal la câteva pe oră → ping-uri rare ajung prin JS headless. Dacă repornirea a fost **în afara ferestrei**, task-ul nu era înregistrat → nimic. |
| Alarma de re-armare repornește (`startOnBoot: true`) → după ≥ 15 min `rearmPresence()` | `src/backgroundRearm.ts` | Plan de azi în AsyncStorage sau `/day` cu token-ul din SecureStore (`request(..., { keepSessionOn401: true })`). `nextAction` → `keep` dacă task-ul e «pornit» (cazul de mai sus) sau `start` dacă nu — iar `start` **aruncă** (N1) → `console.warn('[presence] nu pot porni urmărirea')` → `keep`. Coada se golește. |
| Operatorul deschide aplicația (ecranul zilei) | `app/day.tsx` → `syncPresenceTracking(d)` → `applyPresencePlan(plan, now, { foreground: true })` | **Corecție S02:** cu serviciul «pornit» dar fără notificare, `shouldRefreshForeground` re-cheamă `startLocationUpdatesAsync` (N3) → serviciul cu notificare revine. Sub codul S01 (`if (await isTracking()) return` în `startTracking`) serviciul **nu ar fi revenit toată ziua** după o repornire în fereastră. |

Concluzie: după repornire, până la prima deschidere a aplicației → locații rare (câteva pe
oră) dacă repornirea a fost în fereastră, nimic dacă a fost în afara ei; de la prima
deschidere → complet. Spec-ul promite «re-armarea în cel mult 15 min după boot» — asta
**nu e posibilă** cu expo-location (N1, N2) fără cod nativ. Vezi §7.

### C. Ieșirea din fereastră — ✅ acoperit

| Pas | Unde |
|---|---|
| La primul ping după `to` (≤ 2 min) serviciul se oprește singur, din chiar task-ul de locație | `src/presence.ts`, task-ul `presence`: `if (!shouldTrack(localHHMM(now), plan?.window ?? null)) await stopTracking()`; plan pentru altă zi → `getStoredPlan` = null → fereastră null → stop |
| Re-armarea oprește și ea, dacă serviciul mai merge (N8 — merge din fundal) | `presenceRules.nextAction`: `inWindow: false, tracking: true` → `'stop'` (test «nextAction: în afara ferestrei oprește doar dacă e pornit») |
| `shouldTrack` — capetele incluse, fereastră lipsă/stricată → fals | `src/presenceRules.ts` + 2 teste; fereastra nu trece de miezul nopții (N9) |
| Ping-urile de după fereastră (cel mult unul) sunt oricum aruncate de server | `apps/bot/src/api/presence.ts` → `selectNewPings` (fereastră + dedupe) |

### D. În plus: începutul ferestrei cu aplicația închisă (dimineața)

Nu e în lista spec-ului, dar decurge din N1: la 06:25 (prima cursă − 30 min) re-armarea
găsește planul de ieri → cere `/day` → `start` → aruncă → `keep`. Urmărirea pornește când
operatorul deschide aplicația (o deschide oricum pentru raportul primei curse, ~06:55).
Consecință vizibilă: în raportul de seară poate apărea «start întârziat» pentru minutele
dintre începutul ferestrei și prima deschidere. Nu e o regresie față de dinainte de S01
(și atunci pornea la deschidere), dar nu e nici «întotdeauna» din spec.

## 4. Ce e garantat de Android și ce depinde de producător

**Garantat de Android (AOSP), verificat în cod:**
- Serviciul în prim-plan cu notificare rămâne după închiderea din «recente» și e recreat
  dacă sistemul omoară procesul (N4). Cererea de locație (`PendingIntent`) și alarmele
  `AlarmManager` supraviețuiesc morții procesului, nu și repornirii — dar sunt refăcute la
  `BOOT_COMPLETED` (N6, N7), care se livrează după prima deblocare.
- Oprirea serviciului merge de oriunde (N8); pornirea, doar din prim-plan (N1, N2) —
  asta e o regulă a bibliotecii Expo, nu a Android-ului, și e independentă de setările de
  baterie.
- Doze (telefon nemișcat, ecran stins mult timp) amână alarmele inexacte până la
  fereastra de întreținere, chiar și pentru aplicațiile scoase de la optimizare. Pe peron
  telefonul se mișcă și e folosit, deci Doze nu se instalează; oricum re-armarea e plasa
  de siguranță, nu mecanismul principal.
- Android 13+: notificarea serviciului apare în bară doar cu `POST_NOTIFICATIONS`
  (serviciul merge și fără). Aplicația nu o cerea — corecție S02 (§6). Fără ea, în
  «Setări → Aplicații → TRANSLUX Peron → Notificări» operatorul o poate porni manual.

**Depinde de producător (nu e garantat, nu e HOLD):**
- Xiaomi/Redmi/POCO (MIUI, HyperOS), Huawei/Honor (EMUI), Oppo/Realme/OnePlus (ColorOS),
  Vivo, Samsung («Deep sleeping apps», «Put unused apps to sleep») pot omorî și serviciile
  cu notificare, pot bloca pornirea la boot («Autostart») și pe unele, swipe-ul din
  «recente» e echivalent cu «Force stop» — după care nici alarmele, nici `BOOT_COMPLETED`
  nu mai ajung la aplicație până n-o deschide omul. Golurile apar în raportul de seară
  ca «fără semnal»; re-armarea **nu** le poate închide (N1), doar deschiderea aplicației.
- Ecranul «Ultimul pas» + setările din §5 reduc riscul; nu-l elimină.

## 5. De făcut de Ion pe telefon

APK-ul se construiește cu `bash peron-android/build-apk.sh` — scriptul regenerează acum
`android/` din `app.json` la fiecare rulare (§6); primul build după asta e complet (mai lung).

1. **Instalare + login.** Cod de la admin → «Permite tot timpul» la locație → (Android 13+)
   dialogul de notificări → «Permite» → ecranul «Ultimul pas» → «Deschide setările» →
   dialogul «Permite aplicației să ruleze în fundal?» → «Permite» → «Am făcut».
   Verifică: în ecranul zilei nu mai apare rândul «Optimizarea bateriei».
2. **Notificarea.** În fereastra turei, pe ecranul zilei, trebuie să apară «TRANSLUX
   Peron · Urmărește locația în timpul turei». Pe Android 13+ dacă nu apare: Setări →
   Aplicații → TRANSLUX Peron → Notificări → pornit.
3. **Închis din «recente».** Swipe pe aplicație. Notificarea rămâne. După 4–6 minute:
   `select at, in_zone, accuracy_m from peron_presence_pings order by at desc limit 5`
   în Supabase — trebuie ping-uri la ~2 min, cu `at` mai nou decât momentul swipe-ului.
4. **Repornire.** Cu urmărirea pornită, repornește telefonul și deblochează-l. **Așteptat:**
   fără notificare (N1), eventual 1–3 ping-uri pe oră; după ≥ 15 min tot fără notificare
   (`adb logcat | grep presence` arată «nu pot porni urmărirea» — normal). Deschide
   aplicația → notificarea revine imediat și ping-urile reiau la 2 min.
5. **Ieșirea din fereastră.** La `ultima cursă + 30 min` (+ cel mult 2 min) notificarea
   dispare singură. Test rapid: «Deconectează» → notificarea dispare pe loc.
6. **Setări per producător** (o dată, la instalare):
   - **Samsung:** Setări → Baterie → Limite de utilizare în fundal → «Aplicații care nu
     dorm niciodată» → adaugă TRANSLUX Peron; «Pune aplicațiile nefolosite în repaus» →
     oprit. Setări → Aplicații → TRANSLUX Peron → Baterie → «Fără restricții».
   - **Xiaomi/Redmi/POCO:** Setări → Aplicații → Gestionare aplicații → TRANSLUX Peron →
     «Pornire automată» pornit; «Economisire baterie» → «Fără restricții». În «recente»,
     ține apăsat pe aplicație → lacăt (blochează închiderea).
   - **Huawei/Honor:** Setări → Baterie → Lansare aplicații → TRANSLUX Peron → «Gestionare
     manuală» → toate trei pornite (lansare automată, lansare secundară, rulare în fundal).
   - **Oppo/Realme/OnePlus:** Setări → Baterie → TRANSLUX Peron → «Permite activitatea în
     fundal» + «Pornire automată».

## 6. Corecții făcute în S02

Toate mici, în `peron-android/`; nimic pe server, nimic în `apps/*`:

| Fișier | Ce | De ce |
|---|---|---|
| `src/presence.ts` | `startTracking()` fără gardul `isTracking()`; `applyPresencePlan(plan, now, { foreground })`; `syncPresenceTracking` trimite `foreground: true` → cu serviciul deja «pornit», în fereastră și cu permisiunea, re-cheamă `startLocationUpdatesAsync` (idempotent, N3) | după repornire task-ul e restaurat fără serviciu (N2, N6); sub S01 serviciul cu notificare nu revenea nici la deschiderea aplicației |
| `src/presenceRules.ts` (+ test) | `shouldRefreshForeground(state)` — decizia pură pentru cazul de mai sus | testabilă cu `node:test`, ca restul regulilor |
| `src/presence.ts`, `app.json` | `requestPresencePermissions()` cere și `POST_NOTIFICATIONS` (Android 13+, `PermissionsAndroid`); permisiunea în `app.json` | altfel notificarea permanentă nu apare în bară pe Android 13+ — singurul lucru pe care spec-ul zice că îl vede operatorul |
| `build-apk.sh` | `expo prebuild --clean` la fiecare build (în loc de «doar dacă `android/` lipsește») | `android/` e ignorat de git și era vechi: manifestul **nu avea** `RECEIVE_BOOT_COMPLETED` și `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`; APK-ul dirijorului s-ar fi construit fără schimbările S01 din `app.json` |
| `src/presence.ts`, `src/backgroundRearm.ts` | antetele spun adevărul nativ (N1, N2, N7) | comentariile S01 descriau ce voia spec-ul, nu ce face biblioteca |

## 7. «Cum înțelegem că totul a reușit» — bifat, și ce rămâne de decis

Legendă: ✅ verificat pe cod/gate · ⚠️ parțial · 📱 rămâne pentru Ion.

- [x] ✅ `src/presence.ts`: serviciul nu se oprește la părăsirea ecranului/închiderea
      aplicației; doar în afara ferestrei sau la deconectare.
- [x] ⚠️ Task de `BackgroundFetch` cu `startOnBoot: true`, `stopOnTerminate: false`,
      înregistrat — **există**, dar «re-armează urmărirea în fereastră» e adevărat doar
      pentru oprire și golirea cozii; pornirea din fundal e refuzată de expo-location (N1).
- [x] ✅ `app.json` are `RECEIVE_BOOT_COMPLETED`; `expo-background-fetch`,
      `expo-intent-launcher` instalate; manifestul regenerat le conține.
- [x] ✅ Ecranul «Ultimul pas» există, apare o dată (`battery:done`), rândul de reamintire
      în ecranul zilei cât timp nu e făcut. 📱 Dialogul real de baterie.
- [x] ✅ typecheck-app, `npm test` (38), `npx expo export --platform android` verzi.

**Presupunerea greșită din spec** («Decizii fixate» → «Re-armare fără aplicație: … îl
pornește»; «Repornirea telefonului: `startOnBoot` acoperă re-armarea în cel mult 15 min»):
cu expo-location, serviciul cu notificare pornește **doar din prim-plan** (N1, N2). Fără
cod nativ (exclus explicit din scop), variantele sunt:

1. **Acceptăm limita** (fără cod nou): urmărirea pornește la prima deschidere a aplicației
   în fereastră (operatorul o deschide oricum la fiecare cursă) și de acolo merge singură,
   inclusiv închisă din «recente»; după o repornire revine la prima deschidere. Costul:
   «start întârziat» în raportul de seară când aplicația nu e deschisă la începutul
   ferestrei, și goluri după repornire/omorâre de către producător până la deschidere.
2. **Pornire degradată din fundal** (mic, în Expo): re-armarea cheamă
   `startLocationUpdatesAsync` **fără** `foregroundService` (permis din fundal cu
   «tot timpul») → locații rare (câteva pe oră, limita Android pentru fundal), fără
   notificare; la prima deschidere, `syncPresenceTracking` le ridică la serviciu complet
   (corecția S02 face deja partea a doua). Costul: ping-uri rare pot fi citite de raport ca
   goluri scurte; trebuie verificat pragul din `presencePeriods`.
3. **Cod nativ** (o sesiune nouă, config plugin): receiver `BOOT_COMPLETED` propriu care
   pornește serviciul de locație direct, plus pornirea din alarmă — singura variantă care
   dă «în cel mult 15 min după boot» din spec. Android 12+ o permite doar cu aplicația
   scoasă de la optimizarea bateriei (ecranul «Ultimul pas» rămâne necesar).

Recomandarea mea: 1 acum (APK-ul poate merge la operatori cu ce e), 3 dacă raportul de
seară arată că golurile de după repornire contează în practică.
