#!/usr/bin/env bash
# ION-143: parcarea propusă LEAR (Ungheni / Florești) după analiza de luni — din dump-ul lui lear-analiza.mjs (--dump):
#   lear-parcare.mjs (locurile) → lear-harta.mjs (fișierul hărții) → publica-lear-parcare.mjs --write (date.parcare + lde_harta_zi, O tranzacție).
# Orice pas picat = nu se publică nimic; ce era publicat rămâne întreg (Codex r1 C1). Codul de ieșire ≠ 0.
# ION-263 (R-PAUZĂ): cu al doilea argument (raportul lui lear-analiza.mjs --json, rulat FĂRĂ --write), regula 3 se socotește pe pauzele dintre
# cursele cu oameni găsite de lear-parcare.mjs și raportul se scrie în lde_analiza_reguli de lear-r3-pauze.mjs, ÎNAINTEA publicării parcării
# (upsert-ul rescrie `date`, publicarea pune apoi date.parcare). Dacă lear-parcare pică, raportul se scrie neschimbat (regula 3 veche).
#   bash lant.sh <dump.json> [raport.json]          LEAR_PARCARE_WRITE=0 → fără scriere în bază
set -uo pipefail
AICI="$(cd "$(dirname "$0")" && pwd)"; ENV="${LDE_ENV:-/root/lde-worker/.env}"
DUMP="${1:?lant.sh <dump.json> [raport.json]}"; RAPORT="${2:-}"; OUT="${DUMP%.json}-parcare.json"; HARTA="${DUMP%.json}-harta.json"
W=(--write); [ "${LEAR_PARCARE_WRITE:-1}" = 0 ] && W=()
if ! node "$AICI/lear-parcare.mjs" "$DUMP" "$OUT"; then
  echo "lear-parcare: calculul a picat ($DUMP)" >&2
  [ -n "$RAPORT" ] && { node --env-file="$ENV" "$AICI/lear-r3-pauze.mjs" "$RAPORT" - ${W[@]+"${W[@]}"} || echo "raportul n-a putut fi scris ($RAPORT)" >&2; }
  exit 1
fi
if [ -n "$RAPORT" ]; then
  node --env-file="$ENV" "$AICI/lear-r3-pauze.mjs" "$RAPORT" "$OUT" ${W[@]+"${W[@]}"} || { echo "lear-r3-pauze: raportul n-a putut fi scris ($RAPORT) — parcarea nu se publică" >&2; exit 1; }
fi
node "$AICI/lear-harta.mjs" "$DUMP" "$OUT" "$HARTA" || { echo "lear-harta a picat ($OUT)" >&2; exit 1; }
node --env-file="$ENV" "$AICI/publica-lear-parcare.mjs" "$OUT" "$HARTA" ${W[@]+"${W[@]}"} || { echo "publicarea parcării a picat — nimic schimbat ($OUT)" >&2; exit 1; }
