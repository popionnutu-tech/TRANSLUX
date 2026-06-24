#!/bin/bash
# LDE worker nopți — rulează GPS (ziua de ieri) + import Benzol. Cron: 0 3 * * *
# Logă în nightly.log. Idempotent (re-rularea nu dublează).
cd /root/lde-worker || exit 1
Y=$(TZ=Europe/Chisinau date -d yesterday +%F)
echo "===== $(TZ=Europe/Chisinau date '+%F %T') | ziua $Y =====" >> nightly.log
node --env-file=.env gps-worker.mjs "$Y" --write >> nightly.log 2>&1
node --env-file=.env fuel-worker.mjs --write >> nightly.log 2>&1
echo "----- gata -----" >> nightly.log
