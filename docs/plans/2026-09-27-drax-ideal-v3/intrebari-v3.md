# Ideal-v3 Drăxlmaier — întrebările (ION-97, 27.09.2026)

Toate cifrele: setul `date/ideal-v3` (rularea P2), modulul comun `etalon-gps.mjs` (km GPS completat = plin + raza porții, zile-pereche bune:
tur și retur pe același (schimb, mașină, zi), ≤ 18 %, poarta sensului, fără urmă ruptă). Grupa (EZ / D) = schimbul × faza săptămânii
(D face schimbul 1 în faza A, ancora 21–27.09). km/zi = 2 × card × ture/zi. Scripturi și ieșiri: `proba/cod/diag7*.mjs`, `proba/diag7*.txt`.
Δ-urile sunt față de v2 (5.765,6 km/zi card).

## A. Pentru Ion (câte o întrebare pe linie)

**1. R18 Zarojeni** (348KAJ singur, ambele grupe, 2 ture/zi; card v2 28,9 → 115,6 km/zi)
- Grupa D (22–25.09, schimbul 1): bucla Putinești–Țiplești–Alexăndreni–Heciul Vechi, 29,7–31,0 km, mediana 30,1 (5 zile).
- Grupa EZ (21–24.09, schimbul 2): turul 27,4–28,9; returul de noapte direct prin Mărășești 22,5–22,6 km (3 nopți din 4).
- 4 din cele 9 zile bune din septembrie sunt curse comasate cu alte linii: 17.09 prin Elizaveta (34/33,9), 18.09 prin Moara de Piatră–Cubolta
  (49/52,7), 19.09 prin Heciul Nou (40,9/39,8), 17.09 noaptea prin Sevirova–Trifănești (53,9/55,3).
- Opțiuni: 28,9 → 115,6 · **29,9** (toată fereastra, 43 zile) → 119,6 (+4,0) · 30,0 (septembrie fără comasate) → 120,0 (+4,4) · 30,7 (septembrie,
  regula de azi) → 122,8 (+7,2).
- **Propunere: 29,9** (toată fereastra; se potrivește la 0,1 km cu septembrie fără comasate, iar 30,7 umflă cardul cu cursele altor linii). Steagul rămâne.
  Încredere: medie.
- Întrebare: cursele comasate ale lui 348KAJ (17–19.09) sunt servicii obișnuite ale altor linii sau excepții? Returul de noapte direct (22,6) e drumul bun?

**2. R24 Catranic** (224BZP, 1 tură/zi; 30 → 60)
- Un singur drum. Dispozitivul 2302 rupe urma în septembrie: 13 din 37 de picioare (în mai–iulie 1 din 99). În septembrie rămân 2 zile bune.
- Toată fereastra: 29,3 (41 zile), pe orice poartă 29,5; picioarele întregi din septembrie: tur 28,7, retur 29,8.
- **Propunere: 29,3** (regula existentă: septembrie sub 3 zile bune → toată fereastra, `alege.mjs:56-58`) → 58,6 (−1,4). Încredere: mare.
- Întrebare: trackerul lui 224BZP (dispozitivul 2302) poate fi verificat / înlocuit?

**3. R36 Bocancea Schit** (224BZP, 1 tură/zi; 54,5 → 109)
- Drum lung prin Bilicenii Vechi–Coșcodeni–Bobletici, 51–55 km; drum scurt prin Nicolaevca, 42–47 km. Mai–iulie aproape numai lung (102 picioare
  din 104, toată fereastra 59,1); septembrie 23 lungi / 14 scurte.
- Pe schimb (septembrie): tur s1 49,1 · tur s2 44,4 · retur s1 45,3 · **retur s2 (noaptea) 54,0** — lung în 8 nopți din 9.
- Opțiuni: 54,5 → 109,0 · **46,2** (septembrie, 7 zile) → 92,4 (−16,6) · pe sens tur 46,2 / retur 52,3 → 98,5 (−10,5; cardul n-are azi km pe sens).
- **Propunere: 46,2** (idealul e drumul scurt, același tur și retur; ocolul de noapte intră ca exces în analiza săptămânală). Încredere: medie.
- Întrebare: de ce returul de noapte merge prin Bilicenii Vechi (+8 km)? Duce oameni de acolo?

