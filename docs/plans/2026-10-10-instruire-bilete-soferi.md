# Instruirea șoferilor la biletele online — checklistul lui Iurie

## De ce

Din 12.10 biletele online se vând pe toate interurbanele prin Briceni/Edineț, în ambele sensuri (28 din 30 de rute;
nu 5 Șirăuți și 13 Lipcani-Rîșcani), și o cursă se vinde doar dacă șoferul ei e legat de Telegram (migr. 543).
Ion, 10.10: «fă pentru Iura un artifact care este unit cu Telegram-ul șoferului. Pe fiecare șofer Iura trebuie să aibă
checklist că a instruit fiecare șofer cum se scanează și ce se întâmplă, cum șoferul face bilete online. După ce Iura
bifează la șofer trebuie să apară confirmare că Iura a învățat toate punctele.»

Deciziile lui Ion (10.10):
- unde: **artifact pe claude.ai** (știind că Iurie are nevoie de cont claude.ai și că pagina nu trimite în Telegram);
- confirmarea: **șoferul confirmă în Telegram**; mesajul «a confirmat» merge la **Iurie și la Ion**;
- lista: «cei legați plus trebuie să lege cei rămași de legat, îi stă în task»;
- șoferii refuzați la legare: **«Iurie leagă singur din bot»**;
- pasagerul cu bilet online fără QR: **«Nu urcă fără QR»**;
- botul: **«livrează împreună»** (deploy-bot primește și c8928576, cfb8f10d).

Iura = Iurie, `users.id 34936fff…`, rol DIGITAL (Ion 10.10).

## Ce facem

**Ales:** artifact claude.ai (interfața lui Iurie, starea în `db`) + botul TRANSLUX (adevărul, în Supabase). Legătura
trece prin telefonul șoferului: fiecare card de șofer din artifact are **codul QR al acelui șofer**
(`t.me/TransluxMoldova_bot?start=instruit_<driver_id>`). Șoferul îl scanează lângă Iurie:
- e deja legat cu acest Telegram → botul îi arată punctele și butonul de confirmare;
- nu e legat / e refuzat / și-a schimbat Telegram-ul → botul îi trimite lui Iurie cererea «Leagă {nume} de acest
  Telegram?» cu butoanele «Leagă» / «Refuză»; după «Leagă» șoferul primește meniul biletelor și punctele;
- e legat ca ALT șofer → refuz «codul e pentru alt șofer».
La confirmare: rând în `driver_instruire_bilete`, mesaj la Iurie și la Ion. Iurie bifează în artifact «Confirmat în
Telegram» când primește mesajul.

**Respinse:**
1. *Mini App în Telegram pentru Iurie* — legat direct de bază, dar Ion a ales artifactul.
2. *Artifactul citește baza / trimite în Telegram* — imposibil: pagina n-are rețea (sample.d.ts:333), nu există
   conector Telegram, iar conectorul Supabase ar cere contul lui Iurie.
3. *Legarea manuală prin Claude / prin Ion* — Ion a ales ca Iurie să lege singur din bot.

## 🔬 Verificat pe viu

| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Artifactul nu poate face fetch spre API-ul nostru | tipurile capabilităților (sample.d.ts:333 «its network is blocked»), lista: artifact, assets, comments, db, downloads, files, mcp, room, sample, self, user | rețea blocată; niciun conector Telegram | confirmarea și legarea trec prin bot |
| Ce rute vând online | review business-logic, SQL `crm_routes.bilete_online_tur/retur` | 28 din 30 interurbane, ambele sensuri; nu 5, 13 | lista șoferilor |
| Câți șoferi | SQL: activi, non-test, `driver_id` sau `driver_id_retur` pe rutele vândute, 30 zile | 48: 37 legați, 11 nelegați; 2 cu telefon dublat; 5 refuzuri `nepotrivit` nelegate | «De legat (11)» + motivele |
| Iurie are Telegram | SQL `public.users` | `34936fff…` DIGITAL activ, `telegram_id` setat; e legat și de rândul șoferului de probă | destinatarul cererilor; proba pe viu |
| Mai mulți DIGITAL | review security; `services/db.ts:327-330` (`getZadachnikAssignee` ia primul DIGITAL) | există și alt DIGITAL (Vlad) | Iurie se ia după `users.id`, nu după rol |
| Rutarea `/start <payload>` | `apps/bot/src/handlers/start.ts:18-35` | bilet_<cod> → bilete_azi → sofer → invitație | `instruit_<uuid>` înaintea invitației |
| Lungimea payload-ului | limita Telegram 64 car. `[A-Za-z0-9_-]` | `instruit_` + uuid = 45 | încape |
| Callback data ≤ 64 octeți | limita Telegram | `lg:<uuid>:<tg_id>` ≈ 50 | încape |
| Șoferul legat se recunoaște | `bilete-azi.ts:19-28` | `telegram_id = X AND active` | |
| Indexul unic pe `drivers.telegram_id` | migr. 483:126-129 (`drivers_telegram_id_uniq`) | un Telegram = un șofer | legarea refuză Telegram-ul deja pe alt șofer |
| «Neprezentați» e gol în v1 | `logica.js:192` | nescanatul rămâne în «De urcat» | punctul 8 |
| Portocaliu doar pentru cod lipsă din listă | `logica.js:300-316`, `348-372` | cod din lista descărcată = verde și fără internet | punctul 6 |
| Închiderea vânzării | `app_config.bilete_inchidere_tur_min/retur_min = 120` | T−2h pe ambele sensuri | punctul 6 |
| Locuri rezervate, un QR pe loc | `logica.js:446,454`, `sofer.ts` (`loc_nr`) | da | punctul nou 7 |
| Ultima migrație | `git ls-tree origin/main packages/db/migrations` | 544 | migrația nouă = 545 |
| Botul intră live din `deploy-bot` | `git log origin/deploy-bot..origin/main -- apps/bot` | 2 commit-uri nelivrate; deploy-bot strămoș al main | Ion: livrează împreună |
| Iurie poate deschide artifactul | **neverificat** (contul lui Iurie, partajarea lui Ion) | — | **rezervă:** invitat pe e-mail; altfel aceeași listă ca pagină în central-hub (DIGITAL), botul neschimbat |

