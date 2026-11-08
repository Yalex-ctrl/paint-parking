import { writeFileSync } from 'node:fs';
import { PICTURES, pictureRgba } from '../src/core/gallery';
import { encodePng } from '../src/core/png';

const K = 6, cols = 10, S = 16, pad = 2;
const n = PICTURES.length, rows = Math.ceil(n / cols);
const W = cols * (S * K + pad), H = rows * (S * K + pad);
const out = new Uint8Array(W * H * 4).fill(40);
for (let i = 3; i < out.length; i += 4) out[i] = 255;
PICTURES.forEach((p, idx) => {
  const px = pictureRgba(idx, 10);
  const ox = (idx % cols) * (S * K + pad), oy = Math.floor(idx / cols) * (S * K + pad);
  for (let y = 0; y < S * K; y++) for (let x = 0; x < S * K; x++) {
    const s = (Math.floor(y / K) * S + Math.floor(x / K)) * 4;
    out.set(px.subarray(s, s + 4), ((oy + y) * W + ox + x) * 4);
  }
});
writeFileSync(process.argv[2] + '/pictures.png', encodePng(W, H, out));
console.log(PICTURES.map((p, i) => `${i}:${p.name}`).join(' '));
