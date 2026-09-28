# ION-124 — runda 2: triajul Codex r1 (r1/codex-runda-1.json, fail: C1 high, C2 medium, C3 medium — ACCEPTATE) și specificația de implementare

## 1. Orașul liniei
- Pe rută: orașele din §5.1 care sunt în ACTUL rutei cu angajați > 0 (nomenclator.json: sate + ang). Azi: R19 Sîngerei, R9 Glodeni, R3 Rîșcani, R16 Florești /
  Mărculești, R17 Mărculești, R23 Fălești, R21 Biruința, R15 Drochia, R31 Ghindești, R8 Costești. Dondușeni (0 angajați) — nu.
- Locul: punctul OSM (place = town / city) cu același nume din /root/lde-worker/places.geojsonseq; «în oraș» = ≤ 3 km de el și > 3 km de porți / parc (Bălți exclus).

## 2. Detectorul de urcare (C3 — unul singur, folosit și la măsurare, și la probă, și în producție)
- Oprire = șir continuu de puncte GPS cu viteza < 8 km/h, durata = de la primul la ultimul punct LENT al șirului (fără vecinii rapizi); un gol între două puncte
  > 2 min rupe șirul (lipsa GPS nu e oprire). Urcare = oprire de 15 s – 5 min, în oraș.
- Urcări DISTINCTE = la ≥ 150 m una de alta. Nu e urcare oprirea la ≤ 0,4 km de locul nopții (noapteA / noapteB) sau de o staționare ≥ 20 min din același gol (casa,
  odihna).
- Prelungirea cursei se face doar cu ≥ 3 urcări distincte (un semafor repetat = un singur punct → nu).

## 3. Prelungirea pe CURSĂ (C1) — în categorii.mjs, la construirea curselor (legsDin), ÎNAINTE de goluri
- Tur: în urma dintre (tCap − 45 min) și tCap (sosirea la capătul de azi), urcările în orașul rutei; dacă sunt ≥ 3 și de la prima urcare la tCap nu e nicio
  staționare > 5 min (continuitate), t0 = ora primei urcări. Retur: simetric, între tCap și tCap + 45 min, t1 = ora ultimei urcări.
- Cursa primește capetele EFECTIVE (coordonatele primei / ultimei urcări) și steagul «prelungită prin <oraș>, n urcări, +x km». Fiecare cursă a aceleiași linii își are
  capetele ei (830MUM prin Sîngerei, 744ARF din Bilicenii).
- Consum: golurile se construiesc din limitele NOI, deci ocolul pe acasă, drumul direct, legătura și golul impus se recalculează din urma rămasă (C2 — fără
  repartizare proporțională). patru-reguli.mjs (R-1, R-3) și ziua-ideala.mjs folosesc capetele efective ale cursei vecine (de / pana ale bucății cu oameni), NU
  capatC al liniei, când cursa e prelungită; capatC rămâne pentru cursele neprelungite.
- Scheletul NU se schimbă: cardul liniei rămâne mediana perechilor (etalon agregat); prelungirea privește economia pe cursă, nu cardul (C1: «separat de etalonul
  agregat al cardului»). R19 Bilicenii: cardul 17,3 × ture rămâne; steagul «linie prelungită prin Sîngerei în x % din curse» în registrul verificatorului.

## 4. Probe (P12, sintetice pe funcția reală + pe zile reale)
- sintetic: 3 opriri scurte (15–50 s) la ≥ 150 m în oraș înainte de capăt → prelungită; încetinire la 9–20 km/h fără oprire → nu; același semafor de 3 ori (un
  punct) → nu; gol GPS de 3 min → nu (nu e oprire); opriri la ≤ 0,4 km de locul nopții → nu; staționare > 5 min între urcări și capăt → nu.
- real: 830MUM 14.09 tur 06:02 → prelungită prin Sîngerei; 744ARF (0/46) → neprelungit; retur urban urmat de trecere pe acasă → ocolul recalculat; bilanțul zilei
  195/195 și P1–P11 trec; suma bucăților = km-ii zilei.
- Cifre: tot rândul 14.09 re-simulat cu detectorul final; tabel înainte / după pe cele 18 mașini marcate + flota (R1a, R1b, cele 3 reguli, ziua ideală).

## 5. Text și ordinea
Migrația: §4.1 (orașul din actul rutei cu angajați poate fi capătul efectiv al cursei, prin urcări), §4.5 / §5.1 (detectorul urban; lista orașelor rămâne doar
pentru orașele FĂRĂ angajați în actul rutei). Ordinea: cod categorii.mjs + patru-reguli.mjs + ziua-ideala.mjs → P12 → simulare 14.09 → Codex → scriere (snapshot
nou, --write) → migrația cu cifrele → pagina (marcajul provizoriu scos unde prelungirea a lucrat).
