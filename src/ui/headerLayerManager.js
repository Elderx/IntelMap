/**
 * IntelMap Header Layer Manager
 * Manages layer controls for single-map and split-screen modes
 */

import { state } from '../state/store.js';
import { fromLonLat } from 'ol/proj.js';
import { updateAllOverlays } from '../map/overlays.js';
import { updateOsmDynamicLayers } from '../map/osmDynamicLayers.js';
import { updateOSMLegend } from './osmLegend.js';
import { updatePermalinkWithFeatures } from '../map/permalink.js';
import { toggleLayerGroup } from './layerGroupMenu.js';
import { fetchAisLatestLocationByMmsi } from '../api/client.js';
import { getAisOverlayRuntimeConfig } from '../config/constants.js';
import { startTrainLocationUpdates, stopTrainLocationUpdates } from '../trains/trainLocationsManager.js';
import { startTrainStations, stopTrainStations } from '../trains/trainStationsManager.js';
import { setupTrainLocationClickHandlers, cleanupTrainLocationInteractions } from '../trains/trainLocationsInteractions.js';
import { setupTrainStationClickHandlers, cleanupTrainStationInteractions } from '../trains/trainStationsInteractions.js';
import '../styles/trains.css';

// AIS imports
import { startAisUpdates, stopAisUpdates } from '../ais/aisManager.js';
import { setupAisClickHandlers, cleanupAisInteractions } from '../ais/aisInteractions.js';
import { setAisVesselSelected } from '../ais/aisSelection.js';
import { loadAisTracksForSelection } from '../ais/aisTracksManager.js';
import '../styles/ais.css';

// Weather imports
import { startWeatherUpdates, stopWeatherUpdates } from '../weather/weatherManager.js';
import '../styles/weather.css';

// Traffic camera imports
import { startTrafficCameraUpdates, stopTrafficCameraUpdates } from '../trafficCameras/trafficCameraManager.js';
import '../styles/traffic-cameras.css';

// Radar imports - static imports for unified time bar
import {
  setRadarTimeByIndex,
  radarStepBackward,
  radarStepForward,
  startRadarAnimation,
  stopRadarAnimation,
  setRadarSpeed,
  getCurrentTimeIndex as getRadarTimeIndex,
  getRadarTimeSteps
} from '../radar/radarManager.js';

// Weather stations imports - static imports for unified time bar
import {
  setWeatherTimeByIndex,
  getCurrentWeatherTimeIndex,
  getWeatherTimeSteps,
  startWeatherAnimation,
  stopWeatherAnimation,
  setWeatherAnimationSpeed
} from '../weather/weatherStations.js';

// GPX imports (dynamic to avoid circular dependency)
import '../styles/gpx.css';

// UAS imports
import '../styles/uas.css';

/**
 * Mount the header layer manager for single map mode
 */
export function mountHeaderLayerManager(capabilitiesResult) {
  const container = document.getElementById('header-layer-manager');
  if (!container) {
    console.warn('[HeaderLayerManager] Container not found');
    return;
  }

  state.capabilitiesResult = capabilitiesResult;
  container.innerHTML = '';

  const accordion = document.createElement('div');
  accordion.className = 'header-accordion';

  // Basemap Section
  const basemapItem = createBasemapAccordion();
  accordion.appendChild(basemapItem);

  // Digiroad Overlays Section
  const digiroadItem = createDigiroadAccordion();
  accordion.appendChild(digiroadItem);

  // Other Overlays Section
  const otherOverlaysItem = createOtherOverlaysAccordion();
  accordion.appendChild(otherOverlaysItem);

  // OSM Data Section
  const osmDataItem = createOsmDataAccordion();
  accordion.appendChild(osmDataItem);

  // Aircraft Section
  const aircraftItem = createAircraftAccordion();
  accordion.appendChild(aircraftItem);

  // AIS Section
  const aisItem = createAisAccordion();
  accordion.appendChild(aisItem);

  // Train Locations Section
  const trainLocationsItem = createTrainLocationsAccordion();
  accordion.appendChild(trainLocationsItem);

  // Train Stations Section
  const trainStationsItem = createTrainStationsAccordion();
  accordion.appendChild(trainStationsItem);

  // Weather Section
  const weatherItem = createWeatherAccordion();
  accordion.appendChild(weatherItem);

  // Traffic Cameras Section
  const trafficCameraItem = createTrafficCamerasAccordion();
  accordion.appendChild(trafficCameraItem);

  // GPX Section
  const gpxItem = createGpxAccordion();
  accordion.appendChild(gpxItem);

  // UAS Airspace Section
  const uasItem = createUasAccordion();
  accordion.appendChild(uasItem);

  // Layer Groups Section
  const layerGroupsItem = createLayerGroupsAccordion();
  accordion.appendChild(layerGroupsItem);

  container.appendChild(accordion);

  updateHeaderActiveLayers();

  console.log('[HeaderLayerManager] Mounted single map controls');
}

/**
 * Mount split mode layer controls for left and right maps
 */
export function mountSplitModeLayerManagers(capabilitiesResult) {
  state.capabilitiesResult = capabilitiesResult;

  // Left map controls
  const leftContainer = document.getElementById('left-map-layer-manager');
  if (leftContainer) {
    leftContainer.innerHTML = '';
    const leftAccordion = createMapControlAccordion('left');
    leftContainer.appendChild(leftAccordion);
  }

  // Right map controls
  const rightContainer = document.getElementById('right-map-layer-manager');
  if (rightContainer) {
    rightContainer.innerHTML = '';
    const rightAccordion = createMapControlAccordion('right');
    rightContainer.appendChild(rightAccordion);
  }

  updateHeaderActiveLayers();

  console.log('[HeaderLayerManager] Mounted split map controls');
}

/**
 * Create a complete map control accordion for left/right map
 */
function createMapControlAccordion(mapKey) {
  const accordion = document.createElement('div');
  accordion.className = 'header-accordion';

  // Basemap Section
  const basemapItem = createMapBasemapAccordion(mapKey);
  accordion.appendChild(basemapItem);

  // Digiroad Overlays Section
  const digiroadItem = createDigiroadAccordion();
  accordion.appendChild(digiroadItem);

  // Other Overlays Section
  const otherOverlaysItem = createOtherOverlaysAccordion();
  accordion.appendChild(otherOverlaysItem);

  // OSM Data Section
  const osmDataItem = createOsmDataAccordion();
  accordion.appendChild(osmDataItem);

  // Aircraft Section
  const aircraftItem = createAircraftAccordion();
  accordion.appendChild(aircraftItem);

  // AIS Section
  const aisItem = createAisAccordion();
  accordion.appendChild(aisItem);

  // Train Locations Section
  const trainLocationsItem = createTrainLocationsAccordion();
  accordion.appendChild(trainLocationsItem);

  // Train Stations Section
  const trainStationsItem = createTrainStationsAccordion();
  accordion.appendChild(trainStationsItem);

  // Weather Section
  const weatherItem = createWeatherAccordion();
  accordion.appendChild(weatherItem);

  // Traffic Cameras Section
  const trafficCameraItem = createTrafficCamerasAccordion();
  accordion.appendChild(trafficCameraItem);

  // Layer Groups Section
  const layerGroupsItem = createLayerGroupsAccordion();
  accordion.appendChild(layerGroupsItem);

  return accordion;
}

