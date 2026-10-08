# Încărcarea fișierelor Petrom și Intelect de către Clava

> Repo-ul e PUBLIC: în acest plan nu stau nume de persoane, numere de card sau sume negociate — portofelele se citează
> doar prin cod (ex. «0024»), mașinile prin plăcuță.

## De ce

Ion, 08.10.2026: «Aceste sunt 2 standarte fișiere care Claudia trebuie să aibă posibilitatea să încarce în programul nostru
cu DT. Acum introduse de mine în LDE.» + «trebuie să legăm QR codurile …, și anume clientul parc, cu sistemul nostru, și să
automatizăm introducerea informației primare»; «un fișier e Petrom, xls e Intelect». Azi alimentările de la Petrom și din
Intelect (stații Peco) se bat de mână în foile LDE, iar cardurile de rezervă Petrom nu ajung pe nicio mașină.

## Ce facem

**Deciziile lui Ion (08.10, AskUserQuestion):**
1. Pagina `/lde/agreare/combustibil` (Clava, rol CONTABIL_LDE, și ADMIN): încarcă fișierul **Petrom** (`.txt`) sau
   **Intelect** (`.xls`, «Оборот по кошелькам клиента детальный по всем АЗС»); formatul se recunoaște singur.
2. **Fișierul devine sursa** — foile LDE ale acelorași alimentări nu se mai numără (pasul 5).
3. **Portofelul Intelect** (QR-ul clientului parc) se leagă o dată: `sofer` · `masina` · `grup` · `rezerva` · `strain`.
4. **Portofel pe șofer → mașina din ziua alimentării**: (1) agrearea Clavei; (2) altfel mașina de pe foaia de parcurs LDE
   a șoferului în ziua aceea; (3) altfel «de legat». Atribuirea activă NU se folosește (Ion: «Agrearea, apoi foaia LDE a
   zilei»; verificat: atribuirile sunt vechi — un șofer are pe hârtie 412BRAY, pe foaie 217RST).
5. **Portofel de grup** (ex. «0378», mașinile Drăxlmaier din Sîngerei): fiecare alimentare pe mașina noastră care era la
   stația Peco la ora aceea, din GPS; unde nu e una singură — «de legat» (Ion: «GPS: mașina de la stație»).
6. **Rezervele** (Petrom pe **număr de card**, ex. cardul cu numele «REZERVA 8»; Intelect «REZERVA-microbuse»): tabel cu
   perioade «→ mașină, șofer sau în afara flotei (cu nume)», ținut de Clava; la urgență se schimbă doar tranzacția.
7. **Doar motorina** intră în consumul mașinii; benzina 95, AdBlue și portofelele `strain` stau în tabelul importului
   (vizibile pe pagină), nu în `lde_fuel_strain` (pe care `fuel-strain-worker.mjs:101-105` îl golește noaptea).

**Variante respinse:** compararea cu LDE fără înlocuire («fișierul devine sursa»); legătura fixă portofel→mașină și
atribuirea activă (date vechi); potrivirea foii pe fiecare tranzacție (Intelect sparge un plin în 2–9 tranzacții — vezi
revizorul business: ar dubla ~24.500 l/lună).

## 🔬 Verificat pe viu

| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Formatul Petrom | `file`, `iconv -f UTF-16` | UTF-16 LE, CRLF, tab, antet rusesc; ora fără fus (locală); virgulă zecimală; 144 de rânduri pe sept. | parser + fus Europe/Chisinau |
| Petrom = foaia `pz_cd` | sumă pe card vs `lde_fuel_foaie` | 4 din 4 mașini egale la 0,01 l | excluderea `pz_cd` pe perioada fișierului |
| Rezervele Petrom | aceeași | ≈ 2.300 l pe carduri «REZERVA …», pe nicio mașină | litri noi |
| Formatul Intelect | SheetJS pe `.xls` (revizori backend + business) | blocuri pe portofel; tranzacție = rând cu data dd.mm.yyyy h:mm:ss în col. 2 **și** cantitate în col. 12 (pe rândurile de serviciu col. 2 e prețul); 3 secțiuni de sumar, 4 celule «Total final»; produse: motorină 40.965,55 l + AdBlue + benzină; 93 de tranzacții de 0 l; 14 coliziuni la minut | parser pe blocuri, filtru produs, cheie cu secunde + ordinal |
| Intelect ↔ foi LDE | potrivire pe mașină și zi (business) | Intelect = `pz_u` (Ungheni), `pz_i` (Drăxlmaier Sîngerei), parte din `pz_camcer`; `pz_c` NU (0/553); pe tranzacție ±0,5 l se potrivesc 6.523 l, pe suma zilei 31.035 l | excludere pe **suma mașină×zi** |
| Șoferii din portofele | `drivers`, `lde_active_assignments`, `lde_agreare_sofer` | 10 din 20 de nume nu sunt în `drivers`; 3 au atribuire activă; agrearea = 0 rânduri | legare prin agreare → foaia LDE a zilei |
| Cititorii foii LDE | grep (backend + business) | `lde_fuel_flota` (3 locuri), `lde_fuel_plin_la_plin`, `lde_fuel_norma_eb`, `lde_fuel_consumatori`, `norme/actions.ts:133-135`, `km-zilnic`, `combustibil/actions.ts` | filtrul trebuie în TOȚI |
| Limita de încărcare | `next.config.js`, mărimea fișierului | server actions = 1 MB implicit; Intelect sept. = 917.504 B; Vercel ≤ 4,5 MB | route handler propriu, plafon 4 MB |
| Biblioteca xlsx | `npm ls xlsx`, `npm audit` (securitate) | 0.18.5 cu GHSA-4r6h-8v6p-xvw6 și GHSA-5pgg-2g8v-p4x9, fără fix pe npm | 0.20.3 de pe cdn.sheetjs.com în `apps/admin` |
| Repo public | `gh repo view` (securitate) | PUBLIC | fără fixtures reale, fără nume în plan |
| Ultima migrație | `ls packages/db/migrations` | 532 ocupat (bilete) | migrațiile noi: 533+ |

## Pași

1. **Migrația 533** (tabele, toate cu RLS fără politici + REVOKE ALL de la anon/authenticated):
   - `lde_fuel_import (id, sursa 'petrom'|'intelect', fisier_nume, sha256, de, pana, randuri, litri_dt, incarcat_de,
     incarcat_la, anulat_la)`;
   - `lde_fuel_portofel (sursa, cod, nume_fisier, tip 'sofer'|'masina'|'grup'|'rezerva'|'strain', driver_id, vehicle_id,
     nume_lde text (textul exact al șoferului pe foile LDE, confirmat de Clava), categorie, legat_de, legat_la,
     UNIQUE(sursa, cod))` + `lde_fuel_portofel_istoric` (trigger: cine, când, vechi → nou);
   - `lde_fuel_rezerva_perioada (sursa, cod, de, pana, vehicle_id, driver_id, persoana_text, nota)`, EXCLUDE pe interval
     pe același cod;
   - `lde_fuel_import_leg (import_id, external_id, PK(import_id, external_id))` — o tranzacție poate veni din două fișiere
     suprapuse (săptămânal + lunar); e **activă** cât timp o susține cel puțin un import neanulat;
   - `lde_fuel_statie (sursa, nume_fisier, lat, lon, confirmat)` — coordonatele stațiilor (Peco Ungheni, Bacioi,
     Sîngerei, Meșterul Manole, Gordoe, Bălți; Petrom P86-Florești, P21-Soroca, P67-Briceni), puse și verificate pe hartă la
     implementare; stație fără coordonate confirmate → legarea GPS dă `de_legat`;
   - `lde_fuel_foaie_decizie (vehicle_id, zi, sursa, decizie 'dublura', decis_de, decis_la, PK(vehicle_id, zi, sursa))` — pasul 5;
   - `lde_fuel_import_rand (external_id UNIQUE, sursa, cod, alimentat_at timestamptz, zi_local date, litri,
     pret, reducere, suma, statie, produs, este_dt bool, vehicle_id, driver_id, stare 'legat'|'de_legat'|'strain'|'non_dt',
     legat_prin 'portofel'|'agreare'|'foaie_lde'|'gps'|'rezerva'|'manual', motiv)` — istoric pe schimbarea legării.
2. **Parserele**, pure, în `lib/lde/combustibil-fisiere.ts` (primesc rândurile, nu fișierul):
   - Petrom: UTF-16 → rânduri tab; cheia cardului = numărul; ora interpretată Europe/Chisinau;
   - Intelect: SheetJS **0.20.3** cu `cellFormula:false`, `sheetRows` ≤ 20.000, verificare semnătură OLE (D0 CF 11 E0)
     înainte; tranzacție = col. 2 dată completă + col. 12 număr; produsul din blocul «Услуга»; ora Europe/Chisinau;
     totalurile motorinei parsate trebuie să bată sumarul pe produs (altfel refuz cu mesaj);
   - `external_id = sursa:cod:data-ora-secunde:litri:ordinal` (ordinal = al câtelea rând identic în fișier) → fișiere
     săptămânale și lunare care se suprapun dau aceleași chei (upsert, nu dublură); rândurile de 0 l se sar.
   - teste pe **fișiere sintetice** generate de un script (aceeași structură, coduri și nume inventate); testul pe
     fișierele reale citește din afara repo-ului (`.orca/drops`, în .gitignore) și se sare când lipsesc.
