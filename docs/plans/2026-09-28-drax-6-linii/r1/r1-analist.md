# ION-112, runda 1 — uzina-analist («cercetează»): cele 6 linii cu steag și lista «capăt prin parcare»

Autor: uzina-analist, 27.09.2026. Nu am scris în bază și n-am schimbat nimic pe VPS.

Surse:
- VPS `/root/lde-worker/drax/date/ideal-v4.2/`: `curse-ideal.json` (mișcările brute cu `apr` și `opr` ≥ 20 s), `obs-ideal.json`,
  `nomenclator.json`, `card-gps-raport.txt`;
- fereastra 04.05–17.07 + 01.09–25.09;
- regulile: text 1cfc6c53 (`scratchpad/p112/reguli-drax-1cfc6c53.txt`) și `lde_uzine.reguli_livrare` LEAR / Florești / SEBN / Trox.

Nu am coborât la urma minut cu minut din pg (`minut744.mjs`). Opririle ≥ 20 s din `curse-ideal.json` au ajuns pentru concluziile de mai jos.
Unde o concluzie ar cere proba pe minut, o spun.

Scripturile sunt în `scratchpad/p112/`, cu ieșirile lor:
- `cine.mjs <rute>`: pe fiecare rută, cine OPREȘTE în satele ei, pe ce fereastră, sub ce etichetă, prin ce alte rute. Ieșire `cine-out.txt`.
- `drum.mjs <mașină> <rută> <n> <lună>`: drumul real, sat cu sat, cu km și opriri. Ieșiri `drum1.txt` și `drum2.txt`.
- `med.mjs`: mediana km-ilor cu oameni pe linie × mașină, septembrie și toată fereastra. Ieșire `med-out.txt`, cu rândurile din card.

## Pe scurt, linie cu linie

| linie | cine deservește de fapt (opriri ≥ 20 s) | km cu oameni pe GPS (sept., mediana tur + retur) | card azi | poziția mea |
|---|---|---|---|---|
| R3 Nihoreni | EZ = 345KAJ; D = 186OMM (sept.) și 397VKV (mai–iul.) + 457BRAX | linia 44,1; 345KAJ 39,9 / 41,5; 186OMM 47,9 / 48,5; 397VKV 51,2 (toată fereastra) | 44,2 × 2 | **44,2 rămâne, steagul se închide** (vezi 1) |
| R16 Florești | 518MHD (sept.), 144BRAZ (mai–iul.): pornesc din orașul Florești | 35,2 (sept. 6 picioare; toată fereastra 35,2 din 53) | 35,7 × 1 | **35,2**; cei 52,9 km sunt drumul de acasă (**H1**) |
| R18 Zarojeni | 348KAJ: Gura Căinarului pe toate picioarele; Zarojeni doar pe o parte din tururi | 29,5 (sept.); toată fereastra 26,9 (tur 27,0 / retur 22,2) | 28,9 × 2 | **steag rămâne** — retururile nu opresc la Zarojeni (**M1**) |
| R27 Sturzovca | 727CWN, 804MUM, 397VKV, 441ASB (sept.), 034BRAT și 402VKV (mai–iul.) | 23,7 (sept., 107 picioare); toate mașinile între 23,2 și 26,0 | 24,9 × 3 | **23,7 × 3** (−7,2 km/zi) |
| R32 Trifănești | 146BRAZ (fără 518MHD) | 146BRAZ 39,4 / 40,6 | 40,2 × 2 | **40,2 rămâne**; eticheta 518MHD trebuie scoasă (**H1**) |
| R36 Bocancea Schit | 224BZP singur | 53,4 (tur 53,4 / retur 53,1, sept.; 23 de picioare) | 54,5 × 1 | **53,4** (§6.3, septembrie); 46,2 cădea greșit |

Efect pe card, pe km/zi:
- R16: −1,0 (1 tură/zi);
- R27: −7,2;
- R36: −2,2;
- R3, R18 și R32: 0.

Total ≈ **−10,4 km/zi**.

---

## 1. R3 Nihoreni

