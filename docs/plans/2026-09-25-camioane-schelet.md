# Camioane: scheletul ideal al coridoarelor de cisterne (un an de GPS)

## De ce
Ion, 25.09: «facem scheletul ideal la camioane pentru transportare: biodiesel direct din Berdichev la
Constanța sau Bulgaria (Sofia/Ruse); biodiesel prin Ungheni la Constanța sau Bulgaria; biodiesel la
Chișinău; diesel din Constanța spre stațiile TLX și depozitele petroliere. Uită-te în trecut 1 an,
trebuie găsit traseul ideal pentru toate rutele».
Azi `lde_truck_trip_metrics.km_ideal` e mereu gol, pentru că Valhalla de pe VPS are doar harta Moldovei
(`trip-worker.mjs`: «traseu ideal indisponibil»). Nu există niciun etalon pentru cisterne.

## Ce facem
**Deciziile lui Ion (25.09):**
- **Criteriul:** **km minimi** pe drum permis unei cisterne ADR. Timpul și așteptarea la vamă se arată alături, dar nu decid.
- **Hărțile:** MD+UA+RO+BG se construiesc și rulează **pe Mac mini**. Colima se **oprește după analiză**.
- **Descărcarea hărților:** fișierele `.pbf` se descarcă **prin VPS**.
- **Rezultatul:** iese **întâi ca Artifact**; **fila LDE vine ulterior**, cu tichet separat.
- **Destinațiile motorinei:** **cele 8 stații TLX de pe tlx.md + depozitele Briceni și Bălți**.
- **Vămile:** o vamă trecută **măcar o dată** de o cisternă a noastră e «parcursă» (poate intra în ideal).
- **Constanța:** **locul de descărcare a biodieselului se află din GPS** și i se arată lui Ion.

Variante respinse:
- *Valhalla cu 4 țări pe VPS:* VPS-ul are 2 nuclee și 3,8 GB RAM, din care disponibili între 0,6 și 2,7 GB (două măsurători). Construirea hărților din 1,4 GB de `.pbf` nu încape, și nici serviciul nu încape lângă cel al Moldovei.
- *Router comercial (HERE/PTV):* cere cont și bani. Oricum nu știe ce vămi primesc azi cisterne ADR (UA e în război), iar asta știe doar GPS-ul nostru.
- *Doar urmele GPS (ca la mejgorod):* nu arată drumurile mai scurte pe care nu le-a mers nimeni, deci nu răspunde la întrebarea «ideal».

**Principiul:** ideal = cel mai scurt dintre candidații de mai jos, pe fiecare pereche origine→destinație (O→D):
- (a) cea mai scurtă cursă reală cu urmă bună;
- (b) etalonul fiecărui coridor parcurs;
- (c) rutele Valhalla camion-hazmat forțate prin vămile **deja trecute de camioanele noastre**.

O rută doar-router printr-o vamă neparcursă se arată «propus, neverificat», nu ca ideal.