3. **Încărcarea**: `app/(dashboard)/lde/agreare/combustibil/incarca/route.ts` (sub calea Clavei, nu `/api`), rol verificat
   explicit, plafon 4 MB (verificat și în browser, mesaj în română), parsare pe server, apoi **o singură funcție SQL**
   `lde_fuel_import_aplica(jsonb)` (o tranzacție: import + rânduri + legare + scriere) cu `REVOKE EXECUTE FROM PUBLIC`.
4. **Legarea** (în aceeași funcție, refolosită la orice schimbare): portofel `masina` → mașina; `sofer` → agreare, apoi
   foaia LDE a zilei (rândul `lde_fuel_foaie` cu același șofer în ziua aceea), altfel `de_legat`; `grup` → GPS (mașina
   noastră oprită ≤ 300 m de stație în ±20 min, `lde_gps_stops`), altfel `de_legat`; `rezerva` → perioada; `strain` →
   stare `strain`. Foaia LDE a zilei: rândul `lde_fuel_foaie` cu `sofer` = `nume_lde` confirmat al portofelului (normalizat: fără
   diacritice, spații, majuscule); dacă șoferul apare pe **două mașini** în ziua aceea sau numele nu e confirmat →
   `de_legat`. GPS: oprire ≤ 300 m de coordonatele confirmate ale stației, ±20 min; exact o mașină a noastră, altfel
   `de_legat`.
   **Proiecția în `lde_fuel_alimentari`** e întreținută de o singură funcție SQL `lde_fuel_import_sincronizeaza(de, pana)`
   chemată la finalul fiecărei schimbări (import, anulare, re-legare, corecție manuală, salvarea agreării), în aceeași
   tranzacție cu schimbarea: din starea curentă (rânduri `legat` + `este_dt` + active) face upsert pe `(source, external_id)` (cheia reală a tabelului) și
   **șterge** rândurile `source in ('petrom','intelect')` care nu mai sunt eligibile (anulate, devenite `strain`/
   `de_legat`). Corecțiile manuale (`legat_prin='manual'`) nu sunt suprascrise de re-legare. Un job de noapte (după
   `lde-alim-worker`, care poate muta sau șterge foi) **re-evaluează toate legările automate** (`agreare`, `foaie_lde`,
   `gps`, și `de_legat`) din ultimele 60 de zile — nu doar `de_legat` — păstrând `manual`, apoi rulează proiecția; dacă
   legarea unui rând se schimbă, apare în istoricul legării. **Agreare ambiguă**: dacă șoferul are în ziua aceea mai multe
   mașini distincte în `lde_agreare_sofer` (perioade suprapuse), rândul devine `de_legat` cu motivul «agreat pe 2 mașini»,
   fără fallback pe foaia LDE.
   **Agrearea**: `salveazaAgreare` citește lista VECHE a mașinii înainte de scriere și cheamă re-legarea pe reuniunea
   șoferilor vechi ∪ noi pentru luna aceea (inclusiv la ștergerea completă sau schimbarea perioadelor).
5. **Fără dublură** (pe sursă, pe acoperire): foaie → sursă: `pz_cd` → Petrom; `pz_u`, `pz_i`, `pz_camcer` → Intelect;
   `pz_c` și restul → nicio sursă (nu se ating). Vederea `lde_fuel_foaie_ef` dă fiecare foaie cu
   **`litri_ef = litri − acoperit`**, unde `acoperit` = litrii importați activi (`este_dt`, `legat`) din **aceeași sursă**,
   pe **aceeași mașină**, în ziua foii **±1 zi**, alocați în ordinea zilelor (o tranzacție acoperă o singură dată, primele
   foi întâi). Foaia complet acoperită dispare; restul real (ex. bon cash la altă stație — ~31 % din `pz_i` în sept.,
   verificat de revizorul business r2: 065LTL își păstrează 1.177 l) rămâne. Foaia editată în LDE se recalculează singură
   (vederea nu ține litri fixați). Pe pagină: «în LDE peste fișier: X l» (informativ) și, opțional, «E dublură» →
   `lde_fuel_foaie_decizie (vehicle_id, zi, sursa, decizie='dublura')` care pune restul acelei chei pe 0 (poate doar să
   scadă, niciodată să adauge — nu poate dubla). Decizia se aplică **doar cât timp** există cel puțin o alimentare
   importată activă din aceeași sursă pe acea mașină în ziua ±1; la anularea ultimului import care o susține, foaia
   revine întreagă (decizia rămâne în istoric, inactivă).
**Toți cititorii** trec pe
   vedere: `lde_fuel_flota`, `lde_fuel_plin_la_plin`, `lde_fuel_norma_eb`, `lde_fuel_consumatori`, `norme/actions.ts`,
   `km-zilnic/actions.ts`, `combustibil/actions.ts` (migrația 534 + codul). `pz_c` nu se atinge (nu e Intelect).
6. **Pagina** `/lde/agreare/combustibil` (macheta revizorului ux-clava): starea lunii pe cele două fișiere; încărcare;
   rezumat (rânduri, litri DT, «total bate»); «De legat» **pe portofel**, cu «Confirmă toate propunerile» (propunere doar
   din plăcuță; numele nu se potrivesc automat); «Șofer fără mașină în zi» cu legătură spre agreare; rezervele cu
   perioade; «În LDE, dar nu în fișier» cu «E alimentare reală» / «E dublură»; istoricul cu «Anulează încărcarea».
   Bara laterală a Clavei primește pagina (`Sidebar.tsx:511`).
7. **Automatizare** (separat, după acces): dacă Intelect/Petrom trimit raportul pe e-mail sau au portal, același parser.

## Fișiere

- `packages/db/migrations/533_lde_fuel_import.sql`, `534_lde_fuel_foaie_ef.sql` — noi
- `apps/admin/package.json` — `xlsx` 0.20.3 (cdn.sheetjs.com)
- `apps/admin/src/lib/lde/combustibil-fisiere.ts` + `.test.ts` + generatorul de fișiere sintetice
- `apps/admin/src/app/(dashboard)/lde/agreare/combustibil/{page.tsx,actions.ts,CombustibilImportClient.tsx,incarca/route.ts}`
- `lde/agreare/norme/actions.ts`, `lde/km-zilnic/actions.ts`, `lde/combustibil/actions.ts`, `lde/agreare/actions.ts`
  (re-legarea la agreare), `components/Sidebar.tsx`

## Riscuri

- **Dublură** LDE + fișier → norme umflate: excluderea pe suma zilei, vederea în toți cititorii, raportul «în LDE, dar nu în
  fișier»; Ion confirmă luna pe panoul normelor după ce vede.
- **Analizele LEAR/SEBN** (`sebn-liber.mjs:178`, `lear-analiza.mjs:867`) citesc ora alimentării: ora corectă (fus local) le
  face mai precise; se rulează o dată după primul import și se compară.
- **Clava mută litri** (ex. portofel → `strain`): istoricul legării + lista vizibilă lui Ion pe pagină.
- **Format schimbat**: refuz cu mesaj clar, nu ghicit. **Fișier fals**: semnătura + versiunea reparată a bibliotecii.

## Verificare

- teste SQL (BEGIN … ROLLBACK pe prod, ca la migr. 528/529): foaie 60 l pz_u + 40 l pz_cd, import Intelect 60 l →
  total zi 100 l; foaie 100 l, import 60 l → 60 + 40 rest = 100 l; foaie pe 03.09, tranzacția pe 02.09 23:50 → acoperită
  (±1 zi); foaie `pz_i` fără tranzacție → rămâne întreagă; tranzacție legată manual a doua zi → totalul nu crește;
  «E dublură» → anularea ultimului import → foaia revine la 100 l; două importuri suprapuse, unul anulat → decizia rămâne
  activă; foaia LDE mutată de pe mașina A pe B după import → noaptea legarea trece pe B, A nu mai are litrii; foaia ștearsă →
  `de_legat`; același șofer pe două mașini în agreare → `de_legat` cu motiv; anularea importului readuce foaia și scoate
  alimentarea (o singură dată); aceeași tranzacție în două importuri, anularea unuia → rămâne activă; șofer scos din
  agreare → re-legat din foaie sau `de_legat`.
- vitest pe parsere (fișiere sintetice): cheia cu ordinal, rânduri 0 l sărite, produs non-DT, fus orar (30.09 22:59 →
  30.09 local), totalul care nu bate → refuz.
- local, pe fișierele reale (în afara repo-ului): Petrom 144 rânduri și sumele pe card = `pz_cd`; Intelect motorină
  40.965,55 l.
- după import în prod (sept.): litrii lunii în `lde_fuel_flota` pe 849BRAN neschimbați (pz_cd scos, Petrom adăugat);
  total flotă vs înainte: crește doar cu rezervele și cu ce lipsea din LDE; același fișier de două ori → 0 rânduri noi.

## Întrebări pentru Ion

