# Biodiesel: idealul fiecărui traseu (dezbatere Claude + Codex, ION-69)

## De ce
Ion, 27.09: «надо определить идеальные поездки … по каждому маршруту идеальную поездку и через какую таможню, как она должна произойти», apoi un schelet preliminar, fără deploy. Criteriul rămâne cel din 25.09: **km minimi pe drum permis unei cisterne ADR**. Vama contează ca «parcursă» dacă o cisternă a noastră a trecut-o măcar o dată.

## Ce facem
Pentru fiecare traseu de biodiesel propunem **o cursă ideală**: punctele obligatorii, vămile, drumul (orașele), km și timpul de mers. Idealul e ruta Valhalla `truck` + `hazmat:true` + `use_ferry:0`, cu via-points `through` (radius 300 m) în punctele obligatorii și în vămile alese. Dintre seturile de vămi parcurse de flotă se ia cel mai scurt. Separat se dă **varianta sigură**: pe drumurile mari mersese deja (Jitomir, Vinița, Bălți, Chișinău), fără ocolurile prin baze.

Variante respinse:
- **Idealul = cea mai scurtă cursă reală.** Sunt 0–5 curse pe traseu, toate cu ocolul prin terminal pe magistrală și cu popas de 1–3 zile la baza din Briceni sau Edineț, deci nu arată un drum bun.
- **Idealul fără terminal.** Ion, 27.09: terminalul de export e obligatoriu.

## Catalogul traseelor (Ion, 27.09)
| Cod | Traseu | Capăt | Curse reale (13 cisterne, 09.2025–09.2026) |
|---|---|---|---|
| B1 | Berdichev → Constanța | Valu lui Traian (44.1400, 28.4675), unde se opresc 3 din 5 curse, 9 h | 5 |
| B2 | Berdichev → Sofia | Novi Iskar (42.8187, 23.3686), 5 din 6 curse, 12–17 h | 4 |
| B3 | Berdichev → Sofia prin ZEL Ungheni | Novi Iskar | 2 |
| B4 | Berdichev → Ruse | zona industrială de la pod (43.877, 26.020), Ion 27.09 | 0 |
| B5 | Berdichev → depozitul Briceni | Bază Briceni (48.3535, 27.1013) | 2 |
| B6 | Berdichev → depozitul Chișinău | Meșterul Manole (47.0126, 28.8899), Ion 27.09 | 0 (2 curse în Chișinău: Bacioi, Bubuieci) |
| B7 | Berdichev → Constanța prin ZEL Ungheni | Valu lui Traian | 0 |

## 🔬 Verificat pe viu
| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Terminalul de export e pe drum | `terminal.mjs`: opririle din raza de 3 km a «Vamă/terminal nord Berdichev» (50.61, 27.59, lângă Zviahel) în fiecare cursă | 16 din 22 de curse trec pe acolo și stau 2–17 h. Singura cursă fără terminal (LJN076, 17.09) a ajuns la Otaci în 224 km | Punct obligatoriu (Ion) |
| Pe unde se intră UA→MD | `briceni.mjs`, schimbarea țării pe puncte GPS consecutive | Otaci: 19 din 20; Mămăliga–Criva: 1; Rososeni–Briceni: 0 | Doar Otaci în ideal (Mămăliga dă +36…83 km, `briceni-ruta.mjs`) |
| Pe unde se iese MD→RO | `coridoare.mjs --marfa=biodiesel` | Giurgiulești: 5 curse de biodiesel (+129 de motorină); Albița: 6 (+86); Costești: 1. Albița→Ruse/Sofia: 5 din 6 curse spre Sofia | Seturile candidate |
| RO→BG | aceeași sursă | Toate cele 6 spre Sofia trec podul Giurgiu–Ruse. Niciuna nu folosește Calafat–Vidin | Singura trecere RO–BG |
| Km reali pe o direcție | `computeDay` pe GPS brut (potrivirea pe hartă umflă biodieselul cu ~8 %) | B1 1.332–1.367 km; B2 1.433–1.829; B3 1.741–1.831; B5 313–654 | Pierderea față de ideal |
| Unde se pierd km azi (HMK139, B1) | `drum-cursa.mjs`, opririle în ordine | Berdichev → terminal 226 km, stă 2,2 h. Terminal → Otaci 356 km (înapoi prin Jitomir, Berdichev, Vinița). Stă 29 h la Edineț. Otaci → Chișinău → Giurgiulești ~450 km. ~7 h la vama Giurgiulești. Giurgiulești → Slobozia → Fetești → Constanța ~240 km | Unde e economia |
| Harta are cele 4 țări și profil ADR | smoke Valhalla 3.9.0 pe mini | Berdichev→Constanța 837 km, Chișinău→Sofia 867 km, Constanța→Briceni 749 km (fără terminal) | Router |
| Router cu bac | `depanare6.mjs` | Cu bac trece Dunărea la Isaccea–Orlivka prin UA, ceea ce nu face nicio cisternă. `use_ferry:0` | Fără bac |
| **Neverificat:** restricții de tonaj pe drumurile regionale UA (Dovbîș–Romaniv–Liubar) | — | OSM nu le are sigur; UA are restricții sezoniere pe drumurile regionale | **Rezervă:** varianta sigură pe magistrala Jitomir–Vinița (+~130 km) |
| **Neverificat:** motivul popasului la baza Briceni/Edineț (1–3 zile) și al trecerii prin Chișinău | — | Nu se vede în GPS | Idealul nu îl include; varianta sigură nu îl include; se întreabă dispecerul |

