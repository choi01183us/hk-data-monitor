// Production 地圖資料對官方原始回傳；先以已知答案自證幾何工具。
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {gunzipSync} from "node:zlib";
import {hongKongDistricts, districtGeographySource} from "../src/components/hong-kong-districts.js";
import {hongKongAttractions, attractionTypes, attractionSource} from "../src/components/hong-kong-attractions.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const districtIds = [..."ABCDEFGHJSKLMNPRQT"];
const typeIds = ["harbour", "culture", "theme-park", "island"];
const attractionIds = [
  ["peak", "A", "harbour"], ["star-ferry", "E", "harbour"], ["avenue-of-stars", "E", "harbour"],
  ["m-plus", "E", "culture"], ["palace-museum", "E", "culture"], ["tai-kwun", "A", "culture"],
  ["ocean-park", "D", "theme-park"], ["disneyland", "T", "theme-park"],
  ["big-buddha", "T", "culture"], ["cheung-chau", "T", "island"]
];
const locationURL = "https://portal.csdi.gov.hk/csdi-webpage/apidoc/LocationSearchAPI";
const toMap = (e, n) => [Number(((e - 832250) * 0.0112 + 450).toFixed(2)), Number(((824000 - n) * 0.0112 + 280).toFixed(2))];
const nonempty = (v) => typeof v === "string" && !!v.trim();
const isOfficialContent = (value) => {
  try { const u = new URL(value); return u.protocol === "https:" && u.hostname === "www.discoverhongkong.com"; }
  catch { return false; }
};

// Even-odd rings: holes and disconnected islands are retained; boundary is excluded.
function contains(rings, [x, y]) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j], [bx, by] = ring[i];
      if (ax === bx && ay === by) continue;
      const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
      if (Math.abs(cross) < 1e-8 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return false;
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
  }
  return inside;
}

function parsePath(path) {
  if (typeof path !== "string") return null;
  const parts = path.match(/M[^MZ]+Z/g);
  if (!parts?.length || parts.join("") !== path) return null;
  const rings = parts.map((part) => part.slice(1, -1).split("L").map((pair) => pair.split(",").map(Number)));
  if (rings.some((ring) => ring.length < 4 || ring.some((p) => p.length !== 2 || !p.every(Number.isFinite)) || ring[0].join() !== ring.at(-1).join())) return null;
  return rings;
}

function inspectDistricts(districts, source, official, controls) {
  const errors = [];
  if (!Array.isArray(districts) || districts.length !== 18) errors.push("count");
  if (!Array.isArray(districts)) return errors;
  if (districts.map((d) => d.id).join() !== districtIds.join()) errors.push("identity-order");
  if (new Set(districts.map((d) => d.id)).size !== districts.length) errors.push("duplicate");
  if (source?.source_url !== "https://portal.csdi.gov.hk/csdi-webpage/dataset/had_rcd_1634523272907_75218" || !nonempty(source.attribution) || source.verified_at !== "2026-09-09" || source.projection !== "EPSG:2326" || source.simplification_metres !== 25) errors.push("source");
  for (const id of districtIds) {
    const matches = districts.filter((d) => d.id === id);
    if (matches.length !== 1) { errors.push(`${id}:identity`); continue; }
    const d = matches[0], f = official.features.find((f) => f.attributes.AREA_ID === id), a = f.attributes;
    const control = controls.controls.find((c) => c.id === id);
    if (d.label !== a.NAME_TC || d.had_code !== a.AREA_CODE || d.source_id !== a.CSDI_ADMIN_AREA_ID) errors.push(`${id}:official-identity`);
    if (d.boundary_valid_from !== "2016-01-01" || d.anchor_kind !== "land-representative-point") errors.push(`${id}:definition`);
    const rings = parsePath(d.path);
    if (!rings || rings.some((ring) => ring.some(([x,y]) => x < 0 || x > 900 || y < 0 || y > 560))) errors.push(`${id}:path`);
    if (typeof d.path !== "string" || sha(d.path) !== control.path_sha256) errors.push(`${id}:geometry-control`);
    if (d.x !== control.x || d.y !== control.y || toMap(control.easting, control.northing).join() !== [d.x,d.y].join()) errors.push(`${id}:position`);
    if (!contains(f.geometry.rings, [control.easting, control.northing]) || !rings || !contains(rings, [d.x,d.y])) errors.push(`${id}:anchor-outside`);
    if (rings?.length !== control.path_rings) errors.push(`${id}:islands-holes`);
  }
  return errors;
}

