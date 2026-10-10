# Tur-retur pe site: cumpărare simplă și intuitivă

## De ce
Ion, 10.10.2026 (două capturi de pe telefon, pasul 3 al tur-returului, RU):
- «nu este clar de unde încotro în primul slide» — în pasul 3 primul bilet (turul) n-are etichetă: se vede doar
  «07:30 → 09:35», fără «Tur · Chișinău → Bălți · marți 13 octombrie»; returul are «Обратно · Bălți → Chișinău», dar
  fără zi (ziua apare abia jos, «15.10.2026, 06:30»).
- «numărul bilete alegere când data tur și retur» — câte bilete se alege abia în pasul 3, după ce turul și returul sunt
  deja alese; trebuie ales odată cu zilele, în bara de căutare.
- «gândește-te tot acest proces să fie ușor pentru client și intuitiv, acum prea complicat».
- «lansează 3 runde Claude Codex».
Antetul ferestrei spune «Онлайн-билет · Кишинёв → Бельцы · вторник, 13 октября» și în pasul 3 — omul crede că
cumpără doar turul; rezumatul de jos e un rând verde mic «Туда 150 + обратно 120 лей (15.10.2026, 06:30) — одна оплата».

## Ce facem
**Ales: un singur traseu în 3 pași, fiecare cu UN singur lucru de ales, și un rezumat «biletul tău» care crește pe drum.**

0. **Bara de căutare** (doar pe Bălți ⇄ Chișinău, cu «Tur-retur»): pe lângă «Plecare» / «Întoarcere», un rând
   **«Pasageri: − 1 +»** (1–4). Numărul trece în toți pașii; în pasul 3 nu se mai alege (se vede «1 pasager · schimbă»
   care întoarce la bara de căutare). «Doar tur» rămâne ca acum (numărul se alege în formular).
1. **Pasul 1 · Alege cursa TUR** — banda de sus, mare: «1 din 3 · TUR · Chișinău → Bălți · marți, 13 octombrie ·
   1 pasager». Lista curselor (cum e). Antetul ferestrei: «Tur-retur · Chișinău ⇄ Bălți».
2. **Pasul 2 · Alege cursa RETUR** — banda: «2 din 3 · RETUR · Bălți → Chișinău · joi, 15 octombrie · −20%». Deasupra
   listei, un rând compact cu turul ales: «✓ Tur: mar 13 oct, 07:30 → 09:35 · 150 lei · schimbă».
3. **Pasul 3 · Locul, datele, plata** — totul pe o coloană, în ordinea în care omul gândește:
   - **Card «TUR»** cu eticheta mare «TUR · Chișinău → Bălți · marți, 13 octombrie», ora, mașina, prețul; dacă pleacă
     din Chișinău, **harta locurilor imediat sub el** («Alege locul la tur: 1 din 1»).
   - **Card «RETUR»** la fel: «RETUR · Bălți → Chișinău · joi, 15 octombrie», prețul tăiat 150 → 120; harta sub el
     dacă pleacă din Chișinău.
   - Numele, prenumele, telefonul, e-mailul (ca acum), regula de anulare într-o frază, acordul.
   - **Rezumatul plății** lizibil: «Tur 150 lei + Retur 120 lei (−20%) = **270 lei** · 1 pasager», butonul
     «Plătește 270 lei cu cardul».
   - Fără panoul «Reduceri» (studentul nu se cumulează cu tur-returul — Ion 10.10).
4. **Pe telefon**: banda pasului rămâne lipită sus (sticky), butonul de plată lipit jos (cum e acum); «←» întoarce
   exact un pas, fără să piardă alegerile.

**Respinse:**
1. *Totul pe o singură pagină lungă (tur, retur, locuri, date)* — pe telefonul de 390 px două liste de câte 10–14
   curse + două hărți = 4–5 ecrane de derulare; omul nu știe unde e. Pașii dau un singur lucru pe ecran.
2. *Turul cumpărat întâi, returul adăugat pe pagina biletului* (varianta din 547) — Ion a cerut explicit «totul într-o
   pagină / o singură plată» (10.10); doi pași de plată = două introduceri ale cardului.
3. *Numărul de bilete în pasul 3, cu hărțile recalculate* — exact ce a criticat Ion: alege ziua și cursele, apoi
   descoperă că trebuie să spună câți sunt; schimbarea numărului după alegerea locurilor resetează hărțile.

## 🔬 Verificat pe viu
| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Numărul de bilete se alege acum doar în formular | `apps/web/src/components/ui/buy-ticket-form.tsx:285` (butoanele − / +, `seats ≤ 4`) | da, 1–4, în pasul 3 | mutăm alegerea în bara de căutare pentru tur-retur |
| Returul din pachet trebuie să aibă aceleași locuri ca turul | `packages/db/migrations/548_bilete_tur_retur_o_plata.sql:79` (`v_seats <> t.seats` → RETUR_TUR_NEVALID) | da, în bază | un singur număr pentru ambele, ales o dată |
| Antetul ferestrei arată doar sensul turului | `apps/web/src/components/ui/route-results.tsx` (antet `ales ? tx.bilet` + `{from} → {to} · dataCursei`) + capturile lui Ion | da | antet nou «Tur-retur · A ⇄ B» |
| Cardul turului din pasul 3 n-are etichetă | `buy-ticket-form.tsx` (stânga: `<BiletCursa trip={trip} … cotor="ales">` fără titlu; returul are «Retur · …») + captura #55 | da | etichetă «TUR · … · zi» deasupra |
| Ziua returului nu apare pe cardul lui | captura #56 (doar «15.10.2026, 06:30» în rândul verde) | da | eticheta «RETUR · … · zi» |
| Harta locurilor există doar pe plecarea din Chișinău | `buy-ticket-form.tsx` (`alegeLocuri = trip.going_north`, `hartaRetur = returFix.going_north`) | da | hărțile stau sub cardul cursei din Chișinău |
| Căutarea are limită anti-scraper | `apps/web/src/lib/search-rate-limit.ts:13-14` (10 căutări / 10 min) | tur-retur = 2 căutări (tur + retur); schimbarea zilei = încă una | nu se caută din nou la «←»; lista returului se păstrează în stare |
| Returul se vinde doar cu șofer legat (grafic sau cel mai nou grafic ≤ 7 zile) | `apps/web/src/app/(public)/actions.ts:481-489`, `apps/admin/src/lib/bilete/comenzi.ts` `stareSoferCursa` | da | pasul 2 gol → mesaj clar «alege altă zi» + buton înapoi la bara de căutare |
| Plata: o sesiune tur + retur, anulare doar împreună | migr. 548 aplicată 10.10 (db-migrate «aplicată pe translux»), probe în blocul DO | da | nu se schimbă nimic la plată/bază; planul e doar UI |

