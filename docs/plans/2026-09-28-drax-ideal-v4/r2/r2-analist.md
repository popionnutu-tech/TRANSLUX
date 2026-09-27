# ideal-v4, runda 2 — uzina-analist («cercetează»), subiectul (C): Bălți

Autor: uzina-analist, 27.09.2026. Am citit `runda-2.md` (C, rândurile 38–44), `triaj-r1.md` și `reguli-drax-62eace0d.txt`
(md5 62eace0d…, 26.804 octeți, după migrația 412). Nu am scris în bază și nu am schimbat nimic pe VPS.

Săptămâna 14–18.09, `/root/lde-worker/drax/date/saptamanal/2026-09-14/` (`economie-zile.json` rulat 2026-09-27T13:59:38Z,
`economie.json`, `economie-curse.json` = mișcările brute cu satele atinse `apr`, `economie-urme/`).
Scripturile sunt în `scratchpad/p110/`:
- `an-r2.mjs`: atingerile pe puncte și opriri, variantele V0–V5 și blocul Bălți. Ieșirea în `r2-out.txt`.
- `an-r2c.mjs`: criteriul pe mișcări, variantele M1–M4. Ieșirea în `r2-miscari-out.txt`.

**Corectez o cifră din runda 1.** Cifrele din `runda-2.md:40` («19 bucăți, 1.150 km; pe zilele măsurate 429 km: 024XKY 351,
744ARF 78») au fost date de mine în runda 1. Criteriul de atunci era «oprire ≥ 1 min în raza porții, în fereastră». Criteriul acesta
are alarme false: cei 351 km de la 024XKY sunt toți falși. În plus, scapă o zi măsurată a lui 744ARF. Detaliile sunt mai jos.

---

## 1. Criteriul (1) pe TOATĂ flota

### Ce prinde varianta scrisă în runda 2 (V0 = oprire ≥ 1 min la poartă, în fereastră, oriunde în bucată)
Pe flotă prinde 19 bucăți și 1.150,2 km. Pe zilele măsurate prinde 4 bucăți și 429,2 km. Le-am verificat pe toate, una câte una:

| clasa | bucăți | km | exemple |
|---|---|---|---|
| **cursă reală nedetectată** | 13 | 773,0 | 804MUM retur s2 5/5 nopți, 16.09 tur s1 + tur s2; 744ARF tur s1 R13 (14, 15, 17, 18.09), 14.09 seara; 144BRAZ retur s2 R38 (17, 18.09) |
| **alarmă falsă: coada cursei vecine** | 5 | 355,9 | **024XKY 15 și 17.09 (351,2 km măsurați)**: bucata de seară începe la 06:04–06:07, chiar la sosirea turului s1 detectat. «Atingerea» e mutarea EST ↔ VEST 06:09–06:17 (4 km), apoi 06:18–06:49 prin Slobozia. 144BRAZ 16.09 (4,7 km): oprirea de la 00:00 e începutul returului s2 detectat. 727CWN 14.09 și 830MUM 15.09: 0 km |
| **nelămurit** | 1 | 21,3 | 414ASB 15.09: 1,4 min la EST la 23:47, fără nicio mișcare cu sate |
| **ratată** | 1 | 78,8 (măsurată) | 744ARF 16.09: are aceeași mișcare R13 (05:15 → poartă 06:05, 23,4 km, Dobrogea Veche și Hăsnășenii Noi), dar stă în raza porții doar 0,7 min |

Alarme false pe zilele măsurate: **351,2 din 429,2 km (82 %)**.

### Mașini care trec pe lângă poartă spre casă, fără cursă
- 744ARF, în serile de 15, 16 și 17.09: după returul s2 detectat (Bilicenii Vechi la 00:36), drumul spre casă trece pe la poartă
  la ~01:00. Oprirea din rază ține 1,6–2,0 min și cade în fereastra retur s2 (până la 01:45). Mișcarea are 6–7 km și nu atinge niciun sat.
- 804MUM, 14–18.09, la 17:0x–17:2x (fereastra retur s1): trece la 1,6 km de EST, pe drumul spre casă. Mișcarea are 11 km și nu atinge niciun sat.
- Un prag de oprire ≥ 2 min NU le separă: 744ARF stă exact 2,0 min pe 15 și 17.09. Cursele adevărate stau 3,6–8,3 min.

### Condițiile care lipsesc (varianta M4, pe mișcări, din `economie-curse.json`)
1. **Atingerea e în interiorul bucății**, la cel puțin 5 min de marginile ei. Asta scoate coada cursei detectate de lângă
   (024XKY, 144BRAZ 16.09, 727CWN, 830MUM).
2. **Sensul corect.** În fereastra de tur, mișcarea SOSEȘTE la poartă. În fereastra de retur, mișcarea PLEACĂ de la poartă.
3. **Mișcarea iese din Bălți:** atinge cel puțin un sat (≤ 0,8 km, fără cartierele Bălțiului: Slobozia, Dacia, Pământeni,
   Autogara), aflat la ≥ 5 km de porți. Asta scoate drumurile spre casă pe lângă poartă (744ARF la 01:00, 804MUM la 17:0x).
