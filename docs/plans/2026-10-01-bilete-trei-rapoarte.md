# Bilete aparat: comparație între perioade, raport pe rute, șoferi clar (ION-167)

> Versiunea 7 — finală (după runda 3 Codex; v6 = runda 3 Claude; v5 = runda 2 Codex; v4 = runda 2 Claude, v3 = runda 1 Codex). Secțiunile «Review» de la sfârșit sunt pe v1; triajul în «Triaj runda 1».

## De ce

Ion, 01.10 (transmis din sesiunea TLX), despre Numărare → Bilete aparat:
«1 transformă față de anul trecut în raport comparație între perioade la număr de pasageri total pe tipuri de bilete
2 fă un raport cu numărul de rute și media oameni transportați pe fiecare zi și analiza pe ce clienți în mare parte se ține
ruta
3 șoferi raport nu înțeleg până la capăt
lansează 3 runde negocieri codex claude și vezi cum cel mai bine de realizat cele 3 puncte»

Context din aceeași zi (ION-159): Ion vrea lucruri simple («asta tot e complicat și nu chiar ce trebuie»), cifre reale
(«nu doar în procente, ci și în număr real de călătorii»), tipul de client = perechea de unde → până unde, strict TIKI +
Numărare; furtul șoferilor e închis prin alte instrumente. Azi pagina are: Tipuri bilet & direcții (cu omiși tur / retur),
Față de anul trecut, Șoferi. Panoul a mers greu azi din cauza calculelor grele pe baza comună.

## Ce facem

**Două măsuri, numite clar, peste tot:** «**Bilete TIKI**» (mereu) și «**Fără bilet TIKI (numărați)**» (din Numărare: numărat
− TIKI pe porțiuni de drum, estimare); «**Oameni transportați**» = suma lor. **Acoperirea se judecă pe rută** (nu pe toată
perioada — 09.2026 are 86,7 % din cauza a trei rute: 13 0 %, 19 37 %, 10 60 %): o rută e «numărată» într-o perioadă dacă ≥
90 % din **picioarele circulate** (rută × sens × zi, din plecările cu sursa «grafic») au picior numărat eligibil — **folosită doar ca informație**; cifrele
«fără bilet» se dau prin **estimarea pe rută** de mai jos (business-logic r3 · 1: pe 09.2026 pragul de 90 % ar lăsa doar 17
din 30 de rute, din cauza găurii Numărării pe toată flota 05–13.09).

**Estimarea pe rută (aceeași peste tot):** zi **complet numărată** = toate sensurile circulate ale rutei (după grafic) au
picior numărat eligibil; fără bilet pe zi al rutei = media pe zilele complet numărate; fără bilet în perioadă = media × zilele
circulate; perechile «fără bilet» ale rutei se împart după ponderile din zilele complet numărate. Ruta intră dacă are ≥ 50 %
zile complet numărate (la «Comparație»: în **ambele** perioade); altfel «—» și apare în lista «puțin numărate». O singură zi peste tot: **ziua cursei** Mobilet (și
«Tipuri bilet & direcții» trece pe ea). Fiecare total are lângă el și cifra **pe zi**.

1. **«Comparație perioade»** (înlocuiește «Față de anul trecut»). Implicit: **luna ultimă vs luna dinainte**; butoane:
   «aceeași lună anul trecut» (doar Bilete TIKI, spus pe ecran — atunci nu exista Numărare), perioade libere. Sus o
   propoziție: «Septembrie: 52.000 de oameni transportați (1.733 pe zi), cu 1.200 mai puțini pe zi decât în august».
   Tabel pe tip de bilet (pereche fără sens): Bilete TIKI A · B · diferența (toate rutele); Fără bilet A · B · diferența și
   Oameni A · B · diferența (număr, pe zi și %) prin **estimarea pe rută**, pe aceeași mulțime de rute în A și B (ruta
   numărată 95 % în iulie și 35 % în august nu apare drept clienți pierduți); sus: «Fără bilet și oameni: estimat pe N din
   30 de rute (lipsesc …)», cu N calculat, nu presupus. Sortare: cea mai mare scădere de oameni sus;
   primele 15 + «Altele» + Total.
2. **«Rute»** (nou). Sus: «În septembrie au circulat 30 de rute; pe cele N estimate, în medie X oameni pe zi pe rută (Y cu
   bilet TIKI, Z fără)» — media spune peste câte rute e făcută. Tabel: ruta (capătul + ora nord → ora Chișinău), zile circulate (plecări din grafic), **zile numărate / zile
   circulate**, oameni pe zi și **«se ține pe»** (prima pereche cu oameni pe zi și %, apoi a doua și a treia) — **calculate
   doar pe zilele complet numărate**: zi în care **toate** sensurile circulate ale rutei (după grafic) au picior numărat
   eligibil; TIKI pe zi pe toate zilele circulate, fără bilet pe zi prin estimarea pe rută; «se ține pe» = ponderile
   perechilor TIKI + fără bilet din zilele complet numărate (eșantion comun doar pentru ponderi, Codex C1). Rute cu zile complet numărate sub 50 % din
   zilele circulate: «puțin numărată», oameni și perechi «—»; biletele TIKI pe zi se arată oricum, separat. Sortare: oameni pe
   zi. Clic pe rută: toate perechile ei (tur / retur), cu oameni pe zi și %.
3. **«Șoferi»** (refăcut). Implicit luna ultimă. Tabel: șofer · zile lucrate · curse (sens × zi) · bilete TIKI pe cursă ·
   **ceilalți șoferi pe aceleași curse** · **diferența pe cursă** · **bilete în plus / în minus** · **curse comparabile «20 /
   30»** · încasat pe zi · ruta principală. Formula (Codex C5, business-logic r2 · 4, Codex r2 · C1): «cursă» = plecare din **grafic** = rută × sens × zi ×
   **mașină**, dintr-o **singură funcție de plecări** (backend r3 · 2): grafic (`daily_assignments`) + sesiunile Numărării
   (mașina și șoferul sesiunii) unde graficul n-are plecare (905 bilete pe 57 de picioare în 09.2026), inclusiv plecările fără
   niciun bilet (153 în 09.2026); fiecare bilet primește **șoferul plecării lui** în `tiki_attr_month` (`sofer_plecare`) —
   aceeași sursă pentru filtrul «șofer» din Tipuri bilet și pentru «Șoferi» (backend r3 · 3); biletele cu mașina fără plecare
   pe picior (216 în 09.2026) intră în coșul numit «bilete fără plecare în grafic», arătat sub tabel; pe același picior
   pot fi două plecări (două programări cu întoarcere pe aceeași rută), deci fiecare bilet merge la plecarea **mașinii lui**
   (`tiki_ticket_attr.vkey`, plăcuța din grafic la sursele mașină / șofer); biletele legate doar pe etichetă pe un picior cu
   ≥ 2 plecări sunt **ambigue**: ies din comparația șoferilor **împreună cu cursele acelui picior** (business-logic r3 · low), se numără și se arată sub tabel («N bilete fără șofer
   sigur»); suma biletelor se conservă (verificare); așteptarea fiecărei curse a șoferului = media colegilor (fără el) pe **rută × sens** (≥ 5 curse,
   altfel necomparabilă) × **indicele zilei săptămânii** al rutei × sens, cu baza colegilor **normalizată** (Codex r3 · C3): indice(z) =
   bilete pe cursă în ziua z / bilete pe cursă în medie, pe ultimele 90 de zile, toți șoferii; baza colegilor = Σ biletele
   lor / Σ indicele zilelor curselor lor; așteptarea cursei = baza × indice(ziua cursei) (business-logic r3 · 2: celula rută ×
   sens × zi a săptămânii avea ≥ 3 curse doar la 21 %); test obligatoriu: zile slabe 20, tari 40, media 30, șoferul doar
   în zile slabe cu 20, colegii doar în zile tari cu 40 → diferența 0;
   diferența = Σ pe cursele comparabile (bilete − așteptare); «comparabile 20 / 30». Înainte de 04.04.2026 (fără grafic):
   șoferul și cursele din TIKI, marcat. Sortare: bilete în minus. Scoase: indicele «Ține clienții», «Tendință», «Card», lista de curse.
   Sub titlu, câte o propoziție pe coloană. Doar TIKI (fără «fără bilet» pe șofer — analiza furtului e închisă).

**Respinse:** omiși pe șofer (furtul, închis); comparație pe celula rută × sens × zi a săptămânii la șoferi (prea puține
curse — înlocuită de indicele zilei); pragul de 90 % pe perioadă sau pe rută ca filtru (17 din 30 de rute pe 09.2026); grafice în locul tabelelor.

## 🔬 Verificat pe viu

| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Omiși pe rută | `tiki_ceilalti_od` 09.2026 | 30 de rute; TIKI 30,7 oameni / rută / zi (15–49), fără bilet 25,2 | raportul pe rute |
| Acoperirea Numărării | business-logic r1, senior-backend r1 | pe plecări circulate: 03.2026 13 %, 04–08.2026 92–95 %, 09.2026 87 %; ruta 13: 0 din 32 picioare în 09.2026, ruta 10: 37 din 60 | prag 90 % pe perioadă; «zile numărate / circulate» pe rută |
| Numărarea începe | ION-159 | 28.03.2026 (4 zile în martie) | anul trecut = doar TIKI |
| Viteza | senior-backend r1, EXPLAIN | perechea pe ziua cursei cere join `tiki_ticket_attr` ⋈ `tiki_tickets`: 2,1 s pe o lună, scanare completă (258 MB); `get_tiki_omisi` 4,6 s pe 6 luni (normalizarea numelor); RPC-urile `get_tiki_*` de azi: media 4,0 s, max 5,1 s, cu `statement_timeout 30s` | totaluri zilnice precalculate; timeout 5 s |
| Șoferul în media colegilor | business-logic r1, `446_tiki_bilete_aparat.sql:306-309` | azi media îl include; 52 % din curse (915 / 1.743) sunt ale unui șofer cu ≥ jumătate din cursele etichetei | media fără el |
| Două mașini pe picior | business-logic r1 | 42 de picioare în 09.2026 (~3 %) | fără bilet ușor subestimat — spus în notă |
| Coloanele de azi la Șoferi | `DriversView.tsx:91-101` | Șofer · Curse (de fapt zile × curse) · Bilete · Bilete / cursă · «Ține clienții» · Tendință · Încasat · Card · Cursele principale | ce se scoate |

## Pași

