# ION-198 — Puncte de urcare pe localități la rutele interurbane (din GPS, 100 de zile)

Tichet: https://linear.app/p9group/issue/ION-198 · Dereva: `.claude/worktrees/ion-198-translux-puncte-de-urcare-pe-l`
Runda 2 (după revizorii Claude din runda 1; observațiile lor și triajul — la sfârșit).

## De ce

Ion, 03.10.2026: la bilete online (ION-190…197) clientul alege doar localitatea de urcare (o oprire din
`crm_stop_fares`). În satele și orașele unde autobuzul ia oameni din mai multe locuri (Briceni: autogara + încă
un loc la ~700 m; Edineț: autogara + intrarea; Bălți: autogara + intrarea dinspre nord), șoferul nu știe unde îl
așteaptă clientul. Ion vrea, «ca la taxi», ca pasagerul să aleagă dintr-o listă scurtă (1–3 puncte reale de bază),
nu să scrie din cap. Aceleași puncte vor sta pe harta privată a clienților din botul Telegram (tichet viitor).

Deciziile lui Ion (03.10, întrebări în sesiune):
- punctele intră **direct în bot și pe site**, fără confirmare manuală → filtrele automate trebuie să fie stricte;
- perioada analizei = **ultimele 100 de zile** (24.06–01.10.2026).

## Ce facem

**Ales:** opririle scurte detectate în GPS-ul brut al tuturor autobuzelor din graficul interurban (100 de zile),
doar în interiorul curselor reale (tur/retur, tăiate de lanțul ION-55), legate de opririle rutei, grupate;
1–3 puncte pe localitate după recurență; **apartenența la rută și sens se judecă separat pe fiecare (punct × rută ×
sens)**; filtre negative din OSM (semafoare, treceri de cale ferată, STOP/cedează, denivelări, benzinării) și din
durată (pauzele șoferilor); rezultatul → tabel nou în Supabase (scris atomic) → API → formularul de cumpărare.

**Respins:**
1. `lde_gps_stops` (66.537 opriri ale autobuzelor interurbane, 10.06–01.10) — are doar opriri ≥ 1 min
   (`dwell_min` întreg, zero rânduri `dwell<1`), iar urcarea durează 20–60 s; ar prinde doar pauzele.
2. Urma din `curse.json` (ION-55) pentru opriri sau pentru numitorul ponderii — aruncă punctele cu viteză < 5
   (`curse.mjs:54`) și e simplificată DP la 15 m (`curse.mjs:91,97`); servește doar pentru ferestrele curselor.
3. Doar `highway=bus_stop` din OSM, fără GPS — nu spune unde opresc ai noștri; rămâne semnal de nume.

## 🔬 Verificat pe viu

| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Tracker-ul are istoric pe 100 de zile | `SELECT min(w_date) … track WHERE id=2312` (805BXI) | puncte din 2025-09-27; 178,8 mil. rânduri; index `(id, w_date)` | 100 de zile se pot citi; cererea pe mașină×zi = 0,3–1,3 s |
| Frecvența punctelor | 3 zile 805BXI + 3 curse reale 15.09 (`opr-fapte2/3.mjs`) | pas median 20 s (p90 20 s); 776MJW/688AKD în încetinire ~5 s (3.882 pct / 334 min) | o oprire < 20 s se poate pierde → recurența pe 100 de zile compensează; rulaj = ≥ 2 probe sau `speed = 0` |
| Unitatea vitezei | memoria ION-112 (`verifica-tăietura-la-oprire`: «viteza × 1,852») + revizorul backend | `track.speed` e în noduri | pragul se scrie «≤ 3 noduri» (≈ 5,6 km/h); faptele de mai jos au fost măsurate cu același câmp |
| Opririle scurte se văd | ruta 11 tur 776MJW: 126 rulaje `speed ≤ 3`; ruta 8 retur 819BXI: 23; ruta 26 tur 688AKD: 59 | în sate 20–90 s (Lipcani 71 s, Briceni 179 s, Edineț 34 s); în Chișinău zeci de rulaje de 20 s (trafic) | filtre de recurență + obstacole fixe; praguri mai stricte în Chișinău și Bălți |
| Punctele secundare reale există | aceleași 3 curse | Briceni 48.3543,27.1015 la toate trei mașinile (lângă gara 48.3578,27.0925); Bălți 47.7873,27.8844 la 776 și 688; Edineț 48.1733,27.3001 + gara 48.1669,27.3096 | ipoteza «1–3 puncte» ține |
| Cine pe ce rută × sens | `nomenclator.mjs:73-78` (copia `lde-geo-worker/mejgorod-parcare/mej/`) | turul = `crm_route_id`, returul = `retur_route_id` (altfel `crm_route_id`), mașina returului = `vehicle_id_retur ?? vehicle_id`; 190 de atribuiri cu `retur_route_id ≠ crm_route_id` în fereastră (revizorul BL, SQL) | NU e semantica `buildReturAssignmentMap` (`assignments.ts:99-117`: returul propriu doar dacă nimeni nu l-a revendicat); `nomenclator.mjs:79-80` îl scrie oricum → 104 zile-rută pe 6 rute cu două mașini «retur» (revizorul BL, SQL). Ruta 2: `retur_uses_route_id = 16`, `retur_ascuns`, 83/100 rânduri deja cu `retur_route_id = 16`, 13 cu NULL. `retur_uses_route_id` nu e folosit în `pret.ts`/`assignments.ts` (grep 0) → se rezolvă în nomenclatorul-urcare (pas 1b), API-ul nu lărgește nimic |
| Pasul 1 rulat deja (citire, fișiere cu sufix) | `SUFIX=-urcare nomenclator.mjs 2026-06-24 2026-10-01` pe VPS, 03.10 01:30 | 30 rute, 5.954 atribuiri, 49 de mașini; `curse.mjs` rulează (1.400 curse în ~4 min, estimare ~20 min total) | fișierele scheletului ION-55 nu se ating (`nomenclator.mjs:82`, `curse.mjs:115` cu `SUFIX`) |
| Mașini fără tracker | memoria ION-55 | 216RQR, 749SHS, 239BZP, 526WVW | ies din analiză; raportul le numără |
| OSM local | `osmium tags-filter` pe `/opt/valhalla/custom_files/moldova-latest.osm.pbf` (23.06.2026) | bus_stop 2.748, traffic_signals 617, platform 2.397, fuel 1.500, village 1.623, town 54, city 14; `osmium` pe VPS | filtre + nume fără serviciu extern; level_crossing/stop/give_way/traffic_calming se extrag la pasul 3 (numărul lor intră în raport) |
| Opririle rutelor au coordonate | `nomenclator.json` (ION-55) | 60 de opriri unice, 54 cu lat/lon (centrul OSM al satului); `crm_stop_fares` interurban: 1.215 rânduri, 30 rute, 90 de nume, FĂRĂ lat/lon; niciun nume dublu pe aceeași rută (revizorul BL) | localitatea = oprirea RUTEI cea mai apropiată pe schelet, nu orice sat OSM din rază (Bilicenii Noi/Vechi etc.) |
| Potrivirea numelui pe site | `packages/db/src/pret.ts:149-155` (`ilike('name_ro', fromRo)`) | site-ul și `gasesteCursa` caută oprirea după `name_ro`, insensibil la majuscule | `localitate` în tabel = `name_ro` exact; aceeași regulă în API |
| Cererea pe localități | `tiki_tickets` din 01.04 | Chișinău 70.603, Bălți 41.163, Edineț 12.646, Briceni 11.238, Cupcini 2.244, Ocnița 1.869, Lipcani 1.717 … 70 de stații | raportul pune primele 15 localități după bilete deasupra |
| Comanda se creează prin RPC | `apps/admin/src/lib/bilete/comenzi.ts:203`; `485_bilete_online_idempotenta.sql:6-36` (SECURITY DEFINER, INSERT pe coloane enumerate) | câmpurile noi trebuie adăugate în funcție; testele 483–488 trec cu coloanele noi NULL | CREATE OR REPLACE din `pg_proc` de pe prod, în aceeași sesiune |
| Site-ul de cumpărare | `git branch -r --contains 021be72d` → `origin/main` | ION-197 e pe main: `apps/web/src/components/ui/buy-ticket-form.tsx`, `apps/web/src/app/(public)/bilete-actions.ts`, `apps/web/src/lib/bilete-api.ts`, `apps/web/src/components/bilet/BiletPage.tsx`, `apps/web/src/app/{ro,ru}/bilet/[cod]/page.tsx` | pasul 9 nu mai așteaptă; lista punctelor se citește pe SERVER prin `bilete-api.ts` (panoul e pe alt domeniu → fără fetch din browser) |
| Pagina biletului | `apps/admin/src/lib/bilete/public.ts:73` (select explicit), `apps/admin/src/app/api/bilete/public/[cod]/route.ts` | coloanele noi nu ies fără a le adăuga | pasul 8 le adaugă |
| Lista rutelor publice | `apps/admin/src/lib/public-paths.test.ts:24-26` | listă exhaustivă sub `/api/bilete/public/` | se adaugă `puncte` |
| Șoferul vede comenzile | grep `bilete_digest`, «Biletele mele»: 0 rezultate; `docs/plans/2026-10-02-bilete-online-qr-mini-app.md:348,462` | digestul (5a) și mini app-ul (8) nu există încă | cerința «punctul grupat pe punct» se scrie în tichetele lor (pas 10) |
| Ultima migrație pe main | `git ls-tree origin/main packages/db/migrations` | 488 | N = max(origin/main)+1, re-verificat chiar înainte |

## Pași

1. **Ferestrele curselor (VPS) — PORNIT 03.10 01:30, doar citire.** `SUFIX=-urcare nomenclator.mjs 2026-06-24 2026-10-01`
   + `SUFIX=-urcare curse.mjs` → `date/curse-urcare.json`. Rezultat: curse cu urmă ≈ 5.500.
1b. **Corecția atribuirilor ÎNAINTEA ferestrelor (`urcare/atribuiri.mjs`, nou, fără tracker) + `curse.mjs` din nou.**
   Prima rulare a pasului 1 (pornită 03.10 01:30, înainte de corecție) se aruncă. Din `daily_assignments` pe fereastră,
   regula `buildReturAssignmentMap`: returul revendicat (`retur_route_id`) câștigă; returul propriu al rutei R se
   ia doar dacă nimeni nu a revendicat R în ziua aceea; returul propriu al rutei A cu `retur_uses_route_id = B`
   (și `retur_route_id` NULL) se etichetează pe B DOAR dacă B nu are deja retur în ziua aceea (revendicat sau propriu);
   altfel se aruncă (SQL 03.10: 13 zile 2 → 16, 0 coliziuni). Rezultatul înlocuiește `atribuiri` în `nomenclator-urcare.json`
   (rutele și opririle rămân), apoi `SUFIX=-urcare curse.mjs` rulează din nou (~25 min), deci ferestrele, orarul
   și opririle sunt ale rutei-destinație. Din `curse-urcare.json` intră în analiză doar cursele cu `cover ≥ 0,8`.
   Teste (pe fișiere): o zi cu override OUT → o singură cursă retur pe rută; o zi cu ruta 2, `retur_route_id` NULL →
   cursa retur e pe ruta 16, cu opririle rutei 16; o zi sintetică cu 16 ocupată → returul lui 2 aruncat. Raportul
   numără pe rută×sens cursele tăiate de `cover < 0,8`; dacă o rută×sens pierde > 50 % din curse, `cover` se calculează
   pe opririle dintre capetele reale `oA`…`oB` (memoria ION-55: retururi oprite la Briceni/Lipcani).
