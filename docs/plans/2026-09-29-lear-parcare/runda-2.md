# ION-143 — runda 2 (după revizia Claude r1: 5/10)

Documentul de bază rămâne runda-1.md (cererea lui Ion, regulile permanente). Aici: triajul observațiilor r1, metoda nouă, cifrele noi.
Cod: vps/lear-parcare.mjs (v2), vps/patch-dump2.mjs (dump v2 în lear-analiza.mjs: lista rută-pe-mașină cu capetele, porțile altor uzine,
cursele «timp liber» / brambura), vps/lear-parcare-valid.mjs, vps/scrie-lear-parcare.mjs, vps/lear-harta.mjs, vps/lant.sh. Rularea: vps/rulare-21.09-r2.txt.

## Triaj r1 (auditor Claude)
1. CRITICAL schimbul 3 la 320BRAT — ACCEPTAT. Munca nu se mai taie pe ceas, ci pe OPRIRI în sate (§4.8): orice cursă poartă → poartă cu
   opriri e muncă («plus», schimbul 3 inclus); tur / retur fără opriri doar cu trecere pe la capăt ȘI în fereastra lui. 320BRAT: 17 din 30 de
   curse cu oameni nu trec pe la capătul rutelor ei → «rute neverificate», fără propunere (și §8.3 în spirit).
2. CRITICAL golul de 13 h la 894BRAX — ACCEPTAT. Cursa fără poartă cu ≥ 2 opriri = cursă cu oameni neterminată → muncă; golul > 12 h =
   «zi incompletă» (nu mai 20 h). 894BRAX: 329,9 → 208.
3. HIGH rutele / capetele — ACCEPTAT parțial. Capetele = lista rută-pe-mașină (§1.4, lear-rute-masini.json / floresti-rute-masini.json, cu
   capătul fixat §4.5) ∪ rutele din săptămână ∪ comasate. Tăietura §4.4: pe tur PRIMA apropiere ≤ 1 km, pe retur ULTIMA (inversat față de
   v1). RESPINS pentru 894BRAX: capătul A2 = Cunicea e decizia lui Ion din 25.09 (ION-63, floresti-rute-masini.json «Cunicea se face»), mai
   nouă decât §4.2 Florești. Mașina cu peste 50 % curse cu oameni fără trecere pe la capăt → fără P1/P2 («rute neverificate»); pragul 20 %
   propus de auditor ar scoate mașini la care tăietura pe opriri e chiar regula §4.4 («rămâne tăietura pe opriri»).
4. MEDIUM semnalele orare la poartă (189OMM) — ACCEPTAT: punctele din raza porții se lipesc cât timp mașina nu iese din rază, oricât de rar
   vin; ancorele suprapuse (semnal rar la poartă) se lipesc, cea cu poartă e poartă.
5. MEDIUM trecerile pe lângă poartă (145BRAZ) — ACCEPTAT prin opriri: drumul spre poartă fără opriri și fără capăt nu e tur.
6. MEDIUM returul fals 809MUM — ACCEPTAT prin opriri; poarta primește preferința «deja» când mașina stă acolo ≥ 60 min (staționările la
   poartă intră în «unde stă acum»; și golurile de semnal fără deplasare > 0,5 km = parcare cu motorul oprit).
7. LOW–MEDIUM golurile poartă → poartă — ACCEPTAT: se scot doar dacă mașina nu iese la > 2 km de poartă.
8. LOW parcul / alte uzine — ACCEPTAT: depozitul = oprire ≥ 2 min la ≤ 0,5 km (§11.4); poarta altei uzine (lde_uzine_gates, §11.5) scoate golul.
Întrebarea 3 (timp liber în gol) — ACCEPTAT: km «timp liber» (lear-timp-liber) din gol se scad întregi, brambura pe partea din gol (§11.9).
Nou, din controlul cerut (§10): **niciun drum de parcare nu are opriri în sate** în afara locului unde stă. Opririle din gol sunt muncă:
drumul de parcare se taie de la sfârșitul ultimei opriri dinaintea staționării la prima oprire de după ea; golul cu opriri fără staționare
lungă nu e drum de parcare. Scriptul ARUNCĂ eroare dacă după tăiere rămâne vreo oprire într-un drum de parcare (controlul trece pe ambele uzine).
Valhalla: locul la care Valhalla nu dă drum bus (null) nu e candidat (fără linie dreaptă, §8.2). Poarta rămâne candidat (R1 a lui Ion).

## Rezultat 21–27.09 (vps/rulare-21.09-r2.txt)
LEAR Ungheni **−3.471 km/săpt.** (v1 4.182): 827MUM 663 (Petrești) · 809MUM 568 (poarta, deja) · 189OMM 478 · 145BRAZ 324 · 807MUM 270 ·
217RST 258 · 061COY 230 · 537BRAT 209 · 456BRAX 197 · 183BZP 177 · 732SHS 90 · 032BRAT 7; fără: 320BRAT (rute neverificate), 504BRAR
(rămâne cum e — doarme lângă poartă).
LEAR Florești **−789 km/săpt.** (v1 963): 849BRAN 217 · 894BRAX 208 · 035BRAT 171 · 279BRAT 125 · 603BRAS 68; 713IZX fără (§8.3, un
schimb; 10 goluri la poarta altei uzine).
Determinism: a doua rulare cu cache-ul Valhalla cald dă același rezultat; prima rulare după puncte noi poate diferi cu 0,1 km (032BRAT).
Harta (lear-harta.mjs, fără scriere): 71 + 30 zile, km pe intervale = km zilei (0 abateri > 5 %).

## Întrebări runda 2
1. Opririle din gol tăiate ca muncă (oamenii lăsați după capăt / luați înainte de capăt): corect sau prea prudent (189OMM 660 → 478 după
   ce Călugăr 04:21 și Pîrlița 12:52, zilnic înainte de tur, au devenit muncă)?
2. Pragul «rute neverificate» 50 %.
3. Poarta candidat cu preferința «deja» (809MUM doarme la poartă → P1 poarta, 568 km din statul acasă la prânz).
4. Afișarea (pagina hartă LEAR + blocul din raport, fără poster) și lanțul de luni: lear-analiza --write --dump → lear-parcare → scrie
   (validare) → harta (validare); picat = nu scrie, restul uzinelor merge.
