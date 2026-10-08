# Echipajul pe bilet: numărul mașinii și șoferul, final, trimis în chat clientului

## De ce
Ion (08.10.2026): «Pe bilet cum apare număr mașină și șofer final — să se trimită în chat actualizat la client
TRANSLUX». La întrebări: «final» = **la bifa dispecerului** (graficul zilei trimis în grupă); clientul vede **numărul +
prenumele + telefonul** șoferului. Azi biletul (pagină, e-mail, imaginea din bot) nu arată echipajul deloc; doar
mini app-ul clientului îl arată, și doar pentru biletul de azi în fereastra hărții.

## Ce facem
**Ales:** totul în panou (central-hub), fără deploy de bot.
1. **Biletul** (pagina translux.md/bilet și mini app-ul clientului — aceeași asamblare, bilet-asamblare.ts) arată
   «🚌 651 AKD · șofer Ion · +373 69 123 456» când ziua cursei are bifa dispecerului (`grafic_group_posts.ziua`);
   înainte — «Mașina și șoferul apar după ce dispecerul face graficul zilei».
2. **Mesaj în chat** (botul TRANSLUX, trimis din panou cu același token, ca alertAdmins): când ziua are bifă și cursa
   are șofer + mașină, clientul legat de Telegram primește «🚌 Autobuzul tău …». Dacă după aceea dispecerul schimbă mașina
   sau șoferul cursei, primește «🔄 S-a schimbat autobuzul …». Job nou G în împăcarea biletelor (cron VPS la 10 min).
3. **Proba lui Iura** (comenzi `proba_fizica`): echipajul = șoferul de probă, «PROBĂ · șofer Iurie», fără telefon, fără
   bifă de așteptat — ca Iura să vadă rândul și mesajul în chat. Comenzile `test_admin` (/plati) — fără echipaj.

**Respinse:**
1. Job nou în bot (Railway) — botul se livrează de pe `deploy-bot`, unde așteaptă acum lucrările nelivrate ale altor
   sesiuni (Piese, document casier); panoul se livrează la push și trimite deja în Telegram.
2. Editarea mesajului cu biletul (imaginea) — botul nu editează mesajele biletului; un mesaj nou se vede ca notificare.

## 🔬 Verificat pe viu
| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Bifa dispecerului există pe zi | SELECT grafic_group_posts | `ziua` PK; 09.10 bifat 08.10 11:05; 08.10 bifat 08:13 (send_count 3) | «final» = rând pentru `trip_date` |
| Echipajul cursei | packages/db/src/assignments.ts:70-118 | tur = buildTurAssignmentMap; retur = buildReturAssignmentMap (override retur_route_id, driver_id_retur ?? driver_id, vehicle_id_retur ?? vehicle_id) | aceeași regulă ca bileteClienti.ts:133 și trips-search.ts:441 |
| Formatul public | site-assistant/cards.ts:19-30 (`fmtPlate`, `crewOf`), driver-name.ts:9 (`driverFirstName`) | prenumele = al 2-lea cuvânt plin, altfel null; placa «651 AKD» | refolosite |
| Telefonul șoferului e deja public | bus-location.ts:147-153; TelegramClientApp.tsx:375 «Sună șoferul»; bileteClienti.ts:124 | da | precedent; Ion a ales să-l arate |
| Căutarea publică poate lua altă zi | trips-search.ts:215-247 `resolveAssignmentDate` | cade pe ziua anterioară | AICI DOAR `assignment_date = trip_date` |
| Botul nu editează mesajele biletului | grep editMessage* | doar smm.ts, bot.ts:323 | mesaj nou |
| Cronul împăcării | impacare.ts:63-215 (COTE, buget 20 s, joburile A–F) | */10 pe VPS | job G cu cotă proprie |
| Comenzile test | sofer.ts:98; bileteClienti.ts:126 | fără șofer real | echipaj real doar pe `test=false` |

## Pași
1. **Migr. 533** pe `bilete_comenzi`: `echipaj_trimis text` (cheia ultimului mesaj: `vehicle_id|driver_id|cu_tel`, sau
   `anulat`/`fara`), `echipaj_trimis_la timestamptz`, `echipaj_revendicat_la timestamptz` (termen de revendicare 2 min),
   `echipaj_mesaje smallint default 0` (câte «🔄» au plecat), `echipaj_refuzat_la timestamptz` (clientul a blocat botul).