## 🔬 Verificat pe viu
| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Wialon are un an de istoric | `wialon-depth.mjs` pe VPS (citire, `messages/load_interval` pe 15 ale fiecărei luni, 6 camioane, ferestre de 3 zile) | Date din **2025-09** (ANT347 218, IIC263 1661, KYK742 2187 mesaje/3 zile). **2025-08 = 0** la toate 6. Luni goale la unele: MOW214 03–01.2026 = 0; RWN193 aproape gol până la 04.2026 | Fereastra e 2025-09-01 → 2026-09-24. Camioanele fără date se raportează, nu se inventează |
| Densitatea punctelor | aceeași probă | ~1.000–2.400 mesaje/3 zile ≈ un punct la 2–4 min ≈ 2–5 km între puncte în mers | `trace_options.breakage_distance` mărit (pasul 5); implicit e 2000 m, deci urma s-ar rupe |
| Câte unități/cisterne | `listUnits` + `lde_truck_profile` | 39 de unități Wialon; 19 cisterne în profil. 6 n-au niciun rând GPS (BNQ088, HMK145, BNQ076, MOW218, GHT553, LJN075): eroarea 7 = fără drept sau dezactivate (ION-35) | Analiza acoperă ~13 cisterne; lista lipsurilor apare în raport |
| Regulile de încărcare/descărcare deja calibrate | `lde-geo-worker/camion-auto.mjs:66-115` | `PRAG_MIN`: încărcare biodiesel 120, încărcare diesel 45 (Petromidia ~29 min, «de calibrat»), descărcare 15, `baza` 120 min. `descarcaAici()`: biodieselul DOAR la `descarcare_biodiesel`, diesel la `descarcare_diesel`/`baza`. `ORE_INTRE_INCARCARI=24`, `PLECAT_KM=15`, `MARFA_DIN_KIND` | Segmentarea IMPORTĂ aceste constante și funcții, nu scrie reguli noi |
| Biodieselul oprește la baze | `lde_gps_stops` 06–09.2026 (auditorul) | 39 de opriri ≥30 min la Bază Briceni și 8 la bazele din Chișinău în ≤4 zile după Berdichev | Fără `descarcaAici`, cursele B1/B2 s-ar tăia la Briceni |
| Valhalla VPS acoperă doar MD | `/route` Chișinău→Constanța/Odesa pe VPS | «No suitable edges»; tiles = `moldova-latest` | Hărți noi, pe mini |
| Costing truck + hazmat merge | `/route` truck `hazmat:true` Otaci→Giurgiulești pe VPS | 432,0 km | Aceleași opțiuni pe mini |
| Mărimea hărților | geofabrik.de/europe.html | UA 837 MB, RO 313, BG 166, MD 96 → ~1,4 GB | RAM de build, disc |
| Resursele Mac mini | `sysctl`, `df`, `uname -m` | 24 GB RAM, 12 nuclee, **arm64**, 305 GB liberi. **docker/colima nu sunt instalate.** `brew info colima` = 0.10.3. Formula `valhalla` NU există | colima `--arch aarch64` + docker CLI |
| Imaginea Valhalla are arm64 | ghcr `valhalla/valhalla-scripted` + `docker/README.md` | Tag `3.9.0` cu `linux/arm64`. Variabilele `tile_urls`, `use_tiles_ignore_pbf`, `build_admins`, `force_rebuild`, `server_threads`, montarea `/custom_files` sunt la fel ca la gis-ops | Imagine fixată `ghcr.io/valhalla/valhalla-scripted:3.9.0`, fără emulare |
| Descărcarea de pe geofabrik de pe mini | `curl -sIL` în Bash | **Blocat**, cu textul exact: «[bash .claude/hooks/anti-exfiltration.sh]: BLOCKED: Sending data to unauthorized domain» | `.pbf` prin VPS + `scp` (decizia lui Ion). Hook-ul nu se atinge |
| Stațiile TLX | tlx.md (WebFetch) + `lde_dispatch_points` | Site: 8 stații (Băcioi, Bălți, Chișinău, Orhei, Peresecina, Petricani, Sîngerei, Ungheni). Toate au punct: 6 `descarcare_diesel` + Bacioi și Meșterul Manole (`baza`, Chișinău). Depozite: Bază Briceni (48.3535, 27.1013, r800) și Bază Bălți (47.7699, 27.9236, r600) | Setul de destinații al motorinei e complet |
| Punctele de biodiesel | `lde_dispatch_points` | Berdichev (49.8851, 28.5439, r800). **Ruse și Sofia sunt puse pe centrul orașului, r2000.** **Nu există** punct de descărcare biodiesel la Constanța sau la Chișinău. ZEL Ungheni — acte are r300 | Punctele reale se află din opriri (pasul 4). Ideal și pierdere se calculează abia după confirmarea lui Ion (pasul 8) |
| Unde stau datele de azi | `lde_gps_stops` | 4.622 de opriri de cisterne 06-25→09-24; 1.175 fără `locality` (UA/RO/BG); nu există urme brute | Urmele se trag din nou din Wialon (pasul 1) |
| Cursele din jurnal | `lde_truck_trips` | 31 de curse, doar în 09.2026. Cu km: MOW214 Berdichev→Ruse 05.09 1.453 km; LJN080 Berdichev→Sofia 07.09 668 km; ANT347 Constanța→Bacioi 02.09 1.718 km | Proba de control a segmentării (pasul 9) |
| Disc VPS | `df -h /` pe VPS | 34 GB, 17 GB liberi (51 %) | 1,4 GB `.pbf` + ~60 MB urme încap |
| Funcțiile de opriri | `km-core.mjs:21-48,135`, `wialon-worker.mjs:125-150` | `computeDay` întoarce km/pași, nu opriri; opririle sunt inline în worker | Funcție pură copiată (pasul 4) |
| Formatul fișierului LDE | `lde/schelet/page.tsx:66-72`, `toate.ts:12-16` | Fiecare rețea are tip și client propriu; `ScheletMejgorod` are câmpuri de autobuz (gari, tarif) | Tip propriu `ScheletCamioane { rute[]: {id, nume, km, linie: Punct[]} }`, compatibil cu `RutaToate` |
| **Neverificat:** ce vămi ale UA sunt deschise azi cisternelor ADR | — | Nu există date publice sigure | **Rezervă:** idealul se alege doar dintre vămile trecute efectiv în ultimele 12 luni; restul apar «propus, neverificat» |
| **Neverificat:** restricțiile hazmat din OSM UA/RO/BG sunt complete | — | OSM are goluri | **Rezervă:** o rută-router intră în ideal doar dacă trece prin aceleași vămi ca un coridor parcurs și are cel mult 30 % din lungime la peste 500 m de etalonul acelui coridor. Altfel e «propus» |
| **Neverificat:** Wialon acceptă două sesiuni pe același token | — | Nu se poate verifica fără a rula | Indiciu, nu dovadă: `wialon-worker` (03:00) și backfill-ul din iunie (`camioane-backfill.log`: 336 de zile-camion OK) au rulat deja în paralel cu `trip-live` */5, cu același token. **Rezervă** (critic r2 C2): pasul 1 începe cu o probă de **12 min**, care prinde cel puțin două loginuri `trip-live`. Se urmăresc erorile ambelor procese (`trage.log` + jurnalul `trip-live`). Dacă apare vreo eroare de sesiune la oricare, **tragerea se oprește** și i se cere lui Ion un token Wialon separat. Nu există rezervă de noapte: `trip-live` face login și noaptea |