## Pași
1. **Bara de căutare** (`home-page.tsx`): la «Tur-retur», rândul «Pasageri − n +» (1–4) sub zile; `pasageri` se
   trimite la `RouteResults` (prop nou `pasageri`). La «Doar tur» rândul nu apare. Rezultat: captură la 390 px.
2. **Antet și banda pașilor** (`route-results.tsx`): în tur-retur antetul = «Tur-retur · {from} ⇄ {to}»; banda
   pasului afișează sensul, ziua lungă și «n pasageri»; banda sticky. Pasul 2 are rândul «✓ Tur: … · schimbă».
3. **Pasul 3** (`buy-ticket-form.tsx`): când `returFix` e dat → modul tur-retur:
   - `seats` = `pasageri` (fix, fără − / +); textul «n pasageri · schimbă» întoarce la căutare;
   - stânga devine o coloană: eticheta «TUR · A → B · zi» + card + harta (dacă din Chișinău), apoi «RETUR · B → A · zi»
     + card cu preț tăiat + harta (dacă din Chișinău);
   - fără `PromoReduceri`;
   - rezumatul: «Tur X + Retur Y (−20%) = Z lei · n pasageri», butonul «Plătește Z lei».
4. **Texte RO/RU** pentru toate etichetele noi; `aria-live` pe contorul locurilor.
5. **Teste**: o funcție pură `rezumatTurRetur({pretTur, pretRetur, pasageri})` în `apps/web/src/lib/bilete-reguli.ts`
   (+ test); restul — verificare vizuală.

## Fișiere
- `apps/web/src/components/home-page.tsx` — rândul «Pasageri», prop spre rezultate
- `apps/web/src/components/ui/route-results.tsx` — antet, bandă sticky, rândul turului ales în pasul 2, `pasageri`
- `apps/web/src/components/ui/buy-ticket-form.tsx` — modul tur-retur în pasul 3 (etichete, hărți sub carduri, fără
  reduceri, număr fix, rezumat)
- `apps/web/src/lib/bilete-reguli.ts` (+ test) — `rezumatTurRetur`

## Riscuri
- **Omul schimbă numărul de pasageri după ce a ales cursele** → întoarcerea la bara de căutare golește alegerile
  (cursele pot să nu mai aibă locuri); banda o spune.
- **Cota 4/2 la Bălți**: cu 3–4 pasageri, multe curse nu mai au locuri online → comanda pică la creare
  («mai sunt doar N locuri»). Rezervă: lista arată deja cursa; mesajul de eroare e clar; nu blocăm alegerea în listă
  (cota se numără în bază, sub lacăt).
- **Ecranul îngust**: două hărți în pasul 3 → derulare lungă; hărțile stau imediat sub cardul lor, deci contextul nu se
  pierde; butonul de plată rămâne lipit jos.
- **Limita de căutări**: 2 + schimbările de zi; păstrăm rezultatele în stare la «←».

## Verificare
- `tsc` + `vitest` pe web; testul `rezumatTurRetur`.
- Captură (sau verificare de mână de Ion pe telefon) a celor 3 pași la 390 px, RO și RU.
- Proba reală tur-retur 270 lei (deja în plan, după graficul din 13.10).

## Review: senior-backend-engineer (runda 1)
- **E1 · high · −2.0** — Limita de căutări. `route-results.tsx:35-45`: efectul depinde de `turAles`, golește `curseRetur` la «←» (`setCumpara(null)`) și caută din nou la fiecare tur ales. Planul promite „nu se caută din nou la «←»" fără mecanism. Scenariu: căutare (1) + omul încearcă 4 tururi cu «←» (4) + schimbă ziua de 3 ori (3 + 3 retururi) = 11 → a 11-a e blocată (`search-rate-limit.ts:13`, `actions.ts:251`) și întoarce `[]`, adică ecranul arată „nu sunt curse de retur, alege altă zi" și omul insistă, deci blocarea ține. Fix: retururile brute se țin într-un cache cheiat pe `(toRo, fromRo, dataRetur)`, iar filtrul pe tur e o funcție pură separată (testată); blocarea trebuie deosebită de lista goală (un semn de la acțiune, alt mesaj).
- **E2 · medium · −1.0** — „«←» fără să piardă alegerile" nu ține: `camp`, `alese`, `aleseRetur` și `key` trăiesc în `BuyTicketForm` (`buy-ticket-form.tsx:100-118`) și se pierd la demontare. «schimbă pasagerii» = `onClose`, adică se închide fereastra și urmează o căutare nouă. Fix: scrieți explicit ce se păstrează. `seats` se derivă din prop-ul `pasageri` în modul tur-retur (fără `useState` dublat, fără `schimbaSeats`).
- **E3 · medium · −1.0** — `rezumatTurRetur` trebuie să folosească `aplicaReducere` din `@translux/db` (`bilete-promo.ts:22`, aceeași regulă ca în 548) și să trateze `null`. Testul compară suma cu cea pe care o așteaptă serverul, nu cu 20% recalculat.
- **E4 · medium · −1.0** — Lipsesc regresiile din Verificare: «Doar tur» (− / + rămâne, `PromoReduceri` rămâne) și mini app-ul `CautaBiletNou.tsx:121` (nu dă `dataRetur`/`pasageri`, deci implicitul trebuie să fie modul vechi).
- **E5 · low · −0.3** — Banda e deja în afara containerului derulat (`route-results.tsx:174` față de `:184`), deci nu e nevoie de `sticky`. Trebuie verificat doar înălțimea la `80vh` cu tastatura deschisă în webview.

Scor: 4.7 · Blocante (critical/high): 1

## Review: ux-mobile (runda 1)
Cei 3 pași sunt corecți (un lucru pe ecran); problemele sunt la margini.

