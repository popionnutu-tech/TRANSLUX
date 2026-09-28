# ION-119 — runda 2 (triajul observațiilor Codex r1)
Codex r1: 5,0 fail, 2 high. Toate ACCEPTATE și reparate (vps/categorii.mjs, vps/probe.mjs, vps/categorii.diff față de .bak-ion119):
- C1 (high) ACCEPTAT: «stă ≥ 1 min» măsura durata vizitei în raza porții, deci și trecerea în mers. Acum detectorul e funcția pură `drumuriIntrePorti(mv)`
  (exportată); minutul = staționare EFECTIVĂ: suma pașilor sub 8 km/h (distanța / timp între puncte consecutive) + punctele de parcare (stat, t1) din raza
  porții + 0,3 km. Excepția păstrată separat: mișcarea începe în poarta A (cursa de dinainte s-a terminat acolo) sau se termină în poarta B (cursa următoare pleacă de acolo).
- C2 (high) ACCEPTAT: la mișcarea mixtă, porțiunea între porți se ia întâi din km-ii bucății, apoi din golul ei impus (5.3 a); bucata rămâne cât are
  gol impus > 0; bilanțul se păstrează (golul impus luat trece în intreUzine).
- C3 (low) ACCEPTAT: proba P11 în probe.mjs, sintetică, pe funcția reală: 925FTI VEST → EST (începe la VEST, stă la EST) «VEST → EST»; trecere în mers
  prin ambele porți «»; dus-întors «EST → VEST, VEST → EST»; 70 min parcat între porți «»; ieșire din zonă între porți «». P11 pică → exitCode 3 (lanțul
  se oprește; verificat: prima variantă a probei, greșită, a oprit simularea).
Proba pe 14.09 după reparații (simulare, nimic scris): cuOameni 27.676,3 neschimbat · intreUzine 1.876,9 (333 de drumuri; înainte 2.751,6 / 393 — trecerile în
mers au ieșit) · golRuta 5.267,2 · legătură 7.817,8 · parc 712,8 · golTure 705,7 · livrare 9.614,0; bilanț 195/195 (max 0,3 %); P11 5/5; R1b 2.713,1 neschimbat;
B 8.109,8. 925FTI: 14:32–15:52 VEST → EST 7,1 km în fiecare zi; dimineața EST → VEST 3,7; seara VEST → EST 3,3–3,4.
Migrația 418 actualizată (staționare efectivă; ≈ 1.880 km, ≈ 330 de drumuri).
Întrebare: C1–C3 închise? alte observații pe cod, cu dovadă?
