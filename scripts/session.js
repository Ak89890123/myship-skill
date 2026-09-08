import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOME, ORIGIN, openBrowser, loggedIn, quickLogin } from './browser.js';
import { operate } from './operations.js';

const runtime = resolve(HOME, 'runtime.json');
export async function request(command, args = {}) {
  let state;
  try { state = JSON.parse(await readFile(runtime, 'utf8')); }
  catch { throw new Error('請先執行 myship login 啟動專用瀏覽器。'); }
  if (!Number.isInteger(state.port) || !state.token) throw new Error('請執行 myship login。');
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${state.port}/command`, {
      method: 'POST', headers: { authorization: `Bearer ${state.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ command, args }), signal: AbortSignal.timeout(180000),
    });
  } catch { throw new Error('專用瀏覽器無法連線；若剛送出儲存，請先檢查網站，勿重複提交。否則執行 myship login。'); }
  const result = await response.json();
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function start() {
  let running = false;
  try { await request('doctor'); running = true; } catch { /* stale or absent runtime */ }
  if (running) return await request('login');
  await mkdir(HOME, { recursive: true });
  const log = await open(resolve(HOME, 'session.log'), 'a');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve'], {
    detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd], env: process.env,
  });
  child.unref();
  await log.close();
  for (let i = 0; i < 60; i++) {
    await new Promise(done => setTimeout(done, 500));
    let ready = false;
    try { await request('doctor'); ready = true; } catch { /* server launching */ }
    if (ready) return await request('login');
  }
  throw new Error('啟動失敗，請查看 MYSHIP_HOME/session.log；勿同時啟動多個相同設定檔。');
}

async function serve() {
  const { context, page } = await openBrowser({ headed: true });
  await page.goto(`${ORIGIN}/myship/list1`, { waitUntil: 'domcontentloaded' });
  const token = randomBytes(32).toString('hex');
  let busy = false;
  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    const supplied = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (req.method !== 'POST' || req.url !== '/command' || req.headers.origin
      || req.headers['content-type'] !== 'application/json' || supplied.length !== expected.length
      || !timingSafeEqual(supplied, expected)) return reply(403, { ok: false, error: 'Forbidden' });
    if (busy) return reply(409, { ok: false, error: '另一個指令執行中，請稍後再試。' });
    busy = true;
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 2 * 1024 * 1024) throw new Error('指令超過 2 MB。');
      }
      const { command, args } = JSON.parse(body);
      if (command === 'stop') {
        reply(200, { ok: true, data: { stopped: true } });
        await context.close();
        return;
      }
      if (command === 'doctor' || command === 'login') {
        if (command === 'login') await quickLogin(page);
        const url = new URL(page.url());
        if (url.origin === ORIGIN && /^\/Home\/(Main|Index)$/i.test(url.pathname)) {
          await page.goto(`${ORIGIN}/myship/list1`, { waitUntil: 'domcontentloaded' });
        }
        const authenticated = await loggedIn(page);
        return reply(200, { ok: true, data: { authenticated, state: authenticated ? 'authenticated' : 'login_required',
          authSource: 'live_dedicated_browser', message: authenticated ? '保持此專用瀏覽器開啟。' : '請在專用 Chrome 手動登入 Facebook，再執行 myship doctor。' } });
      }
      if (!await loggedIn(page) && !await quickLogin(page)) throw new Error('LOGIN_REQUIRED：快速登入未完成，請在專用 Chrome 手動處理帳密或驗證。');
      reply(200, { ok: true, data: await operate(page, command, args) });
    } catch (error) {
      reply(400, { ok: false, error: error.message });
    } finally { busy = false; }
  });
  context.on('close', () => server.close(() => process.exit(0)));
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  await writeFile(runtime, JSON.stringify({ port: server.address().port, token, pid: process.pid }), { mode: 0o600 });
}

if (process.argv[2] === '--serve') serve().catch(error => { console.error(error.message); process.exitCode = 1; });
