# ION-150: Camioane (cisterne), harta mașinii și locul de stat/dormit P1/P2 (runda 1, cercetare)

## Cererea lui Ion (nu se dezbate)
Ion, 30.09.2026: «creează-le hărțile la toate direcțiile cu punctele optimale de dormit cum ai făcut la Drăxlmaier și LEAR».
Modelele: ION-130 (harta, `lde_harta_zi`, migr. 431), ION-136 (parcarea Drăxlmaier, migr. 438), ION-143 (parcarea LEAR, migr. 440/441).
Regulile permanente care se aplică și aici:
- km reali din GPS, nu geometria (memoria `km-reali-gps-nu-geometrie`);
- doar km (lei doar unde există normă: 34 l/100 km, `verifica-zi.mjs:31`);
- toată flota Wialon, nu doar nomenclatorul (Ion, 28.09);
- idealul cisternelor = cel mai scurt drum permis prin Giurgiulești / Albița, cu Albița de bază (Ion, 27–28.09; memoria `camioane-schelet-ion-69`);
- km din afara traseului nu se socotesc nici la motorină, nici la salariu (Ion, 30.09; memoria `grupa-camioane-in-rusa`);
- tot ce pleacă în grupa camioanelor e pe rusă (Ion, 30.09).
Condiția pusă de sesiunea principală: nu propunem nimic care încalcă odihna obligatorie a șoferului.

## De ce
`/lde/harta` are azi doar Drăxlmaier, LEAR Ungheni și LEAR Florești (`apps/admin/src/lib/lde/drax-harta.ts:79-84`, `UZINE_HARTA`).
Pentru cisterne nu există nici harta mașinii, nici o propunere de loc. Ion vrea să vadă, pe fiecare mașină, unde stă între
descărcare și încărcarea următoare și unde doarme pe drum, și unde ar fi mai bine să stea.

**Concluzia măsurării, înainte de metodă:** la cisterne locul de stat costă puțin. În septembrie, pe toată flota activă, ocolurile
făcute ca să ajungă la locul de parcare însumează **≈ 331 km/lună**: 130 km la odihna zilnică și 201 km la staționările de peste 24 h,
acasă sau în așteptarea comenzii. Asta înseamnă 0,7 % din cei 49.094 km GPS ai lunii. La LEAR Ungheni cifra e 3.425 km pe **săptămână**.
Km în plus ai cisternelor vin din drum: 12 drumuri goale cu ideal cunoscut au mers **+1.927 km** peste ideal într-o lună,
prin vama aleasă, A2 și ocolurile. Pe acestea le judecă deja verificarea zilnică ION-144.
Harta rămâne utilă (Ion vede cursa, opririle și drumul față de schelet), dar P1/P2 nu va da o cifră mare. Asta i se spune lui Ion în întrebarea 1.

## 🔬 Verificat pe viu (30.09.2026, doar citire)
Scripturile și ieșirile sunt în `cercetare/`. Pe VPS: `/root/lde-worker/camioane-parcare/cercetare/opriri.mjs`, care importă
`camioane/verif/lib.mjs` și `seg-core.mjs` fără să le schimbe. Rulează în 48 s și scrie `opriri.json`.
Pe mini: `analiza.mjs`, `parcare.mjs` și `sumar.mjs`, cu drumurile pe Valhalla 4 țări (colima, 127.0.0.1:8003, truck 40 t, hazmat, fără bac;
720 de rute cerute). Fereastra: 01.09 00:00 – 30.09 00:00, ora Moldovei. Urmele de pe VPS merg până la 29.09 inclusiv.

**Flota (Wialon, 31 de plăci în `camioane/date/urme`):**
- 11 cisterne active, cu 49.094 km în total: ANT344 3.286, ANT347 4.155, HMK135 4.556, IIC263 4.758, KWX620 4.742, KYK742 2.313,
  LJN076 4.763, LJN080 2.264, MOW214 4.515, RWN169 9.778, RWN193 3.964.
