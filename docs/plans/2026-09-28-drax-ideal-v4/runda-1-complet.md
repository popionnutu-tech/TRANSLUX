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


## Între timp (27.09 15:00 UTC): Ion a cerut «fă schimbarea» — migrația 412 aplicată: §4.1 excepția «capătul din GPS» (R37 → Năvîrneț, R28 → Balatina), §4.7 fără Balatina și Năvîrneț (text 25.072 / md5 62eace0d). Fișierul: packages/db/migrations/412_lde_drax_capat_din_gps.sql (în acest arbore).

## Răspunsurile părții Claude (runda 1) — scoruri: business 1,5 · uzina-analist 3,0 · schelet-verificator 6,0 (v7) → Claude = 1,5



---
### r1-business.md

# ION-110 ideal-v4, runda 1: partea Claude (logica de business)

Autor: business-logic-auditor, 27.09.2026. Nu am scris nimic în bază și n-am schimbat nimic pe VPS. Scripturile mele sunt în
`scratchpad/p110/bl-*.mjs`, rulate pe VPS ca `/tmp/p110b-*.mjs`; ieșirile sunt în `scratchpad/p110/bl-o-*.txt` și `out-raw1.txt`.
Reguli: `lde_uzine.reguli_livrare` DRAXELMAIER_BALTI, 24.334 de caractere, md5 810297f3… (am verificat că e textul din bază).

Metoda. Opririle le-am citit pe urma brută din săptămânile 07.09 și 14.09 (`economie-urme`), cu o definiție mai strictă decât P1:
- o înregistrare `stat`;
- sau un punct cu v ≤ 7;
- sau o pauză de ≥ 15 s între două puncte cu v ≤ 25 și deplasare < 120 m (trackerul nu scrie puncte cât autobuzul stă pe loc).

Pe fiecare oprire am pus distanța până la locul nopții (dN). Am adăugat atingerea capătului pe toată fereastra (`curse-ideal.json`,
`apr.d ≤ 1,2 km`), mașină cu mașină și lună cu lună.

---

## Subiectul (a): capătul din GPS

### Ce arată urma brută pe liniile cerute

| linie | fapt măsurat | locul nopții / casa | concluzie |
|---|---|---|---|
| **R37 Musteața** | 925FTI, tur s2 14.09–17.09: stă **7–9 min la Năvîrneț** (13:17–13:25), apoi oprește scurt la Albinețul Vechi (7 s), Rediul de Jos (21–29 s) și Musteața. Retur: Musteața (00:52) → Rediul de Jos (32 s) → Năvîrneț (22–62 s, 01:10–01:14) → acasă (01:39). 07.09, s1: la fel (Năvîrneț 24–130 s). Punctul Năvîrneț e atins pe 7/8 tururi și 8/8 retururi în cele 2 săptămâni. Pe toată fereastra: **351KAJ, mai–iulie, Năvîrneț ≤ 1,2 km pe 49/50 de tururi și 48/48 de retururi**; 925FTI pe 17/17 și 18/18 în septembrie | 925FTI: casa lângă Sărata Veche. Năvîrneț e la 17,4 km de casă, Musteața la 8,0 km, deci Năvîrneț e un **ocol, nu drumul spre casă** | **DA, capătul e Năvîrneț**. Oameni la Rediul de Jos, Albinețul Vechi și Năvîrneț, pe ambele sensuri, la două mașini diferite, pe toată fereastra |
| **R28 Cuhnești** | 760BXI, pe tur și pe retur: la Balatina iese din drum spre nord până la 47,708 / 27,329, stă (v0 13:22 pe 15.09; v4/v9 01:31 pe 16.09) și se întoarce. Punctul e atins **8/9 tururi și 8/10 retururi** (07.09 + 14.09). Pe fereastră, Balatina ≤ 1,2 km: 760BXI 60/60 tururi și 63/63 retururi; **alte mașini: 351KAJ 9/9, 710CWN 6/6, 727CWN 1/1** | 760BXI doarme la Hîjdieni. Balatina (11,3 km de casă) e pe drumul spre Cuhnești (13,3 km), **dar ramura de ~2,5 km spre nord, cu întoarcere, nu e** | **DA, capătul e Balatina**. Dovada e ramura cu întoarcere, nu oprirea, plus trei mașini diferite |
| **R32 Trifănești** | 146BRAZ doarme la **Scăieni**, la 0,2–0,8 km de Izvoare și Bezeni. Opririle «Izvoare» de după retur sunt la dN 0,2 și sunt urmate imediat de staționarea de acasă. P2 dă «Bezeni» la 146BRAZ pe 186/189 de curse, adică **drumul de acasă**. 518MHD doarme **în Izvoare** (dN 0,0), iar P2 dă «Izvoare» pe 100 %. Singurul tipar de îmbarcare: 146BRAZ, tur s1 07–11.09, opriri de 15–65 s care avansează prin Izvoare (dN 0,3 → 1,4), apoi Alexandrovca (15 s – 8 min), apoi Trifănești | ambele mașini au casa în satele «dincolo de capăt» | **NU se mută capătul**. Prelungirea e drumul casă ↔ capăt, 4–5 km. Vecinii care urcă lângă casă nu se pot despărți de drumul de acasă cu GPS (§7.3: «oprirea acasă nu e eroare»). Steagul rămâne, cu motivul nou |
| **R2 Stolniceni** | 549RNK, tur: 4–6 opriri la Chiurt (30 s – 6 min, dN 12,6 → 13,9) **înainte** de Stolniceni (dN 15,6); pe retur, Chiurt e în cursă (Brătușeni → Chiurt → Stolniceni). «Cupcini» din P2: oprire de 0–29 s la dN 9,4, pe drumul spre Edineț | 549RNK doarme la **Edineț**. Cupcini e pe drumul spre casă și e **oraș în lista §5.1** (opririle din el nu sunt sate) | **NU**. Chiurt e pe același drum, înainte de capăt, deci nu e o prelungire (filtrul «urma cursei» din P1 a avut dreptate). Cupcini e o alarmă falsă după §5.1 |
| **R26 Ilenuța** | 925FTI, tur: îmbarcare la Pînzăreni (15 s – 6 min, 10–12 opriri), apoi Ilenuța, apoi poarta. Retur: Ilenuța → Pînzăreni → acasă. Pînzăreni e la dN 14,7, Ilenuța la 16,0. **Tăietura cursei nu e stabilă**: 14–16.09 turul începe înainte de Pînzăreni (38,2 km), 17–18.09 începe la Ilenuța (30,1 / 31,5 km), retur 16.09 31,4 km | casa lângă Sărata Veche; Pînzăreni e pe drumul casă → Ilenuța, dar opririle sunt de îmbarcare | **NU se mută capătul**: etalonul de 38,8 km conține deja bucla Pînzăreni (zilele bune au 38 km). Defectul e în tăietura săptămânală: în zilele de 30 km, bucla cu oameni (~8 km) cade la livrare/R1a. Vezi **M4** |

### (a1) Regula «≥ 50 % pe ambele sensuri, în ambele săptămâni, pe P1; P2 doar sprijin»: **NU, așa cum e scrisă**

1. P1 (`/tmp/p109-capete.mjs:15-16`) socotește oprire orice ≥ 5 s cu v ≤ 12. §4.5 cere < 8 km/h și ≥ 20 s sub 15 km/h, pe o rază de
   0,8 km. Pragul lui P1 prinde și încetinirile la intersecții.
2. Nici P1, nici P2 nu scot **drumul de acasă**. P2 a dat ~100 % pe R32 (casa în Scăieni / Izvoare), pe R21 Grigorești (715IZX doarme
   la 0,2 km) și pe R2 Cupcini (drumul spre Edineț). P1 a numărat «Izvoare» de după retur, care e sosirea acasă.
3. Nu exclude orașele din §5.1 (Cupcini, Rîșcani, Sîngerei). Asta scoate pe loc R2 Cupcini, R3 Rîșcani 68 % și R19 Sîngerei 58 %.

Regula propusă pentru v4 (capete-gps.json și migrația §4):

> Capătul liniei = satul rutei cel mai depărtat de poartă pe drum, unde cursa (a) are opriri după §4.5, pe ambele sensuri, în ≥ 50 % din
> curse, pe toată fereastra scheletului; (b) **nu stă pe drumul direct între locul nopții și capătul din act** (ocol > 2 km pe șosea
> sau satul e mai departe de casă decât capătul din act), altfel e nevoie de o ramură cu întoarcere ca la Balatina; (c) e confirmat de
> ≥ 2 mașini sau de mașina din grafic pe ≥ 2 luni; (d) nu e un oraș din §5.1 și nu e la ≤ 3 km de porți. Altfel rămâne capătul din act
> și linia primește steag.

R37 trece de toate patru. R28 trece pe (b) doar prin ramura cu întoarcere și trece pe (c) prin 351KAJ și 710CWN.

### (a2) P2 ~100 %, dar P1 nu: **NU se mută nimic**

- R2 Cupcini: oraș din §5.1 și drumul spre Edineț.
- R21 Grigorești: casa lui 715IZX (dN 0,2). Pe toată fereastra, 715IZX **0/284** prelungiri pe linia R21|Heciul Nou, deci Heciul Nou e
  capătul real (acolo se întoarce).
- R22 Țipletești\*/Heciul Vechi\*: linii «\*» ale lui 412BRAY, fără etalon, deci fără efect în km.
- R18 Zarojeni: **steag**. Pe fereastră, 348KAJ trece de capăt spre Gura Căinarului pe **50/51 de retururi**, dar doar pe **8/36 de
  tururi** (cf2). O asemenea asimetrie arată de obicei drumul spre casă. Casa lui 348KAJ nu e măsurată: nu e în flota săptămânilor
  37–38. Înainte de runda 2 trebuie măsurată casa (§7.1) lui 348KAJ și 412BRAY pe fereastră.

### (a3) R32: **drumul de acasă**, nu asimetrie de serviciu

Dovezile sunt în tabel (Scăieni / Izvoare = locul nopții). Capătul rămâne cel din act. Motivul steagului se schimbă în «prelungirea =
drumul casă ↔ capăt (4–5 km); dacă urcă oameni din Izvoare nu se poate hotărî din GPS; întrebare pentru dispecer».

### (a4) R37 «Rediul de Jos\*»: **se comasează în R37|Musteata**

Linia nouă vine dintr-o singură cursă a lui 351KAJ, pe 05.05. Cursa atinge **startul din act** (Musteața la 0,04 km, Albinețul Vechi
la 0,12 km), dar nu atinge Năvîrneț. În v4, `etalon.mjs:47` înlocuiește startul din act cu capătul GPS, iar §4.6
(`etalon.mjs:91-94`) face din cursă o linie «\*». Asta contrazice §4.2: capătul e atins dacă cursa trece prin startul liniei.

