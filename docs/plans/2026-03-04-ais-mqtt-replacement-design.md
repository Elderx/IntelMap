# AIS MQTT Replacement Design

## Goal

Replace the existing AISStream polling implementation with a persistent MQTT-over-WebSocket client backed by Digitraffic Marine topics, while preserving the existing IntelMap overlay UX conventions: header toggle, permalink restore, active layer summary, split-view rebuilds, and vessel popups.

## Current Context

The current AIS overlay is structurally older than the newer train and traffic camera overlays:

- `src/api/aisstream.js` opens a temporary WebSocket to `stream.aisstream.io`, subscribes to a bbox, accumulates messages for five seconds, then closes.
- `src/ais/aisManager.js` wraps that flow in a `setInterval` poll loop, posts vessel snapshots to `/api/ais/save`, and rebuilds all features from scratch each cycle.
- `src/ais/aisInteractions.js` is installed eagerly from `src/map/init.js`, rather than being tied to the overlay lifecycle like newer overlays.
- The backend persists vessel history in `server/routes/ais.js` and the `vessel_positions` table, but no active frontend path consumes that history.

That shape does not fit the new source. The Digitraffic broker is a long-lived MQTT stream, not a periodic pull API.

## Approaches Considered

### 1. Frontend MQTT client directly to Digitraffic broker

Use a browser MQTT client over `wss://meri.digitraffic.fi:443/mqtt`, subscribe to `vessels-v2/+/location` and `vessels-v2/+/metadata`, merge messages by MMSI, and render the current in-memory vessel set to OpenLayers.

Pros:

- Matches the existing train/aircraft client-side overlay pattern.
- Avoids a new backend relay service.
- Keeps the live overlay responsive without artificial refresh intervals.

Cons:

- Requires a browser MQTT dependency.
- Tests need a controllable MQTT connector seam instead of simple HTTP route mocks.

### 2. Backend MQTT bridge with browser SSE/WebSocket

Have the server connect to Digitraffic, normalize vessel state, and publish a simpler stream to the browser.

Pros:

- Centralizes broker logic and testability.
- Can hide MQTT-specific details from the browser.

Cons:

- Adds a new server-side streaming service and lifecycle.
- Diverges from the repo’s recent overlay implementations.
- More moving parts than needed for the current UI.

### 3. Keep periodic frontend refresh by proxying MQTT snapshots

Create a server endpoint that periodically snapshots the MQTT stream and let the browser poll that endpoint.

Pros:

- Similar mental model to the old implementation.

Cons:

- Throws away the broker’s streaming behavior.
- Reintroduces stale data and timer complexity.
- Worst fit for the new provider.

## Chosen Design

Approach 1: direct browser MQTT client.

This is the smallest change that actually fits the new data source and remains consistent with the train, aircraft, and traffic camera overlay lifecycles.

## Architecture

### Transport

Add a new browser API module, `src/api/aisMqtt.js`, backed by `mqtt.js`.

Responsibilities:

- create a unique client id using an IntelMap application name plus `crypto.randomUUID()`
- connect to `wss://meri.digitraffic.fi:443/mqtt`
- subscribe to `vessels-v2/+/location` and `vessels-v2/+/metadata`
- parse MQTT topics to extract the MMSI segment
- parse JSON payloads and emit normalized location or metadata updates
- expose connection lifecycle callbacks for connected, error, reconnect, and close states

The old `src/api/aisstream.js` will be removed.

### State Model

Replace interval-oriented AIS state with stream-oriented AIS state in `src/state/store.js`.

New AIS state should track:

- `aisClient`: active MQTT client instance or `null`
- `aisConnected`: whether the broker session is currently up
- `aisReconnectTimer` or equivalent connection bookkeeping if needed
- `aisVesselIndex`: `Map`-like in-memory store keyed by MMSI
- `aisFeatures`: rendered feature array for active maps
- `aisLastMessageAt`: timestamp of latest received MQTT message
- `aisLastPruneAt`: timestamp of the latest stale-vessel cleanup
- `aisError`: current transport/parse error state