1. **Migr. 461 — totaluri zilnice** (fără join live la deschiderea paginii; toate **fără «Anulare»**, Codex C6 — biletele
   valide nelegate de o rută rămân la «Comparație», cu crm_route_id 0, și nota explică diferența față de «Rute»):
   - `tiki_ticket_attr.pereche_cheie`, `pereche_sursa` (stații / dedus din preț / nedeterminat), `pereche_de_la`,
     `pereche_pana_la`, `sofer_cheie` — scrise **în `tiki_attr_month`** (care citește deja `tiki_tickets`; agregatele nu mai
     leagă `tiki_tickets`, senior-backend r2 · N2); cheia din `coalesce(stațiile, perechea dedusă)` (12.2024–01.2026 n-au
     stații); **fără NULL în cheile agregatelor** (r2 · N1): rută 0, sens «?», pereche «nedeterminat», șofer «»; încercat
     întâi pe 01.2025 și 03.2026;
   - `tiki_pereche_daily(zi, crm_route_id (0 = nelegat), leg, sofer_cheie, pereche_cheie, de_la, pana_la, bilete, lei,
     bilete_statii, bilete_dedus)` umplut în `tiki_aggr_month` — păstrează dimensiunile «Tipuri bilet & direcții» (Codex
     C2): filtrul pe **cursă** devine filtrul pe **ruta din nomenclator** (ca la «Rute»), filtrul pe **șofer** rămâne,
     coloana «Sursa» (stații / dedus din preț) rămâne; test cu un filtru activ;
   - `omisi_pereche_daily(zi, crm_route_id, leg, pereche_cheie, oameni)` umplut în `count_aggr_days` (tabel separat: cele
     două funcții refac bucăți diferite);
   - `tiki_plecari_v2(zi, crm_route_id, leg, vkey, sofer, sursa: grafic / numarare)` — funcția unică de plecări;
   - `tiki_sofer_daily(zi, sofer, crm_route_id, leg, curse, bilete, lei, bilete_ambigue, bilete_fara_plecare)` în
     `tiki_aggr_month`, din plecări (cu 0 bilete) + `tiki_ticket_attr.sofer_plecare`; fără dimensiunea mașinii;
   - acoperirea: `count_leg_daily` (eligibil) față de `tiki_plecari_daily`.
2. **RPC-uri noi, cu nume noi** (Codex C3: cele folosite azi de pagină — `get_tiki_pairs`, `get_tiki_omisi`,
   `get_tiki_tendinta`, `get_tiki_drivers` — **nu se ating** până la comutare), pe aceste tabele, `statement_timeout '5s'`,
   < 3 s la rece pe 12 luni: `get_tiki_comparatie`, `get_tiki_rute` + `get_tiki_ruta_perechi` (la clic),
   `get_tiki_soferi_v2`, `get_tiki_perechi_v2` (Tipuri bilet pe ziua cursei, cu omiși).
3. **Ordinea lansării** (Codex C3): (a) migrația: tabele noi (RLS + REVOKE / GRANT, r2 · N7) + scriitorii + RPC-urile noi,
   **fără să pună nimic în coadă** (r2 · N3), nimic schimbat în cele vechi; (b) refacerea istorică **doar noaptea, 23:00–05:00**, în pași ≤ 20 s — baza e pe instanța NANO (0,5 GB),
   care a încremenit pe 01.10 19:33–20:20 după o zi de refaceri grele; mecanismul (fereastra de noapte, pași pe săptămâni,
   suspendarea persistentă a istoricului, rularea de dimineață care nu consumă istoricul suspendat) e **ION-166**, de care
   ION-167 depinde: lunile 12.2024–09.2026 se pun în coadă abia după ce ION-166 e în producție (Codex r3 · C4); până atunci
   nimic istoric nu rulează; (c) verificarea: ambele cozi goale,
   Σ din tabelele noi = Σ din `tiki_ticket_attr` (fără Anulare) / `tiki_ceilalti_od` pe fiecare lună; (d) push-ul interfeței
   care cheamă RPC-urile noi; (e) după o zi fără erori, cele vechi se scot.
4. **Bugetul refacerii** (Codex C4): înainte de (b), pasul lunar complet (atribuire + agregate noi) se măsoară pe luna cea
   mai grea (08.2026, 29.921 de bilete) și lotul de Numărare (60 de zile × rute); ținta < 90 s din 120; peste → agregatele
   noi devin pas separat cu **coadă proprie** `tiki_aggr_queue`, pusă de pasul atribuirii în aceeași tranzacție (r2 · N4: altfel
   luna se pierde dacă pasul separat cade). Estimarea cozii
   întregi se scrie în raport.
5. **Invalidarea la corecturi** (Codex r2 · C2, backend r3 · 1, 4): triggere `FOR EACH STATEMENT` (tabele de tranziție) pe
   `daily_assignments` și `tiki_label_override` scriu lunile în **jurnalul fără cheie** `tiki_refresh_log` — **deja în
   producție din migr. 461** (01.10), unde triggerele Numărării au fost mutate pe jurnal, pentru că inserția ON CONFLICT în
   coada cu cheie aștepta ~70 s după pasul de refacere și putea bloca salvarea din GO; jurnalul trece în cozi la începutul
   `tiki_refacere_pas`. Lunile trecute se refac la rularea de seară, luna curentă la import. Costul: luna curentă e oricum
   în coadă după fiecare import, deci triggerul adaugă muncă doar la corecturile pe lunile trecute (backend r3 · 5).
6. **Vederi**: `ComparatieView.tsx` (înlocuiește `TendintaView`), `RuteView.tsx`, `DriversView.tsx` refăcut; meniul:
   Tipuri bilet & direcții · Comparație perioade · Rute · Șoferi. Denumiri: «Bilete TIKI», «Fără bilet TIKI (numărați)»,
   «Oameni transportați».

## Fișiere

- `packages/db/migrations/461_tiki_trei_rapoarte.sql`
- `apps/admin/src/app/(dashboard)/numarare/tabs/biletAparatActions.ts`, `bilete/types.ts`, `bilete/analiza.ts` (+ teste)
- `bilete/ComparatieView.tsx`, `bilete/RuteView.tsx`, `bilete/DriversView.tsx`, `bilete/PairsView.tsx`, `BileteAparatTab.tsx`

## Riscuri

- Ruta cu zile complet numărate sub 50 % (la «Comparație»: în oricare perioadă): «—» și lista «puțin numărate»; pragul
  de 90 % e doar informativ (Codex r3 · C5).
- Recalculul greu pe NANO: doar noaptea 23:00–05:00, pași ≤ 20 s (ION-166).
- Fără bilet e o estimare (diferență pe tronsoane), spus într-o propoziție; ~3 % subestimat pe picioarele cu două mașini.

## Verificare

- SQL direct pe 2 perechi, 3 rute, 3 șoferi: cifrele RPC = sumele din tabelele sursă (fără Anulare).
- Rute: cazul «tur numărat complet, retur absent» → zilele nu sunt complet numărate, oameni «—».
- Șoferi: un șofer pe două rute, una fără colegi → «comparabile 1 / 2», diferența doar pe prima.
- Șoferi: două programări cu întoarcere pe aceeași rută în aceeași zi → biletele se împart pe mașini, Σ bilete conservată;
  biletele doar pe etichetă pe acel picior → «fără șofer sigur».
- Implicitul «luna ultimă» se oprește la ultima zi cu Numărarea închisă (30.09 era 72 % pe 01.10), spus sus.
- Salvarea unei sesiuni în GO în timpul `tiki_refacere_pas` nu așteaptă (migr. 461, verificat cu două conexiuni).
- Grafic: corectura șoferului pe o zi din iulie → iulie intră în coadă; după golire, raportul arată șoferul nou.
- Tipuri bilet: filtru pe rută și pe șofer activ, înainte și după comutare; cu filtrul pe șofer, coloana «fără bilet» se
  ascunde (omișii n-au șofer, business-logic r2 · 6).
- Comparație: 09.2026 vs 08.2026 dă cifre (nu «—»); ruta 31 iul. vs aug. nu apare în «fără bilet».
- Rute: «TIKI pe zi» pe toate zilele circulate și «fără bilet pe zi» pe zilele complet numărate, separate pe rând (eșantionul
  zilelor complete are TIKI ×1,064 față de toate zilele — business-logic r2 · 3), spus în notă.
- La rece, pe 12 luni: fiecare RPC < 3 s, planul fără citiri din `tiki_tickets`.
- vitest în `bilete/analiza.test.ts`: acoperirea, media fără șofer, perioade de lungimi diferite (pe zi).
- typecheck.

## Critic extern - runda 3

**Scor 1.5 (JSON 3.5, inconsistent: Σ greutăți 8.5) · fail la livrare · critical/high: 2, ambele acceptate și reparate în producție.**

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | 461: jurnalul citit și șters în instrucțiuni separate → un eveniment confirmat între ele se pierdea | acceptat, **reparat** | migr. 462 (01.10): un singur `DELETE … RETURNING` alimentează ambele cozi; verificat în catalog |
| C2 | high | triggerul sesiunilor: fără luna NOUĂ și fără `driver_id` | acceptat, **reparat** | migr. 462: luna OLD și NEW, trigger și pe `driver_id`; verificat în catalog |
| C3 | medium | indicele zilei aplicat pe media brută a colegilor | acceptat | baza colegilor normalizată + testul numeric cu diferența 0 |
| C4 | medium | fereastra de noapte fără mecanism | acceptat | dependență de ION-166 (noaptea 23:00–05:00, pași ≤ 20 s); 20:00 scos — NANO a căzut la 19:33 |
| C5 | low | Riscuri cu regula veche de 90 % | acceptat | Riscuri rescrise |

## Triaj runda 3 (Claude)

| revizor · nr | sev. | esență | decizie | unde |
|---|---|---|---|---|
| business-logic r3 · 1 | high | pragul 90 % pe rută lasă 17 / 30 rute pe 09.2026 (gaura 05–13.09) | acceptat | estimarea pe rută (zile complet numărate × zile circulate), ≥ 50 % în ambele perioade, N calculat |
| business-logic r3 · 2 | high | ziua săptămânii acoperă doar 21 % din curse | acceptat | rută × sens × indicele zilei pe 90 de zile |
| business-logic r3 · medii/low | medium/low | «Rute» se contrazice; media fără numărul de rute; cursele ambigue; ultima zi incompletă; trigger pe instrucțiune | acceptate | «Ce facem» 2–3, Pași 5, Verificare |
| senior-backend r3 · 1 | high | triggerul în coada cu PK așteaptă după pasul de refacere → salvarea blocată | acceptat **și reparat în producție** | migr. 461 (01.10): jurnal fără cheie pentru triggerele Numărării; triggerele noi tot pe jurnal |
| senior-backend r3 · 2 | medium | 1.121 de bilete fără plecare cu mașina lor | acceptat | funcția unică de plecări (grafic + Numărare) + coș numit |
| senior-backend r3 · 3 | medium | `tiki_sofer_daily` nu poate da formula; sursa șoferului | acceptat | `sofer_plecare` în attr; plecări cu 0 bilete; fără mașină în agregat |
| senior-backend r3 · 4, 5 | low | invalidare și pe override / sesiuni; costul ca fapt | acceptate | Pași 5 |

## Critic extern - runda 2

**Scor 6.0 · fail · critical/high: 1** (consistent).

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | două plecări pe același picior → biletele nu au șofer unic | acceptat | cursa = rută × sens × zi × mașină; biletul la plecarea mașinii lui; ambiguele scoase și arătate; Σ conservată |
| C2 | medium | corectura graficului nu invalidează agregatele | acceptat | trigger pe `daily_assignments` → coadă, nesincron, fără să blocheze grafic |

## Triaj runda 2 (Claude)

