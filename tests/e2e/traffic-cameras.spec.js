import { test, expect } from '@playwright/test';

const CAMERA_LOCATIONS = {
  features: [
    {
      attributes: {
        CameraId: 'C01622',
        Name_EN: 'Road 51 Inkoo',
        Name_FI: 'Tie 51 Inkoo',
        Municipality: 'Inkoo',
        RoadAddress: '51;14;422',
        CameraActive: 1,
        CollectionStatus: 'GATHERING'
      },
      geometry: {
        x: 2776308.100384243,
        y: 8442161.324849691
      }
    }
  ]
};

const CAMERA_PRESETS = {
  features: [
    {
      attributes: {
        CameraId: 'C01622',
        PresetId: 'C0162201',
        DirectionName: 'Westbound',
        ImageUrl: 'https://weathercam.digitraffic.fi/C0162201.jpg',
        PicLastModified: 1772625400000,
        PresetActive: 1,
        InCollection: 1,
        CameraResolution: '1280x720'
      }
    }
  ]
};

async function mockTrafficCameraApis(page) {
  await page.route('**/ArcGIS/rest/services/WeatherCams/FeatureServer/0/query**', async route => {
    await route.fulfill({ json: CAMERA_LOCATIONS });
  });

  await page.route('**/ArcGIS/rest/services/WeatherCams/FeatureServer/1/query**', async route => {
    await route.fulfill({ json: CAMERA_PRESETS });
  });
}

async function signIn(page) {
  await page.goto('/');

  const loginOverlay = page.locator('text=IntelMap — Sign in');
  await expect(loginOverlay).toBeVisible({ timeout: 10000 });
  await page.fill('input[placeholder="Username"]', 'admin');
  await page.fill('input[placeholder="Password"]', 'admin');
  await page.click('button:has-text("Sign in")');
  await expect(loginOverlay).toBeHidden();
  await page.waitForSelector('.ol-viewport');
}

test.describe('Traffic Cameras Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await mockTrafficCameraApis(page);
  });

  test('toggle traffic camera overlay', async ({ page }) => {
    await signIn(page);
    await page.click('#layers-toggle');

    const accordionHeader = page.locator('.header-accordion-item')
      .filter({ hasText: 'Traffic Cameras' })
      .locator('.header-accordion-header');
    await accordionHeader.click();

    const toggle = page.locator('#traffic-cameras-enabled');
    await toggle.check();
    await expect(toggle).toBeChecked();

    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
  });

  test('restore traffic camera overlay from permalink', async ({ page }) => {
    await page.goto('/?trafficCameras=1');

    const loginOverlay = page.locator('text=IntelMap — Sign in');
    await expect(loginOverlay).toBeVisible({ timeout: 10000 });
    await page.fill('input[placeholder="Username"]', 'admin');
    await page.fill('input[placeholder="Password"]', 'admin');
    await page.click('button:has-text("Sign in")');
    await expect(loginOverlay).toBeHidden();
    await page.waitForSelector('.ol-viewport');

    await page.click('#layers-toggle');
    await expect(page.locator('#traffic-cameras-enabled')).toBeChecked();
  });
});
