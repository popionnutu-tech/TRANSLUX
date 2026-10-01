# ION-147 — SEBN Orhei + Strășeni: harta mașinii și parcarea optimă P1 / P2 (cercetare, runda 0)

Cerere (Ion, 30.09.2026, nu se dezbate): «creează-le hărțile la toate direcțiile cu punctele optimale de dormit cum ai făcut la Drăxlmaier și
LEAR». Modelele: ION-143 (docs/plans/2026-09-29-lear-parcare/, activ pe VPS din 29.09), ION-136 (docs/plans/2026-09-29-drax-parcare/),
ION-130 (docs/plans/2026-09-28-lde-harta-masinii/). Scheletul SEBN: ION-38 (VPS /root/lde-worker/sebn/, public/lde/schelet-sebn.json).
Acest dosar e FAZA DE CERCETARE: nimic scris în bază, nimic schimbat în lanțuri, cod doar în /root/lde-worker/sebn-parcare/cercetare/.

## De ce

/lde/harta arată azi doar Drăxlmaier, LEAR Ungheni și LEAR Florești (UZINE_HARTA, apps/admin/src/lib/lde/drax-harta.ts:89-93). SEBN
(26 de mașini pe săptămână, trei schimburi) n-are nici harta zilei, nici parcarea propusă. Regula de economie SEBN e deja scrisă de Ion și e
exact parcarea: lde_uzine.reguli_livrare SEBN_ORHEI / SEBN_STRASENI (reguli_livrare_la 2026-09-26 14:35:58 UTC, md5 b6ee5856…, identic pe
ambele rânduri), §8 R1: «Livrarea: șofer din satul de start sau mașina așteaptă la capăt între ture, nu acasă» și §5.3 «ASTA e economia la
SEBN — se taie cu un șofer din satul de start sau cu mașina care așteaptă între ture la capăt».

## Ce facem (propunerea)

Metoda LEAR ION-143 (lear-parcare.mjs, Claude 8/10 + Codex 10/10) pe urma GPS a săptămânii, cu ce diferă la SEBN după regulile din bază:

1. Intrarea: sebn-liber.mjs (lanțul SEBN de luni) primește `--dump`, ca lear-analiza la ION-143 — urma fiecărei mașini a flotei (§11.10:
   ≥ 4 zile la o poartă SEBN), poarta ei (Orhei = mijlocul poartă + Bucuria, rază 0,9; Strășeni 0,7), casa, rutele din schelet cu capătul,
   cursele «liber» / brambura și cursele «pe ruta ei, fără poartă» (§11.12). Nimic altceva din sebn-liber nu se schimbă.
2. Munca, golurile, real / propus, alegerea P1 / P2 și «rămâne cum e» — neschimbate față de LEAR (lear-parcare-alege.mjs, aceeași funcție).
3. Diferențele SEBN (fiecare cu sursa):
   - **poarta NU e candidat** (§2.3 «Mașina NU poate sta la uzină între ture», §8.1). Măsurat: cu poarta candidat cifra e aceeași (1.923,7 =
     1.923,7, rulari/parcare-0921-P.log) — regula nu costă nimic;
   - **predarea la poartă nu e drum de parcare**: golul poartă → poartă care nu iese la > 5 km (LEAR: 2 km) se scoate — vezi 🔬 punctul 3;
   - tăietura pe capăt la ≤ 1,5 km (§4.3; LEAR are 1 km);
   - §11.12: cursa pe ruta ei, fără poartă = muncă (LEAR n-are regula);
   - două porți, un singur rând «SEBN» în lde_analiza_reguli (cheia pe care o scrie sebn-liber.mjs); porțile SEBN nu sunt «altă uzină» una
     pentru cealaltă (§11.5);
   - ruta ADM Bălți (R23, 152BRAZ) are capătul la ~0,9 km de Parcul Bălți: raza «service» rămâne 0,5 km (§11.4) la mașina asta, nu 4 km ca la LEAR;
   - rutele mașinii: din schelet, iar când mașina nu trece pe capătul rutei ei din schelet în ≥ 3 zile, rutele ale căror capete le trece în
     ≥ 3 zile (§1.1 «cine lucrează și pe ce rută se vede din urma GPS»; Ion 24.09 «mașinile pot să se schimbe») — cu steag «rută din GPS».
