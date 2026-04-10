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
  const pp = f.getPath(text, ox, y, fontSize);
  const d = pp.toPathData(2);
  if (!d) return '';
  return `<path d="${d}" fill="${fill}"/>`;
}

const T=270, H=68, G=30, DX=75, CX=575, PX=770;
const rows=[
  {d:'Lipcani',v:'Grimăncăuți/Briceni/Edineț',c:'10:40',p:'37369657959',nm:'Igor'},
  {d:'Criva (Tețcani)',v:'Drepcăuți/Briceni/Edineț',c:'13:55',p:'37360381548',nm:'Roma'},
  {d:'Grimăncăuți',v:'Briceni/Edineț/Bălți',c:'11:20',p:'37369342563',nm:'Mihail'},
  {d:'Lipcani (Viișoara)',v:'Bălți/Edineț/Badragii',c:'13:00',p:'37360233622',nm:'Serghei'},
  {d:'Briceni',v:'Edineț/Bălți',c:'17:50',p:'37369585883',nm:'Serghei'},
  {d:'Criva (Larga)',v:'Larga/Briceni/Edineț/Bălți',c:'12:30',p:'37369379903',nm:'Serghei'},
  {d:'Lipcani',v:'Briceni/Edineț/Bălți',c:'14:15',p:'37369131315',nm:'Octavii'},
  {d:'Corjeuți',v:'Trinca/Edineț/Bălți',c:'11:43',p:'37360032746',nm:'Igor'},
  {d:'Lipcani',v:'Briceni/Edineț/Bălți',c:'13:30',p:'37368950383',nm:'Pavel'},
  {d:'Caracusenii Vechi',v:'Trinca/Edineț/Bălți',c:'16:15',p:'37369516456',nm:'Iurii'},
  {d:'Criva',v:'Briceni/Edineț/Bălți',c:'15:15',p:'37369593998',nm:'Victor'},
  {d:'Criva (Larga)',v:'Larga/Briceni/Edineț',c:'14:50',p:'37379469912',nm:'Oleg'},
  {d:'Ocnița',v:'Ruseni/Palade/Edineț',c:'15:55',p:'37369936073',nm:'Lionid'},
  {d:'Corjeuți (Briceni)',v:'Briceni/Edineț/Bălți',c:'17:20',p:'37369500982',nm:'Victor'},
];

let paths = textToPath(font, 'Grafic din: 03.04.2026.', 448, 90, 18, '#4a2028', 'middle');
for (let i = 0; i < rows.length; i++) {
  const r = rows[i], topY = T + i * H, botY = topY + G;
  paths += textToPath(font, r.d, DX, topY, 14, '#333');
  paths += textToPath(font, r.v, DX, botY, 10, '#666');
  paths += textToPath(font, r.c, CX, topY, 18, '#333', 'middle');
  paths += textToPath(font, r.p, PX, topY, 13, '#333', 'middle');
  paths += textToPath(font, r.nm, PX, botY, 13, '#333', 'middle');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="896" height="1200">${paths}</svg>`;
await sharp('apps/web/public/templates/schedule-p1.png')
  .composite([{ input: Buffer.from(svg) }]).png().toFile('/tmp/test-new-tpl.png');
console.log('Done: /tmp/test-new-tpl.png');
