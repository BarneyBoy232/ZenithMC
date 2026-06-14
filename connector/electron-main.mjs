// electron-main.mjs — the packaged connector. Runs as a tray app: no window, just
// a system-tray icon, with the control server running in the background so the
// website can drive connections. This is the friend's one download.

import { app, Tray, Menu, nativeImage } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startControlServer } from './src/control.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
let tray;

app.whenReady().then(() => {
  startControlServer();

  tray = new Tray(nativeImage.createFromPath(join(__dirname, 'build', 'tray.png')));
  tray.setToolTip('ZenithMC connector — running');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'ZenithMC connector', enabled: false },
    { label: 'Running in background', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
});

// Tray app: never quit just because no window is open.
app.on('window-all-closed', (e) => e.preventDefault());
