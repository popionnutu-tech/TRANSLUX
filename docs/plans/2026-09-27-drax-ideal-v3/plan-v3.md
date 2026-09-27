# Plan: ideal-v3 Drăxlmaier Bălți — corecțiile scheletului (ION-97)

## De ce
Verificările ION-95 au lăsat pe scheletul ideal 7 linii cu «diagnostic cerut»: Zarojeni, Catranic, Bocancea Schit, Sturzovca, Trifănești, Nihoreni
și Mihăileni (cardul vechi e păstrat, deci `valid_pentru_export` iese true doar prin steag). Lanțul mai are câteva defecte cu termen: ora e calculată
UTC+3 fix, iar din 25.10.2026 ferestrele de schimb pierd cursele; regimul merge pe paritatea ISO, care se rupe la săptămâna 53 (28.12.2026 → 04.01.2027);
salturile între porți ajung pe R7 Slobozia*; cheia `m|t0` poate avea coliziuni; dedup-ul ±3 min contopește autobuze diferite. Regula lui Ion (26.09):
km reali din GPS. Dezbaterea (27.09): nicio schimbare de km fără metoda comună pe zile-pereche.

## Ce facem
1. **Lanțul ideal-v3** (făcut, faza 1 — `lant-schimbari.md`): `timp.mjs` (Intl Europe/Chisinau, ziua de lucru 03:00 → 03:00 pe ceasul local, faza A/B de la
   ancora 21.09.2026) + cele cinci corecții. Rulat pe aceleași intrări ca v2. Probele trec.
2. **Deciziile pe cele 7 linii** (faza 2, măsurate — `intrebari-v3.md`): se hotărăsc cu Ion (întrebările 1–8) și în dezbatere (9–12).
3. **După decizii:** `decizii-v3.json` aplicat de `card-gps.mjs` (metoda, nu km scris de mână), liniile derivate (Trifănești prin Florești, Nihoreni pe
   grupă) și atribuirea buclei 727CWN, dacă se aprobă. Apoi GATA + GATA.sha256, verificarea 3, re-semnarea registrului, poarta, `ideal-activ` și exportul.

## 🔬 Verificat pe viu (27.09.2026)
| fapt | cum | rezultat |
|---|---|---|
| v3 fără schimbări de cod reproduce v2 | P0: cod copiat, căi înlocuite, cache-ul de candidate refolosit; sha256 pe 13 ieșiri | 13/13 identice (schelet 29b2d3aa…), 14 s |
| ora prin Intl = ora v2 vara | proba-ora (a) pe 13.672 de observații și 27.644 de deplasări | 0 diferențe la oră, zi și dată locală |
| ora după 25.10 | proba-ora (b) | 06:13 EET: Intl dă s1; UTC+3 dă 07:13, în afara FER (cursă pierdută); 02:50 EET: ziua 26.10 față de 27.10 |
| Moldova schimbă ora la 03:00 EEST → 02:00 EET (00:00 UTC) | Intl/tzdata, proba-ora (c) | ora 02:xx EET din 25.10 cade în ziua 24.10 cu `timp.mjs`; `drax.mjs:63` o pune în 25.10 |
| regimul v3 = v2 pe fereastra de azi | proba-faza (a) | 62/62 de linii identice după maparea impare → A, pare → B |
| paritatea ISO se rupe la anul nou | proba-faza (b)(c) | ISO 53 și 1 sunt ambele impare; linia sintetică iese «rotație» 1,00 pe fază și «neregulată» 0,60 pe paritate |
| salturi | etalon-ideal.log, compara | 7.731 de salturi neatribuite; 139 de observații scoase de pe R7 Slobozia* (237 → 98) |
| coliziuni `m|t0` | diag7c | 0 (la cursa rt doar un picior are schimb): corecție preventivă |
| dedup doar pe aceeași mașină | compara-v2-v3 | se schimbă doar R32 Trifănești: ture/zi 2 → 4, +169,2 km/zi |
| km/zi flotă | compara-v2-v3 | card 5.765,6 → 5.934,8; km GPS pe liniile din act neschimbat (5.818,4 cu dedup între mașini / 5.983,2 fără) |
| manifestul v2 și al idealului vechi | sha256 + inode + nlink + mtime, 73 de intrări | identic înainte și după; `ideal-activ -> ideal-v2` |
| §2.3 din bază | SQL `lde_uzine` DRAXELMAIER_BALTI, `reguli_livrare_la` 2026-09-26 23:48:38 UTC, md5 f4e5f529… | textul spune «săptămâni ISO … IMPARE»: întrebarea 8 |
| consumatorii fișierelor de regim | grep în repo și pe VPS | pagina.mjs și verificatorul (drax.mjs D1/W53, poarta, ruleaza); export-lde și LDE nu citesc paritatea |

