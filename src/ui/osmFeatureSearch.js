import { searchOsmTags } from '../api/osm.js';
import { state } from '../state/store.js';
import { updateOsmDynamicLayers, clearAllTileCache } from '../map/osmDynamicLayers.js';
import { getThemeColor } from './themeHelpers.js';

let container = null;

// Distinct colors for features
const COLORS = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
    '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
    '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
    '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'
];

// Helper to get theme colors and apply styles
function applyThemeStylesToElement(el, styles) {
  const c = getThemeColor();
  Object.assign(el.style, styles);
}

/**
 * Initialize the OSM Feature Search UI
 */
export function initOsmFeatureSearch() {
    if (container) return; // Already initialized

    // Check if button already exists in header (new unified header)
    let triggerBtn = document.getElementById('osm-search-trigger');

    // If button doesn't exist in header, create the old floating button (legacy support)
    if (!triggerBtn) {
        triggerBtn = document.createElement('button');
        triggerBtn.textContent = 'Add OSM Feature';
        triggerBtn.title = 'Search and add specific OSM features to the map';
        triggerBtn.style.cssText = `
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10;
        padding: 8px 16px;
        font-size: 1em;
        border-radius: 8px;
        border: none;
        background: #4caf50;
        color: white;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        margin-bottom: 50px;
      `;
        triggerBtn.id = 'osm-search-trigger';
        // Will append to body later if created
    }

    // Panel container
    const c = getThemeColor();
    const panel = document.createElement('div');
    panel.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 400px;
    max-width: 90vw;
    background: ${c.bgElevated};
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 5px 20px rgba(0,0,0,0.2);
    z-index: 2000;
    display: none;
    font-family: sans-serif;
  `;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
    header.innerHTML = `<h3 style="margin:0;color:${c.text}">Add OSM Layer</h3>`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `background:none;border:none;font-size:1.2em;cursor:pointer;padding:4px;color:${c.text};`;
    closeBtn.onclick = () => { panel.style.display = 'none'; };
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // === LOCAL ONLY MODE TOGGLE ===
    const localOnlyRow = document.createElement('div');
    localOnlyRow.style.cssText = `display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding:10px;background:${c.bgLight};border-radius:8px;`;

    const localOnlyLabel = document.createElement('div');
    localOnlyLabel.innerHTML = `
        <div style="font-weight:600;color:${c.text};">📦 Local Only Mode</div>
        <div style="font-size:0.8em;color:${c.textMuted};">Only show cached data (no network)</div>
    `;

    const localOnlyToggle = document.createElement('label');
    localOnlyToggle.style.cssText = 'position:relative;display:inline-block;width:50px;height:26px;cursor:pointer;';
    localOnlyToggle.innerHTML = `
        <input type="checkbox" id="local-only-toggle" style="opacity:0;width:0;height:0;">
        <span style="position:absolute;inset:0;background:#ccc;border-radius:26px;transition:0.3s;"></span>
        <span style="position:absolute;left:3px;top:3px;width:20px;height:20px;background:white;border-radius:50%;transition:0.3s;"></span>
    `;

    const checkbox = localOnlyToggle.querySelector('input');
    const slider = localOnlyToggle.querySelector('span:first-of-type');
    const knob = localOnlyToggle.querySelector('span:last-of-type');

    checkbox.checked = state.osmLocalOnlyMode;
    if (checkbox.checked) {
        slider.style.background = '#4caf50';
        knob.style.left = '27px';
    }

    checkbox.onchange = () => {
        state.osmLocalOnlyMode = checkbox.checked;
        slider.style.background = checkbox.checked ? '#4caf50' : '#ccc';
        knob.style.left = checkbox.checked ? '27px' : '3px';
        console.log(`[OSM] Local Only Mode: ${state.osmLocalOnlyMode ? 'ON' : 'OFF'}`);
    };

    localOnlyRow.appendChild(localOnlyLabel);
    localOnlyRow.appendChild(localOnlyToggle);
    panel.appendChild(localOnlyRow);

    // === CLEAR CACHE BUTTON ===
    const clearCacheBtn = document.createElement('button');
    clearCacheBtn.textContent = '🗑️ Clear Tile Cache';
    clearCacheBtn.title = 'Clear database records of cached tiles';
    clearCacheBtn.style.cssText = `width:100%;padding:8px;margin-bottom:16px;background:${c.warning};color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.9em;`;
    clearCacheBtn.onclick = async () => {
        if (confirm('Clear OSM tile cache history? This will make the map forget which tiles are cached in Nginx.')) {
            await clearAllTileCache();
            alert('Cache cleared!');
        }
    };
    panel.appendChild(clearCacheBtn);

    // Search input
    const inputGroup = document.createElement('div');
    inputGroup.style.marginBottom = '16px';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search e.g. "cafe", "highway"...';
    input.style.cssText = `width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;box-sizing:border-box;font-size:1em;background:${c.bgElevated};color:${c.text};`;
    inputGroup.appendChild(input);
    panel.appendChild(inputGroup);

    // Results list
    const resultsContainer = document.createElement('div');
    resultsContainer.style.cssText = `max-height:200px;overflow-y:auto;border:1px solid ${c.bgLighter};border-radius:6px;margin-bottom:16px;display:none;background:${c.bg};`;
    panel.appendChild(resultsContainer);

    // Active Layers List
    const activeLayersHeader = document.createElement('h4');
    activeLayersHeader.textContent = 'Active Layers';
    activeLayersHeader.style.cssText = `margin:0 0 8px 0;color:${c.text};`;
    panel.appendChild(activeLayersHeader);

    const activeLayersContainer = document.createElement('div');
    activeLayersContainer.style.cssText = 'max-height:150px;overflow-y:auto;';
    panel.appendChild(activeLayersContainer);

    // Only append triggerBtn to body if it was created (not found in header)
    if (!document.getElementById('osm-search-trigger')) {
        document.body.appendChild(triggerBtn);
    }
    document.body.appendChild(panel);
    container = panel;

    // Event Handlers
    triggerBtn.onclick = () => {
        panel.style.display = 'block';
        renderActiveLayers();
        input.focus();
    };

    // Debounced search
    let timeout;
    input.addEventListener('input', (e) => {
        const q = e.target.value.trim();
        if (q.length < 2) {
            resultsContainer.style.display = 'none';
            return;
        }
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            const c = getThemeColor();
            resultsContainer.innerHTML = `<div style="padding:10px;color:${c.textMuted};">Searching Taginfo...</div>`;
            resultsContainer.style.display = 'block';

            const results = await searchOsmTags(q);
            renderResults(results);
        }, 400);
    });

    function renderResults(results) {
        const c = getThemeColor();
        resultsContainer.innerHTML = '';
        if (results.length === 0) {
            resultsContainer.innerHTML = `<div style="padding:10px;color:${c.textMuted};">No results found.</div>`;
            return;
        }

        results.forEach(item => {
            const el = document.createElement('div');
            el.style.cssText = `padding:10px;border-bottom:1px solid ${c.bgLighter};cursor:pointer;display:flex;justify-content:space-between;align-items:center;`;
            el.innerHTML = `
        <div>
          <div style="font-weight:bold;color:${c.text};">${item.key}=${item.value}</div>
          <div style="font-size:0.8em;color:${c.textMuted};">Usage: ${item.count}</div>
        </div>
        <button style="background:${c.primary};color:white;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;">Add</button>
      `;
            el.addEventListener('mouseover', () => el.style.background = c.hover);
            el.addEventListener('mouseout', () => el.style.background = 'transparent');
            el.onclick = () => addFeature(item);
            resultsContainer.appendChild(el);
        });
    }

    function addFeature(item) {
        if (!state.activeOsmFeatures) state.activeOsmFeatures = [];

        // duplicate check
        if (state.activeOsmFeatures.find(f => f.key === item.key && f.value === item.value)) {
            alert('Layer already active');
            return;
        }

        // Assign color
        const usedColors = state.activeOsmFeatures.map(f => f.color);
        const color = COLORS.find(c => !usedColors.includes(c)) || COLORS[state.activeOsmFeatures.length % COLORS.length];

        const feature = {
            id: `${item.key}-${item.value}-${Date.now()}`,
            key: item.key,
            value: item.value,
            title: `${item.key}=${item.value}`,
            color: color,
            visible: true
        };

        state.activeOsmFeatures.push(feature);
        updateOsmDynamicLayers();
        renderActiveLayers();
        resultsContainer.style.display = 'none';
        input.value = '';
    }

    function renderActiveLayers() {
        const c = getThemeColor();
        activeLayersContainer.innerHTML = '';
        const features = state.activeOsmFeatures || [];

        if (features.length === 0) {
            activeLayersContainer.innerHTML = `<div style="padding:10px;color:${c.textLight};font-style:italic;">No active layers</div>`;
            return;
        }

        features.forEach(f => {
            const row = document.createElement('div');
            row.style.cssText = `display:flex;align-items:center;padding:8px;border-bottom:1px solid ${c.bgLighter};`;

            const colorDot = document.createElement('div');
            colorDot.style.cssText = `width:12px;height:12px;border-radius:50%;background:${f.color};margin-right:10px;flex-shrink:0;`;

            const title = document.createElement('span');
            title.textContent = f.title;
            title.style.cssText = `flex-grow:1;font-weight:500;color:${c.text};`;

            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '&times;';
            removeBtn.style.cssText = `background:none;border:none;color:${c.danger};font-size:1.2em;cursor:pointer;padding:0 8px;`;
            removeBtn.onclick = () => removeFeature(f.id);

            row.appendChild(colorDot);
            row.appendChild(title);
            row.appendChild(removeBtn);
            activeLayersContainer.appendChild(row);
        });
    }

    function removeFeature(id) {
        state.activeOsmFeatures = state.activeOsmFeatures.filter(f => f.id !== id);
        updateOsmDynamicLayers();
        renderActiveLayers();
    }
}
