# Dezbatere bronare+plată — runda 1 (Claude)

Data: 10.10.2026, ~17:45 UTC. Sursa: `origin/main` la `e40f061d` (extras cu `git archive`), funcțiile live din proiectul
Supabase `zqkzqpfdymddsywxjxow` (`pg_get_functiondef`), `app_config` live, rânduri live din `bilete_comenzi` /
`maib_checkouts`. Doar citire: fără cod, fără commit, fără scrieri în bază, fără POST în producție.

Marcaje: **[viu]** = verificat pe viu (SQL pe baza de producție); **[cod]** = citit în cod/funcție, scenariul dedus.

Rezumat: **2 high, 5 medium, 6 low**, zero critical.

---

## Constatări

### C1 — HIGH — Legarea automată la Telegram după telefon (555) se poate fura: telefonul nu e dovedit

- **Unde:** trigger `bilete_leaga_telegram_dupa_telefon` (migr. 555); `apps/admin/src/app/api/bilete/comanda/route.ts:84`
  (mini app leagă la creare, înainte de plată); `apps/bot/src/handlers/bilet.ts:211` + `apps/bot/src/services/bileteClienti.ts:78`
  (`leagaComanda` leagă orice comandă după `cod`, indiferent de stare).
- **Dovadă [viu, definiția funcției]:**
  ```sql
  SELECT c.telegram_id INTO NEW.telegram_id FROM bilete_comenzi c
   WHERE c.phone = NEW.phone AND c.telegram_id IS NOT NULL AND c.id <> NEW.id AND c.test = NEW.test
   ORDER BY c.created_at DESC LIMIT 1;
  ```
  Fără filtru pe starea comenzii-sursă, fără dovada că telefonul e al contului Telegram; cea mai NOUĂ comandă câștigă.
- **Scenariu:** atacatorul deschide mini app-ul în Telegram-ul lui, face o comandă cu telefonul victimei P și NU plătește
  (rândul primește `telegram_id = atacator` la creare, rămâne `noua` → `expirata`). Victima cumpără apoi pe site cu P →
  la «platita» trigger-ul copiază `telegram_id = atacator` → biletul (QR, nume, cursă) ajunge în chatul atacatorului
  (botul livrează «plătită + telegram_id + nelivrată»). Atacatorul cere returnarea în bot: `bilete_retur_cifre` cere ultimele
  4 cifre ale telefonului — pe care le știe. Rezultat: biletul victimei e anulat (banii merg pe cardul victimei, dar după
  grilă, nu integral), sau atacatorul urcă primul cu QR-ul (prima scanare câștigă). Și varianta nevinovată: un număr
  folosit de doi oameni (familie) trimite biletele celuilalt; și victima legată corect e «suprascrisă» de o legare mai nouă.
- **Fix minim:** sursa legării = doar un telefon DOVEDIT pentru acel cont: Telegram `request_contact` (contactul propriu,
  `contact.user_id == from.id`) scris într-un tabel `telefon → telegram_id`; trigger-ul citește doar de acolo. Până atunci:
  cel puțin `c.status IN ('platita','returnata','anulata')` și renunțare la legare dacă numărul are ≥ 2 conturi diferite;
  iar comanda legată automat nu primește returnarea din bot fără verificare suplimentară.

### C2 — HIGH — Sesiunile maib nu expiră niciodată: împăcarea B se blochează, plata poate veni oricând (și după plecare)

- **Unde:** `apps/admin/src/lib/maib/client.ts:219` (`createCheckout` nu trimite nicio expirare);
  `apps/admin/src/lib/bilete/impacare.ts:127` (B: `.order('created_at').limit(10)`); `impacare-reguli.ts`
  («sesiunea maib trăiește 25 min»); `bilete_marcheaza_platita` (nu verifică plecarea cursei).
- **Dovadă [viu]:** 10 comenzi `noua` cu sesiune, toate > 30 min; cea mai veche creată 09.10 18:49 UTC (trip 13.10, 556 lei),
  `maib_checkouts.status = 'Initialized'` cu `updated_at` 10.10 17:20 → maib încă o raportează deschisă după ~23 h.
  Celelalte: `Initialized` / `Paymentmethodselected` / `WaitingForInit`. Exact 10 = `COTE.cu_checkout`.
