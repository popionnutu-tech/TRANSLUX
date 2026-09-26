# Ce înseamnă «schelet corect» — învățat din scheletele precedente (ION-95, v4 după runda 3 + regula lui Ion «km reali din GPS», 26.09.2026)

Surse citite: codul de pe VPS `root@217.26.149.23:/root/lde-worker/` (copii de citire în `scratchpad/sv/src/`), planul
`docs/plans/2026-09-25-drax-schelet-ideal.md` (origin/main c34d6638), `lde_uzine.reguli_livrare` DRAXELMAIER_BALTI
(`reguli_livrare_la` 2026-09-26 18:04:03 UTC, 16.340 caractere, md5 77c30eee…), memoria proiectului. Trimiterile
`fișier:linie` sunt pe VPS (relative la `/root/lde-worker/`) dacă nu scrie altfel.

Legendă «Drăxlmaier»: **da** = se aplică așa; **adaptat** = se aplică cu schimbarea scrisă; **nu** = nu se transpune (cu motiv).

---

## 1. Uzină cu uzină — ce a învățat fiecare schelet

### 1.1 LEAR Ungheni (`ungheni/cod/`, memoria `ungheni-schelet-rute`, `lear-ungheni-*`, `lear-potrivire-rute-de-ce`)
- Scheletul = etalonul fix față de care se face analitica (Ion 23.09: «pe viitor să nu mai umblăm la el»).
- Pe mașină: o rută din tura A + una din tura B pe zi; care schimb e A se hotărăște O DATĂ pe mașină
  (`ungheni/cod/etalon2.mjs:6-8`, `:47`).
- Zi în etalon doar cu tur ȘI retur până la capăt (`etalon2.mjs:9-11`); etalon = mediana tur+retur (`:12-13`).
- Capătul = primul sat din nomenclator, tăiat pe URMĂ în punctul cel mai apropiat, nu pe opriri (`capatAuto.mjs:7-9`);
  tur = prima apropiere, retur = ultima (`capatAuto.mjs:51-54`); capătul din opriri ȘI treceri (`pereche3.mjs:82-88`).
- Satul unde doarme mașina NU decide ruta (`taieOrd2.mjs:40-45`); sat din nomenclator ≠ sat de trecere, oricât de
  aproape de poartă (`taieOrd2.mjs:22-25`; memoria `lear-ungheni-doua-rute` corecția 23.09).
- Ferestre FER (`taieOrd2.mjs:35`, pe ceasul Ungheni «w_date + 6 h», nu oră locală Intl — nu se folosește ca referință de oră): s1tur 02:30–07:30, s2tur 11–14:30, s1retur 13:30–16:45, s2retur 21:30–02:30.
- Sensul: geometria capetelor întâi, ceasul doar fără dubiu, apoi mediana poziției opririlor (`schimburi5.mjs:6-9`, `:40-42`).
- Tur = retur se verifică pe MEDIANA lunii, nu zi cu zi (zi cu zi 54–59 %, pe mediană 12/18 mașini) — memoria
  `lear-ungheni-doua-rute`; simetria se măsoară pe (rută, schimb, MAȘINĂ).
- Ziua ideală: întâi câte rute ale zilei ajung la capăt, apoi tur≈retur ≤15 %, apoi cât de tipică (`ziuaIdeala3.mjs:47-55`).
- Potrivirea rutelor în analiza săptămânală (`lde-geo-worker/lear-analiza.mjs`, repo): oprire pe drum (proiecția satului pe
  shape), 1 sau 2 opriri după cum capătul e locul întoarcerii, rute comasate (majoritatea curselor X opresc și în satele Y,
  ≥3), `--de-ce MAȘINĂ` (`lear-analiza.mjs:41-43`) înainte de orice prag; ⚠ doar ce modelul nu explică.
- Control pe flotă (memoria `analiza-verifica-toata-flota`): casa ca stație de rută; cursă de schimb fără stație; cursă
  «spre casă» cu stații; >140 km (lipite); eticheta de schimb în afara ferestrei; lipsa unuia din cele 4 schimburi; casa
  desenată ca punct de urcare.

### 1.2 LEAR Florești (`floresti/cod/`, memoria `floresti-schelet-rute`)
- Ziua desenată se alege după URMĂ din TOATE zilele (`floresti/cod/alege.mjs:1-13`): etalonul = mediana zilelor bune
  din ultima lună (≥3), altfel toate (`alege.mjs:46`); zi bună = ambele sensuri tăiate la capăt, tur/retur ≤18 %
  (15 % → 18 % din cauza A5 28,7/24,4), trece prin satele regulate (`alege.mjs:41-44`).