## Punctele checklistului (artifact RO; bot RU + RO în italic)

1. Are smartphone cu internet și Telegram.
2. Telegram legat — fără el cursa lui nu se vinde online; pasagerii apar doar la șoferul din grafic (dacă dispecerul
   schimbă șoferul, lista trece la cel nou; «nu-mi apar pasagerii» → sună dispecerul).
3. Deschide «🎫 Biletele mele» (butonul de meniu sau `/bilete`).
4. Citește lista: cursele zilei, pasagerii pe opriri, locul, telefonul (apăsat = sună).
5. Scanează: «Scanează» → camera pe codul QR (merge și de pe hârtie sau captură de ecran).
6. Culorile: verde = urcă; roșu = nu urcă (deja scanat / altă cursă / anulat / cod necunoscut); portocaliu = cod care
   nu e în lista descărcată și nu e internet → urcă, se verifică după. Deschide aplicația cu internet după închiderea
   vânzării (2 h înainte de plecare). Un rând roșu apărut mai târziu = respins la verificare → spune dispecerului.
7. Locul pasagerului online e rezervat: vinde la urcare doar ce harta «Locuri» arată liber. Fiecare loc are codul lui —
   o familie de 3 = 3 scanări.
8. Biletul e plătit dinainte: nu ia bani; bon pe TIKI cu «online / altă metodă de plată».
9. **Fără QR nu urcă pe biletul online** (poate cumpăra bilet de la șofer). Cine n-a fost scanat rămâne în «De urcat»
   la oprirea lui — sună-l din listă.
10. Bilet returnat: dispare din listă; la scanare iese «anulat».
11. **Confirmat în Telegram** — se bifează când Iurie primește «✅ {nume} a confirmat»; atunci șoferul e «Instruit».

QR-ul șoferului apare pe card mereu (servește și la legare); confirmarea din bot nu face singură șoferul «Instruit»
în pagină — trebuie și bifele 1–10.

## Pași

1. **Migrația 545** `driver_instruire_bilete`: `driver_id uuid references drivers on delete restrict`, `versiune int`,
   `confirmat_la timestamptz`, `telegram_id bigint`, PK (`driver_id`, `versiune`). Plus `driver_legare_cereri` (cererea
   ȘI jurnalul legării manuale): `id`, `driver_id`, `telegram_id` (cel care cere), `telegram_vechi` (al șoferului în
   momentul cererii), `cod` (4 cifre), `nume_tg`, `creat_la`, `expira_la` (+15 min), `stare`
   ('asteapta'|'legat'|'refuzat'|'expirat'), `decis_de` (telegram_id-ul celui care a apăsat), `decis_la`; index unic
   parțial: o singură cerere 'asteapta' pe șofer și una pe telegram_id. Ambele: RLS activ, REVOKE ALL de la
   anon/authenticated; fără funcții/triggere (dacă apare vreuna: REVOKE EXECUTE FROM PUBLIC). Dry-run, apoi
   `db-migrate.sh tlx`. *Rezultat:* tabelele există, anon refuzat.
