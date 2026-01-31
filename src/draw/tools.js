import Draw from 'ol/interaction/Draw.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import CircleStyle from 'ol/style/Circle.js';
import Text from 'ol/style/Text.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import LineString from 'ol/geom/LineString.js';
import Circle from 'ol/geom/Circle.js';
import { fromLonLat, toLonLat } from 'ol/proj';
import { state } from '../state/store.js';
import { disableOverlayInfoClickHandlers, enableOverlayInfoClickHandlers } from '../map/overlayInfoClick.js';
import { showClickMarker, clearAllMarkers } from './markers.js';
import { showLine, showPolygon, showCircle, showMeasureLine, clearDrawnFeatures } from './showables.js';
import { createMeasureLabelOverlay, formatLength, createCircleLayer } from './helpers.js';
import { updatePermalinkWithFeatures } from '../map/permalink.js';
import { openUserFeatureForm } from '../ui/userFeatureForm.js';
import { addUserMarkerToMaps, addUserPolygonToMaps, addUserCircleToMaps } from '../user/userLayers.js';
import { createMarker, createPolygon, createCircle } from '../api/client.js';

export function enableMarkerClickHandler() {
  if (!state.isSplit) {
    if (!state.markerClickHandlerActive) {
      state.handleMapClick = function (evt) {
        console.log('[tools] Marker click detected', evt.coordinate);
        if (state.drawingMode === 'marker') {
          const coord = toLonLat(evt.coordinate);
          showClickMarker(coord[0], coord[1]);
          import('../api/client.js').then(async ({ fetchUsers }) => {
            console.log('[tools] Fetching users');
            const response = await fetchUsers();
            const users = Array.isArray(response) ? response : [];
            console.log('[tools] Opening form');
            openUserFeatureForm('marker', { title: '', description: '', color: '#00bcd4' }, async (meta) => { const payload = { lon: coord[0], lat: coord[1], title: meta.title, description: meta.description, color: meta.color, sharedUserIds: meta.sharedUserIds || [] }; const saved = await createMarker(payload); const marker = saved ? { id: saved.properties?.id, lon: payload.lon, lat: payload.lat, title: payload.title, description: payload.description, color: payload.color, ownerUsername: saved.properties?.owner_username || null, sharedUserIds: saved.properties?.shared_user_ids || [] } : { ...payload, ownerUsername: null, sharedUserIds: payload.sharedUserIds }; addUserMarkerToMaps(marker); }, () => { }, { users, ownerUsername: null });
          }).catch(e => console.error('[tools] Import failed', e));
        }
      };
      state.map.on('singleclick', state.handleMapClick);
      state.markerClickHandlerActive = true;
    }
  } else {
    if (state.leftMap && !state.markerClickHandlerActiveLeft) {
      state.handleMapClick = function (evt) { if (state.drawingMode === 'marker') { const coord = toLonLat(evt.coordinate); showClickMarker(coord[0], coord[1]); import('../api/client.js').then(async ({ fetchUsers }) => { const response = await fetchUsers(); const users = Array.isArray(response) ? response : []; openUserFeatureForm('marker', { title: '', description: '', color: '#00bcd4' }, async (meta) => { const payload = { lon: coord[0], lat: coord[1], title: meta.title, description: meta.description, color: meta.color, sharedUserIds: meta.sharedUserIds || [] }; const saved = await createMarker(payload); const marker = saved ? { id: saved.properties?.id, lon: payload.lon, lat: payload.lat, title: payload.title, description: payload.description, color: payload.color, ownerUsername: saved.properties?.owner_username || null, sharedUserIds: saved.properties?.shared_user_ids || [] } : { ...payload, ownerUsername: null, sharedUserIds: payload.sharedUserIds }; addUserMarkerToMaps(marker); }, () => { }, { users, ownerUsername: null }); }); } };
      state.leftMap.on('singleclick', state.handleMapClick);
      state.markerClickHandlerActiveLeft = true;
    }
    if (state.rightMap && !state.markerClickHandlerActiveRight) {
      state.handleMapClick = function (evt) { if (state.drawingMode === 'marker') { const coord = toLonLat(evt.coordinate); showClickMarker(coord[0], coord[1]); import('../api/client.js').then(async ({ fetchUsers }) => { const response = await fetchUsers(); const users = Array.isArray(response) ? response : []; openUserFeatureForm('marker', { title: '', description: '', color: '#00bcd4' }, async (meta) => { const payload = { lon: coord[0], lat: coord[1], title: meta.title, description: meta.description, color: meta.color, sharedUserIds: meta.sharedUserIds || [] }; const saved = await createMarker(payload); const marker = saved ? { id: saved.properties?.id, lon: payload.lon, lat: payload.lat, title: payload.title, description: payload.description, color: payload.color, ownerUsername: saved.properties?.owner_username || null, sharedUserIds: saved.properties?.shared_user_ids || [] } : { ...payload, ownerUsername: null, sharedUserIds: payload.sharedUserIds }; addUserMarkerToMaps(marker); }, () => { }, { users, ownerUsername: null }); }); } };
      state.rightMap.on('singleclick', state.handleMapClick);
      state.markerClickHandlerActiveRight = true;
    }
  }
}

