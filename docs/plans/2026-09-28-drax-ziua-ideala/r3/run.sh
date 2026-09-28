#!/bin/bash
# ION-123 r3 — rulare pe VPS pe COPIA cache-ului Valhalla (nimic scris în /root/lde-worker); fără _ciorna/ (C4/C5, runda-3.md)
set -e
mkdir -p /tmp/ion123r3
[ -f /tmp/ion123r3/economie-valhalla-cache.json ] || cp /root/lde-worker/drax/date/economie-valhalla-cache.json /tmp/ion123r3/
cd /tmp/ion123r3
ECON_D=/tmp/ion123r3 OUT=/tmp/ion123r3/ziua-ideala-v3.json node /tmp/ion123r3/ziua-ideala-v3.mjs > /tmp/ion123r3/stdout.json 2> /tmp/ion123r3/stderr.log
cat /tmp/ion123r3/stderr.log; cat /tmp/ion123r3/stdout.json