| revizor · nr | sev. | esență | decizie | unde |
|---|---|---|---|---|
| business-logic r2 · 1 | high | 09.2026 sub 90 % pe perioadă → «—» peste tot | acceptat | acoperirea pe rută; «pe 27 din 30 de rute» |
| business-logic r2 · 2 | high | salt de acoperire pe o rută = clienți «pierduți» | acceptat | aceeași mulțime de rute numărate în A și B |
| business-logic r2 · 4 | high | formula șoferilor amestecă zilele săptămânii | acceptat | rută × sens × zi a săptămânii (≥ 3), apoi rută × sens (≥ 5) |
| business-logic r2 · 3, 5, 6, 7 | medium/low | eșantion deplasat; curse din bilete; omiși cu filtru pe șofer; numitorul pragului | acceptate | TIKI și fără bilet pe zi separate; curse din grafic; coloana ascunsă; picioare circulate din grafic |
| senior-backend r2 · N1 | high | NULL în cheile agregatelor oprește recalculul | acceptat | coalesce + valori de rezervă; test pe 01.2025 și 03.2026 |
| senior-backend r2 · N2–N8 | medium/low | sursa perechii în attr; cine pune în coadă; coadă proprie pentru agregate; cheia șoferului; mărimea; drepturi; zile circulate din grafic | acceptate | Pași 1, 3, 4 |
| senior-backend r2 · N9 | low | 12.2025 «doar 1.034 de bilete» | **respins cu fapt** | acela e totalul pe ziua vânzării (`tiki_daily_trip`); pe ziua cursei 12.2025 are 24.320 de bilete în 31 de zile (ION-160, reimportul din Mobilet) — rapoartele noi merg pe ziua cursei |

## Critic extern - runda 1

**Scor 1.0 (JSON 1.5, inconsistent: Σ greutăți 9.0) · fail · critical/high: 3.**

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | zi cu un singur sens numărat socotită numărată | acceptat | zile complet numărate (toate sensurile circulate eligibile), eșantion comun TIKI + fără bilet |
| C2 | high | agregatul pierde filtrele șofer / cursă și sursa perechii | acceptat | `tiki_pereche_daily` cu șofer, rută, stații / dedus; filtrul pe cursă → ruta din nomenclator |
| C3 | high | RPC-urile folosite azi s-ar goli în timpul recalculului | acceptat | RPC-uri noi cu nume noi, comutare după cozi goale + verificare |
| C4 | medium | refacerea fără buget de timp | acceptat | măsurare pe 08.2026, țintă < 90 s, altfel pas separat |
| C5 | low | formula șoferilor nespecificată | acceptat | formula ponderată pe rută × sens, doar curse comparabile, «20 / 30» |
| C6 | low | Anulare în agregate | acceptat | fără Anulare în agregate și în sumele de control |

## Triaj runda 1 (Claude)

| revizor · nr | sev. | esență | decizie | unde |
|---|---|---|---|---|
| dataviz-ux · 1 | high | implicitul «vs anul trecut» arată doar TIKI sub numele «pasageri» | acceptat | două măsuri numite; implicit luna ultimă vs luna dinainte; anul trecut doar TIKI |
| dataviz-ux · 2 / business-logic · 1 | high | șoferul inclus în media colegilor | acceptat | media fără el, ≥ 5 curse, altfel «nu are cu cine fi comparat»; cifre reale |
| business-logic · 2 / dataviz-ux · 3 | high | omiși împărțiți la zilele circulate, nu numărate | acceptat | «zile numărate / circulate», fără bilet pe zi numărată, steag sub 50 % |
| senior-backend · 1–2 | high | join live → 5 s+, lag pe panou | acceptat | totaluri zilnice precalculate, timeout 5 s, perechile rutei la clic |
| senior-backend · 3 | high | ordinea lansării | acceptat | pasul 3 |
| business-logic · 3–7, dataviz-ux · 4–6, senior-backend medii | medium/low | numitorul «97 %»; perioade de lungimi diferite; două mașini; ziua săptămânii la șoferi; o singură zi; denumiri; acoperire diferită; timeout | acceptate | 🔬, «Ce facem», «Riscuri» |

## Review: dataviz-ux

Fapt verificat pe viu (Supabase, `count_leg_daily` ⋈ `tiki_ceilalti_od` pe luni): Numărarea are 03.2026 = **4 zile**,
04–09.2026 = toate zilele lunii; 09.2026 = 780 de zile-rută cu omiși la 29 de rute (deci nu fiecare rută are omiși în
fiecare zi în care circulă). Înainte de 03.2026 — nimic.

1. **high — implicitul «luna ultimă vs aceeași lună anul trecut» dă exact ce Ion NU a cerut.** 09.2025 nu are Numărare,
   deci după regula planului (r. 23–24) ambele coloane devin «doar TIKI», iar cifra mare de sus, numită «pasageri», e de
   fapt bilete TIKI. Scenariu: Ion deschide fila, vede «Pasageri septembrie 2026: 27.000 vs 26.000» și crede că sunt toți
   oamenii; în realitate lipsesc ~19.450 de omiși (09.2026). Corecție: (a) două mărimi cu nume diferite, niciodată
   amestecate sub același cuvânt: «Bilete TIKI» (există mereu) și «Oameni transportați (TIKI + omiși)» (doar când ambele
   perioade sunt acoperite); (b) implicit = **luna trecută vs luna dinainte** (09.2026 vs 08.2026, ambele cu Numărare,
   deci arată oameni reali); butonul «anul trecut» arată doar coloanele «Bilete TIKI» și scrie deasupra «Anul trecut nu
   se număra lumea în autobuz — comparăm doar biletele TIKI». (c) «are Numărare» = acoperire pe zile (≥ 90 % din zilele
   perioadei), nu «există»; altfel 03.2026 (4 zile) trece drept perioadă numărată și omișii sunt de 7× prea puțini.
   Regula «pe rând: TIKI+omiși, altfel doar TIKI» se scoate: un tabel cu formula schimbată de la rând la rând dă un Total
   fără sens.

2. **high — la Șoferi, comparația «față de media pe aceleași curse» are aceeași capcană ca indicele de azi.** Dacă un
   șofer e singur pe eticheta + ziua săptămânii, media «colegilor» e chiar el → «0 % / în medie»
   (azi `periods.ts:133-137` scrie «În medie» la 0,9–1,1). Ion citește «șofer obișnuit» acolo unde nu există comparație.
   Corecție: media se ia **fără șoferul însuși**; la cursele fără alt șofer — «nu are cu cine fi comparat» (gri), nu un
   procent. Și coloana în **număr real**, nu procent: «Bilete pe cursă: el 23,0 · alții pe aceleași curse 20,5 ·
   diferența **+2,5**», plus «În perioadă: **+75 bilete**» (diferența × curse). Procentul doar ca text mic, opțional.

3. **medium — «oameni pe zi» la Rute amestecă numitori.** TIKI se împarte la zilele circulate, omișii trebuie împărțiți
   la zilele-rută numărate (780 în 09.2026, nu 29 × 30). Cu același numitor omișii ies subestimați la rutele cu zile
   nenumărate. Corecție: «Omiși pe zi» = omiși ÷ zile numărate ale rutei; coloana «zile numărate / zile circulate» vizibilă
   (ex. «27 / 30»). Perioadă care atinge 28.03 → se taie automat de la 01.04 și se spune într-un rând.

4. **medium — cifrele nu se vor bate între file.** Comparația e pe ziua cursei Mobilet, Tipuri bilet & direcții pe ziua
   vânzării (planul, r. 50). Ion pune septembrie din ambele file alături și vede două totaluri diferite. Corecție: ori
   aceeași zi peste tot în această livrare, ori o propoziție sub total: «numărat pe ziua cursei, nu a vânzării — de aceea
   diferă cu ~N bilete de fila Tipuri bilet».

5. **low — coloanele, ordinea, ce se vede fără derulare (propunere concretă; cifrele din exemple sunt ilustrative, nu măsurate).**
   - *Comparație perioade.* Sus, fără grafic: o singură propoziție mare — «Septembrie 2026: **19.840 oameni** · August
     2026: **21.300** · **−1.460 (−6,9 %)**». Bara A vs B nu adaugă nimic peste două numere; se scoate. Tabel:
     `Pereche (de unde – până unde)` · `Septembrie` · `August` · `Diferența (oameni)` · `Diferența %`. Ordine: după
     diferența în oameni, de la cea mai mare scădere (asta caută Ion: unde am pierdut). Primele 15 rânduri + «Altele (N
     perechi)» + **Total**. Perechile cu < 30 de oameni în ambele luni → în «Altele» (procentele lor sar ±80 % și fură
     atenția).
   - *Rute.* Sus: «**29 de rute** au circulat · în medie **56 oameni pe zi** pe rută · total **1.620 oameni pe zi**».
     Tabel: `Ruta` (ex. «Briceni 06:10 → Chișinău / retur 15:30», nu «ora nord / Chișinău») · `Zile circulate` ·
     `Oameni pe zi` · `din care cu bilet TIKI` · `din care fără bilet (omiși)` · `Se ține pe` — cu număr, nu doar %:
     «Chișinău – Bălți 19 oameni (34 %) · Lipcani – Briceni 7 (12 %)». Ordine: oameni pe zi, descrescător. Tur/retur
     doar în detaliul rutei (clic), nu în tabel — două cifre în fiecare celulă dublează tabelul.
   - *Șoferi.* Coloane: `Șofer` · `Zile lucrate` · `Curse` · `Bilete pe cursă` · `Alții pe aceleași curse` ·
     `Diferența pe cursă` · `Bilete în plus / minus în perioadă` · `Încasat pe zi (lei)` · `Ruta principală`. Se scot
     «Tendință», «Card», «Cursele principale» ×3 (Ion n-a cerut, încarcă). Ordine implicită: `Bilete în plus / minus`
     descrescător — sus cei mai buni, jos cei care vând sub colegi. Definiția «cursă» scrisă o dată (azi coloana «Curse»
     e `trip_days`, `DriversView.tsx:99`, adică zile-cursă — să nu apară două numere care par același lucru).
   - Perioada implicită pentru Rute și Șoferi: **luna trecută întreagă**, nu «ultimele 8 săpt.».

6. **low — cuvintele.** «Pereche fără sens» → «de unde – până unde (ambele direcții)»; «omiși de TIKI» → în antet «fără
   bilet TIKI (numărați)», cu explicația «oameni văzuți în autobuz, dar fără bilet din aparat — estimare din numărare» o
   singură dată sus; «Ține clienții» dispare complet (bine). Nicio celulă doar cu săgeată/culoare: semnul +/− și numărul
   scrise, culoarea doar ca adaos.

Deduceri: F1 −2,0 · F2 −2,0 · F3 −1,0 · F4 −1,0 · F5 −0,5 · F6 −0,3.

Scor: 3.2 · Blocante (critical/high): 2

## Review: business-logic-auditor

Fapte verificate pe viu (Supabase, doar tabele agregate, 01.10):
- acoperirea Numărării față de picioarele care au circulat (`count_leg_daily.eligibil` ÷ `tiki_plecari_daily`):
  03.2026 203 / 1.521 (4 zile), 04 1.488 / 1.573 = 95 %, 06 92 %, 08 92 %, **09.2026 1.536 / 1.764 = 87 %**;
- pe rută, 09.2026: ruta 13 — 32 de picioare circulate, **0 eligibile**; ruta 10 — 37 / 60 (62 %), 19 — 68 %, 27 — 70 %;
- `tiki_daily_trip` 09.2026: 55 de etichete, doar 2 cu un singur șofer, dar **915 din 1.743 de curse (52 %)** sunt ale
  unui șofer care face ≥ 50 % din cursele etichetei lui;
- `tiki_ticket_attr`: 09.2026 — 0 nelegate, 0 anulări, 55 de bilete cu ziua cursei ≠ ziua vânzării; 09.2025 — 541
  nelegate, 10 anulări, 97 cu `zi_sursa = 'vanzare'`; perechea lipsește la 0 bilete în ambele luni;
