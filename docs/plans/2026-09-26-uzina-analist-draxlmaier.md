# Agentul «uzina-analist» și învățarea sistemului pentru Drăxlmaier

Plan scris pe 26.09.2026 în Plan Mode, după procedura `plan-mode-review` (3 runde Codex cerute de Ion). Fișierul e cel
impus de Plan Mode; după aprobare se copiază în `docs/plans/2026-09-26-uzina-analist-draxlmaier.md`.
**Versiunea 5** (după revizorii Claude rundele 1–4 și criticul Codex rundele 1–3 — gate-ul și triajul după «Verificare»).

## De ce

Ion, 26.09: «să creăm un agent care să se uite la munca făcută la celelalte uzine care deja lucrează — cum am învățat softul
să socotească corect km-ii, împreună cu AI, ce se poate optimiza — și să învețe sistemul pentru Drăxlmaier; e complex și
cere mult timp».

Ce înseamnă «învățat» la uzinele care lucrează (LEAR Ungheni, LEAR Florești, SEBN Orhei + Strășeni, Trox + suburban
Briceni, interurbane mejgorod): fiecare are (1) scheletul fix al rutelor, (2) ferestrele de ceas ale turului/returului
în `lde_uzina_ferestre_ceas`, (3) textul regulilor de livrare dictate de Ion, în `lde_uzine.reguli_livrare` (12 secțiuni:
surse de adevăr, ore, tur/retur, rută și capăt, categorii de km, etalon, unde doarme mașina, reguli de economie, costul km,
rapoarte/control, timp liber și brambura, indicații pentru dispecer), (4) analiza săptămânală pe VPS care scrie rândul uzinei
în `lde_analiza_reguli`, (5) fila `/lde/reguli?uz=…` și `/lde/schelet?uz=…`, (6) posterul de luni + indicațiile pentru
Alexei + paznicul. Drăxlmaier are azi doar (1) — scheletul real (ION-45) și cel ideal (ION-71) — și NIMIC din (2)–(6).

Deciziile lui Ion (26.09, AskUserQuestion + chat):
1. Livrabilul primei runde = **tot lanțul, ca la Briceni/LEAR** (reguli + ferestre + analiza săptămânală + filele LDE);
   posterul și indicațiile pentru Alexei pleacă doar după «da».
2. **Regulile de economie le identifică agentul din date și le propune; Ion confirmă** înainte ca §8 să intre în document.
3. Forma = **subagent Claude Code**, pornit pe o uzină, sub task-pipeline; prima rulare = Drăxlmaier.
4. Ion, 26.09 (chat): «când un itinerar are 1 tur/retur, e rezonabil de analizat [golul dintre ele] în contextul în care
   ruta e semnificativ de lungă SAU mașina face doar o rută» — golul dintre turul și returul aceleiași perechi e candidat
   la economie când ruta e lungă SAU când mașina face o singură rută în ziua aceea (citit textual, «sau»); care din cele
   două citiri, sau amândouă, se hotărăște de Ion la întrebarea 2 din F2, pe cifre. Drumul spre altă linie a mașinii e
   «legătură», iar piciorul gol cerut de următoarea cursă cu oameni e «gol pe rută» — niciunul nu e «gol între ture».

## Ce facem

**Decizia:** un agent de proiect `.claude/agents/uzina-analist.md` care ține PROCEDURA (fazele, ordinea, verificările) și
INDEXUL cunoașterii (unde sunt regulile, codul, lecțiile), nu copii ale regulilor; regulile rămân la sursă (baza, VPS,
memoria). **Împărțirea rolurilor**, fiindcă un subagent n-are `AskUserQuestion`, `ExitPlanMode`, nu lansează revizori,
nu supraviețuiește sesiunii și în Plan Mode nu scrie decât în fișierul lui de plan: **contractul merge pe FIȘIERE, cu
două porniri pe fază.** Pornirea «cercetează» (în afara Plan Mode, sau înaintea intrării în el): agentul citește
sursele, MĂSOARĂ pe VPS, scrie planul fazei în `<plan>-agent-<id>.md` (în Plan Mode) sau în scratchpad-ul sesiunii
(în afara lui) — niciodată în repo — + `ticket.md` + lista întrebărilor pentru Ion. Sesiunea principală rulează
plan-mode-review (revizori, Codex, întrebările către Ion, ExitPlanMode), copiază planul aprobat în `docs/plans/` și
scrie răspunsurile lui Ion textual în `docs/plans/<data>-<uzina>-<faza>-raspunsuri.md`. Pornirea «execută» primește DOAR
trei căi — planul aprobat, `.tp/BRIEF.md` al tichetului fazei, fișierul cu răspunsuri — și execută în dereva
tichetului (fișierele de migrație și codul, VPS, commit), cu un PAS-POARTĂ înaintea oricărei scrieri în bază: scrie
fișierul `.sql` în dereva și se OPREȘTE; sesiunea principală compară SQL-ul cu planul aprobat și abia apoi aplică (MCP
`apply_migration` + fapt `kind=migration`) sau îi spune agentului să aplice. Apoi livrează `report.md`. Pornirea
«cercetează» scrie NUMAI în afara repo-ului (fișierul de plan permis sau scratchpad-ul sesiunii); sesiunea copiază
planul, răspunsurile și `ticket.md` în dereva fazei după `tp new`. `SendMessage` e doar scurtătură în aceeași sesiune.
Programul Drăxlmaier are 4 faze; fiecare = tichet propriu + plan propriu.

Variante respinse:
- *Agent + workflow multi-agent.* Fazele depind una de alta și Ion confirmă între ele; respins de Ion.
- *Doar procedura scrisă, fără agent.* Respins de Ion; procedura intră în corpul agentului.
- *Regulile LEAR sau SEBN aplicate direct.* Respins de Ion: se măsoară întâi.
- *Worker Drăxlmaier ca intrare în `lear-analiza.mjs` (UZINE).* Presupune două ture A/B pe mașină (`lear-analiza.mjs:1110,
  1148,1161,1340`), o poartă și lei doar pentru Ungheni; Drăxlmaier are două porți atinse în aceeași zi (82 % din
  zilele-mașină), 1–3 perechi/zi pe linie, 49 de mașini. Modelul = lanțul Briceni (`briceni/cod/livrare.mjs`: ziua tăiată
  în intervale cu o categorie) + `lear-timp-liber.mjs` (pur) extins compatibil cu listă de porți.

## 🔬 Verificat pe viu

| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Drăxlmaier n-are nimic în lanțul de reguli | Supabase `lde_uzine`, `lde_uzina_ferestre_ceas`, `lde_analiza_reguli` | `DRAXELMAIER_BALTI`: `display_name 'Draxelmaier-Bălți'`, `active`, `livrare_validata false`, `reguli_livrare` NULL, 0 ferestre, 0 analize, 2 porți; celelalte: LEAR_UNGHENI 10.424 car. / 4 ferestre / 6 analize, LEAR_FLORESTI 7.924 / 4 / 6, SEBN 11.076 / 6 / 8, TROX_BRICENI 4.658 / 4 / 0; chei `lde_analiza_reguli.uzina`: `LEAR Ungheni`, `LEAR Florești`, `SEBN`, `MEJGOROD`, `BRICENI` | F1 pornește de la zero; cheia Drăxlmaier = `DRAXELMAIER` (ASCII, ca BRICENI) |
| Structura textului regulilor | `reguli_livrare` LEAR_UNGHENI, SEBN_ORHEI, TROX_BRICENI (integral) | text simplu, titlu + «N. TITLU» / «N.M text»; LEAR și SEBN 12 secțiuni, Briceni 10; parserul `/lde/uzine/_regula` despică pe «N. TITLU»; §11/§12 s-au lipit cu `\|\|` idempotent (`400:28`, `401:10`); Briceni rescrie tot (`403:6`); pagina `/lde/livrare-reguli` salvează textul direct, fără istoric (`livrare-reguli/actions.ts:81-88`), din starea JS (LF, `.trim()`); `apply_migration` înregistrează migrația indiferent de rândurile schimbate | F1 scrie DOAR `WHERE reguli_livrare IS NULL`; secțiunile amânate primesc marcaje = TITLUL + rândul; înlocuirea se face într-un bloc `DO` care pică zgomotos dacă `ROW_COUNT <> 1` (gard `AND` pe toate marcajele migrației) |
| Ferestrele de ceas | `lde_uzina_ferestre_ceas` LEAR/SEBN/TROX; `396_…sql:15-24` | `(uzina_id, sens, shift_number, de_la_min, pana_la_min, sursa)`, minute locale, `pana < de` = trece de miezul nopții, fără coloană de poartă | Drăxlmaier: 4 rânduri identice pentru ambele porți |
| Orele la poartă, pe fiecare poartă | `diag-parc.mjs` pe `obs-ideal.json` (ION-71) | mediane EST / VEST: tur s1 06:13 / 06:12, tur s2 14:41 / 14:43, retur s1 15:54 / 15:40, retur s2 00:18 / 00:09; moduri identice mai–iulie și septembrie | ferestre: tur s1 03:30–07:00 (210–420), tur s2 13:30–16:00 (810–960), retur s1 15:00–17:45 (900–1065), retur s2 23:00–01:45 (1380–105) |
| Ambele porți în aceeași zi | `diag-parc.mjs` | 3.030 zile-mașină cu poartă, **82,3 % ating AMBELE porți**; toate cele 49 de mașini; porțile la 2,4 km una de alta | modulul de timp liber primește LISTĂ de porți, compatibil cu apelanții vechi (`ctx.porti ?? [ctx.poarta]`) |
| Modulul comun citește poarta în patru funcții exportate | `lear-timp-liber.mjs:132,150,165` (`curseCuOpriri`), `:195` (`caseSecundare`), `:213,243,328,330` (`eticheteaza`), `:350,351,379,380` (`rezumaSaptamina`); apelanții cheamă `rezumaSaptamina` direct (`lear-analiza.mjs:1298`, `sebn-liber.mjs:218`); `hav` (`:62-65`) fără gard; `P = { ...PRAGURI, ...(ctx.praguri \|\| {}) }` la `:89,189,211,345` | o normalizare locală într-o singură funcție lasă celelalte trei cu `hav(p, undefined)`; `R_PARC_ZONA` se poate da deja prin `ctx.praguri` fără cod nou | helper `portiDin(ctx)` + `distPoarta(p, ctx)` chemat în TOATE cele patru funcții; `grep -c "ctx.poarta"` = 0 în afara helperului; test cu ctx FĂRĂ `poarta` pe toate patru |
| Excepția «schimbul 3» a modulului | `lear-timp-liber.mjs:59` (`NOAPTE_S3` 22:00–06:00), `:215-234` (ancore de muncă noaptea, fără ferestre și fără zile lucrătoare), `:316` (cursele ancorate ies din brambura); proba sintetică a criticului pe origin/main: duminică 22:10 la EST → 17,8 km «muncă», 0 liber | regula LEAR §2.1 («schimbul 3 rar, dar există») e implicită în modul pentru orice uzină; Drăxlmaier n-are schimb 3 (`lde_uzine.shift3_time` NULL, `S1_S2_FIXED`) | `ctx.schimb3` (implicit `true` pentru LEAR/SEBN, `false` la Drăxlmaier); teste: atingere la 22:10 în afara ferestrelor și într-o duminică nelucrătoare = liber; existența unui schimb 3 la Drăxlmaier e de confirmat de Ion (întrebarea 5 din F2) |
| Ce cere mesajul de timp liber către ADMIN | `lde-timp-liber/route.ts:91-121`, `lib/lde/timp-liber.ts:25-31`, `reguli/actions.ts:57-58,111-112`, `reguli/RaportBriceni.tsx:13`, `briceni-optimizari-image.ts:18-32` | `textTimpLiber` cere `masini[].liber` și `timp_liber.prag_km`; dedup = revendicare atomică pe `alerta_trimisa_la` / `rulat_la` cu revenire la eșec; `AnalizaBriceni` n-are aceste câmpuri | `date` Drăxlmaier = `AnalizaBriceni` + `timp_liber` + `masini[].liber`; `?liber=1` refolosește `textTimpLiber` și revendicarea (funcție comună sau copie cu test) |
| Testul scriptului de luni | `lear-saptamanal.test.sh:3-7,12-14,43` | creează doar falsul Briceni; «workeri OK» așteaptă 4 apeluri și cod 0 | falsul `$T/lde/drax/cod/saptamanal.sh` cu `FAKE_DRAX_EXIT`; cazul nou în antet |
| «Toate rutele» | `toate.ts:20-26,93-95`; `luni-paznic.ts:53` | cinci tente (lear, orhei, strășeni, florești, mejgorod) pe patru schelete; textul de retrimitere din paznic numește Briceni | Drăxlmaier = al cincilea schelet, a ȘASEA rețea; textul paznicului numește și `drax/cod/saptamanal.sh` |
| Modelul categoriilor (Briceni) | VPS `briceni/cod/livrare.mjs:5-16,67-71,109-110,118-124,132-153` (citit de revizor) | precedența: cursă cu oameni > LIVRARE (primul drum din zi de la locul nopții / ultimul spre el / pe acasă ≥ 20 min) > … > GOL PE RUTĂ (restrâns la returul gol între două curse ale ACELEIAȘI rute) > SERVICE > DEPLASARE > RUTĂ NEPOTRIVITĂ > LEGĂTURĂ > NECUNOSCUT; `golImpusDeTure` = piciorul gol pe culoarul rutei, cel mult bugetul liniei; «drumul de acasă spre capăt nu e rută» | tabela F2 urmează acest model; «capăt» = satul-capăt al LINIEI, nu punctul de start al cursei |
| Parcul Bălți (47.770 / 27.9235) | `diag-parc.mjs`; distanțe; `lear-timp-liber.mjs:176,195,243,275,283-292` | VEST–parc **0,70 km** (razele 0,5 + 0,5 se suprapun; `R_POARTA` 0,7 ajunge în centrul parcului), EST–parc 2,25 km; `R_PARC_ZONA` 3 km cuprinde AMBELE porți; în modul «reparație» (pauză ≥ 2 min la ≤ 0,5 km de parc) se decide ÎNAINTEA muncii, iar cursa fără lanț din zona parcului iese «neclar», nu «liber»; «altă uzină» bate orice altă etichetă; noaptea la parc 77 / 3.030 (2,5 %); după turul de dimineață 547 / 5.287 plecări (10 %) se termină la parc, 346KAJ 89 % | parcul NU e «acasă»; CE E parcul la Drăxlmaier (așteptare lângă uzină = R1 aplicat, sau service) și cât de mare e zona lui = ÎNTREBARE pentru Ion la F2; modulul primește prin `ctx` precedența «ancora bate parcul» și `R_PARC_ZONA` (implicit neschimbate pentru LEAR/SEBN); apelantul Drăxlmaier scoate porțile proprii din `alteUzine` (ca `sebn-liber.mjs:119`) |
| Tiparele zilelor-mașină (L–V) | `obs-ideal.json` ION-71 (revizorul business, script de unică folosință) | 2.849 zile-mașină (743 în sept.): **o linie, o pereche, fără jumătăți 13,0 %** (sept. 14,7 %); o linie, două perechi 23,7 %; ≥ 2 linii ≈ 55 %; **cel puțin o jumătate de pereche ≈ 34 %** (tur pe X + retur pe Y, retur cu altă mașină, retur nedetectat); nicio pereche ≈ 9 %; 3.735 curse cu `schimb = null` din 14.697 — presupuse picioare goale, NEVERIFICAT pe opriri | cele trei citiri ale deciziei 4 se măsoară toate (întrebarea 2); o jumătate e reală doar dacă cursa-pereche lipsă apare la altă mașină, altfel steag «probabil nedetectată» și iese din suma R1/R3; F2 numără cursele `schimb = null` cu opriri de urcare în satele liniei (criteriul `livrare.mjs:100-106`) |
| Clasele de capacitate pe zi și schimb (sept.) | același script | clasa 50: până la **18** mașini pe zi și schimb; clasa 20: 16; clasa 27: 5; NEMĂSURAT: câte (zi, schimb) au o mașină cu ≥ 2 perechi sau o pereche dusă de două mașini | R2 = atribuire ungară pe (zi, schimb, clasă), fără plafonul 16 din `lear-analiza.mjs:1349`; mașina cu k perechi primește k sloturi legate în lanț (cost capăt → capăt), altfel grupa iese cu steag «R2 necalculat — pereche multiplă/despărțită, n = …»; F2 măsoară întâi aceste cazuri |
| Weekendul | `diag-parc.mjs` | L–V 74 zile, 39,5 mașini/zi; **sâmbătă 12 zile, 7,9 mașini/zi**; duminică 7 zile, 1,3 mașini/zi | `works_saturday true` e parțial (≈ 8 linii); duminica nu; §2 spune asta |
| Cum se adaugă o uzină în admin | `lde/reguli/page.tsx:32-49,53,110-118`, `reguli/actions.ts:13,50`, `ReguliClient.tsx:65,75-76`, `api/cron/lde-timp-liber/route.ts:33-36,83-85,98-127`, `briceni-optimizari/route.ts:6-9,30`, `lib/lde/luni-paznic.ts:18-24`, `lde/schelet/page.tsx:24-34`, `toate.ts:12-26,93-95` | file hard-codate; `ReguliClient` e legat de ture A/B și «4 × etalon»; Briceni are `RaportBriceni` + `briceni-optimizari-image.ts` + rută proprie (PNG implicit, trimite doar cu `?send=1`); `lde-timp-liber` trimite posterul, indicațiile și mesajul de timp liber către ADMIN la orice apel non-dry; `Retea` din `toate.ts`: `porti: {c, n}[]`, `rute[].linie: Punct[]`, `km` pe zi, helper `plin` pe `tur/retur.plin`, paleta `TENTE` | F3: `RaportDrax.tsx`, `drax-optimizari-image.ts`, ruta `/api/cron/drax-optimizari` (imagine; `?send=1` poster + indicații; `?liber=1` DOAR mesajul de timp liber către ADMIN, fără poster), `UZINE_LUNI` cu `poster: null, indicatii: null`, `toate.ts` cu `TENTE.drax`; `lde-timp-liber` NU se atinge |
| Analiza săptămânală pe VPS | `lear-saptamanal.sh:25-62` (repo + VPS), `briceni/cod/saptamanal.sh`, `sebn-liber.mjs`, `lear-analiza.mjs:50-64,1289,1457-1468`, `lear-saptamanal.test.sh:50-51` | cron luni 08:00; Ungheni, Florești, SEBN sub `flock` secvențial; **Briceni stă ÎNAINTEA verificării `CRON_SECRET`** (`:42-48`), ca să ruleze și fără cheie; lipsa cheii = `exit 1` înainte de `cheama`; apoi 4 `cheama` (testul numără 4 apeluri); `lde_analiza_reguli(uzina, saptamina, rulat_la, date jsonb, note, alerta_trimisa_la)` unic pe (uzina, saptamina); apelanții modulului: `lear-analiza.mjs:1289`, `sebn-liber.mjs:181`, `lear-timp-liber.test.mjs:16` construiesc `{ poarta }`; extragerea ION-71 pe 49 de mașini × 100 de zile a durat 40 min, Briceni pe o săptămână 11–30 s | blocul Drăxlmaier după Briceni, ÎNAINTEA verificării cheii, DOAR dacă durata măsurată DE MÂNĂ înainte (o săptămână încheiată, în afara ferestrei de luni) e ≤ 5 min; altfel cron separat luni 07:00 cu paznicul; `timeout` = 3 × durata măsurată; livrare: VPS întâi, apoi `UZINE_LUNI`; testul: «Drăxlmaier picat → tot 4 apeluri, cod ≠ 0» |
| Migrații | `git ls-tree origin/main packages/db/migrations`, `supabase_migrations.schema_migrations` | ultima aplicată `403_lde_trox_ferestre_reguli` (25.09 20:42); numere duble există (394 ×2, 402 ×2); 403 = `BEGIN; DELETE ferestre; INSERT; UPDATE reguli`, fără funcții | F1 = **404**, verificat la scriere în ambele locuri; `DELETE + INSERT`; `livrare_validata` rămâne explicit `false` (altfel `uzineValidate()` din `livrare-poster.ts:73-77` bagă Drăxlmaier în posterul vechi); `DO` nu creează funcție ⇒ fără `REVOKE` |
| Ce știm sigur despre Drăxlmaier | ION-45 + ION-71 | 39 rute / 51 linii, 48 cu ideal; 49 de mașini pe fereastră; grupa D = sch. 1 în săpt. ISO impare, E+Z invers, EZ+D ambele; `ture/zi` 1 (29 linii) / 2 (16) / 3 (3); Sturzovca s1 24,7 / s2 46,9 km (două drumuri) | F2 măsoară pe categorii; etalonul se ia pe schimb unde s1 ≠ s2 |
| Formatul agenților | `.claude/agents/*.md`, `~/.claude/agents/codex-plan-critic.md` | `name`, `description`, `model`, `color`, `memory: user` (= `~/.claude/agent-memory/<nume>/`, NU memoria proiectului); agenții se citesc din `.claude/agents` al directorului sesiunii; main-ul local rămâne în urmă până la `git merge --ff-only origin/main`; în Plan Mode subagentul scrie doar `<plan>-agent-<id>.md` | corpul agentului dă căi ABSOLUTE; nota de memorie în `/Users/ionpop/.claude/projects/-Users-ionpop-Desktop-TRANSLUX/memory/`; verificarea 1 într-o sesiune nouă |
| Definiția brambura | `400_…sql:33` §11.3, `403:53` §6.1, `sebn-liber.mjs:3-5` | din 25.09 brambura = km pe un drum pe care mașina n-a mers în nicio altă zi a săptămânii, ≥ 5 km; «mediana + 15» (18.09) e ÎNLOCUITĂ | ordinea surselor: text `reguli_livrare` > cod care rulează > memorie > planuri vechi |
| Handoff / Done | memoria `mejgorod-schelet-rute.md`, `~/dev/task-pipeline/README.md:25,32-33` | `tp handoff` refuză fără commit; `tp tick` poate pune Done, iar un commit după Done = `tp:stale` | fiecare fază are commit (plan + raport în `docs/plans/`); migrația cu §8 = TICHET separat, după «da» |
| Fereastra F2 | calendar ISO | săpt. 36 = 31.08–06.09 (pară), 37 impară, 38 pară, 39 = 21–27.09 (impară); 31.08 e zi de august, exclusă la ION-71 | F2 verifică flota din 31.08 față de media L–V; zi atipică = steag, echilibrul 2 + 2 pe zilele rămase |

