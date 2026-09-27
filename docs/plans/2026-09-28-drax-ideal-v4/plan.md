# Drăxlmaier: scheletul ideal-v4 prin dezbaterea Claude + Codex (3 runde), comparat cu ideal-v3.1

Ion, 27.09: «Запусти Claude и Codex, 3 уровня дебатов, чтобы определиться с идеальным скелетом для этого завода; когда будет
идеальный скелет — сравнить с моим, понять, что в моем нехорошо, и выбрать лучше. Потом продолжить все, что выше было.»
«Моим» = скелетом активным acum, **ideal-v3.1** (răspunsul lui Ion la întrebare).

## Context — de ce

- Ideal-v3.1 (ION-99, activ din 27.09, `drax/date/ideal-activ → ideal-v3.1`, sha schelet 8b400214…) are defecte găsite azi pe GPS:
  capătul liniei e luat din act (satul de start al liniei), nu de unde începe cursa reală. Control pe toată flota, două săptămâni
  (07.09 și 14.09), opriri scurte în satele rutei dincolo de capăt, în afara urmei cursei:
  - **R37 Musteața → Năvîrneț**: tur 4/4 și 3/4, retur 5/5 și 3/3 (925FTI: 42 km «gol» noaptea din care ≈ 20 cu oameni).
  - **R28 Cuhnești → Balatina**: tur 5/5 și 3/4, retur 4/5 și 5/5.
  - de lămurit: R32 Trifănești (tur prin Izvoare 11/16, retur 4/17 — asimetric), R7 Slobozia* (retur spre Ușurei), R19 Bilicenii
    Vechi (Sîngerei/Grigorăuca, neconcludent).
- Rămase din dezbaterea v3 (verdict-v3.md): Zarojeni, Bocancea Schit, Sturzovca, Nihoreni, R16 Florești — dezacord Claude/Codex,
  card vechi + steag; 6 linii «diagnostic cerut» în schelet (Nihoreni, Florești, Zarojeni, Sturzovca, Trifănești, Bocancea Schit).
- Mașinile care dorm în Bălți (agentul de azi): 435ASB, 144BRAZ, 744ARF, 186OMM, 804MUM — golul lor e R1a (drum de dimineață /
  noapte casă ↔ capăt, ≈ 1.270 km/săpt. măsurat + ≈ 500 la 804MUM nemăsurat), pe care §12.1 îl scoate explicit din «Ce faci»
  (`drax-ce-faci.ts:78,117-121,194`); 435ASB și 744ARF nu apar nicăieri pe pagină; 744ARF are ≈ 260 km/săpt. rulaj prin oraș
  trecut greșit la R1a.
- Starea livrării: ION-108 în producție (fcc9527b). ION-109 NU e livrat: lanțul ideal-v3.2 s-a oprit la `goluri-prag.mjs`
  (lipsea `proba/goluri-brute.json`); nimic activat, nimic comis. Dosarele `date/ideal-v3.2`, `cod/ideal-v3.2` există pe VPS
  (copie v3.1 + `capete-gps.json` + `etalon.mjs` cu `CAPETE_GPS`) — devin baza lui ideal-v4.

## Ce facem

Un tichet nou **ION-110 «ideal-v4 prin dezbatere + comparația cu v3.1»**; ION-109 (capetele + Bălți) continuă după, pe verdict.

### Pasul 1 — candidatul ideal-v4 (izolat, reproductibil)
- `date/ideal-v3.2` / `cod/ideal-v3.2` redenumite `ideal-v4` (sed pe căi, ca `setup.sh` din v3.1); copiate intrările din
  `ideal-v3.1/proba/` pe care le cere codul (`goluri-brute.json`, `mutari-v31-r1.json`, `v3/`).
- `capete-gps.json` (regula + dovezi + steaguri) extins: controlul capetelor rulat pe TOATĂ fereastra scheletului (04.05–17.07 +
  01.09–25.09) din `curse-ideal.json` (câmpul `apr` = satele atinse în ordine pe drumul casă ↔ poartă), nu doar pe 2 săptămâni;
  pragul rămâne ≥ 50 % din curse pe ambele sensuri.
- `sh lant.sh` de două ori → sha identic (reproducere, ca `repro.sh` v3.1); `GATA` nu se pune până la verdict.

### Pasul 2 — dezbaterea, 3 runde (procedura plan-mode-review, ca la ideal-v3)
Documentul rundei: `docs/plans/2026-09-28-drax-ideal-v4/runda-N.md` = lista liniilor disputate, cu km GPS v3.1 vs v4, capăt,
ture/zi, dovezile (opriri, apr, grafic `daily_assignments`) și întrebările deschise. Pe fiecare rundă, în paralel:
- **Claude**: `business-logic-auditor` (logica de livrare, regulile lui Ion din `reguli_livrare`) + `schelet-verificator`
  (rulează `/home/verif/verificator` pe COPII ale ambelor schelete: km reali GPS, C-controalele, dispozitivele duble) +
  `uzina-analist` («cercetează»: citește regulile și măsoară, nu decide). Scor = minimul lor.
- **Codex**: `codex-plan-critic` ULTIMUL, pe documentul rundei + răspunsurile Claude (gpt-6-astra, read-only, rădăcina
  ion-89 unde e AGENTS.md).