- 42 din 1.536 de picioare eligibile în 09.2026 au bilete TIKI de la **mai mult de o mașină** pe aceeași rută × picior × zi.

1. **high — Șoferi: media «pe aceleași curse» îl include pe șoferul însuși.** Azi `446_tiki_bilete_aparat.sql:306-309`
   (`slot.avg_per_trip` peste toate cursele etichetei, inclusiv ale lui) și planul (pasul 1, «media pe aceleași curse»)
   nu spun «fără el». Scenariu: X face 70 % din «Lipcani 10:40» cu 25 de bilete / cursă, ceilalți 20 → media cu el =
   23,5 → coloana scrie «+6 %», nu «+25 %». Cum 52 % din curse sunt în situația asta, jumătate din tabel e comprimat
   spre «în medie», exact cei mai stabili șoferi (cei cu linie fixă). Corecție: media celorlalți = (Σ bilete − ale lui)
   ÷ (curse − ale lui) pe etichetă; în rând se arată și **numărul curselor celorlalți** pe care s-a făcut comparația;
   sub un prag (ex. < 5 curse ale altora pe etichetele lui) — «fără comparație», nu un procent. (Confirmă și întărește
   dataviz F2 cu cifra de 52 %.)

2. **high — Rute: omișii lipsesc pe zilele nenumărate, iar planul nu definește numitorul nici la «oameni pe zi», nici la
   «se ține pe».** `tiki_ceilalti_od` are rânduri doar pe picioarele eligibile (`458:84-86`); pe celelalte omișii sunt 0,
   nu «necunoscuți». Scenariu 1: ruta 13 în 09.2026 n-are niciun picior eligibil → în tabel apare doar cu TIKI (~55 %
   din oamenii unei rute obișnuite), coboară în clasament și «se ține pe» iese doar din perechile TIKI, deși coloana zice
   «TIKI + omiși». Scenariu 2: ruta 10 (62 % acoperire) — dacă Σ omiși ÷ 30 zile, omișii ies cu ~38 % prea puțini; dacă
   procentele perechilor iau TIKI din 30 de zile și omiși din 18, perechile «doar ale omișilor» (sate fără TIKI) sunt
   subponderate cu același 38 %. Corecție, scrisă în plan: (a) «oameni pe zi» = TIKI pe zilele circulate + omiși ÷
   **picioarele eligibile** ale rutei (pe picior, tur și retur separat), sau — mai simplu și coerent — totul doar pe
   picioarele eligibile, cu «zile numărate / zile circulate» vizibil; (b) «se ține pe» = procent din TIKI + omiși **pe
   aceleași picioare eligibile**; (c) rută cu < 50 % acoperire → steag «puțin numărată», fără coloana omiși; (d) «a
   circulat» = `tiki_plecari_daily.plecari > 0` (graficul din 04.04), nu «are bilete» și nu «are Numărare» — spus în plan.

3. **medium — faptul «97 % din picioarele numărate sunt comparabile» din «Verificat pe viu» are numitorul greșit pentru
   ce influențează.** E eligibil ÷ numărat. Față de picioarele care au circulat, 09.2026 = 87 %, cu rute la 0–70 %.
   Concluzia «omiși aproape complet în 09.2026» nu stă; regula de acoperire (dataviz F1c, ≥ 90 % pe zile) trebuie
   calculată pe **picioare** eligibile ÷ circulate, nu pe zile cu măcar o numărare — altfel 09.2026 (30 / 30 de zile)
   trece drept complet, deși lipsesc 13 % din picioare.

4. **medium — Comparație perioade: totalul pe perioade de lungimi diferite.** Planul dă «pasageri A · pasageri B» în
   sumă. 09 (30 de zile) vs 08 (31) dă −3,2 % doar din calendar; perioade alese liber (ex. 10 zile vs o lună) dau
   diferențe fără sens. Corecție: alături de sumă, «pe zi» (÷ zilele circulate ale perioadei), iar diferența % se
   calculează pe zi; pentru omiși, «pe zi» ÷ picioarele eligibile (vezi 2), sau omiși scalați la acoperire — ales și scris.

5. **medium — omișii sunt subestimați pe picioarele cu două mașini.** `count_aggr_days` (`458:56-63`) leagă biletele
   TIKI de piciorul numărat doar pe zi × rută × picior, fără mașină, iar `count_leg_daily` ține o singură sesiune pe
   picior (PK `452:140-154`, `ON CONFLICT DO NOTHING`). Când pleacă o mașină suplimentară, biletele ei se scad din
   numărarea primei → omiși prea puțini (42 de picioare în 09.2026, ~3 %). Nu blochează; planul să-l numească în
   «Riscuri» sau să excludă din omiși picioarele cu > 1 `vkey` TIKI.

6. **medium — Șoferi: «eticheta + zi a săptămânii» fragmentează comparația.** 55 de etichete × 7 zile pe o lună → ~4
   curse pe celulă; cu media fără el (F1) multe celule rămân fără alt șofer sau cu 1–2 curse ale altuia, deci zgomot de
   ±30 %. Corecție: comparația pe etichetă × sens în perioadă (ziua săptămânii doar dacă celula are ≥ 5 curse ale
   altora), ponderată cu cursele lui pe fiecare etichetă.

7. **low — filtrele TIKI nescrise în pasul 1.** `tiki_ticket_attr` conține anulări (`sursa = 'anulare'`, `is_anulare`)
   și nelegate (`crm_route_id IS NULL`); planul nu spune ce intră. Corecție: Comparație = toate biletele `NOT
   is_anulare` (nelegatele sunt oameni reali, 541 în 09.2025); Rute = doar legate, deci totalul Rute ≠ totalul Comparație
   cu numărul nelegatelor — spus sub total. `zi_sursa = 'vanzare'` e neglijabil (≤ 0,4 %), nu cere tratament.

Concordanță cu dataviz F1c: perioada care atinge 28–31.03.2026 trebuie tratată ca nenumărată (4 zile din 31); nu o
deduc a doua oară.

Deduceri: F1 −2,0 · F2 −2,0 · F3 −1,0 · F4 −1,0 · F5 −1,0 · F6 −1,0 · F7 −0,5.

Scor: 1.5 · Blocante (critical/high): 2

## Review: senior-backend-engineer

Zona: implementarea și performanța `get_tiki_comparatie` / `get_tiki_rute` / `get_tiki_soferi`, sarcina pe baza comună,
ce trebuie precalculat la refacerea de dimineață. Măsurători pe viu (01.10, proiect zqkzqpfdymddsywxjxow), doar citire.

Fapte măsurate:
- `tiki_ticket_attr` NU are perechea / stațiile (452:57-74); perechea e doar în `tiki_tickets` (446:31-51). Orice TIKI
  «pe pereche pe ziua cursei» înseamnă `tiki_ticket_attr ⋈ tiki_tickets`.
- Mărimi: `tiki_tickets` 555.749 rânduri / 494 MB, `tiki_ticket_attr` 279 MB, `tiki_ceilalti_od` 182k / 28 MB,
  `tiki_daily_pair` 207k / 76 MB (dar pe ziua VÂNZĂRII, 449:8-19).
- `EXPLAIN ANALYZE` pe 09.2026 (26.746 bilete), join `USING (ticket_key)` + cheia normalizată a perechii: planificatorul
  alege **Seq Scan pe toată `tiki_tickets`** (33.014 blocuri citite de pe disc, ~258 MB) + hash join → **2.080 ms pentru o
  singură lună**. (Notă onestă: măsurătoarea asta a citit o dată toată `tiki_tickets` — exact ce face și RPC-ul propus.)
- `get_tiki_omisi` existent: 1 lună = 772 ms, 6 luni (04–09.2026) = **4.639 ms**; același GROUP BY fără `tiki_stop_norm`
  pe 6 luni = 783 ms → costul e funcția de normalizare (2 regex × 4 apeluri pe rând), nu volumul.
- `pg_stat_statements` azi: un RPC `get_tiki_*` prin PostgREST are media 4.010 ms, max 5.056 ms (4 apeluri) — deja peste
  bugetul de 3 s. Funcțiile au `SET statement_timeout '30s'` (459:7), care bate limita de 8 s a rolului: un RPC lent NU
  moare la 8 s, ține baza până la 30 s.
- Acoperirea Numărării pe (zi, rută, picior) din plecări: 03.2026 13,3 %, 04–08.2026 92–95 %, **09.2026 87,1 %**.
- Coada de refacere e goală (tiki 0, count 0); refacerea rulează la importul de dimineață, nu e pg_cron (0 joburi tiki).

1. **[high] `get_tiki_comparatie` cu join live `tiki_ticket_attr ⋈ tiki_tickets` depășește bugetul și încarcă baza
   comună.** Pasul 1 al planului: «TIKI (din `tiki_ticket_attr` ⋈ `tiki_tickets`, ziua cursei)». Scenariu: Ion deschide
   implicitul «09.2026 vs 09.2025» → două hash join-uri, fiecare cu Seq Scan pe 494 MB = ~2 × 2,1 s doar pentru TIKI, plus
   omișii cu `tiki_stop_norm` pe rând (0,8 s/lună) → ~5 s la rece; la «anul trecut» pe 12 luni (~300k bilete) trece de 8 s,
   iar cu `statement_timeout 30s` ține conexiunea și scoate din cache tot ce citește restul panoului — exact lag-ul de azi.
   Verificarea «toate RPC < 3 s» va pica pe primul apel. **Corecție:** agregat zilnic precalculat, citit de RPC-uri:
   - în `tiki_attr_month` (care are deja `from_station/to_station/pair` în `_t`, 457:69) se scrie o coloană nouă
     `pereche_cheie` în `tiki_ticket_attr` (aceeași formulă ca 460: `least|greatest` pe `tiki_stop_norm`) — zero join în plus;
   - tabel `tiki_pereche_daily (zi, crm_route_id, leg, pereche_cheie, de_la, pana_la, bilete, lei)`, PK cu `zi` primul,
     umplut în `tiki_aggr_month` din `tiki_ticket_attr` (lunar, în pasul de 120 s; măsoară pasul după schimbare, 456 a
     fost spart tocmai pentru că trecea de 120 s);
   - tabel separat `omisi_pereche_daily (zi, crm_route_id, leg, pereche_cheie, oameni)` umplut în `count_aggr_days` pentru
     (zi, rută) — tabel separat, nu coloană în același tabel: cele două scriitoare refac granulații diferite (lună vs
     zi × rută) și s-ar șterge reciproc.
   Cu `crm_route_id` în cheie, același agregat servește și «se ține pe» din `get_tiki_rute` (vezi 2). Estimare: ~200–400
   rânduri/zi → un an ≈ 100–150k rânduri citite pe index `zi`, fără regex → sub 0,5 s.

2. **[high] `get_tiki_rute` «primele 3 perechi ale rutei» are aceeași problemă, nespusă.** TIKI pe pereche × rută cere tot
   join-ul cu `tiki_tickets` (perechea nu e în `tiki_ticket_attr`, 452:57-74), iar omișii pe pereche cer `tiki_stop_norm`
   pe fiecare rând din `tiki_ceilalti_od` (4,6 s pe 6 luni, măsurat). Scenariu: Ion pune perioada 28.03–30.09 (tot ce are
   Numărare, cum sugerează chiar planul «Din 28.03.2026») → RPC-ul face join-ul pe ~170k bilete + normalizarea pe ~180k
   rânduri → > 8 s, vederea «Rute» rămâne goală sau ține baza 30 s. **Corecție:** citește din agregatele de la 1; rezumatul
   pe rută (zile, TIKI, omiși) din `tiki_leg_daily` + `count_leg_daily` + agregatul de omiși, iar detaliul perechilor doar
   la clic (`p_route` nenul), nu pentru toate cele 30 de rute în același apel.

