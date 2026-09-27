# Verificarea 16 — Drăxlmaier ideal (candidat ideal-v4.3, re-sigilat după runda 7) — 2026-09-27

Starea: RUN `/home/verif/verificator/rulari/drax-v16-1790540926` · drax.mjs v5 `1be43dc0b57b` · ruleaza.sh `a26fad56be25` · node v20.20.2, Intl Europe/Chisinau ·
verif_src `/root/lde-worker/drax/date/ideal-v4.3` · schelet-ideal.json `71ee45596d35` (536.751 B) · registru `da3890def3b3` (6.264 B, 5 intrări) ·
verdict.json `c41b93218305` · SIGILIU manifest `6e32a372bc4e` · **INCHIS ok** (manifestul final = inițial) · proba R1 **ok** · proba registru **ok**.
reguli_livrare_la 2026-09-27 18:22:08 UTC, md5 ce930b08… (verificat pe text, fără ultimul `\n`); textul migr. 417 (md5 8c6ad18b…, verificat) neaplicat.
Unități: 51 linii din act (49 cu ideal, 2 fără: Putinești, Iabloana) + 6 linii `*` · 49 mașini · 13.695 observații cu rută · 13.476 deplasări cu rută · 27.644 deplasări brute.

**valid_pentru_export: true** — 176 constatări: 157 informative, 14 abateri, 5 blocante, toate 5 explicate, 0 blocante neexplicate.

## Blocante (neexplicate)
Niciunul.

## Explicate (registru, semnate pe 71ee4559…)
| id | linie | cifra | verificat |
|---|---|---|---|
| C31 | R18 Putinești | candidate 0 | D7: 7 obs., 763LYY 4 / 146BRAZ 1 / 731ARF 1 — coerent |
| C31 | R27 Iabloana | candidate 0 | D7: 5 obs., 441ASB 2 / 348KAJ 2 / 487NPL 1 — coerent |
| G1 | R18 Zarojeni | card 28,9 / GPS 32,1 (10,0 %, 4 zile) | intrările GPS identice cu v15 → cifrele textului rămân cele reproduse în v15 |
| E1 | R18 Zarojeni | C47 35 % (6/17) | idem |
| E1 | R3 Nihoreni | variante 42,3 / 45,8 | **reprodus pe v16**: D tur 45,7 (n14) / retur 45,3 (n15), EZ tur 41,0 (n16) / retur 42,2 (n9); (45,5 + 41,6)/2 + 0,65 = 44,2; bucla D 22.09: Nihoreni@45,0 → Rîșcani@46,9 / 51,4 |

## Nou față de v15 și de control-ideal.log
- `compara.mjs` v15 → v16: **zero diferențe de km** pe toate liniile (card 5.667 → 5.667 km/zi, GPS completat 5.668 → 5.668); card ≠ etalon pe aceleași 3 linii (Zarojeni −3,2, Nihoreni +1,9, Bocancea Schit −0,7 = 1,3 %, sub prag).
- În intrări s-au schimbat doar 3 sha: schelet (motivul R3 în metadate), registrul (re-semnat), decizii. Controalele identice cu v15; au dispărut cele 5 abateri X1 (registru pe sha vechi) și cele 5 blocante au trecut în «explicate».

## Linie cu linie — din act
Toate 49 liniile cu ideal au etalon GPS (≥3 zile bune), G1 ≤5 % sau explicat, C47 ≥60 % sau explicat. Detaliul complet e în `judecata.json`. Abaterile:
| rută | linie | verdict | abatere | corecție |
|---|---|---|---|---|
| R3 | Nihoreni | abatere (explicat) | E1 variante 42,3/45,8; C47 60 %; card 44,2 × 2 | nimic |
| R18 | Zarojeni | abatere (explicat) | G1 10,0 %, C47 35 %, D6 eșantion mic | nimic acum; remăsurare faza B |
| R9 | Cobani | abatere | D1: act EZ+D → sursa doar s1, total neclar | întrebare (fără km) |
| R20 | Nicolaevca | abatere | D1: act EZ+D → sursa ambele, total neclar | întrebare (fără km) |
| R32 | Trifănești | abatere | D1: act D → sursa doar s1, total neclar; C42 2 vs act 1; C47 72 % | întrebare (fără km) |
| R19 | Bilicenii Vechi | abatere | D1 sursa ambele / total rotație; D2 3 săptămâni-bloc | nimic |
| R27 | Sturzovca | abatere | D2 izolat 1 zi; C42 2 vs 1; C47 64 % (39 picioare pe altă poartă) | nimic |
| R32 | Căinarii Vechi | abatere | D2 izolat 1 zi (din 14) | nimic |
| R6 / R25 / R37 | Mihăilenii Vechi / Hiliuți / Musteața | abatere | C22: ziua desenată nu e zi bună GPS (etalon 54,9 / 32 / 60,2) | nimic (doar harta) |

## Linii * 
Cupcini*, Drăgănești*, Heciul Vechi*, Țipletești*, Bilicenii Vechi*, Fundurii Noi* — neverificabil (fără ideal); Fundurii Noi* V5 «0 săptămâni complete» = date insuficiente.

## Pe flotă
- 880RNK: C4 «sigur» 7 zile (dispozitive 2402/2478), efect măsurat nul pe R12 Sofia/Pelinia → nu blochează.
- Salturi între porți: 7.731 deplasări, 0 atribuite liniilor (744ARF 16 zile; 346KAJ, 412BRAY, 348KAJ, 350KAJ câte 1).
- C37: 713IZX=763LYY pe Prajila 4 % (sub 50 %). D7: 212 observații fără schimb (geamăn rt 113, goală 36, rest 59 → F4).
- C47 total 93,5 %. C5: fereastra ⊂ EEST; se blochează automat dacă datele trec de 25.10.2026.
