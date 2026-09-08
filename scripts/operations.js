import { ORIGIN, loggedIn, quickLogin } from './browser.js';
import { validateStoreDraft, validateProductDraft, images } from './draft.js';
import { randomUUID } from 'node:crypto';

const previews = new WeakMap();
function remember(page, kind, draft, result) {
  const previewId = randomUUID();
  previews.set(page, { previewId, kind, draft, result, url: page.url() });
  return { ...result, previewId };
}

export function storeId(value) {
  const id = /^GM\d+$/.test(value || '') ? value : String(value).match(/^https:\/\/myship\.7-11\.com\.tw\/general\/(?:detail|maintain)\/(GM\d+)\/?$/)?.[1];
  if (!id) throw new Error('需要一般賣場 GM 編號或完整賣場網址。');
  return id;
}

async function goto(page, path) {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: 'domcontentloaded' });
  if (!await loggedIn(page)) {
    if (!await quickLogin(page)) throw new Error('LOGIN_REQUIRED：快速登入未完成，請在專用瀏覽器處理。');
    await page.goto(`${ORIGIN}${path}`, { waitUntil: 'domcontentloaded' });
    if (!await loggedIn(page)) throw new Error('LOGIN_REQUIRED：網站未接受登入。');
  }
}

export async function operate(page, command, args = {}) {
  if (command === 'page.commit') {
    const pending = previews.get(page);
    if (!pending || pending.previewId !== args.previewId || pending.url !== page.url()) throw new Error('需要目前未提交預覽的 previewId；重啟或導覽後須重新預覽。');
    if (pending.kind === 'store') {
      await page.locator('#storeSettingsTab').click();
      const draft = pending.draft;
      if (draft.name !== undefined && await page.locator('#Cgdm_Name').inputValue() !== draft.name) throw new Error('賣場名稱已變動，請重新預覽。');
      if (draft.status !== undefined && await page.locator('#OffShelf').isChecked() !== (draft.status === 'off')) throw new Error('賣場狀態已變動。');
      if (draft.visibility !== undefined && await page.locator('#isPrivate').isChecked() !== (draft.visibility === 'hidden')) throw new Error('賣場公開設定已變動。');
    } else {
      await page.locator('#productsTab').click();
      const current = (await readProducts(page)).find(p => p.index === pending.result.product.index);
      if (!current || current.name !== pending.result.product.name || current.status !== pending.result.product.status) throw new Error('商品名稱或狀態已變動，請重新預覽。');
    }
    if (await page.locator('input[type="file"]').evaluateAll(nodes => nodes.some(n => /(?:busy|editor)/.test(n.closest('.slim')?.getAttribute('data-state') || '')))) throw new Error('圖片處理或裁切尚未完成。');
    previews.delete(page); // Consume before submitting: an uncertain response must never be retried automatically.
    const endpoint = pending.kind === 'store' ? '/CPF2101/MaintainCgdm' : '/CPF2101/MaintainCgdds';
    const responsePromise = page.waitForResponse(r => r.request().method() === 'POST' && r.url() === ORIGIN + endpoint, { timeout: 30000 }).catch(() => null);
    const button = pending.kind === 'store' ? page.locator('#btnMainTainCgdm') : page.locator(`#div_product_${pending.result.product.index} .btnMainTainCgdd`);
    await button.click();
    const notice = page.locator('#popModal').getByRole('button', { name: '我知道了', exact: true });
    await notice.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    if (await notice.isVisible() && await page.locator('#popModal h1').textContent() === '慎防詐騙') await notice.click();
    const response = await responsePromise;
    let result;
    if (response) { try { result = await response.json(); } catch {} }
    return { submitted: Boolean(response), verified: false, url: page.url(),
      response: response ? { path: endpoint, status: response.status(), resultStatus: result?.Status, message: result?.Message } : null,
      dialogs: await page.locator('#alertify').allTextContents(), message: '提交結果須讀回確認；本 previewId 已消耗，勿重複提交。' };
  }
  if (!['page.inspect', 'page.upload'].includes(command)) previews.delete(page);
  if (command === 'page.upload') {
    if (!/^\/general\/maintain(?:\/GM\d+)?$/.test(new URL(page.url()).pathname)) throw new Error('請先開啟一般賣場表單預覽。');
    const [file] = images([args.file], 1);
    if (!Number.isInteger(args.index) || args.index < 0) throw new Error('需要非負整數 index。');
    let input;
    if (args.target === 'store') {
      await page.locator('#storeSettingsTab').click();
      input = page.locator(`#storeImage_${args.index} input[type="file"]`);
    } else {
      await page.locator('#productsTab').click();
      const root = page.locator(`#div_product_${args.index}`);
      if (args.target === 'product') {
        const ids = await root.locator('input[type="file"]').evaluateAll(nodes => nodes.filter(n => !n.closest('.format_thumbs') && n.closest('.slim')?.getAttribute('data-state') === 'empty').map(n => n.id));
        if (ids.length !== 1) throw new Error('商品主圖上傳欄位不唯一。');
        input = root.locator(`[id="${ids[0]}"]`);
      } else if (args.target === 'spec') {
        const ids = await root.locator('.format_thumbs > .upload-col').evaluateAll((nodes, option) => nodes
          .filter(n => Array.from(n.querySelectorAll('a')).at(-1)?.innerText.trim() === option)
          .map(n => n.querySelector('input[type="file"]')?.id).filter(Boolean), args.option);
        if (ids.length !== 1) throw new Error('找不到唯一的空白規格圖片欄位；不會刪除既有照片。');
        input = root.locator(`[id="${ids[0]}"]`);
      } else throw new Error('target 必須是 store、product 或 spec。');
    }
    if (await input.count() !== 1) throw new Error('上傳欄位不唯一。');
    await input.setInputFiles(file);
    await input.evaluate(n => new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (/(?:editor|preview)/.test(n.closest('.slim')?.getAttribute('data-state') || '')) { clearInterval(timer); resolve(); }
        else if (Date.now() - started > 14000) { clearInterval(timer); reject(new Error('圖片處理未完成')); }
      }, 100);
    }));
    if (await input.evaluate(n => n.closest('.slim')?.getAttribute('data-state')?.includes('editor')))
      await page.locator('.slim-editor-btn[data-action="confirm"]').click();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('input[type="file"]')).some(n => /(?:busy|editor)/.test(n.closest('.slim')?.getAttribute('data-state') || '')));
    return { selected: true, processed: true, saved: false, file, message: '圖片元件處理完成，必要裁切已確認；尚未儲存。' };
  }
  if (command === 'stores.preview') {
    const draft = validateStoreDraft(args.draft);
    await goto(page, `/general/maintain${draft.id ? `/${draft.id}` : ''}`);
    await page.locator('#Cgdm_Name').waitFor();
    if (draft.name !== undefined) await page.locator('#Cgdm_Name').fill(draft.name);
    if (draft.description !== undefined) await page.locator('#divSummernote .note-editable').fill(draft.description);
    if (draft.status !== undefined) await selectRadio(page, draft.status === 'on' ? 'OnShelf' : 'OffShelf');
    if (draft.visibility !== undefined) await selectRadio(page, draft.visibility === 'public' ? 'isPublic' : 'isPrivate');
    if (draft.pickupFee !== undefined) {
      await selectRadio(page, 'conveyance_1');
      const fee = page.locator('#conveyance_FixFee_1');
      const max = (await fee.getAttribute('class')).match(/max\[(\d+)\]/)?.[1];
      if (max === undefined || draft.pickupFee > Number(max)) throw new Error(`店取運費超過網站目前上限 ${max ?? '未知'}。`);
      await fee.fill(String(draft.pickupFee));
      await selectRadio(page, 'payment_1');
    }
    if (draft.products) {
      await page.locator('#productsTab').click();
      for (const product of draft.products) await fillProduct(page, product);
    }
    return remember(page, 'store', draft, { mode: 'form-preview', saved: false, uploaded: false, url: page.url(), draft,
      products: draft.products ? await readProducts(page) : undefined,
      message: '已填表但未儲存；圖片僅驗證本機檔案，尚未上傳。導覽指令會丟失此預覽。' });
  }
  if (command === 'products.preview') {
    const id = storeId(args.id), draft = validateProductDraft(args.draft);
    await goto(page, `/general/maintain/${id}`);
    await page.locator('#productsTab').click();
    const product = await fillProduct(page, draft);
    return remember(page, 'product', draft, { mode: 'form-preview', saved: false, uploaded: false, storeId: id, product, draft });
  }
  if (command === 'stores.list') {
    await goto(page, '/myship/list1');
    if (args.search) {
      await page.locator('#searchText').fill(args.search);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.locator('#SearchButton').click(),
      ]);
    }
    await page.locator('#AppContent').waitFor();
    const rows = await page.locator('#AppContent .table > table tbody tr').evaluateAll(rows => rows.map(row => ({
      name: row.querySelector('[data-th="賣場名稱"]')?.innerText.trim(),
      text: row.innerText.trim(),
      links: Array.from(row.querySelectorAll('a[href]'), a => ({ text: a.innerText, href: a.href })),
      id: (row.innerText + ' ' + Array.from(row.querySelectorAll('[href],[onclick]'), e => `${e.getAttribute('href')} ${e.getAttribute('onclick')}`).join(' ')).match(/GM\d+/)?.[0],
    })).filter(row => row.id));
    return { items: rows, scope: '目前頁面；使用 --search 縮小範圍', url: page.url() };
  }
  if (command === 'stores.get' || command === 'products.list') {
    const id = storeId(args.id);
    await goto(page, `/general/maintain/${id}`);
    await page.locator('#Cgdm_Name').waitFor();
    if (command === 'stores.get') return {
      id, name: await page.locator('#Cgdm_Name').inputValue(),
      description: await page.locator('#divSummernote .note-editable').innerText(),
      status: await page.locator('#OnShelf').isChecked() ? 'on' : 'off',
      visibility: await page.locator('#isPublic').isChecked() ? 'public' : 'hidden',
    };
    await page.locator('#productsTab').click();
    return { storeId: id, products: await readProducts(page) };
  }
  if (command === 'page.inspect') {
    return { url: page.url(), title: await page.title(), text: (await page.locator('#AppContent').innerText()).slice(0, 30000),
      dialogs: await page.locator('#alertify').allTextContents(),
      tail: (await page.locator('body').innerText()).slice(-3000),
      uploadControls: await page.locator('input[type="file"]').evaluateAll(nodes => nodes.map(n => ({ id: n.id,
        state: n.closest('.slim')?.getAttribute('data-state'), files: n.files?.length }))),
      actionButtons: await page.locator('button[data-action]').evaluateAll(nodes => nodes.filter(n => n.getClientRects().length)
        .map(n => ({ text: n.innerText, action: n.getAttribute('data-action'), class: n.className }))) };
  }
  throw new Error(`尚未實作指令：${command}`);
}