3. **[high] Ordinea lansării lipsește: agregatul nou trebuie umplut înaintea codului care îl citește.** Odată acceptat 1,
   coloana `pereche_cheie` și tabelele noi sunt goale pentru toate cele ~22 de luni până se golește coada (refacerea merge
   la importul de dimineață, o lună pe pas). Scenariu: migrația + UI ajung în prod azi, coada se golește mâine dimineață →
   până atunci «09.2026 vs 09.2025» arată B = 0 și «−100 %» pe fiecare tip de bilet. **Corecție:** în «Pași»: migr. 461
   (schemă + funcții de refacere + `INSERT INTO tiki_refresh_queue` pentru toate lunile) → golirea cozii (pași manuali,
   seara, câte unul, cu `tiki_refacere_pas()`, monitorizat) → verificarea `count(*)` pe lună în agregat = `tiki_leg_daily`
   → abia apoi push-ul UI. RPC-ul întoarce și `coada` (ca `get_tiki_calitate`) și UI-ul spune «se recalculează» când nu e 0.

4. **[medium] «Pasageri = TIKI + omiși» compară perioade cu acoperire diferită a Numărării.** Omișii există doar pe
   picioarele numărate eligibile: 09.2026 87,1 % vs 08.2026 92,3 % (măsurat). Regula planului «Numărare în ambele perioade»
   e binară; între 09 și 08 diferența de acoperire singură produce ~−5 % omiși fals. Iar 03.2026 are 13,3 %: «are
   Numărare» → da, dar comparația ar fi absurdă. **Corecție:** RPC-ul întoarce acoperirea (picioare eligibile / plecări)
   pe fiecare perioadă; omișii se raportează ca omiși pe picior numărat × plecări (estimare scalată, spusă în coloană), iar
   sub un prag fix (ex. 80 %) perioada e «doar TIKI». Pragul ca constantă numită în migrație, nu în UI.

5. **[medium] `get_tiki_soferi` — sursa și ziua nu sunt spuse.** `tiki_ticket_attr` nu are șoferul (452:57-74); pe ziua
   cursei șoferul vine din `tiki_trips.driver_name` / `tiki_tickets.driver_name` (457:71). Pe ziua vânzării există deja
   `tiki_daily_trip` (30k rânduri, are șofer + etichetă + oră + sens, 446:78-92) — ieftin. Planul spune doar «comparat cu
   media pe aceleași curse (eticheta + zi a săptămânii)». **Corecție:** scrie explicit: fie rămâne pe `tiki_daily_trip`
   (ziua vânzării, spus în capul vederii — consecvent cu rândul «Ziua» din «Verificat pe viu»), fie se adaugă `driver_key`
   în `tiki_ticket_attr` la `tiki_attr_month` și un agregat zilnic pe (zi, șofer, etichetă, picior). Nu join live cu
   `tiki_tickets` / `tiki_trips` în RPC. «Ruta principală» = eticheta din `tiki_daily_trip`, nu `crm_route_id`.

6. **[medium] Numitorul «pe zi» amestecă zile TIKI și zile numărate.** «Oameni transportați pe zi (TIKI + omiși)»: TIKI
   se împarte la zilele cu bilete, omișii la zilele numărate eligibile — altfel sunt subestimați (`get_tiki_od` deja le
   ține separat, 458:118-127). **Corecție:** în contractul RPC: `tiki_pe_zi = bilete / zile_tiki`, `omisi_pe_zi = omisi /
   zile_numarate`, suma pe zi = suma celor două; ambele numere de zile în răspuns.

7. **[medium] `statement_timeout '30s'` pe funcțiile paginii lucrează contra bazei comune.** Toate `get_tiki_*` din 452/458/
   459 au 30 s; funcția bate limita de 8 s a rolului `authenticator`, deci un apel lent ține baza 30 s în loc să moară.
   **Corecție:** RPC-urile noi (și cele vechi atinse) cu `SET statement_timeout '5s'` — dacă agregatele de la 1 sunt
   corecte, nu ating limita; dacă nu, panoul primește o eroare clară, nu lag pentru toți.

8. **[low] Verificarea «< 3 s prin API» fără condiții.** **Corecție:** măsoară prin API la rece (prima cerere după 10 min)
   pe cele mai grele intervale: comparație 12 luni vs 12 luni, rute 28.03–30.09, șoferi 6 luni; și `EXPLAIN (ANALYZE,
   BUFFERS)` care arată Index Scan pe agregate și zero citiri din `tiki_tickets`.

9. **[low] Testele nu sunt numite.** Calculul diferenței / %, pragul de acoperire și numitorii pe zi sunt pure — în
   `bilete/analiza.ts` cu `analiza.test.ts` (există deja), nu în componentă.

Deduceri: 1 (−2.0), 2 (−2.0), 3 (−2.0), 4 (−1.0), 5 (−1.0), 6 (−1.0), 7 (−1.5), 8 (−0.5), 9 (−0.3; testele există în
proiect, lipsește doar numirea lor). Total −11.3 → 10 − 11.3 < 0, limitat la 0.0.

Scor: 0.0 · Blocante (critical/high): 3

## Review runda 2: business-logic-auditor

Fapte verificate pe viu (01.10, doar tabele agregate: `tiki_plecari_daily`, `count_leg_daily`, `tiki_leg_daily`,
`tiki_ceilalti_od`, `tiki_label_daily`, `tiki_daily_trip`; fără `tiki_tickets` / `tiki_ticket_attr`):
- acoperirea pe picioare din grafic (`count_leg_daily.eligibil` ÷ rânduri `tiki_plecari_daily`, sursa grafic): 06.2026
  92,4 %, 07 94,6 %, 08 **92,1 %** (1.659 / 1.802), 09 **86,7 %** (1.480 / 1.707); pe plecări (Σ `plecari`): 09 = 85,7 %
  (1.488 / 1.736). Cifrele din 🔬 (1.536 / 1.764) s-au mișcat de azi-dimineață — baza s-a recalculat între timp;
- zile-rută complet numărate (toate picioarele din grafic eligibile): 08 — 848 / 929, 09 — **756 / 883**; 09.2026 pe
  rută: 13 — 0 / 16, **19 — 11 / 30 (37 %)**, 10 — 60 %, 27 — 70 %; restul 73–100 %;
- picioare numărate dar neeligibile pentru că n-au niciun bilet TIKI (`458:67-69`): 74 în 08, 52 în 09;
- plecări din grafic fără niciun bilet TIKI (`plecari − plecari_cu_bilete`): 201 în 08, **153 în 09**, concentrate:
  ruta 13 — 46 / 47, ruta 19 — 40 / 60, ruta 10 retur — 19 / 44;
- ruta 31: picioare eligibile 07.2026 **95 %**, 08.2026 **35 %**; omiși 335 → 144 (ambele luni trec pragul de 90 %);
- `is_anulare`: 24 de bilete în 03.2026, 0 în 04–09.2026;
- picioarele numărate fără rând în grafic (retur pe altă rută): 9 în 08, 2 în 09, niciunul eligibil — fără efect.

### Starea observațiilor din runda 1

| nr | esență | stare | de ce |
|---|---|---|---|
| 1 | șoferul în media colegilor | **închis** | «media colegilor fără el», ≥ 5 curse, «comparabile 20 / 30» (r. 41-44) |
| 2 | omiși pe zile nenumărate, numitori nedefiniți | **închis** pe definiție; efect nou → N3 | zile complet numărate, eșantion comun, steag < 50 % (r. 34-37) |
| 3 | numitorul acoperirii | **închis** | prag pe plecări din grafic (r. 23) — dar vezi N1 |
| 4 | perioade de lungimi diferite | **închis** pe «pe zi»; acoperirea diferită între perioade → N2 | r. 24, 30 |
| 5 | două mașini pe picior | **închis** | «Riscuri», r. 102 |
| 6 | eticheta × ziua săptămânii | **închis** ca fragmentare; amestecul de zile → N4 | rută × sens pe perioadă (r. 41-43) |
| 7 | Anulare / nelegate | **închis** | pasul 1, fără Anulare; nelegate la Comparație cu crm_route_id 0 |

### Observații noi

1. **high — implicitul «luna ultimă vs luna dinainte» pică pragul chiar pe luna pe care o cere Ion.** Planul: «Oameni»
   doar unde ≥ 90 % din plecările din grafic au picior numărat comparabil (r. 23); implicitul = luna ultimă (r. 26);
   exemplul de sus: «Septembrie: 52.000 de oameni transportați» (r. 28). Măsurat: 09.2026 = 86,7 % pe picioare, 85,7 % pe
   plecări. Scenariu: Ion deschide fila pe 02.10 → A = septembrie e sub prag → «Fără bilet» și «Oameni» = «—» pe tot
   tabelul, propoziția de sus nu se poate scrie; singura comparație cu oameni care trece e 08 vs 07 (luna veche). Cauza
   nu e lipsa Numărării ci trei rute (13, 19, 10) — restul flotei e la 90–100 %. Corecție, aleasă și scrisă în plan:
   (a) «Oameni» pe perioadă = Σ pe rută din zilele complet numărate, adusă la zilele circulate **pe rută** (exact eșantionul
   din «Rute»), cu pragul pe acoperirea **rutelor** (rute sub 50 % excluse și numite: «fără rutele 13, 19 — puțin
   numărate»), sau (b) pragul coborât la o valoare măsurată (ex. 85 %) cu motivul scris, sau (c) implicitul = ultima lună
   acoperită. Oricare — dar exemplul din plan să se poată produce pe datele de azi; test în `analiza.test.ts` cu 09.2026.

2. **high — sub prag nu înseamnă comparabil: o rută care își schimbă acoperirea între perioade urcă în topul «celei mai
   mari scăderi».** Tabelul Comparației ia omișii de pe toate picioarele eligibile, nescalat (r. 48 respinge scalarea),
   iar acoperirea se judecă doar pe perioadă. Măsurat: ruta 31 — iulie 95 %, august 35 %; omiși 335 → 144 (−57 %), deși
   ambele luni trec pragul (94,6 % / 92,3 %). Scenariu: Ion alege «august vs iulie» → perechile rutei 31 pierd jumătate
   din «fără bilet» doar pentru că n-au fost numărate, iar sortarea «cea mai mare scădere de oameni sus» (r. 30) le pune
   exact pe ele în primele rânduri, ca «clienți pierduți». Același lucru, mai mic, la nivelul totalului: diferența de
   acoperire 94,6 → 92,3 % dă singură ~−2,5 % omiși (~500 de oameni) în propoziția de sus. Corecție: «Fără bilet» în
   Comparație din aceeași regulă ca la Rute — pe rută, din zilele complet numărate, ÷ zilele numărate × zilele circulate
   (o singură estimare, nu «estimare peste estimare»: e media rutei, nu o scalare a totalului); sau, minim, perechile
   rutelor a căror acoperire diferă cu > 20 pp între A și B marcate «acoperire diferită» și scoase din sortarea pe
   scădere. Fără una din ele, topul tabelului măsoară operatorul Numărării, nu clienții.

