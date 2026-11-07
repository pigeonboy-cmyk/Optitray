// Generates assets/icon-*.png and assets/icon.ico (PNG-in-ICO) with no dependencies.
// Glyph: a ring (cavity) crossed by a beam, anti-aliased by supersampling.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets');
const ACCENT = [76, 194, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// coverage of the glyph at normalised point (u,v) in [-1,1]
function inside(u, v, size) {
  const r = Math.hypot(u, v);
  const t = size <= 20 ? 0.2 : 0.16;          // thicker strokes at tray sizes
  const ring = Math.abs(r - 0.66) < t / 2;
  const beam = Math.abs(v) < (size <= 20 ? 0.11 : 0.08) && Math.abs(u) < 0.98;
  const dot = r < 0.2;
  return ring || beam || dot;
}

function render(size) {
  const ss = 8;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let hit = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const u = ((x + (sx + 0.5) / ss) / size) * 2 - 1;
      const v = ((y + (sy + 0.5) / ss) / size) * 2 - 1;
      if (inside(u, v, size)) hit++;
    }
    const i = (y * size + x) * 4;
    buf[i] = ACCENT[0]; buf[i + 1] = ACCENT[1]; buf[i + 2] = ACCENT[2];
    buf[i + 3] = Math.round((hit / (ss * ss)) * 255);
  }
  return png(size, buf);
}

fs.mkdirSync(OUT, { recursive: true });
const sizes = [16, 20, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((s) => {
  const b = render(s);
  fs.writeFileSync(path.join(OUT, `icon-${s}.png`), b);
  return b;
});
fs.copyFileSync(path.join(OUT, 'icon-256.png'), path.join(OUT, 'icon.png'));

// ICO container
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s >= 256 ? 0 : s; e[1] = s >= 256 ? 0 : s; e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
fs.writeFileSync(path.join(OUT, 'icon.ico'), Buffer.concat([header, ...entries, ...pngs]));
console.log('icons written to', OUT);
