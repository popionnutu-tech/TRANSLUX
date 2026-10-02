# Bilete aparat: «Piața» pe fiecare tip de bilet (adâncimea pieței, nu «stații»)

Întrebarea lui Ion (01.10.2026, pe captura /numarare?tab=bilete): «în loc de stații ar fi bine
pe fiecare tip bilet să identificăm pentru această locație potențiali câți clienți pot fi
totali, ca să înțelegem adâncimea pieții; avem 2 momente: populația la localitate sau zonă și
costul biletului; ambele influențează câți oameni vor circula lunar din acea zonă. Cum am putea
avea așa o cifră și cum?»

Acesta e un plan de METODĂ (ce cifră, din ce surse, cu ce formulă, cum se verifică). Nu se
implementează în această sesiune; după cele trei runde de critică și răspunsurile lui Ion devine
tichet Linear. Versiunea de față = v6, FINALĂ după cele trei runde (revizori Claude + Codex; review-urile și triajele sunt la sfârșit). Gate trecut: zero critical/high deschise la ambele părți.

## De ce

Coloana «Sursa» (stații / dedus din preț) e un detaliu tehnic al exportului; în septembrie 0,0 %
din bilete au tipul dedus, deci coloana nu mai spune nimic. În locul ei Ion vrea să vadă, pe
fiecare pereche de stații, CÂT DE MARE e piața din care luăm biletele: dacă din Briceni vindem
2.396 bilete pe lună, asta e 20 % sau 80 % din tot ce circulă? Fără cifra asta nu se poate decide
unde merită o cursă în plus, unde merită alt preț și unde piața e deja plină și singura luptă e
cota.

## Ce facem

**Decizia: o coloană «Piața» pe pereche, cu o cifră principală măsurabilă azi («din ofertă» =
cât se vinde în total pe coridor, toți transportatorii), un PLAFON separat acolo unde se poate
calibra («potențial din populație» = câți ar circula la rata satelor fără concurenți), un
numitor de scară (bazinul de populație) și prețul ca afordabilitate la hover. Fiecare componentă
e numărată o singură dată, în aceeași unitate (bilete pe pereche, pe lună încheiată), și e
afișată cu ce e observat și ce e presupus.**

Pe fiecare pereche (A – B) afișăm:

```
Chișinău – Criva (tip 3, 2 curse străine):
Piața   190–230 bilete / lună        ← «din ofertă»: toți transportatorii, ambele sensuri (≈ N/2 drumuri dus-întors)
        noi 67 % (+ ~3 % omiși est.) ← biletele noastre OBSERVATE (140) ÷ mijlocul intervalului; omișii, estimați de model, separat
        bazin 920 loc.               ← populația legată de capătul mic (RPL 2024); numitor de scară, nu «clienți posibili»
        potențial —                  ← doar când banda e calibrată ȘI stabilă (azi nu e, vezi 2b); la un oraș (tip 4) nu apare niciodată

Chișinău – Edineț (tip 4, 31 curse străine): aceleași rânduri, fără «potențial»; bazin 11.300 loc.
```

iar la hover: componentele «din ofertă» (bilete; ~omiși + acoperirea Numărării; concurenți:
curse/zi × locuri × rulajul coridorului de referință × cota; steaguri), coridorul de referință cu
rulajul și plecările lui, rata proprie față de P75 (pe perechile din setul de calibrare),
prețul mediu plătit pe sens și afordabilitatea (net și pensie).

### Unitățile (fixate o dată, folosite peste tot)

- **Bilet** = o călătorie pe un sens. Tur 14.014 / retur 12.732 în 09.2026: oamenii fac
  dus-întors, deci «N bilete ≈ N/2 drumuri». Pagina scrie asta lângă cifră.
- **Bazin** = persoane cu reședința obișnuită (RPL 2024) legate de capătul mic al perechii.
  Biletele perechii le cumpără și nerezidenți (studenți, cei care lucrează în Chișinău, rude,
  diaspora în vizită) — «bilete ÷ bazin» poate trece de 1 și NU înseamnă «x % din sat pleacă».
  Indicator de scară, afișat separat, cu nota asta.
- **Rulaj pe loc** = bilete atribuite pe rută și sens (`tiki_leg_daily`) ÷ locuri pe PLECĂRILE
  FIZICE din grafic (`tiki_plecari_daily`), numai pe zilele-rută în care TOATE plecările zilei au
  locuri (`plecari_cu_locuri = plecari AND locuri > 0`, filtrul din migr. 455:24 — altfel revine
  bugul 438 % de pe ruta 2), biletele numărate pe aceleași zile. NU din `tiki_trips`: un `trip_id`
  e o deschidere de terminal pe două sensuri, nu o plecare (migr. 452:4-6). În 09.2026, cu filtrul
  455: 56 rută-sensuri, 1.631 plecări, 32.963 locuri, 25.826 bilete = 78,3 %; între 44 % și 148 %,
  mediana 72 % (biletele sunt pe tronson: oamenii urcă și coboară). Locurile NOASTRE sunt 20 pe
  plecare (migr. 452:6-7, Ion: «toate sunt de 20 de locuri»; Ford 17). Rulajul se calculează pe
  **coridor și sens**, nu pe o rută: «Chișinău–Lipcani» sunt 8 rute (10, 12, 13, 16, 18, 19, 22, 27)
  cu rulaj de la 5 % la 104 %; pe coridor 62 %.
- **Bilet observat ≠ omis estimat.** Omișii de TIKI (`tiki_ceilalti_od`, migr. 458:90-115) sunt
  reconstruiți din variația încărcării pe tronsoane, cu coborârile repartizate proporțional: pe
  A–B–C cu încărcare constantă 10, dacă 10 oameni A–B coboară la B și urcă 10 B–C, algoritmul vede
  10 oameni A–C. Omișii pe pereche sunt o ESTIMARE de model. Peste tot în plan: biletele = limita
  inferioară certă; omișii = termen estimat, afișat separat cu «~», niciodată într-o regulă «≥».
- **Luna** = lună calendaristică ÎNCHEIATĂ, pe ziua cursei (`tiki_ticket_attr` →
  `tiki_trips.trip_date`), aceeași bază pentru tot rândul. Prima lună cu «din ofertă» = **05.2026**:
  locurile din grafic există din 04.04.2026 (migr. 452:383, 399-406; `tiki_plecari_daily` 03.2026 =
  1.521 rânduri, toate `sursa='bilete'`, 0 cu locuri), iar Numărarea din 28.03. Lunile ≤ 04.2026
  arată «—» cu motivul «fără grafic de locuri»; jobul REFUZĂ o lună fără zile-rută cu locuri, nu
  scrie 0. Coloana «Bilete» de azi e pe ziua vânzării — se aliniază la implementare sau se notează.

### Clasificarea perechii (4 reguli, în ordine)

1. Niciun capăt nu e Chișinău → **«aceeași coadă, fără Chișinău»** (Bălți–Edineț, Briceni–Lipcani,
   Beleavinți–Briceni, Edineț–Halahora): bilete observate + «~omiși» separat; fără concurenți ANTA
   (concurența reală = rutierele raionale, care nu-s în foaia interraională); fără potențial.
2. Celălalt capăt e în lista nominală de **trunchi** (Orhei 278, Strășeni 196, Bălți 136,
   Soroca-intersecție 109, Călărași 86, Sîngerei 51 curse ANTA spre Chișinău — memoria din 21.09)
   → bilete + «~omiși», marcat «trunchi»; fără «din ofertă» și fără potențial. Un capăt de rută nu
   e niciodată trunchi (Edineț 31, Briceni 12 curse străine = coadă); pragul «> 12» rămâne doar
   pentru tăierea cozii pe o rută.
3. Celălalt capăt are **≤ 2 curse străine** (cu raion) → «din ofertă» (interval) + potențial, dacă
   banda e calibrată (Criva 2, Hlina 1, Drepcăuți 1, Corpaci 1, Trinca 1, Corjeuți 0, Halahora 0,
   Beleavinți 0, Caracușenii Vechi 0).
4. Altfel (Briceni 12, Edineț 31, Cupcini 15, Ocnița 15, Lipcani 8, Rîșcani 28…) → «din ofertă»
   (interval) cu concurenții repartizați; potențialul NU se afișează (nu există set de calibrare
   pentru orașe); la hover rata proprie ca informație.

Omișii se afișează la fel în toate cele patru cazuri: separat, cu «~», cu acoperirea Numărării.

### Stratul 1 — bazinul de populație

RPL 2024 (BNS, anexa pe localități: foile 8.3 total/sexe și 8.4 vârste 0–14 / 15–64 / 65+).
Bazinul unei stații = localitatea + satele FĂRĂ stație proprie a căror stație cea mai apropiată
e aceea (coordonate din `anta_localities`; rază R = 10 km — Ion, 02.10; parametru; fiecare sat la o singură
stație; un sat cu stație proprie în TIKI — Beleavinți, Corjeuți, Hlina, Criva — e bazinul lui, nu
al vecinului). Omonimele se leagă cu `LocalityIndex` din `apps/admin/src/lib/anta/district.ts`
(vecinii de pe rută + coordonate), nu pe nume gol; opririle «(intersecție)» nu se leagă de oraș.
Bazin echivalent = 15–64 × 1,0 + 65+ × 1,0 + 0–14 × 0,2 (Ion, 02.10: pensionarii pondere 1; parametri cu
versiune; în r. Briceni factorul iese ≈ 0,86). Se afișează și «oraș» (localitatea singură) și «bazin». Bazinul se calculează ÎNAINTEA oricărei calibrări și e aceeași mărime la
calibrare și la aplicare.

### Stratul 2 — piața servită azi («din ofertă», cifra principală)

Pe pereche și lună, în bilete:

```
piața = bilete_observate(pereche)
      + ~omiși(pereche) estimați, extrapolați la zilele lunii pe rută și sens, cu acoperirea Numărării
      + Σ peste cursele străine care ating ambele capete (cu raion) ȘI peste cele două sensuri:
            plecări_pe_sens (= 1/zi dacă sensul are oră în ANTA, altfel 0: dep_tur = plecarea de la primul punct, dep_retur = de la ultimul, migr. 382:32-38; 12 din 2.585 curse n-au retur, niciuna pe nord)
            × locuri_străine × rulaj_coridor(sens) × zile × cota(pereche, cursă, sens)
```

- **Sensul unei curse străine** NU e «dep_tur = tur»: din 24 de curse ANTA prin r. Briceni/Edineț, 12 pleacă
  din Chișinău și 12 din nord. Sensul se ia din ordinea opririlor: dacă `seq`(Chișinău) < `seq`(capăt nordic),
  dep_tur → `chisinau_nord`, altfel → `nord_chisinau` (`leg` din migr. 452:66). Test unitar cu o cursă care
  pleacă din nord, rulaj 1,0 / 0,5 și cote diferite pe sens: rezultatul se schimbă la inversarea sensurilor.
- **Coridorul de referință** al unei curse străine = TOATE rutele noastre cu același capăt
  îndepărtat (ex. Lipcani: 8 rute; Criva: 4; Otaci: 2), pe sens. Din aceleași rute vin și rulajul
  (Σ bilete ÷ Σ locuri, zile cu filtrul 455) și cota OD — altfel Σ pe perechi ≠ bilete pe coridor.
  Tabela `piata_concurenti_ref`: cursă ANTA → coridor, plecări cu locuri pe lună și sens.
- **Reimportul ANTA** (`apps/admin/scripts/anta-import.mts:184-195` șterge toate cursele și opririle și le
  reinserează cu ID-uri noi): referințele NU se leagă de `anta_courses.id`, ci de cheia naturală (cod rută,
  firmă, dep_tur, dep_retur) și se RECONSTRUIESC automat după fiecare import complet; fiecare import primește
  o versiune (`anta_import_version`: data + hash-ul foii), iar fiecare rând din `piata_pereche_luna` o
  poartă — luna calculată e un INSTANTANEU al graficului de atunci și nu se invalidează la import (graficul
  nou se aplică lunilor noi); o recalculare a unei luni vechi se face doar explicit, cu versiunea nouă notată.
  Test: reimportul aceleiași foi dă aceleași referințe și aceleași cifre, deși ID-urile se schimbă.
- **cota(pereche, cursă, sens)** = distribuția OD a biletelor noastre pe coridor (`tiki_ticket_attr`),
  RESTRÂNSĂ la perechile pe care cursa străină le atinge efectiv și RENORMALIZATĂ la Σ = 1 pe
  fiecare cursă și sens. **Domeniul = TOATE perechile din OD-ul coridorului atinse de cursă, inclusiv
  cele de trunchi (tip 2) și cele fără Chișinău (tip 1)**: partea lor se calculează și se ARUNCĂ (nu se
  afișează), nu se redistribuie pe coadă. Pe coridorul Lipcani 53 % din bilete (3.196 din 6.008 în
  09.2026) sunt pe perechi cu un capăt de trunchi — fără ele în numitor, cota cozii ar crește de ~2,1×. O cursă nu intră niciodată întreagă la mai multe perechi (altfel
  Chișinău–Edineț ar ieși ~21.800/lună, aproape tot pasageri ai altor perechi).
- **Fără referință** (coridorul n-are ≥ 20 plecări CU locuri pe lună și sens — ex. 09.2026 sensul
  Chișinău→Briceni: ruta 2 are 30 plecări și zero locuri; sau capete fără rută proprie: Medveja,
  Pererita): coridorul = cel al ULTIMEI stații a noastre de pe cursă spre capătul străin (`tiki_coridor`
  pe numele acelei stații — Briceni, nu Medveja; `tiki_coridor` ar pune Medveja/Pererita la «Altele»,
  migr. 452:36-46); rulajul = mediana coridoarelor cu același capăt în aceeași bandă preț × distanță, iar
  dacă nu există, a tuturor coridoarelor nordului, pe sens; cota = OD-ul acelui coridor restrâns la
  perechile cursei și renormalizat; steagul «aprox.» + nota la hover «capătul cursei e în afara rețelei:
  cifra e limită de sus» (perechile spre Medveja nu există în OD-ul nostru, deci capacitatea se mută pe
  ale noastre — abatere în sus). Niciodată zero, niciodată NULL. Test unitar cu o cursă al cărei capăt e
  «Altele». Dacă împrăștierea rulajului pe coridor e > ×2, «aprox.» apare și
  pe cifra principală.
- **locuri_străine** = 18 implicit (ANTA n-are tipul vehiculului — `anta_course_stops.note` conține
  doar locuri de oprire: «Centru», «Intersectie», «sos. Hincesti 86»); presupunere separată de
  flota noastră (rutiere mai mici), afișată la hover cu intervalul 18…45.
- **zile** = 5/7…7/7 (foaia ANTA n-are zilele de circulație) → coloana arată interval, nu cifră.
- **Regulă fermă:** piața afișată ≥ biletele observate. Omișii nu intră în regulă; dacă bilete +
  ~omiși depășesc intervalul, steagul «model sub observat». Nu se «mărește bazinul» ca să iasă.
- **Controlul formulei e o IDENTITATE, nu o inegalitate** (Σ ≤ capacitate nu poate deosebi o formulă
  bună cu rulaj 104 % de una care dublează sensurile cu rulaj 62 %): pe fiecare coridor ȘI SENS,
  Σ_perechi termen_concurenți(sens) = Σ_curse 1 plecare × locuri × zile × rulaj_coridor(sens),
  toleranță ±1 %, însumată peste DOMENIUL COMPLET (și perechile de trunchi/tip 1, înainte de aruncare);
  sensurile se adună abia după identitate (factorul «2» NU apare pe sens — ar valida exact dublarea pe
  care o caută). Identitatea e implicată algebric de Σ cote = 1, deci e test de IMPLEMENTARE (nimic
  numărat de două ori, renormalizarea făcută); testul de METODĂ e cursa sintetică. Σ cotelor = 1 ± 0,001 pe fiecare cursă și sens; test unitar cu
  o cursă sintetică zilnică, 18 locuri, 30 zile, rulaj 1,0 pe tur și 0,5 pe retur, pe 3 perechi:
  rezultatul corect e 18 × 30 × (1 + 0,5) = 810 bilete; o formulă cu «2 plecări» pe sens dă 1.620
  și testul pică; una din cele 3 perechi e de TRUNCHI, deci pe perechile afișate rezultatul așteptat e
  810 × (1 − cota trunchiului), nu 810; plus: o cursă care atinge o singură pereche (cota = 1, termenul =
  tot) și două curse pe aceeași pereche (se adună, nu se ia maximul); test «deschidere de terminal cu două sensuri → rulaj 1, nu 2»; test
  cu o cursă fără referință.

### Stratul 2b — potențialul din populație (plafon, nu a doua măsurătoare)

Ion a întrebat «potențiali câți clienți pot fi»: asta NU e aceeași mărime cu «câți circulă azi»,
deci nu se verifică prin suprapunere cu «din ofertă» (pe Corjeuți, 4.495 loc. și zero concurenți,
P75 ≈ 0,15 dă ~670 față de ~250 vândute; pe Halahora, satul care dă P75, iese sub bilete — prin
construcție). Se afișează ca **plafon**: «potențial ≤ bazin × P75», cu steag «peste ofertă».

- rata unei perechi = biletele OBSERVATE ale perechii ÷ bazinul echivalent al capătului mic
  (omișii doar ca sensibilitate la hover).
- setul de calibrare = perechile Chișinău–X cu ≤ 2 curse străine (cu raion), bazin echivalent
  ≥ 500 și ≥ 50 bilete/lună, pe benzi **preț × distanță** (afordabilitatea NU e axă de bandă:
  salariile Briceni/Edineț/Ocnița/Rîșcani sunt toate în 5 %). Setul se scrie în `piata_parametri`
  (versiune, dată, P75 pe bandă, nr. perechi), înghețat pe trimestru, schimbat doar cu rând nou.
- Verificat azi: banda 255–320 lei are 9 perechi pe populație brută (Corjeuți 243, Beleavinți
  217, Halahora 193, Criva 140, Hlina 128, Caracușenii Vechi 79, Drepcăuți 74, Corpaci 65, Trinca
  52); după bazinul echivalent (×0,71) Hlina 459 și Halahora ~500 sunt la limită → 7–9 perechi.
  **Decizia:** pragul e pe bazinul echivalent DUPĂ adăugarea satelor din raza R; dacă rămân < 12 sau
  testul de stabilitate pică (azi pică), banda nu se afișează și coloana trăiește din «din ofertă». Pe benzile 80–240 lei nu există nicio
  pereche cu ≤ 2 concurenți → fără potențial acolo. Asta se spune lui Ion de la început.
- test de stabilitate, metoda fixată `percentile_cont(0.75)` (scrisă în `piata_parametri` lângă P75).
  **Rezultatul pre-înregistrat pe 09.2026** (8 perechi cu rând BNS; Beleavinți fără rând): ratele pe
  populație brută 0,030 / 0,031 / 0,054 / 0,056 / 0,078 / 0,152 / 0,198 / 0,274; P75 = 0,164; fără
  Halahora 0,115 (−30 %), fără Hlina 0,115 (−30 %), fără Criva 0,138 (−16 %) → **testul PICĂ azi, deci la
  prima livrare potențialul NU apare nicăieri**; nu e un accident al lunii — la n = 8 cu împrăștiere ×9,
  P75 sare de rang la orice scoatere. Criteriul: n ≥ 12 perechi ȘI intervalul bootstrap 80 % al P75 cu
  lățime relativă < 50 %; până atunci banda e «instabilă». Potențialul reapare când satele din raza R sau
  luni noi aduc perechi, nu prin mutarea pragului după ce se văd cifrele. Pe perechile din set nu se
  arată «calibrare insuficientă» (circular): se arată rata proprie față de P75. «Rata satelor cu cel
  mult 2 curse străine», nu «fără concurenți».

### Perioada și filtrele paginii

