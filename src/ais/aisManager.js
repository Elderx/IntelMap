import { state } from '../state/store.js';
import { AIS_OVERLAY_CONFIG, getAisOverlayRuntimeConfig } from '../config/constants.js';
import { connectToAisMqtt } from '../api/aisMqtt.js';
import { createAisLayer, vesselToFeature } from './aisLayer.js';
import { clearAisSelection } from './aisSelection.js';
import { clearAisTracks } from './aisTracksManager.js';
import { removeMapLegendSection, setMapLegendSection } from '../ui/mapLegend.js';

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
  const features = Array.from(state.aisVesselsByMmsi.values())
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

function enableAisLegend() {
  setMapLegendSection('ais', {
    title: 'Ships (AIS)',
    items: [
      { label: 'Passenger', color: AIS_OVERLAY_CONFIG.colors.passenger },
      { label: 'Cargo', color: AIS_OVERLAY_CONFIG.colors.cargo },
      { label: 'Tanker', color: AIS_OVERLAY_CONFIG.colors.tanker },
      { label: 'Service', color: AIS_OVERLAY_CONFIG.colors.service },
      { label: 'Unknown', color: AIS_OVERLAY_CONFIG.colors.unknown }
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
