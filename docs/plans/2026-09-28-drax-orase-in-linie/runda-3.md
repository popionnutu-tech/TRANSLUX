# ION-124 — runda 3: triajul Codex r2 (r2/codex-runda-2.json: fail, C1 high, C2 medium, C3 low — ACCEPTATE); completări la runda-2.md

C1 (exclusivitatea): fereastra de prelungire a unei curse e mărginită de cursele vecine ale aceleiași mașini: turul caută urcări doar în (sfârșitul cursei
dinainte, tCap], returul doar în [tCap, începutul cursei următoare). Când între un retur și turul următor al aceleiași mașini ambele ar putea revendica urcări
din același gol: golul se împarte la cea mai lungă staționare ≥ 20 min din el (casa / noaptea / odihna) — urcările dinaintea ei sunt ale returului, cele de
după ale turului; dacă nu există o astfel de staționare, NICIUNA nu se prelungește și ambele primesc steagul «prelungire ambiguă» (se arată, nu se numără).
Fiecare urcare aparține cel mult unei curse (probă: nicio urcare în două prelungiri; nicio porțiune GPS în două curse). P12 primește cazul Codex: retur tCap
05:00, tur tCap 05:40, trei opriri la 05:10 / 05:20 / 05:25 fără staționare ≥ 20 min → ambele neprelungite, steag «ambiguă»; și varianta cu staționare de 25 min
la 05:12 → oprirea de la 05:10 a returului (sub 3 → neprelungit), cele de după a turului (sub 3 → neprelungit).

C2 (P9): reperul independent P9 («livrarea de dimineață ≈ locul nopții → capătul liniei pe șosea ± 20 %») folosește CAPĂTUL EFECTIV al primei curse (prima
urcare, când cursa e prelungită; altfel capatC). Rezultate raportate separat pentru aceeași linie cu și fără prelungire (R19 Bilicenii: 830MUM / 744ARF).

C3 (momentul și locul): la tur, t0 = primul punct lent al primei urcări; la retur, t1 = ultimul punct lent al ultimei urcări; coordonata urcării = mediana
punctelor lente ale opririi; o oprire care taie marginea ferestrei intră doar dacă tot șirul ei lent e în fereastră. P12 verifică exact t0 / t1 și coordonatele.
