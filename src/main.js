import { hardcodedLayers, mapboxAccessToken } from './config/constants.js';
import { state } from './state/store.js';
import { loadCapabilities, createBaseMap, createSplitMaps, parseInitialFromParams } from './map/init.js';
import { createTileLayerFromList } from './map/layers.js';
import { createAllOverlayDropdowns, mountOverlaySelectors } from './ui/overlayDropdown.js';
import { enableOverlayInfoClickHandlers, disableOverlayInfoClickHandlers } from './map/overlayInfoClick.js';
import { showClickMarker } from './draw/markers.js';
import { showAllDrawables, copyDrawnFeatures, clearDrawnFeatures } from './draw/showables.js';
import { wireDrawButtons, wireRemoveFeaturesButton, enableMarkerClickHandler } from './draw/tools.js';
import { setupNominatimSearch } from './search/nominatim.js';
import { initOsmFeatureSearch } from './ui/osmFeatureSearch.js';
import { updateOsmDynamicLayers } from './map/osmDynamicLayers.js';
import { fetchOverlayCapabilities } from './overlays/fetchCapabilities.js';
import { getQueryParams } from './utils/query.js';
import { updatePermalinkWithFeatures, updatePermalink } from './map/permalink.js';
import { syncViews } from './map/sync.js';
import { createLayerSelectorDropdown } from './ui/layerSelector.js';
import { createLayerGroupMenu } from './ui/layerGroupMenu.js';
import { updateAllOverlays } from './map/overlays.js';
import { createOSMPopup } from './ui/osmPopup.js';
import { createOSMLegend, updateOSMLegend } from './ui/osmLegend.js';
import { setupOSMInteractions } from './map/osmInteractions.js';
import { fromLonLat } from 'ol/proj';
import 'ol/ol.css';
import { fetchMarkers, fetchPolygons, createMarker, createPolygon, fetchUsers } from './api/client.js';
import { ensureUserLayers, addUserMarkerToMaps, addUserPolygonToMaps, rebuildUserLayersAllMaps } from './user/userLayers.js';
import { setupUserFeatureHover, setupUserFeatureClick } from './user/userInteractions.js';
import { openUserFeatureForm } from './ui/userFeatureForm.js';
import { getSession } from './auth/session.js';
import { showLoginOverlay } from './ui/loginOverlay.js';

