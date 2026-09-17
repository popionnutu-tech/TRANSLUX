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
# Recuperează ziua cu AMÂNDOI worker-ii, în ordinea din run-nightly.sh (gps-worker, apoi
# wialon-worker) — vezi comentariul de la bucla de mai jos: ordinea decide cine rămâne
# scris pentru mașinile aflate în ambele flote.
#
# Idempotent: ambii worker-i fac upsert pe (vehicle_id, date, seq), iar verificarea
# rulează cu `reverify=1` — nu atinge confirmările manuale și NU trimite push-uri sau
# alerte pentru zile vechi.
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
#
# ORDINEA E CEA DIN run-nightly.sh, ȘI ASTA CONTEAZĂ. Ambii worker-i scriu în
# `lde_gps_stops`, iar mașinile care au și device pe tracker, și unitate în Wialon
# (azi doar camionul QDQ395) sunt scrise de amândoi, pe cheia (vehicle_id, date, seq).
# Noaptea gps-worker rulează ÎNAINTEA lui wialon-worker, deci Wialon scrie ultimul și
# el rămâne. Prima versiune a scriptului ăstuia rula doar gps-worker: la recuperarea
# din 17.09 cele 44 de rânduri ale lui QDQ395 din 09–15.09 au fost rescrise peste
# cele bune din Wialon și au trebuit readuse manual. Acum ziua se recuperează cu
# ambii, în aceeași ordine — Wialon rămâne sursa de adevăr pentru camioane.
#
# Cum se recunoaște poluarea, dacă se mai întâmplă: `is_base` e pus doar de gps-worker
# (prima/ultima oprire a unei mașini LDE); wialon-worker scrie mereu `false`.
ESUATE=()
ZI="$DE_LA"
while [[ "$ZI" < "$PANA_LA" || "$ZI" == "$PANA_LA" ]]; do
  echo "===== recuperez $ZI ====="
  if ! node --env-file=.env gps-worker.mjs "$ZI" --write; then
    echo "!! import autobuze eșuat pentru $ZI"; ESUATE+=("$ZI:autobuze")
  elif ! node --env-file=.env wialon-worker.mjs "$ZI" --write; then
    # camionul rămâne cu rândurile scrise de gps-worker — ore mutate, is_base fals
    echo "!! import camioane eșuat pentru $ZI"; ESUATE+=("$ZI:camioane")
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
# Cursele și etalonul, după ce zilele au fost reimportate: altfel rândurile de abatere
# rămân cele fictive din perioada căzută și intră în fereastra etalonului.
node --env-file=.env etalon-aggregate.mjs --write

echo "----- gata: $DE_LA … $PANA_LA -----"
