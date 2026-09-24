/** Render named atlas frames enlarged for visual inspection: tsx tools/preview-atlas.ts out.png name1 name2 ... */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const [out, ...names] = process.argv.slice(2);
const base = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const atlasPng = PNG.sync.read(readFileSync(join(base, 'atlas.png')));
const frames = JSON.parse(readFileSync(join(base, 'atlas.json'), 'utf8')).frames;

const SCALE = 8;
const PAD = 2;
const cols = Math.min(8, names.length);
const rows = Math.ceil(names.length / cols);
const cellW = 32 * SCALE;
const cellH = 32 * SCALE;
const sheet = new PNG({ width: cols * (cellW + PAD) + PAD, height: rows * (cellH + PAD) + PAD });

for (let n = 0; n < names.length; n++) {
  const f = frames[names[n]]?.frame;
  if (!f) { console.error('missing frame:', names[n]); continue; }
  const ox = PAD + (n % cols) * (cellW + PAD);
  const oy = PAD + Math.floor(n / cols) * (cellH + PAD);
  // checker backdrop
  for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) {
    const i = ((oy + y) * sheet.width + ox + x) * 4;
    const c = ((x >> 3) + (y >> 3)) % 2 === 0 ? 58 : 74;
    sheet.data[i] = c; sheet.data[i + 1] = c; sheet.data[i + 2] = c + 8; sheet.data[i + 3] = 255;
  }
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const si = ((f.y + y) * atlasPng.width + f.x + x) * 4;
    if (atlasPng.data[si + 3] === 0) continue;
    for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) {
      const di = ((oy + y * SCALE + dy + Math.floor((cellH - f.h * SCALE) / 2)) * sheet.width
        + ox + x * SCALE + dx + Math.floor((cellW - f.w * SCALE) / 2)) * 4;
      sheet.data[di] = atlasPng.data[si];
      sheet.data[di + 1] = atlasPng.data[si + 1];
      sheet.data[di + 2] = atlasPng.data[si + 2];
      sheet.data[di + 3] = 255;
    }
  }
}
writeFileSync(out, PNG.sync.write(sheet));
console.log('wrote', out, `${sheet.width}x${sheet.height}`);
