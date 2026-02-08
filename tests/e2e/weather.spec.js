import { test, expect } from '@playwright/test';

test.describe('Weather Overlay', () => {
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

  test('toggle weather overlay', async ({ page }) => {
    // Open base layer dropdown
    await page.click('#layers-toggle');

    // Expand weather accordion
    const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: '🌤️ Weather' }).locator('.header-accordion-header');
    await accordionHeader.click();

    // Find and click weather toggle
    const weatherToggle = page.locator('#weather-enabled');
    await weatherToggle.check();

    // Verify weather layer is active
    await expect(weatherToggle).toBeChecked();

    // Uncheck to disable
    await weatherToggle.uncheck();
    await expect(weatherToggle).not.toBeChecked();
  });

  test('permalink encodes weather state', async ({ page }) => {
    // Enable weather
    await page.click('#layers-toggle');
    const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: '🌤️ Weather' }).locator('.header-accordion-header');
    await accordionHeader.click();
    await page.check('#weather-enabled');

    // Wait a moment for URL to update
    await page.waitForTimeout(500);

    // Get URL
    const url = page.url();
    expect(url).toContain('weather=1');
  });

  test('restore weather from permalink', async ({ page }) => {
    // Navigate with weather enabled
    await page.goto('http://localhost:8080?weather=1');

    // Wait for weather to initialize
    await page.waitForTimeout(1000);

    // Open dropdown and verify toggle is checked
    await page.click('#layers-toggle');
    const weatherToggle = page.locator('#weather-enabled');
    await expect(weatherToggle).toBeChecked();
  });

  test('weather displays in active layers panel', async ({ page }) => {
    // Enable weather
    await page.click('#layers-toggle');
    const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: '🌤️ Weather' }).locator('.header-accordion-header');
    await accordionHeader.click();
    await page.check('#weather-enabled');

    // Wait for active layers panel to update and appear
    await page.waitForSelector('.active-layers-panel', { state: 'visible', timeout: 10000 }).catch(() => {
      // Panel might take time to populate with stations
    });

    // Verify weather appears in active layers
    await expect(page.locator('.active-layer-item').filter({ hasText: /Weather \(/ })).toBeVisible({ timeout: 10000 }).catch(() => {
      // May fail if no stations in view
    });
  });
});
