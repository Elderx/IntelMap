# AIS MQTT Replacement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the existing AISStream polling overlay with a Digitraffic Marine MQTT-over-WebSocket implementation and remove the obsolete AIS backend persistence path.

**Architecture:** The browser owns a single MQTT client for the AIS overlay, subscribes to location and metadata topics, merges messages by MMSI into a live vessel cache, and projects the current vessel set into OpenLayers layers for single and split map modes. The old interval-based AISStream client and server-side history/save path are removed.

**Tech Stack:** Vite, OpenLayers, Playwright, `mqtt.js`, Express/Postgres backend

---

### Task 1: Document the replacement baseline

**Files:**
- Create: `docs/plans/2026-03-04-ais-mqtt-replacement-design.md`
- Create: `docs/plans/2026-03-04-ais-mqtt-replacement.md`

**Step 1: Save the validated design doc**

Write the approved replacement design and assumptions to `docs/plans/2026-03-04-ais-mqtt-replacement-design.md`.

**Step 2: Save this implementation plan**

Write the execution plan to `docs/plans/2026-03-04-ais-mqtt-replacement.md`.

**Step 3: Commit**

```bash
git add docs/plans/2026-03-04-ais-mqtt-replacement-design.md docs/plans/2026-03-04-ais-mqtt-replacement.md
git commit -m "docs: add AIS MQTT replacement plan"
```

### Task 2: Add failing AIS tests for the new stream model

**Files:**
- Modify: `tests/e2e/ais.spec.js`

**Step 1: Write the failing tests**

Replace the old interval-oriented AIS tests with tests for:

- toggle AIS overlay
- restore `ais=1` from permalink
- render vessel count from mocked MQTT location + metadata
- open popup with merged metadata/location
- rebuild in split view
- prune stale vessels

The tests should use a browser-injected fake MQTT client rather than live broker traffic.

**Step 2: Run test to verify it fails**

Run:

```bash
PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4176 npx playwright test tests/e2e/ais.spec.js --reporter=line
```

Expected: FAIL because the current AIS implementation still expects AISStream polling and interval controls.

**Step 3: Commit**

```bash
git add tests/e2e/ais.spec.js
git commit -m "test: cover AIS MQTT overlay behavior"
```

### Task 3: Add the MQTT transport layer

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/api/aisMqtt.js`
- Modify: `src/config/constants.js`

**Step 1: Write the failing test**

Extend `tests/e2e/ais.spec.js` so the overlay can inject a fake connector and emit synthetic location/metadata messages.

**Step 2: Run test to verify it fails**

Run:

```bash
PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4176 npx playwright test tests/e2e/ais.spec.js --grep "render vessel count|open popup" --reporter=line
```

Expected: FAIL because there is no MQTT transport or connector seam yet.

**Step 3: Write minimal implementation**

- add `mqtt` dependency
- create `src/api/aisMqtt.js`
- export a connector that:
  - builds the client id
  - connects to `wss://meri.digitraffic.fi:443/mqtt`
  - subscribes to `vessels-v2/+/location` and `vessels-v2/+/metadata`
  - parses topics and payloads
  - exposes a controllable connector seam for tests

**Step 4: Run test to verify it passes**

Run the same targeted AIS tests and confirm the fake connector can be installed.

**Step 5: Commit**

```bash
git add package.json package-lock.json src/api/aisMqtt.js src/config/constants.js tests/e2e/ais.spec.js
git commit -m "feat: add AIS MQTT transport client"
```

### Task 4: Refactor AIS state and manager to a live vessel cache

**Files:**
- Modify: `src/state/store.js`
- Modify: `src/ais/aisManager.js`
- Modify: `src/ais/aisLayer.js`

**Step 1: Write the failing test**

Add or expand tests to assert:

- merged metadata + location produce one rendered vessel
- stale vessels disappear after prune
- split view rebuild keeps features visible

**Step 2: Run test to verify it fails**

Run:

```bash
PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4176 npx playwright test tests/e2e/ais.spec.js --grep "render vessel count|prune stale|split view" --reporter=line
```

Expected: FAIL because the current manager still uses interval polling and scratch rebuilds.

**Step 3: Write minimal implementation**

- replace interval/cooldown AIS state with client/cache state
- refactor `src/ais/aisManager.js` to:
  - start/stop one MQTT client
  - merge location/metadata by MMSI
  - prune stale vessels on a timer
  - rebuild layers for single/split maps