## Pași: idealul propus pe traseu
Toate idealurile încep la Berdichev, urcă la terminalul de export (Zviahel) și intră în Moldova prin Otaci.

| Cod | Vămi | Drumul ideal (orașe) | Ideal km / ore de mers | Alternativă | Real km azi |
|---|---|---|---|---|---|
| B1 | Otaci → Giurgiulești | terminal → Dovbîș → Romaniv → Liubar → Moghilău/Otaci → Soroca → Orhei → Stăuceni → Hîncești → Cimișlia → Comrat → Giurgiulești → Galați → Brăila → Slobozia → Fetești → Cernavodă → Medgidia → Valu lui Traian | **1.149 / 21,2 h** | sigur 1.277 | 1.332–1.367 |
| B2 | Otaci → Albița → Giurgiu | … Otaci → Dondușeni → Bălți → Bucovăț → Leușeni/Albița → Huși → Bârlad → Tecuci → Focșani → Buzău → Giurgiu → Ruse → Veliko Tărnovo → Sevlievo → Iablanița → Novi Iskar | **1.526 / 26,6 h** | prin Giurgiulești → Giurgiu: 1.559; sigur 1.675 | 1.433–1.829 |
| B3 | Otaci → ZEL Ungheni → Albița → Giurgiu | … Otaci → Bălți → Fălești → Ungheni (ZEL) → Huși → … ca B2 | **1.509 / 26,7 h** | — | 1.741–1.831 |
| B4 | Otaci → Albița → Giurgiu (pod) | ca B2 până la podul Ruse | **1.185 / 20,4 h** | prin Giurgiulești: 1.218 | — |
| B5 | Otaci | … Otaci → Frunză → Briceni | **527 / 10,6 h** | — | 313–654 |
| B6 | Otaci | … Otaci → Soroca → Orhei → Stăuceni → Chișinău (Manole) | **676 / 13,6 h** | — | — |
| B7 | Otaci → ZEL Ungheni → Albița | … Bălți → Fălești → Ungheni → Huși → Bârlad → Tecuci → Buzău → Slobozia → Fetești → Constanța | **1.193 / 21,3 h** | prin ZEL → Giurgiulești: 1.217 | — |

Observații:
- B2 și B4 prin Albița sunt mai scurte decât prin Giurgiulești cu ~33 km. B7 prin ZEL și Albița iese cu 24 km mai scurt decât prin ZEL și Giurgiulești.
- Bucata Moldovei din ideal (Soroca → Orhei, respectiv Bălți → Leușeni) nu e mersă de cisternele de biodiesel, dar e mersă de cele de motorină (Chișinău–Hîncești–Cimișlia–Comrat).

## Fișiere
Pe mini: `~/dev/camioane-schelet/marshruty2.mjs` → `date/marshruty-bio-r2.json` (profil 40 t, matrice de vămi, fără bac, alternativa pe magistrale). **Aceasta e sursa scheletului preliminar**; `marshruty.mjs`/`marshruty-bio.json` sunt runda 1, depășite. Nimic în bază, nimic în admin, niciun deploy. Scheletul preliminar e o secțiune în Artifact-ul privat existent.

## Riscuri
- **Drumurile regionale ucrainene după terminal (Liubar):** rezerva e varianta sigură prin Jitomir–Vinița.
- **Capetele sunt din GPS** (Valu lui Traian, Novi Iskar) sau puse de Ion (Ruse, Manole). O schimbare de capăt mută idealul cu câțiva km.
- **B3 și B7 au 2, respectiv 0 curse.** Idealul lor e numai pe hartă.

## Verificare
- Fiecare ideal trece la ≤ 300 m de fiecare punct obligatoriu (terminal, vămi, ZEL).
- Idealul nu trece prin țări în plus față de setul de vămi.
- Km ideal < km reali pe fiecare traseu cu curse reale.