4. Harta: sebn-harta.mjs (din lear-harta.mjs) → lde_harta_zi uzina `SEBN`; publicarea atomică prin RPC (ca migr. 441). Panoul: `sebn` în
   UZINE_HARTA cu DOUĂ porți, scheletul public/lde/schelet-sebn.json (aceeași formă `rute[].g.tur.plin` ca LEAR — verificat).
5. Lanțul de luni: în lear-saptamanal.sh, imediat după `sebn-liber.mjs --write` (care rescrie `date` și ar șterge date.parcare — aceeași
   capcană ca la LEAR, memoria lear-parcare-propusa), `sebn-parcare/lant.sh`; SEBN_PARCARE=0 îl sare; picat = nu scrie, restul merge.

### Variante respinse
- **A. lear-parcare.mjs ca atare** (poarta candidat, fără bucla predării, capete doar din schelet): prima rulare dă 2.502,1 km/săpt.
  (rulari/parcare-0921-r0.log, prima rulare, înaintea corecțiilor), din care ~580 km sunt falși: 90 de «goluri» de o oră la poartă (predarea, 1.121 km real)
  propuse «P2 Orhei» cu 5,5 km, iar 034BRAT (R3 Domulgeni după GPS) iese fără propunere pentru că în schelet ruta e a lui 584BRAX. Respins:
  contrazice §2.3 și §1.1.
- **B. Cifra din posterul SEBN** (livrarea din lde_route_run, lib/lde/livrare-poster.ts) + «așteaptă la capăt» fără alegere de loc: n-are
  urma zilei, nu propune locul, nu dă harta pe care o cere Ion; livrarea nocturnă din lde_route_run are și alte praguri (552BRAO: 890,9 km
  livrare + 602,1 gol acasă pe 21–27.09, față de 1.119,6 km reali ai golurilor aici). Respins ca metodă; rămâne raportul existent (întrebarea 7).

## 🔬 Verificat pe viu (30.09.2026, cod rulat din fișiere, VPS /root/lde-worker/sebn-parcare/cercetare/)

Rulări: `sebn-dump.mjs --saptamina 2026-09-21 | 2026-09-14 --dump` (copie a sebn-liber.mjs neschimbat + dump, fără --write; md5 sebn-liber
bb750dba… = repo), apoi `sebn-parcare.mjs` (variantele A = propunerea fără rute din GPS, C = propunerea, B = fără pragul «rute neverificate»,
P = cu poarta candidat). Fișierele: vps/ (codul), rulari/ (ieșirile). Valhalla bus localhost:8002, 0 perechi fără drum. Determinist: a doua
rulare A dă aceeași cifră de flotă (vps/cmp.mjs; o singură mașină diferă în ordinea a două drumuri egale).

1. **Flota** (§11.10, din urmă): 26 de mașini 21–27.09 (25 Orhei + 552BRAO Strășeni), 24 pe 14–20.09. Km-ii zilei pe flotă
   (rulari/dump-*.log, vps/zile.mjs): luni–vineri 8.145–8.774 km/zi, **sâmbătă 2.215 km (doar returul s3 de vineri noapte), duminică 266 km
   (o mașină, 893BRAX)**; 14–20.09 la fel: sâmbătă 2.068, duminică 2 km. Deci SEBN a lucrat luni 05:00 → sâmbătă 06:00, contra §2.2
   «inclusiv sâmbăta și duminica» (lde_uzine.works_saturday/sunday = true).
