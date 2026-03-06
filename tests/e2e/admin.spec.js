import { test, expect } from '@playwright/test';

async function signIn(page) {
  await page.goto('/');

  const loginOverlay = page.locator('text=IntelMap — Sign in');
  await expect(loginOverlay).toBeVisible({ timeout: 10000 });
  await page.fill('input[placeholder="Username"]', 'admin');
  await page.fill('input[placeholder="Password"]', 'admin');
  await page.click('button:has-text("Sign in")');
  await expect(loginOverlay).toBeHidden();
}

test.describe('Admin', () => {
  test('rejects unauthenticated access to admin stats', async ({ page }) => {
    const response = await page.request.get('/api/admin/stats');
    expect(response.status()).toBe(401);
  });

  test('shows admin link and opens admin modal', async ({ page }) => {
    await signIn(page);

    const adminToggle = page.locator('#admin-toggle');
    await expect(adminToggle).toBeVisible();
    await adminToggle.click();

    const modal = page.locator('#admin-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Server Statistics');
    await expect(modal).toContainText('Tile cache size');
    await expect(modal).toContainText('AIS data size');
  });

  test('returns admin stats from API for admin user', async ({ page }) => {
    await signIn(page);

    const response = await page.request.get('/api/admin/stats');
    expect(response.ok()).toBeTruthy();

    const payload = await response.json();
    expect(payload).toHaveProperty('tileCache');
    expect(payload).toHaveProperty('aisData');
    expect(payload.aisData).toHaveProperty('totalBytes');
  });
});
