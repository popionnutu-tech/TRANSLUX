# Stările camioanelor și ale curselor — automatizare maximală din GPS + TLX

Autor: sesiune de discovery, 10.09.2026. Sursa cerinței: Ion (proprietar TRANSLUX).
Stare: **decizii luate cu Ion; rămâne deschis doar setul de praguri numerice (§8) și
patru puncte de detaliu (§9).**

---

## 1. Ce a cerut Ion (cuvânt cu cuvânt, 10.09.2026)

> «hai sa punem starile maximal automatizat, daca auto pleaca la berdicev si e acolo -
> biodiesel incarcare, apoi pleaca la descarcare biodiesel. 2. Dupa biodiesle practic
> intodeauna auto pe retur se incarca cu diesel, daca trece prin punctele incarcare
> diesel - automat se intorc cu diesel inapoi. 3. Auto sunt incarcate pina ele nu se
> descarca conform softului tlx sau pina nu ajung la baza la briceni (acolo baza
> petroliera mare). 4. auto biodiesel care trec prin ungheni - auto pleaca prin zona
> economica libera la schimbare acte ca sa poata pleca spre bulgari (nu e diesel).»

Context imediat, aceeași zi:

- Despre KWX620: «este la încărcare diesel» — camionul stătea la Petromidia, cursa era
  încă «planificată», ecranul îl arăta liber.
- Despre MOW214: «a fost el la berdicev», «eu nu spun ca nu a fost». **Nu există
  contradicție între Ion și GPS.** Ce era greșit era ecranul, nu datele.

**Problema, într-o frază:** dispecerul nu apasă butoanele, deci starea din bază rămâne
«planificată» zile la rând, iar mini app-ul arată «liber» un camion care e plin și în
drum spre Bulgaria.

---

## 2. Fapte verificate pe viu (10.09.2026, Supabase `zqkzqpfdymddsywxjxow`)

Nimic din secțiunea asta nu e presupunere. Fiecare rând a fost interogat.

### 2.1 Automatul existent nu a pornit niciodată — și nu putea

```
status         status_source   n
anulata        manual          1
planificata    manual         10
spre_incarcare manual          2
```

**Toate cele 13 curse din istoric sunt `manual`.** Niciuna nu a ajuns vreodată la
`la_incarcare`, `spre_descarcare`, `la_descarcare` sau `incheiata`.

Asta nu e o coincidență, e o consecință structurală: `trip-auto.mjs` pornește regula
GPS doar din `STARI_GPS_LA_DESCARCARE = ['la_incarcare','asteapta_descarcare','spre_descarcare']`,
iar regula TLX din aceleași plus `la_descarcare`. **Toate pornesc dintr-o stare pe care
nimeni nu o pune vreodată.** Automatul din 08.09 e cod mort în producție: nu e stricat,
e de neatins.

> Concluzie de proiectare: veriga lipsă nu e «la descărcare», ci **«la încărcare»**.
> Fără ea, tot lanțul rămâne mort, oricâte reguli noi adăugăm.

### 2.2 Cursele se introduc retroactiv — datele planificate sunt decorative

Toate cele 13 curse au fost create pe **09.09 și 10.09**, de `camioane@translux.md`,
pentru încărcări din **01.09–09.09**. Orele sunt uniform `04:00` (încărcare) și `11:00`
(descărcare) — valori implicite de formular, nu planuri reale.

| plate | cargo | load_planned_at | created_at |
|---|---|---|---|
| GHT553 | diesel | 01.09 04:00 | 09.09 12:49 |
| HMK135 | biodiesel | 02.09 04:00 | 09.09 12:18 |
| MOW214 | biodiesel | 05.09 04:00 | 09.09 12:55 |
| KWX620 | diesel | 09.09 04:00 | 09.09 12:36 |

**Impact direct:** fereastra de potrivire TLX din `deciziaTlx` este
`load_planned_at − 1h … unload_planned_at + 3 zile`. Construită pe ore inventate, ea
acceptă sau respinge recepții aproape la întâmplare. **Regula TLX nu se mai leagă de
`unload_planned_at`** — vezi decizia D9.