Răspunse în «Ce facem» (08.10: Reovis = portofelele din Intelect; fișierul devine sursa; șofer → agreare, apoi foaia LDE;
rezerve în tabel cu perioade; grup → GPS; `.xls` = Intelect).

## Triaj business-logic-auditor — runda 2

| id | sev. | esență | decizie | motiv |
|---|---|---|---|---|
| 1 | high | scoaterea întreagă pe tip pierde ~4.600 l/lună din `pz_i` | acceptat | pasul 5: `litri_ef = litri − acoperit` pe sursă, mașină, ±1 zi |
| 2 | high | «Adaugă diferența» cu litri fixați → dublură | acceptat | pasul 5: eliminat; doar «E dublură» (poate doar scădea) |
| M | medium | granița zilei (12 rânduri `pz_u`) | acceptat | ±1 zi |
| M | medium | foaia LDE sosită după import | acceptat | pasul 4: jobul de noapte re-leagă `de_legat` |
| L | low | cheia `(source, external_id)` | acceptat | pasul 4 |

## Critic extern - runda 3 (ultima)

Codex: scor 9.0 (inconsistent cu Σ 1,5 → 8,5), **verdict pass**, 0 critical/high.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | medium | ciclul de viață al «E dublură» la anularea importului | acceptat | pasul 5: decizia se aplică doar cât există un import activ care o susține; 2 teste noi |

Gate: zero critical/high deschise la ambele părți.

## Critic extern - runda 2

Codex: scor 7.0, verdict fail, 1 high (consistent).

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | legările din foaia LDE nu se re-evaluează când foaia se corectează | acceptat | pasul 4: jobul de noapte re-evaluează TOATE legările automate (nu doar `de_legat`), păstrând `manual`; teste pe mutare/ștergere |
| C2 | low | agreare suprapusă pe 2 mașini | acceptat | pasul 4: `de_legat` cu motiv, fără fallback |

## Critic extern - runda 1

Codex: scor 3.0 (inconsistent: Σ 7,5 → 2,5), verdict fail, 3 high cu scenariu și dovadă.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | dublura fără cheia sursei + acoperire parțială | acceptat | pasul 5: foaie→sursă, scoatere pe sursă și perioadă, «Adaugă diferența» doar cu litrii diferenței |
| C2 | high | anularea / re-legarea nu retrag proiecția; import N:M | acceptat | pasul 1 (`lde_fuel_import_leg`) + pasul 4 (`lde_fuel_import_sincronizeaza`, ștergerea neeligibilelor, manualele păstrate, job de noapte) |
| C3 | high | re-legarea uită șoferii scoși din agreare | acceptat | pasul 4: reuniunea vechi ∪ noi |
| C4 | low | UUID ↔ textul șoferului din LDE | acceptat | pasul 1 (`nume_lde` confirmat) + pasul 4 (două mașini → de_legat) |
| C5 | low | coordonatele stațiilor | acceptat | pasul 1 (`lde_fuel_statie`) + pasul 4 |

## Triaj revizori Claude — runda 1

| revizor | id | sev. | esență | decizie | motiv |
|---|---|---|---|---|---|
| security | C | critical | fișiere reale în repo public | acceptat | pasul 2: fișiere sintetice; reale doar local; plan fără nume |
| security | H | high | xlsx 0.18.5 vulnerabil | acceptat | pasul 2: 0.20.3 + semnătură + opțiuni stricte |
| security | M | medium | limita 5 MB inexistentă | acceptat | pasul 3: route handler sub calea Clavei, 4 MB |
| security | M | medium | Clava mută litri fără urmă | acceptat | pasul 1: istoric legare; listă vizibilă lui Ion |
| security / backend / business | L | low | 532 ocupat | acceptat | 533–534 |
| security / backend | L/H3 | high | external_id coliziuni | acceptat | pasul 2: secunde + ordinal; 0 l sărite |
| backend | C1 | critical | `lde_fuel_strain` golit de worker | acceptat | Ce facem 7: non-DT și strain rămân în tabelul importului |
| backend / business | H1 / 3 | high | excluderea doar în 1 din 7 cititori | acceptat | pasul 5: vedere `lde_fuel_foaie_ef` în toți |
| backend / business | H2 / 1 | high | ±0,5 l pe tranzacție nu prinde plinul spart | acceptat | pasul 5: pe suma mașină×zi, ±1 l |
| backend | H4 | high | fusul orar | acceptat | pasul 2: Europe/Chisinau |
| backend / ux | H5 / H | high | 1 MB la server action | acceptat | pasul 3 |
| backend | H6 | high | import neatomic + plafon 1000 | acceptat | pasul 3: o funcție SQL, o tranzacție |
| business | 2 | high | atribuirea activă greșită | acceptat | Ion 08.10: agreare → foaia LDE a zilei |
| business | 4 | high | `pz_cd` scos pe lună, nu pe perioadă | acceptat | pasul 5: pe perioada fișierului |
| business | M | medium | `pz_c` nu e Intelect; `pz_i` e | acceptat | pasul 5 |
| business / backend | M | medium | AdBlue, benzină, 0 l, sumare multiple | acceptat | pasul 2 |
| business | L | low | portofel de grup | acceptat | Ion: GPS (pasul 4) |
| backend | M1 | medium | re-legarea după agreare | acceptat | pasul 4 |
| backend | L3 | low | Petrom pe număr de card | acceptat | Ce facem 6 |
| ux | M | medium | rezervă «în afara flotei»; listă pe portofel; acțiuni pe «în LDE, nu în fișier»; anulare | acceptat | pașii 1, 6 |
| ux | L | low | bara laterală; mesaje | acceptat | pasul 6 |
| business | M | medium | analizele LEAR/SEBN se schimbă | acceptat | Riscuri |
| business | L | low | `benzol_n` numără fragmente | acceptat (notat) | `mediaSoft` folosește alimentările distincte pe (mașină, zi) — în implementare |


> Secțiunile revizorilor de mai jos sunt pe versiunea ANTERIOARĂ a planului; deciziile sunt în «Triaj revizori Claude — runda 1». Numele de persoane au fost înlocuite cu <nume> (repo public).

## Review: ux-clava

Zona: ecranul de încărcare și de legare pentru Clava (contabilă, nu tehnică). Stilul de referință: `lde/agreare/norme/NormeClient.tsx`
(alb + bordo, rânduri dense în grilă, butoane-pastilă `alegere()`, eroarea roșie sub rând, stil inline).

**HIGH (−2.0) — fișierul PECO de o lună lovește limita de 1 MB a server action-ului.** Dovada: `.orca/drops/Оборот по кошелькам
клиента детальный по всем АЗС.xls` are **917.504 B** pentru septembrie (30 de zile, 41.012 l); `apps/admin/next.config.js:2` nu are
`experimental.serverActions.bodySizeLimit`, deci implicitul Next e 1 MB. Scenariu: în octombrie (31 de zile) sau într-o lună cu mai multe
alimentări fișierul trece de 1.048.576 B → Clava apasă «Încarcă» și primește «Body exceeded 1 MB limit» în engleză, fără nimic salvat;
nu are ce face. Pe deasupra, «max 5 MB» din pasul 5 e peste limita de corp a funcției Vercel (4,5 MB). Corecție: `bodySizeLimit: '4mb'`
în `next.config.js` (sau route handler cu `formData()`), limita din plan = 4 MB, verificarea mărimii **în browser** înainte de trimitere
cu mesaj în română («Fișierul are 6,2 MB; PECO dă de obicei ~1 MB — e fișierul bun?»).

**MEDIUM (−1.0) — rezerva legată de o persoană din afara flotei nu are unde sta.** `lde_fuel_rezerva_perioada` are doar `driver_id`,
`vehicle_id`, `nota`. «Rezervă 3 = <nume>, sora» și «nu toate rezervele sunt legate de o unitate» → perioada fără șofer și fără mașină:
softul n-o poate trata nici ca legată, nici ca «în afara flotei», deci tranzacțiile Rezervei 3 cad lunar în «de legat». Corecție: coloană
`tip ('sofer'|'masina'|'strain')` și pe perioadă; «strain» → `lde_fuel_strain`, cu numele în notă. (Dovada doar din textul planului → nu blochează.)

**MEDIUM (−1.0) — «o alegere pe rând» trebuie să fie pe PORTOFEL, nu pe tranzacție, plus confirmarea propunerilor în bloc.** Prima lună
toate cele 36 de portofele + ~7 rezerve sunt noi → 3.564 de rânduri `de_legat`. Planul nu spune explicit că lista se grupează pe portofel.
Corecție: un rând = un portofel (cod, numele din fișier, nr. tranzacții, litri, propunerea softului); butonul «Confirmă toate propunerile
(N)» sus, iar Clava schimbă doar ce e greșit; numele ambigue («<nume>», «<nume>») vin FĂRĂ propunere, ca să nu fie confirmate din greșeală
în bloc. Corectarea pe o tranzacție (urgența) se face din detaliul portofelului ▸, nu din lista principală.

