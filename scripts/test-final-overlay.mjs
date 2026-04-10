import sharp from 'sharp';
import opentype from 'opentype.js';
import fs from 'fs';

const fontR = opentype.parse(fs.readFileSync('apps/web/public/fonts/OpenSans-Regular.ttf').buffer);
const fontB = opentype.parse(fs.readFileSync('apps/web/public/fonts/OpenSans-Bold.ttf').buffer);

function tp(f, text, x, y, sz, fill, anchor) {
  const p = f.getPath(text, 0, 0, sz);
  const bb = p.getBoundingBox();
  let ox = x - (anchor === 'middle' ? (bb.x2 - bb.x1) / 2 : 0) - bb.x1;
  const d = f.getPath(text, ox, y, sz).toPathData(2);
  return d ? `<path d="${d}" fill="${fill}"/>` : '';
}

const DATE_X = 490, DATE_Y = 47;
const DRV_X = 785;
const T = 228, H = 67, G = 24;

const phones = [
  '069657959','060381548','069342563','060233622','069585883',
  '069379903','069131315','060032746','068950383','069516456',
  '069593998','079469912','069936073','069500982'
];
const names = [
  'Igor','Roma','Mihail','Serghei','Serghei',
  'Serghei','Octavii','Igor','Pavel','Iurii',
  'Victor','Oleg','Lionid','Victor'
];

let paths = '';
// Date (bold, ~22px)
paths += tp(fontB, '03.04.2026', DATE_X, DATE_Y, 22, '#4a2028');

for (let i = 0; i < 14; i++) {
  const py = T + i * H;
  const ny = py + G;
  // Phone: bold, 18px
  paths += tp(fontB, phones[i], DRV_X, py, 18, '#4a2028', 'middle');
  // Name: regular, 14px
  paths += tp(fontR, names[i], DRV_X, ny, 14, '#4a2028', 'middle');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="896" height="1200">${paths}</svg>`;
await sharp('apps/web/public/templates/schedule-p1.png')
  .composite([{ input: Buffer.from(svg) }]).png().toFile('/tmp/test-final.png');
console.log('Done');
