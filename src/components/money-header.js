import {t} from "./locale.js";
import { html } from "npm:htl";
import { formatNumber, formatPeriodZh } from "./format.js";
import { moneyQuarterRows } from "./money-view.js";

// 三張卡永遠讀同一季；null 顯示破折號，原始港元資料留在下方表格及引用。
export function moneyHeader(indicator, period) {
  const rows = moneyQuarterRows(indicator, period);
  return html`<div class="money-headline">
    ${rows.map((row) => html`<article><span class="money-code">${row.category}</span>
      <p><strong>${formatNumber(row.display_value, { digits: 2 })}</strong><span>${t("萬億港元", "HK$ trillion")}</span></p>
      <small>${formatPeriodZh(period)} · ${t("期末", "End of period")}</small>
    </article>`)}
  </div>`;
}
