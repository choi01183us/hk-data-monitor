import { html } from "npm:htl";
import { formatNumber, formatPeriodZh, formatDateZh } from "./format.js";
import { financeCounts } from "./finance-counts.js";

export function financeCountPanel(indicator, period) {
  const counts = financeCounts(indicator, period);
  const bank = indicator.indicator_id === "banking_institutions";
  const headline = bank ? counts.rows[0].value : counts.total;
  return html`<article class="finance-count-panel" data-indicator=${indicator.indicator_id}>
    <span class="monitor-kicker">${bank ? "銀行牌照" : "主板 + GEM"}</span>
    <h3>${bank ? "持牌銀行" : "上市公司合計"}</h3>
    <p class="finance-count-number"><strong>${formatNumber(headline)}</strong><span>間</span></p>
    <p class="finance-count-period">${formatPeriodZh(period)}${bank ? "底" : "末"} · ${bank ? "人手核對快照" : "年度數列"}</p>
    <dl>${counts.rows.map((row) => html`<div><dt>${row.category}</dt><dd>${formatNumber(row.value)} 間</dd></div>`)}</dl>
    <p class="finance-count-equation">${bank ? "認可機構合計" : "同年兩個市場相加"}：${counts.total === null ? "分類未有完整數字，唔計合計" : `${counts.rows.map((row) => formatNumber(row.value)).join(" + ")} = ${formatNumber(counts.total)} 間`}</p>
    <p class="finance-note">${bank ? "認可機構包括上面三類；唔係有咁多間銀行分行，亦唔計本港代表辦事處。" : "係期末仍然上市嘅公司數目，唔係當年新上市或 IPO 宗數。"}</p>
    <a class="finance-count-detail" href=${`../indicators/${indicator.indicator_id}`}>${bank ? "三種牌照、原表及引用" : "歷年分類、原表及引用"} ↗</a>
    <p class="finance-source">來源：<a href=${indicator.source_url} target="_blank" rel="noopener noreferrer">${indicator.source_zh} ↗</a> · ${bank ? "資料截至" : "來源更新"} ${formatDateZh(indicator.updated_at)}${indicator.build?.stale ? " · 更新失敗，顯示舊快照" : ""}</p>
  </article>`;
}