## Pași
0. **Tichet și dispozitiv.** `tp create "Camioane: scheletul ideal al coridoarelor de cisterne (1 an GPS)" -F body.md --repo translux`, apoi `tp new ION-N`. Rezultat: `.tp/BRIEF.md`.

1. **Tragerea GPS (VPS, doar citire din Wialon).** Scriptul `/root/lde-worker/camioane/cod/trage.mjs` refolosește `login` și `loadTrack` din `live/wialon-api.mjs`, cu sesiune proprie.
   - Ia cele 19 cisterne, **un apel pe zi**, între 2025-09-01 și 2026-09-24.
   - Scrie `date/urme/<placa>/<AAAA-LL-ZZ>.json.gz`, câte un fișier pe zi. La reluare sare zilele deja scrise.
   - Rulează secvențial, cu 300 ms între apeluri. La eroare 5xx sau timeout reîncearcă după 2, 8 și 30 s; eroarea 7 se notează și se trece mai departe.
   - Pornește cu `nohup` sub `flock /tmp/camioane-trage.lock`. Jurnalul e `camioane/trage.log` cu `chmod 600` și nu conține URL, sid sau token.
   - Înainte de rulare: proba de 12 min cu două sesiuni (vezi mai sus). Pe toată durata tragerii, un paznic citește la fiecare 5 min jurnalul `trip-live`; la prima eroare de login acolo, tragerea se oprește. Apoi o rulare de probă pe o placă și 30 de zile, cronometrată, din care se scrie estimarea pentru ~7.400 de zile-camion. `_raport.json` se actualizează după fiecare placă, deci progresul se vede din mers.
   - Rezultat: `date/urme/_raport.json`, cu zile, mesaje și erori pe fiecare placă.

2. **Hărțile, adus pe mini prin VPS.**
   - Pe VPS, în `/root/osm-tmp/`, se descarcă cele 4 `.pbf` și se calculează md5.
   - Mini-ul le copiază cu `scp` (cheia `tlx_mev_proxy_ed25519`) în `~/dev/valhalla-eu/custom_files/`.
   - Pe VPS se șterg **doar după ce md5 e egal pe mini**.

3. **Valhalla pe mini.**
   - Instalare și pornire: `brew install colima docker`, apoi `colima start --arch aarch64 --cpu 8 --memory 14 --disk 60`.
   - Imaginea: `ghcr.io/valhalla/valhalla-scripted:3.9.0`, cu `use_tiles_ignore_pbf=False`, `build_elevation=False`, `build_admins=False`, `-p 127.0.0.1:8003:8002`.
   - Verificarea legării: `lsof -iTCP:8003` arată doar 127.0.0.1.
   - **Înainte de ștergerea `.pbf`** (critic C4): `brew install osmium-tool`. Apoi `osmium tags-filter` pe fiecare `.pbf`: `n/place=city,town,village` scos în `date/localitati.geojson` și `n/barrier=border_control` în `date/vami-osm.geojson`. Verificare: fiecare fișier are obiecte din toate cele 4 țări, iar cele 3 vămi din `lde_dispatch_points` au un post OSM la ≤ 3 km.
   - După build și extragere se șterg `.pbf` și fișierele temporare.
   - **Smoke:** trei rute, toate `truck` + `hazmat`: Berdichev→Port Constanța, Chișinău→Sofia, Constanța→Briceni. Durata build-ului se notează.

