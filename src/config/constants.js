// Centralized configuration and constants

export const mapboxAccessToken = 'pk.eyJ1IjoiZWxkZXJ4IiwiYSI6ImNqdHNrdHlmbDA1bjczem81ZTQzZnJ3engifQ.2PoeE03vtRBPj1D_-ESbrw';
export const apiKey = '977cd66e-8512-460a-83d3-cb405325c3ff';
export const epsg = 'EPSG:3857';
export const tileMatrixSet = 'WGS84_Pseudo-Mercator';

// Tile cache proxy URL (set via VITE_TILE_CACHE_URL env var)
// - If set: use absolute URL to proxy (e.g., http://localhost:8888 for local dev)
// - If empty: use relative paths (proxied by Caddy to cache-proxy:8888)
export const tileCacheUrl = import.meta.env.VITE_TILE_CACHE_URL || '';

// Original external URLs (for reference, not used directly)
export const mmlBaseUrl = 'https://avoin-karttakuva.maanmittauslaitos.fi';
export const osmBaseUrl = 'https://tile.openstreetmap.org';
export const mapboxBaseUrl = 'https://api.mapbox.com';
export const esriBaseUrl = 'https://services.arcgisonline.com';
export const cartoBaseUrl = 'https://basemaps.cartocdn.com';
export const digiroadBaseUrl = 'https://avoinapi.vaylapilvi.fi';
export const fmiWmsBaseUrl = 'https://openwms.fmi.fi/geoserver/wms';
export const nasaGibsBaseUrl = 'https://gibs.earthdata.nasa.gov';

// Computed URLs - use cache proxy URL if set, otherwise relative paths
export const capsUrl = tileCacheUrl
  ? `${tileCacheUrl}/tiles/mml/avoin/wmts/1.0.0/WMTSCapabilities.xml?api-key=${apiKey}`
  : `/tiles/mml/avoin/wmts/1.0.0/WMTSCapabilities.xml?api-key=${apiKey}`;

export const wmsUrl = tileCacheUrl
  ? `${tileCacheUrl}/wms/digiroad/vaylatiedot/digiroad/wms`
  : `/wms/digiroad/vaylatiedot/digiroad/wms`;

export const wmsCapabilitiesUrl = tileCacheUrl
  ? `${tileCacheUrl}/wms/digiroad/vaylatiedot/digiroad/wms?request=getcapabilities&service=wms`
  : `/wms/digiroad/vaylatiedot/digiroad/wms?request=getcapabilities&service=wms`;

export const fmiWmsUrl = tileCacheUrl
  ? `${tileCacheUrl}/wms/fmi`
  : `/wms/fmi`;

// Mapbox base URL and attribution (kept for potential future use)
export const mbUrl = 'https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoiZWxkZXJ4IiwiYSI6ImNqdHNrdHlmbDA1bjczem81ZTQzZnJ3engifQ.2PoeE03vtRBPj1D_-ESbrw';
export const mbAttr = '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const mapantBaseUrl = 'http://wmts.mapant.fi/wmts.php';

