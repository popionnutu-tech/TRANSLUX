#!/usr/bin/env bash
# Raportul săptămânal al celor trei reguli la LEAR Ungheni (ION-48).
#
# Ion, 24.09.2026: «fiecare săptămână duminica lansează pe VPS cron de verificare rută și îmi dă
# analitica în raportul care va fi în deploy sub lde».
#
# Rulează duminică SEARA, după ce s-a încheiat săptămâna, nu dimineața: raportul vorbește despre
# săptămâna care tocmai s-a terminat, iar duminica ei trebuie să fie întreagă în urmă.
# Cron: 0 22 * * 0
set -euo pipefail
cd /root/lde-worker
exec flock -n /tmp/lear-analiza.lock \
  node --env-file=.env lear-analiza.mjs --write