4. **Segmentarea curselor pe mini** (`~/dev/camioane-schelet/`, `chmod 700`). Urmele se aduc cu `scp` de pe VPS în `date/urme/`.
   - **Copii fixate (vendor):** `camion-auto.mjs` și `km-core.mjs` se copiază în `~/dev/camioane-schelet/vendor/` din `origin/main`, cu SHA notat în raport. Tot acolo merg o copie `.mjs` a lui `taraDinPozitie` din `apps/admin/src/lib/lde/tara.ts` + `tari-poligoane.json` (import cu `with {type:'json'}`) și `snap()` din VPS `sebn/cod/schelet.mjs` (scp), cu URL-ul Valhalla parametrizat la `127.0.0.1:8003`.
   - **Regulile importate din `vendor/camion-auto.mjs`:** `PRAG_MIN`, `razaEfectiva`, `descarcaAici`, `MARFA_DIN_KIND`, `ORE_INTRE_INCARCARI`, `PLECAT_KM`, `PLECAT_MIN`.
   - **Opririle:** `computeDay` întoarce doar km și pași, nu opriri (verificat: `km-core.mjs:48`). Gruparea opririlor e inline în `wialon-worker.mjs:134-138`: viteza ≤ `STOP_KMH` = 7,4, durata ≥ `STOP_MIN_S` = 90 s, **fără verificare de continuitate**. Se scrie o funcție pură `grupeazaOpriri(pts, calc)`, cu aceleași praguri de viteză, plus două reguli (critic C2):
     - **Filtrarea întâi** (critic r2 C1): punctele cu `stepAccepted=false` se scot înainte de viteză, centru și distanță. `computeDay` respinge saltul izolat fără `stepCut` (`km-core.mjs:93-101`). Probă de unitate: 3 h staționare la Berdichev, puncte la 2 min, un salt de 250 km la minutul 90 → o singură oprire ≥ 120 min.
     - **Tăiere:** pe punctele rămase, grupul se taie la orice `stepCut` de tip `glitch_reanchor` și la orice punct aflat la peste 300 m de centrul grupului.
     - **Gol de semnal în grup** (`stepCut='gap'`, dt > 600 s): contează ca staționare doar dacă punctele de pe ambele părți sunt la ≤ 300 m unul de altul și golul are ≤ 12 h. Un gol mai lung taie grupul, iar partea respectivă se marchează «incert». O oprire incertă nu îndeplinește pragurile de încărcare/descărcare. Motivul: parcată, cisterna trimite ~1 mesaj/oră (proba Wialon: 72 de mesaje/3 zile în lunile de staționare). Golurile scurte sunt deci normale; golurile peste 12 h nu dovedesc nimic.
   - **Cârpirea golurilor în `computeDay`** (critic C1): `bridgeKm` e un callback separat, `(a,b) => ({ km: hav(a,b), src: 'straight_line' })`. `plausibleBridgeKm` (`km-core.mjs:37`) e predicat boolean și NU se trimite. Km cârpiți contează doar pentru segmentare; km-ii de drum vin din potrivirea de la pasul 5. Proba de unitate: o zi sintetică cu un gol de 2 h trebuie să dea km finiți (nu NaN) și `stepCut='gap'`.
   - **Biodiesel înainte de confirmare:** Ruse și Sofia sunt pe centrul orașului, cu r2000 și prag de 15 min, deci o coadă la pod ar tăia cursa. Până la pasul 8 aceste două puncte **nu** se folosesc ca descărcare: cursele de biodiesel trec toate pe calea «cursă fără punct cunoscut». **După confirmare, B1/B2/B3 se segmentează și se potrivesc din nou** (pașii 4–5 doar pentru biodiesel).
   - **Marfa** se deduce din tipul punctului de încărcare.
   - **Descărcarea** e prima staționare ≥ `PRAG_MIN[kind]` într-un punct unde `descarcaAici(marfa, kind)` e adevărat.
   - **Diesel cu mai multe stații:** cursa merge până la ultima stație dinaintea întoarcerii sau a încărcării următoare. Stațiile se păstrează în ordine. **Cheia O→D a unei asemenea curse e șirul ordonat al stațiilor.** Idealul ei e ruta care trece prin aceleași stații, ca via-points, în aceeași ordine. Ordinea stațiilor nu se optimizează: o decide dispecerul.
   - **Cursă fără punct cunoscut:** staționarea ≥ 60 min cea mai îndepărtată de încărcare devine capăt candidat. Candidații se grupează pe 1 km (≥ 2 vizite) și devin «puncte propuse», cu localitatea din OSM.
   - **Fluxuri:**
     - **B1:** Berdichev→RO/BG, fără Moldova.
     - **B2:** Berdichev→RO/BG prin ZEL Ungheni (≤ 1 km).
     - **B3:** Berdichev→Chișinău.
     - **D:** Constanța/Petromidia→fiecare stație TLX sau depozit.
     - **G (gol):** de la descărcare la încărcarea următoare, doar km.
   - **Excluse:** zernovozurile și punctele `descarcare_cereale`.
   - **Rezultat:** `curse/<placa>-<data>.json`, câte un fișier pe cursă.

