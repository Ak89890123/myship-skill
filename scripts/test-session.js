import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HOME } from './browser.js';
import { request } from './session.js';

// Requires `myship login`. Leaves the same browser open; never saves a store.
const before = JSON.parse(await readFile(resolve(HOME, 'runtime.json'), 'utf8'));
const first = await request('doctor');
const second = await request('doctor');
const after = JSON.parse(await readFile(resolve(HOME, 'runtime.json'), 'utf8'));
assert.equal(before.pid, after.pid);
assert.equal(first.authSource, 'live_dedicated_browser');
assert.equal(second.authSource, first.authSource);
const denied = await fetch(`http://127.0.0.1:${before.port}/command`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: 'stop' }),
});
assert.equal(denied.status, 403);
const crossOrigin = await fetch(`http://127.0.0.1:${before.port}/command`, {
  method: 'POST', headers: { authorization: `Bearer ${before.token}`, origin: 'https://example.com',
    'content-type': 'application/json' }, body: JSON.stringify({ command: 'stop' }),
});
assert.equal(crossOrigin.status, 403);
await request('doctor');
console.log('同一個瀏覽器跨指令連線、未授權與跨來源拒絕檢查通過；不代表網站登入已成功。');