Reparația: identitatea liniei = startul din act **sau** capătul GPS. Km-ii și tăietura se iau din capătul GPS doar când e atins. În
rest cursa rămâne pe linie, e «scurtă» și nu intră printre zilele bune. Vezi **M2**.

---

## Subiectul (b): dezacordurile din v3 și cele 6 steaguri

**Poziția: nimic nu se decide acum. Rămâne v3.1 plus steag**, cu două motive puse la zi:

- **Trifănești**: P1/P2 nu adaugă nimic despre serviciu. Prelungirile sunt drumurile de acasă (a3). Rămâne 40,2 × 2, pe perechile
  146BRAZ.
- **R16 Florești**: 518MHD **doarme în Izvoare**, sat al R32 (dN 0,0 în ambele săptămâni). Drumul lui de 52,9 km «prin satele R32»
  pornește deci de acasă. Nu se vede nicio oprire dincolo de capăt. Steagul rămâne, dar întrebarea devine «cursele R16 ale lui 518MHD
  pornesc din Izvoare, deci satele R32 sunt drumul de acasă?».

  O neconcordanță de reparat: în analiza săptămânală, `etichete.mjs` pune cursele lui 518MHD pe **R32|Trifanesti** (52,7 km, ambele
  săptămâni). Verdictul v3 (`decizii-v3.json`) le exclude de pe R32 pe baza graficului R16. Vezi **L2**.
- **Zarojeni**: faptul nou este retur → Gura Căinarului 50/51 față de tur 8/36. Poate fi cheia pentru D 53,3 / EZ 25,6, dar fără casa
  lui 348KAJ nu se poate hotărî.
- **Nihoreni (R3), Bocancea Schit (R19)**: semnalele P1/P2 sunt Rîșcani și Sîngerei, amândouă orașe din §5.1, deci nu sunt dovezi.
- **Sturzovca (R27)**: Sturzovca e ea însăși startul unei linii R27. După §4.2 («cel mai depărtat start al rutei atins») semnalul P2 ține
  de etichetare, nu de capăt. Nu decide nimic.

**R7 Slobozia\*** (steag din tabelul (a)): e un **artefact de tăiere**, nu un capăt.
- 386PKP face, pe fiecare retur s2, un «retur» de 4 km «Slobozia → Slobozia» (00:05–00:18), apoi returul real spre Ușurei (00:16–01:04).
- Slobozia e un cartier al Bălțiului, la ≤ 3 km de porți: după §5.1 nu e sat. Totuși linia R7|Slobozia\* are 48 de zile în schelet.
- Cei «5/6 retururi spre Ușurei» sunt același retur, numărat de două ori. Vezi **M4**.

---

## Subiectul (c): mașinile care dorm în Bălți

Fapt măsurat pe 14.09 (`seg-out.txt`, `r1a-out.txt`): §5.3 (a) se aplică **neuniform** mașinilor cu casa în Bălți.
- 435ASB (casa la 1,7 km de poartă) are `golImpus = 0` în fiecare dimineață și în fiecare seară: 34,8–39,2 km, toți la R1a.
- 744ARF (casa la 2,4 km de poartă) are `golImpus = 17,3` (= lungimea liniei) în fiecare zi.

Diferența vine din condiția «livrarea care **atinge poarta**» (`categorii.mjs:290-304`). Pentru o casă aflată la 1,5–2,4 km de poartă,
atingerea cercului de 0,6 km al porții e o întâmplare de traseu, nu un fapt de business. Parcul are ramura lui separată
(`categorii.mjs:295`, §7.4).

### (c2) Casa ≤ 3 km de poartă = «lângă uzină», ca parcul: **DA**

- Pentru consecvență: aceiași km fizici (zona uzinei ↔ capăt) trebuie să cadă într-o singură categorie, oricare ar fi locul nopții din
  zona uzinei.
- Zona de 3 km e deja zona uzinei în §5.4, §5.5 și §8.3; §7.4 e regula lui Ion pentru noaptea lângă uzină.
- Cum se aplică: locul nopții la ≤ 3 km de poarta EST, poarta VEST sau parc → drumul zonă ↔ capăt e gol impus până la lungimea liniei
  (ca la `categorii.mjs:295`), **fără** condiția «atinge poarta». Excesul peste lungimea liniei rămâne livrare.
- Efectul măsurat (Σ zile măsurate, 14.09): 435ASB R1a 292,5 → 0; 144BRAZ 128,7 → 7,3; 744ARF rămâne 179,4 (acolo e rulajul, subiectul d).

### (c1) R1a intră în «Ce faci» ca grupă separată, doar în km: **steag, decizia e a lui Ion**

- §12.1 spune textual că R1a «nu intră în indicații». O migrație care schimbă §12.1 nu se poate hotărî prin dezbatere. Trebuie un «da»
  explicit de la Ion.
- În favoarea schimbării: pe 27.09 (ION-108, «Km only is ok») Ion a primit deja o pârghie de tip R1a, mașina mică seara, doar în km.
- Dacă Ion spune da, grupa trebuie să cuprindă și nopțile la parc, nu doar Bălțiul: altfel asimetria din (c) se mută doar pe pagină.
- Dacă (c2) trece, R1a la Bălți scade aproape la zero, iar grupa ar arăta mai ales rulajul (d).
- Ordinea propusă: întâi (c2) și (d), apoi, pe cifrele noi, întrebarea (c1) către Ion.

---

## Subiectul (d): rulajul prin oraș trecut la R1a

### (d1) «Dimineața > 1,3 × drumul capăt → casă ⇒ diferența la de lămurit»: **DA pe principiu, NU pe forma cu 1,3**

- 744ARF: dimineața (03:00–14:07) are brut 55,7–96,1 km față de un drum direct de 22,5–23,8 km. Pe 14 și 16.09 are staționări de 15–114
  min la 0,0–0,7 km de poartă, la 06:20–06:55.
- 744ARF e una dintre mașinile cu curse de prânz și jumătăți nedetectate (§8.6: 4 din 19 zile). Rulajul poate fi o cursă nedetectată,
  deci ar fi greșit să ajungă la «liber» sau la brambura.

Forma corectă, aliniată cu §5.2 și §11.8:
1. Livrarea de dimineață începe la **ultima plecare de la locul nopții** (staționare ≥ 20 min la ≤ 0,5 km, aceeași definiție ca «pe
   acasă» din §5.2), nu la 03:00. Seara se termină la **prima sosire** la locul nopții.
2. Ce rămâne peste drumul direct pe șosea × **1,05** (toleranța din §5.2 și §8.3; 1,3 e un prag nou, fără temei în reguli) iese din
   R1a.
3. Ce iese din R1a, plus buclele de dinainte de ultima plecare, merg la **«de lămurit» (§11.8)**, nu la necunoscut: nu intră în regula B
   și nici în alarma §11, dar se văd pe pagină.
4. Se aplică pe toată flota și pe ambele margini ale zilei, nu doar la 744ARF și 804MUM.

---

## Constatări cu deducere

**H1 (high, −2): v4 contrazice §4.1 și §4.7 din reguli, iar planul n-are migrație pentru §4.**
- §4.1: «Capătul = Starting point-ul liniei din act… același sat la tur și la retur».
- §4.7: «Sate din act fără nicio oprire pe rută în GPS: … Balatina (R28), … Năvîrneț (R37). Rămân în act; **nu schimbă capătul**».
- v4 (`etalon.mjs:17,47`) face exact ce interzice §4.7. Planul (Pasul 4–5) prevede doar migrația 409 pentru §12.1.
- Cum se strică: v4 activat → /lde/reguli spune «capăt = act, Balatina/Năvîrneț fără opriri», iar /lde/schelet arată capetele
  Balatina/Năvîrneț. Orice agent care aplică «regulile lui Ion au prioritate» (uzina-analist, verificatorul) marchează v4 ca abatere sau
  îl întoarce la v3.1.
- De făcut: migrația pe §4.1, §4.6 și §4.7, cu regula din (a1), înainte de activare. Bloc DO cu gard de lungime și md5 pe textul
  810297f3…; §4.7 corectat cu faptul măsurat (opririle stăteau în afara tăieturii, nu lipseau).

**H2 (high, −2): capătul din etalon și cel din analiza săptămânală nu mai sunt aceleași.**
- `capete-gps.json` e citit **doar** de `cod/ideal-v4/etalon.mjs` (grep pe tot `drax/cod/`). Etichetatorul săptămânal
  `cod/economie/etichete.mjs:31` («aceeași logică ca scheletul ideal») folosește tot `kk(l.start)`, iar `:51` taie cursa la
  Musteața/Cuhnești. `categorii.mjs` primește în schimb `capatC` = Năvîrneț/Balatina din schelet.
- Cum se strică: `saptamanal.sh --write 2026-09-14` pe v4 lasă seara lui 925FTI «Musteața → acasă 42 km» la livrare. **Verificarea 5 din
  plan pică**, iar R1a lui 925FTI și 760BXI rămâne umflat cu ~33 și ~19 km pe zi, bucăți cu oameni.
- De făcut: `etichete.mjs` citește același `capete-gps.json` (din instantaneul săptămânii) cu aceeași regulă de identitate ca M2, plus
  un control în `control.mjs`: capătul din `economie-obs` = capătul din schelet, pe fiecare linie.

**M1 (medium, −1): drumul desenat al R28 n-a fost refăcut.**
- v4 R28: etalon 75,0 km, dar `drum` are **65,5 km** și începe la Cuhnești (47,65682 / 27,37762). Cele 622 de puncte și `sateDrum` sunt
  identice cu v3.1, deci Balatina lipsește. §6.4 («km-ul etalonului = drumul desenat ±5 %») pică cu −12,7 %.
- R37 a fost redesenat: 62,7 față de 60,2, în toleranță.
- Efectul: pagina arată un drum greșit, iar culoarul §5.3 (a) (≤ 1 km de schelet) pierde bucata Balatina–Cuhnești.
- De făcut: se redesenează R28 (dc.mjs / schelet.mjs) și se pune un control în lanț: ±5 % pe fiecare linie.

**M2 (medium, −1): §4.6 creează linia falsă R37 Rediul de Jos\*** (a4). Zilele bune R37 scad de la 8 la 6.
- De făcut: identitate = start din act ∪ capăt GPS (`etalon.mjs:47`, și la fel în `etichete.mjs:31`).