- **Triaj**: fiecare observație acceptată/respinsă cu fapt; regula verdictului v3: se aplică ce susțin amândouă părțile sau ce
  hotărăsc datele; unde nu decid, rămâne v3.1 + steag «diagnostic cerut». Gate: 0 high deschise la ambele; maxim 3 runde;
  critic indisponibil = spus lui Ion, nu presupus mulțumit.
- Subiectele: (a) capetele din GPS (R37, R28 + orice altă linie din controlul pe fereastra întreagă; R32/R7/R19);
  (b) cele 5 dezacorduri v3 și cele 6 linii cu steag; (c) Bălți: dacă R1a intră în «Ce faci» ca grupă separată doar în km
  (schimbă §12.1) și dacă casa ≤ 3 km de poartă e «lângă uzină» ca parcul; (d) rulajul prin oraș scos din R1a.

### Pasul 3 — comparația v4 ↔ v3.1 și alegerea
- `compara-v31-v4.md` + pagină-artefact: pe fiecare linie capăt, km/tură, ture/zi, km/zi, verdictul verificatorului pe ambele,
  «ce e greșit în v3.1» cu dovada GPS; flota km/zi v3.1 vs v4.
- Alegerea se face pe LINIE (verdictul dezbaterii), nu global; ideal-v4 final = liniile câștigătoare. `decizii-v4.json`
  (doar metode + valoarea așteptată, ca `decizii-v3.json`), `card-gps.mjs` + verificatorul pică la abatere > 0,1 km.

### Pasul 4 — activarea (după gate)
`GATA` + registrul verificatorului re-semnat pe sha nou; `ideal-activ → ideal-v4`; `export-lde.mjs` → 
`apps/admin/public/lde/schelet-drax.json`; commit (`git-safe-commit.sh`), push `HEAD:main`; `saptamanal.sh --write 2026-09-14`
pe scheletul nou; pagina în producție verificată de pe VPS (login + curl); `tp handoff ION-110`.

### Pasul 5 — continuarea ION-109 («все, что выше»)
- Capetele: închise prin ideal-v4 (925FTI 14.09: cursa cu oameni până la Năvîrneț, golul spre casă = km reali).
- Bălți, după verdictul (c)/(d): dacă da — migrația 409 pe §12.1 (bloc `DO`, gard lungime + md5 pe textul de după 408,
  `ROW_COUNT = 1`, aplicată prin MCP + fapt `kind=migration`) și în `drax-ce-faci.ts` / `drax-ce-faci-text.ts` grupa
  «Doarme în Bălți, departe de capăt» doar în km (autobuzul nu mai face / mașina mică face), fără lei; rulajul prin oraș la
  «de lămurit» în worker (`alternative.mjs`); nicio mașină măsurată nu mai lipsește din pagină. Teste vitest + probă pe 14.09.
- `tp handoff ION-109`.

## Fișiere
- VPS: `/root/lde-worker/drax/cod/ideal-v4/*` (din v3.2: `etalon.mjs` + `CAPETE_GPS`), `/root/lde-worker/drax/date/ideal-v4/*`
  (`capete-gps.json`, `decizii-v4.json`), `drax/cod/economie/alternative.mjs` (rulaj oraș, doar la verdict), verificatorul
  `/home/verif/verificator/date/explicatii-drax.json` (re-semnat).
- Repo: `docs/plans/2026-09-28-drax-ideal-v4/` (runde, triaj, verdict, compara, copii cod VPS), 
  `apps/admin/public/lde/schelet-drax.json`, eventual `packages/db/migrations/409_lde_drax_r1a_balti.sql`,
  `apps/admin/src/lib/lde/drax-ce-faci.ts`, `drax-ce-faci-text.ts` (+ teste).

## Riscuri
- Capătul mutat schimbă tăietura curselor (etalon) și golurile săptămânale → verificatorul pe ambele schelete + probele 925FTI.
- `schelet-cand.json` (drumuri desenate) nu are liniile cu capăt nou → loturile `dc.mjs`/`schelet.mjs` le desenează (Valhalla).
- Rândul săptămânii 14.09 rescris → planul ION-108 se recalculează; rularea de luni 28.09 08:00 trebuie să prindă scheletul
  final: activarea înainte de luni 07:30 sau după 09:30, nu între.
- Codex cu limită de utilizare → dacă pică, se spune lui Ion și se așteaptă.

## Verificare
1. Lanțul v4 rulat de două ori → aceleași sha; controlul capetelor pe v4: 0 linii cu prelungire ≥ 50 % pe ambele sensuri.
2. Verificatorul (schelet-verificator) pe v3.1 și v4: km GPS, fără blocante noi; card-gps = decizii-v4 (±0,1 km).
3. Dezbaterea: 3 runde cu scoruri; gate 0 high deschise; verdictul scris.
4. `compara-v31-v4.md` + artefact: fiecare diferență cu dovadă GPS.
5. Producție: `/lde/schelet?uz=drax` pe v4; `/lde/reguli?uz=drax&saptamina=2026-09-14`: 925FTI seara fără «Musteața → acasă 42 km»;
   vitest `src/lib/lde` verde; tsc curat.
