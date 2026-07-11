// electron-main.mjs — the packaged ZenithMC Host app. Opens a window showing the
// in-process control panel; servers + worlds are stored under the user's writable
// app-data folder (not the read-only install dir).
//
// Bundled by build/bundle.mjs (esbuild) so shared/ imports are inlined.

import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'node:path';
import { startGuiServer } from './src/gui.mjs';

const PORT = 7800;
let panel;
let win;

// Native "Browse…" folder picker for the Existing-server tab.
async function pickDirectory() {
  const r = await dialog.showOpenDialog(win, {
    title: 'Select your Minecraft server folder',
    properties: ['openDirectory'],
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    panel = startGuiServer({ port: PORT, baseDir: app.getPath('userData'), pickDirectory });
    win = new BrowserWindow({
      width: 920,
      height: 700,
      title: 'ZenithMC Host',
      backgroundColor: '#020617',
      autoHideMenuBar: true,
    });
    win.loadURL(`http://127.0.0.1:${PORT}`);
  });

  // Stop all running servers cleanly when the app closes.
  app.on('before-quit', () => { try { panel?.manager.stopAll(); } catch { /* none */ } });
  app.on('window-all-closed', () => app.quit());
}