**M3 (medium, −1): regula scrisă în `capete-gps.json` («opriri scurte < 15 min… ≥ 50 %… ambele săptămâni») e cea din P1.**
- Nu scoate drumul de acasă și nici orașele din §5.1, iar oprirea e sub pragul §4.5.
- Dacă se aplică pe toată flota (Pasul 1 din plan), ar muta capătul la R32 și R21 pe drumuri de acasă (P2 ~100 %).
- De făcut: regula din (a1).

**L1 (low, −0,5): §5.3 (a) e aplicat neuniform la casele din Bălți** (435ASB gol impus 0 față de 744ARF 17,3), din cauza condiției
«atinge poarta». Asta strică cifrele R1a pe care se sprijină (c). Reparația e cea din (c2).

**L2 (low, −0,5): 518MHD e pe R32|Trifanesti în analiza săptămânală**, contra `decizii-v3.json` (graficul R16). Excluderea din verdictul v3
există doar în card-gps, nu și în etichetare.

**M4 → low (−0,5), în afara v4, dar schimbă cifrele pentru (c):**
- R26: tăietura turului sare între 30 și 38 km de la o zi la alta, iar bucla Pînzăreni cu oameni cade la livrare.
- R7: «Slobozia\*» e un retur fantomă de 4 km într-un cartier al Bălțiului (§5.1) și dublează returul s2 al lui 386PKP.

## Scor

10 − (2 + 2 + 1 + 1 + 1 + 0,5 + 0,5 + 0,5) = **1,5 / 10**

Direcția lui v4 e **corectă și bine dovedită** pe R37 și R28. Scorul mic vine din faptul că v4 nu se poate activa așa cum e: contrazice
regulile scrise (H1), analiza săptămânală n-ar vedea schimbarea (H2), iar desenul R28 e vechi (M1). Cu H1, H2, M1 și M2 închise, estimez
≥ 8,5.

## Ce trebuie schimbat în v4 înainte de runda 2
1. `etichete.mjs` (săptămânal) și `etalon.mjs` citesc același `capete-gps.json`, cu identitatea = start din act ∪ capăt GPS; R37
   «Rediul de Jos\*» dispare (H2, M2).
2. R28 redesenat de la Balatina, cu control ±5 % în lanț (M1).
3. `capete-gps.json`: regula din (a1). Sub ea, R37 și R28 rămân singurele linii mutate; R32, R2, R21, R26, R3, R19 rămân cu capătul din
   act. R18 Zarojeni primește steag până se măsoară casa lui 348KAJ (M3).
4. Textul migrației pentru §4.1, §4.6 și §4.7, pregătit și arătat lui Ion odată cu verdictul (H1).
5. Pentru (c)/(d), separat de activarea scheletului: gol impus uniform pe zona de 3 km (c2); livrarea tăiată la ultima plecare de acasă,
   cu excesul peste direct × 1,05 la «de lămurit» (d1); (c1) întrebarea pentru Ion.
6. Măsurat înainte de runda 2: casa lui 348KAJ și 412BRAY pe fereastră; tăietura R26 și R7 în `etichete.mjs` (fără reparație acum, doar
   lista zilelor afectate).


---
### r1-analist.md

# ideal-v4, runda 1 — uzina-analist («cercetează»), subiectele (c), (d) și precedentul pentru (a)

Autor: uzina-analist, 27.09.2026. Nu scrie în bază, nu schimbă cod/date pe VPS. Toate scripturile din fișier, în
`scratchpad/p110/` (copiate în `/tmp` pe VPS și rulate cu `node /tmp/x.mjs`): `an-seg.mjs` (bucățile zilei),
`an-r1a.mjs` (R1a brut vs drumul pe șosea casă ↔ capăt, Valhalla :8002 costing bus), `an-opriri.mjs` (opririle ≥ 90 s cu
numele locului din `places.geojsonseq`), `an-flota.mjs` (control pe TOATĂ flota), `an-r13.mjs` (mișcările brute).
Ieșirile: `seg-out.txt`, `r1a-out.txt`, `opr-out.txt`, `flota-out.txt` în același dosar.

Sursele de reguli (Supabase `lde_uzine.reguli_livrare`, citite 27.09):

| uzina | reguli_livrare_la | lungime | md5 |
|---|---|---|---|
| DRAXELMAIER_BALTI | 2026-09-27 05:51:44 UTC | 24.334 | 810297f3… (= documentul rundei) |
| LEAR_UNGHENI | 2026-09-25 08:51:04 UTC | 10.424 | 1d4d373b… |
| LEAR_FLORESTI | 2026-09-25 08:51:04 UTC | 7.924 | beee9cda… |
| SEBN_ORHEI (= SEBN_STRASENI) | 2026-09-26 14:35:58 UTC | 11.070 | b6ee5856… |
| TROX_BRICENI | 2026-09-25 20:42:12 UTC | 4.658 | 3fbeb241… |

Săptămâna măsurată: 14–18.09.2026 (L–V), `/root/lde-worker/drax/date/saptamanal/2026-09-14/` (`economie-zile.json`
rulat 27.09 13:59 UTC, `economie.json`, `economie-urme/<mașină>/<zi>.json`, `economie-curse.json`).

---

## 1. Cifrele pe mașină — ce e R1a de fapt

«Drum real» = cât din R1a brut încape în drumul pe șosea casă ↔ capătul cursei vecine × 1,05 (aceeași toleranță ca §5.2 și
§8.3). «Rest» = R1a brut − drumul real. Brut = R1a net + golul impus 5.3 (a) deja scăzut de worker.

| mașină | linii / schimb (GPS) | casa: km poartă / parc | zile măsurate | R1a net măsurat | drum real | rest | ce e restul |
|---|---|---|---|---|---|---|---|
| 435ASB | R34 Taura Veche s2 | 1,7 / 1,6 | 4/5 | **292,5** | 288,4 | **4,1 (1,4 %)** | opriri de 3–7 min la 0,7–1,3 km de poartă, 10:56–12:23 (în afara ferestrelor) |
| 186OMM | R4 Grinăuți s1 + R3 Nihoreni s2 | 1,7 / 2,4 | 5/5 | **281,7** | 270,2 | **11,5 (4,1 %)** | abateri de 1–3 km |
| 144BRAZ | R38 Glinjeni s2 | 1,5 / 2,2 | 2/5 (nemăsurată, < 3) | **128,7** | 119,1 | **9,6** | 14.09 10:43, 74 min la 0,8 km de poartă |
| 744ARF | R19 Bilicenii Vechi s2 **+ R13 Hăsnășenii Noi s1 nedetectată** | 2,4 / 3,2 | 3/5 | **179,4** | 39,7 net (143,5 brut − 103,8 gol impus) | **139,7 (78 % din R1a)** | turul s1 R13 și drumurile lui (mai jos) |
| 804MUM | R18 Putinești s1 + R22 Țiplești s2/retur s1 **+ retur s2 nedetectat** | 2,7 / 2,8 | 0/5 (nemăsurată) | 0 (toate zilele: 500,6 net, 650,4 brut) | 224,5 | **425,9** | returul s2 de la poartă spre Țiplești, în fiecare noapte (mai jos) |

Σ pe cele 4 mașini cu zile măsurate: R1a net **882,3 km** (documentul rundei scrie «≈ 1.270 măsurat»: 1.268 e
EXTRAPOLAREA pe 5 zile — 435ASB 365,6 + 144BRAZ 321,8 + 744ARF 299,0 + 186OMM 281,7; măsurat e 882,3).
Din brut 986,1: drum real casă ↔ capăt 821,2, rest 164,9 — din care 139,7 la 744ARF.

### 744ARF — «rulajul prin oraș» este turul s1 pe R13 Hăsnășenii Noi
`opr-out.txt` + `an-r13.mjs`, L–V 14–18.09:
- mișcarea brută de dimineață pleacă de acasă (Dacia) la 05:04–05:15 și se termină la poartă la **06:04–06:07 în 5 din 5 zile**,
  23,3–23,6 km de fiecare dată — sosire în fereastra **tur s1 03:30–07:00** (§3.2). Opririle ≥ 90 s pe drum: Dobrogea Veche
  05:34–05:36 (15, 16.09) și **Hăsnășenii Noi 05:41–05:47** (15, 17.09); la poartă VEST 06:17–06:21 (15, 17.09), parcul 06:29 (16.09).
  Pe 14 și 18.09 zilele sunt excluse (jumătate nedetectată), dar mișcarea e aceeași.
- 15:48–15:52 la poarta EST (fereastra **retur s1 15:00–17:45**) → acasă 16:35. Bucata stă în «gol între ture» al perechii R19
  și iese «nelămurit 14,2 km/zi, fără oprire ≥ 20 min» (`economie.json` `nelamuritLista`, 15–17.09).
- Linia `R13|Hasnasenii Noi` are `E: {s1: null, s2: null}` în `economie-zile.json` — e una din cele 3 linii fără etalon
  (§1.4: «n-au nicio cursă care să pornească din startul lor în GPS»). Fără etalon cursa nu se taie, deci cade în livrare.
  Pe 18.09 workerul a prins-o o dată («R13|Hasnasenii Noi retur s1», bucata legătură 14:36–15:54).

### 804MUM — seara «67 km livrare» conține returul s2
- Noaptea, 14–18.09, 5 din 5: pleacă de acasă (Pământeni) ~23:25 → poarta VEST 23:35–00:06 → poarta EST 00:17–00:20
  (fereastra **retur s2 23:00–01:45**) → Țiplești / Țipletești 00:53–00:58 → Elizaveta → acasă 01:37. Mișcarea brută
  00:2x–04:5x are 45,5–45,8 km în fiecare noapte. Workerul pune tot la «livrare de seară» (16:28 → 03:00, 67 km net + 21,4
  gol impus).
- 16.09 dimineața «97,6 km» = turul s1 (06:18 poarta EST) + parc 12:45–13:29 + turul s2 (14:58 poarta VEST) — două tururi
  nedetectate, nu rulaj.
- Linia `R18|Putinesti` are tot `E: null` (§1.4).

### Controlul pe TOATĂ flota (`an-flota.mjs`, `flota-out.txt`)
Bucăți R1a (livrare fără ocol) L–V: **354, 6.221 km**. Cu o oprire ≥ 1 min în raza unei porți într-o fereastră de tur/retur
(§3.2) — adică o cursă cu oameni probabil nedetectată înăuntrul «livrării»: **19 bucăți, 1.150 km (18,5 %)**, pe 7 mașini:
804MUM 432,4 (toate zile excluse), **024XKY 351,2 (zile măsurate**, 06:46–06:52 la poarta EST, tur s1; e deja la «de lămurit»
§11.8), 744ARF 236,6 (**78,0 pe zile măsurate**), 144BRAZ 108,7 (excluse), 414ASB 21,3, 727CWN 0, 830MUM 0.
Pe zilele măsurate: **429 km** R1a care conțin o atingere a porții în fereastră.

