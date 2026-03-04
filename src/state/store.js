// Lightweight global app state shared across modules

export const state = {
  map: null,
  leftMap: null,
  rightMap: null,
  isSplit: false,
  restoringFromPermalink: false,
  permalinkInitialized: false,
  markerCoords: null,
  lineCoords: null,
  polygonCoords: null,
  circleCoords: null, // { center: [lon, lat], radius: number }
  measureCoords: null,
  drawingMode: null,
  lastClickCoords: null,
  lastSearchCoords: null,

  clickMarkerLayer: null,
  leftClickMarkerLayer: null,
  rightClickMarkerLayer: null,
  searchMarkerLayer: null,
  leftSearchMarkerLayer: null,
  rightSearchMarkerLayer: null,

  drawnLineLayer: { main: null, left: null, right: null },
  drawnLineFeature: { main: null, left: null, right: null },
  drawnPolygonLayer: { main: null, left: null, right: null },
  drawnPolygonFeature: { main: null, left: null, right: null },
  drawnCircleLayer: { main: null, left: null, right: null },
  drawnCircleFeature: { main: null, left: null, right: null },
  measureLineLayer: { main: null, left: null, right: null },
  measureLineFeature: { main: null, left: null, right: null },
  measureLabelOverlay: { main: null, left: null, right: null },

  overlayLayers: [],
  overlayLayerObjects: { main: [], left: [], right: [] },
  wmsOverlayList: [],
  wmsOverlayLegends: {},
  digiroadOverlayList: [],
  digiroadOverlayLayers: [],
  genericOverlayList: [
    { name: 'openseamap', title: 'OpenSeaMap', type: 'openseamap' },
    { name: 'carto_dark_labels', title: 'Carto Dark Labels', type: 'xyz_overlay', url: 'https://{a-c}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' },
    { name: 'carto_light_labels', title: 'Carto Light Labels', type: 'xyz_overlay', url: 'https://{a-c}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' },
    { name: 'openrailwaymap', title: 'OpenRailwayMap', type: 'xyz_overlay', url: 'https://{a-c}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', attributions: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Map style: &copy; <a href="https://www.OpenRailwayMap.org">OpenRailwayMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)' },
    { name: 'waymarked_hiking', title: 'Waymarked Hiking', type: 'xyz_overlay', url: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', attributions: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Map style: &copy; <a href="https://waymarkedtrails.org">Waymarked Trails</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)' }
  ],
  genericOverlayLayers: [],
  genericOverlayLayerObjects: { main: [], left: [], right: [] },

  // OSM GeoJSON overlay state
  osmItems: [
    // Default examples; place files under /osm in the web root (public)
    { id: 'man_made_mast', title: 'Man Made: Mast', file: 'filtered_man_made_mast.geojson' },
    // Add more like: { id: 'highway_primary', title: 'Highway Primary', file: 'filtered_highway_primary.geojson' }
  ],
  osmSelectedIds: [],
  osmLayerObjects: { main: [], left: [], right: [] },

  // OSM interaction state
  osmHoverPopup: null,
  osmClickPopup: null,
  osmLegendDiv: null,
  osmColorPalette: [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#e67e22', '#34495e', '#f1c40f', '#e91e63',
    '#00bcd4', '#4caf50', '#ff9800', '#795548', '#607d8b'
  ],
  osmAssignedColors: {}, // Maps osmId to assigned color,

  // Dynamic OSM Feature Search State
  activeOsmFeatures: [], // { id, key, value, title, color, visible }
  osmDynamicLayerObjects: { main: [], left: [], right: [] },
  osmLocalOnlyMode: false, // When true, only display cached OSM data (no network requests)

  overlaySelectorDiv: null,
  overlayDropdownButton: null,
  overlayDropdownPanel: null,

  overlayInfoPopup: null,
  overlayInfoPopupCloser: null,
  overlayInfoClickHandlerMain: null,
  overlayInfoClickHandlerLeft: null,
  overlayInfoClickHandlerRight: null,

  leftMapMoveendListener: null,
  rightMapMoveendListener: null,

  leftLayerId: null,
  rightLayerId: null,
  currentLayerId: null,
  selectedDate: null,
  leftDate: null,
  rightDate: null,
  initialLayerIdx: 1,
  drawInteraction: null,
  markerClickHandlerActive: false,
  markerClickHandlerActiveLeft: false,
  markerClickHandlerActiveRight: false,
  handleMapClick: null,

  // User-created features persisted to server
  userMarkers: [], // { id, lon, lat, title, description, color }
  userPolygons: [], // { id, coordinates:[[lon,lat],...], title, description, color }
  userCircles: [], // { id, center:[lon,lat], radius:number, title, description, color, opacity }
  userMarkerLayer: { main: null, left: null, right: null },
  userPolygonLayer: { main: null, left: null, right: null },
  userCircleLayer: { main: null, left: null, right: null },

  // Layer Groups saved by user
  layerGroups: [], // Array of { id, name, config, created_at }
  activeLayerGroupIds: [], // IDs of currently active groups
  layerGroupAssignedColors: {}, // Maps groupId to color

  // Theme preference
  theme: 'light', // 'light' | 'dark'

  // Aircraft overlay state
  aircraftLayer: { main: null, left: null, right: null },
  aircraftFeatures: [],              // Latest OpenSky state vectors
  aircraftUpdateInterval: null,      // setInterval reference
  aircraftEnabled: false,            // Master toggle
  aircraftLastUpdate: null,          // Timestamp of last successful fetch
  aircraftError: null,               // { type, message, time }
  aircraftRefreshInterval: 11,       // User-configured interval (seconds)

  // AIS/Ships overlay state
  aisEnabled: false,
  aisUpdateInterval: null,
  aisRefreshInterval: 30,            // Default 30 seconds
  aisLayer: { main: null, left: null, right: null },
  aisFeatures: [],
  aisError: null,
  aisLastUpdate: null,

  // Weather overlay
  weatherEnabled: false,
  weatherShowTemperature: true, // Show temperature
  weatherShowWind: false, // Show wind (speed + direction)
  weatherShowHumidity: false, // Show relative humidity
  weatherShowSnowDepth: false, // Show snow depth
  weatherShowPressure: false, // Show sea level pressure
  weatherCirclesVisible: false, // Show/hide colored circles (text always visible)
  weatherTextSize: 10, // Font size for labels in pixels
  weatherArrowSize: 20, // Arrow size in pixels (wind mode)
  weatherStationLayer: { main: null, left: null, right: null },
  weatherStationFeatures: [],
  weatherPollingTimer: null,
  weatherError: null,
  weatherCurrentTimeIndex: null,      // Current time index for historical data
  weatherAnimating: false,             // Animation state
  weatherAnimationSpeed: 2,            // Animation speed (fps)

  // Traffic camera overlay
  trafficCameraEnabled: false,
  trafficCameraLayer: { main: null, left: null, right: null },
  trafficCameraFeatures: [],
  trafficCameraError: null,
  trafficCameraLastFetch: null,
  trafficCameraPresetIndex: {},

  // GPX overlay
  gpxEnabled: false,                  // Master toggle
  gpxFiles: [],                       // Array of loaded GPX file metadata
  gpxFeatures: [],                    // Array of parsed OpenLayers features
  gpxLayer: { main: null, left: null, right: null },  // Vector layers
  gpxCharts: null,                    // Chart.js instances
  gpxCurrentFile: null,               // Currently selected GPX file
  gpxColorMode: 'elevation',          // 'elevation' | 'speed' | 'solid'
  gpxShowElevationChart: true,        // Show elevation profile
  gpxShowSpeedChart: false,           // Show speed chart
  gpxShowDistanceChart: false,        // Show distance chart
  gpxError: null,                     // Error state
  gpxHoverMarker: null,               // Overlay marker for hover interaction
  gpxHoverTooltip: null,              // Tooltip element for hover

  // FMI Radar overlay
  radarEnabled: false,                 // Master toggle for radar overlay
  radarLayer: { main: null, left: null, right: null },
  radarAnimating: false,               // Animation state
  radarSpeed: 2,                       // Animation speed (fps)
  radarCurrentTimeIndex: 0,            // Current time step index

  // UAS/Airspace overlay state
  uasEnabled: false,                   // Master toggle for UAS zones
  uasFeatures: [],                     // Fetched GeoJSON features
  uasLayer: { main: null, left: null, right: null },  // Vector layers
  uasError: null,                      // { type, message, time }
  uasLastFetch: null                   // Timestamp of last successful fetch
};

