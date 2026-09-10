// 公屋人手資料：固定小測例，不把會更新的季度數字複製成第二份資料庫。
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyHousingManual } from "../src/data/_lib/housing-manual.js";
import { loadManualIndicator } from "../src/data/_lib/manual.js";
import { UpstreamError } from "../src/data/_lib/http.js";
const failure = (fn) => { try { fn(); return null; } catch (error) { return error; } };
const rejects = (fn) => { const error = failure(fn); return error instanceof Error && !(error instanceof UpstreamError); };
function example() {
  const categories = ["綜合輪候時間(含簡約公屋)", "平均輪候時間(只計傳統公屋)", "長者一人申請者平均輪候時間"];
  return {
    indicator_id: "phr_waiting_time", acquisition: "manual", frequency: "quarterly", source_value_multiplier: 1,
    unit_zh: "年", unit_en: "years", value_digits: 1, updated_at: "2026-06-30", category_order: categories,
    series: [3.2, 2.1, 1].map((value, index) => ({ period: "2026-Q2", category: categories[index], value })),
  };
}
const altered = (change) => { const fields = example(); change(fields); return fields; };
export async function testHousingManual(check) {
  console.log("\n[公屋人手資料] 年單位、季度與三個重疊群組 — 自證與突變");
  const good = [example(), altered((f) => { f.series.forEach((p) => { p.value = 0; }); }), altered((f) => { f.series[0].value = null; }), altered((f) => { f.series.forEach((p) => { p.value = null; }); })];
  for (const [index, fields] of good.entries()) check(`已知答案：${["CWT 3.2大過AWT 2.1仍合法，唔設大小假不變式", "原文零值合法", "局部null不補零", "未填骨架合法"][index]}`, !failure(() => verifyHousingManual(fields)));
  for (const [period, date] of [["2026-Q1", "2026-03-31"], ["2026-Q2", "2026-06-30"], ["2026-Q3", "2026-09-30"], ["2026-Q4", "2026-12-31"]]) {
    const fields = altered((f) => { f.updated_at = date; f.series.forEach((p) => { p.period = period; }); }); good.push(fields);
    check(`已知季度末：${period} → ${date}`, !failure(() => verifyHousingManual(fields)));
  }
  const two = altered((f) => { f.series.push(...f.series.map((p) => ({ ...p, period: "2026-Q3" }))); f.updated_at = "2026-09-30"; }); good.push(two);
  check("另抄一期不必增添硬寫年份或資料值", !failure(() => verifyHousingManual(two)));
  const bad = [
    ["自動来源冒充人手", (f) => { f.acquisition = "api"; }],
    ["月份冒充季度", (f) => { f.frequency = "monthly"; }],
    ["指標錯名", (f) => { f.indicator_id = "housing_wait"; }],
    ["倍率改12", (f) => { f.source_value_multiplier = 12; }],
    ["倍率字串", (f) => { f.source_value_multiplier = "1"; }],
    ["中文單位月份", (f) => { f.unit_zh = "月"; }],
    ["英文單位月份", (f) => { f.unit_en = "months"; }],
    ["原值顯示整數", (f) => { f.value_digits = 0; }],
    ["第三類冒充非長者", (f) => { f.category_order[2] = "非長者一人申請者"; f.series[2].category = "非長者一人申請者"; }],
    ["兩套類別一齊對調", (f) => { f.category_order.reverse(); f.series.reverse(); }],
    ["資料行對調", (f) => { f.series.reverse(); }],
    ["漏第三類", (f) => { f.series.pop(); }],
    ["重複類別", (f) => { f.series[2].category = f.series[0].category; }],
    ["空數列", (f) => { f.series = []; }],
    ["季度末錯用抄數日", (f) => { f.updated_at = "2026-09-10"; }],
    ...["2026-Q0", "2026-Q5", "2026-06", "2026-06-30"].map((period) => [`錯季度${period}`, (f) => { f.series.forEach((p) => { p.period = period; }); }]),
    ...[-1, 4.81, "4.8", "", undefined, Infinity, NaN, true, []].map((value) => [`非一位數字${String(value)}`, (f) => { f.series[0].value = value; }]),
  ].map(([name, change]) => [name, altered(change)]);
  // 只交換季度整組，保留組內類別順序；截至日跟錯序後最後一組，
  // 確保由季度順序守衛獨立攔截，而非類別／截至日守衛代勞。
  const backwards = structuredClone(two);
  backwards.series = [...two.series.slice(3), ...two.series.slice(0, 3)];
  backwards.updated_at = "2026-06-30";
  bad.push(["季度倒序", backwards]);
  for (const [name, fields] of bad) check(`公屋資料突變：${name} hard fail`, rejects(() => verifyHousingManual(fields)));
  const before = JSON.stringify(example()), untouched = example(); verifyHousingManual(untouched);
  check("驗證不改動人手輸入", JSON.stringify(untouched) === before);

  const temp = await mkdtemp(join(tmpdir(), "hkdm-housing-manual-"));
  try {
    const original = new URL("../src/data/_lib/housing-manual.js", import.meta.url), source = await readFile(original, "utf8");
    for (const [index, [name, from, to]] of [
      ["單位倍率守衛關閉", 'fields.source_value_multiplier !== 1', 'false'],
      ["准許負數", 'point.value < 0', 'false'],
      ["准許多位小數", 'Math.round(point.value * 10) / 10 !== point.value', 'false'],
      ["類別比較失效", 'value === CATEGORIES[index]', 'true'],
      ["季度次序守衛關閉", 'point.period < previous', 'false'],
      ["截至日比較失效", 'fields.updated_at !== quarterEnd(previous)', 'false'],
    ].entries()) {
      if (source.split(from).length !== 2) throw new Error(`公屋守衛突變須精確命中一次：${from}`);
      const path = join(temp, `guard-${index}.mjs`); await writeFile(path, source.replace(from, to));
      const { verifyHousingManual: mutant } = await import(pathToFileURL(path));
      check(`正式guard源碼突變：${name}被案例捉到`, good.some((f) => failure(() => mutant(f))) || bad.some(([, f]) => !rejects(() => mutant(f))));
    }
    const actual = JSON.parse(await readFile(new URL("../manual/phr_waiting_time.json", import.meta.url), "utf8"));
    const doc = await loadManualIndicator("phr_waiting_time");
    check("正式loader保留人手三類原值而非相加或換月", JSON.stringify(doc.series) === JSON.stringify(actual.series));
    check("實際快照資料已填而數據截至日與抄數日分開", doc.manual_status === "filled" && doc.manual_filled === `${actual.series.length}/${actual.series.length}` && doc.updated_at === actual.updated_at && doc.fetched_at.slice(0, 10) === actual.transcribed_at && doc.updated_at !== actual.transcribed_at);
    if (new Set(actual.series.map((p) => p.period)).size === 1) check("只有一個已核對季度用bar，唔畫空歷史線", doc.chart.type === "bar");
    const manualOriginal = new URL("../src/data/_lib/manual.js", import.meta.url), manualSource = await readFile(manualOriginal, "utf8"), hook = "verifyHousingManual(fields);";
    if (manualSource.split(hook).length !== 2) throw new Error("公屋loader hook突變須精確命中一次");
    const bypass = manualSource.replace(hook, "/* mutation: bypass housing guard */").replace(/(\bfrom\s+["'])(\.[^"']+)(["'])/g, (_, prefix, specifier, suffix) => `${prefix}${new URL(specifier, manualOriginal).href}${suffix}`);
    const bypassPath = join(temp, "manual-bypass.mjs"); await writeFile(bypassPath, bypass);
    const changed = structuredClone(actual); changed.updated_at = actual.transcribed_at; await writeFile(join(temp, "phr_waiting_time.json"), JSON.stringify(changed));
    let realError; try { await loadManualIndicator("phr_waiting_time", { manualDir: temp }); } catch (error) { realError = error; }
    check("正式loader抄數日冒充截至日即hard fail", realError instanceof Error && !(realError instanceof UpstreamError));
    const bypassLoader = await import(pathToFileURL(bypassPath));
    let bypassError; try { await bypassLoader.loadManualIndicator("phr_waiting_time", { manualDir: temp }); } catch (error) { bypassError = error; }
    check("刪正式loader守衛hook被錯日期案例捉到", !bypassError);
  } finally { await rm(temp, { recursive: true, force: true }); }
}