---

## 2. Precedentele de la celelalte uzine (citate textual, cu sursa)

**Mașina care doarme lângă uzină.**
- LEAR Ungheni, cod: `lde-geo-worker/lear-analiza.mjs:930-939` (`oreNoapteaLaPoarta`, ≤ 1,5 km, 17:00–05:00) și `:1003`, `:1150`:
  «doarme lângă poartă (≥ 8 h pe săptămână noaptea, la sub 1,5 km) — casa ei e uzina, regula 1 e deja aplicată». Se aplică
  doar ca rezervă, când urma nu dă altă casă; raza e 1,5 km, nu 3.
- LEAR Ungheni, cod: `/root/lde-worker/ungheni/cod/dorm.mjs:8-13`: «Dacă doarme la uzină: pleacă GOALĂ de la uzină la capăt…
  gol = 2 × distanța(uzină, capăt), pe fiecare schimb. Deci nu e o economie automată».
- LEAR Ungheni §5.2: «GOL PE RUTĂ: întoarcerea goală sat ↔ poartă. E a uzinei. Nu se optimizează.» §5.3: «GOL EVITABIL: casă →
  capăt … Se optimizează.» §7.1: «Poarta și parcul de la Bălți excluse» (din casă).
- SEBN §8.1: «Regulile LEAR "doarme la uzină" … NU se aplică: … dormitul la uzină ar adăuga un drum gol.» §5.3: «LIVRARE … de
  acasă până la satul de start și înapoi … ASTA e economia la SEBN — se taie cu un șofer din satul de start sau cu mașina care
  așteaptă între ture la capăt.» §7.1: «dacă șoferul locuiește la capăt, livrarea e ~0.» Fără excepție pentru casa aproape de
  poartă.
- Briceni/Trox §5.3 + §8: LIVRARE = de la locul nopții la prima cursă și înapoi; «R1. Livrarea … Singura economie numărată».
  Cod: `briceni/cod/livrare.mjs:14,120-127` — nicio excepție pentru casa lângă poartă (poarta Trox e în Briceni, șoferii
  din Briceni fac livrare ca oricare).
- Drăxlmaier însuși: §7.4 «Noaptea la Parcul Bălți … = doarme lângă uzină: drumul parc ↔ capăt e golul impus (5.3 a), nu
  livrare»; cod `drax/cod/economie/categorii.mjs:295`.

**Livrarea în mesajul pentru dispecer.**
- SEBN §12.6 (identic în textele LEAR): «primele 3 mașini cu livrare peste 40 km pe zi și întrebarea "șofer din satul de start,
  sau mașina așteaptă la capătul rutei între ture?"» — la SEBN livrarea (echivalentul R1a) INTRĂ în indicații.
- Drăxlmaier §12.1: «R1a, marginile zilei, e cost de azi (se taie doar cu alt șofer din satul de start) și nu intră în indicații».
- Ion, 27.09 (commit fcc9527b, ION-108): «No need to calculate small car costs, leave it to me. Km only is ok»; «dacă livrarea e
  masivă se merită seara să oferim la șofer mașina mică».

**Capătul (subiectul a).**
- LEAR Ungheni §4.2: «Capătul = PRIMUL sat al rutei din nomenclator (nu cel mai depărtat de poartă)»; §4.5 capete fixate de mână
  pe mașină unde regula nu-l prinde (6 cazuri).
- LEAR Florești §4.1 primul sat din denumire; §4.2 «Capăt fixat pe GPS: A2 → Cuhureștii de Sus … Cunicea are pasager ocazional
  (9 opriri în 100 de zile), nu e capăt» — GPS-ul a SCURTAT ruta.
- SEBN §4.2: «între satul din nume și cel dedus din opriri câștigă cel MAI DEPĂRTAT de poartă — startul real poate doar să
  lungească ruta».
- Briceni §4.1: «Capătul = satul cel mai depărtat în care mașina a oprit sau s-a întors; o simplă trecere nu face capăt.»
- Deci: peste tot actul e implicit, GPS-ul îl bate pe opriri. Nicăieri o simplă trecere (P2) nu face singură capăt.

---

## 3. Pozițiile

### (a) — doar precedentul cerut
Capătul la celelalte uzine: **din act, cu excepții din GPS pe opriri** (LEAR 4.2 + 4.5, Florești 4.2, SEBN 4.2), la Briceni doar
din GPS (4.1), iar «o simplă trecere nu face capăt» (Briceni 4.1). Se transpune: a1 = DA (P1 pe opriri decide, P2 doar sprijin —
exact Briceni 4.1); formularea SEBN 4.2 («startul real poate doar să lungească») acoperă R37 și R28. Nu se transpune fără Ion:
cazul Florești (GPS scurtează ruta) — la Drăxlmaier nu apare în v4. Două observații pentru (a):
- §4.7 din textul lui Ion numește Balatina (R28) și Năvîrneț (R37) «fără nicio oprire pe rută în GPS»; v4 le face capete. Planul
  (Pasul 5) nu spune că §4.1/§4.7 se schimbă prin `replace` — trebuie adăugat (migrație separată, gard md5).
- **R13 Hăsnășenii Noi și R18 Putinești** (§1.4 «fără nicio cursă din startul lor») au curse regulate în 14–18.09 (744ARF tur s1
  5/5, 804MUM retur s2 5/5, mai sus). Întrebare pentru Ion (a5, nouă): liniile astea primesc etalon din cursele 744ARF / 804MUM?

### (c1) — R1a în «Ce faci» ca grupă «Doarme în Bălți, departe de capăt»: **NU așa cum e formulată → întrebare pentru Ion**
1. c1 și c2 se exclud. Dacă c2 = DA (casa ≤ 3 km = ca parcul), regula §5.3 (a) pentru parc (`categorii.mjs:295`, «parc ↔ capăt
   e golul impus până la E») face R1a: 435ASB 292,5 → **0**, 186OMM 281,7 → **0**, 144BRAZ 128,7 → **7,3**, 744ARF 179,4 → 179,4
   (golul impus e deja = E, 17,3 pe picior). Grupa ar rămâne cu o singură mașină, iar la ea restul e cursă nedetectată.
2. La 744ARF și 804MUM R1a conține curse cu oameni (secțiunea 1). O grupă «autobuzul nu mai face N km» le-ar cere să taie
   turul s1 R13 și returul s2 R18.
3. Dacă Ion alege c2 = NU (drumul casă ↔ capăt din Bălți e livrare, ca SEBN 5.3), precedentul pentru formă e SEBN §12.6 (livrarea
   în indicații, «șofer din satul de start sau mașina așteaptă la capăt?») + ION-108 (doar km, mașina mică). Dar SEBN o aplică
   la TOATE mașinile, nu doar la cele din Bălți: o grupă numai «Bălți» ar fi o categorie nouă, nedictată. Întrebare, nu decizie.

### (c2) — casa ≤ 3 km de poartă = «lângă uzină», ca parcul: **steag → întrebare pentru Ion** (nu se transpune curat)
- Pentru DA: consecvența internă (§7.4 parc la 0,7 km de VEST; casele sunt la 1,5–2,7 km — 435ASB e la 1,6 km de parc, mai aproape
  decât poarta EST de parc, 2,25 km); precedentul LEAR (`lear-analiza.mjs:1150`: «casa ei e uzina, regula 1 e deja aplicată»;
  `dorm.mjs:8-13`: golul uzină ↔ capăt nu e economie).
- Pentru NU: LEAR aplică «lângă poartă» doar la ≤ 1,5 km și doar ca rezervă; SEBN §5.3/§7.1 și Briceni §5.3 numără livrarea
  oricât de aproape de poartă ar sta șoferul — economia lor e «șofer din satul de start», iar pentru un șofer din Bălți asta e
  exact ce ar tăia R1a. Pragul de 3 km nu e al lui Ion (LEAR are 1,5; §5.4/§5.5 Drăxlmaier au 3 km ca «zonă a uzinei»).
- Cifrele pentru Ion: R1a măsurat pe cele 4 mașini 882,3 km/săpt. (extrapolat 1.268); cu DA rămân 186,7 (extrapolat ≈ 307),
  din care 139,7 sunt cursa R13 a lui 744ARF.

### (d1) — «dimineața > 1,3 × drumul capăt → casă ⇒ diferența la de lămurit»: **DA pe principiu, cu 3 schimbări înainte de runda 2**
1. **Întâi poarta în fereastră.** Dacă bucata R1a conține o oprire la poartă într-o fereastră §3.2, bucata e «cursă probabil
   nedetectată» (§8.6: ziua iese din regulile de economie), nu «de lămurit» §11.8. Pe flotă: 19 bucăți / 1.150 km; pe zile
   măsurate 429 km (024XKY 351,2, 744ARF 78,0).
2. **Comparația pe piciorul propriu, pe șosea.** Referința = Valhalla(locul nopții, capătul cursei vecine) × 1,05, ca la §5.2 și
   plafonul §8.3 — nu «drumul capăt → casă» de seara: la 186OMM dimineața e Grinăuți (16,7 km pe șosea), seara Nihoreni
   (35,1) — cu referința de seară, dimineața n-ar fi prinsă niciodată, iar la 804MUM seara e ea însăși cea umflată. 1,3 poate rămâne
   ca prag de STEAG pe pagină; cantitatea care rămâne la R1a e plafonată la ×1,05.
3. **Numele.** Nu «rulaj prin oraș»: la ambele mașini citate (744ARF, 804MUM) excesul e muncă la poartă în ferestre. Eticheta pe
   pagină: «R1a peste drumul casă ↔ capăt — de lămurit» sau «cursă probabil nedetectată», după punctul 1.
- Efect pe cele 4 mașini măsurate: rest 164,9 km/săpt. scos din R1a (435ASB 4,1; 186OMM 11,5; 144BRAZ 9,6; 744ARF 139,7).

---

## 4. Observații cu severitate (rubrica comună)