/**
 * Create basemap accordion for a specific map (left/right)
 */
function createMapBasemapAccordion(mapKey) {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  const select = document.createElement('select');
  select.className = 'form-select';
  select.style.width = '100%';

  import('../config/constants.js').then(({ hardcodedLayers }) => {
    hardcodedLayers.forEach(layer => {
      const option = document.createElement('option');
      option.value = layer.id;
      option.textContent = layer.name;
      select.appendChild(option);
    });

    const currentId = mapKey === 'left' ? state.leftLayerId : state.rightLayerId;
    select.value = currentId || hardcodedLayers[state.initialLayerIdx || 0].id;
  });

  select.addEventListener('change', function() {
    import('../map/layers.js').then(({ createTileLayerFromList }) => {
      import('../config/constants.js').then(({ mapboxAccessToken }) => {
        const result = state.capabilitiesResult;
        if (!result) {
          console.error('[HeaderLayerManager] Capabilities result not available');
          return;
        }

        const targetMap = mapKey === 'left' ? state.leftMap : state.rightMap;
        if (!targetMap) {
          console.error('[HeaderLayerManager] Target map not available:', mapKey);
          return;
        }

        const newLayer = createTileLayerFromList(
          result,
          this.value,
          null,
          mapboxAccessToken,
          mapKey === 'left' ? state.leftDate : state.rightDate
        );

        targetMap.getLayers().setAt(0, newLayer);

        if (mapKey === 'left') {
          state.leftLayerId = this.value;
        } else {
          state.rightLayerId = this.value;
        }

        updatePermalinkWithFeatures();
      });
    });
  });

  content.appendChild(select);

  return createAccordionItem('🗺️ Basemap', content, false);
}

/**
 * Create basemap accordion (single mode)
 */
function createBasemapAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  const select = document.createElement('select');
  select.id = 'header-basemap-selector';
  select.className = 'form-select';
  select.style.width = '100%';

  import('../config/constants.js').then(({ hardcodedLayers }) => {
    hardcodedLayers.forEach(layer => {
      const option = document.createElement('option');
      option.value = layer.id;
      option.textContent = layer.name;
      select.appendChild(option);
    });

    select.value = state.currentLayerId || hardcodedLayers[state.initialLayerIdx || 0].id;
  });

  select.addEventListener('change', function() {
    import('../map/layers.js').then(({ createTileLayerFromList }) => {
      import('../config/constants.js').then(({ mapboxAccessToken }) => {
        const result = state.capabilitiesResult;

        if (!result) {
          console.error('[HeaderLayerManager] Capabilities result not available');
          return;
        }

        const newLayer = createTileLayerFromList(
          result,
          this.value,
          null,
          mapboxAccessToken,
          state.selectedDate
        );

        if (!state.isSplit && state.map) {
          state.map.getLayers().setAt(0, newLayer);
          state.currentLayerId = this.value;
        }

        updatePermalinkWithFeatures();
      });
    });
  });

  content.appendChild(select);

  return createAccordionItem('🗺️ Basemap', content, false);
}

/**
 * Create Digiroad overlays accordion
 */
function createDigiroadAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  state.digiroadOverlayList.forEach(layer => {
    const row = createCheckboxRow(
      layer.title,
      state.digiroadOverlayLayers.includes(layer.name),
      (checked) => {
        if (checked) {
          if (!state.digiroadOverlayLayers.includes(layer.name)) {
            state.digiroadOverlayLayers.push(layer.name);
          }
        } else {
          state.digiroadOverlayLayers = state.digiroadOverlayLayers.filter(n => n !== layer.name);
        }
        updateAllOverlays();
        updatePermalinkWithFeatures();
      },
      `digiroad-${layer.name}`  // Add unique ID
    );
    content.appendChild(row);
  });

  return createAccordionItem('🛣️ Digiroad Overlays', content, false);
}

/**
 * Create other overlays accordion
 */
function createOtherOverlaysAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  state.genericOverlayList.forEach(layer => {
    const row = createCheckboxRow(
      layer.title,
      state.genericOverlayLayers.includes(layer.name),
      (checked) => {
        if (checked) {
          if (!state.genericOverlayLayers.includes(layer.name)) {
            state.genericOverlayLayers.push(layer.name);
          }
        } else {
          state.genericOverlayLayers = state.genericOverlayLayers.filter(n => n !== layer.name);
        }
        updateAllOverlays();
        updatePermalinkWithFeatures();
      },
      `generic-${layer.name}`  // Add unique ID
    );
    content.appendChild(row);
  });

  return createAccordionItem('📊 Other Overlays', content, false);
}

/**
 * Create OSM Data accordion
 */
function createOsmDataAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  state.osmItems.forEach(item => {
    const row = createCheckboxRow(
      item.title,
      state.osmSelectedIds.includes(item.id),
      (checked) => {
        if (checked) {
          if (!state.osmSelectedIds.includes(item.id)) {
            state.osmSelectedIds.push(item.id);
          }
        } else {
          state.osmSelectedIds = state.osmSelectedIds.filter(id => id !== item.id);
        }
        updateAllOverlays();
        updateOSMLegend();
        updateHeaderActiveLayers();
        updatePermalinkWithFeatures();
      },
      `osm-${item.id}`  // Add unique ID
    );
    content.appendChild(row);
  });

  // Add dynamic OSM features section
  const dynamicSection = document.createElement('div');
  dynamicSection.style.marginTop = '12px';
  dynamicSection.style.paddingTop = '8px';
  dynamicSection.style.borderTop = '1px solid #eee';

  const dynamicTitle = document.createElement('div');
  dynamicTitle.style.fontSize = '11px';
  dynamicTitle.style.fontWeight = '600';
  dynamicTitle.style.color = '#888';
  dynamicTitle.style.marginBottom = '8px';
  dynamicTitle.textContent = 'Dynamic OSM (use "Add OSM" button)';
  dynamicSection.appendChild(dynamicTitle);

  const dynamicList = document.createElement('div');
  dynamicList.id = 'header-osm-dynamic-list';
  dynamicSection.appendChild(dynamicList);
  content.appendChild(dynamicSection);

  return createAccordionItem('📍 OSM Data', content, false);
}

/**
 * Create Aircraft overlay accordion
 */
function createAircraftAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  const row = createCheckboxRow(
    'Aircraft (OpenSky)',
    state.aircraftEnabled,
    async (checked) => {
      state.aircraftEnabled = checked;
      if (checked) {
        const { startAircraftUpdates } = await import('../aircraft/aircraftManager.js');
        startAircraftUpdates();
        const { setupAircraftClickHandlers } = await import('../aircraft/aircraftInteractions.js');
        setupAircraftClickHandlers();
      } else {
        const { cleanupAircraftInteractions } = await import('../aircraft/aircraftInteractions.js');
        cleanupAircraftInteractions();
        const { stopAircraftUpdates } = await import('../aircraft/aircraftManager.js');
        stopAircraftUpdates();
      }
      updateHeaderActiveLayers();
    },
    'aircraft-enabled'
  );

  content.appendChild(row);
  return createAccordionItem('✈️ Aircraft', content, false);
}

