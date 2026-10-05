# ION-244 — Returnarea biletului online în botul Telegram, cu AI

Tichet: https://linear.app/p9group/issue/ION-244 · Dereva: `.claude/worktrees/ion-244-translux-bilete-online-returna`

## De ce

Ion, 05.10.2026: «trebuie să facem funcția returului». Returnarea biletului online se cere DOAR prin Telegram (decizia din
03.10, ION-190), «prin bot, cu AI» (decizia din 05.10, ca pe macheta https://claude.ai/artifact/V4bUAexsut1Lyht9NDSCiH,
ecranul «Returnarea cu AI»). Suma după grila lui Ion (ION-208): peste 24 h 135 lei; 24–12 h 120; 12–6 h 105; 6–4 h 90;
sub 4 h sau întârziat — nimic; din vina noastră — tot. Suma afișată rămâne valabilă **15 minute** (Ion, 05.10). Întârziatul
nu primește bani, dar biletul e valabil în aceeași zi, aceeași direcție, dacă șoferul are loc (ION-243, separat).

## Ce facem

**Ales:** nucleul e determinist și pe butoane — botul arată biletul clientului, cere «Returnează», panoul calculează suma din
grilă și o scrie ca **ofertă cu expirare de 15 min**, clientul confirmă cu un buton, panoul execută (anulare + refund
PARȚIAL la maib cu suma ofertei). AI-ul (Claude Haiku, deja folosit în proiect) doar **înțelege textul liber** al clientului
și îl îndrumă: alege una din 4 intenții (returnare / am pierdut cursa / e vina voastră / altceva) și răspunde în limba lui.
AI-ul nu calculează sume, nu confirmă și nu cheamă banca.

**Respins:**
1. AI-ul decide singur și cheamă refund-ul prin unealtă — banii ar depinde de un model; o frază ambiguă poate declanșa plata.
2. Botul cheamă direct maib din Railway — cheile maib și executorul (ION-194) stau în panou (Vercel); a doua implementare a
   banilor = două surse de adevăr.

## 🔬 Verificat pe viu

| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Executorul refund-ului există | `apps/admin/src/lib/bilete/refund.ts` (ION-194) | `anuleazaSiReturneaza(comandaId, {sursa:'ai', motiv})`: anulare atomică (`bilete_anuleaza`), revendicare, bancă; refuz explicit → reactivare | se refolosește, cu suma parțială |
| Executorul returnează suma din grilă | `apps/admin/src/lib/maib/refund.ts:40-50` | **NU**: `executaRefund` cere `p.refundableAmount ?? checkout.amount` = TOATĂ suma; grila (`refund-reguli.ts`, ION-208) nu e chemată nicăieri la bani | pas nou: `executaRefund` primește suma; executorul o ia din ofertă |
| maib acceptă refund parțial | `apps/admin/src/lib/maib/client.ts:268` (`refundPayment(paymentId, amount, reason)` cu `amount` în corp), `:93/:120` (stările `PartiallyRefunded`), `:126` (`partialRefundAvailable?`) | API-ul are sumă în cerere și stare «parțial returnat» | **neverificat pe sandbox** → rezervă în Riscuri |
| Plasa de timp | `app_config.bilete_anulare_pasager_min` = 240 (SQL 05.10) + `poateAnulaPasager` | sub 4 h executorul refuză sursa `ai` | coerent cu grila (sub 4 h = 0) |
| Grila | `refund-reguli.ts`: `noimiRestituire`, `sumaRestituire` (rotunjit în jos), testate | pură, în admin | oferta o folosește |
| Clientul e legat de bilet în bot | `apps/bot/src/handlers/bilet.ts` (`/start bilet_<cod>`) | arată biletul, **nu scrie** `telegram_id`; `bilete_comenzi.telegram_id` există (migr. 483) cu index; tabelul `clienti` nu există; 0 comenzi în bază (vânzarea închisă) | pas: legarea la `/start bilet_<cod>` |
| AI în bot | `apps/bot/src/config.ts:7` (`ANTHROPIC_API_KEY`), `apps/admin/src/lib/site-assistant/engine.ts:11` (`claude-haiku-4-5`) | cheia există în bot; modelul Haiku e folosit în asistentul site-ului | clasificarea textului cu Haiku |
| Botul vorbește cu panoul prin API cu cheie | `apps/admin/src/app/api/bilete/comanda/route.ts` (Bearer `BILETE_API_KEY`) | modelul există pentru site | rute noi cu aceeași cheie; în bot env `BILETE_API_KEY` + `CENTRAL_HUB_URL` (**neverificat** pe Railway → Ion le pune; fără ele butonul spune «momentan prin telefon») |
| Botul de producție | memoria «Railway bot deploys from deploy-bot» | botul se construiește din ramura `deploy-bot`, nu din main | livrarea botului = `git push origin <sha>:deploy-bot`, seara |
| Ultima migrație pe main | `git ls-tree origin/main packages/db/migrations` | 500 | N = max(origin/main)+1 |

## Pași

1. **Legarea** (bot): la `/start bilet_<cod>` cu comanda găsită → `UPDATE bilete_comenzi SET telegram_id = :from WHERE cod = :cod
   AND telegram_id IS NULL`. Linkul cu codul (32 hex, secret) e dovada; dacă e deja legat de alt cont, botul arată biletul
   dar nu oferă returnarea (o cere celui legat sau dispecerului). Banii se întorc oricum DOAR pe cardul plătitor.
2. **Migrația** `<N>_bilete_retur_oferte.sql`: tabel `bilete_retur_oferte` (id uuid, comanda_id FK, telegram_id, noimi 0–9,
   suma numeric, total numeric, creata_la, expira_la = +15 min, folosita_la, rezultat text); index unic parțial
   `(comanda_id) WHERE folosita_la IS NULL AND expira_la > …` (sau verificare în funcție); funcție
   `bilete_retur_foloseste(p_oferta uuid, p_telegram bigint)` atomică: ofertă existentă, a lui, neexpirată, nefolosită →
   marchează folosită, întoarce comanda_id + suma; altfel excepție. RLS fără politici, REVOKE anon/authenticated,
   GRANT service_role, probe (tiparul 483/490).