export function disableMarkerClickHandler() {
  if (!state.isSplit) {
    if (state.markerClickHandlerActive) {
      state.map.un('singleclick', state.handleMapClick);
      state.markerClickHandlerActive = false;
    }
  } else {
    if (state.leftMap && state.markerClickHandlerActiveLeft) {
      state.leftMap.un('singleclick', state.handleMapClick);
      state.markerClickHandlerActiveLeft = false;
    }
    if (state.rightMap && state.markerClickHandlerActiveRight) {
      state.rightMap.un('singleclick', state.handleMapClick);
      state.markerClickHandlerActiveRight = false;
    }
  }
}

function clearDrawInteraction() {
  if (!state.isSplit) {
    if (state.drawInteraction && state.map) state.map.removeInteraction(state.drawInteraction);
  } else {
    if (state.drawInteraction && state.drawInteraction.left && state.leftMap) state.leftMap.removeInteraction(state.drawInteraction.left);
    if (state.drawInteraction && state.drawInteraction.right && state.rightMap) state.rightMap.removeInteraction(state.drawInteraction.right);
  }
  state.drawInteraction = null;
}

export function wireDrawButtons(updatePermalinkWithFeaturesFn) {
  const drawMenuToggle = document.getElementById('draw-menu-toggle');
  const drawMenu = document.getElementById('draw-menu');
  const drawMarkerBtn = document.getElementById('draw-marker-btn');
  const drawLineBtn = document.getElementById('draw-line-btn');
  const drawPolygonBtn = document.getElementById('draw-polygon-btn');
  const drawRadiusBtn = document.getElementById('draw-radius-btn');
  const drawMeasureBtn = document.getElementById('draw-measure-btn');

  drawMenuToggle.addEventListener('click', function () {
    const style = window.getComputedStyle(drawMenu);
    drawMenu.style.display = style.display === 'none' ? 'block' : 'none';
  });

  drawLineBtn.addEventListener('click', function () {
    state.drawingMode = 'line';
    clearAllMarkers();
    disableOverlayInfoClickHandlers();
    if (!state.isSplit) {
      clearDrawInteraction();
      clearDrawnFeatures('main', state.map);
      drawMenu.style.display = 'none';
      disableMarkerClickHandler();
      const vectorSource = new VectorSource();
      state.drawnLineLayer.main = new VectorLayer({ source: vectorSource, zIndex: 102, style: new Style({ stroke: new Stroke({ color: 'blue', width: 3 }) }) });
      state.map.addLayer(state.drawnLineLayer.main);
      const drawInteraction = new Draw({ source: vectorSource, type: 'LineString', maxPoints: 2 });
      drawInteraction.on('drawend', function (evt) {
        const coords = evt.feature.getGeometry().getCoordinates();
        showLine(coords);
        clearDrawInteraction();
        state.drawingMode = null;
        enableOverlayInfoClickHandlers();
        updatePermalinkWithFeaturesFn();
      });
      state.map.addInteraction(drawInteraction);
      state.drawInteraction = drawInteraction;
    } else {
      clearDrawInteraction();
      clearDrawnFeatures('left', state.leftMap);
      clearDrawnFeatures('right', state.rightMap);
      drawMenu.style.display = 'none';
      disableMarkerClickHandler();
      const vectorSourceLeft = new VectorSource();
      state.drawnLineLayer.left = new VectorLayer({ source: vectorSourceLeft, zIndex: 102, style: new Style({ stroke: new Stroke({ color: 'blue', width: 3 }) }) });
      state.leftMap.addLayer(state.drawnLineLayer.left);
      const vectorSourceRight = new VectorSource();
      state.drawnLineLayer.right = new VectorLayer({ source: vectorSourceRight, zIndex: 102, style: new Style({ stroke: new Stroke({ color: 'blue', width: 3 }) }) });
      state.rightMap.addLayer(state.drawnLineLayer.right);
      const drawInteractionLeft = new Draw({ source: vectorSourceLeft, type: 'LineString', maxPoints: 2 });
      drawInteractionLeft.on('drawend', function (evt) {
        const coords = evt.feature.getGeometry().getCoordinates();
        showLine(coords);
        clearDrawInteraction();
        state.drawingMode = null;
        enableOverlayInfoClickHandlers();
        updatePermalinkWithFeaturesFn();
      });
      state.leftMap.addInteraction(drawInteractionLeft);
      const drawInteractionRight = new Draw({ source: vectorSourceRight, type: 'LineString', maxPoints: 2 });
      drawInteractionRight.on('drawend', function (evt) {
        const coords = evt.feature.getGeometry().getCoordinates();
        showLine(coords);
        clearDrawInteraction();
        state.drawingMode = null;
        enableOverlayInfoClickHandlers();
        updatePermalinkWithFeaturesFn();
      });
      state.rightMap.addInteraction(drawInteractionRight);
      state.drawInteraction = { left: drawInteractionLeft, right: drawInteractionRight };
    }
  });

  drawPolygonBtn.addEventListener('click', function () {
    state.drawingMode = 'polygon';
    clearAllMarkers();
    disableOverlayInfoClickHandlers();
    if (!state.isSplit) {
      clearDrawInteraction();
      clearDrawnFeatures('main', state.map);
      drawMenu.style.display = 'none';
      disableMarkerClickHandler();
      const vectorSource = new VectorSource();
      state.drawnPolygonLayer.main = new VectorLayer({ source: vectorSource, zIndex: 103, style: new Style({ fill: new Fill({ color: 'rgba(0,200,255,0.5)' }), stroke: new Stroke({ color: 'blue', width: 2 }) }) });
      state.map.addLayer(state.drawnPolygonLayer.main);
      const drawInteraction = new Draw({ source: vectorSource, type: 'Polygon' });
      drawInteraction.on('drawend', function (evt) {
        const coords = evt.feature.getGeometry().getCoordinates()[0];
        showPolygon(coords);
        // Persist as user polygon with metadata
        let lonlat = coords.map(c => toLonLat(c));
        if (lonlat.length >= 3) {
          const first = lonlat[0];
          const last = lonlat[lonlat.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) lonlat = [...lonlat, first];
        }
        import('../api/client.js').then(async ({ fetchUsers }) => {
          const response = await fetchUsers();
          const users = Array.isArray(response) ? response : [];
          openUserFeatureForm('polygon', { title: '', description: '', color: '#ff9800' }, async (meta) => {
            const payload = { coordinates: lonlat, title: meta.title, description: meta.description, color: meta.color, sharedUserIds: meta.sharedUserIds || [] };
            const saved = await createPolygon(payload);
            const poly = saved ? { id: saved.properties?.id, coordinates: lonlat, title: meta.title, description: meta.description, color: meta.color, ownerUsername: saved.properties?.owner_username || null, sharedUserIds: saved.properties?.shared_user_ids || [] } : { coordinates: lonlat, title: meta.title, description: meta.description, color: meta.color, ownerUsername: null, sharedUserIds: payload.sharedUserIds };
            addUserPolygonToMaps(poly);
          }, () => { }, { users, ownerUsername: null });
        });
        clearDrawInteraction();
        state.drawingMode = null;
        enableOverlayInfoClickHandlers();
        updatePermalinkWithFeaturesFn();
      });
      state.map.addInteraction(drawInteraction);
      state.drawInteraction = drawInteraction;
    } else {
      clearDrawInteraction();
      clearDrawnFeatures('left', state.leftMap);
      clearDrawnFeatures('right', state.rightMap);
      drawMenu.style.display = 'none';
      disableMarkerClickHandler();
      const vectorSourceLeft = new VectorSource();
      state.drawnPolygonLayer.left = new VectorLayer({ source: vectorSourceLeft, zIndex: 103, style: new Style({ fill: new Fill({ color: 'rgba(0,200,255,0.5)' }), stroke: new Stroke({ color: 'blue', width: 2 }) }) });
      state.leftMap.addLayer(state.drawnPolygonLayer.left);
      const vectorSourceRight = new VectorSource();
      state.drawnPolygonLayer.right = new VectorLayer({ source: vectorSourceRight, zIndex: 103, style: new Style({ fill: new Fill({ color: 'rgba(0,200,255,0.5)' }), stroke: new Stroke({ color: 'blue', width: 2 }) }) });
      state.rightMap.addLayer(state.drawnPolygonLayer.right);
      const drawInteractionLeft = new Draw({ source: vectorSourceLeft, type: 'Polygon' });
      drawInteractionLeft.on('drawend', function (evt) {
        const coords = evt.feature.getGeometry().getCoordinates()[0];
        showPolygon(coords);
        let lonlat = coords.map(c => toLonLat(c));
        if (lonlat.length >= 3) {
          const first = lonlat[0];
          const last = lonlat[lonlat.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) lonlat = [...lonlat, first];
        }
        import('../api/client.js').then(async ({ fetchUsers }) => {
          const response = await fetchUsers();
          const users = Array.isArray(response) ? response : [];
          openUserFeatureForm('polygon', { title: '', description: '', color: '#ff9800' }, async (meta) => {
            const payload = { coordinates: lonlat, title: meta.title, description: meta.description, color: meta.color, sharedUserIds: meta.sharedUserIds || [] };
            const saved = await createPolygon(payload);
            const poly = saved ? { id: saved.properties?.id, coordinates: lonlat, title: meta.title, description: meta.description, color: meta.color, ownerUsername: saved.properties?.owner_username || null, sharedUserIds: saved.properties?.shared_user_ids || [] } : { coordinates: lonlat, title: meta.title, description: meta.description, color: meta.color, ownerUsername: null, sharedUserIds: payload.sharedUserIds };
            addUserPolygonToMaps(poly);
          }, () => { }, { users, ownerUsername: null });
        });
        clearDrawInteraction();
        state.drawingMode = null;
        enableOverlayInfoClickHandlers();
        updatePermalinkWithFeaturesFn();
      });
      state.leftMap.addInteraction(drawInteractionLeft);
      const drawInteractionRight = new Draw({ source: vectorSourceRight, type: 'Polygon' });
      drawInteractionRight.on('drawend', function (evt) {
        const coords = evt.feature.getGeometry().getCoordinates()[0];
        showPolygon(coords);
        let lonlat = coords.map(c => toLonLat(c));
        if (lonlat.length >= 3) {
          const first = lonlat[0];
          const last = lonlat[lonlat.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) lonlat = [...lonlat, first];
        }
        import('../api/client.js').then(async ({ fetchUsers }) => {
          const response = await fetchUsers();
          const users = Array.isArray(response) ? response : [];
          openUserFeatureForm('polygon', { title: '', description: '', color: '#ff9800' }, async (meta) => {
            const payload = { coordinates: lonlat, title: meta.title, description: meta.description, color: meta.color, sharedUserIds: meta.sharedUserIds || [] };
            const saved = await createPolygon(payload);
            const poly = saved ? { id: saved.properties?.id, coordinates: lonlat, title: meta.title, description: meta.description, color: meta.color, ownerUsername: saved.properties?.owner_username || null, sharedUserIds: saved.properties?.shared_user_ids || [] } : { coordinates: lonlat, title: meta.title, description: meta.description, color: meta.color, ownerUsername: null, sharedUserIds: payload.sharedUserIds };
            addUserPolygonToMaps(poly);
          }, () => { }, { users, ownerUsername: null });
        });
        clearDrawInteraction();
        state.drawingMode = null;
        enableOverlayInfoClickHandlers();
        updatePermalinkWithFeaturesFn();
      });
      state.rightMap.addInteraction(drawInteractionRight);
      state.drawInteraction = { left: drawInteractionLeft, right: drawInteractionRight };
    }
  });

  drawRadiusBtn.addEventListener('click', function () {
    state.drawingMode = 'radius';
    clearAllMarkers();
    disableOverlayInfoClickHandlers();
    if (!state.isSplit) {
      clearDrawInteraction();
      clearDrawnFeatures('main', state.map);
      drawMenu.style.display = 'none';
      disableMarkerClickHandler();
      const vectorSource = new VectorSource();
      state.drawnCircleLayer.main = new VectorLayer({ source: vectorSource, zIndex: 102, style: new Style({ stroke: new Stroke({ color: '#2196f3', width: 2 }), fill: new Fill({ color: 'rgba(33, 150, 243, 0.3)' }) }) });
      state.map.addLayer(state.drawnCircleLayer.main);

      let centerCoords = null;
      let previewCircle = null;
      let previewLine = null;
      let previewText = null;
      let pointerMoveHandler = null;

      state.map.on('singleclick', function onFirstClick(evt) {
        if (state.drawingMode !== 'radius') return;
        if (!centerCoords) {
          centerCoords = evt.coordinate;
          const centerFeature = new Feature({ geometry: new Point(centerCoords) });
          centerFeature.setStyle(new Style({ image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#2196f3' }), stroke: new Stroke({ color: '#fff', width: 2 }) }) }));
          vectorSource.addFeature(centerFeature);

          pointerMoveHandler = function(evt) {
            if (state.drawingMode !== 'radius' || !centerCoords) return;
            const radius = Math.sqrt(
              Math.pow(evt.coordinate[0] - centerCoords[0], 2) +
              Math.pow(evt.coordinate[1] - centerCoords[1], 2)
            );

            // Remove old preview features
            if (previewCircle) vectorSource.removeFeature(previewCircle);
            if (previewLine) vectorSource.removeFeature(previewLine);
            if (previewText) vectorSource.removeFeature(previewText);

            // Create circle preview
            previewCircle = new Feature({ geometry: new Circle(centerCoords, radius) });
            previewCircle.setStyle(new Style({ stroke: new Stroke({ color: '#2196f3', width: 2 }), fill: new Fill({ color: 'rgba(33, 150, 243, 0.3)' }) }));
            vectorSource.addFeature(previewCircle);

            // Create radius line preview
            const rightEdge = [centerCoords[0] + radius, centerCoords[1]];
            previewLine = new Feature({ geometry: new LineString([centerCoords, rightEdge]) });
            previewLine.setStyle(new Style({ stroke: new Stroke({ color: '#2196f3', width: 2, lineDash: [4, 4] }) }));
            vectorSource.addFeature(previewLine);

            // Create text label preview
            const radiusInMeters = Math.round(radius);
            const labelText = radiusInMeters > 1000
              ? (radiusInMeters / 1000).toFixed(2) + ' km'
              : radiusInMeters + ' m';
            previewText = new Feature({ geometry: new LineString([centerCoords, rightEdge]) });
            previewText.setStyle(new Style({
              text: new Text({
                text: labelText,
                font: 'bold 16px sans-serif',
                fill: new Fill({ color: '#FFFFFF' }),
                //stroke: new Stroke({ color: 'white', width: 4 }),
                offsetY: -12,
                textAlign: 'center'
              }),
              stroke: new Stroke({ color: 'rgba(0,0,0,0)', width: 0 })
            }));
            vectorSource.addFeature(previewText);
          };
          state.map.on('pointermove', pointerMoveHandler);
        } else {
          if (pointerMoveHandler) {
            state.map.un('pointermove', pointerMoveHandler);
          }
          const radius = Math.sqrt(
            Math.pow(evt.coordinate[0] - centerCoords[0], 2) +
            Math.pow(evt.coordinate[1] - centerCoords[1], 2)
          );
          const centerLonLat = toLonLat(centerCoords);
          showCircle(centerCoords, radius);
          state.map.un('singleclick', onFirstClick);
          state.drawingMode = null;
          enableOverlayInfoClickHandlers();
          updatePermalinkWithFeaturesFn();

          import('../api/client.js').then(async ({ fetchUsers }) => {
            const response = await fetchUsers();
            const users = Array.isArray(response) ? response : [];
            openUserFeatureForm('circle', { title: '', description: '', color: '#2196f3', opacity: 0.3 }, async (meta) => {
              const payload = { center: centerLonLat, radius, title: meta.title, description: meta.description, color: meta.color, opacity: meta.opacity, sharedUserIds: meta.sharedUserIds || [] };
              const saved = await createCircle(payload);
              const circle = saved ? { id: saved.properties?.id, center: centerLonLat, radius, title: meta.title, description: meta.description, color: meta.color, opacity: meta.opacity, ownerUsername: saved.properties?.owner_username || null, sharedUserIds: saved.properties?.shared_user_ids || [] } : { center: centerLonLat, radius, title: meta.title, description: meta.description, color: meta.color, opacity: meta.opacity, ownerUsername: null, sharedUserIds: payload.sharedUserIds };
              addUserCircleToMaps(circle);
            }, () => { }, { users, ownerUsername: null });
          });
        }
      });
    } else {
      clearDrawInteraction();
      clearDrawnFeatures('left', state.leftMap);
      clearDrawnFeatures('right', state.rightMap);
      drawMenu.style.display = 'none';
      disableMarkerClickHandler();
      const vectorSourceLeft = new VectorSource();
      state.drawnCircleLayer.left = new VectorLayer({ source: vectorSourceLeft, zIndex: 102, style: new Style({ stroke: new Stroke({ color: '#2196f3', width: 2 }), fill: new Fill({ color: 'rgba(33, 150, 243, 0.3)' }) }) });
      state.leftMap.addLayer(state.drawnCircleLayer.left);
      const vectorSourceRight = new VectorSource();
      state.drawnCircleLayer.right = new VectorLayer({ source: vectorSourceRight, zIndex: 102, style: new Style({ stroke: new Stroke({ color: '#2196f3', width: 2 }), fill: new Fill({ color: 'rgba(33, 150, 243, 0.3)' }) }) });
      state.rightMap.addLayer(state.drawnCircleLayer.right);

      let centerCoords = null;
      let previewCircleLeft = null;
      let previewLineLeft = null;
      let previewTextLeft = null;
      let previewCircleRight = null;
      let previewLineRight = null;
      let previewTextRight = null;
      let pointerMoveHandlerLeft = null;

      state.leftMap.on('singleclick', function onFirstClick(evt) {
        if (state.drawingMode !== 'radius') return;
        if (!centerCoords) {
          centerCoords = evt.coordinate;
          const centerFeature = new Feature({ geometry: new Point(centerCoords) });
          centerFeature.setStyle(new Style({ image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#2196f3' }), stroke: new Stroke({ color: '#fff', width: 2 }) }) }));
          vectorSourceLeft.addFeature(centerFeature);
          vectorSourceRight.addFeature(centerFeature.clone());

          pointerMoveHandlerLeft = function(evt) {
            if (state.drawingMode !== 'radius' || !centerCoords) return;
            const radius = Math.sqrt(
              Math.pow(evt.coordinate[0] - centerCoords[0], 2) +
              Math.pow(evt.coordinate[1] - centerCoords[1], 2)
            );

            // Remove old preview features from left map
            if (previewCircleLeft) vectorSourceLeft.removeFeature(previewCircleLeft);
            if (previewLineLeft) vectorSourceLeft.removeFeature(previewLineLeft);
            if (previewTextLeft) vectorSourceLeft.removeFeature(previewTextLeft);
            // Remove old preview features from right map
            if (previewCircleRight) vectorSourceRight.removeFeature(previewCircleRight);
            if (previewLineRight) vectorSourceRight.removeFeature(previewLineRight);
            if (previewTextRight) vectorSourceRight.removeFeature(previewTextRight);

            const rightEdge = [centerCoords[0] + radius, centerCoords[1]];
            const radiusInMeters = Math.round(radius);
            const labelText = radiusInMeters > 1000
              ? (radiusInMeters / 1000).toFixed(2) + ' km'
              : radiusInMeters + ' m';

            // Create circle preview
            previewCircleLeft = new Feature({ geometry: new Circle(centerCoords, radius) });
            previewCircleLeft.setStyle(new Style({ stroke: new Stroke({ color: '#2196f3', width: 2 }), fill: new Fill({ color: 'rgba(33, 150, 243, 0.3)' }) }));
            vectorSourceLeft.addFeature(previewCircleLeft);
            previewCircleRight = previewCircleLeft.clone();
            vectorSourceRight.addFeature(previewCircleRight);

            // Create radius line preview
            previewLineLeft = new Feature({ geometry: new LineString([centerCoords, rightEdge]) });
            previewLineLeft.setStyle(new Style({ stroke: new Stroke({ color: '#2196f3', width: 2, lineDash: [4, 4] }) }));
            vectorSourceLeft.addFeature(previewLineLeft);
            previewLineRight = previewLineLeft.clone();
            vectorSourceRight.addFeature(previewLineRight);

            // Create text label preview
            previewTextLeft = new Feature({ geometry: new LineString([centerCoords, rightEdge]) });
            previewTextLeft.setStyle(new Style({
              text: new Text({
                text: labelText,
                font: 'bold 16px sans-serif',
                fill: new Fill({ color: '#2196f3' }),
                stroke: new Stroke({ color: 'white', width: 4 }),
                offsetY: -12,
                textAlign: 'center'
              }),
              stroke: new Stroke({ color: 'rgba(0,0,0,0)', width: 0 })
            }));
            vectorSourceLeft.addFeature(previewTextLeft);
            previewTextRight = previewTextLeft.clone();
            vectorSourceRight.addFeature(previewTextRight);
          };
          state.leftMap.on('pointermove', pointerMoveHandlerLeft);
        } else {
          if (pointerMoveHandlerLeft) {
            state.leftMap.un('pointermove', pointerMoveHandlerLeft);
          }
          const radius = Math.sqrt(
            Math.pow(evt.coordinate[0] - centerCoords[0], 2) +
            Math.pow(evt.coordinate[1] - centerCoords[1], 2)
          );
          const centerLonLat = toLonLat(centerCoords);
          showCircle(centerCoords, radius);
          state.leftMap.un('singleclick', onFirstClick);
          state.drawingMode = null;
          enableOverlayInfoClickHandlers();
          updatePermalinkWithFeaturesFn();

          import('../api/client.js').then(async ({ fetchUsers }) => {
            const response = await fetchUsers();
            const users = Array.isArray(response) ? response : [];
            openUserFeatureForm('circle', { title: '', description: '', color: '#2196f3', opacity: 0.3 }, async (meta) => {
              const payload = { center: centerLonLat, radius, title: meta.title, description: meta.description, color: meta.color, opacity: meta.opacity, sharedUserIds: meta.sharedUserIds || [] };
              const saved = await createCircle(payload);
              const circle = saved ? { id: saved.properties?.id, center: centerLonLat, radius, title: meta.title, description: meta.description, color: meta.color, opacity: meta.opacity, ownerUsername: saved.properties?.owner_username || null, sharedUserIds: saved.properties?.shared_user_ids || [] } : { center: centerLonLat, radius, title: meta.title, description: meta.description, color: meta.color, opacity: meta.opacity, ownerUsername: null, sharedUserIds: payload.sharedUserIds };
              addUserCircleToMaps(circle);
            }, () => { }, { users, ownerUsername: null });
          });
        }
      });
    }
  });

  drawMeasureBtn.addEventListener('click', function () {
    state.drawingMode = 'measure';
    clearAllMarkers();
    disableOverlayInfoClickHandlers();
    if (!state.isSplit) {
      clearDrawInteraction();
      clearDrawnFeatures('main', state.map);
      drawMenu.style.display = 'none';
      disableMarkerClickHandler();
      const vectorSource = new VectorSource();
      state.measureLineLayer.main = new VectorLayer({ source: vectorSource, zIndex: 104, style: new Style({ stroke: new Stroke({ color: 'orange', width: 3, lineDash: [8, 8] }) }) });
      state.map.addLayer(state.measureLineLayer.main);
      const drawInteraction = new Draw({ source: vectorSource, type: 'LineString' });
      let labelOverlay = null;
      drawInteraction.on('drawstart', function (evt) {
        if (state.measureLabelOverlay.main && state.map) state.map.removeOverlay(state.measureLabelOverlay.main);
        const geom = evt.feature.getGeometry();
        geom.on('change', function () {
          const coords = geom.getCoordinates();
          if (coords.length > 1) {
            const len = formatLength(geom);
            if (!labelOverlay) {
              labelOverlay = createMeasureLabelOverlay(coords[coords.length - 1], len);
              state.map.addOverlay(labelOverlay);
            } else {
              labelOverlay.setPosition(coords[coords.length - 1]);
              labelOverlay.getElement().textContent = len;
            }
          }
        });
      });
      drawInteraction.on('drawend', function (evt) {
        const coords = evt.feature.getGeometry().getCoordinates();
        showMeasureLine(coords);
        clearDrawInteraction();
        state.drawingMode = null;
        enableOverlayInfoClickHandlers();
        updatePermalinkWithFeaturesFn();
      });
      state.map.addInteraction(drawInteraction);
      state.drawInteraction = drawInteraction;
    } else {
      clearDrawInteraction();
      clearDrawnFeatures('left', state.leftMap);
      clearDrawnFeatures('right', state.rightMap);
      drawMenu.style.display = 'none';
      disableMarkerClickHandler();
      const vectorSourceLeft = new VectorSource();
      state.measureLineLayer.left = new VectorLayer({ source: vectorSourceLeft, zIndex: 104, style: new Style({ stroke: new Stroke({ color: 'orange', width: 3, lineDash: [8, 8] }) }) });
      state.leftMap.addLayer(state.measureLineLayer.left);
      const vectorSourceRight = new VectorSource();
      state.measureLineLayer.right = new VectorLayer({ source: vectorSourceRight, zIndex: 104, style: new Style({ stroke: new Stroke({ color: 'orange', width: 3, lineDash: [8, 8] }) }) });
      state.rightMap.addLayer(state.measureLineLayer.right);
      const drawInteractionLeft = new Draw({ source: vectorSourceLeft, type: 'LineString' });
      let labelOverlayLeft = null; let rightFeature = null; let labelOverlayRight = null;
      drawInteractionLeft.on('drawstart', function (evt) {
        if (state.measureLabelOverlay.left && state.leftMap) state.leftMap.removeOverlay(state.measureLabelOverlay.left);
        if (state.measureLabelOverlay.right && state.rightMap) state.rightMap.removeOverlay(state.measureLabelOverlay.right);
        const geom = evt.feature.getGeometry();
        rightFeature = new Feature({ geometry: new LineString([]) });
        rightFeature.setStyle(new Style({ stroke: new Stroke({ color: 'orange', width: 3, lineDash: [8, 8] }) }));
        vectorSourceRight.clear();
        vectorSourceRight.addFeature(rightFeature);
        geom.on('change', function () {
          const coords = geom.getCoordinates();
          if (coords.length > 1) {
            const len = formatLength(geom);
            if (!labelOverlayLeft) { labelOverlayLeft = createMeasureLabelOverlay(coords[coords.length - 1], len); state.leftMap.addOverlay(labelOverlayLeft); }
            else { labelOverlayLeft.setPosition(coords[coords.length - 1]); labelOverlayLeft.getElement().textContent = len; }
            rightFeature.getGeometry().setCoordinates(coords);
            if (!labelOverlayRight) { labelOverlayRight = createMeasureLabelOverlay(coords[coords.length - 1], len); state.rightMap.addOverlay(labelOverlayRight); }
            else { labelOverlayRight.setPosition(coords[coords.length - 1]); labelOverlayRight.getElement().textContent = len; }
          }
        });
      });
      drawInteractionLeft.on('drawend', function (evt) {
        const coords = evt.feature.getGeometry().getCoordinates();
        showMeasureLine(coords);
        clearDrawInteraction();
        state.drawingMode = null;
        enableOverlayInfoClickHandlers();
        updatePermalinkWithFeaturesFn();
      });
      state.leftMap.addInteraction(drawInteractionLeft);
      const drawInteractionRight = new Draw({ source: vectorSourceRight, type: 'LineString' });
      let labelOverlayRight2 = null; let leftFeature = null; let labelOverlayLeft2 = null;
      drawInteractionRight.on('drawstart', function (evt) {
        if (state.measureLabelOverlay.right && state.rightMap) state.rightMap.removeOverlay(state.measureLabelOverlay.right);
        if (state.measureLabelOverlay.left && state.leftMap) state.leftMap.removeOverlay(state.measureLabelOverlay.left);
        const geom = evt.feature.getGeometry();
        leftFeature = new Feature({ geometry: new LineString([]) });
        leftFeature.setStyle(new Style({ stroke: new Stroke({ color: 'orange', width: 3, lineDash: [8, 8] }) }));
        vectorSourceLeft.clear(); vectorSourceLeft.addFeature(leftFeature);
        geom.on('change', function () {
          const coords = geom.getCoordinates();
          if (coords.length > 1) {
            const len = formatLength(geom);
            if (!labelOverlayRight2) { labelOverlayRight2 = createMeasureLabelOverlay(coords[coords.length - 1], len); state.rightMap.addOverlay(labelOverlayRight2); }
            else { labelOverlayRight2.setPosition(coords[coords.length - 1]); labelOverlayRight2.getElement().textContent = len; }
            leftFeature.getGeometry().setCoordinates(coords);
            if (!labelOverlayLeft2) { labelOverlayLeft2 = createMeasureLabelOverlay(coords[coords.length - 1], len); state.leftMap.addOverlay(labelOverlayLeft2); }
            else { labelOverlayLeft2.setPosition(coords[coords.length - 1]); labelOverlayLeft2.getElement().textContent = len; }
          }
        });
      });
      drawInteractionRight.on('drawend', function (evt) {
        const coords = evt.feature.getGeometry().getCoordinates();
        showMeasureLine(coords);
        clearDrawInteraction();
        state.drawingMode = null;
        enableOverlayInfoClickHandlers();
        updatePermalinkWithFeaturesFn();
      });
      state.rightMap.addInteraction(drawInteractionRight);
      state.drawInteraction = { left: drawInteractionLeft, right: drawInteractionRight };
    }
  });

  drawMarkerBtn.addEventListener('click', function () {
    state.drawingMode = 'marker';
    clearAllMarkers();
    clearDrawInteraction();
    clearDrawnFeatures('main', state.map);
    if (state.leftMap) clearDrawnFeatures('left', state.leftMap);
    if (state.rightMap) clearDrawnFeatures('right', state.rightMap);
    drawMenu.style.display = 'none';
    enableMarkerClickHandler();
    disableOverlayInfoClickHandlers();
  });
}

export function wireRemoveFeaturesButton(updatePermalinkWithFeaturesFn) {
  const removeFeaturesBtn = document.getElementById('remove-features-btn');
  if (removeFeaturesBtn) {
    removeFeaturesBtn.addEventListener('click', function () {
      clearDrawnFeatures('main', state.map);
      if (state.leftMap) clearDrawnFeatures('left', state.leftMap);
      if (state.rightMap) clearDrawnFeatures('right', state.rightMap);
      if (state.measureLineLayer.main && state.map) state.map.removeLayer(state.measureLineLayer.main);
      if (state.leftMap && state.measureLineLayer.left) state.leftMap.removeLayer(state.measureLineLayer.left);
      if (state.rightMap && state.measureLineLayer.right) state.rightMap.removeLayer(state.measureLineLayer.right);
      if (state.map && state.measureLabelOverlay.main) state.map.removeOverlay(state.measureLabelOverlay.main);
      if (state.leftMap && state.measureLabelOverlay.left) state.leftMap.removeOverlay(state.measureLabelOverlay.left);
      if (state.rightMap && state.measureLabelOverlay.right) state.rightMap.removeOverlay(state.measureLabelOverlay.right);
      if (state.clickMarkerLayer && state.map) state.map.removeLayer(state.clickMarkerLayer);
      if (state.searchMarkerLayer && state.map) state.map.removeLayer(state.searchMarkerLayer);
      if (state.leftClickMarkerLayer && state.leftMap) state.leftMap.removeLayer(state.leftClickMarkerLayer);
      if (state.rightClickMarkerLayer && state.rightMap) state.rightMap.removeLayer(state.rightClickMarkerLayer);
      if (state.leftSearchMarkerLayer && state.leftMap) state.leftMap.removeLayer(state.leftSearchMarkerLayer);
      if (state.rightSearchMarkerLayer && state.rightMap) state.rightMap.removeLayer(state.rightSearchMarkerLayer);
      state.clickMarkerLayer = null; state.searchMarkerLayer = null; state.leftClickMarkerLayer = null; state.rightClickMarkerLayer = null; state.leftSearchMarkerLayer = null; state.rightSearchMarkerLayer = null;
      state.markerCoords = null; state.lineCoords = null; state.polygonCoords = null; state.circleCoords = null; state.measureCoords = null;
      updatePermalinkWithFeaturesFn();
    });
  }
}


