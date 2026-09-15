// Probă pe viu, FĂRĂ Telegram: desenează imaginea cu prețurile noi într-un fișier.
//   cd apps/admin && node --env-file=.env --import tsx scripts/dry-price-image.mts <apply_on> <iesire.png>
const pick = async (p: string) => { const m: any = await import(p); return m.default ?? m; };

const P: any = await pick('../src/lib/price-popular');
const I: any = await pick('../src/lib/price-image');

const applyOn = process.argv[2] ?? '2026-09-18';
const out = process.argv[3] ?? '/tmp/preturi.png';

const zi = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

const { randuri, tarifVechi, tarifNou } = await P.comparaPreturi(zi(applyOn, -1), applyOn);
console.log('tarif vechi', tarifVechi, '→ tarif nou', tarifNou);
for (const r of randuri) console.log(`${r.from_ro} - ${r.to_ro}: ${r.vechi} → ${r.nou}`);

const png = await I.generatePriceImage({ randuri, aplicaDin: applyOn, site: 'translux.md', oferta: P.ofertaBalti(tarifNou.rateLong) });
const fs = await import('fs');
fs.writeFileSync(out, png);
console.log('scris', out, png.length, 'octeți');
