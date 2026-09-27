# ION-111 — liniile fără ideal (R13 Hasnasenii Noi, R18 Putinești, R27 Iabloana) — variantele V1 / V2 pe km GPS

**Starea.** `RUN=/home/verif/verificator/rulari/drax-v10-1790525974` (sursa ideal-v4.1, schelet bfa070f0…, verdict 53d60821…, valid_pentru_export true, 5 explicate — identic cu v9).
Diagnosticul: `/root/diag-verif/fara-ideal.mjs` → `diag-fara-ideal.txt`. Km = plin + raza porții (EST 0,6 / VEST 0,5), ca `etalon-gps.mjs`. Nu am rescris nimic.
**Regulile:** textul după migr. 413 (md5 56dfde04…) **nu l-am primit** (în scratchpad există doar `reguli-drax-sim413.txt`, md5 518f41a0 — alt text). §-urile de mai jos sunt citate provizoriu după 62eace0d; cer fișierul 413 înainte ca judecata să fie folosită.
Cum numără verificatorul azi: zi bună = pereche (schimb, mașină, zi) cu tur ȘI retur, ≤ 18 % (`etalon-gps.mjs:59-66`); picioarele fără schimb nu intră; gemenii rt nu sunt pereche (C7).

## Ce dau V1 și V2
| linie | obs (sept) | V1 pereche încrucișată: zile · km | V2 din tururi: picioare / zile sept · km | tur vs retur (mediane) | dispozitive duble | ce e pe urmă |
|---|---|---|---|---|---|---|
| R13 Hasnasenii Noi | 69 (20), 64 rt | **0 zile → nedeterminat** | 24 / 8 · **9,5** (9,4–10,2) | 9,5 / 9,4 (1 %) | 0 | navetă 744ARF de la poarta EST: EST → Hăsnășenii Noi → EST, 19,4 km, ~55 min; 13:40 = tur s2 + dus gol, 15:53 = retur s1 + întors gol |
| R18 Putinești | 16 (10), 5 mașini | 1 zi → nedeterminat | 9 / 7 · **23,4** (toate 22,8 + 0,6) | 23,4 / 23,4 | 0 | **0/10 opriri la Putinești** (trece ≤ 1,2 km); opriri la Alexăndreni, Țiplești, Heciul Vechi, Biruința = serviciul R22/R21, de la Pământeni |
| R27 Iabloana | 5 (1), 3 mașini | 0 zile | 2 / 1 → **nedeterminat** (28,5 / 30,6) | 29,6 / 27,9 | 0 | oprire reală la Iabloana (441ASB 09.09), dar rar |

**Faptul sesiunii pe R13 nu se confirmă:** tur s2 (22 de picioare) și retur s1 (10 + 1) nu cad niciodată în aceeași zi pe toată fereastra — rotația: în săptămâna s2, 744ARF aduce schimbul 2; în săptămâna s1, duce schimbul 1 acasă. Fiecare picior cu oameni are geamănul lui gol în aceeași deplasare (32 de gemeni rt).

## Riscurile de verificare
- **V1** nu produce nicio zi bună pe cele trei linii. Dacă i se admit picioarele fără schimb, R13 primește 32 de «perechi» din gemenii rt (tur s2 8,8–9,6 cu dusul gol de 10,5–11,1: 16 % ≤ 18 %), adică o pereche din aceeași deplasare, cu un picior gol — exact ce interzice C7. În plus, C17/G1 (zi bună = pereche pe același schimb) și C28 (ture/zi pe (schimb, mașină)) își pierd sensul.
- **V2** e curat pe R13 (8 zile, dispersie 0,8 km, tur = retur pe mediană — §6.7), dar:
  (a) **R18: certifică o linie greșită** — 23,4 km din cursele R22 care doar trec pe lângă Putinești (§4.2 «trece ≤ 1,2 km» atinge capătul fără nicio urcare, §4.5);
  (b) km/zi nu e definit: la R13 e un singur picior cu oameni pe zi, iar §6.5 (2 × km × ture, ture din perechi) dă fie 0, fie 19 km/zi «cu oameni», din care jumătate goi;
  (c) C33/C18 (tur ≈ retur pe zi) nu se mai pot aplica; rămâne doar comparația pe mediane.

## Ce trebuie schimbat (propuneri; nimic scris)
- **În verificator** (sesiunea aprobă scriptul): ramura `metoda_etalon = tururi` în G1/C47 — etalonul = mediana tururilor cu schimb (sept ≥ 3 zile); C47 pe retururile cu schimb; tur vs retur pe mediane (≤ 18 %, «neconfirmat» sub 3 retururi); gemenii rt fără schimb excluși explicit; plus un control nou, **«urcare la capăt»**: la liniile cu etalon din tururi, oprire §4.5 la capăt în ≥ 50 % din picioare (R13 20/20 în sept — trece; R18 0/10 — pică).
- **În lanț / reguli:** o regulă de km/zi pentru navetele de la poartă (un picior cu oameni pe zi): propun km/zi = km × picioare cu oameni pe zi (R13: 9,5 km/zi cu oameni + 9,9 gol pe rută).
- **În registru:** R13 — dacă primește ideal prin V2, explicația C31 devine moartă (X1) și se șterge la re-semnare. R18 — C31 rămâne, cu motivul scris din nou: «cursele atribuite sunt serviciul R22 Țiplești (397VKV, 804MUM), fără oprire la Putinești». R27 — C31 rămâne (2 picioare).
- **V3** (reatribuirea 710CWN / 043BRAU): pe lista H4, 710CWN oprește în Lazo 52, Hăsnășenii Noi 30, Dobrogea Veche 23 — mai mult Lazo (linia R13 cu ideal, 16,4 km). O reatribuire trebuie să aleagă linia R13 după §4.2 (cel mai depărtat start atins), nu direct Hasnasenii Noi. Doar diagnostic, cum s-a hotărât la H4.

## High-uri (cu scenariu) și scorul
- **H1 — V2 pe R18 face ideal dintr-o linie greșită.** *Scenariu:* R18 Putinești primește 23,4 km și ture/zi din perechile 397VKV/804MUM; cardul crește cu ~47–94 km/zi, iar aceleași curse lipsesc din R22 Țiplești (1 tură GPS vs 2 în act). F2 pune economia pe o linie la care nu urcă nimeni; când R22 primește a doua tură, km-ii se numără de două ori.
- **H2 — V1 cu picioare fără schimb transformă gemenii rt în perechi.** *Scenariu:* R13 primește 32 de zile «bune» din deplasări unice; etalonul amestecă piciorul cu oameni (~9) cu dusul gol (~10,5), iar ture/zi = 1 declară oameni în ambele sensuri; C7 e încălcat fără ca vreun control să pice, pentru că G1 compară etalonul cu el însuși.
- Medium: faptul de pornire («ambele sensuri, aceeași zi», R13) e fals pe date; km/zi pentru navete nedefinit; regulile 413 lipsă.

**Scorul pachetului V1 + V2 așa cum e (10 − Σ; high −2 / −1,5, medium −0,5):** H1 −2 · H2 −1,5 · fapt greșit −0,5 · km/zi nedefinit −0,5 · reguli 413 neprimite −0,5 = **5,0 / 10**.
Varianta recomandată — **V1 respinsă; V2 doar pe R13, cu garda «urcare la capăt» și regula km/zi pentru navete; R18 și R27 rămân C31** — ar fi ~8,5.