2. **Botul** — `handlers/instruire.ts` (logică pură + handler), constantă `PUNCTE_VERSIUNE = 1` și textele RU/RO:
   - `/start instruit_<uuid>` (doar privat): șoferul `<uuid>` activ? altfel «cod invalid». Șoferul de probă (`is_test`)
     e primit doar dacă e activ — e singurul mod de a proba fluxul cu Iurie; rândul lui de confirmare se șterge după
     probă și nu apare în artifact (lista e din `daily_assignments`, unde el nu e).
     - `ctx.from.id` = `telegram_id` al acestui șofer → punctele + buton `instr:ok:<uuid>`;
     - `ctx.from.id` legat de alt șofer → «codul e pentru alt șofer»;
     - altfel → întâi cererile vechi trec `asteapta→expirat` (`update … where stare='asteapta' and expira_la < now()`
       pentru acest șofer și acest telegram_id; jurnalul rămâne), apoi plafon (max 3 cereri/zi pe telegram_id, numărate în `driver_legare_cereri`; o cerere în așteptare pe
       șofer); se scrie cererea cu un `cod` aleator de 4 cifre; șoferul vede pe ecran «Arată-i lui Iurie codul
       **1234**»; Iurie primește «Leagă {nume din bază} de acest Telegram? Cod pe ecranul șoferului: **1234**
       — verifică-l pe telefonul din fața ta» (+ «⚠️ ÎNLOCUIEȘTE Telegram-ul legat acum», dacă șoferul era legat), cu
       butoanele `lg:<cerere_id>` / `lgno:<cerere_id>`. Nume Telegram escapate HTML, fără caractere de control/bidi,
       tăiate la 40.
   - `lg:` / `lgno:` — callback validat strict (regex), apoi doar dacă `ctx.from.id` = Telegram-ul lui Iurie
     (`users.id 34936fff…`) sau al unui ADMIN activ; cererea trebuie să fie 'asteapta', neexpirată, iar șoferul să aibă
     încă `telegram_vechi` (altfel «cererea nu mai e valabilă»). Update condiționat al stării (folosire o singură
     dată), apoi `drivers.telegram_id/telegram_legat_la/telegram_legat_prin='admin'` **condiționat de valoarea veche**
     (`where id=<uuid> and telegram_id is not distinct from telegram_vechi`, cu rândul întors verificat; 0 rânduri →
     «șoferul s-a legat între timp», cererea → 'expirat') (indexul unic refuză
     Telegram-ul aflat pe alt șofer → mesaj clar); mesajul lui Iurie își pierde butoanele. Șoferului: butonul de meniu
     setat pe chat-ul LUI (`setChatMenuButton({chat_id: tg})`, nu `ctx`) + punctele cu butonul de confirmare. La
     înlocuire, Telegram-ul vechi primește «Telegram-ul tău nu mai e legat de {nume}; dacă nu tu ai cerut, sună
     dispecerul». Ion (ADMIN) primește «Iurie a legat {nume}» (+ «înlocuit»). `lgno:` → șoferului «Iurie a refuzat».
   - `instr:ok:<uuid>` — `ctx.from.id` trebuie să fie Telegram-ul șoferului `<uuid>`; insert
     (`on conflict do nothing returning`) pe (`driver_id`, `PUNCTE_VERSIUNE`); doar dacă s-a scris un rând → mesaj la
     Iurie și Ion «✅ {nume} a confirmat instruirea biletelor online (v{N}) — HH:MM» (nume escapate HTML; eroarea de
     trimitere prinsă și logată, rândul rămâne).
   - **Legarea automată existentă** (`handleSoferContact`, `sofer.ts:128-146`) devine și ea condiționată: update
     `where id=… and telegram_id is not distinct from <valoarea citită>`, rândul întors verificat; 0 rânduri → refuz
     «încearcă din nou», fără «Gata» fals. Test cu intercalarea legării automate și manuale (logica pură a deciziei +
     forma update-ului).
   - Rutare în `start.ts` înaintea invitației; callback-urile în `bot.ts`. Teste vitest pe logica pură (payload,
     decizia legării, autorizarea `lg:`, textele). *Rezultat:* teste verzi, `tsc` pe apps/bot.
3. **Artifactul** «Instruire bilete»: `db` + `user`; colecții `soferi` (scrise doar de mine, `admin`: nume, rute,
   legat, motivul ultimului refuz, telefon dublat da/nu, `versiune_confirmata`) și `progres/{driverId}` (`interact`:
   bifele 1–11, cine, când, nota lui Iurie). Secțiuni: «De legat (11)», «De instruit», «Instruiți ✅». Un șofer = un
   card cu QR-ul lui (biblioteca qrcode de pe cdnjs, versiune fixă). Pagina are aceeași constantă
   `PUNCTE_VERSIUNE` ca botul; `progres/{driverId}` are câmpul `versiune` (versiunea bifelor). Bifele unei versiuni
   mai vechi nu contează: cardul arată «Punctele s-au schimbat — reinstruiește» și o listă goală pentru versiunea
   curentă (cele vechi rămân în istoric). Bifa 11 scrie versiunea din mesajul primit de Iurie («(v{N})»). Card
   «Instruit» = bifele 1–11 pe versiunea curentă; `versiune_confirmata` importată din bază e doar semnal
   («confirmat în bot, bifează la Iurie» / nepotrivire), nu închide singură cardul. Fără telefoane.
4. **Lista** în `soferi`: cei 48 (interogarea din tabel), cu ArtifactData batch; reîmprospătare la cerere (inclusiv
   `versiune_confirmata` din `driver_instruire_bilete`).
5. **Livrare:** commit, push `HEAD:main`; `git push origin <sha>:deploy-bot` (Ion: livrează împreună).
6. Ion partajează artifactul cu Iurie (Contributor). Acces: doar Ion și Iurie; după instruire lista se golește.

## Fișiere

- `packages/db/migrations/545_driver_instruire_bilete.sql` — nou.
- `apps/bot/src/handlers/instruire.ts` + `instruire.test.ts` — nou.
- `apps/bot/src/handlers/start.ts` — rutarea `instruit_`.
- `apps/bot/src/bot.ts` — callback-urile `instr:ok:`, `lg:`, `lgno:`.
- Artifact: fișier în scratchpad, publicat pe claude.ai (nu e în repo).

## Riscuri

- **Iurie nu poate deschide artifactul** → rezerva din tabel.
- **Bifa 11 e manuală** (pagina nu vede baza) → adevărul e în `driver_instruire_bilete`; la cerere sincronizez
  `versiune_confirmata` și arăt nepotrivirile.
- **Legare greșită / preluare** (cineva își pune numele șoferului în Telegram): Iurie leagă doar dacă codul de 4 cifre
  de pe telefonul din fața lui = codul din cerere; înlocuirea e marcată ⚠️, Telegram-ul vechi și Ion sunt anunțați;
  jurnal în `driver_legare_cereri`; repararea = o nouă cerere de pe telefonul corect.
- **deploy-bot** livrează și c8928576 + cfb8f10d (decizia lui Ion).
- **Iurie legat de șoferul de probă**: după probă `telegram_id` de probă rămâne cum a hotărât planul probei; rândul
  nostru de probă se șterge.
- **Date personale pe claude.ai**: 48 de nume și rute, fără telefoane; acces Ion + Iurie; golit după instruire.
- Lista se învechește (șofer nou) → reîmprospătare la cerere.

## Verificare

