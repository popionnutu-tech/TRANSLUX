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