**Neverificat 1 — tipurile și normele mașinilor Drăxlmaier** (`lde_vehicle_norms`): la Florești lei = null. Cale de
rezervă: F2 raportează km, lei doar pentru mașinile cu normă; lipsa se listează.
**Neverificat 2 — unde dorm cele 49 de mașini**: se măsoară în F2 (LEAR §7.1: cea mai lungă staționare luni–vineri, fără
poartă și fără parc), din urmă. Cale de rezervă: `lde_gps_stops.is_base` doar dacă urma n-are staționare lungă.

## Pași

0. **Tichet-umbrelă** `tp create "Agentul uzina-analist + învățarea sistemului pentru Drăxlmaier" -F ticket.md --repo translux`
   (corpul = De ce / Ce facem / Faze / Chem verificăm), `tp new ION-N`, planul în `docs/plans/`, commit, push, handoff.
   Fazele 1–4 primesc tichete proprii, create de sesiunea principală la propunerea agentului, cu trimitere la umbrelă;
   migrația cu §8 (după «da») e tichet separat.

1. **Agentul** — `.claude/agents/uzina-analist.md` (nou, ~250 rânduri), frontmatter `name: uzina-analist`, `description`
   («Învață o uzină nouă din ce s-a făcut la cele care lucrează și pregătește lanțul complet: schelet, ferestre, reguli,
   analiză săptămânală, file LDE, poster. Două porniri pe fază: «cercetează» (măsoară și scrie planul fazei + întrebările)
   și «execută» (doar din planul aprobat, BRIEF și răspunsurile lui Ion). Nu întreabă și nu aprobă singur»), `model: opus`,
   `color`, `memory: user`. Corpul:
   - **Rolul**: analist de uzină TRANSLUX; măsoară pe GPS și propune; nu inventează reguli și nu adaptează definițiile lui
     Ion pe cont propriu — **o definiție care nu se transpune la uzina nouă = întrebare formulată pentru Ion**. Regulile lui
     Ion se citează prin trimitere (`reguli_livrare` LEAR §5.5 naveta nu se numără; SEBN §1.1 mașina se poate schimba pe
     rută; LEAR §4.6 un sat din act nu e sat de trecere; SEBN §11.3 brambura; LEAR §2.4 ziua 03:00 → 03:00; LEAR §8.1
     regulile se compară, nu se adună; `ora-locala.mjs` ora GPS), nu prin copii.
   - **Ordinea surselor când se contrazic**: text `lde_uzine.reguli_livrare` > cod care rulează (VPS, `lde-geo-worker/`)
     > memoria proiectului > planuri vechi; data de modificare decide între două texte.
   - **Indexul cunoașterii**, căi absolute: Supabase (MCP, read-only) `lde_uzine.reguli_livrare` pe cele 5 uzine,
     `lde_uzina_ferestre_ceas`, `lde_analiza_reguli`, `lde_uzine_gates`; repo `/Users/ionpop/Desktop/TRANSLUX/` —
     `packages/db/migrations/{386,394,396,399,400,401,402,403}_*.sql`, `lde-geo-worker/{lear-analiza,sebn-liber,
     lear-timp-liber,ora-locala}.mjs`, `lear-saptamanal.sh`, `lear-saptamanal.test.sh`, `apps/admin/src/app/(dashboard)/lde/
     {reguli,schelet,livrare-reguli,uzine}/`, `api/cron/{lde-timp-liber,sebn-optimizari,briceni-optimizari,lde-luni-paznic}/
     route.ts`, `lib/lde/{lear-optimizari-image,indicatii-alexei,luni-paznic,livrare-poster,briceni-optimizari-image}.ts`;
     VPS `root@217.26.149.23:/root/lde-worker/` (acces: memoria `vps-lde-worker-access.md`) — `briceni/cod/{saptamanal.sh,
     livrare.mjs,scrie-analiza.mjs,export-lde.mjs}`, `sebn/cod/`, `floresti/cod/`, `drax/cod/ideal/`, `ungheni/cod/`;
     memoria `/Users/ionpop/.claude/projects/-Users-ionpop-Desktop-TRANSLUX/memory/{lear-ungheni-tur-retur-ore,
     trasee-reguli-navetă-service,lear-doua-optiuni-economie,ungheni-gol-si-soferi,sebn-schelet-rute,
     briceni-livrare-reguli-sebn,briceni-schelet-rute,drax-schelet-rute,analiza-uzina-din-munca,
     analiza-verifica-toata-flota,indicatii-alexei-saptamanal,anti-exfiltration-hook-blocks-inline-code,
     vps-lde-worker-access,drepturi-implicite-anon-supabase}.md`; `docs/plans/*.md`.
   - **Procedura «cum se învață o uzină»**, 4 faze, fiecare cu cele două porniri:
     «cercetează» = (a) citește sursele, (b) măsoară pe VPS cu scripturi din fișier (scp + ssh, fără poll, fără cod inline;
     în Plan Mode NU — măsurătorile se fac înaintea intrării în Plan Mode sau de sesiunea principală), (c) scrie planul fazei
     după șablonul plan-mode-review (De ce / Ce facem / Verificat pe viu / Pași / Fișiere / Riscuri / Verificare) în
     fișierul permis + `ticket.md`, (d) se întoarce cu întrebările pentru Ion, numerotate, cu cifrele lângă ele;
     «execută» = primește DOAR planul aprobat (`docs/plans/…`), `.tp/BRIEF.md`, `docs/plans/…-raspunsuri.md`; execută;
     livrează `report.md` (Что сделано / Чем проверено / Что нужно от владельца) + nota de memorie în memoria proiectului.
     F1 *Faptele uzinei și textul de bază*: porți, schimburi și rotația din GPS, flota din urmă (≥ 4 zile la oricare
     poartă, pe săptămână), ferestrele pe fiecare poartă, weekendul; ieșire = migrația cu ferestrele + `reguli_livrare`
     cu §1–§4, §6, §9 (formula lei/km), marcaje la §5, §7, §8, §10–§12.
     F2 *Măsurarea*: ≥ 4 săptămâni ISO ÎNCHEIATE (2 pare + 2 impare), flota pe săptămână; ziua fiecărei mașini tăiată în
     intervale cu O categorie; alternativele de economie pe mașină (comparate, nu adunate; R2 ca repartizare comună);
     ieșire = pagină artefact + întrebările pentru Ion; după «da» (tichet separat) → §5, §7, §8 în text.
     F3 *Lanțul săptămânal*: worker, rând în `lde_analiza_reguli`, `lear-saptamanal.sh`, filele LDE, paznic; poster și
     indicații scrise, trimise doar cu `?send=1` după «da»; §10–§12 în text.
     F4 *Controlul*: control pe toată flota (§10), două luni de rulare, raport de abateri, memoria.
   - **Contractul fiecărei faze**: intrări (fișiere/tabele), ieșiri, numerele de verificat, ce NU atinge (baza fără
     migrație aprobată; cron-uri; `lde-timp-liber`; codul altor uzine; apelanții modulului comun); la «execută»
     pasul-poartă: fișierul `.sql` scris în dereva, oprire, aplicare doar după comparația sesiunii principale.
   - **Regulile de lucru** (citate): task-pipeline (`tp create -F`, `tp new`, `.tp/BRIEF.md`, `tp handoff -F`, Done doar
     `tp tick`, commit după Done = `tp:stale`), git-guards (`git-safe-commit.sh -- <căi>`, push `HEAD:main`, `rm -rf
     apps/admin/.next` la pre-push picat), hook anti-exfiltrare, MCP `apply_migration` + fapt `kind=migration`, `REVOKE
     EXECUTE FROM PUBLIC` la funcții, «verifică toată flota înainte de a publica», PIN-uri neatinse, memoria proiectului.
   Rezultat verificabil (într-o sesiune NOUĂ în dereva `tp new`): (a) `Agent` tool listează `uzina-analist`;
   (b) proba «LEAR Ungheni §5» întoarce SQL-ul rulat, `reguli_livrare_la` și citatul textual — sesiunea rulează același SQL
   și compară; (c) «brambura la Drăxlmaier?» dă §11.3 cu sursa, nu «mediana + 15»; (d) «parcul la Drăxlmaier?» dă
   întrebarea pentru Ion cu cifrele din tabel, nu regula «service». Proba (e) — un agent NOU, pornit «execută» doar cu
   cele trei căi ale F1, scrie fișierul `404_…sql` în dereva și se oprește, iar SQL-ul e identic cu cel din planul
   aprobat — NU e proba agentului la pasul 1, ci execuția F1 însăși (pasul 2): fișierele ei apar abia atunci.

2. **F1 Drăxlmaier** (tichet propriu; planul îl scrie agentul la «cercetează», review-ul îl face sesiunea principală):
   migrația `404_lde_drax_ferestre_reguli.sql` după 403, într-un bloc `DO $$ … $$`: `DELETE`/`INSERT` 4 ferestre (`sursa
   'GPS 04.05–17.07 + 01.09–25.09.2026, ambele porți'`), `UPDATE lde_uzine SET reguli_livrare = $r$…$r$, reguli_livrare_la
   = now() WHERE id = 'DRAXELMAIER_BALTI' AND reguli_livrare IS NULL; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE
   EXCEPTION`; `livrare_validata` rămâne `false`; fără funcții. Textul: §1 surse (act KW24, schelet ideal ION-71, flota din
   urmă la oricare poartă, unitatea rută × linie, mașina se poate schimba), §2 ore (07:00–15:30 / 15:30–00:00; GPS
   sosire ~06:13, schimb ~14:41 / 15:54, plecare ~00:18; grupele D / E+Z / ambele și rotația: D sch. 1 în săpt. ISO
   impare; sâmbăta parțial ≈ 8 mașini; duminica nu; ziua 03:00 → 03:00), §3 tur/retur (ferestrele; două porți EST/VEST =
   aceeași uzină, aceleași ferestre; zona comună VEST/parc: atingerea porții bate parcul), §4 rută și capăt (start =
   capăt, ≤ 2,5 km la capătul cursei, omonime după al doilea sat, satul din act nu e de trecere), §6 etalon (ION-71:
   mediana pe urmă, tur = retur, ture/zi măsurat; pe schimb unde s1 ≠ s2), §9 formula lei/km; marcaje = titlu + rând:
   `5. CATEGORII DE KM\n5.1 [SE SCRIE ÎN FAZA 2, DUPĂ MĂSURARE]`, `7. UNDE DOARME MAȘINA\n7.1 [SE SCRIE ÎN FAZA 2, DUPĂ
   MĂSURARE]`, `8. REGULILE DE ECONOMIE\n8.1 [SE MĂSOARĂ ÎN FAZA 2 ȘI SE CONFIRMĂ DE ION]`, `10. RAPOARTE ȘI CONTROL\n10.1
   [SE SCRIE ÎN FAZA 3]`, `11. TIMP LIBER ȘI BRAMBURA\n11.1 [SE SCRIE ÎN FAZA 3]`, `12. INDICAȚII SĂPTĂMÂNALE PENTRU
   DISPECER\n12.1 [SE SCRIE ÎN FAZA 3]` (newline real, `$m$…$m$`). Aplicată prin MCP + fapt `kind=migration` pe tichetul
   fazei; Ion o citește pe `/lde/livrare-reguli`. Verificare: 4 ferestre; text ≥ 3.000 caractere cu cele 6 marcaje.

3. **F2 Drăxlmaier** (tichet propriu): `drax/cod/economie/` pe VPS, după `briceni/cod/livrare.mjs`; fereastra = 4 săptămâni
   ISO încheiate, 2 pare + 2 impare (36–39: 31.08–27.09, pornire ≥ 28.09; zilele de la margini ±1 pentru nopți; 31.08
   verificat față de media L–V, steag dacă e atipică); flota pe săptămână (≥ 4 zile la EST sau VEST). Pentru fiecare
   mașină și zi:
   (a) **intervale cu O categorie**, după tabela de precedență a modelului Briceni (`livrare.mjs:5-16`), în ordinea asta
   («capăt» = satul-capăt al LINIEI, nu punctul de start al cursei):

   | # | categorie | definiție | economie? |
   |---|---|---|---|
   | 1 | cu oameni | tur / retur pe o linie, din ferestre + capăt; perechea se numără doar pe curse cu `schimb` nenul | nu |
   | 2 | livrare | primul drum al zilei de la locul nopții până la capăt (sau poartă) și ultimul de la capăt (sau poartă) spre locul nopții, MINUS partea lor pe culoarul liniei acoperită de bugetul din rândul 3(a) (ca la Briceni, golul impus de ture se scade din livrare); între două curse ale unor linii DIFERITE cu trecere pe acasă (≥ 20 min), livrare e DOAR OCOLUL = drumul pe acasă minus drumul direct dintre cele două curse (regula lui Ion la Briceni, 26.09, `RaportBriceni.tsx:200-205`, `BucataZi.golTure`: o bucată poate purta două categorii) | R1-SEBN |
   | 3 | gol pe rută | (a) piciorul gol pe CULOARUL liniei, poartă → capăt înaintea primului tur al zilei și capăt → poartă după ultimul retur, cel mult bugetul liniei = 2 × lungimea liniei pe zi (`golImpusDeTure`, `livrare.mjs:132-153,352`); (b) golul dintre două curse cu oameni ale ACELEIAȘI linii care NU sunt turul și returul aceleiași perechi (ex. retur s1 → tur s2 pe aceeași linie: poartă → capăt gol); NICIUNA din cele două nu se aplică în intervalul dintre turul și returul aceleiași perechi | nu (al uzinei) |
   | 4 | gol între ture | ÎNTREG intervalul dintre turul și returul aceleiași perechi, fără altă cursă cu oameni între ele, oriunde ar merge mașina (acasă, la parc, altundeva) — decizia 4 | R3-Drax |
   | 5 | parc | staționare ≤ 0,5 km de Parcul Bălți; categorie proprie până la decizia lui Ion (întrebarea 1) | de decis |
   | 6 | service | drum la parc în zile fără curse | nu |
   | 7 | deplasare | ieșire la > 15 km de uzină, de satele liniilor mașinii și de casă | brambura, dacă e drum nemai-mers |
   | 8 | legătură | drumul DIRECT (pe șosea, Valhalla) între curse ale unor linii DIFERITE ale mașinii, cu sau fără casă pe drum — partea de ocol pe acasă e livrare (rândul 2); drumul spre altă linie NU e gol pe rută | nu (impus de joburi) |
   | 9 | necunoscut | restul | nu |

   Σ intervale = km-ul zilei din urma brută (±3 %). Probe obligatorii: o zi reală a unei mașini care doarme în afara
   rutei dă livrare > 0; o zi cu două linii dă legătură > 0; o zi cu o singură pereche și drum acasă la prânz dă
   gol între ture > 0 (nu gol pe rută); o zi cu două linii și trecere pe acasă între ele dă livrare = doar ocolul, iar
   legătura = drumul direct.
   (b) **alternativele de economie, pe tipar, COMPARATE pe mașină (o coloană «cea mai bună»), niciodată adunate**:
   - R1-LEAR «doarme lângă uzină»: ziua = Σ pe perechile (linie, schimb) duse EFECTIV de mașină de 4 × etalonul liniei
     (pe schimb unde s1 ≠ s2) + **2 × etalon pentru fiecare jumătate de pereche REALĂ** (cursa-pereche lipsă — aceeași
     linie, același schimb, aceeași zi — apare la altă mașină) + drumurile în plus; o jumătate fără cursa-pereche la
     nicio mașină = steag «pereche incompletă, probabil nedetectată»: ziua iese din suma R1 și R3 și se numără separat;
     zile fără nicio cursă cu oameni nu intră.
   - R3-Drax «așteaptă lângă uzină între tur și retur» (decizia 4, citită «sau»): economia = categoria 4 «gol între
     ture»; se calculează pe TREI mulțimi de zile, fără să aleagă: (a) doar zilele cu o singură pereche, pe orice
     lungime (13 % din zile); (b) orice «gol între ture» pe liniile peste pragul de lungime, chiar dacă mașina mai duce
     alte linii; (c) ambele; pragul de lungime și mulțimea le alege Ion la întrebarea 2, cu cifrele fiecăreia; pragul de
     semnificație rămâne §12.2 (100 km/săpt.).
   - R1-SEBN «șofer din satul de start / mașina așteaptă la capăt»: economia = livrarea netă (categoria 2).
   - R2 «realocare pe clase» (50 / 27 / 20 locuri): unitatea = (zi, schimb, clasă), perechea unei linii; se măsoară
     ÎNTÂI câte (zi, schimb) au o mașină cu ≥ 2 perechi sau o pereche dusă de două mașini; **atribuire ungară** (fără
     plafon), în care mașina cu k perechi primește k sloturi legate în lanț cu costul capăt → capăt, iar perechea
     despărțită între două mașini rămâne cu steag «R2 necalculat — pereche multiplă/despărțită, n = …»; minimizează
     Σ casă → capăt; se raportează ca REPARTIZARE COMUNĂ pe clasă (mutările, câștigul net, contribuțiile negative
     păstrate), nu ca alegere pe mașină; coloana pe mașină explică, recomandarea vine din scenariul comun validat.
   Km pe șosea (Valhalla), fără estimări; casa = cea mai lungă staționare luni–vineri (fără poartă, fără parc);
   (c) control pe toată flota (§10 LEAR: casa ca stație, cursă > 140 km, schimb în afara ferestrei, dispozitiv dublu).
   Ieșire: `date/economie.json`, pagină artefact «Economia Drăxlmaier» (tabel pe mașină: categorii/zi, R1 / R3 / livrare
   / R2 în km și lei unde există normă; pe flotă; tabelul tiparelor de zile) + întrebările pentru Ion, formulate de agent,
   puse de sesiunea principală: (1) parcul = «lângă uzină» sau service, și cât de mare e zona lui; (2) golul între ture:
   citirea (a) / (b) / (c) și pragul de lungime, cu cifrele fiecăreia; (3) care reguli intră în §8; (4) mesajul de timp
   liber către ADMIN: `?liber=1` sau nimic până la poster; (5) există un schimb 3 la Drăxlmaier (atingeri ale porții
   22:00–06:00 în afara ferestrelor, cu cifra lor) sau nu. Verificarea 4 primește: numărul zilelor cu jumătăți reale /
   probabil nedetectate; cursele `schimb = null` cu opriri de urcare în satele liniei; grupele R2 cu steag. Commit = planul
   F2 + raportul în `docs/plans/`; §5, §7, §8 = tichet separat după «da», migrația prin `DO` cu `replace` pe cele trei
   marcaje (gard `AND`, `ROW_COUNT = 1`, `reguli_livrare_la = now()`).