**MEDIUM (−1.0) — mașina «din atribuirea activă» rămâne înghețată dacă agrearea vine după import.** `lde_agreare_sofer` are 0 rânduri azi
(tabelul «Verificat pe viu»); dacă Clava încarcă PECO pe 03.10 și face agrearea pe 05.10, litrii portofelelor-șofer stau pe mașina din
atribuirea activă, iar normele ies greșite. Corecție: rândurile cu mașina «propusă» se recalculează la salvarea agreării lunii (sau mașina
se deduce la citire), iar ecranul le arată cu eticheta «după atribuire — agrearea lunii nu e făcută» + link spre `/lde/agreare?luna=`.
Pe pagina normelor: rând de stare «Petrom: încărcat 03.10 · PECO: lipsește» înaintea butonului de confirmare a lunii.

**MEDIUM (−1.0) — «în LDE, dar nu în fișier» doar se arată; încărcarea nu se poate anula.** Fără o acțiune, aceeași listă reapare în
fiecare lună și Clava n-are cum s-o închidă; iar un fișier încărcat pe luna greșită nu se poate scoate (sha-ul îl blochează și la
reîncărcare). Corecție: pe fiecare foaie rămasă două butoane — «E alimentare reală (nu e în fișier)» / «E dublură, scoate-o»; perechile
aproape-potrivite (Δ 0,5–5 l sau ziua vecină) marcate «posibil aceeași»; în istoric, «Anulează încărcarea» (șterge rândurile importului,
doar ADMIN sau în aceeași zi).

**LOW (−0.5) — meniul Clavei e filtrat pe href.** `components/Sidebar.tsx:511` lasă la CONTABIL_LDE doar `/lde/agreare/norme` și
`/lde/agreare`; fără `/lde/agreare/combustibil` în filtrul acela, pagina e accesibilă (middleware permite prefixul, `lib/roles.ts:21`), dar
Clava n-o vede în meniu. Planul trebuie să numească linia.

**LOW (−0.5) — textele de eroare nu sunt scrise.** Trebuie fixate în plan, în română, fără termeni tehnici:
- format necunoscut: «Nu recunosc fișierul. Încarcă raportul Petrom (.txt) sau «Оборот по кошелькам… детальный» de la PECO (.xls).»
- total care nu bate: «Am citit 40.980,10 l, fișierul spune 41.012,58 l. Nu am salvat nimic — trimite fișierul lui <nume>.»
- același fișier: «Fișierul acesta a fost încărcat deja pe 03.10 de Clava (PECO, 01–30.09).»
- fișier nou care se suprapune cu unul vechi: «312 alimentări existau deja și au fost sărite; 41 noi.» (nu eroare).

### Macheta (ASCII)

```
┌ Combustibil din fișiere ───────────────────────────────── [septembrie 2026 ▾] ┐
│ agrearea șoferilor · normele lunii                                            │
│                                                                                │
│ ┌ Încarcă fișierul ────────────────────────────────────────────────────────┐ │
│ │  [ Alege fișierul… ]  Petrom .txt sau PECO .xls · până la 4 MB           │ │
│ │  Petrom sept.: ✓ 03.10 · 144 rânduri · 2.636 l     PECO sept.: — lipsește│ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│ ┌ PECO · 01–30.09 · 3.564 rânduri · 41.012,58 l · 1.420.527 lei ✓ total bate┐ │
│ │ ● 2.918 legate singure   ● 412 de legat (9 portofele)   ● 18 benzină      │ │
│ │ ● 216 în afara flotei    ● 7 foi LDE fără pereche în fișier               │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│ DE LEGAT · 9 portofele                         [ Confirmă toate propunerile (6) ]│
│ ▸ COD    NUME ÎN FIȘIER        TRZ   LITRI  ESTE                               │
│ ▸ 0024   <nume>            41   1.210  (Șofer)(Mașină)(Rezervă)(În afara) │
│                                             șofer: [<nume> ▾] propunere ✓ │
│ ▸ 0076   HMK 135                33   2.050  (Mașină) [HMK135 ▾] propunere      │
│ ▸ 0031   <nume>                12     380  (Șofer) [caută șoferul… ▾] ⚠ 2 <nume>│
│ ▸ D02380 <nume>            3      90  (În afara flotei) ✓                │
│ ▸ B00459 REZERVA-microbuse      14     420  → perioadă lipsă: [Adaugă perioada]│
│                                                                                │
│ ȘOFER FĂRĂ MAȘINĂ ÎN ZI · 2                                                     │
│   <nume> V. · 14.09, 15.09 · 120 l      mașina: [ 054MLD ▾ ]  [Pune]         │
│   → «după atribuire» = 3 rânduri; agrearea lunii nu e făcută → deschide        │
│                                                                                │
│ REZERVE (perioade)                                         [+ Perioadă nouă]   │
│   REZERVĂ          CINE                         DE LA     PÂNĂ LA   NOTĂ       │
│   Petrom 8         Mașină 034BRAT               01.06.26  —         stabil     │
│   Petrom 2         Mașină 146BRAZ (Florești)    01.09.26  —                    │
│   Petrom 3         În afara flotei: <nume>   01.01.26  —         sora       │
│   PECO microbuse   Șofer <nume> V.            10.09.26  20.09.26  [✎] [×]    │
│   (suprapunere → «Rezerva 8 are deja 034BRAT de la 01.06 — închide-o întâi»)   │
│                                                                                │
│ ▸ ÎN LDE, DAR NU ÎN FIȘIER · 7 foi (pz_c 4, pz_u 3)                            │
│   054MLD  12.09  pz_c  60,0 l  Bacioi   ≈ fișier 12.09 59,2 l?                  │
│                            (E alimentare reală) (E dublură, scoate-o)          │
│                                                                                │
│ ▸ ISTORIC: 03.10 Petrom sept. · Clava · 144 r · 2.636 l     [Anulează]         │
└────────────────────────────────────────────────────────────────────────────────┘
```

Note la machetă: alegerea tipului cu pastilele `alegere()` din NormeClient; după alegere apare câmpul potrivit (select cu căutare
`datalist` de șofer / mașină, text liber pentru «în afara flotei»); rândul rezolvat dispare din «de legat» cu `router.refresh()`,
contorul din rezumat scade. Litrii în format ro-RO (`nr()`), datele zz.ll. Secțiunile «În LDE…» și «Istoric» închise implicit.

Scor: 3.0 · Blocante (critical/high): 1

## Review: security-auditor

Fapte verificate: `gh repo view` → `popionnutu-tech/TRANSLUX` **PUBLIC**; `node_modules/xlsx/package.json` → 0.18.5,
`npm audit` → GHSA-4r6h-8v6p-xvw6 (prototype pollution la citirea unui fișier, reparat în 0.19.3) + GHSA-5pgg-2g8v-p4x9
(ReDoS, reparat în 0.20.2), «No fix available» pe npm (reparațiile sunt doar pe cdn.sheetjs.com); xlsx nu e importat azi
în niciun cod de server (grep) — planul îl aduce pentru prima dată pe calea de upload. `lde_fuel_alimentari`: RLS activ,
0 politici, `vehicle_id NOT NULL`, `UNIQUE(source, external_id)`; o citesc fără filtru pe `source` `lde_fuel_flota`,
`lde_fuel_norma_eb`, `lde_fuel_plin_la_plin`, `norme/actions.ts:133`, `km-zilnic/actions.ts:56`, `lear-analiza.mjs:867`,
`sebn-liber.mjs:178`. Middleware: CONTABIL_LDE doar pe `/lde/agreare*` și `/numarare*` (`middleware.ts:69`, `roles.ts:22`).
`next.config.js` fără `serverActions.bodySizeLimit` (implicit 1 MB). `packages/db/migrations/532_bilete_proba_fizica.sql` există.

1. **CRITICAL (−3.0) — fixture-urile reale ajung într-un repo PUBLIC.** Pasul 2: «fișierele reale, copiate în
   `test/fixtures` fără nume de persoane în afara flotei». Scenariu: commit + `push HEAD:main` → pe GitHub, pentru oricine
   și pentru totdeauna (istoria git): numerele cardurilor Petrom, codurile portofelelor PECO (QR-ul clientului PAT 9 BRICENI),
   numele șoferilor din flotă (rămân, doar cei «din afară» se scot), plăcuțele, prețul și **reducerea negociată cu PECO**
   (−396.228,49 lei/lună) și volumul lunar. Date personale (Legea 133) + secret comercial + identificatori de plată.
   Același lucru, mai mic, în textul planului însuși (<nume>, «<nume>», <nume>) care va fi comis în `docs/plans/`.
   **Corecție:** fixture-uri SINTETICE generate de un script (aceeași structură: UTF-16/tab, blocuri PECO, antet, «Total
   final» recalculat), carduri/coduri/nume/prețuri inventate; fișierele reale doar local, în afara repo-ului, cu un test
   `skipIf(!existsSync(...))` care verifică totalurile 41.012,58 / 1.420.527,14; numele reale scoase din plan înainte de commit.
