// tipărește liniile de completat (din alege.mjs), separate prin virgulă — pentru lant.sh
import { readFileSync, existsSync } from 'node:fs';
const f = '../../date/ideal-v3.1/de-completat.json';
process.stdout.write(existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).join(',') : '');
