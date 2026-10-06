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
# ION-143: analiza scrie și dump-ul săptămânii (urma + rutele), din care lear-parcare/lant.sh calculează locurile optime de parcare
# (date.parcare în rândul LEAR + lde_harta_zi). Parcarea picată nu atinge raportul; LEAR_PARCARE=0 o sare.
mkdir -p lear-parcare/date
# ION-263 (R-PAUZĂ): lear-analiza NU mai scrie singură (fără --write) — scrie raportul în JSON, iar lant.sh îl scrie în bază după ce
# lear-parcare.mjs a găsit cursele cu oameni și regula 3 s-a socotit pe pauze (lear-r3-pauze.mjs). Cu LEAR_PARCARE=0 raportul se scrie neschimbat.
rm -f lear-parcare/date/ungheni-raport.json lear-parcare/date/floresti-raport.json
if ! flock -n "$LOCK" node --env-file=.env lear-analiza.mjs --json lear-parcare/date/ungheni-raport.json --dump lear-parcare/date/ungheni.json; then
  echo "lear-analiza: rularea a picat sau lock-ul e ocupat" >&2; picat=1
elif [ "${LEAR_PARCARE:-1}" = 0 ]; then
  node --env-file=.env lear-parcare/lear-r3-pauze.mjs lear-parcare/date/ungheni-raport.json - --write || { echo "raportul Ungheni n-a putut fi scris" >&2; picat=1; }
elif ! bash lear-parcare/lant.sh lear-parcare/date/ungheni.json lear-parcare/date/ungheni-raport.json; then
  echo "lear-parcare Ungheni a picat" >&2; picat=1
fi

# LEAR Florești (ION-59): aceeași analiză, alt schelet și altă poartă; lock separat.
if ! flock -n "${LOCK_FLORESTI:-/tmp/lear-analiza-floresti.lock}" node --env-file=.env lear-analiza.mjs --uzina LEAR_FLORESTI --json lear-parcare/date/floresti-raport.json --dump lear-parcare/date/floresti.json; then
  echo "lear-analiza LEAR_FLORESTI: rularea a picat sau lock-ul e ocupat" >&2; picat=1
elif [ "${LEAR_PARCARE:-1}" = 0 ]; then
  node --env-file=.env lear-parcare/lear-r3-pauze.mjs lear-parcare/date/floresti-raport.json - --write || { echo "raportul Florești n-a putut fi scris" >&2; picat=1; }
elif ! bash lear-parcare/lant.sh lear-parcare/date/floresti.json lear-parcare/date/floresti-raport.json; then
  echo "lear-parcare Florești a picat" >&2; picat=1
fi

# SEBN Orhei + Strășeni (ION-60): doar timpul liber și brambura, cu același modul (lear-timp-liber.mjs).
# Scheletul fix vine din repo (apps/admin/public/lde/schelet-sebn.json → sebn-schelet.json lângă worker).
if ! flock -n "${LOCK_SEBN:-/tmp/sebn-liber.lock}" node --env-file=.env sebn-liber.mjs --write; then
  echo "sebn-liber: rularea a picat sau lock-ul e ocupat" >&2; picat=1
fi

# Trox + suburban Briceni (ION-73): regulile de livrare SEBN, analiza săptămânii scrisă în lde_analiza_reguli
# «BRICENI». Posterul pleacă mai jos, cu celelalte (cheama "briceni-optimizari?send=1", Ion 26.09).
# Stă înaintea verificării CRON_SECRET, ca să ruleze și fără cheie; 11–30 s pe săptămână (proba 25.09).
BRICENI_SAPT="${BRICENI_SAPT:-$LDE_DIR/briceni/cod/saptamanal.sh}"
LIMITA=(); command -v timeout >/dev/null && LIMITA=(timeout 90m)
if ! flock -n "${LOCK_BRICENI:-/tmp/briceni-sapt.lock}" nice -n 10 ${LIMITA[@]+"${LIMITA[@]}"} bash "$BRICENI_SAPT"; then
  echo "briceni saptamanal: rularea a picat, a depășit 90 min sau lock-ul e ocupat" >&2; picat=1
fi

# Drăxlmaier Bălți (ION-86 / ION-94): analiza săptămânii rulează separat, LUNI la 06:30 (drax-luni.sh, ION-140) — lanțul cu parcarea
# propusă durează ≈ 15 min; rândul e gata înainte de album, iar posterul «unde să stea mașina» pleacă în albumul de mai jos (livrari-luni).

CRON_SECRET="$(env_val CRON_SECRET || true)"
[ -n "$CRON_SECRET" ] || { echo "CRON_SECRET lipsește din .env — rapoartele sunt scrise, mesajele nu pleacă" >&2; exit 1; }
cheama() {  # o rută de cron; picată = se scrie și se merge mai departe
  curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/$1" || { echo "$1: a picat" >&2; picat=1; }
  echo
}
# Posterele «cât se putea economisi» — SEBN (ION-60, cu întrebarea despre primele 3 mașini), Trox + suburban Briceni
# (ION-73), LEAR Ungheni și Florești (ION-57/59) — pleacă în grupa livrărilor de uzină ca O SINGURĂ postare, un album
# (ION-139, Ion 29.09: «1 postare cu toate pozele»); din ION-140 și Drăxlmaier «unde să stea mașina». Ruta scrie marcajele fiecărui poster.
cheama "livrari-luni"
# LEAR Ungheni și Florești (ION-57/59/62): fără poster (e în album) — indicațiile pentru Alexei și mesajul ADMIN de timp liber.
cheama "lde-timp-liber?poster=0"
cheama "lde-timp-liber?uz=floresti&poster=0"
# Drăxlmaier (ION-94): doar proba mesajului de timp liber (dry) — posterul, indicațiile și mesajul ADMIN NU pleacă până la «da»-ul lui Ion.
cheama "drax-optimizari?liber=1&dry=1"
# Paznicul (ION-62): ce n-a plecat ajunge la ADMIN în bot (Ion, 25.09: «dacă nu se trimit, îmi dai mie»).
cheama "lde-luni-paznic"
exit $picat
