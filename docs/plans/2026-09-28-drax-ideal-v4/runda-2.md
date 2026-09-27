# Drăxlmaier ideal-v4 — dezbaterea Claude + Codex, runda 2 (ION-110, 27.09.2026)

Runda 1: Claude 1,5 (business 1,5 · analist 3,0 · verificator 6,0), Codex 5,5; triajul: `triaj-r1.md` (în același dosar).
Regulile: migrația 412 aplicată (§4.1 capătul din GPS, §4.7) — text 25.072 caractere, md5 62eace0d0dd8f37e678a27ef639f5c0e,
reguli_livrare_la 2026-09-27T15:00:05Z; fișierul integral pentru verificator:
`/private/tmp/claude-501/-Users-ionpop-Desktop-TRANSLUX/b0a7893e-64d6-4ccc-8455-63a68a04da1b/scratchpad/p110/reguli-drax-62eace0d.txt`.

## Ce s-a schimbat după runda 1

### Candidatul nou: ideal-v4.1 (VPS `/root/lde-worker/drax/date/ideal-v4.1/`, cod `/root/lde-worker/drax/cod/ideal-v4.1/`)
Sigilat cu GATA (schelet-ideal.json sha bfa070f0…), reproductibil (două rulări, aceleași sha pe 24 de fișiere). Față de v4:
1. **Cache-ul candidatelor** (verificator H1, Codex DA): 25 de intrări `cand`/`incercate` ale R28|Cuhnesti, R37|Musteata,
   R37|Rediul de Jos* scoase din `schelet-cand.json`; liniile s-au redesenat de la capetele noi (16 candidate).
2. **Comasarea «Rediul de Jos*»** (business a4, Codex a4): `etalon.mjs` ține la liniile cu capăt din GPS și startul din act
   (`startAct`); cursa care atinge doar startul din act rămâne pe linia ei, cu `exclusEtalon = 'cursă scurtă…'` și `capatAct: true`
   (în afara etalonului și a cardului GPS, fără km inventați). Linia «*» nu mai apare.

| linie | v3.1 | v4.1 |
|---|---|---|
| R28 Cuhnești | capăt Cuhnești · 65,5 km · etalon 66,9 · drum 65,5 · s1 67,9/69,3 · s2 65,5/66,8 | capăt **Balatina** · 75,0 km · etalon 76,8 · drum 75,0 · s1 77,9/79,8 · s2 74,9/74,3 |
| R37 Musteața | capăt Musteața · 43,5 km · etalon 44,6 · drum 44,5 · s1 44,2/44,9 · s2 44,1/45,6 | capăt **Năvîrneț** · 60,2 km · etalon 61,5 · drum 61,9 · s1 61,0/61,7 · s2 61,9/63,9 |
| R37 Rediul de Jos* | — | — (comasată) |
| celelalte 46 de linii cu ideal | — | identice |
| card GPS flotă | 5.819 km/zi | 5.872 km/zi |

### Analiza săptămânală (business H2, Codex: condiție de activare) — FĂCUT pe VPS, efect zero până la activare
`/root/lde-worker/drax/cod/economie/etichete.mjs:13-14,33` citește `${D}/capete-gps.json` din instantaneul săptămânii (dacă există;
altfel ca înainte); `/root/lde-worker/drax/cod/saptamanal/saptamanal.sh:48-63` adaugă `capete-gps.json` în instantaneu DOAR când
instantaneul se face în aceeași rulare cu scheletul (o săptămână veche nu primește capete fără scheletul lor). Copii `.bak-ion110`.
La activare, săptămâna 14.09 își arhivează instantaneul vechi (ca la ION-107) și se rescrie pe v4.1.

## Subiectele rundei 2
(A) **v4.1 e gata de activare?** Verifică: R28/R37 fără rămășițe ale tăieturii vechi; comasarea nu pierde curse bune; nimic altceva
schimbat; exportul LDE (`export-lde.mjs`) pe v4.1.
(B) **«Capătul prin parcare»** (verificator H4; Codex C1 high împotriva excluderii automate) — propunere: DOAR listă de diagnostic în
raportul scheletului (Zarojeni 52 % 348KAJ, Dominteni 45 % 710CWN, Prajila 27 % 763LYY, Sturzovca 15 % 727CWN), fără excludere, cu
cazul de control «plecare legitimă din capăt cu tracker pornit târziu». De acord?
(C) **Mașinile care dorm în Bălți** — propunere care NU schimbă §12.1 (textul spune: «R1a … nu intră în indicații; se vede pe pagină»):
  1. în worker, bucata R1a care atinge o poartă într-o fereastră de tur/retur (§3.2) se marchează «cursă probabil nedetectată» (§8.6)
     și iese din R1a (analist: 19 bucăți pe flotă, 1.150 km; pe zilele măsurate 429 km: 024XKY 351, 744ARF 78);
  2. pe pagină, în «Ce faci», un bloc informativ, nu indicație: «Dorm în Bălți, departe de capătul liniei — drumul casă ↔ capăt nu se
     taie cu o dispoziție (se taie doar cu alt șofer din sat sau mașina doarme la capăt)», pe mașină doar km/săpt. (R1a rămas după
     pasul 1), fără lei; condiții: casa ≤ 3 km de o poartă, capătul > 15 km, R1a ≥ 100 km/săpt.; nemăsuratele cu km pe zilele măsurate;
  3. întrebarea c2 (casa ≤ 3 km = lângă uzină, ca parcul) rămâne pentru Ion, cu cifrele: R1a măsurat 882 km/săpt. azi → 187 cu DA.
  De acord cu 1–3? Ce lipsește?
(D) Ce rămâne pe steag (Bocancea, Zarojeni, Sturzovca, Nihoreni, Florești, Trifănești; R18 casa 348KAJ; R32) — confirmați.

Scor după rubrica comună; high doar cu scenariu + dovadă.
