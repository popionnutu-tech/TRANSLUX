# Scheletul ideal al rutelor Drăxlmaier Bălți (după ION-45)

Plan scris pe 25.09.2026 în Plan Mode, după procedura `plan-mode-review`. Fișierul planului e cel impus de Plan Mode
(`~/.claude/plans/shimmering-yawning-papert.md`); după aprobare se copiază în `docs/plans/2026-09-25-drax-schelet-ideal.md`.
**Versiunea 5** (după revizorii Claude rundele 1–4 și criticul Codex rundele 1–3 — vezi tabelele de triaj la sfârșit).

## Gate (25.09, după cele trei runde)

| Partea | Scor | critical/high deschise |
|---|---|---|
| Claude — minimul revizorilor pe v4 (business 5.5 · senior-backend 8.0 · scalability 10.0 pe v2) | 5.5 | 0 (B24, singurul high pe v4, e acceptat și corectat în v5; corecția nu a mai fost re-revizuită — a patra rundă e interzisă) |
| Codex — critic extern, runda 3 pe v4 | 9.5 | 0 (verdict pass) |

Istoric: Codex 0.0 (r1, 3 high) → 7.0 (r2, 1 high) → 9.5 (r3, pass). Claude business −2.5 → 0.5 → 4.0 → 5.5; senior 0.7 → 2.0 → 1.5 → 8.0;
scalability 3.0 → 10.0. Punctul slab rămas: mecanica loturilor și `ture/zi` au fost corectate de trei ori la rând; executorul
trebuie să respecte literal pașii 2, 4 și 5, iar verificarea 2 (ancorele R4 = 2, R1/R6/R8 = 1) e proba lor.

## De ce

Ion, 25.09: «să identificăm scheletele ideale la Drăxlmaier; ca bază GPS pe 100 de zile, dar fără august și fără
ultimele două săptămâni din iulie, și actul de primire-predare `Solicirate KW24 copy.xlsx`».

Scheletul livrat la ION-45 (24.09) e etalonul REAL: rută × linie × schimb × mașină, tur și retur separate, cu gol, pe
13.04–20.07. Ion vrea acum idealul, așa cum s-a făcut la Florești (ziua aleasă din toate zilele, satele din act
verificate, fără gol) și la mejgorod (un singur drum pe rută, tur = retur).

Clarificarea lui Ion (25.09, cuvânt cu cuvânt): «la DRA e un pic mai complex: ei au 2 ture care se schimbă, una
dimineața și a doua jumătate de zi, ele se schimbă cu locurile, și mai sunt o parte de oameni care apar uneori seara și
uneori dimineața, aceștia sunt Z, dar traseele sunt unice; în așa context pentru crearea scheletului de rute folosim ce
avem și 2 ture, variabila de oameni care apare într-o tură sau alta — oricum sunt pe aceleași schelete».
Concluzia: **unitatea scheletului e rută × linie** (linie = «Starting point» din act), un singur drum, indiferent de
tură, de rotația săptămânală și de mașină. Coloanele «I - EZ» / «II - D» din act sunt grupurile de oameni duse de
autobuzul I (E+Z) și II (D); nu schimbă drumul, rămân doar etichete pe pagină. Numărul de ture pe zi al unei linii NU e
fix: pe liniile cu o singură grupă (34 din 51) mașina apare cam jumătate din zile dimineața și jumătate după-amiaza
(rotația), deci o singură pereche tur/retur pe zi; pe liniile cu ambele grupe, două (vezi faptul din tabel).

Deciziile lui Ion (25.09, AskUserQuestion):
1. Fereastra = **100 de zile păstrate**: 04.05–17.07 + 01.09–25.09.2026 (se exclude 18.07–31.08).
2. Idealul = **ca la Florești + mejgorod**: un drum pe linie, tur = retur; ziua desenată trece prin toate satele
   «regulate» din act; fără gol în schelet; **km-ul din act nu se ia**, doar rutele și satele.
3. Livrarea = **doar pagină artefact**, ca la ION-45; codul și datele rămân pe VPS `/root/lde-worker/drax/`.

## Ce facem

**Decizia:** lanț nou `drax/cod/ideal/` (copii ale scripturilor ION-45 + `alege.mjs` din Florești), cu intrări/ieșiri
proprii (`*-ideal.json`), ca ION-45 să rămână reproductibil. Perechile tur/retur se fac pe schimb (așa cum sunt
cursele), apoi se strâng pe rută × linie. Idealul unei linii = **turul zilei alese** (tăietura capăt → poartă pe urma
brută, apoi Valhalla + ancorarea la poarta cursei), **returul = oglinda lui**, **km = mediana pe URMĂ** a tururilor și
retururilor din zilele bune ale liniei, cu prioritate septembrie. Satele regulate se numără din opririle deja
extrase (cu coordonate) în cursele liniei, pe aceleași zile ca etalonul. Km/zi = 2 × km × ture/zi observate.

Variante respinse:
- *Tronsoane sat → sat din ambele sensuri (mejgorod `ideal.mjs`).* Acolo era necesar pentru că niciun șofer nu făcea tot
  drumul. La Drăxlmaier 159 din 164 perechi tur/retur ies sub 10 % (etalon.log ION-45), deci cursa întreagă există în
  fiecare zi; tronsoanele ar adăuga ordinea satelor pe șosea, pe care actul n-o dă, fără câștig.
- *Etalonul real refăcut pe fereastra nouă (metoda ION-45).* Respins de Ion: vrea idealul, nu realul cu gol.
- *Scheletul din act, verificat pe GPS.* Respins de Ion (opțiunea a treia); actul are sate de tranzit neatinse niciodată
  (Hasnasenii Noi, Putinesti, Iabloana) și km peste drumul real (mediana 0,81 la ION-45).

## 🔬 Verificat pe viu

| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Actul «copy» e altul decât cel de la ION-45 | `md5` pe cele două fișiere din `.orca/drops` | Identice (1baea6f4…); `drax/date/nomenclator.json` = 39 rute, **51 linii** cu Starting point (`grep -c start`); 34 linii au o singură grupă în act (`autobuze` EZ 1/D 0 sau 0/1), 17 amândouă | Nu se reface nomenclatorul; ținta e 51 |
| Tracker-ul are date în mai și septembrie pentru autobuzele Drăxlmaier | `drax-zile.mjs` pe VPS, porți EST/VEST, pe lună | Autobuzele din listă: martie 22–25 zile la poartă, iulie 17–23, **august 9–12**, septembrie 19–21; mașini cu 0 zile în sept.: 506WDW, 683TWK, 412BRAY, 748IZX, 2519; cu 0 în iulie dar 19–25 în sept.: 759LYY, 144BRAZ, 2515 | Fereastra lui Ion e justificată de GPS; flota se reidentifică pe fereastra nouă; septembrie dă etalonul |
| O linie face 4 curse pe zi (ION-45) | `drax/etalon.log` ION-45 (zile pe schimb, pe mașină) | R1 Donduseni 346KAJ: s1 în 25 de zile, s2 în 31 (act: doar D); R8 Costești 345KAJ 31/32 (doar D); R6 917FTI 30/30 (doar EZ); R4 Grinăuți 748IZX 65/64 (EZ + D) | Pe liniile cu o grupă e o pereche tur/retur pe zi (rotație săptămânală), pe cele cu două grupe două perechi → `ture/zi` se măsoară, nu se presupune |
| `afara` (curse în afara `FER`) e mic pe fereastra unde `FER` a fost învățat | `drax/etalon.log:54` ION-45 | «curse cu sens și schimb 9310 · fără rută/capăt 9675 · în afara ferestrelor 12457» — `afara` se numără ÎNAINTE de `alege`, pe toate cursele flotei care ating poarta (`etalon.mjs:100-106`), deci ~40 % și pe fereastra de învățare | Poarta `FER` nu poate fi un prag absolut; se măsoară pe cursele cu rută și relativ la mai–iulie |
| Extragerea curselor pe 100 de zile încape în timp și memorie | `drax/curse.log` + mtime `curse.json` | ION-45: 49 mașini, 25.656 curse, **38 min** (00:36 → 01:14), `curse.json` 18 MB; VPS 2 CPU, 3 GB RAM; o interogare bbox pe 7 luni dintr-un proces a dat OOM la 2 GB heap | `EXCLUS` se pune în SQL pe AMBELE interogări `track` (`curse.mjs:53-54` flota pe poartă, `curse.mjs:79-80` urma pe mașină), deci rândurile citite = 100 de zile, ca la ION-45; un singur proces, `nice`, `nohup` |
| Parametrii interogărilor din `curse.mjs` | `curse.mjs:54` `[FROM, TO]`, `curse.mjs:80` `[d.id, FROM, TO]` | flota: `$1/$2`; pe mașină: `$1` id, `$2/$3` FROM/TO | `EXCLUS` = `$3/$4` la flotă, **`$4/$5`** pe mașină |
| Opririle din curse au ce trebuie pentru satele regulate | `curse.mjs:22,113-125` | `opr` = `{n, km}`: `n` = locul din index la ≤0,8 km (`R_OPR`), criteriul <15 km/h ≥20 s cu minim <8; punctul `p` cu lat/lon există la `:117`, dar nu se scrie; `apr` are `id` de țintă și `km` | Se adaugă `lat, lon` pe oprire la extracție; potrivirea sat ↔ oprire pe ținta rutei (id + coordonate), nu pe nume |
| Țintele extracției acoperă capetele cu alias | `curse.mjs:39-41` (fără `ALIAS`), `etalon.mjs:27-29` (`ALIAS`), `apr-extra.mjs:1-3`, `etalon.log` R6 «Mihăileni (382 atingeri)» | La ION-45 Mihăileni (R6) a fost adăugat după extracție cu `apr-extra`; starturile R6 «Mihailenii Vechi» și R11 «Funduri Vechi» + sate din R13/16/18/19/24/29/33 au alias | `ALIAS` intră în țintele lui `cod/ideal/curse.mjs` de la extracție |
| Plăcuța dispozitivului | `curse.mjs:30-34` (`canon`, `ePlaca`, `placaDev`: CarName întâi) + memoria `drax-schelet-rute` | Dispozitivul cu CarName 041BRAU → 041BRAU; 2332 (CarName 320BRAT, RegNo 041BRAU) → 320BRAT (autobuz LEAR, tranzit); 2477 → 826GXP; 350KAJ = două dispozitive (2240 până în iunie, 2284 din iunie) → `#2284` | `fix-350` se reaplică pe ieșirea nouă; `fix-041` NU e necesar (repara un relabel greșit, nu extracția) — se verifică în log |
| Aceeași linie e servită de două mașini în același schimb | `etalon.log:102-114` ION-45 | R9 Cobani: 397VKV (20 zile s1, 14 s2) și 447ASB (7 s1, 36 s2) | Cheia candidatelor include mașina |
| Cursa folosește porți diferite pe sensuri | `etalon.log:102,112` ION-45; `etalon.mjs:119` (`poarta` = `pOut`/`pIn`) | 397VKV pe R9: tur la VEST, retur de la EST; porțile sunt la ~2,4 km una de alta | Ancorarea se face la poarta cursei, pe fiecare sens |
| Pasul Valhalla încape în timp | mtime `etalon.json` 01:14:20 → `schelet.json` 01:22:56, `schelet.log` | ION-45: 164 linii×schimburi × până la 5 zile × 2 sensuri = **8,5 min**; `schelet.json` 3,4 MB (plin+gol pe ziua aleasă) | 51 linii × 8 zile × 2 sensuri ≈ 816 tăieri, doar `plin` → ~5 min pe lot; `schelet-cand.json` ≈ 4–5 MB pe lot |
| Cron-urile de pe VPS cu care nu ne suprapunem | `crontab -l` | `run-nightly.sh` 03:00; `tomberon-sync` */10 5–23; `trip-live` */5; `bus-live` * * (flock); `lear-saptamanal.sh` luni 08:00 | Extragerea se pornește seara sau după 04:00, cu `nice -n 10`, un singur proces |
| Uzina și porțile în bază | Supabase `lde_uzine`, `lde_uzine_gates` | `DRAXELMAIER_BALTI`, schimburi 07:00–15:30 / 15:30–00:00, 39 rute active, porți EST 47.78513/27.94307 r 0,6 și VEST 47.77408/27.91593 r 0,5; `reguli_livrare` NULL | Aceleași porți ca în `curse.mjs`; nu se atinge baza |
| Codul de reutilizat există pe VPS | `ls floresti/cod mejgorod/cod` | `floresti/cod/{verif,puncte,alege,compact,ancoreaza}.mjs`, `mejgorod/cod/ideal.mjs`; `drax/cod/*` de la ION-45 | Se copiază și se adaptează, nu se scrie de la zero |
| Valhalla e sus | `curl localhost:8002/status` | 3.5.1, `trace_route` disponibil | Map-matching pe zilele candidate |
| Criticul extern e disponibil | `which codex`, `codex login status`, `sync-agents-md.sh --check` | codex prezent, «Logged in using ChatGPT», AGENTS.md sincron | Rundele Codex pot rula |
| Scheletul ar intra în LDE | `apps/admin/src/app/(dashboard)/lde/schelet/page.tsx:21-32` | LDE citește fișiere fixe din `public/lde/` (lear, sebn, floresti, mejgorod); Drăxlmaier nu e nicăieri; ION-67 (nemerjuit) adaugă fila «Toate rutele» cu 4 rețele fixe | Ion a ales artefact, deci **nimic în repo**; dacă mai târziu vrea LDE, e un client nou + intrare în `construiesteToate` |

