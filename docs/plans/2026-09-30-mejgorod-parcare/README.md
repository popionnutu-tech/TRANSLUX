# ION-149 — Mejgorod (rutele interurbane): harta mașinii și locul optim de dormit P1 / P2 — cercetarea (runda 0)

Planul fazei 1 (cercetare) după modelele ION-143 (`docs/plans/2026-09-29-lear-parcare/`) și ION-136 (`docs/plans/2026-09-29-drax-parcare/`).
Scris de uzina-analist, pornirea «cercetează», 30.09.2026. Nimic scris în bază, crontab sau lanțurile existente. Codul și ieșirile măsurării
sunt în `vps/` (copii ale fișierelor de pe VPS, dosarul `/root/lde-worker/mejgorod-parcare/cercetare/`).

## De ce

Ion, 30.09.2026: «creează-le hărțile la toate direcțiile cu punctele optimale de dormit cum ai făcut la Drăxlmaier și LEAR».
Pagina `/lde/harta` are azi Drăxlmaier, LEAR Ungheni și LEAR Florești (`UZINE_HARTA`, `apps/admin/src/lib/lde/drax-harta.ts:89-93`).
Rutele interurbane (mejgorod, 30 de rute `crm_routes.route_type='interurban'`) n-au nici harta mașinii, nici parcarea propusă.
Aici întrebarea e alta decât la uzine: autobuzul de linie doarme între ultima cursă a zilei și prima de a doua zi. Unde doarme azi
(la capăt, la gară, acasă la șofer) și câți km goi s-ar tăia dacă ar dormi în alt loc. Pauza de zi de la Chișinău e a doua întrebare.

## Ce facem (propunerea)

Aceeași metodă ca LEAR ION-143 (Codex 10/10), luată ca atare acolo unde se transpune. Unde nu se transpune, e întrebare pentru Ion (vezi mai jos).

1. **Munca = cursele cu oameni din lanțul mejgorod existent.** `nomenclator.mjs` și `curse.mjs` (ION-55) pe săptămână: rută × sens × zi din
   grafic (`daily_assignments`), urma tăiată între capetele reale (oprirea cea mai avansată atinsă). Uzinele au poartă, aici nu există.
   Mejgorod are două capete: gara Chișinău și capătul de nord.
2. **Drum de parcare = golul dintre două curse consecutive ale aceleiași mașini**, de la capătul E al uneia la începutul S al celeilalte:
   - noaptea: golul trece peste ziua de lucru, cu tăietura la 03:00;
   - ziua: pauza dintre tur și retur, de obicei la Chișinău.

   Nu intră golurile sub 60 min, cele peste 20 h (zi liberă), cele cu oprire la poarta altei uzine și cele cu oprire la ≤ 4 km de parcul
   Bălți (service). Tot ca la LEAR.
3. **Km de acum = km GPS ai golului.** Se calculează cu `kmIntre` din LEAR: fără salturi > 5 km și fără deriva mașinii oprite.
   **Km propuși prin locul P** = (V(E,P) + V(P,S)) × 1,05, unde V este drumul Valhalla bus de pe VPS (:8002).
4. **Candidații:** satele și orașele OSM la ≤ 15 km de E sau S, gările (`STATII`) și locul unde mașina deja doarme în ≥ 2 nopți.
5. **Alegerea locurilor:** funcția pură `alegeLocuri` din LEAR (`lear-parcare-alege.mjs`), neschimbată. Dă 1–2 locuri; al doilea loc intră
   doar dacă scade ≥ 20 km/săpt. și e folosit la ≥ 3 drumuri. Pe fiecare drum: prin locul ales sau «rămâne cum e».
6. **Economia mașinii** = max(0, Σ real − Σ propus) pe săptămână. Doar km, fără lei.

După aprobare (fazele următoare, tichete separate):
- lanțul VPS `mejgorod-parcare/lant.sh`: curse → parcare → harta zilei → publicare atomică în `lde_harta_zi` + `date.parcare` al rândului
  MEJGOROD;
- uzina `mejgorod` în `UZINE_HARTA`, cu scheletul `public/lde/schelet-mejgorod.json`;
- RPC-ul de publicare extins (migrația 441 are o listă închisă de uzine);
- regulile scrise acolo unde decide Ion (întrebarea 10).

### Variante respinse