---
## Critic extern - runda 1
Codex a raportat scorul 2.0; din greutăți ar ieși −1.0, iar transportul a semnalat inconsistența. Verdict: fail (C1, C2 high).

| id | severitate | esență | decizie | motiv / unde e închis |
|---|---|---|---|---|
| C1 | high | Routerul nu minimizează km (profil implicit = timp); B3 1.509 < B2 1.526 cu aceleași vămi | **Acceptat** | `marshruty2.mjs`: `shortest:true` și, în plus, minimul dintre shortest și rapid. B6 arată de ce: shortest 683 > rapid 673. B2 fără ZEL se compară acum cu tot coridorul (matricea de mai jos) |
| C2 | high | Profil generic 21,77 t; cisterna încărcată are ~40 t | **Acceptat** | Profil `weight 40, axle_load 10, height 4.0, width 2.55, length 16.5, hazmat`. E maximul standard UE, de confirmat de Ion. Restricțiile care lipsesc din OSM și cele sezoniere din UA rămân «neverificat» (vezi Riscuri) |
| C3 | medium | Matrice de vămi incompletă (Costești, Albița pentru B1, Mămăliga doar pentru Briceni) | **Acceptat** | Matrice completă pe fiecare traseu: intrare {Otaci, Mămăliga} × ieșire {Giurgiulești, Albița, Costești} (+ Giurgiu pentru BG) |
| C4 | medium | «Sigur» nedovedit | **Acceptat** | Redenumit «alternativă pe magistrale (cel mai rapid), de verificat», pentru fiecare traseu |
| C5 | medium | Vămi = medii GPS; `use_ferry:0` nu interzice bacul | **Acceptat, confirmat pe viu** | Vămile sunt lipite de postul OSM `border_control` (0,37–1,4 km). `shortest` IGNORĂ `use_ferry:0`: B1 și B7 treceau cu bacul Isaccea–Orlivka (45.2911, 28.4585) și cu bacul de la Galați (45.4164, 28.0337). Acum fiecare bac se exclude cu un poligon și ruta se recalculează; `has_ferry=false` e verificat |
| C6 | medium | «ideal < real» fals pentru B2/B5 (curse fără terminal) | **Acceptat** | Se compară doar cu cursele cu terminal și aceleași vămi |

## Runda 2: idealul recalculat (km minimi, 40 t ADR, fără bac, matrice completă)
| Cod | Ideal: vămi | km / ore | Drum | Alte seturi de vămi (router) | Istoric real cu terminal (vămile lui) |
|---|---|---|---|---|---|
| B1 | Otaci → Albița | **1.114 / 24,0** | terminal → Liubar → Vinița → Otaci → Bălți → Ungheni → Huși → Murgeni (DN26) → Galați → Brăila → Măcin → Medgidia | Otaci → Giurgiulești 1.149 / 21,6 (shortest prin Giurgiulești: 1.126) | Otaci→Giurgiulești: 1.332–1.367 (5) |
| B2 | Otaci → Costești → Giurgiu | **1.449 / 30,7** | … Otaci → Rîșcani → Costești → Iași (Podu Iloaiei) → Roman → Bacău → Focșani → Buzău → București → Giurgiu → Ruse → Pleven → Novi Iskar | același set 1.482 / 25,9; Otaci → Albița → Giurgiu: 1.465 shortest / 1.513 rapid | Otaci→Albița→Giurgiu: 1.791, 1.829 (2) |
| B3 | Otaci → ZEL → Albița → Giurgiu | **1.465 / 30,5** | … Otaci → Glodeni → Fălești → Ungheni (ZEL) → Huși → Bârlad → Buzău → București → Giurgiu → Ruse → Pleven → Novi Iskar | 1.496 / 26,7 | 1.741, 1.831 (2) |
| B4 | Otaci → Costești | **1.126 / 24,5** | ca B2 până la podul Ruse | 1.153 / 19,7; Otaci → Albița: 1.142 | — |
| B5 | Mămăliga | **522 / 11,6** | terminal → Șepetivka → Kameneț → Hotin → Lipcani → Briceni | Otaci 525 / 10,4 | Otaci: 654 (1) |
| B6 | Otaci | **673 / 13,4** (rapid < shortest) | … Otaci → Soroca → Orhei → Stăuceni → Chișinău | — | — |
| B7 | Otaci → ZEL → Albița | **1.114 / 24,5** | … Otaci → Fălești → Ungheni (ZEL) → Huși → Murgeni → Galați → Brăila → Măcin → Medgidia | 1.192 / 21,3; prin ZEL → Giurgiulești: 1.129 | — |

