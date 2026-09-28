# ION-123 r1 — revizorul de logică de business (Claude)

Surse citite: `lde_uzine.reguli_livrare` DRAXELMAIER_BALTI (md5 e83d5f226e01cb64031de63a580cc4f1, 32.653 caractere), VPS
`drax/date/saptamanal/2026-09-14/{economie-zile,economie,patru-reguli,schelet-ideal}.json` (doar citire, scripturi în /tmp),
`drax/cod/economie/categorii.mjs` (CAT, tăierea prânzului, ocolul), `saptamanal/patru-reguli.mjs` (Bălți, weekend, bias Valhalla).
Nimic scris în bază, cod neschimbat.

## Fapte măsurate (săptămâna 14–20.09, 189 de zile-mașină L–V, 6 de weekend)
- Km pe categorii L–V: cu oameni 26.843 · livrare 9.335 (din care ocol 3.171) · gol pe rută 5.191 (direct 4.355) · legătură 7.623
  (direct 6.449) · între uzine 1.834 · parc 702 · gol între ture 589 · deplasare 145. Gol total ≈ 23.585 km/săpt.
- Cele 3 reguli de azi: 3.241 km măsurat. Propunerea, doar la 710CWN: ≈ 132 × 5 ≈ 660 km/săpt., adică o mașină ≈ 20 % din total.
- Curse cu oameni: 657; GPS 26.780 km, etalon 26.994 (+214, +0,8 %); 499 din 657 sub etalon. 710CWN: 4 curse Lazo = 60–62,6 km/zi
  GPS, față de 4 × 16,2 = 64,8 pe etalon.
- Bias Valhalla: R3 pe mașinile eligibile, GPS 2.145,7 față de Valhalla 2.061,5 pe aceleași drumuri (+84 km, +4,1 %).
- Zilele cu jumătate nedetectată: 30 din 189 (16 %), 8.012 km. Zilele «cu jumătăți reale»: 8, 1.853 km.
- 710CWN pe zi: livrare 105–108, gol pe rută 50–63, între uzine 9–15, 0 legătură. «6 × 16,2» = 4 curse + 2 drumuri gol pe rută
  §5.3(b) (după turul s1 înapoi la Lazo; după returul s1 înapoi la uzină).

## Poziții pe întrebări
1. **Km-ii cu oameni = GPS real al cursei, nu etalonul.** Economia e doar golul (Ion: «minus km total»). Cu etalonul ar apărea
   economie negativă la 499 de curse și +214 km/săpt. zgomot care nu ține de dispecer. Etalonul rămâne reper (§6) și control:
   cursa cu > 18 % peste etalon (§6.2) primește steag, nu economie.
2. **Legătura propusă = km reali GPS, în ordinea asta:** (a) tronsonul uzină ↔ capăt al aceleiași linii = etalonul liniei (mediana
   GPS, §6.2), pentru că e drum pe care îl fac alte curse; (b) capăt ↔ capăt sau alt drum fără etalon = mediana GPS a mașinii pe
   același drum în săptămână (drumul real cel mai scurt văzut); (c) doar dacă nu există nici (a), nici (b): Valhalla × 1,05
   (toleranța din §5.2), cu steagul «drum propus, nemăsurat». Ideal numai din Valhalla ar umfla economia cu ≈ 4 % din golul
   legăturilor (≈ 0,04 × 23.600 ≈ 900 km/săpt. pe flotă), adică exact ce a interzis Ion la 26.09 («km reali, nu geometrie»).
   Aceeași regulă e deja în regula B / ocolul §5.2 (drumul direct × 1,05) și în costul regulii 2 (GPS azi, Valhalla după):
   ziua ideală trebuie să folosească aceeași scară ca regula 2, altfel regula 2 și cauza «drum mai lung» se contrazic.
3. **Noaptea.** Candidați: capătul ultimei curse și capătul primei curse de a doua zi (același X = regula 1; X diferit = cauză
   nouă «noaptea între capete», ex. 925FTI Năvîrneț → Ilenuța 23 km). **Uzina NU e candidat în cifra principală:** ar reintroduce
   A (§8.4: +28 km pe zi-mașină pe flotă) și «rămâne la uzină» scoasă de Ion (§8.7). Varianta «16 × 8» a lui Ion se arată doar
   ca reper pe mașină, nu intră în total. **Weekendul** (vineri seara → luni dimineața): ideal = cât s-a făcut (economie 0),
   km-ii arătați separat, pentru că Ion a spus «no» (§8.7). **Bălți** (§7.4): livrarea se analizează, dar merge în blocul separat
   (ca azi: 474 km), nu în cifra principală. Consecință: cele 130–140 km/zi ale lui 710CWN includ nopțile de weekend (19 luni + 18
   vineri) pe care Ion le-a exclus; cifra corectă pe săptămână e mai mică și trebuie spusă așa.
4. **Cursa între uzine:** km GPS reali în ideal (nu «10 estimat»), deci economie 0 (§5.11). **Cursa de prânz și turul promovat
   (§5.1):** intră în ideal cu km GPS (cu oameni presupus), altfel devin economie falsă ≈ 2 × linia pe zi (§8.6: ziua rămâne în
   eșantion dacă perechea e completă — asta e scenariul). **Deplasarea §5.6, service, parcul peste 24 h:** în ideal = cât s-a făcut
   (nu sunt livrare). **Zilele §8.6 (nedetectată) și «de lămurit» (§11.8):** ziua iese întreagă, ca azi; o cursă nevăzută în
   total − ideal apare integral ca economie. **Ziua atipică (§10.2):** iese din sume.
