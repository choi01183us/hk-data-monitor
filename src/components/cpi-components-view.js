// 只讀本地數列嘅教學換算；分類身份亦由 loader 共用。
import { formatPeriodEn } from "./format.js";
import { formatNumber, formatPeriodZh, bilingualAnchor } from "./anchor.js";

export const CPI_COMPONENT_CATEGORIES = [
  { code: "S1", label_zh: "食品", label_en: "Food" },
  { code: "S2", label_zh: "住屋", label_en: "Housing" },
  { code: "S3", label_zh: "電力、燃氣及水", label_en: "Electricity, gas and water" },
  { code: "S4", label_zh: "煙酒", label_en: "Alcoholic drinks and tobacco" },
  { code: "S5", label_zh: "衣履", label_en: "Clothing and footwear" },
  { code: "S6", label_zh: "耐用物品", label_en: "Durable goods" },
  { code: "S7", label_zh: "雜項物品", label_en: "Miscellaneous goods" },
  { code: "S8", label_zh: "交通", label_en: "Transport" },
  { code: "S9", label_zh: "雜項服務", label_en: "Miscellaneous services" },
];
export function cpiBasketCost(rate) {
  return Number.isFinite(rate) && rate >= -100 ? 100 * (1 + rate / 100) : null;
}

export function cpiComponentAnchors(series, period = [...new Set(series.map((point) => point.period))].sort().at(-1), category = "食品") {
  const selected = series.filter((point) => point.period === period && point.category === category);
  if (selected.length !== 1) return [];
  const point = selected[0];
  const cost = cpiBasketCost(point.value);
  if (cost === null) return [];
  const categoryEn = CPI_COMPONENT_CATEGORIES.find((entry) => entry.label_zh === category)?.label_en;
  if (!categoryEn) throw new Error("CPI category has no authored English label");
  return [bilingualAnchor({
    id: "same-basket-hundred",
    text_en: `The same basket of ${categoryEn.toLowerCase()}, costing HK$100 a year earlier, would cost HK$${formatNumber(cost, {digits: 2})} at this month\u2019s published rate of change`,
    basis_en: `${formatPeriodEn(period)}: year-on-year change in ${categoryEn.toLowerCase()} ${formatNumber(point.value, {digits: 1})}%; 100 × (1 + ${point.value} ÷ 100). This fixed-basket example is not any household\u2019s actual bill.`,
    text_zh: `同一籃${category}，一年前 100 元，按本月公布升跌率相當於 ${formatNumber(cost, { digits: 2 })} 元`,
    basis_zh: `${formatPeriodZh(period)}${category}按年變動 ${formatNumber(point.value, { digits: 1 })}%：100 × (1 + ${point.value} ÷ 100)。固定一籃嘅示例，唔係任何家庭嘅實際賬單。`,
  })];
}

