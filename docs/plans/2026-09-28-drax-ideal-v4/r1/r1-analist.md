# ideal-v4, runda 1 — uzina-analist («cercetează»), subiectele (c), (d) și precedentul pentru (a)

Autor: uzina-analist, 27.09.2026. Nu scrie în bază, nu schimbă cod/date pe VPS. Toate scripturile din fișier, în
`scratchpad/p110/` (copiate în `/tmp` pe VPS și rulate cu `node /tmp/x.mjs`): `an-seg.mjs` (bucățile zilei),
`an-r1a.mjs` (R1a brut vs drumul pe șosea casă ↔ capăt, Valhalla :8002 costing bus), `an-opriri.mjs` (opririle ≥ 90 s cu
numele locului din `places.geojsonseq`), `an-flota.mjs` (control pe TOATĂ flota), `an-r13.mjs` (mișcările brute).
Ieșirile: `seg-out.txt`, `r1a-out.txt`, `opr-out.txt`, `flota-out.txt` în același dosar.

Sursele de reguli (Supabase `lde_uzine.reguli_livrare`, citite 27.09):

| uzina | reguli_livrare_la | lungime | md5 |
|---|---|---|---|
| DRAXELMAIER_BALTI | 2026-09-27 05:51:44 UTC | 24.334 | 810297f3… (= documentul rundei) |
| LEAR_UNGHENI | 2026-09-25 08:51:04 UTC | 10.424 | 1d4d373b… |
| LEAR_FLORESTI | 2026-09-25 08:51:04 UTC | 7.924 | beee9cda… |
| SEBN_ORHEI (= SEBN_STRASENI) | 2026-09-26 14:35:58 UTC | 11.070 | b6ee5856… |
| TROX_BRICENI | 2026-09-25 20:42:12 UTC | 4.658 | 3fbeb241… |

Săptămâna măsurată: 14–18.09.2026 (L–V), `/root/lde-worker/drax/date/saptamanal/2026-09-14/` (`economie-zile.json`
rulat 27.09 13:59 UTC, `economie.json`, `economie-urme/<mașină>/<zi>.json`, `economie-curse.json`).

---

## 1. Cifrele pe mașină — ce e R1a de fapt

«Drum real» = cât din R1a brut încape în drumul pe șosea casă ↔ capătul cursei vecine × 1,05 (aceeași toleranță ca §5.2 și
§8.3). «Rest» = R1a brut − drumul real. Brut = R1a net + golul impus 5.3 (a) deja scăzut de worker.

| mașină | linii / schimb (GPS) | casa: km poartă / parc | zile măsurate | R1a net măsurat | drum real | rest | ce e restul |
|---|---|---|---|---|---|---|---|
| 435ASB | R34 Taura Veche s2 | 1,7 / 1,6 | 4/5 | **292,5** | 288,4 | **4,1 (1,4 %)** | opriri de 3–7 min la 0,7–1,3 km de poartă, 10:56–12:23 (în afara ferestrelor) |
| 186OMM | R4 Grinăuți s1 + R3 Nihoreni s2 | 1,7 / 2,4 | 5/5 | **281,7** | 270,2 | **11,5 (4,1 %)** | abateri de 1–3 km |
| 144BRAZ | R38 Glinjeni s2 | 1,5 / 2,2 | 2/5 (nemăsurată, < 3) | **128,7** | 119,1 | **9,6** | 14.09 10:43, 74 min la 0,8 km de poartă |
| 744ARF | R19 Bilicenii Vechi s2 **+ R13 Hăsnășenii Noi s1 nedetectată** | 2,4 / 3,2 | 3/5 | **179,4** | 39,7 net (143,5 brut − 103,8 gol impus) | **139,7 (78 % din R1a)** | turul s1 R13 și drumurile lui (mai jos) |
| 804MUM | R18 Putinești s1 + R22 Țiplești s2/retur s1 **+ retur s2 nedetectat** | 2,7 / 2,8 | 0/5 (nemăsurată) | 0 (toate zilele: 500,6 net, 650,4 brut) | 224,5 | **425,9** | returul s2 de la poartă spre Țiplești, în fiecare noapte (mai jos) |