Drumul (`drum1.txt`, `drum2.txt`):
- **EZ (345KAJ, doarme la Pîrjota)**: Rîșcani (oprire) → Nihoreni (oprire, 33 km în linie dreaptă de poartă) → Rîșcani (oprire) → Recea
  (oprire) → Corlăteni → poarta VEST.
  - Nihoreni e o ramură din Rîșcani, dus-întors pe 4,3 km.
  - Km cu oameni: 41,1 / 39,9 la tur, 41,5 la retur (01–02.09).
- **D (186OMM în sept., 397VKV în iunie)**: aceleași sate, dar în Nihoreni trece prin DOUĂ puncte, la 2,5 km unul de altul
  (Nihoreni@45,3 → Nihoreni@47,8), cu opriri în amândouă. Apoi face 3 km prin orașul Rîșcani, cu opriri.
  - Km cu oameni: 52,1–52,3 (186OMM, 01–03.09), 51,0–51,5 (397VKV).
  - Mediana pe septembrie a lui 186OMM: 47,9 / 48,5.

Diferența EZ ↔ D (~7–10 km) e reală și cu oameni: bucla de urcare din Nihoreni și din orașul Rîșcani. Nu apare niciun sat în plus.
Precedentul e LEAR Florești §4.4: «Puncte de încărcare regulate care NU sunt în act … bucla adaugă ~12 km pe sens … Sunt muncă a rutei».

**Pentru card nu contează.**
- Linia are 2 ture pe zi: una a grupei EZ, una a grupei D.
- Două carduri pe grupă ar da 2 × 40,7 + 2 × 48,2 = 177,8 km/zi.
- Cardul unic dă 2 × 2 × 44,2 = 176,8 km/zi.
- Diferența e de 1,0 km/zi, sub pragul unei decizii.

Mediana liniei pe septembrie, 44,1, e deja cardul, 44,2.

**Poziția: 44,2 × 2 rămâne, steagul se închide.** Nota rămâne pe pagină: «D face bucla de urcare din Nihoreni și Rîșcani, +7–10 km».
Nu e nevoie de un etalon pe grupă, care ar schimba §6.6 fără efect pe card.

## 2. R16 Florești

- Linia pornește din orașul Florești.
- **518MHD** (sept.) doarme la Izvoare, sat R32 / R20. Tur s1, 01.09 la 04:56: Izvoare (oprire la km 0, adică acasă) → Frumușica →
  Alexandrovca → Trifănești → Sevirova → Ivanovca → Mărculești → **Florești (oprire)** → Vărvăreuca → Mărculești → Mărășești → poartă.
  Pe drumul prin satele R32 **nu oprește nicăieri**.
- La fel pe 03.09 și pe 02.09, cu turul s1 etichetat R16 \| Varvareuca: opriri doar la Izvoare (km 0) și la Florești.
- Turul s2 pornește de la Mărculești: Florești (oprire) → poartă, **35,2 km**.
- 144BRAZ, în mai–iulie, pe același drum: 34,9–35,6.
- Mediana liniei: 35,2, în septembrie și pe toată fereastra, 53 de picioare.

**Poziția: card 35,2 × 1.** Cei 52,9 km din verdict-v3 sunt drumul de acasă (Izvoare → Florești, ~17,5 km, fără oprire): livrare, nu
serviciu. Asta răspunde la întrebarea lui Ion din 27.09 («de lămurit dacă ocolul prin R32 e cu oameni»): nu e.

## 3. R18 Zarojeni (+ rândul «capăt prin parcare» 348KAJ, 52 %)

348KAJ, pe toată fereastra (`cine-out.txt`):

| picior | câte | oprește la Gura Căinarului | oprește la Zarojeni |
|---|---|---|---|
| tur s1 | 31 | 35 | 9 |
| tur s2 | 37 | 51 | 21 |
| retur s1 | 50 | 52 | **1** |
| retur s2 | 46 | 46 | **1** |

- Retururile de la 00:18 se termină la Gura Căinarului: km cu oameni 22,0 (retur s2), 22,2 pe toată fereastra, față de 27,0 la tur.
- Turul coboară din Zarojeni doar pe o parte din zile. Restul drumului până la Zarojeni e parcare sau drum spre casă, de unde vine cei
  52 % «capăt prin parcare».
