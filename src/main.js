import { hardcodedLayers, mapboxAccessToken } from './config/constants.js';
import { state } from './state/store.js';
import { loadCapabilities, createBaseMap, createSplitMaps, parseInitialFromParams } from './map/init.js';
import { createTileLayerFromList } from './map/layers.js';
import { createOverlayDropdown, mountOverlaySelectors } from './ui/overlayDropdown.js';
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

  const mainMapDiv = document.getElementById('map');
  const splitToggle = document.getElementById('split-toggle');
  const splitMapsContainer = document.getElementById('split-maps-container');

  createBaseMap(result, initialCenter, initialZoom, state.initialLayerIdx);
  ensureUserLayers();
  setupUserFeatureHover(state.map);
  setupUserFeatureClick(state.map);

  let singleLayerSelectorDiv = null;
  function showSingleLayerSelector(show) { if (singleLayerSelectorDiv) singleLayerSelectorDiv.style.display = show ? 'block' : 'none'; }
  function addSingleLayerSelectorToMap() {
    if (singleLayerSelectorDiv) singleLayerSelectorDiv.remove();
    singleLayerSelectorDiv = createLayerSelectorDropdown(hardcodedLayers[state.initialLayerIdx].id, function (newLayerId) {
      const newLayer = createTileLayerFromList(result, newLayerId, null, mapboxAccessToken);
      state.map.getLayers().setAt(0, newLayer);
      const view = state.map.getView();
      updatePermalink(view.getCenter(), view.getZoom(), newLayerId, false);
    });
    mainMapDiv.appendChild(singleLayerSelectorDiv);
    showSingleLayerSelector(true);
  }
  addSingleLayerSelectorToMap();

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
    showSingleLayerSelector(false);
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
    const leftLayerSelectorDiv = createLayerSelectorDropdown(state.leftLayerId, function (newLayerId) { state.leftLayerId = newLayerId; const newLayer = createTileLayerFromList(result, newLayerId, null, mapboxAccessToken); state.leftMap.getLayers().setAt(0, newLayer); updatePermalinkWithFeatures(); });
    leftLayerSelectorDiv.style.left = '10px'; leftLayerSelectorDiv.style.right = 'auto';
    const rightLayerSelectorDiv = createLayerSelectorDropdown(state.rightLayerId, function (newLayerId) { state.rightLayerId = newLayerId; const newLayer = createTileLayerFromList(result, newLayerId, null, mapboxAccessToken); state.rightMap.getLayers().setAt(0, newLayer); updatePermalinkWithFeatures(); });
    document.getElementById('map-left').appendChild(leftLayerSelectorDiv);
    document.getElementById('map-right').appendChild(rightLayerSelectorDiv);
    copyDrawnFeatures('main', 'left', state.map, state.leftMap);
    copyDrawnFeatures('main', 'right', state.map, state.rightMap);
    clearDrawnFeatures('main', state.map);
    updateOsmDynamicLayers(); // Sync dynamic layers to split maps
  }
  function deactivateSplitScreen() {
    state.isSplit = false;
    splitMapsContainer.style.display = 'none';
    document.getElementById('map').style.display = 'block';
    showSingleLayerSelector(true);
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
    setTimeout(() => { activateSplitScreenWrapped(); splitToggle.textContent = 'Single screen'; restoreFeaturesFromURL(params); }, 0);
  } else {
    restoreFeaturesFromURL(params);
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
  mountOverlaySelectors(mainMapDiv, updatePermalinkWithFeatures);

  // Initialize Layer Group Menu
  import('./ui/layerGroupMenu.js').then(async ({ createLayerGroupMenu }) => {
    const menu = await createLayerGroupMenu();
    // Find the right-side column container created by mountOverlaySelectors
    const column = mainMapDiv.querySelector('div[style*="top: 60px"][style*="right: 10px"]');
    if (column) column.appendChild(menu);
  });

  // Initialize OSM components
  createOSMPopup();

  import('./ui/activeLayers.js').then(({ createActiveLayersPanel, updateActiveLayersPanel }) => {
    createActiveLayersPanel();
    updateActiveLayersPanel();
  });

  enableOverlayInfoClickHandlers();
  setupOSMInteractions(state.map);

  function restoreFeaturesFromURL(params) {
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