2. **`lib/bilete/echipaj.ts`** — `echipajeCurse(db, zile)`: într-un `Promise.all` citește pentru zilele cerute
   `grafic_group_posts`, TOATE rândurile `daily_assignments` ale zilei (ca `atribuirileZilelor`, sofer.ts:35), și
   `route_cancellations (crm_route_id, ziua)`; apoi `drivers`/`vehicles` pentru id-urile găsite. Pe cursă:
   - fără bifă pe zi → `{ stare: 'astept' }`; cursă anulată (rută+zi în `route_cancellations`) → `{ stare: 'anulat' }`;
   - rândul care dă echipajul (tur: rândul rutei; retur: override-ul `retur_route_id` sau rândul rutei) are
     `auto_copied=true` → `astept` (H1: copia de la 20:00 nu e graficul dispecerului);
   - altfel `{ stare: 'gata', plate: fmtPlate, prenume: driverFirstName, telefon (+373) }`; fără placă sau șofer → `astept`.
   - comenzile `test` NU ajung la această funcție: `proba_fizica` primește echipajul fix «PROBĂ · Iurie», `test_admin` null
     (gardă înaintea oricărei citiri, test unitar că nu se citește `daily_assignments`).
   Pure + testate: `cheieEchipaj`, `deTrimis`, `mesajEchipaj(lang, comanda, echipaj, fel)` cu `escapeHtml` pe fiecare câmp
   (nume, placă, localități), feluri `prima` / `schimbare` / `anulat_sau_retras`.
