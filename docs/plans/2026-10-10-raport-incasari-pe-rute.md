# Raport încasări factice pe rute, pe perioadă (după data foii de parcurs)

## De ce

Ion, 10.10.2026: «am nevoie raport încasări factic per perioadă (Data foiei de parcurs) per rută».
Azi în /numarare → Încasare există «Pe rute (sumar)», dar acolo un rând = o rută într-o zi
(o lună = 1138 de rânduri). Nu se vede cât a adus FIECARE RUTĂ pe o perioadă. Ion a ales
(10.10): filă în /numarare + export Excel, perioada se alege în filă («vreau să fie alegerea
acolo în filă»).

## Ce facem

**Ales — A: sub-filă nouă «Raport pe rute» în fila Încasare, agregare pe server în TS din
`get_grafic_report`, plus o reparație mică a RPC-ului (bani care azi dispar fără urmă).**
Acțiunea de server cheamă RPC-ul pentru perioada aleasă, adună rândurile rută×zi pe
`crm_route_id` și întoarce la client doar rândurile agregate (~45) + totalurile + banii fără
rută. Aceeași sursă ca «Pe rute (sumar)» ⇒ cifrele se potrivesc la leu cu ce operatorul vede
zilnic (aceleași reguli de foaie, corecții, ștergeri, anti-dublare din migr. 522).

Respinse:
- **B: funcție SQL nouă care agregă în bază.** O a doua definiție a sumei, care deviază de la
  522 la următoarea schimbare. Câștigul (mai puțini octeți Supabase→Vercel) nu contează la
  ≤ 92 zile (3,9 MB, măsurat).
- **C: sumă directă din `tomberon.transactions` + `casier_manual_rows`.** Reimplementează
  legarea foaie→rută — exact locul unde s-au pierdut bani înainte (521: 6.570 lei). Se
  folosește DOAR ca control independent în verificare (pasul 8), nu în raport.

## Deciziile lui Ion (10.10.2026)

1. Format: «Filă în /numarare + Excel»; perioada se alege în filă.
2. Rutele cu curse fără bani în casă (Otaci, Ocnița, Lipcani-Viișoara, Șirăuți, Corjeuți…):
   «Nu știu, să iasă în evidență» → coloane «Fără încasare» + «Numărat pe ele» + steag.
3. Banii care dispar azi (foaie legată de o rută pe care șoferul n-a făcut-o): «Repară și în
   raportul zilnic» → migrație pe `get_grafic_report`.
4. Total: «Da, ca la INC» (numerar + diagramă + ligotnici 0 + ligotnici gară + combustibil DT
   + cheltuieli), fiecare rubrică în coloana ei.

## Definiții (ce înseamnă fiecare cifră)

- **Perioada** = data foii de parcurs. Un rând al RPC-ului = cursa din /grafic din ziua `ziua`
  (= `daily_assignments.assignment_date`); banii de pe terminal se pun pe ziua foii
  (`effective_ziua`, 522:372-397), banii manuali neatașați pe `COALESCE(data_foaie, ziua)`
  (522:402), cei atașați unei curse pe ziua cursei (522:426-441). Deci filtrul pe `ziua`
  rândului = filtru pe data foii. Plata întârziată intră în ziua foii, nu în ziua plății.
- **Rută** = ruta de TUR din /grafic (`crm_route_id`). Încasarea întregii curse (tur + retur)
  stă pe ruta de tur, inclusiv când returul e pe altă rută (`retur_route_id`, 59 curse în
  sep.). Foaia «zilei» (fără rută) a unui șofer cu mai multe curse merge pe UNA (522:337-345).
  Afișare: nume + ora plecării din nord (`time_nord`) + id, pentru că numele se repetă.
  Grupare: Interurban, apoi Suburban, cu subtotal pe grup.