Alte semne de date libere: `LJN075` are punct de încărcare = punct de descărcare
(ambele «TLX Ungheni»), cargo «alta»; `RWN169` are text liber «el amu la Romanie».

### 2.3 `lde_gps_stops.dwell_min` NU e durata reală a staționării

Importatorul de noapte taie fiecare oprire la granița zilei (≈21:00 UTC = miezul nopții
Chișinău). O staționare de 6 zile apare ca 6 rânduri de ~1437 min, la aceleași
coordonate, cu `departure_at 20:5x` / `arrival_at 21:0x`.

Exemplu real, HMK135 la Berdichev:

```
18.08 16:49 → 18.08 20:58   249 min
18.08 21:02 → 19.08 09:10   728 min
19.08 12:57 → 19.08 20:56   479 min
19.08 21:00 → 20.08 20:57  1437 min
20.08 21:01 → 21.08 20:59  1438 min
...  (până 24.08 11:51)
```

Real: **~6 zile neîntrerupte.**

Tăierea doar **micșorează** dwell-ul pe rând, deci pragurile pot rata încărcări reale:
un camion sosit la 20:40 UTC și plecat la 21:40 (60 min reali) apare ca 20 min + 40 min,
ambele sub prag. **Rândurile consecutive la aceleași coordonate trebuie unite peste
granița zilei înainte de a aplica orice prag de scriere.** Cu cât pragul e mai mare
(120 min pentru încărcare), cu atât rateul e mai probabil.

### 2.4 Razele punctelor — recomandarea inițială era GREȘITĂ, corectată de răspunsul lui Ion

Prima analiză a arătat că TLX Ungheni prinde doar 88 din 977 de opriri lungi din raza de
2 km și a propus mărirea razei la 700 m. **Răspunsul lui Ion la Î5 a infirmat asta:**
clusterul lipsă *este* parcarea ZEL, nu stația.

Verificare țintită pe cele trei stații suspecte (opriri ≥30 min, 90 de zile):

| stație | cluster | distanță | camioane | dwell mediu | citire |
|---|---|---|---|---|---|
| **TLX Ungheni** | 47.2193, 27.8028 | **36–39 m** | 3 | 830–991 min | la stație (staționare lungă) |
| TLX Ungheni | 47.2229, 27.8018 | **445–480 m** | 12 | 43–77 min | **parcarea ZEL** (Ion, Î5) |
| **TLX Orhei** | 47.3874, 28.8123 | **55–63 m** | 3 | 166–336 min | la stație |
| TLX Orhei | 47.3859, 28.8015 | **770–800 m** | 16–18 | **38–51 min** | ⚠️ vezi Î-D §9 |
| **TLX Bălți** | 47.7561, 27.8904 | **948–994 m** | 1–3 | 182–622 min | parcare (dwell lung, puține camioane) |

**Decizia: razele stațiilor TLX rămân 300 m.** Ele exclud corect parcările. Ce părea o
gaură de acoperire era, de fapt, filtrul funcționând.

Singura excepție de lămurit: clusterul TLX Orhei de la ~780 m are profilul unei
descărcări reale (16–18 camioane, 38–51 min — exact durata unei descărcări), nu al unei
parcări. Ori coordonata punctului e deplasată cu ~780 m, ori e o a doua rampă. → §9.

Razele corecte, care saturează: Berdichev 800 m, Constanța 1500 m, Petromidia 1200 m.

### 2.5 Punctul 50.61, 27.59 — identificat de Ion ca tranzit

```
lat 50.61, lon 27.59 — 18 opriri lungi, 9 camioane, 7796 min total (medie 7,2 h)
plăci: ANT347, HMK135, HMK139, IIC263, LJN076, LJN080, LML973, MOW214, RWN193
perioada: 05.07 → 07.09
```

