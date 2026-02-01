import { test, expect } from '@playwright/test';

test.describe('AIS Ships Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');

    // Handle authentication
    const loginOverlay = page.locator('text=MML Map — Sign in');
    await expect(loginOverlay).toBeVisible({ timeout: 10000 });
    await page.fill('input[placeholder="Username"]', 'admin');
    await page.fill('input[placeholder="Password"]', 'admin');
    await page.click('button:has-text("Sign in")');
    await expect(loginOverlay).toBeHidden();

    // Wait for map to initialize
    await page.waitForSelector('.ol-viewport');
  });

  test('toggle AIS overlay', async ({ page }) => {
    // Open base layer dropdown
    await page.click('#layers-toggle');

    // Expand AIS accordion
    const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: 'Ships (AIS)' });
    await accordionHeader.click();

    // Find and click AIS toggle
    const aisToggle = page.locator('#ais-enabled');
    await aisToggle.check();

    // Verify AIS layer is active
    await expect(aisToggle).toBeChecked();

    // Uncheck to disable
    await aisToggle.uncheck();
    await expect(aisToggle).not.toBeChecked();
  });

  test('AIS accordion expands', async ({ page }) => {
    await page.click('#layers-toggle');

    // Click AIS accordion header (not the toggle)
    const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: 'Ships (AIS)' });
    await accordionHeader.click();

    // Verify content is visible (interval control should be present)
    await expect(page.locator('#ais-interval-input')).toBeVisible();
  });

  test('adjust refresh interval', async ({ page }) => {
    await page.click('#layers-toggle');

    // Expand AIS accordion
    const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: 'Ships (AIS)' });
    await accordionHeader.click();

    // Change interval to 60 seconds
    await page.fill('#ais-interval-input', '60');
    await page.click('#ais-interval-apply');

    // Verify setting is applied
    const intervalValue = await page.inputValue('#ais-interval-input');
    expect(intervalValue).toBe('60');
  });

  test('permalink encodes AIS state', async ({ page }) => {
    // Enable AIS
    await page.click('#layers-toggle');

    // Expand AIS accordion
    const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: 'Ships (AIS)' });
    await accordionHeader.click();

    await page.check('#ais-enabled');

    // Wait a moment for URL to update
    await page.waitForTimeout(500);

    // Get URL
    const url = page.url();
    expect(url).toContain('ais=1');
  });

  test('restore AIS from permalink', async ({ page }) => {
    // Navigate with AIS enabled
    await page.goto('http://localhost:8080?ais=1');

    // Wait for AIS to initialize
    await page.waitForTimeout(1000);

    // Open dropdown and verify toggle is checked
    await page.click('#layers-toggle');
    const aisToggle = page.locator('#ais-enabled');
    await expect(aisToggle).toBeChecked();
  });

  test('AIS displays in active layers panel', async ({ page }) => {
    // Enable AIS
    await page.click('#layers-toggle');

    // Expand AIS accordion
    const accordionHeader = page.locator('.header-accordion-item').filter({ hasText: 'Ships (AIS)' });
    await accordionHeader.click();

    await page.check('#ais-enabled');

    // Open active layers panel
    await page.click('#active-layers-btn');

    // Verify AIS appears in active layers (may show 0 vessels if no data)
    await expect(page.locator('.active-layer-item').filter({ hasText: /Ships \(AIS\)/ })).toBeVisible();
  });
});
