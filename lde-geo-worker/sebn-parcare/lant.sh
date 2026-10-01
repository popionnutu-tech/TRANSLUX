#!/bin/bash
# ION-147 — harta SEBN Orhei + Strășeni cu parcarea propusă P1 / P2, pe săptămâna trecută (luni–duminică) → lde_harta_zi 'SEBN'.
# Cron luni 09:15 (ora Moldovei), după lanțul SEBN de luni (lear-saptamanal.sh, 08:00), pe care NU îl atinge: dump-ul îl face copia
# sebn-dump.mjs (fără scriere în bază), nu sebn-liber.mjs. Nimic din lde_analiza_reguli nu se schimbă.
#   sebn-dump.mjs --dump → sebn-parcare.mjs (locurile) → sebn-harta.mjs --write (ștergere + rescriere a săptămânii prin REST)
# Rulare de mână: lant.sh [AAAA-LL-ZZ luni]   SEBN_PARCARE_WRITE=0 → fără scriere în bază. Orice pas picat = nu se scrie nimic (cod ≠ 0).
set -uo pipefail
AICI="$(cd "$(dirname "$0")" && pwd)"; ENV="${LDE_ENV:-/root/lde-worker/.env}"
cd "$AICI" || exit 1
SAPT=${1:-$(date -d "-$(( $(date +%u) + 6 )) days" +%F)}   # lunea săptămânii trecute
[ "$(date -d "$SAPT" +%u)" = 1 ] || { echo "$SAPT nu e luni"; exit 2; }
# copia trebuie să fie a lui sebn-liber.mjs de azi (altfel flota hărții s-ar despărți de raportul SEBN)
MD5_LIBER=bb750dba38affaf41c3c9d7b6ccaabe3
[ "$(md5sum ../sebn-liber.mjs | cut -d' ' -f1)" = "$MD5_LIBER" ] || { echo "sebn-liber.mjs s-a schimbat (md5 ≠ $MD5_LIBER) — refă sebn-dump.mjs din el, apoi md5-ul de aici" >&2; exit 3; }
mkdir -p date; find date -name '*.json' -mtime +21 -delete
DUMP="date/dump-$SAPT.json"; PARC="date/parcare-$SAPT.json"; HARTA="date/harta-$SAPT.json"
W=(--write); [ "${SEBN_PARCARE_WRITE:-1}" = 0 ] && W=()
echo "=== $(date '+%F %T') harta SEBN cu parcarea, săptămâna $SAPT"
flock -w 600 /tmp/sebn-parcare.lock timeout 900 node --env-file="$ENV" sebn-dump.mjs --saptamina "$SAPT" --dump "$DUMP" > "date/dump-$SAPT.log" 2>&1 \
  || { echo "sebn-dump a picat ($SAPT) — vezi date/dump-$SAPT.log" >&2; tail -5 "date/dump-$SAPT.log" >&2; exit 1; }
tail -1 "date/dump-$SAPT.log"
timeout 900 node sebn-parcare.mjs "$DUMP" "$PARC" || { echo "sebn-parcare: calculul a picat ($DUMP)" >&2; exit 1; }
timeout 600 node --env-file="$ENV" sebn-harta.mjs "$DUMP" "$PARC" "$HARTA" ${W[@]+"${W[@]}"} || { echo "sebn-harta a picat — baza neatinsă sau săptămâna de rescris ($PARC)" >&2; exit 1; }
echo "=== $(date '+%F %T') gata"
