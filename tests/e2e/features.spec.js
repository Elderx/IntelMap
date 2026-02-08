
import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';

test.describe('Feature Interaction', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            window.addEventListener('beforeunload', () => {
                window.collectCoverage && window.collectCoverage();
            });
        });

        await page.goto('/');

        // Handle Login
        const loginOverlay = page.locator('text=IntelMap — Sign in');
        await expect(loginOverlay).toBeVisible({ timeout: 10000 });

        await page.fill('input[placeholder="Username"]', 'admin');
        await page.fill('input[placeholder="Password"]', 'admin');
        await page.click('button:has-text("Sign in")');
        await expect(loginOverlay).toBeHidden();
    });

    test.afterEach(async ({ page }) => {
        const coverage = await page.evaluate(() => window.__coverage__);
        if (coverage) {
            await fs.writeFile(
                path.join('.nyc_output', `coverage-features-${Date.now()}.json`),
                JSON.stringify(coverage)
            );
        }
    });

    test('should verify map presence and basic interaction capability', async ({ page }) => {
        const map = page.locator('#map');
        await expect(map).toBeVisible();

        // Simulate a click on the map
        await map.click({ position: { x: 300, y: 300 } });

        // Verify split toggle exists
        await expect(page.locator('#split-toggle')).toBeVisible();
    });
});