**Neverificat 1 — ferestrele de ore `FER` pe septembrie.** `FER` (`etalon.mjs:32`) a fost învățat pe 13.04–20.07 (sosire
~06:43, schimbul ~15:49, ieșire ~00:07). Histograma orelor pe septembrie n-a putut fi luată acum (două încercări de
interogare pe tracker au fost blocate de hook-ul anti-exfiltrare la citirea `.env`). **Cale de rezervă obligatorie:
pasul 2a**, cu poartă RELATIVĂ măsurată pe cursele cu rută (vezi pasul).

**Neverificat 2 — liniile din act fără urmă la ION-45** (Hasnasenii Noi R13, Putinesti R18, Iabloana R27) pot apărea în
septembrie. Cale de rezervă: rămân în pagină cu steag «fără urmă în fereastră».

## Pași

0. **Tichet.** `ticket.md` se scrie în scratchpad după `~/dev/task-pipeline/templates/ticket.md` (cu deciziile de mai sus,
   secțiunea «Чем проверять» = lista din «Verificare»), apoi
   `tp create "Scheletul ideal Drăxlmaier (rută × linie, tur = retur, 04.05–17.07 + 01.09–25.09)" -F ticket.md --repo translux`
   și `tp new ION-N`. Rezultat: tichet In Progress, dereva cu `.tp/BRIEF.md`. ION-45 rămâne cum e; tichetul nou îl citează.

1. **Curse pe fereastra nouă** — `cod/ideal/curse.mjs` (copie a `cod/curse.mjs`; căile relative din copie devin
   `../../date/…`, `../../.env` — se verifică cu `ls` înainte de rulare), în primele rânduri constantele
   `FROM='2026-05-04'`, `TO='2026-09-26'`, `EXCLUS=['2026-07-18','2026-09-01']`, `OUT='../../date/curse-ideal.json'`,
   `FLOTA='../../date/flota-ideal.json'`.
   - `EXCLUS` intră ca text UTC (fără `Date`) în AMBELE interogări `track`, ca `AND NOT (w_date >= $a AND w_date < $b)`:
     la flotă (`curse.mjs:54`, parametri `[FROM, TO, EX0, EX1]`) e `$3/$4`; pe mașină (`curse.mjs:80`, parametri
     `[d.id, FROM, TO, EX0, EX1]`) e **`$4/$5`**. Proba: rulare cu `--doar=346KAJ` înaintea extragerii complete; în log,
     prima/ultima zi și zilele pe lună ale mașinii.
   - Țintele (`curse.mjs:39-41`) se construiesc cu `kk` = `cur` + `ALIAS` copiat din `etalon.mjs:27-29`, ca Mihăileni
     (R6), Fundurii Vechi (R11) și celelalte nume cu alias să fie ținte de la extracție. Log: «nume fără loc în index: —».
   - Fiecare oprire `opr` primește și `lat, lon` = punctul cu viteza minimă (`vmin`) din fereastra opririi (aceeași
     variabilă `v` de la `curse.mjs:117-119`), pe lângă `n, km`.
   - «Nume fără loc în index» se numără pe grup: numele din nomenclator lipsește doar dacă NICIO formă din `kk(nume)`
     (nume + alias) n-are loc în index (`curse.mjs:42` numără acum fiecare formă separat).
   - Cursa se taie și la un gol de peste 2 h între puncte: testul `P[i].t − P[i−1].t > 2 h` stă PRIMUL în buclă
     (înaintea ramurii porții de la `curse.mjs:88-89`), urmat de `inchide(false, null); odihna = null`.
   - `process.argv[2]/[3]` (`curse.mjs:17`) se scot: `FROM/TO` sunt constante, altfel `--doar=…` ar ajunge în `FROM`.
   - `FLOTA` se scrie DOAR de o rulare fără `--doar`, nefiltrată, imediat după linia «N mașini» (înaintea buclei pe
     mașini). `--doar=<mașini>` citește `FLOTA` (nu reface interogarea porților; o mașină absentă din `FLOTA` = eroare și
     oprire), citește `OUT` dacă există, altfel pornește de la `{tinte, curse: [], zilePoarta: {}}`, înlocuiește doar
     mașinile date și scrie `FROM/TO/EXCLUS` ale rulării curente. Proba `--doar=346KAJ` se rulează cu `--flota-proba`
     (identifică flota în memorie, nu scrie `FLOTA`).
   - Lansare: `ssh … 'cd /root/lde-worker/drax/cod/ideal && nohup nice -n 10 sh -c "node --env-file=../../.env curse.mjs > ../../curse-ideal.log 2>&1; echo EXIT \$? >> ../../curse-ideal.log" </dev/null >/dev/null 2>&1 &'`,
     seara sau după 04:00; o singură verificare ssh după ~45 min (`tail -3 curse-ideal.log`, `dmesg | grep -i oom | tail -1`).
   - Cădere: `EXIT ≠ 0` după linia «N mașini» → loturi de mașini cu `--doar` (fereastra întreagă, `FLOTA` refolosită);
     cădere ÎNAINTE de «N mașini» (interogarea porților) → interogarea porților se împarte pe cele două intervale reale
     și se contopește (`stat` e pe zile distincte).
   Rezultat: `curse-ideal.log` cu nr. mașini, nr. curse; pe mașină prima/ultima zi, zile în mai–iulie și în septembrie;
   nicio zi din 18.07–31.08; nicio cursă cu `t0` înainte de 18.07 și `t1` după 31.08.
   1b. **Dublurile** — `cod/ideal/fix-350.mjs` (copie cu `OUT`) unește `350KAJ#2284` în `350KAJ`; apoi
   `cod/ideal/fix-dubluri.mjs` (nou, ~40 rânduri): două plăci cu ≥80 % din curse care coincid (aceeași `zi`, |Δt0| ≤ 3 min,
   |Δkm| ≤ 1) sunt același autobuz cu două dispozitive și se unesc sub placa reală (cea care e plăcuță, nu IMEI) —
   cazul cunoscut: `0357544371228442` = 880RNK (`etalon.log:147-171` ION-45: aceleași zile, km și ore pe R12 Pelinia și
   Sofia). Faptul se scrie în log. Verificare: nicio mașină cu `#` și niciun IMEI în `curse-ideal.json`; 041BRAU prezent
   cu dispozitivul al cărui CarName e 041BRAU; 320BRAT (dacă apare) e 2332.

2. **Perechi pe schimb, candidate pe linie** — `cod/ideal/etalon.mjs`: `IN=curse-ideal.json`, ieșiri `etalon-ideal.json`
   + `obs-ideal.json`. Împerecherea tur/retur rămâne pe `ruta|linie|schimb|masina|zi` (`pune`, `etalon.mjs:98`
   neschimbat), capătul liniei ca la ION-45 (Starting point, omonime după al doilea sat, `R_CAPAT_CURSA` 2,5 km, linia
   `*` pentru mașina din grafic fără start atins). Apoi perechile se strâng pe `ruta|linie`: fiecare pereche
   (schimb, mașină) dintr-o zi e o observație. **Candidată** = pereche cu tur ȘI retur la capăt, diferență pe km bruți
   ≤25 % (`etalon.mjs:136`). Nu se calculează etalonul aici. Candidatele se ordonează: septembrie întâi, apoi
   descrescător după dată; se păstrează toate. `obs-ideal.json` = `{ afara: {luna: {cuRuta, afara}}, curse: [...] }`,
   unde fiecare cursă cu rută e `{m, zi, schimb, sens, ruta, linie, t0, t1, ora, kmCap (= a.km, etalon.mjs:108-113),
   plin, rt, poarta, opr}`; **cursele cu rută și capăt aflate în afara `FER`** intră și ele, cu `schimb: null`,
   `afara: true` și `ora` (ora locală a sosirii turului / plecării returului) — `etalon.mjs:104-106` le arunca înainte
   de `pune`. Perechile, candidatele, `ture/zi` și pasul 3 folosesc doar `schimb != null`.
   **`ture/zi`** pe linie, calculat pentru DOUĂ surse (`sept` = zile din 01–25.09, `toate`): o mașină intră în
   numărătoare doar dacă (linie, schimb, mașină) are în sursă cel puțin 3 zile cu AMBELE sensuri (servește linia, nu
   trece prin ea — `etalon.log:255` R19: 412BRAY 23 zile doar tur); pentru aceste mașini, într-o zi se numără perechile
   distincte (schimb, mașină), inclusiv cele cu un singur sens, dar observațiile din aceeași zi, același schimb și
   același sens cu |Δt0| ≤ 3 min se numără O SINGURĂ dată (plasă contra dispozitivelor duble); `ture/zi[sursa]` =
   mediana pe zilele sursei cu cel puțin o pereche, rotunjită la întreg. Se scrie `tureZi: {sept, toate}` pe linie;
   dacă o sursă n-are nicio mașină calificată, valoarea ei e `null` (nu 0).
   Rezultat: `etalon.log` cu 51 linii din act + liniile `*`: zile candidate (distincte, pe lună), `tureZi`, mașini;
   `afara` pe lună, numărat DOAR pe cursele cărora `alege(c, sens)` le dă rută și capăt.
   2a. **Poarta `FER`** — `cod/ideal/ore.mjs` (nou, ~50 rânduri): din `obs-ideal.json` (câmpul `afara` + TOATE cursele
   cu rută, inclusiv `schimb: null`), pe lună (mai, iunie, iulie, septembrie) și pe SENS: histograma orei locale (UTC+3)
   a sosirii turului (`t1`) și plecării returului (`t0`), în trepte de 15 min, cu ponderea curselor la <30 min de
   marginile `FER`. Se reînvață `FER` dacă (a) `afara`% septembrie − mediana `afara`% mai–iulie > 10 puncte, SAU (b)
   modurile histogramei din septembrie (vârful dimineții 03–10 pentru tur s1, vârful nopții 21–03 pentru retur s2, pe
   toate cursele cu rută, nu doar cele din fereastră) se abat cu peste 30 min de la modurile ACELEIAȘI rulări pe
   mai–iulie (referința se măsoară, nu se ia din comentariul `etalon.mjs:8`; la ION-45 mediana sosirii tur s1 era ~06:12
   și a plecării retur s2 ~00:17). Reînvățarea, ca regulă: fiecare fereastră se DEPLASEAZĂ cu (vârf sept. − vârf
   mai–iulie), păstrând lățimea și asimetria de acum (`etalon.mjs:32`); se scrie în `cod/ideal/etalon.mjs` și în raport;
   apoi pasul 2 se rulează din nou.