- **Rubrici (sumă pe perioadă, pe TOATE rândurile rutei, inclusiv cele anulate — ca în
  «Pe rute (sumar)», RoutesTable.tsx:119-123):** Numerar, Diagramă, Ligotnici 0, Ligotnici gară,
  Combustibil DT, Cheltuieli.
- **Total foaie** = suma celor șase rubrici, aceeași funcție `incTotal` (RoutesTable.tsx:41-48),
  mutată într-un modul comun. Eticheta coloanei: «Total foaie», cu nota «include combustibil și
  cheltuieli».
- **Curse** = rânduri neanulate. **Cu încasare** = neanulate cu Total > 0. **Fără încasare** =
  neanulate cu Total = 0. Invariant testat: Cu + Fără = Curse. (Nu pe statut: statutul RPC se
  calculează pe numerar+diagramă, 522:518-525.)
- **Numărat pe cursele fără încasare** = Σ `numarare_lei` pe cursele «Fără încasare».
- **Steag roșu** pe rută: Cu încasare < 50 % din Curse (cu Curse ≥ 3).
- **Medie pe cursă** = Total / Cu încasare; «—» dacă Cu încasare = 0.
- **Numărare** = Σ `numarare_lei` pe toate cursele (ca `totals.num`, RoutesTable.tsx:122).
  **Diferență** = Σ (Total − Numărare) doar pe cursele care au ambele > 0.
- **Bani fără rută** (sub tabel; în «Total general»), pe categorii:
  - plăți de terminal fără cursă (`orphan_incasare`: NO_FOAIE, INVALID_FORMAT,
    FOAIE_FARA_CURSA) — suma pe cele șase rubrici din `breakdown`, NU `incasare_lei`
    (care e doar numerar+diagramă, 522:650);
  - rânduri manuale `fara_ruta` / `fara_identificare` — `total_lei`.
  - Data lor: RPC-ul le filtrează pe ziua PLĂȚII (522:631) / `COALESCE(data_foaie, ziua)`
    (522:615). Pentru FOAIE_FARA_CURSA există și o zi a foii: migrația adaugă `ziua_foaie`
    în obiect, iar raportul o afișează lângă ziua plății. Regula de numărare rămâne ziua
    plății: așa fiecare leu apare într-un singur raport din două perioade consecutive.
  - rânduri manuale `cursa_gresita` (nou, vezi migrația) — rândul e atașat unei curse, dar foaia
    lui e în /grafic pe ALTĂ cursă și n-a trecut prin terminal: bani reali, puși greșit. Se arată
    cursa corectă (șofer, rută, zi) ca s-o reatașeze casierul. Caz viu: foaia 1126555, 5.961,90
    lei, atașată cursei de pe ruta 23 (05.10), e a lui Oleinic V., ruta 5 «Șirăuți», 05.10
    (numărarea acolo 5.961).
- **De verificat (afișat separat, cu dovezi)** — motivele `dublura_terminal` (foaia rândului manual
  a trecut și prin terminal; 522:446-448) și `cursa_cu_terminal` (rând atașat unei curse care a
  primit bani de la terminal pe altă foaie; prod:269-271). Nu se știe din date dacă e copie sau
  complement: foaia 1126627 are 3.400 manual + 1.714,26 terminal = 5.114,26 față de numărarea
  4.904 — complement, nu copie. De aceea fiecare rând arată dovezile: `terminal_pe_foaie_lei`
  și `numarare_cursa_lei`, iar raportul arată DOUĂ cifre: «Total general» și, imediat sub,
  «Total general + De verificat». Ion decide pe rând, în documentul de casier.
- **Total general** = Total pe rute + Bani fără rută.

## Migrația 549 — banii care dispar fără urmă

Cazul: foaia e legată în `driver_cashin_receipts` de ruta X; șoferul, în ziua foii, are în
/grafic doar alte rute, fiecare cu foaia ei legată. `explicit_attributions` (522:258-271) nu
atașează foaia nicăieri, iar `matches.fara_cursa` (522:640-643) cere ca șoferul să n-aibă
NICIO cursă în ziua foii ⇒ nici orfan. Comentariul de la 522:330-332 promite că acest caz e
«detectat separat, ca orfan FOAIE_FARA_CURSA» — codul nu o face.

