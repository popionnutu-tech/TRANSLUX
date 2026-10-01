# ION-148 — Briceni (Trox + suburban): harta mașinii și parcarea optimă P1 / P2 (cercetare, runda 0)

Ion, 30.09.2026: «creează-le hărțile la toate direcțiile cu punctele optimale de dormit cum ai făcut la Drăxlmaier și LEAR».
Modele: ION-136 (Drăxlmaier, `docs/plans/2026-09-29-drax-parcare/`), ION-143 (LEAR, `docs/plans/2026-09-29-lear-parcare/`, Codex 10/10),
ION-130 (harta, `docs/plans/2026-09-28-lde-harta-masinii/`). Măsurătorile: `vps/masoara.mjs` (doar citire, rulat pe VPS în
`/root/lde-worker/briceni-parcare/cercetare/`), ieșirile `vps/rulare-{12,20}[-fara-podea].txt`.

## De ce

`/lde/harta` are azi Drăxlmaier, LEAR Ungheni și LEAR Florești (`UZINE_HARTA`, `apps/admin/src/lib/lde/drax-harta.ts:89-93`);
`lde_harta_zi` n-are niciun rând BRICENI (SELECT 30.09: DRAXELMAIER 21.09/14.09, LEAR_UNGHENI 21.09, LEAR_FLORESTI 21.09).
Rândul «BRICENI» din `lde_analiza_reguli` (21.09, scris 28.09 05:01 UTC) n-are `date.parcare`. Regula de economie a direcției e deja
una de parcare, dar fără loc: `TROX_BRICENI.reguli_livrare` (`reguli_livrare_la` 2026-09-25 20:42 UTC) §8 R1: «Livrarea: șofer din
satul de start sau mașina așteaptă la capăt între ture, nu acasă. Singura economie numărată; gol pe rută și legătură nu sunt economie.»
Parcarea P1 / P2 e varianta realizabilă a acestei reguli (ca la LEAR §13.6: «aceeași economie măsurată altfel — nu se adună»).

## Ce facem (propunerea)

Metoda LEAR ION-143 (alegerea locurilor = `lear-parcare-alege.mjs`, importată, nu copiată), cu munca luată din clasificarea Briceni
existentă, nu din opririle în sate:

1. **Munca** = bucățile «cu oameni» ale lui `livrare.mjs` (`clasificaZi`: curse Trox pe rută, returul fără capăt, returul după
   predare, curse suburbane din orar, neprogramat sat → gară, retur după ultima cursă a rutei) + «cursă în afara orarului»
   (`nepotrivita`, §5.4). Același `(mașină, zi)` ca rândul BRICENI (zilele interurbane scoase, §5.7).
2. **Drum de parcare** = golul ≥ 60 min dintre două bucăți de muncă, pe urma continuă a săptămânii (fișierul zilei `z` dă doar
   [z 03:00, z+1 03:00), §2.3). Scoase: sub 60 min, peste GOL_MAX (întrebarea 1), golul în care mașina nu iese la > 2 km nici de gară,
   nici de poartă (așteaptă la capătul job-ului), golul cu trecere la ≤ 4 km de Parcul Bălți (service, §5.6).
3. **Km acum** = km GPS ai golului (salturile > 5 km nu se numără; pe 21–27.09: niciunul). **Propus prin P** = (V(E,P) + V(P,S)) × 1,05,
   Valhalla bus; **podea Trox**: golul Trox → Trox cu poarta la un capăt (drumul gol impus de ture, «6 drumuri, 2 ture») nu poate
   ieși sub lungimea cursei Trox a zilei (`lungimeTrox`, aceeași podea ca `impartOcol` / `minDirect`, `livrare.mjs`; memoria
   `briceni-livrare-reguli-sebn`: «904BRAN 15.09: poartă → Groznița pe scurtătură 21 km, pe rută 32»).
4. **Candidați**: satele / orașele OSM (village / town / city) la ≤ 15 km de un capăt E / S, gara Briceni, poarta Trox, casa
   (locul nopții cel mai des, §7.1). Fără loc fără drum Valhalla.