4. Opțional, ca etichetă: satul atins e al unei linii din act. Toate cazurile adevărate sunt așa: Hăsnășenii Noi (R13),
   Țiplești/Țipletești (R22/R18), Glinjeni și Mărăndeni (R38). Pagina poate scrie «cursă probabil nedetectată pe linia X».

Pragul de oprire (≥ 1 sau ≥ 2 min) nu mai e nevoie să decidă nimic: condițiile 1–3 separă singure.

### Rezultatul cu condițiile 1–3 (M4)
- **14 bucăți, 851,8 km pe flotă. Pe zilele măsurate: 3 bucăți, 156,8 km** (744ARF 15, 16, 17.09).
- Mașinile prinse sunt 144BRAZ (2 bucăți / 104,0 km), 744ARF (6 / 315,4) și 804MUM (6 / 432,4). **Toate trei sunt din grupa Bălți.**
- În afara grupei Bălți, pe toată flota: 0 bucăți.
- Alarme false: 0 (am citit fiecare mișcare cu satele ei). Ratări față de V0: niciuna. M4 prinde în plus 744ARF 16.09.

---

## 2. Blocul (2) — cine intră și cu ce km, după (1) corectat (M4)

Condițiile din `runda-2.md:43`: casa ≤ 3 km de o poartă, capătul > 15 km, R1a ≥ 100 km/săpt., iar nemăsuratele cu km pe zilele măsurate.

| mașină | zile măsurate | R1a după (1), dacă iese doar BUCATA | dacă iese ZIUA (§8.6) | distanța casă → capăt | în bloc? |
|---|---|---|---|---|---|
| 435ASB | 4/5 | 292,5 → extrapolat 366 | la fel | R34: 25,7 km în linie dreaptă / 36,0 km pe șosea | **da** |
| 186OMM | 5/5 | 281,7 → 282 | la fel | R4 Grinăuți: **13,9 km în linie dreaptă de la casă** (15,6 de la poartă, 16,7 pe șosea); R3: 30,6 km | **depinde de citirea «capătul > 15 km»** |
| 144BRAZ | 2/5 (nemăsurată) | 128,7 pe 2 zile (extrapolat 322) | la fel (zilele 17 și 18 erau deja excluse) | R38: 20,4 km în linie dreaptă | da, ca nemăsurată |
| 744ARF | 3/5 | **22,6** (doar serile de 7,5 km) → 38/săpt. < 100 | **0 zile măsurate** | R19: 18,8; R13: 7,5 km în linie dreaptă | **NU apare** |
| 804MUM | 0/5 | — | — | R22: 20,4; R18: 19,4 km în linie dreaptă | **NU apare** |

Concluzie: blocul acoperă 435ASB și 144BRAZ. 186OMM intră numai dacă «capătul» se măsoară de la poartă sau pe șosea.
**744ARF și 804MUM nu apar deloc**, deși sunt mașinile cu cel mai mare drum zilnic.

Km-ii lor nu sunt drum casă ↔ capăt: sunt curse nedetectate. Mișcările lor, pe săptămână:
- 744ARF: turul s1 R13, 5 × 23,4 km.
- 804MUM: returul s2, 5 × 45,7 km, plus 16.09 turul s1 (45,5 km) și turul s2 (48,4 km).
- Pentru amândouă, linia n-are etalon (`linii["R13|Hasnasenii Noi"].E` și `linii["R18|Putinesti"].E` = null).

---

## 3. Cifrele pentru întrebarea c2, refăcute după (1)

- R1a măsurat pe cele 4 mașini cu zile măsurate: **azi 882,3 km/săpt.**
- După (1) cu M4, dacă iese doar bucata: **725,5 km** (744ARF scade de la 179,4 la 22,6).
- Cu c2 = DA (regula parcului §5.3 a), aplicată după (1): 435ASB → 0, 186OMM → 0, 144BRAZ → 7,3, 744ARF → 22,6
  (golul impus e deja scăzut). Rezultă **≈ 30 km/săpt.**
- Cifra «882 → 187» din `runda-2.md:44` e de dinainte de (1): cei 187 km conțineau 179,4 km ai lui 744ARF, care sunt în cea mai mare
  parte cursa R13. Întrebarea către Ion trebuie să poarte: **«azi 882; fără cursele nedetectate 726; cu DA ≈ 30»**.
- Dacă iese ZIUA, cifrele devin 702,9 → ≈ 7, iar 744ARF devine nemăsurată.

---

## 4. Observații (rubrica comună)

**H1 — high, −2,0 (defect de logică): criteriul (1) așa cum e scris (`runda-2.md:39-40`) scoate din R1a km fără cursă și ratează o zi cu cursă.**
- Scenariu: la rularea săptămânii 14.09 cu criteriul V0, 024XKY pierde 351,2 km din R1a măsurat. Aceștia sunt drumurile de seară
  spre Drochia, trecute de §11.8 la «de lămurit». Pierderea vine doar din mutarea EST ↔ VEST de la 06:09, care e coada turului s1
  detectat. Dacă iese ziua, pierde 2 din 3 zile măsurate și devine nemăsurată.