Observații pentru runda 2:
- **Costești** (B2, B4) e trecerea peste barajul Stânca–Costești. A trecut-o o singură cisternă de-a noastră, IIC263 în 12.2025, deci după regula lui Ion e «parcursă». Nu știu dacă barajul are o limită de tonaj pe care OSM n-o are. Fără Costești, idealul e prin Albița: B2 1.465, B4 1.142 (+16 km).
- **B1: Albița și Giurgiulești diferă cu doar 12 km** pe km minimi. Pe magistrale Giurgiulești e mai scurt: 1.149 față de 1.208.
- **Km minimi aleg drumuri secundare:** regionale în UA (Liubar, Myropil), apoi Iași–Bacău și traversarea Bucureștiului. Pe magistrale drumul crește cu 2–8 % și se câștigă 3–5 ore. Criteriul lui Ion rămâne km minimi, iar alternativa se arată alături.
- **Micile schimbări de țară (RO la Lipcani, BG/RO la Giurgiu)** vin din poligoanele simplificate la ~300 m, nu sunt treceri reale de frontieră.

## Critic extern - runda 2
Codex: pass. Scorul raportat e 8.0, iar din greutăți ar ieși 7.5. Rămase high: 0.

| id | severitate | esență | decizie | motiv / unde e închis |
|---|---|---|---|---|
| r2-C1 | medium | Alternativa «pe magistrale» trecea tot prin Liubar (regional) | **Acceptat** | `marshruty2.mjs`: alternativa e acum explicit terminal → Jitomir → Vinița → Otaci…, cel mai rapid, pe setul de vămi al idealului. Vezi tabelul de mai jos |
| r2-C2 | low | Coloana «aceleași vămi» contrazice datele | **Acceptat** | Antetul e acum «Istoric real cu terminal (vămile lui)»: istoricul se arată cu vămile proprii, separat de ideal. Pentru idealurile prin Albița (B1), Costești (B2, B4), Mămăliga (B5) nu există curse reale comparabile |
| r2-C3 | low | Secțiunea Fișiere arăta runda 1 | **Acceptat** | Actualizat: `marshruty2.mjs` → `date/marshruty-bio-r2.json` e sursa scheletului |

## Alternativa pe magistrale (terminal → Jitomir → Vinița, cel mai rapid, setul de vămi al idealului)
| Cod | km / ore | Diferență față de ideal |
|---|---|---|
| B1 | 1.297 / 22,3 | +183 km, −1,7 h |
| B2 | 1.570 / 26,9 | +121 km, −3,8 h |
| B3 | 1.584 / 27,7 | +119 km, −2,8 h |
| B4 | 1.241 / 20,7 | +115 km, −3,8 h |
| B5 | 613 / 11,5 (prin Otaci) | +91 km, −0,1 h |
| B6 | 761 / 14,4 | +88 km, +1,0 h (idealul B6 e deja drumul rapid prin Soroca) |
| B7 | 1.280 / 22,3 | +166 km, −2,2 h |
Diferența de ~90–180 km e prețul ocolirii drumurilor regionale ucrainene după terminal (Dovbîș–Romaniv–Liubar–Lityn), pe care nicio cisternă de-a noastră nu le-a mers.

## Critic extern - runda 3 (ultima)
Codex: pass. Scorul raportat e 9.0, iar din greutăți ar ieși 8.5. Rămase high: 0.

| id | severitate | esență | decizie | motiv / unde e închis |
|---|---|---|---|---|
| r3-C1 | medium | Alternativa B5 prin Otaci era estimată (~525), necalculată | **Acceptat** | `marshruty2.mjs`: la B5 alternativa e pe setul Otaci, terminal → Jitomir → Vinița → Otaci → Briceni = **613 km / 11,5 h** (525 era fără trecerea prin Jitomir și Vinița) |

**Gate:** 0 critical/high deschise după trei runde. Scheletul preliminar se construiește din `date/marshruty-bio-r2.json`. Rămân deschise, pentru Ion: profilul real al cisternei (40 t e presupunere) și dacă Costești (barajul) e permis cu biodiesel.

## Adăugat după gate (Ion, 27.09: «Русе через ЗЕЛ нужен»)
| Cod | Ideal: vămi | km / ore | Drum | Pe magistrale | Real |
|---|---|---|---|---|---|
| B8 | Otaci → ZEL Ungheni → Albița | **1.142 / 24,4** | … Otaci → Rîșcani → Glodeni → Fălești → Ungheni (ZEL) → Huși → Bârlad → Tecuci → Focșani → Buzău → București → Giurgiu (podul Ruse) | 1.255 / 21,5 | — |
Calculat cu aceeași metodă ca B1–B7, deja trecută prin dezbatere (`marshruty2.mjs`, matrice completă, 40 t, fără bac). Nu s-a mai făcut o rundă separată. ZEL e pe drumul spre Albița, deci B8 are exact km lui B4 prin Albița (1.142).
