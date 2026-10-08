# Proba fizică a biletelor online: pagina de probă (10 lei) + șoferul de probă Iurie

## De ce
Ion (08.10.2026): «cum să facem test la toată veriga fizic, am nevoie de pagină test separată de site, am nevoie de fake
șofer»; «pagina fără login, șoferul îl pui pe Iura … și dai client»; «pui să fie biletul 10 lei ieftin»; «și pui Iura
unic șofer»; la întrebarea despre telefon: «alt Iura, care a fost înainte» = Iurie din `users` 34936fff (rol DIGITAL,
executorul sarcinilor, telegram_id 1407418059), NU Veremiciuc.
Vânzarea publică e închisă (`bilete_online_activ=false`, 0 rute deschise), deci veriga căutare → plată → bilet (pagină,
e-mail, Telegram) → scanare la urcare → returnare nu se poate încerca de pe site. Vrem proba pe producție, cu bani reali
(10 lei), cu Iurie ca SINGUR șofer care vede și scanează biletele de probă.

## Ce facem
**Ales:** mod nou `proba` al comenzii + pagină publică ascunsă pe central-hub (cheie secretă, termen de valabilitate) +
Iurie ca șofer-de-probă (`drivers.is_test`).
- Comanda de probă = comandă reală (`creeazaComanda`, maib prod, bilete/QR/e-mail/bot), cu `test=true`,
  `proba_fizica=true`, preț forțat **10 lei/loc**, fără steagurile vânzării și fără condiția «cursa are șofer».
- Biletele de probă le vede și le scanează DOAR șoferul de probă; un șofer real care scanează un bilet de probă primește
  refuz; biletul de probă poartă peste tot inscripția «BILET DE PROBĂ — NU E VALABIL LA URCARE».
- Cursele șoferului de probă = cursele cu comenzi `proba_fizica` plătite în ziua cerută (fără `daily_assignments`).

**Respinse:**
1. Pagina în panou cu login ADMIN (`/plati` → `comandaDeTest`) — Ion a cerut «fără login»; `comandaDeTest` cere șofer
   atribuit și întoarce pe /plati, nu pe pagina reală a biletului.
2. Iurie atribuit în `daily_assignments` pe o cursă reală — s-ar bate cu șoferul real (assignments.ts:75 păstrează primul
   rând), ar intra în grafic, penalități, digest.

## 🔬 Verificat pe viu
| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| maib nu poate fi sandbox per cerere | `lib/maib/client.ts:38-48` | mediul e global din `MAIB_BASE_URL`; prod = bani reali | proba costă 10 lei/comandă |
| Șoferii reali nu văd comenzi test | `sofer.ts:98` `.eq('test', false)` | da | pentru Iurie: `.eq('proba_fizica', true)` |
| Lista din mini app NU trece prin `curseleSoferului` | `sofer.ts:90,163-168` (`raspunsAzi` dă `atribuiri` → `curseDinAtribuiri`) | ramura `is_test` trebuie în `curseCuPasageri`/`raspunsAzi` | pasul 4 |
| Scanarea nu filtrează `test` | scan/route.ts:36 `SEL`, `clasificaScanare` sofer-reguli.ts:105 | nu | pasul 5, fail-closed |
| Singurul drum spre `urcat` e scanarea | git grep (security-auditor) | doar scan/route.ts:85 | nu există ocol manual |
| Biletul scanat nu se mai returnează | retur-bot.ts:64-65; `bilete_anuleaza` BILET_URCAT (refund.ts:86-88), orice sursă | da | proba = DOUĂ comenzi (A scanată, B returnată) |
| `test` se scrie dintr-o comparație | comenzi.ts:338 `test: opt.mod === 'test_admin'` | modul nou trebuie inclus | `test: opt.mod !== 'public'` |
| `ipHash` cerut doar pe public | comenzi.ts:264 | `test_admin` intră în găleata `''` a PLAFON_IP | `proba` cere ipHash real |
| Suma: amount = total | comenzi.ts:394; callback/route.ts:213; migr. 486:28 | `total = 10 × seats` după forțarea prețului | fără `suma_nepotrivita` |
| Returnarea a 10 lei | retur-bot-reguli.ts:27-28 + garanția (până 31.12) | suma = 10 ≥ minimul 10 | comanda B se returnează din bot |
| Locul ocupat | migr. 501:65 fără filtru test; la anulare `loc_nr NULL` (501:101) | biletul de probă ia un `loc_nr` real | doar azi/mâine + plafon zilnic; vânzarea publică închisă |
| Iurie | SELECT users/drivers | users 34936fff, DIGITAL, telegram_id 1407418059; nu e în `drivers` | rând nou cu acest telegram_id, fără telefon |
| Botul trimite șoferul înaintea rolului | bot start.ts:24-25 | `?start=bilete_azi` → mini app șofer; meniul DIGITAL rămâne | pasul 8 |
| `drivers` fără steag test | information_schema | lipsă | coloană `is_test` |
| Clientul vede telefonul șoferului real | bileteClienti.ts:125-136; plângere plangere-repo.ts:40 | da | `null` pe comandă test |
| Cititorii «toți șoferii activi» | business-logic-auditor F4 | listele de la pasul 7 | filtru `is_test=false` |
| Venituri/rapoarte | `online_lei` fără scriitor (migr. 483:133); /bilete filtrează test; Mobilet/tiki nu citesc bilete_comenzi | nu scurge | nimic de schimbat |

