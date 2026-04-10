import sharp from 'sharp';
import opentype from 'opentype.js';
import fs from 'fs';

const fontR = opentype.parse(fs.readFileSync('apps/web/public/fonts/OpenSans-Regular.ttf').buffer);
const fontB = fontR; // variable font used for both weights

function textToPath(font, text, x, y, fontSize, fill, anchor) {
  const p = font.getPath(text, 0, 0, fontSize);
  const bb = p.getBoundingBox();
  const w = bb.x2 - bb.x1;
  let ox = x;
  if (anchor === 'middle') ox = x - w / 2;
  ox -= bb.x1;
  const pp = font.getPath(text, ox, y, fontSize);
  const d = pp.toPathData(2);
  if (!d) return '';
  return `<path d="${d}" fill="${fill}"/>`;
}

// Quick test with Romanian diacritics
const test = textToPath(fontR, 'Grimăncăuți / Tețcani / Șirăuți', 50, 50, 20, '#333');
console.log('Diacritics path length:', test.length > 100 ? 'OK (' + test.length + ' chars)' : 'EMPTY');

const T=308, H=62, DX=95, NX=335, CX=500, PX=700;
const rows=[
  {d:'Lipcani',v:'Grimăncăuți/Briceni/Edineț',n:'02:35',c:'10:40',p:'37369657959',nm:'Igor'},
  {d:'Criva (Tețcani)',v:'Drepcăuți/Briceni/Edineț',n:'02:40',c:'13:55',p:'37360381548',nm:'Roma'},
  {d:'Grimăncăuți',v:'Briceni/Edineț/Bălți',n:'03:00',c:'11:20',p:'37369342563',nm:'Mihail'},
  {d:'Lipcani (Viișoara)',v:'Bălți/Edineț/Badragii',n:'04:05',c:'13:00',p:'37360233622',nm:'Serghei'},
  {d:'Briceni',v:'Edineț/Bălți',n:'05:45',c:'17:50',p:'37369585883',nm:'Serghei'},
  {d:'Criva (Larga)',v:'Larga/Briceni/Edineț/Bălți',n:'06:00',c:'12:30',p:'37369379903',nm:'Serghei'},
  {d:'Lipcani',v:'Briceni/Edineț/Bălți',n:'06:10',c:'14:15',p:'37369131315',nm:'Octavii'},
  {d:'Corjeuți',v:'Trinca/Edineț/Bălți',n:'06:17',c:'11:43',p:'37360032746',nm:'Igor'},
  {d:'Lipcani',v:'Briceni/Edineț/Bălți',n:'06:35',c:'13:30',p:'37368950383',nm:'Pavel'},
  {d:'Caracusenii Vechi',v:'Trinca/Edineț/Bălți',n:'07:00',c:'16:15',p:'37369516456',nm:'Iurii'},
  {d:'Criva',v:'Briceni/Edineț/Bălți',n:'07:05',c:'15:15',p:'37369593998',nm:'Victor'},
  {d:'Criva (Larga)',v:'Larga/Briceni/Edineț',n:'07:25',c:'14:50',p:'37379469912',nm:'Oleg'},
  {d:'Ocnița',v:'Ruseni/Palade/Edineț',n:'08:00',c:'15:55',p:'37369936073',nm:'Lionid'},
  {d:'Corjeuți (Briceni)',v:'Briceni/Edineț/Bălți',n:'08:00',c:'17:20',p:'37369500982',nm:'Victor'},
];

let paths = textToPath(fontB, 'Grafic din: 03.04.2026.', 448, 92, 18, '#4a2028', 'middle');
for (let i = 0; i < rows.length; i++) {
  const r = rows[i], cy = T + i * H, ty = cy - 8, by = cy + 10;
  paths += textToPath(fontB, r.d, DX, ty, 14, '#333');
  paths += textToPath(fontR, r.v, DX, by, 10, '#666');
  paths += textToPath(fontB, r.n, NX, cy + 2, 18, '#333', 'middle');
  paths += textToPath(fontB, r.c, CX, cy + 2, 18, '#333', 'middle');
  paths += textToPath(fontR, r.p, PX, ty, 13, '#333', 'middle');
  paths += textToPath(fontB, r.nm, PX, by, 13, '#333', 'middle');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="896" height="1200">${paths}</svg>`;
await sharp('apps/web/public/templates/schedule-p1.png')
  .composite([{ input: Buffer.from(svg) }])
  .png()
  .toFile('/tmp/test-grafic-full.png');

console.log('Done: /tmp/test-grafic-full.png');
