// Pentru proba R1 (ruleaza-v3.sh --proba-R1): cheia «rută|linie» a primei linii din act cu ideal din schelet (citire).
import { readFileSync } from 'node:fs';
const S = JSON.parse(readFileSync(process.argv[2], 'utf8')); const l = S.find(x => !x.gps && x.km);
process.stdout.write(`${l.ruta}|${l.linie}`);