## Pași
1. ✅ Copii `cod/ideal-v3`, `date/ideal-v3`, manifestul „înainte”.
2. ✅ P0, reproducerea exactă a v2.
3. ✅ P1: ora + regimul; probele 1 și 2.
4. ✅ P2: salturile, cheia, dedup-ul; comparația v2 → v3.
5. ✅ Faza 2: măsurarea celor 7 linii (diag7, diag7b, diag7c).
6. ⏸ Răspunsurile lui Ion (1–8) și dezbaterea (9–12) → `docs/plans/2026-09-27-drax-ideal-v3-raspunsuri.md`.
7. ⏸ `decizii-v3.json` + `card-gps.mjs` (metrici pe submulțimi, linii derivate, steagul «decizie»); rulare, comparație din nou.
8. ⏸ Verificatorul aliniat (9a–c), cu aprobarea sesiunii. Apoi GATA + GATA.sha256 în `ideal-v3`, verificarea 3 (VERIF_SRC = ideal-v3) și re-semnarea
   celor 3 explicații C31 pe sha-ul nou.
9. ⏸ Poarta `poarta.sh export|write` = 0 → `ideal-activ -> ideal-v3`, reexportul `schelet-drax.json` (prin poartă), nota de memorie.

## Fișiere
- VPS: `/root/lde-worker/drax/cod/ideal-v3/` (17 scripturi + `timp.mjs` nou; sha256 în `date/ideal-v3/proba/cod-v3.sha256`),
  `/root/lde-worker/drax/date/ideal-v3/` (ieșirile P2), `date/ideal-v3/proba/` (referința v2, loguri, probe, manifeste, diag).
- Repo (arborele ION-97, necomis): `docs/plans/2026-09-27-drax-ideal-v3/vps/{cod,probe}/`, `docs/plans/2026-09-27-drax-ideal-v3/iesiri/`.
- Scratchpad: `plan-v3.md`, `intrebari-v3.md`, `lant-schimbari.md`, `compara-v2-v3.md`.

## Riscuri
- **Trifănești +169,2 km/zi e deja în v3 mecanic** (4 ture cu cardul vechi 42,3). Fără GATA, verificatorul și poarta nu pot lua setul, deci nu se
  exportă din greșeală. Decizia (întrebarea 5) vine înaintea GATA.
- **Verificatorul are încă dedup între mașini:** verificarea 3 ar vedea 2 ture la Trifănești, schelet-ul are 4. Se aliniază înainte (9a).
- **Chei de regim redenumite (A/B):** `pagina.mjs` e actualizată, iar verificatorul citește `regim/grupa/ideal/dupaAct/cnt/ore` (neschimbate) și
  W53 pe `impare/pare` (acum lipsesc, deci «informativ»). Alt consumator nu există (grep).
- **Cache-ul de candidate refolosit:** rezultatul depinde de urmele desenate de v2. E intenționat (aceleași intrări). O redesenare completă ar cere
  tracker + Valhalla și ar putea schimba ziua aleasă, nu cardul.
- **R16 Florești dublat** dacă 518MHD devine linie separată fără răspunsul la întrebarea 5.
- **`curse.mjs` corectat, dar nerulat:** extracția nu se reface în v3. Zilele la poartă (≥ 5 pentru flotă) vor ieși altfel la o extracție nouă
  (definiția v2 era 06:00 → 06:00).
- Liniile «pe grupă» și «pe sens» schimbă schema cardului (un km pe linie). Se tratează ca linii derivate, nu câmpuri noi.

## Verificare
- P0 identic octet cu octet ✅; probele 1 și 2 ✅; comparația v2 → v3 ✅ (2 linii, explicate).
- După decizii: comparația din nou, cu Δ km/zi pe fiecare linie decisă egal cu cifrele din `intrebari-v3.md` (±0,1 km).
- Verificarea 3: `valid_pentru_export: true` fără explicații G1 pe liniile corectate. Manifestul `ideal-v2` și al `*-ideal.json` identic.
- Proba de iarnă rulată din nou pe lanțul final (proba-ora b) și proba 53 → 1 (proba-faza b/c).