2. **Ziua mașinii**: aceeași mașină face toate trei schimburile (schelet: 25 de rute cu `s1 = s2 = s3`); la fiecare predare aduce schimbul care
   intră și ia schimbul care iese (§2.3) — deci TREI goluri pe zi, toate între ~4 și ~7 h (niciunul > 12 h în zilele de lucru): după s3/s1
   (~07:00–13:00), după s1 (~15:30–21:30), noaptea după s2 (~00:00–04:30). La LEAR sunt două. Golurile < 60 min pe flotă: 225 / săpt.
3. **Predarea la poartă** (rulari/diag-0921.txt): 73 de goluri poartă → poartă ≥ 60 min (A înaintea corecției), TOATE la fel — cel mai
   departe Slobozia Doamnei, 3,7 km de poartă; apoi stă 15–76 min la Bucuria (0,3–0,5 km de poartă) și ia schimbul care iese. Real 9–21 km
   pe gol (una sau două bucle). Cu regula «bucla ≤ 5 km = predare»: 94 de goluri, **1.177,3 km/săpt. scoși** (21.09), 76 / 988,4 (14.09).
   Nu sunt drumuri de parcare; sunt însă km care se repetă (întrebarea 2).
4. **Rezultatul propus (C)**, km reali GPS, doar km (rulari/parcare-0921-C.log, parcare-0914-C.log):

   | Mașina | Ruta | Casa | 21–27.09: real → propus = de tăiat | Locul | 14–20.09 |
   |---|---|---|---|---|---|
   | 552BRAO | S1 Vatici → Strășeni | Chiperceni | 1.119,6 → 123,6 = **996,0** | P1 Vatici | 1.086,0 (Vatici) |
   | 034BRAT | R3 Domulgeni (din GPS; schelet: 584BRAX) | Ghindești | 452,8 → 62,8 = **390,0** | P1 Domulgeni | nu era în flotă |
   | 584BRAX | R14 Pohoarna | Cotiujenii Mari | 455,0 → 127,1 = **327,9** | P1 Pohoarna | 292,3 |
   | 541NPL | R18 Telenești | Ciulucani | 284,0 → 101,4 = **182,6** | P1 Telenești | 155,1 |
   | 812MUM | R2 Cișmea – Crihana | Cucuruzeni | 179,5 → 55,5 = **124,0** | P1 Crihana | 135,3 |
   | 152BRAZ | R23 Bălți (ADM) | Pământeni | 201,9 → 87,0 = 114,9 ⚠ | P1 Cișmea (3 drumuri) | 0 |
   | 739BRAZ | R22 Clișova #2 | Ciocîlteni | 296,1 → 199,8 = 96,3 | P1 Clișova | 109,9 |
   | 861BRAS | R27 Cășunca | Prodăneștii Vechi | 129,1 → 88,3 = 40,8 | P1 Ciutulești | 0 |
   | 823MUM | R8 Lupoaica ADM + R11 Nistreana | Slobozia Doamnei | 244,1 → 215,5 = 28,6 | P1 Pohorniceni | 26,9 |
   | 863MXL | R21 Clișova #1 | Ciocîlteni | 194,3 → 181,7 = 12,6 | P1 acasă | 0 |
   | **Flota** | | | **2.313,7 km/săpt.** (fără 152BRAZ: 2.198,8) | 10 cu loc, 16 fără | **1.904,6** (9 cu loc) |

   Pe feluri de gol (21.09, rulari/sumar-0921-C.txt): noaptea 875,5 km · după s1 441,6 + 253,5 din poartă · dimineața 507,5 + 235,6 din
   poartă. «Din poartă» = mai ales lunea dimineața (duminică noapte nu e schimb 3, deci după turul de luni 05:00 mașina pleacă goală) și
   552BRAO. 144 de drumuri, 48 «rămâne cum e». Niciun loc al doilea (P2) nu trece pragul de 20 km / 3 drumuri după corecții.
   552BRAO singură = 43 % (21.09) / 57 % (14.09) din flotă: e exact cazul din §4.7 (doarme la Chiperceni, Chiperceni → Vatici ~40 km pe cursă):
   golurile ei Vatici → Chiperceni → Vatici au 78–81 km reali fiecare.
