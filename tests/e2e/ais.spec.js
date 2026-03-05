import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:8080';

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
  await page.addInitScript(({ staleAfterMs, pruneIntervalMs, persistenceFlushIntervalMs, persistenceBatchSize, trackRangeAutoRefreshMs }) => {
    window.__INTELMAP_AIS_TEST_CONFIG__ = {
      staleAfterMs,
      pruneIntervalMs,
      persistenceFlushIntervalMs,
      persistenceBatchSize,
      trackRangeAutoRefreshMs
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
    pruneIntervalMs: options.pruneIntervalMs ?? 60 * 1000,
    persistenceFlushIntervalMs: options.persistenceFlushIntervalMs ?? 100,
    persistenceBatchSize: options.persistenceBatchSize ?? 2,
    trackRangeAutoRefreshMs: options.trackRangeAutoRefreshMs ?? 60 * 1000
  });
}

async function installAisApiMocks(page, options = {}) {
  const settingsPatchBodies = [];
  const aisBatchBodies = [];
  const aisTrackRequests = [];

  const settings = {
    aisPersistenceEnabled: options.aisPersistenceEnabled ?? false
  };

  const tracksResponse = options.tracksResponse || {
    tracks: []
  };
  const snapshotResponse = options.snapshotResponse || {
    vessels: [],
    range: {
      minutes: 60
    }
  };

  const latestLocations = options.latestLocations || {};

  await page.route('**/api/settings', async (route) => {
    const request = route.request();
    const method = request.method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(settings)
      });
      return;
    }

    if (method === 'PATCH') {
      const body = request.postDataJSON();
      settingsPatchBodies.push(body);
      if (typeof body.aisPersistenceEnabled === 'boolean') {
        settings.aisPersistenceEnabled = body.aisPersistenceEnabled;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(settings)
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/ais/history/batch', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }

    const body = request.postDataJSON();
    aisBatchBodies.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        insertedLocations: Array.isArray(body.locations) ? body.locations.length : 0,
        insertedMetadata: Array.isArray(body.metadata) ? body.metadata.length : 0
      })
    });
  });

  await page.route('**/api/ais/tracks**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      await route.continue();
      return;
    }
    const url = new URL(request.url());
    const rawMmsis = url.searchParams.get('mmsis') || '';
    const mmsis = rawMmsis
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .sort();
    aisTrackRequests.push({
      mmsis,
      start: url.searchParams.get('start'),
      end: url.searchParams.get('end')
    });

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tracksResponse)
    });
  });

  await page.route('**/api/ais/snapshot**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(snapshotResponse)
    });
  });

  await page.route('**/api/ais/latest-location**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const mmsi = url.searchParams.get('mmsi');
    const payload = mmsi ? latestLocations[mmsi] : null;

    if (payload) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload)
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'not_found' })
    });
  });

  return { settingsPatchBodies, aisBatchBodies, aisTrackRequests };
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

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await content.isVisible()) {
      break;
    }
    await item.locator('.header-accordion-header').click();
    await page.waitForTimeout(100);
  }

  await expect(content).toBeVisible();
  return content;
}

async function getAisAccordionContent(page) {
  return await openLayersAccordion(page, 'Ships');
}