function inspectAttractions(attractions, types, source, locations, official) {
  const errors = [];
  if (!Array.isArray(attractions) || attractions.length !== attractionIds.length) errors.push("count");
  if (!Array.isArray(attractions)) return errors;
  if (attractions.map((a) => a.id).join() !== attractionIds.map((a) => a[0]).join()) errors.push("identity-order");
  if (new Set(attractions.map((a) => a.id)).size !== attractions.length) errors.push("duplicate");
  if (!Array.isArray(types) || types.map((t) => t.id).join() !== typeIds.join()) errors.push("types");
  if (source?.location_source_url !== locationURL || !nonempty(source.attribution) || source.verified_at !== "2026-09-09") errors.push("source");
  for (const [id, district, type] of attractionIds) {
    const matches = attractions.filter((a) => a.id === id);
    if (matches.length !== 1) { errors.push(`${id}:identity`); continue; }
    const a = matches[0], f = locations.records.find((r) => r.id === id), r = f.record;
    if (a.district_id !== district || r.districtZH !== official.features.find((d) => d.attributes.AREA_ID === district).attributes.NAME_TC) errors.push(`${id}:district`);
    if (a.type !== type) errors.push(`${id}:type`);
    if ([a.x,a.y].join() !== toMap(r.x,r.y).join()) errors.push(`${id}:position`);
    if (a.location_query !== f.query || a.location_name !== r.nameZH || a.location_address !== r.addressZH) errors.push(`${id}:location-identity`);
    if (a.location_source_url !== locationURL || !isOfficialContent(a.source_url) || a.source_zh !== "香港旅遊發展局") errors.push(`${id}:source`);
    if (a.verified_at !== "2026-09-09") errors.push(`${id}:date`);
    const containing = official.features.filter((d) => contains(d.geometry.rings, [r.x,r.y]));
    if (containing.length !== 1 || containing[0].attributes.AREA_ID !== a.district_id) errors.push(`${id}:geographic-district`);
    for (const field of ["label", "description", "question", "location_note"]) if (!nonempty(a[field])) errors.push(`${id}:${field}`);
  }
  return errors;
}

