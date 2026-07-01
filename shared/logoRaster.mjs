// logoRaster.mjs — draws the ZenithMC logo (emerald isometric block on a dark
// rounded badge) to a PNG at any size, and wraps a 256px PNG into a Windows .ico.
// Dependency-free, so app icons are generated at build time with no extra tooling.

import { deflateSync } from 'node:zlib';

// Cube face polygons in normalized 0..1 coords (matches public/logo.svg / 64 viewBox).
const T = [0.5, 0.21875], R = [0.717, 0.34375], L = [0.283, 0.34375];
const C = [0.5, 0.46875], RB = [0.717, 0.59375], LB = [0.283, 0.59375], B = [0.5, 0.71875];
const TOP = [T, R, C, L], RIGHT = [R, RB, B, C], LEFT = [L, LB, B, C];

function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

export function makeLogoPng(size) {
  const S = size;
  const raw = Buffer.alloc((S * 4 + 1) * S);
  const m = 2 / 64, rad = 16 / 64, bw = 2 / 64;
  const inRR = (px, py, inset) => {
    const x0 = m + inset, y0 = m + inset, x1 = 1 - m - inset, y1 = 1 - m - inset, r = Math.max(0, rad - inset);
    if (px < x0 || px > x1 || py < y0 || py > y1) return false;
    const dx = px < x0 + r ? x0 + r - px : (px > x1 - r ? px - (x1 - r) : 0);
    const dy = py < y0 + r ? y0 + r - py : (py > y1 - r ? py - (y1 - r) : 0);
    return dx * dx + dy * dy <= r * r;
  };
  let o = 0;
  for (let y = 0; y < S; y++) {
    raw[o++] = 0;
    for (let x = 0; x < S; x++) {
      const nx = (x + 0.5) / S, ny = (y + 0.5) / S;
      let r = 0, g = 0, b = 0, a = 0;
      if (inRR(nx, ny, 0)) {
        if (inRR(nx, ny, bw)) { r = 11; g = 18; b = 32; a = 255; } else { r = 16; g = 185; b = 129; a = 255; }
        if (inPoly(nx, ny, TOP)) { r = 52; g = 211; b = 153; }
        else if (inPoly(nx, ny, RIGHT)) { r = 16; g = 185; b = 129; }
        else if (inPoly(nx, ny, LEFT)) { r = 5; g = 150; b = 105; }
      }
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  return pngFromRaw(S, S, raw);
}

function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c; }
function chunk(type, data) { const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0); const t = Buffer.from(type, 'ascii'); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0); return Buffer.concat([l, t, data, cr]); }
function pngFromRaw(w, h, raw) { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }

// Wrap a 256x256 PNG into a single-image .ico (Windows accepts PNG-in-ICO).
export function pngToIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const e = Buffer.alloc(16);
  e.writeUInt8(0, 0); e.writeUInt8(0, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(png.length, 8); e.writeUInt32LE(22, 12);
  return Buffer.concat([header, e, png]);
}
