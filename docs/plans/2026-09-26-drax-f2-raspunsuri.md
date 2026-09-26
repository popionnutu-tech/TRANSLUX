# Drăxlmaier F2 — răspunsurile la cele 5 întrebări (hotărâte prin dezbatere, la cererea lui Ion)

Ion, 26.09.2026: «rulează fără oprire până nu ai rezultatul final, la toate întrebările răspunzi prin claude și codex debate».
Deci întrebările NU i s-au pus lui Ion. S-au hotărât pe cifre, cu trei părți:
- revizorul `business-logic-auditor`;
- revizorul `senior-backend-engineer`;
- criticul Codex (gpt-6-astra), «orb», adică fără să vadă răspunsurile Claude.

Verdictul l-a scris sesiunea principală (`triaj-r1.md`; precizările rundelor 2 și 3 în `triaj-r2.md`, `triaj-r3.md`). Ion îl poate răsturna oricând,
pe `/lde/livrare-reguli` sau printr-un tichet nou. Cifrele sunt cele finale, după corecțiile rundelor 1–3 (`plan-f2-v3-pur.md`, v3.1).

Fereastra măsurată: săptămânile ISO 36–39 (31.08–25.09.2026).
- 723 de zile-mașină L–V; eșantionul are 573, fără zilele cu o cursă probabil nedetectată (150).
- Cifra pe flotă e o **extrapolare** pe zile-mașină (factor 1,26); pe mașină, extrapolarea ei dă cu 1,8 % mai mult.
- Flota pe săptămână se numără pe zilele L–V (≥ 4): 39 · 41 · 39 · 39 dispozitive, nicio mașină nu iese față de numărarea L–D.
- 19 zile lucrătoare; pe lună = pe zi lucrătoare × 21,7.

## 1. Parcul Bălți: «lângă uzină» sau service? Cât de mare e zona lui?

- **Business:** lângă uzină; zona 0,5 km; service doar într-o zi fără curse sau la o staționare peste 24 h.
- **Backend:** lângă uzină; 1 km în modulul de timp liber; `ancoraBateParcul = true`.
- **Codex:** lângă uzină; ≤ 0,5 km, în afara porților; nu «tot golul se taie».

**VERDICT: parcul = loc de așteptare lângă uzină.**
- Zona parcului = 0,5 km de parc, în afara razei porții, atât în F2, cât și ca `ctx.praguri.R_PARC` în F3.
- Zona «neclar» a modulului comun (`R_PARC_ZONA`) = 1 km: cuprinde parcul și poarta VEST, dar nu EST și nu casele din Bălți. Se verifică în F3 pe săptămânile 36–39.
- `ctx.ancoraBateParcul = true`, valabil și pentru cursele din lanț, nu doar pentru ancoră.
- Service = doar oprirea la parc într-o zi fără curse sau staționarea la parc peste 24 h.
- Așteptarea la parc nu e economie. Noaptea la parc = doarme lângă uzină.

**Motivul.** Unanim.
- Precedentul «service = Parcul Bălți» e pentru uzine aflate la 60–130 km de Bălți. La Drăxlmaier parcul e la 0,70 km de poarta VEST.
- 41 din cele 73 de intervale tur–retur cu oprire la parc stau acolo ≥ 6 h: e obicei zilnic, nu reparație.

**Cifrele finale.**
- Categoria «parc», L–V: 3.040 km, 430 h, 32 de mașini.
- Nopți la parc: 14, la 10 mașini. Drumul parc → capăt a trecut la golul impus: 599 km scoși din livrare.
- Intervalele perechii (pe eșantion, 113): km-ii lor din zona uzinei (≤ 3 km de porți sau de parc) = **2.769 km** = «așteaptă deja», nu intră în R3 (runda 2: nici când intervalul iese câțiva pași din zonă).

## 2. Golul între ture: care citire și ce prag de lungime?

- **Business:** (c), prag 40 km (mediana etaloanelor = 40,0).
- **Backend:** (c), prag 20 km, pe toate zilele.
- **Codex:** (c), prag 20 km.

