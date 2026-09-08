import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loggedIn, quickLogin } from './browser.js';
import { validateStoreDraft, validateProductDraft } from './draft.js';
import { readFileSync } from 'node:fs';
import { storeId } from './operations.js';

const cli = fileURLToPath(new URL('./cli.js', import.meta.url));
assert.equal(storeId('GM1234567890'), 'GM1234567890');
assert.equal(storeId('https://myship.7-11.com.tw/general/detail/GM1234567890'), 'GM1234567890');
assert.throws(() => storeId('https://example.com/general/detail/GM123'));
assert.throws(() => storeId('GM123/../../'));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
const offline = run('--json', 'doctor', '--offline');
assert.ifError(offline.error);
assert.equal(offline.status, 0, offline.stderr);
assert.equal(JSON.parse(offline.stdout).data.mode, 'offline');
const unknown = run('--json', 'not-a-command');
assert.equal(unknown.status, 1);
assert.equal(JSON.parse(unknown.stderr).ok, false);
const badFlag = run('--unknown');
assert.equal(badFlag.status, 1);
assert.equal(JSON.parse(badFlag.stderr).ok, false);
assert.equal(await loggedIn({ url: () => 'https://www.facebook.com/login' }), false);
assert.equal(await loggedIn({ url: () => 'https://myship.7-11.com.tw/myship/list1',
  locator: () => ({ count: async () => 1 }) }), true);
assert.equal(await loggedIn({ url: () => 'https://myship.7-11.com.tw/Home/Login',
  locator: () => ({ count: async () => 0 }) }), false);
console.log('CLI 診斷、錯誤輸出與登入辨識檢查通過。');

assert.deepEqual(validateStoreDraft({ name: '測試賣場', description: '未儲存預覽' }), {
  name: '測試賣場', description: '未儲存預覽', status: 'off', visibility: 'hidden',
});
assert.deepEqual(validateStoreDraft({ id: 'GM123', name: '改名' }), { id: 'GM123', name: '改名' });
for (const input of [null, [], { name: 'x', description: 'x', typo: 1 }, { id: 'GM123' },
  { name: 'x'.repeat(51), description: 'x' }, { name: '<x>', description: 'x' },
  { name: 'x', description: 'x', status: 'yes' }]) assert.throws(() => validateStoreDraft(input));

function authPage({ existing = true, password = false } = {}) {
  let url = 'https://myship.7-11.com.tw/Home/Login';
  const clicks = [];
  const page = {
    url: () => url,
    locator: selector => ({ count: async () => selector === 'input[type="password"]' ? Number(password)
      : Number(url.endsWith('/myship/list1')) }),
    getByRole: (role, { name }) => {
      const login = name.test('Facebook 登入');
      return { or() { return this; }, count: async () => 1, click: async () => {
        clicks.push(login ? 'facebook-login' : 'continue');
        url = login ? 'https://www.facebook.com/dialog/oauth' : 'https://myship.7-11.com.tw/Home/Main';
      } };
    },
    getByText: () => ({ count: async () => Number(existing) }),
    goto: async value => { url = value; },
    waitForURL: async () => {}, waitForTimeout: async () => {},
  };
  return { page, clicks };
}
const reuse = authPage();
assert.equal(await quickLogin(reuse.page), true);
assert.deepEqual(reuse.clicks, ['facebook-login', 'continue']);
assert.equal(await quickLogin(reuse.page), true);
assert.equal(reuse.clicks.length, 2);
for (const settings of [{ existing: false }, { existing: false, password: true }]) {
  const blocked = authPage(settings);
  assert.equal(await quickLogin(blocked.page), false);
  assert.deepEqual(blocked.clicks, ['facebook-login']);
}
console.log('草稿驗證與 Facebook 快速登入邊界檢查通過。');

const doubleDraft = JSON.parse(readFileSync(new URL('../assets/examples/product-double.json', import.meta.url), 'utf8'));
const exampleDir = fileURLToPath(new URL('../assets/examples/', import.meta.url));
assert.equal(validateProductDraft(doubleDraft, exampleDir).status, 'off');
for (const change of [
  d => { d.doubleSpecifications.variants.pop(); },
  d => { d.doubleSpecifications.variants[1] = d.doubleSpecifications.variants[0]; },
  d => { d.doubleSpecifications.variants[0].stock = -1; },
  d => { d.doubleSpecifications.variants[0].price = 20001; },
  d => { d.doubleSpecifications.variants[0].salePrice = 101; },
  d => { d.doubleSpecifications.axes[0].options[1] = '藍色'; },
  d => { d.doubleSpecifications.variants[0].options = ['未知', '小']; },
  d => { d.images = [cli]; },
]) {
  const draft = structuredClone(doubleDraft); change(draft);
  assert.throws(() => validateProductDraft(draft, exampleDir));
}
assert.throws(() => validateProductDraft({ match: { id: 'x', name: 'y' }, price: 1 }));
console.log('雙規格組合、價格、庫存與圖片檔案驗證通過。');
assert.equal(run('page', 'commit', '--preview-id', 'x', '--dry-run').status, 1);
assert.equal(run('page', 'upload', '--target', 'invalid', '--index', '0', '--file', cli).status, 1);
assert.equal(run('page', 'upload', '--target', 'product', '--index', '0', '--file',
  fileURLToPath(new URL('../assets/examples/test-blue.png', import.meta.url)), '--dry-run').status, 0);