/**
 * Create AIS overlay accordion
 */
function createAisAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';
  const assignIdIfMissing = (el, id) => {
    if (!document.getElementById(id)) {
      el.id = id;
    }
  };

  // Enable/disable toggle
  const row = createCheckboxRow(
    'Ships (AIS)',
    state.aisEnabled,
    async (checked) => {
      state.aisEnabled = checked;
      if (checked) {
        startAisUpdates();
        setupAisClickHandlers();
      } else {
        cleanupAisInteractions();
        stopAisUpdates();
      }
      updateHeaderActiveLayers();
      updatePermalinkWithFeatures();
    },
    'ais-enabled'
  );

  content.appendChild(row);

  const divider = document.createElement('div');
  divider.style.margin = '8px 0';
  divider.style.borderTop = '1px solid #d6dbe3';
  content.appendChild(divider);

  const searchLabel = document.createElement('label');
  searchLabel.textContent = 'Search by MMSI';
  searchLabel.style.display = 'block';
  searchLabel.style.fontSize = '12px';
  searchLabel.style.fontWeight = '600';
  searchLabel.style.color = '#607080';
  searchLabel.style.marginBottom = '6px';
  content.appendChild(searchLabel);

  const searchRow = document.createElement('div');
  searchRow.style.display = 'flex';
  searchRow.style.gap = '6px';
  searchRow.style.marginBottom = '8px';

  const searchInput = document.createElement('input');
  assignIdIfMissing(searchInput, 'ais-mmsi-search-input');
  searchInput.type = 'text';
  searchInput.className = 'form-input';
  searchInput.placeholder = 'e.g. 230145250';
  searchInput.style.flex = '1';
  searchInput.value = state.aisMmsiSearchQuery || '';
  searchInput.addEventListener('input', () => {
    state.aisMmsiSearchQuery = searchInput.value || '';
  });

  const searchBtn = document.createElement('button');
  assignIdIfMissing(searchBtn, 'ais-mmsi-search-btn');
  searchBtn.type = 'button';
  searchBtn.className = 'btn btn-secondary';
  searchBtn.textContent = 'Select';
  searchBtn.style.whiteSpace = 'nowrap';

  searchBtn.addEventListener('click', async () => {
    const mmsi = searchInput.value.trim();
    if (!mmsi) return;
    state.aisMmsiSearchQuery = mmsi;

    const liveFeature = state.aisFeatures.find((feature) => String(feature.get('mmsi')) === mmsi);
    setAisVesselSelected(mmsi, true);

    const activeMap = state.isSplit ? (state.leftMap || state.map) : state.map;
    if (liveFeature && activeMap) {
      const coordinate = liveFeature.getGeometry()?.getCoordinates?.();
      if (coordinate) {
        activeMap.getView().animate({ center: coordinate, duration: 350 });
      }
      return;
    }

    const latest = await fetchAisLatestLocationByMmsi(mmsi);
    if (!latest || !activeMap) {
      return;
    }
    const lon = Number(latest.lon);
    const lat = Number(latest.lat);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      activeMap.getView().animate({ center: fromLonLat([lon, lat], 'EPSG:3857'), duration: 350 });
    }
  });

  searchRow.append(searchInput, searchBtn);
  content.appendChild(searchRow);

  const trackTitle = document.createElement('div');
  trackTitle.textContent = 'Track Range';
  trackTitle.style.fontSize = '12px';
  trackTitle.style.fontWeight = '600';
  trackTitle.style.color = '#607080';
  trackTitle.style.marginBottom = '6px';
  content.appendChild(trackTitle);

  const rangeGrid = document.createElement('div');
  rangeGrid.className = 'ais-track-range-grid';

  const startInput = document.createElement('input');
  assignIdIfMissing(startInput, 'ais-track-start');
  startInput.type = 'datetime-local';
  startInput.className = 'form-input';

  const endInput = document.createElement('input');
  assignIdIfMissing(endInput, 'ais-track-end');
  endInput.type = 'datetime-local';
  endInput.className = 'form-input';

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  const formatDateTimeInput = (date) => {
    const local = new Date(date);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    return local.toISOString().slice(0, 16);
  };
  const applyNowTrackRange = () => {
    if (!state.aisTrackRangeFollowNow) {
      return;
    }

    const now = new Date();
    const start = new Date(now.getTime() - SIX_HOURS_MS);
    startInput.value = formatDateTimeInput(start);
    endInput.value = formatDateTimeInput(now);
    state.aisTrackRangeStart = start.toISOString();
    state.aisTrackRangeEnd = now.toISOString();
  };
  const applyStateTrackRange = () => {
    const now = new Date();
    const endDate = state.aisTrackRangeEnd ? new Date(state.aisTrackRangeEnd) : now;
    const startDate = state.aisTrackRangeStart
      ? new Date(state.aisTrackRangeStart)
      : new Date(endDate.getTime() - SIX_HOURS_MS);
    startInput.value = formatDateTimeInput(startDate);
    endInput.value = formatDateTimeInput(endDate);
  };
  const parseInputToIso = (value) => {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString();
  };
  const setManualTrackRangeMode = () => {
    state.aisTrackRangeFollowNow = false;
    state.aisTrackRangeStart = parseInputToIso(startInput.value);
    state.aisTrackRangeEnd = parseInputToIso(endInput.value);
  };
  const applyPresetTrackRange = (minutes) => {
    const end = new Date();
    const start = new Date(end.getTime() - (minutes * 60 * 1000));
    state.aisTrackRangeFollowNow = false;
    state.aisTrackRangeStart = start.toISOString();
    state.aisTrackRangeEnd = end.toISOString();
    startInput.value = formatDateTimeInput(start);
    endInput.value = formatDateTimeInput(end);
  };

  startInput.addEventListener('input', setManualTrackRangeMode);
  endInput.addEventListener('input', setManualTrackRangeMode);

  if (state.aisTrackRangeFollowNow || !state.aisTrackRangeStart || !state.aisTrackRangeEnd) {
    state.aisTrackRangeFollowNow = true;
    applyNowTrackRange();
  } else {
    applyStateTrackRange();
  }

  if (state.aisTrackRangeNowTimer) {
    clearInterval(state.aisTrackRangeNowTimer);
    state.aisTrackRangeNowTimer = null;
  }

  const runtimeConfig = getAisOverlayRuntimeConfig();
  const refreshMs = Math.max(1000, Number(runtimeConfig.trackRangeAutoRefreshMs) || 60 * 1000);
  state.aisTrackRangeNowTimer = setInterval(() => {
    if (!document.body.contains(startInput) || !document.body.contains(endInput)) {
      clearInterval(state.aisTrackRangeNowTimer);
      state.aisTrackRangeNowTimer = null;
      return;
    }
    if (!state.aisTrackRangeFollowNow) {
      return;
    }
    if (document.activeElement === startInput || document.activeElement === endInput) {
      return;
    }
    applyNowTrackRange();
  }, refreshMs);

  const presetWrap = document.createElement('div');
  presetWrap.className = 'ais-track-presets';
  const presetOptions = [
    { id: 'ais-range-preset-15m', label: 'Last 15min', minutes: 15 },
    { id: 'ais-range-preset-1h', label: 'Last 1h', minutes: 60 },
    { id: 'ais-range-preset-6h', label: 'Last 6h', minutes: 6 * 60 },
    { id: 'ais-range-preset-12h', label: 'Last 12h', minutes: 12 * 60 },
    { id: 'ais-range-preset-24h', label: 'Last 24h', minutes: 24 * 60 }
  ];
  presetOptions.forEach((preset) => {
    const btn = document.createElement('button');
    assignIdIfMissing(btn, preset.id);
    btn.type = 'button';
    btn.className = 'ais-track-preset-btn';
    btn.textContent = preset.label;
    btn.addEventListener('click', () => {
      applyPresetTrackRange(preset.minutes);
    });
    presetWrap.appendChild(btn);
  });
  content.appendChild(presetWrap);

  rangeGrid.append(startInput, endInput);
  content.appendChild(rangeGrid);

  const loadTracksBtn = document.createElement('button');
  assignIdIfMissing(loadTracksBtn, 'ais-load-tracks-btn');
  loadTracksBtn.type = 'button';
  loadTracksBtn.className = 'btn btn-primary';
  loadTracksBtn.textContent = 'Load Tracks';
  loadTracksBtn.style.width = '100%';
  loadTracksBtn.style.marginTop = '8px';
  loadTracksBtn.addEventListener('click', async () => {
    const start = parseInputToIso(startInput.value);
    const end = parseInputToIso(endInput.value);
    await loadAisTracksForSelection({ start, end });
  });
  content.appendChild(loadTracksBtn);

  const item = createAccordionItem('🚢 Ships', content, false);
  const header = item.querySelector('.header-accordion-header');
  if (header) {
    header.addEventListener('click', () => {
      setTimeout(() => {
        if (!item.classList.contains('open')) {
          return;
        }
        applyNowTrackRange();
      }, 0);
    });
  }

  return item;
}

function createTrainLocationsAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  const row = createCheckboxRow(
    'Train Locations',
    state.trainLocationsEnabled,
    async (checked) => {
      state.trainLocationsEnabled = checked;
      if (checked) {
        await startTrainLocationUpdates();
        setupTrainLocationClickHandlers();
      } else {
        cleanupTrainLocationInteractions();
        stopTrainLocationUpdates();
      }
      updateHeaderActiveLayers();
      updatePermalinkWithFeatures();
    },
    'train-locations-enabled'
  );

  content.appendChild(row);
  return createAccordionItem('Train Locations', content, false);
}

function createTrainStationsAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  const row = createCheckboxRow(
    'Train Stations',
    state.trainStationsEnabled,
    async (checked) => {
      state.trainStationsEnabled = checked;
      if (checked) {
        await startTrainStations();
        setupTrainStationClickHandlers();
      } else {
        cleanupTrainStationInteractions();
        stopTrainStations();
      }
      updateHeaderActiveLayers();
      updatePermalinkWithFeatures();
    },
    'train-stations-enabled'
  );

  content.appendChild(row);
  return createAccordionItem('Train Stations', content, false);
}

/**
 * Create weather overlay accordion
 * @returns {HTMLElement} Accordion element
 */
function createWeatherAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  // Main enable/disable toggle
  const mainRow = createCheckboxRow(
    '🌤️ Weather',
    state.weatherEnabled,
    async (checked) => {
      state.weatherEnabled = checked;
      if (checked) {
        startWeatherUpdates();
      } else {
        stopWeatherUpdates();
      }
      updateHeaderActiveLayers();
      updatePermalinkWithFeatures();
    },
    'weather-enabled'
  );

  content.appendChild(mainRow);

  // Display mode control
  const displayModeDiv = document.createElement('div');
  displayModeDiv.style.marginTop = '8px';
  displayModeDiv.style.paddingTop = '8px';
  displayModeDiv.style.borderTop = '1px solid #eee';

  const displayModeLabel = document.createElement('label');
  displayModeLabel.style.fontSize = '11px';
  displayModeLabel.style.fontWeight = '600';
  displayModeLabel.style.color = '#888';
  displayModeLabel.style.display = 'block';
  displayModeLabel.style.marginBottom = '4px';
  displayModeLabel.textContent = 'Display Mode:';
  displayModeDiv.appendChild(displayModeLabel);

  // Temperature checkbox
  const tempRow = createCheckboxRow(
    'Temperature',
    state.weatherShowTemperature,
    async (checked) => {
      state.weatherShowTemperature = checked;
      import('../weather/weatherStations.js').then(({ updateWeatherStationStyles }) => {
        updateWeatherStationStyles();
      });
    },
    'weather-show-temperature'
  );
  displayModeDiv.appendChild(tempRow);

  // Wind checkbox
  const windRow = createCheckboxRow(
    'Wind (speed + direction)',
    state.weatherShowWind,
    async (checked) => {
      state.weatherShowWind = checked;
      import('../weather/weatherStations.js').then(({ updateWeatherStationStyles }) => {
        updateWeatherStationStyles();
      });
    },
    'weather-show-wind'
  );
  displayModeDiv.appendChild(windRow);

  // Humidity checkbox
  const humidityRow = createCheckboxRow(
    'Humidity',
    state.weatherShowHumidity,
    async (checked) => {
      state.weatherShowHumidity = checked;
      import('../weather/weatherStations.js').then(({ updateWeatherStationStyles }) => {
        updateWeatherStationStyles();
      });
    },
    'weather-show-humidity'
  );
  displayModeDiv.appendChild(humidityRow);

  // Snow depth checkbox
  const snowRow = createCheckboxRow(
    'Snow depth',
    state.weatherShowSnowDepth,
    async (checked) => {
      state.weatherShowSnowDepth = checked;
      import('../weather/weatherStations.js').then(({ updateWeatherStationStyles }) => {
        updateWeatherStationStyles();
      });
    },
    'weather-show-snow'
  );
  displayModeDiv.appendChild(snowRow);

  // Pressure checkbox
  const pressureRow = createCheckboxRow(
    'Pressure',
    state.weatherShowPressure,
    async (checked) => {
      state.weatherShowPressure = checked;
      import('../weather/weatherStations.js').then(({ updateWeatherStationStyles }) => {
        updateWeatherStationStyles();
      });
    },
    'weather-show-pressure'
  );
  displayModeDiv.appendChild(pressureRow);

  content.appendChild(displayModeDiv);

  // Arrow size control (always visible now since wind can be on with temperature)
  const arrowSizeDiv = document.createElement('div');
  arrowSizeDiv.style.marginTop = '8px';
  arrowSizeDiv.style.paddingTop = '8px';
  arrowSizeDiv.style.borderTop = '1px solid #eee';

  const arrowSizeLabel = document.createElement('label');
  arrowSizeLabel.style.fontSize = '11px';
  arrowSizeLabel.style.fontWeight = '600';
  arrowSizeLabel.style.color = '#888';
  arrowSizeLabel.style.display = 'block';
  arrowSizeLabel.style.marginBottom = '4px';
  arrowSizeLabel.textContent = 'Arrow Size (px):';
  arrowSizeDiv.appendChild(arrowSizeLabel);

  const arrowSizeSelect = document.createElement('select');
  arrowSizeSelect.id = 'weather-arrow-size';
  arrowSizeSelect.className = 'form-select';
  arrowSizeSelect.style.width = '100%';
  arrowSizeSelect.style.fontSize = '12px';
  arrowSizeSelect.style.padding = '4px 8px';

  const arrowSizes = [12, 16, 20, 24, 28, 32, 36];
  arrowSizes.forEach(size => {
    const option = document.createElement('option');
    option.value = size.toString();
    option.textContent = `${size}px`;
    if (size === state.weatherArrowSize) {
      option.selected = true;
    }
    arrowSizeSelect.appendChild(option);
  });

  arrowSizeSelect.addEventListener('change', function() {
    state.weatherArrowSize = parseInt(this.value, 10);
    import('../weather/weatherStations.js').then(({ updateWeatherStationStyles }) => {
      updateWeatherStationStyles();
    });
  });

  arrowSizeDiv.appendChild(arrowSizeSelect);
  content.appendChild(arrowSizeDiv);

  // Circles visibility toggle
  const circlesRow = createCheckboxRow(
    'Show circles',
    state.weatherCirclesVisible,
    async (checked) => {
      state.weatherCirclesVisible = checked;
      // Update all station feature styles
      import('../weather/weatherStations.js').then(({ updateWeatherStationStyles }) => {
        updateWeatherStationStyles();
      });
    },
    'weather-circles'
  );

  content.appendChild(circlesRow);

  // Text size control
  const textSizeDiv = document.createElement('div');
  textSizeDiv.style.marginTop = '8px';
  textSizeDiv.style.paddingTop = '8px';
  textSizeDiv.style.borderTop = '1px solid #eee';

  const textSizeLabel = document.createElement('label');
  textSizeLabel.style.fontSize = '11px';
  textSizeLabel.style.fontWeight = '600';
  textSizeLabel.style.color = '#888';
  textSizeLabel.style.display = 'block';
  textSizeLabel.style.marginBottom = '4px';
  textSizeLabel.textContent = 'Text Size (px):';
  textSizeDiv.appendChild(textSizeLabel);

  const textSizeSelect = document.createElement('select');
  textSizeSelect.id = 'weather-text-size';
  textSizeSelect.className = 'form-select';
  textSizeSelect.style.width = '100%';
  textSizeSelect.style.fontSize = '12px';
  textSizeSelect.style.padding = '4px 8px';

  // Add size options
  const sizes = [8, 10, 12, 14, 16, 18, 20];
  sizes.forEach(size => {
    const option = document.createElement('option');
    option.value = size.toString();
    option.textContent = `${size}px`;
    if (size === state.weatherTextSize) {
      option.selected = true;
    }
    textSizeSelect.appendChild(option);
  });

  textSizeSelect.addEventListener('change', function() {
    state.weatherTextSize = parseInt(this.value, 10);
    // Update all station feature styles
    import('../weather/weatherStations.js').then(({ updateWeatherStationStyles }) => {
      updateWeatherStationStyles();
    });
  });

  textSizeDiv.appendChild(textSizeSelect);
  content.appendChild(textSizeDiv);

  // Radar overlay section (only enable checkbox)
  const radarSection = document.createElement('div');
  radarSection.style.marginTop = '12px';
  radarSection.style.paddingTop = '12px';
  radarSection.style.borderTop = '2px solid #ddd';

  const radarHeader = document.createElement('div');
  radarHeader.style.fontSize = '12px';
  radarHeader.style.fontWeight = '600';
  radarHeader.style.color = '#666';
  radarHeader.style.marginBottom = '8px';
  radarHeader.textContent = '📡 Radar (Finland)';
  radarSection.appendChild(radarHeader);

  // Radar enable checkbox
  const radarRow = createCheckboxRow(
    'Show radar overlay',
    state.radarEnabled,
    async (checked) => {
      const { toggleRadar } = await import('../radar/radarManager.js');
      const enabled = toggleRadar();
      updateHeaderActiveLayers();
      // Update unified time bar
      createUnifiedTimeBar();
    },
    'radar-enabled'
  );
  radarSection.appendChild(radarRow);

  content.appendChild(radarSection);

  // Info text
  const infoText = document.createElement('div');
  infoText.className = 'text-muted';
  infoText.style.fontSize = '11px';
  infoText.style.padding = '4px 0 0 16px';
  infoText.textContent = 'Showing observations from FMI weather stations';
  content.appendChild(infoText);

  return createAccordionItem('🌤️ Weather', content, false);
}