## Pași
1. **Migrație** `5xx_bilete_proba_fizica.sql`: `drivers.is_test boolean not null default false`;
   `bilete_comenzi.proba_fizica boolean not null default false`; `bilete_creeaza_comanda` citește `proba_fizica` din `p`;
   rândul «TEST BILETE — Iurie (probă)» (`is_test=true, **active=false**, telegram_id=1407418059,
   telegram_legat_prin='admin'`, `directions='{}'`). REVOKE EXECUTE FROM PUBLIC pe funcția recreată.
2. **Modul `proba` în `creeazaComanda`** (comenzi.ts): `test: opt.mod !== 'public'`; `proba_fizica: opt.mod === 'proba'`;
   cere `ipHash`; sare steagurile vânzării și `areSofer`; `pricePerSeat = PRET_PROBA = 10`, `total = 10 × seats` calculat
   după; `vanzareDeschisa` rămâne. Unit-teste.
3. **Pagina** `/proba-bilete/[cheie]` pe central-hub (prefix în public-paths.ts; noindex, no-store, no-referrer):
   - cheie ≥ 32 octeți aleatori în env `BILETE_PROBA_CHEIE` + termen `BILETE_PROBA_PANA_LA` (zi); greșită/expirată → 404;
   - **server action-ul primește cheia și o verifică singur** (timp constant), plus termenul;
   - serverul impune: `trip_date` ∈ {azi, mâine} (Chișinău), `seats = 1`, `idempotencyKey = randomUUID()`, URL-ul de
     întoarcere construit pe server (`urlBiletImplicit`, comenzi.ts:252) → pagina reală translux.md/<lang>/bilet/<cod>;
   - plafon: max **10 comenzi `proba_fizica` pe zi** (ziua de creare, fus Europe/Chisinau), verificat ÎN
     `bilete_creeaza_comanda`, sub același advisory lock și în aceeași tranzacție cu INSERT-ul (migr. 501:158-194), excepție
     `PLAFON_PROBA` → ComandaError `plafon`; plus plafonul existent pe IP;
   - formular: data → cursa (aceeași căutare ca site-ul) → nume, prenume, telefon, e-mail → «Plătește 10 lei»;
   - sub formular, comenzile de probă de azi: nume, telefon mascat (`+373 69 ••• 456`), fără e-mail și fără cod; bife:
     creată · plătită · e-mail livrat · legat în Telegram · scanat · returnat.
