// gen-icon.mjs — emerald-dot window/app icon (RGBA PNG), no deps. Run before packaging.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const W = 256, H = 256;
const [R, G, B] = [16, 185, 129];
const raw = Buffer.alloc((W * 4 + 1) * H);
let o = 0;
const cx = (W - 1) / 2, cy = (H - 1) / 2, rad = W / 2 - 6;
for (let y = 0; y < H; y++) {
  raw[o++] = 0;
  for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - cx, y - cy);
    const a = d <= rad - 1 ? 255 : d <= rad ? Math.round(255 * (rad - d)) : 0;
    raw[o++] = R; raw[o++] = G; raw[o++] = B; raw[o++] = a;
  }
}
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c; }
function chunk(type, data) { const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0); const t = Buffer.from(type, 'ascii'); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0); return Buffer.concat([l, t, data, cr]); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
const out = join(dirname(fileURLToPath(import.meta.url)), 'icon.png');
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
