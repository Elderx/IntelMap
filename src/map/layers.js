import TileLayer from 'ol/layer/Tile.js';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS.js';
import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import { applyStyle } from 'ol-mapbox-style';
import { hardcodedLayers, apiKey, tileMatrixSet, tileCacheUrl, nasaGibsBaseUrl } from '../config/constants.js';

// Build tile URLs with optional cache proxy prefix
function buildTileUrl(baseUrl, path) {
  if (tileCacheUrl) {
    return `${tileCacheUrl}${path}`;
  }
  return `${baseUrl}${path}`;
}

export function createTileLayerFromList(result, layerId, onError, mapboxAccessToken, overrideDate) {
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

  if (layerInfo && layerInfo.type === 'mapant') {
    // MapAnt Orienteering Map - using Web Mercator (Choice 2 from docs)
    // Using the direct EPSG:3857 optimized script found in examples.
    // dim=0 or omitting it means full brightness. 
    // Choice (2) documentation says &dim=0.7 is a good value.
    // template: wmts_EPSG3857.php?z={z}&x={x}&y={y}
    const template = 'wmts_EPSG3857.php?z={z}&x={x}&y={y}&dim=0';
    const mapantUrl = tileCacheUrl
      ? `${tileCacheUrl}/tiles/mapant/${template}`
      : `https://wmts.mapant.fi/${template}`;
    return new TileLayer({
      opacity: 1,
      source: new XYZ({
        url: mapantUrl,
        attributions: 'Map &copy; <a href="http://www.mapant.fi/">MapAnt.fi</a>',
        maxZoom: 19
      })
    });
  }

  if (layerInfo && layerInfo.type === 'nasa') {
    // NASA GIBS Layers - route through cache proxy if available
    const date = overrideDate || layerInfo.date; // Use override date if provided, otherwise default
    const nasaId = layerInfo.nasaLayerId;
    const format = layerInfo.format || 'jpeg';
    const matrixSet = layerInfo.matrixSet || 'GoogleMapsCompatible_Level8';

    // Path template depends on whether the layer requires a date parameter
    const path = date
      ? `/wmts/epsg3857/best/${nasaId}/default/${date}/${matrixSet}/{z}/{y}/{x}.${format}`
      : `/wmts/epsg3857/best/${nasaId}/default/${matrixSet}/{z}/{y}/{x}.${format}`;

    const nasaUrl = tileCacheUrl
      ? `${tileCacheUrl}/tiles/nasa${path}`
      : `https://gibs.earthdata.nasa.gov${path}`;

    return new TileLayer({
      opacity: 1,
      source: new XYZ({
        url: nasaUrl,
        attributions: 'Imagery © <a href="https://earthdata.nasa.gov">NASA GIBS</a>',
        maxZoom: matrixSet.endsWith('Level9') ? 9 : 8
      })
    });
  }
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