**Toate cele 9 camioane de biodiesel trec pe acolo**, ~105 km NV de Berdichev (zona
Korec / Novohrad-Volînskî). Ion (Î2): **«Vamă / acte / terminal».**

Deci **nu e încărcare**, iar regula 1 a lui Ion — «pleacă de la Berdichev = încărcat» —
**rămâne valabilă**. Punctul intră în nomenclator ca `tranzit_acte` și nu schimbă starea.

### 2.6 Cazul MOW214 — exemplul pozitiv, reconstituit exact

| interval | loc | durată | citire |
|---|---|---|---|
| 05.09 15:51 → 07.09 02:13 | Berdichev (49.885, 28.544) | **~34 h** | încărcare biodiesel |
| — două ieșiri scurte la 9,6 km N | 49.94, 28.51 | 5 min, 2 min | manevre, **nu** plecare |
| 07.09 03:52 | 50.23, 28.67 | 17 min | în drum |
| 07.09 05:42 → 09:20 | **50.61, 27.59** | 218 min | tranzit/acte (§2.5) |
| 07.09 15:39 → 08.09 09:06 | 48.478, 27.770 (Otaci, partea UA) | **~16 h** | coadă la vamă |
| 08.09 13:27 → 09.09 20:41+ | **Bază Briceni** | **~31 h** | tranzit, **plin** |

Cursa lui în bază: `biodiesel`, Berdichev → **Ruse**, status `planificata`.

**Faptul care a modelat regula Briceni:** camionul a stat 31 de ore la Bază Briceni
**plin cu biodiesel, în tranzit spre Bulgaria**. Regula lui Ion citită literal —
«nu ajung la baza la briceni» — l-ar fi declarat descărcat. Ar fi fost greșit.

Briceni e **nodul de trecere al întregii flote**: 93 de camioane distincte, 15 158 de
opriri în 90 de zile, mediana 9 minute. → decizia D4.

Ieșirile de 9,6 km din timpul încărcării sunt motivul pentru care «a plecat» nu poate
însemna «a ieșit din rază» → pragul P2.

### 2.7 Durate tipice de staționare (mediana / p90), 90 de zile

| punct | mediana | p90 | camioane |
|---|---|---|---|
| Bază Berdichev | **312 min (5,2 h)** | 1061 min | 9 |
| Port Constanța | 83 min | 1003 min | 17 |
| Petromidia | 29 min | 610 min | 9 |
| TLX Ungheni | 23 min | 57 min | 28 |
| TLX Orhei | 24 min | 52 min | 47 |
| Bază Briceni | 9 min | 304 min | 93 |

(cifre pe rânduri neunite — vezi §2.3; valorile reale la Berdichev sunt mai mari)

### 2.8 Ce face codul de azi

| componentă | face | nu face |
|---|---|---|
| `lde-geo-worker/trip-auto.mjs` | GPS → `la_descarcare`; TLX `fuel_receipts` → `incheiata` | nu pune `la_incarcare`, nu creează curse, nu detectează plecarea |
| migr. 329 | `status_source`, `status_changed_at`, `unload_seen_at`, `tlx_receipt_*` | nimic pentru încărcare |
| `banda.ts::fazaCamion` + `oprireaDeIncarcare` (commit **ae5d4a8**, azi) | mini app: cursa «planificată» al cărei camion a stat **≥60 min** (`OPRIRE_INCARCARE_MIN`) la punctul de încărcare **și a plecat** apare «în drum · după GPS»; camionul care stă la descărcare fără să fi trecut pe la încărcare rămâne liber | **doar citire, nu scrie în bază**; opririle vin din `lde_gps_stops` pe 10 zile și **rândurile NU sunt unite** (§2.3) |
| `lde_dispatch_points` | name, country, lat, lng, radius_m, active | **nu are coloană de tip** |

