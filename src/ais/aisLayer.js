import { Vector as VectorLayer } from 'ol/layer.js';
import { Vector as VectorSource } from 'ol/source.js';
import Feature from 'ol/Feature.js';
import { Point } from 'ol/geom.js';
import { Style, Icon, Fill, Stroke, Text } from 'ol/style.js';
import { fromLonLat } from 'ol/proj.js';
import { AIS_OVERLAY_CONFIG } from '../config/constants.js';

export function createAisLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    style: aisStyleFunction,
    zIndex: AIS_OVERLAY_CONFIG.zIndex,
    className: 'ais-layer'
  });
}

function getVesselTypeLabel(typeCode) {
  if (typeCode >= 60 && typeCode < 70) return 'Passenger';
  if (typeCode >= 70 && typeCode < 80) return 'Cargo';
  if (typeCode >= 80 && typeCode < 90) return 'Tanker';
  if (typeCode >= 30 && typeCode < 40) return 'Fishing';
  if (typeCode >= 50 && typeCode < 60) return 'Service';
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

function getVesselColor(typeCode) {
  if (typeCode >= 60 && typeCode < 70) {
    return AIS_OVERLAY_CONFIG.colors.passenger;
  }
  if (typeCode >= 70 && typeCode < 80) {
    return AIS_OVERLAY_CONFIG.colors.cargo;
  }
  if (typeCode >= 80 && typeCode < 90) {
    return AIS_OVERLAY_CONFIG.colors.tanker;
  }
  if (typeCode >= 30 && typeCode < 60) {
    return AIS_OVERLAY_CONFIG.colors.service;
  }
  return AIS_OVERLAY_CONFIG.colors.unknown;
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

  return new Style({
    image: new Icon({
      src: getShipIconPath(typeCode),
      rotation: heading * Math.PI / 180,
      anchor: [0.5, 0.5],
      scale: 1
    }),
    text: speed > 0 ? new Text({
      text: speed.toFixed(0),
      font: '600 10px sans-serif',
      offsetY: -15,
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
  const typeCode = Number.isFinite(metadata.type) ? metadata.type : null;
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
    lastSeenAt: vessel.lastSeenAt
  });

  return feature;
}
