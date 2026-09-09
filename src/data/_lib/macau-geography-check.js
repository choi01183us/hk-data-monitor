// Build-time checks for the offline Macau SVG and matching MGTO point positions.
// This checks the stored format/projection contract; it does not certify a coastline.
const FRAME = [0, 0, 900, 560];
const RADIUS = 6378137;
const PIXEL_TOLERANCE = 0.011;
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const inFrame = (x, y) => finite(x) && finite(y) && x >= 0 && x <= 900 && y >= 0 && y <= 560;
const date = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function urlMatches(value, hosts, path) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && hosts.includes(url.hostname) && !url.username && !url.password && !url.port && path.test(url.pathname);
  } catch { return false; }
}
const officialPlaceURL = (value) => urlMatches(value, ["www.macaotourism.gov.mo"], /^\/zh-hant\/sightseeing\/[^/]+\/[^/]+\/?$/);

// The generated format has explicit M/L pairs and Z closure. No SVG evaluation.
function validPath(value) {
  if (!nonempty(value)) return false;
  const path = value.trim();
  const number = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
  const token = new RegExp(`\\s*(?:([ML])\\s*(${number})\\s*,\\s*(${number})|(Z))`, "gy");
  let offset = 0, ring = null, closed = 0;
  while (offset < path.length) {
    token.lastIndex = offset;
    const match = token.exec(path);
    if (!match) return false;
    offset = token.lastIndex;
    if (match[4] === "Z") {
      if (!ring || ring.length < 3) return false;
      let areaTwice = 0;
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
        areaTwice += ax * by - bx * ay;
      }
      if (Math.abs(areaTwice) <= 1e-8) return false;
      ring = null;
      closed++;
      continue;
    }
    const x = Number(match[2]), y = Number(match[3]);
    if (!inFrame(x, y)) return false;
    if (match[1] === "M") {
      if (ring) return false;
      ring = [[x, y]];
    } else {
      if (!ring) return false;
      ring.push([x, y]);
    }
  }
  return closed > 0 && ring === null;
}

export function validateMacauGeography(geography, places) {
  const errors = [];
  const check = (condition, field, message) => { if (!condition) errors.push(`${field}: ${message}`); };
  if (!geography || typeof geography !== "object" || Array.isArray(geography)) return {ok: false, errors: ["geography: 必須是地圖資料物件"]};
  check(Array.isArray(geography.viewBox) && geography.viewBox.length === 4 && geography.viewBox.every((value, index) => value === FRAME[index]), "viewBox", "必須為 0 0 900 560");
  check(validPath(geography.path), "path", "必須為畫框內有限坐標組成的非退化 M/L/Z 封閉圖形");
  check(geography.fill_rule === "evenodd", "fill_rule", "必須保留島嶼及孔洞的奇偶填色");

  const source = geography.source ?? {};
  check(nonempty(source.source_zh) && /OpenStreetMap/i.test(source.source_zh), "source.source_zh", "必須保留 OpenStreetMap 來源名稱");
  check(urlMatches(source.source_url, ["www.openstreetmap.org", "openstreetmap.org"], /^\/relation\/\d+\/?$/), "source.source_url", "必須保留 OSM 邊界資料連結");
  check(nonempty(source.attribution) && /OpenStreetMap contributors/i.test(source.attribution), "source.attribution", "必須鳴謝 OpenStreetMap contributors");
  check(urlMatches(source.attribution_url, ["www.openstreetmap.org", "openstreetmap.org"], /^\/copyright\/?$/), "source.attribution_url", "必須保留 OSM 使用條款連結");
  check(nonempty(source.licence) && /ODbL|Open Database License/i.test(source.licence), "source.licence", "必須保留 ODbL 授權名稱");
  check(urlMatches(source.licence_url, ["opendatacommons.org"], /^\/licenses\/odbl\/1-0\/?$/), "source.licence_url", "必須保留 ODbL 1.0 授權連結");
  check(date(source.verified_at), "source.verified_at", "核對日期必須是有效 YYYY-MM-DD");

  const projection = geography.projection ?? {};
  const validProjection = finite(projection.center_easting) && finite(projection.center_northing) && finite(projection.scale) && projection.scale > 0;
  check(projection.crs === "EPSG:3857", "projection.crs", "必須使用 EPSG:3857");
  check(projection.source_crs === "WGS84 longitude/latitude", "projection.source_crs", "來源坐標必須為 WGS84 經度、緯度");
  check(finite(projection.center_easting) && finite(projection.center_northing), "projection.center", "投影中心必須為有限數值");
  check(finite(projection.scale) && projection.scale > 0, "projection.scale", "縮放比例必須為有限正數");
  check(projection.x_formula === "450 + (E - center_easting) * scale" && projection.y_formula === "280 - (N - center_northing) * scale", "projection.formulas", "必須沿用東向右、北向上及相同比例的畫框公式");

  check(Array.isArray(places) && places.length > 0, "places", "必須有實際景點資料");
  const ids = new Set();
  for (const [index, place] of (Array.isArray(places) ? places : []).entries()) {
    const prefix = `places[${index}]`;
    if (!place || typeof place !== "object" || Array.isArray(place)) { check(false, prefix, "景點必須是物件"); continue; }
    check(nonempty(place.id) && !ids.has(place.id), `${prefix}.id`, "景點 ID 必須存在且不重複");
    ids.add(place.id);
    check(inFrame(place.x, place.y), `${prefix}.xy`, "景點坐標必須為畫框內有限數值");
    const validLonLat = finite(place.longitude) && finite(place.latitude) && Math.abs(place.longitude) <= 180 && Math.abs(place.latitude) <= 85.0511287798066;
    check(validLonLat, `${prefix}.longitude_latitude`, "經緯度必須為 Web Mercator 有效範圍內的有限數值");
    if (validLonLat && validProjection) {
      const east = RADIUS * place.longitude * Math.PI / 180;
      const north = RADIUS * Math.log(Math.tan(Math.PI / 4 + place.latitude * Math.PI / 360));
      const x = 450 + (east - projection.center_easting) * projection.scale;
      const y = 280 - (north - projection.center_northing) * projection.scale;
      check(finite(x) && finite(y) && finite(place.x) && finite(place.y) && Math.abs(x - place.x) <= PIXEL_TOLERANCE && Math.abs(y - place.y) <= PIXEL_TOLERANCE, `${prefix}.projection`, "經緯度投影與保存的 x/y 相差超過 0.011");
    }
    check(officialPlaceURL(place.source_url) && officialPlaceURL(place.location_source_url), `${prefix}.source`, "介紹及位置必須連到旅遊局的個別景點頁");
    check(place.source_zh === "澳門特別行政區政府旅遊局", `${prefix}.source_zh`, "必須保留官方來源機構");
    for (const key of ["label", "description", "question", "location_name", "location_note"]) check(nonempty(place[key]), `${prefix}.${key}`, "內容及定位限制不可空白");
    check(date(place.verified_at) && date(place.source_updated_at), `${prefix}.dates`, "來源更新及核對日期必須有效");
  }
  return {ok: errors.length === 0, errors};
}