4. **Șoferul de probă în mini app**: `soferDinInitData` selectează explicit `is_test`; în `raspunsAzi`/`curseCuPasageri`,
   pentru `is_test`: cursele = (crm_route_id, going_north) distincte cu comenzi `proba_fizica=true, status='platita'` în zi;
   pasagerii `.eq('proba_fizica', true)`; pentru șoferii reali `.eq('test', false)` neschimbat. `curseleSoferului` (folosit de
   scanare) primește aceeași ramură.
5. **Scanarea, fail-closed**: `SEL` include `comanda.test, comanda.proba_fizica`. Un bilet din categoria nepermisă
   (șofer real + bilet `test`; șofer de probă + bilet non-`proba_fizica`; `comanda` null) e tratat ca **absent** pentru
   tot restul cererii: `b = null` imediat după citire, deci nicio actualizare, `cursa_bilet` null în jurnal, nicio
   numărătoare `ramase`, răspunsul = `{rezultat:'necunoscut', loc_nr:null, nume:null, locuri_ramase_comanda:null,
   cursa_bilet:null, urcat_at:null}` (scan/route.ts:106-114). Funcție pură `biletPermis(sofer, b)` + teste ale
   endpoint-ului care verifică lipsa tuturor datelor în ambele sensuri.
6. **Inscripția «BILET DE PROBĂ — NU E VALABIL LA URCARE»** când `test=true`: pagina biletului (apps/web BiletCard),
   imaginea Telegram (bilet-imagine.ts), e-mailul (email-mesaj.ts), mesajul botului (bileteClienti). `public.ts` expune `test`.
   Clientul unei comenzi test nu primește telefonul șoferului (bileteClienti.ts:125-136), plângerea nu pleacă la șofer
   (plangere-repo.ts:40).
7. **Excluderea lui `is_test`** din cititorii «șoferi activi»: atribuiri/core.ts:564, assignments/actions.ts:99,213,
   grafic-data.ts:67, grafic/actions.ts:63,438, driver-penalties-sync.ts:61, reports/actions.ts:444,
   lde/trasee/actions.ts:164, lde/agreare/actions.ts:67, cron/anunt-bilete-online/route.ts:86,198,
   cron/sofer-meniu/route.ts:38, bot db.ts:148 `searchDrivers` (+ db.ts:104 sigur cât `directions='{}'`). Test care
   caută prin `git grep` fiecare `from('drivers')` cu `eq('active', true)` fără `is_test`.
8. **Iurie** deschide mini app-ul de șofer prin `t.me/<bot>?start=bilete_azi`; în `users` nu se atinge nimic.
9. **Livrare, în ordinea asta** (C4): (a) migrația cu db-migrate.sh (dry-run, apoi aplicare) — Iurie intră `active=false`;
   (b) push → central-hub, deploy translux-web, botul pe `deploy-bot`; (c) verificat în prod că filtrele `is_test` sunt
   live (`/api/version` = commitul, `/version` bot); (d) abia apoi corectura de date `UPDATE drivers SET active=true`
   pe rândul de probă (db-migrate --exec); (e) la sfârșit env-urile `BILETE_PROBA_CHEIE` + `BILETE_PROBA_PANA_LA` în Vercel
   (central-hub, production) și redeploy — până atunci pagina dă 404.

## Fișiere
- `packages/db/migrations/5xx_bilete_proba_fizica.sql`
- `apps/admin/src/lib/bilete/{comenzi,sofer,sofer-auth,sofer-reguli,public,email-mesaj,bilet-imagine}.ts` + teste
- `apps/admin/src/app/proba-bilete/[cheie]/{page.tsx,actions.ts,ProbaClient.tsx}`, `apps/admin/src/lib/public-paths.ts`
- `apps/admin/src/app/api/bilete-sofer/scan/route.ts`
- cititorii de la pasul 7 (admin + bot)
- `apps/web/src/components/bilet/BiletCard.tsx`, `apps/web/src/lib/bilete-api.ts` (tipul `test`)
- `apps/bot/src/services/bileteClienti.ts`, `apps/bot/src/db.ts`

