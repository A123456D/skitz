// crop a region from a screenshot and nearest-neighbor upscale it
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const [inp, outp, cx, cy, size, scale] = process.argv.slice(2);
const img = PNG.sync.read(readFileSync(inp));
const S = +size, K = +scale;
const half = S / 2;
const out = new PNG({ width: S * K, height: S * K });
for (let y = 0; y < S * K; y++) {
  for (let x = 0; x < S * K; x++) {
    const sx = Math.min(img.width - 1, Math.max(0, Math.round(+cx - half + Math.floor(x / K))));
    const sy = Math.min(img.height - 1, Math.max(0, Math.round(+cy - half + Math.floor(y / K))));
    const si = (sy * img.width + sx) * 4;
    const di = (y * out.width + x) * 4;
    out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1];
    out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = 255;
  }
}
writeFileSync(outp, PNG.sync.write(out));
console.log('ok', out.width, out.height);
