import { Vector as VectorLayer } from 'ol/layer.js';
import { Vector as VectorSource } from 'ol/source.js';
import Feature from 'ol/Feature.js';
import { Point } from 'ol/geom.js';
import { Style, Icon, Fill, Stroke, Text } from 'ol/style.js';
import { fromLonLat } from 'ol/proj.js';
import { AIS_OVERLAY_CONFIG } from '../config/constants.js';
import { state } from '../state/store.js';

export function createAisLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    style: aisStyleFunction,
    zIndex: AIS_OVERLAY_CONFIG.zIndex,
    className: 'ais-layer'
  });
}

function normalizeTypeCode(typeCode) {
  const numeric = Number(typeCode);
  if (!Number.isFinite(numeric)) return null;
  const normalized = Math.trunc(numeric);
  if (normalized < 0 || normalized > 99) return null;
  return normalized;
}

function getHazardFamilyLabel(familyName, typeCode, noInfoLabel = 'No additional information') {
  const suffix = typeCode % 10;
  if (suffix === 0) return `${familyName}, all ships of this type`;
  if (suffix >= 1 && suffix <= 4) return `${familyName}, Hazardous category ${String.fromCharCode(64 + suffix)}`;
  if (suffix >= 5 && suffix <= 8) return `${familyName}, Reserved for future use`;
  return `${familyName}, ${noInfoLabel}`;
}

function getVesselTypeLabel(typeCode) {
  const code = normalizeTypeCode(typeCode);
  if (code === null) return 'Unknown';
  if (code === 0) return 'Not available (default)';
  if (code >= 1 && code <= 19) return 'Reserved for future use';

  if (code >= 20 && code <= 29) {
    if (code === 20) return 'Wing in ground (WIG), all ships of this type';
    if (code >= 21 && code <= 24) return `Wing in ground (WIG), Hazardous category ${String.fromCharCode(44 + code)}`;
    return 'Wing in ground (WIG), Reserved for future use';
  }

  const serviceAndSpecialTypes = {
    30: 'Fishing',
    31: 'Towing',
    32: 'Towing: length exceeds 200m or breadth exceeds 25m',
    33: 'Dredging or underwater ops',
    34: 'Diving ops',
    35: 'Military ops',
    36: 'Sailing',
    37: 'Pleasure Craft',
    38: 'Reserved',
    39: 'Reserved',
    50: 'Pilot Vessel',
    51: 'Search and Rescue vessel',
    52: 'Tug',
    53: 'Port Tender',
    54: 'Anti-pollution equipment',
    55: 'Law Enforcement',
    56: 'Spare - Local Vessel',
    57: 'Spare - Local Vessel',
    58: 'Medical Transport',
    59: 'Noncombatant ship according to RR Resolution No. 18'
  };
  if (serviceAndSpecialTypes[code]) return serviceAndSpecialTypes[code];

  if (code >= 40 && code <= 49) return getHazardFamilyLabel('High speed craft (HSC)', code);
  if (code >= 60 && code <= 69) return getHazardFamilyLabel('Passenger', code);
  if (code >= 70 && code <= 79) return getHazardFamilyLabel('Cargo', code);
  if (code >= 80 && code <= 89) return getHazardFamilyLabel('Tanker', code);
  if (code >= 90 && code <= 99) return getHazardFamilyLabel('Other Type', code, 'no additional information');

  return 'Unknown';
}

function getNavigationStatusLabel(statusCode) {
  const labels = {
    0: 'Under way using engine',
    1: 'At anchor',
    2: 'Not under command',
    3: 'Restricted manoeuvrability',
    4: 'Constrained by draught',
    5: 'Moored',
    6: 'Aground',
    7: 'Fishing',
    8: 'Under way sailing'
  };

  return labels[statusCode] || 'Unknown';
}

export function getAisLegendTypeKey(typeCode) {
  const code = normalizeTypeCode(typeCode);
  if (code === null) return 'unknownReserved';
  if (code >= 20 && code <= 29) return 'wingInGround';
  if (code === 30) return 'fishing';
  if (code === 31 || code === 32) return 'towing';
  if (code === 33 || code === 34) return 'dredgingDiving';
  if (code === 35) return 'military';
  if (code === 36 || code === 37) return 'sailingPleasure';
  if (code >= 40 && code <= 49) return 'highSpeedCraft';
  if (code === 50 || code === 52 || code === 53 || code === 56 || code === 57) return 'pilotTugPortTender';
  if (code === 51) return 'searchRescue';
  if (code === 54) return 'antiPollution';
  if (code === 55) return 'lawEnforcement';
  if (code === 58) return 'medicalTransport';
  if (code === 59) return 'noncombatant';
  if (code >= 60 && code <= 69) return 'passenger';
  if (code >= 70 && code <= 79) return 'cargo';
  if (code >= 80 && code <= 89) return 'tanker';
  if (code >= 90 && code <= 99) return 'otherType';
  return 'unknownReserved';
}