Σ pe cele 4 mașini cu zile măsurate: R1a net **882,3 km** (documentul rundei scrie «≈ 1.270 măsurat»: 1.268 e
EXTRAPOLAREA pe 5 zile — 435ASB 365,6 + 144BRAZ 321,8 + 744ARF 299,0 + 186OMM 281,7; măsurat e 882,3).
Din brut 986,1: drum real casă ↔ capăt 821,2, rest 164,9 — din care 139,7 la 744ARF.

### 744ARF — «rulajul prin oraș» este turul s1 pe R13 Hăsnășenii Noi
`opr-out.txt` + `an-r13.mjs`, L–V 14–18.09:
- mișcarea brută de dimineață pleacă de acasă (Dacia) la 05:04–05:15 și se termină la poartă la **06:04–06:07 în 5 din 5 zile**,
  23,3–23,6 km de fiecare dată — sosire în fereastra **tur s1 03:30–07:00** (§3.2). Opririle ≥ 90 s pe drum: Dobrogea Veche
  05:34–05:36 (15, 16.09) și **Hăsnășenii Noi 05:41–05:47** (15, 17.09); la poartă VEST 06:17–06:21 (15, 17.09), parcul 06:29 (16.09).
  Pe 14 și 18.09 zilele sunt excluse (jumătate nedetectată), dar mișcarea e aceeași.
- 15:48–15:52 la poarta EST (fereastra **retur s1 15:00–17:45**) → acasă 16:35. Bucata stă în «gol între ture» al perechii R19
  și iese «nelămurit 14,2 km/zi, fără oprire ≥ 20 min» (`economie.json` `nelamuritLista`, 15–17.09).
- Linia `R13|Hasnasenii Noi` are `E: {s1: null, s2: null}` în `economie-zile.json` — e una din cele 3 linii fără etalon
  (§1.4: «n-au nicio cursă care să pornească din startul lor în GPS»). Fără etalon cursa nu se taie, deci cade în livrare.
  Pe 18.09 workerul a prins-o o dată («R13|Hasnasenii Noi retur s1», bucata legătură 14:36–15:54).

### 804MUM — seara «67 km livrare» conține returul s2
- Noaptea, 14–18.09, 5 din 5: pleacă de acasă (Pământeni) ~23:25 → poarta VEST 23:35–00:06 → poarta EST 00:17–00:20
  (fereastra **retur s2 23:00–01:45**) → Țiplești / Țipletești 00:53–00:58 → Elizaveta → acasă 01:37. Mișcarea brută
  00:2x–04:5x are 45,5–45,8 km în fiecare noapte. Workerul pune tot la «livrare de seară» (16:28 → 03:00, 67 km net + 21,4
  gol impus).
- 16.09 dimineața «97,6 km» = turul s1 (06:18 poarta EST) + parc 12:45–13:29 + turul s2 (14:58 poarta VEST) — două tururi
  nedetectate, nu rulaj.
- Linia `R18|Putinesti` are tot `E: null` (§1.4).

### Controlul pe TOATĂ flota (`an-flota.mjs`, `flota-out.txt`)
Bucăți R1a (livrare fără ocol) L–V: **354, 6.221 km**. Cu o oprire ≥ 1 min în raza unei porți într-o fereastră de tur/retur
(§3.2) — adică o cursă cu oameni probabil nedetectată înăuntrul «livrării»: **19 bucăți, 1.150 km (18,5 %)**, pe 7 mașini:
804MUM 432,4 (toate zile excluse), **024XKY 351,2 (zile măsurate**, 06:46–06:52 la poarta EST, tur s1; e deja la «de lămurit»
§11.8), 744ARF 236,6 (**78,0 pe zile măsurate**), 144BRAZ 108,7 (excluse), 414ASB 21,3, 727CWN 0, 830MUM 0.
Pe zilele măsurate: **429 km** R1a care conțin o atingere a porții în fereastră.

---

## 2. Precedentele de la celelalte uzine (citate textual, cu sursa)

**Mașina care doarme lângă uzină.**
- LEAR Ungheni, cod: `lde-geo-worker/lear-analiza.mjs:930-939` (`oreNoapteaLaPoarta`, ≤ 1,5 km, 17:00–05:00) și `:1003`, `:1150`:
  «doarme lângă poartă (≥ 8 h pe săptămână noaptea, la sub 1,5 km) — casa ei e uzina, regula 1 e deja aplicată». Se aplică
  doar ca rezervă, când urma nu dă altă casă; raza e 1,5 km, nu 3.