**H1 — high, −2.0 (defect de logică): premisa subiectului (d) și ținta lui (c1) sunt greșite pentru 744ARF și 804MUM.**
Scenariu: se livrează c1 cum e scris (grupa «Doarme în Bălți», «autobuzul nu mai face / mașina mică face»). Pe 14.09, 744ARF
apare cu R1a 299 km/săpt. (179,4 / 3 × 5), din care 78 % e turul s1 pe R13 Hăsnășenii Noi (mișcarea 05:0x → poartă 06:04–06:07, 23,4 km,
5/5 zile; oprire la Hăsnășenii Noi 05:41–05:47 pe 15 și 17.09) și drumurile lui; când 804MUM are zile măsurate, «seara 67 km» conține returul s2 (00:17–00:20 poarta EST →
00:53 Țiplești, 5/5 nopți). Dispecerul primește dispoziția să taie curse cu oameni. Dovezi: `economie-zile.json` (bucățile
«livrare» 03:00–14:07 și 16:28–03:00), `economie-curse.json` (mișcările 05:1x–06:0x 23,4 km și 00:2x 45,6 km),
`drax/cod/economie/alternative.mjs:124` (R1a = toată livrarea fără ocol), `economie-zile.json` `linii["R13|Hasnasenii Noi"].E =
{s1:null,s2:null}`, idem R18. Corecție: d1 cu punctul 1 (poarta în fereastră → §8.6) ÎNAINTE de orice c1; întrebarea a5 pentru
etalonul R13/R18.

**H2 — high, −2.0 (defect de logică): c1 și c2 sunt puse ca două întrebări DA/NU independente, dar se exclud.**
Scenariu: Ion răspunde DA la amândouă → migrația 409 scrie în §12.1 grupa «Doarme în Bălți» și în §7.4/§5.3 casa ≤ 3 km ca parcul;
workerul (`categorii.mjs:295`) mută R1a 435ASB 292,5 → 0 și 186OMM 281,7 → 0 la «gol pe rută», iar grupa nou scrisă în §12.1 e goală
pentru 3 din 5 mașini (sau, dacă `drax-ce-faci.ts` citește R1a din rândul vechi, arată 882 km care după rerulare dispar). Corecție:
o singură întrebare cu două variante, cu cifrele: (i) drumul casă-în-Bălți ↔ capăt e al uzinei, ca parcul (R1a rămâne 186,7, din care
139,7 cursa R13); (ii) e livrare, ca la SEBN 5.3 — atunci se arată pe TOATE mașinile peste prag, după SEBN §12.6, doar în km (ION-108).

**M1 — medium, −1.0 (gol de acoperire): golul impus 5.3 (a) depinde de faptul că drumul spre casă atinge raza porții**
(`categorii.mjs:296`, `if (!s.bpts.some((p) => poarta(p, PR.POARTA_EXTRA))) continue;`). În grupa Bălți: 744ARF primește 17,3 km
gol impus pe fiecare picior (drumul atinge poarta — dimineața chiar prin turul R13 nedetectat), 435ASB primește 0 pe același tip de
drum (casa la 1,7 km de poartă, spre Taura Veche nu trece prin rază). Aceeași situație, categorie diferită după cum trece șoseaua.
Corecție: în comparația v3.1/v4 și în întrebarea pentru Ion, cifrele R1a ale grupei se dau și cu, și fără golul impus.

**M2 — medium, −1.0 (gol de acoperire): regula d1 nu are control pe toată flota în plan.**
Pasul 5 vorbește de 744ARF și 804MUM; controlul pe flotă (§10.4, memoria `analiza-verifica-toata-flota`) arată și 024XKY (351,2 km
pe zile măsurate, poarta în tur s1) și 414ASB. Corecție: `an-flota.mjs` (sau echivalentul în `control.mjs`) ca probă P11 în lanț.

**L1 — low, −0.5: cifra «≈ 1.270 km/săpt. măsurat» e extrapolată** (măsurat 882,3); 144BRAZ are 2 zile (nemăsurată, sub
`MIN_ZILE_MASURATE`), 804MUM 0; «≈ 500 la 804MUM» e în cea mai mare parte curse (425,9 din 650,4 brut peste drumul pe șosea).

**L2 — low, −0.5: textul §4.1/§4.7 nu e în planul de livrare al capetelor** (Balatina, Năvîrneț numite «fără oprire» în textul
lui Ion); schimbarea trebuie scrisă prin `replace` pe marcaje, cu gard md5 pe 810297f3….

**Scor: 10 − 2,0 − 2,0 − 1,0 − 1,0 − 0,5 − 0,5 = 3,0.** Blocante (high): 2 (H1, H2).

---

## 5. Ce ar trebui schimbat în v4 / în documentul rundei înainte de runda 2
1. Subiectul (d) rescris: nu «rulaj prin oraș», ci «R1a peste drumul casă ↔ capăt»; regula d1 cu cei 3 pași (poarta în fereastră →
   §8.6; referință Valhalla pe piciorul propriu × 1,05; 1,3 doar steag); rezultatul pe toată flota, nu pe 2 mașini.
2. Subiectele (c1)+(c2) comasate într-o întrebare cu două variante și cifrele de mai sus.
3. Întrebarea nouă a5: etalon pentru R13 Hăsnășenii Noi (744ARF: mișcarea spre poartă 05:0x → 06:04–06:07, 5/5; oprire la Hăsnășenii Noi pe 15 și 17.09) și R18 Putinești (804MUM, tur s1
   ~04:50 → 06:16 și retur s2 00:17 → 00:53 Țiplești, 5/5) — sau rămân fără etalon cu steag «cursă nedetectată».
4. Pasul 5 al planului: adăugat `replace` pe §4.1/§4.7 pentru capetele din GPS.

## Întrebări pentru Ion (cu cifrele)
1. **Casa în Bălți** (435ASB 1,7 km de poartă, 186OMM 1,7, 144BRAZ 1,5, 744ARF 2,4, 804MUM 2,7): drumul de acasă până la capătul
   liniei e (i) al uzinei, ca atunci când mașina doarme la Parcul Bălți — R1a măsurat scade de la 882 la 187 km/săpt. — sau (ii)
   livrare, ca la SEBN, care se taie cu un șofer din satul de start — atunci apare în «Ce faci» doar în km (autobuzul nu mai face /
   mașina mică face), pentru toate mașinile peste prag, nu doar cele din Bălți?
2. **744ARF** pleacă în fiecare zi la ~05:10, oprește la Hăsnășenii Noi (05:41–05:47, pe 15 și 17.09) și ajunge la poartă la 06:04–06:07, apoi la 15:48 pleacă de
   la poarta EST și e acasă la 16:35. E linia R13 Hăsnășenii Noi, schimbul 1? (în act linia n-are nicio cursă în GPS-ul scheletului.)
3. **804MUM** e la poarta EST în fiecare noapte la 00:17–00:20 și la Țiplești la 00:53: e returul s2 al liniei R18 Putinești / R22?
4. Pragul «lângă uzină»: 1,5 km (ca la LEAR Ungheni) sau 3 km (zona uzinei Drăxlmaier, §5.4)?


---
### verificator-raport.md

# Verificarea 6 + 7 — DRAXELMAIER_BALTI — 27.09.2026 (dezbaterea ideal-v4, runda 1, ION-110)

**Starea.** v6 = activul ideal-v3.1 (`RUN=/home/verif/verificator/rulari/drax-v6-1790520344`, schelet 8b400214…) · v7 = candidatul ideal-v4
(`RUN=/home/verif/verificator/rulari/drax-v7-1790520350`, schelet f7214db8…, GATA al producătorului cu 25 de rânduri, timp.mjs = cel al verificatorului).
drax.mjs 1be43dc0b57b · ruleaza.sh a26fad56be25 · etalon-gps 3f958d6ca8dd · filtru-rupte 96807913f1d1 · c4 e9d6b55ec0b1 · timp 0c9b7668732f · node v20.20.2 · tz 2025c · Europe/Chisinau.
Regulile (md5 verificate pe fișier): **v6 judecat pe textul vechi** — `reguli_livrare_la` 2026-09-27T05:51:44.492026+00:00, 24.334 caractere, md5 810297f3c831a2cf4b2dbaea0d6e2c22; **v7 judecat pe textul nou** (migr. 412) — 2026-09-27T15:00:05.260446+00:00, 25.072 caractere, md5 62eace0d0dd8f37e678a27ef639f5c0e. Între ele diferă doar §4.1 (excepția «capătul din GPS») și §4.7 (fără Balatina și Năvîrneț); drax.mjs nu citește textul, deci rulările nu depind de el — doar judecata pe §4.1/§4.7 s-a rescris.
Intrări care diferă v6 → v7: schelet, obs, etalon, regulate, schimburi, care-schimb; `curse-ideal.json` (deplasările brute) e IDENTIC (79b09da2780e), deci diferența e doar tăietura lanțului.
SIGILIU: verdict v6 417bbae8… · v7 b3cc71f6… · manifest v6 a3bcba13… · v7 5da77b0f…
Probe: R1 ok pe ambele · registru: v6 ok · **v7 PICATĂ** (C31 nu se explică: registrul e pe alt sha — X2; clasa cunoscută, nu defect de script).
INCHIS: **ok** pe v6 și v7 (manifestul final = inițial).
Unități (v7): 51 linii din act, 49 linii `*`, 48 cu ideal, 49 mașini, 13.533 observații cu rută, 13.314 deplasări cu rută, 27.644 deplasări brute (v6: 99 linii, 13.528 / 13.309).
valid_pentru_export: v6 **true** (0 blocante, 5 explicate) · v7 **false** (5 blocante = aceleași 5, neexplicate pe f7214db8).

## Verdictul pe liniile schimbate (cererea 1)
| linie | v6 | v7 | km GPS sept, de la capătul v7 la poartă (+rază) | dovada capătului | verdict |
|---|---|---|---|---|---|
| R37 Musteața → Năvîrneț | 43,5 | 60,2 | tur s1 59,7 (n9) · tur s2 59,8 (n9) · retur s1 59,9 (n10) · retur s2 61,5 (n9) — toate în ±2,2 % de 60,2; de la Musteața 43,3–44,9 | 142/144 curse ale rutei trec, **136/144 opresc §4.5 la Năvîrneț la mijlocul deplasării** (sept 37/37), ambele schimburi, toate lunile, toate mașinile; pe v6 pragul sesiunii dă 100 %/100 %, +16 km | **noul capăt e mai bun**, conform §4.1 nou; v7 are însă schimburi s1 44,8/45,6 rămase din tăietura veche (D6 fals, F2 le citește) |
| R28 Cuhnești → Balatina | 65,5 | 75,0 | tur s1 73,4 (n9) · tur s2 73,0 (n9) · retur s1 75,5 (n11) · retur s2 75,3 (n9); C47 97 % → 91 % | 140/140 curse trec (ocol prin sat: două apropieri la km ~14 și ~18), **68/140 opresc §4.5** (sept 24/38); pe v6 pragul sesiunii: tur 50 %, retur 74 % — **fără pornirile din parcarea de noapte a lui 351KAJ la Balatina: tur 28 %**, retur 58 % | **mai bun pe km GPS, conform §4.1 nou** (dovada de oameni pe tur: 43 % pe fereastră, 28 % pe sept fără parcare); v7 e aplicat pe jumătate: etalon lanț 66,9, real 66,6/66,9, schimburi 65,5–69,3, drumul desenat 65,5 km (C23 12,7 %) |
| R37 «Rediul de Jos*» (nouă) | — | fără ideal | 2 observații mai–iul (351KAJ, 44 km) care nu ating Năvîrneț | V5 «0 săptămâni complete» | neverificabil, informativ |
Efect v4: card 5.819 → 5.872 km/zi (+53), GPS completat 5.948 → 6.000 km/zi (+52; R28 +19, R37 +33,4). Lei: nu (fără normă în rulare).