`fuel_receipts` stă în **alt proiect Supabase** (`TLX_SUPABASE_URL`), nu în cel al
TRANSLUX — nu am putut interoga coloanele direct. Din `trip-live-worker.mjs:105`
workerul selectează deja `id, station_id, nr_auto, volume, unloaded_at, created_at,
is_deleted`, iar `momentulReceptiei` preferă `unloaded_at` și cade pe `created_at`.
Pentru D9, `unloaded_at` = **data descărcării din document**, `created_at` = **momentul
introducerii bonului**. → §9 pentru confirmarea semanticii pe baza TLX.

---

## 3. Mașina de stări țintă

Stările rămân cele din `TRIP_FLOW`. Ce se schimbă e **cine apasă**.

| din → în | dovada automată | sursă | manual rămâne? |
|---|---|---|---|
| *(fără cursă)* → `planificata` + `la_incarcare` | camion `cisterna` staționat ≥ **P1(kind)** la un punct `incarcare_*`, fără cursă deschisă → **se creează cursa** (D1) | `gps` | da |
| `planificata` → `la_incarcare` | staționat ≥ **P1(kind)** în raza punctului de încărcare al cursei | `gps` | da |
| `la_incarcare` → `spre_descarcare` | a ieșit din rază, s-a depărtat ≥ **P2** km și nu s-a întors **P3** min | `gps` | da |
| `spre_descarcare` → `la_descarcare` | staționat ≥ 15 min în raza unui punct **al cărui `kind` se potrivește cu marfa** (D4) | `gps` | da |
| `spre_descarcare` → `asteapta_descarcare` | diesel/benzină staționat ≥ prag la un punct `kind='baza'` — la bază cisterna e **plină** până apare bonul TLX (D10, 10.09 seara) | `gps` | da |
| `la_descarcare` / `asteapta_descarcare` → `incheiata` | recepție `fuel_receipts` potrivită pe **data descărcării** (D9) | `tlx` | da |
| orice altă → `asteapta_descarcare` | — | — | manual |
| orice → `anulata` | — | — | **doar manual** |

Principii care nu se negociază:

1. **Manualul bate automatul.** Câmp atins de dispecer → `status_source='manual'` →
   automatul nu-l mai suprascrie. Coloana există (migr. 329).
2. **Automatul nu ia butoane.** Orice tranziție automată se poate face și cu mâna.
3. **Automatul nu sare peste etape** (`TRANZITII`).
4. **Doar cisternele.** `fleet_type='cisterna'` e condiție pentru orice regulă (D6).
5. **Fiecare stare automată se explică pe ecran** (`descriereSursaStare`).

---

## 4. Deciziile luate cu Ion (10.09.2026)

### D1 — Automatul CREEAZĂ cursa

> Ion: «creaza cursa, iar ulterior daca are mai multe date - schimba cursa».

Camion `cisterna` fără cursă deschisă, staționat ≥ P1 la un punct `incarcare_*` →
se scrie o cursă nouă, direct (**nu** schiță cu buton de confirmare), completată progresiv:

| câmp | la creare | completat ulterior |
|---|---|---|
| `cargo` | din `kind`-ul punctului (`incarcare_biodiesel` → `biodiesel`) | — |
| `load_point_id` | punctul unde stă | — |
| `load_planned_at` | momentul sosirii (din GPS) | — |
| `unload_point_id` | **gol** | din GPS (oprire ≥ prag la punct potrivit) sau din bonul TLX |
| `client` | **«Statii TLX»** (implicit) | dispecerul |
| `status` | `la_incarcare` | — |
| `status_source` | `gps` | `manual` la prima corectură |
| `created_by` | `auto:gps` | — |

Dispecerul poate corecta oricând; corectura îngheață câmpul față de automat.

### D2 — Punctul 50.61, 27.59 = tranzit

> Ion: «Vamă / acte / terminal».

`kind = 'tranzit_acte'`, nu schimbă starea. Nume propus: **«Vamă/terminal nord Berdichev»**
(de confirmat — §9). Regula «pleacă de la Berdichev = încărcat» **rămâne valabilă**.

### D3 — Regula 2: returul cu diesel se creează automat

> Ion: «Da, cu descărcarea dedusă din GPS mai târziu».