- Satele regulate = sate din act cu oprire în ≥50 % din curse, numărate DOAR pe partea cu oameni (`verif.mjs:1-6`).
- Km bruți nu contează (golurile >5 km sărite de `dk < 5`, `alege.mjs:13`; `sebn/cod/curse.mjs:76`).
- Satele la <2 km de poartă neutre la potrivire; ancorarea capătului dinspre poartă pe drum (`ancoreaza.mjs:1-4`, 1,2 km).
- Gruparea pe (mașină, RUTĂ), nu pe schimb — rotația săptămânală strica gruparea pe schimb (`floresti/cod/etalon.mjs:34-36`).
- Capetele verificate pe un an (`capete2.mjs`): ruta se poate inversa (A2 din august) — tabelul descrie ruta veche.
- Denumirile din act, NU km-ii din act (Ion 24.09). «În schelet gol nu trebuie» (Ion 25.09).

### 1.3 SEBN Orhei + Strășeni (`sebn/cod/`, memoria `sebn-schelet-rute`)
- Tăietura pe urma BRUTĂ, apoi Valhalla separat pe gol și plin; invers se pierde bucla prin sat (`sebn/cod/schelet.mjs:101-106`).
- Bucata potrivită <85 % din cea brută se aruncă (noaptea) (`schelet.mjs:50-55`); capăt ≤1,5 km (`schelet.mjs:13`).
- Orele se trimit ca `Date`, nu text ISO (altfel ±3 h) (`schelet.mjs:88`).
- Rute de oraș care fac buclă → «asimetric», real.
- **Scheletul e al RUTEI, nu al mașinii** (Ion 24.09): schimbarea mașinii nu e greșeală.
- Mașinile reale (GPS) ≠ baza; capetele pot fi mutate după GPS (Cișmea → Crihana).

### 1.4 Trox + suburban Briceni (`briceni/cod/`, memoria `briceni-schelet-rute`)
- Tăcerea tracker-ului cu capetele la ≤100 m = parcare, nu gol de date.
- Capătul = satul cel mai depărtat cu oprire SAU întoarcere, pe DRUM (km nomenclator), nu în linie dreaptă
  (`briceni/cod/curse.mjs:7`, `:44-53`); capătul = punctul cel mai depărtat al mașinii în satul-capăt.
- Orarul potrivește segmentele tăiate pe gară, nu le taie; gara și poarta niciodată amestecate (`geo.mjs:44-46`).
- Verificarea km pe o latură: fiecare cursă față de scheletul de la ACELAȘI capăt, ±10 % (min 1 km) (`verifica-km.mjs:16`):
  96 % din 3.642 curse; variante de drum ≥3 curse și >10 % diferență (`variante.mjs`).
- Ocolul șoferului (drum rar <3 curse printr-un sat din afara rutei) nu intră în km (`verifica-km.mjs:23-24`).
- Control (`briceni/cod/control.mjs:13-42`): tur/retur pe urmă ≤15 %; scheletul ajunge la capăt; separat «nepotriviri»
  informative (sate neatinse, sub 50 %, capăt din orar neatins, curse >1,3 × km nomenclator, tracker mut >10 min);
  dubluri Trox↔suburban suprapuse = 0.

### 1.5 Interurbane mejgorod (`mejgorod/cod/`, memoria `mejgorod-schelet-rute`)
- Cursa se taie la oprirea cea mai AVANSATĂ atinsă (≤3 km), nu la ultima din grafic; capătul real = modul pe zile.
- Zi bună: capetele reale atinse, ≥80 % din opririle dintre capete (`mejgorod/cod/etalon.mjs:16`), gările doar dacă
  rutiera intră în majoritatea zilelor (`etalon.mjs:41-44`).
- Scheletul SIMETRIC: un drum pe rută din tronsoane ale AMBELOR sensuri, mediană (`ideal.mjs:1-6`); tronsonul după
  minim (nu mediană) a scos idealul cu 20 km mai scurt.
- Control (`mejgorod/cod/control.mjs`): tur≠retur >5 % (`:20`); capete reale ≠ grafic (`:23`); opriri pe lângă care nu trece
  în ≥50 % zile (`:26`); ora la ≥15 min de grafic (`:30`); linia zilei ≠ etalon >3 % (`:32`); zile bune <60 % (`:34`);
  mașini fără tracker (`:36`); ideal: nu ajunge / sare opriri (`:47`), tur≠retur pe același drum >1 % (`:49`), realul ≠
  scheletul >3 % (`:51`).

