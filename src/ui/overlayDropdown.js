import { updateAllOverlays } from '../map/overlays.js';
import { updateOSMLegend } from './osmLegend.js';
import { state } from '../state/store.js';

function getOverlaySummary(selected, overlayList) {
  if (!selected || selected.length === 0) return 'No overlays';
  if (selected.length === 1) {
    const found = overlayList.find(l => l.name === selected[0]);
    return found ? found.title : selected[0];
  }
  if (selected.length <= 2) {
    return selected.map(n => {
      const found = overlayList.find(l => l.name === n);
      return found ? found.title : n;
    }).join(', ');
  }
  return `${selected.length} selected`;
}

export function createOverlayDropdown(mapKey, selected, onChange, overlayList, labelText, options = {}) {
  const isAccordion = options.isAccordion || false;

  let dropdownButton = document.createElement('button');
  dropdownButton.type = 'button';
  dropdownButton.className = 'overlay-dropdown-btn';
  dropdownButton.style.width = '100%';
  dropdownButton.style.textAlign = 'left';
  dropdownButton.style.padding = '10px 12px';
  dropdownButton.style.borderRadius = '8px';
  dropdownButton.style.border = '1px solid #ccc';
  dropdownButton.style.background = 'white';
  dropdownButton.style.cursor = 'pointer';
  dropdownButton.style.fontSize = '0.95em';
  dropdownButton.style.margin = '0';
  dropdownButton.style.boxSizing = 'border-box';
  dropdownButton.style.outline = 'none';
  dropdownButton.style.position = 'relative';
  dropdownButton.style.display = 'flex';
  dropdownButton.style.justifyContent = 'space-between';
  dropdownButton.style.alignItems = 'center';

  const labelSpan = document.createElement('span');
  labelSpan.textContent = labelText;
  labelSpan.style.fontWeight = 'bold';
  labelSpan.style.color = '#555';

  const valueSpan = document.createElement('span');
  valueSpan.textContent = getOverlaySummary(selected, overlayList);
  valueSpan.style.color = '#888';
  valueSpan.style.fontSize = '0.9em';
  valueSpan.style.maxWidth = '150px';
  valueSpan.style.overflow = 'hidden';
  valueSpan.style.textOverflow = 'ellipsis';
  valueSpan.style.whiteSpace = 'nowrap';

  dropdownButton.appendChild(labelSpan);
  dropdownButton.appendChild(valueSpan);
  let dropdownPanel = document.createElement('div');
  dropdownPanel.className = 'overlay-dropdown-panel';
  dropdownPanel.style.display = 'none';
  if (isAccordion) {
    dropdownPanel.style.position = 'relative';
    dropdownPanel.style.marginTop = '4px';
    dropdownPanel.style.border = '1px solid #eee';
  } else {
    dropdownPanel.style.position = 'absolute';
    dropdownPanel.style.left = '0';
    dropdownPanel.style.top = '110%';
    dropdownPanel.style.boxShadow = '0 2px 12px rgba(0,0,0,0.13)';
  }
  dropdownPanel.style.width = '100%';
  dropdownPanel.style.background = 'rgba(255,255,255,0.97)';
  dropdownPanel.style.padding = '10px 12px';
  dropdownPanel.style.borderRadius = '10px';
  dropdownPanel.style.boxSizing = 'border-box';
  dropdownPanel.style.overflow = 'auto';
  dropdownPanel.style.maxHeight = '350px';
  dropdownPanel.style.zIndex = '100';
  // Label
  const label = document.createElement('div');
  label.textContent = labelText;
  label.style.fontWeight = 'bold';
  label.style.marginBottom = '8px';
  dropdownPanel.appendChild(label);
  // Options
  overlayList.forEach(layer => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.marginBottom = '6px';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = layer.name;
    checkbox.checked = selected.includes(layer.name);
    checkbox.style.marginRight = '8px';
    checkbox.addEventListener('change', function (e) {
      const newSelected = Array.from(dropdownPanel.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value);
      onChange(newSelected);
      valueSpan.textContent = getOverlaySummary(newSelected, overlayList);
    });
    row.appendChild(checkbox);
    const title = document.createElement('span');
    title.textContent = layer.title;
    title.style.flex = '1';
    row.appendChild(title);
    if (layer.type === 'wms' && state.wmsOverlayLegends[layer.name]) {
      const legend = document.createElement('img');
      legend.src = state.wmsOverlayLegends[layer.name];
      legend.style.height = '20px';
      legend.style.marginLeft = '8px';
      legend.style.background = '#fff';
      legend.style.border = '1px solid #ccc';
      legend.style.borderRadius = '3px';
      row.appendChild(legend);
    }
    dropdownPanel.appendChild(row);
  });
  // Dropdown open/close logic
  let open = false;
  function closeDropdown() { dropdownPanel.style.display = 'none'; open = false; }
  function openDropdown() {
    if (isAccordion) {
      // Close other accordions in the same container
      const container = dropdownButton.closest('.ui-column-container');
      if (container) {
        container.querySelectorAll('.overlay-dropdown-panel').forEach(p => {
          if (p !== dropdownPanel) p.style.display = 'none';
        });
      }
    }
    dropdownPanel.style.display = 'block';
    open = true;
  }
  dropdownButton.addEventListener('click', function (e) {
    e.stopPropagation();
    if (open) closeDropdown(); else openDropdown();
  });
  document.addEventListener('click', function (e) {
    if (!isAccordion && !dropdownPanel.contains(e.target) && e.target !== dropdownButton) closeDropdown();
  });
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.width = '100%';
  container.appendChild(dropdownButton);
  container.appendChild(dropdownPanel);
  return { container, dropdownButton, dropdownPanel };
}