3. **Panou**: `lib/bilete/retur-bot.ts` + rute cu `Bearer BILETE_API_KEY`:
   - `POST /api/bilete/retur/oferta {telegram_id, cod}` → comanda legată de acel telegram_id, `platita`, nescanată; dacă
     timpul rămas < 4 h → `{suma:0, motiv:'sub_4h'}` (fără ofertă); altfel noimi + suma din grilă → rând nou în oferte →
     `{oferta_id, suma, expira_la, plecare}`.
   - `POST /api/bilete/retur/confirma {telegram_id, oferta_id}` → `bilete_retur_foloseste` → `anuleazaSiReturneaza(…,
     {sursa:'ai', motiv, suma})`; răspuns `creat | necunoscut | refuz` cu textul pentru client.
   - `POST /api/bilete/retur/escaladeaza {telegram_id, cod, text}` → `bilete_alerte` tip nou `retur_cerere` (dispecerul în
     /bilete), fără bani.
4. **Executorul cu sumă**: `anuleazaSiReturneaza` primește `suma?` (din ofertă, pentru sursa `ai`); `executaRefund` primește
   suma și refuză dacă suma > `refundableAmount` sau < 1 MDL; pentru `admin`/`sistem` rămâne suma integrală (comportamentul de
   azi). Suma 0 nu ajunge la executor (oferta nu se creează).
5. **Botul**: butonul «Returnează biletul» sub biletul salvat; mesajul cu biletul, suma și «valabil 15 minute» + butoanele
   «Anulează biletul și primește N lei» / «Păstrez biletul» (callback cu oferta_id); după confirmare: «Biletul e anulat.
   Banca a primit cererea de returnare a N lei; banii ajung pe cardul cu care ai plătit.» (doar ce a confirmat banca; la
   `necunoscut`: «Am trimis cererea; dispecerul o verifică»). Ofertă expirată → «Suma s-a schimbat, uite noua sumă».
6. **AI pentru textul liber** (bot, `services/returAi.ts`): mesaj privat fără comandă de la un client cu bilet legat →
   Haiku cu prompt scurt, ieșire JSON `{intentie: retur|intarziat|vina_noastra|altceva, lang}`; cod → acțiune:
   `retur` → pasul 5; `intarziat` → explicația (fără bani; biletul valabil azi în aceeași direcție dacă șoferul are loc —
   ION-243) + cursele următoare + telefonul șoferului; `vina_noastra` → escaladare (pas 3) + «dispecerul te sună»;
   `altceva` → telefonul dispeceratului. Fără răspuns de la model → meniul cu butoane. Textul clientului e date, nu
   instrucțiuni (fără unelte, ieșire validată).
7. **Teste**: grila la ofertă (limitele 24/12/6/4 h), expirarea celor 15 min, refolosirea ofertei (a doua confirmare
   refuzată), suma > refundable → refuz, sursa `admin` integral neschimbat; clasificarea AI cu răspuns invalid → meniu.
8. **Livrare**: migrația cu `db-migrate.sh` (`--dry-run` întâi); panoul prin push pe main; botul prin `deploy-bot` seara;
   env în Railway (`BILETE_API_KEY`, `CENTRAL_HUB_URL`) de la Ion.

## Fișiere

- `packages/db/migrations/<N>_bilete_retur_oferte.sql` (nou); `packages/db/src/types.ts`.
- `apps/admin/src/lib/bilete/retur-bot.ts` (+ test), `apps/admin/src/app/api/bilete/retur/{oferta,confirma,escaladeaza}/route.ts`,
  `apps/admin/src/lib/bilete/refund.ts` (suma), `apps/admin/src/lib/maib/refund.ts` (suma), `apps/admin/src/lib/public-paths.ts`/test
  (rutele noi cu cheie), `/bilete` (alerta `retur_cerere`).
- `apps/bot/src/handlers/bilet.ts` (legare + buton), `apps/bot/src/handlers/retur.ts` (nou, callback-uri),
  `apps/bot/src/services/returAi.ts` (nou), `apps/bot/src/bot.ts` (rutare mesaje libere ale clienților).

## Riscuri

- **maib nu acceptă refund parțial** (neverificat pe sandbox) → primul test e un refund parțial sandbox; dacă refuză,
  oprim și întrebăm pe Ion (variante: refund integral + plată de diferență nu există → atunci doar «peste 24 h» automat,
  restul la dispecer).
- **Dublă confirmare / două ferestre** → `bilete_retur_foloseste` atomic + revendicarea refund-ului din executor.
- **Link de bilet trimis altcuiva** → legarea e «primul venit»; banii merg doar pe cardul plătitor.
- **AI greșește intenția** → nu poate porni bani (doar arată butoane); cel mult un mesaj nepotrivit.
- **Botul vechi pe `deploy-bot`** → panoul se poate livra înainte; butonul apare abia când botul e livrat.

## Verificare

- vitest admin + bot, tsc; migrația `--dry-run` cu probe.
- Sandbox maib: comandă de test → `/start bilet_…` → «Returnează» → ofertă 135 → confirmare → refund creat; a doua ofertă la
  12–24 h simulată → 120 parțial.
- Text liber «am pierdut autobuzul» → explicația ION-243, fără bani.

## Review: business-logic-auditor

Zona: fluxul banilor (grila → ofertă → executor → maib → finalizare/împăcare → /bilete, alerte). Deciziile lui Ion
(bot cu AI, grila, 15 min, întârziatul fără bani) nu sunt puse în discuție.

