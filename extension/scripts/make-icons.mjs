// Generates the toolbar icons (no image tooling needed): a teal rounded square
// with three "lines of text" whose first part is heavier, a nod to bold word
// starts. Output: public/icon/{16,32,48,128}.png
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../public/icon');
mkdirSync(out, { recursive: true });

const TEAL = [15, 107, 107];
const PAPER = [250, 247, 240];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function render(size) {
  const S = 4; // supersampling
  const px = new Float64Array(size * size * 4);
  const r = 0.22; // corner radius (fraction)
  const bars = [
    // y centre, start, bold end, end, (fractions of the icon)
    [0.32, 0.2, 0.42, 0.8],
    [0.5, 0.2, 0.36, 0.72],
    [0.68, 0.2, 0.46, 0.62],
  ];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const u = (x + (sx + 0.5) / S) / size;
          const v = (y + (sy + 0.5) / S) / size;
          const dx = Math.max(r - u, 0, u - (1 - r));
          const dy = Math.max(r - v, 0, v - (1 - r));
          if (dx * dx + dy * dy > r * r) continue;
          let col = TEAL;
          for (const [cy, x0, xb, x1] of bars) {
            const half = u < xb ? 0.065 : 0.032;
            if (u >= x0 && u <= x1 && Math.abs(v - cy) <= half) col = PAPER;
          }
          acc = [acc[0] + col[0], acc[1] + col[1], acc[2] + col[2], acc[3] + 1];
        }
      const i = (y * size + x) * 4;
      const n = acc[3];
      px[i] = n ? acc[0] / n : 0;
      px[i + 1] = n ? acc[1] / n : 0;
      px[i + 2] = n ? acc[2] / n : 0;
      px[i + 3] = (n / (S * S)) * 255;
    }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size * 4; x++) raw[y * (size * 4 + 1) + 1 + x] = Math.round(px[y * size * 4 + x]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const s of [16, 32, 48, 128]) writeFileSync(path.join(out, `${s}.png`), render(s));
console.log('icons written to', out);