Fila pornește pe 8 săptămâni, are presetări «ultimele 90» și «anul curent» (`periods.ts:151-154`)
și filtre pe rută și șofer (`BileteAparatTab.tsx:50-59, 103-114`); omișii se sting la filtrul pe
rută/șofer (`PairsView.tsx:37-41`). Prima livrare: NUMAI luni încheiate ≥ 05.2026 cu rând calculat
în `piata_pereche_luna` și NUMAI fără filtre de rută/șofer. Perioadă cu mai multe luni → Σ bilete ÷
Σ piață peste lunile cu rând, numărul lor la hover; lună încheiată dar necalculată încă, lună
parțială, lună ≤ 04.2026 sau filtru activ → «—» cu motivul la hover, niciodată 0. Biletele din cotă
= aceeași lună, același univers și același instantaneu ca piața, nu biletele filtrate ale rândului.

### Stratul 3 — prețul

- **Nu există azi un experiment de ieftinire.** Verificat: Bălți→Chișinău costa 133 km × 1,19 −
  20 = 138 lei listă (`price-popular.ts:101-102`, `app_config.rate_per_km_long`), plătit mediu
  în 09.2026 133 lei; din 02.10 e 150 lei fix (`offer-calc.ts:21`, testul `offer-calc.test.ts`:
  01.10 → 138, 02.10 → 150). ION-165 e o SCUMPIRE a sensului retur cu +8,7 % față de listă și
  +13 % față de plătit; nu e dovedit nici că aparatele TIKI iau prețul nou. Întrebarea 5 pentru
  Ion e obligatorie înainte de orice citire.
- **Dacă Ion confirmă scumpirea, o măsurăm ca atare** (elasticitate la creștere; poate fi
  asimetrică): test pre-înregistrat — metrica = raportul retur/tur pe săptămână pe perechea
  Chișinău–Bălți, **sursa = `tiki_tickets` (pair, direction) ⋈ `tiki_trips.trip_date`, pe săptămâna cursei**, și pentru
  2026 și pentru 2025 (`tiki_ticket_attr.label` e eticheta rutei, `tiki_leg_daily` e pe rută și sens —
  niciuna nu are perechea; `tiki_daily_pair` e pe ziua vânzării și în 12.2025 arată 255/181 în loc de
  5.301/4.283 — nefolosibil ca martor); pe pereche, 2025: aug 4.696/3.128, sep 4.252/2.838, oct
  4.708/4.412, nov 4.955/4.350, dec 5.301/4.283; 8 săptămâni înainte (fereastra începe pe 7 august, în vârful de vară —
  se spune) vs 8 după 02.10, cu aceleași săptămâni 2025 pentru sezon, pentru că raportul retur/tur PE PERECHE se mișcă singur: 1,50 / 1,50 / 1,07 / 1,14 / 1,24 (aug–dec
  2025) — de 3–4× efectul așteptat (−5…−13 %). De lămurit la implementare: `tiki_tickets.price` pe
  pereche dă ≈ 66 lei/bilet pe retur în 2025, nu ≈ 133 — prețul plătit mediu se ia din aceeași sursă ca
  `tiki_daily_pair.lei` până se lămurește coloana.
  Înainte de test: varianța raportului pe 2025–2026 și efectul minim detectabil; dacă efectul
  așteptat e sub el, testul se declară neconcludent din start. Se raportează și prețul plătit
  mediu pe sens și perechile vecine (Chișinău–Sîngerei, Bălți–Edineț) ca test de deplasare.
  Controlul (sensul tur) nu e independent: cine pierde returul își poate muta și dusul. Rezultatul
  se numește «elasticitatea cotei noastre pe trunchi» și NU se mută pe coadă.
- **Afordabilitatea e afișaj la hover, nu axă de bandă**: preț plătit mediu dus-întors ÷ venitul
  NET al raionului (brut BNS 2025 × ≈ 0,79: Briceni 10.773, Edineț 11.387, Ocnița 11.347, Rîșcani
  11.211, Bălți 13.700; țară 15.594) și ÷ pensia medie (sursă de extras la pasul 4: CNAS/BNS, pensia medie pe raion sau pe țară, cu anul —
  **neverificat**, rezervă: pensia medie pe țară) — în r. Briceni doar 7.102 din 46.894 locuitori (15 %)
  sunt salariați. Factorul net/brut (0,79; cu scutirea personală ≈ 0,83) stă în `piata_parametri`, nu în cod. Chișinău–Briceni dus-întors 548 lei ≈ 6,4 % din net, ~15 %
  dintr-o pensie.

### Variante respinse

1. **Populație × coeficient fix din literatură.** Ratele noastre pe perechi merg de la 0,01 la
   0,6; un coeficient fix ar fi sigur pe dinafară și greșit pe dinăuntru.
2. **Sondaj / numărare la stațiile concurenților.** Costă oameni și dă o zi; «din ofertă» dă
   aceeași informație din graficul ANTA, cu eroarea cunoscută. Rămâne verificare punctuală pe
   2–3 coridoare după ce coloana există.
## 🔬 Verificat pe viu

| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| BNS publică populația pe fiecare localitate | `Anexa_Localitati_RPL2024.xlsx` descărcat și citit (foile 8.3, 8.4) | 1.982 rânduri; or. Edineț 12.369 (localitatea 11.290), or. Briceni 5.785, or. Cupcini 5.493, or. Lipcani 3.569, or. Ocnița 5.187, Bălți 90.954; r. Briceni 46.894 (15–64: 24.874), r. Edineț 50.429, r. Ocnița 31.610 | Stratul 1 are sursă oficială, pe vârste |
| Stațiile TIKI se leagă de localitățile BNS | script pe cele 68 de stații din perechile 09.2026 vs foaia 8.3 | 64/68 pe nume fără diacritice; nepotrivite: «Beleavineti», «Cotelea», «sl. Sirauti», Chișinău (rând compus); 20 nume cu omonime (Briceni/Dondușeni, Recea/Strășeni, Ruseni/Anenii Noi, Viișoara ×4); Ocnița pe nume gol a luat satul (1.936), nu orașul (5.187) | Legarea se face cu raion + `district.ts`, în tabelă editabilă |
| Coordonate pentru bazin | `anta_localities` (migr. 382) | 1.667 localități cu raion + lat/lon; BNS are 1.982 → ~300 sate fără coordonate | Pasul 1 raportează satele fără coordonate; ele nu intră tăcut în niciun bazin |
| Perechile și prețul plătit pe lună | `tiki_daily_pair` 09.2026 | 371 perechi, 68 stații; Chișinău–Bălți 10.016 (tur 5.044 la 152 lei, retur 4.972 la 133 lei); Chișinău–Briceni 2.396 / 274; –Edineț 2.350 / 234; –Lipcani 481 / 303; –Criva 140 / 321; –Halahora de Sus 193 | Numărător și preț pe pereche și sens |
| Concurenți pe pereche din ANTA | `anta_course_stops` + `anta_courses` (source='anta'), nume fără prefix, cu raion | Edineț 34 pe nume (31 cu raion), Briceni 16 pe nume / 12 cu raionul Briceni (Pascari Pavel-Trans 9:05, Pond-Trans 18:10 + 10 curse spre Lipcani/Criva/Pererita/Șirăuți/Medveja/Otaci prin Briceni; una Lipcani–Tiraspol), Cupcini 15, Ocnița 15, Lipcani 8, Criva 2, Hlina 1, Drepcăuți 1, Halahora 0, Corjeuți 0; trunchi: Orhei 282, Sîngerei 41 | Stratul 2; un rând `anta_courses` = dep_tur + dep_retur = O plecare pe zi pe FIECARE sens (nu «2 plecări» pe sens) |
| ANTA spune tipul vehiculului / locurile | `select note, count(*) from anta_course_stops group by 1` | NU: notele sunt locuri de oprire («Centru» 72, «sos. Hincesti 86» 62, «Topaz» 57, «PC Intersectie» 53) | Locuri = 18 presupus, afișat ca presupunere |
| Rulajul nostru pe loc | `tiki_trips` vs `tiki_leg_daily` ÷ `tiki_plecari_daily` cu filtrul migr. 455:24 (toate plecările zilei cu locuri), 09.2026 | `tiki_trips`: 2.292 deschideri, 65 %, 492 cu bilete > locuri — un `trip_id` e o DESCHIDERE de terminal pe două sensuri (migr. 452:4-6). Pe plecări fizice: 56 rută-sensuri, 1.631 plecări, 32.963 locuri, 25.826 bilete = 78,3 %; min 44 %, mediana 72 %, max 148 % (ruta 20 Criva–Larga); ruta 2 (Chișinău→Briceni, 30 plecări) și 16 (Chișinău→Lipcani, 27) fără locuri pe tot sensul în 09; 15 zile-rută cu locuri parțiale în 09 | Rulaj pe coridor și sens, filtrul 455; `tiki_trips` nu intră în formulă; «fără referință» e caz real (Chișinău→Briceni) |
| Locurile și prima zi cu grafic | migr. 452:6-7, 383, 399-406; `tiki_plecari_daily` | locurile noastre = 20 (Ford 17); prima zi cu locuri = 04.04.2026; 03.2026 = 1.521 zile-rută toate `sursa='bilete'`, 0 cu locuri; 04.2026 = 227 «bilete» + 1.346 «grafic» | Prima lună cu «din ofertă» = 05.2026; lunile ≤ 04.2026 «—» |
| «Ruta de referință» a unui concurent e unică | `crm_routes` interurbane (id 1–31) | Lipcani: 8 rute (10, 12, 13, 16, 18, 19, 22, 27), rulaj 5 %…104 %, pe coridor 5.442 / 8.780 = 62 %; Criva: 4 rute (14, 17, 20, 24); Otaci: 2 (21, 30); nu există rute spre Medveja, Pererita | Referința = CORIDOR (toate rutele cu același capăt), nu rută; cazul «fără referință» definit |
| Omișii de TIKI pe pereche | `get_tiki_omisi('2026-09-01','2026-09-30')` + migr. 458:90-115 | 19.367 oameni pe 1.136 perechi; top local (Beleavinți–Briceni 758, Briceni–Lipcani 621, Edineț–Halahora 477 la 28 bilete TIKI); = numărat − TIKI pe tronson, coborârile repartizate proporțional → perechea omisului e dedusă, nu observată | Omișii sunt ESTIMARE: afișați separat, nu în regula «≥», nu în calibrare (doar sensibilitate) |
| Rata pe coadă e măsurabilă | bilete pe STAȚIE 09.2026 ÷ populație brută | Halahora 333/704 = 0,47; Hlina 179/647; Criva 232/920; Drepcăuți 91/1.316; Corjeuți 329/4.495; Briceni 3.617/5.785 = 0,63; Edineț 4.292/11.290; Bălți 13.825/90.954 = 0,15 — **unitate greșită** (stație, nu pereche; populație brută, nu bazin echivalent); Halahora de Sus nu e capăt (ruta 6: Corjeuți→…→Briceni→Halahora→Hlinaia→Edineț), urcă două sate + tranzit | Tabelul se reface la pasul 6 în unitatea pereche ÷ bazin echivalent; cifrele de aici nu se folosesc |
| Tendința lunară e stabilă | `tiki_daily_pair` 02–09.2026 | total 26,4k → 25,4k → 25,7k → 27,1k → 27,8k → 29,9k (aug) → 26,7k; Chișinău–Bălți 9,1–11,0k; –Briceni 2,3–2,9k | Luna de referință ≥ 03.2026; august e vârf |
| Salariul mediu pe raion | `Anexa_costul_muncii_2025.xlsx` (BNS, Sal_Terit tab. 5; Nr.med.Terit tab. 12) | Țară 15.594,5; Chișinău 18.707,8; Bălți 13.700,2; Briceni 10.773,2; Edineț 11.386,8; Ocnița 11.346,9; Rîșcani 11.211,4; Sîngerei 11.779,5; Dondușeni 11.447,6; Orhei 12.633,3; Telenești 11.430,8. Salariați: r. Briceni 7.102 din 46.894 (15 %), Edineț 11.840, Ocnița 4.736 | Afordabilitatea are sursă completă; salariul supraestimează venitul bazinului → și pensia medie |
| ION-165 e o ieftinire pe Bălți→Chișinău | `price-popular.ts:101-102` (133 km, −20), `app_config.rate_per_km_long` = 1,19, `offer-calc.ts:21`, `offer-calc.test.ts:78-81`, `tiki_daily_pair` | Listă 138 lei până la 01.10, plătit mediu 133 lei; din 02.10 150 lei fix = +8,7 % / +13 % — **e scumpire**, și nu e dovedit că aparatele TIKI iau prețul nou | Stratul 3 rescris; întrebarea 5 pentru Ion |
| `tiki_daily_pair` e pe ziua vânzării | memoria ION-160 + `sale_date`; `tiki_leg_daily` și `tiki_trips.trip_date` 2025 | `tiki_daily_pair` Chișinău–Bălți 12.2025 = 255 / 181 (față de 4.849 / 4.604 în 10.2025) — blocuri false; pe ziua cursei 2025 e stabil: `tiki_leg_daily` aug 26,2k, sep 22,4k, oct 26,1k, nov 24,0k, dec 23,6k; raportul nord→Chișinău ÷ Chișinău→nord 1,39 / 1,43 / 1,11 / 1,04 / 1,06 (aug–dec 2025) | Luna ≥ 03.2026; numărătorul din `tiki_ticket_attr` (ziua cursei) |
| Cronul `tiki-refacere` e loc pentru calcul lunar | `route.ts:11-28`, `tiki-mobilet.yml:9-11`, migr. 452:463-499 (triggerele Numărării), 452:541-550 (reimport 8 zile), 456:2-7, incident NANO 01.10 | ruta golește două cozi la 06:30 și 08:00; triggerele GO pun zile în `count_refresh_queue` ziua; reimportul reface ultimele 8 zile (luna 09 se reface până pe ~08.10); un pas SQL are 120 s și a mai depășit | «Piața» NU intră acolo; jobul de noapte ia lunile «murdare», nu condiția «cozi goale» |
| Cota se poate renormaliza doar pe perechile afișate | `tiki_ticket_attr` ⋈ `tiki_tickets.pair`, coridorul Lipcani 09.2026 | 6.008 bilete, din care 3.196 (53 %) pe perechi cu un capăt de trunchi, 964 pe perechi cu Edineț | Domeniul cotei = toate perechile atinse, trunchiul se calculează și se aruncă |
| dep_tur = sensul nostru «tur» | `anta_courses` + `anta_course_stops.seq`, cursele prin r. Briceni/Edineț | 24 de curse: 12 pleacă din Chișinău, 12 din nord; 12 din 2.585 curse ANTA n-au `dep_retur` (Bender/Tiraspol/Ceadîr-Lunga/Camenca + omonimul Briceni/Dondușeni), niciuna pe nord | Sensul din ordinea opririlor; plecări pe sens = 1 doar dacă sensul are oră |
| `tiki_refacere_pas` are un singur loc unde «termină luna» | migr. 461:51-93 (definiția vie), 461:75-78, 461:83-90 | două ramuri: «lună» (atribuire + agregate, apoi pune zilele lunii în `count_refresh_queue`) și «Numărare» (`count_aggr_days`, 60 zile-rută pe apel, golește `tiki_refresh_log`); omișii se refac în a doua | Marcajul lunii murdare în ambele ramuri; jobul sare luna cu zile încă în coadă |
| Stabilitatea P75 pe setul de azi | `scratchpad/p75.py` pe cele 8 perechi cu rând BNS | `percentile_cont(0.75)` = 0,164; −30 % fără Halahora sau Hlina, −16 % fără Criva; `percentile_disc` +30 % la 6 din 8 scoateri | Potențialul NU apare la prima livrare; criteriu n ≥ 12 + bootstrap |
| Perechea pe ziua cursei există pentru 2025 | `tiki_tickets` (pair, direction, trip_id) ⋈ `tiki_trips.trip_date`, «Chisinau - Balti» | 100 % cu trip_id; retur/tur 2025: aug 4.696/3.128, sep 4.252/2.838, oct 4.708/4.412, nov 4.955/4.350, dec 5.301/4.283 (raport 1,50/1,50/1,07/1,14/1,24); `tiki_ticket_attr` 555.749 rânduri, 99,8 % din 2025 cu `zi_sursa='cursa'` | Sursa testului de preț; `tiki_tickets.price` ≈ 66 lei pe retur de lămurit |
| Pensia medie pe raion | — | **neverificat** (sursă de extras la pasul 4: CNAS/BNS) | Rezervă: pensia medie pe țară; afișaj la hover, nu intră în nicio formulă |
| Setul de calibrare «din populație» există azi? | `tiki_daily_pair` 09.2026, perechi Chișinău–X cu ≥ 50 bilete, concurenți ANTA cu raion ≤ 2 | 9 perechi, toate în banda 255–320 lei: Corjeuți 243 (pop. 4.495 → 0,054/loc.), Beleavinți 217, Halahora de Sus 193 (704 → 0,27), Criva 140 (920 → 0,15), Hlina 128 (647 → 0,20), Caracușenii Vechi 79 (2.629 → 0,03), Drepcăuți 74 (1.316 → 0,056), Corpaci 65 (837 → 0,078), Trinca 52 (1.677 → 0,031); următoarele: Văratic 3, Bîrlădeni 6, Lipcani 8 | Banda 255–320 e singura cu candidate, dar 9 < 12 și P75 e instabil (rândul «Stabilitatea P75») → potențialul NU apare la prima livrare; P75 ≈ 0,15 × Briceni 5.785 = ~870 ≪ 2.396 bilete → confirmă că orașele NU se estimează din populație; pe benzile 80–240 lei nu există nicio pereche cu ≤ 2 concurenți |

## Pași

1. **Populația** `piata_localitati` (localitate, raion, cod BNS, total, 0–14, 15–64, 65+, lat/lon
   din `anta_localities`), încărcată o dată din anexa BNS (`apps/admin/scripts/piata/bns-import.mts`),
   sursa și data în comentariul tabelei; raport: localitățile BNS fără coordonate (~300). Control:
   Edineț 11.290 / Briceni 5.785 / Bălți 90.954.
2. **Legarea stație → localitate** `piata_statii` (nume TIKI și nume Numărare → localitate + raion),
   64 automate prin `LocalityIndex` + 4 de mână; «(intersecție)» nelegat. Control: 0 stații din
   perechile cu ≥ 30 bilete/lună fără localitate.
3. **Bazinul** pe stație (R = 7 km, fiecare sat o dată, satele cu stație proprie rămân ale lor);
   lista bazinelor top-20 verificată cu Ion (întrebarea 1).
4. **Salariile și pensia** `piata_salarii_raion` (BNS 2025 brut, net = × 0,79, pensia; an + sursă).
5. **Concurența pe pereche** din ANTA cu raion; o cursă = 1 plecare/zi pe fiecare sens care are oră; sensul din ordinea opririlor (nu «dep_tur = tur»); termenul se calculează pe sens și se adună; cota pe domeniul complet (trunchiul se calculează și se aruncă); trunchi = lista nominală;
   `piata_concurenti_ref` (cursă → CORIDOR de referință, plecări cu locuri pe lună și sens; fără
   referință → rulaj median al vecinilor + OD `tiki_coridor` + «aprox.»); rulajul din `tiki_leg_daily`
   ÷ `tiki_plecari_daily` cu filtrul 455; cota OD restrânsă și renormalizată. Control: Briceni 12,
   nu 16; identitatea Σ_perechi = Σ_curse pe fiecare coridor și sens, fără factorul 2 (±1 %); Σ cote = 1 ± 0,001
   pe cursă și sens; cursa sintetică (810, nu 1.620); deschidere cu două sensuri → rulaj 1.
6. **Calculul lunar** `piata_pereche_luna` (bilete observate; ~omiși estimați + acoperire; din
   ofertă: interval; potențial: cifră + rată + nr. perechi, sau «necalibrabil»; afordabilitate; tipul
   perechii; steaguri «aprox.» / «model sub observat» / «peste ofertă») — **job separat de noapte**
   `piata-luna`: `tiki_refacere_pas` (definiția vie e migr. 461:51-93 — NU copia din 456, care nu golește
   `tiki_refresh_log`) marchează luna în `piata_luni_murdare` în AMBELE ramuri: ramura «lună» (461:75-78)
   și ramura Numărării `count_aggr_days` (461:83-90, pe `date_trunc('month', zi)`) — altfel omișii rămân
   vechi când operatorul corectează o sesiune din GO; jobul ia cea mai veche lună încheiată murdară
   ≥ 05.2026 și o SARE cât timp `count_refresh_queue` mai are zile ale ei; un apel = o lună, ≤ 20 s; ora
   provizorie 03:30 Chișinău (ION-166 n-are încă plan — `grep ION-166` găsește doar fișierul ăsta), de
   mutat la sfârșitul ferestrei lui când există; refuză luna fără zile-rută cu locuri; saltul se scrie în jurnal cu motivul, după 2
   nopți la rând apare un semn pe pagină; biletele cotei din același instantaneu.