async function setAisInputValue(page, selector, value) {
  await getAisAccordionContent(page);
  await page.evaluate(({ cssSelector, nextValue }) => {
    const sections = Array.from(document.querySelectorAll('#layers-dropdown .header-accordion-item'));
    const shipsSection = sections.find((node) => node.textContent?.includes('🚢 Ships'));
    const input = shipsSection?.querySelector(cssSelector);
    if (!input) {
      throw new Error(`AIS input not found: ${cssSelector}`);
    }
    input.value = nextValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { cssSelector: selector, nextValue: value });
}

async function clickAisButton(page, selector) {
  const content = await getAisAccordionContent(page);
  const button = content.locator(selector).first();
  await button.click({ force: true });
  return button;
}

async function setAisToggle(page, checked) {
  await getAisAccordionContent(page);
  await page.evaluate(({ nextChecked }) => {
    const toggles = Array.from(document.querySelectorAll('#ais-enabled'));
    const target = toggles.find((node) => node.offsetParent !== null) || toggles[0];
    if (!target) {
      throw new Error('AIS toggle not found');
    }
    target.checked = nextChecked;
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }, { nextChecked: checked });

  await expect.poll(async () => {
    return await page.evaluate(() => Boolean(window.__INTELMAP_APP_STATE__?.aisEnabled));
  }).toBe(checked);
}

async function setAisShowTracksToggle(page, checked) {
  await getAisAccordionContent(page);
  await page.evaluate(({ nextChecked }) => {
    const toggles = Array.from(document.querySelectorAll('#ais-show-tracks-toggle'));
    const target = toggles.find((node) => node.offsetParent !== null) || toggles[0];
    if (!target) {
      throw new Error('AIS Show Tracks toggle not found');
    }
    target.checked = nextChecked;
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }, { nextChecked: checked });

  await expect.poll(async () => {
    return await page.evaluate(() => Boolean(window.__INTELMAP_APP_STATE__?.aisTrackAutoRenderEnabled));
  }).toBe(checked);
}

async function setAisShowOnlySelectedToggle(page, checked) {
  await getAisAccordionContent(page);
  await page.evaluate(({ nextChecked }) => {
    const toggles = Array.from(document.querySelectorAll('#ais-show-only-selected-toggle'));
    const target = toggles.find((node) => node.offsetParent !== null) || toggles[0];
    if (!target) {
      throw new Error('AIS Show only selected toggle not found');
    }
    target.checked = nextChecked;
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }, { nextChecked: checked });

  await expect.poll(async () => {
    return await page.evaluate(() => Boolean(window.__INTELMAP_APP_STATE__?.aisShowOnlySelected));
  }).toBe(checked);
}

async function openSettingsMenu(page) {
  const settingsDropdown = page.locator('#settings-dropdown');
  if (!(await settingsDropdown.isVisible())) {
    const toggle = page.locator('#settings-toggle');
    await expect(toggle).toHaveCount(1);
    await toggle.click({ force: true });
    await expect(settingsDropdown).toBeVisible();
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

async function hoverRenderedFeature(page, mapKey = 'main', index = 0) {
  await page.waitForFunction(({ featureIndex }) => {
    const state = window.__INTELMAP_APP_STATE__;
    return Array.isArray(state?.aisFeatures) && Boolean(state.aisFeatures[featureIndex]);
  }, { featureIndex: index });

  const pixel = await page.evaluate(({ currentMapKey, featureIndex }) => {
    const state = window.__INTELMAP_APP_STATE__;
    const map = currentMapKey === 'main'
      ? state.map
      : currentMapKey === 'left'
        ? state.leftMap
        : state.rightMap;
    const feature = state.aisFeatures[featureIndex];
    const coordinate = feature.getGeometry().getCoordinates();
    return map.getPixelFromCoordinate(coordinate);
  }, { currentMapKey: mapKey, featureIndex: index });

  const viewportSelector = mapKey === 'main'
    ? '#map .ol-viewport'
    : mapKey === 'left'
      ? '#map-left .ol-viewport'
      : '#map-right .ol-viewport';
  const viewport = page.locator(viewportSelector);
  const box = await viewport.boundingBox();
  await page.mouse.move(box.x + pixel[0], box.y + pixel[1]);
}

async function movePointerAway(page, mapKey = 'main') {
  const viewportSelector = mapKey === 'main'
    ? '#map .ol-viewport'
    : mapKey === 'left'
      ? '#map-left .ol-viewport'
      : '#map-right .ol-viewport';
  const viewport = page.locator(viewportSelector);
  const box = await viewport.boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5);
}

async function expandLegendPanel(page) {
  const legend = page.locator('.map-legend-panel');
  await expect(legend).toBeVisible();
  const legendTitle = legend.locator('.map-legend-panel-title');
  if (await legend.evaluate((node) => node.classList.contains('is-collapsed'))) {
    await legendTitle.click();
    await expect(legend).not.toHaveClass(/is-collapsed/);
  }
  return legend;
}

async function setLegendTypeChecked(page, labelText, checked) {
  await page.evaluate(({ label, nextChecked }) => {
    const rows = Array.from(document.querySelectorAll('.map-legend-section[data-legend-id="ais"] .map-legend-row'));
    const row = rows.find((node) => node.textContent?.includes(label));
    if (!row) {
      throw new Error(`Legend row not found: ${label}`);
    }
    const checkbox = row.querySelector('.map-legend-checkbox');
    if (!checkbox) {
      throw new Error(`Legend checkbox not found for: ${label}`);
    }
    if (checkbox.checked === nextChecked) {
      return;
    }
    checkbox.checked = nextChecked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  }, { label: labelText, nextChecked: checked });
}

async function expectLegendCheckboxState(page, labelText, checked) {
  await expect.poll(async () => {
    return await page.evaluate(({ label }) => {
      const rows = Array.from(document.querySelectorAll('.map-legend-section[data-legend-id="ais"] .map-legend-row'));
      const row = rows.find((node) => node.textContent?.includes(label));
      const checkbox = row?.querySelector('.map-legend-checkbox');
      return Boolean(checkbox?.checked);
    }, { label: labelText });
  }).toBe(checked);
}

async function enableAisOverlay(page) {
  await setAisToggle(page, true);
}

test.describe('AIS Ships Overlay', () => {
  test.describe.configure({ mode: 'serial' });

  test('toggle AIS overlay', async ({ page }) => {
    await installMockAisBroker(page);
    await installAisApiMocks(page);
    await signIn(page);

    await enableAisOverlay(page);
    await expect(page.locator('#ais-interval-input')).toHaveCount(0);
    await setAisToggle(page, false);
  });

  test('restore AIS from permalink', async ({ page }) => {
    await installMockAisBroker(page);
    await installAisApiMocks(page);
    await signIn(page, '/?ais=1');

    await openLayersAccordion(page, 'Ships');
    await expect.poll(async () => {
      return await page.evaluate(() => Boolean(window.__INTELMAP_APP_STATE__?.aisEnabled));
    }).toBe(true);
    await expect(page.locator('#ais-interval-input')).toHaveCount(0);
  });

  test('shows AIS vessel color legend', async ({ page }) => {
    await installMockAisBroker(page);
    await installAisApiMocks(page);
    await signIn(page);

    const legend = page.locator('.map-legend-panel');
    await expect(legend).toBeHidden();

    await enableAisOverlay(page);

    await expect(legend).toBeVisible();
    await expect(legend).toHaveClass(/is-collapsed/);

    const legendTitle = legend.locator('.map-legend-panel-title');
    await legendTitle.click();
    await expect(legend).not.toHaveClass(/is-collapsed/);

    await expect(legend).toContainText('Ships (AIS)');
    await expect(legend).toContainText('Selected types: none (showing all)');
    await expect(legend).toContainText('Show all');
    await expect(legend).toContainText('Show none');
    await expectLegendCheckboxState(page, 'Show all', true);
    await expectLegendCheckboxState(page, 'Show none', false);
    await expectLegendCheckboxState(page, 'Cargo (70-79)', false);
    await expect(legend).toContainText('Wing in Ground (20-29)');
    await expect(legend).toContainText('Fishing (30)');
    await expect(legend).toContainText('Towing (31-32)');
    await expect(legend).toContainText('Military (35)');
    await expect(legend).toContainText('Search and Rescue (51)');
    await expect(legend).toContainText('Anti-pollution (54)');
    await expect(legend).toContainText('Law Enforcement (55)');
    await expect(legend).toContainText('Medical Transport (58)');
    await expect(legend).toContainText('Noncombatant (59)');
    await expect(legend).toContainText('Pilot / Tug / Port Tender (50,52-53,56-57)');
    await expect(legend).toContainText('High Speed Craft (40-49)');
    await expect(legend).toContainText('Passenger (60-69)');
    await expect(legend).toContainText('Cargo (70-79)');
    await expect(legend).toContainText('Tanker (80-89)');
    await expect(legend).toContainText('Other Type (90-99)');
    await expect(legend).toContainText('Not available / Reserved (0-19)');
    await expect(legend.locator('.map-legend-swatch')).toHaveCount(18);

    await legendTitle.click();
    await expect(legend).toHaveClass(/is-collapsed/);

    await setAisToggle(page, false);
    await expect(legend).toBeHidden();
  });

  test('filters visible AIS vessels by selected legend types using show all/show none controls', async ({ page }) => {
    await installMockAisBroker(page);
    await installAisApiMocks(page);
    await signIn(page);
    await enableAisOverlay(page);

    await emitMetadata(page, '230145250', createMetadataMessage({ name: 'CARGO ONE', type: 70 }));
    await emitLocation(page, '230145250', createLocationMessage({ lon: 24.94, lat: 60.19 }));
    await emitMetadata(page, '230145251', createMetadataMessage({ name: 'TANKER ONE', type: 80 }));
    await emitLocation(page, '230145251', createLocationMessage({ lon: 25.01, lat: 60.21 }));

    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisFeatures?.length || 0);
    }, { timeout: 10000 }).toBe(2);

    const legend = await expandLegendPanel(page);
    await expect(legend).toContainText('Selected types: none (showing all)');
    await expectLegendCheckboxState(page, 'Show all', true);

    await setLegendTypeChecked(page, 'Cargo (70-79)', true);
    await expect(legend).toContainText('Selected types: 1/18');
    await expectLegendCheckboxState(page, 'Show all', false);
    await expectLegendCheckboxState(page, 'Cargo (70-79)', true);
    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisFeatures?.length || 0);
    }, { timeout: 10000 }).toBe(1);

    await setLegendTypeChecked(page, 'Show none', true);
    await expect(legend).toContainText('Selected types: none (showing none)');
    await expectLegendCheckboxState(page, 'Show none', true);
    await expectLegendCheckboxState(page, 'Cargo (70-79)', false);
    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisFeatures?.length || 0);
    }, { timeout: 10000 }).toBe(0);

    await setLegendTypeChecked(page, 'Tanker (80-89)', true);
    await expect(legend).toContainText('Selected types: 1/18');
    await expectLegendCheckboxState(page, 'Show none', false);
    await expectLegendCheckboxState(page, 'Tanker (80-89)', true);
    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisFeatures?.length || 0);
    }, { timeout: 10000 }).toBe(1);

    await setLegendTypeChecked(page, 'Show all', true);
    await expect(legend).toContainText('Selected types: none (showing all)');
    await expectLegendCheckboxState(page, 'Show all', true);
    await expectLegendCheckboxState(page, 'Tanker (80-89)', false);
    await expectLegendCheckboxState(page, 'Cargo (70-79)', false);
    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisFeatures?.length || 0);
    }, { timeout: 10000 }).toBe(2);

    await setLegendTypeChecked(page, 'Cargo (70-79)', false);
    await expect(legend).toContainText('Selected types: none (showing all)');
    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisFeatures?.length || 0);
    }, { timeout: 10000 }).toBe(2);
  });

  test('renders live AIS vessels from MQTT location and metadata', async ({ page }) => {
    await installMockAisBroker(page);
    await installAisApiMocks(page);
    await signIn(page);
    await enableAisOverlay(page);

    await emitMetadata(page, '230145250', createMetadataMessage());
    await emitLocation(page, '230145250', createLocationMessage());

    await expect(page.locator('.active-layers-panel')).toContainText('Ships (1)', { timeout: 10000 });
  });

  test('loads AIS vessels from 60-minute history snapshot on enable', async ({ page }) => {
    await installMockAisBroker(page);
    await installAisApiMocks(page, {
      snapshotResponse: {
        vessels: [
          {
            mmsi: '230145250',
            location: {
              observedAt: '2026-03-05T08:10:00.000Z',
              lon: 24.94,
              lat: 60.19,
              sog: 8.2,
              cog: 312,
              heading: 311,
              navStat: 0,
              rot: 0,
              posAcc: true,
              raim: false
            },
            metadata: {
              name: 'SNAPSHOT VESSEL',
              destination: 'HELSINKI',
              callSign: 'OH1234',
              imo: '9543756',
              draught: 64,
              type: 70,
              posType: 15,
              refA: 150,
              refB: 34,
              refC: 20,
              refD: 12
            }
          }
        ]
      }
    });
    await signIn(page);
    await enableAisOverlay(page);

    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisFeatures?.length || 0);
    }, { timeout: 10000 }).toBe(1);
    await expect(page.locator('.active-layers-panel')).toContainText('Ships (1)', { timeout: 10000 });

    await clickRenderedFeature(page);
    await expect(page.locator('.ais-popup')).toContainText('SNAPSHOT VESSEL', { timeout: 10000 });
  });

  test('opens an AIS popup with merged MQTT data', async ({ page }) => {
    await installMockAisBroker(page);
    await installAisApiMocks(page);
    await signIn(page);
    await enableAisOverlay(page);

    const layersDropdown = page.locator('#layers-dropdown');
    if (await layersDropdown.isVisible()) {
      await page.click('#layers-toggle');
      await expect(layersDropdown).toBeHidden();
    }

    await emitMetadata(page, '230145250', createMetadataMessage());
    await emitLocation(page, '230145250', createLocationMessage());
    await clickRenderedFeature(page);

    const popup = page.locator('.ais-popup');
    await expect(popup).toContainText('ARUNA CIHAN', { timeout: 10000 });
    await expect(popup).toContainText('230145250', { timeout: 10000 });
    await expect(popup).toContainText('9543756', { timeout: 10000 });
    await expect(popup).toContainText('UST LUGA', { timeout: 10000 });
    await expect(popup).toContainText('V7WW7', { timeout: 10000 });
    await expect(popup).toContainText('Cargo, all ships of this type', { timeout: 10000 });

    const mmsiLink = popup.locator('.ais-popup-link');
    await expect(mmsiLink).toHaveAttribute('href', 'https://www.vesselfinder.com/?mmsi=230145250');
    await expect(mmsiLink).toHaveAttribute('target', '_blank');

    const popupSearchButton = popup.locator('.ais-popup-search-btn');
    await expect(popupSearchButton).toHaveText('Search');
    await popupSearchButton.click();

    const accordionContent = await getAisAccordionContent(page);
    await expect(accordionContent.locator('#ais-mmsi-search-input')).toHaveValue('230145250');
  });

  test('shows AIS popup details on vessel hover', async ({ page }) => {
    await installMockAisBroker(page);
    await signIn(page);
    await enableAisOverlay(page);
    await page.click('#layers-toggle');

    await emitMetadata(page, '230145250', createMetadataMessage());
    await emitLocation(page, '230145250', createLocationMessage());
    await hoverRenderedFeature(page);

    const hoverPopup = page.locator('.ais-popup-hover');
    await expect(hoverPopup).toContainText('ARUNA CIHAN', { timeout: 10000 });
    await expect(hoverPopup).toContainText('230145250', { timeout: 10000 });
    await expect(hoverPopup).toContainText('9543756', { timeout: 10000 });
    await expect(hoverPopup).toContainText('UST LUGA', { timeout: 10000 });
    await expect(hoverPopup).toContainText('V7WW7', { timeout: 10000 });

    await movePointerAway(page);
    await expect(hoverPopup).toBeHidden({ timeout: 10000 });
  });

  test('keeps AIS vessels working after switching to split view', async ({ page }) => {
    await installMockAisBroker(page);
    await installAisApiMocks(page);
    await signIn(page);
    await enableAisOverlay(page);

    await emitMetadata(page, '230145250', createMetadataMessage());
    await emitLocation(page, '230145250', createLocationMessage());

    await page.click('#split-toggle');
    await expect(page.locator('#map-left .ol-viewport')).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => {
      const state = window.__INTELMAP_APP_STATE__;
      const leftLayer = state?.aisLayer?.left;
      const source = leftLayer?.getSource?.();
      return Boolean(source && source.getFeatures().length > 0);
    });
    await clickRenderedFeature(page, 'left');

    await expect(page.locator('.ais-popup')).toContainText('ARUNA CIHAN', { timeout: 10000 });
  });

  test('prunes stale AIS vessels from the live cache', async ({ page }) => {
    await installMockAisBroker(page, { staleAfterMs: 5000, pruneIntervalMs: 50 });
    await installAisApiMocks(page);
    await signIn(page);
    await enableAisOverlay(page);

    await emitMetadata(page, '230145250', createMetadataMessage());
    await emitLocation(page, '230145250', createLocationMessage());

    await expect(page.locator('.active-layers-panel')).toContainText('Ships (1)', { timeout: 10000 });
    await expect(page.locator('.active-layers-panel')).toContainText('Ships (0)', { timeout: 10000 });
  });

  test('opens settings menu and saves AIS persistence toggle', async ({ page }) => {
    await installMockAisBroker(page);
    const { settingsPatchBodies } = await installAisApiMocks(page, { aisPersistenceEnabled: false });
    await signIn(page);

    await openSettingsMenu(page);

    const toggle = page.locator('#settings-ais-persistence');
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(toggle).toBeChecked();

    await expect.poll(() => settingsPatchBodies.length, { timeout: 10000 }).toBeGreaterThan(0);
    expect(settingsPatchBodies[settingsPatchBodies.length - 1]).toMatchObject({
      aisPersistenceEnabled: true
    });
  });

  test('does not persist AIS history batches from the browser client', async ({ page }) => {
    await installMockAisBroker(page, {
      persistenceFlushIntervalMs: 50,
      persistenceBatchSize: 1
    });
    const { aisBatchBodies } = await installAisApiMocks(page, { aisPersistenceEnabled: true });
    await signIn(page);
    await enableAisOverlay(page);

    await emitMetadata(page, '230145250', createMetadataMessage());
    await emitLocation(page, '230145250', createLocationMessage());

    await page.waitForTimeout(500);
    expect(aisBatchBodies.length).toBe(0);
  });

  test('can search by MMSI and select multiple ships', async ({ page }) => {
    await installMockAisBroker(page);
    await installAisApiMocks(page, {
      latestLocations: {
        257111100: {
          mmsi: '257111100',
          lon: 25.05,
          lat: 60.22,
          observedAt: new Date().toISOString()
        }
      }
    });
    await signIn(page);
    await enableAisOverlay(page);

    await emitMetadata(page, '230145250', createMetadataMessage({ name: 'ARUNA CIHAN' }));
    await emitLocation(page, '230145250', createLocationMessage({ lon: 24.94, lat: 60.19 }));
    await emitMetadata(page, '230145251', createMetadataMessage({ name: 'BALTIC STAR', type: 80 }));
    await emitLocation(page, '230145251', createLocationMessage({ lon: 25.0, lat: 60.23, heading: 90 }));

    await setAisInputValue(page, '#ais-mmsi-search-input', '230145250');
    await clickAisButton(page, '#ais-mmsi-search-btn');

    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisSelectedMmsi?.size || 0);
    }).toBe(1);

    await clickRenderedFeature(page, 'main', 1);

    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisSelectedMmsi?.size || 0);
    }).toBe(2);
  });

  test('filters rendered vessels when Show only selected is enabled', async ({ page }) => {
    await installMockAisBroker(page);
    await installAisApiMocks(page, {
      latestLocations: {
        230145250: {
          mmsi: '230145250',
          lon: 24.94,
          lat: 60.19,
          observedAt: new Date().toISOString()
        },
        230145251: {
          mmsi: '230145251',
          lon: 25.0,
          lat: 60.23,
          observedAt: new Date().toISOString()
        }
      }
    });
    await signIn(page);
    await enableAisOverlay(page);

    await emitMetadata(page, '230145250', createMetadataMessage({ name: 'ARUNA CIHAN' }));
    await emitLocation(page, '230145250', createLocationMessage({ lon: 24.94, lat: 60.19 }));
    await emitMetadata(page, '230145251', createMetadataMessage({ name: 'BALTIC STAR', type: 80 }));
    await emitLocation(page, '230145251', createLocationMessage({ lon: 25.0, lat: 60.23, heading: 90 }));

    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisFeatures?.length || 0);
    }).toBe(2);

    await setAisShowOnlySelectedToggle(page, true);
    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisFeatures?.length || 0);
    }).toBe(0);

    await setAisInputValue(page, '#ais-mmsi-search-input', '230145250');
    await clickAisButton(page, '#ais-mmsi-search-btn');

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const state = window.__INTELMAP_APP_STATE__;
        return {
          count: state.aisFeatures?.length || 0,
          mmsis: (state.aisFeatures || []).map((feature) => String(feature.get('mmsi'))).sort()
        };
      });
    }).toEqual({
      count: 1,
      mmsis: ['230145250']
    });

    await setAisInputValue(page, '#ais-mmsi-search-input', '230145251');
    await clickAisButton(page, '#ais-mmsi-search-btn');

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const state = window.__INTELMAP_APP_STATE__;
        return {
          count: state.aisFeatures?.length || 0,
          mmsis: (state.aisFeatures || []).map((feature) => String(feature.get('mmsi'))).sort()
        };
      });
    }).toEqual({
      count: 2,
      mmsis: ['230145250', '230145251']
    });

    await setAisShowOnlySelectedToggle(page, false);
    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisFeatures?.length || 0);
    }).toBe(2);
  });

  test('toggles Show Tracks and auto-refreshes tracks on selection changes', async ({ page }) => {
    await installMockAisBroker(page);
    const { aisTrackRequests } = await installAisApiMocks(page, {
      tracksResponse: {
        tracks: [
          {
            mmsi: '230145250',
            points: [
              { lon: 24.9, lat: 60.1, timestamp: '2026-03-04T10:00:00.000Z' },
              { lon: 25.0, lat: 60.2, timestamp: '2026-03-04T10:05:00.000Z' }
            ]
          },
          {
            mmsi: '230145251',
            points: [
              { lon: 25.1, lat: 60.3, timestamp: '2026-03-04T10:00:00.000Z' },
              { lon: 25.2, lat: 60.4, timestamp: '2026-03-04T10:05:00.000Z' }
            ]
          }
        ]
      }
    });
    await signIn(page);
    await enableAisOverlay(page);

    await emitMetadata(page, '230145250', createMetadataMessage({ name: 'ARUNA CIHAN' }));
    await emitLocation(page, '230145250', createLocationMessage({ lon: 24.94, lat: 60.19 }));
    await emitMetadata(page, '230145251', createMetadataMessage({ name: 'BALTIC STAR', type: 80 }));
    await emitLocation(page, '230145251', createLocationMessage({ lon: 25.0, lat: 60.23, heading: 90 }));

    await page.evaluate(() => {
      const state = window.__INTELMAP_APP_STATE__;
      state.aisSelectedMmsi = new Set(['230145250', '230145251']);
      (state.aisFeatures || []).forEach((feature) => {
        const mmsi = String(feature.get('mmsi'));
        feature.set('selected', state.aisSelectedMmsi.has(mmsi));
        feature.changed();
      });
    });
    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisSelectedMmsi?.size || 0);
    }).toBe(2);

    await setAisInputValue(page, '#ais-track-start', '2026-03-04T10:00');
    await setAisInputValue(page, '#ais-track-end', '2026-03-04T10:10');
    const content = await getAisAccordionContent(page);
    await expect(content.locator('#ais-show-tracks-toggle')).toHaveCount(1);
    await setAisShowTracksToggle(page, true);

    const playbackBar = page.locator('#ais-playback-bar');
    await expect(playbackBar).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#ais-playback-slider')).toBeVisible({ timeout: 10000 });

    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisTrackFeatures?.length || 0);
    }).toBe(2);

    await expect.poll(() => aisTrackRequests.length, { timeout: 10000 }).toBeGreaterThanOrEqual(1);
    const selectedRange = await page.evaluate(() => {
      const state = window.__INTELMAP_APP_STATE__;
      return {
        start: state?.aisTrackRangeStart || null,
        end: state?.aisTrackRangeEnd || null
      };
    });
    expect(aisTrackRequests[aisTrackRequests.length - 1]).toMatchObject({
      mmsis: ['230145250', '230145251'],
      start: selectedRange.start,
      end: selectedRange.end
    });

    await clickRenderedFeature(page, 'main', 1);

    await expect.poll(async () => {
      return await page.evaluate(() => Array.from(window.__INTELMAP_APP_STATE__.aisSelectedMmsi || []).sort());
    }).toEqual(['230145250']);

    await expect.poll(() => aisTrackRequests.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
    expect(aisTrackRequests[aisTrackRequests.length - 1]).toMatchObject({
      mmsis: ['230145250'],
      start: selectedRange.start,
      end: selectedRange.end
    });

    await setAisShowTracksToggle(page, false);
    await expect(playbackBar).toBeHidden({ timeout: 10000 });
    await expect.poll(async () => {
      return await page.evaluate(() => window.__INTELMAP_APP_STATE__.aisTrackFeatures?.length || 0);
    }).toBe(0);
  });

  test('auto-refreshes default AIS track range time values', async ({ page }) => {
    await installMockAisBroker(page, {
      trackRangeAutoRefreshMs: 100
    });
    await installAisApiMocks(page);
    await signIn(page);
    await enableAisOverlay(page);

    const content = await getAisAccordionContent(page);
    await expect(content.locator('#ais-track-start')).toBeVisible();
    await expect(content.locator('#ais-track-end')).toBeVisible();

    await page.evaluate(() => {
      const state = window.__INTELMAP_APP_STATE__;
      const startInput = document.getElementById('ais-track-start');
      const endInput = document.getElementById('ais-track-end');
      if (!state || !startInput || !endInput) {
        throw new Error('AIS track range inputs not available');
      }

      startInput.value = '2000-01-01T00:00';
      endInput.value = '2000-01-01T00:00';
      startInput.dispatchEvent(new Event('input', { bubbles: true }));
      startInput.dispatchEvent(new Event('change', { bubbles: true }));
      endInput.dispatchEvent(new Event('input', { bubbles: true }));
      endInput.dispatchEvent(new Event('change', { bubbles: true }));

      state.aisTrackRangeFollowNow = true;
    });

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const startInput = document.getElementById('ais-track-start');
        const endInput = document.getElementById('ais-track-end');
        if (!startInput || !endInput) {
          return false;
        }

        return startInput.value !== '2000-01-01T00:00' && endInput.value !== '2000-01-01T00:00';
      });
    }, { timeout: 10000 }).toBeTruthy();
  });

  test('shows and applies AIS preset track ranges', async ({ page }) => {
    await installMockAisBroker(page);
    await installAisApiMocks(page);
    await signIn(page);
    await enableAisOverlay(page);

    const content = await getAisAccordionContent(page);
    await expect(content.locator('#ais-range-preset-15m')).toHaveText('Last 15min');
    await expect(content.locator('#ais-range-preset-1h')).toHaveText('Last 1h');
    await expect(content.locator('#ais-range-preset-6h')).toHaveText('Last 6h');
    await expect(content.locator('#ais-range-preset-12h')).toHaveText('Last 12h');
    await expect(content.locator('#ais-range-preset-24h')).toHaveText('Last 24h');

    await content.locator('#ais-range-preset-1h').click({ force: true });

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const startInput = document.getElementById('ais-track-start');
        const endInput = document.getElementById('ais-track-end');
        if (!startInput || !endInput || !startInput.value || !endInput.value) {
          return null;
        }

        const start = new Date(startInput.value).getTime();
        const end = new Date(endInput.value).getTime();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          return null;
        }

        return Math.round((end - start) / (60 * 1000));
      });
    }, { timeout: 10000 }).toBeGreaterThanOrEqual(59);

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const startInput = document.getElementById('ais-track-start');
        const endInput = document.getElementById('ais-track-end');
        if (!startInput || !endInput || !startInput.value || !endInput.value) {
          return null;
        }
        const start = new Date(startInput.value).getTime();
        const end = new Date(endInput.value).getTime();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          return null;
        }

        return Math.round((end - start) / (60 * 1000));
      });
    }, { timeout: 10000 }).toBeLessThanOrEqual(61);
  });
});
