# Drăxlmaier — dezbaterea Claude + Codex, runda 3: mașinile care dorm în Bălți (ION-109, 27.09.2026)

Scheletul e închis (ION-110, ideal-v4.1 activ, c6e609c6). Runda 3 privește subiectul C din rundele 1–2, cu decizia lui Ion.

## Decizia lui Ion (27.09, răspunsul la întrebarea c2)
«Mașina care doarme la Bălți, fie la uzină, fie lângă uzină la om acasă — trebuie de analizat livrările tot.»
Deci c2 = NU: casa ≤ 3 km de poartă și noaptea la parc/uzină NU scutesc livrarea.

## Ce s-a implementat (corecturile acceptate în triaj-r2 + decizia lui Ion)
1. **Migrația 413** (`packages/db/migrations/413_lde_drax_livrare_balti.sql`, NEAPLICATĂ; gard 25.072 / 62eace0d → 26.070 / 518f41a0):
   §5.3 (a) — după o noapte în Bălți (parc, uzină, acasă ≤ 3 km de porți sau de parc) NU există gol impus; §7.4 rescris (noaptea în Bălți nu
   scutește livrarea, citatul lui Ion); §8.6 — ziua cu o cursă probabil nedetectată în livrare iese ÎNTREAGĂ (criteriul cu trei condiții);
   §12.1 — blocul «dorm în Bălți» separat de indicații, doar km, nu intră în mesajul pentru dispecer.
2. **Worker** (copie izolată VPS `/root/lde-worker/drax/cod-ion109/`, NU în producție; diff: `vps/worker.diff`):
   - `categorii.mjs`: `noapteZona` = locul nopții la ≤ 3 km de porți sau de parc → marginea zilei fără gol impus (§5.3 a nou);
   - `categorii.mjs`: `cursaNedetectata` pe bucățile «livrare»: atingerea porții (poarta(p, 0,3)) la ≥ 5 min de marginile bucății, ora într-o
     fereastră (§3.2) și sensul în ± 60 min: TUR = venea de la ≥ 5 km (porți + parc) în ultima oră și nu pleacă iar ≥ 5 km în 10 min;
     RETUR = pleacă la ≥ 5 km în următoarea oră și n-a venit de la ≥ 5 km în ultimele 30 min;
   - `alternative.mjs:exclusDe`: ziua cu `cursaNedetectata` iese întreagă («cursa probabil nedetectata la poarta (tur 06:04…)»).
3. **Pagina** (`apps/admin/src/lib/lde/drax-balti.ts` + test, `lde/reguli/DormBalti.tsx`, montat în `RaportDrax.tsx` după «Ce faci»):
   bloc «Dorm în Bălți · livrarea de analizat», mașinile cu `casaKmPoarta` ≤ 3 cu R1a > 0 sau cu zile nevăzute; o frază pe mașină, doar km.

## Simularea săptămânii 14.09 (copie `/tmp/p109-sim`, fără scriere în bază), față de rândul actual
| mașina | casa | R1a/săpt. | zile măsurate | cursă nevăzută |
|---|---|---|---|---|
| 744ARF | Dacia 2,4 km | 299 → — | 3 → 0 | tur ~06:04 în 5/5 zile (R13 Hăsnășenii Noi, fără etalon) |
| 804MUM | Pământeni 2,7 km | — | 0 | retur ~23:35 în 5/5 zile (spre Țiplești) + tur 06:17 pe 16.09 |
| 144BRAZ | Dacia 1,5 km | 321,8 | 2 | retur 00:03 / 00:05 pe 17–18.09 (zile deja excluse) |
| celelalte 35 | — | neschimbat | neschimbat | 0 |
Flota: B 8.777 → 8.478 km (−299 = 744ARF), R1b+R3 neschimbat. Alarmele false din runda 2 nu mai apar: 024XKY (coada turului detectat),
744ARF seara (trece pe la poartă spre casă), 804MUM 16:5x (SOSEȘTE din satele R22 la 16:54, iar prima versiune a detectorului îl lua drept
«retur» doar după fereastră — reparat cu sensul în ± 60 min). Gol impus scos: 53 de margini cu noaptea în zonă; km se schimbă doar la
744ARF (17,3 km/drum) — la 435ASB, 186OMM golul impus era deja 0.

Textul blocului pe 14.09 (din funcție): «435ASB doarme la Autogara (1,7 km de poartă), linia R34 · Taura Veche: drumul gol până la capăt și
înapoi ≈ 366 km pe săptămână.» · «744ARF doarme la Dacia (2,4 km de poartă). În 5 zile din 5 face o cursă cu oameni pe care analiza n-o vede
(tur pe la 06:04, …): linia ei nu e încă în schelet, deci livrarea se măsoară abia după ce cursa se lămurește.»

## Întrebări pentru părți
(1) Detectorul e corect pe toată flota (fără alarme false, fără curse reale ratate)? (2) Migrația 413 transcrie corect decizia lui Ion și
criteriul? (3) Blocul respectă §12.1 (nu e indicație) și §10.3 (nemăsuratele)? (4) Ce lipsește înainte de aplicare (ordinea: migrația, apoi
codul VPS, apoi rândul 14.09 rescris, apoi push)? Scor după rubrica comună; high doar cu scenariu + dovadă.
