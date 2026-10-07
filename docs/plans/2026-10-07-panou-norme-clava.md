# Panoul normelor pentru Clava

## De ce

Ion, 07.10.2026: «acum facem un panou lui Clava (ea este și admin pe camere) în care lunar se propun normele la auto
și șoferi, și ea fie acceptă, fie nu acceptă și scrie comentariu de ce», «să fie cu puțină informație încărcat, dar
pentru ea să fie ușor, să fie norma pe fiecare mașină, km total, litri total, iar dacă apeși să se deschidă detaliat».

Azi norma o pune mecanicul și directorul, iar Clava o socotește de mână din LDE (graficul + km LDE + nomenclator,
interviul din 07.10). Softul are deja cele două repere pe care Ion le-a fixat pentru verificare («strict tipuri mașini
și media 3 luni la această mașină», e237a215), dar nimeni nu le confirmă, iar dezacordul Clavei nu rămâne nicăieri.

## Ce facem

**Decizia aleasă** (răspunsurile lui Ion din 07.10, AskUserQuestion):
1. Pe fiecare mașină de uzină, pentru luna M **închisă** («după ce luna s-a închis»), softul propune **două cifre**:
   norma tipului (`lde_vehicle_types.norm_l_per_100km`) și media mașinii pe cele 3 luni închise de dinainte de M
   (`lde_fuel_norma_eb(M).r_masina`). **Clava alege una.**
2. Dacă nu e de acord cu niciuna: **pune norma ei + comentariu de ce** (ambele obligatorii) — «ca să învățăm sistemul».
   Fiecare decizie (și fiecare schimbare) rămâne în istoric.
3. **Norma pe șofer = norma aleasă a mașinii lui.** Șoferii se văd în detaliul mașinii (km GPS pe zilele agreate,
   litri = km × consumul mașinii, abaterea față de norma aleasă); «de verificat» când sunt ≥ 2 șoferi și supraconsum
   față de norma aleasă (nu față de cifra respinsă).
4. **Confirmarea lui Ion**: «aici trebuie să meargă doar după confirmarea mea posterul în grupă». După ce Clava a decis,
   Ion (rol ADMIN) apasă «Confirm normele lunii» pe panou; abia atunci posterul de combustibil pleacă în grupa P9/DT,
   cu norma Clavei pe mașinile decise. Cronul VPS de pe 25 nu mai trimite posterul unei luni neconfirmate.
5. **Un cont**: `clava@translux.md` primește și camerele (Numărarea cu drepturile ADMIN_CAMERE), de oriunde (fără filtru
   IP, Ion: «De oriunde»); `camere@translux.md` se dezactivează (Ion: «Doar Clava — îl dezactivăm»).

**Ecranul** (după revizorul ux-clava): pagina `/lde/agreare/norme` se deschide pe **ultima lună închisă** până când toate
mașinile ei sunt decise. Antet: «Normele pentru septembrie 2026 · km și litri 01–30.09», selector de lună, filtrul
uzinei, «De decis N / Alese M». Un rând pe mașină, grupat pe uzină, nedecisele sus (după litrii în joc):
`▸ Mașina · Km · Litri · Consum în sept. · (După tip X) (Media mașinii Y) (Altă cifră…) · stare`.
Butonul ales devine plin bordo cu ✓. Detaliul se deschide doar din ▸ / plăcuță (nu din butoane): cele două cifre
explicate într-un rând fiecare, șoferii lunii (perioadă, km, litri, ± față de norma aleasă), km pe zile ca bandă,
plinurile pe un rând, «luna trecută: …», cine și când a ales. Fără EB / r_masina / „propunere" în text. Sub 700 px
rândul devine card. Fără buton «alege la toate» (Ion: «ea fie acceptă fie nu» — pe fiecare mașină).

**Variante respinse:**
- *Rând separat pe fiecare șofer de acceptat* — Ion a ales «norma mașinii lui».
- *Cifra amestecată (o singură propunere)* — Ion a ales «două cifre, Clava alege».
- *Rolul Clavei schimbat în ADMIN_CAMERE* — ADMIN_CAMERE are filtru IP (o adresă), Clava intră și din 95.65.80.199,
  iar Ion vrea camerele ei «de oriunde».

## 🔬 Verificat pe viu

| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Clava are un singur cont, rol CONTABIL_LDE | `select … from admin_accounts where email ilike '%clav%'` | `clava@translux.md`, CONTABIL_LDE, activ din 02.10 | contul ei rămâne, se lărgește |
| Contul de camere e separat | `admin_accounts where role in (ADMIN_CAMERE,…)` | `camere@translux.md` (ADMIN_CAMERE, fără nume) | Ion: e doar al Clavei → se dezactivează |
| Cine intră în contul de camere | `admin_login_events` ok, pe email | camere@: 5 intrări, IP 77.89.228.230, ultima 06.10; clava@: 5 intrări, 77.89.228.230 + 95.65.80.199 | aceeași persoană; intră și din altă rețea |
| ADMIN_CAMERE are filtru IP | `lib/ip-access-roles.ts:5-9`, `role_allowed_ips` | ADMIN_CAMERE: 1 adresă; filtrul stă în `(dashboard)/layout.tsx:12` | CONTABIL_LDE NU se adaugă la rolurile IP (decizia lui Ion) |
| Trei liste de roluri diferite în numărare | `numarare/actions.ts:117-118`, `auditActions.ts:9,12`, `tabs/operatorActions.ts:35,46`, `NumararePageClient.tsx:30-34` | NUMARARE_ROLES (cu OPERATOR_CAMERE) ≠ NUMARARE_ADMIN_ROLES ≠ lista operatorilor afișați (`:46`, filtru de date) | două funcții separate + `:46` NU se atinge |
| Dezactivarea din fila Operatori | `tabs/operatorActions.ts:97-112` (revizorii backend + securitate) | `toggleOperatorActive` dezactivează ORICE cont după id, inclusiv ADMIN | se închide la conturi OPERATOR_CAMERE, înainte de a da rolul Clavei |
| Posterul de combustibil pleacă singur | `api/cron/lde-combustibil-poster/route.ts:9-17`, `lib/lde/combustibil-poster.ts:1-17` | crontab VPS pe 25 la 08:00, luna trecută; `?force=1` retrimite; norma = `lde_fuel_norma_eb` | ruta refuză luna neconfirmată; butonul lui Ion trimite |
| Posterul și /lde/combustibil citesc norma EB | `combustibil-poster.ts:115,146-152`, `combustibil/actions.ts:96,124` (revizorul business) | norma = `lde_fuel_norma_eb(luna).norma` | după confirmare: norma Clavei unde există, EB în rest |
| Norma tipului există pe mașini | SELECT `lde_vehicle_norms ⋈ lde_vehicle_types` pe 12 plăcuțe | toate au tip, în afară de 297LVY | mașina fără tip: doar «media» sau «altă cifră» |
| Media pe 3 luni există | `lde_fuel_norma_eb('2026-10-01', uzine)` | 99 mașini, 98 'eb', km pe 3 luni mediană 15.015, 4 sub 3.000 km | sub 3.000 km → marcaj «puțini km» |
| Reperele diferă cât să conteze | aceeași interogare | media ≠ tip cu 9,1 % în medie; 20 peste +10 %, 8 sub −10 % | alegerea schimbă abaterile |
| Viteza propunerii | `explain analyze lde_fuel_norma_eb` pe 100 de mașini | 510 ms | calcul la deschidere; înghețat la decizie |
| Km și litri pe lună | `lde_fuel_flota('2026-09-01','2026-09-30')` | Drax 18,5 l/100 (49 mașini), SEBN 14,8, LEAR U. 17,3, Florești 11,8 | coloanele Km / Litri |
| Km din LDE în zilele fără GPS | revizorul business, sept. | 11 din 148 de mașini de uzină au zile cu km LDE; partea șoferului e doar GPS | detaliul arată «km fără GPS» separat |
| GPS pe zile pe toată flota | revizorul backend | 4.065 rânduri în sept. (> 1000) | lista nu citește GPS pe zile; doar detaliul unei mașini (< 1000) |
| Agrearea șoferilor | `select luna, count(*) from lde_agreare_sofer` | 0 rânduri | detaliul arată propunerea agreării cu «*» |
| Ultima migrație | `ls packages/db/migrations` | 527 | migrația nouă = 528 |

