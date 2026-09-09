import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import * as map from "../src/components/map-view.js";

export async function testMapView(check) {
  console.log("\n[地圖視窗] 縮放、拖移、定位的已知答案及源碼突變自證");
  const close = (a, b) => typeof a === "number" && Math.abs(a - b) < 1e-10;
  const viewIs = (actual, expected) => close(actual.zoom, expected.zoom) && close(actual.x, expected.x) && close(actual.y, expected.y);
  const throws = (fn) => {try {fn(); return false;} catch {return true;}};
  const invalid = [null, "2", "", true, false, NaN, Infinity, -Infinity, [], {}, 2n];
  const normal = {zoom: 2, x: 0.5, y: 0.5};
  const oracles = {
    defaults: (m) => viewIs(m.normalizeMapView(), {zoom: 1, x: 0.5, y: 0.5}) && viewIs(m.normalizeMapView({zoom: 2}), normal),
    zoomLow: (m) => viewIs(m.normalizeMapView({zoom: -7, x: 0, y: 1}), {zoom: 1, x: 0.5, y: 0.5}),
    zoomHigh: (m) => viewIs(m.normalizeMapView({zoom: 20}), {zoom: 4, x: 0.5, y: 0.5}),
    xLow: (m) => viewIs(m.normalizeMapView({zoom: 4, x: -10, y: 0.6}), {zoom: 4, x: 0.125, y: 0.6}),
    xHigh: (m) => viewIs(m.normalizeMapView({zoom: 4, x: 10, y: 0.6}), {zoom: 4, x: 0.875, y: 0.6}),
    yLow: (m) => viewIs(m.normalizeMapView({zoom: 2, x: 0.6, y: -10}), {zoom: 2, x: 0.6, y: 0.25}),
    yHigh: (m) => viewIs(m.normalizeMapView({zoom: 2, x: 0.6, y: 10}), {zoom: 2, x: 0.6, y: 0.75}),
    zoomIn: (m) => viewIs(m.zoomMapView({zoom: 2, x: 0.3, y: 0.7}, 0.5), {zoom: 2.5, x: 0.3, y: 0.7}),
    zoomOut: (m) => viewIs(m.zoomMapView({zoom: 4, x: 0.125, y: 0.875}, -2), {zoom: 2, x: 0.25, y: 0.75}),
    zoomLimit: (m) => viewIs(m.zoomMapView(normal, 100), {zoom: 4, x: 0.5, y: 0.5}) && viewIs(m.zoomMapView(normal, -100), {zoom: 1, x: 0.5, y: 0.5}),
    panRight: (m) => viewIs(m.panMapView(normal, 0.2, 0), {zoom: 2, x: 0.4, y: 0.5}),
    panDown: (m) => viewIs(m.panMapView(normal, 0, 0.2), {zoom: 2, x: 0.5, y: 0.4}),
    panReverse: (m) => viewIs(m.panMapView(normal, -0.2, -0.4), {zoom: 2, x: 0.6, y: 0.7}),
    panHighZoom: (m) => viewIs(m.panMapView({zoom: 4, x: 0.5, y: 0.5}, 0.2, -0.2), {zoom: 4, x: 0.45, y: 0.55}),
    panBounds: (m) => viewIs(m.panMapView(normal, 100, -100), {zoom: 2, x: 0.25, y: 0.75}),
    fullMap: (m) => viewIs(m.panMapView({}, 0.4, -0.4), {zoom: 1, x: 0.5, y: 0.5}),
    focusIn: (m) => viewIs(m.focusMapView({}, 0.3, 0.7), {zoom: 2.5, x: 0.3, y: 0.7}),
    focusHigh: (m) => viewIs(m.focusMapView({zoom: 4, x: 0.5, y: 0.5}, 0.3, 0.7), {zoom: 4, x: 0.3, y: 0.7}),
    focusBounds: (m) => viewIs(m.focusMapView({}, -1, 2), {zoom: 2.5, x: 0.2, y: 0.8}),
    transformDefault: (m) => m.mapTransform() === "translate(0%, 0%) scale(1)",
    transformCenter: (m) => m.mapTransform(normal) === "translate(-50%, -50%) scale(2)",
    transformEdge: (m) => m.mapTransform({zoom: 2, x: 0.25, y: 0.75}) === "translate(0%, -100%) scale(2)",
    transformHigh: (m) => m.mapTransform({zoom: 4, x: 0.25, y: 0.75}) === "translate(-50%, -250%) scale(4)",
    transformClamp: (m) => m.mapTransform({zoom: 10, x: -1, y: 3}) === "translate(0%, -300%) scale(4)",
    objectGuard: (m) => [null, 2, "2", true, [], () => {}].every((state) => throws(() => m.normalizeMapView(state))),
    zoomGuard: (m) => invalid.every((zoom) => throws(() => m.normalizeMapView({zoom}))),
    xGuard: (m) => invalid.every((x) => throws(() => m.normalizeMapView({x}))),
    yGuard: (m) => invalid.every((y) => throws(() => m.normalizeMapView({y}))),
    deltaGuard: (m) => [...invalid, undefined].every((delta) => throws(() => m.zoomMapView(normal, delta))),
    dxGuard: (m) => [...invalid, undefined].every((dx) => throws(() => m.panMapView(normal, dx, 0))),
    dyGuard: (m) => [...invalid, undefined].every((dy) => throws(() => m.panMapView(normal, 0, dy))),
    focusXGuard: (m) => [...invalid, undefined].every((x) => throws(() => m.focusMapView(normal, x, 0.5))),
    focusYGuard: (m) => [...invalid, undefined].every((y) => throws(() => m.focusMapView(normal, 0.5, y))),
  };
  const labels = {
    defaults: "預設全圖、部分欄位補顯示預設", zoomLow: "縮放下限 1 倍", zoomHigh: "縮放上限 4 倍",
    xLow: "4 倍左邊界 0.125", xHigh: "4 倍右邊界 0.875", yLow: "2 倍上邊界 0.25", yHigh: "2 倍下邊界 0.75",
    zoomIn: "放大保留原中心", zoomOut: "縮細重新限制中心", zoomLimit: "大幅縮放仍受上下限限制",
    panRight: "2 倍向右拖 20% 視窗，中心向左 0.1", panDown: "2 倍向下拖 20% 視窗，中心向上 0.1",
    panReverse: "反方向拖移", panHighZoom: "4 倍相同拖移距離只改中心 0.05", panBounds: "拖到邊界唔露出原圖外空白", fullMap: "全圖 1 倍唔可移出視窗",
    focusIn: "選地點放大至 2.5 倍", focusHigh: "選地點保留較高倍率", focusBounds: "邊緣地點盡量置中而唔露白",
    transformDefault: "全圖 CSS 0% / 1 倍", transformCenter: "2 倍中央 CSS −50%", transformEdge: "2 倍左下角 CSS 0% / −100%",
    transformHigh: "4 倍偏心 CSS −50% / −250%", transformClamp: "CSS 亦先限制原圖範圍",
    objectGuard: "拒絕無效視窗容器", zoomGuard: "縮放只接受有限數字", xGuard: "中心 x 只接受有限數字", yGuard: "中心 y 只接受有限數字",
    deltaGuard: "縮放幅度只接受有限數字", dxGuard: "水平拖移只接受有限數字", dyGuard: "垂直拖移只接受有限數字",
    focusXGuard: "焦點 x 只接受有限數字", focusYGuard: "焦點 y 只接受有限數字",
  };
  for (const [key, oracle] of Object.entries(oracles)) check(`已知答案：${labels[key]}`, oracle(map));
  check("所有操作拒絕無效原視窗，唔靜靜地轉成零", [null, [], {zoom: NaN}, {x: "0.5"}, {y: Infinity}].every((state) => [
    () => map.zoomMapView(state, 0.5), () => map.panMapView(state, 0, 0), () => map.focusMapView(state, 0.5, 0.5), () => map.mapTransform(state),
  ].every(throws)));
  const frozen = Object.freeze({zoom: 2, x: 0.4, y: 0.6});
  const results = [map.normalizeMapView(frozen), map.zoomMapView(frozen, 0.5), map.panMapView(frozen, 0.2, 0.2), map.focusMapView(frozen, 0.3, 0.7)];
  results.forEach((view) => view.x = 999);
  check("操作回傳新物件，唔修改原始視窗", frozen.x === 0.4 && frozen.y === 0.6 && results.every((view) => view !== frozen));
  check("零幅度維持視窗", viewIs(map.zoomMapView(frozen, 0), frozen) && viewIs(map.panMapView(frozen, 0, 0), frozen));
  check("原地縮放來回保留中心", viewIs(map.zoomMapView(map.zoomMapView(frozen, 1), -1), frozen));
  check("未到邊界拖移來回還原", viewIs(map.panMapView(map.panMapView(frozen, 0.1, -0.1), -0.1, 0.1), frozen));

  const source = await readFile(new URL("../src/components/map-view.js", import.meta.url), "utf8");
  const dir = await mkdtemp(join(tmpdir(), "hkdm-map-view-"));
  let sequence = 0;
  const detects = (oracle, module) => {try {return !oracle(module);} catch {return true;}};
  async function mutate(from, to) {
    if (source.split(from).length !== 2) throw new Error(`源碼突變必須精確命中一次：${from}`);
    const file = join(dir, `mutation-${sequence++}.mjs`);
    await writeFile(file, source.replace(from, to));
    return import(pathToFileURL(file).href);
  }
  try {
    for (const [label, from, to, oracleKey] of [
      ["全圖預設放大", "zoom = 1, x = 0.5", "zoom = 2, x = 0.5", "defaults"],
      ["移走縮放下限", "Math.max(1, Math.min(4, zoom))", "Math.min(4, zoom)", "zoomLow"],
      ["移走縮放上限", "Math.max(1, Math.min(4, zoom))", "Math.max(1, zoom)", "zoomHigh"],
      ["邊界忘記除倍率", "const edge = 0.5 / boundedZoom;", "const edge = 0.5;", "xLow"],
      ["左邊界放行", "Math.max(edge, Math.min(1 - edge, x))", "Math.min(1 - edge, x)", "xLow"],
      ["右邊界放行", "Math.max(edge, Math.min(1 - edge, x))", "Math.max(edge, x)", "xHigh"],
      ["上邊界放行", "Math.max(edge, Math.min(1 - edge, y))", "Math.min(1 - edge, y)", "yLow"],
      ["下邊界放行", "Math.max(edge, Math.min(1 - edge, y))", "Math.max(edge, y)", "yHigh"],
      ["縮放方向調轉", "zoom: view.zoom + delta", "zoom: view.zoom - delta", "zoomIn"],
      ["縮放後冇限制範圍", "return normalizeMapView({...view, zoom: view.zoom + delta});", "return {...view, zoom: view.zoom + delta};", "zoomOut"],
      ["縮放重設中心", "{...view, zoom: view.zoom + delta}", "{zoom: view.zoom + delta}", "zoomIn"],
      ["水平拖移方向調轉", "x: view.x - dx / view.zoom", "x: view.x + dx / view.zoom", "panRight"],
      ["垂直拖移方向調轉", "y: view.y - dy / view.zoom", "y: view.y + dy / view.zoom", "panDown"],
      ["水平拖移漏除倍率", "x: view.x - dx / view.zoom", "x: view.x - dx", "panHighZoom"],
      ["垂直拖移漏除倍率", "y: view.y - dy / view.zoom", "y: view.y - dy", "panHighZoom"],
      ["水平拖移誤用垂直距離", "x: view.x - dx / view.zoom", "x: view.x - dy / view.zoom", "panRight"],
      ["垂直拖移誤用水平距離", "y: view.y - dy / view.zoom", "y: view.y - dx / view.zoom", "panDown"],
      ["拖移後冇限制範圍", "return normalizeMapView({zoom: view.zoom, x: view.x - dx / view.zoom, y: view.y - dy / view.zoom});", "return {zoom: view.zoom, x: view.x - dx / view.zoom, y: view.y - dy / view.zoom};", "panBounds"],
      ["選點無放大", "Math.max(view.zoom, 2.5)", "view.zoom", "focusIn"],
      ["選點重設較高倍率", "Math.max(view.zoom, 2.5)", "2.5", "focusHigh"],
      ["選點誤用舊中心", "{zoom: Math.max(view.zoom, 2.5), x, y}", "{zoom: Math.max(view.zoom, 2.5), x: view.x, y: view.y}", "focusIn"],
      ["選點後冇限制範圍", "return normalizeMapView({zoom: Math.max(view.zoom, 2.5), x, y});", "return {zoom: Math.max(view.zoom, 2.5), x, y};", "focusBounds"],
      ["CSS 水平漏乘倍率", "(0.5 - x * zoom) * 100", "(0.5 - x) * 100", "transformHigh"],
      ["CSS 垂直漏乘倍率", "(0.5 - y * zoom) * 100", "(0.5 - y) * 100", "transformHigh"],
      ["CSS 水平百分比差十倍", "(0.5 - x * zoom) * 100", "(0.5 - x * zoom) * 10", "transformHigh"],
      ["CSS 垂直百分比差十倍", "(0.5 - y * zoom) * 100", "(0.5 - y * zoom) * 10", "transformHigh"],
      ["CSS 唔做縮放", "scale(${zoom})", "scale(1)", "transformCenter"],
      ["CSS 跳過視窗限制", "const {zoom, x, y} = normalizeMapView(state);", "const {zoom, x, y} = state;", "transformClamp"],
      ["接受陣列當視窗", "Array.isArray(state)", "false", "objectGuard"],
      ["移走有限數字檢查", 'if (typeof value !== "number" || !Number.isFinite(value))', "if (false)", "zoomGuard"],
      ["縮放跳過數值檢查", 'finiteNumber(zoom, "zoom");', "", "zoomGuard"],
      ["中心 x 跳過數值檢查", 'finiteNumber(x, "x");', "", "xGuard"],
      ["中心 y 跳過數值檢查", 'finiteNumber(y, "y");', "", "yGuard"],
      ["縮放幅度跳過數值檢查", 'finiteNumber(delta, "縮放幅度");', "", "deltaGuard"],
      ["水平拖移跳過數值檢查", 'finiteNumber(dx, "水平移動");', "", "dxGuard"],
      ["垂直拖移跳過數值檢查", 'finiteNumber(dy, "垂直移動");', "", "dyGuard"],
      ["焦點 x 跳過數值檢查", 'finiteNumber(x, "焦點 x");', "", "focusXGuard"],
      ["焦點 y 跳過數值檢查", 'finiteNumber(y, "焦點 y");', "", "focusYGuard"],
    ]) check(`源碼突變：${label}會被捉到`, detects(oracles[oracleKey], await mutate(from, to)));
  } finally {await rm(dir, {recursive: true, force: true});}
}
