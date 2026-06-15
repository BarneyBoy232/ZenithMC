// electron-main.mjs — the packaged connector. Runs as a tray app: no window, just a
// system-tray icon, with the control server running in the background so the website
// can drive connections. This is the friend's one download.
//
// Bundled by build/bundle.mjs (esbuild) into one file so shared/ imports are inlined.

import { app, Tray, Menu, nativeImage } from 'electron';
import { join } from 'node:path';
import { startControlServer } from './src/control.mjs';

// Only one connector at a time — a second launch (e.g. at login) just exits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let tray;
  app.whenReady().then(() => {
    app.setLoginItemSettings({ openAtLogin: true }); // download once, runs forever
    startControlServer();

    const iconPath = join(app.getAppPath(), 'build', 'tray.png');
    tray = new Tray(nativeImage.createFromPath(iconPath));
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
}
