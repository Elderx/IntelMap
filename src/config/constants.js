// Centralized configuration and constants

export const mapboxAccessToken = 'pk.eyJ1IjoiZWxkZXJ4IiwiYSI6ImNqdHNrdHlmbDA1bjczem81ZTQzZnJ3engifQ.2PoeE03vtRBPj1D_-ESbrw';
export const apiKey = '977cd66e-8512-460a-83d3-cb405325c3ff';
export const epsg = 'EPSG:3857';
export const tileMatrixSet = 'WGS84_Pseudo-Mercator';

// Tile cache proxy URL (set via VITE_TILE_CACHE_URL env var, empty = direct access)
export const tileCacheUrl = import.meta.env.VITE_TILE_CACHE_URL || '';

// Original external URLs (used when cache proxy is not available)
export const mmlBaseUrl = 'https://avoin-karttakuva.maanmittauslaitos.fi';
export const osmBaseUrl = 'https://tile.openstreetmap.org';
export const mapboxBaseUrl = 'https://api.mapbox.com';
export const esriBaseUrl = 'https://services.arcgisonline.com';
export const cartoBaseUrl = 'https://basemaps.cartocdn.com';
export const digiroadBaseUrl = 'https://avoinapi.vaylapilvi.fi';
export const nasaGibsBaseUrl = 'https://gibs.earthdata.nasa.gov';

// Computed URLs - use cache proxy if available, otherwise direct
export const capsUrl = tileCacheUrl
  ? `${tileCacheUrl}/tiles/mml/avoin/wmts/1.0.0/WMTSCapabilities.xml?api-key=${apiKey}`
  : `${mmlBaseUrl}/avoin/wmts/1.0.0/WMTSCapabilities.xml?api-key=${apiKey}`;

export const wmsUrl = tileCacheUrl
  ? `${tileCacheUrl}/wms/digiroad/vaylatiedot/digiroad/wms`
  : `${digiroadBaseUrl}/vaylatiedot/digiroad/wms`;

export const wmsCapabilitiesUrl = tileCacheUrl
  ? `${tileCacheUrl}/wms/digiroad/vaylatiedot/digiroad/wms?request=getcapabilities&service=wms`
  : `${digiroadBaseUrl}/vaylatiedot/digiroad/wms?request=getcapabilities&service=wms`;

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


