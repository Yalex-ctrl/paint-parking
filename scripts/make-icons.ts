/**
 * Draws the icons of the app in code: `npx tsx scripts/make-icons.ts` -> assets/images/*.png.
 *
 * A yellow car seen from above, nose to the right, with a rainbow trail of paint behind it, on the violet of the game. These are
 * placeholders drawn from shapes (there is no artwork yet): replace the files by a designer's icon whenever there is one, nothing
 * else depends on how they were made. Anti-aliased with signed distance fields, no dependency.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

/** A compressed PNG (the encoder of the app stores its data uncompressed: fine for a thumbnail, too big for an icon). */
function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Signed distance to a rounded rectangle (negative inside). */
const sdRound = (x: number, y: number, cx: number, cy: number, hw: number, hh: number, r: number) => {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};

type Shape = { sd: (x: number, y: number) => number; color: RGB };

/** The picture on a 1024 grid; `k` scales it around the centre (the adaptive icon keeps to a safe zone). */
function scene(k: number, mono: boolean): Shape[] {
  const s = (v: number) => 512 + (v - 512) * k;
  const l = (v: number) => v * k;
  const car = mono ? hex('#ffffff') : hex('#f6cf3b');
  const glass = mono ? hex('#ffffff') : hex('#26324a');
  const roof = mono ? hex('#ffffff') : hex('#fff3b0');
  const out: Shape[] = [];
  if (!mono) {
    [
      ['#ff5468', 400],
      ['#ffd23f', 512],
      ['#3fb6ea', 624],
    ].forEach(([c, y]) => {
      const cy = s(y as number);
      out.push({ sd: (x, yy) => sdRound(x, yy, s(300), cy, l(280), l(46), l(46)), color: hex(c as string) });
    });
  }
  // Wheels first, then the body over them.
  for (const [wx, wy] of [
    [520, 332],
    [520, 692],
    [800, 332],
    [800, 692],
  ]) out.push({ sd: (x, y) => sdRound(x, y, s(wx), s(wy), l(70), l(30), l(14)), color: mono ? car : hex('#1b1b22') });
  out.push({ sd: (x, y) => sdRound(x, y, s(660), s(512), l(300), l(165), l(90)), color: car });
  if (!mono) {
    out.push({ sd: (x, y) => sdRound(x, y, s(640), s(512), l(150), l(120), l(46)), color: glass });
    out.push({ sd: (x, y) => sdRound(x, y, s(600), s(512), l(95), l(86), l(30)), color: roof });
    for (const dy of [-100, 100]) {
      out.push({ sd: (x, y) => sdRound(x, y, s(938), s(512 + dy), l(22), l(36), l(10)), color: hex('#ffffff') });
      out.push({ sd: (x, y) => sdRound(x, y, s(382), s(512 + dy), l(14), l(32), l(8)), color: hex('#d8302c') });
    }
  }
  return out;
}

/** Renders the shapes (and optionally the violet background) with 3x3 supersampling. */
function render(size: number, shapes: Shape[], background: 'gradient' | 'none'): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const top = hex('#4a3aa8');
  const bottom = hex('#1d1733');
  const scale = 1024 / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const x = (px + (sx + 0.5) / 3) * scale;
          const y = (py + (sy + 0.5) / 3) * scale;
          let c: RGB | null = null;
          let alpha = 0;
          if (background === 'gradient') {
            const t = y / 1024;
            c = [top[0] + (bottom[0] - top[0]) * t, top[1] + (bottom[1] - top[1]) * t, top[2] + (bottom[2] - top[2]) * t];
            alpha = 1;
          }
          for (const sh of shapes) {
            const d = sh.sd(x, y);
            if (d < 0) {
              c = sh.color;
              alpha = 1;
            }
          }
          if (c) {
            r += c[0] * alpha;
            g += c[1] * alpha;
            b += c[2] * alpha;
            a += alpha;
          }
        }
      }
      const o = (py * size + px) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round((a / 9) * 255);
    }
  }
  return out;
}

const dir = resolve(__dirname, '../assets/images');
const save = (name: string, size: number, shapes: Shape[], background: 'gradient' | 'none') => {
  writeFileSync(resolve(dir, name), encodePng(size, size, render(size, shapes, background)));
  console.log(name, `${size}x${size}`);
};

save('icon.png', 1024, scene(1, false), 'gradient');
// The adaptive icon of Android: the picture stays in the middle two thirds, the background is a layer of its own.
save('android-icon-foreground.png', 512, scene(0.64, false), 'none');
save('android-icon-background.png', 512, [], 'gradient');
save('android-icon-monochrome.png', 432, scene(0.64, true), 'none');
save('splash-icon.png', 512, scene(0.95, false), 'none');
save('favicon.png', 48, scene(1, false), 'gradient');