3. **Satele regulate** — `cod/ideal/verif.mjs` (nou, după `floresti/cod/verif.mjs`), fără recitirea tracker-ului, din
   `obs-ideal.json`: «partea cu oameni» = opririle cu `opr.km ≥ kmCap − 0,8` la tur și `≤ kmCap + 0,8` la retur (`R_OPR`);
   satul capătului se consideră atins prin tăietură. Oprire în sat = distanța (`lat, lon`) până la ținta rutei
   (`D.tinte`, id + coordonate, numele prin `kk`/`ALIAS`) ≤1,2 km; locurile la <2 km de porți (Bălți) sunt neutre.
   Se calculează pentru DOUĂ surse, `sept` (zile din 01–25.09) și `toate`, și pe SENS (tur / retur), pe fiecare linie:
   `regulate[sursa][sens]` = sate din actul rutei cu oprire în ≥50 % din cursele liniei pe acel sens; `inPlus` = sate din
   index cu oprire ≥25 % dar absente din act; `panaInIulie` = regulate în `toate` dar nu în `sept`. Satele din act sunt
   pe RUTĂ: «lipsește» se judecă pe rută (0 % pe toate liniile și ambele sensuri); pe linie se afișează satele atinse
   ≥25 % (pagina desenează turul, deci arată `regulate[·][tur]`).
   Rezultat: `regulate-ideal.json` (pe linie × sursă × sens); listă în log a satelor din act cu 0 % pe rută.

4. **Urmele candidatelor, pe loturi** — `cod/ideal/schelet.mjs`: pentru fiecare linie, lotul curent de 8 candidate în
   ordinea din pasul 2 (fiecare cu mașina ei), tur și retur tăiate la capăt / poartă pe urma brută (`taie`,
   `schelet.mjs:119-135`, parametri `utc()`), Valhalla `trace_route` doar pentru `plin`, ancorarea capătului dinspre
   poartă **la poarta cursei** (`poarta` din candidată: tur = `pOut`, retur = `pIn`; `ancoreaza` din Florești cu poarta ca
   parametru). Se scriu doar candidatele la care urma ajunge la capăt, cheie **`ruta|linie|zi|schimb|m`**, prin ÎMBINARE
   în `schelet-cand.json` (nu suprascriere); fișierul ține și lista `incercate` (aceeași cheie + motivul `faraUrma` /
   `nuAjunge`), iar «nedesenat» = absent din `incercate`. `--doar=<ruta|linie,…>` desenează doar liniile date și tot
   îmbină; `--lot=N` ia următoarele 8 candidate neîncercate ale liniei: loturile 0 și 1 din septembrie (rămase), **lotul 2
   e rezervat pentru mai–iulie** (descrescător după dată), ca liniile cu ~40 de candidate în septembrie să ajungă la
   sursa `toate`. Plafonul: 3 loturi = 24 de candidate distincte încercate.
   Rezultat: `schelet-cand.json`; `ls -la` înainte și după fiecare lot — creșterea pe lot ≤10 MB și totalul ≤30 MB
   (peste → se oprește și se raportează; lotul rămâne de 8).

5. **Alegerea zilei și idealul** — `cod/ideal/alege.mjs` (după `floresti/cod/alege.mjs`), pe linie, sursa se hotărăște
   O SINGURĂ DATĂ aici, cu lista de sate a aceleiași surse:
   (1) `sept`: zile bune = candidate cu urmă din septembrie la care tur și retur pe urmă diferă ≤18 %, turul trece
   (≤1,2 km) prin toate satele `regulate[sept][tur]` și returul prin `regulate[sept][retur]`; dacă ≥3 → `sursa='sept'`.
   (2) altfel, linia intră în `deCompletat` = linii cu <3 zile bune în `sept` după lotul curent ȘI cu candidate
   nedesenate (din septembrie sau din mai–iulie); pasul 4 se rulează din nou cu `--lot=N+1` doar pentru ele (până la 3
   loturi = 24 candidate pe linie, sau până se epuizează), apoi `alege` din nou.
   (3) după ce candidatele din mai–iulie sunt desenate sau epuizate, SAU plafonul de 3 loturi e atins: același calcul cu
   `toate` și `regulate[toate][·]`; `sursa='toate'` se acceptă DOAR cu ≥3 zile bune (pagina scrie sursa efectivă și
   numărul de zile).
   (4) **etalon = mediana km-ilor pe urmă** (tururi + retururi) ale zilelor bune ale sursei.
   (5) ziua aleasă: dintre zilele bune cu `|tur − etalon| ≤ 5 %`, cea cu cele mai multe opriri reale în satele din act,
   apoi tur ≈ retur; dacă niciuna nu e în ±5 %, cea mai apropiată de etalon, marcată `departeDeEtalon` (listată separat).
   (6) **fallback `asim`** (ca `schelet.mjs:150-154`), abia după (1)–(3): linie fără 3 zile bune în nicio sursă, dar cu
   candidate cu urmă la capăt care trec satele regulate ale sursei cu mai multe candidate → ziua cu diferența tur/retur
   minimă, marcată `asim`; `sursa` = cea în care s-a găsit ziua; **`km` = km-ul turului desenat** (idealul e turul);
   intră în controlul (c), nu în (a).
   Idealul: `drum` = turul zilei alese, `km` = etalonul (sau turul, la `asim`), retur = același drum;
   `ture/zi` = `tureZi[sursa]` din pasul 2; dacă e `null`, se ia `tureZi.toate` cu steagul `tureZiDinToate`; dacă și
   acela e `null`, se ia EZ + D din act cu steagul `tureZiDinAct` (ambele apar la (k)); **`kmZi = 2 × km × ture/zi`**.
   Linia `*` intră în schelet și în total DOAR
   dacă ruta ei n-are nicio linie din act cu ideal; altfel e informativă. Se păstrează
   `real: {tur, retur, dif, zi, poarta, masini: [{m, zile}]}`.
   Rezultat: `schelet-ideal.json`; log cu linii «toate condițiile» / `departeDeEtalon` / `asim` / fără ideal / `deCompletat`.

6. **Control pe toată flota** (memoria `analiza-verifica-toata-flota`) — `cod/ideal/control.mjs`: (a) linie din act fără
   ideal după toate loturile; (b) linie cu `sursa='toate'`; (c) tur/retur real >18 % sau `asim`; (c2) mediana s1 și s2
   ale aceleiași linii diferă >18 %; (d) sat din act cu 0 % pe rută (în sursa liniei); (e) `inPlus` ≥25 %; (f) aceeași
   cursă (`m|zi|schimb|sens|t0`) pe două linii, SAU aceeași cursă (`zi|schimb|sens`, |Δt0| ≤ 3 min, |Δkm| ≤ 1) pe aceeași
   linie cu `m` diferit (dispozitiv dublu scăpat de 1b); (g) cursă >140 km; (h) mașină din grafic fără nicio linie;
   (i) linie servită de ≥3 mașini pe fereastră; (j) linie `*` pe o rută care are linie din act; (k) `ture/zi` ≠ EZ + D
   din act, plus steagurile `tureZiDinToate` / `tureZiDinAct`; (l) capăt de linie din act cu 0 atingeri în
   `curse-ideal.json`; (m) linie cu ideal și `!(km > 0)` sau `!(kmZi > 0)` (prinde și `NaN`).
   Rezultat: `control-ideal.log` grupat; (a), (f), (g), (l), (m) blochează publicarea până sunt explicate în raport.

7. **Pagina** — `cod/ideal/pagina.mjs` (după `cod/pagina.mjs`, `OUT=../../schelet-ideal.html`): carduri pe RUTĂ (nr +
   denumirea din act), bloc pe LINIE: capăt, km (un număr, tur = retur), `ture/zi` lângă «I - EZ / II - D» din act, km/zi,
   zile bune (din câte, sursa efectivă), mașinile cu % din zile, ziua desenată, poarta modală, realul («altfel») când
   tur/retur real >18 % sau `asim`; satele actului pe rută ca la Florești (verde oprește / punctat trece / tăiat
   lipsește, cu %), «până în iulie», sate în plus. Harta SVG cu ambele porți și **doar drumul cu oameni**, un drum pe
   linie. Fără gol, fără km din act, fără raport GPS/KW24. Totaluri: linii, km/zi = Σ kmZi. Titlu «Scheletul ideal Drăxlmaier».

8. **Publicare + livrare** — artefact nou (privat, icon «map»); `.tp/report.md` după `templates/report.md` (Ce s-a
   făcut / Cu ce s-a verificat / Ce e nevoie de la owner — inclusiv liniile cu `ture/zi` ≠ act și satele cu 0 %);
   `tp handoff ION-N -F .tp/report.md` (va refuza fără commit → `tp comment ION-N -F .tp/report.md` + `tp comment ION-N -F .tp/fact.md`
   cu `<!-- tp:fact kind=manual by=claude -->`, ca la ION-45/55; tichetul rămâne In Progress). Memoria
   `drax-schelet-rute.md` primește secțiunea «Idealul», clarificarea despre ture/Z și I-EZ/II-D, și corecția «4 curse/zi».

## Fișiere

Toate pe VPS `root@217.26.149.23:/root/lde-worker/drax/` (scp din scratchpad, apoi ssh; nu se pollează ssh în buclă —
fail2ban). Codul ION-45 (`cod/*.mjs`) și ieșirile lui (`date/{curse,etalon,schelet}.json`, `schelet.html`) rămân neatinse.
Nimic în repo în afară de `.tp/` din dereva tichetului.

| Fișier | Ce se schimbă |
|---|---|
| `cod/ideal/curse.mjs` | copie; `FROM/TO/EXCLUS/OUT/FLOTA`; `EXCLUS` `$3/$4` și `$4/$5`; ținte cu `ALIAS`; `lat,lon` pe opriri; tăiere la gol >2 h; `--doar` pe `OUT`/`FLOTA` |
| `cod/ideal/fix-350.mjs`, `cod/ideal/fix-dubluri.mjs` | copie cu `OUT=curse-ideal.json`; nou: unește plăcile cu curse identice (IMEI → placă) |
| `cod/ideal/etalon.mjs` | copie; perechi pe schimb, candidate pe `ruta|linie`, `ture/zi`, `afara` după `alege`, `obs-ideal.json` |
| `cod/ideal/ore.mjs` | nou; histograma orelor pe lună și poarta relativă `FER` |
| `cod/ideal/verif.mjs` | nou, după Florești; regulate/inPlus/panaInIulie pe două surse, din `obs-ideal.json` |
| `cod/ideal/schelet.mjs` | copie; loturi de 8 candidate cu mașina lor, doar `plin`, ancorare la poarta cursei, îmbinare, `--doar`/`--lot` |
| `cod/ideal/alege.mjs` | nou, după Florești; sursa o dată, etalon pe urmă, ziua în ±5 %, `asim`, `deCompletat`, `*` condiționat, `kmZi` |
| `cod/ideal/control.mjs` | copie; verificările (a)–(m) pe noua cheie |
| `cod/ideal/pagina.mjs` | copie; pagina idealului (fără gol/KW24-km) |
| `date/{flota,curse,etalon,obs,regulate,schelet-cand,schelet}-ideal.json`, `schelet-ideal.html`, `curse-ideal.log`, `control-ideal.log` | ieșiri noi |
| repo: `.tp/report.md`, `.tp/fact.md` în dereva `tp new`; scratchpad: `ticket.md` | textele către Linear (doar prin `-F`) |

## Riscuri

- **Extragerea ~40 min pe un VPS cu 3 GB și cron-uri live**: un singur proces, `nice -n 10`, `nohup` cu marcaj `EXIT`,
  pornit seara sau după 04:00 (nu peste `run-nightly` de la 03:00). OOM → loturi de mașini cu `--doar` + `FLOTA`.
- **`FER` pe septembrie** neverificat acum: pasul 2a e poartă relativă, cu regulă de reînvățare scrisă.
- **Flota s-a schimbat între mai și septembrie** (506WDW, 683TWK, 412BRAY, 748IZX, 2519 lipsesc în sept.; 759LYY, 144BRAZ,
  2515 apar): regula «sept. dacă ≥3 zile bune» ține idealul pe situația de acum; (b), (i) arată liniile unde nu s-a
  putut, «până în iulie» arată ce s-a schimbat.
- **Sate din act neatinse** (tranzit): rămân cu steag, nu se inventează capete.
- **Tur ≠ retur pe drumuri diferite** (R16 Vărvăreuca 15 %, R18 Zarojeni 19 % la ION-45): idealul ia turul; `asim` ține
  linia în schelet; (c) o listează; pagina arată realul («altfel»).
