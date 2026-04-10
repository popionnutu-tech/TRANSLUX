import sharp from 'sharp';

const input = 'apps/web/public/translux-logo-red.png';
const output = 'apps/web/public/translux-logo-bordo.png';

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

// Replace all pixel colors with #9B1B30, keeping alpha
for (let i = 0; i < data.length; i += channels) {
  const alpha = data[i + 3];
  if (alpha > 0) {
    data[i] = 155;     // R
    data[i + 1] = 27;  // G
    data[i + 2] = 48;  // B
    // keep alpha as-is
  }
}

await sharp(data, { raw: { width, height, channels } })
  .png()
  .toFile(output);

console.log(`Created ${output} (${width}x${height})`);
