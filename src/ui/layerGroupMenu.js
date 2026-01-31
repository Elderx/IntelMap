import { state } from '../state/store.js';
import { createLayerGroup, fetchLayerGroups, deleteLayerGroup } from '../api/client.js';
import { updateAllOverlays } from '../map/overlays.js';
import { updateOsmDynamicLayers } from '../map/osmDynamicLayers.js';
import { updatePermalinkWithFeatures } from '../map/permalink.js';
import { updateOSMLegend } from './osmLegend.js';
import { updateLayerGroupCheckboxes } from './headerLayerManager.js';
import { getThemeColor } from './themeHelpers.js';

/**
 * Ensure all active layer groups have a color assigned
 */
export function ensureLayerGroupColors() {
    state.activeLayerGroupIds.forEach(idInput => {
        const groupId = parseInt(idInput, 10);
        if (isNaN(groupId)) return;
        if (!state.layerGroupAssignedColors[groupId]) {
            const usedColors = Object.values(state.layerGroupAssignedColors);
            const availableColor = state.osmColorPalette.find(c => !usedColors.includes(c));
            state.layerGroupAssignedColors[groupId] = availableColor || state.osmColorPalette[Object.keys(state.layerGroupAssignedColors).length % state.osmColorPalette.length];
        }
    });
}

/**
 * Toggle a layer group in the current session
 */