3. **medium — eșantionul «zile complet numărate» e deplasat în sus, iar două cifre TIKI pe zi diferite stau una lângă
   alta.** O zi devine incompletă și când un picior numărat n-are niciun bilet TIKI (`458:67-69` îl face neeligibil; 52 în
   09.2026) — adică zilele slabe ies din eșantion. Măsurat 09.2026, pe rutele cu ≥ 3 zile incomplete: TIKI pe zi în
   zilele complete = **1,064 ×** TIKI pe toate zilele (0,98–**1,25**); zilele incomplete au cu 21 % mai puține bilete.
   Efect: «oameni pe zi» la Rute umflat ~6 %, până la 25 % pe o rută; propoziția de sus «31 cu bilet TIKI» (eșantion) ≠
   coloana «bilete TIKI pe zi» (toate zilele, r. 37) pe același rând. Corecție: (a) TIKI pe zi, în ambele locuri, pe
   toate zilele circulate; «fără bilet pe zi» = omiși ÷ zilele complete; oameni = suma — sau (b) dacă eșantionul comun
   rămâne, coloana TIKI separată se scoate și nota spune «pe zilele numărate». Și: media «56 pe rută» din propoziția de
   sus — peste câte rute (cu sau fără cele «puțin numărate»)? Scris în plan.

4. **high — Șoferi: rută × sens pe o lună amestecă zilele săptămânii, iar șoferii nu lucrează aceleași zile.** Formula
   (r. 41-44) compară biletele lui cu media colegilor pe rută × sens pe toată perioada. Măsurat pe `tiki_daily_trip`
   09.2026 (45 de șoferi cu ≥ 100 bilete, colegi ≥ 5 curse): așteptarea standardizată pe zilele în care a lucrat el
   (media colegilor pe rută × sens × zi a săptămânii, ponderată cu cursele lui) diferă de cea din plan cu **8 % în medie**
   din biletele lui, **max 34 %**; 11 / 45 peste 10 %, la **4 / 45 se schimbă semnul** («în minus» devine «în plus» sau
   invers). Scenariu: șofer pe linie fixă luni–joi pe o rută cu vineri / duminică pline → apare «−60 de bilete» în
   josul tabelului sortat, deși vinde cât colegii în aceleași zile. Nu e comparația pe zi a săptămânii respinsă (r. 47,
   celule de ~4 curse): e standardizare — o singură cifră, aceeași coloană. Corecție: așteptarea = Σ pe zilele lui
   (cursele lui în ziua săptămânii d × media colegilor pe rută × sens × d), cu revenire la media rută × sens pe celulele
   unde colegii au < 3 curse; testul «șofer doar în zilele slabe» în `analiza.test.ts`.

5. **medium — Șoferi: «curse» din bilete pierde plecările fără niciun bilet.** `tiki_sofer_daily(curse)` (pasul 1) nu
   spune sursa; dacă e din `tiki_ticket_attr`, o cursă cu 0 bilete nu există — 153 de plecări în 09.2026 (8,8 %). Cine
   are curse fără bilete primește medie pe cursă mai mare, nu mai mică — exact invers față de ce caută coloana «bilete în
   minus». Concentrarea (ruta 13: 46 / 47, ruta 19: 40 / 60) arată mai degrabă bilete atribuite pe altă rută decât
   șoferi care nu vând, deci rutele astea ar fi comparate greșit oricum. Corecție: cursele din grafic
   (`daily_assignments.driver_id` / `driver_id_retur`, ca în `457:68-81`), biletele din TIKI; rutele cu > 30 % plecări
   fără bilete — excluse din comparație și numite («atribuire nesigură»), nu tăcute.

6. **low — `get_tiki_perechi_v2` cu filtru pe șofer și coloana de omiși.** Omișii n-au șofer; cu filtrul pe șofer activ,
   coloana trebuie ascunsă sau marcată «toată ruta», altfel «TIKI ale lui + omiși ai tuturor» intră într-un «Oameni».
   Același lucru la filtrul pe rută 0 (nelegate): omiși 0, nu «—». Un rând în pasul 1 și în testul de filtru (r. 109).

7. **low — «plecările din grafic» vs picioarele.** `count_leg_daily` ține un singur picior pe zi × rută × sens, deci
   pragul pe plecări (85,7 %) și pe picioare (86,7 %) diferă tocmai pe picioarele cu două mașini; scrie care e numitorul
   (r. 23 zice «plecările») și folosește-l la fel în prag, în «zile numărate / circulate» și în 🔬.

Anulare: verificat — 0 bilete anulate în lunile cu Numărare (04–09.2026), excluderea nu atinge omișii; închis.

Deduceri: N1 −2,0 · N2 −2,0 · N3 −1,0 · N4 −2,0 · N5 −1,0 · N6 −0,5 · N7 −0,5.

Scor: 1.0 · Blocante (critical/high): 3

## Review runda 2: senior-backend-engineer

Fapte noi măsurate pe viu (01.10, zqkzqpfdymddsywxjxow, doar tabele agregate, fără `tiki_tickets`):
- `tiki_daily_pair` (aceeași granulație ca `tiki_pereche_daily` propus, cu șofer): 09.2026 = **10.979 rânduri** (fără șofer
  7.758, −29 %), 08.2026 = 11.598, 12 luni = **106.139**, **386 B / rând** → ~41 MB pe 12 luni;
- `tiki_leg_daily`: bilete cu **picior necunoscut** (`leg = '?'`, adică NULL în `tiki_ticket_attr`) 1.261–1.812 / lună în
  12.2024–03.2025, 44–566 în 04–07.2025, 4–170 până în 03.2026; nelegate (rută 0) 90–780 / lună până în 03.2026;
- `tiki_daily_pair`: în 12.2024–01.2026 **toate** biletele sunt `dedus_pret` (stațiile lipsesc, există doar `pair`), plus
  1–10 bilete / lună «Nedeterminat» (fără pereche deloc);
- șoferi din 04.2026: 57 de nume → 57 de chei `tiki_driver_key`, nicio pereche de chei cu ≥ 2 cuvinte comune;
- singurul apelant al RPC-urilor vechi e `biletAparatActions.ts:169,191,243,275` — scoaterea lor la (e) e sigură;
- refacerea: `cron/tiki-refacere/route.ts` (buget 200 s / apel, chemat după importul Mobilet și la 08:00) golește orice
  coadă; o lună ≈ 70 s azi (comentariul rutei); `count_refresh_queue` se golește **doar după** ce `tiki_refresh_queue` e
  goală (`456:16-40`).

### Starea observațiilor din runda 1

| nr | stare | unde |
|---|---|---|
| 1 join live în Comparație | închis | pasul 1, totaluri zilnice |
| 2 Rute cu join + normalizare | închis | agregate + `get_tiki_ruta_perechi` la clic |
| 3 ordinea lansării | închis în principiu; detaliul cozii — vezi N3 | pasul 3 |
| 4 acoperire diferită | închis (prag 90 %, «—», fără scalare — respingerea e motivată) | «Ce facem» |
| 5 sursa șoferilor | închis; cheia — vezi N5 | `sofer_cheie`, `tiki_sofer_daily` |
| 6 numitorii pe zi | închis (eșantion comun pe zile complet numărate) | «Ce facem» 2 |
| 7 `statement_timeout 30s` | închis (`'5s'` pe RPC-urile noi) | pasul 2 |
| 8 verificare la rece | închis | «Verificare» |
| 9 testele | închis | `bilete/analiza.test.ts` |

### Observații noi

1. **[high] Coloane NULL în cheia agregatelor noi → refacerea se blochează și oprește și Numărarea.** Planul (r. 66)
   calculează `pereche_cheie` «în `tiki_attr_month`, care are deja stațiile», iar cheia `tiki_pereche_daily` conține
   `leg` și `pereche_cheie`. Dar: (a) în 12.2024–01.2026 stațiile lipsesc la **toate** biletele (doar `pair` dedus din
   preț); (b) `leg` e NULL la 1.261–1.812 bilete / lună la începutul lui 2025 (`457:38-42`, CASE fără ELSE); (c) 1–10
   bilete / lună n-au pereche deloc. Scenariu: cheia ca PK `NOT NULL` → `tiki_aggr_month('2026-03-01')` aruncă «null value
   violates not-null constraint», tranzacția RPC-ului se anulează, luna rămâne în capul cozii; cum coada se ia DESC și
   Numărarea se reface doar cu `tiki_refresh_queue` goală (`456:16-40`), fiecare apel de la import / 08:00 refă luna
   curentă, se lovește iar de 03.2026 și întoarce 502 — **omișii nu se mai refac pentru nicio zi**, inclusiv în paginile
   vechi. Fără PK: «aceeași lună anul trecut» are tot anul 2025 într-o singură pereche NULL. **Corecție:**
   `pereche_cheie` din `coalesce(pair, from_station || ' - ' || to_station)` cu `tiki_stop_norm` pe ambele capete
   (aceeași formulă ca `PairsView.pairNorm` / 459:15), santinele scrise în plan: rută `0`, picior `'?'`, pereche
   `'nedeterminat'`, șofer `''`; toate coloanele cheii `NOT NULL`; pasul 4 măsoară întâi pe **01.2025 și 03.2026**
   (lunile cu NULL), nu doar pe 08.2026.

2. **[medium] `tiki_ticket_attr` nu are sursa perechii și capetele ei.** Coloanele inserate (`457:91`, `99`, `131`, `139`) sunt
   `ticket_key … lei, is_anulare` + km; planul adaugă doar `pereche_cheie` și `sofer_cheie`, dar cere în
   `tiki_pereche_daily` și `de_la`, `pana_la`, `bilete_statii`, `bilete_dedus`. Umplute în `tiki_aggr_month` din
   `tiki_ticket_attr`, ele cer join cu `tiki_tickets` (2,1 s + 258 MB citiți pe lună, ×22 luni în seara recalculului —
   exact sarcina care a încetinit panoul). **Corecție:** în `tiki_attr_month` se scriu din `_t` și `pereche_sursa`
   (`statii` / `dedus` / `nedeterminat`), `de_la`, `pana_la` (orientate după picior, ca în UPDATE-ul de km, `457:148-153`);
   `tiki_aggr_month` nu atinge `tiki_tickets`.

3. **[medium] Cine pune lunile în coadă și când — nespus; ruta cron le golește oricând.** `route.ts` golește orice coadă
   după importul Mobilet și la 08:00; migrațiile 452/457 au pus lunile în coadă în corpul migrației (`457:169-171`).
   Dacă 461 face la fel și se aplică ziua, recalculul (≈ 22 luni × ~75 s ≈ 28 min + lotul Numărării ~5.600 (zi, rută) / 60
   ≈ 94 de pași) pornește la următorul import, în orele de lucru. **Corecție:** migrația **nu** pune nimic în coadă; la
   20:00 un INSERT explicit pentru 12.2024–09.2026 (toate lunile din `tiki_ticket_attr`, altfel «anul trecut» rămâne gol);
   durata estimată în raport; dacă la 05:30 cozile nu sunt goale — oprire și decizie, nu continuare la 08:00.