- update `src/ais/aisLayer.js` to consume the normalized vessel shape

**Step 4: Run test to verify it passes**

Run the targeted AIS tests and confirm the merged vessel cache behavior.

**Step 5: Commit**

```bash
git add src/state/store.js src/ais/aisManager.js src/ais/aisLayer.js tests/e2e/ais.spec.js
git commit -m "feat: stream AIS vessels from MQTT"
```

### Task 5: Replace AIS interactions and UI wiring

**Files:**
- Modify: `src/ais/aisInteractions.js`
- Modify: `src/map/init.js`
- Modify: `src/main.js`
- Modify: `src/ui/headerLayerManager.js`
- Modify: `src/ui/activeLayers.js`
- Modify: `src/map/permalink.js`
- Modify: `src/styles/ais.css`

**Step 1: Write the failing test**

Ensure tests cover:

- click popup with merged metadata/location fields
- permalink restore
- toggle/un-toggle without interval controls

**Step 2: Run test to verify it fails**

Run:

```bash
PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4176 npx playwright test tests/e2e/ais.spec.js --grep "toggle AIS overlay|restore AIS from permalink|open popup" --reporter=line
```

Expected: FAIL because the UI still renders the old accordion interval controls and the old interaction lifecycle.

**Step 3: Write minimal implementation**

- convert AIS interactions to explicit overlay click handlers like trains/traffic cameras
- remove eager `setupAisInteractions` calls from `src/map/init.js`
- wire start/stop/cleanup/rebuild in `src/main.js` and `src/ui/headerLayerManager.js`
- keep permalink key `ais=1`
- update active layer summary count/error row
- remove the refresh interval control from the AIS accordion
- refresh AIS popup styling for merged vessel data

**Step 4: Run test to verify it passes**

Run the targeted AIS tests and confirm popup and UI lifecycle behavior.

**Step 5: Commit**

```bash
git add src/ais/aisInteractions.js src/map/init.js src/main.js src/ui/headerLayerManager.js src/ui/activeLayers.js src/map/permalink.js src/styles/ais.css tests/e2e/ais.spec.js
git commit -m "feat: wire AIS MQTT overlay UI"
```

### Task 6: Remove the obsolete backend AIS persistence path

**Files:**
- Delete: `server/routes/ais.js`
- Modify: `server/index.js`
- Modify: `src/ais/aisManager.js`

**Step 1: Write the failing test**

Add a regression expectation that no client-side AIS behavior depends on `/api/ais/save` or `/api/ais/history`.

**Step 2: Run test to verify it fails**

Run the relevant AIS/browser regression test or server startup verification.

**Step 3: Write minimal implementation**

- remove `/api/ais/save` posting from the frontend
- remove `server/routes/ais.js`
- remove server imports, routes, and `vessel_positions` schema/index creation from `server/index.js`

**Step 4: Run test to verify it passes**

Run:

```bash
npm run build
```

and a focused browser regression:

```bash
PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4176 npx playwright test tests/e2e/ais.spec.js --reporter=line
```

**Step 5: Commit**

```bash
git add src/ais/aisManager.js server/index.js
git rm server/routes/ais.js
git commit -m "refactor: remove legacy AIS persistence path"
```

### Task 7: Full verification

**Files:**
- Modify as needed from prior tasks

**Step 1: Run build**

```bash
npm run build
```

Expected: PASS

**Step 2: Run AIS suite on a fresh Vite dev server**

Start:

```bash
VITE_TILE_CACHE_URL=http://localhost:8888 npm run dev -- --host 127.0.0.1 --port 4176
```

Then run:

```bash
PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4176 npx playwright test tests/e2e/ais.spec.js --reporter=line
```

Expected: PASS

**Step 3: Run nearby regressions**

```bash
npx playwright test tests/e2e/map.spec.js tests/e2e/weather.spec.js tests/e2e/traffic-cameras.spec.js tests/e2e/train-overlays.spec.js --reporter=line
```

If the non-AIS suites require environment-specific base URLs, run the same smoke subset style used by the train work.

**Step 4: Commit final fixups**

```bash
git add .
git commit -m "test: verify AIS MQTT replacement"
```

Only if verification required additional source changes.