- **Scenarii:**
  1. *Înfometarea împăcării:* B ia mereu aceleași 10 cele mai vechi sesiuni care nu se închid; a 11-a comandă (cu callback
     pierdut) nu mai e sincronizată niciodată de B → plată fără bilete până intervine cineva (Ion: «nu e dispecer»).
  2. *Plata după rezervare / după plecare:* pagina băncii rămâne plătibilă; omul plătește peste 3 ore → rezervarea locului
     (30 min) și cota au expirat → `loc_schimbat` / `cota_depasita` → `platita_fara_bilet`. Mai rău: plătește după plecarea
     cursei → `bilete_marcheaza_platita` emite bilete pentru o cursă plecată; botul dă «fara_bani: plecat».
  3. *Plată dublă:* «Înapoi» din bancă, reîncărcare (cheile din `cheiVechi` sunt în memorie, se pierd), comandă nouă și
     plată; apoi fila veche a băncii e plătită și ea → două plăți, al doilea set de bilete sau `platita_fara_bilet`.
  4. *«Reia plata» cu altă alegere* (M4): `bilete_inlocuieste_incercare` răspunde `la_banca` cât sesiunea e deschisă →
     cu sesiuni care nu se închid, mesajul «încearcă peste câteva minute» nu se mai rezolvă până la reîncărcarea paginii.
- **Fix minim:** în împăcarea B, la o comandă `noua` cu sesiune mai veche decât rezervarea (30 min): `cancelCheckout`
  (există deja în client) → apoi `expira`; ordonarea B după «ultima verificare» (coloană nouă sau `maib_checkouts.updated_at`),
  nu `created_at`. În `bilete_marcheaza_platita`: plata sosită după `departure_at` (sau după închiderea vânzării) →
  `platita_fara_bilet` + refund automat integral. Dacă maib v2 acceptă o durată a sesiunii la creare, de trimis (întrebare).

### C3 — MEDIUM — Returul din pachet anulat singur («vina noastră»/sistem) nu se finalizează niciodată

- **Unde:** `apps/admin/src/lib/bilete/refund.ts:80,132` (returSingur: refund parțial pe sesiunea turului) +
  `apps/admin/src/lib/bilete/impacare.ts:143` (C cere `checkout_id` pe rândul `anulata`).
- **Dovadă [cod + viu]:** rândurile `in_pachet` au `checkout_id = NULL` (live: 9 rânduri in_pachet, `count(checkout_id)=0`);
  turul rămâne `platita`, deci nici el nu intră în C. `finalizeazaRefund` ar găsi returul doar pornind de la sesiunea
  turului, dar nimeni nu-l cheamă pentru o sesiune al cărei tur nu e `anulata`.
- **Scenariu:** cursa de retur anulată de firmă → returul `anulata`, refund parțial cerut pe plata turului. Banca acceptă
  sau RESPINGE; comanda rămâne `anulata` cu `refund_finalizat_la = NULL` pe veci, fără «returnata», fără alerta de 24 h;
  un refund respins nu-l vede nimeni. (`bilete_comanda_activa(..., true)` o socotește activă la plafonul studentului.)
- **Fix minim:** C selectează și `anulata` + `in_pachet` + `refund_finalizat_la IS NULL`, cu sesiunea luată din tur
  (`comanda_tur_id → checkout_id`), și cheamă `verificaSiFinalizeazaRefund` pe ea; `finalizeazaRefund` deja include returul.

### C4 — MEDIUM — Rezervarea (30 min) se numără de la crearea comenzii, nu de la sesiunea băncii

- **Unde:** `bilete_locuri_ocupate` / `bilete_comanda_activa` (`created_at + 30 min`); `comenzi.ts:726` `asiguraSesiunea`
  creează sesiune nouă la o reluare fără să verifice vârsta comenzii.
- **Scenariu [cod]:** comanda creată la 10:00, banca dă 5xx → `eroare_creare`; omul reîncearcă la 10:28 cu aceeași cheie →
  sesiune nouă la 10:28 (și, cu C2, deschisă nelimitat). La 10:30 locul ales și cota se eliberează; alt client le ia; plata
  primului vine la 10:35 → `loc_schimbat` sau `platita_fara_bilet` (`cota_depasita`) fără dispecer.
- **Fix minim:** `asiguraSesiunea` refuză (comandă nouă) dacă `created_at` e mai vechi de ~25 min; sau rezervarea se
  prelungește la crearea sesiunii (`rezervat_pana_la` = momentul sesiunii + 30 min) și C2 închide sesiunea la expirare.

