#!/usr/bin/env bash
# ION-143: parcarea propusă LEAR (Ungheni / Florești) după analiza de luni — din dump-ul lui lear-analiza.mjs (--dump):
#   lear-parcare.mjs (locurile) → lear-harta.mjs (fișierul hărții) → publica-lear-parcare.mjs --write (date.parcare + lde_harta_zi, O tranzacție).
# Orice pas picat = nu se publică nimic; ce era publicat rămâne întreg (Codex r1 C1). Codul de ieșire ≠ 0.
#   bash lant.sh <dump.json>          LEAR_PARCARE_WRITE=0 → fără scriere în bază
set -uo pipefail
AICI="$(cd "$(dirname "$0")" && pwd)"; ENV="${LDE_ENV:-/root/lde-worker/.env}"
DUMP="${1:?lant.sh <dump.json>}"; OUT="${DUMP%.json}-parcare.json"; HARTA="${DUMP%.json}-harta.json"
W=(--write); [ "${LEAR_PARCARE_WRITE:-1}" = 0 ] && W=()
node "$AICI/lear-parcare.mjs" "$DUMP" "$OUT" || { echo "lear-parcare: calculul a picat ($DUMP)" >&2; exit 1; }
node "$AICI/lear-harta.mjs" "$DUMP" "$OUT" "$HARTA" || { echo "lear-harta a picat ($OUT)" >&2; exit 1; }
node --env-file="$ENV" "$AICI/publica-lear-parcare.mjs" "$OUT" "$HARTA" ${W[@]+"${W[@]}"} || { echo "publicarea parcării a picat — nimic schimbat ($OUT)" >&2; exit 1; }