- **A. Doar regula lui Ion din 25.09 (`optim2.mjs`, «doarme la capăt»), fără P1 / P2.** Pe aceeași săptămână dă 681 km/săpt. Nu răspunde la
  cererea din 30.09 (puncte optime pe hartă). Mai are două probleme:
  - numără pe km-ul scheletului, nu pe km GPS (memoria `km-reali-gps-nu-geometrie`: comparațiile se fac pe km reali);
  - pune zero la toate cele 102 zile «caz B».

  Rămâne cifra de comparație pe pagină, până hotărăște Ion (întrebarea 1).
- **B. Metoda Drăxlmaier ION-136 (ziua ideală + ocol Valhalla).** Mejgorod n-are ziua ideală pe mașină, ci doar scheletul simetric pe rută
  (`ideal.json`). A o construi ar fi o fază întreagă, fără câștig: golurile de aici sunt E → S simple, fără legături între linii.

## 🔬 Verificat pe viu (30.09.2026)

Săptămâna 21–27.09.2026 (luni–duminică), golurile cu E în săptămână. Urma a fost citită între 20.09 00:00 și 29.09 04:00 (ora Chișinăului),
ca nopțile de la margini să se închidă. Flota: toate plăcuțele cu atribuire interurbană în `daily_assignments` între 20 și 28.09.
Rulările și fișierele lor:
- `vps/pregatire.sh`: copie a codului `mejgorod/cod`, `nomenclator.mjs 2026-09-20 2026-09-28` și `curse.mjs` cu `SUFIX=-c`, 48 s;
- `vps/masoara.mjs`: 55 s, Valhalla fără niciun drum lipsă;
- `vps/sumar.mjs`, `vps/flota.mjs`;
- `vps/optim-c.sh`: regula din 25.09 pe aceeași săptămână.

Ieșirile: `vps/rulare-21.09.txt` (fiecare gol), `vps/sumar-21.09.txt`, `vps/flota-21.09.txt`.

**Starea bazei și a lanțului**
- `lde_uzine`: nu există rând MEJGOROD. Există doar DRAXELMAIER_BALTI, LEAR_FLORESTI, LEAR_UNGHENI, SEBN_ORHEI, SEBN_STRASENI și
  TROX_BRICENI. Regulile mejgorod nu au azi niciun `reguli_livrare`.
- `lde_analiza_reguli`, uzina «MEJGOROD»: sunt doar rândurile 2026-09-14 (rulat 25.09 09:12) și 2026-09-21 (rulat 25.09 08:53, săptămână
  parțială). **Luni 28.09 analiza MEJGOROD n-a rulat.**
  - `grep -ci mejgorod` dă 0 în `/root/lde-worker/lear-saptamanal.sh` și în toate cele 7 copii `.bak-*`, inclusiv `.bak-20260925` de la
    11:36. La fel în repo (`lde-geo-worker/lear-saptamanal.sh`, `lib/lde/luni-paznic.ts`).
  - Memoria `mejgorod-schelet-rute` spune că blocul a fost pus pe 25.09 (commit 43917448). Commit-ul are însă doar ruta
    `/api/cron/mejgorod-optimizari` și imaginea; blocul din `lear-saptamanal.sh` nu există.
- `lde_uzine_gates`: 8 porți (Drăxlmaier E / V, SEBN Orhei + punctul est, SEBN Strășeni, LEAR Ungheni, LEAR Florești, Trox Briceni).
  Poarta Trox (48,34648; 27,08318; 0,4 km) este pe drumul prin Briceni.

**Flota (36 de plăcuțe, toate cu tracker)**
- **26 judecate cu loc propus.**
- **10 fără propunere, fiecare cu motivul:**
  - 318BRAT: 4 atribuiri pe ruta 13 (25–26.09), 0 puncte GPS în orele curselor, deși are 1.210 km în săptămână;
  - 029BRAS: o cursă de 19,5 km, niciun gol;
  - 145BZP și 319YEK: 2–4 atribuiri, înlocuitori, fără gol de tăiat;
  - 065LTL: golurile lungi sunt zile libere;
  - 651AKD: doarme la capăt, Criva ×7;
  - 654TWK, 759LYY și 827WJQ: dorm la gara Chișinău, rutele cu returul dimineața;
  - 662AKD: vezi întrebarea 6.
- **Curse fără urmă:** 16 din 528 de atribuiri (0–49 de puncte), toate listate în `vps/flota-21.09.txt`.

