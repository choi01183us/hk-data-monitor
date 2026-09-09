// M1／M2／M3：來源切片、百萬元換算、季度及互相包含關係，自證後再跑真正 loader 突變。
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MONEY_CATEGORIES, MONEY_INDICATORS, moneyMillionsToDollars, verifyMoneySupply, moneySupplyAnchors, loadMoneyIndicator } from "../src/data/_lib/money.js";
import { queryCenstatd, resetTableMetaCache } from "../src/data/_lib/censtatd.js";
import { UpstreamError } from "../src/data/_lib/http.js";

const errorOf = (fn) => { try { fn(); return null; } catch (error) { return error; } };
const hardFailure = (fn) => { const error = errorOf(fn); return error instanceof Error && !(error instanceof UpstreamError); };
function exampleMeta() {
  return { comp: { table_component_ccg_list: {} }, labels: {
    tb_title: "貨幣供應（所有貨幣）", tb_src: "香港金融管理局", tb_fn: "數字為期末數字。",
    sv_list: Object.fromEntries(["M1", "M2", "M3"].map((category) => [category, {
      def_stat_desc: `貨幣供應量${category}`,
      sp_list: { Raw_M_hkd_d: { def_stat_pres_desc: "百萬港元", def_unit: "HK$", def_decimals: "0", def_unit_mult: "6" } },
    }])), cv_list: {},
  } };
}
function exampleRows() {
  return ["199706", "199709"].flatMap((period) => [10, 50, 60].map((figure, index) => ({
    period, freq: "Q", sv: ["M1", "M2", "M3"][index], svDesc: "百萬港元", figure, sd_value: "",
  })));
}
const expectedSeries = () => ["1997-Q2", "1997-Q3"].flatMap((period) => [10_000_000, 50_000_000, 60_000_000].map((value, index) => ({ period, category: ["M1", "M2", "M3"][index], value })));

