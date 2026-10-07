#!/usr/bin/env bash
# ION-268 K.8 — testele fixe ale lanțului LEAR, rulate ÎNAINTEA oricărei livrări (Ion, 07.10.2026: cazurile confirmate devin teste).
# Rulează lear-parcare.mjs din directorul de cod dat (implicit cel livrat) pe dump-urile fixe din teste/, fără scriere, și compară cu
# teste/asteptat.json. Cod 0 = toate trec; altfel schimbarea nu se livrează.
#   bash teste-fixe.sh [dir-cod]
set -uo pipefail
AICI="$(cd "$(dirname "$0")" && pwd)"; COD="${1:-$AICI}"; T=$AICI/teste
OUT=$(mktemp -d /tmp/lear-teste-XXXX); trap 'rm -rf "$OUT"' EXIT
cp "$T/drum-cache.json" "$OUT/drum-cache.json"
for d in dump-ungheni-0928 dump-ungheni-1005; do
  LEAR_PARCARE_CACHE="$OUT/drum-cache.json" nice -n 19 node "$COD/lear-parcare.mjs" "$T/$d.json" "$OUT/$d-parcare.json" > "$OUT/$d.log" 2>&1 \
    || { echo "lear-parcare a picat pe $d"; tail -5 "$OUT/$d.log"; exit 1; }
done
node "$T/verifica.mjs" "$OUT"
