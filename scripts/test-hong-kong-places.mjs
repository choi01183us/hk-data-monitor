// 直接驗 production 地點；官方 fixture 獨立保存錨點，先自證換算再比較。
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {hongKongPlaces, placeTypes} from "../src/components/hong-kong-places.js";

const anchors = [
  ["central", 1924, "business", "www.had-cwdo.gov.hk"],
  ["tsim-sha-tsui", 2203, "business", "www.discoverhongkong.com"],
  ["kwun-tong", 189, "business", "www.ekeo.gov.hk"],
  ["kowloon-bay", 2244, "business", "www.ekeo.gov.hk"],
  ["airport", 1508, "transport", "www.hongkongairport.com"],
  ["kwai-tsing-port", 120, "transport", "www.mardep.gov.hk"],
  ["tai-mo-shan", 436, "countryside", "www.afcd.gov.hk"],
  ["sai-kung-east", 285, "countryside", "www.afcd.gov.hk"],
  ["lantau-south", 627, "countryside", "www.afcd.gov.hk"]
];
const typeIds = ["business", "transport", "countryside"];
const toMap = (e, n) => ({
  x: Number(((e - 832250) * 0.0112 + 450).toFixed(2)),
  y: Number(((824000 - n) * 0.0112 + 280).toFixed(2))
});
const httpsHost = (value, hostname) => {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === hostname; }
  catch { return false; }
};

function inspectPlaces(places, types, fixture) {
  const errors = [];
  if (!Array.isArray(places) || places.length !== anchors.length) errors.push("count");
  if (!Array.isArray(types) || types.map((type) => type.id).join() !== typeIds.join()) errors.push("types");
  if (!Array.isArray(places)) return errors;
  if (new Set(places.map((place) => place.id)).size !== places.length) errors.push("duplicate");
  if (places.some((place) => !anchors.some(([id]) => id === place.id))) errors.push("unknown");
  for (const [id, objectId, type, sourceHost] of anchors) {
    const matches = places.filter((place) => place.id === id);
    if (matches.length !== 1) { errors.push(`${id}:identity`); continue; }
    const place = matches[0];
    const official = fixture.features.find((feature) => feature.attributes.OBJECTID === objectId);
    if (!official) { errors.push(`${id}:fixture`); continue; }
    if (place.location_object_id !== objectId) errors.push(`${id}:objectid`);
    if (place.location_label !== official.attributes.TextString) errors.push(`${id}:label`);
    const expected = toMap(official.geometry.x, official.geometry.y);
    if (place.x !== expected.x || place.y !== expected.y) errors.push(`${id}:position`);
    if (place.type !== type) errors.push(`${id}:type`);
    if (!httpsHost(place.source_url, sourceHost)) errors.push(`${id}:source`);
    if (place.location_source_url !== fixture.source_url) errors.push(`${id}:location-source`);
    if (place.verified_at !== fixture.verified_at) errors.push(`${id}:date`);
    for (const field of ["label", "source_zh", "description", "question"]) {
      if (typeof place[field] !== "string" || !place[field].trim()) errors.push(`${id}:${field}`);
    }
  }
  return errors;
}