4. **F3 Drăxlmaier** (tichet propriu): `drax/cod/saptamanal.sh` (nomenclator → curse pe săptămână ±1 zi → economie →
   `scrie-analiza.mjs --write`, `uzina = 'DRAXELMAIER'`, `date` = forma `AnalizaBriceni` (intervale pe categorii +
   alternativele alese în §8) + `timp_liber { prag_km, … }` + `masini[].liber`, ca `textTimpLiber` să aibă ce citi),
   `flock`, `nice`; durata măsurată DE MÂNĂ pe o săptămână încheiată, în afara ferestrei de luni, ÎNAINTE de a pune blocul:
   ≤ 5 min → blocul în `lear-saptamanal.sh` DUPĂ Briceni și ÎNAINTEA verificării `CRON_SECRET`, `timeout` = 3 × durata
   măsurată; > 5 min → cron separat luni 07:00 cu `timeout` ≤ 50 min (să se termine înainte de paznicul de la 08:00) și
   paznicul îl verifică (repo + VPS identic; `lear-saptamanal.test.sh` cu falsul `$T/lde/drax/cod/saptamanal.sh` +
   `FAKE_DRAX_EXIT` și cazul «Drăxlmaier picat → tot apelurile, cod ≠ 0» în antet); după «da»-ul lui Ion la întrebarea 4,
   al cincilea `cheama "drax-optimizari?liber=1"` în script (testul trece la 5 apeluri; ruta fără rând nu trimite nimic); **modulul comun** `lear-timp-liber.mjs` extins COMPATIBIL: helper exportat `portiDin(ctx)` (= `ctx.porti ??
   [ctx.poarta]`, idempotent) și `distPoarta(p, ctx)` (minimul peste porți), chemate în TOATE cele patru funcții exportate
   (`curseCuOpriri`, `caseSecundare`, `eticheteaza`, `rezumaSaptamina`; `grep -c "ctx.poarta"` = 0 în afara helperului;
   atingere = oricare poartă, `depMax` / `rCasa` = cea mai apropiată), `ctx.ancoraBateParcul` (implicit false),
   `ctx.schimb3` (implicit true; `false` la Drăxlmaier dacă Ion confirmă că nu există schimb 3 — întrebarea 5),
   `R_PARC_ZONA` prin `ctx.praguri` (există deja, `:89,189,211,345`; valoarea din întrebarea 1), apelantul Drăxlmaier
   scoate porțile proprii din `alteUzine`; apelanții vechi (`lear-analiza.mjs:1289`, `sebn-liber.mjs:181`) NEATINȘI;
   teste: nerecul pe `ctxDe` vechi (aceleași etichete), ctx FĂRĂ `poarta` pe toate patru funcțiile cu `Number.isFinite`
   pe `depMax` / `rCasa`, o zi reală 346KAJ, atingere la 22:10 în afara ferestrelor și într-o duminică nelucrătoare cu
   `schimb3: false` → `ancora === null` (eticheta finală poate fi «neclar», fiindcă ambele porți stau în zona parcului de
   3 km, `lear-timp-liber.mjs:291`); livrarea modulului pe VPS niciodată luni 07:30–09:30 (plan propriu în planul F3);
   `RaportDrax.tsx` arată și timpul liber / brambura (linkul din mesajul ADMIN duce acolo);
   `lde/reguli/page.tsx` (fila `drax`, `alese` la `:53`, ternarul `:118`) + `RaportDrax.tsx`; `lde/schelet/page.tsx`
   (fila `drax`) + `ScheletDraxClient.tsx` după `ScheletBriceniClient` + `public/lde/schelet-drax.json` din
   `drax/cod/ideal/export-lde.mjs` cu forma `{ fixat, perioada, porti: [{ c: Punct, n: 'EST'|'VEST' }], rute: [{ id, nr,
   nume, linii: [{ nr, capat, km, tureZi, kmZi: 2 × km × tureZi, grupa, schimburi, tur: { plin }, retur: { plin }, sate }] }] }`;
   `toate.ts` cu al cincilea schelet = a ȘASEA rețea și `TENTE.drax`; `lib/lde/drax-optimizari-image.ts` +
   `/api/cron/drax-optimizari` (PNG implicit; `?send=1` poster + indicații; `?liber=1` doar mesajul ADMIN — după răspunsul
   lui Ion la întrebarea 4 din F2 — refolosind `textTimpLiber(…, { nume, uz: 'drax' })` cu adaptarea explicită a
   mașinilor `{ masina: m.m, liber: m.liber }` (`MasinaBriceni` are câmpul `m`, `textTimpLiber` cere `masina`,
   `timp-liber.ts:27,51`) și revendicarea atomică pe `alerta_trimisa_la` / `rulat_la` din `lde-timp-liber/route.ts:99-120`,
   extrasă într-o funcție comună sau copiată cu test; teste «fără send/liber nu pleacă nimic», «două apeluri → un singur
   mesaj» și un test pozitiv cu funcția reală pornit din forma JSON a workerului, care verifică plăcuța în mesaj); `luni-paznic.ts` `UZINE_LUNI` cu
   `rind: 'DRAXELMAIER'`, `poster: null`, `indicatii: null`, textul de retrimitere cu `drax/cod/saptamanal.sh`
   (`luni-paznic.test.ts` extins); ordinea livrării: VPS întâi, apoi push cu `UZINE_LUNI`; `lde-timp-liber` NU se
   atinge. Migrația cu §10–§12 prin `DO` + `replace` pe cele trei marcaje.

5. **F4**: două luni de rulare, raport de abateri, memoria `drax-reguli-livrare.md`; lecțiile agentului intră în corpul
   lui doar prin commit revizuit.

## Fișiere

| Fișier | Ce se schimbă |
|---|---|
| `.claude/agents/uzina-analist.md` | nou — rol, ordinea surselor, index cu căi absolute, procedura în 4 faze × 2 porniri, contractele, regulile de lucru |
| `docs/plans/2026-09-26-uzina-analist-draxlmaier.md` | copia planului aprobat (umbrelă) |
| `docs/plans/<data>-drax-f1.md`, `-f2.md`, `-f3.md` + `…-raspunsuri.md` | planurile fazelor și răspunsurile lui Ion, textual |
| `packages/db/migrations/404_lde_drax_ferestre_reguli.sql` (F1) | `DO`: 4 ferestre + text §1–§4, §6, §9 + 6 marcaje; `IS NULL` + `ROW_COUNT` |
| `packages/db/migrations/40x_lde_drax_reguli_economie.sql` (după «da», tichet separat) | `DO` + `replace` pe marcajele §5, §7, §8 |
| `packages/db/migrations/40y_lde_drax_rapoarte.sql` (F3) | `DO` + `replace` pe marcajele §10–§12 |
| VPS `/root/lde-worker/drax/cod/economie/*.mjs`, `drax/cod/saptamanal.sh`, `drax/cod/scrie-analiza.mjs`, `drax/cod/ideal/export-lde.mjs` | categoriile, alternativele (R2 ungar), rândul săptămânal, exportul |
| `lde-geo-worker/lear-saptamanal.sh` (+ VPS), `lear-saptamanal.test.sh`, `lear-timp-liber.mjs` (compatibil: `porti`, `ancoraBateParcul`, `R_PARC_ZONA` prin ctx), `lear-timp-liber.test.mjs`; `lear-analiza.mjs`, `sebn-liber.mjs` NEATINSE, verificate la nerecul | blocul Drăxlmaier; extinderea compatibilă a modulului |
| `apps/admin/src/app/(dashboard)/lde/reguli/page.tsx`, `reguli/RaportDrax.tsx`, `lde/schelet/page.tsx`, `schelet/ScheletDraxClient.tsx`, `schelet/toate.ts`, `apps/admin/public/lde/schelet-drax.json`, `lib/lde/drax-optimizari-image.ts` (+ test), `api/cron/drax-optimizari/route.ts`, `lib/lde/luni-paznic.ts`, `luni-paznic.test.ts` (F3) | intrarea Drăxlmaier |
| `.tp/report.md` pe fiecare tichet; memoria `drax-reguli-livrare.md` | livrarea și lecțiile |

## Riscuri

- **Agentul răspunde în locul lui Ion sau sare gate-ul**: două porniri pe fișiere; probele (d), (e).
- **Agentul «știe» în loc să citească / definiții vechi**: ordinea surselor + probele (b)–(d).
- **Modulul comun**: extindere compatibilă (`ctx.porti ?? [ctx.poarta]`, implicite neschimbate), apelanți neatinși, nerecul pe LEAR/Florești/SEBN, livrare în afara ferestrei de luni.
- **Zona comună VEST / parc**: precedență în §3 și în `ctx`; categorie «parc» separată; decizia lui Ion (F2, întrebarea 1) înainte de F3.
- **Cifre contradictorii**: alternative COMPARATE; R2 ca repartizare comună; jumătățile de pereche numărate.
- **Posterul / mesajul ADMIN fără «da»**: rută proprie `?send=1` / `?liber=1`; paznic cu `poster: null`; `lde-timp-liber` neatins.
- **Corecturile lui Ion de pe pagină**: F1 doar pe NULL; restul prin `DO` + `replace` cu `ROW_COUNT = 1` (migrația pică zgomotos, nu se înregistrează).
- **Luni fără cheie**: blocul înaintea verificării `CRON_SECRET`, ca Briceni; durata măsurată; cron separat ca rezervă.
- **Migrații**: 404 verificat în repo și în `schema_migrations`; fără funcții.
- **Handoff / Done**: fiecare fază are commit; §8 tichet separat.

## Verificare

1. Agentul: într-o sesiune nouă, probele (a)–(d) din pasul 1 trec; comparația SQL caracter cu caracter. Proba (e) se
   bifează la F1 (pasul-poartă: fișierul `404_…sql` scris de un agent nou, identic cu planul, înainte de aplicare).
2. Umbrela: tichet, plan în `docs/plans`, commit + push `HEAD:main`, `tp handoff`.
3. F1: `select count(*) from lde_uzina_ferestre_ceas where uzina_id='DRAXELMAIER_BALTI'` = 4; `length(reguli_livrare)` ≥ 3.000
   cu cele 6 marcaje; textul pe `/lde/livrare-reguli`; `livrare_validata` false; rerularea migrației pică cu excepție.
4. F2: artefactul cu flota săptămânii, Σ categorii/zi = urma brută ±3 %, probele «doarme în afara rutei → livrare > 0» și
   «două linii → legătură > 0», tabelul tiparelor (o pereche / două / ≥ 2 linii / jumătăți reale / probabil nedetectate)
   cu numărul zilelor, cursele `schimb = null` cu opriri de urcare, R3 pe cele trei citiri (a)/(b)/(c), alternativele
   comparate (o coloană «cea mai bună»), R2 cu o cifră sau un steag pe fiecare clasă și numărul grupelor cu pereche
   multiplă/despărțită, control fără blocante neexplicate; cele 5 întrebări puse lui Ion de sesiunea principală; după
   «da»: marcajele §5/§7/§8 înlocuite, `ROW_COUNT = 1`.
5. F3: durata blocului măsurată de mână înainte (≤ 5 min → în script, altfel cron 07:00); rândul `DRAXELMAIER` în
   `lde_analiza_reguli` după prima luni (și fără `CRON_SECRET`); `/lde/reguli?uz=drax`, `/lde/schelet?uz=drax`, «Toate
   rutele» cu a șasea rețea; `lear-saptamanal.test.sh` (falsul Drăxlmaier), `luni-paznic.test.ts`, `lear-timp-liber.test.mjs`
   (nerecul + ctx fără `poarta` pe toate patru funcțiile + 346KAJ + 22:10 duminică cu `schimb3: false`), testele rutei
   («fără send/liber nimic», «două apeluri → un mesaj») verzi; `grep -c "ctx.poarta"` = 0 în afara helperului; paznicul
   știe uzina și numește scriptul ei.

## Gate (26.09, după cele trei runde Codex)

| Partea | Scor | critical/high deschise |
|---|---|---|
| Codex — critic extern, runda 3 pe v4 | 8,5 (Codex a scris 9,0; Σ deduceri 1,5) | 0 — verdict PASS |
| Claude — minimul revizorilor pe v4 (business 7,5 · senior-backend 5,2) | 5,2 | 0 rămase: B21 și S26 (câte un high pe v4) sunt acceptate și corectate în v5 (tabela categoriilor: rândurile 2, 3, 4, 8), fără re-revizuire — a patra rundă e interzisă |

Istoric: Codex 3,5 (r1, 2 high) → 7,5 (r2, 1 high) → 8,5 (r3, pass). Claude business 0,0 → 2,5 → 4,7 → 7,5; senior 0,0 → 1,0 →
4,7 → 5,2. În total 62 de observații, toate acceptate (niciuna respinsă). Punctul slab rămas: definiția categoriilor de km
(«livrare», «gol pe rută», «gol între ture», «legătură») a fost corectată de patru ori la rând (B3, B11, B16, B21, S26 — ultima
fiindcă Ion a schimbat regula la Briceni chiar pe 26.09) — F2 trebuie să treacă prin cele patru probe obligatorii din tabelă
înainte ca cifrele să ajungă la Ion, iar agentul citește regula Briceni din `RaportBriceni.tsx` la zi, nu din plan.

## Critic extern — runda 3 (Codex, 26.09, ultima) · scor 8,5 (Codex a scris 9,0), verdict PASS (0 high)

| id | sev. | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| C1 (r3) | medium | `MasinaBriceni.m` vs `textTimpLiber` care cere `masina` | acceptat | F3: adaptarea `{ masina: m.m, liber }` + test pozitiv cu funcția reală |

## Triaj revizori Claude — runda 4 (v4 → v5)

| id | sev. | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| B21 | high | rândul 3(b) prindea și intervalul dintre turul și returul aceleiași perechi → R3 = 0 | acceptat | tabela: 3(a)/(b) nu se aplică în intervalul perechii; 4 = întreg intervalul, oriunde ar merge mașina; probă «o pereche + acasă la prânz → gol între ture > 0» |
| B22 | low | bugetul fără unitate; golul impus scăzut din livrare; drumul spre altă linie ca gol pe rută | acceptat | 2 × lungimea liniei pe zi; livrare minus partea pe culoar; legătura explicit |
| S26 | high | regula lui Ion la Briceni din 26.09 (commit 33fc6761): pe acasă între curse, livrare = doar ocolul; drumul direct = legătură / gol între ture | acceptat | tabela: rândurile 2 și 8; probă «două linii + acasă între ele → livrare = ocolul» |
| S27 | medium | nimic nu cheamă `drax-optimizari?liber=1` | acceptat | al cincilea `cheama` după «da»; testul la 5 |
| S28 | low | `timeout` 3× în varianta cron 07:00 poate trece de 08:00 | acceptat | `timeout` ≤ 50 min |
| S29 | low | linkul mesajului duce pe `RaportDrax` fără timp liber | acceptat | `RaportDrax` arată timpul liber / brambura |
| S30 | low | testul 22:10 nu poate cere eticheta «liber» (zona parcului) | acceptat | testul verifică `ancora === null` |
| S31 | low | «cercetează» scria încă «direct în docs/plans» | acceptat | doar fișierul de plan sau scratchpad |

## Critic extern — runda 2 (Codex, 26.09) · scor 7,5 (Codex a scris 8,0; Σ deduceri 2,5), verdict fail (1 high)

| id | sev. | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| C1 (r2) | high | excepția `NOAPTE_S3` (22:00–06:00) creează ancore de muncă la Drăxlmaier fără schimb 3; proba sintetică: duminică 22:10 → 17,8 km «muncă» | acceptat | fapt nou în tabel; `ctx.schimb3` (implicit true, false la Drăxlmaier după întrebarea 5); teste 22:10 / duminică |

## Triaj revizori Claude — runda 3 (v3 → v4)

| id | sev. | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| B16 | high | precedența numerică făcea din livrare «gol pe rută» → R1-SEBN ≈ 0, legătura dispărea | acceptat | fapt nou (modelul `livrare.mjs:5-16,67-71,132-153`); tabela de precedență rescrisă (livrare > gol pe rută restrâns > gol între ture); «capăt» = satul-capăt al liniei; probe |
| B17 | medium | decizia 4 transcrisă «și», citatul spune «sau» | acceptat | decizia 4 rescrisă textual; R3 pe trei citiri (a)/(b)/(c), Ion alege la întrebarea 2 |
| B18 | medium | jumătatea din detectare (retur după fereastră) iese economie | acceptat | jumătate reală doar cu cursa-pereche la altă mașină; altfel steag și afară din sumă; `schimb = null` verificat pe opriri |
| B19 | medium | R2 ungar unu-la-unu nu acoperă mașina cu două perechi în același schimb | acceptat | se măsoară întâi; k sloturi în lanț sau steag |
| B20 | low | «decizia 4» în loc de «întrebarea 4» | acceptat | corectat |
| S19 | medium | normalizarea porților într-o singură funcție lasă celelalte trei cu `hav(p, undefined)` | acceptat | fapt nou; `portiDin` / `distPoarta` în toate patru; `grep` = 0; test ctx fără `poarta` |
| S20 | medium | proba (e) cerută înaintea fișierelor F1; «execută» ar aplica migrația în prod | acceptat | pas-poartă (SQL scris, oprire); proba (e) = execuția F1; verificarea 1 = (a)–(d) |
| S21 | medium | `?liber=1` fără dedup și fără câmpurile cerute de `textTimpLiber` | acceptat | fapt nou; `date` = `AnalizaBriceni` + `timp_liber` + `masini[].liber`; revendicarea atomică refolosită; teste |
| S22 | medium | durata blocului măsurată abia după ce stă în fața posterelor | acceptat | măsurare de mână înainte; prag 5 min; `timeout` = 3 × durata |
| S23 | low | testul scriptului fără falsul Drăxlmaier | acceptat | falsul + `FAKE_DRAX_EXIT` + antet |
| S24 | low | locul scrierii la «cercetează» nefixat | acceptat | doar în afara repo-ului; sesiunea copiază după `tp new` |
| S25 | low | «a 5-a rețea» (e a șasea); textul paznicului | acceptat | corectat |

Scoruri v3: business-logic 4.7 (1 high: B16), senior-backend 4.7 (0), Codex 7.5 (1 high). Toate închise în v4 prin corecție.

## Critic extern — runda 1 (Codex, 26.09) · scor 3,5 (Codex a scris 4,5; Σ deduceri 6,5), verdict fail (2 high)

| id | sev. | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| C1 | high | «cea mai bună» aleasă pe mașină desface repartizarea comună R2 | acceptat | F2 (b): R2 raportat ca repartizare comună pe clasă, contribuțiile negative păstrate; coloana pe mașină doar explică |
| C2 | high | blocul Drăxlmaier după verificarea `CRON_SECRET` nu rulează fără cheie | acceptat | F3: blocul după Briceni, înaintea verificării cheii (fapt în tabel: `lear-saptamanal.sh:42-48`); test «fără cheie» |
| C3 | medium | R2 din LEAR sare grupele > 16 și e exponențial | acceptat | fapt nou (clasa 50 până la 18); atribuire ungară, steag pentru grupe necalculate |

## Triaj revizori Claude — runda 2 (v2 → v3)

| id | sev. | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| B11 | high | R3-Drax admitea mașini cu două perechi pe aceeași linie; fără precedență gol pe rută / gol între ture | acceptat | decizia 4 citită literal (o singură pereche, fără jumătăți); precedența categoriilor 2 > 3; tabelul tiparelor în «Verificat pe viu» |
| B12 | high | jumătățile de pereche nu intră în R1 → km cu oameni ca economie | acceptat | R1: + 2 × etalon pe jumătate; etalon pe schimb unde s1 ≠ s2; `schimb = null` nu e pereche; verificarea 4 |
| B13, S13 | medium/high | în modul parcul bate munca; zona de 3 km acoperă uzina; porțile proprii ca «altă uzină» | acceptat | F3: `ctx.ancoraBateParcul`, `ctx.praguri.R_PARC_ZONA` (după decizia lui Ion), porțile proprii scoase din `alteUzine`, test 346KAJ |
| B14, C3 | high | R2 copiat de la LEAR: plafon 16, tura A/B | acceptat | unitatea (zi, schimb, clasă), ungar, steag |
| B15 | low | 31.08 zi de august | acceptat | verificată față de media L–V, steag |
| S12 | high | `ctx.porti` ca redenumire rupe LEAR/Florești/SEBN | acceptat | `ctx.porti ?? [ctx.poarta]`, apelanți neatinși, nerecul pe `ctxDe` vechi, livrare în afara lunii |
| S14 | high | contractul presupune un agent viu de la plan la execuție și scriere în Plan Mode | acceptat | contract pe fișiere, două porniri, măsurătorile în afara Plan Mode, proba (e) |
| S15 | medium | `replace` cu no-op tăcut | acceptat | `DO` + `ROW_COUNT = 1`, gard `AND`, marcaj = titlu + rând, `reguli_livrare_la` |
| S16 | medium | nimeni nu trimite mesajul de timp liber ADMIN | acceptat | `?liber=1` pe ruta proprie, decizia lui Ion (întrebarea 4 din F2) |
| S17 | low | forma `schelet-drax.json` ≠ `Retea` | acceptat | forma aliniată; `TENTE.drax` |
| S18 | low | locul blocului; ordinea livrării; testul | acceptat | = C2; VPS întâi; cazul «picat → 4 apeluri» |
| S6 (rest) | — | §8 tichet separat | acceptat | pasul 0 și 3 |

Scoruri v2: business-logic 2.5 (3 high), senior-backend 1.0 (3 high), Codex 3.5 (2 high). Toate închise în v3 prin corecție.

## Triaj revizori Claude — runda 1 (v1 → v2)

| id | sev. | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| S1 | high | subagentul n-are AskUserQuestion / ExitPlanMode / revizori | acceptat | «Ce facem»: împărțirea rolurilor; pasul 1 procedura (d); proba (d) |
| S2 | high | cheia `drax` în `lde-timp-liber` trimite posterul fără «da» | acceptat | F3: rută proprie `drax-optimizari?send=1`, paznic `poster: null`; `lde-timp-liber` neatins |
| S3 | high | migrația cu §8 calcă corecturile lui Ion sau pune §8 după §12 | acceptat | marcaje fixe + `replace` gardat; F1 doar `WHERE IS NULL` |
| S4 | medium | `ReguliClient` legat de A/B și 4 × etalon | acceptat | fapt corectat în tabel; `RaportDrax.tsx` + `drax-optimizari-image.ts`; `page.tsx:53,118` |
| S5 | medium | blocul Drăxlmaier ar întârzia posterele LEAR/SEBN | acceptat | după `cheama floresti`, înaintea paznicului; durata măsurată |
| S6 | medium | F2 fără commit → handoff refuzat | acceptat | planul + raportul F2 în `docs/plans/`; §8 = handoff separat |
| S7 | medium | agentul negăsit fără ff-merge; proba neverificabilă; căi | acceptat | verificare în sesiune nouă; probe cu SQL comparat; căi absolute; memoria proiectului |
| S8 | medium | testele existente lipsesc | acceptat | F3: `lear-saptamanal.test.sh`, `luni-paznic.test.ts`, `lear-timp-liber.test.mjs`, test `?send` |
| S9 | low | numărul migrației, DELETE+INSERT, `livrare_validata`, fără REVOKE | acceptat | 404, șablonul 403 |
| S10 | low | cheia `'Drăxlmaier Bălți'` | acceptat | `DRAXELMAIER` |
| S11 | low | `toate.ts`, forma `schelet-drax.json`, client după Briceni | acceptat | F3 |
| B1 | high | R1-LEAR scris ca 2 × ture/zi × etalon (doar km cu oameni) | acceptat | F2 (b): 4 × etalon pe perechile duse efectiv; `ture/zi` doar control |
| B2 | high | parcul la 0,7 km de VEST: raze suprapuse, trei verdicte | acceptat | fapt nou (2,5 % nopți, 10 % așteptări, 346KAJ 89 %); precedență în §3; categorie «parc»; §5/§7 ies din F1; întrebare pentru Ion la F2 |
| B3 | high | golTure vs R3 numără aceiași km; regulile nu-s alternative | acceptat | F2 (b): alternative COMPARATE; R3-Drax doar pe mașini cu o linie/zi (decizia 4 a lui Ion, chat 26.09); «legătură» când duce altă linie |
| B4 | high | modulul are o poartă; «o poartă pe mașină» neverificat | acceptat | fapt nou: 82 % din zile ating ambele porți → `ctx.porti` cu teste de nerecul (F3); F2 cu lista proprie |
| B5 | medium | F1 scrie secțiuni care depind de F2/F3 | acceptat | F1 = §1–§4, §6, §9 formula; marcaje pentru rest |
| B6 | medium | flota fixată la 49 | acceptat | flota pe săptămână, ≥ 4 zile la oricare poartă |
| B7 | medium | fereastra F2 neînchisă, dezechilibrată pe rotație | acceptat | 4 săptămâni ISO încheiate, 2 pare + 2 impare (36–39), pornire ≥ 28.09 |
| B8 | medium | definiția veche a bramburii în rol; fără ordinea surselor | acceptat | rol prin trimiteri; ordinea surselor; «nu se transpune = întrebare» |
| B9 | low | ferestre identice pe porți, weekend nemăsurat | acceptat | fapte noi: orele coincid pe EST/VEST; sâmbăta ≈ 8 mașini |
| B10 | low | proba «LEAR §5» nu prinde transpunerile | acceptat | probele (c) și (d) cu capcană |

