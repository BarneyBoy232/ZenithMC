// gen-icon.mjs — writes the app .ico (ZenithMC logo) for the installer/exe.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeLogoIco } from '../../shared/logoRaster.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(dir, 'icon.ico'), makeLogoIco());
console.log('wrote icon.ico');
