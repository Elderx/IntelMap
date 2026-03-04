import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:4176';

function createMetadataMessage(overrides = {}) {
  return {
    timestamp: Date.now(),
    destination: 'UST LUGA',
    name: 'ARUNA CIHAN',
    draught: 68,
    eta: 733376,
    posType: 15,
    refA: 160,
    refB: 33,
    refC: 20,
    refD: 12,
    callSign: 'V7WW7',
    imo: 9543756,
    type: 70,
    ...overrides
  };
}

function createLocationMessage(overrides = {}) {
  return {
    time: Math.floor(Date.now() / 1000),
    sog: 10.7,
    cog: 326.6,
    navStat: 0,
    rot: 0,
    posAcc: true,
    raim: false,
    heading: 325,
    lon: 24.94,
    lat: 60.19,
    ...overrides
  };
}

async function installMockAisBroker(page, options = {}) {
  await page.addInitScript(({ staleAfterMs, pruneIntervalMs }) => {
    window.__INTELMAP_AIS_TEST_CONFIG__ = {
      staleAfterMs,
      pruneIntervalMs
    };

    window.__INTELMAP_AIS_TEST_SESSIONS__ = [];
    window.__INTELMAP_AIS_MQTT_FACTORY__ = (handlers) => {
      const session = {
        subscriptions: [],
        ended: false,
        emitMetadata(mmsi, payload) {
          if (!this.ended) {
            handlers.onMetadata({
              mmsi: String(mmsi),
              topic: `vessels-v2/${mmsi}/metadata`,
              payload
            });
          }
        },
        emitLocation(mmsi, payload) {
          if (!this.ended) {
            handlers.onLocation({
              mmsi: String(mmsi),
              topic: `vessels-v2/${mmsi}/location`,
              payload
            });
          }
        },
        fail(message) {
          if (!this.ended && handlers.onError) {
            handlers.onError(new Error(message));
          }
        },
        close() {
          if (!this.ended) {
            this.ended = true;
            if (handlers.onClose) {
              handlers.onClose();
            }
          }
        }
      };

      window.__INTELMAP_AIS_TEST_SESSIONS__.push(session);
      queueMicrotask(() => {
        if (handlers.onConnect) {
          handlers.onConnect();
        }
      });

      return {
        subscribe: async (topic) => {
          session.subscriptions.push(topic);
          return [{ topic, qos: 0 }];
        },
        disconnect: async () => {
          session.close();
        }
      };
    };
  }, {
    staleAfterMs: options.staleAfterMs ?? 30 * 60 * 1000,
    pruneIntervalMs: options.pruneIntervalMs ?? 60 * 1000
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
  await page.waitForFunction(() => document.querySelectorAll('#layers-dropdown .header-accordion-item').length > 0);
}

async function openLayersAccordion(page, title) {
  const layersDropdown = page.locator('#layers-dropdown');
  if (!(await layersDropdown.isVisible())) {
    await page.click('#layers-toggle');
    await expect(layersDropdown).toBeVisible();
  }

  const item = layersDropdown.locator('.header-accordion-item').filter({ hasText: title }).first();
  const content = item.locator('.header-accordion-content');

  if (!(await content.isVisible())) {
    await item.locator('.header-accordion-header').click();
    await expect(content).toBeVisible();
  }
}

async function emitMetadata(page, mmsi, payload) {
  await page.waitForFunction(() => {
    return Array.isArray(window.__INTELMAP_AIS_TEST_SESSIONS__) && window.__INTELMAP_AIS_TEST_SESSIONS__.length > 0;
  });

  await page.evaluate(({ vesselMmsi, metadata }) => {
    const sessions = window.__INTELMAP_AIS_TEST_SESSIONS__;
    const session = sessions[sessions.length - 1];
    session.emitMetadata(vesselMmsi, metadata);
  }, {
    vesselMmsi: mmsi,
    metadata: payload
  });
}

async function emitLocation(page, mmsi, payload) {
  await page.waitForFunction(() => {
    return Array.isArray(window.__INTELMAP_AIS_TEST_SESSIONS__) && window.__INTELMAP_AIS_TEST_SESSIONS__.length > 0;
  });

  await page.evaluate(({ vesselMmsi, location }) => {
    const sessions = window.__INTELMAP_AIS_TEST_SESSIONS__;
    const session = sessions[sessions.length - 1];
    session.emitLocation(vesselMmsi, location);
  }, {
    vesselMmsi: mmsi,
    location: payload
  });
}

async function clickRenderedFeature(page, mapKey = 'main', index = 0) {
  await page.waitForFunction(({ featureIndex }) => {
    const state = window.__INTELMAP_APP_STATE__;
    return Array.isArray(state?.aisFeatures) && Boolean(state.aisFeatures[featureIndex]);
  }, { featureIndex: index });

  await page.evaluate(({ currentMapKey, featureIndex }) => {
    const state = window.__INTELMAP_APP_STATE__;
    const map = currentMapKey === 'main'
      ? state.map
      : currentMapKey === 'left'
        ? state.leftMap
        : state.rightMap;
    const feature = state.aisFeatures[featureIndex];
    const coordinate = feature.getGeometry().getCoordinates();
    const pixel = map.getPixelFromCoordinate(coordinate);
    map.dispatchEvent({
      type: 'click',
      pixel,
      coordinate,
      originalEvent: new MouseEvent('click')
    });
  }, { currentMapKey: mapKey, featureIndex: index });
}

async function enableAisOverlay(page) {
  await openLayersAccordion(page, 'Ships');
  const toggle = page.locator('#ais-enabled');
  await toggle.check();
  await expect(toggle).toBeChecked();
}

test.describe('AIS Ships Overlay', () => {
  test('toggle AIS overlay', async ({ page }) => {
    await installMockAisBroker(page);
    await signIn(page);

    await enableAisOverlay(page);
    await expect(page.locator('#ais-interval-input')).toHaveCount(0);

    const toggle = page.locator('#ais-enabled');
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
  });

  test('restore AIS from permalink', async ({ page }) => {
    await installMockAisBroker(page);
    await signIn(page, '/?ais=1');

    await openLayersAccordion(page, 'Ships');
    await expect(page.locator('#ais-enabled')).toBeChecked();
    await expect(page.locator('#ais-interval-input')).toHaveCount(0);
  });

  test('shows AIS vessel color legend', async ({ page }) => {
    await installMockAisBroker(page);
    await signIn(page);

    const legend = page.locator('.map-legend-panel');
    await expect(legend).toBeHidden();

    await enableAisOverlay(page);

    await expect(legend).toBeVisible();
    await expect(legend).toContainText('Ships (AIS)');
    await expect(legend).toContainText('Passenger');
    await expect(legend).toContainText('Cargo');
    await expect(legend).toContainText('Tanker');
    await expect(legend).toContainText('Service');
    await expect(legend).toContainText('Unknown');
    await expect(legend.locator('.map-legend-swatch')).toHaveCount(5);

    await page.locator('#ais-enabled').uncheck();
    await expect(legend).toBeHidden();
  });

  test('renders live AIS vessels from MQTT location and metadata', async ({ page }) => {
    await installMockAisBroker(page);
    await signIn(page);
    await enableAisOverlay(page);

    await emitMetadata(page, '230145250', createMetadataMessage());
    await emitLocation(page, '230145250', createLocationMessage());

    await expect(page.locator('.active-layers-panel')).toContainText('Ships (1)', { timeout: 10000 });
  });

  test('opens an AIS popup with merged MQTT data', async ({ page }) => {
    await installMockAisBroker(page);
    await signIn(page);
    await enableAisOverlay(page);

    await emitMetadata(page, '230145250', createMetadataMessage());
    await emitLocation(page, '230145250', createLocationMessage());
    await clickRenderedFeature(page);

    const popup = page.locator('.ais-popup');
    await expect(popup).toContainText('ARUNA CIHAN', { timeout: 10000 });
    await expect(popup).toContainText('230145250', { timeout: 10000 });
    await expect(popup).toContainText('9543756', { timeout: 10000 });
    await expect(popup).toContainText('UST LUGA', { timeout: 10000 });
    await expect(popup).toContainText('V7WW7', { timeout: 10000 });
  });

  test('keeps AIS vessels working after switching to split view', async ({ page }) => {
    await installMockAisBroker(page);
    await signIn(page);
    await enableAisOverlay(page);

    await emitMetadata(page, '230145250', createMetadataMessage());
    await emitLocation(page, '230145250', createLocationMessage());

    await page.click('#split-toggle');
    await expect(page.locator('#map-left .ol-viewport')).toBeVisible({ timeout: 10000 });
    await clickRenderedFeature(page, 'left');

    await expect(page.locator('.ais-popup')).toContainText('ARUNA CIHAN', { timeout: 10000 });
  });

  test('prunes stale AIS vessels from the live cache', async ({ page }) => {
    await installMockAisBroker(page, { staleAfterMs: 5000, pruneIntervalMs: 50 });
    await signIn(page);
    await enableAisOverlay(page);

    await emitMetadata(page, '230145250', createMetadataMessage());
    await emitLocation(page, '230145250', createLocationMessage());

    await expect(page.locator('.active-layers-panel')).toContainText('Ships (1)', { timeout: 10000 });
    await expect(page.locator('.active-layers-panel')).toContainText('Ships (0)', { timeout: 10000 });
  });
});