Oprire ≥ P1 la un punct `incarcare_diesel` (Constanța, Petromidia), după o cursă de
biodiesel încheiată **sau** cu camionul gol → **cursa 2 «diesel»**, `unload_point_id`
gol. Se completează când camionul stă ≥ prag la un punct `descarcare_diesel`/`baza`,
sau când apare bonul TLX.

### D4 — Regula 3: descărcarea cere potrivire marfă ↔ tip de punct

> Ion: «noi avem rar incarcari biodiesel care vin in moldova la chisinau si la briceni,
> vezi cum sa facem aici mai bine».

Propunere acceptată:

> Descărcarea automată la un punct se face **doar dacă marfa cursei se potrivește cu
> tipul punctului** (`diesel` → `descarcare_diesel`/`baza`; `biodiesel` →
> `descarcare_biodiesel`) **SAU** punctul e cel pus explicit pe cursă ca `unload_point_id`.

Consecințe:
- **Briceni** = `kind 'baza'`, valabil ca descărcare **doar pentru diesel**, cu prag lung
  (≥120 min staționat).
- **Biodieselul la Briceni / Chișinău este tranzit** — cazul MOW214 (§2.6) nu mai
  declanșează nimic — *afară de cazul* în care dispecerul a pus explicit acel punct ca
  descărcare pe cursă.
- **Bonul TLX închide oricum**, independent de potrivirea de mai sus.

Bonus: potrivirea marfă↔tip rezolvă și riscul ZEL Ungheni (D5) — o cursă de biodiesel
nu poate fi «descărcată» la un punct `descarcare_diesel`, oricât s-ar suprapune razele.

### D5 — ZEL Ungheni = parcarea de lângă stație

> Ion: «E parcarea de lângă stația TLX Ungheni».

Clusterul 47.2229, 27.8018 (445–480 m de stație, 12 camioane, 43–77 min) **este** zona
economică liberă. Punct nou, `kind='tranzit_acte'`, rază ~300 m. Nu schimbă starea;
scena spune «la acte, ZEL Ungheni».

**Raza stației TLX Ungheni NU se mărește** — ar înghiți parcarea și ar arăta biodieselul
în tranzit ca fiind «la descărcare» (§2.4).

### D6 — Doar cisternele

> Ion: «Doar cisternele deocamdată».

`fleet_type='cisterna'` e condiție obligatorie pentru orice regulă automată. Zernovozul
rămâne integral manual.

### D7 — Alertele merg la dispecerul de camioane, în privat

> Ion: «Dispecerul camioane» — pe Telegram, **nu** Ion, **nu** grupa.

| alertă | prag |
|---|---|
| camion plin plecat în altă direcție | la detectare |
| oprit nicăieri cunoscut | **> 12 h** |
| `la_descarcare` fără bon TLX | **> 6 h** |
| bon TLX fără urmă GPS la acea stație | la detectare (D9) |

### D10 — La bază cisterna e plină până apare bonul TLX (10.09, seara)

> Ion, despre ANT344 venit din Constanța și parcat la Bacioi, arătat «liber»: «dacă
> auto a venit de la România și nu a apărut încă descărcat în TLX și stă la bază —
> starea este încărcat». Și: «zernovoazele nu au nimic comun cu diesel și biodiesel»,
> «doar cisternele se aplică la regula asta».

Regula: cisterna cu **diesel/benzină** care stă ≥ prag la un punct `kind='baza'` trece
în `asteapta_descarcare` («plin, așteaptă descărcarea»), nu în `la_descarcare` —
descărcarea la bază o dovedește **doar bonul TLX**, care închide cursa și din starea
asta (`STARI_TLX_INCHEIATA`). Biodieselul n-are bon TLX: cu baza pusă explicit pe cursă
rămâne `la_descarcare` (D4). Bazele din Chișinău (Bacioi, Meșterul Manole) devin
`kind='baza'` (migr. 337) — erau `descarcare_diesel` și automatul le trata ca stații.

