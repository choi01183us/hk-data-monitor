import { publicExpenditureViews } from "../src/components/public-expenditure-views.js";

export function testPublicExpenditureViews(check) {
  console.log("\n[公共開支年度比較] 已知答案自證及缺數突變");
  const sample = {
    indicator_id: "public_expenditure_policy_groups",
    category_order: ["增加", "減少", "不變"],
    period_notes: { "2024-25": "實際", "2025-26": "修訂預算", "2026-27": "預算" },
    chart: { type: "bar" },
    series: [
      ...[10, 30, 20].map((value, i) => ({ period: "2024-25", category: ["增加", "減少", "不變"][i], value })),
      ...[20, 20, 20].map((value, i) => ({ period: "2025-26", category: ["增加", "減少", "不變"][i], value })),
      ...[35, 15, 20].map((value, i) => ({ period: "2026-27", category: ["增加", "減少", "不變"][i], value })),
    ],
  };
  const before = JSON.stringify(sample);
  const views = publicExpenditureViews(sample);
  check("35 − 20 = 15", views[0].indicator.series[0].value === 15);
  check("15 − 20 = −5", views[0].indicator.series[1].value === -5);
  check("20 − 20 = 0", views[0].indicator.series[2].value === 0);
  check("前一組年度 20 − 10 = 10", views[1].indicator.series[0].value === 10);
  check("三年提供兩個增減比較及三個金額視圖", views.length === 5);
  check("引用保留比較嘅兩個原始年度", views[0].comparison?.from === "2025-26" && views[0].comparison?.to === "2026-27");
  check("年度金額視圖唔帶增減引用", views.slice(2).every((v) => !v.comparison));
  check("預算／修訂預算標籤保留", views[0].label.includes("2026-27 預算") && views[0].label.includes("2025-26 修訂預算"));
  check("計算唔會改原始數據", JSON.stringify(sample) === before);
  const missing = structuredClone(sample);
  missing.series[4].value = null;
  check("中間年度少一格 -> 唔用零填補、唔跨年夾比較", publicExpenditureViews(missing).every((v) => !v.label.includes("增減")));
  const empty = structuredClone(sample);
  empty.series.forEach((p) => { p.value = null; });
  check("null 骨架冇圖表視圖", publicExpenditureViews(empty).length === 0);
  let rejected = false;
  try { publicExpenditureViews({ ...sample, indicator_id: "govt_expenditure" }); } catch { rejected = true; }
  check("錯用政府口徑 -> 拒絕", rejected);
}
