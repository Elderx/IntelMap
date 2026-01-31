import { state } from '../state/store.js';
import { showOSMPopup, hideOSMPopup, formatOSMFeatureInfo } from '../ui/osmPopup.js';
import { openUserFeatureForm } from '../ui/userFeatureForm.js';
import { openFeaturePicker } from '../ui/featurePicker.js';
import { updateMarker, deleteMarker, updatePolygon, deletePolygon, updateCircle, deleteCircle } from '../api/client.js';
import { getThemeColor } from '../ui/themeHelpers.js';
import { updateUserMarkerById, updateUserPolygonById, updateUserCircleById, removeUserMarkerById, removeUserPolygonById, removeUserCircleById } from './userLayers.js';
import { disableOverlayInfoClickHandlers, enableOverlayInfoClickHandlers } from '../map/overlayInfoClick.js';

export function setupUserFeatureHover(mapObj) {
  if (!mapObj) return;

  let activeUserFeature = null;

  mapObj.on('pointermove', function (evt) {
    if (state.drawingMode) return;
    const hit = mapObj.forEachFeatureAtPixel(evt.pixel, function (feature, layer) {
      if (feature && (feature.get('userType') === 'marker' || feature.get('userType') === 'polygon' || feature.get('userType') === 'circle')) return feature;
    }, {
      hitTolerance: 5,
      layerFilter: (layer) => {
        // Only check layers that are NOT OSM layers
        return layer && !layer.get('osmId');
      }
    });

    if (hit) {
      activeUserFeature = hit;
      const userType = hit.get('userType');
      const title = hit.get('title') || (userType === 'marker' ? 'Marker' : userType === 'polygon' ? 'Polygon' : 'Circle');
      const color = hit.get('color') || '#1976d2';
      const desc = hit.get('description') || '';
      const c = getThemeColor();

      // We pass HTML content for user features
      const html = `
        <div style="margin-bottom:6px;font-weight:bold;color:${color}">${title}</div>
        ${desc ? `<div style="font-size:0.9em;color:${c.textMuted}">${desc}</div>` : ''}
      `;
      showOSMPopup(html, evt.pixel, false, mapObj);
      mapObj.getTargetElement().style.cursor = 'pointer';
    } else {
      // ONLY hide if we were previously hovering a user feature
      if (activeUserFeature) {
        activeUserFeature = null;
        hideOSMPopup(false);
        mapObj.getTargetElement().style.cursor = '';
      }
    }
  });
}

export function setupUserFeatureClick(mapObj) {
  if (!mapObj) return;
  mapObj.on('singleclick', function (evt) {
    if (state.drawingMode) return;
    const feats = mapObj.getFeaturesAtPixel(evt.pixel, {
      hitTolerance: 5,
      layerFilter: (layer) => layer && !layer.get('osmId')
    }) || [];
    const userFeats = feats.filter(f => f && (f.get('userType') === 'marker' || f.get('userType') === 'polygon' || f.get('userType') === 'circle'));
    if (userFeats.length === 0) return;

    const handleEdit = async (feature) => {
      const userType = feature.get('userType');
      const dbId = feature.get('dbId');
      const current = {
        title: feature.get('title') || '',
        description: feature.get('description') || '',
        color: feature.get('color') || (userType === 'marker' ? '#00bcd4' : userType === 'polygon' ? '#ff9800' : '#2196f3'),
        opacity: feature.get('opacity') !== undefined ? feature.get('opacity') : (userType === 'circle' ? 0.3 : undefined)
      };
      const ownerUsername = feature.get('ownerUsername') || null;
      const selectedShared = feature.get('sharedUserIds') || [];
      const { fetchUsers } = await import('../api/client.js');
      const users = await fetchUsers();
      disableOverlayInfoClickHandlers();
      openUserFeatureForm(userType, current, async (meta) => {
        if (!dbId) { enableOverlayInfoClickHandlers(); return; }
        const body = { title: meta.title, description: meta.description, color: meta.color, sharedUserIds: meta.sharedUserIds || [] };
        if (userType === 'marker') {
          await updateMarker(dbId, body);
          updateUserMarkerById(dbId, { title: meta.title, description: meta.description, color: meta.color, sharedUserIds: body.sharedUserIds });
        } else if (userType === 'polygon') {
          await updatePolygon(dbId, body);
          updateUserPolygonById(dbId, { title: meta.title, description: meta.description, color: meta.color, sharedUserIds: body.sharedUserIds });
        } else {
          body.opacity = meta.opacity;
          await updateCircle(dbId, body);
          updateUserCircleById(dbId, { title: meta.title, description: meta.description, color: meta.color, opacity: meta.opacity, sharedUserIds: body.sharedUserIds });
        }
        enableOverlayInfoClickHandlers();
      }, () => {
        enableOverlayInfoClickHandlers();
      }, {
        allowDelete: !!dbId,
        onDelete: async () => {
          if (!dbId) { enableOverlayInfoClickHandlers(); return; }
          if (userType === 'marker') {
            await deleteMarker(dbId);
            removeUserMarkerById(dbId);
          } else if (userType === 'polygon') {
            await deletePolygon(dbId);
            removeUserPolygonById(dbId);
          } else {
            await deleteCircle(dbId);
            removeUserCircleById(dbId);
          }
          enableOverlayInfoClickHandlers();
        },
        users,
        ownerUsername,
        selectedSharedIds: selectedShared
      });
    };

    if (userFeats.length === 1) {
      handleEdit(userFeats[0]);
    } else {
      openFeaturePicker(userFeats, handleEdit, () => { });
    }
  });
}