5. **Alegerea** ca LEAR §13.4–13.5: pe drum prin locul ales sau «rămâne cum e» (loc ≤ 4 km de unde stă acum sau câștig
   < max(2 km, 5 %)); al doilea loc doar la ≥ 20 km/săpt. și ≥ 3 drumuri; preferința «deja stă aici ≥ 2 zile» > oraș > sat.
6. **Publicarea** atomică ca LEAR (migr. 441): `date.parcare` în rândul BRICENI + `lde_harta_zi` uzina `BRICENI`, o tranzacție.

### Variante respinse
- **Metoda Drăxlmaier ION-136** (cost = legătura zilei ideale + ocolul prin loc): Briceni n-are «ziua ideală» (fără ancore E / S,
  fără `economie-zile.json`); ar trebui construită întâi — o fază întreagă, fără cerere de la Ion.
- **Tăierea muncii LEAR pe opriri în sate** (§13.2 LEAR, `lear-parcare.mjs`): Briceni are deja orarul și cursele Trox potrivite pe rută
  (ION-70/73, 96 % din curse la ±10 %); a doua tăietură, cu alte praguri, ar da altă zi decât raportul BRICENI pe aceeași pagină.
  Controlul LEAR §10 (orice oprire rămasă în drum scoate mașina) ar scoate aici 9 din 10 mașini (vezi 🔬, opririle).

## 🔬 Verificat pe viu (30.09.2026, săptămâna 21–27.09, fișierele `-sapt` scrise luni 28.09 08:01 de lanțul existent)

**Flota.** Rândul BRICENI: 12 mașini, 58 zile-mașină, 58 cu bilanț, 12 zile interurbane scoase. Urma GPS a săptămânii (`briceni/date/zile`):
- în analiză: 054MLD, 904BRAN, 246BRAP, 283YEK, 532BRAO, 285BRAT, 319BRAT (Trox + suburban), 480BRAS, 318BRAT, 459BRAX, 065LTL, 029BRAS (doar suburban);
- cu urmă dar în afara analizei: 263NSX (3.911 km), 692TWK (4.011), 703TWK (555) — interurban; 065LTL 2.355 km GPS în 7 zile, dar
  o singură zi cu cursă Briceni (restul fără cursă Trox / din orar); 145BZP 6 km; 281BRAT fișier fără puncte (fără tracker, ruta 52);
  895BRAX (T2 alternativ) fără date în săptămână.

**Capetele pe rută** (curse Trox pe rută + suburban din orar, 21–27.09): T1 Bulboaca 18 · T2 Groznița 10 / Halahora de Sus 5 /
Trestieni 3 / Mărcăuți 2 · T3 Criva 9 / Drepcăuți 8 / Lipcani 6 · T4 Larga 19 · T5 Medveja 20 · T6 Tețcani 9 · 48 Grimăncăuți 43 ·
45 Colicăuți 16 · 50 Corjeuți 15 · 55 Mărcăuți 14 · 46/52/53/54 Coteala 40 (+ Larga 3, Medveja 4) · 57 Bezeda 6 / Bogdănești 3 / alte 5 ·
49 Tabani 8 · 44 Berlinți 6 / Beleavinți 4 · 47 Balasinești 6 · 51 Trebisăuți 4 · 56 Lipcani / Pererita / Șirăuți 4.

**Golurile dintre curse, toată flota** (`rulare-20.txt`; T = cursă Trox, S = suburban, primul = cursa dinainte):

| durata | zi | noapte |
|---|---|---|
| < 60 min | SS 137 (1.609 km) · ST 7 (57) · TT 11 (37) | — |
| 1–3 h | SS 12 (187) · ST 7 (192) · TS 20 (554) | — |
| 3–6 h | ST 4 (179) | TT 2 (67) |
| 6–12 h | TT 33 (1.179) · ST 1 (111) | TT 17 (414) · TS 2 (86) |
| 12–20 h | — | SS 6 (157) · ST 1 (106) · TT 3 (78) |
| > 20 h (weekend / pauză) | — | SS 11 (363) · TS 4 (205) |

