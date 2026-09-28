# ION-124 — orașele din actul rutei sunt localități ale liniei: dezbaterea Claude + Codex, runda 1

## Ce a spus Ion (28.09.2026)
(830MUM, luni 14.09, pagina dădea 41 km economie pe zi) «probleme sunt mai multe: 1. Biliceni – Sîngerei e 8 km; 2. cel mai probabil auto are oameni din Sîngerei;
3. dacă are oameni din Sîngerei, Copăceni nicicum nu poate fi optimizat.» → «ok» la: regula nouă + refacerea lanțului (schelet → analiza săptămânii → cele 3 reguli →
ziua ideală) prin dezbatere + marcaj provizoriu pe pagină (făcut: 17561d85).

## Fapte (sesiunea, săptămâna 14–20.09)
- Ruta R19 din act: «Copăceni – Grigorăuca – Sîngerei – Bilicenii Vechi», angajați Copăceni 12, Grigorăuca 13, Sîngerei 69, Bilicenii Vechi 40. 830MUM: tura 1
  Bilicenii Vechi, tura 2 Copăceni, noaptea în Sîngerei (vestul orașului, 47,6439 / 28,1149). Urma 14.09: pleacă 05:30, traversează orașul spre est până la
  47,6255 / 28,1765 (05:43), se întoarce prin centru încet (9–22 km/h, 05:38–05:51 — urcări), iese spre vest 05:59, Bilicenii, uzina. Pagina scria
  «03:00–06:02 acasă (Sîngerei) → Bilicenii Vechi, gol, 17 km» și «16:14–00:23 Bilicenii Vechi → acasă (Sîngerei) → uzina, gol, 41 km».
- Regulile (reguli_livrare DRAXELMAIER_BALTI md5 84362bd7…): «orașe nu sunt sate: orașele și municipiile (OSM city/town) cu numele satului liniei, la ≤ 3 km —
  pe liniile Drăxlmaier Dondușeni, Cupcini, Rîșcani, Costești, Glodeni, Drochia, Florești, Mărculești, Biruința, Sîngerei, Fălești, Ghindești — și orice loc la ≤ 3 km
  de porți» (§5.1; §4.1 «nu fac capăt: … orașele din §5.1»).
- Angajați în aceste orașe, din act: R19 Sîngerei 69/134; R9 Glodeni 54/71; R3 Rîșcani 43/66; R16 Florești 42 + Mărculești 2 / 56; R23 Fălești 28/62; R21 Biruința
  26/114; R15 Drochia 21/43; R31 Ghindești 8/19; R8 Costești 4/15; R17 Mărculești 3/80; R1 Dondușeni 0/9. Total 300 din 1.710 (18 %).
- 18 mașini marcate provizoriu (orasPeLinie): 518MHD, 925FTI, 446ASB, 457BRAX, 345KAJ, 713IZX, 830MUM, 725CWN, 388ASB, 744ARF, 186OMM, 402VKV, 715IZX, 435ASB,
  350KAJ, 293QVT, 763LYY, 024XKY.
- Precedent: ION-112 r7 (Nihoreni) — bucla D prin Rîșcani după capăt e deja în card; staționarea din Rîșcani-Vest înainte de capăt a fost tratată ca «așteptare,
  oraș, nu capăt» (§4.1); Ion întrebase dacă Rîșcani-Vest e pornirea reală.

## De hotărât
1. Regula: orașul din actul RUTEI, cu angajați > 0, e localitate a liniei: oprirea acolo (urcare / coborâre, §4.5) e cu oameni, orașul poate fi capătul liniei
   (§4.1). Condiții: doar pe rutele unde e în act? și «orice loc la ≤ 3 km de porți» (Bălți) rămâne exclus? Cum deosebim urcarea din oraș de casa șoferului
   (830MUM doarme în Sîngerei) și de staționarea lungă (așteptare)?
2. Scheletul: pe ce linii se schimbă capătul / km-ii (orașul dincolo de capătul de azi: R19 Bilicenii → Sîngerei; R3 Nihoreni → Rîșcani; altele?) și cum se
   măsoară (lanțul ideal-v4.3: etalon.mjs, CAPETE_GPS, regula satelor în ordine); verificatorul, registrul, poarta.
3. Analiza săptămânii: bucata prin oraș cu urcări = cu oameni (nu livrare / gol de acasă); efectul pe categorii, R1a/R1b, cele 3 reguli, ziua ideală; probe.
4. Ordinea de lucru și ce se poate livra întâi fără a rupe restul.
