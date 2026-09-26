#!/usr/bin/env bash
# Testul argumentelor lui saptamanal.sh (S1, S-N3): nimic nu rulează, DRAX_ARGS_ONLY=1 doar tipărește ce a înțeles.
# «Acum» e fixat cu DRAX_ACUM, ca rezultatul să nu depindă de ziua rulării testului.
#   bash saptamanal.test.sh     (GNU date; pe VPS)
set -u
S="$(cd "$(dirname "$0")" && pwd)/saptamanal.sh"; esueaza=0
caz() {  # nume, «acum», cod așteptat, ieșire așteptată (grep), argumente…
  local nume="$1" acum="$2" cod="$3" astept="$4"; shift 4
  local out; out=$(DRAX_ARGS_ONLY=1 DRAX_ACUM="$acum" bash "$S" "$@" 2>&1); local c=$?
  if [ "$c" -ne "$cod" ] || ! grep -q -- "$astept" <<<"$out"; then echo "✗ $nume: cod=$c ieșire=«$out»"; esueaza=1; else echo "✓ $nume"; fi
}
LUNI8="2026-09-28 08:00"; SAMBATA="2026-09-26 19:00"; LUNI2="2026-09-28 02:30"
caz "luni 08:00, fără argumente → săptămâna lui ieri, fără scriere" "$LUNI8" 0 "LUNI=2026-09-21 DUM=2026-09-27 WRITE=nu"
caz "luni 08:00, --write (forma blocului) → săptămâna încheiată"    "$LUNI8" 0 "LUNI=2026-09-21 DUM=2026-09-27 WRITE=--write" --write
caz "--write 2026-09-14"                                           "$SAMBATA" 0 "LUNI=2026-09-14 DUM=2026-09-20 WRITE=--write" --write 2026-09-14
caz "2026-09-16 --write (ordinea nu contează, miercuri → luni)"   "$SAMBATA" 0 "LUNI=2026-09-14 DUM=2026-09-20 WRITE=--write" 2026-09-16 --write
caz "2026-09-20 (duminica e în săptămâna ei)"                      "$SAMBATA" 0 "LUNI=2026-09-14 DUM=2026-09-20 WRITE=nu" 2026-09-20
caz "sâmbătă, --write fără dată → săptămâna curentă, refuzat"      "$SAMBATA" 2 "nu e încheiată" --write
caz "luni 02:30, --write → duminica nu s-a închis, refuzat"        "$LUNI2" 2 "nu e încheiată" --write
caz "sâmbătă, fără --write → citirea săptămânii curente e permisă" "$SAMBATA" 0 "LUNI=2026-09-21 DUM=2026-09-27 WRITE=nu"
caz "argument necunoscut → 2"                                      "$SAMBATA" 2 "argument necunoscut" --xyz
caz "dată nevalidă → 2"                                            "$SAMBATA" 2 "dată nevalidă" 2026-13-45
# R3-5: proba fără --write pe săptămâna neîncheiată lucrează în _ciorna (nu îngheață instantaneul lunii următoare)
dosar() { local nume="$1" acum="$2" astept="$3"; shift 3; local out; out=$(DRAX_DOSAR_ONLY=1 DRAX_BAZA=/tmp/drax-baza-test DRAX_ACUM="$acum" bash "$S" "$@" 2>&1); local c=$?
  if [ "$c" -ne 0 ] || ! grep -q -- "$astept" <<<"$out"; then echo "✗ $nume: cod=$c ieșire=«$out»"; esueaza=1; else echo "✓ $nume"; fi; }
dosar "sâmbătă, probă pe săptămâna curentă → _ciorna"          "$SAMBATA" "ECON_D=/tmp/drax-baza-test/_ciorna/2026-09-21"
dosar "sâmbătă, probă pe o săptămână încheiată → dosarul ei"   "$SAMBATA" "ECON_D=/tmp/drax-baza-test/2026-09-14" 2026-09-14
dosar "luni 08:00, --write → dosarul săptămânii, nu _ciorna"   "$LUNI8"   "ECON_D=/tmp/drax-baza-test/2026-09-21" --write
exit $esueaza
