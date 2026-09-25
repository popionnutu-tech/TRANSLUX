#!/usr/bin/env bash
# Raportul săptămânal LEAR Ungheni (ION-48) + mesajul de luni către ADMIN (ION-57).
#
# Rulează LUNI la 08:00, nu duminică seara: ziua de lucru se taie la 03:00, iar drumurile de
# poziționare din noaptea de duminică își au ancora (sosirea la poartă) abia până la 07:30 —
# rulate mai devreme, ar ieși «timp liber». Workerul ia singur săptămâna lui «ieri».
# Cron: 0 8 * * 1
#
# Mesajul pleacă din ACELAȘI script, după ce raportul e scris: un cron separat ar fi putut
# porni înaintea lui. Fără `exec` — `exec flock` înlocuia shell-ul și nimic de după el nu rula.
# Cheia se citește explicit din .env (node --env-file nu exportă nimic în shell), ca în
# backfill-gps.sh. Lock ocupat sau worker picat → niciun mesaj, cod ≠ 0.
set -euo pipefail
LDE_DIR="${LDE_DIR:-/root/lde-worker}"
LOCK="${LOCK:-/tmp/lear-analiza.lock}"
BASE="${ADMIN_BASE_URL:-https://central-hub-md.vercel.app}"
cd "$LDE_DIR"

env_val() { grep -E "^$1=" .env | cut -d= -f2- | tr -d "\"'\r"; }

if ! flock -n "$LOCK" node --env-file=.env lear-analiza.mjs --write; then
  echo "lear-analiza: rularea a picat sau lock-ul e ocupat — mesajul nu pleacă" >&2
  exit 1
fi

# LEAR Florești (ION-59): aceeași analiză, alt schelet și altă poartă. Lock separat; dacă pică, Ungheni
# rămâne scris și mesajul lui pleacă oricum — Floreștiul n-are încă mesaj de luni.
if ! flock -n "${LOCK_FLORESTI:-/tmp/lear-analiza-floresti.lock}" node --env-file=.env lear-analiza.mjs --uzina LEAR_FLORESTI --write; then
  echo "lear-analiza LEAR_FLORESTI: rularea a picat sau lock-ul e ocupat" >&2
fi

CRON_SECRET="$(env_val CRON_SECRET || true)"
[ -n "$CRON_SECRET" ] || { echo "CRON_SECRET lipsește din .env — raportul e scris, mesajul nu pleacă" >&2; exit 1; }
curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/lde-timp-liber"
echo
