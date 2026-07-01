// gen-icon.mjs — writes the app .ico (ZenithMC logo) for the installer/exe.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeLogoPng, pngToIco } from '../../shared/logoRaster.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(dir, 'icon.ico'), pngToIco(makeLogoPng(256)));
console.log('wrote icon.ico');
