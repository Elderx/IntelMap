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