### 1.6 Drăxlmaier real ION-45 (`drax/cod/`, memoria `drax-schelet-rute`)
- Unitatea rută × LINIE × schimb × mașină; capătul = cel mai depărtat Starting point al rutei atins (`drax/cod/etalon.mjs:10-12`).
- Omonime: locul atins cel mai des de mașinile rutei; fără atingeri, cel mai apropiat de AL DOILEA sat (`etalon.mjs:49-50`).
- Plăcuța = CarName; reetichetare DOAR pe eticheta veche a aceluiași dispozitiv; 350KAJ = două dispozitive.
- Control (`drax/cod/control.mjs:12-35`): capăt = casa (informativ; «la Drăxlmaier multe dorm chiar la capăt»);
  tur≠retur >15 %; >140 km; un singur schimb; gol>plin; GPS vs KW24÷2 în afara 70–115 %; mașină cu ≥3 linii pe schimb;
  aceeași cursă pe două linii; linie KW24 fără schelet; fără urmă.
- Greșit la ION-45 și corectat la ION-71: «fiecare linie face 4 curse/zi» (număra ambele schimburi și fiecare mașină).

### 1.7 Drăxlmaier ideal ION-71 (`drax/cod/ideal/`, `docs/plans/2026-09-25-drax-schelet-ideal.md`)
Lanțul `lant.sh:6-23`: fix-350 → fix-dubluri → etalon → ore → verif → schelet --lot=0..2 → alege → schimburi →
care-schimb → control → pagina.
- Flota: grafic, lista 22.09 sau semnătura ≥15 zile la poartă și ≥2,3 vizite/zi, plus ≥5 zile (`curse.mjs:19`, `:76-80`).
- Cursa se închide la poartă, la staționare >25 min, la gol >2 h (`curse.mjs:102-110`).
- Dubluri: `fix-350.mjs` (`X#id` → `X`, fără dedup!); `fix-dubluri.mjs:18` (două plăci, ≥80 % curse coincid, ±3 min, ±1 km).
- Capătul: Starting point, omonime după al doilea sat, `R_CAPAT_CURSA` 2,5 km (`etalon.mjs:52-57`); linia `*` pentru mașina
  din grafic fără start atins (`:61-64`); fără grafic, gol > plin nu ia linia (`:70`).
- FER (`etalon.mjs:26`) = s1 tur 03:30–07:00, s2 tur 13:30–16:00, s1 retur 15:00–17:45, s2 retur 23:00–01:45; cursele în
  afara FER intră în `obs` cu `schimb: null` (`:87`, `:102`); FER se reînvață doar dacă afara sept − mai–iul >10 pp sau
  modurile se mută >30 min (`ore.mjs:3-4`, `:20`, `:33`).
- Perechea pe `ruta|linie|schimb|mașină|zi` (`etalon.mjs:104`); candidată = tur ȘI retur la capăt, ≤25 % pe brut (`:135`).
- `ture/zi` = mediana perechilor (schimb, mașină) pe zi, doar mașini cu ≥3 zile cu ambele sensuri, dedup ±3 min (`:115-128`).
- Satele regulate: ≥50 % din curse pe sursă și SENS, partea cu oameni = opririle cu km ≥ kmCap − 0,8 (tur) (`verif.mjs:1-6`,
  `:37-51`); oprire în sat ≤1,2 km; locurile la <4 km de porți neutre (`verif.mjs:22`); `inPlus` ≥25 %.
- Tăietura: capăt ≤1,5 km pe urma brută, Valhalla doar pe `plin`, bucata <85 % aruncată, ancorare la POARTA CURSEI
  (`schelet.mjs:11`, `:47`, `:93-109`); loturi de 8, plafon 24, lotul 2 = mai–iulie (`schelet.mjs:1-6`, `:119`).
- Alegerea (`alege.mjs:1-11`, `:20`): sursa o dată (sept ≥3 zile bune, altfel toate ≥3); zi bună ≤18 % pe urmă + regulate;
  etalon = mediana pe urmă; ziua în ±5 %, max opriri; `asim`; `kmZi = 2 × km × ture/zi`; `*` doar dacă ruta n-are linie din act.
- Regimul (`schimburi.mjs:27-37`): săptămână ISO «putin» <2 zile, «ambele» ≥max(2, 50 %), «s1»/«s2» ≥70 %; regim «ambele»
  ≥60 % din săpt.; «rotație» dacă s1+s2 ≥60 % și consistența parității ≥80 %.
- Control (a)–(m) (`control.mjs:16-55`): blocante (a), (f), (g), (l), (m).

---

## 2. Controalele învățate (C1…C47) — definiție · prag · sursă · Drăxlmaier

