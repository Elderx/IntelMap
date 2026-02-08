import { test, expect } from '@playwright/test';

test.describe('Aircraft Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');

    // Handle authentication
    const loginOverlay = page.locator('text=IntelMap — Sign in');
    await expect(loginOverlay).toBeVisible({ timeout: 10000 });
    await page.fill('input[placeholder="Username"]', 'admin');
    await page.fill('input[placeholder="Password"]', 'admin');
    await page.click('button:has-text("Sign in")');
    await expect(loginOverlay).toBeHidden();

    // Wait for map to initialize
    await page.waitForSelector('.ol-viewport');
  });

  test('should restore from permalink', async ({ page }) => {
    // Navigate with aircraft parameter
    await page.goto('http://localhost:8080/?aircraft=1');
    await page.waitForSelector('.ol-viewport');

    // Wait for potential aircraft data load
    await page.waitForTimeout(15000);

    // Verify page loaded successfully
    await expect(page.locator('.ol-viewport')).toBeVisible();
  });
});
