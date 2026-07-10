# LDE — «Km de încredere»: verificare și corectare km GPS

**Data:** 2026-07-10
**Status:** validat pe date reale (teste: HMK139 camioane, flota SEBN_ORHEI)

## Problema

GPS-ul „sare" și corupe km-ul zilnic (`lde_vehicle_gps_daily.km_total`), care alimentează
salarii, indicații DT, alerte, tablou zilnic, experimente și acte. Trebuie să putem
**verifica** zilele cu probleme și să punem **km-ul real**, fără ca worker-ul nocturn
să suprascrie corecția. Intervenția se face DOAR la mașinile/zilele cu probleme —
zilele curate rămân neatinse.

## Constatări din teste (2026-07-09/10)

1. **km_check (Σ v×dt) e semnal secundar, nu arbitru** — pe HMK139 subestimează
   sistematic (dispozitiv cu viteză raportată defectă) → alarme false pe zile corecte
   (3 și 7 iulie erau bune, deși divergența era 41–42%).
2. **Linia dreaptă × coeficient dă alarme false** unde geografia forțează ocoluri
   (Constanța→Bârlad: GPS 291.5 km era CORECT — ruta reală prin podul Brăila e ~298 km,
   raport 1.67 față de linia dreaptă).
3. **Cârpirile actuale (leg_db) sunt în mare parte corecte** — 552BRAO: cârpirea de
   54 km pe un tronson „de 13.6 km" acoperea o gaură GPS de ~60 min în care mașina a
   făcut un tur-retur întreg. Verificarea corectă e **timp × viteza rutei**.