**Golurile (`vps/sumar-21.09.txt`)**

| clasa | n | km GPS acum | direct E→S | propus (P1/P2) |
|---|---|---|---|---|
| noapte, returul a ajuns la capătul de nord (A, ≤ 3 km) | 73 | 1.349,6 | 145,5 | 603,6 |
| noapte, returul s-a oprit înainte de capăt (B) | 108 | 4.939,8 | 2.250,7 | 2.466,0 |
| zi (pauza dintre tur și retur) | 114 | 228,0 | 44,1 | 184,9 |
| scos: peste 20 h (zi liberă) | 13 | 929,7 | — | — |
| scos: ziua, la poarta SEBN Orhei (652AKD, 5 zile) | 5 | 483,2 | — | — |
| scos: sub 60 min | 45 | 167,0 | — | — |

- **De tăiat: 3.262,9 km/săpt.** Nopți A: 746,0. Nopți B: 2.473,8. Zi: ≈ 43.
- **Varianta «doarme la capătul de nord al rutei», fără alegere:** A 1.007,7 + B 2.042,9 = 3.050,6 km/săpt.
- **Regula din 25.09 (`optim2`) pe aceeași săptămână:** 681,2 km/săpt., 180 de zile, 76 seara la capăt, 102 «caz B» (puse zero).
- **Durata nopții:** mediana 12 h 39 min (min 8 h 47, max 17 h 16). 108 din 181 de nopți trec de 12 h, cu 4.054 km acum. Pragul LEAR de
  12 h le-ar scoate pe toate.
- **Pauza de zi:** mediana 2 h 18 min. Mașina stă la gară. Singurele ieșiri > 5 km sunt două, ambele la 998TCP:
  - 23.09, Criva → 33 km departe → Criva, 73,6 km;
  - 25.09, 29,8 km.
- **Unde doarme azi** (cea mai lungă staționare din noapte): gara 29, capătul / E / S 41, alt loc 111. Alt loc înseamnă:
  - Briceni 27;
  - Cotiujeni 8;
  - Ocnița 6, Beleavinți 6, Halahora de Sus 6, Clocușna 6;
  - Berlinți 5, Fetești 5, Lipcani 5;
  - restul ≤ 4 fiecare.
- **Tracker tăcut în mers** (km de acum < 0,8 × direct): 2 goluri, 263NSX 23.09 și 805BXI 23.09. Economia lor e subestimată, deci greșeala
  e prudentă.

**Capetele reale față de grafic** (`vps/flota-21.09.txt`): returul se termină des înainte de capătul din grafic, iar turul de a doua zi pornește
de la capăt. Mașina face dimineața gol pe rută.
- rutele 24 și 27: returul se termină la gara Briceni (7/7), turul pornește de la Criva (7/7), adică 33 km goi pe rută în fiecare dimineață;
- ruta 9: returul la gara Briceni (5), turul de la Criva (7);
- ruta 8: returul la Drepcăuți (5), turul de la Criva (7);
- ruta 26: returul la Tabani sau Caracușenii Vechi, turul de la Tețcani;
- ruta 29: returul la Ocnița, turul de la gara Briceni;
- ruta 17: și returul, și turul se opresc la Corjeuți (5–7 / 7), 28 km înainte de capătul «Criva» din grafic. Capătul real e Corjeuți.

**Cele mai mari cifre pe mașină** (km/săpt., `vps/rulare-21.09.txt`)

| mașina | acum doarme | P1 | de tăiat |
|---|---|---|---|
| 688AKD | Halahora de Sus ×6 | Corjeuți | 336,1 |
| 805BXI | Clocușna ×6 | Frunză | 308,2 |
| 795 MJW | Briceni ×7 | Hlina | 276,1 |
| 692 TWK | gara Briceni ×4, Briceni ×3 | Hlina | 243,2 |
| 735LYY | Fetești ×5 | Tețcani | 234,8 |
| 526WDW | Berlinți ×5 | Corjeuți | 192,1 |
| 828MLN | Cotiujeni ×5 | gara Lipcani | 171,1 |
| 396SWL | Cotiujeni ×3 | Hlina | 150,1 |

Detaliile câtorva mașini:
- **688AKD, ruta 26.** Returul se termină seara la Tabani sau Caracușenii Vechi, la 12–18 km de Tețcani. Mașina doarme la Halahora de Sus și
  dimineața pornește turul din Tețcani. Pe noapte face 45–84 km, iar drumul direct E → S are 8–23 km.
