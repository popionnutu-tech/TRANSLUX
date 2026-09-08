# LDE «Camioane» — dispecerat zilnic + analitică livrări/trasee

Data: 2026-08-31 · Aprobat pe secțiuni de Ion în interviul de descoperire (14 întrebări).
Stadiu: design aprobat în chat; urmează planul de implementare.

## Problema

Flota de camioane (cisterne diesel/biodiesel, zernovozuri) nu are planificare zilnică în
sistem. Dispecerul decide din memorie și greșește logistic (camionul din Bălți trimis la
Constanța, cel din Chișinău la Berdichev). Nu există vedere «unde-i fiecare camion azi și
mâine», nici analiză a livrărilor și a traseelor, deși toate camioanele au GPS (Wialon)
și LDE are deja Valhalla pentru traseul ideal.

Fluxuri de marfă curente: diesel spre stațiile TLX din Moldova (majoritar) și uneori spre
Ucraina; biodiesel din Ucraina spre Moldova, majoritar spre Bulgaria/România.

## Deciziile din interviu (sursa adevărului)

1. Un singur dispecer, lucrează la calculator → interfață web.
2. Toate camioanele pe un ecran; mini app-ul «Atribuiri» rămâne managerilor de uzine.
3. Unitatea de planificare = cursa întreagă (multi-zi): încărcare → descărcare.
4. Stări în afara cursei: doar Reparație și Odihnă șofer.
5. La atribuire softul avertizează («ai un camion mai aproape cu X km»); decide omul.
6. Marfa e etichetă liberă; fără restricții diesel↔biodiesel, fără spălare.
7. Fără comenzi/contracte în v1; clientul e text liber pe cursă.
8. Analitică v1 (toate patru): traseu real vs ideal; planificat vs real la timp;
   utilizarea flotei; km goi vs încărcați.
9. Puncte de încărcare/descărcare = nomenclator cu coordonate + adăugare din mers din
   formularul cursei.
10. Șoferii nu ating softul; află cursa prin telefon, ca acum.
11. Ecran principal: Kanban pe stări + hartă cu pozițiile GPS live.
12. Planificarea viitoare: calendar-grilă separat (camioane × zile, curse ca bare).
13. Stările cursei se mută MANUAL de dispecer; GPS-ul doar pe hartă. Adevărul GPS se
    calculează noaptea, post-factum.
14. Abaterile de la traseu — doar în analitică; fără alerte (Ion a respins alertele live
    și la km-zilnic).
15. Rol nou DISPECER; fila Analitică doar ADMIN.
16. Tipuri de camioane: cisternă, zernovoz. «Fără șofer» NU e tip: camionul fără șofer
    legat nu lucrează și iese din planificare; dacă GPS-ul îi arată km substanțiali,
    softul cere atribuirea unui șofer (insignă, nimic automat).
17. Totul sub UN singur loc: `/lde/camioane`, cu file interne — nu pagini împrăștiate.

## Ne-scopuri (v1)

- Fără comenzi client, prețuri, tonaje, facturare.
- Fără notificări/confirmări pentru șoferi.
- Fără mutare automată a stărilor din GPS și fără alerte live.
- Fără optimizare automată a atribuirii (softul doar avertizează).
- Fără restricții de compatibilitate a mărfii.

## Arhitectură (varianta A aprobată)

Extindere în `/lde` existent. Refolosește: registrul de camioane și legăturile
mașină-șofer din `/lde/parc`, accesul Wialon și Valhalla de pe VPS-ul `lde-worker`,
mecanismul de track-uri din km-zilnic, normele gol–încărcat (migr. 241), tiparul de
audit de la Piese.

### Model de date (Supabase)

1. `fleet_type` — coloană nouă pe registrul existent de camioane: `cisterna` | `zernovoz`.
2. `dispatch_points` — id, nume, țară, lat/lng (pin), rază_m, creat_de, creat_la.
   Punct fără pin se salvează cu insignă «fără coordonate»; cursele lui nu primesc
   metrici GPS până la pin.
3. `truck_trips` — camion, șofer (precompletat din parc, modificabil), marfă (text:
   diesel/biodiesel/altul), client (text liber), punct_încărcare + planificat_încărcare
   (timestamp), punct_descărcare + planificat_descărcare, stare
   (`planificata` → `spre_incarcare` → `la_incarcare` → `spre_descarcare` →
   `la_descarcare` → `incheiata`, plus `anulata` cu motiv), note, audit (cine+când la
   creare și la fiecare modificare).
   Invariant: un camion nu are două curse suprapuse în timp — formularul blochează.
   Cursele nu se șterg — se anulează.
4. `truck_day_states` — camion, zi, `reparatie` (motiv + dată estimată ieșire) sau
   `odihna`.