- Returul s1 trece prin satele R21 / R22: Biruința → Alexăndreni → Heciul Vechi → Țiplești → Gura Căinarului. Aici se unesc serviciile
  R22 și R18, în aceeași cursă, cum a spus Ion pe 27.09: «ruta lungă e divizată în câteva mașini». De aici și varianta de 30,0 / 30,7 km.
- Putinești, satul R18, e deservit de 146BRAZ (R32, septembrie), 763LYY (R17, mai) și 412BRAY (R22 \*, mai). Migrația 415 a tratat deja
  cazul.
- «D/EZ 53,3 / 25,6» din verdict-v3: varianta de 53 km sunt picioarele 348KAJ prin satele R32 (Sevirova, Alexandrovca, Ivanovca;
  tur s2 plin 52,0, retur s2 55,0), aproape toate în mai–iulie (în septembrie 1–2).

**Poziția: steagul rămâne**, cu o întrebare pe date noi (M1):
- Cu tur = retur (§6.1), cardul de 28,9 pune și pe retur tronsonul Gura Căinarului → Zarojeni, pe care retururile nu-l fac cu oameni
  (1 din 96).
- Pe km reali, returul are ~22 km, iar turul 27–29.
- Precedente pentru tur ≠ retur: SEBN §4.6 «tur ≠ retur e real, drumuri diferite — nu e greșeală»; Florești §6.1 (A5, tur 28,7 /
  retur 24,4, sub 18 %).
- Aici diferența e de 18–23 %, peste pragul §6.2.
- Pentru ca ambele părți să fie de acord trebuie: (a) proba minut cu minut pe 5 retururi s2 din septembrie, dacă mașina oprește la
  Zarojeni sub 20 s; (b) decizia dacă §6.1 permite un card pe sens când returul se oprește în mod regulat înainte de capăt.

## 4. R27 Sturzovca (+ rândul 727CWN, 14 %)

- Șase mașini fac legătura directă Sturzovca → poartă, cu opriri la Sturzovca și Sadovoe:
  - 727CWN: 23,8 / 23,4 (sept.);
  - 804MUM: 23,3 / 23,2;
  - 397VKV: 23,3 / 23,2;
  - 441ASB: 26,0 / 25,9;
  - 034BRAT și 402VKV (mai–iul.): 23,1 / 23,0.
- Mediana liniei pe septembrie: **23,7** (107 picioare).
- Varianta de 46,5 km din verdict-v3 vine din bucla 727CWN prin Sadovoe și satele R11. Pe `obs` sunt puține picioare («bucla» 3,
  «retur s1 R25 \| Hiliuti» 5), iar ele nu intră în km-ii cu oameni ai liniei.

**Poziția: card 23,7 × 3** (turele pe zi rămân cele măsurate în v4.2), adică 142,2 km/zi față de 149,4.
- Rândul 727CWN rămâne diagnostic: bucla prin Sadovoe (sat și R11, și R27) e serviciu R11 comasat, cum spune LEAR §4.7 («Rută fără
  mașină proprie ≠ rută nefăcută»). Nu se pune pe cardul R27.

## 5. R32 Trifănești

- **146BRAZ** doarme la Scăieni, lângă Izvoare. Oprește la Izvoare, Alexandrovca, Sevirova, Trifănești și Frumușica. Are două drumuri:
  - direct, Sevirova → Ivanovca → Mărășești: tur s2 35,3; retur s2 40,6;
  - returul s1 pe la Biruința → Alexăndreni (oprire) → Țipletești → **Putinești (oprire)** → Gura Căinarului → Sevirova → Trifănești:
    39,5 km.
- Deci și aici ruta lungă e împărțită: 146BRAZ face în aceeași cursă Putinești (R18) și Alexăndreni (R21 / R22).
- Mediana pe septembrie: 39,4 la tur, 40,6 la retur, adică **card 40,2 × 2 confirmat**.
- Satul Trifănești e deservit și de 041BRAU (R20 Nicolaevca, oprire la Trifănești în 45–47 din 45–47 de picioare) și de 302YEK
  (R32 \| Căinarii Vechi, tot drumul R32).

