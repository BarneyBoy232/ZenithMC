// gen-icon.mjs — writes the tray icon (small logo) and the app .ico (installer/exe).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeLogoPng, makeLogoIco } from '../../shared/logoRaster.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(dir, 'tray.png'), makeLogoPng(32));
writeFileSync(join(dir, 'icon.ico'), makeLogoIco());
console.log('wrote tray.png + icon.ico');
