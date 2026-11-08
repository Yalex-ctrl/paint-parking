/**
 * A tiny PNG encoder (no compression: "stored" deflate blocks), so pixel-art pictures can be shown
 * as ordinary images from a data URI without any native module or canvas.
 */

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  out.set(u32(crc32(out, 4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encodes RGBA pixels (row by row, 4 bytes each) as a PNG file. */
export function encodePng(width: number, height: number, rgba: ArrayLike<number>): Uint8Array {
  // One filter byte (0 = none) in front of every row.
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    for (let i = 0; i < width * 4; i++) raw[row + 1 + i] = rgba[y * width * 4 + i];
  }

  // zlib: header, "stored" blocks of at most 65535 bytes, Adler-32.
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const z = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  z[0] = 0x78;
  z[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535;
    const len = Math.min(65535, raw.length - start);
    z[o++] = b === blocks - 1 ? 1 : 0;
    z[o++] = len & 255;
    z[o++] = len >>> 8;
    z[o++] = ~len & 255;
    z[o++] = (~len >>> 8) & 255;
    z.set(raw.subarray(start, start + len), o);
    o += len;
  }
  z.set(u32(adler32(raw)), o);

  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 6, 0, 0, 0]); // 8-bit RGBA
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', z),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  return png;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export const pngDataUri = (width: number, height: number, rgba: ArrayLike<number>) =>
  `data:image/png;base64,${toBase64(encodePng(width, height, rgba))}`;