export function toggleLayerGroup(group) {
    if (!group || !group.id) return;

    const groupId = parseInt(group.id, 10);
    const idx = state.activeLayerGroupIds.indexOf(groupId);
    const isActivating = idx === -1;

    if (isActivating) {
        state.activeLayerGroupIds.push(groupId);
        ensureLayerGroupColors();

        // Apply basemap if present in config (last selected group wins for basemap)
        if (group.config && group.config.basemapId) {
            const selector = document.getElementById('baseLayerSelector');
            if (selector) {
                selector.value = group.config.basemapId;
                selector.dispatchEvent(new Event('change'));
            }
        }
    } else {
        state.activeLayerGroupIds.splice(idx, 1);
        // We keep the color assignment for consistency if they re-enable it?
        // Or we could delete it. Let's keep it for now.
    }

    console.log('[LayerGroups] Toggled:', group.name, 'Active:', state.activeLayerGroupIds);

    // Trigger updates
    updateAllOverlays();
    updateOsmDynamicLayers();
    updateOSMLegend();
    updatePermalinkWithFeatures();

    // Update the Active Layers panel (it will show the groups now)
    import('./activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());

    // Refresh labels in dropdowns (to show checked items from group)
    refreshOverlayDropdowns();

    // Sync checkboxes in header dropdown
    updateLayerGroupCheckboxes();
}

/**
 * Apply a layer group configuration (Lecagy support if needed, but we now use toggle)
 */
export function applyLayerGroup(config) {
    // This is now handled via toggleLayerGroup for individual groups.
    // If we want to support "bulk application" we can implement it.
}

function refreshOverlayDropdowns() {
    // Trigger UI refresh for dropdown summaries and checkboxes
    // Since we don't have a state-driven UI framework, we might need a hack.
    // However, the dropdowns re-render checkboxes on next open.
    // To update the BUTTON TEXT (summary), we search for buttons.
    const container = document.querySelector('.ui-column-container');
    if (!container) return;

    // This is hard without re-running createOverlayDropdown logic or having it listen to state.
    // For now, let's at least update the Active Layers panel which is more important.
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
    const c = getThemeColor();
    const container = document.createElement('div');
    container.id = 'layer-group-menu-container';
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.marginTop = '8px';

    const button = document.createElement('button');
    button.className = 'overlay-dropdown-btn';
    button.style.width = '100%';
    button.style.textAlign = 'left';
    button.style.padding = '10px 12px';
    button.style.borderRadius = '8px';
    button.style.border = `1px solid ${c.primary}`;
    button.style.background = c.bgLight;
    button.style.cursor = 'pointer';
    button.style.fontWeight = 'bold';
    button.style.color = c.primary;
    button.style.fontSize = '0.95em';
    button.style.display = 'flex';
    button.style.justifyContent = 'space-between';
    button.style.alignItems = 'center';

    const labelSpan = document.createElement('span');
    labelSpan.textContent = '📂 Layer Groups';
    button.appendChild(labelSpan);

    const arrowSpan = document.createElement('span');
    arrowSpan.textContent = '▾';
    arrowSpan.style.color = c.primary;
    button.appendChild(arrowSpan);

    const panel = document.createElement('div');
    panel.className = 'overlay-dropdown-panel';
    panel.style.display = 'none';
    panel.style.position = 'relative';
    panel.style.marginTop = '4px';
    panel.style.width = '100%';
    panel.style.background = c.bgElevated;
    panel.style.padding = '10px 12px';
    panel.style.borderRadius = '10px';
    panel.style.border = `1px solid ${c.bgLighter}`;
    panel.style.boxSizing = 'border-box';
    panel.style.maxHeight = '300px';
    panel.style.overflowY = 'auto';

    container.appendChild(button);
    container.appendChild(panel);

    // Initial fetch handled by bootstrap in main.js

    button.onclick = async (e) => {
        e.stopPropagation();
        const isVisible = panel.style.display === 'block';
        if (isVisible) {
            panel.style.display = 'none';
        } else {
            // Close other accordions
            const column = container.closest('.ui-column-container');
            if (column) {
                column.querySelectorAll('.overlay-dropdown-panel').forEach(p => {
                    if (p !== panel) p.style.display = 'none';
                });
            }
            panel.style.display = 'block';
            await refreshGroupList(panel);
        }
    };

    return container;
}

async function refreshGroupList(panel) {
    const c = getThemeColor();
    panel.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;color:${c.text};">Saved Groups:</div>`;

    const groups = await fetchLayerGroups();
    state.layerGroups = groups || [];
    if (!groups || groups.length === 0) {
        panel.innerHTML += `<div style="color:${c.textMuted};font-size:0.9em;">No saved groups</div>`;
        return;
    }

    groups.forEach(group => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '6px 0';
        item.style.borderBottom = `1px solid ${c.bgLighter}`;

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.style.flex = '1';
        left.style.cursor = 'pointer';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = state.activeLayerGroupIds.includes(parseInt(group.id, 10));
        checkbox.style.marginRight = '10px';
        checkbox.onclick = (e) => {
            e.stopPropagation(); // Prevent triggering parent's onclick
        };
        checkbox.onchange = (e) => {
            toggleLayerGroup(group);
        };
        left.appendChild(checkbox);

        const name = document.createElement('span');
        name.textContent = group.name;
        name.style.fontSize = '0.95em';
        name.style.color = c.text;
        left.appendChild(name);

        left.onclick = (e) => {
            checkbox.checked = !checkbox.checked;
            toggleLayerGroup(group);
        };

        const delBtn = document.createElement('button');
        delBtn.textContent = '×';
        delBtn.style.border = 'none';
        delBtn.style.background = 'none';
        delBtn.style.color = c.danger;
        delBtn.style.cursor = 'pointer';
        delBtn.style.fontSize = '1.2em';
        delBtn.style.padding = '0 5px';
        delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Delete group "${group.name}"?`)) {
                await deleteLayerGroup(group.id);
                // Remove from active if was active
                const idx = state.activeLayerGroupIds.indexOf(group.id);
                if (idx > -1) {
                    state.activeLayerGroupIds.splice(idx, 1);
                    updateAllOverlays();
                    updateOsmDynamicLayers();
                    import('./activeLayers.js').then(({ updateActiveLayersPanel }) => updateActiveLayersPanel());
                }
                refreshGroupList(panel);
            }
        };

        item.appendChild(left);
        item.appendChild(delBtn);
        panel.appendChild(item);
    });
}
