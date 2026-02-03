/**
 * OSM Data API Client
 * Handles interaction with Taginfo for search and Overpass for data fetching
 */

import { tileCacheUrl } from '../config/constants.js';

// Taginfo API for searching tags
const TAGINFO_URL = 'https://taginfo.openstreetmap.org/api/4';

// Overpass API for fetching vector data
// Using multiple instances for failover and caching proxy if available
const OVERPASS_SERVERS = tileCacheUrl
    ? [
        `${tileCacheUrl}/osm-api/kumi/api/interpreter`,
        `${tileCacheUrl}/osm-api/de/api/interpreter`
    ]
    : [
        // Relative paths for Caddy proxy (production)
        '/osm-api/kumi/api/interpreter',
        '/osm-api/de/api/interpreter',
        // Fallback to direct external servers
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass-api.de/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
    ];

/**
 * Search for keys/values in Taginfo
 * @param {string} query - Use input query
 * @returns {Promise<Array>} List of tag suggestions
 */
export async function searchOsmTags(query) {
    if (!query || query.length < 2) return [];

    try {
        const limit = 10;
        const commonParams = `query=${encodeURIComponent(query)}&page=1&rp=${limit}&sortname=count_all&sortorder=desc&format=json_pretty`;

        // Fetch Keys (e.g. "highway") and Values (e.g. "amenity=cafe") in parallel
        const [keysRes, valuesRes] = await Promise.allSettled([
            fetch(`${TAGINFO_URL}/keys/all?${commonParams}`),
            fetch(`${TAGINFO_URL}/search/by_value?${commonParams}`)
        ]);

        let results = [];

        // Process Keys
        if (keysRes.status === 'fulfilled' && keysRes.value.ok) {
            const data = await keysRes.value.json();
            const keys = data.data.map(item => ({
                key: item.key,
                value: '*', // Special wildcard marker
                count: item.count_all,
                label: `${item.key}=*`,
                description: 'Any value'
            }));
            results = results.concat(keys);
        }

        // Process Values
        if (valuesRes.status === 'fulfilled' && valuesRes.value.ok) {
            const data = await valuesRes.value.json();
            const values = data.data.map(item => ({
                key: item.key,
                value: item.value,
                count: item.count_all,
                label: `${item.key}=${item.value}`,
                description: item.description || ''
            }));
            results = results.concat(values);
        }

        // Sort combined results by count
        return results.sort((a, b) => b.count - a.count).slice(0, 15);

    } catch (err) {
        console.warn('[OSM] Search failed:', err);
        return [];
    }
}

/**
 * Construct an Overpass QLL query for the given tag and bbox
 * @param {string} key - OSM key (e.g. 'amenity')
 * @param {string} value - OSM value (e.g. 'cafe') or '*' for wildcard
 * @param {Array} bbox - [minLon, minLat, maxLon, maxLat]
 * @returns {string} Overpass XML/QL query
 */
export function buildOverpassQuery(key, value, bbox) {
    // Use a timeout to prevent long queries (reduced for better responsiveness)
    const timeout = 180;
    // Snap coordinates to 6 decimal places (~10cm) to ensure stable cache keys
    const [minLon, minLat, maxLon, maxLat] = bbox.map(c => Math.round(c * 1000000) / 1000000);
    const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;

    let q = '';
    if (value === '*') {
        q = `[out:json][timeout:${timeout}];(node["${key}"](${bboxStr});way["${key}"](${bboxStr});relation["${key}"](${bboxStr}););out geom;`;
    } else {
        q = `[out:json][timeout:${timeout}];(node["${key}"="${value}"](${bboxStr});way["${key}"="${value}"](${bboxStr});relation["${key}"="${value}"](${bboxStr}););out geom;`;
    }
    return q;
}

/**
 * Fetch data from Overpass API with failover
 * @param {string} query - Overpass QL query
 * @returns {Promise<Object>} GeoJSON-like structure (Overpass JSON)
 */
export async function fetchOverpassData(query) {
    let lastError;

    for (const serverUrl of OVERPASS_SERVERS) {
        let timer;
        try {
            const controller = new AbortController();
            timer = setTimeout(() => controller.abort(), 120000); // 120s (2m) for large data blocks

            // Use GET with ?data= specifically to allow Nginx caching
            // Overpass supports large queries in GET via this parameter
            const url = `${serverUrl}?data=${encodeURIComponent(query)}`;

            const startTime = performance.now();
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });

            const duration = (performance.now() - startTime).toFixed(0);
            const cacheStatus = (response.headers.get('X-Cache-Status') || 'MISS').toUpperCase();

            // Mapping for better color-coded observability
            const statusConfig = {
                'HIT': { color: '#4CAF50', label: 'HIT', warn: false },
                'MISS': { color: '#FF9800', label: 'MISS (REMOTE REQUEST)', warn: true },
                'EXPIRED': { color: '#2196F3', label: 'EXPIRED (REVALIDATING)', warn: true },
                'STALE': { color: '#9C27B0', label: 'STALE (SERVED FROM DISK)', warn: false },
                'UPDATING': { color: '#00BCD4', label: 'UPDATING (BACKGROUND FETCH)', warn: false },
                'REVALIDATED': { color: '#009688', label: 'REVALIDATED', warn: false },
                'BYPASS': { color: '#f44336', label: 'BYPASS (FORCE REFRESH)', warn: true }
            };

            const cfg = statusConfig[cacheStatus] || { color: '#757575', label: cacheStatus, warn: true };

            if (!cfg.warn) {
                console.log(`%c[OSM CACHE] ${cfg.label} (${duration}ms)`, `color: ${cfg.color}; font-weight: bold;`);
            } else {
                console.warn(`%c[OSM CACHE] ${cfg.label} (${duration}ms) - DOWNLOAD LIKELY: ${url}`, `color: white; background: ${cfg.color}; padding: 2px 6px; border-radius: 3px; font-weight: bold;`);
            }

            clearTimeout(timer);

            if (!response.ok) {
                console.warn(`[OSM] Server ${serverUrl} busy/error: ${response.status}`);
                if (response.status === 429 || response.status === 504 || response.status === 502) {
                    continue;
                }
                throw new Error(`Overpass error: ${response.status}`);
            }

            const data = await response.json();

            if (data.remark && data.remark.includes('runtime error')) {
                console.warn(`[OSM] Server ${serverUrl} reported runtime error: ${data.remark}`);
                throw new Error(data.remark);
            }

            return data;

        } catch (err) {
            if (timer) clearTimeout(timer);
            const msg = err.name === 'AbortError' ? 'Timeout' : err.message;
            console.warn(`[OSM] Failed to fetch from ${serverUrl}:`, msg);
            lastError = err;
        }
    }

    throw lastError || new Error('All Overpass servers failed');
}