2. **Evenimente + urmă brută (`urcare/opriri.mjs`, nou, VPS, nohup + jurnal, 1–2 h, noaptea, după
   `TZ=Europe/Chisinau date`).** O cerere pe mașină×zi (model `curse.mjs:24-33`), toate cursele zilei tăiate din ea
   (fereastra `t0 − 5 min … t1 + 5 min`). Pe cursă:
   - **rulaj** = probe consecutive cu `speed ≤ 3` noduri; viteza lipsă (`null`) e suplinită geometric DOAR dacă
     viteza calculată între probe < 1,5 m/s (≈ 3 noduri) ȘI toate probele rulajului stau într-o rază de 15 m de prima;
     păstrat dacă are ≥ 2 probe SAU `speed = 0`. Probă negativă în teste: mers continuu cu 15 km/h, probe la 5 s →
     zero evenimente — și aceeași probă cu `speed = null` (21 m între probe → zero); probă pozitivă cu `null` pe loc
     (rază < 15 m) → un eveniment; durata = ultimul − primul + pasul median; 15 s ≤ durata ≤ 8 min (peste = pauză, separat;
     gările din `STATII` fără plafon). Coordonata = proba cu viteza minimă din rulaj.
   - **urma brută a ferestrei** simplificată DP la 5 m PE TOATE punctele (inclusiv opririle) → `date/urme-urcare/<z>.ndjson`
     (pentru numitorul ponderii, distanță punct-SEGMENT).
   Ieșire `date/opriri-urcare.ndjson`: `{r, s, z, m, lat, lon, t, dur, nProbe, v0}`.
3. **Localitatea (`urcare/localitati.mjs`).** Extras OSM o dată → `date/osm-urcare.json`: place; bus_stop/platform cu
   nume; obstacole fixe: `highway=traffic_signals|stop|give_way`, `crossing=traffic_signals`, `railway=level_crossing`,
   `traffic_calming=*`; `amenity=fuel` (noduri + centrul căilor). Eveniment → oprirea RUTEI cursei cea mai apropiată
   (din `nomenclator-urcare.json`, cele cu lat/lon) dacă e la ≤ 2 km (sat) / 4 km (oraș) / 8 km (Chișinău, Bălți);
   altfel «neprogramat» (doar raport). Opririle fără coordonate (Intersecția…, Petrom Rîșcani, Slobotca) nu primesc puncte.
4. **Grupare, prag pe rută, alegere (`urcare/puncte.mjs`).**
   - Pe localitate: DBSCAN eps 40 m, minPts 5. Grup cu întindere > 120 m → exclus («lanț de trafic»).
     Coordonata grupului = **medoidul** (un eveniment real).
   - **Ponderea pe (grup × rută × sens)** = curse ale rutei×sensului care au oprit în grup / (curse ale rutei×sensului
     a căror urmă brută (pas 2) trece la ≤ 60 m (distanță la segment) de medoid **∪** cursele care au oprit în grup).
     Reuniunea face ponderea ≤ 1 prin construcție; controlul rămâne plasă.
   - Excluderi pe grup (cu motivul în raport; grupurile gărilor din `STATII` sunt scutite de obstacole și de durată): ≤ 30 m de orice obstacol fix; ≤ 40 m de `fuel` cu durata mediană
     > 2 min; în afara gărilor, durata mediană > 3 min («pauză»: urcarea = 30 s–5 min, ION-112); < 3 mașini distincte.
   - **Perechea (grup, rută, sens) e publicabilă** dacă pondere ≥ 10 % (≥ 25 % și durata mediană ≥ 30 s în
     Chișinău și Bălți) ȘI oprirea s-a văzut în ≥ 5 zile distincte pe ruta×sensul respectiv (nu «≥ 2 mașini»: 14 din 30
     de rute au aceeași mașină ≥ 90 % din zile — revizorul BL; mașinile distincte rămân pe grup, ≥ 3). Grupul fără
     nicio pereche publicabilă nu se publică; raportul numără perechile tăiate de fiecare prag.
   - Scor grup = zile distincte × √mașini; **top 3 pe localitate**, la ≥ 150 m între ele. Două grupuri la < 150 m
     se unesc DOAR dacă grupul unit trece din nou toate filtrele (medoid nou, întindere ≤ 120 m, obstacole, durată)
     și, pentru FIECARE pereche rută×sens păstrată, medoidul e la ≤ 30 m de ≥ 2 evenimente de oprire ale perechii;
     unirile se fac lacom, în ordinea scorului; unire refuzată → rămâne doar grupul cu scorul mai mare (perechile
     compatibile ale celuilalt trec pe el, cele incompatibile se pierd — eșec sigur);
     gara (`STATII`, atinsă în ≥ 50 % din curse) = rangul 1.
   - Nume: gara → «Autogara»; altfel `name` al celui mai apropiat `bus_stop`/`platform` OSM ≤ 60 m; altfel
     «intrarea dinspre <oprirea vecină a rutei>» / «ieșirea spre …» / «centru» după poziția față de oprirea rutei.
     RU: `name:ru` OSM sau aceleași formule în rusă (numele localităților din `crm_stop_fares.name_ru`).
     **Igienizare:** doar litere (RO/RU), cifre, spațiu, `-.,«»()`; ≤ 40 caractere; fără `@`, `http`, cifre ≥ 6 la rând;
     altfel se cade pe formulă.
5. **Raportul de control (`urcare/raport.mjs` → artifact).** Hartă cu toate grupurile (alese, excluse + motivul),
   tabel pe localitate (primele 15 după bilete deasupra), pondere pe rută×sens, câte grupuri a prins fiecare filtru,
   câte localități cu 0/1/2/3 puncte, mașini fără tracker. Ion îl vede; nu e poartă (decizia lui).
6. **Controlul automat (`urcare/control.mjs`, ieșire ≠ 0 = nu se scrie)**, pe TOATE localitățile: ≤ 3 puncte pe
   localitate; orice pondere ≤ 1; medoidul ≤ 30 m de urmele a ≥ 2 mașini și, pe fiecare pereche publicată, ≤ 30 m de
   ≥ 2 evenimente de oprire ale perechii; punctele active ale unei localități la ≥ 150 m între ele; niciun punct (în afara gărilor) ≤ 30 m de
   obstacol fix; gările ≤ 150 m de `STATII`; orice localitate cu gară în `STATII` are gara pe rangul 1; numele trec igienizarea; **dezactivările > 20 % din punctele active → stop** (tracker cu goluri).
7. **Migrația** `<N>_interurban_puncte_urcare.sql` (`db-migrate.sh translux … --dry-run`, apoi fără):
   - `interurban_puncte_urcare` (id bigint identity, `localitate` text = `name_ro`, `lat`, `lon`, `nume_ro`, `nume_ru`,
     `rang` 1–3, `zile`, `masini`, `curse`, `dur_med_s`, `sursa`, `activ` bool, `calculat_la`); index unic parțial
     `(localitate, rang) WHERE activ`; CHECK-uri (ultima poartă, nu doar JS-ul de pe VPS): `rang BETWEEN 1 AND 3`,
     `lat/lon` în cadrul Moldovei (`geo.mjs` MD), `char_length(nume_*) BETWEEN 2 AND 40`, `nume_* ~ '^[[:alpha:][:digit:] .,«»()-]+$'`,
     `pondere BETWEEN 0 AND 1` (în tabelul de perechi);
   - `interurban_puncte_urcare_rute` (punct_id FK, `crm_route_id`, `going_north` bool, `pondere`, `curse_trecute`,
     `curse_oprite`, `masini`; PK (punct_id, crm_route_id, going_north)); `going_north = true` ⇔ retur (`comenzi.ts:141`);
   - `interurban_puncte_urcare_aplica(p jsonb)` — o tranzacție, în ordinea asta (indexul unic parțial nu poate fi
     amânat): (1) `activ=false` pe TOATE punctele localităților din `p` și ale celor care nu mai apar; (2) potrivire
     ≤ 50 m în aceeași localitate, inclusiv cu cele inactive → UPDATE cu `activ=true` și `lat, lon, nume_*, rang`,
     statisticile noi (id-ul vechi rămâne); (3) INSERT pentru cele nepotrivite; (4) rescrie perechile de rută ale
     punctelor din `p`; (5) verifică ≤ 3 active pe localitate (altfel RAISE → ROLLBACK). În `--dry-run`: două aplicări
     succesive cu rangurile 2 ↔ 3 inversate și o reactivare trec. Niciodată DELETE
     de puncte (comenzile le referă). `SECURITY DEFINER SET search_path = public`;
   - `bilete_comenzi`: `punct_urcare_id bigint NULL REFERENCES interurban_puncte_urcare(id)` + copia
     `punct_urcare_nume_ro`, `punct_urcare_nume_ru`, `punct_urcare_lat`, `punct_urcare_lon` (NULL);
   - `bilete_creeaza_comanda`: CREATE OR REPLACE pornind de la definiția curentă din `pg_proc` (citită după `git fetch`,
     în aceeași sesiune), adaugă doar cele 5 câmpuri;
   - drepturi după modelul 483:229-246: RLS activ fără politici; `REVOKE ALL … FROM PUBLIC, anon, authenticated` pe
     tabele și secvențe, `GRANT … TO service_role`; `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` pe funcția nouă;
     `GRANT EXECUTE … TO service_role` explicit; probe `has_table_privilege` / `has_function_privilege` (și pe
     `bilete_creeaza_comanda` după CREATE OR REPLACE) care opresc migrația.
8. **Scrierea + API + validare.**
   - `urcare/scrie.mjs` (VPS): un singur `POST /rest/v1/rpc/interurban_puncte_urcare_aplica` cu cheia service din
     `/root/lde-worker/.env`; după scriere citește tabelul și refuză (log + ieșire ≠ 0) dacă o localitate are > 3 active.
   - `apps/admin/src/lib/bilete/puncte.ts`: **tot tabelul activ + perechile în memorie** (o citire la 5 min pe instanță,
     filtrare în proces; tabelul are cel mult câteva sute de rânduri). `puncteLocalitate(nameRo)` = punctele active ale
     localității (comparare exactă cu `name_ro`, fără `ilike` → fără metacaractere `%`/`_`) cu perechile lor (ruta, sens);
     `punctePentru(routeId, goingNorth, nameRo)` = cele cu pereche pe (ruta, sens), ordonate după rang. Răspuns doar
     `id, nume_ro, nume_ru, lat, lon, rang` (+ perechile la `puncteLocalitate`).
   - `GET /api/bilete/public/puncte?de=`: `de` ≤ 80 caractere, altfel 400; **fără `plafonPublic`** (site-ul cheamă de pe
     server, IP-ul ar fi al Vercel-ului și ar împărți găleata cu pagina biletului — `public.ts:48-55`); localitate
     necunoscută → `[]` fără drum la bază; `s-maxage=300`. Adăugat în `public-paths.test.ts`.
   - `name_ro` canonic: `incarcaCurse` (`packages/db/src/pret.ts:146-157`) adaugă `name_ro` în select-ul opririlor,
     `TimetableStop` (`packages/db/src/timetable.ts:9-14`) îl declară, `gasesteCursa` (`comenzi.ts:107-119`) îl întoarce
     (`fromNameRo`); test în `packages/db/src/pret.test.ts`.
   - `ComandaInput.punctUrcareId?: number` (parsat în `api/bilete/comanda/route.ts`); în `creeazaComanda`, numele
     localității = `fromNameRo` din `gasesteCursa` (nu `fromRo` brut): lista = `punctePentru(ruta, sens,
     name_ro)`; 0 puncte → câmpuri NULL; id în listă → acela; id lipsă → primul din listă; id ∉ listă → citire după id:
     aceeași `localitate` (inactiv sau fără pereche pe ruta×sens) → primul din listă, altfel `validare`; copia
     nume/lat/lon din bază, nu din input.
     `cheileComenzii` (`comenzi.ts:144`) nu include punctul: o reluare cu altă alegere întoarce comanda veche — acceptat, scris în cod.
   - `lib/bilete/public.ts:73` + `api/bilete/public/[cod]` expun `punct_urcare_nume_ro/ru, lat, lon`; `/bilete` (ION-195)
     arată punctul în detaliul comenzii.