- **Două drumuri pe aceeași linie, pe schimburi** (727CWN Sturzovca 37/23 km la ION-45): (c2) o prinde; idealul ia
  septembrie și ziua cu cele mai multe opriri; se spune în raport.
- **`ture/zi` ≠ act**: e o constatare, nu o eroare; (k) o listează, raportul o pune la «Ce e nevoie de la owner».
- **`schelet-cand.json` prea mare**: creșterea pe lot ≤10 MB, total ≤30 MB; peste → oprire și raport (lotul rămâne 8);
  maxim 3 loturi, al treilea rezervat pentru mai–iulie.
- **Dispozitive duble** (880RNK + IMEI la ION-45): 1b le unește; plasa din `ture/zi` (±3 min) și (f) prind ce scapă.
- **Plăcuțe**: `placaDev` (CarName întâi) rămâne; nu se re-etichetează după RegNo-ul altor dispozitive.
- **`tp handoff` fără commit**: cunoscut; raport + fact manual în comentarii.

## Verificare

1. Proba `--doar=346KAJ`: zile numai în 04.05–17.07 și 01.09–25.09. `curse-ideal.log`: `EXIT 0`; pe mașină prima/ultima
   zi, zile mai–iulie și septembrie; nicio zi din 18.07–31.08; nicio cursă peste excludere; nr. mașini ≥ 43 (lista);
   «nume fără loc în index: —»; după 1b nicio plăcuță cu `#`, 041BRAU prezent.
2. `etalon.log`: 51 linii din act + liniile `*`; candidate pe lună, `tureZi {sept, toate}`, mașini; capătul fiecărei
   linii din act cu atingeri > 0 (altfel (l)); `afara` pe lună pe cursele cu rută. Probă pe cazuri cunoscute (din
   `etalon.log` ION-45): R4 Grinăuți → `tureZi.toate` = 2 (748IZX 65/64; în sept. 748IZX lipsește, deci `sept` e al
   altei mașini sau `null`); R1 Dondușeni, R6 Mihăileni, R8 Costești → 1; R12 Pelinia → 2 după 1b (nu 4);
   R19 Bilicenii Vechi = de constatat (830MUM ~27 zile pe schimb).
3. `ore.mjs`: histograma pe lună; decizia poartă (reînvățat / nu) notată.
4. `regulate-ideal.json`: satele din act cu % pe linie, pe ambele surse; lista celor cu 0 % pe rută (de spus lui Ion).
5. `alege`: linii cu ideal ≥ 48 din 51 (cele 3 de tranzit pot rămâne fără) după toate loturile; `sursa='sept'` la ≥80 %;
   `asim` ≤ 5.
6. `control-ideal.log`: zero (a)/(f)/(g)/(l)/(m) neexplicate; (k) listat integral în raport.
7. Pagina: fiecare linie un singur drum, fără gol; pe 3 linii la întâmplare dintre cele «toate condițiile» (nu `asim`,
   nu `departeDeEtalon` — acestea se listează separat în raport): km-ul cardului = lungimea drumului desenat ±5 % și
   drumul trece prin satele verzi; totalul = Σ kmZi; `ture/zi` afișat pe linie.
8. Artefactul publicat privat; raportul în Linear cu cele trei rânduri obligatorii; memoria actualizată.

## Critic extern — runda 3 (Codex, 25.09, ultima) · scor 9.5, verdict PASS (0 high)

| id | sev. | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| C1 (r3) | low | candidatele încercate fără succes nu sunt reținute; loturile le-ar relua | acceptat | pasul 4: lista `incercate` + «nedesenat» = absent din `incercate`; plafon = 24 candidate distincte încercate; = S24 |

## Triaj revizori Claude — runda 4 (v4 → v5)

| id | sev. | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| B24 | high | autobuz cu două dispozitive numărat de două ori (`0357544371228442` = 880RNK, R12: `ture/zi` 4 în loc de 2) | acceptat | pasul 1b `fix-dubluri`; pasul 2 dedup ±3 min; control (f) ramură nouă blocantă; verificarea 2 R12 = 2 |
| B25 | medium | referințele 06:43/00:07 din comentariu, nu măsurate (~06:12/~00:17); «± lățimea» lărgește fereastra | acceptat | pasul 2a: referință = modurile aceleiași rulări pe mai–iulie; fereastra se deplasează păstrând lățimea și asimetria (și nota senior) |
| B26, S24 (sc. 2) | low/medium | plafonul de 3 loturi e consumat de septembrie pe liniile cu două grupe | acceptat | pasul 4: lotul 2 rezervat pentru mai–iulie; pasul 5 (3) «sau plafonul atins» |
| S24 (sc. 1), C1 (r3) | medium/low | candidatele eșuate nu sunt reținute | acceptat | pasul 4: `incercate` |
| B27 | low | ancora R19 = 2 nedovedită | acceptat | verificarea 2: R4 = 2 (`toate`), R1/R6/R8 = 1, R12 = 2, R19 de constatat |
| B28, S26 | low | `tureZi[sursa]` gol → 0 / `NaN` | acceptat | pasul 2: `null`; pasul 5: `tureZi.toate` → EZ + D din act cu steag; (m) `!(kmZi > 0)` |
| S25 | low | «Riscuri» și tabelul «Fișiere» contrazic pasul 4 și 6 | acceptat | aliniate |

Scoruri v4: business-logic 5.5 (1 high: B24), senior-backend 8.0 (0), Codex 9.5 (0, pass). v5 închide toate prin
corecție; v5 nu mai e re-revizuită (limita de trei runde).

## Critic extern — runda 2 (Codex, 25.09) · scor 7.0, verdict fail (1 high)

| id | sev. | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| C1 (r2) | high | `deCompletat` doar pentru linii fără urmă; urmele neeligibile (ratează un sat) nu cer loturile următoare | acceptat | pasul 5 (2): `deCompletat` = <3 zile bune în `sept` ȘI candidate nedesenate; loturile continuă până la 24 candidate; = B21, S18 |
| C2 (r2) | low | etalonul pentru `asim` nedefinit (mediana pe listă goală = 0) | acceptat | pasul 5 (6): `asim` după (1)–(3), `km` = turul desenat; control (m) `km ≤ 0`; = B22, S19 |

## Triaj revizori Claude — runda 3 (v3 → v4)

| id | sev. | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| B18 | high | `ture/zi` numără și mașinile în tranzit cu un singur sens (R19: 412BRAY 23 zile doar tur) | acceptat | pasul 2: mașina intră doar cu ≥3 zile cu ambele sensuri pe (linie, schimb); mediana rotunjită; verificarea 2 cu R19/R4 = 2, R1/R6/R8 = 1 |
| B19, S17 | medium/high | `ture/zi` «pe zilele sursei» calculat înainte ca sursa să existe | acceptat | pasul 2: `tureZi {sept, toate}`; pasul 5: `tureZi[sursa]` |
| B20, S16 | medium/high | histograma din `obs-ideal.json` e tăiată de `FER` (cursele din afară nu ajung acolo) | acceptat | pasul 2: cursele cu rută din afara `FER` intră cu `schimb: null`, `afara: true`, `ora`; `afara[luna]` în JSON; 2a pe toate cursele, pe sens, moduri |
| B21, S18 | medium | loturile nu completează liniile cu urmă dar <3 zile bune; «toate» iluzoriu | acceptat | = C1 (r2); pasul 5 (2)–(3); `toate` doar cu ≥3 zile bune |
| B22, S19 | low/medium | km/sursă/sate pentru `asim`; ramura ±5 % contrazice verificarea 7 | acceptat | pasul 5 (5)–(6): `departeDeEtalon`, `asim` cu `km` = turul desenat, sursa zilei; verificarea 7 le exclude și le listează |
| B23 | low | satele regulate numărate pe ambele sensuri la un loc | acceptat | pasul 3: `regulate[sursa][sens]`; pasul 5 (1) pe sens |
| S20 | medium | `FLOTA` nespecificat; proba o poate otrăvi | acceptat | pasul 1: `FLOTA` doar de rularea completă, după «N mașini»; `--doar` pe mașină absentă = eroare; proba cu `--flota-proba` |
| S21 | low | «nume fără loc în index: —» imposibil cu alias | acceptat | pasul 1: lipsa pe grup `kk(nume)` |
| S22 | low | prag 10 MB «pe lot» pe fișier îmbinat | acceptat | pasul 4: Δ ≤10 MB pe lot, total ≤30 MB, lotul rămâne 8 |
| S23 | low | tăierea la gol >2 h după ramura porții; `argv[2]` | acceptat | pasul 1: testul primul în buclă; `argv` scos |
| B14 | — | reconfirmat respins (business v3: `relabel.mjs:17-18`, fără dovadă nouă) | închis | — |
| notă B (fără deducere) | — | `lat,lon` = punctul de intrare, nu al opririi | acceptat | pasul 1: punctul cu `vmin` |

Scoruri v3: business-logic 4.0 (1 high: B18), senior-backend 1.5 (2 high: S16, S17), Codex 7.0 (1 high). Toate închise în v4.

## Critic extern — runda 1 (Codex, 25.09) · scor raportat 0.0 (Σ deduceri 12.0, schema taie la 0), verdict fail

| id | sev. | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| C1 | high | `EXCLUS` `$3/$4` se suprapune peste `TO` în interogarea pe mașină | acceptat | fapt nou în tabel (`curse.mjs:80` `[d.id, FROM, TO]`); pasul 1: `$3/$4` la flotă, `$4/$5` pe mașină; proba `--doar=346KAJ` |
| C2 | high | opririle n-au poziție; `opr.km ≥ kmCap` pierde oprirea de la capăt | acceptat | pasul 1: `lat,lon` pe oprire; pasul 3: potrivire pe ținta rutei ≤1,2 km, toleranță `R_OPR` la `kmCap`, capătul atins prin tăietură |
| C3 | high | 8 candidate = limită definitivă, nu lot | acceptat | pasul 4: loturi `--lot=N` cu îmbinare; pasul 5 (6): `deCompletat` până la 3 loturi |
| C4 | medium | sursa satelor și sursa etalonului alese prin condiții diferite | acceptat | pasul 3 calculează ambele surse; pasul 5 hotărăște sursa o dată, cu lista ei de sate |
| C5 | medium | `--doar` fără `OUT` → ENOENT; loturile repetă interogarea porților | acceptat | pasul 1: `OUT` lipsă = de la zero; `FLOTA` cache; căderea înainte de «N mașini» tratată separat |
| C6 | medium | cheia `schelet-cand.json` fără mașină | acceptat | cheie `ruta|linie|zi|schimb|m` (fapt: R9 Cobani, două mașini în același schimb) |

## Triaj revizori Claude — runda 2 (v2 → v3)

