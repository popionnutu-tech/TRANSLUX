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