7. **Calibrarea potențialului**: setul scris în `piata_parametri` (versiune, dată, metoda
   `percentile_cont`, P75 pe bandă, nr. perechi, lățimea bootstrap), înghețat pe trimestru; criteriul UNIC
   e cel din 2b: n ≥ 12 perechi ȘI bootstrap 80 % cu lățime relativă < 50 %, altfel fără potențial pe bandă
   (azi: fără).
8. **UI** `PairsView.tsx`: «Sursa» → «Piața» (interval, «noi X %» = bilete observate ÷ mijloc, «+ ~Y %
   omiși est.», bazin, potențial ≤ unde există), hover cu componentele și presupunerile; KPI «Cota
   noastră» = Σ bilete ÷ Σ piață pe perechile de tip 3–4, doar luni încheiate fără filtre; textul
   paginii: prima propoziție spune ce e piața, ce e potențialul și ce nu e bazinul. Control:
   captură producție.
9. **Testul de preț Bălți** (numai după răspunsul la întrebarea 5): pre-înregistrat ca mai sus, pe
   ziua cursei, raport la 8 săptămâni în comentariu la ION-165.

## Fișiere

- `packages/db/migrations/4xx_piata_potentiala.sql` — `piata_localitati`, `piata_statii`,
  `piata_salarii_raion`, `piata_parametri` (versiune), `piata_concurenti_ref`, `piata_luni_murdare`,
  `piata_pereche_luna`, funcția de calcul (REVOKE EXECUTE FROM PUBLIC, RLS pornit fără politici —
  regula migr. 355/356); `CREATE OR REPLACE tiki_refacere_pas` pornind de la migr. 461:51-93, cu marcajul
  lunii murdare în ambele ramuri.
- `apps/admin/scripts/piata/bns-import.mts` — anexa BNS populație + anexa salarii → tabele.
- `apps/admin/src/lib/anta/district.ts` — refolosit (`LocalityIndex`), neschimbat.
- `apps/admin/src/app/(dashboard)/numarare/tabs/bilete/PairsView.tsx` — coloana + KPI + text.
- `apps/admin/src/app/(dashboard)/numarare/tabs/biletAparatActions.ts` — `getPiata(from,to)` (fișierul e în `tabs/`, `PairsView.tsx:4` îl importă din părinte).
- `apps/admin/src/app/api/cron/piata-luna/route.ts` — jobul de noapte (nou), NU `tiki-refacere`.
- `.github/workflows/piata-luna.yml` — pornire 03:30 Chișinău (provizoriu), de legat de fereastra ION-166.
- `apps/admin/src/app/(dashboard)/numarare/tabs/BileteAparatTab.tsx` — modul «luni încheiate» și «—» la filtre (calea e `tabs/`, nu `tabs/bilete/`).

## Riscuri

- **Bazinul greșit** umflă/golește o pereche. Rezervă: tabelă editabilă, R parametru, lista
  top-20 trece pe la Ion.
- **Concurenți supraevaluați** (curse ANTA care nu mai circulă zilnic). Rezervă: interval; pe
  coridoarele cheie o zi la fața locului.
- **Rulajul coridorului variază ×3 (44–148 %)** și e cel mai mare factor al cifrei. Rezervă:
  rulajul și plecările coridorului la hover; «aprox.» pe cifra principală când împrăștierea > ×2.
- **Cota OD din biletele noastre ≠ a concurentului.** Rezervă: identitatea Σ pe coridor; cota la hover.
- **Potențialul lipsește la prima livrare — SIGUR, nu probabil**: testul de stabilitate pică pe 09.2026
  (−30 % la scoaterea Halahorei sau a Hlinei) și setul are 8–9 < 12. Rezervă: coloana e completă din
  «din ofertă»; i se spune lui Ion înainte, nu după.
- **Interpretare greșită**: piața ≠ «cât am putea vinde noi»; potențialul e plafon; bazinul ≠
  clienți posibili. Textul paginii o spune în prima propoziție.
- **Baza NANO**: jobul rulează noaptea, un apel = o lună, ≤ 20 s; pagina citește o tabelă mică.

## Verificare

- Pașii 1–2: numere de control BNS; 0 stații mari nelegate; raport sate fără coordonate.
- Pasul 3: lista bazinelor aprobată de Ion.
- Pasul 5: identitatea Σ pe fiecare coridor și sens, o plecare pe sens (±1 %); teste unitare: cursă
  sintetică cu rulaje diferite pe sens (810, nu 1.620), deschidere cu două sensuri (rulaj 1), cursă fără referință (nu zero, «aprox.»),
  A–B–C cu încărcare constantă (omișii A–C apar ca estimare cu steag), cursă cu capăt «Altele», cursă care
  pleacă din nord (sensurile inversate schimbă rezultatul), cursă cu o singură pereche, două curse pe
  aceeași pereche, cursă sintetică cu o pereche de trunchi (810 × (1 − cota trunchiului)).
- Pasul 7: n ≥ 12 și bootstrap 80 % al P75 cu lățime < 50 % (azi pică — rezultatul e pre-înregistrat în
  2b); pe perechile din set se afișează rata proprie, nu «calibrare insuficientă».
- Pasul 8: captură producție + `pnpm typecheck`; `analiza.test.ts`, `periods.test.ts` verzi; test
  pentru «—» la lună parțială / filtru activ / lună ≤ 04.2026 / lună necalculată.
- Pasul 9: comentariu la ION-165 cu raportul retur/tur pe săptămâni, pe ziua cursei.

## Răspunsurile lui Ion (02.10.2026)

Citat: «1. și satele din jur 10 km · 2. câte total călătorii · 3. lasă tot, ok, pondere 1 · 5. Bălți 150 nu are
nimic cu [lucrarea] noastră · 1. total oraș și bazin · ca referință folosim modulul nostru de concurenți · pe
concurenții cu rutele din raioanele Edineț și Briceni pui pondere 40 % în septembrie și deja pe fiecare lună
reiese din diferența noastră septembrie cu 40 % ca delta · pe Bălți folosești doar concurentul direct de
referință Bălți–Chișinău · 40 % la rutele mai jos de Bălți sunt în mare parte fix cum la noi pe locații; cei
mai jos de Bălți practic nimic nu iau din gara Bălți sau puțin, 10 % din total».

Deciziile, aplicate în plan:

1. **Bazinul** = localitatea + satele fără stație proprie din raza **10 km** (nu 7). Se afișează DOUĂ cifre:
   «oraș N loc.» și «bazin M loc.».
2. **Cifra din coloană** = câte călătorii (bilete) se fac în total pe coridor, toți transportatorii.
3. **Concurenții fără zile cunoscute**: rămâne intervalul 5/7…7/7. **Pensionarii: pondere 1,0** (bazin
   echivalent = 15–64 × 1,0 + 65+ × 1,0 + 0–14 × 0,2).
4. **Bălți 150 lei e în afara acestei lucrări**: testul de preț (fostul pas 9) iese din plan; prețul rămâne
   doar ca afordabilitate la hover. Faptul că 150 > 138 rămâne consemnat în «Verificat pe viu» pentru
   altă discuție.
5. **Referința pentru concurenți = modulul nostru /concurenta** (`anta_courses`, `anta_course_stops`,
   `anta_companies`, migr. 382/383), nu altă sursă.
6. **Regula lui Ion pentru concurenți, în locul rulajului nostru pe coridor** (înlocuiește
   «rulaj_coridor × cota» din Stratul 2 pentru coada de nord):
   - pe perechile cu capătul în raioanele **Edineț și Briceni**: concurenții primesc o **pondere de 40 %**
     în luna de bază **septembrie 2026**; în fiecare lună următoare cifra lor se mișcă cu **delta noastră
     față de septembrie** (concurenți_M = concurenți_09 × bilete_noastre_M ÷ bilete_noastre_09) — Ion:
     «40 % la rutele mai jos de Bălți sunt în mare parte fix, cum la noi pe locații»;
   - pe perechea **Chișinău–Bălți**: doar concurenții DIRECȚI Bălți–Chișinău (cursele al căror capăt e
     Bălți), nu cele 107 curse care trec prin Bălți; cursele care merg mai departe de Bălți iau din gara
     Bălți «practic nimic, sau 10 % din total» → parametru `tranzit_balti = 0,10` aplicat volumului lor;
   - **Lămurit (Ion, 02.10, la întrebarea 7)**: «pondere de îmbarcare la număr de rute, ținând cont că ei
     orientativ preiau din aceleași localități oameni cum și noi (dar ține cont de ore)». Deci:
     **o cursă străină îmbarcă pe pereche 40 % din cât îmbarcă o cursă de-a noastră pe aceeași pereche**,
     corectat după ora plecării:
     `concurenți_09(pereche) = Σ_curse_străine (bilete_noastre_09(pereche) ÷ plecări_noastre_09(pereche, sens)) × 0,40 × f_oră(cursă, sens)`
     **Ora (Ion, 02.10: «ore la rutele noastre și ponderea de îmbarcare, și la ei tot să fie similar»)**: nu
     praguri inventate, ci PROFILUL NOSTRU de îmbarcare pe oră. Pentru o cursă străină care pleacă la ora H pe
     sensul S, baza = biletele noastre pe plecare, pe aceeași pereche și sens, la plecările noastre din
     fereastra H ± 60 min (din `tiki_ticket_attr` + ora plecării din grafic/`tiki_trips.dep_time`); dacă
     n-avem plecare în fereastră, cea mai apropiată ca oră. Formula finală:
     `concurenți_09(pereche) = Σ_curse_străine 0,40 × bilete_noastre_pe_plecare_09(pereche, sens, oră ≈ H)`
     (la noi profilul e real: Chișinău–Criva 10:10 ≈ 91 % din locuri, 11:00 Criva–Chișinău 27 %). Pe
     Chișinău–Briceni, 09.2026, cu media pe oră: 2.396 ÷ 21 curse ≈ 114 pe cursă → × 0,40 × 12 curse străine
     ≈ 550 concurenți → piața ≈ 2.950, noi ≈ 81 %; cu profilul pe oră cifra se mută după orele reale ale
     celor 12 curse (Pascari 9:05, Pond 18:10 etc.). Locurile, rulajul și cota OD NU mai intră pentru Edineț/Briceni; intervalul 5/7…7/7 rămâne.
   - identitatea de control și cota OD rămân doar pentru coridoarele din AFARA raioanelor Edineț/Briceni
     (Ocnița, Rîșcani, Sîngerei), unde Ion n-a dat o regulă; acolo rămâne «rulaj_coridor × cota», cu
     steagul «model».

## Întrebări pentru Ion

1. **Bazinul**: doar localitatea sau și satele FĂRĂ stație proprie din jur (propus 7 km)? Pentru
   Briceni oraș: intră Bălcăuți, Mărcăuți, Berlinți? (Beleavinți are stație proprie și rămâne a lui.)
2. **Ce cifră în coloană**: «câte bilete se vând în total pe coridor» (propus) sau «câte am
   putea avea noi»? A doua nu se poate măsura; potențialul din populație e plafon, nu țintă.
3. **Concurenții**: când ANTA nu spune zilele, interval 5/7…7/7 (propus) sau zilnic?
4. **Pensionarii**: ponderea 0,5 pentru 65+ (29 % din populația nordului) sau 1,0?
5. **Bălți 150 lei**: știi că până la 01.10 Bălți→Chișinău costa 138 lei listă (133 km × 1,19 −
   20) și se plătea în medie 133? 150 e o scumpire de 9–13 %, nu o ieftinire. Rămâne așa, și o
   măsurăm ca scumpire?
6. **Potențialul din populație** nu va apărea la prima livrare (setul de sate fără concurenți e prea mic
   și instabil); coloana va avea doar «din ofertă» + oraș + bazin. (Ion, 02.10: «lasă tot ok» → pornim așa.)
7. **Ponderea 40 %** — răspuns: pondere de îmbarcare pe cursă față de o cursă de-a noastră la oră similară,
   din profilul nostru de îmbarcare pe oră (nu praguri). Închis.

Toate cele 7 întrebări au răspuns; planul merge în tichet.

## Review: business-logic-auditor (runda 1)

Obiect: `docs/plans/2026-10-01-piata-potentiala-bilete.md`. Am urmărit fluxul `tiki_daily_pair` / `tiki_ticket_attr` / `tiki_trips` / `tiki_ceilalti_od` / `anta_course_stops` / `anta_localities` → `piata_pereche_luna` → `PairsView.tsx` în codul din repo. Nu am rulat interogări pe bază (NANO, a doua zi după incident). Unde lipsește un fapt, am scris interogarea care îl lămurește.

### Răspunsuri scurte la întrebările de audit

- **Omișii se dublează cu biletele?** Nu. `tiki_ceilalti_od` = încărcarea numărată − TIKI (mijlocul intervalului) pe tronson (`packages/db/migrations/458_tiki_ceilalti_de_unde_pana_unde.sql:4-5`, `:90`), iar `get_tiki_omisi` doar o însumează pe pereche (`460_tiki_omisi_nume_pereche.sql:13-19`). Problemele sunt altele: acoperirea pe zile și numele perechii (deducerea M2).
- **Pasul «piața» în `/api/cron/tiki-refacere` e locul corect?** Nu (deducerea H3). Plafonul real e `statement_timeout 120s` pe fiecare pas SQL (`456_tiki_refacere_pas_impartit.sql:7`). Ruta are `maxDuration 300` și un buget de 200 s (`apps/admin/src/app/api/cron/tiki-refacere/route.ts:11-13`). Cronul rulează ziua, nu lunar.
- **Legarea omonimelor are o gaură?** Da (deducerea M1). «Raionul rutei noastre» nu e definit pentru o rută care trece prin mai multe raioane. Un raion `null` în ANTA se potrivește cu orice raion.
- **«≤ 2 concurenți» e consecvent cu memoria «concurența doar pe coadă»?** Metrica (curse care ating punctul ȘI Chișinăul, cu raion) e aceeași. Pragul «> 12 = trunchi» însă e aplicat pe capătul perechii, iar memoria spune explicit «capătul rămâne mereu» (deducerea H2).

### Deduceri

**H1 — high, −2.0 — «Din ofertă» pune toată încărcarea unui autobuz concurent pe fiecare pereche pe care o atinge.**
- Dovadă: doar planul (Pași 5; KPI la pasul 8). Fapte de schemă:
  - `anta_courses` are câte un rând pe cursă, cu `dep_tur` + `dep_retur`, deci un rând înseamnă două plecări pe zi (`382_concurenta_anta.sql:26-35`).
  - `tiki_trips.tickets_sold` / `seats` (`451_tiki_mobilet_import.sql:30-31`) numără bilete pe loc, nu ocuparea pe tronson: un loc vândut de două ori pe porțiuni diferite intră de două ori.
- Scenariu de eșec: o cursă străină Chișinău–Lipcani care trece prin Briceni intră întreagă (18 × 0,65 × zile) și în piața Chișinău–Briceni, și în Chișinău–Lipcani, și în orice altă pereche de pe drumul ei. KPI-ul «Cota noastră de piață» = Σ bilete ÷ Σ piață adună aceleași locuri de N ori, deci cota iese sistematic mai mică. Pe de altă parte, rândul de cursă numărat o singură dată (fără ×2 pentru sensuri) subestimează oferta pe pereche. Erorile nu se compensează: depind de lungimea cursei.
- Corecția în plan: concurenții pe pereche se estimează din propria noastră repartiție OD. Pasagerii pe pereche ai unei curse concurente = (biletele noastre pe pereche ÷ cursele noastre care ating ambele capete, pe sens) × plecările concurente pe sens. Așa dispare „ocuparea 65 %” ca medie a flotei, iar o cursă se împarte între perechi exact cum se împarte la noi. Cota pe KPI se calculează numai după această împărțire.
- Interogare de control: `select count(*) filter (where tickets_sold > seats), round(avg(tickets_sold::numeric/nullif(seats,0)),2) from tiki_trips where trip_date between '2026-09-01' and '2026-09-30' and state is distinct from 3;`. Dacă există curse cu `tickets_sold > seats`, raportul 65 % nu e ocupare.

**H2 — high, −2.0 — Pragul «> 12 = trunchi» aplicat pe capătul perechii scoate exact perechile de coadă importante.**
- Dovadă: planul, tabelul «Verificat» (Edineț 34, Briceni 16, Cupcini 15, Ocnița 15) + pasul 4. Memoria proiectului `concurenta-doar-pe-coada.md` spune: «taie opririle cu > 12 curse mergând înapoi de la capăt (capătul rămâne mereu)»; trunchiul = Orhei 278 / Strășeni 196 / Bălți 136 / Sîngerei 51.
- Scenariu de eșec: Chișinău–Edineț (2.350 bilete), Chișinău–Briceni (2.396), Cupcini și Ocnița sunt toate > 12, deci primesc «trunchi» și nicio estimare. Coloana rămâne plină doar pe satele mici, iar exemplul din plan («Briceni 16 → cifra corectă») se contrazice cu propriul prag.
- Corecția în plan: «trunchi» = lista nominală a nodurilor mari din memorie (Orhei, Strășeni, Bălți, Sîngerei, Călărași, Soroca-intersecție) sau un prag pe ordinul de mărime (≥ 50). Un capăt de rută (Edineț, Briceni, Ocnița, Otaci, Drochia) nu e niciodată trunchi. Pragul 12 rămâne doar pentru tăierea cozii, cum e în memorie.

**H3 — high, −2.0 — Pasul «piața» în `tiki-refacere` rulează ziua, în plafonul de 120 s, și citește omiși încă nerefăcuți.**
- Dovadă:
  - `tiki-refacere/route.ts:20-28`: bucla golește cozile. Nu există un «pas lunar».
  - `.github/workflows/tiki-mobilet.yml:9-11`: rulează la 03:30 și 05:00 UTC, adică 06:30 / 08:00 Chișinău.
  - `456_tiki_refacere_pas_impartit.sql:2-3`: pasul depășise deja 120 s și luna rămânea în coadă. La `:18-30`, pasul lunii doar pune zilele Numărării în `count_refresh_queue`. `count_aggr_days`, care rescrie `tiki_ceilalti_od`, rulează abia la pașii următori (`:33-37`), poate abia a doua zi.
  - Memoria `supabase-nano-incident-2026-10-01.md`: incidentul a venit după 145 de apeluri `tiki_refacere_pas`. Remedierea ION-166 = refacere doar noaptea, pași ≤ 20 s.
- Scenariu de eșec:
  - Dacă «piața» intră în `tiki_refacere_pas` (aceeași tranzacție și același lacăt), un pas de lună care azi ia 17–87 s trece de 120 s și tranzacția se anulează. Luna rămâne în coadă și se reia la fiecare apel, de două ori pe zi, ziua: aceeași încărcare care a pus jos NANO pe 01.10. Bilete aparat rămâne cu agregate vechi.
  - Dacă «piața» rulează „după agregate” în aceeași buclă, ea citește `tiki_ceilalti_od` dinainte de refacerea zilelor Numărării, deci omiși vechi.
  - Afirmația din Riscuri («pasul lunar deja existent») e falsă.
- Corecția în plan: un job separat, noaptea, după ce ambele cozi sunt goale (`tiki_refresh_queue` și `count_refresh_queue` = 0). Câte o lună închisă pe apel, cu `statement_timeout` ≤ 20 s (ION-166). Recalcul numai pentru lunile marcate „murdare” de refacere. Planul trebuie să spună explicit că depinde de ION-166.