- 3 stau toată luna (0 km): DKE248 la Baza Briceni, HMK139 la Baza Briceni, LML973 la stația Meșterul Manole 696 h.
- 5 n-au urmă: ANT316, BNQ076, BNQ088, HMK145, MOW218 (error 7 sau dezactivate; memoria `camioane-gps-goluri-23-09`).
- Camioanele de cereale (QDQ*, KYK692, KYK784, IIC230, YJX724, BNQ069, BNQ085) nu intră (vezi întrebarea 7).
- RWN169 e «zernovoz» în `lde_truck_profile`, dar face curse de motorină. Golul lui din 04–24.09 are 7.515 km și 480 h: cuprinde alte
  curse, nerecunoscute, și se scoate cu regula ION-144 (drum gol > 5 zile și > 2 × idealul, `verifica-zi.mjs:228-231`).
- În `lde_truck_trips` septembrie are 0–4 curse pe mașină, deci jurnalul nu ajunge. Sursa este urma GPS tăiată cu `seg-core.mjs`.

**Unde stă cisterna.** Au intrat opririle ≥ 2 h (`grupeazaOpriri`), pe cele 11 active. Orele din lună, pe clase de loc:
în afara punctelor în Moldova 1.762 h · stația Chișinău (Bacioi / Manole) 1.651 · la încărcare (Constanța / Petromidia / Berdichev) 694 ·
Baza Briceni 659 · Bulgaria 441 · vamă 408 · România 348 · fără semnal 130 · la descărcare 128 · Ucraina 118.
Pe faze (`cercetare/analiza.out`):
- cea mai mare este «la descărcare, la stația Chișinău», 1.134 h: mașina stă zile întregi la bază după descărcare;
- gol, în afara punctelor în Moldova: 724 h;
- coada la încărcare: 694 h;
- biodiesel plin: în Bulgaria 362 h, în Moldova 335 h, la vamă 308 h.

**Noaptea, poziția la 03:00** (319 nopți-mașină):
| Unde | Nopți |
|---|---|
| Moldova, în afara punctelor (acasă) | 90 |
| stația Chișinău | 70 |
| la încărcare | 32 |
| Baza Briceni | 32 |
| vamă | 28 |
| România | 24 |
| Bulgaria | 20 |
| în mers | 12 |
| la descărcare | 5 |
| Ucraina | 4 |
| Baza Bălți | 1 |
| fără semnal | 1 |

**Locurile unde mașinile dorm în mod obișnuit** (opriri ≥ 8 h în afara punctelor, grupate la 3 km):
- Bubuieci, la 5,4 km de stația Meșterul Manole: ANT347 6× 476 h și KWX620 10× 440 h. Aici stau și plin (KWX620 123 h, ANT347 146 h).
- Răuțel, la 6,7 km de TLX Bălți: HMK135 4×, 240 h.
- Edineț / Cupcini, la 24–34 km de Baza Briceni: RWN169 5×, 223 h; LJN076 3×, 54 h.
- Ungheni (47.2229, 27.8104): ANT344 102 h, RWN193 2×, 139 h, HMK135 60 h. Locul e ZEL Ungheni, la 0,6 km de punctul
  «ZEL Ungheni — acte». Raza punctului e de 300 m, deci așteptarea la acte nu e recunoscută ca punct.
- Pe drum, la odihna zilnică: Galați / Albina (plin spre Chișinău), Ovidiu / Agigea (9 h înaintea încărcării la Constanța),
  Giurgiu / Remuș (12–33 h, înainte de Ruse), Novi Iskăr 42.8189, 23.3687 (17–121 h).

**Ce costă locul (`cercetare/parcare.out`).** Drumul a fost tăiat la opririle de lucru: punct de dispecerat ≥ 15 min, fără vamă sau tranzit,
ca în ION-122. Pe fiecare bucată cu parcare ≥ 8 h: real = V(a, parcare₁) + … + V(parcareₙ, b), direct = V(a, b). Au ieșit 24 de bucăți
(fără RWN169 din 04–24.09):
- 15 cu odihnă sub 24 h: ocol 130 km. De exemplu LJN076: Albina 45,7 km (plin Constanța → Chișinău) și Cupcini 38,4 (gol spre Berdichev);
  KWX620: Bubuieci 12,7 + 12,8 + 6,9 (seara de la Manole la Bubuieci și înapoi).
  Odihna la Galați, Ovidiu, Agigea, Novi Iskăr și Siminoc costă 0–7 km: e pe drum.
- 9 cu staționare ≥ 24 h (acasă sau în așteptare): ocol 201 km. HMK135 Răuțel → Berdichev 42,9; RWN169 Edineț → Berdichev 66,6;
  ANT347 / KWX620 Bubuieci 7–22 pe drum.
