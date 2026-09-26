#!/bin/bash
# Poarta spre F3 (ION-95 → F3). F3 doar o CHEAMĂ, ca root, cu sursa EXPLICITĂ (fără implicit, fără ideal-activ):
#   bash /home/verif/verificator/cod/poarta.sh export /root/lde-worker/drax/date/ideal-v2   # înaintea exportului și a `ln -sfn ideal-activ`
#   bash /home/verif/verificator/cod/poarta.sh write "$REF_SRC"                             # înaintea primei saptamanal.sh --write
# Iese 0 doar pe cel mai nou verdict SIGILAT + ÎNCHIS al exact acestei surse, făcut cu scriptul de acum (sha drax.mjs + etalon-gps.mjs),
# valid, cu sha256 egal pe TOATE cele 9 intrări. Pe stdout: lista «sha256  cale» verificată, pe care F3 o recompară după copiere (L4).
# Coduri: 0 deschis · 2 folosire greșită / sursă inexistentă · 3 închis (motivele pe stderr).
set -euo pipefail
MOD="${1:-}"; SURSA="${2:-}"
case "$MOD" in export|write) ;; *) echo "folosire: poarta.sh <export|write> <sursa>" >&2; exit 2 ;; esac
[ -n "$SURSA" ] || { echo "sursa e obligatorie (ex. /root/lde-worker/drax/date/ideal-v2)" >&2; exit 2; }
SRC="$(readlink -e "$SURSA")" || { echo "sursa $SURSA nu există" >&2; exit 2; }
exec node /home/verif/verificator/cod/poarta.mjs "$MOD" "$SRC"