2. **HIGH (−2.0) — SheetJS 0.18.5 cu CVE-uri cunoscute, pe server, pe intrare din afară.** Scenariu: Clava primește pe
   e-mail un «Оборот по кошелькам….xls» fals (phishing sau cont PECO compromis) și îl încarcă; parsarea din acțiunea de
   server poluează `Object.prototype` în instanța caldă Vercel a panoului — orice cod ulterior din aceeași instanță care
   citește o cheie lipsă dintr-un obiect (`opts.x`, `row.role`, filtre «falsy = fără restricție») primește valoarea
   atacatorului, până la repornire; sau un fișier ReDoS blochează funcția până la timeout. **Corecție:** dependența
   `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` (nu 0.18.5 de pe npm), declarată în `apps/admin/package.json`
   (azi e doar în rădăcină); `XLSX.read(buf, { type:'buffer', dense:true, cellFormula:false, cellHTML:false, cellStyles:false,
   sheetRows: 10000 })`; înainte de parsare — magic bytes (`D0 CF 11 E0` pentru .xls, `FF FE` pentru UTF-16 Petrom), extensia
   și mărimea; exact o foaie, altfel refuz. Rezultatul parsat trece prin validare strictă (dată, numere finite, litri 0 < x < 1.000).
3. **MEDIUM (−1.0) — limita de 5 MB nu există, iar calea alternativă e închisă pentru Clava.** Acțiunile de server au 1 MB
   implicit; ridicarea globală `serverActions.bodySizeLimit: '5mb'` lărgește și acțiunile publice (proba biletelor fără login).
   O rută `/api/...` ar fi redirecționată pentru CONTABIL_LDE de `middleware.ts:69`. **Corecție:** măsurați `.xls`-ul real;
   dacă trece de 1 MB — `route.ts` sub `app/(dashboard)/lde/agreare/combustibil/incarca/` cu `verifySession` + `requireRole('ADMIN','CONTABIL_LDE')`
   și citirea corpului cu limită explicită (refuz peste 5 MB înainte de `arrayBuffer()` complet), fără limită globală.
4. **MEDIUM (−1.0) — Clava poate muta sau ascunde litri fără urmă.** Legarea portofelului (`legat_de/legat_la` se
   suprascriu la relegare), «în afara flotei» și corectarea pe tranzacție schimbă `vehicle_id` în `lde_fuel_alimentari`,
   care intră nefiltrat în normă, plin-la-plin, km-zilnic și analizele LEAR/SEBN. Scenariu: un portofel de șofer marcat
   «strain» scoate sute de litri din consumul mașinii — abaterea de la normă dispare, nimeni nu vede. **Corecție:** tabel
   de istoric append-only (`lde_fuel_legare_istoric`: cine, când, cod/rând, vechi → nou, motiv obligatoriu); tipul «strain»
   și orice corectare după confirmarea normei lunii → mesaj la ADMIN; corectarea pe rând ține `vehicle_id` original în rând.
5. **LOW (−0.5) — migrația 532 e deja ocupată** (`532_bilete_proba_fizica.sql`, aplicată); `db-migrate.sh` refuză
   versiunea ocupată, deci nu se pierde nimic, dar planul trebuie renumerotat (533+, și cea peste `lde_fuel_flota`).
6. **LOW (−0.5) — idempotența.** `sha256 UNIQUE` se ocolește schimbând un octet (inofensiv, fiindcă `external_id` dedublează),
   dar `external_id = sursa:cod:data-ora:litri` contopește două alimentări reale identice în același minut pe același
   card de rezervă (a doua dispare tăcut). **Corecție:** adăugați indexul rândului în bloc / stația în cheie și raportați
   coliziunile pe ecran în loc de `ON CONFLICT DO NOTHING` tăcut.

Bine în plan: RLS fără politici + REVOKE + `REVOKE EXECUTE FROM PUBLIC`; rolul verificat în fiecare acțiune (pe lângă
middleware, `auth.ts:52-91` ia rolul din bază); fișierul original nu se păstrează; nicio legare automată pe nume; React
escapează numele din fișier (fără `dangerouslySetInnerHTML` — de păstrat așa).

Scor: 2.0 · Blocante (critical/high): 2

## Review: senior-backend-engineer

Zona: implementarea (schema, parsere, upload, legare, excluderea foilor, plafonul de 1000, teste). Fapte din repo,
din baza de prod (SELECT prin MCP) și din cele două fișiere reale (SheetJS din `node_modules/xlsx`, scripturi în scratchpad).

**C1 — critical (−4.0) · rândurile «strain» / benzină din fișiere se pierd peste noapte.**
Pasul 3 trimite benzina 95 și portofelele «în afara flotei» în `lde_fuel_strain`. (a) Tabelul are
`CHECK (sursa IN ('benzol','benzol2','foaie'))` (verificat în `pg_constraint`; `433_lde_fuel_strain.sql:13`) — insertul cu
`sursa='petrom'|'peco'` pică, iar planul nu lărgește CHECK-ul. (b) Dacă CHECK-ul se lărgește, `fuel-strain-worker.mjs:101-105`
(rulat noaptea din `run-nightly.sh:46`) șterge din `lde_fuel_strain` TOT ce are `zi >= azi-45` și n-a venit din benzol/foaie,
**fără filtru pe sursă**. Scenariu: Clava încarcă septembrie pe 08.10 → 20 de rânduri BENZINA 95 Petrom + «D02380 PETRU
<nume>» intră în strain → la 09.10 noaptea worker-ul le șterge; fișierul nu se mai poate reîncărca (sha256 UNIQUE).
*Corecție:* fie tabel propriu (`lde_fuel_import_rand` cu `stare` ajunge — strain-ul din fișiere se citește de acolo), fie
lărgirea CHECK + `.in('sursa', ['benzol','benzol2','foaie'])` la selecția din `fuel-strain-worker.mjs:102`, în același commit.

**H1 — high (−2.0) · excluderea foilor acoperă 1 din 6 cititori.**
`lde_fuel_foaie` e citită în prod de funcțiile `lde_fuel_flota`, `lde_fuel_plin_la_plin`, `lde_fuel_norma_eb` (`prosrc`
verificat) și în TS de `lde/km-zilnic/actions.ts:112`, `lde/agreare/norme/actions.ts:135`, `lde/combustibil/actions.ts:175`.
În `lde_fuel_flota` singură sunt 3 CTE-uri (`f`, `lk`, `cal` — `453_lde_fuel_camioane_cursa.sql:35,56,65`). Scenariu: după
importul PECO, 0076 HMK 135 (Ungheni, `pz_u`) are litrii din fișier ȘI din foaie în `/lde/km-zilnic`, în detaliul agreării
normelor și în plin-la-plin → normă umflată exact ce riscul 1 vrea să evite. Varianta «în `lde-alim-worker`» e mai rea: excluderea
acolo = rândul nu se mai scrie → stale-delete-ul de la `lde-alim-worker.mjs:93-100` îl șterge definitiv, iar raportul
«în LDE, dar nu în fișier» și o re-legare ulterioară a Clavei n-au pe ce lucra; în plus fereastra worker-ului e de 45 de zile.
*Corecție:* excluderea se calculează la citire într-un singur loc — o vedere `lde_fuel_foaie_efectiva` (sau coloana
`inlocuita_de_import uuid` pusă/scoasă de funcția de import și de re-legare) — și toți cei 6 cititori trec pe ea; `lde-alim-worker`
rămâne neatins. Lista cititorilor intră în «Fișiere».

**H2 — high (−2.0) · potrivirea foaie↔fișier pe tranzacție cu |Δ| ≤ 0,5 nu prinde alimentările sparte.**
Foaia LDE are UN rând pe zi și mașină (`432_lde_fuel_foaie.sql`, `zi` fără oră); PECO sparge o alimentare în mai multe tranzacții
(plafon ~4.450 lei): portofelul 0001, 13.09 seara — 130,04 + 62,39 + 7,00 l în 4 minute; în tot fișierul 483 de perechi
«același portofel, același minut». Scenariu: foaia `pz_u` are 199,43 l → nicio tranzacție nu e la ±0,5 → foaia rămâne → 199,43 l
numărați de două ori. *Corecție:* compară **suma pe (mașină, zi)** a importului cu suma foilor pe (mașină, zi), toleranță pe sumă;
ziua în ora Chișinăului (vezi H4).

**H3 — high (−2.0) · `external_id` nu e unic.**
Cu cheia propusă `peco:<cod>:<data-ora>:<litri>` la precizie de minut, fișierul de septembrie are **14 coliziuni**, inclusiv cu litri
nenuli: `0003 | 19.09 13:01 | 1,21 l` ×2, `0014 | 19.09 13:01 | 5,68 l` ×2, plus 12 perechi de tranzacții de 0 l (93 de rânduri cu
0 l în total). La secundă (serialul Excel are fracțiuni de secundă) coliziunile sunt 0 azi, dar nu e garanție. Scenariu: insert simplu
→ `23505` și importul cade; `ON CONFLICT DO NOTHING` → 1,21 l pierduți în tăcere, iar verificarea «Total final» trece (se face pe
parsare, nu pe ce a intrat). Separat: `lde_fuel_import_rand.external_id UNIQUE` global face ca un fișier săptămânal urmat de cel
lunar (perioade suprapuse, sha256 diferit) să nu-și poată scrie rândurile comune — planul nu spune ce se întâmplă.
*Corecție:* `external_id = <sursa>:<cod>:<ISO la secundă în ora locală>:<litri>:<nr. de ordine în grupul identic>`; rândurile cu 0 l
se sar explicit (numărate în rezumat); după scriere se verifică `sum(litri)` din bază = totalul parsat; semantica suprapunerii:
rândul existent se păstrează (cu legarea Clavei), `import_rand` se leagă N:M de importuri sau ține `prima_incarcare_id`.

