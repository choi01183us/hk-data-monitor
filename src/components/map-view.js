// 地圖視窗只改顯示範圍，唔改地理資料。x／y 係原圖的正規化中心位置。
function finiteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`地圖 ${name} 必須係有限數字`);
}

export function normalizeMapView(state = {}) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("地圖視窗必須係物件");
  const {zoom = 1, x = 0.5, y = 0.5} = state;
  finiteNumber(zoom, "zoom");
  finiteNumber(x, "x");
  finiteNumber(y, "y");
  const boundedZoom = Math.max(1, Math.min(4, zoom));
  const edge = 0.5 / boundedZoom;
  return {
    zoom: boundedZoom,
    x: Math.max(edge, Math.min(1 - edge, x)),
    y: Math.max(edge, Math.min(1 - edge, y)),
  };
}

export function zoomMapView(state, delta) {
  finiteNumber(delta, "縮放幅度");
  const view = normalizeMapView(state);
  return normalizeMapView({...view, zoom: view.zoom + delta});
}

// dx／dy 以視窗闊／高作單位；正值代表把地圖內容向右／下移。
export function panMapView(state, dx, dy) {
  finiteNumber(dx, "水平移動");
  finiteNumber(dy, "垂直移動");
  const view = normalizeMapView(state);
  return normalizeMapView({zoom: view.zoom, x: view.x - dx / view.zoom, y: view.y - dy / view.zoom});
}

export function focusMapView(state, x, y) {
  finiteNumber(x, "焦點 x");
  finiteNumber(y, "焦點 y");
  const view = normalizeMapView(state);
  return normalizeMapView({zoom: Math.max(view.zoom, 2.5), x, y});
}

// 配合 transform-origin: 0 0；百分比以未縮放的原圖闊／高計。
export function mapTransform(state) {
  const {zoom, x, y} = normalizeMapView(state);
  return `translate(${(0.5 - x * zoom) * 100}%, ${(0.5 - y * zoom) * 100}%) scale(${zoom})`;
}