- LEAR Ungheni, cod: `/root/lde-worker/ungheni/cod/dorm.mjs:8-13`: «Dacă doarme la uzină: pleacă GOALĂ de la uzină la capăt…
  gol = 2 × distanța(uzină, capăt), pe fiecare schimb. Deci nu e o economie automată».
- LEAR Ungheni §5.2: «GOL PE RUTĂ: întoarcerea goală sat ↔ poartă. E a uzinei. Nu se optimizează.» §5.3: «GOL EVITABIL: casă →
  capăt … Se optimizează.» §7.1: «Poarta și parcul de la Bălți excluse» (din casă).
- SEBN §8.1: «Regulile LEAR "doarme la uzină" … NU se aplică: … dormitul la uzină ar adăuga un drum gol.» §5.3: «LIVRARE … de
  acasă până la satul de start și înapoi … ASTA e economia la SEBN — se taie cu un șofer din satul de start sau cu mașina care
  așteaptă între ture la capăt.» §7.1: «dacă șoferul locuiește la capăt, livrarea e ~0.» Fără excepție pentru casa aproape de
  poartă.
- Briceni/Trox §5.3 + §8: LIVRARE = de la locul nopții la prima cursă și înapoi; «R1. Livrarea … Singura economie numărată».
  Cod: `briceni/cod/livrare.mjs:14,120-127` — nicio excepție pentru casa lângă poartă (poarta Trox e în Briceni, șoferii
  din Briceni fac livrare ca oricare).
- Drăxlmaier însuși: §7.4 «Noaptea la Parcul Bălți … = doarme lângă uzină: drumul parc ↔ capăt e golul impus (5.3 a), nu
  livrare»; cod `drax/cod/economie/categorii.mjs:295`.

**Livrarea în mesajul pentru dispecer.**
- SEBN §12.6 (identic în textele LEAR): «primele 3 mașini cu livrare peste 40 km pe zi și întrebarea "șofer din satul de start,
  sau mașina așteaptă la capătul rutei între ture?"» — la SEBN livrarea (echivalentul R1a) INTRĂ în indicații.
- Drăxlmaier §12.1: «R1a, marginile zilei, e cost de azi (se taie doar cu alt șofer din satul de start) și nu intră în indicații».
- Ion, 27.09 (commit fcc9527b, ION-108): «No need to calculate small car costs, leave it to me. Km only is ok»; «dacă livrarea e
  masivă se merită seara să oferim la șofer mașina mică».

**Capătul (subiectul a).**
- LEAR Ungheni §4.2: «Capătul = PRIMUL sat al rutei din nomenclator (nu cel mai depărtat de poartă)»; §4.5 capete fixate de mână
  pe mașină unde regula nu-l prinde (6 cazuri).
- LEAR Florești §4.1 primul sat din denumire; §4.2 «Capăt fixat pe GPS: A2 → Cuhureștii de Sus … Cunicea are pasager ocazional
  (9 opriri în 100 de zile), nu e capăt» — GPS-ul a SCURTAT ruta.
- SEBN §4.2: «între satul din nume și cel dedus din opriri câștigă cel MAI DEPĂRTAT de poartă — startul real poate doar să
  lungească ruta».
- Briceni §4.1: «Capătul = satul cel mai depărtat în care mașina a oprit sau s-a întors; o simplă trecere nu face capăt.»
- Deci: peste tot actul e implicit, GPS-ul îl bate pe opriri. Nicăieri o simplă trecere (P2) nu face singură capăt.

---

## 3. Pozițiile