**H4 — high (−2.0) · fusul orar nu e tratat.**
Petrom dă `2026-09-30 22:59:00` fără fus; PECO dă serial Excel (`46279.9499…`) în ora locală. Serverul Vercel e pe UTC:
`new Date('2026-09-30 22:59:00')` / conversia directă a serialului dau 22:59Z = **01.10 01:59** la Chișinău. Scenariu: «BR AN 849,
30.09 22:59, 37,61 l» trece în octombrie → iese din fereastra lunii în `lde_fuel_flota`, se compară cu foaia de 01.10, iar «șoferul
zilei» se caută pe 01.10. *Corecție:* parserul întoarce data-ora locală ca text, conversia la `timestamptz` se face cu
`Europe/Chisinau` (în SQL: `(ts AT TIME ZONE 'Europe/Chisinau')`), test pe o tranzacție de după 21:00 și pe una din noaptea
schimbării orei (25.10).

**H5 — high (−2.0) · upload-ul prin server action nu trece de limite.**
Next 15.5 (`apps/admin/package.json`) are `serverActions.bodySizeLimit` implicit **1 MB**; `next.config.js` nu-l setează; în
admin nu există niciun upload de fișier (grep `formData()`/`type="file"` = 0) — deci nu e un tipar deja probat. Fișierul PECO pe
septembrie are **917.504 B** pe 30 de zile; o lună cu mai multe portofele/tranzacții sau base64 (+33 %) trece de 1 MB → «Body
exceeded 1 MB limit». «Max 5 MB» din pas 5 e oricum peste plafonul Vercel de 4,5 MB pe cerere. *Corecție:* `serverActions:
{ bodySizeLimit: '4mb' }` în `next.config.js` (sau route handler `app/api/admin/lde/combustibil/import/route.ts` cu
`request.formData()`), limită declarată 4 MB, verificată în client ÎNAINTE de trimitere și pe server pe `file.size`; `.xls` citit cu
`file.arrayBuffer()` → `XLSX.read(buf, { type: 'array' })`, `.txt` decodat explicit `new TextDecoder('utf-16le')` după BOM.

**H6 — high (−2.0) · importul nu e atomic și lovește plafonul PostgREST.**
Pasul 3 face cel puțin 4 scrieri separate (`lde_fuel_import`, `lde_fuel_import_rand` 2.382 rânduri, `lde_fuel_alimentari`,
strain) + citiri de legare (`.in('external_id', [...2382])` = URL de sute de KB → 414; orice `select` fără `.range()` se oprește la
1000 — memoria proiectului, și `km-zilnic/actions.ts:85` paginează exact din cauza asta). Scenariu: antetul cu `sha256 UNIQUE` intră,
scrierea rândurilor cade (timeout de funcție / 414) → Clava reîncarcă și primește «fișier deja încărcat», cu jumătate de lună în
bază. *Corecție:* parsarea rămâne în TS (pură), scrierea e **o funcție SQL** `lde_fuel_import_aplica(p_meta jsonb, p_randuri jsonb)`
— o tranzacție: antet + rânduri + legare (portofel, perioada rezervei, agrearea zilei) + alimentări + verificarea sumei; `REVOKE
EXECUTE FROM PUBLIC`, `GRANT` doar `service_role`. Ecranul citește rezumatul agregat din SQL și lista «de legat» paginată.

**M1 — medium (−1.0) · legarea șofer→mașină îngheață o propunere.**
`lde_agreare_sofer` are 0 rânduri; `lde_active_assignments` are 105 active din 108 în total — istoric practic inexistent, deci
«atribuirea activă» = mașina de AZI aplicată pe septembrie. Decizia e a lui <nume>, dar planul nu spune (a) dacă rândul legat din
propunere intră în `lde_fuel_alimentari` sau stă `de_legat`, (b) ce se întâmplă când Clava completează agrearea DUPĂ import —
alimentările rămân pe mașina veche. *Corecție:* `import_rand.vehicle_id` + `legat_prin ('agreare'|'atribuire'|'clava'|'portofel')`;
funcția de re-legare rulează la salvarea agreării lunii și mută doar rândurile cu `legat_prin='atribuire'`.

**M2 — medium (−1.0) · regulile parserului PECO din plan sunt insuficiente.**
(a) «rândul tranzacției = data în col. 2» prinde și rândurile «Услуга :Motorina EURO», care au **prețul** în col. 2 (32,5); tranzacția
e `col0 == null && serial > 40000 && col12 numeric`. (b) Fișierul are după detalii **3 secțiuni de sumar** și **4 celule «Total final»**
în coloane diferite (r.3072 col 7, r.3114 col 7/11, r.3116 col 13, r.3563 col 13/16/18); sumarul are cod în col 0 și nume în col 1 —
seamănă cu un antet de bloc. Parserul se oprește la primul «Total final» și verifică fiecare bloc pe «Итого по услуге» (col 12/19).
(c) Servicii: Motorina EURO 2.379, **Benz.Stand.95 2, Ad Blue Pompa 1 (47,03 l)** — AdBlue nu e DT, dar e în «Total final»; stațiile
includ și «Peco Balti, str. Calea Iesilor» (1.645 l), lipsă din tabelul verificat. Petrom: antetul conține literal «Удалить продукт»,
nu are coloană de sumă (suma = litri × preț, rotunjire de spus) și nici total de control.

**M3 — medium (−1.0) · fixture-uri cu date personale în repo.**
Nu există `test/fixtures` în admin — convenția e `*.fixture.json` lângă test (`lib/lde/drax-*.fixture.json`). Fișierul PECO real are
nume complete de șoferi (<nume>, <nume>…) și numere de card Petrom; repo-ul se împinge pe GitHub. «Fără nume în afara flotei» nu
ajunge — și șoferii sunt persoane. *Corecție:* separă adaptorul (`citesteXls(buf) → celule[][]`, `decodeazaUtf16`) de parserul pur
(`parsePeco(celule)`, `parsePetrom(linii)`); fixture = JSON anonimizat generat o dată din fișierul real (nume → «Șofer 01», cod
păstrat, totaluri păstrate); testul pe fișierul real rămâne script local necomis.

**M4 — medium (−1.0) · efect nedeclarat asupra analizelor LEAR/SEBN.**
`sebn-liber.mjs:178`, `sebn-parcare/sebn-dump.mjs:186`, `lear-analiza.mjs:867` citesc `lde_fuel_alimentari.alimentat_at` fără filtru
pe `source` ca să scuze ocolul spre stație (motivul pentru care foaia fără oră NU intră acolo — `432_lde_fuel_foaie.sql:9-11`).
Alimentările PECO Ungheni/Sîngerei vor schimba km-ii «de ocol» ai LEAR și SEBN la următoarea rulare. Probabil corect, dar trebuie
spus în plan și verificat pe o săptămână înainte/după.

**L1 — low (−0.5) · numărul migrației 532 e ocupat:** `532_bilete_proba_fizica.sql` e în repo și aplicat
(`schema_migrations` 20261008084330). `db-migrate.sh:65-69` refuză, deci nu e pierdere — doar renumerotare 533/534.

**L2 — low (−0.5) · `xlsx` 0.18.5 doar în `package.json` din rădăcină**, nu în `apps/admin/package.json`; 0.18.5 are
CVE-2023-30533 (prototype pollution, reparat în 0.19.3) și CVE-2024-22363 (ReDoS, 0.20.2); npm a rămas la 0.18.5. Pentru parsare pe
server: dependență în admin din tarball-ul oficial SheetJS ≥ 0.20.3. Încărcătorul e de încredere, deci low.

**L3 — low (−0.5) · cheia Petrom:** col. 1 «Карта» (ex. 2551) e numărul cardului, col. 2 e textul («REZERVA 28», «BR AS 603»);
`lde_fuel_portofel.cod` = numărul cardului, textul doar pentru afișare și propunere — de scris explicit.

Bine în plan: parsere pure separate de transport; refuz la total care nu bate; RLS + REVOKE; sha256 pentru același fișier;
nicio legare automată pe nume.

Deduceri: 4,0 + 6 × 2,0 + 4 × 1,0 + 3 × 0,5 = 21,5 → scorul se oprește la 0.

Scor: 0.0 · Blocante (critical/high): 7

## Review: business-logic-auditor

Zona: fluxul litrilor (foile LDE → `lde_fuel_foaie`, import → `lde_fuel_alimentari`) până la `lde_fuel_flota`, norme, poster,
panoul Clavei, camioane. Verificat pe date: fișierul PECO parsat (SheetJS) = 2.382 tranzacții, 40.965,55 l DT; foile sept. din
`lde_fuel_foaie` (pz_u 19.360, pz_i 14.735, pz_camcer 11.481, pz_c 30.128 l); `drivers` + `lde_active_assignments` (doar SELECT).
Scripturile de probă: scratchpad-ul sesiunii (`peco2.cjs`, `match.cjs`, `m3.cjs`).