Tot atunci, două scăpări reparate:
- automatul **nu consulta istoricul opririlor** când camionul stătea la un punct care nu
  e de încărcare (ANT344 la Bacioi cu cursa «planificată» din Constanța) — acum
  istoricul se citește oriunde ar sta;
- ruta mini app-ului **nu mai citea cursa deschisă** a cărei oră de descărcare trecuse
  (ANT344, plan 03–09.09, ecranul din 10.09) — acum cursa deschisă intră oricând.

### D11 — Locul de încărcare scris liber: planul e martorul (10.09, seara)

> Ion, despre RWN169 (zernovoz) în România, cu cursa «Santier Nutu Ivanovici → el amu la
> Romanie», arătat «liber»: «cum poate fi el liber???».

Când punctul de încărcare n-are coordonate (text liber), GPS-ul n-are cu ce compara —
nu poate nici confirma, nici infirma încărcarea. Atunci cursa «planificată» cu ora de
încărcare trecută se arată **«în drum, după plan»** în mini app; starea din bază nu se
schimbă (zernovozul rămâne manual, D6).

### D9 — Bonul TLX se potrivește pe DATA DESCĂRCĂRII, nu pe momentul introducerii

> Ion: «noi ne uitam dupa data descarcare, ca bonul receptie poate sa fie introdus azi
> pe daunazi».

- Potrivirea bon ↔ cursă se face pe **`unloaded_at`** (data documentului), niciodată pe
  `created_at`. Se caută oprirea GPS la acea stație **în acea zi (±1 zi)**.
- Cursa se închide cu **`unload_actual_at` = data din bon**.
- Dacă GPS-ul nu are camionul la acea stație în acea zi, **cursa se închide oricum**,
  dar pleacă alertă: «bon la Orhei, GPS la Bălți pe 08.09».
- **Fereastra nu se mai leagă de `unload_planned_at`** (§2.2).
- **Fereastra începe de la plecarea REALĂ de la încărcare** (11.09, KYK742): `load_planned_at`
  e și el scris retroactiv (§2.2). Cursa KYK742 avea încărcarea «04.09», camionul a încărcat de
  fapt la Petromidia pe 06.09 (451 min, plecat 13:49), iar bonul din 05.09 — descărcarea marfei
  PRECEDENTE — a închis-o singur; dispecerul: «он не разгрузился, стоит в Бачой». Regula:
  dacă istoricul opririlor (`lde_gps_stops`, 30 de zile, ≥ 60 min, în raza punctului de
  încărcare) arată când a plecat camionul de acolo, bonul trebuie să fie mai nou decât
  plecarea (`plecareaDeLaIncarcare`); fără istoric rămâne `load_planned_at − 1h`.

---

## 5. Punctele și tipurile lor

Coloană nouă `kind` pe `lde_dispatch_points`:

`incarcare_biodiesel` · `descarcare_biodiesel` · `incarcare_diesel` ·
`descarcare_diesel` · `baza` · `tranzit_acte` · `vama` · `parcare`

| punct | țară | rază | `kind` |
|---|---|---|---|
| Bază Berdichev — încărcare biodiesel | Ucraina | 800 (ok) | `incarcare_biodiesel` |
| Ruse / Sofia — descărcare biodiesel | Bulgaria | 2000 | `descarcare_biodiesel` |
| Port Constanța — încărcare diesel | România | 1500 (ok) | `incarcare_diesel` |
| Rafinăria Petromidia — Năvodari | România | 1200 (ok) | `incarcare_diesel` |
| TLX Ungheni / Orhei / Bălți / Sîngerei / Peresecina / Petricani | Moldova | **300 — NU se schimbă** (§2.4) | `descarcare_diesel` |
| Bază Briceni | Moldova | 800 | `baza` |
| Bază Bălți | Moldova | 600 | `baza` |
| Bază Chișinău — Bacioi / Meșterul Manole | Moldova | 500 | `baza` (migr. 337, D10; erau `descarcare_diesel`) |

**Puncte noi:**