export async function testMoneyData(check) {
  console.log("\n[貨幣供應] 所有貨幣 M1／M2／M3 的季末存量 — 已知答案與突變");
  for (const [value, expected] of [[0, 0], [1, 1_000_000], [123, 123_000_000], [null, null]]) check(`百萬元 ${value} → 港元 ${expected}`, moneyMillionsToDollars(value) === expected);
  check("單一 money_supply 登記冊，三個定義依次 M1／M2／M3", Object.keys(MONEY_INDICATORS).join() === "money_supply" && MONEY_CATEGORIES.join() === "M1,M2,M3");
  const rows = exampleRows(), series = expectedSeries(), meta = exampleMeta();
  check("兩個已知季度，三個巢狀存量原值精確通過", !errorOf(() => verifyMoneySupply(rows, series, meta)));
  check("來源行次序可改，按季度及變項識別", !errorOf(() => verifyMoneySupply([...rows].reverse(), series, meta)));
  const equalRows = structuredClone(rows), equalSeries = structuredClone(series);
  equalRows.forEach((row) => { row.figure = 10; }); equalSeries.forEach((point) => { point.value = 10_000_000; });
  check("巢狀存量允許 M1 = M2 = M3，唔誤當嚴格小於", !errorOf(() => verifyMoneySupply(equalRows, equalSeries, meta)));
  const missingRows = structuredClone(rows), missingSeries = structuredClone(series);
  missingRows[0].figure = null; missingSeries[0].value = null;
  check("來源缺值保留 null，唔要求假設一個數", !errorOf(() => verifyMoneySupply(missingRows, missingSeries, meta)));
  check("來源缺值填零 hard fail", hardFailure(() => verifyMoneySupply(missingRows, missingSeries.map((point) => ({ ...point, value: point.value ?? 0 })), meta)));
  for (const figure of ["10", 10]) {
    const altered = structuredClone(rows); altered[0].figure = figure;
    check(`來源嚴格整數 ${JSON.stringify(figure)} 可讀`, !errorOf(() => verifyMoneySupply(altered, series, meta)));
  }
  for (const flag of ["r", "p"]) {
    const altered = structuredClone(rows); altered[0].sd_value = flag;
    check(`來源 ${flag} 標記保留原值`, !errorOf(() => verifyMoneySupply(altered, series, meta)));
  }
  for (const flag of ["-", "N.A.", "n.y.a."]) {
    const altered = structuredClone(rows); altered[0].sd_value = flag;
    check(`來源 ${flag} 標記保留缺值`, !errorOf(() => verifyMoneySupply(altered, missingSeries, meta)));
  }
  const emptyRows = rows.map((row) => ({ ...row, figure: null })), emptySeries = series.map((point) => ({ ...point, value: null }));
  check("整條數列全部缺值 hard fail", hardFailure(() => verifyMoneySupply(emptyRows, emptySeries, meta)));
  for (const [name, mutate] of [
    ["港元切片冒充所有貨幣", (r) => { r[0].CURRENCY = "1"; }],
    ["M2 冒充 M1", (r) => { r[0].sv = "M2"; }],
    ["年度冒充季末", (r) => { r[0].freq = "Y"; }],
    ["月份非季末", (r) => { r[0].period = "199705"; }],
    ["起點前的定義中斷資料", (r) => { r[0].period = "199703"; }],
    ["百分率冒充金額", (r) => { r[0].svDesc = "按年變動百分率"; }],
    ["未知標記", (r) => { r[0].sd_value = "@"; }],
    ["缺少狀態欄", (r) => { delete r[0].sd_value; }],
    ["M1 大過 M2", (r) => { r[0].figure = 51; }],
    ["M2 大過 M3", (r) => { r[1].figure = 61; }],
    ["缺 M2 時 M1 仍不可大過 M3", (r) => { r[0].figure = 61; r[1].figure = null; }],
    ["來源少一變項", (r) => r.pop()],
    ["來源重複季度變項", (r) => r.push({ ...r[0] })],
    ["來源起點消失", (r) => r.splice(0, 3)],
    ["中間季度消失", (r) => r.slice(3).forEach((row) => { row.period = "199712"; })],
  ]) {
    const altered = structuredClone(rows); mutate(altered);
    check(`來源突變：${name} hard fail`, hardFailure(() => verifyMoneySupply(altered, series, meta)));
  }
  for (const figure of [true, false, [], {}, " ", undefined, "1e2", "-1", -1, 1.1, Infinity, NaN, 9007199254740991]) {
    const altered = structuredClone(rows); altered[0].figure = figure;
    check(`非整數或超出精確範圍 ${String(figure)} 唔當有效百萬元`, hardFailure(() => verifyMoneySupply(altered, series, meta)));
  }
  for (const [name, mutate] of [
    ["錯倍率", (s) => { s[0].value *= 1000; }],
    ["單一元誤差", (s) => { s[0].value += 1; }],
    ["M1 M2 值對調", (s) => { [s[0].value, s[1].value] = [s[1].value, s[0].value]; }],
    ["M1 M2 名對調", (s) => { [s[0].category, s[1].category] = [s[1].category, s[0].category]; }],
    ["少一季", (s) => s.splice(3, 3)],
    ["少一類", (s) => s.pop()],
    ["加入相加總額", (s) => s.push({ period: "1997-Q2", category: "總額", value: 120_000_000 })],
    ["季度重複", (s) => { s[0] = { ...s[3] }; }],
    ["月份冒充季度", (s) => { s[0].period = "1997-06"; }],
    ["錯分類", (s) => { s[0].category = "港元 M1"; }],
    ["字串冒充原數", (s) => { s[0].value = String(s[0].value); }],
  ]) {
    const altered = structuredClone(series); mutate(altered);
    check(`最終數列突變：${name} hard fail`, hardFailure(() => verifyMoneySupply(rows, altered, meta)));
  }
  for (const [name, mutate] of [
    ["表題變成港元及外幣分項", (m) => { m.labels.tb_title = "貨幣供應（港元及外幣）"; }],
    ["原生機構消失", (m) => { m.labels.tb_src = "其他資料"; }],
    ["期末口徑消失", (m) => { m.labels.tb_fn = "季度平均"; }],
    ["M1 定義名稱改變", (m) => { m.labels.sv_list.M1.def_stat_desc = "貨幣供應量M1(經季節性調整)"; }],
    ["倍率改成十億", (m) => { m.labels.sv_list.M1.sp_list.Raw_M_hkd_d.def_unit_mult = "9"; }],
    ["單位改成美元", (m) => { m.labels.sv_list.M2.sp_list.Raw_M_hkd_d.def_unit = "US$"; }],
    ["精度改變", (m) => { m.labels.sv_list.M3.sp_list.Raw_M_hkd_d.def_decimals = "1"; }],
    ["來源新增維度", (m) => { m.comp.table_component_ccg_list.CURRENCY = {}; m.labels.cv_list.CURRENCY = { is_time_series: "0" }; }],
    ["來源多一個變項", (m) => { m.labels.sv_list.M4 = {}; }],
  ]) {
    const altered = structuredClone(meta); mutate(altered);
    check(`元資料突變：${name} hard fail`, hardFailure(() => verifyMoneySupply(rows, series, altered)));
  }
  for (const [value, phrase] of [[125, "25%"], [75, "25%"], [100, "0%"], [200, "100%"]]) {
    const values = [{ period: "2025-Q1", category: "M3", value: 100 }, { period: "2026-Q1", category: "M3", value }];
    check(`M3 去年同季 100 → ${value} 對比自證`, moneySupplyAnchors(values)[0]?.text_zh.includes(phrase));
  }
  check("M3 最新季缺數唔借舊季", moneySupplyAnchors([{ period: "2025-Q1", category: "M3", value: 100 }, { period: "2026-Q1", category: "M3", value: null }]).length === 0);
  check("缺去年同季唔借去年其他季", moneySupplyAnchors([{ period: "2025-Q2", category: "M3", value: 100 }, { period: "2026-Q1", category: "M3", value: 125 }]).length === 0);
  check("M1 唔可以當 M3 錨點", moneySupplyAnchors([{ period: "2025-Q1", category: "M1", value: 100 }, { period: "2026-Q1", category: "M1", value: 125 }]).length === 0);

  const previousMode = process.env.HKDM_FIXTURES;
  process.env.HKDM_FIXTURES = "replay";
  const original = new URL("../src/data/_lib/money.js", import.meta.url), source = await readFile(original, "utf8");
  const temp = await mkdtemp(join(tmpdir(), "hkdm-money-data-"));
  try {
    resetTableMetaCache();
    const doc = await loadMoneyIndicator("money_supply");
    check("真正 money_supply 冇相加 totals", doc.totals === undefined);
    check("真正 money_supply 季末、港元、M1 M2 M3", doc.frequency === "quarterly" && doc.unit_en === "HKD" && doc.category_order.join() === "M1,M2,M3");
    check("真正 money_supply 清楚標明 HKMA 原始來源及統計處轉載", doc.source_zh.includes("香港金融管理局") && doc.source_zh.includes("政府統計處") && doc.source_url.endsWith("id=340-45011"));
    check("真正 money_supply 註明所有貨幣、非季調、存量", doc.basis_zh.includes("所有貨幣") && doc.basis_zh.includes("未經季節性調整") && doc.basis_zh.includes("季末存量"));
    const probe = await queryCenstatd({ id: "340-45011", sv: { M1: ["Raw_M_hkd_d"], M2: ["Raw_M_hkd_d"], M3: ["Raw_M_hkd_d"] }, cv: {}, period: { start: "199704" } });
    check("真正來源及最終結果逐項一致", !errorOf(() => verifyMoneySupply(probe.dataSet.filter((row) => row.freq === "Q"), doc.series, probe.meta)));
    let sequence = 0;
    for (const [name, before, after] of [
      ["換算倍率改一個單位", "return value === null ? null : value * 1_000_000;", "return value === null ? null : value * 1_000_001;"],
      ["標籤統一冒充 M3", "category: row.sv", 'category: "M3"'],
      ["漏最後一行", "const series = rows.map", "const series = rows.slice(0, -1).map"],
      ["年度冒充季度", 'pickFrequency(dataSet, "Q")', 'pickFrequency(dataSet, "Y")'],
    ]) {
      if (source.split(before).length !== 2) throw new Error(`貨幣供應突變必須精確命中一次：${before}`);
      const altered = source.replace(before, after).replace(/(\bfrom\s+["'])(\.[^"']+)(["'])/g,
        (_, prefix, specifier, suffix) => `${prefix}${new URL(specifier, original).href}${suffix}`);
      const path = join(temp, `variant-${sequence++}.mjs`); await writeFile(path, altered);
      const variant = await import(pathToFileURL(path).href);
      let error = null;
      try { await variant.loadMoneyIndicator("money_supply"); } catch (caught) { error = caught; }
      check(`真正 loader 突變：${name} hard fail`, error instanceof Error && !(error instanceof UpstreamError));
    }
  } finally {
    if (previousMode === undefined) delete process.env.HKDM_FIXTURES; else process.env.HKDM_FIXTURES = previousMode;
    resetTableMetaCache();
    await rm(temp, { recursive: true, force: true });
  }
}
