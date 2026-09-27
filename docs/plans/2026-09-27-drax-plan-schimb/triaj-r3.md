# ION-108 — triajul rundei 3 (v3 → v3.1b, final)

Scoruri v3: business 8,0 (1 high: F1) · backend 8,7 (0 high) · Codex runda 3 INDISPONIBIL (prima încercare invalidă, a doua oprită de limita de utilizare, «try again at 7:42 PM»). Toate observațiile Claude ACCEPTATE și aplicate:
- F1 (high): mașinile cu aceeași linie pe ambele schimburi (715IZX, 446ASB, 041BRAU, 880RNK) au casa în drum → «poate sta acasă, e în drum; să nu mai umble cu ea între curse»; câmp `casaInDrum` în plan; ies din întrebarea de seară.
- F2 / R3-1: 713IZX după lanț — «trece pe acasă în drum spre Coșernița, nu mai e drum în plus» (nu «nu mai are pauză»).
- F3 / R3-3: estimarea = dimineața + seara, pe calendarul rândului, plafonată la GPS pe mașină: 2.633 km/săpt. (≈ 17.167 lei cu normă); bucata «între aducere și întoarcere» scoasă.
- F4: întrebarea de seară din plan — 12 mașini (2 nemăsurate), ≈ 1.648 km/săpt. GPS de azi, estimare de tăiat ≈ 1.466; locul = capătul liniei, cu distanța până acasă.
- F6: nota cardului 1.902 + 2.242 + nemăsurate 247 ≈ 4.392.
- R3-2: `timeout 100` pe pasul plan-schimb din worker (aplicat pe VPS 27.09, `.bak-ion108-r3`).
Codex runda 3 se reia pe v3.1b după 19:42 (critic indisponibil ≠ critic mulțumit); publicarea după el.