| punct | coordonate | `kind` | rază | temei |
|---|---|---|---|---|
| Vamă/terminal nord Berdichev *(nume de confirmat)* | 50.61, 27.59 | `tranzit_acte` | 1500 | D2 — 9/9 camioane, 7,2 h |
| ZEL Ungheni | 47.2229, 27.8018 | `tranzit_acte` | 300 | D5 |
| Vama Otaci (partea UA) | 48.478, 27.770 | `vama` | 1000 | MOW214 16 h; HMK135 2 zile |
| Vama Giurgiulești | 45.470, 28.190 | `vama` | 1000 | MOW214 04.09, ~8 h |

---

## 6. Cazurile-limită

| caz | ce face sistemul |
|---|---|
| Camion la punct de încărcare fără cursă (KWX620) | **creează cursa** (D1) |
| Camion plin parcat la Briceni în tranzit (MOW214) | nimic — marfa `biodiesel` nu se potrivește cu `kind='baza'` (D4) |
| Camion la ZEL Ungheni | scena «la acte, ZEL Ungheni»; starea nu se schimbă (D5) |
| Bon TLX introdus peste 2 zile | se potrivește pe `unloaded_at`, nu pe `created_at` (D9) |
| Bon TLX fără urmă GPS | cursa se închide + alertă la dispecer (D7, D9) |
| Cisternă cu diesel parcată la bază (ANT344, Bacioi) | `asteapta_descarcare` — plină până apare bonul TLX (D10); bonul închide |
| Bon TLX inexistent (descărcare la stație) | rămâne `la_descarcare`; alertă după 6 h; închide dispecerul |
| Cursă cu locul de încărcare scris liber (RWN169) | mini app: «în drum, după plan» după ora de încărcare (D11); starea nu se schimbă |
| Descărcare biodiesel la Ruse/Sofia | GPS pune `la_descarcare`; **închiderea rămâne manuală** — nu există bonuri TLX în Bulgaria |
| Poziție GPS veche (>30 min) | automatul nu decide nimic (regulă existentă) |
| Oprire la `vama` / `tranzit_acte` | nu schimbă starea; se afișează ca scenă |
| Automatul a greșit | dispecerul apasă corect → `status_source='manual'` → îngheață; istoric în `lde_audit_log` |
| Reparație / odihnă | manuale, bat orice stare de cursă |
| Zernovoz | exclus complet (D6) |
| Aceeași recepție pentru două curse | imposibil — index unic pe `tlx_receipt_id` |

---

## 7. Ce NU se automatizează și de ce

| nu se automatizează | de ce |
|---|---|
| `asteapta_descarcare` la client | doar omul știe că clientul nu primește marfa (la BAZĂ o pune automatul — D10) |
| `anulata` + motivul | decizie comercială |
| Reparație / odihnă | GPS-ul nu distinge un camion stricat de unul care așteaptă |
| Închiderea descărcărilor de biodiesel (Bulgaria) | nu există bon TLX acolo |
| `fleet_type` zernovoz → cisterna | conflict de spus omului (`planCisterneDinTlx`) |
| Zernovoz, integral | D6 |

---

## 8. Praguri — SINGURA decizie rămasă (Î8)

Un prag unic nu merge: Berdichev are mediana 5,2 h, Petromidia 29 min (§2.7).
Pragurile sunt **pe `kind`**, aplicate pe **opriri unite** (§2.3).

| cod | ce | propunere | temei | încredere |
|---|---|---|---|---|
| P1 `incarcare_biodiesel` | staționare = încărcat | **120 min** | mediana Berdichev 312 min; nicio trecere scurtă nu se apropie | mare |
| P1 `incarcare_diesel` | staționare = încărcat | **45 min** | mediana Constanța 83 / Petromidia 29 min | **mică** — vezi mai jos |
| P1 `baza` (Briceni, doar diesel) | staționare = descărcat | **120 min** | mediana Briceni 9 min separă curat tranzitul | mare |
| P2 | depărtare = a plecat | **15 km** | ieșirile MOW214 la 9,6 km erau manevre (§2.6) | mare |
| P3 | fără întoarcere | **60 min** | | medie |
| — | `descarcare_diesel` confirmare | **15 min** (neschimbat) | descărcare reală 20–60 min | mare |
| — | viteză «stă» | 5,6 km/h (neschimbat) | | — |
| — | prospețime poziție | 30 min (neschimbat) | | — |

