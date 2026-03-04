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

const TRAIN_DETAIL = [
  {
    trainNumber: 7,
    departureDate: '2026-03-04',
    commuterLineID: '',
    operatorShortCode: 'vr',
    trainType: 'IC',
    trainCategory: 'Long-distance',
    runningCurrently: true,
    cancelled: false,
    timeTableRows: [
      {
        stationShortCode: 'HKI',
        type: 'DEPARTURE',
        scheduledTime: '2026-03-04T16:54:00.000Z',
        liveEstimateTime: null,
        actualTime: '2026-03-04T16:55:00.000Z',
        commercialStop: true,
        commercialTrack: '7',
        cancelled: false
      },
      {
        stationShortCode: 'PSL',
        type: 'ARRIVAL',
        scheduledTime: '2026-03-04T16:59:00.000Z',
        liveEstimateTime: null,
        actualTime: null,
        commercialStop: true,
        commercialTrack: '4',
        cancelled: false
      }
    ]
  }
];

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

async function mockTrainDetail(page) {
  await page.route('**/trains/latest/7', async route => {
    await route.fulfill({ json: TRAIN_DETAIL });
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

async function clickRenderedFeature(page, stateKey, selector = '#map', mapKey = 'main', index = 0) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(async ({ featureStateKey, featureIndex }) => {
    const { state } = await import('/src/state/store.js');
    return Array.isArray(state[featureStateKey]) && Boolean(state[featureStateKey][featureIndex]);
  }, { featureStateKey: stateKey, featureIndex: index });

  const pixel = await page.evaluate(async ({ featureStateKey, currentMapKey, featureIndex }) => {
    const { state } = await import('/src/state/store.js');
    const map = currentMapKey === 'main'
      ? state.map
      : currentMapKey === 'left'
        ? state.leftMap
        : state.rightMap;
    const feature = state[featureStateKey][featureIndex];
    return map.getPixelFromCoordinate(feature.getGeometry().getCoordinates());
  }, { featureStateKey: stateKey, currentMapKey: mapKey, featureIndex: index });

  const viewport = page.locator(`${selector} .ol-viewport`);
  const box = await viewport.boundingBox();
  await page.mouse.click(box.x + pixel[0], box.y + pixel[1]);
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

  test('opens a live train popup with detail', async ({ page }) => {
    await mockTrainDetail(page);
    await signIn(page);

    await openLayersAccordion(page, 'Train Locations');
    await page.check('#train-locations-enabled');
    await clickRenderedFeature(page, 'trainLocationFeatures');

    const popup = page.locator('.train-location-popup');
    await expect(popup).toContainText('Train 7', { timeout: 10000 });
    await expect(popup).toContainText('IC', { timeout: 10000 });
    await expect(popup).toContainText('Long-distance', { timeout: 10000 });
    await expect(popup).toContainText('HKI', { timeout: 10000 });
    await expect(popup).toContainText('Track 7', { timeout: 10000 });
  });

  test('opens a train station popup from cached metadata', async ({ page }) => {
    await signIn(page);

    await openLayersAccordion(page, 'Train Stations');
    await page.check('#train-stations-enabled');

    await expect(page.locator('.active-layers-panel')).toContainText('Train Stations (1)', { timeout: 10000 });
    await clickRenderedFeature(page, 'trainStationFeatures');

    const popup = page.locator('.train-station-popup');
    await expect(popup).toContainText('Helsinki Central', { timeout: 10000 });
    await expect(popup).toContainText('HKI', { timeout: 10000 });
    await expect(popup).toContainText('Passenger traffic', { timeout: 10000 });
    await expect(popup).toContainText('Yes', { timeout: 10000 });
  });

  test('styles train stations by passenger traffic', async ({ page }) => {
    await signIn(page);

    const colors = await page.evaluate(async () => {
      const { getTrainStationStyle } = await import('/src/trains/trainStationsLayer.js');
      return {
        passenger: getTrainStationStyle(true).getImage().getFill().getColor(),
        nonPassenger: getTrainStationStyle(false).getImage().getFill().getColor()
      };
    });

    expect(colors.passenger).toBe('#1565c0');
    expect(colors.nonPassenger).toBe('#6d4c41');
  });
});
