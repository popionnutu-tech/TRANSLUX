# Drăxlmaier ideal-v4 — dezbaterea Claude + Codex, runda 1 (ION-110, 27.09.2026)

Cerința lui Ion: scheletul ideal al uzinei hotărât prin dezbatere Claude + Codex (3 runde), apoi comparat cu scheletul activ
**ideal-v3.1** («al meu»): ce e greșit în v3.1 și care e mai bun, linie cu linie. Km = km reali GPS, nu geometrie (Ion, 26.09).

**Regula verdictului** (ca la ideal-v3, `docs/plans/2026-09-27-drax-ideal-v3/verdict-v3.md`): se aplică ce susțin AMBELE părți
sau ce hotărăsc datele; unde pozițiile diferă și cifrele nu decid, rămâne v3.1 + steag «diagnostic cerut».

## Unde sunt datele (VPS root@217.26.149.23, cheie ~/.ssh/tlx_mev_proxy_ed25519)
- v3.1 activ: `/root/lde-worker/drax/date/ideal-v3.1/` (cod `/root/lde-worker/drax/cod/ideal-v3.1/`), sha schelet 8b400214…
- candidatul v4: `/root/lde-worker/drax/date/ideal-v4/` (cod `/root/lde-worker/drax/cod/ideal-v4/`); singura diferență de cod:
  `etalon.mjs:17,47` citește `date/ideal-v4/capete-gps.json` și ia capătul liniei din el, altfel din act.
- săptămânile analizate: `/root/lde-worker/drax/date/saptamanal/2026-09-14/` (urme brute `economie-urme/<mașină>/<zi>.json`,
  `economie-zile.json`) și `/root/lde-worker/drax/date/saptamanal/_ciorna/2026-09-07-ion107/`.
- scripturile de control de azi: `/tmp/p109-capete.mjs <dosar săptămână>` (opriri scurte), `/tmp/p110-cf.mjs` (satele atinse în
  ordine pe toată fereastra, din `curse-ideal.json` + `obs-ideal.json`), `/tmp/p110-cmp.mjs` (v3.1 vs v4 pe linie).
- regulile: Supabase `lde_uzine.reguli_livrare` id `DRAXELMAIER_BALTI` (24.334 car., md5 810297f3…).
- verificatorul: `/home/verif/verificator/` (agentul schelet-verificator).

## Ce s-a schimbat în v4 față de v3.1 (lanțul complet rulat, 45 s)

| linie | v3.1 | v4 |
|---|---|---|
| R28 Cuhnești | capăt Cuhnești, 65,5 km × 1 | capăt **Balatina**, 75,0 km × 1 |
| R37 Musteața | capăt Musteața, 43,5 km × 1 | capăt **Năvîrneț**, 60,2 km × 1 |
| R37 Rediul de Jos* | — | linie GPS nouă, fără ideal (351KAJ) |
| flota (card GPS) | 5.819 km/zi | 5.872 km/zi |

Nicio altă linie nu se schimbă (comparat pe toate cele 48 de linii cu ideal).

## Subiectul (a) — capătul liniei: din act sau din GPS

Defectul găsit în v3.1: capătul = satul de start al liniei din act (`etalon.mjs:45-47`, `kk(l.start)`), nu locul unde cursa
reală începe turul / termină returul. Exemplul lui Ion: 925FTI, 14.09 seara «Musteața → acasă (Sărata Veche), gol, 42 km»; Google
19 km; GPS: după Musteața (00:48) opriri scurte la Rediul de Jos / Năvîrneț (01:13), abia apoi acasă. După-amiaza cursa începe la
Năvîrneț (13:25, 4–9 min așteptare), ia oameni la Albinețul Vechi, Rediul de Jos, Musteața.

Două probe independente:
- **P1 opriri** (`p109-capete.mjs`): opriri < 15 min cu viteză ≤ 12 km/h, în satele din numele rutei, dincolo de capăt, în ora
  dinaintea turului / de după retur, la > 1,5 km de urma cursei însăși. Săptămânile 07.09 și 14.09.
- **P2 sate în ordine** (`p110-cf.mjs`): pe toată fereastra scheletului, satele rutei atinse pe drumul casă ↔ poartă DINCOLO
  de capăt (la tur înainte, la retur după) și neatinse de cursă. Vede și drumul de acasă fără oprire → poate da alarme false.