### C5 — MEDIUM — Rezervări neplătite blochează vânzarea (cotă Bălți, plafon global) fără cost

- **Unde:** `bilete_creeaza_comanda` (PLAFON_IP 5/10 min, PLAFON_TELEFON 3 `noua`/30 min, PLAFON_GLOBAL 50 `noua`/30 min);
  cota Bălți = 4 (`app_config.bilete_locuri_localitate` [viu]).
- **Scenariu [cod]:** o comandă neplătită de 4 locuri umple cota Bălți a unei curse 30 de minute; telefonul nu e dovedit
  (numere aleatoare valide), un IP face 5 comenzi/10 min → ~15 curse Bălți ținute permanent de un singur IP; cu ~10 IP-uri,
  50 de comenzi `noua` declanșează PLAFON_GLOBAL → nimeni nu mai poate cumpăra online, pe nicio cursă.
- **Fix minim:** cota și plafonul global numără comenzile neplătite doar cât au sesiune deschisă și cu o durată mai scurtă
  (10–15 min); plafon pe locuri ținute pe IP/zi; PLAFON_GLOBAL ca alertă (sau pe cursă), nu ca oprire totală.

### C6 — MEDIUM (latent) — Garanția de lansare nu merge din bot: funcția din bază respinge oferta

- **Unde:** `bilete_retur_oferta_noua` [viu]:
  `IF p_expira <= now() OR p_expira > c.departure_at - interval '240 minutes' THEN RAISE 'OFERTA_EXPIRARE_GRESITA'`;
  `retur-bot-reguli.ts:32` (cu garanție, `expiraMs` până la plecare + 24 h); `refund.ts:85` (pachetul refuză după plecare).
- **Scenariu:** Ion pune `bilete_garantie_100_pana` (azi gol [viu]) → clientul cere returnarea cu 2 h înainte sau după
  plecare → oferta 9/9 are expirarea după pragul de 4 h → funcția aruncă → botul răspunde «sub 4 h, fără bani», contrar
  garanției din condiții. Tur-returul e refuzat după plecare indiferent de garanție.
- **Fix minim:** `bilete_retur_oferta_noua` primește parametrul garanției (sau citește `app_config`) și acceptă
  `p_expira ≤ departure_at + 24 h` când e activă; ramura pachet din `refund.ts` respectă și ea garanția (sau Ion decide).

### C7 — MEDIUM — «Găsește biletul» dă QR-ul și codul pe telefon + un singur cuvânt din nume

- **Unde:** `apps/admin/src/lib/bilete/sms.ts:74–84` (`gasestePeEcran`, SMS neconfigurat), `sms-reguli.ts:49` (`numePotrivit`:
  fiecare cuvânt scris trebuie să fie în nume — deci doar numele de familie ajunge).
- **Scenariu [cod]:** cine știe telefonul și numele de familie (vecin, coleg, rudă) primește linkul biletului (QR) →
  urcă primul; cu codul face `/start bilet_<cod>` → dacă biletul nu era legat, îl leagă la contul lui (primul venit) →
  returnare din bot cu ultimele 4 cifre ale telefonului. Plafon 3/oră/număr, 10/oră/IP — nu protejează o țintă anume.
  Ion a ales consient telefon + nume; riscul e lanțul cu C1 și legarea «primul venit».
- **Fix minim:** cere și prenumele (toate cuvintele numelui de pe bilet) sau data cursei; linkul arătat pe ecran să nu
  permită legarea la Telegram fără confirmarea contactului (vezi C1).

### C8 — LOW — Panoul și site-ul judecă diferit «șofer legat»

- **Unde:** `public_drivers_view.bilete_online = telegram_id IS NOT NULL AND active AND NOT is_test` [viu] (site);
  `comenzi.ts:273` `stareSoferCursa` nu verifică `is_test`; site-ul cere și `driver.phone` (`actions.ts` `hasDriver`).
- **Scenariu:** șofer de test în grafic sau șofer fără telefon → site «închis», panoul ar vinde (cerere directă la API).
- **Fix:** aceeași regulă în ambele (adaugă `NOT is_test` în panou; `hasDriver` fără condiția telefonului pentru vânzare).

### C9 — LOW — `from_name`/`to_name` salvate = textul trimis de client, nu numele canonic

