import { state } from '../state/store.js';
import { updateAllOverlays } from '../map/overlays.js';
import { updateOsmDynamicLayers } from '../map/osmDynamicLayers.js';
import { updatePermalinkWithFeatures } from '../map/permalink.js';

/**
 * Creates the "Active Layers" panel (bottom-right)
 * Replaces the old OSM Legend and unifies all overlays
 */
export function createActiveLayersPanel() {
    if (state.activeLayersPanel) state.activeLayersPanel.remove();

    const panel = document.createElement('div');
    panel.className = 'active-layers-panel';
    panel.style.position = 'absolute';
    panel.style.bottom = '20px';
    panel.style.right = '20px';
    panel.style.background = 'rgba(255,255,255,0.95)';
    panel.style.border = '1px solid #ccc';
    panel.style.borderRadius = '8px';
    panel.style.padding = '12px 16px';
    panel.style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)';
    panel.style.zIndex = 1000;
    panel.style.fontSize = '0.9em';
    panel.style.minWidth = '220px';
    panel.style.maxWidth = '300px';
    panel.style.display = 'none'; // Hidden by default

    const title = document.createElement('div');
    title.textContent = 'Active Layers';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '8px';
    title.style.color = '#333';
    title.style.borderBottom = '1px solid #eee';
    title.style.paddingBottom = '6px';
    title.style.display = 'flex';
    title.style.justifyContent = 'space-between';
    title.style.alignItems = 'center';
    panel.appendChild(title);

    // Save Group button
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '💾 Save as Group';
    saveBtn.style.width = '100%';
    saveBtn.style.marginBottom = '10px';
    saveBtn.style.padding = '6px';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.border = '1px solid #1976d2';
    saveBtn.style.background = '#e3f2fd';
    saveBtn.style.color = '#1976d2';
    saveBtn.style.cursor = 'pointer';
    saveBtn.style.fontSize = '0.9em';
    saveBtn.style.fontWeight = 'bold';
    saveBtn.onclick = async () => {
        const name = prompt('Enter a name for this Layer Group:');
        if (name) {
            const { captureCurrentConfig } = await import('./layerGroupMenu.js');
            const { createLayerGroup: apiCreateGroup } = await import('../api/client.js');
            const config = captureCurrentConfig();
            const res = await apiCreateGroup({ name, config });
            if (res) alert(`Layer Group "${name}" saved!`);
            else alert('Failed to save layer group.');
        }
    };
    panel.appendChild(saveBtn);

    // Minimize button
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '−';
    toggleBtn.style.background = 'none';
    toggleBtn.style.border = 'none';
    toggleBtn.style.fontSize = '1.2em';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.padding = '0 5px';
    toggleBtn.onclick = () => {
        const content = panel.querySelector('.layers-list');
        if (content.style.display === 'none') {
            content.style.display = 'block';
            toggleBtn.textContent = '−';
        } else {
            content.style.display = 'none';
            toggleBtn.textContent = '+';
        }
    };
    title.appendChild(toggleBtn);

    const list = document.createElement('div');
    list.className = 'layers-list';
    list.style.maxHeight = '200px';
    list.style.overflowY = 'auto';
    panel.appendChild(list);

    document.body.appendChild(panel);
    state.activeLayersPanel = panel;
    return panel;
}

/**
 * Updates the panel with current state
 */
