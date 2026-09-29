#!/usr/bin/env bash
# Drăxlmaier Bălți — analiza săptămânii (lanțul drax/cod/saptamanal/saptamanal.sh --write), LUNI la 06:30 (ION-140).
# Cron: 30 6 * * 1
#
# Ion, 29.09.2026: «la Dra dă poster în grup, cu punctul optimal de dislocație … include în postare săptămânal 8:00». Posterul pleacă
# în albumul de luni (lear-saptamanal.sh, 08:00 → livrari-luni), deci rândul săptămânii trebuie să fie scris ÎNAINTE: lanțul cu
# parcarea propusă (ION-136) durează ≈ 15 min, mult peste limita de 280 s a pasului de odinioară din lear-saptamanal.sh.
# Ziua se taie la 03:00, deci la 06:30 duminica e încheiată. Întrerupătorul rămâne: cât există drax/OPRIT, nu rulează.
set -uo pipefail
LDE_DIR="${LDE_DIR:-/root/lde-worker}"
DRAX_SAPT="${DRAX_SAPT:-$LDE_DIR/drax/cod/saptamanal/saptamanal.sh}"
if [ -e "$LDE_DIR/drax/OPRIT" ]; then echo "drax saptamanal: OPRIT ($(head -c 200 "$LDE_DIR/drax/OPRIT")) — sărit" >&2; exit 0; fi
LIMITA=(); command -v timeout >/dev/null && LIMITA=(timeout 75m)
if ! nice -n 10 ${LIMITA[@]+"${LIMITA[@]}"} bash "$DRAX_SAPT" --write; then
  echo "drax saptamanal: rularea a picat (P10? vezi scrie.log), a depășit 75 min sau lock-ul e ocupat" >&2; exit 1
fi
