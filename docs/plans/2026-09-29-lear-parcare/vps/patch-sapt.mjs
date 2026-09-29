import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
const F = '/root/lde-worker/lear-saptamanal.sh'; let s = readFileSync(F, 'utf8');
if (s.includes('ION-143')) { console.log('deja'); process.exit(0); }
if (!existsSync(F + '.bak-ion143')) copyFileSync(F, F + '.bak-ion143');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('ancoră: ' + a.slice(0, 70)); s = s.replace(a, b); };
rep(`if ! flock -n "$LOCK" node --env-file=.env lear-analiza.mjs --write; then
  echo "lear-analiza: rularea a picat sau lock-ul e ocupat" >&2; picat=1
fi`, `# ION-143: analiza scrie și dump-ul săptămânii (urma + rutele), din care lear-parcare/lant.sh calculează locurile optime de parcare
# (date.parcare în rândul LEAR + lde_harta_zi). Parcarea picată nu atinge raportul; LEAR_PARCARE=0 o sare.
mkdir -p lear-parcare/date
if ! flock -n "$LOCK" node --env-file=.env lear-analiza.mjs --write --dump lear-parcare/date/ungheni.json; then
  echo "lear-analiza: rularea a picat sau lock-ul e ocupat" >&2; picat=1
elif [ "\${LEAR_PARCARE:-1}" != 0 ] && ! bash lear-parcare/lant.sh lear-parcare/date/ungheni.json; then
  echo "lear-parcare Ungheni a picat" >&2; picat=1
fi`);
rep(`if ! flock -n "\${LOCK_FLORESTI:-/tmp/lear-analiza-floresti.lock}" node --env-file=.env lear-analiza.mjs --uzina LEAR_FLORESTI --write; then
  echo "lear-analiza LEAR_FLORESTI: rularea a picat sau lock-ul e ocupat" >&2; picat=1
fi`, `if ! flock -n "\${LOCK_FLORESTI:-/tmp/lear-analiza-floresti.lock}" node --env-file=.env lear-analiza.mjs --uzina LEAR_FLORESTI --write --dump lear-parcare/date/floresti.json; then
  echo "lear-analiza LEAR_FLORESTI: rularea a picat sau lock-ul e ocupat" >&2; picat=1
elif [ "\${LEAR_PARCARE:-1}" != 0 ] && ! bash lear-parcare/lant.sh lear-parcare/date/floresti.json; then
  echo "lear-parcare Florești a picat" >&2; picat=1
fi`);
writeFileSync(F, s); console.log('ok');
