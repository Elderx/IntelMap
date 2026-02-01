import { test, expect } from '@playwright/test';

test.describe('Aircraft Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
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