5. `truck_trip_metrics` — scrise de jobul nocturn, per cursă: km_real, km_ideal
   (Valhalla încărcare→descărcare), abatere_km, opriri >30 min în afara punctelor
   (număr + locații), sosire_reală_încărcare, sosire_reală_descărcare (geofence pe
   raza punctului), întârziere_min față de plan.
6. Camioanele de uzine: stare derivată read-only din atribuirile existente
   (`atribuiri-zilnice`) — apar în kanban, nu primesc `truck_trips`. Fără date duble.

### Ecrane — totul în `/lde/camioane`, patru file

1. **Dispecerat** (fila implicită) — Kanban + hartă:
   - coloane: Liber · În cursă (sub-starea pe cartonaș) · Reparație · Odihnă ·
     Fără șofer (DOAR cele cu insigna «merge dar n-are șofer»; restul ascunse);
   - cartonaș: plăcuță, tip, șofer, cursa curentă (de unde → încotro, marfa),
     următorul termen planificat;
   - harta: poziții GPS live, culoare după stare, click pin → cartonaș;
   - acțiuni din cartonaș: Cursă nouă, Reparație, Odihnă, mutarea stării cursei.
2. **Planificare** — grilă: rânduri = camioane (grupate pe tip), coloane = zile
   (2 săptămâni), cursele ca bare colorate pe marfă, reparație/odihnă hașurate;
   click pe celulă goală → cursă nouă precompletată.
3. **Puncte** — nomenclatorul: listă + hartă, adăugare/editare pin și rază.
4. **Analitică** — vizibilă doar ADMIN; patru blocuri pe perioadă:
   trasee (real vs ideal, top abateri, opriri, hartă suprapusă), punctualitate
   (întârzieri pe șofer/direcție), utilizare (zile cursă/reparație/odihnă/degeaba pe
   camion/lună — agregare SQL la deschidere), km goi vs încărcați (normele migr. 241).

Formularul cursei (comun Dispecerat + Planificare): de unde → încotro cu căutare în
nomenclator și «adaugă punct» inline (pin pe hartă); avertizarea anti-greșeală: distanța
GPS a camionului ales până la punctul de încărcare + «camioane mai aproape: … cu X km
mai puțin» — informativ, fără blocare.

### GPS și workerul nocturn

1. Poziții live: endpoint în admin, citește Wialon doar cât fila Dispecerat e deschisă
   (refresh ~60s). Fără polling de fundal.
2. Job nocturn pe VPS-ul `lde-worker`, per cursă activă sau încheiată ieri:
   track-ul zilei din Wialon → sosiri/plecări din razele punctelor → ore reale și
   întârzieri; km reali din track vs km ideali Valhalla → abatere; opriri >30 min în
   afara punctelor. Totul în `truck_trip_metrics`; analitica doar citește.
3. Semnal «fără șofer dar merge»: același job — camion fără legătură de șofer + km/zi
   peste prag (pornim de la pragul existent de 5 km/zi de la km_parcare) → insignă în
   kanban a doua zi. Nimic automat dincolo de insignă.

### Roluri și siguranțe

- Rol nou `DISPECER`: vede filele Dispecerat, Planificare, Puncte. Analitică — doar
  `ADMIN`. `MANAGER_LDE`/`UZINE` neschimbate.
- Audit pe curse și stări (cine+când, valoarea veche) — tiparul Piese.
- Anulare cu motiv în loc de ștergere.
- Suprapunerea curselor pe același camion — blocată în formular și printr-o verificare
  server-side.

## Ordinea livrării

1. **Etapa 1**: migrații + fila Planificare + formularul cursei + fila Puncte —
   planificarea funcționează din prima zi.
2. **Etapa 2**: fila Dispecerat (kanban + hartă live + avertizarea «camion mai aproape»).
3. **Etapa 3**: jobul nocturn + fila Analitică + semnalul «fără șofer dar merge».

Fiecare etapă e utilizabilă singură; fiecare trece prin ciclul obișnuit de review
(architecture-guardian + performance-reviewer + business-logic-auditor, security la
final) înainte de deploy.

## Abateri conștiente față de designul inițial (după implementare)

Constatate în review și decise pe loc, ca să nu rămână doar în cod:

1. **Tipul camionului** stă în `lde_truck_profile`, nu ca o coloană pe `vehicles`:
   tabela e partajată cu autobuzele și cu workerul Wialon.
2. **«km ideali» depind de `ROUTING_URL`**, care nu există încă în infrastructură
   (Valhalla de pe VPS acoperă doar Moldova, camioanele merg în UA/RO/BG). Fără
   el metrica rămâne NULL și blocul «Abateri de traseu» spune deschis că lipsește.
   De decis separat: instalare hartă Europa sau furnizor extern.
