#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { validateStoreDraft, validateProductDraft, images } from './draft.js';
import { HOME, PROFILE } from './browser.js';
import { request, start } from './session.js';
import { storeId } from './operations.js';

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    json: { type: 'boolean' }, offline: { type: 'boolean' }, search: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
    file: { type: 'string' }, 'dry-run': { type: 'boolean' },
    target: { type: 'string' }, index: { type: 'string' }, option: { type: 'string' },
    'preview-id': { type: 'string' },
  } });
  const emit = data => console.log(JSON.stringify({ ok: true, data }, null, values.json ? 0 : 2));
  const [command, action, id] = positionals;
  if (values.help || !command) {
    console.log(`myship — 賣貨便 CLI（建置中）

  login                         保留專用 Chrome，嘗試 Facebook 快速登入
  doctor [--offline]             檢查同一個瀏覽器的登入狀態
  session stop                  關閉 CLI 專用瀏覽器
  stores list [--search 名稱]    讀取目前一頁賣場
  stores get GM編號或網址        讀取一般賣場資料
  stores preview --file JSON [--dry-run]  驗證草稿；不加 dry-run 時填表但不儲存
  products list GM編號或網址     讀取商品及單／雙規格價格
  products preview GM編號 --file JSON [--dry-run]  商品填表預覽
  page inspect                  讀取目前管理頁文字
  page upload --target store|product|spec --index N --file 圖片 [--option 規格名]
  page commit --preview-id ID    提交目前預覽（ID 僅可使用一次）

  --json                        JSON 輸出
  MYSHIP_HOME                   專用資料目錄

瀏覽器需保持開啟；重開後可能需要重新登入。寫入功能仍在建置中。`);
  } else if (command === 'page' && action === 'commit' && positionals.length === 2) {
    if (values['dry-run'] || values.file) throw new Error('commit 不接受 --dry-run／--file；請先使用 preview。');
    if (!values['preview-id']) throw new Error('需要 --preview-id。');
    emit(await request('page.commit', { previewId: values['preview-id'] }));
  } else if (command === 'page' && action === 'upload' && positionals.length === 2) {
    if (!/^\d+$/.test(values.index || '') || !['store', 'product', 'spec'].includes(values.target)) throw new Error('需要 --index 整數與 --target store|product|spec。');
    const [file] = images([values.file], 1);
    emit(values['dry-run'] ? { saved: false, file, target: values.target, index: Number(values.index) }
      : await request('page.upload', { file, target: values.target, index: Number(values.index), option: values.option }));
  } else if ((values.file || values['dry-run']) && !(['stores', 'products'].includes(command) && action === 'preview')) {
    throw new Error('--file 與 --dry-run 僅供 stores/products preview 使用。');
  } else if (command === 'stores' && action === 'preview' && positionals.length === 2) {
    if (!values.file) throw new Error('需要 --file 草稿 JSON 路徑。');
    const draft = validateStoreDraft(JSON.parse(await readFile(values.file, 'utf8')), dirname(resolve(values.file)));
    emit(values['dry-run'] ? { mode: 'dry-run', saved: false, draft }
      : await request('stores.preview', { draft }));
  } else if (command === 'products' && action === 'preview' && positionals.length === 3) {
    if (!values.file) throw new Error('需要 --file 草稿 JSON 路徑。');
    const store = storeId(id);
    const draft = validateProductDraft(JSON.parse(await readFile(values.file, 'utf8')), dirname(resolve(values.file)));
    emit(values['dry-run'] ? { mode: 'dry-run', saved: false, storeId: store, draft }
      : await request('products.preview', { id: store, draft }));
  } else if (command === 'login' && positionals.length === 1) {
    emit(await start());
  } else if (command === 'doctor' && positionals.length === 1) {
    const data = { node: process.version, home: HOME, profile: PROFILE,
      profileExists: existsSync(PROFILE), mode: values.offline ? 'offline' : 'live',
      authenticated: null };
    if (!values.offline) Object.assign(data, await request('doctor'));
    emit(data);
  } else if (command === 'session' && action === 'stop' && positionals.length === 2) {
    emit(await request('stop'));
  } else if (command === 'stores' && action === 'list' && positionals.length === 2) {
    emit(await request('stores.list', { search: values.search }));
  } else if (['stores.get', 'products.list'].includes(`${command}.${action}`) && positionals.length === 3) {
    emit(await request(`${command}.${action}`, { id: storeId(id) }));
  } else if (command === 'page' && action === 'inspect' && positionals.length === 2) {
    emit(await request('page.inspect'));
  } else {
    throw new Error(`未知指令：${command}。請執行 myship --help。`);
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: { code: 'MYSHIP_ERROR', message: error.message } }));
  process.exitCode = 1;
}
