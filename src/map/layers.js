import TileLayer from 'ol/layer/Tile.js';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS.js';
import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import { applyStyle } from 'ol-mapbox-style';
import { hardcodedLayers, apiKey, tileMatrixSet, tileCacheUrl } from '../config/constants.js';

// Build tile URLs with optional cache proxy prefix
function buildTileUrl(baseUrl, path) {
  if (tileCacheUrl) {
    return `${tileCacheUrl}${path}`;
  }
  return `${baseUrl}${path}`;
}

export function createTileLayerFromList(result, layerId, onError, mapboxAccessToken) {
  const layerInfo = hardcodedLayers.find(l => l.id === layerId);

  if (layerInfo && layerInfo.type === 'osm') {
    // OSM tiles - route through cache proxy if available
    const osmUrl = tileCacheUrl
      ? `${tileCacheUrl}/tiles/osm/{z}/{x}/{y}.png`
      : undefined; // Use default OSM source
    return new TileLayer({
      opacity: 1,
      source: osmUrl ? new XYZ({ url: osmUrl, attributions: '© OpenStreetMap contributors' }) : new OSM()
    });
  }

  if (layerInfo && layerInfo.type === 'mapbox') {
    // Mapbox styles - currently not routed through cache (complex style loading)
    // TODO: Implement Mapbox tile caching via style transformation
    const vtLayer = new VectorTileLayer({ declutter: true, visible: true });
    applyStyle(vtLayer, layerInfo.styleUrl, { accessToken: mapboxAccessToken });
    return vtLayer;
  }

  if (layerInfo && layerInfo.type === 'esri_sat') {
    // Esri World Imagery - route through cache proxy if available
    const esriUrl = tileCacheUrl
      ? `${tileCacheUrl}/tiles/esri/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
      : 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    return new TileLayer({
      opacity: 1,
      source: new XYZ({ url: esriUrl, attributions: 'Tiles © Esri' })
    });
  }

  if (layerInfo && layerInfo.type === 'cartodb_dark') {
    // CartoDB Dark - route through cache proxy if available
    // Note: CartoDB uses subdomains a-c, we handle this in nginx config
    const cartoUrl = tileCacheUrl
      ? `${tileCacheUrl}/tiles/carto/{a-c}/dark_all/{z}/{x}/{y}{r}.png`
      : 'https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    return new TileLayer({
      opacity: 1,
      source: new XYZ({ url: cartoUrl, attributions: '© OpenStreetMap contributors © CARTO' })
    });
  }

  // WMTS layers (MML) - the capsUrl already routes through cache proxy
  // The tile URLs from capabilities are relative to the capabilities URL base
  const options = optionsFromCapabilities(result, { layer: layerId, matrixSet: tileMatrixSet, requestEncoding: 'REST' });

  // Modify tile load function to route through cache proxy
  const optionsWithApiKey = {
    ...options,
    tileLoadFunction: (tile, src) => {
      // If using cache proxy, rewrite the URL
      let tileUrl = src;
      if (tileCacheUrl && src.includes('avoin-karttakuva.maanmittauslaitos.fi')) {
        tileUrl = src.replace('https://avoin-karttakuva.maanmittauslaitos.fi', `${tileCacheUrl}/tiles/mml`);
      }
      tile.getImage().src = `${tileUrl}?api-key=${apiKey}`;
    }
  };

  const layer = new TileLayer({ opacity: 1, source: new WMTS(optionsWithApiKey) });
  if (onError) { layer.getSource().once('tileloaderror', onError); }
  return layer;
}


