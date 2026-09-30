# ION-151 — Motorina: cum se numără norma, ce anomalii sunt, ce se poate face

30.09.2026 · 3 runde Claude ↔ Codex (gpt-6-astra) pe aceleași date · rundele întregi în `runda1/`, `runda2/`, `runda3/`

**Date:** 40.195 alimentări benzol, 19.907 foi de parcurs (toate rămân în consum), 16.993 zile GPS (din 10.06.2026),
62.371 zile km LDE (m2m, din 2025). Total 3,80 mil. l din 2025. Test: norma calculată pe iunie–august, prezisă pe septembrie
(și pe iulie → august); pentru autobuze și un test lung pe m2m, 15 luni, 2.013 luni-mașină.

## 1. Norma — concluzia

**Formula contează puțin, felul în care e folosită contează mult.** Cele mai bune 5 metode greșesc între 5,1 și 5,2 %
la autobuze (WAPE, fără camioane), adică în zgomot. SQL-ul de azi greșește 5,55 %, norma veche 6,11 %, norma tipului 6,84 %.
Diferența mare vine din trei greșeli ale posterului de azi, pe care ambele părți le-au confirmat:

1. **Norma include chiar luna judecată** (`combustibil-poster.ts:109`, plinul se ia până la sfârșitul lunii raportului).
   Mașina care consumă mult își ridică singură norma. În august asta a înghițit 19 % din abatere, iar 4 din 15 mașini
   peste +15 % au dispărut de pe poster.
2. **Plinul se ghicește pe fiecare alimentare, nu pe totalul zilei** (SQL 445). La 90–115 din 183 de mașini alte zile ies
   „plin”. Pe zi e mai bine.
3. **Prag fix de ±5/10 %.** La o lună cu 1.000–2.000 km zgomotul e ±39 %, la peste 6.000 km e ±10 %. Pragul fix semnalează
   jumătate din mașinile cu km puțini fără motiv.

**Metoda recomandată** (singurul dezacord rămas, vezi §5):
- **Normă = consumul propriu pe ultimele 3 luni închise, tras spre tipul mașinii:**
  `N = (km·r_mașină + 5.000·r_tip) / (km + 5.000)`, cu `r = Σ litri / Σ km` pe aceeași fereastră ca luna de azi.
  Norma se **îngheață înainte de luna judecată**. O mașină cu km puțini stă aproape de tipul ei, una cu km mulți stă pe consumul ei.
- Pe testul lung de 15 luni metoda asta bate sigur plin la plin (WAPE 5,31 %; cu 0,49 pp mai bine, IC 0,28…0,71).
  Toate variantele plin la plin subestimează cu 1,5–2,8 %, deci umflă abaterile în sus.
- **Plin la plin (pe zi, ≥ 3 intervale, ≥ 3.000 km)** rămâne coloana de control „Din iunie”.
- Norma veche (măsurată) intră doar ca rezervă și doar dacă a fost măsurată **înainte** de luna judecată.
- Km: GPS-ul nostru cu regula parcării, m2m doar unde lipsește GPS-ul. m2m e **~2 % sub** GPS, nu 8 % peste cum scria în migr. 436.
- **Norma istorică nu justifică supraconsumul.** 034BRAT consumă 17,8 l/100 la un tip de 10,5. Norma lui proprie l-ar
  scuza, comparația cu tipul nu. Pe poster trebuie să stea amândouă.

**Pragul de abatere (autobuze).** Se calculează `L̂ = N·km/100` și `D = litri − L̂`. `q` e alimentarea tipică a mașinii pe zi (P90).
- **supraveghere:** D > max(15 % din L̂, 2·q);
- **investigație:** D > max(20 % din L̂, 2·q), sau supraveghere două luni la rând;
- **D foarte negativ** înseamnă „verifică km și foile”, nu „bine”;
- **gri, fără verdict,** sub 1.000 km/lună sau cu km lipsă.

Pragul semnalează ~3–5 % din mașini, la fel la toate nivelurile de km. Un prag simplu de ±15 % semnalează 11 %.

**Camioane:** nicio metodă nu coboară sub 17–26 % eroare pe o lună, pentru că plinurile cad între luni și lipsesc km.
Deci **fără verdict lunar automat**. Se judecă pe 3 luni cumulate (eroarea scade la ~8–13 %) și doar ca dosar, cu bon și cursă.

**Iarna:** Claude propune o corecție comună pe grupă. E testată doar pe o iarnă, iar Codex n-a verificat-o. Nu o introduc
până nu vedem decembrie–februarie pe GPS.

## 2. Anomalii (verificate de ambele părți)

Litrii de mai jos sunt **expuși sau de verificat, nu pierdere dovedită**. Clasele se suprapun.

