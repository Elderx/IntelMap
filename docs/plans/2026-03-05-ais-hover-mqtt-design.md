# AIS Hover Popup Parity (MQTT) Design

**Date:** 2026-03-05
**Branch:** `ais-hover-mqtt` (from `main`)
**Status:** Approved

## Goal

Show the same AIS vessel detail popup information on mouse hover that is currently shown on vessel click, while preserving existing click-to-open behavior.

## Confirmed Behavior

- Hovering over a vessel shows the same popup content currently used for click.
- Hover popup is non-persistent and hides when pointer leaves vessel.
- Click popup behavior remains as-is (persistent until replaced/closed by existing click flow).
- Implementation targets the current MQTT AIS architecture on `main`.

## Current Main-Branch Context

- AIS data source is MQTT (`src/api/aisMqtt.js`) and merged in `src/ais/aisManager.js`.
- AIS interactions currently support click popup only (`src/ais/aisInteractions.js`).
- Split/single map rebuild path re-calls `setupAisClickHandlers()` and cleanup functions from `main.js`.

## Architecture

### Shared popup content

- Reuse one popup content builder for both hover and click paths.
- Keep field set identical for hover and click so behavior cannot drift.

### Overlay model

- Keep existing click overlay state per map key (`main/left/right`).
- Add a dedicated hover overlay state per map key.
- Add pointermove listener per map key.

### Interaction flow

- `pointermove`
  - detect nearest AIS vessel at current pixel (using existing hit + distance fallback)
  - if found, render shared popup content in hover overlay at vessel coordinate
  - if none found, hide hover overlay
- `click`
  - retain existing behavior and content using same shared popup builder

### Cleanup and rebuild safety

- `cleanupAisInteractions()` removes click and pointermove listeners and all overlays.
- Existing split/single rebuild hooks keep working without additional lifecycle plumbing.

## Testing Strategy

Add an AIS e2e test in `tests/e2e/ais.spec.js`:

1. install existing mock MQTT broker,
2. sign in and enable AIS,
3. emit metadata and location for one vessel,
4. dispatch pointermove on rendered vessel pixel,
5. assert hover popup shows key fields already validated by click popup tests,
6. dispatch pointermove away and assert hover popup hides.

## Scope

In scope:
- `src/ais/aisInteractions.js`
- `tests/e2e/ais.spec.js`

Out of scope:
- MQTT transport or merge logic (`src/ais/aisManager.js`, `src/api/aisMqtt.js`)
- AIS layer styling or legend semantics
- broader map interaction refactors
