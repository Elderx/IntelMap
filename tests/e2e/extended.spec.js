
import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';

test.describe('Extended Integrations', () => {
    test.beforeEach(async ({ page }) => {
        // Enable diagnostics
        page.on('console', msg => console.log(`PAGE LOG: ${msg.text()}`));
        page.on('pageerror', err => console.log(`PAGE ERROR: ${err.message}`));

        await page.addInitScript(() => {
            window.addEventListener('beforeunload', () => {
                window.collectCoverage && window.collectCoverage();
            });
        });

        await page.goto('/');

        const loginOverlay = page.locator('text=IntelMap — Sign in');
        await expect(loginOverlay).toBeVisible({ timeout: 10000 });
        await page.fill('input[placeholder="Username"]', 'admin');
        await page.fill('input[placeholder="Password"]', 'admin');
        await page.click('button:has-text("Sign in")');
        await expect(loginOverlay).toBeHidden();

        // Wait for bootstrap to finish (indicated by controls appearing)
        await expect(page.locator('.ol-zoom-in')).toBeVisible({ timeout: 10000 });
    });

    test.afterEach(async ({ page }) => {
        const coverage = await page.evaluate(() => window.__coverage__);
        if (coverage) {
            await fs.writeFile(
                path.join('.nyc_output', `coverage-extended-${Date.now()}.json`),
                JSON.stringify(coverage)
            );
        }
    });

    test('should toggle split screen', async ({ page }) => {
        const splitBtn = page.locator('#split-toggle');
        await expect(splitBtn).toBeVisible();

        await splitBtn.click();
        await expect(page.locator('#split-maps-container')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#map-left')).toBeVisible();
        await expect(page.locator('#map-right')).toBeVisible();

        await splitBtn.click();
        await expect(page.locator('#split-maps-container')).toBeHidden();
        await expect(page.locator('#map')).toBeVisible();
    });

    test('should switch layers', async ({ page }) => {
        // Open layers dropdown
        await page.click('#layers-toggle');
        await expect(page.locator('#layers-dropdown')).toBeVisible({ timeout: 10000 });

        // Expand basemap accordion if needed
        const basemapAccordion = page.locator('.header-accordion-header').filter({ hasText: '🗺️ Basemap' });
        const accordionItem = basemapAccordion.locator('..');

        const openAccordion = async () => {
            const isOpen = await accordionItem.evaluate(el => el.classList.contains('open'));
            if (!isOpen) {
                await basemapAccordion.click();
            }
        };

        await openAccordion();

        // Select taustakartta
        let select = page.locator('#header-basemap-selector');
        await expect(select).toBeVisible({ timeout: 5000 });
        await select.selectOption({ value: 'taustakartta' });
        await page.waitForTimeout(1000);

        // Select maastokartta - accordion may close and element may be detached
        await openAccordion();
        select = page.locator('#header-basemap-selector');
        await expect(select).toBeVisible({ timeout: 5000 });
        await select.selectOption({ value: 'maastokartta' });
        await page.waitForTimeout(500);

        // Test MapAnt
        await openAccordion();
        select = page.locator('#header-basemap-selector');
        const [request] = await Promise.all([
            page.waitForRequest(req => req.url().includes('wmts_EPSG3857.php')),
            select.selectOption({ value: 'mapant' })
        ]);
        await page.waitForTimeout(1000);

        // Verify final selection
        select = page.locator('#header-basemap-selector');
        await expect(select).toHaveValue('mapant');
        expect(request.url()).toContain('wmts_EPSG3857.php');
    });

    test('should use drawing tools', async ({ page }) => {
        const toggle = page.locator('#draw-menu-toggle');
        const menu = page.locator('#draw-dropdown');

        const ensureMenuOpen = async () => {
            if (!await menu.isVisible()) {
                await toggle.click();
                await expect(menu).toBeVisible();
            }
        };

        await ensureMenuOpen();

        // 1. Marker
        await page.click('#draw-marker-btn');
        // Dropdown closes automatically via closeAllDropdowns()
        await expect(menu).toBeHidden();
        await page.waitForTimeout(500);
        const canvas = page.locator('#map canvas');
        await canvas.click({ position: { x: 400, y: 300 } });

        const formMarker = page.locator('text=Add Marker');
        await expect(formMarker).toBeVisible();
        await page.click('button:has-text("Cancel")');
        await expect(formMarker).toBeHidden();

        // 2. Line
        await ensureMenuOpen();
        const drawLineBtn = page.locator('#draw-line-btn');
        await drawLineBtn.click({ force: true });
        // Dropdown closes automatically via closeAllDropdowns()
        await expect(menu).toBeHidden();

        // Draw usage: click, click, dblclick
        await canvas.click({ position: { x: 400, y: 350 } });
        await canvas.click({ position: { x: 450, y: 400 } });
        await canvas.dblclick({ position: { x: 500, y: 400 } });
        await page.waitForTimeout(500);

        // 3. Polygon
        await ensureMenuOpen();
        const drawPolygonBtn = page.locator('#draw-polygon-btn');
        await drawPolygonBtn.click({ force: true });
        // Dropdown closes automatically via closeAllDropdowns()
        await expect(menu).toBeHidden();

        await canvas.click({ position: { x: 100, y: 100 } });
        await canvas.click({ position: { x: 200, y: 100 } });
        await canvas.click({ position: { x: 200, y: 200 } });
        await canvas.dblclick({ position: { x: 100, y: 200 } });

        const formPoly = page.locator('text=Add Polygon');
        await expect(formPoly).toBeVisible();
        await page.click('button:has-text("Cancel")');
        await expect(formPoly).toBeHidden();

        // 4. Measure
        await ensureMenuOpen();
        const drawMeasureBtn = page.locator('#draw-measure-btn');
        await drawMeasureBtn.click({ force: true });
        // Dropdown closes automatically via closeAllDropdowns()
        await expect(menu).toBeHidden();

        await canvas.click({ position: { x: 300, y: 300 } });
        await canvas.click({ position: { x: 350, y: 350 } });
        await canvas.click({ position: { x: 400, y: 350 } });
        await canvas.dblclick({ position: { x: 450, y: 350 } });
    });
});

test.describe('Permalink Restore', () => {
    test('should restore state from URL', async ({ page }) => {
        const targetUrl = '/?lat=60.2000000&lon=25.0000000&z=10&layer=ortokuva';

        await page.addInitScript(() => {
            window.addEventListener('beforeunload', () => {
                window.collectCoverage && window.collectCoverage();
            });
        });

        await page.goto(targetUrl);

        const loginOverlay = page.locator('text=IntelMap — Sign in');
        await expect(loginOverlay).toBeVisible({ timeout: 10000 });
        await page.fill('input[placeholder="Username"]', 'admin');
        await page.fill('input[placeholder="Password"]', 'admin');
        await page.click('button:has-text("Sign in")');
        await expect(loginOverlay).toBeHidden();

        await expect(page.locator('.ol-zoom-in')).toBeVisible({ timeout: 10000 });

        // Open layers dropdown to access basemap selector
        await page.click('#layers-toggle');
        await expect(page.locator('#layers-dropdown')).toBeVisible();

        const select = page.locator('#header-basemap-selector');
        await expect(select).toHaveValue('ortokuva');

        const coverage = await page.evaluate(() => window.__coverage__);
        if (coverage) {
            await fs.writeFile(
                path.join('.nyc_output', `coverage-permalink-${Date.now()}.json`),
                JSON.stringify(coverage)
            );
        }
    });
});