- vitest + `tsc` pe apps/bot; gate-urile git-guards la push.
- Migrația: dry-run, apply; `select` ca anon refuzat.
- Pe viu, după deploy-bot, cu Iurie: șoferul de probă (`is_test`, legat de Iurie) se activează pe durata probei (după
  planul probei fizice), apoi: (a) Iurie scanează QR-ul lui → punctele → confirmă → rând + mesaj la Iurie și Ion; (b) a doua apăsare → fără mesaj nou; (c) QR-ul unui alt șofer → «cod pentru alt șofer».
  Legarea manuală se probează pe primul șofer real refuzat, cu Iurie.
- Artifact: ArtifactData `list` pe `soferi` și `progres` după publicare; o bifă de probă scrisă și ștearsă.

## Întrebări pentru Ion — închise

1. deploy-bot → «livrează împreună». 2. confirmarea → «și la mine». 3. legarea refuzaților → «Iurie leagă singur din
bot». 4. fără QR → «Nu urcă fără QR».

## Review: security-auditor

Verificat în cod: `apps/bot/src/handlers/start.ts:17-37` (ordinea payload-urilor; orice payload necunoscut cade în
`validateInviteToken`), `apps/bot/src/handlers/bilete-azi.ts:19-28` (`soferLegat` = `telegram_id` + `active`),
`apps/bot/src/handlers/sofer.ts:109-115` (`handleSoferStart` doar în privat, nu scrie nimic), `apps/bot/src/bot.ts:331-335`
(tiparul `retur:`/`final:` — identitatea din `callbackQuery.from`, nu din `callback_data`),
`apps/bot/src/middleware/auth.ts:10-26` (callback-urile trec și pentru cei fără `users`), `bot.ts:37` (rate limit global),
`packages/db/migrations/544_social_video.sql:82-85` (tiparul ENABLE RLS + REVOKE ALL), `483_bilete_online.sql:129`
(`drivers_telegram_id_uniq`).

**Ce e corect și rămâne așa:** linkul public `start=instruit` nu dă nimic în plus față de `start=sofer` deja public
(textul punctelor nu e secret, nelegatul primește doar cererea de contact); `instr:ok` re-verifică șoferul după
`ctx.from.id` — un mesaj redirecționat sau un buton apăsat de altcineva confirmă cel mult pentru cel care apasă;
tabelul nou cu RLS activ, fără politici, REVOKE ALL de la anon/authenticated — închis, ca în 544; fără telefoane în
artifact; `soferi` scris doar de admin.

### Observații

1. **medium (−1.0) — QR-ul e același pentru toți: confirmarea nu e legată de cardul bifat.** Linkul fix
   `start=instruit` identifică doar telefonul care scanează. Iurie bifează 1–9 pe cardul lui X, arată QR-ul, scanează
   Y (alt șofer prezent, sau X cu Telegram-ul legat de alt cont); Iurie primește «✅ Y a confirmat», bifează 10 la X
   din reflex. Rezultat: X apare «Instruit» în pagină fără confirmare; în bază e rândul lui Y. Exact ce cere Ion
   («confirmare că Iura a învățat») devine falsificabil din greșeală.
   *Corecție:* payload per șofer `instruit_<driverId fără cratime, 32 hex>` (Telegram permite 64 caractere `[A-Za-z0-9_-]`);
   botul compară id-ul din payload cu `soferLegat(ctx.from.id).id` și refuză «этот код для другого водителя» la
   nepotrivire; `callback_data` = `instr:ok` rămâne fără id (identitatea tot din `from`), id-ul din payload se
   re-verifică în callback prin aceeași comparație (păstrat în textul/sesiunea mesajului sau re-derivat). UUID-ul
   șoferului nu e secret — controlul rămâne legarea Telegram. Mesajul către Iurie conține numele care trebuie să
   coincidă cu cardul.

2. **low (−0.5) — Destinatarul notificării se caută după `users.id`, nu după rol.** În `users` sunt mai mulți
   DIGITAL (Vlad, migr. 116/219) și doi Iurie (unul e operatorul de peron Chișinău). O căutare «role = DIGITAL» sau
   după nume trimite mesajul greșit. *Corecție:* constantă/env `INSTRUIRE_NOTIFY_USER_ID=34936fff-…`, `select
   telegram_id … eq('id', X).eq('active', true)`; dacă lipsește → log, fără fallback pe rol.

3. **low (−0.5) — «Nu re-notifică» trebuie să fie atomic.** Două apăsări rapide (sau retry Telegram la webhook lent)
   cu «select apoi upsert» dau două mesaje la Iurie. *Corecție:* `insert … on conflict (driver_id) do nothing
   returning driver_id` (în supabase-js: `upsert(..., { onConflict: 'driver_id', ignoreDuplicates: true }).select()`);
   notificarea doar dacă s-a întors un rând. Scrierea în bază ÎNAINTE de `sendMessage`; eșecul trimiterii (Iurie a
   blocat botul) prins și logat, fără a anula confirmarea. Numele șoferului escapat dacă mesajul e `parse_mode: 'HTML'`.

4. **low (−0.5) — Proba pe viu leagă Telegram-ul lui Iurie de un «șofer de probă».** `drivers_telegram_id_uniq` și
   `soferLegat` îi dau lui Iurie acces la mini app-ul biletelor acelui șofer; dacă șoferul de probă are vreodată o
   cursă în `daily_assignments`, Iurie vede pasagerii (nume, telefon). *Corecție:* în «Verificare»: șofer de probă
   marcat test, fără atribuiri; după probă `update drivers set telegram_id = null` și ștergerea rândului de probă din
   `driver_instruire_bilete` (prin `db-migrate.sh --exec`), cu faptul în commit.