1. **HIGH (−2.0, defect de logică) — oferta de 15 min trece peste plasa de 4 h a executorului.**
   Scenariu: ofertă creată la 4 h 10 min înainte → 90 lei «valabil 15 minute»; clientul apasă la 3 h 58 min →
   `bilete_retur_foloseste` marchează oferta folosită, apoi `anuleazaSiReturneaza(sursa:'ai')` aruncă `inchis`
   («sună la dispecerat»): clientul pierde suma promisă, oferta e arsă. Dovadă: `apps/admin/src/lib/bilete/refund.ts:55-59`
   (`poateAnulaPasager` cu 240 min pe `Date.now()`), `refund-reguli.ts:8` (strict `<`) vs `refund-reguli.ts:32` (`>= 4` →
   6/9 la exact 4 h). Sugestie: `expira_la = min(creata_la + 15 min, departure_at − bilete_anulare_pasager_min)`, sau
   pentru sursa `ai` cu ofertă plasa se verifică pe `oferta.creata_la`; aliniază pragul (4 h exact → 0 sau ambele `>=`);
   test pe limită.

2. **HIGH (−2.0, defect de logică) — tipul nou `retur_cerere` e respins de CHECK-ul din bază.**
   Scenariu: «e vina voastră» → `bilete_alerte.insert({tip:'retur_cerere'})` → încălcare `bilete_alerte_tip_check`;
   supabase-js întoarce `error`, nu aruncă (tiparul din refund.ts:71/76/90 nu verifică `error`), deci botul spune
   «dispecerul te sună» și nimeni nu află. Dovadă: `packages/db/migrations/489_bilete_email.sql:15-18` (lista închisă de
   tipuri). Sugestie: migrația N face DROP/ADD constraint cu `retur_cerere`; ruta `escaladeaza` verifică `error` și
   răspunde eșec; eticheta în `apps/admin/src/lib/bilete/alerte-mesaj.ts:13-24` (altfel apare «⚠️ retur_cerere»).

3. **MEDIUM (−1.0) — sursa `ai` fără `suma` cade tăcut pe refund integral.** Pasul 4 face `suma?` opțional; o rută nouă
   care uită s-o paseze plătește 135 în loc de grilă (`maib/refund.ts:47` ia `refundableAmount ?? amount`). Sugestie:
   pentru `sursa:'ai'` suma e obligatorie (aruncă dacă lipsește), plus test.

4. **MEDIUM (−1.0) — minimul de 10 MDL pe operațiune (ION-237) nu e tratat pentru refund parțial.** Bilet de 12 lei ×
   6/9 = 8 lei; dacă maib aplică minimul și la refund → refuz → `bilete_reactiveaza` (`refund.ts:94-101`), clientul vede
   «banca a refuzat». Pasul 4 verifică doar < 1 MDL. Sugestie: în sandbox încearcă și un refund < 10 MDL; până atunci,
   ofertă < `SUMA_MINIMA_PLATA_MDL` → escaladare la dispecer, nu executor.

5. **LOW (−0.5) — după un refund parțial nu mai există cale de bani pentru diferență.** Finalizarea parțialului e
   coerentă (Accepted → comanda `returnata`, biletele `returnat`, `refunded_amount` = parțialul, afișat în /bilete —
   `maib/refund.ts:82-93`, `impacare.ts:137-138`, `BileteClient.tsx:134`), dar apoi `anuleazaSiReturneaza` întoarce
   `fara_plata` (`refund.ts:49-51`) și `revendicaRefund` cere `refund_id IS NULL` (`maib/refund.ts:22`). Dacă se dovedește
   «vina noastră» după retur, dispecerul n-are buton. Sugestie: notează în Riscuri «diferența se dă manual din cabinetul
   maib» și adaugă la teste `finalizeazaRefund` cu refundedAmount < total → `returnata`.

Fără observații: împăcarea C acceptă parțialul (`refundedAmount > 0`), dubla confirmare e acoperită de funcția atomică +
revendicarea pe checkout, grila e pură și rotunjește în jos (`refund-reguli.ts:37-39`).

Scor: 3.5 · Blocante (critical/high): 2

## Review: security-auditor

Nucleul e sănătos: suma vine din grilă pe server, oferta e legată de `telegram_id` în bază, AI-ul nu are unelte și nu atinge
banii, `bilete_anuleaza` e idempotent și refuză biletul urcat (`packages/db/migrations/487_bilete_anulare.sql:22-25`), iar
revendicarea `refund_id IS NULL AND refund_status IS NULL` (`apps/admin/src/lib/maib/refund.ts:18-27`) împiedică al doilea refund.
Nu există altă cale pasager → refund integral care să ocolească grila (singurii apelanți: `bilete/actions.ts:120`,
`plati/actions.ts:193`, ambii `admin`). QR-ul (`cod_qr`, 483:71) e separat de `cod`-ul legării — bine.

Deduceri:
1. **−1.0 medium · fereastra de 15 min trece peste plasa de 4 h.** Ofertă la 4 h 10 min, confirmare la 3 h 58 min →
   `bilete_retur_foloseste` marchează oferta folosită, apoi `anuleazaSiReturneaza` aruncă `inchis`
   (`apps/admin/src/lib/bilete/refund.ts:55-59`). Fără pierdere de bani, dar clientul confirmă și primește refuz. Corecție:
   `expira_la = least(now()+15 min, departure_at − 240 min)`, iar sub 4 h 15 min oferta se scrie cu expirarea scurtată (sau
   nu se scrie); testul la limită în pasul 7.
2. **−1.0 medium · minimul de 10 MDL la refund nevalidat.** Treapta 6/9 pe un loc de 10–14 lei dă 6–9 lei
   (`packages/db/src/bilete-reguli.ts:67-71` — 10 MDL e «suma minimă a unei Operațiuni»); planul pune pragul la 1 MDL.
   Dacă banca refuză → reactivare, fără pierdere, dar clientul vede o ofertă imposibilă. Corecție: oferta nu se creează sub
   `SUMA_MINIMA_PLATA_MDL` (sau se verifică pe sandbox odată cu refund-ul parțial și se notează în «Verificat pe viu»).