The old refresh interval state and cooldown logic will be removed.

### Vessel Cache and Pruning

Maintain a merged vessel record per MMSI:

- metadata messages populate identity and vessel characteristics
- location messages populate dynamic navigation state and coordinates

Each record should keep:

- `mmsi`
- `location`
- `metadata`
- `lastLocationTime`
- `lastMetadataTime`
- `lastSeenAt`

Because the broker is append-only from the client’s perspective, we need stale-vessel pruning. The manager will drop vessels whose latest location timestamp is older than a configured TTL. The TTL should be conservative enough to tolerate gaps but short enough to avoid showing dead tracks indefinitely. A 30-minute location TTL and a periodic prune loop are sufficient for the current UI.

### Overlay Manager

Refactor `src/ais/aisManager.js` into the same shape used by trains and traffic cameras:

- `startAisUpdates()`: create layers, connect MQTT client, start stale-data pruning
- `stopAisUpdates()`: disconnect client, clear timers, remove layers, clear popups, clear vessel cache
- `rebuildAisLayers()`: recreate layers on split/single map transitions without reconnecting

Feature rendering should update incrementally:

- on each valid location/metadata message, merge into the vessel cache
- convert the current valid vessel set to OpenLayers features
- update active layers panel count
- repopulate layers for `main`, `left`, and `right`

### Styling

Keep AIS styling familiar but modernize it:

- retain vessel-type-based colors
- rotate icons by heading or COG
- use merged metadata codes to derive readable ship categories when possible
- optionally show a small speed label only when navigation data is present

### Interactions

Replace the old eager `setupAisInteractions` model with explicit overlay-bound click handlers, like trains and traffic cameras.

Behavior:

- click a vessel to open a popup with merged location + metadata
- popup should show name, MMSI, IMO, call sign, destination, ship type, speed, heading/course, navigation status, draught, and ETA when available
- split view should maintain separate popup overlays per map and rebuild cleanly

Hover previews are not required for the replacement. Click-only behavior is simpler and matches the newer overlays better.

### UI

The AIS accordion stays as a separate overlay toggle, but the refresh interval control is removed because the broker is continuous.

The active layer entry remains `Ships (...)`, but now reflects the live cached vessel count and any transport error state.

Permalink support remains `ais=1`.

### Backend

The browser will no longer post `/api/ais/save`, and the frontend no longer reads `/api/ais/history`. The old persistence path can therefore be removed:

- delete `server/routes/ais.js`
- remove the AIS history/save routes from `server/index.js`
- remove `vessel_positions` table/index initialization from `server/index.js`

This keeps the replacement honest instead of leaving unused server code around.

### Error Handling

Error handling should be stream-oriented:

- connection errors set `state.aisError`
- reconnect attempts do not clear existing vessel features immediately
- successful reconnect clears transport error state
- malformed messages are ignored with debug logging instead of tearing down the client

The overlay should continue showing the latest known good vessel set during short transport interruptions.

## Testing Strategy

Use a failing-test-first approach.

Coverage should include:

- toggling the AIS overlay with the new MQTT-backed lifecycle
- permalink restore for `ais=1`
- live feature rendering from mocked MQTT location + metadata messages
- popup content based on merged location + metadata
- split-view rebuilds without losing AIS features
- stale-vessel pruning behavior
- active layers summary count/error behavior

Because MQTT is not route-mockable like REST, tests need an injectable connector seam for the browser bundle. The production code should own the seam; tests should swap in a fake client and drive messages through it.

## Recommended Execution Notes

- Implement against the new `ais-mqtt` worktree off `origin/main`
- Keep the train and traffic camera architecture patterns wherever possible
- Avoid introducing a backend relay service unless the direct broker connection proves impossible
