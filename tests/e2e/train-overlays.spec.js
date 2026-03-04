import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:4173';

const LIVE_TRAINS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [24.94, 60.19]
      },
      properties: {
        trainNumber: 7,
        departureDate: '2026-03-04',
        timestamp: '2026-03-04T17:22:17.000Z',
        speed: 139,
        accuracy: 2
      }
    }
  ]
};

const LIVE_TRAINS_REFRESHED = {
  type: 'FeatureCollection',
  features: [
    LIVE_TRAINS.features[0],
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [25.2, 60.3]
      },
      properties: {
        trainNumber: 55,
        departureDate: '2026-03-04',
        timestamp: '2026-03-04T17:32:17.000Z',
        speed: 0,
        accuracy: 3
      }
    }
  ]
};

const STATIONS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [24.94, 60.19]
      },
      properties: {
        stationName: 'Helsinki Central',
        stationShortCode: 'HKI',
        stationUICCode: 1001,
        type: 'STATION',
        countryCode: 'FI',
        passengerTraffic: true
      }
    }
  ]
};

async function mockTrainApis(page) {
  await page.route('**/train-locations.geojson/latest/**', async route => {
    await route.fulfill({ json: LIVE_TRAINS });
  });

  await page.route('**/metadata/stations.geojson**', async route => {
    await route.fulfill({ json: STATIONS });
  });
}

async function mockTrainLocationPolling(page) {
  let callCount = 0;

  await page.unroute('**/train-locations.geojson/latest/**');
  await page.route('**/train-locations.geojson/latest/**', async route => {
    callCount += 1;
    const payload = callCount === 1 ? LIVE_TRAINS : LIVE_TRAINS_REFRESHED;
    await route.fulfill({ json: payload });
  });
}

async function signIn(page, path = '/') {
  await page.goto(`${BASE_URL}${path}`);
  const loginOverlay = page.locator('text=IntelMap — Sign in');
  await expect(loginOverlay).toBeVisible({ timeout: 10000 });
  await page.fill('input[placeholder="Username"]', 'admin');
  await page.fill('input[placeholder="Password"]', 'admin');
  await page.click('button:has-text("Sign in")');
  await expect(loginOverlay).toBeHidden();
  await page.waitForSelector('.ol-viewport');
}

async function openLayersAccordion(page, title) {
  const layersDropdown = page.locator('#layers-dropdown');
  if (!(await layersDropdown.isVisible())) {
    await page.click('#layers-toggle');
  }
  const item = page
    .locator('.header-accordion-item')
    .filter({ hasText: title })
    .locator('.header-accordion-header');
  await item.click();
}

test.describe('Train Overlays', () => {
  test.beforeEach(async ({ page }) => {
    await mockTrainApis(page);
  });

  test('toggle train overlays', async ({ page }) => {
    await signIn(page);

    await openLayersAccordion(page, 'Train Locations');
    const trainLocationsToggle = page.locator('#train-locations-enabled');
    await trainLocationsToggle.check();
    await expect(trainLocationsToggle).toBeChecked();
    await trainLocationsToggle.uncheck();
    await expect(trainLocationsToggle).not.toBeChecked();

    await openLayersAccordion(page, 'Train Stations');
    const trainStationsToggle = page.locator('#train-stations-enabled');
    await trainStationsToggle.check();
    await expect(trainStationsToggle).toBeChecked();
    await trainStationsToggle.uncheck();
    await expect(trainStationsToggle).not.toBeChecked();
  });

  test('restore train overlays from permalink', async ({ page }) => {
    await signIn(page, '/?trainLocations=1&trainStations=1');
    await page.click('#layers-toggle');

    await expect(page.locator('#train-locations-enabled')).toBeChecked();
    await expect(page.locator('#train-stations-enabled')).toBeChecked();
  });

  test('polls live train locations every 10 seconds', async ({ page }) => {
    await mockTrainLocationPolling(page);
    await signIn(page);

    await openLayersAccordion(page, 'Train Locations');
    await page.check('#train-locations-enabled');

    await expect(page.locator('.active-layers-panel')).toContainText('Train Locations (1)', { timeout: 10000 });
    await expect(page.locator('.active-layers-panel')).toContainText('Train Locations (2)', { timeout: 12000 });
  });
});