- Alegerea P1/P2 după regulile ION-143 (loc unic, P2 dacă scade ≥ 20 km și e folosit ≥ 2 ori; loc 0 când câștigul < max(2 km, 5 %)):
  - varianta B (doar odihna sub 24 h): **71 km/lună**, din care KWX620 25,5 (Meșterul Manole în loc de Bubuieci) și LJN076 45,7
    (Bacioi, adică fără oprirea de la Albina; admisibil doar dacă timpul de condus permite, vezi Riscuri);
  - varianta A (și staționările lungi): îl mută pe HMK135 la Galați 102,6 km. E absurd: e o așteptare de 234 h lângă casă.
    De aici regula propusă: staționările ≥ 24 h nu se mută (întrebarea 2).

**Drumul gol față de ideal** (golurile încheiate în septembrie: 30, din care 27 judecabile):
- 12 au ideal în matricea `SK.goale`, de la stațiile / bazele Moldovei la Constanța sau Petromidia: 7.508 km reali față de 5.582 ideal, +1.927 km.
  De exemplu: KWX620 Orhei → Petromidia +759 (210 h, cu 4 dus-întors Bubuieci ↔ Manole); KYK742 Manole → Petromidia +591 (184 h la Manole);
  ANT347 Briceni → Constanța +226.
- 15 **n-au ideal**: goluri spre Berdichev (Briceni → Berdichev, 282–348 km) și goluri din capătul biodieselului
  (Sofia / Ruse → Constanța, 567–822 km). Matricea `verificare-schelet.json` are doar descărcările de motorină ca origine.

**Defecte de puncte găsite pe toată flota** (control pe fiecare mașină, fiecare clasă):
1. Descărcarea de biodiesel Sofia: punctul are 42.6977, 23.3219 și raza de 2 km, dar toate cele 6 opriri lungi ale flotei sunt la
   42.8189, 23.3687 (Novi Iskăr), adică la ≈ 14 km. Descărcarea nu e recunoscută (`capat = de_confirmat`, capăt provizoriu).
   Asta atinge și ION-144.
2. Ruse: opririle sunt la 43.874–43.879, 25.997–26.023, la 2,9–4,9 km de punct (raza de 2 km).
3. ZEL Ungheni: așteptarea la acte e la 0,6 km, iar raza e de 300 m.
4. KYK742: 130 h fără semnal la Bacioi. ANT347, la o bucată plină spre Briceni: Valhalla «fastest» dă direct 749 și prin Bubuieci 689,
   adică ocol negativ −60. Ocolul se taie la 0, iar la execuție se folosește profilul scheletului (vezi Pași).

**Baza de date:**
- `lde_uzine` nu are rând pentru camioane. Are 12 consumatori în cod (atribuiri, șoferi, verificare), deci un rând fals
  «CAMIOANE» ar intra în ei.
- `lde_analiza_reguli` e unic pe (uzina, saptamina) și nu are CHECK pe uzina. `lde_harta_zi` are cheia (uzina, saptamina, m, z) și nici el n-are CHECK.
- `lde_publica_lear_parcare` acceptă doar LEAR (migr. 441, lista fixă).
- Ultima migrație: 445b, atât în repo (`origin/main`), cât și în `schema_migrations`. Următorul număr liber e **446**.
- VPS-ul n-are Valhalla pentru RO, UA și BG (memoria `camioane-verificare-traseu-zilnic`). Valhalla pe 4 țări e doar pe mini, în colima.

## Ce facem (propunerea)
Unitatea nu e ziua cu ture, ci **ciclul cisternei**: încărcare → plin → descărcare(i) → gol → încărcarea următoare.
Parcarea se judecă doar pe bucățile de drum dintre două opriri de lucru, și doar unde mașina a stat ≥ 8 h în afara punctelor.

1. **Harta** (`/lde/harta?uz=camioane`): un rând `lde_harta_zi` pe mașină și zi calendaristică (00:00–24:00, ora Moldovei; vezi întrebarea 5).
   - Urma e tăiată pe intervale: plin (cu marfă) · gol · la punct (încărcare / descărcare / bază / vamă, cu numele) · parcare ≥ 8 h ·
     oprire 2–8 h.
   - Sub urmă: linia ideală din `schelet-camioane.json` a cursei curente (motorină: `linii[vama]`; biodiesel: `B1–B8`).
   - Lista din stânga: mașinile cu km-ii lunii / săptămânii, km peste ideal (din `lde_truck_route_checks`) și km de tăiat din parcare.