async function bootstrap() {
  const params = getQueryParams();
  const { initialCenter, initialZoom, initialIsSplit } = parseInitialFromParams(params);
  const result = await loadCapabilities();

  // Pre-fetch layer groups so they are available for restoration
  const { fetchLayerGroups } = await import('./api/client.js');
  state.layerGroups = await fetchLayerGroups() || [];

  const mainMapDiv = document.getElementById('map');
  const splitToggle = document.getElementById('split-toggle');
  const splitMapsContainer = document.getElementById('split-maps-container');

  createBaseMap(result, initialCenter, initialZoom, state.initialLayerIdx);
  ensureUserLayers();
  setupUserFeatureHover(state.map);
  setupUserFeatureClick(state.map);

  async function mountUnifiedLayerManager(parentDiv, mapKey, initialLayerId, onLayerChange, onDateChange) {
    // 1. Create/Find column
    let column = parentDiv.querySelector('.ui-column-container');
    if (column) column.remove();

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
    parentDiv.appendChild(column);

    // 2. Basemap Selector
    const basemapSelector = createLayerSelectorDropdown(initialLayerId,
      function (newId) {
        onLayerChange(newId);
      },
      function (newDate) {
        onDateChange(newDate);
      }
    );
    column.appendChild(basemapSelector);

    // 3. Overlays
    const overlayDropdowns = createAllOverlayDropdowns(mapKey, updatePermalinkWithFeatures);
    overlayDropdowns.forEach(d => {
      d.container.style.marginTop = '8px';
      column.appendChild(d.container);
    });

    // 4. Layer Groups
    const groupMenu = await createLayerGroupMenu();
    groupMenu.style.marginTop = '8px';
    column.appendChild(groupMenu);

    return column;
  }

  function addSingleLayerSelectorToMap() {
    mountUnifiedLayerManager(mainMapDiv, 'main', hardcodedLayers[state.initialLayerIdx].id,
      function (newLayerId) {
        state.currentLayerId = newLayerId;
        const newLayer = createTileLayerFromList(result, newLayerId, null, mapboxAccessToken, state.selectedDate);
        state.map.getLayers().setAt(0, newLayer);
        const view = state.map.getView();
        updatePermalink(view.getCenter(), view.getZoom(), newLayerId, false);
      },
      function (newDate) {
        state.selectedDate = newDate;
        const newLayer = createTileLayerFromList(result, state.currentLayerId, null, mapboxAccessToken, newDate);
        state.map.getLayers().setAt(0, newLayer);
      }
    );
  }

  async function loadUserFeaturesFromServer() {
    try {
      const [markersFC, polygonsFC] = await Promise.all([
        fetchMarkers(),
        fetchPolygons(),
      ]);
      if (markersFC && Array.isArray(markersFC.features)) {
        markersFC.features.forEach(f => {
          const [lon, lat] = f.geometry.coordinates;
          addUserMarkerToMaps({ id: f.properties?.id, lon, lat, title: f.properties?.title || '', description: f.properties?.description || '', color: f.properties?.color || '#00bcd4', ownerUsername: f.properties?.owner_username || null, sharedUserIds: f.properties?.shared_user_ids || [] });
        });
      }
      if (polygonsFC && Array.isArray(polygonsFC.features)) {
        polygonsFC.features.forEach(f => {
          const coords = (f.geometry.coordinates[0] || []).map(([lon, lat]) => [lon, lat]);
          addUserPolygonToMaps({ id: f.properties?.id, coordinates: coords, title: f.properties?.title || '', description: f.properties?.description || '', color: f.properties?.color || '#ff9800', ownerUsername: f.properties?.owner_username || null, sharedUserIds: f.properties?.shared_user_ids || [] });
        });
      }
    } catch (e) {
      // ignore in static hosting (no server)
    }
  }

  function activateSplitScreen() {
    state.isSplit = true;
    document.getElementById('map').style.display = 'none';
    splitMapsContainer.style.display = 'block';
    // showSingleLayerSelector(false); // No longer needed, mountUnifiedLayerManager handles removal
    if (state.leftMap) state.leftMap.setTarget(null);
    if (state.rightMap) state.rightMap.setTarget(null);
    const mainView = state.map.getView();
    const center = mainView.getCenter(); const zoom = mainView.getZoom(); const rotation = mainView.getRotation();
    createSplitMaps(result, center, zoom, rotation);
    ensureUserLayers();
    rebuildUserLayersAllMaps();
    setupUserFeatureHover(state.leftMap);
    setupUserFeatureClick(state.leftMap);
    setupUserFeatureHover(state.rightMap);
    setupUserFeatureClick(state.rightMap);
    enableOverlayInfoClickHandlers();
    setupOSMInteractions(state.leftMap);
    setupOSMInteractions(state.rightMap);
    state.leftMapMoveendListener = function () { if (!state.restoringFromPermalink && state.permalinkInitialized) updatePermalinkWithFeatures(); };
    state.rightMapMoveendListener = function () { if (!state.restoringFromPermalink && state.permalinkInitialized) updatePermalinkWithFeatures(); };
    state.leftMap.on('moveend', state.leftMapMoveendListener);
    state.rightMap.on('moveend', state.rightMapMoveendListener);

    mountUnifiedLayerManager(document.getElementById('map-left'), 'left', state.leftLayerId,
      function (newLayerId) {
        state.leftLayerId = newLayerId;
        const newLayer = createTileLayerFromList(result, newLayerId, null, mapboxAccessToken, state.leftDate);
        state.leftMap.getLayers().setAt(0, newLayer);
        updatePermalinkWithFeatures();
      },
      function (newDate) {
        state.leftDate = newDate;
        const newLayer = createTileLayerFromList(result, state.leftLayerId, null, mapboxAccessToken, newDate);
        state.leftMap.getLayers().setAt(0, newLayer);
      }
    );

    mountUnifiedLayerManager(document.getElementById('map-right'), 'right', state.rightLayerId,
      function (newLayerId) {
        state.rightLayerId = newLayerId;
        const newLayer = createTileLayerFromList(result, newLayerId, null, mapboxAccessToken, state.rightDate);
        state.rightMap.getLayers().setAt(0, newLayer);
        updatePermalinkWithFeatures();
      },
      function (newDate) {
        state.rightDate = newDate;
        const newLayer = createTileLayerFromList(result, state.rightLayerId, null, mapboxAccessToken, newDate);
        state.rightMap.getLayers().setAt(0, newLayer);
      }
    );
    copyDrawnFeatures('main', 'left', state.map, state.leftMap);
    copyDrawnFeatures('main', 'right', state.map, state.rightMap);
    clearDrawnFeatures('main', state.map);
    updateOsmDynamicLayers(); // Sync dynamic layers to split maps
  }
  function deactivateSplitScreen() {
    state.isSplit = false;
    splitMapsContainer.style.display = 'none';
    document.getElementById('map').style.display = 'block';
    addSingleLayerSelectorToMap(); // Re-add single layer selector
    if (state.leftMap) state.leftMap.setTarget(null);
    if (state.rightMap) state.rightMap.setTarget(null);
    if (state.leftMap && state.leftMapMoveendListener) state.leftMap.un('moveend', state.leftMapMoveendListener);
    state.leftMapMoveendListener = null;
    if (state.rightMap && state.rightMapMoveendListener) state.rightMap.un('moveend', state.rightMapMoveendListener);
    state.rightMapMoveendListener = null;
    copyDrawnFeatures('left', 'main', state.leftMap, state.map);
    clearDrawnFeatures('left', state.leftMap);
    clearDrawnFeatures('right', state.rightMap);
  }
  const _activateSplitScreen = activateSplitScreen; const _deactivateSplitScreen = deactivateSplitScreen;
  function activateSplitScreenWrapped() { _activateSplitScreen(); if (state.leftMap && state.rightMap) { syncViews(state.leftMap, state.rightMap); syncViews(state.rightMap, state.leftMap); } enableOverlayInfoClickHandlers(); showAllDrawables(showClickMarker); }
  function deactivateSplitScreenWrapped() { _deactivateSplitScreen(); enableOverlayInfoClickHandlers(); showAllDrawables(showClickMarker); }

  if (initialIsSplit) {
    setTimeout(async () => { activateSplitScreenWrapped(); splitToggle.textContent = 'Single screen'; await restoreFeaturesFromURL(params); }, 0);
  } else {
    await restoreFeaturesFromURL(params);
  }

  // Load persisted user features
  loadUserFeaturesFromServer();
  splitToggle.addEventListener('click', function () {
    if (!state.isSplit) { activateSplitScreenWrapped(); splitToggle.textContent = 'Single screen'; if (state.drawingMode === 'marker') { enableMarkerClickHandler(); } updatePermalinkWithFeatures(); }
    else { deactivateSplitScreenWrapped(); splitToggle.textContent = 'Split screen'; if (state.drawingMode === 'marker') { enableMarkerClickHandler(); } updatePermalinkWithFeatures(); }
  });

  state.map.on('moveend', function () { if (!state.restoringFromPermalink && state.permalinkInitialized) { updatePermalinkWithFeatures(); } });
  import('ol/control').then(({ defaults }) => { defaults().extend([]).forEach(ctrl => state.map.addControl(ctrl)); });

  initOsmFeatureSearch();
  setupNominatimSearch();
  wireDrawButtons(updatePermalinkWithFeatures);
  wireRemoveFeaturesButton(updatePermalinkWithFeatures);

  await fetchOverlayCapabilities();

  // Add Unified Layer Manager to main map
  addSingleLayerSelectorToMap();

  // Initialize OSM components
  createOSMPopup();

  import('./ui/activeLayers.js').then(({ createActiveLayersPanel, updateActiveLayersPanel }) => {
    createActiveLayersPanel();
    updateActiveLayersPanel();
  });

  enableOverlayInfoClickHandlers();
  setupOSMInteractions(state.map);

  async function restoreFeaturesFromURL(params) {
    state.restoringFromPermalink = true;
    state.drawingMode = null;
    // Deprecated: do not restore user markers/polygons from URL
    state.markerCoords = null;
    state.polygonCoords = null;
    state.lineCoords = null; if (params.line) { const coords = params.line.split(';').map(pair => pair.split(',').map(Number)); if (coords.length >= 2 && coords.every(pair => pair.length === 2 && !isNaN(pair[0]) && !isNaN(pair[1]))) { state.lineCoords = coords.map(pair => fromLonLat([pair[0], pair[1]])); } }
    state.measureCoords = null; if (params.measure) { const coords = params.measure.split(';').map(pair => pair.split(',').map(Number)); if (coords.length >= 2 && coords.every(pair => pair.length === 2 && !isNaN(pair[0]) && !isNaN(pair[1]))) { state.measureCoords = coords.map(pair => fromLonLat([pair[0], pair[1]])); } }
    state.overlayLayers = []; if (params.overlays) {
      state.overlayLayers = params.overlays.split(';').filter(Boolean);
      state.digiroadOverlayLayers = state.overlayLayers.filter(name => state.digiroadOverlayList.some(l => l.name === name));
      state.genericOverlayLayers = state.overlayLayers.filter(name => state.genericOverlayList.some(l => l.name === name));
      updateAllOverlays();
    }
    if (params.osm) {
      const ids = params.osm.split(';').filter(Boolean);
      state.osmSelectedIds = ids.filter(id => state.osmItems.some(i => i.id === id));
      updateAllOverlays();
    }
    if (params.groups) {
      const groupIds = params.groups.split(';').filter(Boolean).map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      state.activeLayerGroupIds = Array.from(new Set([...state.activeLayerGroupIds, ...groupIds]));

      // Ensure colors are assigned for restored groups
      const { ensureLayerGroupColors } = await import('./ui/layerGroupMenu.js');
      ensureLayerGroupColors();

      updateAllOverlays();
      updateOsmDynamicLayers();
    }
    showAllDrawables(showClickMarker);
    state.restoringFromPermalink = false;
    state.permalinkInitialized = true;
    updatePermalinkWithFeatures();
  }

}

// Gate app behind login
(async () => {
  const sess = await getSession();
  if (!sess || !sess.user) {
    showLoginOverlay(async () => { await bootstrap(); });
  } else {
    await bootstrap();
  }
})();


