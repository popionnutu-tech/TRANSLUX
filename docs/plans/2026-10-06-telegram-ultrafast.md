# Telegram ultrafast: mini app-ul șoferului și mini app-ul clientului

Data: 06.10.2026. Cerere: Ion, «lansează 3 runde GPT ↔ Claude ca să faci totul în Telegram pentru șoferi și client să fie ultrafast».
Fișier canonic după aprobare: `docs/plans/2026-10-06-telegram-ultrafast.md` (copie a acestui fișier). Rubrica: `~/.claude/skills/plan-mode-review/rubric.md`.
Versiunea planului: **v6 — FINALĂ** (v2 = triajul revizorilor Claude; v3 = Codex runda 1; v4 = a doua trecere a revizorului backend; v5 = Codex runda 2; v6 = Codex runda 3, pass 9.5; secțiunile lor și triajele sunt la sfârșit).

## De ce

Șoferul deschide «🎫 Билеты» de 5–20 de ori pe zi, deseori pe 3G în sat; clientul deschide mini app-ul «🎫 Bilete» în minutele
dinaintea plecării ca să vadă unde e autobuzul. Pe viu, azi:

- **Șofer**: de la atingere până la listă sunt 3 descărcări în lanț (HTML → app.js → logica.js), 4 fișiere (~115 KB, JS
  neminificat, logo PNG 42 KB) plus SDK-ul blocant de pe telegram.org, apoi `/azi` răspunde în 261–816 ms (cald/rece) după
  5 hopuri secvențiale spre Supabase. Cache-ul local se folosește DOAR când `/azi` pică. Pe 3G: 2–4 s până la listă.
- **Client**: pagina e goală până vine JS-ul (177 KB gz, 13 fișiere); abia după hidratare pleacă cererea de bilete, prin DOUĂ
  servere (translux.md → central-hub → Supabase), fără nimic memorat local; serverul face 1 + până la 4×N interogări. Harta ia
  plăcuțele de la tile.openstreetmap.org (fără CDN), iar lanțul ETA e `/acum` → `/pozitie` → `/forme`, în serie.
- **Bot**: biletul cumpărat din Telegram vine prin jobul de 1 min (ION-266): 0–60 s după plată, nu «deodată». Fiecare poză de
  bilet se desenează din nou la cerere (0,5–1,0 s pe loc), inclusiv la fiecare /start.

## Ce facem

**Varianta aleasă — A: optimizare în loc, fără rescriere.** Aceleași două aplicații și același bot: lanțul de încărcare scurtat
la o descărcare, datele memorate local (pe cont) pentru prima afișare instantanee, cererea de date pornită înaintea JS-ului,
serverele cu 2–3 hopuri în loc de 5–8, livrarea biletului la eveniment (nu la ceas), cu revendicare atomică împotriva
dublării. Fiecare pas are cifră înainte/după.

Respins — B: rescrierea mini app-ului șoferului în Next/React (ca al clientului): ar aduce ~170 KB de JS în locul celor ~60 KB
și n-ar scurta nimic; problema e lanțul și cache-ul, nu cadrul.
Respins — C: scoaterea mini app-urilor și totul prin mesaje de bot: pierde scanarea cu camera, harta locurilor și harta
autobuzului, exact lucrurile pentru care s-au făcut mini app-urile (ION-190, ION-249).

## 🔬 Verificat pe viu (06.10.2026, de pe Mac mini; cererile de 3 ori)

| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Mini app-ul șoferului e „ușor" | curl -w pe central-hub | HTML 655 B (no-store, br); app.js 30 982 B + logica.js 29 157 B neminificate; stil.css 13 081 B; logo-white.png 42 604 B; `<script src="https://telegram.org/js/telegram-web-app.js">` blocant în `<head>` (route.ts:29); fără preload/modulepreload/preconnect | P1, P2 |
| Fișierele șoferului stau în cache | antetele Vercel | `cache-control: public, max-age=0, must-revalidate` (implicitul Vercel pentru `public/`; `next.config.js` al admin n-are Cache-Control, `apps/admin/vercel.json` n-are `headers`) → revalidare la fiecare deschidere | P1 |
| Cache-ul local dă prima afișare | app.js:12, 30-31, 44-51, 108, 113-146, 533-536 | cheie FIXĂ `bilete-sofer:cache` (nelegată de cont); starea inițială `ecran:'incarc'`; cache-ul se citește doar în `catch` după ce `/azi` pică; `/azi` cu `cache:'no-store'` pleacă abia după app.js + logica.js; 401 → ecran «nelegat» definitiv | P2, P3 |
| `/azi` e rapid | 3 cereri cu initData semnat al unui șofer real cu cursă azi | 816 / 303 / 261 ms, 7 394 B | P4, P5 |
| `/azi` are puține hopuri | sofer-auth.ts:18-37, sofer.ts:31-79, 132-142; packages/routing/src/assignments.ts:59-107 | 5 hopuri secvențiale: drivers → RPC bilete_plafon (cheia e din HMAC, nu din bază) → daily_assignments (TOATE ale zilei — NECESAR: harta tur/retur cu override IN/OUT se construiește din rândurile tuturor șoferilor) → [crm_routes ∥ crm_stop_fares ∥ route_shapes ∥ bilete_comenzi] → bilete; fără cursă curentă se repetă tot pentru mâine (până la 8 hopuri, 14 interogări) | P4 |
| Embed PostgREST comenzi→bilete | packages/db/migrations/483_bilete_online.sql:69,80 | FK unic `bilete.comanda_id → bilete_comenzi(id)` cu index → `bilete_comenzi(..., bilete(*))` merge; filtrul pe starea biletului cere `bilete!inner` sau filtrare în JS | P4, P8 |
| Șoferul reîmprospătează des | app.js:14-16, 520-524 | `/azi` la 60 s cât e vizibil și la fiecare revenire pe ecran, coada la 30 s | P4 |
| Testele app-ului șoferului | apps/admin/src/app/mini-app/bilete/logica.test.ts:8 | importă `../../../../public/mini-app/bilete/logica.js` — mutarea surselor rupe testul; `route.ts:18` `v = sha || 'dev'`; `package.json:6` fără `predev`; tsconfig `allowJs` + `src/**/*` | P1 |
| Clientul primește puțin JS | descărcarea celor 13 chunk-uri din /ro/telegram | 177 414 B gz: react-dom 54,9 KB, framework 46,9 KB, polyfills 39,8 KB (`noModule` → nu se descarcă pe telefoane moderne), 563-… 8,8 KB, 109-… (leaflet-wrapper) 9,6 KB, 8871-… 7,1 KB; CSS 10,5 KB gz | P7 |
| Pagina clientului vine repede | curl /ro/telegram, /ru/telegram | TTFB 72–173 ms (ro), 412 ms (ru, rece); HTML 31 KB (conține selectoarele de căutare pentru «Bilet nou», `revalidate = 900`, TelegramClientPage.tsx:11-14) | P7 |
| Biletele clientului vin direct | TelegramClientApp.tsx:76-88, telegram-actions.ts:17-19, bilete-api.ts:181-207 | abia după hidratare: `useEffect` → server action `bileteleMeleTelegram` (poate fi chemat deja de oricine are un initData) → `POST central-hub/api/bilete/client/bilete` cu `Authorization: Bearer BILETE_API_KEY` + initData, `no-store`; nimic memorat local (doar initData în sessionStorage); răspunsul conține `contact` (nume, telefon, e-mail) și `istoric` (client-bilete.ts:54,119) | P6, P7, P8 |
| API-ul biletelor clientului e rapid | 3 cereri direct la central-hub `/api/bilete/client/bilete` cu initData | 247 / 235 / 143 ms, 13 460 B; lanț: HMAC → RPC plafon → [comenziActive ∥ ultimulContact (2 interogări în serie, client-repo.ts:24-34) ∥ istoric] → pentru FIECARE comandă `biletPublic` (1 + 3 interogări, QR SVG) (client-bilete.ts:101-120, public.ts:78-131) | P8 |
| CORS la panou are precedent | api/asistent-site/*/route.ts:27-30,57-58,67 | OPTIONS manual, origin exact; un antet personalizat face cererea «non-simple» → preflight la fiecare 10 min pe WebKit | P6 |
| Harta ia plăcuțe de la OSM direct | map-tiles.ts:13, 28-46; NowResults.tsx:22, 366, 525 | `https://tile.openstreetmap.org/{z}/{x}/{y}.png`; Leaflet din bundle prin `import('leaflet')` la montarea NowResults (doar când există bilet `curand`/`activa`); preconnect adăugat din JS, nu din HTML; `leaflet.css` static | P9 |
| ETA («Vine în N min») e un apel | NowResults.tsx:29, 38-56, 110-114, 144, 525-534 | din browser direct la central-hub `/api/asistent-site/acum`, apoi la nevoie `/pozitie`, apoi `/forme` — în serie; reîmprospătare la 60 s | P9 |
| SDK-ul Telegram se încarcă la client | grep apps/web | NU: CSP-ul site-ului nu lasă telegram.org; initData se ia din `location.hash` (telegram-client.ts:75) și evenimentele se trimit direct (BiletActiuni.tsx) | P2 |
| CSP lasă scriptul inline și cererile noi | apps/admin/next.config.js:25, apps/web/next.config.js:24,47 | `script-src 'self' 'unsafe-inline'`; web `connect-src https://central-hub-md.vercel.app` | P2, P6 |
| Poza biletului pentru bot | 3 cereri `/api/bilete/public/<cod>/imagine?nr=1` | 965 / 486 / 586 ms, 95 814 B; fonturile cache-uite pe instanță (schedule-image.ts:11-30), dar QR + SVG 1050×1650 + sharp la FIECARE cerere, fără cache de rezultat (bilet-imagine.ts:38-101); `cod`/`nr` validate (imagine/route.ts:16) | P11 |
| Biletul din Telegram vine «deodată» | scheduler.ts:352-376, bilet-nou.ts:47-60 | jobul «Bilete noi» la 60 s; caută → trimite (1–3 s) → abia apoi `salveazaMesaj`: NU există revendicare atomică; singura serializare e zăvorul local `rulareFaraSuprapunere` | P10 |
| Plata e un eveniment în panou | pay/maib/callback/route.ts:183-195; lib/maib/sincronizare.ts:65; lib/bilete/comenzi.ts:483 | callback: `bilete_marcheaza_platita` → `after(email)` doar când `data > 0`; celelalte două NU citesc câte bilete s-au emis; nimic spre Telegram | P10 |
| Botul are un endpoint pe care îl poate chema panoul | apps/bot/src/index.ts:66-110, api/server.ts:27,155-160; bot-auth.ts:4-19 | NU există «panou → bot»; o cale în afara `/app/v1/` cade în ramura webhook-ului; `BILETE_BOT_API_KEY` e doar bot → panou (retur, plângere), refuzată sub 64 de caractere; adresa botului nu e în env-ul panoului | P10 |
| Panoul poate scrie în Telegram | lib/telegram-notify.ts | da: sendMessage/sendPhoto/pinChatMessage cu TELEGRAM_BOT_TOKEN | P10 (rezervă) |
| `after()` din next/server | callback/route.ts:192 | folosit doar în route handler; în lib ar arunca în afara unei cereri (scripturile «Run admin lib locally») | P10 |
| Pagina biletului pe site | curl /ro/bilet/<cod> | TTFB 488 ms, 56 KB | în afara planului |

Neverificat (fără acces de pe mini la un telefon real): timpul efectiv pe 3G. Rezervă: măsurătoarea «înainte/după» se face cu
Playwright pe VPS (Chromium, emulare telefon + throttling Fast 3G), nu din estimări — pasul P0. Neverificat: dacă 816 ms e pornire
la rece sau prima cerere TLS/DNS spre Supabase — P0 măsoară 5 apeluri după 10 min de liniște; P5 există doar dacă iese «rece».

## Pași

Ordinea (Ion, 06.10): **P0 → P1 → P2+P3 (un tichet) → P4 → P10 → P6 → P7 → P8 → P9 → P11 → P5 (condiționat) → P12.**
Fiecare pas e un tichet Linear, cu cifra înainte/după în handoff.

**P0 — Bancul de măsură (VPS, Playwright).** `/root/render/masoara-tg.mjs`: deschide mini app-ul șoferului (initData semnat de
probă, ca în testele ION-239, șofer de probă cu cursă) și al clientului (cont de probă cu un bilet), emulare telefon + Fast 3G;
notează timp până la lista de pasageri / până la cardul biletului, numărul de cereri, bytes, TTFB `/azi` și
`/api/bilete/client/bilete`, plus 5 apeluri `/azi` după 10 min de liniște (rece vs cald). 5 rulări, mediană. Rezultat: tabelul «înainte».

**P1 — Șofer: o singură descărcare, cache nemuritor.** Sursele RĂMÂN în `public/mini-app/bilete/` (`app.js`, `logica.js`; testul
`logica.test.ts` își păstrează calea); `esbuild` (devDependency explicită) în `prebuild` ȘI `predev` din `apps/admin/package.json`
scrie `public/mini-app/bilete/dist/app-<hash-conținut>.js` (bundle ESM, minify, target es2020) + `dist/manifest.json`; `route.ts`
citește manifestul (nu sha-ul, nu «dev»); `dist/` în `.gitignore`. `next.config.js` (admin) `headers()`: `source:
'/mini-app/bilete/dist/:file*'` → `Cache-Control: public, max-age=31536000, immutable` (nu prinde HTML-ul, care rămâne `no-store`).
`stil.css` inline în HTML. Logo: SVG inline dacă wordmark-ul există ca SVG în repo (se verifică în pas, `apps/web/public`), altfel
WebP ≈ 6 KB. Rezultat: 1 JS (~20 KB gz) + HTML; la a doua deschidere 0 revalidări; `vercel.json` buildCommand rulează `prebuild`.

**P2+P3 — Șofer: date înaintea JS-ului, prima afișare din cache (un tichet, după P1).**
(a) Script inline în HTML: DOAR dacă hash-ul are `tgWebAppData` și nu e `?mock=1`, pornește `window.__azi = fetch('/api/bilete-sofer/azi', …)`
cu initData din hash. app.js: `tg` citit leneș (`() => window.Telegram?.WebApp`), consumă `__azi` dacă există; la 401 al cererii
timpurii reîncearcă O dată cu `initData()` din SDK, abia apoi «nelegat». SDK-ul telegram.org cu `defer` (nu blochează parsarea; app.js
rămâne după el în ordine, deci cifra reală se citește în P12). Butonul «Scanează» cere SDK-ul gata.
(b) SWR: cheile localStorage (`cache`, `stare`, `coada`, `alerte`) includ `user.id` din initData; fără id → fără SWR. La pornire,
cache-ul contului mai nou de 12 h se randează imediat (bara «lista de la HH:MM» existentă), regula C1 pe datele din cache, apoi
`/azi` îl înlocuiește; la 401 cache-ul contului se șterge. Rezultat: listă pe ecran < 300 ms la a doua deschidere.
(c) Tranziția cheilor vechi (coada offline NU e dispensabilă — ține scanări nesincronizate): ÎNAINTE ca aplicația să citească
coada (app.js:30), la prima pornire a versiunii noi, dacă există cheile vechi fără cont (`bilete-sofer:coada`, `:stare:*`,
`:alerte:*`, `:cache`) și identitatea șoferului e cunoscută (initData), intrările se ÎMBINĂ (nu suprascriu) în cheile contului
curent (telefonul era al lui), apoi cheile vechi se șterg; fără identitate, cheile vechi rămân neatinse până la o pornire cu
identitate. Test: actualizare cu scanări offline restante → toate ajung la server după migrarea cheii.
(d) Coada nu se mai blochează la prima eroare, dar NU pierde scanări: azi `trimiteCoada` se oprește la primul răspuns ne-OK
(app.js:158, 170-186), iar 403 `cursa_straina` (scan/route.ts:65) ar ține pe veci coada unui telefon partajat. Nou, pe
răspunsuri: DOAR `403` cu corpul `{eroare:'cursa_straina'}` scoate din coadă cheia (cursa) respectivă, cu alertă roșie vizibilă
sub contor («N scanări respinse: cursă străină»), celelalte chei se trimit mai departe; `401` (scan/route.ts:52, initData
expirat) păstrează coada, reîmprospătează initData din SDK/hash și reîncearcă o dată, altfel ecranul «nelegat» cu coada
intactă; `429` păstrează coada și reîncearcă după `Retry-After` (implicit 60 s); orice alt 4xx/5xx/rețea lasă coada neatinsă,
ca azi. Teste: două chei, prima 403 → a doua ajunge la server; 401 → reautentificare → sincronizare; 429 → reluare după
temporizare; nicio scanare ștearsă în afara cazului 403 `cursa_straina`.

**P4 — Șofer: `/azi` în 3 hopuri.** Hop 1: `[drivers ∥ RPC bilete_plafon]` (cheia plafonului vine din HMAC, nu din bază). Hop 2:
`daily_assignments` COMPLET pe `in('assignment_date', [azi, mâine])` (fără filtru pe șofer — harta tur/retur cu override se face în JS
cu `build*AssignmentMap`, pe fiecare zi); nomenclatorul (crm_routes, crm_stop_fares, route_shapes) din cache pe instanță PE RUTĂ
(cheie `crm_route_id`, TTL 10 min, umplut la nevoie doar pentru rutele cerute cu `in(ids)` — niciodată «tot nomenclatorul»:
`crm_stop_fares` are 1 209 rânduri, iar PostgREST dă cel mult 1 000 pe cerere, memoria `supabase-max-rows-1000`; test care
compară numărul de opriri din cache cu cel din bază pentru o rută). Hop 3: `bilete_comenzi(..., bilete(id, nr, loc_nr, status,
cod_qr, urcat_at))` cu coloane explicite, ordonate după `nr`, pentru rutele șoferului; filtrarea biletelor `valid`/`urcat` în JS
(ca azi la sofer.ts:102; fără `!inner` ca să nu dispară comenzile). Test nou în `sofer-reguli.test.ts`: override A→B între
șoferi. Țintă < 150 ms cald.

**P10 — Bot: biletul în chat la eveniment, fără dublare.** (a) Migrație `516_bilete_telegram_livrare.sql`: DOUĂ coloane în
`bilete_comenzi`: `telegram_livrare_la timestamptz` (trimitere în curs — revendicarea) și `telegram_livrat_la timestamptz` (livrat
automat o dată). `telegram_mesaj_id` rămâne ce e azi (ultimul mesaj din chat; botul îl golește când clientul șterge mesajul,
fixareBilet.ts:61, bileteTelegram.ts:81). (b) Livrarea automată (job și `livreaza`) trimite DOAR când `telegram_livrat_la IS NULL`,
după revendicare atomică: `UPDATE bilete_comenzi SET telegram_livrare_la = now() WHERE cod = $1 AND telegram_livrat_la IS NULL AND
(telegram_livrare_la IS NULL OR telegram_livrare_la < now() - interval '2 min') RETURNING cod`; după trimitere reușită se scriu
`telegram_livrat_la = now()` și `telegram_mesaj_id`. Eșecul se tratează după cât s-a trimis: dacă pică ÎNAINTEA primului mesaj
→ revendicarea se anulează (`NULL`), nimic salvat, jobul reia; dacă pică DUPĂ ce primul mesaj a plecat (locuri trimise parțial:
trimiterea e câte un apel pe loc, bilet-nou.ts:32-44) → se salvează `telegram_mesaj_id` + `telegram_livrat_la` (biletul E în chat),
locurile rămase se reîncearcă o dată pe loc, iar dacă tot pică se scrie în jurnal și clientul le primește la `/start`. Un singur
helper `livreazaBiletul(cod)` = revendică → trimite → salvează sau anulează, folosit de job, de `livreaza` și de `/start`. Deci
biletul șters de client NU se retrimite automat (a fost ștergerea lui) — dacă Ion vrea retrimitere după ștergere, se spune explicit.
Tranziția comenzilor deja livrate (azi dovada e doar `telegram_mesaj_id`, bilet-nou.ts:56-57): migrația 516 face backfill
`UPDATE bilete_comenzi SET telegram_livrat_la = coalesce(updated_at, now()) WHERE telegram_mesaj_id IS NOT NULL AND
telegram_livrat_la IS NULL`; ordinea de lansare: migrația → deploy-ul botului → același UPDATE rulat încă o dată (script
`--exec`) imediat după deploy, ca să prindă livrările făcute de versiunea veche între cele două momente; până atunci selecția
jobului cere AMBELE `telegram_livrat_la IS NULL AND telegram_mesaj_id IS NULL` (ca azi), deci nimic nu se retrimite în fereastră.
Teste: două apeluri concurente; «șters de client → jobul nu retrimite»; «livrat înainte de migrare, apoi mesaj șters → nu se
retrimite»; «nelivrat înainte de migrare → se livrează o dată»; «prima poză reușește, a doua pică → mesaj salvat, locul 2 la
reîncercare/`/start`».
Reafișarea cerută de proprietar prin `/start bilet_<cod>` rămâne cum e azi (bilet.ts:210: biletul propriu se arată la FIECARE
cerere, inclusiv după ce mesajul a fost șters), cu o singură excepție: dacă livrarea automată e în curs (revendicare < 2 min și
`telegram_livrat_la IS NULL`), /start răspunde cu textul «Biletul sosește în câteva secunde» fără poze; dacă nu e livrat și
revendicarea reușește, /start trimite prin același helper. Teste: /start după livrarea automată (re-trimite), /start după mesaj
șters (re-trimite), /start cât livrarea e în curs (text, fără poze), eșec la trimitere după revendicare (revendicarea se anulează). (c) Endpoint nou în bot, dispecer separat în
`index.ts` ÎNAINTEA ramurii webhook: `POST /bilete/v1/livreaza` corp `{checkout_id}` ≤ 4 KB, `Authorization: Bearer <BILETE_LIVRARE_KEY>`
(cheie NOUĂ, separată pe direcție, ≥ 64 caractere, generată de Claude: în Railway și în Vercel ca env, fără chat); destinatarul se
recitește din bază; endpoint-ul «împinge» jobul `Bilete noi` prin același zăvor (`ruleazaAcum()` din `rulareFaraSuprapunere`) — nu
trimite singur. (d) Panou: `anuntaBotul(checkoutId)` = fetch 3 s, fără aruncare, chemat DOAR din route handlers / server actions, în
`after()`, când `bileteEmise > 0`: callback MAIB (deja are cifra), iar `sincronizare.ts` și `comenzi.ts:483` ÎNTORC `bileteEmise` către
apelanții lor (plati/actions.ts, impacare.ts, public.ts), care decid. Env nou în panou: `BOT_BASE_URL` (Claude, `vercel env add`).
Rezultat: biletul în chat < 3 s după confirmarea plății; jobul de 1 min rămâne plasa de siguranță.

**P6 — Client: biletele direct din browser, pornite înaintea JS-ului.** Panou: `POST /api/bilete/client/bilete` acceptă și cereri
din browser — cerere «simplă», fără preflight: `Content-Type: text/plain`, initData în CORP (niciodată în URL — ar ajunge în jurnale),
fără antete personalizate; HMAC + prospețime (24 h) ca la șofer, plafonul existent pe telegram_id; `OPTIONS` tratat ca la asistent;
`Access-Control-Allow-Origin` exact (`https://translux.md`, `www` dacă e în uz), `Vary: Origin`, fără credențiale, 403 fără origin
cunoscut; server action-ul rămâne rezervă (cu `BILETE_API_KEY`). `lib/public-paths.ts` + test. Site: script inline în pagina
`/telegram` (înainte de JS) ia initData din hash și pornește `window.__bilete`; `TelegramClientApp` o consumă. Rezultat: dispar hopul
site→panou și așteptarea hidratării.

**P7 — Client: SWR local + JS mai puțin.** În localStorage DOAR câmpurile cardului (cod, rută, ore, loc, stare), cheie pe
`telegram_id`, 12 h; fără `contact`, fără `istoric`; ștergere la 401 și la alt `telegram_id`; randare instantanee, apoi cererea o
înlocuiește. Tabul «Bilet nou» (HomePage + selectoarele din HTML) pe `dynamic(() => import(...))`, încărcat la prima atingere. Țintă:
≤ 120 KB gz la prima afișare, card < 300 ms la a doua deschidere.

**P8 — Client: `/api/bilete/client/bilete` în 2 hopuri cald, 3 rece.** Id-urile rutelor și opririlor vin DIN comenzi
(public.ts:81-89), deci nu pot fi cerute în paralel cu ele; nomenclatorul (crm_routes, crm_stop_fares) se ia din același cache pe
instanță PE RUTĂ ca la P4 (umplut la nevoie pentru rutele comenzilor — hopul «rece»). Lanț: `RPC plafon → [comenzi active +
istoric cu `bilete(id, nr, loc_nr, status, cod_qr, urcat_at)` încorporat (FK unică, 483:69), ordonate după `nr` ∥ contact]`, apoi
rutele/opririle din cache (sau un hop la rece). Asamblarea unui bilet (ore, nume opriri, QR SVG) se face într-o SINGURĂ funcție
pură, folosită și de `biletPublic` (pagina biletului) și de lista clientului — nu două implementări; test că dau același rezultat
pe aceeași comandă. `contact` își păstrează semantica
de azi (client-bilete.ts:43, client-repo.ts:24-43: numele/telefonul din cea mai recentă comandă indiferent de stare, e-mailul din
cea mai recentă comandă cu e-mail), dar într-o SINGURĂ interogare: ultimele 20 de comenzi ale contului după `created_at`
(`passenger_name, phone, email, status`), din care se iau primul rând și primul rând cu e-mail; dacă niciuna din cele 20 n-are
e-mail, a doua interogare de azi rămâne ca rezervă (rar). QR SVG rămâne. Țintă < 120 ms cald, < 250 ms rece; se măsoară separat.

**P9 — Client: harta și ETA.** (a) `<link rel="preconnect">` static în HTML pentru central-hub și originea plăcuțelor; (b) `/forme`
în paralel cu `/pozitie`, memorat în localStorage cu versiunea din răspuns; (c) plăcuțe de la furnizor cu CDN (decizia lui Ion):
cont gratuit MapTiler (100 000/lună) sau Stadia, cheia în `NEXT_PUBLIC_MAP_TILE_URL` pe translux-web (env, nu chat), atribuirea
corectă în `TILE_ATTRIBUTION`. Rezultat: drumul desenat < 1 s după card.

**P11 — Poza biletului: cache de rezultat pe instanță (nu Storage).** În `imagine/route.ts`, cache în memorie
`cod:nr:status:ziua-Chișinău` → PNG (LRU 200, TTL 6 h); invalid la schimbarea stării și la schimbarea zilei locale (poza scrie
«Azi»/«Сегодня» când cursa e în ziua randării, bilet-imagine.ts:27-31,48 — după miezul nopții eticheta ar rămâne greșită); test
pe trecerea dintre două zile. Storage-ul privat se amână: fără estimare de volum și cu
cursă față de P10. Rezultat: a doua cerere a aceleiași poze < 100 ms; prima rămâne 0,5–1 s (botul o cere o singură dată per livrare).

**P5 — (condiționat de P0) Fără pornire la rece.** Doar dacă P0 arată «rece» după liniște: cron pe VPS `*/4` care cheamă `/azi`
cu un initData semnat al unui șofer de probă dezactivat (ca să treacă de 401 și să atingă Supabase), nu o cerere goală. Altfel
pasul se taie.

**P12 — Măsurătoarea «după» și raportul.** P0 din nou; tabel înainte/după; ce nu a atins ținta se spune explicit.

## Fișiere

- Șofer: `apps/admin/src/app/mini-app/bilete/route.ts` (HTML: CSS inline, script de pornire `/azi`, SDK `defer`, JS din manifest),
  `apps/admin/public/mini-app/bilete/{app.js,logica.js}` (rămân; `dist/` generat, ignorat), `apps/admin/package.json` (`prebuild`,
  `predev`, devDependency `esbuild`), `apps/admin/scripts/build-mini-app.mjs` (nou), `apps/admin/next.config.js` (Cache-Control
  immutable pe `/mini-app/bilete/dist/`), `.gitignore`, `apps/admin/src/lib/bilete/sofer.ts` + `sofer-auth.ts` (P4), teste
  `sofer-reguli.test.ts` (+ override A→B), `logica.test.ts` (neschimbat).
- Bot/plată: `packages/db/migrations/516_bilete_telegram_livrare.sql`, `apps/bot/src/index.ts` (dispecer `/bilete/v1/*` înaintea
  webhook-ului), `apps/bot/src/api/livrare.ts` (nou: cheie, corp, `ruleazaAcum`), `apps/bot/src/scheduler.ts` (`ruleazaAcum`),
  `apps/bot/src/handlers/bilet-nou.ts` + `handlers/bilet.ts` (revendicare atomică), `services/bileteTelegram.ts` (`revendica`,
  `anuleazaRevendicarea`), teste `bilet-nou.test.ts` (+ concurență), `apps/admin/src/lib/bilete/anunta-botul.ts` (nou),
  `api/pay/maib/callback/route.ts`, `lib/maib/sincronizare.ts` + apelanții (`plati/actions.ts`, `lib/bilete/impacare.ts`,
  `lib/bilete/public.ts`), `lib/bilete/comenzi.ts`; `api/bilete/public/[cod]/imagine/route.ts` (P11).
- Client: `apps/web/src/app/{ro,ru}/telegram/page.tsx` + `components/telegram/TelegramClientPage.tsx` (script inline, preconnect),
  `components/telegram/TelegramClientApp.tsx` (consumă `window.__bilete`, SWR, HomePage dynamic), `lib/bilete-api.ts` (rezervă),
  `components/NowResults.tsx` (P9 b), `lib/map-tiles.ts` (atribuire). Panou: `api/bilete/client/bilete/route.ts` (cerere simplă + CORS),
  `lib/bilete/client-bilete.ts`, `client-repo.ts` (P8), `lib/public-paths.ts` + test, `client-bilete.test.ts`.
- VPS: `/root/render/masoara-tg.mjs` (P0/P12), crontab (P5, condiționat).

## Riscuri

| Risc | Unde | Rezervă |
|---|---|---|
| Bundle-ul minificat se comportă altfel decât sursa | P1 | esbuild `--format=esm --target=es2020`; testele pe sursă; smoke Playwright (P0) înainte de push |
| Deploy fără manifest (dev local) | P1 | `predev` îl generează; `route.ts` refuză cu 500 explicit dacă manifestul lipsește |
| SDK `defer`: scanarea cerută înainte ca SDK-ul să fie gata | P2 | butonul «Scanează» dezactivat până la `window.Telegram?.WebApp` |
| Cererea timpurie cu initData gol | P2 | pleacă doar cu `tgWebAppData` în hash; 401 → o reîncercare cu SDK |
| Lista altui cont pe telefon partajat | P3, P7 | chei pe `user.id`/`telegram_id`; ștergere la 401 |
| Cache-ul nomenclatorului servește rute schimbate până la 10 min | P4 | orele se schimbă prin migrație, rar; TTL 10 min |
| Biletul de două ori | P10 | revendicare atomică în bază înainte de trimitere; anulare la eșec; test de concurență |
| Botul nu răspunde la `livreaza` (rollover Railway) | P10 | panoul nu aruncă; jobul de 1 min livrează |
| Endpoint din browser pentru biletele clientului | P6 | initData doar în corp; HMAC + 24 h; plafon 30/min; origin exact; fără date de card; nu lărgește suprafața (server action-ul primea deja initData din browser) |
| `after()` în lib | P10 | `after()` doar în route handlers / server actions |
| Furnizorul de plăcuțe: limita gratuită | P9 c | OSM rămâne implicit în `map-tiles.ts` dacă env lipsește |
| Cronul de încălzire inutil | P5 | există doar dacă P0 arată pornire la rece |

## Verificare

- **Înainte/după (P0/P12)** pe VPS, Playwright, Fast 3G, mediana din 5: șofer — timp până la listă (< 1,0 s cald, < 1,8 s rece),
  bytes după prima deschidere (< 40 KB), `/azi` (< 150 ms cald); client — timp până la card (< 1,2 s), bytes inițial (< 120 KB gz),
  `/api/bilete/client/bilete` (< 120 ms); bot — plată de probă (test=true) → biletul în chat (< 3 s), fără dublare la 20 de plăți de
  probă cu `livreaza` + tick simultan; `/imagine` a doua cerere (< 100 ms).
- **Teste**: vitest admin (sofer-reguli + override, client-bilete, public-paths, logica.test), web (86 existente + SWR/`__bilete`),
  bot (bilet-nou + concurență + `livreaza`); tsc pe toate; pre-push.
- **Smoke pe prod** după fiecare tichet: șofer de probă deschide lista, scanează QR real (online + offline); client de probă vede
  biletul instant la a doua deschidere; harta desenează drumul.
- **Siguranță**: security-auditor pe P6/P10 la implementare; nicio cale nouă fără plafon.

## Întrebări pentru Ion (răspunse 06.10.2026)

1. Plăcuțele hărții: **furnizor cu CDN, cheie gratuită** (contul îl face Claude sau îl dă Ion; cheia în env, nu în chat).
2. SDK-ul telegram.org la șofer: **îl țin, încărcat în fundal (`defer`)**; scoaterea completă — tichet separat după P0.
3. Ordinea: **întâi șoferul, apoi biletul instant, apoi clientul**; P5 condiționat, la urmă.
4. `BOT_BASE_URL` pe Vercel: **îl pune Claude** cu `vercel env add`, fără să-l afișeze. (La fel `BILETE_LIVRARE_KEY`, nouă, în Railway și Vercel.)

## Triaj revizori Claude (v1 → v2)

| id | revizor | sev. | esență | decizie | motiv / unde în v2 |
|---|---|---|---|---|---|
| S1 | scalability | high | filtrarea atribuirilor în SQL pe șofer strică harta tur/retur cu override | acceptat | P4: `daily_assignments` complet pe ambele zile, harta în JS; test override A→B |
| S2 | scalability | medium | P11 Storage fără volum, cursă cu P10 | acceptat | P11 = cache de rezultat pe instanță; Storage amânat |
| S3 | scalability | low | embed cere `!inner` sau filtrare JS | acceptat | P4/P8: filtrare în JS, fără `!inner` |
| S4 | scalability | low | cronul de încălzire nu atinge baza, poate inutil | acceptat | P5 condiționat de P0, cu initData valid |
| Sec1 / H1 | security, backend | high | dublarea biletului (job + `livreaza` + /start) | acceptat | P10 b: revendicare atomică (migr. 516) + `livreaza` prin zăvorul jobului |
| Sec2 | security | medium | calea în afara `/app/v1` cade în webhook; cheie reutilizată | acceptat | P10 c: dispecer separat, `BILETE_LIVRARE_KEY` nouă ≥ 64, corp ≤ 4 KB |
| Sec3 / M5 | security, backend | medium | initData în URL ajunge în jurnale; preflight mănâncă hopul | acceptat | P6: POST `text/plain`, initData în corp, OPTIONS, origin exact |
| Sec4 | security | medium | localStorage cu contact/istoric | acceptat | P7: doar câmpurile cardului, pe telegram_id, ștergere la 401 |
| Sec5 | security | low | tiparul header-ului prinde HTML-ul | acceptat | P1: `/mini-app/bilete/dist/:file*` |
| Sec6 | security | low | bucket privat fără politici | acceptat (moot) | Storage amânat |
| M1 | backend | medium | `after()` în lib; sincronizare/comenzi nu știu câte bilete | acceptat | P10 d |
| M2 | backend | medium | 401 fals la cererea timpurie; `defer` nu deblochează app.js | acceptat | P2 a |
| M3 | backend | medium | cache-ul șoferului nelegat de cont | acceptat | P2+P3 b |
| M4 | backend | medium | testul `logica.test.ts`, versiunea «dev» + immutable, `predev`, `allowJs` | acceptat | P1: surse pe loc, hash de conținut + manifest, `predev`, `dist/` ignorat |
| L1 | backend | low | P2+P3 un tichet; P11 înaintea botului | acceptat | ordinea din «Pași»; P11 devine cache, fără dependență |
| L2 | backend | low | plafonul în paralel cu `drivers` | acceptat | P4 hop 1 |

Scor Claude (minimul revizorilor, v1): 1.7 · blocante deschise după triaj: 0.

## Review: scalability-auditor


1. **[high, −2.0] P4: filtrarea atribuirilor în SQL pe `driver_id`/`driver_id_retur` strică harta tur/retur.**
   Dovadă: `packages/routing/src/assignments.ts:59-107` (`buildTurAssignmentMap` ia primul rând pe rută; `buildReturAssignmentMap` are „override IN/OUT" între rânduri ale ALTOR șoferi); `apps/admin/src/lib/bilete/sofer.ts:31-38` (azi citește toate rândurile zilei din acest motiv). Retur-ul are driverul în `driver_id`, nu în `driver_id_retur`, deci filtrul propus ratează și cazul simplu.
   Scenariu: șoferul A are ruta 7 cu `retur_route_id=9`; șoferul B are ruta 9 fără override. Filtrat pe A, B nu vede rândul lui A cu override-ul spre 9, deci ruta 9 apare ca retur al lui B (corect doar la întâmplare); invers, A își vede retur-ul propriu al rutei 7, deși e „override OUT" (neatribuit). Șoferul vede/scanează pe cursa greșită, cu telefoanele pasagerilor altei curse.
   Corecție: păstrează `daily_assignments` complet pe dată, dar într-o singură interogare `.in('assignment_date',[azi,mâine])` (câteva zeci de rânduri), cu filtrarea prin `build*AssignmentMap` în JS pe fiecare zi. Câștigul de hop rămâne; testul `sofer-reguli` primește cazul override A→B.

2. **[medium, −1.5] P11: Storage pe instanță MICRO fără estimare, cu cursă între P10 și P11.**
   Dovadă: planul pornește PNG-ul (sharp, 0,5–1,0 s/loc, `bilet-imagine.ts`) în același `after()` cu apelul spre bot (P10, țintă < 3 s). Botul cere `/imagine` înainte ca fișierul să fie scris, deci redesenează oricum, iar plata a făcut și o randare în plus, pe instanța care procesează callback-ul MAIB. Baza a înghețat pe NANO la 01.10 (memoria `supabase-nano-incident`); P11 adaugă urcări Storage pe aceeași instanță, fără volum estimat (95 KB × locuri × comenzi/zi).
   Corecție: scoate P11 din prima val; după P10, dacă `/imagine` rămâne ținta (<150 ms nu se vede în chat la 0,5 s dintr-un job care oricum trimite poza), cache de rezultat în memoria instanței (cheie `cod:nr:status`) e mai simplu decât Storage. Dacă rămâne Storage: randare ÎNAINTE de apelul spre bot, în aceeași promisiune, și estimare de volum în plan.

3. **[low, −0.5] P8: embed-ul `bilete_comenzi(..., bilete(*))` merge, dar filtrul pe starea biletului cere `!inner`.**
   Dovadă: FK există, `packages/db/migrations/483_bilete_online.sql:69` (`bilete.comanda_id REFERENCES bilete_comenzi(id)`) cu index `:80`; singura legătură între cele două tabele, deci fără ambiguitate PostgREST. Dar azi `sofer.ts:77-78` filtrează `bilete.status in ('valid','urcat')`; ca embed, `.in('bilete.status',…)` lasă comanda cu `bilete: []`, nu o scoate. Pentru șofer (P4) folosește `bilete!inner(...)` sau păstrează filtrarea în JS pe comenzile fără bilete vii (ca la `sofer.ts:102`).
   Notă: `client-repo.ts:24-34` confirmă cele două interogări seriale la `ultimulContact`; indexul `bilete_comenzi_telegram_idx` (`483:65`) le acoperă, deci câștigul P8 e real (`client-bilete.ts:116`: 1+3 interogări per comandă, în paralel).

4. **[low, −0.5] P5: cronul de încălzire încălzește puțin.**
   Dovadă: `apps/admin/src/app/api/bilete-sofer/azi/route.ts:17-18` ieșire 401 înainte de `plafonSofer`/`raspunsAzi`, deci nu atinge nici Supabase, nici restul modulelor lazy. Cu Fluid compute (instanțe reutilizate și concurente) pornirea la rece e oricum rară, iar o cerere la 4 min încălzește o singură instanță. Fără acest fapt măsurat, 816 ms ≠ pornire la rece (poate fi doar prima cerere de după TLS/DNS Supabase).
   Corecție: lasă P5 la urmă și condiționat de P0 (rece vs cald la 5 apeluri după 10 min liniște); nu-l tratezi ca pas.

5. **Fără observații (verificat):**
   - Plafoane: `bilete_plafon` e scriere pe fiecare cerere (DELETE + SELECT count + INSERT; `483:151-160`, măturare 2 % a tabelei în 486:63) — la 50 de șoferi × 1/min și clienți puțini e neglijabil. Dacă P6/SWR dublează ritmul de cereri, vezi punctul 2 (aceeași instanță); altfel „nu e nevoie".
   - Cache nomenclator pe instanță (TTL 10 min) e corect pentru date de citire care se schimbă prin migrație; instanțele concurente pot servi versiuni diferite până la 10 min, acceptabil cum spune planul.
   - P1/P2/P3: `app.js:108`, `:114-134` confirmă că cache-ul se citește doar în `catch`; SWR schimbă exact asta, risc mic. Bundle esbuild + `?v=` + immutable: fără probleme de scalare.
   - Cheia cu `CORS` + HMAC fără DB înainte de plafon (P6) pune costul cererilor false pe CPU (HMAC), nu pe bază: bine; plafonul se aplică doar după identitate.

Scor: 5.5 · Blocante (critical/high): 1

## Review: security-auditor

Verificat în cod (read-only): sofer-auth.ts, init-data.ts, client-bilete.ts, api/bilete/client/bilete/route.ts, telegram-actions.ts,
public-paths.ts, bot-auth.ts, apps/bot/src/api/server.ts, apps/bot/src/index.ts, handlers/bilet-nou.ts, scheduler.ts,
imagine/route.ts, next.config.js (admin + web), mini-app/bilete/route.ts.

**Ce e corect (fără deducere):**
- P6 nu deschide o gaură nouă de identitate: acțiunea `bileteleMeleTelegram` e deja apelabilă de oricine cu un initData
  (apps/web/src/app/(public)/telegram-actions.ts:17-19), deci `BILETE_API_KEY` nu aduce azi o apărare reală în plus;
  identitatea stă în HMAC (init-data.ts:29-47, timingSafeEqual, 24 h), apoi plafonul pe telegram_id (client-bilete.ts:102-104)
  și filtrul pe cont (client-bilete.ts:112-115). Plafonul vine DUPĂ HMAC, deci fără initData valid nu se atinge baza.
- P2 / P6 CSP: inline e permis la admin (apps/admin/next.config.js:25, `'unsafe-inline'`, `connect-src 'self'` acoperă
  `/api/bilete-sofer/azi`) și la /telegram (apps/web/next.config.js:47, `connect-src … https://central-hub-md.vercel.app`).
  Nu trebuie relaxat nimic. Condiție: scriptul inline nu interpolează nimic din server și nu scrie initData în DOM.
- P11: `/imagine` validează deja `cod` (32 hex) și `nr` 1–10 (imagine/route.ts:16) — calea `<cod>/<nr>.png` nu poate ieși din bucket.

**1. high (−2.0) — P10: „dublarea e exclusă de telegram_mesaj_id" e fals în cod.**
Dovadă: bilet-nou.ts:50-57 citește lista `comenziPlatiteFaraMesaj`, trimite pozele, abia apoi `salveazaMesaj` (verificare,
nu revendicare atomică); protecția la suprapunere e doar flagul `ruleaza` al jobului (scheduler.ts:357-367), pe care
`livreaza` nu-l vede. Scenariu: plata confirmată la t → `livreaza` începe (2 locuri × 0,5–1 s desen + sendPhoto); tickul
jobului cade în fereastra de 1–3 s, citește aceeași comandă cu `telegram_mesaj_id` NULL → clientul primește biletul de
două ori, două fixări. La fel la două apeluri `livreaza` (callback MAIB repetat + sincronizare, comenzi.ts:483) și la
rollover Railway (două instanțe active, 409). Corecția planului: revendicare atomică în bază înaintea trimiterii (de ex.
`UPDATE bilete_comenzi SET telegram_trimitere_la = now() WHERE cod = $1 AND telegram_mesaj_id IS NULL AND
(telegram_trimitere_la IS NULL OR telegram_trimitere_la < now() - interval '2 min') RETURNING cod` — sau RPC echivalent,
cu REVOKE EXECUTE FROM PUBLIC), folosită de job, de `livreaza` și de /start; test cu două apeluri concurente → o singură trimitere.

**2. medium (−1.0) — P10: locul și autentificarea endpoint-ului din bot sunt nespecificate.**
Dovadă: `handleAppApi` răspunde doar sub `/app/v1/` (server.ts:27, 155-160), iar rutele lui cu `auth` folosesc tokenul de
operator (server.ts:173); orice alt POST cade în ramura webhook-ului (index.ts:66-105). „În api/server.ts lângă /app/v1"
duce fie la un 401 tăcut (secretul webhook-ului), fie la tentația de a pune ruta în `routes` cu `auth:false`. Corecția:
dispecer separat în index.ts, ÎNAINTEA webhook-ului, cu verificare copiată din bot-auth.ts:9-19 (fail-closed dacă cheia
lipsește sau are < 64 caractere, timingSafeEqual), corp limitat la 4 KB (nu MAX_BODY_BYTES 8 MB), corpul = doar
`checkout_id` validat ca format; destinatarul și starea se recitesc din bază (`platita`, `telegram_id`), nu din cerere.
Cheie separată pe direcție (`BOT_LIVRARE_API_KEY`), nu reutilizarea `BILETE_BOT_API_KEY`, al cărei contract scrie că
„deschide DOAR retur/plângere" (bot-auth.ts:4-5) — o scurgere într-o direcție nu deschide și cealaltă. 401 fără jurnal de corp.

**3. medium (−1.0) — P6: „GET (sau același POST)" lasă deschisă varianta cu initData în URL.**
Dovadă: azi initData vine doar în antet (api/bilete/client/bilete/route.ts:24); răspunsul conține nume, telefon, e-mail și
QR-urile de îmbarcare (route.ts:9-10, client-bilete.ts:54, 119). Scenariu: GET cu `?initData=` → ajunge în jurnalele
Vercel/CDN și în istoricul webview-ului; oricine le citește are 24 h (init-data.ts:13) acces la biletele valabile ale
clientului. Corecția: POST sau GET DOAR cu antetul `X-Telegram-Init-Data`, niciodată în query; `OPTIONS` exportat
(antetul custom cere preflight), `Access-Control-Allow-Origin` exact `https://translux.md` (+ `www` dacă există), `Vary:
Origin`, fără `Allow-Credentials`, `Cache-Control: no-store` păstrat; `BILETE_API_KEY` rămâne acceptată ca alternativă,
nu obligatorie. Test în public-paths.test.ts + test pe ruta cu origine străină → fără ACAO.

**4. medium (−1.0) — P7: în localStorage ajunge tot răspunsul, cu date personale.**
Dovadă: răspunsul are `contact` (nume, prenume, telefon, e-mail) și `istoric` (client-bilete.ts:54, 119); localStorage-ul
originii translux.md din webview-ul Telegram e comun tuturor conturilor Telegram de pe telefon și nu expiră singur.
Scenariu: telefon comun / alt cont Telegram pe același dispozitiv / Telegram Desktop pe un PC comun → cardul cu QR-ul
valabil și telefonul clientului se citesc din localStorage fără initData. Corecția: în cache DOAR câmpurile cardului
(cod, rută, oră, loc, QR) — fără `contact` și fără `istoric`; intrările mai vechi de 12 h și ale altor telegram_id se șterg
la pornire; la 401 `neautentificat` (cont dezlegat) cache-ul se șterge; biletele cu cursa încheiată nu se randează din cache.
Notat la riscuri ca date personale (Legea 195).

**5. low (−0.5) — P1(b): tiparul `/mini-app/bilete/:file*` prinde și pagina HTML.**
Dovadă: `:file*` acceptă zero segmente, deci și `/mini-app/bilete`, servit de route.ts:36-39 cu `no-store`; next.config.js:8-29
nu are azi reguli pe cale. Scenariu: HTML-ul primește `immutable` 1 an → șoferul rămâne pe versiunea veche, inclusiv după
o reparație de securitate. Corecția: `has: [{ type: 'query', key: 'v' }]` și sursă pe extensii (`/mini-app/bilete/:file(.*\\.(?:js|css|svg|webp))`),
plus verificare cu curl a antetului HTML-ului după deploy.

**6. low (−0.5) — P11: bucket-ul privat e descris, nu fixat.**
Dovadă: planul spune „migrație doar dacă…, altfel prin API" fără `public=false` explicit și fără regula pe `storage.objects`.
Corecția: bucket creat cu `public = false`, nicio politică pe `storage.objects` pentru `bilete-imagini` (doar service role),
fără URL-uri semnate spre client; ștergerea PNG-urilor și la returnare (rutele `/api/bilete/retur/confirma`), nu doar la anulare.

Deduceri: 2.0 + 1.0 + 1.0 + 1.0 + 0.5 + 0.5 = 6.0.

Scor: 4.0 · Blocante (critical/high): 1

## Review: senior-backend-engineer

**H1 — high (−2.0, defect de logică) · P10: dublarea NU e exclusă de `telegram_mesaj_id`.**
Dovadă: `apps/bot/src/handlers/bilet-nou.ts:47-60` — `comenziPlatiteFaraMesaj` → trimitere (poze, 0,5–3 s) → abia apoi `salveazaMesaj`; nicio revendicare atomică. Singura serializare e `rulareFaraSuprapunere` (`apps/bot/src/scheduler.ts:352-365`), locală jobului.
Scenariu: plata la T; `livreaza` pornește imediat și desenează pozele; tick-ul de 1 min cade în aceeași fereastră de 1–3 s, citește aceeași comandă fără mesaj → clientul primește biletul de două ori (≈2–5 % din cumpărări; la rollover Railway 2 instanțe, mai des).
Corecție: `livreaza` nu rulează propria trimitere, ci „împinge" același job prin același zăvor (`ruleazaAcum()` exportat din `rulareFaraSuprapunere`, cu flag „încă o trecere" dacă jobul rulează deja). Filtrul pe checkout devine inutil. Pentru 2 instanțe — revendicare atomică în bază (`UPDATE … SET trimitere_la=now() WHERE telegram_mesaj_id IS NULL AND (trimitere_la IS NULL OR trimitere_la < now()-'2 min') RETURNING`), tichet separat dacă se vrea.

**M1 — medium (−1.0) · P10: `after()` chemat din lib, nu din rută.**
Dovadă: `lib/maib/sincronizare.ts:65` și `lib/bilete/comenzi.ts:483` nu citesc rezultatul RPC (nu știu dacă s-au emis bilete, spre deosebire de `callback/route.ts:191`); `sincronizare` e chemat din `plati/actions.ts`, `lib/bilete/impacare.ts`, `lib/bilete/public.ts`.
Scenariu: helperul cu `after()` în lib aruncă „after() outside request scope" la rularea lib-ului din script (rețeta „Run admin lib locally") → sincronizarea raportează eroare după ce biletele s-au emis. Plus anunț pentru fiecare sincronizare idempotentă (data=0).
Corecție: `anuntaBotul(checkoutId)` e o funcție simplă (fetch 3 s, fără aruncare); `after()` se cheamă DOAR în route handler/server action; lib-urile întorc `bileteEmise: number` iar apelantul decide. Anunț doar la `> 0`.

**M2 — medium (−1.0) · P2: pornirea timpurie a `/azi` poate da ecran fals «nelegat»; `defer` nu deblochează app.js.**
Dovadă: `app.js:6` (`tg` capturat la evaluarea modulului), `app.js:44-51` (initData întâi din SDK, apoi din hash), `app.js:113-116` (401 → `nelegat` definitiv), `route.ts:29,33`.
Scenariu: (a) client Telegram care nu pune `tgWebAppData` în hash → scriptul inline pleacă cu antet gol → 401 → app.js consumă `__azi` și arată «nelegat», deși `tg.initData` era valid; (b) scripturile `defer` și `type=module` se execută în ordinea documentului — app.js tot așteaptă descărcarea SDK-ului; doar parsarea și `/azi` se deblochează. Cu `async` în loc de `defer`, `tg` ar fi `null` la app.js:6.
Corecție: inline pornește doar dacă hash-ul are `tgWebAppData` și nu e `?mock=1`; app.js folosește `__azi` doar dacă există și, la 401 al cererii timpurii, reîncearcă o dată cu `initData()`; `tg` citit leneș (`const tg = () => window.Telegram?.WebApp`). Cifra „SDK nu mai blochează" se reformulează.

**M3 — medium (−1.0, izolare pe dispozitiv partajat) · P3: cache-ul șoferului nu e legat de cont.**
Dovadă: `app.js:12` cheie fixă `bilete-sofer:cache`; azi se citește doar la eroare (`app.js:128`), P3 îl arată la FIECARE deschidere, înainte de verificare.
Scenariu: telefon cu două conturi Telegram (sau șofer schimbat pe telefonul de serviciu) → lista pasagerilor altui șofer (nume, telefoane) apare instant, până vine 401.
Corecție: cheia cache-ului (și a stării/cozii) include `user.id` din initData (hash sau SDK); fără id → fără SWR. Același lucru e deja prevăzut la client (P7) — aliniat.

**M4 — medium (−1.0, gol de acoperire) · P1: build și versiune.**
Dovadă: `src/app/mini-app/bilete/logica.test.ts:8` importă `../../../../public/mini-app/bilete/logica.js` — mutarea surselor rupe testul, planul nu-l numește („logica.test?"); `route.ts:18` `v = sha || 'dev'` → cu `immutable`, un deploy fără sha (CLI/local) fixează pe telefoane o versiune „dev" pe un an; `apps/admin/package.json:6` `dev` nu are `predev` → `next dev` fără `app.min.js`; `tsconfig.json:27,33` `allowJs` + `src/**/*` → surse JS mutate în `src/` intră în `tsc`. Plan intern inconsecvent: „`public/mini-app/bilete/src/`" vs „mutate în `src/`".
Corecție: sursele rămân în `public/mini-app/bilete/src/` (testul își schimbă doar calea); esbuild scrie nume cu hash de conținut (`app-[hash].min.js`) + manifest citit de `route.ts` (nu sha); `predev` = același script; `app.min.js` în `.gitignore`. `prebuild` rulează automat sub `npm run build --workspace=apps/admin` (`vercel.json` buildCommand) — confirmat; esbuild 0.27.7 e deja în node_modules, dar se pune explicit în devDependencies.

**M5 — medium (−1.5, sarcină fără estimare) · P6: preflight CORS mănâncă hopul câștigat.**
Dovadă: precedentul `api/asistent-site/*/route.ts:27-30,57-58,67` (OPTIONS manual); antetul personalizat `X-Telegram-Init-Data` face cererea „non-simple" → OPTIONS + GET = 2 RTT pe 3G (≈300–600 ms), iar WebKit plafonează `Access-Control-Max-Age` la 600 s → la fiecare deschidere după 10 min preflight-ul revine.
Corecție: cerere simplă — `POST` cu `Content-Type: text/plain` și initData în corp (fără antete personalizate) → fără preflight; `Access-Control-Allow-Origin` exact (`https://translux.md`, `www` dacă există), `Vary: Origin`, refuz 403 fără origin ca la asistent. Notă pozitivă: suprafața nu crește real — azi server action-ul `bileteleMeleTelegram` acceptă oricum initData venit din browser, `BILETE_API_KEY` nu apără contra deținătorului initData. CSP web (`apps/web/next.config.js:24,47`) are deja `connect-src https://central-hub-md.vercel.app` — de verificat că e aceeași gazdă.

**L1 — low (−0.5) · Ordine/dependențe.**
P2 și P3 ating aceeași secvență de pornire (`app.js:108-146, 533-536`) → un singur tichet, după P1 (consumul `__azi` trăiește în bundle). P11 trebuie să deseneze ÎNAINTE de `anuntaBotul` în același `after()` (altfel botul cere `/imagine` cât PNG-ul încă se desenează și câștigul dispare la prima livrare) — deci P11 se integrează în helperul din P10, nu invers. P5 se decide după P4 (măsurat în P0).

**L2 — low (−0.3) · P4: plafonul nu depinde de `drivers`.**
Dovadă: `lib/bilete/sofer-auth.ts:37` — cheia e `sofer:${telegramId}`, iar telegramId vine din HMAC (`sofer-auth.ts:18`), fără bază. Corecție: `[drivers ∥ plafon]` în primul hop.

Scor: 1.7 · Blocante (critical/high): 1

## Critic extern - runda 1 (Codex, gpt-6-astra, 06.10 14:43)

Scor Codex: 4.0 · verdict: fail · critical/high: 2 (C1, C2). Fișier brut: scratchpad/critic-round-1.json.

| id | severitate | esență | decizie | motiv / unde în v3 |
|---|---|---|---|---|
| C1 | high | revendicarea cu `telegram_mesaj_id IS NULL` aplicată și la /start refuză reafișarea după prima livrare (bilet.ts:210 arată biletul propriu la fiecare cerere) | acceptat | P10 b: revendicarea doar pentru livrarea automată inițială; /start reafișează ca azi (și după mesaj șters); în fereastra de livrare în curs răspunde cu text, fără poze; 3 teste noi |
| C2 | high | P8: rutele/opririle nu pot fi cerute în paralel cu comenzile — id-urile vin din comenzi (public.ts:81-89) | acceptat | P8 rescris: nomenclatorul din cache-ul pe instanță (ca P4); 2 hopuri cald, 3 rece; ținte separate |
| C3 | medium | semantica `ultimulContact` (ultima comandă indiferent de stare; ultimul e-mail nenul) se pierde într-o listă filtrată pe stare | acceptat | P8: contactul din ultimele 20 de comenzi după `created_at`, într-o interogare, cu rezerva de azi pentru e-mail |
| C4 | medium | schimbarea cheilor localStorage lasă coada offline veche (scanări nesincronizate) inaccesibilă | acceptat | P2+P3 c: migrare o dată a cheilor vechi sub contul curent, cu test |

Blocante deschise după triaj: 0.

## Review: senior-backend-engineer (v3)

Doar ce s-a schimbat după runda 1 Codex (C1–C4). H1/M1–M3 din v1 rămân închise.

**N1 — high (−2.0, defect de logică, fapt verificat pe viu) · P8 (și P4): cache-ul „întregului" nomenclator pierde rânduri.**
Dovadă: `SELECT count(*) FROM crm_stop_fares` = **1 209** (06.10, prod); PostgREST taie la 1 000 de rânduri (memoria `supabase-max-rows-1000`); `public.ts:91` citește azi rândul exact `(crm_route_id, stop_order)`, deci azi nu se vede.
Scenariu: prima cerere „rece" umple cache-ul cu 1 000 din 1 209 rânduri, fără eroare; ~17 % din opriri rămân fără `sosire` în biletul clientului 10 min pe instanță (la P4: orele/prețurile opririlor lipsă la șofer).
Corecție: cache pe `crm_route_id`, umplut leneș (miss → `.in('crm_route_id', lipsă)`; 44 de rute, ~27 rânduri/rută), nu tabela întreagă; sau `.range()` până la pagina incompletă. Test: numărul rândurilor din cache = `count` pentru rutele cerute.

**N2 — medium (−1.0) · P10 b: SQL-ul nu face ce spune textul („doar livrarea inițială").**
Dovadă: `fixareBilet.ts:61` → `bileteTelegram.ts:81` pune `telegram_mesaj_id = NULL` când clientul a șters mesajul; jobul ia exact `telegram_mesaj_id IS NULL` în 48 h de la plată (`bileteClienti.ts:102-113`). `telegram_livrare_la` rămâne de la prima livrare, deci după 2 min condiția `< now() - 2 min` e adevărată.
Scenariu: clientul șterge biletul din chat → următorul tick de pin îl „uită" → jobul revendică și retrimite biletul nechemat (azi la fel; planul promite altfel și testele nu prind).
Corecție: două stări separate — `telegram_livrare_la` = revendicare în curs (anulată la eșec), `telegram_livrat_la` = livrat cu succes (nu se șterge la `uitaMesaj`); jobul și `livreaza` cer `telegram_livrat_la IS NULL`. Test: livrare → `uitaMesaj` → tick → nimic trimis. Dacă Ion vrea retrimiterea după ștergere, scrie-o explicit.

**N3 — low (−0.5) · P10 b: /start după revendicare reușită — eșecul nu e tratat.**
Dovadă: `bilet.ts:216-224`: eroarea cade în `catch` cu „Încearcă peste un minut", fără anularea revendicării; trimiterea pe poze (`bilet.ts:150-157`) poate pica după prima poză.
Corecție: același helper „revendică → trimite → salvează / anulează" pentru job, `livreaza` și /start (o singură implementare, nu trei); în plan: la eșec după ≥ 1 poză se salvează id-ul primului mesaj, nu se anulează (altfel poza 1 se dublează).

**N4 — medium (−1.0, gol de acoperire) · P8: al doilea constructor de `ComandaPublica`.**
Dovadă: `public.ts:78-131` (`biletPublic`) e folosit și de pagina publică, și ca `biletComplet` (`client-repo.ts:59`). Varianta pe lot din P8 reface aceeași asamblare (sosire, `ruta.nume_*` după `going_north`, `punct_urcare`, QR).
Scenariu: următoarea schimbare a biletului (ca ION-236 `sosire`) intră doar într-una din ele; mini app-ul și pagina arată bilete diferite.
Corecție: funcție pură `asambleazaComandaPublica(comanda, bilete, ruta, fare)` folosită de ambele căi; test: lot vs `biletPublic` pe aceeași comandă dau obiecte egale.

**N5 — low (−0.5) · P8: încorporarea `bilete(*)`.**
Dovadă: `public.ts:88` cere coloane explicite și `.order('nr')`. Corecție: `bilete(nr, loc_nr, cod_qr, status, urcat_at)` cu `order` pe tabelul încorporat (`referencedTable: 'bilete'`); istoricul nu are nevoie de încorporare (`client-repo.ts:42`).

**N6 — medium (−1.0) · P2+P3 c: coada migrată a altui șofer blochează coada contului curent.**
Dovadă: serverul refuză cursa altui șofer cu 403 `cursa_straina` (`scan/route.ts:15,65-66`); `postScan` aruncă la orice `!r.ok` (`app.js:158`); `trimiteCoada` iterează cheile în ordinea inserției și un `throw` oprește tot (`app.js:170-186`, `catch { rămâne în coadă }`).
Scenariu: telefon partajat (riscul e deja în tabelul planului, P3/P7) — scanările vechi ale lui A se mută sub B; la fiecare 30 s cheia lui A dă 403 înaintea cheilor lui B, iar scanările offline ale lui B nu mai ajung niciodată la server.
Corecție: 4xx pe o cheie (403/400) = terminal pentru acea cheie: se scoate din coadă cu alertă vizibilă, bucla continuă cu celelalte chei; doar rețea/5xx/timeout rămân în coadă. Test: coadă [cheie străină, cheie proprie] → a doua trimisă.

**N7 — low (−0.5) · P2+P3 c: ordinea migrării și îmbinarea.**
Dovadă: `S.coada` se citește la încărcarea modulului (`app.js:30`), înaintea oricărei identități. Corecție în plan: migrarea rulează sincron înainte de inițializarea lui `S` (identitatea din hash / `initDataUnsafe`, nu din răspunsul serverului); dacă cheia contului există deja, coada se ÎMBINĂ (concatenare, deduplicare pe `cod`), nu se suprascrie; ștergerea cheii vechi abia după scrierea reușită.

Închise fără deducere: C3 (contactul din ultimele 20 de comenzi păstrează semantica; azi maximum 1 comandă/cont pe prod), C2 ca ordine a hopurilor (corectă; problema e doar N1).

Scor: 3.5 · Blocante (critical/high): 1

## Triaj revizor backend, a doua trecere (v3 → v4)

| id | sev. | esență | decizie | unde în v4 |
|---|---|---|---|---|
| N1 | high | nomenclatorul întreg > 1 000 rânduri (crm_stop_fares 1 209) → cache trunchiat fără eroare | acceptat | P4/P8: cache PE RUTĂ, umplut la nevoie cu `in(ids)`; test pe numărul de opriri |
| N2 | medium | «doar livrarea inițială» nu e ce face interogarea: mesaj șters → `telegram_mesaj_id` gol → retrimitere | acceptat | P10 a/b: `telegram_livrat_la` separat de `telegram_livrare_la`; fără retrimitere după ștergere (decizie explicită, Ion o poate schimba) |
| N3 | low | eșecul la /start după revendicare | acceptat | P10 b: helper unic `livreazaBiletul` |
| N4 | medium | două implementări ale asamblării biletului | acceptat | P8: o singură funcție pură + test de egalitate |
| N5 | low | `bilete(*)` → coloane explicite, ordonate după `nr` | acceptat | P4, P8 |
| N6 | medium | coada mutată a altui șofer blochează coada (403 oprește tot) | acceptat | P2+P3 d: 4xx scoate doar cheia, alertă; test |
| N7 | low | migrarea cheilor înainte de citirea cozii; îmbinare, nu suprascriere | acceptat | P2+P3 c |

Blocante deschise după triaj: 0.

## Critic extern - runda 2 (Codex, 06.10)

Scor Codex: 3.5 · verdict: fail · critical/high: 2 (C1 critical, C2 high). Fișier brut: scratchpad/critic-round-2.json.

| id | severitate | esență | decizie | motiv / unde în v5 |
|---|---|---|---|---|
| C1 | critical | P2+P3 d scotea din coadă la ORICE 4xx, deci și la 401 (initData expirat) și 429 (plafon) — scanări pierdute | acceptat | P2+P3 d: doar 403 `cursa_straina` scoate cheia; 401 → reautentificare + reîncercare; 429 → reluare după Retry-After; teste pe toate trei |
| C2 | high | `telegram_livrat_la` nou fără backfill: comenzile deja livrate (dovada doar `telegram_mesaj_id`) ar fi retrimise | acceptat | P10 b: backfill în migrația 516 + același UPDATE după deploy-ul botului; selecția jobului cere ambele coloane NULL în fereastră; teste cu comandă livrată înainte de migrare |
| C3 | low | P10 b «la eșec revendicarea se anulează» contrazice tratamentul livrării parțiale din N3 | acceptat | P10 b: eșec înaintea primului mesaj → anulare; după primul mesaj → salvat ca livrat, locurile rămase reîncercate, apoi `/start`; test |

Blocante deschise după triaj: 0.

## Critic extern - runda 3 (Codex, 06.10)

Scor Codex: 9.5 · verdict: PASS · critical/high: 0. Fișier brut: scratchpad/critic-round-3.json.

| id | severitate | esență | decizie | unde în v6 |
|---|---|---|---|---|
| C1 | low | cache-ul pozei nu se invalidează la schimbarea zilei («Azi» rămâne după miezul nopții) | acceptat | P11: ziua Europe/Chisinau în cheia cache-ului; test pe trecerea dintre zile |

## Raportul procedurii (gate)

| Rundă | Partea Claude | Codex | Blocante deschise după triaj |
|---|---|---|---|
| v1 → v2 | scalability 5.5 · security 4.0 · backend 1.7 (min 1.7); 16 observații, toate acceptate | — | 0 |
| v2 → v3 | — | runda 1: 4.0, fail (2 high, 2 medium), toate acceptate | 0 |
| v3 → v4 | backend a doua trecere 3.5 (1 high, 3 medium, 3 low), toate acceptate | — | 0 |
| v4 → v5 | — | runda 2: 3.5, fail (1 critical, 1 high, 1 low), toate acceptate | 0 |
| v5 → v6 | — | runda 3: **9.5, PASS** (1 low, acceptată) | **0** |

Gate trecut: zero critical/high deschise la ambele părți după trei runde. Nicio observație respinsă — toate cele 27 au fost
acceptate și scrise în pași. Divergențe rămase: niciuna.

Decizii explicite ale lui Ion (06.10): plăcuțe cu CDN (cheie gratuită), SDK-ul șoferului rămâne cu `defer`, ordinea șofer →
bilet instant → client, env-urile le pune Claude. Decizie propusă de plan, de confirmat implicit la aprobare: biletul șters de
client din chat NU se retrimite automat (P10).

După aprobare: planul se copiază în `docs/plans/2026-10-06-telegram-ultrafast.md` și fiecare pas devine tichet Linear (ION-…),
în ordinea P0 → P1 → P2+P3 → P4 → P10 → P6 → P7 → P8 → P9 → P11 → P5 (condiționat) → P12.