async function readProducts(page) {
  return await page.locator('#div_products input[name^="product.Cgdd_Product_Name["]').evaluateAll(inputs => inputs.map(input => {
    const index = input.name.match(/\[(\d+)\]/)[1];
    const root = document.getElementById(`div_product_${index}`);
    const values = prefix => Array.from(root.querySelectorAll('input')).filter(e => e.name.startsWith(prefix)).map(e => e.value);
    const double = root.querySelector(`#div_double_spec_${index}`).parentElement.style.display !== 'none';
    const axes = [1, 2].map((axis, i) => ({
      name: document.getElementById(`DoubleSpecificationsItem.Cgdd_CgdsiValue${i ? 'Sub' : 'Main'}[${index}]`)?.value || '',
      options: Array.from(root.querySelectorAll('input')).filter(e => e.name === `DoubleSpecificationsItem.Cgdsi_ItemValue[${index}][${axis}]` && e.value)
        .map(e => ({ index: Number(e.id.match(/\[(\d+)\]$/)[1]), value: e.value })),
    }));
    const variants = Array.from(root.querySelectorAll('input')).filter(e => /^DoubleSpecifications\[.+\.Cgds_Inventory$/.test(e.id)).map(e => {
      const [, main, sub] = e.id.match(/\.Main\[(\d+)\]\.Sub\[(\d+)\]/);
      return { options: [axes[0].options.find(v => v.index === Number(main))?.value, axes[1].options.find(v => v.index === Number(sub))?.value],
        stock: e.value, price: document.getElementById(e.id.replace('Cgds_Inventory', 'Cgds_Price')).value,
        salePrice: document.getElementById(e.id.replace('Cgds_Inventory', 'Cgds_Sprice')).value };
    }).filter(v => v.options.every(Boolean));
    return { index: Number(index), id: values('product.ID[')[0] || '', name: input.value,
      status: root.querySelector(`[id="normal_${index}"]`).checked ? 'on' : 'off',
      condition: root.querySelector(`[id="new_${index}"]`).checked ? 'new' : 'used',
      minOrder: values('product.Cgdd_Product_MinOrder[')[0], maxOrder: values('product.Cgdd_Product_MaxOrder[')[0],
      specificationType: double ? 'double' : 'single',
      specifications: double ? [] : values('specification.Cgds_Spec[').map((name, i) => ({ name,
        stock: values('specification.Cgds_Inventory[')[i], price: values('specification.Cgds_Price[')[i], salePrice: values('specification.Cgds_Sprice[')[i] })),
      ...(double ? { doubleSpecifications: { axes: axes.map(a => ({ name: a.name, options: a.options.map(o => o.value) })), variants } } : {}),
      description: root.querySelector('.note-editable')?.innerText || '',
      images: Array.from(root.querySelectorAll('img.img-responsive')).filter(img => !img.closest('.format_thumbs')).map(img => img.src),
      specificationImages: Array.from(root.querySelectorAll('.format_thumbs > .upload-col')).filter(e => e.querySelector('img.img-responsive'))
        .map(e => ({ option: Array.from(e.querySelectorAll('a')).at(-1)?.innerText.trim(), url: e.querySelector('img.img-responsive').src })),
    };
  }));
}

async function fillProduct(page, draft) {
  let products = await readProducts(page), product;
  if (draft.match) {
    const [key, value] = Object.entries(draft.match)[0];
    const matches = products.filter(p => p[key] === value);
    if (matches.length !== 1) throw new Error(`商品 match 找到 ${matches.length} 筆，需唯一精確匹配。`);
    product = matches[0];
  } else {
    product = products.find(p => !p.id && !p.name);
    if (!product) {
      await page.locator('#menuToggle').click();
      await page.locator('#menuPanel').getByText('新增商品', { exact: true }).click();
      await page.waitForFunction(count => document.querySelectorAll('#div_products input[name^="product.Cgdd_Product_Name["]').length > count
        || document.getElementById('alertify')?.innerText.includes('需完成填寫'), products.length);
      products = await readProducts(page);
      product = products.find(p => !p.id && !p.name);
      if (!product) throw new Error('網站要求完成前一商品資訊（含圖片）後才能新增；目前預覽保留，未儲存或上傳。');
    }
  }
  const index = product.index, root = page.locator(`#div_product_${index}`);
  const minOrder = draft.minOrder ?? Number(product.minOrder), maxOrder = draft.maxOrder ?? Number(product.maxOrder);
  if (maxOrder && minOrder > maxOrder) throw new Error('套用後最低下單數量會超過單次上限。');
  if (draft.images && product.images.length + draft.images.length > 7) throw new Error('既有主圖加上待新增圖片超過 7 張。');
  const input = name => root.locator(`input[name="product.${name}[${index}]"]`);
  if (draft.name !== undefined) await input('Cgdd_Product_Name').fill(draft.name);
  if (draft.description !== undefined) await root.locator('.note-editable').fill(draft.description);
  if (draft.status !== undefined) await selectRadio(page, `${draft.status === 'on' ? 'normal' : 'down'}_${index}`);
  if (draft.condition !== undefined) await selectRadio(page, `${draft.condition === 'new' ? 'new' : 'secondhand'}_${index}`);
  for (const [key, field] of [['minOrder', 'Cgdd_Product_MinOrder'], ['maxOrder', 'Cgdd_Product_MaxOrder']])
    if (draft[key] !== undefined) await input(field).fill(String(draft[key]));
  if (draft.specifications) {
    if (product.id && product.specificationType !== 'single') throw new Error('不可透過預覽將既有雙規格轉單規格。');
    const area = root.locator(`#div_spec_${index}`);
    if (!await area.isVisible()) await root.getByRole('button', { name: /新增單規格/ }).click();
    const names = area.locator(`input[name="specification.Cgds_Spec[${index}]"]`);
    for (const spec of draft.specifications) {
      let current = await names.evaluateAll(nodes => nodes.map(n => n.value));
      if (current.filter(v => v === spec.name).length > 1) throw new Error('網站規格名稱重複，無法精確匹配。');
      let at = current.indexOf(spec.name);
      if (at < 0) at = current.indexOf('');
      if (at < 0) {
        await root.getByRole('button', { name: /新增其他規格/ }).click();
        at = current.length;
      }
      await names.nth(at).fill(spec.name);
      await names.nth(at).press('Tab');
      if (spec.salePrice === undefined) {
        const oldSale = await area.locator(`input[name="specification.Cgds_Sprice[${index}]"]`).nth(at).inputValue();
        if (oldSale && Number(oldSale) > spec.price) throw new Error('保留的優惠價高於新價格，請明確指定 salePrice。');
      }
      for (const [key, field] of [['stock', 'Cgds_Inventory'], ['price', 'Cgds_Price'], ['salePrice', 'Cgds_Sprice']])
        if (spec[key] !== undefined) await area.locator(`input[name="specification.${field}[${index}]"]`).nth(at).fill(spec[key] === null ? '' : String(spec[key]));
    }
  }
  if (draft.doubleSpecifications) {
    const spec = draft.doubleSpecifications;
    if (product.id && (product.specificationType !== 'double' || JSON.stringify(product.doubleSpecifications.axes) !== JSON.stringify(spec.axes)))
      throw new Error('既有雙規格只支援相同軸名稱與選項的價格／庫存更新。');
    if (!await root.locator(`#div_double_spec_${index}`).isVisible()) await root.getByRole('button', { name: /新增雙規格/ }).click();
    if (!product.id) for (let axis = 0; axis < 2; axis++) {
      await root.locator(`[id="DoubleSpecificationsItem.Cgdd_CgdsiValue${axis ? 'Sub' : 'Main'}[${index}]"]`).fill(spec.axes[axis].name);
      for (let option = 0; option < spec.axes[axis].options.length; option++) {
        const field = root.locator(`[id="DoubleSpecificationsItem.Cgdsi_ItemValue[${index}][${axis + 1}][${option}]"]`);
        await field.fill(spec.axes[axis].options[option]); await field.press('Tab');
      }
    }
    const optionIndices = [];
    for (let axis = 1; axis <= 2; axis++) optionIndices.push(await root.locator(`input[name="DoubleSpecificationsItem.Cgdsi_ItemValue[${index}][${axis}]"]`)
      .evaluateAll(nodes => Object.fromEntries(nodes.filter(n => n.value).map(n => [n.value, Number(n.id.match(/\[(\d+)\]$/)[1])]))));
    for (const variant of spec.variants) {
      const [main, sub] = variant.options.map((v, i) => optionIndices[i][v]);
      if (main === undefined || sub === undefined) throw new Error('找不到指定雙規格選項。');
      if (variant.salePrice === undefined) {
        const oldSale = await root.locator(`[id="DoubleSpecifications[${index}].Main[${main}].Sub[${sub}].Td.Cgds_Sprice"]`).inputValue();
        if (oldSale && Number(oldSale) > variant.price) throw new Error('保留的優惠價高於新價格，請明確指定 salePrice。');
      }
      for (const [key, field] of [['stock', 'Cgds_Inventory'], ['price', 'Cgds_Price'], ['salePrice', 'Cgds_Sprice']])
        if (variant[key] !== undefined) await root.locator(`[id="DoubleSpecifications[${index}].Main[${main}].Sub[${sub}].Td.${field}"]`).fill(variant[key] === null ? '' : String(variant[key]));
    }
  }
  const result = (await readProducts(page)).find(p => p.index === index);
  const options = result.specificationType === 'double' ? result.doubleSpecifications.axes[0].options : result.specifications.map(s => s.name);
  for (const image of draft.specificationImages || []) if (!options.includes(image.option)) throw new Error(`找不到圖片對應規格：${image.option}`);
  return result;
}

async function selectRadio(page, id) {
  const input = page.locator(`[id="${id}"]`);
  if (!await input.isEnabled()) throw new Error(`網站已停用 ${id}。`);
  if (!await input.isChecked()) await page.locator(`label[for="${id}"]`).click();
  if (!await input.isChecked()) throw new Error(`未能選取 ${id}。`);
}
