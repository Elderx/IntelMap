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
  userMarkerLayer: { main: null, left: null, right: null },
  userPolygonLayer: { main: null, left: null, right: null },

  // Layer Groups saved by user
  layerGroups: [], // Array of { id, name, config, created_at }
  activeLayerGroupIds: [], // IDs of currently active groups
  layerGroupAssignedColors: {}, // Maps groupId to color
};


