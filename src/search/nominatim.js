import { fromLonLat } from 'ol/proj';
import { state } from '../state/store.js';
import { showSearchMarker } from '../draw/markers.js';

// Nominatim API endpoint (public OSM instance, or set VITE_NOMINATIM_URL env var)
const NOMINATIM_URL = import.meta.env.VITE_NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

// Debounce delay for autocomplete (ms)
const DEBOUNCE_DELAY = 300;

// Minimum query length before triggering search
const MIN_QUERY_LENGTH = 3;

/**
 * Search Nominatim for places matching the query
 * @param {string} query - Search query
 * @returns {Promise<Array>} Array of search results
 */
async function searchNominatim(query) {
    if (!query || query.length < MIN_QUERY_LENGTH) return [];

    const params = new URLSearchParams({
        q: query,
        format: 'json',
        addressdetails: '1',
        limit: '5',
        'accept-language': 'en,fi'  // Prefer English, fallback to Finnish
    });

    try {
        const response = await fetch(`${NOMINATIM_URL}/search?${params}`, {
            headers: {
                'User-Agent': 'MML-Map/1.0'  // Required by Nominatim usage policy
            }
        });

        if (!response.ok) {
            console.warn('[Nominatim] Search failed:', response.status);
            return [];
        }

        return await response.json();
    } catch (error) {
        console.warn('[Nominatim] Search error:', error);
        return [];
    }
}

/**
 * Create a debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Navigate all maps to a location and show a marker
 */
function navigateToLocation(lon, lat, zoom = 14) {
    const center = fromLonLat([lon, lat]);

    if (state.map && state.map.getView) {
        state.map.getView().setCenter(center);
        state.map.getView().setZoom(zoom);
    }
    if (state.leftMap && state.leftMap.getView) {
        state.leftMap.getView().setCenter(center);
        state.leftMap.getView().setZoom(zoom);
    }
    if (state.rightMap && state.rightMap.getView) {
        state.rightMap.getView().setCenter(center);
        state.rightMap.getView().setZoom(zoom);
    }

    showSearchMarker(lon, lat);
}

/**
 * Create the autocomplete dropdown UI
 */
function createDropdown() {
    const dropdown = document.createElement('div');
    dropdown.id = 'search-dropdown';
    dropdown.style.cssText = `
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #ccc;
    border-top: none;
    border-radius: 0 0 8px 8px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    max-height: 300px;
    overflow-y: auto;
    z-index: 1000;
    display: none;
  `;
    return dropdown;
}

/**
 * Show search results in the dropdown
 */
function showResults(dropdown, results, onSelect) {
    dropdown.innerHTML = '';

    if (results.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    results.forEach((result, index) => {
        const item = document.createElement('div');
        item.style.cssText = `
      padding: 10px 16px;
      cursor: pointer;
      border-bottom: 1px solid #eee;
      transition: background 0.15s;
    `;
        item.innerHTML = `
      <div style="font-weight: 500; color: #333;">${result.display_name.split(',')[0]}</div>
      <div style="font-size: 0.85em; color: #666; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        ${result.display_name}
      </div>
    `;

        item.addEventListener('mouseenter', () => {
            item.style.background = '#f5f5f5';
        });
        item.addEventListener('mouseleave', () => {
            item.style.background = 'white';
        });
        item.addEventListener('click', () => {
            onSelect(result);
        });

        dropdown.appendChild(item);
    });

    dropdown.style.display = 'block';
}

/**
 * Set up Nominatim autocomplete on the search bar
 */
export function setupNominatimSearch() {
    const input = document.getElementById('search-bar');
    if (!input) {
        console.warn('[Nominatim] Search bar not found');
        return;
    }

    // Make parent container relative for dropdown positioning
    const container = input.parentElement;

    // Create dropdown
    const dropdown = createDropdown();
    container.appendChild(dropdown);

    // Handle result selection
    const handleSelect = (result) => {
        const lon = parseFloat(result.lon);
        const lat = parseFloat(result.lat);

        // Set input value to selected place name
        input.value = result.display_name.split(',')[0];

        // Hide dropdown
        dropdown.style.display = 'none';

        // Navigate to location
        navigateToLocation(lon, lat);
    };

    // Debounced search function
    const debouncedSearch = debounce(async (query) => {
        const results = await searchNominatim(query);
        showResults(dropdown, results, handleSelect);
    }, DEBOUNCE_DELAY);

    // Handle input changes
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length < MIN_QUERY_LENGTH) {
            dropdown.style.display = 'none';
            return;
        }
        debouncedSearch(query);
    });

    // Handle Enter key to select first result
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = input.value.trim();
            if (query.length >= MIN_QUERY_LENGTH) {
                const results = await searchNominatim(query);
                if (results.length > 0) {
                    handleSelect(results[0]);
                }
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });

    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Hide dropdown on blur (with slight delay for click handling)
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (!container.contains(document.activeElement)) {
                dropdown.style.display = 'none';
            }
        }, 150);
    });

    console.log('[Nominatim] Search initialized');
}