**H4 — high, −2.0 — Rata frontieră se calibrează pe populația brută a localității, dar se aplică pe bazinul echivalent.**
- Dovadă: tabelul «Verificat» (Halahora 333/704, Criva 232/920: populație brută, localitatea singură) vs pasul 6 («bazin echivalent × rata frontieră») + stratul 1 (bazin = localitate + sate vecine, ponderi 1,0 / 0,5 / 0,2).
- Scenariu de eșec: două erori de unitate se combină.
  - (a) Ratele mari (Halahora 0,47) sunt mari tocmai pentru că urcă și vecinii (planul o spune la (a)). Percentila 75 le alege pe acestea. Aplicate apoi pe un bazin care conține deja vecinii, vecinii se numără de două ori și piața Briceniului se umflă.
  - (b) O rată pe locuitor brut aplicată pe locuitori echivalenți (~0,75 × brut) taie ~25 % în sens invers.
  - Rezultatul e o cifră a cărei eroare nu are semn cunoscut, deci intervalul «din populație» nu se poate compara cu «din ofertă».
- Corecția în plan: pasul 3 (bazinul) se face înaintea calibrării. Rata observată = bilete (+ omiși, vezi M2) ale stației ÷ bazinul echivalent al aceleiași stații. Aceeași definiție de numitor se folosește la calibrare și la aplicare. Tabelul «Verificat» se reface în unitatea aceasta.

**M1 — medium, −1.0 — Legarea stație → localitate: «raionul rutei» nu e definit, iar resolverul existent nu e refolosit.**
- Dovadă:
  - `apps/admin/src/lib/anta/district.ts:1-12` rezolvă deja omonimele după vecinii de pe cursă și coordonate, iar intersecțiile le lasă `null`.
  - `382_concurenta_anta.sql:103`: «un raion null pe oprire se potrivește cu orice raion cerut», deci «Briceni 16 → fără Dondușeni» depinde de câte opriri `null` sunt.
  - `PairsView.tsx:61-64`: există perechi care apar doar în Numărare. Numele din `counting_entries.stop_name_ro` nu coincid mereu cu cele TIKI, iar `piata_statii` e cheiată doar pe numele TIKI.
  - 1.982 de rânduri BNS vs 1.667 localități cu coordonate în `anta_localities`, adică ~300 de sate fără lat/lon, care cad în tăcere din bazin.
- Corecția în plan:
  - Legarea omonimelor se face cu `LocalityIndex` din `district.ts`, pe vecinii stației din `tiki_route_stops` / `v_interurban_v2_route_stops`, nu „după raionul rutei”.
  - `piata_statii` primește și numele din Numărare.
  - Opririle «intersecție» nu se leagă de oraș.
  - Pasul 1 raportează câte sate BNS au rămas fără coordonate.
- Interogări: `select count(*) filter (where s.district is null), count(*) from anta_course_stops s join anta_courses c on c.id=s.course_id where c.source='anta' and s.name ilike '%briceni%';` și `select count(*) filter (where lat is null) from anta_localities;`.

**M2 — medium, −1.0 — Omișii au altă acoperire decât biletele, iar «noi X %» îi scoate din cota noastră.**
- Dovadă:
  - `460:8`: `zile` = zilele cu orice picior eligibil, nu acoperirea pe rută.
  - `458:68-69`: un picior fără bilet TIKI devine neeligibil.
  - `458:90`: `greatest(…, 0)` taie tronsoanele unde TIKI > numărat, ceea ce împinge omișii în sus.
  - `PairsView.tsx:14,41`: Numărarea există abia din 28.03.2026.
- Efect: «din ofertă» = bilete pe toată luna + omiși doar pe zilele numărate ale rutei respective. O lună cu Numărare parțială pe Briceni dă o piață mai mică fără ca piața să se fi schimbat. Omișii sunt pasagerii noștri, dar numărătorul «noi X %» are doar biletele.
- Corecția în plan:
  - Omișii se extrapolează pe rută și sens: omiși ÷ zilele eligibile ale rutei × zilele lunii, cu acoperirea afișată la hover.
  - «noi X %» = (bilete + omiși extrapolați) ÷ piață.
  - Lunile fără Numărare sunt marcate «fără omiși».

**M3 — medium, −1.0 — Pasul 6 depinde de pasul 7, iar rezerva pentru salarii golește benzile.**
- Dovadă: doar planul. Pasul 6 grupează «pe benzi de afordabilitate», dar `piata_salarii_raion` apare abia la pasul 7. «Verificat» spune că salariile Edineț/Ocnița sunt neextrase și că rezerva e media pe țară.
- Efect: cu rezerva, toate raioanele în afară de Briceni cad într-o singură bandă. Retrogradat la medium, pentru că executorul observă ordinea la primul pas, iar producția nu se strică.
- Corecția: ordinea pașilor devine 1 → 2 → 3 → 7 → 4 → 5 → 6. Salariile pe raion se extrag din PxWeb (SAL010510reg) înainte de calibrare. Fără ele nu există benzi, ci o singură frontieră.

**M4 — medium, −1.0 — Frontiera P75 pe benzi se calculează pe 4–5 localități.**
- Dovadă: doar planul (Riscuri: ≥ 500 locuitori echivalenți și ≥ 50 bilete/lună; ≤ 2 concurenți). Din tabel trec cam Criva, Drepcăuți, Corjeuți, Caracușenii Vechi și poate Halahora. Împărțite pe benzi de afordabilitate × distanță, rămân 1–2 puncte pe bandă, iar «restul moștenesc rata benzii» e circular.
- Corecția: un N minim pe bandă (de exemplu ≥ 8); sub el, o singură frontieră pe toată coada. N-ul se afișează la hover lângă rată.

**M5 — medium, −1.0 — Seats «45 unde ANTA notează autobuz» nu are sursă.**
- Dovadă: `anta_courses` nu are coloană de vehicul sau locuri (`382:26-35`). Doar `anta_course_stops.note` (`382:44`), al cărui conținut nu e în «Verificat». E o presupunere despre o sursă externă, retrogradată la medium pentru că rezerva (18) există.
- Corecția: un rând nou în «Verificat» cu `select note, count(*) from anta_course_stops group by 1 order by 2 desc limit 30;`. Dacă nu apare tipul vehiculului, se scoate «45» și se afișează intervalul 18…45 ca presupunere.

**M6 — medium, −1.0 — Experimentul ION-165 nu e dovedit ca reducere de preț în TIKI și se compară cu luni declarate nesigure.**
- Dovadă:
  - `git show f5989a11 --stat`: s-au schimbat site, voce, FB, anunțul și `offer-calc.ts`, nu tariful din terminale.
  - `packages/db/src/offer-calc.ts`: înainte se folosea 133 km × rată − reducere. Prețul mediu plătit în 09.2026 e 143 lei («Verificat»), sub 150, deci «ieftinit» nu e un fapt.
  - Planul însuși spune că datele dinainte de 02.2026 au «blocuri false», dar compară cu 10.2025.
  - Bălți e trunchi (136 de curse), deci diferența măsoară mutarea de la concurenți (cota), nu elasticitatea pieței.
- Corecția: un rând în «Verificat» cu prețul mediu TIKI pe Bălți → Chișinău înainte și după 02.10. Baza de comparație = septembrie 2026 și sensul opus, fără 2025 (sau 2025 numai pe `tiki_ticket_attr` pe ziua cursei, dacă există). Rezultatul se numește «elasticitatea cotei noastre pe trunchi» și nu se transferă automat în stratul 3 pentru coadă.

**M7 — medium, −1.0 — Verificarea pașilor 5–6 pe Criva / Hlina / Halahora nu poate pica.**
- Dovadă: doar planul. Cu 0–2 concurenți, formula «din ofertă» dă bilete + omiși prin construcție.
- Corecția: verificarea se face pe 2–3 perechi cu concurenți reali (Chișinău–Lipcani 8, Chișinău–Briceni). «Din ofertă» și «din populație» trebuie să se suprapună în interval. Plus o probă leave-one-out a frontierei: ratele scoase pe rând din calibrare trebuie să cadă în intervalul prezis.

**L1 — low, −0.5 — Numărătorul «noi X %» și coloana «Bilete» din același rând vin din zile diferite.**
- Dovadă: `get_tiki_pairs` citește `tiki_daily_pair` pe `sale_date` (`449_tiki_totaluri_directii.sql:72-73`), iar planul cere `tiki_ticket_attr` pe ziua cursei pentru piață.
- Corecția: în plan se fixează o singură bază pentru tot rândul. Fie coloana «Bilete» trece pe ziua cursei odată cu «Piața», fie se scrie la hover că diferă.

Total deduceri: 4 × 2,0 + 7 × 1,0 + 0,5 = 15,5 (scorul iese sub zero; rubrica nu are prag de jos).

Scor: -5.5 · Blocante (critical/high): 4

## Review: revizor de metodă (runda 1)

Plan: `docs/plans/2026-10-01-piata-potentiala-bilete.md`. Întrebarea de fond: cifra «Piața ~N / lună, noi X %» pe pereche — e definită corect, se poate calcula din datele enumerate și ce o poate face falsă?

Verdict scurt: sursele există (RPL 2024 pe localități, `tiki_daily_pair` cu sens, `anta_course_stops`, `tiki_trips`, omișii pe pereche) și planul are reflexele bune (interval, nu cifră; trunchiul exclus; parametri în tabelă; întrebări către Ion). Dar cele două estimări, așa cum sunt scrise, nu măsoară ce spune eticheta: «din ofertă» numără aceleași locuri la fiecare pereche a unei rute, iar «din populație» e calibrată pe un set care, cu propriul filtru al planului, dă o piață MAI MICĂ decât vânzările noastre. În plus, stratul 3 pleacă de la o premisă falsă: 150 lei pe Bălți→Chișinău e o scumpire, nu o ieftinire.

### Ce am verificat pe viu (în afara planului)

- `app_config.rate_per_km_long` = 1,19 (din 25.09). `apps/admin/src/lib/price-popular.ts:101-102`: BALTI_KM = 133, BALTI_REDUCERE = 20 → Bălți→Chișinău înainte de 02.10 = 133 × 1,19 − 20 = **138 lei**; `packages/db/src/offer-calc.ts:21` BALTI_CHISINAU_FIXED = 150 din 02.10; `packages/db/src/offer-calc.test.ts:78-81`: 01.10 → 138, 02.10 → 150.
- `tiki_daily_pair`, 09.2026: Chișinău–Bălți tur 5.044 bilete la 152 lei mediu, retur (Bălți→Chișinău) 4.972 la **133 lei** mediu; Briceni 1.202/1.194 la 275/274; Edineț 1.278/1.072 la 234. Toată luna: tur 14.014, retur 12.732, zero «necunoscut». Cheia perechii e fără sens, sensul e coloană separată (migr. 449:8-17).
- `tiki_daily_pair`, 09.2026, Halahora de Sus: Chișinău 193, Bălți 80, Edineț 28, Briceni 11, Cupcini 6, Corlăteni 5, Rîșcani 3 … → «333 bilete pe stație» din plan e suma pe TOATE perechile, la prețuri de la ~40 la ~300 lei.
- `tiki_trips`, 09.2026, fără state=3: 2.292 curse, 41.256 locuri, 26.842 bilete = 65 %; **492 curse (21 %) au tickets_sold > seats**, 586 ≥ seats. Deci raportul e rulaj de bilete pe loc (un loc se vinde de mai multe ori pe aceeași cursă), nu grad de ocupare.
- `anta_courses` (migr. 382:36): «O cursă = (cod, denumire, firmă, ora plecării tur, ora plecării retur)» — un rând = o pereche de plecări pe zi (dus + întors). Edineț–Chișinău: 31 curse ANTA, 30 au oprire la Bălți, ~10 opriri/cursă.
- `get_tiki_omisi('2026-09-01','2026-09-30')`: 19.367 oameni pe **1.136 perechi**; top: Beleavinți–Briceni 758, Briceni–Lipcani 621, Bălți–Recea 517, Edineț–Halahora de Sus 477 (bilete TIKI pe aceeași pereche: 28), Briceni–Drepcăuți 305, Bălți–Chișinău 274. Omișii sunt în majoritate o piață LOCALĂ pe tronsoane, nu perechi cu Chișinăul.
- migr. 261:4: ruta 6 merge Corjeuți → Caracușeni → Tabani → Briceni → Halahora → Hlinaia → Edineț; `apps/admin/scripts/anta/localities-md.txt:23-24`: Halahora de Jos și de Sus la ~3 km una de alta. Halahora de Sus nu e capăt; e stația unde urcă două sate și tranzitul Briceni↔Edineț.

### Deducerile

**1. [high, −2.0, defect de logică — BLOCANT] «Din ofertă» pe pereche numără capacitatea unei curse integral la fiecare pereche pe care o atinge (OD ≠ tronson), cu un «grad de ocupare» care e rulaj, și fără să spună dacă înmulțește cu 2 sensuri.**
Dovadă: plan l.53-57 și l.130-131 («curse care ating ambele capete × locuri × ocuparea noastră»), l.139-141 (KPI = Σ bilete ÷ Σ piață); `packages/db/migrations/451_tiki_mobilet_import.sql:30-31` (tickets_sold / seats pe cursă, nu pe pereche); interogarea de mai sus (492 curse peste 100 %); `382_concurenta_anta.sql:36` (o cursă = tur + retur).
Scenariu de eșec: o cursă străină Chișinău–Criva atinge Criva, Briceni, Edineț, Bălți. Formula îi adaugă 18 × 0,65 (× 2 sensuri?) călători pe zi la Chișinău–Criva, încă o dată la Chișinău–Briceni, încă o dată la Chișinău–Edineț. La Chișinău–Edineț: 31 curse × 18 × 0,65 × 2 × 30 ≈ 21.800/lună «piață», din care cea mai mare parte sunt de fapt pasageri Chișinău–Bălți, Chișinău–Briceni sau Chișinău–Lipcani ai acelorași mașini; «noi 2.350 ÷ 21.800 = 11 %» e fals, iar KPI-ul global adună aceleași locuri de 5–10 ori. Dacă nu se înmulțește cu 2, toată piața e la jumătate (interval 5/7–7/7 = ±17 %; factorul uitat = 100 %). Verificarea de la pasul 5–6 (Criva/Hlina/Halahora) nu poate prinde nimic din asta: acolo termenul «concurenți» e 0, deci formula e trivial corectă.
Corecție în plan: (a) definește explicit: «capacitatea unei curse străine = 2 plecări/zi × locuri × rulajul nostru pe aceeași rută»; (b) repartizează capacitatea pe perechile cursei, nu integral — cel mai simplu proporțional cu distribuția OD a propriilor noastre bilete pe ruta cu aceleași capete (`tiki_ticket_attr`), sau măcar: cursa intră întreagă doar la perechea capăt–capăt și cu o cotă (1 ÷ nr. perechi de pe cursă) la restul; (c) verificarea nouă: pe o rută cu concurenți cunoscuți (Chișinău–Lipcani, 8 curse), Σ «din ofertă» pe toate perechile rutei ≤ capacitatea totală a rutei; dacă iese 3–5× — formula e greșită; (d) numește cifra «bilete pe loc oferit», nu «ocupare».

**2. [high, −2.0, presupunere falsă despre sursa de date — BLOCANT] Stratul 3 descrie experimentul Bălți ca ieftinire («un singur sens ieftinit», «după 02.10 pe sensul Bălți→Chișinău scade»); în realitate 150 lei e o SCUMPIRE a sensului retur.**
Dovadă: `price-popular.ts:101-102` + `app_config` 1,19 → 138 lei până la 01.10; `offer-calc.ts:21` și `offer-calc.test.ts:81` (01.10 = 138) / `:78` (02.10 = 150); `tiki_daily_pair` 09.2026: plătit mediu pe Bălți→Chișinău 133 lei. 138 → 150 = +8,7 % față de listă, +13 % față de plătitul mediu; dus-întors 285 → ~302, afordabilitatea Bălțiului se înrăutățește, nu se îmbunătățește (plan l.81-82).
Scenariu de eșec: pasul 9 citește scăderea biletelor retur față de tur ca «zgomot» sau ca «ieftinirea nu a adus oameni»; banda de afordabilitate a Bălțiului e pusă în partea greșită și rata frontieră se compară între localități grupate greșit; Ion ia decizia de preț pe o concluzie cu semnul invers.
Corecție în plan: rescrie stratul 3 și pasul 9: «din 02.10 Bălți→Chișinău se scumpește de la 138 la 150 lei (+8,7 %); măsurăm elasticitatea la CREȘTERE de preț (poate fi asimetrică față de o scădere) pe prețul plătit mediu pe sens, nu pe listă». Dacă Ion a vrut de fapt o ieftinire (150 față de întregul 158, dar reducerea de 20 dispare), întrebarea 5 pentru Ion: «știi că 150 e mai mult decât 138, cât costa ieri cu reducerea?».

**3. [high, −2.0, defect de logică — BLOCANT] Rata frontieră «din populație» e contrazisă de propriul filtru al planului și, aplicată, dă o piață mai mică decât vânzările noastre; unitatea de calibrare (stația, toate perechile) nu e unitatea afișată (perechea).**
Dovadă: plan l.63-70 (rate 0,47/0,28/0,25/0,07/0,07/0,04, «la același preț ~280–320 lei», Briceni potențial 1.100–2.000) vs l.166-168 (frontiera doar pe ≥ 500 echivalenți și ≥ 50 bilete); tabelul l.108 (rate pe STAȚIE: Briceni 3.617, Halahora 333) vs l.104 (perechea Chișinău–Briceni 2.396, Chișinău–Halahora 193 din interogare); interogarea Halahora (193 Chișinău + 80 Bălți + 28 Edineț + 11 Briceni + …).
Scenariu de eșec: cu factorul de echivalență al planului (~0,74), Hlina (647 → ~480) cade sub prag, Halahora (704 → ~520) abia trece; P75 pe {0,47; 0,25; 0,07; 0,07; 0,04} = 0,25 → Briceni oraș 4.300 × 0,25 ≈ 1.075 călătorii/lună «din populație» față de 2.396 bilete proprii pe pereche: «Piața ~1.100, noi 220 %». Planul citește exact acest rezultat ca «bazinul real e mai mare» (l.69-70) — adică estimarea nu poate fi niciodată falsificată: când iese sub vânzări, se mărește bazinul. Pe deasupra, 0,47 la Halahora e suma perechilor cu Chișinău, Bălți, Edineț, Briceni (benzi de preț de la ~40 la ~320 lei), deci «aceeași bandă de preț» nu e adevărat nici pentru setul de calibrare.
Corecție în plan: (a) rata se definește pe PERECHE: bilete pereche (+ omiși pereche, vezi 5) ÷ bazinul capătului mic; (b) setul de calibrare se scrie explicit în plan, cu P75 calculată și arătată (nu «se re-estimează lunar automat»); dacă pe o bandă (preț × distanță) sunt < 5 perechi eligibile, «din populație» nu se afișează deloc; (c) regulă fermă: piața afișată ≥ bilete + omiși (nu «se mărește bazinul»); dacă estimarea e sub, coloana arată «≥ N (bilete + omiși)» și un steag «calibrare insuficientă»; (d) pentru orașe (Briceni, Edineț, Cupcini, Lipcani) nu există set de calibrare fără concurenți — spune-o și arată doar «din ofertă».

**4. [medium, −1.5, sarcină fără estimare] Experimentul Bălți: controlul (celălalt sens) nu e independent și puterea testului nu e estimată.**
Dovadă: `tiki_daily_pair` 09.2026: tur 5.044 / retur 4.972 — practic aceiași oameni dus-întors; plan l.143-145 (prag ±10 % lunar, 4 săptămâni).
De ce contează: la o scumpire pe retur, o parte din oamenii pierduți își iau și dusul de la concurent (obicei, bilet luat odată) → scade și controlul → diferența între sensuri SUBESTIMEAZĂ elasticitatea; invers, cine cumpără în Chișinău dus la noi și întors de la altcineva e invizibil în tur. Efectul așteptat (la elasticitate −0,5…−1 pe +9–13 % preț = −5…−13 % bilete retur) e de mărimea zgomotului lunar pe care planul îl pune singur la ±10 %, deci 4 săptămâni nu pot despărți efectul de zgomot. Octombrie vs septembrie mai are și sezonul studenților, comun ambelor sensuri doar parțial.
Corecție în plan: pre-înregistrează testul: metrica = raportul retur/tur pe săptămână pe perechea Chișinău–Bălți, 8 săptămâni înainte vs 8 după, cu aceleași săptămâni din 2025 pentru sezon; estimează varianța raportului pe 2026 și scrie în plan efectul minim detectabil; raportează și prețul plătit mediu pe sens (listă ≠ plătit: 133 față de 138) și biletele perechilor vecine (Chișinău–Sîngerei, Bălți–Edineț) ca test de deplasare.

