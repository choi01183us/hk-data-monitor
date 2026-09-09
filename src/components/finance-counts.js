// 只加同一口徑、同一期嘅互斥機構分類；唔借 latest 或文字錨點補數。
const DEFINITIONS = {
  banking_institutions: {frequency: "monthly", categories: ["持牌銀行", "有限制牌照銀行", "接受存款公司"], period: /^\d{4}-(0[1-9]|1[0-2])$/},
  hkex_listings: {frequency: "annual", categories: ["主板", "GEM"], period: /^\d{4}$/},
};

function validCount(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

function sumCounts(rows) {
  if (rows.some((row) => row.value === null)) return null;
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (!Number.isSafeInteger(total)) throw new Error("機構數目總和超出安全整數範圍");
  return total;
}

export function financeCounts(indicator, period) {
  if (!indicator || Array.isArray(indicator) || !Object.hasOwn(DEFINITIONS, indicator.indicator_id)) throw new Error("機構數目指標來源不符");
  const definition = DEFINITIONS[indicator.indicator_id];
  if (indicator.unit_zh !== "間" || indicator.frequency !== definition.frequency) throw new Error("機構數目單位或頻率不符");
  if (!Array.isArray(indicator.series) || indicator.series.length === 0) throw new Error("機構數目冇數列");
  const periods = new Map();
  for (const row of indicator.series) {
    if (!row || typeof row.period !== "string" || !definition.period.test(row.period) || !definition.categories.includes(row.category)) throw new Error("機構數目期間或分類不符");
    if ("indicator_id" in row && row.indicator_id !== indicator.indicator_id) throw new Error("機構數目混入其他指標");
    if (!validCount(row.value)) throw new Error("機構數目必須係非負安全整數或 null");
    const categories = periods.get(row.period) ?? new Map();
    if (categories.has(row.category)) throw new Error(`機構數目重複：${row.period} ${row.category}`);
    categories.set(row.category, row.value);
    periods.set(row.period, categories);
  }
  for (const [rowPeriod, categories] of periods) {
    if (categories.size !== definition.categories.length) throw new Error(`機構分類唔齊：${rowPeriod}`);
  }
  if (typeof period !== "string" || !definition.period.test(period) || !periods.has(period)) throw new Error("機構數目冇呢個期間");

  // 主板加 GEM 係本站按原始分類計算，唔接受外來總額覆蓋。
  if (indicator.indicator_id === "hkex_listings" && "totals" in indicator) throw new Error("上市公司總數只可由主板及 GEM 同年數字計算");
  if (indicator.indicator_id === "banking_institutions") {
    if (!Array.isArray(indicator.totals) || indicator.totals.length === 0) throw new Error("銀行來源總數格式不符");
    const sourceTotals = new Map();
    for (const row of indicator.totals) {
      if (!row || typeof row.period !== "string" || !definition.period.test(row.period) || !periods.has(row.period) || !validCount(row.value)) throw new Error("銀行來源總數期間或數值不符");
      if (sourceTotals.has(row.period)) throw new Error("銀行來源總數期間重複");
      sourceTotals.set(row.period, row.value);
    }
    for (const [rowPeriod, categories] of periods) {
      const expected = sumCounts([...categories.values()].map((value) => ({value})));
      if (!sourceTotals.has(rowPeriod)) throw new Error(`銀行來源總數缺少同月：${rowPeriod}`);
      const sourceTotal = sourceTotals.get(rowPeriod);
      if (expected !== null && sourceTotal !== null && sourceTotal !== expected) throw new Error(`銀行來源總數與同月分類不一致：${rowPeriod}`);
    }
  }
  const selected = periods.get(period);
  const rows = definition.categories.map((category) => ({category, value: selected.get(category)}));
  return {period, rows, total: sumCounts(rows)};
}
