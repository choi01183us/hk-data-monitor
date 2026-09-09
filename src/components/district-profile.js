import {html, svg} from "npm:htl";
import {t} from "./locale.js";
import {label as displayLabel, indicatorText} from "./display-text.js";
import {districtHistory, districtHistoryChart} from "./district-history.js";
import {exactNumber, createCitation} from "./citation.js";
import {formatNumber, formatPeriodZh, formatDateZh} from "./format.js";

const number = (value, unit = "") => value === null ? t("未提供", "Not available") : `${exactNumber(value)}${unit ? ` ${unit}` : ""}`;
const signed = (value, unit) => value === null ? t("未能計算", "Cannot calculate") : `${value > 0 ? "+" : ""}${number(value, unit)}`;
const percentage = (value) => value === null ? t("未能計算", "Cannot calculate") : `${value > 0 ? "+" : ""}${formatNumber(value, {digits: 1})}%`;

/** 純本頁概況；列印範圍及控制由外層處理，元件唔開新視窗或儲存資料。 */
export function districtProfile(options) {
  const model = districtHistory(options);
  const {population, income} = options;
  const sources = [{key: "population", doc: population, label: t("陸上非住院人口", "Land-based non-institutional population"), unit: t("人", "people")}, {key: "income", doc: income, label: t("住戶每月入息中位數", "Median monthly household income"), unit: t("港元／月", "HK$ per month")}];
  const areas = [{key: "selected", label: model.selected.label}, {key: "comparison", label: model.comparison.label}];
  function citations(source, area) {
    const change = model.changes[area.key][source.key];
    const points = [...new Set([model.fromPeriod, model.period])].map((period) => {
      const row = model.rows.find((row) => row.period === period);
      return row[area.key][source.key] === null ? html`<p>${t(`${displayLabel(area.label)} ${period} 年未提供數字，未能引用。`, `No figure is available for ${displayLabel(area.label)} in ${period}, so it cannot be cited.`)}</p>` : html`<pre class="district-profile-citation">${createCitation(source.doc, {kind: "point", category: area.label, period})}</pre>`;
    });
    return html`<div>${points}<p class="district-profile-formula">${displayLabel(area.label)}：${change.delta === null ? t("缺少其中一期原值，未能計算變化。", "An original value is missing for one of the years, so the change cannot be calculated.") : `${formatPeriodZh(model.period)} ${number(change.to)} − ${formatPeriodZh(model.fromPeriod)} ${number(change.from)} = ${signed(change.delta, source.unit)}；${change.percent === null ? t("基準為零，百分比未能計算。", "The baseline is zero, so a percentage change cannot be calculated.") : t(`變動 = (${exactNumber(change.to)} − ${exactNumber(change.from)}) ÷ ${exactNumber(change.from)} × 100 = ${percentage(change.percent)}（百分比四捨五入至一位小數）。`, `Change = (${exactNumber(change.to)} − ${exactNumber(change.from)}) ÷ ${exactNumber(change.from)} × 100 = ${percentage(change.percent)} (percentage rounded to one decimal place).`)}`}</p></div>`;
  }
  function chart(source) {
    const plot = districtHistoryChart(model.rows, source.key);
    const description = t(`${source.label}；${model.rows[0].period} 至 ${formatPeriodZh(model.period)}；單位 ${source.unit}。實線 ${displayLabel(model.selected.label)}，虛線 ${displayLabel(model.comparison.label)}。零起點，缺值或缺年斷線；完整數字見下面資料表。`, `${source.label}; ${model.rows[0].period} to ${model.period}; unit: ${source.unit}. Solid line: ${displayLabel(model.selected.label)}; dashed line: ${displayLabel(model.comparison.label)}. The scale starts at zero. Lines break for missing years or values; full figures are in the table below.`);
    return html`<figure class="district-history-chart"><figcaption><strong>${source.label}</strong><span>${source.unit} · ${t("零起點", "Zero baseline")}</span></figcaption>${svg`<svg viewBox="0 0 560 195" role="img" aria-label=${description}><title>${description}</title>
      <line x1="70" y1="155" x2="540" y2="155" stroke="currentColor" opacity="0.4"></line>
      <line x1="70" y1="25" x2="540" y2="25" stroke="currentColor" opacity="0.2"></line>
      <text x="62" y="159" text-anchor="end" fill="currentColor" font-size="12">0</text>
      ${plot.maximum > 0 ? svg`<text x="70" y="18" text-anchor="start" fill="currentColor" font-size="12">${formatNumber(plot.maximum, {digits: 0})}</text>` : null}
      ${plot.ticks.map((tick, i) => (plot.ticks.length <= 5 || i === 0 || i === plot.ticks.length - 1 || i % 2 === 0) ? svg`<text x=${tick.x} y="180" text-anchor=${i === 0 ? "start" : i === plot.ticks.length - 1 ? "end" : "middle"} fill="currentColor" font-size="12">${tick.period}</text>` : null)}
      ${plot.lines.map((line) => svg`<g class=${`district-history-line district-history-line--${line.key}`} fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray=${line.key === "comparison" ? "7 4" : null}>
        ${line.segments.map((segment) => svg`<g>${segment.length > 1 ? svg`<polyline points=${segment.map((point) => `${point.x},${point.y}`).join(" ")}></polyline>` : null}${segment.map((point) => svg`<circle cx=${point.x} cy=${point.y} r="3" fill="currentColor" stroke="none"><title>${displayLabel(areas.find((area) => area.key === line.key).label)} · ${formatPeriodZh(point.period)}：${number(point.value, source.unit)}</title></circle>`)}</g>`)}
      </g>`)}
    </svg>`}<p class="district-history-legend"><span>━━ ${displayLabel(model.selected.label)}</span><span>┄┄ ${displayLabel(model.comparison.label)}</span></p></figure>`;
  }
  return html`<section class="district-profile district-report" aria-label=${t(`${displayLabel(model.selected.label)}地區概況報告`, `${displayLabel(model.selected.label)} district profile`)}>
    <header class="district-profile-heading"><div><span class="monitor-kicker">${t("地區概況報告", "District profile")}</span><h3>${displayLabel(model.selected.label)} · ${formatPeriodZh(model.period)}</h3></div><p>${t("對照：", "Comparison: ")}${displayLabel(model.comparison.label)} · ${t("變化基準：", "Baseline year: ")}${formatPeriodZh(model.fromPeriod)}</p></header>
    <div class="district-profile-current">${areas.map((area) => html`<article><h4>${displayLabel(area.label)}${area.key === "selected" ? t("（所選）", " (selected)") : t("（對照）", " (comparison)")}</h4><dl>${sources.map((source) => html`<div><dt>${source.label}</dt><dd>${number(model.latest[area.key][source.key], source.unit)}</dd></div>`)}<div><dt>${t("佔同年度全港陸上非住院人口", "Share of Hong Kong's land-based non-institutional population in the same year")}</dt><dd>${model.latest[area.key].share === null ? t("未能計算", "Cannot calculate") : `${formatNumber(model.latest[area.key].share, {digits: 2})}%`}</dd></div></dl></article>`)}</div>
    <p class="district-profile-note">${t("人口比例＝該地區人數 ÷ 同表同年度全港人數 × 100；全港分母：", "Population share = district population ÷ Hong Kong population from the same table and year × 100. Hong Kong denominator: ")}${number(model.latest.nationalPopulation, t("人", "people"))}${t("。此比例唔係人口密度，亦唔係政府分區開支。全港住戶入息中位數直接用官方數字，唔係各區平均；入息未扣通脹，唔代表個人月薪或財富。", ". This share is neither population density nor government spending by district. Hong Kong median household income uses the official figure, not an average of district medians. Income is not adjusted for inflation and does not measure individual monthly pay or wealth.")}</p>
    <details class="district-profile-history"><summary>${t("睇歷年走勢、變化及原始數字", "Explore trends, changes and original figures")}</summary>
      <p>${model.fromPeriod} → ${formatPeriodZh(model.period)}${model.fromPeriod === model.period ? t("：同一年度，未有跨年變化。", ": the same year is selected, so there is no change between years. ") : t("：期末值減基準值；百分比以基準值為分母。", ": end value minus baseline value; percentage change uses the baseline as its denominator. ")}${t("缺值唔補零；基準值為零時，百分比未能計算。", "Missing values are not replaced with zero. Percentage change cannot be calculated when the baseline is zero.")}</p>
      <div class="district-profile-table-wrap"><table class="district-change-table"><caption>${t("所選期間變化（入息為名義變化）", "Change over the selected period (income changes are nominal)")}</caption><thead><tr><th scope="col">${t("地區／量度", "Area / measure")}</th><th scope="col">${formatPeriodZh(model.fromPeriod)}</th><th scope="col">${formatPeriodZh(model.period)}</th><th scope="col">${t("增減", "Difference")}</th><th scope="col">${t("變動", "Change")}</th></tr></thead><tbody>${areas.flatMap((area) => sources.map((source) => {const change = model.changes[area.key][source.key]; return html`<tr><th scope="row">${displayLabel(area.label)} · ${source.label}（${source.unit}）</th><td>${number(change.from)}</td><td>${number(change.to)}</td><td>${signed(change.delta)}</td><td>${percentage(change.percent)}</td></tr>`;}))}</tbody></table></div>
      <div class="district-history-charts">${sources.map(chart)}</div>
      <p class="district-profile-note">${t("每幅圖只畫一種量度；兩地區共用該幅圖嘅刻度，人口與入息分開畫。只顯示截至所選年度嘅共同年度；未收錄年份同缺值會斷線，唔作插值。", "Each chart shows one measure, with the same scale for both areas. Population and income are plotted separately. Only common years up to the selected year are shown. Lines break for missing years or values; no interpolation is used.")}</p>
      <div class="district-profile-table-wrap"><table class="district-history-table"><caption>${t(`原始資料表：${model.rows[0].period}–${formatPeriodZh(model.period)}（缺值＝未提供）`, `Original figures: ${model.rows[0].period}–${model.period} (missing = not available)`)}</caption><thead><tr><th scope="col">${t("年度", "Year")}</th><th scope="col">${t("地區", "Area")}</th><th scope="col">${t("人口（人）", "Population (people)")}</th><th scope="col">${t("住戶月入中位數（港元）", "Median monthly household income (HK$)")}</th></tr></thead><tbody>${model.rows.flatMap((row) => areas.map((area) => html`<tr><th scope="row">${row.period}</th><td>${displayLabel(area.label)}</td><td>${number(row[area.key].population)}</td><td>${number(row[area.key].income)}</td></tr>`))}</tbody></table></div>
    </details>
    <details class="district-profile-citations"><summary>${t("來源、口徑及可選取引用", "Sources, definitions and selectable citations")}</summary>${sources.map((source) => html`<section><h4>${source.label}</h4><p>${indicatorText(source.doc, "basis_zh")}</p><p><a href=${source.doc.source_url} target="_blank" rel="noopener noreferrer">${indicatorText(source.doc, "source_zh")}</a> · ${t("數據截至", "Data as at")} ${formatDateZh(source.doc.updated_at)} · ${t("資料版本", "Data version")} ${source.doc.data_version} · <a href=${source.doc.licence_url} target="_blank" rel="noopener noreferrer">${t("使用條款", "Terms of use")}</a></p>${areas.map((area) => citations(source, area))}</section>`)}</details>
    <footer class="district-profile-sources">${sources.map(({doc, label}) => html`<p>${label}：<a href=${doc.source_url} target="_blank" rel="noopener noreferrer">${indicatorText(doc, "source_zh")}</a> · ${t("數據截至", "Data as at")} ${formatDateZh(doc.updated_at)} · ${t("版本", "Version")} ${doc.data_version}</p>`)}</footer>
  </section>`;
}