- **U1 · high (−2.0)** — Fereastra nu încape pe ecran. Modalul fix e centrat (`route-results.tsx:119`), lista are `max-height: 80vh` (`:126`), iar deasupra stau antetul și banda, care se rupe pe 2–3 rânduri. **Scenariu:** pe iPhone SE (667 px), sau în Safari unde `vh` > ecranul vizibil, 77 + 90 + 534 px > 667 px; modalul e tăiat, iar «←» și «×» ies din ecran. **Fix:** coloană flex cu `max-height: 100dvh`, lista cu `flex: 1`, banda pe un rând (ziua scurtă «mar 13 oct»).
- **U2 · high (−2.0)** — Plata e gri fără motiv: e blocată cât `alese.length !== seats` (`buy-ticket-form.tsx:345`), iar contorul stă doar lângă harta de sus. **Scenariu:** 2 pasageri din Chișinău, omul alege un singur loc și completează datele; «Plătește 540 lei» rămâne gri, omul pleacă. **Fix:** sub buton «Alege încă 1 loc la tur ↑», cu derulare la hartă.
- **U3 · medium (−1.0)** — «schimbă» pasagerii trimite înapoi la căutare: totul se pierde, plus 2 căutări din limita de 10/10 min. Hărțile NU se resetează, `schimbaSeats` (`:148`) păstrează locurile. **Fix:** − n + chiar în pasul 3.
- **U4 · medium (−1.0)** — Returul se caută din nou la fiecare tur ales (`route-results.tsx:35-39`). **Fix:** o căutare pe `dataRetur`, păstrată și filtrată în client; de scris în Pași §2.
- **U5 · medium (−1.0)** — «Renunță» (`buy-ticket-form.tsx:348`, `route-results.tsx:202`) sare la pasul 1; «←» demontează formularul, numele și telefonul se pierd (`:106`). **Fix:** «Renunță» = un pas înapoi; `camp` mutat în `RouteResults`.
- **U6 · low (−0.5)** — Ziua de retur goală n-are buton. **Fix:** «Alege altă zi de întoarcere», deschide calendarul cu turul păstrat.
- **U7 · low (−0.3)** — Pe Bălți ⇄ Chișinău un singur sens e `going_north`, deci riscul «două hărți» nu există. Cu n > 1, rezumatul se scrie «2 × 150 + 2 × 120 = 540 lei».
- **U8 · low (−0.5)** — RU: pluralele «1 пассажир / 2 пассажира / 5 пассажиров» și «ТУДА / ОБРАТНО», nu «TUR».

Scor: 1.7 · Blocante (critical/high): 2

## Review: business-logic-auditor (runda 1)
Verificat OK: returul primește `seats: tur.seats` pe server (`apps/admin/src/lib/bilete/comenzi.ts:417`); închiderea ferestrei demontează `RouteResults` (`home-page.tsx:599`), deci „schimbă" nu lasă locuri vechi; scoaterea `PromoReduceri` e sigură (cumulul e refuzat oricum, `comenzi.ts:411`).