3. **Telefonul șoferului** (revizia de securitate #3, #4): pe pagină și în mesaj DOAR de la plecare − 3 h până la plecare
   + 3 h; în mesaj DOAR dacă `telegram_verificat_pentru = telegram_id` (cont legat din mini app sau verificat cu cele 4
   cifre, retur-bot.ts:69). În rest — placa și prenumele. Al doilea mesaj «📞 Telefonul șoferului» pleacă la intrarea în
   fereastră (cheia include `cu_tel`).
4. **Biletul**: `bilet-asamblare`/`public.ts`/`client-repo` primesc `echipaj` (`astept` / `gata` / `anulat`; null pe
   `test_admin`); citirile în același `Promise.all` cu cele existente (client-repo.ts:61-63), doar pentru comenzi neplecate;
   web `BiletCard` + `bilete-api.ts`: rândul «🚌 651 AKD · șofer Ion [· +373 …]», «Mașina și șoferul apar după ce
   dispecerul face graficul zilei» sau «Cursa a fost anulată — sună la dispecerat +373 60 401 010».
5. **Job G în împăcare, ULTIMUL** (M1, C2, C3):
   **Mini app-ul clientului** (C4): `TelegramClientApp.tsx` / `BiletMini` arată rândul din `comanda.echipaj` pentru
   orice bilet (și cel de mâine, și proba), iar butonul «Sună șoferul» ia telefonul din `comanda.echipaj` (fereastra de
   la pasul 3); cursa din hartă rămâne doar pentru poziția autobuzului.
   - **Parcurgerea e separată de trimiteri** (C2): o singură citire a TUTUROR comenzilor eligibile — `platita`,
     `telegram_id` nenul, `departure_at ∈ (acum, acum + 48 h)` (L1), `echipaj_refuzat_la` null, (`test=false` sau
     `proba_fizica`), ordonate după `departure_at, id`, citite PAGINAT cu `.range()` câte 1.000 (plafonul PostgREST) până
     la ultima pagină (C5) — și UN `echipajeCurse` pentru zilele lor; `deTrimis` se calculează în memorie pentru toate. Abia
     lista celor de trimis se taie la **15 trimiteri pe tick**, cea mai apropiată plecare întâi.
   - Ce se trimite: cheia nouă `≠ echipaj_trimis` și (`gata`, sau `anulat`/`astept` după ce s-a trimis deja un echipaj —
     M2), `echipaj_mesaje < 3` pentru «schimbare» (#5), nu între 22:00–07:00 pentru cursele de mâine.
   - Revendicare atomică: `UPDATE … SET echipaj_revendicat_la = acum WHERE id AND echipaj_trimis IS NOT DISTINCT FROM vechi
     AND (echipaj_revendicat_la IS NULL OR echipaj_revendicat_la < acum − 2 min)`.
   - **Trimiterile secvențial, cu bugetul verificat înaintea FIECĂREIA** (C3): se trimite doar dacă mai rămân ≥ 6 s din
     bugetul de 20 s (rezervă pentru salvare); helperul are timeout 4 s; restul rămâne pe tick-ul următor.
   - **Helper dedicat `trimiteLaClient`** (C1) cu rezultat clasificat, nu boolean:
     - `trimis` (200) → `echipaj_trimis = nou`, `echipaj_trimis_la`, `echipaj_mesaje += 1` (la «schimbare»);
     - `blocat` — DOAR 403 «bot was blocked by the user» / «user is deactivated» și 400 «chat not found» →
       `echipaj_refuzat_la = acum` (fără reîncercări);
     - `temporar` — 429 (cu `retry_after`), 5xx, rețea, token lipsă → nimic schimbat, reîncercare la tick-ul următor;
     - `incert` — timeout după trimiterea cererii → considerat trimis (cel mult un mesaj dublat niciodată; poate lipsi unul).
     În toate cazurile `echipaj_revendicat_la = null`, condiționat de revendicarea proprie. Teste separate pe fiecare clasă.
   - `dry` nu scrie și nu trimite; raportul are `echipaj: { verificate, de_trimis, trimise, blocate, temporare }`.
6. **Livrare**: migrația (dry-run, apoi aplicare) → push (central-hub) → deploy translux-web.

## Fișiere
- `packages/db/migrations/533_bilete_echipaj.sql`; `packages/db/src/types.ts`
- `apps/admin/src/lib/bilete/{echipaj.ts,echipaj.test.ts,bilet-asamblare.ts,public.ts,client-repo.ts,impacare.ts}`
- `apps/web/src/components/bilet/BiletCard.tsx`, `apps/web/src/lib/bilete-api.ts`, `apps/web/src/components/telegram/TelegramClientApp.tsx`

## Riscuri
- **Spam la client** dacă dispecerul schimbă des: mesaj doar la schimbarea cheii (mașină sau șofer) a cursei LUI, doar
  până la plecare.
- **Telefon lipsă/greșit al șoferului**: rândul și mesajul fără telefon.
- **Ziua bifată, cursa fără șofer**: fără mesaj; jobul D alertează deja «cursă fără șofer la < 3 h».
- **Telegram refuză** (clientul a blocat botul): revenire la cheia veche → reîncercare la fiecare tick, cotă 30, se
  oprește la plecare.

## Verificare
- unit: echipaj (tur/retur, override, fără bifă → null, fără placă/șofer → null, probă, cheie, mesaje RO/RU,
  prima/schimbare); jobul G pe un fals de bază (revendicare, revenire la eșec).
- tsc + vitest admin/web; pre-push.
- prod: `ruleazaImpacarea({dry:true})` pe datele de azi (câte mesaje ar pleca); proba lui Iura: biletul de probă arată
  «PROBĂ · șofer Iurie» și în 10 min vine mesajul «🚌 Autobuzul tău» în chat.

## Review: security-auditor (runda 1)
Scor 4.7 · Blocante 1 — #1 revendicarea/revenirea (403 la nesfârșit, cota blocată, dubluri la timeout, revenire peste
schimbare); #2 escapeHtml; #3 fereastra telefonului; #4 legarea de primul cont; #5 spam la schimbări; #6 proba scurge
echipajul real. **Triaj:** toate acceptate → pașii 2, 3, 5. Deschise critical/high: 0.

## Review: business-logic-auditor (runda 1)
Scor 2.7 · Blocante 2 — H1 rândurile `auto_copied`; H2 cursele anulate (`route_cancellations`, verificat: crm_route_id +
ziua); M1 bugetul de 20 s; M2 retragerea echipajului; L1 cursele peste miezul nopții; L2 costul listei din mini app.
**Triaj:** toate acceptate → pașii 2, 4, 5. Mapările tur/retur confirmate identice cu mini app-ul șoferului și botul.
Deschise critical/high: 0.

## Critic extern - runda 1
Codex: scor 5.5 · fail · 1 high.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | orice 4xx (și 429) devenea «clientul a blocat botul» | acceptat | verificat telegram-notify.ts:190-208 → helper `trimiteLaClient` cu clasele trimis/blocat/temporar/incert (pasul 5) |
| C2 | medium | limita de 15 tăia parcurgerea, nu trimiterile | acceptat | parcurgere completă în memorie, limită doar pe trimiteri (pasul 5) |
| C3 | low | bugetul nu limita lotul | acceptat | trimiteri secvențiale, buget verificat înaintea fiecăreia, timeout 4 s (pasul 5) |

## Critic extern - runda 2
Codex: scor 7.0 · fail · 1 high. C1–C3 nu sunt redeschise.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C4 | high | mini app-ul afișează echipajul din `BiletMini`, din cursa hărții, nu din comandă | acceptat | verificat de critic TelegramClientApp.tsx:270,281,345,375 → pasul 4 include BiletMini cu `comanda.echipaj` |
| C5 | low | plafonul de 1.000 greșit socotit | acceptat | paginare `.range()` până la capăt (pasul 5) |

## Gate
Deschise critical/high: Claude 0 (H1, H2, #1 acceptate și corectate), Codex 0 (C1, C4 acceptate și corectate).
Scoruri: Claude min 2.7 (runda 1, înainte de corecturi); Codex 5.5 → 7.0. Două runde din trei.
