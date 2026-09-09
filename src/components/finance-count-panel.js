import {t} from "./locale.js";
import {label,indicatorText} from "./display-text.js";
import { html } from "npm:htl";
import { formatNumber, formatPeriodZh, formatDateZh } from "./format.js";
import { financeCounts } from "./finance-counts.js";

export function financeCountPanel(indicator, period) {
  const counts = financeCounts(indicator, period);
  const bank = indicator.indicator_id === "banking_institutions";
  const headline = bank ? counts.rows[0].value : counts.total;
  return html`<article class="finance-count-panel" data-indicator=${indicator.indicator_id}>
    <span class="monitor-kicker">${bank ? t("銀行牌照", "Banking licences") : t("主板 + GEM", "Main Board + GEM")}</span>
    <h3>${bank ? t("持牌銀行", "Licensed banks") : t("上市公司合計", "Total listed companies")}</h3>
    <p class="finance-count-number"><strong>${formatNumber(headline)}</strong><span>${bank ? t("間", "banks") : t("間", "companies")}</span></p>
    <p class="finance-count-period">${formatPeriodZh(period)} · ${t("期末", "End of period")} · ${bank ? t("人手核對快照", "Manually checked snapshot") : t("年度數列", "Annual series")}</p>
    <dl>${counts.rows.map((row) => html`<div><dt>${label(row.category)}</dt><dd>${formatNumber(row.value)} ${indicatorText(indicator,"unit_zh")}</dd></div>`)}</dl>
    <p class="finance-count-equation">${bank ? t("認可機構合計", "Total authorised institutions") : t("同年兩個市場相加", "Both markets in the same year")}：${counts.total === null ? t("分類未有完整數字，唔計合計", "Incomplete categories; no total calculated") : `${counts.rows.map((row) => formatNumber(row.value)).join(" + ")} = ${formatNumber(counts.total)} ${indicatorText(indicator,"unit_zh")}`}</p>
    <p class="finance-note">${bank ? t("認可機構包括上面三類；唔係有咁多間銀行分行，亦唔計本港代表辦事處。", "Authorised institutions comprise the three categories above; these are not branch counts, and local representative offices are excluded.") : t("係期末仍然上市嘅公司數目，唔係當年新上市或 IPO 宗數。", "Companies still listed at period-end, not new listings or IPOs during the year.")}</p>
    <a class="finance-count-detail" href=${`../indicators/${indicator.indicator_id}`}>${bank ? t("三種牌照、原表及引用", "Three licence categories, data and citation") : t("歷年分類、原表及引用", "Historical breakdown, data and citation")} ↗</a>
    <p class="finance-source">${t("來源：", "Source: ")}<a href=${indicator.source_url} target="_blank" rel="noopener noreferrer">${indicatorText(indicator,"source_zh")} ↗</a> · ${bank ? t("資料截至", "Data as of") : t("來源更新", "Source updated")} ${formatDateZh(indicator.updated_at)}${indicator.build?.stale ? t(" · 更新失敗，顯示舊快照", " · Update failed; previous snapshot") : ""}</p>
  </article>`;
}