- **B1 · high** — Cota 4/2 + cheile noi blochează clientul. Scenariu: 3 pasageri, turul din Bălți (cota 4) trece, returul pică pe `COTA_PLINA` după ce rândul turului e deja inserat (`comenzi.ts:386-387`). Rândul `noua` ține 3 locuri din cotă timp de 30 min (`546:124,131-134`). Omul alege alt retur, iar `alegereRetur` (sau remontarea la „←") generează o cheie nouă pentru tur (`buy-ticket-form.tsx:185-188`). Rândul nou cere 3+3 > 4, deci turul lui pică: „mai sunt doar 1 locuri". După 3 încercări intră și `PLAFON_TELEFON` (`548:52`). **Fix:** cheia turului se ține în `RouteResults`, legată de tur+pasageri, și se schimbă doar cea a returului. Serverul acceptă un retur nou pe un tur fără sesiune (`comenzi.ts:399-408`). Mesajul de eroare spune ce cursă a picat (tur sau retur). Pasul 2 ascunde sau marchează cursele cu cota < pasageri.
- **B2 · medium** — Reducerea de 20% e scrisă de mână în client (`buy-ticket-form.tsx:160`, `route-results.tsx:191`). Serverul o ia din `bilete_promo_pct` (`promo-server.ts:38`). Dacă procentul se schimbă în config, suma afișată ≠ suma încasată. **Fix:** `rezumatTurRetur` primește `pct` din config (prin `pretBilet`/căutare). Testul acoperă și un pct ≠ 20.
- **B3 · low** — `rezumatTurRetur` trebuie să calculeze `aplicaReducere(pret, pct) × n` pe loc, ca `price_per_seat × seats` de pe server, nu 0,8 × total. Când `aplicaReducere` dă `null`, returul dispare din formular în tăcere (`buy-ticket-form.tsx:161`) și se plătește doar turul. Atunci butonul se blochează.
- **B4 · low** — În modul tur-retur, `seats` se derivă din prop, nu se copiază în `useState(pasageri)`. Altfel efectele hărților (`:136,179`) rămân pe un număr vechi.

Scor: 6.0 · Blocante (critical/high): 1

## Critic extern - runda 1
Codex: scor 10.0 · verdict **pass** · 0 observații (a citit revizorii Claude ca deja tratați).

## Triaj runda 1 — observațiile Claude (toate acceptate, planul corectat mai jos în «Pași v2»)
| id | sev. | esență | decizie | motiv / corectura |
|---|---|---|---|---|
| U1 | high | fereastra iese din ecran pe telefon mic | acceptat | `route-results.tsx:119-126`: fereastra devine coloană `max-height: 100dvh` pe ≤ 768 px, antet + bandă pe un rând (text scurt), doar lista derulează |
| U2 | high | butonul de plată gri fără motiv | acceptat | `buy-ticket-form.tsx:345`: sub buton textul «Alege încă N loc(uri) la tur/retur ↑» care derulează la harta respectivă |
| U3 | med | «schimbă pasagerii» pierde tot | acceptat | − / + rămân în pasul 3 și în tur-retur; schimbarea reface doar alegerea locurilor (`potrivesteAlese`), cursele rămân |
| U4 / E1 | high | căutare de retur la fiecare tur + limita 10/10 min | acceptat | o singură căutare pe (direcție, zi retur), păstrată în `RouteResults`; potrivirea cu turul = funcție pură `curseReturPotrivite(tur, lista)` cu test; căutarea refuzată de limită (`search-rate-limit.ts`) are alt mesaj decât «nu sunt curse» |
| U5 / E2 | med | «←»/«Renunță» pierd datele omului | acceptat | numele, telefonul, e-mailul trec în starea ferestrei (`RouteResults`), formularul le primește; «Renunță» = un pas înapoi |
| U6 | med | ziua de retur fără curse — fără ieșire | acceptat | butonul «Alege altă zi de întoarcere» (calendarul «Mai târziu» în fereastră), turul ales rămâne |
| U7 | low | o singură hartă pe pereche + rezumat cu pasageri | acceptat | rezumatul «n × 150 + n × 120 = Z lei»; planul nu mai promite «două hărți» |
| U8 | low | plural RU | acceptat | funcție `pasageriText(n, locale)` (1 пассажир / 2–4 пассажира) |
| B1 | high | auto-blocarea pe cotă la 3–4 pasageri | acceptat | cheia turului ține în `RouteResults` pe toată fereastra; se schimbă doar cheia returului la altă cursă de retur (serverul acceptă un retur nou pe tur neplătit, `comenzi.ts:399-408`); mesajul spune «la tur» / «la retur»; în pasul 2 cursele cu cotă vizibil mai mică decât pasagerii — neafișabil fără cota publică, deci doar mesajul clar la eroare (respinsă partea a 3-a: cota nu e publică, `public.ts:configPublica` — fără plafoane, ION-264) |
| B2 / E3 | med | 20% scris de mână | acceptat | procentul din `config.promo.pct` (`/api/bilete/public/config`, deja public), trecut prin props; `rezumatTurRetur` folosește `aplicaReducere` din `@translux/db` (aceeași cu serverul), test cu 15% și 25% |
| B3 | low | rotunjirea pe loc; reducere null | acceptat | preț retur = `aplicaReducere(pret, pct)` pe loc × n; `null` → plata blocată + mesaj |
| B4 | low | seats derivat, nu copiat | acceptat | în tur-retur `seats` = starea `pasageri` a ferestrei (o singură sursă) |
| E4 | med | regresii «Doar tur» + mini app | acceptat | verificare: «Doar tur» neschimbat (− / +, reduceri, o singură cursă); mini app-ul (`CautaBiletNou.tsx`) nu trimite `dataRetur` → mod vechi |
| E5 | low | banda deja în afara scroll-ului | acceptat | fără sticky separat |

## Pași v2 (înlocuiesc «Pași»)
1. **Bara de căutare** (`home-page.tsx`): la «Tur-retur» rândul «Pasageri − n +» (1–4) sub zile; `pasageri` + `pctRetur` (din config) trec la `RouteResults`.
2. **Fereastra** (`route-results.tsx`): coloană `100dvh` pe telefon; antet «Tur-retur · A ⇄ B»; banda pe un rând «1/3 · TUR · mar 13 oct · 2 pasageri». Starea ferestrei: `pasageri`, `cheieTur` (fixă), `cheieRetur` (nouă la altă cursă de retur), datele omului, lista retur (o căutare pe zi), turul și returul alese.
3. **Pasul 2**: rândul «✓ Tur: mar 13 oct 07:30 → 09:35 · schimbă»; lista din cache; zi goală → «Alege altă zi de întoarcere» (calendar); limita atinsă → «Prea multe căutări, încearcă peste câteva minute».
4. **Pasul 3** (`buy-ticket-form.tsx`, modul tur-retur): etichete «TUR · A → B · zi» / «RETUR · B → A · zi» deasupra cardurilor; harta sub cardul cursei din Chișinău; − / + (schimbă doar locurile); fără reduceri; rezumat «n × X + n × Y (−p%) = Z lei»; sub buton motivul blocării cu derulare; eroarea serverului spune tur/retur.
5. **Funcții pure + teste** (`apps/web/src/lib/tur-retur.ts`): `rezumatTurRetur`, `curseReturPotrivite`, `pasageriText`.
6. **Verificare**: tsc + vitest web; «Doar tur» și mini app neschimbate; captură/telefon real 390 px și 667 px înălțime, RO + RU.

## Review: ux-mobile (runda 2)
Închise de «Pași v2»: U1 (100dvh, banda pe un rând), U2 (motivul sub buton + derulare), U4, U5, U6, U7. U3 e închis, dar fix-ul lui deschide N1.

- **N1 · high (−2.0)**: «`cheieTur` (fixă)» se bate cu − / + din pasul 3 și cu «✓ Tur · schimbă». Serverul compară cheia cu (cursă, zi, `seats`, telefon) (`comenzi.ts:368-369` → «aceeași cheie, alt conținut»). **Scenariu:** 3 pasageri din Bălți. Omul apasă «Plătește», rândul turului se inserează, returul pică pe cotă. Omul scade la 2 pasageri, sau se întoarce și alege alt tur. Cheia turului e aceeași, deci serverul răspunde 409 la fiecare apăsare. Singura ieșire e «reîncarcă pagina», care pierde tot ce s-a ales. **Fix:** `cheieTur` = cheie nouă când se schimbă cursa turului sau `pasageri`. Rămâne aceeași doar când se schimbă returul. În plus, un retur deschis cu altă cursă dă și el refuz (`:404-405`, «returul ales s-a schimbat»). La schimbarea returului după un rând de retur creat trebuie deci reînnoite ambele chei. Regula intră în Pași v2 §2, cu un test pe funcția care dă cheile.
- **N2 · medium (−1.0)**: mesajele 409 (`idempotenta`) spun «reîncarcă pagina». În fereastra cu stare asta înseamnă să pierzi totul. Pași v2 §4 cere doar «tur/retur». **Fix:** text propriu pentru 409, «Alegerea s-a schimbat, apasă din nou», cu cheile reînnoite automat.
- **N3 · low (−0.3)**: numărul de pasageri se alege acum în 2 locuri (bara + pasul 3). Banda pașilor 1/2 trebuie să citească aceeași stare și să se schimbe odată cu ea.
- **N4 · low (−0.2)**: U8 e închis doar pe jumătate. Etichetele RU «ТУДА / ОБРАТНО» lipsesc din Pași v2, acolo e doar `pasageriText`.

Scor: 6.5 · Blocante (critical/high): 1

## Review: business-logic-auditor (runda 2)
Închise: B2 (`public.ts:196` dă `promo.pct`), B3 (`aplicaReducere` pe loc), B4 (o sursă `pasageri`). B1 doar pe jumătate.

- **B5 · high** — «cheieTur fixă» + − / + în pasul 3 (U3) se bat cu reluarea. Serverul compară `cheileComenzii` = `trip_date|crm_route_id|going_north|seats|phone` (`comenzi.ts:310-311,368`) → altă valoare = 409 «aceeași cheie, alt conținut». Scenariu: 3 pasageri, turul din Bălți se inserează (3 din cota 4), returul pică pe `COTA_PLINA`. Omul scade la 2 → același `cheieTur` cu `seats=2` → 409 la fiecare încercare. La fel dacă schimbă turul («schimbă» din pasul 2). Dacă primește cheie nouă, rândul vechi de 3 locuri ține cota 30 min (`546:124,128-134`): 3+2 > 4 → `COTA_PLINA` din nou. **Fix:** cheia turului = funcție de (tur, pasageri), nu fixă pe fereastră. Pe server: o comandă nouă a aceluiași telefon pe aceeași cursă trece pe `expirata` rândurile lui deschise fără `checkout_id` (altfel plan doar-UI nu închide B1). Sau, minim, mesajul spune «locurile încercării de dinainte se eliberează în 30 min».
- **B6 · medium** — «cheieRetur nouă la altă cursă de retur» nu ajunge când returul vechi are deja rând. La reluarea turului, `asiguraReturPachet` găsește returul deschis cu altă cursă și dă 409 «reîncarcă pagina» (`comenzi.ts:401-405`). După sesiunea MAIB (`checkout_id`), returul nou e refuzat (`:408`). Scenariu: omul se întoarce de la bancă, alege alt retur și rămâne blocat. **Fix:** orice schimbare după o creare reușită dă chei noi pentru amândouă (ca `buy-ticket-form.tsx:184-189` azi), cu limita din B5.

Scor: 6.0 · Blocante (critical/high): 1

## Review: senior-backend-engineer (runda 2)
E1–E5 sunt închise în Pași v2 (cache pe zi, `aplicaReducere` + pct din config, regresii, fără sticky). Rămân deschise:

- **R1 · high · −2.0** — `cheieTur` fixă se bate cu − / + din pasul 3. Serverul pune `seats` și `phone` în cheie (`comenzi.ts:310-311`, verificarea la `:368-369`). Scenariu: 3 pasageri, returul pică pe `COTA_PLINA` după ce rândul turului e deja inserat (`:386-387`). Omul apasă «−» și rămâne cu 2. Aceeași cheie, alt `seats` → 409 «aceeași cheie, alt conținut», fără ieșire. Dacă cheia se reface, rândul vechi ține 3 locuri din cotă 30 min și reapare B1. La fel cu alt retur după un `maib` 503: rândul de retur deschis dă 409 «reîncarcă pagina» (`:403-405`). Fix: cheia derivată din (tur, pasageri, telefon), iar pe server rândul `noua` fără `checkout_id`, cu aceeași persoană, se anulează sau se înlocuiește, ca să elibereze cota. Altfel planul trebuie să scrie că − / + și schimbarea returului sunt blocate după prima trimitere.
- **R2 · medium · −1.0** — `searchTrips` întoarce `TripResult[]`, iar blocarea dă `[]` (`actions.ts:297,325`). Eroarea bazei dă tot `[]` (`:326`). Mesajul «Prea multe căutări» nu are deci din ce să se aprindă. Fix: o acțiune nouă `cautaCurse(...)` care întoarce `{ stare: 'ok' | 'limita' | 'indisponibil', trips }`. `searchTrips` rămâne un ambalaj peste ea, așa că cei trei apelanți (`home-page.tsx:203`, `adauga-retur.tsx:41`, `CautaBiletNou.tsx:73`) nu se schimbă. Fără reîncercare automată: și căutarea blocată se numără.
- **R3 · medium · −1.0** — Calendarul din fereastră: `dataRetur` aparține de `home-page.tsx:96`. Planul trebuie să spună cine o schimbă (stare locală în `RouteResults` sau un callback). Apoi Escape: ascultătorul global (`route-results.tsx:71-75`) închide toată fereastra, cu tot cu alegerile, când omul voia să închidă doar calendarul.
- **R4 · low · −0.3** — Să rămână `max-height: 100vh` înaintea lui `100dvh`, pentru webview-urile vechi fără `dvh`.

Scor: 5.7 · Blocante (critical/high): 1

## Triaj runda 2 — observațiile Claude
Tema comună (N1 · B5 · R1, high; B6, N2): după o încercare care a creat deja rândul turului (ex. returul pică pe cotă),
orice schimbare (pasageri, tur, retur) dă 409 cu cheia veche, iar cu cheie nouă rândul vechi ține cota 30 de minute.
| id | sev. | decizie | corectura (în «Pași v3») |
|---|---|---|---|
| N1 / B5 / R1 | high | acceptat | (a) cheia turului se reface la orice schimbare de tur sau pasageri, cheia returului la orice schimbare de retur, iar după o trimitere eșuată se refac **ambele**; (b) **server, migr. 549**: în `bilete_creeaza_comanda`, sub lacătul global, înainte de cotă, comenzile **aceluiași telefon** pe **aceeași cursă** (zi, rută, sens) cu `status = 'noua'`, `checkout_id IS NULL`, `creare_incercari = 0`, `creare_in_curs_la IS NULL` (nicio sesiune maib încercată vreodată — deci niciun ban posibil pe ele) și alt `idempotency_key` → `expirata`; returul din pachet al unui tur expirat → `expirata` |
| B6 / N2 | med | acceptat | la cod `idempotenta` formularul reface cheile și arată «Alegerea s-a schimbat — apasă din nou „Plătește”» (fără «reîncarcă pagina» în fereastra cu pași) |
| R2 | med | acceptat | acțiune nouă `cautaCurse` → `{ stare: 'ok' \| 'limita' \| 'indisponibil', curse }`; `searchTrips` rămâne ambalaj (cei 3 apelanți neschimbați); fără reîncercare automată |
| R3 | med | acceptat | ziua întoarcerii devine stare a ferestrei (inițializată din bara de căutare); calendarul din fereastră prinde Escape primul (`stopPropagation`), Escape-ul ferestrei se oprește cât calendarul e deschis |
| N3 | low | acceptat | banda pașilor citește aceeași stare `pasageri` ca pasul 3 |
| N4 | low | acceptat | etichete RU «ТУДА» / «ОБРАТНО» |
| R4 | low | acceptat | `max-height: 100vh` urmat de `100dvh` |

## 🔬 Verificat pe viu (completare runda 2)
| Presupunere | Cu ce | Fapt | Influențează |
|---|---|---|---|
| Rândul fără nicio încercare maib are `creare_incercari = 0` și `creare_in_curs_la IS NULL` | `comenzi.ts` `asiguraSesiunea` (revendicarea pune `creare_in_curs_la`, eșecul crește `creare_incercari`) | da: un rând cu sesiune posibil creată la bancă are mereu unul din ele setat | expirarea din migr. 549 nu poate atinge o comandă care ar putea fi plătită |
| `searchTrips` dă `[]` și la limită și la eroarea bazei | `actions.ts:297,325-326` | da | `cautaCurse` cu stare |
| Cheia comenzii conține locurile și telefonul | `comenzi.ts:310-311,368-369` | da | chei noi la schimbare |

## Pași v3 (înlocuiesc «Pași v2»)
1. **Migr. 549** `bilete_creeaza_comanda`: expirarea încercărilor proprii neîncepute (regula de mai sus) + probă în blocul DO (aceeași persoană, 3 locuri, apoi 2 locuri pe cotă 4 → trece; un rând cu `creare_incercari = 1` nu se atinge).
2. **`cautaCurse`** în `actions.ts` (stare + curse); `searchTrips` = ambalaj.
3. **Bara de căutare**: «Pasageri − n +» la tur-retur; `pasageri`, `pctRetur`, ziua întoarcerii trec în fereastră.
4. **Fereastra**: `100vh` → `100dvh` pe telefon, antet «Tur-retur · A ⇄ B», banda pe un rând; starea ferestrei: pasageri, ziua întoarcerii, datele omului, lista retur (o căutare pe zi, cu stare), alegerile; cheile tur/retur după regula (a).
5. **Pasul 2**: «✓ Tur … · schimbă»; zi goală → «Alege altă zi de întoarcere» (calendar în fereastră, Escape local); limită → mesajul ei.
6. **Pasul 3**: etichete TUR/RETUR (RO/RU) cu ziua; harta sub cursa din Chișinău; − / + (reface locurile și cheile); fără reduceri; rezumat «n × X + n × Y (−p%) = Z lei»; motivul blocării sub buton; eroarea spune tur/retur; `idempotenta` → chei noi + «apasă din nou».
7. **Funcții pure + teste** (`apps/web/src/lib/tur-retur.ts`): `rezumatTurRetur`, `curseReturPotrivite`, `pasageriText`, `cheiNoi(schimbare)`.
8. **Verificare**: dry-run 549; tsc + vitest web/admin; «Doar tur» și mini app neschimbate; telefon 390 × 667, RO + RU.

## Critic extern - runda 2
Codex: scor 1.0 (Σ deduceri 9.5 → corect 0.5) · verdict **fail** · 4 critical/high, toate cu scenariu și dovadă.
| id | sev. | esență | decizie | motiv / corectura |
|---|---|---|---|---|
| C1 | high | returul din pachet (checkout NULL) poate fi expirat cât turul e în plată | acceptat | expirarea nu mai alege rânduri după criterii; se face **doar pe tur**, cu UPDATE condiționat atomic pe rândul turului (`status='noua' AND checkout_id IS NULL AND creare_incercari=0 AND creare_in_curs_la IS NULL`), apoi returul lui din pachet în aceeași tranzacție; revendicarea maib (`comenzi.ts:606`, UPDATE condiționat pe `status IN DESCHISE` și `creare_in_curs_la`) și expirarea se exclud prin lacătul pe rândul turului: una dintre ele găsește condiția falsă |
| C2 | critical | telefonul nu dovedește posesia comenzii | acceptat | dovada = **cheia de idempotență veche** (UUID aleator, generat în browser, cunoscut doar de el; `buy-ticket-form.tsx` `uuid()`), trimisă ca `inlocuieste`; telefonul + cursa = verificări în plus |
| C3 | high | prevalidarea TS (`comenzi.ts:277-290`) refuză înainte de SQL | acceptat | înlocuirea rulează **prima** în `creeazaComanda` (RPC separat, sub lacătul perechii + global), apoi prevalidarea și crearea; probă prin `creeazaComanda`, nu doar SQL (test de integrare cu 3 → 2 locuri pe cota 4) |
| C4 | high | chei noi după orice eșec pierd recuperarea sesiunii maib | acceptat | politica cheilor după răspuns: alegere **neschimbată** + `maib` / `in_lucru` / rețea → aceleași chei (reluarea recuperează sesiunea, `comenzi.ts:599,631,690`); alegere **schimbată** → chei noi + `inlocuieste` = cheile vechi; dacă încercarea veche are deja o încercare la bancă, înlocuirea e refuzată → mesaj «plata de dinainte e încă la bancă — încearcă peste 2 minute» și formularul revine la alegerea veche |

## Pași v4 (înlocuiesc «Pași v3»; diferențe față de v3 doar la 1, 6, 7)
1. **Migr. 549** — funcție `bilete_inlocuieste_incercare(p_cheie uuid, p_phone text) RETURNS text`:
   lacătul perechii (turul cu `idempotency_key = p_cheie`) → lacătul global → `UPDATE … SET status='expirata'` pe
   rândul turului cu condiția atomică din C1 + `phone = p_phone` + `comanda_tur_id IS NULL`; dacă a mers, același
   UPDATE pe returul lui din pachet (`comanda_tur_id = tur AND in_pachet AND status IN ('noua','eroare_creare')`);
   întoarce `inlocuit` / `nimic` (nu există sau nu e al lui) / `la_banca` (încercare maib existentă).
   REVOKE PUBLIC/anon/authenticated, GRANT service_role. Probe DO: înlocuire reușită (cota eliberată), alt telefon →
   `nimic`, rând cu `creare_incercari = 1` → `la_banca`, retur din pachet expirat împreună cu turul.
   `bilete_creeaza_comanda` **nu se schimbă**.
6. **Pasul 3**: ca în v3, plus politica cheilor din C4; `inlocuieste` = cheile încercării anterioare doar când
   alegerea s-a schimbat; `idempotenta` → chei noi + «apasă din nou».
7. **Server** (`comenzi.ts`, `route.ts`): `ComandaInput.inlocuieste?: string[]` (cel mult 2 UUID, validate);
   `creeazaComanda` cheamă `bilete_inlocuieste_incercare` pentru fiecare, **înainte** de reluare/prevalidare;
   `la_banca` → `ComandaError('in_lucru', …)`. Funcții pure + teste: `rezumatTurRetur`, `curseReturPotrivite`,
   `pasageriText`, `politicaChei(alegereSchimbata, codEroare)`.

## Review: security-auditor (runda 3)
Obiect: Pași v4 · 1 și 7, C2. Fapte:
- Cheia e CSPRNG (`buy-ticket-form.tsx:53-59`: `crypto.randomUUID`, rezervă `getRandomValues`, 122 biți) → nu se ghicește.
- Cheia nu iese nicăieri: răspunsul panoului dă doar `checkoutUrl/cod/total` (`api/bilete/comanda/route.ts:84`); erorile/jurnalele logează `e.message`, nu cheia (`route.ts:88`, `bilete-actions.ts:124`); `public.ts` folosește doar `pub:${ip}`; botul nu o atinge; `bilete_comenzi` are RLS fără politici + REVOKE anon/authenticated (`483:235-245`). Singura scurgere posibilă e un XSS pe site (câmpul ascuns `:221`) — deja totul pierdut.
- Anularea comenzii altcuiva: imposibilă fără cheie; `nimic`/`la_banca` nu devin oracol (cer cheia). Cota: înlocuirea eliberează doar locuri ale propriei încercări neîncepute, crearea rămâne sub `bilete_plafon` → nu adaugă amplificare.
- Drepturi: REVOKE PUBLIC/anon/authenticated + GRANT service_role — corect (regula funcțiilor noi).

Deduceri:
- −1.0 (medium) `inlocuieste` poate conține cheia curentă: înlocuirea rulează **înainte** de reluare, deci o reluare cu `inlocuieste=[key]` expiră propria comandă și `ON CONFLICT DO NOTHING` (`548:136-138`) întoarce rândul `expirata`. Corectură: în `creeazaComanda` respinge `inlocuieste ∩ {idempotencyKey, retur.idempotencyKey}` cu `validare`; aceeași gardă în SQL nu e necesară.
- −0.5 (low) Scrie în plan că funcția are `SET search_path TO 'public'` + `statement_timeout` (tiparul 548:15) și că `p_phone` e comparat după aceeași normalizare ca la inserare.
- −0.5 (low) Restrânge înlocuirea la comenzile căii publice (`bilete_comenzi` n-are `created_by`; `createdBy` merge doar la checkout, `comenzi.ts:670`) — ex. `ip_hash <> 'test-admin'` (`plati/actions.ts:31`), ca să nu atingă comenzile de probă din panou.

Scor: 8.0 · Blocante (critical/high): 0

## Review: business-logic-auditor (runda 3)
Verificat pe cod: C1–C4 sunt închise în v4.
- **Comanda care se poate plăti nu poate fi expirată.** Revendicarea (`comenzi.ts:606-611`) și UPDATE-ul din RPC sunt amândouă UPDATE-uri condiționate pe același rând. Postgres reverifică WHERE după lacătul rândului, deci una din ele găsește condiția falsă. Sesiunea maib există doar după revendicare. Eșecul legării (`:648`) pune `eroare_creare`, iar `status='noua'` îl exclude. Lacătele vin în ordinea din 548:45-46, deci fără deadlock.
- **3→2 merge.** `expirata` iese din `bilete_comanda_activa` (546) și din `STARI_PLAFON` (`:115,279`). Recuperarea sesiunii rămâne pe cheile neschimbate.

Deschise:
- **D1 · medium.** Numărul 549 e deja ocupat (`549_grafic_report_foaie_neacceptata.sql`, aeb679b3). Migrația devine **550**, iar textul se corectează în Pași și Verificare.
- **D2 · medium.** `la_banca` după un 503 de la maib e permanent: `creare_incercari=1` nu scade niciodată. Mesajul «încearcă peste 2 minute» e deci fals, iar 3 locuri rămân ținute 30 de minute. Fix: în TS, când `checkout_id` e NULL și revendicarea e liberă sau veche, întâi `findCheckoutByOrderId`. Dacă nu găsește nicio sesiune sau găsește una încheiată, expirarea condiționată pe `creare_incercari` citit și pe `creare_in_curs_la IS NULL`. Altfel textul corect e «revino la alegerea de dinainte».
- **D3 · low.** `p_phone` = `v.phone` normalizat, nu cel brut. Dacă telefonul se schimbă între încercări, RPC-ul întoarce `nimic` și cota rămâne ținută. Planul trebuie să o spună.

Scor: 8.3 · Blocante (critical/high): 0

## Review: senior-backend-engineer (runda 3)
**R1–R4 închise.** R1: `inlocuieste` + chei noi la schimbare. R2–R4: pașii 2–5 din v3 au rămas neschimbați. Ordinea lacătelor în v4 (pereche → global → rând) e aceeași ca în `bilete_creeaza_comanda` (548:45-46) și `bilete_marcheaza_platita` (548:150-156). Revendicarea maib (`comenzi.ts:606`) e un UPDATE condiționat pe rând. Sub READ COMMITTED, pe același rând, una dintre cele două tranzacții găsește condiția falsă. Nu văd inversare de lacăte și nu văd fereastră de ban.

- **S1 · medium · −1.0**: `politicaChei` trebuie să refacă **ambele** chei la orice schimbare, inclusiv când se schimbă doar returul. Dacă se reface doar cheia returului, cheia veche a turului găsește rândul (`comenzi.ts:366`), iar `asiguraReturPachet` dă 409 «returul ales s-a schimbat; reîncarcă pagina» (`:403-405`). Asta e blocajul R1, înapoi. Test: (doar retur schimbat, `inchis`) → 2 chei noi + `inlocuieste=[turVechi]`.
- **S2 · low · −0.5**: ordinea în care se judecă stările trebuie scrisă explicit. Întâi rândul se caută după cheie + telefon + `comanda_tur_id IS NULL` (lipsă → `nimic`). Apoi, dacă `checkout_id`, `creare_incercari > 0` sau `creare_in_curs_la` e setat, oricare ar fi `status` (și `platita`), rezultatul e `la_banca`. Abia apoi vine UPDATE-ul. Altfel un tur deja plătit iese `nimic` și omul cumpără de două ori.
- **S3 · low · −0.5**: o cerere veche, încă în zbor după o eroare de rețea, poate crea returul (`asiguraReturPachet` folosește obiectul `tur` citit înainte) după ce turul a fost expirat. Returul rămâne `noua` și ține cota 30 de minute. Fix: la crearea returului din pachet, SQL-ul verifică sub lacătul perechii că turul e `noua`/`eroare_creare`.
- **S4 · low · −0.3**: cheia returului din `inlocuieste` dă mereu `nimic` (`comanda_tur_id` nu e NULL pe ea). Trebuie trimisă doar cheia turului.

Scor: 7.7 · Blocante (critical/high): 0

## Triaj runda 3 — observațiile Claude (0 critical/high; toate acceptate)
| id | sev. | decizie | corectura (Pași v5) |
|---|---|---|---|
| D1 | med | acceptat | numărul e luat (`549_grafic_report_foaie_neacceptata.sql` pe main) → migrația devine **550** (se ia numărul liber la scriere) |
| D2 | med | acceptat | `la_banca` după un 503: în TS, înaintea RPC-ului, dacă turul vechi are `checkout_id NULL` și nu e revendicat proaspăt → `findCheckoutByOrderId`; fără sesiune sau sesiune închisă → RPC cu `p_incercari` citit (UPDATE condiționat pe `creare_incercari = p_incercari AND creare_in_curs_la IS NULL`); altfel textul «Plata de dinainte e încă deschisă la bancă — revino la alegerea de dinainte sau încearcă peste câteva minute» |
| D3 | low | acceptat | RPC-ul primește telefonul normalizat (`v.phone`, `normalizeazaTelefonPasager`) |
| S1 | med | acceptat | `politicaChei`: **orice** schimbare (tur, retur, pasageri) reface **ambele** chei; `inlocuieste` = cheia veche a turului; test pentru «doar returul schimbat» |
| S2 | low | acceptat | ordinea stărilor RPC: rândul cu cheia nu există / alt telefon → `nimic`; are încercare maib sau sesiune (`checkout_id`, `creare_incercari > 0`, `creare_in_curs_la`) sau e plătit/anulat → `la_banca`/`nimic` fără schimbare; doar `noua` neîncepută → `inlocuit` |
| S3 | low | acceptat | `bilete_creeaza_comanda` (pachet): sub lacătul perechii, turul trebuie să fie încă `noua`/`eroare_creare` (deja în 548:79); o cerere veche după expirarea turului primește `RETUR_TUR_NEVALID` — fapt verificat în 548:79, nu e nevoie de schimbare |
| S4 | low | acceptat | doar cheia turului în `inlocuieste` |
| SEC-1 | med | acceptat | `creeazaComanda` refuză `validare` dacă `inlocuieste` conține cheia turului sau a returului din cererea curentă |
| SEC-2 | low | acceptat | funcția: `SECURITY DEFINER`, `SET search_path TO 'public'`, `SET statement_timeout TO '5s'`, ca în 548 |
| SEC-3 | low | acceptat | filtru `NOT test` (comenzile de probă din panou au `test = true`, 546 `p.test`) |

## Critic extern - runda 3
Codex: scor 7.5 (Σ 3.0 → corect 7.0) · verdict **fail** · 1 high (C1) + 1 low (C2).
| id | sev. | esență | decizie | corectura |
|---|---|---|---|---|
| C1 | high | după 503 turul e `eroare_creare`; regula S2 («doar `noua`») nu-l poate elibera → cota rămâne ținută | acceptat | tabelul de tranziții de mai jos (unifică D2 + S2) + proba prin `creeazaComanda`: 503 → căutare la bancă fără sesiune → 3 → 2 pasageri → ambele rânduri vechi expirate |
| C2 | low | lipsește intermediarul web | acceptat | `apps/web/src/app/(public)/bilete-actions.ts` + `apps/web/src/lib/bilete-api.ts`: validarea și transmiterea `inlocuieste`, codul erorii păstrat în `StareComanda` pentru `politicaChei`; verificare formular → acțiune → API → politică |

### Tranzițiile înlocuirii (RPC `bilete_inlocuieste_incercare(p_cheie, p_phone, p_incercari)`, migr. 550)
| Starea turului vechi (cheia din `inlocuieste`, același telefon, `NOT test`) | Cine decide | Rezultat |
|---|---|---|
| nu există / alt telefon / `test` | RPC | `nimic`, nimic nu se schimbă |
| `platita`, `platita_fara_bilet`, `anulata`, `returnata`, `expirata` | RPC | `nimic` (cumpărarea nouă merge normal; nu se atinge nimic plătit) |
| `checkout_id` setat sau `creare_in_curs_la` setat (revendicare în curs) | RPC | `la_banca` |
| `noua`, `creare_incercari = 0`, fără `checkout_id`, fără revendicare | RPC (UPDATE condiționat atomic) | `inlocuit` + returul din pachet `expirata` |
| `noua`/`eroare_creare`, `creare_incercari > 0`, fără `checkout_id`, fără revendicare | **TS întâi**: `findCheckoutByOrderId(tur)`; sesiune deschisă/plătită → `la_banca`; nicio sesiune sau închisă → RPC cu `p_incercari` = valoarea citită | UPDATE condiționat pe `status IN ('noua','eroare_creare') AND checkout_id IS NULL AND creare_in_curs_la IS NULL AND creare_incercari = p_incercari` → `inlocuit` + returul; o încercare nouă de sesiune între timp schimbă `creare_incercari` / `creare_in_curs_la` → `la_banca` |
Plasă: dacă totuși o sesiune ascunsă ar fi plătită după înlocuire, `bilete_marcheaza_platita` (548) trece comanda `expirata` în `platita_fara_bilet` + alertă — bani fără bilet văzuți de dispecer, nu pierduți.

## Gate — după 3 runde (stop, a 4-a e interzisă)
| Partea | Scor ultima rundă | critical/high deschise |
|---|---|---|
| Claude — minimul revizorilor (runda 3) | 7.7 | 0 |
| Codex — critic extern (runda 3) | 7.0 | 0 după triaj (C1 acceptat și corectat, **nereverificat** de Codex) |
Istoric: Codex r1 10.0 (0) → r2 0.5 (4: C1–C4, toate acceptate) → r3 7.0 (1 high + 1 low, acceptate).
Claude r1 min 1.7 (4 blocante) → r2 min 5.7 (3, aceeași temă) → r3 min 7.7 (0).
Decide Ion: implementare cu corectura C1 (verificată la implementare prin proba din tabel) sau încă o verificare.