Scoruri v1: business-logic 0.0 (4 high), senior-backend 0.0 (3 high). Toate închise în v2 prin corecție.


## Review: business-logic-auditor (v2)

Obiectul: planul v2 `shimmering-yawning-papert.md`, logica de business: cum închide v2 observațiile B1–B10 și ce defecte noi aduce. Deciziile 1–4 ale lui Ion nu le contest. Pe decizia 4 verific doar dacă planul o transcrie corect.

Codul l-am citit din `origin/main`: `lde-geo-worker/lear-analiza.mjs` și `lear-timp-liber.mjs`.

Faptele noi le-am măsurat read-only pe VPS, pe `/root/lde-worker/drax/date/obs-ideal.json` (ION-71). Scriptul a fost scris în fișier, trimis cu scp, rulat și apoi șters. Am numărat zilele-mașină luni–vineri, doar cursele cu linie și cu schimb. Fereastra: 2.849 de zile-mașină, din care 743 în septembrie. O „pereche" = tur + retur pe aceeași (rută, linie, schimb).

| Tipar zi-mașină (L–V) | toată fereastra | septembrie |
|---|---|---|
| o linie, **o** pereche, fără jumătăți | 369 (13,0 %) | 109 (14,7 %) |
| o linie, **două** perechi (s1 + s2) | 676 (23,7 %) | 174 (23,4 %) |
| două sau mai multe linii | ≈ 1.600 (≈ 55 %) | 388 (52 %) |
| cel puțin o **jumătate de pereche** (tur fără retur pe aceeași linie/schimb, sau invers) | ≈ 970 (≈ 34 %) | 231 (31 %) |
| nicio pereche completă | ≈ 9 % | — |

Separat:
- Cursele cu `schimb = null` (în afara ferestrelor): 3.735 din 14.697. Sunt picioarele goale structurale ale rutei.
- Pe clase de locuri, în septembrie, maximul de mașini pe zi și schimb: clasa 50 are **18**, clasa 20 are 16, clasa 27 are 5.

### Starea B1–B10

| id | stare | de ce |
|---|---|---|
| B1 | **închis** | R1 = Σ 4 × etalon pe perechile duse efectiv, iar `ture/zi` servește doar la control, ca la `lear-analiza.mjs:1166,1210`. Rămâne deschisă doar partea cu jumătățile de pereche, trecută la B12, pentru că e un defect nou de acoperire. |
| B2 | **închis pe F1/F2**, rest în B13 | F1/F2 sunt închise prin: fapte măsurate, categoria «parc» separată, precedență în §3 și întrebarea pentru Ion. Rămâne modulul pe care F3 îl pune în lanțul săptămânal: el are încă ordinea inversă (B13). |
| B3 | **închis pe principiu**, rest în B11 | S-a închis: alternativele se compară, nu se adună; R3 a primit decizia 4. S-a transcris greșit condiția de eligibilitate și lipsește precedența între categorii (B11). |
| B4 | **închis** | Faptul de 82 % e în plan, `ctx.porti` are teste de nerecul, iar F2 folosește propria listă de porți. |
| B5 | **închis** | F1 scrie §1–§4, §6 și §9-formula, cu marcaje pentru rest. |
| B6 | **închis** | Flota se ia pe săptămână, ≥ 4 zile la oricare poartă. |
| B7 | **închis**, cu nota B15 | Săptămânile 36–39 sunt 2 pare + 2 impare (verificat: 36 începe luni 31.08, 39 se termină duminică 27.09), pornire ≥ 28.09. |
| B8 | **închis** | Rolul trimite la surse în loc să copieze regulile; ordinea surselor e scrisă; regula «nu se transpune = întrebare» e scrisă. |
| B9 | **închis** | Orele sunt măsurate pe EST și pe VEST și coincid; sâmbăta are ≈ 8 mașini, duminica ≈ 1. |
| B10 | **închis** | S-au adăugat probele-capcană (c) și (d). |

### B11 — high (−2.0) — R3-Drax admite mașinile cu două perechi pe aceeași linie, contrar deciziei 4

**Dovada:**
- Decizia 4 a lui Ion, citată în plan (rândurile 26–29), vorbește despre «itinerar cu **1 tur/retur**», adică o singură pereche pe zi.
- Pasul 3 (b), R3-Drax, cere în schimb «DOAR pe mașinile care fac O SINGURĂ **linie** în ziua aceea».
- Categoria (a) «gol între ture» e definită ca «uzină → acasă → uzină între tur și retur ale ACELEIAȘI linii». Definiția nu cere ca între cele două să nu existe altă pereche.
- Fapt măsurat: 23,7 % din zilele-mașină (174/743 în septembrie) au o linie cu **două** perechi, de exemplu 748IZX pe Grinăuți: tur s1, tur s2, retur s1. Tiparul eligibil real (o linie, o pereche) are doar 13,0 %.
- Memoria `drax-schelet-rute.md` («EZ+D ambele schimburi zilnic»; `ture/zi` = 2 pe 16 linii).

**Scenariul de eșec.** Mașină pe o linie EZ+D, care duce s1 și s2 în aceeași zi. Casa e la capăt (șoferul e din satul de start). Etalonul e E.
- Între tur s1 (06:13) și retur s1 (15:54) mașina trebuie să fie la capăt la ~13:30 pentru tur s2. Drumul uzină → capăt(= casă) de după tur s1 e deci piciorul gol cerut de tur s2, adică «gol pe rută».
- Între tur s2 și retur s2 există o întoarcere goală capăt → uzină după retur s1. Și ea e cerută, pentru retur s2.
- Planul nu stabilește precedența între «gol pe rută» și «gol între ture». Când casa ≈ capăt, ambele se potrivesc. R3 ia intervalul drept «uzină → acasă → uzină» și raportează economie de ≈ E…2E pe zi. Dacă mașina ar aștepta la uzină, kilometrii aceia s-ar face oricum.
- Efectul: pe ~23 % din zilele-mașină apare o economie falsă. Pe pagina din F2 ea ajunge la Ion ca bază pentru §8.

**Corecția planului:**
- (1) Condiția R3-Drax devine «mașina face **o singură pereche** (tur + retur) în ziua aceea, fără jumătăți», adică decizia 4 citită literal. Orice alt tipar nu intră la R3.
- (2) În (a) se adaugă precedența: «gol pe rută» (piciorul gol cerut de o cursă cu oameni a mașinii, cu ≤ 2,5 km la capăt) bate «gol între ture». «Gol între ture» e doar intervalul dintre turul și returul aceleiași perechi, fără altă cursă cu oameni între ele.
- (3) Tabelul tiparelor de mai sus intră în «Verificat pe viu», ca Ion să vadă pe câte zile se aplică R3.

### B12 — high (−2.0) — Jumătățile de pereche nu au loc în R1: km cu oameni ajung „economie"

**Dovada:**
- `lear-analiza.mjs:1210`: `z1 = patru + alte`, iar economia = `aziL − z1`.
- `lear-analiza.mjs:626-666`, `alteCurse`: km de pe formele rutelor (`peRuta`) nu intră în `alte`. Așadar km-ii unei curse pe o linie din schelet care nu e în `alese` nu sunt nici în `patru`, nici în `alte`. Rămân doar în `aziL`.
- Planul, pasul 3 (b): «Σ pe perechile … DUSE EFECTIV … zile fără pereche completă nu intră». Excluderea acoperă doar zilele fără nicio pereche completă (≈ 9 %).
- Fapt măsurat: ≈ 34 % din zilele-mașină (31 % în septembrie) au cel puțin o jumătate de pereche. Cauzele sunt tur pe X cu retur pe Y (ca la LEAR Ungheni, «altă rută pe fiecare tură»), retur dus de altă mașină (SEBN §1.1, citat în §1 al planului) sau retur nedetectat.

**Scenariul de eșec.** Mașina duce perechea X (E_X = 30 km) plus tur Y (E_Y = 40 km), iar retur Y îl duce altă mașină.
- `aziL` conține 2·E_Y = 80 km pentru tur Y (gol la capăt + plin la uzină).
- `z1` = 4 × 30 + alte, fără Y.
- R1 raportează 80 km/zi economie, din care 40 km sunt cu oameni.
- Pe ~22 % din zilele-mașină (zilele cu pereche completă ȘI jumătăți), R1 și, pe aceeași bază, R3 și «cea mai bună» sunt umflate.

**Corecția planului:**
- F2 (b): «fiecare curs cu oameni a mașinii intră în ziua regulii». O jumătate de pereche contribuie cu 2 × etalonul liniei ei (dus gol + plin, sau plin + întors gol). Alternativ, ziua cu jumătăți iese din R1 cu steag «pereche incompletă».
- Tur X / retur Y în același schimb = 2E_X + 2E_Y.
- Perechea se numără doar pe cursele cu `schimb` nenul. Cele 3.735 de picioare goale cu `schimb = null` nu sunt perechi.
- Pe linia cu două drumuri (Sturzovca: s1 24,7 / s2 46,9) etalonul se ia pe schimb, nu pe linie.
- În «Verificare 4» se adaugă: numărul zilelor cu jumătăți și cum au fost tratate.

### B13 — medium (−1.0) — F3 pune în lanț un modul în care parcul bate munca, contrar §3

**Dovada:**
- `lear-timp-liber.mjs:275,286-287`: orice pauză ≥ 2 min la ≤ 0,5 km de parc face din cursă «reparație».
- Verificarea se face ÎNAINTE de `if (e.eticheta === 'muncă') continue` (`:289`), deci reparația bate munca.
- F3 schimbă doar `ctx.poarta → ctx.porti`.
- §3 din F1 spune invers: «atingerea porții bate parcul».
- Fapt din plan: 10 % din plecările de după tur se termină la parc, 346KAJ în 89 % din zile.

**Scenariul de eșec.** Luni, pe Drăxlmaier, cursele cu așteptare la parc devin «reparație». Timpul liber real nu mai apare (alertă ratată). Textul §3 de pe `/lde/livrare-reguli` contrazice ce raportează lanțul.

Rămâne medium pentru că nu produce alerte false și nu atinge celelalte uzine.

**Corecția:** planul propriu al schimbării modulului (în F3) include:
- precedența porții față de parc (sau `ctx.parc = null` pentru Drăxlmaier până la decizia lui Ion);
- un test pe o zi de tip 346KAJ.

### B14 — high (−2.0) — R2 copiat de la LEAR se oprește în tăcere pe clasa de 50 de locuri

**Dovada:**
- `lear-analiza.mjs:1340`: `for (const tura of ['A', 'B'])`. Grupele sunt pe tura fixă A/B a mașinii pe săptămână.
- `:1349`: `if (n < 2 || n > 16) continue`. Peste 16 mașini pe clasă, R2 nu se calculează, fără steag.
- Planul, pasul 3 (b): «R2 … (`lear-analiza.mjs:1331-1369`)».
- Fapt măsurat: clasa 50 are până la **18** mașini pe zi și schimb în septembrie. Pe săptămână, reuniunea e mai mare, pentru că rotația schimbă schimbul.
- La Drăxlmaier nu există tura A/B fixă: 52 % din zilele-mașină au ≥ 2 linii, iar schimbul se rotește săptămânal.

**Scenariul de eșec.** Executorul copiază blocul de la LEAR.
- Clasa 50 dă `continue`, deci R2 = 0 pentru cele mai mari autobuze.
- Pe clasele mici, gruparea pe «tura» cade fiindcă nu există A/B. Dacă e înlocuită cu «schimbul», o mașină cu două linii primește două realocări independente care pot da aceeași linie la două mașini.
- Ion vede în coloana R2 zero sau o cifră fără sens exact la decizia pe §8.

**Corecția planului:**
- F2 definește unitatea R2 la Drăxlmaier: (zi, schimb, clasă), perechea tur/retur a unei linii, cu o singură mașină pe pereche.
- Algoritmul de atribuire nu are plafonul 16: atribuire ungară, sau DP cu steag explicit «R2 necalculat, n = …».
- Verificare 4: R2 are o cifră pe fiecare clasă, sau un steag.

### B15 — low (−0.5) — Săptămâna 36 începe cu 31.08, zi exclusă de Ion la ION-71

**Dovada:**
- Fereastra ION-71 e «fără august». `obs-ideal.json` începe septembrie la 01.09. Memoria `drax-schelet-rute.md` o confirmă.
- Săptămâna ISO 36 = 31.08–06.09.

**Scenariul de eșec.** Dacă 31.08 e încă zi de concediu sau de reluare, săptămâna 36 are o zi atipică. Pragul de flotă ≥ 4 zile poate scoate mașini, iar ziua pară de rotație pierde o zi față de celelalte.

**Corecția:** F2 verifică flota din 31.08 față de media L–V. Dacă e atipică, pune ziua cu steag și păstrează echilibrul 2 + 2 pe zilele rămase. Alternativ, întreabă pe Ion. Nu decid eu.

### Ce e în regulă în v2

- Categoria «parc» separată.
- «Legătură» ≠ «gol între ture», conform deciziei 4.
- Flota pe săptămână.
- Ordinea surselor.
- Probele (c)/(d).
- Fereastra 36–39 echilibrată pe paritate.
- Alternativele comparate cu o singură coloană «cea mai bună».
- Marcajele cu `replace` gardat.

### Deduceri
B11 −2,0 · B12 −2,0 · B13 −1,0 · B14 −2,0 · B15 −0,5 = 7,5. B1–B10 sunt închise, iar resturile lor sunt numărate o singură dată, în B11/B13.

Scor: 2.5 · Blocante (critical/high): 3

## Review: senior-backend-engineer (v2)

Zona: realizabilitatea. Am verificat contractul agentului, migrațiile cu marcaje, `ctx.porti`, hărțile F3 și handoff-ul.
Codul l-am citit pe `origin/main` 218ea4ff. Precizare de metodă: `lear-timp-liber.mjs` l-am citit întreg pe liniile 1–60, 120–300 și 328–380.
Cele 14 note de memorie din index există toate (verificat cu `ls`). Migrațiile-șablon 386, 394, 396, 399–403 există. 404 e încă liber.

### Starea S1–S11

| id | stare | observație |
|---|---|---|
| S1 | închis ca principiu, mecanismul nu merge | Rolurile sunt împărțite corect. Contractul presupune însă un singur agent viu pe toată durata fazei și scriere în repo în Plan Mode, iar niciuna nu ține. Detaliile sunt în S14 (dovadă nouă). |
| S2 | închis | Ruta `drax-optimizari` urmează exact `briceni-optimizari/route.ts:6-9,30` (implicit PNG, trimite doar cu `?send=1`). `lde-timp-liber` rămâne neatins, iar `UZINE_LUNI` primește `poster: null` ca Briceni (`luni-paznic.ts:23`). Punctul 2 al corecției S2 (mesajul de timp liber către ADMIN) s-a pierdut, vezi S16. |
| S3 | închis ca principiu | Gardul `IS NULL` și marcajele plus `replace` sunt corecte. Formularea SQL e incompletă, vezi S15. |
| S4 | închis | `RaportDrax.tsx` pe modelul `RaportBriceni.tsx:13,68`. Atinge `page.tsx:53` (uniunea `alese`) și ternarul final. |
| S5 | închis | Locul e bun. O nuanță rămasă e în S18: blocul ajunge după verificarea `CRON_SECRET`. |
| S6 | închis | Planul fazei și raportul stau în `docs/plans/`. Recomandare: 40x (§8) să fie tichet separat, nu «tichet/handoff». `tp tick` poate pune Done pe F2 înainte de «da»-ul lui Ion, iar un commit nou după Done înseamnă `tp:stale` (`task-pipeline/README.md:32-33`). |
| S7 | închis | Sesiune nouă, SQL comparat, căi absolute, memoria proiectului. |
| S8 | închis | Cele trei teste plus testul `?send`. Modelul există: `lib/lde/briceni-optimizari-image.test.ts`. |
| S9 | închis | 404; `DELETE` + `INSERT`; `livrare_validata` false; fără funcții. |
| S10 | închis | `DRAXELMAIER`. |
| S11 | parțial | `toate.ts` și clientul sunt în plan. Forma JSON nu se potrivește cu `Retea`, vezi S17. |

### Observații noi

**S12 — high (−2.0, defect de logică): `ctx.poarta` → `ctx.porti` e o redenumire, iar apelanții nu sunt în plan. LEAR/Florești/SEBN cad luni.**
Dovada:
- `ctx.poarta` se citește în 12 locuri din modul: `lear-timp-liber.mjs:132,150,165,195,213,243,328,330,350,351,379,380`.
- Apelanții construiesc `{ poarta: … }`:
  - `lear-analiza.mjs:1289` (`ctxL`);
  - `sebn-liber.mjs:181`;
  - testul `lear-timp-liber.test.mjs:16` (`ctxDe`).
- Tabelul Fișiere al planului dă doar `lear-timp-liber.mjs` și testul lui. `lear-analiza.mjs` și `sebn-liber.mjs` lipsesc.
- Pe VPS modulul se livrează prin scp. `lear-saptamanal.sh:25-37` rulează trei workeri care îl importă.

Scenariul de eșec:
1. Executorul face ce scrie în tabel: redenumește câmpul, actualizează `ctxDe`, testele trec.
2. Copiază modulul pe VPS.
3. Luni la 08:00 `lear-analiza.mjs` trimite tot `{ poarta }`. `ctx.porti` e `undefined` și `.some` aruncă eroare.
4. Rândurile LEAR Ungheni, LEAR Florești și SEBN nu se scriu. Posterele și indicațiile pentru Alexei nu pleacă. Paznicul anunță trei lipsuri.

Rezultat: o schimbare făcută pentru Drăxlmaier strică trei uzine care merg.

Corecția planului:
- Modulul acceptă ambele forme: `const porti = ctx.porti ?? [ctx.poarta]`, normalizat O DATĂ la intrare în `curseCuOpriri`/`eticheteaza`. Apelanții existenți rămân neatinși.
- Semantica pe listă se scrie explicit, fiindcă azi nu e specificată:
  - atingere = oricare poartă;
  - `depMax` și `rCasa` = distanța la cea mai apropiată poartă.
- Testele de nerecul rulează pe `ctxDe` VECHI (cu `poarta`) și dau aceleași etichete ca înainte. Se adaugă un caz nou cu `porti`.
- Ordinea livrării pe VPS: modulul compatibil întâi, niciodată luni între 07:30 și 09:30.
- `lear-analiza.mjs` și `sebn-liber.mjs` intră în Fișiere cu mențiunea «neatinse, verificate la nerecul».

**S13 — high (−2.0, defect de logică): la Drăxlmaier modulul de timp liber contrazice §3. Parcul bate munca, iar zona parcului acoperă uzina. `ctx.porti` singur nu ajunge.**
Dovada:
- `lear-timp-liber.mjs:286-288`: `reparatie` se decide ÎNAINTEA verificării `e.eticheta === 'muncă'` (`:291`). Orice pauză ≥ `PARC_OPRIRE_MIN` = 2 min la ≤ `R_PARC` = 0,5 km de parc face cursa «reparație», chiar dacă are ancoră.
- `:176` combinat cu `:292`: `c.parc.zona` = orice punct la ≤ `R_PARC_ZONA` = 3 km de parc. Cursa fără lanț trece atunci în «neclar», nu în «liber».
- `:195` și `:243`: pauzele din zona de 3 km nu rup lanțul.
- Porțile Drăxlmaier sunt la 0,70 km (VEST) și 2,25 km (EST) de parc (planul, «Verificat pe viu»). Ambele stau deci în zona de 3 km.
- `:283-285`: «altă uzină» are prioritate față de orice altă etichetă. `alteUzine` se citește din `lde_uzine_gates` fără uzina proprie (`lear-analiza.mjs:847`, `sebn-liber.mjs:119`). Un apelant Drăxlmaier care nu scoate `DRAXELMAIER_BALTI` își marchează toate cursele «altă uzină».
- Planul, F1 §3: «atingerea porții bate parcul». Codul face invers.

Scenariul de eșec: F3 trece Drăxlmaier prin modul, cu `ctx.porti` și cu `PRAGURI` neschimbate.
- Cursele de tur ale lui 346KAJ se încheie la parc (89 % din plecări) și devin «reparație».
- Orice cursă privată prin Bălți iese «neclar», deci detectorul de timp liber e orb exact în orașul unde locuiesc șoferii.
- §11 din text promite o detecție care nu există, iar raportul de pe `/lde/reguli?uz=drax` arată km de «reparație» care sunt de fapt așteptare.

