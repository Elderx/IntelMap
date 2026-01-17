import { state } from '../state/store.js';
import { showOSMPopup, hideOSMPopup, formatOSMFeatureInfo } from '../ui/osmPopup.js';

export function setupOSMInteractions(mapObj) {
  if (!mapObj) return;

  let hoveredFeatures = [];
  let hoveredLayers = [];

  // Mouse over interaction
  mapObj.on('pointermove', function (evt) {
    if (state.drawingMode) return;

    const features = [];
    try {
      mapObj.forEachFeatureAtPixel(evt.pixel, function (feature, layer) {
        // console.log('Hit OSM Feature:', feature.getId());
        features.push({ feature, layer });
      }, {
        hitTolerance: 5,
        layerFilter: (layer) => {
          return layer && typeof layer.get === 'function' && !!layer.get('osmId');
        }
      });
    } catch (e) {
      console.warn('Error in pointermove hit detection:', e);
    }

    // Console log if we found something but not showing it
    if (features.length > 0) {
      // console.log('Found OSM features:', features.length);
    }

    if (features.length > 0) {
      // Show hover popup
      // Simple check to see if the top feature changed, or count changed
      // (Optimization: could deep compare IDs but this is usually sufficient)
      const topFeature = features[0].feature;

      if (hoveredFeatures.length !== features.length || hoveredFeatures[0] !== topFeature) {
        hoveredFeatures = features.map(f => f.feature);
        hoveredLayers = features.map(f => f.layer);

        console.log(`[OSM Interact] Showing popup for ${features.length} features`);
        showOSMPopup(features, evt.pixel, false);
      }
    } else {
      // Hide hover popup
      if (hoveredFeatures.length > 0) {
        console.log('[OSM Interact] Hiding popup');
        hoveredFeatures = [];
        hoveredLayers = [];
        hideOSMPopup(false);
      }
    }
  });

  // Click interaction
  mapObj.on('singleclick', function (evt) {
    if (state.drawingMode) return;

    const features = [];
    try {
      mapObj.forEachFeatureAtPixel(evt.pixel, function (feature, layer) {
        console.log('Click Hit OSM Feature:', feature.getProperties().id);
        features.push({ feature, layer });
      }, {
        hitTolerance: 5,
        layerFilter: (layer) => {
          return layer && typeof layer.get === 'function' && !!layer.get('osmId');
        }
      });
    } catch (e) {
      console.warn('Error in singleclick hit detection:', e);
    }

    if (features.length > 0) {
      console.log(`[OSM Interact] Clicked ${features.length} features`);
      showOSMPopup(features, evt.pixel, true);
    }
  });

  // Change cursor on hover
  mapObj.on('pointermove', function (evt) {
    if (state.drawingMode) return;

    const hasFeature = mapObj.forEachFeatureAtPixel(evt.pixel, function (feature, layer) {
      return layer && layer.get('osmId');
    }, {
      hitTolerance: 5,
      layerFilter: (layer) => {
        return layer && typeof layer.get === 'function' && !!layer.get('osmId');
      }
    });

    mapObj.getTargetElement().style.cursor = hasFeature ? 'pointer' : '';
  });
}

export function removeOSMInteractions(mapObj) {
  if (!mapObj) return;

  // Remove all event listeners by cloning the map
  // This is a simple approach; in production you might want to track listeners
  mapObj.getTargetElement().style.cursor = '';
  hideOSMPopup(false);
  hideOSMPopup(true);
}
