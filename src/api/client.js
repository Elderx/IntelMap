export async function apiGet(path) {
  try {
    const res = await fetch(path, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('bad_status');
    return await res.json();
  } catch (e) {
    console.warn('[api] GET failed', path, e.message);
    return null;
  }
}

export async function apiPost(path, body) {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('bad_status');
    return await res.json();
  } catch (e) {
    console.warn('[api] POST failed', path, e.message);
    return null;
  }
}

export async function fetchMarkers() {
  return await apiGet('/api/markers');
}

export async function fetchPolygons() {
  return await apiGet('/api/polygons');
}

export async function fetchCircles() {
  return await apiGet('/api/circles');
}

export async function createMarker(marker) {
  return await apiPost('/api/markers', marker);
}

export async function createPolygon(poly) {
  return await apiPost('/api/polygons', poly);
}

export async function createCircle(circle) {
  return await apiPost('/api/circles', circle);
}

export async function fetchUsers() {
  try {
    const res = await fetch('/api/users', { credentials: 'same-origin' });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

export async function updateMarker(id, marker) {
  return await apiPatch(`/api/markers/${id}`, marker);
}

export async function deleteMarker(id) {
  return await apiDelete(`/api/markers/${id}`);
}

export async function updatePolygon(id, poly) {
  return await apiPatch(`/api/polygons/${id}`, poly);
}

export async function deletePolygon(id) {
  return await apiDelete(`/api/polygons/${id}`);
}

export async function updateCircle(id, circle) {
  return await apiPatch(`/api/circles/${id}`, circle);
}

export async function deleteCircle(id) {
  return await apiDelete(`/api/circles/${id}`);
}

export async function fetchLayerGroups() {
  return await apiGet('/api/layer-groups');
}

export async function createLayerGroup(group) {
  return await apiPost('/api/layer-groups', group);
}

export async function deleteLayerGroup(id) {
  return await apiDelete(`/api/layer-groups/${id}`);
}

async function apiPatch(path, body) {
  try {
    const res = await fetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('bad_status');
    return await res.json();
  } catch (e) {
    console.warn('[api] PATCH failed', path, e.message);
    return null;
  }
}

async function apiDelete(path) {
  try {
    const res = await fetch(path, {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('bad_status');
    return true;
  } catch (e) {
    console.warn('[api] DELETE failed', path, e.message);
    return false;
  }
}

// OSM Tile Cache API
export async function fetchCachedTiles(layerId = null) {
  const path = layerId ? `/api/osm-tiles?layer_id=${encodeURIComponent(layerId)}` : '/api/osm-tiles';
  return await apiGet(path) || [];
}

export async function markTileAsCached(layerId, tileKey, bbox, featureCount = 0) {
  return await apiPost('/api/osm-tiles', {
    layer_id: layerId,
    tile_key: tileKey,
    bbox,
    feature_count: featureCount
  });
}

export async function clearTileCacheFromDb(layerId = null) {
  const path = layerId ? `/api/osm-tiles?layer_id=${encodeURIComponent(layerId)}` : '/api/osm-tiles';
  return await apiDelete(path);
}
