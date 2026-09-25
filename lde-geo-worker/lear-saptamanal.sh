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
# backfill-gps.sh. Un worker picat sau lock ocupat nu oprește celelalte uzine (ION-62); codul de ieșire ≠ 0.
set -uo pipefail
LDE_DIR="${LDE_DIR:-/root/lde-worker}"
LOCK="${LOCK:-/tmp/lear-analiza.lock}"
BASE="${ADMIN_BASE_URL:-https://central-hub-md.vercel.app}"
cd "$LDE_DIR"

env_val() { grep -E "^$1=" .env | cut -d= -f2- | tr -d "\"'\r"; }
picat=0

# Cele trei uzine sunt independente (ION-62, 25.09): un worker picat nu oprește nici workerii următori, nici
# curl-urile — ruta uzinei fără raport trimite singură «raportul lipsește» către ADMIN, așa se află. Codul de
# ieșire rămâne ≠ 0 dacă a picat ceva.
if ! flock -n "$LOCK" node --env-file=.env lear-analiza.mjs --write; then
  echo "lear-analiza: rularea a picat sau lock-ul e ocupat" >&2; picat=1
fi

# LEAR Florești (ION-59): aceeași analiză, alt schelet și altă poartă; lock separat.
if ! flock -n "${LOCK_FLORESTI:-/tmp/lear-analiza-floresti.lock}" node --env-file=.env lear-analiza.mjs --uzina LEAR_FLORESTI --write; then
  echo "lear-analiza LEAR_FLORESTI: rularea a picat sau lock-ul e ocupat" >&2; picat=1
fi

# SEBN Orhei + Strășeni (ION-60): doar timpul liber și brambura, cu același modul (lear-timp-liber.mjs).
# Scheletul fix vine din repo (apps/admin/public/lde/schelet-sebn.json → sebn-schelet.json lângă worker).
if ! flock -n "${LOCK_SEBN:-/tmp/sebn-liber.lock}" node --env-file=.env sebn-liber.mjs --write; then
  echo "sebn-liber: rularea a picat sau lock-ul e ocupat" >&2; picat=1
fi

CRON_SECRET="$(env_val CRON_SECRET || true)"
[ -n "$CRON_SECRET" ] || { echo "CRON_SECRET lipsește din .env — rapoartele sunt scrise, mesajele nu pleacă" >&2; exit 1; }
cheama() {  # o rută de cron; picată = se scrie și se merge mai departe
  curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/$1" || { echo "$1: a picat" >&2; picat=1; }
  echo
}
# SEBN (ION-60): posterul «cât se putea economisi» + întrebarea despre primele 3 mașini critice, în grupa
# livrărilor de uzină. Singurul poster SEBN de luni (Ion, 25.09) — cel vechi de livrare nu mai pleacă.
cheama "sebn-optimizari"
# LEAR Ungheni și Florești (ION-57/59/62): posterul, apoi indicațiile pentru Alexei, apoi mesajul ADMIN.
cheama "lde-timp-liber"
cheama "lde-timp-liber?uz=floresti"
exit $picat
