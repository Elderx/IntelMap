
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
        const loginOverlay = page.locator('text=MML Map — Sign in');
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

    test('should have zoom controls', async ({ page }) => {
        await expect(page.locator('.ol-zoom-in')).toBeVisible();
        await expect(page.locator('.ol-zoom-out')).toBeVisible();
    });

    test('should zoom in and out', async ({ page }) => {
        await page.click('.ol-zoom-in');
        await page.waitForTimeout(500);
        await page.click('.ol-zoom-out');
    });
});
