# ION-124 — runda 6: triajul Codex r5 (r5/codex-runda-5.json: 7,0 fail — C1 high, C2 medium — ACCEPTATE)
- C1 (odihna căutată doar în fereastră): prelungesteCurse separă limitele GOLULUI întreg (ga / gb = sfârșitul cursei dinainte / începutul cursei următoare) de
  fereastra de selecție (± 45 min): locurile de odihnă ≥ 20 min excluse la ≤ 0,4 km se caută pe ga–gb, opririle candidate doar în a–b (r6/vps/categorii.mjs).
  P12 +2: cazul Codex (odihnă la A 20–45 min, opriri la 60/70/80 cu prima la A, tur la 100 → neprelungit) și simetricul la retur (coborâri la 20/30/40, prima la locul
  odihnei de 55–80 → neprelungit). P12 17/17; simularea 14.09 pe datele reale: neschimbată (7 prelungiri, bilanț 195/195).
- C2 (dovezi): r6/final2.json — sha-urile codului (categorii 3ac65b69…, probe 5bbc596e…, patru-reguli dcd36b86…) și intrarea (economie-zile, snapshotul scheletului);
  pe cele 18 mașini: ziua ideală măsurat ȘI extrapolat, R1a și R1b înainte / după; flota: R1a 4.852,4 → 4.833,9, R1b 2.713,1 → 2.690,5, 3 reguli 3.241,1 → 3.218,5.
  Reconcilierea: pe cele 18 mașini scăderea MĂSURATĂ e 3.240,1 → 3.174,9 = 65,2 = scăderea flotei 5.489,1 → 5.423,8 (65,3, rotunjire); cei 90,5 din runda 5 erau
  EXTRAPOLAȚI pe zilele fiecărei mașini (830MUM: 3 zile măsurate din 5 → 121,4 măsurat = 202,3 extrapolat). 744ARF lipsește din P9 pe R19: P9 ia doar livrarea spre
  PRIMA cursă a zilei, iar la 744ARF prima cursă e R13 Hăsnășenii Noi (tura 1); R19 Bilicenii e tura 2 (zilele listate în final2.json).
Întrebarea pentru Codex: C1, C2 închise? ceva blocant înainte de scriere; scor; high doar cu scenariu concret.