9. **Site (ION-197 e pe main).** `bilete-api.ts`: `puncteUrcare(de)` pe server, același timeout, cache 60 s ca
   `configBilete`, eroare → `[]` (= nu întreba nimic). În căutare (`apps/web/src/app/(public)/actions.ts:348`, lângă
   `configBilete()`), O SINGURĂ cerere pentru localitatea «de», cu `name_ro` din `datele.fromStops` (nu `fromRo` brut;
   test: «de» cu litere mici → aceeași listă); fiecare `TripResult` primește `puncte` filtrate pe
   `(crm_route_id, going_north)`; `route-results.tsx:296` le dă lui `BuyTicketForm`. `buy-ticket-form.tsx`: ≥ 2 puncte → alegere obligatorie dintre butoane (nume + «pe hartă»
   → Google Maps lat,lon), nimic preselectat; 1 punct → «Urcare: <nume>»; 0 → nimic. `bilete-actions.ts` trimite
   `punctUrcareId`. `BiletPage.tsx` arată punctul (RO/RU după limbă). Textele RO + RU.
10. **Handoff + legături.** Raportul de control și cifrele; comentariu în tichetele pașilor 5a (digest) și 8 (mini app)
    ai ION-190: «afișează `punct_urcare_nume_*` grupat pe punct»; harta din bot = tichet nou pe același API; în bot
    numele trec prin escape HTML.

## Fișiere

- VPS `/root/lde-worker/mejgorod/cod/urcare/{atribuiri,opriri,localitati,puncte,raport,control,scrie}.mjs` (noi) + copie în
  repo `lde-geo-worker/mejgorod-urcare/` (ca `mejgorod-parcare`).
- `packages/db/migrations/<N>_interurban_puncte_urcare.sql` (nou); `packages/db/src/types.ts`;
  `packages/db/src/pret.ts`, `packages/db/src/timetable.ts`, `packages/db/src/pret.test.ts` (`name_ro` al opririi).
- `apps/admin/src/lib/bilete/puncte.ts` + `puncte.test.ts` (noi); `apps/admin/src/app/api/bilete/public/puncte/route.ts` (nou);
  `apps/admin/src/lib/public-paths.test.ts`.
- `apps/admin/src/lib/bilete/comenzi.ts`, `apps/admin/src/app/api/bilete/comanda/route.ts`,
  `apps/admin/src/lib/bilete/public.ts`, `apps/admin/src/app/api/bilete/public/[cod]/route.ts`, detaliul comenzii din `/bilete`.
- `apps/web/src/lib/bilete-api.ts`, `apps/web/src/app/(public)/actions.ts`, tipul `TripResult`,
  `apps/web/src/components/…/route-results.tsx`, `apps/web/src/components/ui/buy-ticket-form.tsx`,
  `apps/web/src/app/(public)/bilete-actions.ts`, `apps/web/src/components/bilet/BiletPage.tsx`.

## Riscuri

- **Obstacol / ambuteiaj / pauză publicat ca punct** (fără om la mijloc). Rezervă: obstacolele fixe din OSM, pragul
  pe rută×sens, durata, întinderea, controlul automat; `activ=false` scoate punctul din listele noi în cel mult ~11 min
  (panou 5 min + CDN 5 min + site 1 min, expirări independente; formularele deja deschise îl pot trimite și după), iar
  o comandă cu id-ul lui cade pe primul punct activ al rutei×sensului, fără eroare.
- **OSM din 23.06 nu are un obstacol nou.** Rezervă: ponderea ≥ 25 % + durata ≥ 30 s în orașe; în sate obstacolele sunt rare.
- **Pas de 20 s pierde opriri scurte** → puncte lipsă (eșec sigur): localitatea fără punct nu întreabă nimic.
- **Scriere întreruptă** → funcția SQL e o tranzacție; nimic pe jumătate.
- **RPC partajat suprascris de altă sesiune** → definiția din `pg_proc` chiar înainte; `--dry-run` întâi.
- **Rulare grea pe tracker ziua** → doar noaptea, după `TZ=Europe/Chisinau date`.
- **Șoferul încă nu vede punctul** până la pașii 5a/8 ai ION-190 → scris în handoff și în tichetele lor.

## Verificare

- Pas 1: curse-urcare cu urmă ≈ 5.500. Pas 6: `control.mjs` iese 0; Briceni, Edineț, Bălți au gara + ≥ 1 punct secundar.
- `vitest` admin (`puncte.test.ts`: pereche pe rută×sens, id lipsă → primul din listă, id inactiv al aceleiași localități
  → primul din listă, id altei localități → validare, 0 puncte → NULL, `de` cu `%`/`_` → `[]`; `public-paths.test.ts`), web (`bilete-api` fallback `[]`), `tsc`, gate-urile git-guards.
- Migrația: `--dry-run` cu probele de drepturi verzi; după aplicare `select count(*) … where activ` pe localitate ≤ 3.
- Prod: `GET /api/bilete/public/puncte?ruta=11&nord=false&de=Briceni` → 2–3 puncte; comandă de test (`test_admin`) cu
  punct ales → `bilete_comenzi.punct_urcare_*` completate; `/bilete` și pagina biletului (RO/RU) arată punctul.
- Site: preview cu steagul pe o rută — formularul cere punctul în Briceni, nu întreabă în Drepcăuți (1 punct).

## Revizorii Claude — runda 1 (triaj)

| id | sev. | decizie | ce s-a schimbat |
|---|---|---|---|
| BLA-1 | high | acceptat | pondere + mașini pe (punct × rută × sens), tabel de perechi (pas 4, 7) |
| BLA-2 | high | acceptat | obstacole fixe OSM; rulaj ≥ 2 probe sau speed=0 (pas 2–4, 6) |
| BLA-3 | med | acceptat | fapt `nomenclator.mjs:73-78` + `retur_uses_route_id` în API + test |
| BLA-4 | med | acceptat | pas 10: cerința în tichetele 5a/8 |
| BLA-5 | med | acceptat | medoid, întindere ≤ 120 m, control ≤ 30 m |
| BLA-6 / E3 | low/med | acceptat | ION-197 pe main, fișierele reale, citire pe server |
| BLA-7 | low | acceptat | public.ts, public-paths, nume RU, cheile comenzii, inactiv → rang 1, goingNorth=retur |
| E1 | high | acceptat | numitorul pe urma brută DP 5 m, distanță la segment (pas 2, 4) |
| E2 | med | acceptat | funcție SQL tranzacțională + index unic parțial + control după scriere |
| E4 | med | acceptat | durata mediană > 3 min în afara gărilor = pauză |
| E5 | low | acceptat | 1–2 h, o cerere pe mașină×zi pentru toate cursele zilei |
| E6 | low | acceptat | «≤ 3 noduri» |
| E7 | low | acceptat | `localitate` = `name_ro`, ilike ca `pret.ts` |
| E8 / S1 | low/med | acceptat | doar active; inactiv al aceleiași localități → rang 1 |
| S2 | med | acceptat | igienizarea numelor; escape HTML în bot |
| S3 | med | acceptat | validare parametri, plafon, cache în memorie |
| S4 | low | acceptat | modelul de drepturi 483 cu probe |
| S5 | low | acceptat | răspuns cu listă albă de coloane |
| S6 | low | acceptat | `public-paths.test.ts` |
| S7 | low | acceptat | stop la > 20 % dezactivări |

## Review: security-auditor

Zona: tabelul nou + drepturi, `/api/bilete/public/puncte`, validarea `punctUrcareId`, scrierea din VPS, `CREATE OR REPLACE bilete_creeaza_comanda`. Deciziile lui Ion (publicare directă, 100 de zile) nu sunt penalizate.

**S1 · medium (−1.0) · Comutatorul `activ=false` nu oprește comenzile.** Scenariu: un punct greșit (semafor) e dezactivat de Ion; CDN-ul ține lista 300 s (`s-maxage=300`), iar formularele deja deschise trimit vechiul id; validarea din pasul 8 verifică doar «localitate/rută/sens», nu `activ`, deci `creeazaComanda` acceptă punctul și copiază nume/lat/lon în comandă → pasagerul așteaptă la semafor. Riscul din plan («scoate punctul instant») e fals pentru comenzi. Dovadă: plan pas 8 vs. `apps/admin/src/lib/bilete/comenzi.ts:160-222` (nicio validare suplimentară după `valideaza`, câmpurile merg direct în RPC). Sugestie: validarea folosește exact `punctePentru()` (doar `activ=true`); id inactiv → `validare` cu mesaj «alege din nou», nu rang 1 tacit; test în `puncte.test.ts`.

**S2 · medium (−1.0) · Nume din OSM publicate fără igienizare.** Scenariu: oricine poate edita `name` al unui `bus_stop` în OSM (ex. «Sunați 069xxxxxx pentru loc» sau text ofensator); la următorul extras numele ajunge automat (fără confirmare) pe formularul de plată, pe pagina biletului, în `/bilete` și, în tichetul următor, în bot — unde mesajele se trimit cu `parse_mode: 'HTML'` și interpolare (`apps/bot/src/conversations/addDriver.ts:50`), deci `<`/`&` din nume rup sau injectează formatare. Dovadă: plan pas 4 (numele = `bus_stop`/`platform` OSM ≤ 60 m) + publicare directă. Sugestie: în `control.mjs` — listă albă de caractere (litere, cifre, spațiu, `.-'«»`), lungime ≤ 40, fără secvențe de ≥ 5 cifre / URL / `@`; altfel cade pe formula generică («intrarea dinspre …»); în plan, regula «escape HTML» pentru orice afișare în Telegram.

**S3 · medium (−1.0) · Endpoint public fără validare de parametri și fără plafon.** Scenariu: `?ruta=&nord=&de=` variabile ocolesc cache-ul CDN (fiecare combinație = cerere nouă la Supabase NANO, care a căzut deja pe 01.10 sub încărcare); un robot iterează `de=` aleatoriu → interogări fără limită. Config-ul vecin nu are parametri, deci modelul lui de cache nu se transferă. Dovadă: `apps/admin/src/app/api/bilete/public/config/route.ts:11-15` (fără parametri, fără plafon); `apps/admin/src/lib/bilete/public.ts:48-55` (`plafonPublic` există și se poate refolosi). Sugestie: `ruta` întreg pozitiv, `nord` strict `'true'|'false'`, `de` ≤ 80 caractere și normalizat; răspuns 400 altfel; `plafonPublic(ip)` sau cache în memorie pe o hartă completă (tabelul e mic: o citire pe 5 min, filtrare în proces).

**S4 · low (−0.5) · Modelul de drepturi din 483 nu e copiat întreg.** Planul scrie doar `REVOKE ALL … FROM anon, authenticated`; 483 face `FROM PUBLIC, anon, authenticated` + `GRANT ALL … TO service_role` + același lucru pe secvență + probe la aplicare (`packages/db/migrations/483_bilete_online.sql:229-246`). Implicitul din 356 acoperă tabelul și secvența identity (`356_drepturi_implicite_fara_anon.sql:24-28`), deci nu e gaură azi, dar fără probă nimeni nu verifică. La `CREATE OR REPLACE` drepturile funcției se păstrează (485 nu le-a re-scris, `485_bilete_online_idempotenta.sql:6-37`), totuși proba `has_function_privilege('anon', 'bilete_creeaza_comanda(jsonb)', 'EXECUTE') = false` trebuie să stea în migrație. Sugestie: blocul DO din 483 pentru tabel + secvență + REVOKE/GRANT idempotent pe funcție + probe `has_table_privilege`/`has_function_privilege` care opresc migrația.

**S5 · low (−0.5) · Forma răspunsului public nu e fixată.** Tabelul are `zile`, `masini`, `curse`, `pondere`, `dur_med_s`, `sursa` — statistici operaționale ale flotei (utile concurenței, vezi analizele de piață). Un `select('*')` le-ar publica. Dovadă: plan pas 7–8; tiparul de listă albă există în `apps/admin/src/lib/bilete/public.ts:8-36` (`ComandaPublica`). Sugestie: tip `PunctPublic = {id, nume_ro, nume_ru, lat, lon, rang}` și `select` explicit.

