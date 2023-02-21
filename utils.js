const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
// 900913 properties.
const A = 6378137.0;
const MAXEXTENT = 20037508.342789244;

export function lonLatToMercator(ll) {
  var xy = [
    A * ll[0] * D2R,
    A * Math.log(Math.tan(Math.PI * 0.25 + 0.5 * ll[1] * D2R)),
  ];
  // if xy value is beyond maxextent (e.g. poles), return maxextent.
  xy[0] > MAXEXTENT && (xy[0] = MAXEXTENT);
  xy[0] < -MAXEXTENT && (xy[0] = -MAXEXTENT);
  xy[1] > MAXEXTENT && (xy[1] = MAXEXTENT);
  xy[1] < -MAXEXTENT && (xy[1] = -MAXEXTENT);
  return xy;
}

export function mercatorToLonLat(xy) {
  return [
    (xy[0] * R2D) / A,
    (Math.PI * 0.5 - 2.0 * Math.atan(Math.exp(-xy[1] / A))) * R2D,
  ];
}
