# ION-136 — runda 2: metoda după revizorul Claude (5/10)

Cod: vps/parcare.mjs (runda 1: vps/parcare-runda1.mjs). Rulare: vps/rulare-14.09-r2.txt. Scrierea: vps/scrie-parcare.mjs (probă: nicio mașină peste
ideal, nimic nefinit → nu scrie). Harta: vps/harta-zi.mjs (locurile și drumurile propuse ale zilei în lde_harta_zi.date.parcare).

## Triajul rundei 1 (business-logic-auditor, 5/10) — toate ACCEPTATE
1. CRITICAL preselecția «primii 10» rata locuri (912RNK Hiliuți + Cucioaia) → căutare COMPLETĂ: toți candidații la ≤ 15 km, toate perechile (~11 min/săpt.).
2. HIGH «propus ≥ ideal» negarantat → cota nopții ca ziua ideală (km reali ai jumătăților, altfel ½), pragul «același loc» 1,5 km (LOC_KM), iar golul fără
   km neobligatorii în ziua ideală (`intervale[].neobl = 0`: lângă uzină, între uzine, parc) sau cu ambele capete în zona uzinei (3 km) nu e drum de acoperit
   (altfel poarta EST ↔ VEST, 2,7 km, cerea un «loc» — găsit la rerulare). Probă la scriere: economia mașinii > idealul ei + 0,5 → nu scrie. 14.09: 0 mașini peste.
3. HIGH mașinile fără zile măsurate (024XKY, 293QVT, 386PKP, 549RNK) și lista separată → fără loc («nicio zi măsurată» / «în afara totalului»).
4. MEDIUM propunerea care nu scade nimic → fără loc, «rămâne cum e» (826GXP); al doilea loc: câștig ≥ 20 km/săpt. ADUS LA 5 ZILE și fiecare loc folosit la ≥ 3 drumuri
   (zile măsurate).
5. MEDIUM casa forțată → casa e candidat obișnuit; 912RNK / 760BXI nu mai primesc casa.
6. MEDIUM practic → preferință la scor apropiat (toleranță totală 20 km/săpt. adus): locul unde mașina deja stă ≥ 60 min (urma, ≤ 1 km) > oraș > sat.
   925FTI: P1 Fălești (oraș, ce a propus Ion) + P2 Ilenuța; 302YEK: Căinarii Vechi (deja). Pe hartă se spune că drumul șoferului spre casă nu e socotit.
7. LOW idealul comparabil fără lista separată → `idealSapt` null pentru mașinile separate; flota: 4.777,2.

## Plus (decizia lui Ion, 28.09, ION-120 «scoate regula 2 în general» = «rămâne la uzină» nu se propune)
Bălți (orașul) și parcul Bălți / zona uzinei (≤ 3 km de porți sau de parc) sunt candidați DOAR pentru mașina care deja stă acolo ≥ 60 min
(744ARF, 760BXI, 388ASB). Fără asta, P2 «Bălți» apărea la 925FTI, 912RNK, 830MUM ca «așteaptă la uzină».

## Rezultatul 14.09
Flota 4.470,8 km/săpt. (3.995,3 măsurat) față de ideal 4.777,2 (−6 %); 15 mașini cu două locuri; 17 peste 100 km; 0 peste ideal.
710CWN 534 Lazo; 518MHD 454 Florești; 925FTI 440 Fălești + Ilenuța; 345KAJ 291 Recea + Rîșcani; 457BRAX 285 Limbenii Vechi + Rîșcani; 912RNK 264
Cucioaia Nouă + Hiliuți; 302YEK 209 Căinarii Vechi + Baroncea; 447ASB 166 Danu + acasă (Ciuciulea); 826GXP rămâne cum e.