3. **«Are șofer»** = atribuire activă în parc SAU șofer pus pe cursa activă.
   Numai prima sursă ar fi ascuns cursele celor 23 de camioane fără atribuire.
4. **Cursa activă bate starea zilei** în kanban (reparația apare ca insignă):
   altfel butonul care încheie cursa devenea inaccesibil.
5. **Km-ii pentru semnalul «merge fără șofer» sunt de IERI** — `lde_vehicle_gps_daily`
   se scrie noaptea, pe «azi» n-ar fi pornit niciodată.
6. **«Km goi» e o estimare**, nu o măsurătoare: diferență între calculul zilnic al
   flotei și suma curselor măsurate, două calcule apropiate dar nu identice.
   Coloana `empty_km` rămâne nescrisă până la o măsurare directă a segmentului gol.
7. **Punctualitatea se judecă doar pe cursele măsurate**; cele fără sosire detectată
   apar separat în coloana «Măsurate», nu se numără punctuale.
8. **Workerul face două treceri** (curse încheiate în ziua dată + curse rămase
   deschise din ultimele 7 zile), ca întârzierile mari să nu iasă din fereastră.

## Praguri și detalii amânate deliberat

- Raza implicită a punctelor (propunere: 500 m; terminalele mari pot primi mai mult) —
  se calibrează pe primele curse reale.
- Pragul «km substanțiali» pentru semnalul fără-șofer (pornim 5 km/zi) — la fel.
- Definiția segmentului «gol» pentru km goi vs încărcați: de la descărcarea cursei
  precedente până la încărcarea cursei curente.

## Completare 08.09.2026 — starea «plin, așteaptă descărcarea»

Ion: «auto uneori sunt pline și așteaptă descărcarea». Pe teren, între încărcare și
descărcare camionul stă uneori plin — la bază, până vine comanda, sau la coadă la
destinație. Până acum asta se vedea ca «spre descărcare» ori «la descărcare», deci
ca un camion care rulează.

Decizii:
- E stare de **cursă** (`lde_truck_trips.status = 'asteapta_descarcare'`), nu stare de
  zi: camionul nu e liber (are marfă), doar nu se mișcă. Migrația 325 lărgește CHECK-ul.
- E **laterală**, nu pe drumul obișnuit: o cursă normală nu face un click în plus.
  Se intră din «la încărcare» sau «spre descărcare» (al doilea buton, mai șters), se iese
  «spre descărcare» sau «la descărcare». Tranzițiile sunt în `lib/lde/camioane.ts`
  (`stariUrmatoare`), nu în UI.
- Rămâne «în cursă» pentru numărătoare și pentru constrângerea de suprapunere, dar
  banda, kanban-ul și mini app-ul TLX o numără și o filtrează separat («pline»).
  Bara păstrează culoarea mărfii, hașurată — marfa e acolo, camionul stă.
- Întârzierea se calculează la fel: plin peste ora planificată = întârziat, pentru că
  marfa n-a ajuns.
- Stările se afișează cu cuvinte (`etichetaStareCursa`), nu cu codul din bază.

## Completare 08.09.2026 — stările automate: GPS → «la descărcare», TLX → «încheiată»

Ion: «dacă mașina s-a încărcat la Constanța, a ajuns în Moldova și stă, stă, stă, și
încă nu e descărcare în TLX — se pune singură «la descărcare». Dacă descarcă la o
stație TLX, luăm din TLX când s-a descărcat și închidem cursa. Dacă descarcă în altă
parte (baza Briceni), nu va fi închidere — dispecerul o face manual.» Ne-scopul «fără
mutare automată a stărilor din GPS» din v1 se ridică parțial: DOAR aceste două treceri,
doar cu dovadă, și dispecerul păstrează toate butoanele.

Decizii:
- **Două surse, două treceri**, în `lde-geo-worker/trip-auto.mjs` (pur, testat) și
  `trip-live-worker.mjs` (I/O, crontab la 5 minute pe VPS-ul `lde-worker`):
  - **GPS → `la_descarcare`**: din `la_incarcare` / `asteapta_descarcare` /
    `spre_descarcare`, când camionul stă (sub 5,6 km/h) în raza punctului de descărcare
    (plafonată 200–2000 m, ca în trip-worker), cu poziție Wialon de cel mult 30 min, și
    rămâne acolo ≥ 15 minute. Prima observare se ține în `unload_seen_at`; ieșirea din
    rază sau mișcarea o șterge. Din «planificată»/«spre încărcare» nu se trece: un camion
    gol lângă stație nu descarcă nimic.
  - **TLX → `incheiata`**: din orice stare cu marfă (și din `la_descarcare`), când în
    TLX `fuel_receipts` apare o recepție cu `nr_auto` = plăcuța camionului, la stația
    care stă pe punctul de descărcare al cursei (stația TLX la ≤ 300 m sau în raza
    punctului), cu momentul descărcării (`unloaded_at`, altfel `created_at`) în fereastra
    cursei (1 h înainte de încărcare … 3 zile după descărcarea planificată). O recepție
    închide o singură cursă (index unic pe `tlx_receipt_id`). Punct fără stație TLX
    (bază, depozit Briceni, Ruse, Sofia) → nimic automat, rămâne dispecerul.
