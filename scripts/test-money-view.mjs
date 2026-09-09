import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import * as view from "../src/components/money-view.js";

export async function testMoneyView(check) {
  console.log("\n[貨幣畫面] 港元換算、同季度及分類自證");
  const doc = {
    indicator_id: "money_supply", unit_zh: "港元", frequency: "quarterly",
    basis_zh: "期末、所有貨幣，按港元表示", category_order: ["M1", "M2", "M3"],
    chart: {type: "line", y_zero: true},
    series: [
      {period: "2025-Q1", category: "M1", value: 1e12},
      {period: "2025-Q1", category: "M2", value: 2e12},
      {period: "2025-Q1", category: "M3", value: 3e12},
      {period: "2025-Q2", category: "M1", value: 4e12},
      {period: "2025-Q2", category: "M2", value: null},
      {period: "2025-Q2", category: "M3", value: 6e12},
    ],
  };
  const clone = (edit) => {const out = structuredClone(doc); edit(out); return out;};
  const throws = (fn) => {try {fn(); return false;} catch {return true;}};
  const bothThrow = (module, data) => throws(() => module.moneyChartView(data)) && throws(() => module.moneyQuarterRows(data, "2025-Q1")) && throws(() => module.moneyQuarterAnchors(data, "2025-Q1"));
  const knownAnswers = [[0, 0], [1e12, 1], [25e12, 25], [5e11, 0.5]];
  const conversionCorrect = (module) => knownAnswers.every(([raw, expected]) => {
    const data = clone((d) => d.series[0].value = raw);
    return module.moneyChartView(data).series[0].value === expected && module.moneyQuarterRows(data, "2025-Q1")[0].display_value === expected;
  });
  for (const [raw, expected] of knownAnswers) {
    const data = clone((d) => d.series[0].value = raw);
    check(`換算已知答案：${raw} 港元 = ${expected} 萬億港元`, view.moneyChartView(data).series[0].value === expected && view.moneyQuarterRows(data, "2025-Q1")[0].display_value === expected);
  }
  const rowsCorrect = (module) => JSON.stringify(module.moneyQuarterRows(doc, "2025-Q1")) === JSON.stringify([
    {category: "M1", period: "2025-Q1", value: 1e12, display_value: 1},
    {category: "M2", period: "2025-Q1", value: 2e12, display_value: 2},
    {category: "M3", period: "2025-Q1", value: 3e12, display_value: 3},
  ]);
  const selectedCorrect = (module) => {
    const output = module.moneyChartView(doc, "M2");
    return output.category_order.join() === "M2" && output.series.length === 2 && output.series.every((row) => row.category === "M2") && output.series[0].value === 2;
  };
  const nullPreserved = (module) => module.moneyChartView(doc).series[4].value === null && module.moneyQuarterRows(doc, "2025-Q2")[1].value === null && module.moneyQuarterRows(doc, "2025-Q2")[1].display_value === null;
  const metadataCorrect = (module) => {const output = module.moneyChartView(doc); return output.unit_zh === "萬億港元" && output.basis_zh.includes(doc.basis_zh) && output.basis_zh.includes("÷ 1,000,000,000,000");};
  const sourceCorrect = (module) => bothThrow(module, {...doc, indicator_id: "market_capitalisation"});
  const unitsCorrect = (module) => bothThrow(module, {...doc, unit_zh: "十億港元"});
  const frequencyCorrect = (module) => bothThrow(module, {...doc, frequency: "monthly"});
  const totalsForbidden = (module) => bothThrow(module, {...doc, totals: [{period: "2025-Q1", value: 6e12}]});
  const categoriesCorrect = (module) => bothThrow(module, clone((d) => d.series[0].category = "總額"));
  const periodFormatCorrect = (module) => bothThrow(module, clone((d) => d.series.slice(0, 3).forEach((row) => row.period = "2025-Q5")));
  const duplicatesFail = (module) => bothThrow(module, clone((d) => d.series.push({...d.series[0]})));
  const missingFails = (module) => bothThrow(module, clone((d) => d.series.splice(1, 1)));
  const invalidSelectionFails = (module) => throws(() => module.moneyChartView(doc, "M4"));
  const unknownQuarterFails = (module) => throws(() => module.moneyQuarterRows(doc, "2024-Q4")) && throws(() => module.moneyQuarterAnchors(doc, "2024-Q4"));
  const invalidNumbersFail = (module) => [-1, NaN, Infinity, -Infinity, undefined, "100", true, {}, Number.MAX_SAFE_INTEGER + 1].every((value) => bothThrow(module, clone((d) => d.series[0].value = value)));
  check("同一季度 M1／M2／M3 逐項對位並保留原始港元", rowsCorrect(view));
  check("來源陣列倒序，季度表仍按 M1、M2、M3 對位", JSON.stringify(view.moneyQuarterRows(clone((d) => d.series.reverse()), "2025-Q1")) === JSON.stringify(view.moneyQuarterRows(doc, "2025-Q1")));
  check("全部圖表三條線，冇相加總額", view.moneyChartView(doc).category_order.join() === "M1,M2,M3" && view.moneyChartView(doc).series.length === 6 && !("totals" in view.moneyChartView(doc)));
  check("單選分類只畫所選數列", selectedCorrect(view));
  check("所選季度 null 保留缺數，唔借舊數或補零", nullPreserved(view));
  check("圖表標清萬億港元、原口徑及換算式", metadataCorrect(view));
  check("錯指標硬失敗", sourceCorrect(view));
  check("錯原始貨幣單位硬失敗", unitsCorrect(view));
  check("錯頻率硬失敗", frequencyCorrect(view));
  check("M1／M2／M3 相加總額硬失敗", totalsForbidden(view));
  check("不明分類硬失敗", categoriesCorrect(view));
  check("不合法季度硬失敗", periodFormatCorrect(view));
  check("重複分類硬失敗", duplicatesFail(view));
  check("缺一分類硬失敗", missingFails(view));
  check("未知圖表分類硬失敗", invalidSelectionFails(view));
  check("未知季度硬失敗", unknownQuarterFails(view));
  check("負值、非有限值、錯類型及不安全數值硬失敗", invalidNumbersFail(view));
  check("空資料及非陣列硬失敗", [null, undefined, {...doc, series: []}, {...doc, series: {}}, {...doc, series: [null]}].every((data) => bothThrow(view, data)));
  const freeze = (obj) => {for (const value of Object.values(obj)) if (value && typeof value === "object") freeze(value); return Object.freeze(obj);};
  const immutable = (module) => {
    const frozen = freeze(structuredClone(doc)), before = JSON.stringify(frozen);
    module.moneyChartView(frozen); module.moneyQuarterRows(frozen, "2025-Q2"); module.moneyQuarterAnchors(frozen, "2025-Q2");
    return JSON.stringify(frozen) === before;
  };
  check("圖表、季度表同錨點都唔改原始物件", immutable(view));

  const comparison = clone((data) => data.series.push(
    {period: "2026-Q1", category: "M1", value: 1.5e12},
    {period: "2026-Q1", category: "M2", value: 1.5e12},
    {period: "2026-Q1", category: "M3", value: 3e12},
    {period: "2026-Q2", category: "M1", value: 8e12},
    {period: "2026-Q2", category: "M2", value: 9e12},
    {period: "2026-Q2", category: "M3", value: 12e12},
  ));
  const comparisonClone = (edit) => {const out = structuredClone(comparison); edit(out); return out;};
  const anchorAnswers = [
    [1e12, 1.5e12, "M1 比去年同季增加 0.5 萬億港元（+50%）"],
    [2e12, 1.5e12, "M1 比去年同季減少 0.5 萬億港元（−25%）"],
    [3e12, 3e12, "M1 比去年同季相差 0 萬億港元（0%）"],
    [2e12, 2.25e12, "M1 比去年同季增加 0.25 萬億港元（+12.5%）"],
  ];
  const anchorData = (base, current) => comparisonClone((data) => {
    data.series[0].value = base;
    data.series.find((row) => row.period === "2026-Q1" && row.category === "M1").value = current;
  });
  const anchorCalculationCorrect = (module) => anchorAnswers.every(([base, current, expected]) => module.moneyQuarterAnchors(anchorData(base, current), "2026-Q1")[0].text_zh === expected);
  for (const [base, current, expected] of anchorAnswers) check(`按年錨點已知答案：${base} → ${current}`, view.moneyQuarterAnchors(anchorData(base, current), "2026-Q1")[0].text_zh === expected);
  const selectedAnchorCorrect = (module) => {
    const result = module.moneyQuarterAnchors(comparison, "2026-Q1");
    return result.length === 3 && result.map((anchor) => anchor.id).join() === "money-m1-year-on-year,money-m2-year-on-year,money-m3-year-on-year" && result.map((anchor) => anchor.text_zh).join("|") === "M1 比去年同季增加 0.5 萬億港元（+50%）|M2 比去年同季減少 0.5 萬億港元（−25%）|M3 比去年同季相差 0 萬億港元（0%）" && result.every((anchor) => anchor.basis_zh.includes("2025 年第 1 季 → 2026 年第 1 季"));
  };
  const missingBaseCorrect = (module) => module.moneyQuarterAnchors(comparison, "2025-Q1").every((anchor) => anchor.text_zh.includes("未能比較去年同季（缺少去年同季）") && anchor.basis_zh.includes("2024 年第 1 季 → 2025 年第 1 季"));
  const missingCurrentCorrect = (module) => module.moneyQuarterAnchors(anchorData(1e12, null), "2026-Q1")[0].text_zh === "M1：未能比較去年同季（所選季度缺數）";
  const nullBaseCorrect = (module) => module.moneyQuarterAnchors(comparison, "2026-Q2")[1].text_zh === "M2：未能比較去年同季（去年同季缺數）";
  const zeroBaseCorrect = (module) => module.moneyQuarterAnchors(anchorData(0, 1e12), "2026-Q1")[0].text_zh === "M1：未能比較去年同季（去年同季為零，百分比無法計算）";
  const anchorOverflowCorrect = (module) => throws(() => module.moneyQuarterAnchors(anchorData(Number.MIN_VALUE, 1e12), "2026-Q1"));
  check("三分類錨點逐個對所選季度同去年同季，唔借最新季度", selectedAnchorCorrect(view));
  check("冇去年同季，明示無法比較", missingBaseCorrect(view));
  check("所選季 null，唔借舊數或當零", missingCurrentCorrect(view));
  check("去年同季 null，明示缺數", nullBaseCorrect(view));
  check("基期零，唔計無限大升幅", zeroBaseCorrect(view));
  check("按年錨點保留兩期原始港元同驗算式", view.moneyQuarterAnchors(comparison, "2026-Q1")[0].basis_zh.includes("（1500000000000 − 1000000000000）港元 ÷ 1,000,000,000,000") && view.moneyQuarterAnchors(comparison, "2026-Q1")[0].basis_zh.includes("÷ 1000000000000 × 100%"));
  check("派生百分比超出有限範圍硬失敗", anchorOverflowCorrect(view));

  const source = await readFile(new URL("../src/components/money-view.js", import.meta.url), "utf8");
  const dir = await mkdtemp(join(tmpdir(), "hkdm-money-view-")); let seq = 0;
  async function mutate(from, to) {
    if (source.split(from).length !== 2) throw new Error(`源碼突變必須精確命中一次：${from}`);
    const file = join(dir, `mutation-${seq++}.mjs`);
    // 臨時副本仍用同一份正式格式器；import 出錯要令整套測試失敗，唔當捕獲突變。
    const original = new URL("../src/components/money-view.js", import.meta.url);
    const mutated = source.replace(from, to).replace(/(\bfrom\s+["'])(\.[^"']+)(["'])/g, (_, prefix, specifier, suffix) => `${prefix}${new URL(specifier, original).href}${suffix}`);
    await writeFile(file, mutated); return import(pathToFileURL(file).href);
  }
  const detects = (oracle, module) => {try {return !oracle(module);} catch {return true;}};
  try {
    for (const [label, from, to, oracle] of [
      ["萬億誤作千億", "const HKD_PER_TRILLION = 1e12;", "const HKD_PER_TRILLION = 1e11;", conversionCorrect],
      ["缺數補零", "value === null ? null", "value === null ? 0", nullPreserved],
      ["季度表 M2 誤取 M3", "point.category === category", 'point.category === (category === "M2" ? "M3" : category)', rowsCorrect],
      ["季度表借用其他季度", "point.period === period", 'point.period === "2025-Q1"', nullPreserved],
      ["單選誤畫所有分類", "categories.includes(row.category)", "true", selectedCorrect],
      ["換算後仍標原始港元", 'unit_zh: "萬億港元"', 'unit_zh: "港元"', metadataCorrect],
      ["接受錯指標", 'indicator.indicator_id !== "money_supply"', "false", sourceCorrect],
      ["接受錯單位", 'indicator.unit_zh !== "港元"', "false", unitsCorrect],
      ["接受錯頻率", 'indicator.frequency !== "quarterly"', "false", frequencyCorrect],
      ["接受相加總額", '"totals" in indicator', "false", totalsForbidden],
      ["接受未知分類", "!MONEY_CATEGORIES.includes(row.category)", "false", categoriesCorrect],
      ["接受無效季度", "!/^\\d{4}-Q[1-4]$/.test(row.period)", "false", periodFormatCorrect],
      ["接受重複分類", "categories.has(row.category)", "false", duplicatesFail],
      ["接受缺分類", "categories.size !== MONEY_CATEGORIES.length", "false", missingFails],
      ["接受未知圖表分類", 'category !== "全部" && !MONEY_CATEGORIES.includes(category)', "false", invalidSelectionFails],
      ["未知季度借用第一季", 'if (!quarters.has(period)) throw new Error("貨幣供應量冇呢個季度");', 'if (!quarters.has(period)) period = indicator.series[0].period;', unknownQuarterFails],
      ["接受不安全大數", "row.value > Number.MAX_SAFE_INTEGER", "false", invalidNumbersFail],
      ["接受負數", "row.value < 0", "false", invalidNumbersFail],
      ["接受錯數值類型", "!Number.isFinite(row.value)", "false", invalidNumbersFail],
      ["直接換算原始資料", '({...row, value: displayValue(row.value)})', 'Object.assign(row, {value: displayValue(row.value)})', immutable],
      ["按年差額計反方向", "selected.value - previous.value", "previous.value - selected.value", anchorCalculationCorrect],
      ["按年百分比誤用今期作分母", "difference / previous.value * 100", "difference / selected.value * 100", anchorCalculationCorrect],
      ["按年差額錯用千億", "difference / HKD_PER_TRILLION", "difference / 1e11", anchorCalculationCorrect],
      ["錨點借最新季度", "const selectedRows = moneyQuarterRows(indicator, period);", "const selectedRows = moneyQuarterRows(indicator, indicator.series.at(-1).period);", selectedAnchorCorrect],
      ["錨點基期借同年", "Number(period.slice(0, 4)) - 1", "Number(period.slice(0, 4))", selectedAnchorCorrect],
      ["錨點 M2 基期誤用 M3", "entry.category === selected.category", 'entry.category === (selected.category === "M2" ? "M3" : selected.category)', selectedAnchorCorrect],
      ["缺基期誤借其他年", "entry.period === previousPeriod", "true", missingBaseCorrect],
      ["所選缺值當零", "selected.value === null", "false", missingCurrentCorrect],
      ["基期缺值照計", "previous.value === null", "false", nullBaseCorrect],
      ["基期零照計", "previous.value === 0", "false", zeroBaseCorrect],
      ["派生百分比溢出照顯示", "!Number.isFinite(percent)", "false", anchorOverflowCorrect],
    ]) check(`源碼突變：${label}會被捉到`, detects(oracle, await mutate(from, to)));
  } finally {await rm(dir, {recursive: true, force: true});}
}