**§4.7 pe urmă (definiția §4.5 = `opr` din `curse.mjs:19,128-140`: vmin < 8 km/h, ≥ 20 s sub 15 km/h, cel mai apropiat loc ≤ 0,8 km):**
Balatina 68 opriri pe cursele R28 (sept 24) și Năvîrneț 136 (sept 37) → **§4.7 vechi era fals pentru ambele; §4.7 nou (migr. 412) le-a scos — corect**. Mîndîc 0 pe cursele R1 (24 opriri ale lui 024XKY pe drumuri în afara rutei, §11.8), Recea (R7) 0 (opririle «Recea» sunt la omonimul de pe R3), Sofrîncani 0, Obreja Nouă 0 → §4.7 rămâne adevărat pentru ele. Duratele (223 s, 536 s; §4.1 nou: «4–9 minute») nu le pot reproduce: intrările nu au viteza punct cu punct.
**§4.1 nou pe R28/R37 (v7):** opriri §4.5 în ambele sensuri — R37 136/144 curse ale rutei, R28 tur 33/67 (29/67 fără parcare), retur 35/72 pe fereastră; mai multe mașini — R37 351KAJ + 925FTI, R28 760BXI + 710CWN + 351KAJ → **ambele mutări sunt conforme cu regula**. «În mod regulat» nu are prag: pe fereastra sursei (sept), fără parcare, R28 are tur 5/18 (28 %).

## Capete suspecte pe flotă (cererea 2)
Definiția sesiunii (prag al sesiunii, nu al corpului — dezbaterea îl poate schimba): prima oprire §4.5 într-un sat al RUTEI înaintea tăieturii turului / ultima după tăietura returului, > 2,5 km de capăt, nu pe urma cursei însăși, ≥ 50 % pe FIECARE sens, pe fereastra sursei; «nu pe urma» = fără apropiere ≤ 1,2 km sau oprire a aceluiași sat pe partea plină (banda 1,2–1,5 km nu se vede în intrări). Varianta B scoate oprirea de la pornirea/sosirea deplasării (parcarea).
| linie | v6 tur / retur (B) | v7 | sat · distanță · +km |
|---|---|---|---|
| R37 Musteața | 100 % / 100 % (100/100) | 0 / 0 | Năvîrneț · 10,8 km · +16 |
| R28 Cuhnești | 50 % / 74 % (**28** / 58) | 0 / 0 | Balatina · 5 km · +5,5–8,8 |
| R19 Bilicenii Vechi | 73 % / 77 % (73/77) | 73 % / 77 % | Sîngerei · 8,2 / 7 km · +8,2 / +7,1 — **exclus de §4.1 nou (orașele din §5.1 nu fac capăt)** |
| R32 Trifănești | 47 % / 48 % (6/43) | la fel | Izvoare · 4 km · +5 — sub prag |
| R2 Stolniceni | 100 % / 28 % | la fel | Chiurt · 2,7 km · +3,9 — un singur sens |
| R22 Țipletești* | 9 % / 100 % | la fel | Heciul Vechi · 2,5 km — `*`, un sens |
Restul de 58 de linii cu observații: < 20 % pe ambele sensuri. Liniile `*` s-au măsurat doar pe septembrie.

**A doua clasă, aceeași familie («capătul din schelet nu e locul unde cursa servește»): capăt atins doar prin parcare (§4.2, start/sfârșit ≤ 2,5 km).**
Picioare cu capătul la ≤ 1 km de marginea deplasării, fără oprire în satele proprii dincolo de capăt și cu opriri în satele altei rute — identic în v6 și v7:
Zarojeni 15/29 (52 %, 348KAJ → R22/R21) · Dominteni 52/115 (45 %, 710CWN → Lazo, Hăsnășenii Noi, Dobrogea Veche = R13) · Heciul Vechi* 61/130 (47 %, 412BRAY → Bilicenii Vechi) ·
Prajila 29/107 (27 %, 763LYY → Gura Căinarului, Zarojeni = R18) · Sturzovca 16/107 (15 %, 727CWN → Limbenii Noi, Fundurii Noi = R11) · Țiplești 3/24 (13 %). Celelalte 58 < 10 %.
Dominteni (ture/zi 3 vs act 1) și Prajila (3 vs 2) au ture în plus exact acolo, iar R13 Hasnasenii Noi și R18 Putinești sunt liniile fără ideal (C31).

## Liniile cu steag (cererea 3)
| linie | E1 | G1 / «orice poartă» | ce decid datele |
|---|---|---|---|
| R3 Nihoreni | cerut (C47 58 %) — steag prezent | 44,2 vs 42,3 (4,5 %, bandă); orice poartă 44,3 (4,7 %) | **nu decid**: trei variante pe mașină (345KAJ ~39,8 · 457BRAX 43,8 · 186OMM 47,7 prin Recea); steagul rămâne |
| R16 Florești | necerut (C47 100 %) | 35,7 = 35,7; sursa «toate», 0 obs în sept | **nu decid**: km sigur pe mai–iul; nu se vede dacă linia mai lucrează |
| R18 Zarojeni | cerut (C47 41 %) | 28,9 vs 30,7 (5,9 %, blocant) | **decid cardul**: picioarele care opresc la Zarojeni dau 28,3 + 0,6 = 28,9; etalonul 30,7 e serviciul R22 al lui 348KAJ din parcarea de la Gura Căinarului → explicație, nu corecție |
| R27 Sturzovca | cerut (C47 29 %, variante) | 24,9 vs 46,5 (poarta sensului, 8 zile, doar 727CWN) / 24,1 (orice poartă, 41 zile) | **decid cardul**: 46,5 = 727CWN prin satele R11/R13; linia e 22–24 km la toate celelalte mașini; §6.6 «s1/s2» e diferență de mașină, nu de schimb |
| R32 Trifănești | necerut (C47 70 %) | 40,2 = 40,2 (fără 518MHD) | **nu decid**: Izvoare 47/48 % (fără parcare 6/43 %); D2 6 zile izolate, regimul sursei ≠ total |
| R36 Bocancea Schit | necerut (C47 94 %) | 54,5 vs 54,0 (0,9 %) | **decid**: steagul nu mai e cerut de niciun control; corecție directă posibilă 54,0 (−1 km/zi); intrarea G1 din registru e moartă (X1) |

## High-uri (cu scenariu) și scorul
- **H1 — v4 aplicat pe jumătate (cache).** `schelet-cand.json` e indexat `ruta|linie|zi|schimb|m` (`drax/cod/ideal/schelet.mjs:5,114`), fără capăt; `alege.mjs:14,80-92` refolosește picioarele tăiate la capătul vechi. *Scenariu:* v4 devine activ → luni F2 (`economie/categorii.mjs:37-40`) vede pe R37 s1 45,2 vs s2 62,0 (27 % > 25 %) și ține etalonul PE SCHIMB: în săptămânile în care R37 e pe s1, plafonul golului pe rută (§5.3 a) e 45,2 km în loc de 60,2; pe R28 culoarul (`l.drum`) se oprește la Cuhnești, la 4,7 km de capătul Balatina, deci cei ~9 km zilnici Balatina ↔ Cuhnești ies din culoar (≤ 1 km) și intră la livrare; LDE desenează drumul Cuhnești cu eticheta 75 km (C23 12,7 %).
- **H2 — regulile (închis de migr. 412).** Pe textul vechi §4.1/§4.7 contraziceau v4 (și §4.7 era fals pe date); pe textul nou mutările R28/R37 sunt conforme. Rest (low): «în mod regulat» fără prag numeric — alegerea ferestrei (sursă vs toată) decide R28 (tur 28 % vs 43 % fără parcare); duratele 4–9 min neverificabile pe intrări.
- **H4 — clasa «capăt prin parcare» (preexistentă, ambele schelete).** *Scenariu:* Dominteni rămâne cu 3 ture/zi (204 km/zi GPS), din care serviciul R13 al lui 710CWN; R13 Hasnasenii Noi rămâne «fără ideal, explicat» în registru; economia F2 pe Dominteni și R13 e pusă pe linia greșită.
- Medii/low: registrul nere-semnat pe f7214db8 (v7 nu e exportabil); `capete-gps.json` e sigilat în GATA dar nu intră în copiile verificatorului; pragul «regulat» din §4.1 nu e scris. R19 e închis de §4.1 nou.

**Scorul (10 − Σ deduceri; critical −3 · high −2/−1,5/−1 · medium −0,5 · low −0,25):** pe textul nou: H1 −2 · H4 −1 · registru −0,5 · §4.1 «regulat» fără prag (R28 tur 28 % pe sursă) −0,25 · capete-gps.json în afara intrărilor −0,25 = −4,0 → **6,0 / 10 pentru ideal-v4 așa cum e** (pe textul vechi era 4,0: H2 −1,5, R28 −0,5, R19 −0,25 în plus). Cu v4.1 (cache curățat, C23 R28 ≤ 5 %, D6 R37 dispărut): ~8,0; cu H4 rezolvat în lanț: ~9.

## Blocante (neexplicate) — v7
C31(a) R13 Hasnasenii Noi, R18 Putinești, R27 Iabloana (0 candidate) · G1 R18 Zarojeni (28,9 / 30,7, 5,9 %) · G1 R27 Sturzovca (24,9 / 46,5). Aceleași 5 sunt **explicate în v6** (registrul pe 8b400214). Diagnosticul G1 e mai sus (cererea 3): ambele păstrează cardul.

## Explicate (registru) — v6
C31 ×3 și G1 ×2, pe sha 8b400214… · X1: 19 intrări moarte în v6, 24 în v7 (sha 0a5d2a5e, 29b2d3aa, 43dcceaf, 8b400214); G1 Bocancea Schit pe 8b400214 «nu explică nicio constatare blocantă» → se șterge.