- **Doar în Moldova** (Ion, 08.09: «închiderea automată e posibilă doar în Moldova;
  de fapt descărcarea de diesel se închide doar în Moldova»): închiderea din TLX cere
  `country` = Moldova pe punctul de descărcare, indiferent de coordonate; trecerea GPS
  «la descărcare» pentru marfa `diesel` cere același lucru — o cisternă cu motorină
  oprită la Constanța sau în vamă nu e la descărcare. Biodieselul (Ruse, Sofia) și
  cerealele primesc trecerea GPS oriunde e punctul lor.
- **Scrierea e optimistă**: `PATCH … status=eq.<starea citită>`. Dacă dispecerul a
  apăsat între timp, automatul nu suprascrie. Acțiunea manuală pune `status_source =
  'manual'`, deci omul bate mereu automatul.
- **Se vede cine a pus starea**: `status_source` (manual/gps/tlx), `status_changed_at`,
  iar la închiderea din TLX: `tlx_receipt_at`, `tlx_receipt_liters`. Panoul cursei din
  bandă le arată cu cuvinte (`descriereSursaStare`). Audit-ul complet rămâne în
  `lde_audit_log` (`updated_by = 'auto:gps' / 'auto:tlx'`).
- **Migrația 329** adaugă coloanele; CHECK-ul stărilor nu se schimbă.
- **De ce pe VPS, nu în Vercel**: cron-ul Vercel de pe planul curent rulează cel mult
  zilnic, iar cheile TLX și Wialon există deja în `.env`-ul workerului. Fișiere de
  copiat pe VPS: `trip-auto.mjs`, `trip-live-worker.mjs`, `wialon-api.mjs`
  (funcția nouă `listUnitsPozitii`), plus linia de crontab din `run-nightly.sh`.

Limite cunoscute:
- Recepțiile TLX se introduc uneori cu zile întârziere (văzut 08.09: descărcare pe
  04.09, scrisă pe 08.09) — închiderea automată vine când vine recepția; între timp
  cursa stă «la descărcare», iar dispecerul o poate închide manual oricând.
- O cisternă care descarcă la mai multe stații într-o zi are o singură cursă cu un
  singur punct de descărcare: se închide la recepția de la ACEA stație, celelalte
  recepții n-o ating.

## Completare 08.09.2026 — «scena» camionului, cu țara

Ion: «când e în drum pe traseu, trebuie numită țara. Dacă nu e în reparație, nu în
odihnă, nu la descărcare în Moldova, ori la descărcare cu biodiesel în Bulgaria sau
România — atunci unde se află. Toate scenele astea trebuie să se vadă.»

Decizii:
- **Țara din GPS, fără serviciu extern**: `lib/lde/tara.ts` + `tari-poligoane.json`
  (Natural Earth 10m, 22 de țări de pe drumurile camioanelor, simplificate la ~300 m
  pentru MD/RO/UA/BG și ~800 m pentru rest; ~200 KB). Se calculează DOAR pe server
  (ruta de poziții și API-ul extern), clientul primește `tara` gata. În afara
  poligoanelor (mare, țări neincluse) → null, iar textul rămâne fără țară — nu ghicește.
  Transnistria e Moldova. Testat pe vămi (Leușeni/Huși, Giurgiulești/Galați, Ruse/Giurgiu).
- **`undeEste` primește țara**: «în drum prin România, 250 km de Port Constanța»;
  aproape de punct «la 12 km de TLX Bălți (Moldova)»; în punct «la TLX Bălți».
- **`scenaCamion`** (pur, testat) dă propoziția, în ordinea dovezilor: reparație /
  odihnă (cu «până la») → starea cursei la punct («la descărcare diesel, TLX Bălți
  (Moldova)», «la descărcare biodiesel, Ruse (Bulgaria)», «plin, așteaptă descărcarea
  la …», «la încărcare, Port Constanța (România)») → GPS cu țara → «fără poziție GPS
  recentă». Țara punctului vine din `lde_dispatch_points.country`.
- Banda arată scena sub numele șoferului (în locul vechiului «acum: …»); API-ul
  extern pentru mini app-ul TLX întoarce `scena` și `tara` lângă `unde`.
