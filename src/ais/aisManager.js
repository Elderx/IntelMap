import { state } from '../state/store.js';
import { AIS_OVERLAY_CONFIG, getAisOverlayRuntimeConfig } from '../config/constants.js';
import { connectToAisMqtt } from '../api/aisMqtt.js';
import { fetchAisSnapshot } from '../api/client.js';
import { createAisLayer, vesselToFeature, getAisLegendTypeKey } from './aisLayer.js';
import { clearAisSelection } from './aisSelection.js';
import { clearAisTracks } from './aisTracksManager.js';
import { removeMapLegendSection, setMapLegendSection } from '../ui/mapLegend.js';

const AIS_LEGEND_FILTER_ITEMS = [
  { key: 'wingInGround', label: 'Wing in Ground (20-29)', color: AIS_OVERLAY_CONFIG.colors.wingInGround },
  { key: 'fishing', label: 'Fishing (30)', color: AIS_OVERLAY_CONFIG.colors.fishing },
  { key: 'towing', label: 'Towing (31-32)', color: AIS_OVERLAY_CONFIG.colors.towing },
  { key: 'dredgingDiving', label: 'Dredging / Diving (33-34)', color: AIS_OVERLAY_CONFIG.colors.dredging },
  { key: 'military', label: 'Military (35)', color: AIS_OVERLAY_CONFIG.colors.military },
  { key: 'sailingPleasure', label: 'Sailing / Pleasure (36-37)', color: AIS_OVERLAY_CONFIG.colors.sailing },
  { key: 'highSpeedCraft', label: 'High Speed Craft (40-49)', color: AIS_OVERLAY_CONFIG.colors.highSpeed },
  { key: 'pilotTugPortTender', label: 'Pilot / Tug / Port Tender (50,52-53,56-57)', color: AIS_OVERLAY_CONFIG.colors.specialCraft },
  { key: 'searchRescue', label: 'Search and Rescue (51)', color: AIS_OVERLAY_CONFIG.colors.specialCraft },
  { key: 'antiPollution', label: 'Anti-pollution (54)', color: AIS_OVERLAY_CONFIG.colors.specialCraft },
  { key: 'lawEnforcement', label: 'Law Enforcement (55)', color: AIS_OVERLAY_CONFIG.colors.specialCraft },
  { key: 'medicalTransport', label: 'Medical Transport (58)', color: AIS_OVERLAY_CONFIG.colors.specialCraft },
  { key: 'noncombatant', label: 'Noncombatant (59)', color: AIS_OVERLAY_CONFIG.colors.specialCraft },
  { key: 'passenger', label: 'Passenger (60-69)', color: AIS_OVERLAY_CONFIG.colors.passenger },
  { key: 'cargo', label: 'Cargo (70-79)', color: AIS_OVERLAY_CONFIG.colors.cargo },
  { key: 'tanker', label: 'Tanker (80-89)', color: AIS_OVERLAY_CONFIG.colors.tanker },
  { key: 'otherType', label: 'Other Type (90-99)', color: AIS_OVERLAY_CONFIG.colors.other },
  { key: 'unknownReserved', label: 'Not available / Reserved (0-19)', color: AIS_OVERLAY_CONFIG.colors.unknown }
];

function ensureAisTypeFilterState() {
  if (!(state.aisVisibleTypeKeys instanceof Set)) {
    state.aisVisibleTypeKeys = new Set();
  }
  if (state.aisTypeFilterMode !== 'all' && state.aisTypeFilterMode !== 'custom') {
    state.aisTypeFilterMode = 'all';
  }
}

function getAisTypeSelectionSummary() {
  ensureAisTypeFilterState();
  const totalCount = AIS_LEGEND_FILTER_ITEMS.length;
  if (state.aisTypeFilterMode === 'all') {
    return 'Selected types: none (showing all)';
  }
  const selectedCount = state.aisVisibleTypeKeys.size;
  if (!selectedCount) {
    return 'Selected types: none (showing none)';
  }
  return `Selected types: ${selectedCount}/${totalCount}`;
}

function applyAisTypeFilterChanges() {
  enableAisLegend();
  renderAisFeatures();
}

function setAisShowAllTypes() {
  ensureAisTypeFilterState();
  state.aisTypeFilterMode = 'all';
  state.aisVisibleTypeKeys.clear();
  applyAisTypeFilterChanges();
}

function setAisShowNoTypes() {
  ensureAisTypeFilterState();
  state.aisTypeFilterMode = 'custom';
  state.aisVisibleTypeKeys.clear();
  applyAisTypeFilterChanges();
}

