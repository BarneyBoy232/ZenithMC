// autostart.mjs — make the connector launch itself at login, so a friend runs it
// once and never touches it again. Windows-only (the target platform); a no-op
// elsewhere. Uses the HKCU Run key via `reg`, so no native dependency.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const NAME = 'ZenithMCConnector';

// Command Windows runs at login: this executable + this script (control server).
function launchCommand(scriptPath) {
  return `"${process.execPath}" "${scriptPath}"`;
}

export async function enableAutostart(scriptPath) {
  if (process.platform !== 'win32') return false;
  try {
    await run('reg', ['add', KEY, '/v', NAME, '/t', 'REG_SZ', '/d', launchCommand(scriptPath), '/f']);
    return true;
  } catch {
    return false;
  }
}

export async function isAutostartEnabled() {
  if (process.platform !== 'win32') return false;
  try {
    await run('reg', ['query', KEY, '/v', NAME]);
    return true;
  } catch {
    return false;
  }
}

export async function disableAutostart() {
  if (process.platform !== 'win32') return false;
  try {
    await run('reg', ['delete', KEY, '/v', NAME, '/f']);
    return true;
  } catch {
    return false;
  }
}