4. **[medium] Varianta de rezervă C4 (agregatele în tranzacție separată) pierde luna la eșec.** Rândul din
   `tiki_refresh_queue` se șterge în tranzacția atribuirii (`456:16-18`); un pas separat de agregare care cade la timeout
   nu mai are ce relua, iar între cele două tranzacții tabelele vechi citite de pagină (`tiki_leg_daily`,
   `tiki_plecari_daily`) nu se mai potrivesc cu `tiki_ticket_attr`. **Corecție:** dacă se ajunge la rezervă — coadă proprie
   `tiki_aggr_queue(luna)` umplută în același pas cu atribuirea și golită înaintea `count_refresh_queue`, și doar
   agregatele **noi** mutate acolo; cele vechi rămân în pasul atribuirii.

5. **[low] Cheia șoferului e scrisă în două feluri.** `tiki_pereche_daily.sofer_cheie` vs `tiki_sofer_daily.sofer`;
   `tiki_driver_key` întoarce `text[]` (`457:15`). **Corecție:** `sofer_cheie text NOT NULL` =
   `array_to_string(tiki_driver_key(...), ' ')` în ambele tabele; numele afișat = numele cel mai frecvent pe cheie în
   perioadă; lista filtrului «șofer» din Tipuri bilet vine din aceeași cheie. Azi cheile nu se suprapun (57 / 57), deci
   doar contract.

6. **[low] Mărimea agregatului cu șofer nu e în «Verificat pe viu».** Estimarea mea din r1 («< 0,5 s») era fără șofer;
   cu șofer: ~11k rânduri / lună, 386 B / rând, Comparație 12 vs 12 luni ≈ 200k rânduri / ~80 MB la rece. Încape probabil
   în 3 s, dar nu e sigur. **Corecție:** faptul în 🔬, PK cu `zi` primul scris în pasul 1; dacă la rece > 3 s, un al doilea
   agregat fără șofer (−29 % rânduri) pentru Comparație și Rute.

7. **[medium] Drepturile pe obiectele noi nu sunt scrise.** Tabelele noi au nevoie de RLS + `REVOKE ALL … FROM PUBLIC,
   anon, authenticated` (`449:20-22`), RPC-urile `SECURITY DEFINER` de `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` +
   `GRANT … TO service_role` (`456:43-44`); fără ele, încasările și numele șoferilor se citesc cu cheia anon. Convenția
   există în toate migrațiile tiki, de aceea nu e blocant. **Corecție:** un rând în pasul 1 / 2.

8. **[low] «Zile circulate (plecări din grafic)» trebuie să filtreze `tiki_plecari_daily.sursa = 'grafic'`.** Tabelul
   are și rânduri `'bilete'` (picioare cu bilete, dar fără grafic, `453:82-90`); dacă intră, o zi devine «necomplet
   numărată» pentru un picior care nu era în grafic. **Corecție:** scris în contractul `get_tiki_rute` și testat.

9. **[low] Goluri de import în istoric.** Pe ziua vânzării: 12.2025 = 1.034 de bilete, 02.2026 = 18.538 (față de
   24–28k în lunile vecine). «Aceeași lună anul trecut» pentru 12.2026 va arăta ≈ −96 %. **Corecție:** RPC-ul întoarce
   pe perioadă și zilele fără niciun bilet TIKI; UI-ul scrie «date incomplete (N zile fără bilete)» în loc de procent.

Deduceri: N1 −2.0 · N2 −1.5 · N3 −1.0 · N4 −1.0 · N5 −0.5 · N6 −0.5 · N7 −1.0 · N8 −0.5 · N9 −0.5. Total −8.5.

Scor: 1.5 · Blocante (critical/high): 1

## Review runda 3: senior-backend-engineer

Fapte noi măsurate pe viu (01.10, zqkzqpfdymddsywxjxow; doar `tiki_ticket_attr` 09.2026, `tiki_leg_daily`,
`daily_assignments`, catalog; fără `tiki_tickets`):
- `tiki_refresh_queue` are `PRIMARY KEY (luna)`; `tiki_refacere_pas` (`456:16-18`) **șterge rândul lunii la începutul**
  tranzacției de ~70 s și îl ține până la commit;
- `daily_assignments`: 32–43 de rânduri / zi, cheie unică `(crm_route_id, assignment_date)`; scriu în ea graficul
  (`grafic/actions.ts:146,170,201,224,252-283`), atribuirile (`assignments/actions.ts:171,185,266,295,302`,
  `lib/atribuiri/core.ts:412-454`), botul de pe Railway (`apps/bot/src/services/db.ts:1246`) și `copy-assignments`
  (`vercel.json`: 20:00 UTC = 23:00 Chișinău, ~40 de rânduri pe ziua de mâine); azi are doar două triggere BEFORE;
- refacerea rulează la 06:30 și 08:00 (`tiki-mobilet.yml:11-12`), adică exact când dispecerii și botul atribuie;
- 09.2026, plecări din grafic: 1.736 (toate cu șofer); picioare cu ≥ 2 plecări: 29; aceeași mașină de două ori pe picior: 0;
- 09.2026, bilete fără Anulare: 26.746 (mașină 17.518, șofer 8.072, etichetă 1.156). **Biletele doar pe etichetă pe un
  picior cu ≥ 2 plecări: 0.** În schimb **1.121 de bilete (4,2 %) legate pe mașină / șofer n-au plecare în grafic cu
  plăcuța lor**: 905 pe 57 de picioare **fără nicio plecare în grafic** (candidatul vine din `counting_sessions`, `457:54-60`,
  ambele picioare), 216 pe 20 de picioare cu o singură plecare, dar cu altă mașină;
- N9 (respins în r2): confirmat — pe ziua cursei 12.2025 = 24.320 de bilete în 31 de zile (`tiki_leg_daily`). Închis.

### Starea observațiilor din runda 2

| nr | stare | unde |
|---|---|---|
| N1 NULL în chei | închis | pasul 1: santinele + test pe 01.2025 și 03.2026 |
| N2 sursa perechii în attr | închis | `pereche_sursa`, `pereche_de_la`, `pereche_pana_la` în `tiki_attr_month` |
| N3 cine pune în coadă | închis | pasul 3 (a)/(b), oprire la 05:30 |
| N4 rezerva C4 | închis | `tiki_aggr_queue` în aceeași tranzacție |
| N5 cheia șoferului | parțial — vezi R3 | `tiki_sofer_daily.sofer` încă alt nume decât `sofer_cheie`, sursa cheii nespusă |
| N6 mărimea în 🔬 | deschis (low) | faptul 106k rânduri / 386 B nu e în tabel; nici planul B (agregat fără șofer) |
| N7 drepturi | închis | pasul 3 (a) |
| N8 zile circulate din grafic | închis | «picioare circulate din grafic» |
| N9 goluri de import | închis (respins cu fapt, verificat) | triaj r2 |

### Observații noi (v5)

1. **[high] Triggerul pe `daily_assignments` blochează salvarea graficului și botul cât rulează refacerea lunii.**
   Pasul 5 pune luna în `tiki_refresh_queue` cu (implicit) `INSERT … ON CONFLICT DO NOTHING` pe `PRIMARY KEY (luna)`.
   Când `tiki_refacere_pas` lucrează luna curentă (06:30 și 08:00, ~70 s + agregatele noi), rândul ei e șters de o
   tranzacție neterminată; inserția cu aceeași cheie **așteaptă commitul acelei tranzacții** (verificarea unicității
   așteaptă tranzacția care a șters tuplul). Scenariu: 08:01, dispecerul pune șoferul pe ruta de mâine (aceeași lună) →
   UPDATE-ul atârnă până la ~120 s; pe rolul `authenticated` cade la `statement_timeout` 8 s cu eroare, pe service_role
   (graficul, botul) atârnă cât refacerea. `EXCEPTION WHEN OTHERS` **nu ajută**: e așteptare, nu eroare, iar
   `query_canceled` nu e prins de `OTHERS`. Aceeași fereastră în seara recalculului (23:00, `copy-assignments` pe luna
   curentă). **Corecție:** triggerul nu atinge coada cu PK: `FOR EACH STATEMENT` cu tabele de tranziție (OLD / NEW) scrie
   lunile distincte într-un jurnal **fără cheie unică** `tiki_refresh_dirty(luna, pus_la)`; `tiki_refacere_pas` mută
   jurnalul în coadă la început (`INSERT … SELECT DISTINCT … ON CONFLICT DO NOTHING; DELETE … RETURNING`), în propria
   tranzacție. Fără `EXCEPTION WHEN OTHERS`: un INSERT simplu într-un tabel fără constrângeri nu are ce să arunce, iar o
   eroare reală trebuie să se vadă. Test: refacerea lunii curente pornită într-o sesiune, UPDATE pe `daily_assignments`
   în alta → se întoarce în < 100 ms.

2. **[medium] «Cursa = plecare din grafic» nu acoperă 4,2 % din biletele legate pe mașină / șofer; conservarea Σ
   promisă în «Ce facem» 3 cade.** «Ambigue» în v5 sunt doar biletele pe etichetă pe picior cu ≥ 2 plecări — **0** în
   09.2026. Gaura reală e alta: 905 bilete pe 57 de picioare unde graficul n-are plecare (atribuirea le-a legat prin
   mașina sesiunii Numărării) și 216 pe picioare cu o plecare, dar cu altă mașină decât a biletelor. Primele dispar din
   raport (nu există cursă la care să meargă); celelalte fac cursa șoferului din grafic «cu 0 bilete» și îi pun
   **bilete în minus fals** — exact șoferul care n-a condus. **Corecție:** mulțimea plecărilor = aceeași ca în
   `tiki_attr_month` (`_c` / `_cd`): grafic ∪ sesiunile Numărării, sesiunea înlocuind mașina **și șoferul**
   (`counting_sessions.driver_id`) pe rută × picior × zi; o singură funcție SQL (ex. `tiki_plecari(v_from, v_to)`)
   folosită de atribuire, de `tiki_plecari_daily` și de agregatul șoferilor — azi aceeași logică e copiată în `452`, `453`,
   `457`. Biletele care tot nu au plecare intră într-un coș numit «fără plecare în grafic», arătat lângă «fără șofer
   sigur», și Σ se verifică cu el. Test pe 09.2026: coșul < 1 % după corecție.

3. **[medium] `tiki_sofer_daily` din pasul 1 nu poate produce formula din «Ce facem» 3.** Definiția
   `(zi, sofer, crm_route_id, leg, curse, bilete, lei)` e umplută din bilete în `tiki_aggr_month`; formula cere și
   plecările **cu 0 bilete** (153 în 09.2026), coșul ambiguu / fără plecare și șoferul **din grafic**, nu din TIKI. Nu e
   scris: (a) tabelul se umple din plecări `LEFT JOIN` bilete (altfel cele 153 nu există); (b) ce e `sofer`: `driver_id`
   din grafic (≥ 04.04.2026) sau cheia de nume TIKI (înainte) — dacă `tiki_pereche_daily.sofer_cheie` (filtrul din Tipuri
   bilet) ia numele din TIKI, iar Șoferi ia șoferul din grafic, același filtru «șofer» dă alte bilete în cele două file
   (`sofer` din TIKI ≠ șoferul graficului la 33 % din biletele pe etichetă, `457:7`). Dimensiunea mașinii **nu** trebuie
   în agregat: așteptarea e liniară, deci (curse, bilete) pe (zi, șofer, rută, picior) ajung, dacă biletul primește
   șoferul plecării lui în `tiki_attr_month` (`sofer_cheie` + `sofer_sigur bool`). **Corecție:** o singură definiție
   «șoferul biletului = șoferul plecării lui (grafic ∪ sesiune); înainte de 04.04 — numele din TIKI», scrisă în attr și
   folosită de ambele tabele; `driver_id` în agregat (stabil), numele afișat din `drivers`; coloane `bilete_fara_sofer`
   la nivel de (zi, rută, picior).

