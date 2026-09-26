# Agentul `schelet-verificator` — verificarea scheletului Drăxlmaier (ION-95) · v4

Scris pe 26.09.2026 de `uzina-analist` («cercetează», în afara Plan Mode). **v4 = după runda 3 (ultima).**
- Scoruri: business 6,5 (H1), backend 3,3 (H1, H2); Codex r2 indisponibil până la 27.09 01:52.
- Toate observațiile sunt acceptate (`triaj-r3.md`), iar Q1–Q3 sunt aplicate mecanic.
- Codex r2 pe v4 rămâne ultima verificare externă. Până la el, exportul scheletului, primul `--write` și promovarea `ideal-v2` așteaptă.

Anexe:
- `invatat.md`, `agent-draft.md` v4 FINAL, `verdict.schema.md` v4, `ticket.md` v4, `prompt-verificarea-1.md`;
- `cod/`: `drax.mjs`, `etalon-gps.mjs`, `ruleaza.sh`, `poarta.sh`, `poarta.mjs`, `diag.sh`, `proba.mjs`, `prima-linie.mjs`, `compara.mjs`,
  `noteaza.mjs` (judecata), `regresie-script.mjs`, `tabel-g1.mjs`, `porti-drax.json`, `explicatii-drax.sablon.json`;
- `rulari/drax-v4/`;
- fișierul-etalon `~/.claude/projects/-Users-ionpop-Desktop-TRANSLUX/verif-etalon/etalon-cunoscut-drax.json`.

## De ce

Ion, 26.09.2026: «hai să facem un agent care să verifice scheletul la Drăxlmaier; agentul să fie învățat pe baza scheletelor
precedente, dar să țină cont de turele diferite un pic la Drăxlmaier». În aceeași zi: «nu folosim geometria, folosim km reali din GPS».

Controlul ION-71 (a)–(m) are goluri demonstrate:
- dublurile de dispozitiv;
- (m) care se filtrează singur;
- dedup-ul turelor între mașini;
- salturile între porți atribuite liniilor;
- regimul pe altă fereastră decât idealul;
- km-ul cardului din drumul desenat.

Până acum, F3 n-avea nicio poartă între scheletul ideal și export.

## Ce facem

1. **Scriptul fix** `drax.mjs` + **modulul comun** `etalon-gps.mjs` (îl folosește și F3 `compara-ideal.mjs` / pasul E). Etalonul GPS al
   liniei se calculează așa:
   - doar picioarele de pe POARTA SENSULUI (turul pe poarta turului, returul pe poarta returului);
   - km = `plin` + raza porții (EST 0,6 / VEST 0,5, din `drax/cod/ideal/curse.mjs:18`, în fișierul sigilat `porti-drax.json`);
   - mediana pe zilele bune GPS, cu ≥3 zile.
   G1 compară cardul cu acest etalon; >5 % = blocant. Corecția e «directă» doar dacă C47 ≥60 % pe linie; altfel «diagnostic cerut».
2. **Rularea** ca `verif`: `/home/verif` și `verificator/{cod,date,rulari}` sunt `root:root 755`, iar `verif` nu poate redenumi, scrie
   sau intra în `/root`.
   - Lucrează pe copii, cu manifest, sigiliu (inclusiv sha-ul `etalon-gps.mjs`), probe care iau sursa din `sursa.txt` și `inchide`.
   - Un **candidat** trebuie să fie COMPLET, cu marcajul `GATA` (sha256 pe fișier) scris de producător; fără completare tăcută din `drax/date`.
3. **Poarta spre F3:** `poarta.sh <export|write> <sursa>`, cu sursa OBLIGATORIE.
   - Ambele moduri verifică toate cele 9 intrări, sha-ul `drax.mjs` + `etalon-gps.mjs` din sigiliu (L8) și `GATA` la candidat.
   - `POARTA_VERDICT` e îngrădit la `rulari/` (L5); un candidat ilizibil se sare (L6).
   - Pe stdout iese lista sha256, pentru recomparare în F3 (L4). Codurile: 0 / 2 / 3.
