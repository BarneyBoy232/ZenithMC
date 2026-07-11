// logoRaster.mjs — draws the ZenithMC logo (a Minecraft nether portal: a purple
// portal framed in obsidian on a dark rounded badge) to a PNG at any size, and
// packs a set of sizes into a multi-resolution Windows .ico. Dependency-free, so
// app icons are generated at build time with no extra tooling. Mirrors
// public/logo.svg. Pixels are anti-aliased (supersampled) so small sizes stay
// crisp instead of looking jagged/offset.

import { deflateSync } from 'node:zlib';

const U = 1 / 64; // one SVG unit expressed in normalized 0..1 coords

// Rounded-rect hit test in normalized coords.
function inRR(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const dx = px < x0 + r ? x0 + r - px : (px > x1 - r ? px - (x1 - r) : 0);
  const dy = py < y0 + r ? y0 + r - py : (py > y1 - r ? py - (y1 - r) : 0);
  return dx * dx + dy * dy <= r * r;
}

// Plain axis-aligned rect hit test in normalized coords.
function inBox(px, py, x, y, w, h) {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

// Obsidian corner highlight blocks (top-left x,y in SVG units).
const CORNERS = [[16, 12], [45, 12], [16, 44], [45, 44]];
// Swirl + sparkle pixels over the portal: [x, y, w, h, r, g, b] in SVG units.
const PIXELS = [
  [24, 20, 5, 5, 168, 85, 247], [33, 26, 6, 6, 192, 132, 252],
  [25, 34, 6, 6, 168, 85, 247], [30, 41, 5, 5, 216, 180, 254],
  [35, 18, 3, 3, 245, 208, 254], [22, 30, 3, 3, 245, 208, 254],
];

// Colour of the logo at one normalized point; returns [r, g, b, a].
function sample(nx, ny) {
  if (!inRR(nx, ny, 2 * U, 2 * U, 62 * U, 62 * U, 14 * U)) return [0, 0, 0, 0];
  let r, g, b;
  if (inRR(nx, ny, 4 * U, 4 * U, 60 * U, 60 * U, 12 * U)) { r = 18; g = 10; b = 26; }
  else { r = 168; g = 85; b = 247; } // badge border
  if (inRR(nx, ny, 15 * U, 10 * U, 49 * U, 54 * U, 6 * U)) { r = 51; g = 33; b = 77; } // obsidian
  for (const [cx, cy] of CORNERS) if (inBox(nx, ny, cx * U, cy * U, 3 * U, 3 * U)) { r = 74; g = 49; b = 112; }
  if (inRR(nx, ny, 20 * U, 15 * U, 44 * U, 49 * U, 8 * U)) { r = 124; g = 58; b = 237; } // portal
  for (const [bx, by, bw, bh, pr, pg, pb] of PIXELS) if (inBox(nx, ny, bx * U, by * U, bw * U, bh * U)) { r = pr; g = pg; b = pb; }
  return [r, g, b, 255];
}

export function makeLogoPng(size) {
  const S = size, SS = 4, n = SS * SS; // SS×SS supersampling per pixel
  const raw = Buffer.alloc((S * 4 + 1) * S);
  let o = 0;
  for (let y = 0; y < S; y++) {
    raw[o++] = 0; // PNG filter byte, one per scanline
    for (let x = 0; x < S; x++) {
      let pr = 0, pg = 0, pb = 0, sa = 0; // premultiplied colour + summed alpha
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (x + (sx + 0.5) / SS) / S, ny = (y + (sy + 0.5) / SS) / S;
          const [cr, cg, cb, ca] = sample(nx, ny);
          const af = ca / 255;
          pr += cr * af; pg += cg * af; pb += cb * af; sa += ca;
        }
      }
      const A = sa / n;
      let R = 0, G = 0, B = 0;
      if (A > 0) { const k = 255 / A; R = pr / n * k; G = pg / n * k; B = pb / n * k; }
      raw[o++] = Math.round(R); raw[o++] = Math.round(G); raw[o++] = Math.round(B); raw[o++] = Math.round(A);
    }
  }
  return pngFromRaw(S, S, raw);
}

function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c; }
function chunk(type, data) { const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0); const t = Buffer.from(type, 'ascii'); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0); return Buffer.concat([l, t, data, cr]); }
function pngFromRaw(w, h, raw) { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }

// Build a multi-resolution .ico (PNG-in-ICO, which Windows accepts). Embedding
// each size natively keeps small icons sharp instead of downscaling one 256px
// image — that downscaling was what made the taskbar/installer icon look offset.
export function makeLogoIco(sizes = [16, 24, 32, 48, 64, 128, 256]) {
  const imgs = sizes.map((s) => ({ s, png: makeLogoPng(s) }));
  const count = imgs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  imgs.forEach((img, i) => {
    const o = i * 16;
    dir.writeUInt8(img.s >= 256 ? 0 : img.s, o);      // width (0 means 256)
    dir.writeUInt8(img.s >= 256 ? 0 : img.s, o + 1);  // height
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6); // planes, bpp
    dir.writeUInt32LE(img.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += img.png.length;
  });
  return Buffer.concat([header, dir, ...imgs.map((i) => i.png)]);
}
