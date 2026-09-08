import { storeId } from './operations.js';
import { readFileSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';

export function validateStoreDraft(input, baseDir = process.cwd()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('草稿必須是 JSON 物件。');
  const allowed = ['id', 'name', 'description', 'status', 'visibility', 'products', 'images', 'pickupFee'];
  for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new Error(`不支援的草稿欄位：${key}`);
  const draft = { ...input };
  if (draft.id !== undefined) draft.id = storeId(draft.id);
  for (const [key, max] of [['name', 50], ['description', 3000]]) {
    if (draft[key] === undefined && (draft.id || key === 'description')) continue;
    if (typeof draft[key] !== 'string' || (key === 'name' && !draft[key].trim()) || draft[key].length > max)
      throw new Error(`${key} 必須為 1–${max} 字元的文字。`);
    if (/[&()=;'"<>\\,]/.test(draft[key])) throw new Error(`${key} 含網站不接受的特殊符號。`);
  }
  for (const [key, options, fallback] of [['status', ['on', 'off'], 'off'], ['visibility', ['public', 'hidden'], 'hidden']]) {
    if (draft[key] === undefined && !draft.id) draft[key] = fallback;
    if (draft[key] !== undefined && !options.includes(draft[key])) throw new Error(`${key} 必須為 ${options.join(' / ')}。`);
  }
  if (draft.id && Object.keys(draft).length === 1) throw new Error('請提供至少一個欲修改的欄位。');
  if (draft.pickupFee !== undefined) integer(draft.pickupFee, 20000, 'pickupFee');
  if (draft.images !== undefined) draft.images = images(draft.images, 3, baseDir);
  if (draft.products !== undefined) {
    if (!Array.isArray(draft.products) || !draft.products.length || draft.products.length > 50) throw new Error('products 必須有 1–50 筆。');
    draft.products = draft.products.map(product => validateProductDraft(product, baseDir));
    if (!draft.id && draft.products.some(p => p.match)) throw new Error('新賣場不可指定既有商品 match。');
  }
  return draft;
}

function keys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必須是物件。`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label} 不支援欄位 ${key}。`);
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[&()=;'"<>\\,]/.test(value))
    throw new Error(`${label} 必須為 1–${max} 字元且不含網站禁止的特殊符號。`);
}
function integer(value, max, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new Error(`${label} 必須為 0–${max} 整數。`);
}
function prices(value) {
  integer(value.stock, 99999, 'stock'); integer(value.price, 20000, 'price');
  if (value.salePrice !== undefined && value.salePrice !== null) {
    integer(value.salePrice, 20000, 'salePrice');
    if (value.salePrice > value.price) throw new Error('salePrice 不可超過 price。');
  }
}
export function images(value, max, baseDir = process.cwd()) {
  if (!Array.isArray(value) || !value.length || value.length > max) throw new Error(`images 必須有 1–${max} 個檔案路徑。`);
  return value.map(path => {
    if (typeof path !== 'string' || !path) throw new Error('圖片必須是本機檔案路徑。');
    path = resolve(baseDir, path);
    const stat = statSync(path);
    if (!stat.isFile() || !stat.size || stat.size > 6 * 1024 * 1024) throw new Error(`圖片須為非空檔案且不超過 6 MB：${path}`);
    const data = readFileSync(path);
    const extension = extname(path).toLowerCase();
    const valid = ['.jpg', '.jpeg'].includes(extension) ? data[0] === 255 && data[1] === 216 && data[2] === 255
      : extension === '.png' ? data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      : extension === '.gif' ? /^GIF8[79]a$/.test(data.subarray(0, 6).toString())
      : extension === '.bmp' && data.subarray(0, 2).toString() === 'BM';
    if (!valid) throw new Error(`圖片副檔名或檔頭不符 JPEG／PNG／GIF／BMP：${path}`);
    return path;
  });
}

export function validateProductDraft(input, baseDir = process.cwd()) {
  keys(input, ['match', 'name', 'description', 'status', 'condition', 'minOrder', 'maxOrder', 'specifications', 'doubleSpecifications', 'images', 'specificationImages'], '商品');
  const draft = { ...input };
  if (draft.match !== undefined) {
    keys(draft.match, ['id', 'name'], 'match');
    if (Object.keys(draft.match).length !== 1 || !Object.values(draft.match).every(v => typeof v === 'string' && v.trim())) throw new Error('match 必須只指定一個非空 id 或完整 name。');
    if (Object.keys(draft).length === 1) throw new Error('商品缺少欲修改的欄位。');
  }
  for (const [key, max] of [['name', 60], ['description', 2000]]) if (!draft.match || draft[key] !== undefined) text(draft[key], max, key);
  for (const [key, values, fallback] of [['status', ['on', 'off'], 'off'], ['condition', ['new', 'used'], 'new']]) {
    if (!draft.match && draft[key] === undefined) draft[key] = fallback;
    if (draft[key] !== undefined && !values.includes(draft[key])) throw new Error(`${key} 必須為 ${values.join(' / ')}。`);
  }
  for (const key of ['minOrder', 'maxOrder']) if (draft[key] !== undefined) integer(draft[key], Number.MAX_SAFE_INTEGER, key);
  if (draft.maxOrder && draft.minOrder > draft.maxOrder) throw new Error('minOrder 不可超過 maxOrder。');
  if (draft.specifications && draft.doubleSpecifications) throw new Error('單規格與雙規格不可同時指定。');
  if (!draft.match && !draft.specifications && !draft.doubleSpecifications) throw new Error('新商品需要 specifications 或 doubleSpecifications。');
  if (draft.specifications !== undefined) {
    if (!Array.isArray(draft.specifications) || !draft.specifications.length) throw new Error('specifications 不可為空。');
    const seen = new Set();
    for (const spec of draft.specifications) {
      keys(spec, ['name', 'stock', 'price', 'salePrice'], 'specification'); text(spec.name, 25, '規格名稱'); prices(spec);
      if (seen.has(spec.name)) throw new Error('規格名稱重複。'); seen.add(spec.name);
    }
  }
  if (draft.doubleSpecifications !== undefined) {
    const spec = draft.doubleSpecifications;
    keys(spec, ['axes', 'variants'], 'doubleSpecifications');
    if (!Array.isArray(spec.axes) || spec.axes.length !== 2) throw new Error('雙規格需要兩個 axes。');
    for (const axis of spec.axes) {
      keys(axis, ['name', 'options'], 'axis'); text(axis.name, 25, '規格軸名稱');
      if (!Array.isArray(axis.options) || !axis.options.length || new Set(axis.options).size !== axis.options.length) throw new Error('規格軸選項不可為空或重複。');
      axis.options.forEach(option => text(option, 25, '規格選項'));
    }
    if (spec.axes[0].name === spec.axes[1].name) throw new Error('兩個規格軸名稱不可相同。');
    if (!Array.isArray(spec.variants) || spec.variants.length !== spec.axes[0].options.length * spec.axes[1].options.length) throw new Error('variants 必須涵蓋所有交叉組合。');
    const seen = new Set();
    for (const variant of spec.variants) {
      keys(variant, ['options', 'stock', 'price', 'salePrice'], 'variant'); prices(variant);
      if (!Array.isArray(variant.options) || variant.options.length !== 2 || variant.options.some((v, i) => !spec.axes[i].options.includes(v))) throw new Error('variant.options 必須對應兩個軸的選項。');
      const key = JSON.stringify(variant.options);
      if (seen.has(key)) throw new Error('交叉規格重複。'); seen.add(key);
    }
  }
  if (draft.images !== undefined) draft.images = images(draft.images, 7, baseDir);
  if (draft.specificationImages !== undefined) {
    if (!Array.isArray(draft.specificationImages) || !draft.specificationImages.length) throw new Error('specificationImages 不可為空。');
    const seen = new Set();
    draft.specificationImages = draft.specificationImages.map(item => {
      keys(item, ['option', 'path'], 'specificationImage'); text(item.option, 25, '圖片規格名稱');
      if (seen.has(item.option)) throw new Error('規格圖片重複。'); seen.add(item.option);
      const options = draft.specifications?.map(s => s.name) || draft.doubleSpecifications?.axes[0].options;
      if (options && !options.includes(item.option)) throw new Error('規格圖片必須對應單規格或雙規格第一軸。');
      return { option: item.option, path: images([item.path], 1, baseDir)[0] };
    });
  }
  return draft;
}