function getVesselColor(typeCode) {
  const legendTypeKey = getAisLegendTypeKey(typeCode);
  switch (legendTypeKey) {
    case 'wingInGround':
      return AIS_OVERLAY_CONFIG.colors.wingInGround;
    case 'fishing':
      return AIS_OVERLAY_CONFIG.colors.fishing;
    case 'towing':
      return AIS_OVERLAY_CONFIG.colors.towing;
    case 'dredgingDiving':
      return AIS_OVERLAY_CONFIG.colors.dredging;
    case 'military':
      return AIS_OVERLAY_CONFIG.colors.military;
    case 'sailingPleasure':
      return AIS_OVERLAY_CONFIG.colors.sailing;
    case 'highSpeedCraft':
      return AIS_OVERLAY_CONFIG.colors.highSpeed;
    case 'pilotTugPortTender':
    case 'searchRescue':
    case 'antiPollution':
    case 'lawEnforcement':
    case 'medicalTransport':
    case 'noncombatant':
      return AIS_OVERLAY_CONFIG.colors.specialCraft;
    case 'passenger':
      return AIS_OVERLAY_CONFIG.colors.passenger;
    case 'cargo':
      return AIS_OVERLAY_CONFIG.colors.cargo;
    case 'tanker':
      return AIS_OVERLAY_CONFIG.colors.tanker;
    case 'otherType':
      return AIS_OVERLAY_CONFIG.colors.other;
    default:
      return AIS_OVERLAY_CONFIG.colors.unknown;
  }
}

function getShipIconPath(typeCode) {
  const color = getVesselColor(typeCode);
  const svg = `
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 1L18 19L12 23L6 19L12 1Z" fill="${color}" stroke="#102027" stroke-width="1"/>
      <path d="M12 4L14.4 15.8H9.6L12 4Z" fill="#f8fafc" opacity="0.85"/>
    </svg>
  `;

  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

function aisStyleFunction(feature) {
  const typeCode = feature.get('typeCode');
  const heading = feature.get('heading') ?? feature.get('course') ?? 0;
  const speed = feature.get('speed') || 0;
  const selected = Boolean(feature.get('selected'));

  return new Style({
    image: new Icon({
      src: getShipIconPath(typeCode),
      rotation: heading * Math.PI / 180,
      anchor: [0.5, 0.5],
      scale: selected ? 1.25 : 1
    }),
    text: speed > 0 ? new Text({
      text: speed.toFixed(0),
      font: '600 10px sans-serif',
      offsetY: selected ? -18 : -15,
      fill: new Fill({ color: '#102027' }),
      stroke: new Stroke({ color: '#fff', width: 2 })
    }) : undefined
  });
}

export function vesselToFeature(vessel) {
  const location = vessel.location || {};
  const metadata = vessel.metadata || {};
  const longitude = location.lon;
  const latitude = location.lat;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const coord = fromLonLat([longitude, latitude], 'EPSG:3857');
  const length = (metadata.refA ?? 0) + (metadata.refB ?? 0);
  const width = (metadata.refC ?? 0) + (metadata.refD ?? 0);
  const typeCode = normalizeTypeCode(metadata.type);
  const speed = Number.isFinite(location.sog) ? location.sog : 0;
  const course = Number.isFinite(location.cog) ? location.cog : null;
  const heading = Number.isFinite(location.heading) ? location.heading : course;
  const lastUpdate = Number.isFinite(location.time)
    ? location.time * 1000
    : Number.isFinite(metadata.timestamp)
      ? metadata.timestamp
      : vessel.lastSeenAt;

  const feature = new Feature({
    geometry: new Point(coord),
    isAisVessel: true,
    mmsi: vessel.mmsi.toString(),
    name: metadata.name || `Vessel ${vessel.mmsi}`,
    destination: metadata.destination || '',
    imo: metadata.imo || '',
    callSign: metadata.callSign || '',
    draught: metadata.draught ?? null,
    eta: metadata.eta ?? null,
    typeCode,
    legendTypeKey: getAisLegendTypeKey(typeCode),
    vesselType: getVesselTypeLabel(typeCode),
    speed,
    course,
    heading,
    navStatus: getNavigationStatusLabel(location.navStat),
    navStatusCode: location.navStat ?? null,
    rotationRate: location.rot ?? null,
    positionAccurate: location.posAcc ?? null,
    raim: location.raim ?? null,
    posType: metadata.posType ?? null,
    refA: metadata.refA ?? null,
    refB: metadata.refB ?? null,
    refC: metadata.refC ?? null,
    refD: metadata.refD ?? null,
    length: length || null,
    width: width || null,
    lastUpdate,
    lastSeenAt: vessel.lastSeenAt,
    selected: state.aisSelectedMmsi.has(String(vessel.mmsi))
  });

  return feature;
}
