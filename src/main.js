import { hardcodedLayers, mapboxAccessToken } from './config/constants.js';
import { state } from './state/store.js';
import { loadCapabilities, createBaseMap, createSplitMaps, parseInitialFromParams } from './map/init.js';
import { createTileLayerFromList } from './map/layers.js';
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
import { createOSMPopup } from './ui/osmPopup.js';
import { createOSMLegend, updateOSMLegend } from './ui/osmLegend.js';
import { setupOSMInteractions } from './map/osmInteractions.js';
import { fromLonLat } from 'ol/proj';
import 'ol/ol.css';
import { fetchMarkers, fetchPolygons, fetchCircles, createMarker, createPolygon, createCircle, fetchUsers } from './api/client.js';
import { ensureUserLayers, addUserMarkerToMaps, addUserPolygonToMaps, addUserCircleToMaps, rebuildUserLayersAllMaps } from './user/userLayers.js';
import { setupUserFeatureHover, setupUserFeatureClick } from './user/userInteractions.js';
import { openUserFeatureForm } from './ui/userFeatureForm.js';
import { getSession } from './auth/session.js';
import { showLoginOverlay } from './ui/loginOverlay.js';
import { initHeader, updateSplitToggleText, updateRemoveFeaturesButton, closeAllDropdowns, updateHeaderButtonVisibility } from './ui/header.js';
import { mountHeaderLayerManager, mountSplitModeLayerManagers, updateHeaderActiveLayers, refreshDynamicOsmFeatures } from './ui/headerLayerManager.js';
import { updateAllOverlays } from './map/overlays.js';
import './ui/mobileMenu.js'; // Initialize mobile menu (auto-runs)