/**
 * Create traffic camera overlay accordion
 * @returns {HTMLElement} Accordion element
 */
function createTrafficCamerasAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  const row = createCheckboxRow(
    'Traffic Cameras',
    state.trafficCameraEnabled,
    async (checked) => {
      state.trafficCameraEnabled = checked;
      if (checked) {
        await startTrafficCameraUpdates();
        const { setupTrafficCameraClickHandlers } = await import('../trafficCameras/trafficCameraInteractions.js');
        setupTrafficCameraClickHandlers();
      } else {
        const { cleanupTrafficCameraInteractions } = await import('../trafficCameras/trafficCameraInteractions.js');
        cleanupTrafficCameraInteractions();
        stopTrafficCameraUpdates();
      }
      updateHeaderActiveLayers();
      updatePermalinkWithFeatures();
    },
    'traffic-cameras-enabled'
  );

  content.appendChild(row);

  return createAccordionItem('Traffic Cameras', content, false);
}

/**
 * Create GPX overlay accordion
 * @returns {HTMLElement} Accordion element
 */
/**
 * Create GPX overlay accordion
 * @returns {HTMLElement} Accordion element
 */
function createGpxAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  // Main enable/disable toggle
  const mainRow = createCheckboxRow(
    '📍 GPX Tracks',
    state.gpxEnabled,
    async (checked) => {
      state.gpxEnabled = checked;
      if (checked) {
        const { showGpxPanel } = await import('./gpxControl.js');
        showGpxPanel();
      } else {
        // Reset the "was enabled before close" flag when manually unchecked
        const { resetWasGpxEnabledBeforeClose } = await import('./gpxControl.js');
        if (resetWasGpxEnabledBeforeClose) {
          resetWasGpxEnabledBeforeClose();
        }
        const { hideGpxPanel } = await import('./gpxControl.js');
        hideGpxPanel();
      }
      updateHeaderActiveLayers();
      updatePermalinkWithFeatures();
    },
    'gpx-enabled'
  );

  content.appendChild(mainRow);

  // Info text
  const infoText = document.createElement('div');
  infoText.className = 'text-muted';
  infoText.style.fontSize = '11px';
  infoText.style.padding = '4px 0 0 16px';
  infoText.textContent = 'Load GPX files to display GPS tracks on the map';
  content.appendChild(infoText);

  const item = createAccordionItem('📍 GPX', content, false);
  item.classList.add('gpx'); // Add class for identification

  // Store reference to the checkbox for later access
  item.dataset.gpxCheckboxId = 'gpx-enabled';

  // Add custom click handler to show panel when clicking header
  const header = item.querySelector('.header-accordion-header');
  if (header) {
    header.addEventListener('click', async () => {
      // Check if panel is hidden
      const panel = document.querySelector('#gpx-panel');
      const panelHidden = !panel || panel.style.display === 'none' || panel.style.display === '';

      // If panel is hidden, check if we should re-enable GPX and show it
      if (panelHidden) {
        // Import dynamically to check if GPX was enabled before close
        const { wasGpxEnabledBeforeCloseFn } = await import('./gpxControl.js');
        const wasEnabled = wasGpxEnabledBeforeCloseFn();

        // Check if there are loaded files or GPX was enabled before close
        const hasFiles = state.gpxFiles && state.gpxFiles.length > 0;
        const shouldReopen = state.gpxEnabled || wasEnabled || hasFiles;

        if (shouldReopen) {
          // Re-enable GPX if needed
          if (!state.gpxEnabled) {
            state.gpxEnabled = true;
            const checkbox = document.getElementById('gpx-enabled');
            if (checkbox) {
              checkbox.checked = true;
            }
            updateHeaderActiveLayers();
            updatePermalinkWithFeatures();
          }

          // Show the panel
          const { showGpxPanel } = await import('./gpxControl.js');
          showGpxPanel();
        }
      }
    });
  }

  return item;
}

