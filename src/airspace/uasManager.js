/**
 * UAS Airspace Manager Module
 * Handles fetching, caching, and layer lifecycle for Finnish UAS zones
 */

import { state } from '../state/store.js';
import { updateUASLayers } from './uasLayers.js';

const UAS_API_URL = 'https://flyk.com/api/uas.geojson';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Fetch UAS GeoJSON data from FlyK API
 * @returns {Promise<Object|null>} GeoJSON object or null on error
 */
async function fetchUASData() {
  console.log('[UAS] Fetching UAS zones from', UAS_API_URL);

  try {
    const response = await fetch(UAS_API_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const geojson = await response.json();

    if (!geojson || !geojson.features || !Array.isArray(geojson.features)) {
      throw new Error('Invalid GeoJSON format');
    }

    // Clear any previous errors
    state.uasError = null;
    state.uasLastFetch = Date.now();

    console.log(`[UAS] Fetched ${geojson.features.length} zones`);
    return geojson;

  } catch (error) {
    console.error('[UAS] Fetch error:', error);
    state.uasError = {
      type: 'fetch_error',
      message: error.message,
      time: new Date().toISOString()
    };
    return null;
  }
}

/**
 * Start UAS overlay
 * Fetches data and creates layers for all active maps
 */
export async function startUAS() {
  if (state.uasEnabled) {
    console.warn('[UAS] Already enabled');
    return;
  }

  console.log('[UAS] Starting UAS overlay');

  // Fetch data
  const geojson = await fetchUASData();

  if (!geojson) {
    // Error already set in state
    console.error('[UAS] Failed to start - fetch error');
    return;
  }

  // Store features in state
  state.uasFeatures = geojson.features;
  state.uasEnabled = true;

  // Create and add layers to all active maps
  updateUASLayers();

  // Update active layers panel
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });

  console.log('[UAS] Overlay started successfully');
}

/**
 * Stop UAS overlay
 * Removes layers from all maps and clears state
 */
export function stopUAS() {
  if (!state.uasEnabled) {
    console.warn('[UAS] Not enabled');
    return;
  }

  console.log('[UAS] Stopping UAS overlay');

  // Remove layers from all maps
  import('./uasLayers.js').then(({ removeUASFromMaps }) => {
    removeUASFromMaps();
  });

  // Clear state
  state.uasFeatures = [];
  state.uasEnabled = false;
  state.uasError = null;
  state.uasLastFetch = null;

  // Update active layers panel
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });

  console.log('[UAS] Overlay stopped');
}

/**
 * Refresh UAS data
 * Re-fetches data and updates layers
 */
export async function refreshUAS() {
  if (!state.uasEnabled) {
    console.warn('[UAS] Not enabled, cannot refresh');
    return;
  }

  console.log('[UAS] Refreshing data');

  const geojson = await fetchUASData();

  if (!geojson) {
    console.error('[UAS] Refresh failed');
    return;
  }

  // Update features
  state.uasFeatures = geojson.features;

  // Rebuild layers with new data
  import('./uasLayers.js').then(({ removeUASFromMaps, updateUASLayers }) => {
    // Remove old layers
    removeUASFromMaps();
    // Add new layers with updated data
    updateUASLayers();
  });

  // Update active layers panel
  import('../ui/activeLayers.js').then(({ updateActiveLayersPanel }) => {
    updateActiveLayersPanel();
  });

  console.log('[UAS] Refresh complete');
}

/**
 * Check if cached data is still valid
 * @returns {boolean} True if cache is valid
 */
export function isCacheValid() {
  if (!state.uasLastFetch) return false;
  const now = Date.now();
  return (now - state.uasLastFetch) < CACHE_DURATION;
}

/**
 * Get summary statistics for UAS zones
 * @returns {Object} Statistics object
 */
export function getUASStatistics() {
  const features = state.uasFeatures;
  if (!features || features.length === 0) {
    return { total: 0, byRestriction: {} };
  }

  const stats = {
    total: features.length,
    byRestriction: {}
  };

  features.forEach(f => {
    const restriction = f.properties?.restriction || 'NO_RESTRICTION';
    stats.byRestriction[restriction] = (stats.byRestriction[restriction] || 0) + 1;
  });

  return stats;
}