- Trox: ziua are două goluri lungi impuse de ture — poartă (după tur S1 ~05:35) → capăt (tur S2 ~13:00) și capăt (după retur S1 ~14:30) →
  poartă (retur S2 ~21:30), 6,5–7,5 h fiecare — plus noaptea capăt → capăt, 6–7 h (22:40 → 05:00).
- Suburbanul: golurile sunt mai ales sub 60 min (137, 1.609 km — întoarcerea gară → capăt între curse, nu se poate sta); ziua se
  termină devreme (318BRAT ~13:30–14:15, 480BRAS ~14:00, 285BRAT ~14:30), deci noaptea suburbană ține 14–17 h.
- Motivele de scoatere (GOL_MAX 20 h): intră 101 goluri, 3.239 km; < 60 min 157; > 20 h 15; stă la gară / poartă 5; Bălți 0.
  În 84 din 101 mașina stă acasă (staționarea cea mai lungă din gol la ≤ 1 km de casă).
- **Opririle 30 s – 5 min în satele din nomenclator, în interiorul golului: 51 din 101.** Exemple: 283YEK 22.09 14:33–21:03 — acasă
  la Trebisăuți 14:36–18:18, apoi gară 18:37 → poartă → Caracușenii Noi → Berlinți (6 min) → poartă → gară 19:05–20:59 → poartă
  (`briceni/cod/pe-unde.mjs`); 054MLD 22.09 14:41–20:55 — Criva → Drepcăuți → Lipcani → Tețcani (6 min) → acasă 15:25–20:50.
  Raportul BRICENI le-a clasat livrare / legătură (§5.4 cere ≥ 2 sate ale rutelor mașinii ȘI capăt la gară / poartă).

**Locul nopții** (§7.1, `loculNoptii`): fiecare mașină doarme noapte de noapte în același loc — acasă: 054MLD Slobozia-Șirăuți,
904BRAN Bălcăuți, 246BRAP Beleavinți, 283YEK Trebisăuți, 532BRAO Balasinești, 285BRAT Cotiujeni, 319BRAT Larga (= capătul T4),
459BRAX Briceni, 480BRAS lângă Lipcani, 029BRAS Șirăuți, 065LTL Lipcani. **318BRAT: niciun loc al nopții** (nicio staționare ≥ 60 min
între 20:00 și 05:00 — tracker-ul tace și reapare în alt loc); drumurile ei de noapte au «stă: —».

**Km de tăiat estimați, pe mașină** (km/săpt.; «real → propus»; GOL_MAX 20 h, cu podeaua Trox):

| mașină | fel | drumuri | real → propus | de tăiat | locuri | livrare R1 (raport) |
|---|---|---|---|---|---|---|
| 054MLD | T3 + 57 | 18 | 756,7 → 375,7 | **381,0** | Drepcăuți (9) + Bezeda (5) | 462,3 |
| 532BRAO | T6 + 47/50 | 13 | 489,7 → 199,1 | **290,6** | Tețcani (4) + Briceni (6) | 333,8 |
| 904BRAN | T2 + 45 | 16 | 557,1 → 339,9 | **217,2** | Groznița (8) + Trestieni (4) | 296,1 |
| 246BRAP | T5 + 44 | 17 | 545,2 → 351,8 | **193,4** | Medveja (11) | 280,5 |
| 283YEK | T1 + 55 | 14 | 355,2 → 205,6 | **149,7** | Briceni (4); noaptea «rămâne» (casa la 3 km de Bulboaca) | 222,9 |
| 285BRAT | T4 + Coteala | 5 | 162,3 → 91,8 | **70,5** | Larga (4) | 207,7 |
| 318BRAT | Coteala | 3 | 81,0 → 12,2 | **68,9** | Coteala (3) — doar cu GOL_MAX 20 h | 137,9 |
| 319BRAT | T4 + Coteala | 12 | 237,0 → 237,0 | 0 | rămâne cum e: doarme la Larga = capătul T4 | 24,3 |
| 459BRAX | 48 | 2 | 31,2 → 31,2 | 0 | doarme în Briceni | 122,5 |
| 480BRAS | 50 | 1 | 23,9 → 23,9 | 0 | — | 183,7 |
| 029BRAS, 065LTL | 49, 57 | 0 | — | 0 | niciun gol ≥ 60 min și ≤ 20 h | 13,5 / 40,4 |