- **805BXI, ruta 21.** Returul se termină la gara Ocnița sau la Frunză, mașina doarme la Clocușna, turul pornește din Otaci. Pe noapte face
  57–152 km, direct 17–39 km.

**Controale pe toată flota, făcute în această cercetare**
1. *Poarta altei uzine prinsă din trecere.* Prima variantă («orice punct în raza porții») scotea 57 de nopți, toate treceri prin Briceni pe
   lângă Trox, în drum spre casă. A doua variantă (> 5 km de E / S) mai scotea 18. Varianta păstrată: oprire ≥ 2 min în rază, sau trecere când
   poarta e la > 20 km de E, de S și de locul staționării. Cu ea: Trox 0 nopți, SEBN Orhei 5 zile la 652AKD (ruta 1: sosire la Chișinău ~07:45,
   ~96 km dus-întors până la poarta SEBN Orhei, retur la ~11:00).
2. Golurile fără drum Valhalla: 0.
3. Golurile cu urma mai scurtă decât drumul direct: 2 (listate mai sus).
4. Cursele fără urmă: 16 (listate).

## Diferențe față de LEAR (de ce nu se copiază totul)

| LEAR ION-143 | Mejgorod (măsurat) | Ce facem |
|---|---|---|
| Munca tăiată pe opriri în sate lângă poartă | Nu există poartă. Cursele vin din grafic + GPS (`curse.mjs`) | Refolosim `curse.mjs`, nu tăiem pe opriri |
| Golul > 12 h = zi incompletă | Noaptea are mediana 12 h 39; 108 / 181 nopți > 12 h | Prag 20 h (întrebarea 4) |
| Poarta = candidat (R1 «doarme la uzină») | Capătul de nord ține locul porții; Ion 25.09: «să rămână auto la capăt de rută» | Capătul e candidat; preferința lui e întrebarea 2 |
| «Timp liber» și brambura scăzute din km de acum (§11.9, `lear-timp-liber`) | Mejgorod n-are detectorul | Excursiile intră azi în km de acum (998TCP 73,6 km); întrebarea 7 |
| Parcul Bălți = service | Nicio noapte la parc. Firma e «Parcul de Autobuze nr. 9 Briceni», iar Briceni apare la 27 de nopți | Întrebarea 3: există un garaj în Briceni (coordonate)? |
| «Rămâne cum e» la ≤ 4 km de locul unde stă (§13.4) | 662AKD doarme la Drepcăuți, ~5 km de Criva, cu 7,5–24 km/noapte. Pragul acoperă ~98 km/săpt. | Întrebarea 6 |
| Returul se termină la capăt | 108 / 181 nopți «B»: returul se oprește înainte; turul de a doua zi pornește de la capăt | Întrebarea 1 (regula din 25.09 contra P1 / P2) |
| Regulile în `lde_uzine.reguli_livrare` §13 | Nu există rândul MEJGOROD | Întrebarea 10 |

## Întrebări pentru Ion

1. **Nopțile «B»: returul se oprește înainte de capăt, șoferul doarme acasă, dimineața merge la capăt.** În 21–27.09 sunt 108 nopți: 4.939,8 km
   GPS acum, 2.250,7 km pe drumul direct E → S (partea de rută nefăcută). Metoda LEAR ar tăia 2.473,8 km/săpt., adică ocolul pe acasă.
   Regula din 25.09 (`optim2`: «dacă doar dimineața navetă, iar seara nu — e ca să rămână auto la capăt») le pune zero. Pe aceeași săptămână,
   regula din 25.09 dă 681 km/săpt., iar P1 / P2 dă 3.263. Care se aplică?
   - (a) ocolul pe acasă se numără, ca la LEAR și Drăxlmaier;
   - (b) zero, ca pe 25.09.
2. **Locul propus: cel mai ieftin, sau capătul rutei?**
   - Alegerea LEAR dă satul cel mai ieftin, de obicei unul de pe drumul E → S: Hlina, Corjeuți, Frunză. La 688AKD dă Corjeuți, nu Tețcani.
   - Varianta «doarme la capătul de nord», fără alegere, taie 3.050,6 km/săpt., față de 3.219,8 pe nopți cu alegerea LEAR.
   - Propunem: capătul rutei câștigă la scor apropiat (toleranța de 20 km/săpt. din LEAR), apoi gara, orașul, satul. E bine?