Reparația (cinci schimbări, toate în `get_grafic_report`, restul funcției neatins):

1. **Plata de terminal care nu ajunge pe nicio rută devine orfan.** Două condiții, legate cu SAU:
   - (a) negarea exactă a predicatului din `explicit_attributions` (copiat, cu comentariu că
     se schimbă împreună) — prinde cazurile al căror `effective_ziua` iese din fereastră;
   - (b) robust, pe rezultat, nu pe regulă: `ziua_foaie` ∈ [p_from, p_to] și perechea
     (foaie, `ziua_foaie`) NU e consumată de niciun rând din `routes_status`. Mulțimea consumată
     se capturează în primul SELECT ca `text[]` (`foaie_nr || '|' || ziua`), lângă
     `v_manual_atasate`. (b) prinde și pierderile de după predicat: două foi neancorate pe
     aceeași cursă (`effective_route`), cursa suburbană scoasă din `base_pairs` în zi liberă,
     o corecție cu `data_foaie` într-o zi fără cursă — azi 0 apariții, dar posibile.
   - `ziua_foaie` = aceeași regulă ca `effective_ziua` din `kiosk_fixed`: `data_foaie` din
     corecție, altfel `dcr.ziua` cea mai apropiată de ziua plății (`ORDER BY ABS(...)`,
     prod:149). Câmpul intră și în obiectul orfan.
   - **Fereastra internă** (Codex r2 C1): rutele se calculează pe [p_from, p_to] lărgit până la
     zilele foilor plătite în perioadă (plafon 62 zile înapoi, 31 înainte), iar în raport ies doar
     rutele din [p_from, p_to] (`jsonb_agg … FILTER`). Așa plata din 01.10 a unei foi din 30.09
     pierdute la anti-dublare e judecată pe cursa ei ⇒ orfan în octombrie. Regula (a) rămâne
     doar dincolo de plafon.
   - `has_override` rămâne cum e (0 rânduri în `tomberon_payment_overrides`).
2. **Rândurile manuale șterse nu mai sunt orfani** (Codex C2): `m.sters_la IS NULL` în
   `v_orphan_manual` (prod ~347-351; `manual_rows` îl are, 522:409).
3. **O singură zi de apartenență pentru rândul manual** (Codex C3): la orfani, ziua =
   `daily_assignments.assignment_date` a cursei (dacă `assignment_id` există), altfel
   `data_foaie`, altfel `ziua` — exact regula după care rândul intră în `manual_rows` (prod:177-179).
