import Feature from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import Polygon from 'ol/geom/Polygon.js';
import Circle from 'ol/geom/Circle.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import Text from 'ol/style/Text.js';
import Overlay from 'ol/Overlay.js';
import { getLength } from 'ol/sphere.js';

export function createLineLayer(coords) {
  const vectorSource = new VectorSource();
  const feature = new Feature({ geometry: new LineString(coords) });
  feature.setStyle(new Style({ stroke: new Stroke({ color: 'blue', width: 3 }) }));
  vectorSource.addFeature(feature);
  return { layer: new VectorLayer({ source: vectorSource, zIndex: 102 }), feature };
}

export function createPolygonLayer(coords) {
  const vectorSource = new VectorSource();
  const feature = new Feature({ geometry: new Polygon([coords]) });
  feature.setStyle(new Style({ fill: new Fill({ color: 'rgba(0,200,255,0.5)' }), stroke: new Stroke({ color: 'blue', width: 2 }) }));
  vectorSource.addFeature(feature);
  return { layer: new VectorLayer({ source: vectorSource, zIndex: 103 }), feature };
}

export function createCircleLayer(center, radius, color = '#2196f3', opacity = 0.3) {
  const vectorSource = new VectorSource();
  const feature = new Feature({ geometry: new Circle(center, radius) });
  feature.setStyle(new Style({
    fill: new Fill({ color: `rgba(33, 150, 243, ${opacity})` }),
    stroke: new Stroke({ color, width: 2 })
  }));
  vectorSource.addFeature(feature);

  // Create radius line from center to right edge
  const rightEdge = [center[0] + radius, center[1]];
  const radiusLineFeature = new Feature({ geometry: new LineString([center, rightEdge]) });
  radiusLineFeature.setStyle(new Style({
    stroke: new Stroke({ color: color, width: 2, lineDash: [4, 4] })
  }));
  vectorSource.addFeature(radiusLineFeature);

  // Create text label for radius
  const midPoint = [(center[0] + rightEdge[0]) / 2, rightEdge[1] + 5];
  const radiusInMeters = Math.round(radius);
  const labelText = radiusInMeters > 1000
    ? (radiusInMeters / 1000).toFixed(2) + ' km'
    : radiusInMeters + ' m';

  const textFeature = new Feature({ geometry: new LineString([center, rightEdge]) });
  textFeature.setStyle(new Style({
    text: new Text({
      text: labelText,
      font: 'bold 16px sans-serif',
      fill: new Fill({ color: color }),
      //stroke: new Stroke({ color: 'white', width: 4 }),
      offsetY: -12,
      textAlign: 'center'
    }),
    stroke: new Stroke({ color: 'rgba(0,0,0,0)', width: 0 }) // Hide the line
  }));
  vectorSource.addFeature(textFeature);

  return { layer: new VectorLayer({ source: vectorSource, zIndex: 102 }), feature };
}

export function createMeasureLineLayer(coords) {
  const vectorSource = new VectorSource();
  const feature = new Feature({ geometry: new LineString(coords) });
  feature.setStyle(new Style({ stroke: new Stroke({ color: 'orange', width: 3, lineDash: [8, 8] }) }));
  vectorSource.addFeature(feature);
  return { layer: new VectorLayer({ source: vectorSource, zIndex: 104 }), feature };
}

export function createMeasureLabelOverlay(coord, text) {
  const div = document.createElement('div');
  div.className = 'measure-label';
  div.style.background = 'rgba(255,255,255,0.9)';
  div.style.border = '1px solid #ffa500';
  div.style.borderRadius = '6px';
  div.style.padding = '2px 6px';
  div.style.fontSize = '13px';
  div.style.color = '#d2691e';
  div.style.fontWeight = 'bold';
  div.textContent = text;
  return new Overlay({
    element: div,
    position: coord,
    positioning: 'bottom-center',
    stopEvent: false
  });
}

export function formatLength(line) {
  const length = getLength(line);
  return length > 1000 ? (length / 1000).toFixed(2) + ' km' : length.toFixed(2) + ' m';
}