| id | sev. | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| B6 (redeschis) | high | `schimburi ≥30 %` dă 4 × km și pe liniile cu o grupă (rotație) | acceptat | fapt nou în tabel (R1 25/31, R4 65/64); `ture/zi` = mediana perechilor (schimb, mașină) pe zi; `kmZi = 2 × km × ture/zi`; (k) |
| B10, S9 | high | poarta `afara` 10 % declanșează mereu (~40 % și pe fereastra de învățare) | acceptat | fapt nou în tabel; pasul 2a: `afara` după `alege`, prag relativ +10 pp sau ±30 min pe mediane, regulă de reînvățare |
| B11, S10 | medium/high | capetele cu alias (Mihăileni R6, Fundurii Vechi R11) se pierd fără `apr-extra` | acceptat | pasul 1: ținte cu `kk`/`ALIAS`; control (l); verificare 2 |
| B12, S12 | medium | `opr` fără coordonate; nume fără alias; Bălți zgomot | acceptat | pasul 1 `lat,lon`; pasul 3 potrivire pe țintă, <2 km de porți neutru |
| B13 | medium | fără fallback `asim` | acceptat | pasul 5 (5) |
| B14 | medium | `fix-041` nu se aplică pe extracția nouă | **respins cu fapt** | `curse.mjs:30-34`: `placaDev` ia CarName întâi, deci dispozitivul cu CarName 041BRAU iese 041BRAU, iar 2332 (CarName 320BRAT) iese 320BRAT — corect; `fix-041` repara un relabel greșit după RegNo-ul altor dispozitive (memoria `drax-schelet-rute`, «Reetichetarea se face DOAR pe eticheta veche a aceluiași dispozitiv»), nu extracția. Verificarea 1 cere totuși «041BRAU prezent» |
| B15, S14 | low | `$3/$4` greșit pe a doua interogare | acceptat | = C1 |
| B16 | low | două criterii pentru «septembrie», fallback iluzoriu | acceptat | = C4; pagina scrie sursa efectivă și zilele |
| B17 | low | ziua după opriri nu garantează ±5 % | acceptat | pasul 5 (4): filtru ±5 % întâi |
| S11 | medium | cheia fără mașină; `DOAR` nu scrie; fără a doua trecere | acceptat | = C3 + C6; `--doar` îmbină |
| S13 | medium | ancorarea cu o singură poartă | acceptat | fapt nou (397VKV VEST/EST); pasul 4: ancorare la poarta cursei; `poarta`, `rt` în `obs-ideal.json` |
| S15 | low | `--doar` fără `OUT`; porțile la OOM; `nohup` fără redirecționare; căi relative | acceptat | = C5; lansarea cu `</dev/null >/dev/null 2>&1`; `ls` pe căi |
| P1–P4 | — | închise de v2 (scalability v2: 10.0, 0 blocante) | — | v3 adaugă loturi (≤3 × ~5 min Valhalla) și `lat,lon` pe opriri (câțiva MB) — în limitele faptelor din tabel |

Scoruri v2: business-logic 0.5 (2 high: B6, B10), senior-backend 2.0 (2 high: S9, S10), scalability 10.0 (0). Toate
observațiile de mai sus sunt închise în v3 prin corecție sau respinse cu fapt (B14).

## Triaj revizori Claude — runda 1 (v1 → v2)

| id | sev. | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| S1 | high | `--doar` e pe mașini, ramura lui citește/scrie `curse.json` ION-45 | acceptat | pasul 1: `OUT`, loturi de mașini, `FROM/TO/EXCLUS` din rulare |
| S2, B2 | high | etalonul pe km bruți, contrar lecției ION-45/Florești | acceptat | etalonul mutat în pasul 5, pe urmă; pasul 2 doar candidate (≤25 %) |
| S3 | high | pasul 3 n-are intrarea; `puncte.sh` ar reciti tracker-ul | acceptat | `obs-ideal.json` + regulate din `opr`; `puncte.sh` scos |
| S4 | medium | codul ION-45 modificat pe loc | acceptat | lanț `cod/ideal/` cu `IN/OUT` |
| S5, B1 | high/medium | cheia fără schimb împerechează s1 cu s2; `MAX_ZILE`, ordinea, `DOAR`, control | acceptat | pasul 2: perechi pe schimb, strânse pe linie; sept. întâi |
| S6, P1 | low/high | `EXCLUS` doar pe o interogare; span brut 145 zile | acceptat | `EXCLUS` în SQL pe ambele interogări |
| S7 | low | `nohup` fără semnal | acceptat | marcaj `EXIT`, o verificare ssh |
| S8 | low | pipeline | acceptat | pașii 0 și 8 |
| B3 | high | regulate pe toată fereastra vs. etalon din sept. | acceptat | pasul 3: aceleași zile ca etalonul; «până în iulie» |
| B4 | high | `FER` neverificat pe sept. | acceptat parțial → B10 | pasul 2a (v3) |
| B5 | medium | liniile `*` intră în total | acceptat | pasul 5: doar dacă ruta n-are linie din act; control (j) |
| B6 | medium | `4 × km` și pe linii cu un schimb | acceptat → redeschis în runda 2 | v3: `ture/zi` |
| B7 | medium | satele actului sunt pe rută, nu pe linie | acceptat | pasul 3: «lipsește» pe rută; pe linie sate ≥25 % |
| B8 | medium | `fix-350` nu se aplică pe ieșirea nouă | acceptat | pasul 1b |
| B9 | low | 51 linii, cursă lipită peste excludere | acceptat | ținta 51; tăiere la gol >2 h |
| P2 | high | `puncte.sh` estimat greșit, contenție cu cron-urile | acceptat | pasul cade prin S3; `nice` + ora de pornire |
| P3 | medium | pasul Valhalla fără estimare | acceptat | fapt: 8,5 min la ION-45 → ~5 min pe lot |
| P4 | medium | `schelet-cand.json` neestimat | acceptat | doar `plin`, doar candidate cu urmă la capăt, prag 10 MB |

## Review: business-logic-auditor (v2)

Sursa verificată: planul v2 întreg și codul ION-45 din scratchpad `drax/cod/` (curse.mjs, etalon.mjs, schelet.mjs, fix-350.mjs, relabel.mjs, fix-041.mjs, apr-extra.mjs), `drax/etalon.log`, `drax/control.log`, `drax/date/nomenclator.json` (liniile cu `autobuze`). Deciziile lui Ion (fereastra, idealul simetric, fără km din act, livrarea ca artefact, unitatea rută × linie) nu se discută.

### Stadiul B1–B9

- **B1 — închis.** Pasul 2 împerechează turul și returul pe `ruta|linie|schimb|masina|zi`, iar abia apoi le strânge pe `ruta|linie`. `pune` (`etalon.mjs:98`) rămâne pe cheia cu schimb, deci turul s2 nu se mai lipește de returul s1 (R7 Slobozia* 386PKP). A apărut și controlul (c2).
- **B2 — închis.** Etalonul și `sursaEtalon` s-au mutat în pasul 5 și sunt calculate pe urmă, după ancorare. Pasul 2 lasă doar candidate, cu un prag larg de 25 % pe km bruți (ca la `etalon.mjs:136`). Pragul de 18 % se aplică pe urmă. Ordinea 2→3→4→5 nu are dependențe inverse.
- **B3 — închis în esență.** Satele regulate se calculează acum pe zilele septembrie/toate, iar «până în iulie» s-a adăugat. Rămâne o nepotrivire mică între criteriul `sursaZile` din pasul 3 și `sursaEtalon` din pasul 5: vezi B16, low.
- **B4 — deschis, trecut în B10.** Calea de rezervă (pasul 1c) există, dar poarta ei de 10 % e calibrată greșit față de baza măsurată. Declanșează mereu, deci nu mai separă «FER s-a mutat» de «FER e bun».
- **B5 — închis.** O linie `*` intră în schelet și în total doar dacă ruta ei n-are nicio linie din act cu ideal. S-a adăugat controlul (j).
- **B6 — deschis (high), vezi mai jos.** Corecția `kmZi = 2 × km × schimburi observate (≥30 % din zile)` nu ține cont de rotația săptămânală a grupelor. Pe liniile cu o singură grupă dă tot 4 × km.
- **B7 — închis.** «Lipsește» se judecă pe rută, iar pe linie se afișează satele atinse ≥25 %.
- **B8 — închis pentru 350KAJ** (pasul 1b plus verificarea «nicio mașină cu `#`»). Aceeași clasă de defect există însă și la 041BRAU, care nu e acoperit: vezi B14.
- **B9 — închis.** Ținta e 51 de linii. Cursa se taie la un gol de peste 2 h, iar Verificarea 1 cere «nicio cursă peste excludere». Tăierea la 2 h e un supraansamblu al regulii de odihnă de 25 min (`curse.mjs:90-92`) și nu rupe cursele reale, care durează ~1 h.

### Observații noi

**B6 (redeschis) — high (−2.0) · Defect de logică: `schimburi observate ≥30 % din zile` numără ambele schimburi pe liniile cu o singură grupă, pentru că grupele se rotesc săptămânal.**
Dovadă:
- `nomenclator.json`, `linii[].autobuze`: R1 Donduseni `{EZ:0,D:1}`, R4 Grinauti `{EZ:1,D:1}`, R6 Mihailenii Vechi `{EZ:1,D:0}`, R8 Costesti `{EZ:0,D:1}`.
- `etalon.log:57,61`: R1 346KAJ are s1 în 25 de zile și s2 în 31.
- `etalon.log:103-104`: R8 345KAJ are s1 în 31 de zile și s2 în 32.
- `etalon.log:94-95`: R6 917FTI are 30 și 30.
- Comparativ, pe o linie cu ambele grupe, `etalon.log:84-85` arată R4 748IZX cu 65 și 64 de zile.
- Ion, în plan: «ele se schimbă cu locurile».
Liniile cu o grupă au deci cam jumătate din zile pe s1 și jumătate pe s2, adică un singur schimb pe zi. Liniile cu ambele grupe au ambele schimburi aproape în fiecare zi.
Scenariu: pe cele 34 de linii cu o singură grupă, fiecare schimb apare în ~50 % din zile, deci ambele trec pragul de 30 %. Rezultă `schimburi = 2` și `kmZi = 4 × km`, în loc de 2 × km. Σ kmZi iese umflat cu aproximativ Σ 2 × km pe 34 de linii. Controlul (k) «un singur schimb» rămâne gol, deci nu prinde nimic.
Corecție: `ture/zi` = mediana, pe zilele sursei cu cel puțin o observație a liniei, a numărului de perechi distincte `(schimb, mașină)` observate în acea zi. La fiecare pereche se ia max(tur, retur), ca să nu se piardă zilele la care una din cele două curse lipsește. Formula devine `kmZi = 2 × km × ture/zi`. Cifra se afișează lângă `EZ + D` din act, iar controlul (k) devine «ture/zi ≠ EZ + D din act».

**B10 — high (−2.0) · Defect de logică: poarta din pasul 1c («>10 % `afara` în septembrie») e sub nivelul de bază, deci declanșează mereu.**
Dovadă: `etalon.log:54` arată «curse cu sens și schimb: 9310 · fără rută/capăt: 9675 · în afara ferestrelor: 12457». Pe fereastra ION-45, unde `FER` era chiar învățat, `afara` înseamnă deja ~40 % din sensurile cu poartă. Motivul e în `etalon.mjs:101-106`: `afara` se numără înainte de `alege`, pe toate cursele flotei care ating poarta, inclusiv vizitele de peste zi, service și tranzit. `ore.mjs` din pasul 1c numără pe aceeași bază.
Scenariu: în septembrie `afara` iese tot ~40 %, deci poarta cere reînvățarea `FER` chiar dacă orele nu s-au schimbat. «Se rescrie `FER` după histogramă» nu are o procedură, așa că executorul lărgește ferestrele după vârfuri. Lărgirea bagă în s1/s2 cursele de peste zi, iar perechile, candidatele și `ture/zi` se strică pe toate liniile. Poarta nu mai spune ce trebuia să spună la B4.
Corecție:
- (a) `afara` se măsoară doar pe cursele cărora `alege()` le găsește rută și capăt, adică `afara` se mută după `alege`.
- (b) Poarta devine relativă: `afara`% din septembrie minus mediana `afara`% pe mai–iulie din aceeași rulare > 5 pp, SAU mediana sosirii tur s1 / plecării retur s2 pe cursele cu rută din septembrie se abate cu peste 30 min de la 06:43 / 00:07.
- (c) Reînvățarea se scrie ca regulă: capetele ferestrei = vârful histogramei ± aceeași lățime ca acum.

**B11 — medium (−1.0) · Gol de acoperire: capătul R6 «Mihăileni» nu mai e țintă la extragerea nouă.**
Dovadă: `curse.mjs:39-41` construiește `tinte` din numele nomenclatorului fără `ALIAS`, pe când `ALIAS` există doar în `etalon.mjs:27-28` (`mihaileniivechi → mihaileni`). `apr-extra.mjs:1-2` spune «Completează… «Mihailenii Vechi» → «Mihăileni»», iar `etalon.log:7` arată «Mihăileni… (382 atingeri)», rezultat după apr-extra. Planul copiază `curse.mjs` și `fix-350`, dar nu și `apr-extra`.
Scenariu: în `curse-ideal.json` cursele lui 917FTI nu au apropieri de Mihăileni. Linia R6 din act rămâne fără capăt și cursele ei cad pe o linie `*`. Controlul (a) blochează publicarea, iar Verificarea 5 (≥48/51) consumă o rezervă gândită pentru satele de tranzit.
Corecție: la pasul 1, `vrem` din `curse.mjs` se extinde cu valorile din `ALIAS` (aceeași listă ca în `etalon.mjs:27-28`). Varianta echivalentă e un pas 1d cu o copie a `apr-extra.mjs` pe `curse-ideal.json` pentru «Mihăileni». La Verificare se adaugă: «capătul fiecărei linii din act găsit, cu atingeri > 0».