4. **Proba oarbă** (biz H1):
   - agentul scrie `judecata.json` (linie cu linie: verdict, mecanisme din vocabular închis, propunere), iar `noteaza.mjs` notează DOAR asta;
   - proba e anulată dacă transcriptul citește `memory/drax-`, `docs/plans/2026-09-2`, `scratchpad/sv/` sau `verif-etalon`;
   - corpul interzice explicit aceste surse;
   - ieșirea agentului merge în `scratchpad/verif-run/`, iar promptul exact e în `prompt-verificarea-1.md`.
   Regresia scriptului (`regresie-script.mjs` pe `controale.json`) e separată și NU e proba oarbă.
5. **Registrul R4** rescris pe fapte, cu formula scrisă (picioare × plin median ÷ 74 de zile L–V): R13 ≈ 9, R18 ≈ 5, Iabloana ≈ 2 km/zi.
   E re-semnat pe `43dcceaf…`.
6. **`compara.mjs`** compară și cardul: pe scheletul nou, card = etalonul completat ±0,1 km, plus totalul km/zi card și GPS vechi → nou.
7. **Verificarea 1** = pe `drax/date`, oarbă, în ION-95, înaintea handoff-ului. **Verificarea 2** = pe `ideal-v2`, după `GATA`, la cererea
   executorului F3 (Q3).

## 🔬 Verificat pe viu

Pe VPS, 26.09.2026, 22:33 (ora Chișinăului): rularea `/home/verif/verificator/rulari/drax-v4-1790451192` (sursa `drax/date`), adusă în `sv/rulari/drax-v4/`.

| Presupunere | Cu ce | Fapt | Ce influențează |
|---|---|---|---|
| `verif` nu poate înlocui verificatorul | `chown root:root /home/verif`; `runuser -u verif -- mv /home/verif/verificator /home/verif/furat` | «Permission denied»; `touch /home/verif/x` și `touch …/cod/x` refuzate; `ls /root/lde-worker` refuzat | bk H1 închis |
| Candidat incomplet | `VERIF_SRC=…/ideal-v2 ruleaza.sh v4` | «fără marcajul GATA — producătorul n-a terminat», cod 2 | M5 |
| Rularea | `ruleaza.sh v4` | cod 0; `SIGILIU` (drax.mjs 0ca96a6f…, plus etalon-gps.mjs); «INCHIS ok»; probele R1 și registru ok | — |
| Poarta | 6 probe | fără sursă **2**; `export drax/date` **3** (5 blocante G1); `write drax/date` **3**; `POARTA_VERDICT` în `/tmp` **2**; verdict alterat sub `rulari/` **3** (sigiliu invalid); verdict corupt **3** (ilizibil, sărit) | H2, L5, L6 |
| Blocante după completarea razei | `verdict.json` | **5, toate G1** (v3 avea 7): Usurei 40 / 37,4 (7,0 %, C47 94 % → **corecție directă**); Bocancea Schit 54,5 / 46,2 (18 %, C47 37 %), Catranic 30 / 28,3 (6 %, 3 zile, C47 51 %), Zarojeni 28,9 / 30,7 (−5,9 %, C47 41 %), **Sturzovca 24,9 / 46,5** (C47 29 %) → **diagnostic cerut**; ieșite: Radoaia, Țiplești, Grinăuți | Q1 (c) |
| Tabelul card vs etalon completat (`rulari/drax-v4/tabel-g1.md`) | `tabel-g1.mjs` | >5 %: 5; 2,5–5 %: 18; ≤2,5 %: 25; card > GPS pe 36/48 (era 45/48), mediana diferenței 2,1 % (era 3,4); km/zi GPS completat **5.875** față de card 5.843; ziua aleasă nu e zi bună GPS pe 4 linii (era 1) | — |
| Sturzovca pe poarta sensului | idem | cu poarta sensului (tur VEST, retur EST), cele 8 zile bune sunt varianta lungă (~46 km); 41 de picioare pe cealaltă poartă; C47 29 % → două variante de drum; kmZi GPS 279 față de 149 pe card — umflă totalul | Întrebarea 1 |
| C47 pe km completați | `C47 total` | 2.052/2.393 (85,8 %); 157 de picioare de pe cealaltă poartă, în afara comparației; 16 linii <90 %; **6 <60 %**: Bocancea Schit 37, Zarojeni 41, Trifănești 42, Catranic 51, Nihoreni 58 (nou), Sturzovca 29 | — |
| C4 pe dispozitiv | `C4 efect` | 350KAJ (R16 Vărvăreuca): etalon 42,8, ture/zi 2 neschimbate, «păstrează scurta» → zile bune 35 → 29 (informativ); 880RNK (R12 Pelinia, R12 Sofia): efect nul → nu blochează, măsurat | — |
| Restul constatărilor | `controale.json` | V6 (744ARF 17 zile, 386PKP 9 zile); V2 Trifănești 2 → 4; D1 regim sursă ≠ total pe 7 linii; D6 Sturzovca informativ; D7 geamăn `rt` 114 / 211 — neschimbate față de v3 | — |
| Regresia scriptului | `regresie-script.mjs` | 17/17 calculate, 12/12 ținute deoparte (NU e proba oarbă) | — |
| Corpul agentului | `grep` pe plăci și linii din fișierul-etalon | gol | biz H1 |

