// 圖表換算只影響顯示；引用、下載同資料表仍用原始港元。
import {formatNumber, formatPeriodZh} from "./format.js";

const HKD_PER_TRILLION = 1e12;
const MONEY_CATEGORIES = ["M1", "M2", "M3"];

function validateMoney(indicator) {
  if (!indicator || indicator.indicator_id !== "money_supply" || indicator.unit_zh !== "港元" || indicator.frequency !== "quarterly") throw new Error("貨幣供應量來源、單位或頻率不符");
  if ("totals" in indicator) throw new Error("M1、M2、M3 互相包含，唔可以有相加總額");
  if (!Array.isArray(indicator.series) || indicator.series.length === 0) throw new Error("貨幣供應量冇數列");
  const quarters = new Map();
  for (const row of indicator.series) {
    if (!row || typeof row.period !== "string" || !/^\d{4}-Q[1-4]$/.test(row.period) || !MONEY_CATEGORIES.includes(row.category)) throw new Error("貨幣供應量季度或分類無效");
    if (row.value !== null && (!Number.isFinite(row.value) || row.value < 0 || row.value > Number.MAX_SAFE_INTEGER)) throw new Error("貨幣供應量必須係安全範圍內嘅非負有限數或 null");
    const categories = quarters.get(row.period) ?? new Set();
    if (categories.has(row.category)) throw new Error(`貨幣供應量重複：${row.period} ${row.category}`);
    categories.add(row.category);
    quarters.set(row.period, categories);
  }
  for (const [period, categories] of quarters) {
    if (categories.size !== MONEY_CATEGORIES.length) throw new Error(`貨幣供應量分類唔齊：${period}`);
  }
  return quarters;
}

function displayValue(value) {
  return value === null ? null : value / HKD_PER_TRILLION;
}

export function moneyChartView(indicator, category = "全部") {
  validateMoney(indicator);
  if (category !== "全部" && !MONEY_CATEGORIES.includes(category)) throw new Error("未知貨幣供應量分類");
  const categories = category === "全部" ? [...MONEY_CATEGORIES] : [category];
  return {
    ...indicator,
    name_zh: "貨幣供應量",
    unit_zh: "萬億港元",
    unit_en: "HK$ trillion",
    unit_short_zh: "萬億港元",
    value_digits: 2,
    basis_zh: `${indicator.basis_zh ?? ""}；圖表顯示以原始港元 ÷ 1,000,000,000,000 換成萬億港元。`,
    category_order: categories,
    chart: {...indicator.chart, type: "line"},
    series: indicator.series.filter((row) => categories.includes(row.category)).map((row) => ({...row, value: displayValue(row.value)})),
  };
}

export function moneyQuarterRows(indicator, period) {
  const quarters = validateMoney(indicator);
  if (!quarters.has(period)) throw new Error("貨幣供應量冇呢個季度");
  return MONEY_CATEGORIES.map((category) => {
    const row = indicator.series.find((point) => point.period === period && point.category === category);
    return {category, period, value: row.value, display_value: displayValue(row.value)};
  });
}

// 每個分類獨立比較所選季同去年同季；基期不足都明文顯示，唔用另一季頂替。
export function moneyQuarterAnchors(indicator, period) {
  const selectedRows = moneyQuarterRows(indicator, period);
  const previousPeriod = `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
  return selectedRows.map((selected) => {
    const previous = indicator.series.find((entry) => entry.period === previousPeriod && entry.category === selected.category);
    const id = `money-${selected.category.toLowerCase()}-year-on-year`;
    const scope = `${selected.category}：${formatPeriodZh(previousPeriod)} → ${formatPeriodZh(period)}`;
    const reason = selected.value === null ? "所選季度缺數" : !previous ? "缺少去年同季" : previous.value === null ? "去年同季缺數" : previous.value === 0 ? "去年同季為零，百分比無法計算" : null;
    if (reason) return {id, text_zh: `${selected.category}：未能比較去年同季（${reason}）`, basis_zh: `${scope}。${reason}；唔以其他季度代替。`};
    const difference = selected.value - previous.value;
    const percent = difference / previous.value * 100;
    if (!Number.isFinite(percent)) throw new Error("貨幣供應量按年變化超出可計算範圍");
    const direction = difference > 0 ? "增加" : difference < 0 ? "減少" : "相差";
    const percentText = `${percent > 0 ? "+" : percent < 0 ? "−" : ""}${formatNumber(Math.abs(percent), {digits: 2})}%`;
    return {
      id,
      text_zh: `${selected.category} 比去年同季${direction} ${formatNumber(Math.abs(difference / HKD_PER_TRILLION), {digits: 2})} 萬億港元（${percentText}）`,
      basis_zh: `${scope}。差額：（${selected.value} − ${previous.value}）港元 ÷ 1,000,000,000,000；按年變化：（${selected.value} − ${previous.value}）÷ ${previous.value} × 100%。顯示數字四捨五入至小數後兩位。`,
    };
  });
}