**B12 — medium (−1.0) · Descriere greșită a intrării din pasul 3: opririle nu au coordonate.**
Dovadă: `curse.mjs:117,125`. `opr` = `{ n: nn.name, km }`, unde `n` e cel mai apropiat loc din index la ≤0,8 km, fără lat/lon. Planul (pasul 3) cere «oprire ≤1,2 km de sat», iar asta nu se poate calcula din `obs-ideal.json`.
Scenariu: executorul potrivește pe nume. Satele cu alias (Mihăileni, Zarojeni/Zorojeni, Ustia/Ustea, Catranîc, Iezărenii Vechi, Fundurii Vechi) ies cu 0 %. Controlul (d) arată atunci sate «lipsă» false pe rută, iar omonimele (patru Nicolaevca, trei Izvoare) se amestecă. Dacă executorul recitește tracker-ul ca să aibă coordonatele, S3 se redeschide.
Corecție: la pasul 1, `curse-ideal.mjs` scrie și `lat, lon` pe fiecare oprire (costul e neglijabil, punctul există la `curse.mjs:117`). Pasul 3 potrivește apoi sat ↔ oprire prin `D.tinte` (id-ul cu coordonate) la ≤1,2 km, cu numele trecut prin `kk()`/`ALIAS`.

**B13 — medium (−1.0) · Lipsește fallback-ul pentru liniile asimetrice: nicio zi bună la ≤18 % pe urmă înseamnă nicio linie ideală.**
Dovadă: `schelet.mjs:150-154` (ION-45 păstra ziua cu diferența cea mai mică, marcată `asim`, tocmai pentru asta). `etalon.log`: R18 Zarojeni s2 348KAJ are dif 19 % pe mediană, R26 Ilenuta s1 351KAJ 17 %, R14 Baroncea s2 15 %. Planul, la «Riscuri», spune «idealul ia turul; controlul (c) listează linia», dar condiția (1) din pasul 5 exclude tocmai aceste zile.
Scenariu: pe R18, dacă și s1 are drumul de întoarcere prin Gura Căinarului (acolo doarme 348KAJ, `control.log`), nicio zi nu trece de 18 %. Linia rămâne fără ideal și (a) blochează publicarea.
Corecție: în pasul 5, dacă linia n-are nicio zi bună, dar are candidate cu urmă la capăt care trec satele regulate, se ia ziua cu diferența minimă, marcată `asim` (ca la `schelet.mjs:154`). Ea intră în (c), nu în (a).

**B14 — medium (−1.0) · Gol de acoperire: corectura 041BRAU (aceeași clasă ca 350KAJ) nu se aplică pe ieșirea nouă.**
Dovadă:
- `relabel.mjs:17-18`: dispozitivul 2332 are CarName 320BRAT și RegNo 041BRAU.
- `fix-041.mjs:1-6`: «eticheta «320BRAT» din curse.json e autobuzul 041BRAU».
- `curse.mjs:34`: `placaDev` ia CarName întâi, deci extragerea nouă scrie «320BRAT».
- `etalon.log` are R20 Drăgănești* 041BRAU G.
Scenariu: în `curse-ideal.json`, autobuzul de pe R20 apare ca 320BRAT. Nu mai e «grafic» (`etalon.mjs:76,91`), pierde bonusul 0,5 și regula `*`, și poate fi respins de `gol > plin` (`etalon.mjs:90`) sau dus pe altă rută. În plus, (h) raportează 041BRAU «din grafic fără linie».
Corecție: pasul 1b aplică și o copie `fix-041.mjs` cu `OUT`. La Verificare se adaugă: «041BRAU prezent, 320BRAT absent».

**B15 — low (−0.5) · Numerotarea parametrilor `EXCLUS` e greșită pentru interogarea pe mașină.**
Dovadă: `curse.mjs:80` folosește deja `$1` = id, `$2` = FROM, `$3` = TO. Pasul 1 scrie «`$3`, `$4`» pentru AMBELE interogări. Pe cea de la `:80`, `EXCLUS` trebuie să fie `$4`, `$5`. Altfel fie cade interogarea (numărul de parametri nu se potrivește), fie excluderea se face cu TO și dispare în tăcere. Verificarea 1 ar prinde cazul tăcut, deci e low.
Corecție: pasul 1 scrie explicit `$3/$4` la `:54` și `$4/$5` la `:80`.

**B16 — low (−0.5) · Două criterii diferite pentru «septembrie» și un fallback «toate» iluzoriu.**
Dovadă: planul, pasul 3 (`sursaZile` = sept dacă linia are ≥3 zile CANDIDATE în sept.), pasul 5 (`sursaEtalon` = sept dacă linia are ≥3 zile BUNE în sept.) și pasul 4 (cel mult 8 candidate, cu septembrie întâi).
Scenariu: o linie are ≥8 candidate în septembrie, dar doar 2 trec pe urmă. Rezultă `sursaEtalon = toate`, deși nicio zi din mai–iulie nu are urmă, deci «toate» înseamnă aceleași 2 zile. Satele regulate sunt atunci din septembrie, iar eticheta paginii spune «toate».
Corecție: `sursa` se hotărăște o singură dată, în pasul 3, iar pasul 5 o preia. Pasul 4 ia până la 8 candidate din sursă plus până la 4 din afara ei, pentru fallback. Pagina scrie sursa efectivă.

**B17 — low (−0.5) · Ordinea de alegere a zilei nu garantează Verificarea 7 (km-ul cardului = drumul desenat ±5 %).**
Dovadă: planul, pasul 5 (3): întâi «cele mai multe opriri reale», abia apoi «tur ≈ etalon». `schelet.mjs:158` (ION-45) alegea ziua cea mai apropiată de mediană.
Scenariu: ziua cu cele mai multe opriri are turul cu 8 % peste etalon. Cardul arată etalonul, drumul desenat e mai lung, iar Verificarea 7 pică sau e trecută cu vederea.
Corecție: în pasul 5 (3) se filtrează întâi `|tur − etalon| ≤ 5 %` și abia apoi se ordonează după opriri. Dacă nicio zi nu rămâne, se ia ziua cea mai apropiată de etalon.

Deduceri: 2 × 2.0 (B6, B10) + 4 × 1.0 (B11–B14) + 3 × 0.5 (B15–B17) = 9.5.

Scor: 0.5 · Blocante (critical/high): 2

## Review: senior-backend-engineer (v2)

Cod citit: copiile ION-45 din `scratchpad/drax/cod/` (prescurtat `cod/`), `drax/etalon.log`, `drax/date/nomenclator.json`,
memoria `floresti-schelet-rute.md`. Deciziile lui Ion (fereastra, idealul simetric, fără km din act, livrare artefact) nu se discută.

### Starea S1–S8

- **S1 — închis.** `OUT`, loturi de mașini, `FROM/TO/EXCLUS` ale rulării curente, prima/ultima zi pe mașină (pasul 1, Verificare 1). Rămâne o scăpare mică în ramura de rezervă, trecută la S15.
- **S2 — închis.** Pasul 2 produce doar candidate (≤25 % pe km bruți). Etalonul se calculează pe urmă în pasul 5.
- **S3 — închis ca structură.** Există `obs-ideal.json` și `opr` cu `kmCap`, iar tracker-ul nu mai e recitit. Câmpul `kmCap` se poate obține: e `a.km` de la `cod/etalon.mjs:108-113`, pe același `cum` ca `opr.km` (`cod/curse.mjs:100,117`). Criteriul de potrivire a satelor însă nu se poate calcula (S12).
- **S4 — închis pentru lanțul `cod/ideal/`.** Dintre uneltele ION-45 a căzut însă `apr-extra` (S10).
- **S5 — închis pentru cheie și ordonare.** Cheia din `schelet-cand.json` și modul `DOAR` sunt noi (S11).
- **S6 — închis.** `EXCLUS` e pe ambele interogări, ca text UTC. Numerotarea parametrilor de la a doua interogare e trecută la S14.
- **S7 — închis.** `EXIT` și o singură verificare ssh sunt în plan.
- **S8 — închis.** Pașii 0 și 8 au căile, `-F`, «Чем проверять» și factul `kind=manual`.

### Observații noi

