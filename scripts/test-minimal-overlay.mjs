import sharp from 'sharp';
import opentype from 'opentype.js';
import fs from 'fs';

const font = opentype.parse(fs.readFileSync('apps/web/public/fonts/OpenSans-Regular.ttf').buffer);

function textToPath(f, text, x, y, fontSize, fill, anchor) {
  const p = f.getPath(text, 0, 0, fontSize);
  const bb = p.getBoundingBox();
  const w = bb.x2 - bb.x1;
  let ox = x;
  if (anchor === 'middle') ox = x - w / 2;
  ox -= bb.x1;
  const d = f.getPath(text, ox, y, fontSize).toPathData(2);
  return d ? `<path d="${d}" fill="${fill}"/>` : '';
}

// Layout: only date + Nr. Șofer (phone + name)
const DATE_X = 490, DATE_Y = 47;
const DRIVER_X = 785;     // Nr. Șofer column center
const TABLE_TOP = 228;    // row 1 phone Y
const ROW_HEIGHT = 67;    // row spacing
const NAME_GAP = 24;      // phone to name gap

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

// Date only (bold, italic-like, dark maroon)
paths += textToPath(font, '03.04.2026', DATE_X, DATE_Y, 22, '#4a2028');

// Nr. Șofer: phone (bold) + name (regular) for each row
for (let i = 0; i < 14; i++) {
  const phoneY = TABLE_TOP + i * ROW_HEIGHT;
  const nameY = phoneY + NAME_GAP;

  paths += textToPath(font, phones[i], DRIVER_X, phoneY, 18, '#4a2028', 'middle');
  paths += textToPath(font, names[i], DRIVER_X, nameY, 14, '#4a2028', 'middle');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="896" height="1200">${paths}</svg>`;
await sharp('apps/web/public/templates/schedule-p1.png')
  .composite([{ input: Buffer.from(svg) }]).png().toFile('/tmp/test-minimal.png');
console.log('Done');