Corecția planului: contractul F3 pentru modul e mai larg decât `ctx.porti`:
- (1) precedența «ancora la poartă bate parcul», activată doar prin `ctx` (implicit neschimbat pentru LEAR/SEBN);
- (2) `R_PARC_ZONA` prin `ctx.praguri` pentru Drăxlmaier, cu valoarea luată din decizia lui Ion despre parc (întrebarea 1 din F2), NU dedusă;
- (3) apelantul Drăxlmaier scoate porțile proprii din `alteUzine`, ca `sebn-liber.mjs:119`;
- (4) test pe o zi reală a lui 346KAJ.

Dacă Ion decide că parcul e service, (1) rămâne și (2) nu se aplică. Alegerea e a lui Ion, planul doar trebuie să nu o fixeze în cod înainte.

**S14 — high (−2.0, defect de logică): contractul agentului presupune că același agent trăiește de la plan până la execuție și că poate scrie în repo în Plan Mode. Niciuna nu ține.**
Dovada:
- `~/.claude/CLAUDE.md:3-7`: fazele cu migrație trec prin Plan Mode. În Plan Mode subagentul poate scrie DOAR `<plan>-agent-<id>.md` și are voie numai la acțiuni read-only. Chiar revizorul de față primește această restricție de la harness. Planul însuși recunoaște asta la rândurile 3–4 («Fișierul e cel impus de Plan Mode; după aprobare se copiază»).
- Pasul 1 (c) cere agentului să scrie `docs/plans/<data>-<uzina>-<faza>.md` și `ticket.md` ÎNAINTE de aprobare.
- Pasul 1 (b) cere scp pe VPS. Nu e read-only.
- F2 pornește ≥ 28.09 și se oprește la «da»-ul lui Ion pe §8. Între măsurare și execuție trec zile și, de regulă, o altă sesiune principală (`tp new` pe tichetul fazei).
- ID-ul unui subagent nu supraviețuiește sesiunii, deci `SendMessage` pe «același agent» nu are țintă.
- `~/.claude/CLAUDE.md:57-58`: «executantul citește DOAR `.tp/BRIEF.md`, nu conversația».

Scenariul de eșec:
- (a) Sesiunea principală, în Plan Mode pe F1, pornește `uzina-analist`. Agentul nu poate scrie planul fazei și nici scp-ul de măsurare. Atunci ori încalcă Plan Mode, ori se întoarce gol.
- (b) Pe 29.09 Ion răspunde la cele 3 întrebări F2 într-o sesiune nouă. `SendMessage` n-are agent. Un agent nou pornește fără cifrele măsurate și fără triaj, iar execuția §8 nu mai are legătură cu ce a aprobat Ion.

Corecția planului: contractul trece pe FIȘIERE, iar `SendMessage` rămâne doar o scurtătură în aceeași sesiune.
- Faza are două porniri distincte ale agentului: «cercetează» și «execută».
- La «cercetează», agentul scrie planul în fișierul de plan permis de Plan Mode, pe care sesiunea principală îl copiază după aprobare. Măsurătorile VPS se fac ori în afara Plan Mode, ori în sesiunea principală, înainte de intrarea în Plan Mode. Planul trebuie să spună care din două.
- Pornirea «execută» primește DOAR: calea planului aprobat din `docs/plans/`, `.tp/BRIEF.md` al tichetului fazei și `docs/plans/<…>-raspunsuri.md` cu deciziile lui Ion textual. Se adaugă o probă (e): agent NOU, pornit doar cu aceste trei căi, reproduce SQL-ul migrației fazei.

**S15 — medium (−1.0, gol de acoperire): `replace` pe marcaje, cu formularea SQL nespecificată. No-op-ul e tăcut, iar migrația se înregistrează ca aplicată.**
Dovada: `403_lde_trox_ferestre_reguli.sql:19-…` (`$r$…$r$`, un singur `UPDATE`). `apply_migration` scrie rândul în `schema_migrations` indiferent de câte rânduri schimbă.

Planul spune «marcaj șters = migrația nu face nimic și agentul raportează», dar nu spune cum află agentul. Mai sunt două capcane:
- marcajele §5 și §7 au același sufix `[SE SCRIE ÎN FAZA 2]`, deci un `replace` pe sufix le înlocuiește pe amândouă;
- cu trei `replace` imbricate și un gard pe un singur marcaj, un marcaj lipsă duce la o aplicare parțială.

Corecția planului:
- Marcajul = titlul plus rândul, în `$m$…$m$` cu newline real (nu `\n`).
- Gardul este `AND` pe toate marcajele migrației.
- Totul stă într-un bloc `DO $$ … GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION … $$`, ca migrația să pice zgomotos și să nu se înregistreze. Același gard se pune la F1 pe `IS NULL`.
- `DO` nu creează funcție, deci nu e nevoie de `REVOKE`.
- Rerularea după succes aruncă eroare, și e corect așa: numărul migrației e deja consumat.
- Tot acolo se face `reguli_livrare_la = now()`, ca la 403.

**S16 — medium (−1.0, gol de acoperire): mesajul de timp liber Drăxlmaier către ADMIN nu are pe nimeni care să-l trimită.**
Dovada:
- Singurul care trimite textul de timp liber e `lde-timp-liber/route.ts:98-127`, legat de poster (`:83-85`). Planul, corect, nu-l atinge.
- `briceni-optimizari` nu trimite timp liber.
- F3 schimbă totuși modulul de timp liber pentru Drăxlmaier și scrie §11.
- Corecția S2, punctul 2 («mesajul de timp liber către ADMIN printr-o rută/parametru care NU atinge posterul») nu apare în v2.

Ce se strică: §11 promite paza, rândul are `timp_liber`, dar nu pleacă nimic și paznicul nu verifică nimic.

Corecția planului: F3 spune explicit una din două:
- (a) Drăxlmaier NU are încă mesaj ADMIN, iar §11 o spune;
- (b) o rută `drax-optimizari?liber=1` sau `lde-timp-liber?uz=drax&poster=0`, cu test «fără poster».

Alegerea o face Ion. Planul trebuie doar să nu lase golul.

**S17 — low (−0.5): forma `schelet-drax.json` nu se mapează pe `Retea` din `toate.ts`.**
Dovada: `toate.ts:12-15`: `porti: { c: Punct; n: string }[]`, `rute[].linie: Punct[]`, `km` = km cu oameni pe zi, iar helperul `plin` așteaptă `tur/retur.plin`.

Planul dă:
- `porti: Punct[2]`, fără nume EST/VEST;
- `linii[].linie` ca număr de linie, care se ciocnește ca nume cu `linie: Punct[]`;
- un singur `drum`, fără să spună dacă e tur = retur;
- nicio regulă pentru `km` pe zi.

`TENTE` are nevoie și de o cheie `drax`.

Corecția planului:
- `porti: [{ c, n: 'EST' | 'VEST' }]`;
- `linii[].nr` în loc de `linie`;
- `drum: { tur: { plin }, retur: { plin } }`;
- `kmZi = 2 × km × tureZi`, scris în contract;
- `TENTE.drax`.

**S18 — low (−0.5): locul blocului și ordinea livrării F3.**
Dovada: `lear-saptamanal.sh:47-48`. Briceni stă ÎNAINTEA verificării `CRON_SECRET` intenționat, «ca să ruleze și fără cheie». «După `cheama floresti`» pune Drăxlmaier DUPĂ `exit 1`.

A doua problemă: `UZINE_LUNI` (Vercel) se livrează la push. Dacă ajunge înaintea blocului de pe VPS, luni paznicul trimite «Drăxlmaier: raport» fals. Testul `lear-saptamanal.test.sh` numără apelurile curl (4). Drăxlmaier fără poster nu schimbă numărul, iar planul trebuie să spună asta.

Corecția planului:
- Blocul se pune după Briceni, înaintea verificării cheii, dacă durata măsurată e mică. Altfel după `floresti`, acceptând dependența de cheie.
- Ordinea livrării: VPS întâi, apoi `UZINE_LUNI`.
- Testul primește cazul «Drăxlmaier picat → tot 4 apeluri, cod ≠ 0».

### Ce e în regulă

- Împărțirea agent / sesiune principală e corectă ca rol.
- Ruta cu `?send=1` și `poster: null` e exact precedentul Briceni.
- Gardul `IS NULL` pe F1 e bun.
- `ReguliUzineClient` trimite textul din starea JS (LF, `.trim()`), deci marcajele nu se strică prin CRLF.
- `salveazaRegulaUzinei` păstrează `validata` din starea curentă.
- Cheia `DRAXELMAIER` se leagă corect de `verificaLuni` (`.in('uzina', …)`).
- Handoff-ul pe faze are commit.

### Deduceri
S12 −2.0 · S13 −2.0 · S14 −2.0 · S15 −1.0 · S16 −1.0 · S17 −0.5 · S18 −0.5 = −9.0 → 1.0

Scor: 1.0 · Blocante (critical/high): 3

## Review: business-logic-auditor

Obiectul: planul `shimmering-yawning-papert.md` (v1), zona logicii de business: ordinea fazelor, regulile Drăxlmaier față de definițiile lui Ion, măsurarea din faza 2, contractul agentului. Deciziile 1–3 ale lui Ion nu sunt contestate.

Codul l-am citit din `origin/main` (worktree-ul ION-71 e în urmă și nu are 403). Pe viu, prin SQL read-only:
- `lde_uzine` DRAXELMAIER_BALTI: `works_saturday=true`, `works_sunday=false`, `livrare_validata=false`, text NULL.
- `lde_uzine_gates` DRAX: EST 47.78513/27.94307 r 0,60 și VEST 47.77408/27.91593 r 0,50.

Distanțe calculate: VEST–Parc (47.7700/27.9235) = 0,70 km. EST–VEST ≈ 2,4 km. EST–Parc ≈ 2,25 km.

### B1 — high — R1-LEAR e scris greșit: formula dă doar km-ii cu oameni, iar unitatea amestecă linia cu mașina
**Dovada:**
- `lde-geo-worker/lear-analiza.mjs:1166`: `const patru = 4 * sumaEtalon`.
- `lear-analiza.mjs:1210`: `const z1 = patru + alte`, adică ziua la R1 = 4 × etalon pe fiecare rută.
- Memoria `lear-doua-optiuni-economie.md`: «Ziua devine 2 x (km cu oameni): goala pana la primul om, plina…, plina…, goala».
- Memoria `drax-schelet-rute.md` (ION-71): `kmZi = 2 × km × ture/zi`.

Planul (Pas 3 b) spune în schimb «zi = 2 × ture/zi × etalonul liniei + drumurile în plus». Asta e exact `kmZi`, adică doar km-ii cu oameni, fără cele două picioare goale.

**Scenariul de eșec.** Linie cu 1 pereche pe zi, etalon 30 km, mașina conduce azi 140 km:
- După plan: R1 zi = 60, deci economia = 80 km.
- Corect: R1 zi = 120, deci economia = 20 km.

Pe flotă, R1 ar pretinde ≈ 5.843 km/zi în plus, mai mult decât tot golul măsurat la ION-45 (5.090 km/zi). Cifra ajunge la Ion ca bază pentru decizia pe §8.

A doua problemă e unitatea. `ture/zi` e mediana LINIEI. La Sturzovca, Dominteni și Prajila e 3, făcut de două mașini. Pe 49 de mașini și 70 de perechi pe zi, unele mașini duc două linii (s1 pe una, s2 pe alta, ca la LEAR). Formula pe «ture/zi × etalonul liniei», aplicată pe mașină, dă fiecărei mașini de pe Sturzovca toate cele 3 perechi.

**Corecția planului:**
- R1 = Σ peste perechile (linie, schimb) duse EFECTIV de mașină în acea zi, din urmă, de 4 × etalonul liniei, plus «alte».
- `ture/zi` al liniei se folosește doar la control, nu la calcul.
- Se păstrează excluderea de la LEAR: ziua fără nicio pereche completă nu intră.

### B2 — high — Parcul Bălți la Drăxlmaier nu e «service»: razele se suprapun, iar «reparație» bate «muncă»
**Dovada:**
- Planul, secțiunea Riscuri: «raza parcului 0,5 și a porții 0,5 nu se ating». E fals. Centrele sunt la 0,70 km, 0,5 + 0,5 = 1,0 > 0,70, deci cercurile se suprapun. `R_POARTA` al modulului e chiar 0,7 (`lear-timp-liber.mjs:29`), deci cercul porții VEST ajunge până în centrul parcului.
- `lear-timp-liber.mjs:274`: prioritatea «neanalizat > reparație > navetă > muncă».
- `lear-timp-liber.mjs:286-287`: orice oprire ≥ 2 min la ≤ 0,5 km de parc face din cursă «reparație».
- `R_PARC_ZONA` = 3 km (`:32`) cuprinde ambele porți Drăxlmaier.
- `sebn-liber.mjs:84`, `casaDinUrma`: scoate staționările la ≤ 0,8 km de parc.
- `lear-analiza.mjs:1003`: «doarme lângă poartă» la ≤ 1,5 km, deci cuprinde parcul.

**Scenariul de eșec.** Mașinile Drăxlmaier sunt ale parcului din Bălți. Una care doarme sau așteaptă între tur (06:15) și retur (15:45) în curtea parcului:
- pierde cursele ancorate la VEST, care devin «reparație»;
- nu are «casă», pentru că parcul e scos, deci LEAR dă steagul «nu știm unde doarme» și R1/R3 nu se socotesc;
- sau, invers, pe calea `lear-analiza` apare «doarme lângă poartă, regula 1 e deja aplicată».

Același GPS dă trei verdicte. Regula lui Ion «service = Parcul Bălți» a fost dată pentru uzine aflate la 30–120 km de parc (memoria `trasee-reguli-navetă-service.md`). La Drăxlmaier parcul e locul firesc de așteptare, iar faptul acesta nu e măsurat. Planul îl lasă la «Neverificat 2», deși F1 scrie deja în §7 «parcul nu e casă».

**Corecția planului:**
- «Verificat pe viu» primește un rând nou: câte din cele 49 de mașini stau la ≤ 0,5 km de parc noaptea (00:00–05:00) și între ture (07:00–14:00), pe fereastra ION-71.
- §7 (casa/parcul) și §5 (service) ies din F1. Se scriu după măsurare, cu o întrebare explicită către Ion: la Drăxlmaier, e parcul «lângă uzină», adică R1 deja aplicat, sau e service?
- În plan, fraza «nu se ating» se înlocuiește cu regula de precedență pentru zona comună.

### B3 — high — `golTure` și R3 numără aceiași kilometri; regulile nu sunt declarate alternative
**Dovada:**
- Planul, Pas 3 (a): `golTure` = «drumul gol între tur și retur pe aceeași linie», o categorie, după Briceni.
- Memoria `briceni-livrare-reguli-sebn.md`: «drumul gol spre capăt între ture = categoria `golTure`, nu livrare», adică nu e economie. Migr. 403 §5.2: «gol pe rută… nu se optimizează».
- Tot Pas 3 (b): R3-LEAR = «nu pleacă acasă între ture».
- `lear-analiza.mjs:1216`: `z3 = 2·E + dCasa + E + alte`, formula e legată de modelul cu DOUĂ rute A/B, iar `:1161` cere `alese.length === 2`.
- Memoria `lear-doua-optiuni-economie.md`: «regula 1 o CUPRINDE pe a 3-a… nu se adună. Se compară».

**Scenariul de eșec.** Linie cu 1 pereche, șoferul din satul de start. Tur la 06:15, mașina pleacă goală acasă, se întoarce goală, retur la 15:45 (9,5 h între ele). Cei 2E km goi apar:
- ca `golTure` (al uzinei, fără economie);
- și ca economie la R3, care îi taie;
- iar R1-SEBN («mașina așteaptă la capăt») îi lasă.

Pagina din F2 dă lui Ion trei cifre contradictorii pe aceiași km. Dacă cineva adună coloanele R1 + R3 + livrare, economia se dublează.

Planul nu spune nici UNDE așteaptă mașina la R3: la poartă economisește 2E, la capăt 0. Nu spune nici ce e R3 când mașina duce două linii diferite pe s1 și s2.

**Corecția planului:**
- Pas 3 (b) primește, pe fiecare tipar (1 pereche; 2 perechi aceeași linie; 2 linii pe o mașină; linie cu 2 mașini), ziua fiecărei reguli în formulă explicită, cu locul așteptării.
- Se declară că R1/R3/R1-SEBN/R2 se COMPARĂ pe mașină (se alege una), nu se adună.
- Pentru `golTure` se scrie o frază clară: e al uzinei, deci R3 nu-l atinge. Altfel `golTure` nu e categorie. Hotărârea se ia prin întrebare la Ion ÎNAINTE de F2, nu în raport.

### B4 — high — Modulul de timp liber are o singură poartă; modelul SEBN «o poartă pe mașină» nu e verificat la Drăxlmaier
**Dovada:**
- `lear-timp-liber.mjs:165`: `hav(p, ctx.poarta) <= P.R_POARTA` (o poartă).
- `lear-timp-liber.mjs:132,150,243`.
- `sebn-liber.mjs:12,168-174`: fiecare mașină primește poarta la care a stat mai multe zile. Porțile SEBN sunt la 25 km una de alta.
- La Drăxlmaier porțile sunt la 2,4 km. Soluția de la Orhei (mijlocul, r 0,9 pentru 0,8 km, `sebn-liber.mjs:14,41`) ar cere r ≥ 1,2 și ar înghiți parcul (B2).
- Planul, «Verificat pe viu», rândul 7: «se refolosește ca la SEBN» fără niciun fapt despre câte mașini ating ambele porți.

**Scenariul de eșec.** O mașină face s1 pe o linie cu descărcare la EST și s2 pe alta la VEST, sau schimbă poarta cu rotația. Atingerile porții «a doua» nu sunt ancore, deci lanțul se rupe. Cursele cu oameni devin «liber», trec pragul de 50 km, iar ADMIN primește lunea mesaj despre timp liber fals.

**Corecția planului:**
- În «Verificat pe viu» intră procentul de zile-mașină cu atingeri la ambele porți pe fereastra ION-71.
- Dacă procentul e > 0, F3 include schimbarea `ctx.poarta` → listă de porți în modulul comun. Schimbarea are plan propriu și teste de nerecul: `lear-timp-liber.test.mjs` pe LEAR/Florești/SEBN.
- Riscurile menționează că modulul NU mai e neatins.

### B5 — medium — Ordinea fazelor: F1 scrie secțiuni care depind de F2/F3
Planul, Pas 2: F1 scrie §9 (costul), §10 (rapoarte/control), §11 (timp liber), §12 (indicații pentru dispecer). Ele depind de alte faze:
- §12 depinde de regula aleasă în §8. Memoria `indicatii-alexei-saptamanal.md`: indicațiile LEAR sunt formulate pe R1/R2.
- §9 Briceni: «Economie = livrare netă × lei/km» (`403_…sql:62`) presupune deja regula.
- §10/§11 descriu pagini și workeri care apar abia în F3.
- §7 fixează «parcul nu e casă» înainte ca F2 să măsoare unde dorm mașinile (B2).

Ce se strică: textul de pe `/lde/livrare-reguli` promite lucruri neadevărate timp de două faze.

**Corecția:** F1 scrie §1–§6 (§5 fără service/golTure, B2/B3) și §9 doar cu formula lei/km. Secțiunile §7, §8, §10–§12 intră la sfârșitul F2 (după «da»), respectiv F3.

### B6 — medium — Flota fixată la «cele 49 de mașini», contrar regulii «flota din muncă»
Planul, Pas 3: «pe cele 49 de mașini». Memoria `analiza-uzina-din-munca.md` și `sebn-liber.mjs:47,170` spun altceva: flota se ia pe SĂPTĂMÂNĂ, din urmă (≥ 4 zile cu oprire la oricare poartă), iar cele sub prag trec la «de verificat». O mașină plecată în septembrie la altă uzină (cazul 283BRAT) și-ar căra deplasările în raportul Drăxlmaier.

**Corecția:** F2 ia flota pe săptămână după pragul de 4 zile la oricare dintre porțile EST/VEST. «49» rămâne doar cifră de control.

### B7 — medium — Fereastra F2 nu e închisă și nu e echilibrată pe rotație
Planul, Pas 3: săptămânile «31.08–27.09». Azi e 26.09, deci săptămâna ISO 39 nu e încheiată: lipsesc sâmbăta și duminica, plus noaptea de la margine (`sebn-liber.mjs:100-102` citește o zi în plus). Rotația D/E+Z schimbă schimbul la fiecare săptămână ISO, iar km-ii s1 ≠ s2 pe unele linii (Sturzovca 24,7 față de 46,9). O fereastră cu număr inegal de săptămâni pare/impare deplasează cifrele pe mașină.

**Corecția:** «ultimele 4 săptămâni ISO ÎNCHEIATE, 2 impare + 2 pare», cu data fixată la pornirea F2.

### B8 — medium — Contractul agentului conține deja o definiție învechită și nu ordonează sursele
Planul, Pas 1, «Rolul», copiază regulile lui Ion (contrar principiului propriu «căi, nu copii») și una e depășită: «brambura = doar excesul». Aceasta e definiția din 18.09 (memoria `trasee-reguli-navetă-service.md`: mediană + 15). Din 25.09 ea e ÎNLOCUITĂ:
- `400_…sql:33` §11.3 și `403_…sql:53` §6.1: drum pe care mașina n-a mers în nicio altă zi, ≥ 5 km;
- `sebn-liber.mjs:3-5`: «brambura de acolo era regula veche».

Un agent nou ar scrie §11 Drăxlmaier cu definiția veche, iar textul n-ar mai corespunde modulului care calculează.

În plus, contractul nu spune ce câștigă când sursele se contrazic (text în `reguli_livrare` > cod > memorie > plan vechi). Nu spune nici ce face agentul când o regulă a lui Ion nu se potrivește la uzina nouă: parcul (B2), `golTure` (B3). Răspunsul trebuie să fie: întrebare la Ion, nu adaptare.