| # | Control | Definiție și prag | Sursa | Drăxlmaier |
|---|---|---|---|---|
| C1 | Flota din urmă | Mașina e a uzinei dacă a fost la poartă ≥4 zile/săpt. (analiză); scheletul: grafic / listă / semnătură ≥15 zile și ≥2,3 viz/zi, ≥5 zile | memoria `analiza-uzina-din-munca`; `drax/cod/ideal/curse.mjs:19,76-80` | **da** (ambele porți = aceeași uzină) |
| C2 | Plăcuța dispozitivului | CarName întâi, RegNo doar dacă CarName nu e plăcuță; reetichetare doar pe eticheta veche a aceluiași dispozitiv | memoria `drax-schelet-rute`; `drax/cod/schelet.mjs:84-86` | **da** |
| C3 | Dispozitiv dublu între plăci | Două plăci cu ≥80 % curse coincidente (aceeași zi, ±3 min, ±1 km) = un autobuz; se unesc sub plăcuță | `ideal/fix-dubluri.mjs:1-3,18` | **da** |
| C4 | Autodublură pe aceeași placă | După ORICE unire, aceeași placă, zi de lucru, același tip de deplasare, ≤15 min între plecări, cel puțin una cu rută. **«Sigur» = intervalele se SUPRAPUN în timp** (`b.t0 < a.t1`): un autobuz nu face două deplasări simultane. «De verificat» = secvențiale, ambele cu rută; saltul între porți → V6. Efectul se măsoară pe copie PE DISPOZITIV (păstrează cursa lungă / scurtă a fiecărei perechi) pe metricile GPS (zile bune, etalon GPS >5 %, ziua aleasă, ture/zi, ore ≥15 min, sate regulate); nemăsurabil = NEDETERMINAT = blocant | triaj ION-95 r2 (N3, Codex C1); `fix-350.mjs:6-8`; `fix-dubluri.mjs:26-27` | **adaptat — lipsește din lanț** |
| C5 | Ora locală | Parserul 1114 e UTC (`ideal/curse.mjs:12`), dar lanțul ION-71 face ora locală cu **UTC+3 fix** (`ideal/etalon.mjs:19-21`, `fix-dubluri.mjs:8`) → corect doar în EEST (29.03–25.10.2026); verificatorul folosește Intl `Europe/Chisinau`; ziua de lucru 03:00→03:00 | `lde-geo-worker/ora-locala.mjs`; memoria `lear-ungheni-tur-retur-ore` | **adaptat**: blocant dacă fereastra iese din EEST |
| C6 | Închiderea cursei | La poartă, la staționare >25 min, la gol >2 h între puncte (primul test) | `ideal/curse.mjs:102-110`; memoria `analiza-verifica-toata-flota` | **da** |
| C7 | Sensul cursei | Geometria capetelor întâi (se termină la poartă = tur); poartă→sat→poartă (`rt`) poartă ambele sensuri; ceasul doar fără dubiu | `ungheni/cod/schimburi5.mjs:6-9,40-42`; `ideal/etalon.mjs:83,91-95` | **adaptat**: `rt` dă un sens mereu în afara FER (vezi D7) |
| C8 | Ferestre FER | Tur după sosire, retur după plecare, ferestre pe schimb; `afara` numărat doar pe cursele cu rută, poartă relativă (+10 pp / ±30 min) | `ungheni/cod/taieOrd2.mjs:35`; `ideal/etalon.mjs:26`; `ideal/ore.mjs:3-4` | **adaptat**: două porți, aceleași ferestre pe EST/VEST (`lde_uzina_ferestre_ceas`) |
| C9 | Capătul = start din act | Primul sat al rutei / «Starting point»; nu prima oprire (satul-casă apărea ca urcare la km 0 → «ai dublat ruta») | memoria `lear-ungheni-nomenclator`; `ungheni/cod/capatAuto.mjs:7-9`; reguli §4.1 | **da** (pe LINIE) |
| C10 | Capătul din opriri ȘI treceri | La capăt nu oprește nimeni la întoarcere; tur = prima apropiere, retur = ultima | `ungheni/cod/pereche3.mjs:82-88`; `capatAuto.mjs:51-54` | **da** |
| C11 | Capătul atins | Urma ≤1,2 km (apropiere) / ≤1,5 km (tăietură) SAU cursa începe/se termină ≤2,5 km de el | `ideal/etalon.mjs:52,57`; `ideal/schelet.mjs:11`; reguli §4.2 | **da** (specific Drăxlmaier) |
| C12 | Omonime | Locul atins cel mai des de mașinile rutei; fără atingeri, cel mai apropiat de al doilea sat | `drax/cod/etalon.mjs:49-50`; reguli §4.3 | **da** |
| C13 | Sat din act ≠ sat de trecere | Filtrul de proximitate se aplică doar satelor din afara actului; neutre: <2 km (Florești), <4 km de porți la Drăxlmaier (codul `ideal/verif.mjs:22`; comentariul `verif.mjs:5` spune încă 2 km) | `ungheni/cod/taieOrd2.mjs:22-25`; `ideal/verif.mjs:22`; reguli §4.4 | **da** (prag 4 km) |
| C14 | Casa nu decide ruta | Satul unde doarme nu intră în cheia de potrivire; casa nu e stație la începutul/sfârșitul zilei | `ungheni/cod/taieOrd2.mjs:40-45`; memoria `analiza-verifica-toata-flota` | **adaptat**: la Drăxlmaier casa e des PE linie (35/44 în F2; «dorm la capăt», `drax/cod/control.mjs:12`) → informativ, nu eroare |
| C15 | Tăietura pe brut, apoi Valhalla | Tăiere la capăt pe urma brută, `trace_route` după; bucata potrivită <85 % din brut se aruncă | `sebn/cod/schelet.mjs:50-55,101-106`; `ideal/schelet.mjs:47,93` | **da** |
| C16 | Ancorarea la poartă | Capătul dinspre poartă se leagă pe drum (>1,2 km → Valhalla) la POARTA CURSEI | `floresti/cod/ancoreaza.mjs:1-4`; `ideal/schelet.mjs:101-104` | **adaptat**: poarta cursei (EST sau VEST), nu una fixă |
| C17 | Zi bună doar cu tur ȘI retur | Ambele sensuri la capăt, altfel zi ciuntită | `ungheni/cod/etalon2.mjs:9-11`; `ideal/etalon.mjs:135` | **da** |
| C18 | Tur ≈ retur pe zi aleasă | ≤15 % (Ungheni/SEBN) → ≤18 % (Florești A5, Drăxlmaier) | `floresti/cod/alege.mjs:41-44`; `ideal/alege.mjs:20` | **da** (18 %) |
| C19 | **Etalon = mediana km GPS completați** | Ion, 26.09: «nu folosim geometria, folosim km reali din GPS». Modulul comun `etalon-gps.mjs` (verificator + F3): picioarele de pe POARTA SENSULUI, km = `plin` + raza porții (EST 0,6 / VEST 0,5, `drax/cod/ideal/curse.mjs:18`, fișier sigilat), mediana pe zilele bune GPS (≥3); lanțul ION-71 ia lungimea urmei potrivite pe șosea (`alege.mjs:60`) | Ion 26.09; triaj ION-95 r3 Q1 (c) | **adaptat** |
| C20 | Sursa = regimul de acum | Ultima lună / septembrie dacă ≥3 zile bune, altfel toată fereastra (tot ≥3) | `floresti/cod/alege.mjs:4-7,46`; `ideal/alege.mjs:54-56` | **da** |
| C21 | Satele regulate | Sat din act cu oprire în ≥50 % din curse, pe sursă ȘI sens, doar pe partea cu oameni (kmCap ± 0,8); `inPlus` ≥25 % | `floresti/cod/verif.mjs:1-6`; `ideal/verif.mjs:1-6,37-51` | **da** |
| C22 | Ziua aleasă | În ±5 % de etalon, cele mai multe opriri reale în satele din act, apoi tur≈retur; verificatorul cere și ca ziua aleasă să fie zi bună GPS | `ideal/alege.mjs:7-8,61-63` | **da** |
| C23 | Harta | Drumul desenat = km card ±5 % — **doar consecvența hărții, nu sursă de km** (Ion 26.09) | plan ION-71 Verificare 7; `mejgorod/cod/control.mjs:32` (3 %) | **adaptat** (informativ) |
| C24 | Un drum pe unitate, tur = retur | Idealul = turul zilei alese, returul = oglinda; simetria reală se verifică pe mediană | `mejgorod/cod/ideal.mjs:1-6`; memoria `lear-ungheni-doua-rute` | **adaptat**: pe schimb unde s1≠s2 >18 % (reguli §6.6, Sturzovca) |
| C25 | Tronsoane din ambele sensuri | Idealul din tronsoane oprire→oprire, mediana ambelor sensuri | `mejgorod/cod/ideal.mjs:4-5` | **nu** pe liniile cu ideal (cursa întreagă există zilnic, plan ION-71 «Variante respinse»); **da, ca opțiune de propus** pe liniile din act fără ideal (servire observată fără pereche pe același schimb) |
| C26 | Gruparea pe rută, nu pe schimb | Rotația mută ruta între schimburi; grupează pe (mașină, rută) / (rută, linie) | `floresti/cod/etalon.mjs:34-36`; plan ION-71 «Ce facem» | **da** (rută × linie) |
| C27 | Tura A/B pe mașină | Care schimb e A se hotărăște o dată pe mașină | `ungheni/cod/etalon2.mjs:6-8` | **nu** — la Drăxlmaier rotația e pe săptămâni ISO și pe grupă (D / E+Z), nu pe mașină |
| C28 | Ture/zi măsurate | Mediana perechilor (schimb, mașină) pe zi, mașini cu ≥3 zile cu ambele sensuri, dedup ±3 min | `ideal/etalon.mjs:115-128`; reguli §6.5 | **da** (specific Drăxlmaier) |
| C29 | Loturi de candidate | 8 pe lot, sept. întâi, lotul 2 = mai–iulie, plafon 24 | `ideal/schelet.mjs:1-6,119` | **da** |
| C30 | `asim` | Fără 3 zile bune nicăieri, dar candidate prin satele regulate → ziua cu dif minimă, km = turul | `ideal/alege.mjs:9,65-68` | **da** |
| C31 | Linie din act fără ideal | Blocant până e explicat | `ideal/control.mjs:17` (a) | **da** |
| C32 | Sursa «toate» | Informativ: regimul de acum n-a dat 3 zile | `ideal/control.mjs:19` (b) | **da** |
| C33 | Tur ≠ retur real | 100×\|t−r\|/max(t,r), înainte de rotunjire: >18 % sau `asim` = abatere (Drăxlmaier); banda 15–18 % informativă (15 % = pragul Ungheni/SEBN/Briceni/ION-45); >5 % (mejgorod real) | `ideal/control.mjs:21`; `briceni/cod/control.mjs:13,30`; `mejgorod/cod/control.mjs:20` | **da** (18 %) |
| C34 | s1 ≠ s2 pe aceeași linie | Mediana s1 vs s2 >18 % | `ideal/control.mjs:23-25` (c2) | **da** (specific Drăxlmaier) |
| C35 | Sat din act cu 0 % pe rută | Pe rută, toate liniile, ambele sensuri | `ideal/control.mjs:27` (d); `ideal/verif.mjs:58` | **da** |
| C36 | Aceeași cursă pe două linii | `m|zi|schimb|sens|t0` pe două linii | `ideal/control.mjs:31-33` (f); `drax/cod/control.mjs:29-31` | **da** |
| C37 | Dispozitiv dublu pe aceeași linie | Mașini diferite, aceeași linie/zi/schimb/sens, ±3 min, ±1 km, ≥3 curse. **În cod** raportul se face la `mn` = maximul curselor mașinii pe linia ei cea mai încărcată (`lin` nefolosit), deci e subestimat la o mașină cu multe linii; verificatorul împarte la cursele mașinii mai mici PE ACEA linie; ≥50 % = BLOCANT | `ideal/control.mjs:34-39` | **da** (numitor corectat) |
| C38 | Cursă >140 km | Două curse lipite. **În cod** se verifică ziua aleasă a liniei (`turZi`/`returZi`), nu fiecare cursă; verificatorul verifică și observațiile (informativ) | `ideal/control.mjs:41` (g); memoria `analiza-verifica-toata-flota` | **da** |
| C39 | Mașină din grafic fără linie | Informativ, cu zilele la poartă | `ideal/control.mjs:43-44` (h) | **da** |
| C40 | Linie servită de ≥3 mașini | Informativ | `ideal/control.mjs:46` (i) | **da** |
| C41 | Linie `*` | Fără start din act; informativă dacă ruta are linie din act | `ideal/control.mjs:48` (j); reguli §4.6 | **da** |
| C42 | Ture/zi ≠ act | GPS ≠ EZ + D din act; steaguri `tureZiDinToate/DinAct` | `ideal/control.mjs:50-51` (k) | **da** |
| C43 | Capăt cu 0 atingeri / km ≤ 0 | Blocante | `ideal/control.mjs:53,55` (l), (m) | **da** |
| C44 | Potrivirea rutelor și `--de-ce` | Oprire pe drum (proiecție pe shape), 1–2 opriri, comasare ≥3 curse majoritare, diagnostic cursă cu cursă înainte de prag; ⚠ doar ce nu se explică | `lde-geo-worker/lear-analiza.mjs:41-43`; memoria `lear-potrivire-rute-de-ce` | **adaptat**: echivalentul la Drăxlmaier e diagnosticul pe linie (cursele obs + `alege(c, sens)`), nu pe listă de rute |
| C45 | Comasarea nu adaugă km | «nu mai adăuga km în scheletul rutei» (Ion 24.09) | memoria `lear-potrivire-rute-de-ce` | **da** |
| C46 | Scheletul e al rutei, nu al mașinii | Schimbarea mașinii nu e greșeală de raportat | memoria `sebn-schelet-rute` (Ion 24.09) | **da** |
| C47 | Km GPS cursă cu cursă | Fiecare picior vs **etalonul GPS al liniei**, toleranță max(10 % × E, 1 km), pe POARTA FIECĂRUI SENS (tur → poarta turului, retur → poarta returului), `rt` separat, fără cursele scurte ale dublurilor; 90 % = reper, <60 % = abatere cu diagnostic | `briceni/cod/verifica-km.mjs:16,23-24`; triaj ION-95 r2 (N4, R6) | **adaptat — lipsește la Drăxlmaier** |
| C48 | Capătul real ≠ grafic | Modul pe zile; acoperire ≥80 % doar între capetele reale | `mejgorod/cod/etalon.mjs:7-9,16,31-33`; `mejgorod/cod/control.mjs:23` | **adaptat**: mutarea capătului NU (reguli §4.1); raportarea capătului real față de act DA, informativ |
| C49 | Gări ca condiție | Doar dacă rutiera intră în majoritatea zilelor | `mejgorod/cod/etalon.mjs:41-44` | **nu** — nu există gări; analogul e C21 |
| C50 | Tăcerea tracker-ului = parcare | Goluri mute cu capete ≤100 m = staționare, nu gol de date | memoria `briceni-schelet-rute`; F2 (`docs/plans/2026-09-26-drax-f2-raspunsuri.md:147`) | **adaptat**: afectează orele la poartă (EST 22:38 → 00:04), nu tăietura; C6 închide la >2 h |
| C51 | Tăierea pe gară/poartă, orarul doar potrivește | Segmentele se taie pe gară/poartă; orarul nu taie | memoria `briceni-schelet-rute` | **nu** direct — Drăxlmaier n-are orar; echivalentul e C6 (poarta taie) |
| C52 | Capăt = punctul cel mai depărtat în sat | Unde se întoarce mașina, nu prima/ultima oprire | `briceni/cod/curse.mjs:51-53` | **adaptat**: la Drăxlmaier tăietura ia punctul cel mai apropiat de centrul startului (≤1,5 km); diferența ≤1,5 km/cursă, informativ |
| C53 | Mașina altei uzine | Poarta altei uzine în ≥ zilele la a noastră și 0 rute din schelet → afară | memoria `floresti-schelet-rute` (lear-analiza «altă uzină») | **da** (518MHD, 350KAJ sunt Drăxlmaier; la Florești ies) |
| C54 | Service Bălți | Drumurile la Parcul Bălți nu apar (LEAR §11.4) | memoria `trasee-reguli-navetă-service` | **nu** la schelet — parcul e la 0,70 km de VEST; tratat în F2 (zona 0,5 km), nu în schelet |