5. **low (−0.5) — Date personale în claude.ai.** 51 de nume complete + rute + starea legării ajung în baza unui
   artifact (terț, în afara Supabase), partajat ca Contributor. E minimizat (fără telefoane), dar planul nu spune:
   cine mai are acces, cât trăiesc datele, ce se șterge după instruire. *Corecție:* o frază în plan — doar Ion +
   Iurie, fără link public; fără `driver_id` intern dacă nu e nevoie (după obs. 1 e nevoie — e acceptabil, UUID-ul nu
   e secret); după terminarea instruirii colecția `soferi` se golește. Legat de nota GDPR (Legea 133).

6. **low (−0.3) — Migrația: ce NU conține.** Planul nu spune că migrația n-are funcții/triggere. Dacă apare
   `updated_at`-trigger sau o funcție helper → `REVOKE EXECUTE … FROM PUBLIC` (funcțiile noi rămân executabile de anon
   prin PUBLIC, după 355/356). De precizat și `driver_id … references drivers(id) on delete restrict` și că
   `confirmat_la` singur NU înseamnă «instruit» în niciun alt raport (auto-confirmarea prin linkul public e posibilă,
   cum spune deja secțiunea Riscuri).

Deduceri: −1.0 −0.5 −0.5 −0.5 −0.5 −0.3 = −3.3.

Scor: 6.7 · Blocante (critical/high): 0

## Review: business-logic-auditor

Verificat pe cod (worktree la `cfb8f10d` = origin/main) și pe bază (SELECT prin MCP, 10.10).

**Fapte noi pentru planul de mai sus**
- Vânzarea online e deschisă pe **28 din 30 de rute interurbane** (`crm_routes.bilete_online_tur/retur`), toate cu
  Briceni sau Edineț în opriri; închise doar rutele **5 (Șirăuți)** și **13 (Lipcani-Rîșcani)**. Perechile vândute:
  Briceni/Edineț ↔ Chișinău, **în ambele sensuri** (`app_config.bilete_localitati_vanzare`, `bilete_destinatii_vanzare`,
  `packages/db/dist/bilete-localitati.d.ts:7,41`), deci și șoferul de retur scanează.
- Închiderea vânzării: `bilete_inchidere_tur_min = 120`, `bilete_inchidere_retur_min = 120` → lista e finală cu 2 h înainte
  de plecare (nu 0 pe tur, cum scrie planul din 02.10 la :455). Pornire: `bilete_online_de_la = 2026-10-12`.
- Șoferii relevanți (tur + retur, `driver_id_retur` inclus, 30 zile, activi, non-test): **48 pe rutele vândute**, 37 legați,
  **11 nelegați**; 3 din cei 51 ai planului circulă doar pe rutele 5/13, unde nu se vinde nimic. Din cei 11 nelegați,
  **2 au telefonul identic cu al altui șofer activ**. În `drivers_telegram_incercari` stau **5 refuzuri `nepotrivit`**
  ale unor Telegram-uri care nici acum nu sunt legate.
- Iurie (`34936fff…`, DIGITAL, activ) are `telegram_id`, iar acesta e deja legat și de un rând `drivers`, deci proba pe viu
  din «Verificare» e posibilă.

### H1 — high (−2.0): «De legat» nu are cale de rezolvare pentru refuzuri
Dovadă: `apps/bot/src/handlers/sofer.ts:33-47` (`deciziaLegarii` refuză `nepotrivit` / `multiplu` / `deja_legat`), textele
de la :70-74 spun «dispecerul te leagă de mână», dar în `apps/admin/src` nu există niciun ecran care să citească
`drivers_telegram_incercari` sau să scrie `drivers.telegram_id` (grep: zero potriviri pentru `drivers_telegram_incercari`,
`telegram_legat_prin`). Planul îi dă lui Iurie legarea celor nelegați ca sarcină, dar singurul instrument e scanarea QR,
adică același `handleSoferStart`.
**Scenariul de eșec:** cei 2 șoferi cu telefon dublat primesc garantat `multiplu`. Cei 5 cu refuz `nepotrivit` au alt număr
în `drivers.phone`. Șoferul care și-a schimbat telefonul sau contul Telegram primește `deja_legat`. Iurie nu poate închide
cardul niciunuia, iar din 12.10 cursele lor nu se vând deloc (migr. 543: cursa se vinde online doar cu șoferul legat).
**Corecție în plan:** un pas nou.
(a) Lista «De legat» din artifact primește motivul ultimului refuz, citit din `drivers_telegram_incercari`, și semnalul
«telefon dublat».
(b) Calea manuală se scrie explicit în plan. Varianta minimă: Iurie scrie în artifact telefonul corect și Claude corectează
`drivers.phone` / leagă prin `db-migrate.sh tlx --exec`. Pentru `deja_legat`, dezlegarea Telegram-ului vechi trece prin
aceeași cale.
(c) O întrebare pentru Ion: cine are dreptul să lege sau să dezlege de mână.

### M1 — medium (−1.0): punctul 8 e greșit, «Neprezentați» e mereu gol în v1
Dovadă: `apps/admin/public/mini-app/bilete/logica.js:192` («Neprezentații (steag din server, v1 gol)»). `PasagerApi` din
`apps/admin/src/lib/bilete/sofer.ts` nu are câmpul `neprezentat` și niciun cod din admin sau bot nu-l pune. Pasagerul
nescanat rămâne în «De urcat» (`grupeazaPeOpriri`). Șoferul învățat să caute în «Neprezentați» găsește o listă goală și
crede că toți au urcat.
**Corecție:** «Cine n-a fost scanat rămâne în «De urcat» la oprirea lui; sună-l din listă.» A doua întrebare pentru Ion:
ce face șoferul cu pasagerul care are bilet, dar nu poate arăta QR-ul (nu există căutare după nume și nici urcare manuală).

