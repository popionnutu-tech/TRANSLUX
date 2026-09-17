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
# Valorile din .env sunt ghilimelate. Fără curățarea ghilimelelor ele intră în antetul
# Authorization și endpointul răspunde 401 — prima rulare, 17.09, a murit exact aici,
# după prima zi, fiindcă `set -e` + `curl -fsS` opresc tot.
env_val() { grep -E "^$1=" .env | cut -d= -f2- | tr -d "\"'\r"; }

CRON_SECRET="$(env_val CRON_SECRET)"
[ -n "$CRON_SECRET" ] || { echo "CRON_SECRET lipsește din .env"; exit 1; }

# Fără legătură la tracker nu are rost să pornim: ar reimporta zile goale peste zile goale.
TH="$(env_val TRACKER_HOST)"
TP="$(env_val TRACKER_PORT)"
if ! timeout 8 bash -c "echo > /dev/tcp/$TH/$TP" 2>/dev/null; then
  echo "baza trackerului tot nu răspunde — nu pornesc recuperarea"; exit 2
fi

# O zi căzută (import sau verificare) NU oprește recuperarea celorlalte: la sfârșit se
# spune care au eșuat și se iese cu cod ≠ 0. Altfel o singură zi proastă din șapte
# lasă restul săptămânii neimportată, fără ca nimeni să observe.
ESUATE=()
ZI="$DE_LA"
while [[ "$ZI" < "$PANA_LA" || "$ZI" == "$PANA_LA" ]]; do
  echo "===== recuperez $ZI ====="
  if ! node --env-file=.env gps-worker.mjs "$ZI" --write; then
    echo "!! import eșuat pentru $ZI"; ESUATE+=("$ZI:import")
  elif ! curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
       "$BASE/api/cron/lde-verifica-atribuiri?date=$ZI&reverify=1"; then
    echo "!! verificare eșuată pentru $ZI"; ESUATE+=("$ZI:verificare")
  fi
  echo
  ZI="$(TZ=Europe/Chisinau date -d "$ZI + 1 day" +%F)"
done

if [ ${#ESUATE[@]} -gt 0 ]; then
  echo "----- ESUATE: ${ESUATE[*]} -----"; exit 1
fi
echo "----- gata: $DE_LA … $PANA_LA -----"
