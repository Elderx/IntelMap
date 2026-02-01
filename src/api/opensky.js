/**
 * OpenSky Network API Client
 * Fetches live aircraft state vectors
 */

import { OPENSKY_CONFIG } from '../config/constants.js';
import { state } from '../state/store.js';

/**
 * Build OpenSky API URL with bounding box parameters
 * @param {Array} bbox - [minLon, minLat, maxLon, maxLat] in WGS84
 * @returns {string} Full API URL
 */
export function buildOpenSkyUrl(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const url = new URL(`${OPENSKY_CONFIG.baseUrl}/states/all`);

  // Round to 6 decimal places for consistent caching
  url.searchParams.set('lamin', minLat.toFixed(6));
  url.searchParams.set('lomin', minLon.toFixed(6));
  url.searchParams.set('lamax', maxLat.toFixed(6));
  url.searchParams.set('lomax', maxLon.toFixed(6));

  return url.toString();
}

/**
 * Fetch aircraft states from OpenSky API
 * @param {Array} bbox - [minLon, minLat, maxLon, maxLat] in WGS84
 * @returns {Promise<Array|null>} Array of state vectors, or null on error
 */
export async function fetchAircraftStates(bbox) {
  const url = buildOpenSkyUrl(bbox);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    // Handle rate limiting
    if (response.status === 429) {
      state.aircraftError = {
        type: 'rate_limit',
        message: 'OpenSky rate limit exceeded. Try again later.',
        time: Date.now()
      };
      console.warn('[OpenSky] Rate limit exceeded');
      return null;
    }

    if (!response.ok) {
      throw new Error(`OpenSky API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.states) {
      console.warn('[OpenSky] No states in response');
      return [];
    }

    // Clear error on success
    state.aircraftError = null;
    state.aircraftLastUpdate = Date.now();

    console.log(`[OpenSky] Fetched ${data.states.length} aircraft`);
    return data.states;

  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Request timeout' : err.message;
    state.aircraftError = {
      type: 'network',
      message: msg,
      time: Date.now()
    };
    console.error('[OpenSky] Fetch failed:', msg);
    return null;
  }
}