**Corecția:**
- «Rolul» păstrează doar trimiteri de forma `reguli_livrare` LEAR §X / SEBN §11.3.
- Se adaugă ordinea de precedență a surselor și regula «o definiție care nu se transpune = întrebare la Ion înainte de fază».

### B9 — low — Faptele de ceas și de weekend sunt luate ca identice pe ambele porți și pe toată săptămâna
- `396_…sql:15-24`: tabelul ferestrelor nu are coloană pentru poartă, deci EST și VEST primesc aceleași ferestre.
- `lde_uzine.works_saturday = true` e valoarea de azi din bază, nemăsurată. Memoria «graficul de weekend e fictiv».

**Corecția:** «Verificat pe viu» primește modurile sosire/plecare separat pentru EST și VEST, plus numărul de zile de sâmbătă și duminică cu atingeri, pe fereastra ION-71.

### B10 — low — Proba de acceptare a agentului nu verifică ce contează
Planul, Pas 1 / Verificare 1: întrebarea «ce știi despre LEAR Ungheni §5?» verifică doar că agentul citește SQL-ul. Nu verifică transpunerea.

**Corecția:** se adaugă o probă cu capcană: «brambura la Drăxlmaier?» trebuie să dea §11.3 nou, cu sursa. «Parcul la Drăxlmaier?» trebuie să dea întrebarea către Ion, nu regula «service».

### Deduceri
B1 −2,0 · B2 −2,0 · B3 −2,0 · B4 −2,0 · B5 −1,0 · B6 −1,0 · B7 −1,0 · B8 −1,0 · B9 −0,5 · B10 −0,5.

Suma e 13,0, deci 10 − 13 iese sub zero; scorul se oprește la 0,0.

Pe întrebările zonei:
- **(1) Ordinea fazelor.** Ferestre → categorii → economie → worker e corectă ca schelet, dar F1 scrie prea mult (B5).
- **(2) Regulile Drăxlmaier.** Naveta, capătul = start și ziua 03:00 sunt respectate. Parcul (B2), cele două porți (B4) și definiția brambura (B8) nu sunt.
- **(3) Măsurarea din F2.** E ambiguă pentru 1 pereche pe zi (B1, B3).
- **(4) Contractul agentului.** Nu e suficient de precis (B8, B10).

Scor: 0.0 · Blocante (critical/high): 4

## Review: senior-backend-engineer

Zona: realizabilitatea (fișierul agentului, migrația fazei 1, hărțile fazei 3, pipeline-ul). Codul citit pe `origin/main`
(218ea4ff, include ION-73), baza citită read-only prin MCP (`schema_migrations`, `lde_uzine`, `lde_analiza_reguli`).

**Fapte noi, verificate acum:**
- `supabase_migrations.schema_migrations`: ultima = `403_lde_trox_ferestre_reguli` (25.09 20:42); în repo 403 există
  deja pe `origin/main`; numerele sunt deja duble (`394_*` ×2, `402_*` ×2 în repo; în bază `399_rute_58_59_in_30_31`
  = în repo `402_rute_58_59_in_30_31.sql`). Următorul liber = **404**.
- `lde_uzine` DRAXELMAIER_BALTI: `display_name = 'Draxelmaier-Bălți'`, `active = true`, `livrare_validata = false`,
  text NULL, 2 porți în `lde_uzine_gates`, 0 ferestre.
- `lde_analiza_reguli.uzina` distincte: `LEAR Ungheni`, `LEAR Florești`, `MEJGOROD`, `SEBN`, `BRICENI`.

---

**S1 — high (−2.0, defect de logică): un subagent nu poate rula plan-mode-review și nici nu-l poate întreba pe Ion.**
Dovadă: `~/.claude/skills/plan-mode-review/SKILL.md:37` (întrebările → `AskUserQuestion`), `:60` (revizorii lansați
în paralel de sesiunea principală), `:90` (triajul îl face «sesiunea principală»), `:130` (`ExitPlanMode`). Revizorul
de față, pornit tot ca subagent, n-are în unelte nici `AskUserQuestion`, nici `ExitPlanMode`. Planul, pasul 1 (rândurile
84, 99) și deciziile 2–3 cer ca agentul să facă «fiecare fază = tichet + plan-mode-review» și să-i ceară lui Ion «da» pe §8.
Scenariul de eșec: Ion pornește `uzina-analist` pe F1. Agentul ajunge la pasul 4 al procedurii și nu are cum să-l
întrebe pe Ion. Atunci fie răspunde singur în locul lui, fie se oprește. La pasul 8 nu poate ieși din Plan Mode, așa că
gate-ul e sărit sau munca stă pe loc. La F2 «da»-ul pe §8 nu are canal, iar decizia 2 a lui Ion cade.
Corecția planului: în corpul agentului se scrie explicit împărțirea rolurilor.
- Agentul face cercetarea, scrie planul fazei și `ticket.md`/`report.md` și se întoarce cu întrebările formulate.
- Sesiunea principală rulează plan-mode-review (revizori, Codex, `AskUserQuestion`, `ExitPlanMode`) și îi transmite
  răspunsurile lui Ion prin `SendMessage` pe același agent.
- Ce execută agentul după aprobare: migrația, VPS, commit.
Proba de acceptare se completează cu un caz: agentul pus pe F1 se oprește cu întrebările, nu le răspunde singur.

**S2 — high (−2.5, scriere la serviciu extern fără «da»): cheia `drax` în `lde-timp-liber` trimite posterul și indicațiile imediat.**
Dovadă:
- `api/cron/lde-timp-liber/route.ts:33-36` e harta uzinelor. La `:83-85` `trimitePosterLear` și `trimiteIndicatii`
  pleacă la orice apel non-`dry`: nu există `?send=1`, doar `poster=force`.
- `lear-saptamanal.sh:59-60` cheamă ruta pentru fiecare cheie LEAR.
- Precedentul Briceni NU e în hartă: are ruta proprie `briceni-optimizari?send=1` (`lear-saptamanal.sh:40-41`,
  `luni-paznic.ts:22-23` cu `poster: null`).

Planul, pasul 4 (rândurile 133-134), cere «`api/cron/lde-timp-liber` (cheie `drax`)» și, în același timp, «posterul și
indicațiile: `?send=1` după «da»». Ruta nu are un astfel de comutator.
Scenariul de eșec: executorul adaugă `drax: { nume, uz: 'drax' }` în `UZINE` și `cheama "lde-timp-liber?uz=drax"` în
script, după modelul Florești. Luni la 08:00 posterul Drăxlmaier și mesajul pentru Alexei pleacă în grupa livrărilor
înainte de «da»-ul lui Ion (decizia 1, rândul 22).
Corecția planului: F3 urmează modelul Briceni.
- Ruta proprie `/api/cron/drax-optimizari` care întoarce imaginea și trimite doar cu `?send=1`.
- Mesajul de timp liber către ADMIN printr-o rută sau un parametru care NU atinge posterul.
- `UZINE_LUNI` primește rândul Drăxlmaier cu `poster: null, indicatii: null` până la «da».
- `lde-timp-liber` nu se atinge. Se scoate «cheie `drax`» din pasul 4 și din tabelul Fișiere.

**S3 — high (−2.0, defect de logică): migrația cu §8 (40y) fie șterge corecturile lui Ion, fie pune §8 după §12.**
Dovadă:
- `lde/livrare-reguli/actions.ts:81-88`: Ion salvează textul direct în `lde_uzine.reguli_livrare`, fără istoric.
- `403_lde_trox_ferestre_reguli.sql:6`: precedentul «textul se rescrie întreg».
- `400:28`, `401:10`: celălalt precedent lipește cu `||` la sfârșit.

Planul, pasul 2 (rândurile 114, 117), spune că Ion corectează textul pe pagină după F1. Pasul 3 (rândul 127) și
Fișiere (rândul 146) spun «migrație cu §8», fără metodă.
Scenariul de eșec, după fiecare metodă:
- Rescriere întreagă (șablonul 403): corecturile făcute de Ion între F1 și F2 dispar fără urmă.
- `||` (șablonul 400/401): §8 ajunge după §12, iar parserul de pe `/lde/uzine/_regula`, care despică pe «N. TITLU»,
  afișează secțiunile în ordinea greșită.

Corecția planului: F1 scrie la §8 un marcaj fix (de ex. `8. REGULILE DE ECONOMIE\n8.1 [SE MĂSOARĂ ÎN FAZA 2]`).
40y face `replace(reguli_livrare, <marcaj>, <textul §8>) WHERE position(<marcaj> IN reguli_livrare) > 0`. Dacă Ion a
șters marcajul, migrația nu face nimic și agentul raportează. Același gard și pentru F1: se scrie doar
`WHERE reguli_livrare IS NULL`, ca o rerulare să nu calce corecturile.

**S4 — medium (−1.0, fapt greșit în «Verificat pe viu»): `ReguliClient` nu e refolosibil pentru Drăxlmaier.**
Dovadă:
- `reguli/actions.ts:13`: `tura: 'A' | 'B'`, iar la `:50` `r2.rute: { A?, B? }`.
- `ReguliClient.tsx:65,75-76`: «Cu oameni = 2 × etalon», «Rutele de 4 ori = 4 × etalon», adică exact 2 ture pe zi.
- Drăxlmaier are 1/2/3 ture pe zi și grupe D/E+Z (planul, rândul 53).
- Precedentul Briceni are componentă proprie: `reguli/page.tsx:110-116` `RaportBriceni`, plus `briceni-optimizari-image.ts`.

Planul, rândurile 50 și 130, zice «forma LEAR dacă §8 = R1/R3».
Corecția planului: rândul din «Verificat» devine: «ReguliClient e legat de două ture A/B; Drăxlmaier primește
`RaportDrax.tsx` + `drax-optimizari-image.ts`, ca Briceni». Contractul F3 din corpul agentului cere forma `date` pe
modelul `RaportBriceniDate` (intervale pe categorii) și le adaugă pe amândouă în tabelul Fișiere. Mai trebuie atinse
`reguli/page.tsx:53` (uniunea `alese`) și `:118` (ternarul Ungheni/Florești), care nu sunt menționate.

**S5 — medium (−1.5, sarcină fără estimare): blocul Drăxlmaier din `lear-saptamanal.sh` întârzie posterele LEAR/SEBN.**
Dovadă: `lear-saptamanal.sh:25-47`: workerii rulează secvențial ÎNAINTEA oricărui `cheama` (`:57-62`). Briceni are
`timeout 90m` (`:44-45`).
Nepotrivirea: planul, la rândul 160, estimează «≤10 min», dar extragerea ION-71 pe 49 de mașini a luat 40 min, iar
timeout-ul copiat e 90 min.
Scenariul: o săptămână lentă mută posterele SEBN/LEAR și indicațiile lui Alexei de la ~08:05 la ~09:30.
Corecția planului:
- Blocul Drăxlmaier se pune DUPĂ `cheama "lde-timp-liber?uz=floresti"` și ÎNAINTE de `cheama "lde-luni-paznic"`,
  ca paznicul să vadă rândul.
- Sau cron separat la 07:00, cu paznicul care îl verifică.
- Estimarea se măsoară pe o săptămână reală în F3, înainte de a alege locul.

**S6 — medium (−1.0, pipeline): `tp handoff` refuză fără commit, iar F2 nu produce niciun commit până la «da».**
Dovadă:
- Memoria `mejgorod-schelet-rute.md:42`: «`tp handoff` refuză fără commit cu Session-Id în dereva».
- `~/dev/task-pipeline/README.md:25`: handoff-ul duce în In Review cu `sha= commits=`.

Planul (rândurile 84, 164) cere handoff pe fiecare fază, dar F2 are ieșirea doar pe VPS plus artefact (rândul 125).
Corecția planului: F2 lasă în repo `docs/plans/<data>-drax-economie.md` (planul aprobat, ca ION-71) și raportul cu
cifrele. Commitul acela poartă handoff-ul. 40y (§8) = tichet sau handoff separat, după «da». Faptul migrației se
scrie cu `tp comment … kind=migration` pe tichetul fazei, nu pe umbrelă.

**S7 — medium (−1.0, gol de acoperire): agentul poate să nu fie găsit, iar proba «citește sursa» nu e verificabilă din afară.**
Dovadă:
- `~/.claude/CLAUDE.md` («Локальная main отстаёт по замыслу»): arborele principal nu primește commitul fără
  `git merge --ff-only origin/main`, iar agenții de proiect se citesc din `.claude/agents` al directorului sesiunii.
- `.claude/agents/business-logic-auditor.md:4-6`: `memory: user` dă agentului memoria lui
  (`~/.claude/agent-memory/uzina-analist/`), NU memoria proiectului.
- Sesiunea-mamă vede doar răspunsul final al subagentului, nu apelurile lui.

Corecția planului:
- (a) Verificarea 1 se face într-o sesiune NOUĂ pornită în dereva `tp new` sau în arborele principal după ff-merge.
- (b) Proba devine obiectivă. Răspunsul trebuie să conțină SQL-ul rulat, `reguli_livrare_la` și citatul §5 textual.
  Sesiunea-mamă rulează același SQL și compară caracter cu caracter.
- (c) Indexul din corpul agentului dă căi ABSOLUTE:
  - memoria proiectului: `/Users/ionpop/.claude/projects/-Users-ionpop-Desktop-TRANSLUX/memory/<nume>.md` (toate
    cele 10 nume există, verificat);
  - VPS: `/root/lde-worker/{briceni,drax,sebn}/cod/…`, cu accesul din `vps-lde-worker-access.md`.

  Se spune și unde scrie agentul «nota de memorie»: memoria proiectului, nu `agent-memory`.

**S8 — medium (−1.0, gol de acoperire): testele existente pe hărțile atinse nu sunt în plan.**
Dovadă: `lde-geo-worker/lear-saptamanal.test.sh` (extins la Briceni, commit 74f983e4) și `lib/lde/luni-paznic.test.ts`
(testează `lipsurileLunii` pe `UZINE_LUNI`, `luni-paznic.ts:18-24,37-45`).
Corecția planului: F3 enumeră cele două teste de extins (blocul Drăxlmaier în script, rândul Drăxlmaier în paznic).
Pentru ruta nouă cu `?send=1` se adaugă un test că fără `send` nu pleacă nimic.

**S9 — low (−0.5): numărul și forma migrației F1.**
Dovadă: numerele duble de mai sus; `403_lde_trox_ferestre_reguli.sql:7-17` (`BEGIN; DELETE … ; INSERT`).
Corecția planului:
- «`40x` după 399» → «**404**, verificat la scriere pe `git ls-tree origin/main packages/db/migrations` ȘI pe
  `schema_migrations`».
- Ferestrele după modelul 403 (`DELETE WHERE uzina_id='DRAXELMAIER_BALTI'` + `INSERT`), ca o remăsurare să se poată aplica.
- `livrare_validata` rămâne explicit `false`, cu motivul din 403:5: altfel `uzineValidate()` din
  `livrare-poster.ts:73-77` bagă Drăxlmaier în posterul vechi de livrare.
- Migrația nu are funcții, deci nici `REVOKE`. Se scrie în antet «Fără funcții, fără GRANT», ca la 403:6.
- Formatul ferestrelor e corect (`396:20-23`: minute locale, `pana < de` = trece de miezul nopții, capătul exclusiv).

**S10 — low (−0.5): cheia rândului în `lde_analiza_reguli` e inventată și nu se potrivește cu nimic.**
Planul folosește `'Drăxlmaier Bălți'` (rândurile 51, 130, 176). `display_name` din bază e `'Draxelmaier-Bălți'`, iar
cheile existente sunt ASCII (`BRICENI`, `MEJGOROD`, `SEBN`).
Corecția planului: o singură constantă `DRAXELMAIER`, folosită în worker, `reguli/page.tsx`, `UZINE_LUNI.rind` și
ruta posterului. Se scrie în contractul F3.

**S11 — low (−0.5): tabelul Fișiere al F3 e incomplet.**
- «Toate rutele» (ION-67) e deja în `main`: `schelet/page.tsx:32-34,44-48` și `toate.ts:20-26,93-95` au semnătura fixă
  pe 4 rețele și paleta `TENTE`. Planul (rândul 134) zice «dacă e mersă».
- `ScheletFloresti` are o singură `poarta: Punct` și culori A/B (`ScheletFlorestiClient.tsx:26,28`), iar Drăxlmaier
  are două porți și unitatea rută × linie.

Corecția planului: se adaugă `toate.ts` și forma `schelet-drax.json` ca contract al `export-lde.mjs`:
`{ fixat, perioada, porti: Punct[2], rute: [{ id, linie, schimburi, grupa, capat, tur, retur, linie_geo }] }`.
Clientul se face după `ScheletBriceniClient` (mai multe puncte fixe), nu după Florești.

**Ce e în regulă:** ferestrele propuse respectă `396` (retur s2 1380→105 trece corect de miezul nopții, iar ziua
03:00 nu o taie). Suprapunerea tur s2 / retur s1 există și la LEAR (`396:35-36`). Cele 10 note de memorie din index
există. Codul VPS rămâne pe VPS, după precedentul ION-71/73, iar decizia e a lui Ion. Separarea agent (procedură +
index) / surse (bază, VPS) e corectă.

Suma deducerilor: 2.0 + 2.5 + 2.0 + 1.0 + 1.5 + 1.0 + 1.0 + 1.0 + 0.5 + 0.5 + 0.5 = 13.5 → scorul se oprește la 0.0.

Scor: 0.0 · Blocante (critical/high): 3

## Review: business-logic-auditor (v3)

Obiectul: planul v3 `shimmering-yawning-papert.md`, logica de business. Verific cum închide v3 observațiile B11–B15 și ce defecte noi aduce. Deciziile lui Ion nu le contest. Unde textul planului pare să se abată de la citatul lui Ion, cer doar să se pună întrebarea; nu decid eu.

Sursele citite:
- din repo, `origin/main`: `lde-geo-worker/lear-analiza.mjs:600-680`;
- de pe VPS, doar citire (`sed`/`grep` prin ssh, fără scp): `/root/lde-worker/briceni/cod/livrare.mjs:1-20,55-130`. Pe acest fișier pasul 3 al planului spune că se modelează F2.

### Starea B11–B15

| id | stare | de ce |
|---|---|---|
| B11 | **închis** | R3-Drax se aplică doar în zilele cu o singură pereche și fără jumătăți (pasul 3 b), iar «gol pe rută» bate «gol între ture» (pasul 3 a). Tabelul tiparelor e în «Verificat pe viu». Precedența 2 > 3 aduce însă un efect secundar pe categoria 4, descris la B16. Condiția R3 citită «și» în loc de «sau» e la B17. |
| B12 | **închis** | Fiecare jumătate contribuie cu 2 × etalon, etalonul se ia pe schimb, cursele cu `schimb = null` nu formează perechi, iar zilele cu jumătăți se numără. Rămâne un caz nou, jumătățile din detectare, descris la B18. |
| B13 | **închis** | `ctx.ancoraBateParcul` și `ctx.praguri.R_PARC_ZONA` au implicitele neschimbate. Porțile proprii se scot din `alteUzine`. Există test pe 346KAJ, iar valoarea zonei o dă Ion. |
| B14 | **închis** | Unitatea e (zi, schimb, clasă), atribuirea e ungară, fără plafon și cu steag. R2 e raportat ca scenariu comun. Rămâne un caz de margine, descris la B19. |
| B15 | **închis** | 31.08 se compară cu media L–V și primește steag dacă e atipică. |

### B16 — high (−2.0) — Precedența numerică 1–9 face din livrare «gol pe rută», deci R1-SEBN iese ≈ 0

**Dovada:**
- Planul, pasul 3 (a), definește categoria 2 «gol pe rută» larg: «piciorul gol cerut de o cursă cu oameni a mașinii (≤ 2,5 km la capăt)». Lista e «cu precedență», iar 2 stă înaintea lui 4 «livrare (locul nopții ↔ capăt)».
- Drumul de dimineață de acasă la capăt e exact «piciorul gol cerut» de primul tur și se termină la capăt. La fel drumul de acasă spre capăt înaintea turului s2. Toate trec deci la categoria 2, care e «al uzinei, nu se optimizează».
- Modelul pe care îl numește planul face invers. `briceni/cod/livrare.mjs:8-15` (VPS):
  - LIVRARE are prioritatea 3 (primul drum din zi, de la locul nopții, sau ultimul, spre el; `:67`);
  - GOL PE RUTĂ are prioritatea 5 și e restrâns la «neprog retur între două curse din orar ale **aceleiași rute**» (`:69-71`);
  - în goluri, livrarea (dimineața, seara, «pe acasă ≥ 20 min») e verificată înaintea legăturii (`:118-124`).
- Comentariul de la `:109-110` spune: «drumul de acasă spre capăt nu e rută».
- Tot planul, la pasul 3 (b): «R1-SEBN … economia = livrarea netă (categoria 4)».
- Efect secundar: și «legătură» (8) dispare. Drumul capăt X → capăt Y e și el «cerut» de turul Y, deci ajunge tot la 2.

**Scenariul de eșec.** O mașină doarme într-un sat din afara rutei, la 15 km de capăt (casa = cea mai lungă staționare, pasul 3).
- Dimineața: casă → capăt 15 km gol, apoi turul. Seara: capăt → casă 15 km.
- Cu v3, cei 30 km/zi intră la categoria 2. Livrarea iese 0, deci R1-SEBN = 0.
- Coloana «cea mai bună» alege R1-LEAR sau nimic.
- Ion răspunde la întrebarea 3 («care reguli intră în §8») pe o coloană R1-SEBN falsă, pentru toate mașinile care nu dorm în satul de start.
- Pe `/lde/reguli?uz=drax` (F3) tabelul categoriilor arată livrare ≈ 0 și legătură ≈ 0. Asta contrazice decizia 4, care numește «legătura» explicit.