function setAisTypeSelected(typeKey, selected) {
  ensureAisTypeFilterState();
  if (state.aisTypeFilterMode === 'all') {
    if (!selected) {
      return;
    }
    state.aisTypeFilterMode = 'custom';
    state.aisVisibleTypeKeys.clear();
    state.aisVisibleTypeKeys.add(typeKey);
    applyAisTypeFilterChanges();
    return;
  }

  if (selected) {
    state.aisVisibleTypeKeys.add(typeKey);
  } else {
    state.aisVisibleTypeKeys.delete(typeKey);
  }

  applyAisTypeFilterChanges();
}

function updateAisLayer(mapKey, features) {
  const layer = state.aisLayer[mapKey];
  if (!layer) return;

  const source = layer.getSource();
  source.clear();
  source.addFeatures(features);
}

function refreshActiveLayersPanel() {
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });
}

function setAisError(message, type = 'mqtt') {
  state.aisError = {
    type,
    message,
    time: Date.now()
  };
  refreshActiveLayersPanel();
}

function attachLayers() {
  if (state.isSplit) {
    if (state.leftMap && !state.aisLayer.left) {
      state.aisLayer.left = createAisLayer();
      state.leftMap.addLayer(state.aisLayer.left);
    }
    if (state.rightMap && !state.aisLayer.right) {
      state.aisLayer.right = createAisLayer();
      state.rightMap.addLayer(state.aisLayer.right);
    }
    return;
  }

  if (state.map && !state.aisLayer.main) {
    state.aisLayer.main = createAisLayer();
    state.map.addLayer(state.aisLayer.main);
  }
}

function removeLayers() {
  ['main', 'left', 'right'].forEach((mapKey) => {
    const layer = state.aisLayer[mapKey];
    if (!layer) {
      return;
    }

    const map = mapKey === 'main' ? state.map : mapKey === 'left' ? state.leftMap : state.rightMap;
    if (map) {
      map.removeLayer(layer);
    }
    state.aisLayer[mapKey] = null;
  });
}

function renderAisFeatures() {
  ensureAisTypeFilterState();

  const visibleVessels = Array.from(state.aisVesselsByMmsi.values())
    .filter((vessel) => {
      if (state.aisTypeFilterMode === 'custom') {
        const typeKey = getAisLegendTypeKey(vessel?.metadata?.type);
        if (!state.aisVisibleTypeKeys.has(typeKey)) {
          return false;
        }
      }
      if (!state.aisShowOnlySelected) {
        return true;
      }
      return state.aisSelectedMmsi.has(String(vessel?.mmsi));
    });

  const features = visibleVessels
    .map(vesselToFeature)
    .filter(Boolean)
    .sort((left, right) => left.get('mmsi').localeCompare(right.get('mmsi')));

  state.aisFeatures = features;
  state.aisLastUpdate = Date.now();

  if (state.isSplit) {
    updateAisLayer('left', features);
    updateAisLayer('right', features);
  } else {
    updateAisLayer('main', features);
  }

  refreshActiveLayersPanel();
}

function mergeAisMessage(mmsi, kind, payload) {
  if (!state.aisEnabled) {
    return;
  }

  const key = String(mmsi);
  const current = state.aisVesselsByMmsi.get(key) || {
    mmsi: key,
    metadata: null,
    location: null,
    lastSeenAt: 0
  };
  const next = {
    ...current,
    lastSeenAt: Date.now()
  };

  if (kind === 'location') {
    next.location = {
      ...(current.location || {}),
      ...payload
    };
  }

  if (kind === 'metadata') {
    next.metadata = {
      ...(current.metadata || {}),
      ...payload
    };
  }

  state.aisVesselsByMmsi.set(key, next);
  state.aisError = null;
  state.aisLastMessageAt = next.lastSeenAt;
  renderAisFeatures();
}

function pruneStaleVessels() {
  if (!state.aisEnabled) {
    return;
  }

  const config = getAisOverlayRuntimeConfig();
  const cutoff = Date.now() - config.staleAfterMs;
  let removed = false;

  state.aisVesselsByMmsi.forEach((vessel, mmsi) => {
    if (vessel.lastSeenAt < cutoff) {
      state.aisVesselsByMmsi.delete(mmsi);
      removed = true;
    }
  });

  if (removed) {
    renderAisFeatures();
  }
}

function startPruneLoop() {
  if (state.aisPruneInterval) {
    clearInterval(state.aisPruneInterval);
  }

  const config = getAisOverlayRuntimeConfig();
  state.aisPruneInterval = setInterval(pruneStaleVessels, config.pruneIntervalMs);
}