- În aceeași rulare, 744ARF 16.09 (78,8 km, măsurată) rămâne în R1a cu turul R13 înăuntru.
- Dovada: `r2-out.txt` (V0: 19 bucăți; 024XKY 15.09 «06:52 2,6'», 17.09 «06:48 2,0'») și `r2-miscari-out.txt` (024XKY «mișcare
  06:09–06:17 4,0 km, sate: —»; 744ARF 16.09 «05:15–06:05 23,4 km, Hăsnășenii Noi»).
- Corecția: condițiile 1–3 de mai sus și cifrele M4: 14 bucăți / 851,8 km; pe zilele măsurate 156,8 km, doar la 744ARF.

**H2 — high, −2,0 (defect de logică): blocul (2) nu arată 744ARF și 804MUM, iar cursele lor nu apar nicăieri.**
- Scenariu: pe pagina săptămânii 14.09, blocul «Dorm în Bălți» arată 435ASB 366, 144BRAZ 128,7 (2 zile) și, poate, 186OMM 282.
- 744ARF are după (1) 22,6 km în 3 zile, sub pragul de 100. 804MUM are 0 zile măsurate.
- Nicio altă parte a paginii nu spune că 744ARF face în fiecare dimineață turul pe R13 Hăsnășenii Noi. Nici că 804MUM face în
  fiecare noapte returul s2 spre Țiplești.
- Asta contrazice planul, Pasul 5: «nicio mașină măsurată nu mai lipsește din pagină».
- Dovada: tabelul din secțiunea 2 (`r2-out.txt`, «Blocul Bălți») și `economie-zile.json` (`linii[R13|Hasnasenii Noi].E = null`,
  `linii[R18|Putinesti].E = null`).
- Corecția: blocul are un al doilea rând pe mașină, «cursă probabil nedetectată pe linia X: N km/săpt. (mișcările, 5/5 zile)»,
  pentru mașinile scoase de (1). Întrebarea a5, despre etalonul R13 și R18, rămâne pentru Ion.

**M1 — medium, −1,0 (gol de acoperire): (1) schimbă regula, nu doar codul.**
- §8.6 (text 62eace0d) scoate ZIUA din regulile de economie și definește cursa nedetectată prin «jumătate fără pereche nicăieri».
- Detecția prin mișcarea spre sau de la poartă nu e în text. Nici alegerea «iese bucata» sau «iese ziua» nu e hotărâtă.
- Diferența contează: la 744ARF rămân 22,6 km pe 3 zile dacă iese bucata, sau 0 zile măsurate dacă iese ziua.
- Un worker care face altceva decât textul lui Ion încalcă ordinea surselor: textul e primul.
- Corecția: o frază în §8.6, prin `replace`, cu gard md5 62eace0d și `ROW_COUNT = 1`. Alegerea bucată sau zi se pune în plan cu cifrele de mai sus.
  §12.1 rămâne neatins.

**M2 — medium, −1,0: condiția «capătul > 15 km» nu e definită.**
- Nu se spune dacă e distanța în linie dreaptă sau pe șosea, de la casă sau de la poartă, pe linie sau pe mașină.
- 186OMM R4 Grinăuți: 13,9 km în linie dreaptă de la casă, 15,6 de la poartă, 16,7 pe șosea. Intră sau nu, după citire.
- 435ASB are și o zi pe R19 Bilicenii Vechi: 14,8 km în linie dreaptă.
- Corecția: pe șosea (Valhalla), de la casă, pe linia cu cei mai mulți km R1a ai mașinii, sau pragul pe R1a/zi, nu pe capăt.

**L1 — low, −0,5:** pentru nemăsurate nu e spus dacă pragul de 100 km/săpt. se compară cu km-ii zilelor măsurate sau cu extrapolarea.
La 144BRAZ asta înseamnă 128,7 sau 322.

**Scor: 10 − 2,0 − 2,0 − 1,0 − 1,0 − 0,5 = 3,5.** Blocante (high): 2 (H1, H2).

## 5. Pozițiile pe (C)

- **(1) DA, cu condițiile 1–3.** Nu așa cum e scris.
  - Cu condițiile, criteriul prinde doar curse reale: 14 din 14, toate în grupa Bălți, 0 pe restul flotei.
  - Pentru «bucată sau zi»: întrebare, cu cifrele. Eu aș alege bucata, ca 744ARF să rămână măsurată pe partea R19, și aș scrie-o în §8.6.
- **(2) DA ca bloc informativ fără schimbarea §12.1**, textul spune deja «se vede pe pagină». Cu două condiții:
  - rândul «cursă probabil nedetectată» pentru mașinile scoase de (1) (H2);
  - distanța până la capăt definită (M2).
- **(3) DA, rămâne întrebare pentru Ion**, cu cifrele refăcute: 882 azi → 726 fără cursele nedetectate → ≈ 30 cu DA.
