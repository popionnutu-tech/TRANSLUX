#!/usr/bin/env bash
# Testul scriptului săptămânal (ION-57), fără VPS: node, curl și flock sunt FALSE, în PATH.
#   worker OK              → exact un apel curl
#   worker picat           → zero apeluri, cod ≠ 0
#   lock ocupat            → zero apeluri, cod ≠ 0
#   .env fără CRON_SECRET  → zero apeluri, cod ≠ 0
# Rulare: bash lde-geo-worker/lear-saptamanal.test.sh
set -u
AICI="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/lde"
cat > "$T/bin/node" <<'EOF'
#!/usr/bin/env bash
exit "${FAKE_NODE_EXIT:-0}"
EOF
cat > "$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_CURL_LOG"
EOF
cat > "$T/bin/flock" <<'EOF'
#!/usr/bin/env bash
[ "${FAKE_LOCK_BUSY:-0}" = 1 ] && exit 1
shift 2          # -n <lock>
exec "$@"
EOF
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH" LDE_DIR="$T/lde" LOCK="$T/lock" FAKE_CURL_LOG="$T/curl.log"
esueaza=0
caz() {  # nume, apeluri așteptate, cod așteptat (0 sau nenul)
  : > "$FAKE_CURL_LOG"
  bash "$AICI/lear-saptamanal.sh" >/dev/null 2>&1; local cod=$?
  local n; n=$(grep -c . "$FAKE_CURL_LOG" || true)
  if [ "$n" -ne "$2" ] || { [ "$3" = 0 ] && [ "$cod" -ne 0 ]; } || { [ "$3" != 0 ] && [ "$cod" -eq 0 ]; }; then
    echo "✗ $1: apeluri=$n (așteptat $2), cod=$cod (așteptat $3)"; esueaza=1
  else echo "✓ $1"; fi
}
printf 'CRON_SECRET="secret-de-test"\n' > "$T/lde/.env"
FAKE_NODE_EXIT=0 FAKE_LOCK_BUSY=0 caz "worker OK → un apel"         1 0
grep -q "Bearer secret-de-test" "$FAKE_CURL_LOG" || { echo "✗ antetul nu poartă cheia curățată de ghilimele"; esueaza=1; }
FAKE_NODE_EXIT=1 FAKE_LOCK_BUSY=0 caz "worker picat → niciun apel"   0 1
FAKE_NODE_EXIT=0 FAKE_LOCK_BUSY=1 caz "lock ocupat → niciun apel"    0 1
printf 'ALTCEVA=1\n' > "$T/lde/.env"
FAKE_NODE_EXIT=0 FAKE_LOCK_BUSY=0 caz "fără CRON_SECRET → niciun apel" 0 1
exit $esueaza