3. **Briceni: 27 de nopți** (795 MJW ×7, 692 TWK, 648CWN, 703TWK…). Firma are garaj sau parc în Briceni? Dacă da, ce coordonate, și
   noaptea acolo e «parc» sau «acasă la șofer»?
4. **Pragul nopții:** golurile până la 20 h intră (LEAR: 12 h). Cu pragul de 12 h ar ieși 108 din 181 de nopți (4.054 km acum). 20 h e bine?
5. **Zilele libere** (golul > 20 h, 13 goluri, 929,7 km). Exemple:
   - 065LTL 26–28.09: 125,3 km;
   - 298RQR 23–26.09: 329,7 km;
   - 697TWK 23–25.09: 108,4 km.

   Rămân afară, ca la LEAR, sau intră (mașina dusă acasă în ziua liberă)?
6. **Pragul «rămâne cum e» de 4 km.** 662AKD doarme la Drepcăuți, la ~5 km de Criva Vama, și face 7,5–24 km pe noapte. Varianta «la capăt»
   i-ar tăia 98,5 km/săpt., dar alegerea LEAR dă 0, fiindcă toate locurile de lângă Criva sunt la ≤ 4 km de Drepcăuți. Păstrăm 4 km sau
   coborâm la 2 km pentru mejgorod?
7. **Excursiile din pauza de zi.** Mejgorod n-are detectorul de timp liber. 998TCP pe 23.09, în pauza de la Criva: 73,6 km, până la 33 km
   depărtare. Intră în «parcare» (tăiat la 36,9 prin loc), sau se arată separat ca timp liber, ca la LEAR, și nu intră?
8. **Pauza de zi de la Chișinău:** 114 pauze, 228 km acum, ≈ 43 de tăiat. Propunem să le arătăm pe hartă ca «stă la gară», fără loc propus
   separat (P1 / P2 doar pentru noapte). E bine?
9. **652AKD merge între tur și retur la SEBN Orhei** (5 zile, 483 km). E muncă cunoscută, deci scoasă din parcare? Pe 24.09 aceeași cursă n-a
   fost prinsă la poartă (99,4 km socotiți gol): regula «trecere la > 20 km» a prins-o doar după corectură.
10. **Unde stau regulile.** Nu există `lde_uzine` MEJGOROD. Variante:
    - (a) un rând nou `lde_uzine` «MEJGOROD» (Rute interurbane) cu textul regulilor, editabil pe `/lde/livrare-reguli`;
    - (b) regulile doar în plan și în memoria proiectului.
11. **Analiza de luni MEJGOROD nu rulează.** 28.09 lipsește: blocul nu e în `lear-saptamanal.sh`. Parcarea are nevoie de cursele săptămânii.
    - (a) lanț propriu `mejgorod-parcare/lant.sh`, luni, cu nomenclatorul + cursele lui;
    - (b) repornim întâi analiza MEJGOROD de luni, cu posterul ei, și parcarea vine după.
12. **Posterul:** la LEAR doar pagini. La mejgorod tot doar pagini (harta + blocul din raportul MEJGOROD), sau un rând în posterul MEJGOROD?

## Pași (după răspunsuri, faza «execută», tichet separat)

1. `mejgorod-parcare/parcare.mjs` pe VPS, din `vps/masoara.mjs`:
   - ieșirea `date.parcare` ca la LEAR: `masini[]` cu `P[]`, `drumuri[]`, `real`, `propus`, `taiat`, `motiv`;
   - regulile hotărâte în întrebările 1–9;
   - testul alegerii refolosit (`lear-parcare-alege.test.mjs`) + probele: noapte A, noapte B, zi liberă, poarta SEBN, Trox din trecere.
2. `mejgorod-parcare/harta.mjs`: pe mașină și zi, intervalele cu oameni / gol / stă la gară, opririle ≥ 5 min, unde doarme, P1 / P2 și
   drumurile propuse. Controlul: km pe intervale = km zilei (±5 %).
3. Validarea (`valid.mjs`) și publicarea atomică. Migrație nouă, după pasul-poartă:
   - funcția `lde_publica_mejgorod_parcare`, sau extinderea listei din 441 printr-o funcție nouă, fără a o atinge pe cea LEAR;
   - REVOKE PUBLIC / anon / authenticated.