3. **−1.0 medium · legarea «primul venit» fără recuperare.** Linkul `/start bilet_<cod>` stă în e-mail și în URL-ul paginii
   (ex.: biletul cumpărat de copil pentru părinte, e-mail redirecționat). Cine apasă primul poate anula biletul cu pierdere
   de până la 3/9 pentru cumpărător; titularul real nu are cale să-l recupereze. Corecție: la anulare din bot, notificare pe
   e-mailul/telefonul comenzii; confirmarea pe ofertă cere și ultimele 4 cifre ale telefonului din comandă; dispecerul poate
   dezlega (`telegram_id = NULL`) din /bilete.
4. **−0.5 low · funcția SQL: drepturi explicite.** Planul spune «REVOKE anon/authenticated»; funcțiile noi rămân executabile
   prin PUBLIC. Corecție: textual `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated; GRANT … TO service_role` ca în
   487:60-61, `SECURITY DEFINER SET search_path TO 'public'`, `SELECT … FOR UPDATE` pe ofertă, plus probă că anon primește
   `permission denied`. Index parțial cu `expira_la > now()` nu e permis (now() nu e IMMUTABLE) → verificarea doar în funcție.
5. **−0.5 low · cheia comună.** `BILETE_API_KEY` (`apps/admin/src/app/api/bilete/comanda/route.ts:17-27`) ar sta și pe
   translux-web, și pe Railway; scurgerea din oricare dă și crearea de comenzi, și anularea pentru orice `telegram_id`
   (cine are cheia + `cod`). Corecție: cheie separată `BILETE_BOT_API_KEY` pentru `/api/bilete/retur/*`, aceeași verificare
   timing-safe ≥ 64 caractere.
6. **−0.3 low · `public-paths.ts`:** cele trei rute ca intrări în `PUBLIC_EXACT` (`apps/admin/src/lib/public-paths.ts:38-56`),
   NU prefixul `/api/bilete/` sau `/api/bilete/retur/`; testul exhaustiv extins.
7. **−0.3 low · escaladare și AI fără plafon.** `escaladeaza` (text liber în `bilete_alerte`) și apelul Haiku: plafon pe
   `telegram_id`/comandă (ex. 3 alerte/zi, 20 clasificări/oră), `text` tăiat la 1000 caractere, `max_tokens` mic, ieșire
   validată strict pe enum. În bot, `telegram_id` se ia din `ctx.from.id`/`callbackQuery.from.id`, niciodată din callback_data.

Note fără deducere: oferta consumată când anularea eșuează — scrie `rezultat` și permite o ofertă nouă; ofertele paralele
pe aceeași comandă sunt acoperite de `bilete_anuleaza` + revendicare, dar `bilete_retur_foloseste` poate invalida surorile.

Scor: 5.4 · Blocante (critical/high): 0

## Review: senior-backend-engineer

Zona: botul (rutare client vs personal, /start, callback-uri), apelurile bot → panou, Haiku, deploy-bot, schema ofertelor,
testele. Deciziile lui Ion (bot cu AI, grila, 15 min) nu se discută.

1. **HIGH (−2.0, logică) — confirm observația 1 a business-logic-auditor** (oferta de 15 min vs plasa de 240 min pe
   `Date.now()`, `apps/admin/src/lib/bilete/refund.ts:55-59`, `refund-reguli.ts:6-8`). Din partea botului: clientul vede
   «Anulează și primește N lei» și primește «sună la dispecerat» cu oferta arsă. Sugestie: `expira_la = min(+15 min,
   departure_at − bilete_anulare_pasager_min)` în funcția SQL, iar botul arată ora-limită reală.
2. **MEDIUM (−1.0) — rezultatul confirmării se pierde la timeout bot → panou.** `confirma` face `getPayment` +
   `refundPayment` la maib (`maib/refund.ts:44-48`) după ce oferta e deja marcată folosită. Dacă fetch-ul din bot expiră
   (planul nu dă timeout) sau Railway repornește, panoul a anulat+returnat, dar clientul vede eroare; la reîncercare
   oferta e «folosită», iar `oferta` nouă refuză (comanda nu mai e `platita`). Sugestie: botul face
   `answerCallbackQuery` imediat, fetch cu `AbortSignal.timeout(~20 s)`, iar la timeout/5xx cheamă un `GET
   /api/bilete/retur/stare?oferta_id=` care citește `rezultat` (coloana există deja în schemă) — un singur adevăr, fără
   al doilea POST. Textele botului pe trei ramuri: `creat` / `necunoscut` / «verificăm, revenim» (nu «eroare»).
3. **MEDIUM (−1.0) — rutarea clientului în bot e nespecificată și intră în ramurile personalului.**
   `/start` fără payload pentru cineva fără `users` răspunde «Acces restricționat. Solicită un link de invitație»
   (`apps/bot/src/handlers/start.ts:55-60`), iar fallback-ul `bot.on('message')` la fel (`apps/bot/src/bot.ts:386-395`).
   Un client legat care scrie `/start` sau un mesaj înainte ca handlerul AI să fie pus corect primește textul
   personalului. Sugestie, în plan: (a) handlerul clienților se înregistrează în `bot.ts` ÎNAINTEA fallback-ului de la
   :386 și după cel al camioanelor (:373, care deja dă `next()` pe privat); (b) intră doar când `!ctx.dbUser` și există
   comandă legată `platita` cu plecare viitoare (indexul `bilete_comenzi_telegram_idx`, migr. 483:65); (c) `/start`
   fără payload, fără `dbUser`, cu bilet legat → lista biletelor cu «Returnează»; (d) personalul care are și bilet:
   meniul personalului rămâne, returnarea doar din butonul biletului (decis explicit, nu lăsat la întâmplare).