## Nou față de verificarea anterioară (v6 → v7, km GPS linie cu linie, `compara.mjs`)
R28 Cuhnești 65,5 → 75 (GPS 65,5 → 75; km/zi 131 → 150) · R37 Musteața 43,5 → 60,2 (87 → 120,4; zile bune 10 → 9) · nou R37 Rediul de Jos* · dispărute 0 · cardul ≠ etalon (±0,1 km) în v7: Zarojeni −1,8, Sturzovca −21,6, Bocancea Schit +0,5, Nihoreni +1,9 (aceleași ca în v6) ·
constatări noi în v7: C23 R28 (12,7 %), D6 R37 (s1 45,2 / s2 62,0, «neconfirmat pe observații»), V5 Rediul de Jos*; dispărute: C35(d) Balatina și Năvîrneț (satul din act cu 0 % pe rută).

## Linie cu linie — din act (v7; v6 în paranteză unde diferă)
| rută | linie | verdict | sursa, zile bune GPS | km card v7 · GPS completat · dif (v6) | corecție | ture/zi · kmZi GPS | regim (D1) | porți tur/retur | C47 | controale căzute |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | Donduseni | trece | sept, 19 | 91.9 · 91.9 · 0 % | — | 1 · 183.8 | — | EST/EST | 100 % | — |
| R2 | Stolniceni | trece | sept, 16 | 67.9 · 67.9 · 0 % | — | 1 · 135.8 | — | VEST/EST | 94 % | — |
| R3 | Nihoreni | abatere | sept, 16 | 44.2 · 42.3 · 4.5 % | diagnostic cerut | 2 · 169.2 | — | VEST/EST | 58 % | C47 |
| R4 | Grinauti | trece | sept, 32 | 25.6 · 25.6 · 0 % | — | 2 · 102.4 | — | EST/EST | 97 % | — |
| R5 | Alunis | trece | sept, 9 | 34.6 · 34.6 · 0 % | — | 1 · 69.2 | — | VEST/EST | 100 % | — |
| R6 | Mihailenii Vechi | abatere | sept, 17 | 54.9 · 54.9 · 0 % | diagnostic cerut | 1 · 109.8 | — | EST/EST | 79 % | C22 zi aleasă |
| R7 | Usurei | trece | sept, 17 | 37.4 · 37.4 · 0 % | — | 1 · 74.8 | — | VEST/EST | 94 % | — |
| R8 | Costesti | trece | sept, 19 | 78.5 · 78.5 · 0 % | — | 1 · 157 | — | VEST/EST | 100 % | — |
| R9 | Cobani | abatere | sept, 14 | 55.5 · 55.5 · 0 % | diagnostic cerut | 2 · 222 | sursa «sept»: doar s1 · toată fereastra: neclar (lanț: neclar); act EZ+D → GPS neclar (sursa: doar s1) | VEST/EST | 100 % | D1 regim sursă ≠ total, D1 ≠ act |
| R10 | Ciuciulea | trece | sept, 28 | 66.5 · 66.5 · 0 % | — | 2 · 266 | — | EST/EST | 80 % | — |
| R11 | Funduri Vechi | trece | sept, 16 | 24.7 · 24.7 · 0 % | — | 1 · 49.4 | — | VEST/EST | 97 % | — |
| R11 | Limbenii Noi | trece | sept, 9 | 31.2 · 31.2 · 0 % | — | 1 · 62.4 | — | VEST/EST | 80 % | — |
| R12 | Pelinia | trece | sept, 37 | 26.4 · 26.4 · 0 % | — | 2 · 105.6 | — | EST/EST | 100 % | — |
| R12 | Sofia | trece | sept, 33 | 31.5 · 31.5 · 0 % | — | 2 · 126 | — | VEST/VEST | 99 % | — |
| R13 | Hasnasenii Noi | neverificabil | — | — | — | — | — | — | — | C31(a) |
| R13 | Lazo | trece | toate, 22 | 16.4 · 16.4 · 0 % | — | 2 · 65.6 | — | EST/EST | 100 % | — |
| R14 | Baroncea | trece | sept, 27 | 44.4 · 44.4 · 0 % | — | 2 · 177.6 | — | EST/EST | 100 % | — |
| R14 | Dominteni | abatere | sept, 54 | 34 · 34 · 0 % | diagnostic cerut | 3 · 204 | act EZ → GPS ambele (sursa: ambele) | EST/EST | 68 % | — |
| R15 | Suri | trece | sept, 8 | 70 · 70 · 0 % | — | 1 · 140 | — | VEST/EST | 96 % | — |
| R16 | Floresti | abatere | toate, 13 | 35.7 · 35.7 · 0 % | — | 1 · 71.4 | act EZ+D → GPS rotatie (sursa: rotatie) | EST/EST | 100 % | — |
| R16 | Varvareuca | trece | sept, 35 | 42.8 · 42.8 · 0 % | — | 2 · 171.2 | — | EST/EST | 82 % | — |
| R17 | Prajila | abatere | sept, 45 | 41.3 · 41.3 · 0 % | diagnostic cerut | 3 · 247.8 | — | EST/EST | 84 % | — |
| R18 | Putinesti | neverificabil | — | — | — | — | — | — | — | C31(a) |
| R18 | Zarojeni | blocant | sept, 9 | 28.9 · 30.7 · -5.9 % | diagnostic cerut | 2 · 122.8 | sursa «sept»: neclar · toată fereastra: rotatie (lanț: rotatie) | EST/EST | 41 % | G1, D1 regim sursă ≠ total, C47 |
| R19 | Bilicenii Vechi | abatere | sept, 25 | 17.3 · 17.3 · 0 % | diagnostic cerut | 2 · 69.2 | sursa «sept»: doar s2 · toată fereastra: rotatie (lanț: rotatie); act EZ+D → GPS rotatie (sursa: doar s2) | EST/EST | 81 % | D1 regim sursă ≠ total |
| R19 | Copaceni | trece | sept, 36 | 32.8 · 32.8 · 0 % | — | 2 · 131.2 | — | EST/EST | 99 % | — |
| R20 | Nicolaevca | abatere | sept, 28 | 39.6 · 39.6 · 0 % | diagnostic cerut | 2 · 158.4 | sursa «sept»: ambele · toată fereastra: neclar (lanț: neclar); act EZ+D → GPS neclar (sursa: ambele) | EST/EST | 100 % | D1 regim sursă ≠ total, D1 ≠ act |
| R20 | Radoaia | trece | sept, 37 | 26.1 · 26.1 · 0 % | — | 2 · 104.4 | — | EST/EST | 97 % | — |
| R21 | Heciul Nou | trece | sept, 39 | 20.7 · 20.7 · 0 % | — | 2 · 82.8 | — | EST/EST | 97 % | — |
| R22 | Tiplesti | trece | sept, 7 | 21.4 · 21.4 · 0 % | — | 1 · 42.8 | act EZ+D → GPS rotatie (sursa: rotatie) | EST/EST | 83 % | — |
| R23 | Scumpia | trece | sept, 21 | 59.5 · 59.5 · 0 % | — | 2 · 238 | — | VEST/EST | 98 % | — |
| R24 | Catranic | trece | sept, 15 | 29.3 · 29.4 · -0.3 % | — | 1 · 58.8 | — | VEST/EST | 92 % | — |
| R25 | Hiliuti | abatere | sept, 9 | 32 · 32 · 0 % | diagnostic cerut | 1 · 64 | — | EST/EST | 100 % | C22 zi aleasă |
| R26 | Ilenuta | trece | sept, 7 | 38.8 · 38.8 · 0 % | — | 1 · 77.6 | — | EST/EST | 89 % | — |
| R26 | Obreja Veche | trece | sept, 15 | 38.4 · 38.4 · 0 % | — | 1 · 76.8 | — | VEST/EST | 100 % | — |
| R27 | Danu | trece | sept, 16 | 53.3 · 53.3 · 0 % | — | 1 · 106.6 | — | VEST/EST | 94 % | — |
| R27 | Iabloana | neverificabil | — | — | — | — | — | — | — | C31(a) |
| R27 | Sturzovca | blocant | sept, 8 | 24.9 · 46.5 · -46.5 % | diagnostic cerut | 3 · 279 | sursa «sept»: neclar · toată fereastra: ambele (lanț: ambele); act D → GPS ambele (sursa: neclar) | VEST/EST | 29 % | G1, D1 regim sursă ≠ total, C47, C22 zi aleasă |
| R28 | Cuhnesti | abatere | sept, 14 | 75 · 75 · 0 % (v6 65.5) | v4.1 (cache) | 1 · 150 | — | VEST/EST | 91 % | — |
| R29 | Ustia | trece | sept, 9 | 56.9 · 56.9 · 0 % | — | 1 · 113.8 | — | VEST/EST | 100 % | — |
| R30 | Cosernita | trece | sept, 18 | 63.8 · 63.8 · 0 % | — | 1 · 127.6 | — | EST/EST | 97 % | — |
| R31 | Cotiujenii Mari | trece | sept, 15 | 65.1 · 65.1 · 0 % | — | 1 · 130.2 | — | EST/EST | 100 % | — |
| R32 | Cainarii Vechi | trece | sept, 18 | 46.9 · 46.9 · 0 % | — | 1 · 93.8 | — | EST/EST | 79 % | — |
| R32 | Trifanesti | abatere | sept, 18 | 40.2 · 40.2 · 0 % | diagnostic cerut | 2 · 160.8 | sursa «sept»: ambele · toată fereastra: doar s1 (lanț: doar s1); act D → GPS doar s1 (sursa: ambele) | EST/EST | 70 % | D1 regim sursă ≠ total, D2 izolat |
| R33 | Iezarenii Vechi | trece | sept, 13 | 34.7 · 34.7 · 0 % | — | 1 · 69.4 | — | EST/EST | 96 % | — |
| R34 | Taura Veche | trece | sept, 18 | 40.7 · 40.7 · 0 % | — | 1 · 81.4 | — | EST/EST | 100 % | — |
| R35 | Cucioaia | trece | sept, 19 | 52.5 · 52.5 · 0 % | — | 1 · 105 | — | EST/EST | 100 % | — |
| R36 | Bocancea Schit | trece | sept, 11 | 54.5 · 54 · 0.9 % | directă 54,0 | 1 · 108 | — | EST/EST | 94 % | — |
| R37 | Musteata | abatere | sept, 9 | 60.2 · 60.2 · 0 % (v6 43.5) | v4.1 (cache) | 1 · 120.4 | — | VEST/EST | 100 % | — |
| R38 | Glinjeni | trece | sept, 13 | 33.3 · 33.3 · 0 % | — | 1 · 66.6 | — | VEST/EST | 94 % | — |
| R39 | Popestii de jos | trece | toate, 47 | 74.8 · 74.8 · 0 % | — | 1 · 149.6 | — | EST/EST | 98 % | — |