**Flota: −1.371,3 km/săpt.** (GOL_MAX 20 h) / −1.124,8 (12 h), față de livrarea R1 din rândul BRICENI 2.325,6 km. Pe felul golului
(20 h): Trox → Trox 803,1 · amestec Trox ↔ suburban 467,2 · suburban → suburban 100,9. Fără podeaua Trox: 1.497,6 / 1.251,1 — podeaua
taie 126 km/săpt. de «economie» care ar fi fost doar scurtătura goală pe lângă traseul rutei (904BRAN: T 480,3 → 200,4 fără podea,
→ 298,6 cu ea). Rularea e deterministă pe cache-ul Valhalla (`cercetare/drum-cache.json`); durata ~6 s pentru toată flota.

**Probe de bun-simț** (ca 880RNK la Drăxlmaier, ION-115): 319BRAT, care doarme la capătul T4, iese 0; 283YEK noaptea rămâne acasă
(Trebisăuți la ≤ 4 km de Bulboaca); 459BRAX (48, doarme în Briceni) 0; mașinile doar suburbane ies aproape 0 — la ele livrarea R1 e
drumul casă ↔ primul / ultimul capăt, care cade în golurile nopții (> 12 h) sau sub 60 min.

**Infrastructura de publicare** (repo `origin/main` și `schema_migrations`, 30.09): ultima migrație `445b` în ambele; următorul număr
liber 446 (se reverifică la execuție). `lde_publica_lear_parcare` (migr. 441) acceptă doar `('LEAR_UNGHENI','LEAR Ungheni')`,
`('LEAR_FLORESTI','LEAR Florești')` și e doar `service_role`. `lde_harta_zi` (migr. 431): cheie (uzina, saptamina, m, z).
Harta citește scheletul din `public/lde/<schelet>` — `schelet-briceni.json` există (17 rute, `shape`, `stops`, `gara`, `poarta`).
`TipInterval` = `cursa | gol | munca | uzina` (`drax-harta.ts:9`). Lanțul de luni: `lear-saptamanal.sh` cheamă `briceni/cod/saptamanal.sh`
sub `flock` (liniile 48–53), după LEAR și înaintea posterelor; crontab `0 8 * * 1`.

## Pași (după «da»-ul lui Ion; tichet de execuție separat sau ION-148 «execută»)

1. **Dump din `livrare.mjs`** (compatibil, ca `--dump` la `lear-analiza.mjs` ION-143): opțiunea `--dump <fișier>` scrie `seg` pe
   (mașină, zi) cu `t0, t1, cat, kind, r, km` și urma simplificată la 15 m; fără opțiune, ieșirea identică (proba: md5 pe
   `livrare-sapt.json` înainte / după, pe săptămâna 21.09). Backup `.bak-ion148`.
2. **`briceni-parcare/parcare.mjs`** (din `vps/masoara.mjs`): citește dump-ul, calculează golurile, candidații, `alegeLocuri`
   (import din `../lear-parcare/lear-parcare-alege.mjs`), scrie `date/parcare-<luni>.json` în forma `date.parcare` LEAR
   (`flota`, `masini[].locuri/legi/zile/motivFara`), ca `ParcareDrax.tsx` să-l citească fără ramură nouă.
3. **`briceni-parcare/harta.mjs`**: `lde_harta_zi` uzina `BRICENI` din dump: `cuOameni`, `nepotrivita` → `cursa`; `livrare` → `gol`;
   `golRuta`, `golTure`, `legatura`, `deplasare`, `service` → `munca` (textul pe Briceni: «gol impus (rută / ture / legătură)»);
   staționarea la gară / poartă → `uzina`; `cats` păstrează categoria exactă. Validare: Σ km pe intervale = km zilei ±5 %.
