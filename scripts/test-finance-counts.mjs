import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import * as counts from "../src/components/finance-counts.js";

export async function testFinanceCounts(check) {
  console.log("\n[金融機構讀數] 同期分類、整數及原始來源總數自證");
  const bank = {
    indicator_id: "banking_institutions", frequency: "monthly", unit_zh: "間",
    series: [
      {period: "2026-01", category: "接受存款公司", value: 3},
      {period: "2026-01", category: "持牌銀行", value: 1},
      {period: "2026-01", category: "有限制牌照銀行", value: 2},
      {period: "2026-02", category: "持牌銀行", value: 10},
      {period: "2026-02", category: "有限制牌照銀行", value: 20},
      {period: "2026-02", category: "接受存款公司", value: 30},
    ],
    totals: [{period: "2026-01", value: 6}, {period: "2026-02", value: 60}],
    latest: {period: "2026-02", value: 999}, anchors: [{id: "total", text_zh: "錯誤文字 999 間"}],
  };
  const listed = {
    indicator_id: "hkex_listings", frequency: "annual", unit_zh: "間",
    series: [
      {period: "2024", category: "GEM", value: 2},
      {period: "2024", category: "主板", value: 40},
      {period: "2025", category: "主板", value: 50},
      {period: "2025", category: "GEM", value: 3},
    ],
    latest: {period: "2025", value: 999}, anchors: [{id: "total", text_zh: "錯誤文字 999 間"}],
  };
  const edit = (doc, change) => {const copy = structuredClone(doc); change(copy); return copy;};
  const throws = (fn) => {try {fn(); return false;} catch {return true;}};
  const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
  const use = (module, doc, period = "2025") => module.financeCounts(doc, period);
  const fails = (module, doc, period = "2025") => throws(() => use(module, doc, period));
  const bankExpected = {period: "2026-01", rows: [{category: "持牌銀行", value: 1}, {category: "有限制牌照銀行", value: 2}, {category: "接受存款公司", value: 3}], total: 6};
  const listedExpected = {period: "2024", rows: [{category: "主板", value: 40}, {category: "GEM", value: 2}], total: 42};
  const selectedCorrect = (module) => same(use(module, bank, "2026-01"), bankExpected) && same(use(module, listed, "2024"), listedExpected);
  const knownAnswers = [
    ["銀行 1 + 2 + 3 = 6", bank, "2026-01", 6],
    ["上市公司 40 + 2 = 42", listed, "2024", 42],
    ["零數目仍然係 0", edit(listed, (doc) => doc.series.forEach((row) => row.value = 0)), "2025", 0],
    ["安全整數邊界仍可相加", edit(listed, (doc) => {doc.series[2].value = Number.MAX_SAFE_INTEGER - 1; doc.series[3].value = 1;}), "2025", Number.MAX_SAFE_INTEGER],
  ];
  const additionCorrect = (module) => knownAnswers.every(([, doc, period, total]) => use(module, doc, period).total === total);
  for (const [label, doc, period, total] of knownAnswers) check(`已知答案：${label}`, use(counts, doc, period).total === total);
  check("按指定期數及固定分類次序對位，唔借最新期或 anchors", selectedCorrect(counts));
  check("倒序數列仍對同一期分類", same(use(counts, edit(bank, (doc) => doc.series.reverse()), "2026-01"), bankExpected));
  const missing = edit(bank, (doc) => doc.series[4].value = null);
  const nullCorrect = (module) => same(use(module, missing, "2026-02"), {period: "2026-02", rows: [{category: "持牌銀行", value: 10}, {category: "有限制牌照銀行", value: null}, {category: "接受存款公司", value: 30}], total: null}) && use(module, edit(listed, (doc) => doc.series[3].value = null)).total === null;
  check("任一分類缺數，派生總數 null；來源總數仍有值亦唔填補", nullCorrect(counts));
  const sourceNullCorrect = (module) => use(module, edit(bank, (doc) => doc.totals[1].value = null), "2026-02").total === 60;
  check("來源總數缺數但分類齊全，可計派生總和", sourceNullCorrect(counts));
  check("全部分類 null，唔補零", use(counts, edit(bank, (doc) => doc.series.slice(3).forEach((row) => row.value = null)), "2026-02").total === null);
  const idsCorrect = (module) => ["money_supply", "govt_expenditure", "public_expenditure_policy_groups", "other", "toString"].every((indicator_id) => fails(module, {...listed, indicator_id}));
  const unitCorrect = (module) => fails(module, {...listed, unit_zh: "人"});
  const frequencyCorrect = (module) => fails(module, {...listed, frequency: "monthly"}) && fails(module, {...bank, frequency: "annual"}, "2026-01");
  const categoriesCorrect = (module) => fails(module, edit(listed, (doc) => doc.series[0].category = "M3"));
  const periodCorrect = (module) => fails(module, edit(listed, (doc) => doc.series.slice(0, 2).forEach((row) => row.period = "2024-01")));
  const duplicateCorrect = (module) => fails(module, edit(listed, (doc) => doc.series.push({...doc.series[0]})));
  const incompleteCorrect = (module) => fails(module, edit(listed, (doc) => doc.series.splice(0, 1)));
  const numberCorrect = (module) => [-1, 1.5, NaN, Infinity, -Infinity, undefined, "2", true, {}, Number.MAX_SAFE_INTEGER + 1].every((value) => fails(module, edit(listed, (doc) => doc.series[0].value = value)));
  const mixedCorrect = (module) => fails(module, [bank, listed]) && fails(module, edit(listed, (doc) => doc.series.push(...bank.series))) && fails(module, edit(listed, (doc) => doc.series[0].indicator_id = "money_supply"));
  const noSourceTotals = edit(bank, (doc) => delete doc.totals);
  const sourceRequired = (module) => fails(module, noSourceTotals, "2026-01");
  const sourceMismatch = (module) => fails(module, edit(bank, (doc) => doc.totals[0].value = 7), "2026-02");
  const sourceDuplicate = (module) => fails(module, edit(bank, (doc) => doc.totals.push({...doc.totals[0]})), "2026-01");
  const sourceMissing = (module) => fails(module, edit(missing, (doc) => doc.totals.splice(1, 1)), "2026-02");
  const sourceExtra = (module) => fails(module, edit(bank, (doc) => doc.totals.push({period: "2026-03", value: 10})), "2026-01");
  const sourceNumber = (module) => [-1, 1.5, NaN, Infinity, undefined, "60", true, {}, Number.MAX_SAFE_INTEGER + 1].every((value) => fails(module, edit(missing, (doc) => doc.totals[1].value = value), "2026-02"));
  const listedTotalsForbidden = (module) => fails(module, {...listed, totals: [{period: "2025", value: 53}]});
  const overflowCorrect = (module) => fails(module, edit(listed, (doc) => {doc.series[2].value = Number.MAX_SAFE_INTEGER; doc.series[3].value = 1;}));
  const unknownPeriod = (module) => fails(module, listed, "2023");
  for (const [label, oracle] of [
    ["M1／M2／M3、財政開支及未知 id 硬失敗", idsCorrect], ["錯單位硬失敗", unitCorrect], ["錯頻率硬失敗", frequencyCorrect],
    ["其他期間未知分類亦硬失敗", categoriesCorrect], ["來源年/月格式不符硬失敗", periodCorrect], ["重複分類硬失敗", duplicateCorrect],
    ["其他期間缺分類亦硬失敗", incompleteCorrect], ["非安全整數、負數及錯類型硬失敗", numberCorrect], ["混合指標硬失敗", mixedCorrect],
    ["銀行必須提供原始來源總數", sourceRequired], ["銀行來源總數與完整同月分類不符硬失敗", sourceMismatch], ["銀行來源總數重複硬失敗", sourceDuplicate],
    ["銀行來源總數缺少月份硬失敗", sourceMissing], ["銀行來源總數多出不明月份硬失敗", sourceExtra], ["銀行來源總數錯數值硬失敗", sourceNumber],
    ["上市公司唔接受外來總額", listedTotalsForbidden], ["總和超過安全整數硬失敗", overflowCorrect], ["未知所選期間唔借其他期", unknownPeriod],
  ]) check(label, oracle(counts));
  check("無效資料容器及列硬失敗", [null, undefined, {}, {...listed, series: null}, {...listed, series: []}, {...listed, series: [null]}].every((doc) => fails(counts, doc)));
  check("銀行無效月份及所選期間格式硬失敗", ["2026-00", "2026-13", "2026-Q1", 2026, null].every((period) => fails(counts, bank, period)));
  check("來源總數無效容器或列硬失敗", [null, [], {}, [null], [{period: "2026-13", value: 6}]].every((totals) => fails(counts, {...bank, totals}, "2026-01")));
  check("總數唔會成為第四個銀行分類", fails(counts, edit(bank, (doc) => doc.series.push({period: "2026-01", category: "總計", value: 6})), "2026-01"));
  const freeze = (obj) => {for (const value of Object.values(obj)) if (value && typeof value === "object") freeze(value); return Object.freeze(obj);};
  const frozen = freeze(structuredClone(bank)), before = JSON.stringify(frozen);
  const copy = use(counts, frozen, "2026-01"); copy.rows[0].value = 999;
  check("派生物件唔修改原始資料，rows 亦唔共用原物件", JSON.stringify(frozen) === before && use(counts, frozen, "2026-01").rows[0].value === 1);

  const source = await readFile(new URL("../src/components/finance-counts.js", import.meta.url), "utf8");
  const dir = await mkdtemp(join(tmpdir(), "hkdm-finance-counts-")); let seq = 0;
  async function mutate(replacements) {
    let changed = source;
    for (const [from, to] of replacements) {
      if (changed.split(from).length !== 2) throw new Error(`源碼突變必須精確命中一次：${from}`);
      changed = changed.replace(from, to);
    }
    const file = join(dir, `mutation-${seq++}.mjs`);
    await writeFile(file, changed);
    return import(pathToFileURL(file).href);
  }
  const detects = (oracle, module) => {try {return !oracle(module);} catch {return true;}};
  try {
    for (const [label, replacements, oracle] of [
      ["總和多加一", [["return total;", "return total + 1;"]], additionCorrect],
      ["缺數填零", [["if (rows.some((row) => row.value === null)) return null;", "if (false) return null;"]], nullCorrect],
      ["借用第一期分類", [["const selected = periods.get(period);", "const selected = periods.values().next().value;"]], nullCorrect],
      ["GEM 誤取主板", [["value: selected.get(category)", 'value: selected.get(category === "GEM" ? "主板" : category)']], selectedCorrect],
      ["採信 latest", [["total: sumCounts(rows)", "total: indicator.latest.value"]], selectedCorrect],
      ["接受任意 id", [["!Object.hasOwn(DEFINITIONS, indicator.indicator_id)", "false"], ["const definition = DEFINITIONS[indicator.indicator_id];", "const definition = DEFINITIONS.hkex_listings;"]], idsCorrect],
      ["接受錯單位", [['indicator.unit_zh !== "間"', "false"]], unitCorrect],
      ["接受錯頻率", [["indicator.frequency !== definition.frequency", "false"]], frequencyCorrect],
      ["接受不明分類", [["!definition.categories.includes(row.category)", "false"]], categoriesCorrect],
      ["接受其他期錯格式", [["!definition.period.test(row.period) || !definition.categories.includes", "false || !definition.categories.includes"]], periodCorrect],
      ["接受重複分類", [["categories.has(row.category)", "false"]], duplicateCorrect],
      ["接受缺分類", [["categories.size !== definition.categories.length", "false"]], incompleteCorrect],
      ["接受錯數值", [["if (!validCount(row.value))", "if (false)"]], numberCorrect],
      ["接受混入其他 id", [['"indicator_id" in row && row.indicator_id !== indicator.indicator_id', "false"]], mixedCorrect],
      ["銀行跳過來源總數", [['if (indicator.indicator_id === "banking_institutions") {', "if (false) {"]], sourceRequired],
      ["來源總數對唔上都放行", [["expected !== null && sourceTotal !== null && sourceTotal !== expected", "false"]], sourceMismatch],
      ["分類 null 借來源總數", [["total: sumCounts(rows)", 'total: sumCounts(rows) ?? indicator.totals.find((row) => row.period === period).value']], nullCorrect],
      ["來源總數 null 錯當不一致", [["expected !== null && sourceTotal !== null && sourceTotal !== expected", "expected !== null && sourceTotal !== expected"]], sourceNullCorrect],
      ["接受重複來源總數", [["sourceTotals.has(row.period)", "false"]], sourceDuplicate],
      ["接受來源缺月份", [["if (!sourceTotals.has(rowPeriod))", "if (false)"]], sourceMissing],
      ["接受來源多月份", [["!periods.has(row.period) || !validCount(row.value)", "false || !validCount(row.value)"]], sourceExtra],
      ["接受來源總數錯值", [["|| !validCount(row.value))", "|| false)"]], sourceNumber],
      ["上市公司接受外來總額", [['indicator.indicator_id === "hkex_listings" && "totals" in indicator', "false"]], listedTotalsForbidden],
      ["總和溢出放行", [["if (!Number.isSafeInteger(total))", "if (false)"]], overflowCorrect],
      ["未知期借第一期", [["if (typeof period !== \"string\" || !definition.period.test(period) || !periods.has(period)) throw new Error(\"機構數目冇呢個期間\");", "if (!periods.has(period)) period = periods.keys().next().value;"]], unknownPeriod],
    ]) check(`源碼突變：${label}會被捉到`, detects(oracle, await mutate(replacements)));
  } finally {await rm(dir, {recursive: true, force: true});}
}
