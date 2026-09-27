# ION-99 manifest sha256 + inode + nlink + mtime: ideal-v3, ideal-v2, idealul vechi (date/*-ideal.json, cod/ideal), ideal-activ — doar citire
cd /root/lde-worker/drax
for f in date/ideal-v3/* date/ideal-v3/proba/* date/ideal-v2/* date/*-ideal.json cod/ideal-v3/* cod/ideal-v2/* cod/ideal/*; do
  [ -f "$f" ] && printf '%s %s %s %s\n' "$(sha256sum "$f" | cut -c1-64)" "$(stat -c '%i %h' "$f")" "$(stat -c %Y "$f")" "$f"
done
printf 'ideal-activ -> %s\n' "$(readlink date/ideal-activ)"
for f in /root/lde-worker/drax/date/schelet-drax.json /root/lde-worker/drax/cod/ideal/schelet-drax.json; do [ -f "$f" ] && sha256sum "$f"; done
find /root/lde-worker -name 'schelet-drax.json' -newer /root/lde-worker/.env 2>/dev/null | head -3 | xargs -r sha256sum