## Pași

0. ION-95 (`ticket.md` v4).
1. **Codex r2 pe v4** (după 27.09 01:52), apoi triaj; fără încă o rundă Claude.
2. **Sesiunea:**
   - scrie `agent-draft.md` în `/Users/ionpop/Desktop/TRANSLUX/.claude/agents/schelet-verificator.md`;
   - corectează planul F3 și BRIEF-ul ION-94 (comentariu `tp comment -F`): `poarta.sh` cu sursa explicită, `readlink -e`, verificarea 2 după
     `GATA`, pasul E scrie cardul = etalonul completat prin `etalon-gps.mjs`, direct doar unde C47 ≥60 %.
3. **Verificarea 1** (instanță nouă, promptul exact din `prompt-verificarea-1.md`), apoi
   `noteaza.mjs judecata.json --transcript …`.
4. **Dezbaterea** corecțiilor și întrebărilor agentului (Claude + Codex).
5. **Tichetul «Corecții lanț ideal ION-71»** (R8 + cardul GPS + `kmPoarta` pe cursă).
6. **Commit** în dereva (planul, raportul, judecata, verdictul, `cod/` ca copie de revizie; fără fișierul-etalon), apoi `tp handoff`.

## Fișiere

| Fișier | Ce |
|---|---|
| VPS `/home/verif/verificator/cod/` | `drax.mjs`, `etalon-gps.mjs`, `ruleaza.sh`, `poarta.sh`, `poarta.mjs`, `diag.sh`, `proba.mjs`, `prima-linie.mjs`, `compara.mjs`, `arata.mjs` (root 644) |
| VPS `/home/verif/verificator/date/` | `ferestre-drax.json`, `porti-drax.json`, `explicatii-drax.json` (re-semnat) |
| VPS `/home/verif/verificator/rulari/drax-v4-1790451192/` | rularea v4 (sigilată, închisă, probe); `test-alterat-*` = proba porții |
| `~/.claude/projects/-Users-ionpop-Desktop-TRANSLUX/verif-etalon/etalon-cunoscut-drax.json` | 26 de cazuri: 17 calculate, 12 ținute deoparte, 9 copiate; cu `judecata` pe caz |
| `scratchpad/verif-run/` | ieșirea agentului la verificarea 1 |
| planul F3 / BRIEF ION-94 | poarta, sursa explicită, pasul E, `readlink -e` |

## Riscuri

- **Indexul memoriei proiectului e încărcat automat în subagenți** și are rânduri despre Drăxlmaier. Unul numește cazul ținut deoparte
  (`IMEI 0357… = 880RNK`). Corpul spune «ignori tot ce spune despre Drăxlmaier», dar textul intră oricum în context.
  - Cazul K6 poate fi deci contaminat.
  - Recomandare: sesiunea notează K6 separat sau scoate temporar din `MEMORY.md` rândurile `drax-*` pe durata verificării 1 (întrebarea 2).
- **Poarta sensului poate alege o variantă minoritară de drum** (Sturzovca: 8 zile bune pe varianta de ~46 km, card 24,9).
  - Ea vine din `real.poartaTur/Retur`, modul pe zilele bune ale lanțului.
  - E prinsă ca «diagnostic cerut» (C47 29 %), dar totalul km/zi GPS e umflat de ea (5.875).
- **Regresia 17/17 nu e oarbă**: scriptul e scris după aceste cazuri. Proba oarbă e `judecata.json`.
- **Concurența pe VPS** (alte sesiuni scriu în `drax/date`): manifestul e restrâns la lanțul ideal. `ideal-v2` e în lucru și nu se
  verifică înainte de `GATA`.