**S6 · low (−0.5) · Lista exhaustivă a rutelor publice nu e actualizată.** Prefixul `/api/bilete/public/` face ruta publică automat, iar testul cere completare conștientă la fiecare rută nouă. Dovadă: `apps/admin/src/lib/public-paths.ts:54-59`, `apps/admin/src/lib/public-paths.test.ts:24-26`. Sugestie: în «Fișiere» + «Verificare»: `public-paths.test.ts` primește `/api/bilete/public/puncte`.

**S7 · low (−0.5) · Scrierea din VPS poate dezactiva în masă.** Scenariu: la o rulare viitoare tracker-ul are goluri (s-a întâmplat: «GPS autobuze: tracker căzut») → puține grupuri → `scrie.mjs` trece pe `activ=false` majoritatea punctelor cu cheia service (care ocolește tot RLS-ul). Eșecul e sigur (site-ul nu mai întreabă), dar tăcut. Dovadă: plan pas 6–7 (controlul nu are prag pe dezactivări). Sugestie: `control.mjs` iese ≠ 0 dacă se dezactivează > 20 % din punctele active sau dispare gara unei localități din top 15; scrierea într-o singură tranzacție (RPC `service_role` cu REVOKE FROM PUBLIC) ca să nu rămână jumătate scrisă.

Fără observații: RLS fără politici pe tabelul nou (corect, doar service_role citește prin API); FK fără DELETE (NO ACTION blochează oricum); copia nume/lat/lon luată din bază, nu din input (corect); RPC-ul rămâne `SECURITY DEFINER SET search_path` și accesibil doar service_role; cheia de idempotență nu include punctul (`comenzi.ts:144-146`) — o reluare cu alt punct primește comanda inițială, fără prejudiciu.

Deduceri: S1 −1.0, S2 −1.0, S3 −1.0, S4 −0.5, S5 −0.5, S6 −0.5, S7 −0.5.
Scor: 5.0 · Blocante (critical/high): 0

## Review: senior-backend-engineer

Zona: pipeline-ul VPS (tracker, rulaje, DBSCAN, praguri), reutilizarea lanțului ION-55, schema și stabilitatea id-urilor, API-ul și integrarea cu formularul ION-197. Copia lanțului citită din `lde-geo-worker/mejgorod-parcare/mej/` (aceleași `curse.mjs`/`nomenclator.mjs`/`geo.mjs` cu `SUFIX`).

**E1 — high (−2.0, defect de logică). Numitorul ponderii se calculează pe o urmă care nu-l poate da.**
Scenariu: «ponderea = curse care au trecut la ≤ 150 m de grup» se ia din `curse-urcare.json` (singura urmă a cursei salvată de pasul 1). Acea urmă e DP-simplificată la 15 m din punctele în mers (`curse.mjs:54` aruncă `v < 5`, `curse.mjs:91,97` `dp(seg, 0, n-1, 15)` → `pts`), iar distanța din lanț e doar până la vârfuri (`geo.mjs:55` `departeDe` = min peste puncte, nu peste segmente). Pe o șosea dreaptă vârfurile rămân la sute de metri unul de altul → un grup aflat la mijloc «nu e trecut» de cursele care au trecut fără oprire → numitorul scade, ponderea crește (poate trece de 100 %). Pragurile 10 % / 25 % (singura apărare contra semafoarelor și ambuteiajelor din orașe, cu publicare directă) devin inoperante; un semafor nemapat din Bălți iese «punct de urcare» pe site și în bot.
Sugestie: pasul 2 citește oricum urma brută pe mașină×zi → tot acolo se scriu, pe cursă, trecerile (distanța minimă punct-segment pe urma brută din fereastra cursei) pentru fiecare grup candidat, sau se salvează urma brută nefiltrată a ferestrei; ponderea se calculează doar din urma brută. În `control.mjs`: ponderea ≤ 1 pentru orice grup, altfel ieșire ≠ 0.

**E2 — medium (−1.0, gol). Scrierea nu e atomică, iar controlul nu verifică ce s-a scris.**
Scenariu: `scrie.mjs` face prin REST INSERT-uri noi, UPDATE-uri pe cele potrivite și `activ=false` pe restul, în cereri separate. O cădere la mijloc (timeout, 5xx, NANO încremenit — vezi incidentul din 01.10) lasă active și punctele vechi, și pe cele noi → localități cu 4–6 puncte, două «rang 1», exact ce `control.mjs` a interzis, dar control.mjs a rulat pe JSON, înainte de scriere. Nu există nici o constrângere în schemă care să oprească asta.
Sugestie: o singură funcție SQL `interurban_puncte_urcare_aplica(p jsonb)` (tranzacție: potrivire ≤ 50 m în aceeași localitate — inclusiv pe cele inactive, care se reactivează cu id-ul vechi —, UPDATE, INSERT, dezactivare), `SECURITY DEFINER SET search_path`, `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` (regula din migr. 355/356); index unic parțial `(localitate, rang) WHERE activ`; după scriere un control pe tabel (≤ 3 active pe localitate), nu doar pe JSON.

**E3 — medium (−1.0, gol). Faptul despre ION-197 e învechit, iar integrarea cu site-ul are fișiere greșite și o cale lipsă.**
Dovadă: `021be72d` și `2d4508cd` (ION-197, site-ul de cumpărare) sunt pe `origin/main` (`git branch -r --contains 021be72d` → `origin/main`). Formularul nu e în `NowResults.tsx`, ci `apps/web/src/components/ui/buy-ticket-form.tsx:49-68` (câmpuri ascunse `crmRouteId`, `goingNorth`, `fromRo`) + `apps/web/src/app/(public)/bilete-actions.ts:46-58` (trimite câmpurile la panou) + `route-results.tsx`. Planul nu spune de unde ia formularul lista punctelor: panoul e pe alt domeniu, iar site-ul citește configul doar pe server (`apps/web/src/lib/bilete-api.ts:19`); un `fetch` din browser spre `/api/bilete/public/puncte` = CORS. Pagina biletului citește comanda din `apps/web/src/lib/bilete-api.ts:97` → `apps/admin/src/app/api/bilete/public/[cod]/route.ts` (+ `lib/bilete/public.ts`), care nu e în lista de fișiere, deci punctul nu ar ajunge pe pagina biletului.
Sugestie: rândul «Formularul de pe site» din «Verificat pe viu» se corectează; pasul 9 nu mai așteaptă; lista de fișiere: `buy-ticket-form.tsx`, `bilete-actions.ts` (câmpul `punctUrcareId`), `bilete-api.ts` (funcție server-side `puncteUrcare()` cu același timeout și «indisponibil = nu întreba nimic»), `api/bilete/public/[cod]/route.ts` + `lib/bilete/public.ts` (expun `punct_urcare_nume/lat/lon`), `api/bilete/comanda/route.ts` (parsarea, deja listată).

**E4 — medium (−1.0, gol). Opririle repetate ale șoferilor (cafenea, WC, pauză de 3–8 min) trec toate filtrele.**
Scenariu: o pauză zilnică la aceeași cafenea de pe traseu, în afara gărilor și nu lângă `fuel` OSM, are zile × mașini mari și pondere mare → scor maxim → poate deveni chiar rangul 1 al localității. Filtrul de durată (> 8 min) și cel de benzinărie (≤ 40 m de `fuel`) nu o prind. Observația vine doar din textul planului, deci nu blochează.
Sugestie: grupurile din afara `STATII` cu durata mediană > 3 min nu se publică (rămân în raport, cu motivul «pauză»); urcarea se încadrează în 30 s–5 min (măsurat la ION-112), deci pragul nu taie punctele reale.

**E5 — low (−0.5). Estimarea pasului 1 și sarcina dublă pe tracker.**
`lant.sh:22` dă `curse.mjs` 1.200 s pentru O săptămână; 100 de zile ≈ 4.500 mașină×zi × 0,3–1,3 s (faptul din plan) ≈ 0,5–1,5 h, nu 30 min, iar pasul 2 recitește exact aceleași mașină×zi. Sugestie: estimare 1–2 h pe pas, `nohup` + jurnal și la pasul 2 (sau pasul 2 citește o dată pe mașină×zi și taie toate cursele zilei din aceeași cerere — `curse.mjs:24-33` arată modelul).

**E6 — low (−0.5). Unitatea vitezei nu e scrisă.**
`curse.mjs:30` ia `speed` brut din tracker; la ION-112 s-a stabilit că e în noduri (× 1,852). «speed ≤ 3» = ~5,6 km/h, nu 3 km/h. Faptele din plan au fost măsurate cu același câmp, deci pragul e coerent, dar trebuie scris «≤ 3 noduri» ca să nu fie «corectat» la implementare.

**E7 — low (−0.5). Cheia localității: două funcții `norm` diferite.**
Site-ul și `gasesteCursa` găsesc oprirea prin `ilike('name_ro', fromRo)` (`packages/db/src/pret.ts:149-155`); planul leagă prin `norm()` din `geo.mjs:22` (care șterge parantezele), iar API-ul primește `de=`. Verificat pe prod: niciun `name_ro` interurban nu are paranteze, «/» sau sufix GA, și nu există două scrieri ale aceleiași localități — deci azi nu se rupe. Sugestie: `localitate` = `name_ro` exact, iar `punctePentru` caută ca `incarcaCurse` (după `name_ro`, insensibil la majuscule) — o singură regulă de potrivire; `localitate_norm` doar pentru pipeline.

**E8 — low (−0.5). Cache 300 s vs «activ=false scoate instant».**
Un punct dezactivat rămâne până la 5 min în lista site-ului; comanda cu id-ul lui iese `validare` → mesaj generic în formular (`bilete-actions.ts:59-62`). Sugestie: în `creeazaComanda`, un id inactiv dar al aceleiași localități/rute/sens → rangul 1 activ (ca la id lipsă), nu refuz; riscul din plan se reformulează «în ≤ 5 min».

Fără observații: ordinea migrație → API (tabelul există înainte ca `creeazaComanda` să-l citească); id lipsă → rang 1 păstrează compatibilitatea cu site-ul vechi în timpul deploy-ului; sensul `goingNorth` = retur și `retur_route_id` din nomenclator au aceeași semantică (`nomenclator.mjs:75-77` vs `packages/db/src/assignments.ts:93-121`), deci `rute @> {crmRouteId}` cu sensul se potrivește cu ce trimite formularul; fișierele scheletului ION-55 nu se ating datorită `SUFIX` (`curse.mjs:10-11,115`, `nomenclator.mjs:82`).

Deduceri: E1 −2.0, E2 −1.0, E3 −1.0, E4 −1.0, E5 −0.5, E6 −0.5, E7 −0.5, E8 −0.5.
Scor: 3.0 · Blocante (critical/high): 1

## Review: business-logic-auditor

Zona: fluxul comenzii (`bilete_comenzi`, `bilete_creeaza_comanda`, `comenzi.ts`, `/bilete`, împăcare, refund) și logica de detectare/alegere a punctelor din GPS. Deciziile lui Ion (direct în bot și site, 100 de zile) nu sunt penalizate. Fapte verificate pe viu în această revizie: SQL read-only pe `zqkzqpfdymddsywxjxow`, `git show 021be72d`, fișierele citate mai jos.

