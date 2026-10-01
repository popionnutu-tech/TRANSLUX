#!/usr/bin/env bash
# ION-149 cercetare: rulează un script din cod/ cu mediul lde-worker, ieșirea în ../<nume>.txt
set -uo pipefail
cd /root/lde-worker/mejgorod-parcare/cercetare/cod
S="$1"; shift
/usr/bin/time -f "%e s" node --env-file=/root/lde-worker/.env "$S.mjs" "$@" > "../$S.txt" 2>&1
tail -4 "../$S.txt"; wc -l "../$S.txt"
