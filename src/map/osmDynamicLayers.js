import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { tile as tileStrategy } from 'ol/loadingstrategy.js';
import { createXYZ } from 'ol/tilegrid.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import CircleStyle from 'ol/style/Circle.js';
import { transformExtent } from 'ol/proj';
import { buildOverpassQuery, fetchOverpassData } from '../api/osm.js';
import { state } from '../state/store.js';

// Format for parsing Overpass JSON
// Overpass returns non-standard JSON, so we need a custom parser or just
// use osmtogeojson library? 
// For simplicity without external deps, we'll try to map Overpass JSON to OL features manually
// OR use a lighter approach: just use GeoJSON format if we can convert it.
// Actually, using a simple client-side conversion for basic points/lines/polys is feasible.

/**
 * Convert Overpass JSON to OpenLayers Features
 * Note: Relations are complex, this simple parser handles nodes and ways mostly
 */
function overpassToFeatures(data) {
    const features = [];
    const nodes = {}; // map id -> [lon, lat]

    // First pass: collect nodes
    if (data.elements) {
        data.elements.forEach(el => {
            if (el.type === 'node') {
                nodes[el.id] = [el.lon, el.lat];
                // If it has tags, it's also a point feature of interest
                if (el.tags) {
                    features.push({
                        type: 'Feature',
                        id: 'node/' + el.id,
                        properties: el.tags,
                        geometry: {
                            type: 'Point',
                            coordinates: [el.lon, el.lat]
                        }
                    });
                }
            }
        });

        // Second pass: ways
        data.elements.forEach(el => {
            if (el.type === 'way' && el.geometry) {
                // "layout": "geom" in query gives us geometry in way directly
                // Assuming we use [out:json]; ... out geom;
                const coords = el.geometry.map(pt => [pt.lon, pt.lat]);

                // rudimentary heuristic for polygon vs line: assumes closed way is polygon if area keys present
                // or just treat all closed ways as polygons for filling?
                const isClosed = coords.length > 2 &&
                    coords[0][0] === coords[coords.length - 1][0] &&
                    coords[0][1] === coords[coords.length - 1][1];

                features.push({
                    type: 'Feature',
                    id: 'way/' + el.id,
                    properties: el.tags,
                    geometry: {
                        type: isClosed ? 'Polygon' : 'LineString',
                        coordinates: isClosed ? [coords] : coords
                    }
                });
            }
        });
    }

    return (new GeoJSON()).readFeatures({
        type: 'FeatureCollection',
        features: features
    }, { featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
}

/**
 * Create a dynamic vector layer for an OSM feature tag
 * @param {Object} feature - { key, value, color, id }
 * @returns {VectorLayer} Active OpenLayers vector layer
 */
export function createOsmDynamicLayer(feature) {
    // INCREASED tile size to 1024px to reduce the number of concurrent requests
    // and prevent clogging the browser connection limit.
    const tileGrid = createXYZ({
        tileSize: 1024,
        maxZoom: 20
    });

    const source = new VectorSource({
        strategy: tileStrategy(tileGrid),
        loader: async function (extent, resolution, projection, success, failure) {
            // Transform the stable tile extent to LonLat for Overpass
            const bbox = transformExtent(extent, projection, 'EPSG:4326');

            const query = buildOverpassQuery(feature.key, feature.value, bbox);

            try {
                const data = await fetchOverpassData(query);
                const features = overpassToFeatures(data);

                console.log(`[OSM] Tile ${extent.map(Math.round).join(',')} loaded (${features.length} features).`);

                if (features.length > 0) {
                    this.addFeatures(features);
                }
                success(features);
            } catch (err) {
                console.error(`[OSM] Tile loader error:`, err);
                failure();
            }
        }
    });

    const style = new Style({
        image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color: feature.color }),
            stroke: new Stroke({ color: 'white', width: 2 })
        }),
        stroke: new Stroke({
            color: feature.color,
            width: 3
        }),
        fill: new Fill({
            color: hexToRgba(feature.color, 0.2)
        })
    });

    const layer = new VectorLayer({
        source: source,
        style: style,
        zIndex: 150, // Above normal overlays, below user markers
        visible: true
    });

    layer.set('osmFeatureId', feature.id);

    return layer;
}

// Helper for color opacity
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Manage active dynamic layers
 */
export function updateOsmDynamicLayers() {
    const activeFeatures = state.activeOsmFeatures || [];
    const mapGroups = ['main', 'left', 'right'];

    // Initialize storage if needed
    if (!state.osmDynamicLayerObjects) state.osmDynamicLayerObjects = { main: [], left: [], right: [] };

    mapGroups.forEach(key => {
        let map = null;
        if (key === 'main') map = state.map;
        if (key === 'left') map = state.leftMap;
        if (key === 'right') map = state.rightMap;

        if (!map) return;

        const existingLayers = state.osmDynamicLayerObjects[key] || [];

        // Remove layers that are no longer active
        const toRemove = existingLayers.filter(l => !activeFeatures.find(f => f.id === l.get('osmFeatureId')));
        toRemove.forEach(l => {
            map.removeLayer(l);
            const idx = state.osmDynamicLayerObjects[key].indexOf(l);
            if (idx > -1) state.osmDynamicLayerObjects[key].splice(idx, 1);
        });

        // Add new layers
        activeFeatures.forEach(feature => {
            const exists = state.osmDynamicLayerObjects[key].find(l => l.get('osmFeatureId') === feature.id);
            if (!exists) {
                const layer = createOsmDynamicLayer(feature);
                map.addLayer(layer);
                state.osmDynamicLayerObjects[key].push(layer);
            }
        });
    });

    // Update the UI panel
    import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
}