**S9 · high (−2.0) · defect de logică: poarta din pasul 1c (»peste 10 % `afara` în septembrie«) se declanșează oricum, independent de septembrie**
Dovadă: `drax/etalon.log:54` („curse cu sens și schimb: 9310 · fără rută/capăt: 9675 · în afara ferestrelor: 12457"). Pe fereastra pe care a fost învățat, `FER` lasă deja **~40 %** din sensuri în `afara`. `cod/etalon.mjs:100-106` numără `afara` pe fiecare cursă a flotei care atinge poarta, ÎNAINTE de `alege()`. Intră aici curse de oraș, tranzit și fragmente oprite de staționarea de 25 min, nu doar tururi și retururi Drăxlmaier.
Scenariu: `ore.mjs` găsește în septembrie ~40 % `afara`, cum era și în mai–iulie. Regula din plan cere atunci rescrierea `FER` după o histogramă dominată de zgomot. Ferestrele se lărgesc sau se deplasează, deci s1/s2 se atribuie greșit în pasul 2. O pauză de prânz la poartă cade, de exemplu, în `tur s2 [13.5,16]`. Rămâne și varianta în care executorul se oprește la o poartă care nu se poate trece.
Corecție: (a) `afara` se măsoară doar pe cursele cărora `alege(c, sens)` le dă rută și capăt. `ore.mjs` apelează `alege` înaintea verificării `FER`, sau numărătoarea pe lună trece în `etalon.mjs`, după `alege`. (b) Pragul e relativ: ponderea din septembrie se compară cu mediana lunilor mai–iulie, iar poarta se declanșează la o creștere de peste 10 puncte procentuale. (c) Se descrie reînvățarea: vârfurile histogramei pe cursele cu rută, ±1,5 h, ca în comentariul `cod/etalon.mjs:8`.

**S10 · high (−2.0) · defect de logică: extragerea nouă pierde capetele și satele cu alias. La ION-45 le aducea `apr-extra.mjs`, pe care v2 l-a scos**
Dovadă: `cod/curse.mjs:39` construiește țintele din `cur(nume)` fără `ALIAS`. `ALIAS` există doar în `cod/etalon.mjs:27-29`. `cod/apr-extra.mjs:1-3` spune: „completează în curse.json apropierile de un loc care n-a fost țintă… «Mihailenii Vechi» → «Mihăileni»". În `nomenclator.json`, **startul R6 «Mihailenii Vechi»** și **startul R11 «Funduri Vechi»** sunt nume cu alias, la fel satele din R13, R16, R18, R19, R24, R29 și R33. `drax/etalon.log`, rândul R6, arată „Mihăileni@48.0409,27.6161 (382 atingeri)", adică exact după `apr-extra`.
Scenariu: `cod/ideal/curse.mjs` produce `apr` fără Mihăileni. În `etalon.mjs:47` lista `cand` rămâne goală, deci `capat` e null și linia R6 (130 km în act) nu primește nicio cursă. Cursele ei ajung pe o linie `*` sau pe altă rută. Pasul 3 raportează 0 % pentru opt sate cu alias, iar controlul (d) le trimite lui Ion ca «lipsă». (a) blochează publicarea, dar planul nu spune reparația, iar `apr-extra` recitește tracker-ul pe mașină încă o dată.
Corecție: în `cod/ideal/curse.mjs`, `vrem` se construiește cu `kk` (cur + `ALIAS` copiat din `etalon.mjs:27-29`), ca țintele cu alias să existe de la extracție. Verificarea 1 adaugă: „ținte: … nume fără loc în index: —" și capetele R6 și R11 găsite în `etalon.log`.

**S11 · medium (−1.0) · gol de acoperire: cheia din `schelet-cand.json` și modul `DOAR` din `schelet.mjs`**
Dovadă: (1) `drax/etalon.log:102,105,112,114`: R9 Cobani e servită în ACELAȘI schimb de 397VKV (20 de zile s1, 14 s2) și de 447ASB (7 s1, 36 s2). Cheia `ruta|linie|zi|schimb` suprascrie în liniște o mașină cu alta în zilele comune. Florești a trebuit să recheie pe `masina|ruta|zi` (memoria floresti, r. 134). (2) `cod/schelet.mjs:76,168`: `DOAR` înseamnă `DEBUG` și `if (!DOAR) writeFileSync`, adică o rulare pe un subset de linii NU scrie nimic. (3) Când o linie are ≥8 candidate în septembrie, cele 8 desenate sunt toate din septembrie. Dacă niciuna nu trece satele regulate sau urma, linia rămâne fără zi bună, deși iulie are zile bune, și n-are pas de completare (Florești: `cerere2 … 99` și „desenează doar zilele noi").
Corecție: cheia devine `ruta|linie|zi|schimb|m`. `DOAR` scrie prin îmbinare în `schelet-cand.json`, fără să-l suprascrie. Se adaugă pasul 4b: pentru liniile fără zi bună după pasul 5, `schelet.mjs` desenează următoarele 8 candidate (din afara septembrie), cu `DOAR` și îmbinare, apoi se rulează din nou `alege`.

**S12 · medium (−1.0) · nespecificat: criteriul din pasul 3 nu se poate calcula din `opr`**
Dovadă: `cod/curse.mjs:125`: `opr` = `{ n, km }`, fără coordonate. `n` e cel mai apropiat loc din index la ≤0,8 km (`:115`, `R_OPR`). Planul cere „oprire ≤1,2 km de sat", ceea ce nu se poate calcula. Numele din act au nevoie de `kk`/`ALIAS` (`cod/etalon.mjs:27-29`) ca să se potrivească cu `opr.n`. Poarta e în Bălți, deci cartierele sau orașul apar ca `opr.n` pe fiecare linie.
Scenariu: executorul potrivește `opr.n` cu numele din act fără alias, iar Mihăilenii Vechi, Zorojeni, Ustea etc. ies cu 0 % („lipsește" fals, clasa (d)). `inPlus` ≥25 % scoate «Bălți» pe toate cele 51 de linii (clasa (e), zgomot).
Corecție: pasul 3 spune „oprire în sat = `kk(opr.n)` ∩ `kk(sat din act)`, restrâns la țintele rutei; ≤0,8 km, criteriul din extracție". Locurile la <2 km de porți sunt neutre (regula Florești, memoria r. 25).

**S13 · medium (−1.0) · nespecificat: ancorarea din Florești are o singură poartă, Drăxlmaier are două**
Dovadă: memoria floresti r. 105-106 (`ancoreaza.mjs` leagă capătul dinspre LEAR, cu o singură poartă). `nomenclator.json` `porti`: EST 47.78513/27.94307 și VEST 47.77408/27.91593, la ~2,4 km una de alta. `drax/etalon.log:102,112`: 397VKV pe R9 are tur la VEST și retur de la EST. Poarta cursei e în `v.poarta` (`cod/etalon.mjs:119`), dar lipsește din lista de câmpuri `obs-ideal.json`.
Scenariu: copia ancorează totul la o constantă (EST). Turul care intră pe VEST primește câțiva km în plus, trasați peste cealaltă poartă. Pe liniile scurte (Bilicenii Vechi 16,7 km, `etalon.log:249-252`) diferența tur/retur trece de 18 %, iar ziua bună se pierde. Pe pagină, „retur = oglinda turului" desenează returul spre poarta greșită.
Corecție: pasul 4 ancorează fiecare sens la poarta lui (`tur.poarta` = `pOut`, `retur.poarta` = `pIn`, din candidată). Pagina afișează poarta modală a turului. `poarta` și `rt` se adaugă în câmpurile `obs-ideal.json`.

**S14 · low (−0.5) · descriere incompletă: `$3`, `$4` nu sunt valabile în a doua interogare**
Dovadă: `cod/curse.mjs:80`: parametrii sunt `[d.id, FROM, TO]`, deci `$3` = TO. Cu `[d.id, FROM, TO, '2026-07-18']`, condiția `NOT (w_date >= $3 AND w_date < $4)` = `NOT(false)` și nu exclude nimic, fără nicio eroare. Verificarea 1 ar prinde asta abia după ~40 de minute.
Corecție: în pasul 1 se scrie „în interogarea pe mașină `$4`, `$5`".

**S15 · low (−0.5) · ramura de rezervă și lansarea**
Dovadă: `cod/curse.mjs:132`: primul lot `--doar` citește `OUT`, care după un OOM în rularea completă nu există (ENOENT). Loturile nu micșorează interogarea porților (`:53-54`, toate dispozitivele, fereastra întreagă), deci un OOM acolo se repetă. `nohup … &` pornit prin `ssh "…"` fără `</dev/null >/dev/null 2>&1` în afara `sh -c` ține canalul ssh deschis până la final, iar apelul Bash rămâne blocat.
Corecție: `OUT` lipsă înseamnă că se pornește de la zero (`{tinte, curse: [], zilePoarta: {}}`). La OOM, `dmesg` arată dacă a căzut înainte de linia „N mașini" (interogarea porților): atunci se împarte fereastra porților, nu flota. Lansarea: `ssh … 'cd /root/lde-worker/drax/cod/ideal && nohup nice -n 10 sh -c "…" </dev/null >/dev/null 2>&1 &'`. Tot în pasul 1 se verifică existența fișierului `../../.env` și căile relative din copie (`../date/nomenclator.json` → `../../date/`).

Deduceri: S9 2.0 + S10 2.0 + S11 1.0 + S12 1.0 + S13 1.0 + S14 0.5 + S15 0.5 = 8.0.

Scor: 2.0 · Blocante (critical/high): 2

## Review: scalability-auditor (v2)

Zona verificată: P1–P4 din runda 1 (contra planului v2 și codului ION-45 din `scratchpad/drax/cod/`), plus căutare de probleme noi de încărcare/durată introduse de v2.

**P1 — închis.** Corecția cerută (EXCLUS pe AMBELE interogări `track`, nu doar una) e în plan: pasul 1 spune explicit „`EXCLUS` intră ca text UTC … în AMBELE interogări `track`". Rândul „Extragerea curselor…" din Verificat pe viu leagă asta de un fapt real (ION-45: 38 min, 18 MB, OOM la 7 luni brute pe un singur proces) și trage concluzia că rândurile ÎNTOARSE spre Node rămân echivalente cu 100 de zile. OOM-ul original era heap Node (proces JS), nu al serverului DB, iar mărimea rezultatului întors spre Node scade odată cu filtrul SQL — deducția e o consecință directă de semantică SQL (`AND NOT` elimină rândurile din interval). Consider P1 corect închis, fără scenariu de eșec rămas deschis.

**P2 — închis, prin eliminarea premisei.** Pasul 3 (`verif.mjs`) nu mai recitește tracker-ul deloc, ci lucrează din `opr[]` deja extras. Nu mai există `puncte.sh` cu 2 procese și estimarea greșită de 1 min/mașină; riscul de contenție CPU cu `tomberon-sync` (*/10) și automatul GPS (*/5) dispare o dată cu procesul. Ce rămâne (pasul 1, extragerea curselor) are propria lui atenuare: `nice -n 10`, `nohup`, pornire seara sau după 04:00, în afara ferestrei `run-nightly` de la 03:00.

**P3 — închis, cu estimare verificată pe viu.** Rândul „Pasul Valhalla încape în timp" din Verificat pe viu dă faptul real (ION-45: 164 linii×schimburi × ≤5 zile × 2 sensuri = 1640 tăieri în 8,5 min ⇒ ~193 tăieri/min) și extrapolează corect la noul volum: 51 linii × 8 zile × 2 sensuri = 816 tăieri, doar `plin` ⇒ 816/193 ≈ 4,2 min, rotunjit la „~5 min" în plan.

**P4 — închis, cu prag și cale de rezervă.** `schelet.json` la ION-45 avea 656 „jumătăți de urmă" la 3,4 MB (~5,2 KB/urmă); noul `schelet-cand.json` are 816 urme (51×8×2, doar plin) ⇒ ~4,2 MB, consistent cu „≈4–5 MB" din tabel. Planul adaugă și pragul explicit (`ls -la` sub 10 MB, peste → doar 4 candidate reținute).

Observații noi (v2): nimic critical/high nou. O singură notă informativă, fără deducere: `obs-ideal.json` nu are prag de mărime explicit; e însă un subset de câmpuri din `curse-ideal.json` (18 MB la scară comparabilă), deci rămâne cu mult sub acel prag; verificarea 3 din plan ar prinde-o oricum prin `etalon.log`.

Scor: 10.0 · Blocante (critical/high): 0

## Review: business-logic-auditor (v1)

Sursa verificată: codul ION-45 din scratchpad `drax/cod/` (curse.mjs, etalon.mjs, schelet.mjs, control.mjs, fix-350.mjs), `drax/date/nomenclator.json`, `drax/etalon.log`, `drax/control.log`, plus memoriile drax/floresti/mejgorod. Nu am dedus nimic pentru deciziile lui Ion (fereastra, idealul simetric, fără km din act, livrarea ca artefact).

**B1 — high (−2.0) · Defect de logică: fără schimb în cheie, turul unui schimb se împerechează cu returul celuilalt.** Dovadă: `etalon.mjs:98`, `etalon.mjs:117`; `etalon.log:96-97` (R7 `Slobozia*` 386PKP: s1 0 tururi/51 retururi, s2 27/31), `etalon.log:122-123` (R9 `Hîjdieni*` 447ASB: s1 21/0, s2 19/1). Corecția: împerecherea pe `ruta|linie|schimb|zi|masina`, apoi strânsă pe `ruta|linie`; control nou: mediana s1 vs s2 >18 %.

**B2 — high (−2.0) · Etalonul pe km bruți înainte de urme.** Dovadă: `curse.mjs:100`, `schelet.mjs:157`, memoria Florești (45 vs 59 km). Corecția: etalonul pe urmă, în pasul 5.

**B3 — high (−2.0) · Satele regulate pe toată fereastra vs. etalon din septembrie.** Corecția: aceleași zile ca etalonul; «până în iulie».

**B4 — high (−2.0) · `FER` învățat pe aprilie–iulie, aplicat orb pe septembrie.** Dovadă: `etalon.mjs:8,32,106`. Corecția: histograma orelor pe lună, `afara` pe lună, prag de oprire.

**B5 — medium (−1.0) · Liniile `*` intră în total.** Dovadă: `etalon.mjs:80-82`, `etalon.log:62-298`. Corecția: `*` doar dacă ruta n-are linie din act cu ideal; control nou.

**B6 — medium (−1.0) · `kmZi = 4 × km` și pe liniile cu un schimb.** Dovadă: `nomenclator.json` (34/51 linii cu un program), `control.log:28-40`. Corecția: schimburi observate.

**B7 — medium (−1.0) · Satele din act sunt pe rută, planul le judecă pe linie.** Dovadă: `nomenclator.py:27-31`; 12 rute cu 2–3 linii. Corecția: «lipsește» pe rută.

**B8 — medium (−1.0) · Unirea 350KAJ nu se aplică pe ieșirea nouă.** Dovadă: `curse.mjs:50`, `fix-350.mjs:3-6`. Corecția: pasul 1b.

**B9 — low (−0.5) · 51 linii, nu 52; cursă lipită peste excludere.** Dovadă: `nomenclator.json`, `curse.mjs:87-94`. Corecția: ținta 51, tăiere la gol >2 h.

Deduceri: 12.5. Scor: -2.5 · Blocante (critical/high): 4

## Review: senior-backend-engineer (v1)

**S1 · high (−2.0)** `--doar` = listă de mașini, citește/scrie `curse.json` ION-45 (`curse.mjs:20,131-136`). **S2 · high (−2.0)** km-ul idealului din km bruți (`curse.mjs:100`, `etalon.mjs:113`, `schelet.mjs:8-9,157`). **S3 · high (−2.0)** pasul 3 n-are intrarea (`etalon.mjs:97-121,151,155`); regulate din `opr` (`curse.mjs:22,113-125`). **S4 · medium (−1.0)** cod ION-45 modificat pe loc (căi literale `etalon.mjs:18,155`, `schelet.mjs:77,168`, `control.mjs:4-5`, `pagina.mjs:4,174`). **S5 · medium (−1.0)** cheia și gruparea (`etalon.mjs:98,124,140,151`, `schelet.mjs:14,76-77,141`, `control.mjs:19-20,30`). **S6 · low (−0.5)** `EXCLUS` pe ambele interogări (`curse.mjs:53-54,79-80`), parametri text. **S7 · low (−0.5)** `nohup` fără semnal. **S8 · low (−0.3)** pipeline.
Ce e în regulă: `R_CAPAT_CURSA` (`etalon.mjs:69`), `FER` (`etalon.mjs:32`), `placaDev` (`curse.mjs:34`, `schelet.mjs:89`), `utc()` (`schelet.mjs:105`), `taie` (`schelet.mjs:119-135`); ziua e UTC (`etalon.mjs:25`).

Scor: 0.7 · Blocante (critical/high): 3

## Review: scalability-auditor (v1)

**P1 — high (−2.0)** span brut 145 zile, `EXCLUS` doar pe o interogare (`curse.mjs:53-54,79-80`). **P2 — high (−2.0)** `puncte.sh` estimat 1 min/mașină vs. reper Florești 5 min; contenție cu `tomberon-sync` (*/10) și `trip-live` (*/5). **P3 — medium (−1.5)** pasul Valhalla fără estimare (`schelet.mjs:43-70`). **P4 — medium (−1.5)** `schelet-cand.json` neestimat (`schelet.mjs:119-134`).

Scor: 3.0 · Blocante (critical/high): 2

## Review: business-logic-auditor (v3)

B6, B10–B13, B15–B17 închise; B14 rămâne respinsă (`relabel.mjs:17-18` confirmă că mutarea 041BRAU → 320BRAT a venit din reetichetarea după RegNo, nu din `placaDev`).

**B18 · high (−2.0)** `ture/zi` numără și observațiile cu un singur sens ale mașinilor în tranzit. Dovadă: `etalon.mjs:117,127`; `etalon.log:255` (R19 Bilicenii Vechi s2, 412BRAY, 23 zile doar tur), `:172,174` (R13, 744ARF), `:314` (R22, 763LYY), `:441-442` (R35, 912RNK); linia R19 e servită de 830MUM (`:252,258`). Scenariu: perechile (s1, 830MUM), (s2, 830MUM), (s2, 412BRAY) → mediana 3, `kmZi` +50 %. Corecție: o pereche intră doar dacă (linie, schimb, mașină) are ≥3 zile cu ambele sensuri în sursă; mediana rotunjită la întreg; verificarea 2 cu R19/R4 = 2, R1/R6/R8 = 1.

**B19 · medium (−1.0)** `ture/zi` «pe zilele sursei» în pasul 2, sursa în pasul 5. Corecție: `ture/zi[sept]` și `[toate]`, pasul 5 ia valoarea sursei.

**B20 · medium (−1.0)** reînvățarea `FER` nu vede vârful ieșit din fereastră: `etalon.mjs:104-106` (`afara++; continue`), `FER.tur.s1 = [3.5, 7.0]` la 17 min de 06:43. Corecție: `obs-ideal.json` include cursele cu rută din afara `FER` (`schimb: null`, `afara: true`); histograma pe toate cursele cu rută, pe sens.

**B21 · medium (−1.0)** loturile nu completează liniile cu urmă dar <3 zile bune; «toate» iluzoriu. Corecție: `deCompletat` = <3 zile bune în `sept` după lot; lotul următor sept. rămase apoi mai–iulie; `toate` doar cu ≥3 zile bune.

**B22 · low (−0.5)** km-ul liniei `asim` nedefinit (`med` pe listă goală = 0, `etalon.mjs:21-22`, `schelet.mjs:23-24`). Corecție: `km` = mediana (tur, retur) a zilei alese / satele sursei cu mai multe candidate; control «km ≤ 0».

**B23 · low (−0.5)** satele regulate numărate pe ambele sensuri la un loc, ziua bună cerută pe fiecare sens. Corecție: `regulate` pe sens.

Notă fără deducere: `lat, lon` de la `curse.mjs:117` e punctul de intrare, nu al opririi; de scris punctul cu `vmin`.

Scor: 4.0 · Blocante (critical/high): 1

## Review: senior-backend-engineer (v3)

S9–S15 închise (comanda de lansare cu `sh -c` și `\$?` verificată; `$3/$4` la `curse.mjs:54`, `$4/$5` la `:80` corecte).

**S16 · high (−2.0)** `ore.mjs` citește `obs-ideal.json`, unde ajung doar cursele trecute de `FER` (`etalon.mjs:104-106`, `:117`); fereastra s1 se oprește la 07:00 (`:32`), deci +30 min nu se vede; `afara` citit din `etalon.log` (text). Corecție: cursele cu rută din afara ferestrelor intră în `obs-ideal.json` cu `schimb: null` și `ora`; `afara[luna]` în JSON; histograma pe sens; (b) pe modurile histogramei.

**S17 · high (−2.0)** `ture/zi` calculat în pasul 2 pe o sursă hotărâtă în pasul 5 (748IZX, R4: 65/64 zile mai–iulie, 0 în sept.). Corecție: `tureZi: {sept, toate}`, pasul 5 ia `tureZi[sursa]`.

**S18 · medium (−1.0)** `deCompletat` prea îngust (`schelet.mjs:144-148`: urmă la capăt dar cade la 18 %). Corecție: `deCompletat` = <3 zile bune în `sept` ȘI candidate nedesenate; `toate` abia după ce mai–iulie e desenat sau epuizat.

**S19 · medium (−1.0)** `asim`: km, sursă, sate nedefinite; ramura ±5 % contrazice verificarea 7 (`schelet.mjs:154,157`). Corecție: `km` = turul desenat, sursa zilei, satele sursei; verificarea 7 exclude `asim` și ramura de rezervă.

**S20 · medium (−1.0)** `FLOTA` nespecificat: `curse.mjs:69` filtrează `flota` după `DOAR_M` înainte de `push`; proba `--doar=346KAJ` ar scrie `FLOTA` = [346KAJ]. Corecție: `FLOTA` scris doar de rularea fără `--doar`, după «N mașini»; `--doar` pe mașină absentă = eroare; proba nu scrie `FLOTA`.

**S21 · low (−0.5)** «nume fără loc în index: —» imposibil cu alias (`curse.mjs:42`, `etalon.mjs:28`). Corecție: lipsa pe grup `kk(nume)`.

**S22 · low (−0.5)** prag 10 MB «pe lot» pe fișier îmbinat. Corecție: Δ pe lot sau total 30 MB; lot 8 fix.

**S23 · low (−0.5)** tăierea la gol >2 h după ramura porții (`curse.mjs:88-89`); `argv[2]/[3]` (`:17`) ar lua `--doar=…` ca `FROM`. Corecție: testul primul în buclă; `argv` scos.

Realizabil așa cum e scris: pașii 0, 1b, 3, 6, 7, 8; ancorarea la poarta cursei; cheia cu `m`; `--lot`/`--doar` cu îmbinare; `ziua()` UTC (`etalon.mjs:25`) pune turul și returul s2 în aceeași zi; `kmCap` = `a.km` comparabil cu `opr.km`.

Scor: 1.5 · Blocante (critical/high): 2

## Review: business-logic-auditor (v4)

B18–B23 închise (B18 verificat: 412BRAY are o singură zi cu ambele sensuri pe R19 și iese; mașinile cu puține zile nu mută mediana; scripturi de numărare `b24.mjs`, `nlin.mjs` în scratchpad).

**B24 · high (−2.0)** un autobuz cu două dispozitive e numărat de două ori: `0357544371228442` (placa cade pe IMEI, `curse.mjs:34`) și 880RNK au aceleași cifre pe R12 Pelinia (`etalon.log:147,151,153,156`: s1 47 zile fiecare, 26.1/25.9 km, ora 6.42/6.41; s2 44 zile) și Sofia (`:158-171`). Scenariu: `tureZi[toate]` = 4, `kmZi` = 208 în loc de 104; (k) trimite lui Ion o constatare falsă. Corecție: `fix-dubluri` (≥80 % curse coincid: `zi`, |Δt0| ≤ 3 min, |Δkm| ≤ 1); `ture/zi` numără o dată observațiile la ±3 min; (f) ramură «aceeași cursă, aceeași linie, `m` diferit», blocantă.

**B25 · medium (−1.0)** referințele porții 2a (b), 06:43 și 00:07, vin din comentariul `etalon.mjs:8`; măsurat în `etalon.log` (66 rânduri s1): mediana `oraTur` ~06:12 (5.90–6.48), `oraRetur` s2 ~00:17. Scenariu: poarta (b) se declanșează la întâmplare pe date neschimbate; «vârful ± lățimea» citit literal dă [02:37, 09:37], iar `pune` (`etalon.mjs:98`) ar lua curse târzii cu `plin` mai mare. Corecție: referința = mediana aceleiași rulări pe mai–iulie; fereastra de aceeași lățime, centrată pe vârf.

**B26 · low (−0.5)** plafonul de 3 loturi (24) e consumat de septembrie pe cele 17 linii EZ+D (~40 candidate); (3) nu se aplică niciodată. Corecție: (3) după ultimul lot oricum, sau lotul 3 din mai–iulie.

**B27 · low (−0.5)** ancora «R19 → 2» nedovedită (`etalon.log:252,258`: 830MUM ~27 zile pe schimb, face și Copăceni s2, Taura Veche s1). Corecție: ancore sigure R4 = 2, R1/R6/R8 = 1.

**B28 · low (−0.5)** `tureZi[sursa]` gol la `asim` (`med([])` = 0, `etalon.mjs:21-22`) → `kmZi` 0 sau `NaN`. Corecție: EZ + D din act cu steag `tureZiDinAct`; (m) `!(kmZi > 0)`.

Deduceri: 4.5. Scor: 5.5 · Blocante (critical/high): 1

## Review: senior-backend-engineer (v4)

S16–S23 închise (verificat pe cod: `alege` nu depinde de schimb, `etalon.mjs:72-95`; la rularea completă `flota` e nefiltrată și păstrează `id`, `curse.mjs:69-70`; tăierea la gol >2 h fără `continue` trece corect prin ramura porții).

**S24 · medium (−1.0)** candidatele desenate care au eșuat nu sunt reținute (`schelet.mjs:141-145` le sare); «nedesenat» dedus din `schelet-cand.json` le-ar relua în fiecare lot; liniile cu ~40 candidate în septembrie epuizează plafonul fără mai–iulie. Corecție: lista `incercate` cu motivul; (3) «sau plafonul atins»; lotul 3 rezervat pentru mai–iulie.

**S25 · low (−0.5)** «Riscuri» («4 candidate pe lot») și tabelul «Fișiere» («(a)–(l)») contrazic pașii 4 și 6. Corecție: aliniere.

**S26 · low (−0.5)** `tureZi[sursa]` poate ieși 0 (`med([])`), `kmZi = 0`, (m) blochează fără reparație; verificarea 2 nu spune sursa pentru R4 (748IZX are 0 zile în sept.). Corecție: `tureZi.toate` cu steag; sursa în verificarea 2.

Notă fără deducere: «vârful ± lățimea ferestrei» se poate citi ca fereastră dublă; sigur e deplasarea ferestrei păstrând lățimea și asimetria; zone fixe ale vârfurilor 03–10 și 21–03.

Realizabil și fără contradicții în rest: ordinea 1 → 1b → 2 → 2a → 3 → 4 ⇄ 5 → 6 → 7 → 8; `$3/$4` și `$4/$5`; `kmCap` pe același `cum`; cheia cu `m`; ancorarea la poarta cursei.

Deduceri: 2.0. Scor: 8.0 · Blocante (critical/high): 0