4. Lanțul de luni (întrebarea 11): durata măsurată de mână înainte; `MEJGOROD_PARCARE=0` îl sare; picat = nu scrie, restul uzinelor merge.
5. Panoul:
   - `UZINE_HARTA.mejgorod` (`schelet-mejgorod.json`, gările ca «porți»);
   - `uzHarta` acceptă `mejgorod`;
   - `randuriDinIntervale` cu textul «stă la gară»;
   - blocul «Parcarea propusă» în raportul MEJGOROD (`/lde/reguli?uz=mejgorod`).
6. Regulile (întrebarea 10): migrația textului, doar după «da».

## Fișiere

- **Noi, pe VPS:** `/root/lde-worker/mejgorod-parcare/{parcare,harta,valid,publica}.mjs`, `lant.sh`.
  Cercetarea stă în `cercetare/` și nu intră în lanț.
- **Repo:**
  - `lde-geo-worker/mejgorod-parcare/` (copii);
  - `apps/admin/src/lib/lde/drax-harta.ts` (`UZINE_HARTA`, `uzHarta`);
  - `apps/admin/src/app/(dashboard)/lde/harta/{page,HartaClient}.tsx`;
  - `apps/admin/src/app/(dashboard)/lde/reguli/` (blocul MEJGOROD);
  - migrațiile `packages/db/migrations/4NN_lde_publica_mejgorod_parcare.sql` și, eventual, `4NN_lde_mejgorod_reguli.sql`. Numărul se verifică
    ȘI în repo, ȘI în `schema_migrations`.
- **Neatinse:** lanțurile și datele Drăxlmaier, LEAR Ungheni, LEAR Florești; `mejgorod/cod` și `mejgorod/date` (scheletul ION-55);
  `lde-timp-liber`; funcția 441.

## Riscuri

- **Economia umflată de goluri care nu sunt parcare:**
  - excursii (timp liber) și curse nedetectate;
  - SEBN la 652AKD, prinsă după o corectură; 318BRAT fără puncte, dar cu 1.210 km.

  Controlul pe toată flota rămâne obligatoriu la fiecare rulare (memoria `analiza-verifica-toata-flota`).
- **Locurile P arbitrare pe culoar:** orice sat de pe drumul E → S are același cost. Fără preferința pentru capăt (întrebarea 2), P1 iese
  un sat oarecare de pe drum (Hlina, Frunză), greu de dat ca instrucțiune.
- **Tracker tăcut:** golul cu urma mai scurtă decât drumul direct face economia prea mică (2 goluri). Tracker-ul mut pe zile întregi scoate
  mașina (318BRAT).
- **Graficul greșit:** mașina din `daily_assignments` nu e cea care a mers. Cursa iese fără urmă, iar golul se lungește peste o zi reală de
  muncă. Săptămâna măsurată are 16 cazuri; se listează.
- **Regula din 25.09 contrazisă:** fără răspunsul la întrebarea 1, pagina ar arăta 3.263 km/săpt., iar posterul vechi 681.
- **Publicarea:** ~36 mașini × 7 zile ≈ 250 de rânduri în `lde_harta_zi`. Mărimea cererii RPC se măsoară înainte: limita de 8 s pe
  authenticator (ION-143 C6); LEAR Ungheni avea 71 de rânduri și 1,55 MB.

## Verificare

- `/lde/harta?uz=mejgorod` arată cele 36 de mașini, fiecare cu P1 / P2 și km de tăiat, sau cu motivul pentru care n-are propunere.
  Cele 10 de mai sus au motivele din secțiunea Flota.
- Pe fiecare zi: km pe intervale = km zilei (±5 %). Niciun drum propus peste km de acum. A doua rulare dă aceeași cifră (cache Valhalla).
- Probele pe zile reale:
  - 688AKD 21.09 (noapte B, acasă la Halahora de Sus, 79,3 → 16,1);
  - 735LYY 21.09 (noapte A la Tețcani, doarme Briceni, 54,8 → 0,1);
  - 652AKD 21–25.09 (SEBN, scos);
  - 065LTL 26–28.09 (zi liberă, 125,3 km, scos);
  - 654TWK (doarme la gara Chișinău, 0).
- Controlul porții: 0 nopți scoase din trecerea pe lângă Trox.
- Cifra săptămânii 21–27.09, pentru comparație la execuție: 3.262,9 km/săpt. cu metoda de aici. Se schimbă după răspunsurile 1, 2, 6 și 7.
