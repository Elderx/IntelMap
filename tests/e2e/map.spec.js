
import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';

test.describe('Map Interaction', () => {
    test.beforeEach(async ({ page }) => {
        // Add coverage collection script
        await page.addInitScript(() => {
            window.addEventListener('beforeunload', () => {
                window.collectCoverage && window.collectCoverage();
            });
        });

        // Visit page
        await page.goto('/');

        // Handle Login - wait for overlay
        const loginOverlay = page.locator('text=IntelMap — Sign in');
        await expect(loginOverlay).toBeVisible({ timeout: 10000 });

        await page.fill('input[placeholder="Username"]', 'admin');
        await page.fill('input[placeholder="Password"]', 'admin');
        await page.click('button:has-text("Sign in")');
        // Wait for overlay to disappear
        await expect(loginOverlay).toBeHidden();
    });

    test.afterEach(async ({ page }) => {
        // Collect coverage from the page context
        const coverage = await page.evaluate(() => window.__coverage__);
        if (coverage) {
            await fs.writeFile(
                path.join('.nyc_output', `coverage-map-${Date.now()}.json`),
                JSON.stringify(coverage)
            );
        }
    });

    test('should load the map container', async ({ page }) => {
        await expect(page.locator('#map')).toBeVisible();
        // Wait for OpenLayers to initialize (canvas element presence is a good indicator)
        await expect(page.locator('#map canvas')).toBeVisible();
    });

    test('should hide default zoom controls', async ({ page }) => {
        await expect(page.locator('.ol-zoom-in')).toHaveCount(0);
        await expect(page.locator('.ol-zoom-out')).toHaveCount(0);
    });

    test('should zoom in and out', async ({ page }) => {
        const initialZoom = await page.evaluate(() => {
            return window.__INTELMAP_APP_STATE__.map.getView().getZoom();
        });

        const viewport = page.locator('#map .ol-viewport');
        await viewport.hover();
        await page.mouse.wheel(0, -600);
        await page.waitForTimeout(400);

        const zoomedIn = await page.evaluate(() => {
            return window.__INTELMAP_APP_STATE__.map.getView().getZoom();
        });
        expect(zoomedIn).toBeGreaterThan(initialZoom);

        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(400);

        const zoomedOut = await page.evaluate(() => {
            return window.__INTELMAP_APP_STATE__.map.getView().getZoom();
        });
        expect(zoomedOut).toBeLessThanOrEqual(zoomedIn);
    });

    test('should drag-zoom with middle mouse button', async ({ page }) => {
        await page.waitForFunction(() => {
            return Boolean(window.__INTELMAP_APP_STATE__?.map);
        });

        const initialZoom = await page.evaluate(() => {
            return window.__INTELMAP_APP_STATE__.map.getView().getZoom();
        });

        const viewport = page.locator('#map .ol-viewport');
        const box = await viewport.boundingBox();
        expect(box).not.toBeNull();

        const startX = box.x + box.width * 0.25;
        const startY = box.y + box.height * 0.25;
        const endX = box.x + box.width * 0.75;
        const endY = box.y + box.height * 0.75;

        await page.mouse.move(startX, startY);
        await page.mouse.down({ button: 'middle' });
        await page.mouse.move(endX, endY);
        await page.mouse.up({ button: 'middle' });
        await page.waitForTimeout(500);

        const zoomedIn = await page.evaluate(() => {
            return window.__INTELMAP_APP_STATE__.map.getView().getZoom();
        });

        expect(zoomedIn).toBeGreaterThan(initialZoom);
    });
});
