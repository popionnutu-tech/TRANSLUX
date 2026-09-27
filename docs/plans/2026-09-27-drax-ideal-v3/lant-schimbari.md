# Ideal-v3 Drăxlmaier — faza 1: lanțul (ION-97, 27.09.2026)

Lucrat numai în `/root/lde-worker/drax/cod/ideal-v3/` și `/root/lde-worker/drax/date/ideal-v3/`, copii `cp` (inode nou, nlink 1) ale `ideal-v2`.
Manifestul sha256 + inode + nlink + mtime pe 73 de intrări (`date/ideal-v2/*`, `date/*-ideal.json`, `cod/ideal-v2/*`, `cod/ideal/*`, ținta `ideal-activ`)
e **identic** înainte și după (`date/ideal-v3/proba/manifest-inainte.txt` = `manifest-dupa.txt`; `ideal-activ -> ideal-v2`).
Neatinse: `ideal-activ`, `schelet-drax.json`, baza, cron-urile, registrul verificatorului, `/home/verif/` (modulele lui doar importate, citire).
Fără `GATA` / `GATA.sha256` în `ideal-v3`: setul are doar corecțiile mecanice; cardurile celor 7 linii așteaptă decizia (faza 2).

## Cum s-a rulat (trei rulări, aceleași intrări)

Intrarea = ieșirea finală a v2 (`curse-ideal.json` 5b6bb6ed…, `dispozitive-sursa.json`, `nomenclator.json`, `flota-ideal.json`, `dubluri-ideal.json`)
plus **cache-ul urmelor candidatelor** `schelet-cand.json` al v2. `lant.sh` din v3 diferă de v2 într-un singur loc: nu mai șterge `schelet-cand.json`
și, când există, lotul 0 nu mai desenează (se desenează doar liniile rămase «de completat», loturile 1–2). Motiv: fără cache, lotul 0 ar fi cerut
din tracker + Valhalla următoarele 8 candidate și rezultatul n-ar mai fi fost comparabil. Pe toate trei rulările `de-completat` = `[]`, deci nicio
urmă nouă nu s-a desenat (0 interogări tracker/Valhalla).

| rulare | cod | durata | rezultat față de v2 |
|---|---|---|---|
| P0 | copia v2, doar căile `ideal-v2 → ideal-v3` + cache | 14 s | **13/13 fișiere identice octet cu octet** (schelet 29b2d3aa…, obs 5dba3f2e…, etalon 08ecc93f…, schimburi 2d4713f2…, care-schimb 78e78463…, card-gps-raport, control-ideal.log…) |
| P1 | + pct. 1 (ora) + pct. 2 (regimul) | 15 s | 11/13 identice; diferă doar `schimburi-ideal.json` și `care-schimb-ideal.json` (cheile noi A/B), identice după mapare (proba 2a) |
| P2 | + pct. 3, 4, 5 | 15 s | vezi `compara-v2-v3.md`: 2 linii schimbate (R32 Trifanesti ture/zi 2 → 4, R7 Slobozia* −139 observații) |

## Pct. 1 — ora locală: inventarul semantic