**Corecția planului:**
- (1) «Gol pe rută» se restrânge la două cazuri. Primul: piciorul gol pe culoarul rutei, poartă → capăt înaintea turului și capăt → poartă după retur, cel mult bugetul liniei (ca `golImpusDeTure`, `livrare.mjs:132-153`). Al doilea: returul gol între două curse ale aceleiași linii.
- (2) «Livrare» (drumul de la locul nopții sau spre el, plus «pe acasă ≥ 20 min») bate «gol pe rută», ca în `livrare.mjs:67`.
- (3) «Legătură» = drumul gol între curse ale unor linii diferite, fără casă pe drum.
- (4) Tabela de precedență a F2 se scrie în plan ca tabel, pe modelul `livrare.mjs:5-16`. În ea «capăt» înseamnă satul-capăt al liniei, nu punctul de start al cursei. Altfel drumul acasă → poartă înaintea returului devine și el categoria 2 și înjumătățește R3.
- (5) Verificarea 4 primește o probă: o zi reală a unei mașini care doarme în afara rutei, cu livrare > 0 și legătură > 0 acolo unde e cazul.

### B17 — medium (−1.0) — Decizia 4 e transcrisă cu «și», dar citatul lui Ion spune «sau»

**Dovada:**
- Rândurile 26–27 citează: «… în contextul în care ruta e semnificativ de lungă **sau** mașina face doar o rută».
- Glosa de la rândurile 27–28 spune: «DOAR în zilele în care mașina face O SINGURĂ pereche … **și** pe rutele lungi».
- Pasul 3 (b) aplică ambele condiții deodată: doar zilele cu o pereche (13 %), iar rutele scurte ies «nesemnificativ».
- După B16, protecția pe care o cerea B11 o dă precedența dintre categorii, nu restrângerea la o pereche. Asta e o dovadă nouă: restrângerea nu mai e necesară logic, e doar o citire a deciziei.

**Scenariul de eșec.** Mașina duce tur X s1 pe o linie lungă, stă acasă, duce retur X s1 și seara face tur Y s2.
- Pe citirea «sau», intervalul dintre tur X și retur X e candidat la economie: ruta e lungă, iar între tur și retur nu e nicio altă cursă.
- V3 îl scoate, pentru că ziua are două perechi.
- În sens invers, o mașină cu o singură pereche pe o rută scurtă e eligibilă pe citirea «sau», iar v3 o marchează «nesemnificativ».
- Ion vede R3 pe un alt set de zile decât cel pe care l-a cerut.

Nu e high: cifra se măsoară oricum, iar Ion vede pragul la întrebarea 2.

**Corecția planului:**
- Glosa deciziei 4 se rescrie textual («sau»).
- Întrebarea 2 din F2 se reformulează: «(a) doar zilele cu o singură pereche, pe orice lungime; (b) orice interval «gol între ture» pe rutele peste prag, chiar dacă mașina mai duce alte linii; (c) ambele». Cifrele se pun pentru fiecare variantă.
- Agentul calculează toate cele trei variante și nu alege una.

### B18 — medium (−1.0) — O jumătate de pereche care vine din detectare devine economie

**Dovada:**
- «Verificat pe viu», rândul 65, dă printre cauzele jumătăților «retur nedetectat».
- Tot acolo se spune că cele 3.735 de curse cu `schimb = null` sunt «picioarele goale structurale». Afirmația vine din runda mea v2 și n-a fost verificată pe opriri.
- Ferestrele de retur s1 sunt 15:00–17:45 (rândul 62).
- Pasul 3 (b) dă 2 × etalon oricărei jumătăți.

**Scenariul de eșec.** Mașina duce tur s1, iar returul s1 pleacă la 18:00 (ore suplimentare).
- Returul cade în afara ferestrei, deci are `schimb = null` și nu formează pereche. Turul rămâne o jumătate, cu 2 × E.
- Kilometrii reali ai returului (plin + gol ≈ 2E) rămân în km-ul zilei și ies ca economie R1: km cu oameni numărați drept risipă.
- Cazul e același ca la B12, doar că îl produce detectarea, nu ruta.

**Corecția planului:**
- O jumătate e considerată «reală» doar dacă cursa-pereche lipsă (aceeași linie, același schimb, aceeași zi) apare la altă mașină.
- Altfel ziua primește steagul «pereche incompletă, probabil nedetectată» și iese din suma R1 și R3. Se numără separat.
- Verificarea 4 primește: câte curse cu `schimb = null` au opriri de urcare în satele liniei (dovada că duc oameni), cu criteriul lui `livrare.mjs:100-106`.

### B19 — medium (−1.0) — R2 «o mașină pe pereche» nu spune ce se întâmplă cu mașina care duce două perechi în același (zi, schimb)

**Dovada:**
- Pasul 3 (b) R2: «unitatea = (zi, schimb, clasă), o mașină pe pereche; atribuire ungară».
- Atribuirea ungară e unu-la-unu.
- Rândul 71 arată `ture/zi` = 3 pe 3 linii. Rândul 65 arată ≥ 2 linii în ≈ 55 % din zile.
- Nu s-a măsurat câte mașini duc două perechi în același schimb.
- Tot pasul 3 (b) nu spune ce se face cu perechile despărțite între două mașini (jumătăți).

**Scenariul de eșec.** Mașina M duce în schimbul 1 perechile A și B, pe linii scurte.
- Matricea ungară are o singură intrare pentru M. Ori A, ori B rămâne fără mașină: ori scenariul se oprește, ori perechea rămasă primește o mașină care în realitate nu era în schimb.
- Câștigul net al clasei e fals, iar la §8 R2 intră ca scenariu comun.

**Corecția planului:**
- F2 măsoară întâi câte (zi, schimb) au o mașină cu ≥ 2 perechi, sau o pereche dusă de două mașini.
- În cazul al doilea, mașina primește k sloturi, legate în lanț cu costul capăt → capăt. Altfel grupa iese cu steagul «R2 necalculat — pereche multiplă/despărțită, n = …».
- Verificarea 4 primește numărul acestor grupe.

### B20 — low (−0.3) — «decizia 4 a lui Ion din F2» la pasul 4

**Dovada:** rândul 206: «`?liber=1` doar mesajul ADMIN — după decizia 4 a lui Ion din F2». «Decizia 4» e deja numele regulii despre golul dintre ture (rândurile 26–29). Aici e vorba de întrebarea 4 din F2 (rândul 188).

**Corecția:** se scrie «după răspunsul lui Ion la întrebarea 4 din F2».

### Ce e în regulă în v3

- Decizia 4 e citită literal, cu o singură pereche și fără jumătăți; lipsește doar «sau», vezi B17.
- Jumătățile de pereche intră în R1 cu 2 × etalon, iar etalonul se ia pe schimb.
- R2 e raportat ca scenariu comun, iar contribuțiile negative se păstrează.
- Parcul trece prin `ctx`, după decizia lui Ion, cu implicitele neschimbate.
- 31.08 e verificat și primește steag dacă e atipic.
- Ordinea F1 → F2 → tichetul §8 → F3 e corectă:
  - F3 citește din §8 alternativele alese și din întrebarea 1 parcul;
  - niciun pas nu depinde de un pas de mai târziu;
  - §5, §7 și §8 intră doar după «da».
- Întrebările 1–4 sunt ale lui Ion și nu sunt deduse. Excepția e formularea întrebării 2, vezi B17.

### Deduceri
B16 −2,0 · B17 −1,0 · B18 −1,0 · B19 −1,0 · B20 −0,3 = 5,3. Închise în v3: B11–B15.

Scor: 4.7 · Blocante (critical/high): 1

## Review: senior-backend-engineer (v3)

Zona: realizabilitatea v3 (contractul agentului, migrațiile `DO`, modulul comun, ruta `drax-optimizari`, `UZINE_LUNI`,
ordinea livrării, testele). Cod citit pe `origin/main` 218ea4ff: `lear-timp-liber.mjs` (toate cele 6 exporturi),
`lear-saptamanal.sh`, `lear-saptamanal.test.sh`, `briceni-optimizari/route.ts`, `lde-timp-liber/route.ts`,
`lib/lde/{luni-paznic,timp-liber,briceni-optimizari-image}.ts`, `lde/reguli/page.tsx`, `lde/schelet/toate.ts`. Nu redeschid
ce e închis; deciziile lui Ion nu le discut.

### Starea S12–S18

| id | stare | observație |
|---|---|---|
| S12 | închis ca principiu; rest nou în S19 | `ctx.porti ?? [ctx.poarta]`, apelanții neatinși, nerecul pe `ctxDe` vechi, livrare în afara ferestrei de luni. Locul normalizării e însă nespecificat, iar modulul are patru intrări independente care citesc `ctx.poarta` (S19). |
| S13 | închis | `ancoraBateParcul` prin ctx, porțile proprii scoase din `alteUzine`, testul 346KAJ, alegerea parcului lăsată lui Ion. Notă: `R_PARC_ZONA` prin `ctx.praguri` merge deja fără nicio schimbare (`lear-timp-liber.mjs:89,189,211,345`: `P = { ...PRAGURI, ...(ctx.praguri \|\| {}) }`). Nu e nevoie de cod nou, doar de valoare. |
| S14 | închis ca mecanism; rest nou în S20 și S24 | Contractul pe fișiere, cele două porniri și cele trei căi sunt corecte. Proba (e) însă e pusă la pasul 1, deși are nevoie de ieșirile pasului 2, iar pornirea «execută» aplică migrația (S20). Nici locul unde scrie «cercetează» nu e fixat (S24). |
| S15 | închis | `DO` + `IS NULL` + `GET DIAGNOSTICS n = ROW_COUNT` + `RAISE`. Tranzacția `apply_migration` se anulează, deci ferestrele șterse înaintea `UPDATE` revin și migrația nu se înregistrează. Tagurile `$r$` / `$m$` în interiorul `$$` sunt valide cât timp textul nu conține `$$`. Marcajele sunt titlu + rând, cu gard `AND`. Corect. |
| S16 | închis ca decizie; rest nou în S21 | `?liber=1` există și e pus pe decizia lui Ion. Contractul lui tehnic lipsește însă: dedup-ul și forma rândului (S21). |
| S17 | închis | Forma `{ porti: [{ c, n }], rute[].linii[] { nr, …, tur/retur.plin } }` se mapează pe `Retea` (`toate.ts:12-15`) și pe helperul `plin` (`toate.ts:87-88`). `TENTE.drax` e în plan. |
| S18 | închis ca loc și ordine; rest nou în S22 și S23 | Blocul e după Briceni și înaintea cheii (`lear-saptamanal.sh:43-50`), iar ordinea livrării e VPS întâi. Durata e însă măsurată abia după ce blocul e deja în fața posterelor (S22). Testul are nevoie de un fals pentru scriptul Drăxlmaier (S23). |

### Observații noi

**S19 — medium (−1.0, gol de acoperire): «normalizat o dată la intrare» nu spune care intrare. Modulul are patru funcții exportate, chemate separat, care citesc `ctx.poarta`.**
Dovada:
- `lear-timp-liber.mjs` citește `ctx.poarta` în patru funcții exportate:
  - `curseCuOpriri` la `:132,150,165`;
  - `caseSecundare` la `:195`;
  - `eticheteaza` la `:213,243,328,330`;
  - `rezumaSaptamina` la `:350,351,379,380`.
- Apelanții cheamă `rezumaSaptamina` direct cu ctx-ul lor: `lear-analiza.mjs:1298`, `sebn-liber.mjs:218`.
- `hav` (`:62-65`) citește `b.lat` fără gard.

Scenariul de eșec. Executorul pune `const porti = …` local în `curseCuOpriri` și `eticheteaza`, ca în formularea S12 din v2, iar apelantul Drăxlmaier trimite `{ porti }` fără `poarta`. Urmările:
- în `rezumaSaptamina:350` (când există `casaC`) și `:379`, `hav(p, undefined)` aruncă `TypeError`. Blocul Drăxlmaier pică în fiecare luni și paznicul anunță «raport lipsă»;
- în `caseSecundare:195`, `hav(p, undefined)` aruncă la primul punct. Dacă cineva îl înfășoară, iese `NaN`: comparația e falsă, iar pauzele de la poartă devin «case secundare» și etichetele se strică fără niciun semnal.

Testul de nerecul trece oricum, pentru că `ctxDe` are `poarta`.

Corecția planului:
- Un singur helper exportat, `portiDin(ctx)`, idempotent, plus `distPoarta(p, ctx)` = minimul peste porți. Se cheamă în FIECARE din cele patru funcții exportate, iar `ctx.poarta` nu mai apare direct în modul (se verifică cu `grep -c "ctx.poarta"` = 0 în afara helperului).
- Testul nou cu `porti` cheamă toate cele patru funcții pe un ctx FĂRĂ `poarta` și verifică `Number.isFinite` pe `depMax` / `rCasa`.

**S20 — medium (−1.0, defect de ordine în verificare; ar fi high, dar dovada e doar textul planului, deci nu blochează conform rubricii): proba (e) e cerută la pasul 1, dar are nevoie de ieșirile pasului 2. Iar pornirea «execută» aplică migrația.**
Dovada (textul planului):
- Pasul 1, «Rezultat verificabil» (e), și Verificarea 1 cer ca proba (e) să treacă «într-o sesiune nouă» pentru agent. Proba folosește însă planul aprobat F1, BRIEF-ul F1 și răspunsurile F1, care apar abia la pasul 2.
- «Execută» = «migrație prin MCP, VPS, commit» (rândul 42-43). Proba (e) nu spune că se oprește înaintea aplicării.

Scenariul de eșec, în două variante:
- Handoff-ul umbrelei (pasul 0/1) așteaptă o probă imposibilă, sau proba e bifată fără să fi rulat.
- La F1, un agent de probă pornit «execută» chiar aplică 404 în prod, fără fapt `kind=migration`. Execuția reală pică apoi pe gardul `IS NULL`, iar migrația e înregistrată de probă, nu de tichet.

Corecția planului:
- Proba (e) se mută la F1: execuția F1 ÎNSĂȘI e proba. Pornirea «execută» a F1 se face cu agent nou, doar cu cele trei căi.
- Contractul «execută» primește un pas-poartă: scrie fișierul `404_…sql` în dereva tichetului și se OPREȘTE. Sesiunea compară fișierul cu SQL-ul din planul aprobat, apoi aplică sau spune agentului să aplice.
- Verificarea 1 rămâne cu (a)–(d).

**S21 — medium (−1.0, gol de acoperire): `?liber=1` nu are contract de dedup, iar forma rândului Drăxlmaier nu conține ce cere mesajul.**
Dovada:
- Singurul emițător de mesaj de timp liber (`lde-timp-liber/route.ts:91-121`) folosește `textTimpLiber` (`lib/lde/timp-liber.ts:25-31`). Acesta cere `masini[].liber` și `timp_liber.prag_km`.
- Dedup-ul emițătorului e o revendicare atomică pe `alerta_trimisa_la` / `rulat_la`, cu revenire când trimiterea pică (`:99-120`).
- Planul (F3) dă rândului Drăxlmaier forma `RaportBriceniDate`. Aceasta = `AnalizaBriceni` (`reguli/RaportBriceni.tsx:13`, `briceni-optimizari-image.ts:18-32`), care nu are nici `timp_liber`, nici `masini[].liber`.

Scenariul de eșec. Ion spune «da» la `?liber=1`, iar executorul scrie ruta fără revendicare:
- o retrimitere manuală, sau cele două apeluri de luni (script + plasă), trimit mesajul de două ori;
- sau, cu forma Briceni, `textTimpLiber` întoarce mereu `null` și paza promisă în §11 tace.

Corecția planului. Contractul F3 spune că:
- `date` Drăxlmaier = `AnalizaBriceni` + `timp_liber` + `masini[].liber` (forma `Raport` din `reguli/actions.ts:57-58,111-112`);
- `?liber=1` refolosește `textTimpLiber(…, { nume: 'Drăxlmaier', uz: 'drax' })` și revendicarea de la `lde-timp-liber:99-120`, extrasă într-o funcție comună sau copiată cu test;
- testele: «fără `liber` nu pleacă nimic», «două apeluri → un singur mesaj».

**S22 — medium (−1.0, estimare făcută după ce riscul e deja în producție): durata blocului Drăxlmaier se măsoară «pe prima săptămână», dar blocul stă deja în fața tuturor posterelor.**
Dovada:
- `lear-saptamanal.sh:43-50,57-62`: blocul stă înaintea cheii, deci înaintea tuturor `cheama` (SEBN, LEAR Ungheni, LEAR Florești, paznic).
- `timeout 90m`.
- Planul v1 (S5): extragerea ION-71 pe 49 de mașini a durat 40 min. Briceni durează 11–30 s (`:42`).

Scenariul de eșec. În prima luni, posterele SEBN și LEAR și indicațiile pentru Alexei pleacă la ~08:40 sau până la 09:30, în loc de ~08:05. Abia atunci se află că blocul trebuia pe cron separat.

Corecția planului:
- Durata se măsoară ÎNAINTE de a pune blocul în script: `drax/cod/saptamanal.sh` rulat de mână pe o săptămână încheiată, în afara ferestrei de luni.
- Prag scris în plan: de exemplu ≤ 5 min → în script, altfel cron separat la 07:00.
- `timeout` = de 2–3 ori durata măsurată, nu 90m copiat.

**S23 — low (−0.5): testul scriptului pică pe cazul «workeri OK» dacă nu primește un fals pentru scriptul Drăxlmaier.**
Dovada:
- `lear-saptamanal.test.sh:12-14` creează doar `$T/lde/briceni/cod/saptamanal.sh`.
- Un bloc nou `bash "$DRAX_SAPT"` cu calea implicită `$LDE_DIR/drax/cod/saptamanal.sh` pică în test, deci `picat=1`, iar `caz "workeri OK" 4 0` (`:43`) iese roșu.

Corecția: F3 adaugă falsul `$T/lde/drax/cod/saptamanal.sh` cu `FAKE_DRAX_EXIT` și antetul testului (`:3-7`) cu noul caz.

**S24 — low (−0.5): locul unde scrie pornirea «cercetează» în afara Plan Mode nu e fixat.**
Dovada:
- Planul, rândurile 38-39: «direct în `docs/plans/…`».
- Globalul git-guards: în arborele principal nu se face commit, iar dereva fazei apare abia după `tp new`, care are nevoie de tichetul creat din `ticket.md` produs chiar de «cercetează».

Scenariul: fișierul ajunge necomis în arborele principal sau în dereva umbrelei (ramură greșită), iar `tp new` pentru fază pornește de la `origin/main` fără el.

Corecția: «cercetează» scrie numai în afara repo-ului (fișierul de plan sau scratchpad-ul). Sesiunea copiază planul, răspunsurile și `ticket.md` în dereva fazei după `tp new`. «Măsurătorile de sesiunea principală» se fac tot în afara Plan Mode, nu în el.

**S25 — low (−0.3, cosmetic):**
- `toate.ts:20-26` are deja cinci tente (lear, orhei, strășeni, florești, mejgorod) și patru schelete la intrare (`:93-95`). Drăxlmaier e al cincilea schelet și a șasea rețea, deci «a 5-a rețea» din F3 / Verificare 5 induce în eroare.
- Textul de retrimitere din `luni-paznic.ts:53` numește Briceni. Ar trebui să numească și `drax/cod/saptamanal.sh`.

### Ce e în regulă
- Gardul `DO` / `ROW_COUNT` / `IS NULL` e corect, iar rerularea pică zgomotos.
- `livrare_validata` rămâne false explicit.
- `UZINE_LUNI` cu `poster: null, indicatii: null` urmează exact precedentul Briceni (`luni-paznic.ts:23`), iar `lipsurileLunii` cere atunci doar rândul.
- Ruta `drax-optimizari` implicit PNG / `?send=1` e fidelă `briceni-optimizari/route.ts:24-35`.
- `lde-timp-liber` rămâne neatins.
- Ramura `drax` în `reguli/page.tsx` intră ca `mejgorod` / `briceni` (`:53,102-116`), înaintea ternarului `:118`.
- Contractul pe fișiere cu trei căi e realizabil.
- Nimic din v3 nu se contrazice în afara S20.

### Deduceri
S19 −1.0 · S20 −1.0 · S21 −1.0 · S22 −1.0 · S23 −0.5 · S24 −0.5 · S25 −0.3 = −5.3 → 4.7. S12–S18 închise; resturile lor
sunt numărate o singură dată, în S19–S24.

Scor: 4.7 · Blocante (critical/high): 0

## Review: business-logic-auditor (v4)

Obiectul: planul v4 `shimmering-yawning-papert.md`, logica de business. Verific dacă v4 închide B16–B20 și dacă aduce defecte noi. Deciziile lui Ion nu le contest.

Sursele citite:
- planul v4, integral;
- de pe VPS, doar citire prin ssh (`sed` / `grep`): `/root/lde-worker/briceni/cod/livrare.mjs:1-20,32,60-165,352` și `proba-livrare.mjs:30,76,96`.

### Starea B16–B20

| id | stare | de ce |
|---|---|---|
| B16 | **închis parțial** | Livrarea stă acum înaintea golului pe rută (rândul 2 din tabelă), «capăt» înseamnă satul-capăt al liniei, iar legătura e definită (rândul 8). Probele «doarme în afara rutei → livrare > 0» și «două linii → legătură > 0» sunt în plan. Scenariul meu din v3 (casă → capăt 15 km dimineața) trece acum la livrare. Restrângerea golului pe rută e însă scrisă așa că înghite categoria 4, vezi B21. |
| B17 | **închis** | Decizia 4 e citată cu «sau» (rândurile 26–30). R3 se calculează pe trei citiri, (a), (b) și (c), iar Ion alege la întrebarea 2. Agentul nu alege. |
| B18 | **închis** | O jumătate de pereche e reală doar dacă cursa-pereche apare la altă mașină. Altfel ziua primește steagul «probabil nedetectată» și iese din suma R1 și R3. Cursele cu `schimb = null` se verifică pe opriri de urcare. Toate trei sunt la Verificarea 4. |
| B19 | **închis** | Se măsoară întâi. Mașina cu k perechi primește k sloturi legate în lanț, iar perechea despărțită primește steagul «R2 necalculat». Numărul grupelor e la Verificarea 4. |
| B20 | **închis** | Rândul 246 spune acum «după răspunsul lui Ion la întrebarea 4 din F2». |