**5. [medium, −1.0, defect de descriere a unității] Bilete = călătorii pe sens; bazin = persoane rezidente. Planul pune «~3.100 călătorii / lună» lângă «bazin 11.300 loc.» și «0,47 călătorii/locuitor» fără conversie, iar bazinul RPL exclude exact călătorii cei mai grei.**
Dovadă: migr. 449:13 (`direction`), interogare (tur 14.014 / retur 12.732); plan l.30-32, l.40-41 (RPL = reședință obișnuită).
De ce contează: un rezident care merge o dată pe lună la Chișinău = 2 bilete pe aceeași pereche; studenții, cei care lucrează în Chișinău și vin acasă, rudele din Chișinău și diaspora în vizită cumpără bilete pe perechea Briceni dar NU sunt în populația Briceniului (reședința obișnuită e în Chișinău sau afară). Rata «0,47 pe locuitor» amestecă deci rezidenți și nerezidenți și numără persoanele de două ori; de aceea poate trece ușor de 1 și nu înseamnă «47 % din sat pleacă lunar». La localitățile cu migrație mare rata crește cu migrația, nu cu propensiunea de a călători — iar frontiera P75 selectează tocmai asemenea sate.
Corecție în plan: afișează piața ca «N bilete/lună ≈ N/2 drumuri dus-întors»; «din bazin pleacă ≈ (N/2) ÷ bazin pe lună» ca indicator separat, cu nota «include nerezidenți (studenți, rude, diaspora)»; spune în prima propoziție a paginii că bazinul e un numitor de scară, nu numărul clienților posibili.

**6. [low, −0.5, descriere incompletă] Numărătorii celor două estimări diferă: omișii intră în «din ofertă», dar nu în ratele «din populație»; iar omișii sunt în majoritate o piață locală pe tronsoane, pe care «din populație» (bazin = capătul îndepărtat față de Chișinău) n-o modelează.**
Dovadă: migr. 459:3-5 (omișii = numărat − TIKI pe tronsoane, pe pereche fără sens); interogare (19.367 pe 1.136 perechi; Edineț–Halahora 477 omiși la 28 bilete; Beleavinți–Briceni 758); plan l.53-54 vs l.108.
Corecție în plan: omișii intră în ambele estimări sau în niciuna; perechile cu ambele capete pe aceeași coadă (local) se marchează «local» și primesc doar «bilete + omiși», fără «din populație» și fără concurenți ANTA (acolo concurența reală sunt rutierele raionale, care nu sunt în foaia interraională).

**7. [low, −0.5, cosmetică/afirmație falsă] «Coloana nu are constante scrise de mână» (l.84) — dar 1,0/0,5/0,2, 7 km, 18/45 locuri, ≤ 2 concurenți, P75, ≥ 500/≥ 50, 5/7–7/7 sunt toate constante de mână; iar re-estimarea lunară din propriile vânzări face «piața» să se miște cu vânzările noastre (la perechea P75 cota = 100 % prin construcție).**
Dovadă: doar planul (l.47, 59-67, 84, 124, 130-131, 135, 166-168).
Corecție în plan: tabelă de parametri cu versiune și dată; rata frontieră înghețată pe trimestru și schimbată doar cu un rând nou, ca schimbarea să fie vizibilă în istoricul coloanei.

### Ce NU e deducere (dar merită spus)
- Trunchiul exclus, intervalul 5/7–7/7, raionul la omonime, pragul de circulație ≥ 03.2026, baza NANO (calcul lunar, nu la deschidere) — corecte și verificate.
- Perechile cu două capete mici (Bălți–Edineț) sunt acoperite de 1 și 3: după corecții, ele primesc «bilete + omiși» și «din ofertă» repartizat; «din populație» doar dacă există set de calibrare pe banda lor (azi nu există: 30/31 curse Edineț–Chișinău opresc la Bălți, deci nicio localitate «≤ 2 concurenți» pe banda 80–120 lei). Planul ar trebui să conțină o matrice explicită «tip pereche → ce estimări se afișează».
- 31 vs 34 curse Edineț–Chișinău: diferență de potrivire a numelor, nu de metodă.

Scor: 0.5 · Blocante (critical/high): 3

## Triaj runda 1 (sesiunea principală)

| id | severitate | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| BLA H1 / MET 1 | high | cursa străină numărată integral la fiecare pereche; «ocupare» e rulaj; ×2 sensuri nespus | **acceptat** | verificat: 492/2.292 curse cu bilete > locuri; migr. 382:36 un rând = tur + retur → formula «din ofertă» cu 2 plecări × rulaj pe rută × cota OD; control Σ ≤ capacitate pe Chișinău–Lipcani |
| BLA H2 | high | prag «> 12 = trunchi» pe capăt scoate Edineț/Briceni | **acceptat** | trunchi = lista nominală din memoria 21.09; capătul nu e trunchi niciodată |
| BLA H3 | high | pasul «piața» în `tiki-refacere` (zi, 120 s, omiși nerefăcuți) | **acceptat** | verificat route.ts:11-28, migr. 456, incident NANO → job separat de noapte, ≤ 20 s, după cozi goale, depinde de ION-166 |
| BLA H4 / MET 3 | high | rata calibrată pe populație brută pe stație, aplicată pe bazin echivalent pe pereche; estimarea nefalsificabilă | **acceptat** | verificat: Halahora 333 = 7 perechi, nu e capăt (ruta 6) → rata pe pereche ÷ bazin echivalent, set explicit și înghețat, < 8 perechi = fără estimare, regula «piața ≥ bilete + omiși», orașe doar «din ofertă» |
| BLA M6 / MET 2 | medium / high | ION-165 nu e ieftinire | **acceptat** | verificat: listă 138, plătit 133, din 02.10 150 → stratul 3 rescris; întrebarea 5 pentru Ion |
| MET 4 | medium | controlul (sensul tur) nu e independent; putere neestimată | **acceptat** | test pre-înregistrat: raport retur/tur săptămânal, 8+8 săptămâni, 2025 pentru sezon, MDE înainte, perechi vecine ca test de deplasare |
| MET 5 | medium | bilete ≠ persoane; bazinul exclude nerezidenții | **acceptat** | secțiunea «Unitățile»: N bilete ≈ N/2 drumuri; bazin = numitor de scară cu nota nerezidenți |
| BLA M1 | medium | omonime fără `district.ts`; nume Numărare; «intersecție»; ~300 sate fără coordonate | **acceptat** | pasul 1–2; verificat: BNS 1.982 vs `anta_localities` 1.667 |
| BLA M2 / MET 6 | medium / low | omișii pe alte zile; nu intră în «noi %»; sunt piață locală | **acceptat** | verificat: 19.367 pe 1.136 perechi, top local → extrapolare pe rută/sens cu acoperire; omișii în ambele estimări; tip «local» |
| BLA M3 | medium | pasul 6 depinde de 7 (salarii) | **acceptat** | ordinea pașilor: salariile = pasul 4 |
| BLA M4 | medium | P75 din 4–5 sate | **acceptat** | ≥ 8 perechi pe bandă, altfel fără estimare (armonizat cu MET 3b) |
| BLA M5 | medium | «45 locuri unde ANTA notează autobuz» fără sursă | **acceptat** | verificat: `note` = locuri de oprire, nu vehicul → 18 presupus, 18…45 doar la hover |
| BLA M7 | medium | verificarea pe Criva/Hlina/Halahora nu poate pica | **acceptat** | verificarea pe Lipcani/Briceni + leave-one-out |
| MET 7 | low | «fără constante de mână» fals; frontiera lunară se mișcă cu vânzările | **acceptat** | tabela `piata_parametri` cu versiune; frontiera înghețată pe trimestru |
| BLA L1 | low | «Bilete» pe ziua vânzării vs piața pe ziua cursei | **acceptat** | secțiunea «Unitățile»: o singură bază de zile sau notă la hover |

Scor Claude după runda 1 (minimul revizorilor, pe planul v0): −5,5 / 0,5 · toate observațiile închise prin corecție în v1.

## Critic extern — runda 1 (Codex gpt-6-astra)

Scor 4,0 · verdict fail · 2 high, 2 medium (Σ greutăți 6,0; JSON valid, consistent).

| id | severitate | esență | decizie | motiv / unde în plan |
|---|---|---|---|---|
| C1 | high (2,5) | rulajul din `tiki_trips` = deschideri de terminal, nu plecări; aplicat pe plecări ANTA dublează | **acceptat** | verificat migr. 452:4-6 («un trip_id e o deschidere de terminal») și pe viu: pe plecări fizice 25.841 / 32.983 = 78 %, nu 65 %; «Unitățile» rescris, rulaj din `tiki_leg_daily` ÷ `tiki_plecari_daily`, test «deschidere cu două sensuri → rulaj 1» |
| C2 | high (2,5) | omișii pe pereche sunt OD reconstruit, nu observat; nu pot fi limită inferioară | **acceptat** | migr. 458:90-115 (coborâri proporționale); «Bilet observat ≠ omis estimat» în Unități; regula «≥» doar pe bilete; omișii separat cu «~», în calibrare doar ca sensibilitate; test A–B–C cu încărcare constantă |
| C3 | medium (0,5) | curse străine fără rută proprie cu aceleași capete (Lipcani–Tiraspol) | **acceptat** | `piata_concurenti_ref` cu referință pe capătul îndepărtat, acoperire în plecări, «aprox.» cu rulaj median, niciodată zero |
| C4 | medium (0,5) | perioada implicită 8 săptămâni, intervale arbitrare, filtre rută/șofer vs agregate lunare | **acceptat** | verificat `BileteAparatTab.tsx:50-59,103-114`, `PairsView.tsx:37-41`; secțiunea «Perioada și filtrele paginii»: doar luni încheiate, fără filtre, «—» la selecții incompatibile |

## Review: business-logic-auditor (runda 2)

Obiect: planul v2, secțiunile de la început până la primul «## Review:». Am verificat în repo migrările 452, 453, 455, 456, 458 și 460, apoi `BileteAparatTab.tsx`, `PairsView.tsx`, `periods.ts`, `offer-calc.test.ts`, `price-popular.ts` și `tiki-mobilet.yml`. Pe bază am rulat trei citiri mici, doar pe agregate: `tiki_plecari_daily` pe lună și sursă, rulajul pe rută și sens în 09.2026 și lista `crm_routes` interurbane.

### (a) Observațiile mele din runda 1

| id | stare | motiv |
|---|---|---|
| H1 cursa străină numărată integral la fiecare pereche | **închis pe calea principală, rămâne pe calea de rezervă** | Calea principală e corectă: 2 plecări/zi × rulaj × cota OD, cu controlul Σ ≤ capacitate pe Chișinău–Lipcani. Calea fără referință („rulaj median + «aprox.»”) nu definește cota, deci dublarea poate reveni (H-B mai jos). |
| H2 prag «> 12 = trunchi» pe capăt | **închis** | Trunchiul e acum o listă nominală, iar capătul rutei nu e niciodată trunchi. Pragul 12 rămâne doar pentru tăierea cozii. |
| H3 pasul în `tiki-refacere` | **închis în esență, rămâne parțial** | Jobul separat de noapte, cu ≤ 20 s, cozile goale și dependența de ION-166, e corect. Lipsește recalculul lunilor „murdare” pe care l-am propus. Lipsește și legătura de oră cu fereastra ION-166 (M-3). |
| H4 rata pe populație brută vs bazin echivalent | **închis** | Rata e pe pereche, iar numitorul e bazinul echivalent, calculat înainte de calibrare și același la calibrare și la aplicare. Tabelul brut e marcat «nu se folosește». |
| M1 omonime, nume din Numărare, intersecții, sate fără coordonate | **închis** | Pașii 1 și 2: `LocalityIndex`, `piata_statii` cu nume din TIKI și din Numărare, «(intersecție)» rămâne nelegat, iar satele fără coordonate apar în raport. |
| M2 acoperirea omișilor / «noi %» | **închis, altfel decât am propus** | Planul a urmat C2 (Codex): omișii se extrapolează pe rută și sens, iar «noi %» = doar bilete observate, cu «+ ~Y %» afișat separat. Decizia e justificată. `tiki_ceilalti_od` are `crm_route_id` și `leg` (458:8-18), deci extrapolarea se poate face. |
| M3 salariile după calibrare | **închis** | Salariile sunt pasul 4, iar sursa BNS 2025 e completă pe raioane. |
| M4 P75 pe 4–5 sate | **închis** | Minimul e 8 perechi pe bandă, iar setul e scris și înghețat pe trimestru. Atenție: banda 255–320 are 9 perechi, iar Trinca (52) și Corpaci (65) sunt la limita de 50. Înghețarea pe trimestru acoperă asta. |
| M5 «45 locuri» fără sursă | **închis** | Verificat: `note` = loc de oprire. Planul ia 18 de locuri, cu 18…45 doar la hover. |
| M6 ION-165 nu e ieftinire | **închis** | Confirmat: `offer-calc.test.ts:78-81` dă 01.10 → 138 și 02.10 → 150. Planul îl măsoară ca scumpire și pune întrebarea 5. |
| M7 verificare care nu poate pica | **închis** | Verificarea se face pe Lipcani și Briceni, plus leave-one-out. |
| L1 ziua vânzării vs ziua cursei | **închis** | Fixat în «Unitățile»: o singură bază sau o notă la hover. |

### (b) Defecte noi sau rămase

**H-B — high, −2.0 — Cursele străine fără referință au rulaj, dar nu au cotă. Iar „ruta de referință” nu e unică.**
- Dovezi:
  - Planul, «Stratul 2», are două definiții diferite. Referința e „ruta noastră cu același capăt îndepărtat”. Cota e „distribuția OD … pe ruta cu aceleași capete”.
  - Rezerva („fără referință cu ≥ 20 plecări: rulajul median al coridorului + «aprox.»”) dă doar rulajul. Cota rămâne nedefinită.
  - Pe bază, `crm_routes` interurbane (id 1–31) au Grimăncăuți, Briceni, Ocnița, Șirăuți, Corjeuți, Criva, Lipcani, Otaci și Caracușenii. Nu există nicio rută spre Medveja sau Pererita. Planul însă le numără printre cele 12 curse străine ale Briceniului.
  - Același capăt îndepărtat are multe rute ale noastre, pe drumuri diferite:
    - Criva: 7, 8, 9, 11, 14, 15, 23, 28, plus variantele Larga și Tețcani;
    - Lipcani: 10, 12, 16, 19, 22, 27, plus 13 «(Rîșcani)» și 18 «(Viișoara)».
- Scenariul de eșec:
  - O cursă străină Chișinău–Medveja prin Bălți, Edineț și Briceni nu are referință.
  - Executorul are două ieșiri. Fie pune cursa întreagă la fiecare pereche atinsă, deci revine exact H1 („Chișinău–Edineț ~21.800/lună”). Fie nu o pune nicăieri, ceea ce încalcă „niciodată cu zero”.
  - Lipcani–Tiraspol, legată de „Chișinău–Lipcani”, poate lua OD-ul rutei 13 prin Rîșcani, adică perechi pe care cursa nu le atinge.
  - Formula de azi nu spune dacă cota tăiată la „perechile servite de ambele” se renormalizează la Σ = 1. Fără renormalizare, o parte din capacitatea cursei dispare. Cu renormalizare, se umflă perechile comune.
- Corecția în plan:
  - Referința = mulțimea rutelor noastre care ating ambele capete ale perechii și cel puțin un nod intermediar al cursei, agregate pe sens. Aceeași mulțime dă rulajul și cota.
  - Cota se restrânge la perechile atinse de cursa străină și se renormalizează la Σ = 1 pe fiecare cursă.
  - Pentru calea fără referință: cota = OD-ul coridorului (`tiki_coridor`, 452:38-47), restrâns la perechile cursei, renormalizat, cu steagul «aprox.».
  - Control automat: Σ cotă = 1 ± 0,001 pe fiecare cursă străină, plus un test unitar pe o cursă fără referință.

**H-A — high, −2.0 — Martie 2026 și 01–03.04 nu au locuri, deci rulajul nu există, dar planul declară luna ≥ 03.2026.**
- Dovezi:
  - `452_tiki_atribuire_agregate.sql:383` și `:399-406`: înainte de 04.04.2026, `tiki_plecari_daily` vine din bilete, cu `locuri NULL` și `plecari_cu_locuri 0`.
  - Pe bază, 03.2026 are 1.521 rânduri, toate `sursa='bilete'`, 0 cu locuri. Aprilie are 227 rânduri «bilete» și 1.346 «grafic».
  - Planul, «Verificat», rândul despre tendința lunară: „luna de referință ≥ 03.2026”. Pasul 6: „numai luni încheiate”.
- Scenariul de eșec:
  - Pentru 03.2026, „zilele-rută fără locuri nu intră” scoate toate zilele, deci rulajul e 0/0. Rezerva „rulajul median al coridorului” e și ea 0/0.
  - Termenul concurenților dă fie NaN (jobul pică pe lună), fie 0, iar atunci piața = bilete.
  - Pe Chișinău–Briceni, cu 12 curse străine, coloana arată „noi 100 %”, iar KPI-ul «Cota noastră» pe 03.2026 sare la ~100 %. Presetul «Anul curent» (`periods.ts:154`) include martie.
  - Numărarea există abia din 28.03 (`PairsView.tsx:14`), deci și omișii din martie acoperă doar 4 zile.
- Corecția în plan:
  - Prima lună cu «din ofertă» = 04.2026, cu zilele ≥ 04.04 și zilele extrapolate marcate, sau direct 05.2026.
  - 03.2026 și lunile mai vechi au «—», cu motivul „fără grafic de locuri”.
  - Jobul refuză explicit o lună fără zile-rută cu locuri, nu scrie 0.
  - Rândul din «Verificat» se corectează.

**M-1 — medium, −1.0 — Zilele-rută cu locuri PARȚIALE nu sunt definite.**
- Dovezi:
  - `455_tiki_plin_aceleasi_zile.sql:2-4`: pe ruta 2, 5 plecări cu locuri din 57 au dat 438 %. Reparația (`:24`) e `plecari_cu_locuri = plecari AND locuri > 0`, cu numărătorul pe aceleași zile.
  - Pe bază sunt 15 zile-rută parțiale în 09.2026 și 29 în 07 și în 08.
  - Planul exclude doar zilele-rută „fără locuri”. Cele 57 sunt exact rândurile `sursa='bilete'` din 09.
- Efect: la implementare, cu `locuri IS NOT NULL`, revine bugul din 455. Rulajul referinței umflat × 18 locuri × 2 × 30 se varsă direct în piață.
- Corecția: în «Unitățile», filtrul exact din 455:24 (toate plecările zilei au locuri), cu biletele numărate doar pe aceleași zile.

**M-2 — medium, −1.0 — Faptul despre rulaj din «Verificat» e greșit, iar împrăștierea lui nu e tratată.**
- Dovezi:
  - Recalculat pe bază, 09.2026, cu filtrul din 455, pe rută și sens: 56 combinații, rulaj între 0,25 și 1,48, mediana 0,71, total 25.826 / 34.200 = 75,5 %.
  - Planul spune „pe rute 93–148 %” și „25.841 / 32.983 = 78 %”. Asta e și intern imposibil: un total de 78 % nu poate ieși din rute care sunt toate ≥ 93 %. Numitorul planului a fost luat cu alt filtru.
- Efect: între rute, rulajul variază de ×6. Cifra «din ofertă» depinde deci mai mult de alegerea referinței (H-B) decât de orice alt parametru. Intervalul afișat (18 locuri, 5/7…7/7) nu cuprinde incertitudinea asta.
- Corecția:
  - Faptul se refă în «Verificat», cu filtrul din 455.
  - La hover se afișează rulajul referinței și numărul ei de plecări.
  - Rulajul median al coridorului devine rezervă doar dacă împrăștierea pe coridor e < ×2. Altfel, steagul «aprox.» se pune și în cifra principală.

