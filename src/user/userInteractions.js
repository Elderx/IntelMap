import { state } from '../state/store.js';
import { showOSMPopup, hideOSMPopup, formatOSMFeatureInfo } from '../ui/osmPopup.js';
import { openUserFeatureForm } from '../ui/userFeatureForm.js';
import { openFeaturePicker } from '../ui/featurePicker.js';
import { updateMarker, deleteMarker, updatePolygon, deletePolygon } from '../api/client.js';
import { updateUserMarkerById, updateUserPolygonById, removeUserMarkerById, removeUserPolygonById } from './userLayers.js';
import { disableOverlayInfoClickHandlers, enableOverlayInfoClickHandlers } from '../map/overlayInfoClick.js';

export function setupUserFeatureHover(mapObj) {
  if (!mapObj) return;

  mapObj.on('pointermove', function(evt) {
    if (state.drawingMode) return;
    const hit = mapObj.forEachFeatureAtPixel(evt.pixel, function(feature, layer) {
      if (feature && (feature.get('userType') === 'marker' || feature.get('userType') === 'polygon')) return feature;
    });
    if (hit) {
      const title = hit.get('title') || (hit.get('userType') === 'marker' ? 'Marker' : 'Polygon');
      const color = hit.get('color') || '#1976d2';
      const desc = hit.get('description') || '';
      const fakeFeature = { getProperties: () => ({ title, description: desc }), getGeometry: () => ({ getType: () => hit.get('userType') === 'marker' ? 'Point' : 'Polygon' }) };
      const html = `
        <div style="margin-bottom:6px;font-weight:bold;color:${color}">${title}</div>
        ${desc ? `<div style="font-size:0.9em;color:#555">${desc}</div>` : ''}
      `;
      showOSMPopup(html, evt.pixel, false);
      mapObj.getTargetElement().style.cursor = 'pointer';
    } else {
      hideOSMPopup(false);
      mapObj.getTargetElement().style.cursor = '';
    }
  });
}

export function setupUserFeatureClick(mapObj) {
  if (!mapObj) return;
  mapObj.on('singleclick', function(evt) {
    if (state.drawingMode) return;
    const feats = mapObj.getFeaturesAtPixel(evt.pixel) || [];
    const userFeats = feats.filter(f => f && (f.get('userType') === 'marker' || f.get('userType') === 'polygon'));
    if (userFeats.length === 0) return;

    const handleEdit = async (feature) => {
      const userType = feature.get('userType');
      const dbId = feature.get('dbId');
      const current = {
        title: feature.get('title') || '',
        description: feature.get('description') || '',
        color: feature.get('color') || (userType === 'marker' ? '#00bcd4' : '#ff9800')
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
        } else {
          await updatePolygon(dbId, body);
          updateUserPolygonById(dbId, { title: meta.title, description: meta.description, color: meta.color, sharedUserIds: body.sharedUserIds });
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
          } else {
            await deletePolygon(dbId);
            removeUserPolygonById(dbId);
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
      openFeaturePicker(userFeats, handleEdit, () => {});
    }
  });
}
