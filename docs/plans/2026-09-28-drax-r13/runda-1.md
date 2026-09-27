# Drăxlmaier — liniile fără km în schelet (R13 întâi): dezbaterea Claude + Codex, runda 1 (ION-111, 27.09.2026)

Ion: «lansează Claude Codex în găsirea soluției». Problema: R13 (Lazo – Hăsnășenii Noi – Dobrogea Veche) n-are km în ideal-v4.1
(activ, VPS `/root/lde-worker/drax/date/ideal-v4.1/`), deci 744ARF (care o face zilnic, recunoscută după opriri din ION-109) iese din
măsurare («linie fără etalon»). La fel R18 Putinești și R27 Iabloana (C31 în registrul verificatorului). Regulile (text 26.373, md5
56dfde04, după migr. 413): §6.1 scheletul liniei = un drum, tur = retur; §6.2 km = mediana zilelor BUNE (urma ajunge la capăt în ambele
sensuri, tur/retur ≤ 18 % unul de altul); §6.3 sursa septembrie ≥ 3 zile bune, altfel toată fereastra; §1.3 km-ii din act NU se folosesc.

## Faptele (obs-ideal.json v4.1, fereastra 04.05–17.07 + 01.09–25.09; curse-ideal.json)
R13 Hasnasenii Noi — 69 de observații:
| sens | schimb | n | plin median | din sept. | mașini |
|---|---|---|---|---|---|
| tur | s2 | 24 | 8,9 km | 8 | 744ARF 20, 293QVT/346KAJ/549RNK/727CWN câte 1 |
| tur | fără schimb | 11 | 10,5 | 2 | 744ARF |
| retur | s1 | 11 | 8,8 | 2 | 744ARF |
| retur | fără schimb | 23 | 10,5 | 8 | 744ARF 19 + 4 câte 1 |
Deci 744ARF face R13 în AMBELE sensuri, dar pe schimburi diferite ale aceleiași zile (sosește ~14:40 cu schimbul 2, pleacă ~15:40 cu
schimbul 1): perechea «pe același schimb» (etalon.mjs, candidatele) nu există niciodată → «nicio candidată». Săptămâna 14.09: tur zilnic
~06:05 (s1) cu 4–5 opriri de urcare în Hăsnășenii Noi (+ Dobrogea Veche), retur rar.
Curse brute care trec prin Hăsnășenii Noi (toată fereastra): 710CWN 118 de la poartă + 114 spre poartă (etichetat Dominteni — verificatorul
l-a pus pe lista «capăt atins prin parcare», Dominteni 45 %, «Lazo, Hăsnășenii Noi (R13)»); 744ARF ~89; 043BRAU 51; 727CWN 7.
R18 Putinești — 16 observații (tur s1 7: 397VKV, 804MUM; retur s1 4: 763LYY; …), 407 curse brute prin Putinești (348KAJ, 763LYY, 146BRAZ).
R27 Iabloana — 5 observații (441ASB, 348KAJ, 487NPL), 161 curse brute prin Iabloana (441ASB 121).

## Variante de discutat (nu e o listă închisă)
(V1) Pereche «încrucișată»: turul și returul aceleiași linii, aceeași mașină, aceeași zi, pe schimburi diferite = zi bună pentru etalon (§6.2
cu «aceeași zi» în loc de «același schimb»), dacă km-ii se potrivesc (≤ 18 %).
(V2) Etalon doar din tururi (tur = retur, §6.1) când linia n-are retururi — mediana plinului pe tururile cu opriri în satele liniei.
(V3) Reatribuirea curselor care deservesc satele R13 dar sunt etichetate pe altă linie (710CWN/Dominteni, 043BRAU) — clasa «capăt prin
parcare» (runda 2 ION-110: doar diagnostic, fără excludere automată).
(V4) Linia rămâne fără km, dar ziua mașinii se măsoară pe celelalte componente (R1a, R1b) fără R3 pe acea linie.

## Ce se cere
Pe V1–V4 (și altele): DA / NU / steag cu dovadă GPS; ce se schimbă în lanțul scheletului (`/root/lde-worker/drax/cod/ideal-v4.1/etalon.mjs`,
`alege.mjs`, `card-gps.mjs`), în analiza săptămânală (`drax/cod/economie/alternative.mjs:exclusDe`) și în textul regulilor (migrație);
cum se verifică (verificatorul, registrul C31). Scor după rubrica comună; high doar cu scenariu + dovadă.
