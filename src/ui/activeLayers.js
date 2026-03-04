import { state } from '../state/store.js';
import { updateAllOverlays } from '../map/overlays.js';
import { updateOsmDynamicLayers } from '../map/osmDynamicLayers.js';
import { updatePermalinkWithFeatures } from '../map/permalink.js';
import { refreshDynamicOsmFeatures, updateAllLayerCheckboxes } from './headerLayerManager.js';
import { getThemeColor } from './themeHelpers.js';

/**
 * Creates the "Active Layers" panel (bottom-right)
 * Replaces the old OSM Legend and unifies all overlays
 */
export function createActiveLayersPanel() {
    if (state.activeLayersPanel) state.activeLayersPanel.remove();

    const panel = document.createElement('div');
    panel.className = 'active-layers-panel';
    const c = getThemeColor();
    panel.style.position = 'absolute';
    panel.style.bottom = '20px';
    panel.style.right = '20px';
    panel.style.background = c.bg;
    panel.style.border = `1px solid ${c.border}`;
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
    title.style.color = c.text;
    title.style.borderBottom = `1px solid ${c.bgLighter}`;
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
    saveBtn.style.border = `1px solid ${c.primary}`;
    saveBtn.style.background = c.bgLight;
    saveBtn.style.color = c.primary;
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
    toggleBtn.style.color = c.text;
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
        const c = getThemeColor();
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.marginBottom = '6px';
        row.style.justifyContent = 'space-between';
        row.style.background = c.bgLight;
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
        label.style.color = c.text;
        left.appendChild(label);

        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '&times;';
        removeBtn.style.background = 'none';
        removeBtn.style.border = 'none';
        removeBtn.style.color = c.textLight;
        removeBtn.style.fontSize = '1.2em';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.marginLeft = '8px';
        removeBtn.style.padding = '0 4px';
        removeBtn.onmouseenter = () => removeBtn.style.color = c.danger;
        removeBtn.onmouseleave = () => removeBtn.style.color = c.textLight;
        removeBtn.onclick = onRemove;

        row.appendChild(left);
        row.appendChild(removeBtn);
        list.appendChild(row);
    };

    // 0. Active Layer Groups
    if (state.activeLayerGroupIds && state.activeLayerGroupIds.length > 0) {
        state.activeLayerGroupIds.forEach(id => {
            const group = state.layerGroups.find(g => g.id === id);
            if (group) {
                const color = state.layerGroupAssignedColors[id] || '#666';
                addRow(`📁 ${group.name}`, color, async () => {
                    const { toggleLayerGroup } = await import('./layerGroupMenu.js');
                    toggleLayerGroup(group);
                });
            }
        });
        // Add a separator if there are more layers
        const hasOtherLayers = (state.activeOsmFeatures?.length > 0) || (state.osmSelectedIds?.length > 0) || (state.digiroadOverlayLayers?.length > 0) || (state.genericOverlayLayers?.length > 0);
        if (hasOtherLayers) {
            const c = getThemeColor();
            const sep = document.createElement('div');
            sep.style.borderBottom = `1px solid ${c.bgLighter}`;
            sep.style.margin = '8px 0';
            list.appendChild(sep);
        }
    }

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
                updateActiveLayersPanel();
                updatePermalinkWithFeatures();
                updateAllLayerCheckboxes();  // Sync checkboxes in header dropdown
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
                updateAllLayerCheckboxes();  // Sync checkboxes in header dropdown
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
                updateAllLayerCheckboxes();  // Sync checkboxes in header dropdown
            });
        });
    }

    // 5. Aircraft overlay
    if (state.aircraftEnabled) {
        const count = state.aircraftFeatures.length;
        const title = `✈️ Aircraft (${count})${state.aircraftError ? ' ⚠️' : ''}`;
        addRow(title, '#8B4513', async () => {
            const { stopAircraftUpdates } = await import('../aircraft/aircraftManager.js');
            const { cleanupAircraftInteractions } = await import('../aircraft/aircraftInteractions.js');
            stopAircraftUpdates();
            cleanupAircraftInteractions();
        });
    }

    // 6. AIS/Ships overlay
    if (state.aisEnabled) {
        const count = state.aisFeatures.length;
        const title = `🚢 Ships (${count})${state.aisError ? ' ⚠️' : ''}`;
        addRow(title, '#2196F3', async () => {
            const { stopAisUpdates } = await import('../ais/aisManager.js');
            stopAisUpdates();
        });
    }

    // 7. Weather overlay
    if (state.weatherEnabled && state.weatherStationFeatures.length > 0) {
        const stationCount = state.weatherStationFeatures.length;
        // For now, just show basic title (time updates happen via updateWeatherTimeDisplay)
        addRow(`🌤️ Weather (${stationCount})`, '#FF9800', async () => {
            const { stopWeatherUpdates } = await import('../weather/weatherManager.js');
            stopWeatherUpdates();
        });
    }

    // 8. Traffic camera overlay
    if (state.trafficCameraEnabled) {
        const title = `Traffic Cameras${state.trafficCameraError ? ' ⚠️' : ''}`;
        addRow(title, '#c0392b', async () => {
            const { stopTrafficCameraUpdates } = await import('../trafficCameras/trafficCameraManager.js');
            stopTrafficCameraUpdates();
        });
    }

    // 9. FMI Radar overlay
    if (state.radarEnabled) {
        const currentTime = state.radarLayer.main?.radarTimeSteps?.[state.radarLayer.main?.radarTimeIndex];
        const timeStr = currentTime ? new Date(currentTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const title = timeStr ? `📡 Radar (${timeStr})` : `📡 Radar`;
        addRow(title, '#9C27B0', async () => {
            const { disableRadar } = await import('../radar/radarManager.js');
            disableRadar();
        });
    }

    // 10. UAS Airspace overlay
    if (state.uasEnabled) {
        const count = state.uasFeatures.length;
        const title = `🚁 UAS Zones (${count})${state.uasError ? ' ⚠️' : ''}`;
        addRow(title, '#e74c3c', async () => {
            const { stopUAS } = await import('../airspace/uasManager.js');
            const { cleanupUASInteractions } = await import('../airspace/uasInteractions.js');
            cleanupUASInteractions();
            stopUAS();
        });
    }

    state.activeLayersPanel.style.display = hasLayers ? 'block' : 'none';

    // Refresh dynamic OSM features in header dropdown
    refreshDynamicOsmFeatures();
}
