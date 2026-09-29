# ION-136 — runda 3: răspunsul la Codex runda 2 (3.0, fail: C1, C2 high; C3 medium; C4 low)

Cod: vps/parcare.mjs, vps/scrie-parcare.mjs, vps/harta-zi.mjs; UI în apps/admin (necomis). Rulare: vps/rulare-14.09-r3.txt. Toate ACCEPTATE:

- C1 (high) — perechea finală putea încălca regulile: acum `elig(idx)` = câștig ≥ 20 km/săpt. (adus la 5 zile) față de cel mai bun loc unic ȘI fiecare loc
  ≥ 3 drumuri; al doilea loc se alege DOAR dintre perechile eligibile (b2e), iar înlocuirea de preferință sare peste perechile neeligibile. `castigAlDoilea`
  e scris în rezultat; scrie-parcare.mjs are probă pe perechea finală (orice loc < MIN_DRUMURI sau câștig < prag → nu scrie). 14.09: 830MUM are acum
  Grigorăuca (7) + Bilicenii Vechi (3); toate perechile trec proba.
- C2 (high) — legăturile interne ale nopții lipseau: `jumatati[].legaturaInterna` (capătul cursei → deplasarea obligatorie de seară / de dimineață) se
  adaugă fix pe ziua ei (aceeași oricare ar fi locul, ca `intern` din ziua ideală: noapteIdeal += intern + share), doar pentru nopțile ne-separate.
  Ocolul prin loc rămâne măsurat între capetele curselor (aproximarea ancorelor E / S — diferența e doar cât cele 2 legături interne pe o zi).
- C3 (medium) — `motivFara` și `castigAlDoilea` trec acum prin scrie-parcare.mjs până în UI (ParcareDrax arată motivul: «nicio zi măsurată», «în afara
  totalului», «propunerea nu scade km — rămâne cum e»).
- C4 (low) — lde_harta_zi.sumar.sursaEconomie = 'parcare' | 'ideal'; harta scrie «cu parcarea propusă» doar pentru 'parcare', altfel «față de ziua ideală
  (calcul vechi)».

Rezultatul 14.09: flota 4.507,2 km/săpt. (4.028,8 măsurat) față de ideal 4.777,2; 15 mașini cu două locuri (toate eligibile); 17 peste 100 km; 0 peste ideal;
fără propunere: 024XKY, 293QVT, 386PKP, 549RNK (nicio zi măsurată), 826GXP (nu scade km).