### M2 — medium (−1.0): lipsesc locurile rezervate și biletele pe mai multe locuri
Dovadă: `sofer.ts` trimite `loc_nr` pe fiecare bilet, iar mini app-ul are harta «Locuri» cu legenda «online, încă neurcat»
și «liber, pentru bilet la șofer» (`logica.js:454`, `LOCURI_DUPA_PLECARE_MIN`). O comandă cu N locuri are N coduri QR
(«1 loc confirmat · mai scanează N», `logica.js:446`).
**Scenariul:** șoferul vinde la urcare locul rezervat online, iar pasagerul online rămâne fără loc. Sau scanează un singur
cod pentru o familie, iar ceilalți rămân «De urcat», cu alertă după.
**Corecție:** un punct nou: «locul pasagerului online e rezervat; vinzi doar ce harta arată liber; fiecare loc are codul
lui, se scanează pe rând».

### M3 — medium (−1.0): punctul 6 (portocaliu) e incomplet și induce în eroare
Dovadă: `logica.js:300-316` (`clasificaLocal`). Fără internet, un cod aflat în lista DESCĂRCATĂ iese **verde**.
Portocaliul apare doar pentru un cod care lipsește din listă: fără internet, sau când serverul nu răspunde în 3 s
(`ASTEPTARE_SERVER_MS`). După reconectare, un portocaliu respins devine rând roșu persistent «Respins după verificare»
(`aplicaRezultate`, `logica.js:348-372`). Vânzarea se închide la T−2h, așa că lista e completă de atunci.
**Corecție:** «deschide aplicația cu internet după închiderea vânzării (2 h înainte de plecare) ca să ai lista întreagă; un
roșu apărut mai târziu sub contor înseamnă că biletul a fost respins la verificare → spune dispecerului».

### M4 — medium (−1.0): `puncte_versiune` n-are semantică
Planul pune coloana, dar pasul 2 face un upsert pe `driver_id` care «nu re-notifică». Nu se spune:
- ce versiune scrie botul;
- dacă o confirmare mai veche decât versiunea curentă mai contează;
- ce vede Iurie (artifactul nu citește baza).
**Scenariul:** punctele se schimbă (de exemplu M1–M3 de mai sus, după 12.10). Upsert-ul suprascrie `confirmat_la`, sau
botul tace pentru că rândul există. Iurie nu află cine trebuie reinstruit.
**Corecție:** versiunea e o constantă în `instruire.ts`. Upsert-ul notifică atunci când `puncte_versiune` crește.
`soferi` din artifact primește `versiune_confirmata`, iar cardul revine la «De instruit» când aceasta e mai mică decât
versiunea curentă.

### L1 — low (−0.5): lista șoferilor
Lista bună e de 48 (rutele vândute, tur și retur), nu de 51, și «De legat» are 11, nu 14. Interogarea din pasul 4 să
filtreze pe `bilete_online_tur/retur` și să includă `driver_id_retur`. Textul «De ce» să spună «toate interurbanele prin
Briceni/Edineț, ambele sensuri».

### L2 — low (−0.5): mesajele botului doar în RU
Textele șoferului din bot sunt bilingve, RU cu RO în italic (`sofer.ts:51-74`). Mesajul cu punctele și butonul să urmeze
aceeași formă.

### L3 — low (−0.5): punctul 2 nu spune de ce contează legarea
Fără Telegram legat, cursa șoferului nu se vinde online (migr. 543). Pasagerii apar doar la șoferul din grafic pentru
ziua respectivă: dacă dispecerul schimbă șoferul, lista trece la noul șofer. «Nu-mi apar pasagerii» → sună dispecerul.

Corecte, confirmate pe cod: punctul 3 (meniul `🎫 Билеты` pus la legare, `/bilete`), 4 (`tel:` +373), 5 (QR din link sau
cod gol, `normalizeazaCod`), 7 (bon TIKI «online / altă metodă de plată», planul din 02.10 :476-482), 9 («anulat» la
scanare, biletul dispare din listă, `sofer.ts` păstrează doar `valid`/`urcat`). Rutarea `instruit` înaintea invitației și
callback-ul `instr:ok` sunt sigure: `authMiddleware` nu blochează pe cine nu e în `users`.

Deduceri: −2.0 −1.0 −1.0 −1.0 −1.0 −0.5 −0.5 −0.5 = −7.5

Scor: 2.5 · Blocante (critical/high): 1

## Triaj revizori Claude — runda 1

| sursă | id | decizie | unde în plan |
|---|---|---|---|
| security | QR comun | acceptat | QR pe șofer `instruit_<uuid>`, refuz pentru alt șofer |
| security | Iurie după rol | acceptat | Iurie după `users.id 34936fff…` |
| security | notificare dublă | acceptat | insert `on conflict do nothing returning`, mesaj doar la rând nou |
| security | șoferul de probă | acceptat | Riscuri |
| security | date pe claude.ai | acceptat | pas 6 + Riscuri |
| security | migrația | acceptat | pas 1 (`on delete restrict`, fără funcții) |
| business | H1 legare fără cale | acceptat, decizia lui Ion: «Iurie leagă singur din bot» | `lg:` / `lgno:` |
| business | M1 «Neprezentați» | acceptat + Ion: «Nu urcă fără QR» | punctul 9 |
| business | M2 locuri | acceptat | punctul 7 |
| business | M3 portocaliu | acceptat | punctul 6 |
| business | M4 versiune | acceptat | PK (driver_id, versiune), `versiune_confirmata` |
| business | L1 lista 48 | acceptat | tabel + pas 4 |
| business | L2 bilingv | acceptat | titlul punctelor |
| business | L3 de ce legarea | acceptat | punctul 2 |