**Total: 54 de controale învățate; se transpun la Drăxlmaier 50** (35 «da» + 15 «adaptat»: C4, C5, C7, C8, C14, C16, C19, C23, C24, C25 parțial, C44, C47, C48 parțial, C50, C52 — C19 și C23 trec la «adaptat» după regula km GPS); **nu se transpun 4** (C27, C49, C51, C54). Controale noi: R1, G1, V1–V6, X1 (9) și D1–D8 (8). **Total final: 71.**
Două controale adaptate lipsesc din lanțul ION-71 și sunt noi: **C4** (autodublura pe aceeași placă) și **C47** (km pe o latură).

### Controalele din riscurile codului ION-71 (V1–V5, Codex r0)

| # | Control | Sursa riscului |
|---|---|---|
| V1 | (m) pe toate liniile care nu-s `faraIdeal`/`deCompletat` — codul filtrează prin `l.km` înainte de (m), deci 0/null nu ajung la verificare | `ideal/control.mjs:14` |
| V2 | Dedup-ul ±3 min din `ture/zi` unește și mașini DIFERITE plecate împreună → poate subnumăra turele | `ideal/etalon.mjs:122` |
| V3 | Cheia `m|t0` din `alege` suprascrie observații (picioarele `rt`, dublurile) → opririle folosite la alegerea zilei pot fi ale altui picior | `ideal/alege.mjs:34` |
| V4 | «Curse» = observații pe sens, nu deplasări; fiecare cifră spune unitatea | `ideal/etalon.mjs:83` |
| V5 | Regim «ambele» fals când nicio săptămână nu e completă (`0 >= 0`) → «date insuficiente» | `ideal/schimburi.mjs:29` |
| V6 | Salt între porți | Deplasare poartă → altă poartă ≤5 km (măsurat 3,6–4,0 km): nu e cursă și nu e dublură; atribuită unei linii = informativ, corecție în lanț | triaj ION-95 r2 (N3, N10) |
| R1 | Chei rută × linie | Fiecare linie din act e în schelet o singură dată și invers; lipsă / necunoscută / dublă = blocant; probă cu o linie scoasă | Codex r1 C2 |
| G1 | Km card = km GPS | Etalonul GPS completat (C19) față de km-ul cardului: >5 % = blocant; nedeterminat = blocant. Corecția: cardul ia etalonul completat — directă doar dacă C47 ≥60 % pe linie, altfel «diagnostic cerut» (două variante de drum posibile) | Ion 26.09; triaj r2 Q3, r3 Q1/M2 |
| X1 | Registru mort | Explicație care nu mai explică nimic (alt sha al scheletului, altă constatare) = abatere | triaj r2 (bk M1) |

