#!/bin/bash
# ION-123 r2 — rulare pe VPS pe COPIA cache-ului Valhalla (nimic scris în /root/lde-worker)
#   varianta principală: observațiile GPS din săptămână + dosarele din cele 4 dinainte (inclusiv _ciorna/2026-09-07-ion107)
#   diagnostic: OBS_CIORNA=0 (doar săptămâna 14–20.09)
set -e
mkdir -p /tmp/ion123r2
[ -f /tmp/ion123r2/economie-valhalla-cache.json ] || cp /root/lde-worker/drax/date/economie-valhalla-cache.json /tmp/ion123r2/
cd /tmp/ion123r2
ECON_D=/tmp/ion123r2 OUT=/tmp/ion123r2/ziua-ideala-v2.json node /tmp/ion123r2/ziua-ideala-v2.mjs > /tmp/ion123r2/stdout.json 2> /tmp/ion123r2/stderr.log
ECON_D=/tmp/ion123r2 OBS_CIORNA=0 OUT=/tmp/ion123r2/ziua-ideala-v2-fara-ciorna.json node /tmp/ion123r2/ziua-ideala-v2.mjs > /tmp/ion123r2/stdout-fara-ciorna.json 2>> /tmp/ion123r2/stderr.log
cat /tmp/ion123r2/stderr.log