| # | Clasa | Cât | l / lună | Exemple | Siguranță |
|---|---|---|---:|---|---|
| 1 | **Mașini cu litri și zero km** (iul–sep) | 8 mașini, 8.906 l: LJN075 4.665, QDQ396 1.150, BNQ076 1.145, GHT553 1.030, QDQ714 800 (+ MWC069, 405LLA, 239DQO sub 50 l) | ~3.000 | BNQ076 19.09 1.145 l; LJN075 22.08 1.050 l | mare (lipsesc km) |
| 2 | **Autobuze mult peste tipul lor** | 034BRAT, 603BRAS, 279BRAT, 783MUM: 2.891 l peste mediana tipului | ~975 | 603BRAS aug 553 l / 1.421 km (39 l/100 la normă 11,5); 034BRAT sep 1.204 l / 5.824 km | medie pe cauză |
| 3 | **Camioane peste celelalte camioane** | RWN193 53,6 și HMK135 46,7 l/100, mediana 39,7 | ~510 | RWN193 03.09 foaie 828 l | medie |
| 4 | **Foi în zile fără niciun km** (nici GPS, nici m2m) | 33 foi, 1.448 l, mai ales 034BRAT, 603BRAS, 279BRAT | ~395 | 034BRAT 11.09 44 l; în sept. 5 zile, 249 l | mare (lipsesc km) |
| 5 | **Documente mari la camioane** | 8–10 foi/alimentări, ~7.000 l | — | HMK135 03.09 916 l; MOW214 09.09 917 l la 0,3 km; LJN076 18.09 817 l | medie, doar bon/cursă |
| 6 | **Metoda de pe poster** | lookahead + plin pe înregistrare (§1) | — | aug: 4 din 15 mașini scăpate | mare |

**Scoase după verificare:**
- Nu există dublă introducere benzol ↔ foaie. Potrivirile apar la fel de des ca la întâmplare.
- „9.920 l peste rezervor” la camioane era umflat: simularea pornea cu rezervorul pe jumătate. De la zero rămân 4.366 l, dar
  capacitățile sunt presupuse, deci nu e o cifră de pierdere.
- 863MXL și KWX620 nu sunt peste tipul lor.
- LJN080 arată 43 l/100, dar cu cei 990 km lipsă din Wialon ar fi 35 l/100. Se verifică Wialon înainte.
- `km_total ≠ km_check + km_patched` nu e o greșeală: km_check e o verificare independentă.

**Ce nu se poate afla din date:**
- **Șoferul:** coloana șofer e goală în toate cele 40.195 alimentări benzol. Clasament pe șoferi nu se poate face. S004 la
  603BRAS și S217 la 279BRAT/034BRAT apar pe foi, dar sunt doar piste.
- Capacitatea reală a rezervoarelor.
- Prețul: suma_lei = 0 peste tot.
- Ora foilor.
- Traseul autorizat al camioanelor.

## 3. Ce se poate face — ordonat după litri

La 22 lei/l, ipoteză: volum de verificat, nu economie garantată.

| # | Acțiune | l/lună | lei/lună | Cine |
|---|---|---:|---:|---|
| 1 | Tracker sau drept Wialon pe LJN075, QDQ396, BNQ076, GHT553, QDQ714. Până atunci, alimentarea lor doar cu bon + km. | ~3.000 | ~66.000 | Ion + tehnic |
| 2 | Dosare 034BRAT, 603BRAS, 279BRAT, 783MUM: întâi km și foile, apoi tehnic (injectoare, filtre), apoi șoferul | ~975 | ~21.000 | dispecer + tehnic |
| 3 | RWN193 și HMK135: de ce 47–54 l/100. RWN193 poate fi și benzovoz (motorină mutată, nu consum). | ~510 | ~11.000 | Ion + tehnic |
| 4 | Regula: foaia fără km în ziua aceea nu se primește fără bon | ~395 | ~8.700 | dispecer + cod |
| 5 | Documentele mari la camioane (lista din §2, rândul 5): bon, card, cursă | — | — | dispecer |
| 6 | Șoferul să se scrie la alimentarea benzol, capacitatea rezervoarelor în nomenclator | — | — | Ion + tehnic |

**Schimbări de cod** (tichet separat, după decizia ta):
1. **Migrație nouă:**
   - `lde_fuel_plin_la_plin`: P90 și plinul pe totalul zilei, ≥ 3 intervale și ≥ 3.000 km;
   - funcție nouă de normă EB pe 3 luni;
   - tabel `lde_fuel_norma_luna`, cu norma înghețată pe lună (sursa, fereastra, q);
   - `lde_fuel_flota`: norma măsurată doar dacă e din înainte de perioadă, plus coloanele km_gps și litri_fara_km.
2. **`combustibil-poster.ts`:**
   - `:109` citește norma înghețată, nu plinul până la sfârșitul lunii judecate;
   - `:125–127` norma EB;
   - `abatere()` trece pe pragul în litri;
   - camioanele fără culoare de abatere lunară;
   - mașinile fără km primesc marcaj separat.

## 4. Ce nu s-a putut verifica
- Iarna pe GPS: GPS-ul pe toată flota există abia din 10.06.
- Plafonul ferestrei la 6 luni.
- Km Wialon pentru LJN080.
- Rezervorul real al camioanelor.

## 5. Singurul dezacord rămas
- **EB sau plin la plin ca normă principală.** Pe GPS (2 luni) sunt egale. Pe testul lung de 15 luni pe m2m, pe care Codex nu
  l-a văzut, câștigă EB. Codex a ales în runda 3 plin la plin, pentru simplitate și pentru că nu depinde de grupul de comparație.
  **Arbitrajul meu: EB.** E singurul test cu putere statistică, nu depinde de „plin” ghicit din cantitate și se explică
  simplu: „cât ai consumat 3 luni, tras spre mașinile de același tip”. Plin la plin rămâne coloană de control.
- **Pragul de supraveghere 10 % sau 15 %:** diferă cu 3 semnale din 263. Am ales 15 %.
