/**
 * GPX Statistics Module
 * Calculates statistics from GPX track data using gpx-basic-stats library
 */

import calculateBasicStats from 'gpx-basic-stats';

/**
 * Calculate statistics from GPX track data
 * @param {TrackPoint[]} trackData - Array of track points from parser
 * @param {Feature[]} features - OpenLayers features (for library compatibility)
 * @returns {GpxStatistics}
 */
export function calculateStats(trackData, features) {
  if (!trackData || trackData.length === 0) {
    return createEmptyStats();
  }

  try {
    // Try gpx-basic-stats library first
    const geojson = convertToGeoJson(trackData);

    console.log('[GPX] GeoJSON for stats:', JSON.stringify(geojson).substring(0, 200) + '...');

    const stats = calculateBasicStats(geojson);

    console.log('[GPX] gpx-basic-stats result:', stats);

    // Check if stats library returned valid values
    if (!stats || typeof stats.distance !== 'number' || isNaN(stats.distance)) {
      console.warn('[GPX] gpx-basic-stats returned invalid values, using manual calculation');
      return calculateStatsManually(trackData);
    }

    // Extract and format statistics
    const result = {
      distance: Math.round(stats.distance * 1000), // Convert km to meters
      duration: 0,                                  // Calculated from time data
      elevationGain: Math.round(stats.elevationGain || 0),
      elevationLoss: Math.round(stats.elevationLoss || 0),
      elevationMin: Math.round(stats.elevationMin || 0),
      elevationMax: Math.round(stats.elevationMax || 0),
      startTime: null,
      endTime: null,
      pointCount: trackData.length,
      hasElevationData: hasAnyElevation(trackData),
      hasTimeData: hasAnyTime(trackData),
      hasSpeedData: hasAnySpeed(trackData)
    };

    // Calculate duration from time data if available
    if (result.hasTimeData) {
      const times = trackData.filter(p => p.time).map(p => p.time);
      if (times.length >= 2) {
        result.startTime = new Date(Math.min(...times));
        result.endTime = new Date(Math.max(...times));
        result.duration = Math.round((result.endTime - result.startTime) / 1000);
      }
    }

    // Calculate average speed if duration available
    if (result.duration > 0) {
      result.averageSpeed = result.distance / result.duration; // m/s
    } else if (result.hasSpeedData) {
      // Calculate average from individual point speeds
      const speeds = trackData.filter(p => p.speed > 0).map(p => p.speed);
      if (speeds.length > 0) {
        result.averageSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      }
    }

    // Calculate max speed if available
    if (result.hasSpeedData) {
      const speeds = trackData.filter(p => p.speed !== null && p.speed > 0).map(p => p.speed);
      if (speeds.length > 0) {
        result.maxSpeed = Math.max(...speeds);
      }
    }

    console.log('[GPX] Statistics calculated:', result);
    return result;
  } catch (error) {
    console.error('[GPX] Error calculating statistics:', error);
    // Fallback to manual calculation
    return calculateStatsManually(trackData);
  }
}

/**
 * Calculate statistics manually (fallback method)
 * @param {TrackPoint[]} trackData
 * @returns {GpxStatistics}
 */
function calculateStatsManually(trackData) {
  const result = createEmptyStats();
  result.pointCount = trackData.length;

  if (trackData.length === 0) return result;

  // Distance is already cumulative in last point
  const lastPoint = trackData[trackData.length - 1];
  result.distance = Math.round(lastPoint.distance);

  // Elevation stats
  const elevations = trackData.filter(p => p.elevation !== null).map(p => p.elevation);
  if (elevations.length > 0) {
    result.hasElevationData = true;
    result.elevationMin = Math.round(Math.min(...elevations));
    result.elevationMax = Math.round(Math.max(...elevations));

    // Calculate elevation gain/loss
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < trackData.length; i++) {
      const prev = trackData[i - 1];
      const curr = trackData[i];
      if (prev.elevation !== null && curr.elevation !== null) {
        const diff = curr.elevation - prev.elevation;
        if (diff > 0) gain += diff;
        else loss += Math.abs(diff);
      }
    }
    result.elevationGain = Math.round(gain);
    result.elevationLoss = Math.round(loss);
  }

  // Time stats
  const times = trackData.filter(p => p.time).map(p => p.time);
  if (times.length >= 2) {
    result.hasTimeData = true;
    result.startTime = new Date(Math.min(...times));
    result.endTime = new Date(Math.max(...times));
    result.duration = Math.round((result.endTime - result.startTime) / 1000);
  }

  // Speed stats
  const speeds = trackData.filter(p => p.speed !== null && p.speed > 0).map(p => p.speed);
  if (speeds.length > 0) {
    result.hasSpeedData = true;
    result.averageSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    result.maxSpeed = Math.max(...speeds);
  }

  return result;
}