**M-3 — medium, −1.0 — Jobul `piata-luna` nu are lunile „murdare” și nu are ora legată de ION-166.**
- Dovezi:
  - Ce redeschide lunile încheiate:
    - triggerele Numărării (452:463-499) pun zile în `count_refresh_queue` la orice salvare din GO, ziua;
    - `tiki_enqueue_import` (452:541-550) reimportă ultimele 8 zile, deci luna 09 se reface până pe ~08.10;
    - migrările 454, 457 și 458 pun toate lunile în coadă, iar azi s-a refăcut tot intervalul 03–09.
  - `tiki-mobilet.yml:9-11`: refacerea rulează azi la 06:30 și 08:00.
- Scenariul:
  - Cu programul de azi, la 03:30 coada Numărării conține salvările de după 08:00 din ziua precedentă. Condiția „cozi goale” cade în fiecare noapte, deci coloana rămâne «—» pentru totdeauna și nimeni nu află.
  - După ION-166, „câte o lună încheiată pe apel” nu spune care lună. 08.2026, refăcută ieri, rămâne cu piața calculată pe atribuirea veche, în timp ce rândul arată biletele noi.
- Corecția:
  - `tiki_refacere_pas` marchează luna terminată în `piata_luni_murdare`. Jobul ia cea mai veche lună încheiată murdară.
  - Ora jobului = sfârșitul ferestrei ION-166, scrisă ca dependență cu oră.
  - Un salt („cozi negoale”) se scrie în jurnal cu motivul. După 2 nopți la rând, apare un semn pe pagină.
  - Biletele din cotă se citesc din același instantaneu ca piața.

**L-1 — low, −0.5 — Perioadele cu mai multe luni și luna încă necalculată.**
- Dovezi: `periods.ts:151-154` are «ultimele 90» și «anul curent», care conțin mai multe luni. Anul curent mai conține 01–02 (blocuri false) și 03 (H-A).
- Planul spune „lunile încheiate conținute”, dar nu spune dacă se însumează. Nu spune nici ce se arată când luna e încheiată, dar rândul ei din `piata_pereche_luna` nu există încă: pe 01.10, septembrie e încheiat, dar jobul n-a rulat.
- Corecția:
  - Σ bilete ÷ Σ piață doar peste lunile cu rând calculat; numărul lunilor apare la hover.
  - O lună lipsă sau sub 05.2026 dă «—», niciodată 0.

**L-2 — low, −0.5 — Întrebarea 1 contrazice regula bazinului.**
- Planul întreabă dacă Beleavinți intră în bazinul Briceniului. Beleavinți are însă stație TIKI proprie («Beleavineti»; pereche în setul de calibrare, 217 bilete). Regula din stratul 1 spune că satele cu stație proprie nu intră în bazinul vecinului.
- Corecția: întrebarea se reformulează („Bălcăuți, Mărcăuți — sate fără stație”) sau regula se schimbă explicit. Altfel Beleavinți apare și în calibrare, și în bazinul Briceniului.

### Deduceri

H-B −2,0 · H-A −2,0 · M-1 −1,0 · M-2 −1,0 · M-3 −1,0 · L-1 −0,5 · L-2 −0,5 = −8,0

Scor: 2.0 · Blocante (critical/high): 2

## Review: revizor de metodă (runda 2)