## Linii * (v7)
| rută | linie | verdict | cifre |
|---|---|---|---|
| R1 | Tîrnova* | neverificabil | nicio candidată nu trece satele regulate (1 cu urmă) |
| R2 | Cupcini* | trece |  |
| R3 | Recea* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R3 | Rîșcani* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R4 | Corlăteni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R5 | Recea* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R6 | Nicoreni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R7 | Recea* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R7 | Slobozia* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R8 | Pîrjota* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R9 | Glodeni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R9 | Hîjdieni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R11 | Fundurii Noi* | neverificabil | nicio candidată nu trece satele regulate (1 cu urmă) |
| R11 | Sadovoe* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R14 | Hăsnășenii Mari* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R15 | Drochia* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R16 | Mărășești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R16 | Mărculești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R17 | Mărculești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R18 | Gura Căinarului* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R19 | Sîngerei* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R20 | Drăgănești* | trece |  |
| R20 | Mîndreștii Noi* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R20 | Sacarovca* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R21 | Alexăndreni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R22 | Alexăndreni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R22 | Heciul Vechi* | trece |  |
| R22 | Țipletești* | trece |  |
| R23 | Călugăr* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R23 | Fălești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R23 | Frumușica* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R23 | Gara Fălești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R23 | Măgureanca* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R25 | Pîrlița* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R27 | Sadovoe* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R28 | Moara Domnească* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R29 | Limbenii Vechi* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R29 | Petrunea* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R32 | Bezeni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R32 | Frumușica* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R33 | Bilicenii Vechi* | trece |  |
| R33 | Nicolaevca* | neverificabil | nicio candidată nu trece satele regulate (1 cu urmă) |
| R33 | Vrănești* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R34 | Bilicenii Vechi* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R35 | Dumbrăvița* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R36 | Bobletici* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R36 | Flămînzeni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |
| R37 | Rediul de Jos* | neverificabil | nicio candidată nu trece satele regulate (1 cu urmă) · nouă în v7 |
| R38 | Mărăndeni* | neverificabil | nicio candidată (nicio zi cu tur și retur la capăt) |

## Pe flotă — mașini
Dubluri: 880RNK «sigur» (dispozitive 2402/2478, 7 zile, efect nul) · C37 R17 713IZX=763LYY 7/184 (4 %) · salturi între porți: 744ARF 16 zile, 346KAJ, 348KAJ, 350KAJ, 412BRAY câte 1 (0 atribuite unei linii) ·
deplasări fără schimb: 210 observații (geamăn rt 113, goale 36, rest 57), regulate 024XKY (R15 Suri 6 zile ~11:41, R12 Pelinia 11 zile ~11:20), 446ASB R23 Călugăr* 5 zile ·
clasa «capăt prin parcare»: 348KAJ (Zarojeni), 710CWN (Dominteni), 763LYY (Prajila), 727CWN (Sturzovca), 412BRAY (Heciul Vechi*).
Diagnosticele complete: `diag-c-v7.txt` (R28/R37 cursă cu cursă, §4.7), `diag-c44-v7.txt` (Nihoreni, Zarojeni, Sturzovca, Trifănești). Scripturile: `/root/diag-verif/capete-{a,b,c,d,e,f}.mjs`, `lista-linii.mjs`.


---
### verificator-corectii.md

# Corecții PROPUSE — dezbaterea ideal-v4, runda 1 (nimic scris; toate în dosare noi, niciodată pe loc)

1. **v4.1 — cache-ul candidatelor (H1).** Linii: R28 Cuhnești, R37 Musteața. Control: C23 (R28 12,7 %), D6 (R37 s1 45,2 / s2 62,0 fals), coerența card ↔ etalon/real/schimburi.
   Fișiere atinse: `drax/cod/ideal/schelet.mjs` (cheia `ruta|linie|zi|schimb|m`, :5,114) și `alege.mjs` (:14,80-92). Minim: în copia `drax/date/ideal-v4.1/` se șterg din
   `schelet-cand.json` cheile `R28|Cuhnesti|*` și `R37|Musteata|*`, apoi schelet → alege → card. Durabil: cheia include capătul (`…|capat`) ca orice schimbare de capăt să invalideze.
   Efect km/zi GPS: 0 pe card (rămâne 75 și 60,2); F2 pe R37 s1: plafonul §5.3 a 45,2 → 60,2 km (+15 km/picior în săptămânile s1); R28: culoarul acoperă Balatina ↔ Cuhnești (~9 km/picior) → iese din livrare.
   Acceptare: C23 R28 ≤ 5 %, |s1 − s2| ≤ 5 % pe R37, D6 R37 dispare, `compara.mjs` v6 → v4.1 identic pe card cu v7.
2. **Regulile (H2) — §4.1/§4.7 FĂCUTE prin migr. 412.** Rămâne: pragul numeric pentru «în mod regulat» în §4.1 (și fereastra pe care se măsoară)
   §6.6 Sturzovca reformulat (diferență de mașină/rută, nu de schimb). Efect km: 0. Apoi se re-semnează registrul pe sha-ul lui v4.1.
3. **R37 Musteața → Năvîrneț:** se păstrează în v4.1 (60,2 km; +33,4 km/zi GPS față de v3.1). Dovada: 136/144 opriri la Năvîrneț, km sept 59,7–61,5.
4. **R28 Cuhnești → Balatina:** se păstrează în v4.1 (conform §4.1 nou). Dacă dezbaterea scrie pragul «regulat» pe fereastra SURSEI fără parcare, turul are 28 % (5/18) — atunci pragul trebuie ≤ 25 % sau fereastra = toată (43 %); altfel înapoi la 65,5 cu steag (−19 km/zi).
5. **R36 Bocancea Schit:** corecție directă card 54,5 → 54,0 (G1 0,9 %, C47 94 %), steagul se scoate, intrarea G1 din registru se șterge. Efect −1,0 km/zi GPS. Fișier: cardul din `alege`/`card` în copia nouă.
6. **R18 Zarojeni, R27 Sturzovca:** fără corecție de card; explicații G1 re-semnate cu diagnosticul de aici (Zarojeni: 28,9 = picioarele prin Zarojeni; Sturzovca: 46,5 = 727CWN prin satele R11).
7. **Clasa «capăt prin parcare» (H4), schimbare de lanț separată, după v4:** în `etalon.mjs` (atingerea capătului, §4.2), un picior care atinge capătul doar la ≤ 1 km de marginea deplasării și nu oprește în niciun sat propriu nu intră pe linie.
   Linii: Zarojeni (52 %), Dominteni (45 %), Prajila (27 %), Sturzovca (15 %). Efect: până la −68 km/zi pe Dominteni (dacă a treia tură e R13), mutat, nu pierdut; se remăsoară ture/zi și se verifică dacă R13 Hasnasenii Noi / R18 Putinești primesc ideal.
8. **Script (propunere pentru sesiune, nu schimbată acum):** `ruleaza.sh` copiază `capete-gps.json` ca intrare opțională sigilată; `drax.mjs` verifică pe fiecare linie mutată pragul (varianta fără parcare) și raportează C48.


---
### verificator-intrebari.md

# Întrebări pentru dezbaterea Claude + Codex (runda 1, ideal-v4) — după migr. 412

1. **R37: capătul Năvîrneț (60,2 km) — confirmat de §4.1 nou; se activează doar după v4.1 (cache curățat)?**
   Cifre: Năvîrneț: 136/144 curse cu oprire §4.5 la mijlocul deplasării, sept 37/37; km GPS sept 59,7 / 59,8 / 59,9 / 61,5; +33,4 km/zi; v7 schimburi s1 44,8/45,6 (cache)
   Recomandarea verificatorului: DA, după v4.1

2. **§4.1 nou spune «în mod regulat» fără prag: ce prag numeric, și se numără pornirea din parcarea de noapte?**
   Cifre: R28 pe v6: tur 50 % cu parcare / 28 % fără; retur 74 % / 58 %; opriri §4.5 la Balatina pe fereastră tur 33/67 (29/67 fără parcare), retur 35/72; în sept fără parcare tur 5/18 (28 %), retur 11/19 (58 %); R32 Trifănești tur 47 % → 6 % fără parcare
   Recomandarea verificatorului: prag scris pe TOATĂ fereastra (capătul e structural; sept are 18 tururi): «oprire §4.5 în ≥ 30 % din curse pe fiecare sens, fără pornirea/sosirea din parcare, la ≥ 2 mașini» — R37 ~95 % și R28 43 % / 49 % trec; pe fereastra sursei R28 tur ar pica (28 %), deci alegerea ferestrei decide R28 și trebuie scrisă

3. **Clasa «capăt atins doar prin parcare»: se scoate din linie piciorul care atinge capătul doar la marginea deplasării și nu oprește în niciun sat propriu?**
   Cifre: Zarojeni 52 %, Dominteni 45 %, Prajila 27 %, Sturzovca 15 %; Dominteni ture/zi 3 vs act 1, Prajila 3 vs act 2; R13 Hasnasenii Noi și R18 Putinești fără ideal
   Recomandarea verificatorului: DA, ca schimbare de lanț separată (după v4), cu remăsurarea ture/zi și cu verificarea dacă R13/R18 primesc ideal

4. **R18 Zarojeni și R27 Sturzovca: G1 blocant se explică (card păstrat) sau se corectează spre etalonul GPS?**
   Cifre: Zarojeni: picioarele cu oprire la Zarojeni 28,3 + 0,6 = 28,9 = card; etalon 30,7 = serviciul R22. Sturzovca: orice poartă 24,1 (41 zile) vs poarta sensului 46,5 (8 zile, doar 727CWN, sate R11)
   Recomandarea verificatorului: explicație re-semnată, card păstrat; textul §6.6 despre Sturzovca («s1 24,7 / s2 46,9») se corectează: e diferență de mașină și de rută, nu de schimb

5. **capete-gps.json (sigilat în GATA) nu intră în copiile verificatorului: drax.mjs nu poate verifica mecanic sursa capetelor GPS**
   Cifre: GATA v4: capete-gps.json 55498ac8…; in/ al rulării v7 nu-l conține
   Recomandarea verificatorului: propunere de script (aprobată de sesiune): ruleaza.sh copiază capete-gps.json ca intrare opțională, iar drax.mjs verifică pentru fiecare linie mutată pragul și C48

Închise de migr. 412: amendarea §4.1/§4.7 (făcută) și R19 Sîngerei (orașele din §5.1 nu fac capăt).