**4. R27 Sturzovca și R11 Limbenii Noi**
- Sturzovca, drumul direct 21,8–24,3 km: 727CWN (poarta VEST) și 441ASB / 397VKV / 804MUM (poarta EST), grupa D. Fără buclă: 24,0 (VEST, 17 zile),
  23,9 (EST, 16 zile), orice poartă 24,0 (33 zile); **2 ture/zi**.
- Bucla lui 727CWN, Sturzovca → Fundurii Noi → Limbenii Noi: 28 de picioare (22 în septembrie), tur VEST 44,6 / retur EST 47,1, grupa EZ (21 din 22),
  46,5 km (8 zile), 1 tură/zi. Apare când 457BRAX pleacă de pe Limbenii Noi pe Nihoreni (14.09): 457BRAX și bucla fac Limbenii Noi în zile diferite
  (2 zile comune din 12).
- Opțiuni: Sturzovca 24,9 × 3 = 149,4 · bucla scoasă: 24,9 × 2 = 99,6 (−49,8) · **24,0 × 2 = 96,0 (−53,4)**; R11 Limbenii Noi rămâne 31,2 × 1 = 62,4
  (bucla e altă variantă a aceleiași ture EZ), sau 46,5 × 1 = 93,0 (+30,6) dacă bucla devine drumul R11.
- **Propunere:** bucla trece la R11 Limbenii Noi ca variantă (cardul R11 rămâne 31,2); Sturzovca 24,0 × 2 ture → 96,0. Încredere: medie.
- Întrebare: din 15.09, oamenii EZ din Limbenii Noi și Fundurii Noi sunt duși de 727CWN prin Sturzovca? Rămâne așa?

**5. R32 Trifănești** (v2: 42,3 × 2 = 169,2; v3 după corecția mecanică: 42,3 × 4 = 338,4)
- 146BRAZ, drumul direct (Sevirova–Mărășești / Putinești–Țiplești), 35,8–41,3 km, **40,2** (18 zile), 2 ture/zi, ambele grupe.
- 518MHD prin Mărculești–Florești–Vărvăreuca, 51,6–53,8 km, **52,9** (12 zile; toată fereastra 53,4, 25 zile), 2 ture/zi, ambele grupe.
  Ambele pleacă de la poartă în același minut. În septembrie, 518MHD e singura mașină care apare pe R16 Florești (6 zile), iar R16 Florești are
  idealul din mai–iulie (35,7 × 1 = 71,4).
- Opțiuni: o linie, 2 ture: 169,2 · o linie, 4 ture: 338,4 (+169,2) · **două linii (146BRAZ 40,2 × 2 + 518MHD 52,9 × 2): 372,4 (+203,2)** · numai
  146BRAZ, dacă 518MHD e mașina R16: 160,8 (−8,4).
- **Propunere:** 518MHD ca linie separată «Trifănești prin Florești», 52,9 × 2 ture. R16 Florești nu se mai adună separat cât timp serviciul lui
  e în cursa lui 518MHD. Încredere: mică spre medie; depinde de răspuns.
- Întrebare: 518MHD e al doilea autobuz al Trifăneștilor sau autobuzul Floreștiului / Vărvăreucăi care trece prin Trifănești?

**6. R3 Nihoreni** (2 ture/zi, actul EZ + D; 44,2 → 176,8)
- EZ (poarta VEST → EST, prin Rîșcani): 345KAJ 40,3–42,4 (până la 16.09), apoi 457BRAX 41,5–47,9; **42,3** (16 zile).
- D (186OMM, poarta EST, prin Rîșcani și Slobozia): 48–53 km, **52,7** (8 zile). Are și un drum scurt fără Rîșcani, de 38,6 km: turul s2 în 6
  din 9 zile, returul s1 în 22–25.09.
- Opțiuni: 44,2 × 2 = 176,8 · 42,3 × 2 = 169,2 (−7,6) · orice poartă 44,3 × 2 = 177,2 (+0,4) · **EZ și D separat, 2 × 42,3 + 2 × 52,7 = 190,0 (+13,2)**.
- **Propunere:** câte o variantă pe grupă, EZ 42,3 și D 52,7. Încredere: medie spre mică, pentru că D are două drumuri.
- Întrebare: de ce grupa D merge cu 10 km mai mult și pe poarta EST? Drumul de 38,6 km fără Rîșcani e voie?