**BLA-1 · high · defect de logică: apartenența la rută (`rute int[]`) nu are prag pe rută.** Pasul 4 calculează ponderea și pragul de ≥ 3 mașini pe GRUP (toate rutele la un loc). Pragul pe sens există (≥ 10 %), dar `rute` nu are nicio regulă. Pasul 8 filtrează apoi cu `rute @> {id}`.
- **Scenariul de eșec:** în Bălți, «intrarea dinspre nord» trece de filtre datorită rutelor care vin din nord (pondere ≥ 25 %). O rută care trece pe acolo și a oprit o singură dată în 100 de zile intră în `rute`. Pasagerul ei e trimis la un loc unde autobuzul lui nu oprește, pierde cursa, iar banii se întorc prin calea de refund (`lib/bilete/refund.ts`).
- **Dovada:** filtrul pe rută și sens e singurul strat între grup și client: `comenzi.ts:111` (cursa = `routeId` + `goingNorth`). Controlul din pasul 6 verifică „≤ 300 m de urma reală” global, nu pe rută.
- **Corecție:** ponderea și pragul de mașini se calculează pe (grup × rută × sens). O rută intră în `rute` doar cu pondere proprie ≥ 10 % (≥ 25 % în Chișinău și Bălți) și ≥ 2 mașini distincte pe ea. Tabelul ține fie o coloană `pondere` per rută, fie un rând pe (punct, rută, sens). `control.mjs` verifică același lucru.

**BLA-2 · high · defect de logică: opririle obligatorii trec drept puncte de urcare.** Filtrele negative OSM sunt doar `traffic_signals` și `fuel` (pașii 3, 4, 6). Lipsesc trecerile la nivel cu calea ferată (`railway=level_crossing`), semnele STOP (`highway=stop`), `give_way` și denivelările (`traffic_calming`). La o trecere de cale ferată autobuzul oprește la fiecare cursă, deci ponderea e aproape 100 %, mult peste orice prag de oraș.
- **Scenariul de eșec:** în Ocnița (nod feroviar) sau la ieșirea din Bălți, punctul 2 publicat e trecerea de cale ferată, cu numele «intrarea dinspre …». Pasagerul stă acolo, iar șoferul nu ia oameni pe calea ferată. Fără confirmare manuală (decizia lui Ion), nimic nu oprește punctul.
- **Agravant:** cu pasul median de 20 s, un singur punct cu `speed ≤ 3` dă durata = 0 + 20 s, peste pragul de 15 s. Orice încetinire de o probă (cedare, viraj strâns) devine eveniment. Recurența filtrează zgomotul, nu obstacolele fixe.
- **Corecție:** `osm-urcare.json` adaugă `railway=level_crossing`, `highway=stop|give_way`, `traffic_calming`, `crossing=traffic_signals`, cu excludere la ≤ 30 m în pasul 4 și verificare în pasul 6. Rulajul cere ≥ 2 probe consecutive SAU `speed = 0`. Raportul (pasul 5) numără grupurile excluse pe fiecare motiv, ca să se vadă că filtrul a prins ceva.

**BLA-3 · medium · atribuirea returului la rută.** Planul ia ruta cursei din lanțul ION-55 fără să spună cum tratează returul suprascris. Pe viu: `crm_routes` id 2 are `retur_uses_route_id = 16` (id 16 are `retur_disabled`), iar în fereastra 24.06–01.10 sunt 190 de atribuiri interurbane cu `retur_route_id ≠ crm_route_id`. Comanda rezolvă returul cu `buildReturAssignmentMap` (`comenzi.ts:133`, `packages/db/src/assignments.ts:89-110`: override IN/OUT).
- **Scenariul:** dacă `nomenclator.mjs` etichetează returul cu `crm_route_id` al mașinii, evenimentele acestor curse ajung pe ruta greșită. Opririle se văd atunci «neprogramate» sau umflă `rute` cu un id străin, ceea ce agravează BLA-1.
- **Corecție:** în „Verificat pe viu” se adaugă cum etichetează `nomenclator.mjs` returul, cu `fișier:linie` de pe VPS. Pasul 2 folosește aceeași regulă ca `buildReturAssignmentMap`, plus `retur_uses_route_id`. Testul din pasul 6 confirmă că ruta 2 retur și overrides apar pe ruta comenzii.

**BLA-4 · medium · gol de acoperire: șoferul nu primește punctul.** Motivul tichetului e «șoferul nu știe unde îl așteaptă clientul», dar pașii 8–9 duc punctul doar în `/bilete` (ADMIN) și pe pagina biletului. Digestul șoferului și mini app-ul nu există încă în cod (grep pe `bilete_digest`, `bilete-sofer`, „Biletele mele”: zero rezultate). Ele sunt pașii 5a/8 din `docs/plans/2026-10-02-bilete-online-qr-mini-app.md:348,462`.
- **Scenariul:** punctele intră în producție, pasagerii aleg «intrarea», iar șoferul tot nu află și oprește doar la autogară.
- **Corecție:** la Riscuri/Handoff se scrie explicit că digestul și mini app-ul șoferului afișează `punct_urcare_nume` grupat pe punct. Asta se trece ca cerință în tichetul pasului 5a/8 al ION-190, nu „tichet viitor” vag.

**BLA-5 · medium · punctul publicat poate sta pe altă stradă.** DBSCAN cu eps 40 m înlănțuie evenimentele dintr-o coadă de trafic sau de-a lungul unei străzi. Planul nu spune cum se calculează lat/lon-ul grupului: centroidul unui lanț în L poate cădea în afara drumului. Controlul din pasul 6 tolerează 300 m de la urmă, adică un cartier întreg. Coordonatele pleacă pe site ca link Google Maps (pasul 9).
- **Corecție:** coordonata = medoidul grupului (un eveniment real). Se exclude grupul cu întindere > 120 m. Pragul de control: ≤ 30 m de urmă și ≤ 60 m între medoid și cel mai apropiat eveniment cu `speed = 0`.

**BLA-6 · low · fapt depășit și căi greșite.** „Verificat pe viu” și Riscurile spun că site-ul ION-197 NU e pe main. În realitate e pe `origin/main` din `021be72d`. Fișierele lui sunt `apps/web/src/components/ui/buy-ticket-form.tsx`, `apps/web/src/app/(public)/bilete-actions.ts`, `apps/web/src/components/bilet/BiletPage.tsx` și `apps/web/src/app/{ro,ru}/bilet/[cod]/page.tsx`, nu `NowResults.tsx` și nu `/[locale]/bilet/[cod]`. **Corecție:** se actualizează rândul și lista din pasul 9. Condiția «după ce ION-197 e pe main» e deja îndeplinită.

**BLA-7 · low · fluxul comenzii, detalii nelistate.**
1. `apps/admin/src/lib/bilete/public.ts:73` selectează coloanele explicit, deci pagina biletului nu vede punctul fără să-l adauge.
2. `apps/admin/src/lib/public-paths.test.ts:26` listează exhaustiv rutele de sub `/api/bilete/public/`, deci `puncte` trebuie adăugat acolo.
3. Copia păstrează doar `punct_urcare_nume`, deci pagina RU (`lang = 'ru'`) nu are numele rusesc. Trebuie copiate și `nume_ru`, sau `nume_ro` + `nume_ru`.
4. `cheileComenzii` (`comenzi.ts:144`) nu include punctul: o reluare cu altă alegere întoarce tăcut comanda veche. E acceptabil, dar trebuie scris.
5. Un punct dezactivat de o rulare între încărcarea formularului și trimitere duce la `validare` și la formular respins. Mai bine: punct inactiv ⇒ cădere pe rangul 1, ca la id lipsă.
6. Pasul 8 trebuie să spună că „localitatea are ≥ 2 puncte” înseamnă puncte pe rută și sens (aceeași funcție ca API-ul).
7. Maparea `goingNorth = true` ↔ `retur` (`comenzi.ts:141`) trebuie scrisă, ca `tur`/`retur` din tabel să nu iasă inversate.

Ce e corect și verificat: RPC-ul `bilete_creeaza_comanda` e `SECURITY DEFINER` cu `INSERT` pe coloane explicite (`485_bilete_online_idempotenta.sql:6-36`), deci câmpurile noi trebuie adăugate în funcție, cum spune planul. Testele din migrațiile 483–488 cheamă funcția fără câmpurile noi, iar cu coloane NULL ele trec. FK-ul nullable spre `interurban_puncte_urcare` nu încurcă `DELETE`-ul probelor din migrații (`483_bilete_online.sql:272`). Împăcarea și refund-ul nu citesc coloanele noi. `crm_stop_fares` interurban n-are nume duble pe aceeași rută (0 perechi), iar Briceni, Edineț, Chișinău și Bălți apar fiecare cu un singur `name_ro`. Atenție însă la satele vecine cu nume apropiate (Bilicenii Noi/Vechi, Bădragii Noi/Vechi, Brătușeni/Brătușenii Noi, Ocnița/Ocnița-Sat): în pasul 3, „cea mai apropiată localitate OSM în raza de 2–4 km” le poate încurca. Se recomandă potrivirea pe poligonul `place` sau pe cea mai apropiată oprire a rutei, nu pe rază.

Deduceri: BLA-1 −2.0 (high, logică) · BLA-2 −2.0 (high, logică) · BLA-3 −1.0 (medium) · BLA-4 −1.0 (medium, acoperire) · BLA-5 −1.0 (medium) · BLA-6 −0.5 (low) · BLA-7 −0.5 (low).

Scor: 2.0 · Blocante (critical/high): 2

## Review runda 2: security-auditor

Zona: `interurban_puncte_urcare_aplica` (SECURITY DEFINER), tabelul de perechi, drepturile după 483, `GET /api/bilete/public/puncte`, validarea `punctUrcareId`, igienizarea numelor. Citite: `apps/web/src/lib/bilete-api.ts`, `apps/admin/src/lib/bilete/public.ts:44-56`, `apps/admin/src/app/api/bilete/public/[cod]/route.ts`, `apps/admin/src/lib/bilete/comenzi.ts:95-147,209`, `apps/admin/src/app/api/bilete/comanda/route.ts:48`, `packages/db/src/pret.ts:145-155`, `packages/db/migrations/483_bilete_online.sql:151-160,229-246`.

**Închise:**
- **S1** — id inactiv nu mai copiază punctul dezactivat: se cade pe un punct activ, cu nume/lat/lon luate din bază, prin aceeași `punctePentru` (pas 8). Rămâne o precizare, vezi N3.
- **S2** — igienizare cu listă albă, ≤ 40 caractere, fără `@`/`http`/cifre ≥ 6, cădere pe formulă (pas 4), verificare în `control.mjs` (pas 6), escape HTML în bot (pas 10). Rămâne apărarea în bază, vezi N4.
- **S3** — parametrii validați (pas 8). Plafonul ales introduce însă N1.
- **S4** — modelul 483 cu probe (pas 7). Notă, fără deducere: în blocul DO să stea explicit și `GRANT EXECUTE … TO service_role` pe funcția nouă (ca `483:242-244`), plus `bilete_creeaza_comanda(jsonb)` în probe după CREATE OR REPLACE.
- **S5** — listă albă de coloane `id, nume_ro, nume_ru, lat, lon, rang` (pas 8).
- **S6** — `public-paths.test.ts` (pas 8, Fișiere, Verificare).
- **S7** — stop la > 20 % dezactivări (pas 6) + scriere într-o tranzacție (pas 7).