5. **Fără propunere, cu motivul** (control pe toată flota, 21.09):
   - «nu scade km» (șoferul stă în satul de capăt sau la ≤ 4 km de el): 042BRAU, 142BRAZ, 372BRAY, 430CMX, 503BRAR, 514BRAZ, 602BRAS, 725YOZ
     (R12 Olișcani din GPS; schelet: 284BRAT), 795MUM, 808MUM, 820GXP, 942BRAZ;
   - «un singur schimb măsurat» (§8.3 LEAR, preluat): 314BRAT (vine la poartă doar ~13:50 și ~22:25; 5 goluri > 12 h), 389VKV (2 zile);
   - «rute neverificate» (> 50 % din tururi / retururi fără trecere pe la capăt): 522BRAT (R6 Lopatna: capătul atins 5 zile, dar 20 din 32 de
     curse tăiate pe opriri; casa Jora de Jos), 893BRAX (R20 Voroteț în schelet; în GPS trece pe la Nistreana 6 zile, Peresecina 5, Voroteț 5,
     14 curse poartă → poartă și drumuri spre Chiperceni / Chișinău-Rîșcani 39 km).
   Controlul LEAR §10 (nicio oprire în sat rămasă într-un drum de parcare): trece la toate 26.
6. **Semne de întrebare găsite pe date** (vps/arata.mjs, rulari/arata-0921-C.txt):
   - retururi pierdute: tur ≠ retur la 552BRAO 17/13, 503BRAR 19/13, 893BRAX 7/18, 152BRAZ 5/7 — golul pornește atunci de la poartă și
     înghite returul (503BRAR: «poarta 05:03 → Cogîlniceni 6 h → Lalova»). La 503BRAR nu schimbă nimic (rămâne cum e); la celelalte e prudent
     (golul real e mai lung, iar propunerea trece tot prin capăt);
   - 152BRAZ (ADM Bălți, program de birou §2.5): stă la poartă toată ziua (08:33–17:40); pe 24.09, între, 109,5 km până la Brînzenii Noi (39 km).
     «P1 Cișmea» iese din acest drum, nu din livrare; noaptea (17:40 → 07:00, > 12 h) nu intră deloc;
   - 823MUM (Lupoaica ADM + Nistreana): doarme la Orhei, 2 km de poartă; câștig 28,6 km;
   - 14–20.09: 042BRAU și 283BRAT primesc «P1 Orhei (oraș)» la 3 și 1 drum (82 km) — orașul e la ~2–3 km de poartă (întrebarea 3).
7. **Naveta cu altă mașină** (lde_naveta_sofer, 21–25.09): 073BRAO duce șoferul lui 820GXP (casa Ocnița-Răzeși, autobuzul la Vatici)
   164 / 197 / 164 / 197 / 131 km/zi = **853,5 km/săpt.**, în afara urmei lui 820GXP (820GXP iese «rămâne cum e»). La SEBN naveta cu altă mașină
   SE NUMĂRĂ (§5.4, Ion 21.09); la LEAR nu (§5.5).
8. **Baza**: lde_harta_zi are DRAXELMAIER 14.09 (195) și 21.09 (203), LEAR_UNGHENI 21.09 (71), LEAR_FLORESTI 21.09 (30). lde_analiza_reguli
   «SEBN» există pentru 27.07 … 21.09 (sebn-liber, luni 08:00), fără `parcare`. lde_publica_lear_parcare (migr. 441) admite doar
   ('LEAR_UNGHENI','LEAR Ungheni') și ('LEAR_FLORESTI','LEAR Florești'). Ultima migrație: 445b (repo origin/main 6f233eea și
   schema_migrations 20260929173921) → următoarea liberă 446 (de verificat din nou la execuție).