**7. R6 Mihăilenii Vechi** (917FTI, 1 tură/zi, EZ; 55,7 → 111,4)
- Drumul bun 53,7–54,8 km (tur VEST 53,8–54,1, retur EST 54,5–54,8). Pe 12.09 (sâmbătă), pe ambele schimburi, cursa a fost comasată prin Drochia–Pelinia–Sofia (67,3–72,7 km).
  Poarta EST la tur și cele 5 zile bune pe ea dau 58 doar din cauza acestei zile.
- Opțiuni: 55,7 → 111,4 · 58 → 116,0 (+4,6) · **54,8** (orice poartă, 10 zile) → 109,6 (−1,8) · VEST/EST 54,3 → 108,6 (−2,8).
- **Propunere: 54,8.** Încredere: mare pe km.
- Întrebare: 917FTI nu mai apare pe Mihăileni după 14.09. Cine face linia de atunci?

**8. Textul regulilor, §2.3** (`lde_uzine.reguli_livrare`, DRAXELMAIER_BALTI, `reguli_livrare_la` 2026-09-26 23:48:38 UTC, md5 f4e5f529…): «Rotația merge
pe săptămâni ISO …: grupa D face schimbul 1 în săptămânile IMPARE». 2026 are săptămâna ISO 53 (28.12). Săptămânile 53 și 1 (04.01.2027) sunt
amândouă impare, deci regula scrisă ar pune grupa D două săptămâni la rând pe schimbul 1. Lanțul v3 numără alternanța de la săptămâna 21–27.09.2026.
- **Propunere de formulare** (o scrie Ion, pe `/lde/livrare-reguli`): «grupa D face schimbul 1 în săptămâna 21–27.09.2026 și, de acolo, din două în
  două săptămâni». Până pe 27.12.2026 e identică cu regula de azi. Trebuie scrisă înainte de 04.01.2027.

## B. Pentru sesiune / dezbatere (nu pentru Ion)

9. **Verificatorul trebuie aliniat înainte de verificarea 3.**
   - (a) `etalon-gps.mjs:68`: ture/zi deduplică implicit între mașini. Pe Trifănești dă 2, schelet-ul v3 are 4. Propun ca implicit să fie «doar
     aceeași mașină» (`faraDedupIntreMasini = true`), ca lanțul.
   - (b) B1 din verificarea 2: C20 pe zilele bune GPS (Catranic).
   - (c) `drax.mjs:63` `ziLucru = ziLocala(t − 3 h)` față de ceasul local din `timp.mjs`: diferă doar în ora 02:00–02:59 EET din 25.10. Trebuie aleasă o singură definiție.
10. **Cum intră deciziile în card fără km scriși de mână.** Propun `decizii-v3.json`: pe fiecare linie, metoda (sursa «toate», orice poartă,
    submulțime pe mașină / grupă / variantă, linie derivată), cu sursa deciziei (Ion dd.mm / dezbatere). `card-gps.mjs` o aplică prin
    `metrici(l, scoate)` și scrie steagul «decizie». Km-ii ies tot din GPS.
11. **Bucla lui 727CWN.** Mutarea ei la R11 cere o regulă de atribuire scrisă în `etalon.mjs`: azi +0,5 pentru mașina din grafic face ca R27 să câștige.
    Una posibilă: «piciorul care atinge capătul unei linii din altă rută, mai departe de poartă decât capătul propriu, merge la acea linie».
    Efectul ei trebuie măsurat pe toată flota înainte.
12. **Regimul Trifăneștilor** apare «doar s1» pe toată fereastra, dar în septembrie săptămânile 36–38 sunt «ambele». Are 4 ture/zi pe ambele
    schimburi. Regimul se recalculează pe sursa liniei, cum cere D1 din verificare?

## Bilanț, dacă trec toate propunerile

Δ față de v2: +4,0 − 1,4 − 16,6 − 53,4 + 203,2 + 13,2 − 1,8 = **+147,2 km/zi**, adică **5.912,8** km/zi card (v3 mecanic: 5.934,8).
Dacă 518MHD se dovedește mașina R16: −64,4, adică 5.701,2.
