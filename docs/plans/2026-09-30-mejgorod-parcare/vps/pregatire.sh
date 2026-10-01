#!/usr/bin/env bash
# ION-149 cercetare: copie a codului mejgorod (fără a atinge lanțul), nomenclatorul și cursele săptămânii 20–28.09
set -euo pipefail
B=/root/lde-worker/mejgorod-parcare/cercetare
mkdir -p $B/cod $B/date
for f in /root/lde-worker/mejgorod/cod/*.mjs; do install -m 644 "$f" $B/cod/; done
install -m 644 /root/lde-worker/mejgorod/date/ideal.json $B/date/
cd $B/cod
export SUFIX=-c
node --env-file=/root/lde-worker/.env nomenclator.mjs 2026-09-20 2026-09-28 | tail -2
time node --env-file=/root/lde-worker/.env curse.mjs | tail -2
