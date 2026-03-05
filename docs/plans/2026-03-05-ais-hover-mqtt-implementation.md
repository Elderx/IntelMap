# AIS MQTT Hover Popup Parity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add vessel hover popups that show the same AIS details as click popups in the current MQTT-based AIS implementation.

**Architecture:** Extend `src/ais/aisInteractions.js` with per-map hover overlays and pointermove listeners while keeping current click handlers. Reuse a shared popup content builder for both hover and click so fields stay synchronized. Keep lifecycle safety by cleaning up hover/click listeners and overlays together in the existing cleanup path.

**Tech Stack:** JavaScript (ES modules), OpenLayers overlays/events, Playwright E2E

---

### Task 1: Add Failing Hover E2E Test

**Files:**
- Modify: `tests/e2e/ais.spec.js`

**Step 1: Write the failing test**

Add a new Playwright test that:
- enables AIS with existing mock broker helpers,
- emits metadata + location for one vessel,
- dispatches a pointermove at the rendered vessel pixel,
- expects hover popup content to include AIS detail fields,
- dispatches pointermove away and expects hover popup hidden.

```javascript
test('shows AIS popup details on vessel hover', async ({ page }) => {
  await installMockAisBroker(page);
  await signIn(page);
  await enableAisOverlay(page);

  await emitMetadata(page, '230145250', createMetadataMessage());
  await emitLocation(page, '230145250', createLocationMessage());

  await page.evaluate(() => {
    const state = window.__INTELMAP_APP_STATE__;
    const map = state.map;
    const feature = state.aisFeatures[0];
    const coordinate = feature.getGeometry().getCoordinates();
    const pixel = map.getPixelFromCoordinate(coordinate);
    map.dispatchEvent({ type: 'pointermove', pixel, coordinate, dragging: false });
  });

  const popup = page.locator('.ais-popup-hover');
  await expect(popup).toContainText('ARUNA CIHAN');
  await expect(popup).toContainText('UST LUGA');

  await page.evaluate(() => {
    const state = window.__INTELMAP_APP_STATE__;
    const map = state.map;
    const pixel = [0, 0];
    const coordinate = map.getCoordinateFromPixel(pixel);
    map.dispatchEvent({ type: 'pointermove', pixel, coordinate, dragging: false });
  });

  await expect(popup).toBeHidden();
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
PLAYWRIGHT_TEST_BASE_URL=http://localhost:8080 npx playwright test tests/e2e/ais.spec.js --grep "shows AIS popup details on vessel hover"
```

Expected: FAIL because current AIS interactions only register click handlers.

**Step 3: Commit failing test**

```bash
git add tests/e2e/ais.spec.js
git commit -m "test: add failing AIS hover popup parity coverage"
```

### Task 2: Implement Hover Interaction with Shared Popup Content

**Files:**
- Modify: `src/ais/aisInteractions.js`
- Test: `tests/e2e/ais.spec.js`

**Step 1: Extract shared popup content builder**

Refactor popup markup generation to one function used by click and hover:

```javascript
function buildPopupContent(feature, mode = 'click') {
  const container = document.createElement('div');
  container.className = mode === 'hover' ? 'ais-popup ais-popup-hover' : 'ais-popup ais-popup-click';
  // existing table rows retained exactly
  return container;
}
```

**Step 2: Add per-map hover overlay/listener state**

Introduce structures similar to existing click state:

```javascript
const hoverOverlays = { main: null, left: null, right: null };
const hoverKeys = { main: null, left: null, right: null };
```

**Step 3: Register pointermove handlers in setup**

Inside `setupAisClickHandlers()`, after click handler registration, add pointermove handler that:
- finds vessel by pixel + near-pixel fallback,
- shows/updates hover overlay with shared popup content,
- hides hover overlay when no vessel found.

**Step 4: Extend cleanup**

In `cleanupAisInteractions()`, unbind `hoverKeys[mapKey]` and remove `hoverOverlays[mapKey]` alongside existing click cleanup.

**Step 5: Run targeted test to verify pass**

Run:
```bash
PLAYWRIGHT_TEST_BASE_URL=http://localhost:8080 npx playwright test tests/e2e/ais.spec.js --grep "shows AIS popup details on vessel hover"
```

Expected: PASS.

**Step 6: Commit implementation**

```bash
git add src/ais/aisInteractions.js tests/e2e/ais.spec.js
git commit -m "feat: add AIS hover popups with click parity"
```

### Task 3: Regression Verification

**Files:**
- Verify: `tests/e2e/ais.spec.js`

**Step 1: Run AIS suite**

Run:
```bash
PLAYWRIGHT_TEST_BASE_URL=http://localhost:8080 npx playwright test tests/e2e/ais.spec.js
```

Expected: AIS suite passes except any known pre-existing flaky test behavior.

**Step 2: Summarize residual risk**

Document if any pre-existing flake remains (for example toggle visibility timing), and confirm new hover test remains stable.

**Step 3: Optional docs commit (if needed)**

```bash
git add docs/plans/2026-03-05-ais-hover-mqtt-implementation.md
git commit -m "docs: add AIS MQTT hover implementation plan"
```
