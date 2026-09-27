# Verificarea 9 — DRAXELMAIER_BALTI — 27.09.2026 (ideal-v4.1, după re-semnarea registrului)

**Starea.** `RUN=/home/verif/verificator/rulari/drax-v9-1790523013` · sursa `/root/lde-worker/drax/date/ideal-v4.1` (GATA neschimbat, schelet-ideal bfa070f0339c5464…) · drax.mjs 1be43dc0b57b · ruleaza.sh a26fad56be25 · node v20.20.2 · Europe/Chisinau.
Regulile: md5 62eace0d0dd8f37e678a27ef639f5c0e (`reguli_livrare_la` 2026-09-27T15:00:05.260446+00:00, după migr. 412).
Registrul: explicatii-drax.json sha256 d65065a95fa5…
**verdict.json sha256 3e42b7a3d0736023859153783caa9e43ce61a7ad0c4a2af802569d4ead40f645** · probe: R1 **ok** · registru **ok** («fără registru C31 blocant; cu registru C31 explicat») · INCHIS **ok**.

**valid_pentru_export: true** · 0 blocante neexplicate · 5 explicate pe bfa070f0: C31 R13 Hasnasenii Noi, C31 R18 Putinești, C31 R27 Iabloana, G1 R18 Zarojeni, G1 R27 Sturzovca.
X1: 7 intrări pe 8b400214 (v3.1 activ). Sunt păstrate intenționat până la comutare și se șterg după. X2 le numără tot pe ele, deci nu sunt blocante.
Km: identic cu v8 (`compara.mjs` v8 → v9): card 5.872 km/zi, GPS completat 6.000 km/zi, 0 linii dispărute.

**Comutarea `ideal-activ` → `ideal-v4.1`: DA, se poate.** Verdictul de fond e cel din runda 2 (7,5/10, nicio high nouă; H4 rămâne listă de diagnostic).
După comutare, sesiunea șterge cele 7 intrări 8b400214 din registru. Până la comutare, activul v3.1 rămâne acoperit de ele.