export async function testHongKongPlaces(check) {
  console.log("\n[香港地點] 官方錨點、分類及來源閘自證");
  // 已知答案不由 fixture 或 production 結果倒算。
  for (const [name, e, n, x, y] of [
    ["中央", 832250, 824000, 450, 280],
    ["左上角", 797000, 849000, 55.2, 0],
    ["右下角", 867500, 799000, 844.8, 560],
    ["向東 5000 米", 837250, 824000, 506, 280]
  ]) {
    const point = toMap(e, n);
    check(`地圖換算已知答案：${name}`, point.x === x && point.y === y);
  }
  const raw = await readFile(new URL("./fixtures/places/landsd-placanno-2026-09-09.json", import.meta.url));
  const fixture = JSON.parse(raw);
  check("地點官方錄影內容釘死，不能同步改壞 expected 放行",
    createHash("sha256").update(raw).digest("hex") === "6b4c781d1e35909a067392af66f2a99385faf76c4d42bbd8b10e331ae5dfaffd");
  check("地點錄影恰好九個官方點、EPSG:2326 及日期來源齊全",
    fixture.features.length === 9 && fixture.spatial_reference === 2326 && fixture.verified_at === "2026-09-09" &&
    fixture.features.map((f) => f.attributes.OBJECTID).join() === anchors.map((a) => a[1]).join() &&
    fixture.features.every((f) => Number.isFinite(f.geometry.x) && Number.isFinite(f.geometry.y)));

  const productionErrors = inspectPlaces(hongKongPlaces, placeTypes, fixture);
  check("實際地點模組通過官方錨點、數量、身分、分類及來源檢查", productionErrors.length === 0);
  for (const [id] of anchors) {
    check(`官方錨點 ${id} 的 ID／地名／兩軸坐標準確`,
      !productionErrors.some((error) => error.startsWith(`${id}:`)));
  }
  check("瀏覽分類固定為商業、交通、郊野三類", placeTypes.map((type) => type.id).join() === typeIds.join());

  const mutate = (change) => { const copy = structuredClone(hongKongPlaces); change(copy); return inspectPlaces(copy, placeTypes, fixture); };
  check("突變自證：換成另一個真實官方 ID 也會嘈", mutate((p) => { p[0].location_object_id = 2203; }).includes("central:objectid"));
  check("突變自證：只換地名但保留總數會嘈", mutate((p) => { p[0].location_label = "尖沙咀"; }).includes("central:label"));
  check("突變自證：XY 對調但仍在畫布內會嘈", mutate((p) => { [p[0].x, p[0].y] = [p[0].y, p[0].x]; }).includes("central:position"));
  check("突變自證：欠一個地點會嘈", mutate((p) => { p.pop(); }).includes("count"));
  check("突變自證：九個地點中有重複 ID 會嘈", mutate((p) => { p[1].id = p[0].id; }).includes("duplicate"));
  check("突變自證：缺官方地圖來源會嘈", mutate((p) => { delete p[0].location_source_url; }).includes("central:location-source"));
  check("突變自證：內容來源指向非官方主機會嘈", mutate((p) => { p[0].source_url = "https://example.test/central"; }).includes("central:source"));
  check("突變自證：增加第四分類會嘈", inspectPlaces(hongKongPlaces,
    [...placeTypes, {id: "district", label: "分區"}], fixture).includes("types"));
  check("突變自證：來源日期遺失會嘈", mutate((p) => { delete p[0].verified_at; }).includes("central:date"));

  // 再改實際模組的臨時副本，確保測試真的驗 production export，非只驗示例。
  const source = await readFile(new URL("../src/components/hong-kong-places.js", import.meta.url), "utf8");
  const dir = await mkdtemp(join(tmpdir(), "hkdm-places-"));
  try {
    let index = 0;
    for (const [name, before, after, code] of [
      ["移動地理錨點", "x: 475.43, y: 366.75", "x: 476.43, y: 366.75", "central:position"],
      ["商業地點誤歸另一個合法類別", 'id: "central", label: "中環", type: "business"', 'id: "central", label: "中環", type: "countryside"', "central:type"],
      ["漏了內容來源", 'source_url: "https://www.had-cwdo.gov.hk/tc/introduce-to-CWD.html",', "", "central:source"]
    ]) {
      if (source.split(before).length !== 2) throw new Error(`地點源碼突變必須精確命中一次：${before}`);
      const path = join(dir, `mutation-${index++}.mjs`);
      await writeFile(path, source.replace(before, after));
      const altered = await import(pathToFileURL(path).href);
      check(`源碼突變：${name} 確實被同一檢查器捉到`,
        inspectPlaces(altered.hongKongPlaces, altered.placeTypes, fixture).includes(code));
    }
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}
