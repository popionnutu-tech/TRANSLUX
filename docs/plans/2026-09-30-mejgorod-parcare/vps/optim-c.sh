#!/usr/bin/env bash
# ION-149 cercetare: regula lui Ion 25.09 (parcare.mjs + optim2.mjs) pe COPIA din cercetare/, săptămâna 20–28.09, apoi sumarul
set -euo pipefail
cd /root/lde-worker/mejgorod-parcare/cercetare/cod
export SUFIX=-c
node --env-file=/root/lde-worker/.env parcare.mjs | tail -1
node optim2.mjs | tail -1
node sumar.mjs > ../sumar.txt 2>&1
cat ../sumar.txt