**1. HIGH (−2.0, defect de logică) — regula «o tranzacție cu |Δlitri| ≤ 0,5» nu prinde dublura.** PECO sparge fiecare alimentare
în 2–9 tranzacții de câteva minute (plafonul portofelului; la Ungheni scara 19,69 → 8,92 → 4,03 → 1,81 → 0,83), iar foaia are un
rând pe zi cu suma. 260 din 511 zile-portofel au ≥ 6 tranzacții. Pe septembrie: regula din plan scoate din foi doar **6.523 l**;
potrivirea pe **suma zilei** scoate **31.035 l** (pz_u 16.638, pz_i 7.122, pz_camcer 7.275). Diferența, **~24.500 l, s-ar număra
de două ori** în `lde_fuel_flota` (453:24-27, 39-47, 52-59) → l/100 km, abaterea Clavei, posterul și `lde_fuel_norma_eb` (447, învață
3 luni, deci dublura se propagă în normele lunilor următoare). Scenariu: 145BRAZ (<nume>) 03.09 — foaia pz_u 35,34 l; PECO
05:40–05:43 (12,01+5,43+2,48+1,13+0,49) + 22:28–22:30 (7,89+3,56+1,62+0,73) = 35,34; nicio tranzacție nu e la 0,5 l de 35,34 →
ziua are 70,68 l. La camioane la fel (HMK135 03.09: 6 tranzacții, 966,46 vs foaie 916,46 — greșeală de tastare 50 l în LDE; RWN193
−50 l): ambele rămân, iar o zi PECO diferită de ziua foii adaugă și o graniță de cursă în `cal`/`ctr` (453:61-72, ION-162).
**Corecție:** potrivire pe sumă (portofel × zi locală, cu tranzacțiile de după miezul nopții până la ~04:00 lipite de ziua
precedentă — <nume> 18+19.09 = 37,83 = foaia, <nume> 57,00+2,54 = 59,54, <nume> 47,10+11,36 = 58,46). Mai simplu și conform
deciziei «fișierul devine sursa»: pe perioada importului, foile rețelei (pz_u, pz_i integral; pz_camcer pe mașinile cu portofel
PECO) ies întregi pentru mașinile acoperite de fișier, iar diferențele zi cu zi se arată Clavei ca «LDE ≠ fișier» (nu se adună).

**2. HIGH (−2.0, presupunere neverificată despre sursa legăturii) — «șofer → mașina din agreare, altfel atribuirea activă»
nu ține pe date.** `lde_agreare_sofer` are 0 rânduri (confirmat). Din cei 20 de șoferi cu portofel PECO, **10 nu există deloc în
`drivers`** (<nume>, <nume>, <nume>, <nume>, <nume>, <nume>, <nume>, <nume>, <nume>, <nume>) și doar 3 au atribuire activă.
Unde există, e greșită pentru o lună trecută: «0009 <nume>» → atribuirea activă = **412BRAY** (din 24.08), dar foaia sept. pune
<nume> pe **217RST** (1.242,67 l). Scenariu: importul pune 1.167,70 l pe 412BRAY (mașina greșită), foaia 217RST nu are
pereche și rămâne → litri dublați pe flotă și consum fals pe două mașini. <nume> a mers pe 3 mașini în sept. (043BRAU,
283BRAT, 458BRAX), <nume> pe 2 (069MLD, 298RQR). **Corecție:** sursa principală a legăturii șofer → mașină pe zi = **chiar foaia
LDE a zilei** (`lde_fuel_foaie.sofer` + `vehicle_id` + `zi`, pz_u/pz_i) — e exact ce face <nume> azi de mână; agrearea Clavei bate
foaia; atribuirea activă doar ca propunere pentru luna curentă și numai cu `valid_from ≤ zi`. Adaugă rândul în «Verificat pe viu».

**3. HIGH (−2.0, defect de logică / drift între rapoarte) — excluderea doar în `lde_fuel_flota` + worker lasă alți 7 cititori
direcți ai `lde_fuel_foaie` cu dublura.** Citesc foaia direct: panoul Clavei ▸ `agreare/norme/actions.ts:133-135`
(getDetaliuMasina — alimentările zilei afișate de două ori față de cifra din rând, care vine din `lde_fuel_flota`),
`km-zilnic/actions.ts:112`, `lde/combustibil/actions.ts:175`, `lde_fuel_plin_la_plin` (443:20-24, plinul camioanelor),
`lde_fuel_norma_eb` (447:45-49 și 134-138, CTE proprii, nu prin `lde_fuel_flota`), `lde_fuel_consumatori` (435:88-94).
Scenariu: după import, Clava deschide 145BRAZ: rândul spune X l, detaliul arată fiecare zi de două ori; norma EB din octombrie
învață din litri dublați chiar dacă `lde_fuel_flota` e reparată. **Corecție:** o singură decizie la nivel de date — coloană
`lde_fuel_foaie.inlocuit_de` (id import/rând) scrisă la import (și curățată la reimport/ștergere), plus filtrul
`inlocuit_de IS NULL` în TOȚI cititorii de mai sus (sau o vedere `lde_fuel_foaie_efectiv` care îi înlocuiește); lista completă în
«Fișiere». `lde-alim-worker` face upsert fără coloana nouă, deci marcajul supraviețuiește (verifică la implementare).

**4. HIGH (−2.0, defect de logică) — «pz_cd întreagă pentru lunile cu import Petrom» + pasul 6 «sau săptămânal».** Scenariu:
Clava încarcă Petrom 01–07.10 → pz_cd 08–31.10 iese din calcul fără înlocuitor → litrii Petrom ai lunii scad cu ~¾ până la
următoarea încărcare (posterul de luni / norma la închiderea lunii pot pleca pe cifra greșită). **Corecție:** excluderea pe
`[perioada_de, perioada_pana]` din `lde_fuel_import`, nu pe lună; la fel pentru PECO.

**5. MEDIUM (−1.0) — harta foaie ↔ rețea din plan e greșită.** pz_c (Chișinău, 553 rânduri / 30.128 l) are **0 potriviri** cu
PECO — șoferii ei (Copaci, Apostol, Frumusache, Magalu…) nu au portofel; stațiile PECO Chișinău (Meșterul Manole, Bacioi) sunt
doar ale camioanelor → pz_camcer. În schimb **pz_i** (Drăxlmaier Sîngerei/Gordoe: <nume>, <nume>, <nume>, <nume>, <nume>)
e PECO și lipsește din «Ce facem». Efect: «în LDE, dar nu în fișier» se umple cu toate cele 553 de rânduri pz_c. **Corecție:**
tabel fix foaie → rețea (pz_u, pz_i → PECO; pz_camcer → PECO doar pe mașinile cu portofel; pz_cd → Petrom; pz_c → în afara
importului) și raportul de diferențe doar pe foile rețelei importate.

**6. MEDIUM (−1.0) — produsele PECO.** Fișierul are și «Ad Blue Pompa» (47,03 l, LJN 076) și «Benz.Stand.95» (NSX 192); «Total final»
41.012,58 îi include. Planul filtrează benzina doar la Petrom. **Corecție:** listă albă `Motorina*` pentru `lde_fuel_alimentari`,
restul în `lde_fuel_strain`/stare `non_dt`; verificarea pe «Total final» se face pe toate produsele, înainte de filtru. Plus 93 de
tranzacții de 0 l — nu se scriu.