Plan: `docs/plans/2026-10-01-piata-potentiala-bilete.md`, v2 (de la început până la primul «## Review:»). Întrebarea de fond rămâne aceeași: cifra «Piața N / lună, noi X %» pe pereche e definită consistent, se poate calcula din sursele numite și poate fi falsă?

Verdict scurt: v2 a închis toate cele șapte observații ale mele din runda 1 în litera lor — unitățile sunt fixate, «din ofertă» repartizează capacitatea pe perechi, omișii sunt separați de biletele observate, stratul 3 are semnul corect, parametrii au versiune. Au rămas două lucruri care nu țin de litera corecțiilor, ci de consistența dintre ele: (1) controlul care trebuie să prindă formula greșită de la «din ofertă» nu poate trece când formula e corectă și poate trece când e greșită, pentru că e scris pe «capacitate», iar rulajul pe rută e peste 100 % pe 11 din 60 rută-sensuri; (2) «din populație» la P75 nu e «a doua estimare a aceleiași mărimi», ci un potențial, și verificarea «cele două estimări se suprapun» pică prin construcție pe singurul set unde ambele există. Amândouă se repară cu câte un paragraf, dar sunt defecte de logică ale planului, nu de descriere.

### (a) Observațiile mele din runda 1

| # | runda 1 | stare | motiv |
|---|---|---|---|
| 1 | cursa străină numărată integral la fiecare pereche; «ocupare» = rulaj; ×2 sensuri nespus | **închis** | «Ce facem / din ofertă»: 2 plecări/zi × locuri × rulaj pe plecări fizice × cota OD; cursa nu intră întreagă la mai multe perechi; rulajul se numește rulaj. Controlul propus de mine (Σ ≤ capacitate) a fost preluat textual — și e greșit așa cum l-am scris eu atunci, vezi N1. |
| 2 | ION-165 descris ca ieftinire | **închis** | Stratul 3 rescris: 138 → 150 = +8,7 % / +13 %, întrebarea 5 obligatorie; `price-popular.ts:101-102`, `offer-calc.ts:21`, `offer-calc.test.ts:78-81` neschimbate față de runda 1. |
| 3 | rata pe stație/populație brută aplicată pe pereche/bazin; estimare nefalsificabilă | **închis în unitate, rămâne în semnificație** | Rata e pe pereche ÷ bazin echivalent, setul e scris, înghețat, < 8 → fără; regula «≥» pe bilete. Dar P75 ca «estimare» și verificarea prin suprapunere sunt contradictorii — N2. |
| 4 | controlul (sensul tur) nu e independent; putere neestimată | **închis ca design, rămâne sursa** | Test pre-înregistrat, raport retur/tur, 8+8 săptămâni, MDE înainte, perechi vecine. Controlul «aceleași săptămâni din 2025» n-are sursă numită, iar singura tabelă de perechi din plan e declarată de plan nefolosibilă înainte de 02.2026 — N3. |
| 5 | bilete ≠ persoane; bazinul exclude nerezidenții | **închis** | Secțiunea «Unitățile»: N bilete ≈ N/2 drumuri, bazin = numitor de scară cu nota nerezidenți, text în prima propoziție a paginii. |
| 6 | omișii într-o estimare și nu în cealaltă; sunt piață locală | **închis** | Asimetria e acum explicită și motivată (observat vs estimat, C2): omișii separat, cu «~», în calibrare doar ca sensibilitate; tipul «local» există. Altă rezolvare decât cea propusă de mine, dar consistentă. |
| 7 | «fără constante de mână» fals; frontiera se mișcă cu vânzările | **închis** | `piata_parametri` cu versiune și dată; P75 înghețată pe trimestru, schimbată cu rând nou. |

### Ce am verificat pe viu (runda 2)

- **Rulajul pe rută și sens, 09.2026**, `tiki_leg_daily` ÷ `tiki_plecari_daily` (migr. 452:100-125, tabelele; 452:343-384, umplerea): 60 rută-sensuri, de la 5 % (ruta 13, Lipcani-Rîșcani) la 148 % (ruta 20, Criva-Larga, nord→Chișinău); **11 din 60 ≥ 100 %**: 20 (148), 30 Otaci (146), 14 Criva (111), 24 Criva-Larga (111), 17 Criva-Tețcani (111), 19 Lipcani (104), 21 Otaci (102), 27 Lipcani (102), 3 Ocnița (102), 30 retur (100). Locurile noastre sunt **20/plecare** (600 = 30 × 20; migr. 452:6-7, Ion: «toate sunt de 20 de locuri»), nu 18.
- **Două rută-sensuri întregi fără locuri**: ruta 2 (Chișinău→Briceni) 30 plecări, 339 bilete, `locuri` NULL; ruta 16 (Chișinău→Lipcani) 27 plecări, 566 bilete, NULL. Deci cele «57 zile-rută fără locuri» sunt concentrate: pe sensul Chișinău→Briceni nu există rulaj deloc în 09.2026.
- **«Ruta Chișinău–Lipcani» nu e o rută**: `crm_routes` are 8 rute cu capătul Lipcani (10, 12, 13, 16, 18, 19, 22, 27; `dest_from_ro`/`dest_to_ro`), cu rulaje de la 5 % la 104 %; pe coridor agregat, unde locurile sunt cunoscute: 5.442 bilete / 8.780 locuri = **62 %**. Criva are 4 rute (14, 17, 20, 24), Otaci 2 (21, 30).
- **2025 pe ziua cursei există și e stabil**: `tiki_trips` (migr. 451:22, `trip_date`; index 451:38) aug–dec 2025: 1.446 / 1.376 / 1.601 / 1.707 / 1.701 deschideri, 23–27k bilete/lună; `tiki_leg_daily` 2025: aug 26,2k, sep 22,4k, oct 26,1k, nov 24,0k, dec 23,6k. **2025 pe ziua vânzării nu**: `tiki_daily_pair` (migr. 449:9, `sale_date`) Chișinău–Bălți: oct 2025 retur 4.849 / tur 4.604, **dec 2025 255 / 181** — blocurile false pe care planul însuși le numește.
- **Raportul între sensuri se mișcă singur cu sezonul**: `tiki_leg_daily` 2025, nord→Chișinău ÷ Chișinău→nord: aug 1,39, sep 1,43, oct 1,11, nov 1,04, dec 1,06. Asta e zgomotul pe care testul de preț trebuie să-l bată.
- **Setul de calibrare după factorul de echivalență al planului**: r. Briceni 15–64 = 24.874 / 46.894 = 53 %, 65+ ≈ 29 % (întrebarea 4), 0–14 ≈ 18 % → factor ≈ 0,53 + 0,29 × 0,5 + 0,18 × 0,2 ≈ 0,71. Hlina 647 × 0,71 ≈ 459 < 500 (iese), Halahora 704 × 0,71 ≈ 500 (la limită), Corpaci 837 × 0,71 ≈ 594. Setul de 9 e pe populație brută; după bazinul echivalent e 7–9, în funcție de ce aduce R = 7 km.

### (b) Răspunsurile la întrebările puse rundei

- **Rulaj > 100 % aplicat concurenților dă oameni, nu locuri — da, și e corect așa.** rulaj × locuri × plecări = bilete pe rută (toate perechile, cu urcări și coborâri pe tronson); × cota OD (care însumează 1 pe perechile rutei) = bilete pe pereche. Unitatea coloanei e bilete, deci produsul e în unitatea bună. Ce NU e consistent e controlul care-l verifică (N1) și referința «rută», care e de fapt coridor (N1).
- **Cota OD din biletele noastre**: consistentă cu rulajul (același numărător, aceeași rută) — cu condiția ca rulajul și cota să vină din ACELEAȘI rute (coridorul de referință), altfel Σ pe perechi ≠ bilete pe rută. Planul le ia din «ruta cu aceleași capete» și «ruta de referință» — două formulări pentru, sper, același lucru; de scris o dată.
- **«Din populație» pe 9 perechi, P75 ≈ 0,15**: rândul din «Verificat pe viu» e corect etichetat ca populație brută și planul spune că bazinul se calculează înainte. Dar: după factorul planului setul e 7–9 (vezi mai sus), iar semnificația P75 contrazice verificarea planului (N2).
- **Matricea tip pereche → afișare**: trei contradicții de text cu secțiunea «Unitățile» (N4); regula de clasificare nu e scrisă ca algoritm.
- **Testul de preț**: bine pre-înregistrat; controlul de sezon 2025 trebuie legat de `tiki_leg_daily`/`trip_date`, nu de `tiki_daily_pair` (N3); fereastra «8 săptămâni înainte de 02.10» începe pe 7 august, în vârful de august (29,9k) — de spus.
- **Afordabilitatea pe salariu cu 15 % salariați**: planul recunoaște și pune pensia a doua. Rămân două lucruri mici (N5): salariul BNS e brut (biletul se plătește din net, ≈ −21 %: 12 % impozit + 9 % CASS) și, pe setul de calibrare de azi, axa de afordabilitate e degenerată (Briceni 10.773 vs Edineț 11.387, 5 % diferență) — banda e de fapt preț × distanță, afordabilitatea e afișaj.

### Deducerile

**N1. [high, −2.0, defect de logică al planului — BLOCANT] Controlul formulei «din ofertă» (pasul 5: «Σ pe toate perechile rutei Chișinău–Lipcani ≤ capacitatea totală a celor 8 curse străine; dacă iese 3–5×, formula e greșită») nu poate trece când formula e corectă și poate trece când e greșită; «ruta de referință» e ambiguă (8 rute Lipcani, 4 Criva) și condiția «≥ 20 plecări» nu cere locuri.**
Dovadă: migr. 452:100-125 (`tiki_plecari_daily.locuri` poate fi NULL; `tiki_leg_daily.bilete` pe rută/sens, toate perechile); interogarea de mai sus: rulaj 102–148 % pe 11 rută-sensuri, ruta 2 și 16 cu `locuri` NULL pe un sens întreg; `crm_routes` 10/12/13/16/18/19/22/27 toate «Lipcani – Chișinău»; migr. 382:36 (o cursă ANTA = tur + retur).
Scenariu de eșec: (i) formula corectă cu referința ruta 19 (rulaj 104 %) sau 27 (102 %): Σ pe perechi = 1,02–1,04 × capacitate → «> capacitate» → control picat pe o formulă bună; (ii) formula greșită care numără ambele plecări la fiecare sens (exact dublarea pe care controlul vrea s-o prindă): Σ = 2 × 0,62 × capacitate = 1,24× → sub pragul «3–5×» → control trecut pe o formulă proastă. Controlul nu desparte cele două cazuri. (iii) Briceni, 12 concurenți: pe sensul Chișinău→Briceni ruta noastră 2 are 30 plecări (trece pragul «≥ 20 plecări») și zero locuri cunoscute → rulaj NULL → termenul concurenților pe sensul ăsta e NULL sau 0, deși planul spune «niciodată cu zero».
Corecție în plan: (a) controlul e o identitate, nu o inegalitate: pe fiecare coridor și sens, Σ_perechi termen_concurenți = Σ_curse 2 × locuri × zile × rulaj_coridor(sens), toleranță ±1 %; plus test unitar cu o cursă sintetică pe 3 perechi, în care Σ cotelor = 1 și dublarea pe sens e prinsă (dă 2,00×); (b) «ruta de referință» → «coridorul de referință» = toate rutele noastre cu același capăt îndepărtat; rulajul coridorului = Σ bilete ÷ Σ locuri pe rutele cu locuri cunoscute, pe sens; cota OD din aceleași rute; (c) condiția referinței = «≥ 20 plecări CU locuri pe lună și pe sens», altfel rulajul median al coridoarelor vecine + «aprox.»; (d) locurile noastre sunt 20 (migr. 452:6-7), nu 18 — rulajul e deja pe loc, deci formula rămâne bună, dar presupunerea «18 pentru străini» se motivează separat (rutiere mai mici), nu se amestecă cu flota noastră.

**N2. [high, −2.0, defect de logică al planului — BLOCANT] «Din populație» la P75 e numit «a doua estimare independentă» a aceleiași piețe și se verifică prin «cele două estimări se suprapun unde ambele există» și «leave-one-out: rata satului scos cade în intervalul prezis»; pe singurul set unde ambele există (cele 9 perechi fără concurenți), suprapunerea e imposibilă prin construcție și «intervalul prezis» nu e definit.**
Dovadă: planul, secțiunile «din populație» și «Verificare / pasul 5» (doar planul pentru text); cifrele din rândul «Setul de calibrare» al planului + `tiki_daily_pair` 09.2026: Corjeuți 243 bilete / 4.495 loc., Halahora 193 / 704, Hlina 128 / 647, Criva 140 / 920; `anta_course_stops`: Corjeuți 0 curse străine, Halahora 0.
Scenariu de eșec: P75 ≈ 0,15 pe populație brută. Corjeuți: «din ofertă» = 243 + ~omiși (zero concurenți) ≈ 250–300; «din populație» = 4.495 × 0,15 ≈ 674 — de 2,5× mai mult, pentru un sat în care nu circulă nimeni altcineva. Halahora: 704 × 0,15 ≈ 106 < 193 bilete → steagul «calibrare insuficientă» apare pe satul care a DAT P75. Hlina: 97 < 128 → același steag. Pe 9 perechi, ~6 ies «din populație ≫ din ofertă» și ~3 «sub bilete»; zero se suprapun. Verificarea de la pasul 5 pică la prima rulare, prin construcție, și singura ieșire e să se renunțe tăcut la cifră sau să se mute pragul — exact nefalsificabilitatea pe care runda 1 a vrut s-o scoată. În plus, cu factorul de echivalență al planului (≈ 0,71) Hlina iese sub 500 și setul e 8, la limita «< 8 → nu se afișează»: «singura bandă calibrabilă» stă într-un sat.
Corecție în plan: (a) P75 nu e estimare, e potențial: numește cifra «potențial la rata P75 a satelor fără concurenți din aceeași bandă» (asta e, de altfel, exact ce a întrebat Ion: «potențiali câți clienți pot fi»), afișat ca plafon, cu steagul «peste ofertă» când e peste «din ofertă», nu ca a doua măsurătoare a aceluiași lucru; (b) scoate «se suprapun» și «leave-one-out în intervalul prezis»; pune în loc un test de stabilitate: P75 recalculat fără oricare sat se mișcă < 20 %, altfel banda e «instabilă» și nu se afișează; (c) pe perechile din setul de calibrare nu se arată «calibrare insuficientă» (ar fi circular) — acolo se arată rata proprie față de P75; (d) scrie în plan că setul e 9 pe populație brută și «7–9 după bazinul echivalent», cu decizia ce se întâmplă la 7.

**N3. [medium, −1.0, gol de acoperire] Controlul de sezon al testului de preț («aceleași săptămâni din 2025») n-are sursă; singura tabelă de perechi folosită în plan e, după planul însuși, nefolosibilă înainte de 02.2026.**
Dovadă: migr. 449:9 (`tiki_daily_pair.sale_date`); interogare: Chișinău–Bălți dec 2025 = 255 / 181 față de 4.849 / 4.604 în oct; migr. 451:22, 38 (`tiki_trips.trip_date` indexat) și `tiki_leg_daily` 2025 stabil (22–26k/lună); rândul din «Verificat pe viu»: «înainte, blocuri false».
Scenariu de eșec: raportul retur/tur din toamna 2025 se ia din `tiki_daily_pair` → în săptămânile cu blocuri false raportul e oricare; corecția de sezon introduce zgomotul pe care trebuia să-l scoată. Și controlul e necesar, nu opțional: raportul se mișcă singur de la 1,39–1,43 (aug–sep 2025) la 1,04–1,11 (oct–nov) — o mișcare de 30 %, de 3× efectul așteptat (−5…−13 %).
Corecție în plan: sursa testului = `tiki_ticket_attr` / `tiki_leg_daily` pe ziua cursei (`tiki_trips.trip_date`), pe perechea Chișinău–Bălți și pe sens, atât pentru 2026 cât și pentru 2025; MDE se estimează din săptămânile 2025–2026 pe aceeași sursă; se spune că fereastra «8 săptămâni înainte» începe pe 7 august, în vârf, și de ce raportul (nu nivelul) e metrica.

**N4. [low, −0.5, descriere incompletă] Matricea «tip pereche → ce se afișează» contrazice în trei locuri secțiunea «Unitățile» și nu e un algoritm.**
Dovadă: doar planul. (i) Rândul «Chișinău – oraș din nord»: «se arată “≥ bilete + omiși”» — dar «Unitățile» și «Regulă fermă» spun că omișii nu intră niciodată în «≥»; și rândul are «din ofertă: da», deci de ce s-ar arăta «≥» în loc de interval? (ii) Rândul «două capete mici» are exemplul Bălți–Edineț, iar rândul de deasupra îl pune pe Bălți la «nod de trunchi»; eticheta corectă e «aceeași coadă, fără Chișinău», nu «două capete mici». (iii) «local: bilete + omiși» ca o singură cifră, când peste tot omișii se afișează separat cu «~». (iv) Granița rând 1 / rând 2 («sat pe coadă» vs «oraș») e implicit «≤ 2 curse străine cu raion» — de scris ca regulă, cu Lipcani (8) explicit în rândul 2.
Corecție în plan: o listă ordonată de 4 reguli (conține Chișinău? celălalt capăt în lista trunchi? ≤ 2 concurenți? altfel), și aceeași convenție de afișare a omișilor în toate rândurile.

**N5. [low, −0.5, descriere incompletă] Afordabilitatea: salariul BNS e brut, biletul se plătește din net; pe setul de azi axa de afordabilitate e degenerată.**
Dovadă: doar planul (stratul 3, «câștigul brut al raionului»; tabelul salariilor: Briceni 10.773, Edineț 11.387, Ocnița 11.347, Rîșcani 11.211 — toate în 5 %); cele 9 perechi de calibrare sunt toate în r. Briceni/Edineț.
De ce contează: dus-întors Briceni 548 lei = 5,1 % din brut, 6,4 % din net (≈ 0,79 × brut), 15 % dintr-o pensie medie; dacă banda se definește pe afordabilitate, toate cele 9 perechi cad într-o singură celulă oricum — banda reală e preț × distanță. Nu e defect de rezultat, e de etichetă: coloana promite o axă pe care nu o are.
Corecție în plan: banda = preț × distanță (deja); afordabilitatea = afișaj la hover, pe net (brut × 0,79) și pe pensie, cu anul; «axa de bandă» se scoate până când există perechi calibrabile în raioane cu venit diferit.

### Ce NU e deducere
- Rulajul pe plecări fizice (78 %) în loc de deschideri (65 %), omișii ca estimare separată, lunile încheiate fără filtre, jobul de noapte separat de `tiki-refacere`, trunchiul nominal, bazinul calculat înainte de calibrare — corecte și verificate.
- Rata «din populație» pe populație brută în rândul «Verificat pe viu» — etichetată corect ca provizorie; nu e deducere, e doar fragilă (N2 d).
- Testul «deschidere cu două sensuri → rulaj 1» și testul A–B–C pentru omiși — bune, rămân.

Scor: 4.0 · Blocante (critical/high): 2

## Triaj runda 2 (sesiunea principală)

| id | severitate | esență | decizie | motiv / unde în plan (v3) |
|---|---|---|---|---|
| BLA H-B / MET N1 | high | referința «rută» nu e unică (8 rute Lipcani); fără referință nu există cotă; controlul «Σ ≤ capacitate» nu deosebește formula bună de dublare | **acceptat** | verificat `crm_routes` (8/4/2 rute pe capăt), rulaj 44–148 % cu filtrul 455 → «coridor de referință», cota restrânsă + renormalizată Σ = 1, caz «fără referință» cu OD `tiki_coridor` + rulaj median, controlul = identitate ±1 % + cursă sintetică |
| BLA H-A | high | 03.2026 n-are locuri; «luna ≥ 03.2026» dă 0/0 | **acceptat** | verificat: prima zi cu locuri 04.04.2026 → prima lună 05.2026, lunile ≤ 04 «—», jobul refuză luna fără locuri |
| MET N2 | high | «din populație» la P75 nu e a doua estimare; suprapunerea pică prin construcție (Corjeuți ~670 vs ~250; Halahora sub bilete) | **acceptat** | secțiunea 2b: potențial = plafon cu steag «peste ofertă»; fără «se suprapun»/leave-one-out; test de stabilitate P75 < 20 %; pe set rata proprie; set 7–9 după echivalent, decizie < 8 → fără |
| BLA M-1 | medium | zile-rută cu locuri parțiale | **acceptat** | filtrul migr. 455:24 scris în «Unitățile» și la pasul 5 |
| BLA M-2 | medium | faptul de rulaj luat cu alt filtru; împrăștierea ×3 netratată | **acceptat** | refăcut pe viu cu filtrul 455: 78,3 %, 44–148 %, mediana 72 %; hover + «aprox.» la împrăștiere > ×2 (auditorul a obținut 75,5 % și min 25 % pe altă agregare; diferența e de agregare, concluzia aceeași) |
| BLA M-3 | medium | «cozi goale» nu se întâmplă; lunile redeschise nu se recalculează | **acceptat** | verificat triggerele 452:463-499 și reimportul 8 zile → `piata_luni_murdare`, ora = sfârșitul ferestrei ION-166, jurnal + semn după 2 nopți |
| MET N3 | medium | martorul 2025 din `tiki_daily_pair` e fals (12.2025 = 255/181) | **acceptat** | sursa testului = `tiki_leg_daily`/`tiki_ticket_attr` pe ziua cursei pentru ambii ani; fereastra din 7 august numită |
| BLA L-1 | low | perioade cu mai multe luni; luna încheiată dar necalculată | **acceptat** | «Perioada și filtrele»: Σ peste lunile cu rând; «—» niciodată 0 |
| BLA L-2 | low | întrebarea 1 contrazice regula bazinului (Beleavinți are stație) | **acceptat** | întrebarea 1 reformulată (Bălcăuți, Mărcăuți, Berlinți) |
| MET N4 | low | matricea contrazice «Unitățile»; nu e algoritm | **acceptat** | «Clasificarea perechii» = 4 reguli în ordine, omișii afișați la fel peste tot, Bălți–Edineț = «aceeași coadă, fără Chișinău» |
| MET N5 | low | salariul brut vs net; axa de afordabilitate degenerată | **acceptat** | net = brut × 0,79 + pensia, la hover; banda = preț × distanță |
| MET (b) | — | locurile noastre sunt 20, nu 18 | **acceptat** | «Unitățile»: 20 ale noastre (rulajul e deja pe loc); 18 = presupunere separată pentru străini |

Scor Claude după runda 2 (minimul revizorilor, pe v2): 2,0 / 4,0 · toate închise prin corecție în v3.

## Critic extern — runda 2 (Codex gpt-6-astra)

Scor 7,5 (JSON-ul spune 8,0; Σ greutăți = 2,5 → 7,5; raportat ca inconsistent de transport) · verdict fail · 1 high.

| id | severitate | esență | decizie | motiv / unde în plan (v4) |
|---|---|---|---|---|
| C1 | high (2,5) | «2 plecări/zi» aplicat pe fiecare sens dublează termenul concurenților, iar identitatea de control conține același factor și validează dublarea | **acceptat** | migr. 382:32-38: dep_tur / dep_retur = o plecare pe fiecare sens → formula pe sens cu 1 plecare, suma peste sensuri după identitate; testul sintetic cu rulaj 1,0 / 0,5: 810, nu 1.620; pasul 5, Verificare și rândul ANTA din «Verificat pe viu» corectate |

## Review: business-logic-auditor (runda 3)

Obiect: planul v4, de la început până la primul «## Review:» (rândurile 1–326). Am verificat în repo migrările 382:28-55, 452:36-47, 452:57-125, 455:1-30 și 461:1-96 (definiția vie a `tiki_refacere_pas`). Pe bază am rulat patru citiri mici, doar agregate pe tabele mici sau pe o lună:
- `anta_courses`: câte curse au `dep_retur` gol;
- `tiki_plecari_daily` 04–06.2026: rută-sensurile cu zile care au locuri;
- cursele ANTA prin r. Briceni / Edineț: din ce capăt pleacă;
- coridorul Lipcani în 09.2026: ce parte din bilete e pe perechi de trunchi.

### (a) Observațiile mele din runda 2

| id | stare | motiv |
|---|---|---|
| H-B referința nu e unică; fără referință nu există cotă | **închis** | Rândurile 118-129 stabilesc trei lucruri. Referința e un coridor (toate rutele cu același capăt). Rulajul și cota vin din aceleași rute. Cota se restrânge la perechi și se renormalizează la Σ = 1 pe cursă și sens, iar calea fără referință are cotă. Au rămas două goluri, dar sunt noi și țin de felul în care s-a făcut corecția: domeniul renormalizării față de perechile de trunchi (H-N1) și coridorul pentru capetele din afara rețelei noastre (M-N2). |
| H-A martie fără locuri | **închis** | Prima lună e 05.2026 (rândurile 68-73). Lunile ≤ 04 arată «—», iar jobul refuză o lună fără locuri. Verificat pe bază: în 05.2026, 53 din 56 rută-sensuri au zile în care toate plecările au locuri (1.598 plecări). Luna are deci referință, nu doar formal. |
| M-1 zile-rută parțiale | **închis** | Rândurile 54-57 conțin filtrul exact din 455:24 (`plecari_cu_locuri = plecari AND locuri > 0`), cu biletele numărate pe aceleași zile. 455:24 mai are și `km_picior > 0`, dar contează doar pentru om·km, nu pentru bilete. |
| M-2 faptul de rulaj și împrăștierea | **închis** | Faptul e refăcut (78,3 %, 44–148 %, mediana 72 %). Rulajul și plecările coridorului apar la hover, iar steagul «aprox.» apare pe cifra principală la o împrăștiere > ×2 (rândurile 130-131). Diferența față de cifra mea (75,5 %) vine din agregare, nu din filtru. Triajul o motivează și o accept. |
| M-3 luni murdare, ora | **închis în esență, rămâne parțial** | Există `piata_luni_murdare`, cea mai veche lună se ia prima, există jurnalul cu semn după 2 nopți, iar instantaneul e același (rândurile 256-262). Marcajul pus de `tiki_refacere_pas` acoperă însă doar ramura „lună”, nu și ramura Numărării, din care se refac omișii (M-N3). „Fereastra ION-166” nu e definită nicăieri în repo: `grep ION-166` găsește doar planul de față. Ora jobului atârnă deci de un tichet fără plan. Asta nu e deducere separată, dar trebuie scrisă o oră provizorie. |
| L-1 perioade cu mai multe luni | **închis** | Rândurile 175-179: Σ bilete ÷ Σ piață peste lunile cu rând, numărul lor la hover. Afișează «—» pentru lună necalculată, parțială, ≤ 04 sau cu filtru activ. |
| L-2 Beleavinți în întrebarea 1 | **închis** | Întrebarea 1 (rândurile 317-318) întreabă doar de sate fără stație și spune explicit că Beleavinți rămâne al lui. |

### (b) Defecte noi sau rămase în v4

**H-N1 — high, −2.0, defect de logică — Domeniul renormalizării cotei nu spune dacă perechile de trunchi intră. Identitatea de control trece în ambele variante.**
- Dovezi:
  - Planul: rândurile 80-84 (trunchiul nu are «din ofertă») și 122-125 (cota e restrânsă la perechile atinse și renormalizată la Σ = 1). Identitatea de la rândurile 139-141 e „Σ_perechi termen_concurenți = Σ_curse …”, fără să spună care perechi.
  - Pe bază, în 09.2026, coridorul Lipcani (rutele 10, 12, 13, 16, 18, 19, 22, 27; `tiki_ticket_attr` ⋈ `tiki_tickets.pair`) are 6.008 bilete. Dintre ele, **3.196 (53 %) sunt pe perechi cu un capăt de trunchi** (Orhei, Strășeni, Bălți, Sîngerei, Călărași, Soroca). Pe perechi cu Edineț sunt 964.
- Scenariul de eșec:
  - Jobul `piata-luna` scrie rânduri doar pentru perechile de tip 3–4. Executorul face renormalizarea, firesc, peste perechile pentru care calculează piața.
  - Cele 53 % de trunchi ies din numitor, iar cota fiecărei perechi de coadă crește de ~2,1×.
  - Exemplu: Chișinău–Edineț, cu 31 de curse străine, toate prin Orhei/Bălți. Termenul concurenților se dublează. Este exact familia de erori „~21.800 / lună” pe care runda 1 voia s-o scoată, doar mai mică.
  - Identitatea trece, pentru că și ea e însumată peste aceleași perechi calculate: Σ cote = 1 pe domeniul greșit. Testul sintetic 810 trece și el, fiindcă nu are nicio pereche de trunchi printre cele 3.
  - Nimic din plan nu prinde varianta greșită.
- Corecția în plan:
  - Domeniul cotei = TOATE perechile din OD-ul coridorului pe care cursa le atinge, inclusiv cele de trunchi și cele de tip 1. Partea de trunchi se calculează și apoi se aruncă (nu se afișează), nu se redistribuie.
  - Identitatea se însumează peste același domeniu complet.
  - Testul sintetic primește o pereche de trunchi printre cele 3 perechi. Rezultatul așteptat pe perechile afișate e 810 × (1 − cota trunchiului), nu 810.

**M-N2 — medium, −1.0, gol de acoperire — Pe calea „fără referință”, `tiki_coridor` pune Medveja și Pererita la „Altele”. Iar traficul capătului cursei se mută pe perechile noastre.**
- Dovezi:
  - 452:36-46: expresiile regulate din `tiki_coridor` nu conțin medveja, pererita, tiraspol etc., deci `ELSE 'Altele'`.
  - Planul, rândurile 126-129, cere „OD-ul coridorului `tiki_coridor` … restrâns la perechile cursei”, pentru exact aceste capete (Medveja, Pererita).
- Efectul:
  - Pentru Chișinău–Medveja, OD-ul folosit e cel al grupului „Altele”, nu al coridorului Briceni pe care cursa îl parcurge de fapt.
  - Chiar și cu coridorul corect, perechile cursei spre Medveja / Pererita nu există în OD-ul nostru. Renormalizarea mută toată capacitatea cursei pe perechile noastre (Chișinău–Briceni, Chișinău–Edineț), deci abaterea e sistematic în sus.
  - Steagul «aprox.» nu spune direcția abaterii.
- Corecția: coridorul căii fără referință = coridorul ultimei stații a noastre de pe cursă, spre capătul străin (`tiki_coridor` pe numele acelei stații, nu pe capătul cursei). La hover se scrie „capătul cursei e în afara rețelei: cifra e limită de sus”. Se adaugă un test unitar cu o cursă al cărei capăt e „Altele”.

**M-N3 — medium, −1.0, gol de acoperire — Marcajul „lună murdară” din `tiki_refacere_pas` ratează ramura Numărării, deci omișii rămân vechi.**
- Dovezi: 461:51-93. Funcția are două ramuri.
  - (1) Ramura „lună” (`tiki_attr_month`, `tiki_aggr_month`). Ea pune toate zilele lunii în `count_refresh_queue` (461:75-78) și se întoarce.
  - (2) Ramura Numărării: `count_aggr_days`, câte 60 de zile-rută pe apel (461:83-90). Ea golește și jurnalul salvărilor din GO (461:59-65).
  - Omișii (`tiki_ceilalti_od`, 458) se refac în ramura (2), în apeluri ulterioare.
- Scenariul:
  - (a) Luna 08 se reface. Marcajul se pune la sfârșitul ramurii (1). Jobul de noapte calculează piața înainte ca ramura (2) să fi terminat cele ~1.300 de zile-rută ale lunii, deci «~omiși» vin pe jumătate vechi.
  - (b) Operatorul corectează în GO o sesiune din 09 pe 05.10. Corecția ajunge prin jurnal → `count_refresh_queue` → ramura (2), care nu marchează nimic. «~omiși» pe 09 rămân vechi definitiv.
- Corecția: marcajul se pune și în ramura (2), pe `date_trunc('month', r.zi)`. Jobul `piata-luna` sare luna cât timp `count_refresh_queue` are zile ale ei. Saltul ajunge în jurnal, ca la M-3.
- Detaliu de execuție: `CREATE OR REPLACE` pe `tiki_refacere_pas` se scrie pornind de la **461:51-93**, nu de la 452:503 sau 456:6. Copia din 456 nu golește `tiki_refresh_log`, pe care triggerele din 461 îl umplu, așa că salvările din GO n-ar mai ajunge în cozi. Calea și linia se scriu în «Fișiere».

**M-N4 — medium, −1.0, gol de acoperire — `dep_tur` nu e sensul nostru «tur». Maparea pe `leg` nu e scrisă, iar testul nu o acoperă.**
- Dovezi:
  - 382:36-38: `dep_tur` = plecarea de la primul punct al cursei.
  - Pe bază, din cele 24 de curse ANTA prin r. Briceni sau Edineț, **12 pleacă din Chișinău și 12 din nord**.
  - Planul, rândul 114 („dep_tur e un sens, dep_retur celălalt”), și pasul 5 nu spun cum se trece la `chisinau_nord` / `nord_chisinau` (452:66).
- Efectul: luat ad litteram (dep_tur = tur = Chișinău→nord), la jumătate din curse rulajul se aplică pe sensul invers. Rulajele pe sens diferă (raportul între sensuri e 1,04–1,43 pe 2025, rândul 232), iar cotele OD diferă și ele pe sens. Identitatea și testul 810 trec oricum, pentru că sunt simetrice la permutarea sensurilor.
- Corecția: sensul cursei se stabilește din ordinea opririlor. Dacă Chișinău are `seq` mai mic decât capătul nordic, `dep_tur` → `chisinau_nord`, altfel → `nord_chisinau`. Se adaugă un test unitar cu o cursă care pleacă din nord, cu rulaj 1,0 / 0,5 și cote diferite pe sens: rezultatul se schimbă dacă sensurile se inversează.

**L-N5 — low, −0.5, descriere incompletă — „1 plecare pe fiecare sens” nu e adevărat pentru toate cursele.**
- Dovezi: pe bază, 12 din 2.585 de curse `source='anta'` au `dep_retur` gol. Planul, rândurile 114 și 249, spune „1/zi pe fiecare sens”, fără excepție.
- Corecția: plecări pe sens = 1 dacă ora sensului există, altfel 0. Cursele cu un singur sens se numără la hover.

### Ce NU e deducere

- Identitatea fără factorul 2 și testul 810 sunt corecte pentru defectul pe care îl țintesc (dublarea pe sens). Identitatea e algebric implicată de Σ cote = 1, deci verifică codul, nu formula. Verificarea independentă e testul sintetic, iar planul îl are.
- 05.2026 ca primă lună e corect (53/56 rută-sensuri cu locuri în mai). Lunile ≤ 04 cu «—» sunt corecte.
- Filtrul 455 e transcris corect. Folosirea biletelor în loc de om·km pentru rulaj e consistentă cu cota OD (aceeași unitate).
- Calculul pe sens și apoi adunarea sensurilor (rândurile 113-116) e corect, cu condiția M-N4.

### Deduceri

H-N1 −2,0 · M-N2 −1,0 · M-N3 −1,0 · M-N4 −1,0 · L-N5 −0,5 = −5,5

Scor: 4.5 · Blocante (critical/high): 1

## Review: revizor de metodă (runda 3)

Plan: `docs/plans/2026-10-01-piata-potentiala-bilete.md`, v4 (de la început până la primul «## Review:»). Întrebarea de fond, a treia oară: cifra «Piața N / lună, noi X %» pe pereche e definită consistent, se poate calcula din sursele numite și poate fi falsă?

Verdict scurt: v4 închide toate cele cinci observații din runda 2 în substanță și nu mai are blocante. Noile definiții (identitatea pe sens cu o plecare, potențialul ca plafon, cele 4 reguli, testul de preț pe ziua cursei, afordabilitatea la hover) sunt consistente între ele. Au rămas trei lucruri, niciunul blocant: (1) testul de stabilitate P75 — pe care l-am propus eu în runda 2 — pică pe setul de azi sub ambele metode de percentilă, deci «potențialul» nu va apărea la prima livrare, iar planul îi spune lui Ion că banda 255–320 e calibrabilă; (2) sursa testului de preț e greșit numită: `tiki_ticket_attr.label` e eticheta rutei, nu perechea; perechea pe ziua cursei există în `tiki_tickets.pair` ⋈ `tiki_trips.trip_date` și am verificat că 2025 e complet acolo; (3) mărunțișuri de text (exemplul din «Ce facem» contrazice regula 4; «coridoare vecine» nedefinit; pensia fără sursă).

### (a) Observațiile mele din runda 2

| # | runda 2 | stare | motiv |
|---|---|---|---|
| N1 | controlul «Σ ≤ capacitate» nu deosebește formula bună de dublare; «ruta de referință» ambiguă; «≥ 20 plecări» fără locuri; 18 vs 20 locuri | **închis** | «Stratul 2»: identitate ±1 % pe coridor ȘI sens, Σ cote = 1 ± 0,001 pe cursă și sens, coridor = toate rutele cu același capăt (8 Lipcani / 4 Criva / 2 Otaci), «≥ 20 plecări CU locuri», rulaj median al vecinilor + «aprox.» fără referință, 20 ale noastre (migr. 452:6-7) / 18 presupuse pentru străini. Codex C1 a scos factorul 2 și de pe sens: `anta_courses.dep_tur`/`dep_retur` (migr. 382:32-38) = o plecare pe fiecare sens; verificat: 2.573 din 2.585 curse ANTA au ambele ore, cele 12 fără `dep_retur` sunt Bender/Tiraspol/Ceadîr-Lunga/Camenca + «Briceni (Sat) – Verejeni» (omonimul din Dondușeni, pe care raionul îl exclude) — niciuna pe coridoarele noastre. Testul sintetic 810 ≠ 1.620 prinde exact dublarea. |
| N2 | «din populație» ca a doua estimare; suprapunerea pică prin construcție; set 7–9 | **închis** | «Stratul 2b»: potențial = plafon «≤ bazin × P75», steag «peste ofertă», fără «se suprapun»/leave-one-out, rata proprie pe setul de calibrare, decizia «< 8 → fără». Rămâne consecința nespusă a propriului test de stabilitate — R3-1, mai jos. |
| N3 | martorul 2025 din `tiki_daily_pair` e fals (12.2025 = 255/181) | **închis în substanță, sursa greșit numită** | Baza = ziua cursei, pentru ambii ani, cu fereastra din 7 august numită. Dar `tiki_ticket_attr` n-are perechea (`label` = «Criva - Chisinau/Larga 06:00», eticheta rutei; coloanele: ticket_key, zi, luna, zi_sursa, trip_id, vkey, label, label_dir, leg, crm_route_id, sursa, bilete, lei, km_from, km_to, is_anulare), iar `tiki_leg_daily` e pe rută și sens. Perechea pe ziua cursei e în `tiki_tickets` (pair, direction, trip_id, ticket_key) ⋈ `tiki_trips.trip_date` — R3-2. |
| N4 | matricea contrazice «Unitățile»; nu e algoritm | **închis** | «Clasificarea perechii»: 4 reguli în ordine (fără Chișinău → trunchi nominal → ≤ 2 curse cu raion → altfel), omișii afișați la fel în toate patru, Bălți–Edineț = «aceeași coadă». Rămâne un exemplu neactualizat — R3-3. |
| N5 | salariul brut vs net; axa de afordabilitate degenerată | **închis** | «Stratul 3»: banda = preț × distanță; afordabilitatea la hover pe net (× ≈ 0,79) și pe pensie; Briceni 548 lei = 6,4 % din net. Remarcă fără deducere: cu scutirea personală (≈ 2.475 lei/lună în 2025) netul la 10.773 brut iese ≈ 0,83, nu 0,79 — factorul să stea în `piata_parametri` cu versiune, ca și P75, nu în cod. |

### Ce am verificat pe viu (runda 3)

- **Filtrul rulajului** `d.plecari_cu_locuri = d.plecari AND d.locuri > 0` — migr. 455:24, exact cum îl citează planul. `trip_id` = deschidere de terminal — migr. 452:4-6; locurile 20 — 452:10-11 (`passenger_seats = 20`); `tiki_coridor` — 452:36-47; repartizarea proporțională a coborârilor la omiși — 458:88-116 (`v_x := v_on[o] * least(-v_d, v_tot) / v_tot`). Toate citatele planului se țin.
- **O plecare pe sens**: `anta_courses` 382:28-38 (`dep_tur text, dep_retur text`, comentariu «ora plecării de la primul punct / de la ultimul punct înapoi»); 2.585 curse ANTA, 0 fără `dep_tur`, 12 fără `dep_retur`, niciuna pe nord (lista mai sus).
- **Codul paginii**: `tabs/bilete/periods.ts:151-154` (`ultimele_8s` −55 zile, `ultimele_90`, `anul_curent`) ✓; `tabs/BileteAparatTab.tsx:50-59, 103-114` (calea e `tabs/`, nu `tabs/bilete/`; presetul `ultimele_8s`, filtrele rută/șofer) ✓; `PairsView.tsx:37-41` (`withCount = … && !filters.route && !filters.driver`) ✓; `packages/db/src/offer-calc.ts:21` (`BALTI_CHISINAU_FIXED = { lei: 150, from: '2026-10-02' }`) ✓; `apps/admin/src/lib/price-popular.ts:101` (`BALTI_KM = 133`) ✓; `lib/anta/district.ts:29` (`class LocalityIndex`) ✓.
- **Ziua cursei pe 2025 există și pe pereche**: `tiki_ticket_attr` acoperă 12.2024–09.2026, 555.749 rânduri, `zi_sursa='cursa'` pentru 308.690 din 309.179 bilete din 2025 (99,8 %). Pe perechea «Chisinau - Balti» din `tiki_tickets` ⋈ `tiki_trips` (100 % cu `trip_id`), pe luna cursei 2025: aug 4.696 retur / 3.128 tur, sep 4.252 / 2.838, oct 4.708 / 4.412, nov 4.955 / 4.350, **dec 5.301 / 4.283** (față de 255 / 181 în `tiki_daily_pair`). Raportul retur/tur pe perechea însăși: 1,50 / 1,50 / 1,07 / 1,14 / 1,24 — mișcarea de sezon e pe pereche, nu doar pe tot nordul, și e de 3–4× efectul așteptat.
- **Setul de calibrare**: `tiki_daily_pair` 09.2026 dă exact biletele planului (Corjeuți 243 la 279 lei, Beleavinți 217, Halahora 193, Criva 140, Hlina 128, Caracușenii Vechi 79, Drepcăuți 74, Corpaci 65, Trinca 52; toate 256–321 lei → o singură bandă).
- **Testul de stabilitate P75 pe setul de azi** (8 perechi cu populație BNS în plan; Beleavinți n-are rând BNS potrivit): ratele pe populație brută 0,030 / 0,031 / 0,054 / 0,056 / 0,078 / 0,152 / 0,198 / 0,274. `percentile_cont(0.75)` = 0,164; fără Halahora 0,115 (**−30 %**), fără Hlina 0,115 (**−30 %**), fără Criva 0,138 (−16 %), fără oricare alta +7 %. `percentile_disc(0.75)` = 0,152; **6 scoateri din 8 dau +30 %**. Factorul de echivalență (× 0,71) scalează toate ratele la fel și nu schimbă nimic; satele aduse de R = 7 km pot schimba, dar nu există azi. Scriptul: `scratchpad/p75.py`.

### (b) Consistența noilor definiții

- **Identitatea pe sens** (Stratul 2, pasul 5, Verificare): consistentă. Observație fără deducere: cu cota renormalizată la Σ = 1 pe cursă și sens, identitatea e adevărată prin construcție — e un test de implementare (renormalizarea s-a făcut, nimic nu s-a numărat de două ori), nu de metodă. Testul de metodă e cursa sintetică (810 ≠ 1.620) și rămâne; i-aș adăuga două cazuri: o cursă care atinge o singură pereche (cota = 1, termenul = tot) și două curse pe aceeași pereche (se adună, nu se iau max).
- **Potențialul ca plafon** (2b): consistent cu «Unitățile» (bilete observate, bazin echivalent calculat înainte) și cu regula 3 (afișat doar unde banda e calibrată). Mică nealiniere de cuvint: «rata satelor FĂRĂ concurenți» vs setul definit «≤ 2 curse» — de scris «cu cel mult 2 curse străine».
- **Testul de stabilitate P75**: definit, dar vezi R3-1 — pe datele de azi pică, și planul nu o spune.
- **Cele 4 reguli**: ordonate, exclusive, cu exemple din «Verificat pe viu»; «Soroca-intersecție» în lista de trunchi e nominală (nu trece prin legarea stațiilor), deci nu intră în conflict cu «(intersecție) nelegat». Exemplul din «Ce facem» nu le respectă — R3-3.
- **Testul de preț pe ziua cursei**: pre-înregistrat corect (metrica = raport, 8 + 8 săptămâni, MDE înainte, perechi vecine, controlul nu e independent). Sursa — R3-2.
- **Afordabilitatea la hover**: consistentă cu N5; raionul = al capătului mic; pensia — fără sursă în «Verificat pe viu» (R3-3).
- **Biletele cotei vs coloana «Bilete»**: cota are propriul numărător (aceeași lună, același instantaneu); coloana «Bilete» de azi rămâne pe ziua vânzării «sau se notează» — e o decizie lăsată deschisă explicit, nu o contradicție; la implementare să fie una din ele, nu amândouă pe același rând fără notă.

### Deducerile

**R3-1. [medium, −1.0, gol de acoperire] Testul de stabilitate P75 (2b, pasul 7) pică pe setul de calibrare de azi sub ambele metode de percentilă; planul spune «banda 255–320 lei are 9 ≥ 8 perechi → potențialul e posibil acolo» și pune lipsa potențialului doar pe seama numărului (Riscuri: «set 7–9, prag 8»); metoda de percentilă nu e specificată.**
Dovadă: cifrele planului (rândul «Setul de calibrare» din «Verificat pe viu») + `tiki_daily_pair` 09.2026 (confirmate mai sus) + calculul din `scratchpad/p75.py`: `percentile_cont` −30 % fără Halahora sau Hlina; `percentile_disc` +30 % la 6 din 8 scoateri. Mecanismul: la n = 8, P75 e între a 6-a și a 7-a valoare ordonată, iar ratele sunt împrăștiate ×9 (0,03…0,27) — vecinii în ordine diferă cu > 20 % aproape peste tot, deci scoaterea oricărei perechi mută percentila pe alt rang. Nu e un accident al lunii: e proprietatea estimatorului la n ≤ 9 cu împrăștierea asta. Criteriul e al meu din runda 2 și a fost preluat textual; aici e prea strâns.
Scenariu: pasul 7 rulează, banda iese «instabilă», potențialul nu apare nicăieri; Ion, căruia i s-a spus de la început că banda 255–320 e calibrabilă, întreabă unde e; răspunsul «testul l-a oprit» vine după livrare, nu înainte. Nu e blocant: coloana trăiește din «din ofertă», nimic nu se strică, dar așteptarea e setată greșit în plan.
Corecție în plan: (a) scrie rezultatul pre-înregistrat pe datele de azi: «pe 09.2026 testul de stabilitate pică (−30 %); la prima livrare potențialul NU apare; reapare când setul are ≥ N perechi sau împrăștierea scade» — și spune-i lui Ion asta în «Întrebări»/«Riscuri», nu «e posibil acolo»; (b) fixează metoda (`percentile_cont`) și scrie-o în `piata_parametri` lângă P75; (c) dacă vrei un criteriu care să poată trece la n = 8–12, înlocuiește «< 20 % la scoaterea oricărei perechi» cu unul dimensionat la n (de ex. intervalul bootstrap 80 % al P75 cu lățime relativă < 50 %, sau n ≥ 12 obligatoriu) — dar decizia e a planului; (d) rândul din «Verificat pe viu» să poarte și valoarea P75 cu și fără fiecare pereche, ca pragul să nu fie ales după ce se văd cifrele.

**R3-2. [low, −0.5, descriere incompletă] Sursa testului de preț e numită greșit: «`tiki_ticket_attr`/`tiki_leg_daily` pe ziua cursei, pe perechea Chișinău–Bălți» — niciuna din cele două nu poartă perechea de stații.**
Dovadă: `tiki_ticket_attr.label` = eticheta rutei («Criva - Chisinau/Larga 06:00»), coloanele tabelei mai sus; `tiki_leg_daily` (zi, crm_route_id, leg, …) e pe rută și sens; perechea e în `tiki_tickets.pair` cu `trip_id` → `tiki_trips.trip_date`, 100 % acoperit pe 2025 pe «Chisinau - Balti» (interogarea de mai sus). Nu e blocant pentru că datele există și sunt stabile (dec 2025 = 5.301 / 4.283); e doar tabela greșită în text. Rutele prin Bălți duc și pasagerii de Briceni/Edineț, deci pe `tiki_leg_daily` efectul pe Bălți s-ar dilua de ~2–3× și MDE n-ar mai fi atins.
Corecție în plan: în «Stratul 3» și pasul 9: «sursa = `tiki_tickets` (pair, direction, price) ⋈ `tiki_trips.trip_date`, pe săptămâna cursei, pentru 2025 și 2026»; înlocuiește seria de sezon 1,39/1,43/1,11/1,04/1,06 (tot nordul, `tiki_leg_daily`) cu cea pe pereche: 1,50 / 1,50 / 1,07 / 1,14 / 1,24 (aug–dec 2025). De verificat la implementare, nu acum: `tiki_tickets.price` pe perechea asta dă ≈ 66 lei/bilet pe retur în 2025, nu ≈ 133 — ori coloana nu e prețul plătit, ori perechea include tronsoane; «prețul plătit mediu pe sens» din raport să se ia din aceeași sursă ca în `tiki_daily_pair.lei`, după ce se lămurește.

**R3-3. [low, −0.5, descriere incompletă] Trei nealinieri de text.**
Dovadă: doar planul. (i) Exemplul din «Ce facem» afișează «potențial ≤ 4.100» pe o pereche cu «bazin 11.300 loc.» și piața 3.000–3.400 — adică un oraș (Edineț 11.290), tip 4, unde regula 4 spune «potențialul NU se afișează»; exemplul trebuie să fie ori un sat de tip 3 (bazin ~900, potențial ≤ ~150), ori fără rândul «potențial». (ii) «rulajul = mediana coridoarelor vecine pe același sens» — «vecine» nu e definit (același raion? aceeași bandă de distanță? toate coridoarele nordului?); de scris o regulă, altfel «fără referință» e la latitudinea celui care implementează. (iii) «~15 % dintr-o pensie» și pasul 4 «pensia» n-au rând în «Verificat pe viu» (implicit ≈ 3.650 lei); de numit sursa (CNAS, pensia medie pe raion sau pe țară, anul) ca la salarii.
Corecție în plan: exemplul refăcut pe un sat de tip 3; regula «vecine» = coridoarele cu același capăt în aceeași bandă preț × distanță, altfel toate coridoarele nordului; rândul «pensia» în «Verificat pe viu».

### Ce NU e deducere
- Identitatea pe sens cu o plecare, suma peste sensuri după identitate, coridorul de referință, cota restrânsă + renormalizată, cazul «fără referință» cu steag, prima lună 05.2026 și refuzul lunii fără locuri, jobul de noapte separat cu `piata_luni_murdare`, perioadele cu «—» niciodată 0 — corecte și verificate.
- Cele 12 curse ANTA fără `dep_retur` — niciuna pe nord; formula poate spune «o plecare pe fiecare sens care are oră», fără altă schimbare.
- Factorul 0,79 vs 0,83 pentru net — parametru cu versiune, nu defect.
- Tautologia identității — e test de implementare bun; nu-l scoate, doar nu-l numi test de metodă.

Scor: 8.0 · Blocante (critical/high): 0

## Triaj runda 3 (sesiunea principală)

| id | severitate | esență | decizie | motiv / unde în plan (v5) |
|---|---|---|---|---|
| BLA H-N1 | high | domeniul renormalizării cotei nu spune dacă intră perechile de trunchi; identitatea trece în ambele variante | **acceptat** | verificat: coridorul Lipcani 53 % bilete pe trunchi → domeniul = toate perechile atinse, trunchiul se calculează și se aruncă; identitatea pe domeniul complet; test sintetic cu pereche de trunchi |
| BLA M-N2 | medium | `tiki_coridor` pune Medveja/Pererita la «Altele»; capacitatea se mută pe perechile noastre | **acceptat** | coridorul ultimei stații a noastre de pe cursă; nota «limită de sus»; test cu capăt «Altele» |
| BLA M-N3 | medium | marcajul lunii murdare ratează ramura Numărării; baza e 461, nu 456 | **acceptat** | migr. 461:51-93: marcaj în ambele ramuri, jobul sare luna cu zile în coadă, `CREATE OR REPLACE` din 461 |
| BLA M-N4 | medium | dep_tur ≠ sensul nostru tur (12/24 curse pleacă din nord) | **acceptat** | sensul din ordinea opririlor (`seq`); test cu cursă din nord |
| BLA L-N5 | low | 12 curse fără `dep_retur` | **acceptat** | plecări pe sens = 1 doar dacă sensul are oră |
| BLA (M-3 rest) | — | «fereastra ION-166» nu există în repo | **acceptat** | ora provizorie 03:30, de legat când ION-166 are plan |
| MET R3-1 | medium | testul de stabilitate P75 pică pe setul de azi; planul promitea banda calibrabilă | **acceptat** | rezultatul pre-înregistrat în 2b (−30 %); `percentile_cont` în parametri; criteriu n ≥ 12 + bootstrap; Riscuri și întrebarea 6 pentru Ion |
| MET R3-2 | low | sursa testului de preț n-are perechea | **acceptat** | `tiki_tickets` ⋈ `tiki_trips.trip_date`; seria pe pereche 1,50/1,50/1,07/1,14/1,24; `price` ≈ 66 de lămurit |
| MET R3-3 | low | exemplul contrazice regula 4; «vecine» nedefinit; pensia fără sursă | **acceptat** | exemplul pe Chișinău–Criva (tip 3) + Edineț fără potențial; «vecine» = același capăt în aceeași bandă, altfel tot nordul; rândul «pensia — neverificat» |
| MET (b) | — | identitatea e tautologică (test de implementare), «fără concurenți» → «≤ 2 curse», factorul net în parametri, cazuri de test în plus | **acceptat** | toate în 2 / 2b / Verificare |

Scor Claude după runda 3 (minimul revizorilor, pe v4): 4,5 / 8,0 · toate închise prin corecție în v5.

## Critic extern — runda 3 (Codex gpt-6-astra)

Scor 7,9 (JSON-ul spune 8,0; Σ greutăți = 2,1; raportat de transport) · **verdict pass** · 0 critical/high.

| id | severitate | esență | decizie | motiv / unde în plan (v6) |
|---|---|---|---|---|
| C1 | medium (1,5) | `piata_concurenti_ref` fără ciclu de actualizare după reimportul ANTA (importatorul șterge și reinserează cu ID-uri noi) | **acceptat** | `anta-import.mts:184-195` → referințe pe cheie naturală, reconstruite după import, versiunea importului pe fiecare rând al lunii (instantaneu), test «reimport = aceleași cifre» (Stratul 2) |
| C2 | low (0,3) | pasul 7 păstra criteriul vechi (≥ 8, < 20 %) și rândul «9 ≥ 8 → posibilă» | **acceptat** | pasul 7 trimite la criteriul unic din 2b (n ≥ 12 + bootstrap); rândul din «Verificat pe viu» corectat |
| C3 | low (0,3) | calea `biletAparatActions.ts` e `tabs/`, nu `tabs/bilete/` | **acceptat** | verificat `PairsView.tsx:4`; «Fișiere» corectat |

## Rezultatul celor trei runde

| Partea | Runda 1 (v0) | Runda 2 (v2) | Runda 3 (v4) | critical/high deschise |
|---|---|---|---|---|
| Claude — auditor de logică | −5,5 (4 high) | 2,0 (2 high) | 4,5 (1 high) | 0 (toate închise în v5) |
| Claude — revizor de metodă | 0,5 (3 high) | 4,0 (2 high) | 8,0 (0 high) | 0 |
| Codex — critic extern | 4,0 (2 high) | 7,5 (1 high) | **7,9 · pass** (0 high) | 0 |

Gate trecut în runda 3. Nicio observație respinsă în cele trei runde: 15 + 4 + 12 + 1 + 10 + 3 = 45 de
observații, toate acceptate cu fapt și corectate în text. Planul rămâne un plan de METODĂ; implementarea
așteaptă răspunsurile lui Ion la cele 6 întrebări și devine tichet Linear.