**N1 · high (−2.0, defect de logică) · `plafonPublic(ip)` pe un apel server-la-server face să cadă pagina biletului plătit.**
- **Scenariu:** pasul 9 citește punctele pe serverul translux-web (`bilete-api.ts`). Acolo `fetch` nu trimite IP-ul vizitatorului: vezi `bilete-api.ts:19,97`, fără antete. Panoul ia IP-ul din `x-forwarded-for` (`[cod]/route.ts:16`), deci vede IP-ul de ieșire Vercel al site-ului. Plafonul e o singură găleată `pub:${ip}` de 60/min (`public.ts:48-52`), aceeași pe care o folosește deja pagina biletului (`[cod]/route.ts:17`), care vine și ea de pe serverul site-ului (`bilete-api.ts:97`).
- **Ce se strică:** la un vârf de căutări (formularul cere punctele pentru fiecare cursă afișată), găleata comună se umple. Formularul nu mai întreabă punctul (eșec sigur). Dar `GET /api/bilete/public/<cod>` dă 429, iar pasagerul care a plătit vede «indisponibil» în loc de bilet și QR. Asta contrazice regula scrisă la `public.ts:46`: «un bilet trebuie să se poată arăta».
- **Cost:** fiecare apel `bilete_plafon` face DELETE + SELECT + INSERT pe NANO (`483:155-160`). Plafonul costă mai mult decât citirea pe care o păzește.
- **Sugestie:**
  - fără plafon pe IP la `puncte`;
  - panoul ține în memorie TOT tabelul activ (o citire la 5 min), iar `de` necunoscut față de localitățile din cache → `[]` fără drum la bază, deci cheile cache-ului rămân mărginite (~90 × 30 × 2);
  - pe translux-web, cache de 60 s ca la `configBilete` (`bilete-api.ts:15-28`);
  - dacă totuși se vrea un plafon: o cheie separată (`puncte:`), nu `pub:`.
  - Test: `puncte` nu cheamă `bilete_plafon`.

**N2 · low (−0.5) · `ilike` cu textul clientului: `%` și `_` sunt metacaractere.**
- **Scenariu:** `punctePentru` filtrează cu `localitate ilike fromRo` (pas 8), iar `fromRo` vine brut din corpul cererii (`comanda/route.ts:48`, doar `slice(0, 80)`). Cu `fromRo = "Bri%"` sau `"%"`, ce trece de `incarcaCurse` (aceeași `ilike`, `pret.ts:150`) primește punctele TUTUROR localităților rutei. Un id din altă localitate trece de «aceeași localitate» și se copiază în comandă: șoferul (pașii 5a/8) vede un punct care nu ține de oprirea biletului. Pe endpoint, `de=%` dă toată lista rutei; datele sunt publice, deci impactul e mic.
- **Sugestie:** `punctePentru` primește `name_ro` canonic, luat din oprirea găsită de `gasesteCursa` (`d.fromStops` → `name_ro`), și compară cu `eq`. Pe endpoint, `de` se compară exact cu numele din cache (N1), nu cu `ilike`. Test: `fromRo` cu `%` nu întoarce puncte străine.

**N3 · low (−0.5) · «rangul 1 activ» la cădere e pe localitate, nu pe (rută × sens).**
- **Scenariu:** indexul unic e `(localitate, rang) WHERE activ` (pas 7), deci `rang = 1` e al localității. În Bălți, punctul de rang 1 poate avea pereche publicabilă doar pentru rutele din nord. O comandă fără id, sau cu id inactiv, pe o rută din sud primește un loc unde autobuzul ei nu oprește. În plus, «id inactiv dar al aceleiași rute/sens» nu se poate verifica dacă perechile punctului dezactivat au fost rescrise de `aplica` (pas 7, «rescrie perechile … punctelor atinse»).
- **Sugestie:** căderea = primul element din `punctePentru(ruta, sens, localitate)` ordonat după `rang`. Id-ul inactiv se judecă doar pe `localitate` (rândul punctului rămâne, perechile nu contează); altfel `validare`. Test în `puncte.test.ts`.

**N4 · low (−0.5) · Igienizarea trăiește doar în JS pe VPS; ultima poartă (funcția SQL) acceptă orice.**
- **Scenariu:** `aplica(p jsonb)` e SECURITY DEFINER și scrie direct ce primește. O versiune viitoare a `puncte.mjs`/`control.mjs` (copie în repo, scp pe VPS) care pierde regula publică automat, fără om la mijloc, nume/coordonate pe formularul de plată. `\p{L}` admite și alte alfabete, iar caracterele invizibile (Cf: bidi, zero-width) nu sunt numite în listă.
- **Sugestie:** CHECK-uri pe tabel:
  - `char_length(nume_ro|nume_ru) BETWEEN 1 AND 40`;
  - `nume_* ~ '^[A-Za-zĂÂÎȘȚăâîșțА-Яа-яЁё0-9 .,«»()-]+$'`;
  - `rang BETWEEN 1 AND 3`;
  - lat/lon în dreptunghiul Moldovei;
  - `pondere BETWEEN 0 AND 1` pe perechi.
  
  În JS, lista albă se scrie pe intervale Latin/Chirilic explicite, după NFC.

**Fără observații:**
- `SECURITY DEFINER SET search_path TO 'public'` e tiparul proiectului (`483:152`, `485:7`) și se execută doar de service_role, cu probă;
- tabelul de perechi fără secvență nu cere REVOKE pe secvență;
- copia nume/lat/lon din bază, nu din input;
- `cheileComenzii` fără punct e documentat;
- pe site, React escapează numele, iar linkul Google Maps se face din numere.

Deduceri: N1 −2.0 (high, logică) · N2 −0.5 · N3 −0.5 · N4 −0.5.
Scor: 6.5 · Blocante (critical/high): 1

## Review runda 2: senior-backend-engineer

Zona: pipeline VPS (urma brută DP 5 m, ponderea), funcția SQL de aplicare și id-urile, API + integrarea cu
`buy-ticket-form.tsx` / `bilete-actions.ts` / `bilete-api.ts`. Verificat pe viu: pasul 1 rulează pe VPS (03.10 01:35,
`curse.mjs` activ, `nomenclator-urcare.json` scris, `curse-urcare.json` încă nu); `curse.mjs:44-60,85-115` (t0/t1 din
`seg` filtrat cu `v<5`); `nomenclator.mjs:73-78`; codul de pe main citat mai jos.

**Închise:** E1 (numitorul pe urma brută DP 5 m, distanță la segment — pas 2, 4); E2 (funcție tranzacțională + index
unic parțial); E3 (ION-197 pe main, fișierele reale, citire pe server); E4 (> 3 min = pauză); E5 (o cerere pe
mașină×zi, 1–2 h, nohup); E6 («≤ 3 noduri»); E7 (`localitate` = `name_ro`, ilike ca `pret.ts:149-155`); E8 (inactiv →
rang 1, «≤ 5 min»). Drepturile funcției noi: «modelul 483:229-246» include și `GRANT EXECUTE … TO service_role`
(`483_bilete_online.sql:243-246`), deci `scrie.mjs` nu-și pierde dreptul după `REVOKE … FROM PUBLIC` — corect.

**R2-E1 · medium (−1.0) · «Ponderea ≤ 1 prin construcție» nu e adevărat → controlul poate bloca toată scrierea.**
Numărătorul = cursele cu un eveniment ÎN grup; numitorul = cursele a căror urmă trece la ≤ 60 m de MEDOID. Un grup
DBSCAN (eps 40 m, lanț) poate avea întinderea până la 120 m, deci evenimente la 60–120 m de medoid; urma cursei acelui
eveniment trece prin eveniment (DP 5 m), nu neapărat la ≤ 60 m de medoid → cursa intră sus, nu jos → pondere > 1 →
`control.mjs` iese ≠ 0 și NU se scrie nimic (pas 6). Pe ~300 de localități × 100 de zile e probabil să apară măcar un
astfel de grup, deci prima rulare se poate opri. Dovadă: doar textul planului (pas 4 vs pas 6) — nu blochează.
Sugestie: numitorul = cursele rutei×sensului care trec la ≤ 60 m de medoid SAU au oprit în grup (reuniune), sau
numărătorul = intersecția; atunci ≤ 1 e chiar prin construcție, iar controlul rămâne plasă. (Controlul «medoidul ≤ 30 m
de o urmă brută» e vid — medoidul e un eveniment de pe urma propriei curse; se poate scoate sau înlocui cu «≤ 30 m de
urmele a ≥ 2 mașini».)

**R2-E2 · medium (−1.0) · Ordinea din funcția de aplicare încalcă indexul unic parțial la orice schimbare de rang.**
Pas 7: «potrivire → UPDATE statistici → INSERT noi → `activ=false` restul». Indexul `(localitate, rang) WHERE activ`
nu e DEFERRABLE (un index unic parțial nici nu poate fi), deci se verifică la fiecare rând. Scenariu: la rularea a doua,
vechiul rang 1 dispare și vechiul rang 2 devine 1 (sau două puncte își schimbă rangul) → UPDATE-ul pune rang 1 cât
timp vechiul rang 1 e încă activ → `unique_violation` → ROLLBACK la fiecare rulare; punctele rămân înghețate pe prima
versiune, iar dezactivarea unui punct greșit prin rerulare (Riscuri, primul rând) nu mai funcționează. Dovadă:
semantica PostgreSQL + textul pasului 7 — nu blochează. Sugestie: în funcție, întâi `activ=false` pe TOATE punctele
localităților din `p` (și ale celor dispărute), apoi UPDATE pe cele potrivite (reactivare, inclusiv `lat`, `lon`,
`nume_*`, `rang` — nu doar «statistici») și INSERT; test în `--dry-run` cu două aplicări succesive cu rangurile
inversate.

**R2-E3 · medium (−1.0) · `plafonPublic(ip)` pe `/puncte` vede IP-ul serverului translux-web, nu al pasagerului.**
Pas 8–9: lista se citește pe SERVER prin `bilete-api.ts`; `fetch` din `bilete-api.ts:19` nu trimite IP-ul clientului, iar
plafonul se cheiază pe `x-forwarded-for` (`apps/admin/src/lib/bilete/public.ts:48-55`, folosit așa în
`api/bilete/public/[cod]/route.ts:16-17`). Toți vizitatorii site-ului împart găleata de 60/min a ieșirii Vercel, plus un
RPC `bilete_plafon` (scriere pe NANO) la fiecare cerere, înaintea cache-ului. Scenariu: într-o oră de vârf > 60 de
liste/min → 429 → `bilete-api` întoarce `[]` → formularul nu întreabă → comanda fără id → rang 1, tăcut, deși Briceni
are două puncte. (Aceeași cheiere afectează deja pagina biletului din ION-197 — `BiletPage.tsx` → `[cod]` pe server;
în afara obiectului, de semnalat.) Sugestie: `/puncte` NU folosește `plafonPublic`; apărarea e un cache în memorie al
ÎNTREGULUI tabel activ (o citire / 5 min / instanță, filtrare în proces — nu o hartă pe cheie, care crește nelimitat la
`de=` aleatoriu) + `s-maxage=300`; validarea parametrilor rămâne. Alternativ: ruta cere `Authorization: Bearer
BILETE_API_KEY` ca `/api/bilete/comanda`.

**R2-E4 · low (−0.5) · Lipsește drumul listei de la server la componenta client.** `BuyTicketForm` e `"use client"`,
deschis per cursă din `route-results.tsx:296`; nu primește nimic de la server în afară de `trip` (`buy-ticket-form.tsx:49-51`).
Planul spune «citire pe server», dar nu cum ajunge lista în formular. Sugestie: în căutare (`app/(public)/actions.ts:348`,
lângă `configBilete()`) o SINGURĂ cerere `puncteUrcare(fromRo)` care întoarce punctele localității cu perechile lor
(ruta, sens), atașate pe `TripResult` filtrate pe `(crm_route_id, going_north)`; `actions.ts`, `route-results.tsx` și tipul
`TripResult` intră în «Fișiere». Evită N cereri pe pagina de rezultate și o server action nouă.

**R2-E5 · low (−0.5) · «Id inactiv al aceleiași localități/rute/sens» nu se poate decide «cu ACEEAȘI funcție
`punctePentru`».** `punctePentru` întoarce doar active (pas 8), deci un id inactiv nu se distinge de unul străin fără o
citire separată după id. Iar «rangul 1 activ» poate să nu aibă pereche publicabilă pe ruta×sensul comenzii. Sugestie:
id ∉ lista activă → citire după id: aceeași `localitate` → primul din `punctePentru` (rangul minim al listei), altfel
`validare`; test pentru ambele.