export async function testDistrictGeography(check) {
  console.log("\n[地區地理] 官方十八區、景點定位及檢查器自證");
  for (const [name,e,n,x,y] of [["中央",832250,824000,450,280],["左上",797000,849000,55.2,0],["右下",867500,799000,844.8,560],["向東五公里",837250,824000,506,280]]) {
    check(`地區換算已知答案：${name}`, toMap(e,n).join() === [x,y].join());
  }
  const square = [[0,0],[4,0],[4,4],[0,4],[0,0]], hole = [[1,1],[3,1],[3,3],[1,3],[1,1]], island = [[6,0],[8,0],[8,2],[6,2],[6,0]];
  check("幾何已知答案：方形內外及邊界", contains([square],[2,2]) && !contains([square],[5,2]) && !contains([square],[0,2]));
  check("幾何已知答案：洞內不屬陸地", !contains([square,hole],[2,2]) && contains([square,hole],[.5,.5]));
  check("幾何已知答案：分開的島嶼仍屬同區", contains([square,island],[7,1]) && !contains([square,island],[5,1]));
  check("幾何已知答案：方向倒轉不改包含關係", contains([square.toReversed(),hole],[.5,.5]) && !contains([square.toReversed(),hole],[2,2]));
  check("SVG 已知答案：保留洞及島，拒絕未閉合路徑", parsePath("M0,0L4,0L4,4L0,4L0,0ZM1,1L3,1L3,3L1,3L1,1Z")?.length === 2 && parsePath("M0,0L4,0L4,4Z") === null && parsePath("M0,0L1,0L1,1L0,0ZQ4,4") === null);

  const [raw, land, controlRaw, locationRaw] = await Promise.all([
    readFile(new URL("./fixtures/geography/had-districts-2026-09-09.json.gz", import.meta.url)).then(gunzipSync),
    readFile(new URL("./fixtures/geography/landsd-land-2026-09-08.geojson.gz", import.meta.url)).then(gunzipSync),
    readFile(new URL("./fixtures/geography/district-controls.json", import.meta.url)),
    readFile(new URL("./fixtures/geography/attraction-locations.json", import.meta.url))
  ]);
  check("HAD 原始十八區錄影內容釘死", sha(raw) === "db78a66409449135e3e117a9cc037ed8f13313eefd86b6b1dff19e4ca4e5fc8a");
  check("既有地政署陸地裁剪材料釘死", sha(land) === "dbd71908cc4385f56d37717b13d03c327b19b8e7c61012e1beacc266bd997230");
  check("已驗幾何控制點／路徑雜湊不能同步改壞 expected", sha(controlRaw) === "bdd3aba03e5366fc9cb2eddec05943d3259b2ca1e714a1fcde97e49b4a67303d");
  check("地政署十個景點原始定位錄影內容釘死", sha(locationRaw) === "f9f6516b5f2c2b1d1c84d5c1df6d040d64f57b49722214000c69f7c8bd146f1b");
  const official = JSON.parse(raw), controls = JSON.parse(controlRaw), locations = JSON.parse(locationRaw);
  check("地理錄影是十八區 DCD、HK80，沒有截斷或 API 錯誤", !official.error && !official.exceededTransferLimit && official.features.length === 18 && (official.spatialReference.latestWkid ?? official.spatialReference.wkid) === 2326 && official.features.every((f) => f.attributes.AREA_TYPE === "DCD" && f.attributes.DATA_OWNER === "HAD" && f.attributes.BEGIN_LIFESPAN === 1451606400000));
  const districtErrors = inspectDistricts(hongKongDistricts,districtGeographySource,official,controls);
  check("production 十八區身分、路徑、錨點及來源一致", districtErrors.length === 0);
  for (const id of districtIds) check(`官方 ${id} 區的名稱／源 ID／島嶼／內部定位點正確`, !districtErrors.some((e) => e.startsWith(`${id}:`)));
  const attractionErrors = inspectAttractions(hongKongAttractions,attractionTypes,attractionSource,locations,official);
  check("production 十個景點與官方位置及地區一致", attractionErrors.length === 0);
  for (const [id] of attractionIds) check(`景點 ${id} 的位置／分類／所屬區／來源正確`, !attractionErrors.some((e) => e.startsWith(`${id}:`)));

  const mutateD = (fn) => { const copy = structuredClone(hongKongDistricts); fn(copy); return inspectDistricts(copy,districtGeographySource,official,controls); };
  check("突變：整區改成鄰區形狀，總區數不變也會嘈", mutateD((d) => {d[0].path=d[1].path;}).includes("A:geometry-control"));
  check("突變：中文區名對調會嘈", mutateD((d) => {[d[0].label,d[1].label]=[d[1].label,d[0].label];}).includes("A:official-identity"));
  check("突變：文字定位移到海上會嘈", mutateD((d) => {d[0].x=100;d[0].y=550;}).includes("A:anchor-outside"));
  check("突變：遺漏區或重複碼會嘈", mutateD((d) => {d.pop();}).includes("count") && mutateD((d) => {d[1].id=d[0].id;}).includes("duplicate"));
  check("突變：保留主島但刪除小島會嘈", mutateD((d) => {d[17].path=d[17].path.match(/M[^MZ]+Z/)[0];}).includes("T:islands-holes"));
  check("突變：錯誤官方資料編號會嘈", mutateD((d) => {d[0].source_id=d[1].source_id;}).includes("A:official-identity"));
  const mutateA = (fn) => { const copy = structuredClone(hongKongAttractions); fn(copy); return inspectAttractions(copy,attractionTypes,attractionSource,locations,official); };
  check("突變：景點坐標對調仍在畫布內也會嘈", mutateA((a) => {[a[0].x,a[0].y]=[a[0].y,a[0].x];}).includes("peak:position"));
  check("突變：迪士尼錯歸荃灣區會嘈", mutateA((a) => {a[7].district_id="K";}).includes("disneyland:geographic-district"));
  check("突變：分類換成另一個合法類別會嘈", mutateA((a) => {a[0].type="culture";}).includes("peak:type"));
  check("突變：同名商戶定位不能冒充景點", mutateA((a) => {a[0].location_name="香港杜莎夫人蠟像館";}).includes("peak:location-identity"));
  check("突變：缺位置來源或內容來源會嘈", mutateA((a) => {delete a[0].location_source_url;}).includes("peak:source") && mutateA((a) => {delete a[0].source_url;}).includes("peak:source"));
  check("突變：缺景點或重複 ID 會嘈", mutateA((a) => {a.pop();}).includes("count") && mutateA((a) => {a[1].id=a[0].id;}).includes("duplicate"));
  check("突變：失去定位限制註解會嘈", mutateA((a) => {delete a[1].location_note;}).includes("star-ferry:location_note"));
  check("突變：不保留政府資料鳴謝會嘈", inspectDistricts(hongKongDistricts,{...districtGeographySource,attribution:""},official,controls).includes("source"));

  const dir = await mkdtemp(join(tmpdir(), "hkdm-district-geography-"));
  try {
    const sources = await Promise.all(["hong-kong-districts.js","hong-kong-attractions.js"].map((f) => readFile(new URL(`../src/components/${f}`,import.meta.url),"utf8")));
    for (const [i,name,which,before,after,expected] of [
      [0,"實際區名","district",'"id":"A","label":"中西區"','"id":"A","label":"灣仔區"',"A:official-identity"],
      [1,"實際景點 x 軸","attraction",'"x": 463.84','"x": 464.84',"peak:position"],
      [2,"實際景點分類","attraction",'"id": "peak",\n    "label": "太平山頂（凌霄閣）",\n    "district_id": "A",\n    "type": "harbour"','"id": "peak",\n    "label": "太平山頂（凌霄閣）",\n    "district_id": "A",\n    "type": "culture"',"peak:type"],
      [3,"實際景點來源","attraction",'"source_url": "https://www.discoverhongkong.com/tc/place-to-go/travel.guide-the-peak.html",','"source_url": "",',"peak:source"]
    ]) {
      const original = sources[which === "district" ? 0 : 1];
      if (original.split(before).length !== 2) throw new Error(`地理源碼突變必須精確命中一次：${name}`);
      const path = join(dir, `mutation-${i}.mjs`);
      await writeFile(path,original.replace(before,after));
      const altered = await import(pathToFileURL(path).href);
      const errors = which === "district" ? inspectDistricts(altered.hongKongDistricts,altered.districtGeographySource,official,controls) : inspectAttractions(altered.hongKongAttractions,altered.attractionTypes,altered.attractionSource,locations,official);
      check(`源碼突變：${name} 被 production 同一檢查器捉到`,errors.includes(expected));
    }
  } finally { await rm(dir,{recursive:true,force:true}); }
}
