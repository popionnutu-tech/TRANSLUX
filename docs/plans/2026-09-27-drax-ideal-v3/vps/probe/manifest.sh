# manifest sha256 + inode + nlink: drax/date/ideal-v2/* și drax/date/*-ideal.json (+ ideal-activ, cod/ideal-v2, cod/ideal) — doar citire
cd /root/lde-worker/drax
for f in date/ideal-v2/* date/*-ideal.json cod/ideal-v2/* cod/ideal/*; do
  [ -f "$f" ] && printf '%s %s %s %s\n' "$(sha256sum "$f" | cut -c1-64)" "$(stat -c '%i %h' "$f")" "$(stat -c %Y "$f")" "$f"
done
printf 'ideal-activ -> %s\n' "$(readlink date/ideal-activ)"
