import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const HOME = resolve(process.env.MYSHIP_HOME || resolve(ROOT, '../.local'));
export const ORIGIN = 'https://myship.7-11.com.tw';
export const PROFILE = resolve(HOME, 'browser-profile');

export async function openBrowser({ headed = false } = {}) {
  await mkdir(HOME, { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome', headless: !headed, viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(45000);
  return { context, page };
}

export async function loggedIn(page) {
  if (new URL(page.url()).origin !== ORIGIN) return false;
  // The greeting is hidden on narrow screens; use the protected admin surface.
  return await page.locator('#navShopManage').count() > 0
    && await page.locator('#AppContent').count() > 0;
}

export async function quickLogin(page) {
  if (await loggedIn(page)) return true;
  const current = new URL(page.url());
  if (current.origin === ORIGIN) {
    const button = page.getByRole('link', { name: /^Facebook\s*登入$/ }).or(page.getByRole('button', { name: /^Facebook\s*登入$/ }));
    if (await button.count() === 1) await button.click();
  }
  // At most one existing-permission confirmation; never fill credentials or accept new scopes.
  let continued = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const url = new URL(page.url());
    if (url.origin === ORIGIN && /^\/Home\/(Main|Index)$/i.test(url.pathname))
      await page.goto(`${ORIGIN}/myship/list1`, { waitUntil: 'domcontentloaded' });
    if (await loggedIn(page)) return true;
    if (['www.facebook.com', 'facebook.com'].includes(url.hostname)) {
      const existing = await page.getByText('你之前已將賣貨便連結到 Facebook', { exact: true }).count();
      const proceed = page.getByRole('button', { name: /^以.+的身分繼續$/ });
      if (!continued && existing && await proceed.count() === 1) {
        continued = true;
        await proceed.click();
        await page.waitForURL(u => u.origin === ORIGIN, { timeout: 20000 }).catch(() => {});
        if (new URL(page.url()).origin !== ORIGIN) return false;
      } else if (await page.locator('input[type="password"]').count()) return false;
    }
    await page.waitForTimeout(500);
  }
  return await loggedIn(page);
}