| linie | P1 14.09 (tur / retur) | P1 07.09 (tur / retur) | P2 fereastra (tur / retur) | în v4 |
|---|---|---|---|---|
| R37 Musteața → Năvîrneț | 4/4, 5/5 | 3/4, 3/3 | 96 %, 97 % (Albinețul Vechi) | mutat |
| R28 Cuhnești → Balatina | 5/5, 4/5 | 3/4, 5/5 | 100 %, 100 % | mutat |
| R32 Trifănești | Izvoare 11/16, 4/17 | 10/14, 6/18 | 95 %, 100 % (Bezeni, Izvoare) | neschimbat |
| R2 Stolniceni | 0/5*, Cupcini 2/5 | Chiurt 3/4, 1/5 | Cupcini 100 %, 100 % | neschimbat |
| R26 Ilenuța | Pînzăreni 2/5, 1/5 | 2/5, — | 47 %, 100 % | neschimbat |
| R18 Zarojeni | — | — | —, Gura Căinarului 98 % | neschimbat |
| R27 Danu | — | Sturzovca 2/3, 2/3 | 78 %, 76 % | neschimbat |
| R3 Nihoreni | Rîșcani 4/10, — | — | 29 %, Rîșcani 68 % | neschimbat |
| R19 Bilicenii Vechi | Sîngerei 4/10, 4/8 | 5/7, 5/10 | 32 %, Sîngerei 58 % | neschimbat |
| R21 Alexăndreni* | — | — | Grigorești 99 %, 100 % | neschimbat |
| R22 Țipletești* | — | — | Heciul Vechi 100 %, 100 % | neschimbat |
| R7 Slobozia* | —, Ușurei 5/6 | —, 4/5 | — | neschimbat |

(* la R2 pe 14.09 opririle de la Chiurt au căzut la filtrul «urma cursei».)

Întrebări: (a1) e corectă regula «capăt din GPS doar cu ≥ 50 % pe ambele sensuri, în ambele săptămâni, pe opriri (P1)», cu P2 doar
ca sprijin? (a2) ce se face cu liniile unde P2 dă ~100 % dar P1 nu (R2 Cupcini, R21, R22, R18)? (a3) R32: tur prin Izvoare/Bezeni,
retur mai rar — asimetrie reală (alt sat la dus) sau drumul de acasă? (a4) R37 «Rediul de Jos*» nou, fără ideal: se păstrează ca
linie GPS sau cursele intră în R37|Musteata?

## Subiectul (b) — dezacordurile rămase din v3 (verdict-v3.md) și cele 6 linii cu steag
Zarojeni 28,9 (Claude 30,0 / Codex 28,9; D/EZ 53,3 / 25,6), Bocancea Schit 54,5 (Claude 46,2 / Codex 54,5; drum lung prin
Bilicenii Vechi 8/9 retururi de noapte), Sturzovca 24,9 × 3 (bucla 727CWN 93 km/tură), Nihoreni 44,2 (Claude 42,3 / Codex 44,2;
D +12 km încărcați), R16 Florești 35,7 × 2 (518MHD real 52,9 km prin satele R32; Ion 27.09: «nu cunosc»). Steag «diagnostic cerut» pe
Nihoreni, Florești, Zarojeni, Sturzovca, Trifănești, Bocancea Schit. Întrebare: se poate decide acum vreunul pe date noi (P1/P2 de
mai sus, cele 2 săptămâni cu urme brute), sau rămâne v3.1 + steag?

## Subiectul (c) — mașinile care dorm în Bălți
435ASB (Autogara, R34 Tăura Veche s2), 144BRAZ (Dacia, R38 Glinjeni s2), 744ARF (Dacia, R19 Bilicenii Vechi s2), 186OMM (Dacia,
R4 Grinăuți s1 + R3 Nihoreni s2), 804MUM (Pământeni, R18 + R22): casa ≤ 3 km de poartă; golul lor e R1a (casă ↔ capăt dimineața și
noaptea), ≈ 1.270 km/săpt. măsurat + ≈ 500 la 804MUM. §12.1 scoate R1a din «Ce faci» («se taie doar cu alt șofer din satul de start»),
deci 435ASB și 744ARF nu apar nicăieri pe pagină. Codul: `apps/admin/src/lib/lde/drax-ce-faci.ts:78,117-121,194`; worker
`/root/lde-worker/drax/cod/economie/alternative.mjs:124,130`. Asimetrie: noaptea la Parcul Bălți face drumul parc ↔ capăt «gol pe rută»
(§5.3 a, §7.4), noaptea la 1,5–2,4 km de poartă face același drum R1a.
Întrebări: (c1) R1a intră în «Ce faci» ca grupă separată «Doarme în Bălți, departe de capăt», doar în km (autobuzul nu mai face /
mașina mică face), fără lei — adică §12.1 se schimbă printr-o migrație? (c2) casa ≤ 3 km de poartă = «lângă uzină», ca parcul?

## Subiectul (d) — rulajul prin oraș trecut la R1a
744ARF: noaptea 7,5 km (Bilicenii Vechi → Dacia), dar «dimineața» 03:00–14:07 38–79 km — ≈ 260 km/săpt. rulaj prin oraș peste zi,
trecut la R1a (`alternative.mjs:124`). 804MUM 16.09: 97,6 km dimineața față de 22,7 în zilele obișnuite. Întrebare: (d1) regula
«dimineața > 1,3 × drumul capăt → casă ⇒ diferența la de lămurit» e corectă?

## Ce se cere fiecărei părți
Scor după rubrica comună (10 − Σ deduceri; high/critical doar cu scenariu de eșec și dovadă fișier:linie sau cifră măsurată).
Pe fiecare subiect: poziția (DA / NU / steag), dovada, și ce ar trebui schimbat în v4 înainte de runda 2.
