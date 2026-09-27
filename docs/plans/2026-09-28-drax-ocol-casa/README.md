# ION-115 — ocolul pe acasă = cât lungește casa drumul (880RNK)

Ion, 27.09: «880RNK e din Pelinia, toate turele din Pelinia — de ce are de optimizat?»

Cauza: §5.2 număra drept «ocol pe acasă» TOȚI km GPS peste drumul cel mai scurt din Valhalla. La 880RNK casa e chiar locul de unde pleacă
cursa următoare, deci casa nu adaugă nimic. Cei 17 km/zi erau drumul obișnuit al șoferului (≈ 26 km, ca și cursa cu oameni, față de
17,4 în Valhalla) plus un ocol de ≈ 8 km prin Bălți (14.09, 06:53–07:23).

Regula nouă (VPS `drax/cod/economie/categorii.mjs`, copie în `vps/`; migrația 416, §5.2 + §8.2):
ocol = Valhalla(sfârșit → casă) + Valhalla(casă → început) − Valhalla(sfârșit → început), cel mult km GPS peste direct × 1,05.
Restul rămâne gol pe rută / legătură, cu motivul «… km peste drumul cel mai scurt, nu din cauza casei».

Săptămâna 14.09, toată flota (`masurare-flota.mjs`, apoi rândul rescris): R1b 4.136 → 2.532 km.
880RNK 113,5 → 5,6 · 715IZX 143,8 → 3,7 · 206BZP 140,3 → 17,6 · 925FTI (casa în Sărata Veche) 372,9 → 350,5.
Probele P1–P10 trec, bilanț 195/195. Rularea automată de luni rămâne oprită (ION-112).
