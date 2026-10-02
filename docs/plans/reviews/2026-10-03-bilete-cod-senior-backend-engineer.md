# Revizie de cod: bilete online, pasul 4 — fiabilitate (senior-backend-engineer, 03.10.2026)

Verificat: nicio funcție nu trece «noua» în «expirata»; `findCheckoutByOrderId` nu e chemat nicăieri; `bilete_marcheaza_platita` e chemat doar din callback; `maib_checkouts.order_id` e UNIQUE (482:10).

**REL-1 (high).** «noua» nu iese niciodată din starea asta, iar plafoanele o numără fără limită de timp (483:176, 178). Scenariu: 50 de pasageri abandonează pagina maib, iar `PLAFON_GLOBAL` oprește vânzarea pentru totdeauna; 3 abandonuri blochează un telefon. Corecție: plafoanele numără doar `created_at > now() - 30 min`; expirarea, ulterior, după starea Expired de la maib.

**REL-2 (high).** Nu există plasă pentru un callback pierdut. `sincronizeazaStare` scrie Completed (sincronizare.ts:37-47) fără să emită bilete. Scenariu: callback-ul pică repetat (baza NANO încremenită ca pe 01.10), maib nu mai reîncearcă, iar pasagerul a plătit și n-are bilet. Nu pleacă nicio alertă. Corecție: după Completed, `sincronizeazaStare` cheamă `bilete_marcheaza_platita`; pagina de întoarcere (successUrl) sincronizează comanda «noua» care are checkout_id.

**REL-3 (medium).** `createCheckout` poate dura până la 4 × 20 s: token, apel, apoi la 401 iar token și apel (client.ts:19, 198-200). Ruta are `maxDuration = 30` (route.ts:11). Vercel oprește funcția, comanda rămâne «noua», revendicată, iar pasagerul primește 409 timp de 2 minute. Corecție: un singur termen de 10 s pe operație și `maxDuration = 60`.

**REL-4 (medium).** Persistarea și legarea nu sunt atomice (comenzi.ts:237-249), iar asta contează. Scenariu: rândul din maib_checkouts se scrie, legarea pică. Reîncercarea cu aceeași cheie creează sesiunea B, care pică pe UNIQUE(order_id). Bucla se repetă la nesfârșit, cu o sesiune maib nouă la fiecare încercare. Corecție: la :196 caută după `order_id = comanda.id` și refolosește sesiunea; varianta curată e un singur RPC.

**REL-5 (medium).** Erori înghițite:
- config, `directiaDeschisa` și `areSofer` (comenzi.ts:65, 117, 127) dau «închis» (400) când baza e căzută, în loc de 503.
- `biletPublic` (public.ts:40) întoarce 404 pentru un bilet plătit.
- UPDATE/INSERT de la :228 și :246-247 nu sunt verificate.

Corecție: aruncă eroarea, ruta răspunde 503.

**REL-6 (medium).** comenzi.ts:227 tratează orice 4xx (inclusiv 401 după reîncercare și 429) ca refuz și trece comanda în «expirata», stare finală. O cheie greșită omoară comenzile pasagerilor. Corecție: doar 400 și 422 → «expirata».

**REL-7 (low, simplificare).** `leagaComandaOrfana` (callback/route.ts:177-203) nu poate fi atinsă: o sesiune nescrisă în bază nu ajunge la pasager. În plus, o legare cu 0 rânduri întoarce «legat», iar legarea eșuată dă 200 fără alertă. Corecție: șterge-o și pune în loc jurnal + `bilete_alerte`. Comentariul de la comenzi.ts:245 promite o împăcare care nu există.

**REL-8 (low).** Alerta `plafon_atins` (483:180) se pierde: `RAISE` anulează și INSERT-ul. Corecție: scrie alerta din TS.

**REL-9 (low).** route.ts:46 face `Boolean("false")`, care dă `true`, adică direcția opusă. Corecție: `=== true`, cu 400 pentru alt tip. `telegramId` nu ajunge nicăieri.

**REL-10 (low).** Reîncercarea cu aceeași cheie revalidează fereastra înainte de a căuta comanda existentă (:157 înainte de :196) și întoarce adresa moartă pentru «expirata». Corecție: adresa doar pentru «noua».

**REL-11 (low).** Callback-ul scrie `status` fără condiție (route.ts:148, 153); un Failed concurent poate rescrie Completed. Corecție: `.not('status','ilike','completed')`.

**REL-12 (low).** Fără `ip_hash`, toate cererile cad pe `''` (483:174), deci 5 comenzi la 10 minute pe tot site-ul. Corecție: 400 dacă lipsește.

Bine: emiterea biletelor e atomică și idempotentă (`FOR UPDATE`, suma verificată în bază), revendicarea împiedică două sesiuni simultane, iar callback-urile duble se serializează.

Blocante (critical/high): 2