async function bootstrap() {
  const params = getQueryParams();
  const { initialCenter, initialZoom, initialIsSplit } = parseInitialFromParams(params);
  const result = await loadCapabilities();

  // Load aircraft refresh interval preference
  try {
    const savedInterval = localStorage.getItem('intelmap_aircraft_interval');
    if (savedInterval) {
      state.aircraftRefreshInterval = parseInt(savedInterval, 10);
    }
  } catch (e) {
    console.warn('Failed to load aircraft interval preference:', e);
  }

  // Load AIS refresh interval preference
  try {
    const savedInterval = localStorage.getItem('intelmap_ais_interval');
    if (savedInterval) {
      state.aisRefreshInterval = parseInt(savedInterval, 10);
    }
  } catch (e) {
    console.warn('Failed to load AIS interval preference:', e);
  }

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

  // Initialize radar layers
  import('./radar/radarManager.js').then(({ initRadarLayers }) => {
    initRadarLayers();
  });

  // Initialize header (for UI only - dropdowns, badges, etc.)
  initHeader();
  mountHeaderLayerManager(result); // Populate header layers dropdown (always available)

  // Initialize GPX control
  import('./ui/gpxControl.js').then(({ initGpxControl }) => {
    initGpxControl();
  });

  async function loadUserFeaturesFromServer() {
    try {
      const [markersFC, polygonsFC, circlesFC] = await Promise.all([
        fetchMarkers(),
        fetchPolygons(),
        fetchCircles(),
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
      if (circlesFC && Array.isArray(circlesFC.features)) {
        circlesFC.features.forEach(f => {
          const center = f.properties?.center || f.geometry.coordinates;
          const radius = f.properties?.radius || 0;
          addUserCircleToMaps({ id: f.properties?.id, center, radius, title: f.properties?.title || '', description: f.properties?.description || '', color: f.properties?.color || '#2196f3', opacity: f.properties?.opacity, ownerUsername: f.properties?.owner_username || null, sharedUserIds: f.properties?.shared_user_ids || [] });
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
    import('./map/overlayInfoClick.js').then(({ enableOverlayInfoClickHandlers }) => enableOverlayInfoClickHandlers());
    setupOSMInteractions(state.leftMap);
    setupOSMInteractions(state.rightMap);
    state.leftMapMoveendListener = function () { if (!state.restoringFromPermalink && state.permalinkInitialized) updatePermalinkWithFeatures(); };
    state.rightMapMoveendListener = function () { if (!state.restoringFromPermalink && state.permalinkInitialized) updatePermalinkWithFeatures(); };
    state.leftMap.on('moveend', state.leftMapMoveendListener);
    state.rightMap.on('moveend', state.rightMapMoveendListener);

    // Mount split mode layer managers and update header buttons
    mountSplitModeLayerManagers(result);
    updateHeaderButtonVisibility(true);

    copyDrawnFeatures('main', 'left', state.map, state.leftMap);
    copyDrawnFeatures('main', 'right', state.map, state.rightMap);
    clearDrawnFeatures('main', state.map);
    updateOsmDynamicLayers(); // Sync dynamic layers to split maps
    // Sync weather station layers to split maps
    import('./weather/weatherManager.js').then(({ rebuildWeatherLayers }) => {
      rebuildWeatherLayers();
    });
    // Sync GPX layers to split maps
    import('./gpx/gpxManager.js').then(({ rebuildGpxLayers }) => {
      rebuildGpxLayers();
    });
    // Sync radar layers to split maps
    import('./radar/radarManager.js').then(({ initRadarLayers }) => {
      initRadarLayers();
    });
    import('./trains/trainLocationsManager.js').then(({ rebuildTrainLocationLayers }) => {
      rebuildTrainLocationLayers();
    });
    import('./trains/trainStationsManager.js').then(({ rebuildTrainStationLayers }) => {
      rebuildTrainStationLayers();
    });
    import('./trains/trainLocationsInteractions.js').then(({ setupTrainLocationClickHandlers }) => {
      if (state.trainLocationsEnabled) {
        setupTrainLocationClickHandlers();
      }
    });
    import('./trains/trainStationsInteractions.js').then(({ setupTrainStationClickHandlers }) => {
      if (state.trainStationsEnabled) {
        setupTrainStationClickHandlers();
      }
    });
  }

  function deactivateSplitScreen() {
    state.isSplit = false;
    splitMapsContainer.style.display = 'none';
    document.getElementById('map').style.display = 'block';
    if (state.leftMap) state.leftMap.setTarget(null);
    if (state.rightMap) state.rightMap.setTarget(null);
    if (state.leftMap && state.leftMapMoveendListener) state.leftMap.un('moveend', state.leftMapMoveendListener);
    state.leftMapMoveendListener = null;
    if (state.rightMap && state.rightMapMoveendListener) state.rightMap.un('moveend', state.rightMapMoveendListener);
    state.rightMapMoveendListener = null;

    // Update header buttons for single mode
    updateHeaderButtonVisibility(false);

    copyDrawnFeatures('left', 'main', state.leftMap, state.map);
    clearDrawnFeatures('left', state.leftMap);
    clearDrawnFeatures('right', state.rightMap);
    // Sync weather station layers to single map
    import('./weather/weatherManager.js').then(({ rebuildWeatherLayers }) => {
      rebuildWeatherLayers();
    });
    // Sync GPX layers to single map
    import('./gpx/gpxManager.js').then(({ rebuildGpxLayers }) => {
      rebuildGpxLayers();
    });
    // Sync radar layers to single map
    import('./radar/radarManager.js').then(({ initRadarLayers }) => {
      initRadarLayers();
    });
    import('./trains/trainLocationsManager.js').then(({ rebuildTrainLocationLayers }) => {
      rebuildTrainLocationLayers();
    });
    import('./trains/trainStationsManager.js').then(({ rebuildTrainStationLayers }) => {
      rebuildTrainStationLayers();
    });
    import('./trains/trainLocationsInteractions.js').then(({ setupTrainLocationClickHandlers }) => {
      if (state.trainLocationsEnabled) {
        setupTrainLocationClickHandlers();
      }
    });
    import('./trains/trainStationsInteractions.js').then(({ setupTrainStationClickHandlers }) => {
      if (state.trainStationsEnabled) {
        setupTrainStationClickHandlers();
      }
    });
  }

  const _activateSplitScreen = activateSplitScreen;
  const _deactivateSplitScreen = deactivateSplitScreen;

  function activateSplitScreenWrapped() {
    _activateSplitScreen();
    if (state.leftMap && state.rightMap) {
      syncViews(state.leftMap, state.rightMap);
      syncViews(state.rightMap, state.leftMap);
    }
    import('./map/overlayInfoClick.js').then(({ enableOverlayInfoClickHandlers }) => enableOverlayInfoClickHandlers());
    showAllDrawables(showClickMarker);
    updateSplitToggleText(true);
    updateHeaderButtonVisibility(true);
    mountSplitModeLayerManagers(result);
  }

  function deactivateSplitScreenWrapped() {
    _deactivateSplitScreen();
    import('./map/overlayInfoClick.js').then(({ enableOverlayInfoClickHandlers }) => enableOverlayInfoClickHandlers());
    showAllDrawables(showClickMarker);
    updateSplitToggleText(false);
    updateHeaderButtonVisibility(false);
  }

  if (initialIsSplit) {
    setTimeout(async () => { activateSplitScreenWrapped(); await restoreFeaturesFromURL(params); }, 0);
  } else {
    await restoreFeaturesFromURL(params);
  }

  // Load persisted user features
  loadUserFeaturesFromServer();
  splitToggle.addEventListener('click', function () {
    if (!state.isSplit) {
      activateSplitScreenWrapped();
      if (state.drawingMode === 'marker') { enableMarkerClickHandler(); }
      updatePermalinkWithFeatures();
    } else {
      deactivateSplitScreenWrapped();
      if (state.drawingMode === 'marker') { enableMarkerClickHandler(); }
      updatePermalinkWithFeatures();
    }
  });

  state.map.on('moveend', function () { if (!state.restoringFromPermalink && state.permalinkInitialized) { updatePermalinkWithFeatures(); } });
  import('ol/control').then(({ defaults }) => { defaults().extend([]).forEach(ctrl => state.map.addControl(ctrl)); });

  initOsmFeatureSearch();
  setupNominatimSearch();

  // Wire drawing buttons with wrapped permalink update that also updates header UI
  const permalinkUpdateWithHeader = () => {
    updatePermalinkWithFeatures();
    updateRemoveFeaturesButton();
    refreshDynamicOsmFeatures();
  };

  wireDrawButtons(permalinkUpdateWithHeader);
  wireRemoveFeaturesButton(permalinkUpdateWithHeader);

  await fetchOverlayCapabilities();

  // Re-mount layer manager now that overlay data is loaded
  if (!state.isSplit) {
    mountHeaderLayerManager(result);
  } else {
    mountSplitModeLayerManagers(result);
  }

  // Initialize OSM components
  createOSMPopup();

  import('./ui/activeLayers.js').then(({ createActiveLayersPanel, updateActiveLayersPanel }) => {
    createActiveLayersPanel();
    updateActiveLayersPanel();
  });

  import('./map/overlayInfoClick.js').then(({ enableOverlayInfoClickHandlers }) => enableOverlayInfoClickHandlers());
  setupOSMInteractions(state.map);

  async function restoreFeaturesFromURL(params) {
    state.restoringFromPermalink = true;
    state.drawingMode = null;
    // Deprecated: do not restore user markers/polygons from URL
    state.markerCoords = null;
    state.polygonCoords = null;
    state.lineCoords = null;
    if (params.line) {
      const coords = params.line.split(';').map(pair => pair.split(',').map(Number));
      if (coords.length >= 2 && coords.every(pair => pair.length === 2 && !isNaN(pair[0]) && !isNaN(pair[1]))) {
        state.lineCoords = coords.map(pair => fromLonLat([pair[0], pair[1]]));
      }
    }
    state.measureCoords = null;
    if (params.measure) {
      const coords = params.measure.split(';').map(pair => pair.split(',').map(Number));
      if (coords.length >= 2 && coords.every(pair => pair.length === 2 && !isNaN(pair[0]) && !isNaN(pair[1]))) {
        state.measureCoords = coords.map(pair => fromLonLat([pair[0], pair[1]]));
      }
    }
    state.overlayLayers = [];
    if (params.overlays) {
      state.overlayLayers = params.overlays.split(';').filter(Boolean);
      state.digiroadOverlayLayers = state.overlayLayers.filter(name => state.digiroadOverlayList.some(l => l.name === name));
      state.genericOverlayLayers = state.overlayLayers.filter(name => state.genericOverlayList.some(l => l.name === name));
      updateAllOverlays();
    }
    if (params.osm) {
      const ids = params.osm.split(';').filter(Boolean);
      state.osmSelectedIds = ids.filter(id => state.osmItems.some(i => i.id === id));
      updateOSMLegend();
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
    if (params.aircraft === '1') {
      state.aircraftEnabled = true;
      // Defer until maps are ready
      setTimeout(() => {
        import('./aircraft/aircraftManager.js').then(m => m.startAircraftUpdates());
        import('./aircraft/aircraftInteractions.js').then(m => m.setupAircraftClickHandlers());
      }, 100);
    }
    if (params.ais === '1') {
      state.aisEnabled = true;
      // Defer until maps are ready
      setTimeout(() => {
        import('./ais/aisManager.js').then(m => m.startAisUpdates());
      }, 100);
    }
    if (params.trainLocations === '1') {
      state.trainLocationsEnabled = true;
      setTimeout(() => {
        import('./trains/trainLocationsManager.js').then(m => m.startTrainLocationUpdates());
        import('./trains/trainLocationsInteractions.js').then(m => m.setupTrainLocationClickHandlers());
      }, 100);
    }
    if (params.trainStations === '1') {
      state.trainStationsEnabled = true;
      setTimeout(() => {
        import('./trains/trainStationsManager.js').then(m => m.startTrainStations());
        import('./trains/trainStationsInteractions.js').then(m => m.setupTrainStationClickHandlers());
      }, 100);
    }
    if (params.weather === '1') {
      state.weatherEnabled = true;
      // Parse display options (default to temperature if none specified)
      state.weatherShowTemperature = params.showTemp !== '0'; // Default true
      state.weatherShowWind = params.showWind === '1'; // Default false

      // If both showTemp and showWind are explicitly set to 0, disable both
      if (params.showTemp === '0' && params.showWind === '0') {
        state.weatherShowTemperature = false;
      }

      // Defer until maps are ready
      setTimeout(() => {
        import('./weather/weatherManager.js').then(m => m.startWeatherUpdates());
      }, 100);
    }
    if (params.radar === '1') {
      state.radarEnabled = true;
      // Defer until maps are ready
      setTimeout(() => {
        import('./radar/radarManager.js').then(m => {
          m.enableRadar();
        });
      }, 100);
    }
    if (params.uas === '1') {
      // Defer until maps are ready
      setTimeout(() => {
        import('./airspace/uasManager.js').then(m => m.startUAS());
        import('./airspace/uasInteractions.js').then(m => m.setupUASClickHandlers());
      }, 100);
    }
    showAllDrawables(showClickMarker);
    state.restoringFromPermalink = false;
    state.permalinkInitialized = true;
    updatePermalinkWithFeatures();
    updateHeaderActiveLayers();
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
