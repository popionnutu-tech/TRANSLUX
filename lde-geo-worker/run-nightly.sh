#!/bin/bash
# LDE worker nopți — GPS (ziua de ieri) + import Benzol + preț motorină din TLX.
# Cron: 0 3 * * *. Logă în nightly.log. Idempotent (re-rularea nu dublează).
# NOTĂ: la 06:30 rulează pe același VPS și verificarea atribuirilor (crontab):
#   30 6 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/lde-verifica-atribuiri >> /root/lde-worker/verify-atribuiri.log 2>&1
cd /root/lde-worker || exit 1
Y=$(TZ=Europe/Chisinau date -d yesterday +%F)
echo "===== $(TZ=Europe/Chisinau date '+%F %T') | ziua $Y =====" >> nightly.log
node --env-file=.env gps-worker.mjs "$Y" --write >> nightly.log 2>&1
node --env-file=.env fuel-worker.mjs --write >> nightly.log 2>&1
node --env-file=.env price-worker.mjs 7 >> nightly.log 2>&1
node --env-file=.env wialon-worker.mjs "$Y" --write >> nightly.log 2>&1
echo "----- gata -----" >> nightly.log