4. **[low] Invalidarea acoperă doar `daily_assignments`.** Atribuirea depinde și de `counting_sessions.vehicle_id /
   driver_id` (triggerul lor pune doar zilele Numărării, `452:495-497`, nu luna TIKI), `tiki_label_override`,
   `route_cancellations` (`453:79`) și redenumirile din `drivers` / `vehicles`. Corectura mașinii pe sesiune schimbă
   legarea biletelor fără să refacă luna. **Corecție:** același jurnal din R1 pus și de triggerul pe `counting_sessions`
   (coloanele mașină / șofer / rută / zi) și de `tiki_label_override`; celelalte — notate ca limită.

5. **[low] Amplificarea scrierilor e mică — de scris ca fapt, nu ca risc.** Luna curentă e deja în coadă după fiecare
   import (`tiki_enqueue_import`), deci triggerul adaugă cost doar pentru lunile trecute (o corectură în iulie = o lună
   ~70 s + zilele Numărării ei, ~15 pași de 60) și, în ultima zi a lunii, pentru luna următoare goală (23:00,
   `copy-assignments`). Cu triggerul pe instrucțiune (R1), `copy-assignments` (~40 de rânduri) = un singur rând în
   jurnal. Fără limită de frecvență nu e nevoie.

Deduceri: R1 −2.0 · R2 −1.5 · R3 −1.0 · R4 −0.5 · R5 −0.2 · N6 (rămas) −0.3. Total −5.5.

Scor: 4.5 · Blocante (critical/high): 1

## Review runda 3: business-logic-auditor

Fapte verificate pe viu (01.10, doar tabele agregate și `daily_assignments`; fără `tiki_tickets` / `tiki_ticket_attr`):
- **acoperirea pe rută (picioare eligibile ÷ picioare din grafic), prag 90 %**: 06.2026 — 27 / 30 rute; 07 — 28 / 30;
  08 — 27 / 30 (sub: 12 89 %, 13 5 %, 31 35 %); **09 — 18 / 30** (sub: 5 73, 10 62, 11 78, 13 0, 14 83, 15 77, 18 85,
  19 68, 23 73, 24 80, 27 70, 31 80 %). Rute numărate în **ambele** 08 și 09: **17**; ele au **11.700 din 19.450** de
  omiși ai lui septembrie (60 %);
- cauza: o gaură a Numărării pe toată flota **05–13.09** (66–78 % pe zi; 388 de picioare numărate față de 520 în
  14–22.09, doar 10 neeligibile — lipsesc sesiuni, nu eligibilitatea) și **30.09 la 72 %**; restul zilelor 88–100 %.
  Cozile `count_refresh_queue` / `tiki_refresh_queue` sunt goale, deci nu e o refacere în curs;
- «zile complet numărate» (r2): ruta 19 — 11 / 30 zile = 37 %. Planul (r. 23) a preluat «19 37 %» ca acoperire pe
  **picioare**; pe picioare ruta 19 are 68 %;
- Șoferi, 09.2026, din `daily_assignments` (1.125 de curse cu șofer): colegii au ≥ 3 curse pe rută × zi a săptămânii la
  **233 (21 %)**; revin la rută × sens pe lună **743 (66 %)**; necomparabile 149 (13 %);
- picioare din grafic cu ≥ 2 plecări: 25–32 pe lună (04–09.2026, ~1,7 %); `daily_assignments` cu retur pe altă rută:
  59 / 1.125 în 09.2026 (fără șofer / mașină diferită pe retur);
- trigger-ul existent pe Numărare (`452:463-497`) pune în `count_refresh_queue` (zi, rută), iar `tiki_attr_month` pune
  zilele lunii în aceeași coadă (`456:25`) — lanțul grafic → atribuire → omiși se închide prin trigger-ul nou din pasul 5;
  importul pune oricum luna curentă în coadă (`452:539-551`).

### Starea observațiilor din runda 2

| nr | esență | stare | de ce |
|---|---|---|---|
| 1 | 09.2026 sub prag pe perioadă | **închis ca regulă, redeschis ca efect → R3 · 1** | acoperirea e pe rută (r. 22-24), dar pe 09.2026 trec 18 rute, nu 27 |
| 2 | salt de acoperire = clienți pierduți | **închis** pe ruta 31 (aceeași mulțime de rute, r. 31-33); efect rezidual → R3 · 1 | |
| 3 | eșantion deplasat, două cifre TIKI | **parțial** → R3 · 3 | Verificarea (r. 132) le separă, «Ce facem» (r. 38-39) încă cere eșantion comun |
| 4 | zilele săptămânii la șoferi | **închis pe hârtie, deschis în fapt** → R3 · 2 | regula (r. 49-50) cade pe rezervă la 66 % din curse |
| 5 | curse fără bilete | **închis** | curse din grafic, 0 bilete incluse (r. 44-45); media pe rută × sens se autonormează |
| 6 | omiși cu filtru pe șofer | **închis** | coloana se ascunde (r. 129-130) |
| 7 | numitorul pragului | **închis** | picioare circulate din grafic (r. 24) |

### Observații noi

1. **high — «aceeași mulțime de rute numărate în A și B», cu prag binar 90 % pe rută × perioadă, lasă implicitul fără
   40 % din oameni.** Planul (r. 22-24, 31-33) și exemplul «pe 27 din 30 de rute (lipsesc 13, 19, 10)» presupun că doar
   trei rute sunt slab numărate. Măsurat: pe 09.2026 trec pragul **18 rute**; mulțimea comună 09 ∩ 08 are **17 rute**, cu
   60 % din omiși. Cauza e o gaură de 9 zile pe toată flota (05–13.09), nu rutele: o rută cu 20 de zile complet numărate
   iese întreagă pentru că 9 zile lipsesc. Scenariu: Ion deschide «Comparație» pe 02.10 → «Fără bilet» și «Oameni» pe
   17 din 30 de rute, propoziția de sus spune «pe 17 din 30 de rute (lipsesc 5, 10, 11, 13, 14, 15, 18, 19, 23, 24, 27,
   31)», iar «Oameni transportați» în septembrie ≈ jumătate din cel real; exemplul din plan nu se poate produce. În plus,
   înăuntrul pragului omișii rămân nescalați: o rută la 90 % într-o lună și 100 % în cealaltă arată singură −10 % «fără
   bilet», iar «Rute» (prag 50 % pe zile complete) și «Comparație» (90 % pe picioare) dau pentru aceeași rută și lună o
   cifră și «—». **Corecție:** în «Comparație» aceeași estimare ca în «Rute» — pe rută, fără bilet pe zi din zilele
   complet numărate × zilele circulate ale rutei, cu ruta inclusă dacă are ≥ 50 % zile complete în **ambele** perioade
   (o singură regulă, o singură cifră pe rută în ambele file); exemplul din plan refăcut pe 09 vs 08 de azi și pus în
   🔬; test în `analiza.test.ts` cu o gaură de 9 zile pe toată flota.

2. **high — standardizarea pe zi a săptămânii la Șoferi se aplică doar la 21 % din curse.** Regula (r. 49-50): media
   colegilor pe rută × sens × zi a săptămânii dacă au ≥ 3 curse acolo, altfel rută × sens. Pe o lună (implicitul, r. 42)
   o celulă rută × zi a săptămânii are 4–5 curse, iar șoferul de linie fixă le ia pe cele mai multe — colegii rămân
   sub 3. Măsurat 09.2026: 233 / 1.125 curse au celula de zi a săptămânii, **743 (66 %) cad pe rută × sens** — exact
   amestecul măsurat în r2 · 4 (abatere medie 8 %, max 34 %, semn schimbat la 4 / 45 șoferi). Scenariul din r2 rămâne
   neschimbat: șofer luni–joi pe o rută cu vineri / duminică pline apare «în minus». **Corecție:** așteptarea =
   media colegilor pe rută × sens (≥ 5 curse, fără el) **× indicele zilei săptămânii** al rutei × sens, luat pe o
   fereastră lungă (ex. 90 de zile, toți șoferii — indicele nu e al lui, deci nu-l favorizează) sau pe toată flota dacă
   ruta are < 3 curse pe zi a săptămânii în fereastră; testul «șofer doar în zilele slabe» cu celule de 4 curse, nu cu
   celule pline.

3. **medium — «Rute»: textul cere eșantion comun, verificarea cere eșantioane separate.** R. 38-39: «TIKI și fără bilet
   din aceleași zile (eșantion comun, Codex C1)»; r. 132: «TIKI pe zi pe toate zilele circulate și fără bilet pe zi pe
   zilele complet numărate, separate». Implementatorul va alege una; diferența e 6 % în medie, 25 % pe o rută (r2 · 3).
   Și «se ține pe» (procentul perechii în oamenii rutei) trebuie să ia TIKI și fără bilet pe zi din același tip de
   rată, altfel procentele nu dau 100 %. Propoziția de sus «în medie 56 de oameni pe zi pe rută» nu spune peste câte
   rute (cu sau fără cele «puțin numărate»). **Corecție:** r. 38-39 rescris după r. 132 (TIKI pe zi pe toate zilele,
   fără bilet pe zi pe zilele complete, oameni = suma ratelor, perechile la fel); media de sus doar peste rutele cu
   oameni, numărul lor spus.

4. **low — curse pe picioare dublate: biletele ambigue ies, cursele rămân.** Biletele doar pe etichetă pe un picior cu
   ≥ 2 plecări ies din comparație (r. 47-48), dar cele două curse rămân în ea cu mai puține bilete decât au dus — șoferul
   celei de-a doua mașini de vineri pare «în minus». 25–32 de picioare / lună, efect mic. **Corecție:** o cursă de pe un
   picior cu bilete ambigue iese din «comparabile» (numărată la «necomparabile»), nu doar biletele.

5. **low — ultima zi a lunii încă nenumărată în implicit.** 30.09 are 72 % pe 01.10; luna implicită deschisă pe 01–02.10
   are ultima zi incompletă. Cu regula din observația 1 (zile complete pe rută) efectul dispare singur; cu regula de azi
   (90 % pe rută × lună) mai scoate rute. **Corecție:** niciuna separată dacă se ia observația 1; altfel nota «ultima
   zi încă se numără».

6. **low — trigger-ul pe `daily_assignments` refă luni trecute ziua.** Pasul 5 pune luna în coadă, iar coada se golește
   după import / la 08:00 — o corectură pe iulie face refacerea lui iulie (atribuire + agregate + lotul Numărării) în
   orele de lucru, adică sarcina pe care pasul 3 o mută seara. Copierea automată a graficului (`auto_copied`) inserează
   zilnic zeci de rânduri — trigger-ul să fie `FOR EACH STATEMENT` cu tabelele de tranziție (o linie pe lună, nu pe rând).
   **Corecție:** luni ≠ luna curentă puse cu `motiv = 'grafic'` și golite doar în rularea de seară; trigger pe
   instrucțiune.

Deduceri: R3 · 1 −2,0 · R3 · 2 −2,0 · R3 · 3 −1,0 · R3 · 4 −0,5 · R3 · 5 −0,5 · R3 · 6 −0,5. Total −6,5.

Scor: 3.5 · Blocante (critical/high): 2