## 3. Controalele proprii Drăxlmaier (D1…D8) — «turele diferite un pic»

| # | Control | Definiție și prag | Sursa |
|---|---|---|---|
| D1 | Regimul, linie cu linie | Pe aceeași fereastră ca idealul (sursa liniei) și, informativ, pe toată fereastra; «regim sursă ≠ total» = abatere. Alternanța cu **faza majoritară** (nu ultima săptămână, nu paritatea ISO: 2026 are ISO 53; pe fereastra de azi cele două coincid). W53: informativ; abatere din 01.12.2026 dacă `care-schimb` mai are paritate; blocant pentru date ≥ 21.12.2026 | `ideal/schimburi.mjs:27-43`; triaj ION-95 r2 (N6, N8, R8) |
| D2 | Grupa Z, condiționat pe grupa din act | Z nu are semnal GPS. Zile cu pereche pe ambele schimburi pe o linie de rotație / «doar»: **bloc** (≥3 zile în aceeași săptămână) = «ambele parțial pe perioadă», nu Z; **izolat** (≤1 pe săptămână): EZ → «posibil Z», D → abatere (nu Z), EZ+D → fără semnal. Niciodată «greșit» | dezbaterea ION-95 Q4; triaj r2 (N6, R5) |
| D3 | Linii cu 1/2/3 perechi pe zi | `ture/zi` (C28) vs act (C42) + cine le face: aceeași mașină pe ambele schimburi sau mașini distincte | `ideal/etalon.mjs:115-128`; măsurat azi |
| D4 | Atribuirea porții | Poarta modală pe tur și pe retur, pe schimb; linia cu porți diferite pe s1/s2 se listează; ancorarea la poarta cursei (C16) | `ideal/alege.mjs:90,94-95`; `ideal/schimburi.mjs:39` |
| D5 | FER pe fiecare poartă | Aceleași ferestre pe EST și VEST (bază: tur s1 210–420, tur s2 810–960, retur s1 900–1065, retur s2 1380–105); se verifică orele mediane pe poartă | `lde_uzina_ferestre_ceas` DRAXELMAIER_BALTI; reguli §2–§3 |
| D6 | s1 ≠ s2 | Blocant DOAR dacă ≥3 zile candidate pe FIECARE schimb ȘI medianele observațiilor pe schimb diferă >18 %; altfel «eșantion mic» / «neconfirmat» = un singur km, cu diagnostic pe zilele atipice | `ideal/control.mjs:23-25`; reguli §6.6; triaj ION-95 r2 (N2, R3) |
| D7 | Deplasări fără schimb la prânz, pe MECANISM | Salt între porți / geamăn `rt` (aceeași deplasare poartă→sat→poartă, un picior în fereastră, `etalon.mjs:82-83`) / `rt` fără picior / goală / **regulată** (aceeași mașină ±30 min, ≥5 zile → F4) / rest = întrebare; liniile din act fără ideal: observații, deplasări, `rt`, zile încrucișate (tur s1 + retur s2), mașini. Ferestrele nu se schimbă | F2 `docs/plans/2026-09-26-drax-f2.md:39,61,266`; triaj ION-95 r2 (B2, R7) |
| D8 | Dubluri de dispozitiv | C3 + C4 + C37; «sigur» cu efect pe o linie cu ideal = blocant; «de verificat» = diagnostic | `ideal/fix-350.mjs`, `fix-dubluri.mjs`; F2 `docs/plans/2026-09-26-drax-f2.md:273` |