## Pași

0. **Gaura din fila Operatori** (înainte de orice drept nou): `toggleOperatorActive` și celelalte acțiuni de operatori
   lucrează doar pe conturi `OPERATOR_CAMERE` (SELECT pe rolul țintei, altfel refuz). Rezultat: încercarea pe un cont
   ADMIN întoarce eroare.
1. **Migrația 528**:
   - `lde_norma_luna (luna date CHECK = date_trunc('month', luna), vehicle_id uuid → vehicles, norma_tip numeric,
     medie3 numeric, km3 numeric, ales text CHECK in ('tip','medie3','clava'), norma numeric NOT NULL CHECK (norma > 0
     AND norma < 100), comentariu text CHECK length ≤ 1000, decis_de text NOT NULL, decis_la timestamptz NOT NULL,
     UNIQUE(luna, vehicle_id))`, CHECK
   `ales <> 'clava' OR (comentariu IS NOT NULL AND length(btrim(comentariu)) >= 5)` (NULL, gol și doar spații respinse;
   verificate separat la `--dry-run`);
   - `lde_norma_luna_istoric` (aceleași coloane + `id`, `scris_la`), umplut de un trigger AFTER INSERT OR UPDATE pe
     `lde_norma_luna` (istoricul nu poate lipsi); `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon, authenticated`;
   - `lde_norma_luna_confirmare (luna date PK CHECK prima zi, confirmat_de text NOT NULL, confirmat_la timestamptz,
     poster_trimis_la timestamptz)`;
   - RLS activ fără politici pe toate trei; REVOKE ALL FROM anon, authenticated.
   Rezultat: `db-migrate.sh translux --dry-run` trece, apoi aplicat; `has_function_privilege('anon', …)` = false.