**Poziția: 40,2 × 2 rămâne, steagul se închide.** Cu o condiție: 518MHD iese din eticheta R32 (H1). Azi, `obs` are 48 de picioare 518MHD
«R32 \| Trifanesti» în septembrie (mediana 52,7). Ele umflă mediana liniei la 41,2 pe septembrie și la 51,7 pe toată fereastra.

## 6. R36 Bocancea Schit

- **224BZP** doarme la Catranîc. În ambele sensuri merge pe același drum: poartă → Bilicenii Vechi → Nicolaevca → Flămînzeni → Coșcodeni →
  **Bobletici** (ramură, oprire; la 36,5 km în linie dreaptă, cel mai departe) → înapoi la Coșcodeni → Flămînzeni → **Bocancea-Schit**
  (ramură, oprire) → Flămînzeni → Glinjeni → Catranîc (acasă).
- Turul de la 12:28 e oglinda lui. Opriri la Bobletici în 31–35 de picioare din 35 (toată fereastra).
- Km cu oameni în septembrie: tur 51,6 / 53,5 / 53,5 și retur 53,8 / 54,5 / 53,1. Mediana: **53,4** (23 de picioare).
- Varianta de 46,2 km (Claude, v3) scoate ramura Bobletici, deși acolo se urcă. Nu e drumul real.
- «8 din 9 retururi de noapte prin Bilicenii Vechi»: în septembrie, și turul trece prin Bilicenii Vechi, deci tur = retur.

**Poziția: card 53,4 × 1** (§6.3: septembrie are ≥ 3 zile bune). Cardul v3.1, 54,5 (+2 %), și cel al verificatorului, 54,0, stau în
±2 %. Accept și 54,0 dacă cealaltă parte cere metoda verificatorului. Steagul se închide.

## 7. Rândurile «capăt atins prin parcare»

| rând | ce arată GPS-ul | poziția |
|---|---|---|
| 348KAJ Zarojeni 52 % | Gura Căinarului pe toate picioarele; Zarojeni doar la tur (30 din 68), aproape niciodată la retur (2 din 96) | rămâne în listă, legat de M1 |
| 412BRAY Heciul Vechi\* 47 % | doar în mai (0 picioare în sept.); oprește la Putinești (R18) și Heciul Vechi (R22), 20 km cu oameni, etichetat R22 \| Țipletești\* | **iese din listă**: mașina nu mai e pe linie în fereastra de etalon a septembriei; nu afectează niciun card |
| 763LYY Prajila 26 % | în mai oprește la Putinești (16–23 de picioare), Gura Căinarului și Zarojeni sub R17; în sept. puține picioare (1–8), linia e dusă de 713IZX / 487NPL (Mărculești, Florești) | rămâne diagnostic; în runda 2 aduc drumul 713IZX pe Prajila |
| 727CWN Sturzovca 14 % | bucla prin Sadovoe / R11 | rămâne diagnostic; cardul R27 se ia pe serviciul direct (4) |

## 8. Precedentele de la celelalte uzine (servicii împărțite, bucle)

- **LEAR Ungheni §4.7**: «Comasare: A4 se face împreună cu A3, A7 împreună cu A6. Rută fără mașină proprie ≠ rută nefăcută.» Se aplică la
  R18 (Putinești în R32 / R17 / R22), la bucla 727CWN (R11 în R27) și la returul s1 al lui 348KAJ (R22 în R18).
- **LEAR Florești §4.4**: puncte de încărcare regulate care nu-s în act sunt «muncă a rutei, nu brambura»; bucla Soroca Nouă adaugă
  ~12 km pe sens. Se aplică la bucla D din Nihoreni și la ramura Bobletici.