## 4. Ce NU se transpune și de ce (rezumat)

1. **Tura A/B fixă pe mașină** (Ungheni): la Drăxlmaier rotația e pe grupă și pe săptămâni ISO; aceeași linie cade când pe
   s1, când pe s2 → gruparea pe rută × linie.
2. **Tronsoanele din ambele sensuri** (mejgorod): nu pe liniile cu ideal (cursa întreagă există zilnic); rămân opțiune pentru liniile din act fără ideal.
3. **Capătul real mutat după urmă** (mejgorod, SEBN Cișmea → Crihana): la Drăxlmaier capătul e din act (§4.1); raportarea capătului real rămâne, informativ.
4. **Gările și orarul** (mejgorod, Briceni): nu există orar; poarta taie cursa.
5. **Casa ca eroare** (LEAR «casa ca stație»): la Drăxlmaier mașinile dorm des în satele liniei (35/44 în F2) — C14 e «adaptat» (informativ), nu «nu se transpune».
6. **Service = Parcul Bălți** (LEAR §11.4): parcul e lângă poarta VEST (0,70 km) — hotărât în F2 ca «lângă uzină», nu ține de schelet.
7. **Km-ul din act** (Florești, Drăxlmaier) nu e un control, ci o regulă de sursă: actul dă doar liniile și satele, niciodată km-ul (Ion 24.09 / decizia 2 ION-71).
