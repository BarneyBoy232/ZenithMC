// logoRaster.mjs — draws the ZenithMC logo (a Minecraft nether portal: a purple
// portal framed in obsidian on a dark rounded badge) to a PNG at any size, and
// wraps a 256px PNG into a Windows .ico. Dependency-free, so app icons are
// generated at build time with no extra tooling. Mirrors public/logo.svg.

import { deflateSync } from 'node:zlib';

// Rounded-rect hit test in normalized 0..1 coords.
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

export function makeLogoPng(size) {
  const S = size, U = 1 / 64; // one SVG unit expressed in normalized coords
  const raw = Buffer.alloc((S * 4 + 1) * S);
  // Swirl + sparkle pixels painted over the portal, matching public/logo.svg.
  // Each entry: [x, y, w, h, r, g, b] in SVG units.
  const pixels = [
    [24, 20, 5, 5, 168, 85, 247], [33, 26, 6, 6, 192, 132, 252],
    [25, 34, 6, 6, 168, 85, 247], [30, 41, 5, 5, 216, 180, 254],
    [35, 18, 3, 3, 245, 208, 254], [22, 30, 3, 3, 245, 208, 254],
  ];
  // Obsidian corner highlight blocks (top-left of each is x,y in SVG units).
  const corners = [[16, 12], [45, 12], [16, 44], [45, 44]];
  let o = 0;
  for (let y = 0; y < S; y++) {
    raw[o++] = 0; // PNG filter byte, one per scanline
    for (let x = 0; x < S; x++) {
      const nx = (x + 0.5) / S, ny = (y + 0.5) / S;
      let r = 0, g = 0, b = 0, a = 0;
      // Badge: purple border with a dark fill.
      if (inRR(nx, ny, 2 * U, 2 * U, 62 * U, 62 * U, 14 * U)) {
        a = 255;
        if (inRR(nx, ny, 4 * U, 4 * U, 60 * U, 60 * U, 12 * U)) { r = 18; g = 10; b = 26; }
        else { r = 168; g = 85; b = 247; }
        // Obsidian frame around the portal.
        if (inRR(nx, ny, 15 * U, 10 * U, 49 * U, 54 * U, 6 * U)) { r = 51; g = 33; b = 77; }
        for (const [cx, cy] of corners)
          if (inBox(nx, ny, cx * U, cy * U, 3 * U, 3 * U)) { r = 74; g = 49; b = 112; }
        // Portal interior.
        if (inRR(nx, ny, 20 * U, 15 * U, 44 * U, 49 * U, 8 * U)) { r = 124; g = 58; b = 237; }
        // Swirl + sparkle pixels on top.
        for (const [bx, by, bw, bh, pr, pg, pb] of pixels)
          if (inBox(nx, ny, bx * U, by * U, bw * U, bh * U)) { r = pr; g = pg; b = pb; }
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