- **Unde:** `comenzi.ts:643–644` (`from_name: input.fromRo.trim()`), folosite apoi la plafonul TS
  (`locuriLuatePeLocalitate`) și la `perechePromo(tur.from_name, …)` în `asiguraReturPachet` (`comenzi.ts:534`).
- **Scenariu [cod]:** dacă `incarcaCurse` acceptă un alias/varianta rusă a opririi, plafonul TS nu numără comanda
  (baza o numără corect prin `loc_cheie`), iar tur-returul e refuzat «nu e pereche» deși cursa e Bălți ⇄ Chișinău.
- **Fix:** salvează `cursa.fromNameRo/toNameRo` (canonice) sau folosește-le la comparații.

### C10 — LOW — Un QR = toată comanda: locurile neocupate devin «urcat» și nu se mai returnează

- **Unde:** `apps/admin/src/app/api/bilete-sofer/scan/route.ts` (grupul urcă la prima scanare) + `bilete_anuleaza`
  (`BILET_URCAT`).
- **Scenariu:** comandă de 3 locuri, vine 1 om → toate 3 «urcat» → restituirea celorlalte 2 imposibilă (nici cu «vina
  noastră» la tur). Decizia lui Ion din 10.10, dar consecința la refund trebuie confirmată.

### C11 — LOW — Ora de iarnă 25.10: plecările de la 03:00 sunt ambigue

- **Unde:** `packages/db/src/bilete-reguli.ts` `dayOffset` (offset sondat la 12:00). Rutele 1 și 16 pleacă din nord la
  03:00 [viu]; pe 25.10 ora 03:00 există de două ori; codul alege +02:00 (a doua). Închiderea vânzării și grila se mută
  cu 1 h pe aceste curse. Acceptabil; de știut.

### C12 — LOW — Suma pachetului numără și rândurile de retur «expirata»

- **Unde:** `comenzi.ts:715` `sumaDePlata` (`noua, eroare_creare, expirata, platita, platita_fara_bilet`) și
  `bilete_marcheaza_platita` (suma tuturor rândurilor `in_pachet`, orice stare).
- **Scenariu [cod]:** dacă vreodată un tur are două rânduri de retur (unul expirat, unul nou), suma cerută băncii ar
  include ambele. Azi nu găsesc o cale care expiră returul fără tur (`expira`, `inlocuieste`, `expiraTurFaraRetur`), deci
  latent. Fix: `asiguraReturPachet` refuză (cere comandă nouă) dacă există deja un retur `in_pachet` în orice stare.

### C13 — LOW — Turul urcat blochează returul din pachet pentru totdeauna

- **Unde:** `bilete_anuleaza` (`BILET_URCAT` pe tur înainte de ramura returului; `PACHET_DOAR_IMPREUNA`).
- **Scenariu:** omul a mers la Chișinău (tur scanat), anunță cu 3 zile înainte că nu se întoarce → returul din pachet nu
  se poate returna nici după grilă, nici din bot; doar «vina noastră». Conform «tur-returul se returnează întreg până la
  plecarea turului» (Ion 10.10), dar merită confirmat că și după tur nu primește nimic pe retur.

---

## Verificat și corect

- **Fixurile de azi (553 + da76cb06):**
  - H1 returul strain: returul din pachet cere Bălți ⇄ Chișinău pe textul din formular (`comenzi.ts:547`) ȘI pe numele
    canonice (`promoPachet`, `comenzi.ts:704`), sens opus turului, aceeași persoană (telefon în bază), alt `crm_route_id`
    (decizia «niciodată pe aceeași cursă»; UI-ul filtrează în `curseReturPotrivite`). Corect.
  - H2 refund pachet: marcajul `PACHET_REFUND_OCUPAT` + excluderea în `finalizeazaRefund` — corect pentru tur după retur
    singur; golul rămas e C3 (finalizarea returului singur).
  - M3 expirarea pachetului: A sare peste `in_pachet`; `expira()` expiră turul + returul; orfanele cu tur expirat se
    expiră. Corect.
  - M4 «Reia plata»: sesiunea `failed` local se reverifică la bancă înainte de expirare; aceeași alegere → aceeași pagină
    a băncii. Corect ca logică; vezi C2 pentru sesiunile care nu se închid.
  - Plafonul IP (fără `in_pachet`, toate stările, 10 min) și cel global (`noua`, fără `in_pachet`) — corecte; risc rămas C5.
