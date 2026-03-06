import { test, expect } from '@playwright/test';

async function signIn(page, path = '/') {
  await page.goto(path);
  const loginOverlay = page.locator('text=IntelMap — Sign in');
  await expect(loginOverlay).toBeVisible({ timeout: 10000 });
  await page.fill('input[placeholder="Username"]', 'admin');
  await page.fill('input[placeholder="Password"]', 'admin');
  await page.click('button:has-text("Sign in")');
  await expect(loginOverlay).toBeHidden();
  await page.waitForSelector('#map .ol-viewport');
}

test.describe('Map context menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__INTELMAP_TEST_CLIPBOARD__ = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          async writeText(text) {
            window.__INTELMAP_TEST_CLIPBOARD__ = String(text);
          },
          async readText() {
            return window.__INTELMAP_TEST_CLIPBOARD__ || '';
          }
        }
      });
    });
  });

  test('opens on right click and copies decimal + MGRS coordinates', async ({ page }) => {
    await signIn(page);

    const mapViewport = page.locator('#map .ol-viewport');
    const clickPosition = { x: 320, y: 220 };

    await mapViewport.click({ button: 'right', position: clickPosition });

    const menu = page.locator('.map-context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('.map-context-menu-item')).toHaveCount(2);
    await expect(menu.locator('.map-context-menu-item').nth(0)).toHaveText('Copy coordinates');
    await expect(menu.locator('.map-context-menu-item').nth(1)).toHaveText('Copy coordinates (MGRS)');

    await menu.locator('.map-context-menu-item').nth(0).click();
    const decimalValue = await page.evaluate(() => window.__INTELMAP_TEST_CLIPBOARD__);
    expect(decimalValue).toMatch(/^-?\d+\.\d{7},\s-?\d+\.\d{7}$/);

    await mapViewport.click({ button: 'right', position: clickPosition });
    await menu.locator('.map-context-menu-item').nth(1).click();
    const mgrsValue = await page.evaluate(() => window.__INTELMAP_TEST_CLIPBOARD__);
    expect(mgrsValue).toMatch(/^\d{1,2}[C-X][A-HJ-NP-Z]{2}\s?\d+\s?\d+$/);
  });
});
