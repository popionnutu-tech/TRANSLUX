#!/usr/bin/env bash
# Nerecul cu APELANȚII REALI (S5): sebn-liber.mjs și lear-analiza.mjs (Ungheni, Florești) rulați FĂRĂ --write, o dată cu modulul
# de pe VPS și o dată cu prototipul; ieșirile JSON comparate. Copiile stau în drax/cod/saptamanal/nerecul/{vechi,nou}/; nimic scris
# în bază; cache-urile Valhalla ale LEAR sunt copii (originalele neatinse).
set -euo pipefail
# Triaj r2 (S-N1): căile modulelor sunt ARGUMENTE — se rulează ÎNAINTE de a copia modulul nou peste cel vechi
# (sau cu .bak-<data> ca «vechi» dacă pasul se reia după copiere); altfel compară modulul cu el însuși.
#   bash nerecul2.sh <modul vechi> <modul nou> <luni> [<luni> …]
R=/root/lde-worker; N=$R/drax/cod/saptamanal/nerecul
VECHI="${1:?modulul vechi}"; NOU="${2:?modulul nou}"; shift 2; SAPT=("${@:-2026-09-14}")
cmp -s "$VECHI" "$NOU" && { echo "vechi = nou (același fișier) — nereculul n-ar dovedi nimic" >&2; exit 2; }
[ -d $N ] && mv $N $N-$(date +%s); mkdir -p $N/vechi $N/nou $N/out
for v in vechi nou; do
  if [ $v = vechi ]; then MOD="$VECHI"; else MOD="$NOU"; fi
  for f in sebn-liber.mjs lear-analiza.mjs; do
    sed -e "s|from './places-index.mjs'|from '$R/places-index.mjs'|" -e "s|from './ora-locala.mjs'|from '$R/ora-locala.mjs'|" \
        -e "s|from './lear-timp-liber.mjs'|from '$MOD'|" $R/$f > $N/$v/$f
  done
  # sebn-liber n-are --json: rezultatul se scrie în fișier doar dacă NERECUL_JSON e dat (linie adăugată doar în copie)
  sed -i "s|^if (WRITE) {|if (process.env.NERECUL_JSON) (await import('node:fs')).writeFileSync(process.env.NERECUL_JSON, JSON.stringify(rezultat));\nif (WRITE) {|" $N/$v/sebn-liber.mjs
  cp $R/lear-drumuri-v2.json $N/$v/lear-drumuri-v2.json; cp $R/floresti-drumuri.json $N/$v/floresti-drumuri.json 2>/dev/null || true
  grep -c "$MOD" $N/$v/*.mjs
done
cd $R
rez=0
for W in "${SAPT[@]}"; do
for v in vechi nou; do
  SEBN_SCHELET=$R/sebn-schelet.json NERECUL_JSON=$N/out/sebn-$v.json node --env-file=.env $N/$v/sebn-liber.mjs --saptamina $W > $N/out/sebn-$v.log 2>&1
  LEAR_SCHELET=$R/lear-schelet.json LEAR_DRUMURI=$N/$v/lear-drumuri-v2.json LEAR_RUTE_MASINI=$R/lear-rute-masini.json LEAR_SATE=$R/lear-sate.json \
    node --env-file=.env $N/$v/lear-analiza.mjs --saptamina $W --json $N/out/lear-$v.json > $N/out/lear-$v.log 2>&1
  FLORESTI_SCHELET=$R/floresti-schelet.json FLORESTI_DRUMURI=$N/$v/floresti-drumuri.json FLORESTI_RUTE_MASINI=$R/floresti-rute-masini.json FLORESTI_SATE=$R/floresti-sate.json \
    node --env-file=.env $N/$v/lear-analiza.mjs --uzina LEAR_FLORESTI --saptamina $W --json $N/out/floresti-$v.json > $N/out/floresti-$v.log 2>&1
done
for k in sebn lear floresti; do
  if [ -s $N/out/$k-nou.json ] && cmp -s $N/out/$k-vechi.json $N/out/$k-nou.json; then echo "$W $k: IDENTIC ($(stat -c %s $N/out/$k-nou.json) octeți)"; else echo "$W $k: DIFERĂ sau lipsă"; rez=1; fi
done
done
exit $rez