**R2-E6 · low (−0.5) · Rândul 42 din «Verificat pe viu» afirmă «aceeași semantică» cu `buildReturAssignmentMap`, dar nu
e întru totul.** `buildReturAssignmentMap` dă ruta X returului care o suprascrie și NU și mașinii proprii a lui X
(`packages/db/src/assignments.ts:109-111`, `!map.has`), pe când `nomenclator.mjs:77-78` scrie retur pe X pentru AMBELE
mașini → mașina care n-a făcut returul X poate aduce evenimente pe X. Iar `retur_uses_route_id` nu apare deloc în
`assignments.ts` sau `pret.ts` (grep: 0), deci lărgirea «2 ↔ 16, ca în `buildReturAssignmentMap`» n-are sprijin în cod.
Sugestie: în pasul 2, cursele returului se iau doar pentru mașina dată de aceeași regulă ca `buildReturAssignmentMap`
(sau se aruncă cursele cu `cover` mic); faptul «ce `crm_route_id` poartă comanda pe ruta 2 retur» se verifică pe prod
(`calculeazaCurse` pe o căutare reală) înainte de a scrie lărgirea în `punctePentru`.

Fără observații noi: funcția nu face DELETE (FK din `bilete_comenzi`); copia nume/lat/lon din bază; ordinea migrație →
admin → web (web fără ruta `/puncte` primește 404 → `[]` → comportamentul de azi); urma brută include opririle, deci
segmentele acoperă și grupurile din sate; fereastra ±5 min peste `t0/t1` din `seg` acoperă gara de plecare.

Deduceri: R2-E1 −1.0 · R2-E2 −1.0 · R2-E3 −1.0 · R2-E4 −0.5 · R2-E5 −0.5 · R2-E6 −0.5.
Scor: 5.5 · Blocante (critical/high): 0

## Review runda 2: business-logic-auditor

Zona: fluxul comenzii (`creeazaComanda`, `bilete_creeaza_comanda`, pagina biletului, `/bilete`) și logica punctelor pe rută × sens. Citite: `apps/admin/src/lib/bilete/comenzi.ts:95-222` (origin/main 2d4508cd), `packages/db/src/assignments.ts:86-121`, `lde-geo-worker/mejgorod-parcare/mej/{nomenclator,curse}.mjs`; SQL read-only pe `zqkzqpfdymddsywxjxow` (cifrele de mai jos).

**Închise:**
- **BLA-1**: pondere + ≥ 2 mașini pe (grup × rută × sens), tabelul de perechi, «grup fără pereche nu se publică» (pas 4, 7). Închis.
- **BLA-2**: level_crossing / stop / give_way / traffic_calming / crossing=traffic_signals la ≤ 30 m, rulaj ≥ 2 probe sau `speed = 0`, numărarea pe motiv în raport (pas 2–6). Închis; vezi N4 pentru gări.
- **BLA-3**: parțial. Faptul `nomenclator.mjs:73-78` e corect pentru override IN, dar nu și afirmația «aceeași semantică cu `buildReturAssignmentMap`». Vezi N1 și N5.
- **BLA-4**: cerința intră în tichetele 5a/8 (pas 10). Închis.
- **BLA-5**: medoid, întindere ≤ 120 m, control ≤ 30 m de urmă (pas 4, 6). Închis.
- **BLA-6**: ION-197 pe main, fișierele reale, citire pe server (rând 50, pas 9). Închis.
- **BLA-7**: 1–4 și 6–7 închise (public.ts, public-paths, `nume_ru`, cheile comenzii, aceeași funcție, goingNorth = retur). 5 e închis ca intenție, dar căderea pe «rangul 1» e pe localitate. Sunt de acord cu N3 al security-auditor-ului (căderea = primul din `punctePentru` după rang); nu mai deduc a doua oară.

**N1 · medium (−1.0) · Returul «override OUT» e etichetat de două ori; nomenclatorul NU are semantica `buildReturAssignmentMap`.**
- **Fapt:** `nomenclator.mjs:79-80` scrie retur pe `crm_route_id` pentru orice rând cu `retur_route_id` NULL, chiar dacă în aceeași zi alt rând are `retur_route_id` = acea rută. `buildReturAssignmentMap` (`assignments.ts:99-117`) dă returul DOAR celui care l-a revendicat (pasul 1 câștigă). Mașina proprietarului rămâne «unclaimed».
- **Cifra:** SQL pe 24.06–01.10: **104 zile-rută pe 6 rute interurbane** în care o rută are două mașini etichetate «retur».
- **Scenariu:** `curse.mjs` acceptă cursa dacă urma trece la ≤ 3 km de ≥ 2 opriri (`curse.mjs:62-64`), fără prag pe `cover`. Mașina proprietarului face altceva (alt retur nescris, drum gol spre nord) și opririle ei intră pe (rută, retur) străină. Scăderea numitorului e sigură. Opririle ei la locuri pe unde autobuzul real al rutei nu trece umflă însă numărătorul pe perechi străine, adică exact clasa BLA-1.
- **Sugestie:**
  - `nomenclator-urcare` (sau `opriri.mjs` la citire) aplică pasul 2 al `buildReturAssignmentMap`: returul propriu se scrie doar dacă nimeni nu a revendicat ruta în ziua aceea;
  - suplimentar, cursa intră în pondere doar cu `cover` ≥ 0,8 și `oA`/`oB` capetele rutei (sau cele reale din ION-55).
  - Pasul 1 «rulat deja» trebuie re-rulat după corecție. Test: zi cu override OUT → o singură cursă retur pe rută.

**N2 · medium (−1.0) · «Ponderea ≤ 1 prin construcție» e fals → `control.mjs` poate opri toată scrierea.**
- **Scenariu:** numărătorul = curse cu un eveniment ÎN grup (DBSCAN eps 40, întindere admisă până la 120 m). Numitorul = curse a căror urmă trece la ≤ 60 m de MEDOID. O cursă care a oprit la marginea grupului, la 80–120 m de medoid (de exemplu pe sensul opus al unui bulevard sau pe o stradă paralelă cu sens unic), are urma la > 60 m de medoid. Intră deci în numărător, dar nu și în numitor → pondere > 1. Controlul din pasul 6 iese ≠ 0, iar nicio localitate nu se mai scrie. Pe 100 de zile × 30 de rute, un singur caz e de ajuns.
- **Sugestie:** numitorul = curse care trec la ≤ 60 m ∪ curse cu eveniment în grup; sau pragul de trecere = max(60 m, distanța maximă eveniment–medoid în grup). Controlul rămâne ca plasă.

**N3 · medium (−1.0) · Indexul unic parțial `(localitate, rang) WHERE activ` rupe reordonarea în `aplica`.**
- **Scenariu:** la o rulare nouă punctele 2 și 3 din Briceni își schimbă locul după scor. Indexul unic Postgres e verificat imediat, rând cu rând: un index nu poate fi DEFERRABLE, iar o constrângere UNIQUE nu poate avea WHERE. UPDATE-ul care dă rang 2 punctului vechi de rang 3 lovește rangul 2 încă activ → `duplicate key` → ROLLBACK. Asta se repetă la fiecare rulare: punctele rămân înghețate pe prima scriere, iar `scrie.mjs` iese ≠ 0 de fiecare dată (eșec zgomotos, dar permanent). Reactivarea unui id vechi pe un rang ocupat dă același lucru.
- **Sugestie:** în `aplica`, întâi `UPDATE … SET activ = false` pentru localitățile atinse, apoi UPDATE/INSERT cu `activ = true` și rangul nou, totul în aceeași tranzacție; sau o constrângere EXCLUDE `(localitate WITH =, rang WITH =) WHERE (activ) DEFERRABLE INITIALLY DEFERRED`. În testele migrației: probă cu schimb de rang 2 ↔ 3 și cu reactivare.

**N4 · low (−0.5) · Gara nu e scutită de filtrul de obstacole.**
- **Scenariu:** pasul 4 scutește gările doar de durată («fără plafon»). Excluderea «≤ 30 m de orice obstacol fix» și controlul din pasul 6 se aplică tuturor grupurilor. O autogară lângă un semafor sau o trecere de pietoni semaforizată (Bălți, Chișinău) iese din listă. Rangul 1 devine atunci «intrarea», iar `control.mjs` nu observă: Verificarea cere gara doar pentru Briceni, Edineț și Bălți, și doar manual.
- **Sugestie:** grupurile din `STATII` sunt scutite de filtrul de obstacole; `control.mjs` iese ≠ 0 dacă o localitate cu gară în `STATII` și bilete în top 15 nu are gara activă pe rang 1.

**N5 · low (−0.5) · Lărgirea cu `retur_uses_route_id` e justificată greșit și scrisă prea specific.**
- **Fapt:** `buildReturAssignmentMap` și căutarea (`pret.ts`, `areSofer`) NU folosesc `retur_uses_route_id` (grep pe `packages/db/src`, `apps/admin/src/lib`: 0). Pe prod: ruta 2 are `retur_ascuns = true`, `bilete_online_retur = false`, `retur_uses_route_id = 16`. Din 100 de rânduri ale rutei 2, 83 au `retur_route_id = 16` (deja pe ruta 16 prin override IN) și 13 au NULL (etichetate «retur ruta 2» de nomenclator, deși fizic e returul lui 16).
- **Concluzie:** lărgirea e corectă doar într-un sens: comanda pe 16 retur primește și perechile «2 retur». Sensul invers nu are comenzi.
- **Sugestie:** regula se scrie generic: «pentru comanda pe ruta R retur se adaugă perechile rutelor A cu `A.retur_uses_route_id = R`», nu «2 ↔ 16». Rândul 42 se corectează: lărgirea e regulă nouă, nu semantica `buildReturAssignmentMap`. Și mai simplu: nomenclatorul etichetează direct returul rutei A pe `retur_uses_route_id`, iar API-ul nu mai lărgește nimic.

**Fără observații:**
- `going_north = true` ⇔ retur, consecvent cu `comenzi.ts:111,117` (`time_chisinau` la goingNorth) și cu `nomenclator.mjs` (`s: 'retur'` pe `hC`);
- `localitate` = `crm_stop_fares.name_ro` exact, fiindcă nomenclatorul ia numele direct din `crm_stop_fares` (`nomenclator.mjs:52-66`);
- împăcarea, refund-ul și `asiguraSesiunea` nu ating coloanele noi;
- reluarea pe aceeași cheie întoarce comanda cu punctul ei inițial (documentat).
- Pragul «≥ 2 mașini pe rută × sens» e strict pentru rutele cu mașină dominantă (14 din 30 au ≥ 90 % zile cu aceeași mașină la tur). Eșecul e sigur (lipsește punctul), deci doar se cere ca raportul să numere perechile tăiate de acest prag.

Deduceri: N1 −1.0 (medium) · N2 −1.0 (medium) · N3 −1.0 (medium) · N4 −0.5 · N5 −0.5.
Scor: 6.0 · Blocante (critical/high): 0

## Revizorii Claude — runda 2 (triaj)

| id | sev. | decizie | ce s-a schimbat |
|---|---|---|---|
| sec N1 / be R2-E3 | high / med | acceptat | fără `plafonPublic` pe `/puncte`; tot tabelul activ în memorie; cache 60 s pe site (pas 8, 9) |
| sec N2 | low | acceptat | comparare exactă cu `name_ro` din `gasesteCursa`, fără `ilike` |
| sec N3 / be R2-E5 / BL BLA-7.5 | low | acceptat | căderea = primul din `punctePentru(ruta, sens)`; id ∉ listă → citire după id |
| sec N4 | low | acceptat | CHECK-uri în tabel |
| be R2-E1 / BL N2 | med | acceptat | numitorul = reuniune; control «≤ 30 m de urmele a ≥ 2 mașini» |
| be R2-E2 / BL N3 | med | acceptat | `aplica`: întâi dezactivare, apoi reactivare/INSERT; test cu ranguri inversate |
| be R2-E4 | low | acceptat | o cerere în căutare, puncte pe `TripResult`, `route-results.tsx` → formular |
| be R2-E6 / BL N1 / BL N5 | med / low | acceptat | pas 1b: regula `buildReturAssignmentMap` + `retur_uses_route_id` în etichetare, `cover ≥ 0,8`; API fără lărgire; rândul din «Verificat pe viu» corectat |
| BL N4 | low | acceptat | gările scutite de obstacole; control «gara pe rang 1» |
| BL (fără deducere) prag ≥ 2 mașini pe rută | — | acceptat | înlocuit cu ≥ 5 zile distincte pe ruta×sens; raportul numără perechile tăiate |

