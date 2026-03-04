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

export function getTrainLocationColor(speed) {
  if (speed == null) {
    return TRAIN_OVERLAY_CONFIG.colors.unknown;
  }
  if (speed > 5) {
    return TRAIN_OVERLAY_CONFIG.colors.moving;
  }
  return TRAIN_OVERLAY_CONFIG.colors.slow;
}

export function getTrainLocationStyle(speed) {
  return new Style({
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: getTrainLocationColor(speed) }),
      stroke: new Stroke({ color: '#ffffff', width: 2 })
    }),
    zIndex: TRAIN_OVERLAY_CONFIG.zIndex.locations
  });
}

export function trainLocationToFeature(trainLocation) {
  const coordinates = transform(trainLocation.geometry.coordinates, 'EPSG:4326', 'EPSG:3857');
  const props = trainLocation.properties || {};

  const feature = new Feature({
    geometry: new Point(coordinates)
  });

  feature.set('isTrainLocation', true);
  feature.set('trainNumber', props.trainNumber);
  feature.set('departureDate', props.departureDate);
  feature.set('timestamp', props.timestamp);
  feature.set('speed', props.speed);
  feature.set('accuracy', props.accuracy);
  feature.setStyle(getTrainLocationStyle(props.speed));

  return feature;
}

export function createTrainLocationLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    zIndex: TRAIN_OVERLAY_CONFIG.zIndex.locations,
    className: 'train-location-layer'
  });
}