2. **P1/P2 pe mașină**, după regulile ION-143, cu trei schimbări:
   - (a) candidații nu sunt toate satele de la ≤ 15 km, ci: bazele Briceni / Bălți, stațiile Bacioi / Manole, vămile Albița / Giurgiulești,
     locurile unde flota deja doarme (grup de 3 km, ≥ 2 opriri) și orașele (`town` / `city`) de la ≤ 15 km de capete.
     O cisternă ADR nu se parchează în orice sat;
   - (b) staționările ≥ 24 h (odihna săptămânală sau așteptarea comenzii, de obicei acasă) **nu se mută**. Apar pe hartă cu ocolul lor,
     dar nu intră în km de tăiat (întrebarea 2);
   - (c) un loc propus e admis doar dacă timpul de condus al bucății, de la odihna precedentă până la P și de la P până la odihna
     următoare, rămâne ≤ 9 h pe Valhalla. Durata odihnei nu se scurtează niciodată: se mută doar locul.
3. **Drumurile pe șosea:** pe mini se calculează o matrice între ancore, cu același profil ca scheletul (40 t, hazmat, fără bac, poligoanele
   bacurilor excluse). Ancorele sunt punctele fixe, locurile de dormit (grupuri) și candidații. Se exportă ca `parcare-matrice.json`
   lângă `verificare-schelet.json`, la fel ca ION-144.
   Lanțul săptămânal de pe VPS folosește doar matricea. O oprire care nu cade la ≤ 3 km de o ancoră primește steagul
   «loc nou, fără drum în matrice» și nu intră în sumă până la exportul următor. Fără estimări pe linie dreaptă.
4. **Publicarea:** funcție nouă `lde_publica_camioane_parcare`, după modelul 441 (atomic: `date.parcare` în rândul
   `lde_analiza_reguli` cu uzina = 'CAMIOANE' + rândurile `lde_harta_zi` ale perioadei). Funcția LEAR nu se atinge.
5. **Controlul pe toată flota:** fiecare placă Wialon apare cu judecata sau cu motivul. Motivele posibile: fără urmă, stă toată luna,
   cereale, gol nejudecabil (> 5 zile și > 2 × ideal), capăt provizoriu (Sofia / Ruse, până se repară punctele).

### Variante respinse
- **Metoda LEAR ca atare** (goluri ≥ 60 min între bucăți de muncă, candidați toate satele OSM de la ≤ 15 km, poarta = candidat).
  Cisternele n-au poartă și nici ferestre de ceas. Golurile lor țin zile, iar satele nu sunt locuri de parcare pentru o cisternă cu motorină.
  Varianta A de mai sus arată ce iese: HMK135 ar trebui să aștepte 10 zile la Galați.
- **Metoda Drăxlmaier** (ziua ideală cu ancore E / S și legături): nu există zi ideală a cisternei. Idealul e pe cursă (ION-69), nu pe zi.
- **«Așteaptă comanda la încărcare / la vamă»** (P = Constanța sau Albița pentru toate staționările): ar tăia ocolul spre casă
  (201 km/lună), dar șoferul ar sta zile întregi departe de casă. Odihna săptămânală normală nu se face în cabină. Asta decide Ion,
  nu calculul (întrebarea 2).

## Pași (după aprobare; execută alt tichet sau aceeași fază, «execută»)
1. `~/dev/camioane-schelet/parcare-matrice.mjs`: construiește ancorele din urma ultimelor 60 de zile a toată flotei, rulează Valhalla
   (profilul scheletului) și scrie `verif-vps/date/parcare-matrice.json`. Se rulează din nou la orice schimbare de schelet,
   împreună cu `export-verificare.mjs`.
2. VPS `/root/lde-worker/camioane-parcare/`, fișiere noi:
   - `parcare.mjs`: importă `camioane/verif/seg-core.mjs`, taie ciclurile, bucățile, parcările, alegerea P1/P2 cu testul;
   - `parcare-valid.mjs`: peste real, nefinit, loc neeligibil, drum fără loc, încălcarea celor 9 h;
   - `harta.mjs`: rândurile `lde_harta_zi`;
   - `publica.mjs`: RPC-ul, cu refuz peste 2,5 MB;
   - `lant.sh`.
   Rulează o dată pe săptămână, după `verifica-zi.sh` de luni. Ora și cronul le hotărăște sesiunea principală.
   Nu se schimbă `camioane/verif/*`, `verifica-zi.sh` și nici cronul de 07:30.