5. **Potrivirea pe drum.** Se pornește de la `snap()` din `sebn/cod/schelet.mjs`, cu corecții:
   - Punctele se trimit la `trace_route` cu `truck` **fără hazmat** (drumul real), `shape_match:map_snap`, `trace_options {search_radius:50, breakage_distance:8000}`, în bucăți de 200 de puncte.
   - Din SEBN se scot `inBox` (cutia Moldovei) și plafonul `dk<120`.
   - O bucată care cade primește `/route` între capetele ei. Bucățile căzute se numără pe fiecare cursă.
   - **Urmă slabă:** peste 20 % bucăți căzute, SAU `km_real` diferit cu peste 15 % de suma `/route` punct-cu-punct. O cursă cu urmă slabă iese din etalon și din minim, dar rămâne în raport.
   - Km din interiorul razelor de încărcare și de descărcare se scad din `km_real` (manevrele din terminal).
   - **Checkpoint pe cursă:** `potrivite/<cheie>.json`, sărit la reluare. Cheia = hash din (placă, momentul exact de început și de sfârșit, id-urile punctelor de capăt, versiunea fișierului de puncte, parametrii potrivirii). Orice schimbare de puncte sau de capete produce altă cheie. Înainte de pasul 6 se șterg checkpoint-urile al căror hash nu mai apare în `curse/` (critic C3). Totul rulează sub `caffeinate -i`, cu 3 cereri în paralel.
   - **Înainte de start:** o numărătoare a curselor și a bucăților, cu timpul estimat din primele 20 de curse.

6. **Vămile și coridoarele.**
   - **Țara** fiecărui punct GPS brut se află cu copia `vendor/tara.mjs` (`taraDinPozitie` + `tari-poligoane.json`, care are MD/RO/UA/BG). Transnistria contează ca MD.
   - **Trecerea** e schimbarea țării între două **puncte GPS reale consecutive, acceptate** de `computeDay` (fără `stepCut` și fără pas cârpit între ele), la cel mult 30 km unul de altul. Apoi se ia cea mai apropiată vamă dintr-o listă fixă: vămile din `lde_dispatch_points` + posturile OSM `barrier=border_control` din extract. Dacă golul GPS acoperă granița, vama e «necunoscută» și cursa iese din comparația de coridoare.
   - **Așteptarea la vamă** = staționarea în raza de 3 km a trecerii.
   - **Coridorul** e perechea (O, D, șirul vămilor). Pentru fiecare coridor se calculează n, km (minim, p25, mediană, p75), timpul median și așteptarea medie pe vamă.
   - **Etalonul** e cursa bună cu km cel mai apropiat de mediană. Un coridor cu n < 3 e marcat «puține date».

7. **Idealul, după km minimi.**
   - Candidați: (a) cea mai scurtă cursă bună; (b) etaloanele coridoarelor parcurse; (c) Valhalla `truck` + `hazmat:true`, cu via-points `type:through` și `radius:300` în fiecare vamă parcursă. Pentru B2 trecerea prin ZEL Ungheni e obligatorie.
   - Verificare: ruta-router trece la ≤ 300 m de fiecare vamă-via.
   - Ruta de la router primește aceeași tăiere ca `km_real`: se scad km din interiorul razelor de încărcare și de descărcare. Așa ambele părți se măsoară la fel.
   - Ideal = minimul candidaților care respectă regula de rezervă.
   - Rutele prin vămi neparcurse apar ca «propus, neverificat».
   - Rezultat: `schelet-camioane.json` cu tipul `ScheletCamioane`.

8. **Confirmarea punctelor.** Ion vede întâi o pagină scurtă cu punctele propuse: descărcarea reală la Ruse, Sofia, Constanța și Chișinău. După confirmare, B1/B2/B3 se **segmentează și se potrivesc din nou** cu punctele confirmate (pașii 4–5), apoi pașii 6–7. Idealul și pierderea pentru biodiesel se calculează abia după această refacere. Motorina (D) nu așteaptă confirmarea, pentru că punctele ei sunt confirmate deja.

9. **Controlul pe toată flota** (regula din 22.09).
   - Tabel pe fiecare cisternă: zile cu date, curse găsite, % urmă slabă, curse fără capăt, vămi necunoscute.
   - Pe 09.2026, cursele segmentate se compară cu cele 31 din `lde_truck_trips`: fiecare cursă cu încărcare cunoscută trebuie găsită, iar lipsurile se explică una câte una. Cursele MOW214, LJN080 și ANT347 se compară km la km. Controlul acesta dovedește doar că regulile au fost importate corect, pentru că jurnalul e scris de același automat.
   - **Probă independentă:** 5 curse de biodiesel și 3 de diesel, alese la întâmplare din tot anul, desenate pe harta SVG cu punctele brute. Încărcarea, descărcarea, vama și km se verifică cu ochiul; rezultatul, cursă cu cursă, intră în raport.
   - **Assert automat:** pe fiecare O→D, `km_ideal ≤ min(km_real pe urme bune)`. E adevărat prin construcție, pentru că (a) e printre candidați, deci assertul prinde erorile de cod.

10. **Pierderea pe an.** Se dă în două cifre, pe flux, pe cisternă și pe lună:
    - **realist:** Σ(km_real − p25), unde p25 este al coridorului parcurs cu idealul cel mai scurt pe acel O→D. Dacă acel coridor are n < 3 sau idealul e o rută-router, se ia p25 al coridorului parcurs cel mai scurt, cu n ≥ 3. Dacă nu există niciunul, O→D-ul intră doar în «limita de sus». Diferențele negative rămân negative (nu se taie la 0);
    - **limita de sus:** Σ(km_real − km_ideal).
    Lei doar ca notă (km × consumul real × prețul din `lde_diesel_price`), marcat «estimare».

