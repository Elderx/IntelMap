/**
 * GPX Charts Module
 * Creates and manages Chart.js elevation, speed, and distance profile charts
 */

import { state } from '../state/store.js';
import { getChartsContainer } from '../ui/gpxControl.js';
import Chart from 'chart.js/auto';

let elevationChart = null;
let speedChart = null;
let distanceChart = null;

/**
 * Create all charts based on track data
 * @param {TrackPoint[]} trackData - Track point data from parser
 * @param {GpxStatistics} stats - Calculated statistics
 */
export function createCharts(trackData, stats) {
  const container = getChartsContainer();
  if (!container) {
    console.warn('[GPX] Charts container not found');
    return;
  }

  // Clear existing charts
  destroyCharts();

  // Clear container
  container.innerHTML = '';

  // Create elevation chart if data available
  if (stats.hasElevationData && state.gpxShowElevationChart) {
    createElevationChart(container, trackData);
  }

  // Create speed chart if data available
  if (stats.hasSpeedData && state.gpxShowSpeedChart) {
    createSpeedChart(container, trackData);
  }

  // Create distance chart if data available
  if (stats.hasTimeData && state.gpxShowDistanceChart) {
    createDistanceChart(container, trackData);
  }

  console.log('[GPX] Charts created');
}

/**
 * Create elevation profile chart
 * @param {HTMLElement} container - Container element
 * @param {TrackPoint[]} trackData
 */
function createElevationChart(container, trackData) {
  // Filter points with elevation data
  const validPoints = trackData.filter(p => p.elevation !== null);

  if (validPoints.length === 0) return;

  // Create canvas element
  const canvasContainer = document.createElement('div');
  canvasContainer.style.height = '200px';
  canvasContainer.style.marginBottom = '10px';

  const canvas = document.createElement('canvas');
  canvasContainer.appendChild(canvas);
  container.appendChild(canvasContainer);

  // Prepare data
  const labels = validPoints.map((p, i) => {
    const km = (p.distance / 1000).toFixed(1);
    return `${km} km`;
  });

  const data = validPoints.map(p => p.elevation);

  // Create chart
  elevationChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Elevation',
        data: data,
        borderColor: '#2196F3',
        backgroundColor: 'rgba(33, 150, 243, 0.1)',
        borderWidth: 2,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            title: (items) => `Distance: ${items[0].label}`,
            label: (item) => `Elevation: ${item.raw.toFixed(0)} m`
          }
        }
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Distance',
            color: '#666'
          },
          ticks: {
            maxTicksLimit: 5,
            color: '#666'
          },
          grid: {
            display: false
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Elevation (m)',
            color: '#666'
          },
          ticks: {
            color: '#666'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        }
      },
      onHover: handleChartHover
    }
  });
}

/**
 * Create speed chart
 * @param {HTMLElement} container - Container element
 * @param {TrackPoint[]} trackData
 */
function createSpeedChart(container, trackData) {
  // Filter points with speed data
  const validPoints = trackData.filter(p => p.speed !== null && p.speed > 0);

  if (validPoints.length === 0) return;

  // Create canvas element
  const canvasContainer = document.createElement('div');
  canvasContainer.style.height = '200px';
  canvasContainer.style.marginBottom = '10px';

  const canvas = document.createElement('canvas');
  canvasContainer.appendChild(canvas);
  container.appendChild(canvasContainer);

  // Prepare data - use time as x-axis if available, otherwise distance
  const hasTime = validPoints.some(p => p.time);

  const labels = validPoints.map((p, i) => {
    if (hasTime && p.time) {
      return p.time.toLocaleTimeString();
    }
    const km = (p.distance / 1000).toFixed(1);
    return `${km} km`;
  });

  const data = validPoints.map(p => p.speed * 3.6); // Convert m/s to km/h

  // Create chart
  speedChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Speed',
        data: data,
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        borderWidth: 2,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (item) => `Speed: ${item.raw.toFixed(1)} km/h`
          }
        }
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: hasTime ? 'Time' : 'Distance',
            color: '#666'
          },
          ticks: {
            maxTicksLimit: 5,
            color: '#666'
          },
          grid: {
            display: false
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Speed (km/h)',
            color: '#666'
          },
          ticks: {
            color: '#666'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        }
      },
      onHover: handleChartHover
    }
  });
}

