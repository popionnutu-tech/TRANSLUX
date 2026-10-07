#!/usr/bin/env bash
# ION-143: parcarea propusă LEAR (Ungheni / Florești) după analiza de luni — din dump-ul lui lear-analiza.mjs (--dump):
#   lear-parcare.mjs (locurile) → lear-harta.mjs (fișierul hărții) → publica-lear-parcare.mjs --write (date.parcare + lde_harta_zi, O tranzacție).
# ION-263 (R-PAUZĂ): cu al doilea argument (raportul lui lear-analiza.mjs --json, rulat FĂRĂ --write), regula 3 se socotește pe pauzele dintre
# cursele cu oameni și raportul se scrie în lde_analiza_reguli de lear-r3-pauze.mjs, ÎNAINTEA publicării parcării.
# ION-268 K.9 (Ion, 07.10.2026 — «CONTROALE ÎNAINTE DE CIFRE»): după calcul (parcare + hartă) rulează control.mjs (K.1, K.2, K.3, K.5, K.6, K.10).
#   Control OK → raportul se scrie cu date.controale.ok = true, apoi se publică parcarea și harta.
#   Control PICAT (sau calculul picat) → raportul se scrie cu date.controale.ok = false (cazurile), parcarea / harta NU se publică; posterul
#   LEAR din albumul de luni se oprește (livrari-luni sare raportul cu controlul picat) și ADMIN primește cazurile «de verificat».
#   bash lant.sh <dump.json> [raport.json]          LEAR_PARCARE_WRITE=0 → fără scriere în bază
set -uo pipefail
AICI="$(cd "$(dirname "$0")" && pwd)"; ENV="${LDE_ENV:-/root/lde-worker/.env}"
DUMP="${1:?lant.sh <dump.json> [raport.json]}"; RAPORT="${2:-}"; OUT="${DUMP%.json}-parcare.json"; HARTA="${DUMP%.json}-harta.json"; CTRL="${DUMP%.json}-control.json"
W=(--write); [ "${LEAR_PARCARE_WRITE:-1}" = 0 ] && W=()
scrie_raport() {   # $@ = argumentele de control pentru lear-r3-pauze (--controale f | --control-picat)
  [ -n "$RAPORT" ] || return 0
  local P="$OUT"; [ -s "$OUT" ] || P=-
  node --env-file="$ENV" "$AICI/lear-r3-pauze.mjs" "$RAPORT" "$P" "$@" ${W[@]+"${W[@]}"}
}
if ! node "$AICI/lear-parcare.mjs" "$DUMP" "$OUT"; then
  echo "lear-parcare: calculul a picat ($DUMP) — raportul se scrie cu controlul picat, nimic publicat" >&2
  rm -f "$OUT"; scrie_raport --control-picat || echo "raportul n-a putut fi scris ($RAPORT)" >&2
  exit 1
fi
if ! node "$AICI/lear-harta.mjs" "$DUMP" "$OUT" "$HARTA"; then
  echo "lear-harta a picat ($OUT) — raportul se scrie cu controlul picat, nimic publicat" >&2
  scrie_raport --control-picat || true; exit 1
fi
node "$AICI/control.mjs" lear "$DUMP" "$OUT" "$HARTA" --out "$CTRL"; RC=$?
if [ "$RC" -ne 0 ]; then
  echo "CONTROL PICAT (K.9, $CTRL) — raportul se scrie cu cazurile, parcarea și harta NU se publică, posterul nu pleacă" >&2
  scrie_raport --controale "$CTRL" || echo "raportul n-a putut fi scris ($RAPORT)" >&2
  exit 3
fi
scrie_raport --controale "$CTRL" || { echo "lear-r3-pauze: raportul n-a putut fi scris ($RAPORT) — parcarea nu se publică" >&2; exit 1; }
node --env-file="$ENV" "$AICI/publica-lear-parcare.mjs" "$OUT" "$HARTA" ${W[@]+"${W[@]}"} || { echo "publicarea parcării a picat — nimic schimbat ($OUT)" >&2; exit 1; }