**7. MEDIUM (−1.0) — ora alimentării are cititori care o folosesc ca fapt GPS.** `sebn-liber.mjs:178` și `lear-analiza.mjs:867`
citesc `alimentat_at` din `lde_fuel_alimentari` ca să recunoască ocolul spre stație (432:9-11 explică de ce foaia NU intră acolo).
Datele PECO sunt seriale Excel în ora locală, Petrom text local: planul nu spune conversia `Europe/Chisinau` → UTC (o eroare de 3 h
mută alimentările de după 21:00 în ziua următoare și strică și potrivirea pe zi de la #1). Iar un rând legat pe mașina greșită
(#2) «justifică» un ocol care nu a existat. **Corecție:** conversie explicită + test pe 22:28 local; la `lear-analiza`/`sebn-liber`
— doar rândurile cu legătură confirmată (nu «propunere»).

**8. LOW (−0.5) — portofel de grup.** «0378 Singerei-masini DRA» (65 tranzacții, 2.155 l) alimentează mai multe mașini; nu încape în
cele 4 tipuri și ar cere 65 de alegeri de mână. Tip `grup` (mașinile + alegere propusă din foaia pz_i a zilei).

**9. LOW (−0.5) — numărul migrației.** `packages/db/migrations/532_bilete_proba_fizica.sql` există deja (origin/main) → 533.

**10. LOW (−0.5) — `benzol_n` numără tranzacții.** Cu PECO, `count(*)` din 453:21 crește de 5–9 ori; `mediaSoft`
(`agreare/norme/actions.ts:46-47`) trece pragul `PRAG_ALIMENTARI` pe fragmente, nu pe alimentări. Numără zilele cu alimentare
(sau grupează tranzacțiile la ≤ 15 min) și redenumește în UI «benzol» → «alimentări».

Pozitiv: Petrom ↔ pz_cd e exact (4/4 mașini), rezervele Petrom sunt litri noi; septembrie nu are luni confirmate
(`lde_norma_luna*` goale), deci importul retroactiv nu lovește decizii înghețate — dar planul trebuie să spună ce se întâmplă cu o lună
confirmată (refuz sau recalcul cu urmă în `lde_norma_luna_istoric`).

Scor: -2.5 · Blocante (critical/high): 4

## Review: business-logic-auditor — runda 2

Zona: doar pasul 5 (scoaterea foilor pe sursă și perioadă, «Adaugă diferența») și pasul 4 (proiecția, re-legarea, foaia
LDE cu `nume_lde`). Verificat pe date: tranzacțiile motorinei din fișierul Intelect sept. (parsate în runda 1) față de foile
sept. din `lde_fuel_foaie` (pe plăcuță sau numele din portofel, aceeași zi și ±1 zi); `pg_proc`/`pg_class` pentru cititorii
vii ai foii; `lde_fuel_alimentari` pe `source` (doar `benzol` și `benzol2` azi). Probele: scratchpad-ul sesiunii
(`r2probe.cjs`, `r2probe2.cjs`).

**Răspuns la întrebare — foi `pz_u`/`pz_i`/`pz_camcer` fără nicio tranzacție Intelect (aceeași mașină/șofer, ziua ±1):**

| foaie | rânduri / litri sept. | fără Intelect în ziua ±1 | mașini care nu apar deloc în fișier |
|---|---|---|---|
| `pz_u` | 314 / 19.360 l | 1 / 45 l (458BRAX 08.09) | 1 |
| `pz_i` | 231 / 14.735 l | **112 / 6.754 l** | **16 mașini, 9.239 l** (ex. 805BXI 2.125, 069MLD 2.010, 735LYY 1.693, 330RQR 1.503, 065LTL 1.177 — ~72 l aproape zilnic) |
| `pz_camcer` | 23 / 11.481 l | **4 / 2.462 l** (HMK135 30.09 808,73; RWN169 30.09 827,10; KYK742 30.09 350,43; KWX620 05.09 475,45) | 0 |

Singurul portofel care ar putea acoperi mașinile Sîngerei fără nume, «0378 Singerei-masini DRA», are în toată luna 2.155 l,
iar zilnic 0–152 l față de 154–421 l pe foile acelor 16 mașini. Deci **cel puțin ~4.600 l/lună din `pz_i` (≈ 31 %) nu sunt
Intelect** (altă stație / altă plată), plus până la 2.462 l pe `pz_camcer` (trei din patru pe 30.09 — probabil plinul de
final de lună cu tranzacția în afara perioadei fișierului sau altă rețea). `pz_u` e curat (45 l).

**1. HIGH (−2.0, defect de logică) — scoaterea «întreagă» pe tip de foaie șterge din consum litri care nu sunt în fișier.**
Pasul 5 scoate toate foile `pz_i` și `pz_camcer` din zilele unui import Intelect, indiferent dacă mașina are măcar o
tranzacție în fișier. Scenariu: Clava încarcă Intelect septembrie → `lde_fuel_foaie_ef` pierde 1.177 l pe 065LTL (zero
tranzacții în fișier); `lde_fuel_flota` dă ~0 l/100 km pe ea, abaterea Clavei și posterul pleacă pe cifra asta, iar
`lde_fuel_norma_eb` (447:45-49, învață 3 luni) duce golul în normele lui noiembrie–decembrie. La nivel de flotă: ≥ 4.600 l
dispar lunar până când Clava apasă «Adaugă diferența» pe ~110 rânduri pe lună, în fiecare lună. Verificarea din plan («total
flotă crește doar cu rezervele») ar pica. Asta nu e decizia lui Ion («fișierul devine sursa» = pentru alimentările din fișier),
ci o extindere a ei. **Corecție:** scoaterea pe **(sursă, mașină)**: o foaie de tipul mapat iese doar dacă mașina are cel puțin
un rând legat și activ al aceleiași surse în perioada importului (sau, mai strâns, pe mașină × zi ±1); mașinile fără nicio
tranzacție în fișier își păstrează foile (așa cum am propus în runda 1 pentru `pz_camcer`, «doar pe mașinile cu portofel»).
Fiind în vedere, regula e dinamică: un rând `de_legat` legat mai târziu scoate foaia automat. Test SQL nou: «mașină fără
portofel, foaie `pz_i` 72 l, import Intelect activ → 72 l rămân».

**2. HIGH (−2.0, defect de logică) — «Adaugă diferența» îngheață litrii, iar importul se schimbă după.** Diferența se
calculează pe (mașină, zi, sursă) din starea curentă a legării, dar `lde_fuel_foaie_decizie` o păstrează ca număr fix, pe
cheia unui singur `foaie_external_id`. Orice legare ulterioară (portofel `grup` rezolvat manual sau după confirmarea
coordonatelor stației, `de_legat` → `legat` după agreare, un al doilea fișier care aduce tranzacția lipsă) mărește importul
zilei, iar decizia rămâne. Scenariu: Sîngerei, mașina X, 14.09: foaie `pz_i` 72 l, tranzacția 72 l pe «0378» e `de_legat`
(două mașini la stație) → diferență 72 l, Clava «Adaugă diferența» → 72 l; a doua zi leagă manual tranzacția pe X →
proiecția 72 + decizia 72 = **144 l**. La fel invers: foaia editată în LDE (`lde-alim-worker.mjs:67,83` face upsert pe
`external_id`) schimbă litrii, decizia nu. **Corecție:** decizia se ține pe (mașină, zi, sursă) și intră în vedere ca
`greatest(0, least(decizie.litri, Σ foi_scoase − Σ import_curent))` (sau se invalidează și reapare în listă la orice schimbare
a importului/foii pe acea zi); test SQL: «decizie 72, apoi legare 72 → total 72».

**3. MEDIUM (−1.0) — diferența pe zi calendaristică produce perechi false la granița zilei.** 12 rânduri `pz_u` (889 l) au
tranzacția Intelect în ziua vecină, nu în aceeași zi (plinul de seară trecut pe foaia de mâine, sau invers). Pe (mașină, zi)
apare «în LDE, dar nu în fișier: X l», iar surplusul importului din ziua vecină nu e arătat nicăieri; «E alimentare reală» →
X l dublați. **Corecție:** diferența pe fereastra mașină × (zi−1 … zi+1), sau rândul din listă arată importul zilelor
vecine și butonul e oprit când acesta acoperă diferența.

**4. MEDIUM (−1.0) — re-legarea nu pornește când foaia LDE a zilei sosește după import.** Portofelul `sofer` se leagă prin
foaia LDE a zilei, dar `lde-alim-worker` aduce foile noaptea (`run-nightly.sh`), adesea la zile după alimentare. Lista
declanșatorilor din pasul 4 (import, anulare, re-legare, corecție manuală, agreare) nu conține «a sosit foaia», iar jobul de
noapte rulează doar `lde_fuel_import_sincronizeaza` (proiecția din starea curentă), nu legarea. Rândurile rămân `de_legat`
pentru totdeauna, deși foaia există. **Corecție:** jobul de noapte (după `lde-alim-worker`) re-leagă întâi rândurile
ne-manuale `de_legat` din ultimele 60 de zile, apoi sincronizează proiecția.

**5. LOW (−0.5) — cheia proiecției.** `lde_fuel_alimentari` e unică pe `(source, external_id)` (`lde-geo-worker/fuel-worker.mjs:54`);
planul spune «upsert pe `external_id`». Scrie cheia completă, iar ștergerea neeligibilelor strict pe
`source in ('petrom','intelect')` și intervalul `(de, pana)` — azi tabelul are doar `benzol`/`benzol2`, deci nu atinge nimic străin.

**Observațiile mele din runda 1:**

| # | stare | dovadă |
|---|---|---|
| 1 sumă vs tranzacție | închisă ca mecanism (scoatere întreagă în loc de ±0,5 l) — dar domeniul prea larg → #1 de mai sus | pasul 5 |
| 2 atribuirea activă | închisă: agreare → foaia LDE a zilei, `nume_lde`, două mașini → `de_legat` | pașii 1, 4 |
| 3 cititori direcți | închisă: în bază doar `lde_fuel_flota`, `lde_fuel_plin_la_plin`, `lde_fuel_norma_eb` mai citesc foaia (pg_proc), plus cele 3 fișiere din `apps/admin` — toate în lista pasului 5 | pg_proc, grep |
| 4 pe lună în loc de perioadă | închisă | pasul 5 |
| 5 harta foaie ↔ rețea | închisă pentru `pz_c`/`pz_i`; partea «`pz_camcer` doar pe mașinile cu portofel» nu a fost preluată → #1 | pasul 5 |
| 6 produse, 0 l | închisă | pasul 2 |
| 7 fusul orar | închisă (Europe/Chisinau + test 22:28) | pașii 2, Verificare |
| 8 portofel de grup | închisă (GPS) | pasul 4 |
| 9 numărul migrației | închisă | 533–534 |
| 10 `benzol_n` | notată pentru implementare | triaj |

Scor: 3.5 · Blocante (critical/high): 2