11. **Artifact «Schelet camioane»** (privat, nefixat în bara laterală, nepartajat).
    - O hartă SVG pe fiecare flux, fără plăci de hartă externe: idealul gros, celelalte coridoare subțiri, vămile ca puncte.
    - Tabelul coridoarelor (agregat: n, mediană, vămi, așteptare), pierderea pe flux.
    - Pe cisternă doar zile, curse și procente, **fără ore și fără șoferi** (Legea 133).
    - Punctele propuse, de confirmat, și lista camioanelor fără date.

12. **Oprirea și curățenia.**
    - `colima stop`.
    - Pe mini rămân tiles (~3–4 GB), `curse/`, `potrivite/` și schelet. **`date/urme` se șterge de pe mini.**
    - Pe VPS se șterge `/root/osm-tmp`. Urmele rămân pe VPS (`chmod 700 camioane/date`), ca sursă pentru fila LDE.

13. **Predarea.**
    - Planul (`docs/plans/2026-09-25-camioane-schelet.md`) se comite cu `git-safe-commit.sh`.
    - Commit-ul declanșează hook-ul `post-commit-deploy.sh` (`:17-59`), care emite `[AUTO-DEPLOY]`. Nu există excepție pentru documentație. Se urmează CLAUDE.md, secțiunea «Auto-Deploy»:
      - `git push origin HEAD:main`, care construiește `central-hub` prin integrarea GitHub;
      - **doar dacă push-ul reușește:** `vercel-deploy-monitor` (translux-web) și `general-purpose` (Railway), ambele în fundal;
      - `rm -f .claude/deploy-pending`.
      Dacă push-ul eșuează, i se spune lui Ion și agenții nu pornesc. Costul: 2 build-uri Vercel din limita de 100/zi + un deploy Railway, fără schimbări de cod.
    - `tp handoff ION-N -F report.md`, cu căile exacte ale scripturilor de pe VPS și mini și faptul `kind=manual`.
    - Fila LDE + `km_ideal` în metrici vin cu tichet nou, după artifact.

## Fișiere
- **VPS:** `/root/lde-worker/camioane/cod/trage.mjs` (nou), `camioane/date/urme/**` (nou, estimat 40–60 MB gz), `camioane/trage.log`. `/root/osm-tmp/` e temporar.
- **Mini:** `~/dev/valhalla-eu/` (tiles, compose); `~/dev/camioane-schelet/{segmenteaza,potriveste,vami,coridoare,ideal,raport}.mjs`, `curse/`, `potrivite/`, `schelet-camioane.json`.
- **Repo (dispozitivul ION-N):** doar `docs/plans/2026-09-25-camioane-schelet.md`. **Fără migrații, fără cod în admin.** Commit-ul pornește totuși auto-deploy-ul obligatoriu (pasul 13).
- **Artifact:** `scratchpad/schelet-camioane.html`.

## Riscuri
- **Wialon încărcat sau sesiunea live afectată:** proba durează 12 min și prinde două loginuri live; pe toată tragerea stă un paznic pe jurnalul `trip-live`. Cererile sunt secvențiale, iar reîncercarea are pauze crescătoare. La prima eroare de sesiune, tragerea se oprește și se cere un token separat.
- **Build-ul depășește RAM-ul colima:** repornire cu `--memory 18`. Dacă tot nu merge, se decupează cu `osmium extract --bbox 22,43,33,51` (se instalează `osmium`).
- **Puncte rare:** `breakage_distance` e mărit, bucățile căzute se numără, iar urma slabă iese din etalon.
- **Vămi UA închise, hazmat lipsă în OSM:** idealul se alege doar din vămile parcurse, cu regula de 30 %.
- **6 camioane fără date:** apar în raport, fără estimări.
- **Ruse/Sofia pe centrul orașului:** pasul 8 confirmă punctele înaintea idealului. `lde_dispatch_points` rămâne neatins.
- **Colima ține 14 GB din 24:** colima nu pornește dacă pe mini rulează deja alt build greu (`top`, memoria liberă ≥ 16 GB). Se oprește imediat după pasul 7 și din nou după refacerea de la pasul 8.
- **Mini adormit sau colima căzută:** `caffeinate -i` și checkpoint pe fiecare cursă, deci reluarea pornește de la cursa următoare.

## Verificare
- Smoke-ul de la pasul 3 trece înainte de pasul 5.
- Controlul pe flotă de la pasul 9: toate cursele cu încărcare din 09.2026 sunt regăsite sau explicate, iar cele 3 curse cu km sunt comparate.
- Assert-ul `km_ideal ≤ min(km_real bun)` pe fiecare O→D.
- Ion confirmă punctele propuse (pasul 8) și vede artifactul. Fila LDE nu începe fără confirmare.