4. **MEDIUM (−1.0) — teste lipsă pe partea botului.** Pasul 7 testează panoul și clasificarea, nu rutarea: client fără
   `dbUser` → AI/meniu client (nu «Acces restricționat»); personal → meniul de azi neschimbat; `/start bilet_` legat de
   alt cont → fără buton; callback `retur:` cu ofertă expirată/folosită; timeout la panou → ramura «verificăm».
   Există tiparul `apps/bot/src/handlers/bilet.test.ts`, `sofer.test.ts` — funcții pure + handler cu ctx fals.
5. **LOW (−0.5) — indexul unic parțial cu `expira_la > now()` nu se poate crea** (`now()` nu e IMMUTABLE în predicatul
   unui index). Sugestie: scoate varianta din plan; unicitatea «o ofertă deschisă pe comandă» se face în funcția de
   creare a ofertei (`SELECT … FOR UPDATE` pe comandă, ofertele vechi deschise → `folosita_la`/`rezultat='inlocuita'`).
   Atunci și crearea ofertei e o funcție SQL, nu insert din TS.
6. **LOW (−0.5) — `BILETE_API_KEY` reutilizată pentru rutele de bani ale botului.** Aceeași cheie stă pe serverul
   site-ului (`apps/web/src/lib/bilete-api.ts:75`); oricine o are poate cere oferte/confirmări pentru orice
   `telegram_id`. Banii merg tot pe cardul plătitor, deci nu e blocant. Sugestie: cheie separată `BOT_RETUR_API_KEY`
   (aceeași verificare `timingSafeEqual`, `apps/admin/src/app/api/bilete/comanda/route.ts:14-26`), pusă doar în Railway.
7. **LOW (−0.5) — Haiku în bot fără parametri.** Botul n-are încă Haiku (folosește `claude-sonnet-5`,
   `apps/bot/src/services/driverCheck.ts:23`, `camioaneTrasee.ts:11`). Sugestie: constantă `RETUR_AI_MODEL =
   'claude-haiku-4-5'`, `max_tokens` ~100, timeout ~8 s, ieșire validată cu zod pe enum; fără cheie/timeout/JSON invalid →
   meniul cu butoane (planul o spune deja); chemat doar pentru clienți cu bilet legat activ (cost mărginit și de
   `rateLimit` 30/min, `middleware/rateLimit.ts`).

Fără observații: `deploy-bot` e strămoș al `main` (`git merge-base --is-ancestor` OK; diferența pe `apps/bot` e doar
ION-237), callback_data `retur:<uuid>` < 64 octeți, dubla confirmare acoperită de funcția atomică + `revendicaRefund`
(`maib/refund.ts:16-26`), împăcarea C acceptă parțialul (`impacare.ts:137-138`).

Scor: 3.5 · Blocante (critical/high): 1

## Corecturi după revizorii Claude — runda 1 (au prioritate față de pașii de mai sus)

1. **Expirarea ofertei** = `least(creata_la + 15 min, plecarea − 240 min)`; pragul de 4 h e același în grilă și în executor: la exact 4 h înainte se poate (6/9) — `poateAnulaPasager` devine `nowMs <= t − min·60 000`; test pe limită (4 h 00 min, 3 h 59 min, oferta creată la 4 h 10 min și confirmată la 3 h 58 min → refuzată la ofertă, nu la executor).
2. **Alerta `retur_cerere`**: migrația adaugă tipul în `bilete_alerte_tip_check` pornind de la lista CURENTĂ citită din `pg_constraint` în aceeași sesiune (489:15-18 e ultima cunoscută); ruta de escaladare verifică eroarea inserării și răspunde «momentan prin telefon» dacă nu s-a scris; eticheta în `alerte-mesaj.ts` / /bilete.
3. **Suma e obligatorie pentru sursa `ai`**: `anuleazaSiReturneaza` aruncă `validare` dacă sursa e `ai` și `suma` lipsește; `admin`/`sistem` rămân integral (fără parametru).
4. **Minimul de 10 MDL**: oferta sub 10 MDL nu se creează automat → escaladare la dispecer; regula băncii se verifică în sandbox (refund parțial + refund sub 10).
5. **Diferența după un refund parțial** (ex. se dovedește vina noastră): se dă manual din cabinetul maib — în Riscuri; panoul arată «returnat X din Y».
6. **Legarea «primul venit»**: confirmarea cere ultimele 4 cifre ale telefonului din comandă (botul întreabă o dată, la prima ofertă pe acea comandă); la anulare, dacă comanda are e-mail, pleacă e-mailul «biletul a fost anulat la cererea din Telegram»; dispecerul are «Dezleagă Telegram» în detaliul comenzii din /bilete.
7. **Funcția SQL**: o singură ofertă deschisă pe comandă prin `bilete_retur_oferta_noua(p jsonb)` care blochează rândul comenzii (`FOR UPDATE`) și închide ofertele vechi; `bilete_retur_foloseste` cu `FOR UPDATE` pe ofertă; fără index parțial cu `now()`; `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role` + probe `has_function_privilege` (tiparul 487/490).
8. **Cheie separată** `BILETE_BOT_API_KEY` (doar Railway + central-hub) pentru `/api/bilete/retur/*`; `BILETE_API_KEY` al site-ului nu deschide aceste rute.
9. **Rutele** intră în `PUBLIC_EXACT` din `public-paths.ts` ca intrări exacte (`/api/bilete/retur/oferta`, `/confirma`, `/escaladeaza`, `/stare`), testul exhaustiv extins.
10. **Plafoane**: escaladare și apeluri Haiku limitate pe `telegram_id` (ex. 5 / 10 min) și pe comandă; textul tăiat la 1000 de caractere; `telegram_id` luat DOAR din `ctx.from.id` / `callbackQuery.from.id`, niciodată din `callback_data`.
11. **Confirmarea care se pierde pe drum**: botul răspunde imediat la apăsare (`answerCallbackQuery` + «se procesează»), cererea spre panou are timeout 25 s; la eroare/timeout botul NU retrimite confirmarea, ci citește `GET /api/bilete/retur/stare?oferta_id=` (rezultatul scris de panou pe ofertă) și abia apoi răspunde.
12. **Rutarea în bot**: handlerul clienților stă ÎNAINTEA răspunsului implicit «Acces restricționat» (`start.ts:55-60`, `bot.ts:386-395`) și intră doar pentru cine NU e în `users` (personal) și are cel puțin un bilet legat activ; `/start` fără cod îi listează biletele active; un om din personal care are și bilet primește meniul personalului, iar callback-urile `retur:*` merg oricum (verifică legarea).
13. **Teste în bot**: rutarea client/personal, bilet legat de alt cont, ofertă expirată/folosită, timeout spre panou → citirea stării, cele 4 cifre greșite.
14. **Haiku**: constantă `RETUR_AI_MODEL = 'claude-haiku-4-5'`, `max_tokens` 60, timeout 8 s, ieșirea validată strict pe cele 4 intenții (orice altceva → meniul cu butoane). (Botul folosește azi `claude-sonnet-5` doar în `driverCheck.ts:23`.)

