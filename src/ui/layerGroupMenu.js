import { state } from '../state/store.js';
import { createLayerGroup, fetchLayerGroups, deleteLayerGroup } from '../api/client.js';
import { updateAllOverlays } from '../map/overlays.js';
import { updateOsmDynamicLayers } from '../map/osmDynamicLayers.js';
import { updateOSMLegend } from './osmLegend.js';

/**
 * Apply a layer group configuration to the current session
 */
export function applyLayerGroup(config) {
    if (!config) return;

    console.log('[LayerGroups] Applying config:', config);

    // 1. Basemap
    if (config.basemapId) {
        const selector = document.getElementById('baseLayerSelector');
        if (selector) {
            selector.value = config.basemapId;
            selector.dispatchEvent(new Event('change'));
        }
    }

    // 2. Overlays
    state.digiroadOverlayLayers = config.activeOverlays || [];
    state.genericOverlayLayers = config.genericOverlayLayers || [];
    state.osmSelectedIds = config.activeOsmDatasets || [];

    // 3. Dynamic OSM Features
    state.activeOsmFeatures = (config.activeOsmFeatures || []).map(f => ({
        ...f,
        visible: f.visible !== false // handle case where field might be missing
    }));

    // Trigger updates
    updateAllOverlays();
    updateOsmDynamicLayers();
    updateOSMLegend();

    // Refresh dropdown labels if elements exist
    refreshOverlayDropdowns();
}

function refreshOverlayDropdowns() {
    // This is a bit hacky but works since we don't have a full UI framework
    // We rely on the button text update logic in overlayDropdown.js
    const buttons = document.querySelectorAll('.overlay-dropdown-btn');
    buttons.forEach(btn => {
        // Triggering a fake click or just let the user see it on next open?
        // Better to find a way to update the text. 
        // For now, updateAllOverlays handles the layer visibility.
    });
}

/**
 * Capture current state as a Layer Group config
 */
export function captureCurrentConfig() {
    const view = state.map.getView();
    return {
        basemapId: document.getElementById('baseLayerSelector')?.value,
        activeOverlays: state.digiroadOverlayLayers,
        genericOverlayLayers: state.genericOverlayLayers,
        activeOsmDatasets: state.osmSelectedIds,
        activeOsmFeatures: state.activeOsmFeatures.map(f => ({
            key: f.key,
            value: f.value,
            color: f.color,
            title: f.title
        }))
    };
}

/**
 * UI Component for Layer Group Selection
 */
export async function createLayerGroupMenu() {
    const container = document.createElement('div');
    container.id = 'layer-group-menu-container';
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.marginTop = '12px';

    const button = document.createElement('button');
    button.className = 'overlay-dropdown-btn';
    button.style.width = '100%';
    button.style.textAlign = 'left';
    button.style.padding = '8px';
    button.style.borderRadius = '6px';
    button.style.border = '1px solid #ccc';
    button.style.background = '#e3f2fd';
    button.style.cursor = 'pointer';
    button.style.fontWeight = 'bold';
    button.style.color = '#1976d2';
    button.textContent = '📂 Layer Groups';

    const panel = document.createElement('div');
    panel.style.display = 'none';
    panel.style.position = 'absolute';
    panel.style.left = '0';
    panel.style.top = '110%';
    panel.style.width = '100%';
    panel.style.background = 'white';
    panel.style.padding = '10px';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    panel.style.zIndex = '100';
    panel.style.maxHeight = '300px';
    panel.style.overflowY = 'auto';

    container.appendChild(button);
    container.appendChild(panel);

    button.onclick = async (e) => {
        e.stopPropagation();
        const isVisible = panel.style.display === 'block';
        if (isVisible) {
            panel.style.display = 'none';
        } else {
            panel.style.display = 'block';
            await refreshGroupList(panel);
        }
    };

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) panel.style.display = 'none';
    });

    return container;
}

async function refreshGroupList(panel) {
    panel.innerHTML = '<div style="font-weight:bold;margin-bottom:8px;">Saved Groups:</div>';

    const groups = await fetchLayerGroups();
    if (!groups || groups.length === 0) {
        panel.innerHTML += '<div style="color:#666;font-size:0.9em;">No saved groups</div>';
        return;
    }

    groups.forEach(group => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '6px 0';
        item.style.borderBottom = '1px solid #eee';

        const name = document.createElement('span');
        name.textContent = group.name;
        name.style.cursor = 'pointer';
        name.style.flex = '1';
        name.onclick = () => {
            applyLayerGroup(group.config);
            panel.style.display = 'none';
        };

        const delBtn = document.createElement('button');
        delBtn.textContent = '×';
        delBtn.style.border = 'none';
        delBtn.style.background = 'none';
        delBtn.style.color = '#ff5252';
        delBtn.style.cursor = 'pointer';
        delBtn.style.fontSize = '1.2em';
        delBtn.style.padding = '0 5px';
        delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Delete group "${group.name}"?`)) {
                await deleteLayerGroup(group.id);
                refreshGroupList(panel);
            }
        };

        item.appendChild(name);
        item.appendChild(delBtn);
        panel.appendChild(item);
    });
}