Zona atinsă de corecții: dreptul nou de legare manuală (`lg:`) → security-auditor relansat (runda 2).

## Review: security-auditor — runda 2

Verificat în cod: `apps/bot/src/handlers/start.ts:17-43` (ordinea payload-urilor), `handlers/sofer.ts:31-48`
(`deciziaLegarii`: contactul PROPRIU, `contact.user_id === from.id`), `:94-102` (`puneMeniulBilete` folosește
`ctx.chat.id`), `:143-153` (update + prinderea `drivers_telegram_id_uniq`), `handlers/bilete-azi.ts:19-28`
(`soferLegat`), `apps/admin/src/lib/bilete/sofer-auth.ts:7-28` + `sofer.ts:97-148` (mini app-ul: șoferul = rândul
`drivers` cu `telegram_id` din initData; primește `passenger_name`, `phone`, codurile QR și poate marca `urcat`),
`bot.ts:37-38` (rate limit în memorie, 30/min pe `from.id`; `authMiddleware` lasă trecerea și fără `users`),
`bot.ts:310-335` (tiparul `vl:`/`retur:`: identitatea din `ctx.from`), `migr. 483:126-129`, `migr. 532:8,99`
(Telegram-ul lui Iurie `1407418059` e pe rândul `is_test`).

**Ce e corect:** autorizarea `lg:` pe `ctx.from.id` (nu pe conținutul butonului) — corect, pentru că `callback_data`
NU e de încredere: un client MTProto (`messages.getBotCallbackAnswer`) poate trimite date arbitrare pe orice mesaj al
botului din propriul chat; cine nu e Iurie/ADMIN e refuzat. Indexul unic ține «un Telegram = un șofer». `instr:ok`
re-verifică șoferul după `from.id`. Ion primește fiecare legare manuală. UUID-ul (122 biți) nu se poate ghici —
enumerarea e exclusă; scurgerea lui (QR fotografiat de pe ecranul lui Iurie, artifactul) e posibilă, deci UUID-ul nu
trebuie să fie singura barieră.

### Observații

1. **high (−2.0) — Legarea manuală nu e legată de omul din fața lui Iurie: preluarea rolului de șofer prin inginerie
   socială.** Cererea spre Iurie arată doar ce controlează atacatorul: `first_name`/`last_name`/`@username` din
   Telegram. Ramura «altfel → cerere» acceptă orice Telegram nelegat, inclusiv pentru un șofer DEJA legat («înlocuiește
   Telegram-ul vechi»).
   *Scenariul de eșec:* cineva obține UUID-ul șoferului X (fotografiază QR-ul de pe ecranul lui Iurie la instruire, sau
   e un fost șofer / o rudă care a scanat cardul), își numește contul Telegram «Ion Popescu», scanează
   `start=instruit_<X>` în ziua instruirilor. Iurie, care tocmai aprobă cereri în serie, apasă «Leagă». Efect:
   (a) Telegram-ul legitim al lui X e înlocuit tăcut — X nu-și mai vede pasagerii; (b) atacatorul primește zilnic în
   mini app numele și **telefoanele** pasagerilor cursei lui X (date personale, Legea 133); (c) poate scana/marca
   «urcat» codurile din listă → pasagerul real primește la urcare «deja scanat» = roșu = **nu urcă** («Nu urcă fără
   QR»). Ion află doar după («Iurie a legat X»), fără să știe că legarea e falsă.
   *Corecție (în plan):*
   - **Cod de prezență:** la cererea `instruit_` pentru un nelegat botul îi arată ȘOFERULUI un cod de 4 cifre
     (`crypto.randomInt`), iar mesajul lui Iurie conține același cod: «Compară codul de pe telefonul șoferului: 4827».
     Iurie apasă «Leagă» doar dacă codul coincide cu ecranul din fața lui. Cererea nu se aprobă de la distanță.
   - **Telefonul real:** înaintea cererii, botul cere contactul propriu (același buton `request_contact`,
     `contact.user_id === from.id`, verificat de Telegram) și mesajul lui Iurie arată «Telegram: +373 6X XXX XXX ·
     în baza: +373 …» — exact cazul `nepotrivit`, dar acum vizibil, nu falsificabil prin nume.
   - **Înlocuirea** unui Telegram existent: mesajul lui Iurie spune explicit «⚠️ X are deja Telegram legat din
     DD.MM (@vechi) — Leagă îl ÎNLOCUIEȘTE»; după înlocuire, Telegram-ul vechi primește «Telegram-ul tău a fost
     dezlegat de la X de Iurie; dacă nu ești de acord — sună dispecerul», iar mesajul lui Ion spune «înlocuit».

2. **medium (−1.0) — Butoanele `lg:` sunt fără stare: un buton vechi rescrie starea curentă.** `lg:<uuid>:<tg>` nu
   știe ce era legat când s-a creat cererea, nici când expiră. *Scenariu:* X trimite cerere marți (T2), se leagă
   între timp singur prin telefon (T1, legitim) sau altă cerere e aprobată; vineri Iurie apasă butonul vechi → T1
   înlocuit cu T2. Două cereri pentru același șofer (T2, T3) aprobate una după alta → ultima câștigă tăcut.
   *Corecție:* cererile într-un tabel în migr. 545 (`driver_legare_cereri`: id, driver_id, telegram_id, telegram_vechi,
   cod, creat_la, expira_la = +15 min, stare `in_asteptare|legat|refuzat|expirat`, decis_de, decis_la; RLS + REVOKE
   ALL, ca `driver_instruire_bilete`); butoanele `lg:<id_cerere>` / `lgno:<id_cerere>`; aprobarea = update atomic
   `… where id = $1 and stare = 'in_asteptare' and expira_la > now()`, apoi
   `update drivers … where id = X and active and not is_test and telegram_id is not distinct from <telegram_vechi>`
   (compare-and-set); 0 rânduri → «cererea e veche, cere șoferului să scaneze din nou». După decizie botul
   `editMessageText` fără butoane.

