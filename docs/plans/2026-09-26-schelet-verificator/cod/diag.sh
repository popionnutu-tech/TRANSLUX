#!/bin/bash
# Diagnosticul agentului (C44), ca `verif` (ION-95 v4.1, Codex r2 C2):
#   bash /home/verif/verificator/cod/diag.sh <RUN> </root/diag-verif/script.mjs> [argumente]
# - scriptul-sursă: fișier obișnuit (nu link), al lui root (copiat de agent cu scp ca root), nume [a-z0-9-]+.mjs;
# - root îl instalează în /home/verif/verificator/diag-cod/ (dosar EXCLUSIV al lui root, 755) — NICIODATĂ în dosarul lui verif;
# - rulează ca verif, cu cwd = <RUN>/diag-out (al lui verif), VERIF_D = <RUN>; citește doar <RUN>/in/; ieșirea pe stdout (fără redirecționare
#   făcută de root într-un fișier al lui verif). Root nu face cp/chmod/mv în diag-out/.
set -euo pipefail
BAZA=/home/verif/verificator; COD="$BAZA/diag-cod"
R="$(readlink -e "${1:?RUN}")"; S="${2:?script}"; shift 2
case "$R" in "$BAZA"/rulari/drax-*) ;; *) echo "RUN în afara rulari/"; exit 2 ;; esac
[ -d "$R/diag-out" ] && [ ! -L "$R/diag-out" ] && [ "$(stat -c %U "$R/diag-out")" = verif ] || { echo "diag-out lipsă sau suspect"; exit 2; }
N="$(basename "$S")"; [[ "$N" =~ ^[a-z0-9-]+\.mjs$ ]] || { echo "nume de script nepermis: $N"; exit 2; }
[ -f "$S" ] && [ ! -L "$S" ] && [ "$(stat -c %U "$S")" = root ] || { echo "sursa $S: nu e fișier obișnuit al lui root"; exit 2; }
PD="$(dirname "$(readlink -e "$S")")"; [ "$(stat -c %U "$PD")" = root ] && [ $(( 0$(stat -c %a "$PD") & 2 )) -eq 0 ] || { echo "sursa trebuie să stea într-un dosar al lui root fără scriere pentru alții (ex. /root/diag-verif/), nu în $PD"; exit 2; }
[ -d "$COD" ] || install -d -o root -g root -m 755 "$COD"
[ "$(stat -c %U:%a "$COD")" = root:755 ] || { echo "$COD nu e root:755 — refuz"; exit 2; }
T="$COD/$(basename "$R")-$N"; install -o root -g root -m 644 "$S" "$T"
exec runuser -u verif -- env -C "$R/diag-out" VERIF_D="$R" TZ=Europe/Chisinau node "$T" "$@"
