# Camioane: august 2026 față de scheletul ideal (ION-122)

Ion, 28.09: «în baza la acest schelet fă analize pe luna august».
Artifact (secțiunea «August 2026»): https://claude.ai/artifact/QAYzzjh1cvD7jvf6Sxj9CG
Prezentarea scheletului cu hărți (pentru analiză): https://claude.ai/artifact/PLmjCcGVMccC46x6WtWoca

## Rezultatul
Toate cursele cu încărcarea în august, din GPS Wialon. Verificat pe toate cele 39 de unități din Wialon, nu doar pe cele 19 cisterne din nomenclator (Ion, 28.09: «nu doar nomenclator în soft»): cisterna RWN169 lipsește din nomenclator și e inclusă; alte 10 unități active sunt camioane de cereale (porturile Constanța sud/nord și Brăila); BNQ076, ANT316, QDQ396, QDQ714 dau error 7 (fără drept de istoric). În total 12 cisterne cu curse în august.

| Ce | Curse | Km reali | Km ideali | În plus | Lei |
|---|---:|---:|---:|---:|---:|
| Motorină încărcată (până la prima descărcare) | 23 | 12.774 | 10.519 | +2.255 | 24.749 |
| Biodiesel (până la locul real de descărcare) | 4 | 6.197 | 4.632 | +1.565 | 17.176 |
| Drumuri goale | 39 | 23.828 | 20.974 | +2.854 | 31.323 |
| **Total** | 66 | 42.799 | 36.125 | **+6.674** | **≈ 73.200** |

- Litri și lei: norma LDE a camionului cisternă, 34 l/100 km, și prețul mediu din august, 32,28 lei/l (`lde_diesel_price`). Consumul real din `lde_fuel_alimentari` e incomplet (4–49 l/100 km), deci nu s-a folosit.
- «Limita de sus», cu drumurile goale luate direct, fără opriri: 9.609 km.

## Unde se duc km
1. **A2 prin Fetești–Slobozia în loc de Brăila → Măcin.** Au mers pe A2 19 din 29 de curse încărcate și 24 din 35 de drumuri goale.
   - Costul față de drumul cel mai scurt: Port → Giurgiulești +59,5 km, Port → Albița +96,3 km, Petromidia +103,8 / +140,5 km.
   - Total ≈ 3.293 km ≈ 36.100 lei: cea mai mare pierdere a lunii.
2. **Mașinile goale se întorc prin Albița:** 22 din 29 de drumuri. Au făcut 14.881 km, față de 12.501 km pe drumul cel mai scurt.
   - Timp nu câștigă: la vamă stau cam la fel, 118 min la Albița și 124 min la Giurgiulești (7 treceri).
3. **Petromidia prin Albița:** 2 curse KWX620, cu +215 și +222 km.
4. **Biodieselul trece prin terminalul de export și unde regula nu-l cere** (B2 fără ZEL, B6): +539 km.
   - După ZEL, cursele spre Sofia au mers prin TLX Ungheni și Chișinău: +260 km.
   - Opririle la Briceni și Bălți: +146 km.
5. **Vama, cu marfă:** motorina stă în mediană 9,6 h la Giurgiulești (25 de treceri) și 6,2 h la Albița (4). Biodieselul stă 15,8 h la Albița.

## Metoda
- **Motorina:** idealul direct din scheletul ION-69 (`idealDirect`), pentru că cursa se măsoară până la prima descărcare.
  - «din vamă» = varianta pe vama folosită minus ideal;
  - «din drum» = real minus varianta pe vama folosită.
- **Biodieselul:** lanțuri Valhalla (40 t, fără bac) până la locul real de descărcare, cu câte o treaptă pe cauză: terminal, vama, opririle, restul (`bio-august.mjs`).
- **Drumurile goale:** idealul = drumul cel mai scurt prin opririle justificate: parcarea ≥ 8 h și opririle ≥ 15 min la stații sau baze (livrările locale).
  - Vama nu e oprire justificată.
  - Km reali sunt din urma brută, deci puțin sub km de drum; pierderea e subestimată.
- **A2:** reperele Fetești/Slobozia la ≤ 5 km de urma GPS (`drum-ro-august.mjs`), costul din `a2-diferenta.mjs`.
- **Ce nu intră:** 3 curse de motorină cu urmă slabă și 2 curse fără descărcare găsită (873 și 705 km).
- **Control pe curse:** `lde_truck_trips` începe la 01.09.2026 (0 rânduri în august, 32 în total). Pentru august nu există jurnal de comparat; cursele vin din aceeași segmentare, verificată pe septembrie în ION-69.
- **Scripturile** (Mac mini, `~/dev/camioane-schelet/`): `analiza-august.mjs`, `goale-august.mjs`, `bio-august.mjs`, `drum-ro-august.mjs`, `a2-diferenta.mjs`, `raport-august.mjs` (secțiunea din `raport.mjs`). Datele sunt în `date/analiza-august.json`.

## De întrebat dispecerul
- De ce A2 și nu Brăila → Măcin (DN22)? Poate restricții pentru ADR, podul Brăila (taxă) sau obișnuință.
- De ce mașinile goale se întorc prin Albița?
- De ce biodieselul spre Sofia (fără ZEL) și spre Chișinău trece prin terminalul de export?
- De ce, după ZEL, biodieselul trece prin Chișinău înainte de Albița?
