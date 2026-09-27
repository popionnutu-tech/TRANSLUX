# ION-112 runda 2: partea Claude (logica de business)

Autor: business-logic-auditor, 27.09.2026. Doar citire.
- **Date:** VPS `drax/date/ideal-v4.3` (`obs-ideal.json`, `schelet-ideal.json`) și copia `/tmp/ideal-v4.3-fara-decizii`.
- **Urma minut cu minut:** trackerul pg, cu scripturi rulate din `/root/lde-worker` și șterse după rulare.
- **Scripturile:** `scratchpad/p112/f1…f4.mjs`.
- **Oprirea** = sub 8 km/h, cel puțin 20 s, pe tracker. **Atingerea** = la cel mult 1,2 km (§4.2, §4.5).

---

## Q1 Florești: **DA, 35,7 × 2; TOATE picioarele lui 518MHD sunt Florești, niciunul nu e Vărvăreuca**
- **Urma, 14–16.09:** picioarele lui 518MHD etichetate «Vărvăreuca» trec la **0,84–0,87 km** de Vărvăreuca, adică o ating după §4.2, dar
  au **0 opriri** acolo. Opresc de **1–3 ori în Florești** (0,07–0,10 km), iar plinul lor e 34,7–37,0, cât Florești.
- **Pe fereastră:** din 121 de picioare ale lui 518MHD pe R16, doar 6 opresc în Vărvăreuca, toate în mai–iulie, **0 în septembrie**.
  Restul opresc în Florești (plin 33,1–35,3).
- **Perechile pe zi în septembrie:** 518MHD face s1 și s2 în fiecare zi (19 zile). Tura etichetată «Vărvăreuca» e tura celuilalt schimb:
  01.09 s1 = V, s2 = F; 07.09 s1 = F, s2 = V.
- **Efectul:**
  - Florești 35,7 × 1 → **× 2** (+71,4 km pe zi);
  - Vărvăreuca **42,0 × 3 → se remăsoară fără 518MHD**. Linia e a lui 350KAJ (218 picioare); în v4.2 avea 42,8 × 2.
  - Cartea «× 3» de pe Vărvăreuca numără tura lui 518MHD din Florești.
- **Regula de scris în §4.2** (pe o rută cu mai multe linii): capătul cursei = cel mai depărtat start al rutei **cu oprire (§4.5)**, dacă
  există unul; altfel cel atins. Același principiu ca în migrația 415 («drumul care doar trece prin sat nu face capătul»).

## Q2 Trifănești: **DA, 40,2 × 2, steagul se închide**
- Fără decizie, lanțul dă 40,2, iar turele măsurate sunt 2: 146BRAZ pe s1 și s2.
- Putinești e în linie prin §1.4 (migrația 415).

## Q3 Sturzovca: **23,9 × 2** (nu × 3)
- **Urma pe zile** (picioare cu oprire în Sturzovca, tur și retur): Sturzovca e grupa D, deci **un singur schimb pe zi**, cu **două
  autobuze**:
  - 14–18.09: 727CWN și 441ASB, pe s2;
  - 21–25.09: 727CWN și 804MUM, pe s1.
- **Perechi complete pe zi:** pe toată fereastra, mediana **2** (48 de zile cu 2, 24 cu 1, **0 cu 3**); în septembrie, mediana 2.
- **Lanțul însuși dă 2** (`tureZiE.sept = 2` în v4.3 și în copia fără decizii), dar câmpul `tureZi` rămâne 3 (M-b).
- §2.4 «Sturzovca … ambele schimburi, cu două mașini» se corectează în «schimbul grupei D, cu două mașini».

## Q4 Bocancea Schit: **53,3 × 1**. Mă aliniez cu analistul, **nu** cu verificatorul
- §6.3 cere septembrie când are ≥ 3 zile bune: lanțul are 4, iar metoda la oprire are 5 (53,2). Drumul s-a scurtat din septembrie
  (58,6 → 53,4).
- 54,5 e cardul vechi. Păstrarea lui contrazice §6.3.

## Q5 Nihoreni: **un card, 44,2 × 2**. Mă aliniez cu analistul, **nu** cu etalonul pe grupă al verificatorului
- Bucla D (+7–10 km, cu opriri în Nihoreni și în Rîșcani) e reală. Pe km pe zi, însă, două carduri pe grupă dau 177,8 față de 176,8,
  adică 1 km pe zi.
- §6.6 ține etalonul pe **schimb**, nu pe grupă. Un etalon pe grupă ar fi o regulă nouă, fără efect.
- Media 47,2 cade: vine din tăietura pe atingere la 186OMM (atingere la 36,5 km, oprire la 43,5 km, runda 1).

## Q6 Zarojeni: **1 tură; cardul pe tur (§6.1: tur = retur), 28,3–29,0**. Retururile **nu** se termină la Gura Căinarului
Urma pe tracker, toate picioarele lui 348KAJ pe R18 din v4.3:

| picior | câte | ating Zarojeni (≤ 1,2 km) | opresc în Zarojeni | plin în lanț |
|---|---|---|---|---|
| tur s2, mai–iul. | 34 | 22 | 17 | 25,8 |
| tur s2, sept. | 5 | 5 | 5 | **28,3** |
| retur s2, mai–iul. | 29 | **26** | 12 | 22,0 |
| retur s2, sept. | 4 | **4** | 3 | 22,0 |
| tur s1, mai–iul. / sept. | 26 / 3 | 8 / 1 | 8 / 1 | 25,8 / 33,4 |
| retur s1, mai–iul. / sept. | 37 / 4 | 20 / 0 | 10 / 0 | 22,2 / 39,2 |

- **Returul s2 ajunge în Zarojeni în 90 % din nopți** (22–24.09: opriri la 00:31–00:37, după Gura Căinarului). Constatarea analistului
  («retururile se termină la Gura Căinarului») **nu se confirmă**.
- **Plinul de 22 km al returului e o eroare de tăietură (M-c).** Lanțul taie returul la **prima** apropiere de Zarojeni (~22 km, înainte
  de Gura Căinarului, care e la 24,4), nu la vizita din Zarojeni care urmează.
- Din cauza acestei erori nu se poate face nicio zi bună după §6.2 (22 față de 28 = 22 %), iar linia iese «DIAGNOSTIC, C47 35 %».
- **Poziția:**
  - 1 tură (serviciul real e schimbul 2; pe s1 e deservită rar);
  - card = mediana tururilor cu oprire în Zarojeni din septembrie, **28,3** (sau 29,0 dacă lanțul măsoară aceleași tururi);
  - reparația tăieturii returului în lanț.
- **Aliniere:** cu verificatorul pe 1 tură; cu analistul **nu** pe retururi.

## Q7 Lista «capăt prin parcare» după v4.3 (opririle pe `opr`, în afara capătului)

| rând | după v4.3 | poziția |
|---|---|---|
| **Zarojeni 348KAJ** | 110 din 142 de picioare fără oprire în capăt în `opr` (77 %), dar pe tracker tururile și retururile s2 ating / opresc în 65–100 % | **rămâne diagnostic, cu motivul corectat:** extracția pierde opririle scurte (ca la 744ARF, ION-112 r0); fără excludere |
| **Heciul Vechi\* 412BRAY** | 130 de picioare, **0 în septembrie**; linia «\*» nu intră în cardul flotei (Σ fără \* = 5.789) | **iese din listă** (cu analistul) |
| **Prajila 763LYY** | **92 % fără oprire în Prajila** (sept. 29 din 30); opririle sunt în satele R32 (30), R18 / Putinești (22) și R16 (11); linia din septembrie e a lui **713IZX** (233 de picioare) | **îmi schimb poziția din runda 1: rămâne pe listă** (cu analistul). Doar picioarele cu Putinești sunt legitime pe R17 (§1.4); **× 3 se remăsoară** pe picioarele cu oprire în Prajila. |
| **Sturzovca 727CWN** | 17 %, **5 în septembrie**, fără ≥ 2 opriri în altă rută | **iese din listă** (buclele au ieșit în v4.3) |
| **Vărvăreuca 518MHD** (rând nou) | 83 de picioare, 0 opriri în Vărvăreuca în septembrie | **mutare pe Florești** (Q1) |

## Constatări cu deducere

**M-a (medium, −1): Vărvăreuca 42,0 × 3 în v4.3 numără serviciul Florești al lui 518MHD.**
- Dovada: trackerul (trecere la 0,84–0,87 km, 0 opriri) și 0 opriri în septembrie.
- Florești × 1 plus Vărvăreuca × 3 împart o singură mașină între două linii.
- Documentul pune întrebarea, dar cardul măsurat din tabel e deja greșit.

**M-b (medium, −1): `tureZi` nu urmează turele măsurate.** În copia fără decizii:
- Sturzovca: `tureZi` 3, dar `tureZiE.sept` = 2;
- Zarojeni: `tureZi` 2 (card vechi reținut), dar `tureZiE` = 1.

Cardul flotei păstrează ture pe care lanțul însuși nu le mai măsoară.

**M-c (medium, −1): tăietura returului la prima apropiere de capăt.** Returul lui 348KAJ e tăiat la ~22 km, deși oprirea din Zarojeni vine
după Gura Căinarului (~27–28 km). Asta face R18 nemăsurabil după §6.2 și a dus la concluzia greșită «retururile se termină la Gura
Căinarului».

## Scor

10 − (1 + 1 + 1) = **7,0 / 10**. **Niciun high.**

**Acordul propus pe cele 6 linii:**

| linie | card |
|---|---|
| Florești | 35,7 × 2 (+ Vărvăreuca remăsurat fără 518MHD) |
| Trifănești | 40,2 × 2 |
| Sturzovca | 23,9 × 2 |
| Bocancea Schit | 53,3 × 1 |
| Nihoreni | 44,2 × 2 |
| Zarojeni | 28,3–29,0 × 1 |

**Ce trebuie în lanț:**
- capătul cursei pe o rută cu mai multe linii = cel mai depărtat start **cu oprire** (§4.2);
- `tureZi` = turele măsurate;
- tăietura returului la ultima vizită în capăt.

**Ce trebuie în reguli:**
- §2.4 (Sturzovca);
- §4.2;
- §6.5 (turele);
- §6.6 (scos exemplul Sturzovca s2 46,9).