async function loadAisSnapshotFromHistory() {
  const config = getAisOverlayRuntimeConfig();
  const minutes = Math.max(1, Number(config.bootstrapHistoryMinutes) || 60);
  const snapshot = await fetchAisSnapshot({ minutes });
  if (!snapshot || !Array.isArray(snapshot.vessels)) {
    return;
  }

  let changed = false;
  snapshot.vessels.forEach((vessel) => {
    const key = String(vessel?.mmsi || '').trim();
    if (!key) {
      return;
    }

    const current = state.aisVesselsByMmsi.get(key) || {
      mmsi: key,
      metadata: null,
      location: null,
      lastSeenAt: 0
    };

    const next = {
      ...current,
      lastSeenAt: Date.now()
    };

    if (vessel.location && typeof vessel.location === 'object') {
      next.location = {
        ...(current.location || {}),
        ...vessel.location
      };
    }

    if (vessel.metadata && typeof vessel.metadata === 'object') {
      next.metadata = {
        ...(current.metadata || {}),
        ...vessel.metadata
      };
    }

    state.aisVesselsByMmsi.set(key, next);
    changed = true;
  });

  if (changed) {
    renderAisFeatures();
  }
}

function enableAisLegend() {
  ensureAisTypeFilterState();
  const isShowingAll = state.aisTypeFilterMode === 'all';
  const isShowingNone = state.aisTypeFilterMode === 'custom' && state.aisVisibleTypeKeys.size === 0;

  setMapLegendSection('ais', {
    title: `Ships (AIS) • ${getAisTypeSelectionSummary()}`,
    items: [
      {
        label: 'Show all',
        selectable: true,
        selected: isShowingAll,
        onToggle: (checked) => {
          if (checked) {
            setAisShowAllTypes();
          }
        }
      },
      {
        label: 'Show none',
        selectable: true,
        selected: isShowingNone,
        onToggle: (checked) => {
          if (checked) {
            setAisShowNoTypes();
          }
        }
      },
      ...AIS_LEGEND_FILTER_ITEMS.map((item) => ({
        label: item.label,
        color: item.color,
        selectable: true,
        selected: !isShowingAll && state.aisVisibleTypeKeys.has(item.key),
        onToggle: (checked) => setAisTypeSelected(item.key, checked)
      }))
    ]
  });
}

export function startAisUpdates() {
  if (state.aisClient) {
    state.aisEnabled = true;
    attachLayers();
    enableAisLegend();
    renderAisFeatures();
    return;
  }

  state.aisEnabled = true;
  state.aisConnected = false;
  state.aisError = null;

  attachLayers();
  enableAisLegend();
  renderAisFeatures();
  startPruneLoop();
  loadAisSnapshotFromHistory();

  state.aisClient = connectToAisMqtt({
    onConnect() {
      if (!state.aisEnabled) {
        return;
      }
      state.aisConnected = true;
      state.aisError = null;
      refreshActiveLayersPanel();
    },
    onLocation(message) {
      mergeAisMessage(message.mmsi, 'location', message.payload);
    },
    onMetadata(message) {
      mergeAisMessage(message.mmsi, 'metadata', message.payload);
    },
    onError(error) {
      state.aisConnected = false;
      setAisError(error?.message || 'AIS connection failed');
    },
    onClose() {
      state.aisConnected = false;
      refreshActiveLayersPanel();
    }
  });
}

export function stopAisUpdates() {
  const client = state.aisClient;
  state.aisClient = null;

  if (state.aisPruneInterval) {
    clearInterval(state.aisPruneInterval);
    state.aisPruneInterval = null;
  }

  removeMapLegendSection('ais');

  removeLayers();
  state.aisEnabled = false;
  state.aisConnected = false;
  state.aisFeatures = [];
  state.aisVesselsByMmsi = new Map();
  state.aisTypeFilterMode = 'all';
  state.aisVisibleTypeKeys = new Set();
  state.aisTrackAutoRenderEnabled = false;
  state.aisShowOnlySelected = false;
  clearAisSelection();
  clearAisTracks();
  state.aisError = null;
  state.aisLastUpdate = null;
  state.aisLastMessageAt = null;

  if (client) {
    Promise.resolve(client.disconnect()).catch((error) => {
      console.warn('[AIS] Failed to disconnect MQTT client:', error);
    });
  }

  refreshActiveLayersPanel();
}

export function rebuildAisLayers() {
  if (!state.aisEnabled) {
    return;
  }

  removeLayers();
  attachLayers();
  renderAisFeatures();
}

export function refreshAisRenderedFeatures() {
  if (!state.aisEnabled) {
    return;
  }
  renderAisFeatures();
}