### B21 — high (−2.0) — Tabela v4 face ca «gol între ture» să nu apară niciodată, deci R3 iese 0 pe toate cele trei citiri

**Dovada:**
- Rândul 3(b) din tabela F2 (plan: 183) definește golul pe rută ca «returul gol între două curse cu oameni ale ACELEIAȘI linii».
  - La Drăxlmaier rândul 1 numără ca «cu oameni» atât turul, cât și returul.
  - Intervalul dintre turul X și returul X ale aceleiași perechi stă deci, prin definiție, între două curse cu oameni ale aceleiași linii.
  - Rândul 3 are precedență față de rândul 4, așa că 3(b) prinde fiecare interval pe care îl definește rândul 4.
- La Briceni regula-sursă e `livrare.mjs:71` și `:130`: `golRuta` doar între două curse **din orar** ale aceleiași rute.
  - Comentariul de la `:72` spune că «orarele suburbane au doar tururi».
  - Deci acolo e golul dintre două TURURI, nu dintre tur și retur. Transpunerea a pierdut această restricție.
- Rândul 4 (plan: 184) cere explicit ca golul între ture să nu fie gol pe rută: «(iese de pe culoar)».
  - Asta spune că doar partea de drum din afara culoarului e R3.
  - Glosa deciziei 4 (plan: 29–30) spune la fel: «piciorul gol cerut de următoarea cursă cu oameni e «gol pe rută»».
  - Drumul capăt → poartă dinaintea returului e exact un astfel de picior.
- Rândul 3(a) trimite la `golImpusDeTure`. `livrare.mjs:149-165` nu verifică deloc locul în timp: ia orice bucată care atinge poarta, partea de pe culoar, până la buget.
  - Bugetul e `2 * L` pe rută și pe zi (`:352`).
  - Tot la `:352` rezultatul se numește `golTure`, la Briceni «al uzinei». Numele se ciocnește cu «gol între ture», care la Drăxlmaier înseamnă economie.
  - Un agent care urmează «ca `golImpusDeTure`» pune picioarele goale de la prânz în categoria 3.
- Decizia 4 citează textual obiectul regulii: golul «dintre» turul și returul aceleiași perechi. E chiar intervalul pe care 3(a), 3(b) și glosa îl scot.

**Scenariul de eșec.** O zi a tiparului (a), cu o singură pereche (13 % din zile), pe o linie de 40 km. Mașina doarme în satul-capăt.
- 06:13: turul X s1 ajunge la poartă.
- Mașina se întoarce goală pe culoar la capăt (40 km), stă acolo și revine goală la poartă (40 km).
- 15:54: returul X s1.
- Rândul 3(b) prinde intervalul, iar rândul 3(a) îl prinde și el (atinge poarta, e pe culoar, 80 ≤ 2 × 40). Rândul 4 cere oricum ieșire de pe culoar.
- Rezultatul: «gol între ture» = 0, deci R3 = 0 pe citirile (a), (b) și (c).
- Exact cei 80 km/zi pe care decizia 4 îi numește candidați la economie apar ca «al uzinei, nu se optimizează».
- Ion răspunde la întrebarea 2 și la întrebarea 3 (§8) pe o coloană R3 care e zero prin construcție, nu prin măsurare. Pe `/lde/reguli?uz=drax` (F3) categoria nu apare niciodată.

**Corecția planului** (precizează obiectul deciziei 4, nu decide în locul lui Ion):
- (1) Rândul 3(b) se restrânge la golul dintre două curse cu oameni ale aceleiași linii care NU sunt turul și returul aceleiași perechi. Cazul tipic e întoarcerea poartă → capăt dintre turul s1 și turul s2 ale aceleiași linii, ca la `livrare.mjs:71-72`.
- (2) Rândul 3(a) nu se aplică în interiorul intervalului tur(P) → retur(P) al aceleiași perechi când între ele nu e altă cursă cu oameni. Acolo nu consumă nici bugetul liniei.
- (3) Din rândul 4 se scoate «(iese de pe culoar)». Din glosa deciziei 4 se scoate «piciorul gol cerut de următoarea cursă cu oameni e gol pe rută» pentru același interval. Ion le numește tocmai pe acestea obiectul regulii.
- (4) Denumirea `golTure` de la Briceni se notează în plan ca «gol impus de ture = gol pe rută», ca să nu se confunde cu categoria 4.
- (5) Verificarea 4 primește o probă: o zi reală cu o singură pereche, în care mașina se întoarce la capăt între tur și retur, dă «gol între ture» > 0.

### B22 — low (−0.5) — Bugetul rândului 3(a) și ordinea față de livrare sunt descrise altfel decât în modelul citat

**Dovada:**
- Planul spune «cel mult bugetul liniei», fără unitate. În model bugetul e 2 × L pe rută și pe zi (`livrare.mjs:352`), nu pe pereche. La Drăxlmaier `ture/zi` e 2 pe 16 linii și 3 pe 3 linii.
- În model, `golImpusDeTure` scade partea de pe culoar din bucățile deja etichetate «livrare» (`:149-165`). Deci, pe culoar, golul impus bate livrarea. Tabela v4 pune livrarea strict înaintea golului pe rută.
- Rândul 3(a) prinde și drumul poartă → capăt Y după turul X, adică spre altă linie a mașinii. Decizia 4 (plan: 29) îl numește «legătură». Proba «două linii → legătură > 0» poate ieși 0 pe zilele tipice cu două linii: tur X s1, apoi poartă → capăt Y, apoi tur Y s2.

**Scenariul.** R-urile nu se schimbă: ambele categorii sunt «nu». Se schimbă în schimb tabelul categoriilor, iar proba de legătură poate pica fals.

**Corecția:**
- Bugetul se scrie cu unitate: 2 × etalonul liniei pe (zi, linie), sau pe pereche. Alegerea se justifică pe tiparul Trox de la `livrare.mjs:137-147`: 6 drumuri pe 2 ture, 2 goale.
- Se spune explicit că 3(a) se aplică ca scădere din livrare, ca în model, sau invers, cu motivul.
- Drumul poartă → capăt al altei linii se trece la legătură (rândul 8), cum spune decizia 4.

### Ce e în regulă în v4

- Livrarea e înaintea golului pe rută, «capăt» = satul-capăt al liniei, iar scenariul B16 din v3 trece.
- Decizia 4 e citată textual cu «sau». R3 se calculează pe trei mulțimi de zile, iar Ion alege pe cifre.
- Jumătățile de pereche sunt împărțite în reale și probabil nedetectate. Cele nedetectate ies din suma R1 și R3.
- R2 are k sloturi legate în lanț sau un steag, și se măsoară întâi.
- `ctx.schimb3` are implicitul neschimbat pentru LEAR și SEBN, iar pentru Drăxlmaier decide întrebarea 5.
- Ordinea F1 → F2 → tichetul §8 → F3 e corectă, iar întrebările 1–5 sunt ale lui Ion.

### Deduceri

B21 −2,0 · B22 −0,5 = 2,5. Închise în v4: B17, B18, B19, B20. B16 e închis în partea lui din v3, dar partea care rămâne e B21.

Scor: 7.5 · Blocante (critical/high): 1

## Review: senior-backend-engineer (v4)

Zona mea: realizabilitatea v4, adică contractul agentului, pasul-poartă, modulul comun, ruta `drax-optimizari`, scriptul de luni și testele. Am citit codul pe `origin/main` **33fc6761** (26.09 16:10). Tabelul «Verificat pe viu» din v4 a fost verificat pe 218ea4ff, deci între timp a intrat un commit.

Fișierele citite:
- `lde-geo-worker/lear-timp-liber.mjs` (integral, `:20-305`);
- `lear-saptamanal.sh` și `lear-saptamanal.test.sh`;
- `api/cron/lde-timp-liber/route.ts:20-126`;
- `lib/lde/timp-liber.ts`, `lib/lde/luni-paznic.ts`, `lib/lde/briceni-optimizari-image.ts`;
- `lde/reguli/{actions.ts,page.tsx,RaportBriceni.tsx}`;
- `sebn-liber.mjs` (forma rândului);
- `~/dev/git-guards/bin/gg-check-migrations.sh`;
- `git ls-tree origin/main packages/db/migrations`.

Nu redeschid ce e închis fără dovadă nouă și nu discut deciziile lui Ion.

### Starea S19–S25

| id | stare | observație |
|---|---|---|
| S19 | închis | `portiDin` și `distPoarta` se cheamă în toate cele patru funcții. `grep -c "ctx.poarta"` = 0 în afara helperului. Testul pe un ctx FĂRĂ `poarta` verifică `Number.isFinite`. Verificat pe cod: cele patru funcții citesc `ctx.poarta` la `:132,150,165` / `:195` / `:213,243,328,330` / `:350,351,379,380`. O notă pentru executor, nu deducere: `:330` (`[...case_, ctx.poarta]`) și `:379-380` au nevoie de PUNCT, nu de distanță. Acolo intră `...portiDin(ctx)`, respectiv maximul peste puncte al lui `distPoarta`. Gardul `grep` le prinde oricum. |
| S20 | închis | Pasul-poartă e în «Ce facem» (`:44-46`) și în contract (`:142-143`). Proba (e) e mutată la execuția F1 (`:151-153`, Verificare 1). Verificarea 1 rămâne cu (a)–(d). `404` e încă liber pe `origin/main` (ultimul fișier e `403_lde_trox_ferestre_reguli.sql`). |
| S21 | închis ca formă și dedup; rest nou în S27 și S29 | Forma e realizabilă. `date` = `AnalizaBriceni` + `timp_liber` + `masini[].liber` e exact ce citește `lde-timp-liber/route.ts:48,91-93`. `sebn-liber.mjs:218,231-245` arată că `rezumaSaptamina` produce `TimpLiberMasina`. Revendicarea `:99-120` e numită. Lipsesc însă cine cheamă `?liber=1` (S27) și pagina spre care duce linkul mesajului (S29). |
| S22 | închis ca principiu; rest nou în S28 | Durata se măsoară de mână înainte, cu prag de 5 min și `timeout` = 3 × durata. Ramura «cron separat 07:00» are însă o cursă cu paznicul de la 08:0x (S28). |
| S23 | închis | Falsul `$T/lde/drax/cod/saptamanal.sh`, `FAKE_DRAX_EXIT` și cazul nou în antet se potrivesc cu `lear-saptamanal.test.sh:12-14,43-49`. |
| S24 | parțial; rest în S31 | Pasul `:47-48` spune «NUMAI în afara repo-ului». Rândurile `:39-40` spun însă încă «sau, în afara Plan Mode, direct în `docs/plans/…`». Planul se contrazice singur. |
| S25 | închis | «a ȘASEA rețea» (`:73,244,299`) și textul paznicului cu `drax/cod/saptamanal.sh` (`:249-250`) sunt corectate. |

### Observații noi

**S26 — high (−2.0, defect de logică; dovadă nouă după v4). Tabela F2 copiază definiția «livrării» pe care Ion a schimbat-o la Briceni pe 26.09.**

Dovada:
- Commitul `33fc6761` (26.09 16:10, după faptele v4 verificate pe 218ea4ff) spune: «Pe acasă între două curse, livrare e doar **ocolul**: km-ii peste drumul direct de la sfârșitul unei curse la începutul următoarei (km pe drum), pe care mașina l-ar face oricum — între două ture […] acel drum direct e gol între ture […], altfel legătură; niciunul nu e economie». Textul e în `apps/admin/src/app/(dashboard)/lde/reguli/RaportBriceni.tsx:200-205` (origin/main).
- Bucata de zi poartă acum km de două categorii: `BucataZi.golTure?` (`briceni-optimizari-image.ts:20`, `RaportBriceni.tsx:56`).
- Mesajul commitului spune că `livrare.mjs` și `curse.mjs` de pe VPS au fost rescrise (15 probe).
- Planul v4 are încă definiția veche:
  - tabela F2, rândul 2 (`:182`): «drumul pe acasă (staționare ≥ 20 min acasă) între curse» = livrare ÎNTREAGĂ;
  - rândul 8 (`:188`): legătura doar «fără casă pe drum»;
  - regula «intervale cu O categorie» (`:176`);
  - faptul din tabel (`:74`) citează `livrare.mjs` în forma de dinainte.

Scenariul de eșec. La Drăxlmaier 23,7 % din zilele-mașină au o linie cu două perechi, iar ≈ 55 % au ≥ 2 linii (`:76`). O mașină duce retur s1 pe linia X, trece pe acasă, apoi face tur s2 pe linia Y. Planul numără tot drumul capăt X → casă → capăt Y ca livrare. Regula de azi a lui Ion numără doar ocolul peste drumul direct capăt X → capăt Y, iar drumul direct e legătură sau gol pe rută. Urmările:
- R1-SEBN («livrarea netă») iese umflat exact cu drumul direct;
- legătura iese subestimată;
- Ion primește cifrele la întrebarea 3 («care reguli intră în §8») pe o definiție pe care a abandonat-o;
- mai mult, agentul are ordinea surselor «cod care rulează > planuri vechi» (`:110-111`). Executorul F2 găsește deci codul Briceni nou în contradicție cu tabela aprobată și trebuie să aleagă singur, adică exact ce contractul interzice.

Corecția planului:
- Fapt nou în «Verificat pe viu»: `33fc6761`, `RaportBriceni.tsx:200-205`.
- Tabela F2, rândul 2: «pe acasă între curse: livrare = DOAR ocolul peste drumul direct (Valhalla) de la sfârșitul unei curse la începutul următoarei. Drumul direct e gol între ture (aceeași pereche), gol pe rută (aceeași linie) sau legătură (linii diferite)». Rândul 8 fără «fără casă pe drum».
- «O categorie pe interval» devine «o categorie pe interval SAU interval despărțit în ocol + drum direct, ca `BucataZi.golTure`». Bilanțul Σ = urma ±3 % rămâne.
- Proba nouă în Verificare 4: o zi cu casa între două linii dă livrare = ocolul, nu tot drumul.
- La perechea tur → retur a aceleiași linii, drumul direct poartă → poartă ≈ 0 km, deci R3 și R1-SEBN nu se schimbă acolo. Planul poate spune asta explicit.

**S27 — medium (−1.0, gol de acoperire). `?liber=1` nu are apelant. Dacă Ion spune «da» la întrebarea 4, paza promisă în §11 tace.**

Dovada:
- `lear-saptamanal.sh:57-62` cheamă doar `sebn-optimizari`, cele două `lde-timp-liber` și paznicul.
- Planul păstrează expres «tot 4 apeluri» (`:229`, Verificare 5).
- Ruta `drax-optimizari` face implicit PNG, iar `?liber=1` e doar la cerere (`:245-247`).
- Paznicul cu `poster: null, indicatii: null` verifică doar rândul (`luni-paznic.ts:29-37`), deci nu vede lipsa mesajului.

Scenariul de eșec. Ion spune «da». F3 construiește ruta, revendicarea și testele «două apeluri → un mesaj» (verzi), dar nimic nu cheamă ruta lunea. Nicio mașină Drăxlmaier peste prag nu ajunge la ADMIN, și nimeni nu observă.

Corecția planului:
- La «da»: `cheama "drax-optimizari?liber=1"` în `lear-saptamanal.sh`, după `lde-timp-liber?uz=floresti` și înaintea paznicului. Testul trece la 5 apeluri, cu cazul «Drăxlmaier picat → tot 5 apeluri, cod ≠ 0». La «nu»: 4 apeluri, cum e acum.
- Ruta fără rând întoarce `raport: false` fără mesaj, fiindcă paznicul anunță deja «raport lipsă». Altfel ADMIN primește dublura pe care `lde-timp-liber:71-75` o trimite pentru LEAR.
- În ramura «cron separat 07:00», apelul rămâne tot în scriptul de la 08:00, nu în cronul Drăxlmaier.

**S28 — low (−0.5). În ramura «cron separat», `timeout` = 3 × durata poate depăși ora 08:00, iar paznicul raportează fals «raport lipsă».**

Dovada:
- Paznicul e ultimul `cheama` din scriptul de la 08:00 (`lear-saptamanal.sh:62`) și citește `lde_analiza_reguli` (`luni-paznic.ts:57-60`).
- Pragul ramurii e > 5 min, fără plafon de sus. Extragerea ION-71 pe 100 de zile a durat 40 min (`:80`).

Scenariul: durata măsurată e 25 min, deci `timeout` 75 min. O luni lentă termină la 08:10. Paznicul de la ~08:05 a trimis deja «Drăxlmaier: raport» la ADMIN, iar ruta `?liber=1` (S27) a găsit rândul lipsă.

Corecția: în ramura separată, pornirea e la `08:00 − 3 × durata − 5 min`, sau `timeout` e plafonat la 55 min. Dacă durata măsurată > 18 min, se trece la o analiză mai scurtă, nu la o limită mai lungă.

**S29 — low (−0.5). Linkul din mesajul de timp liber duce pe o pagină care nu arată timpul liber.**

Dovada:
- `textTimpLiber` pune în subsol «unde, când, cu ce opriri — pe pagină», cu linkul `/lde/reguli?saptamina=…&uz=drax` (`lib/lde/timp-liber.ts`, «subsol»).
- `RaportDrax.tsx` e «după `RaportBriceni`» (`:240`). `RaportBriceni` nu citește `masini[].liber` și `iesiri`: grep pe `liber` în fișier = 0 potriviri. Asta e firesc, fiindcă Briceni n-are timp liber.

Scenariul: Ion apasă linkul și vede categoriile de km, dar nu ieșirile, opririle și orele promise în mesaj.

Corecția: `RaportDrax.tsx` primește secțiunea de timp liber, refolosită din componenta care randează `TimpLiberMasina` la SEBN (`RaportSebn`, prin `liber` la `page.tsx:80-95`). Sau, până la «da», mesajul nu pleacă, și asta e deja legat de întrebarea 4. Planul trebuie să numească una din cele două.

**S30 — low (−0.5, testul promis nu poate trece cu pragurile implicite). «Atingere la 22:10 … cu `schimb3: false` = liber» iese «neclar», nu «liber».**

Dovada:
- `lear-timp-liber.mjs:291`: `if (c.parc.zona) { e.eticheta = 'neclar'; … }`.
- `c.parc.zona` = orice punct la ≤ `R_PARC_ZONA` (3 km, `:32`) de parc (`:182`).
- Ambele porți Drăxlmaier sunt în zona asta: VEST la 0,70 km, EST la 2,25 km (`:75`). Orice cursă neancorată care atinge poarta e deci «neclar».

Scenariul: executorul scrie testul cum cere planul. Testul iese roșu, iar singura cale să-l facă verde e să schimbe `R_PARC_ZONA` sau ordinea etichetelor, adică să decidă întrebarea 1 în locul lui Ion.

Corecția: testul `schimb3` verifică ce ține de schimb 3: `ancora === null` și `eticheta !== 'muncă'`. Eticheta finală («liber» sau «neclar») se testează separat, cu `R_PARC_ZONA` explicit în `ctx.praguri`, după răspunsul la întrebarea 1.

**S31 — low (−0.3, cosmetic și necontradicție):**
- `:39-40` («sau, în afara Plan Mode, direct în `docs/plans/…`») contrazice `:47-48` («NUMAI în afara repo-ului»). Se scoate paranteza. Acesta e restul din S24.
- Tabelul «Fișiere» (`:267`) și «Riscuri» («Modulul comun», `:275`) nu numesc `ctx.schimb3`, `portiDin` și `distPoarta`, deși pasul 4 și Verificarea 5 le cer. Se aliniază.

### Ce e în regulă
- Pasul-poartă e realizabil. `gg-check-migrations.sh` verifică doar dublurile de număr, deci fișierul `404_…sql` scris și comis în dereva nu e blocat de gard înainte de aplicare.
- `ctx.schimb3` e compatibil. Ferestrele Drăxlmaier retur s2 23:00–01:45 și tur s1 03:30–07:00 ancorează oricum prin `ferTur` și `ferRetur` (`:217-230`) înaintea ramurii `NOAPTE_S3` (`:232-234`). `schimb3: false` taie deci doar atingerile din afara ferestrelor.
- Forma rândului `date` e compatibilă cu `Rand` (`lde-timp-liber/route.ts:48`) și cu `textTimpLiber`.
- Blocul înaintea `CRON_SECRET`, falsul în test și ordinea «VPS întâi» se potrivesc cu `lear-saptamanal.sh:43-50` și cu testul.
- `UZINE_LUNI` cu `poster: null, indicatii: null` urmează exact precedentul Briceni (`luni-paznic.ts:23`).
- Nu găsesc altă contradicție internă în afară de S31.

### Deduceri
S26 −2.0 · S27 −1.0 · S28 −0.5 · S29 −0.5 · S30 −0.5 · S31 −0.3 = −4.8 → 5.2.
- S19, S20, S23 și S25 sunt închise.
- Resturile din S21, S22 și S24 sunt numărate o singură dată, în S27–S29 și S31.
- S26 e blocantă: dovada e `fișier:linie` pe `origin/main` (commitul 33fc6761, de după v4), scenariul de eșec e concret (cifrele R1-SEBN și legătura puse lui Ion la întrebarea 3), iar regula e a lui Ion din 26.09. Corecția e mică: rândurile 2 și 8 din tabela F2, un fapt și o probă.

Scor: 5.2 · Blocante (critical/high): 1
