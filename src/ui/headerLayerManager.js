/**
 * IntelMap Header Layer Manager
 * Manages layer controls for single-map and split-screen modes
 */

import { state } from '../state/store.js';
import { updateAllOverlays } from '../map/overlays.js';
import { updateOsmDynamicLayers } from '../map/osmDynamicLayers.js';
import { updateOSMLegend } from './osmLegend.js';
import { updatePermalinkWithFeatures } from '../map/permalink.js';
import { toggleLayerGroup } from './layerGroupMenu.js';

// AIS imports
import { startAisUpdates, stopAisUpdates, setUpdateInterval as setAisUpdateInterval } from '../ais/aisManager.js';
import '../styles/ais.css';

// Weather imports
import { startWeatherUpdates, stopWeatherUpdates } from '../weather/weatherManager.js';
import '../styles/weather.css';

// GPX imports (dynamic to avoid circular dependency)
import '../styles/gpx.css';

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

  // Weather Section
  const weatherItem = createWeatherAccordion();
  accordion.appendChild(weatherItem);

  // GPX Section
  const gpxItem = createGpxAccordion();
  accordion.appendChild(gpxItem);

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

  // Weather Section
  const weatherItem = createWeatherAccordion();
  accordion.appendChild(weatherItem);

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

  // Enable/disable toggle
  const row = createCheckboxRow(
    'Ships (AIS)',
    state.aisEnabled,
    async (checked) => {
      state.aisEnabled = checked;
      if (checked) {
        startAisUpdates();
      } else {
        stopAisUpdates();
      }
      updateHeaderActiveLayers();
    },
    'ais-enabled'
  );

  content.appendChild(row);

  // Refresh interval control
  const intervalDiv = document.createElement('div');
  intervalDiv.style.marginTop = '8px';
  intervalDiv.style.paddingTop = '8px';
  intervalDiv.style.borderTop = '1px solid #eee';

  const intervalLabel = document.createElement('label');
  intervalLabel.style.fontSize = '11px';
  intervalLabel.style.fontWeight = '600';
  intervalLabel.style.color = '#888';
  intervalLabel.style.display = 'block';
  intervalLabel.style.marginBottom = '4px';
  intervalLabel.textContent = 'Refresh Interval (seconds):';
  intervalDiv.appendChild(intervalLabel);

  const intervalInputGroup = document.createElement('div');
  intervalInputGroup.style.display = 'flex';
  intervalInputGroup.style.gap = '4px';

  const intervalInput = document.createElement('input');
  intervalInput.type = 'number';
  intervalInput.id = 'ais-interval-input';
  intervalInput.min = '30';
  intervalInput.max = '300';
  intervalInput.value = state.aisRefreshInterval;
  intervalInput.style.width = '70px';
  intervalInput.className = 'form-control';
  intervalInputGroup.appendChild(intervalInput);

  const applyBtn = document.createElement('button');
  applyBtn.id = 'ais-interval-apply';
  applyBtn.textContent = 'Apply';
  applyBtn.className = 'btn-small';
  applyBtn.style.fontSize = '11px';
  applyBtn.style.padding = '4px 8px';
  applyBtn.addEventListener('click', () => {
    const seconds = parseInt(intervalInput.value, 10);
    if (setAisUpdateInterval(seconds)) {
      // Show success feedback
      applyBtn.textContent = '✓';
      setTimeout(() => applyBtn.textContent = 'Apply', 1000);
    }
  });
  intervalInputGroup.appendChild(applyBtn);

  intervalDiv.appendChild(intervalInputGroup);
  content.appendChild(intervalDiv);

  // Historical playback placeholder
  const historyDiv = document.createElement('div');
  historyDiv.style.marginTop = '8px';
  historyDiv.style.paddingTop = '8px';
  historyDiv.style.borderTop = '1px solid #eee';

  const historyText = document.createElement('p');
  historyText.className = 'text-muted';
  historyText.style.fontSize = '11px';
  historyText.style.color = '#888';
  historyText.style.margin = '0';
  historyText.textContent = 'Historical playback coming soon';
  historyDiv.appendChild(historyText);

  content.appendChild(historyDiv);

  return createAccordionItem('🚢 Ships', content, false);
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