## Critic extern - runda 1

Codex (gpt-6-astra): scor 5.5, verdict fail, 1 high. Fișier brut: scratchpad `critic-round-1.json`.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | reetichetarea retururilor (`retur_uses_route_id`) schimbă cheia (z, r, s, m); cursele vechi au ferestrele/opririle rutei A | acceptat | pas 1b: corecția atribuirilor ÎNAINTE de `curse.mjs`, care se re-rulează pe atribuirile corectate; prima rulare se aruncă; test cu ruta 2 → 16 |
| C2 | low | `name_ro` canonic nu e încărcat de `incarcaCurse` / `TimetableStop` | acceptat | pas 8 + fișiere: `pret.ts`, `timetable.ts`, `pret.test.ts`, `gasesteCursa` întoarce `fromNameRo` |
| C3 | medium | «deplasare < 25 m» admite mers continuu la probe de 5 s | acceptat | geometria suplinește doar viteza lipsă: < 1,5 m/s și rază 15 m; probă negativă 15 km/h × 5 s |
| C4 | medium | unirea grupurilor nu revalidează coordonata pe fiecare pereche | acceptat | unirea refiltrează tot; medoidul ≤ 30 m de ≥ 2 opriri ale fiecărei perechi, altfel distincte / pereche scoasă; control în pas 6 |

## Review runda 3: senior-backend-engineer

Verificat: pas 1b/2/4/6/7 față de `lde-geo-worker/mejgorod-parcare/mej/curse.mjs:11,37-60,101-108` și
`nomenclator.mjs:73-82`; SQL read-only pe prod (fereastra 24.06–01.10).

**Închise:** C1 — `curse.mjs:11,37-42` citește `atribuiri` din `nomenclator${SUFIX}.json` și ia opririle/orele după
`a.r`, deci rescrierea `atribuiri` înaintea rulării a doua dă ferestrele și opririle rutei-destinație; rularea 1 aruncată
e corect. R2-E6/BL N1 — regula `buildReturAssignmentMap` în 1b. C3 — suplinirea geometrică doar pentru `speed = null`,
1,5 m/s ≈ 2,9 noduri, coerent cu pragul. C4 — unirea refiltrează și cere ≥ 2 evenimente ale fiecărei perechi.
R2-E1 (reuniune), R2-E2 (dezactivare întâi), R2-E3, R2-E4, R2-E5 — închise în text.

**R3-E1 · low (−0.5) · Regula a treia din 1b nu spune ce se întâmplă când B are deja retur în ziua aceea.**
Retururile proprii ale rutei A (`retur_uses_route_id = B`) se etichetează pe B, dar nu se spune dacă asta e o
«revendicare» a lui B (care taie returul propriu al lui B) sau dacă se renunță la ea când B e revendicată / are retur
propriu → două mașini pe (z, B, retur), exact clasa BL N1. Fapt (SQL): azi 13 zile de reetichetat 2 → 16, 0 coliziuni
(16 nici revendicată, nici cu retur propriu în acele zile) → doar regula lipsește. Sugestie: «reetichetarea A → B se
aplică doar dacă B nu are deja retur în ziua aceea (revendicat sau propriu); altfel se aruncă» + test.

**R3-E2 · low (−0.5) · Unirea refuzată lasă două puncte la < 150 m, în contradicție cu «top 3 la ≥ 150 m».**
Pas 4: «altfel grupurile rămân distincte (dacă încap în top 3)», dar aceeași listă cere ≥ 150 m între puncte, iar
`control.mjs` (pas 6) nu verifică distanța. Pasagerul primește două butoane la 60–140 m. Ordinea unirilor într-un lanț
A–B–C (A–B și B–C < 150 m, A–C > 150 m) nu e fixată → rezultat dependent de ordine. Sugestie: unirea lacomă în ordinea
scorului; unire refuzată → grupul cu scor mai mic iese (perechile lui compatibile trec pe cel păstrat, cele
incompatibile se pierd); control: ≥ 150 m între punctele active ale unei localități.

**R3-E3 · low (−0.5) · `cover ≥ 0,8` poate elimina sistematic rute întregi, tăcut.** `cover` = opririle rutei la ≤ 3 km
de `seg` / toate opririle cu oră (`curse.mjs:101,107`), iar `seg` e tăiat la capătul REAL (`curse.mjs:64-79`). Rutele ale
căror retururi se opresc constant înainte de capătul din grafic (memoria ION-55: retururi la Briceni/Lipcani, ruta 24 la
Briceni) pot sta toate sub 0,8 → ruta×sens fără nicio pereche → punctele ei lipsesc (eșec sigur, dar nevăzut). Sugestie:
raportul (pas 5) numără pe rută×sens cursele tăiate de `cover`; `cover` se calculează pe opririle dintre `oA` și `oB`
sau pragul se verifică pe distribuția reală din `curse-urcare.json` înainte de pasul 4.

**R3-E4 · low (−0.5) · Proba negativă din C3 nu exercită ramura nouă.** La 15 km/h `speed` ≈ 8 noduri, deci mersul
continuu e respins de pragul de viteză, nu de geometrie. Sugestie: aceeași probă cu `speed = null` pe toate probele
(15 km/h la 5 s → 21 m între probe → zero evenimente) + o probă pozitivă cu `null` pe loc (rază < 15 m → eveniment).

Fără observații noi: funcția SQL (dezactivare → potrivire ≤ 50 m → INSERT → perechi → RAISE) nu mai lovește indexul
unic; punctele noi sunt ≥ 150 m între ele, deci un punct vechi se potrivește cu cel mult unul nou (cu R3-E2 aplicat).
Recomandare minoră fără deducere: la mai multe puncte inactive ≤ 50 m se alege cel mai apropiat (determinism).

Deduceri: R3-E1 −0.5 · R3-E2 −0.5 · R3-E3 −0.5 · R3-E4 −0.5.
Scor: 8.0 · Blocante (critical/high): 0

## Review runda 3: business-logic-auditor

Am verificat C1, C2, C4 și triajul rundei 2. Am citit `comenzi.ts:106-119`, `pret.ts:146-157`, `timetable.ts:9-14` și `actions.ts:231-348` (origin/main 2d4508cd), plus `curse.mjs:107` (câmpul `cover` există). Am rulat un SQL read-only pe prod.

**Închise:**
- **N1.** Pasul 1b aplică regula `buildReturAssignmentMap` înainte de `curse.mjs`, iar prima rulare se aruncă. În analiză intră doar cursele cu `cover ≥ 0,8`. Testul cu override OUT e scris.
- **N2.** Numitorul e o reuniune, deci ponderea e cel mult 1 prin construcție.
- **N3.** Ordinea din `aplica`: întâi dezactivarea, apoi UPDATE/INSERT. Proba 2 ↔ 3 și reactivarea sunt în `--dry-run`.
- **N4.** Gările sunt scutite de obstacole. Controlul «gara pe rang 1» acoperă toate localitățile.
- **N5.** Ruta 2 e etichetată pe 16 în pasul 1b, iar API-ul nu mai lărgește nimic.
- **C2, partea din panou.** `gasesteCursa` găsește deja `from` pe ruta cursei (`comenzi.ts:113`), deci `from.name_ro` dă direct `fromNameRo` canonic.

Nu am găsit defecte noi în fluxul comenzii: căderea pe primul punct, `validare` doar pentru altă localitate, copia din bază și cheia fără punct sunt consecvente.

**R3-1 · low (−0.5) · Site-ul cere punctele cu `fromRo` brut, iar API-ul compară exact cu `name_ro`.**
- **Scenariu:** pasul 9 face «o singură cerere pentru localitatea «de»» din `searchTrips(fromRo, …)` (`actions.ts:231`). `incarcaCurse` găsește opririle prin `ilike` (`pret.ts:41`), deci acceptă și un `fromRo` cu altă capitalizare (de exemplu un link `/autobuz/...` sau un parametru din URL). Comparația exactă din `puncteLocalitate` întoarce atunci `[]`, iar formularul nu întreabă nimic. Pe partea panoului, `creeazaComanda` folosește `fromNameRo` canonic, deci găsește punctele, nu primește id și pune «primul din listă». Clientul primește un punct de urcare pe care nu l-a văzut și nu l-a ales.
- **Sugestie:** site-ul cere punctele cu `name_ro` din `datele.fromStops` (după ce `TimetableStop` are `name_ro`), nu cu `fromRo`. Test: `fromRo` scris cu litere mici → aceeași listă.

**R3-2 · low (−0.5) · Regula de unire din C4 contrazice distanța de 150 m dintre punctele din top 3.**
- **Fapt:** pasul 4 cere «top 3 la ≥ 150 m între ele». Totuși, un grup unit care pică refiltrarea «rămâne distinct (dacă încape în top 3)». Asta poate publica două puncte la 60–140 m unul de altul. Pasul 6 nu verifică distanța de 150 m.
- **Sugestie:** dacă unirea pică, se păstrează doar grupul cu scorul mai mare (perechile celuilalt se pierd, ceea ce e un eșec sigur). În `control.mjs` se adaugă «două puncte active ale aceleiași localități ≥ 150 m».

**Notă fără deducere: precedența în pasul 1b.** Regula «A cu `retur_uses_route_id = B` → B» nu spune ce se întâmplă când B are deja returul revendicat sau propriu în aceeași zi, adică un posibil dublu retur, clasa lui N1. Pe prod, SQL pe 24.06–01.10: ruta 2 are 13 zile cu `retur_route_id` NULL; în niciuna, ruta 16 nu e revendicată și nici nu are retur propriu. Sugestie: aceeași condiție «doar dacă nimeni nu ocupă B în ziua aceea», plus un test.

Deduceri: R3-1 −0.5 · R3-2 −0.5.
Scor: 9.0 · Blocante (critical/high): 0

## Revizorii Claude — runda 3 (triaj)

| id | sev. | decizie | ce s-a schimbat |
|---|---|---|---|
| be R3-E1 / BL notă | low | acceptat | 1b: A → B doar dacă B e liberă în ziua aceea; test sintetic |
| be R3-E2 / BL R3-2 | low | acceptat | unire lacomă după scor; refuz → rămâne grupul mai bun; control ≥ 150 m |
| be R3-E3 | low | acceptat | raport pe `cover`; cădere pe capetele reale dacă se pierde > 50 % |
| be R3-E4 | low | acceptat | probele cu `speed = null` (negativă + pozitivă) |
| BL R3-1 | low | acceptat | site-ul cere punctele cu `name_ro` canonic din `fromStops` |

## Critic extern - runda 2

Codex (gpt-6-astra): **scor 9.5, verdict pass**, 0 critical/high. Fișier brut: scratchpad `critic-round-2.json`.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | low | retragerea din cache nu e ≤ 5 min (straturi independente) | acceptat | Riscuri: limita cumulată ~11 min scrisă; formularele deschise separate; validarea pe server cade pe punctul activ |

## Gate

| Partea | Scor (metrică) | critical/high deschise |
|---|---|---|
| Claude — minimul revizorilor (runda 3; security: runda 2) | 6.5 (security r2; toate observațiile acceptate) · backend 8.0 · BL 9.0 | 0 |
| Codex — critic extern (runda 2) | 9.5 | 0 |

Istoric: Claude r1 min 2.0 (3 high) → r2 min 5.5 (1 high) → r3 min 8.0 (0); Codex r1 5.5 fail (1 high) → r2 9.5 pass.
