import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Style from 'ol/style/Style.js';
import Icon from 'ol/style/Icon.js';
import { TRAFFIC_CAMERA_CONFIG } from '../config/constants.js';

function getTrafficCameraStyle() {
  return new Style({
    image: new Icon({
      src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="24" height="24">
          <circle cx="16" cy="16" r="12" fill="#c0392b" stroke="white" stroke-width="2"/>
          <path d="M10 13h8l4-3v12l-4-3h-8z" fill="white"/>
        </svg>
      `),
      anchor: [0.5, 0.5]
    }),
    zIndex: TRAFFIC_CAMERA_CONFIG.zIndex
  });
}

export function cameraToFeature(camera, freshestPreset) {
  const feature = new Feature({
    geometry: new Point([camera.geometry.x, camera.geometry.y]),
    isTrafficCamera: true,
    cameraId: camera.attributes.CameraId,
    name: camera.attributes.Name_EN || camera.attributes.Name_FI || camera.attributes.CameraId,
    municipality: camera.attributes.Municipality || '',
    roadAddress: camera.attributes.RoadAddress || '',
    imageUrl: freshestPreset?.ImageUrl || null,
    directionName: freshestPreset?.DirectionName || '',
    picLastModified: freshestPreset?.PicLastModified || null,
    cameraResolution: freshestPreset?.CameraResolution || null,
    cameraPageUrl: `${TRAFFIC_CAMERA_CONFIG.cameraPageBaseUrl}?cameraId=${camera.attributes.CameraId}`
  });

  feature.setStyle(getTrafficCameraStyle());
  return feature;
}

export function createTrafficCameraLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    zIndex: TRAFFIC_CAMERA_CONFIG.zIndex,
    className: 'traffic-camera-layer'
  });
}
