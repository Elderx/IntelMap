import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { bbox as bboxStrategy } from 'ol/loadingstrategy.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import CircleStyle from 'ol/style/Circle.js';
import { transformExtent } from 'ol/proj';
import { buildOverpassQuery, fetchOverpassData } from '../api/osm.js';
import { state } from '../state/store.js';

/**
 * Convert Overpass JSON to OpenLayers Features
 */
function overpassToFeatures(data) {
    const features = [];
    if (!data.elements) return [];

    // First pass: nodes
    data.elements.forEach(el => {
        if (el.type === 'node' && el.tags) {
            features.push({
                type: 'Feature',
                id: 'node/' + el.id,
                properties: el.tags,
                geometry: { type: 'Point', coordinates: [el.lon, el.lat] }
            });
        }
    });

    // Second pass: ways
    data.elements.forEach(el => {
        if (el.type === 'way' && el.geometry) {
            const coords = el.geometry.map(pt => [pt.lon, pt.lat]);
            // Use epsilon for float comparison to detect closed loops accurately
            const epsilon = 0.0000001;
            const isClosed = coords.length > 2 &&
                Math.abs(coords[0][0] - coords[coords.length - 1][0]) < epsilon &&
                Math.abs(coords[0][1] - coords[coords.length - 1][1]) < epsilon;

            // Helpful debug log for geometry types
            // if (!isClosed && coords.length > 2 && el.tags && (el.tags.landuse || el.tags.building)) {
            //    console.log('Open way with landuse/building tags:', el.id, el.tags);
            // }

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

    // Third pass: relations (Multipolygons/Boundaries)
    data.elements.forEach(el => {
        if (el.type === 'relation' && el.members) {
            const polygons = [];
            el.members.forEach(m => {
                if (m.type === 'way' && m.geometry) {
                    polygons.push(m.geometry.map(pt => [pt.lon, pt.lat]));
                }
            });

            if (polygons.length > 0) {
                features.push({
                    type: 'Feature',
                    id: 'relation/' + el.id,
                    properties: el.tags,
                    geometry: {
                        type: 'MultiPolygon',
                        coordinates: [polygons]
                    }
                });
            }
        }
    });

    return (new GeoJSON()).readFeatures({
        type: 'FeatureCollection',
        features: features
    }, { featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
}

// Tile-based caching: Fixed grid tiles that can be cached and reused
// Using 1.0 degree tiles (~111km at equator) for reliable caching
const TILE_SIZE = 1.0;
const MAX_TILES_PER_LOAD = 9; // 3x3 grid max

// In-memory cache of known tiles (populated from database on init)
const loadedTilesRegistry = new Map(); // layerId -> Set<tileKey>

// Import database API functions
import { fetchCachedTiles, markTileAsCached, clearTileCacheFromDb } from '../api/client.js';

/**
 * Initialize tile cache from database for a layer
 * Called when creating a new layer to restore known cached tiles
 */
async function initTileCacheFromDb(layerId) {
    try {
        const cachedTiles = await fetchCachedTiles(layerId);
        if (cachedTiles && cachedTiles.length > 0) {
            const tileSet = new Set(cachedTiles.map(t => t.tile_key));
            loadedTilesRegistry.set(layerId, tileSet);
            console.log(`%c[OSM CACHE] Restored ${tileSet.size} tiles for ${layerId} from database`, 'color: #4CAF50; font-weight: bold;');
            return tileSet;
        }
    } catch (e) {
        console.warn('[OSM CACHE] Failed to load tiles from database:', e);
    }
    loadedTilesRegistry.set(layerId, new Set());
    return new Set();
}

/**
 * Mark a tile as cached (in-memory + database)
 */
async function saveTileToDb(layerId, tileKey, bbox, featureCount) {
    // Update in-memory first (immediate)
    if (!loadedTilesRegistry.has(layerId)) {
        loadedTilesRegistry.set(layerId, new Set());
    }
    loadedTilesRegistry.get(layerId).add(tileKey);

    // Then persist to database (async, fire-and-forget)
    markTileAsCached(layerId, tileKey, bbox, featureCount).catch(e => {
        console.warn('[OSM CACHE] Failed to save tile to database:', e);
    });
}

/**
 * Clear the tile cache for all layers (in-memory + database)
 */
export async function clearAllTileCache() {
    loadedTilesRegistry.clear();
    await clearTileCacheFromDb();
    console.log('[OSM CACHE] Cleared all tile cache');
}

/**
 * Clear cache for a specific layer
 */
export async function clearTileCache(layerId) {
    if (loadedTilesRegistry.has(layerId)) {
        loadedTilesRegistry.delete(layerId);
    }
    await clearTileCacheFromDb(layerId);
    console.log(`[OSM CACHE] Cleared tile cache for ${layerId}`);
}

/**
 * Calculate which tile a center point falls into
 * This is deterministic - same center = same tile = same cache key
 */
function getTileForCenter(centerLon, centerLat) {
    const tileMinLon = Math.floor(centerLon / TILE_SIZE) * TILE_SIZE;
    const tileMinLat = Math.floor(centerLat / TILE_SIZE) * TILE_SIZE;
    const tileMaxLon = tileMinLon + TILE_SIZE;
    const tileMaxLat = tileMinLat + TILE_SIZE;

    return {
        key: `${tileMinLon},${tileMinLat}`,
        bbox: [tileMinLon, tileMinLat, tileMaxLon, tileMaxLat]
    };
}

/**
 * Generate tile keys for a given bbox
 * Returns array of tile identifiers like "23.5,60.0" (minLon,minLat)
 */
function getTilesForBbox(bbox) {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const tiles = [];

    const startLon = Math.floor(minLon / TILE_SIZE) * TILE_SIZE;
    const startLat = Math.floor(minLat / TILE_SIZE) * TILE_SIZE;
    const endLon = Math.ceil(maxLon / TILE_SIZE) * TILE_SIZE;
    const endLat = Math.ceil(maxLat / TILE_SIZE) * TILE_SIZE;

    for (let lon = startLon; lon < endLon; lon += TILE_SIZE) {
        for (let lat = startLat; lat < endLat; lat += TILE_SIZE) {
            // Round to 1 decimal to avoid floating point issues
            const tileMinLon = Math.round(lon * 10) / 10;
            const tileMinLat = Math.round(lat * 10) / 10;
            const tileMaxLon = Math.round((lon + TILE_SIZE) * 10) / 10;
            const tileMaxLat = Math.round((lat + TILE_SIZE) * 10) / 10;

            tiles.push({
                key: `${tileMinLon},${tileMinLat}`,
                bbox: [tileMinLon, tileMinLat, tileMaxLon, tileMaxLat]
            });
        }
    }
    return tiles;
}

/**
 * Create a dynamic vector layer for an OSM feature tag
 * Uses tile-based loading strategy for proper cache utilization
 */
export function createOsmDynamicLayer(feature) {
    // Unique ID for this layer's tile tracking
    const layerId = `${feature.key}=${feature.value}`;

    // Initialize from database if not already loaded
    if (!loadedTilesRegistry.has(layerId)) {
        loadedTilesRegistry.set(layerId, new Set());
        // Async init from database (tiles will be available for next strategy call)
        initTileCacheFromDb(layerId);
    }
    const loadedTiles = loadedTilesRegistry.get(layerId);

    /**
     * Tile-based strategy: Returns fixed grid tiles that overlap the viewport.
     * Each tile has consistent coordinates = consistent cache keys = cache HITs!
     */
    const tileStrategy = function (extent, resolution) {
        const bbox = transformExtent(extent, 'EPSG:3857', 'EPSG:4326');
        const allTiles = getTilesForBbox(bbox);

        // Filter out already-loaded tiles
        const newTiles = allTiles.filter(t => !loadedTiles.has(t.key));

        if (newTiles.length === 0) {
            console.log(`%c[OSM TILES] All ${allTiles.length} tiles already cached for ${layerId}`, 'color: #4CAF50; font-weight: bold;');
            return []; // Nothing new to load
        }

        // Limit tiles to prevent API overload
        const tilesToLoad = newTiles.slice(0, MAX_TILES_PER_LOAD);

        if (newTiles.length > MAX_TILES_PER_LOAD) {
            console.warn(`[OSM TILES] Limiting to ${MAX_TILES_PER_LOAD} tiles (${newTiles.length} needed) - pan/zoom to load more`);
        } else {
            console.log(`[OSM TILES] Loading ${tilesToLoad.length} new tiles (${allTiles.length - newTiles.length} cached)`);
        }

        return tilesToLoad.map(t => transformExtent(t.bbox, 'EPSG:4326', 'EPSG:3857'));
    };

    const source = new VectorSource({
        strategy: tileStrategy,
        loader: async function (extent, resolution, projection, success, failure) {
            const bbox = transformExtent(extent, projection, 'EPSG:4326');

            // Use center-point to determine tile - this is DETERMINISTIC
            const centerLon = (bbox[0] + bbox[2]) / 2;
            const centerLat = (bbox[1] + bbox[3]) / 2;
            const tile = getTileForCenter(centerLon, centerLat);
            const tileKey = tile.key;
            const tileBbox = tile.bbox;

            // Skip if already loaded (race condition protection)
            if (loadedTiles.has(tileKey)) {
                console.log(`%c[OSM TILES] Skipping already-cached tile ${tileKey}`, 'color: #9E9E9E;');
                success([]);
                return;
            }

            // LOCAL ONLY MODE: Skip tiles not in cache
            if (state.osmLocalOnlyMode) {
                console.log(`%c[OSM TILES] LOCAL ONLY: Skipping uncached tile ${tileKey}`, 'color: #FF9800; font-weight: bold;');
                success([]);
                return;
            }

            const query = buildOverpassQuery(feature.key, feature.value, tileBbox);

            try {
                const data = await fetchOverpassData(query);
                const features = overpassToFeatures(data);

                // Mark tile as loaded in memory and persist to database
                loadedTiles.add(tileKey);
                saveTileToDb(layerId, tileKey, tileBbox, features.length);

                console.log(`[OSM TILES] Tile ${tileKey} loaded (${features.length} features)`);

                if (features.length > 0) {
                    this.addFeatures(features);
                }
                success(features);
            } catch (err) {
                console.error(`[OSM TILES] Tile ${tileKey} error:`, err);
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
        stroke: new Stroke({ color: feature.color, width: 3 }),
        fill: new Fill({ color: hexToRgba(feature.color, 0.2) })
    });

    const layer = new VectorLayer({
        source: source,
        style: style,
        zIndex: 150,
        visible: true
    });

    layer.set('osmFeatureId', feature.id || layerId);
    layer.set('osmId', feature.id || layerId); // Required for interaction detection, fallback to layerId if feature.id is missing
    layer.set('osmTitle', feature.title); // Display name
    layer.set('osmColor', feature.color); // Display color
    layer.set('osmLayerId', layerId); // Store for cleanup
    return layer;
}

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
    let activeFeatures = [...(state.activeOsmFeatures || [])];

    // Merge features from active layer groups
    (state.activeLayerGroupIds || []).forEach(groupId => {
        const group = state.layerGroups.find(g => g.id === groupId);
        if (!group || !group.config || !group.config.activeOsmFeatures) return;

        const groupColor = state.layerGroupAssignedColors[groupId] || '#e6194b';

        group.config.activeOsmFeatures.forEach(f => {
            // Add as a separate entry or override color if already present?
            // User said "layer on top of eachother" and "color differently".
            // So we add them as unique features for this group.
            activeFeatures.push({
                ...f,
                id: `${groupId}_${f.key}_${f.value}`,
                groupId: groupId,
                color: groupColor, // Override with group color
                visible: true
            });
        });
    });

    const mapGroups = ['main', 'left', 'right'];

    if (!state.osmDynamicLayerObjects) state.osmDynamicLayerObjects = { main: [], left: [], right: [] };

    mapGroups.forEach(key => {
        let map = (key === 'main') ? state.map : (key === 'left' ? state.leftMap : state.rightMap);
        if (!map) return;

        const existingLayers = state.osmDynamicLayerObjects[key] || [];

        // Remove old layers and clear their tile caches
        existingLayers.filter(l => !activeFeatures.find(f => f.id === l.get('osmFeatureId'))).forEach(l => {
            map.removeLayer(l);
            const idx = state.osmDynamicLayerObjects[key].indexOf(l);
            if (idx > -1) state.osmDynamicLayerObjects[key].splice(idx, 1);

            // Clear tile registry for this removed layer (only once, on first map group)
            if (key === 'main') {
                const layerIdToRemove = l.get('osmLayerId');
                if (layerIdToRemove) {
                    clearTileCache(layerIdToRemove);
                }
            }
        });

        // Add new
        activeFeatures.forEach(feature => {
            if (!state.osmDynamicLayerObjects[key].find(l => l.get('osmFeatureId') === feature.id)) {
                const layer = createOsmDynamicLayer(feature);
                map.addLayer(layer);
                state.osmDynamicLayerObjects[key].push(layer);
            }
        });
    });

    import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
}