- **Cota Bălți:** `cotaOnline` = 7 vineri spre Bălți 11:00–11:59, 2 vineri spre Bălți / duminică spre Chișinău ≥ 12:00,
  altfel 4; aceeași funcție la prevalidare TS și la `cota_online` scris în bază; baza numără locuri sub lacătul global,
  revalidează la plată (`cota_depasita` → `platita_fara_bilet`). Ora/ziua prin `Intl` (DST corect).
- **Prețul:** se recalculează pe server, suma băncii = suma comenzii (+ retur), `bilete_marcheaza_platita` refuză sumă
  diferită (`suma_nepotrivita`) și plata ne-Executed / cu refund; `aplicaReducere` = CHECK-ul din bază; reducerile nu se
  cumulează (pachet refuză turul cu student; DB refuză orice `v_red` dublu); telefonul șoferului fără promo (format
  `373XXXXXXXX` identic în `drivers` și `bilete_comenzi` [viu]).
- **Studentul:** verificare acceptată < 30 min, același telefon + cheia numelui, 1 loc, ≤ 4 locuri/7 zile pe carnet,
  jeton folosit doar de o comandă activă; revalidat la plată.
- **Locurile:** alese doar spre nord, distincte 1..20, verificate sub lacătul cursei; la emitere locul luat între timp
  dă alt loc + alertă `loc_schimbat`; fără loc → `fara_loc`.
- **Idempotența:** cheia + conținutul (cursă, locuri, telefon) + intrarea promoției; o singură sesiune pe comandă
  (revendicare 2 min, căutare după `orderId` înainte de a crea alta); callback orfan legat doar cu suma exactă.
- **Scanarea:** cursa trebuie să fie a șoferului (403), prima scanare câștigă (`UPDATE … WHERE status='valid'`), reluările
  offline nu dublează jurnalul.
- **Anularea:** atomică sub lacătul perechii, refuză biletul urcat, suma fixată în tranzacție; refuzul băncii →
  `bilete_reactiveaza` cu revalidare.
- **Vânzarea fără grafic / cu grafic:** `fara_grafic` se vinde, `lipsa`/`nelegat` nu (panoul și site-ul pe ziua cursei);
  `bilete_online_de_la=2026-10-12`, Bălți de la `2026-10-13` [viu], închiderea tur/retur 120 min [viu].
- **RO/RU:** erorile panoului sunt în română, dar site-ul le traduce după `cod` (`mesajEroareComanda`, `textTurRetur`).

---

## Întrebări pentru Codex

1. **maib Checkout v2:** se poate da o durată de viață sesiunii la `POST /v2/checkouts` (ex. `expiresAt`/`lifetime`)? Dacă
   nu, `POST /v2/checkouts/{id}/cancel` pe o sesiune `Initialized` e sigur (nu poate pierde o plată în curs —
   `PaymentMethodSelected`)? Care e ordinea corectă: cancel → verificare → expirare?
2. **Refund parțial multiplu pe aceeași plată:** maib permite al doilea refund parțial (`partialRefundAvailable`,
   `refundableAmount`) după primul? Dacă da, alerta manuală `PACHET_REFUND_OCUPAT` (fără dispecer) ar trebui înlocuită cu
   al doilea refund automat; dacă nu, ce face clientul fără dispecer?
3. **C1:** e suficient `request_contact` din Telegram ca dovadă a telefonului, sau vezi altă cale fără SMS? Și: ar trebui
   ca `leagaComanda` (/start cu cod) să lege doar comenzile plătite?
4. **Cota de vineri:** Ion a spus «până la orele 12 putem vinde câte dorim» și apoi «doar cursele între 11 și 12 să aibă
   limită de 7». Codul dă 4 înainte de 11, 7 între 11–12, 2 după 12. Citești la fel, sau înainte de 11 ar trebui să fie
   fără limită (sau 7)?
5. **C10/C13:** consideri bug (bani reținuți pe locuri neocupate / pe returul nefolosit) sau decizie de produs care
   trebuie doar scrisă în condiții?
6. **Plata după plecare (C2.2):** e mai corect `platita_fara_bilet` + refund automat integral, sau emiterea biletelor
   (cum e acum) e acceptabilă pentru că omul a plătit conștient?
