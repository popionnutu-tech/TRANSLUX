# ION-136 — runda 4: răspunsul la Codex runda 3 (7,5 după formulă; fail: C2 high)

## C2 (high) — ocolul nopții între alte ancore decât legătura ideală — ACCEPTAT, reparat
- Ziua ideală exportă acum pe fiecare rând `ancore: { S, E }` (vps/zi-anc.mjs → vps/ziua-ideala-cu-ancore.mjs): S = începutul primei deplasări obligatorii,
  E = sfârșitul ultimei — exact punctele din care `legNoapte = leg(E, S următor)`. Câmp aditiv: economia zilei ideale neschimbată (14.09: 4.272,7).
- parcare.mjs: drumul de noapte = de la E (ziua lui) la S (ziua următoare); cost prin loc = legNoapte + max(0, V(E,P) + V(P,S) − V(E,S)) + legăturile interne
  ale jumătăților, fix pe ziua lor. Fără ancore (rând vechi) → capetele curselor, marcat `ancore: false`.
- Cazul Codex (A = 0, legătura internă A → U = 10, deplasarea obligatorie U → E = 12, E = 22, S = B = 20, P = A): cost = interna 10 + legNoapte(22 → 20) 2 +
  ocol (22 + 20 − 2) 40 = 52 km neobligatorii = exact drumul real păstrând deplasarea obligatorie (10 + 22 + 20). Formula nu mai poate da 18.
- Proba pe date (vps/proba-noapte.mjs, în rulare-14.09-r4.txt): 150 de nopți verificate; toate drumurile de noapte pleacă din E și ajung în S (0 abateri);
  niciun cost sub min(E → loc → S, legătura ideală). Pe 14.09 nicio noapte nu are legătură internă > 0, deci cifrele rămân: flota 4.507,2 km/săpt.
  (4.028,8 măsurat), ideal 4.777,2, 15 cu două locuri (toate eligibile), 0 peste ideal. Zi cu o singură jumătate măsurată: ponderile rămân cele ale zilei
  ideale (partNoapte), iar partea nemăsurată nu intră — ca în ziua ideală.