3. Migrația 446: `lde_publica_camioane_parcare(p_saptamina date, p_parcare jsonb, p_harta jsonb)` cu uzina fixă 'CAMIOANE',
   upsert pe (uzina, saptamina), `DELETE` + `INSERT` în `lde_harta_zi`, `REVOKE … FROM PUBLIC, anon, authenticated`, `GRANT` service_role.
   Pas-poartă înaintea aplicării.
4. Panoul:
   - `drax-harta.ts`: `UZINE_HARTA.camioane` (id 'CAMIOANE', schelet 'schelet-camioane.json', fără poartă), `uzHarta` acceptă 'camioane',
     `TipInterval` primește 'plin' / 'punct' / 'parcare' compatibil (tipurile vechi rămân);
   - `harta/page.tsx`: ramura camioane (linia cursei din schelet);
   - `HartaClient.tsx`: legenda și rândurile «drum cu drum» pentru cicluri de mai multe zile.
   Drăxlmaier, Ungheni și Florești rămân neatinse (verificat cu adresele vechi).
5. Regulile, în textul lui Ion, după răspunsul la întrebarea 6.

## Fișiere
Noi:
- `~/dev/camioane-schelet/parcare-matrice.mjs`
- VPS `/root/lde-worker/camioane-parcare/{parcare,parcare-valid,harta,publica}.mjs` + `lant.sh`, copie în `lde-geo-worker/camioane-parcare/`
- `packages/db/migrations/446_lde_publica_camioane_parcare.sql`

Schimbate:
- `apps/admin/src/lib/lde/drax-harta.ts`
- `apps/admin/src/app/(dashboard)/lde/harta/{page.tsx,HartaClient.tsx,actions.ts}`

Cercetarea: `docs/plans/2026-09-30-camioane-parcare/cercetare/*`.

## Riscuri
- **Odihna șoferului (AETR):**
  - condus ≤ 9 h/zi (10 h de două ori pe săptămână), pauză de 45 min după 4 h 30;
  - odihnă zilnică ≥ 11 h (9 h redusă, de cel mult 3 ori);
  - odihnă săptămânală de 45 h (24 h redusă).
  Tahograful nu e în bază, iar GPS-ul dă doar mersul și opririle. Regula (c) folosește timpul Valhalla, nu tahograful.
  Propunerea mută doar locul odihnei, nu durata ei. Cazul LJN076 / Albina (45,7 km) poate să nu fie realizabil dacă plecarea de la
  Constanța a fost seara: se verifică pe tahograf sau se lasă «rămâne cum e».
- **ADR:** parcarea unei cisterne încărcate (plin: Bubuieci 123–146 h) poate cere loc supravegheat. Nu decid eu; e o întrebare,
  iar propunerea nu pune niciun loc de parcare pentru plin în afara bazelor / stațiilor fără «da»-ul lui Ion.
- Punctele Sofia / Ruse / ZEL greșite fac ca descărcările să nu fie recunoscute, deci ciclurile biodieselului ies cu capăt provizoriu.
  Repararea lor (`lde_dispatch_points`) atinge automatul trip-live și ION-144, deci e tichet separat.
- Valhalla pe mini: fără colima pornită, exportul nu se face. Lanțul de luni merge pe ultima matrice, iar locurile noi primesc steag.
- Cifra e mică (≈ 71–331 km/lună). Dacă Ion vrea doar harta, P1/P2 poate rămâne informativ, fără poster.

## Verificare
- Rerularea cercetării: `opriri.mjs` pe VPS → `analiza.mjs` / `parcare.mjs` / `sumar.mjs` pe mini. Aceleași cifre, cu excepția câmpului `rulat`.
- Fiecare placă Wialon din `camioane/date/urme` apare pe `/lde/harta?uz=camioane` sau în lista «fără judecată» cu motivul (31 / 31).
- Σ km ai intervalelor pe hartă = km GPS ai zilei (± 3 %).
- Nicio propunere cu bucată de condus > 9 h (`parcare-valid.mjs` refuză).
- Staționările ≥ 24 h au economie 0.
- Proba atomică a RPC-ului, ca la 441: o eroare forțată nu schimbă nimic.
- `/lde/harta` fără `uz`, cu `?uz=ungheni` și cu `?uz=floresti`: aceleași pagini ca înainte (curl cu sesiune ADMIN).

