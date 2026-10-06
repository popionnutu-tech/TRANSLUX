#!/usr/bin/env bash
# Testul scriptului săptămânal (ION-57), fără VPS: node, curl și flock sunt FALSE, în PATH.
# Din ION-139 posterele pleacă într-un singur album (livrari-luni), iar din ION-140 analiza Drăxlmaier rulează separat (drax-luni.sh, 06:30):
#   workeri OK             → cinci apeluri curl (album, timp liber Ungheni + Florești, Drăxlmaier dry, paznic)
#   worker picat           → tot cinci apeluri (albumul și paznicul anunță raportul lipsă), cod ≠ 0
#   lock ocupat            → tot cinci apeluri, cod ≠ 0
#   Briceni picat (ION-73) → tot cinci apeluri, cod ≠ 0
#   parcarea LEAR picată (ION-143) → tot cinci apeluri, raportul rămâne, cod ≠ 0; LEAR_PARCARE=0 → lanțul parcării nu rulează
#   .env fără CRON_SECRET  → zero apeluri, cod ≠ 0
# Rulare: bash lde-geo-worker/lear-saptamanal.test.sh
set -u
AICI="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/lde/briceni/cod" "$T/lde/lear-parcare"
# ION-73: analiza Briceni e un script bash separat; aici e fals și pică doar cu FAKE_BRICENI_EXIT
printf '#!/usr/bin/env bash\nexit "${FAKE_BRICENI_EXIT:-0}"\n' > "$T/lde/briceni/cod/saptamanal.sh"
# ION-143: lanțul parcării LEAR, fals; scrie în jurnal cu ce dump e chemat și pică doar cu FAKE_PARCARE_EXIT
# ION-263/265: al doilea argument = raportul lui lear-analiza (--json), pe care lanțul îl scrie în bază după R-PAUZĂ
printf '#!/usr/bin/env bash\necho "$1 $2" >> "$FAKE_PARCARE_LOG"\nexit "${FAKE_PARCARE_EXIT:-0}"\n' > "$T/lde/lear-parcare/lant.sh"
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
export PATH="$T/bin:$PATH" LDE_DIR="$T/lde" LOCK="$T/lock" FAKE_CURL_LOG="$T/curl.log" FAKE_PARCARE_LOG="$T/parcare.log"
esueaza=0
caz() {  # nume, apeluri așteptate, cod așteptat (0 sau nenul)
  : > "$FAKE_CURL_LOG"; : > "$FAKE_PARCARE_LOG"
  bash "$AICI/lear-saptamanal.sh" >/dev/null 2>&1; local cod=$?
  local n; n=$(grep -c . "$FAKE_CURL_LOG" || true)
  if [ "$n" -ne "$2" ] || { [ "$3" = 0 ] && [ "$cod" -ne 0 ]; } || { [ "$3" != 0 ] && [ "$cod" -eq 0 ]; }; then
    echo "✗ $1: apeluri=$n (așteptat $2), cod=$cod (așteptat $3)"; esueaza=1
  else echo "✓ $1"; fi
}
printf 'CRON_SECRET="secret-de-test"\n' > "$T/lde/.env"
printf 'CRON_SECRET="secret-de-test"\n' > "$T/lde/.env"
FAKE_NODE_EXIT=0 FAKE_LOCK_BUSY=0 caz "workeri OK → cinci apeluri (album, timp liber ×2, Drăxlmaier dry, paznic)" 5 0
grep -q "Bearer secret-de-test" "$FAKE_CURL_LOG" || { echo "✗ antetul nu poartă cheia curățată de ghilimele"; esueaza=1; }
grep -q "livrari-luni" "$FAKE_CURL_LOG" && grep -q "lde-timp-liber?poster=0" "$FAKE_CURL_LOG" && grep -q "uz=floresti&poster=0" "$FAKE_CURL_LOG" && grep -q "drax-optimizari?liber=1&dry=1" "$FAKE_CURL_LOG" && ! grep -q "drax-optimizari?poster\|drax-optimizari?indicatii" "$FAKE_CURL_LOG" && tail -1 "$FAKE_CURL_LOG" | grep -q "lde-luni-paznic" || { echo "✗ lipsește o rută din apeluri"; esueaza=1; }
# ION-143: lanțul parcării rulează după fiecare analiză LEAR, cu dump-ul ei, înaintea albumului
[ "$(tr '\n' ' ' < "$FAKE_PARCARE_LOG")" = "lear-parcare/date/ungheni.json lear-parcare/date/ungheni-raport.json lear-parcare/date/floresti.json lear-parcare/date/floresti-raport.json " ] || { echo "✗ lanțul parcării nu e chemat cu dump-urile și rapoartele Ungheni + Florești"; esueaza=1; }
# ION-62: un worker picat nu oprește celelalte uzine — rutele se cheamă oricum (raportul lipsă ajunge la ADMIN), cod ≠ 0
FAKE_NODE_EXIT=1 FAKE_LOCK_BUSY=0 caz "worker picat → tot cinci apeluri, cod ≠ 0"   5 1
[ -s "$FAKE_PARCARE_LOG" ] && { echo "✗ parcarea a rulat deși analiza a picat"; esueaza=1; }
FAKE_NODE_EXIT=0 FAKE_LOCK_BUSY=1 caz "lock ocupat → tot cinci apeluri, cod ≠ 0"    5 1
FAKE_NODE_EXIT=0 FAKE_LOCK_BUSY=0 FAKE_BRICENI_EXIT=1 caz "Briceni picat → tot cinci apeluri, cod ≠ 0" 5 1
FAKE_NODE_EXIT=0 FAKE_LOCK_BUSY=0 FAKE_PARCARE_EXIT=1 caz "parcarea LEAR picată → tot cinci apeluri, cod ≠ 0" 5 1
LEAR_PARCARE=0 FAKE_NODE_EXIT=0 FAKE_LOCK_BUSY=0 caz "LEAR_PARCARE=0 → cinci apeluri, cod 0" 5 0
[ -s "$FAKE_PARCARE_LOG" ] && { echo "✗ LEAR_PARCARE=0 n-a sărit parcarea"; esueaza=1; }
printf 'ALTCEVA=1\n' > "$T/lde/.env"
FAKE_NODE_EXIT=0 FAKE_LOCK_BUSY=0 caz "fără CRON_SECRET → niciun apel" 0 1
exit $esueaza