4. **Migrația 446** (`BEGIN`/`DO`): `CREATE OR REPLACE lde_publica_lear_parcare` cu perechea `('BRICENI','BRICENI')` adăugată (restul
   funcției neschimbat, `REVOKE … FROM PUBLIC, anon, authenticated`, `GRANT … service_role`); §11 PARCAREA PROPUSĂ în
   `TROX_BRICENI.reguli_livrare` prin concatenare cu gard `length` + `md5` pe textul de azi (4.658 caractere), `ROW_COUNT = 1`,
   `reguli_livrare_la = now()`; `livrare_validata` rămâne false. Pas-poartă: fișierul `.sql` în dereva, sesiunea principală îl
   compară cu planul și îl aplică.
5. **`briceni-parcare/lant.sh`** = parcare → harta (fișier) → publică (RPC atomic, refuz peste 2,5 MB), chemat din
   `briceni/cod/saptamanal.sh` după `scrie-analiza.mjs --write`; `BRICENI_PARCARE=0` îl sare; picat = raportul BRICENI rămâne.
   Durata măsurată de mână pe 21.09 înainte de legare (azi: ~6 s calculul).
6. **Panoul**: `UZINE_HARTA.briceni = { id: 'BRICENI', nume: 'Trox + suburban Briceni', lear: true, schelet: 'schelet-briceni.json',
   poarta: [48.34648, 27.08318] }`, `uzHarta` acceptă `briceni`; pagina: pentru briceni, `linii` din `schelet-briceni.json`
   (`shape`, `stops`), porțile = poarta Trox + gara Briceni (fără Parcul Bălți pe hartă); `RaportBriceni.tsx`: blocul «Parcarea
   propusă» (`ParcareDrax` în modul LEAR) cu link «pe hartă».
7. Nota de memorie în memoria proiectului + rândul din `MEMORY.md`.

## Fișiere

VPS (noi): `/root/lde-worker/briceni-parcare/{parcare.mjs,harta.mjs,publica.mjs,lant.sh}`; modificat compatibil:
`briceni/cod/livrare.mjs` (`--dump`), `briceni/cod/saptamanal.sh` (un pas). Repo: `packages/db/migrations/446_lde_briceni_parcare.sql`,
`apps/admin/src/lib/lde/drax-harta.ts`, `apps/admin/src/app/(dashboard)/lde/harta/page.tsx` (+ `HartaClient.tsx` pentru a doua poartă
și textul `munca`), `apps/admin/src/app/(dashboard)/lde/reguli/RaportBriceni.tsx`, copii în `lde-geo-worker/briceni-parcare/`.
**Nu se ating**: datele și lanțurile Drăxlmaier / LEAR (`lear-parcare/` doar importat), `lde-timp-liber`, crontab, scheletul
`schelet-briceni.json`, posterul BRICENI.

## Riscuri

- `livrare.mjs --dump` schimbă un fișier din lanțul de luni: numai opțional, md5 pe ieșire înainte / după; livrat în afara luni 07:30–09:30.
- Funcția 441 e pe calea LEAR: `CREATE OR REPLACE` cu lista extinsă; proba: publicarea LEAR 21.09 rulată din nou dă aceleași rânduri.
- Opririle din gol (51 / 101) — dacă o parte sunt curse cu oameni neprinse, economia e umflată (întrebarea 3).
- 318BRAT fără loc de noapte: drumurile nopții fără «unde stă acum» → regula «≤ 4 km de unde stă» nu se poate aplica.
- O singură săptămână măsurată (fișierele `-sapt` servesc lanțul de luni; a doua săptămână cere rularea lanțului pe alte sufixe —
  la execuție, cu `SUFIX` propriu, nu peste `-sapt`).

## Verificare

- `/lde/harta?uz=briceni&sapt=2026-09-21`: 12 mașini (sau cele cu zile), P1 / P2 și km de tăiat = `date.parcare.flota.economieSapt`.
- Controlul pe toată flota: fiecare mașină din rândul BRICENI are fie locuri, fie `motivFara`; lista mașinilor cu urmă dar în afara
  analizei (interurban, fără tracker) în `date.parcare.flota`.