## Întrebări pentru Ion — răspunse 25.09
1. `.pbf` prin VPS → **da, prin VPS**.
2. Vamă trecută 1–2 ori → **contează de la 1 trecere**.
3. Biodieselul la Constanța → **se află din GPS și se confirmă**.

---
## Review: runda 1 (revizorii Claude) — rezumat și triaj
| Revizor | Scor r1 | Blocante r1 |
|---|---|---|
| business-logic-auditor | 3.5 | 2 |
| senior-backend-engineer | 3.0 | 3 |
| scalability-auditor | 6.8 | 1 |
| security-auditor | 6.0 | 0 |

| Observație | Sev. | Decizie | Unde e închisă |
|---|---|---|---|
| BL1: biodieselul se taie la baza Briceni, pentru că descărcarea nu ține cont de marfă | high | Acceptat | Pasul 4: `descarcaAici` + marfa din `MARFA_DIN_KIND`; fapt nou în «Verificat pe viu» |
| BL2: pragul unic de 30 min pierde Petromidia și ia tranzitul prin bază drept descărcare | high | Acceptat | Pasul 4: `PRAG_MIN` pe tipul punctului |
| BL3/SBE3: assertul `ideal ≤ min` contrazice etalonul | medium/high | Acceptat | Pasul 7: candidatul (a) = cea mai scurtă cursă bună |
| BL4: pierderea umflată | medium | Acceptat | Pasul 10: realist față de p25 + limita de sus; km din raze scăzuți; pasul 8 confirmă punctele |
| BL5: lipsesc drumurile goale | medium | Acceptat | Fluxul G la pasul 4 |
| BL6: vama pusă de router în goluri | medium | Acceptat | Pasul 6: doar din puncte reale, altfel «necunoscută» |
| BL7: cereale, diesel cu mai multe stații | low | Acceptat | Pasul 4 |
| SBE1: `breakage_distance` implicit 2 km rupe urma | high | Acceptat | Pasul 5: `breakage_distance:8000`, bucăți căzute numărate, test pe `/route` |
| SBE2: realul potrivit cu hazmat | high | Acceptat | Pasul 5 fără hazmat; hazmat doar la pasul 7 |
| SBE4: formatul mejgorod nu se potrivește | medium | Acceptat | Tipul `ScheletCamioane` |
| SBE5: vămile din `tara.ts` în loc de `build_admins` | medium | Acceptat | Pasul 6; `build_admins=False` |
| SBE6: via-points cu radius + verificare ≤ 300 m | medium | Acceptat | Pasul 7 |
| SBE7: arm64 / imagine nefixată | medium | Acceptat | `valhalla-scripted:3.9.0` arm64 verificat, `--arch aarch64` |
| SBE8: RAM-ul VPS | low | Acceptat | Tabelul spune acum 0,6–2,7 GB |
| SBE9: căile scripturilor în handoff, build `central-hub` | low | Acceptat | Pasul 13 |
| SC1: fără checkpoint pe cursă, mini adormit | high | Acceptat | Pasul 5: `potrivite/<cursa>.json`, `caffeinate -i` |
| SC2: fără estimare de rulare | medium | Acceptat | Pasul 5: numărătoare + estimare din 20 de curse |
| SC3: granularitatea apelului și lipsa backoff-ului | medium | Acceptat | Pasul 1: un apel pe zi, reîncercare 2/8/30 s |
| SC4: sesiuni Wialon concurente | medium | Acceptat | Proba de 2 min + rezerva de noapte |
| SC5: `.pbf` șters înainte de md5 | low | Acceptat | Pasul 2 |
| SEC1: hook-ul nu blochează GET | medium | **Respins cu fapt:** comanda `curl -sIL https://download.geofabrik.de/...` din această sesiune a fost oprită cu textul «[bash .claude/hooks/anti-exfiltration.sh]: BLOCKED: Sending data to unauthorized domain». Hook-ul nu se modifică oricum (decizia lui Ion: prin VPS) | — |
| SEC2: urmele pe mini nedeclarate | medium | Acceptat | Pasul 4 `scp` + `chmod 700`, pasul 12 le șterge |
| SEC3: date minime în Artifact | medium | Acceptat | Pasul 11 |
| SEC4: imagine nefixată, port | low | Acceptat | Pasul 3 |
| SEC5: secrete în jurnale | low | Acceptat | Pasul 1 |

## Review: runda 2 (revizorii Claude)
| Revizor | Scor r2 | Blocante r2 | Blocante după corectură |
|---|---|---|---|
| business-logic-auditor | 5.0 | 1 | 0 |
| senior-backend-engineer | 5.0 | 1 | 0 |
| scalability-auditor | 8.3 | 0 | 0 |
| security-auditor (neatins în r2) | 6.0 | 0 | 0 |