- **LEAR Florești §4.2**: capătul fixat pe GPS acolo unde actul e vechi (A2). Nu se aplică aici: capetele din act sunt atinse.
- **SEBN §4.6**: «Rute buclă prin Orhei: tur ≠ retur e real, drumuri diferite — nu e greșeală». Se aplică la M1 (Zarojeni).
- **SEBN §4.2**: «startul real poate doar să lungească ruta». Varianta Florești de 52,9 km NU e un start real: acolo nu urcă nimeni.
- **Briceni §4.1**: «Capătul = satul cel mai depărtat în care mașina a oprit … o simplă trecere nu face capăt». Susține închiderea
  lui 52,9 (Florești) și M1 (Zarojeni fără oprire la retur).
- **LEAR Ungheni §6.5**: potrivire mare + raport ~1,9 = rută numărată dus-întors. La Bocancea, raportul ramurii Bobletici e real,
  cu oprire.

---

## Observații (rubrica comună)

**H1 — high, −2,0 (defect de logică, date): 518MHD e etichetat «R32 \| Trifanesti» pe drumul de acasă.**
- În `obs-ideal.json` (v4.2), 518MHD are 48 de picioare R32 în septembrie (tur 17, retur 31; km cu oameni 52,7). Pe urmă, drumul
  Izvoare → Florești nu are nicio oprire în satele R32: în 01–03.09 opririle sunt doar la Izvoare km 0 (acasă) și la Florești.
- Decizia v3 l-a scos din populația cardului R32. Eticheta a rămas însă, iar analiza săptămânală ia ruta și linia din `obs-ideal.json`
  (ION-107, `drax/cod/economie/etichete.mjs`).
- Scenariu: în săptămâna analizată, fiecare picior al lui 518MHD are ~17,5 km de drum spre / de la casă (Izvoare ↔ Florești) socotiți
  «cu oameni pe R32» în loc de livrare. La 2 picioare pe zi, ~35 km/zi lipsesc din R1a-ul mașinii și din pagina «Dorm / livrarea».
- Tot aici, mediana R32 pe toată fereastra iese 51,7 în loc de 40,2 dacă un pas din lanț uită să-l excludă pe 518MHD.
- Dovada: `drum2.txt` (518MHD R32 01–03.09: opriri «Izvoare@0.0 | Florești@21.6»), `med-out.txt` (518MHD R32 sept.: 52,7 / 52,7, 48 de
  picioare), `card-gps-raport.txt` (R32: «cursele lui 518MHD scoase din populație»).
- Corecția: în `etalon.mjs` / `decizii`, picioarele 518MHD fără oprire în satele R32 se etichetează R16 \| Floresti de la Florești, iar
  partea Izvoare → Florești e livrare. Test: 0 picioare 518MHD pe R32 în `obs`.

**M1 — medium, −1,0: R18 Zarojeni — retururile nu opresc la Zarojeni (2 din 96).**
- Cardul simetric de 28,9 pune pe retur ~5–7 km fără oameni.
- Nu e high: cardul e de referință, nu intră în R1a / R1b / R3.
- Corecția: proba minut cu minut pe 5 retururi s2 din septembrie, apoi decizia pe §6.1 (card pe sens) sau capătul returului =
  Gura Căinarului.

**L1 — low, −0,5:** la R36, regula §6.3 dă 53,4 (septembrie). Cardul 54,5 vine din v3.1, iar documentul nu spune de ce se păstrează
peste §6.3.

**Scor: 10 − 2,0 − 1,0 − 0,5 = 6,5. Blocante (high): 1 (H1).**

## Ce trebuie ca cealaltă parte să fie de acord
1. R3: acceptă că împărțirea pe grupă schimbă cardul cu 1 km/zi și închide steagul pe 44,2.
2. R16: acceptă proba «fără oprire în satele R32» (sau cere proba minut cu minut pe 3 dimineți 518MHD; o fac în runda 2).
3. R27: 23,7 pe serviciul direct al celor 6 mașini, bucla 727CWN ca R11 comasat.
4. R32: 40,2 plus H1 (eticheta 518MHD).
5. R36: 53,4 (§6.3) sau 54,0 (verificatorul), oricare din ele; 46,2 cade.
6. R18: rămâne cu steag până la proba minut cu minut a retururilor și la decizia pe §6.1.