9. **Mărimea hărții**: LEAR Ungheni dump 16,5 MB → hartă 1,59 MB (71 rânduri). SEBN dump 29,6 MB, ~150 de mașini-zile → estimat ~2,8 MB, peste
   plafonul de 2,5 MB din publica-lear-parcare.mjs (statement_timeout 8 s pe authenticator). De măsurat la execuție, înaintea RPC (riscul 2).

## Pași (după aprobare; fiecare cu tichetul lui dacă sesiunea principală desparte)
1. VPS `/root/lde-worker/sebn-parcare/` (copie în `lde-geo-worker/sebn-parcare/`): `sebn-parcare.mjs` (din vps/sebn-parcare.mjs, fără
   variantele de cercetare: poarta scoasă, bucla predării, R_CAPAT 1,5, §11.12, rute din GPS cu steag, Bălți 0,5 km la R23), `sebn-harta.mjs`,
   `publica-sebn-parcare.mjs` (probele lear-parcare-valid + ale hărții înaintea apelului), `lant.sh`. `sebn-liber.mjs --dump` (patch mic, ca
   patch-dump la ION-143; ieșirea fără --dump identică — probă md5 pe `date` înainte / după). Backup `.bak-ion147`.
2. Migrația 446 (pas-poartă: .sql în dereva, sesiunea principală compară): funcția de publicare admite și ('SEBN','SEBN') — ori
   `CREATE OR REPLACE lde_publica_lear_parcare` cu corpul 441 neschimbat + perechea nouă, ori funcție nouă `lde_publica_sebn_parcare`;
   `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`; fapt `kind=migration`.
3. Migrația 447 (după răspunsurile lui Ion): §13 «Parcarea propusă» la SEBN_ORHEI și SEBN_STRASENI prin `DO` + adăugare cu gardă pe md5-ul
   curent (b6ee5856…) și `ROW_COUNT = 2`, `reguli_livrare_la = now()`; plus ce decide Ion la §2.2 (weekend) — doar dacă o cere.
4. Panou: `UZINE_HARTA.sebn = { id: 'SEBN', nume: 'SEBN Orhei + Strășeni', lear: true, schelet: 'schelet-sebn.json', porti: [Orhei, Bucuria,
   Strășeni] }` (tipul trece de la `poarta` la `porti`, LEAR neschimbat ca date), `uzHarta` acceptă `sebn`, textul casetei fără «La uzină
   (regula 1)» la SEBN. Blocul «Parcarea propusă» în raportul SEBN doar dacă Ion îl vrea (întrebarea 7).
5. lear-saptamanal.sh: după `sebn-liber.mjs --write` → `sebn-parcare/lant.sh`, SEBN_PARCARE=0 îl sare; test în lear-saptamanal.test.sh;
   durata măsurată de mână (azi: dump 21.09 ~1 min, parcarea ~2 min la prima rulare, câteva secunde cu cache-ul Valhalla cald).
   Livrare pe VPS nu luni 07:30–09:30.
6. Publicarea 21.09 și 28.09 (săptămâna încheiată), control pe toată flota, memoria proiectului.