## Riscuri
- **Bilete ieftine prin pagina fără login**: cheia verificată în action, termen de valabilitate, 10/zi, 1 loc, doar
  azi/mâine, refuz la scanarea de șofer real, inscripția vizibilă. Rezervă: ștergi `BILETE_PROBA_CHEIE` → 404 peste tot.
- **Comanda A (scanată) nu se returnează**: 10 lei rămân la firmă (costul probei); locul cursei rămâne ocupat — doar pe
  cursa de azi/mâine, cu vânzarea publică închisă.
- **Cheia în URL** (istoric, jurnale): termen `BILETE_PROBA_PANA_LA`, cheia se schimbă după probă.
- **Iurie în listele de șoferi**: pasul 7 + testul cu grep.

## Verificare
- unit: modul `proba` (preț 10, total, test/proba_fizica, ipHash cerut, sare steagurile și areSofer); action-ul (cheie greșită,
  termen trecut, dată în afara azi/mâine, plafon zilnic); `raspunsAzi` pentru is_test; `clasificaScanare` (real+probă,
  probă+real, comanda null); grep-testul `is_test`.
- tsc + vitest (admin, web, bot); pre-push git-guards.
- prod: cheie greșită → 404, corectă → 200; action POST fără cheie → refuz.
- proba fizică (Ion = client, Iurie = șofer):
  - **Comanda A**: Ion cumpără 10 lei → bilet pe pagină cu inscripția + e-mail + Telegram → Iurie vede pasagerul →
    scanează «ok» → a doua scanare «deja urcat» → un șofer real încearcă biletul → refuz.
  - **Comanda B**: Ion cumpără 10 lei → retur din bot → refund maib → bifa «returnat».
  - pagina de probă arată bifele ambelor comenzi.

## Review: security-auditor (runda 1)
Scor 3.5 · Blocante 3 — H1 cheia doar în page, nu în action; H2 biletul de probă arată real; H3 biletul scanat nu se
returnează; M1 plafon/locuri; M2 date personale; M3 fail-closed; M4 cheia în URL; L1–L4.
**Triaj:** toate acceptate → pașii 3, 5, 6, «Riscuri», «Verificare» (A/B). L2 → coloana `proba_fizica`.
Rămas deschis: 0 critical/high.

## Review: business-logic-auditor (runda 1)
Scor 7.0 · Blocante 1 — F1 lista mini app ocolește `curseleSoferului`; F2 scanat ≠ returnabil; F3 `test` din comparație;
F4 cititorii `drivers`; F5 telefonul șoferului real la client.
**Triaj:** toate acceptate → pașii 2, 4, 6, 7 și proba A/B. Rămas deschis: 0 critical/high.

## Critic extern - runda 1
Codex: scor 3.0 (inconsistent: Σ=8 → 2.0) · fail · 3 critical/high.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | `telegram_legat_prin='manual-proba'` încalcă CHECK | acceptat | verificat 483_bilete_online.sql:128 (`IN ('telefon','admin')`) → pasul 1 folosește `'admin'` |
| C2 | high | plafonul de 10/zi verificat în afara lacătului | acceptat | 501:158-194 → plafonul mutat în `bilete_creeaza_comanda`, sub lacăt (pasul 3) |
| C3 | critical | refuzul scanării tot dezvăluie nume/loc | acceptat | verificat scan/route.ts:106-114 → biletul nepermis = absent în tot răspunsul (pasul 5) + teste endpoint |

## Critic extern - runda 2
Codex: scor 8.0 (inconsistent: Σ=2.5 → 7.5) · fail · 1 high. C1–C3 nu sunt redeschise.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C4 | high | Iurie activ înainte ca filtrele `is_test` să fie live (cronul sofer-meniu i-ar schimba meniul DIGITAL) | acceptat | verificat cron/sofer-meniu/route.ts:38 → rândul intră `active=false`, activarea e pas separat după deploy, cheia paginii la final (pasul 9) |

## Gate
Deschise critical/high: Claude 0, Codex 0 (C1–C4 acceptate și corectate). Scoruri: Claude min 3.5 (runda 1, înainte de
corecturi), Codex 8.0 → 7.5 recalculat. Două runde din trei.