### Triaj runda 1

| sursa | id | sev. | decizie |
|---|---|---|---|
| BL | 1 / sec 1 / be high | high | acceptat (1) |
| BL | 2 | high | acceptat (2) |
| BL | suma opțională | med | acceptat (3) |
| BL / sec | 10 MDL | med | acceptat (4) |
| BL | diferența | low | acceptat (5) |
| sec | 3 legarea | med | acceptat (6) |
| sec / be | SQL, index | low | acceptat (7) |
| sec / be | cheie separată | low | acceptat (8) |
| sec | public-paths | low | acceptat (9) |
| sec | plafoane | low | acceptat (10) |
| be | confirmare pierdută | med | acceptat (11) |
| be | rutarea | med | acceptat (12) |
| be | teste bot | med | acceptat (13) |
| be | Haiku | low | acceptat (14) |

## Review runda 2: business-logic-auditor

Blocantele din runda 1 sunt închise:
- **HIGH 1 (oferta trece peste plasa de 4 h)**: închis prin corectura 1. `expira_la = least(+15 min, plecarea − 240)` și `poateAnulaPasager` cu `<=` aliniază plasa cu grila (`refund-reguli.ts:8` vs `:32`, `>= 4` → 6/9). Schimbarea de la `<` la `<=` mută plasa sursei `pasager` cu 1 ms; nu strică nimic.
- **HIGH 2 (`retur_cerere` respins de CHECK)**: închis prin corectura 2: lista se citește din `pg_constraint`, se verifică `error`, eticheta se pune.
- MED 3 și 4 și LOW 5: închise prin corecturile 3, 4 și 5.

Ce introduc corecturile nou (nimic blocant):
1. **LOW: oferta poate arde la marginea expirării.** `bilete_retur_foloseste` validează expirarea la T, iar executorul verifică din nou plasa pe `Date.now()` câteva sute de ms mai târziu (`refund.ts:55-59`). Dacă confirmarea vine în ultima secundă înainte de `plecarea − 240`, oferta e marcată folosită și apoi executorul aruncă `inchis`. Sugestie: pentru `sursa:'ai'` cu ofertă, executorul primește `acumMs` = momentul validării ofertei, sau sare peste plasă, pentru că funcția SQL a verificat-o deja. Test: confirmare la `expira_la − 1 s`.
2. **LOW: `rezultat` trebuie scris pe orice ieșire.** Corectura 11 citește `/stare` din rezultatul de pe ofertă. Executorul are însă ieșiri prin `throw` după ce oferta e deja folosită: `inchis`, `BILET_URCAT`, `maib` refuz cu reactivare (`refund.ts:65-67`, `:101`) și `Error` generic. Cer ca ruta `confirma` să scrie `rezultat` în `finally`: `creat | necunoscut | refuz:<cod> | eroare`. Cer și ca botul să trateze ofertă `folosita_la` setată cu `rezultat` NULL ca «necunoscut → dispecerul», nu ca reușită. După un refuz cu reactivare, clientul cere o ofertă nouă, iar corectura 7 îi permite asta.
3. **LOW: ordinea blocărilor în SQL.** `bilete_retur_oferta_noua` blochează comanda, apoi ofertele. Dacă `bilete_retur_foloseste` blochează oferta și apoi comanda, apare un deadlock posibil. Sugestie: ambele funcții blochează întâi `bilete_comenzi … FOR UPDATE`, apoi oferta. Încă un lucru de verificat: `foloseste` refuză oferta închisă de `oferta_noua`, adică se uită și la câmpul de închidere, nu doar la `folosita_la`/`expira_la`.

Fără observații: grila, executorul și finalizarea folosesc toate `comanda.departure_at`, deci sunt coerente. Minimul de 10 MDL e aplicat înainte de ofertă, iar biletele sub 10 lei nu se vând online (ION-237), deci nu rămâne niciun caz în care banca e chemată cu sumă sub minim. Sursele `admin`/`sistem` rămân pe suma integrală, neatinse.

Scor: 8.5 · Blocante (critical/high): 0

## Review runda 2: senior-backend-engineer

Blocantele mele din runda 1 sunt închise: HIGH-ul (oferta vs plasa de 240 min) prin corectura 1; mediile 2/3/4 prin 11/12/13;
cele mici 5/6/7 prin 7/8/14. Schimbarea `<` → `<=` din `poateAnulaPasager` (`refund-reguli.ts:8`) are un singur apelant
(`refund.ts:56`), deci nu atinge altceva; grila deja dă 6/9 la exact 4 h (`refund-reguli.ts:32`, `>=`).

Defecte noi introduse de corecturi (fără blocante):

