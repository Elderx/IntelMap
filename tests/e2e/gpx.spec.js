import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

test.describe('GPX Overlay', () => {
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

  test('toggle GPX overlay from layers menu', async ({ page }) => {
    // Open base layer dropdown
    await page.click('#layers-toggle');

    // Find GPX accordion item
    const gpxAccordion = page.locator('.header-accordion-item').filter({ hasText: '📍 GPX' }).locator('.header-accordion-header');
    await expect(gpxAccordion).toBeVisible();

    // Click to expand
    await gpxAccordion.click();

    // Check for GPX checkbox
    const gpxCheckbox = page.locator('#gpx-enabled');
    await expect(gpxCheckbox).toBeVisible();
  });

  test('load GPX file and verify track appears', async ({ page }) => {
    // Enable GPX overlay
    await page.click('#layers-toggle');
    const gpxAccordion = page.locator('.header-accordion-item').filter({ hasText: '📍 GPX' }).locator('.header-accordion-header');
    await gpxAccordion.click();
    await page.check('#gpx-enabled');

    // Wait for GPX panel to appear
    await expect(page.locator('#gpx-panel')).toBeVisible({ timeout: 5000 });

    // Get the test GPX file content
    const gpxPath = join(process.cwd(), 'tests/fixtures/test-track.gpx');
    const gpxContent = readFileSync(gpxPath, 'utf-8');

    // Create a File object from the GPX content
    await page.evaluate(async (content) => {
      // Create a file input programmatically
      const fileInput = document.querySelector('#gpx-file-input');
      if (!fileInput) {
        throw new Error('GPX file input not found');
      }

      // Create a blob from the content
      const blob = new Blob([content], { type: 'application/gpx+xml' });
      const file = new File([blob], 'test-track.gpx', { type: 'application/gpx+xml' });

      // Create a DataTransfer to simulate file selection
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      // Trigger change event
      const event = new Event('change', { bubbles: true });
      fileInput.dispatchEvent(event);
    }, gpxContent);

    // Wait for file to load and panel to update
    await page.waitForTimeout(3000);

    // Verify file appears in the list
    const fileList = page.locator('#gpx-file-list');
    await expect(fileList).toBeVisible();
    await expect(fileList.locator('.gpx-file-name')).toContainText('test-track.gpx');

    // Verify statistics are displayed
    const statsSection = page.locator('#gpx-stats-section');
    await expect(statsSection).toBeVisible();
    await expect(statsSection).toContainText('Distance:');

    // Verify elevation chart is displayed
    const chartsSection = page.locator('#gpx-charts-section');
    await expect(chartsSection).toBeVisible();
    await expect(chartsSection.locator('canvas')).toHaveCount(1); // Elevation chart
  });

  test('GPX statistics display correctly', async ({ page }) => {
    // Enable GPX and load file
    await page.click('#layers-toggle');
    const gpxAccordion = page.locator('.header-accordion-item').filter({ hasText: '📍 GPX' }).locator('.header-accordion-header');
    await gpxAccordion.click();
    await page.check('#gpx-enabled');

    await page.waitForTimeout(500);

    // Load test GPX file
    const gpxPath = join(process.cwd(), 'tests/fixtures/test-track.gpx');
    const gpxContent = readFileSync(gpxPath, 'utf-8');

    await page.evaluate(async (content) => {
      const fileInput = document.querySelector('#gpx-file-input');
      const blob = new Blob([content], { type: 'application/gpx+xml' });
      const file = new File([blob], 'test-track.gpx', { type: 'application/gpx+xml' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }, gpxContent);

    // Wait for statistics to load
    await page.waitForTimeout(2000);

    // Check statistics
    await expect(page.locator('#gpx-stats')).toContainText('Distance:');
    await expect(page.locator('#gpx-stats')).toContainText('Duration:');
    await expect(page.locator('#gpx-stats')).toContainText('Elevation Gain:');
    await expect(page.locator('#gpx-stats')).toContainText('Elevation Loss:');
  });

  test('change GPX color mode', async ({ page }) => {
    // Enable GPX and load file
    await page.click('#layers-toggle');
    const gpxAccordion = page.locator('.header-accordion-item').filter({ hasText: '📍 GPX' }).locator('.header-accordion-header');
    await gpxAccordion.click();
    await page.check('#gpx-enabled');

    await page.waitForTimeout(500);

    // Load test GPX file
    const gpxPath = join(process.cwd(), 'tests/fixtures/test-track.gpx');
    const gpxContent = readFileSync(gpxPath, 'utf-8');

    await page.evaluate(async (content) => {
      const fileInput = document.querySelector('#gpx-file-input');
      const blob = new Blob([content], { type: 'application/gpx+xml' });
      const file = new File([blob], 'test-track.gpx', { type: 'application/gpx+xml' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }, gpxContent);

    await page.waitForTimeout(2000);

    // Check elevation color mode (default)
    let elevationRadio = page.locator('input[name="gpx-color-mode"][value="elevation"]');
    await expect(elevationRadio).toBeChecked();

    // Switch to solid color mode
    await page.click('input[name="gpx-color-mode"][value="solid"]');
    await expect(page.locator('input[name="gpx-color-mode"][value="solid"]')).toBeChecked();

    // Switch back to elevation
    await page.click('input[name="gpx-color-mode"][value="elevation"]');
    await expect(elevationRadio).toBeChecked();
  });

  test('toggle chart visibility', async ({ page }) => {
    // Enable GPX and load file
    await page.click('#layers-toggle');
    const gpxAccordion = page.locator('.header-accordion-item').filter({ hasText: '📍 GPX' }).locator('.header-accordion-header');
    await gpxAccordion.click();
    await page.check('#gpx-enabled');

    await page.waitForTimeout(500);

    // Load test GPX file
    const gpxPath = join(process.cwd(), 'tests/fixtures/test-track.gpx');
    const gpxContent = readFileSync(gpxPath, 'utf-8');

    await page.evaluate(async (content) => {
      const fileInput = document.querySelector('#gpx-file-input');
      const blob = new Blob([content], { type: 'application/gpx+xml' });
      const file = new File([blob], 'test-track.gpx', { type: 'application/gpx+xml' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }, gpxContent);

    await page.waitForTimeout(2000);

    // Uncheck elevation chart
    const elevationCheckbox = page.locator('#gpx-show-elevation');
    await elevationCheckbox.uncheck();
    await page.waitForTimeout(500);

    // Re-check elevation chart
    await elevationCheckbox.check();
    await page.waitForTimeout(500);
  });

  test('remove GPX file', async ({ page }) => {
    // Enable GPX and load file
    await page.click('#layers-toggle');
    const gpxAccordion = page.locator('.header-accordion-item').filter({ hasText: '📍 GPX' }).locator('.header-accordion-header');
    await gpxAccordion.click();
    await page.check('#gpx-enabled');

    await page.waitForTimeout(500);

    // Load test GPX file
    const gpxPath = join(process.cwd(), 'tests/fixtures/test-track.gpx');
    const gpxContent = readFileSync(gpxPath, 'utf-8');

    await page.evaluate(async (content) => {
      const fileInput = document.querySelector('#gpx-file-input');
      const blob = new Blob([content], { type: 'application/gpx+xml' });
      const file = new File([blob], 'test-track.gpx', { type: 'application/gpx+xml' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }, gpxContent);

    await page.waitForTimeout(2000);

    // Verify file is in list
    await expect(page.locator('.gpx-file-name')).toContainText('test-track.gpx');

    // Click remove button
    await page.click('.gpx-file-remove');

    await page.waitForTimeout(500);

    // Verify file section is hidden
    await expect(page.locator('#gpx-file-section')).not.toBeVisible();
  });

  test('GPX state in permalink', async ({ page }) => {
    // Enable GPX and load file
    await page.click('#layers-toggle');
    const gpxAccordion = page.locator('.header-accordion-item').filter({ hasText: '📍 GPX' }).locator('.header-accordion-header');
    await gpxAccordion.click();
    await page.check('#gpx-enabled');

    await page.waitForTimeout(500);

    // Load test GPX file
    const gpxPath = join(process.cwd(), 'tests/fixtures/test-track.gpx');
    const gpxContent = readFileSync(gpxPath, 'utf-8');

    await page.evaluate(async (content) => {
      const fileInput = document.querySelector('#gpx-file-input');
      const blob = new Blob([content], { type: 'application/gpx+xml' });
      const file = new File([blob], 'test-track.gpx', { type: 'application/gpx+xml' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }, gpxContent);

    await page.waitForTimeout(2000);

    // Get URL and verify it contains GPX parameter
    const url = page.url();
    expect(url).toContain('gpx=');
  });

  test('GPX panel close and reopen', async ({ page }) => {
    // Enable GPX
    await page.click('#layers-toggle');
    const gpxAccordion = page.locator('.header-accordion-item').filter({ hasText: '📍 GPX' }).locator('.header-accordion-header');
    await gpxAccordion.click();
    await page.check('#gpx-enabled');

    // Wait for GPX panel to appear
    await expect(page.locator('#gpx-panel')).toBeVisible({ timeout: 5000 });

    // Close panel
    await page.click('#gpx-panel-close');
    await expect(page.locator('#gpx-panel')).not.toBeVisible();

    // Reopen by clicking GPX in layers
    await gpxAccordion.click();
    await expect(page.locator('#gpx-panel')).toBeVisible({ timeout: 2000 });
  });
});
