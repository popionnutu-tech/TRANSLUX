#!/usr/bin/env bash
# Pune worker-ul de stări automate pe VPS-ul lde-worker și îl rulează o dată în probă.
#   bash lde-geo-worker/deploy-trip-live.sh            # copiază + probă (fără scriere)
#   bash lde-geo-worker/deploy-trip-live.sh --cron     # și instalează linia de cron (la 5 minute, --write)
# Worker-ul stă în /root/lde-worker/live/ — separat de worker-ii nocturni, ca o
# versiune nouă a wialon-api.mjs să nu-i atingă pe ei. Fără dependențe npm.
set -euo pipefail
VPS=root@217.26.149.23
KEY=~/.ssh/tlx_mev_proxy_ed25519
DIR=/root/lde-worker/live
AICI="$(cd "$(dirname "$0")" && pwd)"

ssh -i "$KEY" -o ConnectTimeout=15 "$VPS" "mkdir -p $DIR"
scp -q -i "$KEY" "$AICI"/km-core.mjs "$AICI"/wialon-api.mjs "$AICI"/trip-auto.mjs "$AICI"/camion-auto.mjs "$AICI"/trip-live-worker.mjs "$VPS:$DIR/"
echo "copiat în $VPS:$DIR"

echo "== probă (fără scriere) =="
ssh -i "$KEY" "$VPS" "cd $DIR && node --env-file=/root/lde-worker/.env trip-live-worker.mjs"

if [ "${1:-}" = "--cron" ]; then
  LINIE="*/5 * * * * cd $DIR && flock -n /tmp/trip-live.lock node --env-file=/root/lde-worker/.env trip-live-worker.mjs --write >> /root/lde-worker/trip-live.log 2>&1"
  ssh -i "$KEY" "$VPS" "(crontab -l 2>/dev/null | grep -v 'trip-live-worker.mjs'; echo \"$LINIE\") | crontab - && crontab -l | grep trip-live"
  echo "cron instalat"
fi
