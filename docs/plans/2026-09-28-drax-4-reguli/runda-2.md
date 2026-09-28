# ION-120 — runda 2: triajul Codex r1 și specificația unică de măsurare

Codex r1: 5,5 fail; C1 high, C2 medium, C3 low, C4 medium — TOATE ACCEPTATE. Totalul «≈ 3.940–4.290 km/săpt.» din r1 e RETRAS (C1): cifrele R-3 din r1
rămân doar diagnostic al modelului vechi (pe pereche, față de casa inițială, înaintea lui R-1).

## Specificația (un singur script, rândul săptămânii 14.09 DE DUPĂ ION-119 — «cursă între uzine» nu mai e gol)
Fiecare componentă a zilei are UN proprietar, după categoria ei (C4), nu după ordinea regulilor:
- R-1 (capăt în aceeași localitate) — proprietar: bucățile `livrare` cu `margine` (dimineața / seara), fără golul impus, pe cheia MAȘINĂ–NOAPTE (C2):
  noaptea N dintre ziua z (seara) și ziua z+1 (dimineața) e eligibilă dacă: ultimul retur din z se termină la capătul X (coordonata capătului liniei
  din scheletul activ, ≤ 1,5 km), primul tur din z+1 pleacă din același X (≤ 1,5 km), locul nopții e la > 2,5 km de X; nopțile deja la X nu au R-1.
  km = livrarea de seară din z + livrarea de dimineață din z+1 (km reali GPS). Jumătățile se numără în ziua lor; o jumătate intră doar dacă ziua ei e în
  eșantionul regulilor (nu exclusă §8.6, nu «de lămurit»). Weekend (vineri → luni) și noaptea în Bălți (§7.4): arătate separat, cu steag, nu în total.
  Reconcilierea r1 (sesiunea): business 50 de nopți / 1.839,5 km (toate zilele, fără nopțile deja la X) = analist 74 / 1.925,6 minus cele 24 deja la X
  (126,5 km) ≈ 50 / 1.800; 61 / 1.225,1 = aceleași pe zilele din eșantion. Se raportează ambele, pe cheie mașină–noapte, cu motivul fiecărei diferențe.
- R-2 (rămâne la uzină) — proprietar: bucățile `golTure`. Eligibilitate (C3): ORICE interval tur → retur al aceleiași perechi, fără condițiile §8.3
  («o pereche» / «linie > 30 km»). Formula: km din AFARA zonei uzinei, cu PLAFONUL §8.3 păstrat (drumul dus-întors până la cea mai lungă oprire ≥ 20 min
  din afara zonei × 1,05); fără oprire → 0 la R-2 și km-ii în «nelămurit», arătați separat. «Doarme la uzină» (A, §8.4) rămâne respins.
- R-4 (nu pleacă acasă între schimburi) — proprietar: bucățile `livrare` cu `ocol` (ION-115: cât lungește casa drumul), oriunde ar fi (și în goluri
  tur → retur de linii diferite). Unde așteaptă, pe pagină: cursa următoare e tur → la capătul ei; retur → la uzină.
- R-3 (rutele împărțite altfel) — după R-1, R-2, R-4 (C1): pe LANȚUL săptămânii fiecărei mașini (zilele legate prin nopți). După R-1/R-2/R-4, singurul
  km care depinde de mașina care face linia e marginea NEACOPERITĂ de R-1: locul nopții → primul capăt și ultimul capăt → locul nopții. Mutarea =
  schimb COMPLET al atribuirii săptămânale între două mașini A ↔ B (toate liniile și turele lor), doar dacă fiecare poate lua liniile celeilalte:
  capacitatea = cea mai mare clasă de linie dusă deja de mașină în fereastra scheletului (datele o arată; locurile pe tip lipsesc din bază). Cost după
  mutare = Valhalla (casa lui B → capetele lui A, pe nopțile neeligibile R-1 ale atribuirii lui A); costul de azi = aceeași formulă Valhalla (nu GPS),
  ca diferența să fie pe același reper. Economia = incrementală după R-1. Propunere = perechi disjuncte, lăcomos după câștigul net, net ≥ 50 km/săpt.;
  pe pagină ambele mașini, cu câștigul / pierderea fiecăreia.
- Proba: pe mașină R-1 + R-2 + R-4 ≤ livrare + golTure + golRuta + legătură; R-3 separat, cu semn; niciun km în două reguli (verificat pe bucăți).
- Pe flotă: km/săpt. măsurat pe eșantion + extrapolat pe zile-mașină (ca B azi), fiecare regulă separat.
