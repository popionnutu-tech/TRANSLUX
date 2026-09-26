set -euo pipefail
cd /root/lde-worker
[ "$(md5sum < lear-saptamanal.sh | cut -c1-32)" = 395206289373739933e594c86ea49dbc ] || { echo "lear-saptamanal.sh VPS ≠ origin (395206…)"; exit 1; }
diff lear-saptamanal.sh /tmp/f3x/lear-saptamanal.sh.nou | head -30 || true
cp -p lear-saptamanal.sh lear-saptamanal.sh.bak-2026-09-27
cp /tmp/f3x/lear-saptamanal.sh.nou lear-saptamanal.sh.tmp && chmod --reference=lear-saptamanal.sh lear-saptamanal.sh.tmp && mv lear-saptamanal.sh.tmp lear-saptamanal.sh
bash -n lear-saptamanal.sh && md5sum lear-saptamanal.sh && ls -la lear-saptamanal.sh*
crontab -l | grep lear-saptamanal
