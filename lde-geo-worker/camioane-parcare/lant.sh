#!/bin/bash
# ION-150 — harta cisternelor pe săptămâna trecută (luni–duminică) → lde_harta_zi 'CAMIOANE' + controlul flotei în lde_analiza_reguli.
# Cron luni 09:00 (ora Moldovei), după verificarea zilnică ION-144 de la 07:30 (urmele de duminică și rândurile lde_truck_route_checks).
# Rulare de mână: lant.sh [AAAA-LL-ZZ luni] — fără argument, săptămâna trecută. Nu atinge camioane/verif și nici cronurile lor.
# Fișierele: harta.mjs, harta-core.mjs, date/schelet-camioane.json (copie din apps/admin/public/lde), date/loc-4tari.json (loc-compact.mjs pe mini).
set -u
cd /root/lde-worker/camioane-parcare || exit 1
SAPT=${1:-$(date -d "-$(( $(date +%u) + 6 )) days" +%F)}   # lunea săptămânii trecute
[ "$(date -d "$SAPT" +%u)" = 1 ] || { echo "$SAPT nu e luni"; exit 2; }
echo "=== $(date '+%F %T') harta cisternelor, săptămâna $SAPT"
flock -w 600 /tmp/camioane-trage.lock timeout 600 node --env-file=/root/lde-worker/.env harta.mjs --sapt="$SAPT" --write