- **C5 / W53:** lanțul are UTC+3 fix (termen 25.10) și paritate ISO (termen 21.12).

## Verificare

1. `ruleaza.sh v<N>` = 0, `SIGILIU`, «INCHIS ok», probele ok; candidatul fără `GATA` = 2.
2. Poarta: 2 fără sursă și pe `POARTA_VERDICT` din afara `rulari/`; 3 cât există blocante, pe sigiliu invalid sau pe verdict corupt; 0 doar
   pe verdictul sigilat, închis, valid, cu scriptul de acum și cu cele 9 sha egale.
3. `mv` / `touch` ca `verif` în `/home/verif` = «Permission denied».
4. Verificarea 1:
   - `noteaza.mjs` ≥ 14/17 calculate și ≥ 9/12 ținute deoparte;
   - transcriptul fără citiri interzise;
   - `judecata.json` are toate cele 51 de linii din act + liniile `*`.
5. Nimic scris în bază sau în `drax/`.

## Întrebări rămase (pentru Codex r2 / dezbatere)

1. **Poarta sensului pentru etalon.** Pe liniile unde `real.poartaTur/Retur` (din câteva zile bune) desparte două variante de drum
   (Sturzovca), poarta se ia ca modul pe TOATE observațiile sursei, sau rămâne cea din lanț, cu «diagnostic cerut»? Azi rămâne cea din
   lanț, iar linia e blocată pe diagnostic.
2. **Indexul memoriei în subagent.** Rândurile despre Drăxlmaier se scot temporar din `MEMORY.md` pe durata verificării 1, sau K6 se
   notează separat ca posibil contaminat?

---

## v4.1 (27.09.2026) — Codex r2 (FAIL, 2 blocante) + verdictul dezbaterii verificării 1, aplicate mecanic

### Ce s-a schimbat

**Codex C1 (high) — C4 pe dispozitiv.**
- Modulul nou `c4.mjs` (pur) construiește variantele «fără dispozitivul X»: elimină COERENT toate deplasările acelui dispozitiv în zilele duble, inclusiv cele fără pereche.
- Identitatea vine din câmpul `dev`, pe care lanțul ION-71 nu-l păstrează azi (`fix-350.mjs:7` pierde id-ul, iar `fix-dubluri` mută cursele fără urmă).
- Fără `dev`, rezultatul e **NEDETERMINAT = blocant**, iar marginile (lunga / scurta / sosirea devreme / târzie) se arată doar ca ordin de mărime.
- Corecția de lanț intră în tichetul «Corecții lanț ideal ION-71»: `c.dev = id` păstrat la unire.

**Codex C2 (critical) — izolarea diagnosticului.** Root nu mai scrie niciodată într-un dosar al lui `verif`.
- Structura rulării:

  | Dosar | Proprietar | Rol |
  |---|---|---|
  | `in/` | root | copiile intrărilor |
  | `work/` | verif | ieșirea scriptului fix |
  | `out/` | root | verdictul publicat; copiat din `work/` cu `cp -P` + refuz pe link |
  | `diag-out/` | verif | ieșirea diagnosticului |

- Scripturile de diagnostic se instalează în `/home/verif/verificator/diag-cod/`, un dosar exclusiv al lui root.
  - Sursa trebuie să fie un fișier obișnuit al lui root, într-un dosar al lui root fără scriere pentru alții (nu `/tmp`).
  - Rularea se face ca `verif`, cu ieșirea pe stdout.
- Manifestul acoperă și `cod/` și `date/` ale verificatorului.
- `SIGILIU` și poarta verifică sha-urile pentru `drax.mjs`, `etalon-gps.mjs`, `filtru-rupte.mjs`, `c4.mjs`, `poarta.sh` și `poarta.mjs`.

**Verdictul dezbaterii verificării 1** (`scratchpad/verif-run/verdict-dezbatere.md`):
- (a) Modulul comun `filtru-rupte.mjs` exclude urma ruptă. Limita e `plin` < dreapta centrul porții → capăt − raza − 1,2 km, compatibilă cu `plin`. Filtrul e folosit de `etalon-gps.mjs` și de C47.
- (b) Constatarea «C22 zi aleasă»: abatere, fără realinierea hărții.
- (c) «G1 orice poartă»: mediana pe orice poartă, ca diagnostic separat.
- (d) **E1:** fiecare linie cu C47 <60 % sau cu variante nerezolvate are nevoie de steagul `diagnostic` în `schelet-ideal.json` al sursei, sau de o explicație `E1` în registru. Altfel e blocant, iar `valid_pentru_export` cere zero blocante.
- (e) **X2:** registrul pe alt sha → raportul cere re-semnarea pe sha-ul sursei.