4. **Istoricul per mașină + sens funcționează excelent pe rute repetitive**
   (Orhei: 51–64 treceri curate pe tronson, interval strâns). Sensul contează
   (spre uzină prin sate 58.9 km, întors direct 50.5 km). Mediana generică din
   `lde_route_legs` pe nume de localitate e ambiguă (mai multe „Bucuria").
5. **Probleme reale confirmate:** (a) km fantomă la parcare — HMK139 parcat ~22h cu
   67.5 km numărați; cauza: praguri suprapuse MOVING_KMH=5.6 < STOP_KMH=7.4 în worker;
   (b) sub-numărare tăcută — 820GXP: tronsoane de 39.6 km apar cu 0.0 km, −1136 km
   pe 22 zile; nimic nu semnala.
6. **OSRM public cu `alternatives`** încadrează corect rutele lungi (223 / 307 km
   pentru Constanța→Bârlad; camionul: 291.5 km în 4.3h = varianta lungă). Pe VPS
   există **Valhalla instalat** cu harta OSM Moldova (are erori mici — acceptabil ca
   punct de control suplimentar, nu unic).

## Arhitectură

### 1. Stocare — migrația 226

(226, nu 223 — 223 e ocupat de două ori, 224/225 există deja.)

`lde_vehicle_gps_daily` primește:

- `km_manual numeric NULL` — km-ul real pus de operator; NU e atins de worker
- `km_manual_source text NULL` — `istoric | ruta | valhalla | osrm | foaie | odometru | manual`
- `verified_at timestamptz NULL`, `verified_by text NULL`, `verify_note text NULL`
- `km_final numeric GENERATED ALWAYS AS (COALESCE(km_manual, km_total)) STORED` —
  sursa unică de adevăr pentru toți consumatorii

`lde_gps_stops` primește:

- `km_expected numeric NULL` — km așteptați pe tronson (din ierarhia de verificare)
- `km_expected_source text NULL` — `istoric | valhalla | osrm`
- `suspect boolean NOT NULL DEFAULT false` — tronson în afara intervalului plauzibil
- index parțial pentru coada de verificare (fără el pagina face seq scan pe stops):
  `CREATE INDEX idx_lde_gps_stops_suspect ON lde_gps_stops (vehicle_id, date) WHERE suspect = true;`

Migrația se rulează ÎN AFARA ferestrei worker-ului nocturn (nu la 03:00) — coloana
generată STORED rescrie tabelul sub AccessExclusiveLock (milisecunde la volumul
actual, dar nu peste upsert).

Worker-ul continuă să facă upsert doar pe coloanele lui (`km_total`, `km_patched`,
`km_check`, `gps_points`, …) — corecția manuală supraviețuiește oricărui re-rulaj.

**Tabel nou de cache rutier** — `lde_route_leg_cache` (NU refolosim `lde_route_legs`,
care are `UNIQUE(from_locality, to_locality)` pe nume text — exact ambiguitatea
„mai multe Bucuria" pe care o evităm; schema lui rămâne neatinsă pentru puntea veche):

- capete pe coordonate rotunjite (`from_lat`, `from_lon`, `to_lat`, `to_lon`,
  rotunjite la ~0.005°) — ordinea capetelor ÎN cheie = sensul (nu e nevoie de coloană
  separată de sens, nici în stops: perechea ordonată de coordonate o codifică)
- `km_routed numeric`, `source text` (`valhalla | osrm`), `km_min`/`km_max`
  (alternativele OSRM), `computed_at`
- `UNIQUE (from_lat, from_lon, to_lat, to_lon)`

Când operatorul pune `km_manual`, action-ul setează și `data_source = 'manual'` pe
rândul zilei (câmpul există din migrația 205, azi write-only) — provenанța nu se
bifurcă între două câmpuri.

**Flag de încredere per dispozitiv:** `vehicles` primește
`gps_speed_unreliable boolean NOT NULL DEFAULT false` (ex. HMK139 — viteza raportată
defectă → km_check ignorat la detecție pentru mașina respectivă).

### 2. Workerii (VPS) — detecție și verificare la sursă

**AMBII workeri se modifică** — `gps-worker.mjs` (flota Gonets: uzine, interurban)
ȘI `wialon-worker.mjs` (camioanele ACTROS — exact flota testelor). Logica comună
(regula asimetrică, ierarhia punții, fix-ul parcării) stă într-un modul partajat
`packages/db/src/lde-km-verify.ts` (pure functions + teste), importat de amândoi.

**Fix km fantomă la parcare:** în interiorul unui cluster de oprire detectat,
segmentele nu acumulează km (elimină suprapunerea 5.6–7.4 km/h).

**Ierarhia punții la sărituri/găuri (înlocuiește leg_db→linie dreaptă):**

1. **Istoricul mașinii** — mediana `km_from_prev` pe același tronson, potrivit pe
   **coordonate** (nu nume) + **sens**, doar treceri cu sursă `gps` curată, min. 5 treceri
2. **Valhalla local** (VPS, harta Moldova) — distanța rutieră între capete
3. **OSRM public** cu alternative — pentru capete în afara Moldovei (camioane)
4. `lde_route_legs` / linie dreaptă — ultim resort, marcat ca atare

**Verificarea fiecărui tronson (regula principală, validată + rafinată pe testul
Orhei 09.07):** regula e ASIMETRICĂ —

1. dacă km-ul coincide cu mediana istorică a tronsonului (±25%) → OK, indiferent de
   durată (mașina poate merge mai încet — caz 820GXP: 19.5 km = mediana, 43 min vs 20)
2. altfel, durata e plafon de plauzibilitate: `km ≤ viteza_max_rutei × durata` și
   `km ≥ viteza_min × durata` pentru tronsoanele cârpite peste găuri (caz 552BRAO:
   54 km / 60 min = 51 km/h → plauzibil)
3. fără istoric → interval [min(alternativele rutiere) × 0.9, max × 1.1]

În afara intervalului → `suspect = true` + `km_expected`.

**Performanță worker (obligatoriu):** medianele istorice se PREÎNCARCĂ o singură dată
la pornirea rulajului într-un Map (cheie: coordonate rotunjite + sens) — același
pattern ca Map-ul `legs` existent. NICIUN query per-tronson în bucla fierbinte.
Upsert-ul worker-ului NU trimite `km_final` (coloană generată — scrierea ei dă eroare).

**Detectoare de zi suspectă** (marchează ziua pentru coadă):

- tronson `suspect` cu diferență > 5 km
- km fantomă: opriri care acoperă >20h din zi dar `km_total` > 15 km
- sub-numărare: tronson cu durată de mers normală dar km ≈ 0 față de istoric
- `km_check` divergent > 15% — DOAR ca semnal secundar, afișat, nu alarmează singur;
  per dispozitiv se ține un flag de încredere (dispozitive cu viteză defectă — ex.
  HMK139 — au km_check ignorat)

Apelurile Valhalla/OSRM se fac **doar în worker** (nightly, pe VPS) — pagina web nu
sună servicii externe. Rezultatele se cachează în `lde_route_leg_cache` (vezi §1):
un tronson interogat o dată nu se mai interoghează — așa se construiește organic
baza de standarde pe rute.

**Reziliență OSRM public** (server demo, fără SLA): `AbortSignal.timeout()` pe fetch,
retry cu backoff, skip-and-continue la eroare, fallthrough pe leg_db/linie dreaptă —
un 429/timeout nu are voie să pice rulajul nocturn (același pattern try/catch
per-vehicul deja folosit în wialon-worker).

### 3. Pagina `/lde/verificare-km` — coada de verificare

Listează DOAR zilele suspecte neverificate (`verified_at IS NULL`). Pe rând:
mașină, zi, `km_total`, `km_check`, tabelul opririlor (sosire/plecare, localitate,
km GPS per tronson, `km_expected`, durata, sursa) cu tronsoanele suspecte evidențiate
și sugestia de corecție gata calculată (suma tronsoanelor cu suspectele înlocuite
prin `km_expected`).

Acțiuni: **Confirmă** (km-ul e bun → `verified_at`, `verified_by`) sau
**Pune km real** (input precompletat cu sugestia → `km_manual` + sursă + notă +
`data_source='manual'`). `km_manual` e permis doar pe zile marcate suspecte —
gate-ul se aplică ÎN server action (nu doar în UI); action-ul nu scrie niciodată
`km_total`. Sugestia de corecție (suma tronsoanelor cu suspectele înlocuite prin
`km_expected`) se calculează într-o pure function în `packages/db/src`.

### 4. Propagare

Toți consumatorii trec de pe `km_total` pe `km_final` — dar DOAR linia de citire
(`select('km_final')` + maparea `Number(g.km_final)`) în cele 7 actions: `salarii`,
`indicatii`, `alerte`, `tablou-zilnic`, `experimente`, `acte`, overview LDE.
NU se redenumesc câmpurile din pure functions și snapshot-uri (`DailyKmInput.km_total`,
`types.ts` — alea sunt câmpurile tabelelor de snapshot salarii, fixează pe ce s-a
calculat efectiv; rămân `km_total`). Zero schimbări de formule.

Atenție la `acte` (billing): actele deja emise nu se schimbă retroactiv; la
regenerare după o corecție, km-ul facturat se actualizează (dorit) — de confirmat
cu utilizatorul la implementare că suprascrierea snapshot-ului e OK pentru acte
deja transmise.

## Ce NU facem

- Nu rescriem `km_total` (rămâne valoarea brută GPS, auditabilă)
- Nu corectăm automat fără om zilele suspecte — doar sugerăm; operatorul decide
- Nu chemăm servicii de rutare din aplicația web
- Nu atingem zilele curate (fără tronsoane suspecte → nu apar nicăieri)

## Testare

- Unit: regula timp×viteză, ierarhia punții, potrivirea pe coordonate+sens
  (în `packages/db/src`, paritate cu testele `lde-geo-rules` existente)
- Paritate worker: re-rulare pe zilele-test cunoscute — 552BRAO 10–11 iunie (cârpirile
  de 54 km rămân, acum cu verdict „plauzibil"), HMK139 8 iulie (67.5 km → ~0 după fix),
  820GXP (tronsoanele 0.0 km marcate suspecte), HMK139 5 iulie (291.5 km NU e marcat)
- Upsert worker nu atinge `km_manual` (test cu corecție pre-existentă)

## Ordine de implementare

1. Migrația 223 + `km_final` + trecerea consumatorilor pe `km_final`
2. Fix km fantomă + verificare tronsoane în worker (istoric → Valhalla → OSRM)
3. Pagina `/lde/verificare-km`
4. Backfill: re-rulare worker pe iunie–iulie pentru popularea `km_expected`/`suspect`
