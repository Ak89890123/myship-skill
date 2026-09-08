import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { operate } from './operations.js';
import { ORIGIN } from './browser.js';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(2000);
  let saves = 0;
  await page.route('**/*', async route => {
    if (route.request().method() === 'POST') {
      saves++;
      return route.fulfill({ json: { Status: 1, Message: '儲存成功' } });
    }
    await route.fulfill({ contentType: 'text/html; charset=utf-8', body: `
      <div id="navShopManage"></div><div id="AppContent">
      <button id="storeSettingsTab">設定</button><input id="Cgdm_Name">
      <div id="divSummernote"><div class="note-editable" contenteditable></div></div>
      <input type="radio" id="OffShelf" checked><input type="radio" id="isPrivate" checked>
      <div id="storeImage_1"><div class="slim" data-state="empty"><input type="file"
        onchange="this.parentElement.dataset.state='editor'"></div></div>
      <button class="slim-editor-btn" data-action="confirm"
        onclick="document.querySelector('.slim').dataset.state='preview'">確認裁切</button>
      <button id="btnMainTainCgdm" onclick="document.querySelector('#popModal').hidden=false">儲存</button>
      <div id="popModal" hidden><h1>慎防詐騙</h1><button
        onclick="fetch('/CPF2101/MaintainCgdm',{method:'POST'});this.parentElement.hidden=true">我知道了</button></div>
      <div hidden><button>我知道了</button><button>我知道了</button></div></div>` });
  });
  await assert.rejects(operate(page, 'page.commit', { previewId: 'unknown' }));
  const draft = { name: '測試', description: '測試', status: 'off', visibility: 'hidden' };
  const preview = await operate(page, 'stores.preview', { draft });
  const upload = await operate(page, 'page.upload', { target: 'store', index: 1,
    file: fileURLToPath(new URL('../assets/examples/test-banner.png', import.meta.url)) });
  assert.equal(upload.processed, true);
  const result = await operate(page, 'page.commit', { previewId: preview.previewId });
  assert.equal(result.submitted, true, JSON.stringify({ result, saves, notice: await page.locator('#popModal').innerHTML(), visible: await page.locator('#popModal').isVisible() }));
  assert.equal(result.verified, false);
  assert.equal(saves, 1);
  await assert.rejects(operate(page, 'page.commit', { previewId: preview.previewId }));
  assert.equal(saves, 1);
  const changed = await operate(page, 'stores.preview', { draft });
  await page.locator('#Cgdm_Name').fill('被更動');
  await assert.rejects(operate(page, 'page.commit', { previewId: changed.previewId }));
  await page.goto(ORIGIN + '/myship/list1');
  await assert.rejects(operate(page, 'page.commit', { previewId: changed.previewId }));
  assert.equal(saves, 1);
  console.log('圖片裁切、同名隱藏提示、一次提交與預覽失效檢查通過。');
} finally { await browser.close(); }
