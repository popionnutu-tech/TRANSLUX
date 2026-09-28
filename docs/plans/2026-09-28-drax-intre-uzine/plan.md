# ION-119 — drumul VEST ↔ EST = cursă între uzine (Ion, 28.09.2026)

Ion (despre 925FTI, «14:32–15:52 pe lângă uzină, gol, 7 km»): «from vest to east and vice versa is trip between factories also for work, please switch
from empty to trip between factories». Urma 925FTI 14.09: 14:31–14:33 la poarta VEST (lasă oamenii turului Năvîrneț), 14:33–14:43 merge 5,5 km prin Bălți
(Valhalla VEST→EST 5,42 km) la poarta EST, stă 67 min, 15:52 pleacă returul Ilenuța din EST. Zilnic, 5/5.

## Regula implementată (vps/categorii.diff; categoria nouă `intreUzine`)
- Pe fiecare mișcare fără oameni (grup de bucăți cu același interval): vizitele în porți (raza porții + 0,3 km). A → B (A ≠ B) e cursă între uzine când:
  mașina e LA A (stă ≥ 1 min acolo SAU mișcarea începe acolo — cursa de dinainte s-a terminat la A), toate punctele dintre A și B sunt în zona uzinei
  (≤ 3 km de porți / parc), durata ≤ 40 min, și e LA B (stă ≥ 1 min SAU mișcarea se termină acolo — cursa următoare pleacă din B).
- Mișcarea toată în zonă și ≤ 11 km (2 × 5,4 km) → toată e cursă între uzine; altfel doar porțiunea A → B, scăzută din bucățile mișcării în ordinea:
  gol pe rută, legătură, parc, gol între ture (și din km-ii ei din zonă), deplasare, necunoscut, service, livrare, ocolul pe acasă ultimul.
  Golul impus (5.3 a) intră în total la mișcarea întreagă; bucata cu gol impus nu se șterge.
- Nu e gol și nu e economie: rândul săptămânii o scrie separat (km.intreUzine, bucăți cu `porti`); pagina: «poarta VEST → poarta EST, cursă între uzine, 7 km»;
  la mișcarea mixtă «…; plus 3 km cursă între uzine (poarta VEST → poarta EST)», neinclus în «km goi».
- Migrația 418: §5.11 în reguli (text în packages/db/migrations/418_lde_drax_cursa_intre_uzine.sql).

## Proba pe săptămâna 14.09 (simulare, nimic scris)
- Categorii înainte (ideal-v4.3): cuOameni 27.676,3 · livrare 9.634,7 · golRuta 5.948,4 · golTure 916,2 · parc 842,3 · legătură 8.653,0.
- După: cuOameni 27.676,3 (neschimbat) · livrare 9.563,4 · golRuta 4.909,2 · golTure 625,0 · parc 698,9 · legătură 7.447,3 · **intreUzine 2.751,6**.
- 393 de drumuri pe săptămână; km: < 4 → 90, 4–6 → 12, 6–8 → 215, 8–11 → 46, ≥ 11 → 30. Porțile: EST → VEST → EST 176, VEST → EST 111, EST → VEST 27, restul cu 3–4 treceri.
  Contextul (cursa de dinainte → cea de după): tur → retur 107, tur → tur 81, retur → retur 73, restul cu linii diferite.
- Bilanț 195/195 (abatere max 0,3 %); P1–P10 trec; R1b 2.713,1 și R3 neschimbate; B 8.114 → 8.099 (−15, livrarea din mișcările cu drum între porți).
- Varianta fără plafonul de 11 km dădea 3.570,6 (mișcări lungi prin zonă cu o singură trecere); varianta strictă (oprire ≥ 1 min la ambele porți,
  fără contextul cursei) dădea 71 km și rata chiar cazul lui 925FTI (la VEST oprirea e în cursa care se termină acolo).

## Întrebări pentru critic
1. Pragurile (≥ 1 min la poartă, ≤ 40 min, plafonul 11 km pentru mișcarea întreagă) — potrivite? contraexemple pe date?
2. EST → VEST → EST în aceeași mișcare (176/săpt.): corect ca muncă (Ion: «și invers»)?
3. Ordinea din care se scade porțiunea la mișcarea mixtă — afectează economia (R1a/R1b/R3) greșit?