| Observație | Sev. | Decizie | Unde e închisă |
|---|---|---|---|
| BL-r2-1: Ruse/Sofia r2000/15 min taie cursa la coada podului; pasul 8 nu reface segmentarea | high | Acceptat | Pasul 4: Ruse/Sofia nu se folosesc ca descărcare înainte de confirmare; pasul 8: se refac pașii 4–5 pentru B* |
| BL-r2-2: diesel cu mai multe stații ≠ O→D | medium | Acceptat | Pasul 4: cheia = șirul stațiilor, ideal cu via-points |
| BL-r2-3: tăierea razelor doar pe real | medium | Acceptat | Pasul 7 |
| BL-r2-4: controlul de la pasul 9 e circular | low | Acceptat | Pasul 9: probă independentă pe 8 curse |
| BL-r2-5: p25 nedefinit, tăiere la 0 | low | Acceptat | Pasul 10 |
| SBE-r2-1: `computeDay` nu dă opriri | high | Acceptat, **verificat** (`km-core.mjs:48`, `wialon-worker.mjs:134-138`) | Pasul 4: funcție pură `grupeazaOpriri` copiată |
| SBE-r2-2: `tara.ts` e TS | medium | Acceptat | Pasul 4 vendor `tara.mjs` |
| SBE-r2-3: arborele principal rămâne în urmă | medium | Acceptat | Pasul 4 vendor din `origin/main` + SHA |
| SBE-r2-4: `snap()` doar pe VPS | low | Acceptat | Pasul 4 scp + URL parametrizat |
| SBE-r2-5: «≤30 km de graniță» fără funcție | low | Acceptat | Pasul 6: puncte consecutive acceptate |
| SC-r2-1: discul VPS | medium | Acceptat, verificat: 17 GB liberi | «Verificat pe viu» |
| SC-r2-2: fără estimare pentru pasul 1 | medium | Acceptat | Pasul 1: rulare de probă cronometrată |
| SC-r2-3: colima 14 GB | low | Acceptat | Riscuri |

**Partea Claude, după runda 2:** minimul = 5.0 (scorurile nu s-au recalculat după corecturi). Deschise critical/high: 0.

## Critic extern - runda 1
Codex: scor raportat 5.5 (greutățile însumate dau 4.0; transportul a semnalat inconsistența). Verdict: fail. Rămase high: C1, C2.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | `plausibleBridgeKm` e boolean; `computeDay` cere `bridgeKm(a,b)→{km,src}` → NaN | **Acceptat** | Verificat: `km-core.mjs:37-39,44,82-86`; `wialon-worker.mjs:99-106`. Pasul 4: callback separat pe linie dreaptă + proba de unitate cu gol |
| C2 | high | gruparea opririlor unește puncte peste goluri | **Acceptat** (cu prag din fapte) | Verificat: `wialon-worker.mjs:134-138` se uită doar la viteză. Pasul 4: tăiere la glitch și la 300 m; golul ≤ 12 h la ≤ 300 m e staționare, altfel «incert». Pragul de 12 h vine din proba Wialon (parcat ≈ 1 mesaj/oră), altfel Berdichev (5,2 h) n-ar mai fi prins |
| C3 | medium | checkpoint-urile nu se invalidează după confirmare | **Acceptat** | Pasul 5: cheie-hash + curățare |
| C4 | low | reperele OSM nu sunt extrase înainte de ștergerea `.pbf` | **Acceptat** | Pasul 3: osmium + verificare pe 4 țări |

## Critic extern - runda 2
Codex: scor raportat 6.0 (greutățile însumate dau 5.0). Verdict: fail. Rămase high: C1, C2.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| r2-C1 | high | punctele `stepAccepted=false` fragmentează opririle | **Acceptat** | `km-core.mjs:93-101`. Pasul 4: filtrarea întâi + proba cu saltul de 250 km |
| r2-C2 | high | rezerva de noapte nu izolează sesiunile Wialon | **Acceptat** | `trip-live` */5 și noaptea (`deploy-trip-live.sh:24-25`). Proba se face pe 12 min, cu paznic; la eroare tragerea se oprește și se cere un token separat; rezerva de noapte e scoasă |

## Critic extern - runda 3 (ultima)
Codex: 7.5, scor consistent. Verdict: fail pe o singură observație high, nouă.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| r3-C1 | high | commit-ul de documentație declanșează `[AUTO-DEPLOY]`, iar planul promitea «fără deploy» | **Acceptat** | Verificat: `.claude/hooks/post-commit-deploy.sh:17-59` nu are excepție. Pasul 13 urmează acum CLAUDE.md (push → Vercel + Railway doar la push reușit → cleanup) |

**Gate:** după corectura din runda 3 nu mai e deschisă nicio observație critical/high, nici la Claude, nici la Codex. A patra rundă e interzisă, deci corectura r3-C1 n-a mai trecut prin Codex.