5. **Cauze fără dublă numărare** (fiecare km al golului într-o singură cauză, în ordinea §5): (i) noaptea la capăt, același X =
   regula 1 (neschimbată, cu pragul 100 km/săpt.); (ii) noaptea între capete diferite = cauză nouă; (iii) acasă între curse =
   regula 3 (ocolul §5.2, neschimbat); (iv) drum mai lung decât cel ideal = gol GPS al bucății − drumul ideal de la pct. 2, doar
   pe bucățile «direct» (golRuta 4.355 + legătură 6.449 km/săpt.); (v) lângă uzină (zona ≤ 3 km: gol între ture în zonă, parc,
   golul dintre tur s2 și retur s1 — cele 11 km ale lui 710CWN) — **în afara cifrei principale**: §5.4, §5.5 și §8.7 spun că mașina
   «așteaptă deja lângă uzină» și Ion a scos «rămâne la uzină». Regula 2 rămâne separată, dar costul ei «după schimb» trebuie
   calculat după ziua ideală (azi: «după regulile 1 și 3»), altfel aceiași km se numără în (iv) și în regula 2.
6. **Pe pagină:** cifra principală pe săptămână (măsurat + extrapolat, ca B §10.3), pe flotă și pe mașină; pe mașină și «pe zi»
   ca medie a zilelor măsurate. Prag 100 km/săpt. pe mașină pentru a fi propusă (ca §12.2 și regula 1), doar cu ≥ 3 zile măsurate.
   Blocul «Cele 3 reguli» rămâne; ziua ideală apare deasupra ca «km în plus față de ziua ideală», iar sub ea desfacerea (i)–(iv)
   cu legătura la regulile 1 și 3; (v), weekend, Bălți și «16 × 8» — rânduri separate, cu eticheta, fără să intre în total.
   Ziua mașinii (drax-ziua.ts) primește pe fiecare mișcare «ideal X km / făcut Y km».
7. **Probe (toată flota, înainte de scriere, ca P10):** economie ≤ gol al zilei (total − cu oameni − între uzine); Σ cauze
   (i)–(v) + weekend + Bălți = total − ideal ± 0,5 km; ideal ≥ Σ cu oameni + între uzine; nicio cauză negativă (legătură ideală
   > făcută → 0, cu steag); cauza (i) = regula 1 și (iii) = regula 3 la km (identitate cu patru-reguli.json); nicio zi §8.6 în
   eșantion; bucăți ideale din Valhalla (c) ≤ un prag, altfel steag pe mașină.

## Riscuri (scor 10 − Σ; high = 1, medium = 0,5, low = 0,25)
- **HIGH** Valhalla în ideal față de GPS în total: +4,1 % măsurat → ≈ 900 km/săpt. economie falsă. Scenariu: mașina care merge
  exact drumul cel mai scurt primește «drum mai lung» ≈ 4 %.
- **HIGH** Uzina ca loc al nopții + weekendul în ideal: cifra 710CWN (132/zi) contrazice două decizii ale lui Ion (§8.4/«rămâne
  la uzină» scoasă; weekend «no»). Scenariu: pagina arată 660 km/săpt. la 710CWN, Ion vede nopțile de vineri pe care le-a exclus.
- **HIGH** Cursa de prânz / turul promovat socotite gol: ziua cu perechea completă rămâne în eșantion (§8.6), cursa de prânz e azi
  «gol pe rută» (categorii.mjs:184) → intră în economie cu 2 × linia. Scenariu: 744ARF, 804MUM, 386PKP.
- MEDIUM etalonul pentru cursele cu oameni (−214 km/săpt., 499 curse negative).
- MEDIUM regula 2 calculată «după 1 și 3», nu după ziua ideală → dublă numărare cu cauza (iv).
- MEDIUM «lângă uzină» (v) în total contrazice §5.4/§5.5/§8.7.
- MEDIUM «noaptea între capete diferite» (ii) nu are prag și nici distanța șoferului; trebuie aceleași condiții ca regula 1.
- LOW desfacerea «pe zi» vs «pe săptămână» amestecată în documentul rundei (132/zi vs 3.241/săpt.).
Scor propunere așa cum e: 10 − 5,25 = **4,75**. Cu pozițiile de mai sus acceptate: fără high deschis.

## Text de reguli de schimbat (propunere, nu scris)
- §5.3 și §5.7: «nu e economie» → «nu e economie până la drumul ideal (§8.8); ce trece peste e cauza „drum mai lung”».
- §5.2 ultima frază (ION-115): drumul ales de șofer nu e din cauza casei — rămâne adevărat; se adaugă trimiterea la cauza (iv).
- §5.11: între uzine intră în ideal cu km GPS.
- §8.1: B rămâne regula de dispoziție; cifra principală = ziua ideală (§8.8 nou), cu desfacerea (i)–(v).
- §8.7: regula 2 «după ziua ideală»; regulile 1 și 3 = cauze ale zilei ideale, cu km identici.
- §8.8 nou: definiția ideal/economie, ordinea surselor de km (etalon → GPS mașinii → Valhalla × 1,05), locurile nopții fără uzină,
  weekend și Bălți separat, prânzul și promovatele în ideal, zilele §8.6 excluse, probele.
- §10.3/§10.4: probele noi; §12 neschimbat până la «da»-ul lui Ion.
