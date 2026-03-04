import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Style from 'ol/style/Style.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import { transform } from 'ol/proj.js';
import { TRAIN_OVERLAY_CONFIG } from '../config/constants.js';

export function getTrainStationStyle(passengerTraffic) {
  const color = passengerTraffic
    ? TRAIN_OVERLAY_CONFIG.colors.passengerStation
    : TRAIN_OVERLAY_CONFIG.colors.nonPassengerStation;

  return new Style({
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#ffffff', width: 2 })
    }),
    zIndex: TRAIN_OVERLAY_CONFIG.zIndex.stations
  });
}

export function trainStationToFeature(station) {
  const coordinates = transform(station.geometry.coordinates, 'EPSG:4326', 'EPSG:3857');
  const props = station.properties || {};

  const feature = new Feature({
    geometry: new Point(coordinates)
  });

  feature.set('isTrainStation', true);
  feature.set('stationName', props.stationName);
  feature.set('stationShortCode', props.stationShortCode);
  feature.set('stationUICCode', props.stationUICCode);
  feature.set('type', props.type);
  feature.set('countryCode', props.countryCode);
  feature.set('passengerTraffic', props.passengerTraffic);
  feature.setStyle(getTrainStationStyle(props.passengerTraffic));

  return feature;
}

export function createTrainStationsLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    zIndex: TRAIN_OVERLAY_CONFIG.zIndex.stations,
    className: 'train-station-layer'
  });
}