### (a) — doar precedentul cerut
Capătul la celelalte uzine: **din act, cu excepții din GPS pe opriri** (LEAR 4.2 + 4.5, Florești 4.2, SEBN 4.2), la Briceni doar
din GPS (4.1), iar «o simplă trecere nu face capăt» (Briceni 4.1). Se transpune: a1 = DA (P1 pe opriri decide, P2 doar sprijin —
exact Briceni 4.1); formularea SEBN 4.2 («startul real poate doar să lungească») acoperă R37 și R28. Nu se transpune fără Ion:
cazul Florești (GPS scurtează ruta) — la Drăxlmaier nu apare în v4. Două observații pentru (a):
- §4.7 din textul lui Ion numește Balatina (R28) și Năvîrneț (R37) «fără nicio oprire pe rută în GPS»; v4 le face capete. Planul
  (Pasul 5) nu spune că §4.1/§4.7 se schimbă prin `replace` — trebuie adăugat (migrație separată, gard md5).
- **R13 Hăsnășenii Noi și R18 Putinești** (§1.4 «fără nicio cursă din startul lor») au curse regulate în 14–18.09 (744ARF tur s1
  5/5, 804MUM retur s2 5/5, mai sus). Întrebare pentru Ion (a5, nouă): liniile astea primesc etalon din cursele 744ARF / 804MUM?

### (c1) — R1a în «Ce faci» ca grupă «Doarme în Bălți, departe de capăt»: **NU așa cum e formulată → întrebare pentru Ion**
1. c1 și c2 se exclud. Dacă c2 = DA (casa ≤ 3 km = ca parcul), regula §5.3 (a) pentru parc (`categorii.mjs:295`, «parc ↔ capăt
   e golul impus până la E») face R1a: 435ASB 292,5 → **0**, 186OMM 281,7 → **0**, 144BRAZ 128,7 → **7,3**, 744ARF 179,4 → 179,4
   (golul impus e deja = E, 17,3 pe picior). Grupa ar rămâne cu o singură mașină, iar la ea restul e cursă nedetectată.
2. La 744ARF și 804MUM R1a conține curse cu oameni (secțiunea 1). O grupă «autobuzul nu mai face N km» le-ar cere să taie
   turul s1 R13 și returul s2 R18.
3. Dacă Ion alege c2 = NU (drumul casă ↔ capăt din Bălți e livrare, ca SEBN 5.3), precedentul pentru formă e SEBN §12.6 (livrarea
   în indicații, «șofer din satul de start sau mașina așteaptă la capăt?») + ION-108 (doar km, mașina mică). Dar SEBN o aplică
   la TOATE mașinile, nu doar la cele din Bălți: o grupă numai «Bălți» ar fi o categorie nouă, nedictată. Întrebare, nu decizie.

### (c2) — casa ≤ 3 km de poartă = «lângă uzină», ca parcul: **steag → întrebare pentru Ion** (nu se transpune curat)
- Pentru DA: consecvența internă (§7.4 parc la 0,7 km de VEST; casele sunt la 1,5–2,7 km — 435ASB e la 1,6 km de parc, mai aproape
  decât poarta EST de parc, 2,25 km); precedentul LEAR (`lear-analiza.mjs:1150`: «casa ei e uzina, regula 1 e deja aplicată»;
  `dorm.mjs:8-13`: golul uzină ↔ capăt nu e economie).
- Pentru NU: LEAR aplică «lângă poartă» doar la ≤ 1,5 km și doar ca rezervă; SEBN §5.3/§7.1 și Briceni §5.3 numără livrarea
  oricât de aproape de poartă ar sta șoferul — economia lor e «șofer din satul de start», iar pentru un șofer din Bălți asta e
  exact ce ar tăia R1a. Pragul de 3 km nu e al lui Ion (LEAR are 1,5; §5.4/§5.5 Drăxlmaier au 3 km ca «zonă a uzinei»).
- Cifrele pentru Ion: R1a măsurat pe cele 4 mașini 882,3 km/săpt. (extrapolat 1.268); cu DA rămân 186,7 (extrapolat ≈ 307),
  din care 139,7 sunt cursa R13 a lui 744ARF.

### (d1) — «dimineața > 1,3 × drumul capăt → casă ⇒ diferența la de lămurit»: **DA pe principiu, cu 3 schimbări înainte de runda 2**
1. **Întâi poarta în fereastră.** Dacă bucata R1a conține o oprire la poartă într-o fereastră §3.2, bucata e «cursă probabil
   nedetectată» (§8.6: ziua iese din regulile de economie), nu «de lămurit» §11.8. Pe flotă: 19 bucăți / 1.150 km; pe zile
   măsurate 429 km (024XKY 351,2, 744ARF 78,0).