export function updateActiveLayersPanel() {
    if (!state.activeLayersPanel) return;

    const list = state.activeLayersPanel.querySelector('.layers-list');
    if (!list) return;

    list.innerHTML = '';
    let hasLayers = false;

    // Helper to add row
    const addRow = (title, color, onRemove) => {
        hasLayers = true;
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.marginBottom = '6px';
        row.style.justifyContent = 'space-between';
        row.style.background = 'rgba(0,0,0,0.02)';
        row.style.padding = '4px 6px';
        row.style.borderRadius = '4px';

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.style.overflow = 'hidden';

        if (color) {
            const dot = document.createElement('div');
            dot.style.width = '10px';
            dot.style.height = '10px';
            dot.style.background = color;
            dot.style.borderRadius = '50%';
            dot.style.marginRight = '8px';
            dot.style.flexShrink = '0';
            left.appendChild(dot);
        }

        const label = document.createElement('span');
        label.textContent = title;
        label.title = title;
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.maxWidth = '140px';
        label.style.fontSize = '0.85em';
        left.appendChild(label);

        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '&times;';
        removeBtn.style.background = 'none';
        removeBtn.style.border = 'none';
        removeBtn.style.color = '#999';
        removeBtn.style.fontSize = '1.2em';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.marginLeft = '8px';
        removeBtn.style.padding = '0 4px';
        removeBtn.onmouseenter = () => removeBtn.style.color = 'red';
        removeBtn.onmouseleave = () => removeBtn.style.color = '#999';
        removeBtn.onclick = onRemove;

        row.appendChild(left);
        row.appendChild(removeBtn);
        list.appendChild(row);
    };

    // 1. Dynamic OSM Layers
    if (state.activeOsmFeatures && state.activeOsmFeatures.length > 0) {
        state.activeOsmFeatures.forEach(f => {
            addRow(`${f.key}=${f.value}`, f.color, () => {
                state.activeOsmFeatures = state.activeOsmFeatures.filter(x => x.id !== f.id);
                updateOsmDynamicLayers();
                updateActiveLayersPanel();
                updatePermalinkWithFeatures();
            });
        });
    }

    // 2. Static OSM Layers
    if (state.osmSelectedIds && state.osmSelectedIds.length > 0) {
        state.osmSelectedIds.forEach(id => {
            const item = state.osmItems.find(i => i.id === id);
            const title = item ? item.title : id;
            const color = state.osmAssignedColors[id] || '#666';
            addRow(title, color, () => {
                state.osmSelectedIds = state.osmSelectedIds.filter(x => x !== id);
                updateAllOverlays();
                // Dropdown update handled via state sync or manually refreshing UI not needed if dropdown reads state on render
                // But we need to update the checkboxes in dropdown if visible.
                // The dropdown re-renders on its own next open, but live update is tricky.
                // We'll rely on permalink or just map update.
                updateActiveLayersPanel();
                updatePermalinkWithFeatures();
                // Re-render dropdowns if possible? 
                // In mountOverlaySelectors we pass a callback, but here we modify state directly.
                // Ideally we should dispatch an event or rebuild dropdowns.
                if (window.osmOverlaySelectorDiv) {
                    // Trigger click on matching checkbox? Or just trust user to reopen.
                    // We will just update map.
                }
            });
        });
    }

    // 3. Digiroad Layers
    if (state.digiroadOverlayLayers && state.digiroadOverlayLayers.length > 0) {
        state.digiroadOverlayLayers.forEach(name => {
            const item = state.digiroadOverlayList.find(i => i.name === name);
            const title = item ? item.title : name;
            addRow(title, 'blue', () => { // WMS usually blue/standard
                state.digiroadOverlayLayers = state.digiroadOverlayLayers.filter(x => x !== name);
                updateAllOverlays();
                updateActiveLayersPanel();
                updatePermalinkWithFeatures();
            });
        });
    }

    // 4. Generic Overlays
    if (state.genericOverlayLayers && state.genericOverlayLayers.length > 0) {
        state.genericOverlayLayers.forEach(name => {
            const item = state.genericOverlayList.find(i => i.name === name);
            const title = item ? item.title : name;
            addRow(title, 'green', () => {
                state.genericOverlayLayers = state.genericOverlayLayers.filter(x => x !== name);
                updateAllOverlays();
                updateActiveLayersPanel();
                updatePermalinkWithFeatures();
            });
        });
    }

    state.activeLayersPanel.style.display = hasLayers ? 'block' : 'none';
}
