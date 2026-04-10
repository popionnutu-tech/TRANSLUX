import sharp from 'sharp';

const WIDTH = 896, HEIGHT = 1200;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">`;

// Horizontal lines every 10px, labels every 50px
for (let y = 50; y <= 1200; y += 10) {
  const color = y % 50 === 0 ? 'rgba(255,0,0,0.6)' : 'rgba(0,0,255,0.15)';
  const w = y % 50 === 0 ? 1 : 0.5;
  svg += `<line x1="0" y1="${y}" x2="896" y2="${y}" stroke="${color}" stroke-width="${w}"/>`;
  if (y % 50 === 0) svg += `<text x="3" y="${y-2}" style="font-size:8px;fill:red">${y}</text>`;
}

// Vertical lines every 50px
for (let x = 50; x <= 896; x += 50) {
  svg += `<line x1="${x}" y1="0" x2="${x}" y2="1200" stroke="rgba(0,200,0,0.3)" stroke-width="0.5"/>`;
  if (x % 100 === 0) svg += `<text x="${x+2}" y="12" style="font-size:8px;fill:green">${x}</text>`;
}

svg += '</svg>';

await sharp('apps/web/public/templates/schedule-p1.png')
  .composite([{ input: Buffer.from(svg) }])
  .png()
  .toFile('/tmp/test-grid-new.png');

console.log('Grid: /tmp/test-grid-new.png');