**P1 pentru diesel e pragul slab.** Petromidia are mediana 29 min, deci 45 min taie
aproape jumătate din opriri; 25 min ar prinde mai multe, dar riscă să confunde o coadă
la poartă cu o încărcare. Recomand pornirea la **45 min în mod „doar alertă"** (automatul
propune, nu scrie) timp de o săptămână, apoi calibrare pe cazurile reale.

Reamintire: cu opriri **neunite**, un prag de 120 min ratează orice încărcare tăiată de
miezul nopții — de aceea unirea (Faza 0) precede pragurile.

---

## 9. Rămâne de lămurit (patru detalii, nu blochează Faza 0)

1. **Numele punctului 50.61, 27.59** — «Vamă/terminal nord Berdichev» e propunerea mea;
   Ion l-a descris ca «Vamă / acte / terminal».
2. **Clusterul TLX Orhei de la ~780 m** (16–18 camioane, 38–51 min, §2.4): coordonata
   punctului e deplasată, sau e o a doua rampă? De verificat față de coordonatele stației
   din tabela `stations` a bazei TLX.
3. **Semantica `fuel_receipts.unloaded_at`** — de confirmat pe baza TLX
   (`TLX_SUPABASE_URL`, alt proiect, neinterogabil din sesiunea asta) că e într-adevăr
   data documentului și că e completată constant; dacă e des `null`, D9 are nevoie de o
   a doua coloană.
4. **Ce înseamnă „camion gol"** pentru declanșarea D3 — ultima cursă `incheiata`, sau și
   o cursă abandonată în `la_descarcare`?

---

## 10. Fazele de implementare

**Faza 0 — reparațiile care fac automatul posibil**
- migrație: `kind` pe `lde_dispatch_points` + completarea celor 15 puncte (§5)
- migrație: cele 4 puncte noi (§5)
- `lde-geo-worker`: **unirea opririlor tăiate la granița zilei** (§2.3), cu teste pe
  cazul HMK135 18–24.08
- ⚠️ razele TLX **nu** se ating (§2.4)

**Faza 1 — veriga lipsă: `→ la_incarcare`**
- `deciziaGpsIncarcare` în `trip-auto.mjs`, praguri pe `kind`, filtru `fleet_type='cisterna'`
- migrație: `load_seen_at`, `load_left_at` (simetric cu `unload_seen_at`)
- teste pe MOW214 și KWX620

**Faza 2 — `la_incarcare → spre_descarcare`** (P2/P3, cu grija manevrelor de 9,6 km)

**Faza 3 — descărcarea cu potrivire marfă↔`kind`** (D4) + TLX pe `unloaded_at` (D9),
rupt de `unload_planned_at`

**Faza 4 — crearea automată a cursei** (D1) și returul cu diesel (D3) — ultimele,
fiindcă sunt singurele care *creează* date

**Faza 5 — ecrane**: `BandaClient.tsx` insignă «pusă automat» + motivul; mini app
citește starea reală în loc s-o deducă (`fazaCamion` devine redundant pentru cursele
scrise de automat)

**Faza 6 — alerte** (D7) în privat la dispecerul de camioane

---

## 11. Ce trebuie corectat în afara acestui spec

- **Formularul de cursă**: `load_planned_at`/`unload_planned_at` primesc valori implicite
  (04:00 / 11:00) pe care codul le trata ca planuri reale (§2.2). După D9 automatul nu
  mai depinde de ele, dar rapoartele da.
- **`lde_gps_stops`**: merită o vedere materializată cu opririle unite (§2.3) — o vor
  folosi și rapoartele de km, nu doar automatul.