**VERDICT: citirea (c) = ziua cu o singură pereche SAU linia peste 30 km, pe eșantionul comun.** R3 e corectat:
- doar km-ii intervalului din AFARA zonei uzinei (runda 2, B1-rest);
- fără excursiile de peste 15 km (acestea trec la deplasare);
- «o singură pereche» = numărul de perechi complete ale zilei == 1, nu eticheta tiparului (runda 2, C2: +10,9 km);
- fără intervalele care conțin o cursă de prânz (runda 3, B14: 3 intervale, 320 km → gol pe rută);
- plafonat MEREU (runda 3, S17) la drumul pe șosea dus-întors până la cea mai lungă oprire ≥ 20 min din AFARA zonei, cu bucățile de parcare unite (runda 3, B13); fără o astfel de oprire R3 = 0 (26 de intervale); P8 pe km-ii din afara zonei: 5 / 10 în ± 20 %, raport median 1,07;
- restul (647 km pe eșantion) = «nelămurit», listă separată pe pagină (runda 3, B16), nici economie, nici alarmă.

**Motivul.**
- (c) e citirea literală a lui «sau» (unanim).
- Pragul contează doar în zilele cu mai multe perechi.
- 30 km e pragul de la care cifra nu se mai schimbă (30 = 40). Nu numește «lungă» o linie din sfertul scurt: p25 al etaloanelor e 28,9 km.
- 20 km ar adăuga un singur interval.
- Încredere medie; Ion poate răsturna.

**Cifrele finale** (km pe eșantion → pe zi lucrătoare și pe lună, extrapolat; după plafon):

| citirea | pe eșantion | pe zi lucrătoare | pe lună |
|---|---|---|---|
| (a) exact o pereche completă | 163,2 | 11 | 235 |
| (b) linia > 20 / 30 / 40 km | 163,2 / 163,2 / 163,2 | 11 | 235 |
| (c) prag 20 km | 163,2 | 11 | 235 |
| **(c) prag 30 km — ales** | **163,2** | **11** | **235** (≈ 900 lei) |
| (c) prag 40 km | 163,2 | 11 | 235 |

- Înainte de plafon, km-ii din afara zonei (toate citirile) sunt 810.
- Nelămurit: 647 km (≈ 43 km pe zi lucrătoare, extrapolare), listă separată.
- Citirile coincid după plafon: intervalele cu oprire în afara zonei sunt toate eligibile după ambele ramuri.
- Evoluția pe versiuni: v1 4.209 km; v2 1.814; v3 428,5; v3.1 163,2 (reperul plafonului doar în afara zonei, cursele de prânz scoase).
- Pe mașini: 293QVT 856 → 574 → 113 → 0 km; 346KAJ 456 → 217 → 37 → 40 km.

## 3. Ce intră în §8?

- **Business:** R1-SEBN pe două rânduri, R3 corectat, R1-LEAR «nu se aplică», R2 nu (remăsurat în F4).
- **Backend:** B = SEBN + R3 adunate, față de A = R1-LEAR; R2 nu.
- **Codex:** R1-SEBN ca «bază de analiză», R3 (c, 20), R1-LEAR «nu se adoptă ca regulă generală», R2 doar ca diagnostic.

**VERDICT: regula Drăxlmaier e B.** Precizarea din runda 2 (S10 / B11): B pe fiecare mașină; A doar referință, nu se alege.
- **B = R1a + R1b + R3**, adunate, pentru că taie km disjuncți:
  - R1a = marginile zilei: șofer din satul de start (cost de azi, nu economie garantată);
  - R1b = ocolul pe acasă între curse: nu pleacă acasă, așteaptă la capăt;
  - R3 = așteaptă lângă uzină între tur și retur.
- **A = R1-LEAR** («doarme lângă uzină, 4 drumuri pe rută»): se scrie «nu se aplică la Drăxlmaier», cu cifra.
- **R2 NU se propune**; se remăsoară în F4.
- Formularea e «bază de analiză / cost de azi». Lei doar pe mașinile cu normă; formula e la §8.1. Posterul F3 nu arată lei.

**Cifrele finale:**

| | pe eșantion (573 de zile) | km / zi-mașină | extrapolat (723 de zile) | km / zi lucrătoare | km / lună | lei / lună (cu normă) |
|---|---|---|---|---|---|---|
| A = R1-LEAR (referință) | −16.002 | −27,9 | −20.191 | −1.063 | −23.061 | ≈ −183.100 |
| R1a marginile | 16.788 | 29,3 | 21.183 | 1.115 | 24.193 | ≈ 161.500 |
| R1b ocolul | 15.687 | 27,4 | 19.793 | 1.042 | 22.606 | ≈ 160.700 |
| R3 (c, 30 km, plafonat) | 163 | 0,3 | 206 | 11 | 235 | ≈ 900 |
| **B = R1a + R1b + R3** | **32.638** | **57,0** | **41.182** | **2.168** | **47.034** | **≈ 323.100** |
| nelămurit (listă separată) | 647 | 1,1 | 816 | 43 | 933 | — |

