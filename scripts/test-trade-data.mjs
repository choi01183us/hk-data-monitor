// 商品貨值與港口重量：先以已知答案自證，再突變來源及真正 loader。
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CENSTATD_INDICATORS, tradeMillionsToDollars, cargoThousandsToTonnes,
  verifyGoodsImports, verifyGoodsExports, verifyPortCargo,
} from "../src/data/_lib/indicators.js";

const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const goodsRows = (sv = "VAL_IM", figure = 6, period = "202401") => [{
  freq: "M", period, sv, svDesc: "百萬港元", figure, sd_value: "",
}];
const cargoRows = (figures = [10, 6, 4, 2, 4, 1, 3], period = "202403") =>
  [["", ""], ["In", ""], ["In", "DS"], ["In", "TS"], ["Out", ""], ["Out", "DS"], ["Out", "TS"]]
    .map(([DIRECTION, SHIPMENT_TYPE], index) => ({
      DIRECTION, SHIPMENT_TYPE, freq: "Q", period, sv: "PORT_CARGO_TP", svDesc: "(千公噸)", figure: figures[index], sd_value: "",
    }));

export async function testTradeData(check) {
  console.log("\n[貿易及港口] 指定變項、方向總量及單位 — 已知答案與突變");
  for (const [source, dollars, tonnes] of [[0, 0, 0], [1, 1000000, 1000], [6, 6000000, 6000], [12345, 12345000000, 12345000]]) {
    check(`${source} 百萬港元 = ${dollars} 港元`, tradeMillionsToDollars(source) === dollars);
    check(`${source} 千公噸 = ${tonnes} 公噸`, cargoThousandsToTonnes(source) === tonnes);
  }
  check("貿易缺值唔填零", tradeMillionsToDollars(null) === null);
  check("港口缺值唔填零", cargoThousandsToTonnes(null) === null);

  for (const [id, sv, verify] of [["goods_imports", "VAL_IM", verifyGoodsImports], ["goods_exports", "VAL_TX", verifyGoodsExports]]) {
    for (const value of [0, 1, 6, 12345]) {
      check(`${id} 原值 ${value} 百萬逐點核對`, !throws(() => verify(goodsRows(sv, value), [{ period: "2024-01", value: value * 1000000 }])));
    }
    const good = [{ period: "2024-01", value: 6000000 }];
    for (const [name, mutate] of [
      ["錯統計變項", (r) => { r[0].sv = sv === "VAL_IM" ? "VAL_TX" : "VAL_IM"; }],
      ["千元冒充百萬元", (r) => { r[0].svDesc = "千港元"; }],
      ["年度冒充月份", (r) => { r[0].freq = "Y"; }],
      ["無效月份", (r) => { r[0].period = "202413"; }],
      ["月份重複", (r) => r.push({ ...r[0] })],
      ["負貨值", (r) => { r[0].figure = -6; }],
      ["來源數值壞咗", (r) => { r[0].figure = "oops"; }],
      ["未知狀態唔可靜靜丟棄最新月份", (r) => { r[0].sd_value = "@"; }],
      ["缺值填零或原值", (r) => { r[0].figure = ""; }],
      ["未發布值不可當有效", (r) => { r[0].sd_value = "n.y.a."; }],
    ]) {
      const rows = goodsRows(sv); mutate(rows);
      check(`${id} 突變:${name}會嘈`, throws(() => verify(rows, good)));
    }
    check(`${id} 錯倍率會嘈`, throws(() => verify(goodsRows(sv), [{ period: "2024-01", value: 6000006 }])));
    check(`${id} 最終值缺少會嘈`, throws(() => verify(goodsRows(sv), [])));
    check(`${id} 假分類會嘈`, throws(() => verify(goodsRows(sv), [{ ...good[0], category: "總額" }])));
    const gaps = [...goodsRows(sv, 6, "202401"), ...goodsRows(sv, "", "202402"), ...goodsRows(sv, 8, "202403")];
    check(`${id} 中間缺值保留斷線`, !throws(() => verify(gaps, [good[0], { period: "2024-02", value: null }, { period: "2024-03", value: 8000000 }])));
    check(`${id} 中間缺值唔可刪走`, throws(() => verify(gaps, [good[0], { period: "2024-03", value: 8000000 }])));
    check(`${id} 頭尾空期可以剪走`, !throws(() => verify([...goodsRows(sv, "", "202312"), ...goodsRows(sv), ...goodsRows(sv, "", "202402")], good)));
    check(`${id} 修訂標記保留有效數`, !throws(() => verify(goodsRows(sv).map((r) => ({ ...r, sd_value: "r" })), good)));
  }

  check("港口 6 + 4 = 10 千公噸，最終係 10000 公噸", !throws(() => verifyPortCargo(cargoRows(), [{ period: "2024-Q1", value: 10000 }])));
  check("港口零總額可接受", !throws(() => verifyPortCargo(cargoRows([0, 0, 0, 0, 0, 0, 0]), [{ period: "2024-Q1", value: 0 }])));
  for (const total of [9, 11]) check(`港口總量 ${total} 對 6 + 4 嘅 1 千公噸捨入差可接受`, !throws(() => verifyPortCargo(cargoRows([total, 6, 4, 2, 4, 1, 3]), [{ period: "2024-Q1", value: total * 1000 }])));
  for (const total of [8, 12]) check(`港口總量 ${total} 對 6 + 4 嘅 2 千公噸差會嘈`, throws(() => verifyPortCargo(cargoRows([total, 6, 4, 2, 4, 1, 3]), [{ period: "2024-Q1", value: total * 1000 }])));
  check("大額亦唔放鬆 2 千公噸差", throws(() => verifyPortCargo(cargoRows([1000002, 600000, 400000, 200000, 400000, 100000, 300000]), [{ period: "2024-Q1", value: 1000002000 }])));
  for (const [name, mutate] of [
    ["Total 維度消失", (r) => { delete r[0].DIRECTION; }],
    ["裝運總量維度消失", (r) => { delete r[0].SHIPMENT_TYPE; }],
    ["缺離港分項", (r) => r.pop()],
    ["重複總額", (r) => r.push({ ...r[0] })],
    ["錯方向分類", (r) => { r[1].DIRECTION = "Other"; }],
    ["貨櫃數冒充重量", (r) => { r[0].sv = "PORT_CONTAINER_TP"; }],
    ["標準貨櫃單位冒充千公噸", (r) => { r[0].svDesc = "(千標準貨櫃單位)"; }],
    ["年度冒充季度", (r) => { r[0].freq = "Y"; }],
    ["無效季度月份", (r) => { r[0].period = "202402"; }],
    ["負分項", (r) => { r[2].figure = -4; }],
    ["直接裝運加轉運對唔上抵港", (r) => { r[2].figure = 6; }],
    ["缺總量唔准借分項填", (r) => { r[0].figure = ""; }],
    ["未知狀態", (r) => { r[0].sd_value = "@"; }],
  ]) {
    const rows = cargoRows(); mutate(rows);
    check(`港口突變:${name}會嘈`, throws(() => verifyPortCargo(rows, [{ period: "2024-Q1", value: 10000 }])));
  }
  check("抵港量唔能冒充港口總量", throws(() => verifyPortCargo(cargoRows(), [{ period: "2024-Q1", value: 6000 }])));
  check("港口錯倍率會嘈", throws(() => verifyPortCargo(cargoRows(), [{ period: "2024-Q1", value: 10010 }])));
  const cargoGaps = [...cargoRows(undefined, "202403"), ...cargoRows(["", 6, 4, 2, 4, 1, 3], "202406"), ...cargoRows(undefined, "202409")];
  check("港口中間總量缺值保留 null，唔自行相加", !throws(() => verifyPortCargo(cargoGaps, [{ period: "2024-Q1", value: 10000 }, { period: "2024-Q2", value: null }, { period: "2024-Q3", value: 10000 }])));
  check("港口中間缺期唔可刪走", throws(() => verifyPortCargo(cargoGaps, [{ period: "2024-Q1", value: 10000 }, { period: "2024-Q3", value: 10000 }])));

  for (const [id, series, expected] of [
    ["goods_imports", [{ period: "2024-07", value: 100 }, { period: "2025-07", value: 125 }], "25%"],
    ["goods_exports", [{ period: "2024-07", value: 100 }, { period: "2025-07", value: 75 }], "25%"],
    ["port_cargo", [{ period: "2024-Q2", value: 100 }, { period: "2025-Q2", value: 100 }], "0%"],
  ]) {
    const anchors = CENSTATD_INDICATORS[id].anchors(series);
    check(`${id} 去年同期錨點已知答案`, anchors.length === 1 && anchors[0].text_zh.includes(expected));
  }
  check("唔借其他月份做去年同期", CENSTATD_INDICATORS.goods_imports.anchors([{ period: "2024-06", value: 100 }, { period: "2025-07", value: 125 }]).length === 0);

  const original = new URL("../src/data/_lib/indicators.js", import.meta.url);
  const source = await readFile(original, "utf8");
  const temp = await mkdtemp(join(tmpdir(), "hkdm-trade-data-"));
  const previousMode = process.env.HKDM_FIXTURES;
  process.env.HKDM_FIXTURES = "replay";
  try {
    let sequence = 0;
    for (const [id, name, before, after, expected] of [
      ["goods_imports", "進口改成出口", 'goods_imports: {\n    table: "410-50001",\n    sv: "VAL_IM"', 'goods_imports: {\n    table: "410-50001",\n    sv: "VAL_TX"', "統計變項、頻率或來源單位改變"],
      ["goods_exports", "貨值倍率錯", "value * 1e6;", "value * 1000001;", "最終數列唔等於"],
      ["port_cargo", "抵港 pin 冒充 Total", 'pin: { DIRECTION: "", SHIPMENT_TYPE: "" }', 'pin: { DIRECTION: "In", SHIPMENT_TYPE: "" }', "最終數列唔等於"],
      ["port_cargo", "重量倍率錯", "value * 1e3;", "value * 1001;", "最終數列唔等於"],
    ]) {
      if (source.split(before).length !== 2) throw new Error(`貿易突變必須精確命中一次:${before}`);
      const altered = source.replace(before, after).replace(/(\bfrom\s+["'])(\.[^"']+)(["'])/g,
        (_, prefix, specifier, suffix) => `${prefix}${new URL(specifier, original).href}${suffix}`);
      const path = join(temp, `variant-${sequence++}.mjs`);
      await writeFile(path, altered);
      const variant = await import(pathToFileURL(path).href);
      let message = "";
      try { await variant.loadCenstatdIndicator(id); } catch (error) { message = error.message; }
      check(`真正 loader 突變:${name} -> 切片守衛拒絕`, message.includes(expected));
    }
  } finally {
    if (previousMode === undefined) delete process.env.HKDM_FIXTURES;
    else process.env.HKDM_FIXTURES = previousMode;
    await rm(temp, { recursive: true, force: true });
  }
}