const AIRCRAFT_OVERLAY = {
  id: 'aircraft',
  name: 'Aircraft (OpenSky)',
  type: 'aircraft',
  enabled: false
};

export function createAllOverlayDropdowns(mapKey, updatePermalinkWithFeatures) {
  const digiroad = createOverlayDropdown(mapKey, state.digiroadOverlayLayers, function (newSelected) {
    state.digiroadOverlayLayers = newSelected;
    updateAllOverlays();
    updatePermalinkWithFeatures();
  }, state.digiroadOverlayList, 'Digiroad overlays', { isAccordion: true });

  const generic = createOverlayDropdown(mapKey, state.genericOverlayLayers, function (newSelected) {
    state.genericOverlayLayers = newSelected;
    updateAllOverlays();
    updatePermalinkWithFeatures();
  }, state.genericOverlayList, 'Other overlays', { isAccordion: true });

  // OSM Data dropdown
  const osmSelected = state.osmSelectedIds;
  const osmList = state.osmItems.map(i => ({ name: i.id, title: i.title, type: 'geojson' }));
  const osm = createOverlayDropdown(mapKey, osmSelected, function (newSelected) {
    state.osmSelectedIds = newSelected;
    updateAllOverlays();
    updateOSMLegend();
    updatePermalinkWithFeatures();
  }, osmList, 'OSM Data', { isAccordion: true });

  // Aircraft overlay dropdown
  const aircraftSelected = state.aircraftEnabled ? ['aircraft'] : [];
  const aircraftList = [{ name: 'aircraft', title: 'Aircraft (OpenSky)', type: 'aircraft' }];
  const aircraft = createOverlayDropdown(mapKey, aircraftSelected, function (newSelected) {
    const enabled = newSelected.includes('aircraft');
    if (enabled) {
      import('../aircraft/aircraftManager.js').then(m => m.startAircraftUpdates());
      import('../aircraft/aircraftInteractions.js').then(m => m.setupAircraftClickHandlers());
    } else {
      import('../aircraft/aircraftInteractions.js').then(m => m.cleanupAircraftInteractions());
      import('../aircraft/aircraftManager.js').then(m => m.stopAircraftUpdates());
    }
    state.aircraftEnabled = enabled;
    import('./activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
  }, aircraftList, 'Live Aircraft', { isAccordion: true });

  return [digiroad, generic, osm, aircraft];
}

export function mountOverlaySelectors(mainMapDiv, updatePermalinkWithFeatures) {
  // Check if we are in single map mode (legacy support or main map initialization)
  let column = mainMapDiv.querySelector('.ui-column-container');
  if (!column) {
    column = document.createElement('div');
    column.className = 'ui-column-container';
    column.style.position = 'absolute';
    column.style.top = '60px';
    column.style.right = '10px';
    column.style.zIndex = '10';
    column.style.maxWidth = '320px';
    column.style.minWidth = '220px';
    column.style.boxSizing = 'border-box';
    column.style.maxHeight = 'calc(100vh - 80px)';
    column.style.overflowY = 'auto';
    column.style.scrollbarWidth = 'none';
    column.style.msOverflowStyle = 'none';
    mainMapDiv.appendChild(column);
  }

  const dropdowns = createAllOverlayDropdowns('main', updatePermalinkWithFeatures);

  dropdowns.forEach((d, idx) => {
    if (idx > 0) d.container.style.marginTop = '8px';
    column.appendChild(d.container);
  });
}