### Rularea v4.1 pe `drax/date` și probele

Rularea: `/home/verif/verificator/rulari/drax-v4.1-1790464013`, adusă în `rulari/drax-v4.1/`.

**Probe:**

| Probă | Rezultat |
|---|---|
| C4 sintetică (`proba.mjs c4`) | pe dispozitiv: blocant (ora s1 tur 06:20 → 06:40 / 06:00); vechea logică lunga/scurta: nicio diferență (defectul reprodus); fără `dev`: NEDETERMINAT — **ok** |
| C2, link simbolic | `verif` plantează în `diag-out/` legături spre un martor al lui root și spre `poarta.mjs`; scrierile scriptului prin ele și direct în `cod/` dau toate EACCES; martorul și `poarta.mjs` au md5 neschimbat; `verif` nu poate crea în `diag-cod/`; o sursă în `/tmp` e refuzată (cod 2) — **ok** |
| Probele vechi | toate ok: `mv` ca `verif` refuzat; candidat fără `GATA` (dosar gol) cod 2; R1; registrul; «INCHIS ok»; poarta fără sursă 2, `export`/`write` 3, `POARTA_VERDICT` din afara `rulari/` 2, verdict alterat 3, verdict corupt 3 |

**Blocante: 14.**
- **G1, 5 linii:**
  - Usurei 40 / 37,4 — corecție directă;
  - Zarojeni 28,9 / 30,7 — diagnostic;
  - Catranic: după filtrul de urmă ruptă rămân **2 < 3 zile bune**, deci etalon nedeterminat (ca în dezbatere);
  - Sturzovca 24,9 / 46,5 — diagnostic;
  - Bocancea Schit 54,5 / 46,2 — diagnostic.
- **C4, 3 linii, NEDETERMINAT:**
  - R16 Vărvăreuca (350KAJ, 4 zile; marginile: zile bune 35 → 28);
  - R12 Pelinia (880RNK, 10 zile);
  - R12 Sofia (880RNK, 3 zile).
  Pe R12 marginile nu arată diferențe, dar variantele pe dispozitiv nu se pot construi fără `dev`.
- **E1, 6 linii fără steag:** Nihoreni (C47 58 %), Mihăileni (variante 58 / 54,8), Zarojeni, Sturzovca (variante 46,5 / 24,1), Trifănești, Bocancea Schit.

**Alte cifre:**
- **C22:** 4 linii (Mihăileni, Catranic, Hiliuți, Sturzovca).
- **C47:** 2.034/2.352 (86,5 %); 153 de picioare pe cealaltă poartă, 8 cu urmă ruptă.
- **G1 total:** km/zi GPS completat 5.818, față de card 5.843.
- **Regresia scriptului:** 17/17 (K5 așteaptă acum blocant — NEDETERMINAT).

### Rămas neclar

- **Filtrul de urmă ruptă prinde doar 8 picioare** în C47, nu 39 ca în diagnosticul verificării 1. Motivul: limita compatibilă scade raza porții și apropierea de 1,2 km, iar diagnosticul folosea centrul porții, conform criticii Codex. Pe Bocancea, etalonul rămâne 46,2, nu ~48,6. Pe Catranic, perechea ruptă cade, deci etalonul devine nedeterminat.
- **C4 blochează pe 880RNK / 350KAJ până când lanțul păstrează `dev`.** Singura ieșire fără corecția de lanț e o explicație `C4` în registru (decizia sesiunii).
- **`ideal-v2` are marcajul `GATA`** (mtime 26.09 22:35). La prima rulare de azi, proba «candidat fără GATA» a rulat pe `ideal-v2`, cu doar citire pe copii. A rezultat `rulari/drax-v4.1-1790463840`: sigilat, neînchis, deci poarta îl respinge; nu e verificarea 2. Proba folosește acum un dosar gol. Verificarea 2 o pornește sesiunea.