2. **Comparația pe piciorul propriu, pe șosea.** Referința = Valhalla(locul nopții, capătul cursei vecine) × 1,05, ca la §5.2 și
   plafonul §8.3 — nu «drumul capăt → casă» de seara: la 186OMM dimineața e Grinăuți (16,7 km pe șosea), seara Nihoreni
   (35,1) — cu referința de seară, dimineața n-ar fi prinsă niciodată, iar la 804MUM seara e ea însăși cea umflată. 1,3 poate rămâne
   ca prag de STEAG pe pagină; cantitatea care rămâne la R1a e plafonată la ×1,05.
3. **Numele.** Nu «rulaj prin oraș»: la ambele mașini citate (744ARF, 804MUM) excesul e muncă la poartă în ferestre. Eticheta pe
   pagină: «R1a peste drumul casă ↔ capăt — de lămurit» sau «cursă probabil nedetectată», după punctul 1.
- Efect pe cele 4 mașini măsurate: rest 164,9 km/săpt. scos din R1a (435ASB 4,1; 186OMM 11,5; 144BRAZ 9,6; 744ARF 139,7).

---

## 4. Observații cu severitate (rubrica comună)

**H1 — high, −2.0 (defect de logică): premisa subiectului (d) și ținta lui (c1) sunt greșite pentru 744ARF și 804MUM.**
Scenariu: se livrează c1 cum e scris (grupa «Doarme în Bălți», «autobuzul nu mai face / mașina mică face»). Pe 14.09, 744ARF
apare cu R1a 299 km/săpt. (179,4 / 3 × 5), din care 78 % e turul s1 pe R13 Hăsnășenii Noi (mișcarea 05:0x → poartă 06:04–06:07, 23,4 km,
5/5 zile; oprire la Hăsnășenii Noi 05:41–05:47 pe 15 și 17.09) și drumurile lui; când 804MUM are zile măsurate, «seara 67 km» conține returul s2 (00:17–00:20 poarta EST →
00:53 Țiplești, 5/5 nopți). Dispecerul primește dispoziția să taie curse cu oameni. Dovezi: `economie-zile.json` (bucățile
«livrare» 03:00–14:07 și 16:28–03:00), `economie-curse.json` (mișcările 05:1x–06:0x 23,4 km și 00:2x 45,6 km),
`drax/cod/economie/alternative.mjs:124` (R1a = toată livrarea fără ocol), `economie-zile.json` `linii["R13|Hasnasenii Noi"].E =
{s1:null,s2:null}`, idem R18. Corecție: d1 cu punctul 1 (poarta în fereastră → §8.6) ÎNAINTE de orice c1; întrebarea a5 pentru
etalonul R13/R18.

**H2 — high, −2.0 (defect de logică): c1 și c2 sunt puse ca două întrebări DA/NU independente, dar se exclud.**
Scenariu: Ion răspunde DA la amândouă → migrația 409 scrie în §12.1 grupa «Doarme în Bălți» și în §7.4/§5.3 casa ≤ 3 km ca parcul;
workerul (`categorii.mjs:295`) mută R1a 435ASB 292,5 → 0 și 186OMM 281,7 → 0 la «gol pe rută», iar grupa nou scrisă în §12.1 e goală
pentru 3 din 5 mașini (sau, dacă `drax-ce-faci.ts` citește R1a din rândul vechi, arată 882 km care după rerulare dispar). Corecție:
o singură întrebare cu două variante, cu cifrele: (i) drumul casă-în-Bălți ↔ capăt e al uzinei, ca parcul (R1a rămâne 186,7, din care
139,7 cursa R13); (ii) e livrare, ca la SEBN 5.3 — atunci se arată pe TOATE mașinile peste prag, după SEBN §12.6, doar în km (ION-108).

**M1 — medium, −1.0 (gol de acoperire): golul impus 5.3 (a) depinde de faptul că drumul spre casă atinge raza porții**
(`categorii.mjs:296`, `if (!s.bpts.some((p) => poarta(p, PR.POARTA_EXTRA))) continue;`). În grupa Bălți: 744ARF primește 17,3 km
gol impus pe fiecare picior (drumul atinge poarta — dimineața chiar prin turul R13 nedetectat), 435ASB primește 0 pe același tip de
drum (casa la 1,7 km de poartă, spre Taura Veche nu trece prin rază). Aceeași situație, categorie diferită după cum trece șoseaua.
Corecție: în comparația v3.1/v4 și în întrebarea pentru Ion, cifrele R1a ale grupei se dau și cu, și fără golul impus.