- Lei: «dacă toate marginile și ocolurile ar dispărea», nu economie garantată.
- **Extrapolarea pe mașină** (B pe zi-mașină × zilele fiecăreia): 41.917 km (+1,8 %).
  - 386PKP n-are nicio zi măsurată.
  - Sub jumătate din zile măsurate: 744ARF 4 din 19, 397VKV 1 din 9, 804MUM 2 din 10, 518MHD 6 din 19.
- **A ar tăia mai mult decât B** (doar ca referință), la 3 mașini puțin măsurate: 744ARF (445 față de 242), 804MUM (189 față de 152), 297LVY (175 față de 124).
- **A pe plus:** la 16 mașini, Σ 4.789 km.
- **R2:** net 547 km pe eșantion = 3.214 câștigați − 2.666 pierduți de 9 mașini. Mai sunt 27,5 perechi despărțite.
- **Pe săptămâni**, B pe zi-mașină: 58,8 · 54,4 · 56,3 · 58,8; pe 36–38 = 56,3, pe 36–39 = 57,0.

## 4. Mesajul de timp liber către ADMIN: `?liber=1` sau nimic până la poster?

- **Business:** nimic până la «da»; rândul se scrie în bază.
- **Backend:** nimic în F3; ruta construită și testată, `?liber=1&dry=1` în log timp de două luni.
- **Codex:** DA, automat, separat de poster.

**VERDICT: niciun mesaj automat în F3.**
- F3 construiește `/api/cron/drax-optimizari?liber=1`, cu revendicarea atomică și cu testele.
- În perioada de validare (F4, două luni), `lear-saptamanal.sh` o cheamă doar cu `&dry=1` (în log).
- Rândul `DRAXELMAIER` se scrie în bază în fiecare luni și se vede pe `/lde/reguli?uz=drax`.
- Pornirea trimiterii = «da»-ul lui Ion: o linie în script.

**Motivul.** 2 la 1, plus precedentele lui Ion:
- mesajul de timp liber pleacă doar la LEAR, la cererea lui explicită (ION-57);
- SEBN nu-l trimite, Briceni nu trimite nimic;
- «privatul lui nu e log» (21.09);
- semnalul din F2 e slab.

Obiecția Codex («monitorizare fără notificare pe termen nedefinit») e acoperită de rândul din bază, de pagină și de termenul F4.

**Cifrele finale** (după corecția B4: excursiile din intervalul perechii trec la deplasare):
- Deplasare: 992 km / 5 bucăți în v1 → **1.146 km / 9 bucăți** acum; 4 dintre ele sunt excursii în intervalul perechii (154 km; 146BRAZ 17.09: 145 km).
- Peste 50 km pe săptămână: 725CWN săpt. 36 (252 km) și 39 (189), 224BZP 37 (185), 763LYY 37 (69), 146BRAZ 38 (145), 388ASB 39 (297; zi cu o cursă probabil nedetectată).

## 5. Există un schimb 3 la Drăxlmaier?

- **Business:** nu; test în F3 pe legătura 22:11–22:57 → returul s2.
- **Backend:** nu; toate cele 20 de atingeri sunt urmate de returul s2 la 00:04–00:20; `schimb3: false`.
- **Codex:** nu; `schimb3: false`; atingerea de la 22:10 duminica nu e muncă doar fiindcă e noapte.

**VERDICT: nu există schimb 3; `ctx.schimb3 = false`.** Test în F3: sosirile de la 22:11–22:57 se leagă de returul s2 prin `R_POARTA_PAUZA` și rămân «muncă».

**Motivul.** Unanim. Programul are două schimburi, iar `shift3_time` e gol.

**Cifra corectată (S3).** În v1, atingerile porții din afara ferestrelor între 22:00 și 06:00 erau 20. Erau un artefact: trackerul tace la poartă cu motorul oprit (041BRAU, VEST 22:38 → 00:04). Cu golurile mute ≤ 100 m legate, rămâne **o singură** atingere (350KAJ 02.09, poarta EST, 22:52–22:57, 5,6 min), în niciun weekend.