/**
 * Convert track data to GeoJSON LineString for gpx-basic-stats
 * @param {TrackPoint[]} trackData
 * @returns {FeatureCollection}
 */
function convertToGeoJson(trackData) {
  // Filter out points without coordinates
  const validPoints = trackData.filter(p => p.coordinates && p.coordinates.length >= 2);

  if (validPoints.length === 0) {
    return {
      type: 'FeatureCollection',
      features: []
    };
  }

  // Create GeoJSON LineString
  const coordinates = validPoints.map(p => [p.lon, p.lat]);

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coordinates
      }
    }]
  };
}

/**
 * Check if any points have elevation data
 * @param {TrackPoint[]} trackData
 * @returns {boolean}
 */
function hasAnyElevation(trackData) {
  return trackData.some(p => p.elevation !== null && p.elevation !== undefined);
}

/**
 * Check if any points have time data
 * @param {TrackPoint[]} trackData
 * @returns {boolean}
 */
function hasAnyTime(trackData) {
  return trackData.some(p => p.time !== null && p.time !== undefined);
}

/**
 * Check if any points have speed data
 * @param {TrackPoint[]} trackData
 * @returns {boolean}
 */
function hasAnySpeed(trackData) {
  return trackData.some(p => p.speed !== null && p.speed !== undefined && p.speed > 0);
}

/**
 * Create empty statistics object
 * @returns {GpxStatistics}
 */
function createEmptyStats() {
  return {
    distance: 0,
    duration: 0,
    elevationGain: 0,
    elevationLoss: 0,
    elevationMin: 0,
    elevationMax: 0,
    startTime: null,
    endTime: null,
    pointCount: 0,
    hasElevationData: false,
    hasTimeData: false,
    hasSpeedData: false,
    averageSpeed: null,
    maxSpeed: null
  };
}

/**
 * Format statistics for display
 * @param {GpxStatistics} stats
 * @returns {FormattedStats}
 */
export function formatStats(stats) {
  return {
    distance: formatDistance(stats.distance),
    duration: formatDuration(stats.duration),
    elevationGain: formatElevation(stats.elevationGain),
    elevationLoss: formatElevation(stats.elevationLoss),
    elevationMin: formatElevation(stats.elevationMin),
    elevationMax: formatElevation(stats.elevationMax),
    averageSpeed: stats.averageSpeed ? formatSpeed(stats.averageSpeed) : null,
    maxSpeed: stats.maxSpeed ? formatSpeed(stats.maxSpeed) : null,
    startTime: stats.startTime ? formatDate(stats.startTime) : 'N/A',
    endTime: stats.endTime ? formatDate(stats.endTime) : 'N/A',
    pointCount: stats.pointCount.toLocaleString()
  };
}

/**
 * Format distance for display
 * @param {number} meters - Distance in meters
 * @returns {string}
 */
function formatDistance(meters) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${meters.toFixed(0)} m`;
}

/**
 * Format duration for display
 * @param {number} seconds - Duration in seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  if (seconds === 0) return 'N/A';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Format elevation for display
 * @param {number} meters - Elevation in meters
 * @returns {string}
 */
function formatElevation(meters) {
  return `${meters.toFixed(0)} m`;
}

/**
 * Format speed for display
 * @param {number} mps - Speed in m/s
 * @returns {string}
 */
function formatSpeed(mps) {
  const kmh = mps * 3.6;
  return `${kmh.toFixed(1)} km/h`;
}

/**
 * Format date for display
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  return date.toLocaleString();
}
