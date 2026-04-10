import sharp from 'sharp';

const W = 896, H = 1200;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;

// Fine grid: every 5px blue, every 25px red with labels
for (let y = 25; y <= 1200; y += 5) {
  if (y % 25 === 0) {
    svg += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(255,0,0,0.5)" stroke-width="0.7"/>`;
    svg += `<text x="2" y="${y-1}" style="font-size:7px;fill:red">${y}</text>`;
  } else {
    svg += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(0,0,255,0.1)" stroke-width="0.3"/>`;
  }
}
for (let x = 25; x <= W; x += 25) {
  if (x % 50 === 0) {
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="rgba(0,180,0,0.3)" stroke-width="0.5"/>`;
    svg += `<text x="${x+1}" y="8" style="font-size:6px;fill:green">${x}</text>`;
  }
}

svg += '</svg>';
await sharp('apps/web/public/templates/schedule-p1.png')
  .composite([{ input: Buffer.from(svg) }]).png().toFile('/tmp/grid-p1-fine.png');
console.log('Done');
