// Offline contract tests; use the same validator that the build runs.
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {validateMacauGeography} from "../src/data/_lib/macau-geography-check.js";
import {macauPlaces} from "../src/components/macau-places.js";

const hasField = (result, field) => !result.ok && result.errors.some((error) => error.startsWith(`${field}:`));

export async function testMacauGeography(check) {
  console.log("\n[澳門地理] 離線圖形、投影、來源及檢查器自證");
  const guardURL = new URL("../src/data/_lib/macau-geography-check.js", import.meta.url);
  const [geography, guardSource] = await Promise.all([
    readFile(new URL("../src/data/macau-geography.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(guardURL, "utf8")
  ]);

  // EPSG:3857 reference coordinates, independent of the validator's formula:
  // (±180°,0°) E = ±20037508.342789244; (0°,±45°) N = ±5621521.486192066.
  // Set centre to (0,0), scale to 0.00001, then round the known canvas answers.
  const controlMap = structuredClone(geography);
  Object.assign(controlMap.projection, {center_easting: 0, center_northing: 0, scale: 0.00001});
  const controls = [
    ["投影原點", 0, 0, 450, 280],
    ["東經 180 度", 180, 0, 650.38, 280],
    ["西經 180 度", -180, 0, 249.62, 280],
    ["北緯 45 度", 0, 45, 450, 223.78],
    ["南緯 45 度", 0, -45, 450, 336.22],
    ["東經 90 度", 90, 0, 550.19, 280]
  ].map(([name, longitude, latitude, x, y], index) => ({name, point: {...macauPlaces[0], id: `control-${index}`, longitude, latitude, x, y}}));

  const mutations = [
    ["畫框尺寸改錯", (g) => {g.viewBox[2] = 901;}, "viewBox"],
    ["畫框數值變字串", (g) => {g.viewBox[0] = "0";}, "viewBox"],
    ["空路徑", (g) => {g.path = "";}, "path"],
    ["缺少 Z 封閉", (g) => {g.path = "M10,10L20,10L20,20";}, "path"],
    ["未封閉即開始另一環", (g) => {g.path = "M10,10L20,10M30,30L40,30L40,40Z";}, "path"],
    ["少於三個頂點", (g) => {g.path = "M10,10L20,10Z";}, "path"],
    ["退化成直線", (g) => {g.path = "M10,10L20,20L30,30Z";}, "path"],
    ["超出畫框", (g) => {g.path = "M0,0L901,0L900,560Z";}, "path"],
    ["非有限坐標", (g) => {g.path = "M0,0L1e309,0L900,560Z";}, "path"],
    ["未知 SVG 指令", (g) => {g.path += "Q10,10";}, "path"],
    ["路徑夾雜標記", (g) => {g.path += "<script/>";}, "path"],
    ["失去孔洞填色規則", (g) => {g.fill_rule = "nonzero";}, "fill_rule"],
    ["缺 OSM 資料來源", (g) => {delete g.source.source_url;}, "source.source_url"],
    ["缺 OSM 來源名稱", (g) => {delete g.source.source_zh;}, "source.source_zh"],
    ["OSM URL 不能由陣列自動轉字串", (g) => {g.source.source_url = [g.source.source_url];}, "source.source_url"],
    ["OSM 假域名", (g) => {g.source.source_url = "https://www.openstreetmap.org.example.com/relation/1867188";}, "source.source_url"],
    ["失去地圖鳴謝", (g) => {g.source.attribution = "";}, "source.attribution"],
    ["缺 OSM 條款連結", (g) => {delete g.source.attribution_url;}, "source.attribution_url"],
    ["改成不相符授權", (g) => {g.source.licence = "Public domain";}, "source.licence"],
    ["授權連結失效", (g) => {g.source.licence_url = "https://example.com/odbl";}, "source.licence_url"],
    ["不存在的核對日期", (g) => {g.source.verified_at = "2025-02-29";}, "source.verified_at"],
    ["投影 CRS 改錯", (g) => {g.projection.crs = "EPSG:4326";}, "projection.crs"],
    ["來源經緯度次序改錯", (g) => {g.projection.source_crs = "latitude/longitude";}, "projection.source_crs"],
    ["非有限投影中心", (g) => {g.projection.center_easting = NaN;}, "projection.center"],
    ["投影中心變字串", (g) => {g.projection.center_northing = "2531157";}, "projection.center"],
    ["投影中心為不可轉數值的 JSON 物件", (g) => {g.projection.center_easting = {toString: null};}, "projection.center"],
    ["縮放為不可轉數值的 JSON 物件", (g) => {g.projection.scale = {toString: null};}, "projection.scale"],
    ["零縮放", (g) => {g.projection.scale = 0;}, "projection.scale"],
    ["負縮放", (g) => {g.projection.scale = -1;}, "projection.scale"],
    ["無限縮放", (g) => {g.projection.scale = Infinity;}, "projection.scale"],
    ["Y 軸公式倒轉", (g) => {g.projection.y_formula = "280 + (N - center_northing) * scale";}, "projection.formulas"],
    ["沒有景點", (_, p) => {p.length = 0;}, "places"],
    ["景點 ID 重複", (_, p) => {p.push({...p[0]});}, `places[${macauPlaces.length}].id`],
    ["景點紀錄變空", (_, p) => {p[0] = null;}, "places[0]"],
    ["景點超出畫框", (_, p) => {p[0].x = -1;}, "places[0].xy"],
    ["景點 xy 變字串", (_, p) => {p[0].x = String(p[0].x);}, "places[0].xy"],
    ["景點經緯度對調", (_, p) => {[p[0].longitude, p[0].latitude] = [p[0].latitude, p[0].longitude];}, "places[0].longitude_latitude"],
    ["無限經度", (_, p) => {p[0].longitude = Infinity;}, "places[0].longitude_latitude"],
    ["NaN 緯度", (_, p) => {p[0].latitude = NaN;}, "places[0].longitude_latitude"],
    ["畫框內移動景點仍被捉到", (_, p) => {p[0].x += 1;}, "places[0].projection"],
    ["Y 軸移動超出捨入容差", (_, p) => {p[0].y += 0.02;}, "places[0].projection"],
    ["位置來源假域名", (_, p) => {p[0].location_source_url = "https://www.macaotourism.gov.mo.example.com/zh-hant/sightseeing/churches/ruins-of-st-pauls";}, "places[0].source"],
    ["景點 URL 不能由陣列自動轉字串", (_, p) => {p[0].location_source_url = [p[0].location_source_url];}, "places[0].source"],
    ["介紹來源使用 HTTP", (_, p) => {p[0].source_url = p[0].source_url.replace("https:", "http:");}, "places[0].source"],
    ["介紹缺少個別景點頁", (_, p) => {p[0].source_url = "https://www.macaotourism.gov.mo/zh-hant/sightseeing";}, "places[0].source"],
    ["官方來源機構消失", (_, p) => {delete p[0].source_zh;}, "places[0].source_zh"],
    ["定位限制消失", (_, p) => {p[0].location_note = "";}, "places[0].location_note"],
    ["缺景點核對日期", (_, p) => {delete p[0].verified_at;}, "places[0].dates"]
  ];

  function evaluate(validate) {
    const results = [["production 澳門地理及景點通過同一 build 檢查", validate(geography, macauPlaces).ok]];
    for (const {name, point} of controls) results.push([`投影已知答案：${name}`, validate(controlMap, [point]).ok]);
    for (const [name, mutate, field] of mutations) {
      const g = structuredClone(geography), p = structuredClone(macauPlaces);
      mutate(g, p);
      results.push([`突變：${name}`, hasField(validate(g, p), field)]);
    }
    results.push(["空地圖與非陣列景點不會當成有效資料", !validate(null, macauPlaces).ok && hasField(validate(geography, null), "places")]);
    const simple = structuredClone(geography);
    simple.path = "M0,0L900,0L900,560L0,560Z M10,10L20,10L20,20Z";
    simple.source.verified_at = "2024-02-29";
    results.push(["其他有效封閉環及核對日期不鎖定現有路徑字節／年份", validate(simple, macauPlaces).ok]);
    const near = {...controls[0].point, x: 450.01};
    results.push(["已知答案：0.01 畫素捨入誤差可接受，0.012 不可接受", validate(controlMap, [near]).ok && hasField(validate(controlMap, [{...near, x: 450.012}]), "places[0].projection")]);
    return results;
  }
  for (const [name, passed] of evaluate(validateMacauGeography)) check(name, passed);

  // Mutate the actual production validator, load it independently, and require
  // the known-answer/data-mutation probes above to detect the broken guard.
  const directory = await mkdtemp(join(tmpdir(), "hkdm-macau-guard-"));
  try {
    const guardMutations = [
      ["忽略全部錯誤", "if (!condition) errors.push", "if (false) errors.push"],
      ["略過 SVG 格式檢查", 'check(validPath(geography.path), "path",', 'check(true, "path",'],
      ["誤差容限擴至 20 畫素", "const PIXEL_TOLERANCE = 0.011;", "const PIXEL_TOLERANCE = 20;"],
      ["Y 軸計算倒轉", "const y = 280 - (north - projection.center_northing) * projection.scale;", "const y = 280 + (north - projection.center_northing) * projection.scale;"],
      ["不再核對來源域名", "hosts.includes(url.hostname)", "true"],
      ["略過 ODbL 授權名稱", "nonempty(source.licence) && /ODbL|Open Database License/i.test(source.licence)", "true"]
    ];
    for (const [index, [name, before, after]] of guardMutations.entries()) {
      if (guardSource.split(before).length !== 2) throw new Error(`澳門檢查器源碼突變必須精確命中一次：${name}`);
      const path = join(directory, `guard-${index}.mjs`);
      await writeFile(path, guardSource.replace(before, after));
      const altered = await import(pathToFileURL(path).href);
      check(`檢查器源碼突變：${name} 會被自證抓到`, evaluate(altered.validateMacauGeography).some(([, passed]) => !passed));
    }
  } finally { await rm(directory, {recursive: true, force: true}); }
}
