// bundle.mjs — bundle the Electron host (and shared/, firebase) into one CJS file so
// packaging has no external relative paths. electron + node-datachannel stay external.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [join(root, 'electron-main.mjs')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: join(root, 'dist-bundle', 'host.cjs'),
  external: ['electron', 'node-datachannel'],
  logLevel: 'info',
});

console.log('bundled -> dist-bundle/host.cjs');