export const hardcodedLayers = [
  { id: 'taustakartta', name: 'Taustakartta', type: 'wmts' },
  { id: 'maastokartta', name: 'Maastokartta', type: 'wmts' },
  { id: 'selkokartta', name: 'Selkokartta', type: 'wmts' },
  { id: 'ortokuva', name: 'Ortokuva', type: 'wmts' },
  { id: 'mapant', name: 'MapAnt', type: 'mapant' },
  { id: 'osm', name: 'OpenStreetMap', type: 'osm' },
  { id: 'mapbox_light', name: 'Mapbox Light', type: 'mapbox', styleUrl: 'mapbox://styles/mapbox/light-v11' },
  { id: 'mapbox_dark', name: 'Mapbox Dark', type: 'mapbox', styleUrl: 'mapbox://styles/mapbox/dark-v11' },
  { id: 'mapbox_streets', name: 'Mapbox Streets', type: 'mapbox', styleUrl: 'mapbox://styles/mapbox/streets-v12' },
  { id: 'mapbox_outdoors', name: 'Mapbox Outdoors', type: 'mapbox', styleUrl: 'mapbox://styles/mapbox/outdoors-v12' },
  { id: 'esri_world_imagery', name: 'Esri World Imagery', type: 'esri_sat' },
  { id: 'cartodb_dark', name: 'CartoDB Dark', type: 'cartodb_dark' },
  { id: 'nasa_blue_marble', name: 'NASA Blue Marble', type: 'nasa', nasaLayerId: 'BlueMarble_ShadedRelief_Bathymetry', format: 'jpeg', matrixSet: 'GoogleMapsCompatible_Level8' },
  { id: 'nasa_night_lights', name: 'NASA Night Lights', type: 'nasa', nasaLayerId: 'VIIRS_SNPP_DayNightBand_ENCC', date: '2023-07-07', format: 'png', matrixSet: 'GoogleMapsCompatible_Level8', hasTime: true },
  { id: 'nasa_clouds', name: 'NASA Daily Clouds', type: 'nasa', nasaLayerId: 'MODIS_Terra_CorrectedReflectance_TrueColor', date: '2024-01-15', format: 'jpeg', matrixSet: 'GoogleMapsCompatible_Level9', hasTime: true },
  { id: 'opentopomap', name: 'OpenTopoMap', type: 'opentopomap' },
  { id: 'tf_outdoors', name: 'Thunderforest Outdoors', type: 'thunderforest', tfLayer: 'outdoors' },
  { id: 'tf_transport_dark', name: 'Thunderforest Transport Dark', type: 'thunderforest', tfLayer: 'transport-dark' },
  { id: 'tf_mobile_atlas', name: 'Thunderforest Mobile Atlas', type: 'thunderforest', tfLayer: 'mobile-atlas' },
  { id: 'tf_landscape', name: 'Thunderforest Landscape', type: 'thunderforest', tfLayer: 'landscape' },
  { id: 'jawg_dark', name: 'Jawg Dark', type: 'jawg', jawgLayer: 'jawg-dark' },
  { id: 'jawg_streets', name: 'Jawg Streets', type: 'jawg', jawgLayer: 'jawg-streets' },
  { id: 'arcgis_natgeo', name: 'ArcGIS NatGeo World Map', type: 'arcgis_xyz', arcgisService: 'NatGeo_World_Map' },
  { id: 'arcgis_light_gray', name: 'ArcGIS World Light Gray Base', type: 'arcgis_xyz', arcgisService: 'Canvas/World_Light_Gray_Base' },
  { id: 'stadia_alidade_satellite', name: 'Stadia Alidade Satellite', type: 'stadia', stadiaLayer: 'alidade_satellite' },
  { id: 'stadia_alidade_smooth_dark', name: 'Stadia Alidade Smooth Dark', type: 'stadia', stadiaLayer: 'alidade_smooth_dark' }
];

// OpenSky Network API configuration
export const OPENSKY_CONFIG = {
  baseUrl: 'https://opensky-network.org/api',
  updateIntervalSeconds: 11,      // Default 11s, configurable via UI
  minIntervalSeconds: 11,         // Minimum allowed (safety margin for API limits)
  aircraftIconScale: 1,           // Icon size multiplier
  aircraftIconColor: '#1e88e5',   // Default aircraft icon color (blue)
};

export const AIS_OVERLAY_CONFIG = {
  wsUrl: 'wss://meri.digitraffic.fi:443/mqtt',
  clientName: 'IntelMap AIS/1.0',
  topics: {
    location: 'vessels-v2/+/location',
    metadata: 'vessels-v2/+/metadata'
  },
  reconnectPeriodMs: 5000,
  connectTimeoutMs: 10000,
  keepaliveSeconds: 30,
  staleAfterMs: 30 * 60 * 1000,
  pruneIntervalMs: 60 * 1000,
  zIndex: 105,
  colors: {
    passenger: '#1565c0',
    cargo: '#2e7d32',
    tanker: '#c62828',
    service: '#f9a825',
    unknown: '#455a64'
  }
};