- Probe: 319BRAT = 0 (doarme la capăt); podeaua Trox (904BRAN T ≥ lungimea cursei); niciun drum propus peste real; Σ km hartă ±5 %.
- Proba atomică RPC cu rând invalid (ca `2026-09-29-lear-parcare/vps/proba-atomic.txt`); LEAR republicat identic.

## Ce e diferit față de LEAR

1. Două ancore la 1,4 km (gara Briceni pentru suburban, poarta Trox pentru Trox), nu o poartă.
2. Munca vine din orar + cursele Trox potrivite (ION-70/73), nu din opririle în sate.
3. Același autobuz face două job-uri pe zi: 467 km/săpt. din economie stau în golurile Trox ↔ suburban.
4. Golul gol impus de ture (Trox) are podea = lungimea rutei; la LEAR golul de prânz n-are podea (R3 e pe etalon).
5. Ziua suburbană se termină ~14:00, deci pragul LEAR de 12 h pentru «zi incompletă» scoate toate nopțile suburbane.
6. Parcul Bălți e la ~90 km în linie dreaptă: regula service nu prinde nimic aici.
7. Nu există schimb 3 / ferestre la gară; suburbanul are doar tururi în orar (returul după ultima cursă e muncă, §5.1 / ION-73).

## Întrebări pentru Ion

1. **Noaptea suburbană.** Ziua suburbanului se termină pe la 13:30–14:30 și reîncepe la ~07:00, deci «noaptea» ține 14–17 h
   (318BRAT 4 nopți, 459BRAX 6, 532BRAO 4). La LEAR golul peste 12 h nu intră. Pentru Briceni: pragul rămâne 12 h (flota −1.125 km/săpt.,
   suburbanul 0) sau 20 h (−1.371; 318BRAT 69 km/săpt. dacă doarme la Coteala, 532BRAO 291 cu Tețcani)? Weekendul (> 20 h) rămâne afară.
2. **Golul Trox dintre ture pe scurtătură.** Drumul gol poartă → capăt (sau capăt → poartă) se socotește ca în raport, cel puțin cât
   ruta (podeaua; −126 km/săpt. din economie), sau «pe drumul cel mai scurt» (904BRAN: poartă → Halahora 40,9 km acum, 16,2 prin Tabani
   pe scurtătură; cursa T2 cu oameni are ~32 km)?
3. **Opririle în golurile lungi.** În 51 din 101 de goluri mașina oprește 30 s – 5 min în sate din nomenclator (283YEK 22.09 seara:
   gară → Berlinți → poartă → gară, cu 6 min la Berlinți). Raportul BRICENI le-a clasat livrare / legătură. Le luăm așa (drumul de
   parcare rămâne întreg) sau, ca la LEAR, oprirea taie drumul (oamenii luați / lăsați = muncă)? La LEAR, oprirea rămasă scotea
   mașina — aici ar scoate aproape toată flota.
4. **Candidații pentru Trox + suburban.** Locul propus poate fi gara Briceni / orașul Briceni (532BRAO: între cursa de dimineață la gară
   și returul de la 14:00 stă în Briceni, 53 → 4 km) — e acceptabil pentru șofer, sau parcarea la gară / poartă între job-uri nu se propune?
5. **Harta: culorile.** Pe Briceni «gol pe rută», «gol între ture» și «legătură» sunt impuse (nu economie). Pe hartă: o culoare comună
   «gol impus», separat de «livrare» (roșu)? Și a doua ancoră (gara) pe hartă lângă poarta Trox.
6. **Posterul.** La LEAR — doar pagini; la Drăxlmaier — poster luni. Pentru Briceni: doar pagini (harta + blocul din raportul BRICENI)?
7. **Flota.** 065LTL are 2.355 km GPS în săptămână dar o singură zi cu cursă Briceni; 281BRAT (ruta 52) n-are tracker. Rămân în afara
   parcării cu motivul scris — de acord?