| loc (ideal-v2) | ce era | ce înseamnă | v3 |
|---|---|---|---|
| `etalon.mjs:21-22` `L`, `ora` | UTC + 3 h, ore + minute | ora locală a sosirii turului / plecării returului → ferestrele FER, `ora` în obs | `oraLoc` (Intl, ore + minute, fără secunde, ca în v2) |
| `etalon.mjs:23` `ziua` | `(t + 3 h) − 3 h` = **data UTC** | ziua de lucru 03:00 → 03:00 (vara 03:00 EEST = 00:00 UTC, deci corect doar vara) | `ziLucru` (ceasul local: < 03:00 → ziua dinainte) |
| `card-gps.mjs:30` (generatorul) | data (t + 3 h) | data CALENDARISTICĂ locală (grupa SCURTE pe mașină-zi) | `ziLocala` (aceeași semantică; verificatorul folosește aici ziua de lucru — notat, nu schimbat) |
| `fix-dubluri.mjs:10`, `dubluri-placa.mjs:15` | data (t + 3 h) | data calendaristică locală (dispozitive duble în aceeași zi) | `ziLocala` |
| `curse.mjs:35` `ziL` | data (t + 3 h) | doar jurnalul extracției | `ziLocala` |
| `curse.mjs:73` zilele la poartă | data UTC a lui (t − 3 h) = 06:00 → 06:00 EEST — **eroare** | numărul de zile la poartă (flota: ≥ 5 zile) | `ziLucru`; extracția nu se reface în v3 |
| `curse.mjs:67/95` limitele SQL | text `2026-05-04` comparat cu `w_date` UTC = 00:00 UTC | începutul ferestrei = 03:00 locală (vara coincide) | `inceputZiLucru(z)` ca text UTC; vara identic |
| `schelet.mjs:86` `utc()` | `toISOString` fără Z | parametrul `track.w_date` (UTC) | **corect, neatins** (nu e UTC+3) |
| `schimburi.mjs:13-14` `isoSapt`, `luniSapt` | calendar pe data zilei | etichetă de săptămână, nu oră | `luniSapt` din `timp.mjs` (identic); vezi pct. 2 |
| `ore.mjs`, `alege.mjs`, `pagina.mjs` | citesc `c.ora` / ore zecimale | derivate din etalon | neatinse |
| `economie/comun.mjs:47` | `ziLocala(t − 3 h)` prin Intl | ziua de lucru (F2) | **în afara ideal-v3**, deja pe Intl — neatins |

Modulul nou: `cod/ideal-v3/timp.mjs` (`oraLoc`, `ziLocala`, `ziLucru`, `inceputZiLucru`, `ANCORA`, `luniSapt`, `fazaSapt`).

**Proba 1** (`proba/cod/proba-ora.mjs`):
- (a) toate cele **13.672** observații reale din v2 (04.05 … 25.09): ora recalculată ≠ v2: **0**; ziua ≠ v2: **0**. Cele **27.644** deplasări: data locală ≠ v2: **0**. Limitele SQL: `2026-05-04 → 2026-05-04T00:00Z` (= v2).
- (b) zile sintetice după 25.10 (EET):

| moment UTC | caz | Intl (v3) | UTC+3 fix (v2) |
|---|---|---|---|
| 2026-10-26 04:13 | sosire tur s1 06:13 | 06:13 · 26.10 · s1 | 07:13 · — (**în afara FER**, cursa pierdută) |
| 2026-10-26 12:45 | sosire tur s2 14:45 | 14:45 · s2 | 15:45 · s2 |
| 2026-10-26 22:15 | plecare retur s2 00:15 | 00:15 · ziua 26.10 · s2 | 01:15 · 26.10 · s2 |
| 2026-10-27 00:50 | 02:50 EET | ziua de lucru **26.10** | 03:50 · **27.10** (ziua greșită) |
| 2026-12-28 04:15 | săpt. 53, 06:15 | 06:15 · s1 | 07:15 · — |
- (c) noaptea de 25.10 (Moldova: 03:00 EEST → 02:00 EET, la 00:00 UTC — nu 04:00 ca în UE): 02:30 EEST și 02:30 EET cad ambele în ziua de lucru 24.10; 03:30 EET → 25.10.
  **Notă pentru verificator:** `drax.mjs:63` și `economie/comun.mjs:47` folosesc `ziLocala(t − 3 h)`, care pune ora 02:00–02:59 EET din noaptea de 25.10 în ziua nouă; `timp.mjs` o pune pe ceasul local. O oră pe an; de aliniat într-o direcție (propunere în întrebări, pt. sesiune).

## Pct. 2 — regimul: alternanță de la ancoră

`schimburi.mjs`: faza săptămânii = `fazaSapt(luni)` = paritatea numărului de săptămâni de la **ancora luni 21.09.2026** (faza A); B = celelalte.
Regula de majoritate, pragurile (0,6 / 0,7 / 0,8) și tie-break-ul (`p0 >= p1 → pare` devine `pB >= pA → B`) sunt neschimbate.
Cheile ieșirilor: `schimburi-ideal.json` `par` → `faza` (+ `ancora`), `gps/ideal.{impare,pare}` → `{A,B}`, fiecare săptămână are `faza` (și `iso`
ca etichetă); `care-schimb-ideal.json` `{impare,pare}` → `{ancora, A, B}` — deci controlul W53 al verificatorului (`drax.mjs:197`, blocant la
`CSC.impare || CSC.pare` după 21.12) nu mai are ce prinde. `pagina.mjs`: «săptămânile ISO impare/pare» → «faza A/B» cu datele.

