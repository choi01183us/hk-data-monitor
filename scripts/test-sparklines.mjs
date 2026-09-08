// 小圖係新轉換工具：先對四個已知答案，再用缺值／來源／口徑突變自證。
// 所有源碼突變都喺臨時副本執行；唔改快照、manual 或上游錄影。
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { cardTrend } from "../src/components/sparkline.js";

export async function testSparklines(check) {
  console.log("\n[首頁趨勢小圖] 已知答案、同口徑來源及缺值突變");
  const dimensions = { width: 108, height: 28, padding: 4 };
  const sample = (periods, values, frequency = "annual") => ({
    indicator_id: "test_indicator",
    source_zh: "測試來源", source_url: "https://example.test/source",
    unit_zh: "港元", updated_at: "2026-09-08", data_version: "2026.09.1",
    frequency, chart: { y_zero: false },
    series: periods.map((period, i) => ({ period, value: values[i] })),
    latest: { period: periods.at(-1), value: values.at(-1) },
  });
  const almost = (a, b) => Math.abs(a - b) < 1e-9;
  const annual = sample(["2021", "2022", "2023"], [10, 20, 30]);
  const simple = cardTrend(annual, dimensions);
  const flat = simple.segments.flat();
  check("已知答案：10／20／30 映射至 y=24／14／4", flat.map((p) => p.y).join() === "24,14,4");
  const monthly = sample(["2025-01", "2025-02", "2025-03"], [10, 20, 30], "monthly");
  const monthlyMiddleIsCorrect = (transform) => almost(transform(monthly, dimensions).segments[0][1].x, 4 + 100 * 31 / 59);
  check("已知答案：1 至 3 月共 59 日，2 月位置係 31/59", monthlyMiddleIsCorrect(cardTrend));
  const quarterly = cardTrend(sample(["2025-Q1", "2025-Q2", "2025-Q3"], [10, 20, 30], "quarterly"), dimensions);
  check("已知答案：Q1 至 Q3 共 181 日，Q2 位置係 90/181", almost(quarterly.segments[0][1].x, 4 + 100 * 90 / 181));
  const fiscal = cardTrend(sample(["2000-01", "2001-02"], [10, 20]), dimensions);
  check("已知答案：2000-01 財年始於 2000 年 4 月 1 日，下一年距離 365 日",
    fiscal.fiscal && fiscal.first.time === Date.UTC(2000, 3, 1) && fiscal.last.time - fiscal.first.time === 365 * 86400000);

  check("年度等日距嘅中間點喺 x=54", flat[1].x === 54);
  check("2000-01 月度仍然係 1 月", cardTrend(sample(["2000-01", "2000-02"], [10, 20], "monthly")).first.time === Date.UTC(2000, 0, 1));
  const constant = cardTrend(sample(["2021", "2022"], [7, 7]), dimensions);
  check("相同值畫水平線，唔除零", constant.segments[0].every((p) => p.y === 14));
  check("保留原圖零起點設定", cardTrend({ ...annual, chart: { y_zero: true } }, dimensions).segments[0][1].y > 10);
  check("負值仍按原值映射", cardTrend(sample(["2021", "2022", "2023"], [-10, 0, 10]), dimensions).segments[0].map((p) => p.y).join() === "24,14,4");
  check("只有一點畫喺中間，冇捏造趨勢", cardTrend(sample(["2025"], [7]), dimensions).segments[0][0].x === 54);
  const nullGap = sample(["2021", "2022", "2023"], [10, null, 30]);
  const nullGapIsCorrect = (transform) => transform(nullGap, dimensions).segments.map((s) => s.length).join() === "1,1";
  check("中間 null 斷線，唔接過缺值", nullGapIsCorrect(cardTrend));
  const absentYear = sample(["2021", "2023"], [10, 30]);
  const absentYearIsCorrect = (transform) => transform(absentYear, dimensions).segments.length === 2;
  check("缺一年原始行亦斷線，唔扮連續", absentYearIsCorrect(cardTrend));
  check("缺半年資料斷線", cardTrend(sample(["2024-06", "2025-06"], [10, 30], "biannual")).segments.length === 2);
  check("全部 null 冇小圖或假大字", cardTrend(sample(["2021", "2022"], [null, null])).shown === null);
  const before = JSON.stringify(annual);
  cardTrend(annual);
  check("轉換唔改原始數列", JSON.stringify(annual) === before);

  const categories = {
    ...sample(["2021", "2022"], [10, 20]),
    latest_by_category: [{ category: "教育", period: "2022", value: 20 }, { category: "其他", period: "2022", value: 200 }],
    series: [
      { period: "2021", category: "教育", value: 10 }, { period: "2021", category: "其他", value: 100 },
      { period: "2022", category: "教育", value: 20 }, { period: "2022", category: "其他", value: 200 },
    ],
  };
  const correctCategory = (transform) => {
    const result = transform(categories);
    return result.label === "教育" && result.shown.value === 20 && result.segments.flat().map((p) => p.value).join() === "10,20";
  };
  check("多分類只畫大字所指教育，唔串埋其他分類", correctCategory(cardTrend));
  const withTotals = { ...categories, totals: [{ period: "2021", value: 110 }, { period: "2022", value: 220 }] };
  const correctTotal = (transform) => {
    const result = transform(withTotals);
    return result.label === "總額" && result.shown.value === 220 && result.segments.flat().map((p) => p.value).join() === "110,220";
  };
  check("原文件有總額：大字同小圖都只用原 totals", correctTotal(cardTrend));
  const excludesFakeSum = cardTrend({ ...categories, totals: undefined });
  check("原文件冇總額就唔相加分類", excludesFakeSum.shown.value === 20 && excludesFakeSum.label === "教育");
  const throws = (fn) => { try { fn(); return false; } catch { return true; } };
  check("跨政府／公共兩個指標集合拒絕入小圖", throws(() => cardTrend([
    { ...withTotals, indicator_id: "govt_expenditure" }, { ...withTotals, indicator_id: "public_expenditure_policy_groups" },
  ])));
  check("缺來源連結拒絕畫小圖", throws(() => cardTrend({ ...annual, source_url: "" })));
  check("缺單位拒絕畫小圖", throws(() => cardTrend({ ...annual, unit_zh: "" })));
  check("大字同原始最新值不符會嘈", throws(() => cardTrend({ ...annual, latest: { period: "2023", value: 999 } })));
  check("同分類同一期重複會嘈", throws(() => cardTrend({ ...annual, series: [...annual.series, annual.series[0]] })));
  check("總額混入分類行會嘈", throws(() => cardTrend({ ...withTotals, totals: categories.series })));
  check("月度第 13 月會嘈", throws(() => cardTrend(sample(["2025-13"], [1], "monthly"))));
  check("財年尾數唔連續會嘈", throws(() => cardTrend(sample(["2000-03"], [1]))));
  check("Infinity 唔會當 null 或零", throws(() => cardTrend({ ...annual, series: annual.series.map((p, i) => i === 1 ? { ...p, value: Infinity } : p) })));

  const temp = await mkdtemp(join(tmpdir(), "hkdm-sparkline-"));
  const source = await readFile(new URL("../src/components/sparkline.js", import.meta.url), "utf8");
  let sequence = 0;
  async function mutate(before, after) {
    if (source.split(before).length !== 2) throw new Error(`小圖突變必須精確命中一次：${before}`);
    const path = join(temp, `mutation-${sequence++}.mjs`);
    await writeFile(path, source.replace(before, after));
    return (await import(pathToFileURL(path).href)).cardTrend;
  }
  const detects = (oracle, transform) => { try { return !oracle(transform); } catch { return true; } };
  try {
    const noSource = await mutate('"source_zh", "source_url", "unit_zh"', '"source_zh", "unit_zh"');
    check("源碼突變：漏咗來源閘，缺來源測例確實捉到", !throws(() => noSource({ ...annual, source_url: "" })));
    const equalSpacing = await mutate("(point.time - first.time) / span", "(point.ordinal - first.ordinal) / (last.ordinal - first.ordinal)");
    check("源碼突變：月份憑空均分位置會被已知答案捉到", detects(monthlyMiddleIsCorrect, equalSpacing));
    const bridgeNull = await mutate("if (segment.length) segments.push(segment);\n      segment = [];", "if (point.value !== null) { if (segment.length) segments.push(segment); segment = []; }");
    check("源碼突變：跨 null 連線會被缺值測例捉到", detects(nullGapIsCorrect, bridgeNull));
    const bridgeMissing = await mutate("(previous && point.ordinal - previous.ordinal !== 1)", "false");
    check("源碼突變：跨缺年連線會被測例捉到", detects(absentYearIsCorrect, bridgeMissing));
    const mixCategories = await mutate("point.category === shown.category", "true");
    check("源碼突變：混入其他分類會被同口徑測例捉到", detects(correctCategory, mixCategories));
    const mixTotals = await mutate("? indicator.totals\n    :", "? indicator.series\n    :");
    check("源碼突變：總額錯讀分類數列會被測例捉到", detects(correctTotal, mixTotals));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }

  const snapshots = new URL("../src/data/_snapshots/", import.meta.url);
  for (const file of (await readdir(snapshots)).filter((name) => name.endsWith(".json"))) {
    const indicator = JSON.parse(await readFile(new URL(file, snapshots), "utf8"));
    const result = cardTrend(indicator);
    check(`真實快照 ${indicator.indicator_id} 同口徑小圖可轉換`, indicator.manual_status === "todo"
      ? !result.shown && !result.segments.length
      : result.shown && result.segments.flat().every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
}
