import VectorSource from 'ol/source/Vector.js';
import VectorLayer from 'ol/layer/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import CircleStyle from 'ol/style/Circle.js';
import { fromLonLat } from 'ol/proj';
import { state } from '../state/store.js';

function ensureLayersForMap(mapKey, mapObj) {
  if (!mapObj) return;
  if (!state.userMarkerLayer[mapKey]) {
    state.userMarkerLayer[mapKey] = new VectorLayer({ source: new VectorSource(), zIndex: 200 });
    mapObj.addLayer(state.userMarkerLayer[mapKey]);
  }
  if (!state.userPolygonLayer[mapKey]) {
    state.userPolygonLayer[mapKey] = new VectorLayer({ source: new VectorSource(), zIndex: 190 });
    mapObj.addLayer(state.userPolygonLayer[mapKey]);
  }
}

export function ensureUserLayers() {
  ensureLayersForMap('main', state.map);
  ensureLayersForMap('left', state.leftMap);
  ensureLayersForMap('right', state.rightMap);
}

function markerStyle(color) {
  return new Style({
    image: new CircleStyle({ radius: 6, fill: new Fill({ color }), stroke: new Stroke({ color: '#fff', width: 2 }) })
  });
}

function hexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function polygonStyle(color) {
  return new Style({
    stroke: new Stroke({ color, width: 2 }),
    fill: new Fill({ color: hexToRgba(color, 0.2) })
  });
}

function drawMarkerOnMapKey(marker, key) {
  const mapObj = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
  if (!mapObj) return;
  ensureLayersForMap(key, mapObj);
  const feat = new Feature({ geometry: new Point(fromLonLat([marker.lon, marker.lat])) });
  feat.set('userType', 'marker');
  feat.set('dbId', marker.id);
  feat.set('title', marker.title || '');
  feat.set('description', marker.description || '');
  feat.set('color', marker.color || '#00bcd4');
  if (marker.ownerUsername) feat.set('ownerUsername', marker.ownerUsername);
  if (Array.isArray(marker.sharedUserIds)) feat.set('sharedUserIds', marker.sharedUserIds);
  feat.setStyle(markerStyle(marker.color || '#00bcd4'));
  state.userMarkerLayer[key].getSource().addFeature(feat);
}

function drawPolygonOnMapKey(poly, key) {
  const mapObj = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
  if (!mapObj) return;
  ensureLayersForMap(key, mapObj);
  const ringLonLat = poly.coordinates;
  const ring = ringLonLat.map(([lon, lat]) => fromLonLat([lon, lat]));
  const feat = new Feature({ geometry: new Polygon([ring]) });
  feat.set('userType', 'polygon');
  feat.set('dbId', poly.id);
  feat.set('title', poly.title || '');
  feat.set('description', poly.description || '');
  feat.set('color', poly.color || '#ff9800');
  if (poly.ownerUsername) feat.set('ownerUsername', poly.ownerUsername);
  if (Array.isArray(poly.sharedUserIds)) feat.set('sharedUserIds', poly.sharedUserIds);
  feat.setStyle(polygonStyle(poly.color || '#ff9800'));
  state.userPolygonLayer[key].getSource().addFeature(feat);
}

export function addUserMarkerToMaps(marker) {
  state.userMarkers.push(marker);
  ['main','left','right'].forEach(key => drawMarkerOnMapKey(marker, key));
}

export function addUserPolygonToMaps(poly) {
  state.userPolygons.push(poly);
  ['main','left','right'].forEach(key => drawPolygonOnMapKey(poly, key));
}

export function updateUserMarkerById(id, changes) {
  state.userMarkers = state.userMarkers.map(m => m.id === id ? { ...m, ...changes } : m);
  rebuildUserLayersAllMaps();
}

export function updateUserPolygonById(id, changes) {
  state.userPolygons = state.userPolygons.map(p => p.id === id ? { ...p, ...changes } : p);
  rebuildUserLayersAllMaps();
}

export function removeUserMarkerById(id) {
  state.userMarkers = state.userMarkers.filter(m => m.id !== id);
  rebuildUserLayersAllMaps();
}

export function removeUserPolygonById(id) {
  state.userPolygons = state.userPolygons.filter(p => p.id !== id);
  rebuildUserLayersAllMaps();
}

export function rebuildUserLayersAllMaps() {
  ['main','left','right'].forEach(key => {
    const mapObj = key === 'main' ? state.map : key === 'left' ? state.leftMap : state.rightMap;
    if (!mapObj) return;
    ensureLayersForMap(key, mapObj);
    state.userMarkerLayer[key].getSource().clear();
    state.userPolygonLayer[key].getSource().clear();
  });
  state.userMarkers.forEach(m => ['main','left','right'].forEach(k => drawMarkerOnMapKey(m, k)));
  state.userPolygons.forEach(p => ['main','left','right'].forEach(k => drawPolygonOnMapKey(p, k)));
}