/**
 * Create UAS Airspace accordion
 */
function createUasAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  // Main enable/disable toggle
  const mainRow = createCheckboxRow(
    '🚁 UAS Zones',
    state.uasEnabled,
    async (checked) => {
      if (checked) {
        const { startUAS } = await import('../airspace/uasManager.js');
        await startUAS();
        const { setupUASClickHandlers } = await import('../airspace/uasInteractions.js');
        setupUASClickHandlers();
      } else {
        const { stopUAS } = await import('../airspace/uasManager.js');
        await stopUAS();
        const { cleanupUASInteractions } = await import('../airspace/uasInteractions.js');
        cleanupUASInteractions();
      }
      updateHeaderActiveLayers();
      updatePermalinkWithFeatures();
    },
    'uas-enabled'
  );

  content.appendChild(mainRow);

  // Info text
  const infoText = document.createElement('div');
  infoText.className = 'text-muted';
  infoText.style.fontSize = '11px';
  infoText.style.padding = '4px 0 0 16px';
  infoText.textContent = 'Finnish UAS (drone) flying zones with restriction info';
  content.appendChild(infoText);

  const item = createAccordionItem('Airspace', content, false);
  item.classList.add('uas'); // Add class for identification

  // Store reference to the checkbox for later access
  item.dataset.uasCheckboxId = 'uas-enabled';

  return item;
}

/**
 * Create Layer Groups accordion
 */
function createLayerGroupsAccordion() {
  const content = document.createElement('div');
  content.style.padding = '8px 0';

  const loadingMsg = document.createElement('div');
  loadingMsg.textContent = 'Loading...';
  loadingMsg.style.color = '#888';
  loadingMsg.style.fontSize = '12px';
  loadingMsg.id = 'layer-groups-loading';
  content.appendChild(loadingMsg);

  import('../api/client.js').then(({ fetchLayerGroups }) => {
    fetchLayerGroups().then(groups => {
      state.layerGroups = groups || [];
      const loadingEl = document.getElementById('layer-groups-loading');
      if (loadingEl) loadingEl.remove();

      if (!groups || groups.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.textContent = 'No saved groups';
        emptyMsg.style.color = '#888';
        emptyMsg.style.fontSize = '12px';
        content.appendChild(emptyMsg);
        return;
      }

      groups.forEach(group => {
        const row = createCheckboxRow(
          group.name,
          state.activeLayerGroupIds.includes(parseInt(group.id, 10)),
          (checked) => {
            toggleLayerGroup(group);
            updateHeaderActiveLayers();
          },
          `layergroup-${group.id}`  // Add unique ID
        );
        content.appendChild(row);
      });
    });
  });

  return createAccordionItem('📂 Layer Groups', content, false);
}

/**
 * Create an accordion item
 */
function createAccordionItem(title, content, isOpen = false) {
  const item = document.createElement('div');
  item.className = 'header-accordion-item';
  if (isOpen) item.classList.add('open');

  const header = document.createElement('div');
  header.className = 'header-accordion-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'header-accordion-title';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  const arrow = document.createElement('div');
  arrow.className = 'header-accordion-arrow';
  arrow.innerHTML = '▾';
  header.appendChild(arrow);

  item.appendChild(header);

  const contentEl = document.createElement('div');
  contentEl.className = 'header-accordion-content';
  contentEl.appendChild(content);
  item.appendChild(contentEl);

  // Toggle on click
  header.addEventListener('click', () => {
    item.classList.toggle('open');
  });

  return item;
}

/**
 * Create a checkbox row
 */
function createCheckboxRow(label, checked, onChange, id = null) {
  const row = document.createElement('div');
  row.className = 'checkbox-row';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  // Add data attribute for identification
  if (id) {
    checkbox.id = id;
    checkbox.dataset.layerId = id;
  }
  checkbox.addEventListener('change', (e) => {
    onChange(e.target.checked);
  });

  const labelEl = document.createElement('label');
  labelEl.className = 'checkbox-row-label';
  labelEl.textContent = label;
  labelEl.addEventListener('click', () => {
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change'));
  });

  row.appendChild(checkbox);
  row.appendChild(labelEl);

  return row;
}

/**
 * Update the active layers summary in the header dropdown
 */
export function updateHeaderActiveLayers() {
  // Not implemented for now - active layers shown in bottom-right panel
}

/**
 * Refresh dynamic OSM features in the layer dropdown
 */
export function refreshDynamicOsmFeatures() {
  const list = document.getElementById('header-osm-dynamic-list');
  if (!list) return;

  list.innerHTML = '';

  if (!state.activeOsmFeatures || state.activeOsmFeatures.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.color = '#888';
    emptyMsg.style.fontSize = '11px';
    emptyMsg.textContent = 'None active';
    list.appendChild(emptyMsg);
    return;
  }

  state.activeOsmFeatures.forEach(f => {
    const row = document.createElement('div');
    row.className = 'checkbox-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = f.visible !== false;
    checkbox.addEventListener('change', () => {
      f.visible = checkbox.checked;
      updateOsmDynamicLayers();
    });

    const labelEl = document.createElement('label');
    labelEl.className = 'checkbox-row-label';
    labelEl.style.fontSize = '12px';
    labelEl.textContent = `${f.key}=${f.value}`;

    const colorDot = document.createElement('div');
    colorDot.style.width = '8px';
    colorDot.style.height = '8px';
    colorDot.style.borderRadius = '50%';
    colorDot.style.background = f.color;
    colorDot.style.flexShrink = '0';
    colorDot.style.marginRight = '8px';

    const labelContainer = document.createElement('div');
    labelContainer.style.display = 'flex';
    labelContainer.style.alignItems = 'center';
    labelContainer.style.flex = '1';
    labelContainer.appendChild(colorDot);
    labelContainer.appendChild(labelEl);

    row.appendChild(checkbox);
    row.appendChild(labelContainer);

    list.appendChild(row);
  });
}

