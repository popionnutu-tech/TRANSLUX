import fs from 'fs';
const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
const a = "plimbatA: pl ? r1(pl.a) : 0, plimbatB: pl ? r1(pl.b) : 0,";
if (s.split(a).length !== 2) throw new Error('ancoră');
s = s.replace(a, a + " plimbatMijloc: pl && !pl.tot ? r1(pl.mijloc) : null, plimbatIesiri: pl && !pl.tot ? r1(pl.iesiri) : null,");
fs.writeFileSync(F, s); console.log('ok');