2. **Rolurile** `lib/roles.ts` — funcții pure: `poateNumara(role)` = ADMIN, ADMIN_CAMERE, OPERATOR_CAMERE, CONTABIL_LDE;
   `esteAdminCamere(role)` = ADMIN, ADMIN_CAMERE, CONTABIL_LDE; `caiPermise(role)` folosit de middleware
   (CONTABIL_LDE: `/lde/agreare`, `/numarare`). NUMARARE_ROLES/AUDIT_ROLES/NUMARARE_ADMIN_ROLES și verificările pe șir
   din numarare/** trec pe aceste funcții; `operatorActions.ts:46` (lista afișată) NU se schimbă;
   `NumararePageClient.tsx:30-34` primește CONTABIL_LDE ca admin camere. Sidebar: CONTABIL_LDE vede doar Normele,
   Agrearea, Numărarea. **Test vitest** `lib/roles.test.ts` pe toate cele 15 roluri: OPERATOR_CAMERE poate număra dar
   nu e admin; CONTABIL_LDE e admin camere și nu ajunge la /lde/combustibil, /users, /api/lde.
3. **Logica** `lib/lde/norma-luna.ts` (fără verificare de rol, ca bibliotecă): `reperele(luna, ids)` (tip + medie3 +
   km3 din `lde_fuel_norma_eb`), `kmLitriLuna(luna)` (`lde_fuel_flota`), `normaFinala(luna, ids)` = decizia Clavei dacă
   există, altfel EB. Acțiunile din `lde/agreare/norme/actions.ts` verifică rolul explicit (ADMIN, CONTABIL_LDE):
   - `getNorme(luna)` — lista (reperele, km, litri, consumul, decizia, șoferii agreați per mașină cu km pe perioadă
     calculați în SQL agregat, nu GPS pe zile); țintă < 2 s;
   - `getDetaliuMasina(luna, vehicleId)` — la ▸: GPS pe zile + alimentările unei singure mașini; țintă < 1 s;
   - `decide(luna, vehicleId, ales, norma?, comentariu?)` — reperele se RECALCULEAZĂ pe server; mașina trebuie să fie
     de uzină; `decis_de` din sesiune; luna trebuie să fie închisă; după confirmarea lui Ion doar ADMIN mai schimbă;
   - `confirmaLuna(luna)` — doar ADMIN; scrie confirmarea (idempotent), apoi trimite posterul. **Succes** = albumul
     trimis + posterul general trimis + introducerea trimisă, fără niciun `error` și fără `skipped` cu motivul «grupa nu
     e setată» / «luna a plecat deja» (`combustibil-poster.ts:321-322`); rezultatul pe bucăți se scrie în
     `lde_norma_luna_confirmare.poster_rezultat jsonb`, iar `poster_trimis_la` DOAR la succes. Altfel panoul lui Ion arată
     ce bucată n-a plecat și de ce;
   - **Recuperarea pe bucăți, cu stare persistentă**: `poster_rezultat = {album, general, introducere}`, fiecare
     `ok | eroare | netrimis`. `trimitePostereCombustibil` se împarte în trei funcții care trimit O SINGURĂ bucată:
     `trimiteAlbum`, `trimiteGeneral`, `trimiteIntroducere` (azi toate trei într-o funcție, `:338-359`, iar introducerea
     pleacă și când generalul a căzut). O funcție `recupereazaPoster(luna)` citește starea și trimite doar bucățile
     care nu sunt `ok`, în ordine: albumul (dacă nu e ok, nimic n-a plecat, `:346`), apoi generalul, apoi introducerea;
     după fiecare bucată starea se scrie imediat (o reușită nu se pierde dacă următoarea cade). Aceeași funcție o
     folosesc butonul «Trimite din nou» (doar ADMIN) și cronul; `poster_trimis_la` = când toate trei sunt `ok`.
     **Rezultat incert** (Codex r3): înainte de fiecare trimitere bucata trece în `in_curs` (scris în bază); după
     răspuns → `ok` sau `refuzat` doar când Telegram a răspuns explicit `ok:false` cu cod 4xx; timeout, conexiune
     ruptă sau proces oprit lasă `in_curs` / devine `incert`. Recuperarea automată (buton «Trimite din nou» și cron)
     retrimite DOAR `netrimis` și `refuzat`; pentru `in_curs`/`incert` panoul lui Ion spune «verifică în grupă dacă a
     plecat» cu două butoane: «A plecat» (marchează `ok`) și «Retrimite» (explicit). Helperii `sendTelegramAlbum` /
     `sendTelegramText` (`telegram-notify.ts:171-208`) întorc și motivul (refuz Telegram vs. rețea).
     Verificare: trimițătorul Telegram injectabil în test → cazurile «doar introducerea refuzată», «doar generalul
     refuzat» (pleacă exact bucata căzută, o dată), «livrat, răspuns pierdut» și «livrat, succes nescris» (nu pleacă
     nimic automat, starea e `incert`/`in_curs`);
   - `retrimitePoster(luna)` — doar ADMIN, explicit, când o normă s-a schimbat după trimitere (un album nou, conștient).
3b. **Cifrele posterului proaspete**: `trimitePostereCombustibil` și `?preview=1` golesc cache-ul complet
   (`flotaPeLuna.clear()` în loc de `delete(luna)` care azi nu atinge nicio cheie — `:106` vs `:320`); norma Clavei se
   aplică ÎN `citesteFlotaDinBaza` (`:111-123`), deci și lunii trecute folosite la escaladare.
3c. **Când contează norma Clavei**: în poster și pe `/lde/combustibil` doar pentru o lună **confirmată de Ion**; pe
   panou și pe `/lde/agreare/consum` și înainte, marcată «neconfirmată». `/lde/combustibil` (perioadă liberă,
   `combustibil/actions.ts:83-84`) o folosește doar când perioada e exact o lună calendaristică confirmată; altfel EB.
   Legenda posterului (`:217,290,301`) spune «normă = aleasă de Clava, confirmată» pe rândurile ei; semnul «!» (normă
   umflată) nu apare pe rândurile cu norma Clavei.
4. **Pagina** `/lde/agreare/norme` după macheta de mai sus; pagina de start a Clavei (login + middleware).
5. **Norma finală în rapoarte**: `/lde/agreare/consum`, `/lde/combustibil` și posterul folosesc `normaFinala`
   (Clava unde a decis, EB în rest). Concret, în poster citirea `lde_fuel_norma_eb` din `genereazaGrup`
   (`combustibil-poster.ts:115-119`) trece prin `normaFinala(luna)`, citită la momentul trimiterii (nu din cache), așa
   că posterul nu poate păstra norma EB pe o mașină decisă; test: pe o mașină decisă «clava», `?preview=1` arată cifra ei. Ruta posterului: fără confirmare pentru luna cerută → `{status:'asteapta_confirmarea'}`
   și nu trimite (și la `force=1`); fără `?luna`, cronul de pe 25 ia TOATE lunile confirmate și netrimise din ultimele 3
   (nu doar luna trecută, `route.ts:21`) și le trimite cu aceeași regulă de succes.
5a. **Poarta posterului se livrează întâi, separat, înainte de 25.10 08:00** (septembrie n-a plecat: în bază
   `combustibil_poster_album_last = '2026-08'`): commit mic doar cu verificarea confirmării în rută + tabelul de
   confirmare. Dacă pe 24.10 nu e pe prod, îi spun lui Ion, iar cronul VPS de pe 25.10 se comentează pentru o lună.
6. **Contul de camere**: după ce Clava intră pe /numarare cu clava@, `camere@translux.md` → active=false +
   session_version++ (cu `db-migrate.sh translux --exec`).

## Fișiere

- `packages/db/migrations/528_lde_norma_luna.sql` — nou
- `apps/admin/src/lib/roles.ts`, `lib/roles.test.ts` — noi
- `apps/admin/src/lib/lde/norma-luna.ts` — nou
- `apps/admin/src/middleware.ts`, `components/Sidebar.tsx`, `app/page.tsx`, `app/login/page.tsx` — rolul Clavei
- `apps/admin/src/app/(dashboard)/numarare/**` (actions, auditActions, NumarareClient, NumararePageClient, CountingForm,
  tabs/salaryActions, tabs/tariffActions, tabs/operatorActions) — funcțiile de rol + gaura din Operatori
- `apps/admin/src/app/(dashboard)/lde/agreare/norme/{page.tsx,actions.ts,NormeClient.tsx}` — noi
- `apps/admin/src/app/(dashboard)/lde/agreare/consum/actions.ts`, `lde/combustibil/actions.ts`,
  `lib/lde/combustibil-poster.ts`, `api/cron/lde-combustibil-poster/route.ts` — norma finală + poarta confirmării

## Riscuri

- **Lărgirea drepturilor**: CONTABIL_LDE face tot ce face ADMIN_CAMERE (sume, audit, salarii, tarife), de oriunde —
  decizia lui Ion. Rezervă: testul de roluri; gaura din Operatori închisă la pasul 0.
- **Posterul nu mai pleacă singur**: dacă Ion nu confirmă, luna rămâne fără poster. Rezervă: panoul arată lui Ion
  «Septembrie: 99/99 decise · așteaptă confirmarea ta»; cronul de pe 25 întoarce `asteapta_confirmarea` (în jurnalul VPS).
- **Cifrele se mișcă după decizie** (alimentări întârziate): reperele sunt înghețate; dacă cele de azi diferă cu > 3 %,
  rândul arată «⚠ cifrele s-au schimbat după ce ai ales».
- **Mașina fără tip / fără 3 luni**: butonul lipsă nu apare.
- **Grupurile fără decizii (interurban, Briceni, camioane, utilaje)** rămân pe norma EB în poster.

## Verificare

- `tsc` + vitest (`lib/roles.test.ts`) + pre-push git-guards; migrația cu `--dry-run`, apoi aplicată.
- curl pe prod logat ca ADMIN (memoria «admin page repro via curl»): `/lde/agreare/norme?luna=2026-09` → 200, timp < 2 s.
- decizie de probă pe o mașină («tip»), una «clava» fără comentariu → refuzată de server și de CHECK; istoricul are 2
  rânduri; apoi șterse.
- ruta posterului cu `?luna=2026-09` fără confirmare → `asteapta_confirmarea`, nimic trimis.
- trimitere eșuată simulată (grupa nesetată pe o copie de config) → `poster_trimis_la` rămâne NULL, «Trimite din nou» vizibil.
- `toggleOperatorActive` pe id-ul unui ADMIN → refuz.

## Întrebări pentru Ion

1. `camere@translux.md` îl folosește doar Clava? — **Ion, 07.10: «Doar Clava — îl dezactivăm».** (pasul 6)
2. Camerele Clavei doar din birou sau de oriunde? — **Ion, 07.10: «De oriunde».**
3. Posterul și /lde/combustibil după decizia Clavei? — **Ion, 07.10: «aici trebuie să meargă doar după confirmarea mea
   posterul în grupă».** (pașii 3, 5)
4. Norma lunii se decide când? — **Ion, 07.10: «După ce luna s-a închis».**

## Triaj revizori Claude — runda 1

| revizor | id | sev. | esență | decizie | motiv |
|---|---|---|---|---|---|
| business | H | high | norma Clavei vs norma EB din poster / /lde/combustibil | acceptat | întrebarea 3; pașii 3, 5 |
| business | M1 | medium | km LDE din zilele fără GPS nealocați șoferilor | acceptat | detaliul arată «km fără GPS» separat |
| business | M2 | medium | `decide` recalculează reperele, decizie + istoric împreună | acceptat | pasul 3 + trigger la pasul 1 |
| business | L | low | «peste» doar față de norma aleasă; termenul de schimbare | acceptat | Ce facem 3; pasul 3 (după confirmare doar ADMIN) |
| ux-clava | H1 | high | ce lună se decide | acceptat | întrebarea 4; pagina se deschide pe ultima lună închisă |
| ux-clava | M1/M3/L1-L3 | medium/low | ordine, clic vs butoane, limbaj, mobil, detaliu | acceptat | secțiunea Ecranul |
| ux-clava | M2 | medium | buton «alege la toate» | respins | Ion: «ea fie acceptă fie nu» — pe fiecare mașină |
| backend | H1 | high | `toggleOperatorActive` pe orice cont | acceptat | pasul 0 |
| backend | H2 | high | o funcție pentru trei liste; test inexistent | acceptat | pasul 2 (două funcții, `:46` neatins, vitest) |
| backend | M1 | medium | istoricul în două scrieri | acceptat | trigger, pasul 1 |
| backend | M2 | medium | lista nu încarcă GPS pe zile; ținte de timp | acceptat | pasul 3 |
| backend | L1-L3 | low | validare, CHECK lună, rol explicit, partea comună fără rol | acceptat | pașii 1, 3 |
| security | C1 | critical | idem backend H1 | acceptat | pasul 0 |
| security | H1 | high | filtrul IP doar pe /numarare nu se poate face | respins | Ion: «De oriunde» — CONTABIL_LDE nu primește filtru IP; lipsa IP-ului în acțiunile ADMIN_CAMERE e preexistentă, nu e lărgită de plan |
| security | M1/M2/M3 | medium | `:46`, test, istoric fără drepturi | acceptat | pașii 1, 2 |
| security | L1/L2 | low | validarea `decide`, Sidebar | acceptat | pașii 2, 3 |

## Critic extern - runda 1

Codex (gpt-6-astra) a întors JSON valid ca formă, dar cu o singură observație «Placeholder» cu toate câmpurile goale
(scor 4.5, verdict fail). Conform procedurii: **critic indisponibil ≠ critic mulțumit** — runda nu trece gate-ul.
Rezumatul lui numește două riscuri, tratate ca observații:

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high → medium (fără scenariu) | «Placeholder», gol | respins | fără conținut; nimic de corectat |
| R1 (din rezumat) | medium | funcția reutilizată a posterului poate păstra norme vechi | acceptat | pasul 5: `genereazaGrup` citește `normaFinala` la trimitere + test cu preview |
| R2 (din rezumat) | medium | trimiterea incompletă poate bloca recuperarea | acceptat | pasul 3: `poster_trimis_la` doar la succes, «Trimite din nou», cronul reîncearcă, `retrimitePoster` explicit |

## Critic extern - runda 3 (ultima)

Codex: scor 8.0 (inconsistent cu Σ deduceri: 7.5), verdict fail, 1 high cu scenariu și dovadă.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | rezultatul incert al Telegram (timeout / răspuns pierdut) tratat ca «n-a plecat» → album dublat | acceptat | pasul 3: stări `in_curs`/`incert`, recuperarea automată doar pe `netrimis`/`refuzat` (4xx explicit), Ion confirmă «A plecat» / «Retrimite», 4 teste |

Gate: zero critical/high deschise (toate acceptate în plan sau respinse cu fapt). Corecția r3 n-a mai fost revăzută de
Codex — a 4-a rundă e interzisă de procedură.

## Critic extern - runda 2

Codex: scor 7.0, verdict fail, 1 high (consistent).

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | recuperarea retrimite bucăți deja livrate (general/introducere) | acceptat | pasul 3: trei funcții pe bucată, stare persistentă per bucată, `recupereazaPoster` comun buton + cron, test pe ambele combinații |
| C2 | low | CHECK-ul lasă comentariu NULL | acceptat | pasul 1: `comentariu IS NOT NULL AND length(btrim) >= 5` |

## Triaj business-logic-auditor — runda 2

| id | sev. | esență | decizie | motiv |
|---|---|---|---|---|
| H1 | high | «trimis» definit greșit (skipped ≠ succes; marcajul albumului) | acceptat | pasul 3: succes pe bucăți, `poster_rezultat`, retrimiterea doar a bucăților căzute |
| H2 | high | cache-ul posterului nu se golește (`:106` vs `:320`) | acceptat | pasul 3b: `clear()` + norma Clavei în `citesteFlotaDinBaza` |
| M1 | medium | confirmarea nelegată de norma finală | acceptat | pasul 3c |
| M2 | medium | /lde/combustibil pe perioadă liberă | acceptat | pasul 3c: doar o lună calendaristică confirmată |
| L1 | low | legenda + «!» | acceptat | pasul 3c |
| L2 | low | cronul doar luna trecută | acceptat | pasul 5 |
| L3 | low | termenul 25.10 | acceptat | pasul 5a |

## Review: business-logic-auditor

Verificat pe cod și în bază (SELECT): `pg_get_functiondef(lde_fuel_norma_eb)`, `pg_get_functiondef(lde_fuel_flota)`,
`lde/agreare/consum/actions.ts`, `lde/combustibil/actions.ts`, `lib/lde/combustibil-poster.ts`, `lib/lde/livrare-poster.ts`.
Ce e bine: `r_masina` e făcut din aceeași `lde_fuel_flota(...).litri_cu_km / km` ca și «l/100 faptic» al lunii, deci
Clava compară măsuri de același fel; nicio mașină de uzină n-a avut în iul.–sep. o lună ≥ 300 km fără litri (media nu e
trasă în jos de luni goale); înghețarea în `norma` a cifrei alese face norma lunii stabilă la recalculări.

1. **high — «norma lunii» redefinită fără consumatorii ei (formula drift).** Planul spune «cifra ei devine norma lunii
   (decizia ei e finală)», dar norma oficială a lunii e azi EB din ION-154 (decizia lui Ion după 3 runde) și o citesc
   neschimbat: posterul lunar din grupa P9 / tabul DT (`lib/lde/combustibil-poster.ts:115,146-152` — nivelul
   supraveghere/investigație se calculează pe `n.norma` EB) și pagina `/lde/combustibil` (`combustibil/actions.ts:96,124`).
   Scenariu: pe 25.10 posterul pentru septembrie arată mașina X la +8 % față de EB 19,5 (fără culoare), iar panoul Clavei,
   cu norma aleasă «tip» 18,0, o arată +17 % și «de verificat»; mecanicul și directorul primesc două norme oficiale pentru
   aceeași mașină-lună, iar dezacordul nu se vede nicăieri. Corecție: planul trebuie să spună explicit ce consumatori
   trec pe norma acceptată și care NU — recomandare: `/lde/agreare/consum` DA (pasul 5); posterul și `/lde/combustibil`
   rămân pe EB (ION-154), dar primesc o coloană/semn «norma Clavei» sau, invers, trec pe norma acceptată când există —
   asta e decizia lui Ion, deci **întrebarea 3 pentru Ion**. `livrare-poster.ts:362-381` (norma tipului pentru lei din km
   goi) și `naveta-image.ts` NU trebuie atinse: acolo e estimare de flotă, nu judecata unei mașini.
2. **medium — km mașinii ≠ suma km ai șoferilor.** «Km total» din `lde_fuel_flota` ia km din `lde_km_m2m` (LDE) în zilele
   fără GPS (`COALESCE(g.km, m.km)` în CTE `k`), iar partea șoferului și `km_fara_sofer` iau doar GPS
   (`consum/actions.ts:94-100,124,133`). În sept. 11 din 148 de mașini (fără camioane) au zile LDE: acolo litrii mașinii nu
   se împart pe șoferi + «fără șofer», o parte rămâne nicăieri. Corecție: în detaliu, rândul «km LDE (fără GPS)» separat,
   sau partea șoferului din aceeași sursă de km ca mașina. Iar Ion a spus la camioane «km doar din GPS, LDE poate fi
   manipulat» — de întrebat dacă și la norme se exclud zilele LDE.
3. **medium — `decide()` trebuie să recalculeze reperele pe server și să scrie decizia + istoricul atomic.** Planul zice
   «reperul ales trebuie să existe» și «se îngheață», dar nu că `norma_tip`/`medie3` se iau din `lde_fuel_norma_eb` +
   `lde_vehicle_norms` pe server, nu din formular (altfel cifra «tip» salvată poate fi oricare). Istoricul în două
   cereri PostgREST separate poate rămâne nesincron cu `lde_norma_luna`. Corecție: o funcție SQL `lde_norma_decide(...)`
   (REVOKE EXECUTE FROM PUBLIC) care calculează reperele, face upsert și inserează în istoric într-o tranzacție; `luna`
   cu CHECK `luna = date_trunc('month', luna)`.
4. **low — pasul 5 nu spune ce devine `peste` / `de_verificat`.** Azi `peste` = peste tip SAU peste media 3
   (`consum/actions.ts:137`). Cu norma acceptată trebuie să fie doar față de ea, iar cele două coloane de abatere să
   devină una; altfel șoferul rămâne «de verificat» față de reperul pe care Clava l-a respins.
5. **low — fără regulă când se poate schimba decizia.** Istoricul admite schimbări, dar nu e fixat până când (ex. până
   la posterul din 25 sau până la reținerea șefului). Corecție: o propoziție în plan — decizia pe luna M se poate
   schimba până la închiderea lui M+1, după aceea doar ADMIN.

Scor: 5.0 · Blocante (critical/high): 1

## Review: ux-clava

Zona: forma ecranului pentru Clava (contabilă, ~99 de mașini/lună, 4 uzine). Citite: `lde/agreare/AgreareClient.tsx`,
`lde/agreare/consum/ConsumClient.tsx`, `lde/agreare/actions.ts`.

### Observații

**H1 · high · −2.0 — Pagina nu spune ce lună se decide și se deschide pe luna greșită.**
Dovada: `lde/agreare/actions.ts:52-58` — luna implicită = luna curentă (sau ultima lună cu hartă). Dacă `/norme` copiază
tiparul (pasul 4 nu spune altfel), atunci pe 07.10 Clava intră (pagină de start!), vede **octombrie** cu 7 zile de km și
litri, «l/100 faptic» = «puține date» pe multe rânduri și «de decis 99». Ea decide octombrie, iar septembrie — luna pentru
care se face reținerea pe /consum — rămâne nedecisă și /consum continuă cu cele două repere. Sau invers: decide pe o
coloană «faptic» din jumătate de lună și o îngheață.
Sugestie: (a) pagina se deschide pe **ultima lună închisă** (M−1) până când toate mașinile ei sunt decise, abia apoi pe
luna curentă; (b) titlul spune explicit «Normele pentru septembrie 2026 · km și litri 01–30.09»; la o lună în curs,
«până la 07.10» (ca `ConsumClient.tsx:137`) și coloana «l/100 al lunii» gri; (c) întrebarea pentru Ion, dacă nu e deja
clară: norma lunii M se decide **după** ce M s-a închis (cu consumul ei sub ochi) sau la începutul lui M?

**M1 · medium · −1.0 — Ordinea rândurilor nu e definită; 99 de rânduri la rând = Clava nu știe unde contează.**
Ce trebuie decis întâi nu e «cel mai mare consum», ci **unde alegerea schimbă banii**: diferența dintre cele două cifre
× km ai lunii = litri «în joc» (ex. 4.200 km × (19,4−18,0)/100 = 59 l). Sugestie: grupat pe uzină (așa gândește ea),
în uzină: nedecise sus, sortate după litrii în joc descrescător; decisele jos, estompate. Fără sortare pe coloane.

**M2 · medium · −1.0 — Nicio cale rapidă pentru 99 de mașini.**
Fapt din «Verificat pe viu»: media diferă de tip cu 9,1 % în medie, deci cam jumătate din mașini au cifrele apropiate.
Propunere: un singur buton deasupra uzinei: «Cifrele sunt apropiate (±5 %) la 23 de mașini — alege norma tipului la
toate». Pro: Clava rămâne cu ~50 de rânduri «reale»; pe cele apropiate alegerea nu schimbă aproape nimic în litri.
Contra: Ion a cerut «ea fie acceptă, fie nu» — o decizie în bloc nu e citită rând cu rând, iar «±5 %» ascunde o mașină
cu mulți km (5 % din 8.000 km × 18 l = 72 l). Condiții ca să fie corect: (1) pragul pe **litri în joc** (ex. < 20 l), nu
pe procent; (2) fereastră de confirmare cu lista plăcuțelor; (3) fiecare rând se scrie separat în istoric cu marcajul
«în grup»; (4) se poate schimba orice rând după aceea; (5) mașinile fără tip, cu «puțini km» sau cu «de verificat» nu
intră niciodată în bloc. Decizia dacă vrea butonul — întrebare pentru Ion/Clava; fără el, planul să estimeze ~99 de clicuri.

**M3 · medium · −1.0 — Clicul pe rând se bate cu butoanele din rând; starea decisă și schimbarea nu sunt descrise.**
Scenariu: rândul întreg deschide detaliul, iar butoanele de normă stau în el → apasă «Tipul» și i se deschide și
detaliul (sau, invers, vrea să citească și alege din greșeală). Sugestie: detaliul se deschide doar din zona din stânga
(plăcuța + săgeata ▸), butoanele opresc propagarea. Starea decisă: butonul ales plin bordo cu ✓, celelalte contur subțire;
coloana «Stare» = «aleasă: tipul» / «aleasă: cifra Clavei · 18,5» / «de decis». Schimbarea = apasă alt buton → se salvează
imediat, cu «anulează» 5 secunde (fără fereastră «sigur?» la fiecare din 99). Cine/când — doar în detaliu.

**L1 · low · −0.5 — Limbaj.** «l/100 faptic», «3 luni», «alta», «Stare», «repere» sunt ale noastre. Propunere:
coloana «Consum în sept.» (l la 100 km); butoanele «După tip 18,0» · «Media mașinii 19,4» · «Altă cifră…»; în detaliu
«Media mașinii = cât a consumat mașina asta în iul–sep: 2.910 l la 15.015 km». Fără EB, r_masina, medie3, «propunere»,
«îngheață». Semnul de > 3 % = «⚠ cifrele s-au schimbat după ce ai ales» (nu «propunerea s-a mișcat»). «puțini km» în
loc de «sub 3.000 km în bază».

**L2 · low · −0.5 — Ecran mic.** Paginile existente au `padding: 24px 32px` și tabel cu `overflowX: auto` → pe telefon
butoanele de alegere ies din ecran. Sugestie: sub ~700 px rândul devine card pe 3 linii (plăcuța + stare / km · litri ·
consum / cele trei butoane pe toată lățimea, ≥ 36 px înălțime), gutter 16 px. Clava lucrează pe birou, deci asta nu
blochează, dar butoanele de 24 px din agreare sunt prea mici pentru deget.

**L3 · low · −0.5 — Detaliul planificat e prea greu pentru «puțină informație».** «Zilele cu km și alimentările» ca
tabele = 30 + ~10 rânduri pe mașină. Sugestie: zilele = o bandă de 30 de bare (ca banda din agreare,
`AgreareClient.tsx:121-124`), alimentările = un rând de text «02.09 · 210 l, 09.09 · 195 l, …»; șoferii = mini-tabel
(nume, perioada, km, litri, ± l față de norma aleasă; dacă nu e aleasă — față de ambele). Plus un rând «Luna trecută:
după tip» — o ajută să fie consecventă.

Ce e bine: un rând pe mașină, 6 coloane, «alta» cu comentariu obligatoriu, butonul lipsă când nu există reperul,
filtrul pe uzine și contorul «de decis» — toate în stilul paginilor existente.

### Macheta

Sus (o linie de titlu, o linie de filtre):

```
Normele pentru septembrie 2026            km și litri 01–30.09        [ septembrie 2026 ▾ ]
[Toate] [Drăxlmaier] [SEBN] [LEAR Ungheni] [LEAR Florești]     [De decis 61] [Alese 38]   ▓▓▓▓▓░░░░ 38/99
```

Uzina, cu calea rapidă (dacă Ion/Clava o vor — M2):

```
DRĂXLMAIER · 49 mașini · de decis 31        [ La 12 mașini cifrele dau sub 20 l diferență — alege «După tip» la toate ]
```

Rând închis, nedecis (sortat după «în joc»):

```
 ▸ 446ASB  MAN Lion's    4.210 km   812 l   19,3      ( După tip 18,0 )  ( Media mașinii 19,4 )  ( Altă cifră… )   de decis · 59 l în joc
```

Rând închis, decis:

```
 ▸ 880RNK  Setra S415    3.870 km   690 l   17,8      [✓ După tip 18,0]   Media mașinii 17,1      Altă cifră…     aleasă: tipul
```

Rând fără tip / cu puțini km:

```
 ▸ 297LVY  —             1.140 km   230 l   20,2        fără tip         ( Media mașinii 19,0 · puțini km )  ( Altă cifră… )   de decis
```

«Altă cifră…» apăsat (se deschide sub rând, nu fereastră):

```
     Norma ta: [ 18,5 ] l la 100 km    De ce: [ urcă zilnic la Cobani, drum de pământ           ]   [Salvează]
     (scrie de ce — măcar câteva cuvinte; ne ajută să corectăm propunerile)
```

Rând deschis (click pe ▸ sau pe plăcuță):

```
 ▾ 446ASB  MAN Lion's    4.210 km   812 l   19,3      [✓ Media mașinii 19,4]  ( După tip 18,0 )  ( Altă cifră… )   aleasă: media mașinii
 ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ După tip 18,0 = norma MAN Lion's din nomenclator.                                                              │
 │ Media mașinii 19,4 = cât a consumat mașina asta în iul–sep: 2.910 l la 15.015 km.        Luna trecută: după tip      │
 │                                                                                                                 │
 │ Șoferii lunii                perioada     km      litri   față de norma aleasă                                  │
 │ Popescu Ion                  01–18.09   2.480     478      −3 l                                                  │
 │ Rusu Vasile                  19–30.09   1.730     334      +2 l                                                  │
 │                                                                                                                 │
 │ Km pe zile  ▂▅▆▆▅▁ ▆▆▅▆▆▁ ▅▆▆▆▅▁ ▆▆▅▆▆▁ ▆▆                                                                       │
 │ Plinuri     02.09 · 210 l · 09.09 · 195 l · 16.09 · 205 l · 23.09 · 202 l                                       │
 │ Ales de Clava, 08.10 10:42                                                                                      │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Telefon (sub ~700 px), același rând:

```
 446ASB · MAN Lion's                       de decis
 4.210 km · 812 l · 19,3 l/100
 [   După tip 18,0   ] [   Media mașinii 19,4   ]
 [              Altă cifră…               ]
```

Deduceri: H1 −2.0, M1 −1.0, M2 −1.0, M3 −1.0, L1 −0.5, L2 −0.5, L3 −0.5 = −6.5.

Scor: 3.5 · Blocante (critical/high): 1

## Review: senior-backend-engineer

Zona: migrația 528, acțiunile de server, detaliul leneș, plafonul de 1000, refolosirea codului, refactorul de rol.
Fapte noi (SELECT pe prod, 07.10): `lde_fuel_flota('2026-09-01','2026-09-30')` = 216 rânduri (sub 1000);
`lde_vehicle_gps_daily` pe septembrie cu km > 0 = 4.065 rânduri (peste 1000 → paginare obligatorie, ca în
`consum/actions.ts:91-103`); `lde_fuel_alimentari` pe septembrie = 2.257 rânduri (pe toată flota nu se citește direct).

**H1 · high (−3.0, gaură în drepturi) — `toggleOperatorActive` dezactivează ORICE cont, iar planul îl dă unui cont fără filtru IP.**
`numarare/tabs/operatorActions.ts:97-110`: verifică doar `ALLOWED_ROLES` (`:35`), apoi `update({active}).eq('id', id)` fără
filtru pe rolul țintei. Azi gaura o are doar ADMIN_CAMERE, care e în `IP_PROTECTED_ROLES` (`lib/ip-access-roles.ts:6-10`,
verificat în `(dashboard)/layout.tsx:12`). Pasul 2 o întinde pe CONTABIL_LDE, iar Ion a decis «de oriunde» (fără IP).
Scenariu: parola sau cookie-ul `clava@` scapă (rețea de acasă, 95.65.80.199) → un apel direct la acțiunea de server
`toggleOperatorActive('<id ADMIN al lui Ion>', false)` → contul lui Ion e dezactivat, sesiunile închise (migr. 428).
Corecție: în pasul 2, `toggleOperatorActive` și `getOperatorPrudence`/`createOperatorCamere` lucrează DOAR pe conturi cu
rol în `OPERATOR_ROLES` (`.in('role', …)` la update și refuz dacă ținta nu e operator). Altfel lărgirea nu se face.

**H2 · high (−2.0, defect de logică) — un singur predicat `esteAdminCamere` pentru trei mulțimi diferite.** Lista din
«Verificat pe viu» amestecă:
(a) accesul la numărare `NUMARARE_ROLES = ['ADMIN','ADMIN_CAMERE','OPERATOR_CAMERE']` (`numarare/actions.ts:117`, folosit prin
`requireRole(...NUMARARE_ROLES)` în **18** locuri: `:143,154,166,319,418,478,550,650,711,735,773,879,943,1089,1126` ș.a., nu în
locurile numărate de plan);
(b) privilegiul de admin camere (`:118`, `:297`, `:400`, `:917`, `auditActions.ts:9`, `salaryActions.ts:42`, `tariffActions.ts:79`,
`operatorActions.ts:35`);
(c) un FILTRU DE DATE, nu o verificare: `operatorActions.ts:46` `OPERATOR_ROLES = ['OPERATOR_CAMERE','ADMIN_CAMERE']` → `.in('role', …)` la `:56`.
Scenarii: înlocuirea mecanică la `:117` scoate OPERATOR_CAMERE → operatorii de la peron primesc «Acces interzis» la toate
cele 18 acțiuni, numărarea se oprește; înlocuirea la `:46` pune `clava@` (și orice CONTABIL_LDE) în fila «Operatori»,
ca operator de camere. Mai lipsește din listă `NumararePageClient.tsx:34` → fără el Clava cade pe ramura OPERATOR (`:43`,
doar «numarare, audit»), nu vede salariu/tarife/operatori; și `middleware.ts:68-71` (CONTABIL_LDE e tratat separat de
`NUMARARE_ONLY_ROLES`, `:23`) + `Sidebar.tsx:504-507` + `app/page.tsx:18`.
Corecție: `lib/roles.ts` cu DOUĂ predicate numite după capacitate — `poateNumara(role)` (a) și `esteAdminCamere(role)` (b),
fiecare incluzând ADMIN explicit; (c) rămâne listă de date, neatinsă. Rutele permise pe rol (`*_ALLOWED` din
middleware) se mută într-o funcție pură `caiPermise(role)`. Test vitest pe tabel rol × capacitate (toate cele 15
roluri din `users/actions.ts:109`): OPERATOR_CAMERE și EVALUATOR_INCASARI neschimbate, CONTABIL_LDE câștigă exact (a)+(b)
+ `/numarare`. «Testul pe isPublicPath/middleware existent» din pasul 2 nu există: `public-paths.test.ts` nu atinge
rolurile, iar middleware-ul n-are test.

**M1 · medium (−1.0) — istoricul în tabel separat scris din aplicație nu e atomic.** Două scrieri PostgREST (upsert în
`lde_norma_luna` + insert în istoric) nu stau într-o tranzacție: a doua pică → decizia rămâne fără urmă «pentru învățare».
Corecție: istoricul îl scrie un trigger `AFTER INSERT OR UPDATE` pe `lde_norma_luna` (copiază rândul NEW întreg); funcția
trigger-ului cu `REVOKE EXECUTE … FROM PUBLIC` (regula migr. 355/356 din memoria proiectului). Alternativa echivalentă:
un singur tabel append-only + vedere `DISTINCT ON (luna, vehicle_id) … ORDER BY decis_la DESC`. Trigger-ul e mai simplu
pentru `consum/actions.ts` (citește un rând, nu o vedere).

**M2 · medium (−1.5, sarcină fără estimare) — `getNorme` și detaliul leneș.** Dacă `getNorme` refolosește
`getConsumSoferi` (`consum/actions.ts:66`), fiecare deschidere trage `getAgreare` pe toată flota (5 interogări,
`agreare/actions.ts:64-70`) + 5 pagini GPS secvențiale (4.065 rânduri) + `lde_fuel_norma_eb` (510 ms). Iar dacă
`getDetaliuMasina(luna, vehicleId)` cheamă tot `getAgreare` ca să afle șoferii unei mașini, fiecare click costă toată
flota. Corecție: (1) extrage în `lib/lde/norma-luna.ts` partea pură (`kmZi`, `abatere`, calculul RandMasina/RandSofer din
`consum/actions.ts:58-64,108-144`) și un încărcător `incarcaRepere(db, luna, ids)` (flota + EB + tipuri), comun pentru
consum și norme; (2) `getNorme` = încărcătorul + deciziile salvate, FĂRĂ GPS pe zile; (3) agreații vin în payload-ul
`getNorme` (le are deja pentru «de verificat»), iar `getDetaliuMasina` citește doar GPS-ul și alimentările UNEI mașini
(≤ 31 + câteva zeci de rânduri, sub plafon, fără paginare). Estimare de scris în plan (ms la deschidere, ms la click).

**L1 · low (−0.5) — sursa reperelor înghețate.** «Reperele se îngheață în rândul deciziei» nu spune de unde: `decide`
le recalculează pe server (`lde_fuel_norma_eb(luna, [vehicleId])` + tipul), nu le primește de la client; altfel istoricul
«de învățat» poate conține cifre ale browserului. Tot aici: `ales='tip'` se refuză când tipul lipsește (297LVY).

**L2 · low (−0.5) — constrângeri în 528.** `CHECK (luna = date_trunc('month', luna)::date)` (altfel `2026-09-15` ocolește
UNIQUE); `decide` validează că `vehicleId` e mașină de uzină activă, nu camion (consum le exclude la `:109`); `LUNA_RE`
refolosit din `agreare/actions.ts:21`. Cere explicit `requireRole(session,'ADMIN','CONTABIL_LDE')` în fiecare acțiune
nouă — în `consum/actions.ts:67` rolul se verifică doar implicit, prin `getAgreare`.

**L3 · low (−0.5) — `getAlimentariMasina` nu se poate refolosi ca atare.** `combustibil/actions.ts:166-167` cere rol ADMIN
→ Clava ar primi «Acces interzis». Corecție: nucleul fără verificare de rol în `lib/lde/`, cu câte un înveliș pe rol în
fiecare `actions.ts`. (`.limit(3000)` la `:174,177` e tăiat oricum la 1000 de PostgREST; pe o mașină × o lună nu contează.)

Deduceri: H1 −3.0, H2 −2.0 (include lipsa testului de rol), M1 −1.0, M2 −1.5, L1 −0.5, L2 −0.5, L3 −0.5 = −9.0.

Scor: 1.0 · Blocante (critical/high): 2

## Review: security-auditor

Zona: drepturile (rolul CONTABIL_LDE lărgit, middleware, filtrul IP, tabelul nou, acțiunile de decizie).
Verificat: cod în worktree (fișier:linie mai jos) + SELECT prin MCP pe zqkzqpfdymddsywxjxow.

**C1 · critical (−3.0) · gaură în drepturi: `toggleOperatorActive` dezactivează ORICE cont, iar planul o dă unui cont fără filtru IP.**
`numarare/tabs/operatorActions.ts:97-112` verifică doar rolul apelantului (`ALLOWED_ROLES`, :35) și face
`admin_accounts.update({active}).eq('id', id)` fără vreun filtru pe rolul țintei — `getOperatorsCamere` (:49-57) filtrează
doar lista afișată, nu acțiunea. Azi defectul stă pe `camere@` (rol cu filtru IP pe pagini); planul (pasul 2, «toate
trec prin `esteAdminCamere`») îl mută pe `clava@`, care intră și din 95.65.80.199 și nu e rol IP-protejat.
*Scenariu:* cookie-ul Clavei e furat sau parola ei ghicită (cont fără 2FA, memoria «sesiuni admin revocabile»); atacatorul
ia id-ul server action-ului din chunk-urile publice `/_next/static` (excluse din matcher, `middleware.ts:95`), face POST
pe `/numarare` cu `Next-Action` → `toggleOperatorActive('<id admin@translux.md>', false)`; trigger-ul din migr. 428 crește
`session_version`, Ion și Mariana (ADMIN, verificat în `admin_accounts`) sunt scoși și nu mai pot intra; repararea cere SQL pe prod.
*Corecție în plan:* în pasul 2 se adaugă: `toggleOperatorActive` actualizează doar `.in('role', ['OPERATOR_CAMERE'])`
(și refuză dacă 0 rânduri), iar `createOperatorCamere` rămâne pe rol fix. Verificarea din «Verificare»: din contul Clavei,
toggle pe id-ul unui ADMIN → refuz.

**H1 · high (−2.0) · defect de logică: filtrul IP «camere doar din birou» (întrebarea 2) nu se poate face cum îl descrie planul și nu acoperă acțiunile.**
Filtrul IP rulează doar în `app/(dashboard)/layout.tsx:12` (singurul apelant al `checkRoleIpAccess`). (a) Layout-ul nu
știe calea, deci «CONTABIL_LDE doar pe /numarare» nu se poate pune acolo; adăugarea rolului în `IP_PROTECTED_ROLES`
(`lib/ip-access-roles.ts:6`) îi închide și normele de acasă. (b) Server action-urile se execută înaintea randării
layout-ului: niciuna din acțiunile `numarare/**` nu verifică IP-ul (grep `checkRoleIpAccess` = doar layout). Plus
`checkRoleIpAccess` e fail-open la eroarea RPC (`lib/ip-access.ts:68-71`).
*Scenariu:* Ion răspunde «da, camerele doar din birou»; implementarea pune verificarea în layout după un header de cale
sau în pagina `/numarare`; de acasă Clava (sau un cookie furat) cheamă direct `confirmTariffProposal`
(`tabs/tariffActions.ts:366`, prețurile biletelor) sau `resetAudit` (`auditActions.ts:83`) — mutația trece, filtrul
oprește doar randarea. Garanția pe care Ion o cere nu există.
*Corecție în plan:* pasul 2 primește un helper unic `requireCamereAdmin()` (sesiune + rol + IP pentru CONTABIL_LDE, cu
regulile rolului ADMIN_CAMERE sau o cheie proprie în `role_allowed_ips`) chemat în fiecare acțiune din `numarare/**`
și în `numarare/page.tsx`; layout-ul nu se atinge pentru CONTABIL_LDE. Dacă Ion răspunde «de oriunde», planul spune
explicit că tarifele/auditul/salariile devin accesibile din orice rețea.

**M1 · medium (−1.0) · `operatorActions.ts:46` nu e verificare de drepturi.** `OPERATOR_ROLES` e filtrul listei de
operatori (:56), nu autorizare; trecut prin `esteAdminCamere` o pune pe Clava în lista operatorilor (cu buton de
dezactivare pentru `camere@`). Scoate :46 din lista pasului 2; la fel `OperatorsTab.tsx:18` (etichetă). Atenție și la
`requireRole(...NUMARARE_ROLES)` (`actions.ts:143…1126`, ~20 apeluri) și `...AUDIT_ROLES/AUDIT_ENTRY_ROLES`
(`auditActions.ts:20…451`): primesc liste, nu funcție — corect e o constantă `ROLURI_ADMIN_CAMERE` folosită în liste, plus
un test grep că nu mai rămâne literal `'ADMIN_CAMERE'` în verificări (lista din plan, «~16 locuri», omite aceste apeluri).

**M2 · medium (−1.0) · gol de acoperire: testul de rol invocat nu există.** Planul cere «test pe `isPublicPath`/middleware
existent»; `public-paths.test.ts` testează doar căile publice, iar pentru rolurile din `middleware.ts:58-89` nu există
niciun test (`ls src/lib/*.test.ts`). Corecție: extrage verificarea în funcție pură `caleaPermisa(role, path)` cu test:
CONTABIL_LDE → `/lde/agreare/norme` ✓, `/numarare` ✓, `/numarareX` ✗, `/lde/combustibil` ✗, `/api/lde/camioane` ✗, `/users` ✗;
OPERATOR_CAMERE/ADMIN_CAMERE neschimbate. CONTABIL_LDE NU intră în `NUMARARE_ONLY_ROLES` (:23), altfel pierde LDE.

**M3 · medium (−1.0) · `lde_norma_luna_istoric` fără drepturi descrise.** Pasul 1 dă RLS + REVOKE doar tabelului
principal. Istoricul cere același `ENABLE RLS` + `REVOKE ALL FROM anon, authenticated`; dacă se scrie printr-o funcție
(trigger sau RPC pentru atomicitate), migrația pune `REVOKE EXECUTE … FROM PUBLIC` (memoria «drepturi implicite anon»:
funcțiile noi rămân executabile de anon; ex. `ip_allowed_for_role` e azi executabilă de anon, verificat). O funcție
SECURITY DEFINER care scrie decizii, lăsată pe PUBLIC, ar fi scriere anonimă în norme.

**L1 · low (−0.5) · validarea `decide` incompletă în text.** Pentru `tip`/`medie3` norma se ia din bază pe server, nu din
argument; `vehicleId` trebuie să fie în setul uzinelor (`vehicles.directions && UZINE`, ca în `agreare/actions.ts:68`), nu
orice uuid; `luna` cu `LUNA_RE`, nu în viitor; `norma` finită; `comentariu` plafonat (ex. ≤ 1000); `decis_de` =
`session.email`, nu argument. Spune și cine poate schimba o decizie «finală» (ADMIN? Clava până la închiderea lunii?).

**L2 · low (−0.3) · Sidebar.** `components/Sidebar.tsx:492-496`: pentru CONTABIL_LDE `filteredNav` cade pe `nav` (meniul
întreg); middleware-ul refuză, dar planul atinge oricum ramura — pune CONTABIL_LDE pe `[]` acolo.

Bune: rolul se ia din bază la fiecare cerere (`middleware.ts:47-53`, `lib/auth.ts:66-71`); tabelele LDE citite sunt
închise pentru anon (`lde_fuel_norma_eb`/`lde_fuel_flota` fără EXECUTE pentru anon, `admin_accounts` cu RLS fără politici);
acțiunile existente ale agrearii verifică rolul pe server (`agreare/actions.ts:50,151`).

Deduceri: C1 −3.0, H1 −2.0, M1 −1.0, M2 −1.0, M3 −1.0, L1 −0.5, L2 −0.3 = −8.8.

Scor: 1.2 · Blocante (critical/high): 2

## Review: business-logic-auditor — runda 2

Re-verificat doar fluxul decizie Clava → confirmarea lui Ion → poster (pașii 3 și 5), pe codul real:
`lib/lde/combustibil-poster.ts` (tot), `api/cron/lde-combustibil-poster/route.ts` (tot), `lde/combustibil/actions.ts:80-125`;
în bază (SELECT): `app_config` cheile `combustibil_poster_%` — `combustibil_poster_album_last = '2026-08'` (29.09),
grupa setată (`-1004401310712`, thread 5); deci septembrie N-a plecat încă și pleacă la 25.10.

**Observațiile mele din runda 1:** H (norma Clavei vs EB) — închisă prin întrebarea 3 și pasul 5; M2 (km LDE fără GPS)
— închisă (rând separat în detaliu); M3 (`decide` recalculează, istoric atomic) — închisă (recalcul pe server + trigger
în aceeași instrucțiune); L4 («peste» doar față de norma aleasă) — închisă (Ce facem 3); L5 (până când se schimbă) —
închisă (după confirmare doar ADMIN). Rămân defectele noi de mai jos, toate în fluxul confirmare → poster.

1. **high — criteriul de succes al trimiterii nu se potrivește cu ce întoarce funcția (−2.0).** Pasul 3 scrie
   `poster_trimis_la` «când trimiterea întoarce fără `error`», dar `trimitePostereCombustibil` întoarce o listă de
   `{grup, status: 'sent'|'skipped'|'error'}` și are trei ieșiri «skipped» fără nicio eroare: grupa nesetată
   (`combustibil-poster.ts:321`), «luna a plecat deja» (`:322`), «nimic în lună» (`:329`). Iar marcajul albumului se
   scrie la `:353` chiar dacă posterul general a căzut (`:350`). Scenariu: Ion confirmă septembrie; albumul pleacă,
   `combustibil_poster_album_last = '2026-09'`, generalul e refuzat de Telegram → `status:'error'` → `poster_trimis_la`
   NULL, corect. Ion apasă «Trimite din nou» (aceeași acțiune, fără `force`) → `:322` întoarce `skipped 'luna a plecat
   deja'`, fără eroare → `poster_trimis_la` se scrie, panoul arată «trimis», iar posterul general n-a ajuns niciodată în
   grupă. Cu `force` în schimb se dublează tot albumul. Același lucru dacă cheia grupei se șterge (`:321`): nimic trimis,
   panoul spune «trimis». Corecție în plan: succes = cel puțin un `sent`, niciun `error`, niciun `skipped` cu motivul
   «grupa nu e setată»; «Trimite din nou» retrimite DOAR grupurile cu `error` (`grupuri=[...]`, `force`) și, dacă lipsea
   introducerea, o trimite separat (cu `grupuri` parțial `:356` n-o mai trimite); marcajul `:353` să nu se scrie când
   generalul a căzut, sau să se scrie per grup.
2. **high — «citită la momentul trimiterii, nu din cache» nu e adevărat în codul de azi (−2.0).** Cache-ul e la nivel de
   modul cu cheia `` `${luna}:${cuLunaTrecuta}` `` (`combustibil-poster.ts:104-107`), iar curățarea de la `:320` face
   `flotaPeLuna.delete(opts.luna)` — cheie care nu există niciodată («2026-09» ≠ «2026-09:true»); intrarea lunii trecute
   («2026-08:false», `:116`) nici atât. Instanța caldă păstrează cifrele între apeluri. Scenariu: Ion confirmă septembrie
   → posterul pleacă cu deciziile de la 10:00 și umple cache-ul; la 10:20 ADMIN schimbă norma lui 345KAJ (exact cazul
   pentru care există `retrimitePoster`) și apasă «Retrimite» în aceeași instanță caldă → `citesteFlota` întoarce
   promisiunea veche → posterul retrimis are norma de dinainte, iar `poster_trimis_la` se rescrie ca și cum ar fi
   corect. La fel testul planului «`?preview=1` arată cifra ei» poate trece sau pica după instanță. Corecție în plan:
   pasul 5 spune explicit că `flotaPeLuna` se golește complet (`clear()`) la începutul `trimitePostereCombustibil` și la
   `?preview=1`, și că norma Clavei se citește în `citesteFlotaDinBaza` (`:113-120`), deci se aplică și lunii trecute
   folosite pentru escaladarea «investigație» (`:121,:153`).
3. **medium — `normaFinala` nu spune dacă depinde de confirmare (−1.0).** Tabelul «Verificat pe viu» (rândul 56) zice
   «după confirmare: norma Clavei», pasul 3 definește `normaFinala` = decizia dacă există, fără confirmare, iar pasul 5 o
   folosește pe `/lde/agreare/consum` și `/lde/combustibil`. Între decizia Clavei și confirmarea lui Ion, paginile
   arată deja norma ei, posterul încă nu; iar escaladarea lunii M folosește nivelul lunii M−1 (`:121`), care poate fi pe
   norma Clavei neconfirmată. Corecție: o propoziție — ori `normaFinala` ia decizia doar pentru luni confirmate
   (pagini și poster identice), ori paginile arată «norma Clavei, neconfirmată» până la confirmare.
4. **medium — `/lde/combustibil` nu lucrează pe lună (−1.0).** Perioada e liberă, implicit 01.01 → azi
   (`combustibil/actions.ts:83-84`), iar norma se ia `lde_fuel_norma_eb({luna: f})` (`:96`), adică luna primei zile.
   `normaFinala(luna)` nu are sens pe un an sau pe 10.09–05.10. Corecție: norma Clavei doar când `f..t` e exact o lună
   închisă; altfel EB, cu nota «norma Clavei se vede pe luna întreagă».
5. **low — textele și semnele posterului mint după decizie (−0.5).** Nota (`:217`, `:290`) și introducerea (`:301`)
   spun «Normă = consumul din cele 3 luni dinainte»; «!» (`:148`) e calculat din `r_masina` vs `r_tip` ai EB, deci pe o
   mașină unde Clava a ales «tip» posterul zice «normă umflată» lângă norma tipului; «*» (`:209`) marchează orice
   non-EB ca «veche». Corecție: `sursaNorma: 'clava'` cu semn propriu, fără «!» pe mașinile decise, legenda «Normă =
   aleasă de contabilitate; altfel 3 luni».
6. **low — cronul nu reîncearcă ce zice planul (−0.5).** Ruta ia doar `lunaTrecuta(azi)` (`route.ts:21`): o lună
   confirmată după 25 și eșuată nu mai e prinsă de niciun cron. Corecție: ori cronul caută toate lunile cu
   `confirmat_la` și `poster_trimis_la` NULL, ori planul scoate promisiunea și lasă doar butonul.
7. **low — termenul de livrare (−0.5).** `combustibil_poster_album_last = '2026-08'`: dacă poarta din pasul 5 nu e pe
   prod înainte de 25.10 08:00, crontab-ul VPS trimite septembrie pe norma EB, neconfirmat, iar marcajul devine
   «2026-09» — confirmarea lui Ion n-ar mai trimite nimic (`:322`) fără `force`. Corecție: în Verificare, «poarta pe
   prod înainte de 25.10», sau scoaterea temporară a liniei din crontab.

Deduceri: H1 −2.0, H2 −2.0, M3 −1.0, M4 −1.0, L5 −0.5, L6 −0.5, L7 −0.5 = −7.5.

Scor: 2.5 · Blocante (critical/high): 2