/**
 * Update Digiroad overlay checkboxes to match current state
 */
export function updateDigiroadCheckboxes() {
  const checkboxes = document.querySelectorAll('input[type="checkbox"][data-layer-id^="digiroad-"]');
  checkboxes.forEach(checkbox => {
    const layerName = checkbox.dataset.layerId.replace('digiroad-', '');
    checkbox.checked = state.digiroadOverlayLayers.includes(layerName);
  });
}

/**
 * Update Generic overlay checkboxes to match current state
 */
export function updateGenericCheckboxes() {
  const checkboxes = document.querySelectorAll('input[type="checkbox"][data-layer-id^="generic-"]');
  checkboxes.forEach(checkbox => {
    const layerName = checkbox.dataset.layerId.replace('generic-', '');
    checkbox.checked = state.genericOverlayLayers.includes(layerName);
  });
}

/**
 * Update OSM Data checkboxes to match current state
 */
export function updateOsmCheckboxes() {
  const checkboxes = document.querySelectorAll('input[type="checkbox"][data-layer-id^="osm-"]');
  checkboxes.forEach(checkbox => {
    const osmId = checkbox.dataset.layerId.replace('osm-', '');
    checkbox.checked = state.osmSelectedIds.includes(osmId);
  });
}

/**
 * Update Layer Group checkboxes to match current state
 */
export function updateLayerGroupCheckboxes() {
  const checkboxes = document.querySelectorAll('input[type="checkbox"][data-layer-id^="layergroup-"]');
  checkboxes.forEach(checkbox => {
    const groupId = parseInt(checkbox.dataset.layerId.replace('layergroup-', ''), 10);
    checkbox.checked = state.activeLayerGroupIds.includes(groupId);
  });
}

/**
 * Update all layer checkboxes to match current state
 */
export function updateAllLayerCheckboxes() {
  updateDigiroadCheckboxes();
  updateGenericCheckboxes();
  updateOsmCheckboxes();
  updateLayerGroupCheckboxes();
}

/**
 * Create unified time control bar for radar and/or weather overlays
 */
export function createUnifiedTimeBar() {
  // Remove existing bars if present
  removeUnifiedTimeBar();

  // Determine which overlays are active
  const hasRadar = state.radarEnabled;
  const hasWeather = state.weatherEnabled;

  if (!hasRadar && !hasWeather) return;

  const bar = document.createElement('div');
  bar.id = 'unified-time-bar';
  bar.style.position = 'fixed';
  bar.style.bottom = '20px';
  bar.style.left = '50%';
  bar.style.transform = 'translateX(-50%)';
  bar.style.background = 'rgba(255, 255, 255, 0.95)';
  bar.style.border = '1px solid #ddd';
  bar.style.borderRadius = '12px';
  bar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
  bar.style.padding = '12px 20px';
  bar.style.zIndex = '1000';
  bar.style.display = 'flex';
  bar.style.alignItems = 'center';
  bar.style.gap = '12px';
  bar.style.minWidth = '500px';
  bar.style.maxWidth = '800px';

  // Dark theme support
  const isDark = state.theme === 'dark';
  if (isDark) {
    bar.style.background = 'rgba(30, 30, 30, 0.95)';
    bar.style.border = '1px solid #444';
  }

  // Title - show which overlays are active
  const title = document.createElement('div');
  title.style.fontSize = '13px';
  title.style.fontWeight = '600';
  title.style.color = isDark ? '#fff' : '#333';
  title.style.whiteSpace = 'nowrap';
  if (hasRadar && hasWeather) {
    title.textContent = '🌤️ Weather + 📡 Radar';
  } else if (hasRadar) {
    title.textContent = '📡 Radar';
  } else {
    title.textContent = '🌤️ Weather';
  }
  bar.appendChild(title);

  // Time display
  const timeDisplay = document.createElement('div');
  timeDisplay.id = 'unified-time-display';
  timeDisplay.style.fontFamily = 'monospace';
  timeDisplay.style.fontSize = '13px';
  timeDisplay.style.color = isDark ? '#fff' : '#333';
  timeDisplay.style.minWidth = '120px';
  timeDisplay.textContent = '-';
  bar.appendChild(timeDisplay);

  // Step backward button
  const stepBackBtn = document.createElement('button');
  stepBackBtn.className = 'btn btn-sm btn-secondary';
  stepBackBtn.innerHTML = '&laquo;';
  stepBackBtn.style.padding = '4px 10px';
  stepBackBtn.style.fontSize = '14px';
  stepBackBtn.addEventListener('click', () => {
    if (hasRadar) {
      radarStepBackward();
      updateUnifiedTimeDisplay();
    }
    if (hasWeather) {
      const currentIndex = getCurrentWeatherTimeIndex();
      const timeSteps = getWeatherTimeSteps();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : timeSteps.length - 1;
      setWeatherTimeByIndex(prevIndex);
      updateUnifiedTimeDisplay();
    }
  });
  bar.appendChild(stepBackBtn);

  // Play button
  const playBtn = document.createElement('button');
  playBtn.id = 'unified-play-btn';
  playBtn.className = 'btn btn-sm btn-success';
  playBtn.textContent = '▶';
  playBtn.style.padding = '4px 12px';
  playBtn.style.fontSize = '12px';
  playBtn.style.minWidth = '60px';
  playBtn.addEventListener('click', () => {
    if (hasRadar) {
      startRadarAnimation();
    }
    if (hasWeather) {
      startWeatherAnimation();
    }
  });
  bar.appendChild(playBtn);

  // Pause button
  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'unified-pause-btn';
  pauseBtn.className = 'btn btn-sm btn-warning';
  pauseBtn.textContent = '⏸';
  pauseBtn.style.padding = '4px 12px';
  pauseBtn.style.fontSize = '12px';
  pauseBtn.style.minWidth = '60px';
  pauseBtn.style.display = 'none';
  pauseBtn.addEventListener('click', () => {
    if (hasRadar) {
      stopRadarAnimation();
    }
    if (hasWeather) {
      stopWeatherAnimation();
    }
  });
  bar.appendChild(pauseBtn);

  // Step forward button
  const stepForwardBtn = document.createElement('button');
  stepForwardBtn.className = 'btn btn-sm btn-secondary';
  stepForwardBtn.innerHTML = '&raquo;';
  stepForwardBtn.style.padding = '4px 10px';
  stepForwardBtn.style.fontSize = '14px';
  stepForwardBtn.addEventListener('click', () => {
    if (hasRadar) {
      radarStepForward();
      updateUnifiedTimeDisplay();
    }
    if (hasWeather) {
      const currentIndex = getCurrentWeatherTimeIndex();
      const timeSteps = getWeatherTimeSteps();
      const nextIndex = currentIndex < timeSteps.length - 1 ? currentIndex + 1 : 0;
      setWeatherTimeByIndex(nextIndex);
      updateUnifiedTimeDisplay();
    }
  });
  bar.appendChild(stepForwardBtn);

  // Speed control
  const speedLabel = document.createElement('span');
  speedLabel.textContent = 'Speed:';
  speedLabel.style.fontSize = '12px';
  speedLabel.style.color = isDark ? '#ccc' : '#666';
  speedLabel.style.marginLeft = '4px';
  bar.appendChild(speedLabel);

  const speedSelect = document.createElement('select');
  speedSelect.id = 'unified-speed-select';
  speedSelect.className = 'form-select';
  speedSelect.style.fontSize = '12px';
  speedSelect.style.padding = '4px 8px';
  speedSelect.style.width = 'auto';
  speedSelect.style.display = 'inline-block';

  const speeds = [
    { value: 0.5, label: '0.5x' },
    { value: 1, label: '1x' },
    { value: 2, label: '2x' },
    { value: 4, label: '4x' },
    { value: 6, label: '6x' }
  ];
  speeds.forEach(s => {
    const option = document.createElement('option');
    option.value = s.value;
    option.textContent = s.label;
    // Use radar speed as default, fallback to weather speed
    const defaultSpeed = hasRadar ? state.radarSpeed : state.weatherAnimationSpeed;
    if (s.value === defaultSpeed) {
      option.selected = true;
    }
    speedSelect.appendChild(option);
  });

  speedSelect.addEventListener('change', function() {
    const speed = parseFloat(this.value);
    if (hasRadar) {
      setRadarSpeed(speed);
    }
    if (hasWeather) {
      setWeatherAnimationSpeed(speed);
    }
  });

  bar.appendChild(speedSelect);

  // Time slider (make it long)
  const sliderContainer = document.createElement('div');
  sliderContainer.style.flex = '1';
  sliderContainer.style.minWidth = '200px';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'unified-time-slider';
  slider.min = '0';
  slider.max = '143'; // Will be updated dynamically
  slider.value = '0';
  slider.style.width = '100%';
  slider.style.cursor = 'pointer';
  slider.style.height = '6px';

  slider.addEventListener('input', function() {
    const index = parseInt(this.value, 10);
    if (hasRadar) {
      setRadarTimeByIndex(index);
    }
    if (hasWeather) {
      setWeatherTimeByIndex(index);
    }
    // Update time display only (not slider position to avoid conflict)
    updateUnifiedTimeDisplayText(index);
  });

  sliderContainer.appendChild(slider);
  bar.appendChild(sliderContainer);

  document.body.appendChild(bar);

  // Initialize time display and slider
  initializeUnifiedTimeBar();
}