## Fișiere
- Cercetare (acum): docs/plans/2026-09-30-sebn-parcare/{README.md, vps/*.mjs, rulari/*}; VPS /root/lde-worker/sebn-parcare/cercetare/.
- Execuție: lde-geo-worker/sebn-parcare/*, lde-geo-worker/sebn-liber.mjs (doar `--dump`), lde-geo-worker/lear-saptamanal.sh (+ .test.sh),
  packages/db/migrations/446_*.sql, 447_*.sql, apps/admin/src/lib/lde/drax-harta.ts, app/(dashboard)/lde/harta/{page.tsx, HartaClient.tsx}.
- NU se ating: Drăxlmaier, LEAR Ungheni / Florești (date, lanțuri, lear-parcare/*), scheletele, lear-timp-liber.mjs, lde-timp-liber,
  sebn-optimizari (posterul), cron-urile.

## Riscuri
1. **date.parcare pierdut**: sebn-liber.mjs --write rescrie `date` → lanțul cheamă parcarea imediat după; rularea de mână = `--dump` + lant.sh.
2. **Publicarea > 2,5 MB / 8 s**: harta SEBN are ~2× rândurile LEAR Ungheni. Măsurat la execuție; dacă trece plafonul — simplificarea urmei la
   25 m sau publicarea pe zile, NU ridicarea orbească a plafonului. Critic pentru atomicitate (Codex r1 C1 la ION-143).
3. **Schimbarea tipului UZINE_HARTA (`poarta` → `porti`)** atinge pagina comună cu LEAR/Drăxlmaier: tsc + vitest src/lib/lde + curl pe
   ?uz=ungheni / floresti / drax înainte și după.
4. **552BRAO domină** (43–57 % din flotă): propunerea «doarme la Vatici» e ce spune deja §4.7 ca livrare; dacă șoferul trebuie dus cu altă
   mașină, la SEBN acei km se numără (§5.4) și economia scade — cifra e «maximul pe urmă», nu net (întrebarea 4).
5. **Retururi pierdute** (punctul 6): golul pornit de la poartă poate conține un retur cu oameni; nu umflă propunerea (trece tot prin capăt),
   dar harta ar arăta «gol» unde erau oameni. Control nou propus: |tur − retur| > 2 pe săptămână = steag pe mașină.
6. **Rute din GPS**: pragul de 3 zile pe capăt poate lua un capăt «de trecere» (Lupoaica / Șușleni pe drumul lui 522BRAT, Domulgeni pe al lui
   430CMX). Se aplică DOAR când ruta din schelet nu e trecută ≥ 3 zile; azi: 034BRAT și 725YOZ.

## Verificare (la execuție)
- /lde/harta?uz=sebn: cele 26 de mașini ale săptămânii 21.09, fiecare cu P1 și km/săpt. sau cu motivul (punctul 5); ?uz=ungheni / floresti /
  drax neschimbate (aceleași rânduri, curl înainte / după).
- Pe hartă, km pe intervale = km zilei (±5 %) pe toate mașini-zilele; nicio oprire în sat în drumurile de parcare (§10).
- Cifra de flotă 21.09 = 2.313,7 ± 0,5 (sau cea după răspunsurile lui Ion, cu diferența explicată); a doua rulare identică.
- Proba atomică (eșec injectat → starea publicată identică), durata RPC ≤ 4 s și cererea ≤ plafon.
- lear-saptamanal.test.sh trece; sebn-liber fără `--dump` scrie același `date` (md5).

## Întrebări pentru Ion (cu cifrele)
1. **Weekendul.** Regulile spun «lucrează toată săptămâna, inclusiv sâmbăta și duminica» (§2.2). GPS: luni–vineri ~8.100–8.800 km/zi,
   sâmbătă 2.215 km (doar returul de vineri noapte), duminică 266 km (o singură mașină); la fel pe 14–20.09. SEBN lucrează acum luni → vineri
   (plus returul de sâmbătă 06:00)? Corectăm §2.2 sau e temporar?
2. **Bucla de la predare.** La fiecare schimbare de tură autobuzul lasă oamenii la poartă, merge 3,7 km până în Slobozia Doamnei și înapoi,
   apoi așteaptă 15–75 min la Bucuria schimbul care iese: 94 de bucle, 1.177 km pe săptămână (21.09; 988 pe 14.09). Le scot din parcare
   (nu sunt drumuri de dormit). Dar de ce fac bucla — întoarcere obligatorie, parcarea interzisă la poartă? Dacă pot aștepta direct la Bucuria,
   sunt încă ~1.000 km/săpt. de tăiat, separat de parcare.
3. **Orașul Orhei ca loc de parcare.** «Mașina NU poate sta la uzină între ture» (§2.3): poarta o scot din candidați (nu schimbă cifra). Orașul
   Orhei (2–3 km de poartă) îl las candidat? Pe 14.09 iese la 042BRAU și 283BRAT (4 drumuri, 82 km); pe 21.09 la nimeni.
4. **552BRAO — 996 km/săpt. din 2.314.** Propunerea: mașina doarme la Vatici, nu la Chiperceni (golurile Vatici → Chiperceni → Vatici au 78–81 km
   fiecare, trei pe zi). Șoferul locuiește în Chiperceni: îl ducem cu altă mașină (atunci la SEBN km-ii aceia se numără, §5.4) sau propunerea e
   «șofer din Vatici»? Cum scriem pe hartă?
5. **Rutele din GPS.** 034BRAT face zilnic R3 Domulgeni (în schelet: 584BRAX, care acum face doar Pohoarna) → propunere P1 Domulgeni, 390 km/săpt.
   725YOZ face R12 Olișcani (în schelet: 284BRAT) → rămâne cum e. Iau ruta din GPS când cea din schelet nu mai e trecută (§1.1)? Și 893BRAX
   (Voroteț în schelet, dar trece pe la Nistreana, Peresecina, Chiperceni, Chișinău) și 522BRAT (Lopatna, 20 din 32 de curse fără capăt; casa Jora
   de Jos) — ce rute fac acum?
6. **Rutele ADM.** 152BRAZ (ADM Bălți) stă la poartă 08:30–17:40 (program de birou, §2.5) — pentru ADM a sta la uzină e firesc? Propun: rutele
   ADM (R8 Lupoaica, R23 Bălți) fără parcare propusă, doar harta. Azi 152BRAZ ar ieși «114,9 km, P1 Cișmea», din drumul de 109,5 km la Brînzenii
   Noi de pe 24.09, nu din livrare.
7. **Unde se arată.** La LEAR ai cerut «pagina hartă și LEAR» (fără poster). La SEBN: doar /lde/harta?uz=sebn, sau și un bloc în raportul
   /lde/reguli?uz=sebn? Posterul SEBN de luni rămâne pe livrarea din lde_route_run (552BRAO: 891 km livrare + 602 gol acasă) — cifre diferite
   de parcare (1.120 → 124); le punem alături, cu explicație, sau parcarea rămâne doar pe hartă?
8. **Naveta lui 820GXP.** 073BRAO îl duce pe șoferul lui 820GXP (Ocnița-Răzeși ↔ Vatici) 853 km pe săptămână (lde_naveta_sofer). Parcarea
   pe urma autobuzului n-o vede. O arătăm pe harta lui 820GXP ca «livrare cu altă mașină»?

## Ce e diferit față de LEAR (rezumat)
- Poarta nu e loc de parcare (§2.3 / §8.1); la LEAR e chiar regula 1.
- Trei goluri pe zi (trei schimburi, aceeași mașină), nu două; toate < 12 h.
- Predarea la poartă are o buclă de 3,7 km prin Slobozia Doamnei — la LEAR pragul «nu iese la > 2 km» ajungea.
- Două porți, un singur rând «SEBN»; ADM pe program de birou; capătul R23 lângă Parcul Bălți.
- Naveta cu altă mașină se numără (§5.4); la LEAR nu (§5.5).
- Mașinile se schimbă pe rută (Ion 24.09): rutele se iau și din GPS; la LEAR lista rută-pe-mașină e confirmată de Ion (23.09).
- §11.12 «pe ruta ei, fără poartă = muncă» — doar la SEBN.
- Weekendul din reguli (toată săptămâna) nu se potrivește cu GPS (luni–vineri).
