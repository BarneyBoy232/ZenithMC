// validate.mjs — room name rules, shared by host, connector and website.
// Room names become Firestore doc ids and URL segments, so keep them safe and tidy.

export function normalizeRoom(name) {
  return String(name || '').toLowerCase().trim();
}

export function isValidRoom(name) {
  return /^[a-z0-9-]{1,32}$/.test(name);
}