/**
 * Initialize the unified time bar with current time data
 */
async function initializeUnifiedTimeBar() {
  const timeDisplay = document.getElementById('unified-time-display');
  const slider = document.getElementById('unified-time-slider');

  // Get time steps from whichever overlay has data
  let timeSteps = [];
  let currentIndex = 0;

  if (state.radarEnabled) {
    timeSteps = getRadarTimeSteps();
    currentIndex = getRadarTimeIndex();
  } else if (state.weatherEnabled) {
    timeSteps = getWeatherTimeSteps();
    currentIndex = getCurrentWeatherTimeIndex();
  }

  if (slider && timeSteps.length > 0) {
    slider.max = (timeSteps.length - 1).toString();
    slider.value = currentIndex.toString();
  }

  if (timeDisplay && timeSteps.length > 0) {
    const time = timeSteps[currentIndex];
    if (time) {
      const local = new Date(time);
      local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
      timeDisplay.textContent = local.toISOString().slice(0, 16).replace('T', ' ');
    }
  }
}

/**
 * Remove the unified time control bar
 */
export function removeUnifiedTimeBar() {
  const bar = document.getElementById('unified-time-bar');
  if (bar) {
    bar.remove();
  }
}

/**
 * Update unified time bar display (time display and slider position)
 */
export function updateUnifiedTimeBar() {
  // Reinitialize to update display
  removeUnifiedTimeBar();
  createUnifiedTimeBar();
}

/**
 * Update unified time bar display text only (not slider position)
 * Called during slider drag to avoid conflict with user interaction
 * @param {number} sliderIndex - Optional slider index to use (from slider.value)
 */
function updateUnifiedTimeDisplayText(sliderIndex = null) {
  const timeDisplay = document.getElementById('unified-time-display');

  // Get time steps from whichever overlay has data
  let timeSteps = [];
  let currentIndex = 0;

  if (state.radarEnabled) {
    timeSteps = getRadarTimeSteps();
    currentIndex = sliderIndex !== null ? sliderIndex : getRadarTimeIndex();
  } else if (state.weatherEnabled) {
    timeSteps = getWeatherTimeSteps();
    currentIndex = sliderIndex !== null ? sliderIndex : getCurrentWeatherTimeIndex();
  }

  if (timeDisplay && timeSteps.length > 0 && currentIndex < timeSteps.length) {
    const time = timeSteps[currentIndex];
    if (time) {
      const local = new Date(time);
      local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
      timeDisplay.textContent = local.toISOString().slice(0, 16).replace('T', ' ');
    }
  }
}

/**
 * Update unified time bar display (time display and slider position)
 * Called when time changes during animation or programmatic updates
 */
export function updateUnifiedTimeDisplay() {
  const timeDisplay = document.getElementById('unified-time-display');
  const slider = document.getElementById('unified-time-slider');

  // Get time steps and current index from whichever overlay has data
  let timeSteps = [];
  let currentIndex = 0;

  if (state.radarEnabled) {
    timeSteps = getRadarTimeSteps();
    currentIndex = getRadarTimeIndex();
  } else if (state.weatherEnabled) {
    timeSteps = getWeatherTimeSteps();
    currentIndex = getCurrentWeatherTimeIndex();
  }

  if (slider && timeSteps.length > 0) {
    slider.max = (timeSteps.length - 1).toString();
    slider.value = currentIndex.toString();
  }

  if (timeDisplay && timeSteps.length > 0) {
    const time = timeSteps[currentIndex];
    if (time) {
      const local = new Date(time);
      local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
      timeDisplay.textContent = local.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  // Update active layers panel to show current time
  if (state.radarEnabled || state.weatherEnabled) {
    import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
      updateActiveLayersPanel();
    });
  }
}

/**
 * Recreate the unified time bar (e.g., on theme change)
 */
export function refreshUnifiedTimeBar() {
  if (state.radarEnabled || state.weatherEnabled) {
    createUnifiedTimeBar();
  }
}