**M2 — medium, −1.0 (gol de acoperire): regula d1 nu are control pe toată flota în plan.**
Pasul 5 vorbește de 744ARF și 804MUM; controlul pe flotă (§10.4, memoria `analiza-verifica-toata-flota`) arată și 024XKY (351,2 km
pe zile măsurate, poarta în tur s1) și 414ASB. Corecție: `an-flota.mjs` (sau echivalentul în `control.mjs`) ca probă P11 în lanț.

**L1 — low, −0.5: cifra «≈ 1.270 km/săpt. măsurat» e extrapolată** (măsurat 882,3); 144BRAZ are 2 zile (nemăsurată, sub
`MIN_ZILE_MASURATE`), 804MUM 0; «≈ 500 la 804MUM» e în cea mai mare parte curse (425,9 din 650,4 brut peste drumul pe șosea).

**L2 — low, −0.5: textul §4.1/§4.7 nu e în planul de livrare al capetelor** (Balatina, Năvîrneț numite «fără oprire» în textul
lui Ion); schimbarea trebuie scrisă prin `replace` pe marcaje, cu gard md5 pe 810297f3….

**Scor: 10 − 2,0 − 2,0 − 1,0 − 1,0 − 0,5 − 0,5 = 3,0.** Blocante (high): 2 (H1, H2).

---

## 5. Ce ar trebui schimbat în v4 / în documentul rundei înainte de runda 2
1. Subiectul (d) rescris: nu «rulaj prin oraș», ci «R1a peste drumul casă ↔ capăt»; regula d1 cu cei 3 pași (poarta în fereastră →
   §8.6; referință Valhalla pe piciorul propriu × 1,05; 1,3 doar steag); rezultatul pe toată flota, nu pe 2 mașini.
2. Subiectele (c1)+(c2) comasate într-o întrebare cu două variante și cifrele de mai sus.
3. Întrebarea nouă a5: etalon pentru R13 Hăsnășenii Noi (744ARF: mișcarea spre poartă 05:0x → 06:04–06:07, 5/5; oprire la Hăsnășenii Noi pe 15 și 17.09) și R18 Putinești (804MUM, tur s1
   ~04:50 → 06:16 și retur s2 00:17 → 00:53 Țiplești, 5/5) — sau rămân fără etalon cu steag «cursă nedetectată».
4. Pasul 5 al planului: adăugat `replace` pe §4.1/§4.7 pentru capetele din GPS.

## Întrebări pentru Ion (cu cifrele)
1. **Casa în Bălți** (435ASB 1,7 km de poartă, 186OMM 1,7, 144BRAZ 1,5, 744ARF 2,4, 804MUM 2,7): drumul de acasă până la capătul
   liniei e (i) al uzinei, ca atunci când mașina doarme la Parcul Bălți — R1a măsurat scade de la 882 la 187 km/săpt. — sau (ii)
   livrare, ca la SEBN, care se taie cu un șofer din satul de start — atunci apare în «Ce faci» doar în km (autobuzul nu mai face /
   mașina mică face), pentru toate mașinile peste prag, nu doar cele din Bălți?
2. **744ARF** pleacă în fiecare zi la ~05:10, oprește la Hăsnășenii Noi (05:41–05:47, pe 15 și 17.09) și ajunge la poartă la 06:04–06:07, apoi la 15:48 pleacă de
   la poarta EST și e acasă la 16:35. E linia R13 Hăsnășenii Noi, schimbul 1? (în act linia n-are nicio cursă în GPS-ul scheletului.)
3. **804MUM** e la poarta EST în fiecare noapte la 00:17–00:20 și la Țiplești la 00:53: e returul s2 al liniei R18 Putinești / R22?
4. Pragul «lângă uzină»: 1,5 km (ca la LEAR Ungheni) sau 3 km (zona uzinei Drăxlmaier, §5.4)?