export function getAisOverlayRuntimeConfig() {
  if (typeof window === 'undefined') {
    return AIS_OVERLAY_CONFIG;
  }

  const overrides = window.__INTELMAP_AIS_TEST_CONFIG__ || {};
  return {
    ...AIS_OVERLAY_CONFIG,
    staleAfterMs: overrides.staleAfterMs ?? AIS_OVERLAY_CONFIG.staleAfterMs,
    pruneIntervalMs: overrides.pruneIntervalMs ?? AIS_OVERLAY_CONFIG.pruneIntervalMs
  };
}

export const TRAFFIC_CAMERA_CONFIG = {
  locationsUrl: 'https://services1.arcgis.com/rhs5fjYxdOG1Et61/ArcGIS/rest/services/WeatherCams/FeatureServer/0/query?f=json&spatialRel=esriSpatialRelIntersects&returnGeometry=true&outFields=CameraId%2C%20Municipality%2C%20Region%2C%20RegionCode%2C%20Name_FI%2C%20Name_SV%2C%20Name_EN%2C%20RoadAddress%2C%20CameraActive%2C%20NearestWeatherStationId%2C%20Region_SV%2C%20Region_EN%2C%20RoadStationId%2C%20CollectionStatus%2C%20State&where=CollectionStatus%20NOT%20IN%20(%27REMOVED_PERMANENTLY%27)',
  presetsUrl: 'https://services1.arcgis.com/rhs5fjYxdOG1Et61/ArcGIS/rest/services/WeatherCams/FeatureServer/1/query?f=json&outFields=CameraId%2C%20PresetId%2C%20DirectionName%2C%20ImageUrl%2C%20PicLastModified%2C%20PresetActive%2C%20InCollection%2C%20CameraResolution&where=1%3D1',
  cameraPageBaseUrl: 'https://liikennetilanne.fintraffic.fi/kelikamerat/',
  zIndex: 107
};

// FMI (Finnish Meteorological Institute) API configuration
export const FMI_CONFIG = {
  // WMS Service (pre-rendered weather maps)
  wmsUrl: fmiWmsUrl,
  wmsVersion: '1.3.0',
  wmsFormat: 'image/png',
  wmsTransparent: true,

  // WFS Service (weather station observations)
  wfsBaseUrl: 'https://opendata.fmi.fi/wfs',
  storedQueryId: 'fmi::observations::weather::simple',

  // Finland bounding box (WGS84) - ensures all Finnish stations are fetched
  // Format: [minLon, minLat, maxLon, maxLat]
  finlandBbox: [19.0, 59.0, 32.0, 70.5],

  // Layer names for WMS
  layers: {
    temperature: 'flash:temperature',
    wind: 'flash:windspeed',
    precipitation: 'flash:precipitation'
  },

  // Polling interval (10 minutes)
  pollingIntervalMs: 600000,
  pollingIntervalSec: 600,

  // Z-index for layer stacking
  zIndex: {
    temperature: 55,
    wind: 56,
    precipitation: 57,
    stations: 106
  }
};
export const TRAIN_OVERLAY_CONFIG = {
  locationsUrl: 'https://rata.digitraffic.fi/api/v1/train-locations.geojson/latest/',
  trainDetailsBaseUrl: 'https://rata.digitraffic.fi/api/v1/trains/latest',
  stationsUrl: 'https://rata.digitraffic.fi/api/v1/metadata/stations.geojson',
  locationsRefreshIntervalMs: 10000,
  zIndex: {
    stations: 204,
    locations: 205
  },
  colors: {
    moving: '#d32f2f',
    slow: '#f9a825',
    unknown: '#546e7a',
    passengerStation: '#1565c0',
    nonPassengerStation: '#6d4c41'
  }
};