1. **MEDIUM — cele 4 cifre (corectura 6) sunt nespecificate unde contează.** (a) Trebuie verificate în PANOU (`oferta`
   sau `confirma` primește `cifre`, compară cu `bilete_comenzi.phone`, migr. 483:38), altfel e o verificare decorativă în bot;
   (b) unde se ține «verificat o dată» (coloană pe comandă, ex. `telegram_verificat_la`) și plafonul de încercări greșite
   (ex. 5 → blocat + escaladare), altfel 10^4 combinații; (c) răspunsul cu cifre e un mesaj text privat — trebuie să treacă
   ÎNAINTEA handlerului Haiku din corectura 12 (starea de așteptare în sesiunea grammy, `bot.ts:1-5`, `supabaseSessionStorage`).
2. **MEDIUM — `stare` poate rămâne goală pentru totdeauna.** Bot 25 s < `maxDuration` 60 (tiparul `comanda/route.ts:12`),
   deci timeout-ul botului e cazul normal la bancă lentă, nu excepția; dacă funcția Vercel moare după `bilete_retur_foloseste`
   și înainte de `rezultat`, oferta e arsă și `rezultat` NULL. Sugestie: `stare` se deduce din sursa de adevăr existentă —
   `bilete_comenzi.status` + `maib_checkouts.refund_status/refund_id` (`maib/refund.ts:17-26`) — nu dintr-o coloană scrisă la
   final; `in_curs` → botul arată «Verifică starea» (buton care recheamă `stare`), nu promite «revenim»; ofertă folosită cu
   comanda încă `platita` după 2 min → alertă în `bilete_alerte` (cron-ul de împăcare deja există).
3. **LOW — ceasuri diferite la limita de 4 h.** Oferta expiră exact la `plecare − 240` după ceasul bazei (`foloseste`),
   executorul verifică după `Date.now()` din Vercel câteva sute de ms mai târziu (`refund.ts:56`): confirmarea din ultima
   secundă trece de ofertă, cade la executor, oferta e arsă. Sugestie: `least(creata_la + 15 min, plecare − 241 min)`
   (marjă de 1 min) sau executorul primește `nowMs` = momentul validării ofertei pentru sursa `ai`.

Accept și LOW-ul de deadlock al colegului (aceeași ordine de blocare: comanda, apoi oferta).

Scor: 8.0 · Blocante (critical/high): 0

## Corecturi după revizorii Claude — runda 2

15. **Marja de ceas la 4 h**: `expira_la = least(creata_la + 15 min, plecarea − 241 min)` (1 min marjă între ceasul bazei și Vercel); în plus, pentru sursa `ai` cu ofertă validată executorul primește `acumMs` = momentul validării ofertei (plasa e deja verificată în SQL). Test: confirmare la `expira_la − 1 s` → trece.
16. **Starea se deduce din sursa de adevăr**, nu dintr-o coloană scrisă la final: `GET /stare?oferta_id=` citește `bilete_comenzi.status` + `maib_checkouts.refund_id/refund_status` ale comenzii ofertei → `in_curs | creat | necunoscut | refuz | neatinsa`. Ruta `confirma` scrie totuși `rezultat` în `finally` (pentru /bilete). Botul: `in_curs` → buton «Verifică starea» (recheamă `/stare`), fără promisiuni; ofertă folosită + comanda încă `platita` după 2 min → alertă `retur_cerere` (job nou în împăcarea existentă).
17. **Cele 4 cifre** se verifică în PANOU: `oferta` primește `cifre`, le compară cu ultimele 4 din `bilete_comenzi.phone`; coloană `telegram_verificat_la` pe comandă (verificat o dată → nu se mai cer); plafon 5 încercări greșite pe comandă → blocat + alertă la dispecer. În bot, starea «aștept cifrele» stă în sesiunea grammy (`supabaseSessionStorage`) și mesajul cu cifre e prins ÎNAINTEA clasificării Haiku.
18. **Ordinea blocărilor**: ambele funcții SQL blochează întâi rândul din `bilete_comenzi` (`FOR UPDATE`), apoi oferta; `bilete_retur_foloseste` refuză și oferta închisă de o ofertă mai nouă (`inchisa_la IS NOT NULL`).
19. **Ieșirile executorului după ofertă folosită** (`inchis`, `BILET_URCAT`, refuz cu reactivare, eroare) → `rezultat = refuz:<cod> | eroare`; clientul vede textul exact și poate cere o ofertă nouă (corectura 7 o permite).

### Triaj runda 2

| sursa | id | sev. | decizie |
|---|---|---|---|
| BL | 1 / be 3 | low | acceptat (15) |
| BL | 2 / be 2 | low/med | acceptat (16, 19) |
| BL | 3 | low | acceptat (18) |
| be | 1 cifrele | med | acceptat (17) |

## Critic extern — runda 1 (Codex): triaj și corecturi (au prioritate față de corecturile 15–17)

| id | severitate | esență | decizie | corectura |
|---|---|---|---|---|
| C1 | high | marja de 1 min din corectura 15 face oferta din ultimul minut eligibil deja expirată | acceptat | 15′ |
| C2 | medium | verificarea cu 4 cifre se moștenește de următorul cont legat | acceptat | 17′ |
| C3 | medium | `/stare` nu deosebește refuzul cu reactivare de «neînceput» | acceptat | 16′ |

**15′.** Fără marjă suplimentară: oferta se creează doar dacă au rămas ≥ 240 min; `expira_la = least(creata_la + 15 min, plecarea − 240 min)`; `bilete_retur_foloseste` validează cu `now() <= expira_la` și ÎNTOARCE `validata_la = now()`; executorul, pentru sursa `ai` cu ofertă, folosește `acumMs = validata_la` la plasa de timp (fără a doua comparație pe ceasul Vercel). Teste: ofertă creată la 4 h 00 min 30 s și confirmată imediat → trece; creată la exact 4 h → trece; cerută la 3 h 59 min 59 s → fără ofertă (suma 0).