/**
 * Create distance over time chart
 * @param {HTMLElement} container - Container element
 * @param {TrackPoint[]} trackData
 */
function createDistanceChart(container, trackData) {
  // Filter points with time data
  const validPoints = trackData.filter(p => p.time !== null);

  if (validPoints.length === 0) return;

  // Create canvas element
  const canvasContainer = document.createElement('div');
  canvasContainer.style.height = '200px';
  canvasContainer.style.marginBottom = '10px';

  const canvas = document.createElement('canvas');
  canvasContainer.appendChild(canvas);
  container.appendChild(canvasContainer);

  // Prepare data
  const labels = validPoints.map(p => p.time.toLocaleTimeString());
  const data = validPoints.map(p => p.distance / 1000); // Convert to km

  // Create chart
  distanceChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Distance',
        data: data,
        borderColor: '#9C27B0',
        backgroundColor: 'rgba(156, 39, 176, 0.1)',
        borderWidth: 2,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (item) => `Distance: ${item.raw.toFixed(2)} km`
          }
        }
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Time',
            color: '#666'
          },
          ticks: {
            maxTicksLimit: 5,
            color: '#666'
          },
          grid: {
            display: false
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Distance (km)',
            color: '#666'
          },
          ticks: {
            color: '#666'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        }
      },
      onHover: handleChartHover
    }
  });
}

/**
 * Handle chart hover event
 * @param {Event} event - Hover event
 * @param {Array} elements - Chart elements
 * @param {Chart} chart - Chart instance
 */
function handleChartHover(event, elements, chart) {
  if (!elements || elements.length === 0) {
    // Clear hover marker
    clearMapMarker();
    return;
  }

  const index = elements[0].index;
  highlightMapPoint(index);
}

/**
 * Highlight point on map based on chart data index
 * @param {number} index - Data point index
 */
function highlightMapPoint(index) {
  if (!state.gpxCurrentFile || !state.gpxCurrentFile.trackData) {
    return;
  }

  const trackData = state.gpxCurrentFile.trackData;

  // Import dynamically to avoid circular dependency
  import('./gpxInteractions.js').then(({ setMapMarkerAtIndex }) => {
    setMapMarkerAtIndex(index);
  });
}

/**
 * Clear hover marker from map
 */
function clearMapMarker() {
  // Import dynamically
  import('./gpxInteractions.js').then(({ clearMapMarker }) => {
    clearMapMarker();
  });
}

/**
 * Destroy all charts
 */
export function destroyCharts() {
  if (elevationChart) {
    elevationChart.destroy();
    elevationChart = null;
  }

  if (speedChart) {
    speedChart.destroy();
    speedChart = null;
  }

  if (distanceChart) {
    distanceChart.destroy();
    distanceChart = null;
  }

  console.log('[GPX] Charts destroyed');
}

/**
 * Update chart visibility
 */
export function updateChartsVisibility() {
  const container = getChartsContainer();
  if (!container) return;

  // Get current track data and stats
  if (!state.gpxCurrentFile) {
    destroyCharts();
    container.innerHTML = '';
    return;
  }

  const { trackData, stats } = state.gpxCurrentFile;

  // Recreate charts with new visibility settings
  destroyCharts();
  container.innerHTML = '';
  createCharts(trackData, stats);
}

/**
 * Highlight point in charts from map hover
 * @param {number} index - Track point index
 */
export function highlightChartPoint(index) {
  // Find which chart contains this index and highlight it
  const charts = [elevationChart, speedChart, distanceChart].filter(c => c !== null);

  charts.forEach(chart => {
    if (index < chart.data.labels.length) {
      chart.setActiveElements([
        { datasetIndex: 0, index: index }
      ]);
      chart.update();
    }
  });
}

/**
 * Clear chart highlights
 */
export function clearChartHighlights() {
  const charts = [elevationChart, speedChart, distanceChart].filter(c => c !== null);

  charts.forEach(chart => {
    chart.setActiveElements([]);
    chart.update();
  });
}
