#!/bin/bash
# Recuperarea zilelor pierdute de GPS-ul autobuzelor.
#
# De ce există: între 09.09 și 15.09.2026 baza trackerului (TRACKER_HOST:5432) a fost
# inaccesibilă, gps-worker.mjs a crăpat în fiecare noapte cu «connect ETIMEDOUT», iar
# verificarea de la 06:30 a marcat 191/191 curse de uzină drept `fara_date_gps` — statut
# care, prin construcție, nu alarmează pe nimeni. Când legătura revine, trackerul are
# istoricul; trebuie doar re-importat și re-judecat.
#
#   bash backfill-gps.sh 2026-09-09 2026-09-15
#
# Idempotent: gps-worker face upsert pe (vehicle_id, date), iar verificarea rulează cu
# `reverify=1` — re-judecă `nepotrivire`/`fara_date_gps`, nu atinge confirmările manuale
# și NU trimite push-uri sau alerte pentru zile vechi.
set -euo pipefail

cd /root/lde-worker || { echo "rulează pe VPS, în /root/lde-worker"; exit 1; }

DE_LA="${1:?prima zi, format YYYY-MM-DD}"
PANA_LA="${2:?ultima zi, format YYYY-MM-DD}"
BASE="${ADMIN_BASE_URL:-https://central-hub-md.vercel.app}"
CRON_SECRET="$(grep -E '^CRON_SECRET=' .env | cut -d= -f2-)"
[ -n "$CRON_SECRET" ] || { echo "CRON_SECRET lipsește din .env"; exit 1; }

# Fără legătură la tracker nu are rost să pornim: ar reimporta zile goale peste zile goale.
TH="$(grep -E '^TRACKER_HOST=' .env | cut -d= -f2-)"
TP="$(grep -E '^TRACKER_PORT=' .env | cut -d= -f2-)"
if ! timeout 8 bash -c "echo > /dev/tcp/$TH/$TP" 2>/dev/null; then
  echo "baza trackerului tot nu răspunde — nu pornesc recuperarea"; exit 2
fi

ZI="$DE_LA"
while [[ "$ZI" < "$PANA_LA" || "$ZI" == "$PANA_LA" ]]; do
  echo "===== recuperez $ZI ====="
  node --env-file=.env gps-worker.mjs "$ZI" --write
  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
    "$BASE/api/cron/lde-verifica-atribuiri?date=$ZI&reverify=1"
  echo
  ZI="$(TZ=Europe/Chisinau date -d "$ZI + 1 day" +%F)"
done
echo "----- gata: $DE_LA … $PANA_LA -----"