**17′.** Verificarea e legată de cont: coloana `telegram_verificat_pentru bigint` (telegram_id-ul care a dat cifrele corecte) în loc de un simplu `telegram_verificat_la`; oferta cere cifrele dacă `telegram_verificat_pentru IS DISTINCT FROM telegram_id`-ul curent. «Dezleagă Telegram» din /bilete pune ATOMIC `telegram_id = NULL, telegram_verificat_pentru = NULL` și resetează contorul de încercări. Test: A verificat → dezlegare → B legat → cifrele cerute din nou.

**16′.** `GET /stare?oferta_id=` — tabelul complet, în ordinea asta:
| condiție | stare | ce vede clientul |
|---|---|---|
| oferta inexistentă / a altui telegram_id | `necunoscut` (404) | «Nu găsesc cererea» |
| `folosita_la IS NULL` | `neatinsa` | butonul de confirmare din nou (dacă nu a expirat) |
| `rezultat` începe cu `refuz:` (scris în `finally` pentru refuzurile cunoscute: `inchis`, `BILET_URCAT`, refuz bancă + reactivare) | `refuz` | textul refuzului; «biletele rămân valabile» când comanda e `platita` |
| comanda `anulata`/`returnata` și `maib_checkouts.refund_id` setat | `creat` (sau `finalizat` dacă `returnata`) | «Banca a primit cererea de returnare a N lei» |
| comanda `anulata` și `refund_status = 'Necunoscut'` | `necunoscut` | «Am trimis cererea; dispecerul verifică» |
| `folosita_la` setat, `rezultat IS NULL`, comanda încă `platita` | `nedeterminat` | «Verifică starea» (buton); după 2 min alertă `retur_cerere` din împăcare |
Teste: răspunsul POST pierdut după refuz cu reactivare → `/stare` = `refuz`; pierdut după refund creat → `creat`; funcție moartă după consumare → `nedeterminat` → alertă.

## Critic extern — runda 2 (Codex): 9.0, pass

| id | severitate | esență | decizie | corectura |
|---|---|---|---|---|
| C1 | medium | tabelul `/stare` nu acoperă Pending fără refund_id, `returnata` prin împăcare fără refund_id, Rejected/Manual | acceptat | 16″ |

**16″.** Ramuri adăugate în tabelul `/stare`, evaluate ÎNAINTEA ramurii generice «refund_id setat → creat»:
| condiție | stare | ce vede clientul |
|---|---|---|
| comanda `returnata` (cu sau fără `refund_id`, inclusiv finalizată de împăcare din `refundedAmount`) | `finalizat` | «Banii au fost returnați pe card» |
| comanda `anulata`, `refund_status` ∈ {`Rejected`,`Manual`} (`refund-decizie.ts`) | `refuz_banca` | «Banca n-a făcut returnarea automat; dispecerul se ocupă» + alertă existentă |
| comanda `anulata`, `refund_id IS NULL`, `refund_status` = `Pending` sau NULL | `in_curs` | «Se procesează» + «Verifică starea» |
| orice altă combinație | `nedeterminat` | «Verifică starea»; după 2 min alertă |
Teste: timeout după revendicare (Pending, fără refund_id) → `in_curs`; împăcare `returnata` fără refund_id → `finalizat`; Rejected → `refuz_banca`.

## Gate

| Partea | Scor | critical/high deschise |
|---|---|---|
| Claude — minimul revizorilor (BL r2 8.5 · backend r2 8.0 · securitate r1 5.4, toate acceptate) | 5.4 (securitate n-a fost re-notat; observațiile ei sunt toate acceptate) | 0 |
| Codex — runda 2 | 9.0 (pass) | 0 |

Istoric: Claude r1 min 3.5 (3 high) → r2 8.0/8.5 (0); Codex r1 6.0 fail (1 high) → r2 9.0 pass.

## Contractul API panou ↔ bot (fixat la implementare)

Toate: `Authorization: Bearer <BILETE_BOT_API_KEY>`, JSON, baza `ADMIN_BASE_URL` (variabila existentă a botului). `telegram_id` = `ctx.from.id`.

- `POST /api/bilete/retur/bilete` `{telegram_id}` → `{ok, bilete:[{cod, status, lang, from_name, to_name, departure_at, seats, total}]}` — comenzile legate de cont, `platita`/`platita_fara_bilet`, cu plecarea în viitor.
- `POST /api/bilete/retur/oferta` `{telegram_id, cod, cifre?}` → unul din:
  - `{ok:true, tip:'oferta', oferta_id, suma, total, noimi, expira_la, departure_at, from_name, to_name, lang}`
  - `{ok:true, tip:'cere_cifre'}` (cele 4 cifre ale telefonului din comandă, o dată pe cont)
  - `{ok:true, tip:'fara_bani', motiv:'sub_4h'|'plecat'|'urcat'}`
  - `{ok:true, tip:'dispecer', motiv:'sub_10'|'blocat'}` (alertă `retur_cerere` scrisă)
  - `{ok:false, cod:'cifre_gresite', ramase}` / `{ok:false, cod:'nelegat'|'stare'|'inexistent'}`
- `POST /api/bilete/retur/confirma` `{telegram_id, oferta_id}` → `{ok:true, stare, suma}` cu `stare` ∈ `creat|finalizat|necunoscut|refuz|refuz_banca|in_curs|nedeterminat|expirata` (+ `motiv` la `refuz`).
- `GET /api/bilete/retur/stare?oferta_id=&telegram_id=` → `{ok:true, stare, suma, motiv?}` (tabelul 16′/16″).
- `POST /api/bilete/retur/escaladeaza` `{telegram_id, cod?, text, motiv:'vina_noastra'|'altceva'}` → `{ok:true}` (alertă `retur_cerere`) sau `{ok:false}`.