3. **medium (−1.0) — Nu rămâne urmă a legării manuale.** `drivers.telegram_legat_prin = 'admin'` nu spune CINE a
   legat (Iurie sau care ADMIN) și nici ce Telegram era înainte; `drivers_telegram_incercari` ține doar refuzuri.
   La o reclamație («nu-mi apar pasagerii», scurgere de telefoane) nu se poate reconstitui lanțul. *Corecție:* tabelul
   de la obs. 2 este jurnalul (`decis_de` = `from.id` al aprobatorului, `telegram_vechi`); fără `DELETE` pe el.

4. **medium (−0.7) — Spam spre Iurie, fără plafon pe cereri.** Plafonul existent e în memorie, 30 mesaje/min pe
   expeditor (`rateLimit.ts`), se resetează la repornire și nu limitează numărul de conturi. Un singur cont trimite
   30 de cereri/minut (sau 1/minut toată ziua); mai multe conturi — oricât; cererile reale se pierd în zgomot, iar
   oboseala crește șansa de aprobare greșită (obs. 1). *Corecție:* cel mult o cerere `in_asteptare` pe șofer și pe
   Telegram (o nouă scanare reînnoiește codul, nu trimite alt mesaj); maximum 3 cereri pe Telegram/zi, numărate în
   tabelul de la obs. 2 (nu în memorie); peste plafon → răspuns scurt șoferului, nimic la Iurie.

5. **low (−0.5) — Textele controlate de atacator în mesajul lui Iurie.** `first_name`, `last_name`, `username` intră
   în mesaj; cu `parse_mode: 'HTML'` neescapat, un nume ca `<a href="…">Ion Popescu</a>` fie strică trimiterea
   (cererea se pierde), fie arată un link fals; caracterele de control bidi (U+202E) și numele de 64 de caractere
   ascund adevăratul nume. *Corecție:* escapare HTML pentru toate trei, scoaterea caracterelor `\p{Cc}\p{Cf}`,
   tăiere la 40 de caractere; numele din bază (`drivers.full_name`) e cel scris îngroșat, Telegram-ul doar ca
   «cont: …».

6. **low (−0.3) — `lgno:` și `instr:ok:` cu aceeași autorizare ca `lg:`.** Planul pune verificarea doar pe `lg:`.
   Cum `callback_data` se poate falsifica, un `lgno:<uuid>:<tg_victimă>` neautorizat face botul să trimită «Iurie a
   refuzat» oricărui Telegram care a pornit botul. *Corecție:* `lgno:` cere același aprobator ca `lg:`; parsarea
   strictă `^lg(no)?:(\d{1,12})$` (după obs. 2) sau `^lg:([0-9a-f-]{36}):(\d{1,15})$` cu `Number.isSafeInteger`;
   payload-ul `instruit_` validat ca UUID înainte de interogare.

7. **low (−0.3) — Meniul biletelor ajunge la Iurie, nu la șofer.** `puneMeniulBilete(ctx)` folosește `ctx.chat.id`;
   în callback-ul `lg:` chat-ul e al lui Iurie, deci butonul «🎫 Билеты» s-ar pune în chat-ul lui. *Corecție:*
   `ctx.api.setChatMenuButton({ chat_id: <tg șofer>, … })` — o variantă a funcției care primește `chatId`. Același
   lucru la `sendMessage` către șofer (chat_id = tg-ul din cerere, nu `ctx.chat`).

Deduceri: −2.0 −1.0 −1.0 −0.7 −0.5 −0.3 −0.3 = −5.8.

Scor: 4.2 · Blocante (critical/high): 1

## Triaj security — runda 2

| id | decizie | unde |
|---|---|---|
| 1 high preluare prin păcălirea lui Iurie | acceptat: cod de 4 cifre pe ecranul șoferului ≡ codul din cerere; ⚠️ la înlocuire; anunț la Telegram-ul vechi și la Ion | pas 2, Riscuri |
| 2 butoane fără stare | acceptat: `driver_legare_cereri`, 15 min, o singură folosire, `telegram_vechi` neschimbat | pas 1, 2 |
| 3 fără urmă | acceptat: același tabel e jurnal (`decis_de`, `decis_la`, `telegram_vechi`) | pas 1 |
| 4 spam | acceptat: 3/zi pe telegram_id + o cerere în așteptare pe șofer, în bază | pas 1, 2 |
| 5 nume Telegram | acceptat | pas 2 |
| 6 `lgno:` autorizat | acceptat | pas 2 |
| 7 meniul pe chat-ul greșit | acceptat: `setChatMenuButton` pe Telegram-ul șoferului | pas 2 |

Nu mai rămân critical/high deschise la partea Claude.

## Critic extern — runda 1

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | legarea automată poate suprascrie legarea manuală (cursă) | acceptat | pas 2: ambele căi fac update condiționat de valoarea veche + rândul întors verificat; test de intercalare |
| C2 | medium | cererile expirate nu eliberează indexul unic | acceptat | pas 2: `asteapta→expirat` înaintea verificării și creării, jurnalul rămâne |
| C3 | medium | proba cu șoferul `is_test` ar fi refuzată | acceptat | pas 2: `is_test` primit doar dacă e activ; rândul de probă se șterge; Verificare |
| C4 | medium | bifele fără versiune | acceptat | pas 3: `progres.versiune`, bifele vechi nu contează, bifa 11 scrie versiunea, importul doar semnal |
