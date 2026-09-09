// 只讀本地數列嘅教學換算；分類身份亦由 loader 共用。
import { formatNumber, formatPeriodZh } from "./format.js";

export const CPI_COMPONENT_CATEGORIES = [
  { code: "S1", label_zh: "食品" },
  { code: "S2", label_zh: "住屋" },
  { code: "S3", label_zh: "電力、燃氣及水" },
  { code: "S4", label_zh: "煙酒" },
  { code: "S5", label_zh: "衣履" },
  { code: "S6", label_zh: "耐用物品" },
  { code: "S7", label_zh: "雜項物品" },
  { code: "S8", label_zh: "交通" },
  { code: "S9", label_zh: "雜項服務" },
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
  return [{
    id: "same-basket-hundred",
    text_zh: `同一籃${category}，一年前 100 元，按本月公布升跌率相當於 ${formatNumber(cost, { digits: 2 })} 元`,
    basis_zh: `${formatPeriodZh(period)}${category}按年變動 ${formatNumber(point.value, { digits: 1 })}%：100 × (1 + ${point.value} ÷ 100)。固定一籃嘅示例，唔係任何家庭嘅實際賬單。`,
  }];
}