**Proba 2** (`proba/cod/proba-faza.mjs`):
- (a) 62 de linii: v3 = v2 după maparea impare → A, pare → B pe regim, fază, gps, ideal, dupăAct, cnt, ore și fiecare săptămână — **0 diferențe** (P1);
  `care-schimb` identic după mapare; chei `impare/pare` rămase: nu. (În P2 lipsește doar R7 Slobozia*, al cărei «ambele» venea din salturi — pct. 3.)
- (b) trecerea anului: 30.11 ISO 49 → A · 07.12 50 → B · 14.12 51 → A · 21.12 52 → B · **28.12 53 impară → A · 04.01.2027 ISO 1 impară → B** · 11.01 2 → A.
  Paritatea ISO dă două săptămâni «impare» la rând (53, 1); faza alternează.
- (c) linie D sintetică cu rotație strictă 23.11.2026 → 25.01.2027: consistența pe fază **1,00 → rotatie**; pe paritatea ISO **0,60 → rotatie-neregulata**.

## Pct. 3 — salturile poartă → altă poartă

`etalon.mjs`: deplasarea cu `dinP && spreP`, `pIn ≠ pOut`, `km ≤ 5` (exact `eSalt` din verificator, `SALT_KM` 5) nu se mai atribuie nicio linii.
Rezultat: **7.731 salturi** neatribuite; observații din salturi 139 (toate R7 Slobozia*) → **0**. R7 Slobozia*: 237 → 98 observații (rămân cursele
reale ale lui 386PKP). Buclele scurte pe ACEEAȘI poartă ≤ 5 km: 63, niciuna cu rută (nimic de făcut). Km/zi: 0 (Slobozia* n-are ideal).
Efect secundar: R7 Slobozia* dispare din `schimburi-ideal.json` (62 → 61 linii): regimul ei «ambele» era făcut din salturi.

## Pct. 4 — cheia din `alege.mjs`

`obs` pe `m|t0` → `m|dev|t0|sens` (+ index `m|t0|sens` pentru candidatele v2 fără `dev`, cu numărarea ambiguităților); `etalon.mjs` pune `dev` în
`cand.tur/retur`, `schelet.mjs` îl păstrează pe candidatele noi. Măsurat: **coliziuni `m|t0` = 0** pe fereastra de azi (la cursa rt doar un picior
cade în FER, celălalt n-are schimb, deci nu intră în `obs`), căutări ambigue 0, ziua aleasă identică pe toate liniile. Corecție preventivă, efect 0.

## Pct. 5 — dedup ±3 min doar pe aceeași mașină

`etalon.mjs` `tureZi`: condiția `q.m === p.m` adăugată. Efect: **o singură linie**, R32 Trifanesti, ture/zi 2 → **4** (146BRAZ și 518MHD pleacă
de la poartă la același minut, pe ambele schimburi). Card 42,3 (vechi, cu steag) × 4 → km/zi 169,2 → **338,4 (+169,2)**. Toate celelalte linii: identic.
**Atenție pentru verificator:** `etalon-gps.mjs:68` deduplică implicit ÎNTRE mașini (`faraDedupIntreMasini = false`), deci verificatorul va vedea
ture/zi GPS 2 pe Trifanesti față de 4 în schelet. Cu `true` dă 4 (= v3). Trebuie aliniat înainte de verificarea 3 (întrebare pt. sesiune).

## Totaluri (P2, `compara-v2-v3.md`)

- km/zi card (fără informative): **5.765,6 → 5.934,8** (+169,2, tot Trifanesti).
- km/zi GPS completat (2 × etalon × ture/zi GPS, linii din act): cu dedup între mașini 5.818,4 → 5.818,4; doar aceeași mașină 5.983,2 → 5.983,2
  (observațiile liniilor din act nu s-au schimbat; diferența de 164,8 între cele două e doar Trifanesti).
- Observații cu rută: 13.672 → 13.533 (−139, salturile).