4. **Motive noi și dovezi pe `orphan_manual`** (Codex C1 + auditor r2 #1):
   - `cursa_gresita`: `assignment_id` nenul, `foaie_nr` găsit în `driver_cashin_receipts` pe alt
     (șofer, zi) sau altă rută decât cursa, și foaia fără nicio plată la terminal;
   - `cursa_cu_terminal`: `assignment_id` nenul și cursa are plăți de la terminal — capturat ca
     `uuid[]` în primul SELECT (`plati > 0`), nu prin scanarea jsonb-ului `v_routes`;
   - câmpuri noi: `assignment_id`, `foaie_cursa` ({sofer, ruta, ziua} din dcr pentru foaie),
     `terminal_pe_foaie_lei`, `numarare_cursa_lei`.
   - Ordinea: `dublura_terminal` → `cursa_gresita` → `cursa_cu_terminal` → `fara_identificare`
     → `fara_ruta`. Bannerul din IncasareTab primește textele motivelor noi, iar textul vechi al
     lui `dublura_terminal` («șterge rândul manual») se înlocuiește cu «compară sumele: poate fi
     dublură, poate fi rest predat în numerar; nu șterge fără verificare» + suma de la terminal
     (Codex r2 C2): singurul caz viu era complement, nu copie. Același text în raport și Excel.
5. Comentariul de la 522:330-332 se corectează să descrie ce face codul.

«De verificat» = `dublura_terminal` + `cursa_cu_terminal`; «Bani fără rută» = restul
(inclusiv `cursa_gresita`).


- Baza = `pg_get_functiondef('get_grafic_report')` de pe prod (nu fișierul 522: 534 a mai
  schimbat ceva — verificat: prod = 522 + doar `has_new_payments_after` din 534; definiția salvată în scratchpad); diff-ul față de ea = doar cele cinci schimbări. Se păstrează REVOKE/GRANT
  (522:818-819: doar service_role).
- Efect vizibil: zilele cu astfel de plăți primesc alertă «foaie fără cursă» în Încasare și
  butonul «Confirmă ziua» se blochează până se rezolvă (IncasareTab.tsx:197) — dorit, banii
  trebuie atribuiți.
- Aplicare: `db-migrate.sh translux --dry-run` apoi fără; înainte de push-ul codului (codul
  nou citește `ziua_foaie` opțional, deci funcționează și fără).

## 🔬 Verificat pe viu

| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| RPC-ul suportă o lună / trei luni | `get_grafic_report` pe 01–30.09 și 01.07–30.09, clock_timestamp | 30 zile: 2,05 s (rece), 1138 rânduri; 92 zile: 0,64 s (cald), 3511 rânduri, 3,94 MB | Limită 92 zile; agregare pe server |
| Fiecare rând are rută | count crm_route_id null, iul–sep | 0 | Grupare pe crm_route_id |
| Numele de rută se repetă | distinct id:nume, iul–sep | 44 rute; «Chișinău - Lipcani» ×6, «Chișinău - Criva» ×8 | Afișăm ora + id |
| Tipul rutei | `crm_routes` group by route_type | interurban 30, suburban 14, fără NULL | Grupare |
| Rânduri anulate cu numerar | count cancelled ∧ numerar>0, iul–sep | 0 | Curse = neanulate |
| Rute cu curse fără bani | agregare sep. pe rută, cu_inc < 70 % | Otaci 16:25 0/30 (199.967 lei numărați), Otaci 12:35 3/30, Ocnița 08:00 3/30, Lipcani-Viișoara 3/30, Șirăuți 5/30, Ocnița 05:30 12/30, Corjeuți 13/30, Lipcani-Rîșcani 2/16 — toate cu foaie | Decizia 2 a lui Ion; steag |
| Bani pierduți (revizor) | sumă independentă terminal pe effective_ziua vs rute + orfani | sep.: 7.678,76 lei (foaia 944925, 04.09, legată de ruta 24, șoferul pe ruta 9 cu foaia 9449320) nicăieri; aug.: 16.331,65 lei pe 2 foi; iul.: 0 | Migrația 549 |
| Orfani în sep. | orphan_incasare / orphan_manual | 4 plăți terminal (ex. «Empty», 7.236,59 lei); 0 manuale; pe 6 rubrici 13.996,67 vs 13.741,67 pe 2 | Suma pe breakdown |
| Dubluri manual/terminal | orphan_manual 01–09.10 | foaia 1126627: 3.400 lei manual `dublura_terminal` + 1.714,26 terminal; foaia 1126555: 5.961,90 `fara_ruta` cu assignment_id | Blocul «De verificat» |
| Corecții care mută data foii | casier_amount_corrections cu data_foaie | 0 azi | Filtrul pe ziua rândului e exact |
| Excel disponibil | apps/admin/package.json:42 | `xlsx` 0.20.3 (azi folosit doar pe server, lib/lde/combustibil-xls.ts:3) | Import dinamic pe client |
| Drepturi | incasareActions.ts:176-186, NumararePageClient.tsx:30-46 | vizualizare ADMIN + EVALUATOR_INCASARI | Același `isViewer` |

## Pași

1. **Migrația** `packages/db/migrations/549_grafic_report_foaie_neacceptata.sql`. Rezultat
   (măsurat în tranzacție de probă cu ROLLBACK, 10.10): 01–30.09 rutele neschimbate la leu (1138
   rânduri, numerar 4.380.870,00, diagramă 641.666,82); foaia 944925 apare FOAIE_FARA_CURSA cu
   `ziua_foaie` 2026-09-04; 01–09.10: 1126555 → `cursa_gresita` (5.961,90 lei, cursa corectă
   «Chișinău - Șirăuți», Oleinic Vasile, 05.10) ⇒ în «Bani fără rută» și Total general;
   1126627 → `dublura_terminal` (3.400 manual, 1.732,26 terminal) ⇒ «De verificat»; o zi 0,33 s,
   92 zile 0,90 s.
2. `.../numarare/tabs/incasare-total.ts` — `incTotal` (din RoutesTable.tsx) + `incTotalBreakdown`
   pentru orfanii de terminal. RoutesTable îl importă; vizual neschimbat.
3. `.../tabs/raport-rute.ts` (fără `'use server'`) — funcții pure:
   - `valideazaPerioada(from, to)` — ISO, from ≤ to, ≤ 92 zile inclusiv capetele;
   - `perioadaImplicita(azi)` — de la 1 la ieri; pe ziua 1 a lunii: luna trecută întreagă;
   - `agregaPeRute(rows, routeTypes: Map<number,string>, orphanInc, orphanManual)` →
     `{ rute, subtotaluri: {interurban, suburban}, totalRute, faraRuta: {categorii, total},
       deVerificat: {randuri, total}, totalGeneral }`.
   Teste `raport-rute.test.ts` (vitest).
4. `incasareActions.ts` → `getRaportPeRute(from, to)`: sesiune + `isViewer`; `valideazaPerioada`;
   `get_grafic_report`; `crm_routes select('id, route_type')`; întoarce agregatul. Eroare de
   timeout → mesaj «Perioada e prea lungă pentru o singură încărcare — alege mai scurtă».
5. `.../tabs/RaportRuteTab.tsx` — propriile câmpuri «De la / până la» (implicit
   `perioadaImplicita`), scurtături «Luna curentă», «Luna trecută»; id de cerere (răspunsul
   vechi se aruncă). Tabel sortabil (implicit Total desc în grup), subtotaluri, Total general,
   «Bani fără rută» (cu ziua plății și ziua foii), «De verificat», nota «zilele din ultima
   săptămână se pot completa: șoferii plătesc până la 5 zile după cursă». Stiluri inline (resetul
   CSS din admin bate Tailwind).
6. Excel: `await import('xlsx')` în handlerul butonului. Foaia «Pe rute» (bani `t:'n'`, format
   `#,##0.00`; antet cu perioada ca text DD.MM.YYYY și data generării), foaia «Bani fără rută»
   (ziua plății, ziua foii, categorie), foaia «De verificat». Nume
   `incasari-pe-rute_<from>_<to>.xlsx`.
7. `IncasareTab.tsx` — SubTabBtn «Raport pe rute» (`badge` opțional). Când e activ se ascund:
   câmpurile de perioadă ale filei-mamă, bara de status/«Confirmă ziua», bannerul de orfani
   manuali, textul «filtru pe perioadă».
8. **Control independent** (script în scratchpad, după migrație; și în `--dry-run`):
   - (a) identitate globală, fără nicio logică de dată: pentru 01.01–09.10 (luni succesive),
     Σ lunilor (Rute + Bani fără rută + De verificat) == Σ tuturor plăților de terminal din
     interval + Σ rândurilor manuale active, cu diferențele de capăt explicate pe foaie;
   - (b) pe fiecare lună, cheia fiecărei plăți = `effective_ziua` dacă e consumată de o rută,
     altfel ziua plății; 0 lei neconsumați și neorfani pe fiecare lună din 01.01 (azi: 19
     perechi foaie×zi pierdute în 2026 — după migrație trebuie să fie toate orfani).
   Orice leu neexplicat oprește livrarea.

## Fișiere

- nou `packages/db/migrations/549_grafic_report_foaie_neacceptata.sql`
- nou `apps/admin/src/app/(dashboard)/numarare/tabs/incasare-total.ts`
- nou `.../tabs/raport-rute.ts`, `.../tabs/raport-rute.test.ts`, `.../tabs/RaportRuteTab.tsx`
- modificat `.../tabs/incasareActions.ts`, `.../tabs/RoutesTable.tsx`, `.../tabs/IncasareTab.tsx`

## Riscuri

- Migrația schimbă raportul zilnic: zile vechi capătă alerte noi. Dorit (decizia 3). Rezervă:
  `CREATE OR REPLACE` cu definiția salvată de pe prod înainte (fișier în scratchpad).
- `kiosk_fixed` citește tot `tomberon.transactions` fără filtru pe perioadă (522:362-367), deci
  timpul crește cu istoricul. Limită 92 zile + mesaj clar la timeout; măsurare la rece pe 92 zile
  după migrație.
- Cifrele zilelor recente se mai schimbă (plăți întârziate) → notă în filă.
- Rând manual atașat unei curse cu `data_foaie` ≠ ziua cursei stă pe ziua cursei (azi 2 rânduri,
  0 cu altă lună) — scris în notă, acoperit de test.

## Verificare

- `npx vitest run raport-rute` — agregare, anulate cu bani, Cu+Fără=Curse, medie «—», diferență
  doar cu ambele, orfani pe 6 rubrici, dublura_terminal în «De verificat», perioada implicită pe
  ziua 1 și 1 ianuarie, 92 zile exact, `cursa_cu_terminal` în «De verificat», două foi diferite pe aceeași cursă (terminal A + manual B).
- `npx tsc --noEmit` în apps/admin, lint, testele existente din numarare.
- Pasul 8 (control independent) pe prod.
- După deploy: `/api/version` = commitul; /numarare?tab=incasare → «Raport pe rute» pe 01–30.09
  prin curl cu login: Total general = cifra din pasul 8.

## Review: business-logic-auditor (runda 1)

Scor: 0.7 · Blocante (critical/high): 3 — toate tratate în versiunea de mai sus:

| # | sev. | esență | decizie |
|---|---|---|---|
| 1 | high | foaie legată de rută pe care șoferul n-o are → bani nicăieri (sep. 7.678,76; aug. 16.331,65); controlul era tautologic | acceptat: migrația 549 (inițial numerotată 548; 548 a fost ocupat între timp pe main) (decizia 3 a lui Ion) + control independent, pasul 8 |
| 2 | high | `dublura_terminal` adunat în Total general = dublare | acceptat: blocul «De verificat», în afara totalului |
| 3 | high | rute întregi cu 0 lei (Otaci etc.) | acceptat: întrebat Ion (decizia 2) → coloane + steag |
| 4 | med | orfani pe 2 rubrici | acceptat: suma pe `breakdown` |
| 5 | med | rută la cursă mixtă / foaia zilei | acceptat: definiția «Rută» scrisă explicit |
| 6 | low | data orfanilor descrisă greșit | acceptat: `ziua_foaie` în migrație + regula scrisă corect |
| 7 | low | rând manual cu data_foaie ≠ ziua cursei | acceptat: risc + test |
| 8 | low | definiții (no_data, Numărare, medie, etichetă) | acceptat |

## Review: senior-backend-engineer (runda 1)

Scor: 1.2 · Blocante (critical/high): 2 — toate tratate:

| # | sev. | esență | decizie |
|---|---|---|---|
| 1 | high | Cu+Fără ≠ Curse (statut pe 2 rubrici) | acceptat: definiții pe Total, invariant testat |
| 2 | high | perioada implicită invalidă pe ziua 1 | acceptat: `perioadaImplicita` + teste |
| 3 | med | anulate cu bani în Total? | acceptat: banii pe toate rândurile, curse fără anulate, test |
| 4 | med | orfani pe `incasare_lei` | acceptat (= auditor #4) |
| 5 | med | bara de status și bannerul filei-mamă rămân vizibile | acceptat: pasul 7 |
| 6 | low | 92 zile măsurat doar la cald | acceptat: risc + măsurare la rece după migrație |
| 7 | low | semnătura / time_chisinau / riscul cu numele | acceptat: corectate |
| 8 | low | validare netestată, cereri concurente | acceptat: `valideazaPerioada` + id de cerere |
| 9 | low | xlsx pe client | acceptat: pasul 6 |

## Critic extern - runda 1

Codex: scor 4.0 (transportul semnalează inconsistență: Σ greutăți 6.5 ⇒ 3.5) · verdict fail · 3 high.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | clasificarea «De verificat» cere date pe care RPC-ul nu le dă (assignment_id, excluderea pe terminal) | acceptat | verificat în def. prod (orphan_manual n-are assignment_id); migrația: motiv `cursa_cu_terminal` + `assignment_id`, test cu două foi pe aceeași cursă |
| C2 | high | orphan_manual nu filtrează `sters_la` ⇒ rânduri șterse în Total general | acceptat | confirmat pe def. prod: WHERE-ul orfanilor n-are `sters_la IS NULL` (bug și azi, în banner); migrația îl adaugă |
| C3 | high | rând manual atașat, cu data foii în altă perioadă ⇒ numărat de două ori | acceptat | confirmat: rută pe ziua cursei vs orfan pe `COALESCE(data_foaie, ziua)`; migrația: o singură zi de apartenență |

## Review: business-logic-auditor (runda 2)

Scor: 5.0 · Blocante (critical/high): 1 — tratate:

| # | sev. | esență | decizie |
|---|---|---|---|
| 1 | high | ambele cazuri vii din «De verificat» sunt bani reali (1126555 pe cursa greșită; 1126627 complement terminal) | acceptat: motiv `cursa_gresita` → Bani fără rută; dovezi pe rând; raportul arată și «Total general + De verificat» (în loc de o întrebare blocantă către Ion: ambele cifre la vedere, decizia pe rând rămâne a casierului) |
| 2 | med | predicatul copiat nu vede pierderi de după el | acceptat: condiția (b) pe rezultat (`text[]` consumat) |
| 3 | med | controlul de la pasul 8 nu se închide la capăt de lună, nu e independent | acceptat: identitate globală (a) + cheie per plată (b) |
| 4 | low | `ziua_foaie` = altă regulă decât rutele | acceptat: aceeași regulă ca `effective_ziua` |
| 5 | low | `cursa_cu_terminal` prin scanarea jsonb | acceptat: `uuid[]` capturat în primul SELECT |

Fapt nou de la revizor: în 2026 sunt 19 perechi foaie×zi pierdute (apr. 1, mai 7, iun. 2, iul. 5,
aug. 2, sep. 2); predicatul (a) le prinde pe toate 19. Rândurile manuale 1126612 și 11266570
(ruta 31, 06–07.10) sunt atașate în cruce — de spus casierului.


## Review: business-logic-auditor — control pe viu după runda 2

Migrația rulată în tranzacție de probă (ROLLBACK; verificat după: prod fără `v_from_ext`).
Identitate globală 01.01–09.10.2026, pe luni: Σ(rute + orfani terminal + orfani manuali) =
43.026.085,94; Σ independent (toate plățile de terminal pe ziua plății, șase rubrici + toate
rândurile manuale active pe ziua de apartenență) = 42.954.635,96. Diferența 71.449,98 = exact
plățile făcute pe 10.10 pentru foi din 01–09.10 (`platit_dupa_foaie_in`), celelalte trei termene
de capăt = 0. ⇒ fiecare leu apare o singură dată, nimic nu se pierde.

## Critic extern - runda 2

Codex: scor 5.5 (transportul: inconsistent, Σ greutăți 5.5 ⇒ 4.5) · verdict fail · 2 high.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | plată întârziată a unei foi din perioada trecută, pierdută la `effective_route`, scapă (b) | acceptat | fereastra internă lărgită până la ziua foii (plafon 62/31), ies doar rutele perioadei; control global pe 2026 închis la leu |
| C2 | high | bannerul încă spune «șterge rândul manual» la `dublura_terminal` | acceptat | text nou fără recomandare de ștergere + suma terminalului; IncasareTab.tsx, raport-rute-xls.ts |
| C3 | low | pasul 1 aștepta `cursa_cu_terminal` pentru 1126555 | acceptat | pasul 1 rescris cu rezultatele măsurate |

## Review: senior-backend-engineer (runda 3, pe cod)

Scor: 8.5 · Blocante (critical/high): 0. Tratate:

| # | sev. | esență | decizie |
|---|---|---|---|
| 1 | med | răspuns vechi peste perioadă invalidă | acceptat: `reqId.current++` în ramura invalidă |
| 2 | med | 548 deja ocupat pe main | acceptat: migrația e acum **549**; rebase pe origin/main înainte de push |
| 3 | low | comentariu înșelător la importul dinamic | acceptat: doar `xlsx` e dinamic, comentariul spune asta |
| 4 | low | eroarea filei-mamă deasupra raportului | acceptat: ascunsă pe «Raport pe rute» |
| 5 | low | «Luna curentă» pe ziua 1 | acceptat: `title` care explică |
| 6 | low | sortare fără tastatură / aria | acceptat: `<button>` în `th`, `aria-sort`, `aria-label` pe date, ▲ la Rută |
| 7 | low | media pe subtotal lipsă în Excel | acceptat |
| 8 | info | media include bani de pe curse anulate | notat; 0 cazuri măsurate |

## Review: business-logic-auditor (runda 3, pe SQL)

Scor: 9.4 · Blocante (critical/high): 0. Funcția veche vs nouă în aceeași tranzacție (ROLLBACK),
19 perioade (fiecare lună 2026, 9 zile singulare, 2 peste capăt de lună): rândurile de rută
**identice la jsonb**, `orphan_numerar` și `confirmation` identice; orfani noi exact 949522,
949474 (aug.) și 944925 (sep.); timp +4 %. Tratate: #1 `c.data_foaie` în GROUP BY în loc de MAX
(acceptat); #2 egalitatea de distanță ruptă la fel în cele trei locuri (`, r.ziua DESC`, acceptat);
#3 etichetă `cursa_gresita` pe cursă suburbană în zi liberă (respins: banii rămân corect în «Bani
fără rută», doar eticheta; 0 cazuri). Control global rerulat după #1–#2: identic (dif. 71.449,98 =
plățile din 10.10).

## Critic extern - runda 3

Codex: scor 9.5 · verdict pass · 0 critical/high (scor consistent).

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | low | orfanul manual nu arată ziua după care intră în perioadă | acceptat | `ziua_apartenenta` în obiect (549), afișată în coloana «Ziua în raport (plata / cursa)», notă sub listă |

## Raport final

| Partea | Scor | critical/high deschise |
|---|---|---|
| Claude — minimul revizorilor (runda 3) | 8.5 | 0 |
| Codex — critic extern (runda 3) | 9.5 | 0 |

Istoric: runda 1 — Claude 0.7 / Codex 4.0 (3+2 high Claude, 3 high Codex); runda 2 — Claude 5.0 /
Codex 5.5 (1 / 2 high); runda 3 — 8.5 / 9.5, 0 blocante. 40 de observații în total (Claude 33, Codex 7), toate acceptate
în afară de una respinsă cu fapt (auditor r3 #3) și una doar notată (backend r3 #8, info).