## Diferențe față de LEAR (ION-143)
| | LEAR | Cisterne |
|---|---|---|
| Unitatea | ziua de lucru 03:00, două ture | ciclul de 1–10 zile, zi calendaristică pe hartă |
| Munca | tur / retur în ferestrele de ceas | plin / gol între puncte (`seg-core.mjs`) |
| Pragul golului | ≥ 60 min | ≥ 8 h (parcare justificată, ION-122) |
| Candidați | toate satele de la ≤ 15 km + poarta + casa | baze, stații, vămi, locuri deja folosite, orașe |
| Staționările lungi | > 12 h scoase | ≥ 24 h rămân acasă (întrebarea 2) |
| Odihna | nu se pune problema | regula celor 9 h de condus |
| Drumul | Valhalla pe VPS | matrice exportată de pe mini (VPS n-are RO / UA / BG) |
| Cifra | Ungheni −3.425 km/săpt. | ≈ 71 km/lună (doar odihnă zilnică), ≤ 331 cu tot |
| Regulile | `lde_uzine.reguli_livrare` §13 | nu există rând în `lde_uzine` (întrebarea 6) |

## Întrebări pentru Ion
1. **Cifra e mică.** Ocolurile pentru locul de stat au fost în septembrie 130 km la odihna zilnică și 201 km la staționările de peste o zi,
   adică 331 din 49.094 km (0,7 %). Km în plus sunt pe drum: +1.927 km pe 12 drumuri goale (vama, A2), iar pe acestea le arată deja
   raportul de la 08:00. Facem harta cu P1/P2 cum ai cerut, sau harta cu drumul față de schelet, iar P1/P2 doar ca informație?
2. **Staționarea de peste 24 h** (acasă sau în așteptarea comenzii: Bubuieci, Răuțel, Edineț / Cupcini) o lăsăm acasă, fără km de tăiat?
   Sau vrei ca mașina să aștepte comanda la bază / la vamă, cu șoferul departe de casă (≈ 201 km/lună)?
3. **Bubuieci** (5,4 km de Meșterul Manole): ANT347 și KWX620 dorm acolo împreună 916 h/lună, și cu marfă (123–146 h plin). E parcarea firmei,
   casa șoferului, sau trebuie să stea la bază? Cisterna plină poate sta acolo?
4. **Locurile de odihnă pe drum:** Galați, Ovidiu / Agigea (lângă Constanța), Giurgiu, Novi Iskăr. Pe acestea le lăsăm ca bune (ocol 0–7 km)?
   Albina (LJN076, +46 km pe plin spre Chișinău) o socotim abatere?
5. **Harta pe zi calendaristică** (00:00–24:00), cu ciclul întreg vizibil pe lista zilelor, e bine? Sau vrei o pagină pe cursă
   (încărcare → încărcare)?
6. **Unde scriem regulile cisternelor?** Nu e o uzină: un rând în `lde_uzine` ar apărea în atribuiri și la șoferi. Propunere: textul
   regulilor pe pagina scheletului camioanelor (fila din LDE), iar cifrele în `lde_analiza_reguli` cu cheia CAMIOANE.
7. **Camioanele de cereale** (QDQ*, KYK692, KYK784, IIC230, YJX724, BNQ069, BNQ085) le vrei și pe ele pe hartă?
   N-au schelet ideal, deci ar fi doar urma, fără P1/P2.
8. **Punctele greșite:** descărcarea Sofia e de fapt la Novi Iskăr (≈ 14 km de punct), Ruse la 3–5 km, iar ZEL Ungheni așteaptă la 0,6 km.
   Le corectăm (tichet separat, schimbă și raportul zilnic)?

## Deciziile lui Ion

- **30.09, întrebarea 1:** «drumul față de schelet, P1/P2 doar informativ». Harta camioanelor arată urma GPS față de linia ideală din schelet (vama, drumul prin România și Moldova, abaterile din ION-144). P1/P2 apar doar ca informație, fără «km de tăiat» și fără să intre în totaluri.
